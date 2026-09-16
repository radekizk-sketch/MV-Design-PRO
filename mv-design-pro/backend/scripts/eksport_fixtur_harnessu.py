#!/usr/bin/env python3
"""Eksport atrap harnessu scen (`creator-harness.html`) z BACKENDU do frontendu.

DLACZEGO (E2E-FULL-FIX-3, 2026-09-10). Harness scen podmienia `window.fetch`
atrapami o kształcie 1:1 z kontraktami backendu. Dwie końcówki czytają STAN
przypadku (committed ENM + rejestr przebiegów), którego harness nie ma —
zgodność przekrojowa NC RfG (`GET /api/ncrfg-tests/cases/{id}/compliance`)
i werdykt projektowy (`GET /api/quality/design-verdict`). Ręczna kopia payloadu
dryfowała już dwukrotnie (katalog NC RfG, klasy modułów sprzed OD-5), więc te
atrapy NIE są pisane ręcznie: liczy je ten skrypt DOKŁADNIE tymi funkcjami,
które wołają końcówki (`NcRfgComplianceChecker.check` + `model_dump`,
`zbuduj_werdykt_projektowy`), i zapisuje JSON do
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
    build_short_circuit_band_response,
    build_short_circuit_results_response,
    build_short_circuit_rozplyw_response,
)
from api.proof_pack import SCContributionsRequest, sc3f_contributions  # noqa: E402
from application.analyses.v126_gotowosc import odpowiedz_gotowosci  # noqa: E402
from application.analyses.v126_katalog import katalog_do_dict  # noqa: E402
from application.analyses.werdykt_projektowy import (  # noqa: E402
    zbuduj_werdykt_projektowy,
)
from application.ncrfg_compliance.checker import (  # noqa: E402
    DerDataForCompliance,
    NcRfgComplianceChecker,
)
from enm.canonical_analysis import (  # noqa: E402
    build_short_circuit_results,
    create_run,
    execute_run,
    reset_canonical_runs,
)
from enm.hash import compute_enm_hash  # noqa: E402
from enm.models import EnergyNetworkModel, ENMHeader  # noqa: E402
from enm.store import reset_enm_store, set_enm  # noqa: E402
from solver_input.v126_contracts import V126AnalysisType  # noqa: E402
from tests.cgmes.golden_enm import build_golden_enm  # noqa: E402

FIXTURES_DIR = BACKEND_DIR.parent / "frontend" / "src" / "harness-fixtures" / "generated"

#: Identyfikator przypadku zasiewu globalnego harnessu (`useAppStateStore`).
CASE_ID_HARNESSU = "case-demo"

#: Scena `macierz` (creator-harness-main.tsx): dwa moduły DER przyłączone przez
#: transformator blokowy do szyny 15 kV — klasa B wg progów OD-5 (1 MW / 50 MW).
#: Zdolności odwzorowują most model → zgodność (`model_bridge.py`) dla tabliczek
#: zasianych w scenie: krzywa LVRT z profilu `lvrt_curve_ref`, model dynamiczny
#: z `dynamic_model_ref`; brak droop/Q(U)/cos φ w tabliczce = brak (nie zgadywanie).
MODULY_SCENY_MACIERZ: tuple[DerDataForCompliance, ...] = (
    DerDataForCompliance(
        der_ref="bess-1",
        p_max_kw=1500.0,
        voltage_kv=15.0,
        has_lvrt_curve=False,
        has_hvrt_curve=False,
        has_pf_droop=False,
        has_qu_curve=False,
        has_dynamic_model=False,
        has_scada_communication=False,
        has_disturbance_recorder=False,
        cos_phi_min=None,
    ),
    DerDataForCompliance(
        der_ref="pv-1",
        p_max_kw=1935.0,
        voltage_kv=15.0,
        has_lvrt_curve=True,
        has_hvrt_curve=False,
        has_pf_droop=False,
        has_qu_curve=False,
        has_dynamic_model=True,
        has_scada_communication=False,
        has_disturbance_recorder=False,
        cos_phi_min=None,
    ),
)
OPERATOR_SCENY_MACIERZ = "enea"


def zgodnosc_przekrojowa_sceny_macierz() -> dict[str, Any]:
    """Odpowiedź `GET /api/ncrfg-tests/cases/{id}/compliance` — ten sam kształt
    co `api/ncrfg_ptpiree_tests.py::run_ncrfg_compliance_from_model`."""
    checker = NcRfgComplianceChecker()
    reports = [checker.check(OPERATOR_SCENY_MACIERZ, der) for der in MODULY_SCENY_MACIERZ]
    return {
        "case_id": CASE_ID_HARNESSU,
        "operator_id": OPERATOR_SCENY_MACIERZ,
        "der_count": len(reports),
        "reports": [
            {
                **report.model_dump(mode="json"),
                "overall_pass": report.overall_pass,
                "total_tests": report.total_tests,
                "passed_count": report.passed_count,
                "no_module_count": report.no_module_count,
            }
            for report in reports
        ],
    }


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
        with patch("enm.canonical_analysis.uuid4", return_value=_UUID_KOTWICY_SCENY_ZWARCIA):
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
