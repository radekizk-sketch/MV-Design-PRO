"""Domyślny ``k_sc`` NIE MOŻE zasilić miarodajnej zdolności zwarciowej.

DECYZJA WŁAŚCICIELA, WIĄŻĄCA (recenzja niezależna, P0-DELTA-03). Poprzednia
wersja delty oznaczała domyślkę w śladzie (`DEFAULT_FORBIDDEN`) i na tym
poprzestawała. Recenzent wykonał przypadek, w którym TEN SAM graf dawał
``eligible=True`` dla zwarcia 3F, mając w ładunku ``k_sc = 1.1`` z domyślki:

    payload k_sc         = 1.1
    trace source_kind    = DEFAULT_FORBIDDEN
    eligibility.eligible = True      <-- znacznik bez konsumenta

Znacznik, którego żaden predykat nie czyta, nie jest granicą — jest etykietą.

CO PILNUJĄ TE TESTY (obie strony, nie jedna):

  * zdolności ZALEŻNE od wkładu zwarciowego falownika (3F, 1F, zabezpieczenia)
    blokują się, gdy deklaracji brak albo jest niepoprawna;
  * zdolności NIEZALEŻNE (rozpływ mocy) pozostają dostępne — recenzja wprost
    zakazuje globalnego blokowania niepowiązanych zdolności, a blokada bez
    przyczyny jest defektem tak samo jak brak blokady.
"""

from __future__ import annotations

import pytest
from network_model.core.wklad_zwarciowy_przeksztaltnika import (
    K_SC_ZRODLO_DEKLARACJA,
    K_SC_ZRODLO_DOMYSLNE,
)
from network_model.core.zdolnosci_wkladu_zwarciowego import (
    KOD_BLOKADY_K_SC_DOMYSLNY,
    ZDOLNOSCI_NIEZALEZNE_OD_WKLADU_ZWARCIOWEGO,
    ZDOLNOSCI_ZALEZNE_OD_WKLADU_ZWARCIOWEGO,
    ZdolnoscMiarodajna,
    wklad_jest_miarodajny,
)
from solver_input.builder import build_solver_input
from solver_input.contracts import SolverAnalysisType
from solver_input.eligibility import build_eligibility_map, check_eligibility

from tests.test_solver_input_provenance import _make_network_with_inverter

#: Typy analizy, których równania KONSUMUJĄ wkład zwarciowy falownika.
ANALIZY_ZWARCIOWE = (
    SolverAnalysisType.SHORT_CIRCUIT_3F,
    SolverAnalysisType.SHORT_CIRCUIT_1F,
    SolverAnalysisType.PROTECTION,
)


def _graf(k_sc: float | None):
    graph, catalog = _make_network_with_inverter()
    graph.inverter_sources["pv_1"].k_sc = k_sc
    return graph, catalog


# ---------------------------------------------------------------------------
# (a) STRONA BLOKUJĄCA — domyślka nie przechodzi
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("analiza", ANALIZY_ZWARCIOWE, ids=lambda a: a.value)
def test_brak_deklaracji_blokuje_zdolnosc_zwarciowa(analiza: SolverAnalysisType) -> None:
    """DOKŁADNY przypadek recenzenta: ``k_sc=None`` → eligible MUSI być False."""
    graph, catalog = _graf(None)
    assert graph.inverter_sources["pv_1"].k_sc_zrodlo == K_SC_ZRODLO_DOMYSLNE

    wynik = check_eligibility(graph, catalog, analiza)
    assert not wynik.eligible, f"{analiza.value}: domyślka przeszła jako dana miarodajna"
    kody = {b.code for b in wynik.blockers}
    assert KOD_BLOKADY_K_SC_DOMYSLNY in kody, kody


def test_blokada_wskazuje_element_i_pole_a_nie_tylko_fakt() -> None:
    """Blokada nieaudytowalna jest bezużyteczna — musi prowadzić do danej.

    Bez `element_ref` i `field_path` projektant widzi „coś jest nie tak" i nie ma
    jak tego naprawić; przy kilku falownikach nie wie nawet którego dotyczy.
    """
    graph, catalog = _graf(None)
    blokada = next(
        b
        for b in check_eligibility(graph, catalog, SolverAnalysisType.SHORT_CIRCUIT_3F).blockers
        if b.code == KOD_BLOKADY_K_SC_DOMYSLNY
    )
    assert blokada.element_ref == "pv_1"
    assert blokada.field_path == "inverter_sources[ref_id=pv_1].k_sc"
    assert "k_sc" in blokada.message


