"""柳湾草地到裸土的过渡地砖：32x32 原生像素、固定左上受光。

运行：python3 prototype/pixel-farm/edge-generate.py [--verify]
输出：prototype/pixel-farm/assets/edge/

做法：
1) 不重画纹理。直接调用 soil-generate.py 与 grass-generate.py 的 build()，取同一色板、
   同一密度、同一像素粗细的原块，再用边界掩码叠合——过渡两侧因此和原块完全同源。
2) 边界轻微曲折：高度/宽度轮廓由 5 个结点的平滑插值给出，幅度 ±1 像素，
   并在砖的两端归零，所以直边砖横向首尾能直接对接。
3) 草根贴地：所有朝土一侧的草像素改成深橄榄绿，形成连续 1 像素草根线，不加厚度、不做投影。
4) 稀疏草尖：沿边界取两三处，往下探 1~2 像素深橄榄绿，读作草尖伸进土面。
五种形状：
  直边 / 外角（草角外凸，草只占左上象限）/ 内角（草角内凹，草包住左上两边）
  bevel-inner（斜切土角，草 7/8 + 45° 土三角）/ bevel-outer（斜切草角，状态互换）
斜角砖用的是同一条 45° 线 y = x + MID：从左边中点走到下边中点，两端正好落在直边砖
的边界端点上，所以斜切角能和直边砖直接对接。两形状互为补集，相间排列就是 45° 斜边。
坐标全部对 32 取模，跨边图案在对面接上。
"""
from pathlib import Path
import importlib.util
import json
import sys
from PIL import Image

TILE = 32
VARIANTS = 3
SHAPES = ('straight', 'outer', 'inner')
# 斜角砖：同一条 45° 线的两侧，互为补集
DIAG_SHAPES = ('bevel-inner', 'bevel-outer')
ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'assets' / 'edge'
PREVIEWS = ROOT.parents[1] / 'output' / 'art-previews' / 'edge'

# 边界位置：横边在 y=16、竖边在 x=16；两端归零，保证砖与砖对得上
MID = 16

PALETTE = {}


def load(name):
    spec = importlib.util.spec_from_file_location(name.replace('-', '_'), ROOT / f'{name}.py')
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


SOIL = load('soil-generate')
GRASS = load('grass-generate')


def hex_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (255,)


GRASS_SET = GRASS.PALETTE['lawn']
SOIL_SET = SOIL.PALETTE['bare']
G_DARK = hex_rgb(GRASS_SET['dark'])


def rand(seed, i):
    x = (i * 374761393 + seed * 668265263) & 0xFFFFFFFF
    x = (x ^ (x >> 13)) * 1274126177 & 0xFFFFFFFF
    return ((x ^ (x >> 16)) & 0xFFFFFF) / 0xFFFFFF


def smooth(t):
    return t * t * (3 - 2 * t)


def meander(seed, amp=2):
    """32 像素上的边界起伏：受约束的随机游走。

    相邻列最多差 1 像素，振幅不超过 amp，两端都停在 0——所以直边砖左右相接时
    边界能连成一条线，也不会出现 5 像素高的竖墙。
    """
    h, out = 0, [0]
    for i in range(1, TILE):
        remaining = TILE - 1 - i
        r = rand(seed, i)
        step = -1 if r < 0.2 else (1 if r > 0.8 else 0)   # 六成不变，走向才平缓
        if abs(h + step) > amp:
            step = -1 if h > 0 else (1 if h < 0 else 0)
        if abs(h + step) > remaining:          # 剩余步数不够回家，就往 0 走
            step = -1 if h > 0 else (1 if h < 0 else 0)
        h += step
        out.append(h)
    return out


def profiles(seed):
    """横边与竖边共用同一条轮廓：直边砖旋转 90 度后竖边的起伏序列就是这个函数，
    角砖的竖边必须与之一致，否则接缝处会错开 1~2 像素。"""
    m = meander(seed + 101)
    return m, m


