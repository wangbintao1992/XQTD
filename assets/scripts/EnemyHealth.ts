import { QiManager } from './QiManager';
import {
    _decorator,
    Component,
    EventTouch,
    Node,
    resources,
    Sprite,
    SpriteFrame,
    tween,
    Tween,
    UIOpacity,
    UITransform,
} from 'cc';

const { ccclass, property } = _decorator;

/**
 * 敌人血量 + 受伤表现。
 *
 * 受伤有**两级表现**：
 *  1. `DamageOverlay`：按**掉了几点血**在棋子上叠一张破损效果（`sui_0/1/2`）。
 *     换图时**旧的先渐隐、新的再渐入**（`damageOverlayFade`），透明度可调
 *     （`damageOverlayOpacity`）—— 这是"受伤程度"的主要表达；
 *  2. `HitEffect`：每次挨打闪一下 `moban` 溅墨（一次性，1 秒渐隐）。
 *
 * ⚠️ 棋子本体现在**不再随血量变淡**：`bodyFadeWithDamage` 默认关。
 * 因为变淡会和叠加的破损效果叠在一起，反而看不清受伤程度；想回到老表现就把它打开。
 *
 * 塔/子弹打中时调 `takeDamage(1)` 即可，不需要知道这里怎么实现。
 * `damageOnTouch` 只是为了还没做塔的时候能手动点一下验证效果。
 */
@ccclass('EnemyHealth')
export class EnemyHealth extends Component {
    @property({ tooltip: '初始血量' })
    public maxHp = 3;

    @property({ tooltip: '受伤时在棋子上叠一张破损效果（按掉了几点血换图）' })
    public damageOverlay = true;

    @property({
        type: [String],
        tooltip: '破损效果贴图（从轻到重）：掉 1 血用第 1 张、掉 2 血用第 2 张、掉 3 血及以上用最后一张',
    })
    public damageOverlayPaths: string[] = [
        'textures/qz/sui_0/spriteFrame',
        'textures/qz/sui_1/spriteFrame',
        'textures/qz/sui_2/spriteFrame',
    ];

    @property({ tooltip: '破损效果相对棋子节点的大小倍数' })
    public damageOverlayScale = 1.15;

    @property({ tooltip: '破损效果的不透明度（0-255）' })
    public damageOverlayOpacity = 210;

    @property({ tooltip: '破损效果换图时的淡出 / 淡入时长（秒）' })
    public damageOverlayFade = 0.18;

    @property({ tooltip: '棋子本体是否随受伤变淡（已经有破损叠加，默认关掉）' })
    public bodyFadeWithDamage = false;

    @property({ tooltip: '满血时的不透明度（0-255），只在 bodyFadeWithDamage 打开时起作用' })
    public fullOpacity = 255;

    @property({ tooltip: '只剩 1 血时的不透明度（0-255），只在 bodyFadeWithDamage 打开时起作用' })
    public lowestOpacity = 80;

    @property({ tooltip: '点击即受 1 点伤害（目前没做塔，先用它验证；有塔之后可关掉）' })
    public damageOnTouch = true;

    @property({ tooltip: '受伤时往控制台打日志' })
    public debugLog = false;

    @property({ tooltip: '受击特效贴图在 resources 下的路径' })
    public hitEffectPath = 'textures/moban/spriteFrame';

    @property({ tooltip: '受击特效显示时长（秒），期间跟着卒走，之后渐隐消失' })
    public hitEffectTime = 1;

    @property({ tooltip: '受击特效尺寸（设计单位）' })
    public hitEffectSize = 96;

    @property({ tooltip: '被击杀时给玩家的棋气' })
    public qiReward = 20;

    /** 受击特效贴图全局缓存，避免每个卒都去 load 一次。 */
    private static effectFrame: SpriteFrame | null = null;
    private static effectLoading = false;
    /** 破损效果贴图全局缓存（按 resources 路径）。 */
    private static overlayCache = new Map<string, SpriteFrame>();

    private hp = 0;
    private opacity: UIOpacity | null = null;
    private dead = false;

    /** 破损叠加层 */
    private overlayNode: Node | null = null;
    private overlaySprite: Sprite | null = null;
    private overlayOpacity: UIOpacity | null = null;
    private overlayFrames: (SpriteFrame | null)[] = [];
    /** 当前显示的破损等级：-1 = 没受伤（不显示） */
    private overlayLevel = -1;

    public get currentHp(): number {
        return this.hp;
    }

    public get isDead(): boolean {
        return this.dead;
    }

