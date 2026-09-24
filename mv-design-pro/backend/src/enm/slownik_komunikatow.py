"""Słownik komunikatów operacji — polskie nazwy pól, wartości i elementów (karta #142).

PO CO. Komunikat operacji (błąd, ostrzeżenie, podpowiedź naprawy, zgłoszenie gotowości)
czyta projektant, który nie zna kontraktu API. Nazwa pola kontraktu
(``apparatus_catalog_ref``), kod wartości (``NAPIECIA_SZYN``, ``RATIO``) i identyfikator
elementu (``ref_id``) zostają w maszynowej części odpowiedzi (``error_code``,
``element_ref``) — front mapuje po nich błąd na pole formularza i element schematu.
Treść dla człowieka niesie nazwę pola formularza, nazwę wartości i nazwę elementu z modelu.

JEDNO ŹRÓDŁO. Każda nazwa pola kontraktu, której używa treść komunikatu, pochodzi z
``NAZWY_POL_KONTRAKTU_PL`` (słowa jak w kreatorach frontu). Mapy wartości, które już istnieją
w systemie, są reużyte, nie kopiowane: role pól SN (``domain_operations.nazwa_roli_pola_sn``),
typy punktu neutralnego, układy uziemienia ekranu i role uziemnika
(``network_model.core.uziemienie``). Tu żyją wyłącznie mapy, których nie było nigdzie.

Moduł nie importuje nic z ``enm`` — liść grafu importów dla obu plików operacji,
walidatora i warstwy API.

Strażnik klasy: ``tests/enm/test_komunikaty_operacji_bez_kodow.py`` (AST na literałach
i f-stringach modułów komunikatów operacji + wykonanie operacji w iloczynie cech).
"""

from __future__ import annotations

import re
from collections.abc import Iterable, Mapping

from network_model.catalog.types import etykieta_pola_katalogu_pl, nazwa_kategorii_katalogu_pl
from pydantic import ValidationError

# ---------------------------------------------------------------------------
# Nazwy pól kontraktu operacji → nazwa pola formularza
# ---------------------------------------------------------------------------

