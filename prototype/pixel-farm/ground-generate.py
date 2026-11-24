"""Native player placeholder and optional legacy 32px terrains, Python + Pillow.

Run from the repo root: python prototype/pixel-farm/ground-generate.py
The browser composes edges from neighbor masks; these textures have no borders.
"""
from pathlib import Path
import json
import random
import sys
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'assets' / 'ground'
THEMES = {
    'riverside': {'name': '河畔青绿', 'description': '柔和灰绿草地，搭配温暖棕土。',
        'grass': ['#a4b57e', '#b0bf8c', '#94a66f'],
        'bare': ['#c7ae85', '#d1ba93', '#b7a07b'],
        'path': ['#dfcba5', '#ead8b6', '#ceb993'],
        'dry': ['#a17b59', '#b18b67', '#866448'],
        'wet': ['#745b47', '#876b51', '#5e4b3d']},
}
MATERIALS = ['grass', 'bare', 'path', 'dry', 'wet']


def texture(material, colors, variant):
    im = Image.new('RGBA', (32, 32), colors[0])
    d = ImageDraw.Draw(im)
    rng = random.Random(1701 + MATERIALS.index(material)*101 + variant*37)
    if material == 'grass':
        for _ in range(5):
            x, y = rng.randrange(2, 29), rng.randrange(3, 29)
            d.line([(x, y), (x+1, y-1)], fill=colors[2])
        for _ in range(3):
            x, y = rng.randrange(30), rng.randrange(31)
            d.line([(x, y), (x+2, y)], fill=colors[1])
    elif material in ['bare', 'path']:
        for _ in range(6 if material == 'bare' else 4):
            x, y = rng.randrange(2, 26), rng.randrange(2, 29)
            d.line([(x, y), (x+rng.randrange(1, 4), y)], fill=colors[rng.choice([1, 2])])
    else:
        # Fixed phase across 32px cells; color changes don't break the furrows.
        for y in range(5, 32, 8):
            x = -rng.randrange(0, 5)
            while x < 32:
                length = rng.randrange(4, 10)
                d.line([(max(0, x), y), (min(31, x+length), y)], fill=colors[2])
                d.line([(max(0, x+1), y-1), (min(31, x+length-2), y-1)], fill=colors[1])
                if length > 6:
                    d.point((min(31, x+length-1), y+1), fill=colors[2])
                x += length + rng.randrange(2, 5)
        for _ in range(4):
            x, y = rng.randrange(31), rng.randrange(30)
            if y % 8 not in [4, 5]:
                d.point((x, y), fill=colors[rng.choice([1, 2])])
    return im


def figure():
    im = Image.new('RGBA', (40, 80))
    d = ImageDraw.Draw(im)
    d.ellipse((8, 73, 32, 78), fill='#34483930')
    # A scale placeholder with native one-pixel edges, not an enlarged 16px sprite.
    d.polygon([(13, 52), (27, 52), (27, 73), (22, 73), (20, 62), (18, 73), (12, 73)], fill='#384b46')
    d.rectangle((10, 72, 18, 76), fill='#574a3a')
    d.rectangle((22, 72, 30, 76), fill='#574a3a')
    d.line([(12, 73), (16, 73)], fill='#9b8260')
    d.polygon([(10, 32), (28, 32), (32, 51), (28, 58), (11, 58), (7, 51)], fill='#405b5a')
    d.polygon([(12, 33), (26, 33), (28, 54), (11, 54)], fill='#7e9f9c')
    d.rectangle((12, 35, 16, 48), fill='#9fb7ae')
    d.polygon([(10, 35), (7, 37), (5, 52), (9, 53), (12, 40)], fill='#6c8986')
    d.polygon([(28, 35), (32, 38), (34, 51), (30, 53), (27, 40)], fill='#577674')
    d.rectangle((5, 50, 9, 55), fill='#d8b185')
    d.rectangle((30, 50, 34, 55), fill='#d8b185')
    d.rectangle((13, 16, 27, 29), fill='#6b513b')
    d.polygon([(14, 19), (26, 19), (26, 28), (23, 32), (17, 31), (14, 28)], fill='#e8c397')
    d.line([(15, 21), (15, 26)], fill='#f1d6ac')
    d.point((17, 25), fill='#435244'); d.point((24, 25), fill='#435244')
    d.line([(19, 29), (21, 29)], fill='#b48b66')
    d.polygon([(8, 17), (12, 14), (15, 5), (24, 5), (28, 14), (33, 17), (32, 20), (8, 20)], fill='#826344')
    d.polygon([(14, 14), (16, 6), (23, 6), (26, 14)], fill='#d3b57c')
    d.line([(10, 17), (30, 17)], fill='#ead3a0', width=2)
    d.rectangle((14, 13, 26, 14), fill='#9d8057')
    d.polygon([(16, 32), (20, 35), (24, 32), (22, 39), (19, 39)], fill='#e8d8af')
    return im


def legacy_terrain():
    archive = ROOT.parents[1] / 'output' / 'archived-art' / 'riverside'
    archive.mkdir(parents=True, exist_ok=True)
    for key, theme in THEMES.items():
        atlas = Image.new('RGBA', (128, 160))
        for row, material in enumerate(MATERIALS):
            for variant in range(4):
                image = texture(material, theme[material], variant)
                image.save(archive / f'{key}-{material}-{variant}.png', optimize=True)
                atlas.alpha_composite(image, (variant * 32, row * 32))
        atlas.save(archive / f'{key}-atlas.png', optimize=True)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    figure().save(OUT / 'figure.png', optimize=True)
    catalog = {'figure': {'file': 'assets/ground/figure.png', 'width': 40,
                          'height': 80, 'anchor': [20, 76]}}
    (ROOT / 'ground-manifest.json').write_text(
        json.dumps(catalog, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (ROOT / 'ground-assets.js').write_text(
        'window.GroundAssets = ' + json.dumps(catalog, ensure_ascii=False, separators=(',', ':')) + ';\n',
        encoding='utf-8')
    if '--legacy-terrain' in sys.argv:
        legacy_terrain()
    print('Generated player placeholder and manifests.')


if __name__ == '__main__':
    main()
