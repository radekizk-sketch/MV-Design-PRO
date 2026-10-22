"""Sieć testowa karty PROG-ZERA-WKLADOW: wkład realny nad progiem i wkład pominięty.

GPZ na szynie głównej, kabel SN do szyny OZE z falownikiem PV i dwa odgałęzienia z szyny OZE:
- „Kabel odgałęzienia” (5 m) prowadzi do szyny z mikrogeneratorem synchronicznym
  (S_r ≈ 31 mVA — dana TESTOWA dobrana tak, by prąd leżał tuż nad progiem) i niesie przy
  zwarciu na szynie głównej RZECZYWISTY mały prąd tej maszyny (bocznik Y″ = 1/Z″ w sieci
  zgodnej, IEC 60909-0 p. 6.6) — kilka mikroamperów, NAD progiem |I| < 1e-6 A, więc wpis
  MUSI zostać na liście wkładów. Do karty BEZ-POJEMNOSCI ten prąd był prądem ładowania
  pojemności kabla; sieć zwarciowa składowej zgodnej nie ma admitancji poprzecznych gałęzi
  (IEC 60909-0:2016 p. 5.2 e)), więc źródłem realnego małego prądu musi być źródło zwarciowe
  — intencja testu (realny mały prąd nad progiem zostaje na liście) bez zmian;
- „Kabel bez ładowania” (b = 0) prowadzi do szyny bez żadnego odbioru i bez pojemności —
  prąd zwarciowy w nim jest fizycznie zerem, a numerycznie zerem albo resztą
  zmiennoprzecinkową (zależnie od maszyny), więc wpis jest „wkładem pominiętym na
  podstawie tolerancji numerycznej (|I| < 1e-6 A)”.
"""

from __future__ import annotations

from typing import Any

from enm.models import EnergyNetworkModel

from tests.catalog_test_helpers import gpz_source_record

NAZWA_GALEZI_REALNEJ_MALEJ = "Kabel odgałęzienia"
NAZWA_GALEZI_BEZ_PRADU = "Kabel bez ładowania"
NAZWA_GALEZI_GLOWNEJ = "Kabel OZE"


def _szyna(numer: int, ref_id: str, nazwa: str) -> dict[str, Any]:
    return {
        "id": f"00000000-0000-0000-0000-0000000007{numer:02d}",
        "ref_id": ref_id,
        "name": nazwa,
        "tags": [],
        "meta": {},
        "voltage_kv": 15.0,
        "phase_system": "3ph",
    }


def _kabel(
    numer: int, ref_id: str, nazwa: str, od: str, do: str, dlugosc_km: float, b_s_km: float
) -> dict[str, Any]:
    return {
        "id": f"00000000-0000-0000-0000-0000000007{numer:02d}",
        "ref_id": ref_id,
        "name": nazwa,
        "tags": [],
        "meta": {},
        "type": "cable",
        "from_bus_ref": od,
        "to_bus_ref": do,
        "status": "closed",
        "catalog_ref": "KABEL_SN_TEST",
        "parameter_source": "CATALOG",
        "length_km": dlugosc_km,
        "r_ohm_per_km": 0.253,
        "x_ohm_per_km": 0.073,
        "b_siemens_per_km": b_s_km,
        # Składowa zerowa (zwarcia 1F i 2F+Z): 3× zgodna, bez pojemności doziemnej, żeby
        # odgałęzienie martwe nie niosło w niej prądu fizycznego.
        "r0_ohm_per_km": 3 * 0.253,
        "x0_ohm_per_km": 3 * 0.073,
        "b0_siemens_per_km": 0.0,
        "rating": {"in_a": 270.0},
    }


def siec_wkladow_pominietych() -> EnergyNetworkModel:
    """ENM sieci testowej (deterministyczny, bez losowości)."""
    return EnergyNetworkModel.model_validate(
        {
            "header": {
                "name": "Prog wkladu pominietego",
                "enm_version": "1.0",
                "defaults": {"frequency_hz": 50, "unit_system": "SI"},
                "created_at": "2024-01-01T00:00:00Z",
                "updated_at": "2024-01-01T00:00:00Z",
                "revision": 1,
                "hash_sha256": "",
            },
            "buses": [
                _szyna(1, "bus-main", "Szyna glowna"),
                _szyna(2, "bus-oze", "Szyna OZE"),
                _szyna(3, "bus-odg", "Szyna odgalezienia"),
                _szyna(4, "bus-martwa", "Szyna martwa"),
            ],
            "branches": [
                _kabel(11, "branch-oze", NAZWA_GALEZI_GLOWNEJ, "bus-main", "bus-oze", 0.5, 2.6e-07),
                _kabel(
                    12,
                    "branch-odg",
                    NAZWA_GALEZI_REALNEJ_MALEJ,
                    "bus-oze",
                    "bus-odg",
                    0.005,
                    2.6e-07,
                ),
                _kabel(
                    13, "branch-martwa", NAZWA_GALEZI_BEZ_PRADU, "bus-oze", "bus-martwa", 0.2, 0.0
                ),
            ],
            "sources": [
                {
                    "id": "00000000-0000-0000-0000-000000000721",
                    "tags": [],
                    "meta": {},
                    **gpz_source_record(
                        ref_id="src-grid",
                        name="Zasilanie GPZ",
                        bus_ref="bus-main",
                        voltage_kv=15.0,
                        sk3_mva=250.0,
                        rx_ratio=0.10,
                        extra={"z0_z1_ratio": 3.0},
                    ),
                }
            ],
            "loads": [],
            "transformers": [],
            "generators": [
                {
                    # Mikrogenerator synchroniczny: P = 25 mW, cos φ = 0,8 → S_r = 31,25 mVA,
                    # x″d = 0,15 (domyślna `SynchronousMachineSource`) → |Z″_GK| ≈ 1e9 Ω,
                    # prąd do zwarcia na szynie głównej ≈ 9 µA (3F); 2F, 1F, 2F+G mniejszy, ale
                    # wciąż nad progiem 1e-6 A i pod 1e-4 A.
                    "id": "00000000-0000-0000-0000-000000000732",
                    "ref_id": "gen-mikro",
                    "name": "Mikrogenerator synchroniczny",
                    "tags": [],
                    "meta": {},
                    "bus_ref": "bus-odg",
                    "p_mw": 2.5e-8,
                    "q_mvar": 0.0,
                    "gen_type": "synchronous",
                },
                {
                    "id": "00000000-0000-0000-0000-000000000731",
                    "ref_id": "gen-pv",
                    "name": "Falownik PV",
                    "tags": [],
                    "meta": {},
                    "bus_ref": "bus-oze",
                    "p_mw": 1.0,
                    "q_mvar": 0.0,
                    "gen_type": "pv_inverter",
                    "connection_variant": "DEDICATED_MV_CONNECTION",
                },
            ],
            "substations": [],
            "bays": [],
            "junctions": [],
            "corridors": [],
            "measurements": [],
            "protection_assignments": [],
            "branch_points": [],
        }
    )
