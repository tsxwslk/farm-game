"""柳湾耕地顶面：32x32 原生像素、四边无缝平铺、固定左上受光。

运行：python3 prototype/pixel-farm/tilled-generate.py [--verify]
输出：prototype/pixel-farm/assets/tilled/

做法：
1) 结构分两层。先算一张"角色图"（base / light / dark），再按色板上色。
   干土与湿土共用同一张角色图，所以土脊、浅沟的位置逐像素一致——
   并排时只有地表颜色变了，纹理结构没动。
2) 翻土纹理是横向的：4 条垄，垄距 8 像素（整除 32，横竖都能接）。
   垄心固定不随变体变化，混铺时垄间距稳定；垄线本身在 x 上做 ±1 的
   环形游走，接缝处不会断成两级台阶。
3) 每垄由断续短笔组成：浅赭横笔（长 2~5）沿脊线铺，笔间留 1~2 像素断口，
   约三成往上叠一行，读作日晒的脊顶；垄间沟里铺深棕短笔，覆盖更稀，
   读作浅沟。垄带内另撒几笔明暗土块，形成参差的翻土面而不是条纹布。
4) 所有绘制坐标对 32 取模，横向笔触可以跨过砖缝，平铺后仍是一整片耕地。
整张图三档颜色，无抗锯齿、无放大旧贴图。
每种材质出 4 个变体，供引擎随机取用。
"""
from pathlib import Path
import json
import sys
from PIL import Image

TILE = 32
VARIANTS = 4
BANDS = 8                 # 横纹条数（犁沟痕迹，不是田间垄台）
BAND = TILE // BANDS      # 行距 4
ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'assets' / 'tilled'
PREVIEWS = ROOT.parents[1] / 'output' / 'art-previews' / 'tilled'

PALETTE = {
    # 干耕地：暖棕底 / 浅赭土脊 / 深棕浅沟。整体明度明显低于金橙裸土。
    'dry': {'base': '#a9652c', 'light': '#c07c3b', 'dark': '#8a4d24'},
    # 湿耕地：深暖棕底，脊与沟同步压暗，保留同一套明暗关系。
    'wet': {'base': '#6d4630', 'light': '#82573b', 'dark': '#573622'},
}
CONF = {
    'seed': 20261124,     # 结构种子，变体在此基础上偏移
    'lit': 5,             # 每条带里浅赭短笔数（落在带的上半）
    'dim': 3,             # 每条带里深棕短笔数（落在带的下半），比土脊稀
    'specks': 8,          # 碎土点
}

# 田畦边缘：与 scene.js 的 BED_HEIGHT=4 配套，不在静态纹理里画。
# 上沿受光亮唇 / 左右轮廓线 / 前侧土壁 / 土壁碎石 / 落地投影。
EDGE = {
    'dry': {'lip': '#de9e56', 'line': '#7c4420', 'wall': '#754a24',
            'gravel': '#b87c42', 'shadow': '#3345322e'},
    'wet': {'lip': '#8f6446', 'line': '#573622', 'wall': '#503322',
            'gravel': '#7e5a3e', 'shadow': '#3345322e'},
}
LIFT = 4                  # 田畦抬高像素，等于 BED_HEIGHT


def hex_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (255,)


def rand(seed, i):
    """整数哈希 -> [0,1)，跨平台一致。"""
    x = (i * 374761393 + seed * 668265263) & 0xFFFFFFFF
    x = (x ^ (x >> 13)) * 1274126177 & 0xFFFFFFFF
    return ((x ^ (x >> 16)) & 0xFFFFFF) / 0xFFFFFF


