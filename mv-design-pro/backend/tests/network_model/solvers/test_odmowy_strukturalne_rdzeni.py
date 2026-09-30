"""Odmowy wejścia rdzeni jako rekordy strukturalne, zdanie z nazwami z modelu (decyzja O-59).

Plan A/B §12.2 (k) i (m), karta B01-RUNDA-3. Klasa defektu: identyfikator maszynowy
wklejony do treści komunikatu rdzenia (zwarcia IEC 60909, rozpływ NR, V12.6) i do tytułu kroku
śladu White Box. Po naprawie identyfikator stoi WYŁĄCZNIE w polu strukturalnym rekordu
(`RekordOdmowy.odwolania`, `converter_ref`/`bus_ref` wyniku V12.6), a zdanie z nazwą z modelu
składa warstwa aplikacji (`enm/zdania_odmow_rdzenia.py`, ocena SSCI z indeksem nazw).

Testy jako ILOCZYN CECH (reguła KLASA, NIE INSTANCJA):
  rdzeń {zwarcia × 4 rodzaje, rozpływ NR / GS / FD, V12.6 SSCI}
  × rodzaj komunikatu {każdy rekord walidatora rozpływu, przekładnia ≤ 0, węzeł zwarcia spoza
    grafu, gałąź bez nazwy, węzeł przyłączenia przekształtnika spoza modelu, tytuł kroku śladu}
  × droga do projektanta {wyjątek rdzenia, granica aplikacji (bieg kanoniczny, wiązanie zwarcia),
    krok śladu, wynik powierzchni V12.6}
  × stan elementu {z nazwą, nazwa pusta / same spacje, element spoza grafu, poza eksploatacją}.
Wyrocznia każdego przypadku: treść nie zawiera identyfikatora ani kodu, rekord je zawiera.
"""

from __future__ import annotations

import numpy as np
import pytest
from application.solvers.short_circuit_binding import (
    ShortCircuitBindingError,
    execute_short_circuit,
)
from application.v126_artifacts import wynik_v126_dla_powierzchni
from domain.execution import ExecutionAnalysisType
from domain.study_case import StudyCaseConfig
from enm.canonical_analysis import _solve_power_flow_with_method
from enm.zdania_odmow_rdzenia import (
    nazwy_w_odmowach_rdzenia,
    sprawdz_wejscie_rozplywu,
    zdanie_odmowy,
)
from network_model.core.branch import BranchType, LineBranch, TransformerBranch
from network_model.core.graph import NetworkGraph
from network_model.core.node import Node, NodeType
from network_model.odmowa_danych import (
    RODZAJ_GALAZ,
    RODZAJ_WEZEL,
    OdmowaDanychError,
    OdmowaWejsciaRdzenia,
    OdwolanieElementu,
    RekordOdmowy,
)
from network_model.solvers import power_flow_newton_internal as nr
from network_model.solvers.power_flow_fast_decoupled import PowerFlowFastDecoupledSolver
from network_model.solvers.power_flow_gauss_seidel import PowerFlowGaussSeidelSolver
from network_model.solvers.power_flow_newton import PowerFlowNewtonSolver
from network_model.solvers.power_flow_types import (
    BranchLimitSpec,
    BusVoltageLimitSpec,
    PowerFlowInput,
    PQSpec,
    PVSpec,
    ShuntSpec,
    SlackSpec,
    TransformerTapSpec,
)
from network_model.solvers.short_circuit_iec60909 import (
    KOD_GALAZ_BEZ_NAZWY,
    KOD_WEZEL_ZWARCIA_SPOZA_GRAFU,
    ShortCircuitIEC60909Solver,
)
from network_model.solvers.v126_academic import V126AcademicSolver
from solver_input.v126_contracts import V126AnalysisType

from tests.test_v126_ssci_impedance import _model_with_grid, _reference_card

# ---------------------------------------------------------------------------
# Sieć próbna: identyfikatory o kształcie maszynowym, nazwy projektanta
# ---------------------------------------------------------------------------

