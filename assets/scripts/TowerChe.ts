import {
    _decorator,
    Component,
    gfx,
    Node,
    Sprite,
    SpriteFrame,
    UIOpacity,
    UITransform,
    Vec3,
    resources,
} from 'cc';
import { HitPause } from './HitPause';

const { ccclass, property } = _decorator;

/** 一道正在飞出去的墨光刃。 */
interface Blade {
    node: Node;
    dir: Vec3;
    speed: number;
    traveled: number;
    maxRange: number;
}

/** 一次"抬手聚墨"的前摇，结束后才甩出光刃。 */
interface Windup {
    timer: number;
    origin: Vec3;
    dirs: Vec3[];
    node: Node | null;
    opacity: UIOpacity | null;
}

/**
 * 车（象棋「车」）的攻击：**墨色直线光刃横扫**。
 *
 * 一次攻击分两拍（打击反馈更清楚）：
 *  1. **抬手聚墨**（`windupTime`，默认 0.1s）：在车上叠一张 `che_attack1` 墨团，
 *     一边放大一边淡入再淡出 —— 玩家能看见"车要动手了"的前摇；
 *  2. **甩出光刃**：沿**横竖 4 个正方向**各飞出一道 `che_attack2` 长条墨刃。
 *
 * 三条设计约束（都是用户明确的规则）：
 *  - **方向强制锁定横竖**（象棋车只能走直线），不取路径切线，杜绝斜向发射；
 *  - **射线只判一次**：发射的那一瞬间对整条线做一次"点到线段距离"判定，
 *    **不是 update 逐帧检测**。一次判定天然不会重复伤害同一个敌人，
 *    所以不需要 hitSet 去重（那是逐帧检测才要的东西）；
 *  - **可穿透**：一道光刃打穿整条线上的所有敌人，不减速、不消失。
 *
 * 视觉用**正片叠底**（`DST_COLOR + ONE_MINUS_SRC_ALPHA`）：墨色叠在宣纸上越叠越浓。
 * 两张素材的透明区都是**纯黑 rgb(0,0,0)**，配合这个组合式后
 * `src.rgb×dst.rgb + dst.rgb×(1-src.a)`：不透明处 = 墨×纸（变浓），
 * 透明处（src.rgb=0, src.a=0）= 原样保留背景 —— **不会糊成黑底**。
 * 换成普通混合只是"墨色原样显示"，两者都不会出黑块，所以有 `multiplyBlend` 开关。
 *
 * 命中时给敌人一个 **HitPause**（受击暂停），让打击"顿"一下。
 * 光刃与聚墨节点都走**对象池**，同屏大量特效不会实例爆炸。
 */
@ccclass('TowerChe')
export class TowerChe extends Component {
    @property({ tooltip: '开火间隔（秒）' })
    public fireInterval = 1.2;

    @property({ tooltip: '每道光刃命中的伤害' })
    public damage = 1;

    @property({ tooltip: '光刃最大飞行距离（设计单位）' })
    public attackRange = 460;

    @property({ tooltip: '光刃飞行速度（设计单位/秒）—— 要快，体现"一闪横扫"' })
    public projectileSpeed = 420;

    @property({ tooltip: '光刃长度（设计单位）；粗细按贴图自身比例自动算，不会拉变形' })
    public projectileLength = 260;

    @property({ tooltip: '命中判定半径（棋子约 43×43，取 34 左右）' })
    public hitRadius = 34;

    @property({ tooltip: '抬手聚墨的前摇时长（秒）；0 = 立刻甩刃' })
    public windupTime = 0.1;

    @property({ tooltip: '正片叠底（墨色叠加变浓）；关掉则用普通混合（墨色原样显示）' })
    public multiplyBlend = true;

    @property({ type: SpriteFrame, tooltip: '光刃贴图（che_attack2 长条）；留空则按下面的路径加载' })
    public bladeFrame: SpriteFrame | null = null;

    @property({ tooltip: '光刃贴图在 resources 下的路径' })
    public bladeResourcePath = 'textures/attack/che/che_attack2/spriteFrame';

    @property({ type: SpriteFrame, tooltip: '抬手聚墨贴图（che_attack1 墨团）；留空则按下面的路径加载' })
    public windupFrame: SpriteFrame | null = null;

    @property({ tooltip: '抬手聚墨贴图在 resources 下的路径' })
    public windupResourcePath = 'textures/attack/che/che_attack1/spriteFrame';

