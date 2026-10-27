# XQTD Godot 迁移 — M2（全功能对齐）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 M1 基础上补全炮、马、选卡、塔菜单/详情/卖出、天气、Toast 正式样式，使 Godot 版与 Cocos 版功能对齐。

**Architecture:** 沿用 M1 的分层：`TowerBase` 派生 `TowerChe/TowerPao/TowerMa`；UI 用 CanvasLayer + 运行时/场景混合；数据流仍由 `PathSpawner`/`WaveManager`/`RunController` 驱动。塔的点击通过 `TowerBase.clicked` 信号交给 `TowerActionMenu`。

**Tech Stack:** Godot 4.7.2、GDScript、`CPUParticles2D`、无第三方插件。

**Spec:** `docs/superpowers/specs/2026-10-27-godot-port-design.md`

## Global Constraints

- 沿用 M1 的坐标/路径/测试约定；所有新代码走 `Coords`。
- 炮默认必须有炮架；马蹩马腿 = 伤害转移给挡路者（用户未推翻）。
- 第 5 波仍按 A 方案：停在第 5 波反复出；进度条问题 M3 再处理。
- 每个任务结束：`godot --headless --path godot --script res://tests/run_tests.gd` 全绿。
- 测试里取类用 `preload`；新增 `class_name` 后跑一次 `--import`。

## Review Focus

1. **炮的炮架判定**：线上容差 34、炮架可为塔、溅射排除炮架。
2. **马的日字/马腿**：主腿 45、马腿半径 30、挡路者转移伤害。
3. **选卡与波次**：选卡期间波次必须暂停；超时自动选第一张；重开要关掉选卡。
4. **塔菜单/卖出**：返还基于放置时花费的 80%，移除后不再开火。
5. **天气与重置**：每 30 个敌人切换；重开回到第 1 段；表现层不阻塞逻辑。

---

### Task 1: 炮 `TowerPao`

**Files:**
- Create: `godot/scripts/towers/tower_pao.gd`
- Create: `godot/scenes/towers/tower_pao.tscn`
- Modify: `godot/scripts/towers/tower_base.gd`（`towers_root` + `clicked` 信号）
- Modify: `godot/scripts/towers/tower_placement.gd`（传 `towers_root`，发 `tower_placed`）
- Modify: `godot/scenes/ui/sidebar.tscn`（CardPao `available=true` + 场景）
- Modify: `godot/scripts/main.gd`（连接 `tower_placed`/`clicked`，后续任务用）
- Create: `godot/tests/test_tower_pao.gd`
- Modify: `godot/tests/run_tests.gd`

**Interfaces:**
- `TowerBase.setup(enemies_root_: Node, towers_root_: Node = null)`
- `TowerBase.signal clicked(tower: Node)`
- `TowerPlacement.signal tower_placed(tower: Node)`
- `TowerPao`：`@export fire_interval=1.8, damage=3, splash_damage=2, splash_radius=55, attack_range=520, line_radius=34, windup_time=0.15, hit_pause_time=0.12, require_screen=true, direct_damage=1, auto_fire=true`；`fire() -> int`。

- [ ] **Step 1: 写失败测试**

```gdscript
extends RefCounted

class FakeEnemy extends Node2D:
	var hp := 10
	func take_damage(n: int) -> void: hp = maxi(0, hp - n)

func run(t) -> void:
	var enemies := Node2D.new()
	var towers := Node2D.new()
	t.root.add_child(enemies); t.root.add_child(towers)
	var tower = preload("res://scenes/towers/tower_pao.tscn").instantiate()
	tower.setup(enemies, towers)
	tower.auto_fire = false
	tower.position = Vector2.ZERO
	towers.add_child(tower)

	# 没有炮架：不开火
	var solo := _dummy(enemies, Vector2(100, 0))
	tower.fire()
	t.eq(solo.hp, 10, "no screen = no fire")

	# 一个炮架 + 一个目标：打第二个，炮架不掉血
	var screen := _dummy(enemies, Vector2(100, 0))
	var target := _dummy(enemies, Vector2(200, 0))
	tower.fire()
	t.eq(screen.hp, 10, "screen untouched")
	t.eq(target.hp, 7, "target takes 3")

	# 塔也可以当炮架
	var t2 := _dummy(towers, Vector2(0, 100))
	var target2 := _dummy(enemies, Vector2(0, 200))
	tower.fire()
	t.eq(t2.hp, 10, "tower screen untouched")
	t.eq(target2.hp, 7, "tower screen enables fire")

	enemies.free(); towers.free()

func _dummy(parent: Node, pos: Vector2) -> FakeEnemy:
	var e := FakeEnemy.new(); e.position = pos; parent.add_child(e); return e
```

