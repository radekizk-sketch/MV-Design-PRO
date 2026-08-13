"""Bramka trwala: katalog testow NIE MOZE trafic na sciezke importu (KD-9).

DEFEKT, KTORY TO ZAMYKA. `tests/analysis/test_energy_validation.py` i
`tests/application/sld/test_golden_network_sld.py` dokladaly katalog `tests/` na
POCZATEK `sys.path`. Poniewaz `tests/` zawiera pakiety o nazwach pakietow
zrodlowych (`reference_engine`, `enm`, `network_model`), kazdy bieg CZESCIOWY
obejmujacy te pliki przeslanial zrodla testami. Pomiar na HEAD przed naprawa:
`pytest tests/analysis tests/application/analyses` = 108 FANTOMOWYCH porazek
(`ModuleNotFoundError: No module named 'reference_engine.validation'` z leniwego
importu w `enm/validator.py`), przy calkowicie zielonym biegu PELNYM. CI tego nie
widzialo — falszywy obraz dostawal kazdy, kto uruchamial podzbior testow.

Bramka jest STATYCZNA (skan zrodel), a nie runtime'owa, bo zatrucie `sys.path`
zdarza sie w fixture i test runtime'owy zlapalby je tylko wtedy, gdyby akurat
wykonal sie PO winowajcy. Kolejnosc testow nie moze decydowac o wykryciu defektu.

DLACZEGO `tests/{reference_engine,enm,network_model}/__init__.py` ZOSTAJA.
Same w sobie nie cieniuja niczego — szkodzily WYLACZNIE w polaczeniu z katalogiem
`tests/` na `sys.path`, a ten wektor jest teraz zamkniety dwoma zamkami:
`--import-mode=importlib` odbiera pytestowi prawo wstrzykiwania katalogow
testowych (pomiar: 10 wstrzyknięć w trybie `prepend` wobec 1 w `importlib`),
a bramka ponizej odbiera je testom. Za to te pliki czynia `tests.enm`,
`tests.network_model` i `tests.reference_engine` REGULARNYMI pakietami, na czym
opiera sie 58 importow `from tests.<pakiet> import ...` oraz importy wzgledne
wewnatrz `tests/enm/`. Usuniecie zamienialoby je w pakiety przestrzeni nazw —
slabsza gwarancje bez zadnego zysku.
"""

from __future__ import annotations

import re
from pathlib import Path

TESTY = Path(__file__).resolve().parents[1]
TEN_PLIK = Path(__file__).resolve()

WZORZEC = re.compile(r"sys\.path\.(?:insert|append)\(([^\n]*)")

# Dopuszczalne wstrzykniecia, kazde z powodem. Klucz: sciezka wzgledem `backend/`,
# wartosc: fragment, ktory musi wystapic w argumencie.
DOZWOLONE_ODSTEPSTWA = {
    # Korzen backendu jest WYMAGANY przez tryb importu `importlib` — bez niego nie
    # dziala `from tests.<pakiet> import ...` (58 modulow testowych). Korzen
    # backendu udostepnia pakiet `tests`, a NIE pakiety zrodlowe, wiec cieniowac
    # nie moze; to wlasnie zamiana "kazdy katalog testowy" na "jeden korzen".
    "tests/conftest.py": "backend_root",
    # Sklada TEKST programu uruchamianego w PODPROCESIE
    # (`python -c "import sys; sys.path.insert(...)"`) i dokłada tam katalog
    # `scripts/`, zeby podproces zobaczyl testowany guard. Sciezka importu
    # BIEZACEGO procesu pozostaje nietknieta.
    "tests/ci/test_guard_diff_base.py": "SCRIPTS_DIR",
}


def _wstrzykniecia() -> list[tuple[str, int, str]]:
    znaleziska: list[tuple[str, int, str]] = []
    for plik in sorted(TESTY.rglob("*.py")):
        if plik.resolve() == TEN_PLIK:
            # Ten plik CYTUJE wzorzec w opisie i w regexie, sam sciezki nie rusza.
            continue
        wzgledny = plik.relative_to(TESTY.parent).as_posix()
        for numer, linia in enumerate(plik.read_text(encoding="utf-8").splitlines(), start=1):
            dopasowanie = WZORZEC.search(linia)
            if dopasowanie is None:
                continue
            znaleziska.append((wzgledny, numer, dopasowanie.group(1).strip()))
    return znaleziska


def test_testy_dokladaja_do_sciezki_wylacznie_katalog_src() -> None:
    """Kazde `sys.path.insert/append` w testach musi wskazywac `src`."""
    naruszenia = []
    for plik, numer, argument in _wstrzykniecia():
        dozwolony = DOZWOLONE_ODSTEPSTWA.get(plik)
        if dozwolony is not None and dozwolony in argument:
            continue
        if "src" in argument:
            continue
        naruszenia.append(f"{plik}:{numer}: sys.path.insert({argument}")

    assert naruszenia == [], (
        "Test dokladajacy do sys.path katalog INNY niz `src` moze przeslonic pakiet "
        "zrodlowy pakietem testowym o tej samej nazwie (tests/enm, tests/network_model, "
        "tests/reference_engine). Zamiast manipulowac sciezka uzyj pelnej nazwy pakietu "
        "testowego: `from tests.<pakiet> import ...`.\n" + "\n".join(naruszenia)
    )


def test_pakiet_zrodlowy_reference_engine_nie_jest_przeslaniany() -> None:
    """Dokladnie ten import, ktory pekal w biegach czesciowych na HEAD."""
    from reference_engine.validation import reference_validation_issues

    assert callable(reference_validation_issues)
