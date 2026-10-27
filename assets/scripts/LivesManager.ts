import {
    _decorator,
    Color,
    Component,
    Label,
    Node,
    UITransform,
    Vec2,
} from 'cc';
import { PathMover } from './PathMover';
import { GameOverPopup } from './GameOverPopup';

const { ccclass, property } = _decorator;

/**
 * 基地生命值（本作的"败北倒计时"）：
 *  - 开局 `initialLives`（默认 10）；
 *  - 敌方棋子**走完整条路径、踏进我方基地**时扣 1，该棋子随即消失；
 *  - 扣到 0 → 游戏结束：清场 + 弹 `GameOverPopup`，并让波次停摆
 *    （`WaveManager` 每帧查 `LivesManager.shared.isGameOver`）。
 *
 * **"踏进基地"怎么判定**：用 `PathMover.lapCount`。`PathMover` 在
 * `traveled >= totalLength` 那一刻做 `traveled %= totalLength` + `laps += 1`
 * （也就是"走到路径终点"），所以本组件**每帧轮询**每个棋子"上次看到的圈数"，
 * 涨了就说明它这一帧刚到基地。
 * 用轮询而不是给 `PathMover` 加回调 —— 和 `WaveManager` 轮询
 * `EnemySpawner.aliveCount` 是同一路子，不跟移动逻辑耦合。
 *
 * ⚠️ 基地定在**路径终点**（`Path` 的最后一个控制点，画面右侧）。
 * 想挪到起点的话得改判定方式 —— 起点没有现成的"到达"信号。
 *
 * 组件不用在场景里预先摆：`GameBootstrap` 启动时会保证 Canvas 上有它
 * （已手动摆过就不重复加）。
 */
@ccclass('LivesManager')
export class LivesManager extends Component {
    @property({ tooltip: '初始生命值' })
    public initialLives = 20;

    @property({ tooltip: '敌人容器节点名' })
    public enemyContainerName = 'Enemies';

    @property({ tooltip: '生命文字节点名（Canvas 下会自动建一个）' })
    public labelName = 'LivesText';

    @property({ tooltip: '生命文字位置（画布坐标）；棋气在 (-540, 300)，这个摆它下面' })
    public labelPos = new Vec2(-540, 246);

    @property({ tooltip: '生命文字前缀' })
    public labelPrefix = '生命 ';

    @property({ tooltip: '打控制台日志' })
    public debugLog = true;

    private static inst: LivesManager | null = null;

    /** 全局唯一实例（和 `QiManager.shared` 一样）。 */
    public static get shared(): LivesManager | null {
        return LivesManager.inst;
    }

    private lives = 0;
    private over = false;
    /** 每个棋子"上次看到的圈数"，用来发现"这一帧刚进基地"。 */
    private seen = new Map<Node, number>();
    private label: Label | null = null;

    public get value(): number {
        return this.lives;
    }

    public get isGameOver(): boolean {
        return this.over;
    }

    protected onLoad(): void {
        LivesManager.inst = this;
        this.lives = Math.max(0, Math.floor(this.initialLives));
        this.label = this.ensureLabel();
        this.refresh();
        this.log('初始生命 ' + this.lives);
    }

    protected onDestroy(): void {
        if (LivesManager.inst === this) {
            LivesManager.inst = null;
        }
    }

    protected update(): void {
        if (this.over) {
            return;
        }
        const box = this.resolveEnemies();
        if (!box) {
            return;
        }

        // 清掉已销毁棋子的记录，免得 Map 越涨越大
        for (const node of Array.from(this.seen.keys())) {
            if (!node || !node.isValid) {
                this.seen.delete(node);
            }
        }

        for (const enemy of box.children.slice()) {
            if (!enemy || !enemy.isValid) {
                continue;
            }
            const mover = enemy.getComponent(PathMover);
            if (!mover) {
                continue;
            }
            const laps = mover.lapCount;
            const before = this.seen.get(enemy) || 0;
            if (laps > before) {
                this.seen.set(enemy, laps);
                this.reachBase(enemy);
                if (this.over) {
                    return;
                }
            }
        }
    }

