"""Deterministyczny dobór kompetencji Rady Technicznej MV-DESIGN PRO.

Nie zastępuje oceny inżynierskiej; kwalifikuje zadanie do ekspertów.
Python stdlib, bez zależności od API modelu i bez modyfikacji ENM.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path

REGISTRY = Path(__file__).resolve().parent.parent / "docs" / "eksperci" / "rejestr_240.json"

# Profile opisują *obszary odpowiedzialności*, nie udają 240 autonomicznych osób.
# Kolejność ma znaczenie wyłącznie w przypadku remisu wyniku kwalifikacji.
PROFILES = (
    {
        "id": "NC_RFG_WOS",
        "signals": ("nc rfg", "ncrfg", "wos", "lfsm", "fsm", "ptpiree", "certyfikat",
                    "zgodnosc modulu", "typ b", "frt", "hvrt"),
        "lead": "E121", "team": ("E122", "E127", "E125", "E097", "E128"),
        "reviewer": "E238",
    },
    {
        "id": "JAKOSC_ENERGII",
        "signals": ("jakosc energii", "harmoniczn", "thd", "flicker", "migotan",
                    "asymetri", "zapad", "interharmoniczn", "pn en 50160"),
        "lead": "E105", "team": ("E106", "E108", "E109", "E120", "E161"),
        "reviewer": "E238",
    },
    {
        "id": "EAZ",
        "signals": ("eaz", "zabezpieczen", "zabezpiecz", "nastaw", "selektywn",
                    "ziemnozwarciow", "admitancyjn", "51n", "67n", "spz", "szr"),
        "lead": "E073", "team": ("E075", "E079", "E083", "E092", "E168"),
        "reviewer": "E238",
    },
    {
        "id": "KABLE_SN_NN",
        "signals": ("kabel", "kabla", "kablow", "xnru", "zyla powrotna", "przekroj",
                    "obciazaln", "trasa kablow", "izolacja xlpe"),
        "lead": "E057", "team": ("E059", "E060", "E061", "E091", "E153"),
        "reviewer": "E238",
    },
    {
        "id": "STACJA_SN_NN",
        "signals": ("stacja", "stacji", "rozdzielnic", "pola sn", "pole sn", "szyn",
                    "sprzegl", "konfiguracja pola", "rotoblok"),
        "lead": "E025", "team": ("E026", "E029", "E045", "E049", "E073"),
        "reviewer": "E238",
    },
    {
        "id": "APARATURA",
        "signals": ("aparat", "wylacznik", "rozlacznik", "bezpiecznik", "dobor ur",
                    "zdolnosc zwarciowa", "katalog producenta"),
        "lead": "E045", "team": ("E041", "E043", "E044", "E047", "E025"),
        "reviewer": "E238",
    },
    {
        "id": "ZWA_RCIA",
        "signals": ("zwarci", "iec 60909", "ik", "ip", "ith", "skladowa zerowa",
                    "z0", "z1", "z2", "thevenin"),
        "lead": "E092", "team": ("E093", "E094", "E095", "E073", "E091"),
        "reviewer": "E238",
    },
    {
        "id": "ROZPLYWY",
        "signals": ("rozplyw", "newton raphson", "bfs", "profil napieciowy",
                    "spadek napiecia", "bilans mocy"),
        "lead": "E089", "team": ("E090", "E091", "E024", "E116"),
        "reviewer": "E238",
    },
    {
        "id": "DYNAMIKA",
        "signals": ("dynamik", "symulacj", "rms", "emt", "lvrt", "hvrt",
                    "stabilnos", "regulator", "przebieg czasow"),
        "lead": "E097", "team": ("E098", "E100", "E102", "E103", "E126"),
        "reviewer": "E238",
    },
    {
        "id": "BESS",
        "signals": ("bess", "magazyn energii", "gfl", "gfm", "grid forming",
                    "grid following", "bms", "wyspow"),
        "lead": "E129", "team": ("E130", "E132", "E133", "E135", "E120"),
        "reviewer": "E238",
    },
    {
        "id": "OZE",
        "signals": ("oze", "fotowoltaic", "pv", "wiatr", "pmsg", "dfig",
                    "farma", "pcc", "generator synchroniczn"),
        "lead": "E113", "team": ("E114", "E115", "E116", "E120", "E124"),
        "reviewer": "E238",
    },
    {
        "id": "TRANSFORMATOR",
        "signals": ("transformator", "630 kva", "uk%", "przekladnia", "zaczep",
                    "prad zalaczeniow", "inrush"),
        "lead": "E049", "team": ("E051", "E052", "E054", "E055", "E073"),
        "reviewer": "E238",
    },
    {
        "id": "LINIE_NAPOWIETRZNE",
        "signals": ("napowietrz", "zwis", "slup", "przeslo", "naciag",
                    "fundament slupa"),
        "lead": "E067", "team": ("E065", "E068", "E069", "E070", "E229"),
        "reviewer": "E238",
    },
    {
        "id": "INTERFEJS_INZYNIERSKI",
        "signals": ("interfejs", "ekran", "sld", "kreator", "ergonomi",
                    "wyswietlan", "ux", "ui", "inspektor"),
        "lead": "E240", "team": ("E239", "E025", "E029", "E089", "E073"),
        "reviewer": "E007",
    },
)

NONTECHNICAL = ("kolor przycisku", "czcionke", "czcionka", "odstep css",
                "literowke", "przecinek w komunikacie", "formatowanie przycisku")
TECHNICAL = ("sn", "nn", "stacj", "pol sn", "aparat", "zabezpiec", "kabel",
             "rozplyw", "zwarci", "transformator", "ncrfg", "wos", "oze", "sld")


def normalize(value: str) -> str:
    """Polskie znaki i separatory nie zmieniają decyzji klasyfikatora."""
    table = str.maketrans("ąćęłńóśźż", "acelnoszz")
    value = unicodedata.normalize("NFKC", value).casefold().translate(table)
    return re.sub(r"\s+", " ", re.sub(r"[^\w]+", " ", value)).strip()


def load_registry(path: Path = REGISTRY) -> dict:
    with path.open(encoding="utf-8") as stream:
        return json.load(stream)


def validate_registry(data: dict) -> list[str]:
    errors: list[str] = []
    groups = data.get("groups", [])
    experts = data.get("experts", [])
    if len(groups) != 30:
        errors.append(f"Liczba zespołów: {len(groups)}, oczekiwano 30")
    if len(experts) != 240:
        errors.append(f"Liczba specjalizacji: {len(experts)}, oczekiwano 240")
    group_ids = [item.get("id") for item in groups]
    if len(set(group_ids)) != len(group_ids):
        errors.append("Powtórzony identyfikator zespołu")
    if group_ids != [f"G{i:02d}" for i in range(1, 31)]:
        errors.append("Nieciągła numeracja zespołów")
    expert_ids = [item.get("id") for item in experts]
    if expert_ids != [f"E{i:03d}" for i in range(1, 241)]:
        errors.append("Nieciągła lub powtórzona numeracja ekspertów")
    for group in groups:
        for attr in ("name", "triggers", "checks", "evidence"):
            if not group.get(attr):
                errors.append(f"{group.get('id')}: brak {attr}")
    counts = {identifier: 0 for identifier in group_ids}
    for item in experts:
        group_id = item.get("group_id")
        if group_id not in counts:
            errors.append(f"{item.get('id')}: nieznany zespół {group_id}")
        else:
            counts[group_id] += 1
        for attr in ("name", "responsibility", "activation_terms", "checks",
                     "evidence", "sources"):
            if not item.get(attr):
                errors.append(f"{item.get('id')}: brak {attr}")
        for related in item.get("related_groups", []):
            if related not in counts:
                errors.append(f"{item.get('id')}: nieznane powiązanie {related}")
    for identifier, count in counts.items():
        if count != 8:
            errors.append(f"{identifier}: {count} kompetencji zamiast 8")
    lookup = set(expert_ids)
    for profile in PROFILES:
        for identifier in (profile["lead"], *profile["team"], profile["reviewer"]):
            if identifier not in lookup:
                errors.append(f"{profile['id']}: nieznany ekspert {identifier}")
        if profile["reviewer"] in (profile["lead"], *profile["team"]):
            errors.append(f"{profile['id']}: recenzent nie jest niezależny")
    return errors


def signal_matches(haystack: str, signal: str) -> bool:
    needle = normalize(signal)
    if len(needle) <= 2:
        return bool(re.search(rf"(?<!\w){re.escape(needle)}(?!\w)", haystack))
    return needle in haystack


def route_task(description: str, data: dict, *, max_experts: int = 7) -> dict:
    if not 2 <= max_experts <= 15:
        raise ValueError("max_experts musi zawierać się w przedziale 2–15")
    if not description.strip():
        raise ValueError("Opis zadania nie może być pusty")
    task = normalize(description)
    if any(signal_matches(task, x) for x in NONTECHNICAL) and not any(
        signal_matches(task, x) for x in TECHNICAL
    ):
        return {
            "task": description, "engineering_review_required": False,
            "profile": None, "lead": None, "team": [], "reviewer": None,
            "reason": "Zmiana wyłącznie typograficzna, bez implikacji elektrycznych.",
        }
    ranked = []
    for profile in PROFILES:
        matched = [s for s in profile["signals"] if signal_matches(task, s)]
        if matched:
            score = sum(2 if " " in s else 1 for s in matched)
            ranked.append((score, profile, matched))
    ranked.sort(key=lambda x: -x[0])
    if not ranked:
        # Brak dopasowania ≠ brak ryzyka technicznego. Wymagana ręczna kwalifikacja.
        return {
            "task": description, "engineering_review_required": True,
            "profile": "WYMAGA_KWALIFIKACJI", "lead": None, "team": [],
            "reviewer": None, "reason": "Brak jednoznacznego profilu; nie zgaduj.",
        }
    _, best, signals = ranked[0]
    lookup = {item["id"]: item for item in data["experts"]}
    # Łączymy dziedziny przy porównywalnym dopasowaniu. Nie ma 240 agentów.
    chosen = [best["lead"], *best["team"]]
    if len(ranked) > 1 and ranked[1][0] >= ranked[0][0] * 0.7:
        chosen.extend([ranked[1][1]["lead"]])
    chosen = list(dict.fromkeys(chosen))[:max_experts]
    reviewer = best["reviewer"]
    if reviewer in chosen:
        raise RuntimeError("Naruszenie niezależności recenzenta")
    return {
        "task": description, "engineering_review_required": True,
        "profile": best["id"], "matched_signals": signals,
        "lead": lookup[chosen[0]],
        "team": [lookup[x] for x in chosen[1:]],
        "reviewer": lookup[reviewer],
        "reason": "Dobór na podstawie sygnałów dziedzinowych; recenzent odrębny od zespołu.",
        "warning": "Kwalifikacja nie stanowi oceny normowej ani wykonanej ekspertyzy.",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("task", nargs="*", help="Zadanie do kwalifikacji")
    parser.add_argument("--check", action="store_true", help="Walidacja rejestru")
    parser.add_argument("--max-experts", type=int, default=7)
    parser.add_argument("--registry", type=Path, default=REGISTRY)
    options = parser.parse_args()
    try:
        data = load_registry(options.registry)
        errors = validate_registry(data)
        if errors:
            print(json.dumps({"status": "BŁĄD", "errors": errors}, ensure_ascii=False, indent=2))
            return 2
        if options.check:
            print("OK: 30 zespołów, 240 specjalizacji, prawidłowe identyfikatory i profile.")
            return 0
        if not options.task:
            parser.error("Podaj opis zadania lub --check")
        result = route_task(" ".join(options.task), data, max_experts=options.max_experts)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"BŁĄD: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
