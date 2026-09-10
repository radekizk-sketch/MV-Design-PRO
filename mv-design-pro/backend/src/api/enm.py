"""
ENM API — persistence + validation + run dispatch + topology operations.

Routes:
  GET  /api/cases/{case_id}/enm              → current EnergyNetworkModel
  PUT  /api/cases/{case_id}/enm              → autosave (revision++, hash recomputed)
  GET  /api/cases/{case_id}/enm/validate     → ValidationResult
  GET  /api/cases/{case_id}/enm/topology     → TopologyGraph (substations, bays, junctions, corridors)
  GET  /api/cases/{case_id}/enm/topology/summary → TopologySummary (graph view: adjacency, spine, laterals)
  GET  /api/cases/{case_id}/enm/readiness    → ReadinessMatrix (SC/PF/PR)
  POST /api/cases/{case_id}/enm/ops          → Topology operations (atomic graph CRUD)
  GET  /api/cases/{case_id}/enm/lv-domain/{station_ref}
                                              → graf domeny nN (LOD L2, karta T5b)
  GET  /api/cases/{case_id}/enm/lv-domain/{station_ref}/upstream-equivalent
                                              → UpstreamEquivalentSnapshot (kotwica SN, karta T5b)
  GET  /api/cases/{case_id}/enm/dziennik-zmian → wpisy dziennika PO wskazanej rewizji
  GET  /api/cases/{case_id}/enm/rewizje/{rewizja}
                                              → migawka modelu DOKLADNIE w tej rewizji

Karta CV-4.3-A4 (K5.1, 2026-09-06): `POST /api/cases/{case_id}/runs/short-circuit`
i `.../runs/power-flow` USUNIETE procedura siedmiu krokow — 0 konsumentow
produkcyjnych (jedyny byl e2e nazywajacy je wprost "legacy" we wlasnym kodzie).
Tor kanoniczny: `POST /api/execution/study-cases/{case_id}/runs` (`analysis_type=
SC_3F/SC_1F/SC_2F/SC_2F_G/LOAD_FLOW`) -> `POST /api/execution/runs/{id}/execute`
-> `GET /api/analysis-runs/{run_id}/results/...` (`api/execution_runs.py`,
`api/analysis_runs.py`). `run_short_circuit_now`/`run_power_flow_now`
(`enm/canonical_analysis.py`) zostaja — maja innych wolajacych bezposrednich
(testy silnika, `tests/e2e/test_nn_full_chain.py`) niezaleznych od tej trasy.
"""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from api.domain_ops_policy import (
    extract_catalog_binding,
    validate_and_materialize_catalog_binding,
)
from api.klucz_twin_dep import KluczTwin
from application.analyses.fault_loop.service import (
    build_fault_loop_view_at_point,
    build_feeder_fault_loop_view,
    build_station_fault_loop_view,
)
from application.analyses.lv_domain.graph_view import build_lv_domain_view
from application.analyses.lv_domain.projection_v1 import (
    LvDomainProjectionRunMismatch,
    LvDomainProjectionRunUnavailable,
    build_lv_domain_projection_v1,
)
from application.analyses.lv_domain.upstream_equivalent import (
    Scenario as UpstreamEquivalentScenario,
)
from application.analyses.lv_domain.upstream_equivalent import (
    build_upstream_equivalent_snapshot,
)
from application.analyses.nn_circuit_sheet import build_nn_circuit_sheet
from application.analyses.nn_device_selection import wybierz_aparat_dla_obwodu_nn
from application.analyses.protection.czas_wylaczenia_pola import (
    czasy_wylaczenia_pol_stacji,
)
from application.analyses.swz.service import build_swz_view
from application.analyses.wytrzymalosc_aparatury_pol import (
    zbuduj_widok_wytrzymalosci_aparatury,
)
from application.eligibility_service import EligibilityService
from application.field_read_model import build_field_read_model
from application.protection_read_model import build_protection_read_model
from domain.canonical_operations import resolve_operation_name
from domain.readiness_bridge import opis_kanoniczny
from enm.canonical_analysis import (
    get_run as _get_canonical_run,
)
from enm.dziennik_zmian import wpisy_od as wpisy_dziennika_od
from enm.hash import compute_enm_hash
from enm.models import EnergyNetworkModel
from enm.rewizje import RewizjaNieistniejeError, RewizjaUszkodzonaError
from enm.severity import empty_severity_counts
from enm.store import ZrodloZmiany, blokada_twin
from enm.store import checkout as _checkout_rewizji
from enm.store import get_enm as _get_enm
from enm.store import set_enm as _set_enm
from enm.topology_ops import (
    attach_protection,
    compute_topology_summary,
    create_branch,
    create_device,
    create_measurement,
    create_node,
    delete_branch,
    delete_device,
    delete_measurement,
    delete_node,
    detach_protection,
    update_branch,
    update_device,
    update_node,
    update_protection,
)
from enm.v2_projection import project_enm_v1_to_v2
from enm.validator import ENMValidator
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/cases", tags=["enm"])


class WizardStepRequestModel(BaseModel):
    step_id: str
    data: dict[str, Any] = Field(default_factory=dict)


def _resolve_project_id(case_id: str, request: Request) -> str | None:
    uow_factory = getattr(request.app.state, "uow_factory", None)
    if uow_factory is None:
        return None
    try:
        parsed_case_id = UUID(case_id)
    except ValueError:
        return None
    with uow_factory() as uow:
        study_case = uow.cases.get_study_case(parsed_case_id)
        if study_case is not None:
            return str(study_case.project_id)
    return None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/{case_id}/enm")
def get_enm(case_id: str, klucz: KluczTwin) -> dict[str, Any]:
    """Return current EnergyNetworkModel for case."""
    enm = _get_enm(klucz)
    return enm.model_dump(mode="json")


@router.get("/{case_id}/enm/v2-projection")
def get_enm_v2_projection(case_id: str, klucz: KluczTwin) -> dict[str, Any]:
    """Return the read-only ENM v2.0 projection used by V12.xx M1 migration."""
    enm = _get_enm(klucz)
    projection = project_enm_v1_to_v2(enm)
    return projection.model_dump(mode="json")


@router.get("/{case_id}/enm/dziennik-zmian")
def get_dziennik_zmian(case_id: str, klucz: KluczTwin, od_rewizji: int = 0) -> dict[str, Any]:
    """Zmiany modelu PO wskazanej rewizji — odpowiedz na „co uniewaznilo moj wynik".

    V12K-264. Model niosl dotad wylacznie FAKT zmiany (`header.revision` rosnie,
    przypadek dostaje `OUTDATED`), nigdy PRZYCZYNY. Projektant widzial „wyniki
    nieaktualne" i musial sam odtworzyc, co zrobil miedzy biegiem a chwila obecna.

    `od_rewizji` to rewizja modelu, NA KTOREJ policzono wynik — zwracamy wpisy o
    rewizji wyzszej. `rewizja_biezaca` pozwala odbiorcy sprawdzic, czy wynik jest
    aktualny, bez drugiego zapytania.

    ZERO INTERPRETACJI: opisy pochodza z kanonu operacji, listy elementow wprost
    z odpowiedzi operacji domenowej. Rewizja zapisana bez zarejestrowanej operacji
    ma `operacja: null` i opis nazywajacy ten stan — nie jest ukrywana ani
    uzupelniana zgadnieta nazwa.
    """
    enm = _get_enm(klucz)
    wpisy = wpisy_dziennika_od(klucz, od_rewizji)
    return {
        "case_id": case_id,
        "rewizja_biezaca": enm.header.revision,
        "od_rewizji": od_rewizji,
        "aktualny": enm.header.revision <= od_rewizji,
        # CV-2: `WpisDziennika.to_dict` niesie takze `hash_sha256` (odcisk migawki
        # tej rewizji), `rodzic` (rewizja, z ktorej powstala) i `ladunek` (PELNA
        # komende, ktora ja wytworzyla). Zadne pole nie jest tu filtrowane —
        # dziennik oddaje dokladnie to, co zapisal (pin: test kontraktu koncowki).
        "wpisy": [w.to_dict() for w in wpisy],
    }


