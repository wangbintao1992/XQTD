#!/usr/bin/env python3
"""把手绘标注的路径图提取成"节点 + 边"的网络，生成 assets/scripts/PathGraphData.ts。

输入：一张水墨路径图上用**红线**描出棋子要走的路的标注图
      （默认 tools/path_annotation.png）。
输出：assets/scripts/PathGraphData.ts（节点坐标 + 每条边的折线点，设计坐标 1280x720）。

流程：
  1. 取红色像素。⚠️ 必须用**色差**阈值（r-g / r-b），不能只看亮度：
     红线压在深色墨迹上时亮度会掉下去，用亮度阈值会让 mask 断成好几段。
  2. 取最大连通域 → 膨胀 + 高斯模糊 + 阈值（抹平毛刺，细化的骨架才干净）。
  3. Zhang-Suen 细化。⚠️ 邻域顺序必须是标准顺序 P2=上, P3=右上, ..., P9=左上；
     顺序错位（比如对到对角邻居）会让细化**把线切断**，骨架碎成一堆小块。
  4. 节点聚类（半径 R）+ 短边合并（长度 <= MIN）+ 度 2 节点合并，
     把细化在斜线处产生的"阶梯"假岔路吃掉，得到真正的网络。
  5. 按固定步长抽稀每条边的折线，转成设计坐标（图 2048x1152 与设计 1280x720 同为 16:9）。

用法:
  python3 tools/extract_path_graph.py                       # 用默认输入/输出
  python3 tools/extract_path_graph.py --image path/to.png   # 换一张标注图
"""
import argparse
from collections import Counter, deque

from PIL import Image, ImageFilter

IMG_W, IMG_H = 2048, 1152      # 标注图尺寸
DESIGN_W, DESIGN_H = 1280, 720  # Cocos 设计分辨率（原点在 Canvas 中心）
R_CLUSTER = 8                  # 节点聚类半径（像素）
MIN_EDGE = 40                  # 短于此长度的边被合并掉（像素）
POINT_STEP = 18                # 折线抽稀步长（像素）

ALL = [(dx, dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1) if dx or dy]
# Zhang-Suen 的标准八邻域顺序：P2=上, P3=右上, P4=右, P5=右下, P6=下, P7=左下, P8=左, P9=左上
NB = [(0, -1), (1, -1), (1, 0), (1, 1), (0, 1), (-1, 1), (-1, 0), (-1, -1)]


def red_mask(px, w, h):
    """红色像素判定：用色差，不用亮度。"""
    mask = Image.new("L", (w, h), 0)
    mp = mask.load()
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if r - g > 12 and r - b > 12 and r > 40:
                mp[x, y] = 255
    return mask


def largest_blob(mask, w, h):
    src = mask.load()
    lab = [[-1] * w for _ in range(h)]
    best, best_n, cur = -1, 0, 0
    for y in range(h):
        for x in range(w):
            if src[x, y] and lab[y][x] < 0:
                q = deque([(x, y)])
                lab[y][x] = cur
                n = 0
                while q:
                    cx, cy = q.popleft()
                    n += 1
                    for dx, dy in ALL:
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < w and 0 <= ny < h and src[nx, ny] and lab[ny][nx] < 0:
                            lab[ny][nx] = cur
                            q.append((nx, ny))
                if n > best_n:
                    best, best_n = cur, n
                cur += 1
    out = Image.new("L", (w, h), 0)
    op = out.load()
    for y in range(h):
        for x in range(w):
            if src[x, y] and lab[y][x] == best:
                op[x, y] = 255
    return out, cur, best_n


