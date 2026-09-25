"""Rekord „ocena niewykonana" nie oferuje akcji bez celu (rozstrzygnięcie zarządcy 2026-09-23).

Tor T1 (stabilność z kątów wpisanych przez użytkownika) nie ma metody, która wyznaczyłaby
stabilność kątową: jedyna właściwa naprawa — bieg dynamiki RMS na silniku kanonicznym — nie ma
w produkcie ekranu, na który można by przejść. Reguła K doklejała jednak do rekordu radę
„wykonaj bieg na aktualnym modelu albo uzupełnij dane wejściowe", choć bieg T1 był aktualny,
a dane kompletne — akcja bez celu (martwa rada, której wykonanie niczego nie zmienia). Reguła K
nazywa teraz brak wyniku BEZ rady, gdy dowód nie ma metody (``BRAK_METODY``); tę samą regułę
dziedziczy KAŻDA powierzchnia „oceny niewykonanej" (fabryka ``application/ocena_niewykonana``).

Iloczyn cech: {powierzchnia: trajektorie FRT, sekwencja FRT, tor T1 (także przez końcówkę),
SSCI, jakość energii, pole LoM bez sprawdzeń, moduł LoM bez pola, porównanie LoM bez nastawy}
× {metoda dowodu: brak metody / metoda dopuszczalna} × {treść rekordu: zdanie, przyczyna, czego
brakuje, zastrzeżenia, pola rekordu}. Para predykatów reguły K: bez metody dowodu rada ZNIKA,
z metodą dopuszczalną i bez wyniku rada ZOSTAJE, bo ma cel (porównanie nastawy LoM bez
wartości: uzupełnienie nastawy w przypisaniu zabezpieczeń je wykona).
"""

from __future__ import annotations

from collections.abc import Callable, Iterator
from typing import Any

import pytest
from enm.canonical_analysis import create_run, execute_run
from enm.store import set_enm

from tests.cgmes.golden_enm import build_golden_enm
from tests.uczciwosc import generuj_fixtury_ocen_fe as fixtury
from tests.werdykt import fabryki as f

#: Rada ponownego biegu / uzupełnienia danych — akcja, która nie ma celu bez metody dowodu.
_RADY_BEZ_CELU = ("wykonaj bieg", "uzupełnij dane wejściowe", "Akcja naprawcza")
#: Pola nawigacji albo akcji — rekord kontraktu ich nie ma; żadna powierzchnia ich nie dokłada.
_POLA_AKCJI = ("akcja", "akcja_naprawcza_pl", "fix_action", "fix_navigation", "cel_nawigacji")
#: Budowniczowie odpowiedzi powierzchni — TE SAME funkcje, z których powstają fixtury frontu.
_POWIERZCHNIE: dict[str, Callable[[], Any]] = {
    "frt": fixtury._frt,
    "stabilnosc": fixtury._stabilnosc,
    "ssci": fixtury._ssci,
    "widoki_lom": fixtury._widoki_lom,
    "akademickie": fixtury._akademickie,
}


def _rekordy_niewykonane(dane: Any) -> Iterator[dict[str, Any]]:
    """Wszystkie rekordy K/W o statusie ``NIE_OCENIONO`` w odpowiedzi (przejście rekurencyjne)."""
    if isinstance(dane, dict):
        if dane.get("status_maszynowy") == "NIE_OCENIONO":
            yield dane
        for wartosc in dane.values():
            yield from _rekordy_niewykonane(wartosc)
    elif isinstance(dane, list):
        for wartosc in dane:
            yield from _rekordy_niewykonane(wartosc)


def _teksty_rekordu(rekord: dict[str, Any]) -> list[str]:
    wyjasnienie = rekord["wyjasnienie"]
    return [
        wyjasnienie["zdanie_pl"],
        wyjasnienie["przyczyna_pl"],
        *wyjasnienie["czego_brakuje"],
        *wyjasnienie["zastrzezenia"],
    ]


