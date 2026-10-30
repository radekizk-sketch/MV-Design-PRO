"""Udokumentowane profile CT/VT: ENEA Operator 2024 i ABB UDZ 24-1.

Kontrakt: profile ENEA są wymaganiami układu, NIE kartą gotowego wyrobu.
Rekord rodziny ABB to konfiguracja dopuszczona przez zakres karty producenta,
NIE konkretny numer zamówieniowy bez indywidualnej karty wykonania.

Nie wolno:
* przenosić FS5 na rdzeń zabezpieczeniowy (5P);
* utożsamiać uzwojenia 3P z otwartym trójkątem 3U0;
* tworzyć własnego Ith/Rct konkretnego ABB, gdy karty go nie podają.
"""
from __future__ import annotations

from math import sqrt
from typing import Any

ENEA_METERING_SOURCE = (
    "ENEA Operator, Układy pomiarowe energii elektrycznej, wersja 05.2022-2,"
    " obowiązuje od 02.04.2024, załącznik 5 A-F, s.25-31; "
    "https://www.operator.enea.pl/media/698/"
    "uklady-pomiarowe-energii-elektrycznej-obowiazuje-od-02042024pdf.pdf"
)
ENEA_IRIESD_SOURCE = (
    "ENEA Operator, IRiESD v2.3, pkt II.4.7.1.13-15, "
    "FS<=5 w nowych układach, 25-100% obciążenia wtórnego, "
    "wyjątek pozostawienia FS>5 tylko w modernizowanych układach: "
    "https://operator.enea.pl/uploads-ev2/Operator/teczka-prasowa/"
    "Komunikaty/2024/15.11.2024/5_RiESD_tj.%20od%201.07.2025_zmiany_pkt2i3_KA38.pdf"
)
ABB_UDZ24_SOURCE = (
    "ABB, UDZ 24-1 Indoor voltage transformer, 1VLC000774, "
    "Basic technical specifications, 24/50/125 kV, 1.9Un/8h; "
    "https://new.abb.com/medium-voltage/pl/aparatura/przekladniki-i-sensory/"
    "produkty/przekladniki-wnetrzowe-napieciowe-iec/"
    "przekladnik-napieciowy-jednobiegunowy-wnetrzowy-typu-udz-24-1"
)


