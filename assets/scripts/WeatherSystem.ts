import {
    _decorator,
    Color,
    Component,
    gfx,
    Graphics,
    Node,
    ParticleSystem2D,
    resources,
    SpriteFrame,
    UITransform,
    Vec2,
    view,
} from 'cc';
import { LivesManager } from './LivesManager';
import { PathNetworkRunner } from './PathNetworkRunner';

const { ccclass, property } = _decorator;

/** 一种天气的粒子参数（数值来自你给的那张表）。 */
interface WeatherPreset {
    name: string;
    /** 粒子贴图（resources 路径，不含 /spriteFrame） */
    res: string;
    /** 每秒发射多少个 */
    emissionRate: number;
    /** 重力 */
    gravity: Vec2;
    /** 初速度 + 抖动 */
    speed: number;
    speedVar: number;
    /** 寿命 + 抖动（秒） */
    life: number;
    lifeVar: number;
    /** 粒子大小 + 抖动（像素） */
    size: number;
    sizeVar: number;
    /** 颜色（含透明度） */
    color: Color;
    /** 粒子数量上限 */
    totalParticles: number;
    /** 发射方向：90 = 向下，0 = 向右 */
    angle: number;
    angleVar: number;
    /** 发射源相对屏幕中心的高度（正数 = 屏幕上方）；侧向天气用 0 */
    sourceY: number;
    /** 发射源横向铺开的半径（铺满屏幕用） */
    posVarX: number;
    /** 需要额外叠一层"闪电"的天气（雷暴） */
    flash?: {
        res: string;
        emissionRate: number;
        life: number;
        size: number;
        color: Color;
        totalParticles: number;
        speed: number;
    };
}

/**
 * 每 30 个棋子换一种天气（全局粒子效果）。轮换顺序：雨 → 雪 → 雾 → 雷暴 → …
 *
 * 参数按你给的对照表填好：
 *   雨   发射 400/s、重力(0,-500)、速度 800、寿命 1.2s、大小 2~4px、半透明白、上限 500
 *   雪   发射 90/s、 重力(0,-80)、 速度 60~150 飘、寿命 4~6s、大小 6~14px、白、上限 300
 *   雾   发射 30/s、 重力(0,0)、   速度 30~80 横向、寿命 6~10s、大小 150~300px、浅灰、上限 40
 *   雷暴 雨(400/s，同雨参数) + 闪电(单独节点，2~4/s、寿命 0.3s、大小 120px、蓝白辉光)
 *
 * ⚠️ **两个必须知道的点**：
 *  1. **粒子尺寸 ≠ 表里的"px"**。表里雨是 2~4，但在 1280x720 的设计分辨率下，
 *     3 个单位就是一个几乎看不见的点。所以加了 `sizeScale`（默认 3）统一放大，
 *     想严格照表就设成 1。
 *  2. **加法混合需要暗底**。四种天气都用加法（`SRC_ALPHA + ONE`，素材是黑底 + 浅色内容，
 *     加法下黑色不发光），但本作的背景是**浅色宣纸**，白色粒子叠上去几乎看不出变化。
 *     所以随天气一起加了一层 `darken`（默认 70）把画面压暗，粒子才显出来；不需要就设 0。
 *
 * 实现：每种天气建一个（雷暴是两个）ParticleSystem2D 节点，默认 `active = false`；
 * 切到时置 `active = true`（`playOnLoad` 为真，引擎会在激活时自动重新播放）。
 *
 * 挂在 **Canvas** 上即可（和 PathNetworkRunner / GameBootstrap 一起）。
 */
@ccclass('WeatherSystem')
export class WeatherSystem extends Component {
    @property({ tooltip: '每出多少个棋子换一次天气' })
    public stageSize = 30;

    @property({ tooltip: '天气层整体不透明度（0-255）' })
    public alpha = 255;

    @property({ tooltip: '粒子尺寸整体倍率。对照表里的尺寸偏小（雨只有 2~4），照原值用几乎看不见，这里统一放大；想严格按表就设成 1' })
    public sizeScale = 3;

    @property({ tooltip: '粒子用加法混合（表里要求的方式）。⚠️ 本作背景是浅色宣纸，加法是"背景 + 粒子"，白粒子叠白底几乎看不出变化 —— 实测要关掉才看得见，所以默认 false' })
    public additive = false;

    @property({ tooltip: '用带 alpha 的贴图副本（*_a.png：黑底转成全透明）。原贴图没有 alpha 通道，黑色是不透明的，只有用它才能既去掉黑底又在浅色背景上看得见' })
    public useAlphaTextures = true;

    @property({ tooltip: '天气时把画面压暗的程度（0-255）。只在用加法混合时才需要（给粒子一个暗底）；普通混合不需要，默认 0' })
    public darken = 0;

    @property({ tooltip: '把天气层放在最上层（盖住 UI）；关掉则只盖住棋子和路径' })
    public onTop = true;

    @property({ tooltip: '开局就先来一场天气（否则等第一个阶段切换时才出现）' })
    public startImmediately = true;

    @property({ tooltip: '打控制台日志' })
    public debugLog = true;

