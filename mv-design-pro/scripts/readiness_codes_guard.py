#!/usr/bin/env python3
"""
Readiness Codes Completeness Guard

Ensures that all required readiness codes are defined and that each code has:
- Polish message (message_pl)
- Valid priority (1-5)
- Valid level (BLOCKER / WARNING / INFO)
- Fix action ID (for BLOCKERs)
- Fix navigation (panel/tab/focus)

Also ensures no duplicate codes and deterministic priority ordering.

JAK OBIETNICE Z NAGLOWKA MAPUJA SIE NA KOD (karta X4, dlug z V12K-318 poz. 7
— do tej karty naglowek obiecywal kontrole, ktorych kod NIE wykonywal; guard
sprawdzal regexem wylacznie obecnosc kluczy i dlugosc message_pl):

* komunikat polski        -> `waliduj_rejestr`: message_pl niepusty, >= 5 znakow,
* priorytet 1-5           -> `waliduj_rejestr`: int w zakresie [1, 5],
* poziom z katalogu       -> `waliduj_rejestr`: instancja ReadinessLevel
                             (dataclass NIE waliduje pol, wiec literal tekstowy
                             przeszedlby bez tej kontroli),
* akcja naprawcza BLOCKER -> `waliduj_rejestr`: kazdy BLOCKER ma SCIEZKE
                             naprawcza: fix_action_id LUB fix_navigation.
                             Metakod (np. analysis.blocked_by_readiness, ktorego
                             naprawa JEST usuniecie blokad zrodlowych) niesie
                             sama nawigacje — to poprawne; BLOCKER bez zadnej
                             sciezki zostawia projektanta z golym kodem,
* nawigacja panel/tab/...  -> `waliduj_rejestr`: fix_navigation, gdy obecna,
                             ma klucz "panel" i wylacznie niepuste wartosci,
* brak duplikatow         -> `duplikaty_kluczy_zrodla` (AST literalu slownika:
                             zduplikowany klucz w zrodle NADPISUJE cicho
                             wczesniejszy wpis, wiec sprawdzenie samych kluczy
                             zaimportowanego slownika NIE moze tego zlapac),
* deterministyczny porzadek priorytetow -> wynika z powyzszych: klucze unikalne
                             + priorytety calkowite czynia sortowanie po
                             (priority, code) porzadkiem zupelnym; osobna
                             kontrola bylaby bezprzedmiotowa,
* klucz slownika == spec.code -> `waliduj_rejestr` (rozjazd = kod widoczny pod
                             inna nazwa niz deklaruje).

Walidacja idzie po ZAIMPORTOWANYM rejestrze (zywe obiekty), nie po regexach —
jedno zrodlo prawdy, to samo, ktore czyta produkcja.

SCAN FILES:
  backend/src/domain/canonical_operations.py  (READINESS_CODES dict)

REQUIRED CODES (minimum 24):
  source.voltage_invalid, source.sk3_invalid,
  trunk.terminal_missing, trunk.segment_missing,
  trunk.segment_length_missing, trunk.segment_length_invalid,
  trunk.catalog_missing,
  station.type_invalid, station.voltage_missing,
  station.nn_outgoing_min_1, station.required_field_missing,
  transformer.catalog_missing, transformer.connection_missing,
  nn.bus_missing, nn.main_breaker_missing,
  oze.transformer_required, oze.nn_bus_required,
  ring.endpoints_missing, ring.nop_required,
  protection.ct_required, protection.vt_required,
  protection.settings_incomplete,
  study_case.missing_base_snapshot,
  analysis.blocked_by_readiness

EXIT CODES:
  0 = clean
  1 = violations
"""

from __future__ import annotations

import ast
import importlib.util
import sys
from pathlib import Path
from types import ModuleType

REPO_ROOT = Path(__file__).resolve().parents[1]
REGISTRY_FILE = REPO_ROOT / "backend" / "src" / "domain" / "canonical_operations.py"

REQUIRED_CODES = {
    "source.voltage_invalid",
    "source.sk3_invalid",
    "trunk.terminal_missing",
    "trunk.segment_missing",
    "trunk.segment_length_missing",
    "trunk.segment_length_invalid",
    "trunk.catalog_missing",
    "station.type_invalid",
    "station.voltage_missing",
    "station.nn_outgoing_min_1",
    "station.required_field_missing",
    "transformer.catalog_missing",
    "transformer.connection_missing",
    "nn.bus_missing",
    "nn.main_breaker_missing",
    "oze.transformer_required",
    "oze.nn_bus_required",
    "ring.endpoints_missing",
    "ring.nop_required",
    "protection.ct_required",
    "protection.vt_required",
    "protection.settings_incomplete",
    "study_case.missing_base_snapshot",
    "analysis.blocked_by_readiness",
}

MIN_CODES = 24
MIN_MESSAGE_LEN = 5


