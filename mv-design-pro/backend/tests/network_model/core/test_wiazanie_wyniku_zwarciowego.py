"""Testy `network_model.core.wiazanie_wyniku_zwarciowego` (karta S-2 AUTORYTET).

DoD karty (§2): „pieczęć wiązania: zmiana każdej z sześciu wielkości daje inną
pieczęć" — sprawdzone jako iloczyn cech: KAŻDE z sześciu pól zmienione osobno.
"""

from __future__ import annotations

import math

import pytest
from network_model.core.wiazanie_wyniku_zwarciowego import (
    NiepelneWiazanieError,
    WiazanieWynikuZwarciowego,
    odcisk_danych,
    odcisk_implementacji_zwarciowej,
    wiazanie_z_zapisu,
    wielkosci_do_odcisku,
    wszystkie_pola_obecne,
)

_WYNIK_PRZYKLADOWY = {
    "fault_node_id": "bus-1",
    "short_circuit_type": "3F",
    "c_factor": 1.1,
    "un_v": 15000.0,
    "ikss_a": 8000.0,
    "ip_a": 20000.0,
    "ith_a": 8000.0,
    "tk_s": 1.0,
    "kappa": 1.5,
    "rx_ratio": 0.1,
    # pole spoza listy zamkniętej — NIE wchodzi do odcisku
    "reporting_status": "reportable",
}


def _wiazanie(**nadpisania: object) -> WiazanieWynikuZwarciowego:
    kwargs = {
        "run_id": "run-1",
        "snapshot_id": "snap-1",
        "punkt_zwarcia": "bus-1",
        "migawka_wejscia": {"a": 1},
        "wynik": _WYNIK_PRZYKLADOWY,
    }
    kwargs.update(nadpisania)
    return WiazanieWynikuZwarciowego.z_biegu(**kwargs)  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# wielkosci_do_odcisku — lista ZAMKNIĘTA, brak pola -> None jawne (nie pominięte).
# ---------------------------------------------------------------------------


def test_wielkosci_do_odcisku_filtruje_do_listy_zamknietej() -> None:
    w = wielkosci_do_odcisku(_WYNIK_PRZYKLADOWY)
    assert "reporting_status" not in w
    assert set(w) == {
        "fault_node_id",
        "short_circuit_type",
        "c_factor",
        "un_v",
        "ikss_a",
        "ip_a",
        "ith_a",
        "tk_s",
        "kappa",
        "rx_ratio",
    }


def test_wielkosci_do_odcisku_pole_niekompletne_daje_none_jawne() -> None:
    niekompletny = dict(_WYNIK_PRZYKLADOWY)
    del niekompletny["ith_a"]
    w = wielkosci_do_odcisku(niekompletny)
    assert w["ith_a"] is None
    assert wielkosci_do_odcisku(_WYNIK_PRZYKLADOWY)["ith_a"] is not None
    assert odcisk_danych(w) != odcisk_danych(wielkosci_do_odcisku(_WYNIK_PRZYKLADOWY))


# ---------------------------------------------------------------------------
# Pieczęć: zmiana KAŻDEJ z sześciu wielkości daje inną pieczęć (DoD §2 karty).
# ---------------------------------------------------------------------------


def test_pieczec_identyczna_dla_identycznych_danych() -> None:
    assert _wiazanie().pieczec == _wiazanie().pieczec


def test_pieczec_zmienia_sie_gdy_run_id_inny() -> None:
    assert _wiazanie().pieczec != _wiazanie(run_id="run-2").pieczec


def test_pieczec_zmienia_sie_gdy_snapshot_id_inny() -> None:
    assert _wiazanie().pieczec != _wiazanie(snapshot_id="snap-2").pieczec


def test_pieczec_zmienia_sie_gdy_punkt_zwarcia_inny() -> None:
    assert _wiazanie().pieczec != _wiazanie(punkt_zwarcia="bus-2").pieczec


def test_pieczec_zmienia_sie_gdy_migawka_wejscia_inna() -> None:
    assert _wiazanie().pieczec != _wiazanie(migawka_wejscia={"a": 2}).pieczec


def test_pieczec_zmienia_sie_gdy_liczby_wyniku_inne() -> None:
    """To jest DOKŁADNIE scenariusz obejścia z karty: 999 kA zamiast 12,5 kA
    musi dać INNĄ pieczęć."""
    inny_wynik = dict(_WYNIK_PRZYKLADOWY)
    inny_wynik["ikss_a"] = 999000.0
    assert _wiazanie().pieczec != _wiazanie(wynik=inny_wynik).pieczec


def test_pieczec_zmienia_sie_gdy_odcisk_implementacji_inny(monkeypatch: pytest.MonkeyPatch) -> None:
    import network_model.core.wiazanie_wyniku_zwarciowego as modul

    oryginalna = _wiazanie()
    monkeypatch.setattr(modul, "_odcisk_implementacji_cache", "podmieniony-odcisk-kodu")
    podmieniona = _wiazanie()
    assert oryginalna.pieczec != podmieniona.pieczec


def test_szesc_pol_daje_szesc_roznych_pieczeci_naraz() -> None:
    """Iloczyn cech w jednym teście: sześć wariantów (po jednym polu zmienionym)
    dają sześć WZAJEMNIE różnych pieczęci — nie tylko różnych od bazowej."""
    baza = _wiazanie()
    warianty = [
        _wiazanie(run_id="run-X"),
        _wiazanie(snapshot_id="snap-X"),
        _wiazanie(punkt_zwarcia="bus-X"),
        _wiazanie(migawka_wejscia={"a": 999}),
        _wiazanie(wynik={**_WYNIK_PRZYKLADOWY, "ikss_a": 1.0}),
    ]
    pieczecie = [baza.pieczec] + [w.pieczec for w in warianty]
    assert len(set(pieczecie)) == len(pieczecie), "pieczęcie muszą być parami różne"


