"""柳湾裸土地表：32x32 原生像素、四边无缝平铺、固定左上受光。

运行：python3 prototype/pixel-farm/soil-generate.py [--verify]
输出：prototype/pixel-farm/assets/soil/

做法：
1) 土面本身保持平整的主色，纹理只由稀疏的不规则土粒承担，符合"大面积背景纹理克制"。
2) 土粒用椭圆在环面上采样，得到 4~8 源像素的圆润轮廓，不带直角、不带细尾。
   位置来自 6x6 抖动格 + 最小间距，宏观密度均匀，微观不落网格。
3) 每颗土粒只在朝太阳的左上沿点 1~2 像素浅金，其余保持深赭，光源方向统一为左上。
整张图只允许三档颜色，无抗锯齿、无放大旧贴图；坐标全部对 32 取模，跨边接得上，四边无缝。
每个材质出 4 个变体，供引擎随机取用。
"""
from pathlib import Path
import json
import math
import sys
from PIL import Image

TILE = 32
VARIANTS = 4
ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'assets' / 'soil'
PREVIEWS = ROOT.parents[1] / 'output' / 'art-previews' / 'soil'

PALETTE = {
    # 暖金赭：主色 / 浅金 / 深赭
    'bare': {'base': '#f0b035', 'light': '#f9c856', 'dark': '#d9921e'},
    # 踩实土路：同色系整体稍浅，明暗再拉近
    'path': {'base': '#f3b944', 'light': '#fbcd63', 'dark': '#dda02b'},
}
# clods 土粒数量 / rmin~rmax 半径 / gap 最小间距 / glint 加受光的比例
CONF = {
    'bare': {'clods': 17, 'rmin': 1.15, 'rmax': 2.6, 'gap': 3.4, 'glint': 0.34, 'seed': 20261124},
    'path': {'clods': 9, 'rmin': 1.1, 'rmax': 2.0, 'gap': 4.0, 'glint': 0.28, 'seed': 77110},
}
CELL = 32 // 6


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


def ellipse(cx, cy, rx, ry, rot):
    """在 32x32 环面上采样一个椭圆，轮廓圆润、没有直角。"""
    c, s = math.cos(rot), math.sin(rot)
    pts = set()
    for y in range(TILE):
        for x in range(TILE):
            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            dx -= TILE * round(dx / TILE)
            dy -= TILE * round(dy / TILE)
            u, v = dx * c + dy * s, -dx * s + dy * c
            if (u / rx) ** 2 + (v / ry) ** 2 <= 1.0:
                pts.add((x, y))
    return pts


