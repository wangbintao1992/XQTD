class_name TowerActionMenu
extends CanvasLayer

## 点已放置的塔：左右弹「详情 / 卖出 +N」。卖出返还放置时花费的 80%。

@export var offset_x := 96.0
@export var button_width := 108.0
@export var button_height := 48.0
@export var button_radius := 24.0
@export var sell_ratio := 0.8
@export var fallback_cost := 50
@export var detail_color := Color(58.0 / 255.0, 54.0 / 255.0, 50.0 / 255.0, 235.0 / 255.0)
@export var sell_color := Color(150.0 / 255.0, 52.0 / 255.0, 44.0 / 255.0, 235.0 / 255.0)

var qi: Object
var detail: Node

var menu: Control
var mask: Control
var _host: Control


var is_open: bool:
	get:
		return _host != null and is_instance_valid(_host)


func _ready() -> void:
	if qi == null:
		qi = get_node_or_null("/root/Qi")
	if detail == null:
		var main := get_parent()
		if main:
			detail = main.get_node_or_null("TowerDetail")


func setup_for_test(qi_: Object, detail_: Node = null) -> void:
	qi = qi_
	if detail_:
		detail = detail_


func show_for(tower: Node) -> void:
	close()
	if not is_instance_valid(tower):
		return

	_host = Control.new()
	_host.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(_host)

	mask = ColorRect.new()
	mask.color = Color(18.0 / 255.0, 16.0 / 255.0, 14.0 / 255.0, 30.0 / 255.0)
	mask.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mask.mouse_filter = Control.MOUSE_FILTER_STOP
	mask.gui_input.connect(func(ev):
		if ev is InputEventMouseButton and ev.pressed:
			close()
	)
	_host.add_child(mask)

	menu = Control.new()
	menu.position = tower.global_position
	_host.add_child(menu)

	_make_button(menu, "详情", -offset_x, 0.0, detail_color, func(): _show_detail())
	_make_button(menu, "卖出 +%d" % refund_of(tower), offset_x, 0.0, sell_color,
		func(): sell(tower))


func close() -> void:
	if _host and is_instance_valid(_host):
		_host.queue_free()
	_host = null
	menu = null
	mask = null


func refund_of(tower: Node) -> int:
	return maxi(0, roundi(float(cost_of(tower)) * maxf(0.0, sell_ratio)))


func cost_of(tower: Node) -> int:
	var stored = tower.get("tower_cost")
	if stored != null and int(stored) > 0:
		return int(stored)
	return maxi(0, fallback_cost)


func sell(tower: Node) -> void:
	if not is_instance_valid(tower):
		close()
		return

	var back := refund_of(tower)
	if qi and back > 0:
		qi.earn(back)

	var parent := tower.get_parent()
	if parent:
		parent.remove_child(tower)
	tower.queue_free()
	close()


func _show_detail() -> void:
	close()
	if detail and detail.has_method("show_detail"):
		detail.show_detail(0.0)


func _make_button(
	parent: Control,
	text: String,
	x: float,
	y: float,
	fill: Color,
	on_click: Callable
) -> void:
	var btn := Button.new()
	btn.text = text
	btn.size = Vector2(button_width, button_height)
	btn.position = Vector2(x - button_width * 0.5, y - button_height * 0.5)
	btn.add_theme_font_override("font", UiFont.make())
	btn.add_theme_font_size_override("font_size", 24)

	var sb := StyleBoxFlat.new()
	sb.bg_color = fill
	var r := int(button_radius)
	sb.corner_radius_top_left = r
	sb.corner_radius_top_right = r
	sb.corner_radius_bottom_left = r
	sb.corner_radius_bottom_right = r
	for state in ["normal", "hover", "pressed"]:
		btn.add_theme_stylebox_override(state, sb)

	btn.pressed.connect(on_click)
	parent.add_child(btn)