def _enea_ct(
    *, annex: str, place: str, primary_a: int, burden_va: float,
    ith_ka: float, core_count: int, construction: str, local_metering: bool,
) -> dict[str, Any]:
    """Jeden wariant WYMAGAŃ danej przekładni — nie karta aparatu."""
    cores: list[dict[str, Any]] = [{
        "index": 1, "role": "BILLING",
        "accuracy_class": "0.2S", "burden_va": burden_va,
        "fs": 5.0, "secondary_a": 5.0,
        "source_kind": "ENEA_REQUIREMENT",
    }]
    if local_metering:
        cores.append({
            "index": 2, "role": "LOCAL_METERING",
            "accuracy_class": "0.2", "burden_va": 10.0,
            "fs": 5.0, "secondary_a": 5.0,
            "source_kind": "ENEA_REQUIREMENT",
        })
    # Katalog musi obsłużyć istniejące aparaty JEDNOZAKRESOWE (np. 200/5 A)
    # oraz nowe UKŁADY ENEA o przełączalnych 50–100 lub 200–400/5 A.
    # Sam brak przełącznika nie jest podstawą do oznaczenia wyrobu jako legacy:
    # funkcja CT (rozliczenie/EAZ), stan istniejący/nowy i warunki ENEA
    # są kryteriami ODREBNEJ oceny zgodności projektu, nie dostępności typu.
    podzielony_zakres = (
        (annex == "A" and place == "linia" and primary_a in (200, 400))
        or (annex == "B" and place == "pole-sieciowe" and primary_a in (50, 100, 200, 400))
        or (annex == "B" and place == "slup-wytworca" and primary_a in (50, 100))
        or (annex == "C" and place == "linia" and primary_a in (200, 400))
        or (annex == "D" and place == "pole-sieciowe" and primary_a in (200, 400))
    )
    # Historyczne identyfikatory pozostają, ale pojedyncza przekładnia jest
    # normalnym typem katalogowym, nie automatycznie aparatem przestarzałym.
    return {
        "id": f"ct-enea-2024-5{annex.lower()}-{place}-{construction.lower()}-{primary_a}-5-c{core_count}",
        "name": (
            f"CT jednozakresowy {primary_a}/5 A, {core_count} rdzenie — profil do weryfikacji"
            if podzielony_zakres else
            f"Profil ENEA 5/{annex} {place}: CT {primary_a}/5 A, {core_count} rdzenie, 0,2S FS5"
        ),
        "params": {
            "ratio_primary_a": float(primary_a),
            "ratio_secondary_a": 5.0,
            "accuracy_class": "0.2S",
            "burden_va": burden_va,
            "fs_safety_factor": 5.0,
            "ith_ka_1s": ith_ka,
            "idyn_ka_peak": ith_ka * 2.5,
            # ENEA 5/C–D: zestawienie 24/0,72 kV określa napięcie
            # sieci 24 kV oraz izolację samego toroidalnego CT 0,72 kV.
            # Zapisanie 24 jako Um toroidu fałszywie poświadczałoby izolację.
            "um_kv": 0.72 if construction == "RING_PHASE_CT" else 24.0,
            "construction": construction,
            "core_count": core_count,
            "secondary_cores": cores,
            "verification_status": "REFERENCYJNY",
            "catalog_status": "REFERENCYJNY_V1",
            "contract_version": "2.0",
            "source_reference": (
                "Wpis referencyjny MV-DESIGN-PRO dla aparatu jednozakresowego; "
                "ENEA 2024 dotyczy nowego/modernizowanego układu pomiarowego "
                "i nie potwierdza tej konfiguracji jako nowego standardowego CT; "
                + ENEA_METERING_SOURCE + " || " + ENEA_IRIESD_SOURCE
                if podzielony_zakres
                else ENEA_METERING_SOURCE + " || " + ENEA_IRIESD_SOURCE
            ),
            "verification_note": (
                f"WYMAGANIA ENEA zał. 5/{annex}, {place}, a nie produkt producenta. "
                f"{core_count} rdzeni wynikają ze schematu przekładni; "
                "podano wyłącznie parametry rdzeni POMIAROWYCH, które "
                "określa tabela ENEA. Rdzenie pozostałe należy skonfigurować "
                "wg standardu pola oraz karty zamawianego wyrobu, bez "
                "automatycznego 5P20/FS dla nieznanych rdzeni. "
                "Ith jest wartością WYMAGANĄ, nie wynikiem badania egzemplarza. "
                + ("ENEA 5/C-D: 24/0,72 kV to sieć/izolacja toroidu; "
                   if construction == "RING_PHASE_CT" else "") + 
                "Idyn=2,5×Ith jest wartością pochodną do weryfikacji. "
                "FS<=5 dotyczy nowych rozliczeniowych CT. "
                "Dobór sprawdzić względem mocy umownej, obciążenia wtórnego, "
                "klasy i warunków przyłączenia."
                + (
                    " POJEDYNCZA PRZEKŁADNIA JEST POPRAWNYM RODZAJEM APARATU: "
                    "w istniejącej stacji lub obwodach EAZ można spotkać "
                    "200/5 albo 400/5 A, niezależnie od typów przełączalnych. "
                    "Ten identyfikator jest profilem REFERENCYJNYM, "
                    "nie dowodem zgodności z nowym układem rozliczeniowym ENEA. "
                    "Aktualny standard ENEA 5/A-D przewiduje tam m.in. "
                    "50–100 lub 200–400/5 A. Projektant sprawdza "
                    "rzeczywistą tabliczkę, dokumentację i warunki modernizacji. "
                    "Nie dopisywać zaczepów do aparatu, który ich nie ma."
                    if podzielony_zakres else ""
                )
            ),
        },
    }