ID_SLACK = "wezel/7f3a9c01-slack"
ID_PV = "wezel/7f3a9c02-pv"
ID_PQ = "wezel/7f3a9c03-pq"
ID_LINIA = "galaz/7f3a9c10-linia"
ID_TRAFO = "galaz/7f3a9c11-trafo"
NAZWA = {
    ID_SLACK: "GPZ Północ 15 kV",
    ID_PV: "Farma PV Zachód",
    ID_PQ: "Stacja Rynek",
    ID_LINIA: "Linia SN Rynek",
    ID_TRAFO: "TR Rynek 15/0,4",
}
IDENTYFIKATORY = (
    ID_SLACK,
    ID_PV,
    ID_PQ,
    ID_LINIA,
    ID_TRAFO,
    "galaz/7f3a9c12-odstawiona",
    "brak/7f3a9cff",
)


def _wezel(node_id: str, typ: NodeType, *, nazwa: str | None = None) -> Node:
    return Node(
        id=node_id,
        name=NAZWA.get(node_id, "") if nazwa is None else nazwa,
        node_type=typ,
        voltage_level=15.0,
        voltage_magnitude=1.0,
        voltage_angle=0.0,
        active_power=0.0,
        reactive_power=0.0,
    )


def _linia(branch_id: str, a: str, b: str, *, nazwa: str | None = None) -> LineBranch:
    return LineBranch(
        id=branch_id,
        name=NAZWA[branch_id] if nazwa is None else nazwa,
        branch_type=BranchType.LINE,
        from_node_id=a,
        to_node_id=b,
        r_ohm_per_km=0.2,
        x_ohm_per_km=0.35,
        b_us_per_km=0.0,
        length_km=2.0,
        rated_current_a=300.0,
    )


def _trafo(branch_id: str, a: str, b: str, *, nazwa: str | None = None) -> TransformerBranch:
    return TransformerBranch(
        id=branch_id,
        name=NAZWA[branch_id] if nazwa is None else nazwa,
        branch_type=BranchType.TRANSFORMER,
        from_node_id=a,
        to_node_id=b,
        rated_power_mva=10.0,
        voltage_hv_kv=15.0,
        voltage_lv_kv=15.0,
        uk_percent=8.0,
        pk_kw=30.0,
        i0_percent=0.0,
        p0_kw=0.0,
        vector_group="Dyn11",
        tap_position=0,
        tap_step_percent=2.5,
    )


ID_LINIA_ODSTAWIONA = "galaz/7f3a9c12-odstawiona"


def _graf(*, nazwa_linii: str | None = None, odstawiona_bez_nazwy: bool = False) -> NetworkGraph:
    graf = NetworkGraph()
    graf.add_node(_wezel(ID_SLACK, NodeType.SLACK))
    graf.add_node(_wezel(ID_PV, NodeType.PV))
    graf.add_node(_wezel(ID_PQ, NodeType.PQ))
    graf.add_branch(_linia(ID_LINIA, ID_SLACK, ID_PQ, nazwa=nazwa_linii))
    graf.add_branch(_trafo(ID_TRAFO, ID_SLACK, ID_PV))
    if odstawiona_bez_nazwy:
        odstawiona = _linia(ID_LINIA_ODSTAWIONA, ID_PV, ID_PQ, nazwa="")
        odstawiona.in_service = False
        graf.add_branch(odstawiona)
    return graf


def _wejscie(**zmiany: object) -> PowerFlowInput:
    pola: dict[str, object] = {
        "graph": _graf(),
        "base_mva": 10.0,
        "slack": SlackSpec(node_id=ID_SLACK, u_pu=1.0),
        "pq": [PQSpec(node_id=ID_PQ, p_mw=1.0, q_mvar=0.3)],
        "pv": [PVSpec(node_id=ID_PV, p_mw=0.5, u_pu=1.0, q_min_mvar=-1.0, q_max_mvar=1.0)],
    }
    pola.update(zmiany)
    return PowerFlowInput(**pola)  # type: ignore[arg-type]


def _bez_identyfikatorow(tekst: str) -> None:
    for ref in IDENTYFIKATORY:
        assert ref not in tekst, f"identyfikator {ref!r} w treści: {tekst!r}"
    assert "rozplyw." not in tekst and "zwarcie." not in tekst, f"kod w treści: {tekst!r}"


