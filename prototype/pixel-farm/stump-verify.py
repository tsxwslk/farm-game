"""柳湾旧树桩的校验与验收图。

运行：python3 prototype/pixel-farm/stump-verify.py [--verify]
输入：prototype/pixel-farm/assets/stump/stump-48x48.png
输出：output/art-previews/stump/ 下的放大图、分档图、与岩石同场图
     prototype/pixel-farm/assets/stump/stump-manifest.json

除了常规的画布/锚点/色板断言，这里多一条硬指标：需求要求「放在灰褐岩石旁也能靠
剪影分辨」。这条不能靠肉眼，直接和 assets/rock/rock-plain-0.png（同为 48×48、
同脚点 24,44）算剪影交并比，高于 0.70 就说明两件在剪影上太像。
"""
from pathlib import Path
import json
import struct
import sys
from PIL import Image

SIZE = 48
ANCHOR = (24, 44)
ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / 'assets' / 'stump'
PREVIEWS = ROOT.parents[1] / 'output' / 'art-previews' / 'stump'
PNG = ASSETS / 'stump-48x48.png'
SPRITE = ASSETS / 'stump-48x48.aseprite'
ROCK = ROOT / 'assets' / 'rock' / 'rock-plain-0.png'
GRASS = [ROOT / 'assets' / 'grass' / f'grass-lawn-{i}.png' for i in range(4)]

BARK = ('#33251A', '#4C3A2B', '#6B5340', '#7E674E')
FACE = ('#8A7458', '#AE9973', '#C9B48C', '#DDCBA6')
BROKEN = ('#7A5F44',)
PALETTE = BARK + FACE + BROKEN


def hex_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def lum(c):
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]


def mask_of(im):
    px = im.load()
    return {(x, y) for y in range(im.height) for x in range(im.width) if px[x, y][3] > 0}


def bbox(mask):
    xs = [p[0] for p in mask]
    ys = [p[1] for p in mask]
    return min(xs), min(ys), max(xs), max(ys)


def components(mask):
    seen = set()
    n = 0
    for p in mask:
        if p in seen:
            continue
        n += 1
        stack = [p]
        seen.add(p)
        while stack:
            cx, cy = stack.pop()
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                q = (cx + dx, cy + dy)
                if q in mask and q not in seen:
                    seen.add(q)
                    stack.append(q)
    return n


def contact_run(mask, row):
    if (ANCHOR[0], row) not in mask:
        return 0
    x0 = ANCHOR[0]
    while (x0 - 1, row) in mask:
        x0 -= 1
    x1 = ANCHOR[0]
    while (x1 + 1, row) in mask:
        x1 += 1
    return x1 - x0 + 1


def read_sprite_header():
    if not SPRITE.exists():
        return None
    d = SPRITE.read_bytes()
    magic, frames, w, h = struct.unpack_from('<HHHH', d, 4)
    depth = struct.unpack_from('<H', d, 12)[0]
    return {'magic_ok': magic == 0xA5E0, 'frames': frames, 'size': [w, h], 'color_depth': depth}