def skeleton(points, w, h):
    """Zhang-Suen 细化，输入/输出都是 (y*w+x) 的索引集合。"""
    s = set(points)

    def nbrs_of(i, cur):
        x, y = i % w, i // w
        out = []
        for d in NB:
            nx, ny = x + d[0], y + d[1]
            if 0 <= nx < w and 0 <= ny < h and (ny * w + nx) in cur:
                out.append(d)
        return out

    def transitions(nl):
        p = [0] * 8
        for d in nl:
            p[NB.index(d)] = 1
        q = p + p[:1]
        return sum(1 for k in range(8) if q[k] == 0 and q[k + 1] == 1), p

    changed, guard = True, 0
    while changed and guard < 300:
        guard += 1
        changed = False
        for step in (0, 1):
            candidates = []
            for i in list(s):
                nl = nbrs_of(i, s)
                if len(nl) < 2 or len(nl) > 6:
                    continue
                a, p = transitions(nl)
                if a != 1:
                    continue
                p2, p3, p4, p5, p6, p7, p8, p9 = p
                if step == 0 and (p2 * p4 * p6 or p4 * p6 * p8):
                    continue
                if step == 1 and (p2 * p4 * p8 or p2 * p6 * p8):
                    continue
                candidates.append(i)
            if candidates:
                changed = True
                for i in candidates:
                    s.discard(i)
    return s


def nb8(i, s, w, h):
    x, y = i % w, i // w
    out = []
    for dx, dy in ALL:
        nx, ny = x + dx, y + dy
        if 0 <= nx < w and 0 <= ny < h and (ny * w + nx) in s:
            out.append(ny * w + nx)
    return out


def dilate(s, r, w, h):
    cur = set(s)
    for _ in range(r):
        nxt = set(cur)
        for i in cur:
            x, y = i % w, i // w
            for dx, dy in ALL:
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h:
                    nxt.add(ny * w + nx)
        cur = nxt
    return cur


def build_edges(skel, w, h):
    deg8 = {i: len(nb8(i, skel, w, h)) for i in skel}
    node_px = {i for i in skel if deg8[i] != 2}

    grown = dilate(node_px, R_CLUSTER, w, h)
    cid = {}
    for i in sorted(grown):
        if i in cid:
            continue
        c = max(cid.values()) + 1 if cid else 0
        q = deque([i])
        cid[i] = c
        while q:
            j = q.popleft()
            x, y = j % w, j // w
            for dx, dy in ALL:
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h:
                    k = ny * w + nx
                    if k in grown and k not in cid:
                        cid[k] = c
                        q.append(k)
    cid_of = {i: cid[i] for i in node_px}

    edges, seen_pairs, visited = [], set(), set()
    for i in node_px:
        for q in nb8(i, skel, w, h):
            if q in node_px:
                if cid_of[q] != cid_of[i]:
                    key = (min(i, q), max(i, q))
                    if key not in seen_pairs:
                        seen_pairs.add(key)
                        edges.append([cid_of[i], cid_of[q], [i, q]])
                continue
            if (i, q) in visited:
                continue
            visited.add((i, q))
            path, prev, cur_i = [i, q], i, q
            while True:
                cands = [k for k in nb8(cur_i, skel, w, h) if k != prev]
                if not cands:
                    break
                hit = [k for k in cands if k in node_px]
                if hit:
                    path.append(hit[0])
                    visited.add((cur_i, hit[0]))
                    edges.append([cid_of[i], cid_of[hit[0]], path])
                    break
                nxt = [k for k in cands if k not in path[-3:]]
                if not nxt:
                    break
                path.append(nxt[0])
                visited.add((cur_i, nxt[0]))
                prev, cur_i = cur_i, nxt[0]

    parent = list(range(max(cid.values()) + 1))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    for a, b, p in edges:
        if len(p) <= MIN_EDGE:
            ra, rb = find(a), find(b)
            if ra != rb:
                parent[rb] = ra

    merged, seen_key = [], set()
    for a, b, p in edges:
        ra, rb = find(a), find(b)
        if ra == rb:
            continue
        key = (min(ra, rb), max(ra, rb))
        if key in seen_key:
            continue
        seen_key.add(key)
        merged.append([ra, rb, p])
    return merged


def collapse_degree2(edges):
    """把度 2 的中间节点合并掉：两条边拼成一条，直到没有度 2 节点。"""
    changed = True
    while changed:
        changed = False
        adj = {}
        for k, (a, b, _) in enumerate(edges):
            adj.setdefault(a, []).append(k)
            adj.setdefault(b, []).append(k)
        for nd, lst in list(adj.items()):
            if len(lst) != 2:
                continue
            k1, k2 = lst
            if k1 == k2:
                continue
            a1, b1, p1 = edges[k1]
            a2, b2, p2 = edges[k2]
            q1, q2 = list(p1), list(p2)
            # 拼接要求：q1 以 nd 收尾，q2 以 nd 开头（否则合并出来的折线会乱跳）
            if a1 == nd:
                q1.reverse()
            if b2 == nd:
                q2.reverse()
            if q1[-1] == q2[-1]:
                q2.reverse()
            other1 = b1 if a1 == nd else a1
            other2 = a2 if b2 == nd else b2
            newp = q1 + q2[1:]
            if other1 == other2 and len(newp) < 60:
                continue
            edges = [e for kk, e in enumerate(edges) if kk not in (k1, k2)]
            edges.append([other1, other2, newp])
            changed = True
            break
    return edges