# ---------------------------------------------------------------------------
# Rozpływ: każdy rekord walidatora wejścia (kod × odwołania × stan elementu)
# ---------------------------------------------------------------------------

#: (nazwa przypadku, zmiany wejścia, kod, odwołania, nazwy w zdaniu aplikacji)
PRZYPADKI_ROZPLYWU = [
    ("moc bazowa", {"base_mva": 0.0}, nr.KOD_MOC_BAZOWA_NIEDODATNIA, (), ()),
    (
        "węzeł bilansujący spoza grafu",
        {"slack": SlackSpec(node_id="brak/7f3a9cff")},
        nr.KOD_WEZEL_BILANSUJACY_SPOZA_GRAFU,
        ((RODZAJ_WEZEL, "brak/7f3a9cff"),),
        (),
    ),
    (
        "PQ zdublowane",
        {"pq": [PQSpec(node_id=ID_PQ, p_mw=1.0, q_mvar=0.3)] * 2},
        nr.KOD_ZADANIE_PQ_ZDUBLOWANE,
        ((RODZAJ_WEZEL, ID_PQ),),
        (NAZWA[ID_PQ],),
    ),
    (
        "PV zdublowane",
        {"pv": [PVSpec(node_id=ID_PV, p_mw=0.5, u_pu=1.0, q_min_mvar=-1, q_max_mvar=1)] * 2},
        nr.KOD_ZADANIE_PV_ZDUBLOWANE,
        ((RODZAJ_WEZEL, ID_PV),),
        (NAZWA[ID_PV],),
    ),
    (
        "bocznik zdublowany",
        {"shunts": [ShuntSpec(node_id=ID_PQ, b_pu=0.01)] * 2},
        nr.KOD_BOCZNIK_ZDUBLOWANY,
        ((RODZAJ_WEZEL, ID_PQ),),
        (NAZWA[ID_PQ],),
    ),
    (
        "granice napięcia zdublowane",
        {"bus_limits": [BusVoltageLimitSpec(node_id=ID_PQ, u_min_pu=0.9, u_max_pu=1.1)] * 2},
        nr.KOD_GRANICE_NAPIECIA_ZDUBLOWANE,
        ((RODZAJ_WEZEL, ID_PQ),),
        (NAZWA[ID_PQ],),
    ),
    (
        "przekładnia zdublowana",
        {"taps": [TransformerTapSpec(branch_id=ID_TRAFO, tap_ratio=1.0)] * 2},
        nr.KOD_PRZEKLADNIA_ZDUBLOWANA,
        ((RODZAJ_GALAZ, ID_TRAFO),),
        (NAZWA[ID_TRAFO],),
    ),
    (
        "granice gałęzi zdublowane",
        {"branch_limits": [BranchLimitSpec(branch_id=ID_LINIA, s_max_mva=5.0)] * 2},
        nr.KOD_GRANICE_GALEZI_ZDUBLOWANE,
        ((RODZAJ_GALAZ, ID_LINIA),),
        (NAZWA[ID_LINIA],),
    ),
    (
        "węzeł bilansujący z zadaniem",
        {"pq": [PQSpec(node_id=ID_SLACK, p_mw=1.0, q_mvar=0.3)]},
        nr.KOD_WEZEL_BILANSUJACY_Z_ZADANIEM,
        ((RODZAJ_WEZEL, ID_SLACK),),
        (NAZWA[ID_SLACK],),
    ),
    (
        "węzeł PQ i PV",
        {"pq": [PQSpec(node_id=ID_PV, p_mw=1.0, q_mvar=0.3)]},
        nr.KOD_WEZEL_PQ_I_PV,
        ((RODZAJ_WEZEL, ID_PV),),
        (NAZWA[ID_PV],),
    ),
    (
        "granice Q węzła PV odwrócone",
        {"pv": [PVSpec(node_id=ID_PV, p_mw=0.5, u_pu=1.0, q_min_mvar=1.0, q_max_mvar=-1.0)]},
        nr.KOD_GRANICE_Q_PV_ODWROCONE,
        ((RODZAJ_WEZEL, ID_PV),),
        (NAZWA[ID_PV],),
    ),
    (
        "granice napięcia odwrócone",
        {"bus_limits": [BusVoltageLimitSpec(node_id=ID_PQ, u_min_pu=1.1, u_max_pu=0.9)]},
        nr.KOD_GRANICE_NAPIECIA_ODWROCONE,
        ((RODZAJ_WEZEL, ID_PQ),),
        (NAZWA[ID_PQ],),
    ),
    (
        "granica gałęzi bez wartości",
        {"branch_limits": [BranchLimitSpec(branch_id=ID_LINIA)]},
        nr.KOD_GRANICA_GALEZI_BEZ_WARTOSCI,
        ((RODZAJ_GALAZ, ID_LINIA),),
        (NAZWA[ID_LINIA],),
    ),
    (
        "przekładnia gałęzi spoza grafu",
        {"taps": [TransformerTapSpec(branch_id="brak/7f3a9cff", tap_ratio=1.0)]},
        nr.KOD_PRZEKLADNIA_GALEZI_SPOZA_GRAFU,
        ((RODZAJ_GALAZ, "brak/7f3a9cff"),),
        (),
    ),
    (
        "przekładnia na linii",
        {"taps": [TransformerTapSpec(branch_id=ID_LINIA, tap_ratio=1.0)]},
        nr.KOD_PRZEKLADNIA_NIE_TRANSFORMATORA,
        ((RODZAJ_GALAZ, ID_LINIA),),
        (NAZWA[ID_LINIA],),
    ),
    (
        "granica gałęzi spoza grafu",
        {"branch_limits": [BranchLimitSpec(branch_id="brak/7f3a9cff", s_max_mva=5.0)]},
        nr.KOD_GRANICA_GALEZI_SPOZA_GRAFU,
        ((RODZAJ_GALAZ, "brak/7f3a9cff"),),
        (),
    ),
]


