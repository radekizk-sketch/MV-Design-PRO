#!/usr/bin/env python3
"""Referencyjne, lokalne wyszukiwanie z odsyłaczami; bez kopiowania normy i bez modyfikacji solvera."""
import argparse
import json
import pathlib
import re
import sqlite3
import sys
import unicodedata

ROOT = pathlib.Path(__file__).resolve().parent
DB = ROOT / "mv_kb.sqlite3"

def normalize(text):
    s = unicodedata.normalize("NFKD", str(text)).lower()
    return "".join(c for c in s if not unicodedata.combining(c)).replace("ł", "l")

EXTENSION_FILES = ("extensions_2026_11.json", "extensions_62271_2018.json")

def load(name):
    base = json.loads((ROOT / name).read_text(encoding="utf-8"))
    extension_keys = {
        "knowledge.json": "records",
        "sources.json": "sources",
        "rules.json": "rules",
    }
    if name in extension_keys:
        for fname in EXTENSION_FILES:
            addon = json.loads((ROOT / fname).read_text(encoding="utf-8"))
            base.extend(addon[extension_keys[name]])
    return base

def check():
    facts, sources, rules = load("knowledge.json"), load("sources.json"), load("rules.json")
    ids = [f["id"] for f in facts]
    src = {s["id"] for s in sources}
    errors = []
    if len(src) != len(sources):
        errors.append("duplicate source id")
    if len({r["id"] for r in rules}) != len(rules):
        errors.append("duplicate rule id")
    if len(set(ids)) != len(ids):
        errors.append("duplicate fact id")
    for f in facts:
        if f["source_id"] not in src:
            errors.append("unknown source: " + f["id"])
        if not f["title"] or not f["content"]:
            errors.append("empty text: " + f["id"])
        if f["source_id"] == "IEC60909_2016":
            loc = f["source"]
            if loc.get("pdf_page", -1) - 8 != loc.get("printed_page"):
                errors.append("bad physical page: " + f["id"])
        elif f["source_id"] == "IEC60909_3_2010":
            loc = f["source"]
            if not 15 <= loc.get("pdf_page", 0) <= 66 or loc.get("pdf_page") - 8 != loc.get("printed_page"):
                errors.append("bad IEC 60909-3 page: " + f["id"])
        elif f["source_id"] == "EN50160_A1_2025":
            loc = f["source"]
            if not 5 <= loc.get("pdf_page", 0) <= 9 or loc.get("pdf_page") - 2 != loc.get("printed_page"):
                errors.append("bad EN 50160 A1 page: " + f["id"])
        elif f["source_id"] == "IEC62271_1_2018":
            loc = f["source"]
            if not 24 <= loc.get("pdf_page", 0) <= 136 or loc.get("pdf_page") - 12 != loc.get("printed_page"):
                errors.append("bad IEC 62271-1 page: " + f["id"])
    for rule in rules:
        if set(rule["source_ids"]) - set(ids):
            errors.append("unknown rule reference: " + rule["id"])
    return {"ok": not errors, "records": len(facts),
            "sources": len(sources), "rules": len(rules), "errors": errors}

def build():
    info = check()
    if not info["ok"]:
        raise RuntimeError(info["errors"])
    if DB.exists():
        DB.unlink()
    with sqlite3.connect(DB) as db:
        db.executescript("""
            CREATE TABLE records(id TEXT PRIMARY KEY, source_id TEXT, payload TEXT);
            CREATE VIRTUAL TABLE idx USING fts5(id UNINDEXED, searchable,
                                                 tokenize='unicode61 remove_diacritics 2');
        """)
        for record in load("knowledge.json"):
            terms = record.get("search_terms", [])
            searchable = normalize(" ".join(
                [record["id"], record["title"], record["content"],
                 record["topic"], " ".join(terms)]))
            db.execute("INSERT INTO records VALUES(?,?,?)",
                       (record["id"], record["source_id"],
                        json.dumps(record, ensure_ascii=False)))
            db.execute("INSERT INTO idx VALUES(?,?)",
                       (record["id"], searchable))
    return info

def citation(record):
    loc = record["source"]
    if record["source_id"] == "IEC60909_2016":
        s = (f"PN-EN 60909-0:2016, {loc['clause']}, str. IEC "
             f"{loc['printed_page']} (PDF {loc['pdf_page']})")
    elif record["source_id"] == "IEC60909_3_2010":
        s = (f"PN-EN 60909-3:2010, {loc['clause']}, "
             f"str. IEC {loc['printed_page']} (PDF {loc['pdf_page']})")
    elif record["source_id"] == "EN50160_A1_2025":
        s = (f"PN-EN 50160:2023-10/A1:2025-04, {loc['clause']}, "
             f"str. EN {loc['printed_page']} (PDF {loc['pdf_page']}); zmiana A1, nie pełna norma")
    elif record["source_id"] == "IEC62271_1_2018":
        s = (f"PN-EN 62271-1:2018-02, {loc['clause']}, "
             f"str. IEC {loc['printed_page']} (PDF {loc['pdf_page']}); "
             "bez zmiany A1:2022-06")
    else:
        s = (f"{record['source_id']}, {loc['clause']}, "
             f"s. {loc['printed_page']}")
    return s + (", wzór " + loc["equation"] if loc.get("equation") else "")

