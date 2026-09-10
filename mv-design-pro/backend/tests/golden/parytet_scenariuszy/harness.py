"""Harness parytetu rodzin analiz D1-D6 PRZED migracją na ``apply_scenario`` (PARITY-CV3).

CO TO JEST I PO CO (karta PARITY-CV3, krok 1 programu CV-3.1).
CV-3.1 przenosi sześć rodzin analiz „kopia migawki → mutacja → bieg w pamięci"
(D1 N-1, D2 hosting capacity, D3 obszar P-Q, D4 odpowiedź OSD, D5 dobór
kompensacji, D6 bieg zbiorczy nastaw) na JEDNĄ wspólną funkcję ``apply_scenario``.
Warunkiem scalenia tej migracji jest PARYTET BIT W BIT wyników — a parytet da
się udowodnić tylko wtedy, gdy hashe wyników zostały zebrane na stanie SPRZED
migracji. Ten moduł jest tym zbiorem: buduje sieci, woła publiczne wejścia
sześciu rodzin z rozdziału „Rodziny i publiczne wejścia" karty i liczy SHA-256
kanonicznego wyniku każdej z nich. ŻADNA linia kodu produkcyjnego
(``backend/src/**``) nie jest tu ani wołana inaczej niż przez publiczne wejścia
wymienione w karcie, ani tym bardziej zmieniana.

DECYZJA INŻYNIERSKA: przebiegi SYNTETYCZNE (bez magazynu ENM/repozytorium
biegów) NAWET DLA SIECI ZŁOTEJ.
Karta wskazuje wzorzec ``_golden_pf_run`` (``set_enm`` + ``create_run`` +
``execute_run``) z testu zdolności przyłączeniowej jako sposób zbudowania
przebiegu na sieci złotej. Harness używa zamiast tego DOKŁADNIE tej samej
konstrukcji ``CanonicalRun``, której testy pięciu rodzin D1-D5 używają dla
WŁASNYCH sieci syntetycznych (``_synthetic_pf_run``/``_bieg``) — ze STAŁYMI,
jawnymi ``id``/``case_id``/``snapshot_hash``/``created_at`` zamiast przechodzenia
przez magazyn ENM i repozytorium biegów. Powód, zweryfikowany czytaniem KAŻDEJ
z sześciu funkcji publicznych:

1. żadna z nich czyta ``run.raw_result``/``run.validation``/``run.readiness``
   PRZEKAZANEGO przebiegu (każda buduje WŁASNY wariant biegu z ``run.snapshot``
   i liczy go od nowa) — więc przebieg wejściowy nie musi być wcześniej
   wykonany;
2. koperta ``context`` (``kontekst_widoku.zbuduj_kontekst_widoku``) niesie
   ``run_id`` (USUWANE przed hashem — patrz niżej), ``snapshot_hash`` i
   ``case_id`` — oba ostatnie muszą być jedynie STAŁE między przebiegami
   harnessu, nie muszą pochodzić z ``compute_enm_hash``;
3. ``ENMHeader.created_at``/``updated_at`` (``enm/models.py``) mają
   ``default_factory=lambda: datetime.now(UTC)`` — czyli ``build_golden_enm()``
   (i każdy budowniczy sieci syntetycznej) niesie w nagłówku ZEGAR ŚCIENNY przy
   KAŻDYM wywołaniu. Żadna z sześciu funkcji nie czyta tych dwóch pól (czytają
   wyłącznie ``header.name``), więc nie przeszkadzają — ale ścieżka
   ``create_run``/``set_enm`` byłaby dodatkową, niepotrzebną powierzchnią
   (magazyn plikowy, rewizje, blokady) bez żadnej korzyści dla parytetu, a
   harness ma być odtwarzalny NIEZALEŻNIE od kolejności testów i od magazynu na
   dysku.

Ta sama analiza dowodzi, że losowe ``id=uuid4()`` na KAŻDYM elemencie ENM
(``enm/models.py:108``, pole bazowe ``ENMElement.id``) też nie przecieka do
żadnego wyniku: wszystkie sześć funkcji identyfikuje elementy przez ``ref_id``
(jawny, stały), nigdy przez ``id``, a mapowanie ENM→graf sortuje po ``ref_id``
(patrz nagłówek ``kontyngencje_n1.py``) — kolejność obliczeń jest więc
niezależna od tego pola. ``id`` biegu jest mimo to na liście kluczy usuwanych
przed hashem (patrz niżej) — dla jasności kontraktu, nie z konieczności.

KATALOG SIEĆ × RODZINA (co najmniej dwie sieci na rodzinę, gdzie to miało
sens — patrz odmowa D6 niżej):
- ``golden``            — ``tests.cgmes.golden_enm.build_golden_enm()`` (D1-D5).
- ``pierscien``          — skopiowana z ``test_kontyngencje_n1_service.py::_pierscien``
                           (D1: druga topologia — pierścień z gałęzią słabszą).
- ``napiecie_graniczne`` — skopiowana z ``test_hosting_capacity_service.py`` /
                           ``test_pq_area_service.py::_voltage_bound_enm`` (IDENTYCZNA
                           definicja w obu plikach) — druga sieć D2/D3, wiążące
                           kryterium NAPIĘCIOWE (golden daje kryterium OBCIĄŻENIOWE).
- ``kompensacja``        — skopiowana z ``test_dobor_kompensacji_service.py::_compensation_enm``
                           (D4/D5: węzeł z lokalnym warunkiem biernym i opcjonalnym
                           źródłem OZE).
- ``promieniowa``/``rozgalezienie`` — skopiowane z
                           ``test_protection_settings_batch_run.py::_siec_promieniowa``/
                           ``_siec_rozgalezienie`` (D6).

ODMOWA UDOKUMENTOWANA (D6 NIE UŻYWA SIECI ZŁOTEJ).
``zbuduj_wejscie_nastaw`` wymaga linii z KOMPLETEM danych katalogowych
(przekrój, materiał, prąd znamionowy — ``linie_kandydujace``) ORAZ co najmniej
jednego kandydata kolejnej szyny selektywności (``kandydaci_nastepnej_szyny``,
czyli innej linii/kabla — TEŻ z kompletem danych katalogowych — dotykającej
końca chronionego odcinka). W sieci złotej jedyna gałąź z kompletem danych
katalogowych to ``cab_main_b`` (kabel, ma ``cross_section_mm2``/
``conductor_material``/``rating.in_a``); ``line_b_c`` (druga gałąź, od końca
``cab_main_b``) NIE MA ``cross_section_mm2`` ani ``conductor_material``
(``tests/cgmes/golden_enm.py`` ich nie ustawia, a te pola są opcjonalne w
``enm/models.py``), więc nie kwalifikuje się jako „linia" — ``cab_main_b`` jest
więc ślepym końcem selektywności (``kandydaci_nastepnej_szyny`` zwraca listę
PUSTĄ) i ŻADEN ``next_bus_id`` nie zostanie zaakceptowany
(``BrakDanychNastawError``). To NIE jest brak elementu (jak brakujący
generator dla D2/D4/D5, gdzie „minimalne uzupełnienie" ma sens), tylko
fundamentalna niezgodność topologii tej JEDNEJ, wspólnej fikstury z wymaganiem
tej rodziny — łatanie jej lokalną kopią zmieniałoby charakter sieci złotej
tylko dla tej jednej rodziny, co byłoby MNIEJ czytelne niż użycie sieci, którą
rodzina D6 JUŻ ma we własnym pliku testów. D6 używa więc DWÓCH wariantów sieci
promieniowej (``_siec_promieniowa``/``_siec_rozgalezienie``) zamiast sieci
złotej — to jest JEDYNA odmowa tego harnessu i jest tu opisana zamiast łatana
(zgodnie z granicami karty).

HASH: SHA-256 kanonicznego JSON wyniku (klucze posortowane, separator bez
spacji), liczby float skwantyzowane do 9 cyfr znaczących funkcją
``application.analyses.kontrakt_liczb.kwantyzuj_kontrakt`` — TĄ SAMĄ, której
repo używa od karty M0-2 (ADR-018) do odcisków fixtur nN; nie jest tu pisana
druga kopia tej reguły. Przed kwantyzacją z wyniku usuwane są WYŁĄCZNIE klucze
z ``KLUCZE_WYKLUCZONE`` (patrz stała niżej, z uzasadnieniem per klucz) — nic
więcej.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, is_dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from application.analyses.dobor_kompensacji import build_compensation_sizing_view
from application.analyses.hosting_capacity import build_hosting_capacity_view
from application.analyses.kontrakt_liczb import kwantyzuj_kontrakt
from application.analyses.kontyngencje_n1 import (
    build_kontyngencje_n1_view,
    build_kontyngencje_n1_zakres_view,
)
from application.analyses.odpowiedz_osd import build_osd_response_view
from application.analyses.pq_area import build_pq_area_view
from application.protection_settings.batch_run import zbuduj_wejscie_nastaw
from enm.canonical_analysis import CanonicalRun, _execute_short_circuit
from enm.models import (
    BranchRating,
    Bus,
    Cable,
    EnergyNetworkModel,
    ENMHeader,
    Generator,
    Load,
    OverheadLine,
    PortRef,
    Source,
    Transformer,
)

from tests.cgmes.golden_enm import build_golden_enm

# ---------------------------------------------------------------------------
# Klucze usuwane z wyniku PRZED liczeniem hasha.
# ---------------------------------------------------------------------------

#: Pola czasu i identyfikatory losowe biegu — jedyne klucze, które karta
#: pozwala usunąć przed hashem. Usuwane REKURENCYJNIE, po nazwie klucza,
#: niezależnie od głębokości zagnieżdżenia (żadna z sześciu rodzin nie używa
#: bare "id" do niczego innego niż identyfikator biegu — sprawdzone grepem po
#: kodzie źródłowym sześciu modułów przed napisaniem tego harnessu).
#:
#: - "run_id"/"id": ``context["run_id"]`` (``kontekst_widoku.py``) niesie
#:   ``str(run.id)`` — losowy UUID biegu, nie treść wyniku.
#: - "created_at"/"started_at"/"finished_at": pola czasu ``CanonicalRun`` —
#:   żadna z sześciu funkcji ich dziś nie emituje w widoku (``context`` je
#:   pomija przy ``ze_znacznikiem_czasu=False``, którego wszystkie D1-D5
#:   używają), ale są tu na wypadek przyszłej zmiany kontraktu — lista jest
#:   jawna i skończona, nie rośnie po cichu.
#: - "run_timestamp": WYŁĄCZNIE D6 (``WejscieNastawZBiegow.run_timestamp``,
#:   ``batch_run.py::_znacznik_czasu``) — TA SAMA kategoria co "finished_at"/
#:   "created_at" (dosłownie ``kotwica.finished_at or kotwica.created_at``),
#:   inna nazwa pola w TYM kontrakcie. Karta nazywa kategorię „pola czasu", nie
#:   tylko te pięć literalnych nazw — to pole jest tą kategorią.
KLUCZE_WYKLUCZONE: frozenset[str] = frozenset(
    {"run_id", "id", "created_at", "started_at", "finished_at", "run_timestamp"}
)


def _do_postaci_json(wartosc: Any) -> Any:
    """Znormalizuj rekurencyjnie do czystego JSON (str/int/float/bool/None/dict/list).

    Wyniki D1-D5 są już czystymi słownikami. Wynik D6 (``WejscieNastawZBiegow``)
    jest DATACLASSĄ z zagnieżdżonym ``ProtectionSettingsInput`` (też dataclassą)
    i polem ``run_timestamp: datetime`` — bez tej normalizacji ``json.dumps``
    podniósłby ``TypeError`` na pierwszym polu czasu/dataclassie.
    """
    if is_dataclass(wartosc) and not isinstance(wartosc, type):
        return _do_postaci_json(asdict(wartosc))
    if isinstance(wartosc, dict):
        return {klucz: _do_postaci_json(v) for klucz, v in wartosc.items()}
    if isinstance(wartosc, list | tuple):
        return [_do_postaci_json(v) for v in wartosc]
    if isinstance(wartosc, datetime):
        return wartosc.isoformat()
    if isinstance(wartosc, UUID):
        return str(wartosc)
    return wartosc


def _usun_klucze_wykluczone(wartosc: Any) -> Any:
    """Usuń rekurencyjnie klucze z ``KLUCZE_WYKLUCZONE`` (patrz stała wyżej)."""
    if isinstance(wartosc, dict):
        return {
            klucz: _usun_klucze_wykluczone(v)
            for klucz, v in wartosc.items()
            if klucz not in KLUCZE_WYKLUCZONE
        }
    if isinstance(wartosc, list):
        return [_usun_klucze_wykluczone(v) for v in wartosc]
    return wartosc


def hash_widoku(widok: Any) -> str:
    """SHA-256 kanonicznego JSON wyniku jednej rodziny (widok D1-D5 albo D6).

    Kolejność: normalizacja do JSON → usunięcie kluczy wykluczonych →
    kwantyzacja liczb do 9 cyfr znaczących (``kwantyzuj_kontrakt``, ADR-018/
    M0-2) → ``json.dumps`` kanoniczny (klucze posortowane, bez białych znaków)
    → SHA-256.
    """
    bezpieczny = _do_postaci_json(widok)
    oczyszczony = _usun_klucze_wykluczone(bezpieczny)
    skwantyzowany = kwantyzuj_kontrakt(oczyszczony)
    kanoniczny = json.dumps(
        skwantyzowany, sort_keys=True, ensure_ascii=False, separators=(",", ":")
    )
    return hashlib.sha256(kanoniczny.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# Budowa przebiegów (CanonicalRun) — bez magazynu/persystencji (patrz decyzja
# inżynierska w nagłówku modułu). Stałe id/czas: harness ma być odtwarzalny
# bit w bit, więc żadna wartość poniżej nie pochodzi z zegara ani z ``uuid4``.
# ---------------------------------------------------------------------------

_ID_BIEGU = UUID("00000000-0000-4000-8000-0000000000c3")  # CV-3, stały dla CAŁEGO harnessu
_CZAS_BIEGU = datetime(2026, 1, 1, tzinfo=UTC)


def _bieg_pf(enm: EnergyNetworkModel, *, siec: str) -> CanonicalRun:
    """Przebieg rozpływu (PF) FINISHED z migawką ``enm`` — bez wykonania solvera.

    Żadna z rodzin D1-D5 nie czyta ``raw_result`` PRZEKAZANEGO przebiegu (patrz
    decyzja inżynierska w nagłówku modułu) — każda buduje WŁASNY wariant i
    liczy go od nowa istniejącym solverem.
    """
    return CanonicalRun(
        id=_ID_BIEGU,
        case_id=f"parytet-cv3-{siec}",
        project_id="parytet-cv3",
        analysis_type="PF",
        status="FINISHED",
        created_at=_CZAS_BIEGU,
        snapshot_hash=f"snap-{siec}",
        input_hash=f"in-{siec}",
        snapshot=enm.model_dump(mode="json"),
        validation={},
        readiness={},
    )


def _kotwica_3f_cmax(enm: EnergyNetworkModel, *, siec: str, c_factor: float = 1.10) -> CanonicalRun:
    """Kotwica D6: zwarcie trójfazowe (gałąź MAKSYMALNA) FINISHED, solver WYKONANY.

    W przeciwieństwie do ``_bieg_pf`` powyżej, D6 (``zbuduj_wejscie_nastaw``)
    CZYTA ``kotwica.raw_result`` wprost (prądy c_max) — solver musi więc być
    już wykonany na TEJ instancji, dokładnie jak wzorzec ``_kotwica`` w
    ``test_protection_settings_batch_run.py``.
    """
    run = CanonicalRun(
        id=_ID_BIEGU,
        case_id=f"parytet-cv3-{siec}",
        project_id="parytet-cv3",
        analysis_type="short_circuit_sn",
        status="FINISHED",
        created_at=_CZAS_BIEGU,
        snapshot_hash=f"snap-{siec}",
        input_hash=f"in-{siec}",
        snapshot=enm.model_dump(mode="json"),
        validation={},
        readiness={},
        options={"fault_type": "3F", "c_factor": c_factor, "thermal_time_seconds": 1.0},
    )
    run.finished_at = run.created_at
    _execute_short_circuit(run)
    return run


# ---------------------------------------------------------------------------
# Budowniczowie sieci — SKOPIOWANE z testów istniejących rodzin (nie
# importowane z plików testowych: harness ma pozostać odtwarzalny niezależnie
# od dalszych zmian tamtych plików). Źródło każdego wskazane w docstringu.
# ---------------------------------------------------------------------------


def _zrodlo_sn(bus_ref: str = "b_src") -> Source:
    """Skopiowane z ``test_kontyngencje_n1_service.py::_zrodlo`` (identyczne z
    ``test_protection_settings_batch_run.py::_zrodlo`` — jedno źródło SN 500 MVA)."""
    return Source(
        ref_id="src",
        name="System 15 kV",
        bus_ref=bus_ref,
        model="short_circuit_power",
        sk3_mva=500.0,
        r_ohm=0.1,
        x_ohm=1.0,
    )


def _pierscien() -> EnergyNetworkModel:
    """Skopiowane z ``test_kontyngencje_n1_service.py::_pierscien``.

    Pierścień: dwie drogi zasilania, jedna o małej obciążalności. Wyłączenie
    mocnej gałęzi (``ln_src_a``) przerzuca cały pobór na gałąź ``ln_src_b`` o
    obciążalności 60 A — post-awaryjnie przeciążoną (druga topologia D1, obok
    sieci złotej — kryterium przeciążenia OBJAZDU, nie tylko brak zasilania).
    """
    return EnergyNetworkModel(
        header=ENMHeader(name="Pierscien N-1"),
        buses=[
            Bus(ref_id="b_src", name="GPZ SN", voltage_kv=15.0),
            Bus(ref_id="b_a", name="Stacja A", voltage_kv=15.0),
            Bus(ref_id="b_b", name="Stacja B", voltage_kv=15.0),
        ],
        sources=[_zrodlo_sn()],
        loads=[
            Load(ref_id="ld_a", name="Odbior A", bus_ref="b_a", p_mw=1.0, q_mvar=0.3),
            Load(ref_id="ld_b", name="Odbior B", bus_ref="b_b", p_mw=1.0, q_mvar=0.3),
        ],
        branches=[
            OverheadLine(
                ref_id="ln_src_a",
                name="Linia GPZ-A",
                from_bus_ref="b_src",
                to_bus_ref="b_a",
                endpoint_a_port=PortRef(port_id="b_src:sn"),
                endpoint_b_port=PortRef(port_id="b_a:sn"),
                length_km=2.0,
                r_ohm_per_km=0.2,
                x_ohm_per_km=0.35,
                rating=BranchRating(in_a=200.0),
            ),
            OverheadLine(
                ref_id="ln_src_b",
                name="Linia GPZ-B",
                from_bus_ref="b_src",
                to_bus_ref="b_b",
                endpoint_a_port=PortRef(port_id="b_src:sn"),
                endpoint_b_port=PortRef(port_id="b_b:sn"),
                length_km=2.0,
                r_ohm_per_km=0.2,
                x_ohm_per_km=0.35,
                rating=BranchRating(in_a=60.0),
            ),
            Cable(
                ref_id="ka_a_b",
                name="Kabel A-B (zamkniecie pierscienia)",
                from_bus_ref="b_a",
                to_bus_ref="b_b",
                endpoint_a_port=PortRef(port_id="b_a:sn"),
                endpoint_b_port=PortRef(port_id="b_b:sn"),
                length_km=1.0,
                r_ohm_per_km=0.16,
                x_ohm_per_km=0.1,
                rating=BranchRating(in_a=280.0),
            ),
        ],
    )


def _napiecie_graniczne() -> EnergyNetworkModel:
    """Skopiowane z ``test_hosting_capacity_service.py``/``test_pq_area_service.py``
    ``::_voltage_bound_enm`` (definicja identyczna w obu plikach).

    Długa linia o dużej impedancji: napięcie zdalnego węzła przekracza pasmo
    ZANIM prąd osiągnie granicę obciążenia — druga sieć D2/D3, wiążące
    kryterium NAPIĘCIOWE (sieć złota daje kryterium OBCIĄŻENIOWE).
    """
    return EnergyNetworkModel(
        header=ENMHeader(name="Napiecie graniczne"),
        buses=[
            Bus(ref_id="b_slack", name="Slack", voltage_kv=15.0),
            Bus(ref_id="b_rem", name="Wezel zdalny", voltage_kv=15.0),
        ],
        sources=[
            Source(
                ref_id="s",
                name="System",
                bus_ref="b_slack",
                model="short_circuit_power",
                sk3_mva=5000.0,
                r_ohm=0.1,
                x_ohm=1.0,
            ),
        ],
        loads=[Load(ref_id="ld", name="Odbior", bus_ref="b_rem", p_mw=0.1, q_mvar=0.03)],
        branches=[
            OverheadLine(
                ref_id="ln",
                name="Linia dluga",
                from_bus_ref="b_slack",
                to_bus_ref="b_rem",
                endpoint_a_port=PortRef(port_id="b_slack:sn"),
                endpoint_b_port=PortRef(port_id="b_rem:sn"),
                length_km=20.0,
                r_ohm_per_km=0.5,
                x_ohm_per_km=0.4,
                rating=BranchRating(in_a=3000.0),
            ),
        ],
    )


def _kompensacja(*, load_q_mvar: float, gen_p_mw: float | None) -> EnergyNetworkModel:
    """Skopiowane z ``test_dobor_kompensacji_service.py::_compensation_enm``.

    Punkt SN 15 kV zasilany jedną linią, z lokalnym warunkiem biernym
    (``load_q_mvar``) i opcjonalnym źródłem OZE (``gen_p_mw``) — druga sieć
    D4/D5 (obok sieci złotej), reużyta identycznie dla obu rodzin.
    """
    generators = []
    if gen_p_mw is not None:
        generators.append(
            Generator(
                ref_id="gen_pcc",
                name="Źródło OZE",
                bus_ref="bus_pcc",
                p_mw=gen_p_mw,
                q_mvar=0.0,
                gen_type="synchronous",
                catalog_ref="gen-sync-x",
            )
        )
    return EnergyNetworkModel(
        header=ENMHeader(name="Kompensacja net"),
        buses=[
            Bus(ref_id="bus_hv", name="GPZ 110kV", voltage_kv=110.0),
            Bus(ref_id="bus_a", name="Szyna SN", voltage_kv=15.0),
            Bus(ref_id="bus_pcc", name="Punkt przyłączenia", voltage_kv=15.0),
        ],
        sources=[
            Source(
                ref_id="src",
                name="System 110kV",
                bus_ref="bus_hv",
                model="short_circuit_power",
                sk3_mva=2500.0,
                r_ohm=0.5,
                x_ohm=5.0,
                rx_ratio=0.1,
                r0_ohm=0.6,
                x0_ohm=6.0,
                catalog_ref="src-x",
                catalog_namespace="ZRODLO_SN",
                parameter_source="CATALOG",
                source_mode="KATALOG",
            )
        ],
        transformers=[
            Transformer(
                ref_id="tr",
                name="TR 110/15",
                hv_bus_ref="bus_hv",
                lv_bus_ref="bus_a",
                sn_mva=25.0,
                uhv_kv=110.0,
                ulv_kv=15.0,
                uk_percent=12.0,
                pk_kw=120.0,
                p0_kw=18.0,
                i0_percent=0.4,
                vector_group="YNd11",
                tap_position=0,
                tap_min=-9,
                tap_max=9,
                tap_step_percent=1.78,
                catalog_ref="tr-x",
                catalog_namespace="TRAFO_SN_NN",
                parameter_source="CATALOG",
                source_mode="KATALOG",
            )
        ],
        branches=[
            OverheadLine(
                ref_id="line_a_pcc",
                name="Linia SN",
                from_bus_ref="bus_a",
                to_bus_ref="bus_pcc",
                endpoint_a_port=PortRef(port_id="bus_a:sn"),
                endpoint_b_port=PortRef(port_id="bus_pcc:sn"),
                length_km=5.0,
                r_ohm_per_km=0.306,
                x_ohm_per_km=0.34,
                b_siemens_per_km=3.0e-6,
                r0_ohm_per_km=0.46,
                x0_ohm_per_km=1.2,
                rating=BranchRating(in_a=210.0),
                catalog_ref="line-afl-70",
                catalog_namespace="LINIA_SN",
                parameter_source="CATALOG",
                source_mode="KATALOG",
            )
        ],
        loads=[
            Load(ref_id="load_pcc", name="Odbiór", bus_ref="bus_pcc", p_mw=1.0, q_mvar=load_q_mvar)
        ],
        generators=generators,
    )


def _linia_nastaw(ref_id: str, *, od: str, do: str, in_a: float = 200.0) -> OverheadLine:
    """Skopiowane z ``test_protection_settings_batch_run.py::_linia``."""
    return OverheadLine(
        ref_id=ref_id,
        name=f"Linia {ref_id}",
        from_bus_ref=od,
        to_bus_ref=do,
        endpoint_a_port=PortRef(port_id=f"{od}:sn"),
        endpoint_b_port=PortRef(port_id=f"{do}:sn"),
        length_km=2.0,
        r_ohm_per_km=0.2,
        x_ohm_per_km=0.35,
        rating=BranchRating(in_a=in_a),
        cross_section_mm2=120.0,
        conductor_material="Al",
    )


def _siec_promieniowa() -> EnergyNetworkModel:
    """Skopiowane z ``test_protection_settings_batch_run.py::_siec_promieniowa``.

    ``b_src --ln1--> b_a --ln2--> b_b``, odbiór na ``b_b``.
    """
    return EnergyNetworkModel(
        header=ENMHeader(name="Siec nastaw — promien"),
        buses=[
            Bus(ref_id="b_src", name="GPZ SN", voltage_kv=15.0),
            Bus(ref_id="b_a", name="Stacja A", voltage_kv=15.0),
            Bus(ref_id="b_b", name="Stacja B", voltage_kv=15.0),
        ],
        sources=[_zrodlo_sn()],
        loads=[Load(ref_id="ld_b", name="Odbior B", bus_ref="b_b", p_mw=1.0, q_mvar=0.3)],
        branches=[
            _linia_nastaw("ln1", od="b_src", do="b_a"),
            _linia_nastaw("ln2", od="b_a", do="b_b"),
        ],
    )


def _siec_rozgalezienie() -> EnergyNetworkModel:
    """Zmodyfikowane wobec ``test_protection_settings_batch_run.py::_siec_rozgalezienie``.

    ``_siec_promieniowa`` + ``b_a --ln3--> b_c`` (rozgałęzienie) — druga sieć
    D6, dwaj kandydaci kolejnej szyny selektywności dla ``ln1`` (``b_b``/``b_c``)
    i dodatkowe obciążenie ``b_a`` wpływające na prąd obciążenia ``ln1``.

    RÓŻNICA WOBEC ORYGINAŁU (świadoma, tylko w tym harnessu): oryginalny test
    buduje ``ln3`` funkcją ``_linia`` z TYMI SAMYMI parametrami co ``ln2``
    (``length_km=2.0`` — tam liczy się tylko ISTNIENIE dwóch kandydatów, nie ich
    wartość). Tu ``ln3`` ma CELOWO inną długość (4.0 zamiast 2.0 km): przy
    identycznej impedancji ``b_b``/``b_c`` są elektrycznie równoodległe od
    ``b_a``, więc prąd zwarciowy 3F w obu węzłach (``ik_max_next_bus_a`` —
    JEDYNE pole ``zbuduj_wejscie_nastaw`` zależne od wyboru ``next_bus_id``)
    wychodził bit w bit identyczny — wariant „inny next_bus_id" harnessu nie
    sprawdzałby wtedy niczego ponad etykietę. Złamanie symetrii było wykryte
    PRZEZ SAM HARNESS (dwa warianty dały ten sam hash) i naprawione tu, zamiast
    zostać niezauważoną redundancją.
    """
    enm = _siec_promieniowa()
    ln3 = OverheadLine(
        ref_id="ln3",
        name="Linia ln3",
        from_bus_ref="b_a",
        to_bus_ref="b_c",
        endpoint_a_port=PortRef(port_id="b_a:sn"),
        endpoint_b_port=PortRef(port_id="b_c:sn"),
        length_km=4.0,
        r_ohm_per_km=0.2,
        x_ohm_per_km=0.35,
        rating=BranchRating(in_a=200.0),
        cross_section_mm2=120.0,
        conductor_material="Al",
    )
    return enm.model_copy(
        update={
            "buses": [*enm.buses, Bus(ref_id="b_c", name="Stacja C", voltage_kv=15.0)],
            "loads": [
                *enm.loads,
                Load(ref_id="ld_c", name="Odbior C", bus_ref="b_c", p_mw=0.5, q_mvar=0.1),
            ],
            "branches": [*enm.branches, ln3],
        }
    )


# ---------------------------------------------------------------------------
# Parametry poleceń OSD (D4) — te same wartości dla obu sieci (golden,
# kompensacja): fizycznie sensowne niezależnie od sieci (skalują p_base_mw/
# nie zależą od topologii), więc porównywalność między sieciami jest czysta.
# ---------------------------------------------------------------------------

_KOMENDY_OSD: tuple[tuple[str, dict[str, Any]], ...] = (
    ("ograniczenie_p", {"p_limit_pct": 50.0}),
    ("moc_bierna", {"q_mvar": 1.5}),
    ("cosfi", {"cos_phi": 0.95, "q_charakter": "nadwzbudny"}),
    ("lfsm_o", {"frequency_hz": 50.5, "droop_pct": 5.0, "deadband_hz": 0.2}),
    ("lfsm_u", {"frequency_hz": 49.5, "droop_pct": 5.0, "deadband_hz": 0.2}),
)


def zbierz_hashe() -> dict[str, dict[str, Any]]:
    """Zbierz hashe SHA-256 wszystkich wariantów rodzin D1-D6 (stan PRZED
    migracją na ``apply_scenario``).

    Zwraca słownik ``{"<rodzina>/<siec>/<wariant>": {"sha256": ..., "parametry": {...}}}``.
    Funkcja jest czysta (bez magazynu/dysku — patrz decyzja inżynierska w
    nagłówku modułu) i deterministyczna: dwa kolejne wywołania dają identyczny
    wynik (przypięte testem determinizmu w ``test_parytet_rodzin_scenariuszy.py``).
    """
    wyniki: dict[str, dict[str, Any]] = {}

    def _zapisz(klucz: str, widok: Any, *, siec: str, funkcja: str, kwargs: dict[str, Any]) -> None:
        if klucz in wyniki:
            raise AssertionError(f"Zduplikowany klucz harnessu parytetu: {klucz!r}")
        wyniki[klucz] = {
            "sha256": hash_widoku(widok),
            "parametry": {"siec": siec, "funkcja": funkcja, "kwargs": kwargs},
        }

    # === D1: kontyngencje_n1 =================================================
    golden = _bieg_pf(build_golden_enm(), siec="golden")
    pierscien = _bieg_pf(_pierscien(), siec="pierscien")

    for siec, bieg in (("golden", golden), ("pierscien", pierscien)):
        _zapisz(
            f"kontyngencje_n1/{siec}/pelny",
            build_kontyngencje_n1_view(bieg),
            siec=siec,
            funkcja="build_kontyngencje_n1_view",
            kwargs={},
        )
        _zapisz(
            f"kontyngencje_n1/{siec}/zakres",
            build_kontyngencje_n1_zakres_view(bieg),
            siec=siec,
            funkcja="build_kontyngencje_n1_zakres_view",
            kwargs={},
        )

    # === D2: hosting_capacity =================================================
    napiecie = _bieg_pf(_napiecie_graniczne(), siec="napiecie_graniczne")

    _zapisz(
        "hosting_capacity/golden/domyslni_kandydaci_max10",
        build_hosting_capacity_view(golden, max_steps=10),
        siec="golden",
        funkcja="build_hosting_capacity_view",
        kwargs={"max_steps": 10},
    )
    _zapisz(
        "hosting_capacity/golden/bus_sn_c_max20",
        build_hosting_capacity_view(golden, candidate_bus_refs=["bus_sn_c"], max_steps=20),
        siec="golden",
        funkcja="build_hosting_capacity_view",
        kwargs={"candidate_bus_refs": ["bus_sn_c"], "max_steps": 20},
    )
    _zapisz(
        "hosting_capacity/napiecie_graniczne/b_rem_max10",
        build_hosting_capacity_view(napiecie, candidate_bus_refs=["b_rem"], max_steps=10),
        siec="napiecie_graniczne",
        funkcja="build_hosting_capacity_view",
        kwargs={"candidate_bus_refs": ["b_rem"], "max_steps": 10},
    )

    # === D3: pq_area ===========================================================
    # Kroki P/Q DOBRANE MAŁO (nie domyślne 21×33=693 biegi) — harness dowodzi
    # parytetu MECHANIZMU, nie wyczerpuje siatki produkcyjnej; parametry jawne.
    _zapisz(
        "pq_area/golden/bus_sn_c_p4_q3",
        build_pq_area_view(golden, bus_ref="bus_sn_c", max_steps_p=4, max_steps_q=3),
        siec="golden",
        funkcja="build_pq_area_view",
        kwargs={"bus_ref": "bus_sn_c", "max_steps_p": 4, "max_steps_q": 3},
    )
    _zapisz(
        "pq_area/golden/bus_nn_p3_q3",
        build_pq_area_view(golden, bus_ref="bus_nn", max_steps_p=3, max_steps_q=3),
        siec="golden",
        funkcja="build_pq_area_view",
        kwargs={"bus_ref": "bus_nn", "max_steps_p": 3, "max_steps_q": 3},
    )
    _zapisz(
        "pq_area/napiecie_graniczne/b_rem_p4_q6",
        build_pq_area_view(napiecie, bus_ref="b_rem", max_steps_p=4, max_steps_q=6),
        siec="napiecie_graniczne",
        funkcja="build_pq_area_view",
        kwargs={"bus_ref": "b_rem", "max_steps_p": 4, "max_steps_q": 6},
    )

    # === D4: odpowiedz_osd =====================================================
    kompensacja_osd = _bieg_pf(_kompensacja(load_q_mvar=2.0, gen_p_mw=4.0), siec="kompensacja-osd")
    for siec, bieg, source_ref in (
        ("golden", golden, "gen_sync"),  # golden: generator synchroniczny bus_sn_c (P=2.0, Q=0.6)
        ("kompensacja", kompensacja_osd, "gen_pcc"),
    ):
        for komenda, kwargs in _KOMENDY_OSD:
            _zapisz(
                f"odpowiedz_osd/{siec}/{komenda}",
                build_osd_response_view(bieg, source_ref=source_ref, command=komenda, **kwargs),
                siec=siec,
                funkcja="build_osd_response_view",
                kwargs={"source_ref": source_ref, "command": komenda, **kwargs},
            )

    # === D5: dobor_kompensacji =================================================
    kompensacja_dzien = _bieg_pf(_kompensacja(load_q_mvar=2.0, gen_p_mw=None), siec="komp-dzien")
    kompensacja_noc = _bieg_pf(_kompensacja(load_q_mvar=2.0, gen_p_mw=4.0), siec="komp-noc")

    _zapisz(
        "dobor_kompensacji/golden/bus_sn_c_dzien",
        build_compensation_sizing_view(golden, bus_ref="bus_sn_c", cos_phi_min=0.95),
        siec="golden",
        funkcja="build_compensation_sizing_view",
        kwargs={"bus_ref": "bus_sn_c", "cos_phi_min": 0.95},
    )
    _zapisz(
        "dobor_kompensacji/golden/bus_sn_c_noc",
        build_compensation_sizing_view(
            golden, bus_ref="bus_sn_c", cos_phi_min=0.90, uwzglednij_noc=True
        ),
        siec="golden",
        funkcja="build_compensation_sizing_view",
        kwargs={"bus_ref": "bus_sn_c", "cos_phi_min": 0.90, "uwzglednij_noc": True},
    )
    _zapisz(
        "dobor_kompensacji/kompensacja/bus_pcc_dzien",
        build_compensation_sizing_view(kompensacja_dzien, bus_ref="bus_pcc", cos_phi_min=0.95),
        siec="kompensacja",
        funkcja="build_compensation_sizing_view",
        kwargs={"bus_ref": "bus_pcc", "cos_phi_min": 0.95},
    )
    _zapisz(
        "dobor_kompensacji/kompensacja/bus_pcc_noc",
        build_compensation_sizing_view(
            kompensacja_noc, bus_ref="bus_pcc", cos_phi_min=0.90, uwzglednij_noc=True
        ),
        siec="kompensacja",
        funkcja="build_compensation_sizing_view",
        kwargs={"bus_ref": "bus_pcc", "cos_phi_min": 0.90, "uwzglednij_noc": True},
    )

    # === D6: protection_settings.batch_run.zbuduj_wejscie_nastaw ==============
    kotwica_promieniowa = _kotwica_3f_cmax(_siec_promieniowa(), siec="promieniowa")
    kotwica_rozgalezienie = _kotwica_3f_cmax(_siec_rozgalezienie(), siec="rozgalezienie")

    _zapisz(
        "nastawy/promieniowa/ln1_bb_cmin1_0",
        zbuduj_wejscie_nastaw(kotwica_promieniowa, line_id="ln1", next_bus_id="b_b", c_min=1.0),
        siec="promieniowa",
        funkcja="zbuduj_wejscie_nastaw",
        kwargs={"line_id": "ln1", "next_bus_id": "b_b", "c_min": 1.0},
    )
    _zapisz(
        "nastawy/promieniowa/ln1_bb_cmin0_9_niestandardowe",
        zbuduj_wejscie_nastaw(
            kotwica_promieniowa,
            line_id="ln1",
            next_bus_id="b_b",
            c_min=0.9,
            delta_t_s=0.45,
            k_b=1.35,
            k_bth=1.18,
        ),
        siec="promieniowa",
        funkcja="zbuduj_wejscie_nastaw",
        kwargs={
            "line_id": "ln1",
            "next_bus_id": "b_b",
            "c_min": 0.9,
            "delta_t_s": 0.45,
            "k_b": 1.35,
            "k_bth": 1.18,
        },
    )
    _zapisz(
        "nastawy/rozgalezienie/ln1_bb_cmin1_0",
        zbuduj_wejscie_nastaw(kotwica_rozgalezienie, line_id="ln1", next_bus_id="b_b", c_min=1.0),
        siec="rozgalezienie",
        funkcja="zbuduj_wejscie_nastaw",
        kwargs={"line_id": "ln1", "next_bus_id": "b_b", "c_min": 1.0},
    )
    _zapisz(
        "nastawy/rozgalezienie/ln1_bc_cmin1_0",
        zbuduj_wejscie_nastaw(kotwica_rozgalezienie, line_id="ln1", next_bus_id="b_c", c_min=1.0),
        siec="rozgalezienie",
        funkcja="zbuduj_wejscie_nastaw",
        kwargs={"line_id": "ln1", "next_bus_id": "b_c", "c_min": 1.0},
    )

    return wyniki
