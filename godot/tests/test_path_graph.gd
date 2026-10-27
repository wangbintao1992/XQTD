extends RefCounted


func run(t) -> void:
	var g = preload("res://scripts/core/path_graph.gd").new()
	t.eq(g.nodes.size(), 6, "6 nodes")
	t.eq(g.edges.size(), 8, "8 edges")
	t.eq(g.start_node, 5, "start = left-most")
	t.eq(g.end_node, 4, "end = right-most")

	for i in g.edges.size():
		var e: Dictionary = g.edges[i]
		t.approx_v(e.points[0], g.nodes[e.a], 0.01, "edge %d starts at a" % i)
		t.approx_v(e.points[e.points.size() - 1], g.nodes[e.b], 0.01, "edge %d ends at b" % i)

	t.approx(g.dist_to_end[g.end_node], 0.0, 0.001, "end distance 0")
	for i in g.nodes.size():
		t.check(is_finite(g.dist_to_end[i]), "node %d reachable" % i)

	var rng := RandomNumberGenerator.new()
	rng.seed = 1
	for at in g.nodes.size():
		var e: int = g.pick_forward_edge(at, rng)
		if at == g.end_node:
			t.eq(e, -1, "end has no forward edge")
		elif e >= 0:
			var other: int = g.edges[e].b if g.edges[e].a == at else g.edges[e].a
			t.check(g.dist_to_end[other] < g.dist_to_end[at], "forward edge goes closer")
			t.approx_v(g.pos_on_edge(e, 1, 0.0), g.nodes[g.edges[e].a], 0.01, "pos at start")
			t.approx_v(g.pos_on_edge(e, 1, g.edge_total(e)), g.nodes[g.edges[e].b], 0.01, "pos at end")
			t.approx_v(g.pos_on_edge(e, -1, 0.0), g.nodes[g.edges[e].b], 0.01, "reverse pos at start")
