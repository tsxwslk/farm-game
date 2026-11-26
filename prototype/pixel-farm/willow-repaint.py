"""按 willow-imported.png 的形状，重画成柳湾的像素语言。

运行：python3 prototype/pixel-farm/willow-repaint.py [--verify]
输入：prototype/pixel-farm/assets/willow/willow-imported.png（96×128，开发者的插图版）
输出：prototype/pixel-farm/assets/willow/willow-repaint.png（96×128，10 色）
     output/art-previews/willow/ 下的放大图、分档图、草地实景
     prototype/pixel-farm/assets/willow/willow-repaint-manifest.json

做法：形状照抄，明暗重算。
1) 轮廓直接取参考图的 alpha（0/255，没有半透明边），所以树形、叶瓣分块、
   柳条梢头的参差都是原样保留的——用户要的就是这个形状。
2) 明暗不用参考图的颜色，而是按《柳湾垂柳素材》的规矩重算：
   以光源点 (30,32) 的径向距离分五档，再加两层「与周围比较」的微调——
   11×11 邻域捕捉叶瓣之间的暗部，5×5 邻域捕捉柳条之间的暗缝。
   只按纵向或只按径向分档都会读成三层蛋糕，两者必须叠。
3) 叶片走六档橄榄绿，最深一档只落在与透明相邻的一圈，和旧垂柳一致。
4) 树干不按绝对 x 上色，按每行每段连续像素的**行内相对位置**：
   最外一圈最深、左两列受光、中间主色、右两列压暗。弯的那几行因此不会半张脸亮半张脸暗。
5) 参考图的橙色树干（#997237）换成冷灰褐，否则在暖金裸土上比叶冠还跳。
"""
from pathlib import Path
import json
import sys
from collections import deque
from PIL import Image

ROOT = Path(__file__).resolve().parent
W, H = 96, 128
ANCHOR = (48, 122)
LIGHT = (26, 28)                      # 光源点，落在冠的左上角（旧垂柳那棵更矮，用的是 30,32）

REF = ROOT / 'assets' / 'willow' / 'willow-imported.png'
OUT = ROOT / 'assets' / 'willow' / 'willow-repaint.png'
PREVIEWS = ROOT.parents[1] / 'output' / 'art-previews' / 'willow'

LEAF = ('#BFD46A', '#9BBB4C', '#6F9440', '#4A7038', '#33522C', '#22381F')
BARK = ('#7E674E', '#6B5340', '#4C3A2B', '#33251A')
GRASS = [ROOT / 'assets' / 'grass' / f'grass-lawn-{i}.png' for i in range(4)]

# 径向五档的半径，按这张画布上冠面到光源点的距离分布定
RINGS = (14, 32, 52, 74)


def hex_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


LEAF_RGB = [hex_rgb(c) for c in LEAF]
BARK_RGB = [hex_rgb(c) for c in BARK]
ALLOWED = {c + (255,) for c in LEAF_RGB + BARK_RGB}


def lum(c):
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]


def load_ref():
    im = Image.open(REF).convert('RGBA')
    if im.size != (W, H):
        raise SystemExit(f'参考图尺寸 {im.size}，应为 {(W, H)}')
    px = im.load()
    mask = [[px[x, y][3] > 0 for y in range(H)] for x in range(W)]           # [x][y]
    rgb = [[px[x, y][:3] for y in range(H)] for x in range(W)]
    return mask, rgb


def neighbours4(x, y):
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        nx, ny = x + dx, y + dy
        if 0 <= nx < W and 0 <= ny < H:
            yield nx, ny


def keep_largest(mask):
    """只留最大的一块。参考图里有 4 处 1~11 像素的碎片（柳条断头、根须散点）。"""
    seen = [[False] * H for _ in range(W)]
    best, best_n = None, 0
    for x in range(W):
        for y in range(H):
            if mask[x][y] and not seen[x][y]:
                cells = []
                q = deque([(x, y)])
                seen[x][y] = True
                while q:
                    cx, cy = q.popleft()
                    cells.append((cx, cy))
                    for nx, ny in neighbours4(cx, cy):
                        if mask[nx][ny] and not seen[nx][ny]:
                            seen[nx][ny] = True
                            q.append((nx, ny))
                if len(cells) > best_n:
                    best, best_n = cells, len(cells)
    keep = set(best or [])
    for x in range(W):
        for y in range(H):
            mask[x][y] = (x, y) in keep
    return best_n