def get_all_enea_ct_profiles() -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    # Zał. 5/B: sieciowe, pola EOP/odbiorca lub odbiorca-wytwórca
    for primary, ith in ((50, 8.0), (100, 8.0), (200, 8.0), (400, 8.0)):
        for cores in (2, 3):
            records.append(_enea_ct(
                annex="B", place="pole-sieciowe", primary_a=primary,
                burden_va=5.0, ith_ka=ith, core_count=cores,
                construction="SUPPORT", local_metering=False,
            ))
    # Zał. 5/B: przekładniki na słupach linii SN (odbiorca/wytwórca)
    for primary, ith in ((5, 2.0), (15, 8.0)):
        records.append(_enea_ct(
            annex="B", place="slup-odbiorca", primary_a=primary,
            burden_va=5.0, ith_ka=ith, core_count=1,
            construction="SUPPORT", local_metering=False,
        ))
    for primary in (50, 100):
        records.append(_enea_ct(
            annex="B", place="slup-wytworca", primary_a=primary,
            burden_va=5.0, ith_ka=8.0, core_count=1,
            construction="SUPPORT", local_metering=False,
        ))
    # Zał. 5/A: rozdzielcze wsporcze, BKR, linie, transformator
    for count in (2, 3):
        records.append(_enea_ct(
            annex="A", place="bkr", primary_a=100,
            burden_va=10.0, ith_ka=16.0, core_count=count,
            construction="SUPPORT", local_metering=(count == 3),
        ))
    for primary in (200, 400):
        for count in (2, 3, 4):
            records.append(_enea_ct(
                annex="A", place="linia", primary_a=primary,
                burden_va=10.0, ith_ka=16.0, core_count=count,
                construction="SUPPORT", local_metering=(count >= 3),
            ))
    for primary in (800, 1000, 1200, 1600):
        records.append(_enea_ct(
            annex="A", place="transformator", primary_a=primary,
            burden_va=10.0, ith_ka=16.0, core_count=4,
            construction="SUPPORT", local_metering=True,
        ))
    # Zał. 5/C: toroidalne rozdzielcze (Um w standardzie 24/0,72)
    for count in (2, 3):
        records.append(_enea_ct(
            annex="C", place="bkr", primary_a=100,
            burden_va=10.0, ith_ka=16.0, core_count=count,
            construction="RING_PHASE_CT", local_metering=(count == 3),
        ))
    for primary in (200, 400):
        # Zał. 5/C dopuszcza także wariant 200–400/5 z jednym rdzeniem.
        records.append(_enea_ct(
            annex="C", place="linia", primary_a=primary,
            burden_va=10.0, ith_ka=16.0, core_count=1,
            construction="RING_PHASE_CT", local_metering=False,
        ))
        for count in (2, 3):
            records.append(_enea_ct(
                annex="C", place="linia", primary_a=primary,
                burden_va=10.0, ith_ka=16.0, core_count=count,
                construction="RING_PHASE_CT", local_metering=(count == 3),
            ))
    for primary in (800, 1200):
        records.append(_enea_ct(
            annex="C", place="transformator", primary_a=primary,
            burden_va=10.0, ith_ka=16.0, core_count=4,
            construction="RING_PHASE_CT", local_metering=True,
        ))
    # Zał. 5/D: toroidalne SIECIOWE, oddzielne od Ferrantiego 3I0
    for primary in (200, 400):
        records.append(_enea_ct(
            annex="D", place="pole-sieciowe", primary_a=primary,
            burden_va=5.0, ith_ka=8.0, core_count=2,
            construction="RING_PHASE_CT", local_metering=False,
        ))
    return records


