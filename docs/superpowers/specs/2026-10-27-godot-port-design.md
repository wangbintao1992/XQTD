# XQTD / 墨守山河 — Godot 迁移设计

- 日期：2026-10-27
- 分支：`godot-port`
- 状态：待评审
- 目标引擎：Godot **4.7.2 stable**（当前最新稳定版；4.8 仍为 beta）
- 语言：GDScript（不引入 C# / .NET）

---

## 1. 为什么做

现有项目是 **Cocos Creator 3.8.8** 工程。玩法本身已经成型，但工程形态不适合 AI 快速迭代：

- `bg.scene` 是带 UUID 引用的 JSON，组件靠编辑器挂载、节点靠手摆；
- 大量逻辑用 `new Node()` + 字符串 `getComponent('TowerChe')` 在运行时现建；
- 改一处玩法经常要同时改场景、脚本、资源引用，AI 难以稳定地「改—跑—看」；
- 场景的很多行为只存在于编辑器状态里，代码里看不出来。

Godot 的 `.tscn` + `.tres` + GDScript 都是纯文本，节点树和属性直接可读可改，运行时无编辑器依赖，更适合 AI 迭代。

## 2. 目标与非目标

### 目标

1. 在 `godot/` 下建立一个**可独立运行的 Godot 4.7.2 工程**。
2. 迁移**全部现有玩法与功能**，复用原有 PNG 美术与已提取的路径数据。
3. 第一个里程碑：**能启动窗口、能完整玩一局**。
4. 工程结构对 AI 友好：场景/脚本/数据分层清晰，关键行为有自动化验证。

### 非目标

- 不合并回 `main`（用户自行处理）。
- 不复刻 Cocos 编辑器、不保留 Cocos 运行时依赖。
- 不新增原项目没有的系统（联机、存档、音频、内购、广告 SDK）。
- 不做美术重制；只做必要的导入与缩放适配。
- 不迁当前构建里没有运行的死代码（见 §4.4）。

### 失败判据（anti-goals）

- 只是「能打开空窗口」但玩不了一局。
- 为了省事把玩法简化成「一条直线 + 一个塔」。
- 迁移后数值/手感与 Cocos 版差异巨大且没有记录。
- 工程里仍然大量运行时 `new` 节点、难以在编辑器里看到结构。

## 3. 已定决策

### 3.1 用户明确决定

- 全部功能与玩法都要迁移，没有想废弃的模块。
- 炮、马要做成**与车不同的攻击**。
- 美术资源使用原来的 PNG。
- 不合并回 main，用户自行处理。

### 3.2 我的判断（可在评审时推翻）

| 决策 | 选择 | 理由 |
|---|---|---|
| 语言 | GDScript | AI 迭代最快，无 .NET 依赖 |
| 引擎版本 | 4.7.2 stable | 当前最新稳定版 |
| 工程位置 | 仓库子目录 `godot/` | 不破坏旧工程，可对照 |
| 坐标 | 统一用 `Coords` 工具做 Cocos→Godot 转换 | Cocos y 向上、Godot y 向下 |
| 单例 | Autoload：`GameSession` / `Qi` / `Lives` / `Toast` / `Log` | 替代 Cocos 的 `static shared` |
| 炮 | 隔山打牛（直线 + 炮架 + 目标范围墨爆） | 忠于象棋「炮打隔子」 |
| 马 | 日字跳杀（短程突进 + 蹩马腿拦截） | 忠于象棋「马走日、蹩马腿」 |
| 返回首页 | 真正回到首页（重置状态），而不是等于重试 | 首页已在同一场景，没必要保留占位行为 |
| 点击敌人掉血 | 默认关闭，保留调试开关 | 原场景里 `damageOnTouch=true` 是调试残留 |
| 触摸诊断日志 | 不迁 | 只服务 Cocos 的输入排查 |
| 第一波出兵 | 由 `WaveManager.deploy()` 拥有 | 原实现靠 spawner 自启动，边界模糊 |
| 塔价 | 先保持 50 / 50 / 50 | 先对齐现状，炮/马差异化后再调 |
| 天气粒子 | `CPUParticles2D` | 参数直观、兼容性好、AI 好调 |
| 测试 | 自写 headless smoke test | 不引第三方插件 |
| 重试 / 返回首页 | 都由 `RunController.reset_run()` 原地重置；重试直接开新局，返回首页回首页 | 避免 `reload_current_scene()` 不重置 Autoload 的坑 |
| 避路径几何 | 用 8 条路径网络的折线，不用旧 P0..P6 样条 | 旧样条不在画面上，玩家看到的是 `p.png` |
| 路径数据 | 转换时把每条边首尾吸附到节点、重算长度 | 修掉边 3→2 起点偏 138 设计单位的瞬移 |
| 中文字体 | 先用 `SystemFont` + 中文族回退列表 | 不引入大字体文件；M3 再决定是否内嵌子集 |
| 波次 5 之后 | 待用户确认（见 §11） | 无胜利界面，原实现会一直重复第 5 波 |

