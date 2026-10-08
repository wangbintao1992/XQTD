import {
    _decorator,
    Node,
    Sprite,
    SpriteFrame,
    UITransform,
    Vec3,
    resources,
} from 'cc';
import { sampleSpline } from './PathSpline';

const { ccclass, property } = _decorator;

/**
 * 沿路径生成一条**连续的带状网格**（ribbon），一笔到底铺满整张笔触纹理。
 *
 * 相比 BrushPath（把曲线切成很多段 Sprite）：
 * - 顶点连续，没有段与段的矩形接缝，也没有"每段重复同一花纹"的百叶窗感；
 * - UV 沿弧长 0→1 只铺一次纹理，所以是"一笔到底"，可以带起收笔浓淡；
 * - 顶点侧带低频粗细扰动，模拟毛笔的粗细变化。
 *
 * 实现上继承 Sprite，复用它的 assembler / 材质 / 纹理 / 合批，只自己写顶点。
 *
 * ⚠️ 关键：编辑器场景视图**不会**驱动 `_updateRenderData()`（实测调用 0 次），
 * 所以几何生成放在 `_render()` 里做兜底，否则编辑器里看不到任何东西。
 */
@ccclass('BrushRibbon')
export class BrushRibbon extends Sprite {
    @property({ type: Node, tooltip: '路径根节点（子节点 = 控制点）；留空则找同级名为 Path 的节点' })
    public pathRoot: Node | null = null;

    @property({ tooltip: '笔触纹理在 resources 下的路径（编辑器里请把纹理拖到 Sprite Frame 上）' })
    public ribbonResourcePath = 'textures/brush/spriteFrame';

    @property({ tooltip: '每个控制点之间的采样段数（越大越平滑）' })
    public samplesPerSegment = 8;

    @property({ tooltip: '笔触宽度（设计单位）' })
    public ribbonWidth = 46;

    @property({ tooltip: '低频粗细扰动幅度（0 = 粗细恒定，0.3 左右比较像毛笔）' })
    public widthWobble = 0.16;

    @property({ tooltip: '沿整条路径的粗细波动次数' })
    public wobbleWaves = 3;

    @property({ tooltip: '纹理沿路径重复次数（1 = 只铺一次，一笔到底；>1 会让纹理更细密）' })
    public uvRepeat = 1;

    /** Sprite 版（BrushPath）生成的段节点前缀，读控制点时忽略。 */
    private segmentPrefixToIgnore = 'Brush';

    private geometryDirty = true;

    /** 重新生成网格（路点或参数改了之后调用）。 */
    public refresh(): void {
        this.geometryDirty = true;
        this.markForUpdateRenderData();
    }

    protected onEnable(): void {
        this.ensureFrame();
        this.geometryDirty = true;
        this.markForUpdateRenderData();
    }

    /** 引擎的脏标记流程（运行时走这条）。 */
    protected _updateRenderData(): void {
        this.buildGeometry();
    }

    /**
     * 渲染提交前的兜底：编辑器场景视图不调用 _updateRenderData()，
     * 在这里确保顶点已经写好，否则编辑器里看不到这条笔触。
     */
    protected _render(render: any): void {
        if (this.geometryDirty) {
            this.buildGeometry();
        }
        super._render(render);
    }

