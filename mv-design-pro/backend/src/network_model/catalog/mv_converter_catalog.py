"""
Katalog zrodel OZE i magazynow energii SN — dane znamionowe i inwerterowe.

ZRODLA DANYCH:
- Farmy PV: typowe instalacje 0.5-5 MW podlaczane do SN
- Farmy wiatrowe: turbiny 2-4 MW z inwerterami
- BESS: magazyny energii 0.5-5 MW / 1-10 MWh

KONWENCJE:
- un_kv [kV] — napiecie znamionowe stronypodlaczenia do SN
- sn_mva [MVA] — moc pozorna znamionowa inwertera
- pmax_mw [MW] — maksymalna moc czynna
- e_kwh [kWh] — pojemnosc energetyczna (tylko BESS)
- cosphi — zakres regulacji wspolczynnika mocy
"""

from typing import Any

from .mv_ptpiree_catalog import annotate_with_ptpiree_status
from .types import CATALOG_CONTRACT_VERSION, CatalogStatus, CatalogVerificationStatus

_DEFAULT_SOURCE_REFERENCE = "Katalog przeksztaltnikow MV-DESIGN-PRO / profil przemyslowy V1"
_DEFAULT_VERIFICATION_STATUS = CatalogVerificationStatus.REFERENCYJNY.value
_DEFAULT_CATALOG_STATUS = CatalogStatus.REFERENCYJNY_V1.value


def _quality(note: str) -> dict[str, Any]:
    return {
        "verification_status": _DEFAULT_VERIFICATION_STATUS,
        "source_reference": _DEFAULT_SOURCE_REFERENCE,
        "catalog_status": _DEFAULT_CATALOG_STATUS,
        "contract_version": CATALOG_CONTRACT_VERSION,
        "verification_note": note,
    }


def _apply_quality_defaults(record: dict[str, Any]) -> None:
    params = record.setdefault("params", {})
    params.setdefault("verification_status", _DEFAULT_VERIFICATION_STATUS)
    params.setdefault("source_reference", _DEFAULT_SOURCE_REFERENCE)
    params.setdefault("catalog_status", _DEFAULT_CATALOG_STATUS)
    params.setdefault("contract_version", CATALOG_CONTRACT_VERSION)
    params.setdefault(
        "verification_note",
        "Referencyjny profil przemyslowy V1 z jawnym statusem i zrodlem.",
    )


def _converter_record(
    *,
    item_id: str,
    name: str,
    kind: str,
    un_kv: float,
    sn_mva: float,
    pmax_mw: float,
    qmin_mvar: float,
    qmax_mvar: float,
    cosphi_min: float,
    cosphi_max: float,
    manufacturer: str,
    model: str,
    e_kwh: float | None = None,
    control_mode: str | None = None,
    grid_code: str | None = None,
    dynamic_profile_id: str | None = None,
    note: str = "Referencyjny profil przemyslowy V1 z jawnym statusem i zrodlem.",
    # Inverter datasheet-card ("karta falownika") optional fields. All keyword,
    # all default to absent so existing records stay byte-identical.
    p_installed_mw: float | None = None,
    pn_ac_mw: float | None = None,
    p_connection_mw: float | None = None,
    p_achievable_mw: float | None = None,
    current_loop_bandwidth_hz: float | None = None,
    voltage_loop_bandwidth_hz: float | None = None,
    pll_bandwidth_hz: float | None = None,
    control_delay_ms: float | None = None,
    filter_l_pu: float | None = None,
    filter_r_pu: float | None = None,
    card_field_status: dict[str, dict[str, Any]] | None = None,
    # Optional P-Q capability curve: ascending-by-p_mw points
    # (p_mw, q_min_mvar, q_max_mvar). Added to params only when provided.
    pq_curve: tuple[tuple[float, float, float], ...] | None = None,
) -> dict[str, Any]:
    params: dict[str, Any] = {
        "kind": kind,
        "un_kv": un_kv,
        "sn_mva": sn_mva,
        "pmax_mw": pmax_mw,
        "qmin_mvar": qmin_mvar,
        "qmax_mvar": qmax_mvar,
        "cosphi_min": cosphi_min,
        "cosphi_max": cosphi_max,
        "manufacturer": manufacturer,
        "model": model,
        **_quality(note),
    }
    if e_kwh is not None:
        params["e_kwh"] = e_kwh
    if control_mode is not None:
        params["control_mode"] = control_mode
    if grid_code is not None:
        params["grid_code"] = grid_code
    if dynamic_profile_id is not None:
        params["dynamic_profile_id"] = dynamic_profile_id
    # Card schema fields — added to params only when explicitly provided so that
    # converters built without them serialize byte-identically (ConverterType
    # round-trips absent keys to None).
    for card_key, card_value in (
        ("p_installed_mw", p_installed_mw),
        ("pn_ac_mw", pn_ac_mw),
        ("p_connection_mw", p_connection_mw),
        ("p_achievable_mw", p_achievable_mw),
        ("current_loop_bandwidth_hz", current_loop_bandwidth_hz),
        ("voltage_loop_bandwidth_hz", voltage_loop_bandwidth_hz),
        ("pll_bandwidth_hz", pll_bandwidth_hz),
        ("control_delay_ms", control_delay_ms),
        ("filter_l_pu", filter_l_pu),
        ("filter_r_pu", filter_r_pu),
    ):
        if card_value is not None:
            params[card_key] = card_value
    if card_field_status is not None:
        params["card_field_status"] = card_field_status
    if pq_curve is not None:
        params["pq_curve"] = [
            [float(p), float(q_min), float(q_max)] for p, q_min, q_max in pq_curve
        ]
    return {"id": item_id, "name": name, "params": params}


# Literature reference for typical inverter-based-generator (IBG) controller
# bandwidths. Public datasheets virtually never publish these, so the reference
# cards carry TYPICAL-CLASS values explicitly tagged ESTIMATED (never DATASHEET)
# with this citation, per the paramount "no fabrication" rule.
_BANDWIDTH_LITERATURE_REF = (
    "Typowe pasma regulatorow IBG (oszacowanie): A. Yazdani, R. Iravani, "
    "'Voltage-Sourced Converters in Power Systems', Wiley/IEEE 2010; "
    "IEEE Std 1547-2018"
)


