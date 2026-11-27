"""柳湾盐水豌豆 32×32 的校验与验收图。

用法：py -3 prototype/pixel-farm/salted-peas-verify.py
输入：prototype/pixel-farm/assets/peas/salted-peas-32x32.png
输出：output/art-previews/salted-peas/ 下的 8×、1× 与快捷栏对照

硬指标：
1. 32×32 透明底，alpha 只有 0/255，色板锁在 16 色内；
2. bbox 不超出 (1,8)-(31,28)，底面不吃到 31 行；
3. 同时含陶碟三档、熟荚三档、豆瓣与亮面，说明内容分层完整。
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / 'assets' / 'peas'
PREVIEWS = ROOT.parents[1] / 'output' / 'art-previews' / 'salted-peas'
DISH = ASSETS / 'salted-peas-32x32.png'
SOUP = ROOT / 'assets' / 'fish' / 'crucian-soup-32x32.png'
PICKLES = ROOT / 'assets' / 'pickles' / 'base-32x32.png'

PALETTE = {
    '#3A332C', '#6B5E50', '#8C7D6B', '#A3947F', '#B6A68F', '#C9B79E', '#7E7060',
    '#2C3B1D', '#4A5E2C', '#617737', '#7C9346', '#98AD5C', '#B0C477', '#CFDB9C',
    '#E6EAD0', '#F2F0E0',
}
CREAM = (240, 215, 152, 255)


def check():
    image = Image.open(DISH).convert('RGBA')
    assert image.size == (32, 32), image.size
    raw = image.tobytes()
    assert set(raw[3::4]) == {0, 255}, set(raw[3::4])
    colors = {'#%02X%02X%02X' % (raw[i], raw[i + 1], raw[i + 2])
              for i in range(0, len(raw), 4) if raw[i + 3]}
    assert colors <= PALETTE, colors - PALETTE
    assert image.getbbox() == (1, 8, 31, 28), image.getbbox()
    # 陶碟、豆荚、豆瓣、亮面四层都要在
    for tone in ('#A3947F', '#7C9346', '#CFDB9C', '#E6EAD0'):
        assert tone in colors, tone
    print('32×32 · %d 色 · 实体 %d 像素 · bbox %s'
          % (len(colors), sum(1 for a in raw[3::4] if a), image.getbbox()))


def preview():
    PREVIEWS.mkdir(parents=True, exist_ok=True)
    image = Image.open(DISH).convert('RGBA')
    image.resize((256, 256), Image.NEAREST).save(PREVIEWS / 'dish-8x.png')

    row = Image.new('RGBA', (4 * 40, 44), CREAM)
    row.alpha_composite(image, (4, 6))
    row.save(PREVIEWS / 'dish-1x.png')

    # 快捷栏对照：汤碗 / 腌菜罐 / 盐水豌豆
    tiles = []
    for path in (SOUP, PICKLES, DISH):
        im = Image.open(path).convert('RGBA')
        cell = Image.new('RGBA', (32, 32), CREAM)
        cell.alpha_composite(im, (0, 0))
        tiles.append(cell.resize((128, 128), Image.NEAREST))
    sheet = Image.new('RGBA', (3 * 128 + 4 * 10, 148), (238, 221, 190, 255))
    for i, cell in enumerate(tiles):
        sheet.alpha_composite(cell, (10 + i * 138, 10))
    sheet.save(PREVIEWS / 'hotbar-compare-4x.png')
    print('预览写到', PREVIEWS)


if __name__ == '__main__':
    check()
    preview()
