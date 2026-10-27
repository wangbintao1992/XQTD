import {
    _decorator,
    Color,
    Component,
    director,
    EventTouch,
    game,
    Graphics,
    input,
    Input,
    Label,
    Node,
    UITransform,
} from 'cc';

const { ccclass, property } = _decorator;

/**
 * 游戏结束弹窗（生命归零时由 `LivesManager` 弹出）：
 *
 *        游戏结束
 *   胜败乃兵家常事，大侠请重新来过
 *   [ 返回首页 ]  [ 重试 ]  [ 看广告 ]
 *
 *  - **重试**：重新开局 —— 重新加载当前场景（路径重新随机，棋气 / 生命 / 波次全部重置）；
 *  - **返回首页**：**预留**。现在没接首页场景，动作等同于「重试」；
 *    以后有首页时把 `homeSceneName` 填上，它就会去加载那个场景；
 *  - **看广告**：**预留**。还没接广告 SDK，现在只打日志（所以点了"没动作"是正常的）。
 *
 * 面板 / 按钮全是运行时用 Graphics + Label 现画的（零素材）。
 *
 * ⚠️ **`traceInput` 是给"点了没反应"开的口子**（默认开）：会在**每一层**打印触摸事件 ——
 * 全局 `input` → `Canvas` → `GameOverMask` → `GameOverPanel` → 各 `Button`。
 * 打出来的东西能直接回答三件事：
 *   1. 引擎**有没有**收到触摸（看有没有 `INPUT TOUCH_START`）；
 *   2. 触摸**先落到哪个节点**（第一个出现的 `<- touch-start`）；
 *   3. 按钮**有没有**拿到 `TOUCH_END`（只有拿到才会触发 click）。
 * 排查完把 `traceInput` 关掉即可（属性面板可改）。
 *
 * ⚠️ 另外三处是踩过坑之后定的写法，别改回去：
 *  1. **新建节点的 layer 不能直接用 `Canvas.layer`**。本项目 `Canvas` 自己挂在 UI_2D，
 *     但它的**子节点全是 DEFAULT**，而且场景里**能正常点击**的节点
 *     （`CardPicker`、`Card_che`、`QiText`…）恰恰都是 DEFAULT —— 用 `uiLayer()` 跟随它们。
 *  2. **按钮用 `Button` 组件**（`Button.EventType.CLICK`）或裸 `TOUCH_END`，两种都行；
 *     关键在 `TOUCH_END` 必须命中。
 *  3. **遮罩只当视觉层，不注册任何输入事件**：`PointerEventDispatcher` 只在"注册了触摸的节点"
 *     里按优先级挑第一个命中的，遮罩一旦注册（`BlockInputEvents` / `TOUCH_*`）就会
 *     跟面板上的按钮抢同一个触摸。项目里 `CardPicker` 的遮罩就是这个模式。
 */
@ccclass('GameOverPopup')
export class GameOverPopup extends Component {
    @property({ tooltip: '标题' })
    public title = '游戏结束';

    @property({ tooltip: '主文案' })
    public message = '胜败乃兵家常事，大侠请重新来过';

    @property({ tooltip: '「重试」加载的场景名；留空 = 自动取当前场景名' })
    public gameSceneName = '';

    @property({ tooltip: '兜底场景名：运行时拿不到场景名时用它（本项目主场景是 bg）' })
    public fallbackSceneName = 'bg';

    @property({ tooltip: '「返回首页」加载的场景名（预留）；留空 = 暂时也走重试' })
    public homeSceneName = '';

    @property({ tooltip: '面板宽（设计单位）' })
    public panelWidth = 640;

    @property({ tooltip: '面板高（设计单位）' })
    public panelHeight = 372;

    @property({ tooltip: '按钮宽（设计单位）' })
    public buttonWidth = 176;

    @property({ tooltip: '按钮高（设计单位）' })
    public buttonHeight = 58;

    @property({ tooltip: '按钮间距（设计单位）' })
    public buttonGap = 20;

    @property({ tooltip: '打控制台日志' })
    public debugLog = true;

    @property({ tooltip: '打触摸诊断日志（排查「点了没反应」：谁收到了 TOUCH_START / TOUCH_END）' })
    public traceInput = true;

    private mask: Node | null = null;
    private panel: Node | null = null;
    private rawTouchHooked = false;
    private canvasTraced = false;

    public get isOpen(): boolean {
        return !!this.panel;
    }

