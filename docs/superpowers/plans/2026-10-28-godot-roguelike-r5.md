# Godot 肉鸽无尽 R5 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 R4 上加入跨局装备系统：3 槽（头盔/兵器/护甲）、品质、随机词条、精英掉落、属性生效、本地存档、简单装备面板。

**Architecture:** `EquipmentManagerData`（Autoload `Equipment`）持有库存/已穿/存档；`PathSpawner` 精英掉落装备；`TowerBase.apply_traits` 与 `TowerPlacement` 读取装备倍率；`EquipmentPanel` 运行时 UI，按 E 开关。

**Tech Stack:** Godot 4.7.2、GDScript、`FileAccess` JSON。

**Spec:** `docs/superpowers/specs/2026-10-27-godot-roguelike-design.md` §16。

## Global Constraints

- 装备跨局保留；重开不重置；只有精英/Boss 掉落（R5 先精英）。
- 3 槽，每槽一件；穿新覆盖旧，旧件丢弃；穿上不可脱下。
- 属性：伤害、射程、攻速、棋气消耗；不引入暴击/棋子生命（无对应系统）。
- 每个任务结束跑 `godot --headless --path godot --script res://tests/run_tests.gd`。
- 新增 `class_name` 后跑一次 `--import`。

---

### Task 1: EquipmentManager + 数据/存档

**Files:**
- Create: `godot/scripts/autoload/equipment_manager.gd`
- Modify: `godot/project.godot`（Autoload）
- Create: `godot/tests/test_equipment.gd`
- Modify: `godot/tests/run_tests.gd`

**Interfaces:**
- `EquipmentManagerData`：`static instance`、`inventory: Array[Dictionary]`、`equipped: Dictionary`（head/hand/body）、`signal changed`、`add_random_drop()->Dictionary`、`equip(index)->bool`、`get_totals()->Dictionary`、`damage_mult()`、`range_mult()`、`interval_mult()`、`cost_mult()`、`save()`、`load()`、`reset_for_test()`。
- 品质：白/绿/蓝/紫/橙，权重 50/30/15/4/1；词条 1-3 条（伤害/射程/攻速/棋气消耗）。
- 存档：`user://equipment.json`；`persistence_enabled` 可在测试关闭。

- [ ] Step 1: 写失败测试：drop 字段合法；equip 覆盖同槽、旧件消失；totals/multipliers；to_dict/from_dict 往返；reset。
- [ ] Step 2: 跑测试确认失败。
- [ ] Step 3: 实现 EquipmentManager + 存档。
- [ ] Step 4: 跑测试通过；提交 `feat(godot): add equipment manager`。

---

### Task 2: 装备属性 + 精英掉落

**Files:**
- Modify: `godot/scripts/towers/tower_base.gd`（装备伤害/射程/攻速倍率）
- Modify: `godot/scripts/towers/tower_che.gd` / `tower_pao.gd` / `tower_ma.gd`（apply_traits 乘装备倍率）
- Modify: `godot/scripts/towers/tower_placement.gd`（棋气消耗倍率）
- Modify: `godot/scripts/core/path_spawner.gd`（精英掉装备 + toast）
- Create: `godot/tests/test_equipment_stats.gd`
- Modify: `godot/tests/run_tests.gd`

**Interfaces:**
- `TowerBase`：`equipment_damage_mult()`、`equipment_range_mult()`、`equipment_interval_mult()`。
- `TowerPlacement`：`effective_cost()` 乘 `EquipmentManager.cost_mult()`；合成/放置同价。
- 精英死亡：`EquipmentManager.add_random_drop()` + Toast「精英掉落装备：…」。

- [ ] Step 1: 写失败测试：穿装备后塔伤害/射程/攻速变化；放塔费用下降；精英掉落装备。
- [ ] Step 2: 跑测试确认失败。
- [ ] Step 3: 实现属性接线 + 掉落。
- [ ] Step 4: 跑测试通过；提交 `feat(godot): apply equipment stats and drops`。

---

### Task 3: 装备面板 + 集成 + README

**Files:**
- Create: `godot/scripts/ui/equipment_panel.gd`
- Create: `godot/scenes/ui/equipment_panel.tscn`
- Modify: `godot/scenes/main.tscn`
- Modify: `godot/scripts/core/run_controller.gd`（reset 关闭面板）
- Modify: `godot/tests/integration.gd`
- Modify: `godot/README.md`

- [ ] Step 1: 面板：3 槽 + 库存列表，点库存穿到对应槽；按 E 开关；显示品质/词条。
- [ ] Step 2: 集成：精英掉落装备 → 穿上 → 放塔属性变化 → 面板开关 → 重开仍保留。
- [ ] Step 3: 跑单测 + 集成 + 120 帧启动；更新 README。
- [ ] Step 4: 提交 + 整条分支 review；修 Critical/Important；推送。

---

## 后续

- 地形/过河卒、精英特殊攻击、真实 Java 后端排行榜。