def test_kody_rekordow_rozplywu_sa_rozlaczne_i_pokryte_przypadkami() -> None:
    """Każdy kod walidatora ma przypadek w tabeli (przekładnia ≤ 0 — test osobny)."""
    kody = {wartosc for nazwa, wartosc in vars(nr).items() if nazwa.startswith("KOD_")}
    pokryte = {przypadek[2] for przypadek in PRZYPADKI_ROZPLYWU} | {nr.KOD_PRZEKLADNIA_NIEDODATNIA}
    assert kody == pokryte
    assert len(kody) == len([n for n in vars(nr) if n.startswith("KOD_")])


@pytest.mark.parametrize(
    ("zmiany", "kod", "odwolania", "nazwy"),
    [p[1:] for p in PRZYPADKI_ROZPLYWU],
    ids=[p[0] for p in PRZYPADKI_ROZPLYWU],
)
def test_rekord_walidatora_rozplywu(zmiany, kod, odwolania, nazwy) -> None:
    wejscie = _wejscie(**zmiany)
    _ostrzezenia, odmowy = nr.odmowy_wejscia(wejscie)
    (rekord,) = (odmowa for odmowa in odmowy if odmowa.kod == kod)
    assert rekord.odwolania == tuple(OdwolanieElementu(r, ref) for r, ref in odwolania)
    _bez_identyfikatorow(rekord.tresc)

    # Walidator tekstowy rdzenia (konsument: solvery NR/GS/FD) daje TE SAME treści.
    _ostrzezenia_t, teksty = nr.validate_input(wejscie)
    assert teksty == [odmowa.tresc for odmowa in odmowy]

    # Droga 1: solver rdzenia (goły `ValueError` z treściami) — bez identyfikatorów.
    for solver in (
        PowerFlowNewtonSolver().solve,
        PowerFlowGaussSeidelSolver().solve,
        PowerFlowFastDecoupledSolver().solve,
    ):
        with pytest.raises(ValueError) as blad:
            solver(wejscie)
        _bez_identyfikatorow(str(blad.value))

    # Droga 2: granica aplikacji (bieg kanoniczny) — rekordy + zdanie z nazwami z modelu.
    for metoda in ("newton-raphson", "gauss-seidel", "fast-decoupled"):
        with pytest.raises(OdmowaWejsciaRdzenia) as odmowa:
            _solve_power_flow_with_method(wejscie, wejscie.options, {}, metoda)
        assert isinstance(odmowa.value, OdmowaDanychError)
        assert kod in {r.kod for r in odmowa.value.rekordy}
        tekst = str(odmowa.value)
        _bez_identyfikatorow(tekst)
        assert rekord.tresc in tekst
        for nazwa in nazwy:
            assert nazwa in tekst


