# SPDX-License-Identifier: EUPL-1.2
"""
Parcours des écrans dans un vrai navigateur (mode démonstration, données fictives uniquement).

À lancer après chaque modification d'écran, en plus de `npm test` :
    python3 -m http.server 8765        (à la racine du dépôt, dans un autre terminal)
    python3 tests/ecrans/parcours.py   (Playwright pour Python et Chromium installés)
Le script s'arrête avec un code d'erreur si une vérification échoue ou si le navigateur signale une erreur.
Options : --captures DOSSIER (garde une capture des écrans vérifiés), --url ADRESSE.
"""
import argparse, sys, time
from playwright.sync_api import sync_playwright

p_args = argparse.ArgumentParser()
p_args.add_argument('--url', default='http://localhost:8765/app/')
p_args.add_argument('--captures', default='')
ARGS = p_args.parse_args()
erreurs, echecs = [], []
MDP = 'motdepasse-demo'

def verifier(condition, libelle):
    print(('  ok  ' if condition else ' ÉCHEC ') + libelle)
    if not condition: echecs.append(libelle)

def capture(page, nom):
    if ARGS.captures: page.screenshot(path=ARGS.captures.rstrip('/') + '/' + nom + '.png', full_page=True)

def connecter(a, identifiant, mdp):
    a.get_by_label('Identifiant').fill(identifiant); a.get_by_label('Mot de passe', exact=True).fill(mdp)
    a.get_by_role('button', name='Se connecter').click(); time.sleep(4)
    if a.locator('button', has_text='Données réelles').count(): a.locator('button', has_text='Données réelles').first.click(); time.sleep(2)

def fenetre(a, nom, premier=True):
    a.locator('.barre-modules button', has_text=nom).first.click(); time.sleep(1.3)
    # La fenêtre retrouve l'onglet laissé : les vérifications partent du premier onglet
    if premier and a.locator('nav.onglets button').count(): a.locator('nav.onglets button').first.click(); time.sleep(1)

def onglets(a): return a.locator('nav.onglets button').all_inner_texts()

