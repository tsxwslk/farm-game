#!/usr/bin/env python3
"""柳湾农舍院内的腌菜瓮 · 48×48 透明像素精灵。

短颈、鼓腹、收底。最宽处在肩部（28 像素），口径 26、底部收到 16——与并排的方形
木箱靠「竖长的曲线」与「扁平的方块」一眼分开。俯视微倾：口的外轮廓自己走一道弧，
最上一行是朝天的顶面（唯一取釉色的地方）；暗红封布盖在口上，下摆张在颈上，细麻绳
勒在布下摆之下把布束住。

左上受光：肩部一条不规则的暖亮釉面，右下压到暗棕。明暗阶梯
釉 158 → 受光 126 → 中间 96 → 暗面 70 → 轮廓 40。

地面投影不画，交给游戏按脚下位置绘制。

用法：
    python3 jar-generate.py            # 生成素材与检查图
    python3 jar-generate.py --verify   # 生成并校验，失败返回 1
"""
import json
import math
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'assets' / 'jar'
PREVIEWS = ROOT.parents[1] / 'output' / 'art-previews' / 'jar'

TILE = 48
CX = 24            # 中轴：每行 x 取 24-r .. 24+r-1，宽 2r，bbox 中心恒为 23.5
TOP = 6            # 口沿最上一行（最上面一行只作轮廓，口沿顶面在它下面一行）
BASE = 44          # 接地行
GT = 32            # 地面砖的源像素

# 逐行半宽。陶瓮是旋转体，正面轮廓就是一条连续曲线，所以这里用半宽剖面而不是
# 多边形顶点：每行 ±1 像素的步进本身就是这条曲线的像素表达。
# 口沿 6~11 是 26/26/26/26/24/22：顶上四行必须一样宽。描深会吃掉每行最外一列，
# 相邻两行的轮廓差一格，可见的底色就差两格，八倍下就是阶梯状的"耳"。
# 关键是**同一行的颜色必须是同一个档**——轮廓多出一列只会被描深吃掉，不会成"耳"；
# 真正会变成"耳"的，是那一列比顶面暗一档（陶身受光色），于是口沿两侧各墩着一块
# 暗橙。口部整块取釉色之后，轮廓的台阶就只剩弧。
# 颈 12~15（短颈，收到 20 宽）→ 肩 16~27（扩到 28 宽，最宽）→ 腹 28~43 收到 16 →
# 圈足 44 再收一档到 14。
PROFILE = {
    6: 13.0, 7: 13.0, 8: 13.0, 9: 13.0, 10: 12.0, 11: 11.0,
    12: 10.4, 13: 10.0, 14: 10.6,
    15: 11.2, 16: 12.0, 17: 12.8, 18: 13.5, 19: 13.9,
    20: 14.0, 21: 14.0, 22: 14.0, 23: 14.0, 24: 13.9,
    25: 13.7, 26: 13.6, 27: 13.4, 28: 13.2, 29: 13.0,
    30: 12.8, 31: 12.6, 32: 12.4, 33: 12.2, 34: 12.0,
    35: 11.8, 36: 11.5, 37: 11.2, 38: 10.9, 39: 10.6,
    40: 10.2, 41: 9.8, 42: 9.2, 43: 8.8, 44: 7.6,
}

# 口沿：顶面用一个「几乎占满整个口高」的扁椭圆。它必须压得这么扁——口只有 5 行，
# 椭圆要是按等比例画，顶行就只剩半个宽，椭圆两侧露出的大块陶色会读成帽子上的
# 两只耳朵，而不是一圈唇。现在椭圆在每行都紧贴轮廓，只在左右各留 1~2 像素薄唇，
# 顶面整块朝上、读作「宽口缸的一圈口沿」，中间再压一块布。
RIM_TOP, RIM_BOTTOM = TOP, 11
CLOTH_INSET = 2                           # 布面比口沿轮廓内缩的像素
CLOTH_ROWS = (8, 10)                      # 布面夹在口沿里（上留一行唇、下留一行前缘）
CLOTH_HEM = (12,)                         # 布的下摆：一行铺满口沿外缘
ROPE_Y = 13                               # 麻绳勒在布下摆之下，比布窄 2 像素

