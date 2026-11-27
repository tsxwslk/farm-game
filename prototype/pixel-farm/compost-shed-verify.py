"""柳湾堆肥棚 48×48 的校验与验收图。

用法：py -3 prototype/pixel-farm/compost-shed-verify.py
输入：prototype/pixel-farm/assets/compost/compost-shed-48x48.png
输出：output/art-previews/compost/ 下的 8×、实际尺寸与家族对照

硬指标：
1. 48×48 透明底，alpha 只有 0/255，色板锁在 19 色内；
2. 接地点 (24,44)：y44 有实体，y45 全空，画面不越过脚点；
3. 同时含屋盖灰、旧木、堆肥、草梗四组色，且高度明显低于角色占位 80。
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / 'assets' / 'compost'
PREVIEWS = ROOT.parents[1] / 'output' / 'art-previews' / 'compost'
SHED = ASSETS / 'compost-shed-48x48.png'
FOOT = (24, 44)

PALETTE = {
    '#2E2319', '#37342D', '#3A2A1B', '#3A2B1D', '#4A3A28', '#4B3826', '#5D4831',
    '#60442A', '#605C53', '#746F64', '#7A5A37', '#898377', '#987046', '#9E9789',
    '#AE8458', '#B3AB9B', '#B7A268', '#C2996A', '#CBB77C',
}
CREAM = (240, 215, 152, 255)
HUD = (101, 83, 49, 255)


def check():
    image = Image.open(SHED).convert('RGBA')
    assert image.size == (48, 48), image.size
    raw = image.tobytes()
    assert set(raw[3::4]) == {0, 255}, set(raw[3::4])
    colors = {'#%02X%02X%02X' % (raw[i], raw[i + 1], raw[i + 2])
              for i in range(0, len(raw), 4) if raw[i + 3]}
    assert colors <= PALETTE, colors - PALETTE
    assert image.getbbox() == (7, 9, 42, 45), image.getbbox()

    # 接地：脚点有实体，y45 全空
    assert image.getpixel(FOOT)[3] == 255, image.getpixel(FOOT)
    assert all(image.getpixel((x, 45))[3] == 0 for x in range(48)), 'row 45 not empty'

    # 四组材质都在：屋盖灰、旧木、堆肥、草梗
    for tone in ('#898377', '#987046', '#4B3826', '#B7A268'):
        assert tone in colors, tone

    # 比角色矮：占位角色 80，棚高 36
    height = image.getbbox()[3] - image.getbbox()[1]
    assert height < 50, height
    print('48×48 · %d 色 · 实体 %d 像素 · bbox %s · 高 %d'
          % (len(colors), sum(1 for a in raw[3::4] if a), image.getbbox(), height))


def preview():
    PREVIEWS.mkdir(parents=True, exist_ok=True)
    image = Image.open(SHED).convert('RGBA')
    image.resize((384, 384), Image.NEAREST).save(PREVIEWS / 'shed-8x.png')

    # 实际尺寸在浅色 / 深色底上
    row = Image.new('RGBA', (2 * 56, 56), CREAM)
    dark = Image.new('RGBA', (56, 56), HUD)
    dark.alpha_composite(image, (4, 4))
    row.alpha_composite(image, (4, 4))
    row.alpha_composite(dark, (56, 0))
    row.resize((row.width * 3, row.height * 3), Image.NEAREST).save(PREVIEWS / 'shed-actual-3x.png')

    # 家族对照：堆肥棚 / 火灶 / 木箱 / 陶罐
    tiles = []
    for path in ('compost/compost-shed-48x48.png', 'fire-stove/fire-stove-scene-48x48.png',
                 'crate/crate-harvest-48x48.png', 'jar/jar-crock-48x48.png'):
        im = Image.open(ROOT / 'assets' / path).convert('RGBA')
        tiles.append(im.resize((288, 288), Image.NEAREST))
    sheet = Image.new('RGBA', (4 * 288 + 5 * 14, 316), CREAM)
    for i, cell in enumerate(tiles):
        sheet.alpha_composite(cell, (14 + i * 302, 14))
    sheet.save(PREVIEWS / 'family-6x.png')
    print('预览写到', PREVIEWS)


if __name__ == '__main__':
    check()
    preview()
