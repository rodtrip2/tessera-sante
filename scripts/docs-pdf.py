# SPDX-License-Identifier: EUPL-1.2
"""Génère les PDF des documents de docs/ à partir des fichiers Markdown.

Prérequis : python3 -m pip install markdown playwright && python3 -m playwright install chromium
Usage     : python3 scripts/docs-pdf.py
"""
import html
import pathlib
import re

import markdown
from playwright.sync_api import sync_playwright

RACINE = pathlib.Path(__file__).resolve().parent.parent
DOCS = RACINE / 'docs'

CSS = """
@page { size: A4; margin: 18mm 16mm 18mm 16mm; }
* { box-sizing: border-box; }
body { font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif; font-size: 10.2pt; line-height: 1.45; color: #1d2320; }
h1 { font-size: 19pt; color: #1f5f5b; margin: 0 0 4mm; padding-bottom: 3mm; border-bottom: 2px solid #1f5f5b; }
h2 { font-size: 13pt; color: #1f5f5b; margin: 7mm 0 2.5mm; break-after: avoid; }
h3 { font-size: 11pt; margin: 5mm 0 2mm; break-after: avoid; }
p { margin: 0 0 2.5mm; }
em { color: #444; }
table { width: 100%; border-collapse: collapse; margin: 2mm 0 4mm; font-size: 9.2pt; break-inside: auto; }
tr { break-inside: avoid; }
th, td { border: 1px solid #c9cfca; padding: 1.6mm 2.2mm; text-align: left; vertical-align: top; }
th { background: #e6efed; font-weight: 600; }
code { font-family: Consolas, "Cascadia Mono", monospace; font-size: 8.8pt; background: #f1f3f0; padding: 0 1mm; border-radius: 2px; }
pre { background: #f4f5f2; border: 1px solid #d9ddd7; border-radius: 3px; padding: 3mm; font-size: 8pt; line-height: 1.3; overflow: hidden; break-inside: avoid; }
pre code { background: none; padding: 0; }
ul, ol { margin: 0 0 3mm; padding-left: 6mm; }
li { margin: 0.6mm 0; }
a { color: #1f5f5b; text-decoration: none; }
hr { border: none; border-top: 1px solid #c9cfca; margin: 6mm 0 3mm; }
hr + p { font-size: 8.5pt; color: #555; }
.case { font-family: "Segoe UI Symbol", sans-serif; }
img { display: block; max-width: 100%; max-height: 95mm; margin: 2mm auto 1mm; border: 1px solid #c9cfca; border-radius: 3px; break-inside: avoid; }
img + em, p > em:only-child { display: block; text-align: center; font-size: 8.5pt; color: #555; margin-bottom: 3mm; }
h2 { break-before: auto; }
.saut { break-before: page; }
"""


def convertir(md: str) -> str:
    md = re.sub(r'^(\s*)- \[ \] ', r'\1- ☐ ', md, flags=re.M)
    md = re.sub(r'^(\s*)- \[x\] ', r'\1- ☑ ', md, flags=re.M)
    return markdown.markdown(md, extensions=['tables', 'fenced_code', 'sane_lists'])


def main():
    with sync_playwright() as p:
        navigateur = p.chromium.launch()
        page = navigateur.new_page()
        for f in sorted(DOCS.glob('*.md')):
            texte = f.read_text(encoding='utf-8')
            titre = re.search(r'^# (.+)$', texte, flags=re.M).group(1)
            tmp = DOCS / ('.' + f.stem + '.html')
            tmp.write_text(f'<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>{html.escape(titre)}</title>'
                           f'<style>{CSS}</style></head><body>{convertir(texte)}</body></html>', encoding='utf-8')
            page.goto(tmp.as_uri())
            page.wait_for_load_state('load')
            pied = ('<div style="font-size:7.5pt;color:#777;width:100%;padding:0 16mm;display:flex;justify-content:space-between">'
                    f'<span>{html.escape(titre)}</span>'
                    '<span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>')
            page.pdf(path=str(f.with_suffix('.pdf')), format='A4', print_background=True, display_header_footer=True,
                     header_template='<div></div>', footer_template=pied,
                     margin={'top': '16mm', 'bottom': '18mm', 'left': '16mm', 'right': '16mm'})
            tmp.unlink()
            print('ok', f.stem + '.pdf')
        navigateur.close()


if __name__ == '__main__':
    main()
