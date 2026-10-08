import {
    _decorator,
    Color,
    Component,
    Graphics,
    Label,
    Node,
    UITransform,
} from 'cc';
import { EnemySpawner } from './EnemySpawner';

const { ccclass, property } = _decorator;

/**
 * 波次管理：
 *  每轮固定出 `enemiesPerRound` 个卒（交给 EnemySpawner.deploy）；
 *  本轮全部被击杀 → 显示 tip「下一轮 3」倒计时 → 时间到再出一轮；
 *  底部进度条 = 整局进度（波次 + 本轮击杀比例），**随击杀平滑过渡**。
 *
 * 本组件不做"击杀"这件事，只轮询 EnemySpawner 的存活数 —— 不跟战斗逻辑耦合。
 */
@ccclass('WaveManager')
export class WaveManager extends Component {
    @property({ type: Node, tooltip: '出兵器所在节点（Canvas/Enemies）；留空则自动找' })
    public spawnerNode: Node | null = null;

    @property({ tooltip: '每轮出几个卒' })
    public enemiesPerRound = 10;

    @property({ tooltip: '总波次数（进度条满格）' })
    public maxWave = 5;

    @property({ tooltip: '一轮清空后：选卡倒计时（秒），期间波次暂停' })
    public pickTime = 10;

    @property({ tooltip: '选完之后到出兵之间的倒计时（秒）' })
    public roundGap = 3;

    @property({ tooltip: 'tip 文字节点名' })
    public tipLabelName = 'RoundTip';

    @property({ tooltip: '进度条平滑速度（越大越跟手）' })
    public barSmoothSpeed = 5;

    @property({ tooltip: '波次文字节点名' })
    public waveLabelName = 'WaveText';

    @property({ tooltip: '印章节点名' })
    public stampName = 'Stamp';

    @property({ tooltip: '进度条半宽（设计单位）' })
    public barHalfWidth = 210;

    @property({ tooltip: '进度条中心 y（设计单位）' })
    public barY = -292;

    @property({ tooltip: '进度条底的粗细' })
    public barThickness = 7;

    @property({ tooltip: '已完成段的颜色' })
    public fillColor = new Color(178, 58, 44, 235);

    @property({ tooltip: '底槽颜色' })
    public trackColor = new Color(60, 56, 52, 120);

    @property({ tooltip: '一轮清空后回调（挂 CardPicker 之类）；留空则找同级 CardPicker' })
    public onRoundClearedNode: Node | null = null;

    @property({ tooltip: '打控制台日志' })
    public debugLog = true;

    private wave = 1;
    private counting = false;
    private picking = false;
    private countdown = 0;
    private shownProgress = 0;        // 进度条当前显示值（平滑用）
    private spawner: EnemySpawner | null = null;
    private graphics: Graphics | null = null;
    private waveLabel: Label | null = null;
    private tipLabel: Label | null = null;
    private stamp: Node | null = null;

    protected onLoad(): void {
        this.graphics = this.getComponent(Graphics) || this.addComponent(Graphics);
        this.waveLabel = this.findLabel(this.waveLabelName);
        this.tipLabel = this.findLabel(this.tipLabelName);
        this.stamp = this.findNode(this.stampName);
        this.spawner = this.resolveSpawner();
        this.setTipVisible(false);
        this.refresh(true);
    }

    protected update(dt: number): void {
        const spawner = this.spawner || this.resolveSpawner();
        if (!spawner) {
            this.tickBar(dt);
            return;
        }

        if (this.picking) {
            // 选卡期间波次暂停：tip 显示剩余选择时间，由 CardPicker 自己推进倒计时
            const picker = this.findPicker();
            if (this.tipLabel) {
                this.tipLabel.string = '选择 ' + Math.max(1, Math.ceil(picker ? picker.remainingPickTime : 0));
            }
            this.tickBar(dt);
            return;
        }

        if (this.counting) {
            this.countdown -= dt;
            if (this.tipLabel) {
                this.tipLabel.string = '下一轮 ' + Math.max(1, Math.ceil(this.countdown));
            }
            if (this.countdown <= 0) {
                this.counting = false;
                this.setTipVisible(false);
                this.wave = Math.min(this.maxWave, this.wave + 1);
                spawner.count = this.enemiesPerRound;
                spawner.deploy();
                if (this.debugLog) {
                    console.log('[WaveManager] 进入第 ' + this.wave + ' 轮，出兵 ' + this.enemiesPerRound);
                }
            }
            this.tickBar(dt);
            return;
        }

        // 战斗阶段：杀光了 → 先弹卡片选卡（期间波次暂停），选完再倒数出兵
        if (spawner.totalCount > 0 && spawner.aliveCount <= 0) {
            const picker = this.findPicker();
            this.setTipVisible(true);
            if (picker) {
                this.picking = true;
                picker.openWithTimeout(this.pickTime, () => {
                    this.picking = false;
                    this.counting = true;
                    this.countdown = this.roundGap;
                });
                if (this.debugLog) {
                    console.log('[WaveManager] 第 ' + this.wave + ' 轮清空，选卡 ' + this.pickTime + ' 秒（波次暂停）');
                }
            } else {
                this.counting = true;
                this.countdown = this.roundGap;
                if (this.debugLog) {
                    console.log('[WaveManager] 第 ' + this.wave + ' 轮清空，倒计时 ' + this.roundGap + ' 秒');
                }
            }
        }
        this.tickBar(dt);
    }

