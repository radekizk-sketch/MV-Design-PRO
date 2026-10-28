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

Odcisk SHA-256 (`solver_diff_guard.PROTECTED_FILES`) obejmuje CAŁĄ listę — od decyzji B-01
partii integracji 9 jest jej rozwinięciem (wpis-katalog = każdy plik w nim), nie ręcznym
podzbiorem. Samotest `test_rdzenie_b01.py` przypina, że odcisk nie wychodzi poza listę, że
każdy wpis wskazuje istniejący plik albo katalog i że dokumenty wskazujące granicę B-01
odsyłają do tego pliku; `test_solver_diff_guard.py` — że odcisk jest rozwinięciem listy.
"""

from __future__ import annotations

#: Ścieżki względem `backend/src`; wpis zakończony `/` obejmuje cały katalog.
#: Wpis „Stabilność RMS" (`network_model/solvers/stability_rms/`) zdjęty razem z kasacją
#: solvera — decyzja B-01 z 2026-09-30 (delegacja właściciela, O-59), pozycja (i) planu A/B
#: §12.2; nawrót ścieżki pilnuje `legacy_public_path_guard.check_abp1_dynamika_resurrection`.
#: Grupa „IEC 60909" zmieniona decyzją B-01 pozycja (n) planu A/B (delegacja właściciela O-59,
#: odbiór przez sesję główną z niezależną weryfikacją; karta SC-IB-ITH-ZRODLA): I_b jako
#: symetryczny prąd wyłączeniowy IEC 60909-0:2016 rozdz. 9 (μ·q z `machine_sc_iec60909`),
#: addytywna składowa nieokresowa i_DC(t_b) (rozdz. 10), jedno źródło I_th (n = 1) także dla
#: toru dowodowego SC1
#: (`short_circuit_asymmetrical_quantities.py`, chroniony w `solver_boundary_guard`). Karta
#: TB-WARTOSC-ROBOCZA (ta sama pozycja (n)): t_b rozstrzygany PER PUNKT ZWARCIA (scenariusz
#: projektanta > pola lokalne > wartość robocza z pochodzeniem), brak t_b nie blokuje. Sankcje:
#: `solver_boundary_guard.SANCTIONED_CHANGES`; odcisk: `guard_references/solver_hashes.json`.
#: Grupa „IEC 60909" zmieniona warunkową zgodą B-01 właściciela z 2026-10-21 (karta
#: PROG-ZERA-WKLADOW, WYŁĄCZNIE klasa numerycznie pomijalnych wkładów gałęziowych): predykaty
#: list wkładów gałęziowych i śladu podziału prądu w obu torach (falownikowym i Thevenina)
#: z `<= 0` na jeden próg |I| < 1e-6 A (`PROG_WKLADU_POMIJALNEGO_A`, jedyna definicja
#: w `short_circuit_contributions.py`) + addytywne zestawienie `wklady_pominiete` (pole wyniku
#: exclude_none i krok śladu). Algorytmy IEC 60909, μ/q, t_b, c i tolerancje bez zmian;
#: wielkości główne korpusu golden bit w bit. Każda inna zmiana rdzenia = nowa decyzja.
#: Grupa „IEC 60909" zmieniona zgodą B-01 architekta (karta BEZ-POJEMNOSCI, WYŁĄCZNIE klasa
#: admitancji poprzecznych gałęzi w sieci zwarciowej): `build_zbus` buduje sieć zgodną
#: (i przeciwną, Z_2 = Z_1) budowniczym w trybie `siec_zwarciowa=True` — bez B/2 linii i kabli
#: (IEC 60909-0:2016 pkt 5.2 f) i 5.3.1, jedno źródło tekstu podstawy
#: `ybus.PODSTAWA_POMINIECIA_ADMITANCJI_POPRZECZNYCH`); krok śladu
#: `admitancje_poprzeczne_pominiete` (tylko gdy coś pominięto). Składowa zerowa (B0), rozpływ
#: i estymacja stanu bez zmian. Liczby sieci z B > 0 zmieniają się celowo (sonda w meldunku).
#: Grupa „IEC 60909" zmieniona zgodą B-01 architekta z 2026-10-22 (karta WKLAD-ZRODLA, wzorzec
#: GPZ H5, WYŁĄCZNIE wkład per źródło): addytywne pola wyniku `wklady_zrodel`
#: i `wklady_zrodel_slad` (exclude_none) — I_Q,k = Y_Q,k·Z_kf·I_k''(Th) (IEC 60909-0:2016 §4.2)
#: dla zasilań systemowych, szyn sztywnych i maszyn wirujących (admitancje ze stempla źródeł
#: budowniczego macierzy Y; karta nie zmienia `core/ybus.py`),
#: źródło z innej wyspy strukturalnie zerowe, jeden predykat progu, krok bilansu. Zero zmian
#: istniejących liczb (sonda bit w bit). Każda inna zmiana rdzenia = nowa decyzja.
#: Partia integracji obu kart: macierz bilansu wkładów źródeł budowana tym samym predykatem
#: `siec_zwarciowa=True` co `build_zbus` — człony poprzeczne bilansu wyłącznie z przekładni
#: poza-znamionowej (pojemności linii i kabli nie wchodzą do sieci zgodnej).
#: Grupa „IEC 60909" zmieniona zgodą B-01 architekta z 2026-10-22 (karta PODSTAWA-Q,
#: WYŁĄCZNIE pole addytywne): `zalozenia_zaniku` w wierszu wyniku i w kroku śladu „Ib" —
#: wpisy μ/q maszyn wyznaczone regułą o rodzaju źródła ZALOZENIE_INZYNIERSKIE (exclude_none;
#: bez takich wpisów wynik i ślad bit w bit). Zero zmian liczb.
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