#: Klucz pola kontraktu operacji → nazwa pola formularza, jak widzi ją projektant.
#: Klucz ``"kontekst:pole"`` nadpisuje nazwę ogólną, gdy formularz w tym kontekście nazywa
#: pole inaczej; kontekstem jest operacja (zaciski pierścienia to „Zacisk A/B", a te same
#: klucze w aparacie nN to „Szyna od/do") albo sekcja formularza (``catalog_ref`` w sekcji
#: ``der_topology.block_transformer`` to „Transformator blokowy") — jedna mapa,
#: rozstrzygnięcie deterministyczne: najpierw wpis kontekstu, potem wpis ogólny.
#: Słowa = etykiety kreatorów ``frontend/src/ui2/kreatory``.
NAZWY_POL_KONTRAKTU_PL: dict[str, str] = {
    "a_p": "Udział stałoimpedancyjny P (a_P)",  # odbior/strings.ts zipAP
    "a_q": "Udział stałoimpedancyjny Q (a_Q)",  # odbior/strings.ts zipAQ
    "accuracy_class": "Klasa dokładności",  # pomiar/strings.ts klasa
    "active_power_control_enabled": "Regulacja mocy czynnej",  # ui2/oze/ncrfg/strings.ts ETYKIETY_FLAG_DEKLARACJI
    "apparatus_catalog_ref": "Aparat pola",  # stacja/strings.ts aparatPola
    "b_p": "Udział stałoprądowy P (b_P)",  # odbior/strings.ts zipBP
    "b_q": "Udział stałoprądowy Q (b_Q)",  # odbior/strings.ts zipBQ
    "bay_ref": "Pole SN",  # pomiar/strings.ts poleSn; przekaznik/strings.ts poleSn
    "bess_operation_mode_refs": "Tryb pracy magazynu",  # zrodlo-oze/strings.ts bessTryb
    "black_start_capable": "Zdolność rozruchu autonomicznego",  # ui2/oze/ncrfg/strings.ts ETYKIETY_FLAG_DEKLARACJI
    "black_start_required": "Wymagany rozruch autonomiczny",  # ui2/oze/ncrfg/strings.ts ETYKIETY_FLAG_DEKLARACJI
    "blocking_transformer_ref": "Transformator blokowy",  # zrodlo-oze/strings.ts transformator
    "burden_va": "Moc obciążeniowa",  # pomiar/strings.ts burden
    "bus_nn_ref": "Szyna nN",  # pole-nn/strings.ts szyna
    "c_p": "Udział stałomocowy P (c_P)",  # odbior/strings.ts zipCP
    "c_q": "Udział stałomocowy Q (c_Q)",  # odbior/strings.ts zipCQ
    "cable_laying_conditions": "Warunki ułożenia kabla",  # zrodlo-oze/strings.ts doborWarunkiUlozenia
    "cable_laying_conditions.ambient_temperature_c": "Temperatura otoczenia",  # odcinek-nn/strings.ts temperatura
    "cable_laying_conditions.circuit_count": "Liczba obwodów w wiązce/wykopie",  # odcinek-nn/strings.ts liczbaObwodow
    "cable_laying_conditions.environment": "Środowisko ułożenia",  # odcinek-nn/strings.ts srodowisko
    "cable_laying_conditions.insulation": "Izolacja żyły",  # odcinek-nn/strings.ts izolacja
    "cable_laying_conditions.soil_thermal_resistivity_km_w": "Rezystywność cieplna gruntu",  # odcinek-nn/strings.ts rezystywnoscGruntu
    "assign_catalog_to_element:catalog_item_id": "Identyfikator pozycji katalogowej",  # przypisanie-katalogu/strings.ts identyfikator
    "assign_catalog_to_element:catalog_namespace": "Przestrzeń katalogowa",  # przypisanie-katalogu/strings.ts przestrzen
    "add_grid_source_sn:catalog_ref": "Typ źródła z katalogu",  # zrodlo/strings.ts katalogPole
    "add_nn_cable_segment:catalog_ref": "Typ kabla",  # odcinek-nn/strings.ts kabel
    "add_nn_section_coupler:catalog_ref": "Typ aparatu sprzęgła",  # rozdzielnica-nn/strings.ts sprzegloTyp
    "add_shunt_compensator_sn:catalog_ref": "Typ baterii z katalogu",  # kompensator/strings.ts typKatalog
    "add_surge_arrester_sn:catalog_ref": "Typ ogranicznika z katalogu",  # ogranicznik/strings.ts typKatalog
    "catalog_ref": "Typ z katalogu",  # magistrala/strings.ts typKatalog
    "connect_secondary_ring_sn:catalog_ref": "Typ odcinka pierścienia",  # pierscien/strings.ts typKatalog
    "insert_branch_pole_on_segment_sn:catalog_ref": "Typ słupa z katalogu",  # slup-odgalezny/strings.ts typKatalog
    "insert_section_switch_sn:catalog_ref": "Aparat łącznika z katalogu",  # lacznik/strings.ts typKatalog
    "insert_zksn_on_segment_sn:catalog_ref": "Wariant ZKSN z katalogu",  # zksn/strings.ts typKatalog
    "start_branch_segment_sn:catalog_ref": "Typ odcinka z katalogu",  # odgalezienie/strings.ts typKatalog
    "cease_generation_time_s": "Czas zaprzestania generacji na polecenie (T12) [s]",  # ui2/oze/ncrfg/formularz.ts ETYKIETY_POL_WEJSCIA
    "complete_bay_template_ref": "Katalogowe pole rodziny",  # stacja/strings.ts polaSzablon
    "connection_variant": "Sposób przyłączenia",  # zrodlo-oze/strings.ts wariant
    "control_mode": "Tryb regulacji mocy biernej",  # zrodlo-oze/strings.ts regulacja
    "add_nn_load:cos_phi": "Współczynnik mocy cosφ",  # odbior/strings.ts cosPhi
    "ct_catalog_ref": "Przekładnik prądowy (CT)",  # zrodlo-oze/strings.ts aparaturaCt
    "data_umowy_przylaczeniowej": "Data umowy przyłączeniowej (wersje warstw profilu)",  # ui2/oze/ncrfg/strings.ts dataUmowy
    "deklaracje_modulu": "Deklaracje modułu (testy T05, T10–T13, T16–T20)",  # ui2/oze/ncrfg/strings.ts deklaracjeTytul
    "der_topology.block_transformer:catalog_ref": "Transformator blokowy",  # zrodlo-oze/strings.ts doborPropTr (krok Dobór toru SN)
    "der_topology.mv_field_configuration:cable_catalog_ref": "Kabel SN",  # zrodlo-oze/strings.ts doborPropKabel (krok Dobór toru SN)
    "device_class": "Rodzaj aparatu",  # aparat-nn (wybór: wyłącznik / rozłącznik, bezpiecznik)
    "connect_secondary_ring_sn:dlugosc_m": "Długość odcinka",  # pierscien/strings.ts dlugosc
    "dlugosc_m": "Długość odcinka",  # magistrala/strings.ts dlugosc
    "start_branch_segment_sn:dlugosc_m": "Długość odgałęzienia",  # odgalezienie/strings.ts dlugosc
    "dynamic_model_ref": "Model dynamiczny urządzenia",  # zrodlo-oze/strings.ts aparaturaModelDynamiczny
    "earthing_role": "Rola uziemnika pola",  # pole/strings.ts rolaUziemnika
    "append_station_on_endpoint:endpoint_bus_ref": "Terminal końcowy",  # stacja/strings.ts umiejscowienieTerminal
    "f0_hz": "Częstotliwość odniesienia modelu obciążenia [Hz]",  # wielkość odniesienia ZIP (bez pola w kreatorze)
    "f_max_czas_s": "f> — czas [s]",  # ui2/oze/ncrfg/formularz.ts ETYKIETY_POL_NASTAW
    "f_max_hz": "f> — próg [Hz]",  # ui2/oze/ncrfg/formularz.ts ETYKIETY_POL_NASTAW
    "f_min_czas_s": "f< — czas [s]",  # ui2/oze/ncrfg/formularz.ts ETYKIETY_POL_NASTAW
    "f_min_hz": "f< — próg [Hz]",  # ui2/oze/ncrfg/formularz.ts ETYKIETY_POL_NASTAW
    "factory_configuration_ref": "Blok fabryczny",  # stacja/strings.ts blokWybor
    "factory_unit_index": "Jednostki bloku (skład stały)",  # stacja/strings.ts blokJednostkiTytul
    "feeder_ref": "Odpływ nN",  # odbior/strings.ts wierszOdplyw
    "add_nn_cable_segment:from_bus_ref": "Szyna źródłowa",  # odcinek-nn/strings.ts szynaZrodlowa
    "add_nn_switch_device:from_bus_ref": "Szyna od",  # aparat-nn/strings.ts szynaOd
    "connect_secondary_ring_sn:from_bus_ref": "Zacisk A",  # pierscien/strings.ts zaciskA
    "start_branch_segment_sn:from_ref": "Punkt startu",  # odgalezienie/strings.ts zrodloPunkt
    "funkcja_pomiaru": "Rodzaj pomiaru",  # pole/strings.ts rodzajPomiaru (jeden wybór funkcji i rodzaju)
    "gpz_section.bus_ref": "Szyna",  # ui/network-build/cards/GpzSectionsEditor.tsx
    "gpz_section.left_coupler_ref": "Sprzęgło z lewej",  # sekcja GPZ (bez pola w edytorze)
    "gpz_section.line_field_name": "Nazwa pola liniowego",  # zrodlo/strings.ts nazwaPola
    "gpz_section.name": "Nazwa",  # ui/network-build/cards/GpzSectionsEditor.tsx
    "gpz_section.order": "Porządek",  # ui/network-build/cards/GpzSectionsEditor.tsx
    "gpz_section.right_coupler_ref": "Sprzęgło z prawej",  # sekcja GPZ (bez pola w edytorze)
    "gpz_section.section_id": "ID sekcji",  # ui/network-build/cards/GpzSectionsEditor.tsx
    "grounding.r_ohm": "R uziemienia",  # zrodlo/strings.ts uziemienieR
    "add_grid_source_sn:grounding.type": "Uziemienie punktu neutralnego",  # zrodlo/strings.ts uziemienie
    "grounding.x_ohm": "X cewki",  # zrodlo/strings.ts uziemienieX
    "harmonic_thdu_percent": "Współczynnik THD napięcia [%]",  # ui2/oze/ncrfg/formularz.ts ETYKIETY_POL_WEJSCIA
    "has_disturbance_recorder": "Rejestrator zakłóceń",  # ui2/oze/ncrfg/strings.ts ETYKIETY_FLAG_DEKLARACJI
    "has_scada_communication": "Łączność SCADA operatora",  # ui2/oze/ncrfg/strings.ts ETYKIETY_FLAG_DEKLARACJI
    "add_transformer_sn_nn:hv_bus_ref": "Szyna SN (górne napięcie)",  # transformator/strings.ts hvBus
    "add_grid_source_sn:hv_voltage_kv": "Napięcie szyny 110 kV",  # zrodlo/strings.ts napiecieHv
    "hvrt_curve_ref": "Charakterystyka HVRT (przepięcie)",  # zrodlo-oze/strings.ts frtHvrt
    "ik3_min_ka": "Ik″min",  # zrodlo/strings.ts ik3Min
    "insert_station_on_segment_sn:insert_at": "Odległość stacji od początku odcinka [m]",  # stacja/strings.ts insertAt
    "island_operation_capable": "Zdolność pracy wyspowej",  # ui2/oze/ncrfg/strings.ts ETYKIETY_FLAG_DEKLARACJI
    "island_operation_required": "Wymagana praca wyspowa",  # ui2/oze/ncrfg/strings.ts ETYKIETY_FLAG_DEKLARACJI
    "k_pf": "Wrażliwość częstotliwościowa P (k_pf)",  # odbior/strings.ts zipKPf
    "k_qf": "Wrażliwość częstotliwościowa Q (k_qf)",  # odbior/strings.ts zipKQf
    "karty_widmowe_ref": "Karty widmowe urządzenia",  # karty widmowe wytwórcy (wiązanie katalogowe)
    "length_km": "Długość",  # odcinek-nn/strings.ts dlugosc
    "add_nn_cable_segment:length_m": "Długość",  # odcinek-nn/strings.ts dlugosc
    "length_m": "Długość",  # odcinek-nn/strings.ts dlugosc
    "add_transformer_sn_nn:lv_bus_ref": "Szyna nN (dolne napięcie)",  # transformator/strings.ts lvBus
    "lv_earthing_system": "Układ sieci nN",  # stacja/strings.ts uziemienieUklad
    "lvrt_curve_ref": "Charakterystyka LVRT (zanik napięcia)",  # zrodlo-oze/strings.ts frtLvrt
    "moc_przylaczeniowa_mw": "Moc przyłączeniowa (OSD)",  # ui2/spaces/projekt/strings.ts osdLimit
    "modul_istniejacy": "Moduł istniejący (art. 4 ust. 1 rozporządzenia 2016/631)",  # ui2/oze/ncrfg/strings.ts art4
    "n_parallel": "Liczba torów równoległych",  # odcinek-nn/strings.ts nParallel
    "nastawy_zabezpieczen": "Nastawy zabezpieczeń modułu (koordynacja statyczna)",  # ui2/oze/ncrfg/strings.ts nastawyTytul
    "nc_rfg_profile_ref": "Profil wymagań operatora",  # zrodlo-oze/strings.ts zgodnoscProfil
    "p_min_kw": "Moc minimalna [kW]",  # ui2/oze/ncrfg/formularz.ts ETYKIETY_POL_WEJSCIA
    "p_recovery_time_s": "Czas odbudowy mocy czynnej po zwarciu [s]",  # ui2/oze/ncrfg/formularz.ts ETYKIETY_POL_WEJSCIA
    "update_element_parameters:parameters": "Klucz",  # edycja-parametrow/strings.ts klucz
    "pf_curve_ref": "Statyzm P(f) / LFSM",  # zrodlo-oze/strings.ts statyzmPf
    "pk_kw": "Straty obciążeniowe Pk",  # ui/property-grid/field-definitions.ts pk_kw
    "power_factor": "Współczynnik mocy",  # zrodlo-dyspozycyjne/strings.ts cosfi
    "power_oscillation_damping_enabled": "Tłumienie kołysań mocy aktywne",  # ui2/oze/ncrfg/strings.ts ETYKIETY_FLAG_DEKLARACJI
    "power_oscillation_damping_required": "Wymagane tłumienie kołysań mocy",  # ui2/oze/ncrfg/strings.ts ETYKIETY_FLAG_DEKLARACJI
    "power_setpoint_mw": "Moc robocza P (nastawa)",  # zrodlo-oze/strings.ts mocRobocza
    "protection_catalog_ref": "Zabezpieczenie pola wytwórcy",  # zrodlo-oze/strings.ts aparaturaZabezpieczenie
    "przesuniecie_fazy_deg": "Skok wektora — próg [°]",  # ui2/oze/ncrfg/formularz.ts ETYKIETY_POL_NASTAW
    "q_max_mvar": "Q max (oddawanie, nadwzbudzenie)",  # zrodlo-oze/strings.ts qMax
    "q_min_mvar": "Q min (pobór, podwzbudzenie)",  # zrodlo-oze/strings.ts qMin
    "r_ohm_per_km": "Rezystancja R",  # magistrala/strings.ts paramR
    "ramp_rate_pct_per_min": "Szybkość zmiany mocy [%/min]",  # ui2/oze/ncrfg/formularz.ts ETYKIETY_POL_WEJSCIA
    "rated_power_kw": "Moc znamionowa",  # zrodlo-dyspozycyjne/strings.ts moc
    "ratio_primary_a": "Przekładnia pierwotna",  # pomiar/strings.ts przekladniaPierwotna (CT)
    "ratio_primary_v": "Napięcie pierwotne",  # pomiar/strings.ts przekladniaPierwotna (VT)
    "ratio_secondary_a": "Przekładnia wtórna",  # pomiar/strings.ts przekladniaWtorna (CT)
    "ratio_secondary_v": "Napięcie wtórne",  # pomiar/strings.ts przekladniaWtorna (VT)
    "reactive_current_gain": "Wzmocnienie prądu biernego k",  # ui2/oze/ncrfg/formularz.ts ETYKIETY_POL_WEJSCIA
    "add_nn_load:reactive_power_kvar": "Moc bierna Q (opcjonalnie)",  # odbior/strings.ts qOverride
    "reduction_generation_enabled": "Zmniejszenie generacji na polecenie",  # ui2/oze/ncrfg/strings.ts ETYKIETY_FLAG_DEKLARACJI
    "rocof_czas_s": "RoCoF — czas [s]",  # ui2/oze/ncrfg/formularz.ts ETYKIETY_POL_NASTAW
    "rocof_hz_s": "RoCoF — próg [Hz/s]",  # ui2/oze/ncrfg/formularz.ts ETYKIETY_POL_NASTAW
    "rodzaj_pomiaru": "Rodzaj pomiaru",  # pole/strings.ts rodzajPomiaru
    "rx_ratio_min": "Stosunek R/X (MIN)",  # zrodlo/strings.ts rxMin
    "screen_bonding": "Uziemienie ekranu kabla",  # magistrala/strings.ts ekranUziemienie
    "sk3_min_mva": "Sk″min",  # zrodlo/strings.ts sk3Min
    "sn_mva": "Moc znamionowa",  # transformator/strings.ts paramMoc
    "source_name": "Nazwa GPZ",  # zrodlo/strings.ts nazwa
    "source_technology": "Technologia",  # zrodlo-oze/strings.ts technologia
    "split_at_m": "Miejsce podziału [m od początku odcinka]",  # operacja podziału odcinka nN (bez kreatora)
    "station.construction_type": "Typ konstrukcji stacji",  # stacja/strings.ts konstrukcja
    "station.nn_voltage_kv": "Napięcie nN odbioru",  # stacja/strings.ts nnVoltage
    "station.station_type": "Rodzaj stacji",  # stacja/strings.ts typStacji
    "station_auxiliary.cos_phi": "cosφ potrzeb własnych",  # stacja/strings.ts potrzebyWlasneCosphi
    "add_nn_section_coupler:station_ref": "Rozdzielnica nN",  # rozdzielnica-nn/strings.ts stacja
    "stop_generation_enabled": "Zaprzestanie generacji na polecenie",  # ui2/oze/ncrfg/strings.ts ETYKIETY_FLAG_DEKLARACJI
    "set_normal_open_point:switch_ref": "Punkt normalnie otwarty (NOP)",  # pierscien/strings.ts nopTytul
    "tap_changer.control_mode": "Tryb sterowania",  # zrodlo/strings.ts oltcTryb
    "tap_changer.regulated_winding": "Regulowane uzwojenie",  # zrodlo/strings.ts oltcUzwojenie
    "tap_changer.regulation_type": "Rodzaj regulacji",  # zrodlo/strings.ts oltcTyp; transformator regTyp
    "add_nn_switch_device:to_bus_ref": "Szyna do",  # aparat-nn/strings.ts szynaDo
    "connect_secondary_ring_sn:to_bus_ref": "Zacisk B",  # pierscien/strings.ts zaciskB
    "add_grid_source_sn:transformer_catalog_ref": "Typ transformatora 110/SN z katalogu",  # zrodlo/strings.ts transformatorKatalog
    "insert_station_on_segment_sn:transformer_catalog_ref": "Typ transformatora z katalogu",  # stacja/strings.ts typKatalog
    "transformer_catalog_ref": "Typ transformatora z katalogu",  # transformator/strings.ts typKatalog
    "transformer_sn_mva": "Moc znamionowa Sn",  # zrodlo/strings.ts transformatorSn
    "tryb_pracy": "Tryb pracy przyłącza",  # ui2/spaces/projekt/strings.ts osdTrybPracy
    "u_max_czas_s": "U> — czas [s]",  # ui2/oze/ncrfg/formularz.ts ETYKIETY_POL_NASTAW
    "u_max_pu": "U> — próg [p.u. U_n]",  # ui2/oze/ncrfg/formularz.ts ETYKIETY_POL_NASTAW
    "u_min_czas_s": "U< — czas [s]",  # ui2/oze/ncrfg/formularz.ts ETYKIETY_POL_NASTAW
    "u_min_pu": "U< — próg [p.u. U_n]",  # ui2/oze/ncrfg/formularz.ts ETYKIETY_POL_NASTAW
    "add_grid_source_sn:u_set_pu": "Napięcie zadane szyny bilansującej",  # zrodlo/strings.ts uSetPu
    "u_set_pu": "Nastawa napięcia U",  # zrodlo-oze/strings.ts uSetPu
    "uhv_kv": "Napięcie GN",  # ui/property-grid/field-definitions.ts voltage_hv_kv
    "uk_percent": "Napięcie zwarcia uk",  # transformator/strings.ts paramUk
    "ulv_kv": "Napięcie DN",  # ui/property-grid/field-definitions.ts voltage_lv_kv
    "v0_pu": "Napięcie odniesienia modelu obciążenia [p.u.]",  # wielkość odniesienia ZIP (bez pola w kreatorze)
    "add_grid_source_sn:voltage_kv": "Napięcie SN",  # zrodlo/strings.ts napiecieSn
    "add_nn_distribution_board:voltage_kv": "Napięcie znamionowe",  # rozdzielnica-nn/strings.ts napiecie
    "vt_catalog_ref": "Przekładnik napięciowy (VT)",  # zrodlo-oze/strings.ts aparaturaVt
    "wymagany_cos_phi": "Wymagany cosφ (OSD)",  # ui2/spaces/projekt/strings.ts osdCosPhi
    "x_ohm_per_km": "Reaktancja X",  # magistrala/strings.ts paramX
    "deklaracje_modulu:zrodlo_pl": "Źródło deklaracji",  # ui2/oze/ncrfg/strings.ts deklaracjeZrodlo
    "nastawy_zabezpieczen:zrodlo_pl": "Źródło nastaw",  # ui2/oze/ncrfg/strings.ts nastawyZrodlo
}


