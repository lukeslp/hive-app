#!/usr/bin/env python3
# pyright: ignore[reportMissingModuleSource]

"""Purpose: Build platform launcher/PWA/App Store PNGs plus native splash PNGs.

Primary functions:
  • Auto-trim rounded “iOS preview” whites from exports (squircle halo), then normalize to 1024².
  • PIL LANCZOS resize fan-out → iOS AppIcon, Android mipmap densities, web/PWA PNGs.
  • Center normalized icon on a flat background (inferred from icon edges unless --splash-bg)
    → Capacitor iOS Splash.imageset 2732² + every Android drawable*-splash PNG bucket.

I/O:
  Inputs: Default `assets/branding/idea-tiles-app-icon-master.png` OR `--source PATH`
          (typically 1024×1024 PNG; may ship with flat white corners from design export).

  Outputs:
    Master (overwrite when --source differs from default workflow):
      assets/branding/idea-tiles-app-icon-master.png

    iOS: ios/App/.../AppIcon.appiconset/AppIcon-{light,dark}-1024.png
         ios/App/.../Splash.imageset/splash-{light,dark}-2732.png

    Android:
      android/.../mipmap-*/ic_launcher*.png (+ foreground adaptive layer dp→px scales)
      android/.../drawable[-*]/splash.png qualifier set
      android/.../values/ic_launcher_background.xml (adaptive outer ring tint)

    Web/PWA under client/public/:
      site.webmanifest        (referenced from index.html; Android install UX)
      icons/icon-192.png, icon-512.png, icon-512-maskable.png, apple-touch-icon.png, favicon-32x32.png

CLI:
    python3 assets/sync_app_icon_from_master.py [--source EXPORT.png]
        [--splash-bg HEX] [--manifest-theme HEX]

Capacitor SplashScreen.backgroundColor in capacitor.config.ts should match the inferred/override splash fill
so the transient pre-render flash blends with splash artwork.
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path

from PIL import Image


REPO = Path(__file__).resolve().parents[1]
DEFAULT_MASTER = REPO / "assets/branding/idea-tiles-app-icon-master.png"
IOS_DIR = REPO / "ios/App/App/Assets.xcassets/AppIcon.appiconset"
ANDROID_BASE = REPO / "android/app/src/main/res"
IOS_SPLASH_DIR = REPO / "ios/App/App/Assets.xcassets/Splash.imageset"
WEB_PUBLIC = REPO / "client/public"
WEB_ICONS_DIR = WEB_PUBLIC / "icons"
WEB_MASTER_PX = 1024
IOS_SPLASH_PX = 2732

# Capacitor / Android qualifier targets (PNG pixel size for each drawable bucket).
ANDROID_SPLASH_SIZES: list[tuple[str, int, int]] = [
    ("drawable", 480, 320),
    ("drawable-port-mdpi", 320, 480),
    ("drawable-land-mdpi", 480, 320),
    ("drawable-port-hdpi", 480, 800),
    ("drawable-land-hdpi", 800, 480),
    ("drawable-port-xhdpi", 720, 1280),
    ("drawable-land-xhdpi", 1280, 720),
    ("drawable-port-xxhdpi", 960, 1600),
    ("drawable-land-xxhdpi", 1600, 960),
    ("drawable-port-xxxhdpi", 1280, 1920),
    ("drawable-land-xxxhdpi", 1920, 1280),
]

LEGACY_LAUNCHER_SIZES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}

FOREGROUND_SIZES = {
    "mipmap-mdpi": 108,
    "mipmap-hdpi": 162,
    "mipmap-xhdpi": 216,
    "mipmap-xxhdpi": 324,
    "mipmap-xxxhdpi": 432,
}

# Corners brighter than this are treated as flat white “preview” frame when deciding
# whether to peel a baked-in squircle.
WHITE_CORNER_MAX_RGB = 246
# Halo trim exits only once corners duck under this tighter bar so LANCZOS upsamples
# to 1024² do not reintroduce pastel corners at canvas edges.
INNER_TRIM_UNTIL_UNDER = 245

_HEX_RE = re.compile(r"^\s*#?([0-9a-fA-F]{6})\s*$")


def _parse_hex_rgb(value: str) -> tuple[int, int, int]:
    m = _HEX_RE.match(value)
    if not m:
        raise SystemExit(f"Expected #RRGGBB hex color, got: {value!r}")
    h = m.group(1)
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def _rgb_hex_lowercase(rgb: tuple[int, int, int]) -> str:
    return f"#{rgb[0]:02x}{rgb[1]:02x}{rgb[2]:02x}"


def _normalize_hex_display(value: str) -> str:
    """Normalize user hex (optional `#`) into `#rrggbb` for manifest strings."""
    return _rgb_hex_lowercase(_parse_hex_rgb(value))


def _infer_canvas_bg_rgb(im_rgb: Image.Image, region_px: int = 24) -> tuple[int, int, int]:
    """Average RGB near the four corners of the normalized master (matches panel tint)."""
    w, h = im_rgb.size
    if w < region_px + 2 or h < region_px + 2:
        raise SystemExit("_infer_canvas_bg_rgb: normalized master unexpectedly small")

    coords: list[tuple[int, int]] = []
    for x in range(region_px):
        for y in range(region_px):
            coords.append((x, y))
            coords.append((w - 1 - x, y))
            coords.append((x, h - 1 - y))
            coords.append((w - 1 - x, h - 1 - y))

    px = im_rgb.load()
    r_sum = g_sum = b_sum = 0
    for x, y in coords:
        t = px[x, y][:3]
        r_sum += t[0]
        g_sum += t[1]
        b_sum += t[2]
    n = len(coords)
    return r_sum // n, g_sum // n, b_sum // n


def _splash_logo_side(canvas_w: int, canvas_h: int) -> int:
    short = min(canvas_w, canvas_h)
    target = int(short * 0.26)
    return max(96, min(target, short - 32, min(900, WEB_MASTER_PX)))


def _compose_splash(
    canvas_w: int,
    canvas_h: int,
    norm_icon_rgba: Image.Image,
    bg_rgb: tuple[int, int, int],
) -> Image.Image:
    canvas = Image.new("RGB", (canvas_w, canvas_h), bg_rgb)
    side = _splash_logo_side(canvas_w, canvas_h)
    logo = _resize_png(norm_icon_rgba, side).convert("RGBA")
    ox = (canvas_w - side) // 2
    oy = (canvas_h - side) // 2
    canvas.paste(logo, (ox, oy), logo)
    return canvas


def _write_android_launcher_background_color(theme_hex: str) -> None:
    hex_no_prefix = theme_hex.strip()
    if hex_no_prefix.startswith("#"):
        hex_no_prefix = hex_no_prefix[1:]
    xml = (
        "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n"
        "<resources>\n"
        "    <!-- Synced via assets/sync_app_icon_from_master.py (--splash-bg or inferred edges). "
        "-->\n"
        f'    <color name="ic_launcher_background">#{hex_no_prefix}</color>\n'
        "</resources>\n"
    )
    path = ANDROID_BASE / "values" / "ic_launcher_background.xml"
    path.write_text(xml, encoding="utf-8")
    print(f"Wrote → {path.relative_to(REPO)}")


def _write_native_splash_pngs(norm_icon_rgba: Image.Image, bg_rgb: tuple[int, int, int]) -> None:
    IOS_SPLASH_DIR.mkdir(parents=True, exist_ok=True)
    ios = _compose_splash(IOS_SPLASH_PX, IOS_SPLASH_PX, norm_icon_rgba, bg_rgb)
    ios_light = IOS_SPLASH_DIR / "splash-light-2732.png"
    ios_dark = IOS_SPLASH_DIR / "splash-dark-2732.png"
    ios.save(ios_light, "PNG", optimize=True)
    ios.save(ios_dark, "PNG", optimize=True)
    print(f"Wrote iOS splash → {ios_light.relative_to(REPO)}, {ios_dark.relative_to(REPO)}")

    for folder_name, cw, ch in ANDROID_SPLASH_SIZES:
        out_dir = ANDROID_BASE / folder_name
        out_dir.mkdir(parents=True, exist_ok=True)
        shot = _compose_splash(cw, ch, norm_icon_rgba, bg_rgb)
        shot.save(out_dir / "splash.png", "PNG", optimize=True)


def _resize_png(im: Image.Image, px: int) -> Image.Image:
    return im.resize((px, px), Image.Resampling.LANCZOS)


def _corner_brightness_max_rgb(im_rgb: Image.Image) -> float:
    """Max RGB component across the four corners of the image."""
    w, h = im_rgb.size
    if w < 2 or h < 2:
        raise SystemExit("_corner_brightness_max_rgb: image too small")
    px = im_rgb.load()
    pts = ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1))
    brightest = 0.0
    for x, y in pts:
        r, g, b = px[x, y][:3]
        brightest = max(brightest, float(r), float(g), float(b))
    return brightest


def _needs_squircle_trim(im: Image.Image) -> bool:
    return _corner_brightness_max_rgb(im.convert("RGB")) >= WHITE_CORNER_MAX_RGB


def _squircle_trim_to_square_rgb(im_rgb: Image.Image) -> Image.Image:
    """Shrink a centered crop until navy panel reaches all four corners (no white halo)."""
    width, height = im_rgb.size
    side = min(width, height)
    cx = width // 2
    cy = height // 2
    brightest_corner = 255.0
    while side > 96:
        sx = cx - side // 2
        sy = cy - side // 2
        crop_rgb = im_rgb.crop((sx, sy, sx + side, sy + side))
        brightest_corner = _corner_brightness_max_rgb(crop_rgb)
        if brightest_corner < INNER_TRIM_UNTIL_UNDER:
            return crop_rgb
        side -= 2

    raise SystemExit(
        "_squircle_trim_to_square_rgb: could not peel white squircle halo — try a sharper export."
    )


def _prepare_master_canvas(im_raw: Image.Image) -> Image.Image:
    rgba = im_raw.convert("RGBA")
    rgb = rgba.convert("RGB")
    trimmed = rgb
    if _needs_squircle_trim(trimmed):
        trimmed = _squircle_trim_to_square_rgb(trimmed)

    tw, th = trimmed.size
    if tw != th:
        side = min(tw, th)
        lx = (tw - side) // 2
        ty = (th - side) // 2
        trimmed = trimmed.crop((lx, ty, lx + side, ty + side))

    if trimmed.size != (WEB_MASTER_PX, WEB_MASTER_PX):
        trimmed = trimmed.resize((WEB_MASTER_PX, WEB_MASTER_PX), Image.Resampling.LANCZOS)

    return trimmed.convert("RGBA")


def _write_web_manifest(theme_hex: str) -> None:
    body = """{
  "$schema": "https://json.schemastore.org/web-manifest-combined.json",
  "name": "Idea Tiles",
  "short_name": "Idea Tiles",
  "description": "Brainstorm on a hex tile canvas with optional on-device or BYO-key AI.",
  "id": "./",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "orientation": "any",
  "background_color": "{{BG}}",
  "theme_color": "{{BG}}",
  "categories": ["productivity", "utilities"],
  "icons": [
    {
      "src": "./icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "./icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "./icons/icon-512-maskable.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable any"
    }
  ]
}
""".replace(
        "{{BG}}", theme_hex
    )
    out = WEB_PUBLIC / "site.webmanifest"
    out.write_text(body, encoding="utf-8")
    print(f"Wrote → {out.relative_to(REPO)}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source",
        type=Path,
        help="Alternate square export to normalize (writes cleaned 1024 master + all targets)",
    )
    parser.add_argument(
        "--manifest-theme",
        default=None,
        help="Web manifest + Android adaptive tint hex (defaults to splash fill color)",
    )
    parser.add_argument(
        "--splash-bg",
        default=None,
        help="Splash screen solid fill (#RRGGBB); default: averaged RGB from normalized icon corners",
    )
    args = parser.parse_args()

    src = args.source or DEFAULT_MASTER
    if not Path(src).is_file():
        raise SystemExit(f"Missing source image: {src}")

    raw = Image.open(src)
    normalized_rgba = _prepare_master_canvas(raw)

    DEFAULT_MASTER.parent.mkdir(parents=True, exist_ok=True)
    if args.source is not None:
        normalized_rgba.convert("RGB").save(DEFAULT_MASTER, "PNG", optimize=True)
        print(f"Wrote normalized master → {DEFAULT_MASTER.relative_to(REPO)}")
    elif not DEFAULT_MASTER.is_file():
        normalized_rgba.convert("RGB").save(DEFAULT_MASTER, "PNG", optimize=True)
        print(f"Wrote new master → {DEFAULT_MASTER.relative_to(REPO)}")
    im = normalized_rgba

    splash_rgb = (
        _parse_hex_rgb(args.splash_bg)
        if args.splash_bg
        else _infer_canvas_bg_rgb(im.convert("RGB"))
    )
    theme_hex = (
        _normalize_hex_display(args.manifest_theme)
        if args.manifest_theme is not None
        else _rgb_hex_lowercase(splash_rgb)
    )

    ios_rgb = im.convert("RGB")
    IOS_DIR.mkdir(parents=True, exist_ok=True)
    ios_light = IOS_DIR / "AppIcon-light-1024.png"
    ios_dark = IOS_DIR / "AppIcon-dark-1024.png"
    ios_rgb.save(ios_light, "PNG", optimize=True)
    ios_rgb.save(ios_dark, "PNG", optimize=True)
    print(f"Wrote iOS → {ios_light.relative_to(REPO)}, {ios_dark.relative_to(REPO)}")

    for folder, px in LEGACY_LAUNCHER_SIZES.items():
        out_dir = ANDROID_BASE / folder
        out_dir.mkdir(parents=True, exist_ok=True)
        png = _resize_png(im, px)
        for name in ("ic_launcher.png", "ic_launcher_round.png"):
            png.convert("RGBA").save(out_dir / name, "PNG", optimize=True)

    for folder, px in FOREGROUND_SIZES.items():
        out_dir = ANDROID_BASE / folder
        _resize_png(im, px).convert("RGBA").save(
            out_dir / "ic_launcher_foreground.png", "PNG", optimize=True
        )

    WEB_ICONS_DIR.mkdir(parents=True, exist_ok=True)
    icon192 = _resize_png(im, 192).convert("RGBA")
    icon512 = _resize_png(im, 512).convert("RGBA")
    icon192.save(WEB_ICONS_DIR / "icon-192.png", "PNG", optimize=True)
    icon512.save(WEB_ICONS_DIR / "icon-512.png", "PNG", optimize=True)
    icon512.save(WEB_ICONS_DIR / "icon-512-maskable.png", "PNG", optimize=True)

    apple = _resize_png(im, 180).convert("RGBA")
    apple.save(WEB_ICONS_DIR / "apple-touch-icon.png", "PNG", optimize=True)

    fav32 = _resize_png(im, 32).convert("RGBA")
    fav32.save(WEB_ICONS_DIR / "favicon-32x32.png", "PNG", optimize=True)

    _write_native_splash_pngs(im, splash_rgb)
    _write_android_launcher_background_color(theme_hex)
    _write_web_manifest(theme_hex)

    print("Wrote Android mipmap launcher + foreground PNGs + drawable splash qualifiers.")
    print(
        "Wrote web PWA icons + site.webmanifest under client/public/"
        "(index.html manifest link + optional sw.js)."
    )
    print(
        "Splash fill + adaptive ring →",
        theme_hex,
        "| Set Capacitor plugins.SplashScreen.backgroundColor to match (see capacitor.config.ts).",
    )


if __name__ == "__main__":
    main()