def grass_mask(shape, hx, vy):
    m = [[False] * TILE for _ in range(TILE)]
    for y in range(TILE):
        for x in range(TILE):
            above = y < MID + hx[x]       # 横边界之上
            left = x < MID + vy[y]        # 竖边界之左
            if shape == 'straight':
                g = above
            elif shape == 'outer':        # 草角外凸：草只占左上象限
                g = above and left
            else:                          # 草角内凹：草包住左上两条边
                g = above or left
            m[y][x] = g
    return m


def diag_mask(shape):
    """45° 斜切：斜线 y = x + MID，从左边中点 (0,16) 走到下边中点 (16,32)。

    两端正好是直边砖边界所在的 y=16 / x=16，所以斜切角能直接接到直边砖上。
    bevel-inner：草在斜线之上（7/8），土只剩左下 45° 三角——土田的角被斜切。
    bevel-outer：两色互换，草只剩 45° 三角——草岛的角被斜切。
    两者互为补集，相间排列就是一条 45° 斜边。
    """
    m = [[False] * TILE for _ in range(TILE)]
    for y in range(TILE):
        for x in range(TILE):
            tri = y - x >= MID            # 斜线下方的小三角
            m[y][x] = tri if shape == 'bevel-outer' else not tri
    return m


def compose(shape, mask, gv, sv, rim_sides='all', clean_soil=True):
    # 纹理按可见面积换算数量，密度因此与原块一致，而不是先整块生成再裁切
    # 簇数按"可放纹理的面积"换算：边界 2 像素内不放纹理，所以按扣除后的面积折算，
    # 这样交界两侧远端的纹理密度与原块一致。
    g_area = sum(row.count(True) for row in mask)
    soil_mask = [[not v for v in row] for row in mask]
    # 簇数按各自可见面积换算，密度与原块一致；纹理可以贴到边界，但不跨过去
    # 小到只剩一个 45° 三角（斜角砖）时把下限降到 1，否则几簇挤在百来像素里会糊成一片
    g_min = 2 if g_area >= 256 else 1
    s_min = 3 if TILE * TILE - g_area >= 256 else 1
    g_count = max(g_min, round(GRASS.CONF['lawn']['clumps'] * g_area / (TILE * TILE)))
    s_count = max(s_min, round(SOIL.CONF['bare']['clods'] * (TILE * TILE - g_area) / (TILE * TILE)))
    g = GRASS.build('lawn', gv, region=mask, count=g_count)
    s = SOIL.build('bare', sv, region=soil_mask, count=s_count)
    im = Image.new('RGBA', (TILE, TILE))
    px = im.load()
    gpx, spx = g.load(), s.load()

    # 先按掩码叠合
    for y in range(TILE):
        for x in range(TILE):
            px[x, y] = gpx[x, y] if mask[y][x] else spx[x, y]

    # 清理：紧贴边界的土像素回到底色，避免被掩码切断的土粒留下半截碎片
    base_g, base_s = hex_rgb(GRASS_SET['base']), hex_rgb(SOIL_SET['base'])
    for y in range(TILE):
        for x in range(TILE):
            if mask[y][x] or not clean_soil:
                continue
            for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < TILE and 0 <= nx < TILE and mask[ny][nx]:
                    px[x, y] = base_s
                    break

    # 草根线：所有朝土一侧的草像素改成深橄榄绿，连续 1 像素，不叠厚度
    # 草根线：只有直边砖横向按环面判断（它要能左右相接）；
    # 角砖和纵向都不回绕——过渡砖的两端分别属于草区和土区，回绕会画出假根线
    wrapx = shape == 'straight'
    rim = []
    sides = ((1, 0),) if rim_sides == 'south' else ((1, 0), (0, 1), (-1, 0), (0, -1))
    for y in range(TILE):
        for x in range(TILE):
            if not mask[y][x]:
                continue
            for dy, dx in sides:
                ny = y + dy
                nx = (x + dx) % TILE if wrapx else x + dx
                if not (0 <= ny < TILE and 0 <= nx < TILE):
                    continue
                if not mask[ny][nx]:
                    rim.append((x, y))
                    break
    for x, y in rim:
        px[x, y] = G_DARK

    return im, mask, rim, base_g, base_s


