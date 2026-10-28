extends Node

## 真实后端联调（不跑在默认单测里）：
## XQTD_LEADERBOARD_URL=http://127.0.0.1:8080 godot --headless --path godot res://tests/leaderboard_live.tscn

const TIMEOUT := 8.0

var _lb: LeaderboardData
var _submitted := false
var _accepted := false


func _ready() -> void:
	_lb = LeaderboardData.instance
	if _lb == null:
		printerr("LIVE: no Leaderboard autoload")
		get_tree().quit(1)
		return

	_lb.persistence_enabled = false
	_lb.http_enabled = true
	_lb.player_id = "live-test-player"
	_lb.player_name = "联调棋手"
	_lb.submitted.connect(func(accepted, _rank, _best): _submitted = true; _accepted = accepted)

	_lb.submit(23)
	if not await _wait_for(func(): return _submitted):
		printerr("LIVE: submit failed: ", _lb.last_error)
		get_tree().quit(1)
		return

	_lb.refresh()
	if not await _wait_for(func(): return not _lb.top_entries.is_empty()):
		printerr("LIVE: top request failed: ", _lb.last_error)
		get_tree().quit(1)
		return

	var ok: bool = _lb.online and _lb.top_entries.size() >= 1 \
		and _lb.my_rank >= 1 and _lb.best_wave >= 23
	print("LIVE ok=", ok, " top=", _lb.top_entries.size(), " rank=", _lb.my_rank,
		" best=", _lb.best_wave, " accepted=", _accepted, " url=", _lb.server_url)
	get_tree().quit(0 if ok else 1)


func _wait_for(predicate: Callable) -> bool:
	var elapsed := 0.0
	while elapsed < TIMEOUT:
		if predicate.call():
			return true
		await get_tree().process_frame
		elapsed += get_process_delta_time()
	return predicate.call()
