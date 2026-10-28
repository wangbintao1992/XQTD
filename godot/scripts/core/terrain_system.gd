class_name TerrainSystem
extends Node2D

## 路径地形：河（减速，过河后加速）、山（减速）、桥（加速）。
## 区域用设计坐标定义，上屏走 Coords；只影响敌人移动。

static var instance: TerrainSystem

const ZONES := [
	{
		"name": "河",
		"type": "river",
		"center": Vector2(-200, 203),
		"radius": 90.0,
		"speed": 0.8,
		"color": Color(0.2, 0.35, 0.5, 0.22),
	},
	{
		"name": "山",
		"type": "mountain",
		"center": Vector2(100, -243),
		"radius": 80.0,
		"speed": 0.7,
		"color": Color(0.3, 0.3, 0.3, 0.2),
	},
	{
		"name": "桥",
		"type": "bridge",
		"center": Vector2(300, -17),
		"radius": 60.0,
		"speed": 1.1,
		"color": Color(0.5, 0.4, 0.2, 0.2),
	},
]


func _init() -> void:
	instance = self


func _exit_tree() -> void:
	if instance == self:
		instance = null


func _ready() -> void:
	_build_visuals()


func zone_at(stage_pos: Vector2) -> Dictionary:
	for zone in ZONES:
		var center: Vector2 = Coords.to_screen(zone.center * Coords.PATH_IMAGE_SCALE)
		if stage_pos.distance_to(center) <= float(zone.radius):
			return zone
	return {}


func type_at(stage_pos: Vector2) -> String:
	var zone := zone_at(stage_pos)
	return str(zone.get("type", ""))


func speed_mult_at(stage_pos: Vector2) -> float:
	var zone := zone_at(stage_pos)
	return float(zone.get("speed", 1.0))


func _build_visuals() -> void:
	for zone in ZONES:
		var radius: float = float(zone.radius)
		var pts := PackedVector2Array()
		for i in 32:
			var a := TAU * float(i) / 32.0
			pts.append(Vector2(cos(a), sin(a)) * radius)
		var poly := Polygon2D.new()
		poly.polygon = pts
		poly.color = zone.color
		poly.position = Coords.to_screen(zone.center * Coords.PATH_IMAGE_SCALE)
		add_child(poly)

		var label := Label.new()
		label.text = str(zone.name)
		label.position = Coords.to_screen(zone.center * Coords.PATH_IMAGE_SCALE) + Vector2(-10, -14)
		label.add_theme_font_override("font", UiFont.make())
		label.add_theme_font_size_override("font_size", 20)
		label.add_theme_color_override("font_color", Color(0.15, 0.12, 0.1))
		label.add_theme_color_override("font_outline_color", Color(1, 1, 1, 0.6))
		label.add_theme_constant_override("outline_size", 2)
		add_child(label)
