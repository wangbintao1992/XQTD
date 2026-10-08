import {
    _decorator,
    Component,
    ImageAsset,
    Node,
    Rect,
    Sprite,
    SpriteFrame,
    Texture2D,
    UITransform,
    Vec3,
    resources,
    gfx,
} from 'cc';
import { sampleSpline } from './PathSpline';

const { ccclass, property } = _decorator;

/** 内部用的路径采样点信息。 */
interface InkPoint {
    x: number;      // 画布坐标
    y: number;
    arc: number;    // 累计弧长
    hw: number;     // 半宽
    nx: number;     // 单位法线
    ny: number;
}

/**
 * 运行时**随机生成**水墨路径：算好采样/宽度后，把笔触贴图烘焙成一张新纹理，
 * 交给同节点的 Sprite 显示（不走自定义渲染组件，编辑器与运行时都能看到）。
 *
 * 流程：
 *  1. `regenerate()` 随机出一串控制点（起终点 X 固定，中间上下起伏随机），
 *     写进 `pathRoot` 的子节点 —— 敌人用的 PathMover 会读同一批点，所以寻路和画面一致；
 *  2. Catmull-Rom 采样 + 曲率算宽度（转弯粗、直线细，平滑过渡）；
 *  3. **反向映射**生成像素：遍历路径覆盖范围，每个像素反查它的弧长 u 与横向偏移 v，
 *     去笔触贴图双线性采样 —— 像素级连续，转弯处不会有缺口/扇形锯齿；
 *  4. 生成 Texture2D → SpriteFrame → 赋给 Sprite，并按包围盒摆好位置。
 *
 * 每次进入关卡（或点一下）调用一次 `regenerate()` 就换一条新路径。
 */
@ccclass('InkPathGenerator')
export class InkPathGenerator extends Component {
    @property({ type: SpriteFrame, tooltip: '水墨笔刷贴图（横向长条，两端收笔的那种）' })
    public brushFrame: SpriteFrame | null = null;

    @property({ tooltip: '笔刷贴图在 resources 下的路径（组件上没填时用）' })
    public brushResourcePath = 'textures/shuimo/spriteFrame';

    @property({ type: Node, tooltip: '控制点父节点（会按随机结果重建子节点）；留空则按 pathRootName 找' })
    public pathRoot: Node | null = null;

    @property({ tooltip: '控制点父节点名字' })
    public pathRootName = 'Path';

    @property({ tooltip: '控制点数量下限（含首尾）' })
    public minControls = 5;

    @property({ tooltip: '控制点数量上限（含首尾）' })
    public maxControls = 7;

    @property({ tooltip: '路径左端 X（设计单位）' })
    public startX = -390;

    @property({ tooltip: '路径右端 X（设计单位）' })
    public endX = 265;

    @property({ tooltip: '起伏区域的下边界 Y' })
    public bottomY = -100;

    @property({ tooltip: '起伏区域的上边界 Y' })
    public topY = 230;

    @property({ tooltip: '起点固定 Y（NaN 表示随机）' })
    public startY = 20;

    @property({ tooltip: '终点固定 Y（NaN 表示随机）' })
    public endY = 90;

    @property({ tooltip: '直线段笔触宽度（细）' })
    public straightWidth = 40;

    @property({ tooltip: '转弯处笔触宽度（粗）' })
    public turnWidth = 92;

    @property({ tooltip: '达到最粗的曲率阈值' })
    public turnCurvature = 0.010;

    @property({ tooltip: '宽度平滑次数（防突变）' })
    public widthSmoothPasses = 4;

    @property({ tooltip: '每段控制点之间的采样数（越大越顺）' })
    public samplesPerSegment = 40;

    @property({ tooltip: '贴图沿路径平铺次数（=1 时两端正好是起收笔）' })
    public uvTiling = 1;

    @property({ tooltip: '启动时自动随机一条' })
    public autoGenerateOnStart = true;

    @property({ tooltip: '强制用程序化笔触（不读素材像素）：编辑器与运行时观感一致、最稳，推荐开启' })
    public useProceduralBrush = true;

    @property({ tooltip: '把生成结果打到控制台，便于排查' })
    public debugLog = true;