    @property({ tooltip: '抬手聚墨的尺寸（设计单位）' })
    public windupSize = 150;

    @property({ tooltip: '命中时的受击暂停时长（秒）；0 = 不暂停' })
    public hitPauseTime = 0.12;

    @property({ tooltip: '敌人容器名' })
    public enemyContainerName = 'Enemies';

    @property({ tooltip: '启动后自动开火（放到棋盘上才该打开）' })
    public autoFire = true;

    @property({ tooltip: '开火/命中时打控制台日志' })
    public debugLog = false;

    /** 横竖 4 个正方向 —— 车只能走直线，这里写死，不走路径切线。 */
    private static readonly DIRS: Vec3[] = [
        new Vec3(1, 0, 0),
        new Vec3(-1, 0, 0),
        new Vec3(0, 1, 0),
        new Vec3(0, -1, 0),
    ];

    private timer = 0;
    private blades: Blade[] = [];
    private bladePool: Node[] = [];
    private windups: Windup[] = [];
    private windupPool: Node[] = [];

    protected onLoad(): void {
        this.timer = this.fireInterval * 0.5;
        this.ensureFrames();
    }

    protected update(dt: number): void {
        this.tickBlades(dt);
        this.tickWindups(dt);
        if (!this.autoFire) {
            return;
        }
        this.timer += dt;
        if (this.timer >= this.fireInterval && this.windups.length === 0) {
            this.timer = 0;
            this.fire();
        }
    }

    /**
     * 开一次火：**先抬手聚墨**，前摇结束后甩出 4 道光刃。
     * 返回这次会发射的道数（0 表示没找到敌人容器以外的原因）。
     */
    public fire(): number {
        const origin = this.node.getWorldPosition().clone();
        const dirs = TowerChe.DIRS.map((d) => d.clone());
        this.beginWindup(origin, dirs);
        if (this.debugLog) {
            console.log('[TowerChe] 抬手聚墨，' + dirs.length + ' 道待发');
        }
        return dirs.length;
    }

    /** 当前在飞的光刃数（调试/UI 用）。 */
    public get activeShots(): number {
        return this.blades.length;
    }

    /* ----------------------------- 前摇 ----------------------------- */

    private beginWindup(origin: Vec3, dirs: Vec3[]): void {
        let node: Node | null = null;
        let opacity: UIOpacity | null = null;
        if (this.windupTime > 0) {
            node = this.takeWindupNode();
            if (node) {
                node.setWorldPosition(origin.x, origin.y, 0);
                node.setWorldRotationFromEuler(0, 0, 0);
                node.active = true;
                node.setScale(0.45, 0.45, 1);
                opacity = node.getComponent(UIOpacity);
                if (opacity) {
                    opacity.opacity = 0;
                }
            }
        }
        this.windups.push({ timer: this.windupTime, origin, dirs, node, opacity });
    }

    private tickWindups(dt: number): void {
        for (let i = this.windups.length - 1; i >= 0; i -= 1) {
            const w = this.windups[i];
            w.timer -= dt;
            // 聚墨表现：随前摇推进放大 + 淡入
            if (w.node && w.node.isValid && w.opacity) {
                const total = Math.max(1e-4, this.windupTime);
                const t = Math.min(1, Math.max(0, 1 - w.timer / total));
                const s = 0.45 + 0.55 * t;
                w.node.setScale(s, s, 1);
                w.opacity.opacity = Math.round(255 * Math.min(1, t * 1.6));
            }
            if (w.timer > 0) {
                continue;
            }
            this.windups.splice(i, 1);
            this.recycleWindup(w);
            // 前摇结束 = 真正甩刃：4 道各飞一条 + 一次性射线判定
            for (const dir of w.dirs) {
                this.castBlade(w.origin, dir);
            }
        }
    }

    /* ----------------------------- 光刃 ----------------------------- */

    /** 甩出一道光刃：**先一次性判定整条线**，再让刃飞出去（纯视觉）。 */
    private castBlade(origin: Vec3, dir: Vec3): void {
        const hits = this.raycastOnce(origin, dir);
        const node = this.takeBladeNode();
        if (node) {
            const angle = (Math.atan2(dir.y, dir.x) * 180) / Math.PI;
            node.setWorldPosition(origin.x, origin.y, 0);
            node.setWorldRotationFromEuler(0, 0, angle);
            node.active = true;
            const opacity = node.getComponent(UIOpacity);
            if (opacity) {
                opacity.opacity = 255;
            }
            this.blades.push({
                node,
                dir: dir.clone(),
                speed: this.projectileSpeed,
                traveled: 0,
                maxRange: this.attackRange,
            });
        }
        if (this.debugLog) {
            console.log(`[TowerChe] 光刃 ${dir.x},${dir.y} 命中 ${hits} 个`);
        }
    }

