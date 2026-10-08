import { _decorator, Component, instantiate, Node, Vec3 } from 'cc';
import { PathMover } from './PathMover';

const { ccclass, property } = _decorator;

/**
 * 出兵：把敌人模板克隆 `count` 份，沿路径等间距排成一条队列（"连着，带一点空挡"）。
 *
 * 做法：不改移动逻辑，只给每个卒设不同的**初始弧长** `PathMover.startDistance`
 * （第 i 个 = leadOffset + i × spacing）。大家速度一样，所以队列间距恒定不变。
 */
@ccclass('EnemySpawner')
export class EnemySpawner extends Component {
    @property({ type: Node, tooltip: '敌人模板节点（会被克隆；模板自身会隐藏，只当模子）' })
    public template: Node | null = null;

    @property({ tooltip: '模板节点名（本级或父级里找）' })
    public templateName = 'Enemy';

    @property({ tooltip: '出兵数量' })
    public count = 10;

    @property({ tooltip: '沿路径的间隔（设计单位）。卒是 62×62，取 78 左右就留出一点空挡' })
    public spacing = 78;

    @property({ tooltip: '第一个卒距离路径起点的弧长（想让队伍晚点出现就调大）' })
    public leadOffset = 0;

    @property({ tooltip: '容器节点名；留空 = 生成在本节点下' })
    public containerName = '';

    @property({ tooltip: '启动时自动出兵' })
    public autoDeployOnStart = true;

    @property({ tooltip: '出兵时打控制台日志' })
    public debugLog = true;

    private spawned: Node[] = [];

    /** 本轮总共出了多少兵。 */
    public get totalCount(): number {
        return this.spawned.length;
    }

    public get aliveCount(): number {
        let n = 0;
        for (const node of this.spawned) {
            if (node && node.isValid && node.activeInHierarchy) {
                n += 1;
            }
        }
        return n;
    }

    protected onLoad(): void {
        if (this.autoDeployOnStart) {
            this.deploy();
        }
    }

    /** 清掉上一队并按当前参数重新出一队。 */
    public deploy(): void {
        this.clear();
        const tpl = this.resolveTemplate();
        if (!tpl) {
            console.warn('[EnemySpawner] 找不到敌人模板节点');
            return;
        }
        const parent = this.resolveContainer() || this.node;
        const total = Math.max(1, Math.floor(this.count));

        // 模板只当模子，不参与游戏
        tpl.active = false;

        for (let i = 0; i < total; i += 1) {
            const node = instantiate(tpl);
            node.active = true;
            node.name = 'Enemy_' + i;
            parent.addChild(node);
            node.setPosition(tpl.position as Vec3);

            const mover = node.getComponent(PathMover);
            if (mover) {
                // 克隆体挂在容器下，同级没有 Path，得显式指过去
                if (!mover.pathRoot) {
                    const host = this.node.parent;
                    const pathNode = host ? host.getChildByName('Path') : null;
                    if (pathNode) {
                        mover.pathRoot = pathNode;
                    }
                }
                mover.rebuild();        // 按新起点长度重新采样路径
                mover.setProgress(this.leadOffset + i * this.spacing);   // 立刻摆好位置
            }
            this.spawned.push(node);
        }

        if (this.debugLog) {
            console.log('[EnemySpawner] 出兵 ' + total + ' 个，间隔 ' + this.spacing + '，容器 ' + parent.name);
        }
    }

    /** 移除当前所有卒（连容器里别人塞进来的残留一起清掉）。 */
    public clear(): void {
        for (const node of this.spawned) {
            if (node && node.isValid) {
                node.removeFromParent();
                node.destroy();
            }
        }
        this.spawned = [];
        const host = this.resolveContainer() || this.node;
        for (const child of host.children.slice()) {
            child.removeFromParent();
            child.destroy();
        }
    }

    /** 立刻清场（波次结束等场景用）。 */
    public killAll(): void {
        this.clear();
    }

    private resolveTemplate(): Node | null {
        const configured = this.template as unknown as Node;
        if (configured && configured.isValid) {
            return configured;
        }
        const parent = this.node.parent;
        const here = this.node.getChildByName(this.templateName);
        if (here) {
            return here;
        }
        if (parent && parent.getChildByName(this.templateName)) {
            return parent.getChildByName(this.templateName);
        }
        return null;
    }

    private resolveContainer(): Node | null {
        if (!this.containerName) {
            return this.node;
        }
        const here = this.node.getChildByName(this.containerName);
        if (here) {
            return here;
        }
        const parent = this.node.parent;
        return parent ? parent.getChildByName(this.containerName) : null;
    }
}
