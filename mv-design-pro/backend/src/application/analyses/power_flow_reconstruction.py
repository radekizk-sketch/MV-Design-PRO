"""Rekonstrukcja wyniku rozpływu (PF) z zapisanego przebiegu — WSPÓLNA baza.

Warstwa APPLICATION (mapowanie, NIE fizyka). Odczytuje GOTOWY wynik przebiegu
rozpływu (``PF``) — napięcia, prądy i moce gałęzi, bilans węzła slack, sumę mocy
czynnej odbiorów — i odtwarza zamrożony ``PowerFlowResult`` (analysis) oraz graf
sieci ze snapshotu. ZERO fizyki — wszystkie wielkości pochodzą z solvera
power-flow (zapis biegu), graf z deterministycznego mapowania ENM→NetworkGraph.

WYODRĘBNIONE z ``application/analyses/energy_validation/service.py`` (karta
W3-G2, reguła KLASA NIE INSTANCJA / reużycie zamiast duplikacji): przed tą kartą
walidacja energetyczna była JEDYNYM konsumentem tej rekonstrukcji; sanity-bounds
rozpływu (``application/analyses/sanity_bounds.py::build_power_flow_sanity_
bounds_view``) potrzebuje DOKŁADNIE tej samej pary (wynik, graf) — kontrakt
LENIENT (dana niepełna → ``None``/NaN, nigdy wyjątek ani wartość zmyślona),
inny niż ŚCISŁY ``application/solvers/power_flow_binding.py`` (Proof Engine,
wszystko-albo-nic z ``BrakDanychRozplywuError``). Ciało funkcji jest BIT W BIT
identyczne z wersją sprzed wyodrębnienia — to przeniesienie, nie przepisanie
(``test_energy_validation_service.py`` bez zmian dowodzi zachowania zachowania).

Odwzorowania (plik:linia w kodzie źródłowym solvera):
- ``branch_current_ka`` ← ``raw_result.branch_current_ka`` (klucz = id gałęzi grafu),
- ``node_voltage_kv`` ← ``raw_result.node_voltage_kv``,
- ``branch_s_from_mva``/``branch_s_to_mva`` ← ``result_v1.branch_results``
  (``p_from_mw``/``q_from_mvar`` itd. → wartość zespolona MVA),
- ``losses_total_pu``/``slack_power_pu`` ← ``result_v1.summary`` (MW/Mvar → p.u.
  przez ``base_mva``),
- graf (LineBranch/TransformerBranch, prądy/moce znamionowe) ←
  ``map_enm_to_network_graph(EnergyNetworkModel.model_validate(run.snapshot))``,
- ``suma_mocy_czynnej_odbiorow_mw`` ← ``result_v1.bus_results[].p_injected_mw``,
  TA SAMA konwencja rozdziału wstrzyk/pobór po znaku co Proof Engine
  (``application/proof_engine/packs/p14_power_flow.py::P14PowerFlowInput.
  from_power_flow_result`` — "Nie jest to fizyka, tylko sumowanie wierszy
  wyniku, których solver już nie zmieni"), z JEDNĄ różnicą świadomą: Proof
  Engine dostaje wejście z warstwy ŚCISŁEJ (kompletność zagwarantowana wcześniej
  przez ``power_flow_binding``), więc sumuje bez pytania; tu żadna gwarancja
  kompletności nie istnieje, więc BRAK ``p_injected_mw`` na KTÓREJKOLWIEK szynie
  daje ``None`` (sumę NIEZNANĄ) zamiast częściowej sumy — częściowa suma
  zaniżałaby odbiory i dawała fałszywie niski budżet strat (ZERO FABRYKACJI).
"""

from __future__ import annotations

import math
from typing import Any

from analysis.power_flow.result import PowerFlowResult
from application.solvers.power_flow_binding import (
    max_mismatch_ze_sladu_lub_brak,
    skalary_wyniku_rozplywu_lub_brak,
)
from enm.canonical_analysis import CanonicalRun
from enm.mapping import map_enm_to_network_graph
from enm.models import EnergyNetworkModel
from network_model.core.graph import NetworkGraph


