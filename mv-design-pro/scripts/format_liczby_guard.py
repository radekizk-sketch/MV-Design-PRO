#!/usr/bin/env python3
"""Strażnik jednego źródła zapisu liczby po polsku w tekście dla projektanta.

DLACZEGO (karta PROZA-BEZ-SYMBOLI-ASCII, 2026-11-05). Zapis liczby z przecinkiem
dziesiętnym ma w backendzie JEDNO źródło: ``werdykt.wyjasnienie.format_liczba``
(przecinek, minus U+2212, zaokrąglenie połówkowe w górę z ``Decimal(repr(x))``, wariant
``latex`` z ``{,}``). Pomiar na drzewie karty: 41 kopii tej reguły w 27 plikach —
lokalne pomocniki (``_liczba_pl``, ``_lp``, ``_tex`` …) i wpisane w miejscu
``f"{x:.3g}".replace(".", ",")``. Każda kopia ma własne zaokrąglenie, własny minus
i własny próg zapisu wykładniczego, więc ta sama liczba wychodzi w dwóch ekranach różnie.

KONTRAKT. Kopią jest każde wywołanie ``.replace(".", ",")`` albo ``.replace(".", "{,}")``
w ``backend/src`` poza ``werdykt/wyjasnienie.py``. Zapadka dwukierunkowa ``PINY``: plik
z kopiami ponad pin = nowa kopia (czerwono — użyj ``format_liczba``); plik z kopiami
poniżej pinu = pin do obniżenia z pomiarem (czerwono, żeby spadek był utrwalony); plik
spoza listy = pin 0. Lista może tylko maleć.

Uruchomienie: ``python scripts/format_liczby_guard.py`` (kod 0 = zgodność z pinami).
"""

from __future__ import annotations

import ast
import sys
from pathlib import Path

BACKEND_SRC = Path(__file__).resolve().parent.parent / "backend" / "src"
ZRODLO = "werdykt/wyjasnienie.py"
ZAMIENNIKI_PRZECINKA = frozenset({",", "{,}"})

#: Zmierzone 2026-11-05 (karta PROZA-BEZ-SYMBOLI-ASCII). Rdzenie B-01 (`v126_academic.py`,
#: `catalog/profiles/nc_rfg/loader.py`) stoją tu jawnie — ich edycja wymaga bramki B-01.
PINY: dict[str, int] = {
    "analysis/energy_validation/builder.py": 1,
    "analysis/sanity_bounds/parametry_linii_bounds.py": 1,
    "api/canonical_run_views.py": 1,
    "api/proof_pack.py": 3,
    "application/analyses/frt_trajektorie.py": 1,
    "application/analyses/ochrona_lom.py": 1,
    "application/analyses/protection/coordination/analyzer.py": 1,
    "application/analyses/protection/ocena_nadpradowa.py": 1,
    "application/analyses/v126_katalog.py": 1,
    "application/analyses/v126_wzory.py": 1,
    "application/analyses/werdykt_projektowy.py": 1,
    "application/analyses/wytrzymalosc_cieplna_przewodow.py": 1,
    "application/dynamika/zalozenia.py": 1,
    "application/protection_comparison/service.py": 1,
    "application/protection_read_model.py": 1,
    "catalog/profiles/nc_rfg/loader.py": 1,  # rdzeń B-01
    "domain/archive_diff.py": 1,
    "enm/mapping.py": 2,
    "network_model/catalog/wartosci_robocze.py": 3,
    "network_model/core/czas_wylaczenia.py": 1,
    "network_model/solvers/conductor_thermal_withstand.py": 3,
    "network_model/solvers/doziemienie_sn.py": 2,
    "network_model/solvers/equipment_checks/slad.py": 2,
    "network_model/solvers/machine_sc_iec60909.py": 4,
    "network_model/solvers/parametry_linii_napowietrznej.py": 2,
    "network_model/solvers/power_flow_oltc_studies.py": 1,
    "network_model/solvers/v126_academic.py": 2,  # rdzeń B-01
}


def _jest_kopia(wezel: ast.AST) -> bool:
    return (
        isinstance(wezel, ast.Call)
        and isinstance(wezel.func, ast.Attribute)
        and wezel.func.attr == "replace"
        and len(wezel.args) == 2
        and all(isinstance(a, ast.Constant) for a in wezel.args)
        and wezel.args[0].value == "."
        and wezel.args[1].value in ZAMIENNIKI_PRZECINKA
    )


def kopie_w_pliku(plik: Path) -> list[int]:
    """Numery wierszy kopii reguły zapisu liczby w pliku."""
    drzewo = ast.parse(plik.read_text(encoding="utf-8"))
    return sorted(w.lineno for w in ast.walk(drzewo) if _jest_kopia(w))


def zmierz(korzen: Path = BACKEND_SRC) -> dict[str, list[int]]:
    pomiar: dict[str, list[int]] = {}
    for plik in sorted(korzen.rglob("*.py")):
        if "__pycache__" in plik.parts:
            continue
        wzgledna = plik.relative_to(korzen).as_posix()
        if wzgledna == ZRODLO:
            continue
        wiersze = kopie_w_pliku(plik)
        if wiersze:
            pomiar[wzgledna] = wiersze
    return pomiar


def problemy(pomiar: dict[str, list[int]], piny: dict[str, int] = PINY) -> list[str]:
    wynik: list[str] = []
    for wzgledna in sorted(set(pomiar) | set(piny)):
        liczba = len(pomiar.get(wzgledna, []))
        pin = piny.get(wzgledna, 0)
        if liczba > pin:
            wiersze = ", ".join(str(w) for w in pomiar[wzgledna])
            wynik.append(
                f"[format-liczby-nowe] {wzgledna}: {liczba} kopii > pin {pin} (wiersze {wiersze})"
                " — użyj werdykt.format_liczba"
            )
        elif liczba < pin:
            wynik.append(
                f"[format-liczby-pin] {wzgledna}: {liczba} kopii < pin {pin} — "
                "obniż pin z pomiarem"
            )
    return wynik


def main() -> int:
    pomiar = zmierz()
    lista = problemy(pomiar)
    suma = sum(len(w) for w in pomiar.values())
    print(
        f"Kopie zapisu liczby poza {ZRODLO}: {suma} w {len(pomiar)} plikach "
        f"(pin {sum(PINY.values())})."
    )
    for wiersz in lista:
        print(wiersz)
    return 1 if lista else 0


if __name__ == "__main__":
    sys.exit(main())
