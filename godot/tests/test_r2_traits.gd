extends RefCounted


class SlowEnemy extends Node2D:
	var factor := 1.0

	func apply_slow(f: float, _d: float) -> void:
		factor = f


func run(t) -> void:
	t.check(TraitPool.ids().has("meiren"), "meiren in pool")
	t.check(TraitPool.ids().has("slow_on_kill"), "slow_on_kill in pool")

	var g = preload("res://scripts/core/path_graph.gd").new()
	var rng := RandomNumberGenerator.new()
	rng.seed = 1
	var e = g.pick_forward_edge(g.start_node, rng)

	var target := Node2D.new()
	var w = preload("res://scripts/entities/path_walker.gd").new()
	w.setup(g, e, 1, 100.0, 1, target)
	w.apply_slow(0.5, 1.0)
	w._process(0.5)
	t.approx(w.dist, 25.0, 0.01, "slow halves speed")
	t.check(w.is_slowed, "slowed")
	w._process(0.6)
	t.check(not w.is_slowed, "slow expired")
	t.approx(w.dist, 85.0, 0.01, "normal speed after expiry")
	w.free()
	target.free()

	var prev = RunStateData.instance
	var rs = preload("res://scripts/autoload/run_state.gd").new()
	rs.reset()
	RunStateData.instance = rs
	rs.add_trait("meiren")

	var root := Node2D.new()
	t.root.add_child(root)
	var qi = preload("res://scripts/autoload/qi.gd").new()
	qi.reset()
	var lives = preload("res://scripts/autoload/lives.gd").new()
	lives.reset()
	var spawner = preload("res://scripts/core/path_spawner.gd").new()
	spawner.setup(g, root, qi, lives)

	var enemy := Node2D.new()
	var pause = preload("res://scripts/entities/hit_pause.gd").new()
	pause.name = "HitPause"
	enemy.add_child(pause)
	root.add_child(enemy)
	spawner._charm_timer = 0.0
	spawner._tick_meiren(0.1)
	t.check(pause.is_paused, "meiren pauses an enemy")

	rs.add_trait("slow_on_kill")
	var slow_enemy := SlowEnemy.new()
	root.add_child(slow_enemy)
	spawner._slow_all()
	t.approx(slow_enemy.factor, 0.5, 0.001, "slow on kill")

	spawner.free()
	root.free()
	qi.free()
	lives.free()
	rs.free()
	RunStateData.instance = prev