def fringe(im, mask, rim, seed):
    """稀疏草尖伸进土面：沿边界挑两三处，往下探 1~2 像素深橄榄绿。"""
    px = im.load()
    cand = sorted({x for x, y in rim if not mask[(y + 1) % TILE][x]})
    if not cand:
        return 0
    tips = 0
    for k in range(len(cand)):
        if tips >= 3:
            break
        x = cand[int(rand(seed + 73, k) * len(cand)) % len(cand)]
        # 找到该列最下面的草像素
        col = [y for y in range(TILE) if mask[y][x]]
        if not col:
            continue
        y = max(col)
        depth = 1 + (1 if rand(seed + 79, k) < 0.4 else 0)
        touched = 0
        for d in range(1, depth + 1):
            ny = y + d
            if ny >= TILE or mask[ny][x]:
                break
            px[x, ny] = G_DARK
            touched += 1
        if touched:
            tips += 1
    return tips


def fringe_diag(im, mask, rim, seed, n=3):
    """斜边上的稀疏草尖：沿 45° 边界挑两三处，朝土的一侧探 1~2 像素深橄榄绿。

    斜边的"朝土方向"逐点不同（草 7/8 的砖朝左下，草 1/8 的砖朝右上），
    所以不能像直边那样只往下长，要按每个草根像素实际的土邻居方向走。
    """
    px = im.load()
    cand = []
    for x, y in rim:
        for dy, dx in ((1, 0), (0, 1), (0, -1), (-1, 0)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < TILE and 0 <= nx < TILE and not mask[ny][nx]:
                cand.append(((x, y), (dy, dx)))
                break
    if not cand:
        return 0
    cand.sort()
    tips, used = 0, set()
    for k in range(len(cand) * 2):
        if tips >= n:
            break
        (x, y), (dy, dx) = cand[int(rand(seed + 83, k) * len(cand)) % len(cand)]
        if (x, y) in used:
            continue
        used.add((x, y))
        depth = 1 + (1 if rand(seed + 89, k) < 0.35 else 0)
        touched = 0
        for d in range(1, depth + 1):
            ny, nx = y + dy * d, x + dx * d
            if not (0 <= ny < TILE and 0 <= nx < TILE) or mask[ny][nx]:
                break
            px[nx, ny] = G_DARK
            touched += 1
        if touched:
            tips += 1
    return tips


def build(shape, variant):
    if shape in DIAG_SHAPES:
        mask = diag_mask(shape)
    else:
        hx, vy = profiles(20261124)
        mask = grass_mask(shape, hx, vy)
    im, mask, rim, base_g, base_s = compose(shape, mask, variant % VARIANTS, (variant * 3 + 1) % 4)
    if shape in DIAG_SHAPES:
        fringe_diag(im, mask, rim, 7300 + variant * 41)
    else:
        fringe(im, mask, rim, 5150 + variant * 37)
    return im, mask, rim


def lum(c):
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]


def facet_stats(mask):
    """斜角砖自检：逐行草像素数必须恒定地每行只差 1 像素，才是真正的 45° 阶梯。"""
    rows = [(y, sum(row)) for y, row in enumerate(mask)]
    rows = [(y, n) for y, n in rows if 0 < n < TILE]
    steps = sorted({b - a for (_, a), (_, b) in zip(rows, rows[1:])})
    return {'rows_with_boundary': len(rows), 'row_steps': steps}


