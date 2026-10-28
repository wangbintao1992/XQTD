# Godot 肉鸽无尽 R7 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 给 R2 精英加特殊攻击：黑马免受击暂停、黑车眩晕最近塔、黑炮眩晕最远塔。

**Architecture:** `HitPause` 加 `immune`；`TowerBase` 加 `stun/tick_stun` + `towers` group；`Enemy` 加 `elite_type` 与 5s 技能计时。

**Tech Stack:** Godot 4.7.2、GDScript。

**Spec:** `docs/superpowers/specs/2026-10-27-godot-roguelike-design.md` §3/§12。

## Global Constraints

- 精英技能只对塔生效（塔无生命，用眩晕而非伤害）。
- 黑马：免 HitPause；黑车：最近塔眩晕 1.5s；黑炮：最远塔眩晕 1.0s；冷却 5s。
- 每个任务结束跑 `godot --headless --path godot --script res://tests/run_tests.gd`。
- 新增 `class_name` 后跑一次 `--import`。

---

### Task 1: 黑马免暂停 + 塔眩晕基础

**Files:**
- Modify: `godot/scripts/entities/hit_pause.gd`（`immune`）
- Modify: `godot/scripts/towers/tower_base.gd`（`stun`/`tick_stun`/group）
- Modify: `godot/scripts/towers/tower_che.gd` / `tower_pao.gd` / `tower_ma.gd`（`_process` 先 tick_stun）
- Modify: `godot/scripts/data/enemy_kinds.gd`（`elite_type`）
- Modify: `godot/scripts/entities/enemy.gd`（`elite_type`、黑马免暂停）
- Create: `godot/tests/test_elite_ability.gd`
- Modify: `godot/tests/run_tests.gd`

**Interfaces:**
- `HitPause.immune: bool`；`request_pause` 在 immune 时直接返回。
- `TowerBase.stun(seconds)`、`tick_stun(delta)->bool`、`is_stunned`；`_ready` `add_to_group("towers")`。
- `Enemy.elite_type: String`；黑马 setup 时 `HitPause.immune=true`。

- [ ] Step 1: 写失败测试：immune 拒绝暂停；黑马 setup 后免疫；塔眩晕计时/恢复。
- [ ] Step 2: 跑测试确认失败。
- [ ] Step 3: 实现 immune/stun/group + 塔 `_process` 接入。
- [ ] Step 4: 跑测试通过；提交 `feat(godot): add elite immunity and tower stun`。

---

### Task 2: 黑车/黑炮技能

**Files:**
- Modify: `godot/scripts/entities/enemy.gd`（`_process` 5s 技能；最近/最远塔）
- Modify: `godot/tests/test_elite_ability.gd`
- Modify: `godot/tests/run_tests.gd`（如需）

**Interfaces:**
- `Enemy._use_elite_ability()`：`che` 眩晕最近塔 1.5s；`pao` 眩晕最远塔 1.0s；`ma` 无。
- 冷却 5s；无塔/不在树安全返回。

- [ ] Step 1: 写失败测试：che 眩晕最近塔、pao 眩晕最远塔、ma 不眩晕。
- [ ] Step 2: 跑测试确认失败。
- [ ] Step 3: 实现技能计时 + 选塔。
- [ ] Step 4: 跑测试通过；提交 `feat(godot): add elite tower-stun abilities`。

---

### Task 3: 集成 + README + review

**Files:**
- Modify: `godot/tests/integration.gd`
- Modify: `godot/README.md`

- [ ] Step 1: 集成断言精英 `elite_type` 非空、黑马免疫/黑车眩晕至少一项；重开清眩晕。
- [ ] Step 2: 跑单测 + 集成 + 120 帧启动；全绿。
- [ ] Step 3: README 补 R7；提交 `docs(godot): add R7 README and integration`。
- [ ] Step 4: 整条分支 review；修 Critical/Important；推送。

---

## 后续

- 真实 Java 后端排行榜；M3 水墨视觉/布局/性能。
