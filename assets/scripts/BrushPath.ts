import {
    _decorator,
    Color,
    Component,
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
 * 沿 Path 的路点铺一条水墨笔触（路径的外观）。
 *
 * 做法：把路点用 Catmull-Rom 采样成密集曲线，每两个采样点之间放一段 Sprite
 * （Type = TILED，用横向无缝的笔触纹理平铺），按切线方向旋转，每段两端各延长
 * overlap 单位来掩盖拐弯处的楔形缝隙。
 *
 * "一笔挥就"的感觉靠两点做出来：
 *   1) 每段的**宽度**沿弧长按 sin 弧线变化（起笔细 → 中段粗 → 收笔细）；
 *   2) 每段的**墨色浓淡**同步变化（两端淡、中段浓）。
 * 所以纹理本身要横向平缓（它只负责毛笔的毛边质感），粗细与浓淡由这里控制。
 *
 * PathMover 用同一份曲线采样，所以"看起来的路径"和"实际走的路径"一致。
 */
@ccclass('BrushPath')
export class BrushPath extends Component {
    @property({ type: Node, tooltip: '路径根节点（子节点 = 控制点）；留空则找同级名为 Path 的节点' })
    public pathRoot: Node | null = null;

    @property({ type: SpriteFrame, tooltip: '笔触纹理；留空则按 brushResourcePath 动态加载' })
    public brushFrame: SpriteFrame | null = null;

    @property({ tooltip: '笔触纹理在 resources 下的路径（不含扩展名）' })
    public brushResourcePath = 'textures/brush/spriteFrame';

    @property({ type: Node, tooltip: '生成的笔触段挂到哪个节点下；留空则自动建同级 "Brush" 容器' })
    public container: Node | null = null;

    @property({ tooltip: '每两个控制点之间的采样段数（越大越平滑，节点也越多）' })
    public samplesPerSegment = 10;

    @property({ tooltip: '笔触宽度：中段最粗处的宽度（设计单位）' })
    public brushWidth = 54;

    @property({ tooltip: '起笔/收笔处的最细宽度比例（0~1，越小两头越尖）' })
    public taperRatio = 0.3;

    @property({ tooltip: '墨色浓淡幅度（0 = 均匀；0.3 表示两端比中段淡 30%）' })
    public toneVariation = 0.3;

    @property({ tooltip: '每段两端各延长一点，掩盖拐弯处段与段的缝隙（设计单位）' })
    public overlap = 6;

    @property({ tooltip: '生成物名字前缀；读控制点时会忽略以此开头的子节点' })
    public segmentPrefix = 'Brush';

    private segments: Node[] = [];
    private frame: SpriteFrame | null = null;

    protected onEnable(): void {
        if (this.resolveFrame()) {
            this.build();
            return;
        }
        resources.load(this.brushResourcePath, SpriteFrame, (err, loaded) => {
            if (err || !loaded) {
                console.warn(`[BrushPath] 笔触纹理加载失败: ${this.brushResourcePath}`, err);
                return;
            }
            this.frame = loaded;
            this.build();
        });
    }

    /** 按当前路点重新铺笔触（路点位置改了以后手动调用）。 */
    public build(): void {
        this.clear();

        const root = this.resolvePathRoot();
        const frame = this.frame || this.resolveFrame();
        if (!root || !frame || !frame.rect) {
            return;
        }
        const frameHeight = frame.rect.height;
        if (!frameHeight) {
            return;
        }

        const scale = this.brushWidth / frameHeight;
        const container = this.resolveContainer();
        const controls = this.controlPoints(root);
        if (controls.length < 2) {
            return;
        }

        const points = sampleSpline(controls, this.samplesPerSegment);

        // 累计弧长：宽度与浓淡都按"在整条路径上的位置"变化。
        const arc: number[] = [0];
        for (let i = 1; i < points.length; i += 1) {
            arc.push(arc[i - 1] + Vec3.distance(points[i - 1], points[i]));
        }
        const total = arc[arc.length - 1] || 1;

        for (let i = 0; i < points.length - 1; i += 1) {
            const from = points[i];
            const to = points[i + 1];
            const length = Vec3.distance(from, to);
            if (length <= 0.001) {
                continue;
            }

            // 用段中点的位置算权重，避免相邻段宽度突变。
            const u = (arc[i] + length * 0.5) / total;
            const bulge = Math.sin(Math.PI * Math.min(1, Math.max(0, u)));
            const widthRatio = this.taperRatio + (1 - this.taperRatio) * bulge;
            const toneRatio = 1 - this.toneVariation * (1 - bulge);

            this.segments.push(
                this.createSegment(container, i, from, to, length, frame, scale, frameHeight, widthRatio, toneRatio)
            );
        }
    }

