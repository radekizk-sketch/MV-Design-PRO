"""Audyt RZECZYWISTYCH luk w aktywnym katalogu MV-DESIGN-PRO.

Nie utożsamia braku nazwy pola w UI z brakiem fizycznej wartości.
Nie uznaje wszystkich opcjonalnych pól klasy dataclass za brak.
Nie dopisuje założeń do katalogu ani nie ingeruje w solver i gotowość.

Uruchomienie (z katalogu mv-design-pro):
    PYTHONPATH=backend/src python -m network_model.catalog.audyt_luk_technicznych
    PYTHONPATH=backend/src python -m network_model.catalog.audyt_luk_technicznych --pelny
    PYTHONPATH=backend/src python -m network_model.catalog.audyt_luk_technicznych --csv

Zakres: wszystkie rodziny z istniejącego MINIMUM plus dodatkowe zależności
fizyczne w wybranych rodzinach. Raport jest diagnostyczny — nie bramką.
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from collections import Counter
from dataclasses import dataclass
from typing import Any, Iterable

from .completeness_report import MINIMUM, _brak
from .repository import get_default_mv_catalog


# Tylko pola, których zależność od rodzaju aparatu jest uzasadniona.
# Część wartości jest potrzebna do DANEJ analizy, a nie do każdej analizy.
ANALIZY: dict[str, str] = {
    "r_ohm_per_km": "rozpływ / zwarcie trójfazowe",
    "x_ohm_per_km": "rozpływ / zwarcie trójfazowe",
    "c_nf_per_km": "rozpływ / prądy pojemnościowe",
    "b_us_per_km": "rozpływ",
    "r0_ohm_per_km": "zwarcie doziemne przy określonym układzie powrotnym",
    "x0_ohm_per_km": "zwarcie doziemne przy określonym układzie powrotnym",
    "b0_siemens_per_km": "analiza składowej zerowej",
    "rated_current_a": "obciążalność długotrwała",
    "i_max_a": "obciążalność długotrwała",
    "return_conductor_r_ohm_per_km_20c": "pętla zwarcia / SWZ",
    "return_conductor_ith_1s_a": "wytrzymałość zwarciowa żyły powrotnej",
    "short_circuit_temperature_c": "wytrzymałość cieplna",
    "ith_1s_a": "wytrzymałość cieplna",
    "jth_1s_a_per_mm2": "wytrzymałość cieplna",
    "ith_ka_1s": "wytrzymałość zwarciowa przekładnika CT",
    "idyn_ka_peak": "wytrzymałość dynamiczna przekładnika CT",
    "rct_ohm": "szczegółowa ocena nasycenia rdzenia EAZ",
    "i_th_ka": "wytrzymałość cieplna aparatu SN",
    "i_th_duration_s": "czas znamionowej wytrzymałości cieplnej",
    "i_dyn_ka": "wytrzymałość dynamiczna aparatu SN",
    "u_m_kv": "dobór izolacji aparatu",
    "breaking_capacity_ka": "zdolność wyłączania zwarcia",
    "i_cu_ka": "zdolność wyłączania zwarcia",
    "break_time_s": "koordynacja zabezpieczeń / czas wyłączenia",
    "k_sc": "udział źródła przekształtnikowego w zwarciu",
    "secondary_cores": "rozróżnienie rdzeni pomiarowych i EAZ",
    "burden_va": "obciążenie znamionowe obwodu wtórnego",
    "rated_voltage_factor": "trwałość pracy przekładnika napięciowego",
    "voltage_factor_duration_s": "czas dopuszczalnego współczynnika napięciowego",
    "sk3_mva": "zwarcie na podstawie warunków OSD",
    "ik3_ka": "zwarcie na podstawie warunków OSD",
    "rx_ratio": "zwarcie na podstawie warunków OSD",
}


@dataclass(frozen=True)
class Luka:
    rodzina: str
    typ_id: str
    pole: str
    rodzaj: str
    analiza: str
    powod: str

    def to_dict(self) -> dict[str, str]:
        return {
            "rodzina": self.rodzina,
            "id": self.typ_id,
            "pole": self.pole,
            "rodzaj": self.rodzaj,
            "analiza": self.analiza,
            "powod": self.powod,
        }


def _ma(obj: object, pole: str) -> bool:
    return not _brak(getattr(obj, pole, None))


def _istnieje_dodatni(obj: object, pole: str) -> bool:
    wartosc = getattr(obj, pole, None)
    return isinstance(wartosc, (float, int)) and not isinstance(wartosc, bool) and wartosc > 0


def _rdzen_eaz(obj: object) -> bool:
    rdzenie = getattr(obj, "secondary_cores", None) or ()
    if any(str(r.get("role", "")).upper() in ("PROTECTION", "EAZ")
           for r in rdzenie if isinstance(r, dict)):
        return True
    klasa = str(getattr(obj, "accuracy_class", "") or "").upper()
    return klasa.startswith(("5P", "10P", "PX", "TP"))


def _wylacznik(obj: object, pole: str) -> bool:
    rodzaj = str(getattr(obj, pole, "") or "").upper()
    return rodzaj in ("WYLACZNIK", "CIRCUIT_BREAKER", "RECLOSER", "REKLOZER")


def ocena_pozycji(rodzina: str, obj: object) -> list[Luka]:
    """Sprawdź typ bez podstawiania wartości i bez uznawania None za zero."""
    typ_id = str(getattr(obj, "id", "?"))
    if getattr(obj, "catalog_status", "") == "TESTOWY" or typ_id.startswith("bench_"):
        return []

    braki: list[Luka] = []
    widziane: set[str] = set()

    def dodaj(pole: str, rodzaj: str, powod: str) -> None:
        if pole in widziane or _ma(obj, pole):
            return
        widziane.add(pole)
        braki.append(Luka(rodzina, typ_id, pole, rodzaj,
                          ANALIZY.get(pole, "dobór / analiza właściwa dla rodzaju"),
                          powod))

    # Minimum istniejącego audytu. Dane OSD są wymagane przy analizie,
    # ale warunki konkretnego GPZ nie są parametrem producenta.
    for pole in MINIMUM.get(rodzina, ()):
        if rodzina == "source_system_types" and pole in ("sk3_mva", "ik3_ka", "rx_ratio"):
            dodaj(pole, "DANE_PROJEKTU",
                  "Parametr przyłączenia od OSD, nie cecha katalogowa aparatu")
        else:
            dodaj(pole, "BRAK_TECHNICZNY",
                  "Brak wartości z minimalnego kontraktu istniejącego katalogu")

    if rodzina == "cable_types":
        # Parametry zerowe nie są uniwersalną cechą kabla: w szczególności
        # droga powrotna i sposób połączenia ekranów są własnością instalacji.
        if _ma(obj, "z0_reference_bonding"):
            for pole in ("r0_ohm_per_km", "x0_ohm_per_km"):
                dodaj(pole, "BRAK_TECHNICZNY",
                      "Katalog deklaruje układ połączenia ekranu jako odniesienie Z0")
        if _istnieje_dodatni(obj, "return_conductor_cross_section_mm2"):
            dodaj("return_conductor_r_ohm_per_km_20c", "BRAK_TECHNICZNY",
                  "Żyła powrotna określona, lecz brak jej rezystancji")
            if not (_ma(obj, "return_conductor_ith_1s_a")
                    or _ma(obj, "return_conductor_jth_1s_a_per_mm2")):
                dodaj("return_conductor_ith_1s_a", "BRAK_TECHNICZNY",
                      "Brak Ith i jth żyły powrotnej — dwie alternatywne dane")
        if not (_ma(obj, "ith_1s_a") or _ma(obj, "jth_1s_a_per_mm2")):
            dodaj("ith_1s_a", "BRAK_TECHNICZNY",
                  "Brak Ith i jth żyły roboczej — dwie alternatywne dane")

    if rodzina == "line_types":
        if not (_ma(obj, "ith_1s_a") or _ma(obj, "jth_1s_a_per_mm2")):
            dodaj("ith_1s_a", "BRAK_TECHNICZNY",
                  "Brak Ith i jth przewodu dla kryterium cieplnego")
        dodaj("short_circuit_temperature_c", "BRAK_TECHNICZNY",
              "Brak temperatury granicznej przewodu przy zwarciu")
        # Nie wymagać r0/x0 od samego typu przewodu: zależą od geometrii.

    if rodzina == "mv_apparatus_types":
        for pole in ("i_th_ka", "i_th_duration_s", "i_dyn_ka"):
            dodaj(pole, "BRAK_TECHNICZNY",
                  "Brak znamionowej wytrzymałości zadeklarowanej przez producenta")
        if _wylacznik(obj, "device_kind"):
            for pole in ("breaking_capacity_ka", "break_time_s"):
                dodaj(pole, "BRAK_TECHNICZNY",
                      "Parametr dotyczy wyłącznika, a nie np. odłącznika")

    if rodzina == "switch_equipment_types":
        dodaj("u_m_kv", "BRAK_TECHNICZNY", "Najwyższe napięcie urządzenia")
        if _wylacznik(obj, "equipment_kind"):
            if not (_ma(obj, "i_cu_ka") or _istnieje_dodatni(obj, "ik_ka")):
                dodaj("i_cu_ka", "BRAK_TECHNICZNY",
                      "Brak zdolności wyłączania (i_cu/ik) wyłącznika")
        # Nie wymagać i_cu dla odłącznika i uziemnika.

    if rodzina == "ct_types":
        dodaj("ith_ka_1s", "BRAK_TECHNICZNY",
              "Brak wytrzymałości cieplnej CT potwierdzonej dla wariantu")
        dodaj("idyn_ka_peak", "BRAK_TECHNICZNY",
              "Brak wytrzymałości dynamicznej CT dla wariantu")
        if _rdzen_eaz(obj):
            dodaj("rct_ohm", "BRAK_TECHNICZNY",
                  "Rct potrzebne do szczegółowej oceny nasycenia rdzenia EAZ")
        if (getattr(obj, "core_count", None) or 0) > 1:
            dodaj("secondary_cores", "BRAK_TECHNICZNY",
                  "Wielordzeniowy CT bez osobnych danych uzwojeń")
        if not _ma(obj, "secondary_cores"):
            dodaj("burden_va", "BRAK_TECHNICZNY",
                  "Brak mocy rdzenia; profil bez rozpisanych rdzeni")
        # primary_taps_a = None oznacza prawidłowy CT jednozakresowy.

    if rodzina == "vt_types":
        if not _ma(obj, "secondary_windings"):
            dodaj("burden_va", "BRAK_TECHNICZNY",
                  "Brak mocy uzwojenia w VT bez rozpisanych uzwojeń")
        for pole in ("rated_voltage_factor", "voltage_factor_duration_s"):
            dodaj(pole, "BRAK_TECHNICZNY",
                  "Brak danych do oceny podwyższonego napięcia")
        # 3P nie oznacza automatycznie otwartego trójkąta.

    if rodzina in ("pv_inverter_types", "bess_inverter_types", "converter_types"):
        # Raport nie przypisuje producentowi domyślnego k_sc=1.1 używanego
        # w pewnych ścieżkach solvera; liczy lukę w karcie produktu.
        if hasattr(obj, "k_sc"):
            dodaj("k_sc", "BRAK_TECHNICZNY",
                  "Brak zadeklarowanego wkładu zwarciowego przekształtnika")

    # W starych rekordach 0 bywa wartością zastępczą: samo is-not-None
    # nie dowodzi fizycznej kompletności. Osobna kategoria do sprawdzenia,
    # nie jest automatycznie równoznaczna z brakiem ani nową blokadą.
    zero_niedopuszczalne = {
        "cable_types": ("r_ohm_per_km", "rated_current_a",
                        "voltage_rating_kv", "cross_section_mm2"),
        "line_types": ("r_ohm_per_km", "rated_current_a",
                       "voltage_rating_kv", "cross_section_mm2"),
        "transformer_types": ("rated_power_mva", "voltage_hv_kv",
                              "voltage_lv_kv", "uk_percent"),
        "ct_types": ("ratio_primary_a", "ratio_secondary_a"),
        "vt_types": ("ratio_primary_v", "ratio_secondary_v"),
        "pv_inverter_types": ("s_n_kva", "p_max_kw", "un_kv"),
        "bess_inverter_types": ("p_charge_kw", "p_discharge_kw",
                                "e_kwh", "un_kv"),
    }
    for pole in zero_niedopuszczalne.get(rodzina, ()):
        if pole in widziane:
            continue
        wartosc = getattr(obj, pole, None)
        if isinstance(wartosc, (float, int)) and not isinstance(wartosc, bool) and wartosc == 0:
            braki.append(Luka(rodzina, typ_id, pole,
                              "ZERO_DO_WERYFIKACJI",
                              ANALIZY.get(pole, "dobór"),
                              "Zerowa wartość znamionowa nie opisuje "
                              "rzeczywistego wyrobu — sprawdź źródło"))

    return braki


def zbuduj_raport_luk_technicznych(
    katalog: object | None = None,
) -> dict[str, Any]:
    katalog = katalog or get_default_mv_catalog()
    wyniki: list[Luka] = []
    liczby: dict[str, int] = {}
    statusy: dict[str, dict[str, int]] = {}
    for rodzina in sorted(MINIMUM):
        obiekty = getattr(katalog, rodzina, {})
        if not isinstance(obiekty, dict):
            continue
        liczby[rodzina] = len(obiekty)
        statusy[rodzina] = dict(sorted(
            Counter(str(getattr(o, "catalog_status", "NIEOKRESLONY"))
                    for o in obiekty.values()).items()
        ))
        for o in obiekty.values():
            wyniki.extend(ocena_pozycji(rodzina, o))

    wyniki.sort(key=lambda luka: (luka.rodzina, luka.pole, luka.typ_id, luka.rodzaj))
    grupy: Counter[tuple[str, str, str, str]] = Counter(
        (r.rodzina, r.pole, r.rodzaj, r.analiza) for r in wyniki
    )
    macierz = [{
        "rodzina": rodzina, "pole": pole, "rodzaj": rodzaj,
        "analiza": analiza, "liczba_pozycji": ile,
        "liczba_typow_w_rodzinie": liczby[rodzina],
    } for (rodzina, pole, rodzaj, analiza), ile in sorted(grupy.items())]

    return {
        "zrodlo": "CatalogRepository — rzeczywiste zmaterializowane pozycje",
        "zakres": ("MINIMUM (wszystkie rodziny) + techniczne pola warunkowe "
                   "kabli, linii, CT, VT, aparatury i przekształtników"),
        "uwaga": ("Luka techniczna dotyczy wskazanej analizy. Nie jest "
                  "automatycznie blokadą użycia typu ani wszystkich obliczeń. "
                  "Liczba 136 dotyczyła etykiet UI, nie pustych parametrów."),
        "liczba_pozycji": sum(liczby.values()),
        "rodziny": liczby,
        "statusy": statusy,
        "liczba_pustych_pol": sum(r.rodzaj in ("BRAK_TECHNICZNY", "DANE_PROJEKTU") for r in wyniki),
        "liczba_zerowych_do_weryfikacji": sum(r.rodzaj == "ZERO_DO_WERYFIKACJI" for r in wyniki),
        "liczba_brakow_technicznych": sum(r.rodzaj == "BRAK_TECHNICZNY" for r in wyniki),
        "liczba_danych_projektu": sum(r.rodzaj == "DANE_PROJEKTU" for r in wyniki),
        "macierz": macierz,
        "pozycje": [r.to_dict() for r in wyniki],
    }


def main(argv: Iterable[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--pelny", action="store_true",
                   help="Dołącz poszczególne identyfikatory urządzeń")
    p.add_argument("--csv", action="store_true",
                   help="Wypisz tabelę kategoria/pole/liczba pozycji")
    args = p.parse_args(argv)
    raport = zbuduj_raport_luk_technicznych()
    if args.csv:
        writer = csv.DictWriter(sys.stdout, fieldnames=(
            "rodzina", "pole", "rodzaj", "analiza",
            "liczba_pozycji", "liczba_typow_w_rodzinie"))
        writer.writeheader()
        writer.writerows(raport["macierz"])
    else:
        if not args.pelny:
            raport.pop("pozycje")
        print(json.dumps(raport, sort_keys=True, ensure_ascii=False, indent=2))
    return 0  # AUDYT nie blokuje projektowania ani publikowania typu.


if __name__ == "__main__":
    raise SystemExit(main())