@router.get("/{case_id}/enm/rewizje/{rewizja}")
def get_rewizja_modelu(case_id: str, klucz: KluczTwin, rewizja: int) -> dict[str, Any]:
    """Model DOKLADNIE w rewizji `rewizja` — tresc adresu, ktory niesie bieg (CV-2).

    Koperta rewizji biegu (`RevisionEnvelope.model_revision`) wskazywala dotad
    rewizje, ktorej NIE DALO SIE odczytac: system znal wylacznie model biezacy,
    wiec „wynik policzono na rewizji 7" bylo adresem bez tresci — nie dalo sie ani
    obejrzec tamtego modelu, ani potwierdzic, ze bieg opisuje to, co deklaruje.
    Ta koncowka zamyka luke: `enm.store.checkout` oddaje migawke rewizji
    zweryfikowana hashem tresci.

    404 — rewizja nie ma migawki (rewizja sprzed rejestru rewizji albo numer,
    ktory nigdy nie powstal). 409 — migawka istnieje, ale jej tresc nie zgadza sie
    z zapisanym odciskiem: to uszkodzenie nosnika albo reczna ingerencja, wiec
    odpowiedz nazywa stan wprost, zamiast oddawac model, ktoremu nie mozna ufac.
    """
    try:
        model = _checkout_rewizji(klucz, rewizja)
    except RewizjaNieistniejeError as exc:
        raise HTTPException(
            status_code=404,
            detail=(
                f"Rewizja {rewizja} modelu tego przypadku nie ma zapisanej migawki — "
                "powstala przed wprowadzeniem rejestru rewizji albo nigdy nie istniala."
            ),
        ) from exc
    except RewizjaUszkodzonaError as exc:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Migawka rewizji {rewizja} jest niespójna z własnym odciskiem — "
                "zapis został zmieniony poza systemem i nie da się go uznać za "
                "wiarygodny model."
            ),
        ) from exc
    return {
        "case_id": case_id,
        "rewizja": rewizja,
        "hash_sha256": compute_enm_hash(model),
        "snapshot": model.model_dump(mode="json"),
    }


@router.put("/{case_id}/enm")
def put_enm(case_id: str, klucz: KluczTwin, payload: EnergyNetworkModel) -> dict[str, Any]:
    """Autosave ENM: revision++, hash recomputed.

    WSPÓŁBIEŻNOŚĆ: ta końcówka NIE ma cyklu odczyt → przeliczenie → zapis — model
    przychodzi w całości od wołającego, a sam zapis (`revision++` na bieżącym
    wpisie magazynu) jest już serializowany blokadą wewnątrz `set_enm`. Rozciąganie
    blokady na końcówkę niczego by nie dało: model, który autosave nadpisuje,
    został odczytany po stronie przeglądarki, poza zasięgiem blokady w procesie.
    """
    saved = _set_enm(klucz, payload)
    return saved.model_dump(mode="json")


@router.get("/{case_id}/enm/validate")
def validate_enm(case_id: str, klucz: KluczTwin) -> dict[str, Any]:
    """Validate ENM and return readiness gate result."""
    enm = _get_enm(klucz)
    validator = ENMValidator()
    result = validator.validate(enm)
    return result.model_dump(mode="json")


@router.get("/{case_id}/enm/topology")
def get_enm_topology(case_id: str, klucz: KluczTwin) -> dict[str, Any]:
    """Zwróć podsumowanie topologii (stacje, pola, węzły T, magistrale)."""
    enm = _get_enm(klucz)
    return {
        "case_id": case_id,
        "substations": [s.model_dump(mode="json") for s in enm.substations],
        "bays": [b.model_dump(mode="json") for b in enm.bays],
        "junctions": [j.model_dump(mode="json") for j in enm.junctions],
        "corridors": [c.model_dump(mode="json") for c in enm.corridors],
        "bus_count": len(enm.buses),
        "branch_count": len(enm.branches),
        "transformer_count": len(enm.transformers),
    }


@router.get("/{case_id}/enm/readiness")
def get_enm_readiness(case_id: str, klucz: KluczTwin) -> dict[str, Any]:
    """Zwróć macierz gotowości dla wszystkich typów analiz."""
    enm = _get_enm(klucz)
    validator = ENMValidator()
    validation = validator.validate(enm)
    readiness = validator.readiness(validation)

    has_protection_data = bool(enm.protection_assignments) or (
        bool(enm.bays) and any(b.protection_ref is not None for b in enm.bays)
    )

    return {
        "case_id": case_id,
        "enm_revision": enm.header.revision,
        "validation": validation.model_dump(mode="json"),
        "readiness": readiness.model_dump(mode="json"),
        "analysis_readiness": {
            "short_circuit_3f": validation.analysis_available.short_circuit_3f,
            "short_circuit_1f": validation.analysis_available.short_circuit_1f,
            "load_flow": validation.analysis_available.load_flow,
            "protection": has_protection_data and readiness.ready,
        },
        "topology_completeness": {
            "has_substations": len(enm.substations) > 0,
            "has_bays": len(enm.bays) > 0,
            "has_junctions": len(enm.junctions) > 0,
            "has_corridors": len(enm.corridors) > 0,
        },
        "element_counts": {
            "buses": len(enm.buses),
            "branches": len(enm.branches),
            "transformers": len(enm.transformers),
            "sources": len(enm.sources),
            "loads": len(enm.loads),
            "generators": len(enm.generators),
            "substations": len(enm.substations),
            "bays": len(enm.bays),
            "junctions": len(enm.junctions),
            "corridors": len(enm.corridors),
            "measurements": len(enm.measurements),
            "protection_assignments": len(enm.protection_assignments),
        },
    }


@router.get("/{case_id}/enm/protection-view")
def get_enm_protection_view(case_id: str, klucz: KluczTwin) -> dict[str, Any]:
    """Return read-only protection view derived directly from ENM."""
    enm = _get_enm(klucz)
    return build_protection_read_model(case_id, enm)


@router.get("/{case_id}/enm/field-view")
def get_enm_field_view(case_id: str, klucz: KluczTwin) -> dict[str, Any]:
    """Return canonical bay field view derived directly from ENM."""
    enm = _get_enm(klucz)
    return build_field_read_model(case_id, enm)