## 4. 现状盘点

### 4.1 场景当前真实结构

```
Canvas (1280x720, 原点在中心, y 向上)
├── Camera
├── Background        bg.png 2048x1152
├── InkPath           InkPathGenerator（启动时被 PathNetworkRunner 关掉）
├── Path              BrushPath/BrushRibbon（场景里 _enabled=false）
│   └── P0..P6        旧单路径控制点
├── Enemies           EnemySpawner（启动时被 clear + disable）
│   ├── Enemy         模板 62x62，r_bing
│   └── Enemy_0..9    预摆的旧卒，会被清掉
├── Towers            1280x720 容器
├── Sidebar           210x620，x=-535
│   ├── Card_che      170x190，Icon 112x112，b_che
│   ├── Card_pao      170x190，Icon 112x112，b_pao
│   ├── Card_ma       170x190，Icon 112x112，b_ma
│   └── Toggle        40x60，文字「◀」，x=122
├── TitleBar
│   ├── TitleBg       biaoti.png 560x136，y=296
│   ├── Title         「墨守山河」54 号
│   └── Stage         「第3关」26 号
├── WaveBar           WaveManager + Graphics 进度条
│   ├── Stamp         yinzhang.png 34x68
│   ├── WaveText      「波次 1/5」26 号
│   └── RoundTip      「下一轮 N / 选择 N」46 号
├── CardPicker
├── TowerDetail
└── QiText            「棋气 100」30 号，(-540, 300)
```

运行时才创建、场景里没有的：`LivesText`、`HomeMenu`、`TipToast`、`GameOverPopup`、`TowerActionMenu`、`TowerChe`、`HitPause`。

### 4.2 关键数值（取自场景序列化数据）

- 设计分辨率：1280×720。
- 棋气：初始 100；塔价 50；击杀回 5~28。
- 生命：初始 20（`LivesManager.initialLives` 默认值）。
- 波次：`enemiesPerRound = 100`，`maxWave = 5`，选卡 10s，选完倒计时 3s。
- 出兵：`spawnInterval = 0.5s`，`speed = 140`，`enemyVisualScale = 0.7`，`pathImageScale = 0.8`。
- 敌人模板：62×62，缩放后约 43.4×43.4。
- 路径图：`p.png` 2048×1152，铺满设计区（×0.625）后再乘 0.8，实际缩放 0.5。
- 车：间隔 1.2s，伤害 1，射程 460，弹速 420，刃长 260，判定半径 34，前摇 0.1s，受击暂停 0.12s。
- 天气：每 30 个敌人换一次；雨→雪→雾→雷暴。

### 4.3 敌人种类表（不改数值）

| 棋子 | hp | speedFactor | lifeCost | qiReward |
|---|---:|---:|---:|---:|
| bing 兵 | 3 | 1.25 | 1 | 8 |
| pao 炮 | 5 | 0.90 | 2 | 15 |
| xiang 象 | 8 | 0.62 | 4 | 28 |
| ma 马 | 4 | 1.10 | 2 | 12 |
| che 车 | 6 | 0.75 | 3 | 20 |
| shi 士 | 2 | 1.45 | 1 | 5 |

### 4.4 当前没在跑、不迁移的代码

| 代码 | 证据 |
|---|---|
| `InkPathGenerator` | `PathNetworkRunner.disableInkPath` 启动时关掉 `InkPath` 节点 |
| `BrushPath` / `BrushRibbon` | 场景里 `_enabled = false` |
| `InkRibbon2D` / `InkLine2D` / `InkStreakWriter` / `InkControlEditor` / `PathRenderer` | 场景未挂、无主流程引用 |
| `EnemySpawner` + 预摆 `Enemy_0..9` | `PathNetworkRunner.disableLegacy()` 每次启动 clear + disable |
| `PathMover`（旧单路径移动） | 网络模式敌人不用它；`PathSpline` 仅被 `TowerDragSource` 借来算离路径距离 |
| `GameOverPopup.traceInput` | 纯触摸诊断 |
| `EnemyHealth.damageOnTouch` | 调试用，默认改关 |

