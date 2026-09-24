#!/usr/bin/env python3
"""Eksport atrap harnessu scen (`creator-harness.html`) z BACKENDU do frontendu.

DLACZEGO (E2E-FULL-FIX-3, 2026-09-10). Harness scen podmienia `window.fetch`
atrapami o kształcie 1:1 z kontraktami backendu. Dwie końcówki czytają STAN
przypadku (committed ENM + rejestr przebiegów), którego harness nie ma —
zgodność przekrojowa NC RfG (`GET /api/ncrfg-tests/cases/{id}/compliance`)
i werdykt projektowy (`GET /api/quality/design-verdict`). Ręczna kopia payloadu
dryfowała już dwukrotnie (katalog NC RfG, klasy modułów sprzed OD-5), więc te
atrapy NIE są pisane ręcznie: liczy je ten skrypt DOKŁADNIE tymi funkcjami,
które wołają końcówki (`zgodnosc_ncrfg_przypadku` — most model → solver
kanoniczny NC RfG + koperta dowodowa, karta S-3; `zbuduj_werdykt_projektowy`),
i zapisuje JSON do
`frontend/src/harness-fixtures/generated/<nazwa>.json`.

Dane wejściowe = zasiew sceny harnessu (jedno miejsce prawdy tu, sprawdzane
w biegu: atrapa sceny `macierz` porównuje `der_ref`/moc/napięcie raportów z
modułami zasianymi w `useStationDerStore` i odmawia przy rozjeździe).
Test `tests/ci/test_fixtury_harnessu.py` porównuje JSON w repo ze świeżo
policzonym (rozjazd = czerwony test, nie cicha rozbieżność).

Użycie (z katalogu `backend`):
    poetry run python scripts/eksport_fixtur_harnessu.py [--sprawdz]

`--sprawdz` nie zapisuje — kończy kodem 1, gdy którykolwiek JSON różni się od
świeżo policzonej odpowiedzi.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from unittest.mock import patch
from uuid import NAMESPACE_URL, UUID, uuid5

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR / "src"))
sys.path.insert(0, str(BACKEND_DIR))

from api.analysis_runs import _catalog_completed_snapshot  # noqa: E402
from api.canonical_run_views import (  # noqa: E402
    build_automation_trace_results_response,
    build_branch_results_response,
    build_bus_results_response,
    build_dynamic_stability_results_response,
    build_extended_trace_response,
    build_phase_state_results_response,
    build_power_flow_run_header,
    build_short_circuit_band_response,
    build_short_circuit_results_response,
    build_short_circuit_rozplyw_response,
    get_power_flow_result,
    get_power_flow_trace,
)
from api.generators import (  # noqa: E402
    get_der_instrument_transformers,
    get_der_protection_functions,
)
from api.proof_pack import SCContributionsRequest, sc3f_contributions  # noqa: E402
from api.protection_coordination import (  # noqa: E402
    RunCoordinationRequest,
    get_coordination_result,
    run_coordination_analysis,
)
from api.protection_runs import list_protection_runs  # noqa: E402
from api.v126_academic import (  # noqa: E402
    _with_parameter_payloads,
    _wycofanie_v126,
    get_v126_catalog,
    get_v126_proof,
    get_v126_report,
    get_v126_result,
    get_v126_ssci_stability,
    get_v126_trace,
)
from application.analyses.arc_flash_view import build_arc_flash_view  # noqa: E402
from application.analyses.diagnoza_przebiegu import (  # noqa: E402
    zbuduj_diagnoze_przebiegu,
)
from application.analyses.dobor_kompensacji import (  # noqa: E402
    build_compensation_sizing_view,
)
from application.analyses.energy_validation.service import (  # noqa: E402
    build_energy_validation_view,
)
from application.analyses.frt_sekwencja import build_frt_sekwencja_view  # noqa: E402
from application.analyses.frt_trajektorie import (  # noqa: E402
    build_frt_trajectories_view,
)
from application.analyses.grid_strength import build_grid_strength_view  # noqa: E402
from application.analyses.migotanie import build_migotanie_view  # noqa: E402
from application.analyses.ochrona_lom import build_ochrona_lom_view  # noqa: E402
from application.analyses.state_estimation.service import (  # noqa: E402
    build_state_estimation_requirements,
    build_state_estimation_view,
)
from application.analyses.v126_gotowosc import (  # noqa: E402
    ocen_gotowosc_v126,
    odpowiedz_gotowosci,
    uzupelnij_parametry_z_modelu,
)
from application.analyses.v126_katalog import katalog_do_dict  # noqa: E402
from application.analyses.werdykt_projektowy import (  # noqa: E402
    zbuduj_werdykt_projektowy,
)
from application.analyses.wytrzymalosc_cieplna_przewodow import (  # noqa: E402
    build_wytrzymalosc_cieplna_view,
    zbuduj_dowod_cieplny,
)
from application.analyses.zgodnosc_powykonawcza import (  # noqa: E402
    build_zgodnosc_powykonawcza_view,
)
from application.analysis_run.read_model import canonicalize_json  # noqa: E402
from application.autorytet_biegu_zwarciowego import (  # noqa: E402
    wejscie_koordynacji_z_biegow,
)
from application.ncrfg_compliance import zgodnosc_ncrfg_przypadku  # noqa: E402
from application.power_flow_comparison.service import (  # noqa: E402
    PowerFlowComparisonService,
)
from application.proof_engine.pakiet_nastaw import (  # noqa: E402
    dostepnosc_pakietu_nastaw,
    zbuduj_odpowiedz_dopasowania,
    zbuduj_odpowiedz_nastaw_json,
)
from application.protection_comparison.service import (  # noqa: E402
    ProtectionComparisonService,
)
from application.protection_settings.zacisk_zabezpieczenia import (  # noqa: E402
    ZACISKI,
    Zacisk,
    opis_miejsca_urzadzenia,
    rodzaj_lokalizacji,
    szyny_zwarcia_lokalizacji,
    zaciski_galezi_migawki,
)
from catalog.profiles.nc_rfg.loader import load_nc_rfg_profile  # noqa: E402
from diagnostics.engine import DiagnosticEngine  # noqa: E402
from diagnostics.preflight import (  # noqa: E402
    build_preflight_from_diagnostic_report,
)
from domain.study_case import ProtectionConfig, StudyCase  # noqa: E402
from enm.canonical_analysis import (  # noqa: E402
    build_execution_result_set,
    build_short_circuit_results,
    create_run,
    execute_run,
    reset_canonical_runs,
)
from enm.canonical_analysis import (  # noqa: E402
    list_runs_for_project as list_canonical_runs_for_project,
)
from enm.domain_operations import execute_domain_operation  # noqa: E402
from enm.hash import compute_enm_hash  # noqa: E402
from enm.mapping import map_enm_to_network_graph  # noqa: E402
from enm.models import (  # noqa: E402
    ConnectionConditions,
    EnergyNetworkModel,
    ENMHeader,
    Generator,
    TapChanger,
)
from enm.store import reset_enm_store, set_enm  # noqa: E402
from infrastructure.persistence.db import (  # noqa: E402
    create_engine_from_url,
    create_session_factory,
    init_db,
)
from infrastructure.persistence.unit_of_work import build_uow_factory  # noqa: E402
from network_model.catalog.repository import get_default_mv_catalog  # noqa: E402
from network_model.solvers.cable_voltage_drop import (  # noqa: E402
    CableRatedCurrentInput,
    compute_cable_rated_current,
)
from solver_input.v126_contracts import (  # noqa: E402
    V126AnalysisType,
    build_v126_input_from_enm,
)

from tests.cgmes.golden_enm import build_golden_enm  # noqa: E402

FIXTURES_DIR = BACKEND_DIR.parent / "frontend" / "src" / "harness-fixtures" / "generated"

#: Identyfikator przypadku zasiewu globalnego harnessu (`useAppStateStore`).
CASE_ID_HARNESSU = "case-demo"

#: Moduły OZE sceny `macierz` (creator-harness-main.tsx) — WEJŚCIE kreatora
#: źródła OZE, nie opis gotowego modelu: technologia, przestrzeń i karta
#: katalogu falownika, moc grupy, liczba jednostek, napięcie wyjściowe falownika
#: oraz transformator blokowy toru DER-SN. Identyfikatory, napięcia szyn i
#: tabliczki NIE są tu wpisane — wynikają z modelu zbudowanego operacją domenową
#: `add_converter_source` (`_enm_sceny_macierz` niżej), tak jak u projektanta.
#:
#: HARNESS-RESZTA-2: wcześniej ta stała opisywała gotowe moduły
#: (`der_ref`/`p_max_kw`/`voltage_kv` wpisane ręcznie) i musiała być trzymana w
#: zgodzie z ręcznym zasiewem `useStationDerStore` — dwa opisy tego samego bytu.
#: Moce = liczba jednostek × moc katalogowa (BESS 3 × ABB PCS100 500 kW;
#: PV 9 × Huawei SUN2000-215KTL 215 kW).
MODULY_SCENY_MACIERZ: tuple[dict[str, Any], ...] = (
    {
        "technologia": "BESS",
        "przestrzen_katalogu": "ZRODLO_NN_BESS",
        "karta_katalogu": "bess_pcs_abb_500",
        "bateria": "bess_bat_lfp_2880kwh_1230vdc",
        "moc_mw": 1.5,
        "liczba_jednostek": 3,
        "napiecie_falownika_kv": 0.4,
        "transformator_blokowy": "tr-sn-nn-15-04-2000kva-dyn11",
        "moc_transformatora_mva": 2.0,
        "nazwa": "Magazyn energii 1,5 MW",
        "profile": {"nc_rfg_profile_ref": "enea"},
    },
    {
        "technologia": "PV",
        "przestrzen_katalogu": "ZRODLO_NN_PV",
        "karta_katalogu": "conv-pv-card-huawei-sun2000-215ktl",
        "bateria": None,
        "moc_mw": 1.935,
        "liczba_jednostek": 9,
        "napiecie_falownika_kv": 0.8,
        "transformator_blokowy": "tr-sn-nn-15-0p8-2p5mva-dyn11-inverter",
        "moc_transformatora_mva": 2.5,
        "nazwa": "Instalacja PV 1,9 MW",
        "profile": {
            "nc_rfg_profile_ref": "enea",
            "lvrt_curve_ref": "enea",
            "dynamic_model_ref": "default_pv_gfl",
        },
    },
)
OPERATOR_SCENY_MACIERZ = "enea"


def _wiazanie_katalogowe(przestrzen: str, pozycja: str) -> dict[str, Any]:
    """Wiązanie katalogowe payloadu operacji — kształt 1:1 z kreatorami UI."""
    return {
        "catalog_namespace": przestrzen,
        "catalog_item_id": pozycja,
        "catalog_item_version": "2024.1",
        "materialize": True,
        "snapshot_mapping_version": "1.0",
    }


def _gpz_sceny_oze(nazwa_projektu: str) -> tuple[dict[str, Any], str, str]:
    """GPZ 110/15 kV jako punkt przyłączenia scen OZE — zbudowany operacją
    `add_grid_source_sn` (ta sama, którą woła kreator źródła zasilania).
    Zwraca `(enm, ref stacji, ref szyny SN)`."""
    enm = EnergyNetworkModel(header=ENMHeader(name=nazwa_projektu)).model_dump(mode="json")
    enm = _operacja_domenowa_sceny(
        enm,
        "add_grid_source_sn",
        {
            "voltage_kv": 15.0,
            "source_name": "GPZ 110/15",
            "sk3_mva": 250.0,
            "rx_ratio": 0.1,
            "catalog_ref": _KATALOG_ZRODLA_KOORD,
            "hv_voltage_kv": 110.0,
            "transformer_sn_mva": 25.0,
        },
    )
    stacja = next(s["ref_id"] for s in enm["substations"] if s["ref_id"].endswith("/substation"))
    szyna_sn = next(b["ref_id"] for b in enm["buses"] if b["ref_id"].endswith("/bus_sn"))
    return enm, stacja, szyna_sn


def _dodaj_modul_oze_sn(
    enm: dict[str, Any], stacja: str, szyna_sn: str, modul: dict[str, Any]
) -> dict[str, Any]:
    """Moduł wytwórczy przyłączony po stronie SN transformatorem blokowym —
    KOMPLETNY tor DER-SN operacji `add_converter_source` (`der_topology`,
    `connection_level='sn'`): szyna nN producenta → transformator blokowy →
    kabel SN → dedykowane pole SN na szynie stacji. Dokładnie ten tor buduje
    kreator źródła OZE, więc referencje, tabliczka (w tym certyfikat PTPiREE)
    i liczba jednostek pochodzą z modelu, nie z listy przepisanej obok."""
    payload: dict[str, Any] = {
        "source_technology": modul["technologia"],
        "connection_variant": "block_transformer",
        "station_ref": stacja,
        "bus_nn_ref": szyna_sn,
        "source_name": modul["nazwa"],
        "quantity": modul["liczba_jednostek"],
        "power_setpoint_mw": modul["moc_mw"],
        "catalog_binding": _wiazanie_katalogowe(
            modul["przestrzen_katalogu"], modul["karta_katalogu"]
        ),
        "der_topology": {
            "connection_level": "sn",
            "inverter_output_voltage_kv": modul["napiecie_falownika_kv"],
            "has_manufacturer_lv_switchgear": True,
            "lv_switchgear_variant": "multi-feeder",
            "has_block_transformer": True,
            "block_transformer": {
                "rated_power_mva": modul["moc_transformatora_mva"],
                "primary_voltage_kv": 15.0,
                "secondary_voltage_kv": modul["napiecie_falownika_kv"],
                "catalog_ref": modul["transformator_blokowy"],
                "catalog_binding": _wiazanie_katalogowe(
                    "TRANSFORMATOR_SN_NN", modul["transformator_blokowy"]
                ),
            },
            "has_dedicated_mv_field": True,
            "mv_bus_ref": szyna_sn,
            "mv_field_configuration": {
                "switching_device": "CB",
                "ct": True,
                "vt": True,
                "earthing_switch": True,
                "surge_arrester": True,
                "protection_relay": True,
                "cable_head": True,
                "cable_length_km": 0.05,
                "apparatus_catalog_binding": _wiazanie_katalogowe(
                    "APARAT_SN", _KATALOG_APARATU_KOORD
                ),
                "cable_catalog_ref": _KATALOG_KABLA_KOORD,
                "cable_catalog_binding": _wiazanie_katalogowe("KABEL_SN", _KATALOG_KABLA_KOORD),
            },
        },
    }
    if modul["bateria"] is not None:
        payload["battery_catalog_ref"] = modul["bateria"]
    enm = _operacja_domenowa_sceny(enm, "add_converter_source", payload)
    profile = modul.get("profile") or {}
    if profile:
        generator = enm["generators"][-1]["ref_id"]
        enm = _operacja_domenowa_sceny(
            enm,
            "set_der_catalog_bindings",
            {"generator_ref": generator, **profile},
        )
    return enm


def enm_sceny_macierz() -> EnergyNetworkModel:
    """Committed ENM sceny `macierz` — WEJŚCIE mostu `model_bridge.py` (ten sam
    most, który czyta trasa `/compliance`) I JEDNOCZEŚNIE migawka zasiewająca
    `useStationDerStore` sceny (`macierz_scena_migawka` niżej).

    HARNESS-RESZTA-2: model budowany OPERACJAMI DOMENOWYMI (`add_grid_source_sn`
    + `add_converter_source` z kompletnym torem DER-SN + `set_der_catalog_bindings`),
    a nie składany ręcznie ze słowników. Znaczenie: tabliczki (certyfikat PTPiREE,
    moc znamionowa, napięcie falownika) materializuje brama katalogowa, referencje
    nadaje domena, a scena i raport zgodności czytają JEDEN model — wcześniej
    harness niósł drugi opis tych samych modułów, pilnowany porównaniem 409."""
    enm, stacja, szyna_sn = _gpz_sceny_oze("Przyłączenie farmy PV 8 MW")
    for modul in MODULY_SCENY_MACIERZ:
        enm = _dodaj_modul_oze_sn(enm, stacja, szyna_sn, modul)
    model = EnergyNetworkModel.model_validate(enm)
    _fiksuj_niedeterminizm_sceny_zwarcia(model)
    return model


# ---------------------------------------------------------------------------
# Karta HARNESS-RESZTA-2 (2026-09-17) — sceny „wiazania" i „frt": POLE WYTWÓRCY
# na szynie SN GPZ. Obie sceny zasiewały warsztat wytwórców ręcznie pisanym
# rekordem `StationDerConnection` (napięcie przyłączenia, referencje szyny i
# pola, wiązania katalogowe), a dobór przekładników dostawał całą odpowiedź
# końcówki wpisaną z palca — z prądem roboczym toru i napięciem sieci, których
# żaden model nie niósł. Teraz: model budowany operacjami domenowymi, moduły do
# warsztatu wyprowadzone odwzorowaniem produkcyjnym (`deryZModelu`), a dobór
# przekładników policzony TĄ SAMĄ funkcją, którą woła końcówka — na REALNYM
# biegu zwarciowym tej sieci (Ik″/ip z solvera IEC 60909).
# ---------------------------------------------------------------------------

#: Karta katalogu falownika PV pola wytwórcy (15 kV, 1 MW) — ta sama, z której
#: liczone są fikstury FRT (`_DER_SCENY_FRT`).
_KATALOG_PV_SCENY_POLA = "conv-pv-1mw-15kv"

#: Wiązania katalogowe pola wytwórcy: zabezpieczenie i przekładnik PRĄDOWY
#: przypisane, przekładnik NAPIĘCIOWY świadomie PUSTY — scena „wiazania"
#: dowodzi właśnie stanu „wybierz wariant katalogowy" i osi zabezpieczeń z
#: NAZWANYM brakiem, więc to dana sceny, nie niedopatrzenie.
_WIAZANIA_SCENY_POLA_OZE: dict[str, Any] = {
    "protection_catalog_ref": "ABB_REB670",
    "ct_catalog_ref": "ct_200_5_5p10_10va_abb",
    "dynamic_model_ref": "default_pv_gfl",
    "nc_rfg_profile_ref": "pse",
    "lvrt_curve_ref": "pse",
}

#: Przypadek scen OZE — UUID, bo końcówka doboru przekładników waliduje kontekst
#: projektu i przypadku po formacie identyfikatora (`project_case.invalid_uuid`).
_PRZYPADEK_SCENY_POLA_OZE = str(uuid5(NAMESPACE_URL, "mv-design-pro:harness:przypadek-pole-oze"))
_PROJEKT_SCENY_POLA_OZE = str(uuid5(NAMESPACE_URL, "mv-design-pro:harness:projekt-pole-oze"))

RUN_ID_SCENY_POLA_OZE = "run-sc-scena-pole-oze"
_UUID_SCENY_POLA_OZE = uuid5(NAMESPACE_URL, "mv-design-pro:harness:" + RUN_ID_SCENY_POLA_OZE)


def _enm_sceny_pola_oze() -> EnergyNetworkModel:
    """Model scen „wiazania"/„frt": GPZ 110/15 kV + farma PV 1 MW w polu SN
    (operacja `add_converter_source`, wariant z transformatorem blokowym) z
    wiązaniami katalogowymi zapisanymi operacją `set_der_catalog_bindings` —
    dokładnie tak, jak robi to projektant w konfiguratorze wytwórcy."""
    enm, stacja, szyna_sn = _gpz_sceny_oze("Przyłączenie farmy PV 8 MW")
    enm = _operacja_domenowa_sceny(
        enm,
        "add_converter_source",
        {
            "source_technology": "PV",
            "connection_variant": "block_transformer",
            "station_ref": stacja,
            "bus_nn_ref": szyna_sn,
            "source_name": "Farma PV 1 MW",
            "quantity": 1,
            "power_setpoint_mw": 1.0,
            "catalog_binding": _wiazanie_katalogowe("CONVERTER", _KATALOG_PV_SCENY_POLA),
        },
    )
    enm = _operacja_domenowa_sceny(
        enm,
        "set_der_catalog_bindings",
        {"generator_ref": enm["generators"][-1]["ref_id"], **_WIAZANIA_SCENY_POLA_OZE},
    )
    model = EnergyNetworkModel.model_validate(enm)
    _fiksuj_niedeterminizm_sceny_zwarcia(model)
    return model


def oze_scena_migawka() -> dict[str, Any]:
    """Migawka modelu scen „wiazania"/„frt" (`useSnapshotStore`) — front
    wyprowadza z niej moduły warsztatu wytwórców odwzorowaniem produkcyjnym
    (`station-der/zModelu.ts::deryZModelu`)."""
    return canonicalize_json(_enm_sceny_pola_oze().model_dump(mode="json"))


def _bieg_zwarciowy_sceny_pola_oze() -> tuple[Any, EnergyNetworkModel]:
    """Bieg `short_circuit_sn` modelu pola wytwórcy — źródło Ik″/ip dla doboru
    przekładników (bez niego kryteria cieplne i dynamiczne CT są NAZWANYM
    brakiem danej, a scena ma pokazywać pełny rachunek)."""
    enm = _enm_sceny_pola_oze()
    with _zamrozona_tozsamosc_biegu(_UUID_SCENY_POLA_OZE):
        set_enm(_PRZYPADEK_SCENY_POLA_OZE, enm)
        run = execute_run(
            create_run(
                case_id=_PRZYPADEK_SCENY_POLA_OZE,
                klucz_twin=_PRZYPADEK_SCENY_POLA_OZE,
                analysis_type="short_circuit_sn",
            ).id
        )
    return run, enm


class _ZadanieBezBazy:
    """Minimalne żądanie dla końcówki: kontekst projektu/przypadku sprawdzany
    jest fabryką `UnitOfWork` aplikacji, a eksport fixtur bazy nie otwiera —
    `_validate_project_case_context` przy jej braku kończy się bez zastrzeżeń
    (ta sama ścieżka, którą idzie proces bez skonfigurowanej bazy)."""

    class _Aplikacja:
        class state:  # noqa: N801 — atrybut `app.state` kontraktu FastAPI
            pass

    app = _Aplikacja()


def wiazania_scena_przekladniki() -> dict[str, Any]:
    """Odpowiedź `GET /api/projects/{p}/cases/{c}/generators/{ref}/instrument-transformers`
    (`get_der_instrument_transformers` — TA SAMA funkcja, którą woła końcówka)
    dla pola wytwórcy sceny „wiazania": prąd roboczy toru z solvera, Ik″/ip z
    REALNEGO biegu zwarciowego, kryteria normowe CT z katalogu. Przekładnik
    napięciowy zostaje bez doboru (brak wiązania) — uczciwy stan „wybierz"."""
    reset_canonical_runs()
    reset_enm_store()
    try:
        run, enm = _bieg_zwarciowy_sceny_pola_oze()
        widok = get_der_instrument_transformers(
            project_id=_PROJEKT_SCENY_POLA_OZE,
            case_id=_PRZYPADEK_SCENY_POLA_OZE,
            klucz=_PRZYPADEK_SCENY_POLA_OZE,
            generator_ref=enm.generators[0].ref_id,
            request=_ZadanieBezBazy(),  # type: ignore[arg-type]
        )
        return _ustabilizuj_identyfikatory(widok, {str(run.id): RUN_ID_SCENY_POLA_OZE})
    finally:
        reset_canonical_runs()
        reset_enm_store()


def wiazania_scena_funkcje_zabezpieczen() -> dict[str, Any]:
    """Odpowiedź `GET …/generators/{ref}/protection-functions`
    (`get_der_protection_functions` — TA SAMA funkcja, którą woła końcówka):
    WYMAGANE funkcje zabezpieczeniowe pola wytwórcy (z faktów modelu: strona
    przyłączenia, sposób uziemienia sieci, tory pomiarowe) i ocena wybranego
    urządzenia wobec nich. Zero nastaw i zero fizyki — to katalog wymagań."""
    reset_enm_store()
    try:
        enm = _enm_sceny_pola_oze()
        set_enm(_PRZYPADEK_SCENY_POLA_OZE, enm)
        return canonicalize_json(
            get_der_protection_functions(
                project_id=_PROJEKT_SCENY_POLA_OZE,
                case_id=_PRZYPADEK_SCENY_POLA_OZE,
                klucz=_PRZYPADEK_SCENY_POLA_OZE,
                generator_ref=enm.generators[0].ref_id,
                request=_ZadanieBezBazy(),  # type: ignore[arg-type]
            )
        )
    finally:
        reset_enm_store()


def macierz_scena_migawka() -> dict[str, Any]:
    """Migawka modelu sceny `macierz` (`useSnapshotStore`) — TEN SAM model, z
    którego policzono `ncrfg_zgodnosc_przekrojowa_scena_macierz`. Moduły do
    warsztatu wytwórców front wyprowadza z niej odwzorowaniem produkcyjnym
    (`station-der/zModelu.ts::deryZModelu`), więc zasiew sceny nie jest już
    drugim opisem tych samych wytwórców."""
    return canonicalize_json(enm_sceny_macierz().model_dump(mode="json"))


def zgodnosc_przekrojowa_sceny_macierz() -> dict[str, Any]:
    """Odpowiedź `GET /api/ncrfg-tests/cases/{id}/compliance` — TA SAMA funkcja
    (`zgodnosc_ncrfg_przypadku`: most model → wejście solvera + solver kanoniczny
    `NcRfgPtpireeSolver` + koperta dowodowa S-1), którą woła trasa
    `api/ncrfg_ptpiree_tests.py::run_ncrfg_compliance_from_model` (karta S-3)."""
    return zgodnosc_ncrfg_przypadku(
        enm_sceny_macierz(), operator_id=OPERATOR_SCENY_MACIERZ, case_id=CASE_ID_HARNESSU
    ).model_dump(mode="json")


def werdykt_projektowy_sceny_uwaga() -> dict[str, Any]:
    """Odpowiedź `GET /api/quality/design-verdict?case_id=` dla przypadku BEZ
    przebiegów w rejestrze backendu — ten sam agregat co `build_werdykt_projektowy_view`.

    Scena `uwaga` zasiewa wynik rozpływu WYŁĄCZNIE po stronie klienta
    (`usePowerFlowResultsStore`); backend biegu takiego nie zna, więc uczciwy
    werdykt to „niesprawdzone — brak biegu" (kolektor rejestru bierze wtedy
    przekroczenia ze store'u, a nie z werdyktu)."""
    enm = EnergyNetworkModel(header=ENMHeader(name="Projekt demonstracyjny"))
    return zbuduj_werdykt_projektowy(
        case_id=CASE_ID_HARNESSU,
        model_hash=compute_enm_hash(enm),
        bieg_pf=None,
        bieg_sc=None,
        enm_snapshot=enm.model_dump(mode="json"),
    ).to_dict()


def katalog_analiz_v126() -> dict[str, Any]:
    """Odpowiedź `GET /api/catalog/v126/analysis-catalog` — TA SAMA funkcja
    (`katalog_do_dict`), którą woła `get_v126_catalog` (`api/v126_academic.py`);
    scena harnessu „akademickie" karmi ekran „Analizy specjalistyczne" tym
    katalogiem (karta B02-BE-TESTY §6)."""
    return {"namespace": "analysis-catalog", "items": katalog_do_dict()}