def report(shape, variant, im, mask, rim):
    px = im.load()
    counts = {}
    for y in range(TILE):
        for x in range(TILE):
            counts[px[x, y]] = counts.get(px[x, y], 0) + 1
    palette = {*GRASS_SET.values(), *SOIL_SET.values()}

    # 密度分母用整侧面积；草根线是设计要求的交界线，不算纹理，从分子里剔除
    rim_set = set(rim)
    g_area = sum(row.count(True) for row in mask)
    s_area = TILE * TILE - g_area
    g_dark = sum(1 for y in range(TILE) for x in range(TILE)
                 if mask[y][x] and (x, y) not in rim_set and px[x, y] == hex_rgb(GRASS_SET['dark']))
    s_dark = sum(1 for y in range(TILE) for x in range(TILE)
                 if not mask[y][x] and px[x, y] == hex_rgb(SOIL_SET['dark']))

    return {
        'file': f'assets/edge/edge-grasssoil-{shape}-{variant}.png',
        'size': [TILE, TILE],
        'palette_locked': {'#%02x%02x%02x' % c[:3] for c in counts} <= palette,
        'colors_used': len(counts),
        'colors': {'#%02x%02x%02x' % c[:3]: v for c, v in sorted(counts.items(), key=lambda kv: -kv[1])},
        'grass_area': sum(row.count(True) for row in mask),
        'soil_area': TILE * TILE - sum(row.count(True) for row in mask),
        'grass_dark_ratio': round(g_dark / max(g_area, 1), 3),
        'soil_dark_ratio': round(s_dark / max(s_area, 1), 3),
        'seam': {'edge_left_grass_rows': [y for y in range(TILE) if mask[y][0]],
                 'edge_right_grass_rows': [y for y in range(TILE) if mask[y][TILE - 1]]},
        'facet_45': facet_stats(mask),
    }


def plain_ratios():
    """原块的参考密度，用来判断过渡砖有没有延续纹理密度。"""
    gd = sd = 0
    for im, target, out in ((GRASS.build('lawn', 0), GRASS_SET['dark'], 'g'),
                            (SOIL.build('bare', 0), SOIL_SET['dark'], 's')):
        px = im.load()
        n = sum(1 for y in range(TILE) for x in range(TILE) if px[x, y] == hex_rgb(target))
        if out == 'g':
            gd = n
        else:
            sd = n
    return round(gd / 1024, 3), round(sd / 1024, 3)


def rot(im, k):
    """顺时针旋转 k 个 90 度。"""
    for _ in range(k % 4):
        im = im.transpose(Image.ROTATE_270)
    return im


def assemble(kind, tiles):
    """按草在四边的位置挑砖并旋转，拼一块实际场景验证整套砖能不能接起来。

    kind='patch' ：草地里挖出矩形裸土——土在中间，用内角砖（草的角向内凹）
    kind='island'：裸土上有一座草岛——草在中间，用外角砖（草的角向外凸）
    rot(im, k) 为顺时针 k×90 度：草在上 → 1 = 草在右 → 2 = 草在下 → 3 = 草在左。
    """
    cols, rows = 8, 6
    canvas = Image.new('RGBA', (TILE * cols, TILE * rows))
    plain_g = [GRASS.build('lawn', v) for v in range(4)]
    plain_s = [SOIL.build('bare', v) for v in range(4)]
    fill = plain_s if kind == 'patch' else plain_g       # 中间那一块
    outside = plain_g if kind == 'patch' else plain_s     # 外围
    for gy in range(rows):
        for gx in range(cols):
            canvas.paste(outside[(gx * 3 + gy) % 4], (gx * TILE, gy * TILE))

    x0, y0, x1, y1 = 2, 1, 5, 3
    for gy in range(y0, y1 + 1):
        for gx in range(x0, x1 + 1):
            top, bottom = gy == y0, gy == y1
            left, right = gx == x0, gx == x1
            v = (gx + gy) % VARIANTS
            if top and left:
                t = rot(tiles[('inner' if kind == 'patch' else 'outer', v)], 0 if kind == 'patch' else 2)
            elif top and right:
                t = rot(tiles[('inner' if kind == 'patch' else 'outer', v)], 1 if kind == 'patch' else 3)
            elif bottom and right:
                t = rot(tiles[('inner' if kind == 'patch' else 'outer', v)], 2 if kind == 'patch' else 0)
            elif bottom and left:
                t = rot(tiles[('inner' if kind == 'patch' else 'outer', v)], 3 if kind == 'patch' else 1)
            elif top:
                t = rot(tiles[('straight', v)], 0 if kind == 'patch' else 2)
            elif bottom:
                t = rot(tiles[('straight', v)], 2 if kind == 'patch' else 0)
            elif left:
                t = rot(tiles[('straight', v)], 3 if kind == 'patch' else 1)
            elif right:
                t = rot(tiles[('straight', v)], 1 if kind == 'patch' else 3)
            else:
                t = fill[v]
            canvas.paste(t, (gx * TILE, gy * TILE))
    return canvas


