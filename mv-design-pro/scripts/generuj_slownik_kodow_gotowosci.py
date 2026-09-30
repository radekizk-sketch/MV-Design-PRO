#!/usr/bin/env python3
"""Generuje sekcję "Kompletny słownik kodów gotowości" z rejestru `READINESS_CODES`.

PO CO (karta READINESS-DOC, 2026-09-09). `docs/domain/READINESS_FIXACTIONS_CANONICAL_PL.md`
(dokument WIĄŻĄCY, priorytet 3 hierarchii dokumentów) był pisany ręcznie i dryfował od
rejestru `backend/src/domain/canonical_operations.py::READINESS_CODES` od lutego 2026 —
dokument opisywał 37 kodów, rejestr miał w chwili tej karty 114. Naprawa INSTANCJI
(dopisanie brakujących wierszy) wróciłaby do dryfu przy następnym kodzie. Ten skrypt
naprawia KLASĘ: sekcja słownika jest GENEROWANA z rejestru (jedno źródło prawdy), a
`readiness_dictionary_guard.py` pilnuje, żeby dokument nie odjechał od wygenerowanej
treści.

Wzorzec przejęty z `backend/scripts/generuj_rejestr_sieci.py` (rejestr sieci wzorcowych →
`docs/reference-networks/REGISTRY_TABLE.md`) — tam generator NADPISUJE cały plik, bo
dokument jest w całości generowany. Tu dokument ma też sekcje RĘCZNE (Cel dokumentu,
Poziomy walidacji, Obszary, Zasady stosowania, Historia zmian), więc generowana treść
jest WSTAWIANA między jawne znaczniki (`ZNACZNIK_POCZATEK`/`ZNACZNIK_KONIEC`) zamiast
nadpisywać cały plik.

Import rejestru: jak `readiness_codes_guard.py` — przez lokalizację pliku (`__file__`),
bez wykonania `backend/src/domain/__init__.py` (ciągnie pydantic; sam rejestr Readiness
potrzebuje wyłącznie stdlib), żeby ten skrypt dało się uruchomić GOLĄM systemowym
Pythonem, tak jak `readiness_codes_guard.py` w CI (`python scripts/<nazwa>.py`, bez
`poetry run`).

Użycie (z katalogu `mv-design-pro`):
    python scripts/generuj_slownik_kodow_gotowosci.py            # zapisuje dokument
    python scripts/generuj_slownik_kodow_gotowosci.py --check    # RC=1, gdy dokument
                                                                   # różni się od generatora

Kody wyjścia (`--check`, i pośrednio `readiness_dictionary_guard.py`):
  0 = dokument aktualny (albo zapisano nowy)
  1 = dokument różni się od wygenerowanej treści / brak znaczników / brak rejestru
"""

from __future__ import annotations

import argparse
import importlib.util
import sys
from pathlib import Path
from types import ModuleType

REPO_ROOT = Path(__file__).resolve().parents[1]
REGISTRY_FILE = REPO_ROOT / "backend" / "src" / "domain" / "canonical_operations.py"
DOKUMENT = REPO_ROOT / "docs" / "domain" / "READINESS_FIXACTIONS_CANONICAL_PL.md"

ZNACZNIK_POCZATEK = "<!-- GENEROWANE: slownik kodow gotowosci — poczatek -->"
ZNACZNIK_KONIEC = "<!-- GENEROWANE: slownik kodow gotowosci — koniec -->"

#: Kolejność kolumn nawigacji naprawczej w renderowanej komórce — STAŁA niezależnie od
#: kolejności kluczy w słowniku Pythona (determinizm wyjścia; `dict` w Pythonie zachowuje
#: kolejność wstawiania, która w źródle bywa `panel, tab, focus` albo `panel, modal, tab`).
KOLEJNOSC_NAWIGACJI: tuple[str, ...] = ("panel", "tab", "modal", "focus")


