extends RefCounted


func run(t) -> void:
	var ids: Array = TraitPool.ids()
	t.check(ids.size() >= 10, "10+ traits")

	var unique := {}
	for id in ids:
		unique[id] = true
	t.eq(unique.size(), ids.size(), "unique ids")

	var owned := ["free_horse", "free_cannon"]
	var picks: Array = TraitPool.pick_three(owned)
	t.eq(picks.size(), 3, "3 picks")
	for id in picks:
		t.check(not owned.has(id), "pick is not owned")

	t.check(TraitPool.title("free_horse") != "", "title")
	t.check(TraitPool.desc("free_horse") != "", "desc")
