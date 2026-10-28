extends RefCounted


func run(t) -> void:
	var prev_eq = EquipmentManagerData.instance
	var em = preload("res://scripts/autoload/equipment_manager.gd").new()
	em.persistence_enabled = false
	em.reset_for_test()
	em.inventory.append({
		"slot": "head",
		"quality": "orange",
		"affixes": [
			{"type": "damage", "value": 0.2},
			{"type": "range", "value": 0.1},
			{"type": "attack_speed", "value": 0.1},
			{"type": "qi_cost", "value": 0.1},
		],
	})
	em.equip(0)
	t.approx(em.damage_mult(), 1.2, 0.001, "damage mult")
	t.approx(em.range_mult(), 1.1, 0.001, "range mult")
	t.approx(em.cost_mult(), 0.9, 0.001, "cost mult")

	var towers := Node2D.new()
	t.root.add_child(towers)
	var che = preload("res://scenes/towers/tower_che.tscn").instantiate()
	che.setup(null, towers)
	che.auto_fire = false
	towers.add_child(che)
	if not che.is_node_ready():
		che._ready()
	che.apply_traits()
	t.approx(che.damage_exact, 1.2, 0.01, "equipment damage")
	t.approx(che.attack_range, 460.0 * 1.1, 0.01, "equipment range")
	t.approx(che.fire_interval, 1.2 / 1.1, 0.01, "equipment speed")

	var g = preload("res://scripts/core/path_graph.gd").new()
	var qi = preload("res://scripts/autoload/qi.gd").new()
	qi.reset()
	var enemies := Node2D.new()
	var tp = preload("res://scripts/towers/tower_placement.gd").new()
	tp.setup(g, towers, enemies, qi)
	t.eq(tp.effective_cost(), 45, "equipment cost reduction")

	var prev_rs = RunStateData.instance
	var rs = preload("res://scripts/autoload/run_state.gd").new()
	rs.reset()
	RunStateData.instance = rs
	var root := Node2D.new()
	t.root.add_child(root)
	var spawner = preload("res://scripts/core/path_spawner.gd").new()
	spawner.setup(g, root, qi, null)
	var before: int = em.inventory.size()
	spawner.grant_elite_reward({})
	t.eq(em.inventory.size(), before + 1, "elite drops equipment")

	spawner.free()
	root.free()
	tp.free()
	enemies.free()
	qi.free()
	rs.free()
	RunStateData.instance = prev_rs
	towers.free()
	em.free()
	EquipmentManagerData.instance = prev_eq