def _enea_vt(*, annex: str, voltage_kv: int) -> dict[str, Any]:
    # Tabele 5/E-F: 6, 15, 20 kV, trzy napięcia 0,1/sqrt(3) wtórne.
    # Trzecie uzwojenie NIE JEST dowodem otwartego trójkąta.
    primary = voltage_kv * 1000.0 / sqrt(3.0)
    secondary = 100.0 / sqrt(3.0)
    secondary_windings = [
        {"index": 1, "role": "BILLING", "rated_voltage_v": secondary,
         "accuracy_class": "0.2", "burden_va_min": 0.0, "burden_va_max": 10.0,
         "connection": "STAR_PER_PHASE_BANK"},
        {"index": 2, "role": "LOCAL_OR_PROTECTION", "rated_voltage_v": secondary,
         "accuracy_class": "0.5" if annex == "E" else None,
         "burden_va": 7.5 if annex == "E" else None,
         "connection": "TO_CONFIRM"},
        {"index": 3, "role": "UNSPECIFIED", "rated_voltage_v": secondary,
         "connection": "TO_CONFIRM"},
    ]
    return {
        "id": f"vt-enea-2024-5{annex.lower()}-{voltage_kv}kv-triple-starprofile",
        "name": f"Profil ENEA 5/{annex} VT {voltage_kv}/√3 kV / 0,1/√3 kV ×3",
        "params": {
            "ratio_primary_v": primary, "ratio_secondary_v": secondary,
            "accuracy_class": "0.2", "burden_va": 10.0,
            "um_kv": 7.2 if voltage_kv == 6 else 24.0,
            "primary_connection": "PHASE_EARTH",
            # Annex 5/E-F nie potwierdza ani obecności, ani definitywnego
            # braku osobnego uzwojenia resztkowego w wersji wyrobu.
            "has_residual_winding": None,
            "secondary_windings": secondary_windings,
            "verification_status": "REFERENCYJNY",
            "catalog_status": "REFERENCYJNY_V1",
            "contract_version": "2.0",
            "source_reference": ENEA_METERING_SOURCE,
            "verification_note": (
                f"Profil wymagań ENEA, zał. 5/{annex}, nie karta wyrobu. "
                "Trzy wtórne napięcia 0,1/√3 kV nie oznaczają automatycznie "
                "otwartego trójkąta. Podano pierwszy tor 0–10 VA kl.0,2; "
                "pozostałe wtórne i konfigurację gwiazda/ochrona należy "
                "doprecyzować wg schematu pola. W tym profilu nie ma "
                "potwierdzonych danych osobnego uzwojenia 0,1/3 kV do 3U0; "
                "nie zastępować go klasą 3P."
            ),
        },
    }


def get_all_enea_vt_profiles() -> list[dict[str, Any]]:
    return [
        _enea_vt(annex=annex, voltage_kv=voltage)
        for annex in ("E", "F") for voltage in (6, 15, 20)
    ]


def _abb_udz24_profile(voltage_kv: int, mode: str) -> dict[str, Any]:
    primary = voltage_kv * 1000.0 / sqrt(3.0)
    secondary = 100.0 / sqrt(3.0)
    # Łączna moc przy klasie 0.2 nie może przekroczyć 50 VA w dwóch uzwojeniach.
    configs = {
        "meter02": ("0.2", 40.0, False),
        "meter02-residual3p": ("0.2", 20.0, True),
        "meter05-residual3p": ("0.5", 50.0, True),
    }
    metering_class, metering_va, residual = configs[mode]
    secondaries: list[dict[str, Any]] = [
        {"index": 1, "role": "METERING", "rated_voltage_v": secondary,
         "accuracy_class": metering_class, "burden_va": metering_va,
         "connection": "STAR_PER_PHASE_BANK"}
    ]
    if residual:
        secondaries.append({
            "index": 2, "role": "RESIDUAL_3U0",
            "rated_voltage_v": 100.0 / 3.0,
            "accuracy_class": "3P",
            "burden_va": 30.0,
            "connection": "OPEN_DELTA_THREE_PHASE_BANK",
        })
    return {
        "id": f"vt-abb-udz24-1-{voltage_kv}kv-{mode}",
        "name": f"ABB UDZ 24-1 {voltage_kv}/√3 kV, {mode} (konfiguracja)",
        "params": {
            "manufacturer": "ABB",
            "ratio_primary_v": primary, "ratio_secondary_v": secondary,
            "accuracy_class": metering_class, "burden_va": metering_va,
            "um_kv": 24.0, "rated_voltage_factor": 1.9,
            "voltage_factor_duration_s": 28800.0,
            "primary_connection": "PHASE_EARTH",
            "has_residual_winding": residual,
            "secondary_windings": secondaries,
            "verification_status": "CZESCIOWO_ZWERYFIKOWANY",
            "catalog_status": "REFERENCYJNY_V1",
            "contract_version": "2.0",
            "source_reference": ABB_UDZ24_SOURCE,
            "verification_note": (
                "ABB UDZ 24-1: konfiguracja DOBOROWA w zakresie katalogu rodziny, "
                "nie konkretny wariant dostawy z numerem zamówieniowym. "
                "Producent potwierdza 24/50/125 kV, Fv=1,9/8h, 0,2 (do 50 VA), "
                "0,5 (do 125 VA), dodatkowe 30VA/3P z 100/3 V. "
                "Dla 0,2 dwa obciążone uzwojenia mają sumę nie większą niż "
                "50 VA (20+30). Otwarty trójkąt to połączenie trzech "
                "UZWOJEŃ RESZTKOWYCH w zestawie 3 faz, a nie klasa 3P. "
                "Przed użyciem wymaga karty konkretnej konfiguracji."
            ),
        },
    }


