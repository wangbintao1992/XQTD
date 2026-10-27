/**
 * 全局「是否已开局」的开关（首页 → 游戏 的门闩）。
 *
 * 打开游戏先看到首页（`HomeMenu`），此时 `isStarted === false`：
 * 驱动游戏的核心逻辑（`PathNetworkRunner` 出兵 / 走位、`WaveManager` 波次）
 * 每帧都会检查这个开关，未开局就整体停摆 —— 所以首页上不会有人出兵、棋子不动。
 *
 * 点了「无尽模式」（`HomeMenu.onEndless`）→ `GameSession.start()` 放行，
 * 现有游戏逻辑照常自动跑起来（不需要每个系统各自"启动"）。
 *
 * 不依赖 Cocos 组件，纯静态状态；重开一局（重载场景）时回落到未开局。
 */
export class GameSession {
    private static started = false;

    /** 是否已经开局（进了游戏、首页已收起）。 */
    public static get isStarted(): boolean {
        return GameSession.started;
    }

    /** 开局：放行游戏逻辑。 */
    public static start(): void {
        GameSession.started = true;
    }

    /** 回到首页 / 重开：回到未开局状态。 */
    public static reset(): void {
        GameSession.started = false;
    }
}
