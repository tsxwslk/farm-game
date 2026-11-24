#!/usr/bin/env python3
"""柳湾木制收获箱 · 48×48 透明像素精灵（主视图）。

正面正对镜头、左右严格对称；固定俯视微倾，顶面在正面之上沿纵深收分露出。
不画侧立面——主视图里没有侧面，立体感由明暗阶梯、盖板厚度与顶面收分交代。
左上受光：顶面最亮、盖板正立面次亮、箱体正面中间色、盖沿下与箱底最深。
先铺大色块交代盖板厚度、箱体与底脚，再用少量像素补木纹与钉点。
地面投影不画，交给游戏按脚下位置绘制。

用法：
    python3 crate-generate.py            # 生成素材与检查图
    python3 crate-generate.py --verify   # 生成并校验，失败返回 1
"""
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'assets' / 'crate'
PREVIEWS = ROOT.parents[1] / 'output' / 'art-previews' / 'crate'

TILE = 48
W = 32                 # 正面宽，取偶数才能与画布中心严格对齐
D = 5                  # 顶面进深行数
TAPER = 2              # 顶面后沿每侧收进像素，左右对称收分
H_LID = 3              # 盖板正立面厚度
H_BODY = 17            # 箱体正面高
FOOT_H = 3
FOOT_W = 5
FOOT_BOTTOM = 44       # 底脚最后一行的 y，下留 3 像素

X0 = (TILE - W) // 2                          # 8，左右各留 8
YB = FOOT_BOTTOM - FOOT_H                     # 箱体底边所在行 41
BODY_TOP = YB + 1 - H_BODY                    # 箱体正面第一行 25
R_UNDER = BODY_TOP - 1                        # 盖沿下阴影行 24
R_LID0 = R_UNDER - H_LID                      # 盖板正立面首行 21
R_CREASE = R_LID0 - 1                         # 顶面与盖沿的折线 20
YF = R_CREASE - 1                             # 顶面前沿 19
YTOP = YF - (D - 1)                           # 顶面最后一排
SEAMS = (BODY_TOP + 5, BODY_TOP + 11)         # 两道板缝

PAL = {
    'top': '#E4AF71',      # 顶面，受光最亮
    'top_hi': '#F5CB95',   # 顶面木纹亮笔
    'lid': '#CD9152',      # 盖板正立面薄边
    'grain': '#C4874B',    # 正面木纹亮笔，比盖板低半档，不与盖板混读
    'front': '#B37843',    # 箱体正面，中间色
    'seam': '#7D5027',     # 板缝、板端，兼作背光侧的一点重量
    'foot': '#613C1B',     # 底脚
    'dark': '#4A2A10',     # 轮廓、盖沿下、箱底、钉点
}


def hex_rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) + (255,)


RGB = {k: hex_rgb(v) for k, v in PAL.items()}


def rand(seed, i):
    """整数哈希 -> [0,1)，跨平台一致。"""
    x = (i * 374761393 + seed * 668265263) & 0xFFFFFFFF
    x = (x ^ (x >> 13)) * 1274126177 & 0xFFFFFFFF
    return ((x ^ (x >> 16)) & 0xFFFFFF) / 0xFFFFFF


def taper(k):
    """第 k 排（0 = 顶面前沿）每侧的收进量。0/1/1/2/2，单调不回头。"""
    return (k * TAPER + D - 2) // (D - 1)


def faces():
    """按面切出像素集合。顶面逐排向里收，左右对称，不产生侧立面。

    行序自上而下：顶面 YTOP..YF、折线 R_CREASE、盖板正立面 R_LID0..R_UNDER-1、
    盖沿下阴影 R_UNDER、箱体 BODY_TOP..YB、底脚。折线一行把「水平的顶面」
    与「竖直的盖沿」切成两个面，少这一行两者会连成一条八行高的亮带。
    """
    top, lid, shadow, front, foot = {}, {}, {}, {}, {}
    for k in range(D):
        y = YF - k
        ins = taper(k)
        for x in range(X0 + ins, X0 + W - ins):
            top[(x, y)] = ins
    for y in range(R_LID0, R_UNDER):
        for x in range(X0, X0 + W):
            lid[(x, y)] = True
    shadow = {(x, R_UNDER) for x in range(X0, X0 + W)}
    for y in range(BODY_TOP, YB + 1):
        for x in range(X0, X0 + W):
            front[(x, y)] = True
    for y in range(YB + 1, YB + 1 + FOOT_H):
        for x0 in (X0 + 2, X0 + W - 2 - FOOT_W):
            for x in range(x0, x0 + FOOT_W):
                foot[(x, y)] = True
    return top, lid, shadow, front, foot