def add_root_base(mask):
    """树根重画。参考图在 y>119 只剩几粒散点，落地会是单像素点，
    而接地必须是一整段、锚点落在 (48,122)。
    做法：114~122 行按行给一个逐渐外扩的实心段，再从底角撇出两条 2 像素的根。
    """
    for y in range(114, H - 5):                      # 到 y=122
        # 基部先鼓后收：一条直边的底座会读成“方块 + 两只靴子”
        t = (y - 114) / 8.0
        half = 6.4 + 1.4 * t - 4.2 * t * t
        for x in range(int(round(ANCHOR[0] - half)), int(round(ANCHOR[0] + half)) + 1):
            if 0 <= x < W:
                mask[x][y] = True
    for ax, ay, bx, by in ((43, 121, 32, 114), (53, 121, 64, 114)):
        steps = max(abs(bx - ax), abs(by - ay))
        prev = None
        for i in range(steps + 1):
            x = round(ax + (bx - ax) * i / steps)
            y = round(ay + (by - ay) * i / steps)
            mask[x][y] = True
            if prev and prev[0] != x and prev[1] != y:
                mask[x][prev[1]] = True             # 斜走时补一格，保证 4 连通
            if i >= steps - 1:                      # 根梢粗一格，收得住
                mask[min(W - 1, x + 1)][y] = True
            prev = (x, y)


def smooth_mask(mask, passes=1):
    """去掉 1 像素凸点、填掉 1 像素凹口。
    参考图的边是插图级的，放大后是一圈沙粒；像素画的边要一笔一笔读得出。
    只跑一遍：多跑几遍会把柳条梢头一并啃短，参差感是垂柳的命。"""
    dropped = added = 0
    for _ in range(passes):
        drop = []
        for x in range(W):
            for y in range(H):
                if not mask[x][y]:
                    continue
                n = sum(1 for dx in (-1, 0, 1) for dy in (-1, 0, 1)
                        if not (dx == 0 and dy == 0) and 0 <= x + dx < W and 0 <= y + dy < H
                        and mask[x + dx][y + dy])
                if n <= 1:
                    drop.append((x, y))
        for x, y in drop:
            mask[x][y] = False
        dropped += len(drop)
        for x in range(W):
            for y in range(H):
                if mask[x][y]:
                    continue
                n = sum(1 for dx in (-1, 0, 1) for dy in (-1, 0, 1)
                        if not (dx == 0 and dy == 0) and 0 <= x + dx < W and 0 <= y + dy < H
                        and mask[x + dx][y + dy])
                if n >= 6:
                    mask[x][y] = True
                    added += 1
    return dropped, added


def clean_mask(mask):
    """去掉孤立像素，并填掉被四面包住的单像素孔洞（柳条断面会漏这种孔）。"""
    removed = filled = 0
    for _ in range(3):
        drop = []
        for x in range(W):
            for y in range(H):
                if mask[x][y] and not any(mask[nx][ny] for nx, ny in neighbours4(x, y)):
                    drop.append((x, y))
        for x, y in drop:
            mask[x][y] = False
        removed += len(drop)
        for x in range(W):
            for y in range(H):
                if not mask[x][y] and sum(1 for nx, ny in neighbours4(x, y) if mask[nx][ny]) >= 4:
                    mask[x][y] = True
                    filled += 1
        if not drop and not filled:
            break
    return removed, filled


