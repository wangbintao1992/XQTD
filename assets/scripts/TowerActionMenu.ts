import {
    _decorator,
    Button,
    Color,
    Component,
    Graphics,
    Label,
    Node,
    UITransform,
    Vec3,
} from 'cc';
import { QiManager } from './QiManager';

const { ccclass, property } = _decorator;

/**
 * 点一下**已放置**的棋子，在它**左右两侧**各弹出一个选项：
 *
 *   左「详情」 → 弹出棋子介绍卡（**保持显示**，点空白处才收起）
 *   右「卖出」 → 移除棋子，把原棋气的 `sellRatio`（默认 80%）退回棋气余额
 *
 * 约定：
 *  - 卖出返还的基数取**放置这个棋子时花的棋气**。`TowerDragSource` 在放置那一刻
 *    把它记在棋子节点上（`node.towerCost`），所以以后"不同棋子不同价"自动就对；
 *  - 万一节点上没有记录（例如在编辑器里手摆的棋子），退回 `fallbackCost`；
 *  - 选项是**运行时现建**的临时节点，不用在场景里预先摆。
 *    `TowerDragSource` 点棋子时先 `getComponent` 找本组件，找不到就在 Canvas 上
 *    `addComponent` 挂一个（和 CardPicker 一样，零场景改动）。
 *
 * ⚠️ 两处沿用项目里踩过的坑的写法，别改回去：
 *  1. 遮罩**不能**用 `UIOpacity.opacity = 0`（Cocos 会连子节点的触摸一起跳过，
 *     "点空白处取消"就失效了），用几乎不可见的 Graphics 暗底代替；
 *  2. 按钮的触摸靠 UITransform 真尺寸 + 实色 Graphics 底板，别把底板设成透明。
 */
@ccclass('TowerActionMenu')
export class TowerActionMenu extends Component {
    @property({ tooltip: '选项中心离棋子中心的水平距离（设计单位），棋子约 62 宽' })
    public offsetX = 96;

    @property({ tooltip: '按钮宽（设计单位）' })
    public buttonWidth = 108;

    @property({ tooltip: '按钮高（设计单位）' })
    public buttonHeight = 48;

    @property({ tooltip: '按钮圆角半径（最大取 buttonHeight/2）' })
    public buttonRadius = 24;

    @property({ tooltip: '详情弹窗节点名（本节点同级里找）' })
    public detailPopupName = 'TowerDetail';

    @property({ tooltip: '卖出返还比例（原棋气的百分比，0.8 = 80%）' })
    public sellRatio = 0.8;

    @property({ tooltip: '棋子节点上没有花费记录时的兜底棋气' })
    public fallbackCost = 50;

    @property({ tooltip: '「详情」按钮底色' })
    public detailColor = new Color(58, 54, 50, 235);

    @property({ tooltip: '「卖出」按钮底色' })
    public sellColor = new Color(150, 52, 44, 235);

    @property({ tooltip: '打控制台日志' })
    public debugLog = true;

    private menu: Node | null = null;
    private mask: Node | null = null;

    public get isOpen(): boolean {
        return !!this.menu;
    }

    /** 在棋子的左右弹出选项；重复调用会先把上一组收掉。 */
    public showFor(tower: Node): void {
        this.close();
        if (!tower || !tower.isValid) {
            return;
        }

        const host = this.node;     // 本组件挂在 Canvas 上，选项也建在它下面
        this.buildMask(host);
        this.buildMenu(host, tower);

        if (this.debugLog) {
            console.log('[TowerActionMenu] 弹出选项 @ ' + tower.name + '，卖出返还 ' + this.refundOf(tower));
        }
    }

    /** 收起选项（不动棋子）。 */
    public close(): void {
        this.destroyNode(this.menu);
        this.menu = null;
        this.destroyNode(this.mask);
        this.mask = null;
    }

    /* --------------------------- 选项构建 --------------------------- */

    /** 铺一层几乎不可见的全屏遮罩：点空白处 = 取消。 */
    private buildMask(host: Node): void {
        const mask = new Node('TowerActionMask');
        mask.layer = this.uiLayer(host);
        host.addChild(mask);
        const transform = mask.addComponent(UITransform);
        transform.setAnchorPoint(0.5, 0.5);
        transform.setContentSize(4000, 4000);
        const g = mask.addComponent(Graphics);
        g.fillColor = new Color(18, 16, 14, 30);
        g.rect(-2000, -2000, 4000, 4000);
        g.fill();

        // 遮罩本身就是"点空白 = 取消"的按钮（用引擎自带的 Button，比手搓 TouchArea 稳）
        const blank = mask.addComponent(Button);
        blank.transition = Button.Transition.NONE;
        mask.on(Button.EventType.CLICK, () => this.close(), this);

        this.mask = mask;
    }

