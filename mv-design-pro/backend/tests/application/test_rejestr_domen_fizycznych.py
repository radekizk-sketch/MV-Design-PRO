"""Domena fizyczna biegu z JEDNEGO rejestru i `reportable` wyprowadzany z proweniencji (karta AB-1a D1).

Co przypina ten plik (reguła KLASA, NIE INSTANCJA — każdy test iteruje po REALNYM
zbiorze, nie po liście przepisanej do testu):

1. PARYTET dyspozytor <-> rejestr, w obie strony. Zbiór rodzajów biegów jest czytany
   z AST gałęzi `enm/canonical_analysis.py::_wykonaj_analize_biegu` (i drugiej listy
   tego samego modułu, `_execution_analysis_type_for_run`) — rodzaj dopisany do
   dyspozytora bez wpisu w rejestrze daje czerwień, tak samo wpis rejestru, którego
   żaden bieg nie obsługuje.
2. Nieznany rodzaj -> wyjątek nazwany (fail-closed, nie `None`).
3. PARA `reportable <=> regulatory_evidence_eligible` dla KAŻDEGO wpisu, a każdy
   `evidence_capability_id` jest zarejestrowany w proweniencji (brak cichego
   fail-closed przez literówkę).
4. Pole domeny bez wartości domyślnej; jedna domena na rodzaj biegu.
5. Koperta API biegu niesie `physics_domain` + `physics_domain_pl`.
"""

from __future__ import annotations

import ast
import dataclasses
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

import pytest
from api.canonical_run_views import build_analysis_run_summary, build_power_flow_run_header
from application.solvers import solver_capability_registry as rejestr
from application.solvers.solver_capability_registry import (
    BIEGI_V126,
    SOLVER_CAPABILITY_REGISTRY,
    NieznanyRodzajBieguError,
    PhysicsDomain,
    SolverCapability,
    domena_fizyczna_biegu,
    zdolnosci_biegu,
)
from enm import canonical_analysis
from enm.canonical_analysis import CanonicalRun
from solver_input.provenance import classify_capability, registered_capabilities
from solver_input.v126_contracts import V126AnalysisType

_ZRODLO_DYSPOZYTORA = Path(canonical_analysis.__file__)


def _rodzaje_z_galezi(nazwa_funkcji: str) -> set[str]:
    """Rodzaje biegów, które funkcja dyspozytora rozgałęzia (AST, nie lista w teście).

    Porównania `run.analysis_type == <literał|stała modułu>` dają rodzaj wprost;
    `run.analysis_type.startswith("<prefiks>")` rozwija się na komplet rodzajów
    kontraktu, który ten prefiks obsługuje (dziś wyłącznie `v126:` ->
    `V126AnalysisType`) — nieznany prefiks zatrzymuje test (nowa rodzina biegów
    wymaga świadomego dopisania tutaj i w rejestrze).
    """
    drzewo = ast.parse(_ZRODLO_DYSPOZYTORA.read_text(encoding="utf-8"))
    funkcja = next(
        wezel
        for wezel in ast.walk(drzewo)
        if isinstance(wezel, ast.FunctionDef) and wezel.name == nazwa_funkcji
    )

    def _jest_analysis_type(wezel: ast.AST) -> bool:
        return isinstance(wezel, ast.Attribute) and wezel.attr == "analysis_type"

    rodzaje: set[str] = set()
    for wezel in ast.walk(funkcja):
        if isinstance(wezel, ast.Compare) and _jest_analysis_type(wezel.left):
            for operator, prawy in zip(wezel.ops, wezel.comparators, strict=True):
                # Karta AB-1d_min: `run.analysis_type in <zbior modulu>` (rodzaje bez
                # solvera z `RODZAJE_BIEGOW_BEZ_SOLVERA`) rozwija sie na caly zbior.
                if isinstance(operator, ast.In) and isinstance(prawy, ast.Name):
                    zbior = getattr(canonical_analysis, prawy.id)
                    assert isinstance(zbior, frozenset | set), prawy.id
                    rodzaje |= {str(rodzaj) for rodzaj in zbior}
                    continue
                if not isinstance(operator, ast.Eq):
                    continue
                if isinstance(prawy, ast.Constant) and isinstance(prawy.value, str):
                    rodzaje.add(prawy.value)
                elif isinstance(prawy, ast.Name):
                    rodzaje.add(str(getattr(canonical_analysis, prawy.id)))
        if (
            isinstance(wezel, ast.Call)
            and isinstance(wezel.func, ast.Attribute)
            and wezel.func.attr == "startswith"
            and _jest_analysis_type(wezel.func.value)
        ):
            (argument,) = wezel.args
            assert isinstance(argument, ast.Constant)
            prefiks = argument.value
            assert prefiks == "v126:", f"nieznana rodzina biegow w dyspozytorze: {prefiks!r}"
            rodzaje |= {f"v126:{rodzaj.value}" for rodzaj in V126AnalysisType}
    assert rodzaje, f"nie odczytano zadnej galezi z {nazwa_funkcji}"
    return rodzaje