def test_wartosc_w_ladunku_nadal_jest_liczba_ale_zdolnosc_jest_zamknieta() -> None:
    """Ładunek roboczy WOLNO policzyć — nie wolno go SKONSUMOWAĆ jako miarodajny.

    To jest rozdział, o który prosi decyzja właściciela: wynik poglądowy może
    istnieć, ale musi być technicznie nie-miarodajny. Gdyby builder przestał
    emitować liczbę, znikłaby możliwość obliczenia poglądowego; gdyby
    eligibility jej nie blokowało, wróciłby defekt. Ten test pilnuje OBU stron
    naraz.
    """
    graph, catalog = _graf(None)
    env = build_solver_input(
        graph=graph,
        catalog=catalog,
        case_id="c",
        enm_revision="r",
        analysis_type=SolverAnalysisType.SHORT_CIRCUIT_3F,
    )
    wpis = next(p for p in env.payload["inverter_sources"] if p["ref_id"] == "pv_1")
    slad = next(t for t in env.trace if t.element_ref == "pv_1" and t.field_path.endswith(".k_sc"))

    assert wpis["k_sc"] == pytest.approx(1.1)
    assert slad.source_kind == "DEFAULT_FORBIDDEN"
    assert not env.eligibility.eligible


# ---------------------------------------------------------------------------
# (b) STRONA PRZEPUSZCZAJĄCA — deklaracja odblokowuje, rozpływ nietknięty
# ---------------------------------------------------------------------------


def test_deklaracja_odblokowuje_zwarcie() -> None:
    """Bez tego przypadku bramka przechodziłaby dla implementacji blokującej ZAWSZE.

    Implementacja, w której deklaracja projektanta niczego nie zmienia, jest
    równie zła jak brak bramki — tylko psuje w drugą stronę.
    """
    graph, catalog = _graf(1.35)
    assert graph.inverter_sources["pv_1"].k_sc_zrodlo == K_SC_ZRODLO_DEKLARACJA
    wynik = check_eligibility(graph, catalog, SolverAnalysisType.SHORT_CIRCUIT_3F)
    assert wynik.eligible, [b.code for b in wynik.blockers]


def test_rozplyw_mocy_pozostaje_dostepny_mimo_braku_deklaracji() -> None:
    """ZAKRES BLOKADY JEST WĄSKI — recenzja zakazuje blokowania cudzych zdolności.

    Wkład zwarciowy nie wchodzi do równań rozpływu mocy, więc jego brak nie może
    zamykać rozpływu. Gdyby blokada była globalna, projektant straciłby dostęp do
    analizy, która z tą daną nie ma nic wspólnego.
    """
    graph, catalog = _graf(None)
    wynik = check_eligibility(graph, catalog, SolverAnalysisType.LOAD_FLOW)
    assert wynik.eligible, [b.code for b in wynik.blockers]


def test_zrodlo_wylaczone_z_ruchu_nie_blokuje() -> None:
    """Falownik poza ruchem nie dokłada prądu do zwarcia — więc nie blokuje.

    Predykat „czynne" jest ten sam, którym solver decyduje o uwzględnieniu
    wkładu. Blokada od jednostki wyłączonej byłaby blokadą od elementu, którego
    w rachunku nie ma.
    """
    graph, catalog = _graf(None)
    graph.inverter_sources["pv_1"].in_service = False
    wynik = check_eligibility(graph, catalog, SolverAnalysisType.SHORT_CIRCUIT_3F)
    assert wynik.eligible, [b.code for b in wynik.blockers]


def test_macierz_zdolnosci_rozdziela_zablokowane_od_dostepnych() -> None:
    """Pełna macierz: zwarciowe zamknięte, rozpływ otwarty — jednym pomiarem."""
    graph, catalog = _graf(None)
    mapa = {e.analysis_type: e.eligible for e in build_eligibility_map(graph, catalog).entries}
    assert mapa[SolverAnalysisType.LOAD_FLOW] is True
    assert mapa[SolverAnalysisType.SHORT_CIRCUIT_3F] is False
    assert mapa[SolverAnalysisType.SHORT_CIRCUIT_1F] is False


# ---------------------------------------------------------------------------
# (c) KONTRAKT ZDOLNOŚCI — kompletny i rozłączny
# ---------------------------------------------------------------------------


def test_kazda_zdolnosc_ma_jawna_klasyfikacje() -> None:
    """Zbiory MUSZĄ pokrywać enum i być rozłączne.

    Liczenie strony „niezależnej" jako dopełnienia wciągałoby KAŻDĄ nową zdolność
    na stronę „wolno" — czyli w stronę niebezpieczną. Dlatego oba zbiory są
    wymienione jawnie, a ten test pilnuje, żeby razem dawały całość.
    """
    wszystkie = set(ZdolnoscMiarodajna)
    zalezne = set(ZDOLNOSCI_ZALEZNE_OD_WKLADU_ZWARCIOWEGO)
    niezalezne = set(ZDOLNOSCI_NIEZALEZNE_OD_WKLADU_ZWARCIOWEGO)
    assert not (zalezne & niezalezne), zalezne & niezalezne
    assert zalezne | niezalezne == wszystkie, wszystkie - (zalezne | niezalezne)


def test_miarodajna_jest_wylacznie_deklaracja() -> None:
    """Domyślka i dana niepoprawna są obie niemiarodajne — różni je przyczyna."""
    assert wklad_jest_miarodajny(K_SC_ZRODLO_DEKLARACJA)
    assert not wklad_jest_miarodajny(K_SC_ZRODLO_DOMYSLNE)
    assert not wklad_jest_miarodajny("DANE_NIEPOPRAWNE")
