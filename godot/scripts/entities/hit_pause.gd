class_name HitPause
extends Node

## 受击暂停：攻击方 request_pause()，走位每帧读 is_paused。

var pause_time := 0.12
var remaining := 0.0
var immune := false


var is_paused: bool:
	get:
		return remaining > 0.0


func request_pause(seconds: float = -1.0) -> void:
	if immune:
		return
	var t := pause_time if seconds < 0.0 else seconds
	if t <= 0.0:
		return
	remaining = maxf(remaining, t)


func clear() -> void:
	remaining = 0.0


func _process(delta: float) -> void:
	if remaining > 0.0:
		remaining = maxf(0.0, remaining - delta)