RODZAJE_DYSPOZYTORA = _rodzaje_z_galezi("_wykonaj_analize_biegu")


def test_typ_wykonawczy_wyprowadzony_dla_kazdego_rodzaju_dyspozytora() -> None:
    """Karta AB-1d_min krok 1: `_execution_analysis_type_for_run` nie jest juz drugą
    lista galezi — wyprowadza typ z `RODZAJE_BIEGOW`. Intencja dawnego testu „dwie
    listy dyspozytora sa tym samym zbiorem" zostaje: KAZDY rodzaj dyspozytora ma typ
    wykonawczy (brak = wyjatek), a zbior rodzajow dyspozytora = jedna lista zrodlowa.
    """
    for analysis_type in RODZAJE_DYSPOZYTORA:
        typ = canonical_analysis._execution_analysis_type_for_run(_bieg(analysis_type))
        assert typ, analysis_type
    assert RODZAJE_DYSPOZYTORA == rejestr.rodzaje_biegow()


@pytest.mark.parametrize("analysis_type", sorted(RODZAJE_DYSPOZYTORA))
def test_kazdy_rodzaj_dyspozytora_ma_domene_z_rejestru(analysis_type: str) -> None:
    domena = domena_fizyczna_biegu(analysis_type)
    assert isinstance(domena, PhysicsDomain)
    assert domena.label_pl


def test_kazdy_wpis_rejestru_obslugiwany_przez_dyspozytor() -> None:
    """Fail-closed w drugą stronę: wpis rejestru bez gałęzi dyspozytora = czerwień."""
    obslugiwane = {
        zdolnosc.capability
        for rodzaj in RODZAJE_DYSPOZYTORA
        for zdolnosc in zdolnosci_biegu(rodzaj)
    }
    assert obslugiwane == set(SOLVER_CAPABILITY_REGISTRY)


def test_tabela_biegow_v126_jest_kompletna_i_zgodna_z_rejestrem() -> None:
    assert set(BIEGI_V126) == {f"v126:{rodzaj.value}" for rodzaj in V126AnalysisType}
    for analysis_type, klucz in BIEGI_V126.items():
        assert SOLVER_CAPABILITY_REGISTRY[klucz].analysis_type == analysis_type.removeprefix(
            "v126:"
        )


@pytest.mark.parametrize(
    "analysis_type",
    ["", "nieznany", "v126:", "v126:nieistniejacy", "pf", "power_quality_harmonics", "SC_3F"],
)
def test_nieznany_rodzaj_biegu_to_wyjatek_nazwany(analysis_type: str) -> None:
    with pytest.raises(NieznanyRodzajBieguError) as exc:
        domena_fizyczna_biegu(analysis_type)
    assert exc.value.analysis_type == analysis_type
    assert repr(analysis_type) in str(exc.value)


def test_pole_domeny_reprezentacji_i_dowodu_bez_wartosci_domyslnej() -> None:
    pola = {pole.name: pole for pole in dataclasses.fields(SolverCapability)}
    for nazwa in ("physics_domain", "reprezentacja", "evidence_capability_id"):
        assert pola[nazwa].default is dataclasses.MISSING, nazwa
        assert pola[nazwa].default_factory is dataclasses.MISSING, nazwa
    # `reportable` NIE jest polem zapisywanym (karta AB-1a D1).
    assert "reportable" not in pola


@pytest.mark.parametrize("klucz", sorted(SOLVER_CAPABILITY_REGISTRY))
def test_para_reportable_rowna_sie_dopuszczalnosci_z_proweniencji(klucz: str) -> None:
    zdolnosc = SOLVER_CAPABILITY_REGISTRY[klucz]
    assert zdolnosc.evidence_capability_id in registered_capabilities(), (
        f"{klucz}: identyfikator dowodowy {zdolnosc.evidence_capability_id!r} nie jest "
        "zarejestrowany — fail-closed zamaskowalby literowke"
    )
    ocena = classify_capability(zdolnosc.evidence_capability_id)
    assert zdolnosc.reportable is ocena.regulatory_evidence_eligible
    slownik = zdolnosc.to_dict()
    assert slownik["reportable"] is ocena.regulatory_evidence_eligible
    assert slownik["ocena_dowodowa"] == ocena.to_dict()
    assert slownik["physics_domain"] == zdolnosc.physics_domain.value
    assert slownik["physics_domain_pl"] == zdolnosc.physics_domain.label_pl


