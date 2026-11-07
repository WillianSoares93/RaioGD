"""Gera a identidade visual do Raio (ícone, .ico, ícones da extensão, imagens do instalador).
Uso:  python tools/gerar_icones.py        (precisa do Pillow: pip install pillow)
Saídas: raio.ico, extension/icons/*.png, assets/*, assets/icone_embutido.txt (trecho para o raio.py)."""
import base64, io, os, sys
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont, ImageOps

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = 1024                                            # tamanho de trabalho (depois reduzido)
AZUL_CLARO, AZUL_ESCURO = (47, 123, 255), (10, 36, 140)
OURO_CLARO, OURO_ESCURO = (255, 236, 140), (255, 168, 0)
# o raio, em coordenadas de 0 a 1
RAIO = [(0.585, 0.085), (0.225, 0.545), (0.445, 0.545), (0.385, 0.925), (0.785, 0.405), (0.555, 0.405)]


def degrade_diagonal(c1, c2, tam):
    v = Image.linear_gradient("L").resize((tam, tam))
    h = v.transpose(Image.Transpose.ROTATE_90).transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    return ImageOps.colorize(ImageChops.add(v, h, scale=2), black=c1, white=c2).convert("RGBA")


def degrade_vertical(c1, c2, w, h):
    return ImageOps.colorize(Image.linear_gradient("L").resize((w, h)), black=c1, white=c2).convert("RGBA")


def icone_mestre():
    """Quadrado arredondado azul com o raio dourado."""
    base = degrade_diagonal(AZUL_CLARO, AZUL_ESCURO, S)
    brilho = Image.new("RGBA", (S, S), (0, 0, 0, 0))                   # luz suave no canto superior esquerdo
    ImageDraw.Draw(brilho).ellipse((-S * .35, -S * .45, S * .75, S * .5), fill=(255, 255, 255, 40))
    base = Image.alpha_composite(base, brilho.filter(ImageFilter.GaussianBlur(S * .11)))
    escala, dy = 0.92, 0.0
    pts = [(S * (0.5 + (x - 0.5) * escala), S * (0.5 + (y - 0.5) * escala + dy)) for x, y in RAIO]
    sombra = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(sombra).polygon([(x + S * .015, y + S * .025) for x, y in pts], fill=(5, 15, 70, 150))
    base = Image.alpha_composite(base, sombra.filter(ImageFilter.GaussianBlur(S * .02)))
    mascara = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mascara).polygon(pts, fill=255)
    ouro = degrade_vertical(OURO_CLARO, OURO_ESCURO, S, S)
    base.paste(ouro, (0, 0), mascara)
    recorte = Image.new("L", (S, S), 0)                                # cantos arredondados
    ImageDraw.Draw(recorte).rounded_rectangle((0, 0, S - 1, S - 1), radius=int(S * .225), fill=255)
    base.putalpha(ImageChops.multiply(base.getchannel("A"), recorte))
    return base


def reduzir(img, tam):
    return img.resize((tam, tam), Image.Resampling.LANCZOS)


def cinza(img):
    """Versão 'desligado': sem cor e mais apagada."""
    a = img.getchannel("A")
    g = ImageOps.grayscale(img.convert("RGB")).point(lambda v: int(v * 0.75 + 40))
    out = Image.merge("RGBA", (g, g, g, a.point(lambda v: int(v * 0.85))))
    return out


def png_bytes(img):
    b = io.BytesIO()
    img.save(b, "PNG", optimize=True)
    return b.getvalue()


def imagem_grande_instalador(mestre):
    """164x314: painel lateral do assistente de instalação (Inno Setup)."""
    w, h = 164, 314
    im = degrade_vertical((24, 70, 210), (8, 24, 100), w, h)
    ic = reduzir(mestre, 96)
    im.paste(ic, ((w - 96) // 2, 46), ic)
    d = ImageDraw.Draw(im)
    negrito = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 34)
    normal = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 13)
    d.text((w // 2, 172), "Raio", font=negrito, fill="white", anchor="mm")
    d.text((w // 2, 204), "Gerenciador", font=normal, fill=(214, 228, 255), anchor="mm")
    d.text((w // 2, 222), "de Downloads", font=normal, fill=(214, 228, 255), anchor="mm")
    d.line((w // 2 - 22, 246, w // 2 + 22, 246), fill=OURO_ESCURO, width=3)
    return im.convert("RGB")


def imagem_pequena_instalador(mestre):
    im = Image.new("RGB", (55, 55), "white")
    ic = reduzir(mestre, 48)
    im.paste(ic, (3, 3), ic)
    return im


def bloco_promocional(mestre):
    """440x280: bloco promocional pequeno da Chrome Web Store."""
    w, h = 440, 280
    im = degrade_vertical((24, 70, 210), (8, 24, 100), w, h)
    ic = reduzir(mestre, 150)
    im.paste(ic, (38, 65), ic)
    d = ImageDraw.Draw(im)
    negrito = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 58)
    normal = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 21)
    d.text((212, 98), "Raio", font=negrito, fill="white")
    d.line((214, 172, 258, 172), fill=OURO_ESCURO, width=4)
    d.text((214, 186), "Gerenciador de\nDownloads", font=normal, fill=(214, 228, 255), spacing=6)
    return im.convert("RGB")


def main():
    os.makedirs(os.path.join(RAIZ, "assets"), exist_ok=True)
    os.makedirs(os.path.join(RAIZ, "extension", "icons"), exist_ok=True)
    mestre = icone_mestre()
    mestre.save(os.path.join(RAIZ, "assets", "raio-icone-1024.png"))
    # .ico do Windows (exe, instalador, atalhos)
    reduzir(mestre, 256).save(os.path.join(RAIZ, "raio.ico"), sizes=[(s, s) for s in (16, 24, 32, 48, 64, 128, 256)])
    # extensão: ligado e desligado (cinza)
    for t in (16, 32, 48, 128):
        ic = reduzir(mestre, t)
        ic.save(os.path.join(RAIZ, "extension", "icons", f"{t}.png"), optimize=True)
        cinza(ic).save(os.path.join(RAIZ, "extension", "icons", f"{t}-off.png"), optimize=True)
    # instalador
    imagem_grande_instalador(mestre).save(os.path.join(RAIZ, "assets", "instalador-grande.bmp"))
    imagem_pequena_instalador(mestre).save(os.path.join(RAIZ, "assets", "instalador-pequena.bmp"))
    bloco_promocional(mestre).save(os.path.join(RAIZ, "assets", "loja-bloco-promocional-440x280.png"))
    # trecho para colar no raio.py (ícone da janela e da bandeja, sem arquivos externos)
    linhas = ["ICON_PNG_B64 = {"]
    for t in (16, 32, 64):
        b64 = base64.b64encode(png_bytes(reduzir(mestre, t))).decode()
        partes = [b64[i:i + 100] for i in range(0, len(b64), 100)]
        linhas.append(f"    {t}: (\n" + "\n".join(f'        "{p}"' for p in partes) + "\n    ),")
    linhas.append("}")
    with open(os.path.join(RAIZ, "assets", "icone_embutido.txt"), "w") as f:
        f.write("\n".join(linhas) + "\n")
    print("ok")


if __name__ == "__main__":
    main()
