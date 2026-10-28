class_name LeaderboardData
extends Node

## 最高波数排行榜桩：本地只增不减；真正后端 BattleReport/ZSet 留后续。

signal best_changed(value: int)

static var instance: LeaderboardData

var best_wave := 0


func _init() -> void:
	instance = self


func _exit_tree() -> void:
	if instance == self:
		instance = null


func submit(wave: int) -> bool:
	var w := maxi(0, wave)
	if w <= best_wave:
		return false
	best_wave = w
	best_changed.emit(best_wave)
	return true


func reset_for_test() -> void:
	best_wave = 0