# 左肩的釉面：上窄下宽、底部拖出两道流痕。硬边单色块，不做渐变。
GLAZE_ROWS = (17, 27)      # 釉面覆盖的行
GLAZE_WIDTH = (3, 4.5)     # 宽度 = 下限 + 上限 × sin，两端收、中段最宽

PAL = {
    'glaze': '#D89050',      # 左上肩部的暖亮釉，兼作口沿顶面
    'clay_hi': '#B4703C',    # 陶身受光面
    'clay': '#8C5230',       # 陶身中间色
    'clay_sh': '#6A3B22',    # 右下暗棕
    'dark': '#40200E',       # 轮廓、瓮底
    'cloth_hi': '#A83C38',   # 封布受光的上缘
    'cloth': '#8B2E2C',      # 封布
    'cloth_sh': '#66201F',   # 封布暗面
    'rope': '#AE8850',       # 麻绳
    'rope_sh': '#7C5F30',    # 麻绳暗侧
}
NB4 = ((1, 0), (-1, 0), (0, 1), (0, -1))


def hex_rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) + (255,)


RGB = {k: hex_rgb(v) for k, v in PAL.items()}
BY_COLOR = {v: k for k, v in RGB.items()}


def lum(c):
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]


def radius(y):
    """半宽取整成像素数。宽度恒为 2r，左右对称，bbox 中心落在 23.5。"""
    return int(PROFILE[y] + 0.5)


def span(y):
    r = radius(y)
    return CX - r, CX + r - 1


def tone(x, y):
    """圆柱受光：一条竖直的明暗分界，加底部一段压沉。

    分界线必须竖直。跟着行宽归一化会让它随收腹往里拐、左肩受光被挤成三角；
    让纵向权重进主公式，分界线就成了一条斜切线，看起来像被斜着削掉一块。
    竖向的明暗只加在底部一小段，那是瓮底收进去的暗。
    """
    u = (x + 0.5 - CX) / 14.0
    lit = -0.92 * u + 0.24
    if y >= 38:
        lit -= (y - 37) / 7.0 * 0.42
    if 14 <= y <= 15:
        lit -= 0.24                        # 颈被布与绳压出的阴影
    if lit > 0.50:
        return 'clay_hi'
    if lit > -0.30:
        return 'clay'
    return 'clay_sh'


def cloth_tone(x, y):
    """布是软的：绷在唇口上的上缘受光，往下压进唇里就进不了光。"""
    if y <= CLOTH_ROWS[0]:
        return 'cloth_hi'
    if y >= CLOTH_ROWS[1] or x >= CX + 7:
        return 'cloth_sh'
    return 'cloth'


