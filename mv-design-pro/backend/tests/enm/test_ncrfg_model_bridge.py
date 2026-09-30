"""Most model → wejście solvera NC RfG i trasa zgodności przypadku (karta S-3 W6-0;
karta AB-1a Pakiet C).

JEDNA implementacja zgodności NC RfG: `GET /api/ncrfg-tests/cases/{case_id}/compliance`
buduje `NcRfgPtpireeModuleInput` z committed ENM (most `model_bridge.py`), wyprowadza PO
STRONIE SERWERA dowód certyfikatu urządzenia (tabliczka × rejestr wykazu PTPiREE) i uruchamia
TEN SAM `NcRfgPtpireeSolver` co bieg „co-jeśli" `POST /api/ncrfg-tests/run` — ze źródłem
danych `ZATWIERDZONY_MODEL`; odpowiedź = koperta biegu (rekordy testów + ocena wymagań)
opakowana per przypadek.

Iloczyn cech (KLASA NIE INSTANCJA): model z {0, 1, N} DER × operator {znany, nieznany → 404}
× dane {kompletne, niekompletne} × tabliczka {rekord wykazu spójny, rekord nieistniejący,
tabliczka przecząca rejestrowi, zakres typów nieznany, wersja spoza warstwy WiPWC, data umowy
poza oknem akceptacji, tabliczka bez referencji, brak} + parytet `/run` vs `/compliance`
dla tego samego DER (ta sama ocena kryteriów, różne źródło danych) + pin numeracji T01–T20 +
pin kompletności mostu wobec kontraktu solvera.
"""

from __future__ import annotations

import re
from datetime import date

import pytest
from application.ncrfg_compliance import (
    POLA_WEJSCIA_SPOZA_MODELU,
    NcRfgCaseComplianceResponse,
    NcRfgCertyfikatOdrzucony,
    build_ncrfg_module_input_from_generator,
    build_ncrfg_module_inputs_from_enm,
    model_bridge,
    pola_wejscia_z_modelu,
    weryfikacja_certyfikatu,
    weryfikacje_certyfikatow_typu,
    zgodnosc_ncrfg_przypadku,
)
from catalog.profiles.nc_rfg import list_available_operators, load_nc_rfg_profile
from enm.deklaracje_modulu import POLA_DEKLARACJI
from enm.domain_ops_models import AddConverterSourcePayload
from enm.models import GEN_TYPES_PRZEKSZTALTNIKOWE, EnergyNetworkModel, ENMHeader, Generator
from network_model.catalog.mv_ptpiree_catalog import get_all_ptpiree_generator_certificates
from network_model.solvers.ncrfg_ptpiree import NcRfgPtpireeModuleInput
from network_model.solvers.ncrfg_ptpiree.contracts import DowodCertyfikatu

from tests import ncrfg_fabryki as f

_OPERATOR = list_available_operators()[0]

#: Tabliczka urządzenia POWIĄZANEGO z wykazem PTPiREE — kształt kluczy 1:1 z
#: `annotate_with_ptpiree_status` (`network_model/catalog/mv_ptpiree_catalog.py`).
_TABLICZKA_POWIAZANA = {
    "catalog_item_id": "conv-pv-card-huawei-sun2000-215ktl",
    "ptpiree_status": "POWIAZANY",
    "ptpiree_certificate_ref": "ptpiree-wipwc-1-2-row-3254-huawei-technologies-co-ltd-pv-sun2000-215ktl-h3",
    "ptpiree_document_number": "TC-GCC-DNVGL-SE-0124-07526-1",
    "ptpiree_wipwc_version": "1.2",
}

#: Dane KOMPLETNE dla klasy B (moduł 1–50 MW): każdy test wymagany klasy B
#: (T05/T09/T10/T11/T14/T15/T16/T17 + warunkowe T12/T13 bez certyfikatu) dostaje
#: w modelu to, co most potrafi z niego wyprowadzić; reszta jest deklaracją
#: projektanta (BRAK w modelu → no_data) — patrz `test_dane_niekompletne_daja_no_data`.
_META_KOMPLETNE = {
    "has_lvrt_curve": True,
    "has_hvrt_curve": True,
    "frequency_droop_percent": 5.0,
    "lfsm_deadband_hz": 0.2,
    "qu_slope_pu_per_pu": 2.0,
    "control_mode": "Q_OD_U",
    "cos_phi": 0.95,
    "q_min_mvar": -0.66,
    "q_max_mvar": 0.66,
}


def _generator(
    meta: dict,
    *,
    ref_id: str = "DER1",
    p_mw: float = 2.0,
    gen_type: str = "pv_inverter",
    bus_ref: str = "BUS_SN",
    tabliczka: dict | None = None,
) -> Generator:
    return Generator.model_validate(
        {
            "ref_id": ref_id,
            "name": f"Blok {ref_id}",
            "bus_ref": bus_ref,
            "p_mw": p_mw,
            "gen_type": gen_type,
            "meta": meta,
            "materialized_params": tabliczka,
        }
    )


def _model(generators: list[Generator]) -> EnergyNetworkModel:
    return EnergyNetworkModel.model_validate(
        {
            "header": ENMHeader(name="ncrfg-s3").model_dump(),
            "buses": [{"ref_id": "BUS_SN", "name": "Szyna", "voltage_kv": 15.0}],
            "generators": [g.model_dump(mode="json") for g in generators],
        }
    )


# ---------------------------------------------------------------------------
# Kompletność mostu wobec kontraktu solvera (KLASA, NIE INSTANCJA)
# ---------------------------------------------------------------------------


def test_most_nazywa_kazde_pole_wejscia_solvera() -> None:
    """Inwentarz w docstringu `model_bridge.py` wymienia KAŻDE pole
    `NcRfgPtpireeModuleInput` — nowe pole kontraktu solvera bez wiersza „skąd w
    modelu" jest czerwone tutaj, nie cichym `False`/`None` bez uzasadnienia."""
    docstring = model_bridge.__doc__ or ""
    nazwane = set(re.findall(r"``([a-z_]+)``", docstring))
    brakuje = sorted(set(NcRfgPtpireeModuleInput.model_fields) - nazwane)
    assert brakuje == [], brakuje


def test_kazdy_typ_przeksztaltnikowy_ma_rodzaj_modulu() -> None:
    """`_DER_KIND_Z_GEN_TYPE` pokrywa DOKŁADNIE `GEN_TYPES_PRZEKSZTALTNIKOWE`
    (jedno źródło predykatu DER) — typ bez wiersza dawałby `OTHER` po cichu."""
    assert set(model_bridge._DER_KIND_Z_GEN_TYPE) == set(GEN_TYPES_PRZEKSZTALTNIKOWE)


