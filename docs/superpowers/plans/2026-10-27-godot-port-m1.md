# XQTD Godot 迁移 — M1（可启动、可玩一局）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `godot/` 下建立 Godot 4.7.2 工程，做到启动窗口 → 首页 → 无尽模式 → 敌人沿路径网络出兵 → 拖车放塔 → 车四向墨刃杀敌 → 棋气/生命/波次 → 生命归零结束。

**Architecture:** 纯 2D、GDScript、Control/Node2D 混合。Cocos 的设计坐标（原点中心、y 向上）通过 `Coords` 统一转成 Godot 屏幕坐标（原点左上、y 向下）。单例用 Autoload，运行态重置由 `RunController` 统一负责。

**Tech Stack:** Godot 4.7.2 stable、GDScript、无第三方插件、`CPUParticles2D`（M2）、`gl_compatibility` 渲染。

**Spec:** `docs/superpowers/specs/2026-10-27-godot-port-design.md`

## Global Constraints

- Godot **4.7.2 stable**，GDScript，不引 C#/.NET。
- 设计分辨率 **1280×720**，拉伸 `canvas_items` + `keep`。
- 工程根目录 `godot/`；旧 Cocos 文件不删不改。
- 美术从 `assets/resources/textures/**` 复制到 `godot/art/**`，不重制。
- 路径数据来自 `assets/scripts/PathGraphData.ts`，转换时**首尾吸附节点并重算长度**。
- Cocos 坐标原点在画布中心、**y 向上**；Godot 原点左上、**y 向下**。所有转换只走 `Coords`。
- 单例：`GameSession` / `Qi` / `Lives` / `Toast` / `Log`。
- 调试日志默认开（M1 开发期），发布前关。
- 每个任务结束必须能独立跑：`godot --headless --path godot --script res://tests/run_tests.gd`。
- 网络异常时下载/推送用 `http_proxy=http://127.0.0.1:7890`、`https_proxy=http://127.0.0.1:7890`。
- 测试里取类优先 `preload("res://...")`，不要依赖 `class_name` 的导入缓存顺序。

## Review Focus

1. **坐标 y 翻转**：Cocos 设计坐标（0,0 中心、y 上）→ Godot 屏幕（0,0 左上、y 下）。路径、敌人、UI、拖拽全部依赖它；错了整盘错位。
2. **拖拽落点坐标系**：指针 UI 坐标 → `Towers` 本地坐标 → 网格/路径比较，必须全程同一坐标系。Cocos 版踩过「塔全吸到左上角」。
3. **Autoload 重置**：重试/返回首页后 `Qi`、`Lives`、`GameSession` 必须是干净状态；否则下一局敌人不出、塔放不下。
4. **路径数据端点**：每条边首尾必须与节点重合（原数据边 3→2 起点偏 138），否则敌人到站瞬移。
5. **中文字体**：HUD/弹窗所有中文必须有字形，不能 tofu。

---

## 文件结构

```
godot/
├── project.godot
├── .gitignore
├── art/...                          # 复制自 assets/resources/textures
├── scenes/
│   ├── main.tscn
│   ├── enemy.tscn
│   ├── towers/tower_che.tscn
│   └── ui/{hud,sidebar,home_menu,game_over}.tscn
├── scripts/
│   ├── autoload/{game_session,qi,lives,toast,log}.gd
│   ├── data/{path_graph_data,enemy_kinds}.gd
│   ├── core/{path_graph,path_spawner,wave_manager,run_controller}.gd
│   ├── entities/{enemy,path_walker,hit_pause}.gd
│   ├── towers/{tower_base,tower_che,tower_placement}.gd
│   ├── ui/{hud,sidebar,home_menu,game_over}.gd
│   └── util/coords.gd
├── tests/{run_tests,test_coords,test_path_graph,test_autoloads,test_walker,test_wave,test_placement,test_tower_che,test_run_controller}.gd
└── tools/convert_path_graph.py
```

---

### Task 1: 环境 + Godot 工程骨架 + 美术复制

**Files:**
- Create: `godot/project.godot`
- Create: `godot/.gitignore`
- Create: `godot/scenes/main.tscn`（临时最小场景）
- Create: `godot/art/**`（复制）
- Create: `godot/README.md`

**Interfaces:**
- Consumes: 无
- Produces: 可被 Godot 打开的 `godot/` 工程；后续任务的 `res://` 根。

- [ ] **Step 1: 下载并安装 Godot 4.7.2**

```bash
mkdir -p /tmp/opencode/godot
cd /tmp/opencode/godot
curl -L --fail -o godot.zip \
  https://github.com/godotengine/godot/releases/download/4.7.2-stable/Godot_v4.7.2-stable_linux.x86_64.zip \
  || curl -L --fail --proxy http://127.0.0.1:7890 -o godot.zip \
  https://github.com/godotengine/godot/releases/download/4.7.2-stable/Godot_v4.7.2-stable_linux.x86_64.zip
unzip -o godot.zip
chmod +x Godot_v4.7.2-stable_linux.x86_64
mkdir -p ~/.local/bin
ln -sf /tmp/opencode/godot/Godot_v4.7.2-stable_linux.x86_64 ~/.local/bin/godot
```

