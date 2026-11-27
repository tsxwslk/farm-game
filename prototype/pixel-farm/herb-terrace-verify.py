"""南山道 · 废弃石阶药圃 64×48 的校验与验收图。

用法：python3 prototype/pixel-farm/herb-terrace-verify.py
输入：prototype/pixel-farm/assets/south-pass/herb-terrace-64x48.png
输出：output/art-previews/south-pass/ 下的 4×、两种地面底色、余绪叠放示意

硬指标：
1. 64×48 透明底，alpha 只有 0/255，色板锁在 12 色内；
2. 脚点 (32,43) 落在实体上，且最低一行就是 43 —— 和路碑、树桩的接地口径一致；
3. 画面只含石、土、苔：没有亮于 200 的像素（发光粒子/文字会踩这条），
   苔只占 ≤ 40 像素（「少量」），没有偏绿的植株色；
4. 石板之间那道暗缝要够长够宽：x 40~41 上至少连续 6 行是缝色，供叠加紫苏余绪；
5. 没有孤立像素（八邻域）。
"""
from pathlib import Path
import sys

from PIL import Image

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / 'assets' / 'south-pass'
PREVIEWS = ROOT.parents[1] / 'output' / 'art-previews' / 'south-pass'
PNG = ASSETS / 'herb-terrace-64x48.png'

PALETTE = {
    '#2B2420', '#AC9479', '#95806A', '#7D6D5D', '#6D5D50', '#54483C',
    '#74573D', '#5E4530', '#44301F', '#1B1512', '#6E8A56', '#4E6B3C',
}
ANCHOR = (32, 43)
SOIL = {'#74573D', '#5E4530', '#44301F'}
STONE = {'#AC9479', '#95806A', '#7D6D5D', '#6D5D50', '#54483C'}
MOSS = {'#6E8A56', '#4E6B3C'}
SLOT = '#1B1512'

GROUND_DARK = (74, 58, 36, 255)
GROUND_BARE = (240, 176, 53, 255)


def lum(p):
    return 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]


def px_hex(p):
    return '#%02X%02X%02X' % p[:3]


def check():
    failures = []
    image = Image.open(PNG).convert('RGBA')

    if image.size != (64, 48):
        failures.append('画布应为 64×48，实际 %s' % (image.size,))
        return failures, image

    alphas = set(image.tobytes()[3::4])
    if alphas != {0, 255}:
        failures.append('alpha 出现中间值 %s' % sorted(alphas - {0, 255}))

    raw = image.tobytes()
    pixels = [tuple(raw[i:i + 4]) for i in range(0, len(raw), 4) if raw[i + 3]]
    bad = {px_hex(p) for p in pixels} - PALETTE
    if bad:
        failures.append('出现色板外的颜色 %s' % sorted(bad))

    solid = {(x, y) for y in range(48) for x in range(64) if image.getpixel((x, y))[3]}
    bottom = max(y for _, y in solid)
    if bottom != ANCHOR[1]:
        failures.append('最低行应为 %d（脚点行），实际 %d' % (ANCHOR[1], bottom))
    if ANCHOR not in solid:
        failures.append('脚点 (32,43) 不在实体上')

    wide = [x for x, y in solid if y == ANCHOR[1]]
    if len(wide) < 20:
        failures.append('接地行只有 %d 像素宽' % len(wide))

    counts = {
        'soil': sum(1 for p in pixels if px_hex(p) in SOIL),
        'stone': sum(1 for p in pixels if px_hex(p) in STONE),
        'moss': sum(1 for p in pixels if px_hex(p) in MOSS),
        'slot': sum(1 for p in pixels if px_hex(p) == SLOT),
    }
    if counts['soil'] < 150:
        failures.append('土面只有 %d 像素' % counts['soil'])
    if counts['stone'] < 140:
        failures.append('石面只有 %d 像素' % counts['stone'])
    if counts['moss'] > 40:
        failures.append('苔 %d 像素，超出「少量」' % counts['moss'])
    if counts['slot'] < 8:
        failures.append('暗缝只有 %d 像素' % counts['slot'])

    bright = [p for p in pixels if lum(p) > 200]
    if bright:
        failures.append('有 %d 个亮于 200 的像素，像发光粒子或文字' % len(bright))

    # 暗缝：中间那道要够长，留给余绪
    slot_rows = [y for y in range(48) if px_hex(image.getpixel((40, y))) == SLOT
                 and px_hex(image.getpixel((41, y))) == SLOT]
    if len(slot_rows) < 6:
        failures.append('x40~41 的暗缝只有 %d 行' % len(slot_rows))

    lonely = [p for p in solid if not any(
        (p[0] + dx, p[1] + dy) in solid
        for dx in (-1, 0, 1) for dy in (-1, 0, 1) if dx or dy)]
    if lonely:
        failures.append('孤立像素 %s' % lonely[:4])

    print('64×48 · %d 色 · 土 %d · 石 %d · 苔 %d · 缝 %d · 缝长 %d 行 · 接地 %d 像素'
          % (len({px_hex(p) for p in pixels}), counts['soil'], counts['stone'],
             counts['moss'], counts['slot'], len(slot_rows), len(wide)))
    return failures, image


def previews(image):
    PREVIEWS.mkdir(parents=True, exist_ok=True)

    for name, ground in (('dark', GROUND_DARK), ('bare', GROUND_BARE)):
        sheet = Image.new('RGBA', (80, 56), ground)
        sheet.alpha_composite(image, (8, 2))
        sheet.resize((sheet.width * 4, sheet.height * 4), Image.NEAREST).save(
            PREVIEWS / ('herb-terrace-%s-4x.png' % name))

    # 余绪叠放示意：在暗缝里点一小簇紫苏色，确认这条缝放得下
    demo = image.copy()
    for y in range(39, 43):
        for x in (40, 41):
            demo.putpixel((x, y), (161, 114, 154, 255) if y < 41 else (213, 171, 200, 255))
    sheet = Image.new('RGBA', (80, 56), GROUND_DARK)
    sheet.alpha_composite(demo, (8, 2))
    sheet.resize((sheet.width * 4, sheet.height * 4), Image.NEAREST).save(
        PREVIEWS / 'herb-terrace-trace-demo-4x.png')


def main():
    failures, image = check()
    if failures:
        print('FAIL')
        for line in failures:
            print('  - ' + line)
        return 1
    previews(image)
    print('OK  画布/脚点/色板/石土苔配比/暗缝长度 全部通过')
    return 0


if __name__ == '__main__':
    sys.exit(main())
