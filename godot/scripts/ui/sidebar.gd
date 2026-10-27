class_name Sidebar
extends CanvasLayer

## 左侧塔栏：展开 x=0，缩回 x=-180（0.25s）。

const EXPANDED_X := 0.0
const COLLAPSED_X := -180.0

var expanded := true

@onready var panel: Control = $Panel
@onready var toggle: Control = $Panel/Toggle


func _ready() -> void:
	panel.position.x = EXPANDED_X
	toggle.gui_input.connect(_on_toggle_input)


func _on_toggle_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		set_expanded(not expanded)
		toggle.accept_event()


func set_expanded(v: bool) -> void:
	expanded = v
	var tw := create_tween()
	tw.tween_property(panel, "position:x", EXPANDED_X if v else COLLAPSED_X, 0.25)


func get_cards() -> Array:
	return [$Panel/CardChe, $Panel/CardPao, $Panel/CardMa]
