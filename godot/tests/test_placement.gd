extends RefCounted


func run(t) -> void:
	var g = preload("res://scripts/core/path_graph.gd").new()
	var towers_root := Node2D.new()
	var enemies_root := Node2D.new()
	var qi = preload("res://scripts/autoload/qi.gd").new()
	qi.reset()

	var tp = preload("res://scripts/towers/tower_placement.gd").new()
	tp.setup(g, towers_root, enemies_root, qi)

	var free_spot := Vector2(-200, 100)
	t.check(tp.can_place(free_spot), "free spot placeable")
	t.check(not tp.can_place(Vector2(2000, 2000)), "outside rejected")
	var on_path: Vector2 = g.pos_on_edge(0, 1, 0.0) * 0.8
	t.check(not tp.can_place(on_path), "path rejected")

	var s: Vector2 = tp.snap(free_spot)
	t.check(tp.can_place(s), "snap is placeable")
	t.check(s.distance_to(free_spot) <= 20.0, "snap near")

	var p = tp.resolve_drop(free_spot)
	t.check(p != null, "drop resolves")
	if p != null:
		var before: int = qi.value
		var tower = tp.place(preload("res://scenes/towers/tower_che.tscn"), p)
		t.check(tower != null, "placed")
		t.eq(qi.value, before - 50, "cost spent")

	towers_root.free()
	enemies_root.free()
	qi.free()
	tp.free()
