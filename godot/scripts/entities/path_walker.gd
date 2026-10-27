class_name PathWalker
extends Node

## 沿路径网络单向走。位置写到 target（默认父节点 Enemy）。

signal reached_base(life_cost: int)

const PATH_IMAGE_SCALE := 0.8

var graph: PathGraph
var edge := 0
var dir := 1
var dist := 0.0
var speed := 100.0
var life_cost := 1
var target: Node2D
var pause: HitPause
var rng := RandomNumberGenerator.new()


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


func _process(delta: float) -> void:
	if graph == null:
		return
	if pause and pause.is_paused:
		return

	dist += speed * delta
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
	var p: Vector2 = graph.pos_on_edge(edge, dir, dist) * PATH_IMAGE_SCALE
	target.position = Coords.to_screen(p)
