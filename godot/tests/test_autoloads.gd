extends RefCounted


func run(t) -> void:
	var qi = preload("res://scripts/autoload/qi.gd").new()
	qi.reset()
	t.eq(qi.value, 100, "qi initial")
	t.check(qi.spend(50), "spend 50")
	t.eq(qi.value, 50, "qi after spend")
	t.check(not qi.spend(60), "cannot overspend")
	t.eq(qi.value, 50, "qi unchanged")
	qi.earn(10)
	t.eq(qi.value, 60, "earn")
	qi.reset()
	t.eq(qi.value, 100, "qi reset")

	var lives = preload("res://scripts/autoload/lives.gd").new()
	lives.reset()
	t.eq(lives.value, 20, "lives initial")
	var over := [false]
	lives.game_over.connect(func(): over[0] = true)
	lives.lose(4)
	t.eq(lives.value, 16, "lives after 4")
	lives.lose(20)
	t.eq(lives.value, 0, "lives floor 0")
	t.check(over[0], "game_over emitted")
	lives.reset()
	t.eq(lives.value, 20, "lives reset")
	t.check(not lives.is_game_over, "over cleared")

	var session = preload("res://scripts/autoload/game_session.gd").new()
	session.start()
	t.check(session.started, "session started")
	session.reset()
	t.check(not session.started, "session reset")

	qi.free()
	lives.free()
	session.free()
