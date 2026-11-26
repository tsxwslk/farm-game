"""柳湾小白菜四期生长的校验与验收图。

运行：python3 prototype/pixel-farm/pak-choi-verify.py [--verify]
输入：prototype/pixel-farm/assets/pak-choi/01-sprout.png .. 04-mature.png
输出：output/art-previews/pak-choi/ 下的 4 倍图、实际尺寸图、与小萝卜的同场图

硬指标：
1. 四帧同画布 48×72，根部同为 (24,66)，接地是一整段而不是一个点；
2. 透明底，alpha 只有 0/255；色板锁定在固定 11 色内，不留孤立像素；
3. 四个阶段的高度与面积严格递增；
4. 相邻阶段的剪影交并比低于阈值，保证缩到 32 像素地格还能分辨；
5. 没有任何偏红的像素，且与小萝卜的剪影交并比低于阈值——不能读成带红根的萝卜。

背包图 32×32 另有四条：贴边即裁、构图居中、实体面积区间、亮叶柄与深绿外轮廓都要够量。
"""
from pathlib import Path
import sys
from PIL import Image

SIZE = (48, 72)
ANCHOR = (24, 66)
ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / 'assets' / 'pak-choi'
PREVIEWS = ROOT.parents[1] / 'output' / 'art-previews' / 'pak-choi'
STAGES = ('01-sprout', '02-seedling', '03-bulking', '04-mature')
ICON = '05-inventory'
ICON_SIZE = (32, 32)
ICON_PALE = '#EDF1DA'  # 背包图允许一档更亮的乳白，田间帧不用
RADISH = ROOT / 'assets' / 'cherry-radish' / '04-mature.png'

PALETTE = {
    '#22362C', '#2C4838', '#385C44', '#47764F',
    '#5F9159', '#7CAD68', '#9CCA7A',
    '#7E9580', '#9AB297', '#BCCFB0', '#D6E3C6',
}
ICON_PALETTE = PALETTE | {ICON_PALE}

# 相邻阶段剪影交并比上限（越小越容易分辨）
PALE_MIN = {'01-sprout': 4, '02-seedling': 9, '03-bulking': 12, '04-mature': 16}

IOU_ADJACENT = 0.86
IOU_RADISH = 0.62


def load(name):
    return Image.open(ASSETS / (name + '.png')).convert('RGBA')


def pixels_of(image):
    raw = image.tobytes()
    return [tuple(raw[i:i + 4]) for i in range(0, len(raw), 4)]


def mask(image):
    return {(x, y) for y in range(image.height) for x in range(image.width)
            if image.getpixel((x, y))[3]}


def iou(a, b):
    union = a | b
    return len(a & b) / len(union) if union else 0.0


def hex_of(px):
    return '#%02X%02X%02X' % px[:3]


def lum(px):
    return 0.299 * px[0] + 0.587 * px[1] + 0.114 * px[2]


def check_frame(name, failures):
    image = load(name)
    if image.size != SIZE:
        failures.append('%s: 画布应为 %s，实际 %s' % (name, SIZE, image.size))
        return None

    raw = pixels_of(image)
    pixels = [p for p in raw if p[3]]
    alphas = {p[3] for p in raw}
    if alphas - {0, 255}:
        failures.append('%s: alpha 出现中间值 %s' % (name, sorted(alphas - {0, 255})))

    bad = {hex_of(p) for p in pixels} - PALETTE
    if bad:
        failures.append('%s: 出现色板外的颜色 %s' % (name, sorted(bad)))

    solid = mask(image)
    rows = [y for _, y in solid]
    bottom = max(rows)
    if bottom != ANCHOR[1]:
        failures.append('%s: 最低像素行应为 %d，实际 %d' % (name, ANCHOR[1], bottom))
    if any(y > ANCHOR[1] for y in rows):
        failures.append('%s: 根部以下还有像素' % name)

    contact = sorted(x for x, y in solid if y == ANCHOR[1])
    widest = 0
    run = 0
    for x in range(min(contact), max(contact) + 2):
        run = run + 1 if x in contact else 0
        widest = max(widest, run)
    if widest < 4:
        failures.append('%s: 接地只有 %d 像素宽' % (name, widest))
    if ANCHOR[0] not in contact:
        failures.append('%s: 根部 (24,66) 不在接地段上' % name)

    # 孤立像素：上下左右都没有邻居
    for x, y in solid:
        neighbours = ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1))
        if not any(n in solid for n in neighbours):
            failures.append('%s: (%d,%d) 是孤立像素' % (name, x, y))
            break

    red = [p for p in pixels if p[0] >= 110 and p[0] - p[1] >= 35 and p[0] - p[2] >= 35]
    if red:
        failures.append('%s: 有 %d 个偏红像素，会读成萝卜红根' % (name, len(red)))

    pale = sum(1 for p in pixels if lum(p) >= 180)
    if pale < PALE_MIN[name]:
        failures.append('%s: 乳白叶柄不足（%d < %d 像素）' % (name, pale, PALE_MIN[name]))

    return image, solid, len(pixels)


