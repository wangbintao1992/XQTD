extends RefCounted


func run(t) -> void:
	var g = preload("res://scripts/core/path_graph.gd").new()
	var enemies := Node2D.new()
	var towers := Node2D.new()
	t.root.add_child(enemies)
	t.root.add_child(towers)
	var qi = preload("res://scripts/autoload/qi.gd").new()
	qi.reset()
	var tp = preload("res://scripts/towers/tower_placement.gd").new()
	t.root.add_child(tp)
	tp.setup(g, towers, enemies, qi)

	var spot: Vector2 = tp.snap(Vector2(-200, 100))
	var screen: Vector2 = Coords.to_screen(spot)
	var che_scene = preload("res://scenes/towers/tower_che.tscn")
	var tex = load("res://art/qz/b_che.png")

	var che = che_scene.instantiate()
	che.auto_fire = false
	che.position = screen
	towers.add_child(che)
	if not che.is_node_ready():
		che._ready()
	var base_range: float = che.attack_range
	var base_damage: int = che.damage
	var base_interval: float = che.fire_interval

	tp.begin_drag(che_scene, 50, tex, screen, "che")
	var ev := InputEventMouseButton.new()
	ev.button_index = MOUSE_BUTTON_LEFT
	ev.pressed = false
	ev.position = screen
	tp._input(ev)

	t.eq(che.level, 2, "merged to level 2")
	t.eq(towers.get_child_count(), 1, "no new tower")
	t.eq(qi.value, 50, "merge costs 50")
	t.check(che.attack_range > base_range, "range up")
	t.check(che.damage > base_damage, "damage up")
	t.check(che.fire_interval < base_interval, "interval down")

	# 异种不合成，照常放置
	var pao = preload("res://scenes/towers/tower_pao.tscn").instantiate()
	pao.auto_fire = false
	pao.position = Coords.to_screen(tp.snap(Vector2(-300, 150)))
	towers.add_child(pao)
	var pao_screen: Vector2 = pao.position
	tp.begin_drag(che_scene, 50, tex, pao_screen, "che")
	var ev2 := InputEventMouseButton.new()
	ev2.button_index = MOUSE_BUTTON_LEFT
	ev2.pressed = false
	ev2.position = pao_screen
	tp._input(ev2)
	t.eq(towers.get_child_count(), 3, "different kind places a new tower")

	# 满级不再合成，也不叠放
	qi.earn(100)
	che.level = 3
	che.apply_traits()
	var count := towers.get_child_count()
	tp.begin_drag(che_scene, 50, tex, screen, "che")
	var ev3 := InputEventMouseButton.new()
	ev3.button_index = MOUSE_BUTTON_LEFT
	ev3.pressed = false
	ev3.position = screen
	tp._input(ev3)
	t.eq(towers.get_child_count(), count, "max level does not place a duplicate")

	towers.free()
	enemies.free()
	qi.free()
	tp.free()
