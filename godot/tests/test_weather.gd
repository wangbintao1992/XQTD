extends RefCounted


class FakeSpawner:
	var total := 0
	var run_spawned_total := 0

	func total_count() -> int:
		return total


class FakeSession:
	var started := true


class FakeLives:
	var is_game_over := false


func run(t) -> void:
	var prev = WeatherSystem.instance
	var w = preload("res://scripts/core/weather_system.gd").new()
	w.build_layers()
	t.eq(w.stage_for(0), 0, "stage 0")
	t.eq(w.stage_for(29), 0, "stage 0 at 29")
	t.eq(w.stage_for(30), 1, "stage 1 at 30")
	t.eq(w.stage_for(120), 4, "stage 4 at 120")

	w.set_weather("rain")
	t.check(w.layers["rain"][0].visible, "rain active")
	t.check(not w.layers["snow"][0].visible, "snow off")

	w.set_weather("storm")
	t.check(w.layers["storm"][0].visible, "storm active")

	var fs := FakeSpawner.new()
	fs.run_spawned_total = 90
	w.setup(fs)
	w._process(0.0)
	t.eq(w.current_weather, "storm", "run counter drives stage")

	fs.total = 0
	fs.run_spawned_total = 90
	w._process(0.0)
	t.eq(w.current_weather, "storm", "deploy does not reset stage")

	fs.run_spawned_total = 0
	w._process(0.0)
	t.eq(w.current_weather, "rain", "run reset returns to rain")

	var sess := FakeSession.new()
	var lv := FakeLives.new()
	lv.is_game_over = true
	w.setup(fs, sess, lv)
	w._process(0.0)
	t.check(not w.layers["rain"][0].visible, "game over turns weather off")
	lv.is_game_over = false
	fs.run_spawned_total = 90
	w._process(0.0)
	t.check(w.layers["storm"][0].visible, "weather resumes")

	w.free()
	WeatherSystem.instance = prev
