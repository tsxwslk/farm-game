"""柳湾河鲫鱼 32×32 的校验与验收图。

用法：py -3 prototype/pixel-farm/fish-verify.py
输入：prototype/pixel-farm/assets/fish/crucian-32x32.png
输出：output/art-previews/fish/ 下的 8×、实际尺寸与双底色图

硬指标：
1. 32×32 透明底，alpha 只有 0/255，色板锁在 10 色内，没有孤立像素；
2. 头朝左、尾朝右：最左实体在 x1，尾鳍叉口在 (27,16)；
3. 眼是一只 2×2 的深色点，位于头前上方。
"""
from pathlib import Path
import sys

from PIL import Image

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / 'assets' / 'fish'
PREVIEWS = ROOT.parents[1] / 'output' / 'art-previews' / 'fish'
FISH = ASSETS / 'crucian-32x32.png'

PALETTE = {
    '#2C2B1C', '#4A4C33', '#6A6A46', '#8B8A5F', '#C0B78F',
    '#D8CFA9', '#ECE2C4', '#F7F0DA', '#9C9670', '#6E6B4C',
}
CREAM = (240, 215, 152, 255)
HUD = (101, 83, 49, 255)
SCALE = 8
PAD = 14


def check():
    image = Image.open(FISH).convert('RGBA')
    assert image.size == (32, 32), image.size

    alphas = set(image.tobytes()[3::4])
    assert alphas == {0, 255}, alphas

    raw = image.tobytes()
    colors = {'#%02X%02X%02X' % (raw[i], raw[i + 1], raw[i + 2])
              for i in range(0, len(raw), 4) if raw[i + 3]}
    assert colors <= PALETTE, colors - PALETTE

    assert image.getbbox() == (1, 9, 28, 22), image.getbbox()

    opaque = {(x, y) for y in range(32) for x in range(32) if image.getpixel((x, y))[3]}
    lonely = [p for p in opaque if sum(
        (p[0] + dx, p[1] + dy) in opaque
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
    ) < 1]
    assert not lonely, lonely

    # 尾鳍的叉口必须是空的，尾柄必须是实的
    assert image.getpixel((27, 16))[3] == 0, image.getpixel((27, 16))
    assert image.getpixel((23, 16))[3] == 255, image.getpixel((23, 16))
    # 眼睛：2×2 深色点里至少两格是本色深边
    dark = sum(1 for x in (4, 5) for y in (14, 15)
               if image.getpixel((x, y))[:3] == (44, 43, 28))
    assert dark >= 2, dark

    print('canvas 32×32 · alpha {0,255} · %d 色 · 实体 %d 像素 · bbox %s'
          % (len(colors), len(opaque), image.getbbox()))
    print('头朝左、尾鳍叉口在 (27,16)，眼睛 2×2 深色点')
    return image


def sheet(image, background):
    tile = image.resize((32 * SCALE, 32 * SCALE), Image.NEAREST)
    canvas = Image.new('RGBA', (tile.width + 2 * PAD, tile.height + 2 * PAD), background)
    canvas.alpha_composite(tile, (PAD, PAD))
    return canvas


def previews(image):
    PREVIEWS.mkdir(parents=True, exist_ok=True)
    image.resize((32 * SCALE, 32 * SCALE), Image.NEAREST).save(PREVIEWS / 'fish-8x.png')
    image.resize((32 * 16, 32 * 16), Image.NEAREST).save(PREVIEWS / 'fish-16x.png')

    light = sheet(image, CREAM)
    dark = sheet(image, HUD)
    stack = Image.new('RGBA', (light.width * 2 + 8, light.height), (34, 43, 33, 255))
    stack.alpha_composite(light, (0, 0))
    stack.alpha_composite(dark, (light.width + 8, 0))
    stack.save(PREVIEWS / 'on-hud-8x.png')

    strip = Image.new('RGBA', (2 * 48, 48), CREAM)
    strip.alpha_composite(image, (8, 8))
    dark_cell = Image.new('RGBA', (48, 48), HUD)
    dark_cell.alpha_composite(image, (8, 8))
    strip.alpha_composite(dark_cell, (48, 0))
    strip.resize((strip.width * 3, strip.height * 3), Image.NEAREST).save(PREVIEWS / 'actual-3x.png')
    print('previews ->', PREVIEWS)


if __name__ == '__main__':
    previews(check())
    sys.exit(0)