def to_design(i, w, h):
    x, y = i % w, i // w
    ix, iy = x * IMG_W / w, y * IMG_H / h
    return ((ix / IMG_W - 0.5) * DESIGN_W, (0.5 - iy / IMG_H) * DESIGN_H)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--image", default="tools/path_annotation.png", help="标注图（红笔描路径）")
    ap.add_argument("--out", default="assets/scripts/PathGraphData.ts", help="输出的 TS 数据文件")
    args = ap.parse_args()

    im = Image.open(args.image).convert("RGB")
    w, h = im.size
    px = im.load()

    mask = red_mask(px, w, h)
    blob, nblob, biggest = largest_blob(mask, w, h)
    print(f"red mask: {nblob} blobs, largest {biggest} px")
    blob = blob.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(3)).point(
        lambda v: 255 if v > 128 else 0)
    bp = blob.load()
    skel = skeleton({y * w + x for y in range(h) for x in range(w) if bp[x, y] > 0}, w, h)
    print(f"skeleton: {len(skel)} px")

    edges = collapse_degree2(build_edges(skel, w, h))
    deg = Counter()
    for a, b, _ in edges:
        deg[a] += 1
        deg[b] += 1
    print(f"graph: {len(deg)} nodes, {len(edges)} edges, degree histogram {dict(sorted(Counter(deg.values()).items()))}")

    pos = {}
    for a, b, p in edges:
        pos.setdefault(a, p[0])
        pos.setdefault(b, p[-1])
    ids = {nd: k for k, nd in enumerate(sorted(pos))}

    out_edges = []
    total = 0.0
    for a, b, p in edges:
        pts = p[::POINT_STEP]
        if pts[-1] != p[-1]:
            pts.append(p[-1])
        flat = []
        for i in pts:
            dx, dy = to_design(i, w, h)
            flat.append(round(dx, 1))
            flat.append(round(dy, 1))
        length = 0.0
        for k in range(1, len(p)):
            x1, y1 = p[k - 1] % w, p[k - 1] // w
            x2, y2 = p[k] % w, p[k] // w
            length += ((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5
        length *= DESIGN_W / w
        total += length
        out_edges.append((ids[a], ids[b], round(length, 1), flat))

    with open(args.out, "w") as f:
        f.write("// AUTO-GENERATED by tools/extract_path_graph.py — do not edit by hand.\n")
        f.write(f"// Source annotation: {args.image}\n")
        f.write("// Design space: 1280x720, origin at the Canvas centre.\n\n")
        f.write("export interface PathGraphNode { x: number; y: number; }\n")
        f.write("export interface PathGraphEdge {\n    a: number;\n    b: number;\n"
                "    /** edge length in design units */\n    length: number;\n"
                "    /** flattened [x0,y0, x1,y1, ...] polyline from node a to node b */\n"
                "    points: number[];\n}\n\n")
        f.write("export const PATH_GRAPH_NODES: PathGraphNode[] = [\n")
        for nd in sorted(pos):
            dx, dy = to_design(pos[nd], w, h)
            f.write(f"    {{ x: {round(dx, 1)}, y: {round(dy, 1)} }},\n")
        f.write("];\n\n")
        f.write("export const PATH_GRAPH_EDGES: PathGraphEdge[] = [\n")
        for a, b, length, flat in out_edges:
            f.write(f"    {{ a: {a}, b: {b}, length: {length}, points: [{', '.join(str(v) for v in flat)}] }},\n")
        f.write("];\n")
    print(f"wrote {args.out}: {len(pos)} nodes, {len(out_edges)} edges, total length {total:.0f} design units")


if __name__ == "__main__":
    main()