    protected onLoad(): void {
        this.hp = Math.max(1, this.maxHp);
        this.opacity = this.getComponent(UIOpacity) || this.addComponent(UIOpacity);
        this.refreshAlpha();
        this.ensureOverlay();
        this.loadOverlayFrames();
        if (this.damageOnTouch) {
            this.node.on(Node.EventType.TOUCH_END, this.onTouch, this);
        }
    }

    protected onDestroy(): void {
        if (this.damageOnTouch) {
            this.node.off(Node.EventType.TOUCH_END, this.onTouch, this);
        }
    }

    /** 掉血。 */
    public takeDamage(amount = 1): void {
        if (this.dead || amount <= 0) {
            return;
        }
        this.hp = Math.max(0, this.hp - amount);
        this.refreshAlpha();
        this.refreshDamageOverlay();
        this.playHitEffect();
        if (this.debugLog) {
            console.log('[EnemyHealth] hp=' + this.hp + '/' + this.maxHp);
        }
        if (this.hp <= 0) {
            this.die();
        }
    }

    /** 回血（留个口子，暂未使用）。 */
    public heal(amount = 1): void {
        if (this.dead || amount <= 0) {
            return;
        }
        this.hp = Math.min(this.maxHp, this.hp + amount);
        this.refreshAlpha();
        this.refreshDamageOverlay();
    }

    /** 直接击杀。 */
    public kill(): void {
        if (this.dead) {
            return;
        }
        this.hp = 0;
        this.refreshAlpha();
        this.die();
    }

    // ------------------------------------------------------------ 破损叠加层

    /** 在棋子身上建一个常驻的叠加节点（默认透明），受伤时往里换图。 */
    private ensureOverlay(): void {
        if (!this.damageOverlay || this.overlayNode) {
            return;
        }
        const node = new Node('DamageOverlay');
        node.layer = this.node.layer;
        this.node.addChild(node);
        node.setPosition(0, 0, 0);

        const transform = node.addComponent(UITransform);
        transform.setAnchorPoint(0.5, 0.5);
        const parentTransform = this.node.getComponent(UITransform);
        const w = parentTransform ? parentTransform.contentSize.width : 62;
        const h = parentTransform ? parentTransform.contentSize.height : 62;
        transform.setContentSize(w * this.damageOverlayScale, h * this.damageOverlayScale);

        const sprite = node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.type = Sprite.Type.SIMPLE;
        sprite.trim = false;

        const opacity = node.addComponent(UIOpacity);
        opacity.opacity = 0;

        this.overlayNode = node;
        this.overlaySprite = sprite;
        this.overlayOpacity = opacity;
    }

    /** 预加载破损效果贴图（全局缓存，多个棋子共用）。 */
    private loadOverlayFrames(): void {
        if (!this.damageOverlay) {
            return;
        }
        const paths = this.damageOverlayPaths || [];
        // ⚠️ 用闭包里的局部数组接住它：resources.load 的回调是异步的，触发时这枚棋子
        // 可能已经被销毁了，那时候再读 this.overlayFrames 会是 null —— 就是刷屏的
        // "Cannot set properties of null (setting 'N')" 的来源。
        const frames = new Array<SpriteFrame | null>(paths.length).fill(null);
        this.overlayFrames = frames;
        paths.forEach((path, i) => {
            const cached = EnemyHealth.overlayCache.get(path);
            if (cached) {
                frames[i] = cached;
                return;
            }
            try {
                resources.load(path, SpriteFrame, (err, frame) => {
                    if (err || !frame) {
                        console.warn(`[EnemyHealth] 破损效果加载失败: ${path}`, err);
                        return;
                    }
                    EnemyHealth.overlayCache.set(path, frame);
                    frames[i] = frame;
                });
            } catch (e) {
                console.warn(`[EnemyHealth] 破损效果加载异常: ${path}`, e);
            }
        });
    }

