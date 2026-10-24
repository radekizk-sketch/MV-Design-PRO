#!/usr/bin/env python3
"""QElectroTech .elmt -> deterministic candidate CAD primitives (NOT production).

Only a strict XML subset is supported. Unknown drawing primitives FAIL CLOSED.
No arbitrary SVG/HTML, no device creation, no connectivity guessed from images.
Source license: QElectroTech elements collection CC BY 3.0 with attribution.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
from pathlib import Path
from xml.etree import ElementTree as ET

MAX_BYTES = 200_000
MAX_PRIMS = 300
MAX_PORTS = 40
MAX_COORD = 100_000
DIRECTIONS = {"n": "N", "s": "S", "e": "E", "w": "W"}
FIGURES = {"line", "polygon", "polyline", "rect", "ellipse", "circle", "arc", "text"}
SAFE_IGNORED = {"dynamic_text", "terminal", "input", "text_field", "elementinformation"}
ORIGIN = "https://github.com/qelectrotech/qelectrotech-elements"
LICENSE = "CC-BY-3.0"
VERSION = 1


class ImportFailure(ValueError):
    """Refuse unverified or unrepresentable QET graphics."""


def number(raw: str | None, attribute: str) -> float:
    if raw is None:
        raise ImportFailure(f"Brak wymaganej współrzędnej: {attribute}")
    try:
        val = float(raw)
    except (TypeError, ValueError) as exc:
        raise ImportFailure(f"Nieprawidłowa liczba {attribute}") from exc
    if not math.isfinite(val) or abs(val) > MAX_COORD:
        raise ImportFailure(f"Poza zakresem {attribute}: {raw}")
    return val


def rd(v: float) -> int | float:
    v = round(v, 5)
    return int(v) if v.is_integer() else v


def text_label(raw: str) -> str:
    raw = raw.strip()
    if len(raw) > 64 or any(ord(c) < 32 for c in raw):
        raise ImportFailure("Niedozwolony tekst statyczny")
    return raw


def primitives_for(el: ET.Element, hx: float, hy: float) -> list[dict]:
    a = el.attrib
    tag = el.tag
    style = dict((p.split(":", 1)[0].strip(), p.split(":", 1)[1].strip())
                 for p in a.get("style", "").split(";") if ":" in p)
    dash = style.get("line-style", "normal")
    if dash not in ("normal", ""):
        raise ImportFailure(f"Nieobsługiwany styl kreski: {dash}")
    fill = style.get("filling", "none")
    if fill not in ("none", "black", "white"):
        raise ImportFailure(f"Nieobsługiwane wypełnienie: {fill}")
    painted = {"none": "none", "black": "ink", "white": "paper"}[fill]
    weight_name = style.get("line-weight", "normal")
    weights = {"normal": 1, "thin": 0.65, "thick": 1.6, "medium": 1}
    if weight_name not in weights:
        raise ImportFailure(f"Nieznana grubość linii: {weight_name}")
    if style.get("color", "black") not in ("black", "#000000"):
        raise ImportFailure("Kolor źródłowy wymaga osobnej oceny")
    weight = weights[weight_name]

    def weighted(p: dict) -> dict:
        return p if weight == 1 else {**p, "w": weight}

    def n(key: str) -> float:
        return number(a.get(key), key)

    def line(x1: float, y1: float, x2: float, y2: float) -> dict:
        return weighted({"k": "line", "x1": rd(x1+hx), "y1": rd(y1+hy),
                "x2": rd(x2+hx), "y2": rd(y2+hy)})

    if tag == "line":
        return [line(n("x1"), n("y1"), n("x2"), n("y2"))]
    if tag in ("polygon", "polyline"):
        # Use explicit x1/y1, x2/y2 sequences: no positional assumptions.
        indices = sorted({int(m.group(1)) for k in a
                          if (m := re.fullmatch(r"x(\d+)", k))})
        if len(indices) < 2 or indices != list(range(1, len(indices)+1)):
            raise ImportFailure("Niekompletna lista punktów polygon/polyline")
        coords = []
        for i in indices:
            coords.append((rd(n(f"x{i}")+hx), rd(n(f"y{i}")+hy)))
        is_closed = tag == "polygon" and a.get("closed", "true") == "true"
        path = "M " + " L ".join(f"{x} {y}" for x,y in coords)
        if is_closed: path += " Z"
        return [weighted({"k":"path","d":path,"fill":painted if is_closed else "none"})]
    if tag == "rect":
        x,y,w,h = n("x")+hx,n("y")+hy,n("width"),n("height")
        if w <= 0 or h <= 0: raise ImportFailure("Pusty prostokąt")
        # Rounded corners deliberately not silently discarded.
        if float(a.get("rx", "0")) or float(a.get("ry", "0")):
            raise ImportFailure("Prostokąt z zaokrągleniem wymaga rozszerzenia renderera")
        return [weighted({"k":"path","d":f"M {rd(x)} {rd(y)} h {rd(w)} v {rd(h)} h {rd(-w)} Z","fill":painted})]
    if tag == "circle":
        cx = n("cx") if "cx" in a else n("x")
        cy = n("cy") if "cy" in a else n("y")
        r = n("r") if "r" in a else n("radius")
        if r <= 0: raise ImportFailure("Promień <= 0")
        return [weighted({"k":"circle","cx":rd(cx+hx),"cy":rd(cy+hy),"r":rd(r),"fill":painted})]
    if tag == "ellipse":
        x,y,w,h = n("x")+hx,n("y")+hy,n("width"),n("height")
        if w <= 0 or h <= 0: raise ImportFailure("Pusta elipsa")
        cx,cy,rx,ry=x+w/2,y+h/2,w/2,h/2
        path=f"M {rd(cx-rx)} {rd(cy)} a {rd(rx)} {rd(ry)} 0 1 0 {rd(2*rx)} 0 a {rd(rx)} {rd(ry)} 0 1 0 {rd(-2*rx)} 0"
        return [weighted({"k":"path","d":path,"fill":painted})]
    if tag == "arc":
        x,y,w,h=n("x")+hx,n("y")+hy,n("width"),n("height")
        start,sweep=n("start"),n("angle")
        if w <= 0 or h <= 0 or not (0 < abs(sweep) < 360):
            raise ImportFailure("Niedozwolony łuk")
        rx,ry=w/2,h/2
        cx,cy=x+rx,y+ry
        rads=math.radians
        x0,y0=cx+rx*math.cos(rads(start)),cy-ry*math.sin(rads(start))
        x1,y1=cx+rx*math.cos(rads(start+sweep)),cy-ry*math.sin(rads(start+sweep))
        d=f"M {rd(x0)} {rd(y0)} A {rd(rx)} {rd(ry)} 0 {int(abs(sweep)>180)} {int(sweep<0)} {rd(x1)} {rd(y1)}"
        return [weighted({"k":"arc","d":d})]
    if tag == "text":
        # Distinguish literal IEC marks from dynamic annotations, which are not imported.
        value=text_label(a.get("text",""))
        if not value: return []
        if a.get("rotation","0") not in ("0", "0.0"):
            raise ImportFailure("Obrócony tekst wymaga osobnej implementacji")
        # No font metrics assumed: this is a DRAFT imported static mark.
        font=a.get("font","")
        font_parts=font.split(",")
        size=float(font_parts[1]) if len(font_parts)>1 and font_parts[1].replace(".","",1).isdigit() else 5.0
        return [{"k":"letter","x":rd(n("x")+hx),"y":rd(n("y")+hy),
                 "t":value,"size":rd(size)}]
    raise ImportFailure(f"Nieobsługiwany prymityw: {tag}")


def convert(xml: bytes, *, source_path: str, symbol_id: str) -> dict:
    if not (0 < len(xml) <= MAX_BYTES): raise ImportFailure("Nieprawidłowy rozmiar pliku")
    if re.search(br"<!DOCTYPE|<!ENTITY|<script|<image\b",xml,re.IGNORECASE):
        raise ImportFailure("Zabronione DTD/ENTITY/skrypt/bitmapa")
    try: root=ET.fromstring(xml)
    except ET.ParseError as exc: raise ImportFailure("Nieprawidłowy XML") from exc
    if root.tag != "definition": raise ImportFailure("Brak definition")
    if not re.fullmatch(r"[a-z0-9][a-z0-9._-]{1,70}",symbol_id):
        raise ImportFailure("Niedozwolony identyfikator")
    width=number(root.get("width"),"width")
    height=number(root.get("height"),"height")
    hx=number(root.get("hotspot_x"),"hotspot_x")
    hy=number(root.get("hotspot_y"),"hotspot_y")
    if width<=0 or height<=0: raise ImportFailure("Nieprawidłowy gabaryt")
    description=root.find("description")
    if description is None: raise ImportFailure("Brak description")
    names=root.find("names")
    polish=next((x.text for x in (names or []) if x.get("lang")=="pl"),None)
    english=next((x.text for x in (names or []) if x.get("lang")=="en"),None)
    ports=[];primitives=[];ignored=[]
    for el in description:
        if el.tag=="terminal":
            if len(ports)>=MAX_PORTS: raise ImportFailure("Zbyt wiele zacisków")
            direction=DIRECTIONS.get(el.get("orientation",""))
            if not direction: raise ImportFailure("Nieznana orientacja zacisku")
            ports.append({"name":f"qet_{len(ports)+1}",
                          "x":rd(number(el.get("x"),"x")+hx),
                          "y":rd(number(el.get("y"),"y")+hy),
                          "dir":direction,
                          "phase":None,"potential":None,"function":None,
                          "reviewRequired":True})
        elif el.tag in FIGURES:
            primitives.extend(primitives_for(el,hx,hy))
        elif el.tag in SAFE_IGNORED:
            ignored.append(el.tag)
        else:
            raise ImportFailure(f"Nieznany element rysunkowy/metadane: {el.tag}")
        if len(primitives)>MAX_PRIMS: raise ImportFailure("Zbyt wiele prymitywów")
    if not ports: raise ImportFailure("Symbol bez portów — wymagana ręczna klasyfikacja")
    if len({(p["x"],p["y"],p["dir"]) for p in ports}) != len(ports):
        raise ImportFailure("Zduplikowane terminale")
    return {
      "id":symbol_id,"namePl":polish or english or symbol_id,
      "source":{"repository":ORIGIN,"path":source_path,
                "sha256":hashlib.sha256(xml).hexdigest(),"license":LICENSE,
                "attribution":"QElectroTech team",
                "licenseUrl":"https://creativecommons.org/licenses/by/3.0/"},
      "geometry":{"width":rd(width),"height":rd(height),
                  "hotspot":{"x":rd(hx),"y":rd(hy)},
                  "primitives":primitives},
      "ports":ports,
      "ignoredMetadata":sorted(set(ignored)),
      "verificationStatus":"DRAFT",
      "modelBinding":None,
      "switchState":"NOT_MODELLED",
      "approval":"OWNER_REQUIRED",
      "contractVersion":VERSION,
    }


def main() -> None:
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--manifest",type=Path,required=True)
    ap.add_argument("--source-root",type=Path,required=True)
    ap.add_argument("--output",type=Path,required=True)
    args=ap.parse_args()
    manifest=json.loads(args.manifest.read_text(encoding="utf-8"))
    if manifest.get("schemaVersion") != 1: raise ImportFailure("Nieznany manifest")
    rows=[]
    for entry in manifest["items"]:
        path=entry["sourcePath"]
        p=Path(path)
        if p.is_absolute() or ".." in p.parts or p.suffix != ".elmt":
            raise ImportFailure(f"Niebezpieczna ścieżka: {path}")
        source=(args.source_root/p).resolve()
        if not source.is_relative_to(args.source_root.resolve()):
            raise ImportFailure("Próba wyjścia poza katalog źródłowy")
        data=source.read_bytes()
        rows.append(convert(data,source_path=path,symbol_id=entry["id"]))
    ids=[s["id"] for s in rows]
    if len(ids)!=len(set(ids)):raise ImportFailure("Zduplikowane ID w manifeście")
    result={"contract":"MvNnQetCandidateV1","production":False,
            "normativeVerified":False,"symbols":sorted(rows,key=lambda s:s["id"])}
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2,sort_keys=True)+"\n",encoding="utf-8")
    print(f"QET: {len(rows)} symboli DRAFT -> {args.output}")


if __name__=="__main__":
    main()
