"""Diagnostyka K1: konwencja znaku shuntu / przepływów gałęzi.

Karta ``docs/uiux/karty/U4_K1_DIAGNOSTYKA_ZNAKU_SHUNT.md`` — eskalacja z D8.
Testy DOKUMENTUJĄ STAN FAKTYCZNY istniejącego solvera (przez istniejącą ścieżkę
``_execute_power_flow``) na MINIMALNYM przypadku: slack + jeden węzeł odbiorczy +
jedna gałąź o znanej impedancji. NIE liczą fizyki i NIE zmieniają solvera/enm —
asertują wartości ZMIERZONE, z komentarzem interpretacyjnym. Pass NIEZALEŻNIE od
werdyktu (wartości są cechą aktualnej implementacji, nie oceną „poprawności").

AKTUALIZACJA K3 (2026-07-17, karta ``U4_K3_REKALIBRACJA_PO_F98.md``): wartości
przemierzone po naprawie **F9.8** (commit ``6508c12f``, wątek SLD, 2026-07-15) —
canonical PF pipeline niósł podwójną negację znaku mocy (obciążenia wchodziły do
solvera jako generacja). To był PIERWOTNY defekt, którego objawem była „anomalia
znaku shuntu" dokumentowana pierwotnie przez ten plik.

WERDYKT (po F9.8; dowód liczbowy w komentarzach poniżej):
  (a) błąd znaku susceptancji shunt ENM→solver — ODRZUCONY (bez zmian).
      ``ShuntCapacitor`` (b_pu = +Q/S_base → +jB) PODNOSI napięcie węzła (cecha
      pojemnościowa) i jest ZGODNY ZNAKOWO z ładownością linii.
  (b)+(c) Dawna anomalia („kondensator zwiększa |q gałęzi| i |slack_q|") ZNIKŁA
      wraz z F9.8: po naprawie przepływ bierny gałęzi zasilającej MALEJE po
      kompensacji, a shunt księguje się ZGODNIE znakowo z odbiorem wyprzedzającym.
      Konwencja końców gałęzi po F9.8: przepływ końca = injekcja węzła DO gałęzi
      (odbiór ma ``p_to``/``q_to`` ujemne). Odwzorowanie kanoniczne w adapterze
      (``konwencja_mocy``) = NEGACJA końca incydentnego (rekalibracja K3).
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
    # Wartości po naprawie F9.8 (K3): v<1 — fizyczny spadek napięcia za odbiorem.
    assert bez["v_load"] == pytest.approx(0.989299, abs=1e-5)
    assert z_bat["v_load"] == pytest.approx(0.993071, abs=1e-5)
    # Napięcie ROŚNIE po dodaniu baterii → shunt jest pojemnościowy.
    assert z_bat["v_load"] > bez["v_load"]


def test_shunt_zgodny_znakowo_z_ladownoscia_linii() -> None:
    """Dowód na (a)=ODRZUCONE: ShuntCapacitor zachowuje się jak ładowność linii
    (ustalony, zaufany model kondensatora solvera) — OBA podnoszą napięcie względem
    braku kompensacji i OBA przesuwają ``slack_q`` w tę samą stronę (w dół —
    zmniejszają indukcyjny pobór z systemu; wartości po F9.8, K3). Znak
    susceptancji shuntu jest więc spójny z kondensatorem solvera."""
    bez = _measure(_minimal_net(load_q_mvar=0.5))
    shunt = _measure(_minimal_net(load_q_mvar=0.5, cap_mvar=0.5))
    ladownosc = _measure(_minimal_net(load_q_mvar=0.5, line_b_siemens_per_km=8e-5))
    # Oba elementy pojemnościowe podnoszą napięcie względem braku kompensacji.
    assert shunt["v_load"] > bez["v_load"]
    assert ladownosc["v_load"] > bez["v_load"]
    # Oba przesuwają slack_q w TĘ SAMĄ stronę (w dół) — zgodność znaku.
    assert shunt["slack_q"] < bez["slack_q"]
    assert ladownosc["slack_q"] < bez["slack_q"]
    assert ladownosc["slack_q"] == pytest.approx(+0.420246, abs=1e-4)


def test_shunt_zgodny_znakowo_z_odbiorem_wyprzedzajacym() -> None:
    """Konwencja (c) PO F9.8 (K3): moc bierna wstrzykiwana jako STAŁA MOC (odbiór
    wyprzedzający Q=-0,5) księguje się TYM SAMYM znakiem ``slack_q`` co shunt +jB
    tej samej wielkości — oba pojemnościowe → ``slack_q < 0`` (system ODBIERA moc
    bierną). Przed F9.8 znaki były przeciwne (objaw podwójnej negacji pipeline);
    sprzeczność interpretacyjna ZNIKŁA wraz z naprawą."""
    cap = _measure(_minimal_net(load_q_mvar=0.0, cap_mvar=0.5))
    leading_load = _measure(_minimal_net(load_q_mvar=-0.5))
    # Ten sam „kierunek pojemnościowy" i te same znaki slack_q (ujemne).
    assert cap["slack_q"] < 0.0
    assert leading_load["slack_q"] < 0.0
    assert cap["slack_q"] == pytest.approx(-0.487410, abs=1e-5)
    assert leading_load["slack_q"] == pytest.approx(-0.490497, abs=1e-5)


# ---------------------------------------------------------------------------
# 2. Przepływy gałęzi — znaki q_to/q_from i wpływ shuntu (przypadek minimalny).
# ---------------------------------------------------------------------------


def test_znaki_przeplywu_galezi_bez_i_z_shuntem() -> None:
    """Zmierzone przepływy gałęzi zasilającej (koniec przy odbiorze) i ``slack_q``
    dla odbioru indukcyjnego 1,0 + j0,5, BEZ i Z baterią 0,5 Mvar (po F9.8, K3).

    Konwencja końców po F9.8: przepływ końca = injekcja węzła DO gałęzi, więc
    odbiór ma ``p_to``/``q_to`` UJEMNE, a slack ``q_from`` dodatnie (dostarcza
    moc bierną indukcyjną). Obserwacja kluczowa: po dodaniu kondensatora |q_to|
    oraz |slack_q| MALEJĄ (0,50 → 0,007 i 0,51 → 0,015) — kompensacja lokalna
    poprawnie zmniejsza przepływ bierny gałęzi zasilającej (dawna anomalia
    przed-F9.8 pokazywała wzrost — objaw odwróconego znaku pipeline)."""
    bez = _measure(_minimal_net(load_q_mvar=0.5))
    z_bat = _measure(_minimal_net(load_q_mvar=0.5, cap_mvar=0.5))
    # BEZ shuntu — q_to (koniec przy odbiorze) ujemne = −Q odbioru; q_from dodatnie.
    assert bez["q_to"] == pytest.approx(-0.500000, abs=1e-5)
    assert bez["q_from"] == pytest.approx(+0.509650, abs=1e-5)
    assert bez["slack_q"] == pytest.approx(+0.509650, abs=1e-5)
    # Z baterią — |q_to| i |slack_q| MALEJĄ (kompensacja widoczna w przepływie).
    assert z_bat["q_to"] == pytest.approx(-0.006904, abs=1e-5)
    assert z_bat["q_from"] == pytest.approx(+0.014566, abs=1e-5)
    assert z_bat["slack_q"] == pytest.approx(+0.014566, abs=1e-5)
    assert abs(z_bat["q_to"]) < abs(bez["q_to"])
    assert abs(z_bat["slack_q"]) < abs(bez["slack_q"])
    # Moc czynna gałęzi bez zmian jakościowych (p_to ≈ −1 MW = pobór 1 MW).
    assert bez["p_to"] == pytest.approx(-1.0, abs=1e-3)
    assert z_bat["p_to"] == pytest.approx(-1.0, abs=1e-3)


# ---------------------------------------------------------------------------
# 3. Usługa D8 — rozdział cosφ przekroju/punktu, dobór sterowany cosφ punktu.
# ---------------------------------------------------------------------------


def test_d8_dobor_sterowany_cosfi_punktu_wartosci_po_f98() -> None:
    """V12K-040 (opcja B) + rekalibracja K3 — rozdział DWÓCH wielkości w
    ``build_compensation_sizing_view`` na wartościach po naprawie F9.8.

    Po F9.8 przepływ gałęzi POPRAWNIE odzwierciedla kompensację, więc obie
    wielkości zachowują się fizycznie (rosną do pełnej kompensacji, spadają po
    przekompensowaniu) i w punkcie zasilanym JEDNĄ gałęzią pokrywają się liczbowo
    (solver księguje shunt jako rated·V²) — pozostają ROZDZIELONE pojęciowo i w DTO
    (Wymóg 2 właściciela): dobór jest sterowany WYŁĄCZNIE ``cosfi_punktu``.

    Wartości odniesienia (pomiar K3): baseline 0,894427; kandydaci 0,6 / 1,2 / 2,4
    Mvar → cosφ 0,995738 / 0,820726 / 0,458843 (0,6 lekko przekompensowuje
    Q_netto=−0,093, ale spełnia próg 0,95; większe baterie przekompensowują mocno).
    """
    run = _run(_minimal_net(load_q_mvar=0.5))
    view = build_compensation_sizing_view(run, bus_ref="bus_load", cos_phi_min=0.95)
    # (1) cosφ PRZEKROJU sieciowego — wartości po F9.8.
    assert view["baseline"]["cosfi_przekroju_dzien"] == pytest.approx(0.894427, abs=1e-5)
    przekroj_by_size = [(c["rated_mvar"], c["cosfi_przekroju_dzien"]) for c in view["candidates"]]
    assert przekroj_by_size == [
        (0.6, pytest.approx(0.995738, abs=1e-5)),
        (1.2, pytest.approx(0.820726, abs=1e-5)),
        (2.4, pytest.approx(0.458843, abs=1e-5)),
    ]
    # (2) cosφ PUNKTU kompensowanego — podstawa doboru; 0,6 Mvar spełnia cosφ ≥ 0,95.
    assert view["candidates"][0]["cosfi_punktu_dzien"] == pytest.approx(0.995738, abs=1e-5)
    assert view["candidates"][0]["cosfi_punktu_dzien"] > view["baseline"]["cosfi_punktu_dzien"]
    assert view["candidates"][0]["spelnia"] is True
    assert view["candidates"][1]["spelnia"] is False  # 1,2 Mvar przekompensowuje
    assert view["dobor"] is not None
    assert view["dobor"]["rated_mvar"] == 0.6
