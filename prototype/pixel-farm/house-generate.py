#!/usr/bin/env python3
"""柳湾河畔小农舍 · 128×104 透明像素精灵（主视图，俯视微倾）。

正门朝画面下方，屋顶与正面同时入画。结构按「先立骨架、再点细节」两遍画：

1) 骨架：后坡（脊线上方一条收窄的窄带）→ 脊瓦 → 前坡（沿檐口宽度收分的梯形）
   → 檐口板 → 墙面。前坡与后坡靠明度差分开，不靠描边。
2) 细节：瓦缝三道、瓦口竖缝若干、墙面裂缝三道、抹泥补块两处，全部稀疏。

屋檐底下的深色遮挡带是这张图的关键：没有它，屋顶像贴在墙上。门槛用亮顶面
（两行石面）+ 暗立面（三行）交代高度，正门因此有一级台阶可读。

用法：
    python3 house-generate.py            # 生成素材与检查图
    python3 house-generate.py --verify   # 生成并校验，失败返回 1
"""
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'assets' / 'house'
PREVIEWS = ROOT.parents[1] / 'output' / 'art-previews' / 'house'

W, H = 128, 104
BASE = 96                     # 建筑底边所在行，整个底边压在这一行上
WALL_L, WALL_R = 12, 115      # 墙面左右边
EAVE_L, EAVE_R = 4, 123       # 檐口左右边（比墙面各挑出 8 像素）

RIDGE_INSET = 7               # 脊线与檐口的宽度差，前坡每一行按它收分
BACK_INSET = 10               # 后坡顶边相对檐口再收进（收得缓，才不像斜切边）

BACK_ROWS = (7, 14)           # 后坡
RIDGE_ROWS = (15, 16)         # 脊瓦
SLOPE_ROWS = (18, 41)         # 前坡
FASCIA_ROWS = (42, 43)        # 檐口板
EAVE_LINE = 44                # 屋檐底沿
SHADE_ROWS = (45, 48)         # 檐下遮挡带
WALL_TOP = 49

# 门：外框 72~93，门扇 75~90，门槛 92~96（亮顶面 2 行 + 暗立面 3 行）
DOOR_X0, DOOR_X1 = 73, 92
DOOR_TOP = 62
LEAF_X0, LEAF_X1 = 76, 89
LEAF_TOP, LEAF_BOT = 65, 91
SILL_TOP = (92, 93)
SILL_FACE = (94, 96)

# 窗：外框 28~44，玻璃 30~42，窗台 83~84
WIN_X0, WIN_X1 = 28, 44
WIN_TOP, WIN_BOT = 67, 82
GLASS_X0, GLASS_X1 = 30, 42
GLASS_TOP, GLASS_BOT = 69, 80
WIN_SILL = (83, 84)

SEED = 20261125

PAL = {
    # 屋面：暖陶红黏土瓦。前坡受光、后坡背光，只靠明度分开
    'tile': '#B4714B',
    'tile_hi': '#C9885D',      # 左侧檐边受光
    'tile_dark': '#8B5230',    # 瓦缝、脊下阴影
    'tile_back': '#9C5A34',    # 后坡、檐口板
    'tile_backline': '#743E22',
    # 墙面：浅灰米色抹泥
    'wall_hi': '#DBD4C4',
    'wall': '#CBC3B1',
    'wall_sh': '#B1A894',
    'eave': '#5C4B36',         # 檐下遮挡带
    'eave_lo': '#7A6A4E',      # 遮挡带下沿过渡
    'damp': '#A6957D',         # 墙脚潮痕，直边
    # 木作：深暖棕
    'leaf_hi': '#8A5A36',
    'leaf': '#6A4326',
    'wood_dark': '#452A17',
    'frame': '#3E2717',
    # 窗玻璃
    'glass': '#4C5E62',
    'glass_hi': '#7E9599',
    # 门槛与窗台石
    'sill': '#BFB9A8',
    'sill_dark': '#786F5C',
    'line': '#2B2118',
}

