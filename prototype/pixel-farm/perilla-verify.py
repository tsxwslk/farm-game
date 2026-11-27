"""柳湾紫苏四期生长的校验与验收图。

运行：python3 prototype/pixel-farm/perilla-verify.py
输入：prototype/pixel-farm/assets/perilla/01-sprout.png … 04-mature.png
输出：output/art-previews/perilla/ 下的 4 倍图与实际尺寸图

硬指标：
1. 四帧同画布 48×72，根部同为 (24,66)，接地是一整段（4~24 像素宽，含 24 号列）；
2. 透明底、alpha 只有 0/255；色板锁定在 11 色内，不留孤立像素；
3. 四阶段的面积与高度严格递增；
4. 剪影左右镜像交并比 ≥ 0.72 —— 对生叶必须成对镜像，这是它和互生叶菜（芥菜一类）的分界；
5. 通体偏紫：r 大于 g 的像素占比 ≥ 95%，且没有明显偏绿的像素；
6. 子叶期要有淡紫（亮值 ≥ 140），成熟期要有少量灰紫（#B08F9C）。
"""
from pathlib import Path
import sys
from PIL import Image

SIZE = (48, 72)
ANCHOR = (24, 66)
ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / 'assets' / 'perilla'
PREVIEWS = ROOT.parents[1] / 'output' / 'art-previews' / 'perilla'
STAGES = ('01-sprout', '02-seedling', '03-bulking', '04-mature')
ICON = '05-inventory'
ICON_SIZE = (32, 32)
# 背包图另用的一套：正面深李紫、背面灰紫（比田间的叶再多一点明度）
ICON_EXTRA = {
    '#55303C', '#6B3A48', '#864853', '#A05A63', '#B87A7E',
    '#88707A', '#9F8892', '#B5A0A9',
}

PALETTE = {
    '#342329', '#3E2631', '#4E2E3B', '#4E3038', '#64404A',
    '#744050', '#7A505A', '#95525E', '#B06A70', '#B08F9C', '#C0A5B2',
}
GREY = '#B08F9C'

ICON_PALETTE = PALETTE | ICON_EXTRA
BAG = ROOT / 'assets' / 'seed-bags' / 'base-32x32.png'

