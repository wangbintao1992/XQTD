import {
    _decorator,
    Color,
    Component,
    director,
    Graphics,
    Label,
    Node,
    Tween,
    tween,
    UIOpacity,
    UITransform,
    Vec3,
} from 'cc';

const { ccclass, property } = _decorator;

/**
 * 统一轻提示（toast）：一条短暂的条状文字，默认贴在屏幕底部中间，自动淡出。
 *
 * 用法（任意脚本、不需要在场景里预先摆节点）：
 *   import { TipToast } from './TipToast';
 *   TipToast.show('棋气不足，需要 50');
 *
 * 设计约定：
 *  - **一个静态入口** `TipToast.show(msg)`：自动在 Canvas 上找 / 建唯一实例，
 *    重复调用复用同一个提示节点（先收起上一条，再显示新的）；
 *  - 节点是**运行时现画**的 `Graphics` 圆角底 + `Label`（零素材），和
 *    `TowerActionMenu` / `GameOverPopup` 同一路子；
 *  - 纯视觉层，**不注册任何触摸事件**，不会挡住棋盘交互；
 *  - 淡出用 `UIOpacity`（提示不可点，用它是安全的；项目里"别用 UIOpacity=0"
 *    的坑是针对**可点击节点**的）。
 *
 * ⚠️ 新建节点的 layer 跟随 Canvas 下已有的 UI 子节点（`uiLayer`），
 *    不要用 `Canvas.layer`（本项目 Canvas 是 UI_2D，子节点却都是 DEFAULT）。
 */
@ccclass('TipToast')
export class TipToast extends Component {
    @property({ tooltip: '提示停留时长（秒），之后开始淡出' })
    public duration = 1.6;

    @property({ tooltip: '淡出时长（秒）' })
    public fadeDuration = 0.35;

    @property({ tooltip: '提示底边离画布底边的距离（设计单位）' })
    public bottomMargin = 96;

    @property({ tooltip: '字号' })
    public fontSize = 26;

    @property({ tooltip: '文字左右内边距（设计单位）' })
    public paddingX = 30;

    @property({ tooltip: '文字上下内边距（设计单位）' })
    public paddingY = 14;

    @property({ tooltip: '圆角半径（最大取高度一半）' })
    public radius = 12;

    @property({ tooltip: '提示最小宽度（设计单位）' })
    public minWidth = 140;

    @property({ tooltip: '提示最小高度（设计单位）' })
    public minHeight = 48;

    @property({ tooltip: '文字颜色' })
    public textColor = new Color(250, 245, 235, 255);

    @property({ tooltip: '底板颜色' })
    public bgColor = new Color(22, 20, 17, 210);

    @property({ tooltip: '提示节点名' })
    public tipNodeName = 'TipToast';

    @property({ tooltip: '打控制台日志' })
    public debugLog = true;

    private static inst: TipToast | null = null;

    /** 全局唯一实例（场景里挂一个就行；没有时 `show` 会自动建）。 */
    public static get shared(): TipToast | null {
        return TipToast.inst && TipToast.inst.isValid ? TipToast.inst : null;
    }

    /** 统一提示入口：显示一条轻提示。 */
    public static show(message: string): void {
        if (!message) {
            return;
        }
        const toast = TipToast.ensure();
        if (toast) {
            toast.showMessage(message);
        } else {
            console.warn('[TipToast] 找不到 Canvas，提示未显示: ' + message);
        }
    }

    /** 找到现有实例；没有就在 Canvas 上挂一个。 */
    private static ensure(): TipToast | null {
        const existing = TipToast.shared;
        if (existing) {
            return existing;
        }
        const canvas = TipToast.findCanvas();
        if (!canvas) {
            return null;
        }
        return canvas.getComponent(TipToast) || canvas.addComponent(TipToast);
    }

    private static findCanvas(): Node | null {
        const scene = director.getScene();
        return scene ? TipToast.searchByName(scene, 'Canvas') : null;
    }

    private static searchByName(node: Node, name: string): Node | null {
        if (node.name === name) {
            return node;
        }
        for (const child of node.children) {
            const found = TipToast.searchByName(child, name);
            if (found) {
                return found;
            }
        }
        return null;
    }

    private tipNode: Node | null = null;
    private tipBg: Graphics | null = null;
    private tipLabel: Label | null = null;
    private tipOpacity: UIOpacity | null = null;

    protected onLoad(): void {
        TipToast.inst = this;
    }

    protected onDestroy(): void {
        this.unschedule(this.startFade);
        if (this.tipOpacity && this.tipOpacity.isValid) {
            Tween.stopAllByTarget(this.tipOpacity);
        }
        if (TipToast.inst === this) {
            TipToast.inst = null;
        }
    }

