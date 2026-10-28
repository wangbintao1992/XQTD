# Godot 肉鸽无尽 R6 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在路径上加入河/山/桥地形区域，影响敌人速度；敌人过河后获得「过河卒」加速。

**Architecture:** 新增 `TerrainSystem`（Node2D，静态区域 + 视觉圆/标签）；`PathWalker` 每帧按当前位置查询地形倍率；过河后记录一次 `river_buff`。

**Tech Stack:** Godot 4.7.2、GDScript。

**Spec:** `docs/superpowers/specs/2026-10-27-godot-roguelike-design.md` §17。

## Global Constraints

- 地形只影响路径上的敌人移动，不改塔/经济。
- 区域用设计坐标定义，上屏统一走 `Coords`。
- 每个任务结束跑 `godot --headless --path godot --script res://tests/run_tests.gd`。
- 新增 `class_name` 后跑一次 `--import`。

---

### Task 1: TerrainSystem + PathWalker

**Files:**
- Create: `godot/scripts/core/terrain_system.gd`
- Modify: `godot/scenes/main.tscn`（Terrain 节点）
- Modify: `godot/scripts/entities/path_walker.gd`（地形倍率 + 过河 buff）
- Create: `godot/tests/test_terrain.gd`
- Modify: `godot/tests/run_tests.gd`

**Interfaces:**
- `TerrainSystem`：`static instance`、`ZONES`（河/山/桥）、`type_at(stage_pos)->String`、`speed_mult_at(stage_pos)->float`。
  - 河：速度 ×0.8；山：×0.7；桥：×1.1；区域外 ×1.0。
- `PathWalker`：在河内减速；离开河后 `river_buff=1.15`（过河卒），后续一直生效。

- [ ] Step 1: 写失败测试：区域命中/倍率；walker 在河里 1s 只走 80；区域外 100。
- [ ] Step 2: 跑测试确认失败。
- [ ] Step 3: 实现 TerrainSystem + 视觉圆/标签 + walker 倍率。
- [ ] Step 4: 跑测试通过；提交 `feat(godot): add terrain zones`。

---

### Task 2: 集成 + README + review

**Files:**
- Modify: `godot/tests/integration.gd`
- Modify: `godot/README.md`

- [ ] Step 1: 集成断言 Terrain 节点存在、河区命中；重开不残留 buff（敌人清空即无状态）。
- [ ] Step 2: 跑单测 + 集成 + 120 帧启动；全绿。
- [ ] Step 3: README 补 R6；提交 `docs(godot): add R6 README and integration`。
- [ ] Step 4: 整条分支 review；修 Critical/Important；推送。

---

## 后续（R7）

- 精英特殊攻击（黑马免暂停、黑车/黑炮眩晕塔）。
- 真实后端排行榜；M3 水墨视觉/布局/性能。
