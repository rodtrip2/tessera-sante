# SPDX-License-Identifier: EUPL-1.2
"""Logigrammes du document « Isolement et contention : calculs et registre » (kit/20), en SVG, sans dépendance.

Usage : python3 scripts/logigrammes-calculs.py   → kit/images/calculs/*.svg
Les règles décrites sont celles de app/js/rules.js et app/js/model.js (version 0.82) ; à mettre à jour avec elles.
"""
import pathlib
from html import escape

RACINE = pathlib.Path(__file__).resolve().parent.parent
SORTIE = RACINE / 'kit' / 'images' / 'calculs'

STYLES = {
    'debut':    ('#1f5f5b', '#ffffff', '#1f5f5b', 14),   # contour, fond, texte, rayon
    'etape':    ('#6b7a75', '#ffffff', '#1d2320', 4),
    'question': ('#875c00', '#fbefcf', '#3d2a00', 0),
    'resultat': ('#276b43', '#dff0e5', '#123d24', 14),
    'alerte':   ('#a3261e', '#fbebeb', '#5c120d', 4),
    'note':     ('#8a948f', '#f4f5f2', '#37403c', 4),
}
POLICE = 'Arial, Helvetica, sans-serif'


class Dessin:
    def __init__(self, largeur, hauteur, titre):
        self.l, self.h, self.titre, self.el = largeur, hauteur, titre, []

    def texte(self, x, y, lignes, couleur='#1d2320', taille=13, gras=False, ancre='middle'):
        hl = taille * 1.25
        y0 = y - (len(lignes) - 1) * hl / 2 + taille * 0.35
        for i, t in enumerate(lignes):
            g = gras or '**' in t
            t = t.replace('**', '')
            self.el.append(f'<text x="{x:.1f}" y="{y0 + i * hl:.1f}" font-size="{taille}" text-anchor="{ancre}" fill="{couleur}"'
                           f'{" font-weight=\"700\"" if g else ""}>{escape(t)}</text>')

    def boite(self, x, y, w, h, lignes, genre='etape', taille=13):
        """Boîte centrée en (x, y) ; renvoie ses points d'accroche."""
        c, f, t, r = STYLES[genre]
        if genre == 'question':
            pts = f'{x},{y - h / 2} {x + w / 2},{y} {x},{y + h / 2} {x - w / 2},{y}'
            self.el.append(f'<polygon points="{pts}" fill="{f}" stroke="{c}" stroke-width="1.6"/>')
        else:
            tiret = ' stroke-dasharray="5 4"' if genre == 'note' else ''
            self.el.append(f'<rect x="{x - w / 2:.1f}" y="{y - h / 2:.1f}" width="{w}" height="{h}" rx="{r}" fill="{f}" stroke="{c}" stroke-width="1.6"{tiret}/>')
        self.texte(x, y, lignes, t, taille, gras=genre in ('debut', 'resultat'))
        return {'h': (x, y - h / 2), 'b': (x, y + h / 2), 'g': (x - w / 2, y), 'd': (x + w / 2, y)}

    def fleche(self, points, etiquette=None, pos=0.5, cote='d'):
        d = ' '.join(f'{"M" if i == 0 else "L"}{p[0]:.1f},{p[1]:.1f}' for i, p in enumerate(points))
        self.el.append(f'<path d="{d}" fill="none" stroke="#4b5651" stroke-width="1.5" marker-end="url(#pointe)"/>')
        if etiquette:
            # étiquette sur le premier segment
            (x1, y1), (x2, y2) = points[0], points[1]
            ex, ey = x1 + (x2 - x1) * pos, y1 + (y2 - y1) * pos
            dx = 8 if cote == 'd' else -8
            vertical = abs(x2 - x1) < 1
            self.texte(ex + (dx if vertical else 0), ey + (0 if vertical else -9), [etiquette], '#4b5651', 12, True,
                       ('start' if cote == 'd' else 'end') if vertical else 'middle')

    def rect(self, x, y, w, h, fond, contour=None, rx=3):
        self.el.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{rx}" fill="{fond}"'
                       + (f' stroke="{contour}" stroke-width="1.2"' if contour else '') + '/>')

    def ligne(self, x1, y1, x2, y2, couleur='#c9cfca', ep=1, tiret=False):
        self.el.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{couleur}" stroke-width="{ep}"'
                       + (' stroke-dasharray="4 3"' if tiret else '') + '/>')

    def svg(self):
        return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {self.l} {self.h}" width="{self.l}" height="{self.h}" '
                f'font-family="{POLICE}" role="img" aria-label="{escape(self.titre)}">'
                f'<title>{escape(self.titre)}</title>'
                '<defs><marker id="pointe" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
                '<path d="M0,0 L10,5 L0,10 z" fill="#4b5651"/></marker></defs>'
                f'<rect width="{self.l}" height="{self.h}" fill="#ffffff"/>' + ''.join(self.el) + '</svg>\n')


