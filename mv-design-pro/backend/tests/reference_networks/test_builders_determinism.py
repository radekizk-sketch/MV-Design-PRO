"""Determinizm budowniczych `tests/reference_networks/builders.py` (GN_01..GN_05).

Karta K2 (2026-09-09): zastępuje `tests/test_reference_networks_determinism.py`
(skasowany — testował TEN SAM plik `builders.py`, nigdy nie zależał od
`application/reference_networks/**`, więc migracja go nie dotyczyła
funkcjonalnie; kasacja/zastąpienie wynika z §0.4(e) karty K2: "determinizm
builderów ENM testuje rejestr — dopisz brakujący test... jeśli go nie ma").

`tests/golden/test_registry.py::test_sieci_enm_sa_deterministyczne_i_blokery_nie_rosna`
JUŻ pokrywa determinizm hashu (2 budowy → ten sam hash) dla KAŻDEGO wpisu
rejestru z budowniczym postaci ENM — ale GN_04
(`build_gn04_sn_nn_oze`) i GN_05 (`build_gn05_sn_nn_oze_ochrona`) NIE mają
własnego wpisu rejestru (G04/G05 w `tests/golden/registry.py` budują z
INNEGO źródła — `application.analyses.lv_domain.scenariusze_nn:SCENARIUSZE`,
nie z tego pliku) — luka pre-istniejąca, niezależna od K2, ale wykryta przy
tej pracy i naprawiana tu (Zero-Debt: „każdy napotkany błąd naprawiasz").
Ten plik domyka GN_01..GN_05 GENERYCZNIE (jak `test_registry.py`: 2 budowy →
ten sam hash, NIE 100x — bez RNG w operacjach domenowych 2 budowy niosą tę
samą informację co 100, `test_registry.py` już to ustaliło jako konwencję).
"""

from __future__ import annotations

from tests.reference_networks.builders import build_all_golden_networks


def test_wszystkie_golden_networks_deterministyczne() -> None:
    pierwsza = build_all_golden_networks()
    druga = build_all_golden_networks()
    hashe_pierwszej = [siec["snapshot_hash"] for siec in pierwsza]
    hashe_drugiej = [siec["snapshot_hash"] for siec in druga]
    assert hashe_pierwszej == hashe_drugiej, "budowa golden networks nie jest deterministyczna"


def test_wszystkie_golden_networks_maja_unikalne_hashe() -> None:
    sieci = build_all_golden_networks()
    hashe = [siec["snapshot_hash"] for siec in sieci]
    assert len(set(hashe)) == len(hashe), "golden networks muszą mieć unikalne hashe"


def test_wszystkie_golden_networks_maja_stabilne_nazwy() -> None:
    sieci = build_all_golden_networks()
    nazwy = [siec["name"] for siec in sieci]
    oczekiwane = [
        "GN_01_SN_PROSTA",
        "GN_02_SN_ODG",
        "GN_03_SN_PIERSCIEN",
        "GN_04_SN_NN_OZE",
        "GN_05_SN_NN_OZE_OCHRONA",
    ]
    assert nazwy == oczekiwane