    private brushPixels: Uint8Array | null = null;
    private brushW = 0;
    private brushH = 0;
    private lastControls: Vec3[] = [];

    protected onLoad(): void {
        this.loadBrush(() => {
            if (this.autoGenerateOnStart) {
                this.regenerate();
            }
        });
    }

    /** 随机一条新路径并刷新画面。 */
    public regenerate(): void {
        if (!this.brushPixels) {
            this.loadBrush(() => this.regenerate());
            return;
        }
        const controls = this.randomControls();
        this.lastControls = controls;
        this.writeControls(controls);

        // 采样 + 宽度
        const raw = sampleSpline(controls, this.samplesPerSegment);
        const pts = raw.map((p) => ({ x: p.x, y: p.y }));

        // 曲率（三点外接圆）
        const curv: number[] = [];
        for (let i = 0; i < pts.length; i += 1) {
            const a = pts[Math.max(0, i - 1)];
            const b = pts[i];
            const c = pts[Math.min(pts.length - 1, i + 1)];
            const ab = Math.hypot(b.x - a.x, b.y - a.y);
            const bc = Math.hypot(c.x - b.x, c.y - b.y);
            const ac = Math.hypot(c.x - a.x, c.y - a.y);
            if (ab < 1e-4 || bc < 1e-4 || ac < 1e-4) {
                curv.push(0);
                continue;
            }
            const s = (ab + bc + ac) / 2;
            const v = s * (s - ab) * (s - bc) * (s - ac);
            curv.push(v <= 0 ? 0 : (4 * Math.sqrt(v)) / (ab * bc * ac));
        }

        const smoothstep = (x: number) => {
            const t = Math.max(0, Math.min(1, x));
            return t * t * (3 - 2 * t);
        };
        let half = curv.map((k) => {
            const t = smoothstep(k / (this.turnCurvature || 1));
            return (this.straightWidth + (this.turnWidth - this.straightWidth) * t) * 0.5;
        });
        for (let p = 0; p < Math.max(0, this.widthSmoothPasses); p += 1) {
            half = half.map((_, i) => (half[Math.max(0, i - 1)] + 2 * half[i] + half[Math.min(half.length - 1, i + 1)]) / 4);
        }

        // 弧长 + 法线（切线平滑免得急转弯法线跳变）
        let tang: { x: number; y: number }[] = [];
        for (let i = 0; i < pts.length; i += 1) {
            const a = pts[Math.max(0, i - 1)];
            const b = pts[Math.min(pts.length - 1, i + 1)];
            let tx = b.x - a.x;
            let ty = b.y - a.y;
            const ln = Math.hypot(tx, ty) || 1;
            tang.push({ x: tx / ln, y: ty / ln });
        }
        for (let p = 0; p < 3; p += 1) {
            tang = tang.map((_, i) => {
                const a = tang[Math.max(0, i - 1)];
                const b = tang[i];
                const c = tang[Math.min(tang.length - 1, i + 1)];
                let vx = a.x + 2 * b.x + c.x;
                let vy = a.y + 2 * b.y + c.y;
                const ln = Math.hypot(vx, vy) || 1;
                return { x: vx / ln, y: vy / ln };
            });
        }

        const list: InkPoint[] = [];
        let arc = 0;
        for (let i = 0; i < pts.length; i += 1) {
            if (i > 0) {
                arc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
            }
            list.push({ x: pts[i].x, y: pts[i].y, arc, hw: half[i], nx: -tang[i].y, ny: tang[i].x });
        }
        const total = arc || 1;

        // 生成纹理并挂上去
        const frame = this.buildTexture(list, total);
        if (frame) {
            const sprite = this.getComponent(Sprite) || this.node.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.type = Sprite.Type.SIMPLE;
            sprite.trim = false;
            sprite.spriteFrame = frame;
            const center = (frame as any).inkCenter as Vec3 | undefined;
            if (center) {
                this.node.setPosition(center);
            }

            const transform = this.node.getComponent(UITransform) || this.node.addComponent(UITransform);
            transform.setAnchorPoint(0.5, 0.5);
            transform.setContentSize(frame.rect.width, frame.rect.height);
        }

        // 让走同一条路径的敌人重新采样
        this.notifyMovers();
        this.log('路径已生成：%d 个控制点，纹理 %dx%d，位置 (%d, %d)',
            controls.length, frame ? frame.rect.width : 0, frame ? frame.rect.height : 0,
            Math.round(this.node.position.x), Math.round(this.node.position.y));
    }

