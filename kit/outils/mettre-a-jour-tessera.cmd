@echo off
rem SPDX-License-Identifier: EUPL-1.2
rem Tessera Sante : mise a jour de l'application en un double-clic.
rem A placer, avec mettre-a-jour-outil.ps1, dans le dossier qui contient « app » (par exemple
rem \\serveur\applis\TesseraSante\). A lancer avec le compte de mise a jour : Maj + clic droit,
rem « Executer en tant qu'autre utilisateur ». Mode d'emploi : kit/03-guide-installation.md, § 3 bis.
rem Parametres facultatifs transmis au script, par exemple : -Archive "C:\Telechargements\tessera.zip",
rem -Canal beta, -Proxy http://proxy:8080 (raccourci dont la cible porte ces parametres).
chcp 65001 >nul
setlocal
set "SCRIPT=%~dp0mettre-a-jour-outil.ps1"
if not exist "%SCRIPT%" (
  echo Le fichier mettre-a-jour-outil.ps1 doit se trouver dans le meme dossier que ce fichier.
  goto fin
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
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" %*
if errorlevel 1 (
  echo.
  echo La mise à jour n'a pas été faite : la version en place reste utilisée.
) else (
  echo.
  echo Terminé. Les agents rechargent la page ^(F5^) ou rouvrent Tessera.
)
:fin
echo.
pause
