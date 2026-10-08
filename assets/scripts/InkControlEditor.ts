import {
    _decorator,
    Color,
    Component,
    EventTouch,
    Graphics,
    Node,
    UITransform,
    Vec3,
} from 'cc';

const { ccclass, property } = _decorator;

const HANDLE_PREFIX = 'Handle';

/**
 * 运行时拖拽编辑 InkRibbon2D 的控制点。
 *
 * - 每个控制点生成一个圆形手柄（Graphics 画，零素材）；
 * - 按住手柄拖动 → 实时改控制点位置 → 立刻驱动线条重新采样刷新；
 * - 长按手柄 = 删除该控制点（至少保留 2 个）。
 *
 * ⚠️ 手柄和"控制点"挂在同一个父节点下，所以**所有遍历都必须排除 Handle 前缀的节点**，
 * 否则会把手柄当成控制点，导致数量永远对不上、每帧重建手柄把编辑器卡死（踩过）。
 */
@ccclass('InkControlEditor')
export class InkControlEditor extends Component {
    @property({ type: Node, tooltip: '控制点父节点（P0..Pn）；留空则用本节点' })
    public controlRoot: Node | null = null;

    @property({ tooltip: '要刷新的线条节点名（同级里找，通常就是 InkLine2）' })
    public lineNodeName = 'InkLine2';

    @property({ tooltip: '手柄半径（设计单位）' })
    public handleRadius = 26;

    @property({ tooltip: '手柄描边颜色' })
    public handleColor = new Color(214, 86, 64, 220);

    @property({ tooltip: '是否允许拖拽编辑' })
    public editable = true;

    @property({ tooltip: '长按多少秒删除该控制点' })
    public longPressSeconds = 0.6;

    private handles: Node[] = [];
    private draggingIndex = -1;
    private pressTime = 0;
    private pressedIndex = -1;

    protected onEnable(): void {
        this.buildHandles();
    }

    protected onDisable(): void {
        this.clearHandles();
    }

    protected update(dt: number): void {
        if (this.pressedIndex >= 0 && this.draggingIndex < 0) {
            this.pressTime += dt;
            if (this.pressTime >= this.longPressSeconds) {
                this.removeControl(this.pressedIndex);
                this.pressedIndex = -1;
            }
        }
        // 控制点数量变了才重建手柄（注意：只数非 Handle 节点）
        if (this.controlNodes().length !== this.handles.length) {
            this.buildHandles();
        }
    }

    /** 控制点节点 = 父节点下排除 Handle 前缀的子节点。 */
    private controlNodes(): Node[] {
        const root = this.resolveControlRoot();
        if (!root) {
            return [];
        }
        return root.children.filter((child) => child.name.indexOf(HANDLE_PREFIX) !== 0);
    }

    public buildHandles(): void {
        this.clearHandles();
        const nodes = this.controlNodes();
        for (let i = 0; i < nodes.length; i += 1) {
            this.handles.push(this.createHandle(i, nodes[i]));
        }
        this.refreshHandles();
    }

    public refreshHandles(): void {
        const nodes = this.controlNodes();
        for (let i = 0; i < this.handles.length && i < nodes.length; i += 1) {
            const p = nodes[i].position;
            this.handles[i].setPosition(p.x, p.y, 0);
        }
    }

    /** 在第 index 个控制点之后插入一个新点。 */
    public insertControlAfter(index: number): Node | null {
        const root = this.resolveControlRoot();
        const nodes = this.controlNodes();
        if (!root || nodes.length === 0) {
            return null;
        }
        const clamped = Math.max(0, Math.min(nodes.length - 1, index));
        const from = nodes[clamped].position;
        const to = nodes[Math.min(nodes.length - 1, clamped + 1)].position;
        const node = new Node(`P${nodes.length}`);
        node.layer = root.layer;
        root.addChild(node);
        node.setPosition((from.x + to.x) / 2, (from.y + to.y) / 2, 0);
        this.rebuildLine();
        this.buildHandles();
        return node;
    }

