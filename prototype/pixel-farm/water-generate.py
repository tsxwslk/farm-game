"""柳湾河面：32x32 源像素、四边无缝平铺、平缓青蓝色淡水。

运行：python3 prototype/pixel-farm/water-generate.py [--verify]
输出：prototype/pixel-farm/assets/water/

做法：
1) 水面本体保持主色 #6FAAA6，不铺底纹、不加噪点。
2) 波纹按“波线”组织：每 5~6 行一条（行距不等距，等距会读成布纹），
   一条波线沿 x 走一圈，由 2~5 像素的短段与 1~2 像素的断口交替组成。
3) 明暗落在同一条波线上：六成短段是亮色（受光波峰），四成是暗色（背光波谷）。
   明暗各一套独立的笔画会读成满地色块，必须在同一条线上才像水。
4) 波线会缓慢漂移：偶尔整段上下挪一格，幅度不超过 ±1，读作缓流的走向；
   三成短段加厚成两行，避免整片都是等高的细条。
5) 坐标全部对 32 取模，波线跨边后从对侧接上，四边亮度均匀。
整张图只允许三档颜色，无抗锯齿、无放大旧贴图。每个变体只改种子，色板与密度不变。
"""
from pathlib import Path
import json
import sys
from PIL import Image

TILE = 32
VARIANTS = 4
ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'assets' / 'water'
PREVIEWS = ROOT.parents[1] / 'output' / 'art-previews' / 'water'

PALETTE = {
    'base': '#6FAAA6',     # 平缓淡水的主色
    'light': '#8DBBB0',    # 波峰，短段亮色
    'dark': '#5E9796',     # 波谷，短段暗色
}
CONF = {
    'row_top': 1,           # 第一条波线的 y
    'row_min': 5,           # 波线最小行距
    'row_jitter': 2,        # 行距抖动（0~1 行）
    'seg_len': (2, 5),      # 短段长度，长短不一
    'seg_gap': (1, 2),      # 段间断口：留一点空水，相邻两段才不会糊成一根长条
    'lit_share': 0.62,      # 同一波线上亮段的比例，暗段是少数
    'thick': 0.28,          # 短段加厚一行（两行高）的比例
    'drift': 0.35,          # 走向上下漂移的概率
    'seed': 20261124,
}


def hex_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (255,)


def rand(seed, i):
    """整数哈希 -> [0,1)，跨平台一致。"""
    x = (i * 374761393 + seed * 668265263) & 0xFFFFFFFF
    x = (x ^ (x >> 13)) * 1274126177 & 0xFFFFFFFF
    return ((x ^ (x >> 16)) & 0xFFFFFF) / 0xFFFFFF


def span(seed, lo, hi, i):
    """闭区间整数取值。"""
    return lo + int(rand(seed, i) * (hi - lo + 1))


def strand(seed, y, px, base, light, dark):
    """一条波线：沿 x 走一圈，短段与断口交替，明暗按比例落在同一条线上。

    明暗不是两套独立的标记，而是同一条波线的亮段（受光波峰）与暗段（背光波谷），
    这样整片才读作“一道道起伏的水线”，而不是“满地色块”。
    段与段之间偶尔上下挪一格，整条线才会缓，不会像直尺画出来的。
    """
    x = int(rand(seed, 1) * TILE) % TILE
    dy = 0
    walked = 0
    j = 0
    while walked < TILE:
        ln = span(seed + 10, CONF['seg_len'][0], CONF['seg_len'][1], j)
        gap = span(seed + 20, CONF['seg_gap'][0], CONF['seg_gap'][1], j)
        # 走向漂移：偶尔上下挪一格，幅度不超过 ±1
        if rand(seed + 40, j) < CONF['drift']:
            dy = max(-1, min(1, dy + (-1 if rand(seed + 41, j) < 0.5 else 1)))
        rows = 2 if rand(seed + 60, j) < CONF['thick'] else 1
        pts = [((x + i) % TILE, (y + dy + r) % TILE)
               for i in range(ln) for r in range(rows)]
        # 上下各留一行空水：两条波线的加厚段贴在一起会糊成一整块
        margin = [((x + i) % TILE, (y + dy + ry) % TILE)
                  for i in range(ln) for ry in (-1, rows)]
        if all(px[p] == base for p in pts) and all(px[p] == base for p in margin):
            color = light if rand(seed + 50, j) < CONF['lit_share'] else dark
            for p in pts:
                px[p] = color
        x = (x + ln + gap) % TILE
        walked += ln + gap
        j += 1


def build(variant):
    base, light, dark = (hex_rgb(PALETTE[k]) for k in ('base', 'light', 'dark'))
    seed = CONF['seed'] + variant * 613
    im = Image.new('RGBA', (TILE, TILE), base)
    px = im.load()

    # 波线行距不等：等距会读成布纹，不等距才像水面
    y = CONF['row_top']
    k = 0
    while y < TILE:
        strand(seed + k * 97, y, px, base, light, dark)
        y += CONF['row_min'] + int(rand(seed + 900, k) * CONF['row_jitter'])
        k += 1
    return im