> 这些不迁**不影响任何玩法**：「沿路径走」由 `PathNetworkRunner` 承担，「水墨路径」由 `p.png` 承担。

## 5. Godot 工程结构

```
godot/
├── project.godot                  # 1280x720, canvas_items, keep
├── .gitignore                     # .godot/, *.import 缓存
├── art/                           # 从 assets/resources/textures 复制
│   ├── bg.png  p.png  biaoti.png  yinzhang.png  card.png  detail.png  moban.png
│   ├── index/{index,btn1,btn2}.png
│   ├── qz/{r_bing,r_pao,r_xiang,r_ma,r_che,r_shi,sui_0,sui_1,sui_2}.png
│   ├── qz/{b_che,b_pao,b_ma}.png
│   ├── attack/che/{che_attack1,che_attack2}.png
│   └── weather/{rain,snow,fog,storm}.png + *_a.png
├── scenes/
│   ├── main.tscn
│   ├── enemy.tscn
│   ├── towers/{tower_che,tower_pao,tower_ma}.tscn
│   ├── fx/{blade,windup,hit_effect,cannonball,ma_dash}.tscn
│   └── ui/{home_menu,hud,sidebar,card_picker,tower_action_menu,tower_detail,game_over,toast}.tscn
├── scripts/
│   ├── autoload/{game_session,qi,lives,toast,log}.gd
│   ├── data/{path_graph_data,enemy_kinds}.gd
│   ├── core/{path_network,path_spawner,wave_manager}.gd
│   ├── entities/{enemy,path_walker,hit_pause}.gd
│   ├── towers/{tower_base,tower_che,tower_pao,tower_ma,tower_placement}.gd
│   ├── ui/*.gd
│   └── util/coords.gd
├── shaders/multiply_ink.gdshader   # 可选：正片叠底
├── tests/{run_tests.gd, smoke.gd}
└── tools/convert_path_graph.py     # 把 PathGraphData.ts 转成 path_graph_data.gd
```

### 5.1 坐标约定（最容易出错的地方）

- Cocos：原点在画布中心，**y 向上**。
- Godot：原点在左上角，**y 向下**。
- 世界层：`Stage`（`Node2D`）放在 `(640, 360)`；所有 Cocos 设计坐标 `p` 转成 `Vector2(640 + p.x, 360 - p.y)`。
- UI 层：根 `Control` 尺寸 1280×720，统一用同一套转换。
- 旋转：Cocos `angle`（逆时针角度）→ Godot `rotation = -deg_to_rad(angle)`。
- `PathGraphData` 的点是「设计坐标」；上屏时先乘 `path_image_scale = 0.8`，再做上面的转换。

`scripts/util/coords.gd` 提供：

```gdscript
class_name Coords
const DESIGN := Vector2(1280, 720)
static func to_screen(p: Vector2) -> Vector2:
    return Vector2(DESIGN.x * 0.5 + p.x, DESIGN.y * 0.5 - p.y)
static func cocos_angle_to_rotation(deg: float) -> float:
    return -deg_to_rad(deg)
```

### 5.2 Autoload

| 名称 | 职责 | 信号/接口 |
|---|---|---|
| `GameSession` | 是否已开局 | `started: bool`，`start()`，`reset()` |
| `Qi` | 棋气 | `changed(value)`，`can_afford()`，`spend()`，`earn()`，`reset()` |
| `Lives` | 生命 | `changed(value)`，`game_over`，`lose(n)`，`reset()` |
| `Toast` | 统一轻提示 | `show(text)` |
| `Log` | 调试日志开关 | `info()`，`warn()` |

### 5.3 主场景树

```
Main (Node2D)
├── RunController (Node)      # 开局 / 重试 / 回首页的统一重置入口
├── Background (TextureRect, cover)
├── PathLayer (TextureRect, p.png, 居中, scale 0.5)
├── Enemies (Node2D)
├── Towers (Node2D)
├── FX (Node2D)
├── Weather (Node2D)
├── HUD (CanvasLayer)
│   ├── QiLabel / LivesLabel
│   ├── TitleBar / WaveBar
│   └── Sidebar
├── Popups (CanvasLayer)
│   ├── CardPicker / TowerActionMenu / TowerDetail / GameOver / Toast
└── HomeMenu (CanvasLayer)
```

