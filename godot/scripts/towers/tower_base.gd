class_name TowerBase
extends Node2D

## 所有塔的基类：尺寸、花费、敌人容器、开火接口。

const TOWER_SIZE := 62.0

signal clicked(tower: Node)

var tower_cost := 50
var enemies_root: Node
var towers_root: Node


func _ready() -> void:
	var body := get_node_or_null("Body") as Sprite2D
	if body and body.texture:
		var tex := body.texture
		body.texture = TextureUtil.atlas(tex)
		body.scale = TextureUtil.scale_for(tex, TOWER_SIZE)

	var area := get_node_or_null("ClickArea")
	if area and area is Area2D:
		area.input_event.connect(_on_click_area_input_event)


func setup(enemies_root_: Node, towers_root_: Node = null) -> void:
	enemies_root = enemies_root_
	if towers_root_:
		towers_root = towers_root_


func _on_click_area_input_event(
	_viewport: Node,
	event: InputEvent,
	_shape_idx: int
) -> void:
	if event is InputEventMouseButton and event.pressed \
		and event.button_index == MOUSE_BUTTON_LEFT:
		clicked.emit(self)


func fire() -> int:
	return 0
