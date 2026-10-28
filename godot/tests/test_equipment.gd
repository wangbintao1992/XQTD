extends RefCounted


func run(t) -> void:
	var prev = EquipmentManagerData.instance
	var em = preload("res://scripts/autoload/equipment_manager.gd").new()
	em.persistence_enabled = false
	em.reset_for_test()
	t.eq(em.inventory.size(), 0, "starts empty")

	var item: Dictionary = em.add_random_drop()
	t.check(EquipmentManagerData.SLOTS.has(item.slot), "slot valid")
	t.check(EquipmentManagerData.QUALITIES.has(item.quality), "quality valid")
	t.check(item.affixes.size() >= 1 and item.affixes.size() <= 3, "1-3 affixes")

	var slot: String = item.slot
	t.check(em.equip(0), "equip succeeds")
	t.check(not em.equipped[slot].is_empty(), "slot filled")
	t.eq(em.inventory.size(), 0, "removed from inventory")

	var totals: Dictionary = em.get_totals()
	t.check(totals.has("damage") and totals.has("range") and totals.has("attack_speed") and totals.has("qi_cost"), "totals keys")

	var item2: Dictionary = em.add_random_drop()
	var slot2: String = item2.slot
	em.equip(0)
	t.check(not em.equipped[slot2].is_empty(), "new item overwrites slot")

	var d: Dictionary = em.to_dict()
	var em2 = preload("res://scripts/autoload/equipment_manager.gd").new()
	em2.persistence_enabled = false
	em2.from_dict(d)
	t.eq(em2.equipped.size(), 3, "equipped roundtrip")
	t.eq(em2.inventory.size(), em.inventory.size(), "inventory roundtrip")

	t.check(em.damage_mult() >= 1.0, "damage multiplier")
	t.check(em.range_mult() >= 1.0, "range multiplier")
	t.check(em.interval_mult() > 0.0 and em.interval_mult() <= 1.0, "interval multiplier")
	t.check(em.cost_mult() > 0.0 and em.cost_mult() <= 1.0, "cost multiplier")

	em.reset_for_test()
	t.eq(em.inventory.size(), 0, "reset inventory")
	t.check(em.equipped["head"].is_empty(), "reset equipped")

	em.free()
	em2.free()
	EquipmentManagerData.instance = prev
