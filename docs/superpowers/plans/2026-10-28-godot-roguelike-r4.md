# Godot 肉鸽无尽 R4 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 R3 上加入局内棋子合成（同种棋子叠放升级）与天气 Buff（雨/雪/雾/雷暴影响塔/敌人）。

**Architecture:** `TowerBase` 增加 `level/merge`；`TowerPlacement` 在落点检测同种塔并合成；`TowerCard` 带上 `tower_kind`。`WeatherSystem` 暴露静态倍率，`TowerBase.apply_traits` 与 `PathWalker` 读取。

**Tech Stack:** Godot 4.7.2、GDScript。

**Spec:** `docs/superpowers/specs/2026-10-27-godot-roguelike-design.md`

## Global Constraints

- 合成只在棋盘内、同种棋子、等级 < 3；合成消耗卡片棋气，不新增塔。
- 天气 Buff 只影响数值，不阻塞逻辑；未开局/结束仍关闭天气。
- 每个任务结束跑 `godot --headless --path godot --script res://tests/run_tests.gd`。
- 新增 `class_name` 后跑一次 `--import`。

---

### Task 1: 棋子合成

**Files:**
- Modify: `godot/scripts/towers/tower_base.gd`（`level`、`merge_one`、等级倍率）
- Modify: `godot/scripts/towers/tower_che.gd` / `tower_pao.gd` / `tower_ma.gd`（apply_traits 加入等级倍率）
- Modify: `godot/scripts/towers/tower_placement.gd`（`begin_drag` 带 kind；落点同种塔合成）
- Modify: `godot/scripts/ui/tower_card.gd`（`tower_kind` 导出 + 信号带 kind）
- Modify: `godot/scripts/main.gd`（信号签名）
- Modify: `godot/scenes/ui/sidebar.tscn`（三张卡 kind）
- Create: `godot/tests/test_merge.gd`
- Modify: `godot/tests/run_tests.gd`

**Interfaces:**
- `TowerBase.level := 1`、`MAX_LEVEL := 3`、`func merge_one() -> bool`（等级 +1，重算属性）、`func level_damage_mult()`、`level_range_mult()`、`level_interval_mult()`。
- `TowerPlacement.begin_drag(scene, cost, texture, screen_pos=INF, kind="")`；落点 36px 内同 kind 塔 → `merge_one()` + 扣费，不新增塔。
- `TowerCard.tower_kind`；`drag_requested(scene, cost, texture, kind)`。

- [ ] Step 1: 写失败测试：同种塔落点合成到 Lv2，伤害/射程提升、扣 50、塔数不变；异种塔不合成；Lv3 不再合成。
- [ ] Step 2: 跑测试确认失败。
- [ ] Step 3: 实现合成与卡片 kind。
- [ ] Step 4: 跑测试通过；提交 `feat(godot): add tower merging`。

---

### Task 2: 天气 Buff

**Files:**
- Modify: `godot/scripts/core/weather_system.gd`（静态 instance；`tower_damage_mult`/`tower_range_mult`/`tower_interval_mult`/`enemy_speed_mult`）
- Modify: `godot/scripts/towers/tower_base.gd`（apply_traits 乘天气倍率）
- Modify: `godot/scripts/entities/path_walker.gd`（速度乘天气 enemy_speed_mult）
- Modify: `godot/scenes/ui/hud.tscn`、`godot/scripts/ui/hud.gd`（天气文字，可选）
- Create: `godot/tests/test_weather_buff.gd`
- Modify: `godot/tests/run_tests.gd`

**Interfaces:**
- `WeatherSystem` 静态 instance；`rain`：塔间隔 ×0.95、敌人速度 ×0.95；`snow`：塔射程 ×0.9、敌人速度 ×0.9；`fog`：塔伤害 ×0.9；`storm`：塔伤害 ×1.1、塔间隔 ×0.95、敌人速度 ×1.05。
- `TowerBase` 与 `PathWalker` 每帧/重算时读取；无天气/无实例时全部 1.0。

- [ ] Step 1: 写失败测试：各天气倍率；塔 apply_traits 生效；walker 速度生效；无天气 1.0。
- [ ] Step 2: 跑测试确认失败。
- [ ] Step 3: 实现天气倍率 + HUD 天气文字。
- [ ] Step 4: 跑测试通过；提交 `feat(godot): add weather buffs`。

---

### Task 3: 集成 + README + review

**Files:**
- Modify: `godot/tests/integration.gd`
- Modify: `godot/README.md`

- [ ] Step 1: 集成：放两个同种车 → 拖同种卡合成 Lv2，属性提升；切天气后已放置塔/Walker 倍率变化；重开清等级与天气。
- [ ] Step 2: 跑单测 + 集成 + 120 帧启动；全绿。
- [ ] Step 3: README 补 R4；提交 `docs(godot): add R4 README and integration`。
- [ ] Step 4: 整条分支 review；修 Critical/Important；推送。

---

## 后续（R5）

- 装备/器具跨局养成（3 槽、品质、词条、皮肤、存档）。
- 地形/过河卒、精英特殊攻击、真实后端排行榜。