with sync_playwright() as p:
    nav = p.chromium.launch(args=['--lang=fr', '--no-sandbox'])
    ctx = nav.new_context(viewport={'width': 1400, 'height': 1000}, locale='fr-FR', timezone_id='Europe/Paris')
    a = ctx.new_page()
    a.on('pageerror', lambda e: erreurs.append(str(e)))
    a.on('console', lambda m: erreurs.append('console : ' + m.text) if m.type == 'error' else None)
    a.on('dialog', lambda d: d.accept())
    a.goto(ARGS.url)

    print('Démonstration : dossier fictif, administrateur et cadre de tous les services')
    a.get_by_role('button', name='Mode démonstration (données fictives)').click()
    a.get_by_placeholder('Prénom NOM').fill('Cadre Démo (fictif)'); a.get_by_placeholder('ex. prenom.nom').fill('cadre')
    pw = a.locator('input[type=password]'); pw.nth(0).fill(MDP); pw.nth(1).fill(MDP)
    if a.get_by_label('Charger des données fictives de démonstration').count(): a.get_by_label('Charger des données fictives de démonstration').check()
    a.get_by_role('button', name='Initialiser le dossier').click()
    a.wait_for_selector('.code-secours', timeout=90000)
    a.get_by_text('J’ai noté le code de secours').click(); a.get_by_role('button', name='Continuer').click(); time.sleep(4)

    print('Toutes les fenêtres, tous les onglets')
    for m in ['Patients', 'Isolement et contention', 'Agenda du service', 'Véhicules', 'Suivi médical', 'Vue d’ensemble', 'Administration']:
        fenetre(a, m, False)
        tabs = onglets(a)
        for t in tabs:
            a.locator('nav.onglets button', has_text=t).first.click(); time.sleep(0.7)
            if a.locator('.erreur').count(): echecs.append(m + ' / ' + t + ' : ' + a.locator('.erreur').first.inner_text()[:150])
        verifier(len(tabs) > 0, m + ' : ' + str(len(tabs)) + ' onglets')

    print('Agenda : professionnels, patients, permissions, sorties')
    fenetre(a, 'Agenda du service')
    verifier(a.locator('.ag-reponses li').count() >= 2, 'bandeau « Votre réponse est attendue » (invitation, demande à confirmer)')
    verifier(a.locator('.ag-etape-badge').count() >= 2, 'étapes des permissions en couleur')
    verifier(a.locator('.ag-sortie-patient').count() >= 1, 'sortie actée affichée à sa date')
    a.locator('.ag-bloc', has_text='Marché de Noël').first.click(); time.sleep(1)
    d = a.locator('dialog[open]'); txt = d.inner_text()
    verifier('Quel(s) professionnel(s) ?' in txt and 'Quel(s) patient(s) ?' in txt, 'rubriques de l’événement')
    verifier('Liste d’attente' in txt and 'attente n° 1' in txt, 'listes d’attente des professionnels et des patients')
    capture(a, 'agenda-evenement'); a.keyboard.press('Escape'); time.sleep(0.5)
    a.locator('.ag-bloc', has=a.locator('.ag-etape-badge', has_text='Certificat en attente')).first.click(); time.sleep(1)
    txt = a.locator('dialog[open]').inner_text()
    verifier('Demande d’un 2e avis' in txt and 'Certificat à envoyer à l’ARS' in txt, 'permission en SDRE : mention de la demande, tâche et délai')
    a.keyboard.press('Escape'); time.sleep(0.5)
    a.locator('.ag-bloc', has_text='Sortie').filter(has_text='Check-list').first.click(); time.sleep(1)
    verifier(a.locator('dialog[open] .ag-suggestions').count() == 1, 'tâches suggérées selon la prise en charge')
    a.keyboard.press('Escape'); time.sleep(0.5)

    print('Fiche patient et Vue d’ensemble')
    fenetre(a, 'Patients')
    a.locator('table.liste-patients tbody tr', has_text='CHARLIE').first.locator('button, a').first.click(); time.sleep(1)
    txt = a.locator('dialog[open]').inner_text()
    verifier('Cabinet infirmier du Centre (fictif)' in txt, 'prise en charge dans la fiche')
    verifier('Actée : ' in txt, 'sortie actée dans la fiche')
    a.keyboard.press('Escape'); time.sleep(0.5)
    fenetre(a, 'Vue d’ensemble')
    verifier(a.locator('table.table-vue td[data-couleur=vert]', has_text='Actée').count() >= 1, 'sortie actée en vert')
    verifier(a.locator('table.table-vue td[data-couleur=jaune]', has_text='Envisagée').count() >= 1, 'sortie envisagée en jaune')

    print('Administration : organisation par service')
    fenetre(a, 'Administration')
    a.locator('nav.onglets button', has_text='Agenda').first.click(); time.sleep(1)
    a.get_by_role('button', name='Organisation par service').first.click(); time.sleep(1)
    sec = a.locator('section.panneau', has_text='Organisation par service')
    for titre in ['Inscriptions à confirmer', 'Événements de plusieurs services', 'Permissions de sortie', 'Tâches suggérées', 'Sorties envisagées et actées']:
        verifier(titre in sec.inner_text(), 'rubrique « ' + titre + ' »')
    sec.locator('select[aria-label^="Sortie actée (date"]').select_option('bleu')
    sec.get_by_role('button', name='Enregistrer').click(); time.sleep(1.5)
    capture(a, 'admin-organisation')
    fenetre(a, 'Vue d’ensemble')
    verifier(a.locator('table.table-vue td[data-couleur=bleu]', has_text='Actée').count() >= 1, 'couleur de la sortie actée réglée, reprise dans la Vue d’ensemble')

    print('Comptes d’un autre service : cadre et IDE de l’Unité 2 (non administrateurs)')
    a.evaluate("""async () => { const s = SIC.ui.App.session;
      await s.creerCompte({ nom: 'Cadre Deux (fictif)', login: 'cadre.u2', motDePasse: 'motdepasse-cadre-u2', roles: ['CADRE'], services: ['U2'] });
      await s.creerCompte({ nom: 'Ide Deux (fictif)', login: 'ide.u2', motDePasse: 'motdepasse-ide-u2', roles: ['IDE'], services: ['U2'] });
      await s.modifierCoffre(async (coffre, comptes) => { comptes.filter(c => /\\.u2$/.test(c.login)).forEach(c => { c.mdpProvisoire = false; }); }); }""")
    a.get_by_role('button', name='Verrouiller').click(); time.sleep(1)
    connecter(a, 'cadre', MDP)   # l'administrateur se reconnecte : remise des clés aux nouveaux comptes
    a.get_by_role('button', name='Verrouiller').click(); time.sleep(1)

    connecter(a, 'cadre.u2', 'motdepasse-cadre-u2')
    fenetre(a, 'Administration')
    tabs = onglets(a)
    verifier('Agenda du service' in tabs and 'Patients' in tabs and 'Réglages généraux' not in tabs, 'administration du cadre : ' + ', '.join(tabs))
    a.locator('nav.onglets button', has_text='Agenda du service').first.click(); time.sleep(1)
    niveaux = a.locator('select[aria-label="Niveau des réglages"] option').all_inner_texts()
    verifier(len(niveaux) == 1 and 'Unité 2' in niveaux[0], 'le cadre ne règle que son service : ' + ', '.join(niveaux))
    a.locator('select[aria-label="Place proposée pour les autres services"]').select_option('co')
    a.locator('section.panneau', has_text='Organisation par service').get_by_role('button', name='Enregistrer').click(); time.sleep(1.5)
    verifier(a.evaluate("((SIC.ui.config().agendaReglages || {}).U2 || {}).partageDefaut") == 'co', 'réglage de son service enregistré par le cadre')
    a.locator('nav.onglets button', has_text='Patients').first.click(); time.sleep(1)
    verifier('Répertoire' in a.locator('main').inner_text(), 'prise en charge : types, champs et répertoire ouverts au cadre')
    capture(a, 'admin-cadre')
    a.get_by_role('button', name='Verrouiller').click(); time.sleep(1)

    connecter(a, 'ide.u2', 'motdepasse-ide-u2')
    fenetre(a, 'Agenda du service')
    for _ in range(2):
        if a.locator('.ag-bloc', has_text='pétanque').count(): break
        a.locator('main .barre button', has_text='▶').first.click(); time.sleep(1.2)
    verifier(a.locator('.ag-bloc', has_text='pétanque').count() == 1, 'événement d’un autre service où l’Unité 2 est invitée')
    a.locator('.ag-bloc', has_text='pétanque').first.click(); time.sleep(1)
    d = a.locator('dialog[open]'); txt = d.inner_text()
    verifier('Inscrire les patients de votre service' in txt, 'service invité : inscription de ses patients')
    verifier(d.get_by_role('button', name='Enregistrer').count() == 0, 'service invité : événement non modifiable')
    verifier('ALPHA' not in txt, 'service invité : les patients des autres services ne sont pas nommés')
    d.locator('.liste-cases label.case input').first.check(); time.sleep(1.5)
    verifier('1 patient' in a.locator('dialog[open]').inner_text() or a.locator('dialog[open] .liste-cases input:checked').count() == 1, 'patient du service invité inscrit')
    b_ins = a.locator('dialog[open]').get_by_role('button', name='M’inscrire')
    verifier(b_ins.count() == 1, 'service invité : un agent peut s’inscrire')
    if b_ins.count(): b_ins.first.click(); time.sleep(1.5)
    verifier('Ide Deux (fictif)' in a.locator('dialog[open]').inner_text(), 'agent du service invité inscrit')
    capture(a, 'agenda-service-invite')
    nav.close()

if erreurs: print('\nErreurs du navigateur :'); [print('  ' + e) for e in erreurs[:20]]
if echecs: print('\n' + str(len(echecs)) + ' vérification(s) en échec.')
print('\nParcours ' + ('en échec' if erreurs or echecs else 'réussi') + '.')
sys.exit(1 if erreurs or echecs else 0)
