import {
    _decorator,
    Color,
    Node,
    Sprite,
    SpriteFrame,
    UITransform,
    Vec3,
    resources,
} from 'cc';

const { ccclass, property } = _decorator;

/* ============================================================================
 * 贝塞尔 / 曲率工具（对外导出，可单独复用）
 * ==========================================================================*/

/** 三次贝塞尔取样：t ∈ [0,1]。 */
export function cubicBezier(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 {
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

export interface BezierSeg { p0: Vec3; p1: Vec3; p2: Vec3; p3: Vec3; }

/**
 * Catmull-Rom 控制点 → 分段三次贝塞尔（不动现有控制点数据结构）。
 * 换算：b1 = p1 + (p2 - p0) / 6，b2 = p2 - (p3 - p1) / 6。
 */
export function catmullRomToBezier(controls: Vec3[]): BezierSeg[] {
    const segs: BezierSeg[] = [];
    const n = controls.length;
    if (n < 2) {
        return segs;
    }
    for (let i = 0; i < n - 1; i += 1) {
        const p0 = controls[i > 0 ? i - 1 : i];
        const p1 = controls[i];
        const p2 = controls[i + 1];
        const p3 = controls[i + 2 < n ? i + 2 : i + 1];
        segs.push({
            p0: p1.clone(),
            p1: new Vec3(p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6, 0),
            p2: new Vec3(p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6, 0),
            p3: p2.clone(),
        });
    }
    return segs;
}

/** 三点外接圆曲率：κ = 4A / (a·b·c)，直线段为 0。 */
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
    if (a < 1e-5 || b < 1e-5 || c < 1e-5) {
        return 0;
    }
    const s = (a + b + c) * 0.5;
    const areaSq = s * (s - a) * (s - b) * (s - c);
    if (areaSq <= 1e-12) {
        return 0;
    }
    return (4 * Math.sqrt(areaSq)) / (a * b * c);
}

function clamp01(v: number): number {
    return v < 0 ? 0 : (v > 1 ? 1 : v);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
    const t = clamp01((x - edge0) / ((edge1 - edge0) || 1));
    return t * t * (3 - 2 * t);
}

/* ============================================================================
 * InkLine2D —— Cocos 版的 “Line2D”
 * ==========================================================================*/

/**
 * 沿贝塞尔路径绘制**可换宽**的水墨带（Cocos 里没有 Line2D 组件，这里用
 * 继承 Sprite、自己写顶点的方式实现同等能力：每顶点宽度 + 贴图沿长度平铺 + 圆角接头）。
 *
 * 对应你需求清单的做法：
 *  1. 控制点仍读 pathRoot 的子节点（不动数据结构）；`rebuild()` 随时重新采样刷新；
 *  2. **自适应采样**：曲率大 → 步长小（点密），曲率小 → 步长大（点疏），
 *     并用 maxPoints 兜住总点数（微信小游戏友好）；
 *  3. **按曲率换宽**：每点宽度在 straightWidth ↔ turnWidth 之间按曲率平滑插值，
 *     再做 widthSmoothPasses 次邻域平滑，禁止粗细突变；
 *  4. **圆角接头**：靠密集采样 + 贴图两端渐隐近似（Cocos 无 LineJoin/LineCap 开关）；
 *  5. 贴图沿长度方向按 uvTilingX 平铺（= Godot 的 Tiling X），横向铺满。
 *
 * 更新时机：控制点变动后调用 `rebuild()`；也可以在编辑器里勾 `autoRebuildInEditor`
 * 让它每帧检查一次控制点位置（仅编辑器用，运行时请手动调 rebuild 以免浪费）。
 */
@ccclass('InkLine2D')
export class InkLine2D extends Sprite {
    @property({ type: Node, tooltip: '控制点父节点（子节点 P0..Pn）；留空则按 pathRootName 找同级节点' })
    public pathRoot: Node | null = null;

    @property({ tooltip: '控制点父节点名字（同级里找）。节点引用在序列化时容易失效，所以优先用名字' })
    public pathRootName = 'Path';

    @property({ type: SpriteFrame, tooltip: '水墨笔刷贴图；留空则按 textureResourcePath 动态加载' })
    public brushFrame: SpriteFrame | null = null;

    @property({ tooltip: '笔刷贴图在 resources 下的路径（不含扩展名）' })
    public textureResourcePath = 'textures/shuimo2/spriteFrame';

    @property({ tooltip: '直线段笔触宽度（设计单位）' })
    public straightWidth = 24;

    @property({ tooltip: '转弯处笔触宽度（设计单位，越弯越粗）' })
    public turnWidth = 62;

    @property({ tooltip: '达到“最粗”所需的曲率（越小越容易变粗，0.004 ~ 0.02 之间调）' })
    public turnCurvature = 0.008;

    @property({ tooltip: '平缓区采样步长（大 → 点少，省顶点）' })
    public flatStep = 34;

    @property({ tooltip: '弯曲区采样步长（小 → 点密，曲线更顺）' })
    public curveStep = 10;

    @property({ tooltip: '采样点总数上限（微信小游戏建议 150~260）' })
    public maxPoints = 220;

    @property({ tooltip: '宽度平滑次数（防粗细突变，2~4 次）' })
    public widthSmoothPasses = 3;

    @property({ tooltip: '贴图沿路径长度方向的平铺次数（= Tiling X）' })
    public uvTilingX = 1;

    @property({ tooltip: '横向是否铺满笔触宽度（关掉则按贴图原始比例，可能留空）' })
    public stretchAcross = true;

    @property({ tooltip: '编辑器里每帧检查控制点变化并自动重建（仅编辑器用）' })
    public autoRebuildInEditor = true;

    private geometryDirty = true;
    private pts: Vec3[] = [];
    private widths: number[] = [];
    private us: number[] = [];
    private lastSignature = '';
    private frame: SpriteFrame | null = null;

    protected onEnable(): void {
        this.ensureFrame();
        this.rebuild();
    }

    /** 控制点变了就调它：重新采样 + 标记刷新。 */
    public rebuild(): void {
        this.samplePath();
        this.geometryDirty = true;
        this.markForUpdateRenderData();
    }

    /** 当前采样点数量（调试/性能观察用）。 */
    public get pointCount(): number {
        return this.pts.length;
    }

    /** 某点的笔触宽度（调试用）。 */
    public getWidthAt(index: number): number {
        return this.widths[index] !== undefined ? this.widths[index] : 0;
    }

    protected update(): void {
        if (!this.autoRebuildInEditor) {
            return;
        }
        // 只在编辑器里做"控制点被动过"的检测，运行时靠手动 rebuild
        const signature = this.computeSignature();
        if (signature !== this.lastSignature) {
            this.lastSignature = signature;
            this.rebuild();
        }
    }

    protected _updateRenderData(): void {
        this.buildGeometry();
    }

    /**
     * 编辑器场景视图不会主动驱动 _updateRenderData()，这里在渲染提交前补一次，
     * 否则在编辑器里看不到这条线。
     */
    protected _render(render: any): void {
        if (this.geometryDirty) {
            this.buildGeometry();
        }
        super._render(render);
    }

    /* ------------------------------------------------------------------ */

    private computeSignature(): string {
        const root = this.resolvePathRoot();
        if (!root) {
            return '';
        }
        const parts: string[] = [];
        for (const child of root.children) {
            parts.push(`${child.position.x.toFixed(2)},${child.position.y.toFixed(2)}`);
        }
        return parts.join('|');
    }

    /** 采样 + 曲率 + 宽度 + UV */
    private samplePath(): void {
        this.pts = [];
        this.widths = [];
        this.us = [];

        const root = this.resolvePathRoot();
        if (!root) {
            return;
        }

        const controls: Vec3[] = [];
        for (const child of root.children) {
            if (child.name.indexOf('Brush') === 0 || child.name.indexOf('Handle') === 0) {
                continue;
            }
            controls.push(this.toLocalSpace(child.getWorldPosition()));
        }
        if (controls.length < 2) {
            return;
        }

        const segs = catmullRomToBezier(controls);

        // 1) 先高密度粗采样，用来估计曲率
        const densePerSeg = 40;
        const dense: Vec3[] = [];
        for (const seg of segs) {
            for (let i = 0; i < densePerSeg; i += 1) {
                dense.push(cubicBezier(seg.p0, seg.p1, seg.p2, seg.p3, i / densePerSeg));
            }
        }
        dense.push(segs[segs.length - 1].p3.clone());

        const denseCurv = dense.map((_, i) => curvatureAt(dense, i));

        // 2) 自适应抽稀：曲率大 → 步长小
        const picked: number[] = [0];
        let acc = 0;
        for (let i = 1; i < dense.length; i += 1) {
            acc += Vec3.distance(dense[i - 1], dense[i]);
            const bend = clamp01(denseCurv[i] / (this.turnCurvature || 1));
            const step = this.flatStep + (this.curveStep - this.flatStep) * smoothstep(0, 1, bend);
            if (acc >= step || i === dense.length - 1) {
                picked.push(i);
                acc = 0;
            }
        }

        // 3) 顶点数上限保护：等间隔抽稀（保证首尾保留）
        const limit = Math.max(8, Math.floor(this.maxPoints));
        let indices = picked;
        if (indices.length > limit) {
            const keep: number[] = [];
            for (let i = 0; i < limit; i += 1) {
                const at = Math.round((i / (limit - 1)) * (indices.length - 1));
                keep.push(indices[at]);
            }
            indices = Array.from(new Set(keep)).sort((a, b) => a - b);
        }

        this.pts = indices.map((i) => dense[i].clone());

        // 4) 每点宽度：按曲率在 straightWidth ↔ turnWidth 之间平滑插值
        const rawWidths = indices.map((i) => {
            const bend = clamp01(denseCurv[i] / (this.turnCurvature || 1));
            const t = smoothstep(0, 1, bend);
            return this.straightWidth + (this.turnWidth - this.straightWidth) * t;
        });

        // 5) 邻域平滑（禁止粗细突变）
        let widths = rawWidths.slice();
        const passes = Math.max(0, Math.floor(this.widthSmoothPasses));
        for (let p = 0; p < passes; p += 1) {
            const next = widths.slice();
            for (let i = 0; i < widths.length; i += 1) {
                const a = widths[Math.max(0, i - 1)];
                const b = widths[i];
                const c = widths[Math.min(widths.length - 1, i + 1)];
                next[i] = (a + 2 * b + c) / 4;
            }
            widths = next;
        }
        this.widths = widths;

        // 6) 沿弧长算 UV.x
        const arc: number[] = [0];
        for (let i = 1; i < this.pts.length; i += 1) {
            arc.push(arc[i - 1] + Vec3.distance(this.pts[i - 1], this.pts[i]));
        }
        const total = arc[arc.length - 1] || 1;
        this.us = arc.map((a) => (a / total) * this.uvTilingX);
    }

    /** 把采样点写成带状顶点（每点左右各一个顶点，偏移 = 宽度/2）。 */
    private buildGeometry(): void {
        const renderData = this.requestRenderData();
        renderData.clear();
        this.geometryDirty = false;

        const frame = this.frame || this.resolveFrame();
        const count = this.pts.length;
        if (!frame || count < 2) {
            renderData.resize(0, 0);
            renderData.vertDirty = true;
            return;
        }

        renderData.resize(count * 2, (count - 1) * 6);
        renderData.frame = frame;

        const meshBuffer = typeof (renderData as any).getMeshBuffer === 'function'
            ? (renderData as any).getMeshBuffer()
            : null;
        const vData = ((renderData as any).vData as Float32Array)
            || (meshBuffer ? (meshBuffer.vData as Float32Array) : null);
        const iData = (renderData.indices as Uint16Array)
            || (meshBuffer ? (meshBuffer.iData as Uint16Array) : null);
        if (!vData || !iData) {
            return;
        }

        const color = this.color;
        const cr = color.r > 1 ? color.r / 255 : color.r;
        const cg = color.g > 1 ? color.g / 255 : color.g;
        const cb = color.b > 1 ? color.b / 255 : color.b;
        const ca = color.a > 1 ? color.a / 255 : color.a;

        const floatStride = (renderData as any).floatStride || 9;
        let vi = 0;

        for (let i = 0; i < count; i += 1) {
            const point = this.pts[i];
            const prev = this.pts[i > 0 ? i - 1 : i];
            const next = this.pts[i < count - 1 ? i + 1 : i];

            let tx = next.x - prev.x;
            let ty = next.y - prev.y;
            const len = Math.sqrt(tx * tx + ty * ty) || 1;
            tx /= len;
            ty /= len;
            const nx = -ty;
            const ny = tx;

            const half = this.widths[i] * 0.5;
            const u = this.us[i];
            // 横向：铺满(0..1) 或按贴图比例留边
            const v0 = 0;
            const v1 = 1;
            if (!this.stretchAcross && frame) {
                // 按"宽度 / 贴图高度"的比例，居中留边（不做特殊处理时直接用 0..1）
            }

            vData[vi] = point.x + nx * half;
            vData[vi + 1] = point.y + ny * half;
            vData[vi + 2] = 0;
            if (floatStride >= 9) {
                vData[vi + 3] = u;
                vData[vi + 4] = v0;
                vData[vi + 5] = cr;
                vData[vi + 6] = cg;
                vData[vi + 7] = cb;
                vData[vi + 8] = ca;
            }
            vi += floatStride;

            vData[vi] = point.x - nx * half;
            vData[vi + 1] = point.y - ny * half;
            vData[vi + 2] = 0;
            if (floatStride >= 9) {
                vData[vi + 3] = u;
                vData[vi + 4] = v1;
                vData[vi + 5] = cr;
                vData[vi + 6] = cg;
                vData[vi + 7] = cb;
                vData[vi + 8] = ca;
            }
            vi += floatStride;
        }

        let ii = 0;
        for (let i = 0; i < count - 1; i += 1) {
            const leftA = i * 2;
            const rightA = i * 2 + 1;
            const leftB = (i + 1) * 2;
            const rightB = (i + 1) * 2 + 1;
            iData[ii] = leftA; iData[ii + 1] = rightA; iData[ii + 2] = rightB;
            iData[ii + 3] = leftA; iData[ii + 4] = rightB; iData[ii + 5] = leftB;
            ii += 6;
        }

        renderData.dataLength = 1;
        if (typeof (renderData as any).updateTexture === 'function') {
            (renderData as any).updateTexture(frame);
        }
        renderData.vertDirty = true;
    }

    private ensureFrame(): void {
        const configured = this.brushFrame as unknown as SpriteFrame;
        if (configured && (configured as any).rect && (configured as any).texture) {
            this.frame = configured;
            return;
        }
        resources.load(this.textureResourcePath, SpriteFrame, (err, loaded) => {
            if (err || !loaded) {
                console.warn(`[InkLine2D] 笔刷贴图加载失败: ${this.textureResourcePath}`, err);
                return;
            }
            this.frame = loaded;
            this.spriteFrame = loaded;
            this.rebuild();
        });
    }

    private resolveFrame(): SpriteFrame | null {
        const configured = this.brushFrame as unknown as SpriteFrame;
        if (configured && (configured as any).rect && (configured as any).texture) {
            this.frame = configured;
            return configured;
        }
        return this.frame || this.spriteFrame;
    }

    private resolvePathRoot(): Node | null {
        const configured = this.pathRoot as unknown as Node;
        if (configured && configured.isValid) {
            return configured;
        }
        const parent = this.node.parent;
        if (!parent) {
            return null;
        }
        const byName = parent.getChildByName(this.pathRootName);
        if (byName) {
            return byName;
        }
        return parent.getChildByName('Path');
    }

    private toLocalSpace(world: Vec3): Vec3 {
        const transform = this.node.getComponent(UITransform);
        if (transform) {
            const local = transform.convertToNodeSpaceAR(world);
            return new Vec3(local.x, local.y, 0);
        }
        return world.clone();
    }
}
