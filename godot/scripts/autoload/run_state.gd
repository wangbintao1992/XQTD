class_name RunStateData
extends Node

## 本局肉鸽状态：已获得词条、波次。重开/返回首页时 reset。
## 作为 Autoload 名 `RunState` 挂到 /root；测试里直接 new()。

signal traits_changed
signal mutation_changed

static var instance: RunStateData

var traits: Array[String] = []
var mutation := ""
var wave := 1


func _init() -> void:
	instance = self


func _exit_tree() -> void:
	if instance == self:
		instance = null


func reset() -> void:
	traits.clear()
	mutation = ""
	wave = 1
	traits_changed.emit()
	mutation_changed.emit()


func add_trait(id: String) -> bool:
	if id == "" or traits.has(id):
		return false
	if not TraitPool.TRAITS.has(id):
		return false
	traits.append(id)
	traits_changed.emit()
	return true


func has_trait(id: String) -> bool:
	return traits.has(id)


func set_mutation(id: String) -> void:
	if mutation == id:
		return
	mutation = id
	mutation_changed.emit()


static func has(id: String) -> bool:
	return instance != null and instance.traits.has(id)