def modul_rejestru() -> ModuleType:
    """Moduł rejestru bez wykonywania `__init__` pakietu `domain` (patrz naglówek).

    Ten sam wzorzec co `readiness_codes_guard.py::modul_rejestru` — jeśli pakiet jest już
    zaimportowany (pytest pod poetry, `tests/domain/**` importuje `domain.canonical_operations`
    normalnie), użyj DOKŁADNIE tego modułu, żeby `isinstance`/porównania enumów widziały te
    same klasy; w przeciwnym razie (goły `python3` w CI) załaduj plik bezpośrednio.
    """
    juz = sys.modules.get("domain.canonical_operations") or sys.modules.get(
        "_rejestr_slownik_gotowosci"
    )
    if juz is not None:
        return juz
    try:
        import domain.canonical_operations as pakietowy  # noqa: PLC0415

        return pakietowy
    except ModuleNotFoundError:
        spec = importlib.util.spec_from_file_location("_rejestr_slownik_gotowosci", REGISTRY_FILE)
        assert spec and spec.loader
        m = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = m
        spec.loader.exec_module(m)
        return m


def _escape_md(tekst: str) -> str:
    """Ucieczka znaków łamiących komórkę tabeli Markdown (`|`, nowe linie).

    Defensywne — na dzień tej karty żaden `message_pl`/`fix_navigation` ich nie niesie
    (sprawdzone grepem po całym rejestrze), ale generator, który po cichu psuje tabelę
    przy pierwszym takim wpisie, jest gorszy niż brak generatora.
    """
    return tekst.replace("|", "\\|").replace("\n", " ").strip()


def _renderuj_nawigacje(nawigacja: dict[str, str]) -> str:
    """`fix_navigation` jako czytelny opis `panel/tab/modal/focus` — tylko obecne klucze."""
    czesci = [
        f"{klucz}: `{nawigacja[klucz]}`" for klucz in KOLEJNOSC_NAWIGACJI if klucz in nawigacja
    ]
    # Klucze spoza znanej czwórki (nie występują w rejestrze na dzień tej karty — sprawdzone
    # grepem, patrz meldunek) trafiają na koniec, żeby żadna dana nie zniknęła po cichu.
    nieznane = [k for k in nawigacja if k not in KOLEJNOSC_NAWIGACJI]
    for klucz in sorted(nieznane):
        czesci.append(f"{klucz}: `{nawigacja[klucz]}`")
    return ", ".join(czesci)


def wiersze_posortowane(codes: dict[str, object]) -> list[object]:
    """Specyfikacje kodów posortowane po (obszar, priorytet, kod) — porządek z karty.

    "Obszar" sortuje po kolejności DEKLARACJI w `ReadinessArea` (ta sama kolejność, co
    ręczna tabela "Obszary" wyżej w dokumencie — SOURCES, TOPOLOGY, CATALOGS, STATIONS,
    GENERATORS, PROTECTION, ANALYSIS), nie alfabetycznie — dokument czyta się spójnie z
    referencyjną tabelą obszarów, która go poprzedza.
    """
    modul = modul_rejestru()
    kolejnosc_obszarow = {obszar: i for i, obszar in enumerate(modul.ReadinessArea)}
    return sorted(
        codes.values(),
        key=lambda spec: (kolejnosc_obszarow[spec.area], spec.priority, spec.code),
    )


def renderuj_tabela_slownika(codes: dict[str, object]) -> str:
    wiersze = wiersze_posortowane(codes)
    naglowek = (
        "| Kod | Obszar | Priorytet | Poziom | Komunikat PL | Nawigacja naprawcza |\n"
        "|-----|--------|-----------|--------|--------------|----------------------|"
    )
    linie = [naglowek]
    for spec in wiersze:
        linie.append(
            "| `{kod}` | {obszar} | {priorytet} | {poziom} | {komunikat} | {nawigacja} |".format(
                kod=_escape_md(spec.code),
                obszar=spec.area.value,
                priorytet=spec.priority,
                poziom=spec.level.value,
                komunikat=_escape_md(spec.message_pl),
                nawigacja=_escape_md(_renderuj_nawigacje(spec.fix_navigation)),
            )
        )
    return "\n".join(linie)


