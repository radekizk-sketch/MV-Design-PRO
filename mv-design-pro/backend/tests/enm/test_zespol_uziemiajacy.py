"""Zespół uziemiający SN → punkt neutralny modelu (karta KATALOG-APARATURA-WN pkt 5).

Cechy iloczynu:

* wariant zespołu ∈ {dławik, dławik ‖ rezystor, rezystor, brak decyzji projektanta
  (propozycja wg ENEA §16, ESTIMATED)} × charakter sieci ∈ {kablowa, kablowo-napowietrzna,
  nieokreślony} × napięcie sieci ∈ typoszereg 6/10/15/20/30 kV;
* odwzorowanie → operacja ``add_grid_source_sn`` (``grounding`` + ``zero_sequence``) →
  zwarcie 1F na szynach SN (bieg kanoniczny ``short_circuit_sn``) — prąd zwarcia
  doziemnego wynika z założonego elementu punktu neutralnego (I ≈ c·U_f/|Z_N|);
* odmowy nazwane (napięcie spoza SN, pozycja nieznana, pozycja innego napięcia, charakter
  spoza słownika) i determinizm.
"""

from __future__ import annotations

import math
from typing import Any

import pytest
from enm.canonical_analysis import create_run, execute_run, reset_canonical_runs
from enm.domain_operations import execute_domain_operation
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader
from enm.store import reset_enm_store, set_enm
from enm.zespol_uziemiajacy import (
    KOD_CHARAKTER_NIEZNANY,
    KOD_NAPIECIE_NIEZGODNE,
    KOD_NAPIECIE_SPOZA_SN,
    KOD_POZYCJA_NIEZNANA,
    OdmowaOdwzorowaniaZU,
    odwzoruj_zespol_uziemiajacy,
)
from network_model.catalog.audit2_catalogs import (
    NAPIECIA_SIECI_ZESPOLOW_KV,
    WARIANTY_ZESPOLU_UZIEMIAJACEGO,
    zespol_uziemiajacy,
)
from network_model.pochodne import (
    impedancja_punktu_neutralnego_ohm,
    kv_na_v,
)

ZRODLO_GPZ_15KV = "src-gpz-15kv-250mva-rx010"


@pytest.fixture(autouse=True)
def _czysty_stan():
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


@pytest.mark.parametrize("napiecie_kv", NAPIECIA_SIECI_ZESPOLOW_KV)
@pytest.mark.parametrize("wariant", WARIANTY_ZESPOLU_UZIEMIAJACEGO)
def test_pozycja_katalogu_odwzorowana_na_jeden_nosnik(wariant: str, napiecie_kv: float) -> None:
    pozycja = zespol_uziemiajacy(napiecie_kv, wariant)  # type: ignore[arg-type]
    wynik = odwzoruj_zespol_uziemiajacy(pozycja.id, napiecie_sieci_kv=napiecie_kv)
    assert wynik.propozycja is False
    assert wynik.neutral_grounding.type == pozycja.grounding_type
    assert wynik.neutral_grounding.r_ohm == pozycja.r_ohm
    assert wynik.neutral_grounding.x_ohm == pozycja.x_ohm
    # Z0 widziane z szyn SN = Z_T0 + 3·Z_N; składowa 3·Z_N dominuje (Z_T0 robocze, małe).
    z_n = impedancja_punktu_neutralnego_ohm(pozycja.r_ohm, pozycja.x_ohm)
    assert wynik.r0_ohm is not None and wynik.x0_ohm is not None
    assert wynik.r0_ohm >= 3 * z_n.real and wynik.x0_ohm >= 3 * z_n.imag
    # Impedancja zerowa transformatora uziemiającego — zawsze wartość robocza ESTIMATED.
    assert len(wynik.dane_przyjete) >= 2
    assert {d.jakosc.value for d in wynik.dane_przyjete} == {"ESTIMATED"}
    slownik = wynik.to_dict()
    assert slownik["grounding"]["type"] == pozycja.grounding_type
    assert slownik["zero_sequence"] == {
        "enabled": True,
        "r0_ohm": wynik.r0_ohm,
        "x0_ohm": wynik.x0_ohm,
    }
    assert "ENEA" in slownik["podstawa_pl"] and "§16" in slownik["podstawa_pl"]


@pytest.mark.parametrize(
    ("charakter", "typ"),
    [
        ("KABLOWA", "resistor_grounded"),
        ("KABLOWO_NAPOWIETRZNA", "petersen_coil"),
        (None, "petersen_coil"),
    ],
)
def test_brak_decyzji_to_propozycja_estimated(charakter: str | None, typ: str) -> None:
    wynik = odwzoruj_zespol_uziemiajacy(None, napiecie_sieci_kv=15.0, charakter_sieci=charakter)
    assert wynik.propozycja is True
    assert wynik.neutral_grounding.type == typ
    pierwsza = wynik.dane_przyjete[0]
    assert pierwsza.jakosc.value == "ESTIMATED"
    assert "ENEA" in pierwsza.powod_pl and "wartość robocza" in pierwsza.powod_pl