层级顺序对齐 Cocos：背景 → 路径图 → 敌人 → 塔 → 特效 → 天气 → HUD → 弹窗 → 首页。

## 6. 系统规格

### 6.1 启动 / 窗口 / 背景

- `project.godot`：窗口 1280×720，可缩放；拉伸 `canvas_items` + `keep`。
- `Background` 用 `TextureRect`，`stretch_mode = KEEP_ASPECT_COVERED`，铺满视口不变形。
- 不需要 Cocos 那套浏览器全屏/横屏锁定；桌面窗口由项目设置决定。
- `PathLayer`：`TextureRect`，尺寸 2048×1152，居中，scale 0.5（= 0.625 × 0.8）。

### 6.2 首页 `HomeMenu`

- 全屏 `index.png`（cover）。
- 两个按钮：左「无尽模式」`btn1`，右「闯关模式」`btn2`；300×108，间距 64，中心 y = -70（Cocos）。
- 「无尽模式」→ 隐藏首页 + `GameSession.start()`。
- 「闯关模式」→ `Toast.show("闯关模式 敬请期待")`。
- 全屏拦截输入，避免点到后面的棋盘。
- `_ready()` 时 `GameSession.reset()`，保证重开场景回到未开局。

### 6.3 `GameSession`

- 纯静态状态（Autoload）。
- `PathSpawner`、`WaveManager`、`PathWalker` 每帧/每步检查；未开局不出兵、不移动。
- `reset()` 在首页出现时调用。

### 6.4 棋气 `Qi`

- 初始 100。
- `spend(cost)` 不够返回 false 且不扣。
- `earn(amount)` 只加正数。
- `changed(value)` 驱动 HUD。

### 6.5 生命 `Lives`

- 初始 20。
- 敌人到终点：扣该敌人的 `life_cost`（1~4），敌人消失。
- 归零：`game_over` 信号 → 清场 + 停出兵/波次 + 弹 `GameOver`。
- **统一扣血入口**：只保留「敌人到达终点 → `Lives.lose(life_cost)`」，不再有轮询旧 `PathMover.lapCount` 的第二套逻辑。

### 6.6 路径网络 `PathNetwork`

数据来自 `PathGraphData.ts`（6 节点 / 8 边）。转换后放进 `scripts/data/path_graph_data.gd`。

- 起点 = x 最小节点（node 5，x≈-417.5）；终点 = x 最大节点（node 4，x≈433.8）。
- 从终点跑 Dijkstra，得到每个节点到终点的最短距离。
- 每到一个节点，只在「距离更小」的边里随机选一条 → 单向、无环。
- 每条边预计算分段累计长度；`pos_on_edge(edge, dir, dist)` 按弧长插值。
- 提供调试绘制：`draw_network` 开启时用红色 `Line2D` 画网络。

**数据修复**：转换脚本生成时把每条折线的首/尾点**吸附到 `a`/`b` 节点坐标**，并按新折线重算 `length`。原 `PathGraphData` 里边 3→2 的起点离节点 3 有 138 设计单位，直接搬会导致敌人到站瞬间「瞬移」。修复后要求：每条边的首点 == 节点 a、尾点 == 节点 b（误差 < 0.01），测试里断言。

验收：
- 单测覆盖：起点/终点判定、Dijkstra、`pick_forward_edge` 只给更近的边、`pos_on_edge` 端点与中点正确、**每条边首尾与节点重合**。

### 6.7 敌人 `Enemy` + `PathWalker`

`enemy.tscn`：

```
Enemy (Node2D)
├── Body (Sprite2D)
├── DamageOverlay (Sprite2D, 默认隐藏)
├── HitEffect (Sprite2D, 一次性)
├── HitPause (Node)
└── ClickArea (Area2D, 默认关闭调试点击)
```

- 种类数据：`enemy_kinds.gd` 的常量表（§4.3）。
- 生成时先设 `kind`，再 `add_child`；`_ready()` 读它初始化 hp。
- 视觉统一缩放：模板 62×62 × 0.7 ≈ 43.4；换贴图不改节点尺寸（`Sprite2D` 拉伸铺满）。
- 受伤：
  - 按掉血数显示 `sui_0/1/2` 叠加层（1.15 倍、透明度 210、换图 0.18s 淡出淡入）；
  - 每次受击在敌人身上闪一次 `moban`（96 大小，1s 渐隐，跟着敌人走）；
  - 本体不随血量变淡（与原实现一致）。