def test_walidacja_wylaczona_nie_odmawia_przed_solverem() -> None:
    """`options.validate = False`: ani solver, ani granica aplikacji nie walidują (jeden predykat)."""
    wejscie = _wejscie(pq=[PQSpec(node_id=ID_PQ, p_mw=1.0, q_mvar=0.3)] * 2)
    wejscie.options.validate = False
    sprawdz_wejscie_rozplywu(wejscie)  # brak odmowy


@pytest.mark.parametrize("metoda", ["newton-raphson", "gauss-seidel", "fast-decoupled"])
def test_przekladnia_niedodatnia_rekord_z_nazwa(metoda: str) -> None:
    """Przekładnia ≤ 0 (macierz admitancji rozpływu): rekord z odwołaniem do transformatora,
    na drodze solvera bez identyfikatora, na granicy aplikacji z nazwą transformatora."""
    wejscie = _wejscie(taps=[TransformerTapSpec(branch_id=ID_TRAFO, tap_ratio=0.0)])
    with pytest.raises(OdmowaWejsciaRdzenia) as z_rdzenia:
        PowerFlowNewtonSolver().solve(wejscie)
    (rekord,) = z_rdzenia.value.rekordy
    assert rekord.kod == nr.KOD_PRZEKLADNIA_NIEDODATNIA
    assert rekord.odwolania == (OdwolanieElementu(RODZAJ_GALAZ, ID_TRAFO),)
    _bez_identyfikatorow(str(z_rdzenia.value))

    with pytest.raises(OdmowaWejsciaRdzenia) as z_aplikacji:
        _solve_power_flow_with_method(wejscie, wejscie.options, {}, metoda)
    assert z_aplikacji.value.rekordy == z_rdzenia.value.rekordy
    assert NAZWA[ID_TRAFO] in str(z_aplikacji.value)
    _bez_identyfikatorow(str(z_aplikacji.value))


# ---------------------------------------------------------------------------
# Zwarcia IEC 60909: rodzaj zwarcia × odmowa × stan nazwy gałęzi
# ---------------------------------------------------------------------------

RODZAJE_ZWARCIA = {
    "3F": lambda graf, wezel: ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graph=graf, fault_node_id=wezel, c_factor=1.1, tk_s=1.0
    ),
    "1F": lambda graf, wezel: ShortCircuitIEC60909Solver.compute_1ph_short_circuit(
        graph=graf, fault_node_id=wezel, c_factor=1.1, tk_s=1.0, z0_bus=np.eye(3)
    ),
    "2F": lambda graf, wezel: ShortCircuitIEC60909Solver.compute_2ph_short_circuit(
        graph=graf, fault_node_id=wezel, c_factor=1.1, tk_s=1.0
    ),
    "2FN": lambda graf, wezel: ShortCircuitIEC60909Solver.compute_2ph_ground_short_circuit(
        graph=graf, fault_node_id=wezel, c_factor=1.1, tk_s=1.0, z0_bus=np.eye(3)
    ),
}


