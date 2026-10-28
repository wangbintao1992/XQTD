extends RefCounted


func run(t) -> void:
	var prev = LeaderboardData.instance
	var lb = preload("res://scripts/autoload/leaderboard.gd").new()
	lb.reset_for_test()

	var panel = preload("res://scripts/ui/leaderboard_panel.gd").new()
	t.root.add_child(panel)
	t.check(not panel.is_open, "panel starts closed")

	panel.show_panel()
	t.check(panel.is_open, "panel opens")
	t.check(panel._status_label.text.contains("离线"), "offline status")
	t.check(panel._me_label.text.contains("第 0 波"), "empty player line")

	lb.best_wave = 17
	lb.my_rank = 3
	lb.top_entries = [
		{"rank": 1, "playerId": "p1", "name": "甲", "wave": 42},
		{"rank": 2, "playerId": "p2", "name": "乙", "wave": 31},
		{"rank": 3, "playerId": lb.player_id, "name": "我", "wave": 17},
	]
	panel.refresh()
	t.check(panel._list.get_child_count() == 3, "top rows rendered")
	t.check(panel._me_label.text.contains("排名 #3"), "my rank rendered")

	panel._name_edit.text = " 棋圣 "
	panel.save_name()
	t.eq(lb.player_name, "棋圣", "panel saves name")
	t.check(panel._name_edit.text == "棋圣", "name field refreshed")

	panel.hide_panel()
	t.check(not panel.is_open, "panel closes")

	panel.free()
	lb.free()
	LeaderboardData.instance = prev
