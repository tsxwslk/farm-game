"""Rebuild the approved 48x72 cabbage from the retained AI source and palette."""
from pathlib import Path
import json
from PIL import Image

ROOT = Path(__file__).resolve().parent


def main():
    settings = json.loads((ROOT/'source/conversion.json').read_text(encoding='utf-8'))
    source = Image.open(ROOT/'source/cabbage-mature.png').convert('RGBA')
    subject = source.crop(tuple(settings['crop']))
    w, h = 48, 72
    scale = min((w-4)/subject.width, (h-6)/subject.height)
    small = subject.resize((round(subject.width*scale), round(subject.height*scale)), Image.Resampling.LANCZOS)
    palette = Image.new('P', (1, 1))
    colors = [component for color in settings['palette'] for component in color]
    palette.putpalette(colors + [0]*(768-len(colors)))
    converted = small.convert('RGB').quantize(palette=palette, dither=Image.Dither.NONE).convert('RGBA')
    mask = small.getchannel('A').point(lambda value: 255 if value >= 128 else 0)
    converted.putalpha(mask)
    cleaned = Image.new('RGBA', converted.size)
    cleaned.paste(converted, (0, 0), mask)
    result = Image.new('RGBA', (w, h))
    result.alpha_composite(cleaned, ((w-cleaned.width)//2, round(h*.92)-cleaned.height))
    destination = ROOT/'assets/ai-cabbage/cabbage-mature-48x72.png'
    destination.parent.mkdir(parents=True, exist_ok=True)
    result.save(destination)
    print('Generated approved 48x72 cabbage with the retained 16-color palette.')


if __name__ == '__main__':
    main()
