"""Serwis aplikacyjny: wrażliwość wyników rozpływu mocy (LF + ogólna).

Warstwa APPLICATION (mapowanie, NIE fizyka). Odczytuje GOTOWY wynik przebiegu
rozpływu (``PF``), odtwarza zamrożony ``PowerFlowResult`` i graf sieci tym samym
przepisem co walidacja energetyczna (jedno źródło odtwarzania — V12K-267 klasa
„dwie kopie tego samego mapowania"), a następnie składa wejścia gotowych
builderów interpretacji:

1. ``VoltageProfileBuilder`` (analysis/voltage_profile) — profil napięć per
   węzeł z progami normatywnymi,
2. ``ProofGenerator.generate_load_flow_voltage_proof`` — dowód spadków napięć
   (kroki ΔU_R/ΔU_X per element; proof engine formatuje podstawienia — czysta
   interpretacja, solver NIETKNIĘTY),
3. ``LFSensitivityBuilder`` (analysis/lf_sensitivity) — czynniki wpływu na
   profil napięć (perturbacje ±delta% parametrów R/X/P/Q/U_n),
4. ``SensitivityBuilder`` (analysis/sensitivity) — wrażliwość marginesów
   normatywnych (perturbacje ±delta% wielkości obserwowanych).

UCZCIWE BRAKI: wejścia zabezpieczeniowe (analiza zabezpieczeń, krzywe I–t)
NIE SĄ produkowalne z przebiegu rozpływu — przekazujemy ``None`` i builder
uczciwie pomija te sekcje (zero fabrykacji). Raport normatywny również nie jest
przekazywany: żadna reguła rejestru normatywnego nie czyta dowodu spadków
napięć, więc raport składałby się wyłącznie z pozycji „brak dowodu" —
mówimy to wprost zamiast dokładać pustych pozycji.

Odwzorowania (plik:linia w kodzie źródłowym):
- ``PowerFlowResult``/graf ← ``application/analyses/energy_validation/service.py``
  (``_reconstruct_power_flow_result``/``_graph`` — jedno źródło odtwarzania),
- moce elementów P/Q ← ``branch_s_to_mva`` z NEGACJĄ końca ``to`` (kanoniczna
  konwencja aplikacyjna: pobór dodatni — ``konwencja_mocy.py``, V12K-040),
- impedancje elementów ← akcesory domenowe grafu
  (``LineBranch.get_total_impedance``, ``TransformerBranch.
  get_short_circuit_impedance_ohm_lv`` — parametry katalogowe, zero fizyki).

Determinizm: ``artifact_id`` dowodu = ``run.id`` (stały per przebieg),
``run_timestamp`` = ``run.created_at`` — dwa wywołania dla tego samego biegu
dają identyczny widok.
"""

from __future__ import annotations

from typing import Any

from analysis.lf_sensitivity.builder import LFSensitivityBuilder
from analysis.normative.models import NormativeConfig
from analysis.sensitivity.builder import SensitivityBuilder
from analysis.voltage_profile.builder import VoltageProfileBuilder
from analysis.voltage_profile.models import VoltageProfileContext, VoltageProfileView

# Jedno źródło odtwarzania wyniku FROZEN i grafu ze snapshotu przebiegu
# (KLASA-NIE-INSTANCJA: druga kopia mapowania byłaby defektem oczekującym
# na rozjazd konwencji — import świadomy, funkcje współdzielone w pakiecie).
from application.analyses.energy_validation.service import (
    _graph,
    _reconstruct_power_flow_result,
)
from application.analyses.kontekst_widoku import zbuduj_kontekst_widoku
from application.proof_engine.proof_generator import (
    LoadFlowBusInput,
    LoadFlowElementInput,
    LoadFlowVoltageInput,
    ProofGenerator,
)
from application.proof_engine.types import LoadElementKind, ProofDocument
from enm.canonical_analysis import CanonicalRun
from network_model.core.branch import BranchType, LineBranch, TransformerBranch
from network_model.core.graph import NetworkGraph


def _wymagaj_biegu_rozplywu(run: CanonicalRun) -> None:
    if run.analysis_type != "PF":
        raise ValueError(
            "Analiza wrażliwości wymaga przebiegu rozpływu mocy; "
            f"otrzymano rodzaj analizy: {run.analysis_type}."
        )
    if run.status != "FINISHED":
        raise ValueError(
            f"Przebieg {run.id} nie jest zakończony (status={run.status}); "
            "wynik rozpływu mocy nie jest dostępny."
        )


def _nazwa_projektu(run: CanonicalRun) -> str | None:
    header = (run.snapshot or {}).get("header") or {}
    nazwa = header.get("name")
    return str(nazwa) if nazwa else None


def _kontekst_profilu(run: CanonicalRun) -> VoltageProfileContext:
    return VoltageProfileContext(
        project_name=_nazwa_projektu(run),
        case_name=None,
        run_timestamp=run.created_at,
        snapshot_id=None,
        # V12K-269: trace_id to identyfikator ARTEFAKTU dowodowego — tu znany
        # jest wyłącznie PRZEBIEG, więc uczciwe None (nie podstawiamy run_id).
        trace_id=None,
        run_id=str(run.id),
    )


def _rodzaj_elementu(branch_type: BranchType) -> LoadElementKind:
    if branch_type == BranchType.CABLE:
        return LoadElementKind.CABLE
    if branch_type == BranchType.TRANSFORMER:
        return LoadElementKind.TRANSFORMER
    return LoadElementKind.LINE


