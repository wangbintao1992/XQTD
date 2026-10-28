class_name WeatherSystem
extends Node2D

signal weather_changed(weather_name: String)

static var instance: WeatherSystem

const DISPLAY := {
	"rain": "雨",
	"snow": "雪",
	"fog": "雾",
	"storm": "雷暴",
}

## 每 stage_size 个敌人换一种天气：雨 → 雪 → 雾 → 雷暴 → 循环。

@export var stage_size := 30
@export var size_scale := 3.0

var spawner
var session
var lives

var layers := {}
var _last_stage := -1
var _current := ""
var current_weather := ""


func _init() -> void:
	instance = self


func _exit_tree() -> void:
	if instance == self:
		instance = null

const PRESETS := [
	{
		"name": "rain",
		"texture": "res://art/weather/rain_a.png",
		"amount": 500,
		"lifetime": 1.2,
		"gravity": Vector2(0, 500),
		"speed": 800.0,
		"speed_var": 100.0,
		"size": 8.0,
		"size_var": 3.0,
		"color": Color(1, 1, 1, 1),
		"angle": 90,
		"angle_var": 6,
		"source_y": 430.0,
	},
	{
		"name": "snow",
		"texture": "res://art/weather/snow_a.png",
		"amount": 300,
		"lifetime": 5.0,
		"gravity": Vector2(0, 80),
		"speed": 100.0,
		"speed_var": 45.0,
		"size": 10.0,
		"size_var": 4.0,
		"color": Color(1, 1, 1, 1),
		"angle": 90,
		"angle_var": 35,
		"source_y": 430.0,
	},
	{
		"name": "fog",
		"texture": "res://art/weather/fog_a.png",
		"amount": 40,
		"lifetime": 8.0,
		"gravity": Vector2.ZERO,
		"speed": 55.0,
		"speed_var": 25.0,
		"size": 225.0,
		"size_var": 75.0,
		"color": Color(0.8, 0.8, 0.8, 0.67),
		"angle": 0,
		"angle_var": 22,
		"source_y": 0.0,
	},
	{
		"name": "storm",
		"texture": "res://art/weather/rain_a.png",
		"amount": 500,
		"lifetime": 1.2,
		"gravity": Vector2(0, 500),
		"speed": 800.0,
		"speed_var": 120.0,
		"size": 3.0,
		"size_var": 1.0,
		"color": Color(1, 1, 1, 0.86),
		"angle": 90,
		"angle_var": 10,
		"source_y": 430.0,
		"flash": {
			"texture": "res://art/weather/storm_a.png",
			"amount": 3,
			"lifetime": 0.3,
			"gravity": Vector2.ZERO,
			"speed": 0.0,
			"speed_var": 0.0,
			"size": 120.0,
			"size_var": 0.0,
			"color": Color(0.75, 0.86, 1.0, 1.0),
			"angle": 90,
			"angle_var": 180,
			"source_y": 0.0,
		},
	},
]


func _ready() -> void:
	build_layers()
	set_weather("")


func setup(spawner_, session_ = null, lives_ = null) -> void:
	spawner = spawner_
	session = session_
	lives = lives_


func stage_for(spawned: int) -> int:
	return int(floor(float(spawned) / float(maxi(1, stage_size))))


func _process(_delta: float) -> void:
	if session and not session.started:
		set_weather("")
		return
	if lives and lives.is_game_over:
		set_weather("")
		return
	if spawner == null:
		return
	var s := stage_for(_spawned_total())
	if s != _last_stage:
		apply_stage(s)


func apply_stage(stage: int) -> void:
	_last_stage = stage
	var idx := ((stage % PRESETS.size()) + PRESETS.size()) % PRESETS.size()
	set_weather(PRESETS[idx].name)


func set_weather(weather_name: String) -> void:
	_current = weather_name
	current_weather = weather_name
	for key in layers:
		for node in layers[key]:
			node.emitting = (key == weather_name)
			node.visible = (key == weather_name)
	weather_changed.emit(weather_name)


func reset() -> void:
	_last_stage = -1
	apply_stage(0)


static func display_name(id: String) -> String:
	return str(DISPLAY.get(id, id))


static func _current_weather() -> String:
	return instance._current if instance else ""


static func tower_damage_mult() -> float:
	match _current_weather():
		"fog":
			return 0.9
		"storm":
			return 1.1
		_:
			return 1.0


static func tower_range_mult() -> float:
	return 0.9 if _current_weather() == "snow" else 1.0


static func tower_interval_mult() -> float:
	var cur := _current_weather()
	return 0.95 if cur == "rain" or cur == "storm" else 1.0


static func enemy_speed_mult() -> float:
	match _current_weather():
		"rain":
			return 0.95
		"snow":
			return 0.9
		"storm":
			return 1.05
		_:
			return 1.0


func _spawned_total() -> int:
	var v = spawner.get("run_spawned_total")
	if v != null:
		return int(v)
	return spawner.total_count()


func build_layers() -> void:
	if not layers.is_empty():
		return
	for preset in PRESETS:
		var nodes: Array = [_make_layer(preset)]
		if preset.has("flash"):
			nodes.append(_make_layer(preset.flash))
		layers[preset.name] = nodes
	set_weather("")


func _make_layer(preset: Dictionary) -> CPUParticles2D:
	var p := CPUParticles2D.new()
	p.emitting = true
	p.one_shot = false
	p.amount = int(preset.get("amount", 100))
	p.lifetime = float(preset.get("lifetime", 1.0))
	p.gravity = preset.get("gravity", Vector2.ZERO)
	p.initial_velocity_min = float(preset.get("speed", 100.0))
	p.initial_velocity_max = float(preset.get("speed", 100.0)) \
		+ float(preset.get("speed_var", 0.0))
	p.scale_amount_min = float(preset.get("size", 8.0)) * size_scale
	p.scale_amount_max = (float(preset.get("size", 8.0)) \
		+ float(preset.get("size_var", 0.0))) * size_scale
	p.direction = Vector2(0, 1) if int(preset.get("angle", 90)) == 90 \
		else Vector2(1, 0)
	p.spread = float(preset.get("angle_var", 0))
	p.emission_shape = CPUParticles2D.EMISSION_SHAPE_RECTANGLE
	p.emission_rect_extents = Vector2(760, 20)
	p.position = Vector2(640, 360 - float(preset.get("source_y", 0.0)))
	p.color = preset.get("color", Color.WHITE)
	p.texture = load(preset.texture)
	p.z_index = 100
	add_child(p)
	p.emitting = false
	p.visible = false
	return p
