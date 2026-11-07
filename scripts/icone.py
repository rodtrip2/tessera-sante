# SPDX-License-Identifier: EUPL-1.2
"""Icône de l'application (raccourci Windows, onglet du navigateur) : app/img/icone.ico (16 à 256 px) et PNG.

Carré vert de l'outil et mosaïque de neuf tesselles (tessera : petite pièce d'une mosaïque ; les modules
assemblés en un tout). Aucune lettre (décision du porteur : pas d'initiales).
Usage : python3 scripts/icone.py   (Pillow requis)
"""
import pathlib
from PIL import Image, ImageDraw

RACINE = pathlib.Path(__file__).resolve().parent.parent
SORTIE = RACINE / 'app' / 'img'
VERT, VERT_CLAIR, BLANC, ACCENT = (31, 95, 91), (46, 125, 118), (255, 255, 255), (178, 223, 216)


def dessiner(n, petit=False):
    """Icône de n pixels, dessinée à 8x puis réduite (bords nets)."""
    f = 8; t = n * f
    im = Image.new('RGBA', (t, t), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    marge = 0 if petit else round(t * 0.04)
    r = round(t * (0.18 if petit else 0.22))
    # Fond : carré arrondi, léger dégradé vertical
    fond = Image.new('RGBA', (t, t))
    for y in range(t):
        k = y / t
        c = tuple(round(VERT_CLAIR[i] * (1 - k) + VERT[i] * k) for i in range(3)) + (255,)
        ImageDraw.Draw(fond).line([(0, y), (t, y)], fill=c)
    masque = Image.new('L', (t, t), 0)
    ImageDraw.Draw(masque).rounded_rectangle([marge, marge, t - marge - 1, t - marge - 1], radius=r, fill=255)
    im.paste(fond, (0, 0), masque)
    d = ImageDraw.Draw(im)
    # Mosaïque 3 x 3 : tesselles blanches et vert clair, une tesselle d'accent décalée
    pas = (t - 2 * round(t * 0.20)) / 3
    x0 = round(t * 0.20); jeu = pas * (0.16 if not petit else 0.12)
    teintes = [BLANC, ACCENT, BLANC, ACCENT, BLANC, ACCENT, BLANC, ACCENT, BLANC]
    for k in range(9):
        li, co = divmod(k, 3)
        gx, gy = x0 + co * pas + jeu / 2, x0 + li * pas + jeu / 2
        cote = pas - jeu
        dx = -pas * 0.10 if k == 2 else 0
        dy = -pas * 0.10 if k == 2 else 0
        d.rounded_rectangle([gx + dx, gy + dy, gx + dx + cote, gy + dy + cote], radius=round(cote * 0.18), fill=teintes[k] + (255,))
    return im.resize((n, n), Image.LANCZOS)


def main():
    SORTIE.mkdir(exist_ok=True)
    tailles = [16, 24, 32, 48, 64, 128, 256]
    images = {n: dessiner(n, petit=n <= 32) for n in tailles}
    images[256].save(SORTIE / 'icone.ico', sizes=[(n, n) for n in tailles], append_images=[images[n] for n in tailles[:-1]])
    images[256].save(SORTIE / 'icone-256.png')
    images[32].save(SORTIE / 'icone-32.png')
    dessiner(512).save(SORTIE / 'icone-512.png')
    print('ok', SORTIE)


if __name__ == '__main__':
    main()
