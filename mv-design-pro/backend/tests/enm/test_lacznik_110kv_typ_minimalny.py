"""Łącznik topologii zasilania 110 kV — typ minimalny i reguła wiązania katalogowego.

Karta KATALOG-APARATURA-WN w zakresie po decyzji właściciela i architekta 2026-10-22:
strona 110 kV jest funkcjonalną granicą zasilania GPZ, więc katalog niesie dla niej po
jednym typie łącznika na rodzaj (wyłącznik ``sw-cb-110kv``, odłącznik ``sw-ds-110kv``) —
U_m 123 kV, dane ESTIMATED z jawnym założeniem, bez danych wytrzymałościowych — wyłącznie
po to, by gałąź łącznika 110 kV w modelu miała typ katalogowy i stan łączeniowy.

Cechy iloczynu:

* szyna łącznika ∈ {SN 15 kV, 110 kV} × wiązanie ∈ {typ z katalogu, brak typu} × droga
  wejścia do modelu ∈ {operacja ``add_sn_bay``, model zewnętrzny (gałąź bez ``catalog_ref``)}
  — ostrzeżenie ``apparatus.hv_switch_catalog_missing`` wyłącznie dla łącznika 110 kV bez
  typu, z obu dróg;
* rodzaj typu ∈ {wyłącznik, odłącznik} — wiązanie gałęzi przez operację tworzącą i przez
  ``assign_catalog_to_element`` (zmiana typu), materializacja U_n z katalogu;
* typ minimalny: dokładnie dwie pozycje 110 kV w katalogu, każde pole danych ESTIMATED
  z podstawą i założeniem (rekord łącznika i jego projekcja APARAT_SN);
* determinizm zgłoszeń walidatora.
"""

from __future__ import annotations

import copy
from typing import Any

import pytest
from enm.domain_operations import execute_domain_operation
from enm.katalog_projektu import katalog_biezacy
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader
from enm.validator import ENMValidator

from tests.reference_networks.budowa_przez_api import TRANSFORMATOR_WN_SN, wiazanie

WYLACZNIK_110KV = "sw-cb-110kv"
ODLACZNIK_110KV = "sw-ds-110kv"
TYPY_110KV = (WYLACZNIK_110KV, ODLACZNIK_110KV)
KOD = "apparatus.hv_switch_catalog_missing"


def _op(enm: dict[str, Any], nazwa: str, ladunek: dict[str, Any]) -> dict[str, Any]:
    return execute_domain_operation(enm, nazwa, ladunek)


def _ok(wynik: dict[str, Any]) -> dict[str, Any]:
    assert wynik.get("error") in (None, ""), (wynik.get("error_code"), wynik.get("error"))
    return wynik["snapshot"]


def _gpz() -> dict[str, Any]:
    """GPZ z równoważnikiem po stronie 110 kV — szyna 110 kV w modelu jako granica zasilania."""
    enm = EnergyNetworkModel(
        header=ENMHeader(name="lacznik-110kv", defaults=ENMDefaults(sn_nominal_kv=15.0))
    ).model_dump(mode="json")
    return _ok(
        _op(
            enm,
            "add_grid_source_sn",
            {
                "voltage_kv": 15.0,
                "manual_equivalent": {
                    "short_circuit_input_side": "HV_110",
                    "hv_voltage_kv": 110.0,
                    "sk3_hv_mva": 3000.0,
                    "rx_ratio": 0.1,
                },
                "sections_count": 1,
                "transformer_count": 1,
                "transformer_catalog_binding": wiazanie("TRAFO_SN_NN", TRANSFORMATOR_WN_SN),
            },
        )
    )


def _szyna(enm: dict[str, Any], napiecie_kv: float) -> str:
    napiecia = {b["ref_id"]: b.get("voltage_kv") for b in enm["buses"]}
    stacja = enm["substations"][0]
    return next(b for b in stacja["bus_refs"] if napiecia.get(b) == napiecie_kv)


def _galaz(enm: dict[str, Any], ref: str) -> dict[str, Any]:
    return next(g for g in enm["branches"] if g["ref_id"] == ref)


