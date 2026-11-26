"""柳湾北侧林缘橡树的校验与验收图。

运行：python3 prototype/pixel-farm/oak-verify.py [--verify]
输入：prototype/pixel-farm/assets/oak/oak-96x128.png
输出：output/art-previews/oak/ 下的放大图、分档图、与垂柳同场图
     prototype/pixel-farm/assets/oak/oak-manifest.json

除了画布/锚点/色板这些常规项，这里多两条针对需求本身的判据：
1) 不许有垂条。垂柳的标志是冠底垂下一缕一缕的窄条，逐行数“不透明段数”就能分辨：
   团状树冠的底边每行只有 1~3 段，垂柳在同样高度有十几段。
2) 树干要看得见脚。树冠下沿到锚点之间必须有足够高的整段树干。
"""
from pathlib import Path
import json
import struct
import sys
from PIL import Image

SIZE = (96, 128)
ANCHOR = (48, 122)
ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / 'assets' / 'oak'
PREVIEWS = ROOT.parents[1] / 'output' / 'art-previews' / 'oak'
PNG = ASSETS / 'oak-96x128.png'
SPRITE = ASSETS / 'oak-96x128.aseprite'
WILLOW = ROOT / 'assets' / 'willow' / 'willow-repaint.png'
GRASS = [ROOT / 'assets' / 'grass' / f'grass-lawn-{i}.png' for i in range(4)]

LEAF = ('#24301E', '#354927', '#4A6432', '#68853F', '#8FA855', '#AFC46C')
BARK = ('#33251A', '#4C3A2B', '#6B5340', '#7E674E')
PALETTE = LEAF + BARK


def hex_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def lum(c):
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]


def read_sprite_header():
    if not SPRITE.exists():
        return None
    d = SPRITE.read_bytes()
    magic, frames, w, h = struct.unpack_from('<HHHH', d, 4)
    depth = struct.unpack_from('<H', d, 12)[0]
    return {'magic_ok': magic == 0xA5E0, 'frames': frames, 'size': [w, h], 'color_depth': depth}


def runs_in_row(px, y, width):
    n = 0
    prev = False
    for x in range(width):
        cur = px[x, y][3] > 0
        if cur and not prev:
            n += 1
        prev = cur
    return n


def bbox_of(points):
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return min(xs), min(ys), max(xs), max(ys)


