import { _decorator, Component, Label, Node } from 'cc';

const { ccclass, property } = _decorator;

/**
 * 棋气（本作的"资源/费用"）：
 *  - 开局给 `initialQi`；
 *  - 放塔要花塔自己的 `cost`（在 TowerDragSource 上配），余额不够就放不下去；
 *  - 击杀敌人回 `EnemyHealth.qiReward`。
 *
 * demo 阶段：左上角一个 Label 显示数字，不做样式。
 * 其它脚本通过 `QiManager.shared` 拿到这个实例，不需要互相引用节点。
 */
@ccclass('QiManager')
export class QiManager extends Component {
    @property({ tooltip: '开局棋气' })
    public initialQi = 100;

    @property({ tooltip: '显示棋气的文字节点名（找不到就只算账不显示）' })
    public labelName = 'QiText';

    @property({ tooltip: '前缀文案' })
    public prefix = '棋气 ';

    @property({ tooltip: '打控制台日志' })
    public debugLog = true;

    private static inst: QiManager | null = null;

    /** 全局唯一实例（场景里挂一个就行）。 */
    public static get shared(): QiManager | null {
        return QiManager.inst;
    }

    private qi = 0;
    private label: Label | null = null;

    public get value(): number {
        return this.qi;
    }

    protected onLoad(): void {
        QiManager.inst = this;
        this.qi = Math.max(0, Math.floor(this.initialQi));
        this.label = this.findLabel();
        this.refresh();
    }

    protected onDestroy(): void {
        if (QiManager.inst === this) {
            QiManager.inst = null;
        }
    }

    /** 够不够花。 */
    public canAfford(cost: number): boolean {
        return this.qi >= Math.max(0, Math.floor(cost));
    }

    /** 花钱；不够则返回 false 且不扣。 */
    public spend(cost: number): boolean {
        const c = Math.max(0, Math.floor(cost));
        if (!this.canAfford(c)) {
            return false;
        }
        this.qi -= c;
        this.refresh();
        this.log('花费 ' + c + '，剩余 ' + this.qi);
        return true;
    }

    /** 进账。 */
    public earn(amount: number): void {
        const a = Math.max(0, Math.floor(amount));
        if (a <= 0) {
            return;
        }
        this.qi += a;
        this.refresh();
        this.log('获得 ' + a + '，当前 ' + this.qi);
    }

    /** 直接设定（调试/关卡初始化用）。 */
    public setQi(value: number): void {
        this.qi = Math.max(0, Math.floor(value));
        this.refresh();
    }

    /* ------------------------------------------------------------------ */

    private refresh(): void {
        if (this.label) {
            this.label.string = this.prefix + this.qi;
        }
    }

    private log(msg: string): void {
        if (this.debugLog) {
            console.log('[QiManager] ' + msg);
        }
    }

    private findLabel(): Label | null {
        const here = this.node.getChildByName(this.labelName);
        if (here) {
            return here.getComponent(Label);
        }
        const parent = this.node.parent;
        const sibling = parent ? parent.getChildByName(this.labelName) : null;
        return sibling ? sibling.getComponent(Label) : null;
    }
}
