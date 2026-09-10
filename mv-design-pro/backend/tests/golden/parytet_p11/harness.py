"""Harness parytetu KONTRAKTU P11 (karta CV-4.2, konstytucja C.2.3 P11/S7).

Po co: karta CV-4.2 przepina ``api/solver_input.py`` (P11 HTTP:
``GET .../analysis/solver-input/{typ}``, ``GET .../analysis/eligibility``) z WŁASNEGO
budowania grafu (``_get_graph_for_case``: ZAWSZE zwracał ``NetworkGraph(network_model_id=
case_id)`` — graf PUSTY, zero szyn/gałęzi, niezależnie od treści przypadku) na graf
zmontowany PRZEZ ``enm.assembler.zloz_wejscie_rozplywu``/``zloz_wejscie_zwarcia`` (ten sam
tor co bieg kanoniczny). Kontrakt sam — ``solver_input/builder.py::build_solver_input``,
``LoadFlowPayload``/``ShortCircuitPayload`` (LOCKED v1.1) — jest NIETKNIĘTY tą kartą (zero
zmian pliku); zmienia się WYŁĄCZNIE źródło grafu podawanego na wejście.

Dlaczego złoty plik NIE jest „zebrany na stanie sprzed karty" (odstępstwo od dosłownego
brzmienia K5, udokumentowane jawnie w karcie i w meldunku): stan SPRZED tej karty
(``_get_graph_for_case``) fabrykował PUSTY graf dla KAŻDEGO ``case_id`` — payload sprzed
karty byłby ZAWSZE zdegenerowany (zero szyn/gałęzi/PQ niezależnie od realnej sieci
rejestru), więc „parytet ze stanem przed" byłby dowodem fabrykacji, nie dowodem
poprawności budowy kontraktu. Ten harness dowodzi właściwego niezmiennika K5 dwutorowo:

1. ``test_payload_nie_jest_zdegenerowany_pustym_grafem`` (w pliku testowym) — obala WPROST
   stan sprzed karty: payload P11 dla sieci rejestru zawiera realne szyny/gałęzie/PQ, nie
   pusty kontrakt.
2. Złoty plik TEGO harnessu — pinuje stan PO poprawnym przepięciu jako pierwszy poprawny
   pomiar P11 (nie istniał wcześniej żaden golden dla tego payloadu, bo sprzed karty był
   zdegenerowany) — ochrona przed REGRESJĄ w przyszłości (zmiana ``build_solver_input`` albo
   sposobu montażu grafu, która naruszy payload, będzie czerwona od TEJ karty w przód).

Ponownie używane z ``parytet_assemblera.harness`` (NIE kopiowane, zgodnie z K5):
``widok_parytetu``, ``porownaj_wpis``, ``wpis_do_zapisu``, ``zapis_liczby``,
``ATOL_PARYTETU``, ``RTOL_PARYTETU``, ``ZNACZNIK_LICZBY``, ``sieci_enm_rejestru``.
"""

from __future__ import annotations

from typing import Any

from enm.assembler import zloz_wejscie_rozplywu, zloz_wejscie_zwarcia
from enm.models import EnergyNetworkModel
from network_model.catalog.repository import get_default_mv_catalog
from network_model.core.graph import NetworkGraph
from solver_input.builder import build_solver_input
from solver_input.contracts import SolverAnalysisType

from tests.golden.parytet_assemblera.harness import (
    ATOL_PARYTETU,  # noqa: F401 — re-eksport dla testu (ten sam harness, K5)
    RTOL_PARYTETU,  # noqa: F401
    ZNACZNIK_LICZBY,  # noqa: F401
    porownaj_wpis,
    sieci_enm_rejestru,
    widok_parytetu,
    wpis_do_zapisu,
    wpis_z_wyniku,
    zapis_liczby,
)