def gotowosc_v126_scena_akademickie() -> dict[str, Any]:
    """Odpowiedź `GET /api/cases/{id}/v126/gotowosc` (BEZ `analysis_type`, komplet
    14 rodzajów) na złotej sieci — TA SAMA funkcja (`odpowiedz_gotowosci`), którą
    woła końcówka `get_v126_gotowosc` (karta B02-BE-TESTY §1: JEDNO źródło
    prawdy dla końcówki i dla ten eksport)."""
    return odpowiedz_gotowosci(CASE_ID_HARNESSU, build_golden_enm(), None, {})


#: Parametry projektanta sceny „akademickie" per rodzaj z sekcją „od użytkownika"
#: karty katalogu — KSZTAŁT DOKŁADNIE taki, jaki buduje formularz okna
#: (`ui2/wyniki/akademickie/parametry.ts::zbudujParametry`): uziom pod kluczem
#: `earthing`, silniki listą `motors`, widmo mapą `harmonic_spectra`, odbiorcy mapą
#: `customer_counts`. Atrapa harnessu (`creator-harness-main.tsx`) odsyła gotowość
#: z TEJ fixtury tylko wtedy, gdy zapytanie niesie DOKŁADNIE te parametry —
#: e2e wypełnia formularz tymi wartościami (odczyt z JSON, nie z kopii w spec).
#: Wartości są danymi PROJEKTANTA (uziom 40×30 m w gruncie 100/300 Ω·m, silnik
#: 400 kW na szynie B, obwód TRV 12 kHz) — nie pochodzą z modelu i nie są
#: „domyślnymi" solvera; gotowość policzona TĄ SAMĄ funkcją co bramka 422.
PARAMETRY_SCENY_AKADEMICKIE: dict[str, dict[str, Any]] = {
    "power_quality_harmonics": {
        "harmonic_spectra": {"gen_pv": {"5": 4.5, "7": 2.1, "11": 1.2}},
    },
    "ssci_impedance": {"ssci_converter_ref": "gen_pv"},
    "earthing_safety": {
        "earthing": {
            "gpz_ref": "bus_hv",
            "rho1_ohm_m": 100,
            "rho2_ohm_m": 300,
            "h1_m": 2,
            "length_m": 40,
            "width_m": 30,
            "mesh_spacing_m": 5,
            "buried_depth_m": 0.7,
            "rods_total_length_m": 60,
            "split_factor": 0.6,
            "fault_current_ka": 8,
            "fault_clearing_time_s": 0.5,
            "surface_layer_rho_ohm_m": 3000,
            "surface_layer_derating": 0.7,
        }
    },
    "earth_fault_detection": {
        "neutral_grounding": "petersen_tuned",
        "relay_methods": ["wattmetric", "admittance"],
    },
    "neutral_earthing_design": {"neutral_earthing_type": "petersen_coil"},
    "transient_trv": {
        "breaker_rated_voltage_kv": 17.5,
        "trv_natural_frequency_hz": 12000,
        "trv_tau_s": 0.00018,
        "inrush_multiple_in": 8,
        "neutral_grounding": "petersen_tuned",
    },
    "motor_starting": {
        "motors": [
            {
                "ref": "M-1",
                "bus_ref": "bus_sn_b",
                "rated_kw": 400,
                "rated_voltage_kv": 15,
                "locked_rotor_multiplier": 6,
                "start_power_factor": 0.25,
                "start_time_s": 4,
                "allowable_locked_rotor_time_s": 12,
                "max_torque_pu": 2.2,
                "critical_slip": 0.15,
                "load_start_torque_pu": 0.6,
            }
        ]
    },
    "reliability_contingency": {
        "customer_counts": {"bus_sn_b": 120, "bus_sn_c": 35, "bus_nn": 40},
    },
}


def gotowosc_v126_scena_akademickie_parametry() -> dict[str, Any]:
    """Odpowiedzi `GET /api/cases/{id}/v126/gotowosc?analysis_type=…&parametry=…`
    na złotej sieci dla KAŻDEGO rodzaju z `PARAMETRY_SCENY_AKADEMICKIE` — TĄ SAMĄ
    funkcją (`odpowiedz_gotowosci` z rodzajem: scalanie propozycji z modelu +
    `ocen_gotowosc_v126`), którą woła końcówka i którą POST odmawia 422.

    Kształt: pola końcówki (`case_id`, `model_hash`, `przedmiot`) + `parametry`
    (per rodzaj — to, co formularz musi wysłać) + `analizy` (jedna pozycja per
    rodzaj, w kolejności `PARAMETRY_SCENY_AKADEMICKIE`). Rodzaje, których złota
    sieć NIE odblokuje żadnym parametrem (`gen_pv` bez karty przekształtnika →
    harmoniczne i SSCI), zostają NIEPOTWIERDZONE z nazwaną przyczyną — fixtura
    jest uczciwa, nie „na ładnie" (pin: `tests/ci/test_fixtury_harnessu.py`)."""
    enm = build_golden_enm()
    bazowa = odpowiedz_gotowosci(CASE_ID_HARNESSU, enm, None, {})
    analizy = [
        odpowiedz_gotowosci(CASE_ID_HARNESSU, enm, V126AnalysisType(kod), parametry)["analizy"][0]
        for kod, parametry in PARAMETRY_SCENY_AKADEMICKIE.items()
    ]
    return {
        "case_id": CASE_ID_HARNESSU,
        "model_hash": bazowa["model_hash"],
        "przedmiot": bazowa["przedmiot"],
        "parametry": PARAMETRY_SCENY_AKADEMICKIE,
        "analizy": analizy,
    }


#: Znacznik czasu stabilny scen werdyktu projektowego — `create_run`
#: (`enm/canonical_analysis.py`) nie przyjmuje jawnego czasu (zawsze
#: `datetime.now(UTC)`), więc scena harnessu potrzebuje STAŁEJ wartości.
_CZAS_SCENY_WERDYKTU = "2026-09-10T08:00:00+00:00"


def _zlota_siec_z_obciazeniem(mnoznik: float) -> EnergyNetworkModel:
    """Kopia złotej sieci z obciążeniem KAŻDEGO odbioru pomnożonym przez
    `mnoznik` (p_mw i q_mvar) — ×8 jest TEN SAM mnożnik, na którym architekt
    zmierzył realne FAIL napięcia/gałęzi/transformatora (patrz
    `tests/application/analyses/test_werdykt_projektowy.py::
    test_siec_x8_obciazenia_daje_realne_naruszenia_z_ujemnym_marginesem`)."""
    enm = build_golden_enm().model_copy(deep=True)
    for load in enm.loads:
        load.p_mw *= mnoznik
        load.q_mvar *= mnoznik
    return enm


def _ustabilizuj_identyfikatory(widok: dict[str, Any], mapa: dict[str, str]) -> dict[str, Any]:
    """Zamień WSZYSTKIE wystąpienia kluczy `mapa` (realne `run_id`/znaczniki czasu
    biegów) na ich stabilne odpowiedniki — operuje na TEKŚCIE JSON widoku (nie
    na z góry wypisanych kluczach), żeby złapać KAŻDE wystąpienie, w tym
    zagnieżdżone `zrodla[].run_id`, `zrodla[].wykonano`, `pozycje[].run_id` i
    `pozycje[].elementy[].dowod.run_id`.

    LICZBY I OCENY W WIDOKU SĄ REALNE (policzone solverami PF/short_circuit_sn
    na złotej sieci — WHITE BOX, zero fabrykacji) — WYŁĄCZNIE identyfikatory
    biegów i znaczniki czasu są tu stabilizowane, bo scena harnessu (frontend,
    `creator-harness.html`) nie ma prawdziwego rejestru biegów, a `create_run`
    (`enm/canonical_analysis.py`) generuje `id=uuid4()` i
    `created_at=datetime.now(UTC)` przy KAŻDYM wywołaniu — bez stabilizacji
    `test_atrapa_jest_deterministyczna` (dwa wywołania bit-identyczne) byłby
    czerwony, a JSON w repo różniłby się od świeżo policzonego przy KAŻDYM
    uruchomieniu tego skryptu.
    """
    tekst = json.dumps(widok, ensure_ascii=False, sort_keys=False)
    for oryginal, stabilny in mapa.items():
        tekst = tekst.replace(oryginal, stabilny)
    return json.loads(tekst)


def _werdykt_projektowy_scena(enm: EnergyNetworkModel, nazwa_scena: str) -> dict[str, Any]:
    """Werdykt projektowy z REALNYMI biegami PF + short_circuit_sn na `enm`
    (wzorzec `tests/application/analyses/test_werdykt_projektowy.py::
    test_serwis_liczy_werdykt_dla_przypadku_z_realnymi_biegami`), z
    identyfikatorami/czasem stabilizowanymi do stałych `run-{pf|sc}-{nazwa_scena}`
    / `_CZAS_SCENY_WERDYKTU`. `reset_*` PRZED i PO — nie zostawia stanu innym
    fixturom/testom, bo ten skrypt liczy WIELE scen w jednym procesie."""
    reset_canonical_runs()
    reset_enm_store()
    try:
        set_enm(CASE_ID_HARNESSU, enm)
        bieg_pf = execute_run(
            create_run(case_id=CASE_ID_HARNESSU, klucz_twin=CASE_ID_HARNESSU, analysis_type="PF").id
        )
        bieg_sc = execute_run(
            create_run(
                case_id=CASE_ID_HARNESSU,
                klucz_twin=CASE_ID_HARNESSU,
                analysis_type="short_circuit_sn",
            ).id
        )
        widok = zbuduj_werdykt_projektowy(
            case_id=CASE_ID_HARNESSU,
            model_hash=bieg_pf.snapshot_hash,
            bieg_pf=bieg_pf,
            bieg_sc=bieg_sc,
            enm_snapshot=enm.model_dump(mode="json"),
        ).to_dict()
        mapa = {
            str(bieg_pf.id): f"run-pf-{nazwa_scena}",
            str(bieg_sc.id): f"run-sc-{nazwa_scena}",
        }
        if bieg_pf.created_at is not None:
            mapa[bieg_pf.created_at.isoformat()] = _CZAS_SCENY_WERDYKTU
        if bieg_sc.created_at is not None:
            mapa[bieg_sc.created_at.isoformat()] = _CZAS_SCENY_WERDYKTU
        return _ustabilizuj_identyfikatory(widok, mapa)
    finally:
        reset_canonical_runs()
        reset_enm_store()


def werdykt_projektowy_scena_ocena() -> dict[str, Any]:
    """Scena „ocena" ekranu B: złota sieć BEZ przekroczeń — biegi PF/SC realne,
    identyfikatory stabilizowane (`run-pf-scena-ocena` / `run-sc-scena-ocena`)."""
    return _werdykt_projektowy_scena(build_golden_enm(), "scena-ocena")


def werdykt_projektowy_scena_ocena_przekroczenia() -> dict[str, Any]:
    """Scena „ocena-przekroczenia": złota sieć z obciążeniem ×8 (realne FAIL
    napięcia/gałęzi/transformatora), identyfikatory stabilizowane
    (`run-pf-scena-przekroczenia` / `run-sc-scena-przekroczenia`)."""
    return _werdykt_projektowy_scena(_zlota_siec_z_obciazeniem(8.0), "scena-przekroczenia")


# ---------------------------------------------------------------------------
# Karta HARNESS-ZWARCIA-Z-BACKENDU (2026-09-16) — sceny „zwarcia" i
# „zwarcia-rozplyw" ekranu wyników zwarciowych, karmione WYŁĄCZNIE wynikami
# REALNEGO biegu backendu (bez ręcznie wpisanych liczb fizycznych).
# ---------------------------------------------------------------------------

#: Identyfikator kotwicy scen `zwarcia`/`zwarcia-rozplyw` — JEDNA stała dla
#: wszystkich czterech fixtur (wyniki/wkłady/rozpływ/pasmo). `bieg_wariantu`
#: (strona MIN pasma, `enm/canonical_analysis.py`) DZIELI `id` z biegiem
#: bazowym (`id=bazowy.id`, nie generuje nowego) — jedna zamiana tekstowa w
#: `_ustabilizuj_identyfikatory` stabilizuje WSZYSTKIE wystąpienia naraz
#: (`run_id`, `bieg_bazowy_id`, `run_id_kotwicy`, `proof_pack_ref`).
RUN_ID_SCENY_ZWARCIA = "run-sc-scena-zwarcia"

#: `id` PRZYPIĘTY (deterministyczny `uuid5`, NIE losowy `uuid4`) biegu kotwicy
#: — `_short_circuit_proof_ref`/`reproducibility.result_hash`
#: (`enm/canonical_analysis.py`) HASHUJĄ `run.id` (SHA-256), więc zamiana
#: TEKSTOWA `_ustabilizuj_identyfikatory` (poniżej) nie potrafi cofnąć różnicy
#: w WYNIKU hashowania dwóch RÓŻNYCH losowych `uuid4()` — dwa wywołania tej
#: samej fixtury dawałyby dwa różne `proof_ref` (zmierzone: `test_atrapa_
#: jest_deterministyczna` czerwony na `uuid4()` losowym). Przypinamy `id`
#: PRZED wykonaniem (jedyne miejsce w skrypcie podmieniające `uuid4()` kanonu)
#: zamiast naprawiać hash po fakcie — fizyka WYNIKU jest identyczna (id nie
#: wchodzi do żadnej wielkości fizycznej), podmienia się WYŁĄCZNIE tożsamość
#: biegu, jak reszta stabilizacji w tym pliku.
_UUID_KOTWICY_SCENY_ZWARCIA = uuid5(NAMESPACE_URL, "mv-design-pro:harness:" + RUN_ID_SCENY_ZWARCIA)


#: Znacznik czasu STABILNY nagłówka ENM (`ENMHeader.created_at`/`updated_at`,
#: `default_factory=lambda: datetime.now(UTC)` w `enm/models.py`) — patrz
#: docstring `_fiksuj_niedeterminizm_sceny_zwarcia` niżej.
_CZAS_NAGLOWKA_SCENY_ZWARCIA = datetime(2026, 9, 16, 8, 0, 0, tzinfo=UTC)


def _fiksuj_niedeterminizm_sceny_zwarcia(enm: EnergyNetworkModel) -> None:
    """Nadpisuje pola ENM losowane PRZY KONSTRUKCJI, W MIEJSCU (modele ENM nie
    są `frozen`) — DETERMINISTYCZNIE, bez zmiany żadnej wielkości fizycznej
    ani tożsamości domenowej (`ref_id`):

    1. `ENMElement.id` (`id: UUID = Field(default_factory=uuid4)`) — pole
       NIEZALEŻNE od `ref_id` (tożsamość domenowa używana wszędzie indziej —
       graf/solver/API czytają WYŁĄCZNIE `ref_id`, zmierzone:
       `map_enm_to_network_graph`/`build_short_circuit_*` operują na
       `ref_id`, nigdy na `id`) → `uuid5` z `ref_id` (stałego w budowniczym).
    2. `ENMHeader.created_at`/`updated_at` (`default_factory=lambda:
       datetime.now(UTC)`) → stała `_CZAS_NAGLOWKA_SCENY_ZWARCIA`.

    Bez tego KAŻDA konstrukcja `build_golden_enm()` losuje inny komplet tych
    pól; `_input_hash_wkladow` (`api/proof_pack.py`) hashuje CAŁY zrzut
    snapshotu (w tym te pola) — dwa wywołania tej samej fixtury dawały dwa
    różne `input_hash` (zmierzone: `test_atrapa_jest_deterministyczna`
    czerwony, ślad diagnozy: `model_dump(mode="json")` dwóch niezależnych
    `build_golden_enm()` różnił się najpierw na `branches[].id`, potem na
    `header.created_at`/`updated_at` — usunięte po kolei, zmierzone do zera).

    PODMIANA `unittest.mock.patch("enm.models.uuid4", ...)` NIE DZIAŁA dla
    pkt 1 (zmierzone bezpośrednio) — Pydantic `Field(default_factory=uuid4)`
    wiąże REFERENCJĘ DO OBIEKTU FUNKCJI w chwili DEFINICJI KLASY (import
    modułu), nie odczytuje nazwy `uuid4` z przestrzeni modułu przy KAŻDYM
    wywołaniu — podmiana nazwy PO imporcie nie ma żadnego efektu. Nadpisanie
    PO konstrukcji jest więc jedynym miejscem skutecznym.

    ZAKRES: KAŻDA kolekcja modelu, nie wypisana lista siedmiu (karta
    HARNESS-RESZTA-2 — instancja zamiast klasy: pierwotna wersja wymieniała
    `buses`/`sources`/`transformers`/`branches`/`loads`/`generators`/
    `substations`, więc `corridors`, `bays`, `junctions`, `measurements`,
    `protection_assignments`, `branch_points`, `line_runs`,
    `connection_nodes` i `shunt_capacitors` zostawały z losowym `id` — sieci
    scen sprzed tej karty po prostu ich nie miały. Scena koordynacji, budowana
    operacjami domenowymi, ma korytarz magistrali i jej `corridors[0].id`
    różnił się między dwoma wywołaniami fixtury: zmierzone bezpośrednio).
    Iteracja idzie po polach modelu, więc nowa kolekcja ENM jest objęta
    automatycznie — nie trzeba pamiętać o dopisaniu jej tutaj."""
    for nazwa_pola in type(enm).model_fields:
        wartosc = getattr(enm, nazwa_pola, None)
        if not isinstance(wartosc, list):
            continue
        for element in wartosc:
            ref_id = getattr(element, "ref_id", None)
            if not isinstance(ref_id, str) or not hasattr(element, "id"):
                continue
            element.id = uuid5(NAMESPACE_URL, f"mv-design-pro:harness:element-id:{ref_id}")
    enm.header.created_at = _CZAS_NAGLOWKA_SCENY_ZWARCIA
    enm.header.updated_at = _CZAS_NAGLOWKA_SCENY_ZWARCIA


def _bieg_sceny_zwarcia() -> tuple[Any, EnergyNetworkModel, str]:
    """Bieg zwarciowy KOTWICY scen `zwarcia`/`zwarcia-rozplyw` — realny
    `short_circuit_sn` (tor kanoniczny `create_run`/`execute_run`, jak
    `_werdykt_projektowy_scena` obok) na sieci złotej `build_golden_enm`
    (jedyna sieć rejestru już importowana w tym skrypcie, z torem
    falownikowym `gen_pv` @ `bus_nn` ORAZ maszyną synchroniczną `gen_sync`
    @ `bus_sn_c` — rozpływ gałęziowy punktu domyślnego pokazuje tor sieci
    nadrzędnej I tor falownika; sieć i bieg zmierzone i nazwane w meldunku
    karty). Scenariusz domyślny (`options={}`) czytany jako MAX
    (`_scenariusz_z_opcji`), więc `dobierz_pasmo_min_max_zwarcia` dobiera
    stronę MIN wariantem w pamięci (kotwica bez ręcznego `c_factor`, bez
    koperty scenariusza — stan normalny; kontrakt karty W3-G3). `id` biegu
    PRZYPIĘTY na `_UUID_KOTWICY_SCENY_ZWARCIA` (patrz komentarz stałej) —
    `bieg_wariantu` (strona MIN pasma) DZIELI ten sam `id` (nie generuje
    nowego), więc nie potrzebuje własnej podmiany.

    Punkt domyślny sceny = PIERWSZY wiersz wg sortu kanonicznego
    (`target_id`, `build_short_circuit_results` sortuje rosnąco) — TEN SAM
    punkt, który `EkranZwarc` wybiera domyślnie (`rows[0]`, żadna scena go nie
    preselekcjonuje), więc fixtura rozpływu (JEDEN punkt, §0.1 karty) trafia
    dokładnie w żądanie, które scena wyśle.

    `reset_*` PRZED i PO — nie zostawia stanu innym fixturom (ten skrypt
    liczy wiele scen w jednym procesie)."""
    reset_canonical_runs()
    reset_enm_store()
    try:
        enm = build_golden_enm()
        _fiksuj_niedeterminizm_sceny_zwarcia(enm)
        with _zamrozona_tozsamosc_biegu(_UUID_KOTWICY_SCENY_ZWARCIA):
            set_enm(CASE_ID_HARNESSU, enm)
            # `datetime` zamrożony TU (nie tylko `uuid4`) — karta HARNESS-RESZTA
            # (kontynuacja) dopisała konsumentów tego biegu (`cieplna_scena_wynik`/
            # `cieplna_scena_dowod`/`arcflash_scena_wynik`), których widoki
            # osadzają `context.run_timestamp = run.created_at` (`grid_strength.py`/
            # `arc_flash_view.py` — TA SAMA klasa co `run.id`: `datetime.now(UTC)`
            # wywoływane przy KAŻDYM `create_run`, więc bez zamrożenia dwa
            # wywołania tej samej fixtury dają dwa różne znaczniki czasu — zmierzone
            # bezpośrednio). Sceny „zwarcia"/„zwarcia-rozplyw" (już domknięte) NIE
            # osadzają `created_at` w swoich widokach, więc ich JSON w repo jest
            # BEZ ZMIAN mimo tej zmiany zachowania (zweryfikowane parytetem).
            run = execute_run(
                create_run(
                    case_id=CASE_ID_HARNESSU,
                    klucz_twin=CASE_ID_HARNESSU,
                    analysis_type="short_circuit_sn",
                ).id
            )
        # `set_enm` odbija (materializuje) migawkę i przy tym ZNAKUJE
        # `header.updated_at` na `datetime.now(UTC)` NA NOWO (zmierzone
        # bezpośrednio: fixup sprzed `set_enm` NIE PRZETRWAŁ) — druga
        # aplikacja fixupa PO wykonaniu biegu jest więc konieczna (ten sam
        # `enm`, ta sama instancja, używana dalej przez
        # `zwarcia_wklady_scena_zwarcia` do `model_dump()`).
        _fiksuj_niedeterminizm_sceny_zwarcia(enm)
        target_id = build_short_circuit_results(run)["rows"][0]["target_id"]
        return run, enm, target_id
    finally:
        reset_canonical_runs()
        reset_enm_store()


def zwarcia_wyniki_scena_zwarcia() -> dict[str, Any]:
    """Odpowiedź `GET /api/analysis-runs/{id}/results/short-circuit`
    (`build_short_circuit_results_response` — TA SAMA funkcja, którą woła
    końcówka `api/analysis_runs.py::get_short_circuit_results`), kształt 1:1
    z tym, co czyta `useResultsInspectorStore.shortCircuitResults`."""
    run, _enm, _target_id = _bieg_sceny_zwarcia()
    widok = build_short_circuit_results_response(run)
    return _ustabilizuj_identyfikatory(widok, {str(run.id): RUN_ID_SCENY_ZWARCIA})


def zwarcia_wklady_scena_zwarcia() -> dict[str, Any]:
    """Mapa `target_id → odpowiedź` `POST /api/proof/sc3f/contributions` dla
    WSZYSTKICH punktów zwarcia biegu kotwicy — TĄ SAMĄ funkcją, którą woła
    końcówka (`sc3f_contributions`, `api/proof_pack.py`), z DOKŁADNIE
    domyślnymi parametrami klienta (`c_factor=1.10`, `t_min_s=0.10` —
    `frontend/src/ui2/wyniki/zwarcia/api.ts::fetchWkladyZwarciowe` ich nie
    nadpisuje).

    Sieć złota niesie JEDNĄ maszynę konwencjonalną (`gen_sync`, synchroniczna)
    — `compute_machine_contributions` rozbija WYŁĄCZNIE maszyny wirujące z
    krzywą zaniku IEC 60909-0:2016 §6.6; falownik `gen_pv` fizycznie NIE MA
    takiej krzywej (prąd ograniczony elektronicznie) i słusznie NIE pojawia
    się w tej liście — jego wkład niesie osobno rozpływ gałęziowy
    (`zwarcia_rozplyw_scena_zwarcia` + pole `ik_inverters_ka` wiersza), nie ta
    końcówka. Zmierzone bezpośrednio (`compute_machine_contributions` na
    KAŻDYM z 5 punktów sieci złotej) — nie założone."""
    run, enm, _target_id = _bieg_sceny_zwarcia()
    snapshot = enm.model_dump(mode="json")
    rows = build_short_circuit_results(run)["rows"]
    return {
        row["target_id"]: sc3f_contributions(
            SCContributionsRequest(snapshot=snapshot, fault_node_id=row["target_id"])
        )
        for row in rows
    }


def zwarcia_rozplyw_scena_zwarcia() -> dict[str, Any]:
    """Odpowiedź `GET …/results/short-circuit/rozplyw?target_id=` dla punktu
    zwarcia DOMYŚLNEGO sceny (`build_short_circuit_rozplyw_response` — TA SAMA
    funkcja, którą woła końcówka `api/analysis_runs.py::
    get_short_circuit_rozplyw`; sekcja `RozplywZwarciowy`) — niesie tor sieci
    nadrzędnej (`THEVENIN_GRID`, przez gałąź `TR 110/15`) ORAZ tor falownika
    (`gen_pv`, przez gałąź `TR 15/0.4`), jak dotychczasowa scena Z-3."""
    run, _enm, target_id = _bieg_sceny_zwarcia()
    widok = build_short_circuit_rozplyw_response(run, target_id)
    return _ustabilizuj_identyfikatory(widok, {str(run.id): RUN_ID_SCENY_ZWARCIA})


def zwarcia_pasmo_scena_zwarcia() -> dict[str, Any]:
    """Odpowiedź `GET …/results/short-circuit/pasmo`
    (`build_short_circuit_band_response` — TA SAMA funkcja, którą woła
    końcówka `api/analysis_runs.py::get_short_circuit_band`; karta W3-G3).
    Strona MAX = bieg kotwicy zapisany; strona MIN = `obliczony_na_zadanie`
    (wariant w pamięci `bieg_wariantu` z TEJ SAMEJ migawki kotwicy — dzieli
    `id` z kotwicą, więc jedna stabilizacja tekstowa zamienia OBA
    `run_id`/`bieg_bazowy_id`/`run_id_kotwicy` naraz)."""
    run, _enm, _target_id = _bieg_sceny_zwarcia()
    widok = build_short_circuit_band_response(run)
    return _ustabilizuj_identyfikatory(widok, {str(run.id): RUN_ID_SCENY_ZWARCIA})