def build_roles(variant):
    """角色图：只描述"哪里是脊、哪里是沟"，不带颜色。

    8 条 4 像素高的带，每条带上半只放浅赭短笔、下半只放深棕短笔，
    读作"坡面受光、坡脚积影"的微起伏——一条条横向的犁沟痕迹。
    笔的横向位置、长度全部随机，所以不是条纹布；行节奏由带保证，
    不会出现大片空白。坐标对 32 取模，横向笔触可以跨过砖缝。
    """
    seed = CONF['seed'] + variant * 613
    roles = [['base'] * TILE for _ in range(TILE)]

    for k in range(BANDS):
        y0 = k * BAND                       # 带顶 0 / 4 / 8 … / 28
        # 浅赭：晒到太阳的土脊，落在带上半；部分笔往下叠一行，读成翻起的厚土块
        for j in range(CONF['lit']):
            length = 2 + int(rand(seed + 100 + k, j) * 4)     # 2~5
            sx = int(rand(seed + 101 + k, j) * TILE) % TILE
            yy = y0 + j % 2
            thick = yy == y0 and rand(seed + 102 + k, j) < 0.25
            for i in range(length):
                xx = (sx + i) % TILE
                if roles[yy][xx] == 'base':
                    roles[yy][xx] = 'light'
                if thick and roles[(yy + 1) % TILE][xx] == 'base':
                    roles[(yy + 1) % TILE][xx] = 'light'
        # 深棕：脊脚与被犁开的浅沟，落在带下半
        for j in range(CONF['dim']):
            length = 2 + int(rand(seed + 200 + k, j) * 3)     # 2~4
            sx = int(rand(seed + 201 + k, j) * TILE) % TILE
            yy = y0 + (2 if j % 2 == 0 else 3)
            for i in range(length):
                xx = (sx + i) % TILE
                if roles[yy][xx] == 'base':
                    roles[yy][xx] = 'dark'

    # 碎土点：1 像素，打破带与带之间的空白
    for i in range(CONF['specks']):
        x = int(rand(seed + 50, i) * TILE) % TILE
        y = int(rand(seed + 51, i) * TILE) % TILE
        if roles[y][x] == 'base':
            roles[y][x] = 'dark' if i % 3 else 'light'
    return roles

    # 碎土点：1 像素，打破大片底色
    for i in range(CONF['specks']):
        x = int(rand(seed + 50, i) * TILE) % TILE
        y = int(rand(seed + 51, i) * TILE) % TILE
        if roles[y][x] == 'base':
            roles[y][x] = 'dark' if i % 3 else 'light'
    return roles


def paint(roles, material):
    pal = {k: hex_rgb(v) for k, v in PALETTE[material].items()}
    im = Image.new('RGBA', (TILE, TILE), pal['base'])
    px = im.load()
    for y in range(TILE):
        for x in range(TILE):
            px[x, y] = pal[roles[y][x]]
    return im


def build(material, variant):
    return paint(build_roles(variant), material)


def roles_of(im, material):
    """从成品图反查角色，用来验证干湿两版的结构是否逐像素相同。"""
    rev = {hex_rgb(v): k for k, v in PALETTE[material].items()}
    px = im.load()
    return [[rev.get(px[x, y], '?') for x in range(TILE)] for y in range(TILE)]


def lum(c):
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]


def report(material, variant, im):
    px = im.load()
    pal = PALETTE[material]
    counts = {}
    for y in range(TILE):
        for x in range(TILE):
            counts[px[x, y]] = counts.get(px[x, y], 0) + 1

    def block(x0, y0, w, h):
        v = [lum(px[x, y]) for y in range(y0, y0 + h) for x in range(x0, x0 + w)]
        return round(sum(v) / len(v), 2)

    wrapx = sum(abs(lum(px[TILE - 1, y]) - lum(px[0, y])) for y in range(TILE)) / TILE
    wrapy = sum(abs(lum(px[x, TILE - 1]) - lum(px[x, 0])) for x in range(TILE)) / TILE
    inner = max(abs(lum(px[x, y]) - lum(px[x + 1, y]))
                for y in range(TILE) for x in range(1, TILE - 2))
    corners = {'tl': block(0, 0, 16, 16), 'tr': block(16, 0, 16, 16),
               'bl': block(0, 16, 16, 16), 'br': block(16, 16, 16, 16)}
    light = hex_rgb(pal['light'])
    dark = hex_rgb(pal['dark'])
    # 每条带都要有明暗：某一条带没分到短笔就会出现一条空白横纹，平铺后成条纹
    total_l = counts.get(light, 0) or 1
    total_d = counts.get(dark, 0) or 1
    bands = []
    for k in range(BANDS):
        rows = range(k * BAND, (k + 1) * BAND)
        lit = sum(1 for y in rows for x in range(TILE) if px[x, y] == light)
        dim = sum(1 for y in rows for x in range(TILE) if px[x, y] == dark)
        bands.append({'y': k * BAND, 'light': round(lit / total_l, 3),
                      'dark': round(dim / total_d, 3)})
    return {
        'file': f'assets/tilled/tilled-{material}-{variant}.png',
        'size': [TILE, TILE],
        'palette_locked': sorted('#%02x%02x%02x' % c[:3] for c in counts) == sorted(pal.values()),
        'colors': {'#%02x%02x%02x' % c[:3]: v for c, v in sorted(counts.items(), key=lambda kv: -kv[1])},
        'light_ratio': round(counts.get(light, 0) / (TILE * TILE), 3),
        'dark_ratio': round(counts.get(dark, 0) / (TILE * TILE), 3),
        'mean_lum': block(0, 0, TILE, TILE),
        'corner_lum': {**corners, 'center': block(8, 8, 16, 16)},
        'lum_spread': round(max(corners.values()) - min(corners.values()), 2),
        'seam_delta': {'wrap_x': round(wrapx, 2), 'wrap_y': round(wrapy, 2), 'inner_max': round(inner, 2)},
        'band_share': bands,
    }