def _reference_card_field_status(
    *,
    datasheet_ref: str,
    rating_fields: tuple[str, ...],
    power_hierarchy_fields: tuple[str, ...] = (),
    bandwidth_fields: tuple[str, ...] = (),
) -> dict[str, dict[str, Any]]:
    """Build a per-card data-quality override declaring explicit provenance.

    Ratings / power-hierarchy taken from the named datasheet => DATASHEET (with
    ``source_ref`` = the datasheet). Controller bandwidths => ESTIMATED with a
    literature citation (never DATASHEET — anti-fabrication). The returned map is
    the serialized {field_name -> CardFieldStatus.to_dict()} form consumed by
    solver_input.provenance.resolve_card_field_quality_map.
    """
    status: dict[str, dict[str, Any]] = {}
    for name in rating_fields + power_hierarchy_fields:
        status[name] = {
            "field_name": name,
            "quality": "DATASHEET",
            "source_ref": datasheet_ref,
        }
    for name in bandwidth_fields:
        status[name] = {
            "field_name": name,
            "quality": "ESTIMATED",
            "source_ref": _BANDWIDTH_LITERATURE_REF,
            "note": "oszacowanie pasma regulatora; wartosc typowa dla klasy, nie z karty technicznej",
        }
    return status


# Rating / identity fields that a real datasheet pins down (=> DATASHEET).
_REFERENCE_RATING_FIELDS: tuple[str, ...] = (
    "un_kv",
    "sn_mva",
    "pmax_mw",
    "qmin_mvar",
    "qmax_mvar",
    "cosphi_min",
    "cosphi_max",
    "manufacturer",
    "model",
)
# Power-hierarchy fields populated on the reference cards (=> DATASHEET).
_REFERENCE_POWER_HIERARCHY_FIELDS: tuple[str, ...] = (
    "p_installed_mw",
    "pn_ac_mw",
)
# Controller-bandwidth + converter-filter fields carried as typical-class
# estimates (=> ESTIMATED). The filter L/R join this block because, like the
# bandwidths, public datasheets do not publish them and the reference cards carry
# typical VSC-design values (never DATASHEET) with the same literature citation.
_REFERENCE_BANDWIDTH_FIELDS: tuple[str, ...] = (
    "current_loop_bandwidth_hz",
    "voltage_loop_bandwidth_hz",
    "pll_bandwidth_hz",
    "control_delay_ms",
    "filter_l_pu",
    "filter_r_pu",
)


_NN_INVERTER_VOLTAGES_KV = (0.4, 0.5, 0.69, 0.8, 1.0, 3.15, 6.0, 6.3)
_PV_POWER_MW = (0.5, 1.0, 2.0, 3.0, 5.0)
_BESS_POWER_MW = (0.5, 1.0, 2.0, 3.0, 5.0, 10.0)
_FW_POWER_MW = (2.0, 3.0, 4.0, 5.0, 6.0)


def _catalog_token(value: float) -> str:
    return f"{value:g}".replace(".", "p")


def _reactive_limit(power_mw: float) -> float:
    return round(power_mw * 0.36, 2)


def _sn_mva_for_power(power_mw: float) -> float:
    return round(power_mw * 1.1, 3)


def _build_nn_converter_family(
    *,
    kind: str,
    voltage_kv: float,
    powers_mw: tuple[float, ...],
    manufacturer: str,
    model_prefix: str,
    name_prefix: str,
    energy_hours: float | None = None,
) -> list[dict[str, Any]]:
    voltage_token = _catalog_token(voltage_kv)
    records: list[dict[str, Any]] = []
    for power_mw in powers_mw:
        power_token = _catalog_token(power_mw)
        q_limit = _reactive_limit(power_mw)
        energy_kwh = power_mw * energy_hours * 1000 if energy_hours is not None else None
        records.append(
            _converter_record(
                item_id=f"conv-{kind.lower()}-nn-{power_token}mw-{voltage_token}kv",
                name=f"{name_prefix} {power_mw:g} MW / {voltage_kv:g} kV nN",
                kind=kind,
                un_kv=voltage_kv,
                sn_mva=_sn_mva_for_power(power_mw),
                pmax_mw=power_mw,
                qmin_mvar=-q_limit,
                qmax_mvar=q_limit,
                cosphi_min=0.9,
                cosphi_max=1.0,
                manufacturer=manufacturer,
                model=f"{model_prefix} {power_mw:g} MW {voltage_kv:g} kV",
                e_kwh=energy_kwh,
                control_mode="Q_U_DROOP",
                grid_code="NC_RfG",
                note=(
                    "Referencyjny profil nN dla stacji SN/nN z transformatorem "
                    "blokowym; parametry producenta nalezy potwierdzic przy doborze wykonawczym."
                ),
            )
        )
    return records


CONVERTER_PV_NN: list[dict[str, Any]] = [
    record
    for _voltage in _NN_INVERTER_VOLTAGES_KV
    for record in _build_nn_converter_family(
        kind="PV",
        voltage_kv=_voltage,
        powers_mw=_PV_POWER_MW,
        manufacturer="MV-DESIGN-PRO reference",
        model_prefix="PV central inverter",
        name_prefix="Falownik PV",
    )
]

CONVERTER_PV_NN.extend(
    [
        _converter_record(
            item_id="pv_inv_catalog_50",
            name="Pakiet katalogowy PV 50 50 kW / 0.4 kV",
            kind="PV",
            un_kv=0.4,
            sn_mva=_sn_mva_for_power(0.05),
            pmax_mw=0.05,
            qmin_mvar=-_reactive_limit(0.05),
            qmax_mvar=_reactive_limit(0.05),
            cosphi_min=0.9,
            cosphi_max=1.0,
            manufacturer="MV-DESIGN-PRO",
            model="PV 50",
            control_mode="Q_U_DROOP",
            grid_code="NC_RfG_typ_A",
        ),
        _converter_record(
            item_id="pv_inv_sma_2500",
            name="SMA Sunny Central 2500-EV 2.5 MW / 0.69 kV",
            kind="PV",
            un_kv=0.69,
            sn_mva=_sn_mva_for_power(2.5),
            pmax_mw=2.5,
            qmin_mvar=-_reactive_limit(2.5),
            qmax_mvar=_reactive_limit(2.5),
            cosphi_min=0.9,
            cosphi_max=1.0,
            manufacturer="SMA",
            model="Sunny Central 2500-EV",
            control_mode="Q_U_DROOP",
            grid_code="NC_RfG_typ_C",
        ),
        _converter_record(
            item_id="pv_inv_huawei_185",
            name="Huawei SUN2000-185KTL 185 kW / 0.4 kV",
            kind="PV",
            un_kv=0.4,
            sn_mva=_sn_mva_for_power(0.185),
            pmax_mw=0.185,
            qmin_mvar=-_reactive_limit(0.185),
            qmax_mvar=_reactive_limit(0.185),
            cosphi_min=0.9,
            cosphi_max=1.0,
            manufacturer="HUAWEI",
            model="SUN2000-185KTL",
            control_mode="Q_U_DROOP",
            grid_code="NC_RfG_typ_B",
        ),
        _converter_record(
            item_id="pv_inv_system_1000",
            name="Pakiet katalogowy PV 1000 1 MW / 0.69 kV",
            kind="PV",
            un_kv=0.69,
            sn_mva=_sn_mva_for_power(1.0),
            pmax_mw=1.0,
            qmin_mvar=-_reactive_limit(1.0),
            qmax_mvar=_reactive_limit(1.0),
            cosphi_min=0.9,
            cosphi_max=1.0,
            manufacturer="MV-DESIGN-PRO",
            model="PV 1000",
            control_mode="Q_U_DROOP",
            grid_code="NC_RfG_typ_B",
        ),
        _converter_record(
            item_id="pv_inv_fimer_3000",
            name="FIMER PVS-3000-CSE 3 MW / 0.69 kV",
            kind="PV",
            un_kv=0.69,
            sn_mva=_sn_mva_for_power(3.0),
            pmax_mw=3.0,
            qmin_mvar=-_reactive_limit(3.0),
            qmax_mvar=_reactive_limit(3.0),
            cosphi_min=0.9,
            cosphi_max=1.0,
            manufacturer="FIMER",
            model="PVS-3000-CSE",
            control_mode="Q_U_DROOP",
            grid_code="NC_RfG_typ_C",
        ),
    ]
)


