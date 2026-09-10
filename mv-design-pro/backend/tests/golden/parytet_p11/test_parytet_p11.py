"""Parytet kontraktu P11 (CV-4.2): payload solver-input (`LoadFlowPayload`/`ShortCircuitPayload`)
budowany z grafu zmontowanego PRZEZ assembler, dla każdej sieci ENM rejestru.

Złoty plik (``regeneruj.py``): per wpis odmowa (tekst), hash SZKIELETU payloadu
(struktura bez liczb — dokładnie) i LICZBY kontraktu (z tolerancją między maszynami;
lokalnie determinizm dokładny) — dokładnie ten sam mechanizm co
``tests/golden/parytet_assemblera`` (K5: `widok_parytetu`/`porownaj_wpis` reużyte, nie
kopiowane). Czerwony test = zmiana w `build_solver_input` albo w sposobie montażu grafu
P11 naruszyła payload — naprawia się kod, nie złoty plik (wyjątek: świadoma korekta
kontraktu z dowodem per pole w commicie).

Zobacz ``harness.py`` (docstring modułu) dla wyjaśnienia, dlaczego złoty plik NIE jest
zebrany na stanie sprzed karty CV-4.2 (stan sprzed karty fabrykował PUSTY graf — patrz
`test_payload_nie_jest_zdegenerowany_pustym_grafem` niżej, który obala go wprost).
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from enm.assembler import zloz_wejscie_zwarcia
from network_model.core.graph import NetworkGraph
from solver_input.builder import build_solver_input
from solver_input.contracts import SolverAnalysisType

from tests.golden.parytet_p11.harness import (
    graf_p11,
    porownaj_wpis,
    sieci_enm_rejestru,
    zbierz_hashe,
)

_PLIK = Path(__file__).parent / "zlote_hashe.json"


@pytest.fixture(scope="module")
def zebrane() -> dict[str, dict]:
    return zbierz_hashe(sieci_enm_rejestru())


def test_zlote_hashe_istnieja_i_pokrywaja_kazda_siec_enm_rejestru(zebrane: dict[str, dict]) -> None:
    zlote = json.loads(_PLIK.read_text(encoding="utf-8"))
    assert set(zlote) == set(zebrane), (
        "Zbiór kluczy (sieć × wariant P11) rozjechał się ze złotym plikiem — nowa sieć w "
        "rejestrze albo nowy wariant: uzupełnij złote hashe świadomie (regeneruj.py) i "
        "uzasadnij w commicie."
    )


def test_parytet_struktury_dokladnie_i_liczb_w_tolerancji(zebrane: dict[str, dict]) -> None:
    zlote = json.loads(_PLIK.read_text(encoding="utf-8"))
    rozbieznosci = {
        klucz: porownaj_wpis(zlote[klucz], wpis)
        for klucz, wpis in zebrane.items()
        if klucz in zlote
    }
    zle = {k: v for k, v in rozbieznosci.items() if v}
    assert not zle, "Parytet kontraktu P11 złamany:\n" + "\n".join(
        f"  {k}: " + "; ".join(v) for k, v in sorted(zle.items())
    )


def test_harness_jest_deterministyczny(zebrane: dict[str, dict]) -> None:
    """Ta sama maszyna, dwa biegi: równość DOKŁADNA (szkielet, liczby, ścieżki)."""
    assert zbierz_hashe(sieci_enm_rejestru()) == zebrane


def test_payload_nie_jest_zdegenerowany_pustym_grafem() -> None:
    """Obala WPROST stan sprzed karty CV-4.2.

    `api/solver_input.py::_get_graph_for_case` (usunięty tą kartą) zawsze zwracał
    `NetworkGraph(network_model_id=case_id)` — ZERO szyn/gałęzi, niezależnie od treści
    przypadku — więc payload P11 (`LoadFlowPayload`/`ShortCircuitPayload`) był ZAWSZE
    zdegenerowany (puste listy `buses`/`branches`), bez względu na realny model. Po
    przepięciu na `enm.assembler.zloz_wejscie_rozplywu`/`zloz_wejscie_zwarcia` (K5)
    payload dla KAŻDEJ sieci rejestru z co najmniej jedną szyną musi zawierać realne
    szyny — inaczej fabrykacja by wróciła niezauważona.
    """
    sieci = sieci_enm_rejestru()
    assert sieci, "Rejestr sieci ENM jest pusty — nie da się dowieść niezdegenerowania"

    def _graf_lub_pomin(enm: object, at: SolverAnalysisType, opcje: dict) -> NetworkGraph | None:
        # Sieć celowo niefizyczna dla toru kanonicznego (np. dwa węzły SLACK — scenariusz
        # N-1 — albo sieć bez drogi powrotu prądu zerowego) — assembler odmawia PRZED
        # payloadem; to TEN SAM denial co `parytet_assemblera` dla tej samej sieci (patrz
        # harness.py docstring), nie fabrykacja. Nie dowodzi ani nie obala niezdegenerowania
        # — pomijamy, dowód idzie z sieci, które SIĘ budują. Jedno źródło prawdy (ten sam
        # wyjątek decyduje o WEJŚCIU do próby dla KAŻDEGO wariantu — KLASA NIE INSTANCJA).
        try:
            return graf_p11(enm, at, opcje)
        except ValueError:
            return None

    sprawdzone = 0
    for _klucz, enm in sieci:
        if not enm.buses:
            continue

        graph_pf = _graf_lub_pomin(enm, SolverAnalysisType.LOAD_FLOW, {})
        if graph_pf is not None:
            payload_pf = build_solver_input(
                graph=graph_pf,
                catalog=None,
                case_id="anty-degeneracja-pf",
                enm_revision="current",
                analysis_type=SolverAnalysisType.LOAD_FLOW,
            ).payload
            assert len(payload_pf["buses"]) == len(enm.buses), (
                f"{_klucz}: payload rozpływu ma {len(payload_pf['buses'])} szyn, "
                f"model ENM ma {len(enm.buses)} — graf P11 nie odzwierciedla realnego modelu"
            )
            sprawdzone += 1

        graph_sc = _graf_lub_pomin(
            enm, SolverAnalysisType.SHORT_CIRCUIT_3F, {"fault_type": "3F", "scenario": "max"}
        )
        if graph_sc is not None:
            payload_sc = build_solver_input(
                graph=graph_sc,
                catalog=None,
                case_id="anty-degeneracja-sc",
                enm_revision="current",
                analysis_type=SolverAnalysisType.SHORT_CIRCUIT_3F,
            ).payload
            assert len(payload_sc["buses"]) == len(enm.buses), (
                f"{_klucz}: payload zwarcia ma {len(payload_sc['buses'])} szyn, "
                f"model ENM ma {len(enm.buses)} — graf P11 nie odzwierciedla realnego modelu"
            )
            sprawdzone += 1

    assert sprawdzone > 0, "Żadna sieć rejestru nie ma szyn — dobór fixture do poprawy"


def test_graf_p11_jest_tym_samym_torem_co_zloz_wejscie_zwarcia_wprost() -> None:
    """`graf_p11` (harness) nie jest własną kopią montażu — deleguje 1:1 do assemblera,
    dokładnie jak `api/solver_input.py::_graph_for_analysis` (K5: zero równoległego
    składania grafu obok assemblera, nawet w teście)."""
    _klucz, enm = sieci_enm_rejestru()[0]
    snapshot = enm.model_dump(mode="json")
    sc_options = {"fault_type": "3F", "scenario": "max"}
    oczekiwany = zloz_wejscie_zwarcia(snapshot, sc_options).graph
    otrzymany = graf_p11(enm, SolverAnalysisType.SHORT_CIRCUIT_3F, sc_options)
    assert otrzymany.nodes.keys() == oczekiwany.nodes.keys()
    assert otrzymany.branches.keys() == oczekiwany.branches.keys()
