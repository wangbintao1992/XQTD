extends Node

## 集成冒烟：加载主场景 → RunController.start_new_run() → 等 2.5 秒 → 场上应有敌人。

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
	get_tree().quit(0 if count > 0 else 1)
