"""Decyzja O-53: JEDNA reguła mocy źródła przekształtnikowego w KAŻDEJ drodze zapisu.

    S_wym = max(S_n,jedn · n, |P| / cosφ) · k_j  ≤  S_n,TR · k_obc
    |P| ≤ P_max,jedn · n

DEFEKT (zmierzony 2026-09-23): tor atomowy i stacyjny porównywały max(S_n·n, P) z mocą
transformatora stacji, tor DER-SN — wyłącznie P/cosφ·k_j z mocą TR blokowego·k_obc, żaden
tor nie porównywał nastawy z mocą znamionową falownika. Ten sam model dostawał różne
werdykty (dwa kody), falownik 5 MW przechodził w torze DER-SN przez TR 1 MVA, a nastawa
2 MW na falowniku 1 MW była przyjmowana.

ILOCZYN CECH: tor {atomowy, stacyjny, DER-SN, przypisanie typu, aktualizacja parametrów}
× człon dominujący {S_n,jedn·n, P/cosφ} × współczynniki {podane, brak} × nastawa
{≤, > moc znamionowa} × transformator {wystarcza, nie wystarcza}. Wynik każdej drogi
porównany z werdyktem ZAPISANYM w tabeli (liczonym ręcznie w komentarzu przypadku) —
parytet dwóch błędnych implementacji nie przejdzie, bo porównanie idzie do liczby,
nie do drugiego toru. Tor stacyjny nie przyjmuje nastawy ani liczby jednostek (P = moc
jednostki z karty, n = 1), więc bierze udział w przypadkach, które da się w nim wyrazić.
"""

from __future__ import annotations

import copy
from dataclasses import dataclass
from typing import Any

import pytest
from domain.generator_validation import (
    KLUCZ_META_KONTROLI_MOCY,
    KOD_MOC_TRANSFORMATORA,
    KOD_NASTAWA_POWYZEJ_MOCY_ZNAMIONOWEJ,
    KOD_WEJSCIE_KONTROLI_MOCY,
    JawneWejsciaKontroliMocy,
)
from enm.domain_operations import execute_domain_operation
from enm.hash import compute_enm_hash
from enm.models import EnergyNetworkModel

from tests.enm import test_brama_katalogowa_operacji_v2 as h
from tests.enm import test_der_sn_validation_domain_ops as dsv
from tests.enm import test_karty_widmowe_modelu as km

TR_1000 = "tr-sn-nn-15-04-1000kva-dyn11"
TR_1250 = "tr-sn-nn-15-04-1250kva-dyn11"
TR_2500 = "tr-sn-nn-15-04-2500kva-dyn11"
#: Pozycje PV 0,4 kV katalogu: P_max,jedn / S_n,jedn = 0,5/0,55, 1/1,1, 5/5,5.
U05 = "conv-pv-nn-0p5mw-0p4kv"
U1 = "conv-pv-nn-1mw-0p4kv"
U5 = "conv-pv-nn-5mw-0p4kv"
TR_MOC = KOD_MOC_TRANSFORMATORA
NASTAWA = KOD_NASTAWA_POWYZEJ_MOCY_ZNAMIONOWEJ


@dataclass(frozen=True)
class Przypadek:
    nazwa: str
    typ: str
    n: int
    p_mw: float
    tr: str
    oczekiwany: str | None
    cos_phi: float | None = None
    k_j: float | None = None
    k_obc: float | None = None
    #: Tor stacyjny: n = 1 i P = moc jednostki — przypadek wyrażalny w tym torze.
    stacyjny: bool = False


