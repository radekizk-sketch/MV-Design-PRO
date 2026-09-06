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
run_power_flow_now` / `run_short_circuit_now` (cienkie opakowania `create_run`+
`execute_run` — do karty CV-4.3-A4/K5.1 wołane też przez skasowane trasy
`POST /api/cases/{id}/runs/{power-flow,short-circuit}`; dziś te same funkcje
wołane BEZPOŚREDNIO tu i w testach silnika, niezależnie od HTTP), oraz publiczne serwisy
warstwy `application/analyses/*` (te same, których używają GET-y
`/enm/fault-loop-point`, `/enm/swz`, `/enm/nn-device-selection`) i
`POST /api/nn-proof/circuit/pack|report`. Zero sięgania po prywatne
`_execute_*`.

KARTA NAPRAWA-A (2026-08-14) — FLIP tego pliku z fail-closed na pełny
przebieg. Cztery ZNALEZISKA BRAMKI opisane niżej to STAN HISTORYCZNY (co
było zepsute PRZED kartą) — zachowane jako uzasadnienie kontekstu dla
czytelnika, NIE jako aktualny opis testów poniżej. Karta NAPRAWA-A:
  (1) zasiliła żyłę powrotną PE/PEN (R z tożsamości konstrukcyjnej, X z
      danych producenta) dla WSZYSTKICH 17 pozycji `kab_nn_*`
      (`mv_auxiliary_catalog.py::_RETURN_CONDUCTOR_NOTE_NN`) — ZNALEZISKO #1
      NAPRAWIONE u źródła (dane katalogowe), mechanizm fail-closed
      NIEZMIENIONY (dalej odmówiłby liczenia bez danych — teraz po prostu MA
      dane).
  (2) dodała rodzinę MCB Icn=10 kA (30 rekordów, obok istniejącej 6 kA,
      `mv_auxiliary_catalog.py::get_all_lv_breaker_mcb_types`) — poszerza
      pulę kandydatów zdolnych spełnić kryterium zdolności wyłączania.
  (3) NIE naprawiła (warunek karty niespełniony — LUKA KONSUMENTA, nie luka
      danych): nastawy wyzwalacza MCCB (Ir/Isd/Ii/tr/tsd) — `_kryterium_i2`
      dla MCCB jest twardo zakodowane na NIEROZSTRZYGALNE niezależnie od
      danych; `i2t_prearc_a2s` wkładek gG — dwa realne źródła (ETI WT-NH,
      Eaton Bussmann 10164) rozjechane ~30-60%, nie do uczciwego pogodzenia.
  (4) NAPRAWA-B (osobna, wcześniejsza karta) zabiła TRZECIE ZNALEZISKO
      (wyścig materializacji fantomowych odbiorów) U ŹRÓDŁA, znacznikiem
      `meta.nn_field_origin` czytanym przez
      `catalog_completion.py::_pochodzi_z_operacji_domenowej` — substrat
      poniżej NIE WOŁA już usuwania fantomów (dawny warkaround
      `_usun_fantomowe_odbiory_migracji`, USUNIĘTY tą kartą) i mimo to
      Silnik M1/Odbiór K3 pojawiają się DOKŁADNIE RAZ (KROK 0) — to jest
      DOWÓD naprawy NAPRAWA-B, nie tylko deklaracja.

KARTA D3 (2026-08-14) — FLIP DRUGI: zabity trwały fantom odbioru ST-03, który
NAPRAWA-A świadomie zostawiła poza zakresem (patrz stan historyczny niżej,
TRZECIE ZNALEZISKO BRAMKI). Diagnoza pomiarem krok-po-kroku substratu
(zrzut `enm.loads`/`substation.meta.nn_field_specs` po KAŻDEJ operacji
domenowej) wykazała: fantom materializował się natychmiast PO
`insert_station_on_segment_sn`, na WBUDOWANYM starterze „Odpływ nN 1" — nie
przez wyścig NAPRAWA-B (ten dowodnie zabity, patrz pkt 4), tylko przez
`enm.domain_operations._build_nn_field_specs` (wspólny builder
`insert_station_on_segment_sn`/`append_station_on_endpoint`), który
FABRYKOWAŁ jeden nieproszony odpływ (`max(1, len(feeders))`) nawet wtedy, gdy
wołający NIE dotknął `nn_block` w ogóle. Taki wpis, bez własnego odbioru i
bez znacznika `nn_field_origin` (marker zapisują WYŁĄCZNIE
`add_nn_outgoing_field`/`_append_nn_source_meta_field`), był dla migracji
katalogowej NIEODRÓŻNIALNY od prawdziwego legacy odpływu — migracja SŁUSZNIE
wg WŁASNEGO kryterium materializowała mu odbiór przy KAŻDYM odczycie modelu.
Naprawa u źródła (`_build_nn_field_specs`): brak klucza
`outgoing_feeders_nn_count` w `nn_block` daje TERAZ zero odpływów (nie floor
„co najmniej 1") — jawny count (nawet 1) tworzy tyle odpływów i ZOSTAJE
legalnym kandydatem migracji (NAPRAWA-B pin, `tests/enm/
test_catalog_completion_cosphi.py::
test_sekwencja_kreatora_p01_nie_zostawia_fantomu_a_legacy_dalej_migruje`,
zielony bez modyfikacji). Realny „Kreator stacji" (`ui2/kreatory/stacja/
stacjaModel.ts`) ZAWSZE wysyła `outgoing_feeders_nn_count` jawnie — floor nie
był potrzebny żadnemu realnemu wywołaniu z UI. KROK 0 poniżej asertuje TERAZ
ZERO fantomów (nie jeden trwały) — dowód pomiarem, nie deklaracja.

KARTA D1 (nN, „runda 8 — PEŁNY WERDYKT nN", 2026-08-14) — NAPRAWIA punkt (3)
powyżej dla MCCB (część „nastawy wyzwalacza MCCB"): `LVApparatusType.
ir_range/isd_range/ii_range/tr_range/tsd_range` zasilone dla WSZYSTKICH 11
rekordów WYLACZNIK_GLOWNY/WYLACZNIK_ODPLYWOWY (ABB SACE Emax2/Tmax XT, dwa
niezależne źródła — `mv_auxiliary_catalog.py`), `KandydatAparatuNn` niesie
teraz `ir_a/isd_a/ii_a/tr_s/tsd_s` (RESOLWOWANE, nie zakres — górny kraniec
regulacji, konserwatywne), `_kryterium_i2` woła `protection_lv_curves.
compute_mccb_point` dla MCCB (REUSE, było twardo NIEROZSTRZYGALNE), `swz/
werdykt.py::ocen_swz` ma nową gałąź `typ="MCCB"` (Ia z nastawy Ii). Wkładka
gG (`i2t_prearc_a2s`, druga połowa punktu (3)) NIE naprawiona tą kartą —
poza zakresem D1 (cel D2, osobna karta). Zobacz FLIP w `test_krok_07_*`
poniżej dla pełnego uzasadnienia i dowodu numerycznego.

ZNALEZISKO BRAMKI #1 — STAN HISTORYCZNY, NAPRAWIONY (patrz wyżej, pkt 1):
katalog kabli nN (`network_model/catalog/mv_auxiliary_catalog.py`, WSZYSTKIE
17 pozycji `kab_nn_*`) NIE MIAŁ danych żyły powrotnej PE/PEN
(`return_conductor_r_ohm_per_km_20c` / `return_conductor_x_ohm_per_km` —
oba `None` dla każdej pozycji). `application.analyses.fault_loop.route.
route_segments`/`route_segments_min_scenario` SĄ fail-closed (§0.1 karty
P0.6, „zero fabrykacji") i podnoszą `RouteExtractionError`, gdy KTÓRYKOLWIEK
kabel na trasie nie ma tych dwóch pól — mechanizm ten NIE ZMIENIŁ SIĘ, tylko
dane, na których teraz operuje, są kompletne. Skutek PRZED kartą: pętla
zwarcia w DOWOLNYM punkcie nN poza szyną nN transformatora
(`build_fault_loop_view_at_point`, `build_feeder_fault_loop_view`), SWZ
(`build_swz_view`) i dobór zabezpieczeń (`wybierz_aparat_dla_obwodu_nn`) —
oraz pakiet dowodowy LV_CIRCUIT_VERIFICATION, który wewnętrznie odtwarza TĘ
SAMĄ ścieżkę (`lv_circuit_verification_binding._petla_zwarcia_min`) — były
zablokowane dla KAŻDEGO odbioru/aparatu za choćby jednym kablem nN. PO
karcie: KROK 5b/7b/10a/10c liczą PEŁNY wynik w tych punktach.

DRUGIE ZNALEZISKO BRAMKI (dokumentowane, NIE naprawiane w tym pliku — poza
zakresem karty NAPRAWA-A): brama katalogowa produkcyjnego API
(`api/domain_ops_policy.py::CATALOG_REQUIRED_OPERATIONS`) wymaga
`catalog_binding`/`catalog_ref` dla `add_nn_outgoing_field` i `add_nn_load`,
ale realny kreator „Pole odpływowe nN" (`ui2/kreatory/pole-nn/
KreatorPolaNn.tsx`, docstring: „kreator NIE POKAZUJE pickera katalogu —
backend go dla tej operacji nie honoruje") NIGDY go nie wysyła — realne
przesłanie tego formularza przez produkcyjny endpoint dostałoby `422
catalog.ref_required`. Test poniżej dodaje `catalog_ref` ręcznie (wzorem
`tests/api/test_brama_katalogowa_api_inwentarz.py`), żeby w ogóle przejść
bramę — kontrakt frontend/backend jest rozjechany.

TRZECIE ZNALEZISKO BRAMKI — STAN HISTORYCZNY, NAPRAWIONY przez NAPRAWA-B
(patrz wyżej, pkt 4): `enm.catalog_completion.
complete_station_loads_from_nn_feeders` uruchamiał się na KAŻDYM odczycie
`enm.store.get_enm` i materializował domyślny odbiór 30 kW na KAŻDYM polu
odpływowym nN bez WŁASNEGO odbioru — W CHWILI ODCZYTU, nie po zakończeniu
edycji użytkownika. Ponieważ jedyny możliwy w tym systemie tor tworzenia
pola i jego odbioru to DWIE OSOBNE operacje domenowe
(`add_nn_outgoing_field` → `add_nn_load`, dwa osobne żądania
`POST /domain-ops`, każde zaczynające się od `_get_enm`), drugie żądanie
zawsze odczytywało model PO tym, jak pierwsze już zmaterializowało fantom na
TYM SAMYM `feeder_ref` — prawdziwy odbiór lądował OBOK fantomu (podwojona
moc na jednej szynie, bez żadnego ostrzeżenia). NAPRAWA-B naprawiła to U
ŹRÓDŁA (znacznik `meta.nn_field_origin` ustawiany przez kanoniczną operację
`add_nn_outgoing_field`, czytany przez `catalog_completion.py::
_pochodzi_z_operacji_domenowej` — pole utworzone operacją domenową jest
wykluczone z migracyjnej materializacji domyślnego odbioru). KROK 0 poniżej
buduje substrat BEZ ŻADNEGO usuwania fantomów i asertuje wprost, że Silnik
M1/Odbiór K3 pojawiają się dokładnie raz — DOWÓD naprawy, nie deklaracja.
NAPRAWA-B zostawiła świadomie poza zakresem (INNA przyczyna źródłowa, nie ten
sam defekt): stacja ST-03 dostawała WBUDOWANY domyślny „Odpływ nN 1" (starter
kreatora, tworzony PRZEZ `insert_station_on_segment_sn`, NIE przez
`add_nn_outgoing_field`) — to pole nigdy nie dostawało znacznika
`nn_field_origin` (bo nie przechodziło przez operację, która go ustawia),
więc jego fantomowy odbiór 30 kW był TRWAŁY (regenerował się przy każdym
odczycie) — jeden, znany, udokumentowany artefakt, osobny od naprawionego
wyścigu K2/K3. KARTA D3 zabiła TEN fantom u JEGO źródła (patrz wyżej) —
`_build_nn_field_specs` przestała FABRYKOWAĆ ten starter, gdy wołający nie
zażądał żadnego odpływu (`nn_block` bez `outgoing_feeders_nn_count`) — KROK 0
asertuje dziś ZERO fantomów, nie jeden trwały.

CZWARTE ZNALEZISKO BRAMKI — STAN HISTORYCZNY sprzed karty NAPRAWA-A, NAPRAWIONE
DALEJ przez kartę D1 (patrz wyżej): `wybierz_aparat_dla_obwodu_nn` NIE MOGŁA
PRZED NAPRAWA-A wydać pełnej rekomendacji dla ŻADNEGO obwodu w ŻADNEJ sieci nN
zbudowanej z domyślnego katalogu — nawet u źródła (zero-hop, jedyny punkt
gdzie Ik1_min był w ogóle policzalny, patrz ZNALEZISKO #1), gdzie Ik″max jest
z definicji NAJWYŻSZY w całej sieci nN (tu: ≈31,86 kA). PO NAPRAWA-A: u RGnN
(KROK 7) rekomendacja POZOSTAWAŁA None (nawet nowa rodzina MCB 10 kA
<< 31,86 kA — MCCB blokowany LUKĄ KONSUMENTA, nie fizyką); GŁĘBIEJ w sieci,
na obwodzie Silnika M1 (KROK 7b, Ik″max≈8,4 kA — poniżej 10 kA), rekomendacja
BYŁA już PEŁNA (MCB B40, Icn 10 kA) — PIERWSZA w tym łańcuchu pozytywna
rekomendacja aparatu dla realnego obwodu, NIEZMIENIONA przez kartę D1
(zweryfikowane wprost w `test_krok_07b_*`). PO KARCIE D1: u RGnN (KROK 7,
FLIP) rekomendacja jest TERAZ PEŁNA (MCCB `cb_nn_400a`, Icu 50 kA) — MCCB
(kryterium I2) jest teraz DECYZYJNE wszędzie w katalogu (WSZYSTKIE 11
rekordów niosą nastawy). Wkładka gG (kryterium SWZ) POZOSTAJE
NIEROZSTRZYGALNA wszędzie — rozjazd źródeł `i2t_prearc_a2s`, poza zakresem
karty D1 (cel D2, osobna karta).
"""

from __future__ import annotations

import hashlib
import importlib.util
import math
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
#: CV-1-W: przypadek musi należeć do REALNEGO projektu w bazie (inwariant I-2,
#: `application/twin_key.py`) — wartości ostateczne nadaje fixture
#: `_przypadek_lancucha` (scope="module", autouse) PRZED pierwszym testem tego
#: pliku; puste stringi tu to wyłącznie placeholdery typu. `_KLUCZ` jest
#: kluczem magazynu ENM dla `_CASE_ID` (stały przez cały plik — jeden projekt,
#: jeden case_id) — kroki BEZ `app_client` w sygnaturze (04, 05, 05b, 07, 07b)
#: potrzebują go do wywołań solvera wprost i nie mają skąd wziąć
#: `uow_factory` inaczej niż z tego modułowego globala.
_CASE_ID: str = ""
_KLUCZ: str = ""


# ---------------------------------------------------------------------------
# Baza + para projekt/przypadek WSPÓLNE dla całego pliku (CV-1-W): magazyn ENM
# jest teraz kluczowany kluczem PROJEKTU, tłumaczonym z `case_id` zapytaniem do
# bazy (`application/twin_key.py::klucz_twin_dla_przypadku`) — a kroki 0-10c
# dzielą JEDEN model (`enm.store` global, resetowany raz w KROKU 0) pod JEDNYM
# `case_id`, więc potrzebują JEDNEJ bazy żywej przez CAŁY plik, nie
# fabrykowanej od nowa (pustej) przy każdym `app_client`. Stąd własny, modułowy
# `uow_factory` — zamiast funkcyjnego z korzenia `tests/conftest.py`.
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def _modul_uow_factory(tmp_path_factory):
    if not SQLALCHEMY_AVAILABLE:
        pytest.skip("sqlalchemy nie jest dostępne w środowisku testowym")

    from infrastructure.persistence.db import (
        create_engine_from_url,
        create_session_factory,
        init_db,
    )
    from infrastructure.persistence.unit_of_work import build_uow_factory

    db_path = tmp_path_factory.mktemp("nn-full-chain") / "test.db"
    engine = create_engine_from_url(f"sqlite+pysqlite:///{db_path}")
    init_db(engine)
    session_factory = create_session_factory(engine)
    yield build_uow_factory(session_factory)
    engine.dispose()


@pytest.fixture(scope="module", autouse=True)
def _przypadek_lancucha(_modul_uow_factory):
    """Utwórz REALNY projekt + przypadek RAZ dla całego pliku (CV-1-W).

    Kroki 0-10c dzielą JEDEN `case_id` (`_CASE_ID`, moduł-global) — dokładnie
    tak samo jak dzielą JEDEN model `enm.store` (reset tylko w KROKU 0).
    """
    global _CASE_ID, _KLUCZ
    from domain.models import Project
    from domain.study_case import StudyCase
    from enm.klucz_twin import klucz_twin_projektu

    project_id = uuid4()
    case_id = uuid4()
    with _modul_uow_factory() as uow:
        uow.projects.add(Project(id=project_id, name="nN pełny łańcuch E2E"), commit=False)
        uow.cases.add_study_case(
            StudyCase(id=case_id, project_id=project_id, name="Przypadek łańcucha"),
            commit=False,
        )
        uow.commit()
    _CASE_ID = str(case_id)
    _KLUCZ = klucz_twin_projektu(project_id)
    yield


def _nowy_przypadek(client) -> str:
    """Utwórz DODATKOWY projekt + przypadek NIEZALEŻNY od `_CASE_ID`.

    KROK 11 (determinizm) buduje DWA NIEZALEŻNE modele od zera — CV-1 wiąże
    model z PROJEKTEM, więc dwa niezależne `case_id` muszą wskazywać DWA RÓŻNE
    projekty (ten sam projekt oznaczałby TEN SAM model — druga budowa
    dokładałaby się do pierwszej zamiast dać niezależną kopię).
    """
    from domain.models import Project
    from domain.study_case import StudyCase

    uow_factory = client.app.state.uow_factory
    project_id = uuid4()
    case_id = uuid4()
    with uow_factory() as uow:
        uow.projects.add(Project(id=project_id, name="nN łańcuch — determinizm"), commit=False)
        uow.cases.add_study_case(
            StudyCase(id=case_id, project_id=project_id, name="Przypadek determinizmu"),
            commit=False,
        )
        uow.commit()
    return str(case_id)


def _klucz(client, case_id: str) -> str:
    """Klucz magazynu ENM dla `case_id` — TO SAMO tłumaczenie co warstwa API (CV-1)."""
    from application.twin_key import klucz_twin_dla_przypadku

    return klucz_twin_dla_przypadku(case_id, client.app.state.uow_factory)


# ---------------------------------------------------------------------------
# Fixture TestClient — lokalna kopia wzorca `tests/api/conftest.py::app_client`
# (ten katalog to `tests/e2e/`, więc fixture sąsiada nie jest widoczna przez
# łańcuch conftest). CV-1-W: `uow_factory` to `_modul_uow_factory` MODUŁOWY
# powyżej (WSPÓLNY dla całego pliku), nie funkcyjny root
# `tests/conftest.py::uow_factory` — patrz uzasadnienie przy
# `_modul_uow_factory`.
# ---------------------------------------------------------------------------


@pytest.fixture()
def app_client(_modul_uow_factory):
    if not FASTAPI_AVAILABLE:
        pytest.skip("fastapi nie jest dostępne w środowisku testowym")
    if not SQLALCHEMY_AVAILABLE:
        pytest.skip("sqlalchemy nie jest dostępne w środowisku testowym")

    from api.dependencies import get_uow_factory
    from api.main import app
    from fastapi.testclient import TestClient

    def _override_get_uow_factory():
        return _modul_uow_factory

    app.dependency_overrides[get_uow_factory] = _override_get_uow_factory
    app.state.uow_factory = _modul_uow_factory
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


def _build_substrate(client, case_id: str) -> dict[str, Any]:
    """Buduje GPZ→SN→ST-03(TR)→RGnN→K1→R1→{K2 silnik, K3 odbiór, K4 PV, K5 BESS}.

    Wyłącznie operacje domenowe kanoniczne (te same, których używają kreatory
    ui2/kreatory/*) — zero ręcznego składania ENM. Zwraca referencje potrzebne
    kolejnym krokom.

    KARTA NAPRAWA-A: substrat NIE usuwa już fantomowych odbiorów migracji
    (dawny warkaround `_usun_fantomowe_odbiory_migracji`, USUNIĘTY — NAPRAWA-B
    zabiła TRZECIE ZNALEZISKO BRAMKI u źródła, patrz docstring modułu). Silnik
    M1 i Odbiór K3 pojawiają się DOKŁADNIE RAZ mimo braku usuwania — dowód
    naprawy weryfikowany wprost w `test_krok_00_substrat_buduje_sie_bez_bledow`.
    """
    klucz = _klucz(client, case_id)
    _op(
        client,
        case_id,
        "add_grid_source_sn",
        {
            "voltage_kv": 15.0,
            "sk3_mva": 250.0,
            "rx_ratio": 0.1,
            "catalog_ref": REF_ZRODLO_SN,
            "hv_voltage_kv": 110.0,
            "transformer_sn_mva": 25.0,
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

    enm = get_enm(klucz)
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

    enm = get_enm(klucz)
    station = next(s for s in enm.substations if s.name == "ST-03")
    station_ref = station.ref_id
    rgnn_bus = next(
        b.ref_id for b in enm.buses if b.ref_id in station.bus_refs and b.voltage_kv == 0.4
    )
    # KARTA D3: ST-03 NIE dostaje żadnego wbudowanego domyślnego "Odpływu
    # nN 1" — payload powyżej świadomie NIE niesie `nn_block`, więc
    # `_build_nn_field_specs` (naprawiona tą kartą) nie fabrykuje nieproszonego
    # startera i migracja katalogowa nie ma czego materializować na ST-03
    # (dawny trwały fantom, poza zakresem NAPRAWA-B — patrz docstring modułu,
    # sekcja "KARTA D3"). Zweryfikowane wprost jako ZERO fantomów w
    # `test_krok_00_substrat_buduje_sie_bez_bledow`.

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
    enm = get_enm(klucz)
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
    enm = get_enm(klucz)
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
    enm = get_enm(klucz)
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
    # KARTA NAPRAWA-A: PRZED naprawą NAPRAWA-B, `add_nn_load` powyżej
    # odczytywał model PRZEZ `_get_enm`, który w MIĘDZYCZASIE (od utworzenia
    # pola K2 do teraz) już materializował fantomowy odbiór 30 kW na TYM
    # SAMYM `feeder_k2` (podwójny odbiór na jednej szynie) — NAPRAWA-B
    # naprawiła to znacznikiem `nn_field_origin` u źródła (patrz docstring
    # modułu), więc TU już nic nie trzeba usuwać. `test_krok_00_substrat_
    # buduje_sie_bez_bledow` weryfikuje wprost, że Silnik M1 jest JEDYNYM
    # odbiorem na `feeder_k2`.

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
        błędu, WYŁĄCZNIE operacjami domenowymi przez produkcyjny endpoint.

        FLIP (karta NAPRAWA-A): dawniej ten test wywoływał
        `_usun_fantomowe_odbiory_migracji` (usuwaną teraz funkcję) PO każdym
        kroku budowy, żeby posprzątać po wyścigu `add_nn_outgoing_field` →
        `add_nn_load` (TRZECIE ZNALEZISKO BRAMKI). NAPRAWA-B (osobna,
        wcześniejsza karta) zabiła ten wyścig U ŹRÓDŁA — `_build_substrate`
        poniżej NIE usuwa już NICZEGO, a mimo to Silnik M1 i Odbiór K3
        pojawiają się DOKŁADNIE RAZ na swoich odpływach. To jest DOWÓD
        naprawy (nie deklaracja): gdyby NAPRAWA-B regresowała, poniższe
        asercje `count(...) == 1` pękłyby natychmiast z konkretną, czytelną
        przyczyną (duplikat na feeder_k2/feeder_k3).

        FLIP DRUGI (karta D3): dawniej ten test asertował DOKŁADNIE JEDEN
        trwały fantom (ST-03, „Odpływ nN 1", starter wbudowany przez
        `insert_station_on_segment_sn` — poza zakresem NAPRAWA-B, INNA
        przyczyna źródłowa). Karta D3 zabiła TEN fantom u JEGO źródła
        (`enm.domain_operations._build_nn_field_specs` przestała FABRYKOWAĆ
        nieproszony starter, gdy `nn_block` nie niesie jawnego
        `outgoing_feeders_nn_count` — patrz docstring modułu, sekcja „KARTA
        D3") — substrat poniżej NIE wysyła `nn_block` w ogóle przy
        `insert_station_on_segment_sn`, więc ST-03 dostaje ZERO domyślnych
        odpływów nN (tylko wyłącznik główny). Poniższa asercja `count == 0`
        jest DOWODEM pomiarem, nie deklaracją: gdyby fabrykacja startera
        wróciła, pękłaby natychmiast z konkretną, czytelną przyczyną."""
        reset_enm_store()
        refs = _build_substrate(app_client, _CASE_ID)
        _REFS.update(refs)

        enm = get_enm(_KLUCZ)

        # DOWÓD NAPRAWY NAPRAWA-B: Silnik M1 i Odbiór K3 pojawiają się
        # DOKŁADNIE RAZ, mimo że substrat NIE wywołał żadnego usuwania —
        # przed NAPRAWA-B każdy z nich miałby OBOK siebie fantomowy odbiór
        # 30 kW/cosφ=0,92 na TYM SAMYM `feeder_ref` (ten sam wyścig
        # `add_nn_outgoing_field`→`add_nn_load`, dwa osobne żądania
        # `POST /domain-ops`, dwa niezależne odczyty `_get_enm`).
        silniki_m1 = [ld for ld in enm.loads if ld.name == "Silnik M1 (odbiór, P0 uproszczenie)"]
        odbiory_k3 = [ld for ld in enm.loads if ld.name == "Odbiór K3"]
        assert len(silniki_m1) == 1, (
            f"NAPRAWA-B regresja: oczekiwano DOKŁADNIE 1 Silnika M1 na feeder_k2, "
            f"jest {len(silniki_m1)} — wyścig add_nn_outgoing_field→add_nn_load wrócił"
        )
        assert len(odbiory_k3) == 1, (
            f"NAPRAWA-B regresja: oczekiwano DOKŁADNIE 1 Odbioru K3 na feeder_k3, "
            f"jest {len(odbiory_k3)} — wyścig add_nn_outgoing_field→add_nn_load wrócił"
        )
        assert not (
            isinstance(silniki_m1[0].meta, dict)
            and silniki_m1[0].meta.get("completion_source") == "station_catalog_migration"
        ), "Silnik M1 NIE MOŻE sam być fantomem migracji — to zaprojektowany odbiór"

        # DOWÓD NAPRAWY D3: KARTA D3 zabiła u źródła fantom ST-03, który
        # NAPRAWA-B świadomie zostawiła poza zakresem (`_build_nn_field_specs`
        # przestała fabrykować nieproszony starter „Odpływ nN 1" gdy
        # `insert_station_on_segment_sn`/`append_station_on_endpoint` dostają
        # `nn_block` bez jawnego `outgoing_feeders_nn_count` — patrz docstring
        # modułu, sekcja „KARTA D3"). ZERO odbiorów migracji katalogowej w
        # CAŁYM modelu — count DOKŁADNY, per stacja (jedyna stacja SN/nN
        # substratu to ST-03, więc "w modelu" i "per stacja" to tu ten sam
        # zbiór): gdyby fabrykacja startera wróciła (regresja tej karty),
        # asercja pęknie NATYCHMIAST z konkretną nazwą fantomu.
        odbiory_migracji = [
            ld
            for ld in enm.loads
            if isinstance(ld.meta, dict)
            and ld.meta.get("completion_source") == "station_catalog_migration"
        ]
        assert odbiory_migracji == [], (
            f"Oczekiwano ZERO fantomów migracji katalogowej (karta D3 zabiła "
            f"ostatni, ST-03 — patrz docstring modułu), jest: "
            f"{[ld.name for ld in odbiory_migracji]}"
        )

        # Fizyczna inwariant końcowa PO karcie D3: 2 odbiory (Silnik M1 +
        # Odbiór K3) — bez trwałego fantomu ST-03, który dawniej podnosił
        # liczbę do 3. ST-03 traci swój domyślny starterowy odpływ (i jego
        # promowaną szynę/aparat), więc progi liczby szyn/gałęzi schodzą o
        # jeden element każdy względem stanu sprzed karty D3 — nadal `>=`,
        # bo substrat ma DUŻO więcej elementów niż ten jeden brakujący.
        assert len(enm.buses) >= 9, f"Za mało szyn po budowie: {len(enm.buses)}"
        assert len(enm.branches) >= 6, f"Za mało gałęzi po budowie: {len(enm.branches)}"
        assert len(enm.transformers) == 2, "Oczekiwano 2 transformatorów (GPZ WN/SN + TR SN/nN)"
        assert len(enm.loads) == 2, (
            f"Oczekiwano 2 odbiorów (Silnik M1 + Odbiór K3, ZERO fantomów po karcie D3), "
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
        `run_power_flow_now` (cienkie opakowanie `create_run`+`execute_run`,
        `enm/canonical_analysis.py`; wywoływane wprost, niezależnie od HTTP)."""
        pf_run = run_power_flow_now(
            case_id=_CASE_ID, klucz_twin=_KLUCZ, project_id=None, options={}
        )
        assert pf_run.status == "FINISHED", f"PF run nie zakończony: {pf_run.error_message}"
        result_v1 = (pf_run.raw_result or {}).get("result_v1") or {}
        assert result_v1.get("converged") is True, f"PF nie zbieżny: {result_v1}"
        assert result_v1.get("iterations_count", 0) > 0

        bus_results = result_v1.get("bus_results") or []
        assert len(bus_results) == len(
            get_enm(_KLUCZ).buses
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
        model = get_enm(_KLUCZ)
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
        `run_short_circuit_now` (cienkie opakowanie `create_run`+`execute_run`,
        wywoływane wprost, niezależnie od HTTP). c per pasmo napięcia
        (IEC 60909 Tab. 1): nN → c_max=1,05, c_min=0,95 — AUTO, bez override."""
        sc_max = run_short_circuit_now(
            case_id=_CASE_ID,
            klucz_twin=_KLUCZ,
            project_id=None,
            options={"fault_type": "3F", "scenario": "max"},
        )
        sc_min = run_short_circuit_now(
            case_id=_CASE_ID,
            klucz_twin=_KLUCZ,
            project_id=None,
            options={"fault_type": "3F", "scenario": "min"},
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
        rgnn_graph_id = ref_to_graph_id(_REFS["rgnn_bus"])
        row_max_rgnn = rows_max[rgnn_graph_id]

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
        # RGnN (szyna nN transformatora, zero-hop) jest NAJBLIŻEJ źródła w
        # całej sieci nN → z definicji ma NAJWYŻSZY Ik''max (najmniejsza
        # impedancja od źródła). Sanity potwierdzająca fizykę promieniowej
        # sieci (impedancja rośnie z odległością → prąd zwarciowy maleje).
        assert (
            row_max_rgnn["ikss_a"] > row_max["ikss_a"]
        ), "Ik''max u RGnN (zero-hop) musi być > Ik''max na liściu Silnik M1 (dalej od źródła)"

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
        # Ik''max W PUNKCIE ZABUDOWY aparatu (RGnN, zero-hop) — zgodnie z
        # kontraktem `wybierz_aparat_dla_obwodu_nn` ("Ik″max pochodzi z biegu
        # zwarciowego IEC 60909 W PUNKCIE ZABUDOWY"), NIE wartość z liścia
        # Silnik M1 (dalej od źródła, więc niższa — patrz sanity wyżej).
        _STAN["ik_max_ka_rgnn"] = row_max_rgnn["ikss_a"] / 1000.0

    # -- KROK 5: pętla zwarcia + SWZ ---------------------------------------

    def test_krok_05_petla_zwarcia_u_zrodla_i_swz_zerohop(self) -> None:
        """Pętla zwarcia u źródła (szyna nN transformatora, trasa
        zerodługościowa) — MECHANIZM DZIAŁA w pełni (dowód pozytywny przed
        znaleziskiem bramki w kolejnym teście)."""
        model = get_enm(_KLUCZ)
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

    def test_krok_05b_petla_zwarcia_w_dowolnym_punkcie_pelny_przebieg(self) -> None:
        """FLIP (karta NAPRAWA-A §0.3.3): DAWNE ZNALEZISKO BRAMKI #1 (patrz
        docstring modułu, wersja historyczna zachowana tam do kontekstu) —
        pętla zwarcia w DOWOLNYM punkcie nN poza szyną transformatora (tu:
        Silnik M1, za K1+aparat K2+K2) była zablokowana fail-closed, bo
        WSZYSTKIE 17 pozycji katalogu kabli nN (`kab_nn_*`) nie miały danych
        żyły powrotnej PE/PEN. Karta NAPRAWA-A zasiliła WSZYSTKIE 17 pozycji
        (`return_conductor_r_ohm_per_km_20c`/`return_conductor_x_ohm_per_km`/
        `return_conductor_cross_section_mm2` — tożsamość konstrukcyjna R +
        dane producenta X, patrz `_RETURN_CONDUCTOR_NOTE_NN` w
        `mv_auxiliary_catalog.py`) — mechanizm fail-closed NIE zmienił się
        (dalej odmówiłby liczenia bez danych, co jest udowodnione w drugą
        stronę: teraz liczy PEŁNY wynik, bo dane są kompletne). BYŁO:
        `view["status"] == "brak danych"` (fail-closed, żyła powrotna brak).
        JEST: `view["status"] == "OK"` z pełnym śladem White Box."""
        model = get_enm(_KLUCZ)
        view = build_fault_loop_view_at_point(model, _REFS["station_ref"], _REFS["leaf_silnik_bus"])
        assert view["status"] == "OK", view
        assert view["hop_count"] == 3, "Trasa Silnik M1 = K1 + aparat K2 (0 Ω) + K2 = 3 hopy"
        fl = view["fault_loop"]
        assert fl["ik_min_a"] > 0.0
        assert fl["ik_max_a"] >= fl["ik_min_a"]
        assert fl["white_box_trace"], "Brak White Box śladu pętli zwarcia w punkcie"

        # Pętla w punkcie DALSZYM od źródła (3 hopy) musi mieć WIĘKSZĄ
        # impedancję (dłuższa trasa kablowa) niż pętla u źródła (KROK 5,
        # trasa zerodługościowa) → NIŻSZY prąd zwarcia — ta sama fizyka
        # promieniowej sieci co sanity KROK 4 dla Ikss 3-fazowego.
        view_zero_hop = build_station_fault_loop_view(model, _REFS["station_ref"])
        assert view_zero_hop["status"] == "OK"
        assert fl["ik_max_a"] < view_zero_hop["fault_loop"]["ik_max_a"], (
            "Ik pętli w punkcie dalszym od źródła (Silnik M1) musi być NIŻSZY niż "
            "u źródła (impedancja trasy rośnie z odległością)"
        )

        # BYŁO: co najmniej jeden punkt "brak danych" na dowolnym odpływie.
        # JEST: WSZYSTKIE odpływy (K2/K3/K4/K5, wszystkie kable REF_KABEL_NN)
        # zwracają WSZYSTKIE punkty OK — żaden kabel substratu nie ma już
        # brakującej żyły powrotnej.
        feeders = build_feeder_fault_loop_view(model, _REFS["station_ref"])
        assert feeders["status"] == "OK"
        all_points = [p for feeder in feeders["feeders"] for p in feeder["points"]]
        assert len(all_points) >= 4, f"Za mało punktów w widoku odpływów: {len(all_points)}"
        brak_danych_points = [p for p in all_points if p["status"] != "OK"]
        assert not brak_danych_points, (
            f"Oczekiwano WSZYSTKICH punktów OK po zasileniu danych żyły powrotnej, "
            f"pozostały punkty 'brak danych': {brak_danych_points}"
        )

        # SWZ w punkcie Silnik M1, chroniony aparatem K2 (MCB C25) — BYŁO:
        # "brak danych" (trasa niepoliczalna). JEST: werdykt DECYZYJNY
        # (MCB ma kompletne dane In/klasa — `ocen_swz` nigdy nie zwraca
        # "nierozstrzygalne" dla MCB z kompletnymi danymi, patrz
        # `application/analyses/swz/werdykt.py`).
        swz = build_swz_view(
            model, _REFS["station_ref"], _REFS["leaf_silnik_bus"], _REFS["aparat_k2_ref"]
        )
        assert swz["status"] == "OK", swz
        assert swz["swz"]["status"] in ("spełnia", "nie spełnia"), (
            f"Oczekiwano werdyktu DECYZYJNEGO (MCB C25 ma kompletne In/klasa), "
            f"otrzymano: {swz['swz']}"
        )
        assert swz["swz"]["ia_wymagane_a"] is not None
        assert swz["swz"]["ik1_min_a"] > 0.0

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
        model = get_enm(_KLUCZ)
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

    def test_krok_07_dobor_zabezpieczen_zerohop_rgnn_pelna_rekomendacja(self) -> None:
        """Dobór aparatu nN (`wybierz_aparat_dla_obwodu_nn`) u źródła (RGnN,
        zero-hop) — mechanizm ORZEKA dla WSZYSTKICH 143 kandydatów z katalogu
        (60 MCB: 30×Icn 6 kA + 30×Icn 10 kA, + kombinacje rozłącznik+wkładka
        gG, + 11 MCCB), z pełnym uzasadnieniem per kryterium.

        FLIP (karta D1, nN „runda 8 — PEŁNY WERDYKT nN", 2026-08-14):
        odbiór NAPRAWA-A nazwał to LUKĄ KONSUMENTA (nie luką danych) —
        `_kryterium_i2` dla `KIND_MCCB` był twardo zakodowany na
        NIEROZSTRZYGALNE NIEZALEŻNIE od danych katalogowych, a
        `KandydatAparatuNn` nie miał pól Ir/Isd/Ii do przeniesienia nastaw
        wyzwalacza elektronicznego. Karta D1 naprawia konsumenta i dane
        RAZEM: `LVApparatusType.ir_range/isd_range/ii_range/tr_range/
        tsd_range` zasilone (11 rekordów WYLACZNIK_GLOWNY/ODPLYWOWY, ABB
        SACE Emax2/Tmax XT Ekip, 2 źródła — `mv_auxiliary_catalog.py`),
        `KandydatAparatuNn` niesie teraz `ir_a/isd_a/ii_a/tr_s/tsd_s`
        (RESOLWOWANE do górnego krańca zakresu regulacji), `_kryterium_i2`
        woła `protection_lv_curves.compute_mccb_point` (REUSE, nie druga
        fizyka), `swz/werdykt.py::ocen_swz` ma nową gałąź `typ="MCCB"` (Ia z
        nastawy Ii).

        DRUGA POŁOWA FLIPU — Iz′ u RGnN: KROK 6 liczy Iz′ dla kabla K2
        (60 m, 120 mm² Al, obwód Silnika M1) — 283,2 A. Reużycie TEJ
        wartości do oceny aparatu u RGnN (jak w poprzedniej wersji tego
        testu) modeluje „gdyby obwód K2 chroniono aparatem zabudowanym
        wyżej" — fizycznie poprawne, ale ogranicza In<=283,2 A, gdzie
        WSZYSTKIE MCCB o Icu wystarczającym (>=31,9 kA — rodzina 36/50 kA,
        In>=400 A) są odrzucane na kryterium (i) zanim w ogóle dojdzie do
        oceny nastaw. RGnN to jednak fizycznie SZYNA GŁÓWNA nN transformatora
        — właściwym Iz′ dla aparatu GŁÓWNEGO na tej szynie jest zdolność
        prądowa szyn/rozdzielnicy, która z zasady projektowej >= prąd
        znamionowy transformatora (rozdzielnica dobierana POD transformator,
        nie odwrotnie) — TU: In_transformatora = Sn/(√3·Ulv) ≈ 1804,2 A
        (Sn=1,25 MVA, Ulv=0,4 kV, transformator ST-03). Iz′ u RGnN liczone
        TU z tej wielkości (nie z K2) — Ib=40 A (jak dotychczas, wielkość
        WEJŚCIOWA §0.5 modułu, niezmieniona) pozostaje znacznie poniżej obu
        Iz′, więc kryterium (i) nie jest tu wąskim gardłem.

        WYNIK: NAJMNIEJSZY In wśród kandydatów spełniających WSZYSTKIE 4
        kryteria to 400 A (Icu 36–50 kA, oba >= Ik″max≈31,9 kA) — tie-break
        po id daje `cb_nn_400a` (Icu 50 kA, WYLACZNIK_GLOWNY) przed
        `cb_nn_400a_odp` (Icu 36 kA) — PIERWSZA PEŁNA rekomendacja u RGnN w
        tym łańcuchu. MCB (obie rodziny Icn) NADAL odpada na kryterium (iii)
        — Ik″max u RGnń przekracza NAWET nową rodzinę 10 kA (NAPRAWA-A) —
        ten wniosek fizyczny jest NIEZMIENIONY względem stanu przed kartą D1
        (nie jest artefaktem zmiany Iz′: Icu nie zależy od Iz′)."""
        model = get_enm(_KLUCZ)
        trafo = next(t for t in model.transformers if t.lv_bus_ref == _REFS["rgnn_bus"])
        iz_prime_a_rgnn = trafo.sn_mva * 1000.0 / (math.sqrt(3.0) * trafo.ulv_kv)
        assert iz_prime_a_rgnn == pytest.approx(
            1804.2, abs=0.1
        ), f"Iz′ RGnN (In transformatora ST-03) oczekiwane ≈1804,2 A, jest {iz_prime_a_rgnn:g} A"
        _STAN["iz_prime_a_rgnn"] = iz_prime_a_rgnn

        wynik = wybierz_aparat_dla_obwodu_nn(
            enm=model,
            station_ref=_REFS["station_ref"],
            bus_ref=_REFS["rgnn_bus"],
            ib_a=40.0,
            iz_prime_a=iz_prime_a_rgnn,
            ik_max_ka=_STAN["ik_max_ka_rgnn"],
        )
        assert wynik["status"] == "OK", wynik
        dobor = wynik["dobor"]
        assert len(dobor["kandydaci"]) >= 140, f"Za mało kandydatów: {len(dobor['kandydaci'])}"
        assert {
            k["kandydat"]["zdolnosc_wylaczania_ka"]
            for k in dobor["kandydaci"]
            if k["kandydat"]["kind"] == "MCB"
        } == {
            6.0,
            10.0,
        }, "Oczekiwano OBU rodzin MCB (Icn 6 kA i 10 kA) wśród kandydatów"

        # MCB (OBIE rodziny Icn) odpada na kryterium zdolności wyłączania —
        # Icu nie zależy od Iz′, więc ten wniosek fizyczny NIE JEST artefaktem
        # zmiany Iz′ powyżej (patrz uzasadnienie w docstringu).
        mcb_falls_on_icu = [
            k
            for k in dobor["kandydaci"]
            if k["kandydat"]["kind"] == "MCB"
            and 40.0 <= k["kandydat"]["in_a"] <= iz_prime_a_rgnn
            and not k["kwalifikuje_sie"]
            and any(
                kr["nazwa"] == "Zdolność wyłączania >= Ik″max" and kr["status"] == "nie spełnia"
                for kr in k["kryteria"]
            )
        ]
        assert mcb_falls_on_icu, (
            "Oczekiwano MCB (obu rodzin Icn) odrzuconych na kryterium zdolności "
            "wyłączania — Ik″max u RGnN (~31,9 kA) przekracza NAWET rodzinę 10 kA"
        )
        assert any(k["kandydat"]["zdolnosc_wylaczania_ka"] == 10.0 for k in mcb_falls_on_icu), (
            "Oczekiwano, że NAWET rodzina MCB 10 kA odpada na kryterium zdolności "
            "wyłączania u RGnN"
        )

        # FLIP: MCCB ma teraz kryterium I2 DECYZYJNE (spełnia/nie spełnia) —
        # WSZYSTKIE 11 rekordów niosą ir_range/tr_range (katalog D1), więc
        # ŻADEN MCCB tego katalogu nie jest już nierozstrzygalny na I2.
        mccb_decyzyjne = [
            k
            for k in dobor["kandydaci"]
            if k["kandydat"]["kind"] == "MCCB"
            and any(kr["nazwa"] == "I2<=1,45·Iz′" for kr in k["kryteria"])
        ]
        assert mccb_decyzyjne, "Brak kandydatów MCCB w wyniku doboru"
        assert all(
            any(
                kr["nazwa"] == "I2<=1,45·Iz′" and kr["status"] in ("spełnia", "nie spełnia")
                for kr in k["kryteria"]
            )
            for k in mccb_decyzyjne
        ), (
            "FLIP karty D1: WSZYSTKIE MCCB tego katalogu mają teraz nastawy "
            "(ir_range/tr_range) — kryterium I2 musi być DECYZYJNE (spełnia/nie "
            "spełnia), nigdy nierozstrzygalne, dla żadnego z 11 rekordów"
        )

        # gG — kryterium SWZ NADAL nierozstrzygalne (poza zakresem karty D1 —
        # D1 dotyczy WYŁĄCZNIE luki konsumenta MCCB, nie rozjazdu i2t_prearc_a2s
        # wkładek gG, dokumentowanego osobno jako cel D2).
        fuse_nierozstrzygalne = [
            k
            for k in dobor["kandydaci"]
            if k["kandydat"]["kind"] == "FUSE_SWITCH"
            and any(
                kr["nazwa"] == "SWZ przy Ik_min" and kr["status"] == "nierozstrzygalne"
                for kr in k["kryteria"]
            )
        ]
        assert fuse_nierozstrzygalne, (
            "Oczekiwano wkładek gG z kryterium SWZ nierozstrzygalnym — G-D2 (poza "
            "zakresem karty D1, cel D2)"
        )

        rekomendacja = dobor["rekomendacja"]
        assert rekomendacja is not None, (
            "FLIP karty D1: RGnN (Ik″max≈31,9 kA) MUSI dostać PEŁNĄ rekomendację "
            f"teraz, że MCCB konsumuje nastawy — dobor={dobor}"
        )
        assert rekomendacja["kind"] == "MCCB"
        assert rekomendacja["in_a"] == 400.0, (
            "Najmniejszy In wśród MCCB spełniających Icu>=Ik″max(~31,9 kA) to 400 A "
            f"(rodzina 36/50 kA) — rekomendacja={rekomendacja}"
        )
        assert rekomendacja["zdolnosc_wylaczania_ka"] in (36.0, 50.0), (
            "Rekomendacja MUSI pochodzić z rodziny Icu>=Ik″max (36 lub 50 kA) — "
            f"rekomendacja={rekomendacja}"
        )
        assert rekomendacja["id"] == "cb_nn_400a", (
            "Ranking deterministyczny (najmniejsze In, tie-break id): "
            "'cb_nn_400a' < 'cb_nn_400a_odp' leksykograficznie (oba In=400, oba "
            f"kwalifikują się) — rekomendacja={rekomendacja}"
        )
        _STAN["dobor_zerohop"] = dobor

    def test_krok_07b_dobor_zabezpieczen_w_punkcie_pelna_rekomendacja(self) -> None:
        """FLIP (karta NAPRAWA-A §0.3): SAMO ZNALEZISKO co dawne KROK 5b (ta
        sama fizyka Ik1_min, REUSE — patrz docstring `nn_device_selection.py`)
        — dobór dla obwodu Silnika M1 był zablokowany tą samą przyczyną
        (brak żyły powrotnej). Karta NAPRAWA-A naprawia OBA warunki
        jednocześnie na TYM konkretnym obwodzie:
          (1) trasa Ik1_min policzalna (żyła powrotna zasilona, jak KROK 5b);
          (2) Ik″max tu (≈8,4 kA, KROK 4 — znacznie niższy niż u RGnN,
              impedancja rośnie z odległością od źródła) jest PONIŻEJ nowej
              rodziny MCB Icn=10 kA (karta NAPRAWA-A §0.2.a) — więc kryterium
              zdolności wyłączania STAJE SIĘ SPEŁNIALNE tu, w odróżnieniu od
              RGnN (KROK 7, Ik″max≈31,9 kA — nawet 10 kA nie wystarcza).
        Wynik: PIERWSZA w tym łańcuchu PEŁNA, pozytywna rekomendacja aparatu
        dla realnego obwodu (silnikowego) — dowód end-to-end §80 karty.

        KARTA D1 (nN, „runda 8"): ten pin ZWERYFIKOWANY jako NIEZMIENIONY po
        naprawie luki konsumenta MCCB (`_kryterium_i2`/SWZ teraz decyzyjne
        dla MCCB) — najmniejszy MCCB katalogu ma In=100 A > 40 A, więc MCB
        B40 (In=40 A) WYGRYWA ranking (najmniejsze In wśród kwalifikujących
        się) niezależnie od tego, czy MCCB też się kwalifikuje na tym
        obwodzie."""
        model = get_enm(_KLUCZ)
        wynik = wybierz_aparat_dla_obwodu_nn(
            enm=model,
            station_ref=_REFS["station_ref"],
            bus_ref=_REFS["leaf_silnik_bus"],
            ib_a=40.0,
            iz_prime_a=_STAN["iz_prime_a_k2"],
            ik_max_ka=_STAN["ik_max_ka_leaf_silnik"],
        )
        assert wynik["status"] == "OK", wynik
        assert (
            _STAN["ik_max_ka_leaf_silnik"] < 10.0
        ), "Przesłanka flipu: Ik″max Silnika M1 musi być < Icn nowej rodziny MCB (10 kA)"
        dobor = wynik["dobor"]
        kwalifikujacy = [k for k in dobor["kandydaci"] if k["kwalifikuje_sie"]]
        assert kwalifikujacy, "Oczekiwano co najmniej jednego W PEŁNI kwalifikującego kandydata"
        assert all(
            all(kr["status"] == "spełnia" for kr in k["kryteria"]) for k in kwalifikujacy
        ), "Kandydat kwalifikujący się musi mieć WSZYSTKIE 4 kryteria 'spełnia'"

        rekomendacja = dobor["rekomendacja"]
        assert rekomendacja is not None, (
            "ZNALEZISKO BRAMKI #4 naprawione na tym obwodzie: oczekiwano PEŁNEJ "
            f"rekomendacji (nie None). dobor={dobor}"
        )
        # Ranking jest deterministyczny (`ocen_kandydatow_nn`: najmniejsze In,
        # tie-break id) — Ib=40 A wymusza In>=40 A (kryterium 1), więc
        # zwycięzcą jest NAJMNIEJSZY kwalifikujący się In=40 A; wśród
        # kandydatów In=40 A tie-break alfabetyczny id daje klasę B przed C/D
        # ("mcb_nn_b40a_10ka" < "mcb_nn_c40a_10ka" leksykograficznie) —
        # PRZYPIĘTA, deterministyczna, odtwarzalna wartość (nie przypadkowa
        # obserwacja jednego przebiegu).
        assert rekomendacja["kind"] == "MCB"
        assert rekomendacja["id"] == "mcb_nn_b40a_10ka"
        assert rekomendacja["in_a"] == 40.0
        assert rekomendacja["klasa_mcb"] == "B"
        assert rekomendacja["zdolnosc_wylaczania_ka"] == 10.0, (
            "Rekomendacja MUSI pochodzić z NOWEJ rodziny Icn=10 kA (karta NAPRAWA-A) — "
            "rodzina 6 kA nie kwalifikuje się na tym obwodzie"
        )
        _STAN["dobor_silnik_m1"] = dobor

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
        model_przed = get_enm(_KLUCZ)
        hash_przed = compute_enm_hash(model_przed)
        sc_max_run = run_short_circuit_now(
            case_id=_CASE_ID,
            klucz_twin=_KLUCZ,
            project_id=None,
            options={"fault_type": "3F", "scenario": "max"},
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

        model_po = get_enm(_KLUCZ)
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
            case_id=_CASE_ID,
            klucz_twin=_KLUCZ,
            project_id=None,
            options={"fault_type": "3F", "scenario": "max"},
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

    def test_krok_10a_pakiet_dowodowy_obwod_silnika_pelny_przebieg(self, app_client) -> None:
        """FLIP (karta NAPRAWA-A §0.3.10, „pakiet dowodowy dla obwodu
        silnika"): pakiet LV_CIRCUIT_VERIFICATION dla obwodu Silnika M1 był
        422 z uczciwym powodem (SAMO ZNALEZISKO co dawne KROK 5b/7b — pakiet
        wewnętrznie odtwarza TĘ SAMĄ ścieżkę Ik1_min/route przez
        `lv_circuit_verification_binding._petla_zwarcia_min`). Karta
        NAPRAWA-A zasiliła żyłę powrotną PE/PEN dla WSZYSTKICH kabli trasy —
        pakiet teraz DZIAŁA W PEŁNI dla REALNEGO obwodu silnikowego (nie
        tylko u źródła jak KROK 10b), z ZIP w 10 krokach, deterministyczny,
        zawierający sekcję doboru z PEŁNĄ rekomendacją (MCB B40, Icn 10 kA,
        KROK 7b)."""
        payload = {
            "project_id": "proj-nn-e2e",
            "case_id": _CASE_ID,
            "run_id": str(_STAN["sc_max_run_po_zmianie"].id),
            "snapshot_id": "snap-krok10",
            "project_name": "MV-Design-PRO — bramka nN P0",
            "case_name": "Bramka końcowa P0 nN",
            "run_timestamp": "2026-08-14T12:00:00Z",
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
        preview_resp = app_client.post("/api/nn-proof/circuit/preview", json=payload)
        assert preview_resp.status_code == 200
        preview_body = preview_resp.json()
        # Sukces (`wynik["status"] == "OK"` wewnątrz endpointu) zwraca
        # DOKUMENT dowodu (`serialize_lv_circuit_verification_pack`), nie
        # kopertę `{"status": ...}` — ta koperta istnieje WYŁĄCZNIE na
        # ścieżce błędu (`api/nn_proof.py::preview_lv_circuit_verification_
        # pack`, `if wynik["status"] != "OK": return wynik`). Brak klucza
        # "status" na najwyższym poziomie JEST dowodem sukcesu.
        assert "status" not in preview_body, preview_body
        assert preview_body["pack_type"] == "LV_CIRCUIT_VERIFICATION"
        assert preview_body["summary"]["proof_type"] == "LV_CIRCUIT_VERIFICATION"
        assert preview_body["summary"]["total_steps"] == 10

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
        # Dowód, że pakiet REALNIE liczy trasę Silnika M1 (nie u źródła jak
        # KROK 10b) — nagłówek dokumentu wskazuje kabel K2 jako element trasy.
        assert _REFS["k2_cable_ref"] in proof_json

        # Determinizm — dwa pobrania dają identyczny ZIP bajt-w-bajt (ten sam
        # dowód co KROK 10b, teraz na REALNYM obwodzie z kablem na trasie).
        resp2 = app_client.post("/api/nn-proof/circuit/pack", json=payload)
        assert resp2.status_code == 200
        assert (
            hashlib.sha256(resp1.content).hexdigest() == hashlib.sha256(resp2.content).hexdigest()
        ), "Pakiet dowodowy obwodu Silnika M1 nie jest deterministyczny (2 pobrania różne)"

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
            "ik_max_ka": _STAN["ik_max_ka_rgnn"],
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
        """FLIP (karta NAPRAWA-A §0.3.10): raport nN (`POST /api/nn-proof/
        circuit/report`) dla obwodu Silnika M1 dawniej zwracał `status: brak
        danych` (SAMO ZNALEZISKO #1 — raport wewnętrznie wymaga TEJ SAMEJ
        trasy Ik1_min co dawne KROK 5b/7b/10a). Karta NAPRAWA-A naprawia to u
        źródła (dane żyły powrotnej) — WSZYSTKIE sekcje raportu (włącznie z
        `dobor`, niosącą PEŁNĄ rekomendację z KROK 7b) są teraz obecne
        RÓWNIEŻ dla obwodu Silnika M1, nie tylko u źródła transformatora.

        FLIP DRUGI (karta D1, „runda 8"): sekcja `dobor` u RGnN niosła
        `rekomendacja: None` (PINOWANE jako poprawna fizyka przy Iz′
        reużytym z K2 — KROK 7, stan sprzed D1). Po naprawie luki konsumenta
        MCCB (patrz docstring KROK 7) i skorygowaniu Iz′ u RGnN do In
        transformatora ST-03 (`_STAN["iz_prime_a_rgnn"]`, ustawione w
        KROK 7) — RGnN dostaje TERAZ tę samą PEŁNĄ rekomendację
        (`cb_nn_400a`) co bezpośrednie wywołanie w KROK 7."""
        resp_silnik = app_client.post(
            "/api/nn-proof/circuit/report",
            json={
                "case_id": _CASE_ID,
                "station_ref": _REFS["station_ref"],
                "bus_ref": _REFS["leaf_silnik_bus"],
                "breaker_ref": _REFS["aparat_k2_ref"],
                "run_id": str(_STAN["sc_max_run_po_zmianie"].id),
                "revision_id": str(get_enm(_KLUCZ).header.revision),
                "przypadek_decydujacy": "TR",
                "ib_a": 40.0,
                "iz_prime_a": _STAN["iz_prime_a_k2"],
                "ik_max_ka": _STAN["ik_max_ka_leaf_silnik"],
                "vdrop_u_source_kv": _STAN["u_source_kv_silnik"],
                "vdrop_delta_u_total_kv": _STAN["delta_u_total_kv_silnik"],
            },
        )
        assert resp_silnik.status_code == 200, resp_silnik.text[:1000]
        body_silnik = resp_silnik.json()
        assert body_silnik["status"] == "OK", body_silnik

        resp = app_client.post(
            "/api/nn-proof/circuit/report",
            json={
                "case_id": _CASE_ID,
                "station_ref": _REFS["station_ref"],
                "bus_ref": _REFS["rgnn_bus"],
                "breaker_ref": _REFS["aparat_k2_ref"],
                "run_id": str(_STAN["sc_max_run_po_zmianie"].id),
                "revision_id": str(get_enm(_KLUCZ).header.revision),
                "przypadek_decydujacy": "TR",
                "ib_a": 40.0,
                "iz_prime_a": _STAN["iz_prime_a_rgnn"],
                "ik_max_ka": _STAN["ik_max_ka_rgnn"],
                "vdrop_u_source_kv": _STAN["u_source_kv_silnik"],
                "vdrop_delta_u_total_kv": _STAN["delta_u_total_kv_silnik"],
            },
        )
        assert resp.status_code == 200, resp.text[:1000]
        body = resp.json()
        assert body["status"] == "OK"

        for body_do_sprawdzenia in (body_silnik, body):
            for sekcja in (
                "dane_zrodlowe",
                "transformator",
                "odcinki",
                "delta_u",
                "zwarcia",
                "swz",
                "dobor",
            ):
                assert sekcja in body_do_sprawdzenia, f"Brak sekcji '{sekcja}' w raporcie nN"
            # `swz` sekcja raportu = `{**build_swz_view(...), "provenance": ...}` —
            # koperta zewnętrzna ("status": "OK"/"brak danych") NIE jest werdyktem;
            # werdykt 3-stanowy jest zagnieżdżony pod `swz["swz"]["status"]`
            # (`application/analyses/swz/service.py::build_swz_view`).
            assert "status" in body_do_sprawdzenia["swz"]
            # `dobor` sekcja raportu = `{**wybierz_aparat_dla_obwodu_nn(...), "provenance": ...}`
            # — sam `wybierz_aparat_dla_obwodu_nn` zwraca `{"status", ..., "dobor": {...}}`,
            # więc rekomendacja jest zagnieżdżona DWA poziomy głębiej:
            # sekcja["dobor"]["dobor"]["rekomendacja"] (`api/analysis_run_exports.py`).
            assert body_do_sprawdzenia["dobor"]["status"] == "OK"
            assert "rekomendacja" in body_do_sprawdzenia["dobor"]["dobor"]

        # Obwód Silnika M1 (KROK 7b): rekomendacja PEŁNA, decyzyjny werdykt SWZ.
        rekomendacja_silnik = body_silnik["dobor"]["dobor"]["rekomendacja"]
        assert rekomendacja_silnik is not None
        assert rekomendacja_silnik["id"] == "mcb_nn_b40a_10ka"
        assert body_silnik["swz"]["status"] == "OK"
        assert body_silnik["swz"]["swz"]["status"] in ("spełnia", "nie spełnia")

        # U źródła RGnN (KROK 7, FLIP karty D1): rekomendacja PEŁNA, ta sama
        # co bezpośrednie wywołanie `wybierz_aparat_dla_obwodu_nn` w KROK 7.
        rekomendacja_rgnn = body["dobor"]["dobor"]["rekomendacja"]
        assert (
            rekomendacja_rgnn is not None
        ), f"FLIP karty D1: RGnN musi dostać PEŁNĄ rekomendację w raporcie JSON — {body['dobor']}"
        assert rekomendacja_rgnn["id"] == "cb_nn_400a"
        assert rekomendacja_rgnn["kind"] == "MCCB"
        assert body["swz"]["status"] == "OK"
        assert body["swz"]["swz"]["status"] in ("spełnia", "nie spełnia")

    # -- Determinizm całego łańcucha (2×) -------------------------------------

    def test_krok_11_determinizm_calego_lancucha_dwoch_przebiegow(self, app_client) -> None:
        """Cały łańcuch budowy substratu + SC MAX powtórzony na DWÓCH
        NIEZALEŻNYCH case_id daje identyczny znormalizowany hash modelu i
        identyczny wynik SC MAX na Silniku M1 — dowód determinizmu end-to-end
        (seed stały: wszystkie dane wejściowe w `_build_substrate` są stałymi
        literałami, zero losowości)."""
        # CV-1-W: model jest wlasnoscia PROJEKTU, nie case_id — dwie
        # "niezalezne" budowy wymagaja wiec DWOCH ROZNYCH projektow (wspolny
        # projekt dolozylby drugi substrat do pierwszego zamiast dac
        # niezalezna kopie, patrz docstring `_nowy_przypadek`).
        case_id_a = _nowy_przypadek(app_client)
        case_id_b = _nowy_przypadek(app_client)
        klucz_a = _klucz(app_client, case_id_a)
        klucz_b = _klucz(app_client, case_id_b)
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
        hash_a = compute_enm_hash(get_enm(klucz_a))
        hash_b = compute_enm_hash(get_enm(klucz_b))
        assert (
            hash_a == hash_b
        ), "Dwie niezależne budowy tego samego substratu dają RÓŻNY hash kanoniczny"

        sc_a = run_short_circuit_now(
            case_id=case_id_a,
            klucz_twin=klucz_a,
            project_id=None,
            options={"fault_type": "3F", "scenario": "max"},
        )
        sc_b = run_short_circuit_now(
            case_id=case_id_b,
            klucz_twin=klucz_b,
            project_id=None,
            options={"fault_type": "3F", "scenario": "max"},
        )
        leaf_a = ref_to_graph_id(refs_a["leaf_silnik_bus"])
        leaf_b = ref_to_graph_id(refs_b["leaf_silnik_bus"])
        rows_a = {r["fault_node_id"]: r for r in (sc_a.raw_result or {}).get("results", [])}
        rows_b = {r["fault_node_id"]: r for r in (sc_b.raw_result or {}).get("results", [])}
        assert rows_a[leaf_a]["ikss_a"] == pytest.approx(
            rows_b[leaf_b]["ikss_a"], rel=1e-12
        ), "Ikss na Silniku M1 różni się między dwiema niezależnymi, identycznymi budowami"
