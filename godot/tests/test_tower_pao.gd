extends RefCounted


class FakeEnemy extends Node2D:
	var hp := 10

	func take_damage(n: int) -> void:
		hp = maxi(0, hp - n)


func run(t) -> void:
	var enemies := Node2D.new()
	var towers := Node2D.new()
	t.root.add_child(enemies)
	t.root.add_child(towers)

	var tower = preload("res://scenes/towers/tower_pao.tscn").instantiate()
	tower.setup(enemies, towers)
	tower.auto_fire = false
	tower.position = Vector2.ZERO
	towers.add_child(tower)
	if not tower.is_node_ready():
		tower._ready()

	# 没有炮架：不开火
	var solo := _dummy(enemies, Vector2(100, 0))
	tower.fire()
	t.eq(solo.hp, 10, "no screen = no fire")
	solo.free()

	# 一个炮架 + 一个目标：打第二个，炮架不掉血
	var screen := _dummy(enemies, Vector2(100, 0))
	var target := _dummy(enemies, Vector2(200, 0))
	tower.fire()
	t.eq(screen.hp, 10, "screen untouched")
	t.eq(target.hp, 7, "target takes 3")
	screen.free()
	target.free()

	# 溅射：目标 55 内其他敌人掉 2，炮架排除
	var screen2 := _dummy(enemies, Vector2(100, 0))
	var splash_target := _dummy(enemies, Vector2(200, 0))
	var splash := _dummy(enemies, Vector2(220, 0))
	tower.fire()
	t.eq(screen2.hp, 10, "screen excluded from splash")
	t.eq(splash_target.hp, 7, "target takes 3")
	t.eq(splash.hp, 8, "splash takes 2")
	screen2.free()
	splash_target.free()
	splash.free()

	# require_screen=false：无炮架也能直射，伤害 1
	tower.require_screen = false
	var direct := _dummy(enemies, Vector2(100, 0))
	tower.fire()
	t.eq(direct.hp, 9, "direct damage 1")
	direct.free()
	tower.require_screen = true

	# 塔也可以当炮架（没有 take_damage，只当 screen）
	var t2 := Node2D.new()
	t2.position = Vector2(0, 100)
	towers.add_child(t2)
	var target2 := _dummy(enemies, Vector2(0, 200))
	tower.fire()
	t.eq(target2.hp, 7, "tower screen enables fire")

	enemies.free()
	towers.free()


func _dummy(parent: Node, pos: Vector2) -> FakeEnemy:
	var e := FakeEnemy.new()
	e.position = pos
	parent.add_child(e)
	return e