- [ ] **Step 2: 验证版本**

Run: `~/.local/bin/godot --version`
Expected: 输出包含 `4.7.2.stable`

- [ ] **Step 3: 创建工程配置**

`godot/project.godot` 至少包含：

```ini
config_version=5

[application]
config/name="墨守山河"
run/main_scene="res://scenes/main.tscn"

[display]
window/size/viewport_width=1280
window/size/viewport_height=720
window/stretch/mode="canvas_items"
window/stretch/aspect="keep"

[rendering]
renderer/rendering_method="gl_compatibility"
renderer/rendering_method.mobile="gl_compatibility"
```

`godot/.gitignore`：

```
.godot/
*.import
export/
```

- [ ] **Step 4: 复制美术**

```bash
mkdir -p godot/art
cp -r assets/resources/textures/. godot/art/
```

保留子目录：`index/`、`qz/`、`attack/che/`、`weather/`。

- [ ] **Step 5: 临时主场景**

`godot/scenes/main.tscn` 先放一个 `Node2D` 根 + `Label`（文字「墨守山河」），只为让工程能启动；Task 6 再换成正式主场景。

- [ ] **Step 6: 导入并启动验证**

```bash
~/.local/bin/godot --headless --path godot --import
~/.local/bin/godot --headless --path godot --quit-after 5
```

Expected: 两条命令退出码 0，无 `ERROR`/`SCRIPT ERROR`。

- [ ] **Step 7: 字体检查**

Run: `fc-list :lang=zh | head -5`
Expected: 至少有一行。若为空，记录到 README，M3 前必须内嵌 Noto Sans SC 子集。

- [ ] **Step 8: 提交**

```bash
git add godot/
git commit -m "chore(godot): scaffold Godot 4.7.2 project and copy art"
```

---

### Task 2: `Coords` + 测试框架

**Files:**
- Create: `godot/scripts/util/coords.gd`
- Create: `godot/tests/run_tests.gd`
- Create: `godot/tests/test_coords.gd`

**Interfaces:**
- Consumes: Task 1 的工程。
- Produces:
  - `Coords.DESIGN: Vector2`（1280,720）
  - `Coords.to_screen(p: Vector2) -> Vector2`
  - `Coords.screen_to_design(p: Vector2) -> Vector2`
  - `Coords.cocos_angle_to_rotation(deg: float) -> float`
  - 测试入口 `res://tests/run_tests.gd`（`extends SceneTree`），失败 exit 1。

- [ ] **Step 1: 写失败测试**

`godot/tests/test_coords.gd`：

```gdscript
extends RefCounted

func run(t) -> void:
    t.eq(Coords.to_screen(Vector2(0, 0)), Vector2(640, 360), "center")
    t.eq(Coords.to_screen(Vector2(100, 50)), Vector2(740, 310), "positive")
    t.eq(Coords.to_screen(Vector2(-100, -50)), Vector2(540, 410), "negative")
    t.eq(Coords.screen_to_design(Vector2(740, 310)), Vector2(100, 50), "roundtrip")
    t.approx(Coords.cocos_angle_to_rotation(90.0), -PI / 2.0, 0.0001, "angle 90")
```

- [ ] **Step 2: 运行确认失败**

Run: `~/.local/bin/godot --headless --path godot --script res://tests/run_tests.gd`
Expected: FAIL，因为 `Coords` 不存在。

- [ ] **Step 3: 实现 Coords + 测试入口**

`scripts/util/coords.gd`：

```gdscript
class_name Coords
extends RefCounted

const DESIGN := Vector2(1280, 720)

static func to_screen(p: Vector2) -> Vector2:
    return Vector2(DESIGN.x * 0.5 + p.x, DESIGN.y * 0.5 - p.y)

static func screen_to_design(p: Vector2) -> Vector2:
    return Vector2(p.x - DESIGN.x * 0.5, DESIGN.y * 0.5 - p.y)

static func cocos_angle_to_rotation(deg: float) -> float:
    return -deg_to_rad(deg)
```

`tests/run_tests.gd`：`extends SceneTree`，提供 `eq`、`approx`、`check`，依次 preload 并执行各 `test_*.gd` 的 `run(self)`，最后打印 `TESTS: n, FAILURES: n` 并 `quit(0/1)`。

- [ ] **Step 4: 运行确认通过**

Run: `~/.local/bin/godot --headless --path godot --script res://tests/run_tests.gd`
Expected: `FAILURES: 0`，退出码 0。

- [ ] **Step 5: 提交**

```bash
git add godot/scripts/util/coords.gd godot/tests/
git commit -m "feat(godot): add coordinate conversion and headless test runner"
```

---

### Task 3: 路径数据转换 + `PathGraph`

**Files:**
- Create: `godot/tools/convert_path_graph.py`
- Create: `godot/scripts/data/path_graph_data.gd`（生成物）
- Create: `godot/scripts/core/path_graph.gd`
- Create: `godot/tests/test_path_graph.gd`