# ---------------------------------------------------------------------------
# Karta HARNESS-RESZTA (kontynuacja, 2026-09-16) — `screenshot-harness-main.tsx`
# `FAULT_FLOW_DEMO_INPUT` (karta Z-3, nakładka rozpływu prądu zwarciowego na
# schemacie v3, `?overlay=faultflow&fixture=gpzFeeder`). Liczby `i_ka` były
# PRZEPISANE z INNEJ sieci (test TH-1, `build_slack_radial_graph` + falownik
# `INV-B`, `test_short_circuit_iec60909.py::
# test_thevenin_addition_preserves_inverter_entries_byte_for_byte`) na
# topologię gpzFeeder (14 szyn, 10 gałęzi, zweryfikowane bezpośrednio: WSZYSTKIE
# refy węzłów/gałęzi demo występują w `gpzFeeder.enm.json`) — refy się zgadzały
# (ta sama fixtura), ale WARTOŚCI prądu NIE POCHODZIŁY z biegu NA TEJ sieci
# (gpzFeeder nie ma ANI JEDNEGO generatora — zweryfikowane: `generators: []`).
# Naprawa (ścieżka (b) karty): KOPIA gpzFeeder.enm.json (TE SAME ref_id —
# `gpzFeeder.enm.json` sam pozostaje NIETKNIĘTY, kanwa nadal renderuje
# ORYGINAŁ, patrz `overlayFromFaultFlowDemo` w `screenshot-harness-main.tsx`:
# `enm` renderowany i `input` z rozpływu to DWA NIEZALEŻNE argumenty
# `buildFaultFlowOverlayForSnapshot`) z DOŁOŻONYM falownikiem PV na szynie nN
# Stacji S02 (`stn/.../nn_bus`, TEN SAM wzorzec co `gen_pv` sieci złotej:
# `gen_type="pv_inverter"`, `connection_variant="nn_side"`,
# `catalog_ref="conv-pv-nn-0p5mw"`) — REALNY bieg `short_circuit_sn` na
# zwarcie 3F w Stacji S01 daje OBA tory NA TEJ SAMEJ sieci naraz: sieć
# nadrzędna (`THEVENIN_GRID`, gałąź `segment_L`, zmierzone: 9,121 kA — dawny
# fabrykowany literał 5,552 kA) I falownik S02 (gałąź `branch_segment_L`,
# `source_id="gen_pv_s02"`, prąd płynie WSTECZ do GPZ, zmierzone: 0,01605 kA —
# dawny fabrykowany literał 0,024 kA) — dokładnie kształt, jaki
# `FAULT_FLOW_DEMO_INPUT` próbował atrapować, teraz REALNY.
# ---------------------------------------------------------------------------

RUN_ID_SCENY_ROZPLYW_ZWARCIOWY_GPZ_FEEDER = "run-sc-scena-rozplyw-gpz-feeder"
_UUID_SCENY_ROZPLYW_ZWARCIOWY_GPZ_FEEDER = uuid5(
    NAMESPACE_URL, "mv-design-pro:harness:" + RUN_ID_SCENY_ROZPLYW_ZWARCIOWY_GPZ_FEEDER
)

#: Refy topologii gpzFeeder (`frontend/public/test-fixtures/gpzFeeder.enm.json`,
#: NIETKNIĘTY plik — te refy są jego istniejącą treścią, przepisane tu WYŁĄCZNIE
#: do adresowania biegu, nie nowa fizyka). Falownik dokładany na szynie nN
#: Stacji S02 (za transformatorem stacji, jak `gen_pv` sieci złotej).
_REF_BUS_NN_S02_GPZ_FEEDER = "stn/0188f98f1309b5535301f05ec09e6133/nn_bus"
_REF_STACJA_S02_GPZ_FEEDER = "stn/0188f98f1309b5535301f05ec09e6133/station"
#: Punkt zwarcia = szyna SN Stacji S01 (ta sama stacja, której znacznik
#: pulsuje na kanwie — `FAULT_FLOW_DEMO_STATION_S01` w
#: `screenshot-harness-main.tsx`, wartość IDENTYCZNA poniżej).
_REF_BUS_SN_S01_GPZ_FEEDER = "stn/980a625dd13777cd339a1a173a2a2864/sn_bus"
_REF_STACJA_S01_GPZ_FEEDER = "stn/980a625dd13777cd339a1a173a2a2864/station"
#: Gałęzie „nagłówkowe" nakładki (te same dwie, które `FAULT_FLOW_DEMO_INPUT`
#: zawsze pokazywał — tor GPZ→S01 i tor GPZ→S02 — zakres wizualny NIETKNIĘTY,
#: żeby zmiana nie wymagała nowej bramki B-02: naprawiamy LICZBY, nie kompozycję
#: zrzutu). Realny rozpływ niesie WIĘCEJ gałęzi/źródeł (9 gałęzi × 2 źródła —
#: zmierzone), w tym wpisy o prądzie rzędu pojedynczych/dziesiątek A ze
#: SPRZECZNYM tokenem kierunku względem dominanty tej samej gałęzi (sprzężenie
#: numeryczne superpozycji źródeł, nie błąd solvera — `buildFaultFlowOverlayFromScene`,
#: `ui/sld/v3/canvas/overlay.ts`, świadomie POMIJA gałąź z niejednoznacznym
#: kierunkiem: `entries.some(direction !== direction) → continue`). Dlatego
#: eksport bierze WYŁĄCZNIE wpis DOMINUJĄCY (największy |i_ka|) na KAŻDEJ z
#: tych dwóch gałęzi (`_dominujacy_wplyw_na_galezi` niżej) — filtr wielkości,
#: zero fabrykacji (obie liczby z TEGO SAMEGO realnego biegu).
_REF_BRANCH_SEGMENT_L_S01 = "seg/ac2e267391eabbcc94c58ee4ace01e6f/segment_L"
_REF_BRANCH_SEGMENT_L_S02 = "seg/c65b9d08fb6c84a5c80c518b45111a42/branch_segment_L"


def _gpz_feeder_enm_z_falownikiem() -> EnergyNetworkModel:
    """Kopia `frontend/public/test-fixtures/gpzFeeder.enm.json` (fixtura
    WSPÓŁDZIELONA z kanwą SLD — NIETKNIĘTA, patrz nagłówek sekcji wyżej) z
    DOŁOŻONYM falownikiem PV na szynie nN Stacji S02."""
    sciezka = BACKEND_DIR.parent / "frontend" / "public" / "test-fixtures" / "gpzFeeder.enm.json"
    surowy = json.loads(sciezka.read_text(encoding="utf-8"))
    enm = EnergyNetworkModel.model_validate(surowy["enm"])
    # W5-A: transformator zasilajacy odbiory nN musi DEKLAROWAC uklad sieci nN
    # (walidator E063 blokuje bieg bez niego; fixtura SLD tej deklaracji nie niesie,
    # bo kanwa nie liczy). Scena harnessu deklaruje jawnie TN-C-S dla kazdego
    # transformatora SN/nN kopii — to dana wejsciowa sceny, nie domyslka produktu.
    for transformator in enm.transformers:
        if transformator.ulv_kv < 1.0 and transformator.lv_earthing_system is None:
            transformator.lv_earthing_system = "TN-C-S"
    enm.generators = [
        *enm.generators,
        Generator(
            ref_id="gen_pv_s02",
            name="Falownik PV Stacja S02",
            bus_ref=_REF_BUS_NN_S02_GPZ_FEEDER,
            p_mw=0.4,
            q_mvar=0.0,
            gen_type="pv_inverter",
            connection_variant="nn_side",
            station_ref=_REF_STACJA_S02_GPZ_FEEDER,
            catalog_ref="conv-pv-nn-0p5mw",
        ),
    ]
    return enm


def _bieg_sceny_rozplyw_zwarciowy_gpz_feeder() -> tuple[Any, str, str | None]:
    """Bieg KOTWICY nakładki rozpływu prądu zwarciowego na topologii gpzFeeder
    (karta HARNESS-RESZTA kontynuacja) — zwarcie 3F na szynie SN Stacji S01,
    REALNY `short_circuit_sn` (ten sam tor `create_run`/`execute_run` co
    `_bieg_sceny_zwarcia`), na kopii gpzFeeder Z FALOWNIKIEM (patrz
    `_gpz_feeder_enm_z_falownikiem`). `reset_*` PRZED i PO — jak kotwica
    `zwarcia`, nie zostawia stanu innym fixturom."""
    reset_canonical_runs()
    reset_enm_store()
    try:
        enm = _gpz_feeder_enm_z_falownikiem()
        _fiksuj_niedeterminizm_sceny_zwarcia(enm)
        with _zamrozona_tozsamosc_biegu(_UUID_SCENY_ROZPLYW_ZWARCIOWY_GPZ_FEEDER):
            set_enm(CASE_ID_HARNESSU, enm)
            run = execute_run(
                create_run(
                    case_id=CASE_ID_HARNESSU,
                    klucz_twin=CASE_ID_HARNESSU,
                    analysis_type="short_circuit_sn",
                ).id
            )
        _fiksuj_niedeterminizm_sceny_zwarcia(enm)
        rows = build_short_circuit_results(run)["rows"]
        cel = next(row for row in rows if row["element_id"] == _REF_BUS_SN_S01_GPZ_FEEDER)
        return run, cel["target_id"], cel["fault_type"]
    finally:
        reset_canonical_runs()
        reset_enm_store()


def _dominujacy_wplyw_na_galezi(
    wplywy: list[dict[str, Any]], ref_galezi: str
) -> dict[str, Any] | None:
    """Wpis o NAJWIĘKSZYM |i_ka| na gałęzi `ref_galezi` (dopasowanie po
    `branch_name` — `_sc_rozplyw_galeziowy` ustawia `"Odcinek " + ref_id`,
    ten sam wzorzec nazewnictwa co reszta grafu przebiegu). `None`, gdy
    gałąź nie niesie żadnego wpisu (uczciwy brak, wołający decyduje)."""
    nazwa = f"Odcinek {ref_galezi}"
    kandydaci = [w for w in wplywy if w["branch_name"] == nazwa and w["i_ka"] is not None]
    if not kandydaci:
        return None
    return max(kandydaci, key=lambda w: abs(w["i_ka"]))


def falowniki_rozplyw_scena_gpz_feeder_wynik() -> dict[str, Any]:
    """`ShortCircuitFlowOverlayInput` (`ui/sld-overlay/ShortCircuitFlowOverlayAdapter.ts`)
    dla nakładki rozpływu prądu zwarciowego `screenshot-harness-main.tsx`
    (`overlayFromFaultFlowDemo` → `buildFaultFlowOverlayForSnapshot`, karta
    Z-3) — REALNY rozpływ `build_short_circuit_rozplyw_response` (TA SAMA
    funkcja, którą woła końcówka `results/short-circuit/rozplyw`) na zwarciu
    Stacji S01 sieci gpzFeeder+falownik, ograniczony do wpisu DOMINUJĄCEGO na
    KAŻDEJ z dwóch gałęzi nagłówkowych (patrz komentarz `_REF_BRANCH_SEGMENT_L_S01`
    wyżej), przemianowany `branch_contributions` → `flows` (te same nazwy pól
    — `ShortCircuitBranchFlowV1` 1:1 z `_sc_rozplyw_galeziowy`)."""
    run, target_id, typ_zwarcia = _bieg_sceny_rozplyw_zwarciowy_gpz_feeder()
    payload = build_short_circuit_rozplyw_response(run, target_id)
    surowe_wplywy = payload.get("branch_contributions") or []
    flows = [
        wplyw
        for wplyw in (
            _dominujacy_wplyw_na_galezi(surowe_wplywy, _REF_BRANCH_SEGMENT_L_S01),
            _dominujacy_wplyw_na_galezi(surowe_wplywy, _REF_BRANCH_SEGMENT_L_S02),
        )
        if wplyw is not None
    ]
    wynik: dict[str, Any] = {
        "run_id": str(run.id),
        "fault_type": typ_zwarcia,
        "fault_element_ref": _REF_STACJA_S01_GPZ_FEEDER,
        "flows": flows,
    }
    return _ustabilizuj_identyfikatory(
        wynik, {str(run.id): RUN_ID_SCENY_ROZPLYW_ZWARCIOWY_GPZ_FEEDER}
    )


# ---------------------------------------------------------------------------
# Karta HARNESS-RESZTA (2026-09-16) — sceny „wyniki-stan-fazowy" i
# „wyniki-stabilnosc" (E-31/E-32 ekranu wynikow), karmione WYLACZNIE realnymi
# biegami backendu (phase_state_sn / dynamic_stability) na sieci zlotej.
# ---------------------------------------------------------------------------

RUN_ID_SCENY_STAN_FAZOWY = "run-ps-scena-stan-fazowy"
RUN_ID_SCENY_STABILNOSC = "run-dyn-scena-stabilnosc"

#: `id` PRZYPIĘTY (uuid5 deterministyczny) obu biegów — jak `_UUID_KOTWICY_
#: SCENY_ZWARCIA` powyżej: `proof_ref`/`reproducibility.result_hash` HASHUJĄ
#: `run.id`, więc zamiana TEKSTOWA `_ustabilizuj_identyfikatory` nie cofa
#: różnicy w WYNIKU hashowania dwóch RÓŻNYCH losowych `uuid4()` — bez tego
#: `test_atrapa_jest_deterministyczna` jest czerwony (zmierzone bezpośrednio).
_UUID_SCENY_STAN_FAZOWY = uuid5(NAMESPACE_URL, "mv-design-pro:harness:" + RUN_ID_SCENY_STAN_FAZOWY)
_UUID_SCENY_STABILNOSC = uuid5(NAMESPACE_URL, "mv-design-pro:harness:" + RUN_ID_SCENY_STABILNOSC)

#: Znacznik czasu STAŁY biegów `phase_state_sn`/`dynamic_stability` — obie
#: analizy znakują `CanonicalRun.created_at` (`create_run`) i `.started_at`
#: (`execute_run`) przez `datetime.now(UTC)`, a `phase_state_sn` DODATKOWO
#: przenosi `run.started_at` do `PhaseStateSNProofPackInput.run_timestamp`,
#: który wchodzi w `reproducibility.result_hash` — bez zamrożenia zegara
#: `test_atrapa_jest_deterministyczna` jest czerwony (zmierzone bezpośrednio:
#: dwa wywołania tej samej fixtury dawały dwa różne `result_hash`/`proof_ref`).
_CZAS_BIEGU_STALY = datetime(2026, 9, 16, 9, 0, 0, tzinfo=UTC)


class _ZegarStalyBiegu:
    """Zamiennik `datetime` w `enm.canonical_analysis` na czas trwania jednego
    biegu kotwicy — WYŁĄCZNIE `.now(...)` jest tu wywoływane w module (zmierzone
    grepem: `datetime(` bez `.now` nie występuje), więc pełna podmiana nazwy
    modułu jest bezpieczna i nie psuje żadnego innego użycia."""

    @staticmethod
    def now(tz: Any = None) -> datetime:  # noqa: ARG004 - kontrakt `datetime.now`
        return _CZAS_BIEGU_STALY


@contextmanager
def _zamrozona_tozsamosc_biegu(uuid_kotwicy: UUID) -> Iterator[None]:
    """JEDNO miejsce zamrażania tożsamości i zegara biegu kotwicy — wszystkie
    kotwice tego skryptu (zwarcia, stan fazowy, stabilność, analizy OZE,
    kompensacja, rozpływ, składowe, zbieżność) wchodzą DOKŁADNIE przez ten
    menedżer (karta HARNESS-RESZTA-2: predykat z jednego źródła prawdy —
    wcześniej ten sam blok `with (patch…, patch…)` był przepisany ósmy raz i
    KAŻDE nowe źródło niedeterminizmu trzeba było dopisać w ośmiu miejscach).

    Zamrażane są TRZY nazwy, każda zmierzona jako realne źródło rozjazdu:
    1. `enm.canonical_analysis.uuid4` — `run.id` wchodzi do SHA-256
       (`proof_ref`, `reproducibility.result_hash`), więc zamiana tekstowa po
       fakcie nie cofnie różnicy dwóch losowych `uuid4()`.
    2. `enm.canonical_analysis.datetime` — `run.created_at`/`started_at`
       (osadzane w `context.run_timestamp` widoków).
    3. `enm.store.datetime` — `set_enm` znakuje `header.updated_at` przy
       KAŻDYM zapisie modelu, a ten znacznik trafia do `run.snapshot`
       (zmierzone: fixtury migawki biegu `skladowe_scena_migawka`/
       `zbieznosc_scena_migawka` różniły się tym jednym polem między dwoma
       wywołaniami). `compute_enm_hash` znacznika NIE obejmuje, więc
       zamrożenie nie zmienia żadnego hasza istniejących fixtur
       (zweryfikowane parytetem `--sprawdz`: 28 plików bit w bit)."""
    with (
        patch("enm.canonical_analysis.uuid4", return_value=uuid_kotwicy),
        patch("enm.canonical_analysis.datetime", _ZegarStalyBiegu),
        patch("enm.store.datetime", _ZegarStalyBiegu),
    ):
        yield


#: Docelowa szyna sceny stanu fazowego — `bus_sn_b` (siec zlota) niesie
#: galaz zasilajaca `cab_main_b` i odbior `load_c` dalej w sieci, wiec
#: asymetria pradow fazowych (opcje ponizej) ma widoczny wplyw na straty per
#: faza. Pradyw fazowe A/B/C sa DANYMI WEJSCIOWYMI sceny (zalozenie
#: projektanta — scenariusz obciazenia niezrownowazonego, TAKI SAM status jak
#: `threshold_criteria` sceny stabilnosci nizej), nie wynikiem solvera; wynik
#: (napiecia/straty/asymetrie/flagi) liczy REALNIE `PhaseStateSNSolver`
#: (`_execute_phase_state_sn`, `enm/canonical_analysis.py`) — zero fabrykacji
#: wyniku.
_OPCJE_SCENY_STAN_FAZOWY: dict[str, Any] = {
    "target_bus_ref": "bus_sn_b",
    "load_current_a": [135.0, 78.0, 100.0],
    "unbalance_alert_percent": 10.0,
}


def _bieg_sceny_stan_fazowy() -> Any:
    """Bieg `phase_state_sn` KOTWICY sceny „wyniki-stan-fazowy" — tor kanoniczny
    `create_run`/`execute_run` (jak `_werdykt_projektowy_scena`), na sieci
    zlotej. `reset_*` PRZED i PO — nie zostawia stanu innym fixturom."""
    reset_canonical_runs()
    reset_enm_store()
    try:
        set_enm(CASE_ID_HARNESSU, build_golden_enm())
        with _zamrozona_tozsamosc_biegu(_UUID_SCENY_STAN_FAZOWY):
            return execute_run(
                create_run(
                    case_id=CASE_ID_HARNESSU,
                    klucz_twin=CASE_ID_HARNESSU,
                    analysis_type="phase_state_sn",
                    options=_OPCJE_SCENY_STAN_FAZOWY,
                ).id
            )
    finally:
        reset_canonical_runs()
        reset_enm_store()


def stan_fazowy_scena_wyniki() -> dict[str, Any]:
    """Odpowiedź `GET /api/analysis-runs/{id}/results/phase-state`
    (`build_phase_state_results_response` — TA SAMA funkcja, którą woła
    końcówka `api/analysis_runs.py::get_phase_state_results`)."""
    run = _bieg_sceny_stan_fazowy()
    widok = build_phase_state_results_response(run)
    return _ustabilizuj_identyfikatory(widok, {str(run.id): RUN_ID_SCENY_STAN_FAZOWY})


#: Elementy sceny stabilnosci — siec zlota: zwarcie na galezi `line_b_c`
#: (odcinek Stacja B -> Stacja C), wylaczane bezpiecznikiem `fuse_c`, zrodlem
#: obserwowanym jest maszyna synchroniczna `gen_sync` (jedyne zrodlo wirujace
#: sieci zlotej — `PhaseClearSourceState` opisuje WYLACZNIE zrodla wirujace,
#: falownik `gen_pv` fizycznie nie ma kata mocy). Katy/napiecie/czestotliwosc
#: po zwarciu i stala czasowa odbudowy SA SCENARIUSZEM PRZYJETYM W OPCJACH
#: BIEGU tej analizy (dokladnie tak, jak `threshold_criteria` dotychczasowej
#: atrapy to dokumentowaly) — `evaluate_fault_clear_dynamic_stability` liczy
#: REALNIE werdykt progowy i `build_automation_trace` slad automatyki z tych
#: opcji (`_execute_dynamic_stability`), zero fabrykacji wyniku.
_OPCJE_SCENY_STABILNOSC: dict[str, Any] = {
    "scenario_id": "dyn-scena-stabilnosc",
    "source_ref": "gen_sync",
    "faulted_element_id": "line_b_c",
    "cleared_by_element_ids": ["fuse_c"],
    "clearing_time_ms": 120.0,
    "pre_fault_angle_deg": 10.0,
    "during_fault_angle_deg": 65.0,
    "post_fault_angle_deg": 28.0,
    "post_fault_voltage_pu": 0.97,
    "post_fault_frequency_pu": 0.99,
    "recovery_time_constant_s": 0.3,
}


def _bieg_sceny_stabilnosc() -> Any:
    """Bieg `dynamic_stability` KOTWICY sceny „wyniki-stabilnosc" — tor
    kanoniczny, na sieci zlotej. `reset_*` PRZED i PO."""
    reset_canonical_runs()
    reset_enm_store()
    try:
        set_enm(CASE_ID_HARNESSU, build_golden_enm())
        with _zamrozona_tozsamosc_biegu(_UUID_SCENY_STABILNOSC):
            return execute_run(
                create_run(
                    case_id=CASE_ID_HARNESSU,
                    klucz_twin=CASE_ID_HARNESSU,
                    analysis_type="dynamic_stability",
                    options=_OPCJE_SCENY_STABILNOSC,
                ).id
            )
    finally:
        reset_canonical_runs()
        reset_enm_store()


def stabilnosc_scena_wyniki() -> dict[str, Any]:
    """Odpowiedź `GET /api/analysis-runs/{id}/results/dynamic-stability`
    (`build_dynamic_stability_results_response` — TA SAMA funkcja, którą woła
    końcówka `api/analysis_runs.py::get_dynamic_stability_results`)."""
    run = _bieg_sceny_stabilnosc()
    widok = build_dynamic_stability_results_response(run)
    return _ustabilizuj_identyfikatory(widok, {str(run.id): RUN_ID_SCENY_STABILNOSC})


def stabilnosc_scena_slad() -> dict[str, Any]:
    """Odpowiedź `GET /api/analysis-runs/{id}/results/automation-trace`
    (`build_automation_trace_results_response` — TA SAMA funkcja, którą woła
    końcówka `api/analysis_runs.py::get_automation_trace_results`)."""
    run = _bieg_sceny_stabilnosc()
    widok = build_automation_trace_results_response(run)
    return _ustabilizuj_identyfikatory(widok, {str(run.id): RUN_ID_SCENY_STABILNOSC})


# ---------------------------------------------------------------------------
# Karta HARNESS-RESZTA (kontynuacja, 2026-09-16) — sceny „siła-sieci",
# „migotanie", „kompensacja(-wynik)", „walidacja"/„rozplyw"/„uwaga", „cieplna",
# „arcflash" — realny bieg backendu (analiza interpretacyjna na przebiegu
# short_circuit_sn/PF), zero recznie wpisanych liczb fizycznych. Sieć: złota dla
# „kompensacja(-wynik)", „walidacja"/„rozplyw"/„uwaga", „cieplna", „arcflash";
# „siła-sieci", „migotanie" (i kontekst siły sieci sceny „frt") — od karty AB-H0
# własna sieć sceny analiz OZE (`_enm_sceny_oze_analiz`, stacja 15/0,8 kV z falownikiem
# PV z karty), bo karta 0,8 kV nie może już siedzieć na szynie 0,4 kV sieci złotej.
# ---------------------------------------------------------------------------

RUN_ID_SCENY_OZE_ANALIZ = "run-sc-scena-oze-analiz"
_UUID_SCENY_OZE_ANALIZ = uuid5(NAMESPACE_URL, "mv-design-pro:harness:" + RUN_ID_SCENY_OZE_ANALIZ)

RUN_ID_SCENY_KOMPENSACJA = "run-lf-scena-kompensacja"
_UUID_SCENY_KOMPENSACJA = uuid5(NAMESPACE_URL, "mv-design-pro:harness:" + RUN_ID_SCENY_KOMPENSACJA)

RUN_ID_SCENY_ROZPLYW = "run-lf-scena-rozplyw"
_UUID_SCENY_ROZPLYW = uuid5(NAMESPACE_URL, "mv-design-pro:harness:" + RUN_ID_SCENY_ROZPLYW)


#: Karta przekształtnika PV sceny analiz OZE — REALNA karta katalogu MV
#: (`network_model/catalog/mv_converter_catalog.py`: Sn = 0,215 MVA, U_n = 0,8 kV,
#: c = 0,30) — jedna z trzech pozycji katalogu z współczynnikiem migotania.
_KARTA_PV_SCENY_OZE = "conv-pv-card-huawei-sun2000-215ktl"
#: Transformator stacji sceny: 15/0,8 kV 2,5 MVA — strona nN zgodna z napięciem
#: znamionowym falownika karty (tor tworzenia źródła odmawia niezgodności napięć).
_KATALOG_TRAFO_SCENY_OZE = "tr-sn-nn-15-0p8-2p5mva-dyn11-inverter"


def _enm_sceny_oze_analiz() -> dict[str, Any]:
    """Sieć sceny analiz OZE budowana operacjami domenowymi (tą samą drogą, którą model
    buduje projektant): GPZ 110/15 kV → kabel 500 m → stacja 15/0,8 kV 2,5 MVA →
    falownik PV z karty `_KARTA_PV_SCENY_OZE` utworzony `add_converter_source`
    (tabliczka z JEDNEJ materializacji katalogu: Sn, U_n, współczynnik migotania,
    certyfikat PTPiREE)."""
    enm = EnergyNetworkModel(header=ENMHeader(name="Scena analiz OZE")).model_dump(mode="json")
    enm = _operacja_domenowa_sceny(
        enm,
        "add_grid_source_sn",
        {
            "voltage_kv": 15.0,
            "source_name": "GPZ 110/15",
            "sk3_mva": 250.0,
            "rx_ratio": 0.1,
            "catalog_ref": _KATALOG_ZRODLA_KOORD,
            "hv_voltage_kv": 110.0,
            "transformer_sn_mva": 25.0,
        },
    )
    enm = _operacja_domenowa_sceny(
        enm,
        "continue_trunk_segment_sn",
        {
            "segment": {
                "rodzaj": "KABEL",
                "dlugosc_m": 500,
                "name": "Magistrala stacji PV",
                "catalog_ref": _KATALOG_KABLA_KOORD,
            }
        },
    )
    koniec_magistrali = str(
        [galaz for galaz in enm["branches"] if galaz.get("type") in ("cable", "line_overhead")][-1][
            "to_bus_ref"
        ]
    )
    enm = _operacja_domenowa_sceny(
        enm,
        "append_station_on_endpoint",
        {
            "endpoint_bus_ref": koniec_magistrali,
            "station": {"name": "Stacja PV", "station_type": "terminal"},
            "nn_voltage_kv": 0.8,
            "sn_fields": [{"field_role": "LINIA_IN"}, {"field_role": "TRANSFORMATOROWE"}],
            "field_apparatus_catalog_ref": _KATALOG_APARATU_KOORD,
            "transformer": {"create": True, "transformer_catalog_ref": _KATALOG_TRAFO_SCENY_OZE},
            "nn_block": {"outgoing_feeders_nn_count": 1},
        },
    )
    stacja = next(s for s in enm["substations"] if s.get("station_type") != "gpz")
    szyna_nn = next(
        b["ref_id"]
        for b in enm["buses"]
        if b["ref_id"] in stacja["bus_refs"] and abs(float(b["voltage_kv"]) - 0.8) < 1e-9
    )
    return _operacja_domenowa_sceny(
        enm,
        "add_converter_source",
        {
            "source_technology": "PV",
            "connection_variant": "nn_side",
            "station_ref": stacja["ref_id"],
            "bus_nn_ref": szyna_nn,
            "source_name": "Farma PV",
            "catalog_ref": _KARTA_PV_SCENY_OZE,
        },
    )


