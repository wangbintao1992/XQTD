extends RefCounted


func run(t) -> void:
	var cp = preload("res://scripts/ui/card_picker.gd").new()
	t.root.add_child(cp)
	var done := [0]
	cp.open_with_timeout(10.0, func(): done[0] += 1)
	t.check(cp.is_picking, "picking")
	t.eq(cp.slots.size(), 3, "3 cards")

	cp.swap(0)
	cp.swap(0)
	cp.swap(0)
	t.eq(cp.slots[0].charges, 0, "swap charges floor at 0")

	cp.pick(1)
	t.check(not cp.is_picking, "picked stops picking")
	t.check(cp.slots[1].node.scale.x > 1.0, "picked card scales")
	t.check(cp.slots[0].node.modulate.r < 1.0, "others dimmed")
	cp.close()
	t.eq(done[0], 1, "done called once")
	cp.free()

	var cp2 = preload("res://scripts/ui/card_picker.gd").new()
	t.root.add_child(cp2)
	var done2 := [0]
	cp2.open_with_timeout(0.1, func(): done2[0] += 1)
	cp2._process(0.2)
	t.check(not cp2.is_picking, "auto picked first")
	cp2._process(0.5)
	t.eq(done2[0], 1, "auto done called once")
	cp2.free()