**Interfaces:**
- Consumes: `assets/scripts/PathGraphData.ts`、`Coords`。
- Produces:
  - `path_graph_data.gd`：`const NODES: Array[Vector2]`、`const EDGES: Array[Dictionary]`（每项 `{a:int,b:int,points:Array[Vector2]}`）。
  - `PathGraph extends RefCounted`：
    - `var nodes: Array[Vector2]`
    - `var edges: Array[Dictionary]`
    - `var start_node: int`
    - `var end_node: int`
    - `var dist_to_end: PackedFloat32Array`
    - `func pick_forward_edge(at: int, rng: RandomNumberGenerator) -> int`（-1 表示没有）
    - `func pos_on_edge(edge: int, dir: int, dist: float) -> Vector2`（设计坐标，未乘 0.8）
    - `func edge_total(edge: int) -> float`

- [ ] **Step 1: 写转换脚本**

`godot/tools/convert_path_graph.py`：

- 读 `assets/scripts/PathGraphData.ts`，解析 `PATH_GRAPH_NODES` 与 `PATH_GRAPH_EDGES`（正则取 `{ x, y }` 和 `{ a, b, ..., points: [...] }`）。
- 对每条边：`points[0] = nodes[a]`、`points[-1] = nodes[b]`（吸附）。
- 重算每条边分段长度与总长。
- 输出 `godot/scripts/data/path_graph_data.gd`。
- 输出时保留 3 位小数。

- [ ] **Step 2: 生成并检查**

Run: `python3 godot/tools/convert_path_graph.py`
Expected: 生成文件；`grep -c 'Vector2' godot/scripts/data/path_graph_data.gd` > 0。

- [ ] **Step 3: 写失败测试**

`tests/test_path_graph.gd`：

```gdscript
extends RefCounted

func run(t) -> void:
    var g := PathGraph.new()
    t.eq(g.nodes.size(), 6, "6 nodes")
    t.eq(g.edges.size(), 8, "8 edges")
    t.eq(g.start_node, 5, "start = left-most")
    t.eq(g.end_node, 4, "end = right-most")
    for i in g.edges.size():
        var e: Dictionary = g.edges[i]
        t.approx_v(e.points[0], g.nodes[e.a], 0.01, "edge %d starts at a" % i)
        t.approx_v(e.points[e.points.size() - 1], g.nodes[e.b], 0.01, "edge %d ends at b" % i)
    t.approx(g.dist_to_end[g.end_node], 0.0, 0.001, "end distance 0")
    for i in g.nodes.size():
        t.check(is_finite(g.dist_to_end[i]), "node %d reachable" % i)
```

- [ ] **Step 4: 运行确认失败**

Run: `~/.local/bin/godot --headless --path godot --script res://tests/run_tests.gd`
Expected: FAIL，`PathGraph` 未定义。

- [ ] **Step 5: 实现 PathGraph**

- `_init()` 读 `path_graph_data.gd` 的 `NODES/EDGES`。
- 起点 = x 最小；终点 = x 最大。
- 从终点跑 Dijkstra（边权用重算后的总长）。
- `pick_forward_edge`：遍历与该节点相连的边，只在 `dist_to_end[other] < dist_to_end[at]` 里随机选。
- `pos_on_edge`：按分段累计长度插值；`dir < 0` 时从另一端算。

- [ ] **Step 6: 补测试：前向边与取点**

```gdscript
var rng := RandomNumberGenerator.new()
rng.seed = 1
for at in g.nodes.size():
    var e := g.pick_forward_edge(at, rng)
    if at == g.end_node:
        t.eq(e, -1, "end has no forward edge")
    elif e >= 0:
        var other := g.edges[e].b if g.edges[e].a == at else g.edges[e].a
        t.check(g.dist_to_end[other] < g.dist_to_end[at], "forward edge goes closer")
        t.approx_v(g.pos_on_edge(e, 1, 0.0), g.nodes[g.edges[e].a], 0.01, "pos at start")
        t.approx_v(g.pos_on_edge(e, 1, g.edge_total(e)), g.nodes[g.edges[e].b], 0.01, "pos at end")
```

Run: `~/.local/bin/godot --headless --path godot --script res://tests/run_tests.gd`
Expected: `FAILURES: 0`。

- [ ] **Step 7: 提交**

```bash
git add godot/tools/convert_path_graph.py godot/scripts/data/ godot/scripts/core/path_graph.gd godot/tests/test_path_graph.gd
git commit -m "feat(godot): convert path graph with endpoint snapping"
```

---

### Task 4: Autoload 单例

**Files:**
- Create: `godot/scripts/autoload/game_session.gd`
- Create: `godot/scripts/autoload/qi.gd`
- Create: `godot/scripts/autoload/lives.gd`
- Create: `godot/scripts/autoload/log.gd`
- Create: `godot/scripts/autoload/toast.gd`（M1 先空实现）
- Modify: `godot/project.godot`（`[autoload]`）
- Create: `godot/tests/test_autoloads.gd`