def nazwa_pola(klucz: str, operacja: str | None = None) -> str:
    """Nazwa pola formularza dla klucza kontraktu (``KeyError`` = brak wpisu w słowniku).

    ``operacja`` to kontekst formularza (operacja albo sekcja payloadu) — wpis
    ``"kontekst:klucz"`` ma pierwszeństwo przed wpisem ogólnym ``klucz``.
    Kompletność wpisów dla każdego wywołania w kodzie pilnuje test AST strażnika klasy —
    brak klucza nie może wyjść dopiero w ścieżce błędu u projektanta.
    """
    if operacja is not None:
        nazwa = NAZWY_POL_KONTRAKTU_PL.get(f"{operacja}:{klucz}")
        if nazwa is not None:
            return nazwa
    return NAZWY_POL_KONTRAKTU_PL[klucz]


def pole(klucz: str, operacja: str | None = None) -> str:
    """Nazwa pola formularza w cudzysłowie do wstawienia w zdanie: „Długość odcinka”."""
    return f"„{nazwa_pola(klucz, operacja)}”"


#: Rodzaj błędu walidacji kształtu danych (``pydantic`` ``error["type"]``) → treść dla
#: projektanta; ``{…}`` = granica z kontekstu błędu. Rodzaj spoza słownika = opis ogólny.
_OPISY_BLEDOW_WALIDACJI: dict[str, str] = {
    "greater_than": "musi być większa od {gt}",
    "greater_than_equal": "nie może być mniejsza od {ge}",
    "less_than": "musi być mniejsza od {lt}",
    "less_than_equal": "nie może być większa od {le}",
    "bool_type": "musi mieć wartość tak albo nie",
    "bool_parsing": "musi mieć wartość tak albo nie",
    "float_type": "musi być liczbą",
    "float_parsing": "musi być liczbą",
    "int_type": "musi być liczbą całkowitą",
    "int_parsing": "musi być liczbą całkowitą",
    "finite_number": "musi być liczbą skończoną",
    "string_type": "musi być tekstem",
    "string_too_short": "nie może być puste",
    "missing": "jest wymagana",
    "extra_forbidden": "nie należy do tego formularza",
    "date_type": "musi być datą w zapisie RRRR-MM-DD",
    "date_parsing": "musi być datą w zapisie RRRR-MM-DD",
    "date_from_datetime_parsing": "musi być datą w zapisie RRRR-MM-DD",
    "list_type": "musi być listą",
    "tuple_type": "musi być listą",
    "dict_type": "ma niepoprawny kształt danych",
    "model_type": "ma niepoprawny kształt danych",
    "model_attributes_type": "ma niepoprawny kształt danych",
}


