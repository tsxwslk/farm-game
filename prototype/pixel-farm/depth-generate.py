"""Small native-pixel cottage and hard pixel cast shadows; no image generation.

Run: python prototype/pixel-farm/depth-generate.py
Requires existing ground assets and the approved 48x72 cabbage conversion.
"""
from pathlib import Path
import json
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'assets' / 'depth'


def cottage():
    im = Image.new('RGBA', (128, 104))
    raw = ImageDraw.Draw(im)
    class Brush:
        # Scale shape coordinates, but draw native one-pixel edges and details.
        def polygon(self, points, **kw):
            raw.polygon([(round(x*4/3), round(y*4/3)) for x,y in points], **kw)
        def rectangle(self, box, **kw):
            raw.rectangle(tuple(round(v*4/3) for v in box), **kw)
        def line(self, points, **kw):
            raw.line([(round(x*4/3), round(y*4/3)) for x,y in points], **kw)
    d = Brush()
    # Shape remains the same in all comparison modes; the foundation is separate.
    d.polygon([(14, 29), (73, 29), (85, 36), (85, 69), (14, 69)], fill='#715e45')
    d.rectangle((16, 30, 71, 66), fill='#e3d2aa')
    d.polygon([(72, 30), (83, 36), (83, 66), (72, 66)], fill='#bca985')
    for y in [42, 53, 64]:
        d.line([(17, y), (70, y)], fill='#d6c399')
    d.polygon([(6, 33), (19, 9), (68, 9), (89, 35), (86, 38), (6, 36)], fill='#734d39')
    d.polygon([(9, 32), (21, 11), (66, 11), (83, 33)], fill='#b46b4d')
    d.polygon([(66, 11), (84, 33), (88, 35), (70, 11)], fill='#86523c')
    for y in [16, 22, 28]:
        left = 19 - (y-11)//2
        right = 67 + (y-11)*2//3
        d.line([(left, y), (right, y)], fill='#d38c60')
        for x in range(left+5+(y%4), right, 10):
            d.line([(x, y+1), (x-1, y+3)], fill='#965b41')
    d.rectangle((62, 2, 70, 15), fill='#6b7a6c')
    d.rectangle((63, 3, 68, 12), fill='#a7b19a')
    d.rectangle((60, 1, 72, 3), fill='#c7cdb4')
    d.rectangle((25, 42, 43, 57), fill='#715e45')
    d.rectangle((27, 43, 41, 54), fill='#719b96')
    d.rectangle((28, 44, 32, 48), fill='#b6d1bf')
    d.line([(34, 43), (34, 55)], fill='#e9d9b2')
    d.line([(27, 49), (41, 49)], fill='#e9d9b2')
    d.rectangle((23, 57, 45, 59), fill='#9b7a50')
    d.rectangle((52, 39, 67, 67), fill='#70543b')
    d.rectangle((54, 41, 64, 65), fill='#a47b4f')
    d.line([(57, 42), (57, 64)], fill='#c9a16b')
    d.rectangle((63, 52, 64, 54), fill='#e2ca8c')
    d.rectangle((14, 67, 84, 69), fill='#596c60')
    return im


def cast_shadow(image, anchor, length=.5, spread=.7):
    points = []
    alpha = image.getchannel('A')
    for y in range(image.height):
        for x in range(image.width):
            if alpha.getpixel((x, y)) < 128:
                continue
            u, v = x-anchor[0], y-anchor[1]
            points.append((round(u*spread-v*length), round(u*.08-v*length*.46)))
    left, top = min(x for x, y in points)-1, min(y for x, y in points)-1
    right, bottom = max(x for x, y in points)+2, max(y for x, y in points)+2
    result = Image.new('RGBA', (right-left, bottom-top))
    d = ImageDraw.Draw(result)
    for x, y in points:
        d.rectangle((x-left, y-top, x-left+1, y-top+1), fill=(43, 62, 49, 52))
    # Uniform alpha avoids darker self-overlap and preserves clean pixel edges.
    return result, [-left, -top]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    house = cottage()
    house.save(OUT/'cottage.png', optimize=True)
    sources = {
        'cabbage': (ROOT/'assets/ai-cabbage/cabbage-mature-48x72.png', [24, 66], .46),
        'figure': (ROOT/'assets/ground/figure.png', [20, 76], .52),
        'cottage': (OUT/'cottage.png', [64, 94], .66),
    }
    manifest = {'cottage': {'file':'assets/depth/cottage.png','width':128,'height':104,'anchor':[64,94]},'shadows':{}}
    for key, (file, anchor, length) in sources.items():
        shadow, shadow_anchor = cast_shadow(Image.open(file).convert('RGBA'), anchor, length)
        shadow.save(OUT/(key+'-shadow.png'), optimize=True)
        manifest['shadows'][key] = {'file':f'assets/depth/{key}-shadow.png','anchor':shadow_anchor,
                                    'width':shadow.width,'height':shadow.height}
    (ROOT/'depth-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (ROOT/'depth-assets.js').write_text('window.DepthAssets = '+json.dumps(manifest,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf-8')
    print('Generated native cottage, 3 pixel cast shadows and depth manifests.')


if __name__ == '__main__':
    main()