#: Warianty analizy P11 pinowane per sieć: (klucz, typ analizy, opcje assemblera SC).
#: LOAD_FLOW i SHORT_CIRCUIT_{3F,1F} — jedyne dwa kontrakty payloadu nazwane w K5
#: (``LoadFlowPayload``, ``ShortCircuitPayload``); PROTECTION pomijamy — payload jest
#: jawnym stubem (``{}``) niezależnie od grafu (``build_solver_input``), nie kontraktem
#: wypełnianym z modelu.
WARIANTY_ANALIZY: tuple[tuple[str, SolverAnalysisType, dict[str, Any]], ...] = (
    ("load_flow", SolverAnalysisType.LOAD_FLOW, {}),
    (
        "short_circuit_3f",
        SolverAnalysisType.SHORT_CIRCUIT_3F,
        {"fault_type": "3F", "scenario": "max"},
    ),
    (
        "short_circuit_1f",
        SolverAnalysisType.SHORT_CIRCUIT_1F,
        {"fault_type": "1F", "scenario": "max"},
    ),
)


def graf_p11(
    enm: EnergyNetworkModel, analysis_type: SolverAnalysisType, sc_options: dict[str, Any]
) -> NetworkGraph:
    """Graf DOKŁADNIE jak ``api/solver_input.py::_graph_for_analysis`` (K5: ten sam tor)."""
    snapshot = enm.model_dump(mode="json")
    if analysis_type == SolverAnalysisType.LOAD_FLOW:
        return zloz_wejscie_rozplywu(snapshot, {}).graph
    return zloz_wejscie_zwarcia(snapshot, sc_options).graph


def _payload_lub_odmowa(
    enm: EnergyNetworkModel,
    klucz: str,
    analysis_type: SolverAnalysisType,
    sc_options: dict[str, Any],
) -> dict[str, Any]:
    try:
        graph = graf_p11(enm, analysis_type, sc_options)
        envelope = build_solver_input(
            graph=graph,
            catalog=get_default_mv_catalog(),
            case_id=f"parytet-p11-{klucz}",
            enm_revision="current",
            analysis_type=analysis_type,
            scenario="MAX",
        )
        payload = envelope.payload
    except Exception as exc:  # noqa: BLE001 — odmowa jest wynikiem pinowanym
        return {
            "odmowa": f"{type(exc).__name__}: {exc}",
            "szkielet_sha256": None,
            "szkielet_skroty": None,
            "liczby": None,
            "sciezki": None,
            "szkielet": None,
            "slad_sha256": None,
        }
    # Ten sam wpis co parytet assemblera (K5: jeden harness): szkielet + mapa skrótów
    # poddrzew + liczby kontraktu z tolerancją; payload P11 nie niesie poddrzew śladu
    # White Box, więc ``slad_sha256`` jest skrótem pustej listy.
    return wpis_z_wyniku(payload)


def zbierz_hashe(
    sieci: list[tuple[str, EnergyNetworkModel]] | None = None
) -> dict[str, dict[str, Any]]:
    """Hashe payloadu P11 (PF + SC 3F/1F) dla każdej sieci ENM rejestru (deterministyczne)."""
    wyniki: dict[str, dict[str, Any]] = {}
    for klucz_sieci, enm in sieci if sieci is not None else sieci_enm_rejestru():
        for nazwa, analysis_type, sc_options in WARIANTY_ANALIZY:
            klucz = f"{klucz_sieci}/{nazwa}"
            wyniki[klucz] = _payload_lub_odmowa(enm, klucz, analysis_type, sc_options)
    return wyniki


__all__ = [
    "ATOL_PARYTETU",
    "RTOL_PARYTETU",
    "WARIANTY_ANALIZY",
    "ZNACZNIK_LICZBY",
    "graf_p11",
    "porownaj_wpis",
    "sieci_enm_rejestru",
    "widok_parytetu",
    "wpis_do_zapisu",
    "wpis_z_wyniku",
    "zapis_liczby",
    "zbierz_hashe",
]