#: Identyfikator reguły kontraktu dziedziny w treści odmowy (``[widmo.niepuste] …``) —
#: ten sam zapis co ``dziedziny.kanon.naruszenie``.
_IDENTYFIKATOR_REGULY = re.compile(r"\[[a-z_]+\.[a-z_]+\]\s*")


def opis_bledu_walidacji(blad: ValidationError, operacja: str | None = None) -> str:
    """Błąd walidacji kształtu danych (``pydantic.ValidationError``) po polsku (karta #142).

    Każda pozycja: nazwa pola formularza (słownik pól; ``operacja`` wybiera nazwę
    kontekstową) i opis rodzaju błędu. Surowa ścieżka pola, angielski opis biblioteki
    i klucz spoza słownika nie trafiają do treści — pole spoza słownika to „wartość".
    Błąd walidatora modelu (``value_error``) niesie już zdanie po polsku — idzie wprost.
    """
    opisy: list[str] = []
    for pozycja in blad.errors():
        kontekst = pozycja.get("ctx") or {}
        rodzaj = str(pozycja.get("type") or "")
        if rodzaj == "value_error" and "error" in kontekst:
            # Identyfikator reguły kontraktu (``[widmo.niepuste]``, ``dziedziny.kanon``)
            # jest kodem dla opiekuna kontraktu — zdanie reguły idzie bez niego.
            zdanie = _IDENTYFIKATOR_REGULY.sub("", str(kontekst["error"])).strip()
            opisy.append(zdanie.rstrip("."))
            continue
        klucze = [str(czesc) for czesc in pozycja.get("loc", ()) if not isinstance(czesc, int)]
        nazwa = None
        if klucze:
            klucz = klucze[-1]
            nazwa = NAZWY_POL_KONTRAKTU_PL.get(f"{operacja}:{klucz}") or (
                NAZWY_POL_KONTRAKTU_PL.get(klucz)
            )
        szablon = _OPISY_BLEDOW_WALIDACJI.get(rodzaj, "ma niepoprawną wartość")
        granice = {
            nazwa_granicy: f"{wartosc:g}" if isinstance(wartosc, int | float) else str(wartosc)
            for nazwa_granicy, wartosc in kontekst.items()
        }
        try:
            tresc = szablon.format(**granice)
        except (KeyError, IndexError):
            tresc = "ma niepoprawną wartość"
        opisy.append(f"„{nazwa}” {tresc}" if nazwa else f"wartość {tresc}")
    return "; ".join(dict.fromkeys(opisy))


