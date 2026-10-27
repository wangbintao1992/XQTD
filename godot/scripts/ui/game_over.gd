class_name GameOver
extends CanvasLayer

## 生命归零的结束面板：返回首页 / 重试 / 看广告（占位）。

signal retry_pressed
signal home_pressed

@onready var title: Label = $Root/Panel/Title
@onready var message: Label = $Root/Panel/Message
@onready var btn_home: Button = $Root/Panel/BtnHome
@onready var btn_retry: Button = $Root/Panel/BtnRetry
@onready var btn_ad: Button = $Root/Panel/BtnAd


func _ready() -> void:
	var font := UiFont.make()
	for label in [title, message, btn_home, btn_retry, btn_ad]:
		label.add_theme_font_override("font", font)
	btn_home.pressed.connect(func(): home_pressed.emit())
	btn_retry.pressed.connect(func(): retry_pressed.emit())
	btn_ad.pressed.connect(func(): Toast.show("暂无广告"))
	hide_popup()


func show_popup() -> void:
	visible = true


func hide_popup() -> void:
	visible = false
