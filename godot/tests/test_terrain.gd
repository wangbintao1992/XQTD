extends RefCounted


func run(t) -> void:
	var prev = TerrainSystem.instance
	var ts = preload("res://scripts/core/terrain_system.gd").new()
	ts._ready()

	var scale := Coords.PATH_IMAGE_SCALE
	var river_pos: Vector2 = Coords.to_screen(Vector2(-200, 203) * scale)
	var mountain_pos: Vector2 = Coords.to_screen(Vector2(100, -243) * scale)
	var bridge_pos: Vector2 = Coords.to_screen(Vector2(300, -17) * scale)
	t.eq(ts.type_at(river_pos), "river", "river zone")
	t.approx(ts.speed_mult_at(river_pos), 0.8, 0.001, "river speed")
	t.eq(ts.type_at(mountain_pos), "mountain", "mountain zone")
	t.approx(ts.speed_mult_at(mountain_pos), 0.7, 0.001, "mountain speed")
	t.eq(ts.type_at(bridge_pos), "bridge", "bridge zone")
	t.approx(ts.speed_mult_at(bridge_pos), 1.1, 0.001, "bridge speed")
	t.eq(ts.type_at(Coords.to_screen(Vector2(0, 0))), "", "outside zone")
	t.approx(ts.speed_mult_at(Coords.to_screen(Vector2(0, 0))), 1.0, 0.001, "outside speed")

	var g = preload("res://scripts/core/path_graph.gd").new()
	var rng := RandomNumberGenerator.new()
	rng.seed = 1
	var e = g.pick_forward_edge(g.start_node, rng)

	var target := Node2D.new()
	var w = preload("res://scripts/entities/path_walker.gd").new()
	var weather := WeatherSystem.enemy_speed_mult()
	w.setup(g, e, 1, 100.0, 1, target)
	target.position = river_pos
	w._process(1.0)
	t.approx(w.dist, 80.0 * weather, 0.01, "river slows walker")

	# 出河：过河卒 ×1.15
	w._process(1.0)
	t.approx(w.dist, (80.0 + 115.0) * weather, 0.01, "river buff after crossing")

	# 再次进河：挂起 buff，出河恢复
	target.position = river_pos
	w._process(1.0)
	t.approx(w.dist, (195.0 + 80.0) * weather, 0.01, "re-enter river slows")
	w._process(1.0)
	t.approx(w.dist, (275.0 + 115.0) * weather, 0.01, "river buff restored")

	var target2 := Node2D.new()
	var w2 = preload("res://scripts/entities/path_walker.gd").new()
	w2.setup(g, e, 1, 100.0, 1, target2)
	target2.position = Coords.to_screen(Vector2(0, 0))
	w2._process(1.0)
	t.approx(w2.dist, 100.0 * weather, 0.01, "outside normal speed")

	ts.free()
	w.free()
	w2.free()
	target.free()
	target2.free()
	TerrainSystem.instance = prev