PRZYPADKI: tuple[Przypadek, ...] = (
    # S_n,jedn·n dominuje, bez współczynników: 0,55 ≤ 1,0.
    Przypadek("s_bez_wsp_tr_wystarcza", U05, 1, 0.5, TR_1000, None, stacyjny=True),
    # 1,1 > 1,0 — falownik o mocy pozornej większej niż transformator.
    Przypadek("s_bez_wsp_tr_za_maly", U1, 1, 1.0, TR_1000, TR_MOC, stacyjny=True),
    # PIN (f)4: pozycja 5 MW (5,5 MVA) na TR 1,0 MVA — odmowa w każdym torze.
    Przypadek("pin_5mw_na_tr_1mva", U5, 1, 1.0, TR_1000, TR_MOC, stacyjny=True),
    # Przeciążalność 1,25: 1,1 ≤ 1,25.
    Przypadek("s_kobc_tr_wystarcza", U1, 1, 1.0, TR_1000, None, k_obc=1.25, stacyjny=True),
    # Jednoczesność 0,8: 1,1 · 0,8 = 0,88 ≤ 1,0.
    Przypadek("s_kj_tr_wystarcza", U1, 1, 1.0, TR_1000, None, k_j=0.8, stacyjny=True),
    # Dwie jednostki: S_n,jedn·n = 1,1 > 1,0.
    Przypadek("s_n2_tr_za_maly", U05, 2, 1.0, TR_1000, TR_MOC),
    Przypadek("s_n2_kobc_tr_wystarcza", U05, 2, 1.0, TR_1000, None, k_obc=1.25),
    # P/cosφ dominuje: 1,0 / 0,75 = 1,333 > max(1,1) i > 1,25.
    Przypadek("p_cos_tr_za_maly", U05, 2, 1.0, TR_1250, TR_MOC, cos_phi=0.75),
    # 1,0 / 0,85 = 1,176 > 1,1 (P/cosφ dominuje) i ≤ 1,25.
    Przypadek("p_cos_tr_wystarcza", U05, 2, 1.0, TR_1250, None, cos_phi=0.85),
    # 1,333 · 0,9 = 1,2 ≤ 1,25.
    Przypadek("p_cos_kj_tr_wystarcza", U05, 2, 1.0, TR_1250, None, cos_phi=0.75, k_j=0.9),
    # 1,333 ≤ 1,25 · 1,1 = 1,375.
    Przypadek("p_cos_kobc_tr_wystarcza", U05, 2, 1.0, TR_1250, None, cos_phi=0.75, k_obc=1.1),
    # Nastawa 1,0 > 0,5 · 1 — odmowa nastawy (TR 2,5 MVA wystarczyłby).
    Przypadek("nastawa_ponad_tr_wystarcza", U05, 1, 1.0, TR_2500, NASTAWA),
    # Nastawa 2,0 > 1,0 · 1 i TR 1,0 za mały — nastawa sprawdzana PIERWSZA.
    Przypadek("nastawa_ponad_tr_za_maly", U1, 1, 2.0, TR_1000, NASTAWA),
    # Nastawa 1,2 > 0,5 · 2 — współczynniki nie zmieniają kontroli nastawy.
    Przypadek("nastawa_ponad_z_kj", U05, 2, 1.2, TR_2500, NASTAWA, k_j=0.8),
    # Nastawa równa mocy znamionowej (granica): 1,0 = 0,5 · 2, TR 1,25 ≥ 1,1.
    Przypadek("nastawa_na_granicy", U05, 2, 1.0, TR_1250, None),
    # Wejście jawne poza zakresem — odmowa nazwana, bez domyślki.
    Przypadek("kj_poza_zakresem", U05, 1, 0.5, TR_1000, KOD_WEJSCIE_KONTROLI_MOCY, k_j=1.2),
)

_SIECI: dict[str, dict[str, Any]] = {}


def _siec(tr: str) -> dict[str, Any]:
    if tr not in _SIECI:
        _SIECI[tr] = km._siec(0.4, tr)
    return copy.deepcopy(_SIECI[tr])


def _payload_atomowy(siec: dict[str, Any], c: Przypadek) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "source_technology": "PV",
        "connection_variant": "nn_side",
        "station_ref": h._stacja_ref(siec),
        "bus_nn_ref": km._szyna_nn(siec, 0.4),
        "source_name": "Źródło PV",
        "catalog_ref": c.typ,
        "quantity": c.n,
        "power_setpoint_mw": c.p_mw,
    }
    if c.cos_phi is not None:
        payload["cos_phi"] = c.cos_phi
    if c.k_j is not None:
        payload["simultaneity_factor"] = c.k_j
    if c.k_obc is not None:
        payload["loadability_pu"] = c.k_obc
    return payload