def test_most_buduje_kontrakt_solvera_bez_fabrykacji() -> None:
    """Brak danej w modelu = brak w wejściu (nigdy wartość domyślna): flagi wyprowadzane z
    wiązań i deklaracji kreatora oraz wymagania programu badań — ``False``; deklaracje
    zdolności modułu bez bloku ``deklaracje_modulu`` — ``None`` (nie zadeklarowano, odbiór
    Pakietu C: dawne ``False`` udawało zadeklarowany brak funkcji); liczby — ``None``."""
    wejscie = build_ncrfg_module_input_from_generator(
        _generator({}), voltage_kv=15.0, operator_id=_OPERATOR
    )
    assert isinstance(wejscie, NcRfgPtpireeModuleInput)
    assert wejscie.der_ref == "DER1"
    assert wejscie.der_name == "Blok DER1"
    assert wejscie.der_kind == "PV"
    assert wejscie.module_family == "PPM"
    assert wejscie.operator_id == _OPERATOR
    assert wejscie.p_max_kw == 2000.0
    assert wejscie.voltage_kv == 15.0
    # Certyfikat NIE jest polem wejścia (wyprowadza go serwer osobnym argumentem solvera).
    assert "certificate_status" not in NcRfgPtpireeModuleInput.model_fields
    assert (
        wejscie.modul_istniejacy,
        wejscie.data_umowy_przylaczeniowej,
        wejscie.nastawy_zabezpieczen_modulu,
    ) == (None, None, None)
    flagi = {
        "has_lvrt_curve",
        "has_hvrt_curve",
        "has_pf_droop",
        "has_qu_curve",
        "has_dynamic_model",
        "island_operation_required",
        "black_start_required",
        "power_oscillation_damping_required",
    }
    assert all(getattr(wejscie, flaga) is False for flaga in flagi)
    deklaracje = {
        "has_scada_communication",
        "has_disturbance_recorder",
        "active_power_control_enabled",
        "stop_generation_enabled",
        "reduction_generation_enabled",
        "island_operation_capable",
        "black_start_capable",
        "power_oscillation_damping_enabled",
    }
    assert all(getattr(wejscie, flaga) is None for flaga in deklaracje)
    liczby = {
        "p_min_kw",
        "droop_percent",
        "dead_band_hz",
        "ramp_rate_pct_per_min",
        "cos_phi_min",
        "q_range_pct_pn_min",
        "q_range_pct_pn_max",
        "reactive_current_gain",
        "p_recovery_time_s",
        "harmonic_thdu_percent",
        "cease_generation_time_s",
    }
    assert all(getattr(wejscie, pole) is None for pole in liczby)


# ---------------------------------------------------------------------------
# Pochodzenie wartości wejścia (formularz „co-jeśli" macierzy — luka §5.3 pakietu D2)
# ---------------------------------------------------------------------------

#: Pola tożsamości modułu — zawsze z modelu (referencja, nazwa, typ, moc, napięcie szyny).
_POLA_TOZSAMOSCI = ["der_ref", "der_name", "der_kind", "p_max_kw", "voltage_kv"]


def _generator_pelny() -> Generator:
    """Generator z KAŻDYM źródłem mostu: deklaracja kreatora w `meta`, wiązania profili
    i modelu dynamicznego, art. 4, data umowy, nastawy i komplet deklaracji modułu."""
    liczbowe = {
        "p_min_kw",
        "ramp_rate_pct_per_min",
        "reactive_current_gain",
        "p_recovery_time_s",
        "harmonic_thdu_percent",
        "cease_generation_time_s",
    }
    deklaracje: dict[str, object] = {
        pole: 1.5 if pole in liczbowe else True for pole in POLA_DEKLARACJI
    }
    deklaracje["zrodlo_pl"] = "karta katalogowa wytwórcy"
    return Generator.model_validate(
        {
            "ref_id": "DER1",
            "name": "Blok DER1",
            "bus_ref": "BUS_SN",
            "p_mw": 2.0,
            "gen_type": "pv_inverter",
            "meta": _META_KOMPLETNE,
            "materialized_params": {
                "profiles": {
                    "lvrt_curve_ref": "lvrt-1",
                    "hvrt_curve_ref": "hvrt-1",
                    "pf_curve_ref": "pf-1",
                },
                "dynamic_model_ref": "dyn-1",
            },
            "modul_istniejacy": False,
            "data_umowy_przylaczeniowej": "2025-03-01",
            "nastawy_zabezpieczen": {"u_min_pu": 0.8, "zrodlo_pl": "karta nastaw"},
            "deklaracje_modulu": deklaracje,
        }
    )


def test_pochodzenie_pelny_model_to_kazde_pole_poza_wyborem_projektanta() -> None:
    """Iloczyn cech (KLASA, NIE INSTANCJA): model z KAŻDYM źródłem mostu — pochodzenie „z
    modelu" ma każde pole kontraktu poza operatorem (wybór projektanta) i rodziną modułu
    (stała); nowe pole kontraktu bez reguły pochodzenia byłoby tu czerwone."""
    generator = _generator_pelny()
    wejscie = build_ncrfg_module_input_from_generator(
        generator, voltage_kv=15.0, operator_id=_OPERATOR
    )
    assert pola_wejscia_z_modelu(generator, wejscie) == [
        pole
        for pole in NcRfgPtpireeModuleInput.model_fields
        if pole not in POLA_WEJSCIA_SPOZA_MODELU
    ]
    assert POLA_WEJSCIA_SPOZA_MODELU == {"operator_id", "module_family"}


def test_pochodzenie_pusty_model_to_wylacznie_tozsamosc() -> None:
    """Model bez żadnej danej modułu: wartości domyślne kontraktu (`False`/`None`) NIE są
    danymi modelu — pochodzenie „z modelu" ma wyłącznie tożsamość modułu."""
    generator = _generator({})
    wejscie = build_ncrfg_module_input_from_generator(
        generator, voltage_kv=15.0, operator_id=_OPERATOR
    )
    assert pola_wejscia_z_modelu(generator, wejscie) == _POLA_TOZSAMOSCI