@router.get("/{case_id}/enm/station-fault-loop")
def get_station_fault_loop(case_id: str, klucz: KluczTwin, station_ref: str) -> dict[str, Any]:
    """Pętla zwarcia u źródła stacji (nN) z modelu (G-STK-4).

    Domyka łańcuch uziemienia: układ sieci nN + impedancja transformatora →
    Ik/Z_loop u źródła (IEC 60364-4-41). Read-only; solver liczy fizykę.
    """
    enm = _get_enm(klucz)
    return build_station_fault_loop_view(enm, station_ref)


@router.get("/{case_id}/enm/fault-loop-point")
def get_fault_loop_point(
    case_id: str, klucz: KluczTwin, station_ref: str, bus_ref: str
) -> dict[str, Any]:
    """Pętla zwarcia w DOWOLNYM punkcie nN (karta P0.6, G-05).

    Trasa REALNA z grafu (BFS od punktu do zacisków nN transformatora) — kabel
    po kablu, z żyłą powrotną PE/PEN i n_parallel; ta sama fizyka transformatora
    (składowa zgodna z grupą połączeń) i upstream Thevenin SN co widok „u
    źródła". Read-only; solver liczy fizykę.
    """
    enm = _get_enm(klucz)
    return build_fault_loop_view_at_point(enm, station_ref, bus_ref)


@router.get("/{case_id}/enm/fault-loop-feeders")
def get_fault_loop_feeders(case_id: str, klucz: KluczTwin, station_ref: str) -> dict[str, Any]:
    """Pętla zwarcia we WSZYSTKICH punktach nN, pogrupowana per odpływ (karta P0.6, G-05).

    Kontrakt danych kompletny (każdy osiągalny punkt każdego odpływu, ze
    wskazaniem punktu najgorszego per odpływ) — heatmapa/UI nN STUDIO w P0.9,
    tu tylko dane. Read-only; solver liczy fizykę.
    """
    enm = _get_enm(klucz)
    return build_feeder_fault_loop_view(enm, station_ref)


@router.get("/{case_id}/enm/lv-domain/{station_ref}")
def get_lv_domain_view(case_id: str, klucz: KluczTwin, station_ref: str) -> dict[str, Any]:
    """Graf domeny nN stacji — spójna składowa 0,4 kV wyprowadzona Z GRAFU
    (karta T5b, docs/nn/KONCEPCJA_LOD_NN_2026-08.md §0 rozstrzygnięcie 2).

    Granica domeny = GRANICA NAPIĘCIOWA I PROJEKCJI (werdykt): transformator
    jest jedyną legalną granicą 15 kV/0,4 kV; przejście do INNEJ stacji z
    WŁASNYM transformatorem zatrzymuje spacer i wraca jako `boundary_links`
    (ref stacji docelowej), NIE wciąga jej elementów. Podrozdzielnice bez
    własnego transformatora (rozdzielnica_nn) są WCHŁONIĘTE — to ta sama
    domena elektryczna. Read-only; zero fizyki (topologia, nie solver).
    """
    enm = _get_enm(klucz)
    return build_lv_domain_view(enm, station_ref)


@router.get("/{case_id}/enm/lv-domain/{station_ref}/upstream-equivalent")
def get_lv_domain_upstream_equivalent(
    case_id: str,
    klucz: KluczTwin,
    station_ref: str,
    scenario: UpstreamEquivalentScenario = "MAX",
    transformer_ref: str | None = None,
) -> dict[str, Any]:
    """`UpstreamEquivalentSnapshot` — kotwica SN domeny nN (L2), karta T5b
    §0 rozstrzygnięcie 1 (docs/nn/KONCEPCJA_LOD_NN_2026-08.md, werdykt
    właściciela).

    Immutable, deterministyczny (ten sam ENM + scenariusz + stan łączeniowy
    → identyczny snapshot, w tym `calculation_run_id`). ZERO nowej fizyki —
    Z1/Sk″/Ik″ w węźle HV transformatora liczone TĄ SAMĄ maszynerią co
    pętla zwarcia nN (`application.analyses.fault_loop.service.
    compute_upstream_hv_thevenin` + solver IEC 60909 `compute_ikss`).
    `scenario` wybiera współczynnik napięciowy c wg IEC 60909-0 Tab.1
    (MAX/MIN, ten sam wybór co bieg zwarciowy); `transformer_ref` opcjonalny
    dla stacji wielotransformatorowych (domyślnie pierwszy transformator
    stacji posortowany po ref_id — determinizm). Read-only; solver liczy
    fizykę, ten endpoint tylko wyławia i zwraca.
    """
    enm = _get_enm(klucz)
    return build_upstream_equivalent_snapshot(
        enm,
        case_id,
        station_ref,
        scenario=scenario,
        transformer_ref=transformer_ref,
    )


@router.get("/{case_id}/enm/lv-domain/{station_ref}/projection/v1")
def get_lv_domain_projection_v1(
    case_id: str,
    klucz: KluczTwin,
    station_ref: str,
    scenario: UpstreamEquivalentScenario = "MAX",
    run_id: UUID | None = None,
) -> dict[str, Any]:
    """Atomowy ``LvDomainProjectionV1`` dla portalu stacji SN/nN.

    Jeden odczyt wiąże graf ENM, kotwicę SN, nakładkę wyniku oraz SWZ z tą
    samą rewizją i odciskiem modelu. ``run_id`` jest opcjonalny; jego brak
    daje jawny stan wyniku ``NONE``. Wskazany przebieg musi należeć do tego
    przypadku i być zakończony — nie ma cichego wyboru innego wyniku.
    """
    enm = _get_enm(klucz)
    run = None
    if run_id is not None:
        run = _get_canonical_run(run_id)
        if run is None:
            raise HTTPException(status_code=404, detail=f"Nie znaleziono przebiegu {run_id}.")
    try:
        return build_lv_domain_projection_v1(
            enm,
            case_id,
            station_ref,
            scenario=scenario,
            run=run,
        )
    except (LvDomainProjectionRunMismatch, LvDomainProjectionRunUnavailable) as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/{case_id}/enm/swz")
def get_swz(
    case_id: str, klucz: KluczTwin, station_ref: str, bus_ref: str, breaker_ref: str
) -> dict[str, Any]:
    """Werdykt SWZ (samoczynne wyłączenie zasilania, IEC 60364-4-41) per obwód
    (karta P0.6, G-06).

    Werdykt 3-stanowy (spełnia / nie spełnia / nierozstrzygalne) + dowód
    liczbowy: Ik1_min pętli zwarcia (scenariusz MIN, R skorygowane
    temperaturowo) vs Ia gwarantowane aparatu (breaker_ref — MCB albo wkładka
    gG) vs t_wymagany z Tab. 41.1 IEC 60364-4-41. Read-only; solver/analiza
    liczą fizykę i interpretację, endpoint tylko wyławia i zwraca.
    """
    enm = _get_enm(klucz)
    return build_swz_view(enm, station_ref, bus_ref, breaker_ref)


