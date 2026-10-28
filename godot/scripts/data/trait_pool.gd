class_name TraitPool
extends RefCounted

## R1 词条池。id 与 Tower/PathSpawner/TowerPlacement 里的判断保持一致。

const TRAITS := {
	"free_horse": {
		"title": "无蹩腿马",
		"desc": "马不再被蹩腿，自由跳杀",
	},
	"free_cannon": {
		"title": "无炮架炮",
		"desc": "炮无需炮架，直射伤害 3",
	},
	"double_chariot": {
		"title": "双车碾压",
		"desc": "车的伤害翻倍",
	},
	"range_plus": {
		"title": "杀招范围扩大",
		"desc": "所有塔射程 +25%",
	},
	"cooldown_halve": {
		"title": "冷却减半",
		"desc": "所有塔攻击间隔 -25%",
	},
	"free_place": {
		"title": "放置免棋气",
		"desc": "本局放塔不消耗棋气",
	},
	"qi_boost": {
		"title": "击杀棋气 +50%",
		"desc": "击杀红棋获得的棋气提升",
	},
	"qi_gift": {
		"title": "天降棋气",
		"desc": "立即获得 100 棋气",
	},
	"kumou": {
		"title": "苦肉计",
		"desc": "牺牲 5 点生命，全体塔伤害 +50%",
	},
	"splash_hit": {
		"title": "连环溅射",
		"desc": "攻击附带 30% 范围溅射",
	},
	"meiren": {
		"title": "美人计",
		"desc": "每 6 秒让一个敌人停顿 1.5 秒",
	},
	"slow_on_kill": {
		"title": "绝杀减速",
		"desc": "击杀敌人后全体减速 2 秒",
	},
}


static func ids() -> Array:
	return TRAITS.keys()


static func title(id: String) -> String:
	var data: Dictionary = TRAITS.get(id, {})
	return str(data.get("title", id))


static func desc(id: String) -> String:
	var data: Dictionary = TRAITS.get(id, {})
	return str(data.get("desc", ""))


static func pick_one(owned: Array, excluded: Array = []) -> String:
	var available: Array = []
	for id in TRAITS.keys():
		if not owned.has(id) and not excluded.has(id):
			available.append(id)
	if available.is_empty():
		return ""
	return available[randi() % available.size()]


static func pick_three(owned: Array) -> Array:
	var available: Array = []
	for id in TRAITS.keys():
		if not owned.has(id):
			available.append(id)
	if available.size() < 3:
		available = TRAITS.keys().duplicate()
	available.shuffle()
	return available.slice(0, 3)


static func apply_on_pick(id: String) -> void:
	var loop := Engine.get_main_loop()
	if loop == null or not (loop is SceneTree):
		return
	var root: Node = (loop as SceneTree).root
	if root == null:
		return

	if id == "qi_gift":
		var qi = root.get_node_or_null("Qi")
		if qi:
			qi.earn(100)
	elif id == "kumou":
		var lives = root.get_node_or_null("Lives")
		if lives:
			lives.lose(5)