def field_sheet(tiles, cols, rows, seed=999):
    sheet = Image.new('RGBA', (TILE * cols, TILE * rows))
    for gy in range(rows):
        for gx in range(cols):
            sheet.paste(tiles[int(rand(seed, gy * cols + gx) * len(tiles)) % len(tiles)],
                        (gx * TILE, gy * TILE))
    return sheet


def blend(px, x, y, hex_color):
    """PIL 里赋半透明色不会自动混色，投影得手动按下层混。"""
    sr, sg, sb, sa = hex_rgb(hex_color)
    r, g, b, _ = px[x, y]
    t = sa / 255
    px[x, y] = (round(r + (sr - r) * t), round(g + (sg - g) * t),
                round(b + (sb - b) * t), 255)


def bed_panel(tiles, lawn, material, raised):
    """2x2 种植单元放在 4x4 草地里；raised 时按田畦抬高并补四条边。

    上沿亮唇、左右轮廓线、前侧土壁（含碎石与落地投影）——四种边四种画法，
    与 scene.js 的 bedLip/bedSides 一致，只是换成新色系。
    """
    cols = rows = 4
    base = Image.new('RGBA', (TILE * cols, TILE * rows))
    for gy in range(rows):
        for gx in range(cols):
            base.paste(lawn[(gy * cols + gx) % len(lawn)], (gx * TILE, gy * TILE))
    cover = set()
    for gy in (1, 2):
        for gx in (1, 2):
            base.paste(tiles[(gy * 2 + gx) % len(tiles)], (gx * TILE, gy * TILE))
            cover |= {(gx * TILE + x, gy * TILE + y) for y in range(TILE) for x in range(TILE)}
    if not raised:
        return base

    pal = EDGE[material]
    out = base.copy()
    lifted = Image.new('RGBA', base.size)
    for gy in (1, 2):
        for gx in (1, 2):
            lifted.paste(base.crop((gx * TILE, gy * TILE, gx * TILE + TILE, gy * TILE + TILE)),
                         (gx * TILE, gy * TILE - LIFT))
    out.alpha_composite(lifted)
    px = out.load()
    sides = [(x, y) for (x, y) in cover if (x - 1, y) not in cover or (x + 1, y) not in cover]
    rim = [(x, y) for (x, y) in cover if (x, y - 1) not in cover]
    front = [(x, y) for (x, y) in cover if (x, y + 1) not in cover]
    for x, y in sides:                                    # 左右轮廓，跟着顶面抬起来
        px[x, y - LIFT] = hex_rgb(pal['line'])
    for x, y in rim:                                      # 上沿受光，压过左右线
        px[x, y - LIFT] = hex_rgb(pal['lip'])
    for x, y in front:                                    # 前侧土壁 + 碎石 + 落地投影
        for k in range(1, LIFT + 1):
            px[x, y - LIFT + k] = hex_rgb(pal['wall'])
        if (x + y) % 11 == 0:
            px[x, y - LIFT + 2] = hex_rgb(pal['gravel'])
        for dx in (1, 2):                                 # 只压一行，避免连成黑线
            if (x + dx, y + 1) not in cover:
                blend(px, x + dx, y + 1, pal['shadow'])
    return out


