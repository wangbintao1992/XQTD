import {
    _decorator,
    Color,
    Component,
    Graphics,
    instantiate,
    Node,
    resources,
    Sprite,
    SpriteFrame,
    UITransform,
} from 'cc';
import { EnemyHealth } from './EnemyHealth';
import { EnemySpawner } from './EnemySpawner';
import { GameSession } from './GameSession';
import { HitPause } from './HitPause';
import { LivesManager } from './LivesManager';
import { PathMover } from './PathMover';
import { PATH_GRAPH_EDGES, PATH_GRAPH_NODES } from './PathGraphData';

const { ccclass, property } = _decorator;

/** 路径图 p.png 的原始像素尺寸（网络坐标就是按它换算出来的）。 */
const IMAGE_W = 2048;
const IMAGE_H = 1152;
/** Cocos 设计分辨率：路径图先铺满它，再整体乘 pathImageScale。 */
const DESIGN_W = 1280;
const DESIGN_H = 720;

/**
 * 出兵时从这张表里**随机挑一种**棋子。四个数值一起构成"这枚棋子有多难缠"：
 *
 * - `hp`        血量（要打几下）；
 * - `speedFactor` 相对基准速度的倍率（**血越厚走得越慢**，避免又硬又快失衡）；
 * - `lifeCost`  让它**踏进基地**时扣多少生命（威胁度：越硬的棋子扣得越多）；
 * - `qiReward`  把它**打死**给玩家多少棋气（回报：越难打给得越多，激励优先集火厚棋子）。
 *
 * 三者的取向是一致的：兵/士（脆、快、便宜）是消耗品，象（厚、慢、贵）是硬骨头。
 * 素材都在 `assets/resources/textures/qz/` 下（r_ = 红方），改平衡就改这一张表。
 */
const ENEMY_KINDS: {
    name: string;
    res: string;
    hp: number;
    speedFactor: number;
    lifeCost: number;
    qiReward: number;
}[] = [
    { name: 'bing', res: 'textures/qz/r_bing/spriteFrame', hp: 3, speedFactor: 1.25, lifeCost: 1, qiReward: 8 },
    { name: 'pao', res: 'textures/qz/r_pao/spriteFrame', hp: 5, speedFactor: 0.90, lifeCost: 2, qiReward: 15 },
    { name: 'xiang', res: 'textures/qz/r_xiang/spriteFrame', hp: 8, speedFactor: 0.62, lifeCost: 4, qiReward: 28 },
    { name: 'ma', res: 'textures/qz/r_ma/spriteFrame', hp: 4, speedFactor: 1.10, lifeCost: 2, qiReward: 12 },
    { name: 'che', res: 'textures/qz/r_che/spriteFrame', hp: 6, speedFactor: 0.75, lifeCost: 3, qiReward: 20 },
    { name: 'shi', res: 'textures/qz/r_shi/spriteFrame', hp: 2, speedFactor: 1.45, lifeCost: 1, qiReward: 5 },
];

/** 运行时的棋子种类（多带一份加载好的贴图）。 */
interface EnemyKind {
    name: string;
    res: string;
    hp: number;
    speedFactor: number;
    lifeCost: number;
    qiReward: number;
    frame: SpriteFrame | null;
}

/** 一个沿路径网络往前走、只朝终点方向的棋子。 */
interface Walker {
    node: Node;
    /** 当前所在的边索引 */
    edge: number;
    /** 沿边的方向：1 = 从 edge.a 走向 edge.b，-1 = 反过来 */
    dir: number;
    /** 在这条边上已经走过的距离（设计单位，未乘路径图缩放） */
    dist: number;
    /** 这枚棋子自己的速度（设计单位/秒） */
    speed: number;
    /** 这枚棋子踏进基地时要扣的生命 */
    lifeCost: number;
    /** 受击暂停组件（攻击方打中时 requestPause，这里每帧读 isPaused） */
    pause: HitPause | null;
}

