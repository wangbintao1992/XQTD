# Godot M3a：HUD 对齐 + 墨刃混合 + 攻击线复用

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 按 Cocos `bg.scene` 的 WaveBar 参数对齐 HUD，并把墨刃改成正片叠底、车攻击线从「每次新建」改为固定 4 条复用。

**Architecture:** `Hud` 负责波次条样式/平滑；`InkFx` 统一设置 `CanvasItemMaterial.BLEND_MODE_MUL`；`TowerChe` 预建 4 条 `Line2D`，开火时只更新点与透明度。

**Tech Stack:** Godot 4.7.2、GDScript、CanvasItemMaterial、Tween。

**Source data:** `assets/bg.scene` 的 WaveBar 组件：`barHalfWidth=210`、`barY=-292`、`barThickness=7`、`fillColor=(178,58,44,235)`、`trackColor=(60,56,52,120)`、`barSmoothSpeed=5`；Stage y=212、WaveText y=-338、RoundTip y=190（Cocos y 向上，Godot y=360-y）。

## Global Constraints

- 不改玩法数值、不改路径/塔逻辑。
- 视觉参数来自原场景数据；标题卷轴/印章暂不猜缩放。
- 每个任务结束跑 `godot --headless --path godot --script res://tests/run_tests.gd`。

---

### Task 1: HUD 波次条对齐 + 平滑

**Files:**
- Modify: `godot/scripts/ui/hud.gd`
- Modify: `godot/scenes/ui/hud.tscn`
- Modify: `godot/tests/test_ui_layout.gd`

**Interfaces:**
- `Hud.set_progress(p)` 只设目标；`_process(delta)` 以 `BAR_SMOOTH_SPEED=5` 逼近。
- 进度条位置 `430..850`、`y=649..656`；填充 `#B23A2C`、轨道 `#3C3834` 47%。
- Stage 中心 y=148；WaveText 中心 y=698；RoundTip 中心 y=170。

- [ ] Step 1: 写失败测试：进度条高度/颜色、Stage/WaveText 位置、平滑中间值。
- [ ] Step 2: 跑测试确认失败。
- [ ] Step 3: 实现样式/平滑/位置。
- [ ] Step 4: 跑测试通过；提交 `feat(godot): align HUD wave bar`。

---

### Task 2: 墨刃正片叠底 + 车攻击线复用

**Files:**
- Create: `godot/scripts/util/ink_fx.gd`
- Modify: `godot/scripts/towers/tower_che.gd`
- Modify: `godot/scripts/towers/tower_ma.gd`
- Modify: `godot/scripts/towers/tower_pao.gd`
- Modify: `godot/scripts/core/combo_system.gd`
- Modify: `godot/scripts/entities/enemy.gd`
- Create: `godot/tests/test_ink_fx.gd`
- Modify: `godot/tests/run_tests.gd`

**Interfaces:**
- `InkFx.multiply_enabled`；`InkFx.apply(node)->CanvasItemMaterial`（关闭时返回 null 并保持 alpha）。
- `TowerChe._flash_lines: Array[Line2D]`，4 条常驻；`_flash(dir)` 复用并重置 tween。

- [ ] Step 1: 写失败测试：MUL 材质、关闭回退、车连续开火子节点数稳定。
- [ ] Step 2: 跑测试确认失败。
- [ ] Step 3: 实现 InkFx + 接线 + 车线复用。
- [ ] Step 4: 跑测试通过；提交 `feat(godot): add ink multiply and reuse che flashes`。

---

### Task 3: 集成 + README + review

**Files:**
- Modify: `godot/tests/integration.gd`
- Modify: `godot/README.md`

- [ ] Step 1: 集成断言 HUD 波次条样式、车 4 条常驻线、InkFx 材质。
- [ ] Step 2: 跑单测 + 集成 + 120 帧启动。
- [ ] Step 3: README 更新 M3 进度；提交 + review；修 Critical/Important；推送。

---

## 后续

- 标题卷轴/印章按截图对齐；天气粒子手感；500 敌人性能压测；字体子集。