def _bieg_sceny_oze_analiz() -> Any:
    """Bieg `short_circuit_sn` KOTWICY scen „siła-sieci"/„migotanie"/„frt" na sieci
    `_enm_sceny_oze_analiz` (falownik PV z REALNEJ karty katalogu, utworzony torem
    tworzenia źródła).

    Karta AB-H0: `grid_strength`/`migotanie` czytają moc znamionową i współczynnik
    migotania WYŁĄCZNIE z karty zmaterializowanej w elemencie. Scena dopisywała dotąd na
    sieci złotej sam `catalog_ref` karty 0,8 kV do falownika na szynie 0,4 kV (liczby
    brał skasowany odczyt zapasowy z katalogu statycznego, a moc zwarciową falownika
    most liczył z |P| = 0,4 MW zamiast Sn = 0,215 MVA karty); przypisanie typu odmawia
    dziś takiej pary tym samym werdyktem co tor tworzenia (`converter.voltage_mismatch`).
    SCR/Pst policzone są REALNIE (`build_grid_strength_view`/`build_migotanie_view`) z
    realnego Sk'' solvera i realnej materializacji katalogu, nie wpisane ręcznie.
    `id`/zegar przypięte jak `_bieg_sceny_zwarcia`."""
    reset_canonical_runs()
    reset_enm_store()
    try:
        enm = EnergyNetworkModel.model_validate(_enm_sceny_oze_analiz())
        _fiksuj_niedeterminizm_sceny_zwarcia(enm)
        with _zamrozona_tozsamosc_biegu(_UUID_SCENY_OZE_ANALIZ):
            set_enm(CASE_ID_HARNESSU, enm)
            run = execute_run(
                create_run(
                    case_id=CASE_ID_HARNESSU,
                    klucz_twin=CASE_ID_HARNESSU,
                    analysis_type="short_circuit_sn",
                ).id
            )
        _fiksuj_niedeterminizm_sceny_zwarcia(enm)
        return run
    finally:
        reset_canonical_runs()
        reset_enm_store()


def sila_sieci_scena_wynik() -> dict[str, Any]:
    """Odpowiedź `GET /api/oze-analysis/grid-strength?run_id=` —
    `build_grid_strength_view`, TA SAMA funkcja, którą woła końcówka
    (`api/oze_analysis_runs.py::get_grid_strength`)."""
    run = _bieg_sceny_oze_analiz()
    widok = build_grid_strength_view(run)
    return _ustabilizuj_identyfikatory(widok, {str(run.id): RUN_ID_SCENY_OZE_ANALIZ})


def migotanie_scena_wynik() -> dict[str, Any]:
    """Odpowiedź `GET /api/quality/flicker?run_id=` — `build_migotanie_view`,
    TA SAMA funkcja, którą woła końcówka
    (`api/quality_analysis_runs.py::get_flicker`)."""
    run = _bieg_sceny_oze_analiz()
    widok = build_migotanie_view(run)
    return _ustabilizuj_identyfikatory(widok, {str(run.id): RUN_ID_SCENY_OZE_ANALIZ})


def _bieg_sceny_kompensacja() -> Any:
    """Bieg `PF` KOTWICY sceny „kompensacja(-wynik)" — sieć złota BEZ zmian
    (`build_golden_enm`, jedynie ustabilizowana `_fiksuj_niedeterminizm_
    sceny_zwarcia`), `id`/zegar przypięte jak biegi obok."""
    reset_canonical_runs()
    reset_enm_store()
    try:
        enm = build_golden_enm()
        _fiksuj_niedeterminizm_sceny_zwarcia(enm)
        with _zamrozona_tozsamosc_biegu(_UUID_SCENY_KOMPENSACJA):
            set_enm(CASE_ID_HARNESSU, enm)
            run = execute_run(
                create_run(
                    case_id=CASE_ID_HARNESSU, klucz_twin=CASE_ID_HARNESSU, analysis_type="PF"
                ).id
            )
        _fiksuj_niedeterminizm_sceny_zwarcia(enm)
        return run
    finally:
        reset_canonical_runs()
        reset_enm_store()


def kompensacja_scena_wynik() -> dict[str, Any]:
    """Odpowiedź `GET /api/oze-analysis/compensation-sizing?run_id=&bus_ref=
    bus_sn_b&cos_phi_min=0.95` — `build_compensation_sizing_view`, TA SAMA
    funkcja, którą woła końcówka
    (`api/oze_analysis_runs.py::get_compensation_sizing`). Węzeł `bus_sn_b`
    (Stacja B SN sieci złotej) i próg 0,95 wybrane, bo REALNIE dają dobór
    kandydata katalogowego (`KOMP_SN_0V6_15KV`) — inne węzły sieci złotej
    dają uczciwe „brak baterii dla tego napięcia" (`bus_nn`, 0,4 kV) albo
    „żaden kandydat nie spełnia" (`bus_sn_main`/`bus_sn_c`, generacja
    lokalna już podnosi cosφ powyżej tego, co dokłada bateria) — zmierzone
    bezpośrednio (probe), nie zgadywane."""
    run = _bieg_sceny_kompensacja()
    widok = build_compensation_sizing_view(run, bus_ref="bus_sn_b", cos_phi_min=0.95)
    return _ustabilizuj_identyfikatory(widok, {str(run.id): RUN_ID_SCENY_KOMPENSACJA})


def _bieg_sceny_rozplyw() -> Any:
    """Bieg `PF` KOTWICY scen „rozplyw"/„walidacja"/„uwaga" — sieć złota z
    obciążeniem ×8 (`_zlota_siec_z_obciazeniem`, TEN SAM mnożnik zmierzony
    przez architekta dla realnych naruszeń — `test_siec_x8_obciazenia_daje_
    realne_naruszenia_z_ujemnym_marginesem`), bo sieć złota bazowa (bez
    przeciążenia) zbiega z pomijalnymi stratami i zerowymi naruszeniami
    (zmierzone bezpośrednio) — nie demonstruje kolumny obciążalności/
    walidacji energetycznej. `id`/zegar przypięte jak biegi obok."""
    reset_canonical_runs()
    reset_enm_store()
    try:
        enm = _zlota_siec_z_obciazeniem(8.0)
        _fiksuj_niedeterminizm_sceny_zwarcia(enm)
        with _zamrozona_tozsamosc_biegu(_UUID_SCENY_ROZPLYW):
            set_enm(CASE_ID_HARNESSU, enm)
            run = execute_run(
                create_run(
                    case_id=CASE_ID_HARNESSU, klucz_twin=CASE_ID_HARNESSU, analysis_type="PF"
                ).id
            )
        _fiksuj_niedeterminizm_sceny_zwarcia(enm)
        return run
    finally:
        reset_canonical_runs()
        reset_enm_store()


def rozplyw_scena_wynik() -> dict[str, Any]:
    """Odpowiedź `GET /api/power-flow-runs/{id}/results`
    (`PowerFlowResultV1` — `get_power_flow_result`, TA SAMA funkcja, którą
    woła końcówka `api/power_flow_runs.py::get_power_flow_results`), zasiew
    scen „rozplyw"/„uwaga" (`usePowerFlowResultsStore`). Klucz `run_id`
    DOPISANY POZA kontraktem `PowerFlowResultV1` (który go nie niesie —
    zmierzone: `get_power_flow_result` nie osadza `run.id` w tekście, więc
    `_ustabilizuj_identyfikatory` niżej nie ma czego zamienić) — WYŁĄCZNIE
    żeby harness miał stabilny, nie-losowy identyfikator dla
    `runHeader.id` (ten sam wzorzec co syntetyczna koperta
    `RUN_KONTRAKT_SCENY` w `creator-harness-main.tsx`: metadane harnessu,
    nie fizyka wyniku)."""
    run = _bieg_sceny_rozplyw()
    widok = get_power_flow_result(run)
    widok = _ustabilizuj_identyfikatory(widok, {str(run.id): RUN_ID_SCENY_ROZPLYW})
    return {**widok, "run_id": RUN_ID_SCENY_ROZPLYW}


def walidacja_scena_wynik() -> dict[str, Any]:
    """Odpowiedź `GET /api/quality/energy-validation?run_id=` —
    `build_energy_validation_view`, TA SAMA funkcja, którą woła końcówka
    (`api/quality_analysis_runs.py::get_energy_validation`), na TYM SAMYM
    biegu ×8 co `rozplyw_scena_wynik` (spójność liczb między scenami "rozplyw"
    i "walidacja" — obie czytają jeden przebieg)."""
    run = _bieg_sceny_rozplyw()
    widok = build_energy_validation_view(run)
    return _ustabilizuj_identyfikatory(widok, {str(run.id): RUN_ID_SCENY_ROZPLYW})


def cieplna_scena_wynik() -> dict[str, Any]:
    """Odpowiedź `GET /api/quality/conductor-thermal-withstand?run_id=` —
    `build_wytrzymalosc_cieplna_view`, TA SAMA funkcja, którą woła końcówka
    (`api/quality_analysis_runs.py::get_conductor_thermal_withstand`), na
    biegu kotwicy sceny „zwarcia" (`_bieg_sceny_zwarcia` — REUŻYCIE, zero
    nowej sieci: ta sama fizyka, ten sam bieg zapisany co scena zwarciowa)."""
    run, _enm, _target_id = _bieg_sceny_zwarcia()
    widok = build_wytrzymalosc_cieplna_view(run, None)
    return _ustabilizuj_identyfikatory(widok, {str(run.id): RUN_ID_SCENY_ZWARCIA})


def cieplna_scena_dowod() -> dict[str, Any]:
    """Odpowiedź `GET /api/quality/conductor-thermal-withstand/proof?run_id=
    &branch_id=` — `zbuduj_dowod_cieplny`, TA SAMA funkcja, którą woła
    końcówka. `branch_id` = gałąź z NAJWIĘKSZYM prądem zwarciowym w ocenie
    cieplnej sceny (deterministyczny wybór max, tiebreak po `branch_id` —
    KLASA, nie instancja: żaden branch_id nie jest zaszyty ręcznie), żeby
    dowód demonstrował KRYTERIUM na gałęzi FAKTYCZNIE na drodze zwarcia
    (gałęzie poza drogą mają `i_fault_a=0.0` i dowód trywialny)."""
    run, _enm, _target_id = _bieg_sceny_zwarcia()
    ocena = build_wytrzymalosc_cieplna_view(run, None)["ocena"]["items"]
    najwiekszy = max(ocena, key=lambda pozycja: (pozycja["i_fault_a"], pozycja["branch_id"]))
    widok = zbuduj_dowod_cieplny(run, najwiekszy["branch_id"], None)
    return _ustabilizuj_identyfikatory(widok, {str(run.id): RUN_ID_SCENY_ZWARCIA})


def arcflash_scena_wynik() -> dict[str, Any]:
    """Odpowiedź `POST /api/quality/arc-flash` — `build_arc_flash_view`, TA
    SAMA funkcja, którą woła końcówka (`api/quality_analysis_runs.py::
    post_arc_flash`), na biegu kotwicy sceny „zwarcia" (REUŻYCIE). Parametry
    elektrod/odległości robocze SĄ DANYMI WEJŚCIOWYMI żądania (jak scenariusz
    sceny stabilności obok) — norma IEEE 1584-2018 wymaga ich jawnie, solver
    ich nie zgaduje; wartości typowe dla rozdzielni SN wnętrzowej z wyłącznikiem
    próżniowym (VCB, odległość robocza 455 mm, odstęp elektrod 104 mm, czas
    łuku 0,2 s — tabela 3/4/5 IEEE 1584-2018 dla klasy napięciowej 15 kV)."""
    run, _enm, _target_id = _bieg_sceny_zwarcia()
    widok = build_arc_flash_view(
        run,
        working_distance_mm=455.0,
        conductor_gap_mm=104.0,
        arc_time_s=0.2,
        electrode_config="VCB",
        enclosure_type="Typical",
    )
    return _ustabilizuj_identyfikatory(widok, {str(run.id): RUN_ID_SCENY_ZWARCIA})


def przeglad_wiarygodnosci_katalogu_scena() -> dict[str, Any]:
    """Odpowiedź `GET /api/catalog/przeglad-wiarygodnosci` — TA SAMA funkcja,
    którą woła końcówka (`api/catalog.py::przeglad_wiarygodnosci_katalogu`).

    Scena harnessu „przeglad-wiarygodnosci" karmi sekcję „Pozycje do przeglądu"
    przeglądarki biblioteki typów TĄ fikstrurą, więc ekran pokazuje liczby
    policzone na ŻYWYM katalogu backendu, a nie wpisane ręcznie. Rozjazd między
    plikiem w repo a świeżym wyliczeniem jest czerwienią
    `tests/ci/test_fixtury_harnessu.py`, a nie cichą rozbieżnością.
    """
    from api.catalog import przeglad_wiarygodnosci_katalogu  # noqa: PLC0415

    return przeglad_wiarygodnosci_katalogu().model_dump(mode="json")


# ---------------------------------------------------------------------------
# Karta HARNESS-RESZTA-2 (2026-09-17) — sceny „wyniki-skladowe" (E-29) i
# „wyniki-zbieznosc" (E-30). Obie były karmione blokami JSON pisanymi RĘCZNIE
# (bilans 1F, składowe Z1/Z2/Z0 śladu, iteracje Newtona-Raphsona, pętla OLTC) —
# liczby wyglądały jak wynik solvera, ale żaden solver ich nie policzył.
# ---------------------------------------------------------------------------

RUN_ID_SCENY_SKLADOWE = "run-sc-scena-skladowe"
_UUID_SCENY_SKLADOWE = uuid5(NAMESPACE_URL, "mv-design-pro:harness:" + RUN_ID_SCENY_SKLADOWE)

RUN_ID_SCENY_ZBIEZNOSC = "run-lf-scena-zbieznosc"
_UUID_SCENY_ZBIEZNOSC = uuid5(NAMESPACE_URL, "mv-design-pro:harness:" + RUN_ID_SCENY_ZBIEZNOSC)


def _bieg_sceny_skladowe() -> Any:
    """Bieg zwarcia JEDNOFAZOWEGO (`options={"fault_type": "1F"}` — TEN SAM
    klucz, który czyta `_short_circuit_type_from_options` przy tworzeniu biegu)
    KOTWICY sceny „wyniki-skladowe" (E-29 „Składowe symetryczne i sieć
    zerowa") na sieci złotej `build_golden_enm`.

    Sieć złota ma komplet składowej zerowej (`availability.short_circuit_1f`
    — bez niego `create_run` odmawia: „Zwarcie 1F/2F+Z wymaga kompletnej
    skladowej zerowej Z0 w ENM"), więc bieg 1F wykonuje się na niej BEZ
    dokładania czegokolwiek do modelu (zmierzone bezpośrednio: 5 punktów
    zwarcia, krok śladu `Zk` z `z1_ohm`/`z2_ohm`/`z0_ohm` jako liczby
    zespolone — dokładnie to, co czyta `skladoweModel.ts`).

    `id`/zegar przypięte jak `_bieg_sceny_zwarcia` (ta sama klasa
    niedeterminizmu)."""
    reset_canonical_runs()
    reset_enm_store()
    try:
        enm = build_golden_enm()
        _fiksuj_niedeterminizm_sceny_zwarcia(enm)
        with _zamrozona_tozsamosc_biegu(_UUID_SCENY_SKLADOWE):
            set_enm(CASE_ID_HARNESSU, enm)
            run = execute_run(
                create_run(
                    case_id=CASE_ID_HARNESSU,
                    klucz_twin=CASE_ID_HARNESSU,
                    analysis_type="short_circuit_sn",
                    options={"fault_type": "1F"},
                ).id
            )
        _fiksuj_niedeterminizm_sceny_zwarcia(enm)
        return run
    finally:
        reset_canonical_runs()
        reset_enm_store()


def skladowe_scena_wynik() -> dict[str, Any]:
    """Odpowiedź `GET /api/analysis-runs/{id}/results/short-circuit` biegu 1F
    (`build_short_circuit_results_response` — TA SAMA funkcja, którą woła
    końcówka `api/analysis_runs.py::get_short_circuit_results`, czytana przez
    `fetchShortCircuitResults` ekranu E-29)."""
    run = _bieg_sceny_skladowe()
    widok = build_short_circuit_results_response(run)
    return _ustabilizuj_identyfikatory(widok, {str(run.id): RUN_ID_SCENY_SKLADOWE})


def skladowe_scena_slad() -> dict[str, Any]:
    """Odpowiedź `GET /api/analysis-runs/{id}/results/trace`
    (`build_extended_trace_response` — TA SAMA funkcja, którą woła końcówka
    `get_extended_trace`, czytana przez `fetchExtendedTrace`). Niesie krok
    solvera FROZEN `Zk` ze składowymi Z1/Z2/Z0 — jedyne źródło tych liczb dla
    ekranu E-29 (`skladowe/model.ts`)."""
    run = _bieg_sceny_skladowe()
    widok = build_extended_trace_response(run)
    return _ustabilizuj_identyfikatory(widok, {str(run.id): RUN_ID_SCENY_SKLADOWE})


def skladowe_scena_migawka() -> dict[str, Any]:
    """Odpowiedź `GET /api/analysis-runs/{id}/snapshot` — ZAMROŻONA wersja
    układu biegu, złożona DOKŁADNIE tak jak końcówka
    (`api/analysis_runs.py::get_analysis_run_snapshot`:
    `_catalog_completed_snapshot` + `canonicalize_json`). Ekran E-29 czyta z
    niej uziemienie punktu neutralnego źródła (`Source.neutral_grounding`)."""
    run = _bieg_sceny_skladowe()
    widok = canonicalize_json(
        {
            "run_id": str(run.id),
            "snapshot_id": run.snapshot_hash,
            "snapshot": _catalog_completed_snapshot(run.snapshot),
        }
    )
    return _ustabilizuj_identyfikatory(widok, {str(run.id): RUN_ID_SCENY_SKLADOWE})


#: Regulator OLTC transformatora `tr_hv_sn` sieci złotej — sieć złota BAZOWA nie
#: ma ŻADNEGO przełącznika zaczepów pod obciążeniem (zmierzone bezpośrednio:
#: `tap_changer is None` na obu transformatorach), więc pętla regulacji w ogóle
#: się nie uruchamia (`oltc_control is None`) i ekran E-30 nie ma czego pokazać w
#: sekcjach „regulacja zaczepów przebiegu"/„założenia zaczepów modelu". Zaczep
#: jest DANĄ MODELU (jak `catalog_ref` dopisany na `gen_pv` dla sceny siły
#: sieci), nie wynikiem — decyzje regulatora, pozycje końcowe i liczbę przełączeń
#: liczy WYŁĄCZNIE pętla OLTC solvera rozpływu. Nastawa 15,4 kV z pasmem 0,1 kV
#: dobrana tak, aby regulator FAKTYCZNIE przełączał (napięcie szyny SN bez
#: regulacji: 15,0075 kV — zmierzone; regulacja schodzi do pozycji −2 i kończy
#: `within_deadband`), bo regulator, który od razu jest w paśmie, nie
#: demonstruje ani jednej decyzji.
_ZACZEP_SCENY_ZBIEZNOSC = TapChanger(
    regulation_type="OLTC",
    regulated_winding="HV",
    neutral_position=0,
    current_position=0,
    min_position=-9,
    max_position=9,
    step_percent=1.25,
    control_mode="AUTOMATIC",
    voltage_setpoint_kv=15.4,
    deadband_kv=0.1,
)


def _enm_sceny_zbieznosc() -> EnergyNetworkModel:
    """Sieć złota z regulatorem OLTC na transformatorze `tr_hv_sn`
    (`controlled_bus_ref` = szyna dolnego napięcia tego transformatora — jedno
    źródło prawdy, bez drugiego literału refu szyny)."""
    enm = build_golden_enm()
    for transformator in enm.transformers:
        if transformator.ref_id == "tr_hv_sn":
            transformator.tap_changer = _ZACZEP_SCENY_ZBIEZNOSC.model_copy(
                update={"controlled_bus_ref": transformator.lv_bus_ref}
            )
    _fiksuj_niedeterminizm_sceny_zwarcia(enm)
    return enm


def _bieg_sceny_zbieznosc() -> Any:
    """Bieg `PF` KOTWICY sceny „wyniki-zbieznosc" (E-30 „Zbieżność rozpływu i
    zaczepy") — sieć złota z regulatorem OLTC (wyżej). `id`/zegar przypięte jak
    biegi obok."""
    reset_canonical_runs()
    reset_enm_store()
    try:
        enm = _enm_sceny_zbieznosc()
        with _zamrozona_tozsamosc_biegu(_UUID_SCENY_ZBIEZNOSC):
            set_enm(CASE_ID_HARNESSU, enm)
            run = execute_run(
                create_run(
                    case_id=CASE_ID_HARNESSU, klucz_twin=CASE_ID_HARNESSU, analysis_type="PF"
                ).id
            )
        _fiksuj_niedeterminizm_sceny_zwarcia(enm)
        return run
    finally:
        reset_canonical_runs()
        reset_enm_store()


def zbieznosc_scena_naglowek() -> dict[str, Any]:
    """Odpowiedź `GET /api/power-flow-runs/{id}`
    (`build_power_flow_run_header` — TA SAMA funkcja, którą woła końcówka
    `api/power_flow_runs.py`), czytana przez `useAnalysisRunContract`
    i nagłówek ekranu E-30."""
    run = _bieg_sceny_zbieznosc()
    widok = build_power_flow_run_header(run)
    return _ustabilizuj_identyfikatory(widok, {str(run.id): RUN_ID_SCENY_ZBIEZNOSC})


def zbieznosc_scena_wynik() -> dict[str, Any]:
    """Odpowiedź `GET /api/power-flow-runs/{id}/results` (`PowerFlowResultV1`
    — `get_power_flow_result`), zasiew `usePowerFlowResultsStore` sceny E-30.
    `run_id` DOPISANY poza kontraktem (jak w `rozplyw_scena_wynik`) —
    metadana harnessu, nie fizyka wyniku."""
    run = _bieg_sceny_zbieznosc()
    widok = get_power_flow_result(run)
    widok = _ustabilizuj_identyfikatory(widok, {str(run.id): RUN_ID_SCENY_ZBIEZNOSC})
    return {**widok, "run_id": RUN_ID_SCENY_ZBIEZNOSC}


def zbieznosc_scena_slad() -> dict[str, Any]:
    """Odpowiedź `GET /api/power-flow-runs/{id}/trace` (`get_power_flow_trace`
    — TA SAMA funkcja, którą woła końcówka): iteracje Newtona-Raphsona
    (`iterations`) ORAZ ślad pętli OLTC (`oltc_control`: decyzje regulatora,
    liczby przełączeń, pozycje końcowe) — obie sekcje ekranu E-30."""
    run = _bieg_sceny_zbieznosc()
    widok = get_power_flow_trace(run)
    return _ustabilizuj_identyfikatory(widok, {str(run.id): RUN_ID_SCENY_ZBIEZNOSC})


def zbieznosc_scena_migawka() -> dict[str, Any]:
    """Migawka modelu przypadku sceny E-30 (`useSnapshotStore`) — ZAMROŻONA
    wersja układu biegu, złożona DOKŁADNIE jak końcówka `/snapshot`; niesie
    transformator z regulatorem OLTC (sekcja „założenia zaczepów modelu")."""
    run = _bieg_sceny_zbieznosc()
    return canonicalize_json(_catalog_completed_snapshot(run.snapshot))


# ---------------------------------------------------------------------------
# Karta HARNESS-RESZTA-2 (2026-09-17) — scena „koordynacja" (E-28 „Koordynacja
# zabezpieczeń"). Największy blok ręcznych liczb harnessu: wiersze dwóch biegów
# zwarciowych, wiersze gałęziowe rozpływu, migawka modelu, krzywe TCC, werdykty
# par, ślad analizy, nastawy I>/I>> i dopasowanie aparatu — wszystko pisane
# ręcznie na sieci, która NIE ISTNIEJE (refy `gpz/sekcja_a/bus_sn`,
# `stacja_s02/bus_sn` nie występują w żadnej sieci rejestru).
#
# WYBÓR SIECI SCENY. Ani sieć złota, ani `gpzFeeder.enm.json` nie niosą kształtu,
# którego ten ekran wymaga (zmierzone bezpośrednio): sieć złota ma JEDEN odcinek
# z kompletem danych katalogowych i ZERO kandydatów kolejnej strefy; gpzFeeder
# kończy magistralę zaciskiem technicznym (`helper_bus`), który nie jest
# raportowalnym punktem zwarcia. Dodatkowo obie mają falownik bez deklaracji
# `k_sc`, więc brama autorytetu koordynacji (`wymagaj_autorytetu`,
# `SI-110`) odmawia wyniku. Scena buduje więc WŁASNĄ sieć — DOKŁADNIE tymi
# operacjami domenowymi, którymi buduje ją projektant w aplikacji
# (`add_grid_source_sn`, `continue_trunk_segment_sn`,
# `insert_station_on_segment_sn`, `add_load_sn`) — dwie stacje SN/nN na jednej
# magistrali, bez źródeł wytwórczych. Refy elementów są deterministyczne
# (pochodne treści operacji — zmierzone: dwa niezależne przebiegi budowy dają
# ten sam `seg/.../segment`).
# ---------------------------------------------------------------------------

RUN_ID_SCENY_KOORD_MAX = "run-sc-scena-koordynacja-max"
RUN_ID_SCENY_KOORD_MIN = "run-sc-scena-koordynacja-min"
RUN_ID_SCENY_KOORD_PF = "run-lf-scena-koordynacja"
RUN_ID_SCENY_KOORD_ANALIZA = "run-koordynacja-scena"
_UUID_SCENY_KOORD_MAX = uuid5(NAMESPACE_URL, "mv-design-pro:harness:" + RUN_ID_SCENY_KOORD_MAX)
_UUID_SCENY_KOORD_MIN = uuid5(NAMESPACE_URL, "mv-design-pro:harness:" + RUN_ID_SCENY_KOORD_MIN)
_UUID_SCENY_KOORD_PF = uuid5(NAMESPACE_URL, "mv-design-pro:harness:" + RUN_ID_SCENY_KOORD_PF)
_CZAS_ANALIZY_KOORDYNACJI = "2026-09-17T08:00:00+00:00"
#: Identyfikator projektu sceny koordynacji — deterministyczny `uuid5`
#: (końcówka wymaga UUID, a harness nie ma rejestru projektów).
_PROJEKT_SCENY_KOORDYNACJA = uuid5(NAMESPACE_URL, "mv-design-pro:harness:projekt-koordynacja")