- [ ] **Step 2: 运行确认失败**（`tower_pao.tscn` 不存在）。
- [ ] **Step 3: 实现 `TowerPao` 判定**：4 方向收集「敌人或塔」按距离排序；炮架第 1 个；目标是炮架后第 1 个敌人；`require_screen=false` 时无架直射最近敌人、伤害 `direct_damage`；溅射 55 内其他敌人受 `splash_damage`，排除炮架。
- [ ] **Step 4: 场景/侧栏/主场景接线**：`tower_pao.tscn` 用 `b_pao.png`；`CardPao` 改 `available=true`、`tower_scene` 指向炮场景。
- [ ] **Step 5: 跑测试确认通过**；`--import` 后 `TESTS` 全绿。
- [ ] **Step 6: 提交** `feat(godot): add pao tower with screen targeting`。

---

### Task 2: 马 `TowerMa`

**Files:**
- Create: `godot/scripts/towers/tower_ma.gd`
- Create: `godot/scenes/towers/tower_ma.tscn`
- Modify: `godot/scenes/ui/sidebar.tscn`（CardMa `available=true` + 场景）
- Create: `godot/tests/test_tower_ma.gd`
- Modify: `godot/tests/run_tests.gd`

**Interfaces:**
- `TowerMa`：`@export fire_interval=0.8, damage=2, attack_range=210, leg_offset=45.0, leg_block_radius=30.0, windup_time=0.12, hit_pause_time=0.1, auto_fire=true`；`fire() -> int`。

- [ ] **Step 1: 写失败测试**：范围内最近目标掉 2；马腿 30 内有挡路者时挡路者掉 2、目标不掉；无敌人不出手。
- [ ] **Step 2: 运行确认失败**。
- [ ] **Step 3: 实现日字**：主腿 `L = T + sign(主轴向) * min(45, |d|)`；`L` 周围 30 内除目标外最近敌人为挡路者；挡路者优先。
- [ ] **Step 4: 场景/侧栏接线**：`tower_ma.tscn` 用 `b_ma.png`；`CardMa` 可用。
- [ ] **Step 5: 跑测试确认通过；提交** `feat(godot): add ma tower with leg-block targeting`。

---

### Task 3: 选卡 `CardPicker`

**Files:**
- Create: `godot/scripts/ui/card_picker.gd`
- Create: `godot/scenes/ui/card_picker.tscn`
- Modify: `godot/scripts/core/wave_manager.gd`（清空后先开选卡）
- Modify: `godot/scripts/core/run_controller.gd`（reset 关选卡）
- Modify: `godot/scenes/main.tscn`（加 CardPicker）
- Create: `godot/tests/test_card_picker.gd`
- Modify: `godot/tests/run_tests.gd`

**Interfaces:**
- `CardPicker`：`open_with_timeout(seconds, done)`, `open()`, `close()`, `swap(i)`, `remaining_pick_time`, `is_picking`, `signal picked(index)`。
- `WaveManager`：清空后 `picker.open_with_timeout(pick_time, callback)`；`picking` 期间暂停波次。

- [ ] **Step 1: 写失败测试**：`open_with_timeout` 后 `is_picking`；`swap` 2 次后第 3 次无效；超时自动选第一张并回调；`close` 回调只一次。
- [ ] **Step 2: 运行确认失败**。
- [ ] **Step 3: 实现运行时卡片**：3×`card.png` 248×139、间距 52、每卡「更换 N」、10s 超时、0.45s 收起。
- [ ] **Step 4: 接 WaveManager**：清空 → picker.open → 回调 → 3s → 下一波；reset 关 picker。
- [ ] **Step 5: 跑测试确认通过；提交** `feat(godot): add 3-choose-1 card picker`。

