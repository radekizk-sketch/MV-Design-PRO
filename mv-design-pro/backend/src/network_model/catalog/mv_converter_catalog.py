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
    note: str = "Referencyjny profil przemyslowy V1 z jawnym statusem i zrodlem.",
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
    return {"id": item_id, "name": name, "params": params}


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
]

for _converter_type in CONVERTER_PV + CONVERTER_WIND + CONVERTER_BESS:
    _apply_quality_defaults(_converter_type)


# =============================================================================
# FUNKCJE DOSTEPU
# =============================================================================


def get_all_converter_types() -> list[dict[str, Any]]:
    """Zwraca wszystkie typy zrodel konwerterowych i magazynow energii."""
    for record in CONVERTER_PV + CONVERTER_WIND + CONVERTER_BESS:
        _apply_quality_defaults(record)
    return CONVERTER_PV + CONVERTER_WIND + CONVERTER_BESS


def get_pv_types() -> list[dict[str, Any]]:
    """Zwraca typy farm PV."""
    return CONVERTER_PV


def get_wind_types() -> list[dict[str, Any]]:
    """Zwraca typy turbin wiatrowych."""
    return CONVERTER_WIND


def get_bess_types() -> list[dict[str, Any]]:
    """Zwraca typy magazynow energii."""
    return CONVERTER_BESS


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
        "liczba_pv": len(CONVERTER_PV),
        "liczba_wiatr": len(CONVERTER_WIND),
        "liczba_bess": len(CONVERTER_BESS),
        "rodzaje": kinds,
        "producenci": manufacturers,
        "verification_statuses": sorted({t["params"]["verification_status"] for t in all_types}),
        "catalog_statuses": sorted({t["params"]["catalog_status"] for t in all_types}),
    }