def logigramme_cycle1():
    D = Dessin(900, 1010, 'Cumul et échéances du premier cycle')
    X, XS = 300, 700
    a = D.boite(X, 40, 330, 50, ['Début de la mesure', '(décision du psychiatre)'], 'debut')
    b = D.boite(X, 150, 440, 112, ['Cumul : mesures du même type du patient', 'dans les 15 jours précédant le début, et toute', 'la **suite** de mesures séparées de moins de 48 h', '(mesure unique pour le juge) si elle remonte plus loin ;', 'isolement et contention comptés à part'])
    D.fleche([a['b'], b['h']])
    q1 = D.boite(X, 270, 300, 100, ['Mainlevée par le juge', 'dans cette période ?'], 'question')
    D.fleche([b['b'], q1['h']])
    n1 = D.boite(XS, 270, 300, 64, ['Cumul compté seulement après la fin', 'de la mesure levée (pas de suite)'], 'note')
    D.fleche([q1['d'], n1['g']], 'oui')
    q2 = D.boite(X, 410, 300, 100, ['Pauses déduites', '(réglage de l’établissement) ?'], 'question')
    D.fleche([q1['b'], q2['h']], 'non')
    D.fleche([n1['b'], (XS, 340), (X + 20, 340), (X + 20, 375)])
    n2 = D.boite(XS, 410, 300, 64, ['Durée des pauses passées', 'retirée du cumul'], 'note')
    D.fleche([q2['d'], n2['g']], 'oui')
    c = D.boite(X, 560, 440, 116, ['**Échéance = début + (seuil − cumul)**', 'nouvelle mesure : jamais avant son début ;', 'suite : le cycle du juge se poursuit', 'Isolement : information 48 h, saisine 72 h, décision 96 h', 'Contention : information 24 h, saisine 48 h, décision 72 h'])
    D.fleche([q2['b'], c['h']], 'non')
    D.fleche([n2['b'], (XS, 485), (X + 20, 485), (X + 20, 502)])
    q3 = D.boite(X, 700, 300, 100, ['Pauses déduites ?'], 'question')
    D.fleche([c['b'], q3['h']])
    n3 = D.boite(XS, 700, 300, 82, ['Chaque échéance est reportée', 'de la durée des pauses', 'qui la précèdent'], 'note')
    D.fleche([q3['d'], n3['g']], 'oui')
    q4 = D.boite(X, 840, 340, 110, ['Mesure commencée moins de', '48 h après une mainlevée ?'], 'question')
    D.fleche([q3['b'], q4['h']], 'non')
    D.fleche([n3['b'], (XS, 775), (X + 20, 775), (X + 20, 787)])
    n4 = D.boite(XS, 840, 300, 82, ['Information du juge sans délai', '(échéance ramenée au début ;', 'réglage activé par défaut)'], 'alerte')
    D.fleche([q4['d'], n4['g']], 'oui')
    r = D.boite(X, 968, 400, 56, ['Échéances du cycle en cours :', 'information, saisine, décision du juge'], 'resultat')
    D.fleche([q4['b'], r['h']], 'non')
    D.fleche([n4['b'], (XS, 968), r['d']])
    return D


