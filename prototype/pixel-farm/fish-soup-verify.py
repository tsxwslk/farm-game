"""家常鲫鱼汤 32×32 的校验与验收图。

用法：py -3 prototype/pixel-farm/fish-soup-verify.py
输入：prototype/pixel-farm/assets/fish/crucian-soup-32x32.png
输出：output/art-previews/fish/ 下的 8×、灰度与双底色图

硬指标：
1. 32×32 透明底，alpha 只有 0/255，色板锁在 14 色内；
2. 碗口、汤面、碗身三块在灰度下分得开：汤面比碗口亮 ≥60，碗口比碗身亮 ≥30；
3. 没有孤立像素（八邻域），蒸汽细线也算连通。
"""
from pathlib import Path
import sys

from PIL import Image

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / 'assets' / 'fish'
PREVIEWS = ROOT.parents[1] / 'output' / 'art-previews' / 'fish'
SOUP = ASSETS / 'crucian-soup-32x32.png'

PALETTE = {
    '#332B25', '#443A32', '#5E5045', '#7A6A5C', '#AE9B84', '#947F69', '#6F5E4F',
    '#D9CBB2', '#F2E8D3', '#FBF4E2', '#B7B4A4', '#8E8B7A', '#7FA05B', '#F6EDDC',
}
CREAM = (240, 215, 152, 255)
HUD = (101, 83, 49, 255)


def lum(hex_color):
    r, g, b = (int(hex_color[i:i + 2], 16) for i in (1, 3, 5))
    return 0.299 * r + 0.587 * g + 0.114 * b


def check():
    image = Image.open(SOUP).convert('RGBA')
    assert image.size == (32, 32), image.size

    alphas = set(image.tobytes()[3::4])
    assert alphas == {0, 255}, alphas

    raw = image.tobytes()
    colors = {'#%02X%02X%02X' % (raw[i], raw[i + 1], raw[i + 2])
              for i in range(0, len(raw), 4) if raw[i + 3]}
    assert colors <= PALETTE, colors - PALETTE

    assert image.getbbox() == (3, 7, 29, 25), image.getbbox()

    opaque = {(x, y) for y in range(32) for x in range(32) if image.getpixel((x, y))[3]}
    lonely = [p for p in opaque if not any(
        (p[0] + dx, p[1] + dy) in opaque
        for dx in (-1, 0, 1) for dy in (-1, 0, 1) if dx or dy
    )]
    assert not lonely, lonely

    assert lum('#F2E8D3') - lum('#947F69') >= 60   # 汤面 vs 碗口
    assert lum('#947F69') - lum('#5E5045') >= 30   # 碗口 vs 碗身

    print('canvas 32×32 · alpha {0,255} · %d 色 · 实体 %d 像素 · bbox %s'
          % (len(colors), len(opaque), image.getbbox()))
    print('灰度：汤面 %.0f / 碗口 %.0f / 碗身 %.0f'
          % (lum('#F2E8D3'), lum('#947F69'), lum('#5E5045')))
    return image


def previews(image):
    PREVIEWS.mkdir(parents=True, exist_ok=True)
    image.resize((256, 256), Image.NEAREST).save(PREVIEWS / 'soup-8x.png')
    image.resize((512, 512), Image.NEAREST).save(PREVIEWS / 'soup-16x.png')
    image.convert('LA').resize((512, 512), Image.NEAREST).save(PREVIEWS / 'soup-gray-16x.png')

    strip = Image.new('RGBA', (2 * 48, 48), CREAM)
    strip.alpha_composite(image, (8, 8))
    dark = Image.new('RGBA', (48, 48), HUD)
    dark.alpha_composite(image, (8, 8))
    strip.alpha_composite(dark, (48, 0))
    strip.resize((strip.width * 3, strip.height * 3), Image.NEAREST).save(PREVIEWS / 'soup-actual-3x.png')
    print('previews ->', PREVIEWS)


if __name__ == '__main__':
    previews(check())
    sys.exit(0)
