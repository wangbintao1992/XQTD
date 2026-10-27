extends RefCounted


func run(t) -> void:
	var g = preload("res://scripts/core/path_graph.gd").new()
	var root := Node2D.new()
	var qi = preload("res://scripts/autoload/qi.gd").new()
	var lives = preload("res://scripts/autoload/lives.gd").new()
	qi.reset()
	lives.reset()

	var spawner = preload("res://scripts/core/path_spawner.gd").new()
	spawner.setup(g, root, qi, lives)
	spawner.enemy_count = 3
	spawner.spawn_interval = 0.0
	spawner.deploy()
	spawner._process(0.0)
	t.eq(spawner.total_count(), 3, "spawned 3")
	t.eq(spawner.alive_count(), 3, "alive 3")

	var wm = preload("res://scripts/core/wave_manager.gd").new()
	wm.reset()
	t.eq(wm.wave, 1, "wave starts at 1")
	t.approx(wm.progress_with(100, 50), 0.1, 0.001, "wave1 half = 0.1")

	var f = preload("res://scripts/util/ui_font.gd").make()
	t.check(f is SystemFont, "ui font is SystemFont")
	t.check(f.font_names.size() > 0, "ui font has fallbacks")

	root.free()
	qi.free()
	lives.free()
	spawner.free()
	wm.free()
