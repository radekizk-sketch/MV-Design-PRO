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
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from unittest.mock import patch
from uuid import NAMESPACE_URL, uuid5

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR / "src"))
sys.path.insert(0, str(BACKEND_DIR))

from api.canonical_run_views import (  # noqa: E402
    build_automation_trace_results_response,
    build_dynamic_stability_results_response,
    build_phase_state_results_response,
    build_short_circuit_band_response,
    build_short_circuit_results_response,
    build_short_circuit_rozplyw_response,
    get_power_flow_result,
)
from api.proof_pack import SCContributionsRequest, sc3f_contributions  # noqa: E402
from application.analyses.arc_flash_view import build_arc_flash_view  # noqa: E402
from application.analyses.dobor_kompensacji import (  # noqa: E402
    build_compensation_sizing_view,
)
from application.analyses.energy_validation.service import (  # noqa: E402
    build_energy_validation_view,
)
from application.analyses.grid_strength import build_grid_strength_view  # noqa: E402
from application.analyses.migotanie import build_migotanie_view  # noqa: E402
from application.analyses.v126_gotowosc import odpowiedz_gotowosci  # noqa: E402
from application.analyses.v126_katalog import katalog_do_dict  # noqa: E402
from application.analyses.werdykt_projektowy import (  # noqa: E402
    zbuduj_werdykt_projektowy,
)
from application.analyses.wytrzymalosc_cieplna_przewodow import (  # noqa: E402
    build_wytrzymalosc_cieplna_view,
    zbuduj_dowod_cieplny,
)
from application.ncrfg_compliance import zgodnosc_ncrfg_przypadku  # noqa: E402
from enm.canonical_analysis import (  # noqa: E402
    build_short_circuit_results,
    create_run,
    execute_run,
    reset_canonical_runs,
)
from enm.hash import compute_enm_hash  # noqa: E402
from enm.katalog_projektu import katalog_biezacy  # noqa: E402
from enm.models import EnergyNetworkModel, ENMHeader, Generator  # noqa: E402
from enm.store import reset_enm_store, set_enm  # noqa: E402
from solver_input.v126_contracts import V126AnalysisType  # noqa: E402

from tests.cgmes.golden_enm import build_golden_enm  # noqa: E402

FIXTURES_DIR = BACKEND_DIR.parent / "frontend" / "src" / "harness-fixtures" / "generated"

#: Identyfikator przypadku zasiewu globalnego harnessu (`useAppStateStore`).
CASE_ID_HARNESSU = "case-demo"

#: Scena `macierz` (creator-harness-main.tsx): dwa moduły DER przyłączone przez
#: transformator blokowy do szyny 15 kV — klasa B wg progów OD-5 (1 MW / 50 MW).
#: `(der_ref, p_max_kw, voltage_kv, gen_type, karta_katalogu_ref)` 1:1 z zasiewem
#: `useStationDerStore` sceny (para predykatów: atrapa harnessu odmawia 409, gdy
#: raporty nie opisują tych samych modułów). Moce = liczba jednostek × moc
#: katalogowa (BESS 3 × ABB PCS100 500 kW; PV 9 × Huawei SUN2000-215KTL 215 kW).
DER_SCENY_MACIERZ: tuple[tuple[str, float, float, str, str], ...] = (
    ("bess-1", 1500.0, 15.0, "bess", "bess_pcs_abb_500"),
    ("pv-1", 1935.0, 15.0, "pv_inverter", "conv-pv-card-huawei-sun2000-215ktl"),
)
SZYNA_SCENY_MACIERZ = "st-demo__szyna-sn__15"
OPERATOR_SCENY_MACIERZ = "enea"