def edge_sheet(tiles, lawn):
    """四格并排：干/湿各一列，上排只贴纹理，下排抬高成田畦。"""
    cells = []
    for material in ('dry', 'wet'):
        for raised in (False, True):
            cells.append(bed_panel(tiles[material], lawn, material, raised))
    w = TILE * 4
    gap = 8
    sheet = Image.new('RGBA', (len(cells) // 2 * (w + gap) + gap, 2 * (w + gap) + gap),
                      (246, 240, 228, 255))
    for i, cell in enumerate(cells):
        sheet.paste(cell, (gap + (i // 2) * (w + gap), gap + (i % 2) * (w + gap)))
    sheet.resize((sheet.width * 4, sheet.height * 4), Image.NEAREST).save(
        PREVIEWS / 'tilled-bed-edge-4x.png', optimize=True)
    return '../../output/art-previews/tilled/tilled-bed-edge-4x.png'


def contact_sheet(material, tiles, name):
    """四变体 6 倍 -> 铺地 2 倍 -> 三色色板，一张图看完。"""
    pad = 8
    variants = Image.new('RGBA', (TILE * VARIANTS, TILE))
    for i, t in enumerate(tiles):
        variants.alpha_composite(t, (i * TILE, 0))
    field = field_sheet(tiles, 12, 4).resize((TILE * 12 * 2, TILE * 4 * 2), Image.NEAREST)
    swatch = Image.new('RGBA', (TILE * 3, TILE))
    for i, key in enumerate(('base', 'light', 'dark')):
        swatch.paste(Image.new('RGBA', (TILE, TILE), hex_rgb(PALETTE[material][key])), (i * TILE, 0))
    sheet = Image.new('RGBA', (TILE * 12 * 2, TILE * 6 + pad + TILE * 8 + pad + TILE * 6),
                      (246, 240, 228, 255))
    sheet.paste(variants.resize((TILE * VARIANTS * 6, TILE * 6), Image.NEAREST), (0, 0))
    sheet.paste(field, (0, TILE * 6 + pad))
    sheet.paste(swatch.resize((TILE * 3 * 6, TILE * 6), Image.NEAREST),
                (0, TILE * 6 + pad + TILE * 8 + pad))
    sheet.save(PREVIEWS / name, optimize=True)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    PREVIEWS.mkdir(parents=True, exist_ok=True)
    manifest = {
        'tile': TILE, 'variants': VARIANTS, 'bands': BANDS, 'band_px': BAND,
        'view': '固定俯视微倾，左上受光',
        'materials': {},
    }
    problems = []
    tiles = {'dry': [], 'wet': []}
    infos = {'dry': [], 'wet': []}
    for material in ('dry', 'wet'):
        atlas = Image.new('RGBA', (TILE * VARIANTS, TILE))
        for v in range(VARIANTS):
            im = build(material, v)
            im.save(OUT / f'tilled-{material}-{v}.png', optimize=True)
            atlas.alpha_composite(im, (v * TILE, 0))
            tiles[material].append(im)
            info = report(material, v, im)
            infos[material].append(info)
            if not info['palette_locked']:
                problems.append(f"{info['file']}: 出现三色之外的像素")
            s = info['seam_delta']
            if s['wrap_x'] > s['inner_max'] or s['wrap_y'] > s['inner_max']:
                problems.append(f"{info['file']}: 环绕差值超过内部最大相邻差值 {s}")
            if info['lum_spread'] > 8:
                problems.append(f"{info['file']}: 四象限亮度差 {info['lum_spread']}，垄分布不均")
            if not 0.10 <= info['light_ratio'] <= 0.26:
                problems.append(f"{info['file']}: 浅赭占比 {info['light_ratio']} 超出 10%~26%")
            if not 0.06 <= info['dark_ratio'] <= 0.20:
                problems.append(f"{info['file']}: 深棕占比 {info['dark_ratio']} 超出 6%~20%")
            # 8 条带各分到约 1/8 的明暗笔；某条明显偏低说明出现了空白横纹
            for b in info['band_share']:
                if b['light'] < 0.05:
                    problems.append(f"{info['file']}: y={b['y']} 带浅赭只有 {b['light']}，出现空白横纹")
                if b['dark'] < 0.04:
                    problems.append(f"{info['file']}: y={b['y']} 带深棕只有 {b['dark']}，出现空白横纹")
        atlas.save(OUT / f'tilled-{material}-atlas.png', optimize=True)
        tiles[material][0].resize((TILE * 8, TILE * 8), Image.NEAREST).save(
            PREVIEWS / f'tilled-{material}-8x.png', optimize=True)
        field_sheet(tiles[material], 8, 5).resize((TILE * 8 * 3, TILE * 5 * 3), Image.NEAREST).save(
            PREVIEWS / f'tilled-{material}-field-3x.png', optimize=True)
        contact_sheet(material, tiles[material], f'tilled-{material}-sheet.png')
        manifest['materials'][material] = {
            'palette': PALETTE[material],
            'variants': infos[material],
            'note': '干耕地：日晒土脊 + 浅沟，明度低于金橙裸土，衬托作物'
                    if material == 'dry' else
                    '湿耕地：以干土角色图为底，只换色板并压低亮度，脊与沟位置不变',
            'atlas': f'assets/tilled/tilled-{material}-atlas.png',
        }

    # 干湿同构：反查各自 PNG 的角色，逐像素比对。上色写错了也会被抓到。
    same = 0
    for v in range(VARIANTS):
        a = roles_of(Image.open(OUT / f'tilled-dry-{v}.png').convert('RGBA'), 'dry')
        b = roles_of(Image.open(OUT / f'tilled-wet-{v}.png').convert('RGBA'), 'wet')
        if a == b:
            same += 1
        else:
            diff = sum(1 for y in range(TILE) for x in range(TILE) if a[y][x] != b[y][x])
            problems.append(f'变体 {v}: 干湿角色图有 {diff} 像素不一致')
    # 明度关系：干土要低于裸土底色，湿土要再低一档
    bare_lum = lum(hex_rgb('#f0b035'))
    dry_lum = sum(i['mean_lum'] for i in infos['dry']) / VARIANTS
    wet_lum = sum(i['mean_lum'] for i in infos['wet']) / VARIANTS
    if dry_lum > bare_lum - 40:
        problems.append(f'干耕地平均明度 {dry_lum:.1f} 与裸土 {bare_lum:.1f} 拉不开')
    if wet_lum > dry_lum - 25:
        problems.append(f'湿耕地平均明度 {wet_lum:.1f} 未明显低于干土 {dry_lum:.1f}')

    # 接缝检查：随机滚动后拼 4x4 混铺，接缝会跑到画面内部
    seam = Image.new('RGBA', (TILE * 4, TILE * 4))
    for gy in range(4):
        for gx in range(4):
            material = 'dry' if gy < 2 else 'wet'
            src = tiles[material][int(rand(4242, gy * 4 + gx) * VARIANTS) % VARIANTS]
            dx = int(rand(4343, gy * 4 + gx) * TILE) % TILE
            dy = int(rand(4444, gy * 4 + gx) * TILE) % TILE
            rolled = Image.new('RGBA', (TILE, TILE))
            for oy in (0, TILE):
                for ox in (0, TILE):
                    rolled.paste(src, (ox - dx, oy - dy))
            seam.paste(rolled, (gx * TILE, gy * TILE))

    seam.resize((TILE * 4 * 6, TILE * 4 * 6), Image.NEAREST).save(
        PREVIEWS / 'tilled-seam-check-6x.png', optimize=True)

    # 干湿并排：上干下湿，同一变体、同一条垄，靠色差辨认
    pair = Image.new('RGBA', (TILE * 2 + 8, TILE * 2 + 8), (246, 240, 228, 255))
    pair.paste(tiles['dry'][0], (0, 0))
    pair.paste(tiles['wet'][0], (TILE + 8, 0))
    pair.paste(tiles['dry'][1], (0, TILE + 8))
    pair.paste(tiles['wet'][1], (TILE + 8, TILE + 8))
    pair.resize((pair.width * 8, pair.height * 8), Image.NEAREST).save(
        PREVIEWS / 'tilled-dry-wet-8x.png', optimize=True)

    # 地块并排：左干右湿，中间硬接，用来验证两块地挨着放时是否读得清
    half = Image.new('RGBA', (TILE * 10, TILE * 5))
    for gy in range(5):
        for gx in range(10):
            material = 'dry' if gx < 5 else 'wet'
            half.paste(tiles[material][int(rand(777, gy * 10 + gx) * VARIANTS) % VARIANTS],
                       (gx * TILE, gy * TILE))
    half.resize((TILE * 10 * 3, TILE * 5 * 3), Image.NEAREST).save(
        PREVIEWS / 'tilled-dry-wet-field-3x.png', optimize=True)

    # 田畦边缘与衬托验证都要用草坪，草坪缺了就跳过这两张
    grass_dir = ROOT / 'assets' / 'grass'
    lawn = []
    if (grass_dir / 'grass-lawn-0.png').exists():
        lawn = [Image.open(grass_dir / f'grass-lawn-{i}.png').convert('RGBA') for i in range(VARIANTS)]
    edge_out = edge_sheet(tiles, lawn) if lawn else None

    # 衬托验证：草地当中挖出一块耕地。绿色是否跳出来，一眼就能看出。
    contrast_out = None
    if lawn:
        cols, rows = 6, 4
        canvas = Image.new('RGBA', (TILE * cols, TILE * rows * 2))
        for half_i, material in enumerate(('dry', 'wet')):
            for gy in range(rows):
                for gx in range(cols):
                    k = gy * cols + gx
                    is_field = 1 <= gx <= 4 and 1 <= gy <= 2
                    if is_field:
                        src = tiles[material][int(rand(888, k) * VARIANTS) % VARIANTS]
                    else:
                        src = lawn[int(rand(889, k) * 4) % 4]
                    canvas.paste(src, (gx * TILE, (half_i * rows + gy) * TILE))
        canvas.resize((canvas.width * 4, canvas.height * 4), Image.NEAREST).save(
            PREVIEWS / 'tilled-contrast-grass-4x.png', optimize=True)
        contrast_out = '../../output/art-previews/tilled/tilled-contrast-grass-4x.png'

    manifest['checks'] = {
        'palette_locked': not any('三色之外' in p for p in problems),
        'dry_wet_same_structure': f'{same}/{VARIANTS}',
        'mean_lum': {'bare_soil': round(bare_lum, 1),
                     'tilled_dry': round(dry_lum, 1), 'tilled_wet': round(wet_lum, 1)},
        'bands': f'{BANDS} 条带，每条 {BAND} 像素高；带的上半放浅赭、下半放深棕',
        'edge': {
            'lift': LIFT,
            'note': '边缘不进静态纹理，由运行时按邻居掩码合成；上沿亮唇、左右轮廓线、'
                    '前侧 4 像素土壁 + 碎石 + 落地投影',
            'palette': EDGE,
            'scene_hook': 'scene.js:39 bedSides / scene.js:49 bedLip / scene.js:7 BED_HEIGHT',
        },
        'outputs': ['../../output/art-previews/tilled/tilled-seam-check-6x.png',
                    '../../output/art-previews/tilled/tilled-dry-wet-8x.png',
                    '../../output/art-previews/tilled/tilled-dry-wet-field-3x.png'] +
                   ([edge_out] if edge_out else []) +
                   ([contrast_out] if contrast_out else []),
    }
    (OUT / 'tilled-manifest.json').write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    for m in ('dry', 'wet'):
        print(m, json.dumps([{k: i[k] for k in ('light_ratio', 'dark_ratio', 'mean_lum',
                                               'lum_spread', 'seam_delta')} for i in infos[m]],
                            ensure_ascii=False))
    print('干湿同构:', f'{same}/{VARIANTS}', '| 明度 裸土/干/湿:',
          round(bare_lum, 1), round(dry_lum, 1), round(wet_lum, 1))
    if '--verify' in sys.argv:
        print('校验:', '通过' if not problems else problems)
        sys.exit(1 if problems else 0)
    print('done:', OUT)


if __name__ == '__main__':
    main()
