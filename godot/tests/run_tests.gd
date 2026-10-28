extends SceneTree

var tests := 0
var failures := 0

const TEST_PATHS := [
	"res://tests/test_coords.gd",
	"res://tests/test_path_graph.gd",
	"res://tests/test_autoloads.gd",
	"res://tests/test_walker.gd",
	"res://tests/test_wave.gd",
	"res://tests/test_placement.gd",
	"res://tests/test_tower_che.gd",
	"res://tests/test_run_controller.gd",
	"res://tests/test_ui_layout.gd",
	"res://tests/test_texture_util.gd",
	"res://tests/test_tower_pao.gd",
	"res://tests/test_tower_ma.gd",
	"res://tests/test_card_picker.gd",
	"res://tests/test_tower_menu.gd",
	"res://tests/test_weather.gd",
	"res://tests/test_run_state.gd",
	"res://tests/test_trait_pool.gd",
	"res://tests/test_card_picker_traits.gd",
	"res://tests/test_endless.gd",
	"res://tests/test_traits_effects.gd",
	"res://tests/test_mutation.gd",
	"res://tests/test_elite.gd",
	"res://tests/test_r2_traits.gd",
	"res://tests/test_combo.gd",
	"res://tests/test_leaderboard.gd",
	"res://tests/test_merge.gd",
	"res://tests/test_weather_buff.gd",
	"res://tests/test_equipment.gd",
	"res://tests/test_equipment_stats.gd",
]


func _initialize() -> void:
	for path in TEST_PATHS:
		var script = load(path)
		if script == null or not script.can_instantiate():
			_fail("failed to load " + path)
			continue
		var instance = script.new()
		if instance.has_method("run"):
			instance.run(self)
		else:
			_fail(path + " has no run(t)")
	print("TESTS: %d, FAILURES: %d" % [tests, failures])
	quit(0 if failures == 0 else 1)


func eq(actual, expected, msg: String) -> void:
	tests += 1
	if actual != expected:
		failures += 1
		printerr("FAIL: %s (expected %s, got %s)" % [msg, expected, actual])


func approx(a: float, b: float, eps: float, msg: String) -> void:
	tests += 1
	if absf(a - b) > eps:
		failures += 1
		printerr("FAIL: %s (expected %f, got %f)" % [msg, b, a])


func approx_v(a: Vector2, b: Vector2, eps: float, msg: String) -> void:
	tests += 1
	if a.distance_to(b) > eps:
		failures += 1
		printerr("FAIL: %s (expected %s, got %s)" % [msg, b, a])


func check(cond: bool, msg: String) -> void:
	tests += 1
	if not cond:
		failures += 1
		printerr("FAIL: " + msg)


func _fail(msg: String) -> void:
	tests += 1
	failures += 1
	printerr("FAIL: " + msg)