@pytest.mark.parametrize("rodzaj", sorted(RODZAJE_ZWARCIA))
def test_zwarcie_wezel_spoza_grafu_rekord(rodzaj: str) -> None:
    graf = _graf()
    with pytest.raises(OdmowaWejsciaRdzenia) as odmowa:
        RODZAJE_ZWARCIA[rodzaj](graf, "brak/7f3a9cff")
    (rekord,) = odmowa.value.rekordy
    assert rekord.kod == KOD_WEZEL_ZWARCIA_SPOZA_GRAFU
    assert rekord.odwolania == (OdwolanieElementu(RODZAJ_WEZEL, "brak/7f3a9cff"),)
    _bez_identyfikatorow(str(odmowa.value))
    # Granica aplikacji: węzła w grafie nie ma — zdanie bez dopisku nazw.
    with pytest.raises(OdmowaWejsciaRdzenia) as z_aplikacji:
        with nazwy_w_odmowach_rdzenia(graf):
            RODZAJE_ZWARCIA[rodzaj](graf, "brak/7f3a9cff")
    assert str(z_aplikacji.value) == rekord.tresc


@pytest.mark.parametrize("rodzaj", sorted(RODZAJE_ZWARCIA))
@pytest.mark.parametrize("nazwa", ["", "   "], ids=["pusta", "same_spacje"])
def test_zwarcie_galaz_bez_nazwy_odmowa_przed_biegiem(rodzaj: str, nazwa: str) -> None:
    """(m): wymóg niepustej nazwy gałęzi w eksploatacji w walidatorze wejścia — nazwana
    odmowa PRZED biegiem, zamiast tytułu kroku z identyfikatorem albo pustą nazwą."""
    graf = _graf(nazwa_linii=nazwa)
    with pytest.raises(OdmowaWejsciaRdzenia) as odmowa:
        RODZAJE_ZWARCIA[rodzaj](graf, ID_PQ)
    (rekord,) = odmowa.value.rekordy
    assert rekord.kod == KOD_GALAZ_BEZ_NAZWY
    assert rekord.odwolania == (OdwolanieElementu(RODZAJ_GALAZ, ID_LINIA),)
    _bez_identyfikatorow(str(odmowa.value))
    assert "gałęzi bez nazwy: 1" in str(odmowa.value)
    with pytest.raises(OdmowaWejsciaRdzenia) as z_aplikacji:
        with nazwy_w_odmowach_rdzenia(graf):
            RODZAJE_ZWARCIA[rodzaj](graf, ID_PQ)
    assert "Dotyczy: Gałąź bez nazwy." in str(z_aplikacji.value)
    _bez_identyfikatorow(str(z_aplikacji.value))


def test_zwarcie_galaz_bez_nazwy_poza_eksploatacja_nie_blokuje() -> None:
    """Predykat wymogu nazwy = predykat pętli śladu (gałąź w eksploatacji) — jedno źródło."""
    graf = _graf(odstawiona_bez_nazwy=True)
    wynik = RODZAJE_ZWARCIA["3F"](graf, ID_PQ)
    assert wynik.ikss_a > 0


def test_wiazanie_zwarcia_odmowa_nazwy_z_bledem_wiazania_bez_identyfikatora() -> None:
    graf = _graf(nazwa_linii="")
    with pytest.raises(ShortCircuitBindingError) as blad:
        execute_short_circuit(
            graph=graf,
            analysis_type=ExecutionAnalysisType.SC_3F,
            config=StudyCaseConfig(),
            fault_node_id=ID_PQ,
        )
    _bez_identyfikatorow(str(blad.value))
    assert "Gałąź bez nazwy" in str(blad.value)
    assert isinstance(blad.value.__cause__, OdmowaWejsciaRdzenia)
    assert blad.value.__cause__.rekordy[0].kod == KOD_GALAZ_BEZ_NAZWY


def _tytuly_sladu(wynik: object) -> list[str]:
    kroki = [*wynik.white_box_trace, *(wynik.branch_flow_trace or [])]
    return [str(krok.get("title", "")) for krok in kroki]