    /** 弹出结束面板。 */
    public show(): void {
        this.hide();
        const host = this.node;

        // 1) 最外层：引擎的原始输入。这一条如果不打，说明触摸压根没到引擎（点错窗口等）
        //    触摸和鼠标都听：桌面端鼠标点击在引擎内部走 MOUSE_DOWN / MOUSE_UP
        if (this.traceInput && !this.rawTouchHooked) {
            input.on(Input.EventType.TOUCH_START, this.onRawTouchStart, this);
            input.on(Input.EventType.TOUCH_END, this.onRawTouchEnd, this);
            input.on(Input.EventType.MOUSE_DOWN, this.onRawTouchStart, this);
            input.on(Input.EventType.MOUSE_UP, this.onRawTouchEnd, this);
            this.rawTouchHooked = true;
        }

        this.buildMask(host);
        this.buildPanel(host);

        // 2) 根节点：触摸有没有冒泡到 Canvas
        if (this.traceInput && !this.canvasTraced) {
            this.traceTouch(host, 'Canvas(root)');
            this.canvasTraced = true;
        }

        if (this.debugLog) {
            console.log('[GameOverPopup] 弹出结束面板，按钮层 = ' + this.uiLayer(host));
        }
    }

    /** 收起。 */
    public hide(): void {
        this.destroyNode(this.panel);
        this.panel = null;
        this.destroyNode(this.mask);
        this.mask = null;
    }

    /* --------------------------- 三个按钮的动作 --------------------------- */

    /**
     * 「重试」：重新开局。
     * ⚠️ 预览 / 运行时 `director.getScene().name` 可能是**空字符串**（实测三端预览里都是 ''），
     * 那 `loadScene('')` 会被下面的 `if (!name)` 挡掉 → 表现就是"点了按钮没反应"。
     * 所以这里按 面板配置 → 当前场景名 → `fallbackSceneName` 的顺序兜底。
     */
    private restart(): void {
        const scene = director.getScene();
        const name = this.gameSceneName
            || (scene && scene.name ? scene.name : '')
            || this.fallbackSceneName;
        this.loadScene(name, '重试');
    }

    /** 「返回首页」：预留，现在也走重试。 */
    private onHome(): void {
        if (this.homeSceneName) {
            this.loadScene(this.homeSceneName, '返回首页');
            return;
        }
        this.log('「返回首页」是预留入口，暂时按「重试」处理');
        this.restart();
    }

    /** 「看广告」：预留，还没接广告 SDK。 */
    private onAd(): void {
        this.log('「看广告」是预留入口（还没接广告 SDK），当前不做任何事');
    }

    private loadScene(name: string, why: string): void {
        if (!name) {
            // 连兜底场景名都没有：退到 game.restart()（重启到启动场景，不需要场景名）
            console.warn('[GameOverPopup] ' + why + '：拿不到场景名，退回 game.restart()');
            this.hide();
            this.fallbackRestart();
            return;
        }
        this.log(why + ' → 重新加载场景 ' + name);
        this.hide();
        // 双保险：loadScene 失败（场景不在 bundle / 平台不支持）时退回 game.restart()。
        // 只有 loadScene 一条路的话，它一失败就变成"点了没反应"（面板已 hide，游戏却没重开）。
        try {
            director.loadScene(name, (err) => {
                if (err) {
                    console.error('[GameOverPopup] 重新加载场景失败，退回 game.restart()', name, err);
                    this.fallbackRestart();
                }
            });
        } catch (e) {
            console.error('[GameOverPopup] 重新加载场景抛异常，退回 game.restart()', name, e);
            this.fallbackRestart();
        }
    }

    private fallbackRestart(): void {
        try {
            game.restart();
        } catch (e2) {
            console.error('[GameOverPopup] game.restart() 也失败了', e2);
        }
    }

    /* ------------------------------ 面板构建 ------------------------------ */

    /** 全屏暗底 + 挡住上层点击（结束态不该还能操作棋盘）。 */
    private buildMask(host: Node): void {
        const mask = new Node('GameOverMask');
        mask.layer = this.uiLayer(host);
        host.addChild(mask);
        const transform = mask.addComponent(UITransform);
        transform.setAnchorPoint(0.5, 0.5);
        transform.setContentSize(4000, 4000);
        const g = mask.addComponent(Graphics);
        g.fillColor = new Color(12, 10, 9, 176);
        g.rect(-2000, -2000, 4000, 4000);
        g.fill();
        // ⚠️ 遮罩**不注册任何输入事件**（纯视觉层），见类注释第 3 条。
        this.traceTouch(mask, 'GameOverMask');
        this.mask = mask;
    }

    private buildPanel(host: Node): void {
        const panel = new Node('GameOverPanel');
        panel.layer = this.uiLayer(host);
        host.addChild(panel);
        panel.setPosition(0, 0, 0);

        const w = this.panelWidth;
        const h = this.panelHeight;
        const transform = panel.addComponent(UITransform);
        transform.setAnchorPoint(0.5, 0.5);
        transform.setContentSize(w, h);

        // 宣纸色底 + 墨色描边
        const g = panel.addComponent(Graphics);
        g.fillColor = new Color(238, 229, 213, 250);
        g.roundRect(-w / 2, -h / 2, w, h, 18);
        g.fill();
        g.lineWidth = 3;
        g.strokeColor = new Color(70, 62, 54, 220);
        g.roundRect(-w / 2, -h / 2, w, h, 18);
        g.stroke();

        this.makeLabel(panel, this.title, 0, h / 2 - 64, 40, new Color(58, 48, 42, 255));
        this.makeLabel(panel, this.message, 0, h / 2 - 142, 26, new Color(96, 84, 74, 255));

        // 三个按钮横排
        const bw = this.buttonWidth;
        const gap = this.buttonGap;
        const y = -h / 2 + 76;
        const startX = -((bw * 3 + gap * 2) / 2) + bw / 2;
        this.makeButton(panel, '返回首页', startX, y, new Color(122, 113, 102, 235), () => this.onHome());
        this.makeButton(panel, '重试', startX + bw + gap, y, new Color(150, 52, 44, 235), () => this.restart());
        this.makeButton(panel, '看广告', startX + (bw + gap) * 2, y, new Color(122, 113, 102, 235), () => this.onAd());

        this.traceTouch(panel, 'GameOverPanel');
        this.panel = panel;
    }