@pytest.mark.parametrize("zapis", [True, False, None])
@pytest.mark.parametrize(
    "pole",
    [
        "island_operation_required",
        "black_start_required",
        "power_oscillation_damping_required",
        "has_scada_communication",
        "black_start_capable",
    ],
)
def test_pochodzenie_deklaracji_z_bloku_modulu_nie_z_wartosci_wejscia(
    pole: str, zapis: bool | None
) -> None:
    """Wymaganie programu badań (`*_required`, kontrakt `bool`) × zdolność trójstanowa ×
    zapis {tak, nie, brak}: jawne `False` w bloku deklaracji JEST daną modelu, brak zapisu nie
    jest — choć wejście wymagania niesie wtedy `False` (brak wskazania programu)."""
    deklaracje = {} if zapis is None else {pole: zapis, "zrodlo_pl": "program badań operatora"}
    generator = Generator.model_validate(
        {
            **_generator({}).model_dump(mode="json"),
            "deklaracje_modulu": deklaracje or None,
        }
    )
    wejscie = build_ncrfg_module_input_from_generator(
        generator, voltage_kv=15.0, operator_id=_OPERATOR
    )
    assert (pole in pola_wejscia_z_modelu(generator, wejscie)) is (zapis is not None)


@pytest.mark.parametrize(
    ("meta", "pola"),
    [
        ({"frequency_droop_percent": 5.0}, {"droop_percent", "has_pf_droop"}),
        ({"lfsm_deadband_hz": 0.0}, {"dead_band_hz"}),
        ({"cos_phi": 0.95}, {"cos_phi_min"}),
        ({"q_min_mvar": -0.5, "q_max_mvar": 0.5}, {"q_range_pct_pn_min", "q_range_pct_pn_max"}),
        ({"qu_slope_pu_per_pu": 2.0}, {"has_qu_curve"}),
        ({"control_mode": "Q_OD_U"}, {"has_qu_curve"}),
        ({"has_lvrt_curve": True, "has_hvrt_curve": True}, {"has_lvrt_curve", "has_hvrt_curve"}),
        ({"has_lvrt_curve": False, "cos_phi": 1.5}, set()),
    ],
)
def test_pochodzenie_pol_liczonych_z_meta(meta: dict, pola: set[str]) -> None:
    """Pola, które most LICZY z `meta` generatora (statyzm, martwa strefa — także zero, cosφ,
    zakresy Q w bazie P_n, zdolność Q(U) ze stoku albo trybu, krzywe FRT z deklaracji
    kreatora): „z modelu" dokładnie wtedy, gdy most wyprowadził wartość; deklaracja `False`
    i cosφ spoza (0, 1] — nie (wartość odrzucona, pole puste)."""
    generator = _generator(meta)
    wejscie = build_ncrfg_module_input_from_generator(
        generator, voltage_kv=15.0, operator_id=_OPERATOR
    )
    assert set(pola_wejscia_z_modelu(generator, wejscie)) - set(_POLA_TOZSAMOSCI) == pola


# ---------------------------------------------------------------------------
# Źródła pól w modelu — deklaracja kreatora OZE × wiązania konfiguratora DER
# ---------------------------------------------------------------------------


def test_payload_carries_frt_capability_flags() -> None:
    payload = AddConverterSourcePayload(
        source_technology="PV",
        connection_variant="nn_side",
        station_ref="ST1",
        bus_nn_ref="BUS_NN",
        has_lvrt_curve=True,
        has_hvrt_curve=False,
    )
    assert payload.has_lvrt_curve is True
    assert payload.has_hvrt_curve is False


@pytest.mark.parametrize(
    ("meta", "tabliczka", "lvrt", "hvrt"),
    [
        ({"has_lvrt_curve": True, "has_hvrt_curve": True}, None, True, True),
        ({}, {"profiles": {"lvrt_curve_ref": "enea"}}, True, False),
        ({}, {"profiles": {"hvrt_curve_ref": "enea"}}, False, True),
        ({"has_lvrt_curve": False}, {"profiles": {"lvrt_curve_ref": ""}}, False, False),
        ({"has_lvrt_curve": "tak"}, None, False, False),  # nie-bool NIE jest deklaracją
    ],
)
def test_frt_z_deklaracji_kreatora_lub_wiazania_profilu(
    meta: dict, tabliczka: dict | None, lvrt: bool, hvrt: bool
) -> None:
    wejscie = build_ncrfg_module_input_from_generator(
        _generator(meta, tabliczka=tabliczka), voltage_kv=15.0, operator_id=_OPERATOR
    )
    assert (wejscie.has_lvrt_curve, wejscie.has_hvrt_curve) == (lvrt, hvrt)


def test_pf_droop_z_wartosci_statyzmu_lub_profilu_pf() -> None:
    z_wartosci = build_ncrfg_module_input_from_generator(
        _generator({"frequency_droop_percent": 4.0, "lfsm_deadband_hz": 0.1}),
        voltage_kv=15.0,
        operator_id=_OPERATOR,
    )
    z_profilu = build_ncrfg_module_input_from_generator(
        _generator({}, tabliczka={"profiles": {"pf_curve_ref": "enea"}}),
        voltage_kv=15.0,
        operator_id=_OPERATOR,
    )
    bez = build_ncrfg_module_input_from_generator(
        _generator({"frequency_droop_percent": 0.0}), voltage_kv=15.0, operator_id=_OPERATOR
    )
    assert (z_wartosci.has_pf_droop, z_wartosci.droop_percent, z_wartosci.dead_band_hz) == (
        True,
        4.0,
        0.1,
    )
    assert (z_profilu.has_pf_droop, z_profilu.droop_percent) == (True, None)
    assert (bez.has_pf_droop, bez.droop_percent) == (False, None)


def test_qu_z_nachylenia_lub_trybu_regulacji() -> None:
    by_slope = build_ncrfg_module_input_from_generator(
        _generator({"qu_slope_pu_per_pu": 2.0}), voltage_kv=15.0, operator_id=_OPERATOR
    )
    by_mode = build_ncrfg_module_input_from_generator(
        _generator({"control_mode": "Q_OD_U"}), voltage_kv=15.0, operator_id=_OPERATOR
    )
    none = build_ncrfg_module_input_from_generator(
        _generator({"control_mode": "STALY_COS_PHI"}), voltage_kv=15.0, operator_id=_OPERATOR
    )
    assert (by_slope.has_qu_curve, by_mode.has_qu_curve, none.has_qu_curve) == (True, True, False)


