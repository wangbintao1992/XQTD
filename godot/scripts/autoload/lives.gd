extends Node

## 基地生命：敌人到终点按它的 life_cost 扣；归零发 game_over。

signal changed(value: int)
signal game_over

const INITIAL_LIVES := 20

var value := INITIAL_LIVES
var is_game_over := false


func _ready() -> void:
	reset()


func reset() -> void:
	value = INITIAL_LIVES
	is_game_over = false
	changed.emit(value)


func lose(amount: int) -> void:
	var n := maxi(0, amount)
	if is_game_over or n <= 0:
		return
	value = maxi(0, value - n)
	changed.emit(value)
	if value <= 0:
		is_game_over = true
		game_over.emit()
