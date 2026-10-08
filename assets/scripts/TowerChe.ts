import {
    _decorator,
    Component,
    Node,
    Sprite,
    SpriteFrame,
    UIOpacity,
    UITransform,
    Vec3,
    resources,
} from 'cc';
import { sampleSpline } from './PathSpline';

const { ccclass, property } = _decorator;

/** 一发飞行中的墨迹。 */
interface Projectile {
    node: Node;
    dir: Vec3;
    prev: Vec3;
    speed: number;
    traveled: number;
    maxRange: number;
    hitRadius: number;
    damage: number;
    hit: Set<Node>;
}

/**
 * 车（象棋「车」）的攻击：沿路径切线定义的 4 个正方向各**甩出一道墨迹**，
 * 墨迹沿直线飞出去，途中撞到卒就扣血（**可穿透**：不减速、不消失），
 * 飞到最大射程后收起。
 *
 * 方向定义（"用棋子和路径相切定义正方向"）：取路径上离车最近的点，
 * 该点切线 = 正方向；4 个方向 = 切向 ± / 法向 ±。
 */
@ccclass('TowerChe')
export class TowerChe extends Component {
    @property({ tooltip: '开火间隔（秒）' })
    public fireInterval = 1.2;

    @property({ tooltip: '每发命中的伤害' })
    public damage = 1;

    @property({ tooltip: '墨迹最大飞行距离（设计单位）' })
    public attackRange = 460;

    @property({ tooltip: '墨迹飞行速度（设计单位/秒）' })
    public projectileSpeed = 900;

    @property({ tooltip: '墨迹长度（设计单位）' })
    public projectileLength = 96;

    @property({ tooltip: '墨迹粗细（设计单位）' })
    public projectileWidth = 28;

    @property({ tooltip: '命中判定半径（卒约 62×62，取 34 左右）' })
    public hitRadius = 34;

    @property({ type: SpriteFrame, tooltip: '墨迹贴图；留空则按下面的 resources 路径加载' })
    public projectileFrame: SpriteFrame | null = null;

    @property({ tooltip: '墨迹贴图在 resources 下的路径' })
    public projectileResourcePath = 'textures/che_attack/spriteFrame';

    @property({ tooltip: '路径节点名' })
    public pathRootName = 'Path';

    @property({ tooltip: '敌人容器名' })
    public enemyContainerName = 'Enemies';

    @property({ tooltip: '启动后自动开火（放到棋盘上才该打开）' })
    public autoFire = true;

    @property({ tooltip: '开火/命中时打控制台日志' })
    public debugLog = false;

    private timer = 0;
    private projectiles: Projectile[] = [];
    private pool: Node[] = [];

    protected onLoad(): void {
        this.timer = this.fireInterval * 0.5;
        this.ensureFrame();
    }

    protected update(dt: number): void {
        this.tickProjectiles(dt);
        if (!this.autoFire) {
            return;
        }
        this.timer += dt;
        if (this.timer >= this.fireInterval) {
            this.timer = 0;
            this.fire();
        }
    }

    /** 开一次火：4 个方向各甩一道墨迹。返回发射的道数。 */
    public fire(): number {
        const origin = this.node.getWorldPosition().clone();
        const dirs = this.fourDirections(origin);
        if (dirs.length === 0) {
            if (this.debugLog) {
                console.log('[TowerChe] 找不到路径，无法确定攻击方向');
            }
            return 0;
        }
        this.ensureFrame();
        for (const dir of dirs) {
            this.launch(origin, dir);
        }
        if (this.debugLog) {
            console.log('[TowerChe] 开火，' + dirs.length + ' 道墨迹');
        }
        return dirs.length;
    }

    /** 当前在飞的墨迹数（调试/UI 用）。 */
    public get activeShots(): number {
        return this.projectiles.length;
    }

    /* --------------------------- 投射物 --------------------------- */

    private launch(origin: Vec3, dir: Vec3): void {
        const node = this.takeProjectileNode();
        if (!node) {
            return;
        }
        const angle = (Math.atan2(dir.y, dir.x) * 180) / Math.PI;
        node.setWorldPosition(origin.x, origin.y, 0);
        node.setWorldRotationFromEuler(0, 0, angle);
        node.active = true;
        const opacity = node.getComponent(UIOpacity);
        if (opacity) {
            opacity.opacity = 255;
        }
        this.projectiles.push({
            node,
            dir: dir.clone(),
            prev: origin.clone(),
            speed: this.projectileSpeed,
            traveled: 0,
            maxRange: this.attackRange,
            hitRadius: this.hitRadius,
            damage: this.damage,
            hit: new Set<Node>(),
        });
    }

