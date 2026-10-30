"""Globalny raport kompletności katalogów MV-DESIGN-PRO.

Źródłem są rzeczywiste, ZMATERIALIZOWANE typy CatalogRepository, nie pliki
dokumentacji ani liczba kluczy w nieużywanych słownikach.

Brak krytyczny: obowiązkowe minimum danego typu.
Brak informacyjny: pole opcjonalne (może nie dotyczyć aparatu albo zależeć
od wariantu/karty producenta). Nie jest automatycznie błędem. Nie zastępować zerem.

Uruchomienie (Ubuntu/CI):
    PYTHONPATH=backend/src python -m network_model.catalog.completeness_report
    PYTHONPATH=backend/src python -m network_model.catalog.completeness_report --strict
"""
from __future__ import annotations

import argparse
import json
from collections import Counter
from dataclasses import fields, is_dataclass
from typing import Any

from .repository import get_default_mv_catalog


# Minimalny kontrakt dla wyboru i podstawowych obliczeń. Dane pochodne lub dane
# dla zaawansowanej analizy NIE stają się tu fikcyjnym wymogiem dla każdej klasy.
# Przykłady: i_cu dla rozłącznika = nie dotyczy; I²t NH zależy od wkładki;
# PGM Q(U) zależy od zweryfikowanej charakterystyki danego przekształtnika.
MINIMUM: dict[str, tuple[str, ...]] = {
    "line_types": ("r_ohm_per_km", "x_ohm_per_km", "rated_current_a", "voltage_rating_kv"),
    "cable_types": (
        "r_ohm_per_km", "x_ohm_per_km", "c_nf_per_km", "rated_current_a",
        "voltage_rating_kv", "cross_section_mm2", "max_temperature_c",
        "short_circuit_temperature_c",
    ),
    "transformer_types": (
        "rated_power_mva", "voltage_hv_kv", "voltage_lv_kv",
        "uk_percent", "pk_kw", "p0_kw", "i0_percent", "vector_group",
    ),
    "switch_equipment_types": ("equipment_kind", "un_kv", "in_a", "icw_ka"),
    "converter_types": ("kind", "un_kv", "sn_mva", "pmax_mw"),
    "source_system_types": ("voltage_rating_kv", "sk3_mva", "ik3_ka", "rx_ratio"),
    "ct_types": ("ratio_primary_a", "ratio_secondary_a", "accuracy_class"),
    "vt_types": ("ratio_primary_v", "ratio_secondary_v", "accuracy_class"),
    "mv_apparatus_types": ("name", "device_kind", "u_n_kv", "i_n_a"),
    "lv_apparatus_types": ("device_kind", "u_n_kv", "i_n_a"),
    "lv_breaker_mcb_types": ("in_a", "curve_class", "icn_ka"),
    "lv_fuse_link_types": ("in_a", "fuse_class", "size", "breaking_capacity_ka"),
    "lv_rcd_types": ("in_a", "i_delta_n_a", "rcd_type", "t_a_s"),
    "bess_battery_types": (
        "chemistry", "capacity_kwh", "nominal_voltage_dc_v", "c_rate",
    ),
    "surge_arrester_types": (
        "u_m_kv", "mcov_kv", "u_rated_kv", "u_residual_at_10ka_kv", "tov_10s_kv",
    ),
    "shunt_capacitor_types": ("rated_mvar", "rated_kv"),
    "overhead_conductor_types": (
        "oznaczenie", "przeznaczenie", "cross_section_mm2", "srednica_mm",
        "r20_dc_ohm_per_km", "max_temperature_c",
    ),
    "synchronous_generator_types": ("rated_mva", "rated_kv"),
    "protection_device_types": ("name_pl",),
    "protection_curves": ("name_pl", "curve_kind"),
    "protection_setting_templates": ("name_pl",),
    "ptpiree_generator_certificates": ("manufacturer", "model"),
    "lv_cable_types": ("u_n_kv", "r_ohm_per_km", "x_ohm_per_km", "i_max_a", "cross_section_mm2"),
    "load_types": ("name", "p_kw", "q_kvar"),
    "pv_inverter_types": ("name", "s_n_kva", "p_max_kw", "un_kv"),
    "bess_inverter_types": ("name", "s_n_kva", "p_charge_kw", "p_discharge_kw", "e_kwh", "un_kv"),
    "karty_widmowe": ("urzadzenie_ref",),
}


def _brak(wartosc: Any) -> bool:
    return wartosc is None or isinstance(wartosc, str) and not wartosc.strip()


def zbuduj_raport_kompletnosci() -> dict[str, Any]:
    """Zestawienie wszystkich realnych rodzin CatalogRepository.

    Rekordy TESTOWY/benchmark nie są materiałem projektowym, lecz pozostają
    widoczne w licznikach. Rekordy REFERENCYJNY są oceniane jako modele
    referencyjne, nie jako potwierdzone wyroby producenta.
    """
    repo = get_default_mv_catalog()
    raport: dict[str, Any] = {"rodziny": {}, "braki_wymagane": [], "razem": 0}
    for rodzina in sorted(MINIMUM):
        obiekty = getattr(repo, rodzina, {})
        if not isinstance(obiekty, dict):
            continue
        wymagane = MINIMUM[rodzina]
        statusy: Counter[str] = Counter()
        opcjonalne: Counter[str] = Counter()
        braki = []
        for obiekt in obiekty.values():
            typ_id = str(getattr(obiekt, "id", "?"))
            status = str(getattr(obiekt, "catalog_status", "NIEOKRESLONY"))
            statusy[status] += 1
            dane = {pole.name: getattr(obiekt, pole.name) for pole in fields(obiekt)} if is_dataclass(obiekt) else vars(obiekt)
            for pole, wartosc in dane.items():
                if pole not in wymagane and _brak(wartosc):
                    opcjonalne[pole] += 1
            if status == "TESTOWY" or typ_id.startswith("bench_"):
                continue
            brakujace = [pole for pole in wymagane if _brak(dane.get(pole))]
            if brakujace:
                braki.append({"id": typ_id, "pola": brakujace})
        raport["rodziny"][rodzina] = {
            "rekordy": len(obiekty),
            "minimum": list(wymagane),
            "braki_minimum": len(braki),
            "statusy": dict(sorted(statusy.items())),
            "pola_opcjonalne_niewypelnione": dict(sorted(opcjonalne.items())),
        }
        raport["braki_wymagane"].extend(
            {"rodzina": rodzina, **brak} for brak in braki
        )
        raport["razem"] += len(obiekty)
    raport["braki_wymagane"].sort(key=lambda x: (x["rodzina"], x["id"]))
    raport["suma_brakow_minimum"] = len(raport["braki_wymagane"])
    return raport


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--strict", action="store_true", help="Zwróć kod 1 przy brakach minimum")
    parser.add_argument("--summary", action="store_true", help="Tylko liczby per rodzina")
    args = parser.parse_args()
    raport = zbuduj_raport_kompletnosci()
    if args.summary:
        raport = {
            "razem": raport["razem"],
            "suma_brakow_minimum": raport["suma_brakow_minimum"],
            "rodziny": {
                k: {"rekordy": v["rekordy"], "braki_minimum": v["braki_minimum"]}
                for k, v in raport["rodziny"].items()
            },
        }
    print(json.dumps(raport, ensure_ascii=False, indent=2, sort_keys=True))
    return int(args.strict and raport["suma_brakow_minimum"] > 0)


if __name__ == "__main__":
    raise SystemExit(main())
