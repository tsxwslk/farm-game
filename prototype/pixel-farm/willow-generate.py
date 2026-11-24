#!/usr/bin/env python3
"""柳湾河岸垂柳 · 96×128 透明像素精灵。

垂柳的识别度在柳条，不在叶体——实拍柳树的剪影就是一缕一缕的。所以这个精灵是
「叶体当底、柳条当形」，五遍画完：

1) 叶体。十片叶瓣的并集，横长一块，只提供体量与受光：上色是到光源 (30,32) 的
   径向四档 + 5 像素间距的叶簇盘。冠顶不描最深色（描了就是一条灌木边），下缘按
   t² 概率溶解——柳条从这个化开的边里长出去，叶体就没有可读的「底边」。
2) 后层柳条。从叶体上沿出生，最长，露在叶体外的部分就是剪影。
3) 树干。中心线 + 逐行半宽，y=122 着地，低处向左偏再回来，y=88 分三杈。
4) 中层与前层柳条。压在冠面上，给出纵向纹理。
5) 顶端叶簇 + 补针孔。

柳条的画法：1 像素主枝 + 受光侧常驻一格、背光侧每四行鼓一格；正弦摆动 0.4~2.6 格，
沿全长缓缓向外飘，末端九行再披散。左上偏黄绿、右下压到深青绿，体积全靠这条梯度。

用法：
    python3 willow-generate.py            # 生成素材与检查图
    python3 willow-generate.py --verify   # 生成并校验，失败返回 1
"""
import json
import math
import sys
from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent
PREVIEWS = ROOT.parents[1] / 'output' / 'art-previews' / 'willow'

W, H = 96, 128
YBOT = 122             # 接地行，下方留 5 行余量
GT = 32                # 地面砖源像素

# 叶六档，明度 194/165/127/94/68/47，相邻落差都在 20 以上，缩到一倍仍分得开。
LEAF = {
    'hi': '#BFD46A',       # 向阳叶团核心
    'lit': '#9BBB4C',      # 暖黄绿，向阳叶团主色
    'olive': '#6F9440',    # 橄榄绿，内层
    'deep': '#4A7038',     # 前后枝叶重叠处
    'shade': '#33522C',    # 冠内最深的暗部、柳条背后的体块
    'line': '#22381F',     # 整冠外轮廓
}
LEV = ('l:shade', 'l:deep', 'l:olive', 'l:lit', 'l:hi')
LADR = ('l:shade', 'l:deep', 'l:olive', 'l:lit', 'l:hi')

# 树皮：冷于暖金土，才不会和裸土连成一片橙。
BARK = {
    'hi': '#7E674E',
    'mid': '#6B5340',
    'dark': '#4C3A2B',
    'line': '#33251A',
}

# 主干：(中心 x, y, 半宽)。底端 48 起、y=92 偏到 45，五像素的偏移在 96 宽上读得出
# 「低处略弯」，又不会扭成 S 形。
TRUNK = (
    (48, 122, 3), (48, 116, 3), (47, 110, 3), (46, 104, 3),
    (46, 96, 3), (45, 92, 2), (45, 88, 2),
)

# 分叉点落在 y=88，正好在冠底之下：三杈根部露在外面看得到「向上分出两三枝」，
# 往上几像素就钻进叶子，冠里不会再出现一根贯穿的主干。
LIMBS = (
    ((45, 88, 1), (37, 78, 1), (31, 70, 0.5), (28, 64, 0.5)),
    ((45, 88, 1), (53, 78, 1), (59, 70, 0.5), (63, 64, 0.5)),
    ((45, 88, 1), (45, 76, 0.5), (46, 64, 0.5)),
)

NB8 = ((-1, -1), (0, -1), (1, -1), (-1, 0), (1, 0), (-1, 1), (0, 1), (1, 1))
NB4 = ((-1, 0), (1, 0), (0, -1), (0, 1))


def hex_rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) + (255,)


def pal_rgb(pal):
    return {k: hex_rgb(v) for k, v in pal.items()}


def lum(c):
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]


def rand(seed, i):
    """整数哈希 -> [0,1)，跨平台一致。"""
    x = (i * 374761393 + seed * 668265263) & 0xFFFFFFFF
    x = (x ^ (x >> 13)) * 1274126177 & 0xFFFFFFFF
    return ((x ^ (x >> 16)) & 0xFFFFFF) / 0xFFFFFF


def blank():
    return [[False] * W for _ in range(H)]


def mask_of(poly, w=W, h=H):
    """多边形扫描填充：按像素中心采样，斜边自然落成台阶。"""
    m = [[False] * w for _ in range(h)]
    for y in range(h):
        yc = y + 0.5
        xs = []
        for (x1, y1), (x2, y2) in zip(poly, poly[1:] + poly[:1]):
            if (y1 <= yc < y2) or (y2 <= yc < y1):
                xs.append(x1 + (yc - y1) * (x2 - x1) / (y2 - y1))
        xs.sort()
        for a, b in zip(xs[0::2], xs[1::2]):
            for x in range(math.ceil(a - 0.5), math.floor(b - 0.5) + 1):
                if 0 <= x < w:
                    m[y][x] = True
    return m


