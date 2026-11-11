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

    print('Demandes de travaux')
    fenetre(a, 'Demandes de travaux')
    verifier(a.locator('.travaux-carte').count() >= 7 and a.locator('.travaux-carte.traitee').count() >= 2, 'liste : demandes en cours et traitées en grisé')
    verifier('5555 (fictif)' in a.locator('.travaux-urgence').first.inner_text(), 'urgence immédiate : numéro des services techniques')
    verifier('marqué réalisée votre demande' in a.locator('main').inner_text(), 'information de l’auteur')
    a.get_by_role('button', name='+ Nouvelle demande').click(); time.sleep(0.8)
    d = a.locator('dialog[open]')
    d.locator('select[aria-label="Type de travaux"]').select_option('plomberie'); d.locator('select[aria-label="Lieu"]').select_option('chambre')
    d.locator('input[aria-label="Numéro de chambre"]').fill('7'); d.locator('select[aria-label="Urgence"]').select_option('non')
    d.locator('textarea').fill('Chasse d’eau qui coule (fictif)'); d.get_by_role('button', name='Enregistrer la demande').click(); time.sleep(1.5)
    verifier(a.locator('.travaux-carte', has_text='Chasse d’eau').count() == 1, 'nouvelle demande enregistrée')
    a.locator('.travaux-carte', has_text='serrure').first.click(); time.sleep(1)
    a.get_by_role('button', name='Confirmer la réalisation').click(); time.sleep(1.5)
    verifier('Réalisée et confirmée' in a.locator('dialog[open]').inner_text(), 'confirmation de la réalisation par le cadre')
    a.keyboard.press('Escape'); time.sleep(0.5)
    fenetre(a, 'Agenda du service')
    verifier(a.locator('.ag-travaux').count() >= 1, 'intervention programmée dans l’agenda')
    fenetre(a, 'Vue d’ensemble')
    verifier('pour travaux' in a.locator('main').inner_text(), 'chambre indisponible retirée des places disponibles')
    fenetre(a, 'Patients')
    sel = a.locator('select').filter(has=a.locator('option', has_text='Par chambre')).first
    sel.select_option(label='Par chambre'); time.sleep(1)
    verifier(a.locator('tr.chambre-travaux').count() == 1, 'chambre indisponible dans la liste par chambre')

    print('Messagerie')
    fenetre(a, 'Messagerie')
    verifier(a.locator('.ms-ligne').count() >= 6, 'reçus : messages fictifs')
    verifier('à lire en priorité' in a.locator('.ms-bandeau').inner_text(), 'message important et message relancé en tête')
    verifier(a.locator('.ms-lecteur .ms-rattache').count() == 2, 'éléments rattachés lus à la volée')
    a.get_by_role('button', name='J’ai lu').click(); time.sleep(1.2)
    verifier(a.locator('.ms-lecteur').get_by_role('button', name='J’ai lu').count() == 0, 'lecture confirmée')
    a.locator('.ms-ligne', has_text='Plan de la boîte').click(); time.sleep(1)
    a.locator('.ms-piece', has_text='.png').get_by_role('button').click(); time.sleep(1)
    verifier(a.locator('dialog[open] img.ms-image').count() == 1, 'pièce jointe : image affichée dans l’application')
    a.keyboard.press('Escape'); time.sleep(0.5)
    capture(a, 'messagerie-recus')
    a.locator('nav.onglets button', has_text='Informations').click(); time.sleep(1)
    txt = a.locator('main').inner_text()
    verifier(a.locator('.ms-info').count() >= 5 and 'Urgence immédiate' in txt and 'Réponse attendue' in txt, 'onglet Informations : rappels des autres modules')
    capture(a, 'messagerie-informations')
    a.locator('nav.onglets button', has_text='Reçus').click(); time.sleep(1)
    a.get_by_role('button', name='+ Nouveau message').click(); time.sleep(0.8)
    d = a.locator('dialog[open]')
    d.get_by_label('Ajouter un destinataire').select_option('service|U2'); time.sleep(0.3)
    d.get_by_label('Objet').fill('Essai de la messagerie (fictif)'); d.get_by_label('Message', exact=True).fill('Message d’essai pour l’Unité 2 (fictif)')
    d.get_by_role('button', name='Rattacher un élément…').click(); time.sleep(0.6)
    d2 = a.locator('dialog[open]').last
    d2.get_by_label('Module').select_option('travaux'); time.sleep(0.4)
    d2.locator('label.case', has_text='Chambre 7').locator('input').check(); d2.get_by_role('button', name='Rattacher').click(); time.sleep(0.6)
    verifier(a.locator('dialog[open] .ms-rattache').count() == 1, 'nouveau message : élément rattaché')
    capture(a, 'messagerie-nouveau')
    a.locator('dialog[open] .ms-envoyer').click(); time.sleep(1.5)
    a.locator('nav.onglets button', has_text='Envoyés').click(); time.sleep(1)
    verifier(a.locator('.ms-ligne', has_text='Essai de la messagerie').count() == 1, 'message envoyé')
    fenetre(a, 'Demandes de travaux')
    a.locator('.travaux-carte', has_text='Chasse d’eau').first.click(); time.sleep(1)
    a.locator('dialog[open]').get_by_role('button', name='Envoyer par message').click(); time.sleep(1)
    verifier(a.locator('dialog[open] .ms-rattache', has_text='Plomberie').count() == 1, 'envoyer par message depuis une demande de travaux')
    a.locator('dialog[open]').get_by_role('button', name='Annuler').click(); time.sleep(0.5)
    fenetre(a, 'Administration')
    a.locator('nav.onglets button', has_text='Messagerie').first.click(); time.sleep(1)
    verifier('Autoriser les pièces jointes' in a.locator('main').inner_text(), 'administration : réglages de la messagerie')

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
    a.locator('nav.onglets button', has_text='Demandes de travaux').first.click(); time.sleep(1)
    txt = a.locator('main').inner_text()
    verifier('Unité 2' in txt and 'réglé par l’administrateur pour l’établissement' in txt, 'demandes de travaux : réglages du service ouverts au cadre, numéro réservé à l’administrateur')
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
    a.keyboard.press('Escape'); time.sleep(0.5)
    fenetre(a, 'Messagerie')
    verifier(a.locator('.ms-ligne', has_text='Essai de la messagerie').count() == 1, 'messagerie : message reçu par l’IDE de l’Unité 2')
    a.locator('.ms-ligne', has_text='Essai de la messagerie').click(); time.sleep(1)
    verifier(a.locator('.ms-lecteur .ms-rattache.reserve', has_text='accès réservé').count() == 1, 'élément d’un service sans accès : « accès réservé », sans détail')
    verifier(a.locator('.ms-ligne', has_text='clés de la pharmacie').count() == 0, 'message de l’Unité 1 non reçu par l’Unité 2')
    nav.close()

if erreurs: print('\nErreurs du navigateur :'); [print('  ' + e) for e in erreurs[:20]]
if echecs: print('\n' + str(len(echecs)) + ' vérification(s) en échec.')
print('\nParcours ' + ('en échec' if erreurs or echecs else 'réussi') + '.')
sys.exit(1 if erreurs or echecs else 0)