    private makeLabel(parent: Node, text: string, x: number, y: number, size: number, color: Color): Label {
        const node = new Node('Text');
        node.layer = parent.layer;
        parent.addChild(node);
        node.setPosition(x, y, 0);

        const transform = node.addComponent(UITransform);
        transform.setAnchorPoint(0.5, 0.5);
        transform.setContentSize(this.panelWidth - 80, size * 1.5);

        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = size;
        label.lineHeight = Math.round(size * 1.25);
        label.color = color;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        return label;
    }

    private makeButton(parent: Node, text: string, x: number, y: number, fill: Color, onClick: () => void): Node {
        const node = new Node('Button');
        node.layer = parent.layer;
        parent.addChild(node);
        node.setPosition(x, y, 0);

        const w = this.buttonWidth;
        const h = this.buttonHeight;
        const transform = node.addComponent(UITransform);
        transform.setAnchorPoint(0.5, 0.5);
        transform.setContentSize(w, h);

        const g = node.addComponent(Graphics);
        g.fillColor = fill;
        g.roundRect(-w / 2, -h / 2, w, h, h / 2);
        g.fill();

        const labelNode = new Node('Label');
        labelNode.layer = parent.layer;
        node.addChild(labelNode);
        const label = labelNode.addComponent(Label);
        label.string = text;
        label.fontSize = 26;
        label.lineHeight = 32;
        label.color = new Color(248, 244, 236, 255);
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;

        // 诊断监听要挂在业务回调**之前**，否则按钮自己 stopPropagation 后看不到
        this.traceTouch(node, 'Button:' + text);

        node.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
            if (event) {
                event.propagationStopped = true;
            }
            onClick();
        }, this);
        return node;
    }

    /* ---------------------------- 触摸诊断 ---------------------------- */

    /** 引擎级原始输入：能证明"触摸到底有没有进引擎"。 */
    private onRawTouchStart(event: EventTouch): void {
        const p = event ? event.getUILocation() : null;
        console.log('[GameOverPopup][trace] INPUT TOUCH_START'
            + (p ? ' @' + Math.round(p.x) + ',' + Math.round(p.y) : ''));
    }

    private onRawTouchEnd(event: EventTouch): void {
        const p = event ? event.getUILocation() : null;
        console.log('[GameOverPopup][trace] INPUT TOUCH_END'
            + (p ? ' @' + Math.round(p.x) + ',' + Math.round(p.y) : ''));
    }

    /**
     * 给某个节点挂四种触摸事件的日志。**不打 `propagationStopped`**，
     * 所以能完整看到事件先落到谁身上、又冒泡经过了谁。
     */
    private traceTouch(node: Node, label: string): void {
        if (!this.traceInput) {
            return;
        }
        const types = [
            Node.EventType.TOUCH_START,
            Node.EventType.TOUCH_MOVE,
            Node.EventType.TOUCH_END,
            Node.EventType.TOUCH_CANCEL,
        ];
        for (const type of types) {
            node.on(type, (event: EventTouch) => {
                const p = event ? event.getUILocation() : null;
                console.log('[GameOverPopup][trace] ' + label + ' <- ' + type
                    + (p ? ' @' + Math.round(p.x) + ',' + Math.round(p.y) : ''));
            }, this);
        }
    }

    /* ----------------------------- 工具 ----------------------------- */

    /**
     * 新建 UI 节点该用哪一层。
     * ⚠️ 不要直接用 `Canvas.layer`：本项目 Canvas 自己是 UI_2D，但它的子节点全是 DEFAULT，
     * 场景里能正常点击的节点也都是 DEFAULT。跟随 Canvas 下已有的 UI 节点这一层。
     */
    private uiLayer(host: Node): number {
        for (const child of host.children) {
            if (child.name === 'Camera') {
                continue;
            }
            return child.layer;
        }
        return host.layer;
    }

    private destroyNode(node: Node | null): void {
        if (node && node.isValid) {
            node.removeFromParent();
            node.destroy();
        }
    }

    private log(msg: string): void {
        if (this.debugLog) {
            console.log('[GameOverPopup] ' + msg);
        }
    }
}