def depth_of(m, w=W, h=H):
    """每个内部像素到形状外部的 8 邻步数：1 就是最外一圈。"""
    inside = {(x, y) for y in range(h) for x in range(w) if m[y][x]}
    dep = {}
    q = deque()
    for p in inside:
        if any((p[0] + dx, p[1] + dy) not in inside for dx, dy in NB8):
            dep[p] = 1
            q.append(p)
    while q:
        x, y = q.popleft()
        for dx, dy in NB8:
            q2 = (x + dx, y + dy)
            if q2 in inside and q2 not in dep:
                dep[q2] = dep[(x, y)] + 1
                q.append(q2)
    return dep


# ---------------------------------------------------------------- 肩线

def cap_at(cap, x):
    y = cap.get(max(0, min(W - 1, int(round(x)))), H)
    return 60.0 if y >= H else float(y)


# ---------------------------------------------------------------- 树干与枝杈

def limb_mask(pts):
    """把 (x, y, 半宽) 折线逐行填成柱体。

    枝杈都纵向生长，按行取中心 x 与半宽做线性插值就够；斜边的台阶由半宽按行量化
    自动产生，横向去采样反而会在拐弯处漏一行。
    """
    m = blank()
    spans = {}
    for (x1, y1, w1), (x2, y2, w2) in zip(pts, pts[1:]):
        n = abs(y2 - y1)
        if not n:
            spans.setdefault(y1, (x1, w1))
            continue
        for i in range(n + 1):
            t = i / n
            y = round(y1 + (y2 - y1) * t)
            spans[y] = (x1 + (x2 - x1) * t, w1 + (w2 - w1) * t)
    for y, (cx, hw) in spans.items():
        if not 0 <= y < H:
            continue
        for x in range(round(cx - hw), round(cx + hw) + 1):
            if 0 <= x < W:
                m[y][x] = True
    return m