---

### Task 4: 塔菜单 / 详情 / 卖出

**Files:**
- Create: `godot/scripts/ui/tower_action_menu.gd`
- Create: `godot/scripts/ui/tower_detail.gd`
- Create: `godot/scenes/ui/tower_action_menu.tscn`
- Create: `godot/scenes/ui/tower_detail.tscn`
- Modify: `godot/scripts/main.gd`（tower_placed → 菜单；clicked → show_for）
- Modify: `godot/scenes/main.tscn`
- Create: `godot/tests/test_tower_menu.gd`
- Modify: `godot/tests/run_tests.gd`

**Interfaces:**
- `TowerActionMenu.show_for(tower)`, `close()`, `sell(tower)`, `refund_of(tower) -> int`（`tower.tower_cost * 0.8` 四舍五入）。
- `TowerDetail.show(hold_seconds:=0)`, `hide()`。

- [ ] **Step 1: 写失败测试**：`refund_of` 50→40；`sell` 返还 40 并从 `Towers` 移除；详情 `show(0)` 保持显示（`is_showing`）。
- [ ] **Step 2: 运行确认失败**。
- [ ] **Step 3: 实现菜单/详情**：左右按钮「详情 / 卖出 +N」、遮罩点空白关闭；`detail.png` 宽 520。
- [ ] **Step 4: 接线**：`tower_placed` 连接 `clicked`；点塔弹菜单；卖出后塔不再开火（被移除）。
- [ ] **Step 5: 跑测试确认通过；提交** `feat(godot): add tower action menu and detail`。

---

### Task 5: 天气 + Toast 正式样式

**Files:**
- Create: `godot/scripts/core/weather_system.gd`
- Modify: `godot/scripts/main.gd`（创建天气并接 spawner）
- Modify: `godot/scripts/autoload/toast.gd`（圆角底 + 淡出）
- Create: `godot/tests/test_weather.gd`
- Modify: `godot/tests/run_tests.gd`

**Interfaces:**
- `WeatherSystem.stage_for(spawned: int) -> int`（`spawned / stage_size`）；`set_weather(name)`；`layers: Dictionary`；`stage_size=30`。
- `Toast.show(text)`：圆角 `StyleBoxFlat` + 1.6s 停留 + 0.35s 淡出。

- [ ] **Step 1: 写失败测试**：`stage_for(0)=0`、`stage_for(30)=1`、`stage_for(120)=4`（循环回 0 由 `set_weather` 处理）；`set_weather("rain")` 后只有 rain 层 active。
- [ ] **Step 2: 运行确认失败**。
- [ ] **Step 3: 实现 4 种 `CPUParticles2D`**（雨/雪/雾/雷暴+闪电），参数照 spec §6.16；`start_immediately`、`on_top`。
- [ ] **Step 4: Toast 升级**：`PanelContainer` + `StyleBoxFlat` + `Tween` 淡出。
- [ ] **Step 5: 跑测试确认通过；提交** `feat(godot): add weather and styled toast`。

---

### Task 6: M2 集成 + README

**Files:**
- Modify: `godot/tests/integration.gd`（炮/马放置、选卡、卖出、天气）
- Modify: `godot/README.md`
- Modify: `godot/tests/run_tests.gd`（如需）

- [ ] **Step 1: 扩展集成冒烟**：开局 → 敌人 → 放炮/马 → 选卡打开 → 卖出返还 → 天气切换，输出每项 true。
- [ ] **Step 2: 跑单测 + 集成 + 120 帧启动**，全绿。
- [ ] **Step 3: 更新 README 的 M2 已实现/未实现清单**。
- [ ] **Step 4: 提交** `docs(godot): add M2 README and integration`。

---

## 后续（不在本计划内）

- M3：正片叠底着色器、光刃贴图/对象池、天气调参、布局逐项对照、字体子集、性能、进度条平滑、draw_network。
