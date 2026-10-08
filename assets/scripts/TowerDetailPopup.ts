import {
    _decorator,
    Color,
    Component,
    Graphics,
    Node,
    Sprite,
    SpriteFrame,
    UITransform,
    resources,
} from 'cc';

const { ccclass, property } = _decorator;

/**
 * 棋子详情弹窗：点击已放置的棋子，弹出 `detail` 那张棋子介绍卡。
 * 按用户要求：内容**固定**（素材本身已经排好版），
 * 显示 `showTime` 秒后自动消失，或者点其他地方（遮罩）立刻消失。
 */
@ccclass('TowerDetailPopup')
export class TowerDetailPopup extends Component {
    @property({ tooltip: '详情贴图在 resources 下的路径' })
    public detailResourcePath = 'textures/detail/spriteFrame';

    @property({ type: SpriteFrame, tooltip: '详情贴图（留空则按上面的路径加载）' })
    public detailFrame: SpriteFrame | null = null;

    @property({ tooltip: '显示宽度（设计单位）' })
    public width = 520;
    // 高度按素材比例自动算

    @property({ tooltip: '显示多久后自动消失（秒）' })
    public showTime = 2;

    @property({ tooltip: '点其他地方是否立刻消失' })
    public closeOnBlankTouch = true;

    @property({ tooltip: '打控制台日志' })
    public debugLog = true;

    private timer = 0;
    private showing = false;
    private mask: Node | null = null;
    private card: Node | null = null;

    public get isShowing(): boolean {
        return this.showing;
    }

    protected onLoad(): void {
        this.hide();
        this.ensureFrame();
    }

    protected update(dt: number): void {
        if (!this.showing) {
            return;
        }
        this.timer -= dt;
        if (this.timer <= 0) {
            this.hide();
        }
    }

    /** 显示详情卡。 */
    public show(): void {
        this.ensureFrame();
        if (!this.detailFrame) {
            return;
        }
        this.build();
        this.showing = true;
        this.timer = Math.max(0.1, this.showTime);
        if (this.debugLog) {
            console.log('[TowerDetailPopup] 弹出棋子详情，' + this.showTime + ' 秒后自动收起');
        }
    }

    /** 收起。 */
    public hide(): void {
        this.showing = false;
        this.timer = 0;
        if (this.card && this.card.isValid) {
            this.card.removeFromParent();
            this.card.destroy();
        }
        this.card = null;
        if (this.mask && this.mask.isValid) {
            this.mask.removeFromParent();
            this.mask.destroy();
        }
        this.mask = null;
    }

    /* ------------------------------------------------------------------ */

    private ensureFrame(): void {
        const configured = this.detailFrame as unknown as SpriteFrame;
        if (configured && (configured as any).texture) {
            return;
        }
        try {
            resources.load(this.detailResourcePath, SpriteFrame, (err, frame) => {
                if (!err && frame) {
                    this.detailFrame = frame;
                }
            });
        } catch (e) {
            // 加载不到就不显示
        }
    }

    private build(): void {
        this.hide();

        const mask = new Node('DetailMask');
        mask.layer = this.node.layer;
        this.node.addChild(mask);
        const maskTransform = mask.addComponent(UITransform);
        maskTransform.setAnchorPoint(0.5, 0.5);
        maskTransform.setContentSize(4000, 4000);
        // ⚠️ 这里不能用 UIOpacity=0：Cocos 会连子节点的触摸一起跳过，
        // 于是"点其他地方关闭"就失效了。画一层几乎不可见的暗底即可（还能看出是弹层）。
        const maskGraphics = mask.addComponent(Graphics);
        maskGraphics.fillColor = new Color(18, 16, 14, 26);
        maskGraphics.rect(-2000, -2000, 4000, 4000);
        maskGraphics.fill();
        const maskTouch = new Node('TouchArea');
        maskTouch.layer = this.node.layer;
        mask.addChild(maskTouch);
        const touchTransform = maskTouch.addComponent(UITransform);
        touchTransform.setAnchorPoint(0.5, 0.5);
        touchTransform.setContentSize(4000, 4000);
        maskTouch.on(Node.EventType.TOUCH_END, () => {
            if (this.closeOnBlankTouch) {
                this.hide();
            }
        }, this);
        this.mask = mask;

        const card = new Node('DetailCard');
        card.layer = this.node.layer;
        this.node.addChild(card);
        card.setPosition(0, 0, 0);
        const transform = card.addComponent(UITransform);
        transform.setAnchorPoint(0.5, 0.5);

        const frame = this.detailFrame as SpriteFrame;
        const ratio = frame.rect.height / Math.max(1, frame.rect.width);
        const w = this.width;
        const h = w * ratio;
        transform.setContentSize(w, h);

        const sprite = card.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.type = Sprite.Type.SIMPLE;
        sprite.trim = false;
        sprite.spriteFrame = frame;

        card.on(Node.EventType.TOUCH_END, (event: any) => {
            if (event) {
                event.propagationStopped = true;   // 点卡片本身不关闭
            }
        }, this);
        this.card = card;
    }
}
