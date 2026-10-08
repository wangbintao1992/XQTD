#!/usr/bin/env python3
"""把水墨笔刷沿控制点路径烘焙成透明 PNG（Cocos 侧当 Sprite 用）。

算法：**反向映射**（不是逐片旋转贴）。遍历目标图上路径覆盖范围内的每个像素，
反查它在路径上的弧长 u 与横向偏移 v，再去笔刷贴图做双线性采样。
好处：像素级连续 —— 转弯处**不可能**出现片间缺口 / 扇形锯齿 / 毛刺。

用法:
  python3 tools/bake_ink_path.py \
      --controls="-390,-20;-285,-105;-180,-20;-75,-105;30,-20;140,-105;265,-25" \
      --brush=assets/resources/textures/shuimo2.png \
      --out=assets/resources/textures/path_ink2.png \
      --straight=42 --turn=92 --curvature=0.010
"""
import argparse
import math
from PIL import Image


def catmull(p0, p1, p2, p3, t):
    t2, t3 = t * t, t * t * t
    x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2
               + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3)
    y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2
               + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
    return (x, y)


def sample_spline(controls, per):
    n = len(controls)
    out = []
    for i in range(n - 1):
        p0 = controls[i - 1] if i > 0 else controls[i]
        p1, p2 = controls[i], controls[i + 1]
        p3 = controls[i + 2] if i + 2 < n else controls[i + 1]
        for s in range(per):
            out.append(catmull(p0, p1, p2, p3, s / per))
    out.append(controls[-1])
    return out


def curvature(a, b, c):
    ab = math.hypot(b[0] - a[0], b[1] - a[1])
    bc = math.hypot(c[0] - b[0], c[1] - b[1])
    ac = math.hypot(c[0] - a[0], c[1] - a[1])
    if ab < 1e-4 or bc < 1e-4 or ac < 1e-4:
        return 0.0
    s = (ab + bc + ac) / 2
    v = s * (s - ab) * (s - bc) * (s - ac)
    return 0.0 if v <= 0 else 4 * math.sqrt(v) / (ab * bc * ac)


