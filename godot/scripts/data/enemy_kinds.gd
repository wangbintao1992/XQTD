class_name EnemyKinds
extends RefCounted

## 敌方棋子难度表。改平衡只改这张表。

const KINDS := [
	{
		"name": "bing",
		"texture": preload("res://art/qz/r_bing.png"),
		"hp": 3,
		"speed_factor": 1.25,
		"life_cost": 1,
		"qi_reward": 8,
	},
	{
		"name": "pao",
		"texture": preload("res://art/qz/r_pao.png"),
		"hp": 5,
		"speed_factor": 0.90,
		"life_cost": 2,
		"qi_reward": 15,
	},
	{
		"name": "xiang",
		"texture": preload("res://art/qz/r_xiang.png"),
		"hp": 8,
		"speed_factor": 0.62,
		"life_cost": 4,
		"qi_reward": 28,
	},
	{
		"name": "ma",
		"texture": preload("res://art/qz/r_ma.png"),
		"hp": 4,
		"speed_factor": 1.10,
		"life_cost": 2,
		"qi_reward": 12,
	},
	{
		"name": "che",
		"texture": preload("res://art/qz/r_che.png"),
		"hp": 6,
		"speed_factor": 0.75,
		"life_cost": 3,
		"qi_reward": 20,
	},
	{
		"name": "shi",
		"texture": preload("res://art/qz/r_shi.png"),
		"hp": 2,
		"speed_factor": 1.45,
		"life_cost": 1,
		"qi_reward": 5,
	},
]