def count_blocks(px, base, size):
    """统计 size×size 的同色块，主色自身不算——整片水本来就是主色。

    两行高的波峰本来就该出现（参考图里也是块状的），所以 2x2 只统计不设限；
    3x3 一旦出现就说明几道笔触糊成了“斑”，那才是要拦的。
    """
    n = 0
    for y in range(TILE):
        for x in range(TILE):
            cells = {px[(x + i) % TILE, (y + j) % TILE]
                     for i in range(size) for j in range(size)}
            if len(cells) == 1 and cells != {base}:
                n += 1
    return n


def count_lone(px, light):
    """孤立亮点：上下左右都没有同伴的亮像素，会被读成噪点。"""
    n = 0
    for y in range(TILE):
        for x in range(TILE):
            if px[x, y] != light:
                continue
            if all(px[(x + dx) % TILE, (y + dy) % TILE] != light
                   for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                n += 1
    return n


def lum(c):
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]


def report(variant, im):
    px = im.load()
    base, light, dark = (hex_rgb(PALETTE[k]) for k in ('base', 'light', 'dark'))
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
                for y in range(TILE) for x in range(TILE - 1))
    inner_y = max(abs(lum(px[x, y]) - lum(px[x, y + 1]))
                  for y in range(TILE - 1) for x in range(TILE))

    bands = [sum(1 for y in range(k * 8, k * 8 + 8) for x in range(TILE)
                 if px[x, y] == light) for k in range(4)]
    corners = {'tl': block(0, 0, 16, 16), 'tr': block(16, 0, 16, 16),
               'bl': block(0, 16, 16, 16), 'br': block(16, 16, 16, 16)}
    border = [lum(px[x, y]) for y in range(TILE) for x in range(TILE)
              if x in (0, TILE - 1) or y in (0, TILE - 1)]
    inner_vals = [lum(px[x, y]) for y in range(2, TILE - 2) for x in range(2, TILE - 2)]

    return {
        'file': f'assets/water/water-flow-{variant}.png',
        'size': [TILE, TILE],
        'palette_locked': (sorted('#%02x%02x%02x' % c[:3] for c in counts) ==
                           sorted(v.lower() for v in PALETTE.values())),
        'colors': {'#%02x%02x%02x' % c[:3]: v for c, v in sorted(counts.items(), key=lambda kv: -kv[1])},
        'base_ratio': round(counts.get(base, 0) / (TILE * TILE), 3),
        'light_ratio': round(counts.get(light, 0) / (TILE * TILE), 3),
        'dark_ratio': round(counts.get(dark, 0) / (TILE * TILE), 3),
        'bands_light': bands,
        'corner_lum': {**corners, 'center': block(8, 8, 16, 16)},
        'lum_spread': round(max(corners.values()) - min(corners.values()), 2),
        'border_delta': round(sum(border) / len(border) - sum(inner_vals) / len(inner_vals), 2),
        'seam_delta': {'wrap_x': round(wrapx, 2), 'wrap_y': round(wrapy, 2),
                       'inner_max': round(inner, 2), 'inner_max_y': round(inner_y, 2)},
        'lone_pixels': count_lone(px, light),
        'blocks_2x2': count_blocks(px, base, 2),
        'blocks_3x3': count_blocks(px, base, 3),
    }


def field_sheet(tiles, cols, rows, seed=999):
    sheet = Image.new('RGBA', (TILE * cols, TILE * rows))
    for gy in range(rows):
        for gx in range(cols):
            sheet.paste(tiles[int(rand(seed, gy * cols + gx) * len(tiles)) % len(tiles)],
                        (gx * TILE, gy * TILE))
    return sheet


def contact_sheet(tiles):
    """交付检查图：四个变体 6 倍 -> 混铺 2 倍 -> 三色色板 6 倍。"""
    variants = Image.new('RGBA', (TILE * VARIANTS, TILE))
    for i, t in enumerate(tiles):
        variants.alpha_composite(t, (i * TILE, 0))
    field = field_sheet(tiles, 12, 5).resize((TILE * 12 * 2, TILE * 5 * 2), Image.NEAREST)
    swatch = Image.new('RGBA', (TILE * 3, TILE))
    for i, key in enumerate(('base', 'light', 'dark')):
        swatch.paste(Image.new('RGBA', (TILE, TILE), hex_rgb(PALETTE[key])), (i * TILE, 0))
    pad = 8
    sheet = Image.new('RGBA', (TILE * 12 * 2, TILE * 6 + pad + field.height + pad + TILE * 6),
                      (246, 240, 228, 255))
    sheet.paste(variants.resize((TILE * VARIANTS * 6, TILE * 6), Image.NEAREST), (0, 0))
    sheet.paste(field, (0, TILE * 6 + pad))
    sheet.paste(swatch.resize((TILE * 3 * 6, TILE * 6), Image.NEAREST),
                (0, TILE * 6 + pad + field.height + pad))
    sheet.save(PREVIEWS / 'water-sheet.png', optimize=True)