- 死亡：`Qi.earn(kind.qi_reward)` → 发 `died` 信号 → 销毁。
- 点击掉血：`debug_damage_on_click`，默认 false。
- 受击暂停：`HitPause` 计时器，`request_pause(seconds)` 取最大值；`PathWalker` 每帧读 `is_paused`。

`PathWalker`：

- 维护 `edge`、`dir`、`dist`、`speed`。
- 每帧 `dist += speed * dt`（暂停时跳过）。
- 超过边总长：减去、到达节点；到终点 → `Lives.lose(life_cost)`；否则 `PathNetwork.pick_forward_edge()`，重置 `dist`。
- 位置 = `Coords.to_screen(pos_on_edge(...) * 0.8)`；朝向保持原样（原实现不转向）。

### 6.8 出兵 `PathSpawner` 与波次 `WaveManager`

`PathSpawner`：

- 接口对齐原 `RoundSpawner`：`count`、`total_count`、`alive_count`、`deploy()`。
- `deploy()`：清场 → 重置计数 → 从起点开始每 `spawn_interval` 出 1 个，共 `count` 个。
- 每次随机一种棋子（等概率）。
- 素材用 `preload`，不存在「素材没加载完」的问题。

`WaveManager`：

- 状态：`wave 1..5`、`counting`、`picking`、`countdown`、`shown_progress`。
- 开局（`GameSession.start()` 后）由它 `deploy()` 第一波，而不是 spawner 自启动。
- 本轮 `total_count > 0 && alive_count == 0` → 弹选卡（10s），选完倒计时 3s → 下一波 `deploy()`。
- 进度条：`(wave - 1 + killed / total) / max_wave`，平滑跟随（速度 5）。
- 文案：「波次 N/5」「下一轮 N」「选择 N」。
- 印章沿进度条移动。

### 6.9 塔放置 `TowerPlacement`

- 三张卡（车/炮/马）都可拖拽；对应塔类型。
- 拖拽：按下卡片 → 生成半透明幽灵（170/255）→ 跟随指针 → 松手结算。
- 放置区域（Cocos 坐标）：`(-412.5, -120)` ~ `(281.9, 269.4)`。
- 吸附：20×20 网格的格心。
- 禁止：压在路径上（到 **8 条网络边折线**的距离 < 22；网络点先 ×0.8 再转 Godot 坐标，和塔处在同一坐标系比较）。
  - 不沿用旧 `P0..P6` 样条：那条线不在画面上，照搬会出现「空地上不能放、墨路上能放」。
- 距离松手点超过 200 的合法格心也不放。
- 扣费：`Qi.spend(50)`；不够给提示。
- 失败提示优先级：棋气不足 → 出界 → 压路径 → 其他。
- 放置成功：实例化对应塔场景，记录 `tower_cost`，挂到 `Towers`。

验收：
- 拖到棋盘内能放下并扣 50；
- 拖到路径上/棋盘外/棋气不足都有对应 Toast；
- 吸附与避让路径正确。

### 6.10 车 `TowerChe`（保持原行为）

- 4 个正方向（横竖），不取路径切线。
- 前摇 0.1s：`che_attack1` 聚墨放大淡入。
- 前摇结束：每个方向**一次性**对整条线做「点到线段距离 ≤ 34」判定，命中所有敌人（穿透），各扣 1 点并 `HitPause(0.12)`。
- 光刃纯视觉：`che_attack2` 以 420 速度飞 460 距离。
- 间隔 1.2s。
- 对象池复用光刃/聚墨节点。
- 混合：优先正片叠底，失败退回普通 alpha（见 §6.19）。

### 6.11 炮 `TowerPao`（新）

设计：**隔山打牛**。

精确定义（实现和测试都按这个来）：