    private buildMenu(host: Node, tower: Node): void {
        const menu = new Node('TowerAction');
        menu.layer = this.uiLayer(host);
        host.addChild(menu);

        const anchor = this.toHostSpace(host, tower.getWorldPosition());
        menu.setPosition(anchor.x, anchor.y, 0);

        // 左：详情（保持显示）
        this.makeButton(menu, '详情', -this.offsetX, 0, this.detailColor, () => this.onDetail());
        // 右：卖出（返还写进按钮上，一眼看到能回多少）
        this.makeButton(menu, '卖出 +' + this.refundOf(tower), this.offsetX, 0, this.sellColor, () => this.onSell(tower));

        this.menu = menu;
    }

    /** 圆角底板 + Label 的按钮（零素材，和 CardPicker 的「更换」按钮同一路子）。 */
    private makeButton(parent: Node, text: string, x: number, y: number, fill: Color, onClick: () => void): Node {
        const node = new Node('Option');
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
        g.roundRect(-w / 2, -h / 2, w, h, Math.max(0, Math.min(this.buttonRadius, h / 2)));
        g.fill();

        const labelNode = new Node('Label');
        labelNode.layer = parent.layer;
        node.addChild(labelNode);
        const label = labelNode.addComponent(Label);
        label.string = text;
        label.fontSize = 24;
        label.lineHeight = 30;
        label.color = new Color(246, 241, 233, 255);

        // 用引擎自带的 Button 组件触发（比裸 TOUCH_END 稳）
        const button = node.addComponent(Button);
        button.transition = Button.Transition.NONE;
        node.on(Button.EventType.CLICK, onClick, this);
        return node;
    }

    /* ---------------------------- 两个动作 ---------------------------- */

    /** 「详情」：弹出棋子介绍卡并**保持**显示（0 = 不自动收起，点空白处才关）。 */
    private onDetail(): void {
        const popup = this.resolveDetailPopup();
        this.close();
        if (popup && typeof popup.show === 'function') {
            popup.show(0);
        } else if (this.debugLog) {
            console.log('[TowerActionMenu] 找不到 ' + this.detailPopupName + '（TowerDetailPopup），详情没弹出');
        }
    }

    /** 「卖出」：返还棋气 → 移除棋子。 */
    private onSell(tower: Node): void {
        if (!tower || !tower.isValid) {
            this.close();
            return;
        }
        const name = tower.name;
        const back = this.refundOf(tower);

        const qi = QiManager.shared;
        if (qi && back > 0) {
            qi.earn(back);
        }

        tower.removeFromParent();
        tower.destroy();
        this.close();

        if (this.debugLog) {
            console.log('[TowerActionMenu] 卖出 ' + name + '，返还 ' + back + ' 棋气');
        }
    }

    /* ----------------------------- 工具 ----------------------------- */

    /** 卖出返还多少棋气：放置时的花费 × sellRatio（四舍五入）。 */
    private refundOf(tower: Node): number {
        return Math.max(0, Math.round(this.costOf(tower) * Math.max(0, this.sellRatio)));
    }

    /** 棋子节点上记的花费；没有就用兜底值。 */
    private costOf(tower: Node): number {
        const stored = (tower as any).towerCost;
        if (typeof stored === 'number' && stored > 0) {
            return stored;
        }
        return Math.max(0, Math.floor(this.fallbackCost));
    }

    /** 世界坐标 -> host 节点局部坐标（棋子可能在别的父节点下）。 */
    private toHostSpace(host: Node, world: Vec3): Vec3 {
        const transform = host.getComponent(UITransform);
        if (transform) {
            const local = transform.convertToNodeSpaceAR(world);
            return new Vec3(local.x, local.y, 0);
        }
        return world.clone();
    }

    private resolveDetailPopup(): any {
        const here = this.node.getChildByName(this.detailPopupName);
        const node = here || (this.node.parent ? this.node.parent.getChildByName(this.detailPopupName) : null);
        return node ? node.getComponent('TowerDetailPopup') : null;
    }

    private destroyNode(node: Node | null): void {
        if (node && node.isValid) {
            node.removeFromParent();
            node.destroy();
        }
    }

    /**
     * 新建 UI 节点该用哪一层。
     * ⚠️ 不要直接用 `Canvas.layer`：本项目 Canvas 自己是 UI_2D，但它的子节点全是 DEFAULT，
     * 场景里能正常点击的节点（CardPicker / Card_che / QiText…）也都是 DEFAULT。
     * 跟随 Canvas 下已有的 UI 节点这一层，别跟着 Canvas 走。
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
}
