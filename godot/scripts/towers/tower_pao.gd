class_name TowerPao
extends TowerBase

## 炮：隔山打牛。沿横竖 4 方向，必须隔一个炮架（任意棋子）才能打到后面的敌人；
## 命中目标 + 周围 55 范围；炮架本身不掉血。

const DIRS := [
	Vector2(1, 0),
	Vector2(-1, 0),
	Vector2(0, 1),
	Vector2(0, -1),
]
const EXPLOSION_TEXTURE := preload("res://art/moban.png")

@export var fire_interval := 1.8
@export var damage := 3
@export var splash_damage := 2
@export var splash_radius := 55.0
@export var attack_range := 520.0
@export var line_radius := 34.0
@export var windup_time := 0.15
@export var hit_pause_time := 0.12
@export var require_screen := true
@export var direct_damage := 1
@export var auto_fire := true

var _timer := 0.0
var base_damage := 3
var base_range := 520.0
var base_interval := 1.8
var _windup := 0.0
var _winding := false


func _ready() -> void:
	tower_kind = "pao"
	base_damage = damage
	base_range = attack_range
	base_interval = fire_interval
	super._ready()
	apply_traits()
	_timer = fire_interval * 0.5


func apply_traits() -> void:
	damage_exact = float(base_damage) * trait_damage_mult() * mutation_damage_mult() * level_damage_mult() * weather_damage_mult() * equipment_damage_mult()
	damage = maxi(1, int(round(damage_exact)))
	attack_range = base_range * trait_range_mult() * mutation_range_mult() * level_range_mult() * weather_range_mult() * equipment_range_mult()
	fire_interval = base_interval * trait_interval_mult() * mutation_interval_mult() * level_interval_mult() * weather_interval_mult() * equipment_interval_mult()


func _process(delta: float) -> void:
	if not tick_stun(delta):
		return
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
		hits += _fire_dir(origin, d)
	return hits


func _fire_dir(origin: Vector2, dir: Vector2) -> int:
	var cands := _line_candidates(origin, dir)
	if cands.is_empty():
		return 0

	var free_cannon := RunStateData.has("free_cannon")
	if require_screen and not free_cannon:
		var screen = cands[0].node
		var target = null
		for i in range(1, cands.size()):
			if _is_enemy(cands[i].node):
				target = cands[i].node
				break
		if target == null:
			return 0
		_damage(target, roll_damage())
		_splash(target, screen)
		_explode(target.global_position)
		return 1

	var first_enemy = null
	for c in cands:
		if _is_enemy(c.node):
			first_enemy = c.node
			break
	if first_enemy == null:
		return 0
	_damage(first_enemy, damage if free_cannon else direct_damage)
	_explode(first_enemy.global_position)
	return 1


func _line_candidates(origin: Vector2, dir: Vector2) -> Array:
	var out: Array = []
	var end := origin + dir * attack_range
	for pool in [enemies_root, towers_root]:
		if pool == null:
			continue
		for c in pool.get_children():
			if c == self or not is_instance_valid(c):
				continue
			var pos: Vector2 = c.global_position
			if _distance_to_segment(pos, origin, end) > line_radius:
				continue
			var proj := (pos - origin).dot(dir)
			if proj < 0.0 or proj > attack_range:
				continue
			out.append({"node": c, "dist": proj})
	out.sort_custom(func(a, b): return a.dist < b.dist)
	return out


func _is_enemy(node: Node) -> bool:
	return node != null and node.has_method("take_damage")


func _damage(node: Node, amount: int) -> void:
	if node == null or not node.has_method("take_damage"):
		return
	node.take_damage(amount)
	spread_hit(node, amount)
	var pause = node.get_node_or_null("HitPause")
	if pause and hit_pause_time > 0.0:
		pause.request_pause(hit_pause_time)


func _splash(target: Node, screen: Node) -> void:
	if enemies_root == null:
		return
	var center: Vector2 = target.global_position
	for e in enemies_root.get_children():
		if e == target or e == screen or not is_instance_valid(e):
			continue
		if not e.has_method("take_damage"):
			continue
		if (e.global_position - center).length() <= splash_radius:
			_damage(e, splash_damage)


func _explode(pos: Vector2) -> void:
	if not is_inside_tree():
		return
	# 挂在塔自己下面，避免污染 towers_root 的直接子节点（会把特效当炮架）
	var s := Sprite2D.new()
	s.texture = TextureUtil.atlas(EXPLOSION_TEXTURE)
	s.scale = TextureUtil.scale_for(EXPLOSION_TEXTURE, 96.0)
	s.z_index = 50
	add_child(s)
	s.global_position = pos
	var tw := create_tween()
	tw.tween_property(s, "modulate:a", 0.0, 0.4)
	tw.finished.connect(s.queue_free)


func _distance_to_segment(p: Vector2, a: Vector2, b: Vector2) -> float:
	var ab := b - a
	var len_sq := ab.length_squared()
	if len_sq <= 0.0:
		return p.distance_to(a)
	var t := clampf((p - a).dot(ab) / len_sq, 0.0, 1.0)
	return p.distance_to(a + ab * t)
