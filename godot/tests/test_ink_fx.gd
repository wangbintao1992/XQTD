extends RefCounted


func run(t) -> void:
	var prev := InkFx.multiply_enabled

	var line := Line2D.new()
	var mat := InkFx.apply(line)
	t.check(mat is ShaderMaterial, "ink shader created")
	t.check(line.material == mat, "material applied")
	t.check(mat.shader.code.contains("blend_mul"), "shader uses multiply")
	t.check(mat.shader.code.contains("mix(vec3(1.0)"), "shader is alpha-aware")

	InkFx.set_enabled(false)
	t.check(line.material == null, "runtime off clears material")
	t.check(InkFx.apply(line) == null, "disabled returns null")
	t.check(line.material == null, "disabled keeps alpha")
	InkFx.set_enabled(true)
	t.check(line.material is ShaderMaterial, "runtime on restores material")
	InkFx.set_enabled(prev)
	line.free()

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
	t.check(che._flash_lines[0].material is ShaderMaterial, "flash line uses ink material")
	t.check(not che._flash_lines[0].visible, "off-tree flash stays hidden")

	towers.free()