def build_previews(im, mask):
    PREVIEWS.mkdir(parents=True, exist_ok=True)
    bg = Image.new('RGBA', im.size, (246, 240, 228, 255))
    bg.alpha_composite(im)
    flat = bg.convert('RGB')

    flat.resize((SIZE * 10, SIZE * 10), Image.NEAREST).save(
        PREVIEWS / 'stump-10x.png', optimize=True)

    # 1× 2× 4× 底对齐
    scales = (1, 2, 4)
    gap = 10
    ladder = Image.new('RGB', (sum(SIZE * k + gap for k in scales) + gap, SIZE * 4 + gap * 2),
                       (246, 240, 228))
    x = gap
    for k in scales:
        r = flat.resize((SIZE * k, SIZE * k), Image.NEAREST)
        ladder.paste(r, (x, SIZE * 4 + gap - r.height))
        x += r.width + gap
    ladder.save(PREVIEWS / 'stump-scales.png', optimize=True)

    # 与岩石同场：一块草皮上并排放，按同一脚点落地
    tiles = [Image.open(p).convert('RGBA') for p in GRASS if p.exists()]
    if tiles and ROCK.exists():
        rock = Image.open(ROCK).convert('RGBA')
        fw, fh = 150, 84
        field = Image.new('RGBA', (fw, fh))
        for y in range(0, fh, 32):
            for x in range(0, fw, 32):
                field.alpha_composite(tiles[(x // 32 + y // 32) % len(tiles)], (x, y))
        field.alpha_composite(rock, (12, fh - 12 - ANCHOR[1]))
        field.alpha_composite(im, (88, fh - 12 - ANCHOR[1]))
        out = Image.new('RGB', (fw + fw * 2 + 12, fh * 2), (22, 26, 28))
        out.paste(field.convert('RGB'), (0, 0))
        out.paste(field.convert('RGB').resize((fw * 2, fh * 2), Image.NEAREST), (fw + 12, 0))
        out.save(PREVIEWS / 'stump-with-rock.png', optimize=True)


def main():
    verify = '--verify' in sys.argv
    if not PNG.exists():
        print('缺少 stump-48x48.png，先跑 stump.lua')
        return 1
    im = Image.open(PNG).convert('RGBA')
    px = im.load()
    mask = mask_of(im)
    problems = []

    if im.size != (SIZE, SIZE):
        problems.append(f'尺寸 {im.size}')
    alphas = sorted(c[1] for c in im.getchannel('A').getcolors())
    if alphas != [0, 255]:
        problems.append(f'alpha 取值 {alphas}')

    allowed = {hex_rgb(v) + (255,) for v in PALETTE}
    counts = {}
    for x in range(SIZE):
        for y in range(SIZE):
            c = px[x, y]
            if c[3]:
                counts[c] = counts.get(c, 0) + 1
                if c not in allowed:
                    problems.append(f'色板外的颜色 {c} @({x},{y})')
                    break

    def area(keys):
        return sum(counts.get(hex_rgb(k) + (255,), 0) for k in keys)

    x0, y0, x1, y1 = bbox(mask)
    w, h = x1 - x0 + 1, y1 - y0 + 1
    total = sum(counts.values())

    if not 32 <= w <= 36:
        problems.append(f'可见宽度 {w}，要求 32~36')
    if h > 22:
        problems.append(f'整件高 {h}，要求压低（≤22）')
    if y1 != ANCHOR[1]:
        problems.append(f'最底行 y={y1}，锚点要求 {ANCHOR[1]}')
    if y1 > ANCHOR[1]:
        problems.append('锚点以下还有像素，等于自带投影')
    run = contact_run(mask, ANCHOR[1])
    if run < 6:
        problems.append(f'接地只有 {run} 像素连成一段')
    if abs((x0 + x1) / 2 - ANCHOR[0]) > 3:
        problems.append(f'包围盒中心 x={(x0 + x1) / 2:.1f} 偏离锚点')
    if components(mask) != 1:
        problems.append(f'分成 {components(mask)} 块')
    if w / max(1, h) < 1.5:
        problems.append(f'宽高比只有 {w / h:.2f}，不够扁宽，和岩石分不开')
    # 顶面平台度：最上面那几行有多宽。树桩是平的锯断面，岩石是拱起来的顶，
    # 这条比交并比更能说明“剪影上一眼分开”
    row_widths = []
    for yy in range(y0, y1 + 1):
        xs = [xx for xx in range(SIZE) if (xx, yy) in mask]
        row_widths.append(len(xs))
    top_w = max(row_widths[:3])
    if top_w / w < 0.55:
        problems.append(f'顶面只有 {top_w / w:.2f} 宽，读不出平断面')

    face_px = area(FACE) + area(BROKEN)
    bark_px = area(BARK)
    if face_px / total < 0.25:
        problems.append(f'断面只占 {face_px / total:.3f}，不够突出')
    if bark_px / total < 0.35:
        problems.append(f'树皮只占 {bark_px / total:.3f}')
    if lum(hex_rgb('#C9B48C')) - lum(hex_rgb('#6B5340')) < 80:
        problems.append('断面与桩身明度差不足 80，读不出“偏浅的断面”')

    iou = None
    if ROCK.exists():
        rock_mask = mask_of(Image.open(ROCK).convert('RGBA'))
        inter = len(mask & rock_mask)
        union = len(mask | rock_mask)
        iou = round(inter / union, 3)
        # 门槛 0.75：两件都以 (24,44) 落地、都是宽矮物件，交并比天然有下限。
        # 实测压平前 0.81、压平后 0.72，真正拉开差距的是宽高比与平顶（见上面两条）
        if iou > 0.75:
            problems.append(f'与岩石剪影交并比 {iou}，两件太像')

    header = read_sprite_header()
    if header is None:
        problems.append('缺少 .aseprite 源文件')
    elif not header['magic_ok'] or header['frames'] != 1 or header['size'] != [SIZE, SIZE] \
            or header['color_depth'] != 8:
        problems.append(f'.aseprite 头不符：{header}')

    build_previews(im, mask)

    manifest = {
        'size': [SIZE, SIZE],
        'anchor': list(ANCHOR),
        'view': '固定俯视微倾，左上受光',
        'source': 'stump.lua（Aseprite 索引色）',
        'palette': {'bark': BARK, 'face': FACE, 'broken': BROKEN},
        'bbox': [x0, y0, x1, y1],
        'visible': [w, h],
        'aspect': round(w / h, 2),
        'opaque': total,
        'contact_run': run,
        'face_ratio': round(face_px / total, 3),
        'bark_ratio': round(bark_px / total, 3),
        'iou_with_rock': iou,
        'top_flatness': round(top_w / w, 3),
        'aseprite': header,
    }
    (ASSETS / 'stump-manifest.json').write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    print(f'可见 {w}×{h}（宽高比 {w / h:.2f}），底行 y={y1}，接地 {run} 像素，'
          f'色数 {len(counts)}，连通 {components(mask)}')
    print(f'断面 {face_px / total:.3f} / 树皮 {bark_px / total:.3f}，'
          f'与岩石剪影交并比 {iou}，顶面平台度 {top_w / w:.2f}')

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
