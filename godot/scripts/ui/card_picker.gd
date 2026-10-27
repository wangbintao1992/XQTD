class_name CardPicker
extends CanvasLayer

## 每轮清空后的 3 选 1。选卡期间 WaveManager 暂停。
## 目前选中的效果仍为占位（与 Cocos 版一致）。

signal picked(index: int)

@export var card_width := 248.0
@export var card_height := 139.0
@export var spacing := 52.0
@export var swap_charges := 2
@export var pick_delay := 0.45
@export var auto_pick_first := true

var slots: Array[Dictionary] = []
var options: Array[String] = []
var selected_trait := ""

var _open := false
var _picked := false
var _closing := false
var _close_left := 0.0
var _timeout_total := 0.0
var _timeout_left := 0.0
var _done: Callable
var _root: Control


var is_picking: bool:
	get:
		return _open and not _picked


var remaining_pick_time: float:
	get:
		return maxf(0.0, _timeout_left)


func open_with_timeout(seconds: float, done: Callable = Callable()) -> void:
	options = []
	selected_trait = ""
	_done = done
	open()
	_timeout_total = maxf(0.0, seconds)
	_timeout_left = _timeout_total


func open_with_traits(ids: Array, seconds: float, done: Callable = Callable()) -> void:
	options = []
	for id in ids:
		options.append(str(id))
	selected_trait = ""
	_done = done
	open()
	_timeout_total = maxf(0.0, seconds)
	_timeout_left = _timeout_total


func open() -> void:
	if _open:
		return
	_open = true
	_picked = false
	_closing = false
	_timeout_total = 0.0
	_timeout_left = 0.0
	_build()


func close() -> void:
	if not _open:
		return
	_open = false
	_picked = false
	_closing = false
	slots.clear()
	if _root and is_instance_valid(_root):
		_root.queue_free()
	_root = null

	var cb := _done
	_done = Callable()
	if cb.is_valid():
		cb.call()


func swap(index: int) -> void:
	if index < 0 or index >= slots.size():
		return
	var slot: Dictionary = slots[index]
	if slot.selected or slot.charges <= 0:
		return
	slot.charges -= 1
	var label: Button = slot.label
	if label:
		label.text = "更换 %d" % slot.charges
		if slot.charges <= 0:
			label.add_theme_color_override("font_color", Color(0.59, 0.57, 0.55))

	var node: Control = slot.node
	if node:
		var tw := create_tween()
		tw.tween_property(node, "scale", Vector2(0.97, 0.97), 0.06)
		tw.tween_property(node, "scale", Vector2.ONE, 0.08)


func pick(index: int) -> void:
	if not _open or _picked or index < 0 or index >= slots.size():
		return
	_picked = true
	slots[index].selected = true
	if index < options.size():
		selected_trait = options[index]
	for i in slots.size():
		var slot: Dictionary = slots[i]
		var node: Control = slot.node
		if node:
			if i == index:
				node.scale = Vector2(1.06, 1.06)
			else:
				node.modulate = Color(0.43, 0.43, 0.43)
	picked.emit(index)
	_closing = true
	_close_left = maxf(0.05, pick_delay)


func _process(delta: float) -> void:
	if not _open:
		return

	if _closing:
		_close_left -= delta
		if _close_left <= 0.0:
			close()
		return

	if _timeout_total > 0.0 and not _picked:
		_timeout_left -= delta
		if _timeout_left <= 0.0:
			if auto_pick_first:
				pick(0)
			else:
				close()


func _build() -> void:
	_root = Control.new()
	_root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(_root)

	var mask := ColorRect.new()
	mask.color = Color(20.0 / 255.0, 18.0 / 255.0, 16.0 / 255.0, 120.0 / 255.0)
	mask.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_root.add_child(mask)

	var vp := Vector2(1280, 720)
	if is_inside_tree():
		vp = get_viewport().get_visible_rect().size

	var card_tex := TextureUtil.atlas(preload("res://art/card.png"))
	var font := UiFont.make()
	var n := 3
	var step := card_width + spacing
	var start_x := -((n - 1) * step) * 0.5

	for i in n:
		var card := Control.new()
		card.size = Vector2(card_width, card_height)
		card.position = Vector2(
			vp.x * 0.5 + start_x + i * step - card_width * 0.5,
			vp.y * 0.5 - card_height * 0.5
		)
		card.mouse_filter = Control.MOUSE_FILTER_STOP
		card.set_meta("slot_index", i)
		_root.add_child(card)

		var tex := TextureRect.new()
		tex.texture = card_tex
		tex.size = Vector2(card_width, card_height)
		tex.stretch_mode = TextureRect.STRETCH_SCALE
		tex.mouse_filter = Control.MOUSE_FILTER_IGNORE
		card.add_child(tex)

		if options.size() == 3:
			var title := Label.new()
			title.text = TraitPool.title(options[i])
			title.position = Vector2(12, 26)
			title.size = Vector2(card_width - 24, 40)
			title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			title.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
			title.mouse_filter = Control.MOUSE_FILTER_IGNORE
			title.add_theme_font_override("font", font)
			title.add_theme_font_size_override("font_size", 24)
			title.add_theme_color_override("font_color", Color(0.15, 0.12, 0.1))
			card.add_child(title)

			var desc := Label.new()
			desc.text = TraitPool.desc(options[i])
			desc.position = Vector2(14, 70)
			desc.size = Vector2(card_width - 28, 56)
			desc.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			desc.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
			desc.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
			desc.mouse_filter = Control.MOUSE_FILTER_IGNORE
			desc.add_theme_font_override("font", font)
			desc.add_theme_font_size_override("font_size", 15)
			desc.add_theme_color_override("font_color", Color(0.32, 0.27, 0.23))
			card.add_child(desc)

		var btn := Button.new()
		btn.text = "更换 %d" % swap_charges
		btn.size = Vector2(card_width * 0.72, 46)
		btn.position = Vector2(card_width * 0.14, card_height + 14)
		btn.add_theme_font_override("font", font)
		btn.mouse_filter = Control.MOUSE_FILTER_STOP
		card.add_child(btn)

		btn.pressed.connect(func(): swap(int(card.get_meta("slot_index"))))
		card.gui_input.connect(func(ev):
			if ev is InputEventMouseButton and ev.pressed:
				pick(int(card.get_meta("slot_index")))
		)

		slots.append({
			"node": card,
			"charges": swap_charges,
			"selected": false,
			"label": btn,
		})
