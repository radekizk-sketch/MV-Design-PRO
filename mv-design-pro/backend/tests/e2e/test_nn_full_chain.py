"""Bramka końcowa P0 modułu nN — test E2E pełnego łańcucha (§80 zlecenia, plan H).

Substrat: GPZ 15 kV → sieć SN → stacja ST-03 → TR 15/0,4 → RGnN → K1 → R1
(podrozdzielnica) → {K2 → Skrzynka K2 (aparat MCB) → Silnik M1 (odbiór, P0
uproszczenie), K3 → Odbiór K3, K4 → PV, K5 → BESS}. Budowa WYŁĄCZNIE operacjami
domenowymi kanonicznymi, przez PUBLICZNY produkcyjny tor zapisu
(`POST /api/cases/{case_id}/enm/domain-ops` — zgodnie z `api/enm.py` jest to
JEDYNY produkcyjny tor zapisu ENM; `/enm/ops`/`/enm/ops/batch` są wyłączone w
`_PRODUCTION_DISABLED_ROUTE_KEYS`). Dziesięć kroków łańcucha to OSOBNE metody
testowe wykonywane w wymuszonej kolejności (nazwy `test_krok_NN_*`, pytest
zachowuje kolejność deklaracji w pliku — brak w projekcie pluginu losującego
kolejność, zob. `pyproject.toml::[tool.pytest.ini_options]`), tak by czerwień
wskazywała KTÓRY krok łańcucha pękł.

Każdy krok czyta/pisze przez PUBLICZNE ścieżki: kanoniczny dispatcher operacji
domenowych przez TestClient (budowa modelu), `enm.canonical_analysis.
run_power_flow_now` / `run_short_circuit_now` (te same funkcje, których używają
`POST /runs/power-flow` i `POST /runs/short-circuit`), oraz publiczne serwisy
warstwy `application/analyses/*` (te same, których używają GET-y
`/enm/fault-loop-point`, `/enm/swz`, `/enm/nn-device-selection`) i
`POST /api/nn-proof/circuit/pack|report`. Zero sięgania po prywatne
`_execute_*`.

ZNALEZISKO BRAMKI (dokumentowane, NIE naprawiane w tym pliku — karta zakazuje
zmian w `src/`): katalog kabli nN (`network_model/catalog/mv_auxiliary_
catalog.py`, WSZYSTKIE 17 pozycji `kab_nn_*`) nie ma danych żyły powrotnej
PE/PEN (`return_conductor_r_ohm_per_km_20c` / `return_conductor_x_ohm_per_km`
— oba `None` dla każdej pozycji, zweryfikowane pomiarem). `application.
analyses.fault_loop.route.route_segments`/`route_segments_min_scenario` są
fail-closed (§0.1 karty P0.6, „zero fabrykacji") i podnoszą
`RouteExtractionError`, gdy KTÓRYKOLWIEK kabel na trasie nie ma tych dwóch pól.
Skutek: pętla zwarcia w DOWOLNYM punkcie nN poza szyną nN transformatora
(`build_fault_loop_view_at_point`, `build_feeder_fault_loop_view`), SWZ
(`build_swz_view`) i dobór zabezpieczeń (`wybierz_aparat_dla_obwodu_nn`) —
oraz pakiet dowodowy LV_CIRCUIT_VERIFICATION, który wewnętrznie odtwarza TĘ
SAMĄ ścieżkę (`lv_circuit_verification_binding._petla_zwarcia_min`) — są
zablokowane dla KAŻDEGO odbioru/aparatu za choćby jednym kablem nN. Działa
wyłącznie wariant zerohopowy „u źródła" (`build_station_fault_loop_view`,
fault_node_id == szyna nN transformatora, trasa bez kabla). Testy krok_05/07/10
asertują ten HONEST stan (status „brak danych" z konkretnym powodem) jako
POPRAWNE zachowanie fail-closed przy obecnych danych katalogowych — to dowód,
że mechanizm działa, nie że dane są kompletne. Werdykt bramki końcowej: P0 nN
integracja NIE JEST w pełni gotowa (plan H, sekcja „Bramka końcowa P0" — „Jeżeli
którykolwiek krok nie działa na jednym modelu — integracja nN NIE JEST
GOTOWA").

DRUGIE ZNALEZISKO BRAMKI (dokumentowane, NIE naprawiane w tym pliku): brama
katalogowa produkcyjnego API (`api/domain_ops_policy.py::
CATALOG_REQUIRED_OPERATIONS`) wymaga `catalog_binding`/`catalog_ref` dla
`add_nn_outgoing_field` i `add_nn_load`, ale realny kreator „Pole odpływowe nN"
(`ui2/kreatory/pole-nn/KreatorPolaNn.tsx`, docstring: „kreator NIE POKAZUJE
pickera katalogu — backend go dla tej operacji nie honoruje") NIGDY go nie
wysyła — realne przesłanie tego formularza przez produkcyjny endpoint
dostałoby `422 catalog.ref_required`. Test poniżej dodaje `catalog_ref`
ręcznie (wzorem `tests/api/test_brama_katalogowa_api_inwentarz.py`), żeby w
ogóle przejść bramę — kontrakt frontend/backend jest rozjechany.

TRZECIE ZNALEZISKO BRAMKI (dokumentowane, wykryte i USUNIĘTE z substratu w
KROK 0, żeby kroki 1-11 liczyły zamierzony model — patrz
`_usun_fantomowe_odbiory_migracji`): `enm.catalog_completion.
complete_station_loads_from_nn_feeders` uruchamia się na KAŻDYM odczycie
`enm.store.get_enm` i materializuje domyślny odbiór 30 kW na KAŻDYM polu
odpływowym nN bez WŁASNEGO odbioru — W CHWILI ODCZYTU, nie po zakończeniu
edycji użytkownika. Ponieważ jedyny możliwy w tym systemie tor tworzenia pola
i jego odbioru to DWIE OSOBNE operacje domenowe (`add_nn_outgoing_field` →
`add_nn_load`, dwa osobne żądania `POST /domain-ops`, każde zaczynające się od
`_get_enm`), drugie żądanie zawsze odczytuje model PO tym, jak pierwsze już
zmaterializowało fantom na TYM SAMYM `feeder_ref` — prawdziwy odbiór ląduje
OBOK fantomu (podwojona moc na jednej szynie, bez żadnego ostrzeżenia).
Zmierzone powtarzalnie (patrz reprodukcja w `_usun_fantomowe_odbiory_migracji`
i jej wywołania w `_build_substrate`).

CZWARTE ZNALEZISKO BRAMKI (dokumentowane, NIE naprawiane w tym pliku, pełna
reprodukcja w `test_krok_07_dobor_zabezpieczen_zerohop_mechanizm_dziala`):
`wybierz_aparat_dla_obwodu_nn` NIE MOŻE dziś wydać pełnej rekomendacji dla
ŻADNEGO obwodu w ŻADNEJ sieci nN zbudowanej z domyślnego katalogu — nawet
u źródła (zero-hop, jedyny punkt gdzie Ik1_min jest w ogóle policzalny, patrz
ZNALEZISKO #1), gdzie Ik″max jest z definicji NAJWYŻSZY w całej sieci nN
(tu: 8,395 kA). Żadna z 3 rodzin katalogu nie kwalifikuje się na tym poziomie:
MCB — zdolność wyłączania zaszyta na 6 kA (`_MCB_ICN_KA`) < 8,395 kA; MCCB —
kryterium I2 NIEROZSTRZYGALNE (brak nastaw wyzwalacza Ir/Isd/Ii, zero
fabrykacji, `_kryterium_i2`); wkładka gG — kryterium SWZ NIEROZSTRZYGALNE
(brak bramek I-t wkładki, `i2t_prearc_a2s=None` dla WSZYSTKICH 30 pozycji
`fuse_nn_gg_*`). Test asertuje mechanizm (poprawne, zróżnicowane uzasadnienie
per rodzinę/kryterium), nie fabrykuje rekomendacji, której system dziś nie
potrafi wydać.
"""

from __future__ import annotations

import hashlib
import importlib.util
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

import pytest

FASTAPI_AVAILABLE = importlib.util.find_spec("fastapi") is not None
SQLALCHEMY_AVAILABLE = importlib.util.find_spec("sqlalchemy") is not None

from analysis.voltage_profile.segment_decomposition import (
    VoltageProfileSegmentBuilder,
    find_worst_nn_path,
)
from application.analyses.fault_loop.service import (
    build_fault_loop_view_at_point,
    build_feeder_fault_loop_view,
    build_station_fault_loop_view,
)
from application.analyses.nn_device_selection import wybierz_aparat_dla_obwodu_nn
from application.analyses.swz.service import build_swz_view
from enm.canonical_analysis import CanonicalRun, run_power_flow_now, run_short_circuit_now
from enm.hash import compute_enm_hash
from enm.mapping import map_enm_to_network_graph, ref_to_graph_id
from enm.models import EnergyNetworkModel
from enm.store import get_enm, reset_enm_store
from network_model.solvers.cable_ampacity_derating import (
    obciazalnosc_skorygowana,
    wspolczynniki_nn,
)
from network_model.solvers.power_flow_newton import solve_power_flow_physics
from network_model.solvers.power_flow_result import build_power_flow_result_v1
from network_model.solvers.power_flow_types import (
    PowerFlowInput,
    PowerFlowOptions,
    PQSpec,
    SlackSpec,
)

# ---------------------------------------------------------------------------
# Pozycje katalogowe (§0.1: katalog-first, żadna wymyślona)
# ---------------------------------------------------------------------------

