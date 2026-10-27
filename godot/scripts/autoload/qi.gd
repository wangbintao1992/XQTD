extends Node

## 棋气：放塔消耗、击杀获得。

signal changed(value: int)

const INITIAL_QI := 100

var value := INITIAL_QI


func _ready() -> void:
	reset()


func reset() -> void:
	value = INITIAL_QI
	changed.emit(value)


func set_qi(v: int) -> void:
	value = maxi(0, v)
	changed.emit(value)


func can_afford(cost: int) -> bool:
	return value >= maxi(0, cost)


func spend(cost: int) -> bool:
	var c := maxi(0, cost)
	if not can_afford(c):
		return false
	value -= c
	changed.emit(value)
	return true


func earn(amount: int) -> void:
	var a := maxi(0, amount)
	if a <= 0:
		return
	value += a
	changed.emit(value)