def _dodaj_lacznik(
    enm: dict[str, Any], napiecie_kv: float, catalog_ref: str | None
) -> tuple[dict[str, Any], str]:
    """Pole z łącznikiem na szynie o napięciu ``napiecie_kv``; zwraca model i ref gałęzi."""
    przed = {g["ref_id"] for g in enm["branches"]}
    ladunek: dict[str, Any] = {
        "bus_ref": _szyna(enm, napiecie_kv),
        "station_ref": enm["substations"][0]["ref_id"],
        "bay_role": "IN",
    }
    if catalog_ref is not None:
        ladunek["catalog_ref"] = catalog_ref
    po = _ok(_op(enm, "add_sn_bay", ladunek))
    (nowa,) = (g["ref_id"] for g in po["branches"] if g["ref_id"] not in przed)
    return po, nowa


def _zgloszenia(enm: dict[str, Any]) -> list[Any]:
    wynik = ENMValidator().validate(EnergyNetworkModel.model_validate(enm))
    return [i for i in wynik.issues if i.code == KOD]


def _typ_sn() -> str:
    return next(
        r
        for r, t in sorted(katalog_biezacy().mv_apparatus_types.items())
        if t.device_kind == "WYLACZNIK" and t.u_n_kv == 17.5
    )


@pytest.fixture(scope="module")
def gpz() -> dict[str, Any]:
    return _gpz()


# ---------------------------------------------------------------------------
# Typ minimalny w katalogu
# ---------------------------------------------------------------------------


def test_katalog_110kv_to_wylacznie_dwa_typy_minimalne() -> None:
    katalog = katalog_biezacy()
    aparaty = {r: t.device_kind for r, t in katalog.mv_apparatus_types.items() if t.u_n_kv > 40.5}
    rekordy = sorted(r for r, t in katalog.switch_equipment_types.items() if t.un_kv > 40.5)
    assert aparaty == {WYLACZNIK_110KV: "WYLACZNIK", ODLACZNIK_110KV: "ODLACZNIK"}
    assert rekordy == sorted(TYPY_110KV)
    # Strona 110 kV to granica zasilania: żadnych ograniczników ani przekładników 110 kV.
    assert not [r for r, t in katalog.surge_arrester_types.items() if (t.u_m_kv or 0) > 40.5]
    assert not [r for r, t in katalog.vt_types.items() if t.ratio_primary_v > 40500.0]


@pytest.mark.parametrize("ref", TYPY_110KV)
def test_typ_minimalny_estimated_bez_danych_wytrzymalosciowych(ref: str) -> None:
    katalog = katalog_biezacy()
    rekord = katalog.switch_equipment_types[ref]
    aparat = katalog.mv_apparatus_types[ref]
    # U_m 123 kV — para IEC 60038 sieci 110 kV; U_r łącznika = U_m (PN-EN 62271-1 p. 5.2).
    assert rekord.u_m_kv == 123.0 and rekord.un_kv == 123.0 and aparat.u_n_kv == 123.0
    assert rekord.manufacturer is None and aparat.manufacturer is None
    assert rekord.verification_status == "REFERENCYJNY"
    # Bez danych wytrzymałościowych: tylko tyle danych, ile wymaga wiązanie i stan.
    # Brak danej z karty to `None`, nigdy 0 kA (bramka KAT-T-048) — rekord i projekcja.
    assert rekord.ik_ka is None and rekord.icw_ka is None and rekord.i_cu_ka is None
    assert aparat.breaking_capacity_ka is None and aparat.i_th_ka is None
    assert set(rekord.card_field_status or {}) == {"un_kv", "u_m_kv", "in_a"}
    assert set(aparat.card_field_status or {}) == {"u_n_kv", "i_n_a"}
    for status in (rekord.card_field_status, aparat.card_field_status):
        assert status
        for pole, wpis in status.items():
            assert wpis["field_name"] == pole
            assert wpis["quality"] == "ESTIMATED"
            assert wpis["source_ref"] and wpis["note"]


