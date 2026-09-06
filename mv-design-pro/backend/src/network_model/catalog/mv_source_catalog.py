"""
Katalog zasilan systemowych SN (GPZ / warunki zasilania OSD).

Pozycje reprezentuja jawne, audytowalne kontrakty techniczne dla zrodla GPZ.
Brak domyslowania: parametry zwarciowe i napieciowe pochodza z katalogu.
"""

from __future__ import annotations

from typing import Any

from network_model.pochodne import prad_z_mocy_pozornej_ka

from .types import CATALOG_CONTRACT_VERSION, CatalogStatus, CatalogVerificationStatus

_DEFAULT_SOURCE_REFERENCE = "Warunki przylaczenia / standard OSD / matryca katalogowa MV-DESIGN-PRO"
_DEFAULT_VERIFICATION_STATUS = CatalogVerificationStatus.CZESCIOWO_ZWERYFIKOWANY.value
_DEFAULT_CATALOG_STATUS = CatalogStatus.PRODUKCYJNY_V1.value


def _source_quality(note: str) -> dict[str, Any]:
    return {
        "verification_status": _DEFAULT_VERIFICATION_STATUS,
        "source_reference": _DEFAULT_SOURCE_REFERENCE,
        "catalog_status": _DEFAULT_CATALOG_STATUS,
        "contract_version": CATALOG_CONTRACT_VERSION,
        "verification_note": note,
    }


def _build_source_record(voltage_kv: float, sk3_mva: float, rx_ratio: float) -> dict[str, Any]:
    ik3_ka = round(prad_z_mocy_pozornej_ka(sk3_mva, voltage_kv), 2)
    rx_tag = f"{int(round(rx_ratio * 100)):03d}"
    return {
        "id": f"src-gpz-{int(voltage_kv)}kv-{int(sk3_mva)}mva-rx{rx_tag}",
        "name": f"Zasilanie GPZ {int(voltage_kv)} kV / Sk3 {int(sk3_mva)} MVA / R/X {rx_ratio:.2f}",
        "params": {
            "voltage_rating_kv": voltage_kv,
            "sk3_mva": sk3_mva,
            "ik3_ka": ik3_ka,
            "rx_ratio": rx_ratio,
            "earthing_system": "PUNKT_NEUTRALNY_UZIEMIONY",
            "short_circuit_model": "short_circuit_power",
            "operator_name": "OSD",
            "supply_role": "ZASILANIE_SYSTEMOWE",
            "manufacturer": "OSD",
            "series": "Warunki zasilania GPZ",
            "catalog_number": f"GPZ-{int(voltage_kv)}-{int(sk3_mva)}-{rx_tag}",
            "data_source": _DEFAULT_SOURCE_REFERENCE,
            **_source_quality(
                "Profil referencyjny GPZ dla sieci SN; dane operacyjne oznaczone jawnie."
            ),
        },
    }


