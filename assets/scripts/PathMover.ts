import { _decorator, Component, Node, UITransform, Vec3 } from 'cc';
import { sampleSpline } from './PathSpline';

const { ccclass, property } = _decorator;

/**
 * 沿固定路径匀速移动（挂在移动单位上，例如棋子）。
 *
 * 路径 = pathRoot 的子节点按顺序（P0、P1、…）作为控制点，
 * 默认用 Catmull-Rom 平滑成曲线再匀速前进（与 BrushPath 铺出来的笔触同一条曲线）；
 * 关掉 smooth 则按控制点折线走。
 *
 * 出发前会先等 startDelay 秒（固定延迟），用于"自动开始"后留一点缓冲再动。
 */
@ccclass('PathMover')
export class PathMover extends Component {
    @property({ type: Node, tooltip: '路径根节点：它的子节点按顺序作为路点（P0、P1、…）；留空则自动找同级名为 Path 的节点' })
    public pathRoot: Node | null = null;

    @property({ tooltip: '移动速度（设计分辨率单位/秒）' })
    public speed = 120;

    @property({ tooltip: '开始移动前的固定延迟（秒），0 = 立刻出发' })
    public startDelay = 0;

    @property({ tooltip: '初始已走的弧长（沿路径错开出兵用：第 i 个卒 = i × 间距）' })
    public startDistance = 0;

    @property({ tooltip: '走到终点后从头再来' })
    public loop = true;

    @property({ tooltip: '把控制点平滑成曲线（波浪路径需要开启；关掉则沿折线走）' })
    public smooth = true;

    @property({ tooltip: '每两个控制点之间的采样段数（需与 BrushPath 保持一致）' })
    public samplesPerSegment = 10;

    @property({ tooltip: '读控制点时忽略名字以此开头的子节点（BrushPath 生成出来的笔触段）' })
    public ignorePrefix = 'Brush';

    @property({ tooltip: '让节点朝向前进方向' })
    public faceDirection = false;

    @property({ tooltip: '朝向角度修正（度）' })
    public directionOffset = 0;

    private points: Vec3[] = [];
    private segLengths: number[] = [];
    private totalLength = 0;
    private traveled = 0;
    private done = false;
    private delayLeft = 0;
    /** 已经走完的整圈数（供波次等逻辑读取）。 */
    private laps = 0;

    protected onEnable(): void {
        this.rebuild();
    }

    /** 重新从路径根节点读取路点；路径节点位置变化后可手动调用。 */
    public rebuild(): void {
        this.points = [];
        this.segLengths = [];
        this.totalLength = 0;
        this.done = false;
        this.delayLeft = Math.max(0, this.startDelay);

        const root = this.resolvePathRoot();
        if (!root) {
            console.warn('[PathMover] 找不到路径根节点（pathRoot 为空且同级没有名为 Path 的节点）');
            return;
        }

        const controls = root.children
            .filter((child) => !child.name.startsWith(this.ignorePrefix))
            .map((child) => this.toParentSpace(child.getWorldPosition()));
        this.points = this.smooth ? sampleSpline(controls, this.samplesPerSegment) : controls;

        for (let i = 0; i < this.points.length - 1; i += 1) {
            const length = Vec3.distance(this.points[i], this.points[i + 1]);
            this.segLengths.push(length);
            this.totalLength += length;
        }

        // 总长这时才算完，所以「初始弧长」对应的位置要在这里定
        this.traveled = Math.min(Math.max(0, this.startDistance), this.totalLength);

        if (this.points.length > 0) {
            this.placeAt(this.traveled);
        }
    }

    /** 已走完的整圈数。 */
    public get lapCount(): number {
        return this.laps;
    }

    /** 直接设到路径上的某个弧长位置（出兵错开、传送等用）。 */
    public setProgress(distance: number): void {
        this.startDistance = distance;
        this.traveled = Math.min(Math.max(0, distance), this.totalLength);
        this.done = false;
        this.update(0);
    }

    /** 回到起点重新走（同样会先等 startDelay 秒）。 */
    public restart(): void {
        this.traveled = Math.min(Math.max(0, this.startDistance), this.totalLength);
        this.laps = 0;
        this.done = false;
        this.delayLeft = Math.max(0, this.startDelay);
        this.placeAt(0);
    }

    /** 剩余的开始延迟（秒），调试/UI 可用。 */
    public get pendingDelay(): number {
        return this.delayLeft;
    }

    protected update(dt: number): void {
        if (this.totalLength <= 0 || this.done) {
            return;
        }

        // 出发前的固定延迟：等够 startDelay 秒才真正开始移动。
        if (this.delayLeft > 0) {
            this.delayLeft -= dt;
            return;
        }

        this.traveled += this.speed * dt;

        if (this.traveled >= this.totalLength) {
            if (this.loop) {
                this.traveled %= this.totalLength;
                this.laps += 1;          // 走完一整圈 = 一波
            } else {
                this.traveled = this.totalLength;
                this.placeAt(this.traveled);
                this.done = true;
                return;
            }
        }

        this.placeAt(this.traveled);
    }

    /** 按已走距离把节点放到路径上的对应位置。 */
    private placeAt(distance: number): void {
        if (this.points.length === 0) {
            return;
        }
        if (this.points.length === 1) {
            this.node.setPosition(this.points[0]);
            return;
        }

        let rest = Math.max(0, distance);
        let index = 0;
        while (index < this.segLengths.length - 1 && rest > this.segLengths[index]) {
            rest -= this.segLengths[index];
            index += 1;
        }

        const from = this.points[index];
        const to = this.points[index + 1];
        const length = this.segLengths[index];
        const ratio = length > 0 ? Math.min(1, rest / length) : 0;

        this.node.setPosition(
            from.x + (to.x - from.x) * ratio,
            from.y + (to.y - from.y) * ratio,
            0
        );

        if (this.faceDirection) {
            const angle = Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI;
            this.node.angle = angle + this.directionOffset;
        }
    }

    /** pathRoot 未在编辑器中指定时，回退到同级中名为 Path 的节点。 */
    private resolvePathRoot(): Node | null {
        const configured = this.pathRoot as unknown as Node;
        if (configured && typeof configured.getChildByName === 'function') {
            return configured;
        }
        const parent = this.node.parent;
        return parent ? parent.getChildByName('Path') : null;
    }

    /** 世界坐标 -> 自身父节点坐标，路径点与移动单位可放在不同父节点下。 */
    private toParentSpace(world: Vec3): Vec3 {
        const parent = this.node.parent;
        if (!parent) {
            return world.clone();
        }
        const transform = parent.getComponent(UITransform);
        if (transform) {
            const local = transform.convertToNodeSpaceAR(world);
            return new Vec3(local.x, local.y, 0);
        }
        return parent.inverseTransformPoint(new Vec3(), world);
    }
}
