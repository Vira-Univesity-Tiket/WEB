from __future__ import annotations

import os
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
ICONS_DIR = PUBLIC / "icons"

VIRA_PRIMARY = (0x36, 0x74, 0xB5)    # #3674B5
VIRA_SECONDARY = (0x57, 0x8F, 0xCA)  # #578FCA
WHITE = (255, 255, 255)


def lerp(a: int, b: int, t: float) -> int:
    return int(round(a + (b - a) * t))


def gradient_bg(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    px = img.load()
    for y in range(size):
        t = y / (size - 1) if size > 1 else 0
        r = lerp(VIRA_PRIMARY[0], VIRA_SECONDARY[0], t)
        g = lerp(VIRA_PRIMARY[1], VIRA_SECONDARY[1], t)
        b = lerp(VIRA_PRIMARY[2], VIRA_SECONDARY[2], t)
        for x in range(size):
            px[x, y] = (r, g, b, 255)
    return img


def rounded_rect(draw: ImageDraw.ImageDraw, xy, radius: int, fill):
    draw.rounded_rectangle(xy, radius=radius, fill=fill)


def draw_van(draw: ImageDraw.ImageDraw, size: int, pad: int) -> None:
    # A simple "van" glyph: body + cabin + windows + wheels (vector-like).
    s = size
    p = pad

    body_top = int(s * 0.38)
    body_bottom = int(s * 0.70)
    body_left = p
    body_right = s - p
    r = int(s * 0.08)

    # Body
    rounded_rect(draw, (body_left, body_top, body_right, body_bottom), radius=r, fill=WHITE)

    # Cabin cut (front)
    cabin_w = int(s * 0.22)
    cabin_left = body_right - cabin_w
    cabin_top = int(s * 0.32)
    rounded_rect(draw, (cabin_left, cabin_top, body_right, body_bottom), radius=r, fill=WHITE)

    # Windows (blue-ish cutouts -> use transparent overlay by drawing bg-colored windows)
    win_fill = (0x2B, 0x5E, 0x9A, 255)  # darker than primary for contrast
    win_h = int(s * 0.10)
    win_top = int(s * 0.44)

    # Main window
    rounded_rect(
        draw,
        (int(s * 0.26), win_top, int(s * 0.60), win_top + win_h),
        radius=int(s * 0.03),
        fill=win_fill,
    )
    # Cabin window
    rounded_rect(
        draw,
        (int(s * 0.64), int(s * 0.40), int(s * 0.78), int(s * 0.52)),
        radius=int(s * 0.03),
        fill=win_fill,
    )

    # Door line
    line_x = int(s * 0.62)
    draw.rectangle((line_x, int(s * 0.40), line_x + int(s * 0.01), int(s * 0.68)), fill=win_fill)

    # Wheels
    wheel_r = int(s * 0.075)
    wheel_y = int(s * 0.72)
    wheel1_x = int(s * 0.34)
    wheel2_x = int(s * 0.72)
    for cx in (wheel1_x, wheel2_x):
        draw.ellipse((cx - wheel_r, wheel_y - wheel_r, cx + wheel_r, wheel_y + wheel_r), fill=(20, 30, 40, 255))
        inner = int(wheel_r * 0.45)
        draw.ellipse((cx - inner, wheel_y - inner, cx + inner, wheel_y + inner), fill=(210, 220, 230, 255))


def make_icon(size: int, maskable: bool = False) -> Image.Image:
    base = gradient_bg(size)
    draw = ImageDraw.Draw(base)

    # Rounded outer corners (to look good on Android/iOS while still safe).
    corner_radius = int(size * 0.18)
    mask = Image.new("L", (size, size), 0)
    mdraw = ImageDraw.Draw(mask)
    mdraw.rounded_rectangle((0, 0, size, size), radius=corner_radius, fill=255)
    base.putalpha(mask)

    pad = int(size * (0.18 if maskable else 0.14))
    draw_van(draw, size=size, pad=pad)
    return base


def write_png(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, format="PNG", optimize=True)


def write_favicon_ico(paths: list[Path], out_path: Path) -> None:
    # Build an .ico with multiple sizes
    imgs = [Image.open(p).convert("RGBA") for p in paths]
    out_path.parent.mkdir(parents=True, exist_ok=True)
    imgs[0].save(out_path, format="ICO", sizes=[im.size for im in imgs], append_images=imgs[1:])


def main() -> None:
    ICONS_DIR.mkdir(parents=True, exist_ok=True)

    # App icons
    icon_192 = make_icon(192, maskable=False)
    icon_512 = make_icon(512, maskable=False)
    mask_192 = make_icon(192, maskable=True)
    mask_512 = make_icon(512, maskable=True)

    write_png(icon_192, ICONS_DIR / "icon-192.png")
    write_png(icon_512, ICONS_DIR / "icon-512.png")
    write_png(mask_192, ICONS_DIR / "icon-maskable-192.png")
    write_png(mask_512, ICONS_DIR / "icon-maskable-512.png")

    # Apple touch icon
    write_png(make_icon(180, maskable=False), PUBLIC / "apple-touch-icon.png")

    # Favicons
    fav16 = make_icon(16, maskable=False)
    fav32 = make_icon(32, maskable=False)
    fav48 = make_icon(48, maskable=False)
    write_png(fav16, PUBLIC / "favicon-16.png")
    write_png(fav32, PUBLIC / "favicon-32.png")
    write_png(fav48, PUBLIC / "favicon-48.png")
    write_favicon_ico([PUBLIC / "favicon-16.png", PUBLIC / "favicon-32.png", PUBLIC / "favicon-48.png"], PUBLIC / "favicon.ico")

    print("✅ Icons generated in public/ and public/icons/")


if __name__ == "__main__":
    main()

