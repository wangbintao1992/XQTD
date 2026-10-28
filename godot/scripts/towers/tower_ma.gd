class_name TowerMa
extends TowerBase

## 马：短程单体高爆发。日字跳杀；马腿 30 范围内有挡路者时，伤害转移给挡路者。

const EXPLOSION_TEXTURE := preload("res://art/moban.png")

@export var fire_interval := 0.8
@export var damage := 2
@export var attack_range := 210.0
@export var leg_offset := 45.0
@export var leg_block_radius := 30.0
@export var windup_time := 0.12
@export var hit_pause_time := 0.1
@export var auto_fire := true

var _timer := 0.0
var base_damage := 2
var base_range := 210.0
var base_interval := 0.8
var _windup := 0.0
var _winding := false


func _ready() -> void:
	tower_kind = "ma"
	base_damage = damage
	base_range = attack_range
	base_interval = fire_interval
	super._ready()
	apply_traits()
	_timer = fire_interval * 0.5


func apply_traits() -> void:
	damage_exact = float(base_damage) * trait_damage_mult() * mutation_damage_mult() * level_damage_mult() * weather_damage_mult()
	damage = maxi(1, int(round(damage_exact)))
	attack_range = base_range * trait_range_mult() * mutation_range_mult() * level_range_mult() * weather_range_mult()
	fire_interval = base_interval * trait_interval_mult() * mutation_interval_mult() * level_interval_mult() * weather_interval_mult()


func _process(delta: float) -> void:
	if not auto_fire:
		return
	if _winding:
		_windup -= delta
		if _windup <= 0.0:
			_winding = false
			_cast()
		return

	_timer += delta
	if _timer >= fire_interval:
		_timer = 0.0
		if windup_time > 0.0:
			_windup = windup_time
			_winding = true
		else:
			_cast()


func fire() -> int:
	return _cast()


func _cast() -> int:
	var target = _pick_target()
	if target == null:
		return 0

	var blocker = _blocker_for(target)
	var victim = blocker if blocker else target
	_damage(victim)
	_dash(victim)
	return 1


func _pick_target():
	if enemies_root == null:
		return null
	var origin := _origin()
	var best = null
	var best_d := INF
	for e in enemies_root.get_children():
		if not is_instance_valid(e) or not e.has_method("take_damage"):
			continue
		var d: float = (e.global_position - origin).length()
		if d > attack_range:
			continue
		if d < best_d:
			best_d = d
			best = e
	return best


func _leg_point(target: Node) -> Vector2:
	var origin := _origin()
	var d: Vector2 = target.global_position - origin
	if absf(d.x) >= absf(d.y):
		return origin + Vector2(signf(d.x) * minf(leg_offset, absf(d.x)), 0.0)
	return origin + Vector2(0.0, signf(d.y) * minf(leg_offset, absf(d.y)))


func _blocker_for(target: Node):
	if RunStateData.has("free_horse"):
		return null
	if enemies_root == null:
		return null
	var leg := _leg_point(target)
	var best = null
	var best_d := INF
	for e in enemies_root.get_children():
		if e == target or not is_instance_valid(e) or not e.has_method("take_damage"):
			continue
		var d: float = (e.global_position - leg).length()
		if d <= leg_block_radius and d < best_d:
			best_d = d
			best = e
	return best


func _origin() -> Vector2:
	return global_position if is_inside_tree() else position


func _damage(node: Node) -> void:
	node.take_damage(roll_damage())
	spread_hit(node, damage)
	var pause = node.get_node_or_null("HitPause")
	if pause and hit_pause_time > 0.0:
		pause.request_pause(hit_pause_time)


func _dash(victim: Node) -> void:
	if not is_inside_tree():
		return

	var local: Vector2 = victim.global_position - global_position
	var line := Line2D.new()
	line.width = 3.0
	line.default_color = Color(0.15, 0.12, 0.1, 0.8)
	line.points = PackedVector2Array([Vector2.ZERO, local])
	add_child(line)

	var s := Sprite2D.new()
	s.texture = TextureUtil.atlas(EXPLOSION_TEXTURE)
	s.scale = TextureUtil.scale_for(EXPLOSION_TEXTURE, 72.0)
	s.z_index = 50
	add_child(s)
	s.global_position = victim.global_position

	var tw := create_tween()
	tw.tween_property(line, "modulate:a", 0.0, 0.15)
	tw.tween_property(s, "modulate:a", 0.0, 0.3)
	tw.finished.connect(func():
		if is_instance_valid(line):
			line.queue_free()
		if is_instance_valid(s):
			s.queue_free()
	)
