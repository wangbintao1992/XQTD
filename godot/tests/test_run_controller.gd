extends RefCounted


func run(t) -> void:
	var qi = preload("res://scripts/autoload/qi.gd").new()
	var lives = preload("res://scripts/autoload/lives.gd").new()
	var session = preload("res://scripts/autoload/game_session.gd").new()
	qi.reset()
	lives.reset()
	session.reset()

	var rc = preload("res://scripts/core/run_controller.gd").new()
	rc.setup_for_test(qi, lives, session)

	qi.set_qi(0)
	lives.lose(20)
	rc.start_new_run()
	t.eq(qi.value, 100, "qi reset")
	t.eq(lives.value, 20, "lives reset")
	t.check(not lives.is_game_over, "over cleared")
	t.check(session.started, "started")

	rc.go_home()
	t.check(not session.started, "home resets session")

	qi.free()
	lives.free()
	session.free()
	rc.free()
