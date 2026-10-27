extends Node

## 全局「是否已开局」开关：首页未点「无尽模式」前，出兵/走位/波次全部停摆。

var started := false


func start() -> void:
	started = true


func reset() -> void:
	started = false
