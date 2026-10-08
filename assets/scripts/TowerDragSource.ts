import {
    _decorator,
    Color,
    Component,
    Graphics,
    EventTouch,
    Node,
    Sprite,
    SpriteFrame,
    UITransform,
    Vec2,
    Vec3,
    resources,
} from 'cc';
import { sampleSpline } from './PathSpline';
import { QiManager } from './QiManager';

const { ccclass, property } = _decorator;

/**
 * 挂在塔栏卡片上：按住卡片拖出一个棋子（例如"车"），松手放到棋盘上。
 *
 * 两个已踩过的坑，别改回去：
 * 1. 落点**不能**用松手事件里的触摸位置 —— 实测它一直是"按下点"（卡片那儿），
 *    结果塔全被吸到棋盘左上角。这里改用 TOUCH_MOVE 过程里记录的最后位置。
 * 2. 手指移出卡片范围时引擎会发 TOUCH_CANCEL，所以 cancel 也要当作松手处理，
 *    否则拖到一半就被中断（表现为"偶尔才能放下"）。
 *
 * 日志只打浏览器控制台，前缀 [TowerDragSource]。
 */
@ccclass('TowerDragSource')
export class TowerDragSource extends Component {
    @property({ type: SpriteFrame, tooltip: '拖出来的塔的图（例如“车”）' })
    public towerFrame: SpriteFrame | null = null;

    @property({ tooltip: '塔纹理在 resources 下的路径（组件上引用为空时用）' })
    public towerResourcePath = 'textures/che/spriteFrame';

    @property({ tooltip: '放置后要挂上的攻击组件名（留空则不挂），例如 TowerChe' })
    public attackComponent = 'TowerChe';

    @property({ type: SpriteFrame, tooltip: '攻击墨迹贴图（例如 che_attack）' })
    public attackFrame: SpriteFrame | null = null;

    @property({ tooltip: '攻击贴图在 resources 下的路径（未指定贴图时用）' })
    public attackResourcePath = 'textures/che_attack/spriteFrame';

    @property({ tooltip: '开火间隔（秒）' })
    public attackInterval = 1.2;

    @property({ tooltip: '每发命中的伤害' })
    public attackDamage = 1;

    @property({ tooltip: '墨迹最大飞行距离' })
    public attackRange = 460;

    @property({ tooltip: '墨迹飞行速度（设计单位/秒）' })
    public attackProjectileSpeed = 900;

    @property({ tooltip: '墨迹长度' })
    public attackProjectileLength = 96;

    @property({ tooltip: '墨迹粗细' })
    public attackProjectileWidth = 28;

    @property({ tooltip: '命中判定半径' })
    public attackHitRadius = 34;

    @property({ type: Node, tooltip: '放置父节点（把塔挂到它下面，例如 Canvas/Towers）' })
    public dropParent: Node | null = null;

    @property({ type: Node, tooltip: '路径节点（放置时避开它）；留空则找同级名为 Path 的节点' })
    public pathNode: Node | null = null;

    @property({ tooltip: '塔的显示大小（设计单位）' })
    @property({ tooltip: '放一个的棋气开销' })
    public cost = 50;

    public towerSize = 62;

    @property({ tooltip: '拖动时幽灵棋子的透明度（0~255）' })
    public ghostOpacity = 170;

    @property({ tooltip: '允许放置区域：左下角（画布坐标）' })
    public areaMin = new Vec2(-412.5, -120);

    @property({ tooltip: '允许放置区域：右上角（画布坐标）。默认整个棋盘' })
    public areaMax = new Vec2(281.9, 269.4);

    @property({ tooltip: '与路径的最小距离（设计单位）；小于它算“压在路径上”' })
    public minDistanceFromPath = 22;

    @property({ tooltip: '松手点离最近合法位置超过这个距离就不放置（设计单位）' })
    public maxSnapDistance = 200;

    @property({ tooltip: '松手后吸附到棋盘格心（越细越贴近手指）' })
    public snapToGrid = true;

