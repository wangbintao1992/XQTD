extends RefCounted


func run(t) -> void:
	var prev := InkFx.multiply_enabled

	var line := Line2D.new()
	var mat := InkFx.apply(line)
	t.check(mat is CanvasItemMaterial, "ink material created")
	t.check(line.material == mat, "material applied")
	t.eq((mat as CanvasItemMaterial).blend_mode, CanvasItemMaterial.BLEND_MODE_MUL, "multiply blend")

	InkFx.multiply_enabled = false
	var line2 := Line2D.new()
	t.check(InkFx.apply(line2) == null, "disabled returns null")
	t.check(line2.material == null, "disabled keeps alpha")
	InkFx.multiply_enabled = prev
	line.free()
	line2.free()

	var towers := Node2D.new()
	t.root.add_child(towers)
	var che = preload("res://scenes/towers/tower_che.tscn").instantiate()
	che.auto_fire = false
	towers.add_child(che)
	if not che.is_node_ready():
		che._ready()

	t.eq(che._flash_lines.size(), 4, "four reusable flash lines")
	var before: int = che.get_child_count()
	for i in 20:
		che._flash(TowerChe.DIRS[i % 4])
	t.eq(che.get_child_count(), before, "flash does not allocate")
	t.eq(che._flash_lines[0].points.size(), 2, "flash line has two points")
	t.check(che._flash_lines[0].material is CanvasItemMaterial, "flash line uses ink material")
	t.check(che._flash_lines[0].visible, "flash line visible during fade")

	towers.free()
