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

	var tower = preload("res://scenes/towers/tower_ma.tscn").instantiate()
	tower.setup(enemies, towers)
	tower.auto_fire = false
	tower.position = Vector2.ZERO
	towers.add_child(tower)

	# 单个目标：掉 2
	var solo := _dummy(enemies, Vector2(100, 0))
	tower.fire()
	t.eq(solo.hp, 8, "single target takes 2")
	solo.free()

	# 马腿上有挡路者：挡路者挨打，原目标不掉血
	var target := _dummy(enemies, Vector2(100, 0))
	var blocker := _dummy(enemies, Vector2(45, 0))
	tower.fire()
	t.eq(blocker.hp, 8, "blocker takes 2")
	t.eq(target.hp, 10, "original target untouched")

	enemies.free()
	towers.free()


func _dummy(parent: Node, pos: Vector2) -> FakeEnemy:
	var e := FakeEnemy.new()
	e.position = pos
	parent.add_child(e)
	return e
