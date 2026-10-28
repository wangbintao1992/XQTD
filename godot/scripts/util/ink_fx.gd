class_name InkFx
extends RefCounted

## 墨刃正片叠底：Cocos 的「墨叠纸变浓」效果。
## 关闭 multiply_enabled 即可退回普通 alpha，作为兼容回退。

static var multiply_enabled := true

static var _material: CanvasItemMaterial


static func material() -> CanvasItemMaterial:
	if _material == null:
		_material = CanvasItemMaterial.new()
		_material.blend_mode = CanvasItemMaterial.BLEND_MODE_MUL
	return _material


static func apply(node: CanvasItem) -> CanvasItemMaterial:
	if node == null or not multiply_enabled:
		return null
	var mat := material()
	node.material = mat
	return mat