/**
 * 用**手绘标注图提取出来的路径网络**驱动棋子：
 *
 *  - 数据来自 `PathGraphData.ts`（6 个节点 / 8 条边）；
 *  - **起点 = 最左侧的节点，终点 = 最右侧的节点**（自动按 x 取极值，换图也不用改）；
 *  - 网络按**到终点的最短距离**定向（Dijkstra）：棋子每到一个节点，只在"离终点更近"
 *    的边里随机挑一条走。距离严格递减 ⇒ **只会单向朝终点走，不可能倒着走、也不可能绕环**；
 *  - 棋子**从起点一个个出来，每 `spawnInterval` 秒 1 个**，共 `enemyCount` 个；
 *  - 每个棋子**随机取一种棋子**（`ENEMY_KINDS`）：血量、速度、**踏进基地扣的生命**、
 *    **被击杀给的棋气**都各不相同；
 *  - 血量和贴图都在 `addChild` **之前**设好（`EnemyHealth` 在 onLoad 里读 `maxHp`）；
 *  - 各棋子素材的"内容占画布比例"不同（trim 掉的白边不一样），所以会按 **bing 的
 *    内容占比**统一缩放一次 —— 让新棋子看起来**和兵一样大**（`enemyVisualBaseName`）；
 *  - 走到终点 = 踏进基地：`LivesManager.lose(这枚棋子的 lifeCost)`，棋子随即消失。
 *
 * 画面分层（都在 Canvas 下，从下往上）：
 *    Background（**原来的背景图，不动它**）
 *      → PathLayer（p.png 按 `pathImageScale` **整体缩小**后居中叠上去）
 *        → PathNetworkDebug（调试用的红色网络折线，默认关）
 *          → Enemies（棋子）
 *  网络坐标与棋子坐标都会乘 `pathImageScale`，所以缩小之后依旧严丝合缝。
 *
 * 另外顺手关掉旧的单路径逻辑（`Canvas/InkPath` 的随机水墨生成 + 旧的 `EnemySpawner`）。
 * 挂在 **Canvas** 上即可。
 */
@ccclass('PathNetworkRunner')
export class PathNetworkRunner extends Component {
    @property({ tooltip: '总出兵数' })
    public enemyCount = 100;

    @property({ tooltip: '出兵间隔（秒）——每这么多秒从起点出 1 个' })
    public spawnInterval = 0.5;

    @property({ tooltip: '基准速度（设计单位/秒）；每种棋子再乘自己的 speedFactor' })
    public speed = 140;

    @property({ tooltip: '所有棋子统一缩小到这个倍数（相对模板尺寸；1 = 用模板的 62×62）' })
    public enemyVisualScale = 0.7;

    @property({ tooltip: '路径图叠在背景上的整体缩放（1 = 铺满设计区）' })
    public pathImageScale = 0.8;

    @property({ tooltip: '路径图（resources 路径，不含扩展名）' })
    public pathImageResourcePath = 'textures/p/spriteFrame';

    @property({ tooltip: '敌人模板节点名（会被克隆当棋子用）' })
    public templateName = 'Enemy';

    @property({ tooltip: '棋子容器节点名；留空 = 放在本节点下' })
    public containerName = 'Enemies';

    @property({ tooltip: '调试用：把提取出来的路径网络画成红色折线盖在路径图上（正常游戏请关掉）' })
    public drawNetwork = false;

    @property({ tooltip: '网络折线宽度（设计单位）' })
    public networkLineWidth = 6;

    @property({ tooltip: '启动时关掉 Canvas/InkPath 的随机路径生成' })
    public disableInkPath = true;

    @property({ tooltip: '启动时清掉并关掉旧的 EnemySpawner' })
    public disableLegacySpawner = true;

    @property({ tooltip: '打控制台日志' })
    public debugLog = true;

    private walkers: Walker[] = [];
    /** 每条边的累计长度表（下标与点序列对应） */
    private segAcc: number[][] = [];
    /** 每条边的总长（设计单位） */
    private edgeTotal: number[] = [];
    /** 每个节点到终点的最短距离（Dijkstra） */
    private distToEnd: number[] = [];
    private kinds: EnemyKind[] = [];
    /** 素材全部加载完之前不出兵（否则第一波会没贴图 / 大小不对） */
    private kindsReady = false;
    private startNode = 0;
    private endNode = 0;
    private spawnTimer = 0;
    private spawned = 0;
    private pathLayer: Node | null = null;
    private networkNode: Node | null = null;

