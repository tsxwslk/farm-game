"""通用种子袋 32×32 的校验与验收图。

用法：py -3 prototype/pixel-farm/seed-bag-verify.py
输入：prototype/pixel-farm/assets/seed-bags/base-32x32.png
输出：output/art-previews/seed-bag/ 下的 1×、8× 与叠作物图

硬指标：
1. 32×32 透明底，alpha 只有 0/255，色板锁在 7 色内，没有孤立像素；
2. 正面 (7,9) 起 18×18 是一整块同色平整区，中心 (16,18)，不含纹理；
3. 叠上作物收获图后，正面图案仍能读出主体，不被袋身吃掉。
"""
from pathlib import Path
import sys

from PIL import Image

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / 'assets' / 'seed-bags'
PREVIEWS = ROOT.parents[1] / 'output' / 'art-previews' / 'seed-bag'
BASE = ASSETS / 'base-32x32.png'
CROPS = {
    'pak-choi': ROOT / 'assets' / 'pak-choi' / '05-inventory.png',
    'radish': ROOT / 'assets' / 'cherry-radish' / '05-inventory.png',
}

PALETTE = {
    '#4A3421', '#8A6540', '#A87E4F', '#C39C6B', '#E1C593', '#EBD3A4', '#F4E5C4',
}
PANEL = (7, 9, 18, 18)
PANEL_TONE = '#E1C593'
CREAM = (240, 215, 152, 255)
HUD = (101, 83, 49, 255)
SCALE = 8
PAD = 12


def hexes(image):
    raw = image.tobytes()
    return {'#%02X%02X%02X' % (raw[i], raw[i + 1], raw[i + 2])
            for i in range(0, len(raw), 4) if raw[i + 3]}


def check():
    image = Image.open(BASE).convert('RGBA')
    assert image.size == (32, 32), image.size

    alphas = set(image.tobytes()[3::4])
    assert alphas == {0, 255}, alphas

    colors = hexes(image)
    assert colors <= PALETTE, colors - PALETTE

    assert image.getbbox() == (4, 5, 28, 30), image.getbbox()

    x0, y0, w, h = PANEL
    panel = {image.getpixel((x, y)) for y in range(y0, y0 + h) for x in range(x0, x0 + w)}
    flat = tuple(int(PANEL_TONE[i:i + 2], 16) for i in (1, 3, 5)) + (255,)
    assert panel == {flat}, panel

    opaque = {(x, y) for y in range(32) for x in range(32) if image.getpixel((x, y))[3]}
    lonely = [point for point in opaque if sum(
        (point[0] + dx, point[1] + dy) in opaque
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
    ) < 2]
    assert not lonely, lonely

    print('canvas 32×32 · alpha {0,255} · %d 色 · 实体 %d 像素' % (len(colors), len(opaque)))
    print('正面 %d×%d @ (%d,%d)，中心 (%d,%d)，单色平整'
          % (w, h, x0, y0, x0 + w // 2, y0 + h // 2))
    return image


def tile_of(image):
    tile = 32 * SCALE
    return image.resize((tile, tile), Image.NEAREST)


def sheet(images, background):
    tile = 32 * SCALE
    width = len(images) * tile + (len(images) + 1) * PAD
    canvas = Image.new('RGBA', (width, tile + 2 * PAD), background)
    for index, image in enumerate(images):
        canvas.alpha_composite(tile_of(image), (PAD + index * (tile + PAD), PAD))
    return canvas


def with_crop(base, crop_name):
    result = base.copy()
    crop = Image.open(CROPS[crop_name]).convert('RGBA').resize((PANEL[2], PANEL[3]), Image.NEAREST)
    result.alpha_composite(crop, (PANEL[0], PANEL[1]))
    return result


def previews(base):
    PREVIEWS.mkdir(parents=True, exist_ok=True)
    base.save(PREVIEWS / 'base-1x.png')
    tile_of(base).save(PREVIEWS / 'base-8x.png')

    light = sheet([base], CREAM)
    dark = sheet([base], HUD)
    stack = Image.new('RGBA', (light.width, light.height * 2 + 8), (34, 43, 33, 255))
    stack.alpha_composite(light, (0, 0))
    stack.alpha_composite(dark, (0, light.height + 8))
    stack.save(PREVIEWS / 'on-hud-8x.png')

    variants = [base, with_crop(base, 'pak-choi'), with_crop(base, 'radish')]
    sheet(variants, CREAM).save(PREVIEWS / 'with-crops-8x.png')
    print('previews ->', PREVIEWS)


if __name__ == '__main__':
    previews(check())
    sys.exit(0)
