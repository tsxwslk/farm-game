"""柳湾河岸过渡砖：裸土 → 湿润土 → 浅水 → 河面底色，32x32 原生像素。

运行：python3 prototype/pixel-farm/shore-generate.py [--verify]
输出：prototype/pixel-farm/assets/shore/

做法：
1) 不重画纹理。裸土直接调用 soil-generate.py 的 build()，同一色板（#F0B035 暖金底）、
   同一土粒半径、同一左上受光；水侧只用 water-generate.py 的主色。过渡砖因此和原块同源。
2) 岸线是受约束的随机游走：相邻列最多差 1 像素、振幅不超过 2、两端强制回到 0。
   两端归零是硬约束——直边砖左右相接时岸线才连得成一条，中间又能有自然起伏。
3) 潮土带与浅青带不按行写死，而是按“到对岸的步数”生成。先 BFS 出每个像素到对侧
   的最短 4 邻步数，再按步数上色：土侧 1 步=深赭潮土、2 步=半湿土；水侧 1 步=浅青、
   2 步=次浅青，再回河面底色。这样直边、外角、内角共用一套规则，转角处带子自动跟着拐弯，
   也不会出现“斜边上带子按行画、一拐弯就断”的问题。
4) 岸线贴地：不画土壁、不画投影、不画高光边。地块的边缘感只靠明度台阶交代——
   裸土最亮、半湿压一档、深赭压两档，水侧再由浅青过渡回河面底色。
5) 开阔水面不铺波纹。贴岸是静水，波纹交给河面砖；两块砖相接处因此不会出现半截波纹。
三种形状：直边（土上、水下）/ 土岬外凸（土只占左上，土角伸进水里）/
水湾内凹（土包住左上两边，水的角插进岸里）。四方向靠顺时针旋转：
0 土在上、1 土在右、2 土在下、3 土在左。
整张图只允许八色（裸土三色 + 潮土两色 + 浅青两色 + 河面主色），无抗锯齿。
"""
from pathlib import Path
from collections import deque
import importlib.util
import json
import sys
from PIL import Image

TILE = 32
VARIANTS = 3
SHAPES = ('straight', 'outer', 'inner')
ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'assets' / 'shore'
PREVIEWS = ROOT.parents[1] / 'output' / 'art-previews' / 'shore'

# 岸线基准位置：直边砖在 y=16 由土转水，两端归零，砖与砖才对得上
MID = 16
AMP = 2          # 岸线中段起伏幅度，正负各 2 像素

# 潮土两色 + 贴岸浅青两色。都从裸土的暖金往水里退，中间不插第三套色系。
SHORE = {
    'damp': '#C07A20',        # 半湿土：裸土压一档，仍是赭色
    'wet': '#8D5412',         # 贴水潮土：深赭，岸线的那条实线就由它交代
    'shallow_hi': '#ADD1C2',  # 贴岸浅青：浅滩透出的暖调，比河面亮一档半
    'shallow_lo': '#93C2B1',  # 次浅青：浅滩到深水的过渡，接回河面主色
}


def load(name):
    spec = importlib.util.spec_from_file_location(name.replace('-', '_'), ROOT / f'{name}.py')
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


SOIL = load('soil-generate')
WATER = load('water-generate')

SOIL_SET = SOIL.PALETTE['bare']
WATER_BASE = WATER.PALETTE['base']


def hex_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (255,)


WATER_C = hex_rgb(WATER_BASE)
SOIL_C = {k: hex_rgb(v) for k, v in SOIL_SET.items()}
SHORE_C = {k: hex_rgb(v) for k, v in SHORE.items()}
DRY_C = set(SOIL_C.values())
DAMP_C = {SHORE_C['damp'], SHORE_C['wet']}
SHALLOW_C = {SHORE_C['shallow_hi'], SHORE_C['shallow_lo']}


def rand(seed, i):
    """整数哈希 -> [0,1)，跨平台一致。"""
    x = (i * 374761393 + seed * 668265263) & 0xFFFFFFFF
    x = (x ^ (x >> 13)) * 1274126177 & 0xFFFFFFFF
    return ((x ^ (x >> 16)) & 0xFFFFFF) / 0xFFFFFF


