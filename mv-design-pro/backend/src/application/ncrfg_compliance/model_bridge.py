"""Most model → zgodność NC RfG (V12K-087, G-OZE-B2).

Buduje ``DerDataForCompliance`` z kanonicznego generatora ENM, aby checker
zgodności NC RfG (``NcRfgComplianceChecker``) — dotąd bez producenta z modelu —
liczył z DANYCH MODELU, nie z ulotnego body żądania. Zero fabrykacji:

- zdolności FRT (LVRT/HVRT) z jawnej deklaracji projektanta utrwalonej przez
  ``add_converter_source`` (``generator.meta.has_lvrt_curve/has_hvrt_curve``);
- P(f)/LFSM wyprowadzone z ``frequency_droop_percent`` (G-OZE-B);
- Q(U) wyprowadzone z ``qu_slope_pu_per_pu`` lub trybu regulacji Q(U)
  (G-OZE-B3/B4);
- moc/cosφ z pól generatora.

Reużycie zamiast równoległej ścieżki: te same pola, które konfiguruje kreator
OZE (Regulacja), zasilają koordynację/zgodność.
"""

from __future__ import annotations

from enm.models import EnergyNetworkModel, Generator

from .checker import DerDataForCompliance

_INVERTER_GEN_TYPES = {"pv_inverter", "wind_inverter", "fw_pmsg", "fw_dfig", "fw_scig", "bess"}
_QU_CONTROL_MODES = {"Q_OD_U", "Q_U", "VOLT_VAR"}


def _bool_flag(meta: dict, key: str) -> bool:
    value = meta.get(key)
    return value if isinstance(value, bool) else False


def build_der_compliance_from_generator(
    generator: Generator, *, voltage_kv: float
) -> DerDataForCompliance:
    meta = generator.meta if isinstance(generator.meta, dict) else {}

    freq_droop = meta.get("frequency_droop_percent")
    has_pf_droop = isinstance(freq_droop, int | float) and freq_droop > 0

    qu_slope = meta.get("qu_slope_pu_per_pu")
    control_mode = str(meta.get("control_mode") or "").upper()
    has_qu_curve = (isinstance(qu_slope, int | float) and qu_slope > 0) or (
        control_mode in _QU_CONTROL_MODES
    )

    cos_phi = meta.get("cos_phi")

    return DerDataForCompliance(
        der_ref=generator.ref_id,
        p_max_kw=abs(generator.p_mw) * 1000.0,
        voltage_kv=voltage_kv,
        has_lvrt_curve=_bool_flag(meta, "has_lvrt_curve"),
        has_hvrt_curve=_bool_flag(meta, "has_hvrt_curve"),
        has_pf_droop=has_pf_droop,
        has_qu_curve=has_qu_curve,
        cos_phi_min=(float(cos_phi) if isinstance(cos_phi, int | float) and cos_phi > 0 else None),
    )


def build_der_compliance_list_from_enm(enm: EnergyNetworkModel) -> list[DerDataForCompliance]:
    """Wszystkie źródła przekształtnikowe (DER) modelu jako wejścia zgodności NC RfG.

    Napięcie z szyny przyłączenia generatora; brak szyny → pominięty (bez
    fabrykacji napięcia). Kolejność deterministyczna (kolejność generatorów).
    """
    bus_voltage = {bus.ref_id: bus.voltage_kv for bus in enm.buses}
    rows: list[DerDataForCompliance] = []
    for generator in enm.generators:
        if generator.gen_type not in _INVERTER_GEN_TYPES:
            continue
        voltage_kv = bus_voltage.get(generator.bus_ref)
        if voltage_kv is None or voltage_kv <= 0:
            continue
        rows.append(build_der_compliance_from_generator(generator, voltage_kv=voltage_kv))
    return rows