- 射线：从塔中心沿横竖 4 个正方向，长度 `range = 520`。
- 「在线上」：点到射线的距离 ≤ `line_radius = 34`（与车的 `hitRadius` 一致）。
- 「炮架」（screen）：射线上离塔最近的**任意棋子**（敌人或塔），距离 ≤ range。塔也可以当炮架。
- 目标：炮架之后（距离更大）遇到的**第一个敌人**，距离 ≤ range。
- 排序：所有候选都按「沿射线到塔的距离」升序；炮架取第 1 个，目标取炮架之后的第 1 个敌人。
- 没有炮架：`require_screen = true`（默认）时这条射线不开火；设为 false 时可直射最近的敌人，伤害 `direct_damage = 1`。
- 命中：
  - 目标受 `damage = 3`；
  - 目标周围 `splash_radius = 55` 内的**其他敌人**再受 `splash_damage = 2`；
  - **炮架不掉血**，即使它在 55 范围内也要排除；
  - 塔不受任何伤害（不做友伤）。
- 射程 520，间隔 1.8s，前摇 0.15s，受击暂停 0.12s。
- 视觉：炮口聚墨 → 墨弹飞向目标（不穿透）→ 命中处墨爆（复用 `moban`）。
- 可调参数全部 `@export`。

验收（单测都按上面的精确定义写）：
- 一条线上只有 1 个敌人、线上没有塔 → 默认不开火；
- 一条线上有 2 个敌人 → 打第 2 个，第 1 个（炮架）不掉血；
- 一条线上有 1 个塔 + 1 个敌人（塔更近）→ 塔当炮架，敌人挨打；
- 目标 55 范围内另有敌人 → 吃 2 点范围伤害；炮架在范围内也仍不掉血。

### 6.12 马 `TowerMa`（新）

设计：**日字跳杀 + 蹩马腿**。

精确定义（连续空间里的「日」）：

1. 锁定 `range = 210` 内**最近**的敌人作为目标 `E`；距离相同取先找到的。
2. 令 `d = E - T`（T 为塔）。取主腿：`|d.x| >= |d.y|` 时主腿沿 x，否则沿 y。
3. **马腿点** `L`：
   - 主腿沿 x：`L = T + Vector2(sign(d.x) * min(45, |d.x|), 0)`
   - 主腿沿 y：`L = T + Vector2(0, sign(d.y) * min(45, |d.y|))`
   - 即「先走一段短腿（最多 45），再走长腿到目标」，这就是连续空间的「日」。
4. 突进路径视觉为 `T → L → E` 的折线（残影 + 0.12s）。
5. **蹩马腿**：在 `L` 周围 `leg_block_radius = 30` 内找除 `E` 外最近的敌人 `B`。
   - 找到 `B`：本次改为踢 `B`（对其造成 `damage = 2`），`E` 不掉血；突进路径改为 `T → L → B`。
   - 没找到：正常对 `E` 造成 2 点伤害。
6. 间隔 0.8s，受击暂停 0.1s。
7. 短射程、单体、高攻速，和车的「长线穿透」、炮的「隔山范围」区分开。
8. 视觉：残影 + 命中处墨迹。

验收：
- 范围内有敌人、马腿没人挡 → 目标掉 2 点；
- 马腿 30 范围内有另一个敌人 → 伤害转移到挡路者，原目标不掉血；
- 范围内无敌人 → 不出手。

### 6.13 塔菜单 / 详情 / 卖出

- 点击已放置的塔 → 在左右各弹一个按钮：
  - 左「详情」→ `TowerDetail` 保持显示，点空白关闭；
  - 右「卖出 +N」→ 返还 `tower_cost × 0.8`（四舍五入），移除塔。
- 按钮 108×48、圆角 24，水平偏移 96。
- 点空白遮罩关闭菜单。
- `tower_cost` 找不到时用 50。

### 6.14 侧栏 `Sidebar`

- 面板 210×620，展开 x=-535，缩回 x=-715（Cocos），0.25s `quadOut`。
- 把手 `Toggle`「◀」，点击切换。
- 默认展开。
- 面板底色半透明深色 + 描边（原实现用 Graphics，Godot 用 `Panel` + `StyleBoxFlat`）。

### 6.15 选卡 `CardPicker`

- 每轮清空后弹出 3 张 `card.png`，248×139，间距 52，居中。
- 每张卡下方「更换 N」，初始 2 次；用完变灰。
- 点击卡片：选中放大 1.06，其余变暗到 110，0.45s 后收起。
- 10s 倒计时；超时自动选第一张。
- **选中的效果保持原样：只走流程，不实现加成**（原项目就是占位）。
- 选完回调 `WaveManager` 进入 3s 倒计时。

### 6.16 天气 `Weather`