REF_ZRODLO_SN = "src-gpz-15kv-250mva-rx010"
REF_KABEL_SN = "cable-tfk-yakxs-3x120"
REF_APARAT_POLA_SN = "sw-cb-abb-vd4-17kv-630a"
REF_TRANSFORMATOR = "tr-sn-nn-15-04-1250kva-dyn11"
REF_KABEL_NN = "kab_nn_4x120_al"  # YAKY 4x120 Al, i_max_a=240 A
REF_KABEL_NN_MNIEJSZY = "kab_nn_yaky_4x95_al"  # do KROK 8 (zmiana kabla)
REF_MCB_K2 = "mcb_nn_c25a"  # MCB C25, 6 kA
REF_PV = "conv-pv-nn-0p5mw-0p4kv"
REF_BESS = "conv-bess-nn-0p5mw-0p4kv"

#: Stan współdzielony między kolejnymi krokami TEGO PLIKU (jeden model, jeden
#: przebieg testu — kroki 1-11 czytają artefakty poprzednich kroków zamiast
#: przeliczać je drugi raz). Moduł importowany raz na proces pytest, więc ten
#: słownik żyje dokładnie tak długo jak sesja testowa.
_STAN: dict[str, Any] = {}
_REFS: dict[str, Any] = {}
_CASE_ID = f"nn-e2e-fullchain-{uuid4()}"


# ---------------------------------------------------------------------------
# Fixture TestClient — lokalna kopia wzorca `tests/api/conftest.py::app_client`
# (ten katalog to `tests/e2e/`, więc fixture sąsiada nie jest widoczna przez
# łańcuch conftest — `uow_factory` pochodzi z korzenia `tests/conftest.py`,
# dostępnego wszędzie).
# ---------------------------------------------------------------------------


@pytest.fixture()
def app_client(uow_factory):
    if not FASTAPI_AVAILABLE:
        pytest.skip("fastapi nie jest dostępne w środowisku testowym")
    if not SQLALCHEMY_AVAILABLE:
        pytest.skip("sqlalchemy nie jest dostępne w środowisku testowym")

    from api.dependencies import get_uow_factory
    from api.main import app
    from fastapi.testclient import TestClient

    def _override_get_uow_factory():
        return uow_factory

    app.dependency_overrides[get_uow_factory] = _override_get_uow_factory
    app.state.uow_factory = uow_factory
    client = TestClient(app)
    try:
        yield client
    finally:
        app.dependency_overrides.pop(get_uow_factory, None)
        app.state.uow_factory = None
        client.close()


# ---------------------------------------------------------------------------
# Budowa substratu — WYŁĄCZNIE operacje domenowe kanoniczne, przez PUBLICZNY
# produkcyjny tor zapisu (`POST /api/cases/{case_id}/enm/domain-ops`).
# ---------------------------------------------------------------------------


