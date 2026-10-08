import {
    _decorator,
    Color,
    Component,
    Graphics,
    Node,
    Tween,
    Vec3,
    tween,
} from 'cc';

const { ccclass, property } = _decorator;

/**
 * 左侧可展开 / 缩回的塔栏。
 *
 * 面板本体用 Graphics 画（零素材）：半透明深色圆角底 + 一条分隔线，
 * 展开/缩回就是把这个面板节点沿 X 轴滑出去。
 *
 * 把手（toggle）挂在面板上或单独放，点一下切换展开状态。
 */
@ccclass('TowerSidebar')
export class TowerSidebar extends Component {
    @property({ type: Node, tooltip: '会左右滑动的面板节点（留空则用本节点）' })
    public panel: Node | null = null;

    @property({ type: Node, tooltip: '把手节点（点击它切换展开/缩回）；留空则找子节点里名为 Toggle 的' })
    public toggleNode: Node | null = null;

    @property({ tooltip: '展开时面板中心的 x（画布坐标）' })
    public expandedX = -535;

    @property({ tooltip: '缩回时面板中心的 x（画布坐标）' })
    public collapsedX = -715;

    @property({ tooltip: '滑动时长（秒）' })
    public duration = 0.25;

    @property({ tooltip: '初始是否展开' })
    public startExpanded = true;

    @property({ tooltip: '面板宽（设计单位）' })
    public panelWidth = 210;

    @property({ tooltip: '面板高（设计单位）' })
    public panelHeight = 620;

    @property({ tooltip: '是否用 Graphics 画面板底' })
    public drawBackground = true;

    private expanded = true;

    protected onLoad(): void {
        if (this.drawBackground) {
            this.drawRectBackground();
        }
    }

    protected onEnable(): void {
        const toggle = this.resolveToggle();
        if (toggle) {
            toggle.on(Node.EventType.TOUCH_END, this.onToggleClick, this);
        }
    }

    protected onDisable(): void {
        const toggle = this.resolveToggle();
        if (toggle) {
            toggle.off(Node.EventType.TOUCH_END, this.onToggleClick, this);
        }
    }

    private onToggleClick(): void {
        this.toggle();
    }

    /** 把手节点：没指定就找子节点里名为 Toggle 的那个。 */
    private resolveToggle(): Node | null {
        const configured = this.toggleNode as unknown as Node;
        if (configured && configured.isValid) {
            return configured;
        }
        return this.node.getChildByName('Toggle');
    }

    protected start(): void {
        this.expanded = this.startExpanded;
        const target = this.resolvePanel();
        if (target) {
            const x = this.expanded ? this.expandedX : this.collapsedX;
            target.setPosition(x, target.position.y, 0);
        }
    }

    /** 展开 / 缩回开关。 */
    public toggle(): void {
        this.setExpanded(!this.expanded);
    }

    public setExpanded(value: boolean): void {
        this.expanded = value;
        const target = this.resolvePanel();
        if (!target) {
            return;
        }
        Tween.stopAllByTarget(target);
        tween(target)
            .to(this.duration, { position: new Vec3(value ? this.expandedX : this.collapsedX, target.position.y, 0) }, { easing: 'quadOut' })
            .start();
    }

    public get isExpanded(): boolean {
        return this.expanded;
    }

    private resolvePanel(): Node | null {
        const configured = this.panel as unknown as Node;
        if (configured && configured.isValid) {
            return configured;
        }
        return this.node;
    }

    /** 用 Graphics 画一块半透明的圆角面板底（不需要任何素材）。 */
    private drawRectBackground(): void {
        const target = this.resolvePanel();
        if (!target) {
            return;
        }
        const graphics = target.getComponent(Graphics) || target.addComponent(Graphics);
        const w = this.panelWidth;
        const h = this.panelHeight;
        const x = -w / 2;
        const y = -h / 2;
        const r = 18;

        graphics.clear();
        graphics.fillColor = new Color(20, 20, 24, 150);
        graphics.roundRect(x, y, w, h, r);
        graphics.fill();
        graphics.strokeColor = new Color(240, 236, 226, 90);
        graphics.lineWidth = 2;
        graphics.roundRect(x, y, w, h, r);
        graphics.stroke();
    }
}
