# SPDX-License-Identifier: EUPL-1.2
"""Icône de l'application (raccourci Windows, onglet du navigateur) : app/img/icone.ico (16 à 256 px) et PNG.

Rosace de tesselles (tessera : petite pièce d'une mosaïque ; les modules assemblés en un tout), choisie par le
porteur le 7 novembre 2026 : anneaux de tesselles sur le fond vert de l'outil, plusieurs teintes accordées
(verts, bleu pétrole, vert sauge, quelques tesselles ambre), et un T dessiné par les tesselles claires.
Aucune lettre écrite. Petites tailles (32 px et moins) : moins d'anneaux, pour que le T reste lisible.
Usage : python3 scripts/icone.py   (Pillow requis)
"""
import math
import pathlib
from PIL import Image, ImageDraw

RACINE = pathlib.Path(__file__).resolve().parent.parent
SORTIE = RACINE / 'app' / 'img'
FOND = (31, 95, 91)
CLAIRES = [(255, 255, 255), (246, 240, 226)]                 # le T : blanc et sable
TEINTES = [(63, 143, 134), (46, 125, 118), (84, 160, 150), (40, 112, 106), (72, 152, 142),
           (44, 104, 130), (96, 150, 118), (58, 122, 146)]     # verts, bleu pétrole, vert sauge
AMBRE = (227, 179, 65)


def dans_t(x, y, petit):
    """Le T, en coordonnées réduites (-1 à 1, centre de la rosace)."""
    e = 0.06 if petit else 0
    return (-0.72 - e <= x <= 0.72 + e and -0.76 - e <= y <= -0.38 + e) or (-0.21 - e <= x <= 0.21 + e and -0.38 <= y <= 0.82 + e)


def tesselles(anneaux):
    """Centre, angle et côté de chaque tesselle : une au centre, puis des anneaux décalés d'une demi-tesselle."""
    pas = 1 / (len(anneaux) + 0.5)
    res = [(0.0, 0.0, 0.0, pas * 0.9)]
    for k, nb in enumerate(anneaux):
        r = pas * (k + 1)
        for i in range(nb):
            a = 2 * math.pi * i / nb + (k % 2) * math.pi / nb
            res.append((r * math.cos(a), r * math.sin(a), a, min(pas * 0.86, 2 * math.pi * r / nb * 0.84)))
    return res


def dessiner(n):
    """Icône de n pixels, dessinée à 8x puis réduite (bords nets)."""
    petit = n <= 32
    f = 8; t = n * f; c = t / 2
    im = Image.new('RGBA', (t, t), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    marge = 0 if petit else round(t * 0.04)
    d.rounded_rectangle([marge, marge, t - marge - 1, t - marge - 1], radius=round(t * (0.18 if petit else 0.22)), fill=FOND + (255,))
    rayon = c * (0.90 if petit else 0.86)
    anneaux = (6, 12, 18, 24) if petit else (6, 12, 18, 24, 30, 36, 42)
    for j, (x, y, a, cote) in enumerate(tesselles(anneaux)):
        if dans_t(x, y, petit):
            coul = CLAIRES[j % 2]
        elif not petit and (j * 13) % 17 == 0:
            coul = AMBRE
        else:
            coul = TEINTES[(j * 7 + 3) % len(TEINTES)]
        h = cote / 2; pts = []
        for dx, dy in ((-h, -h), (h, -h), (h, h), (-h, h)):
            px = x + dx * math.cos(a) - dy * math.sin(a); py = y + dx * math.sin(a) + dy * math.cos(a)
            pts.append((c + px * rayon, c + py * rayon))
        d.polygon(pts, fill=coul + (255,))
    return im.resize((n, n), Image.LANCZOS)


def main():
    SORTIE.mkdir(exist_ok=True)
    tailles = [16, 24, 32, 48, 64, 128, 256]
    images = {n: dessiner(n) for n in tailles}
    images[256].save(SORTIE / 'icone.ico', sizes=[(n, n) for n in tailles], append_images=[images[n] for n in tailles[:-1]])
    images[256].save(SORTIE / 'icone-256.png')
    images[32].save(SORTIE / 'icone-32.png')
    dessiner(512).save(SORTIE / 'icone-512.png')
    print('ok', SORTIE)


if __name__ == '__main__':
    main()
