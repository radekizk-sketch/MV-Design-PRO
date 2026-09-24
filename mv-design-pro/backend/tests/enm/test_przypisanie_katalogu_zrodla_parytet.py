"""Jedna tabliczka źródła przekształtnikowego: tworzenie ≡ przypisanie typu (karta AB-H0 D).

DEFEKT (zmierzony 2026-09-23 na karcie referencyjnej PV): `assign_catalog_to_element`
materializował dla generatora GOŁY kontrakt przestrzeni (`s_n_kva`/`p_max_kw` w kW), a tor
tworzenia (`add_converter_source`, DER-SN) — tabliczkę `_build_converter_materialized_params`
(`sn_mva`, `pmax_mw`, `k_sc`, certyfikat PTPiREE). Po przypisaniu TEGO SAMEGO typu generator
tracił `sn_mva` i certyfikat; analizy czytające tabliczkę elementu (siła sieci, migotanie)
maskowały to odczytem zapasowym z katalogu statycznego, skasowanym w tej samej karcie.

Domknięcie klasy (karta integracyjna AB-H0 §0 pkt 2): tor STACYJNY (`nn_block` operacji
budujących stację, `_materialize_nn_source`) składał WŁASNĄ tabliczkę i gubił względem toru
atomowego `k_sc`, `control_mode`, moce kW i komplet `ptpiree_*`; przypisanie typu nie miało
żadnej z kontroli toru tworzenia (rodzaj, napięcie szyny, moc transformatora stacji).

ILOCZYN CECH: tor utworzenia (atomowy `add_converter_source`, stacyjny `nn_block`, DER-SN,
`fw_pmsg`/`fw_dfig`/`fw_scig` z importu) × technologia (PV, BESS, wiatr) × przypisanie (ten
sam typ, inny typ tej samej przestrzeni, typ niezgodny rodzajem / napięciem / mocą
transformatora → odmowa nazwana, model bez zmian) × pola spoza typu (pakiet baterii BESS,
pola stacji). Kontrola mocy (nastawa ≤ moc znamionowa, moc transformatora — decyzja O-53)
ma własny iloczyn cech wszystkich torów: `tests/enm/test_kontrola_mocy_zrodla_o53.py`.
Pozycja „innego typu" magazynu to 2 MW (dawniej 1 MW): generator toru ma nastawę 2 MW z
karty, a przypisanie typu o mniejszej mocy jest dziś odmową nazwaną (nastawa ponad moc
znamionową instalacji).
"""

from __future__ import annotations

from typing import Any

import pytest
from enm.domain_operations import execute_domain_operation
from enm.hash import compute_enm_hash
from enm.models import EnergyNetworkModel

from tests.enm import test_brama_katalogowa_operacji_v2 as h
from tests.enm import test_karty_widmowe_modelu as km

TORY_Z_TYPEM = tuple(tor for tor in km.TORY if tor.typ is not None)


def _przypisz(snapshot: dict[str, Any], ref: str, typ: str, przestrzen: str) -> dict[str, Any]:
    wynik = execute_domain_operation(
        snapshot,
        "assign_catalog_to_element",
        {"element_ref": ref, "catalog_item_id": typ, "catalog_namespace": przestrzen},
    )
    assert not wynik.get("error"), (wynik.get("error_code"), wynik.get("error"))
    return dict(wynik["snapshot"])


@pytest.mark.parametrize("tor", TORY_Z_TYPEM, ids=lambda t: t.nazwa)
def test_przypisanie_tego_samego_typu_daje_te_sama_tabliczke(tor: km.Tor) -> None:
    snapshot = km._model(tor)
    generator = km._generator(snapshot)
    po = km._generator(
        _przypisz(
            snapshot,
            generator["ref_id"],
            str(generator["catalog_ref"]),
            str(generator["catalog_namespace"]),
        )
    )
    assert po["materialized_params"] == generator["materialized_params"]
    assert po["materialized_params"].get("sn_mva") is not None


@pytest.mark.parametrize(
    ("tor", "inny_typ"),
    [
        (km.TORY[0], "conv-pv-nn-0p5mw-0p8kv"),
        (km.TORY[1], "conv-bess-nn-2mw-0p69kv"),
    ],
    ids=["pv", "bess"],
)
def test_przypisanie_innego_typu_rowne_utworzeniu_z_tego_typu(tor: km.Tor, inny_typ: str) -> None:
    """Tabliczka po przypisaniu typu B = tabliczka źródła utworzonego od razu z typu B."""
    snapshot = km._model(tor)
    generator = km._generator(snapshot)
    przestrzen = str(generator["catalog_namespace"])
    po = km._generator(_przypisz(snapshot, generator["ref_id"], inny_typ, przestrzen))
    technologia = "PV" if przestrzen == "ZRODLO_NN_PV" else "BESS"
    napiecie = 0.8 if technologia == "PV" else 0.69
    trafo = km.TRAFO_0P8 if technologia == "PV" else km.TRAFO_0P69
    z_typu_b = km._generator(km._zrodlo_z_karty(technologia, inny_typ, napiecie, trafo))
    assert po["materialized_params"] == z_typu_b["materialized_params"]
    assert po["catalog_ref"] == inny_typ


