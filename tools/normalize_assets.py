"""Normalisasi gambar aksara Jawa: crop ke bbox tinta, samakan tinggi glyph, beri padding."""
import os
from PIL import Image

SRC = os.path.join(os.path.dirname(__file__), "..", "aksara_jawa")
DST = os.path.join(os.path.dirname(__file__), "..", "assets", "aksara")

INK_H = 300
PAD = 26


def main():
    os.makedirs(DST, exist_ok=True)
    names = sorted(f for f in os.listdir(SRC) if f.endswith(".png"))
    for f in names:
        im = Image.open(os.path.join(SRC, f)).convert("RGBA")
        bb = im.getchannel("A").getbbox()
        ink = im.crop(bb)
        w, h = ink.size
        scale = INK_H / h
        nw, nh = max(1, round(w * scale)), INK_H
        ink = ink.resize((nw, nh), Image.LANCZOS)
        canvas = Image.new("RGBA", (nw + PAD * 2, nh + PAD * 2), (0, 0, 0, 0))
        canvas.paste(ink, (PAD, PAD), ink)
        out = os.path.join(DST, f)
        canvas.save(out, optimize=True)
        print(f"{f:10s} {w}x{h} -> {canvas.size[0]}x{canvas.size[1]}")


if __name__ == "__main__":
    main()
