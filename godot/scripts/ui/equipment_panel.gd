class_name EquipmentPanel
extends CanvasLayer

## 按 E 开关的装备面板：3 槽 + 库存列表；点库存穿到对应槽（覆盖）。

var _root: Control
var _open := false
var _slot_labels := {}
var _list: VBoxContainer
var _inv_title: Label


var is_open: bool:
	get:
		return _open


func _ready() -> void:
	hide_panel()
	if EquipmentManagerData.instance:
		EquipmentManagerData.instance.changed.connect(_on_changed)


func _input(event: InputEvent) -> void:
	if not (event is InputEventKey) or not event.pressed or event.echo:
		return
	if event.keycode != KEY_E:
		return
	var session = get_node_or_null("/root/GameSession")
	if session and not session.started:
		return
	var lives = get_node_or_null("/root/Lives")
	if lives and lives.is_game_over:
		return
	toggle()


func toggle() -> void:
	if _open:
		hide_panel()
	else:
		show_panel()


func show_panel() -> void:
	if EquipmentManagerData.instance == null:
		return
	_open = true
	_build()
	refresh()


func hide_panel() -> void:
	_open = false
	if _root and is_instance_valid(_root):
		_root.queue_free()
	_root = null
	_slot_labels.clear()
	_list = null


func _on_changed() -> void:
	if _open:
		refresh()


func _build() -> void:
	if EquipmentManagerData.instance == null:
		return

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
	panel.size = Vector2(640, 470)
	panel.position = Vector2(320, 125)
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.933, 0.898, 0.835, 0.98)
	sb.corner_radius_top_left = 16
	sb.corner_radius_top_right = 16
	sb.corner_radius_bottom_left = 16
	sb.corner_radius_bottom_right = 16
	panel.add_theme_stylebox_override("panel", sb)
	_root.add_child(panel)

	var font := UiFont.make()
	var title := Label.new()
	title.text = "装备（E 关闭）"
	title.position = Vector2(0, 14)
	title.size = Vector2(640, 40)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_override("font", font)
	title.add_theme_font_size_override("font_size", 28)
	title.add_theme_color_override("font_color", Color(0.15, 0.12, 0.1))
	panel.add_child(title)

	var y := 66
	for slot in EquipmentManagerData.SLOTS:
		var label := Label.new()
		label.position = Vector2(28, y)
		label.size = Vector2(584, 34)
		label.add_theme_font_override("font", font)
		label.add_theme_font_size_override("font_size", 18)
		label.add_theme_color_override("font_color", Color(0.2, 0.16, 0.13))
		panel.add_child(label)
		_slot_labels[slot] = label
		y += 38

	var inv_title := Label.new()
	inv_title.text = "库存（点击穿戴）"
	inv_title.position = Vector2(28, y + 6)
	inv_title.size = Vector2(584, 30)
	inv_title.add_theme_font_override("font", font)
	inv_title.add_theme_font_size_override("font_size", 18)
	inv_title.add_theme_color_override("font_color", Color(0.35, 0.28, 0.23))
	panel.add_child(inv_title)
	_inv_title = inv_title

	var scroll := ScrollContainer.new()
	scroll.position = Vector2(28, y + 40)
	scroll.size = Vector2(584, 220)
	panel.add_child(scroll)
	_list = VBoxContainer.new()
	_list.custom_minimum_size = Vector2(560, 0)
	scroll.add_child(_list)


func refresh() -> void:
	if not _open or EquipmentManagerData.instance == null or _list == null:
		return
	var em := EquipmentManagerData.instance

	for slot in EquipmentManagerData.SLOTS:
		var item: Dictionary = em.equipped.get(slot, {})
		var label: Label = _slot_labels.get(slot, null)
		if label:
			var slot_name: String = EquipmentManagerData.SLOT_NAMES.get(slot, slot)
			if item.is_empty():
				label.text = slot_name + "：空"
			else:
				label.text = slot_name + "：" + em.item_name(item) + "  " + em.affix_text(item)

	if _inv_title:
		_inv_title.text = "库存 %d 件（点击穿戴）" % em.inventory.size()

	for child in _list.get_children():
		child.queue_free()

	var font := UiFont.make()
	var count: int = em.inventory.size()
	for i in count:
		var item: Dictionary = em.inventory[i]
		var btn := Button.new()
		btn.text = em.item_name(item) + "  " + em.affix_text(item)
		btn.custom_minimum_size = Vector2(584, 30)
		btn.add_theme_font_override("font", font)
		btn.add_theme_font_size_override("font_size", 16)
		var index := i
		btn.pressed.connect(func():
			em.equip(index)
		)
		_list.add_child(btn)
