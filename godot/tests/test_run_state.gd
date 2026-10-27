extends RefCounted


func run(t) -> void:
	var rs = preload("res://scripts/autoload/run_state.gd").new()
	rs.reset()
	t.check(not rs.has_trait("free_horse"), "empty")
	t.eq(rs.wave, 1, "wave starts at 1")

	rs.add_trait("free_horse")
	t.check(rs.has_trait("free_horse"), "has trait")
	rs.add_trait("free_horse")
	t.eq(rs.traits.size(), 1, "traits are unique")

	var changed := [0]
	rs.traits_changed.connect(func(): changed[0] += 1)
	rs.add_trait("free_cannon")
	t.eq(changed[0], 1, "signal emitted")

	rs.wave = 7
	rs.reset()
	t.eq(rs.traits.size(), 0, "reset traits")
	t.eq(rs.wave, 1, "reset wave")

	rs.free()
	RunStateData.instance = null
