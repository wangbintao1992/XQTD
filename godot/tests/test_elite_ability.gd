extends RefCounted


func run(t) -> void:
	var hp = preload("res://scripts/entities/hit_pause.gd").new()
	hp.immune = true
	hp.request_pause(1.0)
	t.check(not hp.is_paused, "immune ignores pause")
	hp.free()

	var graph = preload("res://scripts/core/path_graph.gd").new()
	var elites: Array = EnemyKinds.ELITES
	var ma_kind: Dictionary = elites[0]
	var che_kind: Dictionary = elites[1]
	var pao_kind: Dictionary = elites[2]

	var ma_enemy = preload("res://scenes/enemy.tscn").instantiate()
	ma_enemy.setup(ma_kind, graph, 0, 1, 100.0)
	t.eq(ma_enemy.elite_type, "ma", "ma kind")
	t.check(ma_enemy.get_node("HitPause").immune, "ma is pause immune")
	ma_enemy.free()

	var towers := Node2D.new()
	t.root.add_child(towers)
	var che = preload("res://scenes/towers/tower_che.tscn").instantiate()
	che.auto_fire = false
	che.position = Vector2(100, 0)
	towers.add_child(che)

	che.stun(1.0)
	t.check(che.is_stunned, "tower stunned")
	che._process(0.5)
	t.check(che.is_stunned, "still stunned")
	che._process(0.6)
	t.check(not che.is_stunned, "stun expired")

	var che_enemy = preload("res://scenes/enemy.tscn").instantiate()
	che_enemy.setup(che_kind, graph, 0, 1, 100.0)
	t.root.add_child(che_enemy)
	che_enemy.position = Vector2.ZERO
	che_enemy.towers_root = towers
	che.stun_timer = 0.0
	che_enemy._use_elite_ability()
	t.check(che.is_stunned, "che stuns nearest")

	var far = preload("res://scenes/towers/tower_che.tscn").instantiate()
	far.auto_fire = false
	far.position = Vector2(300, 0)
	towers.add_child(far)
	che.stun_timer = 0.0
	far.stun_timer = 0.0

	var pao_enemy = preload("res://scenes/enemy.tscn").instantiate()
	pao_enemy.setup(pao_kind, graph, 0, 1, 100.0)
	t.root.add_child(pao_enemy)
	pao_enemy.position = Vector2.ZERO
	pao_enemy.towers_root = towers
	pao_enemy._use_elite_ability()
	t.check(far.is_stunned, "pao stuns farthest")
	t.check(not che.is_stunned, "pao leaves nearest")

	che.stun_timer = 0.0
	far.stun_timer = 0.0
	var ma_enemy2 = preload("res://scenes/enemy.tscn").instantiate()
	ma_enemy2.setup(ma_kind, graph, 0, 1, 100.0)
	t.root.add_child(ma_enemy2)
	ma_enemy2.position = Vector2.ZERO
	ma_enemy2.towers_root = towers
	ma_enemy2._use_elite_ability()
	t.check(not che.is_stunned and not far.is_stunned, "ma has no stun")

	che_enemy.free()
	pao_enemy.free()
	ma_enemy2.free()
	towers.free()
