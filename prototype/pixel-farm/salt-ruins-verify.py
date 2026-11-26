"""柳湾旧制盐遗迹的校验与验收图。

运行：python3 prototype/pixel-farm/salt-ruins-verify.py [--verify]
输入：prototype/pixel-farm/assets/salt-ruins/salt-ruins-64x64.png
输出：output/art-previews/salt-ruins/ 下的放大图、草地实景图、检查图
     prototype/pixel-farm/assets/salt-ruins/salt-ruins-manifest.json

判据按需求里的硬指标来：64×64 原生像素、接地点 (32,58)、只允许色板内的颜色、
alpha 只有 0/255（无抗锯齿）、接地是一整段、不烘焙投影、不自带地面前背景。
"""
from pathlib import Path
import json
import struct
import sys
from PIL import Image

SIZE = 64
ANCHOR = (32, 58)
ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / 'assets' / 'salt-ruins'
PREVIEWS = ROOT.parents[1] / 'output' / 'art-previews' / 'salt-ruins'
PNG = ASSETS / 'salt-ruins-64x64.png'
SPRITE = ASSETS / 'salt-ruins-64x64.aseprite'
GRASS = [ROOT / 'assets' / 'grass' / f'grass-lawn-{i}.png' for i in range(4)]

PALETTE = {
    'line': '#322D27', 'dark': '#4A443C', 'face2': '#575046',
    'mid': '#6E675C', 'light': '#8A8272', 'hi': '#A79C86',
    'i_line': '#262520', 'i_dark': '#3C3B35', 'i_mid': '#55544D', 'i_hi': '#8B8981',
    'salt': '#DCD6C8', 'salt_hi': '#F5F2E9',
    'w_line': '#291E15', 'w_dark': '#3A2A1C', 'w_mid': '#6A5236', 'w_hi': '#826644',
}
STONE = ('line', 'dark', 'face2', 'mid', 'light', 'hi')
IRON = ('i_line', 'i_dark', 'i_mid', 'i_hi')
SALT = ('salt', 'salt_hi')
WOOD = ('w_line', 'w_dark', 'w_mid', 'w_hi')


def hex_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def opaque_bbox(px):
    xs, ys = [], []
    for y in range(SIZE):
        for x in range(SIZE):
            if px[x, y][3]:
                xs.append(x)
                ys.append(y)
    if not xs:
        return None
    return min(xs), min(ys), max(xs), max(ys)


def contact_run(px, row):
    """接地行上包住 x=32 的那一段连续不透明像素有多长。"""
    if not px[ANCHOR[0], row][3]:
        return 0
    x0 = ANCHOR[0]
    while x0 - 1 >= 0 and px[x0 - 1, row][3]:
        x0 -= 1
    x1 = ANCHOR[0]
    while x1 + 1 < SIZE and px[x1 + 1, row][3]:
        x1 += 1
    return x1 - x0 + 1


def components(px):
    """4 连通块数，用来确认是单件而不是散落的几块。"""
    seen = [[False] * SIZE for _ in range(SIZE)]
    count = 0
    for y in range(SIZE):
        for x in range(SIZE):
            if px[x, y][3] and not seen[y][x]:
                count += 1
                stack = [(x, y)]
                seen[y][x] = True
                while stack:
                    cx, cy = stack.pop()
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < SIZE and 0 <= ny < SIZE and px[nx, ny][3] and not seen[ny][nx]:
                            seen[ny][nx] = True
                            stack.append((nx, ny))
    return count


def read_sprite_header():
    if not SPRITE.exists():
        return None
    d = SPRITE.read_bytes()
    magic, frames, w, h = struct.unpack_from('<HHHH', d, 4)
    depth = struct.unpack_from('<H', d, 12)[0]
    return {'magic_ok': magic == 0xA5E0, 'frames': frames, 'size': [w, h], 'color_depth': depth}


