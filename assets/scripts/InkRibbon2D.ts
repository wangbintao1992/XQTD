import {
    _decorator,
    Material,
    Node,
    SpriteFrame,
    UIRenderer,
    UITransform,
    Vec3,
    builtinResMgr,
    resources,
} from 'cc';
import { catmullRomToBezier, cubicBezier, curvatureAt } from './InkLine2D';

const { ccclass, property } = _decorator;

/* ============================================================================
 * 最小 assembler
 * UIRenderer 是抽象基类，自己没有 assembler；这里给一个最小的，
 * 让组件把自己的 RenderData 直接提交给 2D batcher（不做额外填充）。
 * ==========================================================================*/
const InkRibbonAssembler = {
    // ⚠️ IAssemblerManager 接口必须有 getAssembler；缺了它引擎取 assembler 时会崩（踩过）
    getAssembler(): any {
        return InkRibbonAssembler;
    },
    createData(comp: any): void {
        comp.requestRenderData();
    },
    updateRenderData(comp: any): void {
        if (typeof comp.buildGeometry === 'function') {
            comp.buildGeometry();
        }
    },
    fillBuffers(comp: any, render: any): void {
        const data = comp.renderData;
        if (!data || !data.vertexCount) {
            return;
        }
        // assembler 传 null：数据已经由 buildGeometry 写好了，这里只提交
        render.commitComp(comp, data, data.frame, null, comp.node);
    },
};

function clamp01(v: number): number {
    return v < 0 ? 0 : (v > 1 ? 1 : v);
}

function smoothstep(x: number): number {
    const t = clamp01(x);
    return t * t * (3 - 2 * t);
}

/** 绕原点旋转向量 */
function rotateVec(x: number, y: number, rad: number): { x: number; y: number } {
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    return { x: x * c - y * s, y: x * s + y * c };
}

/**
 * 国画水墨带状路径（自定义 UIRenderer 子类，2D）。
 *
 * 对应需求：
 *  1. 控制点读 pathRoot 的子节点，可拖拽移动/增删（配合 InkControlEditor），改动 → rebuild()；
 *  2. 自适应采样：先高密度估曲率，再按曲率抽稀（弯密直疏），maxPoints 兜住总点数；
 *  3. 每个采样点按曲率算宽度（straightWidth ↔ turnWidth），再做邻域平滑，无突变；
 *  4. **圆角端点 + 圆角拐角**：端点补半圆，拐角在法线之间插入圆弧顶点 → 无尖角、无拼接缝；
 *  5/6. 贴图沿路径平铺（uvTilingX），材质用内置 ui-sprite-material（Unlit + Alpha + Texture）。
 */
@ccclass('InkRibbon2D')
export class InkRibbon2D extends UIRenderer {
    static Assembler = InkRibbonAssembler;

    @property({ type: Node, tooltip: '控制点父节点；留空则按 pathRootName 找同级节点' })
    public pathRoot: Node | null = null;

    @property({ tooltip: '控制点父节点名字（节点引用序列化易失效，所以优先按名字找）' })
    public pathRootName = 'Path2';

    @property({ type: SpriteFrame, tooltip: '横向长条水墨笔刷贴图' })
    public brushFrame: SpriteFrame | null = null;

    @property({ tooltip: '笔刷贴图在 resources 下的路径（不含扩展名）' })
    public textureResourcePath = 'textures/shuimo2/spriteFrame';

    @property({ tooltip: '直线段笔触宽度（细）' })
    public straightWidth = 24;

    @property({ tooltip: '转弯处笔触宽度（粗）' })
    public turnWidth = 62;

    @property({ tooltip: '达到“最粗”的曲率阈值（越小越容易变粗）' })
    public turnCurvature = 0.008;

    @property({ tooltip: '平缓区采样步长（大 → 点少）' })
    public flatStep = 36;

    @property({ tooltip: '弯曲区采样步长（小 → 点密）' })
    public curveStep = 12;

    @property({ tooltip: '采样点总数上限（控制顶点预算，微信小游戏建议 ≤ 160）' })
    public maxPoints = 160;

    @property({ tooltip: '宽度平滑次数（防粗细突变）' })
    public widthSmoothPasses = 3;

    @property({ tooltip: '贴图沿长度平铺次数（Tiling X；整笔素材建议 1）' })
    public uvTilingX = 1;

    @property({ tooltip: '圆角端点（半圆笔头）' })
    public roundCap = true;

    @property({ tooltip: '圆角拐角（圆弧填角，消除尖角）' })
    public roundJoin = true;

    @property({ tooltip: '端点半圆的段数' })
    public capArcSegments = 6;

    @property({ tooltip: '拐角圆弧的最大段数（每侧）' })
    public joinArcSegments = 4;

    @property({ tooltip: '超过这个转角才插入圆弧（度）' })
    public joinAngleThreshold = 6;