def _zapis(c: Przypadek) -> dict[str, Any]:
    return JawneWejsciaKontroliMocy(
        cos_phi=c.cos_phi,
        wspolczynnik_jednoczesnosci=c.k_j,
        przeciazalnosc_transformatora_pu=c.k_obc,
    ).zapis_meta()


def _baza(tr: str) -> dict[str, Any]:
    """Generator 0,5 MW (jedna jednostka U05) na stacji z transformatorem `tr`."""
    siec = _siec(tr)
    return h._wykonaj(
        siec,
        "add_converter_source",
        _payload_atomowy(siec, Przypadek("baza", U05, 1, 0.5, tr, None)),
    )


def _odcisk(snapshot: dict[str, Any]) -> str:
    return compute_enm_hash(EnergyNetworkModel.model_validate(snapshot))


def werdykt_atomowy(c: Przypadek) -> str | None:
    siec = _siec(c.tr)
    odcisk_przed = _odcisk(siec)
    wynik = execute_domain_operation(siec, "add_converter_source", _payload_atomowy(siec, c))
    if wynik.get("error_code") is not None:
        # Odmowa nie zostawia skutku: brak migawki, model wejściowy nietknięty.
        assert wynik.get("snapshot") is None
        assert _odcisk(siec) == odcisk_przed
    return wynik.get("error_code")


def werdykt_der_sn(c: Przypadek) -> str | None:
    payload = dsv._der_sn_payload(
        block_tr_ref=c.tr,
        quantity=c.n,
        power_setpoint_mw=c.p_mw,
        cos_phi=c.cos_phi,
        loadability_pu=c.k_obc,
        simultaneity_factor=c.k_j,
    )
    payload["catalog_binding"]["catalog_item_id"] = c.typ
    return dsv._run(payload).get("error_code")


