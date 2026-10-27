import {
    _decorator,
    BlockInputEvents,
    Button,
    Color,
    Component,
    Label,
    Node,
    resources,
    Sprite,
    SpriteFrame,
    UITransform,
    view,
} from 'cc';
import { GameSession } from './GameSession';
import { TipToast } from './TipToast';

const { ccclass, property } = _decorator;

/**
 * 游戏首页（进游戏先看到的一屏）。
 *
 * 布局：
 *   首页底图 index.png 铺满屏幕（cover 等比放大，不变形）
 *     → 两个按钮：左「无尽模式」= btn1，右「闯关模式」= btn2
 *
 * 行为：
 *  - 首页出现时 `GameSession` 处于「未开局」，现有游戏逻辑整体停摆；
 *  - 点「无尽模式」→ 收起首页 + `GameSession.start()`，**现在的游戏自动开始**；
 *  - 点「闯关模式」→ 目前是预留（用统一 tip 提示"敬请期待"），不做跳转。
 *
 * 零场景改动：由 `GameBootstrap` 自动在 Canvas 上挂本组件；按钮 / 底图都是
 * 运行时现建的（`Graphics` 不参与，直接用的素材）。
 *
 * ⚠️ 两处沿用项目里踩过的坑的写法：
 *  1. 新建节点的 layer 跟随 Canvas 下已有的 UI 子节点（`uiLayer`），别用 `Canvas.layer`；
 *  2. 底图要做**输入拦截**（`BlockInputEvents`），否则点首页会穿透点到后面的卡片 / 棋盘。
 */
@ccclass('HomeMenu')
export class HomeMenu extends Component {
    @property({ tooltip: '首页底图（resources 路径，不含扩展名）' })
    public bgResourcePath = 'textures/index/index/spriteFrame';

    @property({ tooltip: '「无尽模式」按钮贴图（resources 路径）' })
    public endlessButtonResourcePath = 'textures/index/btn1/spriteFrame';

    @property({ tooltip: '「闯关模式」按钮贴图（resources 路径）' })
    public levelButtonResourcePath = 'textures/index/btn2/spriteFrame';

    @property({ tooltip: '「无尽模式」按钮文字' })
    public endlessText = '无尽模式';

    @property({ tooltip: '「闯关模式」按钮文字' })
    public levelText = '闯关模式';

    @property({ tooltip: '闯关模式暂未开放时的提示文案' })
    public levelComingSoonText = '闯关模式 敬请期待';

    @property({ tooltip: '按钮宽（设计单位）' })
    public buttonWidth = 300;

    @property({ tooltip: '按钮高（设计单位）' })
    public buttonHeight = 108;

    @property({ tooltip: '两个按钮的间距（设计单位）' })
    public buttonGap = 64;

    @property({ tooltip: '按钮中心相对画布中心的高度（设计单位，负值偏下）' })
    public buttonY = -70;

    @property({ tooltip: '按钮文字字号' })
    public fontSize = 36;

    @property({ tooltip: '按钮文字颜色' })
    public textColor = new Color(246, 241, 233, 255);

    @property({ tooltip: '打控制台日志' })
    public debugLog = true;

    private root: Node | null = null;
    private visible = false;

    protected onLoad(): void {
        // 首页出现 = 还没开局；保证游戏逻辑停摆（重开场景时也回落到未开局）。
        GameSession.reset();
        this.build();
    }

    protected start(): void {
        // 首页在 onLoad 里是最后追加到 Canvas 的，已经在最上层；这里再抬一次，
        // 覆盖"别的系统在 start() 里往 Canvas 追加图层"的情况（只抬前后两帧，
        // 不做每帧抬升 —— 否则会盖住 `TipToast` 这类后弹的提示）。
        this.raiseToTop();
        this.scheduleOnce(this.raiseToTop, 0);
    }

    public get isVisible(): boolean {
        return this.visible;
    }

    /** 收起首页（不动游戏）。 */
    public hide(): void {
        this.visible = false;
        if (this.root && this.root.isValid) {
            this.root.active = false;
        }
    }

    private raiseToTop = (): void => {
        if (!this.root || !this.root.isValid) {
            return;
        }
        const children = this.node.children;
        if (children.length > 0 && children[children.length - 1] !== this.root) {
            this.root.setSiblingIndex(children.length - 1);
        }
    };

