class_name PathSpawner
extends Node

## 从路径起点按 interval 出兵，每波 enemy_count 个。

signal spawned(enemy: Node)

const ENEMY_SCENE := preload("res://scenes/enemy.tscn")
const KINDS := preload("res://scripts/data/enemy_kinds.gd").KINDS

var enemy_count := 100
var spawn_interval := 0.5
var speed := 140.0

var graph: PathGraph
var enemies_root: Node
var qi: Object
var lives: Object
var session: Object

var spawned_count := 0
var spawn_timer := 0.0
var _rng := RandomNumberGenerator.new()


func _ready() -> void:
	_rng.randomize()
	if qi == null:
		qi = get_node_or_null("/root/Qi")
	if lives == null:
		lives = get_node_or_null("/root/Lives")
	if session == null:
		session = get_node_or_null("/root/GameSession")


func setup(
	graph_: PathGraph,
	enemies_root_: Node,
	qi_: Object = null,
	lives_: Object = null,
	session_: Object = null
) -> void:
	graph = graph_
	enemies_root = enemies_root_
	if qi_:
		qi = qi_
	if lives_:
		lives = lives_
	if session_:
		session = session_


func deploy() -> void:
	if enemies_root:
		for child in enemies_root.get_children():
			enemies_root.remove_child(child)
			child.queue_free()
	spawned_count = 0
	spawn_timer = 0.0


func total_count() -> int:
	return spawned_count


func alive_count() -> int:
	return enemies_root.get_child_count() if enemies_root else 0


func _process(delta: float) -> void:
	if graph == null or enemies_root == null:
		return
	if session and not session.started:
		return
	if lives and lives.is_game_over:
		return
	if spawned_count >= enemy_count:
		return

	spawn_timer += delta
	var guard := 0
	while spawned_count < enemy_count and guard < 32:
		guard += 1
		if spawn_interval > 0.0:
			if spawn_timer < spawn_interval:
				break
			spawn_timer -= spawn_interval
		spawn_one()


func spawn_one() -> void:
	var edge := graph.pick_forward_edge(graph.start_node, _rng)
	if edge < 0:
		spawned_count = enemy_count
		return

	var kind: Dictionary = KINDS[_rng.randi_range(0, KINDS.size() - 1)]
	var e: Dictionary = graph.edges[edge]
	var dir := 1 if e.a == graph.start_node else -1

	var enemy = ENEMY_SCENE.instantiate()
	enemy.setup(kind, graph, edge, dir, speed * float(kind.speed_factor))
	enemies_root.add_child(enemy)

	if qi:
		enemy.died.connect(func(k: Dictionary): qi.earn(int(k.qi_reward)))
	if lives:
		enemy.reached_base.connect(func(cost: int): lives.lose(cost))

	spawned_count += 1
	spawned.emit(enemy)
