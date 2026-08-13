"""Sonda runtime: zaden modul domenowy nie zyje w `sys.modules` dwa razy (KD-10).

Uzupelnia skan statyczny `test_importy_bez_prefiksu_src.py` od drugiej strony.
Skan patrzy na ZRODLA i nie zobaczy podwojnej tozsamosci powstalej inaczej niz
przez literalny `from src. ...` (np. wstrzykniecie sciezki, ktore sprawia, ze ten
sam plik jest osiagalny pod dwiema nazwami pakietu). Sonda patrzy na FAKTYCZNY
stan procesu po zbudowaniu aplikacji i lapie kazde takie zrodlo rozdwojenia.

Pomiar na HEAD przed naprawa (sonda w osobnym procesie, po samym
`import api.main`): 41 modulow istnialo podwojnie — `application`, `catalog`,
`enm` (`models`, `validator`, `mapping`, `hash`, `severity`, `interlock_rules`,
`fix_actions`), `network_model.core` (14 modulow: `bus`, `branch`, `graph`,
`switch`, `node`, `station`, `snapshot`, `ybus`, `machine`, `inverter`,
`generator`, `grid_source`, `canonical_hash`, `action_apply`/`action_envelope`)
oraz `network_model.solvers` z modulami FROZEN wlacznie.

Sonda jest CELOWO w tests/ci, a nie przy testach API: sprawdza inwariant
infrastruktury importow, nie zachowanie zadnego endpointu.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]
TEN_PLIK = Path(__file__).resolve()

# Usuniecie wpisu z `sys.modules` to DRUGI sposob na zrobienie dwoch tozsamosci
# jednego modulu — obok importu przez `src.`. Po usunieciu kolejny import buduje
# SWIEZY obiekt modulu z nowym kompletem klas, a wszystko, co zaimportowalo modul
# wczesniej, trzyma referencje do starych.
WZORZEC_USUNIECIA = re.compile(r"del\s+sys\.modules\[|sys\.modules\.pop\(|sys\.modules\.clear\(")
# Przywrocenie stanu — plik, ktory zdejmuje moduly, MUSI je oddac.
WZORZEC_PRZYWROCENIA = re.compile(r"sys\.modules\.update\(|sys\.modules\[[^\]]+\]\s*=")

# Nazwy dopuszczone pod prefiksem `src.` — WYLACZNIE modul rozruchowy.
# Uzasadnienie: obraz produkcyjny startuje `uvicorn src.api.main:app`, wiec
# `src`, `src.api` i `src.api.main` moga w tym kontekscie powstac jako pakiety
# rozruchowe. Nie tworzy to drugiej tozsamosci modulow DOMENOWYCH, poniewaz
# `api/main.py` importuje wylacznie po nazwach kanonicznych (bez `src.`) —
# pilnuje tego bramka statyczna. Ta lista NIE MOZE rosnac o moduly domenowe.
ROZRUCHOWE = {"src", "src.api", "src.api.main"}


def _podwojne_tozsamosci() -> list[str]:
    """Moduly obecne w `sys.modules` jednoczesnie jako `X` i `src.X`, jako ROZNE obiekty."""
    winne: list[str] = []
    for nazwa in sorted(sys.modules):
        if not nazwa.startswith("src."):
            continue
        if nazwa in ROZRUCHOWE:
            continue
        goly = nazwa[len("src.") :]
        modul_src = sys.modules.get(nazwa)
        modul_goly = sys.modules.get(goly)
        if modul_goly is None or modul_src is None:
            continue
        if modul_goly is not modul_src:
            winne.append(f"{goly} (zyje takze jako {nazwa} — DWA rozne obiekty modulu)")
    return winne


def test_moduly_domenowe_maja_jedna_tozsamosc_po_zbudowaniu_aplikacji() -> None:
    """Po zbudowaniu aplikacji zaden modul domenowy nie ma bliźniaka pod `src.`."""
    import api.main  # noqa: F401  — wejscie aplikacji ciagnie caly graf importow

    winne = _podwojne_tozsamosci()

    assert winne == [], (
        "Modul domenowy zyje w tym procesie DWA RAZY — raz pod nazwa kanoniczna, raz pod "
        "prefiksem `src.`. Python wykonal jego plik dwukrotnie, wiec kazda klasa, enum i "
        "zmienna modulowa istnieje w dwoch niepowiazanych kopiach: `isinstance` i "
        "`issubclass` przez granice tych kopii zwracaja False, `except` nie lapie, a "
        "rejestry modulowe rozjezdzaja sie po cichu. Winowajcy:\n" + "\n".join(winne)
    )


def test_enm_models_nie_ma_blizniaka_pod_prefiksem_src() -> None:
    """Dokladnie ten modul, na ktorym zmierzono mine (`EnergyNetworkModel` jako dwie klasy)."""
    import api.main  # noqa: F401
    import enm.models

    blizniak = sys.modules.get("src.enm.models")

    assert blizniak is None or blizniak is enm.models, (
        "`enm.models` i `src.enm.models` to dwa rozne obiekty modulu, wiec "
        "`EnergyNetworkModel` jest DWIEMA roznymi klasami i "
        "`isinstance(src.enm.models.EnergyNetworkModel(), enm.models.EnergyNetworkModel)` "
        "zwraca False."
    )


def test_test_zdejmujacy_moduly_z_sys_modules_musi_je_oddac() -> None:
    """Skan statyczny: kto zdejmuje modul z `sys.modules`, ten musi go przywrocic.

    DEFEKT, KTORY TO ZAMYKA (KD-10). `tests/analysis/test_arc_flash.py` kasowal
    wszystkie moduly `network_model.solvers*` i NIE oddawal ich. Kazdy test
    wykonany pozniej, ktory przez leniwy import odtworzyl ktorys z nich, dostawal
    SWIEZE klasy — a moduly zaimportowane wczesniej trzymaly stare. Pomiar w pelnym
    biegu: `tests/solvers/test_pr15_pr16_solvers.py` oblewal
    `isinstance(result, StabilityResult)` na obiekcie, ktory JEST `StabilityResult`.

    Defekt byl PRZYKRYTY podwojna tozsamoscia: dopoki ten test importowal solwery
    przez `src.`, kasowanie nazw `network_model.solvers*` go nie dotykalo. Reprodukcja
    `pytest tests/analysis/test_arc_flash.py tests/solvers/test_pr15_pr16_solvers.py`
    na commicie bazowym: 85 passed; po ujednoliceniu tozsamosci: 2 failed; po naprawie
    przywracajacej stan: 85 passed. Bramka pilnuje, zeby nie wrocil ta sama droga.
    """
    naruszenia: list[str] = []
    for plik in sorted((BACKEND / "tests").rglob("*.py")):
        if plik.resolve() == TEN_PLIK:
            # Ten plik CYTUJE wzorce w opisie i w regexach, sam `sys.modules` nie rusza.
            continue
        tresc = plik.read_text(encoding="utf-8")
        if not WZORZEC_USUNIECIA.search(tresc):
            continue
        if WZORZEC_PRZYWROCENIA.search(tresc):
            continue
        naruszenia.append(plik.relative_to(BACKEND).as_posix())

    assert naruszenia == [], (
        "Test zdejmuje moduly z `sys.modules` i ich NIE ODDAJE. Kolejny import tworzy "
        "wtedy DRUGA tozsamosc modulu — nowy komplet klas dla wszystkiego, co "
        "zaimportuje go pozniej, przy starych referencjach u tych, ktorzy zdazyli "
        "wczesniej. `isinstance` zaczyna oblewac na wlasnym typie, a wynik zalezy od "
        "KOLEJNOSCI testow, wiec bieg czesciowy i pelny daja rozne odpowiedzi. "
        "Zdjete moduly zapamietaj i przywroc w `finally`:\n" + "\n".join(naruszenia)
    )
