"""Rodzaj widma harmonicznych karty przeksztaltnika (karta AB-1d_min, audyt harmonicznych #28).

Co przypina:

1. Niezmiennik „rzad calkowity 2..50" (KAT-T-015) i „0..100 % pradu" (KAT-T-016)
   dotycza RODZAJU widma `CURRENT_SPECTRUM_INTEGER_ORDER`, nie produktu — rekord
   bez pola rodzaju ma rodzaj POLA (rekordy sprzed karty), jawny rodzaj dziala tak samo.
2. Para pol: rodzaj bez widma = odmowa KAT-T-009; nieznany rodzaj = odmowa KAT-T-009.
3. Odcisk katalogu BEZ ZMIAN wobec bazy (pole addytywne pominiete, gdy `None`), a
   rekord z JAWNYM rodzajem zmienia odcisk (zmiana danych = zmiana katalogu).
4. Rundtrip `to_dict`/`from_dict`: pole emitowane wylacznie, gdy zapisane.
"""

from __future__ import annotations

import dataclasses

import pytest
from network_model.catalog.niezmienniki_katalogu import OdmowaKatalogu
from network_model.catalog.odcisk import (
    POLA_ADDYTYWNE_POMIJANE_GDY_BRAK,
    odcisk_katalogu,
    odcisk_katalogu_domyslnego,
)
from network_model.catalog.repository import get_default_mv_catalog
from network_model.catalog.types import (
    RODZAJE_WIDMA_HARMONICZNYCH,
    WIDMO_PRADU_RZEDY_CALKOWITE,
    ConverterKind,
    ConverterType,
)

#: Odcisk biblioteki typow na bazie karty (`8a49a02d`) — zmierzony PRZED dopisaniem
#: pola `harmonic_spectrum_kind`; pole addytywne nie moze go zmienic.
ODCISK_KATALOGU_BAZY = "0115ee1a3faf1c42a814ef7cf160e7277ae2f926b1fdb48aced9919e0d6b2d95"


def _konwerter(**nadpisania: object) -> ConverterType:
    parametry: dict[str, object] = {
        "id": "syntetyczny-konwerter-widmo",
        "name": "Przeksztaltnik syntetyczny",
        "kind": ConverterKind.PV,
        "un_kv": 0.4,
        "sn_mva": 1.0,
        "pmax_mw": 1.0,
    }
    parametry.update(nadpisania)
    return ConverterType(**parametry)  # type: ignore[arg-type]


def test_zbior_rodzajow_zamkniety_z_jednym_rodzajem_dzis() -> None:
    assert RODZAJE_WIDMA_HARMONICZNYCH == ("CURRENT_SPECTRUM_INTEGER_ORDER",)
    assert WIDMO_PRADU_RZEDY_CALKOWITE == "CURRENT_SPECTRUM_INTEGER_ORDER"


@pytest.mark.parametrize("rodzaj", [None, WIDMO_PRADU_RZEDY_CALKOWITE])
def test_niezmiennik_rzedu_dziala_dla_rodzaju_rzedy_calkowite(
    rodzaj: str | None,
) -> None:
    """Iloczyn cech: rodzaj niejawny × jawny — ta sama regula (rodzaj pola = rodzaj jawny)."""
    with pytest.raises(OdmowaKatalogu) as exc:
        _konwerter(harmonic_spectrum_percent={1: 1.0}, harmonic_spectrum_kind=rodzaj)
    assert exc.value.kod == "KAT-T-015"
    with pytest.raises(OdmowaKatalogu) as exc:
        _konwerter(harmonic_spectrum_percent={51: 1.0}, harmonic_spectrum_kind=rodzaj)
    assert exc.value.kod == "KAT-T-015"
    with pytest.raises(OdmowaKatalogu) as exc:
        _konwerter(harmonic_spectrum_percent={5: 100.5}, harmonic_spectrum_kind=rodzaj)
    assert exc.value.kod == "KAT-T-016"
    poprawny = _konwerter(
        harmonic_spectrum_percent={2: 1.0, 50: 0.1}, harmonic_spectrum_kind=rodzaj
    )
    assert poprawny.rodzaj_widma_harmonicznych == WIDMO_PRADU_RZEDY_CALKOWITE


def test_rodzaj_bez_widma_i_rodzaj_nieznany_to_odmowa_pary() -> None:
    with pytest.raises(OdmowaKatalogu) as exc:
        _konwerter(harmonic_spectrum_kind=WIDMO_PRADU_RZEDY_CALKOWITE)
    assert exc.value.kod == "KAT-T-009"
    with pytest.raises(OdmowaKatalogu) as exc:
        _konwerter(
            harmonic_spectrum_percent={5: 1.0},
            harmonic_spectrum_kind="INTERHARMONICZNE",
        )
    assert exc.value.kod == "KAT-T-009"


def test_brak_widma_to_brak_rodzaju() -> None:
    assert _konwerter().rodzaj_widma_harmonicznych is None


def test_rundtrip_emituje_rodzaj_wylacznie_gdy_zapisany() -> None:
    bez = _konwerter(harmonic_spectrum_percent={5: 1.0})
    assert "harmonic_spectrum_kind" not in bez.to_dict()
    assert ConverterType.from_dict(bez.to_dict()) == bez
    z = _konwerter(
        harmonic_spectrum_percent={5: 1.0},
        harmonic_spectrum_kind=WIDMO_PRADU_RZEDY_CALKOWITE,
    )
    assert z.to_dict()["harmonic_spectrum_kind"] == WIDMO_PRADU_RZEDY_CALKOWITE
    assert ConverterType.from_dict(z.to_dict()) == z


def test_odcisk_katalogu_bez_zmian_wobec_bazy() -> None:
    """Pin: pole addytywne `harmonic_spectrum_kind` nie zmienia odcisku biblioteki."""
    assert "harmonic_spectrum_kind" in POLA_ADDYTYWNE_POMIJANE_GDY_BRAK
    assert odcisk_katalogu_domyslnego() == ODCISK_KATALOGU_BAZY


def test_jawny_rodzaj_zmienia_odcisk() -> None:
    """Druga strona pary: rekord z WYPELNIONYM polem zmienia odcisk katalogu."""
    katalog = get_default_mv_catalog()
    identyfikator, rekord = next(iter(sorted(katalog.converter_types.items())))
    zmieniony_rekord = dataclasses.replace(
        rekord,
        harmonic_spectrum_percent={5: 1.0},
        harmonic_spectrum_kind=WIDMO_PRADU_RZEDY_CALKOWITE,
    )
    tylko_widmo = dataclasses.replace(rekord, harmonic_spectrum_percent={5: 1.0})
    z_rodzajem = dataclasses.replace(
        katalog,
        converter_types={**katalog.converter_types, identyfikator: zmieniony_rekord},
    )
    bez_rodzaju = dataclasses.replace(
        katalog, converter_types={**katalog.converter_types, identyfikator: tylko_widmo}
    )
    assert odcisk_katalogu(z_rodzajem) != odcisk_katalogu(bez_rodzaju)