def test_cos_phi_i_zakres_q_w_bazie_pn() -> None:
    wejscie = build_ncrfg_module_input_from_generator(
        _generator({"cos_phi": 0.95, "q_min_mvar": -0.66, "q_max_mvar": 0.66}, p_mw=2.0),
        voltage_kv=15.0,
        operator_id=_OPERATOR,
    )
    assert wejscie.cos_phi_min == 0.95
    assert wejscie.q_range_pct_pn_min == pytest.approx(-0.33)
    assert wejscie.q_range_pct_pn_max == pytest.approx(0.33)
    bez = build_ncrfg_module_input_from_generator(
        _generator({"cos_phi": 0.0, "q_min_mvar": "brak"}), voltage_kv=15.0, operator_id=_OPERATOR
    )
    assert (bez.cos_phi_min, bez.q_range_pct_pn_min, bez.q_range_pct_pn_max) == (None, None, None)


# ---------------------------------------------------------------------------
# Dowód certyfikatu: tabliczka × rejestr wykazu PTPiREE (serwer, nigdy klient)
# ---------------------------------------------------------------------------


def _weryfikuj(tabliczka: dict, data_umowy: date | None = None):
    return weryfikacja_certyfikatu(
        "DER1", tabliczka, profile=load_nc_rfg_profile(_OPERATOR), data_umowy=data_umowy
    )


def test_dowod_certyfikatu_z_rekordu_rejestru_nie_z_tabliczki() -> None:
    """Intencja zachowana (dawny dowód z tabliczki): dokument formalny cytuje numer
    dokumentu, wersje WOS/WiPWC, zakres, warunek ważności i źródło — teraz Z REKORDU
    rejestru dopasowanego po referencji tabliczki, a podstawa dowodu to rejestr wskazany
    przez warstwę WiPWC profilu (stan z profilu, nigdy podnoszony)."""
    rekord = f.rekord_wykazu("A", warunek=True)
    dowod = _weryfikuj(f.tabliczka(rekord))
    assert isinstance(dowod, DowodCertyfikatu)
    parametry = rekord["params"]
    assert dowod.rekord_id == rekord["id"]
    assert (dowod.producent, dowod.model) == (parametry["manufacturer"], parametry["model"])
    assert dowod.numer_dokumentu == parametry["document_number"]
    assert dowod.wersja_wipwc == parametry["wipwc_version"]
    assert dowod.zakres_typow == ("A",)
    assert dowod.warunek_waznosci == parametry["certificate_condition"]
    assert dowod.adres_zrodla == parametry["source_url"]
    assert dowod.podstawa.rodzaj == "WIPWC"
    assert f"s. {parametry['source_page']}, poz. {parametry['source_row']}" == (
        dowod.podstawa.jednostka_redakcyjna
    )
    assert dowod.podstawa.status != "ZWERYFIKOWANE"


def test_teksty_dowodu_certyfikatu_bez_identyfikatora_rekordu_i_sciezki_rejestru() -> None:
    """Karta #145 — iloczyn cech {opis dowodu w sekcji dokumentu, uwagi podstawy} ×
    {identyfikator rekordu rejestru, ścieżka pliku rejestru, nazwa schematu}: tekst dla
    projektanta nazywa rekord polami wykazu (producent, model, numer dokumentu), nie
    kluczem rejestru ani plikiem repozytorium. Identyfikator rekordu zostaje w danych."""
    from application.analyses.sekcja_zgodnosci_ncrfg import opis_dowodu_certyfikatu

    rekord = f.rekord_wykazu("A", warunek=True)
    dowod = _weryfikuj(f.tabliczka(rekord))
    assert isinstance(dowod, DowodCertyfikatu)
    profil = load_nc_rfg_profile(f.OPERATOR)
    teksty = [opis_dowodu_certyfikatu(dowod), dowod.podstawa.uwagi_pl or ""]
    for tekst in teksty:
        assert dowod.rekord_id not in tekst
        assert profil.wipwc.rejestr.plik not in tekst
        assert profil.wipwc.rejestr.schemat not in tekst
    assert dowod.producent in teksty[0] and dowod.numer_dokumentu in teksty[0]


def _rekord_o_wersji(wersja: str) -> dict:
    return f.rekord_wykazu("A,B", wersja=wersja)


@pytest.mark.parametrize(
    ("przypadek", "tabliczka", "data_umowy", "fragment"),
    [
        ("brak_wskazania", {}, None, None),
        ("niepowiazany", {"ptpiree_status": "NIEPOWIAZANY"}, None, None),
        (
            "powiazany_bez_referencji",
            {"ptpiree_status": "POWIAZANY"},
            None,
            "bez wskazania rekordu wykazu",
        ),
        (
            "rekord_nieistniejacy",
            {"ptpiree_certificate_ref": "ptpiree-nie-ma-takiego-rekordu"},
            None,
            "nie istnieje w rejestrze",
        ),
        (
            "numer_dokumentu_przeczy",
            {"__zmien__": {"ptpiree_document_number": "INNY/1"}},
            None,
            "przeczy rekordowi",
        ),
        (
            "zakres_przeczy",
            {"__zmien__": {"ptpiree_ppm_scope": "D"}},
            None,
            "przeczy rekordowi",
        ),
        (
            "wersja_przeczy",
            {"__zmien__": {"ptpiree_wipwc_version": "9.9"}},
            None,
            "przeczy rekordowi",
        ),
        ("data_przed_oknem_1_3", {"__wersja__": "1.3"}, date(2024, 1, 1), "poza oknem"),
        ("data_po_oknie_1_2", {"__wersja__": "1.2"}, date(2027, 1, 1), "poza oknem"),
        ("data_w_oknie_1_2", {"__wersja__": "1.2"}, date(2025, 6, 1), None),
    ],
)
def test_weryfikacja_tabliczki_iloczyn_przypadkow(
    przypadek: str, tabliczka: dict, data_umowy: date | None, fragment: str | None
) -> None:
    if "__zmien__" in tabliczka:
        dane = f.tabliczka(_rekord_o_wersji("1.3"), **tabliczka["__zmien__"])
    elif "__wersja__" in tabliczka:
        dane = f.tabliczka(_rekord_o_wersji(tabliczka["__wersja__"]))
    else:
        dane = tabliczka
    wynik = _weryfikuj(dane, data_umowy)
    if przypadek in ("brak_wskazania", "niepowiazany"):
        assert wynik is None
    elif fragment is None:
        assert isinstance(wynik, DowodCertyfikatu), przypadek
    else:
        assert isinstance(wynik, NcRfgCertyfikatOdrzucony), przypadek
        assert fragment in wynik.powod_pl
        assert "brak dowodu" in wynik.powod_pl