def bevel_plot(kind, tiles, cols=8, rows=6):
    """四角斜切的田块：patch = 土田四角斜切（bevel-inner），island = 草岛四角斜切（bevel-outer）。

    四角统一按 (是否上边, 是否左边) 取旋转量：左上 3 / 右上 0 / 左下 2 / 右下 1。
    这套映射对两种 kind 同时成立——因为斜切只切一个角，土与草互换后角的位置不变。
    """
    shape = 'bevel-inner' if kind == 'patch' else 'bevel-outer'
    canvas = Image.new('RGBA', (TILE * cols, TILE * rows))
    plain_g = [GRASS.build('lawn', v) for v in range(4)]
    plain_s = [SOIL.build('bare', v) for v in range(4)]
    fill = plain_s if kind == 'patch' else plain_g
    outside = plain_g if kind == 'patch' else plain_s
    for gy in range(rows):
        for gx in range(cols):
            canvas.paste(outside[(gx * 3 + gy) % 4], (gx * TILE, gy * TILE))

    corner = {(True, True): 3, (True, False): 0, (False, True): 2, (False, False): 1}
    x0, y0, x1, y1 = 1, 1, 6, 4
    for gy in range(y0, y1 + 1):
        for gx in range(x0, x1 + 1):
            top, bottom = gy == y0, gy == y1
            left, right = gx == x0, gx == x1
            v = (gx + gy) % VARIANTS
            if (top or bottom) and (left or right):
                t = rot(tiles[(shape, v)], corner[(top, left)])
            elif top:
                t = rot(tiles[('straight', v)], 0 if kind == 'patch' else 2)
            elif bottom:
                t = rot(tiles[('straight', v)], 2 if kind == 'patch' else 0)
            elif left:
                t = rot(tiles[('straight', v)], 3 if kind == 'patch' else 1)
            elif right:
                t = rot(tiles[('straight', v)], 1 if kind == 'patch' else 3)
            else:
                t = fill[v]
            canvas.paste(t, (gx * TILE, gy * TILE))
    return canvas


def diag_strip(tiles, cols=8, rows=6, off=2):
    """45° 斜边：草在左上、土在右下，斜线 y = x + c。

    逐砖算局部截距 d = c + 32*(gx-gy)：
    d = 16 用 bevel-inner（草 7/8）、d = -16 用 bevel-outer 转 180 度（草 1/8），
    两者相间正好把一条 45° 线铺出来；|d| >= 32 的砖整块是草或整块是土。
    """
    c = MID + TILE * off
    canvas = Image.new('RGBA', (TILE * cols, TILE * rows))
    plain_g = [GRASS.build('lawn', v) for v in range(4)]
    plain_s = [SOIL.build('bare', v) for v in range(4)]
    for gy in range(rows):
        for gx in range(cols):
            d = c + TILE * (gx - gy)
            v = (gx * 2 + gy) % VARIANTS
            if d >= MID * 2:
                t = plain_g[(gx + gy) % 4]
            elif d == MID:
                t = tiles[('bevel-inner', v)]
            elif d == -MID:
                t = rot(tiles[('bevel-outer', v)], 2)
            elif d <= -MID * 2:
                t = plain_s[(gx + gy) % 4]
            else:
                raise SystemExit(f'斜边相错误：d={d}')
            canvas.paste(t, (gx * TILE, gy * TILE))
    return canvas