@pytest.mark.parametrize(
    ("pozycja", "napiecie", "charakter", "kod"),
    [
        (None, 110.0, None, KOD_NAPIECIE_SPOZA_SN),
        (None, 0.4, None, KOD_NAPIECIE_SPOZA_SN),
        ("zu-nieistniejacy", 15.0, None, KOD_POZYCJA_NIEZNANA),
        ("zu_rezystor_500a_20kv", 15.0, None, KOD_NAPIECIE_NIEZGODNE),
        (None, 15.0, "NAPOWIETRZNA", KOD_CHARAKTER_NIEZNANY),
    ],
)
def test_odmowy_nazwane(
    pozycja: str | None, napiecie: float, charakter: str | None, kod: str
) -> None:
    with pytest.raises(OdmowaOdwzorowaniaZU) as odmowa:
        odwzoruj_zespol_uziemiajacy(pozycja, napiecie_sieci_kv=napiecie, charakter_sieci=charakter)
    assert odmowa.value.kod == kod
    assert kod not in str(odmowa.value)


def _gpz_z_zespolem(odwzorowanie: dict[str, Any]) -> dict[str, Any]:
    enm = EnergyNetworkModel(
        header=ENMHeader(name="zu", defaults=ENMDefaults(sn_nominal_kv=15.0))
    ).model_dump(mode="json")
    wynik = execute_domain_operation(
        enm,
        "add_grid_source_sn",
        {
            "voltage_kv": 15.0,
            "catalog_ref": ZRODLO_GPZ_15KV,
            "grounding": odwzorowanie["grounding"],
            "zero_sequence": odwzorowanie["zero_sequence"],
        },
    )
    assert wynik.get("error") is None, wynik.get("error")
    return wynik["snapshot"]


def _ik1_na_szynie_sn(migawka: dict[str, Any], klucz: str) -> float:
    model = EnergyNetworkModel.model_validate(migawka)
    szyna = model.sources[0].bus_ref
    set_enm(klucz, model)
    bieg = execute_run(
        create_run(
            case_id=klucz,
            klucz_twin=klucz,
            analysis_type="short_circuit_sn",
            options={
                "fault_type": "1F",
                "location": {"element_ref": szyna, "location_type": "BUS", "position": None},
            },
        ).id
    )
    assert bieg.status == "FINISHED", bieg.error_message
    (wiersz,) = bieg.raw_result["results"]
    assert wiersz["short_circuit_type"] == "1F"
    return float(wiersz["ikss_a"])


@pytest.mark.parametrize(
    "pozycja",
    [
        "zu_dlawik_400a_15kv",
        "zu_dlawik_400a_rezystor_40a_15kv",
        "zu_rezystor_500a_15kv",
        None,
    ],
)
def test_zwarcie_1f_sn_wynika_z_elementu_punktu_neutralnego(pozycja: str | None) -> None:
    """Prąd zwarcia doziemnego sieci uziemionej przez zespół: impedancja punktu neutralnego
    (3·Z_N) dominuje nad Z1 + Z2 + Z_T0, więc I″k1 ≈ c·U_f/|Z_N| — prąd definiujący
    wariantu (400 A dławika, √(400² + 40²) A układu równoległego, 500 A rezystora)
    pomnożony przez c_max = 1,1 (IEC 60909-0 tab. 1). Margines −15 %/+5 % obejmuje
    impedancje Z1/Z2 równoważnika i roboczą Z_T0."""
    odwzorowanie = odwzoruj_zespol_uziemiajacy(pozycja, napiecie_sieci_kv=15.0)
    ik1 = _ik1_na_szynie_sn(_gpz_z_zespolem(odwzorowanie.to_dict()), f"zu-{pozycja}")
    z_n = impedancja_punktu_neutralnego_ohm(
        odwzorowanie.neutral_grounding.r_ohm, odwzorowanie.neutral_grounding.x_ohm
    )
    i_definiujacy = kv_na_v(15.0) / math.sqrt(3.0) / abs(z_n)
    assert 0.85 <= ik1 / (1.1 * i_definiujacy) <= 1.05, (ik1, i_definiujacy)


def test_determinizm_odwzorowania() -> None:
    a = odwzoruj_zespol_uziemiajacy(None, napiecie_sieci_kv=20.0, charakter_sieci="KABLOWA")
    b = odwzoruj_zespol_uziemiajacy(None, napiecie_sieci_kv=20.0, charakter_sieci="KABLOWA")
    assert a.to_dict() == b.to_dict()