def classify(mask, rgb):
    """分出叶与树干。中性色（参考图的近黑描边）按邻域多数归属。"""
    kind = [[None] * H for _ in range(W)]
    for x in range(W):
        for y in range(H):
            if not mask[x][y]:
                continue
            r, g, b = rgb[x][y]
            if g - r > 20:
                kind[x][y] = 'leaf'
            elif r - g > 20:
                kind[x][y] = 'bark'
    for _ in range(4):
        changed = 0
        for x in range(W):
            for y in range(H):
                if mask[x][y] and kind[x][y] is None:
                    votes = {'leaf': 0, 'bark': 0}
                    for dx in (-1, 0, 1):
                        for dy in (-1, 0, 1):
                            nx, ny = x + dx, y + dy
                            if 0 <= nx < W and 0 <= ny < H and kind[nx][ny]:
                                votes[kind[nx][ny]] += 1
                    if votes['leaf'] or votes['bark']:
                        kind[x][y] = 'leaf' if votes['leaf'] >= votes['bark'] else 'bark'
                        changed += 1
        if not changed:
            break
    for x in range(W):
        for y in range(H):
            if mask[x][y] and kind[x][y] is None:
                kind[x][y] = 'leaf'
    return kind


def box_mean(vals, mask, radius):
    """带掩码的方框均值：只为不透明像素求值，边缘处按实际参与像素数归一。"""
    pre = [[0.0] * (H + 1) for _ in range(W + 1)]
    cnt = [[0] * (H + 1) for _ in range(W + 1)]
    for x in range(W):
        for y in range(H):
            v = vals[x][y] if mask[x][y] else 0.0
            c = 1 if mask[x][y] else 0
            pre[x + 1][y + 1] = pre[x][y + 1] + pre[x + 1][y] - pre[x][y] + v
            cnt[x + 1][y + 1] = cnt[x][y + 1] + cnt[x + 1][y] - cnt[x][y] + c
    out = [[0.0] * H for _ in range(W)]
    for x in range(W):
        for y in range(H):
            x0, x1 = max(0, x - radius), min(W, x + radius + 1)
            y0, y1 = max(0, y - radius), min(H, y + radius + 1)
            s = pre[x1][y1] - pre[x0][y1] - pre[x1][y0] + pre[x0][y0]
            n = cnt[x1][y1] - cnt[x0][y1] - cnt[x1][y0] + cnt[x0][y0]
            out[x][y] = s / n if n else 0.0
    return out


def carve_strands(mask, kind, rgb):
    """沿参考图的竖向暗线开缝。
    重画的第一版是一整块实心叶体加竖纹，和项目里那棵（柳条之间真的透空）不是一路。
    参考图每条柳条之间本来就有暗线，照它挖掉一像素，实心块才变成一缕一缕的。
    只在冠的下三分之二挖：冠顶那团必须是不透光的叶体，挖了就成了垂萝。
    """
    L = [[lum(rgb[x][y]) for y in range(H)] for x in range(W)]

    def dark_line(x, y, margin):
        if not (0 <= x < W and 0 <= y < H) or not mask[x][y] or kind[x][y] != 'leaf':
            return False
        vals = [L[x + k][y] for k in range(-3, 4)
                if 0 <= x + k < W and k != 0 and mask[x + k][y] and kind[x + k][y] == 'leaf']
        if len(vals) < 2:
            return False
        return L[x][y] < sum(vals) / len(vals) - margin

    carve = []
    for x in range(W):
        for y in range(H):
            if not (mask[x][y] and kind[x][y] == 'leaf'):
                continue
            # 溶解门槛随高度收紧：越靠近冠顶越难挖。门槛一刀切会在 y=46 造出一条
            # 清晰的水平分界，上半读成蘑菇盖、下半读成草裙——旧垂柳就是栽在这
            margin = 14 + max(0, 66 - y) * 1.1
            if not dark_line(x, y, margin):
                continue
            # 竖向连续：上下也要是暗线，否则挖出来的是针孔不是缝
            up = dark_line(x, y - 1, margin) or dark_line(x, y - 2, margin)
            down = dark_line(x, y + 1, margin) or dark_line(x, y + 2, margin)
            if up and down:
                carve.append((x, y))
    for x, y in carve:
        mask[x][y] = False
    return len(carve)


def fill_pinholes(mask):
    """补掉被八面包住的单像素针孔。开缝之后要补一遍，否则冠面是一片麻点。"""
    filled = 0
    for _ in range(2):
        add = []
        for x in range(W):
            for y in range(H):
                if mask[x][y]:
                    continue
                n = sum(1 for dx in (-1, 0, 1) for dy in (-1, 0, 1)
                        if not (dx == 0 and dy == 0) and 0 <= x + dx < W and 0 <= y + dy < H
                        and mask[x + dx][y + dy])
                if n >= 7:
                    add.append((x, y))
        for x, y in add:
            mask[x][y] = True
        filled += len(add)
        if not add:
            break
    return filled