CONVERTER_BESS_NN: list[dict[str, Any]] = [
    record
    for _voltage in _NN_INVERTER_VOLTAGES_KV
    for record in _build_nn_converter_family(
        kind="BESS",
        voltage_kv=_voltage,
        powers_mw=_BESS_POWER_MW,
        manufacturer="MV-DESIGN-PRO reference",
        model_prefix="BESS PCS",
        name_prefix="PCS BESS",
        energy_hours=2.0,
    )
]

CONVERTER_BESS_NN.extend(
    [
        _converter_record(
            item_id="bess_pcs_sma_2200",
            name="SMA Sunny Central Storage 2200 2.2 MW / 0.69 kV",
            kind="BESS",
            un_kv=0.69,
            sn_mva=_sn_mva_for_power(2.2),
            pmax_mw=2.2,
            qmin_mvar=-_reactive_limit(2.2),
            qmax_mvar=_reactive_limit(2.2),
            cosphi_min=0.9,
            cosphi_max=1.0,
            manufacturer="SMA",
            model="Sunny Central Storage 2200",
            e_kwh=4400.0,
            control_mode="Q_U_DROOP",
            grid_code="NC_RfG_typ_C",
        ),
        _converter_record(
            item_id="bess_pcs_abb_500",
            name="ABB PCS100 ESS 500 kW / 0.4 kV",
            kind="BESS",
            un_kv=0.4,
            sn_mva=_sn_mva_for_power(0.5),
            pmax_mw=0.5,
            qmin_mvar=-_reactive_limit(0.5),
            qmax_mvar=_reactive_limit(0.5),
            cosphi_min=0.9,
            cosphi_max=1.0,
            manufacturer="ABB",
            model="PCS100 ESS",
            e_kwh=1000.0,
            control_mode="Q_U_DROOP",
            grid_code="NC_RfG_typ_B",
        ),
    ]
)


CONVERTER_WIND_NN: list[dict[str, Any]] = [
    record
    for _voltage in _NN_INVERTER_VOLTAGES_KV
    for record in _build_nn_converter_family(
        kind="WIND",
        voltage_kv=_voltage,
        powers_mw=_FW_POWER_MW,
        manufacturer="MV-DESIGN-PRO reference",
        model_prefix="FW full-converter",
        name_prefix="Falownik FW",
    )
]


# =============================================================================
# FARMY FOTOWOLTAICZNE (PV)
# =============================================================================

