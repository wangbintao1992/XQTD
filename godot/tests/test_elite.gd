extends RefCounted


func run(t) -> void:
	t.check(EnemyKinds.ELITES.size() >= 3, "3 elites")

	var prev = RunStateData.instance
	var rs = preload("res://scripts/autoload/run_state.gd").new()
	rs.reset()
	RunStateData.instance = rs

	var g = preload("res://scripts/core/path_graph.gd").new()
	var root := Node2D.new()
	t.root.add_child(root)
	var qi = preload("res://scripts/autoload/qi.gd").new()
	qi.reset()
	var lives = preload("res://scripts/autoload/lives.gd").new()
	lives.reset()

	var spawner = preload("res://scripts/core/path_spawner.gd").new()
	spawner.setup(g, root, qi, lives)
	var elite: Dictionary = EnemyKinds.ELITES[0]
	spawner.set_elite(elite)
	spawner.enemy_count = 3
	spawner.spawn_interval = 0.0
	spawner.deploy()
	spawner._process(0.0)

	t.eq(root.get_child_count(), 3, "3 spawned")
	var first = root.get_child(0)
	t.check(first.kind.get("elite", false), "first is elite")
	t.eq(first.kind.name, elite.name, "elite kind")

	var before: int = rs.traits.size()
	spawner.grant_elite_reward(elite)
	t.eq(rs.traits.size(), before + 1, "elite drops a trait")

	spawner.free()
	root.free()
	qi.free()
	lives.free()
	rs.free()
	RunStateData.instance = prev