    protected onLoad(): void {
        // 尽早关掉旧的单路径逻辑（PathNetworkRunner 挂在 Canvas 上，一般先于
        // Canvas/Enemies 上的 EnemySpawner 执行 onLoad）。
        this.disableLegacy();
    }

    protected start(): void {
        // 再清一次：EnemySpawner 的 onLoad 有可能比我们晚执行，那一轮它克隆出来的
        // 旧卒要在这里清掉 —— 否则它们会沿着旧的单条 Path 走到终点一直扣血。
        this.disableLegacy();
        this.buildGeometry();
        this.resolveStartAndEnd();
        this.buildFlowField();
        this.applyPathLayer();
        this.preloadEnemyKinds();
        if (this.drawNetwork) {
            this.drawPathNetwork();
        }
        if (this.debugLog) {
            console.log(
                `[PathNetworkRunner] 网络 ${PATH_GRAPH_NODES.length} 节点 / ${PATH_GRAPH_EDGES.length} 边；` +
                `起点 node${this.startNode}(${PATH_GRAPH_NODES[this.startNode].x.toFixed(0)},${PATH_GRAPH_NODES[this.startNode].y.toFixed(0)}) ` +
                `→ 终点 node${this.endNode}(${PATH_GRAPH_NODES[this.endNode].x.toFixed(0)},${PATH_GRAPH_NODES[this.endNode].y.toFixed(0)})，` +
                `最短距离 ${this.distToEnd[this.startNode].toFixed(0)}；每 ${this.spawnInterval}s 出 1 个，共 ${this.enemyCount} 个；` +
                `基准速度 ${this.speed}`
            );
        }
    }

    // ------------------------------------------------ 给 WaveManager 用的那组接口
    // （和 EnemySpawner 同名同义，WaveManager 不关心到底是谁在出兵）

    /** 本轮已经出了多少个。 */
    public get totalCount(): number {
        return this.spawned;
    }

    /** 场上还"活着"多少个（棋子到终点会消失，所以这是还没结束的数量）。 */
    public get aliveCount(): number {
        return this.walkers.length;
    }

    /** 每轮出几个（WaveManager 会写它）。 */
    public get count(): number {
        return this.enemyCount;
    }

    public set count(value: number) {
        this.enemyCount = Math.max(1, Math.floor(value));
    }

    /** 开新的一轮：清掉场上残留，从起点重新出 `count` 个。 */
    public deploy(): void {
        for (const w of this.walkers) {
            if (w.node && w.node.isValid) {
                w.node.removeFromParent();
                w.node.destroy();
            }
        }
        this.walkers = [];
        this.spawned = 0;
        this.spawnTimer = 0;
        if (this.debugLog) {
            console.log(`[PathNetworkRunner] 新一轮：出 ${this.enemyCount} 个`);
        }
    }

    protected update(dt: number): void {
        const lives = LivesManager.shared;
        if (lives && lives.isGameOver) {
            return;      // 生命归零后不再出兵、不再移动
        }
        if (!GameSession.isStarted) {
            return;      // 首页未点「无尽模式」前，整体停摆（不出兵、棋子不动）
        }
        this.tickSpawn(dt);
        this.tickWalkers(dt);
    }

    // ------------------------------------------------------------ 起点与终点

    /** 起点 = 最左侧（x 最小）的节点，终点 = 最右侧（x 最大）的节点。 */
    private resolveStartAndEnd(): void {
        let minX = Infinity;
        let maxX = -Infinity;
        this.startNode = 0;
        this.endNode = 0;
        PATH_GRAPH_NODES.forEach((nd, i) => {
            if (nd.x < minX) {
                minX = nd.x;
                this.startNode = i;
            }
            if (nd.x > maxX) {
                maxX = nd.x;
                this.endNode = i;
            }
        });
    }

