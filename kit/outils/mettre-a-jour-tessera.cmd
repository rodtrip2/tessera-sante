@echo off
rem SPDX-License-Identifier: EUPL-1.2
rem Tessera Sante : installation et mise a jour de l'application en un double-clic (26 novembre 2026).
rem Ce fichier suffit : place seul dans le dossier qui recevra Tessera (par exemple \\serveur\applis\TesseraSante\),
rem il telecharge le script mettre-a-jour-outil.ps1, le controle par son empreinte, puis le lance : verification de la
rem version (rien n'est remplace), confirmation, installation ou mise a jour du dossier « app » et des outils.
rem A lancer avec le compte de mise a jour : Maj + clic droit, « Executer en tant qu'autre utilisateur ».
rem Mode d'emploi : kit/03-guide-installation.md, § 3 bis.
rem Parametres facultatifs transmis au script, par exemple : -Canal beta, -Proxy http://proxy:8080,
rem -Zimbra https://zimbra.etablissement.fr, -Donnees \\serveur\partage\Tessera\donnees, -Archive "C:\...\tessera.zip".
rem Adresse des outils (miroir interne, version beta : remplacer ci-dessous, par exemple .../tessera-sante/beta/kit/outils/).
chcp 65001 >nul
setlocal
set "ADRESSE=https://rodtrip2.github.io/tessera-sante/kit/outils/"
set "SCRIPT=%~dp0mettre-a-jour-outil.ps1"
echo.
echo === Tessera Santé : téléchargement du script de mise à jour ===
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch { }; $b='%ADRESSE%'; $r='%~dp0'; $t=Join-Path ([IO.Path]::GetTempPath()) ('tessera-amorce-' + [guid]::NewGuid().ToString('N')); New-Item -ItemType Directory -Path $t | Out-Null; try { Invoke-WebRequest -UseBasicParsing -Uri ($b + 'EMPREINTES-OUTILS.txt') -OutFile (Join-Path $t 'liste.txt'); Invoke-WebRequest -UseBasicParsing -Uri ($b + 'mettre-a-jour-outil.ps1') -OutFile (Join-Path $t 'script.ps1'); $l = @(Get-Content -LiteralPath (Join-Path $t 'liste.txt') | Where-Object { $_ -match '^[0-9A-Fa-f]{64}\s+mettre-a-jour-outil\.ps1$' }); if ($l.Count -ne 1) { throw 'script absent de la liste des empreintes' }; $h = ($l[0] -split '\s+')[0].ToUpperInvariant(); if ((Get-FileHash -LiteralPath (Join-Path $t 'script.ps1') -Algorithm SHA256).Hash -ne $h) { throw 'empreinte differente' }; Copy-Item -LiteralPath (Join-Path $t 'script.ps1') -Destination (Join-Path $r 'mettre-a-jour-outil.ps1') -Force; Write-Host 'Script telecharge et controle.'; exit 0 } catch { Write-Host ('Telechargement du script impossible : ' + $_.Exception.Message); exit 1 } finally { Remove-Item -LiteralPath $t -Recurse -Force -ErrorAction SilentlyContinue }"
if errorlevel 1 (
  if exist "%SCRIPT%" (
    echo Le script déjà présent dans ce dossier est utilisé.
  ) else (
    echo Impossible de continuer sans le script : vérifier l'accès à Internet ou au proxy, ou déposer
    echo mettre-a-jour-outil.ps1 à côté de ce fichier ^(kit/outils^).
    goto fin
  )
)
echo.
echo === Tessera Santé : vérification de la nouvelle version (rien n'est remplacé) ===
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" -Simulation %*
if errorlevel 1 (
  echo.
  echo Vérification refusée ou impossible : la version en place n'a pas été modifiée.
  goto fin
)
echo.
choice /C ON /M "Installer cette version maintenant"
if errorlevel 2 (
  echo Rien n'a été modifié.
  goto fin
)
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" -SansConfirmation %*
if errorlevel 1 (
  echo.
  echo L'installation ou la mise à jour n'a pas été faite : la version en place reste utilisée.
) else (
  echo.
  echo Terminé. Les agents rechargent la page ^(F5^) ou rouvrent Tessera.
)
:fin
echo.
pause
rem Nouvelle version de ce fichier déposée par le script : elle le remplace en dernier (bloc lu en entier avant la copie)
if exist "%~dp0mettre-a-jour-tessera.cmd.nouveau" (move /y "%~dp0mettre-a-jour-tessera.cmd.nouveau" "%~f0" >nul & goto :eof)