def build(seed=20261124):
    top, lid, shadow, front, foot = faces()
    im = Image.new('RGBA', (TILE, TILE), (0, 0, 0, 0))
    px = im.load()
    decor = set()

    for p in top:
        px[p] = RGB['top']
    for p in lid:
        px[p] = RGB['lid']
    for x in range(X0, X0 + W):        # 折线：水平顶面与竖直盖沿的分界
        px[x, R_CREASE] = RGB['dark']
    for p in shadow:                   # 盖沿下阴影
        px[p] = RGB['dark']
    for p in front:
        px[p] = RGB['front']
    for p in foot:
        px[p] = RGB['foot']

    # 盖板顶面：两条顺进深的板缝，跟着收分往里走，两端在盖沿上对齐
    for k in range(D):
        y = YF - k
        ins = taper(k)
        w = W - 2 * ins
        for f in (8, 20):
            off = int(f * w / W + 0.5)
            if 0 < off < w - 1:
                px[X0 + ins + off, y] = RGB['seam']
                decor.add((X0 + ins + off, y))
    # 顶面木纹：三笔短亮划，落在三块板上
    for f, k in ((3, 2), (14, 3), (26, 1)):
        y = YF - k
        ins = taper(k)
        w = W - 2 * ins
        x0 = X0 + ins + int(f * w / W + 0.5)
        for i in range(2):
            p = (x0 + i, y)
            if px[p] == RGB['top']:
                px[p] = RGB['top_hi']
                decor.add(p)

    # 盖板正立面：每块板的板端竖一道，与顶面板缝对齐
    for f in (8, 20):
        for y in range(R_LID0, R_UNDER):
            if px[X0 + f, y] == RGB['lid']:
                px[X0 + f, y] = RGB['grain']
                decor.add((X0 + f, y))

    # 箱体正面：两道断续板缝，缝间留断口，不做成一条硬线
    for j, sy in enumerate(SEAMS):
        x = X0 + 1 + int(rand(seed + 2, j) * 4)
        while x < X0 + W - 1:
            run = 6 + int(rand(seed + 3, j * 7 + x) * 6)
            for i in range(run):
                if x + i < X0 + W - 1 and px[x + i, sy] == RGB['front']:
                    px[x + i, sy] = RGB['seam']
                    decor.add((x + i, sy))
            x += run + 2 + int(rand(seed + 4, j * 7 + x) * 3)

    # 每块板两道木纹亮笔：短、横、落在板内，避开板缝与左右轮廓
    boards = ((BODY_TOP, SEAMS[0] - 1), (SEAMS[0] + 1, SEAMS[1] - 1),
              (SEAMS[1] + 1, YB - 1))
    for j, (y0, y1) in enumerate(boards):
        for q in range(2):
            n = 2 + int(rand(seed + 5, j * 3 + q) * 2)
            off = 2 + int(rand(seed + 6, j * 3 + q) * (W - 6 - n))
            y = y0 + 1 + int(rand(seed + 7, j * 3 + q) * max(1, y1 - y0 - 1))
            for i in range(n):
                x = X0 + off + i
                if px[x, y] == RGB['front']:
                    px[x, y] = RGB['grain']
                    decor.add((x, y))

    # 箱体底边压一行深色，读作箱底厚度，也让底脚从箱体上分出来
    for x in range(X0, X0 + W):
        px[x, YB] = RGB['dark']

    # 轮廓：所有与透明相邻的像素取材质最深一档，不描黑边
    solid = {(x, y) for y in range(TILE) for x in range(TILE) if px[x, y][3]}
    edge = set()
    for (x, y) in solid:
        if any((x + dx, y + dy) not in solid
               for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
            edge.add((x, y))
            px[x, y] = RGB['dark']
    return im, {'top': top, 'lid': lid, 'shadow': shadow,
                'front': front, 'foot': foot}, solid, edge, decor


def lum(c):
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]


