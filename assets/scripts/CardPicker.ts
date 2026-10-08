import {
    _decorator,
    Color,
    Component,
    Graphics,
    Label,
    Node,
    Sprite,
    SpriteFrame,
    tween,
    UIOpacity,
    UITransform,
    Vec3,
    resources,
} from 'cc';

const { ccclass, property } = _decorator;

interface CardSlot {
    node: Node;
    opacity: UIOpacity;
    charges: number;
    chargeLabel: Label;
    selected: boolean;
}

/**
 * 每轮清空后弹出的 3 选 1 卡片：
 *  - 三张 card 素材横向排开，卡片下面各有一个「更换」按钮；
 *  - 每张卡有 `swapChargesPerCard` 次更换机会，用完按钮变灰；
 *  - 点卡片 = 选中（放大、其余变暗），短暂停留后自动收起。
 *
 * 按用户要求：**只做流程**，不实现选中的效果。
 */
@ccclass('CardPicker')
export class CardPicker extends Component {
    @property({ tooltip: '卡片贴图在 resources 下的路径' })
    public cardResourcePath = 'textures/card/spriteFrame';

    @property({ type: SpriteFrame, tooltip: '卡片贴图（留空则按上面的路径加载）' })
    public cardFrame: SpriteFrame | null = null;

    @property({ tooltip: '卡片宽度（设计单位）' })
    public cardWidth = 248;

    @property({ tooltip: '卡片高度' })
    public cardHeight = 139;

    @property({ tooltip: '卡片间距' })
    public spacing = 52;

    @property({ tooltip: '每张卡的更换次数' })
    public swapChargesPerCard = 2;

    @property({ tooltip: '按钮高度' })
    public buttonHeight = 46;

    @property({ tooltip: '卡片与按钮的间距' })
    public buttonGap = 14;

    @property({ tooltip: '选中后停留多久收起（秒）' })
    public pickDelay = 0.45;

    @property({ tooltip: '变暗时的不透明度' })
    public dimOpacity = 110;

    @property({ tooltip: '倒计时结束还没选，就自动选第一张' })
    public autoPickFirst = true;

    @property({ tooltip: '倒计时提示（挂 RoundTip）' })
    public tipLabelName = 'RoundTip';

    @property({ tooltip: '打控制台日志' })
    public debugLog = true;

    private slots: CardSlot[] = [];
    private mask: Node | null = null;
    private picked = false;
    private timeoutTotal = 0;
    private timeoutLeft = 0;
    private doneCb: (() => void) | null = null;
    private tipLabel: Label | null = null;

    protected onLoad(): void {
        // 关键：提前把贴图加载好，否则第一次弹出时卡片是空白的（运行时看不到卡）
        this.ensureFrame();
        const parent = this.node.parent;
        const tip = parent ? parent.getChildByName(this.tipLabelName) : null;
        this.tipLabel = tip ? tip.getComponent(Label) : null;
    }

    protected update(dt: number): void {
        if (!this.isOpen || this.timeoutTotal <= 0 || this.picked) {
            return;
        }
        this.timeoutLeft -= dt;
        this.refreshTip();
        if (this.timeoutLeft <= 0) {
            if (this.autoPickFirst) {
                if (this.debugLog) {
                    console.log('[CardPicker] 倒计时结束，自动选第一张');
                }
                this.pick(0);
            } else {
                this.close();
            }
        }
    }

    /** 选卡的剩余秒数（给 WaveManager 显示用）。 */
    public get remainingPickTime(): number {
        return Math.max(0, this.timeoutLeft);
    }

    public get isPicking(): boolean {
        return this.isOpen && !this.picked;
    }

    /** 带倒计时的弹出：`seconds` 秒内没选就自动选第一张；选完/收起后回调 `done`。 */
    public openWithTimeout(seconds: number, done?: () => void): void {
        this.doneCb = done || null;
        this.open();
        this.timeoutTotal = Math.max(0, seconds);
        this.timeoutLeft = this.timeoutTotal;
        this.refreshTip();
    }

