extends RefCounted


class FakeEnemy extends Node2D:
	var hp := 100

	func take_damage(n: int) -> void:
		hp = maxi(0, hp - n)


func run(t) -> void:
	var enemies := Node2D.new()
	var towers := Node2D.new()
	t.root.add_child(enemies)
	t.root.add_child(towers)
	var combo = preload("res://scripts/core/combo_system.gd").new()
	t.root.add_child(combo)
	combo.setup(towers, enemies)

	var ma = preload("res://scenes/towers/tower_ma.tscn").instantiate()
	ma.auto_fire = false
	ma.position = Vector2(0, 0)
	towers.add_child(ma)
	var pao = preload("res://scenes/towers/tower_pao.tscn").instantiate()
	pao.auto_fire = false
	pao.position = Vector2(0, 100)
	towers.add_child(pao)

	var on_line := _dummy(enemies, Vector2(0, 200))
	var off_line := _dummy(enemies, Vector2(100, 200))
	t.check(combo.check_combos().has("ma_pao"), "ma_pao detected")
	t.eq(combo.try_trigger(), "ma_pao", "ma_pao triggered")
	t.eq(on_line.hp, 0, "ma_pao clears line")
	t.eq(off_line.hp, 100, "ma_pao spares off-line")

	var e2 := Node2D.new()
	var tw2 := Node2D.new()
	t.root.add_child(e2)
	t.root.add_child(tw2)
	var c2 = preload("res://scripts/core/combo_system.gd").new()
	t.root.add_child(c2)
	c2.setup(tw2, e2)
	var che1 = preload("res://scenes/towers/tower_che.tscn").instantiate()
	che1.auto_fire = false
	che1.position = Vector2(0, 0)
	tw2.add_child(che1)
	var che2 = preload("res://scenes/towers/tower_che.tscn").instantiate()
	che2.auto_fire = false
	che2.position = Vector2(100, 0)
	tw2.add_child(che2)
	var on2 := _dummy(e2, Vector2(50, 0))
	var off2 := _dummy(e2, Vector2(50, 100))
	t.check(c2.check_combos().has("double_che"), "double_che detected")
	t.eq(c2.try_trigger(), "double_che", "double_che triggered")
	t.eq(on2.hp, 0, "double_che clears line")
	t.eq(off2.hp, 100, "double_che spares off-line")

	var e3 := Node2D.new()
	var tw3 := Node2D.new()
	t.root.add_child(e3)
	t.root.add_child(tw3)
	var c3 = preload("res://scripts/core/combo_system.gd").new()
	t.root.add_child(c3)
	c3.setup(tw3, e3)
	var p1 = preload("res://scenes/towers/tower_pao.tscn").instantiate()
	p1.auto_fire = false
	p1.position = Vector2(0, 0)
	tw3.add_child(p1)
	var p2 = preload("res://scenes/towers/tower_pao.tscn").instantiate()
	p2.auto_fire = false
	p2.position = Vector2(0, 100)
	tw3.add_child(p2)
	var on3 := _dummy(e3, Vector2(0, 50))
	var off3 := _dummy(e3, Vector2(100, 50))
	t.check(c3.check_combos().has("double_pao"), "double_pao detected")
	t.eq(c3.try_trigger(), "double_pao", "double_pao triggered")
	t.eq(on3.hp, 0, "double_pao clears line")
	t.eq(off3.hp, 100, "double_pao spares off-line")

	combo.free()
	towers.free()
	enemies.free()
	c2.free()
	tw2.free()
	e2.free()
	c3.free()
	tw3.free()
	e3.free()


func _dummy(parent: Node, pos: Vector2) -> FakeEnemy:
	var e := FakeEnemy.new()
	e.position = pos
	parent.add_child(e)
	return e
