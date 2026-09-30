#!/usr/bin/env python3
"""Rdzenie zamrożone (bramka właściciela B-01) — JEDNA wiążąca lista plików.

Treść: `STAN_REPO.md` §2 („Rdzenie FROZEN (B-01)"). Plik z tej listy zmienia się wyłącznie
na podstawie decyzji właściciela (OD-…/O-…) nazwanej w karcie. Wszystkie POZOSTAŁE pliki
`network_model/solvers/**` NIE są rdzeniami B-01 — edytuje się je jak każdy solver (WHITE BOX,
testy, determinizm). Powód istnienia listy: trzy karty z rzędu (2026-09-24) uznały cały katalog
`network_model/solvers/**` za zamrożony i zostawiły w nim instancje naprawianej klasy
(`cable_ampacity_derating.py`, `state_estimation_wls.py`, `fault_loop_builder.py`, literały
w 35 plikach) z uzasadnieniem „B-01", którego lista właściciela nie daje.

Kontrakty wyników (reguła 6 CLAUDE.md: `ShortCircuitResult`, `PowerFlowResult`) obowiązują
niezależnie od tej listy: zmiana wyłącznie addytywna albo z podbiciem wersji.

Podzbiór pilnowany odciskiem SHA-256: `solver_diff_guard.PROTECTED_FILES`. Samotest
`test_rdzenie_b01.py` przypina, że jest on podzbiorem tej listy, że każdy wpis wskazuje
istniejący plik albo katalog i że dokumenty wskazujące granicę B-01 odsyłają do tego pliku.
"""

from __future__ import annotations

#: Ścieżki względem `backend/src`; wpis zakończony `/` obejmuje cały katalog.
RDZENIE_B01: dict[str, tuple[str, ...]] = {
    "IEC 60909 (3F/2F/1F, MAX/MIN, wkłady)": (
        "network_model/solvers/short_circuit_iec60909.py",
        "network_model/solvers/short_circuit_core.py",
        "network_model/solvers/short_circuit_contributions.py",
    ),
    "Rozpływ NR/GS/FD": (
        "network_model/solvers/power_flow_newton.py",
        "network_model/solvers/power_flow_newton_internal.py",
        "network_model/solvers/power_flow_gauss_seidel.py",
        "network_model/solvers/power_flow_fast_decoupled.py",
    ),
    "Zabezpieczenia IEC 60255": ("network_model/solvers/protection_iec60255.py",),
    "NC RfG / PTPiREE (T01–T20) z profilami regulacyjnymi": (
        "network_model/solvers/ncrfg_ptpiree/",
        "catalog/profiles/nc_rfg/",
    ),
    "FRT/HVRT": ("network_model/solvers/frt_hvrt/",),
    "Stabilność RMS": ("network_model/solvers/stability_rms/",),
    "Estymacja stanu WLS": ("network_model/solvers/state_estimation_wls.py",),
    "Stan fazowy SN": ("network_model/solvers/phase_state_sn.py",),
    "V12.6": ("network_model/solvers/v126_academic.py",),
}


def sciezki_b01() -> tuple[str, ...]:
    """Wszystkie wpisy listy w kolejności grup."""
    return tuple(sciezka for grupa in RDZENIE_B01.values() for sciezka in grupa)


def jest_rdzeniem_b01(sciezka_wzgledem_src: str) -> bool:
    """Czy plik (ścieżka względem `backend/src`) należy do rdzenia B-01."""
    sciezka = sciezka_wzgledem_src.replace("\\", "/")
    return any(
        sciezka == wpis or (wpis.endswith("/") and sciezka.startswith(wpis))
        for wpis in sciezki_b01()
    )


if __name__ == "__main__":
    for nazwa, grupa in RDZENIE_B01.items():
        print(f"{nazwa}:")
        for sciezka in grupa:
            print(f"  backend/src/{sciezka}")