    /**
     * 从终点出发做 Dijkstra，得到每个节点"到终点的最短距离"。
     * 棋子只在距离**更小**的边上走，所以天然单向、无环。
     */
    private buildFlowField(): void {
        const n = PATH_GRAPH_NODES.length;
        this.distToEnd = new Array<number>(n).fill(Infinity);
        this.distToEnd[this.endNode] = 0;

        const done = new Array<boolean>(n).fill(false);
        for (let iter = 0; iter < n; iter += 1) {
            let pick = -1;
            for (let i = 0; i < n; i += 1) {
                if (!done[i] && (pick < 0 || this.distToEnd[i] < this.distToEnd[pick])) {
                    pick = i;
                }
            }
            if (pick < 0 || !isFinite(this.distToEnd[pick])) {
                break;
            }
            done[pick] = true;
            for (let k = 0; k < PATH_GRAPH_EDGES.length; k += 1) {
                const e = PATH_GRAPH_EDGES[k];
                let other = -1;
                if (e.a === pick) {
                    other = e.b;
                } else if (e.b === pick) {
                    other = e.a;
                }
                if (other < 0 || done[other]) {
                    continue;
                }
                const cand = this.distToEnd[pick] + this.edgeTotal[k];
                if (cand < this.distToEnd[other]) {
                    this.distToEnd[other] = cand;
                }
            }
        }
    }

    // ---------------------------------------------------------------- 画面层

    /** 把 p.png 缩小后居中叠在背景图上（原来的背景图不动）。 */
    private applyPathLayer(): void {
        const layer = this.ensurePathLayerNode();
        const sprite = layer.getComponent(Sprite) || layer.addComponent(Sprite);
        sprite.type = Sprite.Type.SIMPLE;
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.trim = false;

        const transform = layer.getComponent(UITransform) || layer.addComponent(UITransform);
        transform.setAnchorPoint(0.5, 0.5);
        transform.setContentSize(IMAGE_W, IMAGE_H);
        layer.setPosition(0, 0, 0);
        // ⚠️ 先把 2048x1152 的图按 1280x720 设计区铺满（=0.625），**再**乘整体缩放。
        // 网络坐标就是按"铺满设计区"算出来的，所以两边必须用同一套缩放才对得上；
        // 直接把 scale 设成 pathImageScale 会让路径图比路径大一档（卒就跑到墨路外面了）。
        const baseX = DESIGN_W / IMAGE_W;
        const baseY = DESIGN_H / IMAGE_H;
        layer.setScale(baseX * this.pathImageScale, baseY * this.pathImageScale, 1);

        resources.load(this.pathImageResourcePath, SpriteFrame, (err, frame) => {
            if (err || !frame) {
                console.warn(`[PathNetworkRunner] 路径图加载失败: ${this.pathImageResourcePath}`, err);
                return;
            }
            sprite.spriteFrame = frame;
        });
    }

    private ensurePathLayerNode(): Node {
        let node = this.node.getChildByName('PathLayer');
        if (!node) {
            node = new Node('PathLayer');
            node.layer = this.node.layer;
            this.node.addChild(node);
        }
        const bg = this.node.getChildByName('Background');
        node.setSiblingIndex(bg ? bg.getSiblingIndex() + 1 : 0);
        this.pathLayer = node;
        return node;
    }

    /** 调试用：把提取出来的网络画成红线（正常游戏不要开）。 */
    private drawPathNetwork(): void {
        const existing = this.node.getChildByName('PathNetworkDebug');
        if (existing) {
            existing.destroy();
        }
        const node = new Node('PathNetworkDebug');
        node.layer = this.node.layer;
        this.node.addChild(node);
        const below = this.pathLayer || this.node.getChildByName('Background');
        node.setSiblingIndex(below ? below.getSiblingIndex() + 1 : 1);

        const graphics = node.addComponent(Graphics);
        graphics.lineWidth = this.networkLineWidth;
        graphics.strokeColor = new Color(214, 48, 40, 255);

        for (const edge of PATH_GRAPH_EDGES) {
            const pts = edge.points;
            const first = this.toStage(pts[0], pts[1]);
            graphics.moveTo(first.x, first.y);
            for (let i = 1; i < pts.length / 2; i += 1) {
                const p = this.toStage(pts[i * 2], pts[i * 2 + 1]);
                graphics.lineTo(p.x, p.y);
            }
            graphics.stroke();
        }
        this.networkNode = node;
    }

