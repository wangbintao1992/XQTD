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
- 左侧塔栏可展开 / 缩回（炮、马在 M2 开放）。

## M2 已实现

- 炮：隔山打牛；炮架可为敌人或塔；溅射排除炮架。
- 马：日字跳杀；马腿 30 范围内的挡路者转移伤害。
- 选卡 3 选 1：10s 超时自动选第一张；R1 词条模式下「更换」按钮隐藏。
- 塔菜单：点塔弹「详情 / 卖出 +N」，卖出返还放置时花费的 80%。
- 塔详情：`detail.png`，保持显示、点空白关闭。
- 天气：雨 / 雪 / 雾 / 雷暴，每 30 个敌人切换。
- Toast：圆角墨底 + 淡出。

## 肉鸽无尽 R1

- 每波清空三选一词条；12 条词条；真无尽（数量 +15%/波、血量 +10%/波、每 5 波提速）。
- 词条：无蹩腿马、无炮架炮、双车碾压、范围扩大、冷却减半、放置免棋气、击杀棋气 +50%、天降棋气、苦肉计、连环溅射。
- 已获得词条显示在 HUD 右上；重开/返回首页清空。

## 肉鸽无尽 R2

- 每 10 波棋局异变：炮弱马强 / 车短怪快 / 逆风局；HUD 显示当前异变。
- 每 5 波精英黑棋：黑马 / 黑车 / 黑炮，高血高奖励；击杀掉落随机词条。
- 新词条：美人计（每 6s 停顿一个敌人）、绝杀减速（击杀后全体减速 2s）。
- R3 已实现：马后炮 / 双车错 / 重炮、最高波数桩。

## 肉鸽无尽 R3

- 组合技：马后炮 / 双车错 / 重炮；阵型存在 + 6s 冷却触发，整线清屏 + 墨浪。
- 最高波数：本地排行榜桩；结束局提交，HUD 右下显示；真实 Java 后端留后续。
- R4 已实现：局内合成、天气 Buff。二期后续：器具 / 装备、地形 / 过河卒、精英特殊攻击、真实排行榜。

## 肉鸽无尽 R4

- 局内合成：同种棋子叠放升级（Lv1-3），伤害/射程提升、攻速略升，消耗 50 棋气。
- 天气 Buff：雨（塔攻速+、敌速-）、雪（塔射程-、敌速-）、雾（塔伤害-）、雷暴（塔伤害+、敌速+）；HUD 显示天气。
- 待做 R5：装备 / 器具跨局、地形 / 过河卒、精英特殊攻击、真实后端排行榜。

## 仍缺（M3）

- 墨刃正片叠底着色器、光刃贴图 + 对象池、聚墨前摇视觉。
- 与 Cocos 版逐项布局对照（标题条、印章、Stage、牌面等）。
- 字体子集（无 CJK 系统字体的机器需要内嵌）。
- 性能压测、进度条平滑/单调、`draw_network` 调试红线。
- 真无尽已开启（波次无限）；每 10 波异变 / 每 5 波精英已在 R2 接入。

## 目录

```
godot/
├── art/            从 assets/resources/textures 复制的原美术
├── scenes/         main / enemy / towers / ui
├── scripts/
│   ├── autoload/   GameSession / Qi / Lives / Log / Toast / RunState / Leaderboard
│   ├── core/       PathGraph / PathSpawner / WaveManager / RunController / WeatherSystem / ComboSystem
│   ├── entities/   Enemy / PathWalker / HitPause
│   ├── towers/     TowerBase / TowerChe / TowerPao / TowerMa / TowerPlacement
│   ├── ui/         Hud / Sidebar / TowerCard / CardPicker / TowerActionMenu / TowerDetail / HomeMenu / GameOver
│   ├── data/       path_graph_data.gd（生成物）/ enemy_kinds.gd / trait_pool.gd
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