def build():
    im = Image.new('RGBA', (TILE, TILE), (0, 0, 0, 0))
    px = im.load()
    region = {}
    decor = set()

    # 1) 陶身：逐行铺满，明暗由 tone() 决定
    for y in range(TOP, BASE + 1):
        x0, x1 = span(y)
        for x in range(x0, x1 + 1):
            px[x, y] = RGB[tone(x, y)]
            region[(x, y)] = 'body'

    # 2) 口沿：只有最上面那圈是朝天的面，取最亮一档；再往下的左右外壁与前缘是竖
    #    直的面，降一档到陶身受光色。整圈都刷釉色时，前缘会从暗布与暗颈之间跳出来，
    #    在左右两端墩成两只亮橙的耳朵。
    for y in range(RIM_TOP, RIM_BOTTOM + 1):
        x0, x1 = span(y)
        k = 'glaze' if y == RIM_TOP + 1 else 'clay_hi'
        for x in range(x0, x1 + 1):
            px[x, y] = RGB[k]
            region[(x, y)] = 'rim'

    # 3) 封布：从顶面椭圆里再内缩一圈，四周都留出陶的唇，才不像直接扣了个盖子。
    #    下摆整行张在口沿外，比下面的麻绳宽 2 像素，读得出「布被勒住」。
    cloth = set()
    for y in range(CLOTH_ROWS[0], CLOTH_ROWS[1] + 1):
        x0, x1 = span(y)
        for x in range(x0 + CLOTH_INSET, x1 - CLOTH_INSET + 1):
            cloth.add((x, y))
    # 下摆：布裹在颈上、边垂过口沿
    for y in CLOTH_HEM:
        x0, x1 = span(y)
        for x in range(x0 + 3, x1 - 2):
            cloth.add((x, y))
    for (x, y) in cloth:
        px[x, y] = RGB[cloth_tone(x, y)]
        region[(x, y)] = 'cloth'

    # 4) 麻绳：一圈勒在颈上，中间两像素往下坠一格——绳束紧了才会下垂，
    #    画成一条直横线就成了腰带。
    x0, x1 = span(ROPE_Y)
    for x in range(x0 + 2, x1 - 1):
        px[x, ROPE_Y] = RGB['rope']
        region[(x, ROPE_Y)] = 'rope'
    # 绳的下垂段压暗一档：只画一条亮横线，绳会变成一道腰带
    for x in range(CX - 3, CX + 3):
        if region.get((x, ROPE_Y + 1)) == 'body':
            px[x, ROPE_Y + 1] = RGB['rope_sh']
            region[(x, ROPE_Y + 1)] = 'rope'

    # 5) 左肩釉面：贴着左轮廓的纺锤形，两端收中段宽
    lo, hi = GLAZE_ROWS
    for y in range(lo, hi + 1):
        r = radius(y)
        x0 = CX - r + 1
        w = GLAZE_WIDTH[0] + int(GLAZE_WIDTH[1] * math.sin((y - lo + 1) / (hi - lo + 2) * math.pi))
        for x in range(x0, x0 + w + 1):
            if region.get((x, y)) == 'body':
                px[x, y] = RGB['glaze']
                region[(x, y)] = 'glaze'
                decor.add((x, y))

    # 6) 轮廓：所有与透明相邻的像素取最深一档，不额外描黑边
    solid = {(x, y) for y in range(TILE) for x in range(TILE) if px[x, y][3]}
    edge = set()
    for (x, y) in solid:
        if any((x + dx, y + dy) not in solid for dx, dy in NB4):
            edge.add((x, y))
            px[x, y] = RGB['dark']
            region[(x, y)] = 'edge'
    return im, region, solid, edge, decor


