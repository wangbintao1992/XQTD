class_name LeaderboardData
extends Node

## 真实排行榜：本地最高 + 客户端身份 + Java 后端同步。
## 离线时本地最高仍然立即生效；网络失败只更新面板状态，不回滚成绩。

signal best_changed(value: int)
signal top_updated(entries: Array)
signal sync_changed(online: bool, message: String)
signal submitted(accepted: bool, rank: int, best_wave: int)
signal name_changed(value: String)

const DEFAULT_SERVER_URL := "http://127.0.0.1:8080"
const DEFAULT_NAME := "无名棋手"
const MAX_NAME_LENGTH := 16
const REQUEST_TIMEOUT := 3.0
const TOP_LIMIT := 10

static var instance: LeaderboardData

var best_wave := 0
var player_id := ""
var player_name := DEFAULT_NAME
var server_url := DEFAULT_SERVER_URL
var top_entries: Array = []
var my_rank := 0
var online := false
var last_error := ""
var pending_report := false
var persistence_enabled := true
var http_enabled := true
var profile_path := "user://leaderboard_profile.json"
var report_sender := Callable()


func _init() -> void:
	instance = self


func _ready() -> void:
	server_url = _resolve_server_url()
	if DisplayServer.get_name() == "headless" \
		and OS.get_environment("XQTD_LEADERBOARD_LIVE") != "1":
		# 无头测试/冒烟不读真实存档、不联网，避免污染与不确定状态
		persistence_enabled = false
		http_enabled = false
		_ensure_identity()
		return
	if persistence_enabled:
		load_profile()
	_ensure_identity()
	save_profile()
	if http_enabled:
		refresh()


func _exit_tree() -> void:
	if instance == self:
		instance = null


func reset_for_test() -> void:
	persistence_enabled = false
	http_enabled = false
	best_wave = 0
	player_id = new_player_id()
	player_name = DEFAULT_NAME
	top_entries = []
	my_rank = 0
	online = false
	last_error = ""
	pending_report = false
	server_url = DEFAULT_SERVER_URL


func submit(wave: int) -> bool:
	var w := maxi(0, wave)
	if w <= best_wave:
		if pending_report and http_enabled and not player_id.is_empty():
			_post_report(best_wave)
		return false
	best_wave = w
	pending_report = true
	best_changed.emit(best_wave)
	save_profile()
	if http_enabled and not player_id.is_empty():
		_post_report(w)
	return true


func refresh() -> void:
	if not http_enabled:
		return
	_ensure_identity()
	_fetch_top()
	_fetch_player()


func set_player_name(raw: String) -> void:
	var cleaned := sanitize_name(raw)
	if cleaned == player_name:
		return
	player_name = cleaned
	name_changed.emit(player_name)
	save_profile()
	if http_enabled and best_wave > 0:
		_post_report(best_wave)


func save_profile() -> void:
	if not persistence_enabled:
		return
	var tmp_path := profile_path + ".tmp"
	var file := FileAccess.open(tmp_path, FileAccess.WRITE)
	if file == null:
		return
	file.store_string(JSON.stringify({
		"playerId": player_id,
		"name": player_name,
		"bestWave": best_wave,
		"pendingReport": pending_report,
	}))
	file.close()
	var from := ProjectSettings.globalize_path(tmp_path)
	var to := ProjectSettings.globalize_path(profile_path)
	var err := DirAccess.rename_absolute(from, to)
	if err != OK:
		DirAccess.remove_absolute(to)
		DirAccess.rename_absolute(from, to)


func load_profile() -> void:
	if not FileAccess.file_exists(profile_path):
		return
	var file := FileAccess.open(profile_path, FileAccess.READ)
	if file == null:
		return
	var raw := file.get_as_text()
	var parsed = _parse_json(raw)
	if not (parsed is Dictionary):
		var backup := FileAccess.open(profile_path + ".bak", FileAccess.WRITE)
		if backup:
			backup.store_string(raw)
		last_error = "排行榜存档损坏，已备份"
		return
	if parsed.has("playerId"):
		player_id = str(parsed.playerId)
	if parsed.has("name"):
		player_name = sanitize_name(str(parsed.name))
	var loaded_best := int(parsed.get("bestWave", 0))
	if loaded_best > best_wave:
		best_wave = loaded_best
		best_changed.emit(best_wave)
	pending_report = bool(parsed.get("pendingReport", false))


func new_player_id() -> String:
	var bytes: PackedByteArray = Crypto.new().generate_random_bytes(16)
	bytes[6] = (bytes[6] & 0x0f) | 0x40
	bytes[8] = (bytes[8] & 0x3f) | 0x80
	var hex := ""
	for byte in bytes:
		hex += "%02x" % byte
	return "%s-%s-%s-%s-%s" % [
		hex.substr(0, 8),
		hex.substr(8, 4),
		hex.substr(12, 4),
		hex.substr(16, 4),
		hex.substr(20, 12),
	]


func _ensure_identity() -> void:
	if player_id.is_empty():
		player_id = new_player_id()


func _resolve_server_url() -> String:
	var env := OS.get_environment("XQTD_LEADERBOARD_URL").strip_edges()
	if not env.is_empty():
		return env.trim_suffix("/")
	var configured := str(ProjectSettings.get_setting("xqtd/leaderboard_url", DEFAULT_SERVER_URL)).strip_edges()
	if configured.is_empty():
		return DEFAULT_SERVER_URL
	return configured.trim_suffix("/")


