# SPDX-License-Identifier: EUPL-1.2
#
# Tessera Santé : contrôle de l'intégrité de l'application (dossier « app ») hébergée sur un partage réseau ou un
# serveur web. Mode d'emploi : kit/03-guide-installation.md, § 3 bis.
#
# À planifier chaque jour (tâche planifiée du service informatique, compte en lecture seule suffisant) :
#   1. compare le fichier d'empreintes du dossier à la copie de référence rangée par mettre-a-jour-outil.ps1 dans un
#      dossier que les agents ne peuvent pas modifier (sans référence, le contrôle se fait sur le fichier du dossier
#      lui-même : il repère un fichier abîmé, pas un remplacement concerté du code et de la liste) ;
#   2. contrôle CHAQUE fichier par son empreinte SHA-256 et signale tout fichier absent, modifié ou en trop ;
#   3. écrit le résultat dans un journal et, avec -JournalWindows, dans le journal « Application » de Windows
#      (source « TesseraSante » : événement 1000 = conforme, 1001 = écart, 1002 = dossier inaccessible), pour la
#      supervision du service informatique.
# Adaptation locale (24 novembre 2026) : si mettre-a-jour-outil.ps1 -Zimbra a autorisé le serveur d'agenda de
# l'établissement, index.html est contrôlé une fois la règle connect-src remise à 'none', et les adresses qu'il
# autorise doivent être exactement celles notées dans « ADAPTATION-LOCALE.txt » du dossier de référence.
# Le contrôle se fait hors de l'application : une version modifiée de Tessera pourrait supprimer sa propre vérification.
# Codes de sortie : 0 = conforme ; 1 = dossier ou référence inaccessible ; 2 = écart constaté.

param(
  # Dossier de l'application utilisé par les agents (celui qui contient index.html) ; par défaut : « app » à côté du script
  [string]$Dossier = '',
  # Dossier de référence (ou chemin du fichier EMPREINTES-SHA256.txt de référence)
  [string]$Reference = '',
  [string]$Journal = '',
  # Écrire aussi dans le journal « Application » de Windows
  [switch]$JournalWindows
)

