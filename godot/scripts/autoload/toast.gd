extends Node

## 统一轻提示：底部居中、宣纸/墨色圆角底、1.6s 停留 + 0.35s 淡出。

const HOLD := 1.6
const FADE := 0.35
const PANEL_SIZE := Vector2(600, 56)

var _layer: CanvasLayer
var _panel: Panel
var _label: Label
var _timer := 0.0
var _fading := false


func show(text: String) -> void:
	_ensure()
	if not _label:
		return
	_label.text = text
	_layer.visible = true
	_panel.modulate.a = 1.0
	_timer = HOLD
	_fading = false


func _ensure() -> void:
	if _layer:
		return

	_layer = CanvasLayer.new()
	_layer.layer = 100
	add_child(_layer)

	var root := Control.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_layer.add_child(root)

	_panel = Panel.new()
	_panel.size = PANEL_SIZE
	_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(22.0 / 255.0, 20.0 / 255.0, 17.0 / 255.0, 210.0 / 255.0)
	sb.corner_radius_top_left = 12
	sb.corner_radius_top_right = 12
	sb.corner_radius_bottom_left = 12
	sb.corner_radius_bottom_right = 12
	_panel.add_theme_stylebox_override("panel", sb)
	root.add_child(_panel)

	_label = Label.new()
	_label.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_label.add_theme_font_size_override("font_size", 26)
	_label.add_theme_color_override("font_color", Color(0.98, 0.96, 0.92))
	_label.add_theme_font_override("font", UiFont.make())
	_panel.add_child(_label)

	var vp := get_viewport().get_visible_rect().size
	_panel.position = Vector2(
		vp.x * 0.5 - PANEL_SIZE.x * 0.5,
		vp.y - 96.0 - PANEL_SIZE.y
	)
	_layer.visible = false


func _process(delta: float) -> void:
	if not _layer or not _layer.visible:
		return
	if not _fading:
		_timer -= delta
		if _timer <= 0.0:
			_fading = true
		return
	_panel.modulate.a = maxf(0.0, _panel.modulate.a - delta / FADE)
	if _panel.modulate.a <= 0.0:
		_layer.visible = false
