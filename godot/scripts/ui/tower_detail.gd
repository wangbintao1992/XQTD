class_name TowerDetail
extends CanvasLayer

## 棋子详情卡：detail.png 按 520 宽显示；show(0) 保持显示，点空白关闭。

@export var detail_texture: Texture2D = preload("res://art/detail.png")
@export var width := 520.0
@export var show_time := 2.0
@export var close_on_blank_touch := true

var is_showing := false

var _persistent := false
var _timer := 0.0
var _root: Control


func show_detail(hold_seconds: float = 0.0) -> void:
	hide_detail()
	_build()
	is_showing = true
	_persistent = hold_seconds <= 0.0
	_timer = 0.0 if _persistent else maxf(0.1, hold_seconds)


func hide_detail() -> void:
	is_showing = false
	_persistent = false
	_timer = 0.0
	if _root and is_instance_valid(_root):
		_root.queue_free()
	_root = null


func _process(delta: float) -> void:
	if not is_showing or _persistent:
		return
	_timer -= delta
	if _timer <= 0.0:
		hide_detail()


func _build() -> void:
	_root = Control.new()
	_root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(_root)

	var mask := ColorRect.new()
	mask.color = Color(18.0 / 255.0, 16.0 / 255.0, 14.0 / 255.0, 26.0 / 255.0)
	mask.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mask.mouse_filter = Control.MOUSE_FILTER_STOP
	if close_on_blank_touch:
		mask.gui_input.connect(func(ev):
			if ev is InputEventMouseButton and ev.pressed:
				hide_detail()
		)
	_root.add_child(mask)

	var at := TextureUtil.atlas(detail_texture)
	var ratio := float(at.region.size.y) / maxf(1.0, float(at.region.size.x))
	var w := width
	var h := w * ratio
	var vp := Vector2(1280, 720)
	if is_inside_tree():
		vp = get_viewport().get_visible_rect().size

	var card := TextureRect.new()
	card.texture = at
	card.size = Vector2(w, h)
	card.position = Vector2(vp.x * 0.5 - w * 0.5, vp.y * 0.5 - h * 0.5)
	card.stretch_mode = TextureRect.STRETCH_SCALE
	card.mouse_filter = Control.MOUSE_FILTER_STOP
	_root.add_child(card)
