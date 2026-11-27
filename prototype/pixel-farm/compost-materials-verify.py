"""柳湾堆肥材料两枚背包图的校验与验收图。

用法：py -3 prototype/pixel-farm/compost-materials-verify.py
输入：prototype/pixel-farm/assets/compost/plant-scraps-32x32.png
      prototype/pixel-farm/assets/compost/compost-32x32.png
输出：output/art-previews/materials/ 下的 8×、1× 与并排对照

硬指标：
1. 都是 32×32 透明底，alpha 只有 0/255；
2. 植物残料含橄榄绿，成熟堆肥完全不含绿——两者在背包里靠色相就能分开；
3. 堆肥色板限定在深褐 + 暖褐，不含块状黏土那种浅暖色。
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / 'assets' / 'compost'
PREVIEWS = ROOT.parents[1] / 'output' / 'art-previews' / 'materials'
SCRAPS = ASSETS / 'plant-scraps-32x32.png'
COMPOST = ASSETS / 'compost-32x32.png'

SCRAP_PALETTE = {
    '#33401F', '#465528', '#4E2F1C', '#586A32', '#6B4527', '#6C7E3E', '#84974E',
    '#8A5F3A', '#9CAE60', '#A89455', '#A97B4E', '#C9B77A', '#E0D29F',
}
COMPOST_PALETTE = {
    '#241A12', '#33251A', '#43301F', '#533D28', '#6B5136', '#826545', '#8F7350',
    '#A57C4F', '#BD9566',
}
GREENS = {'#465528', '#586A32', '#6C7E3E', '#84974E', '#9CAE60'}
CREAM = (240, 215, 152, 255)


def colors_of(image):
    raw = image.tobytes()
    return {'#%02X%02X%02X' % (raw[i], raw[i + 1], raw[i + 2])
            for i in range(0, len(raw), 4) if raw[i + 3]}


def check(name, path, palette, bbox):
    image = Image.open(path).convert('RGBA')
    assert image.size == (32, 32), (name, image.size)
    raw = image.tobytes()
    assert set(raw[3::4]) == {0, 255}, (name, set(raw[3::4]))
    colors = colors_of(image)
    assert colors <= palette, (name, colors - palette)
    assert image.getbbox() == bbox, (name, image.getbbox())
    print('%-14s 32×32 · %d 色 · bbox %s' % (name, len(colors), image.getbbox()))
    return colors


def check_all():
    scrap_colors = check('plant-scraps', SCRAPS, SCRAP_PALETTE, (4, 6, 29, 26))
    compost_colors = check('compost', COMPOST, COMPOST_PALETTE, (3, 13, 29, 29))
    # 残料必须有绿；堆肥必须一点绿都没有
    assert GREENS & scrap_colors, scrap_colors
    assert not (GREENS & compost_colors), compost_colors
    # 堆肥要有暖褐亮点与碎纤维
    for tone in ('#A57C4F', '#BD9566', '#8F7350'):
        assert tone in compost_colors, tone
    print('色相区分：残料含橄榄绿，堆肥只有深褐/暖褐')


def preview():
    PREVIEWS.mkdir(parents=True, exist_ok=True)
    a = Image.open(SCRAPS).convert('RGBA')
    b = Image.open(COMPOST).convert('RGBA')
    a.resize((256, 256), Image.NEAREST).save(PREVIEWS / 'scraps-8x.png')
    b.resize((256, 256), Image.NEAREST).save(PREVIEWS / 'compost-8x.png')

    row = Image.new('RGBA', (2 * 44, 44), CREAM)
    row.alpha_composite(a, (6, 6))
    row.alpha_composite(b, (50, 6))
    row.resize((row.width * 4, row.height * 4), Image.NEAREST).save(PREVIEWS / 'both-1x-4x.png')

    sheet = Image.new('RGBA', (2 * 256 + 3 * 12, 280), CREAM)
    sheet.alpha_composite(a.resize((256, 256), Image.NEAREST), (12, 12))
    sheet.alpha_composite(b.resize((256, 256), Image.NEAREST), (280, 12))
    sheet.save(PREVIEWS / 'both-8x.png')
    print('预览写到', PREVIEWS)


if __name__ == '__main__':
    check_all()
    preview()