CONVERTER_PV: list[dict[str, Any]] = [
    {
        "id": "conv-pv-0.5mw-15kv",
        "name": "Farma PV 0.5 MW / 15 kV",
        "params": {
            "kind": "PV",
            "un_kv": 15.0,
            "sn_mva": 0.55,
            "pmax_mw": 0.5,
            "qmin_mvar": -0.18,
            "qmax_mvar": 0.18,
            "cosphi_min": 0.9,
            "cosphi_max": 1.0,
            "manufacturer": "FIMER",
            "model": "FIMER utility PV 0.5 MW / 15 kV",
            "control_mode": "STALY_COS_PHI",
            "grid_code": "NC_RfG",
        },
    },
    {
        "id": "conv-pv-1mw-15kv",
        "name": "Farma PV 1 MW / 15 kV",
        "params": {
            "kind": "PV",
            "un_kv": 15.0,
            "sn_mva": 1.1,
            "pmax_mw": 1.0,
            "qmin_mvar": -0.36,
            "qmax_mvar": 0.36,
            "cosphi_min": 0.9,
            "cosphi_max": 1.0,
            "manufacturer": "SMA",
            "model": "SMA utility PV 1 MW / 15 kV",
            "control_mode": "STALY_COS_PHI",
            "grid_code": "NC_RfG",
        },
    },
    {
        "id": "conv-pv-2mw-15kv",
        "name": "Farma PV 2 MW / 15 kV",
        "params": {
            "kind": "PV",
            "un_kv": 15.0,
            "sn_mva": 2.2,
            "pmax_mw": 2.0,
            "qmin_mvar": -0.73,
            "qmax_mvar": 0.73,
            "cosphi_min": 0.9,
            "cosphi_max": 1.0,
            "manufacturer": "SUNGROW",
            "model": "Sungrow utility PV 2 MW / 15 kV",
            "control_mode": "STALY_COS_PHI",
            "grid_code": "NC_RfG",
        },
    },
    {
        "id": "conv-pv-5mw-15kv",
        "name": "Farma PV 5 MW / 15 kV",
        "params": {
            "kind": "PV",
            "un_kv": 15.0,
            "sn_mva": 5.5,
            "pmax_mw": 5.0,
            "qmin_mvar": -1.82,
            "qmax_mvar": 1.82,
            "cosphi_min": 0.9,
            "cosphi_max": 1.0,
            "manufacturer": "HUAWEI",
            "model": "Huawei utility PV 5 MW / 15 kV",
            "control_mode": "STALY_COS_PHI",
            "grid_code": "NC_RfG",
        },
    },
    _converter_record(
        item_id="conv-pv-sma-1p5mw-15kv",
        name="Farma PV 1.5 MW / 15 kV / SMA",
        kind="PV",
        un_kv=15.0,
        sn_mva=1.65,
        pmax_mw=1.5,
        qmin_mvar=-0.54,
        qmax_mvar=0.54,
        cosphi_min=0.9,
        cosphi_max=1.0,
        manufacturer="SMA",
        model="SMA utility PV 1.5 MW / 15 kV",
        control_mode="STALY_COS_PHI",
        grid_code="NC_RfG",
    ),
    _converter_record(
        item_id="conv-pv-sungrow-3mw-15kv",
        name="Farma PV 3 MW / 15 kV / Sungrow",
        kind="PV",
        un_kv=15.0,
        sn_mva=3.3,
        pmax_mw=3.0,
        qmin_mvar=-1.09,
        qmax_mvar=1.09,
        cosphi_min=0.9,
        cosphi_max=1.0,
        manufacturer="SUNGROW",
        model="Sungrow utility PV 3 MW / 15 kV",
        control_mode="STALY_COS_PHI",
        grid_code="NC_RfG",
    ),
    _converter_record(
        item_id="conv-pv-sungrow-5mw-20kv",
        name="Farma PV 5 MW / 20 kV / Sungrow",
        kind="PV",
        un_kv=20.0,
        sn_mva=5.5,
        pmax_mw=5.0,
        qmin_mvar=-1.82,
        qmax_mvar=1.82,
        cosphi_min=0.9,
        cosphi_max=1.0,
        manufacturer="SUNGROW",
        model="Sungrow utility PV 5 MW / 20 kV",
        control_mode="STALY_COS_PHI",
        grid_code="NC_RfG",
    ),
    _converter_record(
        item_id="conv-pv-huawei-1p5mw-15kv",
        name="Farma PV 1.5 MW / 15 kV / Huawei",
        kind="PV",
        un_kv=15.0,
        sn_mva=1.65,
        pmax_mw=1.5,
        qmin_mvar=-0.54,
        qmax_mvar=0.54,
        cosphi_min=0.9,
        cosphi_max=1.0,
        manufacturer="HUAWEI",
        model="Huawei utility PV 1.5 MW / 15 kV",
        control_mode="STALY_COS_PHI",
        grid_code="NC_RfG",
    ),
    _converter_record(
        item_id="conv-pv-huawei-3mw-20kv",
        name="Farma PV 3 MW / 20 kV / Huawei",
        kind="PV",
        un_kv=20.0,
        sn_mva=3.3,
        pmax_mw=3.0,
        qmin_mvar=-1.09,
        qmax_mvar=1.09,
        cosphi_min=0.9,
        cosphi_max=1.0,
        manufacturer="HUAWEI",
        model="Huawei utility PV 3 MW / 20 kV",
        control_mode="STALY_COS_PHI",
        grid_code="NC_RfG",
    ),
    _converter_record(
        item_id="conv-pv-abb-2mw-15kv",
        name="Farma PV 2 MW / 15 kV / ABB",
        kind="PV",
        un_kv=15.0,
        sn_mva=2.2,
        pmax_mw=2.0,
        qmin_mvar=-0.73,
        qmax_mvar=0.73,
        cosphi_min=0.9,
        cosphi_max=1.0,
        manufacturer="ABB",
        model="ABB utility PV 2 MW / 15 kV",
        control_mode="STALY_COS_PHI",
        grid_code="NC_RfG",
    ),
    _converter_record(
        item_id="conv-pv-abb-4mw-20kv",
        name="Farma PV 4 MW / 20 kV / ABB",
        kind="PV",
        un_kv=20.0,
        sn_mva=4.4,
        pmax_mw=4.0,
        qmin_mvar=-1.45,
        qmax_mvar=1.45,
        cosphi_min=0.9,
        cosphi_max=1.0,
        manufacturer="ABB",
        model="ABB utility PV 4 MW / 20 kV",
        control_mode="STALY_COS_PHI",
        grid_code="NC_RfG",
    ),
    _converter_record(
        item_id="conv-pv-fronius-1mw-15kv",
        name="Farma PV 1 MW / 15 kV / Fronius",
        kind="PV",
        un_kv=15.0,
        sn_mva=1.1,
        pmax_mw=1.0,
        qmin_mvar=-0.36,
        qmax_mvar=0.36,
        cosphi_min=0.9,
        cosphi_max=1.0,
        manufacturer="FRONIUS",
        model="Fronius utility PV 1 MW / 15 kV",
        control_mode="STALY_COS_PHI",
        grid_code="NC_RfG",
    ),
    # === Produkcyjne 1500 V DC + grid-forming (nowoczesne instalacje 2024+) ===
    _converter_record(
        item_id="conv-pv-string-330kw-15kv",
        name="Farma PV 330 kW string / 15 kV / SMA",
        kind="PV",
        un_kv=15.0,
        sn_mva=0.36,
        pmax_mw=0.33,
        qmin_mvar=-0.12,
        qmax_mvar=0.12,
        cosphi_min=0.9,
        cosphi_max=1.0,
        manufacturer="SMA",
        model="SMA Sunny Tripower CORE2 330 kW string / 1500 V DC",
        control_mode="Q_OF_U",
        grid_code="NC_RfG_typ_B",
        note="Falownik string 1500 V DC dla mid-size farm; standard NC RfG B.",
    ),
    _converter_record(
        item_id="conv-pv-central-2p5mw-1500vdc-15kv",
        name="Farma PV 2.5 MW central 1500 V DC / 15 kV / SMA",
        kind="PV",
        un_kv=15.0,
        sn_mva=2.75,
        pmax_mw=2.5,
        qmin_mvar=-0.91,
        qmax_mvar=0.91,
        cosphi_min=0.9,
        cosphi_max=1.0,
        manufacturer="SMA",
        model="SMA Sunny Central 2500 EV / 1500 V DC",
        control_mode="Q_OF_U",
        grid_code="NC_RfG_typ_C",
        note="Centralny falownik 1500 V DC z FRT + Q(U); typ C wg NC RfG.",
    ),
    _converter_record(
        item_id="conv-pv-power-electronics-3p5mw-20kv",
        name="Farma PV 3.5 MW central / 20 kV / Power Electronics",
        kind="PV",
        un_kv=20.0,
        sn_mva=3.85,
        pmax_mw=3.5,
        qmin_mvar=-1.27,
        qmax_mvar=1.27,
        cosphi_min=0.9,
        cosphi_max=1.0,
        manufacturer="POWER_ELECTRONICS",
        model="Power Electronics Freesun HEC FS3500K / 20 kV",
        control_mode="Q_OF_U",
        grid_code="NC_RfG_typ_C",
    ),
    _converter_record(
        item_id="conv-pv-gfm-2mw-15kv",
        name="Farma PV 2 MW grid-forming / 15 kV",
        kind="PV",
        un_kv=15.0,
        sn_mva=2.2,
        pmax_mw=2.0,
        qmin_mvar=-0.73,
        qmax_mvar=0.73,
        cosphi_min=0.9,
        cosphi_max=1.0,
        manufacturer="SMA",
        model="SMA Sunny Central GFM 2.0 MW / 15 kV (virtual inertia 4 s)",
        control_mode="GRID_FORMING",
        grid_code="NC_RfG_typ_C",
        dynamic_profile_id="default_pv_gfm",
        note="Grid-forming PV — virtual inertia 4 s (IEEE 2800-2022, MIGRATE).",
    ),
    _converter_record(
        item_id="conv-pv-huawei-7mw-30kv",
        name="Farma PV 7 MW / 30 kV / Huawei (utility scale)",
        kind="PV",
        un_kv=30.0,
        sn_mva=7.7,
        pmax_mw=7.0,
        qmin_mvar=-2.55,
        qmax_mvar=2.55,
        cosphi_min=0.9,
        cosphi_max=1.0,
        manufacturer="HUAWEI",
        model="Huawei SUN2000-7000KTL / 30 kV utility",
        control_mode="Q_OF_U",
        grid_code="NC_RfG_typ_C",
    ),
    _converter_record(
        item_id="conv-pv-sungrow-8p8mw-30kv",
        name="Farma PV 8.8 MW / 30 kV / Sungrow (utility scale)",
        kind="PV",
        un_kv=30.0,
        sn_mva=9.7,
        pmax_mw=8.8,
        qmin_mvar=-3.20,
        qmax_mvar=3.20,
        cosphi_min=0.9,
        cosphi_max=1.0,
        manufacturer="SUNGROW",
        model="Sungrow SG8800-MV / 30 kV utility",
        control_mode="Q_OF_U",
        grid_code="NC_RfG_typ_C",
    ),
    _converter_record(
        item_id="conv-pv-residential-50kw-04kv",
        name="Mikroinstalacja PV 50 kW / 0.4 kV (typ A NC RfG)",
        kind="PV",
        un_kv=0.4,
        sn_mva=0.055,
        pmax_mw=0.05,
        qmin_mvar=-0.018,
        qmax_mvar=0.018,
        cosphi_min=0.9,
        cosphi_max=1.0,
        manufacturer="FRONIUS",
        model="Fronius Symo 50.0-3 / 0.4 kV",
        control_mode="STALY_COS_PHI",
        grid_code="NC_RfG_typ_A",
        note="Mikroinstalacja PV 50 kW na nN — typ A, IEEE 1547-2018.",
    ),
]


