class_name PathWalker
extends Node

## 沿路径网络单向走。位置写到 target（默认父节点 Enemy）。

signal reached_base(life_cost: int)

const RIVER_BUFF := 1.15

var graph: PathGraph
var edge := 0
var dir := 1
var dist := 0.0
var speed := 100.0
var life_cost := 1
var target: Node2D
var pause: HitPause
var rng := RandomNumberGenerator.new()
var slow_factor := 1.0
var slow_timer := 0.0
var _in_river := false
var _river_buff := 1.0


var is_slowed: bool:
	get:
		return slow_timer > 0.0


func setup(
	graph_: PathGraph,
	edge_: int,
	dir_: int,
	speed_: float,
	life_cost_: int = 1,
	target_: Node2D = null
) -> void:
	graph = graph_
	edge = edge_
	dir = dir_
	dist = 0.0
	speed = speed_
	life_cost = life_cost_
	target = target_ if target_ else get_parent() as Node2D
	if get_parent():
		pause = get_parent().get_node_or_null("HitPause") as HitPause
	rng.randomize()
	_apply_position()


func apply_slow(factor: float, duration: float) -> void:
	slow_factor = clampf(factor, 0.1, 1.0)
	slow_timer = maxf(slow_timer, duration)


func _process(delta: float) -> void:
	if graph == null:
		return
	if slow_timer > 0.0:
		slow_timer = maxf(0.0, slow_timer - delta)
		if slow_timer <= 0.0:
			slow_factor = 1.0
	if pause and pause.is_paused:
		return

	var mult := slow_factor if slow_timer > 0.0 else 1.0
	var terrain_mult := 1.0
	var terrain = TerrainSystem.instance
	if terrain and target:
		var ttype := terrain.type_at(target.position)
		terrain_mult = terrain.speed_mult_at(target.position)
		if ttype == "river":
			_in_river = true
		elif _in_river:
			# 过河卒：离开河后永久加速；再次进河时挂起，出河后恢复
			_in_river = false
			_river_buff = RIVER_BUFF
	var river_mult := 1.0 if _in_river else _river_buff
	dist += speed * mult * WeatherSystem.enemy_speed_mult() * terrain_mult * river_mult * delta
	var guard := 0
	while guard < 64:
		guard += 1
		var total := graph.edge_total(edge)
		if dist < total:
			break
		dist -= total
		var ed: Dictionary = graph.edges[edge]
		var arrived: int = ed.b if dir > 0 else ed.a
		if arrived == graph.end_node:
			dist = 0.0
			reached_base.emit(life_cost)
			set_process(false)
			return
		var next := graph.pick_forward_edge(arrived, rng)
		if next < 0:
			set_process(false)
			return
		edge = next
		var ne: Dictionary = graph.edges[next]
		dir = 1 if ne.a == arrived else -1

	_apply_position()


func _apply_position() -> void:
	if graph == null or target == null:
		return
	var p: Vector2 = graph.pos_on_edge(edge, dir, dist) * Coords.PATH_IMAGE_SCALE
	target.position = Coords.to_screen(p)
