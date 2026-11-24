"""Draw the cherry radish growth sprites and its harvested item with Pillow."""

from pathlib import Path

from PIL import Image, ImageDraw


OUT = Path(__file__).resolve().parent / "assets" / "cherry-radish"
ANCHOR = (24, 66)
GREEN = ("#283E29", "#426E35", "#659C41", "#9CC657")
RED = ("#802B40", "#BB3D50", "#E75262", "#FA8590")


def leaf(draw, base, tip, width, *, pink=False, shade=False):
    x, y = base
    dx, dy = tip[0] - x, tip[1] - y
    length = (dx * dx + dy * dy) ** 0.5

    def shape(points):
        return [
            (round(x + dx * along - dy / length * width * across),
             round(y + dy * along + dx / length * width * across))
            for along, across in points
        ]

    stem = "#CA5A6B" if pink else GREEN[1]
    draw.line(shape([(0, 0), (.59, 0)]), fill=stem, width=2)
    if pink:
        draw.line(shape([(.08, -.12), (.36, -.12)]), fill="#EA8690")

    draw.polygon(shape([
        (.30, 0), (.46, -.53), (.59, -.45), (.70, -.83), (.84, -.95),
        (.95, -.65), (.99, -.22), (1, .18), (.92, .65), (.81, .85),
        (.69, .82), (.60, .53), (.51, .64), (.42, .34),
    ]), fill=GREEN[1], outline=GREEN[0])
    if not shade:
        draw.polygon(shape([
            (.47, 0), (.57, -.27), (.70, -.29), (.76, -.64),
            (.85, -.70), (.95, -.36), (.95, .07), (.83, .29), (.66, .24),
        ]), fill=GREEN[2])
        draw.line(shape([(.53, .01), (.74, -.05), (.86, -.10)]), fill=GREEN[3])


def cotyledon(draw, base, direction):
    x, y = base

    def points(offsets):
        return [(x + direction * dx, y + dy) for dx, dy in offsets]

    draw.line(points([(0, 0), (5, -6)]), fill=GREEN[1])
    draw.polygon(points([
        (3, -4), (2, -8), (3, -11), (5, -12), (7, -11), (8, -12),
        (11, -11), (12, -9), (11, -6), (8, -4), (5, -3),
    ]), fill=GREEN[2], outline=GREEN[0])
    draw.line(points([(4, -10), (5, -11), (6, -10)]), fill=GREEN[3])


def bulb(draw, center, top, width, height, *, in_field):
    left = center - width // 2

    def shape(points):
        return [(left + round(x * (width - 1)), top + round(y * (height - 1)))
                for x, y in points]

    bottom = [(.84, .90), (.69, .96), (.49, 1), (.33, .94), (.13, .91)]
    if not in_field:
        bottom = [(.84, .82), (.69, .95), (.48, 1), (.29, .96), (.15, .85)]
    draw.polygon(shape([
        (.01, .64), (.04, .36), (.16, .15), (.31, .04), (.48, 0),
        (.68, .04), (.84, .16), (.95, .38), (1, .65), (.96, .80),
        *bottom, (.03, .79),
    ]), fill=RED[1], outline=RED[0])
    draw.polygon(shape([
        (.09, .69), (.10, .43), (.22, .22), (.36, .11), (.55, .09),
        (.72, .16), (.83, .31), (.87, .54), (.79, .70), (.63, .78),
        (.43, .81), (.21, .79),
    ]), fill=RED[2])
    draw.polygon(shape([
        (.19, .46), (.25, .29), (.40, .18), (.52, .21),
        (.48, .34), (.34, .37), (.29, .50),
    ]), fill=RED[3])


def field(stage):
    image = Image.new("RGBA", (48, 72))
    draw = ImageDraw.Draw(image)
    x, y = ANCHOR
    if stage == "sprout":
        cotyledon(draw, (x, y - 2), -1)
        cotyledon(draw, (x, y - 4), 1)
        draw.line([(x, y), (x - 1, y - 3), (x, y - 7)], fill=GREEN[2])
    elif stage == "seedling":
        base = (x, y - 1)
        cotyledon(draw, (x - 3, y - 4), -1)
        leaf(draw, base, (37, 52), 5, shade=True)
        leaf(draw, base, (19, 44), 6)
        leaf(draw, base, (29, 48), 5)
        draw.point(ANCHOR, fill=GREEN[1])
    else:
        mature = stage == "mature"
        top, width = (55, 23) if mature else (60, 15)
        base = (x, top + 2)
        bulb(draw, x, top, width, y - top + 1, in_field=True)
        tips = [(42, 44, 7), (29, 32, 7), (17, 35, 7), (7, 48, 7), (34, 49, 6)]
        if not mature:
            tips = [(38, 49, 6), (26, 38, 6), (13, 44, 6), (9, 54, 5)]
        for index, (lx, ly, width) in enumerate(tips):
            leaf(draw, base, (lx, ly), width, pink=True, shade=index == 0)
    return image


def inventory():
    image = Image.new("RGBA", (32, 32))
    draw = ImageDraw.Draw(image)
    draw.line([(17, 24), (18, 27), (17, 29), (14, 30)], fill="#E7AC99")
    bulb(draw, 16, 11, 23, 17, in_field=False)
    for index, (x, y, width) in enumerate([(25, 4, 4), (16, 1, 4), (6, 6, 4)]):
        leaf(draw, (16, 13), (x, y), width, pink=True, shade=index == 0)
    return image


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for index, stage in enumerate(("sprout", "seedling", "bulking", "mature"), start=1):
        field(stage).save(OUT / f"{index:02d}-{stage}.png", optimize=True)
    inventory().save(OUT / "05-inventory.png", optimize=True)


if __name__ == "__main__":
    main()
