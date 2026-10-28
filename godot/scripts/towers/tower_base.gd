class_name TowerBase
extends Node2D

## 所有塔的基类：尺寸、花费、敌人容器、开火接口。

const TOWER_SIZE := 62.0
const MAX_LEVEL := 3

signal clicked(tower: Node)

var tower_cost := 50
var tower_kind := ""
var level := 1
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


func apply_traits() -> void:
	pass


func merge_one() -> bool:
	if level >= MAX_LEVEL:
		return false
	level += 1
	apply_traits()
	var body := get_node_or_null("Body") as Sprite2D
	if body:
		body.scale *= Vector2(1.06, 1.06)
	return true


func level_damage_mult() -> float:
	return 1.0 + 0.5 * float(level - 1)


func level_range_mult() -> float:
	return 1.0 + 0.10 * float(level - 1)


func level_interval_mult() -> float:
	return pow(0.9, level - 1)


func trait_damage_mult() -> float:
	return 1.5 if RunStateData.has("kumou") else 1.0


func trait_range_mult() -> float:
	return 1.25 if RunStateData.has("range_plus") else 1.0


func trait_interval_mult() -> float:
	return 0.75 if RunStateData.has("cooldown_halve") else 1.0


func mutation_damage_mult() -> float:
	return MutationPool.tower_damage_mult(tower_kind)


func mutation_range_mult() -> float:
	return MutationPool.tower_range_mult(tower_kind)


func mutation_interval_mult() -> float:
	return MutationPool.tower_interval_mult(tower_kind)


func weather_damage_mult() -> float:
	return WeatherSystem.tower_damage_mult()


func weather_range_mult() -> float:
	return WeatherSystem.tower_range_mult()


func weather_interval_mult() -> float:
	return WeatherSystem.tower_interval_mult()


func spread_hit(source: Node, amount: int) -> void:
	if not RunStateData.has("splash_hit") or enemies_root == null:
		return
	if not is_instance_valid(source):
		return
	var dmg := maxi(1, int(round(float(amount) * 0.3)))
	var center: Vector2 = source.global_position
	for enemy in enemies_root.get_children():
		if enemy == source or not is_instance_valid(enemy):
			continue
		if not enemy.has_method("take_damage"):
			continue
		if (enemy.global_position - center).length() <= 40.0:
			enemy.take_damage(dmg)
