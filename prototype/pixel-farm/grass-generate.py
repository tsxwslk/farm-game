"""柳湾低矮草坪地表：32x32 原生像素、四边无缝平铺、固定左上受光。

运行：python3 prototype/pixel-farm/grass-generate.py [--verify]
输出：prototype/pixel-farm/assets/grass/

做法：
1) 黄绿铺底保持安静，远看是连续暖绿；纹理只由稀疏的短草簇承担。
2) 草簇是手工设计的不规则母题：2~3 个错落的叶尖、一条压实的叶基、几根收窄的叶根。
   刻意不对称、宽窄不一，避免读成字母或栅栏。
3) 只有少部分草簇整簇点浅嫩绿叶尖，其余保持深橄榄绿，于是亮尖聚成几处色簇，
   底面留白安静，适合压作物、角色和建筑。
坐标全部对 32 取模，跨边的草簇在对面接上，四边无缝。整图只有三档颜色。
每个材质出 4 个变体，供引擎随机取用。
"""
from pathlib import Path
import json
import sys
from PIL import Image

TILE = 32
VARIANTS = 4
ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'assets' / 'grass'
PREVIEWS = ROOT.parents[1] / 'output' / 'art-previews' / 'grass'

PALETTE = {
    # 草绿铺底 / 浅嫩绿叶尖 / 深橄榄绿暗部
    'lawn': {'base': '#97bc29', 'light': '#b7d74c', 'dark': '#769622'},
}

# 草簇母题：. 空地 / L 叶尖 / D 叶身。宽 3~5、高 2~3。
# 叶尖错落、叶根收窄，横向叶基只做 1 像素，避免读成字母或栅栏。
CLUMPS = [
    ["L.L.", "DDDD", ".D.D"],
    [".L.L", "DDDD", "D.D."],
    ["L.L.L", "DDDDD", ".D.D."],
    ["L.L", "DDD", ".D."],
    ["L..L", "LDDL", ".DD."],
    [".L.L", ".LDD", "DDD."],
]

# clumps 草簇数量 / gap 簇心最小间距 / lit 带亮尖的簇比例 / specks 零散暗点
CONF = {
    'lawn': {'clumps': 11, 'gap': 4.0, 'lit': 0.55, 'light_px': 17, 'specks': 4, 'seed': 51422},
}
GRID = 5
CELL = TILE / GRID


def hex_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (255,)


def rand(seed, i):
    """整数哈希 -> [0,1)，跨平台一致。"""
    x = (i * 374761393 + seed * 668265263) & 0xFFFFFFFF
    x = (x ^ (x >> 13)) * 1274126177 & 0xFFFFFFFF
    return ((x ^ (x >> 16)) & 0xFFFFFF) / 0xFFFFFF


def torus(a, b):
    """环面上的最短差值，保证跨边距离判断正确。"""
    return min(abs(a - b), TILE - abs(a - b))


def build(material, variant, region=None, count=None):
    pal = PALETTE[material]
    base, light, dark = hex_rgb(pal['base']), hex_rgb(pal['light']), hex_rgb(pal['dark'])
    conf = CONF[material]
    seed = conf['seed'] + variant * 917
    im = Image.new('RGBA', (TILE, TILE), base)
    px = im.load()

    # 簇心：抖动格 + 最小间距，宏观密度均匀、微观不落网格。
    # 传入 region 时（过渡砖用）改用 8x8 细格并跳过不可见格。
    # 以"已放置的簇数"为准而不是候选点数：整簇越界时继续找下一个候选，密度才守得住。
    grid = 8 if region is not None else GRID
    cell = TILE / grid
    target = conf['clumps'] if count is None else count
    placed_clumps = []
    centers = []       # 浮点簇心，只用于最小间距判断（与改造前一致）
    for i in sorted(range(grid * grid + 11), key=lambda i: rand(seed + 3, i)):
        if len(placed_clumps) >= target:
            break
        k = len(placed_clumps)   # 用已放置数当种子序号，保证原路径产出与改造前逐像素一致
        cx = (i % grid) * cell + rand(seed + 5, i) * (cell - 1.2) + 0.6
        cy = (i // grid) * cell + rand(seed + 6, i) * (cell - 1.4) + 0.7
        if region is not None:
            cy_i, cx_i = int(cy) % TILE, int(cx) % TILE
            if not region[cy_i][cx_i]:
                continue
        if any(torus(cx, c[0]) < conf['gap'] and torus(cy, c[1]) < conf['gap'] for c in centers):
            continue
        motif = CLUMPS[int(rand(seed + 11, k * 13) * len(CLUMPS)) % len(CLUMPS)]
        # 一半左右镜像，避免同向重复
        if rand(seed + 17, k * 19) < 0.5:
            motif = [row[::-1] for row in motif]
        ox, oy = int(round(cx)) % TILE, int(round(cy)) % TILE
        # 整簇都要落在可见区里，避免被边界切断留下半个草簇
        if region is not None and any(
                not region[(oy + dy) % TILE][(ox + dx) % TILE]
                for dy, row in enumerate(motif) for dx, ch in enumerate(row) if ch != '.'):
            continue
        centers.append((cx, cy))
        placed_clumps.append((ox, oy, motif))

    # 亮尖按像素配额分配：整簇决定亮不亮，按配额挑够为止，
    # 于是四个变体的浅嫩绿总量一致，且亮尖只聚在少数几簇里
    budget = [conf['light_px']]
    order = sorted(range(len(placed_clumps)), key=lambda k: rand(seed + 23, k * 7))
    lit = set()
    for k in order:
        tips = sum(row.count('L') for row in placed_clumps[k][2])
        if budget[0] <= 0 or tips == 0:
            break
        if rand(seed + 29, k * 11) > conf['lit']:
            continue
        lit.add(k)
        budget[0] -= tips
    if not lit and placed_clumps:
        lit.add(order[0])

    for k, (ox, oy, motif) in enumerate(placed_clumps):
        on = k in lit
        for dy, row in enumerate(motif):
            for dx, ch in enumerate(row):
                if ch == '.':
                    continue
                px[(ox + dx) % TILE, (oy + dy) % TILE] = light if (ch == 'L' and on) else dark

    # 零散 1 像素暗点：补一点草缝感，只落在空地，不破坏安静
    placed = 0
    for i in range(80):
        x = int(rand(seed + 53, i) * TILE) % TILE
        y = int(rand(seed + 59, i) * TILE) % TILE
        if placed >= conf['specks'] or px[x, y] != base:
            continue
        px[x, y] = dark
        placed += 1

    return im


def lum(c):
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]


