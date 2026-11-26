"""Draw the trial mustard sprites with a common ground anchor."""
from pathlib import Path

from PIL import Image, ImageDraw


OUTPUT = Path(__file__).resolve().parent / "assets" / "mustard"
STAGES = (
    ("01-sprout.png", ((-7, -9, 4), (8, -8, 4))),
    ("02-seedling.png", ((-12, -16, 5), (10, -19, 5), (0, -23, 5))),
    ("03-bulking.png", ((-16, -25, 6), (14, -27, 6), (2, -38, 7), (-6, -32, 6))),
    ("04-mature.png", ((-19, -28, 7), (18, -27, 7), (-10, -44, 8),
                      (9, -45, 7), (1, -53, 8), (-9, -32, 6), (12, -33, 6))),
)


def leaf(draw, root, tip, width, detail):
    dx, dy = tip
    length = (dx * dx + dy * dy) ** 0.5

    def point(along, across):
        return (round(root[0] + dx * along - dy / length * across * width),
                round(root[1] + dy * along + dx / length * across * width))

    edge = [(0.25, 0.4), (0.36, 0.72), (0.43, 0.61), (0.52, 0.97), (0.60, 0.73),
            (0.71, 0.94), (0.76, 0.63), (0.86, 0.63), (0.91, 0.34)]
    side = [(0.25, 0.55), (0.52, 1), (0.74, 0.78), (0.90, 0.48)]
    side = edge if detail else side
    draw.polygon([root, *[point(t, w) for t, w in side], point(1, 0),
                  *[point(t, -w) for t, w in reversed(side)]],
                 fill="#526f35", outline="#30452c")
    draw.polygon([point(0.27, 0), *[point(t, -w * 0.72) for t, w in side],
                  point(0.95, 0), point(0.67, 0.16), point(0.40, 0.20)], fill="#769849")
    draw.line([root, point(0.33, 0), point(0.65, 0.06)], fill="#a9b76d", width=2)
    if detail:
        for along in (0.44, 0.58, 0.72):
            draw.line([point(along, 0), point(along + 0.13, -0.56)], fill="#a3b361")


def plant(size, root, leaves, detail):
    image = Image.new("RGBA", size)
    draw = ImageDraw.Draw(image)
    for dx, dy, width in leaves:
        leaf(draw, root, (dx, dy), width, detail)
    return image


if __name__ == "__main__":
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for index, (name, leaves) in enumerate(STAGES):
        plant((48, 72), (24, 66), leaves, detail=index >= 2).save(OUTPUT / name)
    plant((32, 32), (16, 28), ((-12, -13, 4), (12, -15, 5), (-5, -23, 5),
                              (2, -25, 5), (8, -22, 4)), detail=True).save(OUTPUT / "05-inventory.png")
