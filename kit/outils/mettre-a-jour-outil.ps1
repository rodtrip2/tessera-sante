# SPDX-License-Identifier: EUPL-1.2
#
# Tessera Santé : mise à jour de l'application (dossier « app ») hébergée sur un partage réseau ou un serveur web.
# Mode d'emploi : kit/03-guide-installation.md, § 3 bis.
#
# Usage simple : placer ce script et « mettre-a-jour-tessera.cmd » dans le dossier qui contient « app » (par exemple
# \\serveur\applis\TesseraSante\), puis double-cliquer sur « mettre-a-jour-tessera.cmd » avec le compte de mise à jour.
# Sans -Destination, le script met à jour le dossier « app » situé à côté de lui.
#
# Le script ne touche jamais au dossier des données : il ne remplace que les fichiers de l'application.
#   1. récupère la nouvelle version : archive ZIP téléchargée depuis GitHub (-Archive), dossier déjà décompressé
#      (-Source) ou, à défaut, téléchargement direct depuis le site publié du projet (-Canal stable ou beta) ;
#   2. contrôle CHAQUE fichier par son empreinte SHA-256 (EMPREINTES-SHA256.txt publié avec l'application) et refuse
#      tout fichier en trop ; facultatif : empreinte attendue du fichier d'empreintes lui-même (-EmpreinteAttendue) ;
#   3. refuse de revenir à une version plus ancienne sans -Forcer ;
#   4. copie la nouvelle version à côté de l'actuelle, la contrôle de nouveau, reprend les droits NTFS du dossier
#      actuel, puis échange les deux dossiers (l'ancienne version est gardée dans « app.ancien ») ;
#   5. range une copie du fichier d'empreintes dans le dossier de référence, utilisé par verifier-outil.ps1.
# Au moindre écart, rien n'est remplacé : la version en place reste utilisée.
#
# Adaptation locale (24 novembre 2026) : -Zimbra 'https://zimbra.etablissement.fr' autorise cette copie de Tessera à
# joindre le serveur d'agenda de l'établissement (synchronisation de Mes tâches et de Mon agenda, fonction soumise à
# avis « synchro-caldav »). Le script ajoute cette seule adresse à la règle « connect-src » de index.html (aucune
# autre modification), la note dans « reference-empreintes\ADAPTATION-LOCALE.txt » et la reprend aux mises à jour
# suivantes ; verifier-outil.ps1 contrôle index.html une fois l'adaptation retirée, et l'adresse autorisée.
# -SansZimbra retire l'adaptation. Rien n'est ajouté au dépôt public : l'adresse reste propre à l'établissement.
#
# Dossier des données fixé (26 novembre 2026) : -Donnees '\\serveur\partage\Tessera\donnees' lit le coffre de ce dossier
# et inscrit dans index.html (balise « tessera-donnees ») la date de création de ce coffre et le chemin : cette copie de
# Tessera n'ouvre plus que ces données (dossier habituel, de secours, copie locale, nouvel emplacement après un
# déplacement), sans mode démonstration ni déblocage dans Tessera. Reprise aux mises à jour suivantes, contrôlée par
# verifier-outil.ps1 ; -SansDonnees la retire. Le navigateur ne peut pas ouvrir un chemin de lui-même : chaque agent
# désigne le dossier une fois par poste.
#
# Retour à la version précédente : -Revenir (échange « app » et « app.ancien »).
# Essai sans rien remplacer : -Simulation.
#
# À lancer avec un compte qui a le droit de modifier le dossier de l'application (compte dédié aux mises à jour ou
# service informatique), jamais avec le compte habituel d'un agent. Compatible Windows PowerShell 5.1 et PowerShell 7.
# Codes de sortie : 0 = mise à jour faite ou déjà à jour ; 1 = source inaccessible ; 2 = contrôle refusé ou erreur ;
#                   3 = version plus ancienne que celle en place (refusée sans -Forcer).

