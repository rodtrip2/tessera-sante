# SPDX-License-Identifier: EUPL-1.2
#
# Tessera Santé : copie de l'outil (dossier « app ») sur le disque d'un poste désigné, pour l'utiliser
# même pendant une panne du réseau, quand l'outil n'est pas servi en HTTPS (sinon, préférer la mise en cache par
# le navigateur, Administration → Sauvegardes et exports). Mode d'emploi : kit/10-travail-hors-reseau.md.
#
# À lancer à l'ouverture de session (stratégie de groupe ou tâche planifiée « À l'ouverture de session »), sous le
# compte de l'agent ou un compte de service ayant lecture sur la source et écriture dans le dossier local.
#   1. copie de la source vers un dossier temporaire ;
#   2. contrôle de CHAQUE fichier par son empreinte SHA-256 (EMPREINTES-SHA256.txt publié avec l'outil) :
#      au moindre écart, la copie est abandonnée et la version déjà présente sur le poste reste en place ;
#   3. remplacement de la version locale (l'ancienne est gardée dans « app.ancien ») ;
#   4. raccourci « Tessera Santé » sur le bureau public, avec l'icône de l'outil.
# Si la source est inaccessible (panne), rien n'est modifié : le poste garde sa dernière copie.
# Adaptation locale de index.html (adresse de l'agenda de la messagerie, -Zimbra ; dossier des données fixé, -Donnees ;
# 26 novembre 2026) : index.html est contrôlé une fois l'adaptation retirée, et l'adaptation doit être celle notée par
# mettre-a-jour-outil.ps1 dans « reference-empreintes\ADAPTATION-LOCALE.txt » (à côté du dossier « app » de la source) ;
# la copie du poste garde la même adaptation (même dossier des données, mêmes adresses).
# Codes de sortie : 0 = à jour ; 1 = source inaccessible (copie locale inchangée) ; 2 = contrôle refusé ou erreur.

param(
  # Dossier « app » publié par le service informatique (partage ou dossier du serveur intranet)
  [string]$Source = '\\serveur-donnees\partage\TesseraSante-outil\app',
  # Dossier local du poste
  [string]$Local = 'C:\TesseraSante\app',
  # Raccourci sur le bureau public (vide = pas de raccourci)
  [string]$Raccourci = (Join-Path $env:PUBLIC 'Desktop\Tessera Santé.lnk'),
  [string]$Journal = (Join-Path $env:ProgramData 'TesseraSante\copie-locale-outil.log'),
  [string]$Robocopy = 'robocopy.exe',
  # Dossier de référence des empreintes et de l'adaptation locale (vide = « reference-empreintes » à côté de la source)
  [string]$Reference = ''
)