def get_all_abb_udz_vt_profiles() -> list[dict[str, Any]]:
    return [
        _abb_udz24_profile(voltage, mode)
        for voltage in (6, 15, 20)
        for mode in ("meter02", "meter02-residual3p", "meter05-residual3p")
    ]


ABB_TPU_NAMEPLATE_SOURCE = (
    "ABB, Instructions for Installation, Use and Maintenance for Current and "
    "Voltage Transformers, 1VLM000610 rev.27, rys. 01 przykładowej tabliczki "
    "TPU 70.63, 2024, 100//1/1/1/5 A, 36/70/170 kV, Ith 16(1s) kA, Idyn 40 kA; "
    "https://library.e.abb.com/public/be6ececc53e049c7a172e37fc04a8453/"
    "Instruction_Current%20and%20Voltage%20Instrument%20Transformers_"
    "1VLM000610%20Rev.27%20en.pdf"
)


def get_abb_tpu_nameplate_example() -> list[dict[str, Any]]:
    """Dokładny przykład TABLICZKI ABB — nie dowód bieżącej dostępności handlowej.

    Rdzenie 1-4 i Ich/Idyn są podane indywidualnie na rys. 01 instrukcji ABB.
    Nie łączymy klasy rdzenia 5P20 z FS5 rdzenia rozliczeniowego.
    """
    return [{
        "id": "ct-abb-tpu70-63-tabliczka-przyklad-2024",
        "name": "ABB TPU 70.63 — udokumentowana tabliczka 100//1/1/1/5 A",
        "params": {
            "manufacturer": "ABB",
            "ratio_primary_a": 100.0,
            "ratio_secondary_a": 1.0,
            "accuracy_class": "0.2S",
            "burden_va": 10.0,
            "fs_safety_factor": 5.0,
            "ith_ka_1s": 16.0,
            "idyn_ka_peak": 40.0,
            "um_kv": 36.0,
            "construction": "SUPPORT",
            "core_count": 4,
            "secondary_cores": [
                {"index": 1, "role": "PROTECTION", "secondary_a": 1.0,
                 "accuracy_class": "5P20", "burden_va": 5.0, "rct_max_ohm": 1.0},
                {"index": 2, "role": "BILLING", "secondary_a": 1.0,
                 "accuracy_class": "0.2S", "burden_va": 10.0, "fs": 5.0,
                 "extended_current_percent": 120.0},
                {"index": 3, "role": "PROTECTION", "secondary_a": 1.0,
                 "accuracy_class": "5P40", "burden_va": 5.0, "rct_max_ohm": 2.0},
                {"index": 4, "role": "METERING", "secondary_a": 5.0,
                 "accuracy_class": "0.2S", "burden_va": 10.0, "fs": 5.0,
                 "extended_current_percent": 120.0},
            ],
            "verification_status": "CZESCIOWO_ZWERYFIKOWANY",
            "catalog_status": "REFERENCYJNY_V1",
            "contract_version": "2.0",
            "source_reference": ABB_TPU_NAMEPLATE_SOURCE,
            "verification_note": (
                "Dane dosłownie z RYSUNKU TABLICZKI ABB TPU 70.63 (przykład "
                "dokumentacyjny, nie aktualna oferta ani karta zamówieniowa). "
                "Rct<=1 Ω dotyczy rdzenia 1, Rct<=2 Ω rdzenia 3 — nie "
                "są rezystancjami rdzeni 2 i 4. 36 kV to Um WYROBU; "
                "nie utożsamiać z katalogowym 24 kV ENEA. "
                "Do zamówienia wymagana osobna karta aktualnej konfiguracji."
            ),
        },
    }]