def meander(seed, amp=AMP):
    """岸线起伏：受约束的随机游走，两端强制回到 0。

    每一步都保证 |h| <= 剩余步数，所以第 32 列一定是 0——这是“两端对齐”的保证，
    不是概率。相邻列最多差 1 像素，不会出现 3 像素高的竖墙。
    六成列不动，岸线才是缓的，不会读成锯齿。
    """
    h, out = 0, [0]
    for i in range(1, TILE):
        remaining = TILE - 1 - i
        r = rand(seed, i)
        step = -1 if r < 0.12 else (1 if r > 0.88 else 0)
        if abs(h + step) > amp:                       # 振幅封顶
            step = -1 if h > 0 else (1 if h < 0 else 0)
        if abs(h + step) > remaining:                  # 剩余步数不够回家，直接往回走
            step = -h
        h += step
        out.append(h)
    return out


def profiles(variant):
    """横岸线与竖岸线各一条，每个变体各不相同。

    每条都两端归零，所以任意两块砖在砖边上一定对得上（都停在 MID），
    而砖内部的起伏互不一样——否则长河上每 32 像素就重复同一道弯，
    远看是一条规律的花边。角砖的竖边和横边也因此不必互相镜像，转角自然些。
    """
    return meander(20261225 + variant * 131), meander(20261387 + variant * 173)


def shore_mask(shape, hx, vy):
    """True = 土。直边砖只有横向岸线，角砖多一条竖岸线。"""
    m = [[False] * TILE for _ in range(TILE)]
    for y in range(TILE):
        for x in range(TILE):
            above = y < MID + hx[x]
            left = x < MID + vy[y]
            if shape == 'straight':
                s = above
            elif shape == 'outer':      # 土岬：土角外凸，土只占左上象限
                s = above and left
            else:                        # 水湾：土包住左上两边，水的角插进岸里
                s = above or left
            m[y][x] = s
    return m


def bfs(mask, want):
    """每个像素到最近 want 像素的 4 邻步数；同侧像素拿到的是“到对岸的距离”。"""
    dist = [[99] * TILE for _ in range(TILE)]
    q = deque()
    for y in range(TILE):
        for x in range(TILE):
            if mask[y][x] == want:
                dist[y][x] = 0
                q.append((x, y))
    while q:
        x, y = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < TILE and 0 <= nx < TILE and dist[ny][nx] > dist[y][x] + 1:
                dist[ny][nx] = dist[y][x] + 1
                q.append((nx, ny))
    return dist


def build(shape, variant):
    hx, vy = profiles(variant)
    mask = shore_mask(shape, hx, vy)
    area = sum(row.count(True) for row in mask)
    # 土粒数量按可见面积换算，密度与原块一致；纹理可以贴到岸，但不会跨到水里
    count = max(2, round(SOIL.CONF['bare']['clods'] * area / (TILE * TILE)))
    s = SOIL.build('bare', variant % 4, region=mask, count=count)
    spx = s.load()
    im = Image.new('RGBA', (TILE, TILE), WATER_C)
    px = im.load()
    for y in range(TILE):
        for x in range(TILE):
            if mask[y][x]:
                px[x, y] = spx[x, y]

    # 带子按到对岸的步数上色：土侧 1 步深赭、2 步半湿；水侧 1 步浅青、2 步次浅青。
    # 2 像素宽的带子压在岸线上，1 像素是硬朗的湿线，2 像素才读得出“潮”。
    dw = bfs(mask, False)      # 土像素：到水的步数
    ds = bfs(mask, True)       # 水像素：到土的步数
    for y in range(TILE):
        for x in range(TILE):
            if mask[y][x]:
                d = dw[y][x]
                if d == 1:
                    px[x, y] = SHORE_C['wet']
                elif d == 2:
                    px[x, y] = SHORE_C['damp']
            else:
                d = ds[y][x]
                if d == 1:
                    px[x, y] = SHORE_C['shallow_hi']
                elif d == 2:
                    px[x, y] = SHORE_C['shallow_lo']
    return im, mask


def lum(c):
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]


def soil_heights(mask):
    """每列的土像素数；直边砖这个数就是岸线 y，两端必须都等于 MID。"""
    return [sum(1 for y in range(TILE) if mask[y][x]) for x in range(TILE)]


def band_faults(canvas):
    """跨砖自检：干土不能直接贴水，潮土的水侧必须是浅青带。

    单块自检看不出旋转错误——每块自己的带子都是对的；只有拼起来跨砖看，
    才能发现岸线断了一格、带子被吃掉、或者某块转错方向。
    """
    px = canvas.load()
    w, h = canvas.size
    bad = []
    for y in range(h):
        for x in range(w):
            c = px[x, y]
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if not (0 <= ny < h and 0 <= nx < w):
                    continue
                n = px[nx, ny]
                if c in DRY_C and (n == WATER_C or n in SHALLOW_C):
                    bad.append((x, y))          # 干土直接贴水：带子被吃了
                    break
                if c == SHORE_C['wet'] and n == WATER_C:
                    bad.append((x, y))          # 潮土旁边不是浅青而是深水
                    break
                if c in SHALLOW_C and n in DRY_C:
                    bad.append((x, y))          # 浅青直接贴干土：土侧少了一层
                    break
    return len(bad), bad[:6]