def _moc_zespolona_z_wiersza(row: dict[str, Any], klucz_p: str, klucz_q: str) -> complex | None:
    """Moc zespolona z wiersza galezi, albo ``None`` gdy skladowa nie jest ZNANA.

    FAB-E (E1): brak ``p_*_mw``/``q_*_mvar`` w wierszu NIE jest moca zerowa —
    galaz zostaje pominieta z wyniku (``None``), co dalej odczytuje
    ``analysis.energy_validation.builder._znana_zespolona`` jako NOT_COMPUTED.
    """
    p_mw = row.get(klucz_p)
    q_mvar = row.get(klucz_q)
    if p_mw is None or q_mvar is None:
        return None
    return complex(float(p_mw), float(q_mvar))


def _bilans_pu(
    summary: dict[str, Any], klucz_p: str, klucz_q: str, base_mva_znane: float | None
) -> complex:
    """Bilans mocy w p.u., albo znacznik NaN gdy skladowa NIE jest ZNANA.

    FAB-E (E1): brak wartosci w podsumowaniu solvera (lub brakujaca ``base_mva``,
    bez ktorej przeliczenie MW/Mvar -> p.u. jest niewykonalne) NIE jest bilansem
    zerowym. Znacznik NaN to ISTNIEJACY kontrakt solvera dla "nieznana" (nie nowy
    pomysl — patrz komentarz w
    ``analysis/energy_validation/builder.py::_znana_zespolona``, ktory czyta NaN
    identycznie jak ``None``), wiec LOSS_BUDGET/REACTIVE_BALANCE poprawnie
    wyladuja jako NOT_COMPUTED zamiast fikcyjnego bilansu zerowego — bez wyjatku
    (kontrakt modulu: dane niepelne -> NOT_COMPUTED, `test_energy_validation_service.py`).
    """
    p_mw = summary.get(klucz_p)
    q_mvar = summary.get(klucz_q)
    if p_mw is None or q_mvar is None or base_mva_znane is None:
        return complex(float("nan"), float("nan"))
    return complex(float(p_mw), float(q_mvar)) / base_mva_znane