**Interfaces:**
- `GameSession`：`var started: bool`、`func start()`、`func reset()`。
- `Qi`：`signal changed(value:int)`、`var value:int`、`func reset()`、`func set_qi(v:int)`、`func can_afford(cost:int)->bool`、`func spend(cost:int)->bool`、`func earn(amount:int)->void`。
- `Lives`：`signal changed(value:int)`、`signal game_over`、`var value:int`、`var is_game_over:bool`、`func reset()`、`func lose(amount:int)->void`。
- `Log`：`var debug_enabled := true`、`func info(msg:String)`、`func warn(msg:String)`。
- `Toast`：`func show(text:String)`。M1 先做**可见**的底部单行提示（CanvasLayer + Label，2 秒后自动隐藏）；圆角底/淡出放 M2。

- [ ] **Step 1: 写失败测试**

```gdscript
extends RefCounted

func run(t) -> void:
    var qi = preload("res://scripts/autoload/qi.gd").new()
    qi.reset()
    t.eq(qi.value, 100, "qi initial")
    t.check(qi.spend(50), "spend 50")
    t.eq(qi.value, 50, "qi after spend")
    t.check(not qi.spend(60), "cannot overspend")
    t.eq(qi.value, 50, "qi unchanged")
    qi.earn(10)
    t.eq(qi.value, 60, "earn")
    qi.reset()
    t.eq(qi.value, 100, "qi reset")

    var lives = preload("res://scripts/autoload/lives.gd").new()
    lives.reset()
    t.eq(lives.value, 20, "lives initial")
    var over := [false]
    lives.game_over.connect(func(): over[0] = true)
    lives.lose(4)
    t.eq(lives.value, 16, "lives after 4")
    lives.lose(20)
    t.eq(lives.value, 0, "lives floor 0")
    t.check(over[0], "game_over emitted")
    lives.reset()
    t.eq(lives.value, 20, "lives reset")
    t.check(not lives.is_game_over, "over cleared")

    var session = preload("res://scripts/autoload/game_session.gd").new()
    session.start()
    t.check(session.started, "session started")
    session.reset()
    t.check(not session.started, "session reset")
```

- [ ] **Step 2: 运行确认失败**

Expected: 失败，脚本不存在。

- [ ] **Step 3: 实现四个单例**

- 初始值放在 `_init()` / `reset()`，`_ready()` 调一次 `reset()`。
- `Qi.reset()` → 100；`Lives.reset()` → 20 且 `is_game_over=false`。
- `Lives.lose()` 扣到 0 时发 `game_over`，且只发一次。
- `Toast.show()`：第一次调用时在 `/root` 下建一个 `CanvasLayer`（复用），底部居中 `Label`，2 秒后隐藏；M2 再换正式样式。
- `project.godot`：

```ini
[autoload]
GameSession="*res://scripts/autoload/game_session.gd"
Qi="*res://scripts/autoload/qi.gd"
Lives="*res://scripts/autoload/lives.gd"
Log="*res://scripts/autoload/log.gd"
Toast="*res://scripts/autoload/toast.gd"
```

- [ ] **Step 4: 运行确认通过**

Run: `~/.local/bin/godot --headless --path godot --script res://tests/run_tests.gd`
Expected: `FAILURES: 0`。

- [ ] **Step 5: 提交**

```bash
git add godot/scripts/autoload/ godot/project.godot godot/tests/test_autoloads.gd
git commit -m "feat(godot): add game session, qi, lives, log autoloads"
```

---

### Task 5: 敌人 + 走位 + 受击暂停

**Files:**
- Create: `godot/scripts/data/enemy_kinds.gd`
- Create: `godot/scenes/enemy.tscn`
- Create: `godot/scripts/entities/enemy.gd`
- Create: `godot/scripts/entities/path_walker.gd`
- Create: `godot/scripts/entities/hit_pause.gd`
- Create: `godot/tests/test_walker.gd`

**Interfaces:**
- `enemy_kinds.gd`：`const KINDS: Array[Dictionary]`，每项 `{name, texture: Texture2D, hp, speed_factor, life_cost, qi_reward}`，数值照 spec §4.3。
- `HitPause extends Node`：`func request_pause(sec: float)`、`var is_paused: bool`、`var remaining: float`、`func clear()`。
- `PathWalker extends Node`：
  - `func setup(graph: PathGraph, edge: int, dir: int, speed: float, life_cost: int)`
  - `signal reached_base(life_cost: int)`
  - `var edge/ dir/ dist/ speed: ...`
  - `_process(delta)` 推进；受击暂停时跳过。
- `Enemy extends Node2D`：
  - `func setup(kind: Dictionary, graph: PathGraph, edge: int, dir: int, speed: float)`
  - `signal died(kind: Dictionary)`
  - `signal reached_base(life_cost: int)`
  - `func take_damage(amount: int)`
  - `var hp: int`、`var life_cost: int`
  - Enemy **不直接引用** `Qi`/`Lives`，只发信号；扣血/加棋气由 `PathSpawner` 接。

- [ ] **Step 1: 写失败测试（走位）**

```gdscript
extends RefCounted

func run(t) -> void:
    var g := PathGraph.new()
    var rng := RandomNumberGenerator.new()
    rng.seed = 1
    var e := g.pick_forward_edge(g.start_node, rng)
    var w = preload("res://scripts/entities/path_walker.gd").new()
    var reached := [0]
    w.reached_base.connect(func(cost): reached[0] = cost)
    w.setup(g, e, 1, 100.0, 1)
    w._process(1.0)
    t.approx(w.dist, 100.0, 0.01, "walker advances")
    t.eq(reached[0], 0, "not reached yet")
```