def report(im, region, solid, edge, decor):
    px = im.load()
    counts = {}
    for y in range(TILE):
        for x in range(TILE):
            c = px[x, y]
            if c[3]:
                counts[c] = counts.get(c, 0) + 1

    reg = {}
    for p, name in region.items():
        reg.setdefault(name, set()).add(p)

    xs = [p[0] for p in solid]
    ys = [p[1] for p in solid]
    box = [min(xs), min(ys), max(xs), max(ys)]

    widths = {y: len(range(*span(y)[:1], span(y)[1] + 1)) for y in range(TOP, BASE + 1)}
    widest = max(widths.values())
    widest_rows = [y for y, w in widths.items() if w == widest]
    bottom = widths[BASE]

    # 明暗阶梯按色阶统计：陶身三档都在 body 这一个区域里，按区域算只会拿到同一个均值
    tone_px = {}
    for p in solid:
        if p in edge:
            continue
        k = BY_COLOR.get(px[p])
        if k:
            tone_px.setdefault(k, []).append(lum(px[p][:3]))
    mean = {k: round(sum(v) / len(v), 1) for k, v in tone_px.items()}

    last = max(ys)
    row = sorted(p[0] for p in solid if p[1] == last)
    runs, start = [], row[0]
    for a, b in zip(row, row[1:] + [None]):
        if b != a + 1:
            runs.append((start, a))
            start = b

    # 左右受光差：只统计陶身（不含釉面），否则釉块单独把左边拉亮
    body = [p for p in reg.get('body', ()) if p not in edge]
    left = [lum(px[p][:3]) for p in body if p[0] < CX]
    right = [lum(px[p][:3]) for p in body if p[0] >= CX]

    glaze = reg.get('glaze', set())
    cloth = reg.get('cloth', set())

    return {
        'file': 'assets/jar/jar-crock-48x48.png',
        'size': [TILE, TILE],
        'palette': PAL,
        'palette_locked': all(c in RGB.values() for c in counts),
        'unused_tones': [k for k, v in RGB.items() if v not in counts],
        'bbox': box,
        'bbox_size': [box[2] - box[0] + 1, box[3] - box[1] + 1],
        'center_offset': round((box[0] + box[2]) / 2 - (TILE - 1) / 2, 1),
        'anchor': [(box[0] + box[2] + 1) // 2, last],
        'margin': {'top': box[1], 'bottom': TILE - 1 - last,
                   'left': box[0], 'right': TILE - 1 - box[2]},
        'area': len(solid),
        'widths': {str(y): w for y, w in widths.items()},
        'widest': {'width': widest, 'rows': widest_rows},
        'bottom_width': bottom,
        'shoulder_ratio': round(widest / bottom, 2),
        'aspect': round((box[3] - box[1] + 1) / (box[2] - box[0] + 1), 2),
        'region_pixels': {k: len(v) for k, v in reg.items()},
        'face_lum': mean,
        'side_lum': {'left': round(sum(left) / max(1, len(left)), 1),
                     'right': round(sum(right) / max(1, len(right)), 1)},
        'glaze_centroid': [round(sum(p[0] for p in glaze) / max(1, len(glaze)), 1),
                           round(sum(p[1] for p in glaze) / max(1, len(glaze)), 1)],
        'cloth_centroid': [round(sum(p[0] for p in cloth) / max(1, len(cloth)), 1),
                           round(sum(p[1] for p in cloth) / max(1, len(cloth)), 1)],
        'cloth_redness': RGB['cloth'][0] - max(RGB['cloth'][1], RGB['cloth'][2]),
        'detail_pixels': len(decor),
        'contact': {'row': last, 'runs': [list(r) for r in runs],
                    'pixels': len(row)},
        'alpha_values': sorted({px[x, y][3] for y in range(TILE) for x in range(TILE)}),
    }


def scales(im):
    """1×、2×、4× 并排：游戏里看到的是 1×，细节必须在这个尺寸站得住。"""
    pad = 12
    canvas = Image.new('RGBA', (TILE * 7 + pad * 4, TILE * 4 + pad * 2), (247, 242, 232, 255))
    x = pad
    for sc in (1, 2, 4):
        put = im if sc == 1 else im.resize((TILE * sc, TILE * sc), Image.NEAREST)
        canvas.alpha_composite(put, (x, pad + TILE * 4 - put.height))
        x += put.width + pad
    canvas.save(PREVIEWS / 'jar-scales.png', optimize=True)


def rim(im):
    """口部 16 倍裁切。口只有五六行，「顶面 / 布 / 唇壁」三层在 8 倍下还看不清——
    这套素材里唯一反复返工的地方就是口，单独留一张裁切图验收。"""
    crop = im.crop((8, TOP - 2, 40, 16))
    canvas = Image.new('RGBA', crop.size, (247, 242, 232, 255))
    canvas.alpha_composite(crop)
    canvas.resize((crop.width * 16, crop.height * 16), Image.NEAREST).save(
        PREVIEWS / 'jar-rim-16x.png', optimize=True)


def grounds(im):
    """落地：草地、裸土、干耕地。格底对齐，让圈足压在砖上。"""
    gw, gh, pad = 2, 2, 10
    cell = gw * GT
    canvas = Image.new('RGBA', (cell * 3 + pad * 4, cell + pad * 2), (246, 240, 228, 255))
    for gi, (sub, stem) in enumerate((('grass', 'grass-lawn'),
                                      ('soil', 'soil-bare'),
                                      ('tilled', 'tilled-dry'))):
        g = Image.new('RGBA', (cell, cell))
        for i in range(gw):
            for j in range(gh):
                f = ROOT / 'assets' / sub / f'{stem}-{(i * 3 + j) % 4}.png'
                if f.exists():
                    g.paste(Image.open(f), (i * GT, j * GT))
        x = pad + gi * (cell + pad)
        canvas.paste(g, (x, pad))
        canvas.alpha_composite(im, (x + (cell - TILE) // 2, pad + cell - TILE))
    canvas = canvas.resize((canvas.width * 2, canvas.height * 2), Image.NEAREST)
    canvas.save(PREVIEWS / 'jar-grounds.png', optimize=True)


def field(im):
    """与木箱并排，4 倍：两件同场，看轮廓能不能分开。

    画布先按 1 倍拼好再整体放大——先放大再摆精灵会把坐标乘两次，木箱就落到格子外。
    """
    cell, pad, sc = 64, 10, 4
    w, h = cell * 2 + pad * 3, cell + pad * 2
    canvas = Image.new('RGBA', (w, h), (246, 240, 228, 255))
    for gi in range(2):
        g = Image.new('RGBA', (cell, cell))
        for i in range(cell // GT):
            for j in range(cell // GT):
                f = ROOT / 'assets' / 'grass' / f'grass-lawn-{(i * 3 + j) % 4}.png'
                if f.exists():
                    g.paste(Image.open(f), (i * GT, j * GT))
        canvas.paste(g, (pad + gi * (cell + pad), pad))
    for gi, path in enumerate((OUT / 'jar-crock-48x48.png',
                               ROOT / 'assets' / 'crate' / 'crate-harvest-48x48.png')):
        if not path.exists():
            continue
        canvas.alpha_composite(Image.open(path),
                               (pad + gi * (cell + pad) + (cell - TILE) // 2,
                                pad + cell - TILE))
    canvas = canvas.resize((w * sc, h * sc), Image.NEAREST)
    canvas.save(PREVIEWS / 'jar-field-4x.png', optimize=True)


def main():
    verify = '--verify' in sys.argv
    OUT.mkdir(parents=True, exist_ok=True)
    PREVIEWS.mkdir(parents=True, exist_ok=True)
    im, region, solid, edge, decor = build()
    im.save(OUT / 'jar-crock-48x48.png', optimize=True)
    im.resize((TILE * 8, TILE * 8), Image.NEAREST).save(
        PREVIEWS / 'jar-8x.png', optimize=True)
    scales(im)
    rim(im)
    grounds(im)
    field(im)

    info = report(im, region, solid, edge, decor)
    problems = []
    if not info['palette_locked']:
        problems.append('出现色板之外的像素')
    if info['unused_tones']:
        problems.append(f"色板里有没用上的色：{info['unused_tones']}")
    if info['alpha_values'] != [0, 255]:
        problems.append(f"出现半透明像素：{info['alpha_values']}")
    if len(info['contact']['runs']) != 1 or info['contact']['pixels'] < 12:
        problems.append(f"接地不成立：{len(info['contact']['runs'])} 段、"
                        f"{info['contact']['pixels']} 像素")
    w, h = info['bbox_size']
    if not 26 <= w <= 30:
        problems.append(f'瓮身宽 {w}，不在 26~30')
    if h < 36:
        problems.append(f'整件高 {h}，比木箱高出不到 6 像素，轮廓分不开')
    if info['anchor'] != [24, 44]:
        problems.append(f"锚点 {info['anchor']}，应为 (24, 44)")
    widths = list(info['widths'].values())
    if info['widest']['width'] - min(widths) < 12:
        problems.append(f"宽度只差 {info['widest']['width'] - min(widths)}，轮廓不够曲")
    if not all(18 <= y <= 30 for y in info['widest']['rows']):
        problems.append(f"最宽行在 {info['widest']['rows']}，不在肩部 18~30")
    if info['bottom_width'] > info['widest']['width'] * 0.62:
        problems.append(f"底宽 {info['bottom_width']} 对最宽 {info['widest']['width']}，"
                        f'收底不够')
    for a, b, need in (('glaze', 'clay_hi', 15), ('clay_hi', 'clay', 15),
                       ('clay', 'clay_sh', 15), ('clay_sh', 'dark', 15)):
        gap = info['face_lum'].get(a, 0) - info['face_lum'].get(b, 0)
        if gap < need:
            problems.append(f'明暗阶梯 {a}>{b} 只有 {gap:.1f}，要 ≥{need}')
    if info['side_lum']['left'] - info['side_lum']['right'] < 12:
        problems.append(f"左侧 {info['side_lum']['left']} 与右侧 "
                        f"{info['side_lum']['right']} 差得不够，读不出左上受光")
    gx, gy = info['glaze_centroid']
    if gx > 22 or gy > 30:
        problems.append(f'釉面重心 ({gx}, {gy})，不在左上肩部')
    if not 0.05 <= info['region_pixels'].get('glaze', 0) / info['area'] <= 0.32:
        problems.append(f"釉面占 {info['region_pixels'].get('glaze', 0) / info['area']:.2f}，"
                        f'应在 5%~32%')
    if info['region_pixels'].get('cloth', 0) < 40:
        problems.append(f"封布只有 {info['region_pixels'].get('cloth', 0)} 像素")
    if info['cloth_centroid'][1] > 13:
        problems.append(f"封布重心在 y={info['cloth_centroid'][1]}，不在瓮口")
    if info['cloth_redness'] < 30:
        problems.append(f"封布不够红：R 比 G/B 高出 {info['cloth_redness']}")
    if info['region_pixels'].get('rope', 0) < 12:
        problems.append(f"麻绳只有 {info['region_pixels'].get('rope', 0)} 像素")
    # 口沿最上面四行必须等宽：描深会吃掉每行最外一列，相邻两行差一格、可见底色就差
    # 两格，八倍下是一道台阶，读成帽子上的两只耳朵。
    rim_rows = [info['widths'][str(y)] for y in range(TOP, TOP + 4)]
    if len(set(rim_rows)) != 1:
        problems.append(f'口沿最上面四行宽度 {rim_rows} 不齐，描深后会成台阶')
    if info['region_pixels'].get('rim', 0) < 30:
        problems.append(f"口沿只有 {info['region_pixels'].get('rim', 0)} 像素，"
                        f'顶面与唇壁太薄')

    manifest = {
        'sprite': info,
        'structure': {
            'canvas': f'{TILE}×{TILE}，透明底',
            'shape': '宽口、短颈、鼓腹、收底；口径 26、肩部 28 最宽、圈足 16',
            'rows': {'rim': [TOP, 11], 'cloth_hem': CLOTH_HEM[0], 'rope': ROPE_Y,
                     'neck': [14, 15], 'shoulder': [16, 26], 'belly': [27, 43],
                     'foot': BASE},
            'rim': {'rows': [RIM_TOP, RIM_BOTTOM], 'inset': CLOTH_INSET},
            'cloth_face': {'rows': list(CLOTH_ROWS), 'inset': CLOTH_INSET},
            'glaze': f'左肩 y{GLAZE_ROWS[0]}~{GLAZE_ROWS[1]} 贴着左轮廓的纺锤形',
        },
        'checks': problems or ['全部通过'],
    }
    (OUT / 'jar-manifest.json').write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')

    print(f"bbox={info['bbox']} size={info['bbox_size']} area={info['area']} "
          f"aspect={info['aspect']}")
    print('widest', info['widest'], 'bottom', info['bottom_width'],
          'shoulder_ratio', info['shoulder_ratio'])
    print('face_lum', info['face_lum'])
    print('side_lum', info['side_lum'])
    print('regions', info['region_pixels'], 'glaze@', info['glaze_centroid'])
    print('contact', info['contact'])
    if verify:
        if problems:
            print('校验失败：')
            for p in problems:
                print(' -', p)
            return 1
        print('校验通过')
    return 0


if __name__ == '__main__':
    sys.exit(main())