def etykieta_parametru(klucz: str) -> str:
    """Nazwa parametru modelu albo tabliczki katalogowej w cudzysłowie — bez klucza.

    Kolejność źródeł (bez drugiej kopii słownika): słownik pól operacji, potem etykiety
    kontraktów materializacji katalogu (``MaterializationContract.ui_fields`` — opis
    pola, jaki pokazuje podgląd katalogu). Parametr spoza obu słowników jest nazywany
    opisowo, nigdy kluczem kontraktu.
    """
    nazwa = NAZWY_POL_KONTRAKTU_PL.get(klucz)
    if nazwa is None:
        nazwa = etykieta_pola_katalogu_pl(klucz)
    return f"„{nazwa}”" if nazwa else "inny parametr tabliczki katalogowej"


# ---------------------------------------------------------------------------
# Wartości słownikowe bez wcześniejszej mapy polskiej
# ---------------------------------------------------------------------------


def nazwa_kategorii_katalogu(kategoria: object) -> str:
    """Nazwa grupy katalogu w cudzysłowie (słownik kategorii żyje przy ``CatalogNamespace``
    w ``network_model.catalog.types``); kategoria spoza słownika = opis ogólny."""
    nazwa = nazwa_kategorii_katalogu_pl(kategoria)
    return f"„{nazwa}”" if nazwa else "właściwej grupy katalogu"