def test_zakres_typow_nieznany_i_pusty() -> None:
    pusty = next(
        r for r in get_all_ptpiree_generator_certificates() if r["params"].get("ppm_scope") == ""
    )
    dowod = _weryfikuj(f.tabliczka(pusty))
    # Pusty zakres typów: dowód istnieje, ale nie pokrywa żadnego typu.
    if isinstance(dowod, DowodCertyfikatu):
        assert dowod.zakres_typow == ()
        assert not dowod.pokrywa("A")
    else:
        assert isinstance(dowod, NcRfgCertyfikatOdrzucony)


def test_model_dynamiczny_z_wiazania_katalogu() -> None:
    z_modelem = build_ncrfg_module_input_from_generator(
        _generator({}, tabliczka={"dynamic_model_ref": "default_pv_gfl"}),
        voltage_kv=15.0,
        operator_id=_OPERATOR,
    )
    bez = build_ncrfg_module_input_from_generator(
        _generator({}, tabliczka={"dynamic_model_ref": None}),
        voltage_kv=15.0,
        operator_id=_OPERATOR,
    )
    assert (z_modelem.has_dynamic_model, bez.has_dynamic_model) == (True, False)


@pytest.mark.parametrize(
    ("gen_type", "der_kind"),
    [
        ("pv_inverter", "PV"),
        ("bess", "BESS"),
        ("wind_inverter", "FW"),
        ("fw_pmsg", "FW"),
        ("fw_dfig", "FW"),
        ("fw_scig", "FW"),
    ],
)
def test_rodzaj_modulu_z_gen_type(gen_type: str, der_kind: str) -> None:
    wejscie = build_ncrfg_module_input_from_generator(
        _generator({}, gen_type=gen_type), voltage_kv=15.0, operator_id=_OPERATOR
    )
    assert (wejscie.der_kind, wejscie.module_family) == (der_kind, "PPM")


# ---------------------------------------------------------------------------
# Lista z modelu: pominięcia z nazwanym powodem, kolejność, determinizm
# ---------------------------------------------------------------------------


def test_lista_z_enm_pomija_nie_falownik_i_nazywa_der_bez_mocy_lub_szyny() -> None:
    enm = _model(
        [
            _generator({"has_hvrt_curve": True}, ref_id="DER1"),
            _generator({}, ref_id="SYN1", gen_type="synchronous"),
            _generator({}, ref_id="DER_ORPHAN", bus_ref="BRAK"),
            _generator({}, ref_id="DER_ZERO", p_mw=0.0),
        ]
    )
    wejscia = build_ncrfg_module_inputs_from_enm(enm, operator_id=_OPERATOR)
    assert [m.der_ref for m in wejscia.modules] == ["DER1"]
    assert wejscia.modules[0].has_hvrt_curve is True
    assert [(p.der_ref, p.powod) for p in wejscia.pominiete] == [
        ("DER_ORPHAN", "brak_napiecia"),
        ("DER_ZERO", "brak_mocy"),
    ]
    assert all(p.powod_pl for p in wejscia.pominiete)


def test_bridge_is_deterministic() -> None:
    gen = _generator({"has_lvrt_curve": True, "qu_slope_pu_per_pu": 2.0})
    first = build_ncrfg_module_input_from_generator(gen, voltage_kv=15.0, operator_id=_OPERATOR)
    second = build_ncrfg_module_input_from_generator(gen, voltage_kv=15.0, operator_id=_OPERATOR)
    assert first.model_dump() == second.model_dump()


# ---------------------------------------------------------------------------
# Serwis zgodności przypadku: {0, 1, N} DER × dane {kompletne, niekompletne, certyfikat}
# ---------------------------------------------------------------------------


def test_zero_der_daje_uczciwy_stan_zerowy_bez_biegu() -> None:
    odpowiedz = zgodnosc_ncrfg_przypadku(_model([]), operator_id=_OPERATOR, case_id="case-0")
    assert isinstance(odpowiedz, NcRfgCaseComplianceResponse)
    assert (odpowiedz.der_count, odpowiedz.pominiete, odpowiedz.bieg) == (0, [], None)


def test_tylko_pominiete_der_daje_der_count_zero_i_liste_powodow() -> None:
    odpowiedz = zgodnosc_ncrfg_przypadku(
        _model([_generator({}, ref_id="DER_ZERO", p_mw=0.0)]),
        operator_id=_OPERATOR,
        case_id="case-0",
    )
    assert odpowiedz.der_count == 0
    assert odpowiedz.bieg is None
    assert [p.powod for p in odpowiedz.pominiete] == ["brak_mocy"]


def test_jeden_der_dane_niekompletne_daja_no_data_na_testach_wymaganych() -> None:
    odpowiedz = zgodnosc_ncrfg_przypadku(
        _model([_generator({})]), operator_id=_OPERATOR, case_id="case-1"
    )
    assert odpowiedz.der_count == 1 and odpowiedz.bieg is not None
    modul = odpowiedz.bieg.modules[0]
    assert modul.module_type == "B"
    assert modul.zrodlo_danych == "ZATWIERDZONY_MODEL"
    assert "overall_status" not in modul.model_dump()
    assert any(t.required and t.verdict == "no_data" for t in modul.tests)
    werdykty = {t.test_id: t.verdict for t in modul.tests}
    # T14 LVRT wymagany dla B; bez krzywej/modelu dynamicznego = no_data (nie fabrykacja).
    assert werdykty["T14"] == "no_data"
    assert set(werdykty.values()) <= {"pass", "fail", "no_data", "not_required"}
    assert all(re.fullmatch(r"T\d{2}", test_id) for test_id in werdykty)


