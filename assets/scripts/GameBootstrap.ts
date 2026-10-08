import {
    _decorator,
    Component,
    Node,
    ResolutionPolicy,
    Sprite,
    SpriteFrame,
    UITransform,
    Widget,
    resources,
    sys,
    view,
} from 'cc';

const { ccclass, property } = _decorator;

/**
 * 启动引导组件（挂在 Canvas 上）。
 *
 * 1. 自动横屏：设计分辨率若为竖屏则交换为横屏；浏览器下尝试锁定 landscape。
 *    **默认不请求全屏** —— 请求全屏会影响预览体验（点一下就被全屏），需要时把
 *    requestFullscreen 打开即可。
 * 2. 场景背景：用 bg 图片铺满整个可视区域（等比放大，不变形）。
 *
 * 小游戏 / 原生平台的方向锁定不在脚本里：微信小游戏看构建产物 game.json 的
 * deviceOrientation，原生 App 看构建配置的屏幕方向。
 */
@ccclass('GameBootstrap')
export class GameBootstrap extends Component {
    @property({ type: SpriteFrame, tooltip: '背景图；留空则按 bgResourcePath 从 resources 动态加载' })
    public bgSpriteFrame: SpriteFrame | null = null;

    @property({ tooltip: 'resources 下的背景图路径（不含扩展名）' })
    public bgResourcePath = 'textures/bg/spriteFrame';

    @property({ tooltip: '背景节点名；场景里已有同名节点时直接复用' })
    public bgNodeName = 'Background';

    @property({ tooltip: '启动时尝试横屏（竖屏设计分辨率会被交换，并尝试锁定 landscape）' })
    public autoLandscape = true;

    @property({ tooltip: '是否请求浏览器全屏。默认关闭：开着会导致预览时点一下就全屏，且浏览器要求用户手势往往失败' })
    public requestFullscreen = false;

    private bgNode: Node | null = null;
    private bgSprite: Sprite | null = null;
    private lastWidth = 0;
    private lastHeight = 0;

    protected onLoad(): void {
        if (this.autoLandscape) {
            this.enforceLandscapeDesign();
            void this.lockLandscape();
        }
        this.setupBackground();
    }

    protected start(): void {
        this.syncBackground();
    }

    protected lateUpdate(): void {
        const size = view.getVisibleSize();
        if (size.width !== this.lastWidth || size.height !== this.lastHeight) {
            this.syncBackground();
        }
    }

    /** 设计分辨率是竖屏时交换成横屏，保证布局按横屏进行。 */
    private enforceLandscapeDesign(): void {
        const size = view.getDesignResolutionSize();
        if (size.height > size.width) {
            view.setDesignResolutionSize(size.height, size.width, ResolutionPolicy.SHOW_ALL);
        }
    }

    /**
     * 尝试锁定横屏。全屏默认不开，也不做事后重试 ——
     * 之前"首次点击时重试全屏"就是预览里一点就全屏的原因。
     */
    private async lockLandscape(): Promise<boolean> {
        if (!sys.isBrowser) {
            return false;
        }
        const doc: any = (globalThis as any).document;
        const win: any = globalThis as any;
        if (!doc) {
            return false;
        }

        if (this.requestFullscreen) {
            try {
                const element = doc.documentElement;
                if (element && !doc.fullscreenElement && typeof element.requestFullscreen === 'function') {
                    await element.requestFullscreen();
                }
            } catch (err) {
                // 浏览器要求用户手势；失败就放弃，不重试。
            }
        }

        try {
            const orientation = win.screen && win.screen.orientation;
            if (orientation && typeof orientation.lock === 'function') {
                await orientation.lock('landscape');
                return true;
            }
        } catch (err) {
            // 未全屏、桌面浏览器或不支持 lock：安静放弃。
        }

        return false;
    }

    /** 找到或创建背景节点，并准备 Sprite。 */
    private setupBackground(): void {
        const canvas = this.node;
        let node = canvas.getChildByName(this.bgNodeName);
        if (!node) {
            node = new Node(this.bgNodeName);
            node.layer = canvas.layer;
            canvas.addChild(node);
        }
        node.setSiblingIndex(0);

        const sprite = node.getComponent(Sprite) || node.addComponent(Sprite);
        sprite.type = Sprite.Type.SIMPLE;
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.trim = false;

        this.bgNode = node;
        this.bgSprite = sprite;

        if (this.bgSpriteFrame) {
            this.applySpriteFrame(this.bgSpriteFrame);
            return;
        }

        // 复用编辑器里已经在背景节点上摆好的图（静态引用，先于动态加载）。
        if (sprite.spriteFrame) {
            this.syncBackground();
            return;
        }

        resources.load(this.bgResourcePath, SpriteFrame, (err, frame) => {
            if (err || !frame) {
                console.warn(`[GameBootstrap] 背景加载失败: ${this.bgResourcePath}`, err);
                return;
            }
            this.applySpriteFrame(frame);
        });
    }

    private applySpriteFrame(frame: SpriteFrame): void {
        if (!this.bgSprite || !this.bgNode) {
            return;
        }
        this.bgSprite.spriteFrame = frame;
        // 尺寸完全由脚本按屏幕计算，避免编辑器里的 Widget 把图拉变形。
        const widget = this.bgNode.getComponent(Widget);
        if (widget) {
            widget.enabled = false;
        }
        this.syncBackground();
    }

    /** 等比放大铺满可视区域（cover，裁掉超出部分，不变形）。 */
    private syncBackground(): void {
        const node = this.bgNode;
        const sprite = this.bgSprite;
        if (!node || !sprite || !sprite.spriteFrame) {
            return;
        }

        const visible = view.getVisibleSize();
        this.lastWidth = visible.width;
        this.lastHeight = visible.height;

        const frame = sprite.spriteFrame.rect;
        if (!frame.width || !frame.height) {
            return;
        }

        const transform = node.getComponent(UITransform) || node.addComponent(UITransform);
        transform.setAnchorPoint(0.5, 0.5);
        transform.setContentSize(frame.width, frame.height);

        const scale = Math.max(visible.width / frame.width, visible.height / frame.height);
        node.setPosition(0, 0, 0);
        node.setScale(scale, scale, 1);
    }
}
