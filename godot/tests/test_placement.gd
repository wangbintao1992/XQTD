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

	# 输入路径：卡片上原地点击不应放塔；拖到棋盘内才放
	var tp2 = preload("res://scripts/towers/tower_placement.gd").new()
	t.root.add_child(tp2)
	var towers2 := Node2D.new()
	var enemies2 := Node2D.new()
	t.root.add_child(towers2)
	t.root.add_child(enemies2)
	var qi2 = preload("res://scripts/autoload/qi.gd").new()
	qi2.reset()
	tp2.setup(g, towers2, enemies2, qi2)

	var scene = preload("res://scenes/towers/tower_che.tscn")
	var tex = load("res://art/qz/b_che.png")
	var card_pos := Vector2(105, 170)
	tp2.begin_drag(scene, 50, tex, card_pos)
	var ev := InputEventMouseButton.new()
	ev.button_index = MOUSE_BUTTON_LEFT
	ev.pressed = false
	ev.position = card_pos
	tp2._input(ev)
	t.eq(qi2.value, 100, "click on card does not spend")
	t.eq(towers2.get_child_count(), 0, "click on card does not place")

	var target_screen := Coords.to_screen(Vector2(-200, 100))
	tp2.begin_drag(scene, 50, tex, target_screen)
	ev = InputEventMouseButton.new()
	ev.button_index = MOUSE_BUTTON_LEFT
	ev.pressed = false
	ev.position = target_screen
	tp2._input(ev)
	t.eq(qi2.value, 50, "valid drop spends 50")
	t.eq(towers2.get_child_count(), 1, "valid drop places 1")

	tp2.free()
	towers2.free()
	enemies2.free()
	qi2.free()