def band_ok(im, mask):
    """直边砖逐列检查土侧两层：贴水一格必须是深赭，它上面必须还有半湿。

    岸线在 1 像素的台阶处会多出一格深赭（带子要跟着拐弯），所以不按固定的
    行号比对，只看“边界往上这三格”里的构成：底格深赭、上面一格不是干土、
    三格里至少有一格半湿。
    """
    px = im.load()
    wet, damp = SHORE_C['wet'], SHORE_C['damp']
    bad = []
    for x in range(TILE):
        col = [y for y in range(TILE) if mask[y][x]]
        b = max(col) + 1                      # 边界：最后一列土像素的下一行
        seg = [px[x, y] for y in range(max(0, b - 3), b)]
        if len(seg) < 2 or seg[-1] != wet or seg[-2] not in (wet, damp) or damp not in seg:
            bad.append((x, b - 1))
    return len(bad), bad[:6]


def report(shape, variant, im, mask):
    px = im.load()
    counts = {}
    for y in range(TILE):
        for x in range(TILE):
            counts[px[x, y]] = counts.get(px[x, y], 0) + 1
    palette = {*DRY_C, *DAMP_C, *SHALLOW_C, WATER_C}
    area = sum(row.count(True) for row in mask)
    wet = counts.get(SHORE_C['wet'], 0)
    dry_dark = sum(1 for y in range(TILE) for x in range(TILE)
                   if mask[y][x] and px[x, y] == SOIL_C['dark'])

    def block(x0, y0, w, h):
        v = [lum(px[x, y]) for y in range(y0, y0 + h) for x in range(x0, x0 + w)]
        return round(sum(v) / len(v), 2)

    return {
        'file': f'assets/shore/shore-soilwater-{shape}-{variant}.png',
        'size': [TILE, TILE],
        'palette_locked': {'#%02x%02x%02x' % c[:3] for c in counts} <=
                          {'#%02x%02x%02x' % c[:3] for c in palette},
        'colors_used': len(counts),
        'colors': {'#%02x%02x%02x' % c[:3]: v for c, v in sorted(counts.items(), key=lambda kv: -kv[1])},
        'soil_area': area,
        'water_area': TILE * TILE - area,
        'wet_pixels': wet,
        'shoreline': soil_heights(mask),
        'soil_dark_ratio': round(dry_dark / max(area, 1), 3),
        'lum': {'soil_side': block(8, 0, 16, 12), 'water_side': block(8, 20, 16, 12)},
    }


def plain_ratio():
    """原块的土粒暗部占比，用来判断岸砖有没有延续裸土的颗粒尺度。"""
    px = SOIL.build('bare', 0).load()
    n = sum(1 for y in range(TILE) for x in range(TILE) if px[x, y] == SOIL_C['dark'])
    return round(n / (TILE * TILE), 3)


def rot(im, k):
    """顺时针旋转 k 个 90 度：0 土在上、1 土在右、2 土在下、3 土在左。"""
    for _ in range(k % 4):
        im = im.transpose(Image.ROTATE_270)
    return im


def river(tiles, cols=9, rows=6):
    """一条带凸岸的河：左段岸线在高处，右段低一格，中间两块角砖接住落差。

    上段用 'inner' 转 1（土在上、右侧）、下段用 'outer' 转 1（土只剩右上象限），
    两块竖着叠起来，正好把 32 像素的竖向落差铺成一条直岸。
    """
    canvas = Image.new('RGBA', (TILE * cols, TILE * rows))
    soil = [SOIL.build('bare', v) for v in range(4)]
    water = [WATER.build(v) for v in range(4)]
    for gy in range(rows):
        for gx in range(cols):
            v = (gx * 2 + gy) % VARIANTS
            if gx <= 2:
                if gy < 2:
                    t = soil[(gx + gy) % 4]
                elif gy == 2:
                    t = tiles[('straight', v)]
                else:
                    t = water[(gx + gy) % 4]
            elif gx == 3:
                if gy < 2:
                    t = soil[(gx + gy) % 4]
                elif gy == 2:
                    t = rot(tiles[('inner', v)], 1)
                elif gy == 3:
                    t = rot(tiles[('outer', v)], 1)
                else:
                    t = water[(gx + gy) % 4]
            else:
                if gy < 3:
                    t = soil[(gx + gy) % 4]
                elif gy == 3:
                    t = tiles[('straight', v)]
                else:
                    t = water[(gx + gy) % 4]
            canvas.paste(t, (gx * TILE, gy * TILE))
    return canvas


