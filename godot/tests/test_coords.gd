extends RefCounted


func run(t) -> void:
	t.eq(Coords.to_screen(Vector2(0, 0)), Vector2(640, 360), "center")
	t.eq(Coords.to_screen(Vector2(100, 50)), Vector2(740, 310), "positive")
	t.eq(Coords.to_screen(Vector2(-100, -50)), Vector2(540, 410), "negative")
	t.eq(Coords.screen_to_design(Vector2(740, 310)), Vector2(100, 50), "roundtrip")
	t.approx(Coords.cocos_angle_to_rotation(90.0), -PI / 2.0, 0.0001, "angle 90")
