class_name HomeMenu
extends CanvasLayer

## 首页：无尽模式开始游戏，闯关模式占位。

signal endless_pressed

@onready var btn_endless: TextureButton = $Root/BtnEndless
@onready var btn_level: TextureButton = $Root/BtnLevel
@onready var label_endless: Label = $Root/BtnEndless/Label
@onready var label_level: Label = $Root/BtnLevel/Label


func _ready() -> void:
	var font := UiFont.make()
	for label in [label_endless, label_level]:
		label.add_theme_font_override("font", font)
	btn_endless.pressed.connect(_on_endless)
	btn_level.pressed.connect(_on_level)
	show_menu()


func show_menu() -> void:
	visible = true


func hide_menu() -> void:
	visible = false


func _on_endless() -> void:
	endless_pressed.emit()


func _on_level() -> void:
	Toast.show("闯关模式 敬请期待")
