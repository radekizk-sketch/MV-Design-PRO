"""Serwis aplikacyjny: sanity-bounds wyników solverów (zwarcie Ik'', rozpływ).

Warstwa APPLICATION (mapowanie, NIE fizyka). Dwie niezależne oceny:

1. ``build_sanity_bounds_view`` — GOTOWY wynik przebiegu zwarciowego
   (``short_circuit_sn``): dla każdego węzła ocenia wiarygodność Ik'' wobec
   twardych granic fizycznych poziomu napięcia, delegując ocenę do
   ``analysis.sanity_bounds.short_circuit_bounds``. ZERO fizyki — Ik'' pochodzi
   z solvera IEC 60909, napięcie znamionowe ze snapshotu grafu.

   Odwzorowania (plik:linia w kodzie źródłowym):
   - ``ikss_ka`` ← ``build_short_circuit_results(run)`` → wiersz ``ikss_ka`` per
     węzeł (``enm.canonical_analysis.build_short_circuit_results``, konwersja A→kA),
   - ``voltage_kv`` ← ``raw_result.graph.nodes[target_id].voltage_level`` (napięcie
     znamionowe węzła grafu, jak zapisane przez ``_execute_short_circuit``).

2. ``build_power_flow_sanity_bounds_view`` (karta W3-G2, KARTA_W3_KONWERGENCJA_
   FIZYKI_2026-09.md §0.17) — GOTOWY wynik przebiegu rozpływu (``PF``): pasma
   wiarygodności napięć szyn (Un ± 10 %, PN-EN 50160), obciążeń gałęzi
   (linia, kabel i transformator — prąd każdego zacisku wobec prądu znamionowego
   zacisku, decyzja O-51) i strat czynnych sieci (wobec sumy mocy
   czynnej odbiorów), delegując ocenę do ``analysis.sanity_bounds.power_flow_
   bounds``. ZERO fizyki — napięcia/prądy/straty z solvera Newton-Raphson (przez
   ``application.analyses.power_flow_reconstruction``, WSPÓLNA rekonstrukcja z
   ``energy_validation``), prądy znamionowe i napięcia znamionowe z grafu ENM.

   Bieg NIEZBIEŻNY (``pf.converged is False``): WSZYSTKIE pozycje (napięcia,
   obciążenia, straty) dostają status „dane niekompletne" z NAZWANYM powodem —
   wyniki niezbieżnego rozwiązania nie są fizycznie wiarygodne, więc ocenianie
   ich progami byłoby fabrykacją werdyktu z niewiarygodnych danych (ta sama
   zasada co ``application/analyses/kontyngencje_n1.py`` dla bazowego rozpływu).
"""

from __future__ import annotations

import math
from typing import Any

from analysis.obciazenie_galezi import (
    PradyZnamionoweZaciskow,
    obciazenie_galezi,
    prad_zacisku_do_a,
    prad_zacisku_od_a,
    prady_znamionowe_zaciskow,
)
from analysis.sanity_bounds.power_flow_bounds import (
    DOMYSLNY_PROG_STRAT_PROCENT,
    NORMA_NAPIECIA_PL,
    PASMO_NAPIECIA_PROCENT,
    UZASADNIENIE_PROGU_STRAT_PL,
    BranchLoadingSanityVerdict,
    NetworkLossesSanityVerdict,
    VoltageBandSanityVerdict,
    evaluate_branch_loading,
    evaluate_bus_voltage,
    evaluate_network_losses,
)
from analysis.sanity_bounds.short_circuit_bounds import (
    CREDIBLE,
    INCOMPLETE,
    OUT_OF_RANGE,
    evaluate_short_circuit_current,
)
from application.analyses.kontekst_widoku import zbuduj_kontekst_widoku
from application.analyses.power_flow_reconstruction import (
    graf_z_biegu,
    suma_mocy_czynnej_odbiorow_mw,
    wynik_rozplywu_z_biegu,
)
from enm.canonical_analysis import CanonicalRun, build_short_circuit_results
from network_model.core.branch import LineBranch, TransformerBranch


def _voltage_by_target(run: CanonicalRun) -> dict[str, float | None]:
    """Napięcie znamionowe [kV] per węzeł grafu (target_id) z zapisanego grafu."""
    graph_nodes = ((run.raw_result or {}).get("graph") or {}).get("nodes", {})
    out: dict[str, float | None] = {}
    for node_id, node in graph_nodes.items():
        if not isinstance(node, dict):
            continue
        kv = node.get("voltage_level")
        out[str(node_id)] = float(kv) if kv is not None else None
    return out


def _context(run: CanonicalRun) -> dict[str, Any]:
    return zbuduj_kontekst_widoku(run, ze_znacznikiem_czasu=True)