def pond(tiles, k=8, m=6):
    """土中的水塘：中间是水，用的全是 'inner'（土包住两条边）。"""
    canvas = Image.new('RGBA', (TILE * k, TILE * m))
    soil = [SOIL.build('bare', v) for v in range(4)]
    water = [WATER.build(v) for v in range(4)]
    for gy in range(m):
        for gx in range(k):
            canvas.paste(soil[(gx + gy) % 4], (gx * TILE, gy * TILE))
    corner = {(True, True): 0, (True, False): 1, (False, False): 2, (False, True): 3}
    x0, y0, x1, y1 = 1, 1, 6, 4
    for gy in range(y0, y1 + 1):
        for gx in range(x0, x1 + 1):
            top, bottom = gy == y0, gy == y1
            left, right = gx == x0, gx == x1
            v = (gx + gy) % VARIANTS
            if (top or bottom) and (left or right):
                t = rot(tiles[('inner', v)], corner[(top, left)])
            elif top:
                t = tiles[('straight', v)]
            elif bottom:
                t = rot(tiles[('straight', v)], 2)
            elif left:
                t = rot(tiles[('straight', v)], 3)
            elif right:
                t = rot(tiles[('straight', v)], 1)
            else:
                t = water[v % 4]
            canvas.paste(t, (gx * TILE, gy * TILE))
    return canvas


def island(tiles, k=8, m=6):
    """水中的土岛：中间是土，四角用 'outer'（土只剩一个象限）。"""
    canvas = Image.new('RGBA', (TILE * k, TILE * m))
    soil = [SOIL.build('bare', v) for v in range(4)]
    water = [WATER.build(v) for v in range(4)]
    for gy in range(m):
        for gx in range(k):
            canvas.paste(water[(gx + gy) % 4], (gx * TILE, gy * TILE))
    corner = {(True, True): 2, (True, False): 3, (False, False): 0, (False, True): 1}
    x0, y0, x1, y1 = 2, 1, 5, 3
    for gy in range(y0, y1 + 1):
        for gx in range(x0, x1 + 1):
            top, bottom = gy == y0, gy == y1
            left, right = gx == x0, gx == x1
            v = (gx + gy) % VARIANTS
            if (top or bottom) and (left or right):
                t = rot(tiles[('outer', v)], corner[(top, left)])
            elif top:
                t = rot(tiles[('straight', v)], 2)      # 岛内是土，上边的砖土在下
            elif bottom:
                t = tiles[('straight', v)]
            elif left:
                t = rot(tiles[('straight', v)], 1)
            elif right:
                t = rot(tiles[('straight', v)], 3)
            else:
                t = soil[v % 4]
            canvas.paste(t, (gx * TILE, gy * TILE))
    return canvas