$ErrorActionPreference = 'Stop'
if (-not $Dossier) { $Dossier = Join-Path $PSScriptRoot 'app' }
$Dossier = $Dossier.TrimEnd('\', '/')
$parent = Split-Path -Parent $Dossier
if (-not $Reference) { $Reference = Join-Path $parent 'reference-empreintes' }
if (-not $Journal) { $Journal = Join-Path $parent 'journal-controles.log' }
$NOM_EMPREINTES = 'EMPREINTES-SHA256.txt'
$UTF8 = New-Object System.Text.UTF8Encoding($false)

function Origines-Csp([string]$texte) {
  $m = [regex]::Match($texte, 'connect-src\s+([^;"]*)')
  if (-not $m.Success) { return ,@() }
  $l = @($m.Groups[1].Value.Trim() -split '\s+' | Where-Object { $_ -match '^https://' })
  return ,$l
}
function Index-Sans-Adaptation([string]$fichier) {
  $t = [System.IO.File]::ReadAllText($fichier, $UTF8)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try { $h = (($sha.ComputeHash($UTF8.GetBytes([regex]::Replace($t, 'connect-src\s+[^;"]*', "connect-src 'none'"))) | ForEach-Object { $_.ToString('X2') }) -join '') } finally { $sha.Dispose() }
  return [pscustomobject]@{ Hash = $h; Origines = (Origines-Csp $t) }
}

function Ecrire-Journal([string]$texte, [int]$evenement = 0) {
  $ligne = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '  ' + $texte
  try {
    $d = Split-Path -Parent $Journal
    if ($d -and -not (Test-Path -LiteralPath $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
    Add-Content -LiteralPath $Journal -Value $ligne -Encoding UTF8
  } catch { Write-Warning ('Journal inaccessible (' + $Journal + ') : ' + $_.Exception.Message) }
  if ($JournalWindows -and $evenement -and $env:OS -eq 'Windows_NT') {
    try {
      if (-not [System.Diagnostics.EventLog]::SourceExists('TesseraSante')) { New-EventLog -LogName Application -Source 'TesseraSante' }
      $type = 'Information'
      if ($evenement -ne 1000) { $type = 'Error' }
      Write-EventLog -LogName Application -Source 'TesseraSante' -EventId $evenement -EntryType $type -Message ('Tessera Santé (' + $Dossier + ') : ' + $texte)
    } catch { Write-Warning ('Journal Windows inaccessible (droits d''administrateur nécessaires la première fois) : ' + $_.Exception.Message) }
  }
  Write-Host $ligne
}

function Lire-Empreintes([string]$fichier) {
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

try {
  if (-not (Test-Path -LiteralPath (Join-Path $Dossier 'index.html'))) { Ecrire-Journal ('Dossier inaccessible ou sans index.html : ' + $Dossier) 1002; exit 1 }
  $listeDossier = Join-Path $Dossier $NOM_EMPREINTES

  # Fichier de référence
  $ref = $Reference
  if (Test-Path -LiteralPath $ref -PathType Container) { $ref = Join-Path $ref $NOM_EMPREINTES }
  $avertissement = ''
  if (-not (Test-Path -LiteralPath $ref -PathType Leaf)) {
    if (-not (Test-Path -LiteralPath $listeDossier)) { Ecrire-Journal ('ÉCART : ni référence (' + $Reference + ') ni ' + $NOM_EMPREINTES + ' dans le dossier.') 1001; exit 2 }
    $ref = $listeDossier
    $avertissement = ' (sans copie de référence : contrôle sur la liste du dossier lui-même)'
  }
  $liste = Lire-Empreintes $ref
  # Adresses autorisées notées par mettre-a-jour-outil.ps1 (à côté de la référence)
  $fa = Join-Path (Split-Path -Parent $ref) 'ADAPTATION-LOCALE.txt'
  $autorisees = @()
  if ($ref -ne $listeDossier -and (Test-Path -LiteralPath $fa)) { $autorisees = @(Get-Content -LiteralPath $fa -Encoding UTF8 | Where-Object { $_ -match '^connexion\s+https://' } | ForEach-Object { ($_ -replace '^connexion\s+', '').Trim() }) }
  if ($liste.Count -lt 10) { Ecrire-Journal ('ÉCART : liste d''empreintes de référence incomplète (' + $liste.Count + ' fichiers).') 1001; exit 2 }

  $ecarts = @()
  if ($ref -ne $listeDossier) {
    if (-not (Test-Path -LiteralPath $listeDossier)) { $ecarts += ($NOM_EMPREINTES + ' absent du dossier') }
    elseif ((Get-FileHash -LiteralPath $listeDossier -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $ref -Algorithm SHA256).Hash) {
      $ecarts += ($NOM_EMPREINTES + ' du dossier différent de la référence')
    }
  }
  $attendus = @{}
  foreach ($e in $liste) {
    $attendus[$e.Rel.ToLowerInvariant()] = $true
    $f = Join-Path $Dossier ($e.Rel -replace '/', [System.IO.Path]::DirectorySeparatorChar)
    if (-not (Test-Path -LiteralPath $f -PathType Leaf)) { $ecarts += ('fichier absent : ' + $e.Rel) }
    elseif ($e.Rel -eq 'index.html') {
      $ix = Index-Sans-Adaptation $f
      if ($ix.Hash -ne $e.Hash) { $ecarts += ('fichier modifié : ' + $e.Rel) }
      elseif ((@($ix.Origines | Sort-Object) -join ' ') -ne (@($autorisees | Sort-Object) -join ' ')) { $ecarts += ('adresses autorisées dans index.html (' + $(if ($ix.Origines.Count) { $ix.Origines -join ' ' } else { 'aucune' }) + ') différentes de celles notées par la mise à jour (' + $(if ($autorisees.Count) { $autorisees -join ' ' } else { 'aucune' }) + ')') }
    }
    elseif ((Get-FileHash -LiteralPath $f -Algorithm SHA256).Hash -ne $e.Hash) { $ecarts += ('fichier modifié : ' + $e.Rel) }
  }
  $racine = (Resolve-Path -LiteralPath $Dossier).ProviderPath.TrimEnd('\', '/')
  foreach ($f in (Get-ChildItem -LiteralPath $Dossier -Recurse -File -Force)) {
    $rel = $f.FullName.Substring($racine.Length + 1) -replace '\\', '/'
    if ($rel -ne $NOM_EMPREINTES -and -not $attendus.ContainsKey($rel.ToLowerInvariant())) { $ecarts += ('fichier en trop : ' + $rel) }
  }

  $version = (Get-Content -LiteralPath $ref -TotalCount 1 -Encoding UTF8) -replace '^#\s*', '' -replace '\s+—.*$', ''
  if ($ecarts.Count -gt 0) {
    Ecrire-Journal ('ÉCART : ' + $ecarts.Count + ' anomalie(s) dans ' + $version + $avertissement + ' : ' + (($ecarts | Select-Object -First 10) -join ' ; ') + '. Ne plus utiliser cette copie avant vérification ; réinstaller avec mettre-a-jour-outil.ps1.') 1001
    exit 2
  }
  Ecrire-Journal ('Conforme : ' + $version + ', ' + $liste.Count + ' fichiers contrôlés' + $avertissement + $(if ($autorisees.Count) { ' ; adaptation locale : connexion autorisée vers ' + ($autorisees -join ', ') } else { '' }) + '.') 1000
  exit 0
} catch {
  Ecrire-Journal ('Contrôle impossible : ' + $_.Exception.Message) 1002
  exit 1
}