def test_jeden_der_dane_kompletne_testy_dynamiczne_bez_biegu_sa_niewykonane() -> None:
    """ODWRÓCONY test maskujący (karta AB-1a Pakiet C pkt 14): dawniej flaga
    ``has_lvrt_curve``/``has_hvrt_curve`` z modelu dawała T14/T15 ``pass`` — deklaracja
    krzywej „wykazywała" zachowanie dynamiczne, którego nikt nie policzył. Teraz T14/T15
    bez biegu dynamiki to ocena niewykonana z nazwanym brakiem, a porównanie deklaracji
    daje wynik tylko tam, gdzie twierdzenie jest konfiguracyjne (zakres Q, PMAX)."""
    odpowiedz = zgodnosc_ncrfg_przypadku(
        _model([_generator(_META_KOMPLETNE, tabliczka={"dynamic_model_ref": "default_pv_gfl"})]),
        operator_id=_OPERATOR,
        case_id="case-1",
    )
    assert odpowiedz.bieg is not None
    modul = odpowiedz.bieg.modules[0]
    testy = {t.test_id: t for t in modul.tests}
    for test_id in ("T14", "T15"):
        assert testy[test_id].verdict == "no_data"
        assert testy[test_id].ocena.status_maszynowy == "NIE_OCENIONO"
        assert any("bieg dynamiki" in b for b in testy[test_id].ocena.wyjasnienie.czego_brakuje)
    # Zakres Q (T09) i PMAX (T10) — wynik z danych modelu (podstawa profilu NIEUSTALONE →
    # werdykt niewydany, ale wartość jest oceniona, nie „brak danych").
    for test_id in ("T09", "T10"):
        assert testy[test_id].ocena.wynik is not None
    # Deklaracje BEZ nośnika w modelu (rampa P, wzmocnienie, czas odbudowy) — brak wyniku,
    # most ich nie wymyśla.
    for test_id in ("T05", "T16", "T17"):
        assert testy[test_id].ocena.wynik is None, test_id


def test_certyfikat_ptpiree_z_tabliczki_zwalnia_z_testow_warunkowych_i_niesie_dowod() -> None:
    bez_cert = zgodnosc_ncrfg_przypadku(
        _model([_generator({})]), operator_id=_OPERATOR, case_id="case-1"
    )
    z_cert = zgodnosc_ncrfg_przypadku(
        _model([_generator({}, tabliczka=_TABLICZKA_POWIAZANA)]),
        operator_id=_OPERATOR,
        case_id="case-1",
    )
    assert bez_cert.bieg is not None and z_cert.bieg is not None
    m_bez, m_z = bez_cert.bieg.modules[0], z_cert.bieg.modules[0]
    assert m_bez.dowod_certyfikatu is None
    assert m_z.dowod_certyfikatu is not None
    # Rekord HUAWEI SUN2000-215KTL-H3 obejmuje typy A i B → T12/T13 (wymagane dla B tylko
    # bez certyfikatu obejmującego typ) zwolnione.
    assert m_z.dowod_certyfikatu.pokrywa("B")
    wymagane_bez = {t.test_id for t in m_bez.tests if t.required}
    wymagane_z = {t.test_id for t in m_z.tests if t.required}
    assert {"T12", "T13"} <= wymagane_bez
    assert not ({"T12", "T13"} & wymagane_z)
    # Dowód z rekordu rejestru dopasowanego do tabliczki TEGO modelu.
    assert m_z.dowod_certyfikatu.numer_dokumentu == (
        _TABLICZKA_POWIAZANA["ptpiree_document_number"]
    )
    assert m_z.dowod_certyfikatu.rekord_id == _TABLICZKA_POWIAZANA["ptpiree_certificate_ref"]


def test_n_der_w_kolejnosci_modelu_z_ocena_wymagan() -> None:
    enm = _model(
        [
            _generator(_META_KOMPLETNE, ref_id="PV_A", tabliczka=_TABLICZKA_POWIAZANA),
            _generator({}, ref_id="BESS_B", gen_type="bess", p_mw=1.5),
            _generator({}, ref_id="FW_C", gen_type="fw_pmsg", p_mw=3.0),
        ]
    )
    odpowiedz = zgodnosc_ncrfg_przypadku(enm, operator_id=_OPERATOR, case_id="case-n")
    assert odpowiedz.der_count == 3 and odpowiedz.bieg is not None
    assert [m.der_ref for m in odpowiedz.bieg.modules] == ["PV_A", "BESS_B", "FW_C"]
    assert [m.der_name for m in odpowiedz.bieg.modules] == ["Blok PV_A", "Blok BESS_B", "Blok FW_C"]
    bieg = odpowiedz.bieg
    assert [o.der_ref for o in bieg.ocena_wymagan] == ["PV_A", "BESS_B", "FW_C"]
    assert [m.technologia for m in bieg.modules] == ["PPM", "MAGAZYN", "PPM"]
    assert [m.dowod_certyfikatu is not None for m in bieg.modules] == [True, False, False]
    profil = load_nc_rfg_profile(_OPERATOR)
    for ocena in bieg.ocena_wymagan:
        assert [w.wymaganie_id for w in ocena.wymagania] == [w.id for w in profil.wymagania]


def test_serwis_jest_deterministyczny() -> None:
    enm = _model([_generator(_META_KOMPLETNE, tabliczka=_TABLICZKA_POWIAZANA)])
    a = zgodnosc_ncrfg_przypadku(enm, operator_id=_OPERATOR, case_id="case-d")
    b = zgodnosc_ncrfg_przypadku(enm, operator_id=_OPERATOR, case_id="case-d")
    assert a.model_dump() == b.model_dump()


# ---------------------------------------------------------------------------
# Trasa HTTP: operator {znany, nieznany}, przypadek realny, parytet /run vs /compliance
# ---------------------------------------------------------------------------


def _nowy_przypadek(client) -> str:
    """Utwórz REALNY projekt + przypadek przez API; zwróć `case_id`.

    CV-1-W: przypadek bez wiersza w bazie dostaje 404 z magazynu ENM
    (inwariant I-2) — testy tego pliku potrzebują prawdziwej pary
    projekt+przypadek zamiast dowolnego UUID-a.
    """
    project_resp = client.post("/api/projects", json={"name": "NC RfG jeden tor — test"})
    assert project_resp.status_code == 201, project_resp.text
    project_id = project_resp.json()["id"]
    case_resp = client.post(
        "/api/study-cases", json={"project_id": project_id, "name": "Przypadek testu"}
    )
    assert case_resp.status_code == 201, case_resp.text
    return str(case_resp.json()["id"])


def _model_z_der() -> EnergyNetworkModel:
    return _model(
        [
            _generator(_META_KOMPLETNE, ref_id="DER1", tabliczka=_TABLICZKA_POWIAZANA),
            _generator({}, ref_id="DER_ZERO", p_mw=0.0),
        ]
    )


