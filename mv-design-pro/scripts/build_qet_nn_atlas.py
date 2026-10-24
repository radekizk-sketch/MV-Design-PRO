#!/usr/bin/env python3
"""Generate offline owner-review atlas from QET candidate JSON.

No pretend switching states, no EPLAN/IEC verification labels, no ENM writes.
The same six CadPrimitive types accepted by canonical CadSymbol are used here.
"""
from __future__ import annotations
import argparse
import html
import json
from pathlib import Path


def attr(value: object) -> str:
    return html.escape(str(value),quote=True)


def prim_svg(p: dict) -> str:
    kind=p["k"]
    if kind=="line":
        return (f'<line x1="{attr(p["x1"])}" y1="{attr(p["y1"])}" '
                f'x2="{attr(p["x2"])}" y2="{attr(p["y2"])}"/>')
    if kind=="circle":
        return (f'<circle cx="{attr(p["cx"])}" cy="{attr(p["cy"])}" '
                f'r="{attr(p["r"])}" class="fill-{attr(p.get("fill","none"))}"/>')
    if kind in ("path","arc"):
        return f'<path d="{attr(p["d"])}" class="fill-{attr(p.get("fill","none"))}"/>'
    if kind=="letter":
        return (f'<text x="{attr(p["x"])}" y="{attr(p["y"])}" '
                f'font-size="{attr(p["size"])}" text-anchor="middle" '
                f'dominant-baseline="middle" class="label">{html.escape(p["t"])}</text>')
    raise ValueError(f"Nieobsługiwany prymityw SVG: {kind}")


def source_svg(symbol: dict) -> str:
    geo=symbol["geometry"]
    w,h=geo["width"],geo["height"]
    ports=symbol["ports"]
    if len(ports)<1:raise ValueError("Brak portów")
    svg=(f'<svg viewBox="-8 -8 {w+16} {h+16}" '
         f'role="img" aria-label="{attr(symbol["namePl"])}" '
         f'data-candidate="{attr(symbol["id"])}" xmlns="http://www.w3.org/2000/svg">'
         f'<rect x="0" y="0" width="{w}" height="{h}" class="bounds"/>'
         + ''.join(prim_svg(p) for p in geo["primitives"])
         + ''.join(f'<circle cx="{attr(p["x"])}" cy="{attr(p["y"])}" r="1.3" '
                   f'class="port"><title>{html.escape(p["name"])} · faza niezweryfikowana</title></circle>'
                   for p in ports)
         + '</svg>')
    return svg

def cell(symbol: dict) -> str:
    svg=source_svg(symbol)
    ports=symbol["ports"]
    source=symbol["source"]
    ref=html.escape(source["path"])
    return (f'<article class="card" data-search="{attr((symbol["namePl"]+" "+symbol["id"]).lower())}">'
            f'<div class="cardhead"><strong>{html.escape(symbol["namePl"])}</strong>'
            f'<small>DRAFT · {len(ports)} zaciski</small></div>'
            f'<div class="graphic">{svg}</div>'
            f'<div class="foot"><code>{html.escape(symbol["id"])}</code>'
            f'<details><summary>Pochodzenie i porty</summary>'
            f'<p>QElectroTech · CC BY 3.0 · {ref}</p>'
            f'<p>SHA-256: <code>{html.escape(source["sha256"])}</code></p>'
            f'<p>Punkty: {", ".join(html.escape(p["name"]) for p in ports)}; funkcje i fazy nieustalone.</p>'
            f'</details></div></article>')