    /**
     * 按受伤程度切换叠加效果：掉 1 血 → 第 1 张，掉 2 血 → 第 2 张，
     * 掉 3 血及以上 → 最后一张；满血 → 收起来。
     * 换图走"旧的渐隐 → 换图 → 新的渐入"，避免生硬地跳变。
     */
    private refreshDamageOverlay(): void {
        if (!this.damageOverlay || !this.overlayNode || !this.overlaySprite
            || !this.overlayOpacity || !this.overlayFrames) {
            return;
        }
        const lost = this.maxHp - this.hp;
        const last = this.overlayFrames.length - 1;
        const level = lost <= 0 ? -1 : Math.min(lost - 1, last);
        if (level === this.overlayLevel) {
            return;
        }
        this.overlayLevel = level;
        const target = level < 0 ? null : this.overlayFrames[level];

        Tween.stopAllByTarget(this.overlayOpacity);
        const fade = Math.max(0, this.damageOverlayFade);
        if (fade <= 0) {
            this.overlaySprite.spriteFrame = target;
            this.overlayOpacity.opacity = target ? this.damageOverlayOpacity : 0;
            return;
        }
        tween(this.overlayOpacity)
            .to(fade, { opacity: 0 })          // 旧的渐隐
            .call(() => {
                if (!this.overlayNode || !this.overlayNode.isValid || !this.overlaySprite || !this.overlayOpacity) {
                    return;
                }
                this.overlaySprite.spriteFrame = target;
                if (!target) {
                    return;                     // 满血了：淡出就结束，不显示
                }
                tween(this.overlayOpacity)
                    .to(fade, { opacity: this.damageOverlayOpacity })   // 新的渐入
                    .start();
            })
            .start();
    }

    // ---------------------------------------------------------------- 受击特效

    /**
     * 受击特效：在卒身上挂一张 moban（溅墨）贴图，1 秒内渐隐销毁。
     * 作为卒的子节点，所以会跟着卒一起移动；卒被打死时特效随之消失。
     */
    private playHitEffect(): void {
        if (this.hitEffectTime <= 0) {
            return;
        }
        const frame = EnemyHealth.effectFrame;
        if (!frame) {
            this.ensureEffectFrame((loaded) => {
                if (loaded) {
                    this.spawnEffectNode(loaded);
                }
            });
            return;
        }
        this.spawnEffectNode(frame);
    }

    private ensureEffectFrame(done: (frame: SpriteFrame | null) => void): void {
        if (EnemyHealth.effectFrame) {
            done(EnemyHealth.effectFrame);
            return;
        }
        if (EnemyHealth.effectLoading) {
            return;     // 已经有人在加载了，这次先不显示
        }
        EnemyHealth.effectLoading = true;
        try {
            resources.load(this.hitEffectPath, SpriteFrame, (err, frame) => {
                EnemyHealth.effectLoading = false;
                if (!err && frame) {
                    EnemyHealth.effectFrame = frame;
                }
                done(err || !frame ? null : frame);
            });
        } catch (e) {
            EnemyHealth.effectLoading = false;
            done(null);
        }
    }

    private spawnEffectNode(frame: SpriteFrame): void {
        const node = new Node('HitEffect');
        node.layer = this.node.layer;
        this.node.addChild(node);
        node.setPosition(0, 0, 0);

        const transform = node.addComponent(UITransform);
        transform.setAnchorPoint(0.5, 0.5);
        transform.setContentSize(this.hitEffectSize, this.hitEffectSize);

        const sprite = node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.type = Sprite.Type.SIMPLE;
        sprite.trim = false;
        sprite.spriteFrame = frame;

        const opacity = node.addComponent(UIOpacity);
        opacity.opacity = 255;

        // ⚠️ 别用 tween 去改 node.scale：棋子（连同这个特效子节点）随时可能被销毁，
        // 而 tween 仍会每帧去写 scale 的分量，于是刷 "Cannot set properties of null"。
        // 透明度这一层渐隐动画就够了。
        node.setScale(1, 1, 1);
        tween(opacity)
            .delay(this.hitEffectTime * 0.35)
            .to(this.hitEffectTime * 0.65, { opacity: 0 })
            .call(() => {
                if (node.isValid) {
                    node.removeFromParent();
                    node.destroy();
                }
            })
            .start();
    }

    private onTouch(event: EventTouch): void {
        event.propagationStopped = true;
        this.takeDamage(1);
    }

    /** 血量 -> 透明度：满血 255，每掉一血更淡，最低到 lowestOpacity。 */
    private refreshAlpha(): void {
        if (!this.opacity) {
            return;
        }
        if (!this.bodyFadeWithDamage) {
            // 受伤改由 sui_0/1/2 叠加层表达，本体保持不透明，看得更清楚
            this.opacity.opacity = this.fullOpacity;
            return;
        }
        const t = this.maxHp > 1 ? this.hp / this.maxHp : 0;
        const alpha = this.lowestOpacity + (this.fullOpacity - this.lowestOpacity) * t;
        this.opacity.opacity = Math.max(0, Math.min(255, Math.round(alpha)));
    }

    private die(): void {
        if (this.dead) {
            return;
        }
        this.dead = true;
        const qi = QiManager.shared;
        if (qi && this.qiReward > 0) {
            qi.earn(this.qiReward);
        }
        this.node.destroy();
    }
}
