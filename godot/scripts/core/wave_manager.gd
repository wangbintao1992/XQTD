class_name WaveManager
extends Node

## 波次：开局 deploy 第一波；本轮清空 → 3 秒倒计时 → 下一波。
## M1 不接选卡；M2 在清空后先弹 CardPicker。

signal wave_changed(wave: int)
signal progress_changed(p: float)

var enemies_per_round := 100
var max_wave := 5
var round_gap := 3.0

var wave := 1
var counting := false
var countdown := 0.0

var spawner: PathSpawner
var picker: Node
var session: Object
var lives: Object


func _ready() -> void:
	if session == null:
		session = get_node_or_null("/root/GameSession")
	if lives == null:
		lives = get_node_or_null("/root/Lives")


func setup(
	spawner_: PathSpawner,
	picker_: Node = null,
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
	wave = 1
	counting = false
	countdown = 0.0
	wave_changed.emit(wave)
	_emit_progress()


func start_run() -> void:
	reset()
	if spawner:
		spawner.enemy_count = enemies_per_round
		spawner.deploy()
	_emit_progress()


func progress_with(total: int, alive: int) -> float:
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

	if counting:
		countdown -= delta
		if countdown <= 0.0:
			counting = false
			wave = mini(max_wave, wave + 1)
			spawner.enemy_count = enemies_per_round
			spawner.deploy()
			wave_changed.emit(wave)
		_emit_progress()
		return

	if spawner.total_count() > 0 and spawner.alive_count() <= 0:
		counting = true
		countdown = round_gap
	_emit_progress()


func _emit_progress() -> void:
	var total := 0
	var alive := 0
	if spawner:
		total = spawner.total_count()
		alive = spawner.alive_count()
	progress_changed.emit(progress_with(total, alive))