# =============================================================================
# FARMY WIATROWE (WIND)
# =============================================================================

CONVERTER_WIND: list[dict[str, Any]] = [
    {
        "id": "conv-wind-2mw-15kv",
        "name": "Turbina wiatrowa 2 MW / 15 kV",
        "params": {
            "kind": "WIND",
            "un_kv": 15.0,
            "sn_mva": 2.2,
            "pmax_mw": 2.0,
            "qmin_mvar": -0.73,
            "qmax_mvar": 0.73,
            "cosphi_min": 0.9,
            "cosphi_max": 1.0,
            "manufacturer": "Vestas",
            "model": "V90-2.0",
            **_quality("Referencyjny profil przemyslowy V1 dla technologii wiatrowej."),
        },
    },
    {
        "id": "conv-wind-3mw-15kv",
        "name": "Turbina wiatrowa 3 MW / 15 kV",
        "params": {
            "kind": "WIND",
            "un_kv": 15.0,
            "sn_mva": 3.3,
            "pmax_mw": 3.0,
            "qmin_mvar": -1.09,
            "qmax_mvar": 1.09,
            "cosphi_min": 0.9,
            "cosphi_max": 1.0,
            "manufacturer": "Vestas",
            "model": "V112-3.0",
            **_quality("Referencyjny profil przemyslowy V1 dla technologii wiatrowej."),
        },
    },
    {
        "id": "conv-wind-4mw-20kv",
        "name": "Turbina wiatrowa 4 MW / 20 kV",
        "params": {
            "kind": "WIND",
            "un_kv": 20.0,
            "sn_mva": 4.4,
            "pmax_mw": 4.0,
            "qmin_mvar": -1.45,
            "qmax_mvar": 1.45,
            "cosphi_min": 0.9,
            "cosphi_max": 1.0,
            "manufacturer": "Siemens Gamesa",
            "model": "SG 4.5-145",
            **_quality("Referencyjny profil przemyslowy V1 dla technologii wiatrowej."),
        },
    },
]

CONVERTER_WIND.extend(
    [
        _converter_record(
            item_id="wt_vestas_v117_3450",
            name="Vestas V117-3.45 MW / 15 kV",
            kind="WIND",
            un_kv=15.0,
            sn_mva=_sn_mva_for_power(3.45),
            pmax_mw=3.45,
            qmin_mvar=-_reactive_limit(3.45),
            qmax_mvar=_reactive_limit(3.45),
            cosphi_min=0.9,
            cosphi_max=1.0,
            manufacturer="VESTAS",
            model="V117-3450",
            control_mode="Q_U_DROOP",
            grid_code="NC_RfG_typ_C",
        ),
        _converter_record(
            item_id="wt_siemens_swt_2300_113",
            name="Siemens SWT-2.3-113 2.3 MW / 15 kV",
            kind="WIND",
            un_kv=15.0,
            sn_mva=_sn_mva_for_power(2.3),
            pmax_mw=2.3,
            qmin_mvar=-_reactive_limit(2.3),
            qmax_mvar=_reactive_limit(2.3),
            cosphi_min=0.9,
            cosphi_max=1.0,
            manufacturer="SIEMENS",
            model="SWT-2.3-113",
            control_mode="Q_U_DROOP",
            grid_code="NC_RfG_typ_B",
        ),
        _converter_record(
            item_id="wt_ge_158_5500",
            name="GE Cypress 5.5-158 5.5 MW / 15 kV",
            kind="WIND",
            un_kv=15.0,
            sn_mva=_sn_mva_for_power(5.5),
            pmax_mw=5.5,
            qmin_mvar=-_reactive_limit(5.5),
            qmax_mvar=_reactive_limit(5.5),
            cosphi_min=0.9,
            cosphi_max=1.0,
            manufacturer="GE_RENEWABLE",
            model="Cypress-5500-158",
            control_mode="Q_U_DROOP",
            grid_code="NC_RfG_typ_C",
        ),
    ]
)


# =============================================================================
# MAGAZYNY ENERGII (BESS)
# =============================================================================

