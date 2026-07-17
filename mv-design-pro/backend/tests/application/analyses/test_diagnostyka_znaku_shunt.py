"""Diagnostyka K1 (READ-ONLY): konwencja znaku shuntu / przepływów gałęzi.

Karta ``docs/uiux/karty/U4_K1_DIAGNOSTYKA_ZNAKU_SHUNT.md`` — eskalacja z D8.
Testy DOKUMENTUJĄ STAN FAKTYCZNY istniejącego solvera (przez istniejącą ścieżkę
``_execute_power_flow``) na MINIMALNYM przypadku: slack + jeden węzeł odbiorczy +
jedna gałąź o znanej impedancji. NIE liczą fizyki i NIE zmieniają solvera/enm —
asertują wartości ZMIERZONE, z komentarzem interpretacyjnym. Pass NIEZALEŻNIE od
werdyktu (wartości są cechą aktualnej implementacji, nie oceną „poprawności").

WERDYKT (dowód liczbowy w komentarzach poniżej):
  (a) błąd znaku susceptancji shunt ENM→solver — ODRZUCONY. ``ShuntCapacitor``
      (b_pu = +Q/S_base → +jB) PODNOSI napięcie węzła (cecha pojemnościowa) i jest
      ZGODNY ZNAKOWO z ładownością linii (``b_siemens`` — ustalony, zaufany model
      kondensatora w solverze): oba podnoszą napięcie i oba przesuwają ``slack_q``
      w tę samą stronę. Gdyby znak był błędny, shunt obniżałby napięcie względem
      ładowności linii — nie obniża.
  (b)+(c) Defekt leży w INTERPRETACJI znaków w D8, u podłoża której jest KONWENCJA
      znaku mocy biernej w ``PowerFlowResult`` (``branch_results``/``slack_q``): nie
      zachowuje się jak „obciążenie bierne widziane przez sieć", którego oczekiwał
      D8. Dodanie POPRAWNIE ZNAKOWANEGO kondensatora do odbioru INDUKCYJNEGO
      zwiększa |q gałęzi| i |slack_q| → cosφ liczony z przepływu gałęzi POGARSZA
      się z rosnącą baterią (dowód: ``test_d8_cosphi_pogarsza_sie_na_punkcie_...``).
      Dlatego fikstura D8 używa punktu WYPRZEDZAJĄCEGO (load_q_mvar=-2.0), by dobór
      „działał". Poprawna reformułacja miary cosφ zależy od decyzji o konwencji
      znaku Q w solverze/enm (poza warstwą aplikacji) → eskalacja, bez zmian tutaj.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import pytest
from application.analyses.dobor_kompensacji import build_compensation_sizing_view
from enm.canonical_analysis import CanonicalRun, create_run, execute_run, reset_canonical_runs
from enm.models import (
    BranchRating,
    Bus,
    EnergyNetworkModel,
    ENMHeader,
    Load,
    OverheadLine,
    ShuntCapacitor,
    Source,
)
from enm.store import reset_enm_store, set_enm

# Węzeł odbiorczy (bus_load) w grafie solvera — deterministyczny UUID5 z ref_id.
_LOAD_NODE_PREFIX = "7855"


@pytest.fixture(autouse=True)
def _reset() -> Iterator[None]:
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


def _minimal_net(
    *,
    load_q_mvar: float,
    cap_mvar: float | None = None,
    line_b_siemens_per_km: float = 0.0,
) -> EnergyNetworkModel:
    """Slack (bus_slack) — jedna linia 5 km — węzeł odbiorczy (bus_load), 15 kV.

    P odbioru = 1,0 MW; Q wg ``load_q_mvar`` (dodatnie = indukcyjny). Opcjonalnie
    bateria ShuntCapacitor przy odbiorze i/lub ładowność linii (element
    pojemnościowy solvera) do porównania znakowego.
    """
    shunts: list[ShuntCapacitor] = []
    if cap_mvar is not None:
        shunts.append(
            ShuntCapacitor(
                ref_id="cap",
                name="Bateria",
                bus_ref="bus_load",
                rated_mvar=cap_mvar,
                rated_kv=15.0,
                status="closed",
                catalog_ref="KOMP",
                catalog_namespace="KOMPENSATOR_SN",
                parameter_source="CATALOG",
                source_mode="KATALOG",
            )
        )
    return EnergyNetworkModel(
        header=ENMHeader(name="Diagnostyka K1"),
        buses=[
            Bus(ref_id="bus_slack", name="Slack SN", voltage_kv=15.0),
            Bus(ref_id="bus_load", name="Odbior SN", voltage_kv=15.0),
        ],
        sources=[
            Source(
                ref_id="src",
                name="System",
                bus_ref="bus_slack",
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
        branches=[
            OverheadLine(
                ref_id="line",
                name="Linia SN",
                from_bus_ref="bus_slack",
                to_bus_ref="bus_load",
                length_km=5.0,
                r_ohm_per_km=0.306,
                x_ohm_per_km=0.34,
                b_siemens_per_km=line_b_siemens_per_km,
                r0_ohm_per_km=0.46,
                x0_ohm_per_km=1.2,
                rating=BranchRating(in_a=210.0),
                catalog_ref="line-afl-70",
                catalog_namespace="LINIA_SN",
                parameter_source="CATALOG",
                source_mode="KATALOG",
            )
        ],
        loads=[Load(ref_id="ld", name="Odbior", bus_ref="bus_load", p_mw=1.0, q_mvar=load_q_mvar)],
        shunt_capacitors=shunts,
    )


def _run(net: EnergyNetworkModel) -> CanonicalRun:
    set_enm("c", net)
    return execute_run(create_run(case_id="c", analysis_type="PF").id)


def _measure(net: EnergyNetworkModel) -> dict[str, float]:
    """Zmierzone wielkości rozpływu: napięcie odbioru, slack_q oraz przepływ gałęzi
    zasilającej (koniec przy odbiorze = ``q_to``/``p_to``)."""
    result = _run(net)
    rv: dict[str, Any] = (result.raw_result or {}).get("result_v1") or {}
    assert rv.get("converged") is True
    summary: dict[str, Any] = rv.get("summary") or {}
    v_load = next(
        float(b["v_pu"])
        for b in rv["bus_results"]
        if str(b["bus_id"]).startswith(_LOAD_NODE_PREFIX)
    )
    feeder = next(
        b
        for b in rv["branch_results"]
        if abs(float(b["p_to_mw"])) > 0.1 or abs(float(b["q_to_mvar"])) > 0.1
    )
    return {
        "v_load": v_load,
        "slack_q": float(summary["slack_q_mvar"]),
        "slack_p": float(summary["slack_p_mw"]),
        "q_to": float(feeder["q_to_mvar"]),
        "q_from": float(feeder["q_from_mvar"]),
        "p_to": float(feeder["p_to_mw"]),
        "p_from": float(feeder["p_from_mw"]),
    }


# ---------------------------------------------------------------------------
# 1. Znak susceptancji shunt — hipoteza (a). Kondensator PODNOSI napięcie.
# ---------------------------------------------------------------------------


def test_kondensator_podnosi_napiecie_wezla() -> None:
    """ShuntCapacitor 0,5 Mvar na odbiorze indukcyjnym PODNOSI napięcie węzła —
    cecha POJEMNOŚCIOWA (odrzuca hipotezę o odwróconym znaku susceptancji)."""
    bez = _measure(_minimal_net(load_q_mvar=0.5))
    z_bat = _measure(_minimal_net(load_q_mvar=0.5, cap_mvar=0.5))
    assert bez["v_load"] == pytest.approx(1.010460, abs=1e-5)
    assert z_bat["v_load"] == pytest.approx(1.014260, abs=1e-5)
    # Napięcie ROŚNIE po dodaniu baterii → shunt jest pojemnościowy.
    assert z_bat["v_load"] > bez["v_load"]


def test_shunt_zgodny_znakowo_z_ladownoscia_linii() -> None:
    """Dowód na (a)=ODRZUCONE: ShuntCapacitor zachowuje się jak ładowność linii
    (ustalony, zaufany model kondensatora solvera) — OBA podnoszą napięcie względem
    braku kompensacji i OBA przesuwają ``slack_q`` w tę samą stronę (bardziej
    ujemne). Znak susceptancji shuntu jest więc spójny z kondensatorem solvera."""
    bez = _measure(_minimal_net(load_q_mvar=0.5))
    shunt = _measure(_minimal_net(load_q_mvar=0.5, cap_mvar=0.5))
    ladownosc = _measure(_minimal_net(load_q_mvar=0.5, line_b_siemens_per_km=8e-5))
    # Oba elementy pojemnościowe podnoszą napięcie względem braku kompensacji.
    assert shunt["v_load"] > bez["v_load"]
    assert ladownosc["v_load"] > bez["v_load"]
    # Oba przesuwają slack_q w TĘ SAMĄ stronę (bardziej ujemne) — zgodność znaku.
    assert shunt["slack_q"] < bez["slack_q"]
    assert ladownosc["slack_q"] < bez["slack_q"]
    assert ladownosc["slack_q"] == pytest.approx(-0.58138, abs=1e-4)


def test_shunt_przeciwny_znakowo_do_odbioru_wyprzedzajacego() -> None:
    """Konwencja (c): moc bierna wstrzykiwana jako STAŁA MOC (odbiór wyprzedzający
    Q=-0,5) księguje się PRZECIWNYM znakiem ``slack_q`` niż shunt +jB tej samej
    wielkości. To źródło pomyłki interpretacyjnej — ``slack_q`` nie jest wprost
    „mocą bierną pobieraną przez sieć"."""
    cap = _measure(_minimal_net(load_q_mvar=0.0, cap_mvar=0.5))
    leading_load = _measure(_minimal_net(load_q_mvar=-0.5))
    # Ten sam „kierunek pojemnościowy", a znaki slack_q PRZECIWNE.
    assert cap["slack_q"] < 0.0
    assert leading_load["slack_q"] > 0.0
    assert cap["slack_q"] == pytest.approx(-0.501266, abs=1e-5)
    assert leading_load["slack_q"] == pytest.approx(+0.509389, abs=1e-5)


