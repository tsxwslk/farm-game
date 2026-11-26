"""敞口矮陶罐两层素材的校验与验收图。

用法：py -3 prototype/pixel-farm/pickles-verify.py
输入：prototype/pixel-farm/assets/pickles/base-32x32.png、rim-32x32.png
输出：output/art-previews/pickles/ 下的 8× 分层图与叠作物图

硬指标：
1. 两层都是 32×32 透明底，alpha 只有 0/255，色板锁在 9 色内；
2. 底层含罐身、口沿后段与盐水，bbox 覆盖 y8..29；前沿层只占 y16..18；
3. 把 18×18 作物图放在 (7,1) 后，前沿层必须把 y16..18 整段盖住，不留缝。
"""
from pathlib import Path
import sys

from PIL import Image

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / 'assets' / 'pickles'
PREVIEWS = ROOT.parents[1] / 'output' / 'art-previews' / 'pickles'
BASE = ASSETS / 'base-32x32.png'
RIM = ASSETS / 'rim-32x32.png'
CROPS = {
    'pak-choi': ROOT / 'assets' / 'pak-choi' / '05-inventory.png',
    'radish': ROOT / 'assets' / 'cherry-radish' / '05-inventory.png',
}

PALETTE = {
    '#3F2110', '#6A3B22', '#8C5230', '#B4703C', '#A9662F',
    '#D89050', '#EFB268', '#C4914F', '#E3B76E',
}
CROP_POS = (7, 1)
CROP_SIZE = 18
COVER_ROWS = (16, 18)
CREAM = (240, 215, 152, 255)
HUD = (101, 83, 49, 255)
SCALE = 8
PAD = 14
MAGENTA = (255, 0, 255, 255)


def load(path):
    return Image.open(path).convert('RGBA')


def check():
    base, rim = load(BASE), load(RIM)
    for name, image in (('base', base), ('rim', rim)):
        assert image.size == (32, 32), (name, image.size)
        alphas = set(image.tobytes()[3::4])
        assert alphas == {0, 255}, (name, alphas)
        raw = image.tobytes()
        colors = {'#%02X%02X%02X' % (raw[i], raw[i + 1], raw[i + 2])
                  for i in range(0, len(raw), 4) if raw[i + 3]}
        assert colors <= PALETTE, (name, colors - PALETTE)

    assert base.getbbox() == (2, 8, 30, 30), base.getbbox()
    assert rim.getbbox() == (4, 16, 28, 19), rim.getbbox()

    # 作物图垫底处不能透出背景：口内与唇后都要有实体
    for x0, x1, y0, y1 in ((9, 22, 11, 15), (7, 24, 16, 18)):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                assert base.getpixel((x, y))[3] == 255, ('hole', x, y)

    # 前沿必须把作物图下缘 18×18 的 y16..18 整段盖住
    probe = base.copy()
    probe.alpha_composite(Image.new('RGBA', (CROP_SIZE, CROP_SIZE), MAGENTA), CROP_POS)
    probe.alpha_composite(rim)
    for y in range(COVER_ROWS[0], COVER_ROWS[1] + 1):
        for x in range(CROP_POS[0], CROP_POS[0] + CROP_SIZE):
            assert probe.getpixel((x, y)) != MAGENTA, ('uncovered', x, y)

    raw = base.tobytes()
    opaque = sum(1 for i in range(3, len(raw), 4) if raw[i])
    print('base 32×32 · %d 色 · 实体 %d 像素 · bbox %s' % (len(PALETTE), opaque, base.getbbox()))
    print('rim  32×32 · 只占 y16..18，18×18 @ (7,1) 的下缘已被完全盖住')
    return base, rim


def tile(image, background=None):
    tile = image.resize((32 * SCALE, 32 * SCALE), Image.NEAREST)
    if background is None:
        return tile
    canvas = Image.new('RGBA', tile.size, background)
    canvas.alpha_composite(tile)
    return canvas


def with_crop(base, rim, name):
    result = base.copy()
    crop = load(CROPS[name]).resize((CROP_SIZE, CROP_SIZE), Image.NEAREST)
    result.alpha_composite(crop, CROP_POS)
    result.alpha_composite(rim)
    return result


def previews(base, rim):
    PREVIEWS.mkdir(parents=True, exist_ok=True)
    tiles = [tile(base, CREAM), tile(rim, CREAM),
             tile(with_crop(base, rim, 'pak-choi'), CREAM),
             tile(with_crop(base, rim, 'radish'), CREAM)]
    width = sum(t.width for t in tiles) + PAD * (len(tiles) + 1)
    height = max(t.height for t in tiles) + 2 * PAD
    canvas = Image.new('RGBA', (width, height), HUD)
    x = PAD
    for t in tiles:
        canvas.alpha_composite(t, (x, PAD))
        x += t.width + PAD
    canvas.save(PREVIEWS / 'layers-and-crops.png')

    base.resize((512, 512), Image.NEAREST).save(PREVIEWS / 'base-16x.png')
    rim.resize((512, 512), Image.NEAREST).save(PREVIEWS / 'rim-16x.png')
    with_crop(base, rim, 'pak-choi').resize((512, 512), Image.NEAREST).save(PREVIEWS / 'comp-16x.png')
    print('previews ->', PREVIEWS)


if __name__ == '__main__':
    previews(*check())
    sys.exit(0)