- [ ] **Step 2: 运行确认失败**

Expected: 失败。

- [ ] **Step 3: 实现 HitPause + PathWalker**

- `HitPause.request_pause` 取最大值；`_process` 递减。
- `PathWalker._process`：
  - `if pause and pause.is_paused: return`
  - `dist += speed * delta`
  - `while dist >= graph.edge_total(edge)`：减掉；到终点 → `reached_base.emit(life_cost)` + `queue_free()` / 通知 Enemy；否则 `edge = graph.pick_forward_edge(arrived, rng)`，`dir = ...`，`dist -= ...`，guard 64。
  - 位置：`position = Coords.to_screen(graph.pos_on_edge(edge, dir, dist) * 0.8)`。
- `PathWalker` 需要 `pause: HitPause` 引用；`setup` 时 `get_parent().get_node_or_null("HitPause")`。

- [ ] **Step 4: 实现 Enemy + enemy.tscn**

`enemy.tscn`：`Enemy (Node2D)` → `Body (Sprite2D)`、`DamageOverlay (Sprite2D)`、`HitEffect (Sprite2D)`、`HitPause (Node)`、`PathWalker (Node)`。

`Enemy.setup(kind, graph, edge, dir, speed)`：
- `hp = kind.hp`、`life_cost = kind.life_cost`。
- `Body.texture = kind.texture`；`scale = Vector2(0.7, 0.7)`（模板 62×62 → 43.4）。
- `walkers.setup(...)`。
- `walker.reached_base` → `reached_base.emit(life_cost)` + `queue_free()`。
- `take_damage` → 扣血、刷新 overlay、播 hit effect；0 时发 `died(kind)` + `queue_free()`。
- `debug_damage_on_click := false`：开启时点 `Body` 调 `take_damage(1)`，只做调试。

- [ ] **Step 5: 补测试：到终点 / 受伤 / 死亡 / 暂停**

```gdscript
# 到终点：找一条通向终点的边，把 dist 放到接近总长
var to_end := -1
for i in g.edges.size():
    var e: Dictionary = g.edges[i]
    if e.a == g.end_node or e.b == g.end_node:
        to_end = i
        break
t.check(to_end >= 0, "has edge to end")
var dir_to_end := 1 if g.edges[to_end].b == g.end_node else -1
w.setup(g, to_end, dir_to_end, 100.0, 3)
w.dist = g.edge_total(to_end) - 1.0
w._process(0.1)
t.eq(reached[0], 3, "reached base with life cost")

# 受伤/死亡
var enemy = preload("res://scenes/enemy.tscn").instantiate()
var kind = preload("res://scripts/data/enemy_kinds.gd").KINDS[0]
enemy.setup(kind, g, 0, 1, 100.0)
enemy.take_damage(2)
t.eq(enemy.hp, 1, "hp after 2")
var dead := [false]
enemy.died.connect(func(_k): dead[0] = true)
enemy.take_damage(1)
t.check(dead[0], "died emitted")

# 受击暂停取最大值
var hp = preload("res://scripts/entities/hit_pause.gd").new()
hp.request_pause(0.1)
hp.request_pause(0.2)
t.approx(hp.remaining, 0.2, 0.001, "pause takes max")
hp._process(0.3)
t.check(not hp.is_paused, "pause expired")
```

Run: `~/.local/bin/godot --headless --path godot --script res://tests/run_tests.gd`
Expected: `FAILURES: 0`。

- [ ] **Step 6: 提交**

```bash
git add godot/scripts/data/enemy_kinds.gd godot/scenes/enemy.tscn godot/scripts/entities/ godot/tests/test_walker.gd
git commit -m "feat(godot): add enemy kinds, path walker, hit pause"
```

---

### Task 6: 出兵 + 波次 + HUD

**Files:**
- Create: `godot/scripts/core/path_spawner.gd`
- Create: `godot/scripts/core/wave_manager.gd`
- Create: `godot/scenes/ui/hud.tscn`
- Create: `godot/scripts/ui/hud.gd`
- Modify: `godot/scenes/main.tscn`
- Create: `godot/tests/test_wave.gd`

**Interfaces:**
- `PathSpawner extends Node`：
  - `signal spawned(enemy: Node)`
  - `func setup(graph: PathGraph, enemies_root: Node, qi: Object = null, lives: Object = null)`
  - `func deploy()`
  - `func total_count() -> int`、`func alive_count() -> int`
  - `var enemy_count := 100`、`var spawn_interval := 0.5`
  - `qi`/`lives` 为空时从 `/root/Qi`、`/root/Lives` 取；测试可直接注入。
- `WaveManager extends Node`：
  - `signal wave_changed(wave: int)`
  - `signal progress_changed(p: float)`
  - `func setup(spawner: PathSpawner, picker: Node)`
  - `func reset()`、`func start_run()`
  - `func progress_with(total: int, alive: int) -> float`
  - `var wave := 1`、`var max_wave := 5`
