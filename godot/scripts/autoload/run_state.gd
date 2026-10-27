class_name RunStateData
extends Node

## 本局肉鸽状态：已获得词条、波次。重开/返回首页时 reset。
## 作为 Autoload 名 `RunState` 挂到 /root；测试里直接 new()。

signal traits_changed

static var instance: RunStateData

var traits: Array[String] = []
var wave := 1


func _init() -> void:
	instance = self


func _exit_tree() -> void:
	if instance == self:
		instance = null


func reset() -> void:
	traits.clear()
	wave = 1
	traits_changed.emit()


func add_trait(id: String) -> void:
	if id == "" or traits.has(id):
		return
	traits.append(id)
	traits_changed.emit()


func has_trait(id: String) -> bool:
	return traits.has(id)


static func has(id: String) -> bool:
	return instance != null and instance.traits.has(id)


static func count() -> int:
	return instance.traits.size() if instance else 0