def report(material, variant, im):
    px = im.load()
    counts = {}
    for y in range(TILE):
        for x in range(TILE):
            counts[px[x, y]] = counts.get(px[x, y], 0) + 1
    pal = PALETTE[material]
    base = hex_rgb(pal['base'])

    def block(x0, y0, w, h):
        v = [lum(px[x, y]) for y in range(y0, y0 + h) for x in range(x0, x0 + w)]
        return round(sum(v) / len(v), 2)

    wrapx = sum(abs(lum(px[TILE - 1, y]) - lum(px[0, y])) for y in range(TILE)) / TILE
    wrapy = sum(abs(lum(px[x, TILE - 1]) - lum(px[x, 0])) for x in range(TILE)) / TILE
    inner = max(abs(lum(px[x, y]) - lum(px[x + 1, y])) for y in range(TILE) for x in range(1, TILE - 2))
    corners = {'tl': block(0, 0, 16, 16), 'tr': block(16, 0, 16, 16),
               'bl': block(0, 16, 16, 16), 'br': block(16, 16, 16, 16)}
    return {
        'file': f'assets/grass/grass-{material}-{variant}.png',
        'size': [TILE, TILE],
        'palette_locked': sorted('#%02x%02x%02x' % c[:3] for c in counts) == sorted(pal.values()),
        'colors': {'#%02x%02x%02x' % c[:3]: v for c, v in sorted(counts.items(), key=lambda kv: -kv[1])},
        'deviation_ratio': round(1 - counts.get(base, 0) / (TILE * TILE), 3),
        'light_ratio': round(counts.get(hex_rgb(pal['light']), 0) / (TILE * TILE), 3),
        'dark_ratio': round(counts.get(hex_rgb(pal['dark']), 0) / (TILE * TILE), 3),
        'corner_lum': {**corners, 'center': block(8, 8, 16, 16)},
        'lum_spread': round(max(corners.values()) - min(corners.values()), 2),
        'seam_delta': {'wrap_x': round(wrapx, 2), 'wrap_y': round(wrapy, 2), 'inner_max': round(inner, 2)},
    }


def field_sheet(tiles, cols, rows, seed=999):
    sheet = Image.new('RGBA', (TILE * cols, TILE * rows))
    for gy in range(rows):
        for gx in range(cols):
            sheet.paste(tiles[int(rand(seed, gy * cols + gx) * len(tiles)) % len(tiles)], (gx * TILE, gy * TILE))
    return sheet