    public get controls(): Vec3[] {
        return this.lastControls;
    }

    /* ------------------------------------------------------------------ */

    /** 随机控制点：起终点 X 固定，中间上下交错、幅度随机。 */
    private randomControls(): Vec3[] {
        const count = this.minControls + Math.floor(Math.random() * Math.max(1, this.maxControls - this.minControls + 1));
        const mid = (this.topY + this.bottomY) / 2;
        const amp = (this.topY - this.bottomY) / 2;
        const out: Vec3[] = [];
        for (let i = 0; i < count; i += 1) {
            const t = count > 1 ? i / (count - 1) : 0;
            const x = this.startX + (this.endX - this.startX) * t;
            let y: number;
            if (i === 0 && !Number.isNaN(this.startY)) {
                y = this.startY;
            } else if (i === count - 1 && !Number.isNaN(this.endY)) {
                y = this.endY;
            } else {
                const dir = i % 2 === 0 ? -1 : 1;
                y = mid + dir * amp * (0.5 + Math.random() * 0.45);
            }
            out.push(new Vec3(x, y, 0));
        }
        return out;
    }

    /** 把控制点写进 pathRoot（重建子节点，保证顺序）。 */
    private writeControls(controls: Vec3[]): void {
        const root = this.resolvePathRoot();
        if (!root) {
            return;
        }
        for (const child of root.children.slice()) {
            child.removeFromParent();
            child.destroy();
        }
        controls.forEach((p, i) => {
            const node = new Node(`P${i}`);
            node.layer = root.layer;
            root.addChild(node);
            node.setPosition(p);
        });
    }

    /** 通知所有读这条路径的 PathMover 重新采样。 */
    private notifyMovers(): void {
        const root = this.resolvePathRoot();
        const canvas = root ? root.parent : this.node.parent;
        if (!canvas) {
            return;
        }
        const walk = (node: Node) => {
            for (const comp of node.components) {
                const anyComp = comp as any;
                if (anyComp && typeof anyComp.rebuild === 'function' && typeof anyComp.lapCount === 'number') {
                    try {
                        anyComp.rebuild();
                    } catch (e) {
                        console.warn('[InkPathGenerator] rebuild 失败', e);
                    }
                }
            }
            for (const child of node.children) {
                walk(child);
            }
        };
        walk(canvas);
    }