- `HUD extends Control`：
  - `func set_qi(v:int)`、`set_lives(v:int)`、`set_wave(w:int, max:int)`、`set_progress(p:float)`、`set_tip(text:String)`。

- [ ] **Step 1: 写失败测试（出兵 + 波次）**

```gdscript
extends RefCounted

func run(t) -> void:
    var g := PathGraph.new()
    var root := Node2D.new()
    var qi = preload("res://scripts/autoload/qi.gd").new()
    var lives = preload("res://scripts/autoload/lives.gd").new()
    qi.reset()
    lives.reset()
    var spawner = preload("res://scripts/core/path_spawner.gd").new()
    spawner.setup(g, root, qi, lives)
    spawner.enemy_count = 3
    spawner.spawn_interval = 0.0
    spawner.deploy()
    spawner._process(0.0)
    t.eq(spawner.total_count(), 3, "spawned 3")
    root.free()

    var wm = preload("res://scripts/core/wave_manager.gd").new()
    wm.reset()
    t.eq(wm.wave, 1, "wave starts at 1")
    t.approx(wm.progress_with(100, 50), 0.1, 0.001, "wave1 half = 0.1")
```

- [ ] **Step 2: 运行确认失败**

Expected: 失败。

- [ ] **Step 3: 实现 PathSpawner**

- `deploy()`：清空 `enemies_root`，`spawned=0`，`spawn_timer=0`。
- `_process(delta)`：未开局（`not GameSession.started`）或 `Lives.is_game_over` 时 return；每 `spawn_interval` 出 1 个，直到 `enemy_count`。
- 生成：`ENEMY_SCENE.instantiate()` → 随机 `KINDS` → `setup(...)` → `enemies_root.add_child()` → 连接 `died` → `qi.earn(kind.qi_reward)`；连接 `reached_base` → `lives.lose(cost)`。
- `total_count()` = `spawned`；`alive_count()` = `enemies_root.get_child_count()`。

- [ ] **Step 4: 实现 WaveManager**

- `reset()`：`wave=1`、`counting=false`、`countdown=0`、`shown_progress=0`。
- `start_run()`：`spawner.enemy_count = 100`、`spawner.deploy()`。
- `_process(delta)`：
  - 未开局/结束 → return。
  - 若 `spawner.total_count()>0 && spawner.alive_count()==0` → 打开选卡（M1 先直接 `counting=true, countdown=3`）。
  - `counting` 递减；到 0 → `wave = min(max_wave, wave+1)`，`spawner.deploy()`。
  - 进度 = `(wave-1 + killed/total) / max_wave`，发 `progress_changed`。
- 暴露 `func progress() -> float` 供 HUD 和测试。

- [ ] **Step 5: 实现 HUD + main.tscn 接线**

- `hud.tscn`：`CanvasLayer` 下 `Control`，含 `QiLabel`、`LivesLabel`、`WaveText`、`ProgressBar`、`TipLabel`。
- `hud.gd` 连接 `Qi.changed`、`Lives.changed`；`WaveManager.progress_changed`。
- `main.tscn`：`Main (Node2D)` → `Background`、`PathLayer`、`Enemies`、`Towers`、`HUD`、`PathGraph` 节点、`PathSpawner`、`WaveManager`。
- `PathLayer`：`TextureRect`，`texture = p.png`，`size = 2048x1152`，`scale = 0.5`，居中。
- `Background`：`TextureRect`，`texture = bg.png`，`stretch_mode = KEEP_ASPECT_COVERED`，铺满 1280×720。
- `draw_network` 调试开关：开启时在 `PathLayer` 上叠一个红色 `Line2D`，按 8 条边画网络（默认关）。

- [ ] **Step 6: 运行确认通过 + 启动验证**

```bash
~/.local/bin/godot --headless --path godot --script res://tests/run_tests.gd
~/.local/bin/godot --headless --path godot --quit-after 120
```

Expected: `FAILURES: 0`；启动无脚本错误。

- [ ] **Step 7: 提交**

```bash
git add godot/scripts/core/path_spawner.gd godot/scripts/core/wave_manager.gd godot/scenes/ui/hud.tscn godot/scripts/ui/hud.gd godot/scenes/main.tscn godot/tests/test_wave.gd
git commit -m "feat(godot): add spawner, wave manager, HUD"
```

---

### Task 7: 拖拽放塔 + 车

**Files:**
- Create: `godot/scripts/towers/tower_base.gd`
- Create: `godot/scripts/towers/tower_che.gd`
- Create: `godot/scripts/towers/tower_placement.gd`
- Create: `godot/scenes/towers/tower_che.tscn`
- Create: `godot/scenes/ui/sidebar.tscn`
- Create: `godot/tests/test_placement.gd`
- Create: `godot/tests/test_tower_che.gd`