    private tickProjectiles(dt: number): void {
        for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
            const p = this.projectiles[i];
            if (!p.node || !p.node.isValid) {
                this.projectiles.splice(i, 1);
                continue;
            }

            const step = p.speed * dt;
            const cur = p.node.getWorldPosition();
            const from = new Vec3(cur.x, cur.y, 0);

            p.traveled += step;
            const to = new Vec3(cur.x + p.dir.x * step, cur.y + p.dir.y * step, 0);
            p.node.setWorldPosition(to);

            // 用"本帧走过的一小段"判定，飞得再快也不会穿过卒
            this.resolveHits(p, from, to);

            if (p.traveled >= p.maxRange) {
                this.retireProjectile(i);
            }
        }
    }

    /** 撞到就扣血并记录；不打断飞行（穿透）。 */
    private resolveHits(p: Projectile, from: Vec3, to: Vec3): void {
        for (const enemy of this.collectEnemies()) {
            if (p.hit.has(enemy)) {
                continue;
            }
            const pos = enemy.getWorldPosition();
            if (distanceToSegment(pos, from, to) > p.hitRadius) {
                continue;
            }
            p.hit.add(enemy);
            const health = enemy.getComponent('EnemyHealth') as any;
            if (health && !health.isDead) {
                health.takeDamage(p.damage);
            }
        }
    }

    private retireProjectile(index: number): void {
        const p = this.projectiles[index];
        this.projectiles.splice(index, 1);
        if (p && p.node && p.node.isValid) {
            p.node.active = false;
            this.pool.push(p.node);
        }
    }

    private takeProjectileNode(): Node | null {
        while (this.pool.length > 0) {
            const node = this.pool.pop();
            if (node && node.isValid) {
                const transform = node.getComponent(UITransform);
                if (transform) {
                    transform.setContentSize(this.projectileLength, this.projectileWidth);
                }
                return node;
            }
        }
        this.ensureFrame();
        if (!this.projectileFrame) {
            return null;
        }
        const node = new Node('Ink_shot');
        node.layer = this.node.layer;
        (this.node.parent || this.node).addChild(node);
        const transform = node.addComponent(UITransform);
        transform.setAnchorPoint(0.5, 0.5);
        transform.setContentSize(this.projectileLength, this.projectileWidth);
        const sprite = node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.type = Sprite.Type.SIMPLE;
        sprite.trim = false;
        sprite.spriteFrame = this.projectileFrame;
        node.addComponent(UIOpacity).opacity = 255;
        node.active = false;
        return node;
    }

    private ensureFrame(): void {
        const configured = this.projectileFrame as unknown as SpriteFrame;
        if (configured && (configured as any).texture) {
            return;
        }
        try {
            resources.load(this.projectileResourcePath, SpriteFrame, (err, frame) => {
                if (!err && frame) {
                    this.projectileFrame = frame;
                }
            });
        } catch (e) {
            // 拿不到贴图也不影响命中逻辑
        }
    }

    /* ------------------------- 方向 / 收集 ------------------------- */

    /** 沿路径切线定义的 4 个方向。 */
    private fourDirections(origin: Vec3): Vec3[] {
        const pts = this.samplePath();
        if (pts.length < 2) {
            return [];
        }
        let best = 0;
        let bestD = Number.MAX_VALUE;
        for (let i = 0; i < pts.length; i += 1) {
            const dx = pts[i].x - origin.x;
            const dy = pts[i].y - origin.y;
            const d = dx * dx + dy * dy;
            if (d < bestD) {
                bestD = d;
                best = i;
            }
        }
        const a = pts[Math.max(0, best - 1)];
        const b = pts[Math.min(pts.length - 1, best + 1)];
        let tx = b.x - a.x;
        let ty = b.y - a.y;
        const len = Math.hypot(tx, ty) || 1;
        tx /= len;
        ty /= len;
        return [
            new Vec3(tx, ty, 0),
            new Vec3(-tx, -ty, 0),
            new Vec3(-ty, tx, 0),
            new Vec3(ty, -tx, 0),
        ];
    }

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

    private samplePath(): Vec3[] {
        const canvas = this.findCanvas();
        const root = canvas ? canvas.getChildByName(this.pathRootName) : null;
        if (!root || root.children.length < 2) {
            return [];
        }
        const controls = root.children.map((child) => child.getWorldPosition().clone());
        return sampleSpline(controls, 20);
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
