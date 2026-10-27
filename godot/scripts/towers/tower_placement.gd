class_name TowerPlacement
extends Node

## 拖拽放塔：区域 / 20x20 吸附 / 避开路径 / 扣棋气。

const AREA_MIN := Vector2(-412.5, -120.0)
const AREA_MAX := Vector2(281.9, 269.4)
const GRID_COLS := 20
const GRID_ROWS := 20
const MIN_PATH_DIST := 22.0
const MAX_SNAP := 200.0
const COST := 50
const TOWER_SIZE := 62.0
const PATH_IMAGE_SCALE := 0.8

var graph: PathGraph
var towers_root: Node
var enemies_root: Node
var qi: Object

var _ghost: Sprite2D
var _drag_scene: PackedScene
var _drag_cost := COST
var _dragging := false


func _ready() -> void:
	if qi == null:
		qi = get_node_or_null("/root/Qi")


func setup(
	graph_: PathGraph,
	towers_root_: Node,
	enemies_root_: Node,
	qi_: Object = null
) -> void:
	graph = graph_
	towers_root = towers_root_
	enemies_root = enemies_root_
	if qi_:
		qi = qi_


func begin_drag(scene: PackedScene, cost: int, texture: Texture2D) -> void:
	cancel_drag()
	_drag_scene = scene
	_drag_cost = cost
	_dragging = true

	_ghost = Sprite2D.new()
	_ghost.texture = texture
	if texture:
		var s: Vector2 = texture.get_size()
		_ghost.scale = Vector2(
			TOWER_SIZE / maxf(1.0, s.x),
			TOWER_SIZE / maxf(1.0, s.y)
		)
	_ghost.modulate.a = 170.0 / 255.0
	_ghost.z_index = 100
	towers_root.add_child(_ghost)
	_ghost.position = get_viewport().get_mouse_position()


func _input(event: InputEvent) -> void:
	if not _dragging:
		return

	if event is InputEventMouseMotion:
		if _ghost:
			_ghost.position = event.position
		return

	if event is InputEventMouseButton and not event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		var design: Vector2 = Coords.screen_to_design(event.position)
		var target = resolve_drop(design)
		if target == null:
			Toast.show(describe_failure(design))
		else:
			place(_drag_scene, target, _drag_cost)
		cancel_drag()
		get_viewport().set_input_as_handled()


func cancel_drag() -> void:
	_dragging = false
	if _ghost and is_instance_valid(_ghost):
		_ghost.queue_free()
	_ghost = null


func can_place(pos: Vector2) -> bool:
	if not is_inside_area(pos):
		return false
	if is_too_close_to_path(pos):
		return false
	if qi and not qi.can_afford(COST):
		return false
	return true


func is_inside_area(pos: Vector2) -> bool:
	return pos.x >= AREA_MIN.x and pos.x <= AREA_MAX.x \
		and pos.y >= AREA_MIN.y and pos.y <= AREA_MAX.y


func snap(pos: Vector2) -> Vector2:
	var cw := (AREA_MAX.x - AREA_MIN.x) / float(GRID_COLS)
	var ch := (AREA_MAX.y - AREA_MIN.y) / float(GRID_ROWS)
	var col := roundi((pos.x - AREA_MIN.x - cw * 0.5) / cw)
	var row := roundi((pos.y - AREA_MIN.y - ch * 0.5) / ch)
	return Vector2(
		AREA_MIN.x + (col + 0.5) * cw,
		AREA_MIN.y + (row + 0.5) * ch
	)


func resolve_drop(pos: Vector2):
	var snapped := snap(pos)
	if can_place(snapped):
		return snapped
	var near = nearest_valid(snapped)
	if near == null:
		return null
	if (near as Vector2).distance_to(pos) > MAX_SNAP:
		return null
	return near


func nearest_valid(pos: Vector2):
	var cw := (AREA_MAX.x - AREA_MIN.x) / float(GRID_COLS)
	var ch := (AREA_MAX.y - AREA_MIN.y) / float(GRID_ROWS)
	var best = null
	var best_d := INF
	for i in GRID_COLS:
		for j in GRID_ROWS:
			var c := Vector2(
				AREA_MIN.x + (i + 0.5) * cw,
				AREA_MIN.y + (j + 0.5) * ch
			)
			if not can_place(c):
				continue
			var d := c.distance_squared_to(pos)
			if d < best_d:
				best_d = d
				best = c
	return best


func is_too_close_to_path(pos: Vector2) -> bool:
	if graph == null:
		return false
	for e in graph.edges:
		var pts: Array = e.points
		for i in range(pts.size() - 1):
			var a: Vector2 = pts[i] * PATH_IMAGE_SCALE
			var b: Vector2 = pts[i + 1] * PATH_IMAGE_SCALE
			if _dist_to_segment(pos, a, b) < MIN_PATH_DIST:
				return true
	return false


func place(scene: PackedScene, pos: Vector2, cost: int = COST):
	if scene == null:
		return null
	if qi and not qi.can_afford(cost):
		return null

	var tower = scene.instantiate()
	tower.tower_cost = cost
	if tower.has_method("setup"):
		tower.setup(enemies_root)
	tower.position = Coords.to_screen(pos)
	towers_root.add_child(tower)
	if qi:
		qi.spend(cost)
	return tower


func describe_failure(pos: Vector2) -> String:
	if qi and not qi.can_afford(COST):
		return "棋气不足，需要 %d" % COST
	if not is_inside_area(snap(pos)):
		return "只能放在棋盘内"
	if is_too_close_to_path(snap(pos)):
		return "不能压在路径上"
	return "这里放不下，换个位置"


func _dist_to_segment(p: Vector2, a: Vector2, b: Vector2) -> float:
	var ab := b - a
	var len_sq := ab.length_squared()
	if len_sq <= 0.0:
		return p.distance_to(a)
	var t := clampf((p - a).dot(ab) / len_sq, 0.0, 1.0)
	return p.distance_to(a + ab * t)
