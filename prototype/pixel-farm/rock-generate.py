#!/usr/bin/env python3
"""柳湾地表岩石与矿点 · 48×48 透明像素精灵。

岩体是一块紧凑的块状石：约 30 像素宽、24~27 像素高，接近方形，底边平贴 y=44，
顶边由三段不同坡度的斜边拼成，左右不对称。上色不用渐变，而是按「离轮廓的步数」
分成三层：最外一圈最深（轮廓），次外一圈次深，里面是中间调；再压一块左上受光的
亮面（亮面核心再亮一档），配一到两条短裂缝把块体断开。

矿点是同一块岩体上长出的晶簇。晶簇各自是一个不规则多边形，压在岩体边缘上，
上半截探出岩体轮廓之外——这是「长出来的」和「贴上去的」唯一区别。晶簇同样按
离自身轮廓的步数上色，最外一圈是最暗的矿物色，往里逐级变亮，核心里点一到两粒
近白的高光。小晶簇只有两三级，大晶簇才有亮核。

岩体色板是灰褐五档，矿物各四档。矿种靠色相区分，不靠纹路，所以在小尺寸下
也能一眼看出是什么。

用法：
    python3 rock-generate.py            # 生成素材与检查图
    python3 rock-generate.py --verify   # 生成并校验，失败返回 1
"""
import json
import math
import sys
from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'assets' / 'rock'
PREVIEWS = ROOT.parents[1] / 'output' / 'art-previews' / 'rock'

TILE = 48
YBOT = 44              # 接地行，与收获箱同一套锚点
GT = 32                # 地面砖源像素

ROCK = {
    'hi': '#7E6952',       # 亮面核心
    'light': '#66523E',    # 亮面
    'mid': '#4E3E32',      # 块体主色
    'dark': '#3A2D26',     # 轮廓里一圈
    'line': '#291D19',     # 轮廓，最外一圈
}

MINERALS = {
    'emerald': {
        'hi': '#C6FBD2', 'lit': '#4BD97C', 'mid': '#1E9B4E',
        'dark': '#0A4B2A', 'line': '#06341D',
    },
    'aquamarine': {
        'hi': '#CCF8FD', 'lit': '#5AD3E8', 'mid': '#23A0C0',
        'dark': '#10566B', 'line': '#0A3746',
    },
    'salt': {
        'hi': '#FFFFFF', 'lit': '#F2DECF', 'mid': '#CDA89A',
        'dark': '#8E6A61', 'line': '#6B4F49',
    },
}

# 岩体轮廓：顺时针给出，底边取 45，像素中心采样后落到 44 行。顶边只用几条长直边，
# 弧线一多就读成土堆；底边一整段平贴，中段外鼓，所以站得住。
# lit 是朝上受光的那块面，是一块不规则的块而不是沿轮廓的一条带；facets 是正面裂缝。
ROCK_VARIANTS = (
    dict(name='0', seed=20261124,
         poly=[(14, 45), (10, 39), (12, 31), (17, 26), (21, 23), (24, 25),
               (26, 22), (31, 25), (35, 28), (39, 33), (39, 42), (35, 45)],
         lit=[(13, 31), (17, 26), (22, 23), (28, 24), (33, 27), (26, 28), (19, 29)],
         facets=[[(31, 32), (29, 36), (30, 40)], [(20, 34), (21, 38)]]),
    dict(name='1', seed=20261125,
         poly=[(14, 45), (10, 40), (11, 33), (16, 27), (22, 23), (27, 22),
               (31, 25), (35, 29), (38, 34), (37, 42), (32, 45)],
         lit=[(13, 32), (17, 28), (22, 24), (28, 23), (33, 28), (25, 28), (18, 30)],
         facets=[[(30, 33), (32, 38)], [(19, 36), (20, 40)]]),
    dict(name='2', seed=20261126,
         poly=[(12, 45), (9, 39), (12, 32), (17, 27), (22, 23), (27, 21),
               (31, 25), (36, 29), (39, 35), (37, 43), (31, 45)],
         lit=[(13, 31), (18, 26), (23, 23), (27, 24), (32, 29), (25, 27), (17, 29)],
         facets=[[(32, 33), (30, 38)], [(18, 36), (19, 40)]]),
)