@router.get("/{case_id}/enm/nn-device-selection")
def get_nn_device_selection(
    case_id: str,
    klucz: KluczTwin,
    station_ref: str,
    bus_ref: str,
    ib_a: float,
    iz_prime_a: float,
    ik_max_ka: float | None = None,
) -> dict[str, Any]:
    """Dobór aparatu zabezpieczającego nN dla obwodu (karta P0.7, §0.5).

    Cztery kryteria normatywne (Ib<=In<=Iz′, I2<=1,45·Iz′, zdolność wyłączania
    >= Ik″max, SWZ przy Ik_min) ocenione dla WSZYSTKICH kandydatów z katalogu
    (MCB/rozłącznik bezpiecznikowy+wkładka/wyłącznik nN); ranking
    deterministyczny (najmniejszy spełniający In). Ib/Iz′/Ik″max są
    parametrami wejściowymi (Ib z definicji normy jest wielkością projektową,
    Iz′ i Ik″max pochodzą z osobnych, już istniejących biegów/analiz — ten
    endpoint ich nie przelicza). Read-only; analiza interpretuje gotowe
    wyniki solverów i katalog.
    """
    enm = _get_enm(klucz)
    return wybierz_aparat_dla_obwodu_nn(
        enm=enm,
        station_ref=station_ref,
        bus_ref=bus_ref,
        ib_a=ib_a,
        iz_prime_a=iz_prime_a,
        ik_max_ka=ik_max_ka,
    )


def _resolve_run_for_sheet(
    *, case_id: str, run_id: str | None, param_name: str, expected_analysis_type: str
) -> Any | None:
    """Waliduj+rozwiąż bieg OPCJONALNY dla arkusza nN — wzorzec `quality_
    analysis_runs._require_run` (parsowanie UUID, przynależność do case,
    status FINISHED, rodzaj analizy), ale ``None`` (nie 404) gdy parametr
    pominięty — arkusz działa BEZ biegu (Ib „z tabliczki", reszta kolumn
    zależnych od biegu w trzecim stanie „brak danych")."""
    if run_id is None:
        return None
    try:
        parsed = UUID(run_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=422, detail=f"{param_name} musi być poprawnym UUID."
        ) from exc
    run = _get_canonical_run(parsed)
    if run is None:
        raise HTTPException(status_code=404, detail=f"Bieg {run_id} ({param_name}) nie istnieje.")
    if run.case_id != case_id:
        raise HTTPException(
            status_code=422,
            detail=f"Bieg {run_id} ({param_name}) należy do innego przypadku obliczeniowego.",
        )
    if run.status != "FINISHED":
        raise HTTPException(
            status_code=409,
            detail=f"Bieg {run_id} ({param_name}) nie jest zakończony (status={run.status}).",
        )
    if run.analysis_type != expected_analysis_type:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Bieg {run_id} ({param_name}) ma rodzaj analizy '{run.analysis_type}', "
                f"oczekiwano '{expected_analysis_type}'."
            ),
        )
    return run


@router.get("/{case_id}/enm/nn-circuit-sheet")
def get_nn_circuit_sheet(
    case_id: str,
    klucz: KluczTwin,
    station_ref: str,
    load_flow_run_id: str | None = None,
    short_circuit_run_id: str | None = None,
    fault_duration_s: float | None = None,
) -> dict[str, Any]:
    """Arkusz obliczeń obwodów nN klasy projektu wykonawczego (karta ARKUSZ-NN,
    docs/nn/ARKUSZ_OBLICZEN_NN_2026-08.md).

    Jeden wiersz PER ODPŁYW rozdzielnicy/stacji nN: Ib (z biegu rozpływu, gdy
    ``load_flow_run_id`` podany i biegu ma wynik dla obwodu, inaczej „z
    tabliczki" — źródło nazwane jawnie w wierszu), aparat/nastawy/zapas,
    Iz′ skorygowane, k2/I2, przewód/przekrój/γ, kryteria (i)/(ii),
    długość, ΔU odcinkowy/całkowity, Ik″max (``short_circuit_run_id``)/
    Ik1_min, SWZ, I²t (wymaga ``short_circuit_run_id`` I ``fault_duration_s``),
    status doboru — PROVENANCE per wiersz. Read-only; kompozycja gotowych
    dostawców (zero fizyki tutaj).

    ``load_flow_run_id``/``short_circuit_run_id`` OPCJONALNE — bez nich
    kolumny zależne od biegu dostają uczciwy trzeci stan „brak danych" z
    akcją naprawczą po stronie UI („uruchom bieg"), nie fabrykowaną liczbę.
    """
    enm = _get_enm(klucz)
    load_flow_run = _resolve_run_for_sheet(
        case_id=case_id,
        run_id=load_flow_run_id,
        param_name="load_flow_run_id",
        expected_analysis_type="PF",
    )
    short_circuit_run = _resolve_run_for_sheet(
        case_id=case_id,
        run_id=short_circuit_run_id,
        param_name="short_circuit_run_id",
        expected_analysis_type="short_circuit_sn",
    )
    return build_nn_circuit_sheet(
        enm=enm,
        station_ref=station_ref,
        load_flow_run=load_flow_run,
        short_circuit_run=short_circuit_run,
        fault_duration_s=fault_duration_s,
    )


class WytrzymaloscAparaturyRequestModel(BaseModel):
    """Prądy punktu zwarcia z WYNIKU biegu + stacja, w której ten punkt leży."""

    station_ref: str
    i_peak_ka: float | None = None
    i_thermal_ka: float | None = None
    #: Prąd zwarciowy początkowy [kA] — potrzebny WYŁĄCZNIE do wyznaczenia czasu
    #: wyłączenia z charakterystyki zabezpieczenia (poz. 3). Brak ⇒ czas z nastaw
    #: pozostaje nieustalony, zamiast być liczonym przy zgadniętym prądzie.
    ik_ka: float | None = None


@router.post("/{case_id}/enm/wytrzymalosc-aparatury")
def post_wytrzymalosc_aparatury(
    case_id: str, klucz: KluczTwin, body: WytrzymaloscAparaturyRequestModel, request: Request
) -> dict[str, Any]:
    """Werdykty wytrzymałości aparatury WSZYSTKICH pól stacji (KD-6 poz. 2-3).

    Aparaty biorą się z MODELU (pozycja katalogu APARAT_SN wskazana na polu),
    a zapisana konfiguracja stacji pozostaje nadrzędna tam, gdzie istnieje —
    każdy wiersz niesie jawne ``zrodlo``. Fizyka porównania siedzi w jądrze
    werdyktu K7-B; ten endpoint tylko zestawia źródła danych.
    """
    enm = _get_enm(klucz)
    project_id = _resolve_project_id(case_id, request)
    zapisana = _bay_device_withstand(project_id, body.station_ref, request)
    # Czas wyłączenia z NASTAW pól (KD-6 poz. 3) — konfiguracja stacji pozostaje
    # nadrzędna dla pól, które inżynier skonfigurował ręcznie.
    czasy = czasy_wylaczenia_pol_stacji(enm=enm, station_ref=body.station_ref, ik_ka=body.ik_ka)
    return zbuduj_widok_wytrzymalosci_aparatury(
        enm=enm,
        station_ref=body.station_ref,
        i_peak_ka=body.i_peak_ka,
        i_thermal_ka=body.i_thermal_ka,
        bay_device_withstand=zapisana,
        czasy_pol=czasy,
    )