    /** 直接扣血（调试 / 关卡脚本用）。 */
    public lose(amount = 1): void {
        const n = Math.max(0, Math.floor(amount));
        if (this.over || n <= 0) {
            return;
        }
        this.lives = Math.max(0, this.lives - n);
        this.refresh();
        this.log('生命 -' + n + '，剩余 ' + this.lives);
        if (this.lives <= 0) {
            this.gameOver();
        }
    }

    /** 生命回满并解除结束态（不重载场景手动重开时用）。 */
    public reset(): void {
        this.over = false;
        this.seen.clear();
        this.lives = Math.max(0, Math.floor(this.initialLives));
        this.refresh();
        this.log('生命重置为 ' + this.lives);
    }

    /* ------------------------------------------------------------------ */

    /** 一个棋子踏进基地：扣 1 血并让它消失。 */
    private reachBase(enemy: Node): void {
        const name = enemy.name;
        this.lives = Math.max(0, this.lives - 1);
        this.refresh();
        this.seen.delete(enemy);
        enemy.removeFromParent();
        enemy.destroy();
        this.log(name + ' 进入基地，剩余生命 ' + this.lives);
        if (this.lives <= 0) {
            this.gameOver();
        }
    }

    private gameOver(): void {
        if (this.over) {
            return;
        }
        this.over = true;
        this.log('生命归零，游戏结束');

        // 清场：免得结束画面后面还有棋子在走
        const box = this.resolveEnemies();
        if (box) {
            for (const child of box.children.slice()) {
                child.removeFromParent();
                child.destroy();
            }
        }
        this.seen.clear();

        const popup = this.resolveGameOverPopup();
        if (popup && typeof popup.show === 'function') {
            popup.show();
        } else {
            this.log('找不到 GameOverPopup，结束弹窗没弹出');
        }
    }

    /** 找 Canvas 上挂着的 GameOverPopup；没有就现场挂一个。 */
    private resolveGameOverPopup(): GameOverPopup | null {
        const canvas = this.resolveCanvas();
        if (!canvas) {
            return null;
        }
        let comp = canvas.getComponent(GameOverPopup);
        if (!comp) {
            for (const child of canvas.children) {
                const found = child.getComponent(GameOverPopup);
                if (found) {
                    comp = found;
                    break;
                }
            }
        }
        if (!comp) {
            try {
                comp = canvas.addComponent(GameOverPopup);
            } catch (e) {
                console.warn('[LivesManager] 挂 GameOverPopup 失败', e);
                comp = null;
            }
        }
        return comp && typeof comp.show === 'function' ? comp : null;
    }

    private ensureLabel(): Label | null {
        const canvas = this.resolveCanvas();
        if (!canvas) {
            return null;
        }
        let node = canvas.getChildByName(this.labelName);
        if (!node) {
            node = new Node(this.labelName);
            node.layer = canvas.layer;
            canvas.addChild(node);
            node.setPosition(this.labelPos.x, this.labelPos.y, 0);

            const transform = node.addComponent(UITransform);
            transform.setAnchorPoint(0.5, 0.5);
            transform.setContentSize(240, 44);

            // 样式对齐现有的 QiText：字号 30 / 行高 38 / 白字 / 居中
            const label = node.addComponent(Label);
            label.fontSize = 30;
            label.lineHeight = 38;
            label.color = new Color(255, 255, 255, 255);
            label.horizontalAlign = Label.HorizontalAlign.CENTER;
            label.verticalAlign = Label.VerticalAlign.CENTER;
        }
        return node.getComponent(Label);
    }

    private refresh(): void {
        if (this.label) {
            this.label.string = this.labelPrefix + this.lives;
        }
    }

    private resolveEnemies(): Node | null {
        const canvas = this.resolveCanvas();
        return canvas ? canvas.getChildByName(this.enemyContainerName) : null;
    }

    /** 往上找名为 Canvas 的节点。 */
    private resolveCanvas(): Node | null {
        let node: Node | null = this.node;
        while (node) {
            if (node.name === 'Canvas') {
                return node;
            }
            node = node.parent;
        }
        const scene = this.node.scene;
        return scene ? scene.getChildByName('Canvas') : null;
    }

    private log(msg: string): void {
        if (this.debugLog) {
            console.log('[LivesManager] ' + msg);
        }
    }
}
