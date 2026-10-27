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
	if not tower.is_node_ready():
		tower._ready()
	var tbody := tower.get_node("Body") as Sprite2D
	t.check(tbody.texture is AtlasTexture, "tower body trimmed")

	var a := _dummy(enemy_root, Vector2(100, 0))
	var b := _dummy(enemy_root, Vector2(200, 0))
	var off := _dummy(enemy_root, Vector2(100, 100))
	tower.fire()
	t.eq(a.hp, 0, "first hit")
	t.eq(b.hp, 0, "second hit (pierce)")
	t.eq(off.hp, 1, "off-line not hit")

	# 前摇：到间隔后先等 windup_time，再真正判定
	var tower2 = preload("res://scenes/towers/tower_che.tscn").instantiate()
	tower2.setup(enemy_root)
	tower2.position = Vector2(0, 300)
	tower2.fire_interval = 1.2
	tower2.windup_time = 0.1
	tower2.auto_fire = true
	tower_root.add_child(tower2)
	tower2._timer = 0.0
	var c := _dummy(enemy_root, Vector2(0, 400))
	tower2._process(1.19)
	t.eq(c.hp, 1, "no hit before interval")
	tower2._process(0.02)
	t.eq(c.hp, 1, "no hit at windup start")
	tower2._process(0.05)
	t.eq(c.hp, 1, "no hit mid windup")
	tower2._process(0.06)
	t.eq(c.hp, 0, "hit after windup")

	enemy_root.free()
	tower_root.free()


func _dummy(parent: Node, pos: Vector2) -> FakeEnemy:
	var e := FakeEnemy.new()
	e.position = pos
	parent.add_child(e)
	return e