def build_bark(seed):
    """主干 + 三杈。返回 (逐像素色键, 掩码)。"""
    px, m = {}, blank()
    for lm in [limb_mask(l) for l in LIMBS]:      # 枝先画
        for y in range(H):
            for x in range(W):
                m[y][x] = m[y][x] or lm[y][x]
    trunk = limb_mask(TRUNK)                      # 主干压住枝根，接口才干净
    for y in range(H):
        for x in range(W):
            m[y][x] = m[y][x] or trunk[y][x]

    # 逐行按水平位置分档：左两列受光、中间主色、右两列压深，最外一圈最深。
    # 用行内相对位置而不是绝对 x，弯的那几段才不会半张脸亮半张脸暗。
    for y in range(H):
        xs = [x for x in range(W) if m[y][x]]
        if not xs:
            continue
        lo, hi = min(xs), max(xs)
        n = hi - lo + 1
        for x in xs:
            i = x - lo
            if n <= 3:
                tone = 'mid'
            elif i == 0 or i == n - 1:
                tone = 'line'
            elif i <= max(1, n // 3 - 1):
                tone = 'hi'
            elif i >= n - 2:
                tone = 'dark'
            else:
                tone = 'mid'
            px[(x, y)] = f'k:{tone}'

    # 纵向长裂：隔几行点一截 2~4 像素的深色竖纹，只落在中间调上。
    for y in range(H - 6, 62, -1):
        if rand(seed, y) < 0.40:
            continue
        xs = [x for x in range(W) if m[y][x]]
        if len(xs) < 5:
            continue
        x = xs[2 + int(rand(seed + 7, y) * (len(xs) - 4))]
        for dy in range(2 + int(rand(seed + 13, y) * 3)):
            if px.get((x, y + dy)) == 'k:mid':
                px[(x, y + dy)] = 'k:dark'
    return px, m


# ---------------------------------------------------------------- 冠体

def clump_poly(cx, cy, rx, ry, rot, seed, n=20):
    """叶团轮廓：椭圆上取十六个顶点，半径各带一点抖动。

    抖得太狠会戳出尖刺读成荆棘；0.90~1.08 只是让边不规整，配合像素化的台阶，
    边缘自然成一小簇一小簇的样子。
    """
    pts = []
    for k in range(n):
        a = 2 * math.pi * k / n + rot
        j = 0.88 + 0.20 * rand(seed, k * 7)
        pts.append((cx + rx * j * math.cos(a), cy + ry * j * math.sin(a)))
    return pts


def fill_holes(m, owner):
    """把不与画布边缘连通的透明区填实。

    叶团是按各自的椭圆摆的，重叠不足的地方会在冠中间留下锯齿状的透空孔——放大后
    像几道闪电，比任何明暗问题都抢眼。冠内部必须是实心的，只允许边缘有缺口。
    """
    outside = blank()
    q = deque()
    for x in range(W):
        for y in (0, H - 1):
            if not m[y][x] and not outside[y][x]:
                outside[y][x] = True
                q.append((x, y))
    for y in range(H):
        for x in (0, W - 1):
            if not m[y][x] and not outside[y][x]:
                outside[y][x] = True
                q.append((x, y))
    while q:
        x, y = q.popleft()
        for dx, dy in NB4:
            nx, ny = x + dx, y + dy
            if 0 <= nx < W and 0 <= ny < H and not m[ny][nx] and not outside[ny][nx]:
                outside[ny][nx] = True
                q.append((nx, ny))

    holes = [(x, y) for y in range(H) for x in range(W)
             if not m[y][x] and not outside[y][x]]
    for x, y in holes:
        m[y][x] = True
        for dx, dy in NB4:                       # 填上的像素跟着邻居认领一个叶团
            nx, ny = x + dx, y + dy
            if 0 <= nx < W and 0 <= ny < H and owner[ny][nx] >= 0:
                owner[y][x] = owner[ny][nx]
                break
    return len(holes)


def seal_notches(m, owner, rounds=3):
    """把三面被围住的透明点填上。

    fill_holes 只补封闭的空腔，可冠边缘常有 1~2 像素宽的斜缝一路通到外面——放大后
    就是一道白裂口。这里按邻居计数封掉这种凹口，大开口（真正的叶隙）留三面以下不填。
    """
    filled = 0
    for _ in range(rounds):
        add = []
        for y in range(1, H - 1):
            for x in range(1, W - 1):
                if m[y][x]:
                    continue
                n = sum(1 for dx, dy in NB8 if m[y + dy][x + dx])
                if n >= 5:
                    add.append((x, y))
        for x, y in add:
            m[y][x] = True
            for dx, dy in NB4:
                if owner[y + dy][x + dx] >= 0:
                    owner[y][x] = owner[y + dy][x + dx]
                    break
        filled += len(add)
    return filled


def canopy_lobes(seed):
    """叶瓣：(cx, cy, rx, ry)。十片互相叠三到五成，并集的外缘就有六七个起伏。

    一片 27 半径的大团会把并集撑成单一大圆弧——那正是「圆润」的来源。十片中团
    错开摆，两肩向外撑、两垂肩往下坠，轮廓才不是一顶帽子。
    """
    base = (
        (18, 52, 11, 12),   # 左肩，向外撑
        (32, 40, 13, 12),
        (48, 34, 14, 11),   # 冠顶
        (64, 40, 13, 12),
        (79, 52, 11, 12),   # 右肩
        (14, 64, 9, 11),    # 左垂肩
        (83, 65, 9, 11),    # 右垂肩
        (35, 58, 12, 12),
        (60, 59, 12, 12),
        (48, 66, 12, 9),    # 冠底
    )
    out = []
    for i, (cx, cy, rx, ry) in enumerate(base):
        out.append((cx + (rand(seed + 501, i) - 0.5) * 3,
                    cy + (rand(seed + 503, i) - 0.5) * 3,
                    rx + (rand(seed + 505, i) - 0.5) * 2,
                    ry + (rand(seed + 507, i) - 0.5) * 2,
                    (rand(seed + 509, i) - 0.5) * 0.5))
    return out


def build_crown(seed):
    """叶体：十片叶瓣的并集，下缘溶解。返回 (色键, 掩码, 每列最上沿)。"""
    union = blank()
    for ci, (cx, cy, rx, ry, rot) in enumerate(canopy_lobes(seed)):
        m = mask_of(clump_poly(cx, cy, rx, ry, rot, seed + ci * 31))
        for y in range(H):
            for x in range(W):
                if m[y][x]:
                    union[y][x] = True
    # 只补封闭空腔与三面凹口，不做过头的收边：叶瓣之间的缺口是轮廓的一部分
    fill_holes(union, [[0] * W for _ in range(H)])
    seal_notches(union, [[0] * W for _ in range(H)], rounds=1)

    top = {x: (min([y for y in range(H) if union[y][x]]) if any(union[y][x] for y in range(H)) else H)
           for x in range(W)}

    # 边缘梳齿溶解：外圈按列化开。整片叶子描出来的边一定是硬的、圆的；实拍柳冠的
    # 剪影是一缕一缕的——所以每列独立决定要不要吃掉外圈，吃掉的列就是一道缝，
    # 旁边的列留下一条垂下的叶缕，柳条再从这些缝里穿出去。
    dep0 = depth_of(union)
    for (x, y), d in dep0.items():
        if y <= top[x] + 8 or y < 46:       # 冠顶与上半不梳，交给叶簇
            continue
        deep = 4 + int(rand(seed + 441, x) * 5)
        if d <= deep and rand(seed + 443, x * 31 + y * 7) < (deep - d + 1) / (deep + 2.0) * 0.92:
            union[y][x] = False
    # 下缘再溶解一轮：越靠下越稀，柳条从这个化开的边里长出去
    for x in range(W):
        col = [y for y in range(H) if union[y][x]]
        if not col:
            continue
        bot = max(col)
        for y in range(bot - 10, bot + 1):
            t = (y - (bot - 10)) / 10.0
            if rand(seed + 331, x * 97 + y * 7) < t * t * 0.68:
                union[y][x] = False

    top = {}
    for x in range(W):
        col = [y for y in range(H) if union[y][x]]
        top[x] = min(col) if col else H
    dep = depth_of(union)

    # 冠内明度：到光源 (30,32) 的径向四档。径向一铺，右侧和底部自然压下去。
    lv = {}
    for (x, y) in dep:
        dist = math.hypot((x - 30) * 0.86, (y - 32) * 1.05)
        lv[(x, y)] = 3 if dist < 24 else (2 if dist < 40 else (1 if dist < 58 else 0))

    # 叶簇盘：半径 2~4、整盘平涂、上下浮动一档，间距 5。盘与盘之间靠色差分层，
    # 读起来是一簇一簇的叶子；2×2 噪声是棋盘格，纯横向分档是三层蛋糕。
    step = 5
    for gy in range(16, 84, step):
        for gx in range(0, W, step):
            cx = gx + int(rand(seed + 403, gx * 13 + gy * 61) * step)
            cy = gy + int(rand(seed + 409, gx * 7 + gy * 23) * step)
            r = 2 + int(rand(seed + 419, gx * 3 + gy * 11) * 3)
            if dep.get((cx, cy), 0) < 3:
                continue
            base = lv[(cx, cy)]
            h = rand(seed + 401, gx * 31 + gy * 977)
            if h < 0.26:
                base -= 1
            elif h > 0.76:
                base += 1
            if base >= 4 and math.hypot((cx - 30) * 0.86, (cy - 32) * 1.05) > 34:
                base = 3
            base = max(0, min(4, base))
            for yy in range(cy - r, cy + r + 1):
                for xx in range(cx - r, cx + r + 1):
                    if (xx - cx) ** 2 + (yy - cy) ** 2 > r * r + 0.5:
                        continue
                    if dep.get((xx, yy), 0) >= 3:
                        lv[(xx, yy)] = base

    px = {}
    for (x, y), d in dep.items():
        v = lv[(x, y)]
        if d == 1:
            # 冠顶那一圈不描最深，描了就是一条清晰的灌木边
            if y <= top[x] + 6:
                px[(x, y)] = LEV[max(0, min(4, v - 1))]
            else:
                px[(x, y)] = 'l:line'
        elif d == 2:
            px[(x, y)] = LEV[max(0, min(4, v - 1))]
        else:
            px[(x, y)] = LEV[max(0, min(4, v))]
    return px, union, top


# ---------------------------------------------------------------- 柳条

def tufts(top, seed):
    """肩线上冒头的叶簇：半径 2~4 的小圆盘压在叶体上沿。

    冠顶不能是一条光滑的弧——实拍柳冠的顶缘全是毛茬。这几撮叶和柳条的梢头一起，
    把弧线咬成一排小起伏。
    """
    out = []
    for i, x in enumerate(range(9, 88, 4)):
        if rand(seed + 831, i) < 0.20:
            continue
        cx = x + int((rand(seed + 833, i) - 0.5) * 4)
        if top.get(cx, H) >= H:
            continue
        cy = int(cap_at(top, cx)) - 1 + int(rand(seed + 837, i) * 4)
        r = 2 + int(rand(seed + 839, i) * 2)
        out.append((cx, cy, r, tone_at(cx, cy, seed, cx * 5, -0.16)))
    return out


def draw_tufts(px, list_):
    for cx, cy, r, tone in list_:
        for yy in range(cy - r, cy + r + 1):
            for xx in range(cx - r, cx + r + 1):
                if (xx - cx) ** 2 + (yy - cy) ** 2 > r * r + 0.5:
                    continue
                if 0 <= xx < W and 0 <= yy < H:
                    px[(xx, yy)] = 'l:olive' if yy <= cy - r + 1 else tone


def plug(px, rounds=2):
    """补掉被围住的 1 像素透空。

    柳条之间剩下的针孔在 8 倍下是一堆白点，比任何明暗问题都抢眼；真正的叶隙是
    成片的，不会被这一步补上。
    """
    for _ in range(rounds):
        add = []
        for y in range(1, H - 1):
            for x in range(1, W - 1):
                if (x, y) in px:
                    continue
                nb = [px[(x + dx, y + dy)] for dx, dy in NB8 if (x + dx, y + dy) in px]
                if len(nb) >= 6:
                    add.append((x, y, nb[0]))
        for x, y, k in add:
            px[(x, y)] = k
    # 孤立点直接删：柳条外飘时偶尔会甩出一格，放大后是一颗浮着的绿点
    for (x, y) in [p for p in px
                   if not any((p[0] + dx, p[1] + dy) in px for dx, dy in NB8)]:
        del px[(x, y)]
    return len(add)


def tone_at(x, y0, seed, i, bias=0.0):
    """按位置给色：左上偏黄绿，右下压到深青绿，随机量把同色的枝条打散。

    柳条的体积全靠这条梯度——全都一个色，帘子就是刷墙。
    """
    t = ((y0 - 18) / 66.0) * 0.54 + ((x - 30) / 48.0) * 0.24
    t += (rand(seed + 907, i) - 0.5) * 0.50 + bias
    if t < 0.06:
        return 'l:lit'
    if t < 0.40:
        return 'l:olive'
    if t < 0.74:
        return 'l:deep'
    return 'l:shade'


# 三层柳条：(名称, 出生偏移下, 出生偏移上, 最短, 最长, 摆幅下, 摆幅上, 色偏, 步距, 随机步, 盐)
# 出生高度与长度错开，三层的梢头才会散布在 y50~y112 之间——梢头一集中在同一高度，
# 就是一条「叶体与帘子」的分界线，整棵树立刻变成蘑菇。
STRAND_LAYERS = (
    ('back', -3, 3, 74, 112, 1.6, 3.6, 0.18, 3, 2, 0),
    ('mid', 6, 16, 52, 98, 1.2, 3.0, 0.06, 4, 2, 511),
    ('front', -1, 8, 26, 74, 0.6, 2.4, -0.34, 7, 3, 977),
)


def strand_band(cap, seed, spec):
    """生成一层柳条：[(x0, y0, 长度, 色键, 摆幅, 周期, 相位, 披散方向)]。"""
    _, off_lo, off_hi, lo, hi, amp_lo, amp_hi, bias, step, rstep, salt = spec
    out, x = [], 7
    while x < W - 7:
        y0 = int(max(3, cap_at(cap, x) + off_lo + rand(seed + 11 + salt, x) * (off_hi - off_lo)))
        ln = lo + (hi - lo) * rand(seed + 13 + salt, x * 3)
        ln *= 0.86 + 0.34 * rand(seed + 17 + salt, x * 5)
        ln = int(ln)
        if 47 <= x <= 49:                          # 主干正前：只留一条窄槽
            ln = min(ln, max(10, 100 - y0))
        elif 44 <= x <= 52:                        # 分叉两侧：帘子压到分叉以下
            ln = min(ln, max(10, 88 - y0))
        lim = 90 + int(rand(seed + 301 + salt, x) * 24)   # 末端高低错开，不齐底
        ln = int(max(9, min(ln, lim - y0)))
        if ln >= 9:
            splay = (-1.0 if x < 48 else 1.0) * (0.4 + rand(seed + 29 + salt, x) * 1.0)
            out.append((x, y0, ln, tone_at(x, y0, seed, x, bias),
                        amp_lo + (amp_hi - amp_lo) * rand(seed + 19 + salt, x),
                        18 + int(rand(seed + 23 + salt, x) * 20),
                        int(rand(seed + 27 + salt, x) * 16),
                        splay))
            if rand(seed + 37 + salt, x) < 0.38:      # 成束：旁边再补一根短的
                ln2 = max(9, int(ln * (0.45 + rand(seed + 41 + salt, x) * 0.4)))
                out.append((x + 1, y0 + 2, ln2, tone_at(x + 1, y0 + 2, seed, x + 7, bias + 0.08),
                            0.6 + rand(seed + 43 + salt, x) * 1.2,
                            16 + int(rand(seed + 47 + salt, x) * 14),
                            int(rand(seed + 53 + salt, x) * 12),
                            splay * 0.6))
        x += step + int(rand(seed + 31 + salt, x) * rstep)
    return out


def draw_strands(px, list_):
    """柳条 = 1 像素主枝 + 单侧交替的叶齿。

    实心两像素的色条读起来是挂面；柳条要「中间一条细枝、边上挂一串叶」，轮廓毛糙
    才有垂柳味。末端八行向外披散，一束束散开而不是齐齐剪断。
    """
    for x0, y0, ln, tone, amp, per, phase, splay in list_:
        k = LADR.index(tone)
        lit_side = LADR[min(4, k + 1)]
        dark_side = LADR[max(0, k - 1)]
        for i in range(ln):
            yy = y0 + i
            if yy >= H:
                break
            bow = splay * 0.055 * i                 # 一路向外飘
            f = 0.0
            if ln > 18 and i > ln - 9:
                f = ((i - (ln - 9)) / 9.0) ** 1.7   # 末端再披散开
            x = max(0, min(W - 1, x0 + round(
                amp * math.sin((i + phase) / per * 2 * math.pi) + bow + splay * f)))
            px[(x, yy)] = tone                          # 主枝
            if i < ln - 3:
                # 受光侧常驻一格，背光侧每四行鼓一格：柳条是两像素宽的带子，不是
                # 一条线。只有单像素线加零星叶齿，缩到八倍看就是一片虚线噪点。
                if 0 <= x - 1 < W:
                    px[(x - 1, yy)] = lit_side
                if i % 4 == 2 and 0 <= x + 1 < W:
                    px[(x + 1, yy)] = dark_side


# ---------------------------------------------------------------- 渲染

def render(px, lpal, kpal):
    """键带前缀：l: 走叶色板，k: 走树皮色板（两套都有 dark/line，会串色）。"""
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    out = im.load()
    for (x, y), key in px.items():
        if not (0 <= x < W and 0 <= y < H):
            continue
        kind, tone = key.split(':')
        out[x, y] = lpal[tone] if kind == 'l' else kpal[tone]
    return im


def stats(im, crown_m):
    pxx = im.load()
    solid = {(x, y) for y in range(H) for x in range(W) if pxx[x, y][3]}
    leaf = {(x, y) for (x, y) in solid if pxx[x, y][1] > pxx[x, y][0]}
    bark = solid - leaf
    crown = {(x, y) for y in range(H) for x in range(W) if crown_m[y][x]}

    xs = [p[0] for p in solid]
    ys = [p[1] for p in solid]
    box = [min(xs), min(ys), max(xs), max(ys)]
    cx = [p[0] for p in crown]
    cy = [p[1] for p in crown]
    cbox = [min(cx), min(cy), max(cx), max(cy)]

    last = max(ys)
    row = sorted(p[0] for p in solid if p[1] == last)
    runs, start = [], row[0]
    for a, b in zip(row, row[1:] + [None]):
        if b != a + 1:
            runs.append((start, a))
            start = b

    # 主干中线：从接地行往上数连续树皮行，量「树干透出多少」
    midx = (row[0] + row[-1]) // 2
    seen, y = 0, YBOT
    while y >= 0 and any((midx + dx, y) in bark for dx in (-1, 0, 1)):
        seen += 1
        y -= 1

    # 中缝：树干区域 y 40~86 里的树皮像素（柳条帘之间应该看得见分叉）
    window = sum(1 for p in bark if 42 <= p[0] <= 54 and 40 <= p[1] <= 86)

    bottoms = {}
    for x in range(W):
        col = [y for y in range(H) if (x, y) in solid]
        if col:
            bottoms[x] = max(col)

    def runs_at(yy):
        r = sorted(x for x in range(W) if (x, yy) in solid)
        if not r:
            return 0
        n = 1
        for a, b in zip(r, r[1:]):
            if b != a + 1:
                n += 1
        return n

    counts = {}
    for p in solid:
        counts[pxx[p]] = counts.get(pxx[p], 0) + 1
    lone = [p for p in solid
            if not any((p[0] + dx, p[1] + dy) in solid for dx, dy in NB8)]
    mirror = [p for p in solid if (W - 1 - p[0], p[1]) not in solid]

    return {
        'bbox': box,
        'bbox_size': [box[2] - box[0] + 1, box[3] - box[1] + 1],
        'crown_bbox': cbox,
        'crown_size': [cbox[2] - cbox[0] + 1, cbox[3] - cbox[1] + 1],
        'area': len(solid),
        'leaf_pixels': len(leaf),
        'bark_pixels': len(bark),
        'crown_pixels': len(crown),
        'crown_share': round(len(crown) / max(1, len(leaf)), 4),
        'leaf_ratio': round(len(leaf) / len(solid), 4),
        'trunk_visible_rows': seen,
        'trunk_window': window,
        'bottom_spread': max(bottoms.values()) - min(bottoms.values()),
        'runs_y85': runs_at(85),
        'runs_y100': runs_at(100),
        'runs_y108': runs_at(108),
        'anchor': [(row[0] + row[-1] + 1) // 2, last],
        'contact': {'row': last, 'runs': [list(r) for r in runs], 'pixels': len(row)},
        'colors_used': len(counts),
        'lone_pixels': len(lone),
        'mirror_breaks': len(mirror),
        'alpha_values': sorted({pxx[x, y][3] for y in range(H) for x in range(W)}),
    }


# ---------------------------------------------------------------- 检查图

def grounds(im, name):
    """单件落地的三格对照：草地、裸土、干耕地。

    地面按三格宽、四格高拼（96×128），正好容下一棵整树，锚点落在格底——
    树比地砖大得多，用一两格拼会把树裁掉一半，看不出接地。
    """
    gw, gh, pad, sc = 3, 4, 10, 2
    cell_w, cell_h = gw * GT, gh * GT
    canvas = Image.new('RGBA', (cell_w * 3 + pad * 4, cell_h + pad * 2),
                       (246, 240, 228, 255))
    pans = []
    for sub, stem in (('grass', 'grass-lawn'), ('soil', 'soil-bare'), ('tilled', 'tilled-dry')):
        g = Image.new('RGBA', (cell_w, cell_h))
        for i in range(gw):
            for j in range(gh):
                f = ROOT / 'assets' / sub / f'{stem}-{(i * 3 + j) % 4}.png'
                if f.exists():
                    g.paste(Image.open(f), (i * GT, j * GT))
        pans.append(g)
    for gi, pan in enumerate(pans):
        x = pad + gi * (cell_w + pad)
        canvas.paste(pan, (x, pad))
        canvas.alpha_composite(im, (x, pad + cell_h - H))
    canvas = canvas.resize((canvas.width * sc, canvas.height * sc), Image.NEAREST)
    canvas.save(PREVIEWS / f'{name}-grounds.png', optimize=True)


def scales(im, name):
    """1×、2×、4× 并排：游戏中看到的是 1×，细节必须在这个尺寸站得住。"""
    pad = 12
    canvas = Image.new('RGBA', (W * 7 + pad * 4, H * 4 + pad * 2), (247, 242, 232, 255))
    x = pad
    for sc in (1, 2, 4):
        put = im if sc == 1 else im.resize((W * sc, H * sc), Image.NEAREST)
        canvas.alpha_composite(put, (x, pad + H * 4 - put.height))
        x += put.width + pad
    canvas.save(PREVIEWS / f'{name}-scales.png', optimize=True)


def sheet(im, lpal, kpal):
    """8 倍单件 + 叶六档、树皮四档色块。"""
    sc, pad = 8, 20
    canvas = Image.new('RGBA', (W * sc + pad * 2, H * sc + pad * 2 + 56), (247, 242, 232, 255))
    canvas.alpha_composite(im.resize((W * sc, H * sc), Image.NEAREST), (pad, pad))
    for row, (keys, pal) in enumerate(((('hi', 'lit', 'olive', 'deep', 'shade', 'line'), lpal),
                                       (('hi', 'mid', 'dark', 'line'), kpal))):
        for i, k in enumerate(keys):
            canvas.paste(Image.new('RGBA', (44, 18), pal[k]),
                         (pad + i * 48, pad + H * sc + 8 + row * 24))
    return canvas


def field(im):
    """河岸散放：草地与裸土上两棵柳、一块石、一个木箱，看比例与接地。"""
    gt, nx, ny, sc = GT, 10, 6, 2
    canvas = Image.new('RGBA', (nx * gt, ny * gt), (0, 0, 0, 0))
    for j in range(ny):
        for i in range(nx):
            canvas.paste(Image.open(ROOT / 'assets' / 'grass' /
                                    f'grass-lawn-{(i * 3 + j) % 4}.png'), (i * gt, j * gt))
    for i in range(nx):
        canvas.paste(Image.open(ROOT / 'assets' / 'soil' /
                                f'soil-bare-{(i * 5) % 4}.png'), (i * gt, 3 * gt))
    canvas = canvas.resize((canvas.width * sc, canvas.height * sc), Image.NEAREST)
    put = im.resize((W * sc, H * sc), Image.NEAREST)
    flip = put.transpose(Image.FLIP_LEFT_RIGHT)
    canvas.paste(put, (int(1.6 * gt * sc), int(5.8 * gt * sc - YBOT * sc)), put)
    canvas.paste(flip, (int(6.1 * gt * sc), int(5.4 * gt * sc - YBOT * sc)), flip)
    for sub, stem, gx, gy in (('rock', 'rock-plain-0', 0.7, 4.0),
                              ('crate', 'crate-harvest-48x48', 8.9, 4.3)):
        p = ROOT / 'assets' / sub / f'{stem}.png'
        if not p.exists():
            continue
        s = Image.open(p)
        s = s.resize((s.width * sc, s.height * sc), Image.NEAREST)
        canvas.paste(s, (int(gx * gt * sc - s.width // 2), int(gy * gt * sc - 44 * sc)), s)
    return canvas


def main():
    verify = '--verify' in sys.argv
    PREVIEWS.mkdir(parents=True, exist_ok=True)
    lpal, kpal = pal_rgb(LEAF), pal_rgb(BARK)
    seed = 20261124

    cpx, cm, cap = build_crown(seed)
    layers = [(sp[0], strand_band(cap, seed, sp)) for sp in STRAND_LAYERS]
    bpx, bm = build_bark(seed)
    tlist = tufts(cap, seed)

    px = {}
    px.update(cpx)                     # 衬层先铺，柳条之间不透空
    draw_strands(px, dict(layers)['back'])
    px.update(bpx)                     # 树干夹在后层与中层之间：帘子挂在枝前
    draw_strands(px, dict(layers)['mid'])
    draw_strands(px, dict(layers)['front'])
    draw_tufts(px, tlist)              # 肩线上冒头的叶簇，咬碎冠顶的弧
    plug(px)                           # 补针孔
    im = render(px, lpal, kpal)

    name = 'willow-weeping'
    im.save(PREVIEWS / f'{name}.png', optimize=True)
    im.resize((W * 8, H * 8), Image.NEAREST).save(PREVIEWS / f'{name}-8x.png', optimize=True)
    sheet(im, lpal, kpal).save(PREVIEWS / 'willow-sheet.png', optimize=True)
    grounds(im, name)
    scales(im, name)
    field(im).save(PREVIEWS / 'willow-field-2x.png', optimize=True)

    info = stats(im, cm)
    cbox = info['crown_bbox']
    pxx = im.load()
    lc = {}
    for y in range(H):
        for x in range(W):
            c = pxx[x, y]
            if c[3]:
                lc[c] = lc.get(c, 0) + 1
    leaf_px = sum(n for c, n in lc.items() if c[1] > c[0])
    bright = sum(n for c, n in lc.items() if c[1] > c[0] and lum(c[:3]) >= 150)
    dark = sum(n for c, n in lc.items() if c[1] > c[0] and lum(c[:3]) <= 100)
    shade_only = sum(n for c, n in lc.items() if c[1] > c[0] and lum(c[:3]) <= 75)
    all_strands = [t for _, v in layers for t in v]

    problems = []
    if im.size != (W, H):
        problems.append(f'画布 {im.size} 不是 {W}×{H}')
    if info['alpha_values'] != [0, 255]:
        problems.append(f"出现半透明像素 {info['alpha_values']}")
    w, h = info['bbox_size']
    if not (80 <= w <= 95):
        problems.append(f'整体宽度 {w} 不在 80~95')
    if not (96 <= h <= 126):
        problems.append(f'整体高度 {h} 不在 96~126')
    cw, ch = info['crown_size']
    if cw / ch < 1.3:
        problems.append(f'冠体 {cw}×{ch} 宽高比 {cw / ch:.2f}，不够横长')
    if info['crown_share'] > 0.62:
        problems.append(f"叶体占叶面积 {info['crown_share']}，柳条不成主体")
    if info['contact']['pixels'] < 6 or len(info['contact']['runs']) != 1:
        problems.append(f"接地 {info['contact']} 不是一整段且 ≥6 像素")
    if info['anchor'][1] != YBOT:
        problems.append(f"锚点 y={info['anchor'][1]} 不在接地行 {YBOT}")
    if abs(info['anchor'][0] - W // 2) > 4:
        problems.append(f"锚点 x={info['anchor'][0]} 离画布中线太远")
    if info['trunk_visible_rows'] < 18:
        problems.append(f"树干只透出 {info['trunk_visible_rows']} 行")
    if info['trunk_window'] < 12:
        problems.append(f"柳条帘里的树干只有 {info['trunk_window']} 像素，透不出来")
    if info['bottom_spread'] < 26:
        problems.append(f"末端高低只差 {info['bottom_spread']}，柳条等长")
    if not (40 <= len(all_strands) <= 140):
        problems.append(f'柳条 {len(all_strands)} 条，不在 40~140')
    ln_min = min(t[2] for t in all_strands)
    ln_max = max(t[2] for t in all_strands)
    if ln_max - ln_min < 48:
        problems.append(f'柳条长度 {ln_min}~{ln_max}，差得不够')
    if info['runs_y85'] < 6 or info['runs_y100'] < 6 or info['runs_y108'] < 3:
        problems.append(f"柳条帘在 y85/100/108 只有 {info['runs_y85']}/{info['runs_y100']}/"
                        f"{info['runs_y108']} 段，垂不到底")
    if cbox[3] > 80:
        problems.append(f'叶体一直垂到 y={cbox[3]}，下摆该全是柳条')
    if info['bbox_size'][1] - cbox[3] < 28:
        problems.append(f"叶体之下只有 {info['bbox_size'][1] - cbox[3]} 行，柳条不够长")
    if len(tlist) < 8:
        problems.append(f'肩线以上只有 {len(tlist)} 撮叶子，冠顶太光滑')
    if info['crown_share'] > 0.62:
        problems.append(f"冠体占叶面积 {info['crown_share']}，柳条不成主体")
    if info['lone_pixels']:
        problems.append(f"有 {info['lone_pixels']} 个孤立像素")
    if info['mirror_breaks'] == 0:
        problems.append('轮廓左右镜像重合，是规则形状')
    if bright / max(1, leaf_px) < 0.16:
        problems.append(f'向阳叶只占 {bright / leaf_px:.2f}，受光面不足')
    if dark / max(1, leaf_px) < 0.24:
        problems.append(f'暗叶只占 {dark / leaf_px:.2f}，缺遮挡暗部')
    if shade_only / max(1, leaf_px) < 0.05:
        problems.append(f'深青绿只占 {shade_only / leaf_px:.2f}，重叠处没压下去')
    if info['leaf_ratio'] < 0.60:
        problems.append(f"叶 {info['leaf_ratio']} 太少，树干压过了树冠")

    lad_l = {k: round(lum(lpal[k][:3]), 1) for k in LEAF}
    for a, b in zip(('hi', 'lit', 'olive', 'deep', 'shade'),
                    ('lit', 'olive', 'deep', 'shade', 'line')):
        if lad_l[a] - lad_l[b] < 8:
            problems.append(f'叶明暗阶梯 {a}>{b} 只有 {lad_l[a] - lad_l[b]}')
    lad_k = {k: round(lum(kpal[k][:3]), 1) for k in ('hi', 'mid', 'dark', 'line')}
    for a, b in zip(('hi', 'mid', 'dark'), ('mid', 'dark', 'line')):
        if lad_k[a] - lad_k[b] < 8:
            problems.append(f'树皮明暗阶梯 {a}>{b} 只有 {lad_k[a] - lad_k[b]}')
    for k in ('hi', 'lit', 'olive'):
        if lpal[k][1] - lpal[k][0] < 8:
            problems.append(f'叶 {k} 不够绿（G-R={lpal[k][1] - lpal[k][0]}）')
    soil = hex_rgb('#f0b035')
    if soil[0] - soil[1] < 40:
        problems.append('裸土不够暖，与叶的冷暖对比不足')

    (PREVIEWS / 'willow-manifest.json').write_text(json.dumps({
        'name': name,
        'canvas': f'{W}×{H}，透明底',
        'view': '固定俯视微倾，左上受光；顶面、正面、遮挡暗部三面交代体积',
        'anchor': [info['anchor'][0], YBOT],
        'bottom_row': YBOT,
        'metrics': info,
        'leaf_palette': LEAF,
        'bark_palette': BARK,
        'structure': {
            'shoulder': 'cap[x]：叶体每列最上沿，所有柳条从这里生出来',
            'crown': '10 片叶瓣的并集（x4~x91，y22~y74），下缘按 t² 溶解，不描外轮廓',
            'strands': ' + '.join(f'{k} {len(v)} 条' for k, v in layers)
                       + '；1 像素主枝 + 单侧叶齿，正弦摆动、末端披散，梢头散在 y90~y114',
            'tufts': f'肩线上 {len(tlist)} 撮叶簇，把冠顶的弧咬成小起伏',
            'holes': 'x47~49 柳条压到 y=100、x44~52 压到 y=88，主干与三杈从帘子中间透出',
        },
        'checks': problems or ['全部通过'],
    }, ensure_ascii=False, indent=2), encoding='utf-8')

    print(f"willow  bbox={info['bbox']} size={info['bbox_size']} "
          f"冠体={info['crown_size']} 面积={info['area']} "
          f"叶={info['leaf_pixels']}({info['leaf_ratio']}) 皮={info['bark_pixels']}")
    print(f"        冠体占叶={info['crown_share']} 树干透出={info['trunk_visible_rows']} 行 "
          f"叶隙={info['trunk_window']} 底缘差={info['bottom_spread']} "
          f"帘 y85/100/108={info['runs_y85']}/{info['runs_y100']}/{info['runs_y108']} "
          f"接地={info['contact']['pixels']} 锚点={info['anchor']} 色数={info['colors_used']}")
    print('叶明暗', lad_l)
    print('树皮明暗', lad_k)
    print(f"柳条 {len(all_strands)} 条（" + ' / '.join(f'{k} {len(v)}' for k, v in layers) +
          f"，长 {ln_min}~{ln_max}）叶簇 {len(tlist)}  向阳叶 {bright / max(1, leaf_px):.2f} "
          f"暗叶 {dark / max(1, leaf_px):.2f} 深青绿 {shade_only / max(1, leaf_px):.2f}")
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