def _bay_device_withstand(
    project_id: str | None, station_ref: str, request: Request
) -> dict[str, Any] | None:
    """Zapisana konfiguracja aparatury pól stacji (albo ``None``, gdy jej nie ma).

    Brak zapisu NIE jest błędem — od karty KD-6 werdykty powstają z modelu,
    a konfiguracja jest nadpisaniem inżyniera tam, gdzie je zrobił.
    """
    uow_factory = getattr(request.app.state, "uow_factory", None)
    if uow_factory is None or project_id is None:
        return None
    try:
        parsed_project_id = UUID(project_id)
    except ValueError:
        return None
    with uow_factory() as uow:
        # CV-4.2b: odczyt przez repozytorium (jedno miejsce zapytań o tę tabelę).
        row = uow.audit2_station_configs.get(parsed_project_id, station_ref)
        if row is None:
            return None
        return dict(row.bay_device_withstand or {})


# ---------------------------------------------------------------------------
# Engineering Readiness (aggregated UX endpoint)
# ---------------------------------------------------------------------------


@router.get("/{case_id}/engineering-readiness")
def get_engineering_readiness(case_id: str, klucz: KluczTwin) -> dict[str, Any]:
    """Agregacyjny endpoint inżynierskiej gotowości modelu.

    Łączy walidację + readiness + fix_action w jeden response
    dla Engineering Readiness Panel.
    NIE zmienia istniejącego /readiness — to nowy endpoint UX.
    Deterministyczny: ten sam ENM → identyczny wynik.
    """
    enm = _get_enm(klucz)
    validator = ENMValidator()
    validation = validator.validate(enm)
    readiness = validator.readiness(validation)

    issues_out: list[dict[str, Any]] = []
    for issue in validation.issues:
        item: dict[str, Any] = {
            "code": issue.code,
            "severity": issue.severity,
            "element_ref": issue.element_refs[0] if issue.element_refs else None,
            "element_refs": issue.element_refs,
            "message_pl": issue.message_pl,
            "wizard_step_hint": issue.wizard_step_hint,
            "suggested_fix": issue.suggested_fix,
            "fix_action": (issue.fix_action.model_dump(mode="json") if issue.fix_action else None),
        }
        # V12K-206 (karta F-K6, znalezisko Z8): DROGA kanonu do UI. Kanoniczny rejestr
        # kodow gotowosci nie mial dotad zadnego konsumenta w czasie dzialania — sygnal
        # szedl wylacznie z walidatora ENM, w innej przestrzeni nazw. Pola kanoniczne sa
        # ADDYTYWNE i wystepuja TYLKO tam, gdzie odwzorowanie jest rzetelne (ten sam
        # warunek); brak odwzorowania nie podstawia cudzej tresci.
        kanon = opis_kanoniczny(issue.code)
        if kanon is not None:
            item.update(kanon)
        issues_out.append(item)

    by_severity = empty_severity_counts()
    for issue in validation.issues:
        by_severity[issue.severity] = by_severity.get(issue.severity, 0) + 1

    return {
        "case_id": case_id,
        "enm_revision": enm.header.revision,
        "status": validation.status,
        "ready": readiness.ready,
        "validation": validation.model_dump(mode="json"),
        "readiness": readiness.model_dump(mode="json"),
        "issues": issues_out,
        "total_count": len(issues_out),
        "by_severity": by_severity,
        "analysis_available": validation.analysis_available.model_dump(mode="json"),
    }


# ---------------------------------------------------------------------------
# Analysis Eligibility Matrix (PR-17)
# ---------------------------------------------------------------------------


@router.get("/{case_id}/analysis-eligibility")
def get_analysis_eligibility(case_id: str, klucz: KluczTwin) -> dict[str, Any]:
    """Macierz zdolności uruchomienia analiz (eligibility).

    Dla każdego typu analizy (SC_3F, SC_2F, SC_1F, LOAD_FLOW) zwraca:
    - status: ELIGIBLE / INELIGIBLE
    - blockers, warnings, info
    - fix_actions (deklaratywne sugestie naprawcze)
    - content_hash (deterministyczny SHA-256)

    Niezależna od walidacji i readiness — osobna warstwa.
    Deterministyczny: identyczny ENM -> identyczny wynik.
    """
    enm = _get_enm(klucz)
    validator = ENMValidator()
    validation = validator.validate(enm)
    readiness = validator.readiness(validation)

    service = EligibilityService()
    matrix = service.compute_matrix(
        enm=enm,
        readiness=readiness,
        case_id=case_id,
    )

    return matrix.to_dict()


# ---------------------------------------------------------------------------
# Topology Summary (graph view)
# ---------------------------------------------------------------------------


@router.get("/{case_id}/enm/topology/summary")
def get_topology_summary(case_id: str, klucz: KluczTwin) -> dict[str, Any]:
    """Zwróć podsumowanie topologiczne: adjacency, spine, laterals.

    Używane przez Tree i SLD do wyświetlania struktury sieci.
    DETERMINISTYCZNE: ten sam ENM → identyczny wynik.
    """
    enm = _get_enm(klucz)
    enm_dict = enm.model_dump(mode="json")
    summary = compute_topology_summary(enm_dict)
    return {
        "case_id": case_id,
        "enm_revision": enm.header.revision,
        "bus_count": summary.bus_count,
        "branch_count": summary.branch_count,
        "transformer_count": summary.transformer_count,
        "source_count": summary.source_count,
        "load_count": summary.load_count,
        "generator_count": summary.generator_count,
        "measurement_count": summary.measurement_count,
        "protection_count": summary.protection_count,
        "is_radial": summary.is_radial,
        "has_cycles": summary.has_cycles,
        "adjacency": [
            {
                "bus_ref": e.bus_ref,
                "neighbor_ref": e.neighbor_ref,
                "via_ref": e.via_ref,
                "via_type": e.via_type,
            }
            for e in summary.adjacency
        ],
        "spine": [
            {
                "bus_ref": s.bus_ref,
                "depth": s.depth,
                "is_source": s.is_source,
                "children_refs": list(s.children_refs),
            }
            for s in summary.spine
        ],
        "lateral_roots": list(summary.lateral_roots),
    }


# ---------------------------------------------------------------------------
# Topology Operations (atomic graph CRUD)
# ---------------------------------------------------------------------------


class TopologyOpRequest(BaseModel):
    """Żądanie operacji topologicznej."""

    op: str = Field(
        ...,
        description="Typ operacji (create_node, update_node, delete_node, "
        "create_branch, update_branch, delete_branch, "
        "create_device, update_device, delete_device, "
        "create_measurement, delete_measurement, "
        "attach_protection, update_protection, detach_protection)",
    )
    data: dict[str, Any] = Field(default_factory=dict, description="Dane operacji")


_OP_DISPATCH = {
    "create_node": lambda enm, data: create_node(enm, data),
    "update_node": lambda enm, data: update_node(enm, data),
    "delete_node": lambda enm, data: delete_node(enm, data.get("ref_id", "")),
    "create_branch": lambda enm, data: create_branch(enm, data),
    "update_branch": lambda enm, data: update_branch(enm, data),
    "delete_branch": lambda enm, data: delete_branch(enm, data.get("ref_id", "")),
    "create_device": lambda enm, data: create_device(enm, data),
    "update_device": lambda enm, data: update_device(enm, data),
    "delete_device": lambda enm, data: delete_device(
        enm,
        data.get("device_type", ""),
        data.get("ref_id", ""),
    ),
    "create_measurement": lambda enm, data: create_measurement(enm, data),
    "delete_measurement": lambda enm, data: delete_measurement(enm, data.get("ref_id", "")),
    "attach_protection": lambda enm, data: attach_protection(enm, data),
    "update_protection": lambda enm, data: update_protection(enm, data),
    "detach_protection": lambda enm, data: detach_protection(enm, data.get("ref_id", "")),
}


