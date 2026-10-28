extends RefCounted


func _kind(type_name: String) -> Dictionary:
	for kind in EnemyKinds.ELITES:
		if str(kind.get("elite_type", "")) == type_name:
			return kind
	return {}


func _spawn_enemy(kind: Dictionary, graph) -> Enemy:
	var enemy = preload("res://scenes/enemy.tscn").instantiate()
	enemy.setup(kind, graph, 0, 1, 100.0)
	return enemy


func run(t) -> void:
	var hp = preload("res://scripts/entities/hit_pause.gd").new()
	hp.immune = true
	hp.request_pause(1.0)
	t.check(not hp.is_paused, "immune ignores pause")
	hp.free()

	var graph = preload("res://scripts/core/path_graph.gd").new()
	var ma_kind := _kind("ma")
	var che_kind := _kind("che")
	var pao_kind := _kind("pao")
	t.check(not ma_kind.is_empty() and not che_kind.is_empty() and not pao_kind.is_empty(), "elite kinds found")

	var ma_enemy: Enemy = _spawn_enemy(ma_kind, graph)
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
	t.eq(che.modulate, Color.WHITE, "stun tint cleared")
	che.stun(0.0)
	t.check(not che.is_stunned, "zero stun ignored")
	t.eq(che.modulate, Color.WHITE, "zero stun keeps tint")

	var che_enemy: Enemy = _spawn_enemy(che_kind, graph)
	che_enemy.towers_root = towers
	t.root.add_child(che_enemy)
	che_enemy.position = Vector2.ZERO
	che.stun_timer = 0.0
	che_enemy._use_elite_ability()
	t.check(che.is_stunned, "che stuns nearest")
	t.approx(che.stun_timer, Enemy.CHE_STUN_SECONDS, 0.001, "che stun duration")

	var far = preload("res://scenes/towers/tower_che.tscn").instantiate()
	far.auto_fire = false
	far.position = Vector2(300, 0)
	towers.add_child(far)
	che.stun_timer = 0.0
	far.stun_timer = 0.0
	che.modulate = Color.WHITE
	far.modulate = Color.WHITE

	var pao_enemy: Enemy = _spawn_enemy(pao_kind, graph)
	pao_enemy.towers_root = towers
	t.root.add_child(pao_enemy)
	pao_enemy.position = Vector2.ZERO
	pao_enemy._use_elite_ability()
	t.check(far.is_stunned, "pao stuns farthest")
	t.approx(far.stun_timer, Enemy.PAO_STUN_SECONDS, 0.001, "pao stun duration")
	t.check(not che.is_stunned, "pao leaves nearest")

	che.stun_timer = 0.0
	far.stun_timer = 0.0
	che.modulate = Color.WHITE
	far.modulate = Color.WHITE
	var ma_enemy2: Enemy = _spawn_enemy(ma_kind, graph)
	ma_enemy2.towers_root = towers
	t.root.add_child(ma_enemy2)
	ma_enemy2.position = Vector2.ZERO
	ma_enemy2._use_elite_ability()
	t.check(not che.is_stunned and not far.is_stunned, "ma has no stun")

	# 拖拽幽灵（无 stun 方法的 Sprite2D）不能抢目标
	che.stun_timer = 0.0
	far.stun_timer = 0.0
	che.modulate = Color.WHITE
	far.modulate = Color.WHITE
	var ghost := Sprite2D.new()
	ghost.position = Vector2(10, 0)
	towers.add_child(ghost)
	che_enemy._use_elite_ability()
	t.check(che.is_stunned, "drag ghost ignored, real nearest stunned")
	t.check(not far.is_stunned, "che leaves far")
	ghost.free()

	# 自动 3s 首触发 + 5s 冷却
	che.stun_timer = 0.0
	che.modulate = Color.WHITE
	che_enemy._ability_timer = 0.1
	t.check(not che_enemy.tick_ability(0.05), "ability waits")
	t.check(che_enemy.tick_ability(0.06), "ability auto triggers")
	t.check(che.is_stunned, "auto ability stuns")
	che.stun_timer = 0.0
	che.modulate = Color.WHITE
	t.check(not che_enemy.tick_ability(4.9), "ability on cooldown")
	t.check(not che.is_stunned, "cooldown leaves tower free")
	t.check(che_enemy.tick_ability(0.2), "ability triggers after cooldown")
	t.check(che.is_stunned, "second auto ability stuns")

	# 眩晕期间不攻击，恢复后立刻恢复开火
	var enemies_root := Node2D.new()
	t.root.add_child(enemies_root)
	var dummy = preload("res://scenes/enemy.tscn").instantiate()
	dummy.setup({"hp": 1000, "life_cost": 1, "name": "dummy"}, graph, 0, 1, 0.0)
	enemies_root.add_child(dummy)
	dummy.position = Vector2(150, 0)
	che.enemies_root = enemies_root
	che.auto_fire = true
	che.windup_time = 0.0
	che._timer = 0.0
	che.stun_timer = 0.0
	che.modulate = Color.WHITE
	var before_hp: int = dummy.hp
	che.stun(1.0)
	for _i in 20:
		che._process(0.1)
	t.eq(dummy.hp, before_hp, "stunned tower does not fire")
	che.stun_timer = 0.0
	che.modulate = Color.WHITE
	che._timer = 0.0
	che._process(1.3)
	t.check(dummy.hp < before_hp, "tower fires after stun")

	che_enemy.free()
	pao_enemy.free()
	ma_enemy2.free()
	enemies_root.free()
	towers.free()