func sanitize_name(raw: String) -> String:
	var cleaned := raw.replace("\n", " ").replace("\r", " ").replace("\t", " ").strip_edges()
	cleaned = " ".join(cleaned.split(" ", false))
	if cleaned.is_empty():
		return DEFAULT_NAME
	if cleaned.length() > MAX_NAME_LENGTH:
		cleaned = cleaned.substr(0, MAX_NAME_LENGTH)
	return cleaned


func _post_report(wave: int) -> void:
	pending_report = true
	save_profile()
	if report_sender.is_valid():
		report_sender.call(wave)
		return
	_request_json("POST", "/api/leaderboard/reports", {
		"playerId": player_id,
		"name": player_name,
		"wave": wave,
	}, _on_report)


func _fetch_top() -> void:
	_request_json("GET", "/api/leaderboard/top?limit=%d" % TOP_LIMIT, {}, _on_top)


func _fetch_player() -> void:
	_request_json("GET", "/api/leaderboard/players/" + player_id, {}, _on_player)


func _request_json(method: String, path: String, body: Dictionary, callback: Callable) -> void:
	if not http_enabled:
		return
	var http := HTTPRequest.new()
	http.timeout = REQUEST_TIMEOUT
	add_child(http)

	var headers := PackedStringArray(["Accept: application/json"])
	var payload := ""
	var http_method := HTTPClient.METHOD_GET
	if method == "POST":
		http_method = HTTPClient.METHOD_POST
		headers.append("Content-Type: application/json")
		payload = JSON.stringify(body)

	var err := http.request(server_url + path, headers, http_method, payload)
	if err != OK:
		http.queue_free()
		_mark_offline("无法连接排行榜服务器")
		callback.call(0, {})
		return

	http.request_completed.connect(
		func(result: int, code: int, _headers: PackedStringArray, data: PackedByteArray) -> void:
			http.queue_free()
			if result != HTTPRequest.RESULT_SUCCESS:
				var reason := "请求超时" if result == HTTPRequest.RESULT_TIMEOUT else "无法连接排行榜服务器"
				_mark_offline(reason)
				callback.call(0, {})
				return
			if code < 200 or code >= 300:
				_mark_http_error(code)
				callback.call(code, {})
				return
			var parsed = _parse_json(data.get_string_from_utf8())
			if parsed is Dictionary:
				callback.call(code, parsed)
			else:
				_mark_error("排行榜返回格式错误")
				callback.call(0, {})
	)


func _on_report(code: int, data: Dictionary) -> void:
	if code < 200 or code >= 300:
		if code >= 400 and code < 500:
			pending_report = false
			save_profile()
		return
	var accepted := bool(data.get("accepted", false))
	_apply_report_response(data)
	if accepted:
		_fetch_top()
	if my_rank > 0:
		Toast.show("排行榜：第 %d 名（第 %d 波）" % [my_rank, best_wave])


func _on_top(code: int, data: Dictionary) -> void:
	if code < 200 or code >= 300:
		return
	_apply_top_response(data)


func _on_player(code: int, data: Dictionary) -> void:
	if code < 200 or code >= 300:
		return
	_apply_player_response(data)


func _apply_report_response(data: Dictionary) -> void:
	var server_best := int(data.get("bestWave", best_wave))
	if server_best > best_wave:
		best_wave = server_best
		best_changed.emit(best_wave)
	pending_report = false
	save_profile()
	my_rank = int(data.get("rank", my_rank))
	_mark_online()
	submitted.emit(bool(data.get("accepted", false)), my_rank, best_wave)


func _apply_top_response(data: Dictionary) -> void:
	top_entries = []
	var entries = data.get("entries", [])
	if entries is Array:
		for entry in entries:
			if entry is Dictionary:
				top_entries.append(entry)
	_mark_online()
	top_updated.emit(top_entries)


func _apply_player_response(data: Dictionary) -> void:
	if bool(data.get("found", false)):
		my_rank = int(data.get("rank", 0))
		var server_best := int(data.get("bestWave", 0))
		if server_best > best_wave:
			best_wave = server_best
			best_changed.emit(best_wave)
			save_profile()
		if best_wave > server_best:
			pending_report = true
			save_profile()
			_post_report(best_wave)
		elif pending_report:
			pending_report = false
			save_profile()
	else:
		my_rank = 0
		if best_wave > 0:
			# 服务端没有记录（例如离线期间刷新了最高）：补报本地最高
			pending_report = true
			save_profile()
			_post_report(best_wave)
	_mark_online()


func _parse_json(text: String):
	var parser := JSON.new()
	if parser.parse(text) != OK:
		return null
	return parser.data


func _mark_online() -> void:
	online = true
	last_error = ""
	sync_changed.emit(true, "")


func _mark_offline(message: String) -> void:
	online = false
	last_error = message
	sync_changed.emit(false, message)


func _mark_error(message: String) -> void:
	online = true
	last_error = message
	sync_changed.emit(true, message)


func _mark_http_error(code: int) -> void:
	_mark_error("排行榜返回错误（%d）" % code)