def wynik_rozplywu_z_biegu(run: CanonicalRun) -> PowerFlowResult:
    """Odtwórz zamrożony ``PowerFlowResult`` z zapisanego wyniku przebiegu.

    Klucze gałęzi/węzłów są identyczne z tymi, których użył solver (ten sam
    deterministyczny graf ENM→NetworkGraph), więc dopasowują się do grafu
    odtworzonego w ``graf_z_biegu``.

    FAB-E (E1): brak metadanych solvera (``base_mva``/``iterations_count``/
    ``tolerance_used``) NIE jest liczba 0/100 — ten serwis ma jednak KONTRAKT
    „dane niepelne -> NOT_COMPUTED bez wyjatku" (`test_incomplete_result_yields_
    not_computed_without_exception`, `test_missing_raw_result_yields_not_computed`),
    wiec brak zgloszony jest przez propagacje NIEZNANEGO (`None`/NaN) do
    wielkosci faktycznie INTERPRETOWANYCH przez wolajacego (`losses_total_pu`,
    `slack_power_pu`, `branch_s_from_mva`, `branch_s_to_mva`) — NIE przez
    wyjatek. `iterations`/`tolerance`/`base_mva` pochodza z JEDNEGO odczytu
    artefaktu (`skalary_wyniku_rozplywu_lub_brak`, kontrakt FROZEN serializuje je
    zawsze; brak = jawnie nieznane, pozycje NIE OBLICZONE bez wyjatku), a `max_mismatch_pu` ze sladu White Box albo jest
    jawnym brakiem (`None`) — nigdy `0`, `0.0` ani `100.0` MVA (FAB-E, domkniecie
    2026-09-05: wczesniejsza wersja tej funkcji tlumaczyla placeholdery tym, ze
    „nikt ich nie czyta" — to nie jest dowod, tylko zalozenie o konsumentach).
    """
    raw_result = run.raw_result or {}
    result_v1 = raw_result.get("result_v1") or {}
    # Skalary biegu z artefaktu przez JEDEN odczyt (`skalary_wyniku_rozplywu_lub_brak`):
    # brak = jawnie nieznane (None), nie `100.0` MVA ani „zero iteracji" (FAB-E).
    skalary = skalary_wyniku_rozplywu_lub_brak(result_v1)
    base_mva_znane: float | None = skalary.base_mva if skalary is not None else None
    branch_results = result_v1.get("branch_results", [])
    summary = result_v1.get("summary", {})

    branch_s_from_mva = {
        str(row["branch_id"]): moc
        for row in branch_results
        if (moc := _moc_zespolona_z_wiersza(row, "p_from_mw", "q_from_mvar")) is not None
    }
    branch_s_to_mva = {
        str(row["branch_id"]): moc
        for row in branch_results
        if (moc := _moc_zespolona_z_wiersza(row, "p_to_mw", "q_to_mvar")) is not None
    }
    losses_total_pu = _bilans_pu(
        summary, "total_losses_p_mw", "total_losses_q_mvar", base_mva_znane
    )
    slack_power_pu = _bilans_pu(summary, "slack_p_mw", "slack_q_mvar", base_mva_znane)
    node_voltage_kv = {
        str(node_id): float(value)
        for node_id, value in (raw_result.get("node_voltage_kv") or {}).items()
        if value is not None
    }
    branch_current_ka = {
        str(branch_id): float(value)
        for branch_id, value in (raw_result.get("branch_current_ka") or {}).items()
        if value is not None
    }
    return PowerFlowResult(
        converged=bool(result_v1.get("converged", False)),
        iterations=skalary.iterations_count if skalary is not None else None,
        tolerance=skalary.tolerance_used if skalary is not None else None,
        max_mismatch_pu=max_mismatch_ze_sladu_lub_brak(run.white_box_trace),
        base_mva=base_mva_znane,
        slack_node_id=str(result_v1.get("slack_bus_id", "")),
        node_voltage_kv=node_voltage_kv,
        branch_current_ka=branch_current_ka,
        branch_s_from_mva=branch_s_from_mva,
        branch_s_to_mva=branch_s_to_mva,
        losses_total_pu=losses_total_pu,
        slack_power_pu=slack_power_pu,
    )


def graf_z_biegu(run: CanonicalRun) -> NetworkGraph:
    """Odtwórz ``NetworkGraph`` z migawki ENM zapisanej w przebiegu (deterministyczne)."""
    enm = EnergyNetworkModel.model_validate(run.snapshot or {})
    return map_enm_to_network_graph(enm)


def suma_mocy_czynnej_odbiorow_mw(run: CanonicalRun) -> float | None:
    """Suma mocy czynnej POBIERANEJ przez odbiory [MW] z zapisu biegu, albo
    ``None`` gdy nieznana.

    TA SAMA konwencja co Proof Engine (`p14_power_flow.py::P14PowerFlowInput.
    from_power_flow_result`): rozdział wstrzyk/pobór po ZNAKU mocy wstrzykniętej
    (kontrakt FROZEN ``BusResult.p_injected_mw``, ujemna = pobór) — sumowanie
    wierszy WYNIKU, nie fizyka. Różnica świadoma: tam wejście jest już
    zagwarantowane kompletne (warstwa ścisła `power_flow_binding`); tu — BRAK
    ``p_injected_mw`` na KTÓREJKOLWIEK szynie (także szyna spoza wyspy slacka,
    `bus_results` niekompletne albo puste) daje ``None`` całości, nie sumę
    częściową — częściowa suma zaniżałaby odbiory sieci i dawała fałszywie
    optymistyczny budżet strat (ZERO FABRYKACJI, karta W3-G2).
    """
    raw_result = run.raw_result or {}
    result_v1 = raw_result.get("result_v1") or {}
    bus_results = result_v1.get("bus_results")
    if not bus_results:
        return None
    total = 0.0
    for row in bus_results:
        p_mw = row.get("p_injected_mw")
        if p_mw is None or not isinstance(p_mw, int | float) or not math.isfinite(p_mw):
            return None
        if p_mw < 0:
            total += abs(float(p_mw))
    return total