    private presets: WeatherPreset[] = [
        {
            // ⚠️ 表里雨是 2~4，但这几张贴图更像"整幅天气图"而不是单个粒子精灵：
            // rain 的亮像素只占约 2%，缩到 3px 后每个粒子只剩一两个白点，基本看不见。
            // 所以按贴图的实际疏密把基准尺寸调大（最后还会乘 sizeScale）。
            name: 'rain', res: 'textures/weather/rain',
            emissionRate: 400, gravity: new Vec2(0, -500),
            speed: 800, speedVar: 100,
            life: 1.2, lifeVar: 0.25,
            size: 8, sizeVar: 3,
            // 注意：最终透明度 = 纹理 alpha × 这里颜色的 alpha。
            // 贴图副本已经把"黑底"变成透明了，所以颜色这边给足，别再乘一道。
            color: new Color(255, 255, 255, 255),
            totalParticles: 500,
            angle: 90, angleVar: 6,
            sourceY: 430, posVarX: 760,
        },
        {
            name: 'snow', res: 'textures/weather/snow',
            emissionRate: 90, gravity: new Vec2(0, -80),
            speed: 100, speedVar: 45,
            life: 5, lifeVar: 1,
            size: 10, sizeVar: 4,
            color: new Color(255, 255, 255, 255),
            totalParticles: 300,
            angle: 90, angleVar: 35,
            sourceY: 430, posVarX: 760,
        },
        {
            name: 'fog', res: 'textures/weather/fog',
            emissionRate: 30, gravity: new Vec2(0, 0),
            speed: 55, speedVar: 25,
            life: 8, lifeVar: 2,
            size: 225, sizeVar: 75,
            color: new Color(205, 205, 205, 170),
            totalParticles: 40,
            angle: 0, angleVar: 22,
            sourceY: 0, posVarX: 760,
        },
        {
            name: 'storm', res: 'textures/weather/rain',
            emissionRate: 400, gravity: new Vec2(0, -500),
            speed: 800, speedVar: 120,
            life: 1.2, lifeVar: 0.25,
            size: 3, sizeVar: 1,
            color: new Color(255, 255, 255, 220),
            totalParticles: 500,
            angle: 90, angleVar: 10,
            sourceY: 430, posVarX: 760,
            flash: {
                res: 'textures/weather/storm',
                emissionRate: 3,
                life: 0.3,
                size: 120,
                color: new Color(190, 220, 255, 255),
                totalParticles: 1,
                speed: 0,
            },
        },
    ];

    /** 天气名 -> 组成它的粒子节点（雷暴是两个） */
    private layers = new Map<string, Node[]>();
    private darkenNode: Node | null = null;
    private current = '';
    private lastStage = -1;
    private ready = false;

    protected onLoad(): void {
        this.buildLayers();
    }

    protected start(): void {
        this.ready = true;
        if (this.startImmediately) {
            this.applyStage(0);
        }
    }

    protected update(): void {
        if (!this.ready) {
            return;
        }
        const lives = LivesManager.shared;
        if (lives && lives.isGameOver) {
            this.setWeather('');          // 结束就不下雪了
            return;
        }
        const runner = this.resolveRunner();
        if (!runner) {
            return;
        }
        const stage = Math.floor(runner.totalCount / Math.max(1, Math.floor(this.stageSize)));
        if (stage !== this.lastStage) {
            this.applyStage(stage);
        }
    }

    /** 第 stage 段用哪种天气（雨 → 雪 → 雾 → 雷暴 循环）。 */
    private applyStage(stage: number): void {
        this.lastStage = stage;
        const list = this.presets;
        const idx = ((stage % list.length) + list.length) % list.length;
        this.setWeather(list[idx].name);
    }

    private setWeather(name: string): void {
        if (name === this.current) {
            return;
        }
        this.current = name;
        for (const key of this.layers.keys()) {
            const on = key === name;
            for (const node of this.layers.get(key) || []) {
                node.active = on;
            }
        }
        if (this.darkenNode) {
            this.darkenNode.active = name !== '';
        }
        if (this.debugLog) {
            console.log(`[WeatherSystem] 天气 -> ${name || '(无)'}（第 ${this.lastStage + 1} 段）`);
        }
    }

    // ------------------------------------------------------------ 建粒子层

    private buildLayers(): void {
        this.ensureDarkenLayer();
        for (const preset of this.presets) {
            const nodes: Node[] = [this.makeParticleNode(preset.name, preset)];
            if (preset.flash) {
                const f = preset.flash;
                nodes.push(this.makeParticleNode(preset.name + '_flash', {
                    ...preset,
                    res: f.res,
                    emissionRate: f.emissionRate,
                    gravity: new Vec2(0, 0),
                    speed: f.speed,
                    speedVar: 0,
                    life: f.life,
                    lifeVar: f.life * 0.3,
                    size: f.size,
                    sizeVar: 0,
                    color: f.color,
                    totalParticles: f.totalParticles,
                    angle: 90,
                    angleVar: 180,
                    sourceY: 0,
                    posVarX: preset.posVarX * 0.7,
                    flash: undefined,
                }));
            }
            this.layers.set(preset.name, nodes);
        }
        this.current = '';
        this.setWeather('');
        this.current = '';      // setWeather('') 会被当成"没变化"直接返回，这里复位一下
        if (this.darkenNode) {
            this.darkenNode.active = false;
        }
    }