def smoothstep(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--controls', required=True)
    ap.add_argument('--brush', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--straight', type=float, default=42)
    ap.add_argument('--turn', type=float, default=92)
    ap.add_argument('--curvature', type=float, default=0.010)
    ap.add_argument('--samples-per-segment', type=int, default=48)
    ap.add_argument('--smooth', type=int, default=4)
    ap.add_argument('--uv-tiling', type=float, default=1.0)
    ap.add_argument('--out-size', default='2048x1152')
    args = ap.parse_args()

    W, H = (int(v) for v in args.out_size.lower().split('x'))
    scale = W / 1280.0

    controls = []
    for item in args.controls.split(';'):
        item = item.strip()
        if item:
            x, y = (float(v) for v in item.split(','))
            controls.append((x, y))
    if len(controls) < 2:
        raise SystemExit('至少需要 2 个控制点')

    # 1) 采样（画布坐标 -> 图像像素）
    raw = sample_spline(controls, args.samples_per_segment)
    pts = [((p[0] + 640) * scale, (360 - p[1]) * scale) for p in raw]

    # 2) 曲率 -> 半宽（像素），并平滑
    curvs = [curvature(pts[max(0, i - 1)], pts[i], pts[min(len(pts) - 1, i + 1)]) for i in range(len(pts))]
    straight, turn = args.straight * scale * 0.5, args.turn * scale * 0.5
    half = [straight + (turn - straight) * smoothstep(k / (args.curvature or 1)) for k in curvs]
    for _ in range(max(0, args.smooth)):
        half = [(half[max(0, i - 1)] + 2 * half[i] + half[min(len(half) - 1, i + 1)]) / 4 for i in range(len(half))]

    # 3) 弧长 + 法线（对切线做平滑，急转弯法线不跳变）
    arc = [0.0]
    for i in range(1, len(pts)):
        arc.append(arc[-1] + math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
    total = arc[-1] or 1.0

    tang = []
    for i in range(len(pts)):
        a = pts[max(0, i - 1)]
        b = pts[min(len(pts) - 1, i + 1)]
        tx, ty = b[0] - a[0], b[1] - a[1]
        ln = math.hypot(tx, ty) or 1.0
        tang.append((tx / ln, ty / ln))
    # 切线平滑若干次（等价于法线平滑，避免急转弯法线突变）
    for _ in range(3):
        nxt = []
        for i in range(len(tang)):
            a = tang[max(0, i - 1)]
            b = tang[i]
            c = tang[min(len(tang) - 1, i + 1)]
            vx, vy = a[0] + 2 * b[0] + c[0], a[1] + 2 * b[1] + c[1]
            ln = math.hypot(vx, vy) or 1.0
            nxt.append((vx / ln, vy / ln))
        tang = nxt
    norm = [(-t[1], t[0]) for t in tang]

    # 4) 笔刷贴图（裁掉透明边）
    brush = Image.open(args.brush).convert('RGBA')
    brush = brush.crop(brush.split()[-1].getbbox())
    BW, BH = brush.size
    bpx = brush.load()

    # 5) 反向映射：只扫路径覆盖的包围盒
    maxHalf = max(half) + 3
    x0 = max(0, int(min(p[0] for p in pts) - maxHalf))
    x1 = min(W, int(max(p[0] for p in pts) + maxHalf) + 1)
    y0 = max(0, int(min(p[1] for p in pts) - maxHalf))
    y1 = min(H, int(max(p[1] for p in pts) + maxHalf) + 1)
    print('包围盒 %dx%d' % (x1 - x0, y1 - y0))

    # 空间索引：按 x 分桶
    bucketSize = 32
    buckets = {}
    for i, p in enumerate(pts):
        b = int(p[0] // bucketSize)
        buckets.setdefault(b, []).append(i)

    out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    opx = out.load()
    painted = 0
    for y in range(y0, y1):
        for x in range(x0, x1):
            # 在附近桶里找最近的路径点
            b = int(x // bucketSize)
            best = None
            bestD2 = 1e18
            for bb in range(b - 2, b + 3):
                for i in buckets.get(bb, ()):
                    dx = pts[i][0] - x
                    dy = pts[i][1] - y
                    d2 = dx * dx + dy * dy
                    if d2 < bestD2:
                        bestD2 = d2
                        best = i
            if best is None:
                continue
            i = best
            dx, dy = x - pts[i][0], y - pts[i][1]
            # 有符号横向偏移
            d = dx * norm[i][0] + dy * norm[i][1]
            hw = half[i]
            if hw <= 0 or abs(d) > hw:
                continue
            # 沿长度 u（按弧长），横向 v（-1..1 映射到 0..1）
            u = (arc[i] / total) * args.uv_tiling
            v = 0.5 + 0.5 * (d / hw)
            fx = min(BW - 1.001, max(0.0, u * (BW - 1)))
            fy = min(BH - 1.001, max(0.0, v * (BH - 1)))
            # 双线性采样
            bx0, by0 = int(fx), int(fy)
            bx1, by1 = min(BW - 1, bx0 + 1), min(BH - 1, by0 + 1)
            tx, ty = fx - bx0, fy - by0
            c00, c10, c01, c11 = bpx[bx0, by0], bpx[bx1, by0], bpx[bx0, by1], bpx[bx1, by1]
            r = g = bch = a = 0.0
            for ch in range(4):
                v00, v10, v01, v11 = c00[ch], c10[ch], c01[ch], c11[ch]
                top = v00 + (v10 - v00) * tx
                bot = v01 + (v11 - v01) * tx
                val = top + (bot - top) * ty
                if ch == 0:
                    r = val
                elif ch == 1:
                    g = val
                elif ch == 2:
                    bch = val
                else:
                    a = val
            if a <= 0:
                continue
            opx[x, y] = (int(r + 0.5), int(g + 0.5), int(bch + 0.5), int(a + 0.5))
            painted += 1

    for pt in ((0, 0), (W - 1, 0), (0, H - 1), (W - 1, H - 1)):
        out.putpixel(pt, (0, 0, 0, 1))

    out.save(args.out)
    print('%s 已生成 %s | 弧长 %.0fpx | 宽度 %.1f~%.1fpx | 着色像素 %d'
          % (args.out, out.size, total, min(half) * 2, max(half) * 2, painted))


if __name__ == '__main__':
    main()