    @property({ tooltip: '棋盘列数（吸附密度，越大越贴近手指位置）' })
    public gridCols = 20;

    @property({ tooltip: '棋盘行数（吸附密度）' })
    public gridRows = 20;

    @property({ tooltip: '放置后的塔名字前缀' })
    public towerPrefix = 'Tower';

    private ghost: Node | null = null;
    /** TOUCH_MOVE 过程中记录的最后落点（本地坐标）——放置时用它，不用松手事件的位置。 */
    private lastLocal: Vec3 | null = null;

    protected onEnable(): void {
        this.ensureFrame();

        this.node.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
        this.node.on(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
        this.node.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
        this.node.on(Node.EventType.TOUCH_CANCEL, this.onTouchCancel, this);

        this.ensureClickArea();

        const transform = this.node.getComponent(UITransform);
        console.log(
            `[TowerDragSource] ready: node=${this.node.name}`
            + ` size=${transform ? transform.width + 'x' + transform.height : 'NO-UITransform'}`
            + ` layer=${this.node.layer} frame=${this.towerFrame ? 'set' : 'EMPTY'}`
        );
    }

    /**
     * 保证整张卡片都能点中。
     * `Card_che` 本身只是个 UITransform 容器（只有子节点 Icon 带 Sprite），
     * 直接点卡片空白处有时命不中；补一层几乎不可见的 Graphics 底板就稳了。
     * ⚠️ 不能用 UIOpacity=0（那会让整棵子树都不接收触摸），用低 alpha 填充代替。
     */
    private ensureClickArea(): void {
        const t = this.node.getComponent(UITransform);
        const w = t ? t.width : 170;
        const h = t ? t.height : 190;
        const g = this.node.getComponent(Graphics) || this.node.addComponent(Graphics);
        g.clear();
        g.fillColor = new Color(255, 255, 255, 2);
        g.rect(-w / 2, -h / 2, w, h);
        g.fill();
    }

    protected onDisable(): void {
        this.node.off(Node.EventType.TOUCH_START, this.onTouchStart, this);
        this.node.off(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
        this.node.off(Node.EventType.TOUCH_END, this.onTouchEnd, this);
        this.node.off(Node.EventType.TOUCH_CANCEL, this.onTouchCancel, this);
        this.destroyGhost();
    }

    /** 这个格心能不能放塔（在区域内 + 不压路径）。 */
    public canPlace(pos: Vec3): boolean {
        if (!this.isInsideArea(pos) || this.isTooCloseToPath(pos)) {
            return false;
        }
        const qi = QiManager.shared;
        return qi ? qi.canAfford(this.cost) : true;   // 没有 QiManager 时不限制（方便单测）
    }

    /**
     * 松手落点最终会放到哪里。
     * 就算不在棋盘内（例如从左边栏拖出来时手停在棋盘左边缘外）也会就近吸进最近的合法格心，
     * 只有离得太远（超过 maxSnapDistance）才返回 null。
     */
    public resolveDropPosition(pos: Vec3): Vec3 | null {
        const snapped = this.snap(pos);
        if (this.canPlace(snapped)) {
            return snapped;
        }
        const near = this.findNearestValidCell(snapped);
        if (!near) {
            return null;
        }
        const dx = near.x - pos.x;
        const dy = near.y - pos.y;
        if (Math.sqrt(dx * dx + dy * dy) > this.maxSnapDistance) {
            return null;
        }
        return near;
    }

    private onTouchStart(event: EventTouch): void {
        this.destroyGhost();
        this.lastLocal = null;

        const parent = this.resolveDropParent();
        if (!this.towerFrame) {
            this.ensureFrame();      // 贴图可能还在异步加载，再试一次
        }
        // 注意：贴图没就绪也**不阻止拖拽** —— 幽灵节点会是空的，但落点/扣费照常，
        // 等 ensureFrame 回来后会补上。否则加载慢一点就"拖不动 / 放不下"。
        if (!parent) {
            console.log('[TowerDragSource] start 无法拖动: 找不到放置父节点');
            return;
        }
        this.ghost = this.createTowerNode(parent, 'Ghost', this.ghostOpacity);
        this.moveGhost(event);
        console.log('[TowerDragSource] start -> ghost created');
    }

    private onTouchMove(event: EventTouch): void {
        if (!this.ghost) {
            return;
        }
        this.moveGhost(event);
        const position = this.ghost.position;
        this.lastLocal = new Vec3(position.x, position.y, 0);
    }

    private onTouchEnd(event: EventTouch): void {
        this.finishDrop('end');
    }

    /** 手指移出卡片时引擎会发 cancel —— 拖到这里就中断，所以也当作松手。 */
    private onTouchCancel(event: EventTouch): void {
        this.finishDrop('cancel');
    }

    /** 统一的落点处理：用移动过程中记录的最后位置。 */
    private finishDrop(reason: string): void {
        if (!this.ghost) {
            console.log(`[TowerDragSource] ${reason} 时没有幽灵节点（按下没生效）`);
            return;
        }
        const local = this.lastLocal ? this.lastLocal.clone() : this.ghost.position.clone();
        this.destroyGhost();
        this.lastLocal = null;

        const target = this.resolveDropPosition(local);
        if (!target) {
            console.log(`[TowerDragSource] ${reason} ${local.x.toFixed(0)},${local.y.toFixed(0)} -> 太远，不放置`);
            return;
        }

        const parent = this.resolveDropParent();
        if (!parent) {
            console.log('[TowerDragSource] 放置失败：找不到放置父节点');
            return;
        }
        const qi = QiManager.shared;
        const cost = Math.max(0, Math.floor(this.cost));
        if (qi && !qi.canAfford(cost)) {
            console.log(`[TowerDragSource] 棋气不足（需要 ${cost}，现有 ${qi.value}），放不下`);
            return;
        }

        const placed = this.createTowerNode(parent, `${this.towerPrefix}_${this.countTowers() + 1}`, 255);
        placed.setPosition(target);
        if (qi) {
            qi.spend(cost);
        }
        console.log(`[TowerDragSource] ${reason} placed ${placed.name} @ ${target.x.toFixed(0)},${target.y.toFixed(0)} (from ${local.x.toFixed(0)},${local.y.toFixed(0)})`);
    }

    private moveGhost(event: EventTouch): void {
        if (!this.ghost) {
            return;
        }
        this.ghost.setPosition(this.toLocal(event.getUILocation()));
    }

    /** 屏幕（UI 空间）坐标 -> 放置父节点的本地坐标。 */
    private toLocal(ui: Vec2): Vec3 {
        const parent = this.resolveDropParent();
        const transform = parent ? parent.getComponent(UITransform) : null;
        if (transform) {
            const local = transform.convertToNodeSpaceAR(new Vec3(ui.x, ui.y, 0));
            return new Vec3(local.x, local.y, 0);
        }
        return new Vec3(ui.x, ui.y, 0);
    }

    private isInsideArea(pos: Vec3): boolean {
        return pos.x >= this.areaMin.x && pos.x <= this.areaMax.x
            && pos.y >= this.areaMin.y && pos.y <= this.areaMax.y;
    }

    /** 吸附到最近的棋盘格心。 */
    private snap(pos: Vec3): Vec3 {
        if (!this.snapToGrid) {
            return pos;
        }
        const cols = Math.max(1, Math.floor(this.gridCols));
        const rows = Math.max(1, Math.floor(this.gridRows));
        const cellW = (this.areaMax.x - this.areaMin.x) / cols;
        const cellH = (this.areaMax.y - this.areaMin.y) / rows;
        if (cellW <= 0 || cellH <= 0) {
            return pos;
        }

        const col = Math.round((pos.x - this.areaMin.x - cellW * 0.5) / cellW);
        const row = Math.round((pos.y - this.areaMin.y - cellH * 0.5) / cellH);
        return new Vec3(
            this.areaMin.x + (col + 0.5) * cellW,
            this.areaMin.y + (row + 0.5) * cellH,
            0
        );
    }

    /** 遍历所有格心，找离落点最近的一个合法位置。 */
    private findNearestValidCell(pos: Vec3): Vec3 | null {
        const cols = Math.max(1, Math.floor(this.gridCols));
        const rows = Math.max(1, Math.floor(this.gridRows));
        const cellW = (this.areaMax.x - this.areaMin.x) / cols;
        const cellH = (this.areaMax.y - this.areaMin.y) / rows;
        if (cellW <= 0 || cellH <= 0) {
            return null;
        }

        let best: Vec3 | null = null;
        let bestDistanceSq = Number.POSITIVE_INFINITY;
        for (let i = 0; i < cols; i += 1) {
            for (let j = 0; j < rows; j += 1) {
                const candidate = new Vec3(
                    this.areaMin.x + (i + 0.5) * cellW,
                    this.areaMin.y + (j + 0.5) * cellH,
                    0
                );
                if (!this.canPlace(candidate)) {
                    continue;
                }
                const dx = candidate.x - pos.x;
                const dy = candidate.y - pos.y;
                const distanceSq = dx * dx + dy * dy;
                if (distanceSq < bestDistanceSq) {
                    bestDistanceSq = distanceSq;
                    best = candidate;
                }
            }
        }
        return best;
    }

    /** 落点是否离路径太近（用与 BrushPath/PathMover 同一套曲线采样来算距离）。 */
    private isTooCloseToPath(pos: Vec3): boolean {
        if (this.minDistanceFromPath <= 0) {
            return false;
        }
        const path = this.resolvePathNode();
        const parent = this.resolveDropParent();
        if (!path || !parent) {
            return false;
        }

        const controls: Vec3[] = [];
        for (const child of path.children) {
            if (child.name.indexOf('Brush') === 0) {
                continue;
            }
            controls.push(this.worldToParent(child.getWorldPosition(), parent));
        }
        if (controls.length < 2) {
            return false;
        }

        const points = sampleSpline(controls, 8);
        let best = Number.POSITIVE_INFINITY;
        for (let i = 0; i < points.length - 1; i += 1) {
            best = Math.min(best, this.distanceToSegment(pos, points[i], points[i + 1]));
            if (best < this.minDistanceFromPath) {
                return true;
            }
        }
        return best < this.minDistanceFromPath;
    }

    private distanceToSegment(p: Vec3, a: Vec3, b: Vec3): number {
        const abx = b.x - a.x;
        const aby = b.y - a.y;
        const lengthSq = abx * abx + aby * aby;
        if (lengthSq <= 0) {
            return Vec3.distance(p, a);
        }
        let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / lengthSq;
        t = Math.max(0, Math.min(1, t));
        const cx = a.x + abx * t;
        const cy = a.y + aby * t;
        return Math.sqrt((p.x - cx) * (p.x - cx) + (p.y - cy) * (p.y - cy));
    }

    private worldToParent(world: Vec3, parent: Node): Vec3 {
        // 容器节点如果没有 UITransform，就退到上一级（例如 Canvas）的坐标系换算，
        // 避免把世界坐标当成父节点坐标用，导致距离计算整体偏移。
        let transform = parent.getComponent(UITransform);
        if (!transform && parent.parent) {
            transform = parent.parent.getComponent(UITransform);
        }
        if (transform) {
            const local = transform.convertToNodeSpaceAR(world);
            return new Vec3(local.x, local.y, 0);
        }
        return world.clone();
    }

    private createTowerNode(parent: Node, name: string, opacity: number): Node {
        const node = new Node(name);
        node.layer = parent.layer;
        parent.addChild(node);

        const transform = node.addComponent(UITransform);
        transform.setAnchorPoint(0.5, 0.5);
        transform.setContentSize(this.towerSize, this.towerSize);

        const sprite = node.addComponent(Sprite);
        // 先设 sizeMode / type 再设 spriteFrame，避免 contentSize 被重置成素材尺寸。
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.type = Sprite.Type.SIMPLE;
        sprite.trim = false;
        sprite.spriteFrame = this.towerFrame;

        if (opacity < 255) {
            const color = sprite.color.clone();
            color.a = opacity;
            sprite.color = color;
        }

        this.attachAttack(node);
        return node;
    }

    /**
     * 给放下去的塔挂攻击组件，参数取自本组件面板（TowerDragSource 上的属性）。
     * 想调车的攻击手感，直接改侧边栏卡片上 TowerDragSource 的面板即可。
     */
    private attachAttack(node: Node): void {
        if (!this.attackComponent) {
            return;
        }
        try {
            const dst: any = node.getComponent(this.attackComponent) || node.addComponent(this.attackComponent);
            if (!dst) {
                return;
            }
            dst.projectileFrame = this.attackFrame;
            dst.projectileResourcePath = this.attackResourcePath;
            dst.fireInterval = this.attackInterval;
            dst.damage = this.attackDamage;
            dst.attackRange = this.attackRange;
            dst.projectileSpeed = this.attackProjectileSpeed;
            dst.projectileLength = this.attackProjectileLength;
            dst.projectileWidth = this.attackProjectileWidth;
            dst.hitRadius = this.attackHitRadius;
            dst.autoFire = true;             // 落地后才开火
            dst.debugLog = false;
            if (typeof dst.onLoad === 'function') {
                dst.onLoad();                // 补跑一次，保证贴图/状态就绪
            }
            this.attachDetailTap(node);
        } catch (e) {
            console.warn('[TowerDragSource] 挂攻击组件失败', e);
        }
    }

    /** 点一下已放置的棋子 → 弹出 detail 介绍卡。 */
    private attachDetailTap(node: Node): void {
        node.off(Node.EventType.TOUCH_END, this.onTowerTapped, this);
        node.on(Node.EventType.TOUCH_END, this.onTowerTapped, this);
    }

    private onTowerTapped(): void {
        const scene = this.node.scene;
        const canvas = scene ? scene.getChildByName('Canvas') : null;
        const popup = canvas ? canvas.getChildByName('TowerDetail') : null;
        const comp: any = popup ? popup.getComponent('TowerDetailPopup') : null;
        if (comp && typeof comp.show === 'function') {
            comp.show();
        }
    }

    private destroyGhost(): void {
        if (this.ghost && this.ghost.isValid) {
            this.ghost.removeFromParent();
            this.ghost.destroy();
        }
        this.ghost = null;
    }

    private countTowers(): number {
        const parent = this.resolveDropParent();
        if (!parent) {
            return 0;
        }
        return parent.children.filter((child) => child.name.indexOf(this.towerPrefix) === 0).length;
    }

    /** 组件上的引用为空 / 是编辑器壳对象时，用 resources 兜底加载。 */
    private ensureFrame(): void {
        const configured = this.towerFrame as unknown as SpriteFrame;
        if (configured && (configured as any).rect && (configured as any).texture) {
            return;
        }
        resources.load(this.towerResourcePath, SpriteFrame, (err, loaded) => {
            if (err || !loaded) {
                console.warn(`[TowerDragSource] 塔纹理加载失败: ${this.towerResourcePath}`, err);
                return;
            }
            this.towerFrame = loaded;
        });
    }

    private resolveDropParent(): Node | null {
        const configured = this.dropParent as unknown as Node;
        if (configured && configured.isValid) {
            return configured;
        }
        // 没在编辑器里指定时：优先同级里名为 Towers 的容器，其次用 Canvas。
        const sidebar = this.node.parent;
        const canvas = sidebar ? sidebar.parent : null;
        if (canvas) {
            const towers = canvas.getChildByName('Towers');
            if (towers) {
                return towers;
            }
        }
        return canvas || sidebar;
    }

    private resolvePathNode(): Node | null {
        const configured = this.pathNode as unknown as Node;
        if (configured && configured.isValid) {
            return configured;
        }
        const sidebar = this.node.parent;
        const canvas = sidebar ? sidebar.parent : null;
        return canvas ? canvas.getChildByName('Path') : null;
    }
}