    public get isOpen(): boolean {
        return this.slots.length > 0;
    }

    /** 弹出卡片选择。 */
    public open(): void {
        if (this.isOpen) {
            return;
        }
        this.ensureFrame();
        this.buildMask();
        this.buildCards();
        this.picked = false;
        this.timeoutTotal = 0;
        this.timeoutLeft = 0;
        if (this.debugLog) {
            console.log('[CardPicker] 弹出 3 选 1，每张 ' + this.swapChargesPerCard + ' 次更换');
        }
    }

    /** 收起。 */
    public close(): void {
        for (const slot of this.slots) {
            if (slot.node && slot.node.isValid) {
                slot.node.removeFromParent();
                slot.node.destroy();
            }
        }
        this.slots = [];
        if (this.mask && this.mask.isValid) {
            this.mask.removeFromParent();
            this.mask.destroy();
        }
        this.mask = null;
        this.picked = false;
        if (this.tipLabel) {
            this.tipLabel.string = '';
        }
        const cb = this.doneCb;
        this.doneCb = null;
        if (cb) {
            cb();
        }
    }

    /** 显示/刷新选卡倒计时提示。 */
    private refreshTip(): void {
        if (this.tipLabel && this.isOpen) {
            this.tipLabel.string = '选择 ' + Math.max(1, Math.ceil(this.timeoutLeft));
        }
    }

    /** 手动换一张卡（只走流程：重置外观，不换内容）。 */
    public swap(index: number): void {
        const slot = this.slots[index];
        if (!slot || slot.selected || slot.charges <= 0) {
            return;
        }
        slot.charges -= 1;
        slot.chargeLabel.string = '更换 ' + slot.charges;
        if (slot.charges <= 0) {
            slot.chargeLabel.color = new Color(150, 145, 140, 255);
        }
        // 轻微晃动，给个反馈
        tween(slot.node)
            .to(0.06, { scale: new Vec3(0.97, 0.97, 1) })
            .to(0.08, { scale: new Vec3(1, 1, 1) })
            .start();
        if (this.debugLog) {
            console.log('[CardPicker] 第 ' + (index + 1) + ' 张卡更换，剩余 ' + slot.charges);
        }
    }

    /* ------------------------------------------------------------------ */

    private ensureFrame(): void {
        const configured = this.cardFrame as unknown as SpriteFrame;
        if (configured && (configured as any).texture) {
            return;
        }
        try {
            resources.load(this.cardResourcePath, SpriteFrame, (err, frame) => {
                if (!err && frame) {
                    this.cardFrame = frame;
                    // ⚠️ 关键：卡片可能已经在加载完成之前就建好了（那时是空白的），
                    // 这里补一次，否则那批卡会永远没有贴图 —— 表现就是"弹了但看不见卡"。
                    this.applyFrameToCards();
                }
            });
        } catch (e) {
            // 加载不到就只显示按钮，不阻塞流程
        }
    }

    /** 把已加载的贴图补给还没贴图的卡片。 */
    private applyFrameToCards(): void {
        if (!this.cardFrame) {
            return;
        }
        for (const slot of this.slots) {
            if (!slot.node || !slot.node.isValid) {
                continue;
            }
            const sprite = slot.node.getComponent(Sprite);
            if (sprite && !sprite.spriteFrame) {
                sprite.spriteFrame = this.cardFrame;
            }
            const g = slot.node.getComponent(Graphics);
            if (g) {
                g.clear();      // 去掉兜底底板
            }
        }
    }

    /** 铺一层全屏遮罩：挡住下面的操作，也统一坐标。 */
    private buildMask(): void {
        const node = new Node('CardPickerMask');
        node.layer = this.node.layer;
        this.node.addChild(node);
        node.setPosition(0, 0, 0);
        const transform = node.addComponent(UITransform);
        transform.setAnchorPoint(0.5, 0.5);
        transform.setContentSize(4000, 4000);
        const g = node.addComponent(Graphics);
        // 半透明底：压暗棋盘，突出卡片
        g.fillColor = new Color(20, 18, 16, 120);
        g.rect(-2000, -2000, 4000, 4000);
        g.fill();
        this.mask = node;
    }

