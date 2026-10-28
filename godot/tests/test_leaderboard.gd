extends RefCounted


func run(t) -> void:
	var prev = LeaderboardData.instance
	var lb = preload("res://scripts/autoload/leaderboard.gd").new()
	lb.reset_for_test()
	t.eq(lb.best_wave, 0, "starts at 0")

	var changed := [0]
	lb.best_changed.connect(func(_v): changed[0] += 1)

	t.check(lb.submit(12), "submit 12")
	t.eq(lb.best_wave, 12, "best 12")
	t.check(not lb.submit(5), "lower is not a new best")
	t.eq(lb.best_wave, 12, "still 12")
	t.check(lb.submit(20), "submit 20")
	t.eq(lb.best_wave, 20, "best 20")
	t.eq(changed[0], 2, "signal only on improve")

	lb.reset_for_test()
	t.eq(lb.best_wave, 0, "reset for test")

	lb.free()
	LeaderboardData.instance = prev