# 矿点 = 岩体变体 + 晶簇。晶簇多边形要带棱角：平顶、斜边、明确的下缘；
# split 是晶体两个切面的分界（斜线），屏幕上更靠上的一侧受光。
# 每列向下会补到岩面以下 3 像素，所以晶簇一定长在岩体上，不会悬空。
ORES = (
    dict(name='emerald', rock=0,
         crystals=[
             dict(poly=[(25, 21), (31, 22), (35, 27), (32, 31), (27, 31),
                        (24, 25)],
                  facet=[(33, 23), (27, 30)], spec=[(28, 24)]),
             dict(poly=[(12, 26), (17, 25), (19, 29), (15, 32), (11, 30)],
                  facet=[(18, 27), (13, 31)]),
             dict(poly=[(9, 33), (13, 34), (13, 37), (9, 38)],
                  facet=[(12, 34), (10, 38)]),
         ]),
    dict(name='aquamarine', rock=0,
         crystals=[
             dict(poly=[(21, 20), (26, 21), (28, 25), (24, 27), (20, 25)],
                  facet=[(27, 22), (21, 26)]),
             dict(poly=[(12, 27), (16, 26), (18, 30), (14, 33), (11, 31)],
                  facet=[(17, 27), (12, 32)]),
             dict(poly=[(31, 27), (35, 28), (36, 32), (32, 34), (29, 31)],
                  facet=[(35, 29), (30, 33)]),
             dict(poly=[(22, 36), (26, 35), (28, 38), (24, 40)],
                  facet=[(26, 36), (23, 39)]),
         ]),
    dict(name='salt', rock=1,
         crystals=[
             dict(poly=[(19, 20), (25, 21), (27, 25), (23, 29), (18, 26)],
                  facet=[(25, 22), (19, 27)], spec=[(20, 22)]),
             dict(poly=[(28, 24), (33, 25), (35, 29), (31, 32), (27, 29)],
                  facet=[(33, 26), (28, 31)]),
             dict(poly=[(16, 36), (21, 34), (23, 38), (18, 40)],
                  facet=[(21, 35), (17, 39)]),
         ]),
)


def hex_rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) + (255,)


def pal_rgb(pal):
    return {k: hex_rgb(v) for k, v in pal.items()}


def lum(c):
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]


def mask_of(poly):
    """多边形扫描填充：按像素中心采样，斜边自然落成台阶。"""
    m = [[False] * TILE for _ in range(TILE)]
    for y in range(TILE):
        yc = y + 0.5
        xs = []
        for (x1, y1), (x2, y2) in zip(poly, poly[1:] + poly[:1]):
            if (y1 <= yc < y2) or (y2 <= yc < y1):
                xs.append(x1 + (yc - y1) * (x2 - x1) / (y2 - y1))
        xs.sort()
        for a, b in zip(xs[0::2], xs[1::2]):
            for x in range(math.ceil(a - 0.5), math.floor(b - 0.5) + 1):
                if 0 <= x < TILE:
                    m[y][x] = True
    return m


NB8 = ((-1, -1), (0, -1), (1, -1), (-1, 0), (1, 0), (-1, 1), (0, 1), (1, 1))


def depth_of(mask):
    """每个内部像素到形状外部的 8 邻步数：1 就是最外一圈。"""
    inside = {(x, y) for y in range(TILE) for x in range(TILE) if mask[y][x]}
    dep = {}
    q = deque()
    for p in inside:
        if any((p[0] + dx, p[1] + dy) not in inside for dx, dy in NB8):
            dep[p] = 1
            q.append(p)
    while q:
        x, y = q.popleft()
        for dx, dy in NB8:
            q2 = (x + dx, y + dy)
            if q2 in inside and q2 not in dep:
                dep[q2] = dep[(x, y)] + 1
                q.append(q2)
    return dep


def line_px(p, q):
    """两点之间取整数像素（Bresenham），用来画 1 像素裂缝。"""
    (x0, y0), (x1, y1) = p, q
    out = []
    dx, dy = abs(x1 - x0), -abs(y1 - y0)
    sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
    err = dx + dy
    while True:
        out.append((x0, y0))
        if (x0, y0) == (x1, y1):
            return out
        e2 = 2 * err
        if e2 >= dy:
            err += dy
            x0 += sx
        if e2 <= dx:
            err += dx
            y0 += sy