    /** 删除第 index 个控制点（至少留 2 个）。 */
    public removeControl(index: number): boolean {
        const nodes = this.controlNodes();
        if (nodes.length <= 2 || !nodes[index]) {
            return false;
        }
        nodes[index].removeFromParent();
        nodes[index].destroy();
        this.rebuildLine();
        this.buildHandles();
        return true;
    }

    /* ------------------------------------------------------------------ */

    private createHandle(index: number, control: Node): Node {
        const handle = new Node(`${HANDLE_PREFIX}${index}`);
        handle.layer = this.node.layer;
        this.node.addChild(handle);

        const transform = handle.addComponent(UITransform);
        const r = this.handleRadius;
        transform.setAnchorPoint(0.5, 0.5);
        transform.setContentSize(r * 2, r * 2);

        const graphics = handle.addComponent(Graphics);
        graphics.lineWidth = 4;
        graphics.strokeColor = this.handleColor;
        graphics.fillColor = new Color(255, 255, 255, 90);
        graphics.circle(0, 0, r * 0.6);
        graphics.fill();
        graphics.stroke();

        handle.on(Node.EventType.TOUCH_START, () => this.onHandleDown(index), this);
        handle.on(Node.EventType.TOUCH_MOVE, (e: EventTouch) => this.onHandleMove(index, e), this);
        handle.on(Node.EventType.TOUCH_END, () => this.onHandleUp(), this);
        handle.on(Node.EventType.TOUCH_CANCEL, () => this.onHandleUp(), this);
        return handle;
    }

    private onHandleDown(index: number): void {
        if (!this.editable) {
            return;
        }
        this.pressedIndex = index;
        this.pressTime = 0;
        this.draggingIndex = -1;
    }

    private onHandleMove(index: number, event: EventTouch): void {
        if (!this.editable || index < 0) {
            return;
        }
        const nodes = this.controlNodes();
        if (!nodes[index]) {
            return;
        }
        this.draggingIndex = index;
        this.pressedIndex = -1;

        const local = this.toControlLocal(event);
        nodes[index].setPosition(local.x, local.y, 0);
        if (this.handles[index]) {
            this.handles[index].setPosition(local.x, local.y, 0);
        }
        this.rebuildLine();
    }

    private onHandleUp(): void {
        this.pressedIndex = -1;
        this.draggingIndex = -1;
    }

    private toControlLocal(event: EventTouch): Vec3 {
        const root = this.resolveControlRoot();
        const transform = root ? root.getComponent(UITransform) : null;
        const ui = event.getUILocation();
        if (transform) {
            const local = transform.convertToNodeSpaceAR(new Vec3(ui.x, ui.y, 0));
            return new Vec3(local.x, local.y, 0);
        }
        return new Vec3(ui.x, ui.y, 0);
    }

    /** 控制点变动后驱动线条重新采样（兼容新旧组件：谁有 rebuild() 就用谁）。 */
    private rebuildLine(): void {
        const root = this.resolveControlRoot();
        const parent = root ? root.parent : this.node.parent;
        if (!parent) {
            return;
        }
        const lineNode = parent.getChildByName(this.lineNodeName);
        if (!lineNode) {
            return;
        }
        for (const comp of lineNode.components) {
            const anyComp = comp as any;
            if (anyComp && typeof anyComp.rebuild === 'function') {
                anyComp.rebuild();
                break;
            }
        }
    }

    private clearHandles(): void {
        for (const handle of this.handles) {
            if (handle && handle.isValid) {
                handle.removeFromParent();
                handle.destroy();
            }
        }
        this.handles = [];
        this.pressedIndex = -1;
        this.draggingIndex = -1;
    }

    private resolveControlRoot(): Node | null {
        const configured = this.controlRoot as unknown as Node;
        if (configured && configured.isValid) {
            return configured;
        }
        return this.node;
    }
}
