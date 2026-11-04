"""Karta pola: jednostka progu prądowego nastawy niesie stronę przekładnika (PZ-09).

Karta BIEG-ZABEZPIECZEN-Z-MODELU: próg prądowy jest zapisywany z jawną stroną przekładnika
(nastawa ``jednostka_progu``). Karta pola pokazywała „A" bez strony — 1,5 A wtórne i 1,5 A
pierwotne wyglądały tak samo.

Karta OCHRONA-JEDNO-ZRODLO: karta pola czyta TEN SAM sterownik co ocena (``zabezpieczenie``
odczytu pola = rekord ``protection_assignments``), a etykietę strony bierze z jednego słownika
wartości wyboru rejestru funkcji (``ETYKIETY_WARTOSCI_WYBORU``, lustro
``slownikFunkcjiEaz.json``) — tego samego, z którego mówi ocena. Iloczyn cech:
{strona: wtórna, pierwotna, niezadeklarowana} × {funkcja: I> (51), I>> (50)}.
"""

from __future__ import annotations

import pytest
from application.field_read_model import build_field_read_model
from enm.models import Bay, Bus, EnergyNetworkModel, ENMHeader, Substation
from network_model.catalog.funkcje_eaz import (
    ETYKIETY_WARTOSCI_WYBORU,
    FUNKCJE_EAZ,
    JEDNOSTKI_PROGU_PRADOWEGO,
)

from tests.utils.sterownik import sterownik, stopien

POLE = "pole/01"


def _enm(kod: str, strona: str | None) -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(name="t"),
        buses=[Bus(ref_id="sn", name="SN", voltage_kv=15.0)],
        substations=[Substation(ref_id="stn", name="S", station_type="mv_lv", bus_refs=["sn"])],
        bays=[Bay(ref_id=POLE, name="P-01", bay_role="OUT", substation_ref="stn", bus_ref="sn")],
        protection_assignments=[
            sterownik(
                bay_ref=POLE,
                stopnie=[stopien(kod, prog=1.5, jednostka_progu=strona, krzywa="DT", zwloka_s=0.3)],
            )
        ],
    )


@pytest.mark.parametrize("kod", ["51", "50"])
@pytest.mark.parametrize("strona", ["A_WTORNY", "A_PIERWOTNY"])
def test_karta_pola_niesie_strone_przekladnika_z_modelu(kod: str, strona: str | None) -> None:
    odczyt = build_field_read_model("jp", _enm(kod, strona))
    (pole,) = (p for p in odczyt["fields"] if p["bay_ref"] == POLE)
    zabezpieczenie = pole["canonical_model"]["base_model"]["zabezpieczenie"]
    (grupa,) = zabezpieczenie["grupy_nastaw"]
    (wpis,) = grupa["funkcje"]
    nastawy = {n["klucz"]: n["wartosc"] for n in wpis["nastawy"]}
    assert nastawy["prog"] == 1.5
    assert nastawy["jednostka_progu"] == strona


@pytest.mark.parametrize("kod", ["51", "50"])
def test_prog_bez_strony_przekladnika_nie_wchodzi_do_modelu(kod: str) -> None:
    """Strona niezadeklarowana NIE jest zgadywana: model odrzuca próg bez jednostki, więc karta
    pola nigdy nie pokazuje gołego „A"."""
    with pytest.raises(ValueError, match="wymaga jednostki"):
        _enm(kod, None)


def test_etykiety_stron_przekladnika_z_jednego_slownika_rejestru() -> None:
    for kod in ("50", "51", "50N", "51N", "67", "67N"):
        schemat = {n.klucz: n for n in FUNKCJE_EAZ[kod].nastawy}
        assert schemat["jednostka_progu"].wartosci == JEDNOSTKI_PROGU_PRADOWEGO
    etykiety = {j: ETYKIETY_WARTOSCI_WYBORU[j] for j in JEDNOSTKI_PROGU_PRADOWEGO}
    assert "wtórnej" in etykiety["A_WTORNY"] and "pierwotnej" in etykiety["A_PIERWOTNY"]
    assert len(set(etykiety.values())) == 2