def test_przypisanie_typu_magazynu_zachowuje_pakiet_baterii() -> None:
    """Pakiet baterii to osobny aparat (`BATERIA_BESS`), nie pole typu PCS — przypisanie
    innej pozycji przekształtnika go nie kasuje (gołe przypisanie kasowało go w całości)."""
    snapshot = km._siec(0.69, km.TRAFO_0P69)
    snapshot = h._wykonaj(
        snapshot,
        "add_converter_source",
        {
            "source_technology": "BESS",
            "connection_variant": "nn_side",
            "station_ref": h._stacja_ref(snapshot),
            "bus_nn_ref": km._szyna_nn(snapshot, 0.69),
            "source_name": "Magazyn",
            "catalog_ref": km.TYP_BESS,
            "battery_catalog_ref": "bess_bat_lfp_2880kwh_1230vdc",
        },
    )
    generator = km._generator(snapshot)
    bateria = {k: generator["materialized_params"][k] for k in ("battery_catalog_ref", "battery")}
    po = km._generator(
        _przypisz(snapshot, generator["ref_id"], "conv-bess-nn-2mw-0p69kv", "ZRODLO_NN_BESS")
    )
    assert {k: po["materialized_params"].get(k) for k in bateria} == bateria


# ---------------------------------------------------------------------------
# Tor stacyjny ≡ tor atomowy ≡ przypisanie typu (PV / BESS / wiatr)
# ---------------------------------------------------------------------------

#: Pola, które tor stacyjny dokłada do tabliczki (element stacji, nie pozycja typu).
POLA_STACJI = frozenset({"station_transformer_ref", "protection_intent"})

#: (konfiguracja `nn_block`, typ, napięcie nN stacji, transformator stacji, indeks toru
#: atomowego w `km.TORY`) — ta sama pozycja katalogu w obu torach tworzenia.
TORY_STACYJNE = (
    ("PV_INVERTER", km.TYP_PV, 0.8, km.TRAFO_0P8, 0),
    ("BESS_INVERTER", km.TYP_BESS, 0.69, km.TRAFO_0P69, 1),
    ("FW_INVERTER", h.REF_FW, 0.4, h.REF_TRAFO, 2),
)


def _siec_stacyjna(konfiguracja: str, typ: str, napiecie_kv: float, trafo: str) -> dict:
    snapshot, payload = _przed_stacja(konfiguracja, typ, napiecie_kv, trafo)
    return h._wykonaj(snapshot, "append_station_on_endpoint", payload)


def _przed_stacja(
    konfiguracja: str, typ: str, napiecie_kv: float, trafo: str
) -> tuple[dict[str, Any], dict[str, Any]]:
    """GPZ → kabel 500 m oraz payload stacji końcowej z blokiem nN niosącym źródło."""
    snapshot = h._wykonaj(
        h._pusty_enm(),
        "add_grid_source_sn",
        {
            "voltage_kv": 15.0,
            "sk3_mva": 250.0,
            "catalog_ref": h.REF_ZRODLO,
            "hv_voltage_kv": 110.0,
            "transformer_sn_mva": 25.0,
        },
    )
    snapshot = h._wykonaj(
        snapshot,
        "continue_trunk_segment_sn",
        {"segment": {"rodzaj": "KABEL", "dlugosc_m": 500.0, "catalog_ref": h.REF_KABEL}},
    )
    payload = h._payload_stacji(
        str(snapshot["branches"][-1]["to_bus_ref"]),
        h._blok_nn(nn_configuration=konfiguracja, source_converter_catalog_ref=typ),
    )
    payload["nn_voltage_kv"] = napiecie_kv
    payload["transformer"]["transformer_catalog_ref"] = trafo
    return snapshot, payload


