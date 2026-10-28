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