def build_previews(im, counts):
    PREVIEWS.mkdir(parents=True, exist_ok=True)

    bg = Image.new('RGBA', im.size, (246, 240, 228, 255))
    bg.alpha_composite(im)
    flat = bg.convert('RGB')
    flat.resize((SIZE * 8, SIZE * 8), Image.NEAREST).save(
        PREVIEWS / 'salt-ruins-8x.png', optimize=True)

    # 草地实景：1x 与 2x，看得出尺寸占比与颜色是否打架
    tiles = [Image.open(p).convert('RGBA') for p in GRASS if p.exists()]
    if tiles:
        fw, fh = 200, 144
        field = Image.new('RGBA', (fw, fh))
        for y in range(0, fh, 32):
            for x in range(0, fw, 32):
                field.alpha_composite(tiles[(x // 32 + y // 32) % len(tiles)], (x, y))
        field.alpha_composite(im, ((fw - SIZE) // 2, 40))
        scene = Image.new('RGB', (fw * 3 + 16, fh * 2), (22, 26, 28))
        scene.paste(field.convert('RGB'), (0, 0))
        scene.paste(field.convert('RGB').resize((fw * 2, fh * 2), Image.NEAREST), (fw + 16, 0))
        scene.save(PREVIEWS / 'salt-ruins-on-grass.png', optimize=True)

    # 检查图：8 倍正视图 + 色板 + 各料占比
    order = STONE + IRON + SALT + WOOD
    sw = 26
    sheet = Image.new('RGB', (SIZE * 8 + 12, SIZE * 8 + 12 + sw), (246, 240, 228))
    sheet.paste(flat.resize((SIZE * 8, SIZE * 8), Image.NEAREST), (6, 6))
    for i, k in enumerate(order):
        sheet.paste(Image.new('RGB', (SIZE * 8 // len(order), sw - 6), hex_rgb(PALETTE[k])),
                    (6 + i * (SIZE * 8 // len(order)), SIZE * 8 + 6))
    sheet.save(PREVIEWS / 'salt-ruins-sheet.png', optimize=True)


def main():
    verify = '--verify' in sys.argv
    if not PNG.exists():
        print('缺少 salt-ruins-64x64.png，先跑 salt-ruins.lua')
        return 1
    im = Image.open(PNG).convert('RGBA')
    px = im.load()
    problems = []

    if im.size != (SIZE, SIZE):
        problems.append(f'尺寸 {im.size}，应为 {(SIZE, SIZE)}')

    # alpha 只有 0/255
    # getcolors() 返回 (像素数, 值)，取值在 [1]
    alphas = sorted(c[1] for c in im.getchannel('A').getcolors())
    if alphas != [0, 255]:
        problems.append(f'alpha 取值 {alphas}，只允许 0 与 255（有抗锯齿）')

    # 只允许色板内的颜色
    allowed = {hex_rgb(v) + (255,) for v in PALETTE.values()}
    counts = {}
    for y in range(SIZE):
        for x in range(SIZE):
            c = px[x, y]
            if c[3]:
                counts[c] = counts.get(c, 0) + 1
                if c not in allowed:
                    problems.append(f'出现色板外的颜色 {c} @({x},{y})')
                    break

    def area(keys):
        return sum(counts.get(hex_rgb(PALETTE[k]) + (255,), 0) for k in keys)

    box = opaque_bbox(px)
    if box is None:
        print('整张图是空的')
        return 1
    x0, y0, x1, y1 = box
    w, h = x1 - x0 + 1, y1 - y0 + 1

    if y1 != ANCHOR[1]:
        problems.append(f'最底一行是 y={y1}，接地点要求 y={ANCHOR[1]}')
    if y1 > ANCHOR[1]:
        problems.append(f'接地点以下还有像素（到 y={y1}），等于自带投影')
    run = contact_run(px, ANCHOR[1])
    if run < 6:
        problems.append(f'接地行只有 {run} 像素连成一段，接地必须是一整段')
    if w < 52:
        problems.append(f'占地只有 {w} 像素宽，要求约两格（64）')
    if h > 30:
        problems.append(f'整件高 {h} 像素，要求低矮（≤30）')
    if abs((x0 + x1) / 2 - ANCHOR[0]) > 6:
        problems.append(f'包围盒中心 x={(x0 + x1) / 2:.1f} 偏离锚点 {ANCHOR[0]} 太多')

    comps = components(px)
    if comps != 1:
        problems.append(f'不透明像素分成 {comps} 块，应是一件整体')

    # 略不对称：与左右镜像比，差异要够大
    flip_diff = sum(1 for y in range(SIZE) for x in range(SIZE)
                    if px[x, y][3] != px[SIZE - 1 - x, y][3])
    if flip_diff < 0.15 * sum(1 for y in range(SIZE) for x in range(SIZE) if px[x, y][3]):
        problems.append(f'与镜像只差 {flip_diff} 像素，轮廓太对称')

    stone, iron, salt, wood = area(STONE), area(IRON), area(SALT), area(WOOD)
    if not 100 <= iron <= 400:
        problems.append(f'铁盘 {iron} 像素，超出 100~400')
    if not 4 <= salt <= 16:
        problems.append(f'盐渍 {salt} 像素，要求少量（4~16）')
    if not 150 <= wood <= 450:
        problems.append(f'木片 {wood} 像素，超出 150~450')
    if stone < 600:
        problems.append(f'石台只有 {stone} 像素，主体太薄')

    header = read_sprite_header()
    if header is None:
        problems.append('缺少 .aseprite 源文件')
    else:
        if not header['magic_ok']:
            problems.append('.aseprite 文件头不合法')
        if header['frames'] != 1 or header['size'] != [SIZE, SIZE] or header['color_depth'] != 8:
            problems.append(f'.aseprite 头不符：{header}')

    build_previews(im, counts)

    manifest = {
        'size': [SIZE, SIZE],
        'anchor': list(ANCHOR),
        'view': '固定俯视微倾，左上受光',
        'source': 'salt-ruins.lua（Aseprite 索引色，16 色）',
        'palette': PALETTE,
        'bbox': [x0, y0, x1, y1],
        'footprint_tiles': round(w / 32, 2),
        'contact_run_px': run,
        'components': comps,
        'mirror_diff_px': flip_diff,
        'area_px': {'stone': stone, 'iron': iron, 'salt': salt, 'wood': wood, 'total': sum(counts.values())},
        'aseprite': header,
    }
    (ASSETS / 'salt-ruins-manifest.json').write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    print(f'包围盒 {w}×{h}（x {x0}..{x1} y {y0}..{y1}），占地 {w / 32:.2f} 格')
    print(f'接地行 y={y1} 连成 {run} 像素；连通块 {comps}；镜像差 {flip_diff} 像素')
    print(f'石 {stone} / 铁 {iron} / 盐 {salt} / 木 {wood}，合计 {sum(counts.values())}，色数 {len(counts)}')

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
