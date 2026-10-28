class_name Hud
extends CanvasLayer

## M1 HUD：棋气、生命、波次、进度条、倒计时提示。

@onready var qi_label: Label = $Root/QiLabel
@onready var lives_label: Label = $Root/LivesLabel
@onready var wave_label: Label = $Root/WaveText
@onready var tip_label: Label = $Root/RoundTip
@onready var progress: ProgressBar = $Root/ProgressBar
@onready var trait_label: Label = $Root/TraitLabel
@onready var mutation_label: Label = $Root/MutationLabel


func _ready() -> void:
	var font := UiFont.make()
	for label in [qi_label, lives_label, wave_label, tip_label, trait_label, mutation_label]:
		label.add_theme_font_override("font", font)

	set_qi(100)
	set_lives(20)
	set_wave(1, 5)
	set_progress(0.0)
	set_tip("")

	if RunStateData.instance:
		RunStateData.instance.traits_changed.connect(_refresh_traits)
		RunStateData.instance.mutation_changed.connect(_refresh_mutation)
		_refresh_traits()
		_refresh_mutation()
	else:
		set_traits([])
		set_mutation("")

	var qi = get_node_or_null("/root/Qi")
	if qi:
		qi.changed.connect(set_qi)
		set_qi(int(qi.value))

	var lives = get_node_or_null("/root/Lives")
	if lives:
		lives.changed.connect(set_lives)
		set_lives(int(lives.value))


func set_qi(v: int) -> void:
	qi_label.text = "棋气 %d" % v


func set_lives(v: int) -> void:
	lives_label.text = "生命 %d" % v


func set_wave(w: int, max_wave: int) -> void:
	if max_wave <= 0:
		wave_label.text = "波次 %d" % w
	else:
		wave_label.text = "波次 %d/%d" % [w, max_wave]


func set_progress(p: float) -> void:
	progress.value = clampf(p, 0.0, 1.0) * 100.0


func set_tip(text: String) -> void:
	tip_label.text = text
	tip_label.visible = text != ""


func _refresh_traits() -> void:
	set_traits(RunStateData.instance.traits if RunStateData.instance else [])


func set_traits(traits: Array) -> void:
	if traits.is_empty():
		trait_label.text = "词条：—"
		return
	var lines: Array[String] = ["词条："]
	for id in traits:
		lines.append("· " + TraitPool.title(str(id)))
	trait_label.text = "\n".join(lines)


func _refresh_mutation() -> void:
	set_mutation(RunStateData.instance.mutation if RunStateData.instance else "")


func set_mutation(id: String) -> void:
	if id == "":
		mutation_label.text = "异变：—"
		return
	mutation_label.text = "异变：" + MutationPool.title(id) + "\n" + MutationPool.desc(id)
