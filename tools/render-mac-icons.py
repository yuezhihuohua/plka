"""Render the existing app logo and a crisp monochrome Plka menu-bar mark."""
from pathlib import Path
import sys
from PIL import Image, ImageDraw

source, iconset, resources = map(Path, sys.argv[1:])
logo = Image.open(source).convert('RGBA')
for n in [16, 32, 128, 256, 512]:
    for scale in [1, 2]:
        logo.resize((n * scale, n * scale), Image.Resampling.LANCZOS).save(
            iconset / f'icon_{n}x{n}{"@2x" if scale == 2 else ""}.png')

# A bold P and the exposed edge of a second reference card. Draw at 8x,
# then downsample for smooth edges without a coloured badge/background.
scale = 8
mark = Image.new('RGBA', (18 * scale, 18 * scale))
draw = ImageDraw.Draw(mark)
def box(values):
    return tuple(round(v * scale) for v in values)
black = (0, 0, 0, 255)
draw.rounded_rectangle(box((2, 5, 4, 16)), radius=scale, fill=black)
draw.rounded_rectangle(box((5, 2, 16, 12)), radius=4 * scale, fill=black)
draw.rounded_rectangle(box((5, 2, 8, 16)), radius=scale, fill=black)
draw.rounded_rectangle(box((8, 5, 13, 9)), radius=2 * scale, fill=(0, 0, 0, 0))
for pixels, suffix in [(18, ''), (36, '@2x')]:
    mark.resize((pixels, pixels), Image.Resampling.LANCZOS).save(
        resources / f'PlkaStatus{suffix}.png')
