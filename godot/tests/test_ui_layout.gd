extends RefCounted


func run(t) -> void:
	var home = preload("res://scenes/ui/home_menu.tscn").instantiate()
	t.root.add_child(home)
	var b1 = home.get_node("Root/BtnEndless") as Control
	var b2 = home.get_node("Root/BtnLevel") as Control
	t.eq(b1.size, Vector2(300, 108), "endless button 300x108")
	t.eq(b2.size, Vector2(300, 108), "level button 300x108")
	t.check(b1.get_global_rect().end.x <= 1280.0 and b1.get_global_rect().end.y <= 720.0, "endless on screen")
	t.check(b2.get_global_rect().end.x <= 1280.0 and b2.get_global_rect().end.y <= 720.0, "level on screen")
	home.free()

	var hud = preload("res://scenes/ui/hud.tscn").instantiate()
	var sidebar = preload("res://scenes/ui/sidebar.tscn").instantiate()
	t.root.add_child(hud)
	t.root.add_child(sidebar)
	t.check(hud.layer > sidebar.layer, "hud above sidebar")
	var trait_label = hud.get_node("Root/TraitLabel") as Control
	var mutation_label = hud.get_node("Root/MutationLabel") as Control
	t.check(mutation_label.offset_top >= trait_label.offset_bottom, "mutation below traits")
	var card = sidebar.get_node("Panel/CardChe") as Control
	if not card.is_node_ready():
		card._ready()
	var icon = card.get_node("Icon") as TextureRect
	t.check(icon.texture is AtlasTexture, "sidebar icon trimmed")

	hud._style_progress_bar()
	var bar = hud.get_node("Root/ProgressBar") as ProgressBar
	t.eq(bar.offset_top, 649.0, "wave bar y")
	t.eq(bar.offset_bottom - bar.offset_top, 7.0, "wave bar thickness")
	var fill_style = bar.get_theme_stylebox("fill")
	var track_style = bar.get_theme_stylebox("background")
	t.check(fill_style is StyleBoxFlat, "wave bar fill style")
	t.check(track_style is StyleBoxFlat, "wave bar track style")
	if fill_style is StyleBoxFlat:
		t.approx(fill_style.bg_color.r, 178.0 / 255.0, 0.001, "fill red")
		t.approx(fill_style.bg_color.g, 58.0 / 255.0, 0.001, "fill green")
		t.approx(fill_style.bg_color.a, 235.0 / 255.0, 0.001, "fill alpha")
	if track_style is StyleBoxFlat:
		t.approx(track_style.bg_color.a, 120.0 / 255.0, 0.001, "track alpha")

	var stage = hud.get_node("Root/Stage") as Control
	t.approx((stage.offset_top + stage.offset_bottom) * 0.5, 148.0, 0.1, "stage y")
	var wave_text = hud.get_node("Root/WaveText") as Control
	t.approx((wave_text.offset_top + wave_text.offset_bottom) * 0.5, 698.0, 0.1, "wave text y")
	var round_tip = hud.get_node("Root/RoundTip") as Control
	t.approx((round_tip.offset_top + round_tip.offset_bottom) * 0.5, 170.0, 0.1, "round tip y")

	hud.set_progress(0.5)
	hud._process(0.05)
	t.approx(bar.value, 12.5, 0.5, "progress smooth midpoint")
	hud._process(1.0)
	t.approx(bar.value, 50.0, 0.5, "progress reaches target")
	hud.reset_progress()
	t.eq(bar.value, 0.0, "progress snaps on reset")

	hud.free()
	sidebar.free()

	var over = preload("res://scenes/ui/game_over.tscn").instantiate()
	t.root.add_child(over)
	var panel = over.get_node("Root/Panel") as Panel
	var style = panel.get_theme_stylebox("panel")
	t.check(style is StyleBoxFlat, "panel has flat style")
	if style is StyleBoxFlat:
		t.check((style as StyleBoxFlat).bg_color.v > 0.8, "panel is light")
	over.free()