def contact_sheet(tiles):
    """一行形状、三列变体，6 倍放大，另附八色色板。"""
    pad = 10
    cell = TILE * 6
    sheet = Image.new('RGBA', (cell * VARIANTS + pad * (VARIANTS + 1),
                               pad + len(SHAPES) * (cell + pad) + TILE * 2 + pad),
                      (246, 240, 228, 255))
    for r, shape in enumerate(SHAPES):
        for c in range(VARIANTS):
            sheet.paste(tiles[(shape, c)].resize((cell, cell), Image.NEAREST),
                        (pad + c * (cell + pad), pad + r * (cell + pad)))
    sw_y = pad + len(SHAPES) * (cell + pad)
    sw = Image.new('RGBA', (TILE * 8, TILE))
    order = [SOIL_C['base'], SOIL_C['light'], SOIL_C['dark'],
             SHORE_C['damp'], SHORE_C['wet'], SHORE_C['shallow_hi'],
             SHORE_C['shallow_lo'], WATER_C]
    for i, c in enumerate(order):
        sw.paste(Image.new('RGBA', (TILE, TILE), c), (i * TILE, 0))
    sheet.paste(sw.resize((TILE * 8 * 3, TILE * 3), Image.NEAREST), (pad, sw_y))
    sheet.save(PREVIEWS / 'shore-sheet.png', optimize=True)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    PREVIEWS.mkdir(parents=True, exist_ok=True)
    ref = plain_ratio()
    manifest = {
        'tile': TILE,
        'variants': VARIANTS,
        'view': '固定俯视微倾，左上受光；土在上、水在下，岸线贴地不起坡',
        'palette': {**{f'soil_{k}': v for k, v in SOIL_SET.items()},
                    **SHORE, 'water_base': WATER_BASE},
        'plain_reference': {'soil_dark_ratio': ref},
        'shapes': list(SHAPES),
        'bands': {'damp': 1, 'wet': 1, 'shallow_hi': 1, 'shallow_lo': 1,
                  'note': '各 1 像素宽，按到对岸的步数上色；转角处自动跟着拐弯'},
        'rotation': {'0': '土在上', '1': '土在右', '2': '土在下', '3': '土在左'},
        'tiles': {},
    }
    problems = []
    tiles = {}
    for shape in SHAPES:
        atlas = Image.new('RGBA', (TILE * VARIANTS, TILE))
        for v in range(VARIANTS):
            im, mask = build(shape, v)
            tiles[(shape, v)] = im
            im.save(OUT / f'shore-soilwater-{shape}-{v}.png', optimize=True)
            atlas.alpha_composite(im, (v * TILE, 0))
            info = report(shape, v, im, mask)
            manifest['tiles'][f'{shape}-{v}'] = info
            if not info['palette_locked']:
                problems.append(f"{info['file']}: 出现八色之外的像素")
            # 岸线两端必须等高，横向才能连成一条
            if shape == 'straight':
                h = info['shoreline']
                if h[0] != MID or h[-1] != MID:
                    problems.append(f"{info['file']}: 两端岸线 {h[0]}/{h[-1]} 未对齐到 {MID}")
                if max(h) - min(h) > AMP * 2:
                    problems.append(f"{info['file']}: 岸线起伏 {max(h) - min(h)} 超过 {AMP * 2}")
                bad, where = band_ok(im, mask)
                if bad:
                    problems.append(f"{info['file']}: 四层带子有 {bad} 列错位 {where}")
            # 密度延续：土侧暗部占比与原块相差不超过 50%
            if info['soil_area'] >= 256 and not ref * 0.5 <= info['soil_dark_ratio'] <= ref * 1.6:
                problems.append(f"{info['file']}: 土侧颗粒 {info['soil_dark_ratio']} 偏离原块 {ref}")
            faults, where = band_faults(im)
            if faults:
                problems.append(f"{info['file']}: 单块带子断裂 {faults} 处 {where}")
            print(json.dumps({k: info[k] for k in ('file', 'colors_used', 'soil_area',
                                                   'wet_pixels', 'soil_dark_ratio', 'lum')},
                             ensure_ascii=False), 'shoreline', info['shoreline'])
        atlas.save(OUT / f'shore-soilwater-{shape}-atlas.png', optimize=True)
        tiles[(shape, 0)].resize((TILE * 8, TILE * 8), Image.NEAREST).save(
            PREVIEWS / f'shore-soilwater-{shape}-8x.png', optimize=True)

    contact_sheet(tiles)

    # 直边横向三连：岸线要连成一条，带子不能错位
    strip = Image.new('RGBA', (TILE * 3, TILE * 2))
    for gy in range(2):
        for gx in range(3):
            strip.paste(tiles[('straight', gx % VARIANTS)], (gx * TILE, gy * TILE))
    strip.resize((TILE * 3 * 6, TILE * 2 * 6), Image.NEAREST).save(
        PREVIEWS / 'shore-strip-6x.png', optimize=True)

    # 三张装配图：凸岸的河、土中水塘、水中土岛。跨砖查带子是否连续。
    checks = {}
    for name, canvas in (('shore-river', river(tiles)), ('shore-pond', pond(tiles)),
                         ('shore-island', island(tiles))):
        faults, where = band_faults(canvas)
        checks[name] = {'band_faults': faults, 'at': where}
        if faults:
            problems.append(f"{name}-4x.png: 跨砖带子断裂 {faults} 处 {where}")
        w, h = canvas.size
        canvas.resize((w * 4, h * 4), Image.NEAREST).save(PREVIEWS / f'{name}-4x.png', optimize=True)
    manifest['checks'] = checks
    manifest['outputs'] = [f'../../output/art-previews/shore/shore-{n}-4x.png'
                           for n in ('river', 'pond', 'island')]
    (OUT / 'shore-manifest.json').write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    if '--verify' in sys.argv:
        print('校验:', '通过' if not problems else problems)
        sys.exit(1 if problems else 0)
    print('done:', OUT)


if __name__ == '__main__':
    main()
