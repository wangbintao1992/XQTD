class_name TowerCard
extends Control

## 侧栏里的一张塔卡：可拖拽的发出 drag_requested；未开放的只提示。

signal drag_requested(scene: PackedScene, cost: int, texture: Texture2D)
signal unavailable(message: String)

@export var tower_scene: PackedScene
@export var tower_texture: Texture2D
@export var cost := 50
@export var display_name := "车"
@export var available := true


func _ready() -> void:
	var icon := get_node_or_null("Icon") as TextureRect
	if icon and tower_texture:
		icon.texture = TextureUtil.atlas(tower_texture)
		icon.stretch_mode = TextureRect.STRETCH_SCALE
	var label := get_node_or_null("Name") as Label
	if label:
		label.text = display_name
		label.add_theme_font_override("font", UiFont.make())


func _gui_input(event: InputEvent) -> void:
	if not (event is InputEventMouseButton):
		return
	if not event.pressed or event.button_index != MOUSE_BUTTON_LEFT:
		return

	if not available:
		unavailable.emit(display_name + " M2 开放")
		accept_event()
		return

	drag_requested.emit(tower_scene, cost, tower_texture)
	accept_event()