param(
  # Dossier de l'application utilisé par les agents (celui qui contient index.html) ; par défaut : « app » à côté du script
  [string]$Destination = '',
  # Archive ZIP de la version (GitHub : « Code → Download ZIP » ou page des versions)
  [string]$Archive = '',
  # Dossier déjà décompressé : le dossier « app » lui-même ou le dossier qui le contient
  [string]$Source = '',
  # Sans -Archive ni -Source : version téléchargée depuis le site publié du projet
  [ValidateSet('stable', 'beta')][string]$Canal = 'stable',
  [string]$Adresse = 'https://rodtrip2.github.io/tessera-sante/',
  # Proxy de l'établissement pour le téléchargement (vide = réglage du poste)
  [string]$Proxy = '',
  # Empreinte SHA-256 attendue du fichier EMPREINTES-SHA256.txt (vérifiée si renseignée)
  [string]$EmpreinteAttendue = '',
  # Dossier où ranger la copie de référence des empreintes (à protéger : lecture seule pour les agents)
  [string]$Reference = '',
  [string]$Journal = '',
  # Serveur d'agenda (Zimbra…) que Tessera peut joindre : adresse https, sans chemin (reprise aux mises à jour suivantes)
  [string[]]$Zimbra = @(),
  # Retirer l'adaptation locale (plus aucune connexion autorisée)
  [switch]$SansZimbra,
  # Dossier des données que cette copie de Tessera est seule à ouvrir (reprise aux mises à jour suivantes)
  [string]$Donnees = '',
  # Retirer le dossier des données fixé (choix libre)
  [switch]$SansDonnees,
  [switch]$Revenir,
  [switch]$Simulation,
  [switch]$Forcer
)

