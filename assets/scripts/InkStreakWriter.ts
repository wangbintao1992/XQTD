import { _decorator, Component, MotionStreak, Node, UITransform, Vec3 } from 'cc';

const { ccclass, property } = _decorator;

/* ============================================================================
 * 贝塞尔工具（可单独 import 使用）
 * ==========================================================================*/

/** 三次贝塞尔：在 t ∈ [0,1] 上取样。 */
export function sampleCubicBezier(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 {
    const mt = 1 - t;
    const a = mt * mt * mt;
    const b = 3 * mt * mt * t;
    const c = 3 * mt * t * t;
    const d = t * t * t;
    return new Vec3(
        a * p0.x + b * p1.x + c * p2.x + d * p3.x,
        a * p0.y + b * p1.y + c * p2.y + d * p3.y,
        0
    );
}

export interface BezierSegment {
    p0: Vec3;
    p1: Vec3;
    p2: Vec3;
    p3: Vec3;
}

/**
 * 把 Catmull-Rom 控制点序列换算成"分段三次贝塞尔"的控制点。
 * 换算公式：b1 = p1 + (p2 - p0) / 6，b2 = p2 - (p3 - p1) / 6。
 * 这样既不动现有 P0..Pn 的数据结构，又能用统一的三次贝塞尔采样。
 */
export function catmullRomToBezier(controls: Vec3[]): BezierSegment[] {
    const segments: BezierSegment[] = [];
    const n = controls.length;
    if (n < 2) {
        return segments;
    }
    for (let i = 0; i < n - 1; i += 1) {
        const p0 = controls[i > 0 ? i - 1 : i];
        const p1 = controls[i];
        const p2 = controls[i + 1];
        const p3 = controls[i + 2 < n ? i + 2 : i + 1];
        segments.push({
            p0: p1.clone(),
            p1: new Vec3(p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6, 0),
            p2: new Vec3(p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6, 0),
            p3: p2.clone(),
        });
    }
    return segments;
}

/** 在分段贝塞尔上按全局 u ∈ [0,1] 取样（u 会均匀分到各段上）。 */
export function sampleBezierPath(segments: BezierSegment[], u: number, perSegment = 32): Vec3 {
    if (segments.length === 0) {
        return new Vec3();
    }
    const clamped = Math.max(0, Math.min(1, u));
    const scaled = clamped * segments.length;
    let index = Math.floor(scaled);
    if (index >= segments.length) {
        index = segments.length - 1;
    }
    const localT = Math.max(0, Math.min(1, scaled - index));
    const seg = segments[index];
    const k = Math.max(1, Math.floor(perSegment));
    const quantized = Math.round(localT * k) / k;
    return sampleCubicBezier(seg.p0, seg.p1, seg.p2, seg.p3, quantized);
}

/**
 * 三点外接圆法求曲率 κ = 4A / (a·b·c)（A 为三角形面积，a/b/c 为三边）。
 * 传进来的点应当是**等弧长附近**的采样点；直线段返回 0。
 */
export function curvatureAt(points: Vec3[], index: number): number {
    if (index <= 0 || index >= points.length - 1) {
        return 0;
    }
    const prev = points[index - 1];
    const cur = points[index];
    const next = points[index + 1];

    const a = Vec3.distance(prev, cur);
    const b = Vec3.distance(cur, next);
    const c = Vec3.distance(prev, next);
    if (a < 1e-4 || b < 1e-4 || c < 1e-4) {
        return 0;
    }

    const s = (a + b + c) * 0.5;
    const areaSq = s * (s - a) * (s - b) * (s - c);
    if (areaSq <= 1e-12) {
        return 0;
    }
    const area = Math.sqrt(areaSq);
    return (4 * area) / (a * b * c);
}

/** 整数附近的平滑：避免速度在相邻采样点间跳变。 */
function smoothstep(edge0: number, edge1: number, x: number): number {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0 || 1)));
    return t * t * (3 - 2 * t);
}

