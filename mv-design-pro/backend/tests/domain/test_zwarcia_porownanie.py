"""Delty porownania zwarciowego liczone w DOMENIE (karta KD-3, pozycja 11).

DLUG, KTORY TE TESTY ZAMYKAJA (V12K-290): tryb zwarciowy ekranu porownan liczyl
roznice w warstwie prezentacji — odejmowanie i dzielenie wynikow solvera po
stronie klienta. Ta sama klasa, ktora dla porownan ROZPLYWU zamknela L-13.

Pilnowane wlasnosci:
1. delta bezwzgledna = B − A (znak mowi o kierunku zmiany),
2. delta wzgledna wobec A; A = 0 ⇒ None (wartosc NIE ISTNIEJE), pole POMIJANE
   w serializacji — nigdy zero,
3. punkt bez odpowiednika zachowuje swoje wartosci, dostaje znacznik obecnosci
   i NIE dostaje delt,
4. kolejnosc wierszy deterministyczna (unia identyfikatorow, rosnaco),
5. determinizm: dwa biegi tego samego wejscia daja identyczny wynik.
"""

from __future__ import annotations

import pytest
from domain.zwarcia_porownanie import (
    OBECNY_TYLKO_A,
    OBECNY_TYLKO_B,
    OBECNY_W_OBU,
    procent_roznicy,
    zbuduj_porownanie_zwarc,
)


def _wiersz(target_id: str, ikss: float, ip: float, ith: float, sk: float) -> dict:
    return {
        "target_id": target_id,
        "target_name": f"Punkt {target_id}",
        "ikss_ka": ikss,
        "ip_ka": ip,
        "ith_ka": ith,
        "sk_mva": sk,
    }


def test_delty_bezwzgledne_i_wzgledne_z_rachunku_recznego() -> None:
    """RACHUNEK RĘCZNY: A = 8,0 kA, B = 10,0 kA.

    Δ = 10,0 − 8,0 = 2,0 kA
    Δ% = (10,0 − 8,0)/|8,0| · 100 = 25,0 %
    """
    wynik = zbuduj_porownanie_zwarc(
        run_id_a="run-a",
        run_id_b="run-b",
        wiersze_a=[_wiersz("bus-1", 8.0, 20.0, 8.4, 200.0)],
        wiersze_b=[_wiersz("bus-1", 10.0, 25.0, 10.5, 250.0)],
    )
    punkt = wynik.punkty[0]
    assert punkt.obecny_w == OBECNY_W_OBU
    assert punkt.delta_ikss_ka == pytest.approx(2.0, abs=1e-12)
    assert punkt.delta_ikss_percent == pytest.approx(25.0, abs=1e-12)
    assert punkt.delta_ip_ka == pytest.approx(5.0, abs=1e-12)
    assert punkt.delta_ip_percent == pytest.approx(25.0, abs=1e-12)
    assert punkt.delta_ith_ka == pytest.approx(2.1, abs=1e-12)
    assert punkt.delta_sk_mva == pytest.approx(50.0, abs=1e-12)
    assert punkt.delta_sk_percent == pytest.approx(25.0, abs=1e-12)
    assert wynik.liczba_punktow_wspolnych == 1


def test_zero_w_przebiegu_a_daje_brak_procentu_nie_zero() -> None:
    """A = 0 ⇒ różnica względna NIE ISTNIEJE; pole pomijane w serializacji."""
    wynik = zbuduj_porownanie_zwarc(
        run_id_a="run-a",
        run_id_b="run-b",
        wiersze_a=[_wiersz("bus-1", 0.0, 0.0, 0.0, 0.0)],
        wiersze_b=[_wiersz("bus-1", 10.0, 25.0, 10.5, 250.0)],
    )
    punkt = wynik.punkty[0]
    assert punkt.delta_ikss_ka == pytest.approx(10.0)
    assert punkt.delta_ikss_percent is None
    dane = punkt.to_dict()
    assert "delta_ikss_ka" in dane
    assert "delta_ikss_percent" not in dane, "Brak wartości nie może udawać zera"


def test_punkt_bez_odpowiednika_ma_znacznik_i_zero_delt() -> None:
    wynik = zbuduj_porownanie_zwarc(
        run_id_a="run-a",
        run_id_b="run-b",
        wiersze_a=[_wiersz("bus-1", 8.0, 20.0, 8.4, 200.0)],
        wiersze_b=[_wiersz("bus-2", 9.0, 22.0, 9.4, 220.0)],
    )
    po_id = {p.target_id: p for p in wynik.punkty}
    assert po_id["bus-1"].obecny_w == OBECNY_TYLKO_A
    assert po_id["bus-1"].ikss_ka_a == pytest.approx(8.0)
    assert po_id["bus-1"].ikss_ka_b is None
    assert po_id["bus-1"].delta_ikss_ka is None
    assert po_id["bus-2"].obecny_w == OBECNY_TYLKO_B
    assert po_id["bus-2"].delta_ikss_percent is None
    assert (wynik.liczba_punktow_wspolnych, wynik.liczba_punktow_tylko_a) == (0, 1)
    assert wynik.liczba_punktow_tylko_b == 1
    # Punkt osierocony NIE MOŻE mieć delt w serializacji (zero fabrykacji).
    assert "delta_ikss_ka" not in po_id["bus-1"].to_dict()


