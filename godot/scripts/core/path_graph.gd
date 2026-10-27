class_name PathGraph
extends RefCounted

## 路径网络：节点 + 边，按「到终点的最短距离」单向流动。
## 坐标是 Cocos 设计坐标（原点中心、y 向上）；上屏前乘 path_image_scale 再走 Coords。

const DATA = preload("res://scripts/data/path_graph_data.gd")

var nodes: Array[Vector2] = []
var edges: Array[Dictionary] = []
var start_node := 0
var end_node := 0
var dist_to_end: PackedFloat32Array = PackedFloat32Array()
var seg_acc: Array[PackedFloat32Array] = []
var edge_totals: PackedFloat32Array = PackedFloat32Array()


func _init() -> void:
	nodes.assign(DATA.NODES)
	for e in DATA.EDGES:
		edges.append({
			"a": int(e.a),
			"b": int(e.b),
			"points": e.points.duplicate(),
		})
	_resolve_start_end()
	_build_geometry()
	_build_flow_field()


func _resolve_start_end() -> void:
	var min_x := INF
	var max_x := -INF
	for i in nodes.size():
		if nodes[i].x < min_x:
			min_x = nodes[i].x
			start_node = i
		if nodes[i].x > max_x:
			max_x = nodes[i].x
			end_node = i


func _build_geometry() -> void:
	seg_acc.clear()
	edge_totals = PackedFloat32Array()
	for e in edges:
		var pts: Array = e.points
		var acc := PackedFloat32Array([0.0])
		var total := 0.0
		for i in range(1, pts.size()):
			total += (pts[i] as Vector2).distance_to(pts[i - 1] as Vector2)
			acc.append(total)
		seg_acc.append(acc)
		edge_totals.append(total)


func _build_flow_field() -> void:
	var n := nodes.size()
	dist_to_end = PackedFloat32Array()
	dist_to_end.resize(n)
	dist_to_end.fill(INF)
	dist_to_end[end_node] = 0.0

	var done: Array[bool] = []
	done.resize(n)
	done.fill(false)

	for _iter in n:
		var pick := -1
		for i in n:
			if not done[i] and (pick < 0 or dist_to_end[i] < dist_to_end[pick]):
				pick = i
		if pick < 0 or not is_finite(dist_to_end[pick]):
			break
		done[pick] = true
		for k in edges.size():
			var e: Dictionary = edges[k]
			var other := -1
			if e.a == pick:
				other = e.b
			elif e.b == pick:
				other = e.a
			if other < 0 or done[other]:
				continue
			var cand: float = dist_to_end[pick] + edge_totals[k]
			if cand < dist_to_end[other]:
				dist_to_end[other] = cand


func pick_forward_edge(at: int, rng: RandomNumberGenerator) -> int:
	var options: Array[int] = []
	for k in edges.size():
		var e: Dictionary = edges[k]
		var other := -1
		if e.a == at:
			other = e.b
		elif e.b == at:
			other = e.a
		if other < 0:
			continue
		if dist_to_end[other] < dist_to_end[at]:
			options.append(k)
	if options.is_empty():
		return -1
	return options[rng.randi_range(0, options.size() - 1)]


func edge_total(edge: int) -> float:
	return edge_totals[edge]


func pos_on_edge(edge: int, dir: int, dist: float) -> Vector2:
	var pts: Array = edges[edge].points
	if pts.is_empty():
		return Vector2.ZERO
	if pts.size() == 1:
		return pts[0]

	var acc: PackedFloat32Array = seg_acc[edge]
	var total := edge_totals[edge]
	var s := clampf(dist, 0.0, total)
	if dir < 0:
		s = total - s

	var i := 0
	while i < acc.size() - 2 and acc[i + 1] < s:
		i += 1
	var span := acc[i + 1] - acc[i]
	var t := (s - acc[i]) / span if span > 0.0 else 0.0
	var pa: Vector2 = pts[i]
	var pb: Vector2 = pts[i + 1]
	return pa.lerp(pb, t)
