"""Dowód end-to-end „do ostatniego klika": grupa połączeń transformatora steruje
prądem zwarcia doziemnego 1F, a ten steruje nastawami ziemnozwarciowymi 50N/51N
(karta V-SM-1, program MODEL SOLVERA TR — SM-1..SM-3, kanon V12K-181).

Łańcuch dowodzony (każde ogniwo to REALNY kod produkcyjny, zero fabrykacji):

    vector_group ─► build_zero_sequence_zbus (SM-3, ``enm.mapping``)
                 ─► z0_bus
                 ─► ShortCircuitIEC60909Solver.compute_1ph_short_circuit
                 ─► ShortCircuitResult.ikss_a  (I″k1 na szynie nN)
                 ─► build_protection_input (``…protection.overcurrent.input_adapter``)
                 ─► fault_levels["ik_min_1ph"]
                 ─► compute_overcurrent_settings (``…protection.overcurrent.calculator``)
                 ─► i_pickup_51n_a / i_inst_50n_a  (nastawy 50N/51N)

Dwie sieci RÓŻNIĄCE SIĘ WYŁĄCZNIE grupą połączeń (poza tym identyczne — to samo
źródło, ta sama impedancja rozproszenia TR, ten sam węzeł zwarcia):

    * TR **Dyn11** — trójkąt po stronie HV BLOKUJE składową zerową sieci HV.
      Strona nN (yn) widzi w Z0 wyłącznie impedancję zerową transformatora Z_T0.
    * TR **YNyn0** — droga SZEREGOWA: składowa zerowa źródła HV DOCIERA na nN,
      więc Z0 na szynie nN rośnie o (zredukowaną) impedancję zerową źródła.

Skutek fizyczny (IEC 60909, składowe symetryczne): Z0(Dyn) < Z0(YNyn) ⇒
|Z1+Z2+Z0|(Dyn) < |…|(YNyn) ⇒ I″k1(Dyn) > I″k1(YNyn). Konsument ziemnozwarciowy
MUSI odziedziczyć tę różnicę: nastawy 50N/51N(Dyn) > 50N/51N(YNyn). Gdyby
konsument NIE reagował na grupę (przerwa łańcucha) — asercje by padły.

Wartości referencyjne (hand-calc, słabe źródło HV r0=2, x0=20 Ω):
    Z_T0 na nN = 0.0396 + j0.98921 Ω (uk=11%, pk=110 kW, 25 MVA, 15 kV) —
    NIEZALEŻNE od źródła dla Dyn (delta blokuje), więc I″k1(Dyn)=9750.24 A stałe;
    YNyn: I″k1=8649.10 A (Z0 powiększone o drogę szeregową źródła).
"""

from __future__ import annotations

import math

import pytest
from application.analyses.protection.overcurrent.calculator import (
    K_EF_PICKUP_DEFAULT,
    K_SC_INST_DEFAULT,
    compute_overcurrent_settings,
)
from application.analyses.protection.overcurrent.input_adapter import build_protection_input
from application.analyses.protection.overcurrent.settings import OvercurrentSettingsV0
from enm.mapping import build_zero_sequence_zbus, map_enm_to_network_graph
from enm.models import Bus, EnergyNetworkModel, ENMHeader, Source, Transformer
from network_model.solvers.short_circuit_iec60909 import (
    ShortCircuitIEC60909Solver,
    ShortCircuitResult,
)

# Transformator wzorcowy 25 MVA, 110/15 kV, uk=11%, pk=110 kW (jak w SM-3 hand-calc).
_SN_MVA = 25.0
_UHV_KV = 110.0
_ULV_KV = 15.0
_UK_PCT = 11.0
_PK_KW = 110.0
# Słabe źródło HV — wyraźna różnica Z0 na drodze szeregowej YNyn (r0=2, x0=20 Ω).
_SRC_R0 = 2.0
_SRC_X0 = 20.0
_CONNECTION_NODE = {"id": "BN-nN", "voltage_kv": _ULV_KV, "rated_current_a": 250.0}


def _hand_zt0_ohm_lv() -> complex:
    """Z_T0 (impedancja zerowa TR) referowana na stronę nN [Ω] — hand-calc."""
    z_pu = _UK_PCT / 100.0
    r_pu = (_PK_KW / 1000.0) / _SN_MVA
    x_pu = math.sqrt(z_pu * z_pu - r_pu * r_pu)
    z_base_lv = (_ULV_KV**2) / _SN_MVA
    return complex(r_pu, x_pu) * z_base_lv


