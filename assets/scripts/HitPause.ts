import { _decorator, Component } from 'cc';

const { ccclass, property } = _decorator;

/**
 * 受击暂停（hit-stop）：挂在**敌人身上**，被攻击时由攻击方调 `requestPause()`
 * 暂停移动一小段，让打击有"顿一下"的反馈。
 *
 * 为什么做成独立组件而不是塞进攻击脚本：
 *  - 敌人的移动由 `PathNetworkRunner` 接管（它每帧读 `isPaused` 决定这帧走不走），
 *    所以"谁暂停、暂停多久"要放在敌人身上，攻击方只管发一下；
 *  - 以后别的攻击（炮/马）也能复用同一套，不用各自实现计时。
 *
 * 用法：
 * ```ts
 * const pause = enemy.getComponent(HitPause);
 * if (pause) pause.requestPause(0.12);
 * ```
 * 同一个敌人短时间内被打多次，暂停**取最长**的那个，不会互相覆盖成更短的。
 */
@ccclass('HitPause')
export class HitPause extends Component {
    /** 事件名：暂停生效时在敌人节点上派发，带一个参数 = 本次暂停秒数。 */
    public static readonly EVENT = 'hit-pause';

    @property({ tooltip: '默认受击暂停时长（秒）' })
    public pauseTime = 0.12;

    private timer = 0;

    /** 现在是否处于暂停中（`PathNetworkRunner` 每帧读它）。 */
    public get isPaused(): boolean {
        return this.timer > 0;
    }

    /** 还剩多少秒（调试/UI 用）。 */
    public get remaining(): number {
        return Math.max(0, this.timer);
    }

    /** 请求暂停；不传就用 `pauseTime`。 */
    public requestPause(seconds?: number): void {
        const t = seconds === undefined ? this.pauseTime : seconds;
        if (t <= 0) {
            return;
        }
        this.timer = Math.max(this.timer, t);
        this.node.emit(HitPause.EVENT, t);
    }

    /** 立刻解除暂停（比如这枚棋子要被回收时）。 */
    public clear(): void {
        this.timer = 0;
    }

    protected update(dt: number): void {
        if (this.timer > 0) {
            this.timer = Math.max(0, this.timer - dt);
        }
    }
}
