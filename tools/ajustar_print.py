"""Converte uma captura de tela para o formato que a Chrome Web Store aceita:
1280x800, PNG de 24 bits, sem transparência (alfa).
Uso:  python tools/ajustar_print.py minha_captura.png [saida.png]
A imagem é reduzida para caber (sem distorcer) e centralizada sobre um fundo azul-escuro."""
import os, sys
from PIL import Image

W, H = 1280, 800


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    src = sys.argv[1]
    dst = sys.argv[2] if len(sys.argv) > 2 else os.path.splitext(src)[0] + "-1280x800.png"
    im = Image.open(src).convert("RGBA")
    fundo = Image.new("RGBA", (W, H), (8, 24, 100, 255))
    im.thumbnail((W, H), Image.Resampling.LANCZOS)
    fundo.paste(im, ((W - im.width) // 2, (H - im.height) // 2), im)
    fundo.convert("RGB").save(dst, "PNG")
    print("ok:", dst)


if __name__ == "__main__":
    main()