#: Rodzaj gałęzi modelu (``Branch.type``) → nazwa rodzaju elementu.
NAZWY_RODZAJOW_GALEZI_PL: dict[str, str] = {
    "line_overhead": "linia napowietrzna",
    "cable": "kabel",
    "switch": "łącznik",
    "breaker": "wyłącznik",
    "bus_coupler": "sprzęgło szyn",
    "disconnector": "odłącznik",
    "fuse": "bezpiecznik",
}


def nazwa_rodzaju_galezi(rodzaj: object) -> str:
    """Nazwa rodzaju gałęzi; rodzaj spoza słownika = „gałąź innego rodzaju" (bez kodu)."""
    return NAZWY_RODZAJOW_GALEZI_PL.get(str(rodzaj or ""), "gałąź innego rodzaju")


#: Kolekcja modelu → rodzaj elementu (mianownik), do zdań o rodzaju elementu.
NAZWY_KOLEKCJI_PL: dict[str, str] = {
    "buses": "szyna",
    "branches": "gałąź",
    "transformers": "transformator",
    "sources": "źródło zasilania",
    "loads": "odbiór",
    "generators": "wytwórca",
    "substations": "stacja",
    "bays": "pole rozdzielnicy",
    "junctions": "węzeł rozgałęźny",
    "corridors": "magistrala",
    "branch_points": "punkt rozgałęzienia",
    "measurements": "przekładnik",
    "protection_assignments": "zabezpieczenie",
}

#: Rodzaj stacji (kod kontraktu operacji stacyjnych) → nazwa rodzaju. Słowa = opcje
#: „Rodzaj stacji" kreatora stacji (``ui2/kreatory/stacja/strings.ts::typStacjiOpcje``).
NAZWY_RODZAJOW_STACJI_PL: dict[str, str] = {
    "terminal": "końcowa",
    "branch": "odgałęźna",
    "inline": "przelotowa",
    "sectional": "sekcyjna",
}

#: Typ konstrukcji stacji → nazwa (opcje „Typ konstrukcji stacji" kreatora stacji).
NAZWY_TYPOW_KONSTRUKCJI_STACJI_PL: dict[str, str] = {
    "wnetrzowa": "wnętrzowa (budynek)",
    "kontenerowa": "kontenerowa",
    "slupowa": "słupowa",
    "prefabrykowana": "prefabrykowana",
    "inna": "inna",
}

#: Funkcja pola pomiarowego SN → nazwa (opcje „Rodzaj pomiaru" kreatora pola SN).
NAZWY_FUNKCJI_POMIARU_PL: dict[str, str] = {
    "UKLAD_ENERGII": "układ pomiarowy energii",
    "NAPIECIA_SZYN": "pomiar napięcia szyn (przekładniki napięciowe sekcji)",
}

#: Rodzaj układu pomiarowego energii ([E-UP] pkt 3) → nazwa (opcje kreatora pola SN).
NAZWY_RODZAJOW_UKLADU_POMIAROWEGO_PL: dict[str, str] = {
    "PODSTAWOWY": "rozliczeniowy podstawowy",
    "REZERWOWY": "rozliczeniowy rezerwowy",
    "ROWNOWAZNY": "rozliczeniowy równoważny",
    "KONTROLNY": "pomiarowo-kontrolny",
}

#: Rodzaj regulacji zaczepów transformatora → nazwa (opcje kreatorów GPZ i transformatora).
NAZWY_RODZAJOW_REGULACJI_ZACZEPOW_PL: dict[str, str] = {
    "NONE": "bez regulacji",
    "DETC": "DETC (bez obciążenia)",
    "OLTC": "OLTC (pod obciążeniem)",
}

#: Uzwojenie regulowane zaczepami → nazwa.
NAZWY_UZWOJEN_REGULOWANYCH_PL: dict[str, str] = {
    "HV": "górne",
    "LV": "dolne",
}

#: Tryb sterowania przełącznikiem zaczepów → nazwa (opcje kreatora GPZ).
NAZWY_TRYBOW_STEROWANIA_ZACZEPAMI_PL: dict[str, str] = {
    "MANUAL": "ręczny",
    "AUTOMATIC": "automatyczny (AVR)",
    "PROFILE": "profil dobowy",
    "REMOTE": "zdalny (SCADA)",
}


#: Rodzaj aparatu nN (pole „Rodzaj aparatu" operacji aparatu nN) → nazwa (opcje kreatora
#: aparatu nN, ``ui2/kreatory/aparat-nn/strings.ts`` ``rodzajSwitch``/``rodzajFuse``).
NAZWY_KLAS_APARATU_NN_PL: dict[str, str] = {
    "switch": "Wyłącznik / rozłącznik",
    "fuse": "Bezpiecznik",
}

#: Technologia źródła przekształtnikowego → nazwa (opcje „Technologia" kreatora źródła OZE,
#: ``ui2/kreatory/zrodlo-oze/zrodloOzeModel.ts``). Rodzaj przekształtnika katalogu ``WIND``
#: (``ConverterKind``) to ta sama technologia co ``FW`` w kontrakcie operacji.
NAZWY_TECHNOLOGII_ZRODLA_PL: dict[str, str] = {
    "PV": "Fotowoltaika (PV)",
    "BESS": "Magazyn energii (BESS)",
    "FW": "Elektrownia wiatrowa (FW)",
    "WIND": "Elektrownia wiatrowa (FW)",
}