GRASS_COLORS = {hex_rgb(GRASS_SET[k]) for k in ('base', 'light', 'dark')}
SOIL_COLORS = {hex_rgb(SOIL_SET[k]) for k in ('base', 'light', 'dark')}


def diag_band(tiles, cols=8, rows=6, off=2, width=TILE * 2):
    """45° 斜向土带：草在上、土带居中、草在下，两条边界各用一组斜角砖。

    上边界的草在上（草 7/8 用 bevel-inner，草 1/8 用 bevel-outer 转 180 度）；
    下边界的草在下，正好是两者对调——同一套砖把两条边都铺得出来。
    """
    c1 = MID + TILE * off
    c2 = c1 + width
    canvas = Image.new('RGBA', (TILE * cols, TILE * rows))
    plain_g = [GRASS.build('lawn', v) for v in range(4)]
    plain_s = [SOIL.build('bare', v) for v in range(4)]
    for gy in range(rows):
        for gx in range(cols):
            d1 = c1 + TILE * (gx - gy)
            d2 = c2 + TILE * (gx - gy)
            v = (gx * 2 + gy) % VARIANTS
            if d1 == MID:                       # 草在上、土在下
                t = tiles[('bevel-inner', v)]
            elif d1 == -MID:
                t = rot(tiles[('bevel-outer', v)], 2)
            elif d2 == MID:                     # 土在上、草在下
                t = tiles[('bevel-outer', v)]
            elif d2 == -MID:
                t = rot(tiles[('bevel-inner', v)], 2)
            elif d1 >= MID * 2 or d2 <= -MID * 2:
                t = plain_g[(gx + gy) % 4]
            else:
                t = plain_s[(gx + gy) % 4]
            canvas.paste(t, (gx * TILE, gy * TILE))
    return canvas