    /* ------------------------------ 两个按钮 ------------------------------ */

    private onEndless(): void {
        if (this.debugLog) {
            console.log('[HomeMenu] 无尽模式 → 开始游戏');
        }
        this.hide();
        GameSession.start();
    }

    private onLevel(): void {
        if (this.debugLog) {
            console.log('[HomeMenu] 闯关模式（预留，暂无跳转）');
        }
        TipToast.show(this.levelComingSoonText);
    }

    /* ------------------------------ 首页构建 ------------------------------ */

    private build(): void {
        const host = this.node;                 // Canvas
        const root = new Node('HomeMenu');
        root.layer = this.uiLayer(host);
        host.addChild(root);

        // 根节点铺满可视区域并拦截输入（点首页不穿透到后面的棋盘）。
        const rootTransform = root.addComponent(UITransform);
        rootTransform.setAnchorPoint(0.5, 0.5);
        const visible = view.getVisibleSize();
        rootTransform.setContentSize(visible.width, visible.height);
        root.addComponent(BlockInputEvents);

        this.buildBackground(root, visible.width, visible.height);
        this.buildButtons(root);

        this.root = root;
        this.visible = true;

        if (this.debugLog) {
            console.log(`[HomeMenu] 首页已显示（${visible.width}x${visible.height}）`);
        }
    }

    /** 底图：等比放大铺满（cover，裁掉超出部分，不变形）。 */
    private buildBackground(host: Node, visibleW: number, visibleH: number): void {
        const node = new Node('HomeBackground');
        node.layer = host.layer;
        host.addChild(node);
        node.setPosition(0, 0, 0);

        const sprite = node.addComponent(Sprite);
        sprite.type = Sprite.Type.SIMPLE;
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.trim = false;

        const transform = node.addComponent(UITransform);
        transform.setAnchorPoint(0.5, 0.5);

        resources.load(this.bgResourcePath, SpriteFrame, (err, frame) => {
            if (err || !frame || !node.isValid) {
                console.warn(`[HomeMenu] 首页底图加载失败: ${this.bgResourcePath}`, err);
                return;
            }
            sprite.spriteFrame = frame;
            const rect = frame.rect;
            transform.setContentSize(rect.width, rect.height);
            const scale = Math.max(visibleW / rect.width, visibleH / rect.height);
            node.setScale(scale, scale, 1);
        });
    }

    private buildButtons(host: Node): void {
        const w = this.buttonWidth;
        const h = this.buttonHeight;
        const offset = (w + this.buttonGap) / 2;
        this.buildButton(host, 'BtnEndless', this.endlessButtonResourcePath, this.endlessText, -offset, this.onEndless.bind(this));
        this.buildButton(host, 'BtnLevel', this.levelButtonResourcePath, this.levelText, offset, this.onLevel.bind(this));
    }

    /** 一个图片按钮（贴图 + 居中文字 + Button 组件）。 */
    private buildButton(
        host: Node,
        name: string,
        resPath: string,
        text: string,
        x: number,
        onClick: () => void,
    ): void {
        const node = new Node(name);
        node.layer = host.layer;
        host.addChild(node);
        node.setPosition(x, this.buttonY, 0);

        const transform = node.addComponent(UITransform);
        transform.setAnchorPoint(0.5, 0.5);
        transform.setContentSize(this.buttonWidth, this.buttonHeight);

        const sprite = node.addComponent(Sprite);
        sprite.type = Sprite.Type.SIMPLE;
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        resources.load(resPath, SpriteFrame, (err, frame) => {
            if (err || !frame || !node.isValid) {
                console.warn(`[HomeMenu] 按钮贴图加载失败: ${resPath}`, err);
                return;
            }
            sprite.spriteFrame = frame;
        });

        const labelNode = new Node('Label');
        labelNode.layer = host.layer;
        node.addChild(labelNode);
        const label = labelNode.addComponent(Label);
        label.string = text;
        label.fontSize = this.fontSize;
        label.lineHeight = Math.round(this.fontSize * 1.2);
        label.color = this.textColor;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;

        const button = node.addComponent(Button);
        button.transition = Button.Transition.SCALE;
        button.zoomScale = 0.96;
        node.on(Button.EventType.CLICK, onClick, this);
    }

    /** 新建节点的 layer 跟随 Canvas 下已有的 UI 子节点，别用 Canvas.layer。 */
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