@router.post("/{case_id}/enm/ops")
def topology_ops(case_id: str, klucz: KluczTwin, req: TopologyOpRequest) -> dict[str, Any]:
    """Atomic topology operation: validate → mutate → persist.

    Supports: create/update/delete for nodes, branches, devices,
    measurements, and protection assignments.
    Returns operation result with issues and updated ENM revision.

    WSPÓŁBIEŻNOŚĆ: blokada obejmuje CAŁY cykl odczyt → mutacja → zapis (patrz
    `domain_ops`). Końcówka jest dziś wyłączona z routera produkcyjnego
    (`_PRODUCTION_DISABLED_ROUTE_KEYS`), ale cykl jest ten sam, więc blokada
    stoi tu razem z pozostałymi — inaczej ponowne włączenie trasy wniosłoby
    z powrotem cichą utratę pracy.
    """
    handler = _OP_DISPATCH.get(req.op)
    if not handler:
        raise HTTPException(
            status_code=400,
            detail=f"Nieznana operacja: '{req.op}'. "
            f"Dostępne: {', '.join(sorted(_OP_DISPATCH.keys()))}",
        )

    with blokada_twin(klucz):
        return _topology_ops_pod_blokada(klucz, req, handler)


def _topology_ops_pod_blokada(
    klucz: str,
    req: TopologyOpRequest,
    handler: Any,
) -> dict[str, Any]:
    enm = _get_enm(klucz)
    enm_dict = enm.model_dump(mode="json")

    result = handler(enm_dict, req.data)

    if result.success:
        saved = _set_enm(klucz, EnergyNetworkModel.model_validate(result.enm))
        return {
            "success": True,
            "op": req.op,
            "created_ref": result.created_ref,
            "issues": [
                {
                    "code": i.code,
                    "severity": i.severity,
                    "message_pl": i.message_pl,
                    "element_ref": i.element_ref,
                }
                for i in result.issues
            ],
            "revision": saved.header.revision,
        }

    return {
        "success": False,
        "op": req.op,
        "created_ref": None,
        "issues": [
            {
                "code": i.code,
                "severity": i.severity,
                "message_pl": i.message_pl,
                "element_ref": i.element_ref,
            }
            for i in result.issues
        ],
        "revision": enm.header.revision,
    }


class BatchOpsRequest(BaseModel):
    """Żądanie wielu operacji topologicznych (batch)."""

    operations: list[TopologyOpRequest] = Field(
        ..., description="Lista operacji do wykonania sekwencyjnie"
    )


@router.post("/{case_id}/enm/ops/batch")
def topology_ops_batch(case_id: str, klucz: KluczTwin, req: BatchOpsRequest) -> dict[str, Any]:
    """Batch topology operations: execute sequentially, rollback all on BLOCKER.

    Each operation is applied sequentially on the result of the previous one.
    If any operation fails with BLOCKER, ALL operations are rolled back.

    WSPÓŁBIEŻNOŚĆ: blokada obejmuje CAŁY cykl (patrz `domain_ops`). Tu jest to
    szczególnie istotne, bo cykl obejmuje CAŁĄ serię operacji — bez blokady
    równoległy zapis wchodził w środek serii, a jej rollback i tak odtwarzał
    model sprzed serii, kasując cudzą pracę.
    """
    with blokada_twin(klucz):
        return _topology_ops_batch_pod_blokada(klucz, req)


def _topology_ops_batch_pod_blokada(klucz: str, req: BatchOpsRequest) -> dict[str, Any]:
    enm = _get_enm(klucz)
    enm_dict = enm.model_dump(mode="json")

    results: list[dict[str, Any]] = []
    current_enm = enm_dict

    for op_req in req.operations:
        handler = _OP_DISPATCH.get(op_req.op)
        if not handler:
            return {
                "success": False,
                "results": results,
                "error": f"Nieznana operacja: '{op_req.op}'",
                "revision": enm.header.revision,
            }

        result = handler(current_enm, op_req.data)
        op_result = {
            "op": op_req.op,
            "success": result.success,
            "created_ref": result.created_ref,
            "issues": [
                {
                    "code": i.code,
                    "severity": i.severity,
                    "message_pl": i.message_pl,
                    "element_ref": i.element_ref,
                }
                for i in result.issues
            ],
        }
        results.append(op_result)

        if not result.success:
            # Rollback: return original ENM
            return {
                "success": False,
                "results": results,
                "error": f"Operacja '{op_req.op}' nie powiodła się — rollback",
                "revision": enm.header.revision,
            }

        current_enm = result.enm

    # All operations succeeded — persist
    saved = _set_enm(klucz, EnergyNetworkModel.model_validate(current_enm))
    return {
        "success": True,
        "results": results,
        "error": None,
        "revision": saved.header.revision,
    }


# ---------------------------------------------------------------------------
# Wizard step controller endpoints
# ---------------------------------------------------------------------------


@router.get("/{case_id}/wizard/state")
def get_wizard_state(case_id: str, klucz: KluczTwin) -> dict[str, Any]:
    """Return full wizard state for case (deterministic).

    Computes K1-K10 step states, readiness matrix, element counts.
    Used for restoring wizard state after refresh / deep-link.
    """
    from application.network_wizard.validator import validate_wizard_state

    enm = _get_enm(klucz)
    enm_dict = enm.model_dump(mode="json")
    ws = validate_wizard_state(enm_dict)
    return ws.model_dump(mode="json")


@router.post("/{case_id}/wizard/apply-step")
def wizard_apply_step(
    case_id: str, klucz: KluczTwin, req: WizardStepRequestModel
) -> dict[str, Any]:
    """Atomic step application: preconditions → mutate → postconditions.

    If preconditions fail → original ENM unchanged, success=False.
    If postconditions fail → rollback, original ENM unchanged, success=False.
    On success → ENM saved with revision++, returns new wizard state.

    WSPÓŁBIEŻNOŚĆ: blokada obejmuje CAŁY cykl (patrz `domain_ops`). Deklarowana
    atomowość kroku („preconditions → mutate → postconditions") jest prawdziwa
    tylko wtedy, gdy nikt nie zapisze modelu między odczytem a zapisem.
    """
    with blokada_twin(klucz):
        return _wizard_apply_step_pod_blokada(klucz, req)


