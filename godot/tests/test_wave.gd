extends RefCounted


class FakeSpawner:
	var enemy_count := 10
	var total := 0
	var alive := 0
	var deployed := 0

	func total_count() -> int:
		return total

	func alive_count() -> int:
		return alive

	func deploy() -> void:
		deployed += 1
		total = 0
		alive = 0


class FakePicker:
	var opened := 0
	var closed := 0
	var cb: Callable

	func open_with_timeout(_seconds: float, done: Callable) -> void:
		opened += 1
		cb = done

	func close() -> void:
		closed += 1


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

	# 未出完本波不能算「清空」
	var wm2 = preload("res://scripts/core/wave_manager.gd").new()
	var fs := FakeSpawner.new()
	wm2.setup(fs, null, null, null)
	wm2.reset()
	fs.total = 3
	fs.alive = 0
	wm2._process(0.0)
	t.check(not wm2.counting, "not counting before all spawned")
	fs.total = 10
	wm2._process(0.0)
	t.check(wm2.counting, "counting after all spawned and clear")
	wm2._process(3.1)
	t.eq(wm2.wave, 2, "wave advanced")
	t.eq(fs.deployed, 1, "deployed next wave")
	wm2.free()

	# 有选卡时：清空先开选卡，选完再倒计时
	var wm3 = preload("res://scripts/core/wave_manager.gd").new()
	var fs3 := FakeSpawner.new()
	var fp := FakePicker.new()
	wm3.setup(fs3, fp, null, null)
	wm3.reset()
	fs3.total = 10
	fs3.alive = 0
	wm3._process(0.0)
	t.check(wm3.picking, "picker opened on clear")
	t.eq(fp.opened, 1, "picker opened once")
	wm3._process(1.0)
	t.eq(wm3.wave, 1, "picking pauses wave")
	fp.cb.call()
	t.check(not wm3.picking, "picking done")
	t.check(wm3.counting, "counting after pick")
	wm3._process(3.1)
	t.eq(wm3.wave, 2, "wave advanced after pick")
	wm3.reset()
	t.eq(fp.closed, 2, "reset closes picker each time")
	wm3.free()

	root.free()
	qi.free()
	lives.free()
	spawner.free()
	wm.free()