def build(material, variant, region=None, count=None):
    pal = PALETTE[material]
    base, light, dark = hex_rgb(pal['base']), hex_rgb(pal['light']), hex_rgb(pal['dark'])
    conf = CONF[material]
    seed = conf['seed'] + variant * 917
    im = Image.new('RGBA', (TILE, TILE), base)
    px = im.load()
    mask = [[False] * TILE for _ in range(TILE)]

    grid = 8 if region is not None else 6
    cell = TILE / grid if region is not None else CELL   # 原路径保持整数格宽 5，产出不变
    target = conf['clods'] if count is None else count
    centers = []
    for i in sorted(range(36 if region is None else grid * grid + 12), key=lambda i: rand(seed + 3, i)):
        if len(centers) >= target:
            break
        cx = (i % grid) * cell + rand(seed + 5, i) * (cell - 0.5)
        cy = (i // grid) * cell + rand(seed + 6, i) * (cell - 0.5)
        if region is not None and not region[int(cy) % TILE][int(cx) % TILE]:
            continue
        if any(torus(cx, c[0]) < conf['gap'] and torus(cy, c[1]) < conf['gap'] for c in centers):
            continue
        rx = conf['rmin'] + rand(seed + 7, i) * (conf['rmax'] - conf['rmin'])
        ry = rx * (0.55 + rand(seed + 8, i) * 0.3)
        pts = ellipse(cx, cy, rx, ry, rand(seed + 9, i) * math.pi)
        if len(pts) < 3:
            continue
        if region is not None and any(not region[y][x] for x, y in pts):
            continue
        centers.append((cx, cy))
        for x, y in pts:
            mask[y][x] = True

    for y in range(TILE):
        for x in range(TILE):
            if mask[y][x]:
                px[x, y] = dark

    # 受光：土粒朝太阳的左上沿，取最靠上的一两点浅金，方向统一
    for k, (cx, cy) in enumerate(centers):
        # 第一颗土粒一定受光，保证浅金在三色里始终存在
        if k and rand(seed + 21, k * 3) > conf['glint']:
            continue
        comp = [(x, y) for y in range(TILE) for x in range(TILE)
                if mask[y][x] and torus(x + 0.5, cx) <= 3.2 and torus(y + 0.5, cy) <= 3.2]
        if not comp:
            continue
        top = min(y for _, y in comp)
        row = sorted(x for x, y in comp if y == top)[:3]
        for x in row:
            px[x, top] = light

    # 1 像素沙粒：只落在空地，暗粒为主，避免整块土面太空
    placed = 0
    for i in range(60):
        x = int(rand(seed + 41, i) * TILE) % TILE
        y = int(rand(seed + 43, i) * TILE) % TILE
        if placed >= 5 or mask[y][x]:
            continue
        if region is not None and not region[y][x]:
            continue
        px[x, y] = dark if placed % 4 else light
        mask[y][x] = True
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
    base = hex_rgb(PALETTE[material]['base'])

    def block(x0, y0, w, h):
        v = [lum(px[x, y]) for y in range(y0, y0 + h) for x in range(x0, x0 + w)]
        return round(sum(v) / len(v), 2)

    wrapx = sum(abs(lum(px[TILE - 1, y]) - lum(px[0, y])) for y in range(TILE)) / TILE
    wrapy = sum(abs(lum(px[x, TILE - 1]) - lum(px[x, 0])) for x in range(TILE)) / TILE
    inner = max(abs(lum(px[x, y]) - lum(px[x + 1, y])) for y in range(TILE) for x in range(1, TILE - 2))
    corners = {'tl': block(0, 0, 16, 16), 'tr': block(16, 0, 16, 16),
               'bl': block(0, 16, 16, 16), 'br': block(16, 16, 16, 16)}
    return {
        'file': f'assets/soil/soil-{material}-{variant}.png',
        'size': [TILE, TILE],
        'palette_locked': sorted('#%02x%02x%02x' % c[:3] for c in counts) == sorted(PALETTE[material].values()),
        'colors': {'#%02x%02x%02x' % c[:3]: v for c, v in sorted(counts.items(), key=lambda kv: -kv[1])},
        'deviation_ratio': round(1 - counts.get(base, 0) / (TILE * TILE), 3),
        'light_ratio': round(counts.get(hex_rgb(PALETTE[material]['light']), 0) / (TILE * TILE), 3),
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
    sheet.paste(swatch.resize((TILE * 3 * 6, TILE * 6), Image.NEAREST), (0, TILE * 6 + pad + TILE * 8 + pad))
    sheet.save(PREVIEWS / name, optimize=True)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    PREVIEWS.mkdir(parents=True, exist_ok=True)
    manifest = {'tile': TILE, 'variants': VARIANTS, 'view': '固定俯视微倾，左上受光', 'materials': {}}
    problems = []
    for material in ('bare', 'path'):
        tiles, atlas, infos = [], Image.new('RGBA', (TILE * VARIANTS, TILE)), []
        for v in range(VARIANTS):
            im = build(material, v)
            im.save(OUT / f'soil-{material}-{v}.png', optimize=True)
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
            print(json.dumps(info, ensure_ascii=False))
        atlas.save(OUT / f'soil-{material}-atlas.png', optimize=True)
        tiles[0].resize((TILE * 8, TILE * 8), Image.NEAREST).save(PREVIEWS / f'soil-{material}-8x.png', optimize=True)
        field_sheet(tiles, 8, 5).resize((TILE * 8 * 3, TILE * 5 * 3), Image.NEAREST).save(
            PREVIEWS / f'soil-{material}-field-3x.png', optimize=True)
        contact_sheet(material, tiles, f'soil-{material}-sheet.png')
        manifest['materials'][material] = {
            'palette': PALETTE[material],
            'variants': infos,
            'note': '农场裸土，干燥平坦、晒过太阳' if material == 'bare' else '踩实土路，同色系稍浅、表面更平、颗粒更少',
            'atlas': f'assets/soil/soil-{material}-atlas.png',
        }
    # 接缝检查：把变体随机滚动后拼 4x4。真无缝的砖滚动后依然连贯，
    # 一旦有接缝，滚动会把它推进画面内部，肉眼立刻可见。
    seam = Image.new('RGBA', (TILE * 4, TILE * 4))
    for gy in range(4):
        for gx in range(4):
            src = build('bare', int(rand(4242, gy * 4 + gx) * VARIANTS) % VARIANTS)
            dx = int(rand(4343, gy * 4 + gx) * TILE)
            dy = int(rand(4444, gy * 4 + gx) * TILE)
            rolled = Image.new('RGBA', (TILE, TILE))
            for oy in (0, TILE):
                for ox in (0, TILE):
                    rolled.paste(src, (ox - dx, oy - dy))
            seam.paste(rolled, (gx * TILE, gy * TILE))
    seam.resize((TILE * 4 * 6, TILE * 4 * 6), Image.NEAREST).save(PREVIEWS / 'soil-seam-check-6x.png', optimize=True)
    (OUT / 'soil-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    if '--verify' in sys.argv:
        print('校验:', '通过' if not problems else problems)
        sys.exit(1 if problems else 0)
    print('done:', OUT)


if __name__ == '__main__':
    main()