def logigramme_cycles():
    D = Dessin(900, 900, 'Cycles suivants et délai de sept jours')
    X, XS = 300, 700
    a = D.boite(X, 40, 360, 50, ['Décision du juge du cycle n', '(date et heure de l’ordonnance)'], 'debut')
    q1 = D.boite(X, 160, 260, 100, ['Maintien ?'], 'question')
    D.fleche([a['b'], q1['h']])
    n1 = D.boite(XS, 160, 320, 130, ['**Mainlevée** : indicateur légal ;', 'la mesure continue jusqu’à la fin', 'décidée par le psychiatre ;', 'nouvelle mesure dans les 48 h :', 'information du juge sans délai ;', 'après la fin, le cumul repart de zéro'], 'alerte')
    D.fleche([q1['d'], n1['g']], 'non')
    q2 = D.boite(X, 310, 320, 110, ['Isolement et cycle n + 1', 'au moins égal à 3 ?'], 'question')
    D.fleche([q1['b'], q2['h']], 'oui')
    e1 = D.boite(XS, 310, 320, 100, ['Cycle n + 1 = cycle 1', '+ n × intervalle', 'isolement 96 h, contention 72 h', '(information, saisine, décision)'])
    D.fleche([q2['d'], e1['g']], 'non')
    e2 = D.boite(X, 480, 440, 120, ['**Rythme des mesures longues** (isolement)', 'base = décision du cycle 1 + 96 h', '+ (n + 1 − 3) × 168 h', 'information et saisine = base + 144 h', 'décision = base + 168 h'])
    D.fleche([q2['b'], e2['h']], 'oui')
    q3 = D.boite(X, 640, 340, 110, ['Méthode recommandée', '(délai de sept jours', 'depuis la décision) ?'], 'question')
    D.fleche([e2['b'], q3['h']])
    n3 = D.boite(XS, 640, 320, 130, ['Aussi compté depuis la décision', 'précédente : saisine au plus tard', '144 h après, décision 168 h après ;', '**échéance la plus proche retenue** ;', 'décision non saisie : calcul depuis', 'le début et avertissement'], 'note')
    D.fleche([q3['d'], n3['g']], 'oui')
    n4 = D.boite(X, 775, 320, 64, ['Depuis le début de la mesure', 'seulement (méthode au choix)'], 'note')
    D.fleche([q3['b'], n4['h']], 'non')
    r = D.boite(XS, 860, 320, 56, ['Échéances du cycle n + 1'], 'resultat')
    D.fleche([n3['b'], r['h']])
    D.fleche([n4['d'], (XS - 120, 775), (XS - 120, 832)])
    D.fleche([e1['d'], (870, 310), (870, 860), r['d']])
    return D


def logigramme_pauses():
    D = Dessin(900, 1080, 'Levée temporaire (pause) d’une mesure')
    X, XS = 300, 700
    a = D.boite(X, 40, 380, 50, ['Le psychiatre décide une levée temporaire', '(pause), avec une reprise prévue'], 'debut')
    q1 = D.boite(X, 165, 320, 110, ['Durée prévue inférieure', 'au seuil de refus ?', '(48 h au plus)'], 'question')
    D.fleche([a['b'], q1['h']])
    n1 = D.boite(XS, 165, 300, 82, ['Ce n’est pas une pause :', 'saisir la **fin** de la mesure', '(alerte dès 12 h, réglable)'], 'alerte')
    D.fleche([q1['d'], n1['g']], 'non')
    q2 = D.boite(X, 320, 340, 120, ['Isolement et contention', 'en cours ensemble ?'], 'question')
    D.fleche([q1['b'], q2['h']], 'oui')
    n2 = D.boite(XS, 320, 320, 150, ['**Pause de la contention** : l’agent', 'précise « contention seule »', 'ou « isolement aussi » ;', '**pause de l’isolement** : contention', 'mise en pause aussi (case cochée', 'par défaut ; option : pause de', 'l’isolement seul interdite)'], 'note')
    D.fleche([q2['d'], n2['g']], 'oui')
    e = D.boite(X, 475, 420, 96, ['Pause enregistrée : début, reprise prévue,', 'motif, psychiatre ;', '**la mesure continue pour le juge**', '(au registre : fin de l’entrée en cours)'])
    D.fleche([q2['b'], e['h']], 'non')
    D.fleche([n2['b'], (XS, 420), (X + 20, 420), (X + 20, 429)])
    q3 = D.boite(X, 610, 300, 110, ['Le psychiatre', 'reprend la mesure ?'], 'question')
    D.fleche([e['b'], q3['h']])
    n3 = D.boite(XS, 610, 300, 82, ['Fin de la mesure ;', 'date proposée = début', 'de la pause'], 'alerte')
    D.fleche([q3['d'], n3['g']], 'non')
    q4 = D.boite(X, 760, 300, 110, ['Reprise saisie ?'], 'question')
    D.fleche([q3['b'], q4['h']], 'oui')
    n4 = D.boite(XS, 760, 320, 100, ['Pause en cours : déduite au plus', 'jusqu’à l’heure de reprise prévue', '(reprise automatique à cette', 'heure : option, désactivée)'], 'note')
    D.fleche([q4['d'], n4['g']], 'non')
    q5 = D.boite(X, 905, 320, 110, ['Réglage des pauses', 'de l’établissement'], 'question')
    D.fleche([q4['b'], q5['h']], 'oui')
    D.fleche([n4['b'], (XS, 850), (X + 20, 850), (X + 20, 850 + 0.1)])
    r1 = D.boite(140, 1035, 250, 70, ['**Comptées** (défaut)', 'aucune échéance ne bouge'], 'resultat', 12)
    r2 = D.boite(460, 1035, 290, 70, ['**Déduites des délais du juge**', 'cumul diminué,', 'échéances reportées'], 'resultat', 12)
    r3 = D.boite(XS + 60, 1000, 260, 110, ['**Registre et statistiques**', 'dans tous les cas : la pause', '**arrête l’entrée, la reprise**', '**en ouvre une nouvelle**'], 'note', 12)
    D.fleche([q5['g'], (140, 905), r1['h']])
    D.fleche([q5['b'], (X, 980), (460, 980), r2['h']])
    D.fleche([q5['d'], (XS + 60, 905), r3['h']])
    return D


