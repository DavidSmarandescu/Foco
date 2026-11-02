# Genera los iconos PNG de la PWA (anillo ámbar sobre fondo casi negro).
from PIL import Image, ImageDraw
import os

BG = (11, 11, 13, 255)
ACCENT = (242, 180, 65, 255)
OUT = os.path.join(os.path.dirname(__file__), '..', 'public')

def icon(size, maskable=False, radius_ratio=0.22):
    s = size * 4
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if maskable:
        d.rectangle([0, 0, s, s], fill=BG)
        scale = 0.55
    else:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * radius_ratio), fill=BG)
        scale = 0.72
    c = s / 2
    r = s * scale * 0.5 * (12 / 16)
    w = s * scale * (3 / 32) * 1.0
    d.ellipse([c - r - w / 2, c - r - w / 2, c + r + w / 2, c + r + w / 2], fill=ACCENT)
    d.ellipse([c - r + w / 2, c - r + w / 2, c + r - w / 2, c + r - w / 2], fill=BG)
    dot = s * scale * 0.5 * (4.5 / 16)
    d.ellipse([c - dot, c - dot, c + dot, c + dot], fill=ACCENT)
    return img.resize((size, size), Image.LANCZOS)

icon(192).save(os.path.join(OUT, 'icon-192.png'))
icon(512).save(os.path.join(OUT, 'icon-512.png'))
icon(512, maskable=True).save(os.path.join(OUT, 'icon-maskable-512.png'))
icon(180, radius_ratio=0).save(os.path.join(OUT, 'apple-touch-icon.png'))