SOURCE_SYSTEM_TYPES: list[dict[str, Any]] = [
    {
        "id": "src-gpz-15kv-200mva-rx010",
        "name": "Zasilanie GPZ 15 kV / Sk3 200 MVA / R/X 0.10",
        "params": {
            "voltage_rating_kv": 15.0,
            "sk3_mva": 200.0,
            "ik3_ka": None,
            "rx_ratio": 0.10,
            "earthing_system": "PUNKT_NEUTRALNY_UZIEMIONY",
            "short_circuit_model": "short_circuit_power",
            "operator_name": "OSD",
            "supply_role": "ZASILANIE_SYSTEMOWE",
            "manufacturer": "OSD",
            "series": "Warunki zasilania GPZ",
            "catalog_number": "GPZ-15-200-010",
            "data_source": "Warunki przylaczenia / standard OSD",
            **_source_quality(
                "Profil referencyjny GPZ dla sieci SN; dane operacyjne oznaczone jawnie."
            ),
        },
    },
    {
        "id": "src-gpz-15kv-250mva-rx010",
        "name": "Zasilanie GPZ 15 kV / Sk3 250 MVA / R/X 0.10",
        "params": {
            "voltage_rating_kv": 15.0,
            "sk3_mva": 250.0,
            "ik3_ka": None,
            "rx_ratio": 0.10,
            "earthing_system": "PUNKT_NEUTRALNY_UZIEMIONY",
            "short_circuit_model": "short_circuit_power",
            "operator_name": "OSD",
            "supply_role": "ZASILANIE_SYSTEMOWE",
            "manufacturer": "OSD",
            "series": "Warunki zasilania GPZ",
            "catalog_number": "GPZ-15-250-010",
            "data_source": "Warunki przylaczenia / standard OSD",
            **_source_quality(
                "Profil referencyjny GPZ dla sieci SN; dane operacyjne oznaczone jawnie."
            ),
        },
    },
    {
        "id": "src-gpz-15kv-300mva-rx010",
        "name": "Zasilanie GPZ 15 kV / Sk3 300 MVA / R/X 0.10",
        "params": {
            "voltage_rating_kv": 15.0,
            "sk3_mva": 300.0,
            "ik3_ka": None,
            "rx_ratio": 0.10,
            "earthing_system": "PUNKT_NEUTRALNY_UZIEMIONY",
            "short_circuit_model": "short_circuit_power",
            "operator_name": "OSD",
            "supply_role": "ZASILANIE_SYSTEMOWE",
            "manufacturer": "OSD",
            "series": "Warunki zasilania GPZ",
            "catalog_number": "GPZ-15-300-010",
            "data_source": "Warunki przylaczenia / standard OSD",
            **_source_quality(
                "Profil referencyjny GPZ dla sieci SN; dane operacyjne oznaczone jawnie."
            ),
        },
    },
    {
        "id": "src-gpz-15kv-350mva-rx010",
        "name": "Zasilanie GPZ 15 kV / Sk3 350 MVA / R/X 0.10",
        "params": {
            "voltage_rating_kv": 15.0,
            "sk3_mva": 350.0,
            "ik3_ka": None,
            "rx_ratio": 0.10,
            "earthing_system": "PUNKT_NEUTRALNY_UZIEMIONY",
            "short_circuit_model": "short_circuit_power",
            "operator_name": "OSD",
            "supply_role": "ZASILANIE_SYSTEMOWE",
            "manufacturer": "OSD",
            "series": "Warunki zasilania GPZ",
            "catalog_number": "GPZ-15-350-010",
            "data_source": "Warunki przylaczenia / standard OSD",
            **_source_quality(
                "Profil referencyjny GPZ dla sieci SN; dane operacyjne oznaczone jawnie."
            ),
        },
    },
    {
        "id": "src-gpz-15kv-400mva-rx010",
        "name": "Zasilanie GPZ 15 kV / Sk3 400 MVA / R/X 0.10",
        "params": {
            "voltage_rating_kv": 15.0,
            "sk3_mva": 400.0,
            "ik3_ka": None,
            "rx_ratio": 0.10,
            "earthing_system": "PUNKT_NEUTRALNY_UZIEMIONY",
            "short_circuit_model": "short_circuit_power",
            "operator_name": "OSD",
            "supply_role": "ZASILANIE_SYSTEMOWE",
            "manufacturer": "OSD",
            "series": "Warunki zasilania GPZ",
            "catalog_number": "GPZ-15-400-010",
            "data_source": "Warunki przylaczenia / standard OSD",
            **_source_quality(
                "Profil referencyjny GPZ dla sieci SN; dane operacyjne oznaczone jawnie."
            ),
        },
    },
    {
        "id": "src-gpz-15kv-500mva-rx010",
        "name": "Zasilanie GPZ 15 kV / Sk3 500 MVA / R/X 0.10",
        "params": {
            "voltage_rating_kv": 15.0,
            "sk3_mva": 500.0,
            "ik3_ka": None,
            "rx_ratio": 0.10,
            "earthing_system": "PUNKT_NEUTRALNY_UZIEMIONY",
            "short_circuit_model": "short_circuit_power",
            "operator_name": "OSD",
            "supply_role": "ZASILANIE_SYSTEMOWE",
            "manufacturer": "OSD",
            "series": "Warunki zasilania GPZ",
            "catalog_number": "GPZ-15-500-010",
            "data_source": "Warunki przylaczenia / standard OSD",
            **_source_quality(
                "Profil referencyjny GPZ dla sieci SN; dane operacyjne oznaczone jawnie."
            ),
        },
    },
    {
        "id": "src-gpz-15kv-500mva-rx012",
        "name": "Zasilanie GPZ 15 kV / Sk3 500 MVA / R/X 0.12",
        "params": {
            "voltage_rating_kv": 15.0,
            "sk3_mva": 500.0,
            "ik3_ka": None,
            "rx_ratio": 0.12,
            "earthing_system": "PUNKT_NEUTRALNY_UZIEMIONY",
            "short_circuit_model": "short_circuit_power",
            "operator_name": "OSD",
            "supply_role": "ZASILANIE_SYSTEMOWE",
            "manufacturer": "OSD",
            "series": "Warunki zasilania GPZ",
            "catalog_number": "GPZ-15-500-012",
            "data_source": "Warunki przylaczenia / standard OSD",
            **_source_quality(
                "Profil referencyjny GPZ dla sieci SN; dane operacyjne oznaczone jawnie."
            ),
        },
    },
    {
        "id": "src-gpz-20kv-200mva-rx010",
        "name": "Zasilanie GPZ 20 kV / Sk3 200 MVA / R/X 0.10",
        "params": {
            "voltage_rating_kv": 20.0,
            "sk3_mva": 200.0,
            "ik3_ka": None,
            "rx_ratio": 0.10,
            "earthing_system": "PUNKT_NEUTRALNY_UZIEMIONY",
            "short_circuit_model": "short_circuit_power",
            "operator_name": "OSD",
            "supply_role": "ZASILANIE_SYSTEMOWE",
            "manufacturer": "OSD",
            "series": "Warunki zasilania GPZ",
            "catalog_number": "GPZ-20-200-010",
            "data_source": "Warunki przylaczenia / standard OSD",
            **_source_quality(
                "Profil referencyjny GPZ dla sieci SN; dane operacyjne oznaczone jawnie."
            ),
        },
    },
    {
        "id": "src-gpz-20kv-250mva-rx010",
        "name": "Zasilanie GPZ 20 kV / Sk3 250 MVA / R/X 0.10",
        "params": {
            "voltage_rating_kv": 20.0,
            "sk3_mva": 250.0,
            "ik3_ka": None,
            "rx_ratio": 0.10,
            "earthing_system": "PUNKT_NEUTRALNY_UZIEMIONY",
            "short_circuit_model": "short_circuit_power",
            "operator_name": "OSD",
            "supply_role": "ZASILANIE_SYSTEMOWE",
            "manufacturer": "OSD",
            "series": "Warunki zasilania GPZ",
            "catalog_number": "GPZ-20-250-010",
            "data_source": "Warunki przylaczenia / standard OSD",
            **_source_quality(
                "Profil referencyjny GPZ dla sieci SN; dane operacyjne oznaczone jawnie."
            ),
        },
    },
    {
        "id": "src-gpz-20kv-300mva-rx010",
        "name": "Zasilanie GPZ 20 kV / Sk3 300 MVA / R/X 0.10",
        "params": {
            "voltage_rating_kv": 20.0,
            "sk3_mva": 300.0,
            "ik3_ka": None,
            "rx_ratio": 0.10,
            "earthing_system": "PUNKT_NEUTRALNY_UZIEMIONY",
            "short_circuit_model": "short_circuit_power",
            "operator_name": "OSD",
            "supply_role": "ZASILANIE_SYSTEMOWE",
            "manufacturer": "OSD",
            "series": "Warunki zasilania GPZ",
            "catalog_number": "GPZ-20-300-010",
            "data_source": "Warunki przylaczenia / standard OSD",
            **_source_quality(
                "Profil referencyjny GPZ dla sieci SN; dane operacyjne oznaczone jawnie."
            ),
        },
    },
    {
        "id": "src-gpz-20kv-350mva-rx012",
        "name": "Zasilanie GPZ 20 kV / Sk3 350 MVA / R/X 0.12",
        "params": {
            "voltage_rating_kv": 20.0,
            "sk3_mva": 350.0,
            "ik3_ka": None,
            "rx_ratio": 0.12,
            "earthing_system": "PUNKT_NEUTRALNY_UZIEMIONY",
            "short_circuit_model": "short_circuit_power",
            "operator_name": "OSD",
            "supply_role": "ZASILANIE_SYSTEMOWE",
            "manufacturer": "OSD",
            "series": "Warunki zasilania GPZ",
            "catalog_number": "GPZ-20-350-012",
            "data_source": "Warunki przylaczenia / standard OSD",
            **_source_quality(
                "Profil referencyjny GPZ dla sieci SN; dane operacyjne oznaczone jawnie."
            ),
        },
    },
    {
        "id": "src-gpz-20kv-400mva-rx012",
        "name": "Zasilanie GPZ 20 kV / Sk3 400 MVA / R/X 0.12",
        "params": {
            "voltage_rating_kv": 20.0,
            "sk3_mva": 400.0,
            "ik3_ka": None,
            "rx_ratio": 0.12,
            "earthing_system": "PUNKT_NEUTRALNY_UZIEMIONY",
            "short_circuit_model": "short_circuit_power",
            "operator_name": "OSD",
            "supply_role": "ZASILANIE_SYSTEMOWE",
            "manufacturer": "OSD",
            "series": "Warunki zasilania GPZ",
            "catalog_number": "GPZ-20-400-012",
            "data_source": "Warunki przylaczenia / standard OSD",
            **_source_quality(
                "Profil referencyjny GPZ dla sieci SN; dane operacyjne oznaczone jawnie."
            ),
        },
    },
    {
        "id": "src-gpz-20kv-500mva-rx010",
        "name": "Zasilanie GPZ 20 kV / Sk3 500 MVA / R/X 0.10",
        "params": {
            "voltage_rating_kv": 20.0,
            "sk3_mva": 500.0,
            "ik3_ka": None,
            "rx_ratio": 0.10,
            "earthing_system": "PUNKT_NEUTRALNY_UZIEMIONY",
            "short_circuit_model": "short_circuit_power",
            "operator_name": "OSD",
            "supply_role": "ZASILANIE_SYSTEMOWE",
            "manufacturer": "OSD",
            "series": "Warunki zasilania GPZ",
            "catalog_number": "GPZ-20-500-010",
            "data_source": "Warunki przylaczenia / standard OSD",
            **_source_quality(
                "Profil referencyjny GPZ dla sieci SN; dane operacyjne oznaczone jawnie."
            ),
        },
    },
    {
        "id": "src-gpz-20kv-500mva-rx012",
        "name": "Zasilanie GPZ 20 kV / Sk3 500 MVA / R/X 0.12",
        "params": {
            "voltage_rating_kv": 20.0,
            "sk3_mva": 500.0,
            "ik3_ka": None,
            "rx_ratio": 0.12,
            "earthing_system": "PUNKT_NEUTRALNY_UZIEMIONY",
            "short_circuit_model": "short_circuit_power",
            "operator_name": "OSD",
            "supply_role": "ZASILANIE_SYSTEMOWE",
            "manufacturer": "OSD",
            "series": "Warunki zasilania GPZ",
            "catalog_number": "GPZ-20-500-012",
            "data_source": "Warunki przylaczenia / standard OSD",
            **_source_quality(
                "Profil referencyjny GPZ dla sieci SN; dane operacyjne oznaczone jawnie."
            ),
        },
    },
]


