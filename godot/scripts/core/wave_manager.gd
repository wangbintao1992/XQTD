class_name WaveManager
extends Node

## 波次：开局 deploy 第一波；本轮清空 → 3 秒倒计时 → 下一波。
## M1 不接选卡；M2 在清空后先弹 CardPicker。

signal wave_changed(wave: int)
signal progress_changed(p: float)

var enemies_per_round := 100
var max_wave := 5
var round_gap := 3.0
var pick_time := 10.0
@export var endless := false
@export var base_round := 20
@export var count_growth := 1.15
@export var hp_growth := 1.1
@export var speed_growth := 1.02

var wave := 1
var counting := false
var countdown := 0.0
var picking := false

var spawner
var picker
var session: Object
var lives: Object


func _ready() -> void:
	if session == null:
		session = get_node_or_null("/root/GameSession")
	if lives == null:
		lives = get_node_or_null("/root/Lives")


func setup(
	spawner_,
	picker_ = null,
	session_: Object = null,
	lives_: Object = null
) -> void:
	spawner = spawner_
	if picker_:
		picker = picker_
	if session_:
		session = session_
	if lives_:
		lives = lives_


func reset() -> void:
	if picker and picker.has_method("close"):
		picker.close()
	picking = false
	wave = 1
	if RunStateData.instance:
		RunStateData.instance.wave = 1
	counting = false
	countdown = 0.0
	wave_changed.emit(wave)
	_emit_progress()


func start_run() -> void:
	reset()
	_apply_wave_scaling()
	if spawner:
		spawner.deploy()
	_emit_progress()


func _apply_wave_scaling() -> void:
	if spawner == null:
		return
	if endless:
		if wave % 10 == 0:
			if RunStateData.instance:
				RunStateData.instance.set_mutation(MutationPool.pick())
				var toast = get_node_or_null("/root/Toast")
				if toast:
					toast.show("棋局异变：" + MutationPool.title(RunStateData.instance.mutation))
		if wave % 5 == 0 and spawner.has_method("set_elite"):
			var elites = preload("res://scripts/data/enemy_kinds.gd").ELITES
			spawner.set_elite(elites[randi() % elites.size()])
			var toast2 = get_node_or_null("/root/Toast")
			if toast2:
				toast2.show("精英来袭")
		elif spawner.has_method("clear_elite"):
			spawner.clear_elite()
		spawner.enemy_count = maxi(1, int(round(float(base_round) * pow(count_growth, wave - 1))))
		spawner.hp_mult = pow(hp_growth, wave - 1) * MutationPool.enemy_hp_mult()
		spawner.speed_mult = pow(speed_growth, floor((wave - 1) / 5.0)) * MutationPool.enemy_speed_mult()
	else:
		spawner.enemy_count = enemies_per_round


func progress_with(total: int, alive: int) -> float:
	if endless:
		if total > 0:
			return clampf(float(total - alive) / float(total), 0.0, 1.0)
		return 0.0
	var per := 1.0 / float(maxi(1, max_wave))
	var done := float(wave - 1)
	var inside := 0.0
	if total > 0:
		inside = clampf(float(total - alive) / float(total), 0.0, 1.0)
	return minf(1.0, (done + inside) * per)


func _process(delta: float) -> void:
	if session and not session.started:
		return
	if lives and lives.is_game_over:
		return
	if spawner == null:
		return
	if picking:
		return

	if counting:
		countdown -= delta
		if countdown <= 0.0:
			counting = false
			wave = (wave + 1) if endless else mini(max_wave, wave + 1)
			if RunStateData.instance:
				RunStateData.instance.wave = wave
			_apply_wave_scaling()
			spawner.deploy()
			wave_changed.emit(wave)
		_emit_progress()
		return

	if spawner.total_count() >= spawner.enemy_count and spawner.alive_count() <= 0:
		if picker:
			picking = true
			var owned = RunStateData.instance.traits if RunStateData.instance else []
			var ids = TraitPool.pick_three(owned)
			if picker.has_method("open_with_traits"):
				picker.open_with_traits(ids, pick_time, func(): _on_pick_done())
			elif picker.has_method("open_with_timeout"):
				picker.open_with_timeout(pick_time, func(): _on_pick_done())
			else:
				_on_pick_done()
		else:
			counting = true
			countdown = round_gap
	_emit_progress()


func _on_pick_done() -> void:
	picking = false
	var id := ""
	if picker:
		var v = picker.get("selected_trait")
		if v != null:
			id = str(v)
	if id != "":
		var added := false
		if RunStateData.instance:
			added = RunStateData.instance.add_trait(id)
		if added:
			TraitPool.apply_on_pick(id)
	counting = true
	countdown = round_gap


func _emit_progress() -> void:
	var total := 0
	var alive := 0
	if spawner:
		total = spawner.total_count()
		alive = spawner.alive_count()
	progress_changed.emit(progress_with(total, alive))