def render(data: dict) -> str:
    if data.get("contract")!="MvNnQetCandidateV1" or data.get("production") is not False:
        raise ValueError("Niepoprawny kontrakt lub biblioteka produkcyjna")
    symbols=data["symbols"]
    cards='\n'.join(cell(s) for s in symbols)
    return f"""<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MV-DESIGN PRO — QET: kandydaci nN</title>
<style>
:root {{font-family:Arial,Helvetica,sans-serif;font-size:14px;}}
*{{box-sizing:border-box}}body{{margin:0;background:#f1f4f6;color:#203541}}
header{{padding:26px 4vw;border-bottom:1px solid #c4d1d7;background:#fff;}}
h1{{font-size:24px;margin:5px 0}}.over{{font-size:11px;letter-spacing:.12em;color:#26728a;font-weight:bold}}
p{{line-height:1.5}}.intro{{max-width:1020px;font-size:13px;color:#526675}}
.toolbar{{display:flex;gap:12px;flex-wrap:wrap;margin-top:18px}}
button,input{{border:1px solid #91a8b4;background:#fff;border-radius:4px;padding:9px;font:inherit;}}
input{{width:min(350px,100%)}}button{{cursor:pointer}}main{{padding:22px 4vw}}
.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:15px;}}
.card{{border:1px solid #b4c5cd;background:#fff;border-radius:5px;padding:15px;}}
.cardhead{{min-height:52px;display:flex;flex-direction:column;gap:6px}}
.cardhead small{{color:#607d8a}}.graphic{{height:245px;display:grid;place-items:center;border:1px solid #d9e1e5;background:#fafcfd}}
.graphic svg{{height:215px;max-width:90%;overflow:visible;stroke:#183748;fill:none;stroke-width:1.25;stroke-linejoin:round;stroke-linecap:butt}}
.graphic .bounds{{stroke:#96b0bc;stroke-width:.35;stroke-dasharray:2 2;}}
.graphic .port{{stroke:#1185a0;fill:#fff;stroke-width:.65}}
.graphic .fill-ink{{fill:#183748}}.graphic .fill-paper{{fill:#fff}}.graphic .label{{stroke:none;fill:#183748}}
.foot{{font-size:11px;color:#526675;overflow-wrap:anywhere}}.foot code{{font-size:10px}}
summary{{cursor:pointer;margin:9px 0}}.note{{border-left:3px solid #af5b33;background:#fff;padding:12px 15px;margin-bottom:20px}}
body.dark{{background:#0a1924;color:#e5f0f5}}body.dark header,body.dark .card,body.dark .note{{background:#122737;color:#e5f0f5;border-color:#375367}}
body.dark .graphic{{background:#0c1a26;border-color:#385669}}
body.dark .graphic svg{{stroke:#d9e9ee}}body.dark .graphic .fill-ink{{fill:#d9e9ee}}
body.dark .graphic .fill-paper{{fill:#0c1a26}}body.dark .graphic .label{{fill:#d9e9ee}}
body.dark .graphic .port{{fill:#0c1a26;stroke:#4fd4eb}}
body.dark .intro,body.dark .foot,body.dark .cardhead small{{color:#afc4d0}}
@media print{{header .toolbar{{display:none}}.card{{break-inside:avoid}}body,body.dark{{background:white;color:black}}}}
</style></head><body>
<header><div class="over">MV-DESIGN PRO / ŹRÓDŁA QElectroTech / ATLAS DO OCENY</div>
<h1>Biblioteka symboli nN — kandydaci źródłowi</h1>
<p class="intro">Oryginalne definicje .elmt przeliczone do prymitywów wektorowych. Oznaczenie portów (niebieski okrąg) służy ocenie geometrii,
nie stanowi przypisania faz i funkcji. Nie odtworzono stanu aparatów OTWARTY/ZAMKNIĘTY — widoczny jest tylko wariant źródłowy.</p>
<div class="toolbar"><input id="filtr" type="search" placeholder="Wyszukaj symbol" aria-label="Wyszukaj symbol">
<button id="motyw">Motyw ciemny / jasny</button><button onclick="window.print()">Drukuj atlas</button></div>
</header><main>
<div class="note"><b>STATUS: DRAFT. WERDYKT WŁAŚCICIELA: 1/10 dla poprzedniej biblioteki; B-02 ODRZUCONE.</b>
Oryginały QElectroTech: CC BY 3.0 · nie są licencjonowanymi symbolami IEC/EPLAN, a zgodności normowej nie stwierdzono.
Importer odmawia geometrii, których nie umie bezstratnie reprezentować.</div>
<div class="grid" id="cards">{cards}</div>
<p class="intro">Źródło: <a href="https://github.com/qelectrotech/qelectrotech-elements">QElectroTech</a> ·
<a href="https://creativecommons.org/licenses/by/3.0/">CC BY 3.0</a>.
Nie scalać z biblioteką produkcyjną bez jawnej akceptacji właściciela.</p></main>
<script>
const input=document.getElementById('filtr');
input.addEventListener('input',()=>{{const q=input.value.trim().toLocaleLowerCase('pl');
document.querySelectorAll('.card').forEach(el=>el.hidden=!el.dataset.search.includes(q));}});
document.getElementById('motyw').addEventListener('click',()=>document.body.classList.toggle('dark'));
</script></body></html>"""


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--input",type=Path,required=True)
    ap.add_argument("--output",type=Path,required=True)
    ap.add_argument("--svg-dir",type=Path)
    args=ap.parse_args()
    data=json.loads(args.input.read_text(encoding="utf-8"))
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(render(data),encoding="utf-8")
    if args.svg_dir is not None:
        args.svg_dir.mkdir(parents=True,exist_ok=True)
        for symbol in data["symbols"]:
            svg=source_svg(symbol)
            style=('<style>svg{stroke:#183748;fill:none;stroke-width:1.25}'
                   '.bounds{stroke:#96b0bc;stroke-width:.25;stroke-dasharray:2 2}'
                   '.port{stroke:#007d9a;fill:#fff;stroke-width:.65}'
                   '.fill-ink{fill:#183748}.fill-paper{fill:#fff}'
                   '.label{stroke:none;fill:#183748}</style>')
            svg=svg.replace('xmlns="http://www.w3.org/2000/svg">',
                            'xmlns="http://www.w3.org/2000/svg">'+style,1)
            (args.svg_dir/(symbol["id"]+".svg")).write_text(svg+"\n",encoding="utf-8")
    print(f"Atlas nN do oceny: {args.output}")


if __name__=="__main__":
    main()
