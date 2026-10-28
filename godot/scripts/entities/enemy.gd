class_name Enemy
extends Node2D

## 一个敌方棋子：血量、受伤表现、死亡给棋气（由 PathSpawner 接信号）、到终点扣生命。

signal died(kind: Dictionary)
signal reached_base(life_cost: int)

const TARGET_SIZE := 62.0 * 0.7
const OVERLAY_SCALE := 1.15
const OVERLAY_TEXTURES := [
	preload("res://art/qz/sui_0.png"),
	preload("res://art/qz/sui_1.png"),
	preload("res://art/qz/sui_2.png"),
]
const HIT_TEXTURE := preload("res://art/moban.png")

@export var debug_damage_on_click := false

var kind: Dictionary = {}
var max_hp := 1
var hp := 1
var life_cost := 1
var walker: PathWalker

var _body: Sprite2D
var _overlay: Sprite2D
var _hit: Sprite2D


func _ready() -> void:
	_body = get_node_or_null("Body")
	_overlay = get_node_or_null("DamageOverlay")
	_hit = get_node_or_null("HitEffect")
	var area := get_node_or_null("ClickArea")
	if area and area is Area2D:
		area.input_event.connect(_on_click_area_input_event)
	if _hit:
		_hit.visible = false
	_refresh_overlay()


func setup(kind_: Dictionary, graph: PathGraph, edge: int, dir: int, speed: float) -> void:
	kind = kind_
	max_hp = int(kind_.hp)
	hp = max_hp
	life_cost = int(kind_.life_cost)

	_body = get_node_or_null("Body")
	_overlay = get_node_or_null("DamageOverlay")
	_hit = get_node_or_null("HitEffect")

	if _body and kind_.has("texture"):
		_body.texture = TextureUtil.atlas(kind_.texture)
		_body.scale = TextureUtil.scale_for(kind_.texture, TARGET_SIZE)
	_refresh_overlay()

	walker = get_node_or_null("PathWalker") as PathWalker
	if walker:
		walker.setup(graph, edge, dir, speed, life_cost, self)
		walker.reached_base.connect(_on_walker_reached_base)


func apply_slow(factor: float, duration: float) -> void:
	if walker:
		walker.apply_slow(factor, duration)


func take_damage(amount: int) -> void:
	if hp <= 0:
		return
	hp = maxi(0, hp - amount)
	_refresh_overlay()
	_play_hit_effect()
	if hp <= 0:
		died.emit(kind)
		queue_free()


func _refresh_overlay() -> void:
	if _overlay == null:
		return
	var lost := max_hp - hp
	if lost <= 0:
		_overlay.visible = false
		return
	var idx: int = mini(lost - 1, OVERLAY_TEXTURES.size() - 1)
	_overlay.texture = TextureUtil.atlas(OVERLAY_TEXTURES[idx])
	_overlay.visible = true
	_overlay.scale = TextureUtil.scale_for(
		OVERLAY_TEXTURES[idx],
		TARGET_SIZE * OVERLAY_SCALE
	)


func _play_hit_effect() -> void:
	if _hit == null:
		return
	_hit.texture = HIT_TEXTURE
	var tex_size: Vector2 = HIT_TEXTURE.get_size()
	_hit.scale = Vector2(96.0 / maxf(1.0, tex_size.x), 96.0 / maxf(1.0, tex_size.y))
	_hit.visible = true
	_hit.modulate.a = 1.0
	if is_inside_tree():
		var tw := create_tween()
		tw.tween_property(_hit, "modulate:a", 0.0, 1.0)


func _on_walker_reached_base(cost: int) -> void:
	reached_base.emit(cost)
	queue_free()


func _on_click_area_input_event(_viewport: Node, event: InputEvent, _shape_idx: int) -> void:
	if not debug_damage_on_click:
		return
	if event is InputEventMouseButton and event.pressed:
		take_damage(1)