@pytest.mark.parametrize(
    ("konfiguracja", "typ", "napiecie_kv", "trafo", "indeks_toru"),
    TORY_STACYJNE,
    ids=[t[0] for t in TORY_STACYJNE],
)
def test_tor_stacyjny_atomowy_i_przypisanie_daja_te_sama_tabliczke(
    konfiguracja: str, typ: str, napiecie_kv: float, trafo: str, indeks_toru: int
) -> None:
    stacyjny = km._generator(_siec_stacyjna(konfiguracja, typ, napiecie_kv, trafo))
    atomowy = km._generator(km._model(km.TORY[indeks_toru]))
    tabliczka_stacji = {
        k: v for k, v in stacyjny["materialized_params"].items() if k not in POLA_STACJI
    }
    assert tabliczka_stacji == atomowy["materialized_params"]
    # Pola, które tor stacyjny dotąd gubił, są obecne (o ile pozycja je niesie).
    for pole in ("k_sc", "sn_mva", "pmax_mw", "un_kv"):
        assert pole in tabliczka_stacji, pole
    assert {k for k in atomowy["materialized_params"] if k.startswith("ptpiree_")} == {
        k for k in tabliczka_stacji if k.startswith("ptpiree_")
    }
    # Przypisanie tego samego typu generatorowi stacyjnemu: tabliczka bez zmian,
    # pola stacji zachowane.
    zwiazany = km._generator(
        _przypisz(
            _siec_stacyjna(konfiguracja, typ, napiecie_kv, trafo),
            stacyjny["ref_id"],
            typ,
            str(stacyjny["catalog_namespace"]),
        )
    )
    assert zwiazany["materialized_params"] == stacyjny["materialized_params"]


def test_tor_stacyjny_pv_z_karty_niesie_certyfikat_ptpiree() -> None:
    """PIN NA DEFEKT: źródło stacyjne z certyfikowanym falownikiem nie niosło dowodu."""
    stacyjny = km._generator(_siec_stacyjna("PV_INVERTER", km.TYP_PV, 0.8, km.TRAFO_0P8))
    assert stacyjny["materialized_params"].get("ptpiree_status")
    assert stacyjny["materialized_params"].get("ptpiree_certificate_ref")


# ---------------------------------------------------------------------------
# Przypisanie typu — te same kontrole co tor tworzenia (odmowa nazwana, model bez zmian)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("typ", "przestrzen", "kod"),
    [
        # Rodzaj: pozycja magazynu dla generatora PV.
        ("conv-bess-nn-1mw-0p69kv", "ZRODLO_NN_BESS", "converter.rodzaj_niezgodny"),
        # Napięcie: falownik PV 0,4 kV na szynie 0,8 kV.
        ("conv-pv-nn-0p5mw-0p4kv", "ZRODLO_NN_PV", "converter.voltage_mismatch"),
        # Moc: falownik PV 5 MW na stacji z transformatorem 2,5 MVA.
        ("conv-pv-nn-5mw-0p8kv", "ZRODLO_NN_PV", "converter.transformer_capacity_exceeded"),
    ],
    ids=["rodzaj", "napiecie", "moc_transformatora"],
)
def test_przypisanie_typu_niezgodnego_z_torem_tworzenia_jest_odmowa(
    typ: str, przestrzen: str, kod: str
) -> None:
    snapshot = km._model(km.TORY[0])
    generator = km._generator(snapshot)
    odcisk_przed = compute_enm_hash(EnergyNetworkModel.model_validate(snapshot))
    wynik = execute_domain_operation(
        snapshot,
        "assign_catalog_to_element",
        {
            "element_ref": generator["ref_id"],
            "catalog_item_id": typ,
            "catalog_namespace": przestrzen,
        },
    )
    assert wynik.get("error_code") == kod, (wynik.get("error_code"), wynik.get("error"))
    assert compute_enm_hash(EnergyNetworkModel.model_validate(snapshot)) == odcisk_przed
    # Ten sam typ torem tworzenia: ta sama odmowa (parytet werdyktu).
    technologia = "PV" if przestrzen == "ZRODLO_NN_PV" else "BESS"
    if kod != "converter.rodzaj_niezgodny":
        with pytest.raises(AssertionError, match=kod):
            km._zrodlo_z_karty(technologia, typ, 0.8, km.TRAFO_0P8)


def test_przypisanie_do_generatora_wiatrowego_pozycji_pv_jest_odmowa() -> None:
    """Przestrzeń CONVERTER: rodzaj pozycji wynika z `ConverterType.kind`."""
    snapshot = km._model(km.TORY[2])
    generator = km._generator(snapshot)
    wynik = execute_domain_operation(
        snapshot,
        "assign_catalog_to_element",
        {
            "element_ref": generator["ref_id"],
            "catalog_item_id": "conv-pv-nn-0p5mw-0p4kv",
            "catalog_namespace": "CONVERTER",
        },
    )
    assert wynik.get("error_code") == "converter.rodzaj_niezgodny", wynik.get("error")