def nazwa_technologii_zrodla(kod: object) -> str:
    """Nazwa technologii w cudzysłowie; kod spoza słownika = opis ogólny (bez kodu)."""
    nazwa = NAZWY_TECHNOLOGII_ZRODLA_PL.get(str(getattr(kod, "value", kod) or ""))
    return f"„{nazwa}”" if nazwa else "inna niż źródło przekształtnikowe"


#: Sposób przyłączenia źródła przekształtnikowego → nazwa (opcje „Sposób przyłączenia"
#: kreatora źródła OZE, ``ui2/kreatory/zrodlo-oze/zrodloOzeModel.ts``).
NAZWY_WARIANTOW_PRZYLACZENIA_ZRODLA_PL: dict[str, str] = {
    "nn_side": "Bezpośrednio do szyny nN",
    "block_transformer": "Przez transformator blokowy",
}


#: Status weryfikacji rekordu katalogu → nazwa (przeglądarka katalogu frontu,
#: ``ui2/spaces/model/katalog/strings.ts::ETYKIETY_WERYFIKACJI``).
NAZWY_STATUSOW_WERYFIKACJI_PL: dict[str, str] = {
    "ZWERYFIKOWANY": "Zweryfikowany",
    "CZESCIOWO_ZWERYFIKOWANY": "Częściowo zweryfikowany",
    "NIEWERYFIKOWANY": "Niezweryfikowany",
    "REFERENCYJNY": "Referencyjny",
}

#: Status katalogu rekordu → nazwa (``ui2/spaces/model/katalog/strings.ts::
#: ETYKIETY_STATUSU_KATALOGU``).
NAZWY_STATUSOW_KATALOGU_PL: dict[str, str] = {
    "PRODUKCYJNY_V1": "Produkcyjny",
    "REFERENCYJNY_V1": "Referencyjny",
    "ANALITYCZNY_V1": "Analityczny",
    "TESTOWY": "Testowy",
    "PROJEKTOWY_V1": "Projektowy (dane z arkusza)",
}


def opis_operacji(nazwa_operacji: str) -> str:
    """„„Dodanie odbioru nN”" — opis operacji z rejestru kanonicznego, nigdy jej kod.

    Import leniwy: rejestr kanoniczny żyje w warstwie ``domain``, która importuje moduły
    ``enm`` — słownik pozostaje liściem grafu importów.
    """
    from domain.canonical_operations import CANONICAL_OPERATIONS

    specyfikacja = CANONICAL_OPERATIONS.get(nazwa_operacji)
    return f"„{specyfikacja.description_pl}”" if specyfikacja is not None else "modelu sieci"


def wartosc_w_zdaniu(wartosc: object) -> str:
    """Wartość danej w treści komunikatu: liczba bez zbędnych zer, tekst bez cudzysłowów
    języka programowania, lista po przecinku."""
    if isinstance(wartosc, bool):
        return "tak" if wartosc else "nie"
    if isinstance(wartosc, float):
        return f"{wartosc:g}"
    if isinstance(wartosc, list | tuple):
        return ", ".join(wartosc_w_zdaniu(element) for element in wartosc)
    return str(wartosc)


def w_cudzyslowie(nazwy: Iterable[str]) -> list[str]:
    """Każda nazwa w cudzysłowie „…” — do list wartości w zdaniu."""
    return [f"„{nazwa}”" for nazwa in nazwy]


#: Rodzaj zabezpieczenia (``ProtectionAssignment.device_type``) → nazwa przymiotnikowa
#: („zabezpieczenie nadprądowe"). Słowa = inspektor frontu
#: (``ui2/adapters/inspectorAdapter.ts::ETYKIETA_RODZAJU_ZABEZPIECZENIA``, małą literą).
NAZWY_RODZAJOW_ZABEZPIECZENIA_PL: dict[str, str] = {
    "overcurrent": "nadprądowe",
    "earth_fault": "ziemnozwarciowe",
    "directional_overcurrent": "nadprądowe kierunkowe",
    "distance": "odległościowe",
    "differential": "różnicowe",
    "custom": "niestandardowe",
}


#: Rodzaj generatora (``Generator.gen_type``) → nazwa. Słowa = formularz źródła frontu
#: (``ui/topology/modals/LoadDERModal.tsx::GEN_TYPE_LABELS``).
NAZWY_RODZAJOW_GENERATORA_PL: dict[str, str] = {
    "synchronous": "Synchroniczny",
    "pv_inverter": "Falownik PV",
    "wind_inverter": "Falownik wiatrowy",
    "fw_pmsg": "Farma wiatrowa PMSG",
    "fw_dfig": "Farma wiatrowa DFIG",
    "fw_scig": "Farma wiatrowa SCIG",
    "bess": "Magazyn energii (BESS)",
}


def nazwa_rodzaju_generatora(gen_type: object) -> str:
    """Nazwa rodzaju generatora w cudzysłowie; rodzaj spoza słownika = opis ogólny."""
    nazwa = NAZWY_RODZAJOW_GENERATORA_PL.get(str(gen_type or ""))
    return f"„{nazwa}”" if nazwa else "rodzaj nieokreślony"


def lista_pl(nazwy: Iterable[str], spojnik: str = "albo") -> str:
    """„a, b albo c" — lista wartości w zdaniu (kolejność zachowana, bez duplikatów)."""
    elementy = list(dict.fromkeys(str(n) for n in nazwy))
    if not elementy:
        return ""
    if len(elementy) == 1:
        return elementy[0]
    return f"{', '.join(elementy[:-1])} {spojnik} {elementy[-1]}"


# ---------------------------------------------------------------------------
# Nazwa elementu z modelu — nigdy identyfikator
# ---------------------------------------------------------------------------


