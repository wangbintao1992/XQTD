extends RefCounted


func run(t) -> void:
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

	w.free()
