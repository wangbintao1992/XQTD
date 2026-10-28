class_name LeaderboardPanel
extends CanvasLayer

## 按 L 开关的排行榜面板：Top 10、个人最高/排名、昵称修改。

var _root: Control
var _open := false
var _status_label: Label
var _me_label: Label
var _name_edit: LineEdit
var _list: VBoxContainer


var is_open: bool:
	get:
		return _open


func _ready() -> void:
	hide_panel()
	if LeaderboardData.instance:
		LeaderboardData.instance.top_updated.connect(func(_entries): _refresh_if_open())
		LeaderboardData.instance.sync_changed.connect(func(_online, _message): _refresh_if_open())
		LeaderboardData.instance.name_changed.connect(func(_name): _refresh_if_open())
		LeaderboardData.instance.best_changed.connect(func(_best): _refresh_if_open())


func _input(event: InputEvent) -> void:
	if not (event is InputEventKey) or not event.pressed or event.echo:
		return
	if event.keycode == KEY_ESCAPE and _open:
		hide_panel()
		var viewport := get_viewport()
		if viewport:
			viewport.set_input_as_handled()
		return
	if event.keycode != KEY_L:
		return
	if _name_edit and _name_edit.has_focus():
		return
	var session = get_node_or_null("/root/GameSession")
	if session and not session.started:
		return
	toggle()


func toggle() -> void:
	if _open:
		hide_panel()
	else:
		show_panel()


func show_panel() -> void:
	if LeaderboardData.instance == null:
		return
	_open = true
	_build()
	refresh()
	if LeaderboardData.instance.http_enabled:
		LeaderboardData.instance.refresh()


func hide_panel() -> void:
	_open = false
	if _root and is_instance_valid(_root):
		_root.queue_free()
	_root = null
	_status_label = null
	_me_label = null
	_name_edit = null
	_list = null


func save_name() -> void:
	if LeaderboardData.instance == null or _name_edit == null:
		return
	var before := LeaderboardData.instance.player_name
	LeaderboardData.instance.set_player_name(_name_edit.text)
	if LeaderboardData.instance.player_name != before:
		Toast.show("昵称已保存")
	refresh()


func refresh() -> void:
	if not _open or LeaderboardData.instance == null or _list == null:
		return
	var lb := LeaderboardData.instance

	if not lb.online:
		var reason := lb.last_error if lb.last_error != "" else "本地最高 %d 波" % lb.best_wave
		_status_label.text = "离线 · " + reason + " · " + lb.server_url
	elif lb.last_error != "":
		_status_label.text = "错误 · " + lb.last_error + " · " + lb.server_url
	else:
		_status_label.text = "已连接 · " + lb.server_url

	if lb.my_rank > 0:
		_me_label.text = "我的最高：第 %d 波 · 排名 #%d" % [lb.best_wave, lb.my_rank]
	else:
		_me_label.text = "我的最高：第 %d 波 · 未上榜" % lb.best_wave

	if not _name_edit.has_focus():
		_name_edit.text = lb.player_name

	for child in _list.get_children():
		_list.remove_child(child)
		child.queue_free()

	if lb.top_entries.is_empty():
		var empty := Label.new()
		empty.text = "暂无记录，完成一局后自动上报"
		empty.add_theme_font_override("font", UiFont.make())
		empty.add_theme_font_size_override("font_size", 18)
		empty.add_theme_color_override("font_color", Color(0.4, 0.33, 0.27))
		_list.add_child(empty)
		return

	var font := UiFont.make()
	for entry in lb.top_entries:
		var line := Label.new()
		line.text = "#%d  %s  第 %d 波" % [
			int(entry.get("rank", 0)),
			str(entry.get("name", "无名棋手")),
			int(entry.get("wave", 0)),
		]
		line.add_theme_font_override("font", font)
		line.add_theme_font_size_override("font_size", 20)
		var mine := str(entry.get("playerId", "")) == lb.player_id
		line.add_theme_color_override(
			"font_color",
			Color(0.55, 0.16, 0.1) if mine else Color(0.2, 0.16, 0.13)
		)
		_list.add_child(line)


func _refresh_if_open() -> void:
	if _open:
		refresh()