#: Karty katalogowe sceny — REALNE identyfikatory katalogu projektu (te same,
#: których używa spec `e2e/nastawy-koordynacji-hoppel.spec.ts` budując sieć przez
#: `/api/cases/{id}/enm/domain-ops`).
_KATALOG_KABLA_KOORD = "cable-tfk-yakxs-3x120"
_KATALOG_TRAFO_KOORD = "tr-sn-nn-15-04-630kva-dyn11"
_KATALOG_ZRODLA_KOORD = "src-gpz-15kv-250mva-rx010"
_KATALOG_APARATU_KOORD = "sw-cb-abb-vd4-17kv-630a"

#: Aparat, wobec którego scena sprawdza dopasowanie nastaw — REALNY rekord
#: katalogu analitycznego (`GET /api/catalog/protection/device-types`).
_APARAT_DOPASOWANIA_KOORD = "ABB_REF601"

#: Nazwa szablonu zabezpieczenia — 1:1 z `DEVICE_TEMPLATES[relay-50-51].name`
#: (to tę nazwę klika spec zrzutów w oknie szablonów).
NAZWA_SZABLONU_ZABEZPIECZENIA_KOORD = "Przekaznik 50/51 (typowy)"

#: Identyfikator projektu w WYNIKU koordynacji: końcówka wymaga UUID, ale w
#: harnessie nie ma rejestru projektów, więc w fixturze zostaje stabilna
#: etykieta zamiast losowego identyfikatora (metadana, nie fizyka).
PROJEKT_SCENY_KOORDYNACJA_PL = "projekt-scena-koordynacja"

#: Szablon zabezpieczenia sceny — 1:1 z `DEVICE_TEMPLATES[relay-50-51]`
#: (`frontend/src/ui/protection-coordination/types.ts`), czyli DOKŁADNIE to, co
#: wysyła ekran po kliknięciu „Zastosuj szablon" w spec `wszystkie-sceny-
#: screenshot.spec.ts`. Rozjazd tego szablonu z szablonem UI wykrywa atrapa
#: harnessu (odmowa 409, jak scena `macierz`), nie cicha podmiana liczb.
_SZABLON_ZABEZPIECZENIA_KOORD: dict[str, Any] = {
    "stage_51": {
        "enabled": True,
        "pickup_current_a": 400,
        "curve_settings": {
            "standard": "IEC",
            "variant": "SI",
            "pickup_current_a": 400,
            "time_multiplier": 0.3,
        },
        "directional": False,
    },
    "stage_50": {
        "enabled": True,
        "pickup_current_a": 2000,
        "time_s": 0.1,
        "directional": False,
    },
}

#: Odbiory stacji sceny — DANE WEJŚCIOWE projektu (moc przyłączeniowa stacji
#: SN/nN, typowa dla stacji miejskiej 630 kVA obciążonej w ~40%), nie wynik.
#: Bez nich magistrala jest praktycznie nieobciążona (prąd rzędu 2 A zmierzony
#: na modelu bez odbiorów), a nastawa I> = k_b·I_obc wychodziła 2,8 A — liczba
#: prawdziwa, ale nieczytelna jako demonstracja ekranu.
_MOC_ODBIORU_STACJI_KW = 250.0
_COS_PHI_ODBIORU_STACJI = 0.95


def _operacja_domenowa_sceny(
    enm: dict[str, Any], nazwa: str, payload: dict[str, Any]
) -> dict[str, Any]:
    """Jedna operacja domenowa budowy sieci sceny — TA SAMA funkcja, którą woła
    końcówka `POST /api/cases/{id}/enm/domain-ops` (`execute_domain_operation`).
    Błąd operacji kończy eksport: sieć sceny nie może powstać „częściowo".
    Wspólna dla WSZYSTKICH sieci scen budowanych operacjami (koordynacja,
    stacja demo) — jedno miejsce obsługi błędu."""
    wynik = execute_domain_operation(enm, nazwa, payload)
    if wynik.get("error") is not None:
        raise SystemExit(f"[fixtury] operacja {nazwa} sceny koordynacji: {wynik['error']}")
    snapshot = wynik.get("snapshot")
    if not isinstance(snapshot, dict):
        raise SystemExit(f"[fixtury] operacja {nazwa} sceny koordynacji nie zwrociła migawki")
    return snapshot


def _enm_sceny_koordynacja() -> tuple[EnergyNetworkModel, str, str]:
    """Sieć sceny E-28 + `(ref chronionego odcinka, ref kolejnej szyny)`.

    Kształt: GPZ 110/15 kV → magistrala kablowa → Stacja S01 (SN/nN) →
    magistrala → Stacja S02 (SN/nN). Obie szyny SN stacji są RAPORTOWALNYMI
    punktami zwarcia, więc odcinek S01→S02 ma komplet trzech szyn z prądem
    zwarciowym (warunek nastaw I>/I>>), a obie nadają się na lokalizację
    zabezpieczenia. ZERO źródeł wytwórczych — sieć bez falownika nie niesie
    znacznika `DOMYSLNE_SYSTEMOWE` proweniencji `k_sc`, więc brama autorytetu
    koordynacji przepuszcza wynik (na sieci złotej odmawiała: kod SI-110,
    zmierzone).

    Układ sieci nN (`lv_earthing_system`) deklarowany JAWNIE dla każdego
    transformatora SN/nN — walidator odmawia biegu bez tej deklaracji (E063),
    a operacja wstawienia stacji jej nie zgaduje. To dana wejściowa sceny,
    jak w `_gpz_feeder_enm_z_falownikiem` obok."""
    enm = EnergyNetworkModel(header=ENMHeader(name="Magistrala SN — scena koordynacji")).model_dump(
        mode="json"
    )
    enm = _operacja_domenowa_sceny(
        enm,
        "add_grid_source_sn",
        {
            "voltage_kv": 15.0,
            "source_name": "GPZ Wschód",
            "sk3_mva": 250.0,
            "rx_ratio": 0.1,
            "catalog_ref": _KATALOG_ZRODLA_KOORD,
            "hv_voltage_kv": 110.0,
            "transformer_sn_mva": 25.0,
        },
    )
    enm = _operacja_domenowa_sceny(
        enm,
        "continue_trunk_segment_sn",
        {
            "segment": {
                "rodzaj": "KABEL",
                "dlugosc_m": 900,
                "name": "Magistrala GPZ",
                "catalog_ref": _KATALOG_KABLA_KOORD,
            }
        },
    )
    segment_zrodlowy = [
        galaz["ref_id"]
        for galaz in enm["branches"]
        if galaz.get("type") in ("cable", "line_overhead")
    ][-1]

    stacja_wspolna: dict[str, Any] = {
        "field_apparatus_catalog_ref": _KATALOG_APARATU_KOORD,
        "insert_at": {"mode": "RATIO", "value": 0.5},
        "sn_fields": [
            {"field_role": "LINIA_IN"},
            {"field_role": "LINIA_OUT"},
            {"field_role": "TRANSFORMATOROWE"},
        ],
        "transformer": {"create": True, "transformer_catalog_ref": _KATALOG_TRAFO_KOORD},
        "nn_block": {"outgoing_feeders_nn_count": 1},
    }
    for segment, nazwa_stacji in (
        (segment_zrodlowy, "Stacja S01"),
        (f"{segment_zrodlowy}_R", "Stacja S02"),
    ):
        enm = _operacja_domenowa_sceny(
            enm,
            "insert_station_on_segment_sn",
            {
                **stacja_wspolna,
                "segment_id": segment,
                "station": {
                    "station_type": "B",
                    "station_name": nazwa_stacji,
                    "sn_voltage_kv": 15.0,
                    "nn_voltage_kv": 0.4,
                },
            },
        )

    for szyna_nn in sorted(
        szyna["ref_id"] for szyna in enm["buses"] if szyna["ref_id"].endswith("/nn_bus")
    ):
        enm = _operacja_domenowa_sceny(
            enm,
            "add_load_sn",
            {
                "bus_ref": szyna_nn,
                "name": "Odbiór stacji",
                "active_power_kw": _MOC_ODBIORU_STACJI_KW,
                "cos_phi": _COS_PHI_ODBIORU_STACJI,
            },
        )

    model = EnergyNetworkModel.model_validate(enm)
    for transformator in model.transformers:
        if transformator.ulv_kv < 1.0 and transformator.lv_earthing_system is None:
            transformator.lv_earthing_system = "TN-C-S"
    _fiksuj_niedeterminizm_sceny_zwarcia(model)
    # Chroniony odcinek = `segment_R_L` (S01 → S02): JEDYNY odcinek magistrali
    # między dwiema szynami stacyjnymi, więc jedyny z kompletem trzech szyn
    # raportowalnych. Kolejna szyna = szyna SN Stacji S02 (koniec tego odcinka
    # ma dalej `segment_R_R`, którego drugi koniec jest zaciskiem technicznym).
    return model, f"{segment_zrodlowy}_L", f"{segment_zrodlowy}_R_L"


@contextmanager
def _biegi_sceny_koordynacja() -> Iterator[tuple[Any, Any, Any, EnergyNetworkModel, str]]:
    """Trzy biegi KOTWIC sceny E-28 na sieci wyżej + ref chronionego odcinka:
    zwarcie 3F w wariancie MAKSYMALNYM (selektywność, nastawy), zwarcie 3F w
    wariancie MINIMALNYM (czułość — `options={"scenario": "min"}`, TEN SAM
    klucz, który czyta `_scenariusz_z_opcji`) i rozpływ mocy (prądy robocze
    gałęzi). Oba biegi zwarciowe stoją na TEJ SAMEJ migawce modelu —
    `wejscie_koordynacji_z_biegow` odmawia pary z dwóch różnych modeli.

    MENEDŻER KONTEKSTU, nie zwykła funkcja: `run_coordination_analysis` i
    `wejscie_koordynacji_z_biegow` czytają biegi Z REJESTRU po identyfikatorze,
    więc rejestr musi ŻYĆ przez cały czas liczenia fixtury (zmierzone: zwrócenie
    biegów po `reset_canonical_runs()` kończyło się `BiegNiemiarodajnyError`
    „bieg nie istnieje"). `reset_*` po wyjściu — jak każda kotwica tego
    skryptu, żeby nie zostawić stanu innym fixturom."""
    reset_canonical_runs()
    reset_enm_store()
    try:
        model, linia, _szyna = _enm_sceny_koordynacja()
        with _zamrozona_tozsamosc_biegu(_UUID_SCENY_KOORD_MAX):
            set_enm(CASE_ID_HARNESSU, model)
            bieg_max = execute_run(
                create_run(
                    case_id=CASE_ID_HARNESSU,
                    klucz_twin=CASE_ID_HARNESSU,
                    analysis_type="short_circuit_sn",
                ).id
            )
        with _zamrozona_tozsamosc_biegu(_UUID_SCENY_KOORD_MIN):
            bieg_min = execute_run(
                create_run(
                    case_id=CASE_ID_HARNESSU,
                    klucz_twin=CASE_ID_HARNESSU,
                    analysis_type="short_circuit_sn",
                    options={"scenario": "min"},
                ).id
            )
        with _zamrozona_tozsamosc_biegu(_UUID_SCENY_KOORD_PF):
            bieg_pf = execute_run(
                create_run(
                    case_id=CASE_ID_HARNESSU, klucz_twin=CASE_ID_HARNESSU, analysis_type="PF"
                ).id
            )
        _fiksuj_niedeterminizm_sceny_zwarcia(model)
        yield bieg_max, bieg_min, bieg_pf, model, linia
    finally:
        reset_canonical_runs()
        reset_enm_store()


def _mapa_identyfikatorow_koordynacji(bieg_max: Any, bieg_min: Any, bieg_pf: Any) -> dict[str, str]:
    return {
        str(bieg_max.id): RUN_ID_SCENY_KOORD_MAX,
        str(bieg_min.id): RUN_ID_SCENY_KOORD_MIN,
        str(bieg_pf.id): RUN_ID_SCENY_KOORD_PF,
    }


def koordynacja_scena_zwarcia_max() -> dict[str, Any]:
    """Odpowiedź `GET …/results/short-circuit` biegu MAKSYMALNEGO (c_max = 1,10)
    — wiersze, z których ekran koordynacji buduje prądy zwarciowe maksymalne
    (`pradyZBiegow.ts::pradyZwarcioweZBiegu`, dopasowanie po `element_id`)."""
    with _biegi_sceny_koordynacja() as (bieg_max, bieg_min, bieg_pf, _model, _linia):
        return _ustabilizuj_identyfikatory(
            build_short_circuit_results_response(bieg_max),
            _mapa_identyfikatorow_koordynacji(bieg_max, bieg_min, bieg_pf),
        )


def koordynacja_scena_zwarcia_min() -> dict[str, Any]:
    """Odpowiedź `GET …/results/short-circuit` biegu MINIMALNEGO (c_min) —
    bez niego czułość zabezpieczeń jest niesprawdzalna (`zbudujPradyKoordynacji`
    w ogóle nie tworzy pozycji prądowej)."""
    with _biegi_sceny_koordynacja() as (bieg_max, bieg_min, bieg_pf, _model, _linia):
        return _ustabilizuj_identyfikatory(
            build_short_circuit_results_response(bieg_min),
            _mapa_identyfikatorow_koordynacji(bieg_max, bieg_min, bieg_pf),
        )


def koordynacja_scena_galezie() -> dict[str, Any]:
    """Odpowiedź `GET …/results/branches` biegu rozpływu
    (`build_branch_results_response`) — prądy robocze gałęzi magistrali."""
    with _biegi_sceny_koordynacja() as (bieg_max, bieg_min, bieg_pf, _model, _linia):
        return _ustabilizuj_identyfikatory(
            build_branch_results_response(bieg_pf),
            _mapa_identyfikatorow_koordynacji(bieg_max, bieg_min, bieg_pf),
        )


def koordynacja_scena_migawka() -> dict[str, Any]:
    """Migawka modelu przypadku (`GET /api/cases/{id}/enm`) — źródło LISTY
    WYBORU lokalizacji zabezpieczenia na ekranie (`lokalizacjeZModelu.ts`)."""
    with _biegi_sceny_koordynacja() as (_bieg_max, _bieg_min, _bieg_pf, model, _linia):
        return canonicalize_json(model.model_dump(mode="json"))


def koordynacja_scena_pakiet_dostepnosc_max() -> dict[str, Any]:
    """Odpowiedź `GET …/pakiet-dowodowy-nastaw/dostepnosc` biegu MAKSYMALNEGO
    (`dostepnosc_pakietu_nastaw`) — lista odcinków-kandydatów z szynami kolejnej
    strefy selektywności."""
    with _biegi_sceny_koordynacja() as (bieg_max, bieg_min, bieg_pf, _model, _linia):
        return _ustabilizuj_identyfikatory(
            canonicalize_json(dostepnosc_pakietu_nastaw(bieg_max)),
            _mapa_identyfikatorow_koordynacji(bieg_max, bieg_min, bieg_pf),
        )


def koordynacja_scena_pakiet_dostepnosc_min() -> dict[str, Any]:
    """To samo dla biegu MINIMALNEGO — odpowiedź jest ODMOWĄ nazwaną
    (`dostepny: false`, powód: wariant minimalny nie może być kotwicą nastaw).
    Scena pokazuje dokładnie tę odmowę i przejście do kolejnego kandydata."""
    with _biegi_sceny_koordynacja() as (bieg_max, bieg_min, bieg_pf, _model, _linia):
        return _ustabilizuj_identyfikatory(
            canonicalize_json(dostepnosc_pakietu_nastaw(bieg_min)),
            _mapa_identyfikatorow_koordynacji(bieg_max, bieg_min, bieg_pf),
        )


#: Zacisk zabezpieczenia odcinka sceny (decyzja O-51): sieć sceny nie przypina
#: zabezpieczeń do wyłączników (model milczy), więc ekran wymaga wskazania — scena
#: wskazuje zacisk początkowy (strona Stacji S01), tak jak klika go spec e2e.
ZACISK_ZABEZPIECZENIA_SCENY_KOORD = "od"


def _pozycja_nastaw_sceny_koordynacja(bieg_max: Any, linia: str) -> dict[str, Any]:
    """Pozycja dostępności pakietu nastaw dla chronionego odcinka sceny — wybór
    wskazany przez BUDOWĘ sieci (ref odcinka S01→S02), potwierdzony przez
    `dostepnosc_pakietu_nastaw` (jedno źródło prawdy listy kandydatów; po
    naprawie predykatu parami z tej karty lista niesie WYŁĄCZNIE pary, które
    da się policzyć) dla zacisku wskazanego przez scenę."""
    dostepnosc = dostepnosc_pakietu_nastaw(bieg_max)
    return next(
        wiersz
        for wiersz in dostepnosc["linie"]
        if wiersz["line_id"] == linia
        and wiersz["nastepne_szyny_wg_zacisku"][ZACISK_ZABEZPIECZENIA_SCENY_KOORD]
    )


def koordynacja_scena_nastawy() -> dict[str, Any]:
    """Odpowiedź `GET …/nastawy` (`zbuduj_odpowiedz_nastaw_json` — metoda
    Hoppela/IRiESD, TA SAMA funkcja, którą woła końcówka) dla chronionego
    odcinka S01→S02 i szyny SN Stacji S02 jako kolejnej strefy."""
    with _biegi_sceny_koordynacja() as (bieg_max, bieg_min, bieg_pf, _model, linia):
        pozycja = _pozycja_nastaw_sceny_koordynacja(bieg_max, linia)
        widok = zbuduj_odpowiedz_nastaw_json(
            bieg_max,
            line_id=pozycja["line_id"],
            next_bus_id=pozycja["nastepne_szyny_wg_zacisku"][ZACISK_ZABEZPIECZENIA_SCENY_KOORD][0],
            c_min=1.0,
            zacisk_zabezpieczenia=ZACISK_ZABEZPIECZENIA_SCENY_KOORD,
        )
        return _ustabilizuj_identyfikatory(
            canonicalize_json(widok), _mapa_identyfikatorow_koordynacji(bieg_max, bieg_min, bieg_pf)
        )


def koordynacja_scena_nastawy_dopasowanie() -> dict[str, Any]:
    """Odpowiedź `GET …/nastawy/dopasowanie` (`zbuduj_odpowiedz_dopasowania`) —
    TA SAMA fizyka nastaw zmapowana na wymaganie wobec aparatu i sprawdzona
    wobec REALNEGO rekordu katalogu analitycznego."""
    with _biegi_sceny_koordynacja() as (bieg_max, bieg_min, bieg_pf, _model, linia):
        pozycja = _pozycja_nastaw_sceny_koordynacja(bieg_max, linia)
        widok = zbuduj_odpowiedz_dopasowania(
            bieg_max,
            device_id=_APARAT_DOPASOWANIA_KOORD,
            line_id=pozycja["line_id"],
            next_bus_id=pozycja["nastepne_szyny_wg_zacisku"][ZACISK_ZABEZPIECZENIA_SCENY_KOORD][0],
            c_min=1.0,
            zacisk_zabezpieczenia=ZACISK_ZABEZPIECZENIA_SCENY_KOORD,
        )
        return _ustabilizuj_identyfikatory(
            canonicalize_json(widok), _mapa_identyfikatorow_koordynacji(bieg_max, bieg_min, bieg_pf)
        )


#: Zacisk zabezpieczeń odcinków magistrali w scenie E-28: początkowy (strona zasilania),
#: klikany przez spec zrzutów (`wszystkie-sceny-screenshot.spec.ts`).
ZACISK_ZABEZPIECZEN_SCENY_KOORD = "od"


def _lokalizacje_zabezpieczen_koordynacji(
    model: EnergyNetworkModel,
) -> list[tuple[str, str]]:
    """Lokalizacje dwóch zabezpieczeń sceny (decyzja O-51 pkt 7): odcinki magistrali
    zasilające szyny SN obu stacji (GPZ → S01, S01 → S02), każde przy zacisku
    POCZĄTKOWYM — przekaźnik w polu liniowym strony zasilania. Posortowane —
    kolejność deterministyczna, niezależna od kolejności budowy."""
    return sorted(
        (galaz.ref_id, ZACISK_ZABEZPIECZEN_SCENY_KOORD)
        for galaz in model.branches
        if galaz.type == "cable" and galaz.to_bus_ref.endswith("/sn_bus")
    )


def koordynacja_scena_miejsca() -> dict[str, Any]:
    """Odpowiedzi `GET /api/cases/{id}/enm/zacisk-lokalizacji` (`opis_miejsca_urzadzenia` —
    TA SAMA funkcja, którą woła końcówka) dla KAŻDEJ lokalizacji z listy wyboru ekranu
    (szyny, gałęzie, transformatory migawki) i każdego wskazania, które ekran może
    wysłać (brak; dla gałęzi i łączników także `od` i `do`). Klucz: `lokalizacja|zacisk`
    (pusty zacisk = brak wskazania). `urzadzenia_sceny` — lokalizacje i zaciski dwóch
    zabezpieczeń sceny (spec zrzutów wskazuje je natywnymi klikami)."""
    with _biegi_sceny_koordynacja() as (bieg_max, _bieg_min, _bieg_pf, model, _linia):
        migawka = bieg_max.snapshot
        refy = sorted(
            {b.ref_id for b in model.buses}
            | {g.ref_id for g in model.branches}
            | {t.ref_id for t in model.transformers}
        )
        rozstrzygniecia: dict[str, Any] = {}
        for ref in refy:
            wskazania: tuple[Zacisk | None, ...] = (
                (None,)
                if rodzaj_lokalizacji(migawka, ref) in ("szyna", "brak")
                else (None, *ZACISKI)
            )
            for wskazanie in wskazania:
                rozstrzygniecia[f"{ref}|{wskazanie or ''}"] = opis_miejsca_urzadzenia(
                    migawka, ref, wskazanie
                )
        return canonicalize_json(
            {
                "rozstrzygniecia": rozstrzygniecia,
                "urzadzenia_sceny": [
                    {"lokalizacja": lokalizacja, "zacisk": zacisk}
                    for lokalizacja, zacisk in _lokalizacje_zabezpieczen_koordynacji(model)
                ],
            }
        )


def koordynacja_scena_wynik() -> dict[str, Any]:
    """Pełny wynik analizy koordynacji (`POST /api/protection-coordination/
    projects/{id}/run` + `GET /{run_id}`) policzony REALNYM analizatorem
    (`OvercurrentCoordinationAnalyzer` przez końcówkę `run_coordination_
    analysis` — z kompletem jej bramek: autorytet wkładu zwarciowego, zgodność
    prądów żądania z prądami biegów, gotowość payloadu).

    IDENTYFIKATORY ZABEZPIECZEŃ. Ekran generuje je `crypto.randomUUID()` przy
    kliknięciu „Zastosuj szablon", więc fixtura NIE MOŻE ich znać. Fixtura
    używa `uuid5` z refu lokalizacji (deterministyczne), a atrapa harnessu
    podmienia je na identyfikatory z ŻĄDANIA, dopasowując po
    `location_element_id` — tożsamość, nie fizyka.

    ŻĄDANIE = TO, KTÓRE WYSYŁA EKRAN (decyzja O-51 pkt 7). Zabezpieczenia stoją
    na odcinkach magistrali przy wskazanym zacisku (`_lokalizacje_zabezpieczen_
    koordynacji`); prąd zwarciowy lokalizacji to prąd SZYNY zacisku
    (`szyny_zwarcia_lokalizacji` — ten sam resolver co końcówka i ekran), prąd
    roboczy to prąd TEGO zacisku z wiersza gałęzi rozpływu (`i_a` dla `od`,
    `i_do_a` dla `do` — `pradyZBiegow.ts::pradRoboczyZWiersza`). Do tej karty
    zabezpieczenia stały na SZYNACH, żądanie niosło prądy robocze wszystkich
    gałęzi z samego zacisku `od`, a analizator zwracał dla obu zabezpieczeń
    `ERROR` braku prądu roboczego — relacji „zabezpieczenie → chroniona gałąź"
    wtedy nie było."""
    with _biegi_sceny_koordynacja() as (bieg_max, bieg_min, bieg_pf, model, _linia):
        wejscie = wejscie_koordynacji_z_biegow(
            run_id_max=str(bieg_max.id), run_id_min=str(bieg_min.id)
        )
        galezie = {
            wiersz["element_id"]: wiersz
            for wiersz in build_branch_results_response(bieg_pf)["rows"]
        }
        miejsca = _lokalizacje_zabezpieczen_koordynacji(model)
        szyny, odmowy = szyny_zwarcia_lokalizacji(bieg_max.snapshot, list(miejsca))
        assert not odmowy, odmowy
        zadanie = RunCoordinationRequest(
            devices=[
                {
                    "id": str(
                        uuid5(NAMESPACE_URL, "mv-design-pro:harness:koordynacja:" + lokalizacja)
                    ),
                    "name": NAZWA_SZABLONU_ZABEZPIECZENIA_KOORD,
                    "device_type": "RELAY",
                    "location_element_id": lokalizacja,
                    "zacisk": zacisk,
                    "settings": _SZABLON_ZABEZPIECZENIA_KOORD,
                }
                for lokalizacja, zacisk in miejsca
            ],
            fault_currents=[
                {
                    "location_id": lokalizacja,
                    "ik_max_3f_a": wejscie.prady_max_a[szyny[lokalizacja]],
                    "ik_min_3f_a": wejscie.prady_min_a[szyny[lokalizacja]],
                }
                for lokalizacja, _zacisk in miejsca
            ],
            operating_currents=[
                {
                    "location_id": lokalizacja,
                    "i_operating_a": galezie[lokalizacja]["i_a" if zacisk == "od" else "i_do_a"],
                }
                for lokalizacja, zacisk in miejsca
            ],
            pf_run_id=str(bieg_pf.id),
            sc_run_id=str(bieg_max.id),
            sc_run_id_min=str(bieg_min.id),
        )
        # Zegar zamrożony na czas analizy: `ProtectionDevice.created_at`
        # (`domain/protection_device.py`, `default_factory` z `datetime.now(UTC)`)
        # i `CoordinationResult.created_at` (`…/coordination/models.py`) znakują
        # się przy KAŻDYM wywołaniu — bez tego dwa wywołania fixtury różniły się
        # znacznikami obu urządzeń (zmierzone bezpośrednio). Tu `default_factory`
        # jest LAMBDĄ czytającą nazwę `datetime` z przestrzeni modułu przy
        # wywołaniu, więc podmiana nazwy DZIAŁA (inaczej niż `Field(
        # default_factory=uuid4)` Pydantica — patrz `_fiksuj_niedeterminizm_
        # sceny_zwarcia`).
        with (
            patch("domain.protection_device.datetime", _ZegarStalyBiegu),
            patch(
                "application.analyses.protection.coordination.models.datetime",
                _ZegarStalyBiegu,
            ),
            patch(
                "application.analyses.protection.coordination.analyzer.datetime",
                _ZegarStalyBiegu,
            ),
        ):
            podsumowanie = run_coordination_analysis(_PROJEKT_SCENY_KOORDYNACJA, zadanie)
        widok = get_coordination_result(podsumowanie["run_id"])
        return _ustabilizuj_identyfikatory(
            canonicalize_json(widok),
            {
                **_mapa_identyfikatorow_koordynacji(bieg_max, bieg_min, bieg_pf),
                str(podsumowanie["run_id"]): RUN_ID_SCENY_KOORD_ANALIZA,
                str(widok["created_at"]): _CZAS_ANALIZY_KOORDYNACJI,
                str(_PROJEKT_SCENY_KOORDYNACJA): PROJEKT_SCENY_KOORDYNACJA_PL,
            },
        )


