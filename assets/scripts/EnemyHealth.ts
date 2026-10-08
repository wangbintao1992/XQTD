import { QiManager } from './QiManager';
import {
    _decorator,
    Component,
    EventTouch,
    Node,
    Sprite,
    SpriteFrame,
    tween,
    UIOpacity,
    UITransform,
    Vec3,
    resources,
} from 'cc';

const { ccclass, property } = _decorator;

/**
 * 敌人血量：每受一次伤更透明一点，血尽则整个节点消失。
 *
 * - 透明度用 `UIOpacity`（会级联到子节点，所以卒身上的装饰一起淡出）；
 * - 塔/子弹打中时调 `takeDamage(1)` 即可，不需要知道这里怎么实现；
 * - `damageOnTouch` 只是为了现在还没做塔的时候能手动点一下验证效果。
 */
@ccclass('EnemyHealth')
export class EnemyHealth extends Component {
    @property({ tooltip: '初始血量' })
    public maxHp = 3;

    @property({ tooltip: '满血时的不透明度（0-255）' })
    public fullOpacity = 255;

    @property({ tooltip: '只剩 1 血时的不透明度（0-255）' })
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

    /** 特效贴图全局缓存，避免每个卒都去 load 一次。 */
    private static effectFrame: SpriteFrame | null = null;
    private static effectLoading = false;

    private hp = 0;
    private opacity: UIOpacity | null = null;
    private dead = false;

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
        this.playHitEffect();
        if (this.debugLog) {
            console.log('[EnemyHealth] hp=' + this.hp + ' of ' + this.maxHp);
        }
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

        // 顺带轻微放大，像墨汁炸开
        node.setScale(0.85, 0.85, 1);
        tween(node).to(0.16, { scale: new Vec3(1, 1, 1) }).start();
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
        const t = this.maxHp > 1 ? this.hp / this.maxHp : 0;
        const alpha = this.lowestOpacity + (this.fullOpacity - this.lowestOpacity) * t;
        if (this.opacity) {
            this.opacity.opacity = Math.max(0, Math.min(255, Math.round(alpha)));
        }
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