SOURCE_SYSTEM_TYPES.extend(
    [
        _build_source_record(15.0, 100.0, 0.08),
        _build_source_record(15.0, 150.0, 0.08),
        _build_source_record(15.0, 630.0, 0.12),
        _build_source_record(15.0, 750.0, 0.12),
        _build_source_record(20.0, 100.0, 0.08),
        _build_source_record(20.0, 150.0, 0.08),
        _build_source_record(20.0, 630.0, 0.12),
        _build_source_record(20.0, 750.0, 0.12),
    ]
)

for _source_type in SOURCE_SYSTEM_TYPES:
    _params = _source_type.setdefault("params", {})
    if (
        _params.get("ik3_ka") is None
        and _params.get("sk3_mva")
        and _params.get("voltage_rating_kv")
    ):
        _params["ik3_ka"] = round(
            prad_z_mocy_pozornej_ka(float(_params["sk3_mva"]), float(_params["voltage_rating_kv"])),
            2,
        )
    _params.setdefault("verification_status", _DEFAULT_VERIFICATION_STATUS)
    _params.setdefault("source_reference", _DEFAULT_SOURCE_REFERENCE)
    _params.setdefault("catalog_status", _DEFAULT_CATALOG_STATUS)
    _params.setdefault("contract_version", CATALOG_CONTRACT_VERSION)
    _params.setdefault(
        "verification_note",
        "Profil referencyjny GPZ dla sieci SN; dane operacyjne oznaczone jawnie.",
    )


def get_all_source_system_types() -> list[dict[str, Any]]:
    """Zwraca pelny typoszereg zasilan systemowych GPZ."""
    return list(SOURCE_SYSTEM_TYPES)


def get_source_catalog_statistics() -> dict[str, Any]:
    """Zwraca statystyki katalogu zasilan systemowych GPZ."""
    voltages = sorted({item["params"]["voltage_rating_kv"] for item in SOURCE_SYSTEM_TYPES})
    sk3_values = sorted({item["params"]["sk3_mva"] for item in SOURCE_SYSTEM_TYPES})
    statuses = sorted({item["params"]["verification_status"] for item in SOURCE_SYSTEM_TYPES})

    return {
        "liczba_zrodel_ogolem": len(SOURCE_SYSTEM_TYPES),
        "liczba_napiec": len(voltages),
        "napiecia_kv": voltages,
        "sk3_mva": sk3_values,
        "verification_statuses": statuses,
        "catalog_status": sorted(
            {item["params"]["catalog_status"] for item in SOURCE_SYSTEM_TYPES}
        ),
    }