def _run_1ph_on_lv(vector_group: str, c_factor: float = 1.1) -> ShortCircuitResult:
    """Zwarcie 1F doziemne na szynie nN dla podanej grupy połączeń (reszta identyczna)."""
    enm = EnergyNetworkModel(
        header=ENMHeader(name="V-SM-1 chain"),
        buses=[
            Bus(ref_id="bhv", name="HV", voltage_kv=_UHV_KV),
            Bus(ref_id="blv", name="LV", voltage_kv=_ULV_KV),
        ],
        sources=[
            Source(
                ref_id="src",
                name="Sieć HV",
                bus_ref="bhv",
                model="thevenin",
                r_ohm=0.8,
                x_ohm=8.0,
                r0_ohm=_SRC_R0,
                x0_ohm=_SRC_X0,
            )
        ],
        transformers=[
            Transformer(
                ref_id="tr1",
                name="TR",
                hv_bus_ref="bhv",
                lv_bus_ref="blv",
                sn_mva=_SN_MVA,
                uhv_kv=_UHV_KV,
                ulv_kv=_ULV_KV,
                uk_percent=_UK_PCT,
                pk_kw=_PK_KW,
                vector_group=vector_group,
            )
        ],
    )
    graph = map_enm_to_network_graph(enm)
    lv_node = next(n.id for n in graph.nodes.values() if n.name == "LV")
    z0_bus = build_zero_sequence_zbus(enm, graph)
    result = ShortCircuitIEC60909Solver.compute_1ph_short_circuit(
        graph=graph, fault_node_id=lv_node, c_factor=c_factor, tk_s=1.0, z0_bus=z0_bus
    )
    # Wynik solvera nie niesie run_id; nadaj jak realny tor (pipeline robi tak samo).
    object.__setattr__(result, "run_id", f"run-{vector_group}")
    return result


def _settings_for(vector_group: str) -> tuple[ShortCircuitResult, OvercurrentSettingsV0]:
    """Pełny łańcuch konsumenta: SC 1F → build_protection_input → nastawy 50N/51N.

    Bieg MINIMALNY (c = 0,95, IEC 60909-0 Tabela 1) — nastawy zabezpieczeń dobiera
    się od najsłabszego zwarcia, bo to ono musi je jeszcze pobudzić. Do V12K-189
    łańcuch szedł biegiem maksymalnym (c = 1,10), co adapter poprawnie klasyfikuje
    jako `ik_max_1ph`; nastawy nie miały wtedy danych i wpadały w wartość zastępczą.
    Dowód wpływu grupy połączeń na Z0 (testy wyżej) zostaje na c = 1,10 — tam bada
    się impedancję, nie nastawę.
    """
    sc_result = _run_1ph_on_lv(vector_group, c_factor=0.95)
    protection_input = build_protection_input(
        sc_result,
        case_id="case-vsm1",
        base_snapshot_id="snap-vsm1",
        connection_node=_CONNECTION_NODE,
        topology_ref=None,
    )
    settings = compute_overcurrent_settings(protection_input)
    return sc_result, settings


# ---------------------------------------------------------------------------
# Ogniwo 1: grupa steruje prądem zwarcia doziemnego 1F (solver)
# ---------------------------------------------------------------------------


class TestGroupControlsEarthFaultCurrent:
    def test_delta_blocks_source_zero_sequence(self) -> None:
        """Dyn: strona nN widzi w Z0 TYLKO Z_T0 (delta HV izoluje Z0 źródła)."""
        r = _run_1ph_on_lv("Dyn11")
        assert r.z0_ohm == pytest.approx(_hand_zt0_ohm_lv())

    def test_ynyn_series_path_raises_z0_and_lowers_current(self) -> None:
        """YNyn: droga szeregowa dokłada Z0 źródła ⇒ Z0 większe, I″k1 mniejszy niż Dyn."""
        r_dyn = _run_1ph_on_lv("Dyn11")
        r_ynyn = _run_1ph_on_lv("YNyn0")
        assert abs(r_ynyn.z0_ohm) > abs(r_dyn.z0_ohm)
        assert r_dyn.ikss_a > r_ynyn.ikss_a
        # Różnica realna (nie szum numeryczny) — słabe źródło daje ~11 %.
        assert (r_dyn.ikss_a - r_ynyn.ikss_a) / r_dyn.ikss_a > 0.05

    def test_reference_currents(self) -> None:
        """Wartości referencyjne dla audytu (hand-calc).

        RE-BASELINE (V12K-184): Dyn 9750.24 → 8849.00 A, YNyn 8649.10 → 7932.23 A.
        Z0 OBU grup pozostało BIT-IDENTYCZNE (Dyn 0.039600 + j0.989208;
        YNyn 0.076790 + j1.361109) — sieć składowej zerowej jest nietknięta i cała
        wymowa tego łańcucha (grupa połączeń steruje prądem doziemnym) zostaje.
        Zmieniło się wyłącznie Z1 = Z2, bo do V12K-184 impedancja zasilania
        systemowego była ZWIERANA (wirtualny węzeł ziemi uziemiany admitancją
        idealną); teraz zasilanie jest SEM za Z_Q (IEC 60909-0 §3.2), więc realnie
        wchodzi do składowej zgodnej i prąd 1F jest odpowiednio mniejszy.
        """
        assert _run_1ph_on_lv("Dyn11").ikss_a == pytest.approx(8849.00, rel=1e-4)
        assert _run_1ph_on_lv("YNyn0").ikss_a == pytest.approx(7932.23, rel=1e-4)