def check_icon(failures):
    path = ASSETS / (ICON + '.png')
    if not path.exists():
        failures.append('%s: 缺文件' % ICON)
        return None
    image = Image.open(path).convert('RGBA')
    if image.size != ICON_SIZE:
        failures.append('%s: 画布应为 %s，实际 %s' % (ICON, ICON_SIZE, image.size))
        return image

    raw = pixels_of(image)
    pixels = [p for p in raw if p[3]]
    alphas = {p[3] for p in raw}
    if alphas - {0, 255}:
        failures.append('%s: alpha 出现中间值 %s' % (ICON, sorted(alphas - {0, 255})))

    bad = {hex_of(p) for p in pixels} - ICON_PALETTE
    if bad:
        failures.append('%s: 出现色板外的颜色 %s' % (ICON, sorted(bad)))

    left, top, right, bottom = image.getbbox()
    if left < 1 or top < 1 or right > ICON_SIZE[0] - 1 or bottom > ICON_SIZE[1] - 1:
        failures.append('%s: 贴边了（外轮廓会被裁），包围盒 %s' % (ICON, (left, top, right, bottom)))

    # 居中：包围盒中心离画布中心不超过 2 像素
    cx, cy = (left + right) / 2, (top + bottom) / 2
    if abs(cx - ICON_SIZE[0] / 2) > 2 or abs(cy - ICON_SIZE[1] / 2) > 2:
        failures.append('%s: 构图没居中（中心 %.1f,%.1f）' % (ICON, cx, cy))

    area = len(pixels)
    if not 380 <= area <= 640:
        failures.append('%s: 实体面积 %d 超出 380~640' % (ICON, area))

    # 亮叶柄与深绿外轮廓都必须够量
    bright = sum(1 for p in pixels if lum(p) >= 190)
    outline = sum(1 for p in pixels if lum(p) <= 55)
    if bright < 28:
        failures.append('%s: 亮叶柄只有 %d 像素，撑不起和深绿轮廓的对比' % (ICON, bright))
    if outline < 50:
        failures.append('%s: 深色外轮廓只有 %d 像素' % (ICON, outline))

    red = [p for p in pixels if p[0] >= 110 and p[0] - p[1] >= 35 and p[0] - p[2] >= 35]
    if red:
        failures.append('%s: 有 %d 个偏红像素，会读成萝卜' % (ICON, len(red)))

    solid = mask(image)
    for x, y in solid:
        if not any((x + dx, y + dy) in solid for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
            failures.append('%s: (%d,%d) 是孤立像素' % (ICON, x, y))
            break
    return image


def shrink(solid, factor=2):
    """按 factor 倍面积平均成 32 像素地格尺度的剪影，模拟缩看。"""
    small = set()
    for y in range(0, SIZE[1], factor):
        for x in range(0, SIZE[0], factor):
            cells = [(x + i, y + j) for i in range(factor) for j in range(factor)]
            hit = sum(1 for c in cells if c in solid)
            if hit * 2 >= len(cells):
                small.add((x // factor, y // factor))
    return small


def build_previews(images, icon=None):
    PREVIEWS.mkdir(parents=True, exist_ok=True)
    soil = (74, 58, 36, 255)

    scale = 4
    sheet = Image.new('RGBA', (len(STAGES) * SIZE[0] * scale + 40, SIZE[1] * scale + 20), (32, 35, 33, 255))
    for i, image in enumerate(images):
        pad = Image.new('RGBA', (SIZE[0] * scale, SIZE[1] * scale), soil)
        pad.alpha_composite(image.resize((SIZE[0] * scale, SIZE[1] * scale), Image.NEAREST))
        sheet.alpha_composite(pad, (10 + i * (SIZE[0] * scale + 10), 10))
    sheet.save(PREVIEWS / 'stages-4x.png')

    tile = Image.new('RGBA', (len(STAGES) * 58, 72), (44, 48, 42, 255))
    for i, image in enumerate(images):
        pad = Image.new('RGBA', (48, 72), soil)
        pad.alpha_composite(image, (0, 0))
        tile.alpha_composite(pad, (i * 58 + 5, 0))
    tile.resize((tile.width * 4, tile.height * 4), Image.NEAREST).save(PREVIEWS / 'stages-tile-4x.png')

    radish = Image.open(RADISH).convert('RGBA')
    compare = Image.new('RGBA', ((len(STAGES) + 1) * 60 + 10, 170), (44, 48, 42, 255))
    for i, image in enumerate(images):
        compare.alpha_composite(Image.new('RGBA', (48, 72), soil), (10 + i * 60, 8))
        compare.alpha_composite(image, (10 + i * 60, 8))
    compare.alpha_composite(Image.new('RGBA', (48, 72), soil), (10, 88))
    compare.alpha_composite(radish, (10, 88))
    if icon is not None:
        compare.alpha_composite(icon, (10 + len(STAGES) * 60, 88))
    compare.resize((compare.width * 3, compare.height * 3), Image.NEAREST).save(PREVIEWS / 'vs-radish-3x.png')


def main():
    failures = []
    images = []
    shapes = []
    for name in STAGES:
        got = check_frame(name, failures)
        if not got:
            continue
        image, solid, area = got
        images.append(image)
        shapes.append((name, solid, area, max(y for _, y in solid) - min(y for _, y in solid) + 1))

    if len(shapes) == len(STAGES):
        for prev, cur in zip(shapes, shapes[1:]):
            if cur[2] <= prev[2]:
                failures.append('%s: 面积没有比上一阶段大（%d ≤ %d）' % (cur[0], cur[2], prev[2]))
            if cur[3] <= prev[3]:
                failures.append('%s: 高度没有比上一阶段高（%d ≤ %d）' % (cur[0], cur[3], prev[3]))

        for i in range(len(shapes)):
            for j in range(i + 1, len(shapes)):
                score = iou(shapes[i][1], shapes[j][1])
                limit = IOU_ADJACENT if j == i + 1 else 0.94
                if score > limit:
                    failures.append('%s 与 %s 剪影太像（交并比 %.2f > %.2f）'
                                    % (shapes[i][0], shapes[j][0], score, limit))
                small = iou(shrink(shapes[i][1]), shrink(shapes[j][1]))
                if small > 0.90:
                    failures.append('%s 与 %s 缩到 32 像素后太像（%.2f）'
                                    % (shapes[i][0], shapes[j][0], small))

    if RADISH.exists() and shapes:
        radish = mask(Image.open(RADISH).convert('RGBA'))
        score = iou(shapes[-1][1], radish)
        if score > IOU_RADISH:
            failures.append('成熟期与小萝卜剪影太像（交并比 %.2f > %.2f）' % (score, IOU_RADISH))

    icon = check_icon(failures)

    if images:
        build_previews(images, icon)

    if failures:
        print('FAIL')
        for line in failures:
            print('  - ' + line)
        return 1
    print('OK  四期画布/根部/色板/阶段递进/与小萝卜区分、背包图尺寸/居中/亮柄与深绿轮廓 全部通过')
    return 0


if __name__ == '__main__':
    sys.exit(main())
