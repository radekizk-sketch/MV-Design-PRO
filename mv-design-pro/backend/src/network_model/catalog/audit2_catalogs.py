"""
Katalogi audytu 2 (mirror frontendowych katalogow z `frontend/src/ui/network-build/station-der/`).

7 katalogow:
  - BESS_OPERATION_MODES (eng.10): tryby pracy magazynu (peak shaving / FCR / aFRR / etc.)
  - TAP_CHANGERS (eng.13): przelaczniki zaczepow OLTC/DETC
  - HV_FUSES (eng.17): bezpieczniki HV/SN
  - DEVICE_WITHSTAND (eng.18): wytrzymalosc aparatury I_dyn / I_th (IEC 60909)
  - PF_CURVES (eng.9): krzywe P(f) regulacja czestotliwosci (NC RfG)
  - BLOCK_TRANSFORMERS (B.5): block-trafo dla DER (PV/BESS/FW)
  - MV_NEUTRAL_GROUNDINGS (B.1): typy uziemienia neutralnego SN

Zasada: identyczna struktura jak frontend, deterministyczne dane (frozen dataclass).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

# =============================================================================
# 1. BESS Operation Mode Catalog (eng.10)
# =============================================================================

BessModeCode = Literal[
    "peak_shaving",
    "arbitrage",
    "fcr_n",
    "fcr_d_up",
    "fcr_d_down",
    "afrr",
    "mfrr",
    "voltage_support",
    "island_backup",
    "self_consumption",
]


@dataclass(frozen=True)
class BessOperationModeItem:
    id: str
    catalog_namespace: str
    catalog_version: str
    label_pl: str
    description_pl: str
    mode_code: BessModeCode
    reserved_capacity_percent: float
    response_time_s: float
    max_duration_h: float
    required_for_nc_rfg_modules: tuple[str, ...]
    requires_four_quadrant: bool
    requires_grid_forming: bool

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "catalog_namespace": self.catalog_namespace,
            "catalog_version": self.catalog_version,
            "label_pl": self.label_pl,
            "description_pl": self.description_pl,
            "mode_code": self.mode_code,
            "reserved_capacity_percent": self.reserved_capacity_percent,
            "response_time_s": self.response_time_s,
            "max_duration_h": self.max_duration_h,
            "required_for_nc_rfg_modules": list(self.required_for_nc_rfg_modules),
            "requires_four_quadrant": self.requires_four_quadrant,
            "requires_grid_forming": self.requires_grid_forming,
        }


BESS_OPERATION_MODE_CATALOG: tuple[BessOperationModeItem, ...] = (
    BessOperationModeItem(
        id="mode_peak_shaving",
        catalog_namespace="bess_operation_mode",
        catalog_version="2024.1",
        label_pl="Peak shaving (redukcja szczytu)",
        description_pl=(
            "Wyladowanie BESS podczas szczytow obciazenia odbiorcy w celu redukcji "
            "mocy szczytowej i oplat dystrybucyjnych (taryfa BD/CD)."
        ),
        mode_code="peak_shaving",
        reserved_capacity_percent=30,
        response_time_s=60,
        max_duration_h=4,
        required_for_nc_rfg_modules=(),
        requires_four_quadrant=False,
        requires_grid_forming=False,
    ),
    BessOperationModeItem(
        id="mode_arbitrage",
        catalog_namespace="bess_operation_mode",
        catalog_version="2024.1",
        label_pl="Arbitraz cenowy (energy time-shift)",
        description_pl=(
            "Ladowanie w godzinach niskich cen, wyladowanie w godzinach drogich. "
            "Wymaga TGE / RB cennika spot."
        ),
        mode_code="arbitrage",
        reserved_capacity_percent=0,
        response_time_s=300,
        max_duration_h=8,
        required_for_nc_rfg_modules=(),
        requires_four_quadrant=False,
        requires_grid_forming=False,
    ),
    BessOperationModeItem(
        id="mode_fcr_n",
        catalog_namespace="bess_operation_mode",
        catalog_version="2024.1",
        label_pl="FCR-N (rezerwa pierwotna normalna)",
        description_pl=(
            "Symetryczna rezerwa pierwotna +/-50 mHz, droop 5%. NC RfG Art. 13. "
            "Reakcja w pelni w 30 s."
        ),
        mode_code="fcr_n",
        reserved_capacity_percent=50,
        response_time_s=30,
        max_duration_h=0.5,
        required_for_nc_rfg_modules=("C", "D"),
        requires_four_quadrant=True,
        requires_grid_forming=False,
    ),
    BessOperationModeItem(
        id="mode_fcr_d_up",
        catalog_namespace="bess_operation_mode",
        catalog_version="2024.1",
        label_pl="FCR-D (rezerwa awaryjna w gore)",
        description_pl=(
            "Rezerwa pierwotna asymetryczna w gore dla podczestotliwosciowych "
            "zaklocen (f<49.5 Hz). 50% w 5 s, 100% w 30 s."
        ),
        mode_code="fcr_d_up",
        reserved_capacity_percent=100,
        response_time_s=5,
        max_duration_h=0.25,
        required_for_nc_rfg_modules=("D",),
        requires_four_quadrant=True,
        requires_grid_forming=False,
    ),
    BessOperationModeItem(
        id="mode_afrr",
        catalog_namespace="bess_operation_mode",
        catalog_version="2024.1",
        label_pl="aFRR (rezerwa wtorna automatyczna)",
        description_pl=(
            "Rezerwa wtorna sterowana sygnalem ACE od PSE. Reakcja w 5 min, "
            "pelna w 15 min. Symetryczna +/-. NC RfG Art. 15."
        ),
        mode_code="afrr",
        reserved_capacity_percent=70,
        response_time_s=300,
        max_duration_h=1,
        required_for_nc_rfg_modules=("D",),
        requires_four_quadrant=True,
        requires_grid_forming=False,
    ),
    BessOperationModeItem(
        id="mode_mfrr",
        catalog_namespace="bess_operation_mode",
        catalog_version="2024.1",
        label_pl="mFRR (rezerwa wtorna reczna)",
        description_pl=(
            "Rezerwa reczna uruchamiana komenda dyspozytora PSE. Pelna aktywacja "
            "w 12.5 min. Czas trwania >= 4h."
        ),
        mode_code="mfrr",
        reserved_capacity_percent=100,
        response_time_s=750,
        max_duration_h=4,
        required_for_nc_rfg_modules=(),
        requires_four_quadrant=False,
        requires_grid_forming=False,
    ),
    BessOperationModeItem(
        id="mode_voltage_support",
        catalog_namespace="bess_operation_mode",
        catalog_version="2024.1",
        label_pl="Wsparcie napieciowe Q(U)",
        description_pl=(
            "Regulacja mocy biernej w funkcji napiecia (Q(U) static). NC RfG Art. 21. "
            "Wymaga 4-quadrant, regulacja +/-0.33 S_n."
        ),
        mode_code="voltage_support",
        reserved_capacity_percent=0,
        response_time_s=1,
        max_duration_h=24,
        required_for_nc_rfg_modules=("B", "C", "D"),
        requires_four_quadrant=True,
        requires_grid_forming=False,
    ),
    BessOperationModeItem(
        id="mode_island_backup",
        catalog_namespace="bess_operation_mode",
        catalog_version="2024.1",
        label_pl="Tryb wyspowy (grid-forming backup)",
        description_pl=(
            "Tworzenie napiecia po awarii zasilania. Wymaga grid-forming PCS. "
            "Synchronizacja z siecia po powrocie zasilania (synchrocheck 25)."
        ),
        mode_code="island_backup",
        reserved_capacity_percent=80,
        response_time_s=0.05,
        max_duration_h=4,
        required_for_nc_rfg_modules=(),
        requires_four_quadrant=True,
        requires_grid_forming=True,
    ),
    BessOperationModeItem(
        id="mode_self_consumption",
        catalog_namespace="bess_operation_mode",
        catalog_version="2024.1",
        label_pl="Autokonsumpcja PV+BESS (self-consumption)",
        description_pl=(
            "Maksymalizacja autokonsumpcji PV. Ladowanie nadwyzek dziennej generacji, "
            "wyladowanie wieczorne. Typowe dla DER po nN."
        ),
        mode_code="self_consumption",
        reserved_capacity_percent=0,
        response_time_s=30,
        max_duration_h=8,
        required_for_nc_rfg_modules=(),
        requires_four_quadrant=False,
        requires_grid_forming=False,
    ),
)


def get_bess_operation_mode(mode_id: str) -> BessOperationModeItem | None:
    return next((m for m in BESS_OPERATION_MODE_CATALOG if m.id == mode_id), None)


# =============================================================================
# 2. Tap Changer Catalog (eng.13)
# =============================================================================


@dataclass(frozen=True)
class TapChangerItem:
    id: str
    catalog_namespace: str
    catalog_version: str
    label_pl: str
    type: Literal["oltc", "detc"]
    neutral_position: int
    tap_count: int
    step_percent: float
    range_percent: float
    regulated_side: Literal["hv", "lv"]
    switching_time_s: float
    operations_before_maintenance_thousand: int
    supports_avr: bool
    applicable_to: tuple[str, ...]

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "catalog_namespace": self.catalog_namespace,
            "catalog_version": self.catalog_version,
            "label_pl": self.label_pl,
            "type": self.type,
            "neutral_position": self.neutral_position,
            "tap_count": self.tap_count,
            "step_percent": self.step_percent,
            "range_percent": self.range_percent,
            "regulated_side": self.regulated_side,
            "switching_time_s": self.switching_time_s,
            "operations_before_maintenance_thousand": self.operations_before_maintenance_thousand,
            "supports_avr": self.supports_avr,
            "applicable_to": list(self.applicable_to),
        }


TAP_CHANGER_CATALOG: tuple[TapChangerItem, ...] = (
    TapChangerItem(
        id="tc_oltc_110sn_19_125",
        catalog_namespace="tap_changer",
        catalog_version="2024.1",
        label_pl="OLTC 110/SN * 19 zaczepow * +/-11.25% * AVR",
        type="oltc",
        neutral_position=0,
        tap_count=19,
        step_percent=1.25,
        range_percent=11.25,
        regulated_side="hv",
        switching_time_s=5,
        operations_before_maintenance_thousand=100,
        supports_avr=True,
        applicable_to=("transformer_110_15", "transformer_110_20"),
    ),
    TapChangerItem(
        id="tc_oltc_110sn_17_125",
        catalog_namespace="tap_changer",
        catalog_version="2024.1",
        label_pl="OLTC 110/SN * 17 zaczepow * +/-10% * AVR",
        type="oltc",
        neutral_position=0,
        tap_count=17,
        step_percent=1.25,
        range_percent=10.0,
        regulated_side="hv",
        switching_time_s=4,
        operations_before_maintenance_thousand=80,
        supports_avr=True,
        applicable_to=("transformer_110_15", "transformer_110_20"),
    ),
    TapChangerItem(
        id="tc_detc_snnn_5_25",
        catalog_namespace="tap_changer",
        catalog_version="2024.1",
        label_pl="DETC SN/nN * 5 zaczepow * +/-5% (off-load)",
        type="detc",
        neutral_position=0,
        tap_count=5,
        step_percent=2.5,
        range_percent=5.0,
        regulated_side="hv",
        switching_time_s=0,
        operations_before_maintenance_thousand=1,
        supports_avr=False,
        applicable_to=("transformer_15_04", "block_transformer"),
    ),
    TapChangerItem(
        id="tc_oltc_snnn_9_15",
        catalog_namespace="tap_changer",
        catalog_version="2024.1",
        label_pl="OLTC SN/nN * 9 zaczepow * +/-6% * AVR (przemyslowe)",
        type="oltc",
        neutral_position=0,
        tap_count=9,
        step_percent=1.5,
        range_percent=6.0,
        regulated_side="hv",
        switching_time_s=3,
        operations_before_maintenance_thousand=50,
        supports_avr=True,
        applicable_to=("transformer_15_04", "block_transformer"),
    ),
)


def get_tap_changer(tc_id: str) -> TapChangerItem | None:
    return next((tc for tc in TAP_CHANGER_CATALOG if tc.id == tc_id), None)


def tap_changer_fields_from_catalog(
    item: TapChangerItem, *, current_position: int | None = None
) -> dict:
    """Materialize canonical TapChanger fields from a catalog type (V12K-045).

    Returns a plain dict compatible with both the ENM and domain ``TapChanger``
    constructors (reuse, no duplication). Positions are symmetric around the
    neutral position: ``+/-(tap_count - 1) // 2`` steps.

    Returns a pure dict (no import of the model layer) to avoid an import cycle.
    """
    half_span = (item.tap_count - 1) // 2
    neutral = item.neutral_position
    is_oltc = item.type == "oltc"
    return {
        "regulation_type": "OLTC" if is_oltc else "DETC",
        "regulated_winding": "HV" if item.regulated_side == "hv" else "LV",
        "neutral_position": neutral,
        "current_position": neutral if current_position is None else current_position,
        "min_position": neutral - half_span,
        "max_position": neutral + half_span,
        "step_percent": item.step_percent,
        "control_mode": "AUTOMATIC" if (is_oltc and item.supports_avr) else "MANUAL",
        "catalog_ref": item.id,
    }


# =============================================================================
# 3. HV Fuse Catalog (eng.17)
# =============================================================================


@dataclass(frozen=True)
class HvFuseItem:
    id: str
    catalog_namespace: str
    catalog_version: str
    label_pl: str
    manufacturer: str
    nominal_voltage_kv: float
    nominal_current_a: float
    fuse_class: Literal["general_purpose", "full_range", "back_up"]
    i_min_breaking_a: float
    i_max_breaking_ka: float
    i2t_total_a2s: float
    pre_arcing_time_at_6in_ms: float
    total_clearing_time_at_6in_ms: float
    application: Literal["transformer", "feeder", "motor", "capacitor"]

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "catalog_namespace": self.catalog_namespace,
            "catalog_version": self.catalog_version,
            "label_pl": self.label_pl,
            "manufacturer": self.manufacturer,
            "nominal_voltage_kv": self.nominal_voltage_kv,
            "nominal_current_a": self.nominal_current_a,
            "class": self.fuse_class,
            "i_min_breaking_a": self.i_min_breaking_a,
            "i_max_breaking_ka": self.i_max_breaking_ka,
            "i2t_total_a2s": self.i2t_total_a2s,
            "pre_arcing_time_at_6in_ms": self.pre_arcing_time_at_6in_ms,
            "total_clearing_time_at_6in_ms": self.total_clearing_time_at_6in_ms,
            "application": self.application,
        }


HV_FUSE_CATALOG: tuple[HvFuseItem, ...] = (
    HvFuseItem(
        id="fuse_15kv_50a_full",
        catalog_namespace="hv_fuse",
        catalog_version="2024.1",
        label_pl="Bezpiecznik SN 15 kV / 50 A * full-range * TRAFO 630 kVA",
        manufacturer="ABB",
        nominal_voltage_kv=15,
        nominal_current_a=50,
        fuse_class="full_range",
        i_min_breaking_a=200,
        i_max_breaking_ka=50,
        i2t_total_a2s=14000,
        pre_arcing_time_at_6in_ms=30,
        total_clearing_time_at_6in_ms=50,
        application="transformer",
    ),
    HvFuseItem(
        id="fuse_15kv_100a_full",
        catalog_namespace="hv_fuse",
        catalog_version="2024.1",
        label_pl="Bezpiecznik SN 15 kV / 100 A * full-range * TRAFO 1250 kVA",
        manufacturer="Siemens",
        nominal_voltage_kv=15,
        nominal_current_a=100,
        fuse_class="full_range",
        i_min_breaking_a=400,
        i_max_breaking_ka=50,
        i2t_total_a2s=56000,
        pre_arcing_time_at_6in_ms=25,
        total_clearing_time_at_6in_ms=45,
        application="transformer",
    ),
    HvFuseItem(
        id="fuse_20kv_25a_gp",
        catalog_namespace="hv_fuse",
        catalog_version="2024.1",
        label_pl="Bezpiecznik SN 20 kV / 25 A * general-purpose * pole odplywowe",
        manufacturer="Schneider",
        nominal_voltage_kv=20,
        nominal_current_a=25,
        fuse_class="general_purpose",
        i_min_breaking_a=75,
        i_max_breaking_ka=25,
        i2t_total_a2s=3500,
        pre_arcing_time_at_6in_ms=35,
        total_clearing_time_at_6in_ms=60,
        application="feeder",
    ),
    HvFuseItem(
        id="fuse_15kv_160a_backup",
        catalog_namespace="hv_fuse",
        catalog_version="2024.1",
        label_pl="Bezpiecznik SN 15 kV / 160 A * back-up (kondensator)",
        manufacturer="ABB",
        nominal_voltage_kv=15,
        nominal_current_a=160,
        fuse_class="back_up",
        i_min_breaking_a=1000,
        i_max_breaking_ka=50,
        i2t_total_a2s=145000,
        pre_arcing_time_at_6in_ms=20,
        total_clearing_time_at_6in_ms=40,
        application="capacitor",
    ),
)


def get_hv_fuse(fuse_id: str) -> HvFuseItem | None:
    return next((f for f in HV_FUSE_CATALOG if f.id == fuse_id), None)


# =============================================================================
# 4. Device Withstand Catalog (eng.18)
# =============================================================================


@dataclass(frozen=True)
class DeviceWithstandItem:
    id: str
    catalog_namespace: str
    catalog_version: str
    label_pl: str
    device_type: str
    nominal_voltage_kv: float
    nominal_current_a: float
    i_dyn_ka: float
    i_th_1s_ka: float
    i_th_duration_s: float

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "catalog_namespace": self.catalog_namespace,
            "catalog_version": self.catalog_version,
            "label_pl": self.label_pl,
            "device_type": self.device_type,
            "nominal_voltage_kv": self.nominal_voltage_kv,
            "nominal_current_a": self.nominal_current_a,
            "i_dyn_ka": self.i_dyn_ka,
            "i_th_1s_ka": self.i_th_1s_ka,
            "i_th_duration_s": self.i_th_duration_s,
        }


DEVICE_WITHSTAND_CATALOG: tuple[DeviceWithstandItem, ...] = (
    DeviceWithstandItem(
        id="wstd_breaker_vacuum_15_25",
        catalog_namespace="device_withstand",
        catalog_version="2024.1",
        label_pl="Wyłącznik próżniowy 15 kV · I_dyn=63 kA · I_th=25 kA/1s",
        device_type="breaker_vacuum_15",
        nominal_voltage_kv=15,
        nominal_current_a=1250,
        i_dyn_ka=63,
        i_th_1s_ka=25,
        i_th_duration_s=1,
    ),
    DeviceWithstandItem(
        id="wstd_breaker_sf6_15_31_5",
        catalog_namespace="device_withstand",
        catalog_version="2024.1",
        label_pl="Wyłącznik SF6 15 kV · I_dyn=80 kA · I_th=31,5 kA/3s",
        device_type="breaker_sf6_15",
        nominal_voltage_kv=15,
        nominal_current_a=1250,
        i_dyn_ka=80,
        i_th_1s_ka=31.5,
        i_th_duration_s=3,
    ),
    DeviceWithstandItem(
        id="wstd_busbar_15_2000_50",
        catalog_namespace="device_withstand",
        catalog_version="2024.1",
        label_pl="Szyna SN 15 kV · 2000 A · I_dyn=125 kA · I_th=50 kA/1s",
        device_type="busbar_15_2000",
        nominal_voltage_kv=15,
        nominal_current_a=2000,
        i_dyn_ka=125,
        i_th_1s_ka=50,
        i_th_duration_s=1,
    ),
    DeviceWithstandItem(
        id="wstd_busbar_15_1250_25",
        catalog_namespace="device_withstand",
        catalog_version="2024.1",
        label_pl="Szyna SN 15 kV · 1250 A · I_dyn=63 kA · I_th=25 kA/1s",
        device_type="busbar_15_1250",
        nominal_voltage_kv=15,
        nominal_current_a=1250,
        i_dyn_ka=63,
        i_th_1s_ka=25,
        i_th_duration_s=1,
    ),
    DeviceWithstandItem(
        id="wstd_switch_load_15_25",
        catalog_namespace="device_withstand",
        catalog_version="2024.1",
        label_pl="Rozłącznik z bezpiecznikami 15 kV · I_dyn=63 kA · I_th=25 kA/1s",
        device_type="switch_load_15",
        nominal_voltage_kv=15,
        nominal_current_a=630,
        i_dyn_ka=63,
        i_th_1s_ka=25,
        i_th_duration_s=1,
    ),
)


def get_device_withstand(device_id: str) -> DeviceWithstandItem | None:
    return next((d for d in DEVICE_WITHSTAND_CATALOG if d.id == device_id), None)


# =============================================================================
# 5. PF Curve Catalog (eng.9)
# =============================================================================


@dataclass(frozen=True)
class PfCurveItem:
    id: str
    catalog_namespace: str
    catalog_version: str
    label_pl: str
    operator_code: Literal["PSE", "Energa", "Tauron", "Enea", "PGE"]
    module_type: Literal["A", "B", "C", "D"]
    f_ref_hz: float
    droop_percent: float
    f_min_hz: float
    f_max_hz: float
    deadband_hz: float
    source: Literal["NC_RfG_Annex_II", "IRiESD"]

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "catalog_namespace": self.catalog_namespace,
            "catalog_version": self.catalog_version,
            "label_pl": self.label_pl,
            "operator_code": self.operator_code,
            "module_type": self.module_type,
            "f_ref_hz": self.f_ref_hz,
            "droop_percent": self.droop_percent,
            "f_min_hz": self.f_min_hz,
            "f_max_hz": self.f_max_hz,
            "deadband_hz": self.deadband_hz,
            "source": self.source,
        }


PF_CURVE_CATALOG: tuple[PfCurveItem, ...] = (
    PfCurveItem(
        id="pf_pse_b",
        catalog_namespace="p_f_curve",
        catalog_version="2024.1",
        label_pl="P(f) * PSE NC RfG, modul B (droop 5%)",
        operator_code="PSE",
        module_type="B",
        f_ref_hz=50.0,
        droop_percent=5.0,
        f_min_hz=47.5,
        f_max_hz=51.5,
        deadband_hz=0.2,
        source="NC_RfG_Annex_II",
    ),
    PfCurveItem(
        id="pf_pse_c",
        catalog_namespace="p_f_curve",
        catalog_version="2024.1",
        label_pl="P(f) * PSE NC RfG, modul C (droop 4%)",
        operator_code="PSE",
        module_type="C",
        f_ref_hz=50.0,
        droop_percent=4.0,
        f_min_hz=47.5,
        f_max_hz=51.5,
        deadband_hz=0.15,
        source="NC_RfG_Annex_II",
    ),
    PfCurveItem(
        id="pf_pse_d",
        catalog_namespace="p_f_curve",
        catalog_version="2024.1",
        label_pl="P(f) * PSE NC RfG, modul D (droop 3%, FCR-N capable)",
        operator_code="PSE",
        module_type="D",
        f_ref_hz=50.0,
        droop_percent=3.0,
        f_min_hz=47.5,
        f_max_hz=51.5,
        deadband_hz=0.10,
        source="NC_RfG_Annex_II",
    ),
    PfCurveItem(
        id="pf_energa_b",
        catalog_namespace="p_f_curve",
        catalog_version="2024.1",
        label_pl="P(f) * Energa-Operator, modul B",
        operator_code="Energa",
        module_type="B",
        f_ref_hz=50.0,
        droop_percent=5.0,
        f_min_hz=47.5,
        f_max_hz=51.5,
        deadband_hz=0.20,
        source="IRiESD",
    ),
    PfCurveItem(
        id="pf_tauron_b",
        catalog_namespace="p_f_curve",
        catalog_version="2024.1",
        label_pl="P(f) * Tauron Dystrybucja, modul B",
        operator_code="Tauron",
        module_type="B",
        f_ref_hz=50.0,
        droop_percent=5.0,
        f_min_hz=47.5,
        f_max_hz=51.5,
        deadband_hz=0.20,
        source="IRiESD",
    ),
)


def get_pf_curve(curve_id: str) -> PfCurveItem | None:
    return next((c for c in PF_CURVE_CATALOG if c.id == curve_id), None)


# =============================================================================
# 6. Block Transformer Catalog (B.5)
# =============================================================================


@dataclass(frozen=True)
class BlockTransformerItem:
    id: str
    catalog_namespace: str
    catalog_version: str
    label_pl: str
    manufacturer: str
    sn_kva: float
    hv_kv: float
    lv_kv: float
    uk_percent: float
    pk_kw: float
    p0_kw: float
    i0_percent: float
    vector_group: str
    is_mv_to_mv: bool
    applicable_der_kinds: tuple[str, ...]
    galvanic_isolation: bool

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "catalog_namespace": self.catalog_namespace,
            "catalog_version": self.catalog_version,
            "label_pl": self.label_pl,
            "manufacturer": self.manufacturer,
            "sn_kva": self.sn_kva,
            "hv_kv": self.hv_kv,
            "lv_kv": self.lv_kv,
            "uk_percent": self.uk_percent,
            "pk_kw": self.pk_kw,
            "p0_kw": self.p0_kw,
            "i0_percent": self.i0_percent,
            "vector_group": self.vector_group,
            "is_mv_to_mv": self.is_mv_to_mv,
            "applicable_der_kinds": list(self.applicable_der_kinds),
            "galvanic_isolation": self.galvanic_isolation,
        }


BLOCK_TRANSFORMER_CATALOG: tuple[BlockTransformerItem, ...] = (
    BlockTransformerItem(
        id="btr_pv_15_069_800",
        catalog_namespace="block_transformer",
        catalog_version="2024.1",
        label_pl="PV transformator dedykowany 15/0,69 kV * 800 kVA * Dyn5",
        manufacturer="ABB",
        sn_kva=800,
        hv_kv=15,
        lv_kv=0.69,
        uk_percent=6.0,
        pk_kw=8.8,
        p0_kw=1.5,
        i0_percent=0.5,
        vector_group="Dyn5",
        is_mv_to_mv=False,
        applicable_der_kinds=("PV", "BESS"),
        galvanic_isolation=True,
    ),
    BlockTransformerItem(
        id="btr_pv_15_069_1000",
        catalog_namespace="block_transformer",
        catalog_version="2024.1",
        label_pl="PV transformator dedykowany 15/0,69 kV * 1000 kVA * Dyn5",
        manufacturer="ABB",
        sn_kva=1000,
        hv_kv=15,
        lv_kv=0.69,
        uk_percent=6.0,
        pk_kw=10.6,
        p0_kw=1.8,
        i0_percent=0.45,
        vector_group="Dyn5",
        is_mv_to_mv=False,
        applicable_der_kinds=("PV", "BESS"),
        galvanic_isolation=True,
    ),
    BlockTransformerItem(
        id="btr_pv_15_069_1250",
        catalog_namespace="block_transformer",
        catalog_version="2024.1",
        label_pl="PV transformator dedykowany 15/0,69 kV * 1250 kVA * Dyn5",
        manufacturer="ABB",
        sn_kva=1250,
        hv_kv=15,
        lv_kv=0.69,
        uk_percent=6.0,
        pk_kw=13.2,
        p0_kw=2.1,
        i0_percent=0.45,
        vector_group="Dyn5",
        is_mv_to_mv=False,
        applicable_der_kinds=("PV", "BESS"),
        galvanic_isolation=True,
    ),
    BlockTransformerItem(
        id="btr_pv_15_069_1600",
        catalog_namespace="block_transformer",
        catalog_version="2024.1",
        label_pl="PV transformator dedykowany 15/0,69 kV * 1600 kVA * Dyn5",
        manufacturer="ABB",
        sn_kva=1600,
        hv_kv=15,
        lv_kv=0.69,
        uk_percent=6.0,
        pk_kw=16.8,
        p0_kw=2.6,
        i0_percent=0.4,
        vector_group="Dyn5",
        is_mv_to_mv=False,
        applicable_der_kinds=("PV", "BESS"),
        galvanic_isolation=True,
    ),
    BlockTransformerItem(
        id="btr_pv_15_069_2500",
        catalog_namespace="block_transformer",
        catalog_version="2024.1",
        label_pl="PV block-trafo 15/0,69 kV * 2500 kVA * Dyn5",
        manufacturer="ABB",
        sn_kva=2500,
        hv_kv=15,
        lv_kv=0.69,
        uk_percent=6.0,
        pk_kw=24.0,
        p0_kw=3.5,
        i0_percent=0.4,
        vector_group="Dyn5",
        is_mv_to_mv=False,
        applicable_der_kinds=("PV", "BESS"),
        galvanic_isolation=True,
    ),
    BlockTransformerItem(
        id="btr_pv_15_04_1000",
        catalog_namespace="block_transformer",
        catalog_version="2024.1",
        label_pl="PV block-trafo 15/0,4 kV * 1000 kVA * Dyn11",
        manufacturer="Siemens",
        sn_kva=1000,
        hv_kv=15,
        lv_kv=0.4,
        uk_percent=6.0,
        pk_kw=11.0,
        p0_kw=1.6,
        i0_percent=0.6,
        vector_group="Dyn11",
        is_mv_to_mv=False,
        applicable_der_kinds=("PV", "BESS"),
        galvanic_isolation=True,
    ),
    BlockTransformerItem(
        id="btr_bess_15_04_1600",
        catalog_namespace="block_transformer",
        catalog_version="2024.1",
        label_pl="BESS block-trafo 15/0,4 kV * 1600 kVA * Dyn11 (galwaniczna izolacja)",
        manufacturer="Schneider",
        sn_kva=1600,
        hv_kv=15,
        lv_kv=0.4,
        uk_percent=6.5,
        pk_kw=16.5,
        p0_kw=2.4,
        i0_percent=0.5,
        vector_group="Dyn11",
        is_mv_to_mv=False,
        applicable_der_kinds=("BESS",),
        galvanic_isolation=True,
    ),
    BlockTransformerItem(
        id="btr_fw_30_15_30000",
        catalog_namespace="block_transformer",
        catalog_version="2024.1",
        label_pl="FW block-trafo 30/15 kV * 30 MVA * YNyn0 (turbinownia, SN/SN)",
        manufacturer="ABB",
        sn_kva=30000,
        hv_kv=30,
        lv_kv=15,
        uk_percent=12.5,
        pk_kw=220.0,
        p0_kw=24.0,
        i0_percent=0.3,
        vector_group="YNyn0",
        is_mv_to_mv=True,
        applicable_der_kinds=("FW",),
        galvanic_isolation=False,
    ),
    BlockTransformerItem(
        id="btr_fw_15_069_3450",
        catalog_namespace="block_transformer",
        catalog_version="2024.1",
        label_pl="FW block-trafo turbinowy 15/0,69 kV * 3450 kVA * Dyn11",
        manufacturer="Siemens",
        sn_kva=3450,
        hv_kv=15,
        lv_kv=0.69,
        uk_percent=6.0,
        pk_kw=33.0,
        p0_kw=4.8,
        i0_percent=0.35,
        vector_group="Dyn11",
        is_mv_to_mv=False,
        applicable_der_kinds=("FW",),
        galvanic_isolation=True,
    ),
)


def get_block_transformer(btr_id: str) -> BlockTransformerItem | None:
    return next((b for b in BLOCK_TRANSFORMER_CATALOG if b.id == btr_id), None)


# =============================================================================
# 7. MV Neutral Grounding Catalog (B.1)
# =============================================================================


GroundingType = Literal["isolated", "petersen_coil", "resistor_grounded", "directly_grounded"]


@dataclass(frozen=True)
class MvNeutralGroundingItem:
    id: str
    catalog_namespace: str
    catalog_version: str
    grounding_type: GroundingType
    label_pl: str
    description_pl: str
    typical_ik1_a_min: float
    typical_ik1_a_max: float
    typical_operators_pl: str
    r_ohm: float | None = None
    x_ohm: float | None = None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "catalog_namespace": self.catalog_namespace,
            "catalog_version": self.catalog_version,
            "grounding_type": self.grounding_type,
            "label_pl": self.label_pl,
            "description_pl": self.description_pl,
            "typical_ik1_a_range": {
                "min": self.typical_ik1_a_min,
                "max": self.typical_ik1_a_max,
            },
            "typical_operators_pl": self.typical_operators_pl,
            "r_ohm": self.r_ohm,
            "x_ohm": self.x_ohm,
        }


MV_NEUTRAL_GROUNDING_CATALOG: tuple[MvNeutralGroundingItem, ...] = (
    MvNeutralGroundingItem(
        id="mng_isolated",
        catalog_namespace="mv_neutral_grounding",
        catalog_version="2024.1",
        grounding_type="isolated",
        label_pl="Siec izolowana (bez uziemienia neutralnego)",
        description_pl=(
            "Punkt neutralny niepolaczony z ziemia. Ik1 ograniczone do pojemnosciowego "
            "pradu sieci (1-30 A). Wymaga 67N kierunkowego."
        ),
        typical_ik1_a_min=1,
        typical_ik1_a_max=30,
        typical_operators_pl="Sieci wiejskie (Tauron, PGE)",
    ),
    MvNeutralGroundingItem(
        id="mng_petersen",
        catalog_namespace="mv_neutral_grounding",
        catalog_version="2024.1",
        grounding_type="petersen_coil",
        label_pl="Siec skompensowana (cewka Petersena PCK)",
        description_pl=(
            "Punkt neutralny uziemiony przez dlawik kompensacyjny. Lp = 1 / (3w*C0). "
            "W stanie kompensacji Ik1 ~ 0. Standard nowoczesny."
        ),
        typical_ik1_a_min=1,
        typical_ik1_a_max=20,
        typical_operators_pl="Energa-Operator, Tauron, Enea, PGE (sieci miejskie)",
    ),
    MvNeutralGroundingItem(
        id="mng_resistor_low",
        catalog_namespace="mv_neutral_grounding",
        catalog_version="2024.1",
        grounding_type="resistor_grounded",
        label_pl="Siec uziemiona przez rezystor * niski (R~7 Ohm, Ik1~300 A)",
        description_pl=(
            "Punkt neutralny uziemiony przez rezystor 7 Ohm. Ogranicza Ik1 do ~300 A. "
            "Stosowane w sieciach kablowych miejskich."
        ),
        typical_ik1_a_min=250,
        typical_ik1_a_max=350,
        typical_operators_pl="Energa-Operator (sieci kablowe miejskie), Innogy",
        r_ohm=7,
    ),
    MvNeutralGroundingItem(
        id="mng_resistor_medium",
        catalog_namespace="mv_neutral_grounding",
        catalog_version="2024.1",
        grounding_type="resistor_grounded",
        label_pl="Siec uziemiona przez rezystor * sredni (R~40 Ohm, Ik1~100 A)",
        description_pl=(
            "Punkt neutralny uziemiony przez rezystor ~40 Ohm. Ogranicza Ik1 do ~100 A. "
            "Stosowane w sieciach mieszanych."
        ),
        typical_ik1_a_min=80,
        typical_ik1_a_max=120,
        typical_operators_pl="Tauron (sieci mieszane)",
        r_ohm=40,
    ),
    MvNeutralGroundingItem(
        id="mng_directly",
        catalog_namespace="mv_neutral_grounding",
        catalog_version="2024.1",
        grounding_type="directly_grounded",
        label_pl="Siec uziemiona bezposrednio (Z=0)",
        description_pl=(
            "Punkt neutralny polaczony bezposrednio z ziemia. Wysoki Ik1 (>1000 A) -> "
            "szybkie zabezpieczenia 50N/51N. Standard dla 110+ kV (HV)."
        ),
        typical_ik1_a_min=1000,
        typical_ik1_a_max=20000,
        typical_operators_pl="PSE (110+ kV), niektorzy operatorzy industrialni",
    ),
)


def get_mv_neutral_grounding(grounding_id: str) -> MvNeutralGroundingItem | None:
    return next((g for g in MV_NEUTRAL_GROUNDING_CATALOG if g.id == grounding_id), None)


# =============================================================================
# Helpers — selektory uzywane przez solver_input + proof_engine
# =============================================================================


def select_bess_modes_for_pcs(
    *, four_quadrant: bool, grid_forming_capable: bool
) -> tuple[BessOperationModeItem, ...]:
    """Naprawa eng.10: filtr trybow BESS dostepnych dla danego PCS."""
    return tuple(
        m
        for m in BESS_OPERATION_MODE_CATALOG
        if (not m.requires_four_quadrant or four_quadrant)
        and (not m.requires_grid_forming or grid_forming_capable)
    )


def select_required_bess_modes_for_module(
    module: Literal["A", "B", "C", "D"],
) -> tuple[BessOperationModeItem, ...]:
    return tuple(m for m in BESS_OPERATION_MODE_CATALOG if module in m.required_for_nc_rfg_modules)


def select_block_transformers_for_der(
    *, der_kind: Literal["PV", "BESS", "FW"], hv_kv: float | None = None, lv_kv: float | None = None
) -> tuple[BlockTransformerItem, ...]:
    """Naprawa B.5: filtruje block-trafo dla kombinacji DER + napiec."""
    result: list[BlockTransformerItem] = []
    for btr in BLOCK_TRANSFORMER_CATALOG:
        if der_kind not in btr.applicable_der_kinds:
            continue
        if hv_kv is not None and abs(btr.hv_kv - hv_kv) > 0.5:
            continue
        if lv_kv is not None and abs(btr.lv_kv - lv_kv) > 0.05:
            continue
        result.append(btr)
    return tuple(result)


def is_vt_voltage_factor_valid_for_grounding(
    voltage_factor: float, grounding_type: GroundingType
) -> tuple[bool, str]:
    """Walidacja F_v przekladnika napieciowego wobec uziemienia sieci (IEC 61869-3 tab. 2).

    JEDNA REGULA, NIE DWIE (V12K-256). Ta funkcja miala wlasna, LAGODNIEJSZA wersje
    wymagan: dopuszczala 1,5 w sieci uziemionej przez rezystor i 1,2 w bezposrednio
    uziemionej. Siec uziemiona przez rezystor NIE jest siecia skutecznie uziemiona —
    przy zwarciu doziemnym napiecie faz zdrowych rosnie praktycznie do miedzyfazowego,
    wiec wymaganie 1,5 bylo zanizone; a 1,2 (ciagle) dotyczy przekladnika pracujacego
    MIEDZY FAZAMI, nie faza-ziemia. Rozjazd byl grozny, bo ta funkcja zasila PAKIET
    DOWODOWY — nizsze wymaganie trafialoby do dokumentu jako werdykt zgodnosci.

    ZALOZENIE JAWNE: pytanie „czy F_v pasuje do uziemienia" ma sens WYLACZNIE dla
    uzwojenia pierwotnego pracujacego miedzy faza a ziemia (miedzyfazowe nie widzi
    wzrostu napiecia przy doziemieniu), dlatego regula jest wolana z tym ukladem.
    """
    from domain.dobor_przekladnika import wymagany_wspolczynnik_napieciowy

    tryb = {
        "isolated": "izolowany",
        "petersen_coil": "cewka_petersena",
        "resistor_grounded": "rezystor",
        "directly_grounded": "bezposrednio_uziemiony",
    }.get(grounding_type)
    wymagany = wymagany_wspolczynnik_napieciowy(tryb, "faza_ziemia")
    if wymagany is None:
        return False, f"Nieznany typ uziemienia: {grounding_type}"
    if voltage_factor < wymagany:
        etykieta = {
            "isolated": "izolowana",
            "petersen_coil": "skompensowana (Petersena)",
            "resistor_grounded": "uziemiona przez rezystor",
            "directly_grounded": "bezposrednio uziemiona",
        }[grounding_type]
        return False, (
            f"Siec {etykieta} wymaga VT (faza-ziemia) z U_th >= {wymagany} wg IEC 61869-3. "
            f"Wybrany VT ma U_th = {voltage_factor}."
        )
    return True, ""


def validate_device_withstand(
    *,
    device_id: str,
    i_peak_calculated_ka: float,
    i_thermal_calculated_ka: float,
    t_clearing_s: float,
) -> dict:
    """Naprawa eng.18: walidacja I_dyn / I_th aparatury (IEC 60909).

    JEDYNE ZRODLO WERDYKTU (K7-B, 2026-07-31). Do tej karty rownolegly rachunek
    zyl w warstwie prezentacji (`frontend/src/ui/network-build/station-der/
    protection-catalogs.ts::validateDeviceWithstand` + wlasna kopia katalogu
    `DEVICE_WITHSTAND_CATALOG`) i to ON zasilal karte zabezpieczen. Ekran mowil
    „wytrzymala" na podstawie liczb, ktorych zaden solver nie widzial i ktorych
    nie obejmowal zaden slad. Karta zabezpieczen wola teraz to wyliczenie przez
    `POST /api/v1/catalog/audit2/validate-device-withstand`, a `message_pl` jest
    tekstem POKAZYWANYM UZYTKOWNIKOWI — stad pelna polszczyzna z diakrytykami.
    """
    import math

    device = get_device_withstand(device_id)
    if device is None:
        return {
            "ok": False,
            "i_dyn_ok": False,
            "i_th_ok": False,
            "message_pl": f"Brak aparatury w katalogu (id={device_id}).",
            "utilization_dyn_percent": 0,
            "utilization_th_percent": 0,
        }
    # I_th_eff = I_th_rated * sqrt(t_rated / t_clearing).
    i_th_effective = device.i_th_1s_ka * math.sqrt(device.i_th_duration_s / max(t_clearing_s, 0.01))
    i_dyn_ok = device.i_dyn_ka >= i_peak_calculated_ka
    i_th_ok = i_th_effective >= i_thermal_calculated_ka
    util_dyn = (i_peak_calculated_ka / device.i_dyn_ka) * 100
    util_th = (i_thermal_calculated_ka / i_th_effective) * 100
    if i_dyn_ok and i_th_ok:
        message = (
            f"OK: aparatura „{device.label_pl}” wytrzymała "
            f"(wykorzystanie I_dyn {util_dyn:.0f}%, I_th {util_th:.0f}%)."
        )
    else:
        failures: list[str] = []
        if not i_dyn_ok:
            failures.append(
                f"I_dyn {i_peak_calculated_ka:.1f} kA > {device.i_dyn_ka:.1f} kA (limit) — "
                "przekroczenie wytrzymałości dynamicznej"
            )
        if not i_th_ok:
            failures.append(
                f"I_th {i_thermal_calculated_ka:.1f} kA > {i_th_effective:.1f} kA "
                f"(limit przy t={t_clearing_s:.2f} s) — przekroczenie wytrzymałości cieplnej"
            )
        message = f"BLOKER: {'; '.join(failures)}."
    return {
        "ok": i_dyn_ok and i_th_ok,
        "i_dyn_ok": i_dyn_ok,
        "i_th_ok": i_th_ok,
        "message_pl": message,
        "utilization_dyn_percent": util_dyn,
        "utilization_th_percent": util_th,
    }


# =============================================================================
# Lookup VT -> wspolczynnik napieciowy — USUNIETY (V12K-258)
# =============================================================================
#
# `VT_CATALOG_FOR_FACTOR` byl CZWARTA kopia danych o przekladnikach napieciowych:
# odwzorowywal cztery SYNTETYCZNE identyfikatory z rownoleglego katalogu frontu
# (usunietego w V12K-257) na wspolczynnik napieciowy. Wolajacy dopelnial go wartoscia
# domyslna 1,9 dla kazdego nieznanego typu — czyli brak danej stawal sie liczba, na
# ktorej PAKIET DOWODOWY oglaszal zgodnosc.
#
# Zrodlem tej danej jest teraz katalog VT (`VTType.rated_voltage_factor`, V12K-255);
# brak typu albo brak danej w karcie daje `None`, a generator dowodu zamienia to
# w dowod NIEZALICZONY z nazwanym powodem.


def estimate_der_power_kw(
    *, der_kind: str, block_transformer_catalog_ref: str | None = None
) -> float:
    """
    Estymuje moc DER na podstawie block-trafo (gdy dedicated_transformer)
    lub typowych wartosci dla der_kind.

    Phase 15: zastepuje hardcoded 1MW placeholder.

    Logika:
    1. Jesli block_transformer wskazany, uzywamy sn_kva (deterministic, real catalog).
    2. W przeciwnym wypadku typowe wartosci per kind (PV: 500 kW, BESS: 1000, FW: 2300).

    Te typowe wartosci bazuja na medianie z PV_INVERTER_CATALOG / BESS_PCS_CATALOG /
    WIND_TURBINE_CATALOG (frontendowe staticki). Brak mozliwosci znania konkretnego
    device_catalog z poziomu audit2 (DER specs nie ma device_ref) — uzywamy median.
    """
    if block_transformer_catalog_ref:
        btr = get_block_transformer(block_transformer_catalog_ref)
        if btr is not None:
            return float(btr.sn_kva)
    # Median per kind based on typowe katalogowe wartosci.
    if der_kind == "PV":
        return 500.0
    if der_kind == "BESS":
        return 1000.0
    if der_kind == "FW":
        return 2300.0
    return 0.0


def validate_hosting_capacity_export(
    *, station_id: str, p_export_kw: float, p_import_kw: float
) -> dict:
    """Naprawa eng.15: walidacja kierunku przeplywu mocy w stacji."""
    net = p_export_kw - p_import_kw
    ratio = (p_export_kw / p_import_kw) if p_import_kw > 0 else float("inf")

    if net < 0 or ratio < 0.8:
        status = "no_export"
        message = (
            f"Lokalna autokonsumpcja: {p_export_kw:.0f} kW DER vs {p_import_kw:.0f} kW odbiorow. "
            "Brak eksportu netto do OSD."
        )
    elif ratio <= 1.5:
        status = "normal_export"
        message = (
            f"Eksport normalny: {net:.0f} kW eksportowanych do OSD "
            f"(stosunek {ratio:.2f}x w granicach standardowej hosting capacity)."
        )
    elif ratio <= 3.0:
        status = "high_export_warning"
        message = (
            f"Wysoki eksport: {net:.0f} kW (stosunek {ratio:.2f}x). "
            "Zalecane curtailment 70% w godzinach poludniowych."
        )
    else:
        status = "requires_ramp_down"
        message = (
            f"Krytyczny eksport: {net:.0f} kW (stosunek {ratio:.2f}x). "
            "WYMAGANE: studium NC RfG ramp-down + curtailment + uzgodnienie z OSD."
        )
    return {
        "station_id": station_id,
        "p_export_kw": p_export_kw,
        "p_import_kw": p_import_kw,
        "p_net_export_kw": net,
        "export_to_import_ratio": ratio,
        "status": status,
        "message_pl": message,
    }


# =============================================================================
# Aggregator (uzywany przez solver_input + proof_engine + report)
# =============================================================================


@dataclass(frozen=True)
class Audit2CatalogSnapshot:
    """Snapshot wszystkich katalogow audytu 2 — uzywany przez solvery i raporty."""

    bess_operation_modes: tuple[BessOperationModeItem, ...] = field(
        default=BESS_OPERATION_MODE_CATALOG
    )
    tap_changers: tuple[TapChangerItem, ...] = field(default=TAP_CHANGER_CATALOG)
    hv_fuses: tuple[HvFuseItem, ...] = field(default=HV_FUSE_CATALOG)
    device_withstand: tuple[DeviceWithstandItem, ...] = field(default=DEVICE_WITHSTAND_CATALOG)
    pf_curves: tuple[PfCurveItem, ...] = field(default=PF_CURVE_CATALOG)
    block_transformers: tuple[BlockTransformerItem, ...] = field(default=BLOCK_TRANSFORMER_CATALOG)
    mv_neutral_groundings: tuple[MvNeutralGroundingItem, ...] = field(
        default=MV_NEUTRAL_GROUNDING_CATALOG
    )

    def to_dict(self) -> dict:
        return {
            "bess_operation_modes": [m.to_dict() for m in self.bess_operation_modes],
            "tap_changers": [tc.to_dict() for tc in self.tap_changers],
            "hv_fuses": [f.to_dict() for f in self.hv_fuses],
            "device_withstand": [d.to_dict() for d in self.device_withstand],
            "pf_curves": [c.to_dict() for c in self.pf_curves],
            "block_transformers": [b.to_dict() for b in self.block_transformers],
            "mv_neutral_groundings": [g.to_dict() for g in self.mv_neutral_groundings],
        }


def get_audit2_catalog_snapshot() -> Audit2CatalogSnapshot:
    return Audit2CatalogSnapshot()
