extends RefCounted


func run(t) -> void:
	var cp = preload("res://scripts/ui/card_picker.gd").new()
	t.root.add_child(cp)

	var ids := ["free_horse", "free_cannon", "double_chariot"]
	var done := [0]
	cp.open_with_traits(ids, 10.0, func(): done[0] += 1)

	t.eq(cp.slots.size(), 3, "3 cards")
	t.eq(cp.selected_trait, "", "no selection yet")

	var card: Control = cp.slots[0].node
	var found := false
	for child in card.get_children():
		if child is Label and child.text == TraitPool.title(ids[0]):
			found = true
	t.check(found, "card shows trait title")

	cp.pick(1)
	t.eq(cp.selected_trait, "free_cannon", "selected trait")
	cp.close()
	t.eq(done[0], 1, "done once")
	cp.free()