    // ---------------------------------------------------------------- 出兵

    /** 预加载所有棋子素材；全都到位后才开始出兵。 */
    private preloadEnemyKinds(): void {
        this.kinds = ENEMY_KINDS.map((k) => ({
            name: k.name,
            res: k.res,
            hp: k.hp,
            speedFactor: k.speedFactor,
            lifeCost: k.lifeCost,
            qiReward: k.qiReward,
            frame: null,
        }));
        if (this.kinds.length === 0) {
            this.kindsReady = true;
            return;
        }

        let pending = this.kinds.length;
        const settled = (): void => {
            pending -= 1;
            if (pending <= 0) {
                this.onKindsReady();
            }
        };
        for (const kind of this.kinds) {
            try {
                resources.load(kind.res, SpriteFrame, (err, frame) => {
                    if (err || !frame) {
                        console.warn(`[PathNetworkRunner] 棋子素材加载失败: ${kind.res}`, err);
                    } else {
                        kind.frame = frame;
                    }
                    settled();
                });
            } catch (e) {
                console.warn(`[PathNetworkRunner] 棋子素材加载异常: ${kind.res}`, e);
                settled();
            }
        }
    }

    /** 素材都到齐：放行出兵。 */
    private onKindsReady(): void {
        this.kindsReady = true;
        if (this.debugLog) {
            const loaded = this.kinds.filter((k) => k.frame).length;
            console.log(
                `[PathNetworkRunner] 棋子素材就绪 ${loaded}/${this.kinds.length}；` +
                `所有棋子统一显示为模板尺寸的 ${this.enemyVisualScale} 倍\n` +
                '  棋子  血量  速度  基地伤害  击杀棋气\n' +
                this.kinds.map((k) =>
                    `  ${k.name}  hp${k.hp}  速度${Math.round(this.speed * k.speedFactor)}  基地伤害${k.lifeCost}  击杀棋气${k.qiReward}`
                ).join('\n')
            );
        }
    }

    private tickSpawn(dt: number): void {
        if (!this.kindsReady) {
            return;      // 素材还没就绪，先不出兵
        }
        if (this.spawned >= Math.max(1, Math.floor(this.enemyCount))) {
            return;
        }
        this.spawnTimer += dt;
        let guard = 0;
        while (this.spawnTimer >= this.spawnInterval && this.spawned < this.enemyCount && guard < 32) {
            guard += 1;
            this.spawnTimer -= this.spawnInterval;
            this.spawnOne();
        }
    }

    /** 在起点生成一个棋子（随机一种棋子类型），走一条"朝终点"的边。 */
    private spawnOne(): void {
        const edge = this.pickForwardEdge(this.startNode);
        if (edge < 0) {
            console.warn('[PathNetworkRunner] 起点没有朝终点的边，无法出兵');
            this.spawned = this.enemyCount;
            return;
        }
        const kind = this.kinds.length
            ? this.kinds[Math.floor(Math.random() * this.kinds.length)]
            : null;
        const node = this.makeEnemyNode(this.spawned, kind);
        if (!node) {
            this.spawned = this.enemyCount;
            return;
        }
        this.spawned += 1;
        const e = PATH_GRAPH_EDGES[edge];
        const walker: Walker = {
            node,
            edge,
            dir: e.a === this.startNode ? 1 : -1,
            dist: 0,
            speed: this.speed * (kind ? kind.speedFactor : 1),
            lifeCost: kind ? Math.max(1, kind.lifeCost) : 1,
            pause: node.getComponent(HitPause),
        };
        this.walkers.push(walker);
        this.applyWalkerPosition(walker);
    }

