extends Node

## M1 的轻提示：底部居中的单行文字，2 秒后隐藏。
## 正式圆角底/淡出 M2 再做。

const HOLD := 2.0

var _layer: CanvasLayer
var _label: Label
var _timer := 0.0


func show(text: String) -> void:
	_ensure()
	if not _label:
		return
	_label.text = text
	_layer.visible = true
	_timer = HOLD


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

	_label = Label.new()
	_label.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_label.offset_bottom = -96
	_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_label.vertical_alignment = VERTICAL_ALIGNMENT_BOTTOM
	_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_label.add_theme_font_size_override("font_size", 26)
	_label.add_theme_color_override("font_color", Color(0.98, 0.96, 0.92))

	var font := SystemFont.new()
	font.font_names = PackedStringArray([
		"Noto Sans CJK SC", "Microsoft YaHei", "PingFang SC",
		"WenQuanYi Micro Hei", "sans-serif",
	])
	_label.add_theme_font_override("font", font)

	root.add_child(_label)
	_layer.visible = false


func _process(delta: float) -> void:
	if _timer > 0.0:
		_timer -= delta
		if _timer <= 0.0 and _layer:
			_layer.visible = false
