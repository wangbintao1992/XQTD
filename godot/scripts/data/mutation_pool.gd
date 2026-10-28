class_name MutationPool
extends RefCounted

## 每 10 波棋局异变。倍率读取 RunStateData.mutation。

const MUTATIONS := {
	"cannon_weak_horse_strong": {
		"title": "炮弱马强",
		"desc": "炮伤害 -30%；马伤害 +30%、攻速 +20%",
	},
	"chariot_short_fast": {
		"title": "车短怪快",
		"desc": "车射程 -25%；小怪移速 +20%",
	},
	"headwind": {
		"title": "逆风局",
		"desc": "怪物血量 +50%；所有塔伤害 +50%",
	},
}


static func ids() -> Array:
	return MUTATIONS.keys()


static func title(id: String) -> String:
	var data: Dictionary = MUTATIONS.get(id, {})
	return str(data.get("title", id))


static func desc(id: String) -> String:
	var data: Dictionary = MUTATIONS.get(id, {})
	return str(data.get("desc", ""))


static func pick() -> String:
	var all := MUTATIONS.keys()
	if all.is_empty():
		return ""
	return all[randi() % all.size()]


static func tower_damage_mult(kind: String) -> float:
	var m := 1.0
	var cur := _current()
	if cur == "cannon_weak_horse_strong":
		if kind == "pao":
			m *= 0.7
		elif kind == "ma":
			m *= 1.3
	elif cur == "headwind":
		m *= 1.5
	return m


static func tower_range_mult(kind: String) -> float:
	if _current() == "chariot_short_fast" and kind == "che":
		return 0.75
	return 1.0


static func tower_interval_mult(kind: String) -> float:
	if _current() == "cannon_weak_horse_strong" and kind == "ma":
		return 0.8
	return 1.0


static func enemy_hp_mult() -> float:
	return 1.5 if _current() == "headwind" else 1.0


static func enemy_speed_mult() -> float:
	return 1.2 if _current() == "chariot_short_fast" else 1.0


static func _current() -> String:
	return RunStateData.instance.mutation if RunStateData.instance else ""