- 每 30 个敌人换一种：雨 → 雪 → 雾 → 雷暴，循环。
- 四种都用 `CPUParticles2D`，贴图用带 alpha 的 `*_a.png`。
- 参数按原表迁移，Godot 侧重新调：
  - 雨：发射 400/s，重力 (0,500)，速度 800，寿命 1.2s，大小 8，上限 500；
  - 雪：90/s，重力 (0,80)，速度 100，寿命 5s，大小 10，上限 300；
  - 雾：30/s，重力 0，速度 55，寿命 8s，大小 225，上限 40；
  - 雷暴：雨参数 + 闪电层（3/s，寿命 0.3s，大小 120）。
- `size_scale = 3`；`additive = false`；`darken = 0`；默认在最上层。
- 游戏结束/未开局时关闭。

### 6.17 轻提示 `Toast`

- 底部居中，距底 96，自动淡出。
- 停留 1.6s，淡出 0.35s。
- 字号 26，内边距 30/14，圆角 12，最小 140×48。
- 文字 (250,245,235)，底 (22,20,17,210)。
- 不拦截输入。

### 6.18 游戏结束 `GameOver`

- 半透明暗底（12,10,9,176）+ 面板 640×372（宣纸色 + 墨色描边）。
- 标题「游戏结束」40 号；正文「胜败乃兵家常事，大侠请重新来过」26 号。
- 三个按钮 176×58，间距 20：
  - 「返回首页」→ `RunController.go_home()`；
  - 「重试」→ `RunController.start_new_run()`；
  - 「看广告」→ `Toast.show("暂无广告")`（原项目也是占位）。
- 结束态停止出兵、波次、走位、天气。

**`RunController`（`main.tscn` 根下的节点）是唯一的重置入口**：

- `reset_run()`（内部）：关闭所有弹窗/选卡 → 清空 `Enemies` / `Towers` / `FX` → `Qi.reset()` → `Lives.reset()` → `WaveManager.reset()` 回第 1 波 → `PathSpawner` 清计数 → 天气回第 1 段。不动 `GameSession`。
- `start_new_run()`：`reset_run()` → `GameSession.start()`。
- `go_home()`：`reset_run()` → `GameSession.reset()` → 显示 `HomeMenu`。
- **不要用 `reload_current_scene()` 做重试**：它不会重置 Autoload，`Lives.value = 0`、`is_game_over = true` 和旧棋气会带进下一局，表现为「敌人不出、塔放不下」。

### 6.19 墨刃正片叠底

Cocos 用 `DST_COLOR + ONE_MINUS_SRC_ALPHA` 实现「墨叠纸变浓、透明区不变黑」。

Godot 的 `Sprite2D` 不暴露自定义混合因子。方案：

1. 第一版：普通 alpha 混合（视觉可接受，墨色平铺）。
2. 第二版：`CanvasItemMaterial` 的 `BLEND_MODE_MUL` 或 `hint_screen_texture` 着色器，复刻 `src×dst + dst×(1−src.a)`。
3. `multiply_blend` 开关保留，默认开，失败自动退回 alpha。

> 这是表现层差异，不阻塞 M1。

### 6.20 调试 / 日志

- `Log.debug_enabled` 全局开关；`Log.info/warn` 统一前缀。
- `PathNetwork.draw_network`：红色 `Line2D` 画 6 节点/8 边。
- `Enemy.debug_damage_on_click`：默认 false。
- 不迁 `GameOverPopup.traceInput`。

## 7. 里程碑与验收

### M0 — 脚手架（能启动）

- [ ] `godot/` 工程可被 Godot 4.7.2 打开，无导入错误。
- [ ] 启动窗口 1280×720，背景铺满。
- [ ] 首页可见，「无尽模式」能进入游戏（此时可以还没有敌人）。

### M1 — 能玩一局（核心）

- [ ] 路径图与路径网络对齐；敌人沿网络单向走向终点。
- [ ] 6 种棋子按数值出兵；血量、受击表现、击杀回棋气正常。
- [ ] 拖「车」到棋盘、吸附、避路径、扣棋气、放不下有提示。
- [ ] 车四向墨刃穿透、前摇、受击暂停正常。
- [ ] 棋气/生命/HUD/波次进度条正常。
- [ ] 敌人到终点扣生命；生命归零弹结束；重试能重开。
- [ ] headless smoke test 通过。

### M2 — 全功能对齐