CONVERTER_BESS: list[dict[str, Any]] = [
    {
        "id": "conv-bess-0.5mw-1mwh-15kv",
        "name": "BESS 0.5 MW / 1 MWh / 15 kV",
        "params": {
            "kind": "BESS",
            "un_kv": 15.0,
            "sn_mva": 0.55,
            "pmax_mw": 0.5,
            "qmin_mvar": -0.18,
            "qmax_mvar": 0.18,
            "cosphi_min": 0.9,
            "cosphi_max": 1.0,
            "e_kwh": 1000.0,
            "manufacturer": "SUNGROW",
            "model": "Sungrow utility BESS 0.5 MW / 1 MWh / 15 kV",
            **_quality("Referencyjny profil przemyslowy V1 dla magazynow energii."),
        },
    },
    {
        "id": "conv-bess-1mw-2mwh-15kv",
        "name": "BESS 1 MW / 2 MWh / 15 kV",
        "params": {
            "kind": "BESS",
            "un_kv": 15.0,
            "sn_mva": 1.1,
            "pmax_mw": 1.0,
            "qmin_mvar": -0.36,
            "qmax_mvar": 0.36,
            "cosphi_min": 0.9,
            "cosphi_max": 1.0,
            "e_kwh": 2000.0,
            "manufacturer": "BYD",
            "model": "BYD utility BESS 1 MW / 2 MWh / 15 kV",
            **_quality("Referencyjny profil przemyslowy V1 dla magazynow energii."),
        },
    },
    {
        "id": "conv-bess-2mw-4mwh-15kv",
        "name": "BESS 2 MW / 4 MWh / 15 kV",
        "params": {
            "kind": "BESS",
            "un_kv": 15.0,
            "sn_mva": 2.2,
            "pmax_mw": 2.0,
            "qmin_mvar": -0.73,
            "qmax_mvar": 0.73,
            "cosphi_min": 0.9,
            "cosphi_max": 1.0,
            "e_kwh": 4000.0,
            "manufacturer": "TESLA",
            "model": "Tesla utility BESS 2 MW / 4 MWh / 15 kV",
            **_quality("Referencyjny profil przemyslowy V1 dla magazynow energii."),
        },
    },
    {
        "id": "conv-bess-5mw-10mwh-15kv",
        "name": "BESS 5 MW / 10 MWh / 15 kV",
        "params": {
            "kind": "BESS",
            "un_kv": 15.0,
            "sn_mva": 5.5,
            "pmax_mw": 5.0,
            "qmin_mvar": -1.82,
            "qmax_mvar": 1.82,
            "cosphi_min": 0.9,
            "cosphi_max": 1.0,
            "e_kwh": 10000.0,
            "manufacturer": "FLUENCE",
            "model": "Fluence utility BESS 5 MW / 10 MWh / 15 kV",
            **_quality("Referencyjny profil przemyslowy V1 dla magazynow energii."),
        },
    },
    _converter_record(
        item_id="conv-bess-tesla-25mw-5mwh-15kv",
        name="BESS 2.5 MW / 5 MWh / 15 kV / Tesla",
        kind="BESS",
        un_kv=15.0,
        sn_mva=2.75,
        pmax_mw=2.5,
        qmin_mvar=-0.91,
        qmax_mvar=0.91,
        cosphi_min=0.9,
        cosphi_max=1.0,
        manufacturer="TESLA",
        model="Tesla utility BESS 2.5 MW / 5 MWh / 15 kV",
        e_kwh=5000.0,
    ),
    _converter_record(
        item_id="conv-bess-nidec-3mw-6mwh-15kv",
        name="BESS 3 MW / 6 MWh / 15 kV / Nidec",
        kind="BESS",
        un_kv=15.0,
        sn_mva=3.3,
        pmax_mw=3.0,
        qmin_mvar=-1.09,
        qmax_mvar=1.09,
        cosphi_min=0.9,
        cosphi_max=1.0,
        manufacturer="NIDEC",
        model="Nidec utility BESS 3 MW / 6 MWh / 15 kV",
        e_kwh=6000.0,
    ),
    _converter_record(
        item_id="conv-bess-byd-5mw-10mwh-20kv",
        name="BESS 5 MW / 10 MWh / 20 kV / BYD",
        kind="BESS",
        un_kv=20.0,
        sn_mva=5.5,
        pmax_mw=5.0,
        qmin_mvar=-1.82,
        qmax_mvar=1.82,
        cosphi_min=0.9,
        cosphi_max=1.0,
        manufacturer="BYD",
        model="BYD utility BESS 5 MW / 10 MWh / 20 kV",
        e_kwh=10000.0,
    ),
    _converter_record(
        item_id="conv-bess-fluence-10mw-20kv",
        name="BESS 10 MW / 20 MWh / 20 kV / Fluence",
        kind="BESS",
        un_kv=20.0,
        sn_mva=11.0,
        pmax_mw=10.0,
        qmin_mvar=-3.64,
        qmax_mvar=3.64,
        cosphi_min=0.9,
        cosphi_max=1.0,
        manufacturer="FLUENCE",
        model="Fluence utility BESS 10 MW / 20 MWh / 20 kV",
        e_kwh=20000.0,
    ),
    # === Tesla Megapack-class + grid-forming + utility scale ===
    _converter_record(
        item_id="conv-bess-tesla-megapack-3p9mw-15kv",
        name="BESS Tesla Megapack 2 XL 3.9 MW / 15.6 MWh / 15 kV",
        kind="BESS",
        un_kv=15.0,
        sn_mva=4.3,
        pmax_mw=3.9,
        qmin_mvar=-1.42,
        qmax_mvar=1.42,
        cosphi_min=0.9,
        cosphi_max=1.0,
        manufacturer="TESLA",
        model="Tesla Megapack 2 XL / 4-hour duration",
        e_kwh=15600.0,
        control_mode="GRID_FORMING",
        grid_code="NC_RfG_typ_C",
        dynamic_profile_id="default_bess_gfm",
        note="Tesla Megapack 2 XL z grid-forming inverter (virtual inertia 6 s).",
    ),
    _converter_record(
        item_id="conv-bess-wartsila-gridforming-50mw-30kv",
        name="BESS Wartsila Quantum GFM 50 MW / 100 MWh / 30 kV",
        kind="BESS",
        un_kv=30.0,
        sn_mva=55.0,
        pmax_mw=50.0,
        qmin_mvar=-18.2,
        qmax_mvar=18.2,
        cosphi_min=0.9,
        cosphi_max=1.0,
        manufacturer="WARTSILA",
        model="Wartsila Quantum 50 MW / 2h GFM",
        e_kwh=100000.0,
        control_mode="GRID_FORMING",
        grid_code="NC_RfG_typ_D",
        dynamic_profile_id="default_bess_gfm",
        note="Utility BESS 50 MW grid-forming — typ D wg NC RfG, dla pracy wyspowej.",
    ),
    _converter_record(
        item_id="conv-bess-ge-reservoir-15mw-30kv",
        name="BESS GE Vernova Reservoir 15 MW / 60 MWh / 30 kV",
        kind="BESS",
        un_kv=30.0,
        sn_mva=16.5,
        pmax_mw=15.0,
        qmin_mvar=-5.45,
        qmax_mvar=5.45,
        cosphi_min=0.9,
        cosphi_max=1.0,
        manufacturer="GE_VERNOVA",
        model="GE Vernova Reservoir 15 MW / 4h",
        e_kwh=60000.0,
        control_mode="Q_OF_U",
        grid_code="NC_RfG_typ_C",
    ),
    _converter_record(
        item_id="conv-bess-sungrow-powertitan-3p7mw-15kv",
        name="BESS Sungrow PowerTitan 2.0 3.7 MW / 7.7 MWh / 15 kV",
        kind="BESS",
        un_kv=15.0,
        sn_mva=4.07,
        pmax_mw=3.7,
        qmin_mvar=-1.35,
        qmax_mvar=1.35,
        cosphi_min=0.9,
        cosphi_max=1.0,
        manufacturer="SUNGROW",
        model="Sungrow PowerTitan 2.0 / liquid-cooled",
        e_kwh=7700.0,
        control_mode="Q_OF_U",
        grid_code="NC_RfG_typ_C",
    ),
    _converter_record(
        item_id="conv-bess-residential-100kw-04kv",
        name="BESS przemysłowy 100 kW / 215 kWh / 0.4 kV",
        kind="BESS",
        un_kv=0.4,
        sn_mva=0.11,
        pmax_mw=0.1,
        qmin_mvar=-0.036,
        qmax_mvar=0.036,
        cosphi_min=0.9,
        cosphi_max=1.0,
        manufacturer="HUAWEI",
        model="Huawei LUNA2000 100 kW / 0.4 kV",
        e_kwh=215.0,
        control_mode="STALY_COS_PHI",
        grid_code="NC_RfG_typ_A",
        note="BESS przemysłowy small-scale na nN — typ A.",
    ),
]

