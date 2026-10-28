extends Node2D

## 主场景接线：创建路径图，把 spawner / wave / HUD / 放塔 / 侧栏串起来。
## `auto_start` 只用于本地调试；正式流程由 HomeMenu 调 RunController。

@export var auto_start := false

@onready var enemies: Node2D = $Enemies
@onready var towers: Node2D = $Towers
@onready var spawner: PathSpawner = $PathSpawner
@onready var wave: WaveManager = $WaveManager
@onready var hud: Hud = $HUD
@onready var placement: TowerPlacement = $TowerPlacement
@onready var sidebar: Sidebar = $Sidebar
@onready var card_picker: CardPicker = $CardPicker
@onready var action_menu: TowerActionMenu = $TowerActionMenu
@onready var tower_detail: TowerDetail = $TowerDetail
@onready var weather: WeatherSystem = $Weather
@onready var combo: ComboSystem = $ComboSystem

var graph: PathGraph


func _ready() -> void:
	graph = PathGraph.new()
	spawner.setup(graph, enemies, Qi, Lives, GameSession)
	spawner.set_towers_root(towers)
	weather.setup(spawner, GameSession, Lives)
	wave.setup(spawner, card_picker, GameSession, Lives)
	wave.endless = true
	placement.setup(graph, towers, enemies, Qi)
	combo.setup(towers, enemies, GameSession, Lives)
	action_menu.detail = tower_detail
	placement.tower_placed.connect(func(tower: Node):
		tower.clicked.connect(func(t: Node): action_menu.show_for(t))
	)

	wave.wave_changed.connect(func(w: int): hud.set_wave(w, 0 if wave.endless else wave.max_wave))
	wave.progress_changed.connect(func(p: float): hud.set_progress(p))

	for card in sidebar.get_cards():
		card.drag_requested.connect(
			func(scene: PackedScene, cost: int, tex: Texture2D, kind: String):
				placement.begin_drag(scene, cost, tex, Vector2.INF, kind)
		)
		card.unavailable.connect(func(msg: String): Toast.show(msg))

	if RunStateData.instance:
		RunStateData.instance.traits_changed.connect(_refresh_tower_traits)
		RunStateData.instance.mutation_changed.connect(_refresh_tower_traits)
	weather.weather_changed.connect(func(_w: String): _refresh_tower_traits())
	if EquipmentManagerData.instance:
		EquipmentManagerData.instance.changed.connect(_refresh_tower_traits)

	hud.set_wave(wave.wave, 0 if wave.endless else wave.max_wave)
	hud.set_progress(0.0)

	if auto_start:
		GameSession.start()
		wave.start_run()


func _refresh_tower_traits() -> void:
	for tower in towers.get_children():
		if tower.has_method("apply_traits"):
			tower.apply_traits()