func _build() -> void:
	if _root and is_instance_valid(_root):
		_root.queue_free()

	_root = Control.new()
	_root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(_root)

	var mask := ColorRect.new()
	mask.color = Color(10.0 / 255.0, 8.0 / 255.0, 6.0 / 255.0, 120.0 / 255.0)
	mask.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mask.mouse_filter = Control.MOUSE_FILTER_STOP
	mask.gui_input.connect(func(ev):
		if ev is InputEventMouseButton and ev.pressed:
			hide_panel()
	)
	_root.add_child(mask)

	var panel := Panel.new()
	panel.size = Vector2(680, 520)
	panel.position = Vector2(300, 100)
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.933, 0.898, 0.835, 0.98)
	style.corner_radius_top_left = 16
	style.corner_radius_top_right = 16
	style.corner_radius_bottom_left = 16
	style.corner_radius_bottom_right = 16
	panel.add_theme_stylebox_override("panel", style)
	_root.add_child(panel)

	var font := UiFont.make()

	var title := Label.new()
	title.text = "排行榜（L 关闭）"
	title.position = Vector2(0, 14)
	title.size = Vector2(680, 40)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_override("font", font)
	title.add_theme_font_size_override("font_size", 28)
	title.add_theme_color_override("font_color", Color(0.15, 0.12, 0.1))
	panel.add_child(title)

	_status_label = _make_label(font, 18, Color(0.35, 0.28, 0.23))
	_status_label.position = Vector2(28, 58)
	_status_label.size = Vector2(624, 28)
	panel.add_child(_status_label)

	_me_label = _make_label(font, 22, Color(0.2, 0.16, 0.13))
	_me_label.position = Vector2(28, 88)
	_me_label.size = Vector2(624, 32)
	panel.add_child(_me_label)

	var name_label := _make_label(font, 18, Color(0.35, 0.28, 0.23))
	name_label.text = "昵称"
	name_label.position = Vector2(28, 132)
	name_label.size = Vector2(60, 32)
	panel.add_child(name_label)

	_name_edit = LineEdit.new()
	_name_edit.position = Vector2(88, 130)
	_name_edit.size = Vector2(380, 34)
	_name_edit.max_length = LeaderboardData.MAX_NAME_LENGTH
	_name_edit.add_theme_font_override("font", font)
	_name_edit.add_theme_font_size_override("font_size", 18)
	_name_edit.text_submitted.connect(func(_text): save_name())
	panel.add_child(_name_edit)

	var save_btn := Button.new()
	save_btn.text = "保存"
	save_btn.position = Vector2(476, 130)
	save_btn.size = Vector2(80, 34)
	save_btn.add_theme_font_override("font", font)
	save_btn.add_theme_font_size_override("font_size", 18)
	save_btn.pressed.connect(save_name)
	panel.add_child(save_btn)

	var refresh_btn := Button.new()
	refresh_btn.text = "刷新"
	refresh_btn.position = Vector2(564, 130)
	refresh_btn.size = Vector2(88, 34)
	refresh_btn.add_theme_font_override("font", font)
	refresh_btn.add_theme_font_size_override("font_size", 18)
	refresh_btn.pressed.connect(func():
		if LeaderboardData.instance == null:
			return
		if LeaderboardData.instance.http_enabled:
			LeaderboardData.instance.refresh()
			Toast.show("正在刷新排行榜…")
		else:
			refresh()
	)
	panel.add_child(refresh_btn)

	var hint := _make_label(font, 16, Color(0.45, 0.38, 0.32))
	hint.text = "只保留个人最高波数；同波数并列"
	hint.position = Vector2(28, 174)
	hint.size = Vector2(624, 26)
	panel.add_child(hint)

	var scroll := ScrollContainer.new()
	scroll.position = Vector2(28, 204)
	scroll.size = Vector2(624, 292)
	panel.add_child(scroll)

	_list = VBoxContainer.new()
	_list.custom_minimum_size = Vector2(600, 0)
	scroll.add_child(_list)


func _make_label(font: Font, size: int, color: Color) -> Label:
	var label := Label.new()
	label.add_theme_font_override("font", font)
	label.add_theme_font_size_override("font_size", size)
	label.add_theme_color_override("font_color", color)
	return label
