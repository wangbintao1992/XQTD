extends RefCounted


class FakeTower extends Node2D:
	var tower_cost := 50


func run(t) -> void:
	var qi = preload("res://scripts/autoload/qi.gd").new()
	qi.reset()
	var towers := Node2D.new()
	t.root.add_child(towers)
	var tower := FakeTower.new()
	towers.add_child(tower)

	var menu = preload("res://scripts/ui/tower_action_menu.gd").new()
	t.root.add_child(menu)
	menu.setup_for_test(qi)
	t.eq(menu.refund_of(tower), 40, "refund 80%")
	menu.sell(tower)
	t.eq(qi.value, 140, "refund earned")
	t.check(tower.get_parent() == null, "tower removed")

	var detail = preload("res://scripts/ui/tower_detail.gd").new()
	t.root.add_child(detail)
	detail.show_detail(0.0)
	t.check(detail.is_showing, "detail persistent")
	detail.hide_detail()
	t.check(not detail.is_showing, "detail hidden")

	menu.free()
	detail.free()
	towers.free()
	qi.free()
