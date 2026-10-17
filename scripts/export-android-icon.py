#!/usr/bin/env python3
"""Export the Android launcher icon from the iOS app icon.

On iOS the question-mark tile sits in the lower-right corner, where an Android
circle mask cuts it off. This script moves that tile one step up-left along the
hex grid, fills its old cell with the tile that was there, and centres the
72dp visible area on it, so the tile sits inside the 66dp safe zone under
every launcher mask. The monochrome layer is the same hexagon with the
question mark cut out.

Requires Pillow and numpy. Run from the repository root:

    python3 scripts/export-android-icon.py
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
MASTER = ROOT / "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-light-1024.png"
RES = ROOT / "android/app/src/main/res"
DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}

TILE = (747, 768)           # centre of the question-mark tile in the master
STEP = (227, 399)           # hex-grid step from the tile above-left to it
TILE_HALF = (200, 219)      # half width and half height of one tile
CELL_HALF = (222, 266)      # half width and half height of one grid cell
VIEW_CENTRE = (520, 400)    # centre of the 72dp visible area, in master pixels
VIEW_SIZE = 800             # master pixels shown across the 72dp visible area
LAYER = 432                 # 108dp at xxxhdpi


def hexagon(size, centre, half_w, half_h, blur=0):
    mask = Image.new("L", size, 0)
    x, y = centre
    ImageDraw.Draw(mask).polygon(
        [(x, y - half_h), (x + half_w, y - half_h / 2), (x + half_w, y + half_h / 2),
         (x, y + half_h), (x - half_w, y + half_h / 2), (x - half_w, y - half_h / 2)], fill=255)
    return mask.filter(ImageFilter.GaussianBlur(blur)) if blur else mask


def shifted(img, dx, dy):
    out = Image.new(img.mode, img.size)
    out.paste(img, (dx, dy))
    return out


def recompose(master):
    new_tile = (TILE[0] - STEP[0], TILE[1] - STEP[1])
    art = master.copy()
    # Fill the tile's old cell with the cell above-left of it (one grid step away).
    art.paste(shifted(master, *STEP), (0, 0),
              hexagon(master.size, TILE, CELL_HALF[0] + 14, CELL_HALF[1] + 14, 8))
    # Put the tile, with its glow and surrounding gap, on that cell.
    art.paste(shifted(master, -STEP[0], -STEP[1]), (0, 0),
              hexagon(master.size, new_tile, TILE_HALF[0] + 40, TILE_HALF[1] + 40, 10))
    # Monochrome: the tile hexagon with the white question mark cut out.
    hsv = np.asarray(master.convert("HSV")).astype(float)
    white = (hsv[..., 1] < 64) & (hsv[..., 2] > 215)
    inside = np.asarray(hexagon(master.size, TILE, TILE_HALF[0] - 24, TILE_HALF[1] - 24)) > 0
    glyph = Image.fromarray(((white & inside) * 255).astype("uint8")).filter(ImageFilter.MedianFilter(5))
    glyph = shifted(glyph, -STEP[0], -STEP[1])
    shape = np.asarray(hexagon(master.size, new_tile, *TILE_HALF, blur=1)).astype(float)
    mono = np.clip(shape - np.asarray(glyph.filter(ImageFilter.GaussianBlur(1))), 0, 255).astype("uint8")
    return art, Image.fromarray(mono)


def layer(img, mode):
    """Crop the 108dp layer around the visible area, mirroring past the master's edges."""
    arr = np.asarray(img)
    half = VIEW_SIZE * 1.5 / 2
    x0, y0 = round(VIEW_CENTRE[0] - half), round(VIEW_CENTRE[1] - half)
    x1, y1 = round(VIEW_CENTRE[0] + half), round(VIEW_CENTRE[1] + half)
    h, w = arr.shape[:2]
    pads = (max(0, -y0), max(0, y1 - h)), (max(0, -x0), max(0, x1 - w))
    pads = pads + ((0, 0),) if arr.ndim == 3 else pads
    big = np.pad(arr, pads, mode="reflect" if mode == "RGB" else "constant")
    top, left = pads[0][0], pads[1][0]
    crop = Image.fromarray(big[y0 + top:y1 + top, x0 + left:x1 + left])
    return crop.resize((LAYER, LAYER), Image.LANCZOS)


def legacy(fg, size, round_icon):
    inner = round(size * 44 / 48)
    big = inner * 4
    mask = Image.new("L", (big, big), 0)
    draw = ImageDraw.Draw(mask)
    if round_icon:
        draw.ellipse([0, 0, big - 1, big - 1], fill=255)
    else:
        draw.rounded_rectangle([0, 0, big - 1, big - 1], radius=round(big * 0.18), fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    off = (size - inner) // 2
    visible = fg.crop((72, 72, 360, 360)).resize((inner, inner), Image.LANCZOS)
    out.paste(visible, (off, off), mask.resize((inner, inner), Image.LANCZOS))
    return out


def main():
    master = Image.open(MASTER).convert("RGB")
    art, mono_alpha = recompose(master)
    fg = layer(art, "RGB").convert("RGBA")
    mono = Image.new("RGBA", (LAYER, LAYER), (255, 255, 255, 0))
    mono.putalpha(layer(mono_alpha, "L"))
    for name, scale in DENSITIES.items():
        folder = RES / f"mipmap-{name}"
        px = round(108 * scale)
        fg.resize((px, px), Image.LANCZOS).save(folder / "ic_launcher_foreground.png", optimize=True)
        mono.resize((px, px), Image.LANCZOS).save(folder / "ic_launcher_monochrome.png", optimize=True)
        for round_icon, file in ((False, "ic_launcher.png"), (True, "ic_launcher_round.png")):
            legacy(fg, round(48 * scale), round_icon).save(folder / file, optimize=True)
    print(f"wrote launcher layers to {RES.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
