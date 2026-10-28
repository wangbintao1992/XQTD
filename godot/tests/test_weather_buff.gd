extends RefCounted


func run(t) -> void:
	var prev = WeatherSystem.instance
	var w = preload("res://scripts/core/weather_system.gd").new()
	w.build_layers()

	w.set_weather("rain")
	t.approx(WeatherSystem.tower_interval_mult(), 0.95, 0.001, "rain tower interval")
	t.approx(WeatherSystem.enemy_speed_mult(), 0.95, 0.001, "rain enemy speed")

	w.set_weather("snow")
	t.approx(WeatherSystem.tower_range_mult(), 0.9, 0.001, "snow tower range")
	t.approx(WeatherSystem.enemy_speed_mult(), 0.9, 0.001, "snow enemy speed")

	w.set_weather("fog")
	t.approx(WeatherSystem.tower_damage_mult(), 0.9, 0.001, "fog tower damage")

	w.set_weather("storm")
	t.approx(WeatherSystem.tower_damage_mult(), 1.1, 0.001, "storm tower damage")
	t.approx(WeatherSystem.tower_interval_mult(), 0.95, 0.001, "storm tower interval")
	t.approx(WeatherSystem.enemy_speed_mult(), 1.05, 0.001, "storm enemy speed")

	w.set_weather("")
	t.approx(WeatherSystem.tower_damage_mult(), 1.0, 0.001, "no weather")

	w.set_weather("rain")
	var towers := Node2D.new()
	t.root.add_child(towers)
	var che = preload("res://scenes/towers/tower_che.tscn").instantiate()
	che.setup(null, towers)
	che.auto_fire = false
	towers.add_child(che)
	if not che.is_node_ready():
		che._ready()
	che.apply_traits()
	t.approx(che.fire_interval, 1.2 * 0.95, 0.01, "tower reads weather interval")

	var g = preload("res://scripts/core/path_graph.gd").new()
	var rng := RandomNumberGenerator.new()
	rng.seed = 1
	var e = g.pick_forward_edge(g.start_node, rng)
	var target := Node2D.new()
	var walker = preload("res://scripts/entities/path_walker.gd").new()
	walker.setup(g, e, 1, 100.0, 1, target)
	w.set_weather("snow")
	walker._process(1.0)
	t.approx(walker.dist, 90.0, 0.01, "walker reads weather speed")

	towers.free()
	target.free()
	walker.free()
	w.free()
	WeatherSystem.instance = prev