def test_identyfikator_nieznany_proweniencji_jest_nieraportowalny() -> None:
    """Fail-closed pary: wpis wskazujący nieznany identyfikator nie jest raportowalny."""
    wzor = SOLVER_CAPABILITY_REGISTRY["SC_3F"]
    podmieniony = dataclasses.replace(wzor, evidence_capability_id="nieistniejacy.identyfikator")
    assert wzor.reportable is True
    assert podmieniony.reportable is False
    assert podmieniony.ocena_dowodowa.tier.value == "UNVALIDATED_MODEL"


def test_etykiety_domen_kompletne_i_zamkniete() -> None:
    assert set(rejestr._PHYSICS_DOMAIN_LABEL_PL) == set(PhysicsDomain)
    assert all(domena.label_pl for domena in PhysicsDomain)


def test_rozplyw_niesymetryczny_rozstrzygniecie_wykonawcy() -> None:
    """Rozstrzygnięcie D1 (docstring `PhysicsDomain`): POWER_FLOW w reprezentacji abc."""
    zdolnosc = SOLVER_CAPABILITY_REGISTRY["LOAD_FLOW_UNBALANCED_BFS"]
    assert domena_fizyczna_biegu("rozplyw_niesymetryczny") is PhysicsDomain.POWER_FLOW
    assert zdolnosc.reprezentacja == "abc"
    assert domena_fizyczna_biegu("phase_state_sn") is PhysicsDomain.SEQUENCE_DOMAIN


def test_harmoniczne_i_ssci_w_domenie_harmonicznej_i_wycofane() -> None:
    """Karta D1: domena przypisana; karta AB-1d_min krok 3: oba rodzaje `withdrawn`
    (ten sam mechanizm co W3-E) — tor progowy stabilnosci zostaje do AB-2R."""
    for klucz in ("POWER_QUALITY_HARMONICS", "SSCI_IMPEDANCE"):
        zdolnosc = SOLVER_CAPABILITY_REGISTRY[klucz]
        assert zdolnosc.physics_domain is PhysicsDomain.HARMONIC_FREQUENCY_DOMAIN
        assert zdolnosc.availability == "withdrawn"
        assert zdolnosc.reportable is False
    assert SOLVER_CAPABILITY_REGISTRY["DYNAMIC_STABILITY"].availability == "available"


def test_dynamika_rms_w_rejestrze_z_kontraktem_i_testem_odniesienia() -> None:
    zdolnosc = SOLVER_CAPABILITY_REGISTRY["DYNAMIKA_RMS"]
    assert zdolnosc.analysis_type == "dynamika_rms"
    assert zdolnosc.physics_domain is PhysicsDomain.RMS_DYNAMICS
    assert zdolnosc.output_contract == "resultset_dynamic_v1"
    assert zdolnosc.reference_test.startswith("tests/e2e/test_so1a_scenariusz_odniesienia.py::")
    # Ten sam identyfikator, z którego wykonawca biegu wyprowadza stopień dowodowy
    # wyniku — rejestr i bieg nie mogą mówić o tej zdolności dwóch rzeczy.
    assert zdolnosc.evidence_capability_id == canonical_analysis.ZDOLNOSC_DYNAMIKI_RMS


def _bieg(analysis_type: str) -> CanonicalRun:
    return CanonicalRun(
        id=uuid4(),
        case_id="case-domena",
        project_id=None,
        analysis_type=analysis_type,
        status="FINISHED",
        created_at=datetime(2026, 9, 23, tzinfo=UTC),
        snapshot_hash="sha256:domena",
        input_hash="sha256:domena-opcje",
        snapshot={},
        validation={},
        readiness={},
        options={},
    )


@pytest.mark.parametrize("analysis_type", sorted(RODZAJE_DYSPOZYTORA))
def test_koperta_biegu_niesie_domene_fizyczna(analysis_type: str) -> None:
    widok = build_analysis_run_summary(_bieg(analysis_type))
    domena = domena_fizyczna_biegu(analysis_type)
    assert widok["physics_domain"] == domena.value
    assert widok["physics_domain_pl"] == domena.label_pl


def test_naglowek_biegu_rozplywu_niesie_domene_fizyczna() -> None:
    naglowek = build_power_flow_run_header(_bieg("PF"))
    assert naglowek["physics_domain"] == "POWER_FLOW"
    assert naglowek["physics_domain_pl"] == PhysicsDomain.POWER_FLOW.label_pl


def test_koperta_biegu_nieznanego_rodzaju_odmawia_nazwanie() -> None:
    with pytest.raises(NieznanyRodzajBieguError):
        build_analysis_run_summary(_bieg("rodzaj_spoza_rejestru"))