# ---------------------------------------------------------------------------
# Karta HARNESS-RESZTA-2 (2026-09-17) — scena „porownanie" (porównanie A/B
# rozpływu) i scena „oltc" (badania regulacji zaczepów). Do tej karty obie
# niosły kompletne odpowiedzi wpisane ręcznie: delty napięć/mocy/strat per szyna
# i gałąź, ranking problemów, proweniencja obu biegów, punkty przemiatania
# zaczepów — na sieci, której nie ma (refy `SZ-GPZ`, `SZ-ST7`, `L-14`, `TR-1`).
# ---------------------------------------------------------------------------

#: Projekt scen A/B — końcówki list biegów filtrują po projekcie, a porównanie
#: odmawia pary biegów z RÓŻNYCH projektów, więc oba biegi muszą go nieść.
_PROJEKT_SCENY_PORONWANIE = uuid5(NAMESPACE_URL, "mv-design-pro:harness:projekt-porownanie")
KLUCZ_TWIN_SCENY_PORONWANIE = f"proj:{_PROJEKT_SCENY_PORONWANIE}/case:{CASE_ID_HARNESSU}"

RUN_ID_SCENY_PORONWANIE_A = "run-lf-scena-porownanie-a"
RUN_ID_SCENY_PORONWANIE_B = "run-lf-scena-porownanie-b"
_UUID_SCENY_PORONWANIE_A = uuid5(
    NAMESPACE_URL, "mv-design-pro:harness:" + RUN_ID_SCENY_PORONWANIE_A
)
_UUID_SCENY_PORONWANIE_B = uuid5(
    NAMESPACE_URL, "mv-design-pro:harness:" + RUN_ID_SCENY_PORONWANIE_B
)

#: Wariant B sceny porównania: TEN SAM model z obciążeniem ×1,6. Mnożnik dobrany
#: tak, aby porównanie miało co pokazać (realne delty napięć i strat), a
#: jednocześnie szyna bilansowa GPZ została BEZ RÓŻNICY (u = 1,0 pu w obu
#: wariantach) — ekran ma filtr „tylko różnice", którego nie da się zademonstrować
#: bez wiersza bez różnicy. Zmierzone na wyniku, nie założone.
_MNOZNIK_OBCIAZENIA_WARIANTU_B = 1.6


@contextmanager
def _biegi_sceny_porownanie() -> Iterator[tuple[Any, Any]]:
    """Dwa biegi `PF` sceny „porownanie": wariant A (sieć złota bez zmian) i
    wariant B (ta sama sieć z obciążeniem ×1,6). Oba w TYM SAMYM projekcie —
    `PowerFlowComparisonService` odmawia pary z różnych projektów, a końcówka
    listy biegów filtruje po projekcie.

    Menedżer kontekstu z tego samego powodu, co kotwice koordynacji: usługa
    porównania czyta oba biegi Z REJESTRU po identyfikatorze."""
    reset_canonical_runs()
    reset_enm_store()
    try:
        enm_a = build_golden_enm()
        _fiksuj_niedeterminizm_sceny_zwarcia(enm_a)
        with _zamrozona_tozsamosc_biegu(_UUID_SCENY_PORONWANIE_A):
            set_enm(KLUCZ_TWIN_SCENY_PORONWANIE, enm_a)
            bieg_a = execute_run(
                create_run(
                    case_id=CASE_ID_HARNESSU,
                    klucz_twin=KLUCZ_TWIN_SCENY_PORONWANIE,
                    analysis_type="PF",
                    project_id=str(_PROJEKT_SCENY_PORONWANIE),
                ).id
            )
        enm_b = _zlota_siec_z_obciazeniem(_MNOZNIK_OBCIAZENIA_WARIANTU_B)
        _fiksuj_niedeterminizm_sceny_zwarcia(enm_b)
        with _zamrozona_tozsamosc_biegu(_UUID_SCENY_PORONWANIE_B):
            set_enm(KLUCZ_TWIN_SCENY_PORONWANIE, enm_b)
            bieg_b = execute_run(
                create_run(
                    case_id=CASE_ID_HARNESSU,
                    klucz_twin=KLUCZ_TWIN_SCENY_PORONWANIE,
                    analysis_type="PF",
                    project_id=str(_PROJEKT_SCENY_PORONWANIE),
                ).id
            )
        yield bieg_a, bieg_b
    finally:
        reset_canonical_runs()
        reset_enm_store()


def _mapa_identyfikatorow_porownania(bieg_a: Any, bieg_b: Any) -> dict[str, str]:
    mapa = {
        str(bieg_a.id): RUN_ID_SCENY_PORONWANIE_A,
        str(bieg_b.id): RUN_ID_SCENY_PORONWANIE_B,
        str(_PROJEKT_SCENY_PORONWANIE): "projekt-scena-porownanie",
    }
    for bieg in (bieg_a, bieg_b):
        for znacznik in (bieg.created_at, bieg.started_at, bieg.finished_at):
            if znacznik is not None:
                mapa[znacznik.isoformat()] = _CZAS_SCENY_WERDYKTU
    return mapa


def porownanie_scena_biegi_pf() -> dict[str, Any]:
    """Odpowiedź `GET /api/projects/{id}/power-flow-runs` — lista zakończonych
    przebiegów rozpływu projektu, z której ekran wybiera wariant A i B. Kształt
    złożony DOKŁADNIE tak jak końcówka `api/power_flow_runs.py::
    list_power_flow_runs` (te same pola, ten sam sort malejąco po `created_at`).

    Znaczniki czasu obu biegów są tu IDENTYCZNE (zegar kotwicy zamrożony), więc
    sort po `created_at` ich nie rozróżnia — kolejność ustala sort wtórny po
    identyfikatorze, żeby lista była deterministyczna."""
    with _biegi_sceny_porownanie() as (bieg_a, bieg_b):
        biegi = [
            {
                "id": str(bieg.id),
                "project_id": bieg.project_id,
                "study_case_id": bieg.case_id,
                "analysis_type": bieg.analysis_type,
                "status": bieg.status,
                "result_status": bieg.result_status,
                "created_at": bieg.created_at.isoformat(),
                "finished_at": bieg.finished_at.isoformat() if bieg.finished_at else None,
                "input_hash": bieg.input_hash,
                "snapshot_hash": bieg.snapshot_hash,
                "model_revision": (bieg.envelope or {}).get("model_revision"),
                "scenario_ref": (bieg.envelope or {}).get("scenario_ref"),
                "converged": ((bieg.raw_result or {}).get("result_v1") or {}).get("converged"),
                "iterations": ((bieg.raw_result or {}).get("result_v1") or {}).get(
                    "iterations_count"
                ),
            }
            for bieg in list_canonical_runs_for_project(
                str(_PROJEKT_SCENY_PORONWANIE), analysis_type="PF"
            )
        ]
        biegi.sort(key=lambda bieg: (bieg.get("created_at") or "", str(bieg["id"])), reverse=True)
        return _ustabilizuj_identyfikatory(
            canonicalize_json({"runs": biegi, "total": len(biegi)}),
            _mapa_identyfikatorow_porownania(bieg_a, bieg_b),
        )


def porownanie_scena_wynik_pf() -> dict[str, Any]:
    """Odpowiedź `POST /api/power-flow-comparisons` (`PowerFlowComparisonService
    .compare` — TA SAMA usługa, którą woła końcówka): delty per szyna i gałąź,
    ranking problemów, podsumowanie i proweniencja OBU biegów."""
    with _biegi_sceny_porownanie() as (bieg_a, bieg_b):
        with patch("domain.power_flow_comparison.datetime", _ZegarStalyBiegu):
            widok = (
                PowerFlowComparisonService(None).compare(str(bieg_a.id), str(bieg_b.id)).to_dict()
            )
        return _ustabilizuj_identyfikatory(
            canonicalize_json(widok), _mapa_identyfikatorow_porownania(bieg_a, bieg_b)
        )


def porownanie_scena_slad_pf() -> dict[str, Any]:
    """Odpowiedź `GET /api/power-flow-comparisons/{id}/trace` — ślad WHITE BOX
    porównania (dopasowanie szyn/gałęzi, progi rankingu)."""
    with _biegi_sceny_porownanie() as (bieg_a, bieg_b):
        # `created_at` wyniku i śladu porównania to `datetime.now(UTC)` w
        # `default_factory` dataclassy domenowej (`domain/power_flow_comparison.py`)
        # — lambda czyta nazwę modułu przy KAŻDYM wywołaniu, więc podmiana nazwy
        # działa (zmierzone: bez niej dwa wywołania fixtury różniły się tym jednym
        # polem).
        with patch("domain.power_flow_comparison.datetime", _ZegarStalyBiegu):
            usluga = PowerFlowComparisonService(None)
            widok = usluga.get_comparison_trace(
                usluga.compare(str(bieg_a.id), str(bieg_b.id)).to_dict()["comparison_id"]
            ).to_dict()
        return _ustabilizuj_identyfikatory(
            canonicalize_json(widok), _mapa_identyfikatorow_porownania(bieg_a, bieg_b)
        )


RUN_ID_SCENY_OLTC = "run-lf-scena-oltc"
_UUID_SCENY_OLTC = uuid5(NAMESPACE_URL, "mv-design-pro:harness:" + RUN_ID_SCENY_OLTC)


@contextmanager
def _bieg_sceny_oltc() -> Iterator[Any]:
    """Bieg `PF` sceny „oltc" z opcją badania PRZEMIATANIA ZACZEPÓW
    (`options={"oltc_study": "sweep"}` — DOKŁADNIE ten `solver_input`, który
    buduje ekran dla rodzaju domyślnego, `oltcBadaniaModel.ts::
    zbudujSolverInput`), na sieci sceny E-30 (jedyna z regulatorem OLTC —
    badanie bez regulatora nie ma czego przemiatać i zwraca `None`)."""
    reset_canonical_runs()
    reset_enm_store()
    try:
        enm = _enm_sceny_zbieznosc()
        with _zamrozona_tozsamosc_biegu(_UUID_SCENY_OLTC):
            set_enm(CASE_ID_HARNESSU, enm)
            bieg = execute_run(
                create_run(
                    case_id=CASE_ID_HARNESSU,
                    klucz_twin=CASE_ID_HARNESSU,
                    analysis_type="PF",
                    options={"oltc_study": "sweep"},
                ).id
            )
        yield bieg
    finally:
        reset_canonical_runs()
        reset_enm_store()


def oltc_scena_przebieg() -> dict[str, Any]:
    """Kontrakt przebiegu wykonawczego (`CanonicalRun.to_execution_dict` — TEN
    SAM kształt, który zwracają końcówki `POST /api/execution/study-cases/{id}/runs`
    i `POST /api/execution/runs/{id}/execute`)."""
    with _bieg_sceny_oltc() as bieg:
        return _ustabilizuj_identyfikatory(
            canonicalize_json(bieg.to_execution_dict()), {str(bieg.id): RUN_ID_SCENY_OLTC}
        )


def oltc_scena_wynik() -> dict[str, Any]:
    """Odpowiedź `GET /api/execution/runs/{id}/results`
    (`build_execution_result_set` — TA SAMA funkcja, którą woła końcówka):
    `global_results.oltc_sweep` z REALNEGO przemiatania zaczepów solvera
    (`network_model/solvers/power_flow_oltc_studies.py`) oraz `oltc_control`
    z pętli regulacji tego samego biegu."""
    with _bieg_sceny_oltc() as bieg:
        return _ustabilizuj_identyfikatory(
            canonicalize_json(build_execution_result_set(bieg)), {str(bieg.id): RUN_ID_SCENY_OLTC}
        )


# ---------------------------------------------------------------------------
# Karta HARNESS-RESZTA-2 (2026-09-17) — sceny „estymacja" (estymacja stanu WLS)
# i „odbior-zgodnosc" (zgodność powykonawcza). Obie liczą wynik z POMIARÓW, a
# pomiar jest DANĄ WEJŚCIOWĄ projektu (odczyt z rejestratora/protokołu odbioru),
# nie wynikiem solvera — dokładnie ten sam status, co parametry elektrod sceny
# arc flash albo prądy fazowe sceny stanu fazowego. Pomiary sceny są WYPROWADZONE
# Z WYNIKU biegu (wartość modelu + JAWNIE NAZWANA odchyłka), żeby scena pokazała
# komplet werdyktów, jakie ekran umie pokazać; wszystkie liczby ocen, rezyduów,
# χ² i odchyłek liczy backend.
# ---------------------------------------------------------------------------

RUN_ID_SCENY_POMIAROWEJ = "run-lf-scena-pomiary"
_UUID_SCENY_POMIAROWEJ = uuid5(NAMESPACE_URL, "mv-design-pro:harness:" + RUN_ID_SCENY_POMIAROWEJ)

#: Niepewności pomiarowe telemetrii sceny WLS [pu] — DANE WEJŚCIOWE estymatora
#: (klasa dokładności przetwornika), nie wynik. Wartości typowe dla telemetrii
#: SCADA średniego napięcia: moduł napięcia 0,4 %, moce 0,8 %.
_SIGMA_NAPIECIA_WLS = 0.004
_SIGMA_MOCY_WLS = 0.008

#: Odchyłka pomiaru napięcia JEDNEGO węzła sceny WLS [pu] — pomiar obarczony
#: błędem grubym (uszkodzony przetwornik). Bez niego scena nie pokazuje sekcji
#: detekcji złych danych (χ² i największe rezyduum znormalizowane), która jest
#: sednem tego ekranu. 0,02 pu = 5 σ przy σ = 0,004 pu (próg LNR = 3).
_BLAD_GRUBY_POMIARU_WLS = 0.02

#: Odchyłki pomiarów odbiorowych sceny zgodności powykonawczej [%] — protokół
#: odbioru zawsze różni się od modelu; te dwie wartości dobrane tak, by jedna
#: mieściła się w tolerancji napięciowej (5 %), a druga wychodziła poza
#: tolerancję mocy (10 %) — ekran pokazuje wtedy OBA werdykty.
_ODCHYLKA_W_TOLERANCJI_PCT = 1.0
_ODCHYLKA_POZA_TOLERANCJA_PCT = 12.5

#: Tolerancje odbioru sceny [%] — JAWNE (kontrakt zabrania domyślnych: brak
#: udokumentowanego źródła normatywnego, `zgodnosc_powykonawcza.py`).
_TOLERANCJA_NAPIECIA_PCT = 5.0
_TOLERANCJA_MOCY_PCT = 10.0


@contextmanager
def _bieg_sceny_pomiarowej() -> Iterator[Any]:
    """Bieg `PF` KOTWICY scen „estymacja"/„odbior-zgodnosc" — sieć złota bez
    zmian. Oba ekrany interpretują TEN SAM przebieg (spójność liczb między
    scenami), jak „rozplyw" i „walidacja" obok."""
    reset_canonical_runs()
    reset_enm_store()
    try:
        enm = build_golden_enm()
        _fiksuj_niedeterminizm_sceny_zwarcia(enm)
        with _zamrozona_tozsamosc_biegu(_UUID_SCENY_POMIAROWEJ):
            set_enm(CASE_ID_HARNESSU, enm)
            bieg = execute_run(
                create_run(
                    case_id=CASE_ID_HARNESSU, klucz_twin=CASE_ID_HARNESSU, analysis_type="PF"
                ).id
            )
        yield bieg
    finally:
        reset_canonical_runs()
        reset_enm_store()


def estymacja_scena_wymagania() -> dict[str, Any]:
    """Odpowiedź `GET /api/quality/state-estimation/requirements`
    (`build_state_estimation_requirements` — TA SAMA funkcja, którą woła
    końcówka): mapa węzeł→indeks, węzeł bilansowy, minimalna liczba pomiarów."""
    with _bieg_sceny_pomiarowej() as bieg:
        return _ustabilizuj_identyfikatory(
            canonicalize_json(build_state_estimation_requirements(bieg)),
            _mapa_identyfikatorow_sceny_pomiarowej(bieg),
        )


def _mapa_identyfikatorow_sceny_pomiarowej(bieg: Any) -> dict[str, str]:
    mapa = {str(bieg.id): RUN_ID_SCENY_POMIAROWEJ}
    for znacznik in (bieg.created_at, bieg.started_at, bieg.finished_at):
        if znacznik is not None:
            mapa[znacznik.isoformat()] = _CZAS_SCENY_WERDYKTU
    return mapa


def _pomiary_wls_sceny(bieg: Any) -> list[dict[str, Any]]:
    """Telemetria sceny WLS zbudowana z WYNIKU biegu: moduł napięcia każdego
    węzła oraz iniekcje P/Q węzłów nie-bilansowych. Węzeł o NAJMNIEJSZYM
    `bus_ref` (sort deterministyczny) dostaje pomiar napięcia obarczony błędem
    grubym — jedyna liczba sceny, która świadomie NIE jest odczytem modelu, i
    dlatego nazwana wprost (uszkodzony przetwornik, `_BLAD_GRUBY_POMIARU_WLS`).
    """
    wynik = get_power_flow_result(bieg)
    wezly = {wiersz["bus_id"]: wiersz for wiersz in wynik["bus_results"]}
    slack = build_state_estimation_requirements(bieg)["slack_bus_ref"]
    uszkodzony = sorted(wezly)[0]
    pomiary: list[dict[str, Any]] = []
    for bus_ref in sorted(wezly):
        wiersz = wezly[bus_ref]
        pomiary.append(
            {
                "meas_type": "V_MAGNITUDE",
                "bus_ref": bus_ref,
                "value": float(wiersz["v_pu"])
                + (_BLAD_GRUBY_POMIARU_WLS if bus_ref == uszkodzony else 0.0),
                "sigma": _SIGMA_NAPIECIA_WLS,
            }
        )
    for bus_ref in sorted(wezly):
        if bus_ref == slack:
            continue
        wiersz = wezly[bus_ref]
        for rodzaj, klucz in (("P_INJECTION", "p_injected_mw"), ("Q_INJECTION", "q_injected_mvar")):
            pomiary.append(
                {
                    "meas_type": rodzaj,
                    "bus_ref": bus_ref,
                    # Kontrakt estymatora: wartości w jednostkach względnych na
                    # bazie mocy Y-bus (`base_mva`), a wiersz rozpływu niesie MW
                    # i Mvar — przeliczenie jednostki, nie fizyka.
                    "value": float(wiersz[klucz]) / float(wynik["base_mva"]),
                    "sigma": _SIGMA_MOCY_WLS,
                }
            )
    return pomiary


def estymacja_scena_wynik() -> dict[str, Any]:
    """Odpowiedź `POST /api/quality/state-estimation` (`build_state_estimation_view`
    — TA SAMA funkcja, którą woła końcówka): estymowany stan, rezydua
    znormalizowane, test χ² i detekcja złych danych, ze śladem WHITE BOX
    iteracji (`include_trace=True`, jak ekran w trybie eksperckim)."""
    with _bieg_sceny_pomiarowej() as bieg:
        widok = build_state_estimation_view(bieg, _pomiary_wls_sceny(bieg), include_trace=True)
        return _ustabilizuj_identyfikatory(
            canonicalize_json(widok), _mapa_identyfikatorow_sceny_pomiarowej(bieg)
        )


def _pomiary_odbiorowe_sceny(bieg: Any) -> list[dict[str, Any]]:
    """Protokół odbioru sceny zgodności powykonawczej — po jednym pomiarze na
    każdy werdykt, jaki ekran umie pokazać:

    1. napięcie węzła W TOLERANCJI (odchyłka `_ODCHYLKA_W_TOLERANCJI_PCT`),
    2. moc czynna gałęzi POZA TOLERANCJĄ (`_ODCHYLKA_POZA_TOLERANCJA_PCT`),
    3. pomiar elementu, którego NIE MA w modelu (brak odpowiednika),
    4. moc bierna tej samej gałęzi BEZ wskazanego zacisku — odmowa nazwana „brak
       miejsca pomiaru" (decyzja O-51: gałąź z susceptancją ma na końcach inne
       P/Q, więc rekord bez zacisku nie jest porównywany z żadnym końcem),
    5. moc bierna gałęzi, której wynik rozpływu nie niesie (brak wyniku) —
       pozycja powstaje TYLKO wtedy, gdy sieć ma taką gałąź. Na sieci złotej
       KAŻDA gałąź niesie moc bierną (zmierzone), więc ten werdykt na tej
       scenie nie występuje; scena pokazuje cztery, bo tyle sieć uczciwie daje —
       dołożenie piątego wymagałoby pomiaru elementu wymyślonego.

    Wartości 1 i 2 pochodzą Z WYNIKU biegu powiększonego o nazwaną odchyłkę —
    protokół odbioru z definicji różni się od modelu, a bez różnicy ekran nie
    pokazałby ANI JEDNEGO werdyktu poza „w tolerancji". Pomiar mocy czynnej (2)
    jest wykonany na zacisku POCZĄTKOWYM (`od`) — wartość odniesienia to moc tego
    zacisku (`p_mw` wiersza gałęzi)."""
    # Dopasowanie pomiaru do modelu idzie po `element_id` wierszy widoków
    # szyn/gałęzi (= `ref_id` ENM) — TA SAMA przestrzeń nazw, której używa
    # `zgodnosc_powykonawcza._bus_upu_by_element`/`_branch_pq_by_element`.
    napiecia_wezlow = {
        str(szyna.get("ref_id")): szyna.get("voltage_kv")
        for szyna in (bieg.snapshot or {}).get("buses") or []
    }
    wezly = sorted(
        (
            wiersz
            for wiersz in build_bus_results_response(bieg)["rows"]
            if isinstance(wiersz.get("element_id"), str)
            and wiersz.get("u_pu") is not None
            and napiecia_wezlow.get(str(wiersz["element_id"])) is not None
        ),
        key=lambda wiersz: str(wiersz["element_id"]),
    )
    galezie = sorted(
        (
            wiersz
            for wiersz in build_branch_results_response(bieg)["rows"]
            if isinstance(wiersz.get("element_id"), str) and wiersz.get("p_mw") is not None
        ),
        key=lambda wiersz: str(wiersz["element_id"]),
    )
    wezel = wezly[0]
    # Gałąź o NAJWIĘKSZEJ mocy czynnej (tiebreak po refie) — na niej odchyłka
    # poza tolerancją jest czytelna, a wybór deterministyczny.
    galaz = max(galezie, key=lambda wiersz: (abs(float(wiersz["p_mw"])), str(wiersz["element_id"])))
    # Gałąź BEZ wyniku mocy biernej (jeśli sieć taką ma) — czwarty werdykt
    # ekranu („brak wyniku dla elementu"); gdy każda gałąź ma Q, pomiar
    # dotyczy gałęzi wyłącznikowej, której rozpływ nie liczy mocy.
    bez_q = next(
        (
            wiersz
            for wiersz in sorted(
                build_branch_results_response(bieg)["rows"],
                key=lambda wiersz: str(wiersz.get("element_id")),
            )
            if isinstance(wiersz.get("element_id"), str) and wiersz.get("q_mvar") is None
        ),
        None,
    )
    napiecie_modelu_kv = float(wezel["u_pu"]) * float(napiecia_wezlow[str(wezel["element_id"])])
    pomiary = [
        {
            "element_ref": str(wezel["element_id"]),
            "wielkosc": "U",
            "wartosc": napiecie_modelu_kv * (1.0 + _ODCHYLKA_W_TOLERANCJI_PCT / 100.0),
            "jednostka": "kV",
        },
        {
            "element_ref": str(galaz["element_id"]),
            "wielkosc": "P",
            "wartosc": float(galaz["p_mw"]) * (1.0 + _ODCHYLKA_POZA_TOLERANCJA_PCT / 100.0),
            "jednostka": "MW",
            "zacisk": "od",
        },
        {
            # Protokół podaje moc bierną gałęzi bez miejsca pomiaru — wartość z
            # zacisku początkowego jest tu wyłącznie daną wejściową rekordu; backend
            # jej NIE porównuje (brak zacisku = odmowa nazwana).
            "element_ref": str(galaz["element_id"]),
            "wielkosc": "Q",
            "wartosc": float(galaz["q_mvar"]),
            "jednostka": "Mvar",
        },
        {
            # Element z protokołu odbioru, którego w modelu NIE MA — pole
            # rezerwowe rozdzielni, którego projektant nie odwzorował.
            "element_ref": "POLE-REZERWOWE-12",
            "wielkosc": "U",
            "wartosc": 15.0,
            "jednostka": "kV",
        },
    ]
    if bez_q is not None:
        pomiary.append(
            {
                "element_ref": str(bez_q["element_id"]),
                "wielkosc": "Q",
                "wartosc": 1.2,
                "jednostka": "Mvar",
            }
        )
    return pomiary


def odbior_zgodnosc_scena_zaciski() -> dict[str, Any]:
    """Odpowiedź `GET /api/analysis-runs/{run_id}/zaciski-galezi` (`zaciski_galezi_migawki`
    — TA SAMA funkcja, którą woła końcówka) dla biegu sceny: etykiety zacisków z nazwami
    szyn, które formularz pokazuje przy wskazaniu miejsca pomiaru mocy gałęzi."""
    with _bieg_sceny_pomiarowej() as bieg:
        return _ustabilizuj_identyfikatory(
            canonicalize_json(
                {
                    "run_id": str(bieg.id),
                    "zaciski": zaciski_galezi_migawki(bieg.snapshot),
                }
            ),
            _mapa_identyfikatorow_sceny_pomiarowej(bieg),
        )