@pytest.mark.parametrize("rodzaj", ["3F", "2F"])
def test_tytuly_krokow_sladu_nazywaja_galaz_nazwa_z_modelu(rodzaj: str) -> None:
    """(m): tytuł kroku K_T i kroku prądu Thevenina w gałęzi — nazwa z modelu, klucz kroku
    z identyfikatorem zostaje (klucz ≠ tekst)."""
    graf = _graf()
    zwarcie = (
        ShortCircuitIEC60909Solver.compute_3ph_short_circuit
        if rodzaj == "3F"
        else ShortCircuitIEC60909Solver.compute_2ph_short_circuit
    )
    wynik = zwarcie(
        graph=graf,
        fault_node_id=ID_PQ,
        c_factor=1.1,
        tk_s=1.0,
        include_branch_contributions=True,
    )
    tytuly = _tytuly_sladu(wynik)
    assert f"Korekcja impedancji transformatora sieciowego {NAZWA[ID_TRAFO]}" in tytuly
    assert f"Prąd zwarciowy Thevenina w gałęzi {NAZWA[ID_LINIA]}" in tytuly
    for tytul in tytuly:
        _bez_identyfikatorow(tytul)
    klucze = [str(krok.get("key", "")) for krok in wynik.branch_flow_trace or []]
    assert f"thevenin_flow_{ID_LINIA}" in klucze


# ---------------------------------------------------------------------------
# V12.6 SSCI: przekształtnik wskazuje węzeł spoza modelu
# ---------------------------------------------------------------------------


def test_v126_ssci_wezel_przylaczenia_spoza_modelu_rekord_i_ocena_z_nazwami() -> None:
    karta = _reference_card()
    model = _model_with_grid(karta, scr=10.0)
    przeksztaltnik = model.converters[0].model_copy(update={"bus_ref": "brak/7f3a9cff"})
    model = model.model_copy(update={"converters": [przeksztaltnik]})
    koperta = V126AcademicSolver().run(V126AnalysisType.SSCI_IMPEDANCE, model)
    wynik = koperta["result"]
    assert wynik["converter_ref"] == przeksztaltnik.ref
    assert wynik["bus_ref"] == "brak/7f3a9cff"
    assert wynik["missing_fields"] == ["converter.bus_ref"]
    assert przeksztaltnik.ref not in wynik["message_pl"]
    _bez_identyfikatorow(wynik["message_pl"])

    # Warstwa aplikacji składa przedmiot oceny z nazw modelu (szyna spoza modelu — opis braku).
    nazwy = {przeksztaltnik.ref: "Falownik Farma PV Zachód"}
    powierzchnia = wynik_v126_dla_powierzchni(
        V126AnalysisType.SSCI_IMPEDANCE.value, koperta, nazwy=nazwy
    )
    przedmiot = powierzchnia["result"]["ocena"]["przedmiot"]
    assert przedmiot["element_ref"] == przeksztaltnik.ref
    assert przedmiot["nazwa_pl"] == "Przekształtnik Falownik Farma PV Zachód"
    _bez_identyfikatorow(przedmiot["opis_pl"])
    assert "brak/7f3a9cff" not in przedmiot["opis_pl"]


# ---------------------------------------------------------------------------
# Reguła zdania (jedno źródło): nazwa nadana / opis braku / element spoza grafu
# ---------------------------------------------------------------------------


def test_zdanie_odmowy_stan_elementu() -> None:
    graf = _graf(nazwa_linii="  ")
    rekord = RekordOdmowy(
        "test.kod",
        "Treść.",
        (
            OdwolanieElementu(RODZAJ_WEZEL, ID_PQ),
            OdwolanieElementu(RODZAJ_GALAZ, ID_LINIA),
            OdwolanieElementu(RODZAJ_GALAZ, "brak/7f3a9cff"),
            OdwolanieElementu(RODZAJ_WEZEL, ID_PQ),
        ),
    )
    assert zdanie_odmowy(rekord, graf) == f"Treść. Dotyczy: {NAZWA[ID_PQ]}, Gałąź bez nazwy."
    assert zdanie_odmowy(RekordOdmowy("test.kod", "Treść."), graf) == "Treść."


def test_odmowa_wymaga_rekordu_i_nieznany_rodzaj_to_blad_programu() -> None:
    with pytest.raises(AssertionError):
        OdmowaWejsciaRdzenia([])
    with pytest.raises(AssertionError):
        zdanie_odmowy(RekordOdmowy("k", "T.", (OdwolanieElementu("szafa", "x"),)), _graf())
