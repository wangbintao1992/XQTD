class_name InkFx
extends RefCounted

## 墨刃正片叠底：等价 Cocos 的 DST_COLOR + ONE_MINUS_SRC_ALPHA。
## 用 alpha-aware shader，而不是 CanvasItemMaterial.BLEND_MODE_MUL，
## 后者是 DST_COLOR + ZERO，会把透明区乘黑、让 modulate.a 淡出失效。

const SHADER := preload("res://shaders/ink_multiply.gdshader")

static var multiply_enabled := true

static var _material: ShaderMaterial
static var _applied: Array[WeakRef] = []


static func _static_init() -> void:
	multiply_enabled = bool(ProjectSettings.get_setting("xqtd/ink_multiply", true))


static func material() -> ShaderMaterial:
	if _material == null:
		_material = ShaderMaterial.new()
		_material.shader = SHADER
	return _material


static func enabled() -> bool:
	return multiply_enabled


static func set_enabled(value: bool) -> void:
	multiply_enabled = value
	for ref in _applied:
		var node = ref.get_ref()
		if node == null or not is_instance_valid(node):
			continue
		node.material = material() if value else null


static func apply(node: CanvasItem) -> ShaderMaterial:
	if node == null:
		return null
	if not multiply_enabled:
		node.material = null
		return null
	node.material = material()
	node.set_meta("ink_fx", true)
	_applied.append(weakref(node))
	if _applied.size() > 256:
		_applied = _applied.filter(func(ref): return ref.get_ref() != null)
	return material()
