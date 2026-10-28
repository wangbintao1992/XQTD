class_name RunController
extends Node

## 开局 / 重试 / 回首页的统一入口。所有运行态重置都走这里。

var qi: Object
var lives: Object
var session: Object

var enemies: Node
var towers: Node
var spawner: PathSpawner
var wave: WaveManager
var hud: Hud
var home: HomeMenu
var game_over: GameOver
var action_menu: TowerActionMenu
var tower_detail: TowerDetail
var weather: WeatherSystem
var combo: ComboSystem
var leaderboard: Object
var equipment_panel: EquipmentPanel
var leaderboard_panel: LeaderboardPanel


func _ready() -> void:
	if qi == null:
		qi = get_node_or_null("/root/Qi")
	if lives == null:
		lives = get_node_or_null("/root/Lives")
	if session == null:
		session = get_node_or_null("/root/GameSession")

	var main := get_parent()
	if main:
		enemies = main.get_node_or_null("Enemies")
		towers = main.get_node_or_null("Towers")
		spawner = main.get_node_or_null("PathSpawner") as PathSpawner
		wave = main.get_node_or_null("WaveManager") as WaveManager
		hud = main.get_node_or_null("HUD") as Hud
		home = main.get_node_or_null("HomeMenu") as HomeMenu
		game_over = main.get_node_or_null("GameOver") as GameOver
		action_menu = main.get_node_or_null("TowerActionMenu") as TowerActionMenu
		tower_detail = main.get_node_or_null("TowerDetail") as TowerDetail
		weather = main.get_node_or_null("Weather") as WeatherSystem
		combo = main.get_node_or_null("ComboSystem") as ComboSystem
		equipment_panel = main.get_node_or_null("EquipmentPanel") as EquipmentPanel
		leaderboard_panel = main.get_node_or_null("LeaderboardPanel") as LeaderboardPanel
	leaderboard = get_node_or_null("/root/Leaderboard")

	if home:
		home.endless_pressed.connect(start_new_run)
	if game_over:
		game_over.retry_pressed.connect(start_new_run)
		game_over.home_pressed.connect(go_home)
	if lives:
		lives.game_over.connect(_on_game_over)

	# 场景启动 = 干净的主页状态
	if qi:
		qi.reset()
	if lives:
		lives.reset()
	if session:
		session.reset()


func setup_for_test(qi_: Object, lives_: Object, session_: Object) -> void:
	qi = qi_
	lives = lives_
	session = session_


func reset_run() -> void:
	if game_over:
		game_over.hide_popup()
	if action_menu:
		action_menu.close()
	if tower_detail:
		tower_detail.hide_detail()
	if weather:
		weather.reset()
	if combo:
		combo.reset()
	if equipment_panel:
		equipment_panel.hide_panel()
	if leaderboard_panel:
		leaderboard_panel.hide_panel()
	if enemies:
		for child in enemies.get_children():
			enemies.remove_child(child)
			child.queue_free()
		enemies.process_mode = Node.PROCESS_MODE_INHERIT
	if towers:
		for child in towers.get_children():
			towers.remove_child(child)
			child.queue_free()
	if qi:
		qi.reset()
	if lives:
		lives.reset()
	if wave:
		wave.reset()
		wave.set_process(true)
	if RunStateData.instance:
		RunStateData.instance.reset()
	if spawner:
		spawner.deploy()
		spawner.reset_run_counter()
		spawner.set_process(true)
	if hud:
		var shown_max := 5
		if wave:
			shown_max = 0 if wave.endless else wave.max_wave
		hud.set_wave(1, shown_max)
		hud.set_progress(0.0)
		hud.set_tip("")


func start_new_run() -> void:
	reset_run()
	if home:
		home.hide_menu()
	if session:
		session.start()
	if wave:
		wave.start_run()


func go_home() -> void:
	reset_run()
	if session:
		session.reset()
	if home:
		home.show_menu()


func _on_game_over() -> void:
	if leaderboard and RunStateData.instance:
		leaderboard.submit(RunStateData.instance.wave)
	if game_over:
		game_over.show_popup()
	if spawner:
		spawner.set_process(false)
	if wave:
		wave.set_process(false)
	if weather:
		weather.set_weather("")
	if combo:
		combo.enabled = false
	if enemies:
		enemies.process_mode = Node.PROCESS_MODE_DISABLED
