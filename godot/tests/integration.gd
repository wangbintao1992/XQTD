extends Node

## 集成冒烟：开局 → 出兵 → 真实选词条链路走 9 波到第 10 波 → 异变/精英生效 → 放塔/菜单/卖出 → 天气 → 结束 → 重开。

func _ready() -> void:
	var main = load("res://scenes/main.tscn").instantiate()
	add_child(main)
	await get_tree().process_frame

	var equip_mgr = EquipmentManagerData.instance
	if equip_mgr:
		equip_mgr.persistence_enabled = false
		equip_mgr.reset_for_test()

	var leaderboard = LeaderboardData.instance
	if leaderboard:
		leaderboard.reset_for_test()

	var rc = main.get_node_or_null("RunController")
	if rc == null:
		printerr("INTEGRATION: no RunController")
		get_tree().quit(1)
		return

	rc.start_new_run()
	for _i in 150:
		await get_tree().process_frame

	var enemies = main.get_node_or_null("Enemies")
	var count: int = enemies.get_child_count() if enemies else -1
	print("INTEGRATION enemies=", count)

	var wave = main.get_node_or_null("WaveManager")
	var spawner = main.get_node_or_null("PathSpawner")
	var card_picker = main.get_node_or_null("CardPicker")
	var placement = main.get_node_or_null("TowerPlacement")

	Qi.earn(300)
	var spot = placement.resolve_drop(Vector2(-200, 100)) if placement else null
	var che = placement.place(load("res://scenes/towers/tower_che.tscn"), spot) if spot != null else null
	var initial_range: float = che.attack_range if che else 0.0
	print("INTEGRATION towers=", che != null)

	# 真实选词条链路：清波 → 选卡 → 下一波，连续 9 次到第 10 波
	var elite_ok := false
	for i in 9:
		spawner.debug_finish_wave()
		wave._process(0.0)
		if card_picker.is_picking:
			if i == 0:
				card_picker.options[0] = "range_plus"
			card_picker.pick(0)
			card_picker._process(0.5)
		wave._process(3.1)
		if wave.wave == 5 and not elite_ok:
			spawner._process(0.6)
			if enemies.get_child_count() > 0:
				var elite_enemy = enemies.get_child(0)
				elite_ok = bool(elite_enemy.kind.get("elite", false))
				if elite_ok:
					var before_traits: int = RunStateData.instance.traits.size()
					var before_eq: int = equip_mgr.inventory.size() if equip_mgr else 0
					var ability_ok: bool = elite_enemy.elite_type != ""
					if elite_enemy.elite_type == "che" or elite_enemy.elite_type == "pao":
						elite_enemy._use_elite_ability()
						var stunned := false
						for tw in main.get_node("Towers").get_children():
							if tw.has_method("tick_stun") and tw.stun_timer > 0.0:
								stunned = true
								tw.stun_timer = 0.0
								tw.modulate = Color.WHITE
						ability_ok = ability_ok and stunned
					elite_ok = elite_ok and ability_ok
					elite_enemy.take_damage(999999)
					elite_ok = elite_ok and RunStateData.instance.traits.size() > before_traits
					if equip_mgr:
						elite_ok = elite_ok and equip_mgr.inventory.size() > before_eq

	# R7 确定性覆盖三种精英技能（wave 精英类型随机，不依赖它）
	var ability_all_ok := true
	var probe_towers := Node2D.new()
	main.add_child(probe_towers)
	var probe_near = preload("res://scenes/towers/tower_che.tscn").instantiate()
	probe_near.auto_fire = false
	probe_towers.add_child(probe_near)
	var probe_far = preload("res://scenes/towers/tower_che.tscn").instantiate()
	probe_far.auto_fire = false
	probe_far.position = Vector2(400, 0)
	probe_towers.add_child(probe_far)
	var probe_graph = preload("res://scripts/core/path_graph.gd").new()
	for type_name in ["ma", "che", "pao"]:
		var probe_kind: Dictionary = {}
		for kind in EnemyKinds.ELITES:
			if str(kind.get("elite_type", "")) == type_name:
				probe_kind = kind
		var probe_enemy = preload("res://scenes/enemy.tscn").instantiate()
		probe_enemy.setup(probe_kind, probe_graph, 0, 1, 0.0)
		probe_enemy.towers_root = probe_towers
		main.add_child(probe_enemy)
		probe_enemy.position = Vector2.ZERO
		probe_near.stun_timer = 0.0
		probe_far.stun_timer = 0.0
		probe_near.modulate = Color.WHITE
		probe_far.modulate = Color.WHITE
		probe_enemy._use_elite_ability()
		if type_name == "ma":
			ability_all_ok = ability_all_ok \
				and probe_enemy.get_node("HitPause").immune \
				and not probe_near.is_stunned and not probe_far.is_stunned
		elif type_name == "che":
			ability_all_ok = ability_all_ok and probe_near.is_stunned and not probe_far.is_stunned
		else:
			ability_all_ok = ability_all_ok and probe_far.is_stunned and not probe_near.is_stunned
		probe_enemy.free()
	probe_towers.free()
	print("INTEGRATION elite_abilities=", ability_all_ok)

	var expected_range: float = initial_range * 1.25 * MutationPool.tower_range_mult("che")
	var pipeline_ok: bool = RunStateData.has("range_plus") \
		and che != null and absf(che.attack_range - expected_range) < 0.5
	var endless_ok: bool = wave != null and wave.wave >= 10

	var merge_ok := false
	if che and placement:
		var before_range: float = che.attack_range
		var che_screen: Vector2 = che.global_position
		placement.begin_drag(load("res://scenes/towers/tower_che.tscn"), 50,
			load("res://art/qz/b_che.png"), che_screen, "che")
		var mev := InputEventMouseButton.new()
		mev.button_index = MOUSE_BUTTON_LEFT
		mev.pressed = false
		mev.position = che_screen
		placement._input(mev)
		merge_ok = che.level == 2 and che.attack_range > before_range
	print("INTEGRATION merge=", merge_ok)
	print("INTEGRATION pipeline=", pipeline_ok, " endless=", endless_ok, " wave=", wave.wave, " elite=", elite_ok)

	var rs_ok: bool = RunStateData.instance != null and RunStateData.has("range_plus")
	print("INTEGRATION traits=", rs_ok)

	var hud = main.get_node_or_null("HUD")
	var hud_ok: bool = hud != null and hud.trait_label.text.find(TraitPool.title("range_plus")) >= 0
	var mutation_ok: bool = RunStateData.instance != null \
		and RunStateData.instance.mutation != "" \
		and hud != null and hud.mutation_label.text != "异变：—"
	print("INTEGRATION hud_traits=", hud_ok, " mutation=", mutation_ok)

	var pao = placement.place(load("res://scenes/towers/tower_pao.tscn"), spot) if spot != null else null
	var ma = placement.place(load("res://scenes/towers/tower_ma.tscn"), spot) if spot != null else null
	print("INTEGRATION all_towers=", che != null and pao != null and ma != null)

	var terrain = main.get_node_or_null("Terrain")
	var terrain_ok: bool = terrain != null \
		and terrain.type_at(Coords.to_screen(Vector2(-200, 203) * Coords.PATH_IMAGE_SCALE)) == "river" \
		and terrain.get_child_count() >= TerrainSystem.ZONES.size() * 2
	print("INTEGRATION terrain=", terrain_ok)

	var combo = main.get_node_or_null("ComboSystem")
	var combo_ok := false
	if combo and combo.check_combos().has("ma_pao"):
		var g = preload("res://scripts/core/path_graph.gd").new()
		var dummy = preload("res://scenes/enemy.tscn").instantiate()
		dummy.setup(EnemyKinds.KINDS[0], g, 0, 1, 0.0)
		enemies.add_child(dummy)
		dummy.position = Vector2(ma.position.x, ma.position.y + 200)
		dummy.walker.set_process(false)
		combo_ok = combo.try_trigger() == "ma_pao"
	print("INTEGRATION combo=", combo_ok)

	var menu = main.get_node_or_null("TowerActionMenu")
	if pao:
		pao.clicked.emit(pao)
	var menu_ok: bool = menu != null and menu.is_open
	print("INTEGRATION menu=", menu_ok)

	var before_qi: int = Qi.value
	if menu and pao:
		menu.sell(pao)
	var sell_ok: bool = pao != null and pao.get_parent() == null and Qi.value == before_qi + 40
	print("INTEGRATION sell=", sell_ok)

	var weather = main.get_node_or_null("Weather")
	if weather:
		weather.set_weather("rain")
	var weather_ok: bool = weather != null and weather.layers["rain"][0].visible
	var weather_buff_ok := false
	if weather:
		var before_weather_range: float = che.attack_range if che else 0.0
		weather.set_weather("snow")
		weather_buff_ok = che != null \
			and absf(che.attack_range - before_weather_range * 0.9) < 0.5 \
			and hud != null and hud.weather_label.text.find("雪") >= 0
	print("INTEGRATION weather=", weather_ok, " weather_buff=", weather_buff_ok)

	var picked := [0]
	if card_picker:
		card_picker.open_with_timeout(0.05, func(): picked[0] += 1)
		card_picker._process(0.1)
		card_picker._process(0.5)
	print("INTEGRATION picker=", picked[0] == 1)

	var equipment_ok := false
	var panel_ok := false
	var equipped_slot := ""
	if equip_mgr:
		equip_mgr.reset_for_test()
		var before_damage: float = che.damage_exact if che else 0.0
		equip_mgr.inventory.append({
			"slot": "head", "quality": "orange",
			"affixes": [{"type": "damage", "value": 0.3}],
		})
		equip_mgr.equip(0)
		equipped_slot = "head"
		equipment_ok = che != null \
			and absf(che.damage_exact - before_damage * 1.3) < 0.01
	var equip_panel = main.get_node_or_null("EquipmentPanel")
	if equip_panel:
		equip_panel.show_panel()
		panel_ok = equip_panel.is_open
		equip_panel.hide_panel()
	print("INTEGRATION equipment=", equipment_ok, " panel=", panel_ok)

	var final_wave: int = RunStateData.instance.wave
	Lives.lose(100)
	await get_tree().process_frame
	var game_over = main.get_node_or_null("GameOver")
	var over_ok: bool = game_over != null and game_over.visible \
		and main.get_node("Enemies").process_mode == Node.PROCESS_MODE_DISABLED
	print("INTEGRATION gameover=", over_ok)

	var best_ok: bool = LeaderboardData.instance != null \
		and LeaderboardData.instance.best_wave == final_wave \
		and hud != null and hud.best_label.text == "最高波数 %d" % final_wave
	print("INTEGRATION best=", best_ok)

	var leaderboard_panel = main.get_node_or_null("LeaderboardPanel")
	var leaderboard_panel_ok := false
	if leaderboard_panel and leaderboard:
		leaderboard.top_entries = [
			{"rank": 1, "playerId": leaderboard.player_id, "name": "我", "wave": final_wave},
		]
		leaderboard.my_rank = 1
		leaderboard_panel.show_panel()
		leaderboard_panel.refresh()
		leaderboard_panel_ok = leaderboard_panel.is_open \
			and leaderboard_panel._list.get_child_count() == 1 \
			and leaderboard_panel._status_label.text.contains("离线")
		leaderboard_panel.hide_panel()
		leaderboard_panel_ok = leaderboard_panel_ok and not leaderboard_panel.is_open
	print("INTEGRATION leaderboard_panel=", leaderboard_panel_ok)

	rc.start_new_run()
	await get_tree().process_frame
	var weather_reset_ok: bool = WeatherSystem.instance != null \
		and WeatherSystem.instance.current_weather == "rain" \
		and hud != null and hud.weather_label.text == "天气：雨"
	var reset_ok: bool = game_over != null and not game_over.visible \
		and Qi.value == 100 and Lives.value == 20 \
		and main.get_node("Towers").get_child_count() == 0 \
		and RunStateData.instance != null and RunStateData.instance.traits.size() == 0 \
		and RunStateData.instance.mutation == "" \
		and hud != null and hud.mutation_label.text == "异变：—" \
		and weather_reset_ok
	var best_kept: bool = LeaderboardData.instance != null \
		and LeaderboardData.instance.best_wave == final_wave \
		and hud != null and hud.best_label.text == "最高波数 %d" % final_wave
	var equip_kept: bool = equip_mgr != null and equipped_slot != "" \
		and not equip_mgr.equipped[equipped_slot].is_empty()
	print("INTEGRATION reset=", reset_ok, " best_kept=", best_kept, " equip_kept=", equip_kept)

	var ok: bool = count > 0 and pipeline_ok and endless_ok and elite_ok and mutation_ok \
		and rs_ok and hud_ok and merge_ok and menu_ok and sell_ok \
		and weather_ok and weather_buff_ok \
		and picked[0] == 1 and over_ok and best_ok and reset_ok and best_kept \
		and equipment_ok and panel_ok and equip_kept and terrain_ok and ability_all_ok \
		and leaderboard_panel_ok
	get_tree().quit(0 if ok else 1)