IOU_ADJACENT = 0.88
IOU_FAR = 0.96
# 画布宽 48、轴线落在 x=24 这个像素中心上，镜像轴则是 23.5，
# 所以完全对称也只能到 0.78~0.86；互生叶菜会掉到 0.6 以下，阈值取 0.72 仍能分开。
MIRROR_MIN = 0.72


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
    bottom = max(y for _, y in solid)
    if bottom != ANCHOR[1]:
        failures.append('%s: 最低像素行应为 %d，实际 %d' % (name, ANCHOR[1], bottom))

    contact = sorted(x for x, y in solid if y == ANCHOR[1])
    if not contact or ANCHOR[0] not in contact:
        failures.append('%s: 根部 (24,66) 不在接地行上' % name)
    elif not 4 <= len(contact) <= 24:
        failures.append('%s: 接地宽度 %d 像素，超出 4~24' % (name, len(contact)))

    purple = sum(1 for p in pixels if p[0] > p[1])
    if purple / len(pixels) < 0.95:
        failures.append('%s: 偏紫像素只占 %.0f%%' % (name, purple / len(pixels) * 100))
    greenish = [p for p in pixels if p[1] > p[0] + 6]
    if greenish:
        failures.append('%s: 有 %d 个明显偏绿的像素' % (name, len(greenish)))

    for x, y in solid:
        if not any((x + dx, y + dy) in solid for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
            failures.append('%s: (%d,%d) 是孤立像素' % (name, x, y))
            break

    mirrored = {(SIZE[0] - 1 - x, y) for x, y in solid}
    return {
        'name': name, 'solid': solid, 'pixels': pixels,
        'area': len(pixels),
        'height': bottom - min(y for _, y in solid) + 1,
        'mirror': iou(solid, mirrored),
    }


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
    margins = (left, top, ICON_SIZE[0] - right, ICON_SIZE[1] - bottom)
    if min(margins) < 1:
        failures.append('%s: 贴边了（外轮廓会被裁），边距 %s' % (ICON, margins))
    elif min(margins) > 5:
        failures.append('%s: 留边 %s 太宽，图案偏小' % (ICON, margins))

    cx, cy = (left + right) / 2, (top + bottom) / 2
    if abs(cx - ICON_SIZE[0] / 2) > 2 or abs(cy - ICON_SIZE[1] / 2) > 2:
        failures.append('%s: 构图没居中（中心 %.1f,%.1f）' % (ICON, cx, cy))

    area = len(pixels)
    if not 300 <= area <= 520:
        failures.append('%s: 实体面积 %d 超出 300~520' % (ICON, area))

    pale = sum(1 for p in pixels if lum(p) >= 130)
    plum = sum(1 for p in pixels if 70 <= lum(p) < 125 and p[0] > p[1])
    if pale < 50:
        failures.append('%s: 灰紫背面只有 %d 像素，翻面那一叶读不出来' % (ICON, pale))
    if plum < 90:
        failures.append('%s: 李紫正面只有 %d 像素' % (ICON, plum))

    solid = mask(image)
    for x, y in solid:
        if not any((x + dx, y + dy) in solid for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
            failures.append('%s: (%d,%d) 是孤立像素' % (ICON, x, y))
            break

    # 缩到 18×18：叠在种子袋正面时的可辨认度
    small = image.resize((18, 18), Image.NEAREST)
    small_px = [p for p in pixels_of(small) if p[3]]
    box = small.getbbox()
    if len(small_px) < 90:
        failures.append('%s: 缩到 18×18 只剩 %d 像素，太小' % (ICON, len(small_px)))
    if box[2] - box[0] < 12 or box[3] - box[1] < 12:
        failures.append('%s: 缩到 18×18 只剩 %dx%d' % (ICON, box[2] - box[0], box[3] - box[1]))
    light = sum(1 for p in small_px if lum(p) >= 130)
    dark = sum(1 for p in small_px if lum(p) < 100)
    if light < 15 or dark < 30:
        failures.append('%s: 缩到 18×18 后正反两面色仍能分开（亮 %d / 暗 %d）' % (ICON, light, dark))
    return image


def build_previews(images, icon=None):
    PREVIEWS.mkdir(parents=True, exist_ok=True)
    soil = (74, 58, 36, 255)

    scale = 4
    sheet = Image.new('RGBA', (len(images) * SIZE[0] * scale + 50, SIZE[1] * scale + 20), (32, 35, 33, 255))
    for i, image in enumerate(images):
        pad = Image.new('RGBA', (SIZE[0] * scale, SIZE[1] * scale), soil)
        pad.alpha_composite(image.resize((SIZE[0] * scale, SIZE[1] * scale), Image.NEAREST))
        sheet.alpha_composite(pad, (10 + i * (SIZE[0] * scale + 10), 10))
    sheet.save(PREVIEWS / 'stages-4x.png')

    tile = Image.new('RGBA', (len(images) * 58, 72), (44, 48, 42, 255))
    for i, image in enumerate(images):
        pad = Image.new('RGBA', (48, 72), soil)
        pad.alpha_composite(image, (0, 0))
        tile.alpha_composite(pad, (i * 58 + 5, 0))
    tile.resize((tile.width * 4, tile.height * 4), Image.NEAREST).save(PREVIEWS / 'stages-tile-4x.png')

    # 背包图：32 倍放大 + 缩到 18×18 叠在通用种子袋正面
    if icon is not None:
        icon.resize((32 * 8, 32 * 8), Image.NEAREST).save(PREVIEWS / 'inventory-8x.png')
        if BAG.exists():
            bag = Image.open(BAG).convert('RGBA')
            front = bag.copy()
            front.alpha_composite(icon.resize((18, 18), Image.NEAREST), (7, 7))
            out = Image.new('RGBA', (2 * 40 + 10, 52), (44, 48, 42, 255))
            for i, layer in enumerate((bag, front)):
                out.alpha_composite(Image.new('RGBA', (32, 32), soil), (10 + i * 40, 10))
                out.alpha_composite(layer, (10 + i * 40, 10))
            out.resize((out.width * 6, out.height * 6), Image.NEAREST).save(PREVIEWS / 'bag-18x.png')

    # 同框对照：紫苏成熟帧与芥菜成熟帧并排，验「对生宽卵叶 + 紫褐轮廓」能不能一眼分开
    mustard = ROOT / 'assets' / 'mustard' / '04-mature.png'
    if mustard.exists():
        other = Image.open(mustard).convert('RGBA')
        compare = Image.new('RGBA', (2 * 60 + 10, 92), (40, 44, 38, 255))
        for i, image in enumerate((other, images[-1])):
            compare.alpha_composite(Image.new('RGBA', (48, 72), soil), (10 + i * 60, 10))
            compare.alpha_composite(image, (10 + i * 60, 10))
        compare.resize((compare.width * 4, compare.height * 4), Image.NEAREST).save(PREVIEWS / 'vs-mustard-4x.png')


def main():
    failures = []
    frames = []
    for name in STAGES:
        got = check_frame(name, failures)
        if got:
            frames.append(got)

    if len(frames) == len(STAGES):
        for prev, cur in zip(frames, frames[1:]):
            if cur['area'] <= prev['area']:
                failures.append('%s: 面积没有比上一阶段大（%d ≤ %d）' % (cur['name'], cur['area'], prev['area']))
            if cur['height'] <= prev['height']:
                failures.append('%s: 高度没有比上一阶段高（%d ≤ %d）' % (cur['name'], cur['height'], prev['height']))

        for i in range(len(frames)):
            for j in range(i + 1, len(frames)):
                score = iou(frames[i]['solid'], frames[j]['solid'])
                limit = IOU_ADJACENT if j == i + 1 else IOU_FAR
                if score > limit:
                    failures.append('%s 与 %s 剪影太像（交并比 %.2f > %.2f）'
                                    % (frames[i]['name'], frames[j]['name'], score, limit))

        for frame in frames:
            if frame['mirror'] < MIRROR_MIN:
                failures.append('%s: 左右镜像交并比 %.2f < %.2f，看不出对生'
                                % (frame['name'], frame['mirror'], MIRROR_MIN))

        sprout = frames[0]
        pale = sum(1 for p in sprout['pixels'] if lum(p) >= 140)
        if pale < 8:
            failures.append('%s: 淡紫只有 %d 像素' % (sprout['name'], pale))

        mature = frames[-1]
        grey = sum(1 for p in mature['pixels'] if hex_of(p) == GREY)
        if grey < 6:
            failures.append('%s: 灰紫受光只有 %d 像素' % (mature['name'], grey))

    icon = check_icon(failures)

    if frames:
        build_previews([load(f['name']) for f in frames], icon)

    if failures:
        print('FAIL')
        for line in failures:
            print('  - ' + line)
        return 1
    print('OK  四期田间帧与 32×32 背包图（含 18×18 缩略）全部通过')
    return 0


if __name__ == '__main__':
    sys.exit(main())
