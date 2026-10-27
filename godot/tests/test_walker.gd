extends RefCounted


func run(t) -> void:
	var g = preload("res://scripts/core/path_graph.gd").new()
	var rng := RandomNumberGenerator.new()
	rng.seed = 1
	var e: int = g.pick_forward_edge(g.start_node, rng)

	var target := Node2D.new()
	var w = preload("res://scripts/entities/path_walker.gd").new()
	var reached := [0]
	w.reached_base.connect(func(cost): reached[0] = cost)
	w.setup(g, e, 1, 100.0, 1, target)
	w._process(1.0)
	t.approx(w.dist, 100.0, 0.01, "walker advances")
	t.eq(reached[0], 0, "not reached yet")

	# 到终点
	var to_end := -1
	for i in g.edges.size():
		var ed: Dictionary = g.edges[i]
		if ed.a == g.end_node or ed.b == g.end_node:
			to_end = i
			break
	t.check(to_end >= 0, "has edge to end")
	var dir_to_end := 1 if g.edges[to_end].b == g.end_node else -1
	var w2 = preload("res://scripts/entities/path_walker.gd").new()
	var reached2 := [0]
	w2.reached_base.connect(func(cost): reached2[0] = cost)
	w2.setup(g, to_end, dir_to_end, 100.0, 3, target)
	w2.dist = g.edge_total(to_end) - 1.0
	w2._process(0.1)
	t.eq(reached2[0], 3, "reached base with life cost")

	# 受伤 / 死亡
	var root := Node2D.new()
	var enemy = preload("res://scenes/enemy.tscn").instantiate()
	var kind = preload("res://scripts/data/enemy_kinds.gd").KINDS[0]
	root.add_child(enemy)
	enemy.setup(kind, g, e, 1, 100.0)
	enemy.walker.set_process(false)
	var body := enemy.get_node("Body") as Sprite2D
	t.check(body.texture is AtlasTexture, "enemy body trimmed")
	var used: Vector2 = Vector2(body.texture.region.size) if body.texture is AtlasTexture else body.texture.get_size()
	t.approx(used.x * body.scale.x, 43.4, 0.1, "enemy body width")
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

	w.free()
	w2.free()
	hp.free()
	target.free()
	root.free()