def build_sanity_bounds_view(run: CanonicalRun) -> dict[str, Any]:
    """Zbuduj widok wiarygodności Ik'' per węzeł dla przebiegu zwarciowego.

    Raises:
        ValueError: gdy przebieg nie jest zwarciowy (``short_circuit_sn``) lub
            nie został zakończony — komunikat w języku polskim.
    """
    if run.analysis_type != "short_circuit_sn":
        raise ValueError(
            "Ocena wiarygodności Ik'' wymaga przebiegu zwarciowego; "
            f"otrzymano rodzaj analizy: {run.analysis_type}."
        )
    if run.status != "FINISHED":
        raise ValueError(
            f"Przebieg {run.id} nie jest zakończony (status={run.status}); "
            "wynik zwarciowy nie jest dostępny."
        )

    voltage_by_target = _voltage_by_target(run)
    items: list[dict[str, Any]] = []
    for row in build_short_circuit_results(run).get("rows", []):
        target_id = row.get("target_id")
        verdict = evaluate_short_circuit_current(
            voltage_by_target.get(str(target_id)),
            row.get("ikss_ka"),
        )
        items.append(
            {
                "target_id": target_id,
                "element_id": row.get("element_id"),
                "target_name": row.get("target_name"),
                **verdict.to_dict(),
            }
        )

    items.sort(key=lambda entry: str(entry.get("target_id") or ""))
    summary = {
        "credible_count": sum(1 for item in items if item["status"] == CREDIBLE),
        "out_of_range_count": sum(1 for item in items if item["status"] == OUT_OF_RANGE),
        "incomplete_count": sum(1 for item in items if item["status"] == INCOMPLETE),
        "blocks_osd_package_count": sum(1 for item in items if item["blocks_osd_package"]),
    }
    return {
        "analysis_id": str(run.id),
        "context": _context(run),
        "items": items,
        "summary": summary,
    }


#: Powód „dane niekompletne" dla WSZYSTKICH pozycji, gdy bieg rozpływu nie
#: osiągnął zbieżności — te same wartości technicznie ISTNIEJĄ w zapisie biegu
#: (ostatnia iteracja Newtona-Raphsona), ale nie są fizycznie wiarygodne, więc
#: ocenianie ich progami wiarygodności byłoby fabrykacją werdyktu (KARTA_W3 §0.17,
#: zasada UCZCIWOŚĆ; ten sam wzorzec co ``kontyngencje_n1.py`` dla bazowego PF).
POWOD_NIEZBIEZNOSCI_PL = (
    "Bieg rozpływu nie osiągnął zbieżności — napięcia, prądy gałęzi i straty z "
    "tego przebiegu nie są fizycznie wiarygodne (brak zbieżnego rozwiązania "
    "Newtona-Raphsona)."
)


def _voltage_verdict_niezbiezny(nominal_kv: float | None) -> VoltageBandSanityVerdict:
    """Werdykt napięcia przy niezbieżnym biegu — Un jest daną MODELU (znana
    niezależnie od zbieżności), wynik solvera (actual_kv) jest NIEZNANY."""
    return VoltageBandSanityVerdict(
        nominal_kv=nominal_kv,
        actual_kv=None,
        lower_kv=None,
        upper_kv=None,
        deviation_pct=None,
        in_range=False,
        status=INCOMPLETE,
        why_pl=POWOD_NIEZBIEZNOSCI_PL,
    )


def _loading_verdict_niezbiezny(
    galaz: LineBranch | TransformerBranch,
) -> BranchLoadingSanityVerdict:
    """Werdykt obciążenia przy niezbieżnym biegu — prądy znamionowe zacisków są daną
    MODELU (znane niezależnie od zbieżności), prądy zacisków z solvera są NIEZNANE."""
    znamionowe = prady_znamionowe_zaciskow(galaz)
    ir_od = znamionowe.od_a if isinstance(znamionowe, PradyZnamionoweZaciskow) else None
    ir_do = znamionowe.do_a if isinstance(znamionowe, PradyZnamionoweZaciskow) else None
    return BranchLoadingSanityVerdict(
        current_ka=None,
        rated_current_a=None,
        loading_pct=None,
        in_range=False,
        status=INCOMPLETE,
        why_pl=POWOD_NIEZBIEZNOSCI_PL,
        rated_current_od_a=ir_od,
        rated_current_do_a=ir_do,
    )


def _losses_verdict_niezbiezny(threshold_pct: float) -> NetworkLossesSanityVerdict:
    return NetworkLossesSanityVerdict(
        losses_active_mw=None,
        load_active_total_mw=None,
        losses_pct_of_load=None,
        threshold_pct=threshold_pct,
        threshold_why_pl=UZASADNIENIE_PROGU_STRAT_PL,
        in_range=False,
        status=INCOMPLETE,
        why_pl=POWOD_NIEZBIEZNOSCI_PL,
    )