def renderuj_podsumowanie(codes: dict[str, object]) -> str:
    modul = modul_rejestru()
    wartosci = list(codes.values())

    liczby_poziomow = {poziom: 0 for poziom in modul.ReadinessLevel}
    for spec in wartosci:
        liczby_poziomow[spec.level] += 1

    liczby_obszarow = {obszar: 0 for obszar in modul.ReadinessArea}
    for spec in wartosci:
        liczby_obszarow[spec.area] += 1

    linie = ["| Poziom | Liczba kodów |", "|--------|---------------|"]
    for poziom, liczba in liczby_poziomow.items():
        linie.append(f"| {poziom.value} | {liczba} |")
    linie.append(f"| **Razem** | **{len(wartosci)}** |")

    linie.append("")
    linie.append("| Obszar | Liczba kodów |")
    linie.append("|--------|---------------|")
    for obszar, liczba in liczby_obszarow.items():
        linie.append(f"| {obszar.value} | {liczba} |")
    linie.append(f"| **Razem** | **{len(wartosci)}** |")

    return "\n".join(linie)


def renderuj_blok_generowany(codes: dict[str, object]) -> str:
    czesci = [
        "## Kompletny słownik kodów gotowości",
        "",
        (
            f"Wszystkie **{len(codes)}** kody z `domain/canonical_operations.py::READINESS_CODES`, "
            "posortowane po obszarze, priorytecie i kodzie. Kolumny odpowiadają polom "
            "`ReadinessCodeSpec` 1:1 — brak tu żadnej wartości spoza rejestru."
        ),
        "",
        renderuj_tabela_slownika(codes),
        "",
        "## Podsumowanie statystyczne",
        "",
        renderuj_podsumowanie(codes),
    ]
    return "\n".join(czesci)


def zloz_dokument(istniejacy_tekst: str, blok: str) -> str:
    if ZNACZNIK_POCZATEK not in istniejacy_tekst or ZNACZNIK_KONIEC not in istniejacy_tekst:
        raise SystemExit(
            f"BLAD: dokument {DOKUMENT} nie ma znacznikow {ZNACZNIK_POCZATEK!r} / "
            f"{ZNACZNIK_KONIEC!r} — nie ma gdzie wstawic generowanej tresci."
        )
    przed, reszta = istniejacy_tekst.split(ZNACZNIK_POCZATEK, 1)
    _, po = reszta.split(ZNACZNIK_KONIEC, 1)
    return f"{przed}{ZNACZNIK_POCZATEK}\n\n{blok}\n\n{ZNACZNIK_KONIEC}{po}"


def wygeneruj_dokument() -> str:
    """Pełna treść dokumentu PO wstawieniu wygenerowanego bloku — jedna funkcja, dwa
    konsumenci (`main` przy zapisie i `readiness_dictionary_guard.py` przy `--check`)."""
    if not REGISTRY_FILE.exists():
        raise SystemExit(f"BLAD: brak rejestru: {REGISTRY_FILE}")
    if not DOKUMENT.exists():
        raise SystemExit(f"BLAD: brak dokumentu docelowego: {DOKUMENT}")
    codes = modul_rejestru().READINESS_CODES
    if not codes:
        raise SystemExit("BLAD: READINESS_CODES jest puste — pusty rejestr to blad, nie sukces.")
    blok = renderuj_blok_generowany(codes)
    istniejacy = DOKUMENT.read_text(encoding="utf-8")
    return zloz_dokument(istniejacy, blok)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="Nie zapisuj — zwroc RC=1, gdy dokument rozni sie od wygenerowanej tresci.",
    )
    args = parser.parse_args()

    nowa_tresc = wygeneruj_dokument()

    if args.check:
        obecna_tresc = DOKUMENT.read_text(encoding="utf-8")
        if obecna_tresc != nowa_tresc:
            print(
                f"NIEAKTUALNY: {DOKUMENT} rozni sie od wygenerowanej tresci — "
                "uruchom: python scripts/generuj_slownik_kodow_gotowosci.py",
                file=sys.stderr,
            )
            return 1
        print(
            f"AKTUALNY: {DOKUMENT} zgodny z rejestrem ({len(modul_rejestru().READINESS_CODES)} kodow)."
        )
        return 0

    DOKUMENT.write_text(nowa_tresc, encoding="utf-8")
    print(f"zapisano {DOKUMENT} ({len(modul_rejestru().READINESS_CODES)} kodow).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
