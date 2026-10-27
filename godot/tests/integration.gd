extends Node

## 集成冒烟：加载主场景 → 开局 → 出兵 → 放塔 → 生命归零 → 重开。
## 运行：godot --headless --path godot --fixed-fps 60 res://tests/integration.tscn

func _ready() -> void:
	var main = load("res://scenes/main.tscn").instantiate()
	add_child(main)
	await get_tree().process_frame

	var rc = main.get_node_or_null("RunController")
	if rc == null:
		printerr("INTEGRATION: no RunController")
		get_tree().quit(1)
		return

	rc.start_new_run()
	for _i in 150:
		await get_tree().process_frame

	var enemies = main.get_node_or_null("Enemies")
	var count: int = enemies.get_child_count() if enemies else -1
	print("INTEGRATION enemies=", count)

	var placement = main.get_node_or_null("TowerPlacement")
	var before_qi: int = Qi.value
	var tower = null
	if placement:
		var p = placement.resolve_drop(Vector2(-200, 100))
		if p != null:
			tower = placement.place(load("res://scenes/towers/tower_che.tscn"), p)
	var placed_ok: bool = tower != null \
		and Qi.value == before_qi - 50 \
		and main.get_node("Towers").get_child_count() == 1
	print("INTEGRATION tower=", placed_ok)

	Lives.lose(100)
	await get_tree().process_frame
	var game_over = main.get_node_or_null("GameOver")
	var over_ok: bool = game_over != null and game_over.visible \
		and main.get_node("Enemies").process_mode == Node.PROCESS_MODE_DISABLED
	print("INTEGRATION gameover=", over_ok)

	rc.start_new_run()
	await get_tree().process_frame
	var reset_ok: bool = game_over != null and not game_over.visible \
		and Qi.value == 100 and Lives.value == 20 \
		and main.get_node("Towers").get_child_count() == 0
	print("INTEGRATION reset=", reset_ok)

	get_tree().quit(0 if count > 0 and placed_ok and over_ok and reset_ok else 1)
