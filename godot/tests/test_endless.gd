extends RefCounted


class FakeSpawner:
	var enemy_count := 0
	var total := 0
	var alive := 0
	var deployed := 0
	var hp_mult := 1.0
	var speed_mult := 1.0

	func total_count() -> int:
		return total

	func alive_count() -> int:
		return alive

	func deploy() -> void:
		deployed += 1


class FakePicker:
	var opened := 0
	var ids: Array = []
	var cb: Callable
	var selected_trait := ""

	func open_with_traits(new_ids: Array, _seconds: float, done: Callable) -> void:
		opened += 1
		ids = new_ids
		cb = done

	func close() -> void:
		pass


func run(t) -> void:
	var rs = preload("res://scripts/autoload/run_state.gd").new()
	rs.reset()
	RunStateData.instance = rs

	var wm = preload("res://scripts/core/wave_manager.gd").new()
	var fs := FakeSpawner.new()
	var fp := FakePicker.new()
	wm.setup(fs, fp, null, null)
	wm.endless = true
	wm.base_round = 20
	wm.count_growth = 1.15
	wm.hp_growth = 1.1
	wm.speed_growth = 1.02

	wm.reset()
	wm.start_run()
	t.eq(wm.wave, 1, "wave 1")
	t.eq(fs.enemy_count, 20, "wave1 count")
	t.approx(fs.hp_mult, 1.0, 0.001, "wave1 hp")

	fs.total = 20
	fs.alive = 0
	wm._process(0.0)
	t.check(wm.picking, "picker opened")
	t.eq(fp.ids.size(), 3, "3 trait options")

	fp.selected_trait = "free_horse"
	fp.cb.call()
	t.check(rs.has_trait("free_horse"), "trait added")
	t.check(not wm.picking, "picking done")

	wm._process(3.1)
	t.eq(wm.wave, 2, "wave 2")
	t.eq(fs.enemy_count, 23, "wave2 count grows")
	t.approx(fs.hp_mult, 1.1, 0.001, "wave2 hp grows")
	t.eq(rs.wave, 2, "run state wave synced")

	wm.wave = 5
	wm.counting = true
	wm.countdown = 0.0
	wm._process(0.0)
	t.eq(wm.wave, 6, "endless goes past wave 5")
	t.check(fs.enemy_count > 23, "wave6 count keeps growing")

	t.approx(wm.progress_with(100, 50), 0.5, 0.001, "endless progress is per-wave")

	wm.free()
	rs.free()
	RunStateData.instance = null
