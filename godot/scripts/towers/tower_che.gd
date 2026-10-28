class_name TowerChe
extends TowerBase

## 车：横竖 4 个正方向，发射瞬间对整条线做一次判定，命中所有敌人（穿透）。

const DIRS := [
	Vector2(1, 0),
	Vector2(-1, 0),
	Vector2(0, 1),
	Vector2(0, -1),
]

@export var fire_interval := 1.2
@export var damage := 1
@export var attack_range := 460.0
@export var projectile_speed := 420.0
@export var projectile_length := 260.0
@export var hit_radius := 34.0
@export var windup_time := 0.1
@export var hit_pause_time := 0.12
@export var auto_fire := true

var _timer := 0.0
var base_damage := 1
var base_range := 460.0
var base_interval := 1.2
var _windup := 0.0
var _winding := false


func _ready() -> void:
	tower_kind = "che"
	base_damage = damage
	base_range = attack_range
	base_interval = fire_interval
	super._ready()
	apply_traits()
	_timer = fire_interval * 0.5


func apply_traits() -> void:
	damage = maxi(1, int(round(float(base_damage) * trait_damage_mult() * mutation_damage_mult())))
	attack_range = base_range * trait_range_mult() * mutation_range_mult()
	fire_interval = base_interval * trait_interval_mult() * mutation_interval_mult()


func trait_damage_mult() -> float:
	var m := super.trait_damage_mult()
	if RunStateData.has("double_chariot"):
		m *= 2.0
	return m


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
	var origin := global_position if is_inside_tree() else position
	var hits := 0
	for d in DIRS:
		hits += _raycast_once(origin, d)
	return hits


func _raycast_once(origin: Vector2, dir: Vector2) -> int:
	_flash(dir)
	if enemies_root == null:
		return 0

	var end := origin + dir * attack_range
	var count := 0
	for enemy in enemies_root.get_children():
		if not is_instance_valid(enemy) or not enemy.has_method("take_damage"):
			continue
		var pos: Vector2 = enemy.global_position
		if _distance_to_segment(pos, origin, end) > hit_radius:
			continue
		enemy.take_damage(damage)
		spread_hit(enemy, damage)
		var pause = enemy.get_node_or_null("HitPause")
		if pause and hit_pause_time > 0.0:
			pause.request_pause(hit_pause_time)
		count += 1
	return count


func _flash(dir: Vector2) -> void:
	var line := Line2D.new()
	line.width = 4.0
	line.default_color = Color(0.12, 0.1, 0.08, 0.85)
	line.points = PackedVector2Array([Vector2.ZERO, dir * attack_range])
	add_child(line)
	if is_inside_tree():
		var tw := create_tween()
		tw.tween_property(line, "modulate:a", 0.0, 0.18)
		tw.finished.connect(line.queue_free)
	else:
		line.queue_free()


func _distance_to_segment(p: Vector2, a: Vector2, b: Vector2) -> float:
	var ab := b - a
	var len_sq := ab.length_squared()
	if len_sq <= 0.0:
		return p.distance_to(a)
	var t := clampf((p - a).dot(ab) / len_sq, 0.0, 1.0)
	return p.distance_to(a + ab * t)