$ErrorActionPreference = 'Stop'
if (-not $Destination) {
  $Destination = Join-Path $PSScriptRoot 'app'
  if (-not (Test-Path -LiteralPath (Join-Path $Destination 'index.html')) -and -not $Revenir -and -not $Simulation) {
    # Aucun dossier « app » à côté du script : première installation, à confirmer (évite une installation par erreur
    # dans un dossier de téléchargement)
    Write-Host ('Aucune application Tessera trouvée à côté du script. Installer Tessera dans ' + $Destination + ' ?')
    $r = Read-Host 'Taper O pour confirmer'
    if ($r -notmatch '^[oOyY]') { Write-Host 'Installation abandonnée.'; exit 2 }
  }
}
$Destination = $Destination.TrimEnd('\', '/')
$parent = Split-Path -Parent $Destination
if (-not $Reference) { $Reference = Join-Path $parent 'reference-empreintes' }
if (-not $Journal) { $Journal = Join-Path $parent 'journal-mises-a-jour.log' }
$ancien = $Destination + '.ancien'
$nouveau = $Destination + '.nouveau'
$NOM_EMPREINTES = 'EMPREINTES-SHA256.txt'
$NOM_ADAPTATION = 'ADAPTATION-LOCALE.txt'
$UTF8 = New-Object System.Text.UTF8Encoding($false)

function Ecrire-Journal([string]$texte) {
  $ligne = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '  ' + $env:USERNAME + '  ' + $texte
  try {
    $d = Split-Path -Parent $Journal
    if ($d -and -not (Test-Path -LiteralPath $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
    Add-Content -LiteralPath $Journal -Value $ligne -Encoding UTF8
  } catch { Write-Warning ('Journal inaccessible (' + $Journal + ') : ' + $_.Exception.Message) }
  Write-Host $ligne
}

function Lire-Empreintes([string]$fichier) {
  # Lignes « EMPREINTE  app/chemin » ; un chemin qui sort du dossier est refusé
  $liste = @()
  foreach ($l in (Get-Content -LiteralPath $fichier -Encoding UTF8)) {
    if ($l -match '^([0-9A-Fa-f]{64})\s+app/(.+)$') {
      $rel = $Matches[2].Trim()
      if ($rel -match '(^|/)\.\.(/|$)' -or $rel -match '^[/\\]' -or $rel -match ':') { throw ('Chemin refusé dans la liste des empreintes : ' + $rel) }
      $liste += [pscustomobject]@{ Hash = $Matches[1].ToUpperInvariant(); Rel = $rel }
    }
  }
  return ,$liste
}

function Chemin-Local([string]$dossier, [string]$rel) {
  return Join-Path $dossier ($rel -replace '/', [System.IO.Path]::DirectorySeparatorChar)
}

# ------------------------------------------------------------------ Adaptation locale (règle connect-src)
function Origine-Valide([string]$a) {
  $a = $a.Trim()
  if ($a -notmatch '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/.*)?$') { throw ('Adresse refusée pour -Zimbra (https://serveur attendu) : ' + $a) }
  $u = [Uri]$a
  $o = 'https://' + $u.Host.ToLowerInvariant()
  if (-not $u.IsDefaultPort) { $o += ':' + $u.Port }
  return $o
}
function Origines-Csp([string]$texte) {
  $m = [regex]::Match($texte, 'connect-src\s+([^;"]*)')
  if (-not $m.Success) { return ,@() }
  $l = @($m.Groups[1].Value.Trim() -split '\s+' | Where-Object { $_ -match '^https://' })
  return ,$l
}
function Hachage-Texte([string]$texte) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try { return (($sha.ComputeHash($UTF8.GetBytes($texte)) | ForEach-Object { $_.ToString('X2') }) -join '') } finally { $sha.Dispose() }
}
$RE_DONNEES = '<meta name="tessera-donnees" content="([^"]*)">'
function Donnees-Index([string]$texte) { $m = [regex]::Match($texte, $RE_DONNEES); if ($m.Success) { return $m.Groups[1].Value } else { return '' } }
function Index-Sans-Adaptation([string]$fichier) {
  # Empreinte de index.html une fois l'adaptation retirée (règle connect-src remise à 'none', balise des données vidée),
  # adresses autorisées et données fixées
  $t = [System.IO.File]::ReadAllText($fichier, $UTF8)
  $n = [regex]::Replace([regex]::Replace($t, 'connect-src\s+[^;"]*', "connect-src 'none'"), $RE_DONNEES, '<meta name="tessera-donnees" content="">')
  return [pscustomobject]@{ Hash = (Hachage-Texte $n); Origines = (Origines-Csp $t); Donnees = (Donnees-Index $t) }
}
function Appliquer-Adaptation([string]$dossier, [string[]]$origines, [string]$donnees = '') {
  $f = Join-Path $dossier 'index.html'
  $t = [System.IO.File]::ReadAllText($f, $UTF8)
  if (-not [regex]::IsMatch($t, "connect-src 'none'")) { throw 'index.html ne contient pas la règle attendue (connect-src ''none'').' }
  if ($origines.Count -eq 0 -and -not $donnees) { return }
  if ($origines.Count -gt 0) { $t = $t.Replace("connect-src 'none'", 'connect-src ' + ($origines -join ' ')) }
  if ($donnees) {
    if (-not $t.Contains('<meta name="tessera-donnees" content="">')) { throw 'Cette version de Tessera ne permet pas de fixer le dossier des données (version 0.94.0 ou suivante nécessaire).' }
    $t = $t.Replace('<meta name="tessera-donnees" content="">', '<meta name="tessera-donnees" content="' + $donnees + '">')
  }
  [System.IO.File]::WriteAllText($f, $t, $UTF8)
}
function Echapper-Html([string]$t) { return $t.Replace('&', '&amp;').Replace('"', '&quot;').Replace('<', '&lt;').Replace('>', '&gt;') }
function Donnees-De([string]$dossier) {
  # « <date de création du coffre>|<chemin> » (échappé pour la page), lu dans coffre.json du dossier des données
  $fc = Join-Path $dossier 'coffre.json'
  if (-not (Test-Path -LiteralPath $fc)) { throw ('coffre.json introuvable dans ' + $dossier + ' : indiquer le dossier des données de Tessera (celui qui contient coffre.json).') }
  $t = [System.IO.File]::ReadAllText($fc, $UTF8)
  if ($t -notmatch '"format"\s*:\s*"SIC-coffre"') { throw ('coffre.json de ' + $dossier + ' n''est pas un coffre de Tessera.') }
  $m = [regex]::Match($t, '"creeLe"\s*:\s*"([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z)"')
  if (-not $m.Success) { throw ('date de création du coffre illisible dans ' + $fc + '.') }
  return (Echapper-Html ($m.Groups[1].Value + '|' + $dossier.TrimEnd('\', '/')))
}
function Lire-Donnees {
  $f = Join-Path $Reference $NOM_ADAPTATION
  if (-not (Test-Path -LiteralPath $f)) { return '' }
  $l = @(Get-Content -LiteralPath $f -Encoding UTF8 | Where-Object { $_ -match '^donnees\s+' } | ForEach-Object { ($_ -replace '^donnees\s+', '').Trim() })
  if ($l.Count) { return $l[0] } else { return '' }
}
function Meme-Liste([string[]]$a, [string[]]$b) {
  return ((@($a | Sort-Object) -join ' ') -eq (@($b | Sort-Object) -join ' '))
}
function Lire-Adaptation {
  $f = Join-Path $Reference $NOM_ADAPTATION
  if (-not (Test-Path -LiteralPath $f)) { return ,@() }
  $l = @(Get-Content -LiteralPath $f -Encoding UTF8 | Where-Object { $_ -match '^connexion\s+https://' } | ForEach-Object { ($_ -replace '^connexion\s+', '').Trim() })
  return ,$l
}

function Controler-Dossier([string]$dossier, $origines = @(), [string]$donnees = '') {
  # Retourne la liste des écarts (vide = conforme). $origines : adresses que index.html doit autoriser, $donnees :
  # données fixées (adaptation locale) ; $origines = $null : accepter l'adaptation qu'il contient (retour en arrière)
  $ecarts = @()
  $fichier = Join-Path $dossier $NOM_EMPREINTES
  if (-not (Test-Path -LiteralPath $fichier)) { return ,@($NOM_EMPREINTES + ' absent') }
  $liste = Lire-Empreintes $fichier
  if ($liste.Count -lt 10) { return ,@('liste d''empreintes incomplète (' + $liste.Count + ' fichiers)') }
  $attendus = @{}
  foreach ($e in $liste) {
    $attendus[$e.Rel.ToLowerInvariant()] = $true
    $f = Chemin-Local $dossier $e.Rel
    if (-not (Test-Path -LiteralPath $f -PathType Leaf)) { $ecarts += ('fichier absent : ' + $e.Rel) }
    elseif ($e.Rel -eq 'index.html') {
      $ix = Index-Sans-Adaptation $f
      if ($ix.Hash -ne $e.Hash) { $ecarts += ('empreinte différente : ' + $e.Rel) }
      elseif ($null -ne $origines -and -not (Meme-Liste $ix.Origines $origines)) { $ecarts += ('adresses autorisées différentes dans index.html (' + $(if ($ix.Origines.Count) { $ix.Origines -join ' ' } else { 'aucune' }) + ')') }
      elseif ($null -ne $origines -and $ix.Donnees -ne $donnees) { $ecarts += ('dossier des données fixé différent dans index.html (' + $(if ($ix.Donnees) { $ix.Donnees } else { 'aucun' }) + ')') }
    }
    elseif ((Get-FileHash -LiteralPath $f -Algorithm SHA256).Hash -ne $e.Hash) { $ecarts += ('empreinte différente : ' + $e.Rel) }
  }
  $racine = (Resolve-Path -LiteralPath $dossier).ProviderPath.TrimEnd('\', '/')
  foreach ($f in (Get-ChildItem -LiteralPath $dossier -Recurse -File -Force)) {
    $rel = $f.FullName.Substring($racine.Length + 1) -replace '\\', '/'
    if ($rel -ne $NOM_EMPREINTES -and -not $attendus.ContainsKey($rel.ToLowerInvariant())) { $ecarts += ('fichier en trop : ' + $rel) }
  }
  return ,$ecarts
}

function Version-De([string]$dossier) {
  $v = Join-Path $dossier 'js\version.js'
  if (-not (Test-Path -LiteralPath $v)) { $v = Join-Path $dossier 'js/version.js' }
  if (Test-Path -LiteralPath $v) {
    $m = [regex]::Match((Get-Content -LiteralPath $v -Raw -Encoding UTF8), "VERSION\s*=\s*'([^']+)'")
    if ($m.Success) { return $m.Groups[1].Value }
  }
  return ''
}

function Comparer-Versions([string]$a, [string]$b) {
  # -1 si a < b, 0 si égales, 1 si a > b (le suffixe de bêta passe avant la version finale)
  $pa = ($a -split '-', 2); $pb = ($b -split '-', 2)
  $na = @($pa[0].Split('.') | ForEach-Object { [int]$_ }); $nb = @($pb[0].Split('.') | ForEach-Object { [int]$_ })
  for ($i = 0; $i -lt [Math]::Max($na.Count, $nb.Count); $i++) {
    $x = 0; $y = 0
    if ($i -lt $na.Count) { $x = $na[$i] }
    if ($i -lt $nb.Count) { $y = $nb[$i] }
    if ($x -lt $y) { return -1 }
    if ($x -gt $y) { return 1 }
  }
  if ($pa.Count -gt 1 -and $pb.Count -eq 1) { return -1 }
  if ($pa.Count -eq 1 -and $pb.Count -gt 1) { return 1 }
  if ($pa.Count -gt 1 -and $pb.Count -gt 1) { return [string]::CompareOrdinal($pa[1], $pb[1]) }
  return 0
}

function Ranger-Reference([string]$dossier, [string[]]$origines, [string]$donnees = '') {
  if (-not (Test-Path -LiteralPath $Reference)) { New-Item -ItemType Directory -Path $Reference -Force | Out-Null }
  Copy-Item -LiteralPath (Join-Path $dossier $NOM_EMPREINTES) -Destination (Join-Path $Reference $NOM_EMPREINTES) -Force
  $fa = Join-Path $Reference $NOM_ADAPTATION
  if ($origines.Count -gt 0 -or $donnees) {
    $l = @('# Tessera Santé : adaptation locale de index.html, écrite par mettre-a-jour-outil.ps1 le ' + (Get-Date -Format 'yyyy-MM-dd HH:mm') + ' par ' + $env:USERNAME,
      '# connexion : seules adresses que Tessera peut joindre (agenda de la messagerie) ; donnees : seules données que cette copie ouvre.') + @($origines | ForEach-Object { 'connexion ' + $_ })
    if ($donnees) { $l += ('donnees ' + $donnees) }
    [System.IO.File]::WriteAllLines($fa, $l, $UTF8)
  } elseif (Test-Path -LiteralPath $fa) { Remove-Item -LiteralPath $fa -Force }
}

function Reprendre-Droits([string]$depuis, [string]$vers) {
  if ($env:OS -ne 'Windows_NT' -or -not (Test-Path -LiteralPath $depuis)) { return }
  try { Set-Acl -LiteralPath $vers -AclObject (Get-Acl -LiteralPath $depuis) }
  catch { Ecrire-Journal ('ATTENTION : droits NTFS non repris (' + $_.Exception.Message + ') ; vérifier les droits de ' + $Destination + '.') }
}

function Telecharger([string]$url, [string]$vers) {
  $p = @{ Uri = $url; OutFile = $vers; UseBasicParsing = $true }
  if ($Proxy) { $p.Proxy = $Proxy; $p.ProxyUseDefaultCredentials = $true }
  Invoke-WebRequest @p
}

# ------------------------------------------------------------------ Adresses autorisées (adaptation locale)
try {
  if ($SansZimbra) { $ORIGINES = @() }
  elseif ($Zimbra.Count -gt 0) { $ORIGINES = @($Zimbra | Where-Object { $_ } | ForEach-Object { $_ -split '[,\s]+' } | Where-Object { $_ } | ForEach-Object { Origine-Valide $_ } | Select-Object -Unique) }
  else { $ORIGINES = Lire-Adaptation }
} catch { Ecrire-Journal ('ARRÊT : ' + $_.Exception.Message); exit 2 }
if ($ORIGINES.Count -gt 3) { Ecrire-Journal 'ARRÊT : trois adresses au plus pour -Zimbra.'; exit 2 }
try {
  if ($SansDonnees) { $DONNEES = '' }
  elseif ($Donnees) { $DONNEES = Donnees-De $Donnees }
  else { $DONNEES = Lire-Donnees }
} catch { Ecrire-Journal ('ARRÊT : ' + $_.Exception.Message); exit 2 }
$TEXTE_ORIGINES = $(if ($ORIGINES.Count) { 'connexion autorisée vers ' + ($ORIGINES -join ', ') } else { 'aucune connexion autorisée' }) + $(if ($DONNEES) { ', dossier des données fixé (' + ($DONNEES -replace '&quot;', '"' -replace '&lt;', '<' -replace '&gt;', '>' -replace '&amp;', '&') + ')' } else { ', dossier des données au choix des agents' })

# ------------------------------------------------------------------ Retour à la version précédente
if ($Revenir) {
  if (-not (Test-Path -LiteralPath (Join-Path $ancien 'index.html'))) { Ecrire-Journal ('ARRÊT : aucune version précédente (' + $ancien + ').'); exit 2 }
  $ecarts = Controler-Dossier $ancien $null
  if ($ecarts.Count -gt 0 -and -not $Forcer) {
    Ecrire-Journal ('ARRÊT : la version précédente ne correspond plus à ses empreintes (' + $ecarts[0] + ', ' + $ecarts.Count + ' écart(s)). -Forcer pour revenir quand même.')
    exit 2
  }
  $vAct = Version-De $Destination; $vAnc = Version-De $ancien
  if ($Simulation) { Ecrire-Journal ('Simulation : retour de ' + $vAct + ' à ' + $vAnc + ' possible.'); exit 0 }
  $echange = $Destination + '.echange'
  if (Test-Path -LiteralPath $echange) { Remove-Item -LiteralPath $echange -Recurse -Force }
  Rename-Item -LiteralPath $Destination -NewName (Split-Path -Leaf $echange)
  Rename-Item -LiteralPath $ancien -NewName (Split-Path -Leaf $Destination)
  Rename-Item -LiteralPath $echange -NewName (Split-Path -Leaf $ancien)
  $ixA = Index-Sans-Adaptation (Join-Path $Destination 'index.html')
  Ranger-Reference $Destination $ixA.Origines $ixA.Donnees
  Ecrire-Journal ('Retour à la version précédente : ' + $vAnc + ' en place (' + $vAct + ' gardée dans ' + (Split-Path -Leaf $ancien) + ').')
  exit 0
}

# ------------------------------------------------------------------ 1. Récupérer la nouvelle version
if (-not (Test-Path -LiteralPath $parent)) { Ecrire-Journal ('ARRÊT : dossier parent introuvable (' + $parent + ').'); exit 1 }
function Executer {
  $temp = Join-Path ([System.IO.Path]::GetTempPath()) ('TesseraSante-maj-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
  New-Item -ItemType Directory -Path $temp -Force | Out-Null
  try {
    if ($Archive) {
      if (-not (Test-Path -LiteralPath $Archive)) { Ecrire-Journal ('ARRÊT : archive introuvable (' + $Archive + ').'); return 1 }
      Expand-Archive -LiteralPath $Archive -DestinationPath (Join-Path $temp 'zip') -Force
      $trouve = Get-ChildItem -LiteralPath (Join-Path $temp 'zip') -Recurse -Filter $NOM_EMPREINTES -File |
        Where-Object { $_.Directory.Name -eq 'app' -and (Test-Path -LiteralPath (Join-Path $_.DirectoryName 'index.html')) } | Select-Object -First 1
      if (-not $trouve) { Ecrire-Journal 'ARRÊT : aucun dossier « app » avec index.html et EMPREINTES-SHA256.txt dans l''archive.'; return 2 }
      $app = $trouve.DirectoryName
      $origine = 'archive ' + (Split-Path -Leaf $Archive)
    } elseif ($Source) {
      if (Test-Path -LiteralPath (Join-Path $Source $NOM_EMPREINTES)) { $app = $Source }
      elseif (Test-Path -LiteralPath (Join-Path (Join-Path $Source 'app') $NOM_EMPREINTES)) { $app = Join-Path $Source 'app' }
      else { Ecrire-Journal ('ARRÊT : source inaccessible ou sans EMPREINTES-SHA256.txt (' + $Source + ').'); return 1 }
      $origine = 'dossier ' + $Source
    } else {
      try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch { }
      $base = $Adresse.TrimEnd('/') + '/'
      if ($Canal -eq 'beta') { $base += 'beta/' }
      $base += 'app/'
      $app = Join-Path $temp 'app'
      New-Item -ItemType Directory -Path $app -Force | Out-Null
      try { Telecharger ($base + $NOM_EMPREINTES) (Join-Path $app $NOM_EMPREINTES) }
      catch { Ecrire-Journal ('ARRÊT : téléchargement impossible (' + $base + $NOM_EMPREINTES + ') : ' + $_.Exception.Message); return 1 }
      $liste = Lire-Empreintes (Join-Path $app $NOM_EMPREINTES)
      foreach ($e in $liste) {
        $f = Chemin-Local $app $e.Rel
        $d = Split-Path -Parent $f
        if (-not (Test-Path -LiteralPath $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
        try { Telecharger ($base + $e.Rel) $f }
        catch { Ecrire-Journal ('ARRÊT : téléchargement interrompu (' + $e.Rel + ') : ' + $_.Exception.Message); return 1 }
      }
      $origine = 'site publié, version ' + $Canal + ' (' + $base + ')'
    }

    # ---------------------------------------------------------------- 2. Contrôle des empreintes
    $ecarts = Controler-Dossier $app
    if ($ecarts.Count -gt 0) {
      Ecrire-Journal ('ARRÊT : nouvelle version refusée, ' + $ecarts.Count + ' écart(s) : ' + (($ecarts | Select-Object -First 5) -join ' ; ') + '. Version en place conservée.')
      return 2
    }
    $hashListe = (Get-FileHash -LiteralPath (Join-Path $app $NOM_EMPREINTES) -Algorithm SHA256).Hash
    if ($EmpreinteAttendue -and $hashListe -ne $EmpreinteAttendue.Trim().ToUpperInvariant()) {
      Ecrire-Journal ('ARRÊT : le fichier d''empreintes ne correspond pas à l''empreinte attendue (' + $hashListe + '). Version en place conservée.')
      return 2
    }
    $vNouv = Version-De $app
    $nb = (Lire-Empreintes (Join-Path $app $NOM_EMPREINTES)).Count

    # ---------------------------------------------------------------- 3. Comparaison avec la version en place
    $vAct = ''
    if (Test-Path -LiteralPath (Join-Path $Destination 'index.html')) {
      $vAct = Version-De $Destination
      $listeAct = Join-Path $Destination $NOM_EMPREINTES
      if ((Test-Path -LiteralPath $listeAct) -and (Get-FileHash -LiteralPath $listeAct -Algorithm SHA256).Hash -eq $hashListe -and -not $Forcer) {
        $ecartsAct = Controler-Dossier $Destination $ORIGINES $DONNEES
        if ($ecartsAct.Count -eq 0) {
          if (-not $Simulation) { Ranger-Reference $Destination $ORIGINES $DONNEES }
          Ecrire-Journal ('Déjà à jour : version ' + $vAct + ' en place et conforme à ses empreintes (' + $TEXTE_ORIGINES + ').'); return 0
        }
        Ecrire-Journal ('La version en place (' + $vAct + ') présente ' + $ecartsAct.Count + ' écart(s) : réinstallation.')
      } elseif ($vAct -and $vNouv -and (Comparer-Versions $vNouv $vAct) -lt 0 -and -not $Forcer) {
        Ecrire-Journal ('ARRÊT : la version proposée (' + $vNouv + ') est plus ancienne que la version en place (' + $vAct + '). -Forcer pour l''installer quand même, ou -Revenir pour la version précédente.')
        return 3
      }
    }

    if ($Simulation) {
      Ecrire-Journal ('Simulation : version ' + $vNouv + ' contrôlée (' + $nb + ' fichiers, ' + $origine + ', empreinte de la liste ' + $hashListe + ') ; en place : ' + $(if ($vAct) { $vAct } else { 'aucune' }) + ' ; après installation : ' + $TEXTE_ORIGINES + '. Rien n''a été remplacé.')
      return 0
    }

    # ---------------------------------------------------------------- 4. Copie, second contrôle, échange
    if (Test-Path -LiteralPath $nouveau) { Remove-Item -LiteralPath $nouveau -Recurse -Force }
    Copy-Item -LiteralPath $app -Destination $nouveau -Recurse -Force
    Appliquer-Adaptation $nouveau $ORIGINES $DONNEES
    $ecarts = Controler-Dossier $nouveau $ORIGINES $DONNEES
    if ($ecarts.Count -gt 0) {
      Ecrire-Journal ('ARRÊT : copie vers ' + $nouveau + ' incomplète (' + $ecarts[0] + '). Version en place conservée.')
      Remove-Item -LiteralPath $nouveau -Recurse -Force
      return 2
    }
    Reprendre-Droits $Destination $nouveau
    if (Test-Path -LiteralPath $Destination) {
      if (Test-Path -LiteralPath $ancien) { Remove-Item -LiteralPath $ancien -Recurse -Force }
      Rename-Item -LiteralPath $Destination -NewName (Split-Path -Leaf $ancien)
    }
    try { Rename-Item -LiteralPath $nouveau -NewName (Split-Path -Leaf $Destination) }
    catch {
      if (Test-Path -LiteralPath $ancien) { Rename-Item -LiteralPath $ancien -NewName (Split-Path -Leaf $Destination) }
      Ecrire-Journal ('ARRÊT : échange impossible (' + $_.Exception.Message + '). Version précédente remise en place.')
      return 2
    }

    # ---------------------------------------------------------------- 5. Référence
    Ranger-Reference $Destination $ORIGINES $DONNEES
    Ecrire-Journal ('Mise à jour faite : ' + $(if ($vAct) { $vAct } else { 'aucune' }) + ' → ' + $vNouv + ' (' + $nb + ' fichiers contrôlés, ' + $origine + ', empreinte de la liste ' + $hashListe + ', ' + $TEXTE_ORIGINES + '). Les agents rechargent la page (F5) ou rouvrent Tessera.')
    return 0
  } catch {
    Ecrire-Journal ('ERREUR : ' + $_.Exception.Message + ' Version en place conservée.')
    return 2
  } finally {
    if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue }
  }
}

exit (Executer)
