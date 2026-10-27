extends RefCounted


class FakeEnemy extends Node2D:
	var hp := 20

	func take_damage(n: int) -> void:
		hp = maxi(0, hp - n)


func run(t) -> void:
	var prev = RunStateData.instance
	var rs = preload("res://scripts/autoload/run_state.gd").new()
	rs.reset()
	RunStateData.instance = rs

	var enemies := Node2D.new()
	var towers := Node2D.new()
	t.root.add_child(enemies)
	t.root.add_child(towers)

	# 双车 / 射程 / 冷却
	var che = preload("res://scenes/towers/tower_che.tscn").instantiate()
	che.setup(enemies, towers)
	che.auto_fire = false
	towers.add_child(che)
	if not che.is_node_ready():
		che._ready()
	var base_damage: int = che.damage
	rs.add_trait("double_chariot")
	rs.add_trait("range_plus")
	rs.add_trait("cooldown_halve")
	che.apply_traits()
	t.eq(che.damage, base_damage * 2, "double chariot")
	t.approx(che.attack_range, 460.0 * 1.25, 0.01, "range plus")
	t.approx(che.fire_interval, 1.2 * 0.75, 0.01, "cooldown")

	# 无蹩腿马
	var ma = preload("res://scenes/towers/tower_ma.tscn").instantiate()
	ma.setup(enemies, towers)
	ma.auto_fire = false
	towers.add_child(ma)
	if not ma.is_node_ready():
		ma._ready()
	var target := _dummy(enemies, Vector2(100, 0))
	var blocker := _dummy(enemies, Vector2(45, 0))
	t.check(ma._blocker_for(target) == blocker, "leg blocked without trait")
	rs.add_trait("free_horse")
	t.check(ma._blocker_for(target) == null, "free horse ignores leg")
	target.free()
	blocker.free()

	# 无炮架炮
	rs.add_trait("free_cannon")
	var pao = preload("res://scenes/towers/tower_pao.tscn").instantiate()
	pao.setup(enemies, towers)
	pao.auto_fire = false
	towers.add_child(pao)
	if not pao.is_node_ready():
		pao._ready()
	var solo := _dummy(enemies, Vector2(0, 100))
	t.eq(pao.fire(), 1, "free cannon fires without screen")
	t.eq(solo.hp, 17, "free cannon damage 3")

	# 放塔免棋气
	rs.add_trait("free_place")
	var qi = preload("res://scripts/autoload/qi.gd").new()
	qi.reset()
	qi.set_qi(0)
	var tp = preload("res://scripts/towers/tower_placement.gd").new()
	tp.setup(preload("res://scripts/core/path_graph.gd").new(), towers, enemies, qi)
	t.eq(tp.effective_cost(), 0, "free place cost 0")

	# 击杀棋气 +50%
	rs.add_trait("qi_boost")
	var spawner = preload("res://scripts/core/path_spawner.gd").new()
	t.eq(spawner.reward_for(8), 12, "qi boost")

	# 连环计溅射
	rs.add_trait("splash_hit")
	var a := _dummy(enemies, Vector2(300, 0))
	var b := _dummy(enemies, Vector2(310, 0))
	che.spread_hit(a, 1)
	t.eq(b.hp, 19, "splash hit")

	# 苦肉计伤害 +50%
	rs.add_trait("kumou")
	che.apply_traits()
	t.eq(che.damage, 3, "kumou 1.5x")

	rs.free()
	RunStateData.instance = prev
	enemies.free()
	towers.free()
	qi.free()
	tp.free()
	spawner.free()


func _dummy(parent: Node, pos: Vector2) -> FakeEnemy:
	var e := FakeEnemy.new()
	e.position = pos
	parent.add_child(e)
	return e