def _zloz_wejscie_dowodu(
    run: CanonicalRun,
    graph: NetworkGraph,
    node_voltage_kv: dict[str, float],
    branch_s_to_mva: dict[str, complex],
) -> LoadFlowVoltageInput:
    """Złóż wejście dowodu spadków napięć z danych przebiegu (czyste mapowanie)."""
    buses: list[LoadFlowBusInput] = []
    for node_id in sorted(graph.nodes):
        node = graph.nodes[node_id]
        u_nom = float(node.voltage_level) if node.voltage_level > 0 else None
        u_ll = node_voltage_kv.get(node_id)
        buses.append(LoadFlowBusInput(bus_id=node_id, u_ll_kv=u_ll, u_nom_kv=u_nom))

    elements: list[LoadFlowElementInput] = []
    for branch_id in sorted(graph.branches):
        branch = graph.branches[branch_id]
        r_ohm: float | None = None
        x_ohm: float | None = None
        length_km: float | None = None
        if isinstance(branch, LineBranch):
            z = branch.get_total_impedance()
            r_ohm, x_ohm = z.real, z.imag
            length_km = branch.length_km
        elif isinstance(branch, TransformerBranch):
            z = branch.get_short_circuit_impedance_ohm_lv()
            r_ohm, x_ohm = z.real, z.imag

        # Moc netto dostarczana do węzła odbiorczego = NEGACJA końca `to`
        # (konwencja kanoniczna V12K-040: pobór dodatni, `konwencja_mocy.py`).
        s_to = branch_s_to_mva.get(branch_id)
        p_mw = -s_to.real if s_to is not None else None
        q_mvar = -s_to.imag if s_to is not None else None

        to_node = graph.nodes.get(branch.to_node_id)
        u_nom_kv = (
            float(to_node.voltage_level)
            if to_node is not None and to_node.voltage_level > 0
            else None
        )
        elements.append(
            LoadFlowElementInput(
                element_id=branch_id,
                element_kind=_rodzaj_elementu(branch.branch_type),
                from_bus_id=branch.from_node_id,
                to_bus_id=branch.to_node_id,
                length_km=length_km,
                r_ohm=r_ohm,
                x_ohm=x_ohm,
                p_mw=p_mw,
                q_mvar=q_mvar,
                u_nom_kv=u_nom_kv,
                u_ll_kv=node_voltage_kv.get(branch.to_node_id),
            )
        )

    result_v1 = (run.raw_result or {}).get("result_v1") or {}
    return LoadFlowVoltageInput(
        project_name=_nazwa_projektu(run) or "",
        case_name=str(run.case_id) if run.case_id else "",
        run_timestamp=run.created_at,
        solver_version=str(result_v1.get("solver_version") or ""),
        buses=buses,
        elements=elements,
    )


def _zloz_widoki(
    run: CanonicalRun,
) -> tuple[ProofDocument, VoltageProfileView, NetworkGraph]:
    """Wspólny fundament: dowód spadków napięć + profil napięć z przebiegu PF."""
    pf_result = _reconstruct_power_flow_result(run)
    graph = _graph(run)

    profil = VoltageProfileBuilder(graph=graph, context=_kontekst_profilu(run)).build(
        pf_result,
        NormativeConfig(),
    )
    wejscie = _zloz_wejscie_dowodu(
        run,
        graph,
        pf_result.node_voltage_kv,
        pf_result.branch_s_to_mva,
    )
    # artifact_id = run.id → determinizm dowodu per przebieg (dwa wywołania
    # identyczne), bez losowego uuid4 wewnątrz generatora.
    dowod = ProofGenerator.generate_load_flow_voltage_proof(wejscie, artifact_id=run.id)
    return dowod, profil, graph


def build_wrazliwosc_view(run: CanonicalRun) -> dict[str, Any]:
    """Zbuduj widok wrażliwości (LF + ogólna) dla przebiegu rozpływu.

    Raises:
        ValueError: gdy przebieg nie jest rozpływem (``PF``) lub nie został
            zakończony — komunikat w języku polskim.
    """
    _wymagaj_biegu_rozplywu(run)
    dowod, profil, graph = _zloz_widoki(run)

    lf = LFSensitivityBuilder().build(dowod, profil, None)
    # Wejścia zabezpieczeniowe i raport normatywny nieprodukowalne z biegu PF —
    # None (uczciwy brak, patrz docstring modułu).
    ogolna = SensitivityBuilder().build([dowod], None, profil, None, None)

    # Tłumaczenie identyfikatorów węzłów grafu na nazwy szyn (język projektanta
    # w UI; identyfikator zostaje dla trybu eksperckiego).
    wezly = {
        node_id: {
            "name": node.name or None,
            "u_nom_kv": float(node.voltage_level) if node.voltage_level > 0 else None,
        }
        for node_id, node in sorted(graph.nodes.items())
    }

    return {
        "analysis_id": lf.analysis_id,
        "context": zbuduj_kontekst_widoku(run, ze_znacznikiem_czasu=True),
        "lf": lf.to_dict(),
        "ogolna": ogolna.to_dict(),
        "wezly": wezly,
        # Jawna deklaracja pominiętych źródeł (uczciwość braków w kontrakcie).
        "pominiete_zrodla_pl": [
            "analiza zabezpieczeń (wymaga danych zabezpieczeniowych, "
            "których przebieg rozpływu nie niesie)",
            "krzywe czasowo-prądowe I–t (jak wyżej)",
            "raport normatywny (żadna reguła rejestru nie czyta dowodu " "spadków napięć rozpływu)",
        ],
    }