def wyglada_na_identyfikator(wartosc: str) -> bool:
    """Tekst o kształcie identyfikatora (``prefiks/ziarno/ścieżka`` albo długi ciąg hex).

    Identyfikator nie zawiera białych znaków (ziarno to skrót, ścieżka to kody) — tekst
    ze spacją jest nazwą, także gdy niesie ukośnik („PCS BESS 2 MW / 0.4 kV nN”,
    „Transformator 15/0,4 kV”).
    """
    if any(znak.isspace() for znak in wartosc.strip()):
        return False
    zwarty = wartosc.replace("-", "")
    return "/" in wartosc or (
        len(zwarty) >= 24 and all(znak in "0123456789abcdefABCDEF" for znak in zwarty)
    )


#: Kształt kodu w nazwie: znak ``_`` między znakami słowa (``tr_sn_nn``, ``QF-03_zrodlo``).
_KSZTALT_KODU = re.compile(r"\w_\w")


def _nazwa_do_zdania(wartosc: object) -> str | None:
    """Nazwa z modelu, którą wolno wstawić w zdanie (albo ``None``).

    Odrzucone: pusta, o kształcie identyfikatora (``prefiks/…``, długi hex) i o kształcie
    kodu (znak ``_`` między znakami słowa: ``tr_sn_nn``, ``QF-03_zrodlo``) — to nazwy
    przepisane z identyfikatora, których projektant nie nadał. Nazwa RÓWNA identyfikatorowi,
    ale bez tych kształtów (oznaczenie z arkusza importu, np. „RGN-2”), JEST nazwą, którą
    projektant widzi na schemacie — komunikat jej używa, żeby dało się element odnaleźć.
    """
    if not isinstance(wartosc, str):
        return None
    tekst = wartosc.strip()
    if not tekst or wyglada_na_identyfikator(tekst) or _KSZTALT_KODU.search(tekst):
        return None
    return tekst


def _pole_elementu(element: object, klucz: str) -> object:
    """Pole elementu migawki (słownik) albo modelu (obiekt ``enm.models``)."""
    if isinstance(element, Mapping):
        return element.get(klucz)
    return getattr(element, klucz, None)


def _elementy(enm: object) -> Iterable[object]:
    """Elementy wszystkich kolekcji migawki (słownik) albo modelu (obiekt ``enm.models``)."""
    kolekcje = enm.values() if isinstance(enm, Mapping) else vars(enm).values()
    for kolekcja in kolekcje:
        if isinstance(kolekcja, list):
            yield from kolekcja


def _nazwa_czytelna(element: object) -> str | None:
    """Nazwa elementu, jeśli nie jest identyfikatorem ani kodem (albo ``None``)."""
    return _nazwa_do_zdania(_pole_elementu(element, "name"))


def nazwa_elementu(enm: object, ref: object) -> str | None:
    """Nazwa elementu z modelu dla treści komunikatu albo ``None``.

    ``enm`` — migawka (słownik) albo model (``EnergyNetworkModel``). ``None``, gdy
    elementu nie ma, nie ma nazwy albo nazwa jest identyfikatorem (dane sprzed zasady
    „nazwa nigdy z identyfikatora") — komunikat opisuje wtedy element rodzajem, nigdy
    identyfikatorem.
    """
    if not isinstance(ref, str) or not ref or enm is None:
        return None
    for element in _elementy(enm):
        if _pole_elementu(element, "ref_id") == ref:
            return _nazwa_czytelna(element)
    return None


def opis_elementu(enm: object, ref: object, rodzaj: str) -> str:
    """„Szyna „Sekcja 1”" albo „Szyna bez nazwy" — rodzaj elementu + jego nazwa z modelu."""
    nazwa = nazwa_elementu(enm, ref)
    return f"{rodzaj} „{nazwa}”" if nazwa else f"{rodzaj} bez nazwy"


def opis_obiektu(element: object, rodzaj: str) -> str:
    """Jak ``opis_elementu``, gdy element jest już w ręku (słownik albo obiekt modelu)."""
    nazwa = _nazwa_czytelna(element) if element is not None else None
    return f"{rodzaj} „{nazwa}”" if nazwa else f"{rodzaj} bez nazwy"


def opis_nazwy(nazwa: object, rodzaj: str) -> str:
    """Jak ``opis_elementu``, gdy nazwa jest już w ręku (element spoza migawki)."""
    tekst = _nazwa_do_zdania(nazwa)
    return f"{rodzaj} „{tekst}”" if tekst else f"{rodzaj} bez nazwy"


# ---------------------------------------------------------------------------
# Nazwa pozycji katalogu — nigdy identyfikator pozycji
# ---------------------------------------------------------------------------


def nazwa_pozycji_katalogu(ref: object, kategoria: object = None) -> str | None:
    """Nazwa pozycji katalogu bieżącej operacji (statyczny + pozycje projektu).

    ``None`` — pozycji nie ma w katalogu; ``""`` — pozycja jest, ale bez nazwy.

    Import leniwy: katalog operacji żyje w ``enm.katalog_projektu``, który importuje
    moduły ``enm`` — słownik pozostaje liściem grafu importów.
    """
    if not isinstance(ref, str) or not ref.strip():
        return None
    from network_model.catalog.materialization import nazwa_pozycji_w_katalogu

    from .katalog_projektu import katalog_biezacy

    klucz = getattr(kategoria, "value", kategoria)
    nazwa = nazwa_pozycji_w_katalogu(katalog_biezacy(), str(klucz) if klucz else None, ref.strip())
    if nazwa is not None and wyglada_na_identyfikator(nazwa):
        return ""
    return nazwa


def opis_pozycji_katalogu(ref: object, kategoria: object = None, rodzaj: str = "pozycja") -> str:
    """„typ „ABB VD4 17.5 kV 630 A”", „typ bez nazwy" albo „typ spoza katalogu".

    Identyfikator pozycji katalogu nigdy nie trafia do treści.
    """
    nazwa = nazwa_pozycji_katalogu(ref, kategoria)
    if nazwa is None:
        return f"{rodzaj} spoza katalogu"
    return f"{rodzaj} „{nazwa}”" if nazwa else f"{rodzaj} bez nazwy"