def test_compliance_endpoint_runs_from_model_with_run_contract() -> None:
    from api.main import app
    from application.twin_key import klucz_twin_dla_przypadku
    from enm.store import reset_enm_store, set_enm
    from fastapi.testclient import TestClient

    reset_enm_store()

    # CV-1-W: `TestClient(app)` bez `with` NIE uruchamia lifespan — `with` wymusza
    # świeży lifespan związany z `DATABASE_URL` ustawionym przez ten test.
    with TestClient(app) as client:
        case_id = _nowy_przypadek(client)
        klucz = klucz_twin_dla_przypadku(case_id, client.app.state.uow_factory)
        set_enm(klucz, _model_z_der())

        resp = client.get(
            f"/api/ncrfg-tests/cases/{case_id}/compliance", params={"operator_id": _OPERATOR}
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert set(body) == {
            "case_id",
            "operator_id",
            "der_count",
            "pominiete",
            "certyfikaty_odrzucone",
            "bieg",
        }
        assert body["case_id"] == case_id
        assert body["der_count"] == 1
        assert [(p["der_ref"], p["powod"]) for p in body["pominiete"]] == [
            ("DER_ZERO", "brak_mocy")
        ]
        assert body["certyfikaty_odrzucone"] == []
        bieg = body["bieg"]
        assert bieg["contract"] == "NcRfgPtpireeTestResultV2"
        modul = bieg["modules"][0]
        assert modul["der_ref"] == "DER1"
        assert modul["zrodlo_danych"] == "ZATWIERDZONY_MODEL"
        assert modul["dowod_certyfikatu"]["numer_dokumentu"] == (
            _TABLICZKA_POWIAZANA["ptpiree_document_number"]
        )
        assert [o["der_ref"] for o in bieg["ocena_wymagan"]] == ["DER1"]
        # Pola dowodowe S-1 i agregaty SKASOWANE — zastąpione kompletnością rekordów.
        for pole in (
            "certificate_evidence",
            "reporting_status",
            "proof_status",
            "evidence_limitations",
            "evidence_note_pl",
            "evidence_per_module",
            "evidence_by_test",
        ):
            assert pole not in bieg, pole
        assert "overall_status" not in modul and "certificate_status" not in modul
        # Dawny kontrakt drugiego silnika ZNIKA — bez aliasów (zero kompatybilności wstecznej).
        assert not ({"reports", "overall_pass", "passed_count", "no_module_count"} & set(body))
        assert "no_module" not in resp.text


def test_compliance_endpoint_zero_der_returns_no_run() -> None:
    from api.main import app
    from application.twin_key import klucz_twin_dla_przypadku
    from enm.store import reset_enm_store, set_enm
    from fastapi.testclient import TestClient

    reset_enm_store()
    with TestClient(app) as client:
        case_id = _nowy_przypadek(client)
        klucz = klucz_twin_dla_przypadku(case_id, client.app.state.uow_factory)
        set_enm(klucz, _model([]))

        resp = client.get(
            f"/api/ncrfg-tests/cases/{case_id}/compliance", params={"operator_id": _OPERATOR}
        )
        assert resp.status_code == 200, resp.text
        assert resp.json() == {
            "case_id": case_id,
            "operator_id": _OPERATOR,
            "der_count": 0,
            "pominiete": [],
            "certyfikaty_odrzucone": [],
            "bieg": None,
        }


def test_compliance_endpoint_rejects_unknown_operator() -> None:
    from api.main import app
    from application.twin_key import klucz_twin_dla_przypadku
    from enm.store import reset_enm_store, set_enm
    from fastapi.testclient import TestClient

    reset_enm_store()
    with TestClient(app) as client:
        case_id = _nowy_przypadek(client)
        klucz = klucz_twin_dla_przypadku(case_id, client.app.state.uow_factory)
        set_enm(klucz, _model_z_der())

        resp = client.get(
            f"/api/ncrfg-tests/cases/{case_id}/compliance", params={"operator_id": "nieistnieje"}
        )
        assert resp.status_code == 404
        # Przypina WŁAŚCIWY powód (operator, nie tłumaczenie case_id) — bez
        # tego dwa różne 404 (case bez projektu vs. nieznany operator) byłyby
        # nierozróżnialne dla tego testu (test maskujący defekt).
        assert "nieistnieje" in resp.json()["detail"]


def test_wejscia_endpoint_niesie_wejscia_mostu_i_pochodzenie() -> None:
    """`GET …/cases/{id}/wejscia`: moduły = wejścia mostu (te same, które ocenia
    `/compliance`), z polami liczonymi z `meta` (statyzm, martwa strefa, cosφ, zakresy Q,
    Q(U), krzywe FRT z deklaracji kreatora) i ich pochodzeniem; DER bez mocy — pominięty."""
    from api.main import app
    from application.twin_key import klucz_twin_dla_przypadku
    from enm.store import reset_enm_store, set_enm
    from fastapi.testclient import TestClient

    reset_enm_store()
    enm = _model_z_der()
    with TestClient(app) as client:
        case_id = _nowy_przypadek(client)
        klucz = klucz_twin_dla_przypadku(case_id, client.app.state.uow_factory)
        set_enm(klucz, enm)

        resp = client.get(
            f"/api/ncrfg-tests/cases/{case_id}/wejscia", params={"operator_id": _OPERATOR}
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert set(body) == {"case_id", "operator_id", "modules", "pola_z_modelu", "pominiete"}
    assert (body["case_id"], body["operator_id"]) == (case_id, _OPERATOR)
    most = build_ncrfg_module_inputs_from_enm(enm, operator_id=_OPERATOR)
    assert body["modules"] == [m.model_dump(mode="json") for m in most.modules]
    (modul,) = body["modules"]
    assert modul["droop_percent"] == 5.0 and modul["dead_band_hz"] == 0.2
    assert modul["cos_phi_min"] == 0.95
    assert modul["q_range_pct_pn_min"] is not None and modul["q_range_pct_pn_max"] is not None
    assert modul["has_qu_curve"] and modul["has_lvrt_curve"] and modul["has_hvrt_curve"]
    assert set(body["pola_z_modelu"]) == {"DER1"}
    assert {
        "droop_percent",
        "dead_band_hz",
        "cos_phi_min",
        "q_range_pct_pn_min",
        "q_range_pct_pn_max",
        "has_qu_curve",
        "has_lvrt_curve",
        "has_hvrt_curve",
        "has_pf_droop",
    } <= set(body["pola_z_modelu"]["DER1"])
    assert not set(body["pola_z_modelu"]["DER1"]) & POLA_WEJSCIA_SPOZA_MODELU
    assert [(p["der_ref"], p["powod"]) for p in body["pominiete"]] == [("DER_ZERO", "brak_mocy")]
    # Wejście modułu nie niesie certyfikatu — dowód wyprowadza wyłącznie serwer (`/compliance`).
    assert "dowod_certyfikatu" not in modul and "certificate_status" not in modul


def test_wejscia_endpoint_zero_der_i_nieznany_operator() -> None:
    from api.main import app
    from application.twin_key import klucz_twin_dla_przypadku
    from enm.store import reset_enm_store, set_enm
    from fastapi.testclient import TestClient

    reset_enm_store()
    with TestClient(app) as client:
        case_id = _nowy_przypadek(client)
        klucz = klucz_twin_dla_przypadku(case_id, client.app.state.uow_factory)
        set_enm(klucz, _model([]))
        pusty = client.get(
            f"/api/ncrfg-tests/cases/{case_id}/wejscia", params={"operator_id": _OPERATOR}
        )
        nieznany = client.get(
            f"/api/ncrfg-tests/cases/{case_id}/wejscia", params={"operator_id": "nieistnieje"}
        )
    assert pusty.status_code == 200, pusty.text
    assert pusty.json() == {
        "case_id": case_id,
        "operator_id": _OPERATOR,
        "modules": [],
        "pola_z_modelu": {},
        "pominiete": [],
    }
    assert nieznany.status_code == 404
    assert "nieistnieje" in nieznany.json()["detail"]


@pytest.mark.parametrize("z_certyfikatem", [False, True])
def test_parytet_run_i_compliance_dla_tego_samego_der(z_certyfikatem: bool) -> None:
    """Ten sam DER przez `/run` (wejście odczytane z `GET …/wejscia` i wysłane jawnie — jak
    formularz wstępny macierzy) i przez `/compliance` (z modelu): JEDEN solver i JEDNA koperta — te same kryteria, wyniki,
    limity i statusy rekordów testów (intencja zachowana), ale RÓŻNE źródło danych: bieg
    „co-jeśli" niesie dane przyjęte bez walidacji (dowód niepełny), nie ma certyfikatu
    (ciało żądania nie ma na niego pola), więc testy zwalniane certyfikatem wracają jako
    wymagane, a odcisk wejścia różni się źródłem danych."""
    from api.main import app
    from application.twin_key import klucz_twin_dla_przypadku
    from enm.store import reset_enm_store, set_enm
    from fastapi.testclient import TestClient

    reset_enm_store()
    tabliczka = _TABLICZKA_POWIAZANA if z_certyfikatem else None
    enm = _model([_generator(_META_KOMPLETNE, ref_id="DER1", tabliczka=tabliczka)])
    with TestClient(app) as client:
        case_id = _nowy_przypadek(client)
        klucz = klucz_twin_dla_przypadku(case_id, client.app.state.uow_factory)
        set_enm(klucz, enm)

        z_modelu = client.get(
            f"/api/ncrfg-tests/cases/{case_id}/compliance", params={"operator_id": _OPERATOR}
        )
        assert z_modelu.status_code == 200, z_modelu.text
        # Ciało biegu „co-jeśli" = formularz wstępny macierzy bez edycji: moduły odczytane
        # z `GET …/wejscia` (ten sam most co `/compliance`).
        wejscia = client.get(
            f"/api/ncrfg-tests/cases/{case_id}/wejscia", params={"operator_id": _OPERATOR}
        )
        assert wejscia.status_code == 200, wejscia.text
        reczny = client.post("/api/ncrfg-tests/run", json={"modules": wejscia.json()["modules"]})
        assert reczny.status_code == 200, reczny.text

    modul_z_modelu = z_modelu.json()["bieg"]["modules"][0]
    modul_reczny = reczny.json()["modules"][0]
    assert z_modelu.json()["bieg"]["input_hash"] != reczny.json()["input_hash"]
    assert modul_z_modelu["zrodlo_danych"] == "ZATWIERDZONY_MODEL"
    assert modul_reczny["zrodlo_danych"] == "ZADANIE_KLIENTA"
    assert modul_reczny["dowod_certyfikatu"] is None
    assert (modul_z_modelu["dowod_certyfikatu"] is not None) is z_certyfikatem
    zwolnione = set()
    for test_modelu, test_reczny in zip(
        modul_z_modelu["tests"], modul_reczny["tests"], strict=True
    ):
        if test_modelu["required"] != test_reczny["required"]:
            # Jedyny powód różnicy stosowalności: certyfikat modelu zwalnia test (nigdy
            # odwrotnie — bieg „co-jeśli" nie ma certyfikatu).
            assert z_certyfikatem
            assert (test_modelu["required"], test_reczny["required"]) == (False, True)
            zwolnione.add(test_modelu["test_id"])
            continue
        ocena_m, ocena_r = test_modelu["ocena"], test_reczny["ocena"]
        for pole in ("kryterium", "wynik", "limit", "margines", "status_maszynowy"):
            assert ocena_m[pole] == ocena_r[pole], (test_modelu["test_id"], pole)
        if test_reczny["required"]:
            assert ocena_r["kompletnosc_dowodu"] == "NIEPELNY"
            assert ocena_r["dowod"]["status_danych"]["stan"] == "UNVALIDATED_INPUT"
            assert ocena_m["dowod"]["status_danych"]["stan"] == "ZWALIDOWANE"
    assert ({"T12", "T13"} <= zwolnione) is z_certyfikatem


def test_weryfikacje_typu_katalogowego_dla_dokumentu_studium() -> None:
    """Intencja zachowana (dawne ``dowody_certyfikatu_typu``): dokument studium identyfikuje
    urządzenie TYPEM katalogowym — weryfikacja idzie po ``catalog_item_id`` tabliczki, tą
    samą funkcją co moduły biegu; dowód typu nie przykleja się do innego typu, a typ bez
    urządzenia w modelu daje pustą listę (stan zerowy dokumentu)."""
    inna_tabliczka = {"catalog_item_id": "conv-inny-typ"}
    enm = _model(
        [
            _generator({}, ref_id="DER1", tabliczka=_TABLICZKA_POWIAZANA),
            _generator({}, ref_id="DER2", tabliczka=inna_tabliczka),
            _generator({}, ref_id="DER3", tabliczka=dict(_TABLICZKA_POWIAZANA)),
        ]
    )
    typ = _TABLICZKA_POWIAZANA["catalog_item_id"]
    weryfikacje = weryfikacje_certyfikatow_typu(enm, typ, operator_id=_OPERATOR)
    assert [der_ref for der_ref, _ in weryfikacje] == ["DER1", "DER3"]
    assert all(isinstance(w, DowodCertyfikatu) for _, w in weryfikacje)
    assert weryfikacje_certyfikatow_typu(enm, "conv-inny-typ", operator_id=_OPERATOR) == [
        ("DER2", None)
    ]
    assert weryfikacje_certyfikatow_typu(enm, "conv-brak", operator_id=_OPERATOR) == []