    private pts: Vec3[] = [];
    private widths: number[] = [];
    private us: number[] = [];
    private geometryDirty = true;
    private frame: SpriteFrame | null = null;

    /* ---------------- 生命周期 ---------------- */

    protected onLoad(): void {
        this._flushAssembler();
        this.ensureFrame();
        this.rebuild();
    }

    protected onEnable(): void {
        this.markForUpdateRenderData();
    }

    protected _flushAssembler(): void {
        this._assembler = InkRibbonAssembler as any;
        this._postAssembler = null;
    }

    protected _updateBuiltinMaterial(): Material {
        return builtinResMgr.get<Material>('ui-sprite-material')!;
    }

    /** 引擎的脏标记流程（运行时走这条）。 */
    protected _updateRenderData(): void {
        this.buildGeometry();
    }

    /**
     * 编辑器场景视图不会主动驱动 _updateRenderData()，
     * 所以在渲染提交前补一次，保证编辑器里也能看到。
     */
    protected _render(render: any): void {
        if (this.geometryDirty) {
            this.buildGeometry();
        }
        super._render(render);
    }

    /* ---------------- 对外接口 ---------------- */

    /** 控制点改动后调用：重新采样 + 重建网格。 */
    public rebuild(): void {
        this.samplePath();
        this.geometryDirty = true;
        this.markForUpdateRenderData();
    }

    public get pointCount(): number {
        return this.pts.length;
    }

    public getWidthAt(index: number): number {
        return this.widths[index] !== undefined ? this.widths[index] : 0;
    }

    /* ---------------- 采样 ---------------- */

    /** 贝塞尔自适应采样 + 曲率宽度 + UV。 */
    public samplePath(): void {
        this.pts = [];
        this.widths = [];
        this.us = [];

        const root = this.resolvePathRoot();
        if (!root) {
            return;
        }

        const controls: Vec3[] = [];
        for (const child of root.children) {
            if (child.name.indexOf('Handle') === 0) {
                continue;
            }
            controls.push(this.toLocalSpace(child.getWorldPosition()));
        }
        if (controls.length < 2) {
            return;
        }

        const segs = catmullRomToBezier(controls);

        // 1) 高密度粗采样，用于估曲率
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
            const step = this.flatStep + (this.curveStep - this.flatStep) * smoothstep(bend);
            if (acc >= step || i === dense.length - 1) {
                picked.push(i);
                acc = 0;
            }
        }

        // 3) 顶点预算保护：等间隔抽稀
        const limit = Math.max(8, Math.floor(this.maxPoints));
        let indices = picked;
        if (indices.length > limit) {
            const keep: number[] = [];
            for (let i = 0; i < limit; i += 1) {
                keep.push(indices[Math.round((i / (limit - 1)) * (indices.length - 1))]);
            }
            indices = Array.from(new Set(keep)).sort((a, b) => a - b);
        }
        this.pts = indices.map((i) => dense[i].clone());

        // 4) 曲率 → 宽度
        const rawWidths = indices.map((i) => {
            const bend = clamp01(denseCurv[i] / (this.turnCurvature || 1));
            return this.straightWidth + (this.turnWidth - this.straightWidth) * smoothstep(bend);
        });
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

