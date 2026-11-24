"""Generate hard pixel cast shadows for the scene sprites.

Run: python prototype/pixel-farm/depth-generate.py
Requires the figure, harvest crate, cottage and jar assets.
"""
from pathlib import Path
import json
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'assets' / 'depth'


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
    house_manifest = ROOT / 'assets' / 'house' / 'house-cottage-manifest.json'
    house = json.loads(house_manifest.read_text(encoding='utf-8'))['metrics']
    crate = json.loads((ROOT/'assets/crate/crate-manifest.json').read_text(encoding='utf-8'))['sprite']
    jar = json.loads((ROOT/'assets/jar/jar-manifest.json').read_text(encoding='utf-8'))['sprite']
    sources = {
        'figure': (ROOT/'assets/ground/figure.png', [20, 76], .52),
        'cottage': (ROOT/house['file'], house['anchor'], .66),
        'crate': (ROOT/crate['file'], crate['anchor'], .46),
        'jar': (ROOT/jar['file'], jar['anchor'], .46),
    }
    manifest = {
        'cottage': {'file': house['file'], 'width': house['size'][0],
                    'height': house['size'][1], 'anchor': house['anchor']},
        'crate': {'file':crate['file'],'anchor':crate['anchor']},
        'jar': {'file': jar['file'], 'anchor': jar['anchor']},
        'shadows':{},
    }
    for key, (file, anchor, length) in sources.items():
        shadow, shadow_anchor = cast_shadow(Image.open(file).convert('RGBA'), anchor, length)
        shadow.save(OUT/(key+'-shadow.png'), optimize=True)
        manifest['shadows'][key] = {'file':f'assets/depth/{key}-shadow.png','anchor':shadow_anchor,
                                    'width':shadow.width,'height':shadow.height}
    (ROOT/'depth-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (ROOT/'depth-assets.js').write_text('window.DepthAssets = '+json.dumps(manifest,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf-8')
    print(f'Generated {len(sources)} pixel cast shadows and depth manifests.')


if __name__ == '__main__':
    main()