def report(im, regions, solid, edge, decor):
    px = im.load()
    counts = {}
    for y in range(TILE):
        for x in range(TILE):
            c = px[x, y]
            if c[3]:
                counts[c] = counts.get(c, 0) + 1
    xs = [p[0] for p in solid]
    ys = [p[1] for p in solid]
    box = [min(xs), min(ys), max(xs), max(ys)]

    # 各面均值只统计面内像素，轮廓那一圈是共用的深色，不参与比较
    mean = {}
    for name, reg in regions.items():
        vals = [lum(px[p][:3]) for p in reg if px[p][3] and p not in edge]
        mean[name] = round(sum(vals) / len(vals), 1) if vals else 0.0

    # 接地：最低一行必须全部是底脚，且分成两段
    last = max(ys)
    row = sorted(p[0] for p in solid if p[1] == last)
    runs, start = [], row[0]
    for a, b in zip(row, row[1:] + [None]):
        if b != a + 1:
            runs.append((start, a))
            start = b
    contact = [c for seg in runs for c in range(seg[0], seg[1] + 1)]

    # 轮廓闭合：与透明相邻的全是 dark
    outline_bad = [p for p in solid
                   if any((p[0] + dx, p[1] + dy) not in solid
                          for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
                   and px[p] != RGB['dark']]
    # 透明度：底必须全透明，且不出现半透明像素
    alphas = {px[x, y][3] for y in range(TILE) for x in range(TILE)}
    # 孤立像素
    lone = [p for p in solid
            if not any((p[0] + dx, p[1] + dy) in solid
                       for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))]
    # 主视图判据：轮廓必须左右镜像自洽，侧立面一出现就会破坏它
    mirror_bad = [p for p in solid if (TILE - 1 - p[0], p[1]) not in solid]

    return {
        'file': 'assets/crate/crate-harvest-48x48.png',
        'size': [TILE, TILE],
        'palette': PAL,
        'palette_locked': sorted(counts) == sorted(RGB.values()),
        'bbox': box,
        'bbox_size': [box[2] - box[0] + 1, box[3] - box[1] + 1],
        'center_offset': round((box[0] + box[2]) / 2 - (TILE - 1) / 2, 1),
        'anchor': [(box[0] + box[2] + 1) // 2, last],
        'margin': {'top': box[1], 'bottom': TILE - 1 - last,
                   'left': box[0], 'right': TILE - 1 - box[2]},
        'area': len(solid),
        'detail_pixels': len(decor),
        'detail_ratio': round(len(decor) / len(solid), 4),
        'face_lum': mean,
        'top_widths': [W - 2 * taper(k) for k in range(D)],
        'contact': {'row': last, 'runs': [list(r) for r in runs],
                    'pixels': len(contact)},
        'outline_breaks': len(outline_bad),
        'lone_pixels': len(lone),
        'mirror_breaks': len(mirror_bad),
        'alpha_values': sorted(alphas),
        'transparent_pixels': sum(1 for y in range(TILE) for x in range(TILE) if not px[x, y][3]),
    }


def preview(im):
    """验收图：四格同为 4 倍（游戏里的实际观感），浅底一件 + 草地、干耕地、湿耕地各一件。"""
    gt = 32                                # 地面砖的源像素
    cell, pad = gt * 6, 12                 # 192 = 6 块地砖，铺满不留缝
    w = cell * 4 + pad * 5
    h = cell + pad * 3 + TILE * 2
    canvas = Image.new('RGBA', (w, h), (246, 240, 228, 255))
    canvas.paste(Image.new('RGBA', (cell, cell), (250, 246, 238, 255)), (pad, pad))
    put = im.resize((TILE * 4, TILE * 4), Image.NEAREST)

    def stand(x, y):
        """脚底接地行对齐到格子内留 12 像素地面。"""
        canvas.alpha_composite(put, (x + (cell - put.width) // 2,
                                     y + cell - 12 - (FOOT_BOTTOM + 1) * 4))

    stand(pad, pad)
    grounds = [
        [ROOT / 'assets' / 'grass' / f'grass-lawn-{i}.png' for i in range(4)],
        [ROOT / 'assets' / 'tilled' / f'tilled-dry-{i}.png' for i in range(4)],
        [ROOT / 'assets' / 'tilled' / f'tilled-wet-{i}.png' for i in range(4)],
    ]
    for gi, paths in enumerate(grounds):
        if not paths[0].exists():
            continue
        x = pad * 2 + cell * (gi + 1)
        ground = Image.new('RGBA', (cell, cell))
        for i in range(cell // gt):
            for j in range(cell // gt):
                ground.paste(Image.open(paths[(i * 3 + j) % 4]), (i * gt, j * gt))
        canvas.paste(ground, (x, pad))
        stand(x, pad)

    y0 = pad * 2 + cell
    step = TILE * 2 + 6
    for i, k in enumerate(PAL):
        canvas.paste(Image.new('RGBA', (TILE * 2, TILE * 2), RGB[k]), (pad + i * step, y0))
    return canvas


def main():
    verify = '--verify' in sys.argv
    OUT.mkdir(parents=True, exist_ok=True)
    PREVIEWS.mkdir(parents=True, exist_ok=True)
    im, regions, solid, edge, decor = build()
    im.save(OUT / 'crate-harvest-48x48.png', optimize=True)
    im.resize((TILE * 8, TILE * 8), Image.NEAREST).save(
        PREVIEWS / 'crate-harvest-8x.png', optimize=True)
    preview(im).save(PREVIEWS / 'crate-harvest-preview.png', optimize=True)

    info = report(im, regions, solid, edge, decor)
    problems = []
    if not info['palette_locked']:
        problems.append('出现色板之外的像素')
    if info['outline_breaks']:
        problems.append(f"轮廓有 {info['outline_breaks']} 处未取深色")
    if info['alpha_values'] != [0, 255]:
        problems.append(f"出现半透明像素：{info['alpha_values']}")
    if info['lone_pixels']:
        problems.append(f"有 {info['lone_pixels']} 个孤立像素")
    if abs(info['center_offset']) > 0.5:
        problems.append(f"水平未居中，偏移 {info['center_offset']}")
    if info['mirror_breaks']:
        problems.append(f"轮廓不是左右对称，有 {info['mirror_breaks']} 个像素对不上")
    if info['contact']['pixels'] < 6 or len(info['contact']['runs']) != 2:
        problems.append(
            f"接地不成立：{len(info['contact']['runs'])} 段、{info['contact']['pixels']} 像素")
    for a, b in zip(('top', 'lid', 'front'), ('lid', 'front', 'foot')):
        gap = info['face_lum'][a] - info['face_lum'][b]
        if gap < 8:
            problems.append(f"明暗阶梯 {a}>{b} 只有 {gap:.1f}")
    if not 0.02 <= info['detail_ratio'] <= 0.12:
        problems.append(f"木纹占比 {info['detail_ratio']} 超出 2%~12%")

    manifest = {
        'sprite': info,
        'structure': {
            'canvas': f'{TILE}×{TILE}，透明底',
            'view': '主视图：正面正对镜头，左右对称，无侧立面',
            'front_width': W, 'depth_rows': D, 'taper_per_side': TAPER,
            'lid_thickness': H_LID, 'body_height': H_BODY, 'foot': [FOOT_W, FOOT_H],
            'rows': {'top_face': [YTOP, YF], 'crease': R_CREASE,
                     'lid_edge': [R_LID0, R_UNDER - 1],
                     'under_lid': R_UNDER, 'body': [BODY_TOP, YB],
                     'feet': [YB + 1, FOOT_BOTTOM]},
            'plank_seams': list(SEAMS),
        },
        'checks': problems or ['全部通过'],
    }
    (OUT / 'crate-manifest.json').write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')

    print(f"bbox={info['bbox']} size={info['bbox_size']} area={info['area']} "
          f"detail={info['detail_pixels']} ({info['detail_ratio']})")
    print('face_lum', info['face_lum'])
    print('top_widths', info['top_widths'], 'mirror_breaks', info['mirror_breaks'])
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