    /** 手动设波次（调试用）。 */
    public setWave(value: number): void {
        this.wave = Math.max(1, Math.min(this.maxWave, Math.floor(value)));
        this.refresh(true);
    }

    public get currentWave(): number {
        return this.wave;
    }

    /** 整局进度 0..1：已完成的波次 + 本轮击杀比例。 */
    private targetProgress(spawner: EnemySpawner | null): number {
        const perWave = 1 / Math.max(1, this.maxWave);
        const done = this.wave - 1;
        let inside = 0;
        if (spawner && spawner.totalCount > 0) {
            const killed = Math.max(0, spawner.totalCount - spawner.aliveCount);
            inside = Math.min(1, killed / spawner.totalCount);
        }
        return Math.min(1, (done + inside) * perWave);
    }

    private tickBar(dt: number): void {
        const target = this.targetProgress(this.spawner || this.resolveSpawner());
        const k = Math.min(1, Math.max(0, this.barSmoothSpeed) * dt);
        this.shownProgress += (target - this.shownProgress) * k;
        if (Math.abs(target - this.shownProgress) < 0.0005) {
            this.shownProgress = target;
        }
        this.refresh(false);
    }

    /** 重画进度条 + 印章 + 文案。 */
    private refresh(force: boolean): void {
        if (force && this.shownProgress === 0) {
            this.shownProgress = this.targetProgress(this.spawner);
        }
        const progress = Math.max(0, Math.min(1, this.shownProgress));

        if (this.waveLabel) {
            this.waveLabel.string = '波次 ' + this.wave + '/' + this.maxWave;
        }

        const g = this.graphics;
        if (g) {
            const half = this.barHalfWidth;
            const t = this.barThickness;
            g.clear();
            g.lineWidth = t;
            g.strokeColor = this.trackColor;
            g.moveTo(-half, this.barY);
            g.lineTo(half, this.barY);
            g.stroke();
            if (progress > 0) {
                g.lineWidth = t;
                g.strokeColor = this.fillColor;
                g.moveTo(-half, this.barY);
                g.lineTo(-half + half * 2 * progress, this.barY);
                g.stroke();
            }
            g.fillColor = this.trackColor;
            g.circle(-half, this.barY, t * 0.9);
            g.fill();
            g.fillColor = this.fillColor;
            g.circle(-half + half * 2 * progress, this.barY, t * 1.1);
            g.fill();
        }

        if (this.stamp) {
            this.stamp.setPosition(-this.barHalfWidth + this.barHalfWidth * 2 * progress, this.barY, 0);
        }
    }

    private findPicker(): any {
        const node = this.onRoundClearedNode as unknown as Node;
        const target = node && node.isValid ? node : (this.node.parent ? this.node.parent.getChildByName('CardPicker') : null);
        const comp: any = target ? target.getComponent('CardPicker') : null;
        return comp && typeof comp.openWithTimeout === 'function' ? comp : null;
    }

    private setTipVisible(visible: boolean): void {
        const label = this.tipLabel;
        if (label) {
            label.node.active = visible;
            const op = label.node.getComponent('cc.UIOpacity') as any;
            if (op) {
                op.opacity = visible ? 255 : 0;
            }
        }
    }

    private resolveSpawner(): EnemySpawner | null {
        const configured = this.spawnerNode as unknown as Node;
        if (configured && configured.isValid) {
            return configured.getComponent(EnemySpawner);
        }
        const parent = this.node.parent;
        const box = parent ? parent.getChildByName('Enemies') : null;
        return box ? box.getComponent(EnemySpawner) : null;
    }

    private findNode(name: string): Node | null {
        const here = this.node.getChildByName(name);
        if (here) {
            return here;
        }
        const parent = this.node.parent;
        return parent ? parent.getChildByName(name) : null;
    }

    private findLabel(name: string): Label | null {
        const node = this.findNode(name);
        return node ? node.getComponent(Label) : null;
    }
}