def depth_map(mask):
    """掩码内到透明边界的步数：最外一圈是 1。"""
    d = [[0] * H for _ in range(W)]
    q = deque()
    for x in range(W):
        for y in range(H):
            if mask[x][y] and any(not (0 <= x + dx < W and 0 <= y + dy < H and mask[x + dx][y + dy])
                                  for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                d[x][y] = 1
                q.append((x, y))
    while q:
        cx, cy = q.popleft()
        for nx, ny in neighbours4(cx, cy):
            if mask[nx][ny] and d[nx][ny] == 0:
                d[nx][ny] = d[cx][cy] + 1
                q.append((nx, ny))
    return d


def thickness(depth, x, y):
    """3×3 内的最大深度，用来判断这里够不够厚、描一条边会不会把整条柳条吃掉。"""
    best = 0
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            nx, ny = x + dx, y + dy
            if 0 <= nx < W and 0 <= ny < H:
                best = max(best, depth[nx][ny])
    return best


def is_edge(mask, x, y):
    if not mask[x][y]:
        return False
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        nx, ny = x + dx, y + dy
        if not (0 <= nx < W and 0 <= ny < H) or not mask[nx][ny]:
            return True
    return False


def paint_leaf(mask, kind, rgb, depth):
    """叶：径向五档 + 两个尺度的邻域微调，最深一档留给外圈。"""
    L = [[lum(rgb[x][y]) for y in range(H)] for x in range(W)]
    near = box_mean(L, mask, 2)          # 5×5：柳条之间的暗缝
    far = box_mean(L, mask, 5)           # 11×11：叶簇之间的暗部
    huge = box_mean(L, mask, 12)         # 25×25：整团叶瓣的明暗，靠它分出叶瓣

    mod = [[0] * H for _ in range(W)]
    tone = [[0] * H for _ in range(W)]
    for x in range(W):
        for y in range(H):
            if not mask[x][y] or kind[x][y] != 'leaf':
                continue
            # 各向异性：光从左上来，横向偏移才该压暗；竖直距离按 0.62 折算，
            # 否则这棵比旧垂柳高一倍，下半截会被一路推到最深档
            d = ((x - LIGHT[0]) ** 2 + ((y - LIGHT[1]) * 0.62) ** 2) ** 0.5
            level = 0
            for r in RINGS:
                if d >= r:
                    level += 1
            # 只往暗推，不往亮推。参考图整体偏亮，允许往上抬会把整棵洗白
            # （第一版就是这样，最亮一档占了 38%）；叶瓣暗部与柳条暗缝各让一档。
            # 档位 0 是最亮的一档，所以“偏暗”要 +1（往深里走），符号别写反
            delta = 0
            if L[x][y] < huge[x][y] - 10:
                delta += 1          # 整团叶瓣处在暗部
            if L[x][y] < far[x][y] - 10:
                delta += 1          # 叶簇之间的暗部
            if L[x][y] < near[x][y] - 14:
                delta += 1          # 柳条之间的暗缝
            mod[x][y] = delta
            tone[x][y] = level

    # 纵向中值：柳条是竖着的，逐像素叠微调会成横向噪点；
    # 取同列上下五格的中值，微调就沿柳条走，冠面才是一条一条的纹理
    for x in range(W):
        for y in range(H):
            if not mask[x][y] or kind[x][y] != 'leaf':
                continue
            window = [mod[x][ty] for ty in range(max(0, y - 2), min(H, y + 3))]
            window.sort()
            level = tone[x][y] + window[len(window) // 2]
            # 细的地方提档：柳条只有两三像素宽，光是透过去的，比上面那团叶体亮。
            # 不提的话下半截会黑成一片，读成“被压住”而不是“垂下来”
            thin = thickness(depth, x, y)
            if thin <= 2:
                level -= 1
            tone[x][y] = max(0, min(4, level))
    return tone


def paint_bark(mask, kind, tone):
    """树干：按行内相对位置分档，不按绝对 x。每段连续像素单独算。"""
    cracks = {}
    _paint_bark_rows(mask, kind, tone)
    # 纵裂：每隔七八行点一截 2~4 像素的短竖纹，树皮才有质地
    for y in range(96, H - 6):
        if (y - 96) % 7:
            continue
        run = [x for x in range(W) if mask[x][y] and kind[x][y] == 'bark']
        if len(run) < 6:
            continue
        i = len(run) // 2 - 1
        for k in range(3):
            if i + k < len(run) - 1:
                cracks[(run[i + k], y)] = True
    for y in range(H):
        for x in range(W):
            if cracks.get((x, y)) and tone[x][y] in (0, 1):
                tone[x][y] = 3
    return


def _paint_bark_rows(mask, kind, tone):
    for y in range(H):
        x = 0
        while x < W:
            if not (mask[x][y] and kind[x][y] == 'bark'):
                x += 1
                continue
            x0 = x
            while x < W and mask[x][y] and kind[x][y] == 'bark':
                x += 1
            run = list(range(x0, x))
            n = len(run)
            for i, xx in enumerate(run):
                if n == 1:
                    tone[xx][y] = 1
                elif n == 2:
                    tone[xx][y] = 0 if i == 0 else 2
                elif n == 3:
                    tone[xx][y] = 3 if i in (0, 2) else 1
                else:
                    if i == 0 or i == n - 1:
                        tone[xx][y] = 3
                    elif i <= 2:
                        tone[xx][y] = 0
                    elif i >= n - 3:
                        tone[xx][y] = 2
                    else:
                        tone[xx][y] = 1


def build(carve=True):
    mask, rgb = load_ref()
    kept = keep_largest(mask)
    add_root_base(mask)
    dropped, added = smooth_mask(mask)
    removed, filled = clean_mask(mask)
    kind = classify(mask, rgb)
    # 描边只在“原来就是外轮廓”的位置描。开缝之后每道缝都成了新的边缘，
    # 一刀切会给整棵树描成一圈黑网（试过，冠面全是深色线）
    depth_before = depth_map(mask)
    outer = [[depth_before[x][y] == 1 for y in range(H)] for x in range(W)]
    carved = carve_strands(mask, kind, rgb) if carve else 0
    keep_largest(mask)                      # 挖缝之后可能断开，再收一次
    if carve:
        filled += fill_pinholes(mask)

    depth = depth_map(mask)
    tone = [[0] * H for _ in range(W)]
    leaf_tone = paint_leaf(mask, kind, rgb, depth)
    bark_tone = [[0] * H for _ in range(W)]
    paint_bark(mask, kind, bark_tone)

    for x in range(W):
        for y in range(H):
            if not mask[x][y]:
                continue
            if kind[x][y] == 'bark':
                tone[x][y] = bark_tone[x][y]
            else:
                t = leaf_tone[x][y]
                if outer[x][y]:
                    # 描边只在“够厚”的地方描。参考图的柳条只有 1~2 像素宽，
                    # 按外圈一刀切会把整条柳条吃成最深档，下半截就黑成一片。
                    if thickness(depth, x, y) >= 2:
                        t = 5
                    else:
                        t = min(4, t + 1)
                tone[x][y] = t

    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    px = im.load()
    for x in range(W):
        for y in range(H):
            if not mask[x][y]:
                continue
            idx = tone[x][y]
            c = BARK_RGB[idx] if kind[x][y] == 'bark' else LEAF_RGB[idx]
            px[x, y] = c + (255,)
    stats = {'largest_component': kept, 'smooth_dropped': dropped, 'smooth_added': added,
             'carved': carved,
             'removed_isolated': removed, 'filled_holes': filled}
    return im, mask, kind, tone, stats


def scc_count(mask):
    seen = [[False] * H for _ in range(W)]
    n = 0
    for x in range(W):
        for y in range(H):
            if mask[x][y] and not seen[x][y]:
                n += 1
                q = deque([(x, y)])
                seen[x][y] = True
                while q:
                    cx, cy = q.popleft()
                    for nx, ny in neighbours4(cx, cy):
                        if mask[nx][ny] and not seen[nx][ny]:
                            seen[nx][ny] = True
                            q.append((nx, ny))
    return n


def report(im, mask, kind, tone):
    px = im.load()
    counts = {}
    for x in range(W):
        for y in range(H):
            if px[x, y][3]:
                counts[px[x, y]] = counts.get(px[x, y], 0) + 1
    total = sum(counts.values())
    leaf_px = sum(1 for x in range(W) for y in range(H)
                  if mask[x][y] and kind[x][y] == 'leaf')
    bark_px = total - leaf_px

    def share(keys):
        return round(sum(counts.get(c + (255,), 0) for c in keys) / max(1, leaf_px), 3)

    xs = [x for x in range(W) for y in range(H) if mask[x][y]]
    ys = [y for x in range(W) for y in range(H) if mask[x][y]]
    box = [min(xs), min(ys), max(xs), max(ys)]

    row = box[3]
    run = 0
    xx = ANCHOR[0]
    if mask[xx][row]:
        while xx - 1 >= 0 and mask[xx - 1][row]:
            xx -= 1
        s = xx
        while xx + 1 < W and mask[xx + 1][row]:
            xx += 1
        run = xx - s + 1

    # 树干在帘子中间露出的行数（每行至少 2 像素树干）
    bark_rows = sum(1 for y in range(H)
                    if sum(1 for x in range(W) if kind[x][y] == 'bark') >= 2)
    return {
        'size': [W, H],
        'anchor': list(ANCHOR),
        'bbox': box,
        'width': box[2] - box[0] + 1,
        'height': box[3] - box[1] + 1,
        'opaque': total,
        'leaf_px': leaf_px,
        'bark_px': bark_px,
        'colors': len(counts),
        'components': scc_count(mask),
        'contact_run': run,
        'bark_rows': bark_rows,
        'leaf_shares': {
            'bright': share([LEAF_RGB[0]]),
            'lit': share([LEAF_RGB[1]]),
            'mid': share([LEAF_RGB[2]]),
            'overlap': share([LEAF_RGB[3]]),
            'deep': share([LEAF_RGB[4]]),
            'rim': share([LEAF_RGB[5]]),
        },
    }


def build_previews(im):
    PREVIEWS.mkdir(parents=True, exist_ok=True)
    bg = Image.new('RGBA', im.size, (246, 240, 228, 255))
    bg.alpha_composite(im)
    bg.convert('RGB').resize((W * 6, H * 6), Image.NEAREST).save(
        PREVIEWS / 'willow-repaint-6x.png', optimize=True)

    # 1×、2×、4× 并排，底对齐：游戏里看到的是 1×，细节要在那个尺寸站得住
    scales = (1, 2, 4)
    gap = 10
    ladder = Image.new('RGB', (sum(W * k + gap for k in scales) + gap, H * 4 + gap * 2), (246, 240, 228))
    x = gap
    for k in scales:
        r = bg.convert('RGB').resize((W * k, H * k), Image.NEAREST)
        ladder.paste(r, (x, H * 4 + gap - r.height))
        x += r.width + gap
    ladder.save(PREVIEWS / 'willow-repaint-scales.png', optimize=True)

    # 原图与重画对照：同一比例并排，风格差在哪一眼看得出
    if REF.exists():
        ref = Image.new('RGBA', (W, H), (246, 240, 228, 255))
        ref.alpha_composite(Image.open(REF).convert('RGBA'))
        z = 4
        cmp_img = Image.new('RGB', (W * z * 2 + 18, H * z), (246, 240, 228))
        cmp_img.paste(ref.convert('RGB').resize((W * z, H * z), Image.NEAREST), (0, 0))
        cmp_img.paste(bg.convert('RGB').resize((W * z, H * z), Image.NEAREST), (W * z + 18, 0))
        cmp_img.save(PREVIEWS / 'willow-repaint-compare.png', optimize=True)

    tiles = [Image.open(p).convert('RGBA') for p in GRASS if p.exists()]
    if tiles:
        fw, fh = 200, 176
        field = Image.new('RGBA', (fw, fh))
        for y in range(0, fh, 32):
            for x in range(0, fw, 32):
                field.alpha_composite(tiles[(x // 32 + y // 32) % len(tiles)], (x, y))
        # 锚点落到画面下沿附近，别把树切在框外
        field.alpha_composite(im, ((fw - W) // 2, fh - 18 - ANCHOR[1]))
        out = Image.new('RGB', (fw + fw * 2 + 12, fh * 2), (22, 26, 28))
        out.paste(field.convert('RGB'), (0, 0))
        out.paste(field.convert('RGB').resize((fw * 2, fh * 2), Image.NEAREST), (fw + 12, 0))
        out.save(PREVIEWS / 'willow-repaint-on-grass.png', optimize=True)


def check(im, info):
    problems = []
    if im.size != (W, H):
        problems.append(f'尺寸 {im.size}')
    alphas = sorted(c[1] for c in im.getchannel('A').getcolors())
    if alphas != [0, 255]:
        problems.append(f'alpha 取值 {alphas}')
    for x in range(W):
        for y in range(H):
            c = im.getpixel((x, y))
            if c[3] and c not in ALLOWED:
                problems.append(f'色板外的颜色 {c} @({x},{y})')
                break
    if not 74 <= info['width'] <= 95:
        problems.append(f'整件宽 {info["width"]}，应在 74~95')
    if not 100 <= info['height'] <= 126:
        problems.append(f'整件高 {info["height"]}，应在 100~126')
    if info['bbox'][3] != ANCHOR[1]:
        problems.append(f'底行 y={info["bbox"][3]}，锚点要求 {ANCHOR[1]}')
    if info['contact_run'] < 6:
        problems.append(f'接地只有 {info["contact_run"]} 像素连成一段')
    if abs((info['bbox'][0] + info['bbox'][2]) / 2 - ANCHOR[0]) > 5:
        problems.append('包围盒中心偏离锚点 x 超过 5')
    if info['components'] != 1:
        problems.append(f'分成 {info["components"]} 块')
    if info['colors'] < 8:
        problems.append(f'只用了 {info["colors"]} 色，档位不够')
    if info['bark_rows'] < 18:
        problems.append(f'树干只露出 {info["bark_rows"]} 行，读不出主干')
    if info['leaf_px'] / max(1, info['opaque']) < 0.55:
        problems.append('叶量不足，冠面被柳条盖满')
    s = info['leaf_shares']
    if s['bright'] + s['lit'] < 0.16:
        problems.append(f'受光叶只占 {s["bright"] + s["lit"]:.3f}')
    # 旧垂柳那棵冠面更扁，深色占比标在 24%；这棵冠面高、叶体占比大，
    # 同一套明暗落在 22% 上下，含义（够不够沉得住）不变，阈值按实测重新标定
    if s['deep'] + s['rim'] < 0.20:
        problems.append(f'深绿及更深只占 {s["deep"] + s["rim"]:.3f}')
    if s['rim'] < 0.05:
        problems.append(f'外圈深青绿只占 {s["rim"]:.3f}')
    steps = [lum(a) - lum(b) for a, b in zip(LEAF_RGB, LEAF_RGB[1:])]
    if min(steps) < 8:
        problems.append(f'叶六档最小明度差 {min(steps):.0f}，低于 8')
    return problems


def main():
    verify = '--verify' in sys.argv
    strands = '--strands' in sys.argv        # 默认实体版；--strands 走开缝版
    im, mask, kind, tone, stats = build(carve=strands)
    info = report(im, mask, kind, tone)
    info['cleanup'] = stats
    out = OUT if not strands else OUT.with_name('willow-repaint-strands.png')
    out.parent.mkdir(parents=True, exist_ok=True)
    im.save(out, optimize=True)
    if strands:
        print('开缝版已写到', out.name)
        return 0
    build_previews(im)
    (OUT.parent / 'willow-repaint-manifest.json').write_text(
        json.dumps(info, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    problems = check(im, info)
    print(f'包围盒 {info["width"]}×{info["height"]}，底行 y={info["bbox"][3]}，'
          f'接地 {info["contact_run"]} 像素，色数 {info["colors"]}，连通 {info["components"]}')
    print('叶占比', info['leaf_shares'], '树干行', info['bark_rows'],
          '叶量', round(info['leaf_px'] / info['opaque'], 3))
    print('清理', stats)
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
