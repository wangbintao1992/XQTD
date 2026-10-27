# 墨守山河 — Godot 版

Godot **4.7.2 stable** + GDScript。Cocos Creator 版本的独立迁移分支，不合并回 `main`。

## 运行

需要 Godot 4.7.2（`godot --version` 应包含 `4.7.2.stable`）。

> 本机把 Godot 装在 `~/.local/bin/godot`；如果 `godot` 不在 `PATH`，把下面的 `godot` 换成 `~/.local/bin/godot`，或把该目录加入 `PATH`。

```bash
# 首次导入（生成 .godot/ 与导入缓存）
godot --headless --path godot --import

# 跑游戏（桌面窗口）
godot --path godot

# 单元 / 逻辑测试
godot --headless --path godot --script res://tests/run_tests.gd

# 集成冒烟：开局 → 出兵 → 放塔 → 生命归零 → 重开
godot --headless --path godot --fixed-fps 60 res://tests/integration.tscn
```

## M1 已实现

- 首页：`index.png` 铺满，两个按钮；「无尽模式」开始，「闯关模式」占位提示。
- 路径网络出兵：6 种红方棋子，Dijkstra 单向流动，不会回头。
- 敌人：血量、`sui_0/1/2` 破损叠加、`moban` 溅墨、击杀回棋气、到终点扣生命。
- 拖「车」放塔：20×20 吸附、避开路径、扣 50 棋气、放不下有提示。
- 车：横竖 4 方向、一次性射线、穿透、受击暂停；M1 视觉是 `Line2D` 闪线。
- HUD：棋气 / 生命 / 波次 / 进度条。
- 生命归零 → 结束面板；重试 / 返回首页都会干净重置。
- 左侧塔栏可展开 / 缩回；炮、马卡片暂为占位。

## M1 未实现（M2 / M3）

- 炮（隔山打牛）、马（日字跳杀）。
- 选卡 3 选 1、每卡更换次数、倒计时自动选。
- 点塔菜单（详情 / 卖出 80%）、详情弹窗。
- 天气粒子（雨 / 雪 / 雾 / 雷暴）。
- 墨刃正片叠底着色器、光刃贴图 + 对象池。
- 与 Cocos 版逐项布局对照、字体子集、性能调优。

## 目录

```
godot/
├── art/            从 assets/resources/textures 复制的原美术
├── scenes/         main / enemy / towers / ui
├── scripts/
│   ├── autoload/   GameSession / Qi / Lives / Log / Toast
│   ├── core/       PathGraph / PathSpawner / WaveManager / RunController
│   ├── entities/   Enemy / PathWalker / HitPause
│   ├── towers/     TowerBase / TowerChe / TowerPlacement
│   ├── ui/         Hud / Sidebar / TowerCard / HomeMenu / GameOver
│   ├── data/       path_graph_data.gd（生成物）/ enemy_kinds.gd
│   └── util/       Coords / UiFont
├── tests/          run_tests.gd + test_*.gd + integration.tscn
└── tools/          convert_path_graph.py
```

## 注意

- **坐标**：Cocos 设计坐标原点在画布中心、y 向上；Godot 原点左上、y 向下。所有转换只走 `scripts/util/coords.gd`。
- **路径数据**：`scripts/data/path_graph_data.gd` 由 `tools/convert_path_graph.py` 生成；转换时每条边首尾会吸附到节点并重算长度，别手改。
- **中文字体**：用 `UiFont.make()` 的 SystemFont 回退列表（Noto Sans CJK / 微软雅黑 / 苹方 / 文泉驿）。没有系统 CJK 字体的机器需要内嵌字体子集。
- **第 5 波之后**：当前与 Cocos 行为一致——停在第 5 波反复出，进度条会掉回 0.8。A/B/C 方案待定。
- **重试不要用 `reload_current_scene()`**：Autoload 不会重置，统一走 `RunController`。
