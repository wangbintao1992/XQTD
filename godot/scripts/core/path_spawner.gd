class_name PathSpawner
extends Node

## 从路径起点按 interval 出兵，每波 enemy_count 个。

signal spawned(enemy: Node)

const ENEMY_SCENE := preload("res://scenes/enemy.tscn")
const KINDS := preload("res://scripts/data/enemy_kinds.gd").KINDS
const ELITES := preload("res://scripts/data/enemy_kinds.gd").ELITES

var enemy_count := 100
var spawn_interval := 0.5
var speed := 140.0

var graph: PathGraph
var enemies_root: Node
var qi: Object
var lives: Object
var session: Object

var spawned_count := 0
var run_spawned_total := 0
var hp_mult := 1.0
var speed_mult := 1.0
var elite_kind: Dictionary = {}
var _charm_timer := 0.0
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


func reset_run_counter() -> void:
	run_spawned_total = 0
	hp_mult = 1.0
	speed_mult = 1.0
	elite_kind = {}


func total_count() -> int:
	return spawned_count


func _tick_meiren(delta: float) -> void:
	if not RunStateData.has("meiren") or enemies_root == null:
		return
	_charm_timer -= delta
	if _charm_timer > 0.0:
		return
	_charm_timer = 6.0
	var list = enemies_root.get_children()
	if list.is_empty():
		return
	var target = list[_rng.randi_range(0, list.size() - 1)]
	var pause = target.get_node_or_null("HitPause")
	if pause:
		pause.request_pause(1.5)


func _slow_all() -> void:
	if not RunStateData.has("slow_on_kill") or enemies_root == null:
		return
	for enemy in enemies_root.get_children():
		if enemy.has_method("apply_slow"):
			enemy.apply_slow(0.5, 2.0)


func set_elite(kind: Dictionary) -> void:
	elite_kind = kind.duplicate()


func clear_elite() -> void:
	elite_kind = {}


func grant_elite_reward(_kind: Dictionary) -> void:
	var owned = RunStateData.instance.traits if RunStateData.instance else []
	var id := TraitPool.pick_one(owned)
	if id != "":
		if RunStateData.instance:
			RunStateData.instance.add_trait(id)
		TraitPool.apply_on_pick(id)
		_show_toast("精英掉落：" + TraitPool.title(id))
	elif qi:
		qi.earn(100)


func _show_toast(msg: String) -> void:
	var loop := Engine.get_main_loop()
	if loop is SceneTree:
		var toast = (loop as SceneTree).root.get_node_or_null("Toast")
		if toast:
			toast.show(msg)


func reward_for(base: int) -> int:
	return int(round(float(base) * (1.5 if RunStateData.has("qi_boost") else 1.0)))


func debug_finish_wave() -> void:
	spawned_count = enemy_count
	if enemies_root:
		for child in enemies_root.get_children():
			enemies_root.remove_child(child)
			child.queue_free()


func alive_count() -> int:
	return enemies_root.get_child_count() if enemies_root else 0


func _process(delta: float) -> void:
	if graph == null or enemies_root == null:
		return
	if session and not session.started:
		return
	if lives and lives.is_game_over:
		return
	_tick_meiren(delta)
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

	var kind: Dictionary
	if not elite_kind.is_empty():
		kind = elite_kind
		elite_kind = {}
	else:
		kind = KINDS[_rng.randi_range(0, KINDS.size() - 1)]
	var e: Dictionary = graph.edges[edge]
	var dir := 1 if e.a == graph.start_node else -1

	var kind_copy: Dictionary = kind.duplicate()
	kind_copy.hp = maxi(1, int(round(float(kind.hp) * hp_mult)))
	var walker_speed := speed * float(kind.speed_factor) * speed_mult

	var enemy = ENEMY_SCENE.instantiate()
	enemy.setup(kind_copy, graph, edge, dir, walker_speed)
	enemies_root.add_child(enemy)

	if qi:
		enemy.died.connect(func(k: Dictionary):
			qi.earn(reward_for(int(k.qi_reward)))
			if bool(k.get("elite", false)):
				grant_elite_reward(k)
			if RunStateData.has("slow_on_kill"):
				_slow_all()
		)
	if lives:
		enemy.reached_base.connect(func(cost: int): lives.lose(cost))

	spawned_count += 1
	run_spawned_total += 1
	spawned.emit(enemy)