# ---------------------------------------------------------------------------
# 2. Przepływy gałęzi — znaki q_to/q_from i wpływ shuntu (przypadek minimalny).
# ---------------------------------------------------------------------------


def test_znaki_przeplywu_galezi_bez_i_z_shuntem() -> None:
    """Zmierzone przepływy gałęzi zasilającej (koniec przy odbiorze) i ``slack_q``
    dla odbioru indukcyjnego 1,0 + j0,5, BEZ i Z baterią 0,5 Mvar.

    Obserwacja kluczowa: po dodaniu kondensatora |q_to| oraz |slack_q| ROSNĄ
    (0,5 → 1,01 i 0,49 → 1,00) — przepływ mocy biernej mierzony na gałęzi NIE maleje
    (mimo lokalnej kompensacji), bo konwencja znaku Q w ``branch_results`` nie
    odpowiada intuicji „kompensacja zmniejsza Q w gałęzi zasilającej"."""
    bez = _measure(_minimal_net(load_q_mvar=0.5))
    z_bat = _measure(_minimal_net(load_q_mvar=0.5, cap_mvar=0.5))
    # BEZ shuntu — q_to (koniec przy odbiorze) dodatnie ≈ Q odbioru; q_from ujemne.
    assert bez["q_to"] == pytest.approx(0.500000, abs=1e-5)
    assert bez["q_from"] == pytest.approx(-0.490750, abs=1e-5)
    assert bez["slack_q"] == pytest.approx(-0.490750, abs=1e-5)
    # Z baterią — |q_to| i |slack_q| ROSNĄ (nie maleją).
    assert z_bat["q_to"] == pytest.approx(1.014362, abs=1e-5)
    assert z_bat["q_from"] == pytest.approx(-0.999461, abs=1e-5)
    assert z_bat["slack_q"] == pytest.approx(-0.999461, abs=1e-5)
    assert abs(z_bat["q_to"]) > abs(bez["q_to"])
    assert abs(z_bat["slack_q"]) > abs(bez["slack_q"])
    # Moc czynna gałęzi bez zmian jakościowych (p_to ≈ obciążenie 1 MW).
    assert bez["p_to"] == pytest.approx(1.0, abs=1e-3)
    assert z_bat["p_to"] == pytest.approx(1.0, abs=1e-3)