# ---------------------------------------------------------------------------
# Ogniwo 2: konsument ziemnozwarciowy 50N/51N dziedziczy różnicę grupy
# ---------------------------------------------------------------------------


class TestEarthFaultProtectionReactsToGroup:
    def test_consumer_uses_real_1ph_current_no_fallback(self) -> None:
        """Brak fallbacku 51N/50N ⇒ ik_min_1ph z solvera REALNIE dotarł do konsumenta."""
        _, settings = _settings_for("Dyn11")
        assert "fallback_pickup_51n_a_missing_ik_min_1ph" not in settings.warnings
        assert "fallback_inst_50n_a_missing_ik_min_1ph" not in settings.warnings

    def test_settings_equal_k_times_earth_fault_current(self) -> None:
        """Nastawy = dokładnie k·I″k1 (konsument liczy od prądu 1F, nie od stałej)."""
        for vg in ("Dyn11", "YNyn0"):
            sc_result, settings = _settings_for(vg)
            assert settings.i_pickup_51n_a == pytest.approx(K_EF_PICKUP_DEFAULT * sc_result.ikss_a)
            assert settings.i_inst_50n_a == pytest.approx(K_SC_INST_DEFAULT * sc_result.ikss_a)

    def test_group_changes_earth_fault_settings(self) -> None:
        """DOWÓD „do ostatniego klika": zmiana grupy zmienia nastawy 50N/51N w tym
        samym kierunku co I″k1 (Dyn > YNyn). Gdyby konsument nie reagował — padnie."""
        _, s_dyn = _settings_for("Dyn11")
        _, s_ynyn = _settings_for("YNyn0")
        assert s_dyn.i_pickup_51n_a > s_ynyn.i_pickup_51n_a
        assert s_dyn.i_inst_50n_a > s_ynyn.i_inst_50n_a
        # Ta sama względna różnica co w prądzie (nastawa jest proporcjonalna do I″k1).
        ratio_pickup = s_ynyn.i_pickup_51n_a / s_dyn.i_pickup_51n_a
        ratio_inst = s_ynyn.i_inst_50n_a / s_dyn.i_inst_50n_a
        assert ratio_pickup == pytest.approx(ratio_inst)
        # RE-BASELINE odniesienia prądowego (V12K-184): 8649.10/9750.24 → 7932.23/8849.00.
        # Stosunek rośnie z 0.887065 na 0.896398 — obie grupy dostały ten sam,
        # wcześniej zwierany przyczynek Z_Q do składowej zgodnej, więc ich RÓŻNICA
        # (pochodząca z Z0) waży teraz relatywnie mniej. Różnica pozostaje realna
        # (10.36 %, próg 5 % w teście wyżej), a kierunek Dyn > YNyn niezmieniony.
        # Stosunek jest NIEZALEŻNY od gałęzi c (skaluje obie grupy tak samo) —
        # dlatego przejście łańcucha nastaw na bieg minimalny (V12K-189) go nie ruszyło.
        assert ratio_pickup == pytest.approx(6850.56 / 7642.32, rel=1e-3)

    def test_reference_settings(self) -> None:
        """Wartości referencyjne nastaw (hand-calc: 51N=0.2·I, 50N=0.8·I).

        RE-BASELINE (V12K-189): łańcuch nastaw idzie teraz biegiem MINIMALNYM
        (c = 0,95) — nastawę dobiera się od najsłabszego zwarcia, bo to ono musi
        zabezpieczenie jeszcze pobudzić. Wcześniej szedł biegiem maksymalnym
        (c = 1,10) i nastawy nie miały danych, bo adapter klasyfikuje taki wynik
        jako `ik_max_1ph`; brak wpadał w wartość zastępczą. Prądy skalują się
        wprost współczynnikiem c (impedancja od c nie zależy):
        Dyn  I″k1(0,95) = 7642.32 A ⇒ 0.2·I = 1528.46 / 0.8·I = 6113.85;
        YNyn I″k1(0,95) = 6850.56 A ⇒ 0.2·I = 1370.11 / 0.8·I = 5480.45.
        Sprawdzenie skali: 7642.32/8849.00 = 0.8636 = 0.95/1.10.
        """
        _, s_dyn = _settings_for("Dyn11")
        _, s_ynyn = _settings_for("YNyn0")
        assert s_dyn.i_pickup_51n_a == pytest.approx(1528.464, rel=1e-4)
        assert s_dyn.i_inst_50n_a == pytest.approx(6113.854, rel=1e-4)
        assert s_ynyn.i_pickup_51n_a == pytest.approx(1370.112, rel=1e-4)
        assert s_ynyn.i_inst_50n_a == pytest.approx(5480.447, rel=1e-4)


# ---------------------------------------------------------------------------
# Ogniwo 3: determinizm łańcucha (ten sam wynik dla tej samej grupy)
# ---------------------------------------------------------------------------


class TestChainDeterminism:
    def test_deterministic_settings(self) -> None:
        _, a = _settings_for("Dyn11")
        _, b = _settings_for("Dyn11")
        assert a.to_dict() == b.to_dict()
