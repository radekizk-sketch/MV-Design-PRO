"""Orkiestracja wejścia pakietu LV_CIRCUIT_VERIFICATION (karta P0.10, G-21).

Łączy istniejące dostawcy wyników — pętlę zwarcia + SWZ (`application.analyses.
fault_loop`/`swz`, P0.6), obciążalność Iz′ (`network_model.solvers.
cable_ampacity_derating`, P0.5a), wytrzymałość cieplną I²t≤k²S² (`network_model.
solvers.conductor_thermal_withstand`, F-K1/P0.5a) — w JEDNO wejście pakietu
`LVCircuitVerificationInput`. Ta warstwa (`application/proof_engine/`) importuje
z `application/analyses/**` i `network_model/solvers/**` (jak `vdrop_chain_binding.py`
— zob. jego docstring dla uzasadnienia umiejscowienia względem arch_guard).

REUSE wzorca prywatnych helperów `fault_loop.service` (ekstrakcja stacji/
transformatora/upstream) — DOKŁADNIE ten sam import i to samo uzasadnienie co
`application.analyses.swz.service` i `application.analyses.nn_device_selection`
(patrz docstring tamtych modułów): Ik1_min/U0 dla obwodu NIE zależą od tego,
który dowód o nie pyta, więc liczy się je RAZ tą samą fizyką.

REZOLUCJA URZĄDZENIA CHRONIĄCEGO OBWÓD (branch → `UrzadzenieOchronneNn`):
  - ``APARAT_NN_MCB`` (SwitchBranch): MCB — in_a/klasa_mcb/icn_ka wprost z
    ``materialized_params`` (kontrakt materializacji od początku istnienia
    namespace'u).
  - ``WKLADKA_NN`` (FuseBranch): wkładka topikowa — in_a WŁASNY wkładki (to
    ona ogranicza prąd obwodu, nie korpus rozłącznika — wzorzec
    `nn_device_selection.KandydatAparatuNn` docstring). Prąd warunkowy
    KOMBINACJI (`conditional_sc_current_ka`) jest własnością TYPU ROZŁĄCZNIKA
    (certyfikat typu wg IEC 60947-3), nie samej wkładki — wymaga WSKAZANIA
    branża rozłącznika (``apparatus_branch_ref``, opcjonalny parametr).
    Bez niego: NIEROZSTRZYGALNE (zero fabrykacji, nie zgadywanie).
  - ``APARAT_NN`` (SwitchBranch), ``device_kind=ROZLACZNIK_BEZPIECZNIKOWY``:
    rozłącznik bezpiecznikowy zidentyfikowany WPROST jako ``breaker_ref`` (bez
    osobnej wkładki wskazanej) — `conditional_sc_current_ka` czytany z TEJ
    SAMEJ gałęzi (własność typu rozłącznika, karta P0.10 fix materializacji
    APARAT_NN — zob. `network_model/catalog/types.py` MATERIALIZATION_CONTRACTS).
  - ``APARAT_NN``, ``device_kind`` inny (WYLACZNIK_GLOWNY/WYLACZNIK_ODPLYWOWY):
    MCCB — in_a=i_n_a, wlasna_zdolnosc_ka=i_cu_ka, ii_a resolwowany z
    ir_range/isd_range/ii_range materializacji (karta D2, nN „runda 8",
    2026-08-14 — REUSE `network_model.catalog.lv_mccb_settings_iec60947_2.
    resolwuj_nastawy_mccb`, TA SAMA formuła co dobór kandydata w
    `nn_device_selection.py` i weryfikacja w `application.analyses.swz.
    service._aparat_from_branch`; bez tego krok 10 SWZ dostawał `ii_a=None`
    dla KAŻDEGO zainstalowanego MCCB — NIEROZSTRZYGALNE mimo istniejącej
    gałęzi typ="MCCB" karty D1).

ZERO FABRYKACJI: brak kompletu danych katalogowych na gałęzi → ``(None, powod_pl)``,
NIGDY domyślna/zgadnięta wartość.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from application.analyses.fault_loop.service import petla_zwarcia_min_w_punkcie
from application.analyses.nn_device_selection import kandydat_z_urzadzenia, kryterium_i2
from application.analyses.swz.werdykt import AparatZabezpieczajacy, ocen_swz
from application.proof_engine.packs.lv_circuit_verification import (
    KIND_FUSE_SWITCH,
    KIND_MCB,
    KIND_MCCB,
    LVCircuitVerificationInput,
    StratyOdcinka,
    UrzadzenieOchronneNn,
)
from enm.models import EnergyNetworkModel, FuseBranch, SwitchBranch
from enm.nazwy_elementow import ELEMENT_SPOZA_MODELU, nazwa_elementu
from network_model.catalog.lv_mccb_settings_iec60947_2 import resolwuj_nastawy_mccb
from network_model.odmowa_danych import OdmowaDanychError
from network_model.solvers.cable_ampacity_derating import (
    WARUNKI_KATALOGOWE,
    WspolczynnikiObciazalnosciNN,
    obciazalnosc_skorygowana,
)
from network_model.solvers.conductor_thermal_withstand import ConductorThermalResult


class LVCircuitVerificationInputError(OdmowaDanychError):
    """Wejście pakietu nie daje się złożyć uczciwie — powód po polsku, zero fabrykacji."""


def _find_branch(enm: EnergyNetworkModel, branch_ref: str) -> SwitchBranch | FuseBranch | None:
    branch = next((b for b in enm.branches if b.ref_id == branch_ref), None)
    if isinstance(branch, SwitchBranch | FuseBranch):
        return branch
    return None


def resolve_urzadzenie_ochronne(
    breaker: SwitchBranch | FuseBranch,
    *,
    apparatus_branch: SwitchBranch | FuseBranch | None = None,
) -> tuple[UrzadzenieOchronneNn | None, str | None]:
    """Wyławia ``UrzadzenieOchronneNn`` z gałęzi zainstalowanej na obwodzie.

    ``apparatus_branch`` — opcjonalna gałąź KORPUSU rozłącznika bezpiecznikowego
    (namespace ``APARAT_NN``, ``device_kind=ROZLACZNIK_BEZPIECZNIKOWY``), WYŁĄCZNIE
    gdy ``breaker`` sam jest wkładką (``WKLADKA_NN``) — dostarcza prąd warunkowy
    kombinacji. Ignorowana dla pozostałych namespace'ów.

    Zwraca ``(None, powod_pl)`` gdy gałąź nie ma kompletu danych katalogowych.
    """
    params = breaker.materialized_params if isinstance(breaker.materialized_params, dict) else None
    if not params:
        return None, (
            f"Aparat „{nazwa_elementu(breaker, 'branches')}” nie ma wiązania z katalogiem "
            "aparatury nN — wskaż jego typ z katalogu."
        )
    namespace = breaker.catalog_namespace

    if namespace == "APARAT_NN_MCB":
        in_a = params.get("in_a")
        klasa = params.get("curve_class")
        if in_a is None or klasa is None:
            return None, (
                f"Wyłącznik „{nazwa_elementu(breaker, 'branches')}” bez prądu znamionowego "
                "albo klasy wyzwalania w danych katalogowych."
            )
        return (
            UrzadzenieOchronneNn(
                kind=KIND_MCB,
                id=breaker.ref_id,
                nazwa=nazwa_elementu(breaker, "branches"),
                in_a=float(in_a),
                klasa_mcb=str(klasa),
                wlasna_zdolnosc_ka=(
                    float(params["icn_ka"]) if params.get("icn_ka") is not None else None
                ),
            ),
            None,
        )

    if namespace == "WKLADKA_NN":
        in_a = params.get("in_a")
        if in_a is None:
            return None, (
                f"Wkładka „{nazwa_elementu(breaker, 'branches')}” bez prądu znamionowego "
                "w danych katalogowych."
            )
        conditional_ka: float | None = None
        if apparatus_branch is not None:
            ap_params = (
                apparatus_branch.materialized_params
                if isinstance(apparatus_branch.materialized_params, dict)
                else None
            )
            if ap_params and ap_params.get("conditional_sc_current_ka") is not None:
                conditional_ka = float(ap_params["conditional_sc_current_ka"])
        return (
            UrzadzenieOchronneNn(
                kind=KIND_FUSE_SWITCH,
                id=breaker.ref_id,
                nazwa=nazwa_elementu(breaker, "branches"),
                in_a=float(in_a),
                conditional_sc_current_ka=conditional_ka,
            ),
            None,
        )

    if namespace == "APARAT_NN":
        in_a = params.get("i_n_a")
        if in_a is None:
            return None, (
                f"Aparat „{nazwa_elementu(breaker, 'branches')}” bez prądu znamionowego "
                "w danych katalogowych."
            )
        device_kind = params.get("device_kind")
        if device_kind == "ROZLACZNIK_BEZPIECZNIKOWY":
            return (
                UrzadzenieOchronneNn(
                    kind=KIND_FUSE_SWITCH,
                    id=breaker.ref_id,
                    nazwa=nazwa_elementu(breaker, "branches"),
                    in_a=float(in_a),
                    conditional_sc_current_ka=(
                        float(params["conditional_sc_current_ka"])
                        if params.get("conditional_sc_current_ka") is not None
                        else None
                    ),
                ),
                None,
            )
        # Karta D2 (nN, „runda 8", 2026-08-14): Ii resolwowany z zakresu
        # regulacji materializacji (REUSE — JEDNO miejsce z doborem kandydata
        # w `nn_device_selection.py` i weryfikacją SWZ w `swz/service.py`,
        # zob. docstring `resolwuj_nastawy_mccb`) — bez tego krok 10 SWZ
        # (`ocen_swz`, typ="MCCB") dostawał `ii_a=None` dla KAŻDEGO
        # zainstalowanego MCCB, więc był bezwarunkowo NIEROZSTRZYGALNY mimo
        # istniejącej gałęzi karty D1.
        # Karta ARKUSZ-NN (nN „runda 9", 2026-08-14): TO SAMO wywołanie niesie
        # też `ir_a`/`isd_a`/`tr_s`/`tsd_s` (dotąd odrzucane przez `_, _, ii_a,
        # _, _`) — `application.analyses.nn_circuit_sheet` potrzebuje ir_a/tr_s
        # do oceny kryterium (ii) I2<=1,45·Iz′ zainstalowanego MCCB (REUSE
        # `nn_device_selection._kryterium_i2`, który dla MCCB wymaga ir_a/tr_s,
        # nie tylko ii_a) — jedna materializacja, jedno miejsce rozwiązania.
        ir_a, isd_a, ii_a, tr_s, tsd_s = resolwuj_nastawy_mccb(
            i_n_a=float(in_a),
            ir_range=params.get("ir_range"),
            isd_range=params.get("isd_range"),
            ii_range=params.get("ii_range"),
            tr_range=params.get("tr_range"),
            tsd_range=params.get("tsd_range"),
        )
        return (
            UrzadzenieOchronneNn(
                kind=KIND_MCCB,
                id=breaker.ref_id,
                nazwa=nazwa_elementu(breaker, "branches"),
                in_a=float(in_a),
                wlasna_zdolnosc_ka=(
                    float(params["i_cu_ka"]) if params.get("i_cu_ka") is not None else None
                ),
                ii_a=ii_a,
                ir_a=ir_a,
                isd_a=isd_a,
                tr_s=tr_s,
                tsd_s=tsd_s,
            ),
            None,
        )

    return None, f"Nieobsłużony namespace katalogu aparatu: {namespace!r}."


def zbuduj_wejscie_dowodu_obwodu_nn(
    *,
    enm: EnergyNetworkModel,
    station_ref: str,
    bus_ref: str,
    breaker_ref: str,
    segment_ref: str,
    project_name: str,
    case_name: str,
    run_timestamp: datetime,
    solver_version: str,
    p_mw: float,
    q_mvar: float,
    u_ll_kv: float,
    iz_katalogowe_a: float,
    wspolczynniki: WspolczynnikiObciazalnosciNN | None,
    ik_max_ka: float | None,
    thermal: ConductorThermalResult,
    vdrop_u_source_kv: float,
    vdrop_delta_u_total_kv: float,
    vdrop_delta_u_total_percent: float | None = None,
    apparatus_branch_ref: str | None = None,
    straty: StratyOdcinka | None = None,
) -> dict[str, Any]:
    """Złóż ``LVCircuitVerificationInput`` (10 kroków) dla obwodu nN.

    Ik1_min/SWZ/urządzenie są rozwiązywane TUTAJ (REUSE fizyki P0.6/P0.6);
    Iz′/I²t/ΔU są parametrami wejściowymi już rozwiązanymi przez ODRĘBNE,
    istniejące dostawcy (``cable_ampacity_derating``, ``conductor_thermal_
    withstand``, ``vdrop_chain_binding``/pakiet VDROP — ten sam wzorzec, co
    ``nn_device_selection.wybierz_aparat_dla_obwodu_nn`` stosuje dla Ib/Iz′/Ik″max).

    Zwraca ``{"status": "OK", "wejscie": LVCircuitVerificationInput}`` albo
    ``{"status": "brak danych", "missing_data": [...], "reason_pl": ...}`` albo — gdy
    strona dolna transformatora zasilającego leży poza pasmem nN —
    ``{"status": "nie dotyczy", "kod_odmowy": ..., "reason_pl": ...}``.
    """
    breaker = _find_branch(enm, breaker_ref)
    if breaker is None:
        return {"status": "brak danych", "missing_data": ["breaker"], "reason_pl": None}

    apparatus_branch = _find_branch(enm, apparatus_branch_ref) if apparatus_branch_ref else None

    urzadzenie, reason = resolve_urzadzenie_ochronne(breaker, apparatus_branch=apparatus_branch)
    if urzadzenie is None:
        return {
            "status": "brak danych",
            "missing_data": ["breaker_catalog_binding"],
            "reason_pl": reason,
        }

    petla, missing, reason_pl, kod_odmowy = petla_zwarcia_min_w_punkcie(enm, station_ref, bus_ref)
    if kod_odmowy is not None:
        return {
            "status": "nie dotyczy",
            "kod_odmowy": kod_odmowy,
            "missing_data": missing,
            "reason_pl": reason_pl,
        }
    if petla is None:
        return {"status": "brak danych", "missing_data": missing, "reason_pl": reason_pl}

    aparat_swz = AparatZabezpieczajacy(
        typ=(
            "MCB"
            if urzadzenie.kind == KIND_MCB
            else ("WKLADKA_GG" if urzadzenie.kind == KIND_FUSE_SWITCH else urzadzenie.kind)
        ),
        in_a=urzadzenie.in_a,
        klasa_mcb=urzadzenie.klasa_mcb,
        # Karta D2 (nN, „runda 8", 2026-08-14): bez tego SWZ dla typ="MCCB"
        # (urzadzenie.kind == KIND_MCCB, string "MCCB" — zbieżne z ocen_swz)
        # dostawał zawsze `ii_a=None` → NIEROZSTRZYGALNE mimo rozwiązanej
        # nastawy w `urzadzenie.ii_a` (patrz `resolve_urzadzenie_ochronne`).
        ii_a=urzadzenie.ii_a if urzadzenie.kind == KIND_MCCB else None,
    )
    swz = ocen_swz(ik1_min_a=petla.fault_loop.ik_min_a, u0_v=petla.u0_v, aparat=aparat_swz)

    # Krok 5 (I2): JEDNO źródło progu — kryterium (ii) doboru aparatu, wołane dla aparatu
    # zainstalowanego przy obciążalności po korektach tego samego kroku 3.
    iz_prime_a = obciazalnosc_skorygowana(
        iz_katalogowe_a, wspolczynniki if wspolczynniki is not None else WARUNKI_KATALOGOWE
    )
    try:
        kandydat = kandydat_z_urzadzenia(urzadzenie)
    except OdmowaDanychError as exc:
        return {
            "status": "brak danych",
            "missing_data": ["breaker_catalog_binding"],
            "reason_pl": f"Dane katalogowe aparatu niespójne: {exc}",
        }
    kr_i2 = kryterium_i2(kandydat=kandydat, iz_prime_a=iz_prime_a)
    i2_a = kr_i2.wartosci.get("i2_a")

    # Odcinek to KABEL (albo inna gałąź trasy), nie aparat — `_find_branch` zwraca
    # wyłącznie łączniki i bezpieczniki, więc do karty OBIEKT-KABEL-NN tytuł dowodu
    # zawsze mówił „element spoza modelu" dla każdego odcinka kablowego.
    odcinek = next((b for b in enm.branches if b.ref_id == segment_ref), None)
    wejscie = LVCircuitVerificationInput(
        project_name=project_name,
        case_name=case_name,
        run_timestamp=run_timestamp,
        solver_version=solver_version,
        station_ref=station_ref,
        bus_ref=bus_ref,
        breaker_ref=breaker_ref,
        segment_ref=segment_ref,
        # Tytuł dowodu nazywa odcinek nazwą z modelu (karta #144); odcinek spoza modelu
        # to jawny brak, nie jego identyfikator.
        nazwa_odcinka=(
            nazwa_elementu(odcinek, "branches") if odcinek is not None else ELEMENT_SPOZA_MODELU
        ),
        p_mw=p_mw,
        q_mvar=q_mvar,
        u_ll_kv=u_ll_kv,
        iz_katalogowe_a=iz_katalogowe_a,
        wspolczynniki=wspolczynniki,
        urzadzenie=urzadzenie,
        ik_max_ka=ik_max_ka,
        i2_a=float(i2_a) if i2_a is not None else None,
        i2_zrodlo_pl=str(kr_i2.wartosci.get("zrodlo") or "próg nierozstrzygalny"),
        i2_uzasadnienie_pl=kr_i2.uzasadnienie_pl,
        thermal=thermal,
        vdrop_u_source_kv=vdrop_u_source_kv,
        vdrop_delta_u_total_kv=vdrop_delta_u_total_kv,
        vdrop_delta_u_total_percent=vdrop_delta_u_total_percent,
        fault_loop=petla.fault_loop,
        swz_status=swz.status.value,
        swz_przyczyna_pl=swz.przyczyna_pl,
        swz_ia_wymagane_a=swz.ia_wymagane_a,
        swz_t_wymagany_s=swz.t_wymagany_s,
        swz_pasmo_u0=swz.pasmo_u0,
        swz_rodzaj_obwodu=swz.rodzaj_obwodu,
        swz_margines=swz.margines,
        straty=straty,
    )
    return {"status": "OK", "wejscie": wejscie}