def main():
    verify = '--verify' in sys.argv
    OUT.mkdir(parents=True, exist_ok=True)
    PREVIEWS.mkdir(parents=True, exist_ok=True)
    manifest = {'tile': TILE, 'variants': VARIANTS,
                'view': '固定俯视，只有开阔水面，不画岸、不画倒影',
                'palette': PALETTE, 'conf': CONF, 'tiles': {}}
    problems = []
    tiles, atlas = [], Image.new('RGBA', (TILE * VARIANTS, TILE))
    for v in range(VARIANTS):
        im = build(v)
        im.save(OUT / f'water-flow-{v}.png', optimize=True)
        atlas.alpha_composite(im, (v * TILE, 0))
        tiles.append(im)
        info = report(v, im)
        manifest['tiles'][f'flow-{v}'] = info
        if not info['palette_locked']:
            problems.append(f"{info['file']}: 出现三色之外的像素")
        if info['seam_delta']['wrap_x'] > info['seam_delta']['inner_max'] or \
           info['seam_delta']['wrap_y'] > info['seam_delta']['inner_max_y']:
            problems.append(f"{info['file']}: 环绕差值超过内部最大相邻差值 {info['seam_delta']}")
        if info['lum_spread'] > 6:
            problems.append(f"{info['file']}: 四象限亮度差 {info['lum_spread']}，水面不均")
        if abs(info['border_delta']) > 3.5:
            problems.append(f"{info['file']}: 边圈与内部亮度差 {info['border_delta']}，四边不匀")
        if info['lone_pixels']:
            problems.append(f"{info['file']}: 有 {info['lone_pixels']} 个孤立亮点")
        if info['blocks_3x3']:
            problems.append(f"{info['file']}: 有 {info['blocks_3x3']} 处 3x3 同色块，笔触糊成斑了")
        if not 0.05 <= info['light_ratio'] <= 0.16:
            problems.append(f"{info['file']}: 波峰占比 {info['light_ratio']} 超出 5%~16%")
        if not 0.03 <= info['dark_ratio'] <= 0.14:
            problems.append(f"{info['file']}: 波谷占比 {info['dark_ratio']} 超出 3%~14%")
        if min(info['bands_light']) < 3:
            problems.append(f"{info['file']}: 亮纹分布不均，最空的 8 行带只有 "
                            f"{min(info['bands_light'])} 个像素")
        if info['base_ratio'] < 0.78:
            problems.append(f"{info['file']}: 主色只占 {info['base_ratio']}，水面不安静")

    atlas.save(OUT / 'water-atlas.png', optimize=True)
    tiles[0].resize((TILE * 8, TILE * 8), Image.NEAREST).save(
        PREVIEWS / 'water-flow-0-8x.png', optimize=True)
    field_sheet(tiles, 10, 6).resize((TILE * 10 * 3, TILE * 6 * 3), Image.NEAREST).save(
        PREVIEWS / 'water-field-3x.png', optimize=True)
    contact_sheet(tiles)

    # 接缝检查：同一个变体滚动后拼 4x4。真无缝的砖滚动后依然连贯，
    # 一旦有接缝，滚动会把它推进画面内部，肉眼立刻可见。
    seam = Image.new('RGBA', (TILE * 4, TILE * 4))
    for gy in range(4):
        for gx in range(4):
            src = build(int(rand(4242, gy * 4 + gx) * VARIANTS) % VARIANTS)
            dx, dy = int(rand(4343, gy * 4 + gx) * TILE), int(rand(4444, gy * 4 + gx) * TILE)
            rolled = Image.new('RGBA', (TILE, TILE))
            for oy in (0, TILE):
                for ox in (0, TILE):
                    rolled.paste(src, (ox - dx, oy - dy))
            seam.paste(rolled, (gx * TILE, gy * TILE))
    seam.resize((TILE * 4 * 6, TILE * 4 * 6), Image.NEAREST).save(
        PREVIEWS / 'water-seam-check-6x.png', optimize=True)

    (OUT / 'water-manifest.json').write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    for k, info in manifest['tiles'].items():
        print(k, 'base', info['base_ratio'], 'light', info['light_ratio'],
              'dark', info['dark_ratio'], 'spread', info['lum_spread'],
              'border', info['border_delta'], 'bands', info['bands_light'],
              'lone', info['lone_pixels'], 'b22', info['blocks_2x2'],
              'b33', info['blocks_3x3'])
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