**Interfaces:**
- `TowerBase extends Node2D`：`var tower_cost: int`、`var enemies_root: Node`、`func setup(enemies_root: Node)`、`func fire()`。
- `TowerChe extends TowerBase`：`@export` 上述参数；`func fire()` 遍历 `enemies_root` 的子节点做一次性射线。
- `TowerPlacement extends Node`：
  - `func setup(graph: PathGraph, towers_root: Node, qi: Object = null)`（`qi` 为空时取 `/root/Qi`）
  - `func can_place(pos: Vector2) -> bool`
  - `func snap(pos: Vector2) -> Vector2`
  - `func resolve_drop(pos: Vector2) -> Variant`（`Vector2` 或 `null`）
  - `func place(scene: PackedScene, pos: Vector2) -> Node`

- [ ] **Step 1: 写失败测试（放置）**

```gdscript
extends RefCounted

func run(t) -> void:
    var g := PathGraph.new()
    var root := Node2D.new()
    var qi = preload("res://scripts/autoload/qi.gd").new()
    qi.reset()
    var tp = preload("res://scripts/towers/tower_placement.gd").new()
    tp.setup(g, root, qi)
    t.check(tp.can_place(Vector2(0, 0)), "center placeable")
    t.check(not tp.can_place(Vector2(2000, 2000)), "outside rejected")
    var on_path: Vector2 = g.pos_on_edge(0, 1, 0.0) * 0.8
    t.check(not tp.can_place(on_path), "path rejected")
    t.eq(tp.snap(Vector2(0, 0)), tp.snap(Vector2(0, 0)), "snap stable")
    root.free()
```

- [ ] **Step 2: 运行确认失败**

Expected: 失败。

- [ ] **Step 3: 实现 TowerPlacement**

- 常量（Cocos 坐标）：`AREA_MIN=(-412.5,-120)`、`AREA_MAX=(281.9,269.4)`、`GRID=20`、`MIN_PATH_DIST=22`、`MAX_SNAP=200`、`COST=50`。
- `can_place(pos)`：区域 + 到 8 条边折线距离 ≥ 22 + `qi.can_afford(50)`。
- `snap(pos)`：格心。
- `resolve_drop(pos)`：先 `snap`；不合法则遍历网格找最近合法，超过 200 返回 null。
- `place`：实例化、`tower_cost=50`、`Qi.spend(50)`、加到 `towers_root`。

- [ ] **Step 4: 实现 TowerChe + tower_che.tscn**

- `fire()`：对 4 个正方向各做一次「点到线段距离 ≤ hit_radius」判定，命中所有 `enemies` 组节点，扣 1，`HitPause.request_pause(0.12)`。
- 视觉 M1 可以先用 `Line2D` 闪一下（光刃贴图/对象池放 M3）；不影响判定。
- `tower_che.tscn`：`TowerChe (Node2D)` → `Body (Sprite2D, b_che)` + `Area2D`（点击菜单 M2）。

- [ ] **Step 5: 补测试：车的射线**

```gdscript
extends RefCounted

class FakeEnemy extends Node2D:
    var hp := 1
    func take_damage(n: int) -> void:
        hp = maxi(0, hp - n)

func run(t) -> void:
    var root := Node2D.new()
    var tower = preload("res://scenes/towers/tower_che.tscn").instantiate()
    tower.setup(root)
    tower.position = Vector2.ZERO
    root.add_child(tower)
    var a := _dummy_enemy(root, Vector2(100, 0))
    var b := _dummy_enemy(root, Vector2(200, 0))
    var off := _dummy_enemy(root, Vector2(100, 100))
    tower.fire()
    t.eq(a.hp, 0, "first hit")
    t.eq(b.hp, 0, "second hit (pierce)")
    t.eq(off.hp, 1, "off-line not hit")
    root.free()

func _dummy_enemy(parent: Node, pos: Vector2) -> FakeEnemy:
    var e := FakeEnemy.new()
    e.position = pos
    parent.add_child(e)
    return e
```

- [ ] **Step 6: 实现侧栏与拖拽**

- `sidebar.tscn`：`Control`，3 个 `TowerCard`（车/炮/马），M1 只启用车的拖拽；炮/马先显示但点击 Toast「M2 开放」。
- 拖拽：`_input` 跟踪按下/移动/松开；幽灵 `Sprite2D` 半透明；落点用 `TowerPlacement.resolve_drop`。
- 失败提示走 `Toast.show`。

- [ ] **Step 7: 运行确认通过**

Run: `~/.local/bin/godot --headless --path godot --script res://tests/run_tests.gd`
Expected: `FAILURES: 0`。

- [ ] **Step 8: 提交**

```bash
git add godot/scripts/towers/ godot/scenes/towers/ godot/scenes/ui/sidebar.tscn godot/tests/test_placement.gd godot/tests/test_tower_che.gd
git commit -m "feat(godot): add tower placement and che attack"
```

---

### Task 8: 首页 + 结束 + 统一重置

**Files:**
- Create: `godot/scripts/core/run_controller.gd`
- Create: `godot/scripts/ui/home_menu.gd`
- Create: `godot/scripts/ui/game_over.gd`
- Create: `godot/scenes/ui/home_menu.tscn`
- Create: `godot/scenes/ui/game_over.tscn`
- Modify: `godot/scenes/main.tscn`
- Create: `godot/tests/test_run_controller.gd`