/* ============================================================================
 * 用 MotionStreak 沿路径"写"一笔水墨
 * ==========================================================================*/

/**
 * 让挂着 MotionStreak 的节点沿路径控制点平滑移动，写出整条水墨拖尾。
 *
 * 针对"急转弯处拖尾断裂"的做法：
 *  1. **按曲率自适应减速**：直线段用 straightSpeed，转弯处按曲率平滑降到 turnSpeed，
 *     每帧位移变小 → 采样点自然变密，前后两片面片就会重叠；
 *  2. **急弯处子步推进**：一帧内最多细分 maxSubSteps 次（每次不超过 ~1/120 秒的份额），
 *     防止高帧率下"一大步跨过弯"造成跳点；
 *  3. 每步之后调用 `placeAt()` 真正把节点挪过去，MotionStreak 才能在正确位置取点。
 *
 * 不动 P0..Pn 的数据结构：路径仍从 pathRoot 的子节点读，只是把它转成贝塞尔分段来采样。
 */
@ccclass('InkStreakWriter')
export class InkStreakWriter extends Component {
    @property({ type: Node, tooltip: '路径根节点（控制点 P0..Pn）；留空则找同级名为 Path 的节点' })
    public pathRoot: Node | null = null;

    @property({ tooltip: '直线段速度（设计单位/秒），越快越省时间' })
    public straightSpeed = 1400;

    @property({ tooltip: '急转弯处的最低速度（设计单位/秒），越小弯道点越密' })
    public turnSpeed = 200;

    @property({ tooltip: '曲率→减速的灵敏度：越大越早开始减速（500~1500 比较合适）' })
    public curvatureGain = 900;

    @property({ tooltip: '每段贝塞尔的采样点数（用于估曲率与推进查表）' })
    public samplesPerSegment = 32;

    @property({ tooltip: '单帧最多细分几次（急弯处靠它保住采样密度）' })
    public maxSubSteps = 8;

    @property({ tooltip: '开始前延迟（秒）' })
    public startDelay = 0;

    @property({ tooltip: '跑完后冻结拖尾（把 fadeTime 设成很大，拖尾不再淡出）' })
    public freezeAfterFinish = true;

    @property({ tooltip: '冻结用的 fadeTime（秒）。注意 MotionStreak 里 0 表示"立刻过期"而不是"不淡出"' })
    public frozenFadeTime = 9999;

    @property({ tooltip: '启用时自动从头写一遍' })
    public autoStart = true;

    private streak: MotionStreak | null = null;
    private points: Vec3[] = [];
    private arc: number[] = [];
    private totalLength = 0;
    private traveled = 0;
    private done = false;
    private delayLeft = 0;

    protected onLoad(): void {
        this.streak = this.getComponent(MotionStreak);
        this.rebuild();
    }

    protected onEnable(): void {
        if (this.autoStart) {
            this.restart();
        }
    }

    /** 重新生成整条拖尾：先 reset 清干净，再从头跑一遍。 */
    public restart(): void {
        if (this.streak) {
            this.streak.reset();
            if (this.freezeAfterFinish) {
                // 生成阶段也要让它活着（0 = 立刻过期，会把拖尾清掉）
                this.streak.fadeTime = this.frozenFadeTime;
            }
        }
        this.traveled = 0;
        this.done = false;
        this.delayLeft = Math.max(0, this.startDelay);
        this.placeAt(0);
    }

