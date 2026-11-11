#!/usr/bin/env python3
"""Klasy zmian plików generowanych: porównanie JSON przed (HEAD) / po (drzewo robocze)."""
import json, subprocess, sys, collections
ROOT = "/home/user/MV-Design-PRO"
pliki = subprocess.run(["git","-C",ROOT,"diff","--name-only"],capture_output=True,text=True).stdout.split()
KLUCZE_NOSNIKA = ("bays","field_specs","nn_field_specs","switchgear_field_specs","nn_fields_promoted")
def sciezki(a, b, p=""):
    if type(a)!=type(b): yield p, a, b; return
    if isinstance(a, dict):
        for k in sorted(set(a)|set(b)):
            if k not in a or k not in b: yield f"{p}.{k}", a.get(k,"<brak>"), b.get(k,"<brak>")
            else: yield from sciezki(a[k], b[k], f"{p}.{k}")
    elif isinstance(a, list):
        if len(a)!=len(b): yield p+f"[len {len(a)}→{len(b)}]", None, None; 
        for i,(x,y) in enumerate(zip(a,b)): yield from sciezki(x,y,f"{p}[{i}]")
    elif a!=b: yield p, a, b
def klasa(p, a, b):
    if any(k in p for k in KLUCZE_NOSNIKA): return "nosnik_pol"
    if "hash" in p.lower() or "fingerprint" in p.lower() or "odcisk" in p.lower() or "sha" in p.lower(): return "odcisk"
    if p.endswith(".revision") or "revision" in p: return "rewizja"
    if isinstance(a,(int,float)) and isinstance(b,(int,float)) and not isinstance(a,bool): return "LICZBA"
    if isinstance(a,str) and isinstance(b,str) and len(a)==64 and all(c in "0123456789abcdef" for c in a): return "odcisk"
    return "inne"
raport = {}
for f in pliki:
    if not f.endswith(".json"): continue
    try:
        przed = json.loads(subprocess.run(["git","-C",ROOT,"show",f"HEAD:{f}"],capture_output=True,text=True).stdout)
        po = json.load(open(f"{ROOT}/{f}"))
    except Exception as e:
        raport[f] = {"blad": str(e)}; continue
    licz = collections.Counter(); przyklady = collections.defaultdict(list)
    for p,a,b in sciezki(przed, po):
        k = klasa(p,a,b); licz[k]+=1
        if len(przyklady[k])<4: przyklady[k].append(f"{p}: {str(a)[:60]} → {str(b)[:60]}")
    raport[f] = {"klasy": dict(licz), "przyklady": {k:v for k,v in przyklady.items() if k in ("LICZBA","inne")}}
json.dump(raport, open(sys.argv[1],"w"), indent=1, ensure_ascii=False)
for f,r in raport.items():
    print(f.split("/")[-1], r.get("klasy", r))