def odbior_zgodnosc_scena_wynik() -> dict[str, Any]:
    """Odpowiedź `POST /api/quality/as-built-compliance`
    (`build_zgodnosc_powykonawcza_view` — TA SAMA funkcja, którą woła końcówka):
    porównanie pomiar↔model ze śladem per wiersz (model → pomiar → odchyłka →
    tolerancja → werdykt) i jawnymi tolerancjami żądania."""
    with _bieg_sceny_pomiarowej() as bieg:
        widok = build_zgodnosc_powykonawcza_view(
            bieg,
            _pomiary_odbiorowe_sceny(bieg),
            {
                "napiecie_pct": _TOLERANCJA_NAPIECIA_PCT,
                "moc_pct": _TOLERANCJA_MOCY_PCT,
            },
        )
        return _ustabilizuj_identyfikatory(
            canonicalize_json(widok), _mapa_identyfikatorow_sceny_pomiarowej(bieg)
        )


# ---------------------------------------------------------------------------
# Karta HARNESS-RESZTA-2 (2026-09-17) — sceny „frt" (zdolność przetrwania zapadu
# napięcia) i „lom" (ochrona przed pracą wyspową). Obie miały wpisane ręcznie
# komplety punktów trajektorii, obwiedni profilu operatora i werdyktów.
# ---------------------------------------------------------------------------

#: Moduł DER sceny — REALNA karta katalogu przekształtników MV; operator —
#: REALNY profil NC RfG (`catalog/profiles/nc_rfg/`). Oba 1:1 z zasiewem sceny
#: (`useStationDerStore`: `device_catalog_ref`/`nc_rfg_profile_ref`).
_DER_SCENY_FRT = "conv-pv-1mw-15kv"
_OPERATOR_SCENY_FRT = "pse"
_RODZAJ_TESTU_SCENY_FRT = "lvrt"

#: Sekwencja zapadów sceny — PROGRAM BADANIA (głębokość [pu], czas [s]), dana
#: wejściowa testu odbiorowego, nie wynik: pierwszy zapad w granicach obwiedni
#: operatora, drugi głębszy i dłuższy (moduł się odłącza) — scena pokazuje OBA
#: werdykty sekwencji.
_SEKWENCJA_ZAPADOW_SCENY_FRT: tuple[tuple[float, float], ...] = ((0.05, 0.15), (0.02, 0.5))


def _konwerter_i_profil_sceny_frt() -> tuple[Any, Any]:
    konwerter = get_default_mv_catalog().get_converter_type(_DER_SCENY_FRT)
    if konwerter is None:
        raise SystemExit(
            f"[fixtury] karta przekształtnika sceny FRT nie istnieje: {_DER_SCENY_FRT}"
        )
    return konwerter, load_nc_rfg_profile(_OPERATOR_SCENY_FRT)


def frt_scena_trajektorie() -> dict[str, Any]:
    """Odpowiedź `GET /api/oze-analysis/frt-trajectories`
    (`build_frt_trajectories_view` — TA SAMA funkcja, którą woła końcówka):
    obwiednia profilu operatora, trajektorie scenariuszy i wywód marginesu."""
    konwerter, profil = _konwerter_i_profil_sceny_frt()
    return canonicalize_json(
        build_frt_trajectories_view(konwerter, profil, _RODZAJ_TESTU_SCENY_FRT)
    )


def frt_scena_sekwencja() -> dict[str, Any]:
    """Odpowiedź `GET /api/oze-analysis/frt-sequence` (`build_frt_sekwencja_view`)
    z kontekstem siły sieci — wiersz SCR z widoku D1 biegu kotwicy analiz OZE
    (`_bieg_sceny_oze_analiz`, TEN SAM bieg, który karmi scenę „siła-sieci")."""
    konwerter, profil = _konwerter_i_profil_sceny_frt()
    bieg = _bieg_sceny_oze_analiz()
    wiersze = build_grid_strength_view(bieg)["entries"]
    widok = build_frt_sekwencja_view(
        konwerter,
        profil,
        [tuple(zapad) for zapad in _SEKWENCJA_ZAPADOW_SCENY_FRT],  # type: ignore[misc]
        grid_strength_row=wiersze[0] if wiersze else None,
    )
    return _ustabilizuj_identyfikatory(
        canonicalize_json(widok), {str(bieg.id): RUN_ID_SCENY_OZE_ANALIZ}
    )


#: Dane odpływu nN sceny „odbior" (kreator odbioru) — moc przyłączeniowa,
#: współczynnik mocy i napięcie szyny: DANE WEJŚCIOWE formularza sceny, 1:1 z
#: tym, co kreator wysyła po wypełnieniu pól.
_MOC_ODBIORU_SCENY_KW = 50.0
_COS_PHI_ODBIORU_SCENY = 0.93
_NAPIECIE_ODPLYWU_SCENY_V = 400.0


def odbior_scena_prad_znamionowy() -> dict[str, Any]:
    """Odpowiedź `POST /api/solver/cable-rated-current-preview` — podgląd prądu
    odpływu liczony SOLVEREM (`compute_cable_rated_current`, I = S/(√3·U)), TĄ
    SAMĄ funkcją, którą woła końcówka. Poprzednio prąd i moc pozorna były w
    harnessie WPISANE (77,6 A / 53,8 kVA) razem z tekstem podstawienia."""
    wynik = compute_cable_rated_current(
        CableRatedCurrentInput(
            active_power_kw=_MOC_ODBIORU_SCENY_KW,
            cos_phi=_COS_PHI_ODBIORU_SCENY,
            line_voltage_v=_NAPIECIE_ODPLYWU_SCENY_V,
        )
    )
    return canonicalize_json(
        {
            "rated_current_a": wynik.rated_current_a,
            "apparent_power_kva": wynik.apparent_power_kva,
            "formula_ref": wynik.formula_ref,
            "assumptions": list(wynik.assumptions),
        }
    )


#: Transformator stacji sceny LoM — 2 MVA, bo pole wytwórcy tej sceny niesie
#: falownik 1,1 MVA: brama katalogowa `add_converter_source` odmawia przyłączenia
#: źródła o mocy większej niż transformator stacji (zmierzone).
_KATALOG_TRAFO_SCENY_LOM = "tr-sn-nn-15-04-2000kva-dyn11"

#: Przekaźnik pola wytwórcy sceny LoM — REALNA pozycja katalogu zabezpieczeń.
_KATALOG_PRZEKAZNIKA_SCENY_LOM = "EM_ETANGO_1250_V0"

#: NASTAWY funkcji ochrony od pracy wyspowej (LoM) pola wytwórcy — DANE
#: PROJEKTOWE sceny (to inżynier je wpisuje), nie wynik. Dobrane tak, żeby ekran
#: pokazał OBA stany, których dowodzi: 81R PONIŻEJ okna normatywnego (1,0 Hz/s
#: wobec wymaganych ≥ 2,0 Hz/s — ryzyko zbędnych wyłączeń, werdykt WARN z pełnym
#: wywodem) oraz 81U/81O DOKŁADNIE na krawędziach pasma 47,5–51,5 Hz (werdykt
#: spełniony). Ocena — w tym werdykt i wywód — pochodzi WYŁĄCZNIE z backendu.
_NASTAWY_LOM_SCENY: tuple[dict[str, Any], ...] = (
    {"function_type": "rocof_81R", "threshold_hz_s": 1.0, "time_delay_s": 0.2},
    {"function_type": "underfrequency_81U", "threshold_hz": 47.5, "time_delay_s": 0.5},
    {"function_type": "overfrequency_81O", "threshold_hz": 51.5, "time_delay_s": 0.5},
)


def _enm_sceny_lom() -> EnergyNetworkModel:
    """Model sceny „lom": GPZ 110/15 kV → magistrala → stacja SN/nN z trzema
    polami SN (aparat pola z katalogu) → farma PV 1 MW w polu wytwórcy, a na
    polu LINIA_OUT przekaźnik z nastawami funkcji LoM (operacja `add_relay`).

    Wszystko operacjami domenowymi — tą samą drogą, którą model buduje
    projektant. Scena „lom" istnieje po to, żeby pokazać OCENĘ nastaw wobec okien
    normatywnych; model bez przekaźnika dawałby wyłącznie uczciwe „pole bez
    żadnej funkcji LoM" (zmierzone) i ekran nie miałby czego tłumaczyć."""
    enm = EnergyNetworkModel(header=ENMHeader(name="Pole wytwórcy — scena LoM")).model_dump(
        mode="json"
    )
    enm = _operacja_domenowa_sceny(
        enm,
        "add_grid_source_sn",
        {
            "voltage_kv": 15.0,
            "source_name": "GPZ 110/15",
            "sk3_mva": 250.0,
            "rx_ratio": 0.1,
            "catalog_ref": _KATALOG_ZRODLA_KOORD,
            "hv_voltage_kv": 110.0,
            "transformer_sn_mva": 25.0,
        },
    )
    enm = _operacja_domenowa_sceny(
        enm,
        "continue_trunk_segment_sn",
        {
            "segment": {
                "rodzaj": "KABEL",
                "dlugosc_m": 600,
                "name": "Magistrala wytwórcy",
                "catalog_ref": _KATALOG_KABLA_KOORD,
            }
        },
    )
    segment = [
        galaz["ref_id"]
        for galaz in enm["branches"]
        if galaz.get("type") in ("cable", "line_overhead")
    ][-1]
    enm = _operacja_domenowa_sceny(
        enm,
        "insert_station_on_segment_sn",
        {
            "segment_id": segment,
            "field_apparatus_catalog_ref": _KATALOG_APARATU_KOORD,
            "insert_at": {"mode": "RATIO", "value": 0.5},
            "sn_fields": [
                {"field_role": "LINIA_IN"},
                {"field_role": "LINIA_OUT"},
                {"field_role": "TRANSFORMATOROWE"},
            ],
            "transformer": {"create": True, "transformer_catalog_ref": _KATALOG_TRAFO_SCENY_LOM},
            "nn_block": {"outgoing_feeders_nn_count": 1},
            "station": {
                "station_type": "B",
                "station_name": "Stacja wytwórcy",
                "sn_voltage_kv": 15.0,
                "nn_voltage_kv": 0.4,
            },
        },
    )
    stacja = next(s["ref_id"] for s in enm["substations"] if s["ref_id"].endswith("/station"))
    szyna_sn = next(b["ref_id"] for b in enm["buses"] if b["ref_id"].endswith("/sn_bus"))
    enm = _operacja_domenowa_sceny(
        enm,
        "add_converter_source",
        {
            "source_technology": "PV",
            "connection_variant": "block_transformer",
            "station_ref": stacja,
            "bus_nn_ref": szyna_sn,
            "source_name": "Farma PV 1 MW",
            "quantity": 1,
            "power_setpoint_mw": 1.0,
            "catalog_binding": _wiazanie_katalogowe("CONVERTER", _KATALOG_PV_SCENY_POLA),
        },
    )
    pole_wytworcy = next(
        spec["field_ref"]
        for stacja_modelu in enm["substations"]
        for spec in (stacja_modelu.get("meta") or {}).get("field_specs") or []
        if spec.get("bay_role") == "OUT"
        and spec.get("bus_ref") == szyna_sn
        and spec.get("equipment_refs")
    )
    enm = _operacja_domenowa_sceny(
        enm,
        "add_relay",
        {
            "field_ref": pole_wytworcy,
            "relay_type": "CZESTOTLIWOSCIOWY",
            "name": "Zabezpieczenie od pracy wyspowej pola wytwórcy",
            "catalog_binding": _wiazanie_katalogowe(
                "ZABEZPIECZENIE", _KATALOG_PRZEKAZNIKA_SCENY_LOM
            ),
            "settings": [dict(nastawa) for nastawa in _NASTAWY_LOM_SCENY],
        },
    )
    model = EnergyNetworkModel.model_validate(enm)
    _fiksuj_niedeterminizm_sceny_zwarcia(model)
    return model


def lom_scena_wynik() -> dict[str, Any]:
    """Odpowiedź `GET /api/oze-analysis/lom-protection` (`build_ochrona_lom_view`
    — TA SAMA funkcja, którą woła końcówka) na modelu pola wytwórcy: okna
    normatywne z cytowanych źródeł, ocena nastaw przekaźnika pola z wywodem i
    uczciwe ERROR/INFO dla pól bez funkcji LoM.

    HARNESS-RESZTA-2: wcześniej scena liczyła widok na sieci złotej, która NIE MA
    pól przyłączeniowych — widok wracał pusty („moduły bez pola"), więc ekran nie
    miał czego pokazać. Przy okazji naprawiony u źródła defekt klasy:
    `build_ochrona_lom_view` czytał pola WYŁĄCZNIE z legacy `bays`, a operacje
    domenowe zapisują je w `substations[].meta.field_specs` — analiza była ślepa
    na każdy model zbudowany dzisiejszymi operacjami."""
    return canonicalize_json(build_ochrona_lom_view(_enm_sceny_lom()))


# ---------------------------------------------------------------------------
# Karta HARNESS-RESZTA-2 (2026-09-17) — scena „akademickie" (analizy
# specjalistyczne V12.6). Wyniki solvera scena brała z fixtury testów
# jednostkowych (realne), ale KOPERTĘ biegu, ŚLAD WHITE BOX, pakiet dowodowy i
# raport generowała funkcja `sladDemoV126` W HARNESSIE — kroki, podstawienia i
# wyniki pośrednie pisane ręcznie, z ręcznym `run-akad-1` jako tożsamością biegu.
# ---------------------------------------------------------------------------

RUN_ID_SCENY_AKADEMICKIEJ = "run-v126-scena-akademickie"

#: Karta katalogowa przekształtnika materializowana na `gen_pv` sieci sceny —
#: REALNY rekord katalogu MV (moc znamionowa, napięcie, tryb regulacji, widmo
#: harmoniczne, jeśli karta je niesie). Materializacja karty na tabliczce
#: generatora jest DOKŁADNIE tym, co robi brama katalogowa aplikacji
#: (`set_der_catalog_bindings` → `Generator.materialized_params`); bez niej
#: `_ocena_karty_przeksztaltnika` melduje `generator.converter_card_missing`, a
#: rodzaje czytające przekształtniki (`ssci_impedance`,
#: `power_quality_harmonics`) odmawiają gotowości — zmierzone bezpośrednio.
#: Zero liczb wpisanych ręcznie: cała tabliczka pochodzi z rekordu katalogu.
_KARTA_PRZEKSZTALTNIKA_SCENY_V126 = "conv-pv-card-huawei-sun2000-215ktl"


def _enm_sceny_akademickiej() -> EnergyNetworkModel:
    """Sieć złota z kartą przekształtnika ZMATERIALIZOWANĄ na `gen_pv`."""
    enm = build_golden_enm()
    rekord = get_default_mv_catalog().get_converter_type(_KARTA_PRZEKSZTALTNIKA_SCENY_V126)
    if rekord is None:
        raise SystemExit(
            "[fixtury] karta przekształtnika sceny akademickiej nie istnieje: "
            f"{_KARTA_PRZEKSZTALTNIKA_SCENY_V126}"
        )
    for generator in enm.generators:
        if generator.ref_id == "gen_pv":
            generator.catalog_ref = _KARTA_PRZEKSZTALTNIKA_SCENY_V126
            generator.materialized_params = dict(rekord.to_dict())
    _fiksuj_niedeterminizm_sceny_zwarcia(enm)
    return enm


def _biegi_sceny_akademickiej() -> dict[str, Any]:
    """Komplet biegów V12.6 sceny — po jednym na rodzaj, który złota sieć
    UMIE policzyć z parametrami sceny (`PARAMETRY_SCENY_AKADEMICKIE`).

    Rodzaje, których sieć nie odblokuje, ORAZ rodzaje wycofane z powierzchni
    (`_wycofanie_v126`) NIE dostają biegu — scena pokazuje dla nich uczciwą
    odmowę gotowości (fixtura `gotowosc_v126_scena_akademickie`), a nie wynik
    policzony „na oko". Zmierzone bezpośrednio po materializacji karty
    przekształtnika: 11 rodzajów liczy się, 1 odmawia
    (`insulation_coordination` — sieć nie niesie danych koordynacji izolacji),
    2 są wycofane (`hosting_capacity`, `opf_loss_lcc`).

    Rodzaj `ssci_impedance` dostaje DODATKOWO werdykt stabilności
    (`get_v126_ssci_stability` — osobna końcówka, którą czyta ekran SSCI).

    Każdy bieg dostaje własny, deterministyczny `run_id` (`uuid5` z rodzaju) —
    tożsamość, nie fizyka."""
    reset_canonical_runs()
    reset_enm_store()
    komplet: dict[str, Any] = {}
    try:
        enm = _enm_sceny_akademickiej()
        set_enm(CASE_ID_HARNESSU, enm)
        for rodzaj in V126AnalysisType:
            if _wycofanie_v126(rodzaj) is not None:
                continue
            parametry = uzupelnij_parametry_z_modelu(
                enm, rodzaj, PARAMETRY_SCENY_AKADEMICKIE.get(rodzaj.value, {})
            )
            if not ocen_gotowosc_v126(enm, rodzaj, parametry).potwierdzona:
                continue
            model = _with_parameter_payloads(
                build_v126_input_from_enm(enm, parameters=parametry), parametry
            )
            stabilny = f"{RUN_ID_SCENY_AKADEMICKIEJ}-{rodzaj.value}"
            with _zamrozona_tozsamosc_biegu(
                uuid5(NAMESPACE_URL, "mv-design-pro:harness:" + stabilny)
            ):
                bieg = execute_run(
                    create_run(
                        case_id=CASE_ID_HARNESSU,
                        klucz_twin=CASE_ID_HARNESSU,
                        analysis_type=f"v126:{rodzaj.value}",
                        options={
                            "model": model.model_dump(mode="json"),
                            "pominiete_zrodla": [],
                        },
                    ).id
                )
            if bieg.status != "FINISHED" or bieg.raw_result is None:
                raise SystemExit(
                    f"[fixtury] bieg V12.6 sceny akademickiej nie powiódł się: "
                    f"{rodzaj.value} ({bieg.error_message})"
                )
            wynik = bieg.raw_result["result"]
            mapa = {str(bieg.id): stabilny}
            dodatkowe: dict[str, Any] = {}
            if rodzaj is V126AnalysisType.SSCI_IMPEDANCE:
                dodatkowe["stabilnosc"] = get_v126_ssci_stability(bieg.id)
            komplet[rodzaj.value] = _ustabilizuj_identyfikatory(
                canonicalize_json(
                    {
                        **dodatkowe,
                        "koperta": {
                            "run_id": str(bieg.id),
                            "case_id": CASE_ID_HARNESSU,
                            "analysis_type": rodzaj.value,
                            "status": "FINISHED",
                            "result_url": (
                                f"/api/analysis-runs/{bieg.id}/results/v126/{rodzaj.value}"
                            ),
                            "trace_url": (
                                f"/api/analysis-runs/{bieg.id}/results/v126/{rodzaj.value}/trace"
                            ),
                            "proof_url": (
                                f"/api/analysis-runs/{bieg.id}/results/v126/{rodzaj.value}/proof"
                            ),
                            "report_url": (
                                f"/api/analysis-runs/{bieg.id}/results/v126/{rodzaj.value}/report"
                            ),
                            "deterministic_hash": wynik["deterministic_hash"],
                        },
                        "wynik": get_v126_result(bieg.id, rodzaj),
                        "slad": get_v126_trace(bieg.id, rodzaj),
                        "dowod": get_v126_proof(bieg.id, rodzaj),
                        "raport": get_v126_report(bieg.id, rodzaj),
                    }
                ),
                mapa,
            )
        return komplet
    finally:
        reset_canonical_runs()
        reset_enm_store()


def akademickie_scena_biegi() -> dict[str, Any]:
    """`{typy, biegi}`: przestrzeń nazw katalogu rodzajów analiz
    (`GET /api/catalog/v126/analysis-types` — `get_v126_catalog`) oraz mapa
    `rodzaj analizy → {koperta, wynik, ślad, dowód, raport}` z REALNYCH biegów
    V12.6, złożona DOKŁADNIE tymi funkcjami, które wołają końcówki
    (`get_v126_result`/`get_v126_trace`/`get_v126_proof`/`get_v126_report`)."""
    return {
        "typy": canonicalize_json(get_v126_catalog("analysis-types")),
        "biegi": _biegi_sceny_akademickiej(),
    }


# ---------------------------------------------------------------------------
# Karta HARNESS-RESZTA-2 (2026-09-17) — MODEL STACJI DEMO wspólny dla scen
# kreatorów (pole SN, źródło OZE, transformator, kompensator, magistrala,
# odbiór nN, źródło zasilania, odgałęzienie, słup, ZK SN, przekaźnik, pomiar,
# pole nN, przypisanie katalogu, edycja parametrów).
#
# Do tej karty harness niósł ten model CZTERY RAZY, przepisany ręcznie
# (`bus-sn-demo` 15 kV / `bus-nn-demo` 0,4 kV, stacja `st-demo`) — cztery kopie
# tej samej sieci, każda mogąca się rozjechać, i żadna nie pochodząca z modelu,
# który aplikacja umie zbudować. Teraz jest JEDEN model zbudowany TYMI SAMYMI
# operacjami domenowymi, którymi buduje go projektant.
# ---------------------------------------------------------------------------

#: Nazwa stacji demo — etykieta widoczna w formularzach kreatorów (dana sceny).
NAZWA_STACJI_DEMO = "Rozdzielnia GPZ-01"


def stacja_demo_scena_migawka() -> dict[str, Any]:
    """Migawka modelu stacji demo (`useSnapshotStore` scen kreatorów): GPZ 15 kV
    → odcinek kablowy → stacja SN/nN z transformatorem i odpływem nN. Zbudowana
    operacjami `add_grid_source_sn` / `continue_trunk_segment_sn` /
    `insert_station_on_segment_sn` — DOKŁADNIE tymi, które wołają kreatory w
    aplikacji, więc referencje, nazwy i napięcia są takie, jakie projektant
    zobaczy na realnym projekcie (a nie `bus-sn-demo` z harnessu)."""
    enm = EnergyNetworkModel(header=ENMHeader(name="Projekt demonstracyjny")).model_dump(
        mode="json"
    )
    enm = _operacja_domenowa_sceny(
        enm,
        "add_grid_source_sn",
        {
            "voltage_kv": 15.0,
            "source_name": "GPZ 110/15",
            "sk3_mva": 250.0,
            "rx_ratio": 0.1,
            "catalog_ref": _KATALOG_ZRODLA_KOORD,
            "hv_voltage_kv": 110.0,
            "transformer_sn_mva": 25.0,
        },
    )
    enm = _operacja_domenowa_sceny(
        enm,
        "continue_trunk_segment_sn",
        {
            "segment": {
                "rodzaj": "KABEL",
                "dlugosc_m": 600,
                "name": "Magistrala demonstracyjna",
                "catalog_ref": _KATALOG_KABLA_KOORD,
            }
        },
    )
    segment = [
        galaz["ref_id"]
        for galaz in enm["branches"]
        if galaz.get("type") in ("cable", "line_overhead")
    ][-1]
    enm = _operacja_domenowa_sceny(
        enm,
        "insert_station_on_segment_sn",
        {
            "segment_id": segment,
            "field_apparatus_catalog_ref": _KATALOG_APARATU_KOORD,
            "insert_at": {"mode": "RATIO", "value": 0.5},
            "sn_fields": [
                {"field_role": "LINIA_IN"},
                {"field_role": "LINIA_OUT"},
                {"field_role": "TRANSFORMATOROWE"},
            ],
            "transformer": {"create": True, "transformer_catalog_ref": _KATALOG_TRAFO_KOORD},
            "nn_block": {"outgoing_feeders_nn_count": 1},
            "station": {
                "station_type": "B",
                "station_name": NAZWA_STACJI_DEMO,
                "sn_voltage_kv": 15.0,
                "nn_voltage_kv": 0.4,
            },
        },
    )
    model = EnergyNetworkModel.model_validate(enm)
    for transformator in model.transformers:
        if transformator.ulv_kv < 1.0 and transformator.lv_earthing_system is None:
            transformator.lv_earthing_system = "TN-C-S"
    _fiksuj_niedeterminizm_sceny_zwarcia(model)
    return canonicalize_json(model.model_dump(mode="json"))


# ---------------------------------------------------------------------------
# Karta HARNESS-RESZTA-2 (2026-09-17) — migawki modelu scen „kompensacja" i
# „pulpit". Obie sceny miały w harnessie przepisany ręcznie wycinek sieci
# (szyny z napięciami, źródło z Sk″, generatory i odbiory z mocami), mimo że
# opisywały sieć złotą, którą backend zna.
# ---------------------------------------------------------------------------

#: Moc przyłączeniowa z warunków przyłączenia OSD sceny „pulpit" [MW] — DANA
#: WEJŚCIOWA projektu (nagłówek ENM `connection_conditions`, zapisywana przez
#: kreator warunków przyłączenia), nie wynik. Dobrana PONIŻEJ realnej sumy mocy
#: generatorów sieci złotej (2,4 MW — zmierzone), żeby kafel „Warunki
#: przyłączenia" pokazał werdykt PRZEKROCZENIA policzony z modelu, a nie stan
#: „wszystko w limicie", którego nie widać.
_MOC_PRZYLACZENIOWA_SCENY_PULPIT_MW = 2.0
_COS_PHI_WYMAGANY_SCENY_PULPIT = 0.95
_TRYB_PRACY_SCENY_PULPIT = "praca równoległa z siecią"


RUN_ID_SCENY_PULPIT = "run-lf-scena-pulpit"
_UUID_SCENY_PULPIT = uuid5(NAMESPACE_URL, "mv-design-pro:harness:" + RUN_ID_SCENY_PULPIT)


def _enm_sceny_pulpit() -> EnergyNetworkModel:
    """Sieć złota Z WARUNKAMI PRZYŁĄCZENIA w nagłówku — model sceny „pulpit".
    Warunki są DANĄ WEJŚCIOWĄ projektu (operacja `set_connection_conditions`);
    wszystkie liczby sieci pochodzą z modelu."""
    enm = build_golden_enm()
    enm.header.connection_conditions = ConnectionConditions(
        moc_przylaczeniowa_mw=_MOC_PRZYLACZENIOWA_SCENY_PULPIT_MW,
        wymagany_cos_phi=_COS_PHI_WYMAGANY_SCENY_PULPIT,
        tryb_pracy=_TRYB_PRACY_SCENY_PULPIT,
    )
    _fiksuj_niedeterminizm_sceny_zwarcia(enm)
    return enm


def _bieg_sceny_pulpit() -> Any:
    """Bieg `PF` sceny „pulpit" — kafel „Ostatni przebieg" pokazuje REALNY
    przebieg policzony na modelu TEJ SCENY (nie wymyślony wpis rejestru)."""
    reset_canonical_runs()
    reset_enm_store()
    try:
        enm = _enm_sceny_pulpit()
        with _zamrozona_tozsamosc_biegu(_UUID_SCENY_PULPIT):
            set_enm(CASE_ID_HARNESSU, enm)
            run = execute_run(
                create_run(
                    case_id=CASE_ID_HARNESSU, klucz_twin=CASE_ID_HARNESSU, analysis_type="PF"
                ).id
            )
        return run
    finally:
        reset_canonical_runs()
        reset_enm_store()