def _wizard_apply_step_pod_blokada(klucz: str, req: WizardStepRequestModel) -> dict[str, Any]:
    from application.network_wizard.schema import ApplyStepResponse
    from application.network_wizard.step_controller import apply_step as ctrl_apply_step
    from application.network_wizard.validator import validate_wizard_state

    enm = _get_enm(klucz)
    enm_dict = enm.model_dump(mode="json")

    result = ctrl_apply_step(enm_dict, req.step_id, req.data)

    if result.success:
        # Persist mutated ENM
        saved = _set_enm(klucz, EnergyNetworkModel.model_validate(result.enm))
        saved_dict = saved.model_dump(mode="json")
        ws = validate_wizard_state(saved_dict)
        return ApplyStepResponse(
            success=True,
            step_id=result.step_id,
            precondition_issues=result.precondition_issues,
            postcondition_issues=result.postcondition_issues,
            can_proceed=result.can_proceed,
            current_step=result.current_step,
            next_step=result.next_step,
            revision=saved.header.revision,
            wizard_state=ws,
        ).model_dump(mode="json")

    # Failure: return issues, ENM unchanged
    ws = validate_wizard_state(enm_dict)
    return ApplyStepResponse(
        success=False,
        step_id=result.step_id,
        precondition_issues=result.precondition_issues,
        postcondition_issues=result.postcondition_issues,
        can_proceed=False,
        current_step=result.current_step,
        next_step=result.next_step,
        revision=enm.header.revision,
        wizard_state=ws,
    ).model_dump(mode="json")


@router.get("/{case_id}/wizard/can-proceed")
def wizard_can_proceed(
    case_id: str, klucz: KluczTwin, from_step: str = "K1", to_step: str = "K2"
) -> dict[str, Any]:
    """Check if step transition is allowed.

    Forward transitions require no BLOCKER in current step
    and no BLOCKER preconditions for target step.
    Backward transitions are always allowed.
    """
    from application.network_wizard.schema import CanProceedResponse
    from application.network_wizard.step_controller import (
        can_proceed as ctrl_can_proceed,
    )

    enm = _get_enm(klucz)
    enm_dict = enm.model_dump(mode="json")
    result = ctrl_can_proceed(from_step, to_step, enm_dict)
    return CanProceedResponse(
        allowed=result.allowed,
        from_step=result.from_step,
        to_step=result.to_step,
        blocking_issues=result.blocking_issues,
    ).model_dump(mode="json")


# ---------------------------------------------------------------------------
# Domain Operations (canonical V1 — semantic network building ops)
# ---------------------------------------------------------------------------


class DomainOpPayloadModel(BaseModel):
    """Payload operacji domenowej."""

    name: str = Field(..., description="Kanoniczna nazwa operacji")
    idempotency_key: str = Field("", description="Klucz idempotencji")
    payload: dict[str, Any] = Field(default_factory=dict)


class DomainOpEnvelopeModel(BaseModel):
    """Wspólny envelope wywołania operacji domenowej."""

    project_id: str = ""
    snapshot_base_hash: str = ""
    operation: DomainOpPayloadModel


#: Kolekcje migawki, w których element może nieść `materialized_params`.
_KOLEKCJE_Z_TABLICZKA: tuple[str, ...] = (
    "branches",
    "buses",
    "generators",
    "loads",
    "measurements",
    "protection_assignments",
    "shunt_capacitors",
    "surge_arresters",
    "transformers",
)


def rozbieznosc_wobec_bramy(
    pola_bramy: dict[str, Any],
    wiazanie: dict[str, Any] | None,
    migawka: Any,
    dotkniete_elementy: Any = None,
) -> dict[str, Any] | None:
    """Wynik bramy katalogowej MUSI trafić do modelu — inaczej brama jest teatrem.

    DŁUG, KTÓRY TO ZAMYKA (przegląd fali 2026-08-01, znalezisko P12, klaster G):
    `validate_and_materialize_catalog_binding` zwracała ZMATERIALIZOWANE pola
    pozycji katalogowej (np. prawdziwe `un_kv = 15 kV` falownika), a wołający
    WYRZUCAŁ je (`policy_error, _ = ...`) i przekazywał payload bez zmian. Brama
    znała prawdę i milczała — operacja zapisywała do migawki tabliczkę
    z przeglądarki pod `source_mode: KATALOG`.

    PREDYKATY PARAMI: brama materializuje pozycję PRZED operacją, a operacja
    materializuje ją ponownie, zapisując do migawki. Dwa niezależne odczyty, które
    „dziś się zgadzają", są defektem czekającym na dane brzegowe — dlatego tu
    porównujemy je wprost, TĄ SAMĄ funkcją, której operacja używa do weryfikacji
    tabliczki z payloadu (`enm.domain_operations_v2.rozbieznosci_tabliczki`).
    Rozbieżność ⇒ 422 i BRAK zapisu (kontrola stoi przed utrwaleniem migawki).

    ZAKRES: wyłącznie elementy, które TA operacja utworzyła albo zmieniła
    (`dotkniete_elementy`). Bez tego zawężenia jeden zastany element z zepsutą
    tabliczką (zapisany, zanim brama zaczęła działać) blokowałby KAŻDĄ kolejną
    operację wiążącą tę samą pozycję katalogową — kontrola pilnuje bieżącego
    zapisu, a nie długu poprzednich rewizji.

    Zwraca treść błędu HTTP albo ``None``, gdy brama i model mówią to samo.
    """
    from enm.domain_operations_v2 import rozbieznosci_tabliczki

    if not pola_bramy or not isinstance(migawka, dict) or not isinstance(wiazanie, dict):
        return None
    pozycja = wiazanie.get("catalog_item_id")
    if not isinstance(pozycja, str) or not pozycja.strip():
        return None
    pozycja = pozycja.strip()
    zakres = {ref for ref in (dotkniete_elementy or ()) if isinstance(ref, str)}
    if not zakres:
        return None

    rozbieznosci: list[str] = []
    for kolekcja in _KOLEKCJE_Z_TABLICZKA:
        for element in migawka.get(kolekcja) or []:
            if not isinstance(element, dict) or element.get("ref_id") not in zakres:
                continue
            tabliczka = element.get("materialized_params")
            if not isinstance(tabliczka, dict) or not tabliczka:
                continue
            if (
                tabliczka.get("catalog_item_id") != pozycja
                and element.get("catalog_ref") != pozycja
            ):
                continue
            for opis in rozbieznosci_tabliczki(tabliczka, pola_bramy, etykieta_deklaracji="model"):
                rozbieznosci.append(f"{element.get('ref_id')}: {opis}")

    if not rozbieznosci:
        return None
    return {
        "code": "catalog.gate_result_mismatch",
        "message_pl": (
            f"Model zapisałby dla pozycji katalogowej '{pozycja}' wartości inne niż "
            "zmaterializowane przez bramę katalogową: "
            + "; ".join(sorted(rozbieznosci))
            + ". Operacja została odrzucona, model pozostał bez zmian."
        ),
        "errors": [
            {"code": "catalog.gate_result_mismatch", "message_pl": opis}
            for opis in sorted(rozbieznosci)
        ],
    }


