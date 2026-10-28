class_name ComboSystem
extends Node2D

## 象棋杀招：马后炮 / 双车错 / 重炮。
## 阵型存在 + 6s 冷却 + 线上有目标才触发；整线清屏 + 墨浪。

const SAME_COLUMN := 24.0
const SAME_ROW := 9.0
const DAMAGE := 9999
const MA_PAO_RADIUS := 34.0
const CHE_RADIUS := 40.0
const PAO_RADIUS := 55.0

const TITLES := {
	"ma_pao": "马后炮",
	"double_che": "双车错",
	"double_pao": "重炮",
}

@export var cooldown := 6.0

var towers_root: Node
var enemies_root: Node
var session: Object
var lives: Object
var enabled := true

var _timer := 0.0


func setup(towers: Node, enemies: Node, session_ = null, lives_ = null) -> void:
	towers_root = towers
	enemies_root = enemies
	if session_:
		session = session_
	if lives_:
		lives = lives_


func reset() -> void:
	_timer = 0.0
	enabled = true


func _process(delta: float) -> void:
	if not enabled:
		return

	var s = session
	if s == null and is_inside_tree():
		s = get_node_or_null("/root/GameSession")
	if s and not s.started:
		return
	var l = lives
	if l == null and is_inside_tree():
		l = get_node_or_null("/root/Lives")
	if l and l.is_game_over:
		return

	var parent := get_parent()
	var wave = parent.get_node_or_null("WaveManager") if parent else null
	if wave and wave.picking:
		return

	_timer += delta
	if _timer >= cooldown:
		if try_trigger() != "":
			_timer = 0.0


func try_trigger() -> String:
	var combos := check_combos()
	if combos.is_empty():
		return ""
	var id := combos[0]
	if not _apply(id):
		return ""
	return id


func check_combos() -> Array[String]:
	var groups := _collect()
	var out: Array[String] = []

	for a in groups.ma:
		for b in groups.pao:
			if _same_column(a, b):
				out.append("ma_pao")
				return out

	for i in groups.che.size():
		for j in range(i + 1, groups.che.size()):
			var a: Vector2 = groups.che[i]
			var b: Vector2 = groups.che[j]
			if _same_column(a, b) or _same_row(a, b):
				out.append("double_che")
				return out

	for i in groups.pao.size():
		for j in range(i + 1, groups.pao.size()):
			var a: Vector2 = groups.pao[i]
			var b: Vector2 = groups.pao[j]
			if _same_column(a, b) or _same_row(a, b):
				out.append("double_pao")
				return out

	return out


func _collect() -> Dictionary:
	var groups := {"ma": [], "pao": [], "che": []}
	if towers_root == null:
		return groups
	for item in towers_root.get_children():
		if not is_instance_valid(item):
			continue
		var p: Vector2 = item.global_position
		if item is TowerMa:
			groups.ma.append(p)
		elif item is TowerPao:
			groups.pao.append(p)
		elif item is TowerChe:
			groups.che.append(p)
	return groups


func _same_column(a: Vector2, b: Vector2) -> bool:
	return absf(a.x - b.x) <= SAME_COLUMN


func _same_row(a: Vector2, b: Vector2) -> bool:
	return absf(a.y - b.y) <= SAME_ROW


func _apply(id: String) -> bool:
	var groups := _collect()
	match id:
		"ma_pao":
			for a in groups.ma:
				for b in groups.pao:
					if _same_column(a, b):
						var x: float = (a.x + b.x) * 0.5
						if _damage_line(true, x, MA_PAO_RADIUS) <= 0:
							return false
						_flash(true, x)
						_toast(TITLES[id])
						return true
		"double_che":
			for i in groups.che.size():
				for j in range(i + 1, groups.che.size()):
					if _apply_pair(groups.che[i], groups.che[j], CHE_RADIUS, id):
						return true
		"double_pao":
			for i in groups.pao.size():
				for j in range(i + 1, groups.pao.size()):
					if _apply_pair(groups.pao[i], groups.pao[j], PAO_RADIUS, id):
						return true
	return false


func _apply_pair(a: Vector2, b: Vector2, radius: float, id: String) -> bool:
	if _same_column(a, b):
		var x: float = (a.x + b.x) * 0.5
		if _damage_line(true, x, radius) <= 0:
			return false
		_flash(true, x)
		_toast(TITLES[id])
		return true
	if _same_row(a, b):
		var y: float = (a.y + b.y) * 0.5
		if _damage_line(false, y, radius) <= 0:
			return false
		_flash(false, y)
		_toast(TITLES[id])
		return true
	return false


func _damage_line(vertical: bool, coord: float, radius: float) -> int:
	if enemies_root == null:
		return 0
	var hits := 0
	for enemy in enemies_root.get_children():
		if not is_instance_valid(enemy) or not enemy.has_method("take_damage"):
			continue
		var p: Vector2 = enemy.global_position
		var d := absf(p.x - coord) if vertical else absf(p.y - coord)
		if d > radius:
			continue
		var dmg := DAMAGE
		var hp = enemy.get("hp")
		if hp != null:
			dmg = maxi(dmg, int(hp) + 1)
		enemy.take_damage(dmg)
		var pause = enemy.get_node_or_null("HitPause")
		if pause:
			pause.request_pause(0.15)
		hits += 1
	return hits


func _flash(vertical: bool, coord: float) -> void:
	var line := Line2D.new()
	line.width = 8.0
	line.default_color = Color(0.1, 0.08, 0.06, 0.85)
	if vertical:
		line.points = PackedVector2Array([Vector2(coord, 0), Vector2(coord, Coords.DESIGN.y)])
	else:
		line.points = PackedVector2Array([Vector2(0, coord), Vector2(Coords.DESIGN.x, coord)])
	add_child(line)
	var tw := create_tween()
	tw.tween_property(line, "modulate:a", 0.0, 0.35)
	tw.finished.connect(line.queue_free)


func _toast(text: String) -> void:
	var loop := Engine.get_main_loop()
	if loop is SceneTree:
		var toast = (loop as SceneTree).root.get_node_or_null("Toast")
		if toast:
			toast.show(text)