**Interfaces:**
- `RunController extends Node`：
  - `func setup_for_test(qi, lives, session)`（测试注入；正常运行时 `_ready()` 从 `/root/Qi` 等取）
  - `func reset_run()`
  - `func start_new_run()`
  - `func go_home()`
- `HomeMenu extends Control`：`signal endless_pressed`、`func show_menu()`、`func hide_menu()`。
- `GameOver extends Control`：`func show_popup()`、`func hide_popup()`、`signal retry_pressed`、`signal home_pressed`。

- [ ] **Step 1: 写失败测试（重置）**

```gdscript
extends RefCounted

func run(t) -> void:
    var qi = preload("res://scripts/autoload/qi.gd").new()
    var lives = preload("res://scripts/autoload/lives.gd").new()
    var session = preload("res://scripts/autoload/game_session.gd").new()
    qi.reset()
    lives.reset()
    session.reset()
    var rc = preload("res://scripts/core/run_controller.gd").new()
    rc.setup_for_test(qi, lives, session)
    qi.set_qi(0)
    lives.lose(20)
    rc.start_new_run()
    t.eq(qi.value, 100, "qi reset")
    t.eq(lives.value, 20, "lives reset")
    t.check(not lives.is_game_over, "over cleared")
    t.check(session.started, "started")
    rc.go_home()
    t.check(not session.started, "home resets session")
```

- [ ] **Step 2: 运行确认失败**

Expected: 失败。

- [ ] **Step 3: 实现 RunController**

- `_ready()`：从 `/root/Qi`、`/root/Lives`、`/root/GameSession` 取引用；节点引用（`Enemies`/`Towers`/`WaveManager`/`PathSpawner`/`HomeMenu`）为 `null` 时跳过，保证测试可只注入单例。
- `reset_run()`：关闭弹窗/选卡 → 清空 `Enemies`/`Towers` → `qi.reset()` → `lives.reset()` → `wave.reset()` → `spawner` 清计数 → 天气回第 1 段（M2）。
- `start_new_run()`：`reset_run()` → `session.start()` → `wave.start_run()`。
- `go_home()`：`reset_run()` → `session.reset()` → `home.show_menu()`。

- [ ] **Step 4: 实现 HomeMenu + GameOver**

- HomeMenu：`index.png` cover + 两个按钮（btn1/btn2）；无尽 → `hide_menu()` + `RunController.start_new_run()`；闯关 → `Toast.show("闯关模式 敬请期待")`。
- GameOver：遮罩 + 面板 + 三个按钮；`Lives.game_over` → `show_popup()`；重试/返回首页接 `RunController`；看广告 → Toast。
- 字体：所有 Label 用 `SystemFont`，`font_names = ["Noto Sans CJK SC","Microsoft YaHei","PingFang SC","WenQuanYi Micro Hei","sans-serif"]`。

- [ ] **Step 5: 运行确认通过 + 启动验证**

```bash
~/.local/bin/godot --headless --path godot --script res://tests/run_tests.gd
~/.local/bin/godot --headless --path godot --quit-after 120
```

Expected: `FAILURES: 0`；启动无错误。

- [ ] **Step 6: 提交**

```bash
git add godot/scripts/core/run_controller.gd godot/scripts/ui/ godot/scenes/ui/ godot/scenes/main.tscn godot/tests/test_run_controller.gd
git commit -m "feat(godot): add home menu, game over, run reset"
```

---

### Task 9: M1 验收 + README

**Files:**
- Create/Modify: `godot/README.md`

**Interfaces:**
- Consumes: 前 8 个任务。
- Produces: 可交付的 M1 工程与运行说明。

- [ ] **Step 1: 跑完整测试**

Run: `~/.local/bin/godot --headless --path godot --script res://tests/run_tests.gd`
Expected: `FAILURES: 0`。

- [ ] **Step 2: 启动主场景**

Run: `~/.local/bin/godot --headless --path godot --quit-after 300`
Expected: 退出码 0，无 `SCRIPT ERROR`。

- [ ] **Step 3: 人工验收（对照 spec §7 M1）**

- [ ] 启动窗口 1280×720，背景铺满。
- [ ] 首页可见，点「无尽模式」进入。
- [ ] 敌人沿路径网络单向走，不回头。
- [ ] 6 种棋子外观/血量/速度不同。
- [ ] 拖车到棋盘：能放、吸附、避开路径、扣 50。
- [ ] 车四向墨刃命中多个敌人。
- [ ] 棋气击杀回涨；生命到终点扣；HUD 数字正确。
- [ ] 波次清空后倒计时进入下一波。
- [ ] 生命归零弹结束；重试能重新开局；返回首页能回首页。

- [ ] **Step 4: 写 README**

`godot/README.md` 至少包含：Godot 版本、运行命令、测试命令、目录说明、M1 已实现/未实现清单、炮/马 M2 占位说明。

- [ ] **Step 5: 提交**

```bash
git add godot/README.md
git commit -m "docs(godot): add M1 README and acceptance checklist"
```

---

## 后续（不在本计划内）

- **M2 计划**：炮、马、侧栏完整、选卡、塔菜单/详情/卖出、天气、Toast、返回首页完整流程。
- **M3 计划**：正片叠底着色器、天气调参、布局逐项对照、性能、字体子集。