# ---------------------------------------------------------------------------
# 3. Defekt na poziomie usługi D8 — cosφ z przepływu gałęzi POGARSZA się.
# ---------------------------------------------------------------------------


def test_d8_cosphi_pogarsza_sie_na_punkcie_indukcyjnym() -> None:
    """Reprodukcja eskalacji na poziomie ``build_compensation_sizing_view``: dla
    punktu INDUKCYJNEGO (1,0 + j0,5) cosφ dnia liczony z przepływu gałęzi MALEJE
    monotonicznie z rosnącą baterią, a dobór = ``None``. To potwierdza hipotezę (b):
    miara cosφ oparta na ``branch_results`` nie rośnie przy poprawnie znakowanej
    kompensacji odbioru indukcyjnego (stąd fikstura D8 z punktem wyprzedzającym)."""
    run = _run(_minimal_net(load_q_mvar=0.5))
    view = build_compensation_sizing_view(run, bus_ref="bus_load", cos_phi_min=0.95)
    assert view["baseline"]["cos_phi_day"] == pytest.approx(0.894427, abs=1e-5)
    cos_by_size = [(c["rated_mvar"], c["cos_phi_day"]) for c in view["candidates"]]
    assert cos_by_size == [
        (0.6, pytest.approx(0.666624, abs=1e-5)),
        (1.2, pytest.approx(0.496668, abs=1e-5)),
        (2.4, pytest.approx(0.312428, abs=1e-5)),
    ]
    # Monotoniczny SPADEK cosφ z rosnącą baterią (przeciwnie do intuicji kompensacji).
    cos_values = [c["cos_phi_day"] for c in view["candidates"]]
    assert cos_values == sorted(cos_values, reverse=True)
    assert cos_values[-1] < view["baseline"]["cos_phi_day"]
    # Żaden kandydat nie „spełnia" → dobór None na punkcie indukcyjnym.
    assert all(c["spelnia"] is False for c in view["candidates"])
    assert view["dobor"] is None
