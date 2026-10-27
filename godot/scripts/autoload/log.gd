extends Node

## 统一日志开关。M1 开发期默认开，发布前关掉。

var debug_enabled := true


func info(msg: String) -> void:
	if debug_enabled:
		print("[XQTD] ", msg)


func warn(msg: String) -> void:
	if debug_enabled:
		push_warning("[XQTD] " + msg)