# ---------------------------------------------------------------------------
# Wiązanie gałęzi łącznika 110 kV z typem
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("ref", TYPY_110KV)
def test_galaz_lacznika_110kv_wiaze_sie_z_typem_minimalnym(gpz: dict[str, Any], ref: str) -> None:
    enm, lacznik = _dodaj_lacznik(gpz, 110.0, ref)
    galaz = _galaz(enm, lacznik)
    assert galaz["catalog_ref"] == ref
    assert galaz["catalog_namespace"] == "APARAT_SN"
    oczekiwany_typ = "breaker" if ref == WYLACZNIK_110KV else "disconnector"
    assert galaz["type"] == oczekiwany_typ
    assert _zgloszenia(enm) == []

    # Zmiana typu na drugi rodzaj — ta sama przestrzeń katalogu, ta sama gałąź.
    inny = next(t for t in TYPY_110KV if t != ref)
    po = _ok(
        _op(
            enm,
            "assign_catalog_to_element",
            {"element_ref": lacznik, "catalog_item_id": inny, "catalog_namespace": "APARAT_SN"},
        )
    )
    assert _galaz(po, lacznik)["catalog_ref"] == inny
    assert _zgloszenia(po) == []


# ---------------------------------------------------------------------------
# Reguła wiązania: łącznik 110 kV bez typu nie jest przyjmowany po cichu
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("droga", ["operacja", "model_zewnetrzny"])
@pytest.mark.parametrize("wiazanie_typu", ["typ", "brak_typu"])
@pytest.mark.parametrize("napiecie_kv", [15.0, 110.0])
def test_lacznik_bez_typu_zglaszany_tylko_na_110kv(
    gpz: dict[str, Any], napiecie_kv: float, wiazanie_typu: str, droga: str
) -> None:
    typ = (
        (WYLACZNIK_110KV if napiecie_kv == 110.0 else _typ_sn()) if wiazanie_typu == "typ" else None
    )
    if droga == "operacja":
        enm, lacznik = _dodaj_lacznik(gpz, napiecie_kv, typ)
    else:
        # Model zewnętrzny: gałąź łącznika wchodzi do modelu bez ``catalog_ref`` (import).
        enm, lacznik = _dodaj_lacznik(
            gpz, napiecie_kv, WYLACZNIK_110KV if napiecie_kv == 110.0 else _typ_sn()
        )
        enm = copy.deepcopy(enm)
        if typ is None:
            _galaz(enm, lacznik)["catalog_ref"] = None
    zgloszenia = _zgloszenia(enm)
    if napiecie_kv == 110.0 and typ is None:
        (zgl,) = zgloszenia
        assert zgl.element_refs == [lacznik]
        # Komunikat nazywa łącznik słowami i napięcie szyny; bez identyfikatora.
        assert "110 kV" in zgl.message_pl and lacznik not in zgl.message_pl
        assert zgl.severity != "BLOCKER"
        assert zgl.fix_action is not None and zgl.fix_action.action_type == "SELECT_CATALOG"
        assert zgl.fix_action.element_ref == lacznik
    else:
        assert zgloszenia == []


@pytest.mark.parametrize("koniec_wn", ["from", "to"])
def test_lacznik_na_granicy_napiec_zglaszany_niezaleznie_od_orientacji(
    gpz: dict[str, Any], koniec_wn: str
) -> None:
    """Łącznik z modelu zewnętrznego, którego tylko jeden koniec leży na szynie 110 kV
    (drugi na szynie SN) — kontrola nie zależy od orientacji gałęzi."""
    enm, lacznik = _dodaj_lacznik(gpz, 110.0, WYLACZNIK_110KV)
    enm = copy.deepcopy(enm)
    galaz = _galaz(enm, lacznik)
    galaz["catalog_ref"] = None
    szyna_wn, szyna_sn = _szyna(enm, 110.0), _szyna(enm, 15.0)
    galaz["from_bus_ref"], galaz["to_bus_ref"] = (
        (szyna_wn, szyna_sn) if koniec_wn == "from" else (szyna_sn, szyna_wn)
    )
    (zgl,) = _zgloszenia(enm)
    assert zgl.element_refs == [lacznik]
    assert "110 kV" in zgl.message_pl


def test_zgloszenia_deterministyczne(gpz: dict[str, Any]) -> None:
    enm, _ = _dodaj_lacznik(gpz, 110.0, None)
    enm, _ = _dodaj_lacznik(enm, 110.0, None)
    pierwsze = [(z.element_refs, z.message_pl) for z in _zgloszenia(enm)]
    drugie = [(z.element_refs, z.message_pl) for z in _zgloszenia(copy.deepcopy(enm))]
    assert len(pierwsze) == 2
    assert pierwsze == drugie
    assert [r for r, _ in pierwsze] == sorted(r for r, _ in pierwsze)