    private tickBlades(dt: number): void {
        for (let i = this.blades.length - 1; i >= 0; i -= 1) {
            const b = this.blades[i];
            if (!b.node || !b.node.isValid) {
                this.blades.splice(i, 1);
                continue;
            }
            const step = b.speed * dt;
            b.traveled += step;
            const cur = b.node.getWorldPosition();
            b.node.setWorldPosition(cur.x + b.dir.x * step, cur.y + b.dir.y * step, 0);
            if (b.traveled >= b.maxRange) {
                this.blades.splice(i, 1);
                b.node.active = false;
                this.bladePool.push(b.node);
            }
        }
    }

    /**
     * **一次性射线**：沿 `dir` 从 `origin` 打到 `attackRange` 尽头，
     * 把这条线段附近的敌人**一次全部**打掉（穿透），并给每个受击者一个受击暂停。
     * 不是逐帧检测 —— 一次判定天然不会重复伤害同一个敌人。
     */
    private raycastOnce(origin: Vec3, dir: Vec3): number {
        const end = new Vec3(
            origin.x + dir.x * this.attackRange,
            origin.y + dir.y * this.attackRange,
            0
        );
        let hits = 0;
        for (const enemy of this.collectEnemies()) {
            const pos = enemy.getWorldPosition();
            if (distanceToSegment(pos, origin, end) > this.hitRadius) {
                continue;
            }
            const health = enemy.getComponent('EnemyHealth') as any;
            if (!health || health.isDead) {
                continue;
            }
            health.takeDamage(this.damage);
            hits += 1;
            // 受击暂停：让敌人"顿"一下，打击反馈更清楚
            if (this.hitPauseTime > 0) {
                const pause = enemy.getComponent(HitPause);
                if (pause) {
                    pause.requestPause(this.hitPauseTime);
                }
            }
        }
        return hits;
    }

    /* ----------------------------- 节点池 ----------------------------- */

    private takeBladeNode(): Node | null {
        while (this.bladePool.length > 0) {
            const node = this.bladePool.pop();
            if (node && node.isValid) {
                return node;
            }
        }
        this.ensureFrames();
        if (!this.bladeFrame) {
            return null;
        }
        const node = new Node('Che_Blade');
        node.layer = this.node.layer;
        (this.node.parent || this.node).addChild(node);
        const size = this.bladeSize(this.bladeFrame);
        const transform = node.addComponent(UITransform);
        transform.setAnchorPoint(0.5, 0.5);
        transform.setContentSize(size.w, size.h);
        const sprite = node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.type = Sprite.Type.SIMPLE;
        sprite.trim = false;
        sprite.spriteFrame = this.bladeFrame;
        this.applyBlend(sprite);
        node.addComponent(UIOpacity).opacity = 255;
        node.active = false;
        return node;
    }

    private takeWindupNode(): Node | null {
        while (this.windupPool.length > 0) {
            const node = this.windupPool.pop();
            if (node && node.isValid) {
                return node;
            }
        }
        this.ensureFrames();
        if (!this.windupFrame) {
            return null;
        }
        const node = new Node('Che_Windup');
        node.layer = this.node.layer;
        (this.node.parent || this.node).addChild(node);
        const transform = node.addComponent(UITransform);
        transform.setAnchorPoint(0.5, 0.5);
        transform.setContentSize(this.windupSize, this.windupSize);
        const sprite = node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.type = Sprite.Type.SIMPLE;
        sprite.trim = false;
        sprite.spriteFrame = this.windupFrame;
        this.applyBlend(sprite);
        node.addComponent(UIOpacity).opacity = 0;
        node.active = false;
        return node;
    }

    private recycleWindup(w: Windup): void {
        if (!w.node || !w.node.isValid) {
            return;
        }
        w.node.active = false;
        this.windupPool.push(w.node);
    }

