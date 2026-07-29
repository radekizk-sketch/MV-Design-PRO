"""Testy widoku pętli zwarcia u źródła stacji z modelu (G-STK-4)."""

from __future__ import annotations

from application.analyses.fault_loop.service import build_station_fault_loop_view
from enm.models import (
    Bus,
    EnergyNetworkModel,
    ENMDefaults,
    ENMHeader,
    Substation,
    Transformer,
)


def _enm(system: str = "TN-C-S", *, uk: float = 4.0, pk: float | None = 6.5) -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(name="t", defaults=ENMDefaults(sn_nominal_kv=15.0)),
        buses=[Bus(ref_id="nn", name="nN", voltage_kv=0.4)],
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


def test_station_fault_loop_computed_from_model_tn_system() -> None:
    """TN-C-S → Ik/Z_loop u źródła liczone z modelu (Z transformatora z uk%/Sn/Ulv)."""
    view = build_station_fault_loop_view(_enm("TN-C-S"), "stn")
    assert view["status"] == "OK"
    assert view["network_system"] == "TN-C-S"
    # Z_base=0.4²/0.63=0.254 Ω; Z_tr=0.04·0.254=0.01016 Ω (pętla u źródła = Z_tr).
    z_loop = view["fault_loop"]["z_loop_ohm"]["magnitude"]
    assert abs(z_loop - 0.01016) < 1e-4
    # Ik u źródła ≈ c·U_faz/Z; 630 kVA/uk 4% ⇒ ~24 kA (max, c=1.05).
    assert 23000 < view["fault_loop"]["ik_max_a"] < 25000
    assert view["fault_loop"]["ik_min_a"] < view["fault_loop"]["ik_max_a"]
    assert view["missing_data"] == []


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
    """Brak Pk → R=0, X=Z (jawne, bez zgadywania stratności)."""
    view = build_station_fault_loop_view(_enm("TN-S", pk=None), "stn")
    assert view["status"] == "OK"
    z = view["transformer_impedance_ohm"]
    assert z["r"] == 0.0
    assert z["x"] > 0.0


def test_station_fault_loop_unknown_station() -> None:
    view = build_station_fault_loop_view(_enm(), "nieistnieje")
    assert view["status"] == "brak danych"
    assert "station" in view["missing_data"]
