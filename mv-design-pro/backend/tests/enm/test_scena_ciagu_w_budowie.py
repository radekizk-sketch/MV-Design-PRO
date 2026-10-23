"""Karta PARTIA-6-FRONT — scena CIĄGU W BUDOWIE (`tests/reference_networks/scena_ciagu_w_budowie.py`).

Pilnuje kontraktu, na którym front dowodzi kryterium S9-5 (15 ogniw z kanwy): etap k ma GPZ
i k stacji, punkt startu następnego ogniwa jest WOLNYM polem liniowym stacji startu wg
`enm.zajetosc_pol`, a po wykonaniu ogniwa to pole jest zajęte (etap k+1).
"""

from __future__ import annotations

from functools import cache

from enm.zajetosc_pol import zajetosc_pol

from tests.reference_networks.scena_ciagu_w_budowie import LICZBA_OGNIW, Etap, zbuduj_etapy


@cache
def _etapy() -> tuple[Etap, ...]:
    return tuple(zbuduj_etapy())


def test_etapy_0_do_15_z_rosnaca_liczba_stacji() -> None:
    etapy = _etapy()
    assert LICZBA_OGNIW == 15
    assert [e.liczba_stacji for e in etapy] == list(range(LICZBA_OGNIW + 1))
    for etap in etapy:
        stacje = [s for s in etap.snapshot["substations"] if s.get("station_type") != "gpz"]
        assert len(stacje) == etap.liczba_stacji


def test_punkt_startu_jest_wolnym_polem_liniowym_stacji_startu() -> None:
    for etap in _etapy()[:-1]:
        zajetosc = zajetosc_pol(etap.snapshot)
        assert etap.pole_startu is not None
        pole = zajetosc[etap.pole_startu]
        assert pole.station_ref == etap.stacja_startu
        assert pole.bay_role in {"OUT", "FEEDER"}
        assert not pole.zajete
        if etap.liczba_stacji > 0:
            assert pole.bay_role == "OUT"


def test_ogniwo_zajmuje_pole_startu_a_nowa_stacja_ma_wolne_pole_wyjsciowe() -> None:
    etapy = _etapy()
    for przed, po in zip(etapy, etapy[1:], strict=False):
        assert przed.pole_startu is not None
        assert zajetosc_pol(po.snapshot)[przed.pole_startu].zajete
        assert po.stacja_startu != przed.stacja_startu
    assert etapy[-1].pole_startu is None
    wolne_out = [
        z
        for z in zajetosc_pol(etapy[-1].snapshot).values()
        if z.station_ref == etapy[-1].stacja_startu and z.bay_role == "OUT" and not z.zajete
    ]
    assert len(wolne_out) == 1
