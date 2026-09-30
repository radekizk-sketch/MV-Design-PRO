"""Sekcja `koszt` widoku listy materiałowej (karta W10-2a): {wycenione, brak ceny, brak ilości}."""

from __future__ import annotations

import pytest
from application.koszty.lista_materialowa import KOD_BRAK_ILOSCI, koszt_listy_materialowej
from catalog.cenniki import cennik_z_danych

_TR = "bench_iec60909example_tr110_33"
_KABEL = "cable-base-epr-al-1c-120"


def _cennik() -> object:
    zrodlo = {"status": "WSKAZANE", "dokument": "oferta 5/2026", "data": "2026-09-02"}
    return cennik_z_danych(
        {
            "wersja": "2026-09",
            "waluta": "PLN",
            "data_cen": "2026-09-15",
            "energia_strat": {
                "cena_pln_mwh": None,
                "zrodlo": {"status": "NIEUSTALONE", "uwagi_pl": "brak"},
            },
            "pozycje": [
                {"type_id": _TR, "jednostka": "szt.", "capex_pln": 90_000.0, "zrodlo": zrodlo},
                {"type_id": _KABEL, "jednostka": "km", "capex_pln": 200_000.0, "zrodlo": zrodlo},
            ],
        }
    )


def _poz(element: str, ref: str | None, ilosc: object, jednostka: str) -> dict[str, object]:
    return {"element": element, "catalog_ref": ref, "ilosc": ilosc, "jednostka": jednostka}


def test_wycenione() -> None:
    koszt = koszt_listy_materialowej(
        [_poz("Transformator", _TR, 1, "szt."), _poz("Kabel SN", _KABEL, 0.75, "km")], _cennik()
    )
    assert koszt["status"] == "WYCENIONE"
    assert koszt["suma_capex"] == pytest.approx(90_000.0 + 0.75 * 200_000.0)
    assert koszt["waluta"] == "PLN"


def test_brak_ceny_typu() -> None:
    koszt = koszt_listy_materialowej(
        [_poz("Wyłącznik", "sw-cb-abb-vd4-12kv-1250a", 1, "szt.")], _cennik()
    )
    assert koszt["status"] == "BRAK_CENNIKA"
    assert koszt["type_ids"] == ["sw-cb-abb-vd4-12kv-1250a"]


@pytest.mark.parametrize("ilosc", [None, "dużo", True])
def test_brak_ilosci_nie_jest_zerem(ilosc: object) -> None:
    koszt = koszt_listy_materialowej(
        [_poz("Kabel SN", _KABEL, ilosc, "km"), _poz("Transformator", _TR, 1, "szt.")], _cennik()
    )
    assert koszt["status"] == "BRAK_ILOSCI"
    assert koszt["kod"] == KOD_BRAK_ILOSCI
    assert koszt["pozycje_bez_ilosci"] == ["Kabel SN"]
    assert KOD_BRAK_ILOSCI not in koszt["komunikat_pl"]