    /** 反向映射生成纹理。 */
    private buildTexture(list: InkPoint[], total: number): SpriteFrame | null {
        if (!this.brushPixels || list.length < 2) {
            return null;
        }

        let maxHw = 0;
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        for (const p of list) {
            maxHw = Math.max(maxHw, p.hw);
            minX = Math.min(minX, p.x);
            maxX = Math.max(maxX, p.x);
            minY = Math.min(minY, p.y);
            maxY = Math.max(maxY, p.y);
        }
        const pad = Math.ceil(maxHw) + 3;
        const originX = Math.floor(minX - pad);
        const originY = Math.floor(minY - pad);
        const width = Math.min(4096, Math.ceil(maxX - minX + pad * 2));
        const height = Math.min(4096, Math.ceil(maxY - minY + pad * 2));
        if (width < 4 || height < 4) {
            return null;
        }

        const buffer = new Uint8Array(width * height * 4);
        const bw = this.brushW;
        const bh = this.brushH;
        const bp = this.brushPixels;

        // 空间桶加速最近点查询
        const bucket = 32;
        const buckets = new Map<number, number[]>();
        for (let i = 0; i < list.length; i += 1) {
            const key = Math.floor(list[i].x / bucket);
            const arr = buckets.get(key);
            if (arr) {
                arr.push(i);
            } else {
                buckets.set(key, [i]);
            }
        }

        for (let py = 0; py < height; py += 1) {
            const wy = originY + (height - 1 - py);
            for (let px = 0; px < width; px += 1) {
                const wx = originX + px;
                const key = Math.floor(wx / bucket);
                let best = -1;
                let bestD2 = Infinity;
                for (let k = key - 2; k <= key + 2; k += 1) {
                    const arr = buckets.get(k);
                    if (!arr) {
                        continue;
                    }
                    for (const i of arr) {
                        const dx = list[i].x - wx;
                        const dy = list[i].y - wy;
                        const d2 = dx * dx + dy * dy;
                        if (d2 < bestD2) {
                            bestD2 = d2;
                            best = i;
                        }
                    }
                }
                if (best < 0) {
                    continue;
                }
                const p = list[best];
                const dx = wx - p.x;
                const dy = wy - p.y;
                const d = dx * p.nx + dy * p.ny;
                if (p.hw <= 0 || Math.abs(d) > p.hw) {
                    continue;
                }
                const u = (p.arc / total) * this.uvTiling;
                const v = 0.5 + 0.5 * (d / p.hw);
                const fx = Math.max(0, Math.min(bw - 1.001, u * (bw - 1)));
                const fy = Math.max(0, Math.min(bh - 1.001, v * (bh - 1)));
                const x0 = fx | 0;
                const y0 = fy | 0;
                const x1 = Math.min(bw - 1, x0 + 1);
                const y1 = Math.min(bh - 1, y0 + 1);
                const tx = fx - x0;
                const ty = fy - y0;
                const o = (py * width + px) * 4;
                for (let ch = 0; ch < 4; ch += 1) {
                    const i00 = (y0 * bw + x0) * 4 + ch;
                    const i10 = (y0 * bw + x1) * 4 + ch;
                    const i01 = (y1 * bw + x0) * 4 + ch;
                    const i11 = (y1 * bw + x1) * 4 + ch;
                    const top = bp[i00] + (bp[i10] - bp[i00]) * tx;
                    const bot = bp[i01] + (bp[i11] - bp[i01]) * tx;
                    buffer[o + ch] = top + (bot - top) * ty;
                }
            }
        }

        const texture = new Texture2D();
        texture.reset({ width, height, format: gfx.Format.RGBA8 });
        texture.uploadData(buffer);

        const frame = new SpriteFrame();
        frame.texture = texture;
        frame.rect = new Rect(0, 0, width, height);
        (frame as any).inkCenter = new Vec3(originX + width / 2, originY + height / 2, 0);
        return frame;
    }

    /**
     * 程序化水墨笔触（贴图像素读不到时用）：
     * - 横向 v 方向中间厚、两边薄（毛笔圆润感）；
     * - 纵向 u 方向两端收笔；
     * - 叠加两层值噪声做飞白与墨色深浅，边缘因此带毛糙感。
     */
    private makeProceduralBrush(): void {
        const w = 768;
        const h = 160;
        const buf = new Uint8Array(w * h * 4);
        const hash = (x: number, y: number) => {
            const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
            return v - Math.floor(v);
        };
        const noise = (x: number, y: number) => {
            const xi = Math.floor(x);
            const yi = Math.floor(y);
            const xf = x - xi;
            const yf = y - yi;
            const u = xf * xf * (3 - 2 * xf);
            const v = yf * yf * (3 - 2 * yf);
            const a = hash(xi, yi);
            const b = hash(xi + 1, yi);
            const c = hash(xi, yi + 1);
            const d = hash(xi + 1, yi + 1);
            return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
        };
        for (let y = 0; y < h; y += 1) {
            const v = y / (h - 1);
            const dv = (v - 0.5) * 2;
            const prof = Math.pow(Math.max(0, 1 - dv * dv), 0.55);
            for (let x = 0; x < w; x += 1) {
                const u = x / (w - 1);
                const envIn = Math.min(1, u / 0.10);
                const envOut = Math.min(1, (1 - u) / 0.10);
                const env = envIn * envOut;
                const envS = env * env * (3 - 2 * env);
                const n1 = noise(u * 26, v * 9);
                const n2 = noise(u * 90, v * 3);
                let a = prof * envS * (0.55 + 0.55 * n1 * (0.6 + 0.4 * n2));
                a = Math.min(1, Math.max(0, a));
                const ink = 26 + Math.round(n2 * 26);
                const o = (y * w + x) * 4;
                buf[o] = ink;
                buf[o + 1] = ink;
                buf[o + 2] = ink + 4;
                buf[o + 3] = Math.round(a * 255);
            }
        }
        this.brushPixels = buf;
        this.brushW = w;
        this.brushH = h;
    }