def siec_zlota_scena_migawka() -> dict[str, Any]:
    """Migawka ZATWIERDZONA biegu sieci złotej (`run.snapshot` złożony tak jak
    końcówka `/snapshot`) — zasiew `useSnapshotStore` scen, które interpretują
    wyniki policzone na TYM biegu („kompensacja", „dokumentacja"). Nazwy,
    napięcia i odcisk modelu pochodzą z biegu, nie z listy przepisanej w
    harnessie."""
    run = _bieg_sceny_kompensacja()
    return canonicalize_json(_catalog_completed_snapshot(run.snapshot))


def przebieg_pf_sceny_zlotej() -> dict[str, Any]:
    """Wpis rejestru przebiegów (`CanonicalRun.to_execution_dict` — kształt
    `ExecutionRun` czytany przez `useExecutionRunsStore`) dla biegu PF sieci
    złotej: TEN SAM bieg, z którego pochodzi `siec_zlota_scena_migawka`."""
    run = _bieg_sceny_kompensacja()
    return _ustabilizuj_identyfikatory(
        run.to_execution_dict(), {str(run.id): RUN_ID_SCENY_KOMPENSACJA}
    )


def pulpit_scena_migawka() -> dict[str, Any]:
    """Migawka ZATWIERDZONA biegu sceny „pulpit" — sieć złota z warunkami
    przyłączenia w nagłówku. Kafel „Warunki przyłączenia" liczy werdykt
    przekroczenia z TEGO modelu (suma mocy znamionowej generatorów wobec mocy
    przyłączeniowej), a nie z liczb wpisanych w harnessie."""
    run = _bieg_sceny_pulpit()
    return canonicalize_json(_catalog_completed_snapshot(run.snapshot))


def pulpit_scena_przebieg() -> dict[str, Any]:
    """Wpis rejestru przebiegów sceny „pulpit" (`to_execution_dict`) — kafel
    „Ostatni przebieg" i atrapa listy przebiegów czytają JEDEN byt."""
    run = _bieg_sceny_pulpit()
    return _ustabilizuj_identyfikatory(run.to_execution_dict(), {str(run.id): RUN_ID_SCENY_PULPIT})


# ---------------------------------------------------------------------------
# Karta HARNESS-RESZTA-2 (2026-09-17) — scena „diagnoza" (D7). Trzy trasy
# diagnostyki miały w harnessie fikstury z testów FRONTU (kształt pilnowany
# kontraktem, ale liczby pisane ręcznie) i wymyślony identyfikator biegu.
# Teraz: REALNY raport silnika diagnostycznego na sieci złotej (blokada SC 1F
# z powodu braku danych Z0 — zmierzona, nie wpisana) oraz REALNY bieg PF
# PRZERWANY limitem iteracji (`max_iterations: 1` na sieci ×8), czyli dokładnie
# ten stan, który ekran ma tłumaczyć inżynierowi.
# ---------------------------------------------------------------------------

RUN_ID_SCENY_DIAGNOZA = "run-lf-scena-diagnoza"
_UUID_SCENY_DIAGNOZA = uuid5(NAMESPACE_URL, "mv-design-pro:harness:" + RUN_ID_SCENY_DIAGNOZA)

#: Limit iteracji biegu sceny „diagnoza" — DANA WEJŚCIOWA biegu (opcja solvera),
#: nie wynik. Jeden krok Newtona-Raphsona na sieci ×8 kończy się przerwaniem
#: `max_iter` (zmierzone: `PRZ-NIEZBIEZNY-LIMIT`), więc ekran diagnozy pokazuje
#: realną historię iteracji i realną przyczynę zamiast opisu z palca.
_LIMIT_ITERACJI_SCENY_DIAGNOZA = 1


def _raport_diagnostyczny_sceny_diagnoza() -> Any:
    """Raport silnika diagnostycznego (`DiagnosticEngine.run`) sieci złotej —
    TA SAMA funkcja, którą wołają końcówki `/api/cases/{id}/diagnostics`
    i `.../diagnostics/preflight`."""
    enm = build_golden_enm()
    _fiksuj_niedeterminizm_sceny_zwarcia(enm)
    return DiagnosticEngine().run(map_enm_to_network_graph(enm))


def diagnoza_scena_diagnostyka() -> dict[str, Any]:
    """Odpowiedź `GET /api/cases/{id}/diagnostics` — problemy modelu i macierz
    dostępności analiz (sieć złota: SC 1F BLOKADA `E-D06`, bo dwie gałęzie nie
    niosą danych Z0 — realny brak modelu, nie scenariusz z palca)."""
    return canonicalize_json(_raport_diagnostyczny_sceny_diagnoza().to_dict())


def diagnoza_scena_preflight() -> dict[str, Any]:
    """Odpowiedź `GET /api/cases/{id}/diagnostics/preflight`
    (`build_preflight_from_diagnostic_report` — TA SAMA funkcja co końcówka)
    na TYM SAMYM raporcie co `diagnoza_scena_diagnostyka`."""
    preflight = build_preflight_from_diagnostic_report(_raport_diagnostyczny_sceny_diagnoza())
    return canonicalize_json(preflight.to_dict())


def _bieg_sceny_diagnoza() -> Any:
    """Bieg `PF` sceny „diagnoza" — sieć złota ×8 z limitem jednej iteracji:
    REALNE przerwanie `max_iter` (kod `PRZ-NIEZBIEZNY-LIMIT`)."""
    reset_canonical_runs()
    reset_enm_store()
    try:
        enm = _zlota_siec_z_obciazeniem(8.0)
        _fiksuj_niedeterminizm_sceny_zwarcia(enm)
        with _zamrozona_tozsamosc_biegu(_UUID_SCENY_DIAGNOZA):
            set_enm(CASE_ID_HARNESSU, enm)
            run = execute_run(
                create_run(
                    case_id=CASE_ID_HARNESSU,
                    klucz_twin=CASE_ID_HARNESSU,
                    analysis_type="PF",
                    options={"max_iterations": _LIMIT_ITERACJI_SCENY_DIAGNOZA},
                ).id
            )
        return run
    finally:
        reset_canonical_runs()
        reset_enm_store()


def diagnoza_scena_przebieg() -> dict[str, Any]:
    """Odpowiedź `GET /api/execution/runs/{id}/diagnostics`
    (`zbuduj_diagnoze_przebiegu` — TA SAMA funkcja co końcówka) dla biegu
    PRZERWANEGO limitem iteracji."""
    run = _bieg_sceny_diagnoza()
    widok = zbuduj_diagnoze_przebiegu(run)
    return _ustabilizuj_identyfikatory(widok, {str(run.id): RUN_ID_SCENY_DIAGNOZA})


def diagnoza_scena_bieg() -> dict[str, Any]:
    """Wpis rejestru przebiegów (`to_execution_dict`) TEGO SAMEGO biegu, który
    opisuje `diagnoza_scena_przebieg` — zasiew `useExecutionRunsStore` sceny."""
    run = _bieg_sceny_diagnoza()
    return _ustabilizuj_identyfikatory(
        run.to_execution_dict(), {str(run.id): RUN_ID_SCENY_DIAGNOZA}
    )


# ---------------------------------------------------------------------------
# Karta HARNESS-RESZTA-2 (2026-09-17) — scena „porownanie", tryb ZABEZPIECZENIA.
# Lista biegów, wynik porównania A/B i ślad White Box były w harnessie wpisane
# ręcznie: identyfikatory biegów (`run-zab-a`/`run-zab-b`), wiersze z prądami
# i czasami zadziałania, ranking problemów i proweniencja obu biegów. Teraz
# wszystko pochodzi z REALNEGO toru: dwa biegi `protection_sn` (ocena IEC 60255
# wobec prądu zwarciowego biegu źródłowego) policzone na DWÓCH wariantach tej
# samej sieci i porównane serwisem `ProtectionComparisonService`.
#
# DLACZEGO WARIANT B TO DŁUŻSZY ODCINEK: bieg zabezpieczeń czyta konfigurację
# nastaw przypadku Z BAZY, więc scena zakłada bazę w pamięci (SQLite) z dwoma
# przypadkami tego samego projektu. Różnica między wariantami jest MODELOWA
# (dłuższa magistrala → większa impedancja → mniejszy prąd zwarciowy → inny
# czas zadziałania), a nie „inne liczby w atrapie" — dokładnie ta sama recepta,
# którą sprawdza e2e na żywym backendzie (`porownanie-zwarc-delty.spec.ts`).
# ---------------------------------------------------------------------------

_PROJEKT_SCENY_ZABEZPIECZEN = uuid5(NAMESPACE_URL, "mv-design-pro:harness:projekt-zabezpieczenia")
_PRZYPADEK_SCENY_ZAB_A = uuid5(NAMESPACE_URL, "mv-design-pro:harness:przypadek-zab-a")
_PRZYPADEK_SCENY_ZAB_B = uuid5(NAMESPACE_URL, "mv-design-pro:harness:przypadek-zab-b")

RUN_ID_SCENY_ZAB_SC_A = "run-sc-scena-zabezpieczenia-a"
RUN_ID_SCENY_ZAB_SC_B = "run-sc-scena-zabezpieczenia-b"
RUN_ID_SCENY_ZAB_A = "run-zab-scena-a"
RUN_ID_SCENY_ZAB_B = "run-zab-scena-b"
_UUID_SCENY_ZAB_SC_A = uuid5(NAMESPACE_URL, "mv-design-pro:harness:" + RUN_ID_SCENY_ZAB_SC_A)
_UUID_SCENY_ZAB_SC_B = uuid5(NAMESPACE_URL, "mv-design-pro:harness:" + RUN_ID_SCENY_ZAB_SC_B)
_UUID_SCENY_ZAB_A = uuid5(NAMESPACE_URL, "mv-design-pro:harness:" + RUN_ID_SCENY_ZAB_A)
_UUID_SCENY_ZAB_B = uuid5(NAMESPACE_URL, "mv-design-pro:harness:" + RUN_ID_SCENY_ZAB_B)

#: Szablon nastaw przypadku — REALNA pozycja katalogu zabezpieczeń
#: (`get_protection_setting_template`), ta sama dla obu wariantów: porównanie
#: ma pokazać skutek zmiany MODELU, nie zmiany szablonu.
_SZABLON_NASTAW_SCENY_ZAB = "template_ref_oc_100"

#: Długość magistrali w wariancie B [km] — DANA WEJŚCIOWA wariantu (operacja
#: `update_element_parameters`). Dłuższy odcinek to większa impedancja pętli,
#: więc mniejszy prąd zwarciowy i dłuższy czas zadziałania: różnica, którą
#: porównanie A/B ma pokazać, jest skutkiem FIZYKI, nie innej atrapy.
_DLUGOSC_MAGISTRALI_WARIANTU_B_KM = 1.5

_CZAS_PRZYPADKU_SCENY_ZAB = datetime(2026, 9, 16, 8, 0, 0, tzinfo=UTC)


def _baza_w_pamieci_sceny_zabezpieczen() -> Any:
    """Fabryka `UnitOfWork` na bazie W PAMIĘCI z dwoma przypadkami projektu,
    każdy z konfiguracją nastaw wskazującą REALNY szablon katalogu. Bieg
    zabezpieczeń czyta tę konfigurację z bazy (`_execute_protection`), więc bez
    niej scena nie ma z czego policzyć oceny — atrapa wyniku byłaby fabrykacją."""
    silnik = create_engine_from_url("sqlite+pysqlite:///:memory:")
    init_db(silnik)
    uow_factory = build_uow_factory(create_session_factory(silnik))
    konfiguracja = ProtectionConfig(
        template_ref=_SZABLON_NASTAW_SCENY_ZAB,
        template_fingerprint=f"{_SZABLON_NASTAW_SCENY_ZAB}@1",
        bound_at=_CZAS_PRZYPADKU_SCENY_ZAB,
    )
    for przypadek, nazwa in (
        (_PRZYPADEK_SCENY_ZAB_A, "Stan normalny"),
        (_PRZYPADEK_SCENY_ZAB_B, "Magistrala wydłużona"),
    ):
        with uow_factory() as uow:
            uow.cases.add_study_case(
                StudyCase(
                    id=przypadek,
                    project_id=_PROJEKT_SCENY_ZABEZPIECZEN,
                    name=nazwa,
                    description="",
                    protection_config=konfiguracja,
                    created_at=_CZAS_PRZYPADKU_SCENY_ZAB,
                    updated_at=_CZAS_PRZYPADKU_SCENY_ZAB,
                )
            )
    return uow_factory


def _enm_wariantu_b_sceny_zabezpieczen(enm: EnergyNetworkModel) -> EnergyNetworkModel:
    """Wariant B: magistrala GPZ wydłużona operacją `update_element_parameters`
    (ta sama, którą woła projektant), więc różnica wariantów jest zapisana w
    MODELU i policzona przez solver."""
    dane = enm.model_dump(mode="json")
    magistrala = next(
        galaz["ref_id"]
        for galaz in dane["branches"]
        if galaz.get("type") in ("cable", "line_overhead")
    )
    dane = _operacja_domenowa_sceny(
        dane,
        "update_element_parameters",
        {
            "element_ref": magistrala,
            "parameters": {
                "length_km": _DLUGOSC_MAGISTRALI_WARIANTU_B_KM,
                "parameter_source": "CATALOG",
            },
        },
    )
    model = EnergyNetworkModel.model_validate(dane)
    _fiksuj_niedeterminizm_sceny_zwarcia(model)
    return model


@contextmanager
def _biegi_sceny_zabezpieczen() -> Iterator[tuple[Any, Any, Any]]:
    """Dwa biegi `protection_sn` (warianty A i B) w JEDNYM rejestrze — wołający
    dostaje `(bieg A, bieg B, fabryka UnitOfWork)`. Rejestr żyje do końca bloku,
    bo serwis porównania czyta biegi po identyfikatorze."""
    reset_canonical_runs()
    reset_enm_store()
    try:
        uow_factory = _baza_w_pamieci_sceny_zabezpieczen()
        enm_a, _odcinek, _szyna = _enm_sceny_koordynacja()
        enm_b = _enm_wariantu_b_sceny_zabezpieczen(enm_a)

        with _zamrozona_tozsamosc_biegu(_UUID_SCENY_ZAB_SC_A):
            set_enm(str(_PRZYPADEK_SCENY_ZAB_A), enm_a)
            sc_a = execute_run(
                create_run(
                    case_id=str(_PRZYPADEK_SCENY_ZAB_A),
                    klucz_twin=str(_PRZYPADEK_SCENY_ZAB_A),
                    analysis_type="short_circuit_sn",
                    project_id=str(_PROJEKT_SCENY_ZABEZPIECZEN),
                ).id
            )
        with _zamrozona_tozsamosc_biegu(_UUID_SCENY_ZAB_A):
            bieg_a = execute_run(
                create_run(
                    case_id=str(_PRZYPADEK_SCENY_ZAB_A),
                    klucz_twin=str(_PRZYPADEK_SCENY_ZAB_A),
                    analysis_type="protection_sn",
                    project_id=str(_PROJEKT_SCENY_ZABEZPIECZEN),
                    options={"sc_run_id": str(sc_a.id)},
                ).id,
                uow_factory=uow_factory,
            )

        with _zamrozona_tozsamosc_biegu(_UUID_SCENY_ZAB_SC_B):
            set_enm(str(_PRZYPADEK_SCENY_ZAB_B), enm_b)
            sc_b = execute_run(
                create_run(
                    case_id=str(_PRZYPADEK_SCENY_ZAB_B),
                    klucz_twin=str(_PRZYPADEK_SCENY_ZAB_B),
                    analysis_type="short_circuit_sn",
                    project_id=str(_PROJEKT_SCENY_ZABEZPIECZEN),
                ).id
            )
        with _zamrozona_tozsamosc_biegu(_UUID_SCENY_ZAB_B):
            bieg_b = execute_run(
                create_run(
                    case_id=str(_PRZYPADEK_SCENY_ZAB_B),
                    klucz_twin=str(_PRZYPADEK_SCENY_ZAB_B),
                    analysis_type="protection_sn",
                    project_id=str(_PROJEKT_SCENY_ZABEZPIECZEN),
                    options={"sc_run_id": str(sc_b.id)},
                ).id,
                uow_factory=uow_factory,
            )
        yield bieg_a, bieg_b, uow_factory
    finally:
        reset_canonical_runs()
        reset_enm_store()


def _mapa_identyfikatorow_sceny_zabezpieczen(bieg_a: Any, bieg_b: Any) -> dict[str, str]:
    """Stabilne etykiety obu biegów zabezpieczeń i obu biegów źródłowych."""
    return {
        str(bieg_a.id): RUN_ID_SCENY_ZAB_A,
        str(bieg_b.id): RUN_ID_SCENY_ZAB_B,
        str(bieg_a.options["sc_run_id"]): RUN_ID_SCENY_ZAB_SC_A,
        str(bieg_b.options["sc_run_id"]): RUN_ID_SCENY_ZAB_SC_B,
        str(_PRZYPADEK_SCENY_ZAB_A): "case-zab-a",
        str(_PRZYPADEK_SCENY_ZAB_B): "case-zab-b",
        str(_PROJEKT_SCENY_ZABEZPIECZEN): "proj-zab",
    }


def porownanie_scena_biegi_zabezpieczen() -> dict[str, Any]:
    """Odpowiedź `GET /api/projects/{id}/protection-runs` (`list_protection_runs`
    — TA SAMA funkcja, którą woła końcówka): lista zakończonych biegów
    zabezpieczeń projektu do wyboru pary A/B."""
    with _biegi_sceny_zabezpieczen() as (bieg_a, bieg_b, _uow):
        # `run_status=None` JAWNIE: parametr końcówki ma domyślną wartość
        # `Query(default=None)`, więc wywołanie bez niego przekazałoby obiekt
        # `Query` (nie `None`) i filtr statusu odrzuciłby WSZYSTKIE biegi —
        # zmierzone: lista wracała pusta.
        widok = list_protection_runs(_PROJEKT_SCENY_ZABEZPIECZEN, run_status=None)
        return _ustabilizuj_identyfikatory(
            widok, _mapa_identyfikatorow_sceny_zabezpieczen(bieg_a, bieg_b)
        )


def porownanie_scena_wynik_zabezpieczen() -> dict[str, Any]:
    """Odpowiedź `POST /api/protection-comparisons` (`ProtectionComparisonService
    .compare` — TA SAMA droga co końcówka): wiersze per (element chroniony,
    punkt zwarcia), ranking problemów, podsumowanie i proweniencja OBU biegów."""
    with _biegi_sceny_zabezpieczen() as (bieg_a, bieg_b, uow_factory):
        # Znacznik czasu porównania powstaje przy składaniu wyniku
        # (`domain/protection_comparison.py`) — zamrożony jak w porównaniu
        # rozpływu obok, inaczej fixtura zmienia się przy każdym eksporcie.
        with patch("domain.protection_comparison.datetime", _ZegarStalyBiegu):
            wynik = ProtectionComparisonService(uow_factory).compare(str(bieg_a.id), str(bieg_b.id))
        return _ustabilizuj_identyfikatory(
            wynik.to_dict(), _mapa_identyfikatorow_sceny_zabezpieczen(bieg_a, bieg_b)
        )


def porownanie_scena_slad_zabezpieczen() -> dict[str, Any]:
    """Odpowiedź `GET /api/protection-comparisons/{id}/trace` — ślad White Box
    porównania (kroki dopasowania, liczenia różnic i rankingu z progami)."""
    with _biegi_sceny_zabezpieczen() as (bieg_a, bieg_b, uow_factory):
        serwis = ProtectionComparisonService(uow_factory)
        with patch("domain.protection_comparison.datetime", _ZegarStalyBiegu):
            slad = serwis.get_comparison_trace(f"{bieg_a.id}::{bieg_b.id}")
        return _ustabilizuj_identyfikatory(
            slad.to_dict(), _mapa_identyfikatorow_sceny_zabezpieczen(bieg_a, bieg_b)
        )


#: Nazwa pliku → funkcja licząca odpowiedź (kolejność = kolejność eksportu).
FIXTURY: dict[str, Any] = {
    "ncrfg_zgodnosc_przekrojowa_scena_macierz": zgodnosc_przekrojowa_sceny_macierz,
    "macierz_scena_migawka": macierz_scena_migawka,
    "oze_scena_migawka": oze_scena_migawka,
    "wiazania_scena_przekladniki": wiazania_scena_przekladniki,
    "wiazania_scena_funkcje_zabezpieczen": wiazania_scena_funkcje_zabezpieczen,
    "werdykt_projektowy_scena_uwaga": werdykt_projektowy_sceny_uwaga,
    "katalog_analiz_v126": katalog_analiz_v126,
    "gotowosc_v126_scena_akademickie": gotowosc_v126_scena_akademickie,
    "gotowosc_v126_scena_akademickie_parametry": gotowosc_v126_scena_akademickie_parametry,
    "werdykt_projektowy_scena_ocena": werdykt_projektowy_scena_ocena,
    "werdykt_projektowy_scena_ocena_przekroczenia": werdykt_projektowy_scena_ocena_przekroczenia,
    "zwarcia_wyniki_scena_zwarcia": zwarcia_wyniki_scena_zwarcia,
    "zwarcia_wklady_scena_zwarcia": zwarcia_wklady_scena_zwarcia,
    "zwarcia_rozplyw_scena_zwarcia": zwarcia_rozplyw_scena_zwarcia,
    "zwarcia_pasmo_scena_zwarcia": zwarcia_pasmo_scena_zwarcia,
    "falowniki_rozplyw_scena_gpz_feeder_wynik": falowniki_rozplyw_scena_gpz_feeder_wynik,
    "stan_fazowy_scena_wyniki": stan_fazowy_scena_wyniki,
    "stabilnosc_scena_wyniki": stabilnosc_scena_wyniki,
    "stabilnosc_scena_slad": stabilnosc_scena_slad,
    "sila_sieci_scena_wynik": sila_sieci_scena_wynik,
    "migotanie_scena_wynik": migotanie_scena_wynik,
    "kompensacja_scena_wynik": kompensacja_scena_wynik,
    "rozplyw_scena_wynik": rozplyw_scena_wynik,
    "walidacja_scena_wynik": walidacja_scena_wynik,
    "cieplna_scena_wynik": cieplna_scena_wynik,
    "cieplna_scena_dowod": cieplna_scena_dowod,
    "arcflash_scena_wynik": arcflash_scena_wynik,
    "przeglad_wiarygodnosci_katalogu": przeglad_wiarygodnosci_katalogu_scena,
    "skladowe_scena_wynik": skladowe_scena_wynik,
    "skladowe_scena_slad": skladowe_scena_slad,
    "skladowe_scena_migawka": skladowe_scena_migawka,
    "zbieznosc_scena_naglowek": zbieznosc_scena_naglowek,
    "zbieznosc_scena_wynik": zbieznosc_scena_wynik,
    "zbieznosc_scena_slad": zbieznosc_scena_slad,
    "zbieznosc_scena_migawka": zbieznosc_scena_migawka,
    "koordynacja_scena_migawka": koordynacja_scena_migawka,
    "koordynacja_scena_zwarcia_max": koordynacja_scena_zwarcia_max,
    "koordynacja_scena_zwarcia_min": koordynacja_scena_zwarcia_min,
    "koordynacja_scena_galezie": koordynacja_scena_galezie,
    "koordynacja_scena_pakiet_dostepnosc_max": koordynacja_scena_pakiet_dostepnosc_max,
    "koordynacja_scena_pakiet_dostepnosc_min": koordynacja_scena_pakiet_dostepnosc_min,
    "koordynacja_scena_nastawy": koordynacja_scena_nastawy,
    "koordynacja_scena_nastawy_dopasowanie": koordynacja_scena_nastawy_dopasowanie,
    "koordynacja_scena_wynik": koordynacja_scena_wynik,
    "koordynacja_scena_miejsca": koordynacja_scena_miejsca,
    "porownanie_scena_biegi_pf": porownanie_scena_biegi_pf,
    "porownanie_scena_wynik_pf": porownanie_scena_wynik_pf,
    "porownanie_scena_slad_pf": porownanie_scena_slad_pf,
    "porownanie_scena_biegi_zabezpieczen": porownanie_scena_biegi_zabezpieczen,
    "porownanie_scena_wynik_zabezpieczen": porownanie_scena_wynik_zabezpieczen,
    "porownanie_scena_slad_zabezpieczen": porownanie_scena_slad_zabezpieczen,
    "oltc_scena_przebieg": oltc_scena_przebieg,
    "oltc_scena_wynik": oltc_scena_wynik,
    "estymacja_scena_wymagania": estymacja_scena_wymagania,
    "estymacja_scena_wynik": estymacja_scena_wynik,
    "odbior_zgodnosc_scena_wynik": odbior_zgodnosc_scena_wynik,
    "odbior_zgodnosc_scena_zaciski": odbior_zgodnosc_scena_zaciski,
    "frt_scena_trajektorie": frt_scena_trajektorie,
    "frt_scena_sekwencja": frt_scena_sekwencja,
    "lom_scena_wynik": lom_scena_wynik,
    "odbior_scena_prad_znamionowy": odbior_scena_prad_znamionowy,
    "akademickie_scena_biegi": akademickie_scena_biegi,
    "stacja_demo_scena_migawka": stacja_demo_scena_migawka,
    "siec_zlota_scena_migawka": siec_zlota_scena_migawka,
    "przebieg_pf_sceny_zlotej": przebieg_pf_sceny_zlotej,
    "pulpit_scena_migawka": pulpit_scena_migawka,
    "pulpit_scena_przebieg": pulpit_scena_przebieg,
    "diagnoza_scena_diagnostyka": diagnoza_scena_diagnostyka,
    "diagnoza_scena_preflight": diagnoza_scena_preflight,
    "diagnoza_scena_przebieg": diagnoza_scena_przebieg,
    "diagnoza_scena_bieg": diagnoza_scena_bieg,
}


def _json(dane: dict[str, Any]) -> str:
    return json.dumps(dane, ensure_ascii=False, indent=2, sort_keys=False) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sprawdz", action="store_true", help="tylko porównaj z repo")
    args = parser.parse_args(argv)

    FIXTURES_DIR.mkdir(parents=True, exist_ok=True)
    rozjazdy: list[str] = []
    for nazwa, funkcja in FIXTURY.items():
        sciezka = FIXTURES_DIR / f"{nazwa}.json"
        tresc = _json(funkcja())
        if args.sprawdz:
            if not sciezka.exists() or sciezka.read_text(encoding="utf-8") != tresc:
                rozjazdy.append(nazwa)
                print(f"[rozjazd] {sciezka}")
            else:
                print(f"[ok] {sciezka}")
            continue
        sciezka.write_text(tresc, encoding="utf-8")
        print(f"[zapisano] {sciezka}")
    return 1 if rozjazdy else 0


if __name__ == "__main__":
    sys.exit(main())