def contact_sheet(material, tiles, name):
    """拼一张交付检查图：四个变体 6 倍 -> 铺地 2 倍 -> 三色色板。"""
    variants = Image.new('RGBA', (TILE * VARIANTS, TILE))
    for i, t in enumerate(tiles):
        variants.alpha_composite(t, (i * TILE, 0))
    field = field_sheet(tiles, 12, 4).resize((TILE * 12 * 2, TILE * 4 * 2), Image.NEAREST)
    swatch = Image.new('RGBA', (TILE * 3, TILE))
    for i, key in enumerate(('base', 'light', 'dark')):
        swatch.paste(Image.new('RGBA', (TILE, TILE), hex_rgb(PALETTE[material][key])), (i * TILE, 0))
    pad = 8
    sheet = Image.new('RGBA', (TILE * 12 * 2, TILE * 6 + pad + TILE * 8 + pad + TILE * 6), (246, 240, 228, 255))
    sheet.paste(variants.resize((TILE * VARIANTS * 6, TILE * 6), Image.NEAREST), (0, 0))
    sheet.paste(field, (0, TILE * 6 + pad))
    sheet.paste(swatch.resize((TILE * 12 * 2, TILE * 6), Image.NEAREST), (0, TILE * 6 + pad + TILE * 8 + pad))
    sheet.save(PREVIEWS / name, optimize=True)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    PREVIEWS.mkdir(parents=True, exist_ok=True)
    manifest = {'tile': TILE, 'variants': VARIANTS, 'view': '固定俯视微倾，左上受光', 'materials': {}}
    problems = []
    for material in ('lawn',):
        tiles, atlas, infos = [], Image.new('RGBA', (TILE * VARIANTS, TILE)), []
        for v in range(VARIANTS):
            im = build(material, v)
            im.save(OUT / f'grass-{material}-{v}.png', optimize=True)
            atlas.alpha_composite(im, (v * TILE, 0))
            tiles.append(im)
            info = report(material, v, im)
            infos.append(info)
            if not info['palette_locked']:
                problems.append(f"{info['file']}: 出现三色之外的像素")
            if info['seam_delta']['wrap_x'] > info['seam_delta']['inner_max'] or \
               info['seam_delta']['wrap_y'] > info['seam_delta']['inner_max']:
                problems.append(f"{info['file']}: 环绕差值超过内部最大相邻差值 {info['seam_delta']}")
            if info['lum_spread'] > 6:
                problems.append(f"{info['file']}: 四象限亮度差 {info['lum_spread']}，密度不均")
            if not 0.012 <= info['light_ratio'] <= 0.032:
                problems.append(f"{info['file']}: 亮尖占比 {info['light_ratio']}，不在 1.2%~3.2% 区间")
            if not 0.04 <= info['dark_ratio'] <= 0.12:
                problems.append(f"{info['file']}: 暗部占比 {info['dark_ratio']}，不在 4%~12% 区间")
            print(json.dumps(info, ensure_ascii=False))
        atlas.save(OUT / f'grass-{material}-atlas.png', optimize=True)
        tiles[0].resize((TILE * 8, TILE * 8), Image.NEAREST).save(PREVIEWS / f'grass-{material}-8x.png', optimize=True)
        field_sheet(tiles, 8, 5).resize((TILE * 8 * 3, TILE * 5 * 3), Image.NEAREST).save(
            PREVIEWS / f'grass-{material}-field-3x.png', optimize=True)
        contact_sheet(material, tiles, f'grass-{material}-sheet.png')
        manifest['materials'][material] = {
            'palette': PALETTE[material],
            'variants': infos,
            'note': '低矮草坪，黄绿铺底、深橄榄绿成簇短草、少数色簇带浅嫩绿叶尖',
            'atlas': f'assets/grass/grass-{material}-atlas.png',
        }
    # 接缝检查：把变体随机滚动后拼 4x4。真无缝的砖滚动后依然连贯，
    # 一旦有接缝，滚动会把它推进画面内部，肉眼立刻可见。
    seam = Image.new('RGBA', (TILE * 4, TILE * 4))
    for gy in range(4):
        for gx in range(4):
            src = build('lawn', int(rand(4242, gy * 4 + gx) * VARIANTS) % VARIANTS)
            dx = int(rand(4343, gy * 4 + gx) * TILE)
            dy = int(rand(4444, gy * 4 + gx) * TILE)
            rolled = Image.new('RGBA', (TILE, TILE))
            for oy in (0, TILE):
                for ox in (0, TILE):
                    rolled.paste(src, (ox - dx, oy - dy))
            seam.paste(rolled, (gx * TILE, gy * TILE))
    seam.resize((TILE * 4 * 6, TILE * 4 * 6), Image.NEAREST).save(PREVIEWS / 'grass-seam-check-6x.png', optimize=True)
    soil_path = ROOT / 'assets' / 'soil' / 'soil-bare-0.png'
    if soil_path.exists():
        combo = field_sheet([build('lawn', v) for v in range(VARIANTS)], 8, 5)
        plot = Image.new('RGBA', (TILE * 2, TILE * 2))
        soil = Image.open(soil_path).convert('RGBA')
        for gy in range(2):
            for gx in range(2):
                plot.paste(soil, (gx * TILE, gy * TILE))
        combo.paste(plot, (TILE * 3, TILE * 2))
        combo.resize((TILE * 8 * 4, TILE * 5 * 4), Image.NEAREST).save(PREVIEWS / 'grass-with-soil-4x.png', optimize=True)
    (OUT / 'grass-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    if '--verify' in sys.argv:
        print('校验:', '通过' if not problems else problems)
        sys.exit(1 if problems else 0)
    print('done:', OUT)


if __name__ == '__main__':
    main()