def _op(client, case_id: str, name: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Wywołaj operację domenową przez produkcyjny endpoint i zweryfikuj sukces."""
    resp = client.post(
        f"/api/cases/{case_id}/enm/domain-ops",
        json={
            "project_id": "",
            "snapshot_base_hash": "",
            "operation": {"name": name, "idempotency_key": "", "payload": payload},
        },
    )
    assert resp.status_code == 200, f"{name}: HTTP {resp.status_code} — {resp.text[:500]}"
    body = resp.json()
    assert not body.get("error"), f"{name}: {body.get('error')} ({body.get('error_code')})"
    return body


def _usun_fantomowe_odbiory_migracji(client, case_id: str) -> list[str]:
    """ZNALEZISKO BRAMKI (dokumentowane w raporcie końcowym, NIE naprawiane w
    `src/` — karta zakazuje): `enm.catalog_completion.
    complete_station_loads_from_nn_feeders` odpala się na KAŻDYM odczycie
    `enm.store.get_enm(case_id)` i dokłada domyślny odbiór 30 kW/cosφ=0,92
    (`meta.completion_source == "station_catalog_migration"`) do KAŻDEGO pola
    odpływowego nN (`bay_role == "FEEDER"`) bez WŁASNEGO odbioru — W TYM
    CHWILI ODCZYTU, nie po zakończeniu edycji. Realny, jedyny możliwy w tym
    systemie tor użytkownika tworzy pole odpływowe i jego odbiór jako DWIE
    OSOBNE operacje domenowe (`add_nn_outgoing_field` → `add_nn_load`, dwa
    osobne żądania `POST /domain-ops`) — a KAŻDE żądanie zaczyna się od
    `_get_enm(case_id)` (`api/enm.py::_domain_ops_pod_blokada`). Skutek
    zmierzony (`tests/e2e/…/probe14_exact_substrate.py`, powtarzalny):
    żądanie `add_nn_load` odczytuje model PO tym, jak żądanie tworzące pole
    już wywołało pełne materializowanie fantomu na TYM SAMYM `feeder_ref` —
    prawdziwy odbiór projektanta ląduje NA TEJ SAMEJ szynie OBOK fantomu,
    dając DWA odbiory tam, gdzie miał być jeden (podwojona moc czynna/bierna
    w rozpływie i zwarciu, bez ŻADNEGO ostrzeżenia). Osobno: KAŻDA stacja
    utworzona przez `insert_station_on_segment_sn` dostaje WBUDOWANY domyślny
    „Odpływ nN 1" (starter dla kreatora) — ten SAM mechanizm dokłada mu
    fantomowy odbiór, zanim projektant zdąży cokolwiek na niego podpiąć.

    Ta funkcja PRZYWRACA zamierzony, czysty substrat (usuwa fantomy przez
    kanoniczną `remove_nn_element` — publiczną operację domenową, dokładnie
    tak jak zrobiłby to inżynier po zauważeniu duplikatu), żeby kroki 1-11
    liczyły się na modelu, który TEN test faktycznie zaprojektował. Zwraca
    listę usuniętych `ref_id` (dowód, że fantom naprawdę wystąpił)."""
    enm = get_enm(case_id)
    fantomy = [
        ld.ref_id
        for ld in enm.loads
        if isinstance(ld.meta, dict)
        and ld.meta.get("completion_source") == "station_catalog_migration"
    ]
    for ref in fantomy:
        _op(client, case_id, "remove_nn_element", {"element_ref": ref})
    return fantomy


def _build_substrate(client, case_id: str) -> dict[str, Any]:
    """Buduje GPZ→SN→ST-03(TR)→RGnN→K1→R1→{K2 silnik, K3 odbiór, K4 PV, K5 BESS}.

    Wyłącznie operacje domenowe kanoniczne (te same, których używają kreatory
    ui2/kreatory/*) — zero ręcznego składania ENM. Zwraca referencje potrzebne
    kolejnym krokom.
    """
    usuniete_fantomy: list[str] = []
    _op(
        client,
        case_id,
        "add_grid_source_sn",
        {
            "voltage_kv": 15.0,
            "sk3_mva": 250.0,
            "rx_ratio": 0.1,
            "catalog_ref": REF_ZRODLO_SN,
        },
    )

    _op(
        client,
        case_id,
        "continue_trunk_segment_sn",
        {
            "segment": {
                "rodzaj": "KABEL",
                "dlugosc_m": 300,
                "name": "Magistrala SN 1",
                "catalog_ref": REF_KABEL_SN,
            },
        },
    )

    enm = get_enm(case_id)
    corridors = enm.corridors
    assert corridors, "Brak korytarza magistrali SN po continue_trunk_segment_sn"
    seg_ref = corridors[0].ordered_segment_refs[0]

    _op(
        client,
        case_id,
        "insert_station_on_segment_sn",
        {
            "segment_ref": seg_ref,
            "field_apparatus_catalog_ref": REF_APARAT_POLA_SN,
            "station_type": "B",
            "insert_at": {"value": 0.5},
            "station": {"sn_voltage_kv": 15.0, "nn_voltage_kv": 0.4, "name": "ST-03"},
            "sn_fields": ["IN", "OUT", "FEEDER"],
            "transformer": {"create": True, "transformer_catalog_ref": REF_TRANSFORMATOR},
            # Wymagane przez walidator (E063 BLOCKER): stacja zasilająca odbiory nN
            # musi deklarować układ sieci nN. TN-C-S — dominujący układ dla stacji
            # SN/nN w Polsce (patrz komentarz `_LV_LOCAL_GROUND_CONNECTIONS` w
            # `application/analyses/fault_loop/service.py`).
            "nn_earthing": {"lv_system": "TN-C-S"},
        },
    )

    enm = get_enm(case_id)
    station = next(s for s in enm.substations if s.name == "ST-03")
    station_ref = station.ref_id
    rgnn_bus = next(
        b.ref_id for b in enm.buses if b.ref_id in station.bus_refs and b.voltage_kv == 0.4
    )
    # ST-03 dostała wbudowany domyślny "Odpływ nN 1" (starter kreatora) —
    # ten SAM odczyt już zmaterializował na nim fantomowy odbiór (patrz
    # `_usun_fantomowe_odbiory_migracji`). Usuwamy od razu, zanim substrat
    # urośnie dalej.
    usuniete_fantomy.extend(_usun_fantomowe_odbiory_migracji(client, case_id))

    # RGnN → K1 → R1 (podrozdzielnica)
    _op(
        client,
        case_id,
        "add_nn_distribution_board",
        {
            "voltage_kv": 0.4,
            "name": "R1",
            "supply": {
                "from_bus_ref": rgnn_bus,
                "length_m": 40.0,
                "catalog_ref": REF_KABEL_NN,
                "name": "K1",
            },
        },
    )
    enm = get_enm(case_id)
    r1_station = next(s for s in enm.substations if s.name == "R1")
    r1_ref = r1_station.ref_id
    r1_bus = r1_station.bus_refs[0]

    # K2: R1 → aparat MCB → Skrzynka K2 → kabel K2 → Silnik M1 (odbiór, P0
    # uproszczenie — silnik jako zwykły odbiór statyczny, model rozruchu/silnika
    # w P1, G-14). Aparat wymaga DWÓCH ISTNIEJĄCYCH szyn (add_nn_switch_device
    # nie tworzy nowej — w odróżnieniu od add_nn_cable_segment), więc szyna
    # pośrednia "Skrzynka K2" powstaje jako lokalny punkt rozdzielczy
    # (add_nn_distribution_board — jedyna operacja P0.1 mintująca gołą szynę
    # nN bez kabla), a nie fabrykacją nowego typu operacji.
    _op(client, case_id, "add_nn_distribution_board", {"voltage_kv": 0.4, "name": "Skrzynka K2"})
    enm = get_enm(case_id)
    skrzynka = next(s for s in enm.substations if s.name == "Skrzynka K2")
    skrzynka_ref = skrzynka.ref_id
    skrzynka_bus = skrzynka.bus_refs[0]

    r_aparat = _op(
        client,
        case_id,
        "add_nn_switch_device",
        {
            "from_bus_ref": r1_bus,
            "to_bus_ref": skrzynka_bus,
            "device_class": "switch",
            # Bramkowanie API (`api/domain_ops_policy.py::extract_catalog_binding`)
            # dla `add_nn_switch_device` zwraca `payload["catalog_binding"]` WPROST,
            # gdy jest obecny (bez scalania z `catalog_ref`) — niekompletny
            # `catalog_binding` (bez `catalog_item_id`) zostawia bramę z pustym
            # identyfikatorem i przez to spada na domyślny namespace API-owy
            # "APARAT_NN". `catalog_item_id` MUSI więc być w środku, nie osobno.
            "catalog_binding": {
                "catalog_namespace": "APARAT_NN_MCB",
                "catalog_item_id": REF_MCB_K2,
                "catalog_item_version": "2024.1",
            },
            "name": "Aparat K2 (MCB C25)",
        },
    )
    aparat_k2_ref = r_aparat["changes"]["created_element_ids"][0]

    r_k2_cable = _op(
        client,
        case_id,
        "add_nn_cable_segment",
        {
            "from_bus_ref": skrzynka_bus,
            "length_m": 60.0,
            "catalog_ref": REF_KABEL_NN,
            "name": "K2",
        },
    )
    k2_cable_ref = r_k2_cable["snapshot"]["branches"][-1]["ref_id"]
    enm = get_enm(case_id)
    k2_cable = next(b for b in enm.branches if b.ref_id == k2_cable_ref)
    leaf_silnik_bus = k2_cable.to_bus_ref

    r_field_k2 = _op(
        client,
        case_id,
        "add_nn_outgoing_field",
        {
            "station_ref": skrzynka_ref,
            "bus_nn_ref": leaf_silnik_bus,
            "field_name": "Odpływ K2 - Silnik M1",
            # ZNALEZISKO (dokumentowane w raporcie końcowym, nie naprawiane tu):
            # `add_nn_outgoing_field` jest w `api/domain_ops_policy.py::
            # CATALOG_REQUIRED_OPERATIONS` — brama produkcyjna WYMAGA
            # catalog_ref, mimo że sama operacja domenowa go nie konsumuje
            # (`enm/domain_operations_v2.py::_add_nn_outgoing_field_internal`
            # nie czyta `payload["catalog_ref"]`) i mimo że kreator
            # `ui2/kreatory/pole-nn/KreatorPolaNn.tsx` (własny docstring: „kreator
            # NIE POKAZUJE pickera katalogu — backend go dla tej operacji nie
            # honoruje") NIGDY go nie wysyła. Realny kreator „Pole odpływowe nN"
            # wysyłany przez PRODUKCYJNY endpoint (`POST .../enm/domain-ops`)
            # dostałby 422 `catalog.ref_required`. Wzorzec zgodny z
            # `tests/api/test_brama_katalogowa_api_inwentarz.py::IniekcjaBramy
            # ("add_nn_outgoing_field", ...)`, który TEŻ wymaga catalog_ref.
            "catalog_ref": "cb_nn_630a",
        },
    )
    feeder_k2 = r_field_k2["changes"]["created_element_ids"][0]

    r_load_k2 = _op(
        client,
        case_id,
        "add_nn_load",
        {
            "feeder_ref": feeder_k2,
            "active_power_kw": 22.0,
            "cos_phi": 0.86,
            "load_name": "Silnik M1 (odbiór, P0 uproszczenie)",
            # `add_nn_load` jest w CATALOG_REQUIRED_OPERATIONS (brama API) — P/Q
            # RZECZYWISTE nadal pochodzą z `active_power_kw`/`cos_phi` powyżej
            # (`enm/domain_operations_v2.py::add_nn_load` czyta katalog TYLKO dla
            # prowieniencji/istnienia pozycji, nie nadpisuje mocy), więc wiązanie
            # z generyczną pozycją katalogu OBCIAZENIE (kategoria przemysłowa —
            # najbliższa silnikowi w dostępnym katalogu; P0 nie ma jeszcze
            # dedykowanej pozycji „silnik", zob. G-14/P1) jest uczciwe — żadna
            # wartość liczbowa nie jest z niej brana.
            "catalog_ref": "load_przem_75kw",
        },
    )
    silnik_load_ref = r_load_k2["changes"]["created_element_ids"][0]
    # ZNALEZISKO (patrz `_usun_fantomowe_odbiory_migracji`): `add_nn_load`
    # powyżej odczytał model PRZEZ `_get_enm`, który w MIĘDZYCZASIE (od
    # utworzenia pola K2 do teraz) już zmaterializował fantomowy odbiór 30 kW
    # na TYM SAMYM `feeder_k2` — usuwamy go, żeby Silnik M1 został jedynym
    # odbiorem na tym odpływie (dokładnie jak intencja tego kroku budowy).
    usuniete_fantomy.extend(_usun_fantomowe_odbiory_migracji(client, case_id))

    # K3: R1 → kabel K3 → Odbiór K3 (odbiór prosty, bez aparatu dedykowanego —
    # obwód pomocniczy dowodzący, że model obsługuje WIELE jednorodnych
    # odpływów z tej samej rozdzielnicy, nie tylko obwód w pełni
    # zinstrumentowany K2).
    r_k3_cable = _op(
        client,
        case_id,
        "add_nn_cable_segment",
        {"from_bus_ref": r1_bus, "length_m": 50.0, "catalog_ref": REF_KABEL_NN, "name": "K3"},
    )
    leaf_odbior_bus = r_k3_cable["snapshot"]["branches"][-1]["to_bus_ref"]
    r_field_k3 = _op(
        client,
        case_id,
        "add_nn_outgoing_field",
        {
            "station_ref": r1_ref,
            "bus_nn_ref": leaf_odbior_bus,
            "field_name": "Odpływ K3 - Odbiór",
            "catalog_ref": "cb_nn_630a",  # patrz komentarz przy K2 (ZNALEZISKO bramy)
        },
    )
    feeder_k3 = r_field_k3["changes"]["created_element_ids"][0]
    _op(
        client,
        case_id,
        "add_nn_load",
        {
            "feeder_ref": feeder_k3,
            "active_power_kw": 15.0,
            "cos_phi": 0.92,
            "load_name": "Odbiór K3",
            "catalog_ref": "load_uslugi_30kw",  # patrz komentarz przy K2 (ZNALEZISKO bramy)
        },
    )
    usuniete_fantomy.extend(_usun_fantomowe_odbiory_migracji(client, case_id))

    # K4: RGnN → kabel K4 → PV. add_converter_source(connection_variant=nn_side)
    # wymaga, żeby STATION_REF miał WŁASNY transformator w bus_refs
    # (`_has_transformer_in_path` sprawdza TYLKO stację wskazaną station_ref —
    # nie śledzi trasy przez kable do stacji podrzędnych) — R1/Skrzynka K2 nie
    # mają własnego trafo, więc PV/BESS wpinają się bezpośrednio na RGnN
    # (odrębnym kablem), a nie za R1. To ZNALEZISKO (udokumentowane w raporcie
    # końcowym), nie fabrykacja: odejście od dosłownego brzmienia „R1→K4→PV"
    # wymuszone realnym kontraktem operacji, zgodne z realną praktyką
    # (dedykowany odpływ DER prosto z głównej rozdzielnicy nN stacji).
    r_k4_cable = _op(
        client,
        case_id,
        "add_nn_cable_segment",
        {"from_bus_ref": rgnn_bus, "length_m": 30.0, "catalog_ref": REF_KABEL_NN, "name": "K4"},
    )
    leaf_pv_bus = r_k4_cable["snapshot"]["branches"][-1]["to_bus_ref"]
    _op(
        client,
        case_id,
        "add_converter_source",
        {
            "station_ref": station_ref,
            "bus_nn_ref": leaf_pv_bus,
            "source_technology": "PV",
            "connection_variant": "nn_side",
            "catalog_ref": REF_PV,
            "source_name": "PV-K4",
            "power_setpoint_mw": 0.15,
        },
    )

    # K5: RGnN → kabel K5 → BESS (sama uzasadnienie jak K4).
    r_k5_cable = _op(
        client,
        case_id,
        "add_nn_cable_segment",
        {"from_bus_ref": rgnn_bus, "length_m": 25.0, "catalog_ref": REF_KABEL_NN, "name": "K5"},
    )
    leaf_bess_bus = r_k5_cable["snapshot"]["branches"][-1]["to_bus_ref"]
    _op(
        client,
        case_id,
        "add_converter_source",
        {
            "station_ref": station_ref,
            "bus_nn_ref": leaf_bess_bus,
            "source_technology": "BESS",
            "connection_variant": "nn_side",
            "catalog_ref": REF_BESS,
            "source_name": "BESS-K5",
            "power_setpoint_mw": 0.05,
        },
    )

    return {
        "station_ref": station_ref,
        "rgnn_bus": rgnn_bus,
        "r1_ref": r1_ref,
        "r1_bus": r1_bus,
        "skrzynka_k2_ref": skrzynka_ref,
        "skrzynka_k2_bus": skrzynka_bus,
        "aparat_k2_ref": aparat_k2_ref,
        "k2_cable_ref": k2_cable_ref,
        "leaf_silnik_bus": leaf_silnik_bus,
        "silnik_load_ref": silnik_load_ref,
        "leaf_odbior_bus": leaf_odbior_bus,
        "leaf_pv_bus": leaf_pv_bus,
        "leaf_bess_bus": leaf_bess_bus,
        "usuniete_fantomy_migracji": usuniete_fantomy,
    }


def _typed_pf_result(model: EnergyNetworkModel):
    """Rozpływ mocy jako typowany `PowerFlowResultV1` (dla analizy profilu U).

    Wywołanie SOLVERA wprost (`solve_power_flow_physics` — ta sama fizyka, o
    identycznym wejściu, co `enm.canonical_analysis.run_power_flow_now`, wzorzec
    z `tests/e2e/test_v1_pv_bess_full_build.py`/`test_pf_exports_deterministic.py`)
    jest potrzebne TYLKO dlatego, że `analysis/voltage_profile` konsumuje
    obiekt typowany `PowerFlowResultV1`, a `CanonicalRun.raw_result` niesie go
    jako spłaszczony słownik. Zero drugiej ścieżki fizyki — identyczny solver,
    identyczne dane wejściowe, wynik deterministycznie ten sam (pinowane w
    `test_krok_01`, który porównuje oba wywołania).
    """
    graph = map_enm_to_network_graph(model)
    slack_id = next(nid for nid, n in graph.nodes.items() if n.node_type.value == "SLACK")
    # `node.active_power`/`reactive_power` (built by `enm.mapping`) use the
    # GENERATION convention (positive = injection); `PQSpec.p_mw`/`q_mvar`
    # expect the LOAD convention (positive = consumption) — SAME negation
    # `_execute_power_flow` applies (`enm/canonical_analysis.py`, comment at
    # PQSpec construction: "single conversion point gen->load"). Bez tego
    # znaku odbiory i źródła zamieniają się rolami w rozwiązaniu.
    pq_specs = [
        PQSpec(node_id=nid, p_mw=-(n.active_power or 0.0), q_mvar=-(n.reactive_power or 0.0))
        for nid, n in sorted(graph.nodes.items())
        if n.node_type.value == "PQ" and nid != slack_id
    ]
    pf_input = PowerFlowInput(
        graph=graph,
        base_mva=100.0,
        slack=SlackSpec(node_id=slack_id, u_pu=1.0, angle_rad=0.0),
        pq=pq_specs,
        # tolerance=1e-8 — SAMA wartość co domyślna opcja `run_power_flow_now`
        # (`enm.canonical_analysis._execute_power_flow`: `tolerance=float(
        # run.options.get("tolerance", 1e-8))`) — inaczej porównanie V_pu
        # poniżej wykrywa różnicę precyzji zbieżności, nie różnicę fizyki.
        options=PowerFlowOptions(max_iter=50, tolerance=1e-8, trace_level="full"),
    )
    solution = solve_power_flow_physics(pf_input)
    result_v1 = build_power_flow_result_v1(
        converged=solution.converged,
        iterations_count=solution.iterations,
        tolerance_used=pf_input.options.tolerance,
        base_mva=pf_input.base_mva,
        slack_bus_id=pf_input.slack.node_id,
        node_u_mag=solution.node_u_mag,
        node_angle=solution.node_angle,
        node_p_injected_pu={
            k: v.real / pf_input.base_mva for k, v in solution.node_voltage.items()
        },
        node_q_injected_pu={
            k: v.imag / pf_input.base_mva for k, v in solution.node_voltage.items()
        },
        branch_s_from_mva=solution.branch_s_from,
        branch_s_to_mva=solution.branch_s_to,
        losses_total=solution.losses_total,
        slack_power_pu=solution.slack_power,
    )
    return graph, result_v1


# ---------------------------------------------------------------------------
# Testy — dziesięć kroków łańcucha + determinizm (kolejność wymuszona:
# pytest zachowuje kolejność deklaracji w pliku).
# ---------------------------------------------------------------------------


class TestNnFullChain:
    """Bramka końcowa P0: łańcuch nN na JEDNYM modelu, krok po kroku."""

    # -- KROK 0: substrat -----------------------------------------------

    def test_krok_00_substrat_buduje_sie_bez_bledow(self, app_client) -> None:
        """Cały substrat (GPZ→SN→ST-03→RGnN→K1→R1→K2/K3/K4/K5) buduje się bez
        błędu, WYŁĄCZNIE operacjami domenowymi przez produkcyjny endpoint."""
        reset_enm_store()
        refs = _build_substrate(app_client, _CASE_ID)
        _REFS.update(refs)

        # ZNALEZISKO BRAMKI (patrz docstring `_usun_fantomowe_odbiory_migracji`):
        # dowód, że fantomowa podwójna materializacja odbiorów NAPRAWDĘ
        # wystąpiła podczas budowy tego substratu (mechanizm nie jest
        # teoretyczny). Substrat po oczyszczeniu ma zamierzone Silnik M1 +
        # Odbiór K3 BEZ duplikatów NA ICH WŁASNYCH odpływach — ale domyślny
        # starter „Odpływ nN 1" na RGnN (auto-tworzony przez
        # `insert_station_on_segment_sn`, nieużywany przez ten substrat celowo)
        # NIE MA kanonicznej operacji usuwającej sam wpis pola (`remove_nn_element`
        # kasuje tylko gałąź/szynę/odbiór — nie wpis `nn_field_specs`), więc jego
        # fantomowy odbiór ODRADZA SIĘ przy KAŻDYM kolejnym odczycie modelu
        # (włącznie z odczytem dwie linijki niżej) — trzeci, TRWAŁY objaw tego
        # samego znaleziska. Substrat świadomie go NIE zwalcza (regenerowałby
        # się w nieskończoność) — akceptuje go jako REALNY, deterministyczny
        # (stały seed z `station_ref`+`feeder_ref`), ale NIEZAMIERZONY element.
        fantomy = refs["usuniete_fantomy_migracji"]
        assert fantomy, (
            "Oczekiwano co najmniej jednego fantomowego odbioru wykrytego i usuniętego "
            "podczas budowy (ST-03 domyślny odpływ + wyścig pole→odbiór na K2) — brak "
            "fantomów oznacza, że mechanizm migracji przestał się uruchamiać na odczycie "
            "(regresja tego znaleziska, do zweryfikowania) ALBO że budowa się zmieniła."
        )

        enm = get_enm(_CASE_ID)
        odbiory_migracji = [
            ld
            for ld in enm.loads
            if isinstance(ld.meta, dict)
            and ld.meta.get("completion_source") == "station_catalog_migration"
        ]
        assert len(odbiory_migracji) == 1 and odbiory_migracji[0].name == "Odbiór nN 1 - ST-03", (
            f"Oczekiwano DOKŁADNIE jednego trwałego fantomu (ST-03, nieusuwalny — patrz "
            f"wyżej), jest: {[ld.name for ld in odbiory_migracji]}"
        )
        assert any(ld.name == "Silnik M1 (odbiór, P0 uproszczenie)" for ld in enm.loads)
        assert any(ld.name == "Odbiór K3" for ld in enm.loads)
        assert len(enm.buses) >= 10, f"Za mało szyn po budowie: {len(enm.buses)}"
        assert len(enm.branches) >= 7, f"Za mało gałęzi po budowie: {len(enm.branches)}"
        assert len(enm.transformers) == 2, "Oczekiwano 2 transformatorów (GPZ WN/SN + TR SN/nN)"
        assert len(enm.loads) == 3, (
            f"Oczekiwano 3 odbiorów (Silnik M1 + Odbiór K3 + trwały fantom ST-03), "
            f"jest {len(enm.loads)}: {[ld.name for ld in enm.loads]}"
        )
        assert (
            len(enm.generators) == 2
        ), f"Oczekiwano 2 źródeł (PV+BESS), jest {len(enm.generators)}"
        gen_types = {g.gen_type for g in enm.generators}
        assert "pv_inverter" in gen_types, f"Brak PV: {gen_types}"
        assert "bess" in gen_types, f"Brak BESS: {gen_types}"

        aparat = next(b for b in enm.branches if b.ref_id == _REFS["aparat_k2_ref"])
        assert (
            aparat.catalog_namespace == "APARAT_NN_MCB"
        ), f"Aparat K2 powinien mieć namespace APARAT_NN_MCB, ma {aparat.catalog_namespace}"
        assert aparat.materialized_params is not None

        # Walidacja: brak BLOCKER po pełnej budowie (WARN dopuszczalny — Z0
        # nN/warunki ułożenia nieustawione jawnie, katalogowe domyślne).
        from enm.validator import ENMValidator

        validation = ENMValidator().validate(enm)
        blockers = [i for i in validation.issues if i.severity == "BLOCKER"]
        assert (
            not blockers
        ), f"BLOCKER po budowie substratu: {[(b.code, b.message_pl) for b in blockers]}"

    # -- KROK 1: rozpływ mocy SN+nN --------------------------------------

    def test_krok_01_rozplyw_mocy_sn_nn_zbiega(self, app_client) -> None:
        """Rozpływ mocy (Newton-Raphson) przez kanoniczny serwis
        `run_power_flow_now` — TA SAMA funkcja, którą woła `POST /runs/power-flow`."""
        pf_run = run_power_flow_now(case_id=_CASE_ID, project_id=None, options={})
        assert pf_run.status == "FINISHED", f"PF run nie zakończony: {pf_run.error_message}"
        result_v1 = (pf_run.raw_result or {}).get("result_v1") or {}
        assert result_v1.get("converged") is True, f"PF nie zbieżny: {result_v1}"
        assert result_v1.get("iterations_count", 0) > 0

        bus_results = result_v1.get("bus_results") or []
        assert len(bus_results) == len(
            get_enm(_CASE_ID).buses
        ), "Liczba rozwiązanych szyn PF nie zgadza się z liczbą szyn ENM"
        for row in bus_results:
            assert row.get("status") == "solved", f"Szyna nierozwiązana: {row}"
            v_pu = row["v_pu"]
            assert 0.85 <= v_pu <= 1.15, f"Napięcie poza sensownym pasmem: {row}"

        # Weryfikacja krzyżowa: solver wywołany wprost (dla profilu U/ΔU,
        # KROK 2/3) zbiega na TYM SAMYM zbiorze węzłów z PODOBNYMI napięciami
        # co bieg kanoniczny — jedna fizyka (Newton-Raphson), dwa miejsca
        # konsumpcji. NIE bit-identyczne: bieg kanoniczny dodatkowo stosuje
        # regulację Q(U) falownika PV/BESS (`control_mode: Q_U_DROOP`,
        # `_build_converter_control_by_node` w `_execute_power_flow`), której
        # to wywołanie pomocnicze świadomie NIE odtwarza (potrzebuje tylko
        # typowanego `PowerFlowResultV1` dla dekompozycji ΔU, nie regulacji
        # OZE) — tolerancja 2% obejmuje ten legalny rozjazd Q na węzłach PV/BESS.
        model = get_enm(_CASE_ID)
        graph, result_v1_direct = _typed_pf_result(model)
        canonical_by_id = {row["bus_id"]: row["v_pu"] for row in bus_results}
        for bus in result_v1_direct.bus_results:
            assert bus.bus_id in canonical_by_id, f"Szyna {bus.bus_id} brak w biegu kanonicznym"
            assert bus.v_pu == pytest.approx(
                canonical_by_id[bus.bus_id], rel=2e-2
            ), f"Rozbieżność V_pu między biegiem kanonicznym a solverem wprost dla {bus.bus_id}"

        _STAN["pf_run"] = pf_run
        _STAN["pf_result_v1_direct"] = result_v1_direct
        _STAN["graph"] = graph

    # -- KROK 2: profil napięcia -----------------------------------------

    def test_krok_02_profil_napiecia(self) -> None:
        """Profil napięcia: każda szyna nN ma napięcie rozwiązane w PF."""
        result_v1 = _STAN["pf_result_v1_direct"]
        graph = _STAN["graph"]

        nn_buses = [n for nid, n in graph.nodes.items() if 0.0 < n.voltage_level < 1.0]
        assert len(nn_buses) >= 8, f"Za mało szyn nN w grafie: {len(nn_buses)}"

        bus_v_pu = {b.bus_id: b.v_pu for b in result_v1.bus_results}
        nn_bus_ids = {
            ref_to_graph_id(rid)
            for rid in (
                _REFS["rgnn_bus"],
                _REFS["r1_bus"],
                _REFS["leaf_silnik_bus"],
                _REFS["leaf_odbior_bus"],
                _REFS["leaf_pv_bus"],
                _REFS["leaf_bess_bus"],
            )
        }
        for bus_id in nn_bus_ids:
            v_pu = bus_v_pu.get(bus_id)
            assert v_pu is not None and v_pu == v_pu, f"Szyna {bus_id} bez rozwiązanego U"
            assert 0.9 <= v_pu <= 1.05, f"Szyna {bus_id}: U={v_pu} p.u. poza pasmem eksploatacyjnym"

        # RGnN (za trafo) musi mieć WYŻSZE napięcie niż liść Silnika M1 (za K1 +
        # aparat + K2) — spadek napięcia wzdłuż łańcucha musi być monotoniczny
        # co do kierunku (dowód, że profil U rzeczywiście reprezentuje spadek).
        v_rgnn = bus_v_pu[ref_to_graph_id(_REFS["rgnn_bus"])]
        v_silnik = bus_v_pu[ref_to_graph_id(_REFS["leaf_silnik_bus"])]
        assert (
            v_rgnn > v_silnik
        ), f"Oczekiwano spadku napięcia RGnN({v_rgnn})→Silnik({v_silnik}), brak spadku"

    # -- KROK 3: ΔU łańcucha (najgorsza ścieżka auto) --------------------

    def test_krok_03_delta_u_lancucha_najgorsza_sciezka(self) -> None:
        """Dekompozycja ΔU per odcinek na trasie do najgorszej szyny nN
        (`find_worst_nn_path`) + jawna dekompozycja trasy K1→aparat K2→K2 do
        Silnika M1 — suma segmentów = U_źródło - U_węzeł (niezmiennik
        telescoping sum, sprawdzany WEWNĄTRZ `VoltageProfileSegmentBuilder`)."""
        graph = _STAN["graph"]
        result_v1 = _STAN["pf_result_v1_direct"]

        worst_path = find_worst_nn_path(graph, result_v1)
        assert worst_path is not None, "Brak najgorszej ścieżki nN (sieć bez szyn nN?)"
        assert worst_path.segments, "Najgorsza ścieżka nN bez segmentów"
        suma = sum(seg.delta_u_kv for seg in worst_path.segments)
        assert suma == pytest.approx(
            worst_path.u_source_kv - worst_path.u_node_kv, abs=1e-4
        ), "Niezmiennik dekompozycji ΔU naruszony dla najgorszej ścieżki"
        # Trend OGÓLNY (u_source > u_node) — NIE per-odcinek: trasa do
        # najgorszej szyny nN przechodzi też przez odcinki SN, na których PV/
        # BESS głęboko w sieci nN mogą lokalnie podnieść napięcie (przepływ
        # zwrotny) — pojedynczy odcinek z ΔU<0 jest fizycznie poprawny, o ile
        # SUMA (już zweryfikowana wyżej) odpowiada spadkowi całkowitemu.
        assert (
            worst_path.u_source_kv > worst_path.u_node_kv
        ), "Najgorsza szyna nN powinna mieć niższe napięcie niż źródło (SLACK)"

        # Dekompozycja jawna do Silnika M1 (obwód reprezentatywny K2) — trasa
        # WYŁĄCZNIE odbiorcza (K1 → aparat K2 → K2, zero DER na tej gałęzi),
        # więc TU spadek napięcia MUSI być monotoniczny odcinek po odcinku.
        builder = VoltageProfileSegmentBuilder(graph)
        silnik_path = builder.build_path(result_v1, ref_to_graph_id(_REFS["leaf_silnik_bus"]))
        assert len(silnik_path.segments) >= 3, (
            f"Oczekiwano >=3 odcinków (K1, aparat K2, K2) na trasie do Silnika M1, "
            f"jest {len(silnik_path.segments)}: {[s.branch_id for s in silnik_path.segments]}"
        )
        suma_silnik = sum(seg.delta_u_kv for seg in silnik_path.segments)
        assert suma_silnik == pytest.approx(
            silnik_path.u_source_kv - silnik_path.u_node_kv, abs=1e-4
        )
        for seg in silnik_path.segments:
            if seg.from_bus == ref_to_graph_id(_REFS["rgnn_bus"]) or seg.u_from_kv < 1.0:
                assert seg.delta_u_kv > 0.0, (
                    f"Odcinek nN {seg.branch_id} (Silnik M1, trasa czysto odbiorcza): "
                    f"ΔU={seg.delta_u_kv} nie jest dodatnie"
                )
        _STAN["delta_u_total_kv_silnik"] = suma_silnik
        _STAN["u_source_kv_silnik"] = silnik_path.u_source_kv

    # -- KROK 4: Ik max/min (scenariusze c per pasmo) ---------------------

    def test_krok_04_zwarcia_max_min(self) -> None:
        """SC 3F, scenariusze MAX/MIN, przez kanoniczny serwis
        `run_short_circuit_now` — TA SAMA funkcja, którą woła
        `POST /runs/short-circuit`. c per pasmo napięcia (IEC 60909 Tab. 1):
        nN → c_max=1,05, c_min=0,95 — AUTO, bez override."""
        sc_max = run_short_circuit_now(
            case_id=_CASE_ID, project_id=None, options={"fault_type": "3F", "scenario": "max"}
        )
        sc_min = run_short_circuit_now(
            case_id=_CASE_ID, project_id=None, options={"fault_type": "3F", "scenario": "min"}
        )
        assert sc_max.status == "FINISHED", sc_max.error_message
        assert sc_min.status == "FINISHED", sc_min.error_message

        rows_max = {r["fault_node_id"]: r for r in (sc_max.raw_result or {}).get("results", [])}
        rows_min = {r["fault_node_id"]: r for r in (sc_min.raw_result or {}).get("results", [])}
        assert rows_max, "SC MAX bez wierszy wynikowych"
        # MAX i MIN liczą się dla DOKŁADNIE TEGO SAMEGO zbioru węzłów
        # raportowalnych (helper/terminal buses wykluczone jako cele zwarcia —
        # `skip_short_circuit_target`, nie każda szyna ENM jest realnym punktem
        # zwarcia) — porównujemy oba scenariusze WZAJEMNIE, nie z liczbą szyn.
        assert set(rows_max.keys()) == set(rows_min.keys())
        assert len(rows_max) >= 10, f"Za mało węzłów raportowalnych: {len(rows_max)}"

        leaf_silnik_graph_id = ref_to_graph_id(_REFS["leaf_silnik_bus"])
        row_max = rows_max[leaf_silnik_graph_id]
        row_min = rows_min[leaf_silnik_graph_id]

        assert row_max["c_factor"] == pytest.approx(
            1.05
        ), f"c_max nN (IEC 60909 Tab.1) powinno być 1,05, jest {row_max['c_factor']}"
        assert row_min["c_factor"] == pytest.approx(
            0.95
        ), f"c_min nN powinno być 0,95, jest {row_min['c_factor']}"
        assert (
            row_max["ikss_a"] > row_min["ikss_a"] > 0.0
        ), f"Oczekiwano Ik''max({row_max['ikss_a']}) > Ik''min({row_min['ikss_a']}) > 0"
        assert row_max["ikss_a"] == row_max["ib_a"] == row_max["ik_total_a"]

        # Sanity: MAX/MIN na WSZYSTKICH szynach — Ik''max >= Ik''min wszędzie.
        for node_id, r_max in rows_max.items():
            r_min = rows_min[node_id]
            assert (
                r_max["ikss_a"] >= r_min["ikss_a"] - 1e-9
            ), f"Węzeł {node_id}: Ik''max({r_max['ikss_a']}) < Ik''min({r_min['ikss_a']})"

        _STAN["sc_max_run"] = sc_max
        _STAN["sc_min_run"] = sc_min
        _STAN["ikss_a_leaf_silnik_before"] = row_max["ikss_a"]
        _STAN["ik_max_ka_leaf_silnik"] = row_max["ikss_a"] / 1000.0

    # -- KROK 5: pętla zwarcia + SWZ ---------------------------------------

    def test_krok_05_petla_zwarcia_u_zrodla_i_swz_zerohop(self) -> None:
        """Pętla zwarcia u źródła (szyna nN transformatora, trasa
        zerodługościowa) — MECHANIZM DZIAŁA w pełni (dowód pozytywny przed
        znaleziskiem bramki w kolejnym teście)."""
        model = get_enm(_CASE_ID)
        view = build_station_fault_loop_view(model, _REFS["station_ref"])
        assert view["status"] == "OK", view
        fl = view["fault_loop"]
        assert fl["ik_min_a"] > 0.0
        assert fl["ik_max_a"] >= fl["ik_min_a"]
        assert view["fault_loop"]["white_box_trace"], "Brak White Box śladu pętli zwarcia"

        swz = build_swz_view(model, _REFS["station_ref"], _REFS["rgnn_bus"], _REFS["aparat_k2_ref"])
        assert swz["status"] == "OK", swz
        assert swz["swz"]["status"] in ("spełnia", "nie spełnia", "nierozstrzygalne")
        assert "ia_wymagane_a" in swz["swz"] or "margines" in swz["swz"]
        _STAN["swz_zerohop"] = swz

    def test_krok_05b_petla_zwarcia_w_dowolnym_punkcie_znalezisko_bramki(self) -> None:
        """ZNALEZISKO BRAMKI (dokumentowane, patrz docstring modułu): pętla
        zwarcia w DOWOLNYM punkcie nN poza szyną transformatora (tu: Silnik M1,
        za K1+aparat+K2) jest zablokowana, bo WSZYSTKIE 17 pozycji katalogu
        kabli nN (`kab_nn_*`) nie mają danych żyły powrotnej PE/PEN
        (`return_conductor_r_ohm_per_km_20c`/`return_conductor_x_ohm_per_km`).
        Asercja poniżej potwierdza, że mechanizm fail-closed (§0.1 karty P0.6)
        DZIAŁA POPRAWNIE — zwraca uczciwy status „brak danych" z konkretnym
        powodem, NIE fabrykuje wyniku. To NIE jest błąd testu — to dowód
        readiness-gate: P0 nN NIE jest w pełni gotowe end-to-end."""
        model = get_enm(_CASE_ID)
        view = build_fault_loop_view_at_point(model, _REFS["station_ref"], _REFS["leaf_silnik_bus"])
        assert (
            view["status"] == "brak danych"
        ), f"Oczekiwano fail-closed 'brak danych' (katalog bez żyły powrotnej), otrzymano: {view}"
        assert view["missing_data"] == ["route"]
        assert "żyły powrotnej" in (view.get("reason_pl") or ""), view.get("reason_pl")

        feeders = build_feeder_fault_loop_view(model, _REFS["station_ref"])
        assert feeders["status"] == "OK"  # widok się buduje...
        # ...ale KAŻDY punkt poza zerohop raportuje "brak danych" — sprawdzamy,
        # że co najmniej jeden odpływ ma punkt niepoliczalny (nie cichą pustkę).
        any_missing_route = False
        for feeder in feeders.get("feeders", []):
            for point in feeder.get("points", []):
                if point.get("status") == "brak danych":
                    any_missing_route = True
        assert (
            any_missing_route
        ), "Oczekiwano co najmniej jednego punktu 'brak danych' (żyła powrotna)"

        swz = build_swz_view(
            model, _REFS["station_ref"], _REFS["leaf_silnik_bus"], _REFS["aparat_k2_ref"]
        )
        assert swz["status"] == "brak danych"
        assert swz["missing_data"] == ["route"]
        _STAN["gate_finding_return_conductor"] = True

    # -- KROK 6: dobór kabli (Iz′ z korektami) -----------------------------

    def test_krok_06_dobor_kabli_iz_prime(self, app_client) -> None:
        """Iz′ = Iz_katalogowe × Σ współczynników korekcyjnych PN-HD 60364-5-52
        dla kabla K2 (obwód Silnika M1) — REUSE `cable_ampacity_derating`,
        JEDYNE miejsce mnożenia w repo. Zapis warunków ułożenia w modelu przez
        `set_nn_cable_laying_conditions` (operacja domenowa kanoniczna)."""
        _op(
            app_client,
            _CASE_ID,
            "set_nn_cable_laying_conditions",
            {
                "segment_ref": _REFS["k2_cable_ref"],
                "cable_laying_conditions": {
                    "environment": "grunt",
                    "insulation": "PVC",
                    "ambient_temperature_c": 20.0,
                    "circuit_count": 1,
                    "soil_thermal_resistivity_km_w": 1.0,
                },
            },
        )
        model = get_enm(_CASE_ID)
        k2_cable = next(b for b in model.branches if b.ref_id == _REFS["k2_cable_ref"])
        warunki = k2_cable.meta["cable_laying_conditions"]
        assert warunki["environment"] == "grunt"

        wspolczynniki = wspolczynniki_nn(
            srodowisko="grunt",
            izolacja="PVC",
            temperatura_c=20.0,
            liczba_obwodow=1,
            rezystywnosc_gruntu_km_w=1.0,
        )
        iz_katalogowe_a = k2_cable.materialized_params["i_max_a"]
        assert iz_katalogowe_a == pytest.approx(
            240.0
        ), f"Iz katalogowe kabla K2 (kab_nn_4x120_al) powinno być 240 A, jest {iz_katalogowe_a}"
        iz_prime_a = obciazalnosc_skorygowana(iz_katalogowe_a, wspolczynniki)
        # Ręczny rachunek kontrolny: f_temperatura(grunt,PVC,20°C)=1,0 (odniesienie),
        # f_rezystywność(1,0 K·m/W)=1,18 (grunt suchszy niż odniesienie 2,5 K·m/W → f>1),
        # f_grupowanie(1 obwód)=1,0 → iloczyn=1,18.
        assert wspolczynniki.iloczyn == pytest.approx(1.18, abs=1e-6)
        assert iz_prime_a == pytest.approx(240.0 * 1.18, abs=1e-6)
        assert (
            iz_prime_a > iz_katalogowe_a
        ), "Iz′ dla gruntu suchszego niż odniesienie musi być > Iz"

        _STAN["iz_prime_a_k2"] = iz_prime_a
        _STAN["iz_katalogowe_a_k2"] = iz_katalogowe_a

    # -- KROK 7: dobór zabezpieczeń -----------------------------------------

    def test_krok_07_dobor_zabezpieczen_zerohop_mechanizm_dziala(self) -> None:
        """Dobór aparatu nN (`wybierz_aparat_dla_obwodu_nn`) — mechanizm ORZEKA
        u źródła (zero-hop, jedyny punkt gdzie Ik1_min jest dziś policzalny —
        patrz ZNALEZISKO #1) dla WSZYSTKICH 113 kandydatów z katalogu, z pełnym
        uzasadnieniem per kryterium.

        CZWARTE ZNALEZISKO BRAMKI (dokumentowane, NIE naprawiane tu):
        u szyny nN transformatora Ik″max jest z definicji NAJWYŻSZY w całej
        sieci nN (najbliżej źródła) — tu Ik″max=8,395 kA. ŻADNA z 3 rodzin
        katalogu nie daje pełnej kwalifikacji na TYM konkretnym poziomie:
        MCB (zdolność wyłączania 6 kA, `_MCB_ICN_KA`) < 8,395 kA — realnie za
        mało dla obwodu tak blisko transformatora; MCCB — kryterium I2
        NIEROZSTRZYGALNE (brak nastaw wyzwalacza Ir/Isd/Ii, zero fabrykacji,
        `_kryterium_i2`); wkładka gG — kryterium SWZ NIEROZSTRZYGALNE (brak
        bramek I-t wkładki, G-D2, `i2t_prearc_a2s=None` dla WSZYSTKICH 30
        pozycji `fuse_nn_gg_*`). Złożenie z ZNALEZISKIEM #1 (Ik1_min policzalny
        WYŁĄCZNIE u źródła): `wybierz_aparat_dla_obwodu_nn` NIE MOŻE dziś
        wydać pełnej rekomendacji („rekomendacja" != None) dla ŻADNEGO obwodu
        w ŻADNEJ sieci nN zbudowanej z domyślnego katalogu — ani u źródła
        (rodzina niekompletna), ani dalej (trasa niepoliczalna). Ten test
        asertuje MECHANIZM (poprawne, zróżnicowane uzasadnienie per rodzinę),
        nie fabrykuje sukcesu, którego system dziś nie potrafi wydać."""
        model = get_enm(_CASE_ID)
        wynik = wybierz_aparat_dla_obwodu_nn(
            enm=model,
            station_ref=_REFS["station_ref"],
            bus_ref=_REFS["rgnn_bus"],
            ib_a=40.0,
            iz_prime_a=_STAN["iz_prime_a_k2"],
            ik_max_ka=_STAN["ik_max_ka_leaf_silnik"],
        )
        assert wynik["status"] == "OK", wynik
        dobor = wynik["dobor"]
        assert len(dobor["kandydaci"]) >= 100, f"Za mało kandydatów: {len(dobor['kandydaci'])}"

        mcb_falls_on_icu = [
            k
            for k in dobor["kandydaci"]
            if k["kandydat"]["kind"] == "MCB"
            and 40.0 <= k["kandydat"]["in_a"] <= _STAN["iz_prime_a_k2"]
            and not k["kwalifikuje_sie"]
            and any(
                kr["nazwa"] == "Zdolność wyłączania >= Ik″max" and kr["status"] == "nie spełnia"
                for kr in k["kryteria"]
            )
        ]
        assert (
            mcb_falls_on_icu
        ), "Oczekiwano MCB w zakresie In odrzuconych na kryterium zdolności wyłączania"

        mccb_nierozstrzygalne = [
            k
            for k in dobor["kandydaci"]
            if k["kandydat"]["kind"] == "MCCB"
            and any(
                kr["nazwa"] == "I2<=1,45·Iz′" and kr["status"] == "nierozstrzygalne"
                for kr in k["kryteria"]
            )
        ]
        assert (
            mccb_nierozstrzygalne
        ), "Oczekiwano MCCB z kryterium I2 nierozstrzygalnym (brak nastaw)"

        fuse_nierozstrzygalne = [
            k
            for k in dobor["kandydaci"]
            if k["kandydat"]["kind"] == "FUSE_SWITCH"
            and any(
                kr["nazwa"] == "SWZ przy Ik_min" and kr["status"] == "nierozstrzygalne"
                for kr in k["kryteria"]
            )
        ]
        assert (
            fuse_nierozstrzygalne
        ), "Oczekiwano wkładek gG z kryterium SWZ nierozstrzygalnym (brak I-t, G-D2)"

        assert dobor["rekomendacja"] is None, (
            "ZNALEZISKO #4: żaden kandydat katalogu nie powinien dziś w pełni "
            f"kwalifikować się na tym poziomie zwarcia; rekomendacja={dobor['rekomendacja']}"
        )
        _STAN["dobor_zerohop"] = dobor

    def test_krok_07b_dobor_zabezpieczen_w_punkcie_znalezisko_bramki(self) -> None:
        """SAMO ZNALEZISKO co KROK 5b (ta sama fizyka Ik1_min, REUSE — patrz
        docstring `nn_device_selection.py`): dobór dla obwodu Silnika M1 (za
        kablem) jest zablokowany tą samą przyczyną (brak żyły powrotnej)."""
        model = get_enm(_CASE_ID)
        wynik = wybierz_aparat_dla_obwodu_nn(
            enm=model,
            station_ref=_REFS["station_ref"],
            bus_ref=_REFS["leaf_silnik_bus"],
            ib_a=40.0,
            iz_prime_a=_STAN["iz_prime_a_k2"],
            ik_max_ka=_STAN["ik_max_ka_leaf_silnik"],
        )
        assert wynik["status"] == "brak danych"
        assert wynik["missing_data"] == ["route"]

    # -- KROK 8: zmiana kabla → detekcja nieświeżości → przeliczenie -------

    def test_krok_08_zmiana_kabla_detekcja_niezswiezosci_i_przeliczenie(self, app_client) -> None:
        """Zmiana kabla K2 (120 mm² Al → 95 mm² Al, przez kanoniczną operację
        `assign_catalog_to_element`) unieważnia poprzedni bieg SC (hash modelu
        się zmienia — ten sam formalizm co `_aktualnosc_wobec_modelu` w
        `application/analyses/wytrzymalosc_cieplna_przewodow.py`: porównanie
        `run.snapshot_hash` z hashem BIEŻĄCEGO modelu przypadku) i daje
        GENUINE inny wynik liczbowy po przeliczeniu (dowód, że to nie cache)."""
        # Świeży bieg „ostatniej znanej" analizy USTALONY TU (nie z KROK 4 —
        # KROK 6 w międzyczasie zapisał warunki ułożenia kabla K2 do modelu
        # (`set_nn_cable_laying_conditions`), więc bieg z KROK 4 jest już
        # nieświeży z INNEGO powodu niż zmiana kabla poniżej; bramka
        # świeżości musi mieć jednoznaczny punkt odniesienia).
        model_przed = get_enm(_CASE_ID)
        hash_przed = compute_enm_hash(model_przed)
        sc_max_run = run_short_circuit_now(
            case_id=_CASE_ID, project_id=None, options={"fault_type": "3F", "scenario": "max"}
        )
        assert (
            sc_max_run.snapshot_hash == hash_przed
        ), "Świeżo policzony bieg SC MAX powinien być ŚWIEŻY względem modelu, na którym powstał"

        _op(
            app_client,
            _CASE_ID,
            "assign_catalog_to_element",
            {
                "element_ref": _REFS["k2_cable_ref"],
                "catalog_item_id": REF_KABEL_NN_MNIEJSZY,
                "catalog_namespace": "KABEL_NN",
            },
        )

        model_po = get_enm(_CASE_ID)
        hash_po = compute_enm_hash(model_po)
        assert hash_po != hash_przed, "Hash modelu musi się zmienić po zmianie kabla K2"

        # FLIP ŚWIEŻOŚCI: bieg SC MAX sprzed zmiany jest teraz NIEAKTUALNY
        # względem bieżącego modelu (dokładnie ten sygnał, który UI/API czyta
        # dla plakietki świeżości — `_aktualnosc_wobec_modelu`).
        assert (
            sc_max_run.snapshot_hash != hash_po
        ), "Bieg SC MAX sprzed zmiany kabla powinien stać się NIEŚWIEŻY względem nowego modelu"

        k2_po = next(b for b in model_po.branches if b.ref_id == _REFS["k2_cable_ref"])
        assert k2_po.catalog_ref == REF_KABEL_NN_MNIEJSZY
        assert k2_po.r_ohm_per_km != pytest.approx(
            0.253
        ), "r_ohm_per_km nie zmienił się po zmianie kabla"

        # PRZELICZENIE: nowy bieg SC MAX daje GENUINE INNY wynik (mniejszy
        # przekrój → większa impedancja → mniejszy Ikss na tej samej szynie).
        sc_max_po = run_short_circuit_now(
            case_id=_CASE_ID, project_id=None, options={"fault_type": "3F", "scenario": "max"}
        )
        assert sc_max_po.status == "FINISHED"
        assert sc_max_po.snapshot_hash == hash_po, "Nowy bieg musi być liczony na BIEŻĄCYM modelu"
        rows_po = {r["fault_node_id"]: r for r in (sc_max_po.raw_result or {}).get("results", [])}
        leaf_silnik_graph_id = ref_to_graph_id(_REFS["leaf_silnik_bus"])
        ikss_po = rows_po[leaf_silnik_graph_id]["ikss_a"]
        rows_przed = {
            r["fault_node_id"]: r for r in (sc_max_run.raw_result or {}).get("results", [])
        }
        ikss_przed = rows_przed[leaf_silnik_graph_id]["ikss_a"]
        assert ikss_przed == pytest.approx(
            _STAN["ikss_a_leaf_silnik_before"], rel=1e-9
        ), "Warunki ułożenia (KROK 6) nie powinny zmienić Ikss — sam sygnał świeżości się zmienia"
        assert ikss_po != pytest.approx(
            ikss_przed, rel=1e-9
        ), f"Ikss PRZED({ikss_przed}) == PO({ikss_po}) zmianie kabla — podejrzenie cache/brak przeliczenia"
        assert ikss_po < ikss_przed, (
            f"Mniejszy przekrój K2 (120→95 mm²) powinien DAĆ MNIEJSZY Ikss na Silniku M1: "
            f"przed={ikss_przed} A, po={ikss_po} A"
        )
        _STAN["sc_max_run_po_zmianie"] = sc_max_po
        _STAN["ikss_a_leaf_silnik_po_zmianie"] = ikss_po

    # -- KROK 9: trace / White Box -------------------------------------------

    def test_krok_09_trace_white_box_obecny(self) -> None:
        """Ślad White Box obecny i audytowalny dla PF i SC (kroki obliczeń
        jawne, wartości pośrednie dostępne)."""
        pf_run: CanonicalRun = _STAN["pf_run"]
        assert pf_run.power_flow_trace, "Brak power_flow_trace w biegu PF"
        pft = pf_run.power_flow_trace
        assert pft.get("iterations"), "Brak śladu iteracji Newtona"
        assert pft.get("ybus_trace") is not None, "Brak śladu Ybus"
        assert pft.get("slack_bus_id")

        sc_max_run: CanonicalRun = _STAN["sc_max_run"]
        rows = (sc_max_run.raw_result or {}).get("results", [])
        assert rows, "Brak wierszy SC MAX"
        leaf_silnik_graph_id = ref_to_graph_id(_REFS["leaf_silnik_bus"])
        row = next(r for r in rows if r["fault_node_id"] == leaf_silnik_graph_id)
        assert row["white_box_trace"], "Brak white_box_trace dla węzła Silnika M1 w biegu SC"
        for step in row["white_box_trace"]:
            assert isinstance(step, dict) and step, f"Krok White Box pusty: {step}"

        # Pętla zwarcia u źródła (krok 5) też niesie własny White Box.
        assert _STAN.get("swz_zerohop") is not None

    # -- KROK 10: pakiet dowodowy + raport -----------------------------------

    def test_krok_10a_pakiet_dowodowy_obwod_silnika_znalezisko_bramki(self, app_client) -> None:
        """Pakiet LV_CIRCUIT_VERIFICATION dla obwodu Silnika M1: 422 z uczciwym
        powodem (SAMO ZNALEZISKO co KROK 5b/7b — pakiet wewnętrznie odtwarza
        TĘ SAMĄ ścieżkę Ik1_min/route przez `lv_circuit_verification_binding.
        _petla_zwarcia_min`). Wzorzec kontraktu: `tests/api/test_nn_proof_api.py
        ::test_pack_brak_danych_daje_422_z_powodem_pl`."""
        payload = {
            "project_id": "proj-nn-e2e",
            "case_id": _CASE_ID,
            "run_id": str(_STAN["sc_max_run_po_zmianie"].id),
            "snapshot_id": "snap-krok10",
            "project_name": "MV-Design-PRO — bramka nN P0",
            "case_name": "Bramka końcowa P0 nN",
            "run_timestamp": datetime.now(UTC).isoformat(),
            "station_ref": _REFS["station_ref"],
            "bus_ref": _REFS["leaf_silnik_bus"],
            "breaker_ref": _REFS["aparat_k2_ref"],
            "segment_ref": _REFS["k2_cable_ref"],
            "p_mw": 0.022,
            "q_mvar": 0.013,
            "u_ll_kv": 0.4,
            "iz_katalogowe_a": _STAN["iz_katalogowe_a_k2"],
            "srodowisko": "grunt",
            "izolacja": "PVC",
            "temperatura_c": 20.0,
            "liczba_obwodow": 1,
            "rezystywnosc_gruntu_km_w": 1.0,
            "ik_max_ka": _STAN["ik_max_ka_leaf_silnik"],
            "vdrop_u_source_kv": _STAN["u_source_kv_silnik"],
            "vdrop_delta_u_total_kv": _STAN["delta_u_total_kv_silnik"],
        }
        resp = app_client.post("/api/nn-proof/circuit/pack", json=payload)
        assert (
            resp.status_code == 422
        ), f"Oczekiwano 422 (brak danych), jest {resp.status_code}: {resp.text[:500]}"
        assert (
            "żyły powrotnej" in resp.text
            or "route" in resp.text.lower()
            or resp.json().get("detail")
        )

        preview_resp = app_client.post("/api/nn-proof/circuit/preview", json=payload)
        assert preview_resp.status_code == 200
        assert preview_resp.json()["status"] == "brak danych"

    def test_krok_10b_pakiet_dowodowy_u_zrodla_dziala_i_deterministyczny(self, app_client) -> None:
        """Dowód pozytywny: pakiet LV_CIRCUIT_VERIFICATION DZIAŁA w pełni (ZIP,
        10 kroków) dla obwodu, gdzie dane są kompletne (u źródła, zero-hop) —
        mechanizm sam w sobie jest sprawny, blokuje go WYŁĄCZNIE brak danych
        katalogowych (krok 10a). Dwa pobrania → identyczny ZIP bajt-w-bajt
        (determinizm)."""
        payload = {
            "project_id": "proj-nn-e2e",
            "case_id": _CASE_ID,
            "run_id": str(_STAN["sc_max_run_po_zmianie"].id),
            "snapshot_id": "snap-krok10b",
            "project_name": "MV-Design-PRO — bramka nN P0",
            "case_name": "Bramka końcowa P0 nN",
            "run_timestamp": "2026-08-14T12:00:00Z",
            "station_ref": _REFS["station_ref"],
            "bus_ref": _REFS["rgnn_bus"],
            "breaker_ref": _REFS["aparat_k2_ref"],
            "segment_ref": _REFS["k2_cable_ref"],
            "p_mw": 0.022,
            "q_mvar": 0.013,
            "u_ll_kv": 0.4,
            "iz_katalogowe_a": _STAN["iz_katalogowe_a_k2"],
            "srodowisko": "grunt",
            "izolacja": "PVC",
            "temperatura_c": 20.0,
            "liczba_obwodow": 1,
            "rezystywnosc_gruntu_km_w": 1.0,
            "ik_max_ka": _STAN["ik_max_ka_leaf_silnik"],
            "vdrop_u_source_kv": _STAN["u_source_kv_silnik"],
            "vdrop_delta_u_total_kv": _STAN["delta_u_total_kv_silnik"],
        }
        resp1 = app_client.post("/api/nn-proof/circuit/pack", json=payload)
        assert resp1.status_code == 200, resp1.text[:1000]
        assert resp1.headers["content-type"] == "application/zip"
        import io
        from zipfile import ZipFile

        with ZipFile(io.BytesIO(resp1.content)) as zf:
            names = set(zf.namelist())
            assert "proof_pack/proof.json" in names
            proof_json = zf.read("proof_pack/proof.json").decode("utf-8")
        assert '"proof_type": "LV_CIRCUIT_VERIFICATION"' in proof_json
        assert '"step_number": 10' in proof_json

        resp2 = app_client.post("/api/nn-proof/circuit/pack", json=payload)
        assert resp2.status_code == 200
        assert (
            hashlib.sha256(resp1.content).hexdigest() == hashlib.sha256(resp2.content).hexdigest()
        ), "Pakiet dowodowy nie jest deterministyczny (2 pobrania dają różny ZIP)"

    def test_krok_10c_raport_json_sekcje_nn(self, app_client) -> None:
        """Sekcje raportu nN (`POST /api/nn-proof/circuit/report`) — SAMO
        ZNALEZISKO #1 dla obwodu Silnika M1 (raport wewnętrznie wymaga TEJ
        SAMEJ trasy Ik1_min co krok 5b/7b/10a — cały raport, nie tylko SWZ,
        wraca `status: brak danych`), więc dowód „wszystkie sekcje obecne"
        prowadzimy u źródła (zero-hop, jak krok 10b) — mechanizm sam w sobie
        sprawny."""
        resp_blocked = app_client.post(
            "/api/nn-proof/circuit/report",
            json={
                "case_id": _CASE_ID,
                "station_ref": _REFS["station_ref"],
                "bus_ref": _REFS["leaf_silnik_bus"],
                "breaker_ref": _REFS["aparat_k2_ref"],
                "run_id": str(_STAN["sc_max_run_po_zmianie"].id),
                "revision_id": str(get_enm(_CASE_ID).header.revision),
                "przypadek_decydujacy": "TR",
                "ib_a": 40.0,
                "iz_prime_a": _STAN["iz_prime_a_k2"],
                "ik_max_ka": _STAN["ik_max_ka_leaf_silnik"],
                "vdrop_u_source_kv": _STAN["u_source_kv_silnik"],
                "vdrop_delta_u_total_kv": _STAN["delta_u_total_kv_silnik"],
            },
        )
        assert resp_blocked.status_code == 200
        assert resp_blocked.json()["status"] == "brak danych"

        resp = app_client.post(
            "/api/nn-proof/circuit/report",
            json={
                "case_id": _CASE_ID,
                "station_ref": _REFS["station_ref"],
                "bus_ref": _REFS["rgnn_bus"],
                "breaker_ref": _REFS["aparat_k2_ref"],
                "run_id": str(_STAN["sc_max_run_po_zmianie"].id),
                "revision_id": str(get_enm(_CASE_ID).header.revision),
                "przypadek_decydujacy": "TR",
                "ib_a": 40.0,
                "iz_prime_a": _STAN["iz_prime_a_k2"],
                "ik_max_ka": _STAN["ik_max_ka_leaf_silnik"],
                "vdrop_u_source_kv": _STAN["u_source_kv_silnik"],
                "vdrop_delta_u_total_kv": _STAN["delta_u_total_kv_silnik"],
            },
        )
        assert resp.status_code == 200, resp.text[:1000]
        body = resp.json()
        assert body["status"] == "OK"
        for sekcja in (
            "dane_zrodlowe",
            "transformator",
            "odcinki",
            "delta_u",
            "zwarcia",
            "swz",
            "dobor",
        ):
            assert sekcja in body, f"Brak sekcji '{sekcja}' w raporcie nN"
        assert "status" in body["swz"]

    # -- Determinizm całego łańcucha (2×) -------------------------------------

    def test_krok_11_determinizm_calego_lancucha_dwoch_przebiegow(self, app_client) -> None:
        """Cały łańcuch budowy substratu + SC MAX powtórzony na DWÓCH
        NIEZALEŻNYCH case_id daje identyczny znormalizowany hash modelu i
        identyczny wynik SC MAX na Silniku M1 — dowód determinizmu end-to-end
        (seed stały: wszystkie dane wejściowe w `_build_substrate` są stałymi
        literałami, zero losowości)."""
        case_id_a = f"{_CASE_ID}-det-a"
        case_id_b = f"{_CASE_ID}-det-b"
        refs_a = _build_substrate(app_client, case_id_a)
        refs_b = _build_substrate(app_client, case_id_b)

        # `compute_enm_hash` — TA SAMA funkcja kanoniczna, którą liczy
        # `header.hash_sha256`/`CanonicalRun.snapshot_hash` (KROK 8) — jest
        # świadomie ślepa na pole `id` (UUID instancji Pydantic, losowe przy
        # KAŻDYM `model_validate`/odczycie ze store'u, NIE jest częścią treści
        # modelu — `ref_id` jest deterministycznym identyfikatorem domenowym).
        # Ręczne hashowanie całego `model_dump()` (bez wyłączenia `id`) dawałoby
        # fałszywy alarm niedeterminizmu na polu, które nigdy nie miało być
        # stabilne — nie duplikujemy tej reguły drugi raz, tylko wołamy JEDNO
        # źródło prawdy.
        hash_a = compute_enm_hash(get_enm(case_id_a))
        hash_b = compute_enm_hash(get_enm(case_id_b))
        assert (
            hash_a == hash_b
        ), "Dwie niezależne budowy tego samego substratu dają RÓŻNY hash kanoniczny"

        sc_a = run_short_circuit_now(
            case_id=case_id_a, project_id=None, options={"fault_type": "3F", "scenario": "max"}
        )
        sc_b = run_short_circuit_now(
            case_id=case_id_b, project_id=None, options={"fault_type": "3F", "scenario": "max"}
        )
        leaf_a = ref_to_graph_id(refs_a["leaf_silnik_bus"])
        leaf_b = ref_to_graph_id(refs_b["leaf_silnik_bus"])
        rows_a = {r["fault_node_id"]: r for r in (sc_a.raw_result or {}).get("results", [])}
        rows_b = {r["fault_node_id"]: r for r in (sc_b.raw_result or {}).get("results", [])}
        assert rows_a[leaf_a]["ikss_a"] == pytest.approx(
            rows_b[leaf_b]["ikss_a"], rel=1e-12
        ), "Ikss na Silniku M1 różni się między dwiema niezależnymi, identycznymi budowami"