    /** 光刃尺寸：长度固定，粗细按贴图自身比例算（不拉变形）。 */
    private bladeSize(frame: SpriteFrame): { w: number; h: number } {
        const w = Math.max(8, this.projectileLength);
        const rect = frame.rect;
        const aspect = rect.width > 0 ? rect.height / rect.width : 0.06;
        return { w, h: Math.max(4, w * aspect) };
    }

    /**
     * 混合模式。
     * 正片叠底 = `DST_COLOR + ONE_MINUS_SRC_ALPHA`：
     * 不透明处得 `src×dst`（墨叠纸变浓），透明处（素材是纯黑 + alpha 0）原样保留背景。
     * ⚠️ 千万别用 `DST_COLOR + ZERO` —— 那会把透明区也乘成黑，又变成黑底。
     */
    private applyBlend(sprite: Sprite): void {
        const B = gfx.BlendFactor;
        const ui = sprite as any;
        ui._srcBlendFactor = this.multiplyBlend ? B.DST_COLOR : B.SRC_ALPHA;
        ui._dstBlendFactor = B.ONE_MINUS_SRC_ALPHA;
        if (typeof ui._updateBlendFunc === 'function') {
            ui._updateBlendFunc();
        }
    }

    private ensureFrames(): void {
        const blade = this.bladeFrame as unknown as SpriteFrame;
        if (!blade || !(blade as any).texture) {
            this.loadFrame(this.bladeResourcePath, (frame) => {
                this.bladeFrame = frame;
                this.refreshPooledFrames();
            });
        }
        const windup = this.windupFrame as unknown as SpriteFrame;
        if (!windup || !(windup as any).texture) {
            this.loadFrame(this.windupResourcePath, (frame) => {
                this.windupFrame = frame;
                this.refreshPooledFrames();
            });
        }
    }

    private loadFrame(path: string, done: (frame: SpriteFrame) => void): void {
        try {
            resources.load(path, SpriteFrame, (err, frame) => {
                if (err || !frame) {
                    console.warn(`[TowerChe] 贴图加载失败: ${path}`, err);
                    return;
                }
                done(frame);
            });
        } catch (e) {
            console.warn(`[TowerChe] 贴图加载异常: ${path}`, e);
        }
    }

    /** 贴图是异步到的：池子里已经建好的节点要补上贴图和尺寸。 */
    private refreshPooledFrames(): void {
        const blade = this.bladeFrame as unknown as SpriteFrame;
        if (blade && (blade as any).texture) {
            const size = this.bladeSize(blade);
            for (const node of this.bladePool) {
                if (!node || !node.isValid) {
                    continue;
                }
                const sprite = node.getComponent(Sprite);
                if (sprite) {
                    sprite.spriteFrame = blade;
                }
                const transform = node.getComponent(UITransform);
                if (transform) {
                    transform.setContentSize(size.w, size.h);
                }
            }
        }
        const windup = this.windupFrame as unknown as SpriteFrame;
        if (windup && (windup as any).texture) {
            for (const node of this.windupPool) {
                if (!node || !node.isValid) {
                    continue;
                }
                const sprite = node.getComponent(Sprite);
                if (sprite) {
                    sprite.spriteFrame = windup;
                }
            }
        }
    }

    /* ----------------------------- 收集 ----------------------------- */

    /** 找到画布节点（塔可能在 Canvas/Towers 下，也可能在别处）。 */
    private findCanvas(): Node | null {
        let node: Node | null = this.node;
        while (node) {
            if (node.name === 'Canvas') {
                return node;
            }
            node = node.parent;
        }
        const scene = this.node.scene;
        return scene ? scene.getChildByName('Canvas') : null;
    }

    private collectEnemies(): Node[] {
        const canvas = this.findCanvas();
        const box = canvas ? canvas.getChildByName(this.enemyContainerName) : null;
        if (!box) {
            return [];
        }
        return box.children.filter((c) => c.isValid && c.activeInHierarchy);
    }
}

/** 点到线段的距离（世界坐标，忽略 z）。 */
function distanceToSegment(p: Vec3, a: Vec3, b: Vec3): number {
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const lengthSq = abx * abx + aby * aby;
    if (lengthSq <= 0) {
        return Math.hypot(p.x - a.x, p.y - a.y);
    }
    let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / lengthSq;
    t = Math.max(0, Math.min(1, t));
    const cx = a.x + abx * t;
    const cy = a.y + aby * t;
    return Math.hypot(p.x - cx, p.y - cy);
}
