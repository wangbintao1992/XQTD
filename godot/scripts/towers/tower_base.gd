class_name TowerBase
extends Node2D

## 所有塔的基类：尺寸、花费、敌人容器、开火接口。

const TOWER_SIZE := 62.0

var tower_cost := 50
var enemies_root: Node


func _ready() -> void:
	var body := get_node_or_null("Body") as Sprite2D
	if body and body.texture:
		var s: Vector2 = body.texture.get_size()
		body.scale = Vector2(
			TOWER_SIZE / maxf(1.0, s.x),
			TOWER_SIZE / maxf(1.0, s.y)
		)


func setup(enemies_root_: Node) -> void:
	enemies_root = enemies_root_


func fire() -> int:
	return 0