    /**
     * 天气时压暗整个画面 —— 加法混合的粒子和浅色宣纸背景放在一起是"白加白"，
     * 必须先把底压暗，粒子才亮得出来。
     */
    private ensureDarkenLayer(): void {
        const alpha = Math.max(0, Math.min(255, this.darken));
        if (alpha <= 0) {
            return;
        }
        const node = new Node('WeatherDarken');
        node.layer = this.node.layer;
        this.node.addChild(node);
        node.setPosition(0, 0, 0);

        const visible = view.getVisibleSize();
        const transform = node.addComponent(UITransform);
        transform.setAnchorPoint(0.5, 0.5);
        transform.setContentSize(visible.width, visible.height);

        const g = node.addComponent(Graphics);
        g.fillColor = new Color(8, 10, 14, alpha);
        g.rect(-visible.width * 0.5, -visible.height * 0.5, visible.width, visible.height);
        g.fill();

        node.active = false;
        this.darkenNode = node;
    }

    private makeParticleNode(key: string, preset: WeatherPreset): Node {
        const node = new Node('Weather_' + key);
        node.layer = this.node.layer;
        this.node.addChild(node);
        if (this.onTop) {
            node.setSiblingIndex(this.node.children.length - 1);
        } else {
            const bg = this.node.getChildByName('Background');
            node.setSiblingIndex(bg ? bg.getSiblingIndex() + 1 : 0);
        }
        node.setPosition(0, 0, 0);

        const visible = view.getVisibleSize();
        const transform = node.addComponent(UITransform);
        transform.setAnchorPoint(0.5, 0.5);
        transform.setContentSize(visible.width, visible.height);

        const ps = node.addComponent(ParticleSystem2D);
        // ⚠️ 别去动 `preview`：运行时新建的粒子系统默认就是 true，那才是正常工作态。
        // 实测把它设成 false 之后粒子直接不再发射（particleCount 恒为 0）。
        ps.preview = true;
        ps.playOnLoad = true;                       // 激活时自动重新播放
        ps.emitterMode = ParticleSystem2D.EmitterMode.GRAVITY;
        ps.positionType = ParticleSystem2D.PositionType.FREE;
        ps.duration = -1;                           // 一直发射
        ps.gravity = preset.gravity;
        ps.speed = preset.speed;
        ps.speedVar = preset.speedVar;
        ps.life = preset.life;
        ps.lifeVar = preset.lifeVar;
        const sizeK = Math.max(0.05, this.sizeScale);
        ps.startSize = preset.size * sizeK;
        ps.startSizeVar = preset.sizeVar * sizeK;
        ps.endSize = preset.size * sizeK;
        ps.endSizeVar = 0;
        ps.startSpin = 0;
        const alphaK = Math.max(0, Math.min(255, this.alpha)) / 255;
        ps.startColor = new Color(preset.color.r, preset.color.g, preset.color.b,
            Math.round(preset.color.a * alphaK));
        ps.startColorVar = new Color(0, 0, 0, 0);
        ps.emissionRate = preset.emissionRate;
        ps.totalParticles = preset.totalParticles;
        ps.angle = preset.angle;
        ps.angleVar = preset.angleVar;
        // 发射源铺满屏幕（宽按"屏幕一半 + 余量"，从上缘/左缘进来）
        ps.sourcePos = new Vec2(preset.angle === 0 ? -visible.width * 0.5 : 0, preset.sourceY);
        ps.posVar = new Vec2(Math.max(preset.posVarX, visible.width * 0.55), 20);

        // 混合模式：UIRenderer 只暴露了 protected 的混合因子，这里直接写它。
        // 加法 = SRC_ALPHA + ONE（表里要求的）；普通 = SRC_ALPHA + ONE_MINUS_SRC_ALPHA。
        const B = gfx.BlendFactor;
        (ps as any)._srcBlendFactor = B.SRC_ALPHA;
        (ps as any)._dstBlendFactor = this.additive ? B.ONE : B.ONE_MINUS_SRC_ALPHA;

        // 默认用带 alpha 的副本：原图没有 alpha，黑底会实心盖住画面。
        const texPath = (this.useAlphaTextures ? preset.res + '_a' : preset.res) + '/spriteFrame';
        resources.load(texPath, SpriteFrame, (err, frame) => {
            if (err || !frame) {
                console.warn(`[WeatherSystem] 粒子贴图加载失败: ${texPath}`, err);
                return;
            }
            ps.spriteFrame = frame;
        });

        node.active = false;    // 默认全关，切到哪种天气才开
        return node;
    }

    private resolveRunner(): PathNetworkRunner | null {
        const canvas = this.node;
        const direct = canvas.getComponent(PathNetworkRunner);
        if (direct) {
            return direct;
        }
        const parent = canvas.parent;
        return parent ? parent.getComponent(PathNetworkRunner) : null;
    }
}