def build_previews(im):
    PREVIEWS.mkdir(parents=True, exist_ok=True)
    bg = Image.new('RGBA', im.size, (246, 240, 228, 255))
    bg.alpha_composite(im)
    flat = bg.convert('RGB')

    flat.resize((96 * 5, 128 * 5), Image.NEAREST).save(
        PREVIEWS / 'oak-5x.png', optimize=True)

    scales = (1, 2, 3)
    gap = 10
    ladder = Image.new('RGB', (sum(96 * k + gap for k in scales) + gap, 128 * 3 + gap * 2),
                       (246, 240, 228))
    x = gap
    for k in scales:
        r = flat.resize((96 * k, 128 * k), Image.NEAREST)
        ladder.paste(r, (x, 128 * 3 + gap - r.height))
        x += r.width + gap
    ladder.save(PREVIEWS / 'oak-scales.png', optimize=True)

    # 与垂柳同场：同比例并排，像素密度与树干尺度是否一致一眼看得出
    tiles = [Image.open(p).convert('RGBA') for p in GRASS if p.exists()]
    if tiles and WILLOW.exists():
        wilt = Image.open(WILLOW).convert('RGBA')
        fw, fh = 210, 140
        field = Image.new('RGBA', (fw, fh))
        for y in range(0, fh, 32):
            for x in range(0, fw, 32):
                field.alpha_composite(tiles[(x // 32 + y // 32) % len(tiles)], (x, y))
        field.alpha_composite(wilt, (8, fh - 6 - ANCHOR[1]))
        field.alpha_composite(im, (106, fh - 6 - ANCHOR[1]))
        out = Image.new('RGB', (fw * 3 + 12, fh * 2), (22, 26, 28))
        out.paste(field.convert('RGB'), (0, 0))
        out.paste(field.convert('RGB').resize((fw * 2, fh * 2), Image.NEAREST), (fw + 12, 0))
        out.save(PREVIEWS / 'oak-with-willow.png', optimize=True)


def main():
    verify = '--verify' in sys.argv
    if not PNG.exists():
        print('缺少 oak-96x128.png，先跑 oak.lua')
        return 1
    im = Image.open(PNG).convert('RGBA')
    px = im.load()
    problems = []

    if im.size != SIZE:
        problems.append(f'尺寸 {im.size}，应为 {SIZE}')
    alphas = sorted(c[1] for c in im.getchannel('A').getcolors())
    if alphas != [0, 255]:
        problems.append(f'alpha 取值 {alphas}')

    allowed = {hex_rgb(v) + (255,) for v in PALETTE}
    counts = {}
    leaf_pts, bark_pts, all_pts = [], [], []
    for x in range(SIZE[0]):
        for y in range(SIZE[1]):
            c = px[x, y]
            if not c[3]:
                continue
            counts[c] = counts.get(c, 0) + 1
            all_pts.append((x, y))
            if c[3] and c[:3] in {hex_rgb(v) for v in LEAF}:
                leaf_pts.append((x, y))
            else:
                bark_pts.append((x, y))
            if c not in allowed:
                problems.append(f'色板外的颜色 {c} @({x},{y})')
                break

    total = sum(counts.values())
    x0, y0, x1, y1 = bbox_of(all_pts)
    w, h = x1 - x0 + 1, y1 - y0 + 1
    # 冠宽没写死在需求里，只要求竖向聚团；星露谷那棵橡树的冠高宽比约 2.5，
    # 这里 67×119 是 1.8，比它宽一点，仍在“竖椭圆”的范围内
    if not 58 <= w <= 90:
        problems.append(f'整件宽 {w}，应在 58~90')
    if not 100 <= h <= 120:
        problems.append(f'整件高 {h}，应在 100~120')
    if y1 != ANCHOR[1]:
        problems.append(f'最底行 y={y1}，锚点要求 {ANCHOR[1]}')
    if abs((x0 + x1) / 2 - ANCHOR[0]) > 4:
        problems.append(f'包围盒中心 x={(x0 + x1) / 2:.1f} 偏离锚点')
    run = 0
    if all((ANCHOR[0], ANCHOR[1]) == p for p in [(ANCHOR[0], ANCHOR[1])]) and px[ANCHOR][3]:
        xa = ANCHOR[0]
        while (xa - 1, ANCHOR[1]) in set(all_pts):
            xa -= 1
        xb = ANCHOR[0]
        while (xb + 1, ANCHOR[1]) in set(all_pts):
            xb += 1
        run = xb - xa + 1
    if run < 6:
        problems.append(f'接地只有 {run} 像素连成一段')

    # 连通
    seen = set()
    comps = 0
    pts = set(all_pts)
    for p in pts:
        if p in seen:
            continue
        comps += 1
        stack = [p]
        seen.add(p)
        while stack:
            cx, cy = stack.pop()
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                q = (cx + dx, cy + dy)
                if q in pts and q not in seen:
                    seen.add(q)
                    stack.append(q)
    if comps != 1:
        problems.append(f'分成 {comps} 块')

    # 叶与皮
    leaf_px = len(leaf_pts)
    bark_px = len(bark_pts)
    if leaf_px / total < 0.68:
        problems.append(f'叶量只占 {leaf_px / total:.3f}')
    if bark_px < 400:
        problems.append(f'树干只有 {bark_px} 像素，读不出尺度')

    def share(keys):
        return sum(counts.get(hex_rgb(k) + (255,), 0) for k in keys) / max(1, leaf_px)

    hi_lit = share((LEAF[4], LEAF[5]))
    deep = share((LEAF[0], LEAF[1]))
    if hi_lit < 0.12:
        problems.append(f'受光叶只占 {hi_lit:.3f}')
    if deep < 0.15:
        problems.append(f'深绿及更深只占 {deep:.3f}')

    # 不许有垂条：冠底逐行数不透明段数
    lx0, ly0, lx1, ly1 = bbox_of(leaf_pts)
    canopy_h = ly1 - ly0 + 1
    low_rows = [ly0 + int(canopy_h * f) for f in (0.70, 0.80, 0.90)]
    low_runs = [runs_in_row(px, y, SIZE[0]) for y in low_rows]
    if max(low_runs) > 4:
        problems.append(f'冠底每行段数 {low_runs}，超过 4 段就是在垂条了')

    # 树干脚：树冠下沿到锚点之间要有整段树干
    foot = ANCHOR[1] - ly1
    if foot < 25:
        problems.append(f'冠下树干只有 {foot} 行，看不到脚')
    trunk_col = sum(1 for y in range(ly1 + 4, ANCHOR[1] + 1)
                    if px[ANCHOR[0], y][3] and px[ANCHOR[0], y][:3] in {hex_rgb(v) for v in BARK})
    if trunk_col < 25:
        problems.append(f'中线上的树干只有 {trunk_col} 行')

    header = read_sprite_header()
    if header is None:
        problems.append('缺少 .aseprite 源文件')
    elif not header['magic_ok'] or header['frames'] != 1 or header['size'] != list(SIZE) \
            or header['color_depth'] != 8:
        problems.append(f'.aseprite 头不符：{header}')

    build_previews(im)

    manifest = {
        'size': list(SIZE),
        'anchor': list(ANCHOR),
        'view': '固定俯视微倾，左上受光',
        'source': 'oak.lua（Aseprite 索引色）',
        'palette': {'leaf': LEAF, 'bark': BARK},
        'bbox': [x0, y0, x1, y1],
        'canopy_bbox': [lx0, ly0, lx1, ly1],
        'opaque': total,
        'leaf_px': leaf_px,
        'bark_px': bark_px,
        'leaf_share': {'hi_lit': round(hi_lit, 3), 'deep': round(deep, 3)},
        'low_row_runs': low_runs,
        'trunk_foot_rows': foot,
        'aseprite': header,
    }
    (ASSETS / 'oak-manifest.json').write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    print(f'包围盒 {w}×{h}（x {x0}..{x1} y {y0}..{y1}），底行 y={y1}，接地 {run} 像素')
    print(f'叶 {leaf_px} / 皮 {bark_px}，受光 {hi_lit:.3f}、深绿 {deep:.3f}，'
          f'冠底行段数 {low_runs}，冠下树干 {foot} 行')

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