def polyline(pts):
    out = []
    for a, b in zip(pts, pts[1:]):
        for p in line_px(a, b):
            if not out or out[-1] != p:
                out.append(p)
    return out


def side_of(a, b, p):
    """点在直线 ab 的哪一侧：负数在左（屏幕上偏上）。"""
    return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])


def build_rock(v):
    """返回 (逐像素颜色字典, 岩体掩码, 受光面集合, 深度图)。"""
    m = mask_of(v['poly'])
    dep = depth_of(m)
    px = {p: ('r:line' if d == 1 else ('r:dark' if d == 2 else 'r:mid'))
          for p, d in dep.items()}

    # 朝上的受光面：整块亮一档，核心再亮一档。边界是折线不是渐变，所以有棱。
    lit_m = mask_of(v['lit'])
    lit = {(x, y) for y in range(TILE) for x in range(TILE)
           if m[y][x] and lit_m[y][x] and dep.get((x, y), 0) >= 2}
    for p in lit:
        px[p] = 'r:light'
    core = {p for p in lit
            if all((p[0] + dx, p[1] + dy) in lit for dx, dy in NB8)}
    for p in core:
        px[p] = 'r:hi'

    # 内部裂缝：只用深色，不碰轮廓圈
    for pts in v['facets']:
        for p in polyline(pts):
            if dep.get(p, 0) >= 3:
                px[p] = 'r:line'

    # 接地一行压深：石头落地是收口的
    for p in dep:
        if p[1] == YBOT and dep[p] >= 2:
            px[p] = 'r:dark'

    return px, m, lit, dep


def root(crystal_m, rock_m):
    """每一列把晶体向下补到岩面以下三像素，晶簇一定长在岩体上。"""
    rock_top = {}
    for y in range(TILE):
        for x in range(TILE):
            if rock_m[y][x]:
                rock_top.setdefault(x, y)
    for x in range(TILE):
        col = [y for y in range(TILE) if crystal_m[y][x]]
        if not col or x not in rock_top:
            continue
        for y in range(max(col) + 1, min(rock_top[x] + 3, TILE - 1) + 1):
            crystal_m[y][x] = True


def build_ore(v, ore):
    """岩体 + 晶簇。

    晶簇按一条斜分割线分成两个切面：屏幕上更靠上的一侧受光，另一侧压暗，
    所以晶体有硬边切面，不是球面。最外一圈用最暗的矿物色，充当轮廓。
    """
    rock_px, rock_m, lit, rock_dep = build_rock(v)
    px = dict(rock_px)
    mpal = pal_rgb(MINERALS[ore['name']])
    crystal_m = [[False] * TILE for _ in range(TILE)]

    masks = []
    for c in ore['crystals']:
        cm = mask_of(c['poly'])
        masks.append((c, cm))
        for y in range(TILE):
            for x in range(TILE):
                if cm[y][x]:
                    crystal_m[y][x] = True
    root(crystal_m, rock_m)

    # 补根之后再按联合掩码重新切出每一块晶体（补的部分也算进这一块）
    for c, cm in masks:
        for y in range(TILE):
            for x in range(TILE):
                if crystal_m[y][x] and cm[y][x]:
                    cm[y][x] = True
        dep = depth_of(cm)
        # 一像素暗边；内部分两个切面，靠上的一侧受光、靠下的一侧压暗。
        # 同心分档一多就变成球，晶体要的是两块平面拼出来的棱。
        a, b = c['facet'][0], c['facet'][1]
        pos = {p for p in dep if side_of(a, b, p) > 0}
        neg = set(dep) - pos
        up = pos if (pos and neg and sum(q[1] for q in pos) / len(pos)
                     < sum(q[1] for q in neg) / len(neg)) else neg
        bottom = max(p[1] for p in dep)
        for p, d in dep.items():
            if d == 1:
                px[p] = 'c:line'
            elif p[1] >= bottom - 1:
                px[p] = 'c:dark'
            elif p in up:
                px[p] = 'c:lit'
            else:
                px[p] = 'c:mid'
        for p in c.get('spec', ()):
            if p in dep and dep[p] >= 2 and p in up:
                px[p] = 'c:hi'

    return px, rock_m, crystal_m, mpal


