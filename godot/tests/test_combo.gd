extends RefCounted


class FakeEnemy extends Node2D:
	var hp := 100

	func take_damage(n: int) -> void:
		hp = maxi(0, hp - n)


class FakeSession:
	var started := true


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

	# 吸附格上的斜放不能误判成同行
	var tp = preload("res://scripts/towers/tower_placement.gd").new()
	var s1: Vector2 = tp.snap(Vector2(-200, 0))
	var s2: Vector2 = tp.snap(Vector2(-165, 20))
	var s3: Vector2 = tp.snap(Vector2(-165, 0))
	t.check(absf(s1.y - s2.y) > 9.0, "diagonal snap differs by a row")

	var e4 := Node2D.new()
	var tw4 := Node2D.new()
	t.root.add_child(e4)
	t.root.add_child(tw4)
	var c4 = preload("res://scripts/core/combo_system.gd").new()
	t.root.add_child(c4)
	c4.setup(tw4, e4)
	var d1 = preload("res://scenes/towers/tower_che.tscn").instantiate()
	d1.auto_fire = false
	d1.position = s1
	tw4.add_child(d1)
	var d2 = preload("res://scenes/towers/tower_che.tscn").instantiate()
	d2.auto_fire = false
	d2.position = s2
	tw4.add_child(d2)
	t.check(not c4.check_combos().has("double_che"), "diagonal does not trigger")
	d2.position = s3
	t.check(c4.check_combos().has("double_che"), "same snapped row triggers")

	# 无目标不触发 / 高血量也能清 / 未开局不消耗 / reset
	var e5 := Node2D.new()
	var tw5 := Node2D.new()
	t.root.add_child(e5)
	t.root.add_child(tw5)
	var c5 = preload("res://scripts/core/combo_system.gd").new()
	t.root.add_child(c5)
	c5.setup(tw5, e5)
	var ma2 = preload("res://scenes/towers/tower_ma.tscn").instantiate()
	ma2.auto_fire = false
	ma2.position = Vector2(0, 0)
	tw5.add_child(ma2)
	var pao2 = preload("res://scenes/towers/tower_pao.tscn").instantiate()
	pao2.auto_fire = false
	pao2.position = Vector2(0, 100)
	tw5.add_child(pao2)
	t.eq(c5.try_trigger(), "", "no targets = no trigger")

	var high := _dummy(e5, Vector2(0, 200))
	high.hp = 50000
	t.eq(c5.try_trigger(), "ma_pao", "high hp still triggers")
	t.eq(high.hp, 0, "high hp cleared")

	var fs := FakeSession.new()
	fs.started = false
	c5.setup(tw5, e5, fs, null)
	c5._timer = 6.0
	c5._process(0.1)
	t.check(c5._timer >= 6.0, "not started does not consume cooldown")

	fs.started = true
	var e6 := _dummy(e5, Vector2(0, 200))
	c5._timer = 6.0
	c5._process(0.1)
	t.eq(c5._timer, 0.0, "cooldown consumed on hit")
	t.eq(e6.hp, 0, "process clears line")
	c5._timer = 5.0
	c5.reset()
	t.eq(c5._timer, 0.0, "reset timer")

	tp.free()
	combo.free()
	towers.free()
	enemies.free()
	c2.free()
	tw2.free()
	e2.free()
	c3.free()
	tw3.free()
	e3.free()
	c4.free()
	tw4.free()
	e4.free()
	c5.free()
	tw5.free()
	e5.free()


func _dummy(parent: Node, pos: Vector2) -> FakeEnemy:
	var e := FakeEnemy.new()
	e.position = pos
	parent.add_child(e)
	return e
