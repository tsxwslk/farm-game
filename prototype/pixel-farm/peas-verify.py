"""柳湾矮生豌豆四期生长的校验与验收图。

用法：py -3 prototype/pixel-farm/peas-verify.py
输入：prototype/pixel-farm/assets/peas/01-sprout.png … 04-mature.png
输出：output/art-previews/peas/ 下的 6×、2× 与 32 格缩略图

硬指标：
1. 四帧都是 48×72 透明底，alpha 只有 0/255，色板锁在同一套 20 色内；
2. 接地点固定 (24,66)：四帧在同一处有实体，y67 全空；
3. 株幅与株高随阶段递增，开花帧有乳白色，挂荚帧有豆荚绿。
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / 'assets' / 'peas'
PREVIEWS = ROOT.parents[1] / 'output' / 'art-previews' / 'peas'

STAGES = ['01-sprout', '02-seedling', '03-bulking', '04-mature']
ICON = ASSETS / '05-inventory.png'
BAG = ROOT / 'assets' / 'seed-bags' / 'base-32x32.png'
CREAM = (240, 215, 152, 255)
SIZE = (48, 72)
ICON_SIZE = (32, 32)
FOOT = (24, 66)

# 背包图只允许这 7 色：深边 / 橄榄暗 / 橄榄 / 豆绿 / 豆绿受光 / 浅黄绿 / 顶光
ICON_PALETTE = {'#2F3D1D', '#4A5A2A', '#63743A', '#86A84C', '#A5C466', '#C8DE8C', '#DCEAA8'}

PALETTE = {
    '#2C481C', '#415F2F', '#4A7139', '#557641', '#5C7B44', '#5C852D', '#5F8A48',
    '#6B8C52', '#7AA85C', '#7FA063', '#8FBE3F', '#97BE74', '#9BBB7A', '#ADD08A',
    '#B4DD6E', '#B9AA8D', '#D2F092', '#D9CCAE', '#F1E7CC', '#F7EFD9',
}
# 校验用的旧值也允许存在于历史文件，但新图只应当用上面这组
PETAL = '#F1E7CC'
POD = {'#8FBE3F', '#B4DD6E', '#D2F092'}
STYLE = {'#415F2F', '#4A7139', '#557641', '#5F8A48', '#6B8C52',
         '#7AA85C', '#97BE74', '#ADD08A', '#7FA063', '#9BBB7A'}


def colors_of(image):
    raw = image.tobytes()
    return {'#%02X%02X%02X' % (raw[i], raw[i + 1], raw[i + 2])
            for i in range(0, len(raw), 4) if raw[i + 3]}


def check():
    boxes = []
    heights = []
    for name in STAGES:
        path = ASSETS / (name + '.png')
        image = Image.open(path).convert('RGBA')
        assert image.size == SIZE, (name, image.size)

        raw = image.tobytes()
        assert set(raw[3::4]) == {0, 255}, (name, set(raw[3::4]))
        colors = colors_of(image)
        assert colors <= PALETTE, (name, colors - PALETTE)

        # 接地点：y66 有实体，y67 全空，脚点居中
        assert image.getpixel(FOOT)[3] == 255, (name, image.getpixel(FOOT))
        assert image.getpixel((24, 67))[3] == 0, name
        assert all(image.getpixel((x, 67))[3] == 0 for x in range(48)), name

        boxes.append(image.getbbox())
        heights.append(image.getbbox()[3] - image.getbbox()[1])

        if name == '03-bulking':
            assert PETAL in colors, (name, 'no flower')
            assert not (colors & POD), (name, colors & POD)
        if name == '04-mature':
            assert colors & POD, (name, 'no pod')
            assert PETAL not in colors, (name, 'mature should not keep flowers')
        if name in ('01-sprout', '02-seedling'):
            assert PETAL not in colors and not (colors & POD), name

    # 株高与株幅逐期递增
    assert heights == sorted(heights), heights
    widths = [b[2] - b[0] for b in boxes]
    assert widths == sorted(widths), widths
    assert widths[0] <= 17 and widths[-1] >= 30, widths

    for name, box, h in zip(STAGES, boxes, heights):
        print('%-12s bbox %-18s 高 %2d 宽 %2d' % (name, str(box), h, box[2] - box[0]))
    print('接地点 (24,66) 四帧一致 · 色板 20 色内')


def check_icon():
    image = Image.open(ICON).convert('RGBA')
    assert image.size == ICON_SIZE, image.size
    raw = image.tobytes()
    assert set(raw[3::4]) == {0, 255}, set(raw[3::4])
    colors = colors_of(image)
    assert colors <= ICON_PALETTE, colors - ICON_PALETTE
    # 受光与背光都要在：缺一个就说明豆粒受光没生效
    for tone in ('#A5C466', '#C8DE8C', '#63743A'):
        assert tone in colors, tone
    assert image.getbbox() == (6, 7, 28, 25), image.getbbox()
    cx = (image.getbbox()[0] + image.getbbox()[2]) / 2
    cy = (image.getbbox()[1] + image.getbbox()[3]) / 2
    assert abs(cx - 16) <= 2 and abs(cy - 16) <= 2, (cx, cy)
    print('05-inventory  32×32 · %d 色 · bbox %s · 中心 (%.0f,%.0f)'
          % (len(colors), image.getbbox(), cx, cy))


def icon_preview():
    PREVIEWS.mkdir(parents=True, exist_ok=True)
    image = Image.open(ICON).convert('RGBA')
    image.resize((256, 256), Image.NEAREST).save(PREVIEWS / 'pod-icon-8x.png')
    small = image.resize((18, 18), Image.NEAREST)
    small.resize((288, 288), Image.NEAREST).save(PREVIEWS / 'pod-icon-18x.png')
    bag = Image.open(BAG).convert('RGBA')
    comp = bag.copy()
    comp.alpha_composite(small, (7, 9))
    sheet = Image.new('RGBA', (2 * 256 + 36, 280), CREAM)
    sheet.alpha_composite(image.resize((256, 256), Image.NEAREST), (12, 12))
    sheet.alpha_composite(comp.resize((256, 256), Image.NEAREST), (280, 12))
    sheet.save(PREVIEWS / 'pod-icon-and-bag-8x.png')
    print('背包图预览写到', PREVIEWS)


def preview():
    PREVIEWS.mkdir(parents=True, exist_ok=True)
    images = [Image.open(ASSETS / (n + '.png')).convert('RGBA') for n in STAGES]

    # 6 倍横向对比
    pad, scale = 10, 6
    width = sum(im.width * scale for im in images) + pad * (len(images) + 1)
    height = 72 * scale + 2 * pad
    strip = Image.new('RGBA', (width, height), CREAM)
    x = pad
    for im in images:
        strip.alpha_composite(im.resize((48 * scale, 72 * scale), Image.NEAREST), (x, pad))
        x += 48 * scale + pad
    strip.save(PREVIEWS / 'stages-6x.png')

    # 2 倍实际尺寸
    row = Image.new('RGBA', (4 * 52, 76), CREAM)
    for i, im in enumerate(images):
        row.alpha_composite(im, (2 + i * 52, 2))
    row.resize((row.width * 2, row.height * 2), Image.NEAREST).save(PREVIEWS / 'stages-2x.png')
    row.save(PREVIEWS / 'stages-1x.png')

    # 32 像素地格缩略：按株幅缩进 30 像素内，脚点贴底
    cells = []
    for im in images:
        crop = im.crop(im.getbbox())
        scale2 = min(30 / crop.width, 30 / crop.height)
        w, h = max(1, round(crop.width * scale2)), max(1, round(crop.height * scale2))
        cell = Image.new('RGBA', (32, 32), CREAM)
        cell.alpha_composite(crop.resize((w, h), Image.NEAREST), ((32 - w) // 2, 30 - h))
        cells.append(cell.resize((128, 128), Image.NEAREST))
    sheet = Image.new('RGBA', (4 * 128 + 5 * 8, 144), (238, 221, 190, 255))
    for i, cell in enumerate(cells):
        sheet.alpha_composite(cell, (8 + i * 136, 8))
    sheet.save(PREVIEWS / 'tile-32-preview.png')
    print('预览写到', PREVIEWS)


if __name__ == '__main__':
    check()
    check_icon()
    preview()
    icon_preview()
