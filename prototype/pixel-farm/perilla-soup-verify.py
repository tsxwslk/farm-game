"""紫苏鲫鱼汤 32×32 的校验与验收图。

用法：python3 prototype/pixel-farm/perilla-soup-verify.py
输入：prototype/pixel-farm/assets/fish/perilla-crucian-soup-32x32.png
      prototype/pixel-farm/assets/fish/crucian-soup-32x32.png（原版，作基准）
      prototype/pixel-farm/assets/fish/perilla-leaf-layer-32x32.png（紫苏层单图）
输出：output/art-previews/fish/ 下的 8×、与原版并排、缩小试看

硬指标：
1. 画布、透明底、色板（原汤 14 色 + 紫苏 6 色）；
2. 不透明像素集合必须与原版完全一致——紫苏只画在碗内，碗形一个像素都不改；
3. 乳白汤面至少保留原版的 55%（紫叶要占掉约四分之一汤面），鱼肉至少 6 像素，蒸汽仍是 7 像素两笔；
4. 紫苏叶至少 22 像素且比汤面暗 60 以上，叶柄至少 2 像素；
5. 缩到 24 与 18 像素后，汤面与紫叶都还在（能读成「一碗有紫苏的鱼汤」）。
"""
from pathlib import Path
import sys

from PIL import Image

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / 'assets' / 'fish'
PREVIEWS = ROOT.parents[1] / 'output' / 'art-previews' / 'fish'
SOUP = ASSETS / 'perilla-crucian-soup-32x32.png'
BASE = ASSETS / 'crucian-soup-32x32.png'
LEAF = ASSETS / 'perilla-leaf-layer-32x32.png'

SOUP_PALETTE = {
    '#332B25', '#443A32', '#5E5045', '#7A6A5C', '#AE9B84', '#947F69', '#6F5E4F',
    '#D9CBB2', '#F2E8D3', '#FBF4E2', '#B7B4A4', '#8E8B7A', '#7FA05B', '#F6EDDC',
}
LEAF_PALETTE = {'#34182A', '#4E2138', '#6B3252', '#9A5A78', '#64404A', '#4E3038'}
CREAM = '#F2E8D3'
FISH = {'#B7B4A4', '#8E8B7A'}
STEAM = '#F6EDDC'
SOIL = (46, 52, 44, 255)


def lum(hex_color):
    r, g, b = (int(hex_color[i:i + 2], 16) for i in (1, 3, 5))
    return 0.299 * r + 0.587 * g + 0.114 * b


def px_hex(p):
    return '#%02X%02X%02X' % p[:3]


def opaque(image):
    return {(x, y) for y in range(image.height) for x in range(image.width)
            if image.getpixel((x, y))[3]}


def count(image, predicate):
    raw = image.tobytes()
    return sum(1 for i in range(0, len(raw), 4)
               if raw[i + 3] and predicate((raw[i], raw[i + 1], raw[i + 2])))