def _pf_losses_active_mw(run: CanonicalRun) -> float | None:
    """Straty czynne sieci [MW] z podsumowania zapisu biegu, albo ``None``."""
    result_v1 = (run.raw_result or {}).get("result_v1") or {}
    summary = result_v1.get("summary") or {}
    wartosc = summary.get("total_losses_p_mw")
    if wartosc is None or not isinstance(wartosc, int | float) or not math.isfinite(wartosc):
        return None
    return float(wartosc)


def _summary_trojstanowy(items: list[dict[str, Any]]) -> dict[str, int]:
    return {
        "credible_count": sum(1 for item in items if item["status"] == CREDIBLE),
        "out_of_range_count": sum(1 for item in items if item["status"] == OUT_OF_RANGE),
        "incomplete_count": sum(1 for item in items if item["status"] == INCOMPLETE),
    }


def build_power_flow_sanity_bounds_view(run: CanonicalRun) -> dict[str, Any]:
    """Zbuduj widok pasm zdrowego rozsądku rozpływu (napięcia/obciążenia/straty).

    Karta W3-G2 (KARTA_W3_KONWERGENCJA_FIZYKI_2026-09.md §0.17). Rozszerzenie
    ADDYTYWNE: przed tą kartą ``GET /api/quality/sanity-bounds`` na przebiegu PF
    kończyło się 422 (obsługiwany był wyłącznie ``short_circuit_sn``); ten wynik
    dla przebiegów zwarciowych jest BIT W BIT nietknięty.

    Raises:
        ValueError: gdy przebieg nie jest rozpływem (``PF``) lub nie został
            zakończony — komunikat w języku polskim.
    """
    if run.analysis_type != "PF":
        raise ValueError(
            "Pasma zdrowego rozsądku rozpływu wymagają przebiegu rozpływu mocy; "
            f"otrzymano rodzaj analizy: {run.analysis_type}."
        )
    if run.status != "FINISHED":
        raise ValueError(
            f"Przebieg {run.id} nie jest zakończony (status={run.status}); "
            "wynik rozpływu mocy nie jest dostępny."
        )

    pf = wynik_rozplywu_z_biegu(run)
    graph = graf_z_biegu(run)

    napiecia: list[dict[str, Any]] = []
    for node_id, node in sorted(graph.nodes.items()):
        verdict = (
            _voltage_verdict_niezbiezny(node.voltage_level)
            if not pf.converged
            else evaluate_bus_voltage(node.voltage_level, pf.node_voltage_kv.get(node_id))
        )
        napiecia.append({"target_id": node_id, "target_name": node.name, **verdict.to_dict()})

    # Obciążenie gałęzi (decyzja O-51): prąd KAŻDEGO zacisku wobec prądu znamionowego
    # TEGO zacisku — linia i kabel z In katalogu, transformator z S_n i U_n strony
    # (I_r = S_n/(√3·U_n), `network_model/pochodne`). Jedna funkcja obciążenia
    # (`analysis/obciazenie_galezi.py`) dla tabeli gałęzi, walidacji energetycznej i
    # tych pasm — ocena z jednego zacisku zaniżała obciążenie kabla z susceptancją.
    obciazenia: list[dict[str, Any]] = []
    for branch_id, branch in sorted(graph.branches.items()):
        if not isinstance(branch, LineBranch | TransformerBranch) or not branch.in_service:
            continue
        werdykt_obciazenia = (
            _loading_verdict_niezbiezny(branch)
            if not pf.converged
            else evaluate_branch_loading(
                obciazenie_galezi(
                    branch,
                    prad_od_a=prad_zacisku_od_a(pf.branch_current_ka.get(branch_id)),
                    prad_do_a=prad_zacisku_do_a(
                        pf.branch_s_to_mva.get(branch_id),
                        pf.node_voltage_kv.get(branch.to_node_id),
                    ),
                )
            )
        )
        # Osobna nazwa werdyktu obciążenia (nie `verdict` pętli napięć) — jedna nazwa dla dwóch
        # typów werdyktu chowała przed analizą typów różnicę pól.
        obciazenia.append(
            {"target_id": branch_id, "target_name": branch.name, **werdykt_obciazenia.to_dict()}
        )

    straty_verdict = (
        _losses_verdict_niezbiezny(DOMYSLNY_PROG_STRAT_PROCENT)
        if not pf.converged
        else evaluate_network_losses(_pf_losses_active_mw(run), suma_mocy_czynnej_odbiorow_mw(run))
    )

    return {
        "analysis_id": str(run.id),
        "context": _context(run),
        "converged": pf.converged,
        "napiecia": {
            "items": napiecia,
            "norm_ref": NORMA_NAPIECIA_PL,
            "band_pct": PASMO_NAPIECIA_PROCENT,
            "summary": _summary_trojstanowy(napiecia),
        },
        "obciazenia": {
            "items": obciazenia,
            "summary": _summary_trojstanowy(obciazenia),
        },
        "straty": straty_verdict.to_dict(),
    }