def search(question, source=None, limit=5):
    inputs = [ROOT / n for n in ("knowledge.json", "sources.json", "rules.json", *EXTENSION_FILES)]
    if not DB.exists() or any(p.stat().st_mtime_ns > DB.stat().st_mtime_ns for p in inputs):
        build()
    words = [w for w in re.findall(r"\w+", normalize(question))
             if len(w) > 1]
    if not words:
        return []
    match = " OR ".join('"' + w + '"' for w in words)
    with sqlite3.connect(DB) as db:
        sql = ("""SELECT records.payload FROM idx JOIN records ON records.id=idx.id
                   WHERE idx MATCH ?""")
        args = [match]
        if source:
            sql += " AND records.source_id=?"
            args.append(source)
        sql += " ORDER BY bm25(idx) LIMIT ?"
        args.append(max(1, min(limit, 30)))
        result = []
        for (payload,) in db.execute(sql, args):
            fact = json.loads(payload)
            fact["citation"] = citation(fact)
            result.append(fact)
        return result

def validate_case(case):
    """Wstępna kontrola danych; NIE jest walidacją solvera."""
    problems = []
    u, mode, c = case.get("un_kv"), case.get("scenario"), case.get("c_factor")
    if isinstance(u, (int, float)) and 1 < u <= 230 and mode in ("MAX", "MIN") and c is not None:
        expected = 1.10 if mode == "MAX" else 1.00
        if abs(float(c) - expected) > 1e-9:
            problems.append({"rule_id": "KB-R-002",
                             "detail": f"IEC 60909-0:2016 tablica 1: c={expected:.2f} dla {u} kV / {mode}"})
    if case.get("fault") == "1F_Z" and case.get("neutral") in ("IZOLOWANY", "KOMPENSOWANY"):
        problems.append({"rule_id": "KB-R-001",
                         "detail": "§1 normy: przypadek izolowany/kompensowany poza zakresem tej części"})
    if case.get("fault") == "2x1F_Z" and (
        not case.get("fault_location_a") or not case.get("fault_location_b")
        or case.get("fault_location_a") == case.get("fault_location_b")
    ):
        problems.append({"rule_id": "KB-R2-002",
                         "detail": "Podwójne doziemienie wymaga dwóch różnych miejsc zwarcia A/B."})
    if case.get("quality_standard") == "EN50160_A1_2025" and case.get("full_compliance", False):
        problems.append({"rule_id": "KB-R2-008",
                         "detail": "Sama zmiana A1 nie dostarcza całych tabel wydania bazowego EN 50160."})
    if case.get("network_voltage_level") == "SN" and case.get("voltage_limit_clause") == "4.2.2.2":
        problems.append({"rule_id": "KB-R2-009",
                         "detail": "Punkt 4.2.2.2 dotyczy nN; dla SN potrzebny §5.2.2.2 wydania bazowego."})
    switchgear = case.get("switchgear")
    if isinstance(switchgear, dict):
        rated_ur = switchgear.get("rated_ur_kv")
        if (isinstance(u, (int, float)) and isinstance(rated_ur, (int, float))
                and rated_ur < u):
            problems.append({"rule_id": "KB-R3-003",
                             "detail": "Ur urządzenia nie może być niższe niż napięcie znamionowe sieci; sprawdź także najwyższe napięcie pracy."})
        ip_calc, ip_rated = switchgear.get("calculated_ip_ka"), switchgear.get("rated_ip_ka")
        if (isinstance(ip_calc, (int, float)) and isinstance(ip_rated, (int, float))
                and ip_calc > ip_rated):
            problems.append({"rule_id": "KB-R3-007",
                             "detail": "Obliczony prąd udarowy ip jest większy niż znamionowa wytrzymałość Ip."})
        if switchgear.get("short_circuit_breaking_capacity_derived_from") == "Ik":
            problems.append({"rule_id": "KB-R3-006",
                             "detail": "Ik oznacza wytrzymałość przy zamkniętych stykach, a nie zdolność wyłączeniową."})
    if case.get("full_62271_1_compliance") and not case.get("has_62271_1_A1_2022"):
        problems.append({"rule_id": "KB-R3-002",
                         "detail": "Brak tekstu zmiany A1:2022-06 do PN-EN 62271-1, w tym zmiany §6.4.1."})
    return {"status": "WYMAGA_KOREKTY" if problems else "BRAK_WYKRYTEJ_SPRZECZNOSCI",
            "problems": problems, "disclaimer": "Nie jest werdyktem zgodności urządzenia ani wynikiem solvera."}

def main():
    p = argparse.ArgumentParser(description="MV-DESIGN-PRO, indeks IEC 60909, IEC 62271-1 i EN 50160 A1")
    s = p.add_subparsers(dest="cmd", required=True)
    s.add_parser("check")
    s.add_parser("build")
    q = s.add_parser("ask")
    q.add_argument("question")
    q.add_argument("--source")
    q.add_argument("--limit", type=int, default=5)
    v = s.add_parser("validate")
    v.add_argument("json_file")
    a = p.parse_args()
    if a.cmd == "check":
        out = check()
    elif a.cmd == "build":
        out = build()
    elif a.cmd == "validate":
        out = validate_case(json.loads(pathlib.Path(a.json_file).read_text(encoding="utf-8")))
    else:
        found = search(a.question, a.source, a.limit)
        if not found:
            print("BRAK_PODSTAWY: brak karty dla zapytania; nie wolno wymyślać podstawy.")
            return
        for item in found:
            print(f"{item['id']}: {item['title']}\n{item['content']}\nŹródło: {item['citation']}\n")
        return
    print(json.dumps(out, ensure_ascii=False, indent=2))
    if a.cmd == "check" and not out["ok"]:
        sys.exit(1)

if __name__ == "__main__":
    main()