def logigramme_registre():
    D = Dessin(940, 1020, 'Inscription d’une mesure au registre')
    o = 120
    a = D.boite(450, 45, 520, 64, ['Mesure (en cours ou terminée), période passée dans un service', '(un transfert ou des soins somatiques la découpent par service)'], 'debut')
    p = D.boite(450, 165, 560, 96, ['**Retirer les pauses**', 'chaque pause arrête la mesure au sens du registre ;', 'chaque période active (du début ou d’une reprise', 'à une pause, un arrêt ou la fin) est inscrite séparément'])
    D.fleche([a['b'], p['h']])
    q1 = D.boite(450, 175 + o, 260, 100, ['Contention ?'], 'question')
    D.fleche([p['b'], q1['h']])
    # Contention
    qc = D.boite(690, 300 + o, 240, 100, ['En CSI ?'], 'question')
    D.fleche([q1['d'], (690, 175 + o), qc['h']], 'oui')
    rc = D.boite(860, 430 + o, 130, 66, ['**C**', 'contention', 'en CSI'], 'resultat', 12)
    D.fleche([qc['d'], (860, 300 + o), rc['h']], 'oui')
    qe = D.boite(620, 450 + o, 220, 100, ['Exception', 'prévue ?'], 'question')
    D.fleche([qc['b'], (690, 375 + o), (620, 375 + o), qe['h']], 'non')
    re_ = D.boite(790, 585 + o, 170, 70, ['**E**', 'hors espace', 'd’isolement, exception'], 'resultat', 12)
    rd = D.boite(560, 585 + o, 170, 70, ['**D**', 'hors espace', 'd’isolement'], 'resultat', 12)
    D.fleche([qe['d'], (790, 450 + o), re_['h']], 'oui')
    D.fleche([qe['b'], (620, 530 + o), (560, 530 + o), rd['h']], 'non')
    # Isolement
    qi = D.boite(200, 300 + o, 240, 100, ['En CSI ?'], 'question')
    D.fleche([q1['g'], (200, 175 + o), qi['h']], 'non (isolement)', 0.35, 'g')
    rb = D.boite(60, 430 + o, 110, 66, ['**B**', 'hors CSI'], 'resultat', 12)
    D.fleche([qi['g'], (60, 300 + o), rb['h']], 'non', 0.5, 'g')
    e1 = D.boite(285, 460 + o, 320, 110, ['Retirer les périodes actives de', 'contention en CSI (entrées C) ;', 'une pause de la contention seule', 'reste donc de l’isolement'])
    D.fleche([qi['b'], (200, 378 + o), (285, 378 + o), e1['h']], 'oui')
    ra = D.boite(285, 630 + o, 300, 64, ['**A** : une entrée par portion', 'd’isolement en CSI restante'], 'resultat', 12)
    D.fleche([e1['b'], ra['h']])
    n3 = D.boite(720, 800 + o, 380, 170, ['**Numérotation**', 'commune A à E, dans l’ordre d’apparition', '(débuts), dès le début de l’entrée, à la suite', 'du compteur du service ; année = année', 'du début de l’entrée.', '**Durée**', 'réelle, celle de la période.'], 'note', 12)
    n4 = D.boite(240, 800 + o, 380, 130, ['Exemple : isolement et contention', 'de 10 h à 18 h, contention arrêtée', 'de 12 h à 13 h :', '**C1 10 h – 12 h · A2 12 h – 13 h · C3 13 h – 18 h**'], 'note', 12)
    return D


