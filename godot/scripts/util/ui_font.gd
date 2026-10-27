class_name UiFont
extends RefCounted

## 统一的中文字体：优先系统里常见的 CJK 族，找不到再退回 sans-serif。

static func make() -> SystemFont:
	var f := SystemFont.new()
	f.font_names = PackedStringArray([
		"Noto Sans CJK SC",
		"Microsoft YaHei",
		"PingFang SC",
		"WenQuanYi Micro Hei",
		"sans-serif",
	])
	return f