    /** 显示（或替换）一条提示，重新计时。 */
    public showMessage(message: string): void {
        const node = this.ensureTipNode();
        if (!node || !this.tipLabel) {
            return;
        }

        this.tipLabel.string = message;
        this.tipLabel.updateRenderData(true);   // 立刻刷新，才能量到正确的文字宽高
        this.resizeBackground();

        node.active = true;
        node.setPosition(this.anchorPosition());
        // 抬到最上层，避免被首页 / 弹窗等后加的节点盖住。
        const siblings = this.node.children;
        if (siblings.length > 0 && siblings[siblings.length - 1] !== node) {
            node.setSiblingIndex(siblings.length - 1);
        }
        if (this.tipOpacity) {
            this.tipOpacity.opacity = 255;
        }

        this.unschedule(this.startFade);
        this.scheduleOnce(this.startFade, Math.max(0.05, this.duration));

        if (this.debugLog) {
            console.log('[TipToast] ' + message);
        }
    }

    /** 立即收起（不等淡出）。 */
    public hide(): void {
        this.unschedule(this.startFade);
        if (this.tipOpacity && this.tipOpacity.isValid) {
            Tween.stopAllByTarget(this.tipOpacity);
        }
        if (this.tipNode && this.tipNode.isValid) {
            this.tipNode.active = false;
        }
    }

    /* ------------------------------ 内部实现 ------------------------------ */

    private startFade = (): void => {
        const opacity = this.tipOpacity;
        const node = this.tipNode;
        if (!opacity || !opacity.isValid || !node) {
            return;
        }
        Tween.stopAllByTarget(opacity);
        tween(opacity)
            .to(Math.max(0.01, this.fadeDuration), { opacity: 0 })
            .call(() => {
                if (node.isValid) {
                    node.active = false;
                }
            })
            .start();
    };

    private ensureTipNode(): Node | null {
        if (this.tipNode && this.tipNode.isValid) {
            return this.tipNode;
        }

        const host = this.node;
        const node = new Node(this.tipNodeName);
        node.layer = this.uiLayer(host);
        host.addChild(node);

        const transform = node.addComponent(UITransform);
        transform.setAnchorPoint(0.5, 0);   // 以底边为锚，方便贴屏幕底部

        this.tipBg = node.addComponent(Graphics);

        const labelNode = new Node('Label');
        labelNode.layer = node.layer;
        node.addChild(labelNode);
        const labelTransform = labelNode.addComponent(UITransform);
        labelTransform.setAnchorPoint(0.5, 0.5);
        const label = labelNode.addComponent(Label);
        label.fontSize = this.fontSize;
        label.lineHeight = Math.round(this.fontSize * 1.25);
        label.color = this.textColor;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.overflow = Label.Overflow.NONE;
        this.tipLabel = label;

        this.tipOpacity = node.addComponent(UIOpacity);

        this.tipNode = node;
        node.active = false;
        return node;
    }

    /** 按文字大小重画底板，并把文字摆到底板中央。 */
    private resizeBackground(): void {
        const bg = this.tipBg;
        const node = this.tipNode;
        const label = this.tipLabel;
        if (!bg || !node || !label) {
            return;
        }

        const labelTransform = label.node.getComponent(UITransform);
        const textW = labelTransform ? labelTransform.width : 0;
        const textH = labelTransform ? labelTransform.height : 0;
        const w = Math.max(this.minWidth, textW + this.paddingX * 2);
        const h = Math.max(this.minHeight, textH + this.paddingY * 2);

        const transform = node.getComponent(UITransform) || node.addComponent(UITransform);
        transform.setContentSize(w, h);
        label.node.setPosition(0, h / 2, 0);

        bg.clear();
        bg.fillColor = this.bgColor;
        bg.roundRect(-w / 2, 0, w, h, Math.max(0, Math.min(this.radius, h / 2)));
        bg.fill();
    }

    /** 底边居中：提示底边距画布底边 `bottomMargin`。 */
    private anchorPosition(): Vec3 {
        const transform = this.node.getComponent(UITransform);
        const halfH = transform ? transform.height * 0.5 : 320;
        return new Vec3(0, -halfH + this.bottomMargin, 0);
    }

    /** 跟随 Canvas 下已有的 UI 子节点这一层，别用 Canvas.layer。 */
    private uiLayer(host: Node): number {
        for (const child of host.children) {
            if (child.name === 'Camera') {
                continue;
            }
            return child.layer;
        }
        return host.layer;
    }
}