def render(px, rpal, mpal):
    """键带前缀：r: 走岩体色板，c: 走矿物色板（两套都有 mid/dark/line）。"""
    im = Image.new('RGBA', (TILE, TILE), (0, 0, 0, 0))
    out = im.load()
    for (x, y), key in px.items():
        kind, tone = key.split(':')
        out[x, y] = rpal[tone] if kind == 'r' else mpal[tone]
    return im


def stats(im, rock_m, crystal_m):
    pxx = im.load()
    solid = {(x, y) for y in range(TILE) for x in range(TILE) if pxx[x, y][3]}
    xs = [p[0] for p in solid]
    ys = [p[1] for p in solid]
    box = [min(xs), min(ys), max(xs), max(ys)]
    last = max(ys)

    row = sorted(p[0] for p in solid if p[1] == last)
    runs, start = [], row[0]
    for a, b in zip(row, row[1:] + [None]):
        if b != a + 1:
            runs.append((start, a))
            start = b

    crystal = {p for p in solid if crystal_m[p[1]][p[0]]}
    rock = solid - crystal

    # 晶簇必须参与外轮廓：与透明相邻的晶簇像素太少，就说明是贴在石头上的贴纸
    edge = {p for p in solid
            if any((p[0] + dx, p[1] + dy) not in solid for dx, dy in NB8)}
    protrude = sum(1 for p in crystal if p in edge)

    counts = {}
    for p in solid:
        counts[pxx[p]] = counts.get(pxx[p], 0) + 1

    lone = [p for p in solid
            if not any((p[0] + dx, p[1] + dy) in solid for dx, dy in NB8)]
    mirror_bad = [p for p in solid if (TILE - 1 - p[0], p[1]) not in solid]

    return {
        'bbox': box,
        'bbox_size': [box[2] - box[0] + 1, box[3] - box[1] + 1],
        'area': len(solid),
        'center_offset': round((box[0] + box[2]) / 2 - (TILE - 1) / 2, 1),
        'anchor': [(box[0] + box[2] + 1) // 2, last],
        'contact': {'row': last, 'runs': [list(r) for r in runs], 'pixels': len(row)},
        'rock_pixels': len(rock),
        'crystal_pixels': len(crystal),
        'crystal_ratio': round(len(crystal) / len(solid), 4),
        'crystal_on_edge': protrude,
        'colors_used': len(counts),
        'lone_pixels': len(lone),
        'mirror_breaks': len(mirror_bad),
        'alpha_values': sorted({pxx[x, y][3] for y in range(TILE) for x in range(TILE)}),
    }


def color_span(a, b):
    """两个颜色的曼哈顿差：用来保证矿物的色相离岩体足够远。"""
    return sum(abs(x - y) for x, y in zip(a[:3], b[:3]))


def sheet(sprites, labels):
    """横向 6 倍排列，每件下方一条颜色带。"""
    cell, pad, sc = TILE * 6, 16, 6
    n = len(sprites)
    w = cell * n + pad * (n + 1)
    h = cell + pad * 2 + 34
    canvas = Image.new('RGBA', (w, h), (247, 242, 232, 255))
    for i, im in enumerate(sprites):
        x = pad + i * (cell + pad)
        canvas.alpha_composite(im.resize((TILE * sc, TILE * sc), Image.NEAREST), (x, pad))
        canvas.alpha_composite(Image.new('RGBA', (cell, 2), (216, 206, 190, 255)),
                               (x, pad + (YBOT + 1) * sc))
        for k, c in enumerate(labels[i]):
            canvas.paste(Image.new('RGBA', (14, 14), c), (x + k * 14, pad * 2 + cell + 10))
    return canvas


def field(sprites):
    """草土交错的空地，十个物件错位散放，看重复感与接地。"""
    gt, nx, ny, sc = GT, 8, 5, 3
    canvas = Image.new('RGBA', (nx * gt, ny * gt), (0, 0, 0, 0))
    grass = [ROOT / 'assets' / 'grass' / f'grass-lawn-{i}.png' for i in range(4)]
    soil = [ROOT / 'assets' / 'soil' / f'soil-bare-{i}.png' for i in range(4)]
    patch = {(4, 1), (5, 1), (4, 2), (5, 2), (6, 2)}
    for j in range(ny):
        for i in range(nx):
            src = soil if (i, j) in patch else grass
            canvas.paste(Image.open(src[(i * 3 + j) % 4]), (i * gt, j * gt))
    canvas = canvas.resize((canvas.width * sc, canvas.height * sc), Image.NEAREST)
    spots = ((2.4, 1.3), (6.0, 1.7), (1.6, 2.6), (4.4, 2.9), (7.2, 2.8),
             (3.1, 3.9), (6.4, 4.2), (1.2, 4.6), (7.6, 4.9), (4.9, 4.6))
    for k, (gx, gy) in enumerate(spots):
        spr = sprites[k % len(sprites)]
        put = spr.resize((TILE * sc, TILE * sc), Image.NEAREST)
        canvas.paste(put, (int(gx * gt * sc - 24 * sc), int(gy * gt * sc - YBOT * sc)), put)
    return canvas


def grounds(im, name):
    """单件四格 4 倍：浅底、草地、裸土、干耕地。"""
    cell, pad = GT * 6, 12
    canvas = Image.new('RGBA', (cell * 4 + pad * 5, cell + pad * 2), (246, 240, 228, 255))
    put = im.resize((TILE * 4, TILE * 4), Image.NEAREST)
    canvas.alpha_composite(Image.new('RGBA', (cell, cell), (250, 246, 238, 255)), (pad, pad))
    for gi, (sub, stem) in enumerate((('grass', 'grass-lawn'), ('soil', 'soil-bare'),
                                      ('tilled', 'tilled-dry'))):
        x = pad * 2 + cell * gi
        g = Image.new('RGBA', (cell, cell))
        for i in range(cell // GT):
            for j in range(cell // GT):
                p = ROOT / 'assets' / sub / f'{stem}-{(i * 3 + j) % 4}.png'
                if p.exists():
                    g.paste(Image.open(p), (i * GT, j * GT))
        canvas.paste(g, (x, pad))
    for gi in range(4):
        x = pad + cell * gi
        canvas.alpha_composite(put, (x + (cell - put.width) // 2,
                                     pad + cell - 12 - (YBOT + 1) * 4))
    canvas.save(PREVIEWS / f'{name}-grounds.png', optimize=True)


def main():
    verify = '--verify' in sys.argv
    OUT.mkdir(parents=True, exist_ok=True)
    PREVIEWS.mkdir(parents=True, exist_ok=True)
    rpal = pal_rgb(ROCK)
    blank = [[False] * TILE for _ in range(TILE)]

    sprites, labels, manifest, problems = [], [], [], []

    for v in ROCK_VARIANTS:
        px, m, lit, dep = build_rock(v)
        im = render(px, rpal, {})
        name = f"rock-plain-{v['name']}"
        im.save(OUT / f'{name}.png', optimize=True)
        im.resize((TILE * 8, TILE * 8), Image.NEAREST).save(
            PREVIEWS / f'{name}-8x.png', optimize=True)
        sprites.append(im)
        labels.append([rpal[k] for k in ('hi', 'light', 'mid', 'dark', 'line')])
        manifest.append(dict(kind='rock', name=v['name'], **stats(im, m, blank)))

    for ore in ORES:
        v = ROCK_VARIANTS[ore['rock']]
        px, rock_m, crystal_m, mpal = build_ore(v, ore)
        im = render(px, rpal, mpal)
        name = f"rock-ore-{ore['name']}"
        im.save(OUT / f'{name}.png', optimize=True)
        im.resize((TILE * 8, TILE * 8), Image.NEAREST).save(
            PREVIEWS / f'{name}-8x.png', optimize=True)
        sprites.append(im)
        labels.append([rpal[k] for k in ('mid', 'light')] +
                      [mpal[k] for k in ('line', 'dark', 'mid', 'lit', 'hi')])
        manifest.append(dict(kind='ore', name=ore['name'], **stats(im, rock_m, crystal_m)))
        grounds(im, name)

    atlas = Image.new('RGBA', (TILE * len(sprites), TILE), (0, 0, 0, 0))
    for i, im in enumerate(sprites):
        atlas.alpha_composite(im, (i * TILE, 0))
    atlas.save(OUT / 'rock-atlas.png', optimize=True)
    atlas.resize((atlas.width * 8, atlas.height * 8), Image.NEAREST).save(
        PREVIEWS / 'rock-atlas-8x.png', optimize=True)
    sheet(sprites, labels).save(PREVIEWS / 'rock-sheet.png', optimize=True)
    field(sprites).save(PREVIEWS / 'rock-field-3x.png', optimize=True)

    for info in manifest:
        tag = f"{info['kind']} {info['name']}"
        w, h = info['bbox_size']
        if not 28 <= w <= 34:
            problems.append(f'{tag}：宽度 {w} 不在 28~34')
        if not 22 <= h <= 30:
            problems.append(f'{tag}：高度 {h} 不在 22~30')
        if not 0.72 <= w / h <= 1.35:
            problems.append(f'{tag}：{w}×{h} 比例失衡')
        if abs(info['center_offset']) > 0.5:
            problems.append(f"{tag}：水平未居中，偏移 {info['center_offset']}")
        if info['anchor'] != [24, YBOT]:
            problems.append(f"{tag}：锚点 {info['anchor']} 不是 (24, {YBOT})")
        if len(info['contact']['runs']) != 1 or info['contact']['pixels'] < 12:
            problems.append(f"{tag}：底边不是一整段，{len(info['contact']['runs'])} 段 "
                            f"{info['contact']['pixels']} 像素")
        if info['lone_pixels']:
            problems.append(f"{tag}：有 {info['lone_pixels']} 个孤立像素")
        if info['alpha_values'] != [0, 255]:
            problems.append(f"{tag}：出现半透明像素 {info['alpha_values']}")
        if info['mirror_breaks'] == 0:
            problems.append(f'{tag}：轮廓左右镜像重合，是规则形状')
        if info['kind'] == 'ore':
            if not 0.10 <= info['crystal_ratio'] <= 0.42:
                problems.append(f"{tag}：晶簇占比 {info['crystal_ratio']} 不在 10%~42%")
            if info['crystal_on_edge'] < 4:
                problems.append(f"{tag}：晶簇只有 {info['crystal_on_edge']} 像素接到轮廓，像贴上去的")
        elif info['crystal_pixels']:
            problems.append(f'{tag}：普通石头混进了晶簇像素')

    lad = {k: round(lum(rpal[k][:3]), 1) for k in ('hi', 'light', 'mid', 'dark', 'line')}
    for a, b in zip(('hi', 'light', 'mid', 'dark'), ('light', 'mid', 'dark', 'line')):
        if lad[a] - lad[b] < 8:
            problems.append(f'岩体明暗阶梯 {a}>{b} 只有 {lad[a] - lad[b]}')

    for name, mp in MINERALS.items():
        m = pal_rgb(mp)
        ml = {k: round(lum(m[k][:3]), 1) for k in ('hi', 'lit', 'mid', 'dark', 'line')}
        for a, b in zip(('hi', 'lit', 'mid', 'dark'), ('lit', 'mid', 'dark', 'line')):
            if ml[a] - ml[b] < 8:
                problems.append(f'{name} 明暗阶梯 {a}>{b} 只有 {ml[a] - ml[b]}')
        span = color_span(m['mid'], rpal['mid'])
        if span < 70:
            problems.append(f'{name} 与岩体色差只有 {span}，分不出来')

    (OUT / 'rock-manifest.json').write_text(json.dumps({
        'variants': manifest,
        'rock_palette': ROCK,
        'mineral_palettes': MINERALS,
        'structure': {
            'canvas': f'{TILE}×{TILE}，透明底',
            'view': '侧视微俯：整块石头，左上受光，底边平贴',
            'anchor': [24, YBOT],
            'bottom_row': YBOT,
            'shading': '按离轮廓步数分三层 + 左上受光面；晶簇同法，外圈最暗',
        },
        'checks': problems or ['全部通过'],
    }, ensure_ascii=False, indent=2), encoding='utf-8')

    for info in manifest:
        print(f"{info['kind']:4s} {info['name']:11s} bbox={info['bbox']} "
              f"size={info['bbox_size']} 面积={info['area']} "
              f"晶簇={info['crystal_pixels']}({info['crystal_ratio']}) "
              f"贴轮廓={info['crystal_on_edge']} 接地={info['contact']['pixels']} "
              f"镜像差={info['mirror_breaks']} 色数={info['colors_used']}")
    print('岩体明暗', lad)
    if verify:
        if problems:
            print('校验失败：')
            for p in problems:
                print(' -', p)
            return 1
        print('校验通过')
    return 0


if __name__ == '__main__':
    sys.exit(main())
