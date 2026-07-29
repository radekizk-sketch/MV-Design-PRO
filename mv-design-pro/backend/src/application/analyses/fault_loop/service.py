"""Widok pętli zwarcia u źródła stacji z modelu (G-STK-4).

Domyka łańcuch uziemienia G-STK-1 „do ostatniego klika": konfiguracja układu
sieci nN (``substation.meta.nn_earthing_system``) + impedancja transformatora
(z uk%/Sn/Ulv/Pk) → impedancja pętli zwarcia u ŹRÓDŁA (szyna nN stacji) i prąd
zwarcia jednofazowego Ik. To impedancja startowa dla wszystkich obwodów nN
(ochrona przeciwporażeniowa przez samoczynne wyłączenie, IEC 60364-4-41).

Warstwa aplikacji: NIC nie liczy sama — impedancję transformatora wyznacza
``fault_loop_builder`` (warstwa solvera), a pętlę i Ik ``compute_fault_loop``
(solver). Tu tylko wyławiamy dane z modelu, mapujemy układ i uczciwie raportujemy
braki (zero fabrykacji).
"""

from __future__ import annotations

import math
from typing import Any

from enm.models import EnergyNetworkModel, Substation, Transformer
from network_model.solvers.fault_loop_builder import (
    FaultLoopBuildRequest,
    build_fault_loop_input,
    transformer_lv_impedance_ohm,
)
from network_model.solvers.fault_loop_iec60364 import (
    NetworkType,
    ProtectionArrangement,
    compute_fault_loop,
)

# Układ sieci nN → (typ solvera, sposób ochrony). TT/IT: metoda pętli TN nie
# dotyczy (inna fizyka zwarcia doziemnego) — raportujemy uczciwie, nie liczymy.
_SYSTEM_MAP: dict[str, tuple[NetworkType, ProtectionArrangement]] = {
    "TN-S": (NetworkType.TN_S, ProtectionArrangement.PE),
    "TN-C-S": (NetworkType.TN_C_S, ProtectionArrangement.PEN),
    "TN-C": (NetworkType.TN_C, ProtectionArrangement.PEN),
}
_DEFAULT_SYSTEM = "TN-C-S"
_NON_TN_SYSTEMS = {"TT", "IT"}


def _find_station(enm: EnergyNetworkModel, station_ref: str) -> Substation | None:
    # Dopasowanie po ref_id (kanoniczny odnośnik domenowy) LUB id (UUID elementu),
    # spójnie z finderem ENM — wywołujący z inspektora podaje element.id.
    return next(
        (s for s in enm.substations if station_ref in (s.ref_id, getattr(s, "id", None))),
        None,
    )


def _station_transformer(enm: EnergyNetworkModel, station: Substation) -> Transformer | None:
    refs = set(station.transformer_refs or [])
    return next((t for t in enm.transformers if t.ref_id in refs), None)


def build_station_fault_loop_view(enm: EnergyNetworkModel, station_ref: str) -> dict[str, Any]:
    """Zbuduj widok pętli zwarcia u źródła stacji (nN) z modelu.

    Zwraca słownik: ``status`` (OK / brak danych / nie dotyczy), ``network_system``,
    impedancję transformatora, wynik pętli (``fault_loop`` z Ik/Z_loop) oraz
    ``missing_data`` (uczciwy brak). Nigdy nie fabrykuje impedancji.
    """
    station = _find_station(enm, station_ref)
    if station is None:
        return {"status": "brak danych", "missing_data": ["station"], "station_ref": station_ref}

    system = str((station.meta or {}).get("nn_earthing_system") or _DEFAULT_SYSTEM)
    context: dict[str, Any] = {
        "station_ref": station_ref,
        "station_name": station.name,
        "network_system": system,
    }

    if system in _NON_TN_SYSTEMS:
        # Metoda pętli TN (samoczynne wyłączenie) nie dotyczy IT/TT — inny mechanizm
        # ochrony (kontrola izolacji / uziemienie odbiorcze). Zero fabrykacji.
        return {
            **context,
            "status": "nie dotyczy",
            "reason_pl": (
                f"Układ {system}: ochrona przeciwporażeniowa nie opiera się na samoczynnym "
                "wyłączeniu z pętli zwarcia TN (IEC 60364-4-41). Pętla TN nie jest liczona."
            ),
            "missing_data": [],
        }

    trafo = _station_transformer(enm, station)
    if trafo is None:
        return {**context, "status": "brak danych", "missing_data": ["transformer"]}

    missing: list[str] = []
    if not trafo.sn_mva or trafo.sn_mva <= 0:
        missing.append("sn_mva")
    if not trafo.uk_percent or trafo.uk_percent <= 0:
        missing.append("uk_percent")
    if not trafo.ulv_kv or trafo.ulv_kv <= 0:
        missing.append("ulv_kv")
    if missing:
        return {**context, "status": "brak danych", "missing_data": missing}

    z_tr = transformer_lv_impedance_ohm(
        sn_mva=trafo.sn_mva,
        uk_percent=trafo.uk_percent,
        ulv_kv=trafo.ulv_kv,
        pk_kw=trafo.pk_kw,
    )
    net_type, protection = _SYSTEM_MAP.get(system, _SYSTEM_MAP[_DEFAULT_SYSTEM])
    # Napięcie fazowe nN [V] = U_lv[kV]·1000/√3.
    u_phase_v = trafo.ulv_kv * 1000.0 / math.sqrt(3.0)

    # Zwarcie U ŹRÓDŁA (szyna nN stacji): przewody fazowy/powrotny ≈ 0 — pętla
    # zdominowana impedancją transformatora (Zs startowe dla obwodów nN).
    request = FaultLoopBuildRequest(
        fault_node_id=trafo.lv_bus_ref,
        u_nom_v=u_phase_v,
        network_type=net_type,
        protection_arrangement=protection,
        phase_conductor_r_ohm=0.0,
        phase_conductor_x_ohm=0.0,
        return_conductor_r_ohm=0.0,
        return_conductor_x_ohm=0.0,
        transformer_r_ohm=z_tr.r_ohm,
        transformer_x_ohm=z_tr.x_ohm,
        transformer_label=f"Transformator SN/nN {trafo.name}",
    )
    result = compute_fault_loop(build_fault_loop_input(request))

    return {
        **context,
        "status": "OK",
        "transformer_ref": trafo.ref_id,
        "nn_bus_ref": trafo.lv_bus_ref,
        "transformer_impedance_ohm": {"r": z_tr.r_ohm, "x": z_tr.x_ohm},
        "fault_loop": result.to_dict(),
        "missing_data": [],
        "note_pl": (
            "Impedancja pętli zwarcia u źródła (szyna nN) — startowa dla obwodów nN. "
            "Napięcia dotyku i czas wyłączenia oceniane dla najdalszego punktu obwodu osobno."
        ),
    }
