shader_type canvas_item;
render_mode blend_mul;

// Cocos: dst * (src.rgb + 1 - src.a)
// Godot blend_mul 的 RGB = dst * src.rgb，且忽略 src.a。
// 先把 alpha 预乘回 RGB：src.rgb' = mix(1, src.rgb, src.a)，alpha 设为 1。
// 透明区 → 乘 1（不改背景）；不透明墨色 → 正常正片叠底；modulate.a 淡出也有效。
void fragment() {
	vec4 c = texture(TEXTURE, UV) * COLOR;
	float a = c.a;
	c.rgb = mix(vec3(1.0), c.rgb, a);
	c.a = 1.0;
	COLOR = c;
}
