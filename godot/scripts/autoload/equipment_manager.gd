class_name EquipmentManagerData
extends Node

## 跨局装备：3 槽、5 品质、1-3 条随机词条、user:// 存档。
## 穿新覆盖旧；旧件直接丢弃；不可脱下。

signal changed

static var instance: EquipmentManagerData

const SLOTS := ["head", "hand", "body"]
const SLOT_NAMES := {"head": "头盔", "hand": "兵器", "body": "护甲"}
const QUALITIES := ["white", "green", "blue", "purple", "orange"]
const QUALITY_NAMES := {
	"white": "白", "green": "绿", "blue": "蓝", "purple": "紫", "orange": "橙",
}
const QUALITY_MULT := {
	"white": 1.0, "green": 1.3, "blue": 1.6, "purple": 2.0, "orange": 2.5,
}
const QUALITY_WEIGHTS := {
	"white": 50, "green": 30, "blue": 15, "purple": 4, "orange": 1,
}
const AFFIX_NAMES := {
	"damage": "伤害", "range": "射程", "attack_speed": "攻速", "qi_cost": "棋气消耗",
}
const AFFIX_RANGE := {
	"damage": Vector2(0.05, 0.15),
	"range": Vector2(0.05, 0.12),
	"attack_speed": Vector2(0.05, 0.15),
	"qi_cost": Vector2(0.05, 0.15),
}

var inventory: Array[Dictionary] = []
var equipped: Dictionary = {"head": {}, "hand": {}, "body": {}}
var persistence_enabled := true
var save_path := "user://equipment.json"

var _rng := RandomNumberGenerator.new()


func _init() -> void:
	instance = self


func _ready() -> void:
	_rng.randomize()
	if persistence_enabled:
		load_data()


func _exit_tree() -> void:
	if instance == self:
		instance = null


func reset_for_test() -> void:
	inventory.clear()
	equipped = {"head": {}, "hand": {}, "body": {}}
	changed.emit()


func add_random_drop() -> Dictionary:
	var slot: String = SLOTS[_rng.randi_range(0, SLOTS.size() - 1)]
	var quality := _roll_quality()
	var mult: float = QUALITY_MULT[quality]
	var item := {
		"id": _rng.randi(),
		"slot": slot,
		"quality": quality,
		"affixes": [],
	}
	var count := _rng.randi_range(1, 3)
	var used := {}
	for _i in count:
		var type := _roll_affix(used)
		used[type] = true
		var r: Vector2 = AFFIX_RANGE[type]
		var value := _rng.randf_range(r.x, r.y) * mult
		item.affixes.append({"type": type, "value": value})
	inventory.append(item)
	save()
	changed.emit()
	return item


func _roll_quality() -> String:
	var total := 0
	for q in QUALITIES:
		total += int(QUALITY_WEIGHTS[q])
	var pick := _rng.randi_range(1, total)
	for q in QUALITIES:
		pick -= int(QUALITY_WEIGHTS[q])
		if pick <= 0:
			return q
	return "white"


func _roll_affix(used: Dictionary) -> String:
	var available: Array = []
	for type in AFFIX_NAMES.keys():
		if not used.has(type):
			available.append(type)
	if available.is_empty():
		available = AFFIX_NAMES.keys()
	return available[_rng.randi_range(0, available.size() - 1)]


func equip(index: int) -> bool:
	if index < 0 or index >= inventory.size():
		return false
	var item: Dictionary = inventory[index]
	var slot: String = item.slot
	equipped[slot] = item
	inventory.remove_at(index)
	save()
	changed.emit()
	return true


func item_name(item: Dictionary) -> String:
	var q: String = str(item.get("quality", "white"))
	var s: String = str(item.get("slot", ""))
	return str(QUALITY_NAMES.get(q, q)) + "·" + str(SLOT_NAMES.get(s, s))


func affix_text(item: Dictionary) -> String:
	var parts: Array[String] = []
	for a in item.get("affixes", []):
		var type: String = str(a.type)
		parts.append(str(AFFIX_NAMES.get(type, type)) + "+" + str(int(round(float(a.value) * 100.0))) + "%")
	return " ".join(parts)


func get_totals() -> Dictionary:
	var totals := {"damage": 0.0, "range": 0.0, "attack_speed": 0.0, "qi_cost": 0.0}
	for slot in SLOTS:
		var item: Dictionary = equipped.get(slot, {})
		for a in item.get("affixes", []):
			var type: String = str(a.type)
			if totals.has(type):
				totals[type] += float(a.value)
	return totals


func damage_mult() -> float:
	return 1.0 + float(get_totals().damage)


func range_mult() -> float:
	return 1.0 + float(get_totals().range)


func interval_mult() -> float:
	return 1.0 / maxf(1.0, 1.0 + float(get_totals().attack_speed))


func cost_mult() -> float:
	return maxf(0.1, 1.0 - float(get_totals().qi_cost))


func to_dict() -> Dictionary:
	return {
		"inventory": inventory.duplicate(true),
		"equipped": equipped.duplicate(true),
	}


func from_dict(data: Dictionary) -> void:
	inventory.clear()
	for item in data.get("inventory", []):
		if item is Dictionary:
			inventory.append(item)
	var eq = data.get("equipped", {})
	equipped = {
		"head": eq.get("head", {}),
		"hand": eq.get("hand", {}),
		"body": eq.get("body", {}),
	}
	changed.emit()


func save() -> void:
	if not persistence_enabled:
		return
	var f := FileAccess.open(save_path, FileAccess.WRITE)
	if f:
		f.store_string(JSON.stringify(to_dict()))


func load_data() -> void:
	if not FileAccess.file_exists(save_path):
		return
	var f := FileAccess.open(save_path, FileAccess.READ)
	if f == null:
		return
	var parsed = JSON.parse_string(f.get_as_text())
	if parsed is Dictionary:
		from_dict(parsed)