RGB = {k: tuple(int(v[i:i + 2], 16) for i in (1, 3, 5)) + (255,) for k, v in PAL.items()}


def rand(seed, i):
    """整数哈希 -> [0,1)，跨平台一致。"""
    x = (i * 374761393 + seed * 668265263) & 0xFFFFFFFF
    x = (x ^ (x >> 13)) * 1274126177 & 0xFFFFFFFF
    return ((x ^ (x >> 16)) & 0xFFFFFF) / 0xFFFFFF


def lum(c):
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]


def slope_inset(y):
    """前坡第 y 行相对檐口每侧收进多少。脊线处 7、檐口 0，线性——斜边才是直的。"""
    return int(round(RIDGE_INSET * (SLOPE_ROWS[1] - y) / (SLOPE_ROWS[1] - SLOPE_ROWS[0])))


def slope_span(y):
    ins = slope_inset(y)
    return EAVE_L + ins, EAVE_R - ins


def lit_edge(y):
    """受光区的右边界：自上而下左移，每 7 行退一格。大色块靠这条阶梯分层。"""
    return 70 - 4 * min(4, (y - WALL_TOP) // 7)


def shade_edge(y):
    """右墙角阴影的左边界：同样阶梯，随高度往下加宽。"""
    return 111 - 2 * min(4, (y - WALL_TOP) // 10)


DAMP_TOP = 94                 # 墙脚潮痕上沿：建筑底边要平整，这里不做抖动
CORNER_X = 106                # 右墙角背光带的左边界，一条竖线分面


def step_dark(k):
    """墙面上比当前色深一档的键，用于裂缝。"""
    return {'wall_hi': 'wall', 'wall': 'wall_sh', 'wall_sh': 'damp'}.get(k, 'wall_sh')


def build(seed=SEED):
    px, owner, face, decor = {}, {}, {}, set()

    def put(x, y, k, reg):
        if not (0 <= x < W and 0 <= y < H):
            return
        p = (x, y)
        if p in owner:
            face[owner[p]].discard(p)
        px[p] = k
        owner[p] = reg
        face.setdefault(reg, set()).add(p)

    # ---------------------------------------------------------------- 屋面
    # 后坡：脊线往上收，越远越窄。露出这一条，才看得出「两个坡面」
    for y in range(BACK_ROWS[0], BACK_ROWS[1] + 1):
        ins = RIDGE_INSET + int(round((BACK_INSET - RIDGE_INSET)
                                      * (BACK_ROWS[1] - y) / (BACK_ROWS[1] - BACK_ROWS[0])))
        for x in range(EAVE_L + ins, EAVE_R - ins + 1):
            put(x, y, 'tile_back', 'back')
    for x in range(EAVE_L + RIDGE_INSET, EAVE_R - RIDGE_INSET + 1):
        put(x, 15, 'tile_hi', 'ridge')          # 脊瓦顶面，反一条亮边
        put(x, 16, 'tile', 'ridge')             # 脊瓦正面
        put(x, 17, 'tile_dark', 'ridge')        # 脊下阴影，把脊瓦与前坡切开

    for y in range(SLOPE_ROWS[0], SLOPE_ROWS[1] + 1):
        x0, x1 = slope_span(y)
        for x in range(x0, x1 + 1):
            put(x, y, 'tile', 'slope')

    for y in FASCIA_ROWS:
        for x in range(EAVE_L, EAVE_R + 1):
            put(x, y, 'tile_back', 'fascia')

    # 前坡左侧受光：沿檐边一条宽 5~8 像素的亮带，内缘按阶梯走
    for y in range(SLOPE_ROWS[0], SLOPE_ROWS[1] + 1):
        x0, _ = slope_span(y)
        wide = 3 + ((y - SLOPE_ROWS[0]) // 10)
        for x in range(x0, x0 + wide):
            put(x, y, 'tile_hi', 'slope')

    # ---------------------------------------------------------------- 墙
    for y in range(WALL_TOP, BASE + 1):
        for x in range(WALL_L, WALL_R + 1):
            if y >= DAMP_TOP:
                put(x, y, 'damp', 'damp')
            elif x >= CORNER_X:
                put(x, y, 'wall_sh', 'wall')
            else:
                put(x, y, 'wall', 'wall')

    # 屋檐底沿 + 檐下遮挡带：一条深线定住屋檐，四行暗色压出挑檐的影子
    for x in range(WALL_L, WALL_R + 1):
        put(x, EAVE_LINE, 'wood_dark', 'eave')
    for y in range(SHADE_ROWS[0], SHADE_ROWS[1]):
        for x in range(WALL_L, WALL_R + 1):
            put(x, y, 'eave', 'eave')
    for x in range(WALL_L, WALL_R + 1):
        put(x, SHADE_ROWS[1], 'eave_lo', 'eave')

    # ---------------------------------------------------------------- 瓦纹
    # 三道瓦缝：断续的横线，缝间留口，不做成一条通贯的硬线
    for i, y in enumerate((24, 31, 38)):
        x0, x1 = slope_span(y)
        for x in range(x0 + 1, x1):
            put(x, y, 'tile_dark', 'slope')
            decor.add((x, y))
    # 瓦口竖缝：每两道缝之间挑 1 像素宽的短竖线，位置错开
    for i, y in enumerate((27, 34, 39)):
        x0, x1 = slope_span(y)
        x = x0 + 5 + int(rand(seed + 21, i) * 7)
        while x < x1 - 5:
            if rand(seed + 23, i * 31 + x) < 0.72:
                for dy in (0, 1):
                    put(x, y + dy, 'tile_dark', 'slope')
                    decor.add((x, y + dy))
            x += 12 + int(rand(seed + 25, i * 37 + x) * 8)
    # 后坡两道上瓦缝 + 三处竖缝：频次与前坡一致，只是短一截
    ins = RIDGE_INSET + int(round((BACK_INSET - RIDGE_INSET)
                                  * (BACK_ROWS[1] - 11) / (BACK_ROWS[1] - BACK_ROWS[0])))
    for x in range(EAVE_L + ins + 1, EAVE_R - ins):
        put(x, 11, 'tile_backline', 'back')
        decor.add((x, 11))
    for x in (36, 62, 88):
        for dy in (0, 1):
            put(x, 12 + dy, 'tile_backline', 'back')
            decor.add((x, 12 + dy))

    # ---------------------------------------------------------------- 墙面细节
    # 裂缝：三道，各自在不同色阶上再压一档，位置互相离开 20 像素以上
    for i, (cx, cy, n) in enumerate(((20, 62, 5), (32, 86, 4), (104, 58, 6))):
        for j in range(n):
            x = cx + (0 if j < n - 2 else 1)
            put(x, cy + j, step_dark(px.get((x, cy + j), 'wall')), 'wall')
            decor.add((x, cy + j))
    # 抹泥补块：两块一深一浅，都是大块平涂，不做碎点
    for (x, y) in ((52, 57), (53, 57), (54, 57), (52, 58), (53, 58),
                   (54, 58), (55, 58), (53, 59), (54, 59), (55, 59)):
        put(x, y, 'wall_sh', 'wall')
        decor.add((x, y))
    for x in range(100, 104):
        for y in range(84, 86):
            put(x, y, 'wall_hi', 'wall')
            decor.add((x, y))

    # ---------------------------------------------------------------- 门
    for y in range(DOOR_TOP, BASE + 1):
        for x in range(DOOR_X0, DOOR_X1 + 1):
            put(x, y, 'frame', 'door')
    for x in range(DOOR_X0, DOOR_X1 + 1):
        put(x, DOOR_TOP, 'leaf', 'door')          # 门楣顶面受光
        put(x, DOOR_TOP + 3, 'wood_dark', 'door')  # 门楣下沿的暗
    for y in range(DOOR_TOP, BASE + 1):
        put(DOOR_X0, y, 'leaf', 'door')           # 外框左侧受光边
        put(DOOR_X1, y, 'wood_dark', 'door')      # 外框右侧背光边

    for y in range(LEAF_TOP, LEAF_BOT + 1):
        for x in range(LEAF_X0, LEAF_X1 + 1):
            put(x, y, 'leaf', 'door')
    for x in range(LEAF_X0, LEAF_X1 + 1):
        put(x, LEAF_TOP, 'wood_dark', 'door')     # 门楣投在门扇上的影
    for x in (80, 85):
        for y in range(LEAF_TOP, LEAF_BOT + 1):
            put(x, y, 'wood_dark', 'door')        # 两道板缝，三块等宽板

    for y in range(LEAF_TOP, LEAF_BOT + 1):
        put(LEAF_X0, y, 'leaf_hi', 'door')        # 门扇左边缘受光
        put(LEAF_X1, y, 'wood_dark', 'door')      # 右边缘压深
    # 门把：一点暖色高光 + 暗侧，2×2，别做大
    put(86, 79, 'tile_hi', 'door')
    put(87, 79, 'wood_dark', 'door')
    put(86, 80, 'wood_dark', 'door')
    put(87, 80, 'wood_dark', 'door')

    # 门槛：与门框同宽的石板，压在门框下段之上（它在墙面前方，遮住立框的脚）。
    # 亮顶面交代进深、暗立面交代高度，门前因此有一个能一眼认出的入口。
    for y in SILL_TOP:
        for x in range(DOOR_X0 - 2, DOOR_X1 + 3):
            put(x, y, 'sill', 'sill')
    for y in SILL_FACE:
        for x in range(DOOR_X0 - 2, DOOR_X1 + 3):
            put(x, y, 'sill_dark', 'sill_face')

    # ---------------------------------------------------------------- 窗
    for y in range(WIN_TOP, WIN_BOT + 1):
        for x in range(WIN_X0, WIN_X1 + 1):
            put(x, y, 'frame', 'win')
    for y in range(GLASS_TOP, GLASS_BOT + 1):
        for x in range(GLASS_X0, GLASS_X1 + 1):
            put(x, y, 'glass', 'win')
    for y in range(GLASS_TOP, GLASS_BOT + 1):
        put(36, y, 'frame', 'win')                # 竖棂
    for x in range(GLASS_X0, GLASS_X1 + 1):
        put(x, 75, 'frame', 'win')                # 横棂
    for x in range(WIN_X0, WIN_X1 + 1):
        put(x, WIN_TOP, 'leaf', 'win')            # 窗框顶面受光
    for y in range(WIN_TOP, WIN_BOT + 1):
        put(WIN_X0, y, 'leaf', 'win')             # 窗框左侧受光
    # 玻璃反光：左上两块亮一小片，右下不点，光源才统一
    for x in range(31, 34):
        for y in range(70, 72):
            put(x, y, 'glass_hi', 'win')
    for x in range(38, 40):
        put(x, 70, 'glass_hi', 'win')
    # 窗台：比窗框宽一格，亮顶面 + 暗立面，与门槛同一套语言
    for x in range(WIN_X0 - 1, WIN_X1 + 2):
        put(x, WIN_SILL[0], 'sill', 'win')
        put(x, WIN_SILL[1], 'sill_dark', 'win')

    # ---------------------------------------------------------------- 轮廓
    # 与透明相邻的一圈取最深色：整件的剪影才立得住，底边也因此有一条接地暗线
    edge = set()
    for p in list(px):
        if any((p[0] + dx, p[1] + dy) not in px
               for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
            edge.add(p)
            px[p] = 'line'

    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    load = im.load()
    for (x, y), k in px.items():
        load[x, y] = RGB[k]
    return im, face, edge, decor, px


def runs_of(cols):
    if not cols:
        return []
    out, start = [], cols[0]
    for a, b in zip(cols, cols[1:] + [None]):
        if b != a + 1:
            out.append((start, a))
            start = b
    return out


def components(points):
    """4 邻接连通块个数，用来确认「只有一扇窗」。"""
    left, n = set(points), 0
    while left:
        n += 1
        stack = [left.pop()]
        while stack:
            x, y = stack.pop()
            for p in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if p in left:
                    left.discard(p)
                    stack.append(p)
    return n


def report(im, face, edge, decor, px):
    load = im.load()
    solid = {(x, y) for y in range(H) for x in range(W) if load[x, y][3]}
    xs = [p[0] for p in solid]
    ys = [p[1] for p in solid]
    box = [min(xs), min(ys), max(xs), max(ys)]

    counts = {}
    for p in solid:
        counts[load[p]] = counts.get(load[p], 0) + 1
    tones = {}
    for p, k in px.items():
        tones[k] = tones.get(k, 0) + 1

    mean = {}
    for name, reg in face.items():
        vals = [lum(load[p][:3]) for p in reg if load[p][3] and p not in edge]
        mean[name] = round(sum(vals) / len(vals), 1) if vals else 0.0

    row = sorted(x for x in range(W) if (x, BASE) in solid)
    base_runs = runs_of(row)

    # 门在偏右、窗在偏左：door_dx / win_dx 是相对画布中线的偏移
    door_cx = (LEAF_X0 + LEAF_X1) / 2
    win_cx = (WIN_X0 + WIN_X1) / 2
    mid = (W - 1) / 2

    return {
        'file': 'assets/house/house-cottage-128x104.png',
        'size': [W, H],
        'bbox': box,
        'bbox_size': [box[2] - box[0] + 1, box[3] - box[1] + 1],
        'anchor': [(box[0] + box[2] + 1) // 2, BASE],
        'area': len(solid),
        'colors_used': len(tones),
        'palette_locked': set(load[p] for p in solid) <= set(RGB.values()),
        'alpha_values': sorted({load[x, y][3] for y in range(H) for x in range(W)}),
        'face_lum': mean,
        'base_row': BASE,
        'base_runs': [list(r) for r in base_runs],
        'base_pixels': len(row),
        'door_dx': round(door_cx - mid, 1),
        'win_dx': round(win_cx - mid, 1),
        'window_blocks': components(face['win']),
        'roof_tones': sorted({px[p] for p in face['slope']}),
        'wall_tones': sorted({px[p] for p in face['wall']}),
        'detail_pixels': len(decor),
        'detail_ratio': round(len(decor) / len(solid), 4),
        'lone_pixels': len([p for p in solid
                            if not any((p[0] + dx, p[1] + dy) in solid
                                       for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))]),
        'outline_breaks': len([p for p in edge if load[p] != RGB['line']]),
        'door_blocked': len([p for p in decor
                             if LEAF_X0 <= p[0] <= LEAF_X1 and LEAF_TOP <= p[1] <= LEAF_BOT]),
        'below_base': len([1 for y in range(BASE + 1, H) for x in range(W) if load[x, y][3]]),
    }


def previews(im, name):
    """四张验收图：8 倍像素、1/2/4 倍、三种地面落地、与柳树同场。"""
    im.resize((W * 8, H * 8), Image.NEAREST).save(
        PREVIEWS / f'{name}-8x.png', optimize=True)

    pad = 12
    canvas = Image.new('RGBA', (W * 7 + pad * 4, H * 4 + pad * 2), (247, 242, 232, 255))
    x = pad
    for sc in (1, 2, 4):
        put = im if sc == 1 else im.resize((W * sc, H * sc), Image.NEAREST)
        canvas.alpha_composite(put, (x, pad + H * 4 - put.height))
        x += put.width + pad
    canvas.save(PREVIEWS / f'{name}-scales.png', optimize=True)

    # 地面：五格宽四格高（160×128），房子 128 宽正好落在里面，看得出挑檐与基脚
    gt, gw, gh, pad, sc = 32, 5, 4, 10, 2
    cw, ch = gw * gt, gh * gt
    canvas = Image.new('RGBA', (cw * 3 + pad * 4, ch + pad * 2), (246, 240, 228, 255))
    for gi, (sub, stem) in enumerate((('grass', 'grass-lawn'),
                                      ('soil', 'soil-bare'),
                                      ('tilled', 'tilled-dry'))):
        pan = Image.new('RGBA', (cw, ch))
        for i in range(gw):
            for j in range(gh):
                f = ROOT / 'assets' / sub / f'{stem}-{(i * 3 + j) % 4}.png'
                if f.exists():
                    pan.paste(Image.open(f), (i * gt, j * gt))
        ox = pad + gi * (cw + pad)
        canvas.paste(pan, (ox, pad))
        canvas.alpha_composite(im, (ox + (cw - W) // 2, pad + ch - H))
    canvas.save(PREVIEWS / f'{name}-grounds.png', optimize=True)


def field(name):
    """与垂柳、岩石、木箱同场，专门看比例：房子该比柳树矮，但宽出一截。"""
    gt, nx, ny, sc = 32, 14, 7, 2
    canvas = Image.new('RGBA', (nx * gt, ny * gt), (0, 0, 0, 0))
    for j in range(ny):
        for i in range(nx):
            canvas.paste(Image.open(ROOT / 'assets' / 'grass' /
                                    f'grass-lawn-{(i * 3 + j) % 4}.png'), (i * gt, j * gt))
    # 门前一条土路，标出入口位置
    for i in (3, 4):
        for j in range(5, ny):
            canvas.paste(Image.open(ROOT / 'assets' / 'soil' /
                                    f'soil-path-{(i + j) % 4}.png'), (i * gt, j * gt))
    canvas = canvas.resize((canvas.width * sc, canvas.height * sc), Image.NEAREST)

    def place(path, cx, gy, ax, ay):
        p = ROOT / path
        if not p.exists():
            return
        s = Image.open(p)
        s = s.resize((s.width * sc, s.height * sc), Image.NEAREST)
        canvas.alpha_composite(s, (int(cx * gt * sc - ax * sc), int(gy * gt * sc - ay * sc)))

    place('assets/house/house-cottage-128x104.png', 3.5, 5.1, 64, BASE)
    place('assets/willow/willow-imported.png', 9.4, 5.6, 48, 122)
    place('assets/rock/rock-plain-0.png', 1.1, 5.5, 24, 44)
    place('assets/crate/crate-harvest-48x48.png', 6.6, 5.0, 24, 44)
    canvas.save(PREVIEWS / f'{name}-field-2x.png', optimize=True)


def main():
    verify = '--verify' in sys.argv
    OUT.mkdir(parents=True, exist_ok=True)
    PREVIEWS.mkdir(parents=True, exist_ok=True)
    name = 'house-cottage'

    im, face, edge, decor, px = build()
    im.save(OUT / f'{name}-128x104.png', optimize=True)
    previews(im, name)
    field(name)

    info = report(im, face, edge, decor, px)
    m = info['face_lum']
    problems = []
    if not info['palette_locked']:
        problems.append('出现色板之外的像素')
    if info['alpha_values'] != [0, 255]:
        problems.append(f"出现半透明像素：{info['alpha_values']}")
    if info['lone_pixels']:
        problems.append(f"有 {info['lone_pixels']} 个孤立像素")
    if info['outline_breaks']:
        problems.append(f"轮廓有 {info['outline_breaks']} 处未取最深色")
    if info['below_base']:
        problems.append(f'底边以下还有 {info["below_base"]} 个像素，入口不干净')
    if len(info['base_runs']) != 1 or info['base_pixels'] < WALL_R - WALL_L + 1:
        problems.append(f"底边不平：{len(info['base_runs'])} 段、{info['base_pixels']} 像素")
    bw, bh = info['bbox_size']
    if not (116 <= bw <= 124 and 84 <= bh <= 92):
        problems.append(f'整件 {bw}×{bh}，不符合 128×104 画布上的比例')
    # 明暗：前坡亮于后坡、墙亮于檐下、门槛顶亮于立面、墙亮于门
    tl = {k: round(lum(RGB[k]), 1) for k in PAL}
    for a, b, need, why in ((m['slope'], m['back'], 20, '前后坡没分开'),
                            (m['wall'], m['eave'], 40, '檐下遮挡带不够深'),
                            (m['sill'], m['sill_face'], 30, '门槛顶面与立面拉不开'),
                            (m['wall'], tl['leaf'], 60, '门在浅色墙上不够跳'),
                            (tl['leaf'], tl['frame'], 15, '门扇与门框同色'),
                            (tl['wall'], tl['wall_sh'], 15, '墙角带与主墙没分开')):
        if a - b < need:
            problems.append(f'{why}：{a:.1f}-{b:.1f}={a - b:.1f}，要 ≥{need}')
    if info['door_dx'] < 8:
        problems.append(f"正门只在中线右侧 {info['door_dx']} 像素")
    if info['win_dx'] > -8:
        problems.append(f"窗只在中线左侧 {-info['win_dx']} 像素")
    if info['window_blocks'] != 1:
        problems.append(f'窗有 {info["window_blocks"]} 处，应只有一扇')
    if len(info['roof_tones']) > 4:
        problems.append(f"屋面用了 {len(info['roof_tones'])} 种色，大色块被切碎")
    if len(info['wall_tones']) > 4:
        problems.append(f"墙面用了 {len(info['wall_tones'])} 种色，大色块被切碎")
    if not 0.012 <= info['detail_ratio'] <= 0.075:
        problems.append(f"细节占比 {info['detail_ratio']}，不在 1.2%~7.5%")
    if info['door_blocked']:
        problems.append(f"门扇上有 {info['door_blocked']} 个装饰像素")

    manifest = {
        'name': name,
        'canvas': f'{W}×{H}，透明底',
        'view': '主视图，俯视微倾：看得见屋顶前后坡与正面；正门朝画面下方',
        'anchor': info['anchor'],
        'bottom_row': BASE,
        'palette': PAL,
        'metrics': info,
        'structure': {
            'roof': {'back_slope': list(BACK_ROWS), 'ridge': list(RIDGE_ROWS),
                     'front_slope': list(SLOPE_ROWS), 'fascia': list(FASCIA_ROWS),
                     'ridge_inset': RIDGE_INSET, 'back_top_inset': BACK_INSET},
            'wall': {'x': [WALL_L, WALL_R], 'top': WALL_TOP,
                     'eave_line': EAVE_LINE, 'shade_band': list(SHADE_ROWS)},
            'door': {'frame': [DOOR_X0, DOOR_X1, DOOR_TOP, BASE],
                     'leaf': [LEAF_X0, LEAF_X1, LEAF_TOP, LEAF_BOT],
                     'sill_x': [DOOR_X0 - 2, DOOR_X1 + 2],
                     'sill_top': list(SILL_TOP), 'sill_face': list(SILL_FACE)},
            'window': {'frame': [WIN_X0, WIN_X1, WIN_TOP, WIN_BOT],
                       'glass': [GLASS_X0, GLASS_X1, GLASS_TOP, GLASS_BOT],
                       'sill': list(WIN_SILL)},
        },
        'checks': problems or ['全部通过'],
    }
    (OUT / f'{name}-manifest.json').write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')

    print(f"bbox={info['bbox']} size={info['bbox_size']} area={info['area']} "
          f"colors={info['colors_used']} detail={info['detail_pixels']} ({info['detail_ratio']})")
    print('face_lum', m)
    print('base_runs', info['base_runs'], 'door_dx', info['door_dx'], 'win_dx', info['win_dx'])
    print('roof_tones', info['roof_tones'])
    print('wall_tones', info['wall_tones'])
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