# ---------------------------------------------------------------------------
# Kontrola dziedziny: NaN/Inf w wyniku odrzucane głośno, nie cicho podstawiane.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("zla_wartosc", [float("nan"), float("inf"), float("-inf")])
def test_wynik_z_niefinitowa_liczba_odrzucany_glosno(zla_wartosc: float) -> None:
    zly_wynik = {**_WYNIK_PRZYKLADOWY, "ikss_a": zla_wartosc}
    with pytest.raises(NiepelneWiazanieError):
        _wiazanie(wynik=zly_wynik)


# ---------------------------------------------------------------------------
# Wiązanie niepełne — brak dowolnego z sześciu pól jest jawnym błędem.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "puste_pole",
    [
        "run_id",
        "snapshot_id",
        "punkt_zwarcia",
        "odcisk_wejscia",
        "odcisk_wyniku",
        "odcisk_implementacji",
    ],
)
def test_konstruktor_bezposredni_puste_pole_odrzucany(puste_pole: str) -> None:
    kwargs = {
        "run_id": "r",
        "snapshot_id": "s",
        "punkt_zwarcia": "p",
        "odcisk_wejscia": "a" * 64,
        "odcisk_wyniku": "b" * 64,
        "odcisk_implementacji": "c" * 64,
    }
    kwargs[puste_pole] = ""
    with pytest.raises(NiepelneWiazanieError):
        WiazanieWynikuZwarciowego(**kwargs)  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# niezgodnosci — argument pominięty nie jest sprawdzany; podany i różny — jest.
# ---------------------------------------------------------------------------


def test_niezgodnosci_puste_gdy_wszystko_pasuje() -> None:
    w = _wiazanie()
    assert w.niezgodnosci(run_id="run-1", snapshot_id="snap-1", punkt_zwarcia="bus-1") == ()


def test_niezgodnosci_pominiete_argumenty_nie_sa_sprawdzane() -> None:
    w = _wiazanie()
    assert w.niezgodnosci() == ()


def test_niezgodnosci_run_id_rozny() -> None:
    w = _wiazanie()
    roznice = w.niezgodnosci(run_id="inny-run")
    assert len(roznice) == 1
    assert "run_id" in roznice[0]


def test_niezgodnosci_wynik_rozny_wskazuje_liczby() -> None:
    w = _wiazanie()
    roznice = w.niezgodnosci(wynik={**_WYNIK_PRZYKLADOWY, "ikss_a": 1.0})
    assert any("liczby wyniku" in r for r in roznice)


def test_niezgodnosci_migawka_rozna_wskazuje_migawke() -> None:
    w = _wiazanie()
    roznice = w.niezgodnosci(migawka_wejscia={"a": 999})
    assert any("migawka wejścia" in r for r in roznice)


def test_niezgodnosci_wiele_naraz() -> None:
    w = _wiazanie()
    roznice = w.niezgodnosci(run_id="inny", punkt_zwarcia="inny-bus")
    assert len(roznice) == 2


# ---------------------------------------------------------------------------
# wiazanie_z_zapisu — round-trip i uczciwy brak przy zapisie niekompletnym.
# ---------------------------------------------------------------------------


def test_wiazanie_z_zapisu_round_trip() -> None:
    w = _wiazanie()
    odtworzone = wiazanie_z_zapisu(w.to_dict())
    assert odtworzone is not None
    assert odtworzone.pieczec == w.pieczec


def test_wiazanie_z_zapisu_brak_zapisu_daje_none() -> None:
    assert wiazanie_z_zapisu(None) is None
    assert wiazanie_z_zapisu({}) is None


def test_wiazanie_z_zapisu_niekompletny_daje_none_nie_wyjatek() -> None:
    niekompletny = {"run_id": "r"}
    assert wiazanie_z_zapisu(niekompletny) is None


def test_wszystkie_pola_obecne() -> None:
    w = _wiazanie()
    assert wszystkie_pola_obecne([w.to_dict(), w.to_dict()]) is True
    assert wszystkie_pola_obecne([w.to_dict(), {"run_id": "r"}]) is False


# ---------------------------------------------------------------------------
# Odcisk implementacji — deterministyczny, oparty o treść plików FROZEN.
# ---------------------------------------------------------------------------


def test_odcisk_implementacji_jest_stabilny_w_procesie() -> None:
    assert odcisk_implementacji_zwarciowej() == odcisk_implementacji_zwarciowej()


def test_odcisk_implementacji_jest_szesnastkowym_sha256() -> None:
    odcisk = odcisk_implementacji_zwarciowej()
    assert len(odcisk) == 64
    int(odcisk, 16)  # nie rzuca => poprawny hex


def test_odcisk_danych_deterministyczny_niezaleznie_od_kolejnosci_kluczy() -> None:
    a = {"x": 1, "y": 2}
    b = {"y": 2, "x": 1}
    assert odcisk_danych(a) == odcisk_danych(b)


def test_odcisk_danych_nan_odrzucany() -> None:
    with pytest.raises(NiepelneWiazanieError):
        odcisk_danych({"x": math.nan})
