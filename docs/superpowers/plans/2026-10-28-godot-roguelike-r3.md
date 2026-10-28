# Godot 肉鸽无尽 R3 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 R2 上加入象棋杀招组合技（马后炮/双车错/重炮 + 墨浪清屏）与最高波数排行榜桩。

**Architecture:** 新增 `ComboSystem`（Node2D）扫描已放置塔的阵型，命中后对整条线造成清屏伤害 + 墨浪线特效；新增 `LeaderboardData`（Autoload，本地最高波数，后端接口留桩），结束局时提交。

**Tech Stack:** Godot 4.7.2、GDScript。

**Spec:** `docs/superpowers/specs/2026-10-27-godot-roguelike-design.md`

## Global Constraints

- 组合技只在无尽模式；重开清空计时，不重置最高波数（跨局）。
- 组合技触发：阵型存在 + 6s 冷却（低概率可后续调；先保证可见）。
- 每个任务结束跑 `godot --headless --path godot --script res://tests/run_tests.gd`。
- 新增 `class_name` 后跑一次 `--import`。

---

### Task 1: ComboSystem

**Files:**
- Create: `godot/scripts/core/combo_system.gd`
- Modify: `godot/scenes/main.tscn`（加 ComboSystem 节点）
- Modify: `godot/scripts/main.gd`（setup）
- Modify: `godot/scripts/core/run_controller.gd`（reset）
- Create: `godot/tests/test_combo.gd`
- Modify: `godot/tests/run_tests.gd`

**Interfaces:**
- `ComboSystem extends Node2D`：`cooldown:=6.0`、`setup(towers_root, enemies_root)`、`reset()`、`check_combos()->Array[String]`、`try_trigger()->String`。
- 阵型：
  - `ma_pao`：马与炮同列（|x 差|≤24）→ 竖线清屏。
  - `double_che`：两车同列或同行（|x 差|≤24 或 |y 差|≤24）→ 对应线清屏。
  - `double_pao`：两炮同列/同行 → 对应线，范围更宽。
- 清屏：线上 `line_radius` 内敌人 `take_damage(9999)` + 受击暂停；墨浪 `Line2D` 淡出。

- [ ] Step 1: 写失败测试：马+炮同列触发 `ma_pao`，线上敌人死、线外不死；双车/双炮同理。
- [ ] Step 2: 跑测试确认失败。
- [ ] Step 3: 实现 ComboSystem + main/场景/reset。
- [ ] Step 4: 跑测试通过；提交 `feat(godot): add combo skills`。

---

### Task 2: 最高波数排行榜桩

**Files:**
- Create: `godot/scripts/autoload/leaderboard.gd`
- Modify: `godot/project.godot`（Autoload）
- Modify: `godot/scripts/core/run_controller.gd`（结束提交）
- Modify: `godot/scenes/ui/hud.tscn`、`godot/scripts/ui/hud.gd`（最高波数）
- Create: `godot/tests/test_leaderboard.gd`
- Modify: `godot/tests/run_tests.gd`

**Interfaces:**
- `LeaderboardData`：`best_wave:int`、`signal best_changed(value:int)`、`submit(wave:int) -> bool`（只增不减）、`reset_for_test()`；Autoload 名 `Leaderboard`。
- 结束局：`RunController._on_game_over()` 提交 `RunStateData.wave`。
- HUD：右下「最高波数 N」。

- [ ] Step 1: 写失败测试：submit 12→12、submit 5 仍 12、submit 20→20；信号；reset_for_test 清 0。
- [ ] Step 2: 跑测试确认失败。
- [ ] Step 3: 实现 Leaderboard + HUD + 结束提交。
- [ ] Step 4: 跑测试通过；提交 `feat(godot): add best-wave leaderboard stub`。

---

### Task 3: 集成 + README + review

**Files:**
- Modify: `godot/tests/integration.gd`
- Modify: `godot/README.md`

- [ ] Step 1: 集成放马+炮触发组合技，断言清屏/返回值；结束局后最高波数 ≥ 当前波次、HUD 显示。
- [ ] Step 2: 跑单测 + 集成 + 120 帧启动；全绿。
- [ ] Step 3: README 补 R3；提交 `docs(godot): add R3 README and integration`。
- [ ] Step 4: 整条分支 review；修 Critical/Important；推送。

---

## 后续（二期）

- 器具/装备系统、地形/过河卒、更多异变与精英特殊攻击。
- 真正接 Java 后端 BattleReport/排行榜。
