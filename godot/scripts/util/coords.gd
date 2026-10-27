class_name Coords
extends RefCounted

## Cocos 设计坐标（原点在画布中心、y 向上）↔ Godot 屏幕坐标（原点左上、y 向下）。

const DESIGN := Vector2(1280, 720)


static func to_screen(p: Vector2) -> Vector2:
	return Vector2(DESIGN.x * 0.5 + p.x, DESIGN.y * 0.5 - p.y)


static func screen_to_design(p: Vector2) -> Vector2:
	return Vector2(p.x - DESIGN.x * 0.5, DESIGN.y * 0.5 - p.y)


static func cocos_angle_to_rotation(deg: float) -> float:
	return -deg_to_rad(deg)
