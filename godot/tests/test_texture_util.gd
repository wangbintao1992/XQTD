extends RefCounted


func run(t) -> void:
	var tex = load("res://art/qz/r_ma.png")
	var at = TextureUtil.atlas(tex)
	t.check(at != null, "atlas")
	t.check(at.region.size.x < tex.get_width(), "trimmed")
	var s: Vector2 = TextureUtil.scale_for(tex, 43.4)
	t.approx(at.region.size.x * s.x, 43.4, 0.01, "scaled width")
	t.approx(at.region.size.y * s.y, 43.4, 0.01, "scaled height")
