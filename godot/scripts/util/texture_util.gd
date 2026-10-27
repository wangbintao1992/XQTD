class_name TextureUtil
extends RefCounted

## 棋子贴图四周有大量透明留白（1536² 里实际内容约 790×827）。
## 这里按内容的 used_rect 裁成 AtlasTexture，再按目标尺寸算缩放，
## 让六种棋子看起来一样大，和 Cocos 的 trimmed SpriteFrame 行为一致。

static var _cache := {}


static func atlas(tex: Texture2D) -> AtlasTexture:
	if tex == null:
		return null
	if tex is AtlasTexture:
		return tex

	var key := tex.get_instance_id()
	if _cache.has(key):
		return _cache[key]

	var region := Rect2i(0, 0, tex.get_width(), tex.get_height())
	var img := tex.get_image()
	if img:
		var used := img.get_used_rect()
		if used.size.x > 0 and used.size.y > 0:
			region = used

	var at := AtlasTexture.new()
	at.atlas = tex
	at.region = region
	_cache[key] = at
	return at


static func displayed_size(tex: Texture2D) -> Vector2:
	var at := atlas(tex)
	if at == null:
		return Vector2.ZERO
	return Vector2(at.region.size)


static func scale_for(tex: Texture2D, target: float) -> Vector2:
	var size := displayed_size(tex)
	if size.x <= 0.0 or size.y <= 0.0:
		return Vector2.ONE
	return Vector2(target / size.x, target / size.y)