        // 5) 弧长 → UV.x
        const arc: number[] = [0];
        for (let i = 1; i < this.pts.length; i += 1) {
            arc.push(arc[i - 1] + Vec3.distance(this.pts[i - 1], this.pts[i]));
        }
        const total = arc[arc.length - 1] || 1;
        this.us = arc.map((a) => (a / total) * this.uvTilingX);
    }

    /* ---------------- 网格生成 ---------------- */

    /** 生成左/右边界（含圆角端点与圆角拐角），再三角化。 */
    public buildGeometry(): void {
        const renderData = this.requestRenderData();
        renderData.clear();
        this.geometryDirty = false;

        const frame = this.frame || this.resolveFrame();
        const n = this.pts.length;
        if (!frame || n < 2) {
            renderData.resize(0, 0);
            renderData.vertDirty = true;
            return;
        }

        // 1) 左右边界顶点（成对，数量一致，方便三角化）
        const left: Vec3[] = [];
        const right: Vec3[] = [];
        const leftU: number[] = [];
        const rightU: number[] = [];

        const threshold = (this.joinAngleThreshold * Math.PI) / 180;
        const maxJoin = Math.max(0, Math.floor(this.joinArcSegments));

        for (let i = 0; i < n; i += 1) {
            const point = this.pts[i];
            const half = this.widths[i] * 0.5;
            const tan = this.tangentAt(i);
            const nx = -tan.y;
            const ny = tan.x;
            const u = this.us[i];

            // 拐角圆弧：在上一段的法线到当前法线之间插值
            if (i > 0 && this.roundJoin && maxJoin > 0) {
                const prevTan = this.tangentAt(i - 1);
                const npx = -prevTan.y;
                const npy = prevTan.x;
                const dot = Math.max(-1, Math.min(1, npx * nx + npy * ny));
                const delta = Math.acos(dot);
                if (delta > threshold) {
                    const steps = Math.max(1, Math.min(maxJoin, Math.round(delta / (Math.PI / 16))));
                    for (let s = 1; s <= steps; s += 1) {
                        const t = s / (steps + 1);
                        const rot = rotateVec(npx, npy, delta * t);
                        left.push(new Vec3(point.x + rot.x * half, point.y + rot.y * half, 0));
                        right.push(new Vec3(point.x - rot.x * half, point.y - rot.y * half, 0));
                        leftU.push(u);
                        rightU.push(u);
                    }
                }
            }

            left.push(new Vec3(point.x + nx * half, point.y + ny * half, 0));
            right.push(new Vec3(point.x - nx * half, point.y - ny * half, 0));
            leftU.push(u);
            rightU.push(u);
        }

        // 2) 圆角端点：在首尾各补一个半圆（以端点为圆心，半径 = 该端宽度/2）
        const capSteps = this.roundCap ? Math.max(0, Math.floor(this.capArcSegments)) : 0;
        if (capSteps > 0) {
            // 起点：从 -法线 绕到 +法线（朝路径外侧）
            const p0 = this.pts[0];
            const half0 = this.widths[0] * 0.5;
            const t0 = this.tangentAt(0);
            const back = Math.atan2(-t0.y, -t0.x);
            for (let s = capSteps; s >= 1; s -= 1) {
                const ang = back + (Math.PI * s) / capSteps;
                const x = p0.x + Math.cos(ang) * half0;
                const y = p0.y + Math.sin(ang) * half0;
                left.unshift(new Vec3(x, y, 0));
                right.unshift(new Vec3(x, y, 0));
                leftU.unshift(this.us[0]);
                rightU.unshift(this.us[0]);
            }
            // 终点
            const pl = this.pts[n - 1];
            const halfL = this.widths[n - 1] * 0.5;
            const tl = this.tangentAt(n - 1);
            const fwd = Math.atan2(tl.y, tl.x);
            const uEnd = this.us[n - 1];
            for (let s = 1; s <= capSteps; s += 1) {
                const ang = fwd - (Math.PI * s) / capSteps;
                const x = pl.x + Math.cos(ang) * halfL;
                const y = pl.y + Math.sin(ang) * halfL;
                left.push(new Vec3(x, y, 0));
                right.push(new Vec3(x, y, 0));
                leftU.push(uEnd);
                rightU.push(uEnd);
            }
        }

        // 3) 三角化：左右一一对应
        const count = left.length;
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
            const l = left[i];
            const r = right[i];
            vData[vi] = l.x; vData[vi + 1] = l.y; vData[vi + 2] = 0;
            if (floatStride >= 9) {
                vData[vi + 3] = leftU[i]; vData[vi + 4] = 0;
                vData[vi + 5] = cr; vData[vi + 6] = cg; vData[vi + 7] = cb; vData[vi + 8] = ca;
            }
            vi += floatStride;

            vData[vi] = r.x; vData[vi + 1] = r.y; vData[vi + 2] = 0;
            if (floatStride >= 9) {
                vData[vi + 3] = rightU[i]; vData[vi + 4] = 1;
                vData[vi + 5] = cr; vData[vi + 6] = cg; vData[vi + 7] = cb; vData[vi + 8] = ca;
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

    /* ---------------- 辅助 ---------------- */

    /** 第 i 个采样点的单位切线。 */
    private tangentAt(index: number): { x: number; y: number } {
        const n = this.pts.length;
        const prev = this.pts[Math.max(0, index - 1)];
        const next = this.pts[Math.min(n - 1, index + 1)];
        let tx = next.x - prev.x;
        let ty = next.y - prev.y;
        const len = Math.sqrt(tx * tx + ty * ty) || 1;
        tx /= len;
        ty /= len;
        return { x: tx, y: ty };
    }

    private ensureFrame(): void {
        const configured = this.brushFrame as unknown as SpriteFrame;
        if (configured && (configured as any).rect && (configured as any).texture) {
            this.frame = configured;
            return;
        }
        resources.load(this.textureResourcePath, SpriteFrame, (err, loaded) => {
            if (err || !loaded) {
                console.warn(`[InkRibbon2D] 笔刷贴图加载失败: ${this.textureResourcePath}`, err);
                return;
            }
            this.frame = loaded;
            this.rebuild();
        });
    }

    private resolveFrame(): SpriteFrame | null {
        const configured = this.brushFrame as unknown as SpriteFrame;
        if (configured && (configured as any).rect && (configured as any).texture) {
            this.frame = configured;
            return configured;
        }
        return this.frame;
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
        return parent.getChildByName(this.pathRootName) || parent.getChildByName('Path');
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
