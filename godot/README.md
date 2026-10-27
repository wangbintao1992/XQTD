# 墨守山河 — Godot 版

Godot **4.7.2 stable** + GDScript。Cocos Creator 版本的独立迁移分支，不合并回 `main`。

## 运行

```bash
# 首次导入
godot --headless --path godot --import

# 跑游戏
godot --path godot

# 跑测试
godot --headless --path godot --script res://tests/run_tests.gd
```

`godot` 需为 4.7.2（`godot --version` 应包含 `4.7.2.stable`）。

## 目录

- `art/`：从 `assets/resources/textures/` 复制的原美术。
- `scenes/`：主场景、敌人、塔、UI。
- `scripts/`：GDScript 逻辑（autoload / data / core / entities / towers / ui / util）。
- `tests/`：headless smoke test。
- `tools/`：路径数据转换脚本。

## 当前进度

- M1：见 `../docs/superpowers/plans/2026-10-27-godot-port-m1.md`。
- M2：炮 / 马 / 选卡 / 天气 / 塔菜单。
- M3：正片叠底、布局对照、性能。

## 注意

- 坐标：Cocos 设计坐标原点在中心、y 向上；Godot 原点左上、y 向下。所有转换只走 `Coords`。
- 路径数据由 `tools/convert_path_graph.py` 生成，边首尾会吸附到节点并重算长度。