def werdykt_stacyjny(c: Przypadek) -> str | None:
    assert c.stacyjny
    siec = h._wykonaj(
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
    siec = h._wykonaj(
        siec,
        "continue_trunk_segment_sn",
        {"segment": {"rodzaj": "KABEL", "dlugosc_m": 500.0, "catalog_ref": h.REF_KABEL}},
    )
    blok = h._blok_nn(nn_configuration="PV_INVERTER", source_converter_catalog_ref=c.typ)
    if c.cos_phi is not None:
        blok["cos_phi"] = c.cos_phi
    if c.k_j is not None:
        blok["simultaneity_factor"] = c.k_j
    if c.k_obc is not None:
        blok["loadability_pu"] = c.k_obc
    payload = h._payload_stacji(str(siec["branches"][-1]["to_bus_ref"]), blok)
    payload["nn_voltage_kv"] = 0.4
    payload["transformer"]["transformer_catalog_ref"] = c.tr
    return execute_domain_operation(siec, "append_station_on_endpoint", payload).get("error_code")


def werdykt_przypisanie(c: Przypadek) -> str | None:
    snapshot = _baza(c.tr)
    generator = snapshot["generators"][-1]
    generator.update({"quantity": c.n, "n_parallel": c.n, "p_mw": c.p_mw})
    generator["meta"][KLUCZ_META_KONTROLI_MOCY] = _zapis(c)
    wynik = execute_domain_operation(
        snapshot,
        "assign_catalog_to_element",
        {
            "element_ref": generator["ref_id"],
            "catalog_item_id": c.typ,
            "catalog_namespace": "ZRODLO_NN_PV",
        },
    )
    return wynik.get("error_code")


def werdykt_aktualizacja(c: Przypadek) -> str | None:
    snapshot = _baza(c.tr)
    generator = snapshot["generators"][-1]
    meta = dict(generator["meta"])
    meta[KLUCZ_META_KONTROLI_MOCY] = _zapis(c)
    wynik = execute_domain_operation(
        snapshot,
        "update_element_parameters",
        {
            "element_ref": generator["ref_id"],
            "parameters": {
                "catalog_ref": c.typ,
                "p_mw": c.p_mw,
                "quantity": c.n,
                "n_parallel": c.n,
                "meta": meta,
            },
        },
    )
    if wynik.get("error_code") is None:
        # Zmiana typu przez aktualizację niesie tabliczkę NOWEJ pozycji (nie starą).
        po = next(g for g in wynik["snapshot"]["generators"] if g["ref_id"] == generator["ref_id"])
        assert po["catalog_ref"] == c.typ
        assert po["materialized_params"]["catalog_item_id"] == c.typ
    return wynik.get("error_code")


TORY = {
    "atomowy": werdykt_atomowy,
    "der_sn": werdykt_der_sn,
    "przypisanie": werdykt_przypisanie,
    "aktualizacja": werdykt_aktualizacja,
}


@pytest.mark.parametrize("tor", sorted(TORY))
@pytest.mark.parametrize("c", PRZYPADKI, ids=[c.nazwa for c in PRZYPADKI])
def test_kazdy_tor_daje_werdykt_kanonu(c: Przypadek, tor: str) -> None:
    assert TORY[tor](c) == c.oczekiwany


@pytest.mark.parametrize(
    "c", [c for c in PRZYPADKI if c.stacyjny], ids=[c.nazwa for c in PRZYPADKI if c.stacyjny]
)
def test_tor_stacyjny_daje_werdykt_kanonu(c: Przypadek) -> None:
    assert werdykt_stacyjny(c) == c.oczekiwany


def test_przypadki_pokrywaja_iloczyn_cech() -> None:
    """Deklaracja iloczynu przypięta: każda kombinacja (człon dominujący × współczynniki ×
    nastawa × transformator), którą da się wyrazić, ma przypadek w tabeli."""
    cechy = set()
    for c in PRZYPADKI:
        dominuje_p = (
            c.cos_phi is not None
            and c.p_mw / c.cos_phi > {U05: 0.55, U1: 1.1, U5: 5.5}[c.typ] * c.n
        )
        wspolczynniki = c.k_j is not None or c.k_obc is not None
        nastawa_ponad = c.oczekiwany == NASTAWA
        tr_wystarcza = c.oczekiwany is None
        cechy.add((dominuje_p, wspolczynniki, nastawa_ponad, tr_wystarcza))
    wymagane = {
        (False, False, False, True),
        (False, False, False, False),
        (False, True, False, True),
        (True, False, False, True),
        (True, False, False, False),
        (True, True, False, True),
        (False, False, True, False),
        (False, True, True, False),
    }
    assert wymagane <= cechy, sorted(wymagane - cechy)


# ---------------------------------------------------------------------------
# Piny z decyzji O-53 i zachowania poza tabelą
# ---------------------------------------------------------------------------


def test_pin_nastawa_2mw_na_falowniku_1mw_jest_odmowa_w_kazdym_torze_z_nastawa() -> None:
    """(f)5: `conv-pv-nn-1mw-0p8kv`, n = 1, nastawa 2,0 MW → odmowa nazwana."""
    siec = km._siec(0.8, km.TRAFO_0P8)
    atomowy = execute_domain_operation(
        siec,
        "add_converter_source",
        {
            "source_technology": "PV",
            "connection_variant": "nn_side",
            "station_ref": h._stacja_ref(siec),
            "bus_nn_ref": km._szyna_nn(siec, 0.8),
            "source_name": "PV",
            "catalog_ref": "conv-pv-nn-1mw-0p8kv",
            "power_setpoint_mw": 2.0,
        },
    )
    assert atomowy.get("error_code") == NASTAWA, atomowy.get("error")

    payload = dsv._der_sn_payload(
        inverter_output_kv=0.8,
        converter_un_kv=0.8,
        block_secondary_kv=0.8,
        block_tr_ref=km.TRAFO_0P8,
        power_setpoint_mw=2.0,
    )
    payload["catalog_binding"]["catalog_item_id"] = "conv-pv-nn-1mw-0p8kv"
    assert dsv._run(payload).get("error_code") == NASTAWA

    bazowy = km._model(km.TORY[0])  # karta PV 0,215 MW na szynie 0,8 kV
    generator = bazowy["generators"][-1]
    przypisanie = execute_domain_operation(
        {**bazowy, "generators": [*bazowy["generators"][:-1], {**generator, "p_mw": 2.0}]},
        "assign_catalog_to_element",
        {
            "element_ref": generator["ref_id"],
            "catalog_item_id": "conv-pv-nn-1mw-0p8kv",
            "catalog_namespace": "ZRODLO_NN_PV",
        },
    )
    assert przypisanie.get("error_code") == NASTAWA

    aktualizacja = execute_domain_operation(
        km._model(km.TORY[0]),
        "update_element_parameters",
        {
            "element_ref": generator["ref_id"],
            "parameters": {"catalog_ref": "conv-pv-nn-1mw-0p8kv", "p_mw": 2.0},
        },
    )
    assert aktualizacja.get("error_code") == NASTAWA


def test_aktualizacja_mocy_bez_zmiany_typu_sprawdza_nastawe() -> None:
    snapshot = _baza(TR_1000)
    generator = snapshot["generators"][-1]
    wynik = execute_domain_operation(
        snapshot,
        "update_element_parameters",
        {"element_ref": generator["ref_id"], "parameters": {"p_mw": 0.6}},
    )
    assert wynik.get("error_code") == NASTAWA
    zgodny = execute_domain_operation(
        snapshot,
        "update_element_parameters",
        {"element_ref": generator["ref_id"], "parameters": {"p_mw": 0.4}},
    )
    assert not zgodny.get("error"), zgodny.get("error")


def test_aktualizacja_nazwy_nie_uruchamia_kontroli_mocy() -> None:
    """Pole spoza wejść kontroli (nazwa) nie zmienia werdyktu — model z naruszeniem
    zastanym da się opisać bez odmowy (kontrola dotyczy zmiany wejść, nie każdej edycji)."""
    snapshot = _baza(TR_1000)
    generator = snapshot["generators"][-1]
    generator["p_mw"] = 5.0  # zastane naruszenie (model spoza toru tworzenia)
    wynik = execute_domain_operation(
        snapshot,
        "update_element_parameters",
        {"element_ref": generator["ref_id"], "parameters": {"name": "PV dach"}},
    )
    assert not wynik.get("error"), wynik.get("error")


@pytest.mark.parametrize(
    ("nowy_tr", "kod"),
    [(TR_1250, None), ("tr-sn-nn-15-04-400kva-dyn11", TR_MOC)],
    ids=["tr_wiekszy", "tr_mniejszy_niz_zrodlo"],
)
def test_zmiana_transformatora_sprawdza_zasilane_zrodla(nowy_tr: str, kod: str | None) -> None:
    """Przypisanie typu i aktualizacja mocy TRANSFORMATORA — źródło, które zasila (0,55 MVA),
    przechodzi tę samą kontrolę mocy; zmiana na 400 kVA jest odmową, na 1250 kVA nie."""
    snapshot = _baza(TR_1000)
    stacja = next(s for s in snapshot["substations"] if s.get("station_type") != "gpz")
    tr_ref = next(
        t["ref_id"]
        for t in snapshot["transformers"]
        if t["hv_bus_ref"] in stacja["bus_refs"] or t["lv_bus_ref"] in stacja["bus_refs"]
    )
    przypisanie = execute_domain_operation(
        snapshot,
        "assign_catalog_to_element",
        {"element_ref": tr_ref, "catalog_item_id": nowy_tr, "catalog_namespace": "TRAFO_SN_NN"},
    )
    assert przypisanie.get("error_code") == kod, przypisanie.get("error")
    sn_nowego = {TR_1250: 1.25, "tr-sn-nn-15-04-400kva-dyn11": 0.4}[nowy_tr]
    aktualizacja = execute_domain_operation(
        snapshot,
        "update_element_parameters",
        {"element_ref": tr_ref, "parameters": {"sn_mva": sn_nowego}},
    )
    assert aktualizacja.get("error_code") == kod, aktualizacja.get("error")


def test_liczba_jednostek_z_n_parallel_jak_w_solverze() -> None:
    """Rekord z samym `n_parallel` (import): kontrola liczy jednostki TĄ SAMĄ regułą co
    solver (`liczba_jednostek_zrodla`) — 2 × 0,55 = 1,1 > 1,0."""
    snapshot = _baza(TR_1000)
    generator = snapshot["generators"][-1]
    wynik = execute_domain_operation(
        snapshot,
        "update_element_parameters",
        {"element_ref": generator["ref_id"], "parameters": {"quantity": None, "n_parallel": 2}},
    )
    assert wynik.get("error_code") == TR_MOC


def test_tor_tworzenia_zapisuje_jawne_wejscia_i_nazwane_przyjecia() -> None:
    """Meta generatora niesie wejścia podane oraz NAZWANE przyjęcia dla niepodanych (1,0 =
    brak redukcji/ulgi), tak że przypisanie i aktualizacja liczą z tymi samymi danymi."""
    siec = _siec(TR_1000)
    c = Przypadek("zapis", U1, 1, 1.0, TR_1000, None, k_obc=1.25)
    snapshot = h._wykonaj(siec, "add_converter_source", _payload_atomowy(siec, c))
    zapis = snapshot["generators"][-1]["meta"][KLUCZ_META_KONTROLI_MOCY]
    assert zapis["przeciazalnosc_transformatora_pu"] == 1.25
    assert zapis["wspolczynnik_jednoczesnosci"] is None
    assert zapis["cos_phi"] is None
    assert any("jednoczesności" in przyjecie for przyjecie in zapis["przyjete_pl"])
    assert not any("Przeciążalności" in przyjecie for przyjecie in zapis["przyjete_pl"])
    # Ten sam model w przypisaniu tego samego typu: werdykt tworzenia (przyjęty).
    generator = snapshot["generators"][-1]
    assert (
        execute_domain_operation(
            snapshot,
            "assign_catalog_to_element",
            {
                "element_ref": generator["ref_id"],
                "catalog_item_id": U1,
                "catalog_namespace": "ZRODLO_NN_PV",
            },
        ).get("error_code")
        is None
    )


# ---------------------------------------------------------------------------
# Decyzja O-53 — przejście modelu (pomiar 2026-09-24). Trzy drogi, którymi źródło mogło
# ominąć jedną regułę, choć każdy tor tworzenia ją wołał:
#   (1) źródło na szynie nN ZA KABLEM od szyny transformatora — topologia zasilania szła
#       tylko przez aparaty łączeniowe, więc falownik 5 MW za 25 m kabla nN od TR 1 MVA
#       nie miał „transformatora zasilającego" i był przyjmowany (pin (f)4 złamany);
#   (2) wariant aliasowy `LV_BEHIND_STATION_TRANSFORMER` (dozwolony w aktualizacji) —
#       topologia rozpoznawała tylko `nn_side`, więc po zmianie wariantu kontrola milkła;
#   (3) usunięcie jednego z równoległych transformatorów — usunięcie nie sprawdzało
#       źródeł, które traciły moc transformacji (zmiana liczby torów — sprawdzała).
# Iloczyn: {szyna TR, szyna za kablem nN} × {wariant kanoniczny, aliasowy} × {TR
# wystarcza, nie wystarcza} × {utworzenie, aktualizacja, usunięcie TR}.
# ---------------------------------------------------------------------------


def _stacja_i_transformator(snapshot: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    stacja = next(s for s in snapshot["substations"] if s.get("station_type") != "gpz")
    transformator = next(
        t
        for t in snapshot["transformers"]
        if t["hv_bus_ref"] in stacja["bus_refs"] or t["lv_bus_ref"] in stacja["bus_refs"]
    )
    return stacja, transformator


def _szyna_za_kablem_nn(siec: dict[str, Any]) -> tuple[dict[str, Any], str]:
    snapshot = h._wykonaj(
        siec,
        "add_nn_cable_segment",
        {
            "from_bus_ref": km._szyna_nn(siec, 0.4),
            "length_m": 25.0,
            "catalog_ref": h.REF_KABEL_NN,
        },
    )
    koniec = [
        b for b in snapshot["buses"] if (b.get("meta") or {}).get("visual_role") == "NN_CABLE_END"
    ][-1]["ref_id"]
    return snapshot, str(koniec)


@pytest.mark.parametrize(
    ("typ", "oczekiwany"),
    [(U5, TR_MOC), (U1, TR_MOC), (U05, None)],
    ids=["pin_5mw_za_kablem", "1mw_za_kablem", "0p5mw_za_kablem"],
)
def test_zrodlo_za_kablem_nn_sprawdzane_z_transformatorem_stacji(
    typ: str, oczekiwany: str | None
) -> None:
    snapshot, koniec = _szyna_za_kablem_nn(_siec(TR_1000))
    payload = _payload_atomowy(snapshot, Przypadek("kabel", typ, 1, 0.5, TR_1000, None))
    payload["bus_nn_ref"] = koniec
    wynik = execute_domain_operation(snapshot, "add_converter_source", payload)
    assert wynik.get("error_code") == oczekiwany, wynik.get("error")


@pytest.mark.parametrize(
    "wariant", ["nn_side", "LV_BEHIND_STATION_TRANSFORMER"], ids=["kanoniczny", "aliasowy"]
)
def test_wariant_aliasowy_nn_nie_wylacza_kontroli(wariant: str) -> None:
    snapshot = _baza(TR_1000)
    generator = snapshot["generators"][-1]
    snapshot = h._wykonaj(
        snapshot,
        "update_element_parameters",
        {"element_ref": generator["ref_id"], "parameters": {"connection_variant": wariant}},
    )
    # 2 × 0,55 = 1,1 MVA > 1,0 MVA — ta sama odmowa niezależnie od zapisu wariantu.
    wynik = execute_domain_operation(
        snapshot,
        "update_element_parameters",
        {"element_ref": generator["ref_id"], "parameters": {"quantity": 2}},
    )
    assert wynik.get("error_code") == TR_MOC


@pytest.mark.parametrize(
    ("typ", "oczekiwany"),
    [(U1, TR_MOC), (U05, None)],
    ids=["zrodlo_1p1mva_traci_moc", "zrodlo_0p55mva_miesci_sie"],
)
def test_usuniecie_jednego_z_rownoleglych_transformatorow_sprawdza_zrodla(
    typ: str, oczekiwany: str | None
) -> None:
    siec = _siec(TR_1000)
    stacja, tr1 = _stacja_i_transformator(siec)
    siec = h._wykonaj(
        siec,
        "add_transformer_sn_nn",
        {
            "hv_bus_ref": tr1["hv_bus_ref"],
            "lv_bus_ref": tr1["lv_bus_ref"],
            "transformer_catalog_ref": TR_1000,
            "station_ref": stacja["ref_id"],
        },
    )
    tr2 = next(
        t["ref_id"]
        for t in siec["transformers"]
        if t["lv_bus_ref"] == tr1["lv_bus_ref"] and t["ref_id"] != tr1["ref_id"]
    )
    # 2 × 1,0 MVA zasila źródło — utworzenie przyjęte w obu przypadkach.
    siec = h._wykonaj(
        siec,
        "add_converter_source",
        _payload_atomowy(siec, Przypadek("dwa_tr", typ, 1, 0.5, TR_1000, None)),
    )
    odcisk_przed = _odcisk(siec)
    wynik = execute_domain_operation(siec, "delete_element", {"element_ref": tr2})
    assert wynik.get("error_code") == oczekiwany, wynik.get("error")
    if oczekiwany is not None:
        assert wynik.get("snapshot") is None
        assert _odcisk(siec) == odcisk_przed
    else:
        assert all(t["ref_id"] != tr2 for t in wynik["snapshot"]["transformers"])


def test_usuniecie_transformatora_niezasilajacego_zrodla_nie_uruchamia_odmowy() -> None:
    # Źródło 1,1 MVA na TR 1,25 MVA; osobna gałąź nN za kablem z własnym TR nie zasila
    # źródła — jej usunięcie nie zmienia mocy transformacji źródła.
    siec = _siec(TR_1250)
    siec = h._wykonaj(
        siec,
        "add_converter_source",
        _payload_atomowy(siec, Przypadek("jeden", U1, 1, 1.0, TR_1250, None)),
    )
    stacja, tr1 = _stacja_i_transformator(siec)
    siec = h._wykonaj(
        siec,
        "add_transformer_sn_nn",
        {
            "hv_bus_ref": tr1["hv_bus_ref"],
            "lv_voltage_kv": 0.4,
            "transformer_catalog_ref": TR_1000,
            "station_ref": stacja["ref_id"],
        },
    )
    obcy = next(
        t
        for t in siec["transformers"]
        if t["lv_bus_ref"] != tr1["lv_bus_ref"] and t["hv_bus_ref"] == tr1["hv_bus_ref"]
    )
    wynik = execute_domain_operation(siec, "delete_element", {"element_ref": obcy["ref_id"]})
    assert wynik.get("error_code") is None, wynik.get("error")


def test_raport_zgodnosci_ocenia_ten_sam_transformator_co_operacja() -> None:
    """Jeden model = jeden werdykt także dla raportu zgodności toru DER-SN: po zmianie
    przyłączenia (`blocking_transformer_ref`) aktualizacją raport ocenia transformator
    z POLA MODELU, jak kontrola operacji — nie kopię z `meta` (dawniej: raport NIEZGODNY
    wobec transformatora, który źródła już nie zasila, przy modelu przyjętym przez
    operację)."""
    from application.analyses.raport_zgodnosci import build_compliance_report
    from enm.domain_operations_v2 import kontrola_mocy_generatora_w_modelu

    payload = dsv._der_sn_payload(block_tr_ref=TR_2500, quantity=1, power_setpoint_mw=0.5)
    payload["catalog_binding"]["catalog_item_id"] = U05
    snapshot = dsv._run(payload)["snapshot"]
    generator = snapshot["generators"][-1]
    stary_tr = generator["blocking_transformer_ref"]
    hv_bus = next(t for t in snapshot["transformers"] if t["ref_id"] == stary_tr)["hv_bus_ref"]
    snapshot = h._wykonaj(
        snapshot,
        "add_transformer_sn_nn",
        {"hv_bus_ref": hv_bus, "lv_voltage_kv": 0.4, "transformer_catalog_ref": TR_2500},
    )
    nowy_tr = next(t for t in snapshot["transformers"] if t["ref_id"] != stary_tr)["ref_id"]
    snapshot = h._wykonaj(
        snapshot,
        "update_element_parameters",
        {"element_ref": generator["ref_id"], "parameters": {"blocking_transformer_ref": nowy_tr}},
    )
    # Dawny TR blokowy nie zasila już źródła — zmniejszenie jego mocy jest przyjmowane.
    snapshot = h._wykonaj(
        snapshot,
        "update_element_parameters",
        {"element_ref": stary_tr, "parameters": {"sn_mva": 0.4}},
    )
    generator = next(g for g in snapshot["generators"] if g["ref_id"] == generator["ref_id"])
    assert kontrola_mocy_generatora_w_modelu(snapshot, generator, sprawdz_nastawe=False) is None
    raport = build_compliance_report(snapshot, generator["ref_id"])
    assert raport is not None
    pozycja = next(p for p in raport["pozycje"] if p["check_id"] == "moc_transformatora")
    assert pozycja["status"] == "PASS", pozycja