    /** 重新从路径控制点采样（改过 P0..Pn 之后调用）。 */
    public rebuild(): void {
        this.points = [];
        this.arc = [0];
        this.totalLength = 0;

        const root = this.resolvePathRoot();
        if (!root) {
            return;
        }

        const controls: Vec3[] = [];
        for (const child of root.children) {
            if (child.name.indexOf('Brush') === 0 || child.name.indexOf('Ink') === 0) {
                continue;
            }
            controls.push(this.toParentSpace(child.getWorldPosition()));
        }
        if (controls.length < 2) {
            return;
        }

        const segments = catmullRomToBezier(controls);
        const per = Math.max(4, Math.floor(this.samplesPerSegment));
        for (let i = 0; i < segments.length; i += 1) {
            for (let s = 0; s < per; s += 1) {
                const seg = segments[i];
                this.points.push(sampleCubicBezier(seg.p0, seg.p1, seg.p2, seg.p3, s / per));
            }
        }
        this.points.push(segments[segments.length - 1].p3.clone());

        for (let i = 1; i < this.points.length; i += 1) {
            this.arc.push(this.arc[i - 1] + Vec3.distance(this.points[i - 1], this.points[i]));
        }
        this.totalLength = this.arc[this.arc.length - 1] || 0;
    }

    protected update(dt: number): void {
        if (this.done || this.totalLength <= 0) {
            return;
        }
        if (this.delayLeft > 0) {
            this.delayLeft -= dt;
            return;
        }

        // 子步推进：一帧内最多细分 maxSubSteps 次，急弯处也能保住采样密度
        const steps = Math.max(1, Math.min(Math.floor(this.maxSubSteps), 8));
        const slice = dt / steps;
        for (let i = 0; i < steps; i += 1) {
            if (this.done) {
                break;
            }
            const speed = this.speedAt(this.traveled);
            this.traveled += speed * slice;
            if (this.traveled >= this.totalLength) {
                this.traveled = this.totalLength;
                this.placeAt(this.totalLength);
                this.done = true;
                if (this.streak && this.freezeAfterFinish) {
                    this.streak.fadeTime = this.frozenFadeTime;   // 冻结：不再淡出
                }
                return;
            }
            this.placeAt(this.traveled);
        }
    }

    /** 曲率自适应速度：直线接近 straightSpeed，急弯降到 turnSpeed。 */
    private speedAt(distance: number): number {
        const k = this.curvatureAtDistance(distance);
        // t: 0 = 直，1 = 弯。用 1/(1+k·gain) 让过渡平滑
        const bend = 1 / (1 + k * this.curvatureGain);
        const curve = smoothstep(0, 1, bend);
        return this.turnSpeed + (this.straightSpeed - this.turnSpeed) * curve;
    }

    /** 取指定弧长处的曲率（用采样点查表 + 相邻插值）。 */
    private curvatureAtDistance(distance: number): number {
        const count = this.points.length;
        if (count < 3) {
            return 0;
        }
        const clamped = Math.max(0, Math.min(this.totalLength, distance));
        let index = 0;
        while (index < this.arc.length - 2 && this.arc[index + 1] < clamped) {
            index += 1;
        }
        const k1 = curvatureAt(this.points, index);
        const k2 = curvatureAt(this.points, Math.min(count - 2, index + 1));
        const span = (this.arc[index + 1] - this.arc[index]) || 1;
        const f = Math.max(0, Math.min(1, (clamped - this.arc[index]) / span));
        return k1 + (k2 - k1) * f;
    }

    /** 把节点挪到弧长 distance 对应的位置。 */
    private placeAt(distance: number): void {
        if (this.points.length === 0) {
            return;
        }
        const clamped = Math.max(0, Math.min(this.totalLength, distance));
        let index = 0;
        while (index < this.arc.length - 2 && this.arc[index + 1] < clamped) {
            index += 1;
        }
        const from = this.points[index];
        const to = this.points[Math.min(this.points.length - 1, index + 1)];
        const span = (this.arc[index + 1] - this.arc[index]) || 1;
        const f = Math.max(0, Math.min(1, (clamped - this.arc[index]) / span));
        this.node.setPosition(
            from.x + (to.x - from.x) * f,
            from.y + (to.y - from.y) * f,
            0
        );
    }

    private resolvePathRoot(): Node | null {
        const configured = this.pathRoot as unknown as Node;
        if (configured && configured.isValid) {
            return configured;
        }
        const parent = this.node.parent;
        return parent ? parent.getChildByName('Path') : null;
    }

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