    private loadBrush(done: () => void): void {
        let called = false;
        const finish = (frame: SpriteFrame | null) => {
            if (called) {
                return;
            }
            called = true;
            try {
                if (this.useProceduralBrush) {
                    this.makeProceduralBrush();
                    this.log('使用程序化笔触 %dx%d', this.brushW, this.brushH);
                    return;
                }
                if (!this.pickupBrushPixels(frame)) {
                    this.log('读不到笔刷像素，降级为程序化笔触');
                    this.makeProceduralBrush();
                } else {
                    this.log('使用素材笔触 %dx%d', this.brushW, this.brushH);
                }
            } catch (e) {
                console.warn('[InkPathGenerator] 笔刷准备异常，降级为程序化笔触', e);
                try {
                    this.makeProceduralBrush();
                } catch (e2) {
                    console.error('[InkPathGenerator] 程序化笔触也失败了', e2);
                }
            } finally {
                done();
            }
        };

        try {
            const configured = this.brushFrame as unknown as SpriteFrame;
            if (configured && (configured as any).texture) {
                finish(configured);
                return;
            }
            resources.load(this.brushResourcePath, SpriteFrame, (err, loaded) => {
                if (err || !loaded) {
                    this.log('笔刷加载失败，降级为程序化笔触：%s', err ? (err as any).message || err : 'empty');
                    finish(null);
                    return;
                }
                this.brushFrame = loaded;
                finish(loaded);
            });
        } catch (e) {
            console.warn('[InkPathGenerator] resources.load 抛异常，降级为程序化笔触', e);
            finish(null);
        }
    }

    /**
     * 尝试从贴图拿到 RGBA 像素。返回 false 表示拿不到（或数据不可信）。
     * 注意：浏览器/小游戏里 `image.data` 可能是 HTMLImageElement / ImageBitmap / ArrayBuffer，
     * 只有确定是足量字节时才敢用 —— 否则会得到「全透明」的纹理（表现为运行后看不到路径）。
     */
    private pickupBrushPixels(frame: SpriteFrame | null): boolean {
        const tex = frame && frame.texture ? frame.texture : null;
        if (!tex) {
            return false;
        }
        const tw = tex.width || 0;
        const th = tex.height || 0;
        const need = tw * th * 4;

        if (tex.getPixels) {
            try {
                const px = tex.getPixels();
                if (px && px.length >= need && need > 0) {
                    this.brushPixels = px;
                    this.brushW = tw;
                    this.brushH = th;
                    return true;
                }
            } catch (e) {
                this.log('getPixels 不可用：%s', (e as any).message || e);
            }
        }

        try {
            const image: any = (tex as any).image;
            const data: any = image && image.data;
            let buffer: ArrayBuffer | null = null;
            if (data instanceof ArrayBuffer) {
                buffer = data;
            } else if (data && data.buffer instanceof ArrayBuffer) {
                buffer = data.buffer;
            }
            const w = (image && image.width) || tw;
            const h = (image && image.height) || th;
            if (buffer && buffer.byteLength >= w * h * 4 && w > 0 && h > 0) {
                this.brushPixels = new Uint8Array(buffer);
                this.brushW = w;
                this.brushH = h;
                return true;
            }
            this.log('image.data 不是可用的像素字节（type=%s）', data ? data.constructor.name : 'null');
        } catch (e) {
            this.log('读取 image.data 失败：%s', (e as any).message || e);
        }

        return false;
    }

    private log(msg: string, ...args: any[]): void {
        if (this.debugLog) {
            console.log('[InkPathGenerator] ' + msg, ...args);
        }
    }

    private resolvePathRoot(): Node | null {
        const configured = this.pathRoot as unknown as Node;
        if (configured && configured.isValid) {
            return configured;
        }
        const parent = this.node.parent;
        if (!parent) {
            return null;
        }
        return parent.getChildByName(this.pathRootName);
    }
}
