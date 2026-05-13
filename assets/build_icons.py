"""Procedural icon + splash generator.

Draws the Thought Tiles–style mark — a yellow point-up hexagon with a
white lightning bolt — on a warm cream background. Output sizes:

  AppIcon  : 1024x1024  flat (Apple masks corners + generates downscales)
  Splash   : 2732x2732  centered on cream with a faint amber halo

Designed against the user's Row 1 col 1 light-mode mockup. Uses Pillow only.
"""

from __future__ import annotations

import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter


REPO = Path(__file__).resolve().parents[1]
APPICON = REPO / "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"
SPLASH_DIR = REPO / "ios/App/App/Assets.xcassets/Splash.imageset"
PREVIEW_DIR = REPO / "assets/preview"
PREVIEW_DIR.mkdir(parents=True, exist_ok=True)

BG = (250, 247, 240)           # warm cream, reads light/airy in both UI modes
HEX_FILL = (251, 191, 36)      # warm gold (Tailwind amber-400-ish)
HEX_HIGHLIGHT = (253, 224, 71) # lighter gold for top-half soft gradient
BOLT_FILL = (255, 255, 255)
GLOW_RGB = (251, 191, 36)


def hex_points(cx: float, cy: float, radius: float) -> list[tuple[float, float]]:
    """Six vertices of a point-up regular hexagon."""
    pts = []
    for i in range(6):
        # Start at 90° (top), step -60° clockwise.
        ang = math.radians(90 - i * 60)
        pts.append((cx + radius * math.cos(ang), cy - radius * math.sin(ang)))
    return pts


def bolt_points(cx: float, cy: float, scale: float) -> list[tuple[float, float]]:
    """SF-Symbol-style bolt.fill outline. `scale` is the hex inradius.

    Coordinate system: (0, 0) at hex centre, +x right, +y down.
    Six points trace the Z-shape — diagonal slash, middle notch, diagonal
    slash, return path on the opposite side. Tuned to read clean at 60px
    (the smallest size iOS will actually display the AppIcon at).
    """
    # Normalised path; scale * 1.0 fills the hex inradius.
    path = [
        (+0.20, -0.62),  # top-right tip
        (-0.18, +0.06),  # right side of mid-notch (lower)
        (+0.22, +0.06),  # mid-notch overhang to the right
        (-0.20, +0.62),  # bottom-left tip
        (+0.18, -0.06),  # left side of mid-notch (upper)
        (-0.22, -0.06),  # mid-notch overhang to the left
    ]
    return [(cx + x * scale, cy + y * scale) for x, y in path]


def draw_hex_with_bolt(
    canvas: int,
    hex_fraction: float,
    *,
    bolt_fraction: float = 0.78,
) -> Image.Image:
    """Renders the bare hex+bolt at 4x supersampling, then downscales for AA.

    `hex_fraction` is the hex circumradius / canvas. `bolt_fraction` is the
    bolt's vertical extent / hex circumradius (smaller = more breathing room).
    """
    sup = 4
    big = canvas * sup
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    cx = cy = big / 2
    radius = big * hex_fraction / 2

    # Subtle inner highlight — draw a slightly larger hex in lighter gold
    # behind the main fill so the top edge picks up a gentle gradient cue.
    d.polygon(hex_points(cx, cy - radius * 0.04, radius), fill=HEX_HIGHLIGHT)
    d.polygon(hex_points(cx, cy, radius), fill=HEX_FILL)

    # Bolt scaled to the hex inradius (radius * cos(30°)) so it never
    # crowds the hex edges.
    inradius = radius * math.cos(math.radians(30))
    d.polygon(bolt_points(cx, cy, inradius * bolt_fraction), fill=BOLT_FILL)

    return img.resize((canvas, canvas), Image.LANCZOS)


def render_app_icon(size: int = 1024) -> Image.Image:
    """Flat cream bg, hex fills ~62% of canvas. Saved as opaque RGB."""
    bg = Image.new("RGB", (size, size), BG)
    fg = draw_hex_with_bolt(size, hex_fraction=0.62)
    bg.paste(fg, (0, 0), fg)
    return bg


def render_splash(size: int = 2732) -> Image.Image:
    """Same mark, much smaller (24% of canvas), with a faint amber halo.

    Cream bg makes the glow much subtler than the dark variant — it reads
    as "warm" rather than "powered." Lower alpha + tighter blur to avoid
    a muddy ring on light backgrounds.
    """
    bg = Image.new("RGB", (size, size), BG)

    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    glow_radius = size * 0.20
    cx = cy = size / 2
    gd.polygon(
        hex_points(cx, cy, glow_radius),
        fill=(*GLOW_RGB, 60),
    )
    glow = glow.filter(ImageFilter.GaussianBlur(radius=size * 0.045))
    bg.paste(glow, (0, 0), glow)

    fg = draw_hex_with_bolt(size, hex_fraction=0.24)
    bg.paste(fg, (0, 0), fg)
    return bg


def main() -> None:
    print(f"[icons] writing AppIcon → {APPICON}")
    APPICON.parent.mkdir(parents=True, exist_ok=True)
    icon = render_app_icon(1024)
    icon.save(APPICON, "PNG", optimize=True)
    icon.save(PREVIEW_DIR / "appicon-1024.png", "PNG", optimize=True)
    icon.resize((180, 180), Image.LANCZOS).save(PREVIEW_DIR / "appicon-180.png", "PNG", optimize=True)
    icon.resize((60, 60), Image.LANCZOS).save(PREVIEW_DIR / "appicon-60.png", "PNG", optimize=True)

    print(f"[icons] writing Splash trio → {SPLASH_DIR}")
    splash = render_splash(2732)
    for name in ("splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"):
        splash.save(SPLASH_DIR / name, "PNG", optimize=True)
    splash.resize((683, 683), Image.LANCZOS).save(PREVIEW_DIR / "splash-683.png", "PNG", optimize=True)

    print("[icons] done. Preview thumbnails in assets/preview/")


if __name__ == "__main__":
    main()