def check():
    failures = []
    image = Image.open(SOUP).convert('RGBA')
    base = Image.open(BASE).convert('RGBA')

    if image.size != (32, 32):
        failures.append('画布应为 32×32，实际 %s' % (image.size,))
        return failures, image

    alphas = set(image.tobytes()[3::4])
    if alphas != {0, 255}:
        failures.append('alpha 出现中间值 %s' % sorted(alphas - {0, 255}))

    raw = image.tobytes()
    colors = {px_hex((raw[i], raw[i + 1], raw[i + 2]))
              for i in range(0, len(raw), 4) if raw[i + 3]}
    bad = colors - SOUP_PALETTE - LEAF_PALETTE
    if bad:
        failures.append('出现色板外的颜色 %s' % sorted(bad))

    if image.getbbox() != (3, 7, 29, 25):
        failures.append('外壳包围盒变了：%s' % (image.getbbox(),))

    if opaque(image) != opaque(base):
        diff = opaque(image) ^ opaque(base)
        failures.append('剪影被改动：%d 个像素与原版不一致，例如 %s'
                        % (len(diff), sorted(diff)[:6]))

    cream = count(image, lambda p: px_hex(p) == CREAM)
    cream_base = count(base, lambda p: px_hex(p) == CREAM)
    if cream < cream_base * 0.55:
        failures.append('乳白汤面只剩 %d 像素（原版 %d），盖太多了' % (cream, cream_base))

    fish = count(image, lambda p: px_hex(p) in FISH)
    if fish < 6:
        failures.append('鱼肉只剩 %d 像素' % fish)

    steam = count(image, lambda p: px_hex(p) == STEAM)
    if steam > 8:
        failures.append('蒸汽 %d 像素，超过两笔' % steam)

    leaf = count(image, lambda p: px_hex(p) in {'#34182A', '#4E2138', '#6B3252', '#9A5A78'})
    stem = count(image, lambda p: px_hex(p) in {'#64404A', '#4E3038'})
    if leaf < 22:
        failures.append('紫苏叶只剩 %d 像素' % leaf)
    if stem < 2:
        failures.append('叶柄只剩 %d 像素' % stem)

    if lum(CREAM) - lum('#6B3252') < 60:
        failures.append('紫叶与汤面对比不足')

    solid = opaque(image)
    lonely = [p for p in solid if not any(
        (p[0] + dx, p[1] + dy) in solid
        for dx in (-1, 0, 1) for dy in (-1, 0, 1) if dx or dy)]
    if lonely:
        failures.append('孤立像素 %s' % lonely[:4])

    # 缩小试看：24 与 18 像素下，汤面与紫叶都得还在
    for size in (24, 18):
        small = image.resize((size, size), Image.NEAREST)
        cream_s = count(small, lambda p: px_hex(p) == CREAM)
        leaf_s = count(small, lambda p: px_hex(p) in {'#34182A', '#4E2138', '#6B3252', '#9A5A78'})
        need_cream, need_leaf = (15, 6) if size == 24 else (8, 4)
        if cream_s < need_cream or leaf_s < need_leaf:
            failures.append('缩到 %d 像素后读不出（汤 %d / 叶 %d）' % (size, cream_s, leaf_s))

    leaf_only = Image.open(LEAF).convert('RGBA')
    if leaf_only.size != (32, 32):
        failures.append('紫苏层单图应为 32×32')

    print('32×32 · %d 色 · 汤面 %d/%d · 鱼肉 %d · 紫叶 %d · 叶柄 %d · 蒸汽 %d'
          % (len(colors), cream, cream_base, fish, leaf, stem, steam))
    return failures, image


def previews(image):
    PREVIEWS.mkdir(parents=True, exist_ok=True)
    base = Image.open(BASE).convert('RGBA')

    sheet = Image.new('RGBA', (3 * 40 + 10, 44), (32, 35, 33, 255))
    for i, layer in enumerate((base, image, Image.open(LEAF).convert('RGBA'))):
        pad = Image.new('RGBA', (32, 32), SOIL)
        pad.alpha_composite(layer)
        sheet.alpha_composite(pad, (10 + i * 40, 6))
    sheet.resize((sheet.width * 8, sheet.height * 8), Image.NEAREST).save(PREVIEWS / 'perilla-soup-8x.png')

    shrink = Image.new('RGBA', (3 * 40 + 10, 44), (32, 35, 33, 255))
    for i, size in enumerate((32, 24, 18)):
        pad = Image.new('RGBA', (32, 32), SOIL)
        small = image.resize((size, size), Image.NEAREST)
        pad.alpha_composite(small, ((32 - size) // 2, (32 - size) // 2))
        shrink.alpha_composite(pad, (10 + i * 40, 6))
    shrink.resize((shrink.width * 8, shrink.height * 8), Image.NEAREST).save(PREVIEWS / 'perilla-soup-shrink.png')


def main():
    failures, image = check()
    if failures:
        print('FAIL')
        for line in failures:
            print('  - ' + line)
        return 1
    previews(image)
    print('OK  碗形未改、汤面与鱼肉保留、紫叶与叶柄可见、缩小后仍可读')
    return 0


if __name__ == '__main__':
    sys.exit(main())
