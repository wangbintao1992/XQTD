extends RefCounted


func run(t) -> void:
	var prev = EquipmentManagerData.instance
	var em = preload("res://scripts/autoload/equipment_manager.gd").new()
	em.persistence_enabled = false
	em.reset_for_test()

	var panel = preload("res://scripts/ui/equipment_panel.gd").new()
	t.root.add_child(panel)
	panel.show_panel()
	t.check(panel.is_open, "panel opens")

	em.add_random_drop()
	panel.refresh()
	t.check(panel._list != null and panel._list.get_child_count() >= 1, "inventory listed")
	for _i in 12:
		em.add_random_drop()
	panel.refresh()
	t.check(panel._list.get_child_count() >= 13, "all inventory shown")

	panel.hide_panel()
	t.check(not panel.is_open, "panel closes")

	panel.free()
	em.free()
	EquipmentManagerData.instance = prev
