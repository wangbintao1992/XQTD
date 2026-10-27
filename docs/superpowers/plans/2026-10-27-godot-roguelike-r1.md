# Godot 肉鸽无尽 R1 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在现有 Godot M1/M2 上加入肉鸽骨架：局内状态、10+ 词条、每波三选一生效、真无尽波次曲线、HUD 词条展示。

**Architecture:** 纯新增 `RunState`（Autoload）+ `TraitPool`（数据）；复用 `CardPicker`/`WaveManager` 接词条选择；塔/放塔/出兵按 `RunState` 动态改数值。

**Tech Stack:** Godot 4.7.2、GDScript。

**Spec:** `docs/superpowers/specs/2026-10-27-godot-roguelike-design.md`

## Global Constraints

- 不改现有路径网络、20×20 吸附、塔价 50、生命 20（R1 先沿用）。
- 词条唯一；重开时 `RunState.reset()`。
- 每个任务结束跑 `godot --headless --path godot --script res://tests/run_tests.gd`。
- 新增 `class_name` 后跑一次 `--import`。

---

### Task 1: RunState + TraitPool

**Files:**
- Create: `godot/scripts/autoload/run_state.gd`
- Create: `godot/scripts/data/trait_pool.gd`
- Modify: `godot/project.godot`
- Create: `godot/tests/test_run_state.gd`
- Create: `godot/tests/test_trait_pool.gd`
- Modify: `godot/tests/run_tests.gd`

**Interfaces:**
- `RunState`：`signal traits_changed`、`var traits: Array[String]`、`var wave:int`、`add_trait(id)`、`has_trait(id)`、`reset()`；`static instance`。
- `TraitPool`：`TRAITS: Dictionary`、`ids()`、`title(id)`、`desc(id)`、`pick_three(owned: Array) -> Array[String]`、`apply_on_pick(id)`。

- [ ] Step 1: 写失败测试：add/has/reset；TraitPool 至少 10 条、id 唯一、pick_three 不返回已拥有（不足时从全部补）。
- [ ] Step 2: 跑测试确认失败。
- [ ] Step 3: 实现 RunState/TraitPool，`project.godot` 加 `RunState` autoload。
- [ ] Step 4: 跑测试通过；提交 `feat(godot): add roguelike run state and trait pool`。

---

### Task 2: CardPicker 词条三选一

**Files:**
- Modify: `godot/scripts/ui/card_picker.gd`
- Create: `godot/tests/test_card_picker_traits.gd`
- Modify: `godot/tests/run_tests.gd`

**Interfaces:**
- `CardPicker.open_with_traits(ids: Array[String], seconds: float, done: Callable = Callable())`
- `CardPicker.selected_trait: String`
- 卡片显示 `TraitPool.title/desc`；选中后 `selected_trait = ids[index]`。

- [ ] Step 1: 写失败测试：打开 3 个词条 → 卡上有 title；`pick(1)` 后 `selected_trait == ids[1]`；`done` 只回调一次。
- [ ] Step 2: 跑测试确认失败。
- [ ] Step 3: 实现 `open_with_traits` + 卡片 Label；保持 `open_with_timeout` 兼容 M2。
- [ ] Step 4: 跑测试通过；提交 `feat(godot): show traits in card picker`。

---

### Task 3: 真无尽 + 每波选词条

**Files:**
- Modify: `godot/scripts/core/wave_manager.gd`
- Modify: `godot/scripts/core/path_spawner.gd`
- Modify: `godot/scripts/core/run_controller.gd`
- Modify: `godot/scripts/main.gd`
- Modify: `godot/scripts/ui/hud.gd`（`set_wave` 支持 max<=0）
- Create: `godot/tests/test_endless.gd`
- Modify: `godot/tests/run_tests.gd`

**Interfaces:**
- `WaveManager.endless: bool`、`base_round:int=20`、`count_growth=1.15`、`hp_growth=1.1`、`speed_growth=1.02`。
- `WaveManager` 清空 → `CardPicker.open_with_traits(TraitPool.pick_three(...))` → 回调 `RunState.add_trait` + `TraitPool.apply_on_pick` → 3s → `wave += 1`（endless 时不受 max_wave 限制）。
- `PathSpawner.hp_mult`、`speed_mult`；`spawn_one` 按倍率生成。
- `RunController.reset_run` 清 `RunState`、`spawner.hp_mult/speed_mult`。

- [ ] Step 1: 写失败测试：endless 下 wave 6/7 递增；第 1 波 count=20、hp_mult=1；第 3 波 count≈26、hp_mult≈1.21；选卡回调写入词条。
- [ ] Step 2: 跑测试确认失败。
- [ ] Step 3: 实现无尽曲线 + 选卡接线。
- [ ] Step 4: 跑测试通过；提交 `feat(godot): add endless waves and trait rewards`。

---

### Task 4: 词条效果

**Files:**
- Modify: `godot/scripts/towers/tower_base.gd`
- Modify: `godot/scripts/towers/tower_che.gd`
- Modify: `godot/scripts/towers/tower_pao.gd`
- Modify: `godot/scripts/towers/tower_ma.gd`
- Modify: `godot/scripts/towers/tower_placement.gd`
- Modify: `godot/scripts/core/path_spawner.gd`
- Modify: `godot/scripts/main.gd`
- Create: `godot/tests/test_traits_effects.gd`
- Modify: `godot/tests/run_tests.gd`

**Interfaces:**
- 塔统一 `apply_traits()`；`TowerBase._ready` 后由子类调用；`main` 在 `RunState.traits_changed` 时刷新所有塔。
- `free_horse`：`TowerMa._blocker_for` 返回 null。
- `free_cannon`：`TowerPao` 免炮架、直射 `damage`。
- `double_chariot`：`TowerChe` 伤害 ×2。
- `range_plus`：所有塔 `attack_range *= 1.25`。
- `cooldown_halve`：所有塔 `fire_interval *= 0.75`。
- `free_place`：`TowerPlacement.effective_cost()==0`。
- `qi_boost`：`PathSpawner` 击杀棋气 ×1.5。
- `qi_gift`：拾取时 `Qi.earn(100)`。
- `kumou`：拾取时 `Lives.lose(5)`；塔伤害 ×1.5。

- [ ] Step 1: 写失败测试：各词条开关下数值/行为正确。
- [ ] Step 2: 跑测试确认失败。
- [ ] Step 3: 实现各效果 + `main` 刷新。
- [ ] Step 4: 跑测试通过；提交 `feat(godot): apply roguelike trait effects`。

---

### Task 5: HUD 词条展示 + 集成 + README

**Files:**
- Modify: `godot/scenes/ui/hud.tscn`
- Modify: `godot/scripts/ui/hud.gd`
- Modify: `godot/tests/integration.gd`
- Modify: `godot/README.md`

- [ ] Step 1: HUD 右上加 `TraitLabel`，`RunState.traits_changed` 刷新。
- [ ] Step 2: 集成：开局 → 直接清场触发选卡 → 选词条 → 词条在 RunState 里 → 波次 > 5 不结束 → 重开清空。
- [ ] Step 3: 跑单测 + 集成 + 120 帧启动；更新 README。
- [ ] Step 4: 提交 `docs(godot): add roguelike R1 README and integration`。

---

## 后续

- R2：每 10 波异变、每 5 波精英、传染/美人计/绝杀减速。
- R3：马后炮/双车错/重炮组合技、排行榜桩。
