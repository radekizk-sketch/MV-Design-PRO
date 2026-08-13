"""Testy widoku pętli zwarcia u źródła stacji z modelu (G-STK-4, karta P0.6)."""

from __future__ import annotations

import math

from application.analyses.fault_loop.service import build_station_fault_loop_view
from enm.models import (
    Bus,
    EnergyNetworkModel,
    ENMDefaults,
    ENMHeader,
    Source,
    Substation,
    Transformer,
)

# Impedancja Thevenina sieci SN u zacisków HV transformatora (Ω, na napięciu
# 15 kV) — wartości okrągłe, żeby wkład upstream dało się policzyć ręcznie
# (test niżej robi to niezależną formułą, nie wywołuje SUT).
_UPSTREAM_R_HV_OHM = 0.1
_UPSTREAM_X_HV_OHM = 0.5


def _enm(
    system: str = "TN-C-S",
    *,
    uk: float = 4.0,
    pk: float | None = 6.5,
    vector_group: str | None = "Dyn11",
    with_source: bool = True,
) -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(name="t", defaults=ENMDefaults(sn_nominal_kv=15.0)),
        buses=[
            Bus(ref_id="sn", name="SN", voltage_kv=15.0),
            Bus(ref_id="nn", name="nN", voltage_kv=0.4),
        ],
        sources=(
            [
                Source(
                    ref_id="src",
                    name="GPZ",
                    bus_ref="sn",
                    model="thevenin",
                    r_ohm=_UPSTREAM_R_HV_OHM,
                    x_ohm=_UPSTREAM_X_HV_OHM,
                )
            ]
            if with_source
            else []
        ),
        transformers=[
            Transformer(
                ref_id="tr",
                name="TR",
                hv_bus_ref="sn",
                lv_bus_ref="nn",
                sn_mva=0.63,
                uhv_kv=15.0,
                ulv_kv=0.4,
                uk_percent=uk,
                pk_kw=pk if pk is not None else 0.0,
                vector_group=vector_group,
            )
        ],
        substations=[
            Substation(
                ref_id="stn",
                name="S",
                station_type="mv_lv",
                bus_refs=["nn"],
                transformer_refs=["tr"],
                meta={"nn_earthing_system": system},
            )
        ],
    )


def _expected_z_loop_at_source(*, uk_percent: float, pk_kw: float) -> float:
    """Formuła niezależna od SUT: Z_tr (Dyn11, uziemienie bezpośrednie ⇒ Z0=Z_tr)
    + upstream sprowadzony kwadratem przekładni (0,4/15)²."""
    z_base_tr = 0.4**2 / 0.63
    z_pu = uk_percent / 100.0
    r_pu = pk_kw / (0.63 * 1000.0)
    x_pu = math.sqrt(max(z_pu**2 - r_pu**2, 0.0))
    r_tr = r_pu * z_base_tr
    x_tr = x_pu * z_base_tr
    ratio_sq = (0.4 / 15.0) ** 2
    r_up = _UPSTREAM_R_HV_OHM * ratio_sq
    x_up = _UPSTREAM_X_HV_OHM * ratio_sq
    return math.hypot(r_tr + r_up, x_tr + x_up)


def test_station_fault_loop_computed_from_model_tn_system() -> None:
    """TN-C-S → Ik/Z_loop u źródła = Z transformatora (Dyn11) + upstream Thevenin SN."""
    view = build_station_fault_loop_view(_enm("TN-C-S"), "stn")
    assert view["status"] == "OK"
    assert view["network_system"] == "TN-C-S"
    z_loop = view["fault_loop"]["z_loop_ohm"]["magnitude"]
    assert abs(z_loop - _expected_z_loop_at_source(uk_percent=4.0, pk_kw=6.5)) < 1e-6
    # Ik u źródła ≈ c·U_faz/Z; 630 kVA/uk 4% ⇒ rzędu kilkunastu-dwudziestu kA (max, c=1.05).
    assert 10000 < view["fault_loop"]["ik_max_a"] < 25000
    assert view["fault_loop"]["ik_min_a"] < view["fault_loop"]["ik_max_a"]
    assert view["missing_data"] == []
    assert view["upstream_impedance_ohm"]["r"] > 0.0
    assert view["upstream_impedance_ohm"]["x"] > 0.0


def test_station_fault_loop_it_system_not_applicable() -> None:
    """Układ IT → metoda pętli TN nie dotyczy (uczciwie, bez liczenia)."""
    view = build_station_fault_loop_view(_enm("IT"), "stn")
    assert view["status"] == "nie dotyczy"
    assert "fault_loop" not in view
    assert "IT" in view["reason_pl"]


def test_station_fault_loop_missing_transformer_params() -> None:
    """Brak uk% → uczciwy brak danych, nie fabrykacja impedancji."""
    view = build_station_fault_loop_view(_enm("TN-S", uk=0.0), "stn")
    assert view["status"] == "brak danych"
    assert "uk_percent" in view["missing_data"]


def test_station_fault_loop_purely_reactive_when_no_copper_losses() -> None:
    """Brak Pk → R=0, X=Z (jawne, bez zgadywania stratności) — dotyczy TYLKO
    składowej transformatora (upstream ma swoje R niezależnie)."""
    view = build_station_fault_loop_view(_enm("TN-S", pk=None), "stn")
    assert view["status"] == "OK"
    z = view["transformer_impedance_ohm"]
    assert z["r"] == 0.0
    assert z["x"] > 0.0


def test_station_fault_loop_unknown_station() -> None:
    view = build_station_fault_loop_view(_enm(), "nieistnieje")
    assert view["status"] == "brak danych"
    assert "station" in view["missing_data"]


def test_station_fault_loop_missing_vector_group() -> None:
    """Brak grupy połączeń → uczciwy brak (§0.1 karty P0.6: Z pętli MUSI być
    zgodna z grupą połączeń, zero zgadywania)."""
    view = build_station_fault_loop_view(_enm(vector_group=None), "stn")
    assert view["status"] == "brak danych"
    assert "vector_group" in view["missing_data"]


def test_station_fault_loop_vector_group_without_lv_local_ground() -> None:
    """Grupa bez lokalnej drogi uziemienia strony nN (np. Dd0 — obie strony
    trójkąt) → pętla L-PE fizycznie nieliczalna tą metodą, fail-closed."""
    view = build_station_fault_loop_view(_enm(vector_group="Dd0"), "stn")
    assert view["status"] == "brak danych"
    assert "transformer_zero_sequence_lv_local_ground" in view["missing_data"]


def test_station_fault_loop_missing_upstream_source() -> None:
    """Brak źródła SN (sieć nie ma z czego policzyć Thevenina — Y-bus bez
    żadnego uziemienia jest osobliwy) → uczciwy brak, NIGDY cichy „silny
    system" (nieskończone źródło) domyślnie."""
    view = build_station_fault_loop_view(_enm(with_source=False), "stn")
    assert view["status"] == "brak danych"
    assert "upstream_network_singular" in view["missing_data"]