def _sprawdz_rekord(rekord: dict[str, Any]) -> str:
    """Sprawdza rekord i zwraca jego metodę dowodu (``"W"`` dla rekordu wymagania)."""
    identyfikator = rekord.get("kryterium_id") or rekord.get("wymaganie_id")
    for pole in _POLA_AKCJI:
        assert pole not in rekord, (identyfikator, pole)
        assert pole not in rekord["wyjasnienie"], (identyfikator, pole)
    if "kryterium_id" not in rekord:
        # Rekord W składa braki składowych — każda składowa jest sprawdzana osobno (przejście
        # rekurencyjne `_rekordy_niewykonane` wchodzi w `oceny_skladowe`).
        return "W"
    metoda = str(rekord["dowod"]["metoda"])
    czego_brakuje = rekord["wyjasnienie"]["czego_brakuje"]
    if metoda == "BRAK_METODY":
        for tekst in _teksty_rekordu(rekord):
            for rada in _RADY_BEZ_CELU:
                assert rada not in tekst, (identyfikator, tekst)
        # Brak wyniku jest NAZWANY (bez rady): narzędzie nie ma metody, która go wyznacza.
        assert any(
            tekst.startswith("Wynik wielkości ocenianej: narzędzie nie ma metody")
            for tekst in czego_brakuje
        ), identyfikator
    else:
        # Metoda dopuszczalna, wynik nieobecny: rada ma cel (bieg albo dane wejściowe).
        assert any(
            "wykonaj bieg na aktualnym modelu albo uzupełnij dane wejściowe" in tekst
            for tekst in czego_brakuje
        ), identyfikator
    return metoda


@pytest.mark.parametrize("powierzchnia", sorted(_POWIERZCHNIE))
def test_ocena_niewykonana_powierzchni_nie_oferuje_akcji_bez_celu(powierzchnia: str) -> None:
    metody = {_sprawdz_rekord(r) for r in _rekordy_niewykonane(_POWIERZCHNIE[powierzchnia]())}
    # Kontrola dodatnia: powierzchnia naprawdę niesie rekordy „oceny niewykonanej" bez metody.
    assert "BRAK_METODY" in metody, (powierzchnia, metody)


def test_porownanie_lom_bez_nastawy_zachowuje_rade_z_celem() -> None:
    """Druga strona pary: porównanie nastawy LoM bez wartości (metoda deklaracji dopuszczalna)
    niesie radę uzupełnienia danych — cel istnieje (nastawa w przypisaniu zabezpieczeń)."""
    metody = {_sprawdz_rekord(r) for r in _rekordy_niewykonane(fixtury._widoki_lom())}
    assert "DEKLARACJA" in metody, metody


def test_rekord_toru_t1_z_koncowki_nie_oferuje_akcji_bez_celu(app_client: Any) -> None:
    """Ścieżka użytkownika: bieg T1 z KOMPLETEM danych scenariusza → końcówka wyniku."""
    set_enm("c-akcje", build_golden_enm())
    bieg = execute_run(
        create_run(
            case_id="c-akcje",
            klucz_twin="c-akcje",
            analysis_type="dynamic_stability",
            options={
                "scenario_id": "dyn-akcje",
                "faulted_element_id": "cab_main_b",
                "cleared_by_element_ids": ["cb-a"],
                "clearing_time_ms": 90.0,
                "pre_fault_angle_deg": 8.0,
                "during_fault_angle_deg": 48.0,
                "post_fault_angle_deg": 18.0,
                "post_fault_voltage_pu": 0.98,
                "post_fault_frequency_pu": 0.995,
                "recovery_time_constant_s": 0.3,
            },
        ).id
    )
    assert bieg.status == "FINISHED", bieg.error_message
    odpowiedz = app_client.get(f"/api/analysis-runs/{bieg.id}/results/dynamic-stability")
    assert odpowiedz.status_code == 200, odpowiedz.text
    metody = {_sprawdz_rekord(r) for r in _rekordy_niewykonane(odpowiedz.json())}
    assert metody == {"BRAK_METODY"}, metody


def test_regula_k_rada_biegu_tylko_gdy_istnieje_metoda() -> None:
    """Para predykatów: bez metody dowodu brak wyniku jest nazwany bez rady; z metodą
    dopuszczalną (tu deklaracja konfiguracji) i bez wyniku rada ponownego biegu zostaje."""
    bez_metody = f.ocena(jest_wynik=False, dowod_oceny=f.dowod(metoda="BRAK_METODY"))
    z_metoda = f.ocena(jest_wynik=False)
    assert bez_metody.status_maszynowy == z_metoda.status_maszynowy == "NIE_OCENIONO"
    braki_bez = " ".join(bez_metody.wyjasnienie.czego_brakuje)
    braki_z = " ".join(z_metoda.wyjasnienie.czego_brakuje)
    assert "wykonaj bieg" not in braki_bez
    assert "narzędzie nie ma metody, która go wyznacza" in braki_bez
    assert "wykonaj bieg na aktualnym modelu" in braki_z
    assert "Akcja naprawcza" in z_metoda.wyjasnienie.zdanie_pl
