"""Odcisk katalogu po karcie AB-H0 — zmiana WYŁĄCZNIE tam, gdzie zmieniły się dane.

Reguły ``network_model.catalog.odcisk`` (wzorzec ``enm/hash.py``):

* pola karty w projekcjach PV/BESS są w zrzucie WYŁĄCZNIE, gdy niosą wartość;
* skasowane ``ConverterType.harmonic_spectrum_percent`` zostaje w zrzucie jako ``null``
  (176/176 pozycji miało ``None`` — kasacja pola nie jest zmianą danych);
* pusta przestrzeń kart widmowych nie wchodzi do zrzutu; pierwsza karta zmienia odcisk.

Test kotwiczący: zrzut dzisiejszego katalogu z WYCIĘTYMI polami karty projekcji daje
DOKŁADNIE odcisk sprzed karty (``ODCISK_SPRZED_KARTY`` — wartość zamrożona w fiksturach
harnessu ``frontend/src/harness-fixtures/generated/*.json`` przed tą kartą). Zmiana odcisku
jest więc w całości wyjaśniona wzbogaceniem trzech projekcji kart referencyjnych.
"""

from __future__ import annotations

import dataclasses
import hashlib
import json

from network_model.catalog.odcisk import _kanon, odcisk_katalogu, zrzut_kanoniczny
from network_model.catalog.repository import get_default_mv_catalog
from network_model.catalog.types import POLA_KARTY_PROJEKCJI

from tests.dziedziny import fabryki as f

ODCISK_SPRZED_KARTY = "0115ee1a3faf1c42a814ef7cf160e7277ae2f926b1fdb48aced9919e0d6b2d95"
PROJEKCJE = ("pv_inverter_types", "bess_inverter_types")


def _odcisk_zrzutu(zrzut: dict[str, object]) -> str:
    tekst = json.dumps(
        zrzut, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=_kanon
    )
    return hashlib.sha256(tekst.encode("utf-8")).hexdigest()


def test_zmiana_odcisku_wylacznie_z_pol_karty_projekcji() -> None:
    zrzut = zrzut_kanoniczny(get_default_mv_catalog())
    wzbogacone = []
    for przestrzen in PROJEKCJE:
        for typ_id, postac in zrzut[przestrzen].items():  # type: ignore[attr-defined]
            if any(nazwa in postac for nazwa in POLA_KARTY_PROJEKCJI):
                wzbogacone.append(typ_id)
            for nazwa in POLA_KARTY_PROJEKCJI:
                postac.pop(nazwa, None)
    assert sorted(wzbogacone) == [
        "conv-bess-card-sungrow-sc2000ud-mv",
        "conv-pv-card-huawei-sun2000-215ktl",
        "conv-pv-card-sungrow-sg3150u-mv",
    ]
    assert _odcisk_zrzutu(zrzut) == ODCISK_SPRZED_KARTY


def test_pole_skasowane_zostaje_w_zrzucie_jako_null() -> None:
    zrzut = zrzut_kanoniczny(get_default_mv_catalog())
    przeksztaltniki = zrzut["converter_types"]
    assert len(przeksztaltniki) == 176
    assert all(p["harmonic_spectrum_percent"] is None for p in przeksztaltniki.values())


def test_pusta_przestrzen_kart_poza_zrzutem_a_karta_zmienia_odcisk() -> None:
    katalog = get_default_mv_catalog()
    assert "karty_widmowe" not in zrzut_kanoniczny(katalog)
    karta = f.karta(id="karta-1", urzadzenie_ref="conv-pv-gfm-2mw-15kv")
    z_karta = dataclasses.replace(katalog, karty_widmowe={karta.id: karta})
    zrzut = zrzut_kanoniczny(z_karta)
    assert zrzut["karty_widmowe"] == {"karta-1": karta.model_dump(mode="json")}
    assert odcisk_katalogu(z_karta) != odcisk_katalogu(katalog)
    # Determinizm: ta sama karta — ten sam odcisk.
    assert odcisk_katalogu(z_karta) == odcisk_katalogu(
        dataclasses.replace(katalog, karty_widmowe={karta.id: karta})
    )