@router.post("/{case_id}/enm/domain-ops")
def domain_ops(case_id: str, klucz: KluczTwin, req: DomainOpEnvelopeModel) -> dict[str, Any]:
    """Kanoniczny endpoint operacji domenowych V1.

    Wspólny kontrakt dla wszystkich operacji budowy sieci SN:
    add_grid_source_sn, continue_trunk_segment_sn,
    insert_station_on_segment_sn, start_branch_segment_sn,
    insert_section_switch_sn, connect_secondary_ring_sn,
    set_normal_open_point, add_transformer_sn_nn,
    assign_catalog_to_element, update_element_parameters.

    Odpowiedź zawiera: snapshot, readiness, fix_actions, changes,
    selection_hint, audit_trail, domain_events.

    WSPÓŁBIEŻNOŚĆ (znalezisko P5 przeglądu fali 2026-08-01). Blokada obejmuje CAŁY
    cykl odczyt → operacja domenowa → zapis, a nie sam zapis: blokada założona
    dopiero na `_set_enm` nie pomaga, bo stary model został odczytany wcześniej.
    Bez niej ta końcówka (`async def`, pętla zdarzeń) gubiła pracę zatwierdzenia
    szablonu stacji (`def`, pula wątków Starlette) biegnącego równolegle na tym
    samym przypadku — obie końcówki meldowały `HTTP 200`, a w modelu zostawał
    dorobek tylko jednej, przy czym druga zwracała `created_element_ids`
    wskazujące na byty, których w zapisanej migawce NIE MA.

    `snapshot_base_hash` nie jest tu obroną: porównuje hash z modelem odczytanym
    w tej samej funkcji (chwila ODCZYTU, nie zapisu), więc nie jest to
    compare-and-swap, a produkcyjni wołający wysyłają pusty łańcuch.

    Zamiana na `def` NIE jest naprawą wyścigu — przenosi go tylko z pętli zdarzeń
    do puli wątków. Blokada jest per przypadek obliczeniowy, więc operacje na
    RÓŻNYCH przypadkach nadal biegną równolegle.
    """
    with blokada_twin(klucz):
        return _domain_ops_pod_blokada(case_id, klucz, req)


def _domain_ops_pod_blokada(case_id: str, klucz: str, req: DomainOpEnvelopeModel) -> dict[str, Any]:
    from enm.domain_operations import execute_domain_operation

    enm = _get_enm(klucz)
    enm_dict = enm.model_dump(mode="json")

    # Walidacja snapshot_base_hash (optimistic concurrency)
    current_hash = enm.header.hash_sha256
    if req.snapshot_base_hash and req.snapshot_base_hash != current_hash:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Konflikt wersji: oczekiwany hash '{req.snapshot_base_hash}', "
                f"aktualny '{current_hash}'. Odśwież snapshot i spróbuj ponownie."
            ),
        )

    resolved_name = resolve_operation_name(req.operation.name)
    policy_error, pola_bramy = validate_and_materialize_catalog_binding(
        resolved_name,
        req.operation.payload,
    )
    if policy_error:
        raise HTTPException(
            status_code=422,
            detail={
                "code": policy_error.code,
                "message_pl": policy_error.message_pl,
                "errors": policy_error.errors,
            },
        )

    result = execute_domain_operation(
        enm_dict=enm_dict,
        op_name=req.operation.name,
        payload=req.operation.payload,
    )

    zmiany_operacji = result.get("changes") or {}
    rozbieznosc_bramy = rozbieznosc_wobec_bramy(
        pola_bramy,
        extract_catalog_binding(resolved_name, req.operation.payload),
        result.get("snapshot"),
        [
            *(zmiany_operacji.get("created_element_ids") or ()),
            *(zmiany_operacji.get("updated_element_ids") or ()),
        ],
    )
    if rozbieznosc_bramy is not None:
        raise HTTPException(status_code=422, detail=rozbieznosc_bramy)

    if result.get("adapter_only"):
        if result.get("attach_field_view"):
            result["field_view"] = build_field_read_model(case_id, enm)
        if result.get("attach_protection_view"):
            result["protection_view"] = build_protection_read_model(case_id, enm)
        return result

    # Persist if operation succeeded (snapshot present and valid)
    if result.get("snapshot") and not result.get("error"):
        try:
            new_enm = EnergyNetworkModel.model_validate(result["snapshot"])
            # V12K-264: PRZYCZYNA nowej rewizji idzie do dziennika zmian razem ze
            # snapshotem. Nazwa operacji jest KANONICZNA (`resolve_operation_name`
            # rozwiazuje aliasy), a listy elementow pochodza wprost z `changes`
            # zwroconych przez operacje — nic tu nie jest wyliczane ani zgadywane.
            # CV-2: dziennik niesie takze PELNY ladunek komendy — dokladnie to, co
            # przyszlo w zadaniu operacji, bez przepisywania i bez wyboru pol.
            # Nazwa operacji i listy elementow nie wystarczaly, zeby odtworzyc, CO
            # projektant zrobil (dwie operacje o tej samej nazwie na tym samym
            # elemencie roznia sie wylacznie ladunkiem).
            zmiany = result.get("changes") or {}
            zrodlo = ZrodloZmiany(
                operacja=resolved_name,
                utworzone=tuple(zmiany.get("created_element_ids") or ()),
                zmienione=tuple(zmiany.get("updated_element_ids") or ()),
                usuniete=tuple(zmiany.get("deleted_element_ids") or ()),
                ladunek=req.operation.payload,
            )
            saved = _set_enm(klucz, new_enm, zrodlo_zmiany=zrodlo)
            result["snapshot"] = saved.model_dump(mode="json")
        except Exception:
            # Szczegół techniczny (typ wyjątku, ścieżka pliku) idzie do dziennika
            # serwera, nie do komunikatu inżyniera — dotychczasowe f"...{e}"
            # wypychało na ekran bezwzględną ścieżkę systemu plików backendu
            # (ta sama klasa co template.persist_failed w apply.py, defekt D4).
            logger.exception("Zapis modelu po operacji domenowej nie powiódł się")
            result["error"] = (
                "Nie udało się zapisać modelu sieci — model pozostał bez zmian. "
                "Powtórz operację; szczegóły są w dzienniku serwera."
            )
            result["error_code"] = "api.snapshot_validation_failed"
            result["snapshot"] = None

    # CV-2-W: po udanym zapisie NIE unieważniamy niczego. Nowa rewizja modelu
    # SAMA czyni wyniki nieaktualnymi, bo świeżość jest WYPROWADZANA z koperty
    # rewizji biegu (`application/result_freshness.py`), a nie z osobnego stanu,
    # który ktoś musiał pamiętać przestawić. Poprzednia wersja wołała tu
    # `ResultInvalidator` — i była to jedyna obrona przed „plakietką, która
    # kłamie", więc każda ścieżka zapisu pominięta w tym wywołaniu (kreator,
    # zmiana typu katalogowego) zostawiała wynik oznaczony jako aktualny.

    return result


_PRODUCTION_DISABLED_ROUTE_KEYS = {
    ("/api/cases/{case_id}/enm", "PUT"),
    ("/api/cases/{case_id}/enm/ops", "POST"),
    ("/api/cases/{case_id}/enm/ops/batch", "POST"),
    ("/api/cases/{case_id}/wizard/apply-step", "POST"),
}


def _build_production_router() -> APIRouter:
    production = APIRouter()
    for route in router.routes:
        path = getattr(route, "path", "")
        methods = set(getattr(route, "methods", set()))
        if any((path, method) in _PRODUCTION_DISABLED_ROUTE_KEYS for method in methods):
            continue
        production.routes.append(route)
    return production


production_router = _build_production_router()