    /** 把曲线写成一条带状网格。 */
    private buildGeometry(): void {
        const renderData = this.requestRenderData();
        renderData.clear();

        const frame = this.spriteFrame;
        const root = this.resolvePathRoot();
        if (!frame || !root) {
            renderData.resize(0, 0);
            renderData.vertDirty = true;
            return; // 保持 dirty，等纹理/路径就绪后重试
        }

        const controls: Vec3[] = [];
        for (const child of root.children) {
            // 忽略 BrushPath（Sprite 版）生成的段节点
            if (child.name.indexOf(this.segmentPrefixToIgnore) === 0) {
                continue;
            }
            controls.push(this.toLocalSpace(child.getWorldPosition()));
        }
        if (controls.length < 2) {
            renderData.resize(0, 0);
            renderData.vertDirty = true;
            return;
        }

        const points = sampleSpline(controls, this.samplesPerSegment);
        const count = points.length;

        // 累计弧长 -> uv.x
        const arc: number[] = new Array(count);
        arc[0] = 0;
        for (let i = 1; i < count; i += 1) {
            arc[i] = arc[i - 1] + Vec3.distance(points[i - 1], points[i]);
        }
        const total = arc[count - 1] || 1;

        renderData.resize(count * 2, (count - 1) * 6);
        // 覆盖顶点写入后，Sprite 不会再帮我们绑纹理，这里必须自己设。
        renderData.frame = frame;
        // Cocos 3.8 走静态 VB：顶点数据在 MeshBuffer 里，renderData.vData 通常为空。
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
        // UIRenderer.color 是 0~255，而 UI 顶点色要 0~1；两种表示都兼容一下。
        const cr = color.r > 1 ? color.r / 255 : color.r;
        const cg = color.g > 1 ? color.g / 255 : color.g;
        const cb = color.b > 1 ? color.b / 255 : color.b;
        const ca = color.a > 1 ? color.a / 255 : color.a;

        const half = this.ribbonWidth * 0.5;
        const floatStride = (renderData as any).floatStride || 9;
        let vi = 0;

        for (let i = 0; i < count; i += 1) {
            const point = points[i];
            const prev = points[i > 0 ? i - 1 : i];
            const next = points[i < count - 1 ? i + 1 : i];

            let tx = next.x - prev.x;
            let ty = next.y - prev.y;
            const len = Math.sqrt(tx * tx + ty * ty) || 1;
            tx /= len;
            ty /= len;
            // 法线（左手边）
            const nx = -ty;
            const ny = tx;

            const u = arc[i] / total;
            const wobble = 1 + this.widthWobble * Math.sin(u * Math.PI * 2 * this.wobbleWaves);
            const width = half * wobble;
            const uvx = u * this.uvRepeat;

            // 左边缘
            vData[vi] = point.x + nx * width;
            vData[vi + 1] = point.y + ny * width;
            vData[vi + 2] = 0;
            if (floatStride >= 9) {
                vData[vi + 3] = uvx;
                vData[vi + 4] = 0;
                vData[vi + 5] = cr;
                vData[vi + 6] = cg;
                vData[vi + 7] = cb;
                vData[vi + 8] = ca;
            }
            vi += floatStride;

            // 右边缘
            vData[vi] = point.x - nx * width;
            vData[vi + 1] = point.y - ny * width;
            vData[vi + 2] = 0;
            if (floatStride >= 9) {
                vData[vi + 3] = uvx;
                vData[vi + 4] = 1;
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

        // 3.8 用静态 VB：必须显式声明 1 段 draw info，并刷新纹理 hash，否则 batcher 会跳过提交。
        renderData.dataLength = 1;
        if (typeof (renderData as any).updateTexture === 'function') {
            (renderData as any).updateTexture(frame);
        }
        renderData.vertDirty = true;
        this.geometryDirty = false;
    }

    private ensureFrame(): void {
        if (this.spriteFrame) {
            return;
        }
        resources.load(this.ribbonResourcePath, SpriteFrame, (err, loaded) => {
            if (err || !loaded) {
                return;
            }
            this.spriteFrame = loaded;
            this.geometryDirty = true;
            this.markForUpdateRenderData();
        });
    }

    private resolvePathRoot(): Node | null {
        const configured = this.pathRoot as unknown as Node;
        if (configured && typeof configured.getChildByName === 'function') {
            return configured;
        }
        const parent = this.node.parent;
        return parent ? parent.getChildByName('Path') : null;
    }

    /** 世界坐标 -> 本组件节点的局部坐标（UI 顶点就是节点局部空间）。 */
    private toLocalSpace(world: Vec3): Vec3 {
        const transform = this.node.getComponent(UITransform);
        if (transform) {
            const local = transform.convertToNodeSpaceAR(world);
            return new Vec3(local.x, local.y, 0);
        }
        return world.clone();
    }
}