    private buildCards(): void {
        const n = 3;
        const step = this.cardWidth + this.spacing;
        const startX = -((n - 1) * step) / 2;
        for (let i = 0; i < n; i += 1) {
            const card = new Node('Card_' + i);
            card.layer = this.node.layer;
            this.node.addChild(card);
            card.setPosition(startX + i * step, 0, 0);

            const transform = card.addComponent(UITransform);
            transform.setAnchorPoint(0.5, 0.5);
            transform.setContentSize(this.cardWidth, this.cardHeight);

            const sprite = card.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.type = Sprite.Type.SIMPLE;
            sprite.trim = false;
            sprite.spriteFrame = this.cardFrame;

            if (!this.cardFrame) {
                // 贴图还没就绪时先画个纸色底，至少能看见"这里有张卡"
                const g = card.addComponent(Graphics);
                g.fillColor = new Color(236, 228, 212, 235);
                g.roundRect(-this.cardWidth / 2, -this.cardHeight / 2, this.cardWidth, this.cardHeight, 10);
                g.fill();
            }

            const opacity = card.addComponent(UIOpacity);
            opacity.opacity = 255;

            card.on(Node.EventType.TOUCH_END, () => this.pick(i), this);

            const button = this.makeButton(card, i);
            this.slots.push({
                node: card,
                opacity,
                charges: this.swapChargesPerCard,
                chargeLabel: button,
                selected: false,
            });
        }
    }

    /** 卡片下方的小按钮：「更换 N」。 */
    private makeButton(card: Node, index: number): Label {
        const node = new Node('Swap');
        node.layer = card.layer;
        card.addChild(node);
        node.setPosition(0, -(this.cardHeight / 2 + this.buttonGap + this.buttonHeight / 2), 0);

        const transform = node.addComponent(UITransform);
        transform.setAnchorPoint(0.5, 0.5);
        transform.setContentSize(this.cardWidth * 0.72, this.buttonHeight);

        const g = node.addComponent(Graphics);
        const w = this.cardWidth * 0.72;
        const h = this.buttonHeight;
        g.fillColor = new Color(58, 54, 50, 210);
        g.roundRect(-w / 2, -h / 2, w, h, h / 2);
        g.fill();

        const labelNode = new Node('Label');
        labelNode.layer = card.layer;
        node.addChild(labelNode);
        const label = labelNode.addComponent(Label);
        label.string = '更换 ' + this.swapChargesPerCard;
        label.fontSize = 24;
        label.lineHeight = 30;
        label.color = new Color(240, 234, 226, 255);

        node.on(Node.EventType.TOUCH_END, (event: any) => {
            if (event) {
                event.propagationStopped = true;   // 别让点按钮变成选卡
            }
            this.swap(index);
        }, this);
        return label;
    }

    /** 选中一张卡：高亮它、压暗别的，然后按流程收起。 */
    private pick(index: number): void {
        if (this.picked) {
            return;
        }
        const slot = this.slots[index];
        if (!slot) {
            return;
        }
        this.picked = true;
        slot.selected = true;

        for (let i = 0; i < this.slots.length; i += 1) {
            const s = this.slots[i];
            if (i === index) {
                s.opacity.opacity = 255;
                tween(s.node).to(0.12, { scale: new Vec3(1.06, 1.06, 1) }).start();
            } else {
                tween(s.opacity).to(0.12, { opacity: this.dimOpacity }).start();
            }
        }
        if (this.debugLog) {
            console.log('[CardPicker] 选中第 ' + (index + 1) + ' 张（仅流程，无后续逻辑）');
        }
        this.scheduleOnce(() => this.close(), Math.max(0.05, this.pickDelay));
    }
}