def frise():
    """Exemple chiffré : isolement et contentions d'un même patient, entrées du registre."""
    D = Dessin(1000, 340, 'Exemple : isolement avec contentions et pauses, entrées du registre')
    x0, ech = 225, 15.0   # 15 px par heure ; t = 0 : lundi 08:00
    def X(hh): return x0 + (hh - 8) * ech
    # graduations
    for hh, lib in [(8, 'lun 8 h'), (12, '12 h'), (18, '18 h'), (24, 'mar 0 h'), (30, '6 h'), (36, '12 h'), (48, 'mer 0 h'), (58, '10 h')]:
        D.ligne(X(hh), 28, X(hh), 200, '#e2e6e3')
        D.texte(X(hh), 18, [lib], '#4b5651', 11)
    def barre(y, d, f, lib, couleur, pauses=()):
        D.rect(X(d), y, (f - d) * ech, 22, couleur)
        for p in pauses:
            D.rect(X(p[0]), y, (p[1] - p[0]) * ech, 22, '#ffffff', couleur, 0)
        D.texte(x0 - 10, y + 11, [lib], '#1d2320', 12, True, 'end')
    barre(45, 8, 58, 'Isolement en CSI', '#5b8fd6', [(20, 21)])
    barre(80, 12, 18, 'Contentions en CSI', '#c0504d', [(14, 15)])
    barre(80, 26, 30, '', '#c0504d')
    D.texte(X(16.5), 91, ['1'], '#ffffff', 11, True)
    D.texte(X(28), 91, ['2'], '#ffffff', 11, True)
    D.texte(X(14.5), 116, ['pause de la contention seule (14 h – 15 h)'], '#a3261e', 10)
    D.texte(X(20.5), 38, ['pause de l’isolement (20 h – 21 h)'], '#2e5c9e', 10)
    def entrees(y, titre, liste):
        D.texte(x0 - 10, y + 11, titre, '#1d2320', 11, True, 'end')
        bas = 0
        for num, d, f, h in liste:
            couleur = '#dbe7f7' if num[0] == 'A' else '#f6dcdb'
            D.rect(X(d) + 1, y, (f - d) * ech - 2, 22, couleur, '#8a948f')
            if (f - d) * ech >= 60:
                D.texte(X((d + f) / 2), y + 11, [f'{num} · {h} h'], '#1d2320', 11)
            else:
                # entrée courte : étiquette sous la barre, sur deux rangs alternés
                yy = y + 36 + 14 * (bas % 2); bas += 1
                D.ligne(X((d + f) / 2), y + 22, X((d + f) / 2), yy - 6, '#8a948f')
                D.texte(X((d + f) / 2), yy, [f'{num} · {h} h'], '#1d2320', 10)
    entrees(170, ['Registre, quel que soit', 'le réglage des pauses'], [('A1', 8, 12, 4), ('C2', 12, 14, 2), ('A3', 14, 15, 1), ('C4', 15, 18, 3), ('A5', 18, 20, 2), ('A6', 21, 26, 5), ('C7', 26, 30, 4), ('A8', 30, 58, 28)])
    D.texte(20, 275, ['Durées en heures, telles qu’inscrites au registre (exemple fictif, lundi 8 h → mercredi 10 h). Numéros dans l’ordre d’apparition.',
                      'Chaque pause arrête l’entrée : la pause de la contention seule (14 h – 15 h) est de l’isolement seul (A3), la contention reprend en C4 ;',
                      'la pause de l’isolement (20 h – 21 h) ne forme aucune entrée et l’isolement reprend en A6. Total : 49 h.'], '#37403c', 11, False, 'start')
    return D


def main():
    SORTIE.mkdir(parents=True, exist_ok=True)
    for nom, f in [('1-cumul-cycle1', logigramme_cycle1), ('2-cycles-suivants', logigramme_cycles), ('3-pauses', logigramme_pauses),
                   ('4-registre', logigramme_registre), ('5-exemple-frise', frise)]:
        (SORTIE / (nom + '.svg')).write_text(f().svg(), encoding='utf-8')
        print('ok', nom + '.svg')


if __name__ == '__main__':
    main()
