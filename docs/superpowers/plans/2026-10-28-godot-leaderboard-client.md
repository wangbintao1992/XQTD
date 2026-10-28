# Godot 真实排行榜客户端实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 把 `server/` 的 Java 排行榜接到 Godot：玩家 ID 持久化、结束上报、启动/刷新拉 Top、排行榜面板。

**Architecture:** `LeaderboardData`（Autoload `Leaderboard`）负责本地最高、玩家身份存档、HTTP 上报/查询；`LeaderboardPanel` 运行时 UI，按 L 开关；`RunController` 在 game over 时上报并重置面板。

**Tech Stack:** Godot 4.7.2、GDScript、`HTTPRequest`、`FileAccess` JSON；后端 `server/`（Spring Boot，默认 `http://127.0.0.1:8080`）。

## Global Constraints

- 离线不阻塞游戏：本地最高仍立即生效；网络失败只更新面板状态。
- 玩家 ID 首次生成 UUID 并写入 `user://leaderboard_profile.json`，跨局/跨启动保留。
- 服务地址：环境变量 `XQTD_LEADERBOARD_URL` > 项目设置 `xqtd/leaderboard_url` > 默认 `http://127.0.0.1:8080`。
- 测试默认关闭持久化与 HTTP，避免写真实 `user://` 和联网。
- 每个任务结束跑 `godot --headless --path godot --script res://tests/run_tests.gd`。

---

### Task 1: LeaderboardData 网络 + 身份 + 存档

**Files:**
- Modify: `godot/scripts/autoload/leaderboard.gd`
- Modify: `godot/project.godot`
- Modify: `godot/tests/test_leaderboard.gd`

**Interfaces:**
- `player_id`、`player_name`、`server_url`、`top_entries`、`my_rank`、`online`、`last_error`、`persistence_enabled`、`http_enabled`。
- `signal top_updated(entries)`、`signal sync_changed(online, message)`、`signal submitted(accepted, rank, best_wave)`。
- `refresh()`、`set_player_name(name)`、`_apply_report_response(d)`、`_apply_top_response(d)`、`_apply_player_response(d)`、`save_profile()`、`load_profile()`、`reset_for_test()`。

- [ ] Step 1: 写失败测试：UUID 格式、profile 磁盘往返、上报响应更新、Top/个人响应解析、HTTP 关闭时 submit 仍更新本地。
- [ ] Step 2: 跑测试确认失败。
- [ ] Step 3: 实现身份生成/存档/请求/解析；项目设置加默认 URL。
- [ ] Step 4: 跑测试通过；提交 `feat(godot): add leaderboard server sync`。

---

### Task 2: 排行榜面板

**Files:**
- Create: `godot/scripts/ui/leaderboard_panel.gd`
- Create: `godot/scenes/ui/leaderboard_panel.tscn`
- Modify: `godot/scenes/main.tscn`
- Modify: `godot/scripts/core/run_controller.gd`
- Create: `godot/tests/test_leaderboard_panel.gd`
- Modify: `godot/tests/run_tests.gd`

**Interfaces:**
- `LeaderboardPanel.show_panel()/hide_panel()/toggle()/refresh()`；按 L 开关。
- 显示服务器状态、我的最高/排名、Top 10、改名输入 + 刷新按钮。
- `RunController.reset_run()` 关闭面板。

- [ ] Step 1: 写失败测试：面板开关、Top 条目渲染、改名持久化、刷新不联网（http off）。
- [ ] Step 2: 跑测试确认失败。
- [ ] Step 3: 实现面板 + 主场景挂载 + reset 关闭。
- [ ] Step 4: 跑测试通过；提交 `feat(godot): add leaderboard panel`。

---

### Task 3: 结束上报 + 启动拉取 + 集成 + README

**Files:**
- Modify: `godot/scripts/core/run_controller.gd`
- Modify: `godot/tests/integration.gd`
- Modify: `godot/README.md`

- [ ] Step 1: game over 上报最终波数；启动时 `refresh()`（HTTP 开启时）。
- [ ] Step 2: 集成：本地最高上报 → 面板开关 → 重开保留；测试全程关闭 HTTP。
- [ ] Step 3: 跑单测 + 集成 + 120 帧启动；更新 README。
- [ ] Step 4: 提交 + review；修 Critical/Important；推送。

---

## 后续

- 公网部署/HTTPS/限流；BattleReport 服务端复算反作弊；账号体系。
