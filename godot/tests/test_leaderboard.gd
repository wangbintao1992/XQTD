extends RefCounted


func run(t) -> void:
	var prev = LeaderboardData.instance
	var lb = preload("res://scripts/autoload/leaderboard.gd").new()
	lb.reset_for_test()
	t.eq(lb.best_wave, 0, "starts at 0")
	t.eq(lb.player_name, "无名棋手", "default name")
	t.eq(lb.player_id.length(), 36, "uuid length")
	t.check(lb.player_id.contains("-"), "uuid shape")
	t.check(not lb.online, "starts offline")

	var changed := [0]
	lb.best_changed.connect(func(_v): changed[0] += 1)

	t.check(lb.submit(12), "submit 12")
	t.eq(lb.best_wave, 12, "best 12")
	t.check(not lb.submit(5), "lower is not a new best")
	t.eq(lb.best_wave, 12, "still 12")
	t.check(lb.submit(20), "submit 20")
	t.eq(lb.best_wave, 20, "best 20")
	t.eq(changed[0], 2, "signal only on improve")

	var submitted := [0]
	lb.submitted.connect(func(_accepted, _rank, _best): submitted[0] += 1)

	lb._apply_report_response({"accepted": true, "bestWave": 30, "rank": 2})
	t.eq(lb.best_wave, 30, "server best raises local")
	t.eq(lb.my_rank, 2, "server rank applied")
	t.check(lb.online, "online after report")
	t.eq(submitted[0], 1, "submitted signal")

	lb._apply_report_response({"accepted": false, "bestWave": 30, "rank": 2})
	t.eq(lb.best_wave, 30, "lower server best keeps local")

	lb._apply_report_response({"accepted": true, "bestWave": 42, "rank": 1})
	t.eq(lb.best_wave, 42, "higher server best applied")
	t.eq(lb.my_rank, 1, "rank updated")

	lb._apply_top_response({
		"entries": [
			{"rank": 1, "playerId": "p1", "name": "甲", "wave": 42},
			{"rank": 2, "playerId": "p2", "name": "乙", "wave": 31},
		],
	})
	t.eq(lb.top_entries.size(), 2, "top entries parsed")
	t.eq(lb.top_entries[0].name, "甲", "top name")
	t.eq(lb.top_entries[1].wave, 31, "top wave")

	lb._apply_player_response({"found": true, "bestWave": 50, "rank": 1})
	t.eq(lb.best_wave, 50, "player best applied")
	t.eq(lb.my_rank, 1, "player rank applied")

	lb._apply_player_response({"found": false, "bestWave": 0, "rank": null})
	t.eq(lb.my_rank, 0, "missing player rank reset")

	# 离线最高补报：提交失败后 pending=true，玩家查询发现服务端没有记录时重发
	lb.reset_for_test()
	var sent: Array = []
	lb.http_enabled = true
	lb.report_sender = func(w): sent.append(w)
	t.check(lb.submit(18), "offline best accepted locally")
	t.eq(sent, [18], "first report attempted")
	t.check(lb.pending_report, "pending after local improve")
	lb._apply_player_response({"found": false, "bestWave": 0, "rank": null})
	t.eq(sent, [18, 18], "offline best re-sent when server missing")
	lb._apply_report_response({"accepted": true, "bestWave": 18, "rank": 1})
	t.check(not lb.pending_report, "pending cleared after server accepts")
	lb._apply_player_response({"found": true, "bestWave": 0, "rank": 1})
	t.eq(sent, [18, 18, 18], "server behind re-sends local best")

	lb.set_player_name("  Alice  ")
	t.eq(lb.player_name, "Alice", "name trimmed")
	lb.set_player_name("12345678901234567890")
	t.eq(lb.player_name.length(), 16, "name capped")

	lb.reset_for_test()
	t.eq(lb.best_wave, 0, "reset for test")

	var path := "user://test_leaderboard_profile.json"
	var lb2 = preload("res://scripts/autoload/leaderboard.gd").new()
	lb2.persistence_enabled = true
	lb2.http_enabled = false
	lb2.profile_path = path
	lb2.player_id = "test-player-01"
	lb2.player_name = "Alice"
	lb2.best_wave = 33
	lb2.pending_report = true
	lb2.save_profile()

	var lb3 = preload("res://scripts/autoload/leaderboard.gd").new()
	lb3.persistence_enabled = true
	lb3.http_enabled = false
	lb3.profile_path = path
	lb3.load_profile()
	t.eq(lb3.player_id, "test-player-01", "profile player id roundtrip")
	t.eq(lb3.player_name, "Alice", "profile name roundtrip")
	t.eq(lb3.best_wave, 33, "profile best roundtrip")
	t.check(lb3.pending_report, "pending roundtrip")

	var corrupt_path := "user://test_leaderboard_corrupt.json"
	var corrupt := FileAccess.open(corrupt_path, FileAccess.WRITE)
	corrupt.store_string("{not json")
	corrupt.close()
	var lb4 = preload("res://scripts/autoload/leaderboard.gd").new()
	lb4.persistence_enabled = true
	lb4.http_enabled = false
	lb4.profile_path = corrupt_path
	lb4.load_profile()
	t.check(lb4.last_error.contains("损坏"), "corrupt profile reported")
	t.check(FileAccess.file_exists(corrupt_path + ".bak"), "corrupt profile backed up")

	DirAccess.remove_absolute(ProjectSettings.globalize_path(path))
	DirAccess.remove_absolute(ProjectSettings.globalize_path(corrupt_path))
	DirAccess.remove_absolute(ProjectSettings.globalize_path(corrupt_path + ".bak"))
	lb2.free()
	lb3.free()
	lb4.free()
	lb.free()
	LeaderboardData.instance = prev