    /**
     * 克隆模板得到一枚棋子：换上这种棋子的贴图、**统一视觉大小**，
     * 设好血量、击杀棋气，再顺手摘掉模板上的 PathMover（它会和网络逻辑抢位置）。
     */
    private makeEnemyNode(index: number, kind: EnemyKind | null): Node | null {
        const tpl = this.resolveTemplate();
        if (!tpl) {
            console.warn('[PathNetworkRunner] 找不到敌人模板节点');
            return null;
        }
        const node = instantiate(tpl);
        node.name = kind ? `Enemy_${index}_${kind.name}` : 'Enemy_' + index;
        node.active = true;

        if (kind) {
            if (kind.frame) {
                const sprite = node.getComponent(Sprite);
                if (sprite) {
                    sprite.spriteFrame = kind.frame;
                }
            }
            // 所有棋子统一尺寸：各素材白边（trim）不一样，但 CUSTOM sizeMode 下贴图是
            // **铺满节点**的 —— 所以只要节点尺寸一致，看起来就一样大。
            const transform = node.getComponent(UITransform);
            const tplTransform = tpl.getComponent(UITransform);
            if (transform && tplTransform) {
                transform.setContentSize(
                    tplTransform.contentSize.width * this.enemyVisualScale,
                    tplTransform.contentSize.height * this.enemyVisualScale
                );
            }
            const health = node.getComponent(EnemyHealth);
            if (health) {
                // ⚠️ maxHp 必须在 addChild 之前设：EnemyHealth 在 onLoad 里用它初始化当前血量。
                health.maxHp = kind.hp;
                // 每枚棋子被打死后给的棋气也各不相同（die() 里读它）。
                health.qiReward = kind.qiReward;
            }
        }

        const mover = node.getComponent(PathMover);
        if (mover) {
            mover.enabled = false;
            mover.destroy();
        }

        // 受击暂停：攻击方（车/炮/马）打中时调 requestPause，这里每帧读 isPaused。
        if (!node.getComponent(HitPause)) {
            node.addComponent(HitPause);
        }

        const parent = this.resolveContainer() || this.node;
        parent.addChild(node);
        return node;
    }

    private resolveTemplate(): Node | null {
        const here = this.node.getChildByName(this.templateName);
        if (here) {
            return here;
        }
        const parent = this.node.parent;
        return parent ? parent.getChildByName(this.templateName) : null;
    }

    private resolveContainer(): Node | null {
        if (!this.containerName) {
            return null;
        }
        const here = this.node.getChildByName(this.containerName);
        if (here) {
            return here;
        }
        const parent = this.node.parent;
        return parent ? parent.getChildByName(this.containerName) : null;
    }

    // ---------------------------------------------------------------- 行走

    private tickWalkers(dt: number): void {
        for (const w of this.walkers) {
            if (!w.node || !w.node.isValid) {
                continue;
            }
            // 受击暂停：被打中的那一小段时间原地"顿"一下，不推进距离。
            if (w.pause && w.pause.isPaused) {
                continue;
            }
            w.dist += w.speed * dt;

            let guard = 0;
            let dead = false;
            while (guard < 64) {
                guard += 1;
                if (w.dist < this.edgeTotal[w.edge]) {
                    break;
                }
                w.dist -= this.edgeTotal[w.edge];
                const e = PATH_GRAPH_EDGES[w.edge];
                const arrivedAt = w.dir > 0 ? e.b : e.a;

                if (arrivedAt === this.endNode) {
                    this.reachBase(w);      // 走到终点 = 踏进基地
                    dead = true;
                    break;
                }
                const next = this.pickForwardEdge(arrivedAt);
                if (next < 0) {
                    // 理论上不会发生（每个节点都至少有一条更靠近终点的边）
                    w.node.destroy();
                    dead = true;
                    break;
                }
                const ne = PATH_GRAPH_EDGES[next];
                w.edge = next;
                w.dir = ne.a === arrivedAt ? 1 : -1;
                w.dist = 0;
            }

            if (!dead && w.node && w.node.isValid) {
                this.applyWalkerPosition(w);
            }
        }
        this.walkers = this.walkers.filter((w) => w.node && w.node.isValid);
    }

