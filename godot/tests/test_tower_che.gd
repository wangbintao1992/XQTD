extends RefCounted


class FakeEnemy extends Node2D:
	var hp := 1

	func take_damage(n: int) -> void:
		hp = maxi(0, hp - n)


func run(t) -> void:
	var enemy_root := Node2D.new()
	var tower_root := Node2D.new()
	t.root.add_child(enemy_root)
	t.root.add_child(tower_root)

	var tower = preload("res://scenes/towers/tower_che.tscn").instantiate()
	tower.setup(enemy_root)
	tower.auto_fire = false
	tower.position = Vector2.ZERO
	tower_root.add_child(tower)

	var a := _dummy(enemy_root, Vector2(100, 0))
	var b := _dummy(enemy_root, Vector2(200, 0))
	var off := _dummy(enemy_root, Vector2(100, 100))
	tower.fire()
	t.eq(a.hp, 0, "first hit")
	t.eq(b.hp, 0, "second hit (pierce)")
	t.eq(off.hp, 1, "off-line not hit")

	enemy_root.free()
	tower_root.free()


func _dummy(parent: Node, pos: Vector2) -> FakeEnemy:
	var e := FakeEnemy.new()
	e.position = pos
	parent.add_child(e)
	return e