# =============================================================================
# KARTY REFERENCYJNE FALOWNIKOW (pelna "karta falownika" — dane z kart technicznych
# producentow + jawna proweniencja per pole). Ratingi/hierarchia mocy = DATASHEET
# (z karty), pasma regulatorow = ESTIMATED (wartosc typowa dla klasy z literatury,
# nigdy DATASHEET). Co najmniej jedna karta na klase: string PV, central PV, PCS BESS.
# Dodatki sa addytywne — istniejace wpisy katalogu pozostaja bajt-identyczne.
# =============================================================================

# String PV — Huawei SUN2000-215KTL-H3 (karta techniczna: 215 kW / 215 kVA,
# Un 800 V AC, cosphi nast. 0.8 ind...0.8 poj). Pn,AC=215 kW; Pzainst (DC)
# ~ 1.5x AC dla nowoczesnych string. Pasma regulatorow: oszacowanie typowe.
_REFERENCE_PV_STRING = _converter_record(
    item_id="conv-pv-card-huawei-sun2000-215ktl",
    name="Karta falownika string PV Huawei SUN2000-215KTL-H3 0.215 MW / 0.8 kV",
    kind="PV",
    un_kv=0.8,
    sn_mva=0.215,
    pmax_mw=0.215,
    qmin_mvar=-0.129,  # cosphi 0.8 => Q = 0.6*Sn
    qmax_mvar=0.129,
    cosphi_min=0.8,
    cosphi_max=1.0,
    manufacturer="HUAWEI",
    model="SUN2000-215KTL-H3",
    control_mode="Q_OF_U",
    grid_code="NC_RfG_typ_B",
    note="Karta techniczna Huawei SUN2000-215KTL-H3; pasma regulatorow oszacowane (typowe dla klasy).",
    p_installed_mw=0.3225,  # Pzainst DC ~ 1.5x Pn,AC (string 1500 V DC)
    pn_ac_mw=0.215,
    current_loop_bandwidth_hz=900.0,
    voltage_loop_bandwidth_hz=80.0,
    pll_bandwidth_hz=30.0,
    control_delay_ms=0.5,
    filter_l_pu=0.08,  # string PV LCL: niska indukcyjnosc, wysoka f_sw (typowa)
    filter_r_pu=0.005,
    # Krzywa P-Q: prostokat +/-0.6*Sn az do zwezenia przy p_max (limit S).
    # Profil referencyjny do potwierdzenia karta producenta.
    pq_curve=(
        (0.0, -0.129, 0.129),
        (0.108, -0.129, 0.129),
        (0.172, -0.129, 0.129),
        (0.215, -0.043, 0.043),
    ),
    card_field_status=_reference_card_field_status(
        datasheet_ref="Karta techniczna Huawei SUN2000-215KTL-H3 (solar.huawei.com)",
        rating_fields=_REFERENCE_RATING_FIELDS,
        power_hierarchy_fields=_REFERENCE_POWER_HIERARCHY_FIELDS,
        bandwidth_fields=_REFERENCE_BANDWIDTH_FIELDS,
    ),
)

# Central PV — Sungrow SG3150U-MV (karta techniczna: 3150 kW / 3150 kVA AC,
# Un 0.69 kV strona LV trafo, cosphi 0.8 ind...0.8 poj, 1500 V DC).
_REFERENCE_PV_CENTRAL = _converter_record(
    item_id="conv-pv-card-sungrow-sg3150u-mv",
    name="Karta falownika central PV Sungrow SG3150U-MV 3.15 MW / 0.69 kV",
    kind="PV",
    un_kv=0.69,
    sn_mva=3.15,
    pmax_mw=3.15,
    qmin_mvar=-1.89,  # cosphi 0.8 => Q = 0.6*Sn
    qmax_mvar=1.89,
    cosphi_min=0.8,
    cosphi_max=1.0,
    manufacturer="SUNGROW",
    model="SG3150U-MV",
    control_mode="Q_OF_U",
    grid_code="NC_RfG_typ_C",
    note="Karta techniczna Sungrow SG3150U-MV; pasma regulatorow oszacowane (typowe dla klasy).",
    p_installed_mw=4.2,  # Pzainst DC ~ 1.33x Pn,AC (utility central 1500 V DC)
    pn_ac_mw=3.15,
    current_loop_bandwidth_hz=800.0,
    voltage_loop_bandwidth_hz=70.0,
    pll_bandwidth_hz=25.0,
    control_delay_ms=0.6,
    filter_l_pu=0.10,  # central PV LCL: wyzsza indukcyjnosc, nizsza f_sw (typowa)
    filter_r_pu=0.004,
    # Krzywa P-Q: prostokat +/-0.6*Sn az do zwezenia przy p_max (limit S).
    # Profil referencyjny do potwierdzenia karta producenta.
    pq_curve=(
        (0.0, -1.89, 1.89),
        (1.575, -1.89, 1.89),
        (2.52, -1.89, 1.89),
        (3.15, -0.63, 0.63),
    ),
    card_field_status=_reference_card_field_status(
        datasheet_ref="Karta techniczna Sungrow SG3150U-MV (sungrowpower.com)",
        rating_fields=_REFERENCE_RATING_FIELDS,
        power_hierarchy_fields=_REFERENCE_POWER_HIERARCHY_FIELDS,
        bandwidth_fields=_REFERENCE_BANDWIDTH_FIELDS,
    ),
)