def seam_faults(canvas):
    """装配自检：草像素紧贴土像素时必须已经是深橄榄绿的草根，否则说明某块转错了。

    单块自检查不出旋转错误——每块自己的草根都是对的；只有拼起来跨砖看，
    才能发现两条边界对不上、草直接贴到土上。返回 (坏点数, 位置)。
    """
    px = canvas.load()
    w, h = canvas.size
    bad = []
    for y in range(h):
        for x in range(w):
            c = px[x, y]
            if c not in GRASS_COLORS or c == G_DARK:
                continue
            for dy, dx in ((1, 0), (0, 1), (-1, 0), (0, -1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < h and 0 <= nx < w and px[nx, ny] in SOIL_COLORS:
                    bad.append((x, y))
                    break
    return len(bad), bad[:6]


def contact_sheet(tiles, name):
    """一行形状、三列变体，6 倍放大，另附色板。"""
    pad = 10
    cell = TILE * 6
    all_shapes = SHAPES + DIAG_SHAPES
    tiles_h = pad + len(all_shapes) * (cell + pad)
    sw_y = tiles_h + pad
    sheet = Image.new('RGBA', (cell * 3 + pad * 4, sw_y + TILE * 2 + pad),
                      (246, 240, 228, 255))
    for r, shape in enumerate(all_shapes):
        for c in range(VARIANTS):
            sheet.paste(tiles[(shape, c)].resize((cell, cell), Image.NEAREST),
                        (pad + c * (cell + pad), pad + r * (cell + pad)))
    sw = Image.new('RGBA', (TILE * 6, TILE))
    order = ('base', 'light', 'dark')
    for i, k in enumerate(order):
        sw.paste(Image.new('RGBA', (TILE, TILE), hex_rgb(GRASS_SET[k])), (i * TILE, 0))
    for i, k in enumerate(order):
        sw.paste(Image.new('RGBA', (TILE, TILE), hex_rgb(SOIL_SET[k])), ((i + 3) * TILE, 0))
    sheet.paste(sw.resize((TILE * 6 * 2, TILE * 2), Image.NEAREST), (pad, sw_y))
    sheet.save(PREVIEWS / name, optimize=True)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    PREVIEWS.mkdir(parents=True, exist_ok=True)
    g_ref, s_ref = plain_ratios()
    manifest = {
        'tile': TILE,
        'variants': VARIANTS,
        'view': '固定俯视微倾，左上受光；草在上、土在下，交界贴地',
        'palette': {'grass': GRASS_SET, 'soil': SOIL_SET},
        'plain_reference': {'grass_dark_ratio': g_ref, 'soil_dark_ratio': s_ref},
        'shapes': list(SHAPES + DIAG_SHAPES),
        'tiles': {},
    }
    problems = []
    tiles = {}
    for shape in SHAPES + DIAG_SHAPES:
        atlas = Image.new('RGBA', (TILE * VARIANTS, TILE))
        for v in range(VARIANTS):
            im, mask, rim = build(shape, v)
            tiles[(shape, v)] = im
            im.save(OUT / f'edge-grasssoil-{shape}-{v}.png', optimize=True)
            atlas.alpha_composite(im, (v * TILE, 0))
            info = report(shape, v, im, mask, rim)
            manifest['tiles'][f'{shape}-{v}'] = info
            if not info['palette_locked']:
                problems.append(f"{info['file']}: 出现六色之外的像素")
            # 密度延续：两侧暗部占比与原块相差不超过 40%。
            # 斜角砖会有一侧只剩 45° 三角，样本太小，比值没有意义，跳过。
            if info['grass_area'] >= 256 and not g_ref * 0.5 <= info['grass_dark_ratio'] <= g_ref * 1.6:
                problems.append(f"{info['file']}: 草侧暗部 {info['grass_dark_ratio']} 偏离原块 {g_ref}")
            if info['soil_area'] >= 256 and not s_ref * 0.5 <= info['soil_dark_ratio'] <= s_ref * 1.6:
                problems.append(f"{info['file']}: 土侧暗部 {info['soil_dark_ratio']} 偏离原块 {s_ref}")
            # 直边砖两端必须等高，横向才能连成一条边界
            if shape == 'straight':
                l = info['seam']['edge_left_grass_rows']
                r = info['seam']['edge_right_grass_rows']
                if len(l) != len(r) or (l and (l[-1] + 1 != len(l) or r[-1] + 1 != len(r))):
                    problems.append(f"{info['file']}: 两侧边界高度不一致 {len(l)} vs {len(r)}")
            # 斜角砖的边界必须逐行平移 1 像素，斜率才是 45°
            if shape in DIAG_SHAPES and info['facet_45']['row_steps'] not in ([-1], [1]):
                problems.append(f"{info['file']}: 斜边不是 45° {info['facet_45']}")
            # 草根线不能断：边界上每个草像素都必须是深橄榄绿
            broken = [p for p in rim if im.load()[p] != G_DARK]
            if broken:
                problems.append(f"{info['file']}: 草根线有 {len(broken)} 处断裂")
            print(json.dumps(info, ensure_ascii=False))
        atlas.save(OUT / f'edge-grasssoil-{shape}-atlas.png', optimize=True)
        tiles[(shape, 0)].resize((TILE * 8, TILE * 8), Image.NEAREST).save(
            PREVIEWS / f'edge-grasssoil-{shape}-8x.png', optimize=True)

    contact_sheet(tiles, 'edge-grasssoil-sheet.png')
    # 直边横向对接：3 块平铺，检查边界是否连贯、纹理有没有接缝
    strip = Image.new('RGBA', (TILE * 3, TILE * 2))
    for gy in range(2):
        for gx in range(3):
            strip.paste(tiles[('straight', gx % VARIANTS)], (gx * TILE, gy * TILE))
    strip.resize((TILE * 3 * 6, TILE * 2 * 6), Image.NEAREST).save(
        PREVIEWS / 'edge-straight-3x2-6x.png', optimize=True)
    for kind, name in (('patch', 'edge-assemble-soilpatch-4x.png'),
                       ('island', 'edge-assemble-grassisland-4x.png')):
        assemble(kind, tiles).resize((TILE * 8 * 4, TILE * 6 * 4), Image.NEAREST).save(
            PREVIEWS / name, optimize=True)

    # 斜角砖的两张装配图：四角斜切的田块，和一条 45° 斜边。
    # 跨砖检查草根是否连续——单块自检看不出旋转错误，只有拼起来才暴露。
    diag_checks = {}
    for kind, name in (('patch', 'edge-bevel-soilplot-4x.png'),
                       ('island', 'edge-bevel-grassisland-4x.png')):
        canvas = bevel_plot(kind, tiles)
        faults, where = seam_faults(canvas)
        diag_checks[f'bevel-{kind}'] = {'seam_faults': faults, 'at': where}
        if faults:
            problems.append(f"{name}: 跨砖草根断裂 {faults} 处 {where}")
        canvas.resize((TILE * 8 * 4, TILE * 6 * 4), Image.NEAREST).save(PREVIEWS / name, optimize=True)
    strip45 = diag_strip(tiles)
    faults, where = seam_faults(strip45)
    diag_checks['diag-strip'] = {'seam_faults': faults, 'at': where}
    if faults:
        problems.append(f"edge-diag-strip-4x.png: 跨砖草根断裂 {faults} 处 {where}")
    strip45.resize((TILE * 8 * 4, TILE * 6 * 4), Image.NEAREST).save(
        PREVIEWS / 'edge-diag-strip-4x.png', optimize=True)
    band45 = diag_band(tiles)
    faults, where = seam_faults(band45)
    diag_checks['diag-band'] = {'seam_faults': faults, 'at': where}
    if faults:
        problems.append(f"edge-diag-band-4x.png: 跨砖草根断裂 {faults} 处 {where}")
    band45.resize((TILE * 8 * 4, TILE * 6 * 4), Image.NEAREST).save(
        PREVIEWS / 'edge-diag-band-4x.png', optimize=True)
    manifest['diagonal'] = {
        'shapes': list(DIAG_SHAPES),
        'line': 'y = x + 16，从左边中点走到下边中点；端点与直边砖边界对齐',
        'note': '两形状互为补集：bevel-inner 草 7/8 + 45° 土三角，bevel-outer 互换。'
                '斜切角用单块按角旋转；45° 斜边用两者相间（d=+16 用 bevel-inner，'
                'd=-16 用 bevel-outer 转 180 度）',
        'corner_rotation': {'top_left': 3, 'top_right': 0, 'bottom_left': 2, 'bottom_right': 1},
        'checks': diag_checks,
        'outputs': ['../../output/art-previews/edge/edge-bevel-soilplot-4x.png',
                    '../../output/art-previews/edge/edge-bevel-grassisland-4x.png',
                    '../../output/art-previews/edge/edge-diag-strip-4x.png',
                    '../../output/art-previews/edge/edge-diag-band-4x.png'],
    }
    (OUT / 'edge-manifest.json').write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    if '--verify' in sys.argv:
        print('校验:', '通过' if not problems else problems)
        sys.exit(1 if problems else 0)
    print('done:', OUT)


if __name__ == '__main__':
    main()