- [ ] 炮（隔山打牛）、马（日字跳杀）可用。
- [ ] 侧栏展开/缩回、三张卡拖拽。
- [ ] 选卡 3 选 1、更换次数、超时自动选。
- [ ] 塔菜单「详情 / 卖出」、详情弹窗。
- [ ] 天气四态轮换。
- [ ] Toast、首页「闯关模式」占位提示。
- [ ] 「返回首页」真正可用。

### M3 — 打磨

- [ ] 墨刃正片叠底生效（或明确记录退回 alpha）。
- [ ] 天气粒子手感调平。
- [ ] 性能：500 敌人总量下稳定 60fps。
- [ ] 布局与 Cocos 版逐项对照（位置/尺寸/字号/颜色）。
- [ ] 文档：`godot/README.md` 写清运行/导出/调参入口。

## 8. 验证策略

环境当前**没有安装 Godot**，实现前需要先拿到 4.7.2（约 100MB）。网络直连不稳时用 `http_proxy=http://127.0.0.1:7890` 和 `https_proxy=http://127.0.0.1:7890` 兜底。

验证分五层：

1. **字体**：`fc-list :lang=zh` 确认系统有中文字体；没有就退回内嵌 Noto Sans SC 子集。
2. **解析/导入**：`godot --headless --path godot --import`（首次生成 `.godot/`）。
3. **启动**：`godot --headless --path godot --quit-after 120`，确认主场景能跑 120 帧无报错。
4. **逻辑 smoke test**：`godot --headless --path godot --script res://tests/run_tests.gd`
   - 路径网络：起点/终点、Dijkstra、前向边、弧长取点；
   - 走位：给定 dt 后位置推进、到终点扣血；
   - 车：一条线上多个敌人一次全中；
   - 炮：无炮架不开火、有炮架打第二个、范围伤害；
   - 马：单体重击、蹩马腿转移目标；
   - 棋气：spend/earn 边界。
5. **人工**：`godot --path godot` 跑一局，逐项对照 §7。

> 如果环境有 `xvfb-run`，再补一层渲染截图；没有就以 headless + 人工为准。

## 9. 风险

| 风险 | 影响 | 应对 |
|---|---|---|
| 环境未装 Godot 4.7.2 | 无法验证 | 先下载官方 Linux 包；确认网络/权限 |
| 坐标 y 翻转 | 路径/敌人/UI 全错位 | 统一走 `Coords`，单测覆盖 |
| 正片叠底 | 墨刃观感差异 | 先 alpha，M3 再上着色器 |
| 天气粒子参数不对应 | 雨/雪/雾观感差异 | M2 单独调参，记录映射 |
| 100 敌人/波 × 5 波 | 性能/卡顿 | 对象池、`CPUParticles2D`、避免每帧全量查询 |
| 美术尺寸很大（6144×736 等） | 导入慢/显存 | Godot 自动 mipmap/压缩；必要时缩放导入 |
| 炮/马平衡 | 手感 | 参数全 `@export`，先跑通再调 |

## 10. 留给 builder 的自由

- 具体 GDScript 类拆分、信号命名、对象池实现方式。
- 塔/敌人场景是否用继承场景、还是独立场景。
- 天气粒子的具体 Godot 参数映射。
- 吸附网格/路径避让的加速结构（20×20 网格足够小，暴力遍历即可）。
- 正片叠底的着色器写法。
- 测试框架的组织方式（只要 `run_tests.gd` 可一键跑）。

## 11. 需要用户确认的点

### 仍需拍板

1. **第 5 波清空之后怎么办？** 现在是「无尽模式」，但 `maxWave=5`、进度条是整局进度。原实现会停在第 5 波反复出，进度条从 1.0 掉回 0.8。三种走法：
   - **A（推荐，改动最小）**：继续重复第 5 波，进度条**封顶在 1.0**，文案「波次 5/5 · 无尽」；
   - **B**：5 波打完算通关，加一个「胜利」结算面板（新增 UI）；
   - **C**：真·无尽，波次继续涨（6、7…），进度条按 5 波一段循环。

### 已定，可推翻

2. 炮默认**必须有炮架**才开火；`require_screen=false` 时允许直射、伤害 1。
3. 马「蹩马腿」= **伤害转移给挡路者**；另一种「直接不出手」只要改一个开关。
4. 三张塔卡先保持同价 50，跑通后再按定位调。
5. 第一版只保证**桌面窗口**能跑；Web 导出放到 M3 之后，不阻塞。