    /** 踏进基地：按这枚棋子的份量扣生命，棋子消失（接进原来的 LivesManager）。 */
    private reachBase(walker: Walker): void {
        const lives = LivesManager.shared;
        if (lives) {
            lives.lose(walker.lifeCost);
        } else {
            console.warn('[PathNetworkRunner] 找不到 LivesManager，这次不扣血');
        }
        if (walker.node && walker.node.isValid) {
            walker.node.removeFromParent();
            walker.node.destroy();
        }
    }

    /**
     * 在 `at` 号节点上挑一条**离终点更近**的边走（不会回头、不会绕环）。
     * 有多条就随机选一条。
     */
    private pickForwardEdge(at: number): number {
        const options: number[] = [];
        for (let k = 0; k < PATH_GRAPH_EDGES.length; k += 1) {
            const e = PATH_GRAPH_EDGES[k];
            let other = -1;
            if (e.a === at) {
                other = e.b;
            } else if (e.b === at) {
                other = e.a;
            }
            if (other < 0) {
                continue;
            }
            if (this.distToEnd[other] < this.distToEnd[at]) {
                options.push(k);
            }
        }
        if (options.length === 0) {
            return -1;
        }
        return options[Math.floor(Math.random() * options.length)];
    }

    /** 把棋子的位置设到当前所在的边上（含路径图缩放）。 */
    private applyWalkerPosition(walker: Walker): void {
        const p = this.posOnEdge(walker.edge, walker.dir, walker.dist, this.pathImageScale);
        walker.node.setPosition(p.x, p.y, 0);
    }

    // ------------------------------------------------------------ 几何工具

    /** 预计算每条边的分段长度，后面按弧长取点用。 */
    private buildGeometry(): void {
        this.segAcc = [];
        this.edgeTotal = [];
        for (const edge of PATH_GRAPH_EDGES) {
            const pts = edge.points;
            const count = Math.floor(pts.length / 2);
            const acc: number[] = [0];
            for (let i = 1; i < count; i += 1) {
                const dx = pts[i * 2] - pts[(i - 1) * 2];
                const dy = pts[i * 2 + 1] - pts[(i - 1) * 2 + 1];
                acc.push(acc[i - 1] + Math.sqrt(dx * dx + dy * dy));
            }
            this.segAcc.push(acc);
            this.edgeTotal.push(acc.length ? acc[acc.length - 1] : 0);
        }
    }

    /** 网络坐标 → 舞台坐标（叠在缩小的路径图上）。 */
    private toStage(x: number, y: number): { x: number; y: number } {
        return { x: x * this.pathImageScale, y: y * this.pathImageScale };
    }

    /** 取边上距起点 `dist`（未缩放）处的舞台坐标；dir < 0 表示从另一端算起。 */
    private posOnEdge(edgeIndex: number, dir: number, dist: number, scale: number): { x: number; y: number } {
        const pts = PATH_GRAPH_EDGES[edgeIndex].points;
        const acc = this.segAcc[edgeIndex];
        const total = this.edgeTotal[edgeIndex];
        let s = Math.min(Math.max(dist, 0), total);
        if (dir < 0) {
            s = total - s;
        }

        let i = 0;
        while (i < acc.length - 2 && acc[i + 1] < s) {
            i += 1;
        }
        const span = acc[i + 1] - acc[i];
        const t = span > 0 ? (s - acc[i]) / span : 0;
        return {
            x: (pts[i * 2] + (pts[i * 2 + 2] - pts[i * 2]) * t) * scale,
            y: (pts[i * 2 + 1] + (pts[i * 2 + 3] - pts[i * 2 + 1]) * t) * scale,
        };
    }

    // ---------------------------------------------------------------- 收尾

    /** 去掉原来的单路径逻辑：随机水墨路径 + 按 Path 出兵。 */
    private disableLegacy(): void {
        if (this.disableInkPath) {
            const inkPath = this.node.getChildByName('InkPath');
            if (inkPath) {
                inkPath.active = false;
            }
        }
        if (this.disableLegacySpawner) {
            const enemies = this.node.getChildByName('Enemies');
            const spawner = enemies ? enemies.getComponent(EnemySpawner) : null;
            if (spawner) {
                spawner.clear();
                spawner.enabled = false;
            }
        }
    }
}