$ErrorActionPreference = 'Stop'
function Ecrire-Journal([string]$texte) {
  $d = Split-Path -Parent $Journal
  if ($d -and -not (Test-Path -LiteralPath $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
  $ligne = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '  ' + $texte
  Add-Content -LiteralPath $Journal -Value $ligne -Encoding UTF8
  Write-Output $ligne
}

$UTF8 = New-Object System.Text.UTF8Encoding($false)
if (-not $Reference) { $Reference = Join-Path (Split-Path -Parent $Source) 'reference-empreintes' }
function Index-Sans-Adaptation([string]$fichier) {
  # Empreinte de index.html une fois l'adaptation retirée, et adaptation (adresses autorisées, données fixées)
  $t = [System.IO.File]::ReadAllText($fichier, $UTF8)
  $n = [regex]::Replace([regex]::Replace($t, 'connect-src\s+[^;"]*', "connect-src 'none'"), '<meta name="tessera-donnees" content="([^"]*)">', '<meta name="tessera-donnees" content="">')
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try { $h = (($sha.ComputeHash($UTF8.GetBytes($n)) | ForEach-Object { $_.ToString('X2') }) -join '') } finally { $sha.Dispose() }
  $c = [regex]::Match($t, 'connect-src\s+([^;"]*)'); $d = [regex]::Match($t, '<meta name="tessera-donnees" content="([^"]*)">')
  $o = @(); if ($c.Success) { $o = @($c.Groups[1].Value.Trim() -split '\s+' | Where-Object { $_ -match '^https://' } | Sort-Object) }
  return [pscustomobject]@{ Hash = $h; Origines = ($o -join ' '); Donnees = $(if ($d.Success) { $d.Groups[1].Value } else { '' }) }
}
function Adaptation-Notee {
  $f = Join-Path $Reference 'ADAPTATION-LOCALE.txt'
  if (-not (Test-Path -LiteralPath $f)) { return $null }
  $l = @(Get-Content -LiteralPath $f -Encoding UTF8)
  $o = @($l | Where-Object { $_ -match '^connexion\s+https://' } | ForEach-Object { ($_ -replace '^connexion\s+', '').Trim() } | Sort-Object)
  $d = @($l | Where-Object { $_ -match '^donnees\s+' } | ForEach-Object { ($_ -replace '^donnees\s+', '').Trim() })
  return [pscustomobject]@{ Origines = ($o -join ' '); Donnees = $(if ($d.Count) { $d[0] } else { '' }) }
}

if (-not (Test-Path -LiteralPath (Join-Path $Source 'index.html'))) { Ecrire-Journal ('Source inaccessible (' + $Source + ') : la copie locale reste celle du poste.'); exit 1 }
$empreintes = Join-Path $Source 'EMPREINTES-SHA256.txt'
if (-not (Test-Path -LiteralPath $empreintes)) { Ecrire-Journal 'ARRÊT : EMPREINTES-SHA256.txt absent de la source.'; exit 2 }

# Déjà à jour ? (même fichier d'empreintes, même index.html : une adaptation changée est reprise)
$fichierLocal = Join-Path $Local 'EMPREINTES-SHA256.txt'
$indexLocal = Join-Path $Local 'index.html'
if ((Test-Path -LiteralPath $fichierLocal) -and ((Get-FileHash -LiteralPath $fichierLocal).Hash -eq (Get-FileHash -LiteralPath $empreintes).Hash) -and
    (Test-Path -LiteralPath $indexLocal) -and ((Get-FileHash -LiteralPath $indexLocal).Hash -eq (Get-FileHash -LiteralPath (Join-Path $Source 'index.html')).Hash)) {
  Ecrire-Journal 'Copie locale déjà à jour.'
} else {
  $temp = $Local + '.nouveau'
  if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Recurse -Force }
  & $Robocopy $Source $temp '/E' '/R:2' '/W:5' '/NP' '/NDL' '/NFL' '/NJH' '/NJS' | Out-Null
  if ($LASTEXITCODE -ge 8) { Ecrire-Journal ('ÉCHEC de la copie (code robocopy ' + $LASTEXITCODE + ').'); exit 2 }
  # Contrôle de chaque fichier publié
  $lignes = Get-Content -LiteralPath (Join-Path $temp 'EMPREINTES-SHA256.txt') -Encoding UTF8 | Where-Object { $_ -match '^[0-9A-F]{64}\s+app/' }
  if ($lignes.Count -lt 10) { Ecrire-Journal 'ARRÊT : liste d''empreintes incomplète.'; Remove-Item -LiteralPath $temp -Recurse -Force; exit 2 }
  foreach ($l in $lignes) {
    $attendu = $l.Substring(0, 64)
    $rel = ($l.Substring(64).Trim() -replace '^app/', '') -replace '/', [System.IO.Path]::DirectorySeparatorChar
    $f = Join-Path $temp $rel
    $ok = Test-Path -LiteralPath $f
    $adaptation = ''
    if ($ok -and $rel -eq 'index.html') {
      $ix = Index-Sans-Adaptation $f
      $ok = $ix.Hash -eq $attendu
      if ($ok -and ($ix.Origines -or $ix.Donnees)) {
        # Adaptation locale : acceptée seulement si elle est celle notée par mettre-a-jour-outil.ps1
        $nt = Adaptation-Notee
        if (-not $nt -or $nt.Origines -ne $ix.Origines -or $nt.Donnees -ne $ix.Donnees) {
          Ecrire-Journal ('ARRÊT : index.html porte une adaptation locale (' + $ix.Origines + ' ' + $ix.Donnees + ') absente ou différente de celle notée dans ' + (Join-Path $Reference 'ADAPTATION-LOCALE.txt') + ' — la version locale actuelle est conservée.')
          Remove-Item -LiteralPath $temp -Recurse -Force; exit 2
        }
        $adaptation = 'adaptation locale reprise'
      }
    } elseif ($ok) { $ok = (Get-FileHash -LiteralPath $f -Algorithm SHA256).Hash -eq $attendu }
    if (-not $ok) {
      Ecrire-Journal ('ARRÊT : empreinte différente ou fichier absent : ' + $rel + ' — la version locale actuelle est conservée.')
      Remove-Item -LiteralPath $temp -Recurse -Force; exit 2
    }
    if ($adaptation) { Ecrire-Journal ('index.html : ' + $adaptation + ' (' + $(if ($ix.Donnees) { 'dossier des données fixé' } else { '' }) + $(if ($ix.Origines) { ' ; connexion vers ' + $ix.Origines } else { '' }) + ').') }
  }
  # Remplacement
  $ancien = $Local + '.ancien'
  if (Test-Path -LiteralPath $ancien) { Remove-Item -LiteralPath $ancien -Recurse -Force }
  if (Test-Path -LiteralPath $Local) { Rename-Item -LiteralPath $Local -NewName (Split-Path -Leaf $ancien) }
  Rename-Item -LiteralPath $temp -NewName (Split-Path -Leaf $Local)
  $version = (Get-Content -LiteralPath (Join-Path $Local 'EMPREINTES-SHA256.txt') -TotalCount 1 -Encoding UTF8)
  Ecrire-Journal ('Copie locale mise à jour et contrôlée (' + $lignes.Count + ' fichiers) : ' + $version)
}

# Raccourci (Windows seulement)
if ($Raccourci -and $env:OS -eq 'Windows_NT') {
  $index = Join-Path $Local 'index.html'
  $edge = Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'
  $sh = New-Object -ComObject WScript.Shell
  $lnk = $sh.CreateShortcut($Raccourci)
  if (Test-Path -LiteralPath $edge) { $lnk.TargetPath = $edge; $lnk.Arguments = '--app="file:///' + ($index -replace '\\', '/') + '"' }
  else { $lnk.TargetPath = $index }
  $lnk.IconLocation = (Join-Path $Local 'img\icone.ico') + ',0'
  $lnk.Description = 'Tessera Santé (copie locale)'
  $lnk.Save()
}
exit 0