def _tabliczka_ptpiree_z_katalogu(gen_type: str, catalog_ref: str) -> dict[str, Any]:
    """Pola `ptpiree_*` REALNEGO rekordu katalogu (te same, które brama katalogowa
    `add_converter_source` kopiuje na tabliczkę generatora — `_POLA_CERTYFIKATU_PTPIREE`
    w `enm/domain_operations_v2.py`); zero wartości wpisanych ręcznie."""
    katalog = katalog_biezacy()
    rekord: Any = (
        katalog.get_bess_inverter_type(catalog_ref)
        if gen_type == "bess"
        else katalog.get_pv_inverter_type(catalog_ref)
    )
    if rekord is None:
        raise SystemExit(f"[fixtury] karta katalogu sceny macierz nie istnieje: {catalog_ref}")
    return {k: v for k, v in rekord.to_dict().items() if k.startswith("ptpiree_")}


def enm_sceny_macierz() -> EnergyNetworkModel:
    """Committed ENM odpowiadający zasiewowi sceny `macierz` — WEJŚCIE mostu
    `model_bridge.py` (ten sam most, który czyta trasa `/compliance`).

    Tabliczki 1:1 z zasiewem sceny: certyfikat PTPiREE z realnego katalogu
    (`catalogs.device_catalog_ref`/`ptpiree_certificate_ref`), model dynamiczny
    (`catalogs.dynamic_model_ref` → `materialized_params.dynamic_model_ref`,
    jak `set_der_catalog_bindings`), profile (`profiles.*` → `materialized_params
    .profiles`). Brak droop/Q(U)/cosφ w zasiewie = brak w `meta` (nie zgadywanie)
    → solver daje `no_data` dla testów wymaganych bez danych."""
    generators: list[dict[str, Any]] = []
    for der_ref, p_max_kw, _voltage_kv, gen_type, catalog_ref in DER_SCENY_MACIERZ:
        tabliczka: dict[str, Any] = {
            "catalog_item_id": catalog_ref,
            **_tabliczka_ptpiree_z_katalogu(gen_type, catalog_ref),
            "profiles": {"nc_rfg_profile_ref": OPERATOR_SCENY_MACIERZ},
        }
        if der_ref == "pv-1":
            tabliczka["dynamic_model_ref"] = "default_pv_gfl"
            tabliczka["profiles"]["lvrt_curve_ref"] = OPERATOR_SCENY_MACIERZ
        generators.append(
            {
                "ref_id": der_ref,
                "name": der_ref,
                "bus_ref": SZYNA_SCENY_MACIERZ,
                "p_mw": p_max_kw / 1000.0,
                "gen_type": gen_type,
                "meta": {},
                "materialized_params": tabliczka,
            }
        )
    return EnergyNetworkModel.model_validate(
        {
            "header": ENMHeader(name="Przyłączenie farmy PV 8 MW").model_dump(),
            "buses": [
                {
                    "ref_id": SZYNA_SCENY_MACIERZ,
                    "name": "Szyna SN 15 kV",
                    "voltage_kv": DER_SCENY_MACIERZ[0][2],
                }
            ],
            "generators": generators,
        }
    )


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
    PO konstrukcji jest więc jedynym miejscem skutecznym."""
    for element in (
        list(enm.buses)
        + list(enm.sources)
        + list(enm.transformers)
        + list(enm.branches)
        + list(enm.loads)
        + list(enm.generators)
        + list(enm.substations)
    ):
        element.id = uuid5(NAMESPACE_URL, f"mv-design-pro:harness:element-id:{element.ref_id}")
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
        with (
            patch("enm.canonical_analysis.uuid4", return_value=_UUID_KOTWICY_SCENY_ZWARCIA),
            patch("enm.canonical_analysis.datetime", _ZegarStalyBiegu),
        ):
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
        set_enm(CASE_ID_HARNESSU, enm)
        with (
            patch(
                "enm.canonical_analysis.uuid4",
                return_value=_UUID_SCENY_ROZPLYW_ZWARCIOWY_GPZ_FEEDER,
            ),
            patch("enm.canonical_analysis.datetime", _ZegarStalyBiegu),
        ):
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
        with (
            patch("enm.canonical_analysis.uuid4", return_value=_UUID_SCENY_STAN_FAZOWY),
            patch("enm.canonical_analysis.datetime", _ZegarStalyBiegu),
        ):
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
        with (
            patch("enm.canonical_analysis.uuid4", return_value=_UUID_SCENY_STABILNOSC),
            patch("enm.canonical_analysis.datetime", _ZegarStalyBiegu),
        ):
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
# short_circuit_sn/PF sieci złotej), zero recznie wpisanych liczb fizycznych.
# ---------------------------------------------------------------------------

RUN_ID_SCENY_OZE_ANALIZ = "run-sc-scena-oze-analiz"
_UUID_SCENY_OZE_ANALIZ = uuid5(NAMESPACE_URL, "mv-design-pro:harness:" + RUN_ID_SCENY_OZE_ANALIZ)

RUN_ID_SCENY_KOMPENSACJA = "run-lf-scena-kompensacja"
_UUID_SCENY_KOMPENSACJA = uuid5(NAMESPACE_URL, "mv-design-pro:harness:" + RUN_ID_SCENY_KOMPENSACJA)

RUN_ID_SCENY_ROZPLYW = "run-lf-scena-rozplyw"
_UUID_SCENY_ROZPLYW = uuid5(NAMESPACE_URL, "mv-design-pro:harness:" + RUN_ID_SCENY_ROZPLYW)


def _bieg_sceny_oze_analiz() -> Any:
    """Bieg `short_circuit_sn` KOTWICY scen „siła-sieci"/„migotanie" — sieć
    złota z `catalog_ref` DOPISANYM na `gen_pv` (`conv-pv-card-huawei-sun2000-
    215ktl`, REALNA karta katalogu MV — `network_model/catalog/
    mv_converter_catalog.py`, sn_mva=0.215, flicker_c=0.30), bo
    `_installed_mva_for_generator`/`_resolve_converter`
    (`application/analyses/grid_strength.py`) rozwiązują moc znamionowaą/
    współczynnik migotania WYŁĄCZNIE przez `Generator.catalog_ref` — sieć
    złota bazowa (`build_golden_enm`, bez tego pola) daje uczciwe „brak
    danych" na KAŻDYM węźle (zmierzone bezpośrednio), co nie demonstruje
    ekranu. Dopisanie jednego pola katalogowego na kopii ENM nie zmienia
    topologii/fizyki reszty sieci — SCR/Pst policzone są REALNIE
    (`build_grid_strength_view`/`build_migotanie_view`) z realnego Sk''
    solvera i realnej mocy/współczynnika katalogu, nie wpisane ręcznie.
    `id`/zegar przypięte jak `_bieg_sceny_zwarcia` (ta sama klasa
    niedeterminizmu: `element.id`/`header.created_at` losowane przy
    KAŻDYM `build_golden_enm()`)."""
    reset_canonical_runs()
    reset_enm_store()
    try:
        enm = build_golden_enm()
        for gen in enm.generators:
            if gen.ref_id == "gen_pv":
                gen.catalog_ref = "conv-pv-card-huawei-sun2000-215ktl"
        _fiksuj_niedeterminizm_sceny_zwarcia(enm)
        set_enm(CASE_ID_HARNESSU, enm)
        with (
            patch("enm.canonical_analysis.uuid4", return_value=_UUID_SCENY_OZE_ANALIZ),
            patch("enm.canonical_analysis.datetime", _ZegarStalyBiegu),
        ):
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
        set_enm(CASE_ID_HARNESSU, enm)
        with (
            patch("enm.canonical_analysis.uuid4", return_value=_UUID_SCENY_KOMPENSACJA),
            patch("enm.canonical_analysis.datetime", _ZegarStalyBiegu),
        ):
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
        set_enm(CASE_ID_HARNESSU, enm)
        with (
            patch("enm.canonical_analysis.uuid4", return_value=_UUID_SCENY_ROZPLYW),
            patch("enm.canonical_analysis.datetime", _ZegarStalyBiegu),
        ):
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


#: Nazwa pliku → funkcja licząca odpowiedź (kolejność = kolejność eksportu).
FIXTURY: dict[str, Any] = {
    "ncrfg_zgodnosc_przekrojowa_scena_macierz": zgodnosc_przekrojowa_sceny_macierz,
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