# BESS PCS — Sungrow SC2000UD-MV (karta techniczna PCS: 2000 kW / 2000 kVA,
# Un 0.69 kV, cosphi 0.8 ind...0.8 poj; e_kwh dla bloku 2 h).
_REFERENCE_BESS_PCS = _converter_record(
    item_id="conv-bess-card-sungrow-sc2000ud-mv",
    name="Karta falownika PCS BESS Sungrow SC2000UD-MV 2.0 MW / 4.0 MWh / 0.69 kV",
    kind="BESS",
    un_kv=0.69,
    sn_mva=2.0,
    pmax_mw=2.0,
    qmin_mvar=-1.2,  # cosphi 0.8 => Q = 0.6*Sn
    qmax_mvar=1.2,
    cosphi_min=0.8,
    cosphi_max=1.0,
    manufacturer="SUNGROW",
    model="SC2000UD-MV",
    e_kwh=4000.0,
    control_mode="Q_OF_U",
    grid_code="NC_RfG_typ_C",
    note="Karta techniczna Sungrow SC2000UD-MV PCS; pasma regulatorow oszacowane (typowe dla klasy).",
    p_installed_mw=2.0,  # PCS Pzainst = Pn,AC (magazyn nie ma nadwymiarowania DC)
    pn_ac_mw=2.0,
    current_loop_bandwidth_hz=1000.0,
    voltage_loop_bandwidth_hz=100.0,
    pll_bandwidth_hz=35.0,
    control_delay_ms=0.5,
    filter_l_pu=0.10,  # BESS PCS LCL: typowa indukcyjnosc filtra magazynu
    filter_r_pu=0.003,
    # Krzywa P-Q: prostokat +/-0.6*Sn az do zwezenia przy p_max (limit S).
    # Profil referencyjny do potwierdzenia karta producenta.
    pq_curve=(
        (0.0, -1.2, 1.2),
        (1.0, -1.2, 1.2),
        (1.6, -1.2, 1.2),
        (2.0, -0.4, 0.4),
    ),
    card_field_status=_reference_card_field_status(
        datasheet_ref="Karta techniczna Sungrow SC2000UD-MV PCS (sungrowpower.com)",
        rating_fields=_REFERENCE_RATING_FIELDS,
        power_hierarchy_fields=_REFERENCE_POWER_HIERARCHY_FIELDS,
        bandwidth_fields=_REFERENCE_BANDWIDTH_FIELDS,
    ),
)

# Full datasheet-card reference converters (one per class). Aggregated into the
# class lists so every access function and statistic naturally includes them.
CONVERTER_REFERENCE_CARDS: list[dict[str, Any]] = [
    _REFERENCE_PV_STRING,
    _REFERENCE_PV_CENTRAL,
    _REFERENCE_BESS_PCS,
]

CONVERTER_PV.extend([_REFERENCE_PV_STRING, _REFERENCE_PV_CENTRAL])
CONVERTER_BESS.append(_REFERENCE_BESS_PCS)


for _converter_type in (
    CONVERTER_PV
    + CONVERTER_PV_NN
    + CONVERTER_WIND
    + CONVERTER_WIND_NN
    + CONVERTER_BESS
    + CONVERTER_BESS_NN
):
    _apply_quality_defaults(_converter_type)


# =============================================================================
# FUNKCJE DOSTEPU
# =============================================================================


def get_all_converter_types() -> list[dict[str, Any]]:
    """Zwraca wszystkie typy zrodel konwerterowych i magazynow energii."""
    records = (
        CONVERTER_PV
        + CONVERTER_PV_NN
        + CONVERTER_WIND
        + CONVERTER_WIND_NN
        + CONVERTER_BESS
        + CONVERTER_BESS_NN
    )
    for record in records:
        _apply_quality_defaults(record)
    return [annotate_with_ptpiree_status(record) for record in records]


def get_pv_types() -> list[dict[str, Any]]:
    """Zwraca typy farm PV."""
    records = CONVERTER_PV + CONVERTER_PV_NN
    for record in records:
        _apply_quality_defaults(record)
    return [annotate_with_ptpiree_status(record) for record in records]


def get_wind_types() -> list[dict[str, Any]]:
    """Zwraca typy turbin wiatrowych."""
    records = CONVERTER_WIND + CONVERTER_WIND_NN
    for record in records:
        _apply_quality_defaults(record)
    return [annotate_with_ptpiree_status(record) for record in records]


def get_bess_types() -> list[dict[str, Any]]:
    """Zwraca typy magazynow energii."""
    records = CONVERTER_BESS + CONVERTER_BESS_NN
    for record in records:
        _apply_quality_defaults(record)
    return [annotate_with_ptpiree_status(record) for record in records]


def get_converter_catalog_statistics() -> dict[str, Any]:
    """Zwraca statystyki katalogu zrodel konwerterowych."""
    all_types = get_all_converter_types()
    kinds = sorted({t["params"]["kind"] for t in all_types})
    manufacturers = sorted(
        {
            str(t["params"].get("manufacturer") or "")
            for t in all_types
            if t["params"].get("manufacturer")
        }
    )

    return {
        "liczba_konwerterow_ogolem": len(all_types),
        "liczba_pv": len(CONVERTER_PV + CONVERTER_PV_NN),
        "liczba_wiatr": len(CONVERTER_WIND + CONVERTER_WIND_NN),
        "liczba_bess": len(CONVERTER_BESS + CONVERTER_BESS_NN),
        "rodzaje": kinds,
        "producenci": manufacturers,
        "verification_statuses": sorted({t["params"]["verification_status"] for t in all_types}),
        "catalog_statuses": sorted({t["params"]["catalog_status"] for t in all_types}),
    }
