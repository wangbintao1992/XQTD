# Godot 肉鸽无尽 R2 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 R1 上加入每 10 波棋局异变、每 5 波精英黑棋、美人计/绝杀减速两条 R2 词条。

**Architecture:** 纯新增 `MutationPool`/`EliteKinds`；`RunState` 增加 `mutation`；`WaveManager` 在 5/10 波节点调用；塔/出兵按异变倍率重算；精英复用 `Enemy` 场景，用黑棋贴图 + 高血量 + 高奖励。

**Tech Stack:** Godot 4.7.2、GDScript。

**Spec:** `docs/superpowers/specs/2026-10-27-godot-roguelike-design.md`

## Global Constraints

- 沿用 R1 的路径/布防/经济；不改 M1/M2 行为。
- 异变、精英、词条只在无尽模式生效；重开清空。
- 每个任务结束跑 `godot --headless --path godot --script res://tests/run_tests.gd`。
- 新增 `class_name` 后跑一次 `--import`。

---

### Task 1: 棋局异变

**Files:**
- Create: `godot/scripts/data/mutation_pool.gd`
- Modify: `godot/scripts/autoload/run_state.gd`（`mutation`、`set_mutation`、`mutation_changed`）
- Modify: `godot/scripts/towers/tower_base.gd`（mutation 倍率）
- Modify: `godot/scripts/towers/tower_che.gd` / `tower_pao.gd` / `tower_ma.gd`（`tower_kind`）
- Modify: `godot/scripts/core/wave_manager.gd`（第 10 波设置异变；hp/speed 倍率）
- Modify: `godot/scripts/core/path_spawner.gd`（hp/speed 已存在，接异变）
- Modify: `godot/scripts/main.gd`（`mutation_changed` 刷新塔）
- Modify: `godot/scenes/ui/hud.tscn`、`godot/scripts/ui/hud.gd`（异变文字）
- Create: `godot/tests/test_mutation.gd`
- Modify: `godot/tests/run_tests.gd`

**Interfaces:**
- `MutationPool`：`MUTATIONS`、`ids()`、`title(id)`、`desc(id)`、`pick() -> String`、`tower_damage_mult(kind)`、`tower_range_mult(kind)`、`tower_interval_mult(kind)`、`enemy_hp_mult()`、`enemy_speed_mult()`。
- `RunStateData.mutation: String`、`set_mutation(id)`、`signal mutation_changed`；`reset()` 清空。
- 异变：`cannon_weak_horse_strong`（炮伤害 ×0.7、马伤害 ×1.3/攻速 ×0.8）、`chariot_short_fast`（车射程 ×0.75、小怪移速 ×1.2）、`headwind`（怪物血量 ×1.5、塔伤害 ×1.5）。
- `WaveManager`：无尽下 `wave % 10 == 0` 时 `RunStateData.set_mutation(MutationPool.pick())`；`_apply_wave_scaling` 把异变倍率乘进 `hp_mult/speed_mult`。

- [ ] Step 1: 写失败测试：`MutationPool` 3 条、塔倍率、`RunStateData.set_mutation/reset`、`hp_mult/speed_mult`。
- [ ] Step 2: 跑测试确认失败。
- [ ] Step 3: 实现异变数据/状态/塔倍率/波次触发/HUD。
- [ ] Step 4: 跑测试通过；提交 `feat(godot): add wave mutations`。

---

### Task 2: 精英黑棋

**Files:**
- Modify: `godot/scripts/data/enemy_kinds.gd`（`ELITES`）
- Modify: `godot/scripts/core/path_spawner.gd`（`set_elite`、`elite_kind`、首只精英、掉落）
- Modify: `godot/scripts/core/wave_manager.gd`（第 5 波设置精英）
- Create: `godot/tests/test_elite.gd`
- Modify: `godot/tests/run_tests.gd`

**Interfaces:**
- `EnemyKinds.ELITES`：黑马/黑车/黑炮，`elite:true`，高 hp/qiReward/lifeCost。
- `PathSpawner.set_elite(kind: Dictionary)`、`clear_elite()`；`deploy()` 后第一只使用精英 kind。
- 精英死亡：给随机未拥有词条（`TraitPool.pick_one`）；没有则 +100 棋气；Toast「精英掉落：…」。

- [ ] Step 1: 写失败测试：`set_elite` 后首只 `kind.elite == true`；精英死亡给词条/棋气。
- [ ] Step 2: 跑测试确认失败。
- [ ] Step 3: 实现精英数据/生成/掉落/第 5 波触发。
- [ ] Step 4: 跑测试通过；提交 `feat(godot): add elite enemies`。

---

### Task 3: 美人计 + 绝杀减速

**Files:**
- Modify: `godot/scripts/data/trait_pool.gd`（`meiren`、`slow_on_kill`）
- Modify: `godot/scripts/core/path_spawner.gd`（美人计定时停顿；击杀减速）
- Modify: `godot/scripts/entities/enemy.gd`（`apply_slow`）
- Modify: `godot/scripts/entities/path_walker.gd`（slow 计时）
- Create: `godot/tests/test_r2_traits.gd`
- Modify: `godot/tests/run_tests.gd`

**Interfaces:**
- `meiren`：每 6s 随机让一个敌人 `HitPause.request_pause(1.5)`。
- `slow_on_kill`：敌人死亡时全体敌人 `apply_slow(0.5, 2.0)`。
- `PathWalker`：`slow_factor`、`slow_timer`；`apply_slow(factor, duration)`。

- [ ] Step 1: 写失败测试：`TraitPool` 含两条；`apply_slow` 后速度减半且计时结束恢复；击杀后其他敌人被减速。
- [ ] Step 2: 跑测试确认失败。
- [ ] Step 3: 实现词条/减速/美人计。
- [ ] Step 4: 跑测试通过；提交 `feat(godot): add charm and kill-slow traits`。

---

### Task 4: 集成 + README + review

**Files:**
- Modify: `godot/tests/integration.gd`
- Modify: `godot/README.md`

- [ ] Step 1: 集成用 `debug_finish_wave` 连走到第 10 波，断言第 5 波精英、第 10 波异变、HUD 异变文字、重开清空。
- [ ] Step 2: 跑单测 + 集成 + 120 帧启动；全绿。
- [ ] Step 3: README 补 R2；提交 `docs(godot): add R2 README and integration`。
- [ ] Step 4: 整条分支 review；修 Critical/Important；推送。

---

## 后续（R3）

- 马后炮 / 双车错 / 重炮组合技、墨浪清屏。
- 排行榜 / Java 后端 BattleReport 桩。