def test_kolejnosc_wierszy_deterministyczna() -> None:
    wynik = zbuduj_porownanie_zwarc(
        run_id_a="a",
        run_id_b="b",
        wiersze_a=[_wiersz("z", 1, 1, 1, 1), _wiersz("a", 1, 1, 1, 1)],
        wiersze_b=[_wiersz("m", 1, 1, 1, 1)],
    )
    assert [p.target_id for p in wynik.punkty] == ["a", "m", "z"]


def test_determinizm_dwoch_biegow() -> None:
    argumenty = {
        "run_id_a": "a",
        "run_id_b": "b",
        "wiersze_a": [_wiersz("bus-1", 8.0, 20.0, 8.4, 200.0)],
        "wiersze_b": [_wiersz("bus-1", 10.0, 25.0, 10.5, 250.0)],
    }
    assert zbuduj_porownanie_zwarc(**argumenty) == zbuduj_porownanie_zwarc(**argumenty)


def test_brak_pola_w_wyniku_nie_daje_delty() -> None:
    """Starszy wynik bez pola → uczciwy brak, nie zero (zgodność wsteczna)."""
    wynik = zbuduj_porownanie_zwarc(
        run_id_a="a",
        run_id_b="b",
        wiersze_a=[{"target_id": "bus-1", "target_name": "P", "ikss_ka": 8.0}],
        wiersze_b=[{"target_id": "bus-1", "target_name": "P", "ikss_ka": 10.0}],
    )
    punkt = wynik.punkty[0]
    assert punkt.delta_ikss_ka == pytest.approx(2.0)
    assert punkt.delta_ip_ka is None
    assert punkt.sk_mva_a is None


def test_ref_schematu_przenoszony_z_wiersza() -> None:
    """`element_id` (ref elementu modelu) przechodzi do punktu porownania.

    Punkt zwarcia jest adresowany dwoma refami: wezlem grafu przebiegu
    (`target_id`) i elementem modelu (`element_id`). Nakladka roznic na
    schemacie adresuje elementy SCHEMATU, wiec potrzebuje tego drugiego —
    bez niego trafialaby w nieistniejace refy i byla pusta.
    """
    wynik = zbuduj_porownanie_zwarc(
        run_id_a="a",
        run_id_b="b",
        wiersze_a=[
            {"target_id": "node-7", "element_id": "bus-SN-1", "target_name": "P", "ikss_ka": 8.0}
        ],
        wiersze_b=[
            {"target_id": "node-7", "element_id": "bus-SN-1", "target_name": "P", "ikss_ka": 10.0}
        ],
    )
    punkt = wynik.punkty[0]
    assert punkt.element_id == "bus-SN-1"
    assert punkt.to_dict()["element_id"] == "bus-SN-1"


def test_ref_schematu_punktu_obecnego_tylko_w_b() -> None:
    """Punkt bez odpowiednika w A bierze ref z wiersza B (jedyne zrodlo)."""
    wynik = zbuduj_porownanie_zwarc(
        run_id_a="a",
        run_id_b="b",
        wiersze_a=[],
        wiersze_b=[
            {"target_id": "node-9", "element_id": "bus-SN-9", "target_name": "P", "ikss_ka": 10.0}
        ],
    )
    assert wynik.punkty[0].element_id == "bus-SN-9"


def test_brak_ref_schematu_jest_pomijany_w_serializacji() -> None:
    """Starszy wynik bez `element_id` ⇒ pole NIE ISTNIEJE, nie jest pustym tekstem."""
    wynik = zbuduj_porownanie_zwarc(
        run_id_a="a",
        run_id_b="b",
        wiersze_a=[{"target_id": "node-7", "target_name": "P", "ikss_ka": 8.0}],
        wiersze_b=[{"target_id": "node-7", "target_name": "P", "ikss_ka": 10.0}],
    )
    punkt = wynik.punkty[0]
    assert punkt.element_id is None
    assert "element_id" not in punkt.to_dict()


@pytest.mark.parametrize(
    ("a", "b", "oczekiwany"),
    [
        (8.0, 10.0, 25.0),
        (10.0, 8.0, -20.0),
        (-8.0, -10.0, -25.0),  # mianownik w wartości bezwzględnej: znak = znak delty
        (0.0, 10.0, None),
        (8.0, None, None),
    ],
)
def test_procent_roznicy_regula(a: float, b: float | None, oczekiwany: float | None) -> None:
    wynik = procent_roznicy(a, b)
    if oczekiwany is None:
        assert wynik is None
    else:
        assert wynik == pytest.approx(oczekiwany, abs=1e-12)
