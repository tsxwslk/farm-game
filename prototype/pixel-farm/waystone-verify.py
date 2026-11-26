"""柳湾南口路碑 48×48 的校验与验收图。

用法：py -3 prototype/pixel-farm/waystone-verify.py
输入：prototype/pixel-farm/assets/south-pass/waystone-48x48.png
输出：output/art-previews/waystone/ 下的 8×、实际尺寸与双底色图

硬指标：
1. 48×48 透明底，alpha 只有 0/255，色板锁在 14 色内，实体连成一整块；
2. 脚点在 (24,43)：接地行 y43 有实体，y44 全空；
3. 木牌正面 11×6 的单色空白，供游戏写字。
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / 'assets' / 'south-pass'
PREVIEWS = ROOT.parents[1] / 'output' / 'art-previews' / 'waystone'
STONE = ASSETS / 'waystone-48x48.png'

PALETTE = {
    '#3B332E', '#6D5D50', '#7D6D5D', '#95806A', '#AC9479', '#BDA78B', '#CBB99C',
    '#5C6A3A', '#748247',
    '#3B2A1A', '#664526', '#7E5732', '#9A6F41', '#BC9364', '#CFA97A',
}
CREAM = (240, 215, 152, 255)
HUD = (101, 83, 49, 255)

FACE = (18, 22, 31, 28)  # 左上含、右下不含
FOOT = (24, 43)


def check():
    image = Image.open(STONE).convert('RGBA')
    assert image.size == (48, 48), image.size

    raw = image.tobytes()
    alphas = set(raw[3::4])
    assert alphas == {0, 255}, alphas

    colors = {'#%02X%02X%02X' % (raw[i], raw[i + 1], raw[i + 2])
              for i in range(0, len(raw), 4) if raw[i + 3]}
    assert colors <= PALETTE, colors - PALETTE

    assert image.getbbox() == (10, 14, 38, 44), image.getbbox()

    opaque = {(x, y) for y in range(48) for x in range(48) if image.getpixel((x, y))[3]}
    # 4 邻域连通：苔、钉子、木牌都压在主体上，不应有孤岛
    start = min(opaque, key=lambda p: (p[1], p[0]))
    seen = {start}
    stack = [start]
    while stack:
        x, y = stack.pop()
        for neighbor in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if neighbor in opaque and neighbor not in seen:
                seen.add(neighbor)
                stack.append(neighbor)
    assert seen == opaque, sorted(opaque - seen)[:8]

    # 脚点接地：y43 有实体，y44 必须空
    assert image.getpixel(FOOT)[3] == 255, image.getpixel(FOOT)
    assert not any(image.getpixel((x, 44))[3] for x in range(48)), 'row 44 not empty'

    # 木牌正面：11×6 必须是一块单色，游戏才能在上面写字
    left, top, right, bottom = FACE
    tones = {image.getpixel((x, y)) for y in range(top, bottom) for x in range(left, right)}
    assert len(tones) == 1, tones
    assert tones.pop()[:3] == (188, 147, 100), tones  # #BC9364
    # 空白面以外一圈要有木框，不能和石面糊在一起
    assert image.getpixel((left - 1, top))[:3] == (126, 87, 50), image.getpixel((left - 1, top))
    assert image.getpixel((right, top))[:3] == (126, 87, 50), image.getpixel((right, top))

    print('48×48 · %d 色 · 实体 %d 像素 · bbox %s' % (len(colors), len(opaque), image.getbbox()))
    print('脚点 (24,43) 接地 · 木牌空白面 %d×%d 单色' % (right - left, bottom - top))


def preview():
    PREVIEWS.mkdir(parents=True, exist_ok=True)
    image = Image.open(STONE).convert('RGBA')

    big = Image.new('RGBA', (48 * 8 + 28, 48 * 8 + 28), CREAM)
    big.alpha_composite(image.resize((48 * 8, 48 * 8), Image.NEAREST), (14, 14))
    big.save(PREVIEWS / 'stone-8x.png')

    strip = Image.new('RGBA', (2 * 64, 64), CREAM)
    dark = Image.new('RGBA', (64, 64), HUD)
    dark.alpha_composite(image, (8, 8))
    strip.alpha_composite(image, (8, 8))
    strip.alpha_composite(dark, (64, 0))
    strip.resize((strip.width * 3, strip.height * 3), Image.NEAREST).save(PREVIEWS / 'stone-actual-3x.png')
    print('预览写到', PREVIEWS)


if __name__ == '__main__':
    check()
    preview()
