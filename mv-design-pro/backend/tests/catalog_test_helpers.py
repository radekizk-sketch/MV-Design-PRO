from __future__ import annotations

from typing import Any


def gpz_catalog_ref(
    *,
    voltage_kv: float = 15.0,
    sk3_mva: float = 250.0,
    rx_ratio: float = 0.10,
) -> str:
    voltage_token = int(round(voltage_kv))
    power_token = int(round(sk3_mva))
    rx_token = f"{int(round(rx_ratio * 100)):03d}"
    return f"src-gpz-{voltage_token}kv-{power_token}mva-rx{rx_token}"


def gpz_materialized_params(
    *,
    voltage_kv: float = 15.0,
    sk3_mva: float = 250.0,
    rx_ratio: float = 0.10,
) -> dict[str, Any]:
    voltage_token = int(round(voltage_kv))
    power_token = int(round(sk3_mva))
    rx_token = f"{int(round(rx_ratio * 100)):03d}"
    return {
        "voltage_rating_kv": voltage_kv,
        "sk3_mva": sk3_mva,
        "rx_ratio": rx_ratio,
        "short_circuit_model": "short_circuit_power",
        "earthing_system": "PUNKT_NEUTRALNY_UZIEMIONY",
        "supply_role": "ZASILANIE_SYSTEMOWE",
        "manufacturer": "OSD",
        "series": "Warunki zasilania GPZ",
        "catalog_number": f"GPZ-{voltage_token}-{power_token}-{rx_token}",
        "data_source": "Warunki przylaczenia / standard OSD",
    }


def gpz_payload(
    *,
    voltage_kv: float = 15.0,
    sk3_mva: float = 250.0,
    rx_ratio: float = 0.10,
    **extra: Any,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "voltage_kv": voltage_kv,
        "sk3_mva": sk3_mva,
        "rx_ratio": rx_ratio,
        "catalog_ref": gpz_catalog_ref(
            voltage_kv=voltage_kv,
            sk3_mva=sk3_mva,
            rx_ratio=rx_ratio,
        ),
        # Karta FAB-G: transformator WN/SN GPZ wymaga jawnej pary hv_voltage_kv
        # + transformer_sn_mva (albo transformer_catalog_ref) — odtwarzamy jako
        # dana fikstury zalozenie, ktore wczesniej wchodzilo domyslnie
        # (25 MVA @ 110 kV). `voltage_kv` powyzej wybiera stronę SN w mapie
        # katalogowej, wiec para zostaje poprawna dla kazdego wywolania.
        "hv_voltage_kv": 110.0,
        "transformer_sn_mva": 25.0,
    }
    payload.update(extra)
    return payload


def gpz_source_record(
    *,
    ref_id: str = "src-grid",
    name: str = "Zasilanie GPZ",
    bus_ref: str = "bus-main",
    voltage_kv: float = 15.0,
    sk3_mva: float = 250.0,
    rx_ratio: float = 0.10,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    data: dict[str, Any] = {
        "ref_id": ref_id,
        "name": name,
        "bus_ref": bus_ref,
        "model": "short_circuit_power",
        "catalog_ref": gpz_catalog_ref(
            voltage_kv=voltage_kv,
            sk3_mva=sk3_mva,
            rx_ratio=rx_ratio,
        ),
        "catalog_namespace": "ZRODLO_SN",
        "parameter_source": "CATALOG",
        "source_mode": "KATALOG",
        "materialized_params": gpz_materialized_params(
            voltage_kv=voltage_kv,
            sk3_mva=sk3_mva,
            rx_ratio=rx_ratio,
        ),
        "sk3_mva": sk3_mva,
        "rx_ratio": rx_ratio,
    }
    if extra:
        data.update(extra)
    return data
