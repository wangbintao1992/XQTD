extends RefCounted


func run(t) -> void:
	var prev = RunStateData.instance
	var rs = preload("res://scripts/autoload/run_state.gd").new()
	rs.reset()
	RunStateData.instance = rs

	t.check(MutationPool.ids().size() >= 3, "3 mutations")
	t.check(MutationPool.title("headwind") != "", "title")
	t.approx(MutationPool.tower_damage_mult("pao"), 1.0, 0.001, "no mutation damage")
	t.approx(MutationPool.enemy_hp_mult(), 1.0, 0.001, "no mutation hp")
	for _i in 10:
		t.check(MutationPool.pick("headwind") != "headwind", "pick excludes current")

	rs.set_mutation("cannon_weak_horse_strong")
	t.approx(MutationPool.tower_damage_mult("pao"), 0.7, 0.001, "pao weak")
	t.approx(MutationPool.tower_damage_mult("ma"), 1.3, 0.001, "ma strong")
	t.approx(MutationPool.tower_interval_mult("ma"), 0.8, 0.001, "ma fast")

	rs.set_mutation("chariot_short_fast")
	t.approx(MutationPool.tower_range_mult("che"), 0.75, 0.001, "che short")
	t.approx(MutationPool.enemy_speed_mult(), 1.2, 0.001, "enemy fast")

	var towers := Node2D.new()
	t.root.add_child(towers)
	var che = preload("res://scenes/towers/tower_che.tscn").instantiate()
	che.setup(null, towers)
	che.auto_fire = false
	towers.add_child(che)
	if not che.is_node_ready():
		che._ready()
	che.apply_traits()
	t.approx(che.attack_range, 460.0 * 0.75, 0.01, "tower applies mutation range")

	rs.set_mutation("headwind")
	t.approx(MutationPool.tower_damage_mult("che"), 1.5, 0.001, "headwind damage")
	t.approx(MutationPool.enemy_hp_mult(), 1.5, 0.001, "headwind hp")
	che.apply_traits()
	t.eq(che.damage, 2, "tower applies mutation damage")
	towers.free()

	rs.reset()
	t.eq(rs.mutation, "", "reset mutation")
	t.approx(MutationPool.enemy_hp_mult(), 1.0, 0.001, "reset hp mult")

	rs.free()
	RunStateData.instance = prev