def modul_rejestru() -> ModuleType:
    """Modul rejestru bez wykonywania `__init__` pakietu `domain`.

    CI wola ten straznik golym pythonem (bez zaleznosci backendu), a
    `import domain.canonical_operations` odpala `domain/__init__.py`, ktory
    ciagnie pydantic — sam rejestr potrzebuje wylacznie stdlib. Gdy pakiet JEST
    juz zaimportowany (pytest pod poetry), zwracamy DOKLADNIE ten sam modul,
    zeby `isinstance` widzial te same klasy enum co testy.
    """
    # Kolejnosc: pakiet (pytest pod poetry), potem WLASNY wpis z poprzedniego
    # ladowania plikowego — bez niego kazde wywolanie tworzyloby NOWY modul
    # z NOWYMI klasami enum i `isinstance` mowilby falszywe "nie".
    juz = sys.modules.get("domain.canonical_operations") or sys.modules.get("_rejestr_kanoniczny")
    if juz is not None:
        return juz
    try:
        import domain.canonical_operations as pakietowy  # noqa: PLC0415

        return pakietowy
    except ModuleNotFoundError:
        spec = importlib.util.spec_from_file_location("_rejestr_kanoniczny", REGISTRY_FILE)
        assert spec and spec.loader
        m = importlib.util.module_from_spec(spec)
        # Rejestracja PRZED exec: mechanika dataclasses szuka modulu klasy w
        # sys.modules przy przetwarzaniu adnotacji (KW_ONLY) i bez wpisu pada.
        sys.modules[spec.name] = m
        spec.loader.exec_module(m)
        return m


def duplikaty_kluczy_zrodla(zrodlo: str, nazwa_slownika: str = "READINESS_CODES") -> list[str]:
    """Zduplikowane klucze LITERALU slownika — niewykrywalne po imporcie.

    Python nadpisuje wczesniejszy wpis bez ostrzezenia, wiec duplikat w zrodle
    oznacza cicho ZGUBIONA specyfikacje. Szukamy przypisania `NAZWA: ... = {...}`
    i liczymy stale tekstowe wsrod kluczy.
    """
    drzewo = ast.parse(zrodlo)
    naruszenia: list[str] = []
    for wezel in ast.walk(drzewo):
        if not isinstance(wezel, ast.AnnAssign | ast.Assign):
            continue
        cele = [wezel.target] if isinstance(wezel, ast.AnnAssign) else wezel.targets
        if not any(isinstance(c, ast.Name) and c.id == nazwa_slownika for c in cele):
            continue
        if not isinstance(wezel.value, ast.Dict):
            continue
        widziane: set[str] = set()
        for klucz in wezel.value.keys:
            if isinstance(klucz, ast.Constant) and isinstance(klucz.value, str):
                if klucz.value in widziane:
                    naruszenia.append(f"Duplicate key in {nazwa_slownika} literal: '{klucz.value}'")
                widziane.add(klucz.value)
    return naruszenia


def waliduj_rejestr(codes: dict[str, object]) -> list[str]:
    """Kontrole per wpis na ZYWYCH obiektach rejestru (naglowek modulu: mapa)."""
    ReadinessLevel = modul_rejestru().ReadinessLevel  # noqa: N806

    naruszenia: list[str] = []
    for klucz, spec in codes.items():
        kod = getattr(spec, "code", None)
        if kod != klucz:
            naruszenia.append(f"Key/code mismatch: key '{klucz}' vs spec.code '{kod}'")

        message = getattr(spec, "message_pl", None)
        if not isinstance(message, str) or len(message.strip()) < MIN_MESSAGE_LEN:
            naruszenia.append(f"'{klucz}': empty or too short message_pl: {message!r}")

        priorytet = getattr(spec, "priority", None)
        if not isinstance(priorytet, int) or isinstance(priorytet, bool) or not 1 <= priorytet <= 5:
            naruszenia.append(f"'{klucz}': priority out of range 1-5: {priorytet!r}")

        poziom = getattr(spec, "level", None)
        if not isinstance(poziom, ReadinessLevel):
            naruszenia.append(f"'{klucz}': level is not a ReadinessLevel: {poziom!r}")

        nawigacja = getattr(spec, "fix_navigation", None)
        if nawigacja is not None:
            if not isinstance(nawigacja, dict) or not nawigacja:
                naruszenia.append(f"'{klucz}': fix_navigation must be a non-empty dict")
            elif "panel" not in nawigacja:
                naruszenia.append(f"'{klucz}': fix_navigation lacks the 'panel' key")
            elif any(not isinstance(w, str) or not w.strip() for w in nawigacja.values()):
                naruszenia.append(f"'{klucz}': fix_navigation carries an empty value")

        if isinstance(poziom, ReadinessLevel) and poziom is ReadinessLevel.BLOCKER:
            akcja = getattr(spec, "fix_action_id", None)
            if not akcja and nawigacja is None:
                naruszenia.append(
                    f"'{klucz}': BLOCKER without any remediation path "
                    "(neither fix_action_id nor fix_navigation)"
                )
    return naruszenia


def main() -> int:
    violations: list[str] = []

    if not REGISTRY_FILE.exists():
        print(f"VIOLATION: registry file missing: {REGISTRY_FILE}")
        return 1

    sys.path.insert(0, str(REPO_ROOT / "backend" / "src"))
    READINESS_CODES = modul_rejestru().READINESS_CODES  # noqa: N806

    codes = set(READINESS_CODES)
    if len(codes) < MIN_CODES:
        violations.append(f"Only {len(codes)} readiness codes found (minimum {MIN_CODES} required)")

    for required_code in sorted(REQUIRED_CODES):
        if required_code not in codes:
            violations.append(f"Missing required readiness code: '{required_code}'")

    violations.extend(duplikaty_kluczy_zrodla(REGISTRY_FILE.read_text(encoding="utf-8")))
    violations.extend(waliduj_rejestr(READINESS_CODES))

    if violations:
        print(f"\n{'=' * 60}")
        print(f"READINESS CODES GUARD: {len(violations)} violation(s)")
        print(f"{'=' * 60}\n")
        for v in violations:
            print(f"  VIOLATION: {v}")
        print()
        return 1

    print(
        f"Readiness Codes Guard: OK ({len(codes)} codes, "
        f"{len(REQUIRED_CODES)} required codes present)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