    /** 清掉上一次生成的段节点。 */
    public clear(): void {
        for (const node of this.segments) {
            if (node && node.isValid) {
                node.removeFromParent();
                node.destroy();
            }
        }
        this.segments = [];

        // 兜底：脚本重编译后内存记录会丢，按名字清掉残留段。
        // 先 removeFromParent()：destroy() 要到帧末才真正摘除，否则会连着新建的一起算。
        const container = this.resolveContainerIfExists();
        if (container) {
            for (const child of container.children.slice()) {
                if (child.name.startsWith(this.segmentPrefix)) {
                    child.removeFromParent();
                    child.destroy();
                }
            }
        }
    }

    private createSegment(
        container: Node,
        index: number,
        from: Vec3,
        to: Vec3,
        length: number,
        frame: SpriteFrame,
        scale: number,
        frameHeight: number,
        widthRatio: number,
        toneRatio: number
    ): Node {
        const node = new Node(`${this.segmentPrefix}${index}`);
        node.layer = container.layer;
        container.addChild(node);

        const transform = node.addComponent(UITransform);
        transform.setAnchorPoint(0.5, 0.5);

        const sprite = node.addComponent(Sprite);
        // 必须先设 sizeMode / type 再设 spriteFrame：
        // 否则 Sprite 会按默认 TRIM 模式把 contentSize 重置成素材原始尺寸。
        sprite.type = Sprite.Type.TILED;
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.trim = false;
        sprite.spriteFrame = frame;

        // contentSize 是"缩放前"的尺寸：横向乘 scale 后正好等于段长；TILED 在其中平铺纹理。
        transform.setContentSize((length + this.overlap) / scale, frameHeight);

        // 纵向单独缩放 = 笔触粗细变化（不影响 TILED 的横向平铺次数）。
        node.setScale(scale, scale * widthRatio, 1);
        // 墨色浓淡：两端淡、中段浓。
        sprite.color = new Color(255, 255, 255, Math.round(255 * Math.min(1, Math.max(0, toneRatio))));

        node.setPosition((from.x + to.x) / 2, (from.y + to.y) / 2, 0);
        node.angle = Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI;

        return node;
    }

    /** 控制点 = 路径根节点下排除生成物的子节点（按层级顺序）。 */
    private controlPoints(root: Node): Vec3[] {
        return root.children
            .filter((child) => !child.name.startsWith(this.segmentPrefix))
            .map((child) => this.toParentSpace(child.getWorldPosition()));
    }

    private resolveContainerIfExists(): Node | null {
        const configured = this.container as unknown as Node;
        if (configured && configured.isValid) {
            return configured;
        }
        const parent = this.node.parent;
        return parent ? parent.getChildByName('Brush') : null;
    }

    private resolveContainer(): Node {
        const existing = this.resolveContainerIfExists();
        if (existing) {
            return existing;
        }
        const parent = this.node.parent || this.node;
        const created = new Node('Brush');
        created.layer = this.node.layer;
        parent.addChild(created);
        // 紧跟在放置区之后：盖住背景、但压在棋子下面。
        created.setSiblingIndex(this.node.getSiblingIndex() + 1);
        return created;
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
        if (configured && typeof configured.getChildByName === 'function') {
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
