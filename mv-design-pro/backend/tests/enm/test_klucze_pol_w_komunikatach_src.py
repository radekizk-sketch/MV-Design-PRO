"""Klasa: surowy klucz pola kontraktu w komunikacie dla projektanta — strażnik CAŁEGO ``src``.

PO CO. Karta #142 (``test_komunikaty_operacji_bez_kodow.py``) pilnuje inwentarza modułów
komunikatów operacji domenowych pełnym zestawem reguł (kody, identyfikatory, sklejenia).
Klasa „surowy klucz parametru zamiast nazwy wielkości” jest szersza: komunikat odmowy,
walidacji albo ostrzeżenia trafia do projektanta z KAŻDEGO miejsca, którego wyjątek
albo rekord przechodzi do API/UI — rdzeń obliczeniowy (odmowa 422 podglądu, bieg
zakończony odmową), walidator modelu (pydantic → 422), scenariusz, katalog, import
arkusza, analiza. Ten strażnik przegląda drzewo składniowe całego ``src`` i w tekstach
przekazywanych KANAŁEM widocznym dla projektanta szuka tokenu ``snake_case``, kodu
``WIELKIE_LITERY_Z_PODKRESLNIKIEM``, znanego kodu wartości i fragmentu w odwróconych
apostrofach (reguła ``kody_w_tekscie`` — ta sama, co w karcie #142; symbole wielkości
z indeksem dolnym są jawną listą z podstawą normową).

KANAŁ = argument wywołania wyjątku widocznego dla projektanta albo rekordu komunikatu
(``ValueError`` — pydantic przenosi jego treść do 422, bieg kończy się z nią odmową;
``HTTPException``; ``PydanticCustomError``; KAŻDA klasa wyjątku zdefiniowana w ``src``,
zebrana przechodnio z drzewa składniowego, nie wpisana ręką) albo argument nazwany
komunikatu (``message_pl``, ``detail``, ``fix_hint_pl``…). Gołe ``KeyError``/``TypeError``/
``RuntimeError`` są błędem programu (odpowiedź 500), nie komunikatem — poza kanałem.

REGUŁY TEJ SAMEJ RODZINY (wewnętrzny identyfikator kodu w zdaniu dla projektanta):

* nazwa klasy ``src`` (``CamelCase`` zebrany z drzewa składniowego) albo ``type(x).__name__``
  w zdaniu — w modułach odmów tłumaczonych dopuszczalna tylko w odwróconych apostrofach, bo
  tłumacz zamienia ją na polską nazwę rodzaju (``NAZWY_KLAS_DYNAMIKI_PL``);
* identyfikator elementu w zdaniu ZOSTAJE (projektant potrzebuje wskazania elementu), ale
  musi stać przy nim polska nazwa rodzaju obiektu („Linia L-12: …”) — goły identyfikator
  jest naruszeniem;
* kod reguły („kod reguły: KAT-T-006”) jest dowodem audytowym wyłącznie jako dopisek PO
  polskim zdaniu — komunikat złożony z samego kodu albo samej wartości jest naruszeniem.

Rdzenie zamrożone B-01 (``scripts/rdzenie_b01.py``) są W zakresie strażnika (pin 0) —
decyzja B-01 architekta dopuściła zmianę wyłącznie literałów komunikatów tych plików.

WYŁĄCZENIA (każde z uzasadnieniem merytorycznym i testem żywotności):

* klasy błędów programu (``BLEDY_PROGRAMU``) — wyjątek oznacza defekt kodu, nie danych;
* moduły bez konsumenta produkcyjnego (``MODULY_POZA_KLASA``);
* tokeny FORMATU DANYCH projektanta (``TOKENY_FORMATU_DANYCH``) — nagłówek kolumny
  arkusza, klucz pliku cennika, wartość słownika arkusza: projektant wpisuje DOKŁADNIE ten
  napis, więc komunikat musi go zacytować;
* odmowy rdzenia i adaptera dynamiki (``MODULY_ODMOW_TLUMACZONYCH``): klucz cytowany
  w odwróconych apostrofach zamienia na etykietę formularza scenariusza
  ``application.dynamika.odmowy.komunikat_dla_projektanta`` (jedno źródło etykiet,
  ``enm.scenariusze.ETYKIETY_POL``) — strażnik stosuje TĘ SAMĄ funkcję etykiety;
  klucz bez etykiety albo goły (bez apostrofów) pozostaje naruszeniem.
"""

from __future__ import annotations

import ast
import builtins
import importlib.util
import re
from collections.abc import Iterable, Iterator, Mapping
from dataclasses import dataclass
from functools import cache
from pathlib import Path

import pytest
from application.dynamika.odmowy import etykieta_klucza

from tests.enm.test_komunikaty_operacji_bez_kodow import (
    _ATRYBUT_TEKSTOWY,
    _DOPISEK_KODU,
    _LUDZKI,
    DOPISKI_KODU,
    SKROTY_INZYNIERSKIE,
    SRC,
    SYMBOLE_INZYNIERSKIE,
    Naruszenie,
    ZakresModulu,
    _czy_sklejajace,
    _element_nazwany,
    _funkcja_nazywajaca,
    _interpolacja_identyfikatora,
    _korzen_tekstu,
    _poza_komunikatem,
    _rodzice,
    kody_w_tekscie,
    naruszenia_modulu,
    teksty_komunikatow,
)

#: Wyjątki biblioteczne, których treść trafia do projektanta.
KANALY_ZEWNETRZNE: frozenset[str] = frozenset(
    {"ValueError", "HTTPException", "PydanticCustomError"}
)
#: Funkcje FORMATUJĄCE treść komunikatu, której wynik trafia do kanału (``ValueError(
#: naruszenie(regula, tekst))``): wynik funkcji to tekst dla projektanta, więc jej argument
#: treści jest kanałem jak argument samego wyjątku. ``naruszenie`` (``dziedziny/kanon.py``)
#: dokleja znacznik reguły kontraktu, który tłumacz błędu walidacji zdejmuje przed pokazaniem
#: zdania (``enm/slownik_komunikatow.opis_bledu_walidacji``) — zdanie zostaje. Żywotność:
#: ``test_kanaly_formatujace_sa_zywe``.
KANALY_FORMATUJACE: frozenset[str] = frozenset({"naruszenie"})
#: Rekordy komunikatu (pozycje gotowości, kwestie walidacji, ostrzeżenia analiz).
KANALY_REKORDOW: frozenset[str] = frozenset(
    {"ValidationIssue", "ReadinessIssue", "Ostrzezenie", "Issue", "Problem", "Uwaga"}
)
#: Rodzaj kanału treści: ZDANIE — wartość jest zdaniem dla projektanta (komunikat, powód,
#: podpowiedź, uzasadnienie); ETYKIETA — wartość jest nazwą albo krótkim określeniem
#: (etykieta, nazwa, odznaka, oznaczenie normy, status słowami), która nie musi być zdaniem.
ZDANIE = "zdanie"
ETYKIETA = "etykieta"
#: JEDNA lista kanałów treści dla projektanta: argument nazwany, klucz słownika
#: (``{"reason_pl": …}``) i klucz przypisania (``wynik["reason_pl"] = …``) o tej nazwie niesie
#: tekst, który trafia do API/UI. Każda nazwa z sufiksem ``_pl`` w ``src`` MUSI tu stać
#: (``test_kanaly_tresci_kompletne_i_zywe`` — nowy kanał bez rodzaju czerwieni test), każdy
#: wpis musi występować w ``src``. Reguły tekstu (kody, klucze, nazwy klas, identyfikatory,
#: sklejenia, wartości wyliczeń) obejmują oba rodzaje; reguła „komunikat bez zdania” —
#: wyłącznie kanały ZDANIE (etykieta „(SZR)”, odznaka „PTPiREE” nie jest zdaniem z natury).
KANALY_TRESCI: dict[str, str] = {
    "ability_pl": ETYKIETA,
    "akcja_naprawcza_pl": ZDANIE,
    "alias_pl": ETYKIETA,
    "analysis_label_pl": ETYKIETA,
    "aparat_pl": ETYKIETA,
    "assumption_pl": ZDANIE,
    "at_limit_pl": ZDANIE,
    "badge_pl": ETYKIETA,
    "basis_pl": ZDANIE,
    "bez_podstawy_pl": ZDANIE,
    "braki_ncrfg_pl": ZDANIE,
    "braki_pl": ZDANIE,
    "canonical_message_pl": ZDANIE,
    "capability_source_pl": ETYKIETA,
    "catalog_policy_pl": ZDANIE,
    "category_label_pl": ETYKIETA,
    "certyfikat_brakujacy_pl": ZDANIE,
    "certyfikat_odrzucony_pl": ZDANIE,
    "chroniony_obiekt_pl": ETYKIETA,
    "claim_kind_pl": ETYKIETA,
    "conditional_pl": ZDANIE,
    "conflict_pl": ZDANIE,
    "curve_label_pl": ETYKIETA,
    "czego_brakuje_pl": ZDANIE,
    "decision_reason_pl": ZDANIE,
    "definicja_pl": ETYKIETA,
    "derating_assumption_pl": ZDANIE,
    "description_pl": ZDANIE,
    "detail": ZDANIE,
    "detail_pl": ZDANIE,
    "device_name_pl": ETYKIETA,
    "display_pl": ETYKIETA,
    "domena_pl": ETYKIETA,
    "dzialanie_pl": ETYKIETA,
    "element_pl": ETYKIETA,
    "element_type_label_pl": ETYKIETA,
    "elementy_pl": ZDANIE,
    "energization_basis_pl": ZDANIE,
    "error_message_pl": ZDANIE,
    "error_pl": ZDANIE,
    "etykieta_do_pl": ETYKIETA,
    "etykieta_od_pl": ETYKIETA,
    "etykieta_pl": ETYKIETA,
    "faza_nieznana_powod_pl": ZDANIE,
    "fix_hint_pl": ZDANIE,
    "function_label_pl": ETYKIETA,
    "goly_aparat_wniosek_pl": ETYKIETA,
    "granica_temperatury_pl": ZDANIE,
    "info_pl": ETYKIETA,
    "kierunek_pl": ETYKIETA,
    "kind_pl": ETYKIETA,
    "klasa_transformatora_pl": ETYKIETA,
    "kombinacja_wniosek_pl": ETYKIETA,
    "komentarz_pl": ZDANIE,
    "komunikat": ZDANIE,
    "komunikat_pl": ZDANIE,
    "kontekst_sily_sieci_powod_pl": ZDANIE,
    "kryterium_pl": ETYKIETA,
    "krzywa_pl": ETYKIETA,
    "label_pl": ETYKIETA,
    "library_name_pl": ETYKIETA,
    "limitation_pl": ZDANIE,
    "loading_powod_braku_pl": ZDANIE,
    "mechanizm_pl": ZDANIE,
    "message": ZDANIE,
    "message_pl": ZDANIE,
    "metoda_pl": ETYKIETA,
    "miejsce_pl": ETYKIETA,
    "miejsce_pomiaru_pl": ETYKIETA,
    "missing_data_pl": ZDANIE,
    "missing_fields_pl": ZDANIE,
    "naglowek_pl": ETYKIETA,
    "name_pl": ETYKIETA,
    "nazwa_operatora_pl": ETYKIETA,
    "nazwa_pl": ETYKIETA,
    "nazwa_punktu_pl": ETYKIETA,
    "nazwa_urzadzenia_pl": ETYKIETA,
    "new_value_pl": ETYKIETA,
    "no_module_reason_pl": ZDANIE,
    "norma_pl": ETYKIETA,
    "nosnik_pl": ZDANIE,
    "note_pl": ZDANIE,
    "notes_pl": ZDANIE,
    "odeslanie_pl": ETYKIETA,
    "odniesienie_pl": ETYKIETA,
    "ograniczenie_pl": ZDANIE,
    "okres_obserwacji_pl": ETYKIETA,
    "okreslenie_pl": ETYKIETA,
    "old_value_pl": ETYKIETA,
    "operator_name_pl": ETYKIETA,
    "operator_pl": ETYKIETA,
    "opis_kryterium_pl": ZDANIE,
    "opis_pl": ZDANIE,
    "opis_przedmiotu_pl": ZDANIE,
    "opis_typu_pl": ZDANIE,
    "opis_zrodla_pl": ZDANIE,
    "ostrzezenia": ZDANIE,
    "over_limit_label_pl": ETYKIETA,
    "parametry_robocze_pl": ZDANIE,
    "pasmo_brak_etykieta_pl": ETYKIETA,
    "pasmo_brak_powod_pl": ZDANIE,
    "pasmo_q_pl": ETYKIETA,
    "podstawa_ostrzezenie_pl": ZDANIE,
    "podstawa_pl": ZDANIE,
    "podstawa_przekroczenie_pl": ZDANIE,
    "podstawa_reguly_pl": ZDANIE,
    "podstawa_t_pomiaru_pl": ZDANIE,
    "podstawa_u_min_pl": ZDANIE,
    "podstawa_zakresow_pl": ZDANIE,
    "pokrycie_pl": ZDANIE,
    "pokrycie_programu_pl": ZDANIE,
    "pole_pl": ETYKIETA,
    "pominiete_pl": ZDANIE,
    "pominiete_zrodla_pl": ZDANIE,
    "powod_braku_niepewnosci_pl": ZDANIE,
    "powod_braku_pl": ZDANIE,
    "powod_decyzji_pl": ZDANIE,
    "powod_niedostepnosci_pl": ZDANIE,
    "powod_pl": ZDANIE,
    "powod_projektanta_pl": ZDANIE,
    "powod_stosowalnosci_pl": ZDANIE,
    "powod_wycofania_pl": ZDANIE,
    "powody_pl": ZDANIE,
    "poza_zakresem_pl": ZDANIE,
    "pozycja_pl": ETYKIETA,
    "procedure_basis_pl": ZDANIE,
    "profile_name_pl": ETYKIETA,
    "proof_status_pl": ETYKIETA,
    "provenance_caveat_pl": ZDANIE,
    "provenance_label_pl": ETYKIETA,
    "przyczyna": ZDANIE,
    "przyczyna_pl": ZDANIE,
    "przyjete_pl": ZDANIE,
    "punkt_krytyczny_pl": ZDANIE,
    "punkt_pl": ETYKIETA,
    "punkty_etykieta_pl": ETYKIETA,
    "pytanie_pl": ZDANIE,
    "rationale_pl": ZDANIE,
    "reason_pl": ZDANIE,
    "recommendations_pl": ZDANIE,
    "recommended_action_pl": ZDANIE,
    "regula_pl": ETYKIETA,
    "report_pl": ZDANIE,
    "reporting_limitations_pl": ZDANIE,
    "reporting_status_pl": ETYKIETA,
    "required_reason_pl": ZDANIE,
    "result_freshness_reason_pl": ZDANIE,
    "result_message_pl": ZDANIE,
    "result_pl": ETYKIETA,
    "result_status_reason_pl": ZDANIE,
    "rodzaj_elementu_pl": ETYKIETA,
    "rodzaj_pl": ETYKIETA,
    "rodzaj_pradu_pl": ETYKIETA,
    "rodzaj_przewodu_pl": ETYKIETA,
    "rodzaj_zwarcia_pl": ETYKIETA,
    "rola_pl": ETYKIETA,
    "section_label_pl": ETYKIETA,
    "sekcja_audytowa_pl": ZDANIE,
    "skrot_pl": ETYKIETA,
    "skutek_pl": ETYKIETA,
    "slad_pl": ZDANIE,
    "source_note_pl": ZDANIE,
    "source_pl": ETYKIETA,
    "stan_pl": ETYKIETA,
    "status_label_pl": ETYKIETA,
    "status_pl": ETYKIETA,
    "statystyka_pl": ETYKIETA,
    "substitution_pl": ETYKIETA,
    "summary_pl": ZDANIE,
    "supply_assumption_pl": ZDANIE,
    "swz_przyczyna_pl": ZDANIE,
    "symbol_name_pl": ETYKIETA,
    "tag_pl": ETYKIETA,
    "template_name_pl": ETYKIETA,
    "text_pl": ETYKIETA,
    "threshold_why_pl": ZDANIE,
    "tier_pl": ETYKIETA,
    "title_pl": ETYKIETA,
    "tozsamosc_pl": ETYKIETA,
    "tresc_pl": ZDANIE,
    "typ_nazwa_pl": ETYKIETA,
    "unit_check_pl": ETYKIETA,
    "unit_name_pl": ETYKIETA,
    "unsafe_reason_pl": ZDANIE,
    "use_case_pl": ZDANIE,
    "uwaga_pl": ZDANIE,
    "uwagi": ZDANIE,
    "uwagi_metody_pl": ZDANIE,
    "uwagi_pl": ZDANIE,
    "uzasadnienie_pl": ZDANIE,
    "verdict_description_pl": ZDANIE,
    "verdict_pl": ETYKIETA,
    "voltage_level_pl": ETYKIETA,
    "warnings": ZDANIE,
    "wartosc_pl": ETYKIETA,
    "warunek_pl": ETYKIETA,
    "warunek_wstepny_pl": ZDANIE,
    "werdykt_pl": ETYKIETA,
    "werdykt_sekwencji_pl": ZDANIE,
    "wezly_strefy_nazwy_pl": ETYKIETA,
    "why_pl": ZDANIE,
    "wiarygodnosc_powod_pl": ZDANIE,
    "wielkosc_pl": ETYKIETA,
    "window_conflict_pl": ZDANIE,
    "window_pl": ETYKIETA,
    "window_recommendations_pl": ZDANIE,
    "wiodacy_opis_pl": ZDANIE,
    "wniosek_pl": ZDANIE,
    "worst_quality_label_pl": ETYKIETA,
    "wplyw_pl": ZDANIE,
    "wscr_why_pl": ZDANIE,
    "wyjasnienie_pl": ZDANIE,
    "wynik_pl": ETYKIETA,
    "wzor_opis_pl": ZDANIE,
    "z0_missing_reason_pl": ZDANIE,
    "zakres_pl": ETYKIETA,
    "zakres_stosowalnosci_pl": ZDANIE,
    "zalozenia_pl": ZDANIE,
    "zalozenie_pl": ZDANIE,
    "zawartosc_pl": ETYKIETA,
    "zdanie_goly_aparat_pl": ZDANIE,
    "zdanie_kombinacja_pl": ZDANIE,
    "zdanie_pl": ZDANIE,
    "zdolnosc_4q_pl": ETYKIETA,
    "zdolnosc_gfm_pl": ETYKIETA,
    "zrodlo_k_pl": ETYKIETA,
    "zrodlo_liczb_pl": ZDANIE,
    "zrodlo_napiecia_pl": ZDANIE,
    "zrodlo_obciazalnosci_pl": ZDANIE,
    "zrodlo_opis_pl": ZDANIE,
    "zrodlo_pl": ETYKIETA,
    "zrodlo_pomiaru_pl": ZDANIE,
    "zrodlo_progu_pl": ZDANIE,
    "zrodlo_wejsc_pl": ZDANIE,
}
#: Argumenty nazwane i klucze słowników niosące tekst dla projektanta (oba rodzaje).
KANALY_SLOW: frozenset[str] = frozenset(KANALY_TRESCI)
#: Kanały, których wartość jest ZDANIEM (reguła „komunikat bez zdania”).
KANALY_ZDANIOWE: frozenset[str] = frozenset(
    nazwa for nazwa, rodzaj in KANALY_TRESCI.items() if rodzaj == ZDANIE
)
#: Listy komunikatów: element dokładany do listy o tej nazwie (``bledy.append("…")``) jest
#: zdaniem dla projektanta, bo lista wraca do wołającego i trafia do odmowy, rekordu albo
#: odpowiedzi API (np. ``validate_input`` solvera FRT → ``OdmowaDanychError`` sekwencji
#: zapadów). Uzasadnienie przy każdej nazwie; żywotność: ``test_listy_komunikatow_zywe``.
LISTY_KOMUNIKATOW: dict[str, str] = {
    "errors": "błędy walidacji wejścia (solvery, archiwum, kreator) zwracane wołającemu",
    "bledy": "błędy walidacji danych (nastawy, szablony, arkusz) zwracane do odmowy",
    "braki": "braki danych zbierane do kwestii walidacji i gotowości (`ValidationIssue`)",
    "sprzeczne": "sprzeczności danych zasilania (S_k i I_k minimalne/maksymalne) w kwestii walidacji",
    "opisy": "opisy przekroczeń zakresu ważności modelu dynamiki wklejane do `OdmowaDynamiki`",
    "ostrzezenia": "ostrzeżenia analiz i ocen dołączane do wyniku dla projektanta",
    "warnings": "ostrzeżenia wyników i dowodów (ostrzeżenia biegu, pakietu dowodowego)",
    "issues": "kwestie walidacji wejścia solvera zwracane do gotowości",
    "uwagi": "uwagi do nastaw i ocen zabezpieczeń w wyniku",
    "problemy": "problemy katalogu projektu zwracane do odmowy",
    "naruszenia": "naruszenia reguł pliku cennika zwracane do odmowy",
    "notes": "notatki rekordu katalogu w odpowiedzi API",
    "zastrzezenia": "zastrzeżenia wyjaśnienia werdyktu",
    "recommendations": "zalecenia okna nastaw w wyniku",
    "powody": "powody statusu sekcji modelu, stosowalności jakości energii i niepełności dowodu",
}


def zakres_src(sciezka: str, wywolania: frozenset[str] | None = None) -> ZakresModulu:
    """Zakres tekstów dla projektanta w module ``src``: wywołania kanału, argumenty nazwane
    i klucze słowników ``KANALY_TRESCI`` oraz elementy list ``LISTY_KOMUNIKATOW``."""
    return ZakresModulu(
        sciezka,
        wywolania=wywolania or kanaly_wywolan(),
        slowa_kluczowe=KANALY_SLOW,
        klucze_slownika=KANALY_SLOW,
        listy=frozenset(LISTY_KOMUNIKATOW),
    )


#: Klasy wyjątków oznaczające DEFEKT PROGRAMU (nie danych projektanta) — poza kanałem.
BLEDY_PROGRAMU: dict[str, str] = {
    "BladRejestruNiezmiennikow": (
        "rejestr reguł katalogu sprawdza własną definicję przy imporcie modułu i wywołania "
        "bramki z kodem spoza rejestru — błąd programisty (docstring `regula`), nie odmowa "
        "rekordu katalogu; rekord odmawia `OdmowaKatalogu`"
    ),
    "LegacyFieldSpecsError": (
        "zapis modelu z dawnymi słownikami pól jest błędem operacji, która je zapisała "
        "(`enm/store.py`, karta W5-B): model z pliku przechodzi migrację przed zapisem"
    ),
}

#: Moduły bez konsumenta produkcyjnego — ich komunikat nie ma drogi do projektanta.
MODULY_POZA_KLASA: dict[str, tuple[str, str]] = {
    # ścieżka (plik albo katalog z ``/``) → (prefiks jedynych dozwolonych konsumentów,
    # uzasadnienie)
    "network_model/core/action_envelope.py": (
        "network_model/core/",
        "koperta akcji migawki (event-sourcing IR) ma zero konsumentów produkcyjnych — "
        "wyłącznie testy; procedura kasacji legacy persystencji IR "
        "(`docs/architecture/CANONICAL_TWIN_ARCHITECTURE.md` §D-03)",
    ),
    "application/symphony/": (
        "application/symphony/",
        "orkiestrator zadań agentów programistycznych (plik konfiguracji przebiegów agentów) "
        "— narzędzie wytwórcze, nie część produktu: żaden moduł API ani produktu go nie "
        "importuje, więc jego komunikat nie ma drogi do projektanta",
    ),
}

#: Tokeny formatu danych wpisywanych przez projektanta (``plik:token``).
TOKENY_FORMATU_DANYCH: dict[str, str] = {
    "application/xlsx_import/importer.py:zaczep_min": "nagłówek kolumny arkusza transformatorów",
    "application/xlsx_import/importer.py:zaczep_max": "nagłówek kolumny arkusza transformatorów",
    "application/xlsx_import/importer.py:PLUS_6": (
        "wartość słownika tolerancji nN w arkuszu (tabela 1 IEC 60909-0) — projektant ją wpisuje"
    ),
    "application/xlsx_import/importer.py:PLUS_10": (
        "wartość słownika tolerancji nN w arkuszu (tabela 1 IEC 60909-0) — projektant ją wpisuje"
    ),
    "application/analyses/zgodnosc_powykonawcza.py:element_ref": (
        "nagłówek kolumny pliku CSV pomiarów powykonawczych"
    ),
    "catalog/cenniki/loader.py:type_id": "klucz pozycji pliku YAML cennika",
    "catalog/cenniki/loader.py:data_cen": "klucz sekcji głównej pliku YAML cennika",
    "catalog/cenniki/loader.py:energia_strat": "klucz sekcji pliku YAML cennika",
    # Warstwy normatywne NC RfG (rdzeń B-01, decyzja architekta 2026-10-29: zmiana WYŁĄCZNIE
    # tekstów — wyrażenia zostają). Pliki są danymi produktu (`catalog/profiles/nc_rfg/`;
    # publiczne wejścia modułu nie przyjmują innego katalogu — `test_warstwy_nc_rfg_tylko_
    # z_pakietu`), a komunikat wskazuje opiekunowi danych klucz albo wartość, które ma
    # poprawić w pliku YAML — cytat zapisu pliku jest jedynym precyzyjnym wskazaniem.
    "catalog/profiles/nc_rfg/loader.py:bank_nastaw": "klucz sekcji pliku YAML operatora",
    "catalog/profiles/nc_rfg/loader.py:wykonanie_prawa": "klucz sekcji pliku YAML operatora",
    "catalog/profiles/nc_rfg/loader.py:` ⟨⟩ `": (
        "klucz sekcji pliku YAML operatora cytowany zmienną pętli po `bank_nastaw`, "
        "`wykonanie_prawa`"
    ),
    # Wartości klucza `warstwa` (NC_RFG, PROCEDURA_PTPIREE) — wpisy zdjęte w commicie 4: odmowa
    # wczytania pliku warstwy nazywa oczekiwaną warstwę słowami (`NAZWY_WARSTW_PL`, decyzja
    # B-01 2026-10-30), a zadeklarowaną wartość cytuje zapisem pliku (`!r`).
}

#: Moduły, których odmowy przechodzą przez ``komunikat_dla_projektanta`` (prefiks katalogu
#: kończy się ``/``).
MODULY_ODMOW_TLUMACZONYCH: dict[str, str] = {
    "network_model/solvers/dynamika/": (
        "odmowy rdzenia dynamiki (`OdmowaDynamiki`) — `enm/canonical_analysis.py` zamienia "
        "klucze na etykiety przed zapisem komunikatu biegu"
    ),
    "enm/adapter_dynamiki.py": (
        "odmowy adaptera dynamiki (`OdmowaWejsciaDynamiki`) — ta sama zamiana w "
        "`enm/canonical_analysis.py`"
    ),
}
#: Interpolacja klucza w apostrofach (``f"`{nazwa}`"``) w module tłumaczonym — dopuszczalna,
#: gdy KAŻDA wartość zmiennej ma etykietę (przypina ``test_petla_nastaw_ma_etykiety``).
INTERPOLOWANE_KLUCZE_TLUMACZONE: dict[str, str] = {
    "network_model/solvers/dynamika/kontrakty.py": (
        "pętla dodatniości nastaw solvera po literalnych kluczach `NastawySolvera`"
    ),
    "network_model/solvers/dynamika/urzadzenia/zrodlo_testowe.py": (
        "pętla skończoności po polach segmentu profilu źródła testowego (każde pole każdego "
        "segmentu ma etykietę — `test_pola_segmentow_profilu_maja_etykiety`)"
    ),
}

#: Funkcje wstawiające parametr do komunikatu, których literalne klucze NIE są klasą
#: (``plik::funkcja`` → uzasadnienie; każdy wpis ma test warunku).
HELPERY_POZA_KLASA: dict[str, str] = {
    "network_model/ir_fields.py::BrakujacePoleIRError": (
        "integralność rekordu IR (plik katalogu statycznego, migawka zapisana przez system) — "
        "jedyne wejście pisane przez projektanta, katalog projektu z arkusza, zamienia klucz "
        "na etykietę (`enm/katalog_projektu.py`, `etykieta_parametru`)"
    ),
    "application/solvers/power_flow_binding.py::_liczba": (
        "integralność zapisanego wyniku rozpływu — klucz zamrożonego kontraktu wyniku "
        "(zapisuje solver, projektant go nie wpisuje; komunikat każe przeliczyć)"
    ),
    "application/solvers/power_flow_binding.py::_tekst": "jak `_liczba` tego modułu",
    "application/solvers/power_flow_binding.py::_lista": "jak `_liczba` tego modułu",
    "application/solvers/power_flow_binding.py::_calkowita": "jak `_liczba` tego modułu",
    "application/solvers/power_flow_binding.py::_logiczna": "jak `_liczba` tego modułu",
    "application/analyses/voltage_profile_view.py::_wymagana_liczba_galezi": (
        "integralność zapisanego wyniku rozpływu (pola zamrożonego `PowerFlowBranchResult`)"
    ),
    "application/analyses/voltage_profile_view.py::_wymagana_liczba_podsumowania": (
        "integralność zapisanego wyniku rozpływu (pola zamrożonego `PowerFlowSummary`)"
    ),
    "application/analyses/konwencja_mocy.py::_wymagana_moc_galezi": (
        "integralność zapisanego wyniku rozpływu (pola zamrożonego `PowerFlowBranchResult`)"
    ),
    "enm/rozplyw_wysp.py::_unia": (
        "niezmiennik programu: wyspy rozpływu są rozłączne z konstrukcji — odmowa oznacza "
        "defekt składania wysp, pole to atrybut `PowerFlowNewtonSolution`"
    ),
    "domain/project_archive.py::_sekcja": (
        "format pliku archiwum projektu — sekcja nazwana tak, jak stoi w pliku (ścieżka pola "
        "formatu jest jedynym precyzyjnym wskazaniem w pliku, który importuje projektant)"
    ),
    "domain/incremental_archive.py::_wartosc_enum": "format pliku paczki przyrostowej",
    "network_model/odmowa_danych.py::OdmowaNazwana": (
        "kod maszynowy trafia do zdania wyłącznie w odmowie niezmiennika „kod nie należy do "
        "treści” — dla poprawnego wywołania gałąź nie odpala"
    ),
    "infrastructure/persistence/repositories/document_store_repository.py::"
    "build_document_record": (
        "odmowa NIEZNANEJ wartości słownika rodzajów dokumentu — literał z wywołania jest "
        "wartością słownika, więc gałąź nie odpala"
    ),
    "network_model/catalog/rodzaje_aparatury.py::wielkosc_zwarciowa_aparatu_sn_dotyczy": (
        "odmowa NIEZNANEJ wielkości zwarciowej — literał z wywołania jest wielkością słownika"
    ),
    "network_model/catalog/rodzaje_aparatury.py::wielkosc_zwarciowa_lacznika_dotyczy": (
        "odmowa NIEZNANEJ wielkości zwarciowej — literał z wywołania jest wielkością słownika"
    ),
    "network_model/catalog/sekcje_modelu.py::dane_typu": (
        "odmowa przestrzeni katalogu BEZ widoku sekcji — literał z wywołania ma widok"
    ),
}

_ZASTEPNIK = "` ⟨⟩ `"


def _tresc(plik: Path) -> str:
    """Treść pliku; pliki ``src`` czytane raz na bieg (strażnik przegląda całe drzewo wiele
    razy — reguła kanału, pętli i argumentów, testy warunków wyłączeń)."""
    if plik.is_relative_to(SRC):
        return _tresc_src(plik)
    return plik.read_text(encoding="utf-8")


@cache
def _tresc_src(plik: Path) -> str:
    return plik.read_text(encoding="utf-8")


def _drzewo(plik: Path) -> ast.Module:
    """Drzewo składniowe pliku; pliki ``src`` parsowane raz na bieg. Plik spoza ``src``
    (moduł wstrzyknięty w ``tmp_path``) jest parsowany za każdym razem."""
    if plik.is_relative_to(SRC):
        return _drzewo_src(plik)
    return ast.parse(plik.read_text(encoding="utf-8"))


@cache
def _drzewo_src(plik: Path) -> ast.Module:
    return ast.parse(_tresc_src(plik))


@cache
def _rdzenie_b01() -> object:
    sciezka = SRC.parents[1] / "scripts" / "rdzenie_b01.py"
    spec = importlib.util.spec_from_file_location("rdzenie_b01", sciezka)
    assert spec is not None and spec.loader is not None
    modul = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modul)
    return modul


def jest_rdzeniem_b01(sciezka: str) -> bool:
    return bool(_rdzenie_b01().jest_rdzeniem_b01(sciezka))  # type: ignore[attr-defined]


@cache
def klasy_wyjatkow_src() -> frozenset[str]:
    """Każda klasa wyjątku zdefiniowana w ``src`` (przechodnio od wyjątku wbudowanego albo
    ``HTTPException``) — z drzewa składniowego, nie z ręcznej listy."""
    bazy: dict[str, set[str]] = {}
    for plik in sorted(SRC.rglob("*.py")):
        for wezel in ast.walk(_drzewo(plik)):
            if isinstance(wezel, ast.ClassDef):
                bazy.setdefault(wezel.name, set()).update(
                    ast.unparse(baza).split(".")[-1] for baza in wezel.bases
                )
    znane = {
        nazwa
        for nazwa in dir(builtins)
        if isinstance(getattr(builtins, nazwa), type)
        and issubclass(getattr(builtins, nazwa), BaseException)
    } | {"HTTPException"}
    klasy: set[str] = set()
    while True:
        nowe = {k for k, b in bazy.items() if k not in klasy and b & (znane | klasy)}
        if not nowe:
            return frozenset(klasy)
        klasy |= nowe


def _nazwa_wywolanej(wezel: ast.Call) -> str:
    funkcja = wezel.func
    if isinstance(funkcja, ast.Name):
        return funkcja.id
    if isinstance(funkcja, ast.Attribute):
        return funkcja.attr
    return ""


@cache
def funkcje_opakowujace_src(kanaly: frozenset[str]) -> frozenset[str]:
    """Funkcje ``src``, które PRZEKAZUJĄ swój parametr do kanału (``raise``/``return``
    wywołania kanału z argumentem zależnym od parametru) — np. ``odmowa_twarda(kod,
    komunikat)`` katalogu czy ``_odmowa_charakterystyki(komunikat)`` dynamiki. Tekst podany
    takiej funkcji trafia do projektanta tak samo jak tekst samego wyjątku, więc funkcja
    jest kanałem; domknięcie przechodnie (opakowanie opakowania), z drzewa składniowego."""
    definicje: list[ast.FunctionDef | ast.AsyncFunctionDef] = [
        wezel
        for plik in sorted(SRC.rglob("*.py"))
        for wezel in ast.walk(_drzewo(plik))
        if isinstance(wezel, ast.FunctionDef | ast.AsyncFunctionDef)
    ]
    znane = set(kanaly)
    while True:
        nowe: set[str] = set()
        for definicja in definicje:
            if definicja.name in znane:
                continue
            parametry = {
                a.arg
                for a in (
                    definicja.args.posonlyargs + definicja.args.args + definicja.args.kwonlyargs
                )
            } - {"self", "cls"}
            for wezel in ast.walk(definicja):
                if isinstance(wezel, ast.Raise):
                    wywolanie = wezel.exc
                elif isinstance(wezel, ast.Return):
                    wywolanie = wezel.value
                else:
                    continue
                if not (isinstance(wywolanie, ast.Call) and _nazwa_wywolanej(wywolanie) in znane):
                    continue
                argumenty = [*wywolanie.args, *(k.value for k in wywolanie.keywords)]
                if any(
                    isinstance(n, ast.Name) and n.id in parametry
                    for argument in argumenty
                    for n in ast.walk(argument)
                ):
                    nowe.add(definicja.name)
                    break
        if not nowe:
            return frozenset(znane - set(kanaly))
        znane |= nowe


@cache
def kanaly_wywolan() -> frozenset[str]:
    bezposrednie = frozenset(
        (klasy_wyjatkow_src() - set(BLEDY_PROGRAMU))
        | KANALY_ZEWNETRZNE
        | KANALY_REKORDOW
        | KANALY_FORMATUJACE
    )
    return bezposrednie | funkcje_opakowujace_src(bezposrednie)


def _tlumaczony(sciezka: str) -> bool:
    return any(
        sciezka == wpis or (wpis.endswith("/") and sciezka.startswith(wpis))
        for wpis in MODULY_ODMOW_TLUMACZONYCH
    )


def _surowe_naruszenia(
    sciezka: str, plik: Path | None = None, wywolania: frozenset[str] | None = None
) -> list[Naruszenie]:
    zakres = zakres_src(sciezka, wywolania)
    return [n for n in naruszenia_modulu(zakres, plik) if n.powod.startswith("kod ")]


def _klucze_iteracji(petla: ast.For, funkcja: ast.AST | None) -> list[str]:
    """Literalne klucze, po których iteruje pętla: krotka/lista krotek albo napisów
    (``for nazwa, wartosc in (("in_a", x), …)``) albo ``slownik.items()`` lokalnego
    słownika z literałem kluczy (``liczby = {"a_p": …}``) w tej samej funkcji."""
    zrodlo = petla.iter
    if (
        isinstance(zrodlo, ast.Call)
        and isinstance(zrodlo.func, ast.Attribute)
        and zrodlo.func.attr in {"items", "keys"}
        and isinstance(zrodlo.func.value, ast.Name)
        and funkcja is not None
    ):
        nazwa = zrodlo.func.value.id
        klucze: list[str] = []
        for wezel in ast.walk(funkcja):
            if (
                isinstance(wezel, ast.Assign)
                and any(isinstance(c, ast.Name) and c.id == nazwa for c in wezel.targets)
                and isinstance(wezel.value, ast.Dict)
            ):
                klucze += [
                    k.value
                    for k in wezel.value.keys
                    if isinstance(k, ast.Constant) and isinstance(k.value, str)
                ]
        return klucze
    if not isinstance(zrodlo, ast.Tuple | ast.List):
        return []
    klucze = []
    for element in zrodlo.elts:
        pierwszy = element.elts[0] if isinstance(element, ast.Tuple | ast.List) else element
        if isinstance(pierwszy, ast.Constant) and isinstance(pierwszy.value, str):
            klucze.append(pierwszy.value)
    return klucze


def naruszenia_petli_kluczy(sciezka: str, plik: Path | None = None) -> list[Naruszenie]:
    """Klucz pola wstawiony do komunikatu ZMIENNĄ pętli po literałach (``f"pole {nazwa}"``)
    — reguła tekstowa widzi tylko ``{…}``, więc ta reguła czyta literały iteracji. W module
    tłumaczonym klucz w apostrofach z etykietą przechodzi (zamienia go
    ``komunikat_dla_projektanta``)."""
    drzewo = _drzewo(plik or SRC / sciezka)
    kanaly = kanaly_wywolan()
    wynik: list[Naruszenie] = []
    funkcja_wezla: dict[ast.AST, ast.AST] = {}
    for funkcja in ast.walk(drzewo):
        if isinstance(funkcja, ast.FunctionDef | ast.AsyncFunctionDef):
            for wezel in ast.walk(funkcja):
                funkcja_wezla[wezel] = funkcja  # najgłębsza funkcja wygrywa (walk: zewn.→wewn.)
    for petla in ast.walk(drzewo):
        if isinstance(petla, ast.For):
            funkcja = funkcja_wezla.get(petla)
            cel = petla.target.elts[0] if isinstance(petla.target, ast.Tuple) else petla.target
            if not isinstance(cel, ast.Name):
                continue
            klucze = [k for k in _klucze_iteracji(petla, funkcja) if kody_w_tekscie(k)]
            if not klucze:
                continue
            for wywolanie in ast.walk(petla):
                if not (isinstance(wywolanie, ast.Call) and _nazwa_wywolanej(wywolanie) in kanaly):
                    continue
                argumenty = [*wywolanie.args]
                argumenty += [k.value for k in wywolanie.keywords if k.arg in KANALY_SLOW]
                for napis in (n for a in argumenty for n in ast.walk(a)):
                    if not isinstance(napis, ast.JoinedStr):
                        continue
                    czesci = napis.values
                    for i, czesc in enumerate(czesci):
                        if not (
                            isinstance(czesc, ast.FormattedValue)
                            and isinstance(czesc.value, ast.Name)
                            and czesc.value.id == cel.id
                        ):
                            continue
                        w_apostrofach = (
                            i > 0
                            and isinstance(czesci[i - 1], ast.Constant)
                            and str(czesci[i - 1].value).endswith("`")  # type: ignore[attr-defined]
                        )
                        for klucz in klucze:
                            if (
                                w_apostrofach
                                and _tlumaczony(sciezka)
                                and etykieta_klucza(klucz) is not None
                            ):
                                continue
                            wynik.append(
                                Naruszenie(
                                    sciezka,
                                    napis.lineno,
                                    f"kod {klucz} (zmienna pętli {cel.id})",
                                    ast.unparse(napis),
                                )
                            )
    return sorted(set(wynik), key=lambda n: (n.linia, n.powod))


def _modul_pliku(sciezka: str) -> str:
    return sciezka.removesuffix(".py").removesuffix("/__init__").replace("/", ".")


def _argumenty_komunikatu(wywolanie: ast.Call) -> list[ast.expr]:
    """Argumenty wywołania kanału niosące TREŚĆ (pozycyjne i nazwane ``KANALY_SLOW``) — nie
    kod maszynowy (``kod=``), nie dane strukturalne (``dane=``)."""
    return [*wywolanie.args, *(k.value for k in wywolanie.keywords if k.arg in KANALY_SLOW)]


def _parametry(funkcja: ast.FunctionDef | ast.AsyncFunctionDef) -> tuple[list[str], list[str]]:
    pozycyjne = [a.arg for a in funkcja.args.posonlyargs + funkcja.args.args]
    if pozycyjne and pozycyjne[0] in {"self", "cls"}:
        pozycyjne = pozycyjne[1:]
    return pozycyjne, [a.arg for a in funkcja.args.kwonlyargs]


#: Miejsce parametru funkcji: (pozycja argumentu albo ``None`` dla parametru tylko-nazwanego,
#: nazwa parametru).
_MiejsceParametru = tuple[int | None, str]


@cache
def funkcje_parametryczne_src() -> dict[tuple[str, str], frozenset[_MiejsceParametru]]:
    """Funkcje (i konstruktory klas wyjątków), które wstawiają SWÓJ PARAMETR gołą
    interpolacją (``f"… {klucz} …"``) do treści kanału — wprost albo przechodnio przez
    inną taką funkcję. Klucz: (plik względem ``src``, nazwa funkcji albo klasy).

    Po co: reguła tekstowa widzi zdanie, a nie wartość podstawianą pod ``{klucz}``.
    Literał klucza podany takiej funkcji (``wymagany_float(dane, "cross_section_mm2")``)
    trafia do komunikatu tak samo jak wpisany w zdanie."""
    kanaly = kanaly_wywolan()
    definicje: dict[tuple[str, str], ast.FunctionDef | ast.AsyncFunctionDef] = {}
    for plik in sorted(SRC.rglob("*.py")):
        sciezka = plik.relative_to(SRC).as_posix()
        for wezel in _drzewo(plik).body:
            if isinstance(wezel, ast.FunctionDef | ast.AsyncFunctionDef):
                definicje[(sciezka, wezel.name)] = wezel
            elif isinstance(wezel, ast.ClassDef) and wezel.name in kanaly:
                for metoda in wezel.body:
                    if isinstance(metoda, ast.FunctionDef) and metoda.name == "__init__":
                        definicje[(sciezka, wezel.name)] = metoda
    miejsca: dict[tuple[str, str], set[_MiejsceParametru]] = {k: set() for k in definicje}

    def _miejsce(nazwa: str, pozycyjne: list[str], nazwane: list[str]) -> _MiejsceParametru | None:
        if nazwa in pozycyjne:
            return (pozycyjne.index(nazwa), nazwa)
        if nazwa in nazwane:
            return (None, nazwa)
        return None

    wylaczone = {tuple(wpis.split("::", 1)) for wpis in HELPERY_POZA_KLASA}
    for klucz, funkcja in definicje.items():
        if klucz in wylaczone:
            continue
        pozycyjne, nazwane = _parametry(funkcja)
        for wywolanie in ast.walk(funkcja):
            if not (
                isinstance(wywolanie, ast.Call)
                and _nazwa_wywolanej(wywolanie) in kanaly | {"__init__"}
            ):
                continue
            for napis in (n for a in _argumenty_komunikatu(wywolanie) for n in ast.walk(a)):
                if isinstance(napis, ast.JoinedStr):
                    for czesc in napis.values:
                        if isinstance(czesc, ast.FormattedValue) and isinstance(
                            czesc.value, ast.Name
                        ):
                            miejsce = _miejsce(czesc.value.id, pozycyjne, nazwane)
                            if miejsce is not None:
                                miejsca[klucz].add(miejsce)
    while True:
        zmiana = False
        for klucz, funkcja in definicje.items():
            if klucz in wylaczone:
                continue
            pozycyjne, nazwane = _parametry(funkcja)
            for wywolanie in ast.walk(funkcja):
                if not isinstance(wywolanie, ast.Call):
                    continue
                cel = _rozwiaz_wywolanie(klucz[0], wywolanie, definicje)
                if cel is None or cel == klucz or cel in wylaczone:
                    continue
                for argument in _argumenty_w_miejscach(wywolanie, miejsca[cel]):
                    if isinstance(argument, ast.Name):
                        miejsce = _miejsce(argument.id, pozycyjne, nazwane)
                        if miejsce is not None and miejsce not in miejsca[klucz]:
                            miejsca[klucz].add(miejsce)
                            zmiana = True
        if not zmiana:
            return {k: frozenset(v) for k, v in miejsca.items() if v}


@cache
def _importy_nazw(sciezka: str) -> dict[str, tuple[str, str]]:
    """Nazwa zaimportowana w module → (plik źródłowy względem ``src``, nazwa w nim)."""
    pliki = {_modul_pliku(p.relative_to(SRC).as_posix()): p for p in SRC.rglob("*.py")}
    wynik: dict[str, tuple[str, str]] = {}
    for wezel in ast.walk(_drzewo(SRC / sciezka)):
        if isinstance(wezel, ast.ImportFrom) and wezel.module in pliki:
            zrodlo = pliki[wezel.module].relative_to(SRC).as_posix()
            for alias in wezel.names:
                wynik[alias.asname or alias.name] = (zrodlo, alias.name)
    return wynik


def _rozwiaz_wywolanie(
    sciezka: str, wywolanie: ast.Call, definicje: Mapping[tuple[str, str], object]
) -> tuple[str, str] | None:
    """Definicja wołanej funkcji: ten sam moduł albo import z nazwy (bez zgadywania)."""
    if not isinstance(wywolanie.func, ast.Name):
        return None
    nazwa = wywolanie.func.id
    if (sciezka, nazwa) in definicje:
        return (sciezka, nazwa)
    zrodlo = _importy_nazw(sciezka).get(nazwa)
    return zrodlo if zrodlo in definicje else None


def _argumenty_w_miejscach(
    wywolanie: ast.Call, miejsca: frozenset[_MiejsceParametru] | set[_MiejsceParametru]
) -> list[ast.expr]:
    wynik: list[ast.expr] = []
    for pozycja, nazwa in miejsca:
        if pozycja is not None and pozycja < len(wywolanie.args):
            wynik.append(wywolanie.args[pozycja])
        wynik += [k.value for k in wywolanie.keywords if k.arg == nazwa]
    return wynik


def naruszenia_kluczy_w_argumentach(sciezka: str, plik: Path | None = None) -> list[Naruszenie]:
    """Literał klucza pola podany funkcji, która wstawia ten argument do treści kanału
    (``funkcje_parametryczne_src``), poza ``HELPERY_POZA_KLASA``."""
    parametryczne = funkcje_parametryczne_src()
    wynik: list[Naruszenie] = []
    drzewo = _drzewo(plik or SRC / sciezka)
    for wywolanie in ast.walk(drzewo):
        if not isinstance(wywolanie, ast.Call):
            continue
        cel = _rozwiaz_wywolanie(sciezka, wywolanie, parametryczne)
        if cel is None:
            continue
        for argument in _argumenty_w_miejscach(wywolanie, parametryczne[cel]):
            if (
                isinstance(argument, ast.Constant)
                and isinstance(argument.value, str)
                and " " not in argument.value
            ):
                for token in kody_w_tekscie(argument.value):
                    wynik.append(
                        Naruszenie(
                            sciezka,
                            wywolanie.lineno,
                            f"kod {token} (argument {cel[1]})",
                            argument.value,
                        )
                    )
    return wynik


# ---------------------------------------------------------------------------
# Reguły tej samej rodziny: identyfikator KODU zamiast słowa w zdaniu dla projektanta
# ---------------------------------------------------------------------------

#: Nazwa klasy w zapisie ``WielkieLiteryBezSpacji`` (co najmniej dwa człony).
_NAZWA_KLASY = re.compile(r"(?<![\w.`])([A-Z][a-z0-9]+(?:[A-Z][A-Za-z0-9]*)+)(?![\w])")
#: Nazwa klasy w zapisie atrybutu (``Measurement.sigma``) — także klasa jednoczłonowa.
_KLASA_Z_ATRYBUTEM = re.compile(r"(?<![\w.`])([A-Z][A-Za-z0-9]*)\.[a-z_][A-Za-z0-9_]*")
#: Wyrażenie wstawiające nazwę typu Pythona (``type(x).__name__``, ``x.__class__``).
_NAZWA_TYPU = re.compile(r"__name__|__class__|__qualname__")
#: Rdzenie polskich nazw rodzajów elementów i obiektów, które projektant rozpoznaje — przy
#: identyfikatorze w zdaniu stoi słowo mówiące, CZYM jest wskazany obiekt (rozstrzygnięcie
#: architekta 2026-10-29: identyfikator elementu zostaje jako wskazanie, warunkiem jest
#: polska nazwa rodzaju). Lista jest jawna; nowy rodzaj obiektu w komunikacie dopisuje się
#: tutaj, a nie omija regułę.
_RODZAJE_OBIEKTOW = re.compile(
    r"^(?:węz|węź|wez|szyn|gałą|gałę|galaz|galez|transformator|łączni|lacznik|stacj|pol[eau]$|pól"
    r"|źródł|zrodl|odbi|moduł|modul|profil|przypad|scenariusz|bieg|przebieg|projek|kryteri"
    r"|wymagani|kart|typ|pozycj|aparat|wkładk|pakiet|rodzin|wzor|szablon|element|blok|seri"
    r"|kopi|krzyw|charakterystyk|urządze|urzadze|generator|zabezpiecz|przekładnik|kab|lini"
    r"|bateri|magazyn|segment|krok|dokument|punkt|wysp|obliczeni|test|nastaw|format"
    r"|producent|wytwórc|zacisk|równani|rownani|rekord|detektor|dozor|zdarzeni|odcin|sekcj"
    r"|rozdzielnic|zwarci|analiz|ocen|raport|porównani|porownani|cennik|katalog|tor|obwód"
    r"|obwod|faz|przełącz|zaczep|odgromnik|ogranicznik|uziemie|rdzeń|rdzen|kondensator"
    r"|dławik|dlawik|turbin|falownik|przekształtnik|przeksztaltnik|składni|skladni|maszyn"
    r"|regulator|stabilizator|jednostk|odejści|odejsci|konfiguracj|migawk|operacj|przewód"
    r"|przewod|rcd$|der$|oze$|osd$|operator|wariant|grup|plik|warstw|zestaw|wynik|rozpływ"
    r"|rozplyw|ścieżk|sciezk|trasa|tras|miejsc|zasob|zasób)",
    re.IGNORECASE,
)
#: Słowa kotwiczące identyfikator (``o ID``, ``identyfikatorem``) — pomijane przy szukaniu
#: nazwy rodzaju, bo same nie mówią, czym jest obiekt.
_KOTWICE_IDENTYFIKATORA = re.compile(
    r"(?:\s+o)?\s+(?:ID|id|identyfikatorze|identyfikatorem|identyfikator|identyfikatora)$"
)
#: Zmienna niosąca kod maszynowy (nie zdanie): ``kod``, ``code``, ``kod_reguly``, ``error_code``.
_ZMIENNA_KODU = re.compile(r"(?:^|\.)(?:kod|code|kod_\w+|code_\w+|\w+_kod|\w+_code)$")
#: Nazwy parametrów niosących TREŚĆ komunikatu w konstruktorach wyjątków i opakowaniach.
_PARAMETRY_TRESCI: frozenset[str] = frozenset(
    {"komunikat", "message", "msg", "tekst", "tresc", "opis", "komunikat_pl", "message_pl"}
)


@cache
def klasy_src() -> frozenset[str]:
    """Nazwa każdej klasy zdefiniowanej w ``src`` (z drzewa składniowego)."""
    return frozenset(
        wezel.name
        for plik in sorted(SRC.rglob("*.py"))
        for wezel in ast.walk(_drzewo(plik))
        if isinstance(wezel, ast.ClassDef)
    )


def ma_nazwe_rodzaju(przed: str) -> bool:
    """Czy tekst stojący PRZED identyfikatorem nazywa rodzaj obiektu (ostatnie trzy słowa,
    bez cudzysłowów, nawiasu otwierającego i słów kotwiczących ``o ID``)."""
    tekst = przed.replace("⟨⟩", " ").rstrip(" '\"„“”«»(:=#[")
    tekst = _KOTWICE_IDENTYFIKATORA.sub("", tekst)
    slowa = re.findall(r"[^\W\d_][\w]*", tekst)[-3:]
    return any(_RODZAJE_OBIEKTOW.match(slowo) for slowo in slowa)


def _dane_wyrazenia(wyrazenie: ast.expr) -> list[ast.Name]:
    """Zmienne, których WARTOŚĆ wchodzi do wyrażenia (argument, element, operand) — bez
    odbiorcy metody (``seria.sorted_items()`` nie niesie tekstu ``seria``)."""
    odbiorcy = {
        id(w.value)
        for w in ast.walk(wyrazenie)
        if isinstance(w, ast.Attribute) and isinstance(w.value, ast.Name)
    }
    return [n for n in ast.walk(wyrazenie) if isinstance(n, ast.Name) and id(n) not in odbiorcy]


def _nazwy_skazone(drzewo: ast.Module) -> dict[int, set[str]]:
    """Zmienne lokalne funkcji, których wartość pochodzi z nazwy typu (``obce =
    tuple(type(z).__name__ for z in …)``), przechodnio — klucz: ``id`` funkcji."""
    wynik: dict[int, set[str]] = {}
    for funkcja in ast.walk(drzewo):
        if not isinstance(funkcja, ast.FunctionDef | ast.AsyncFunctionDef):
            continue
        skazone: set[str] = set()
        while True:
            nowe = {
                cel.id
                for wezel in ast.walk(funkcja)
                if isinstance(wezel, ast.Assign)
                for cel in wezel.targets
                if isinstance(cel, ast.Name)
                and cel.id not in skazone
                and (
                    _NAZWA_TYPU.search(ast.unparse(wezel.value))
                    or any(n.id in skazone for n in _dane_wyrazenia(wezel.value))
                )
            }
            if not nowe:
                break
            skazone |= nowe
        wynik[id(funkcja)] = skazone
    return wynik


def _w_apostrofach(czesci: list[ast.expr], i: int) -> bool:
    """Wstawka ``czesci[i]`` f-stringu stoi w odwróconych apostrofach (`` `{…}` ``)."""
    przed = czesci[i - 1] if i > 0 else None
    po = czesci[i + 1] if i + 1 < len(czesci) else None
    return (
        isinstance(przed, ast.Constant)
        and str(przed.value).endswith("`")
        and isinstance(po, ast.Constant)
        and str(po.value).startswith("`")
    )


def _nazwa_typu_tlumaczona(wyrazenie: ast.expr) -> bool:
    """``type(x).__name__`` — nazwa klasy, którą ``komunikat_dla_projektanta`` zamienia na
    rodzaj obiektu słowami (``NAZWY_KLAS_DYNAMIKI_PL``; kompletność przypina test rodzin)."""
    return (
        isinstance(wyrazenie, ast.Attribute)
        and wyrazenie.attr == "__name__"
        and isinstance(wyrazenie.value, ast.Call)
        and isinstance(wyrazenie.value.func, ast.Name)
        and wyrazenie.value.func.id == "type"
    )


def _zlaczenie_w_apostrofach(wezel: ast.AST) -> bool:
    """``", ".join(f"`{n}`" for n in …)`` — każdy element w odwróconych apostrofach."""
    return (
        isinstance(wezel, ast.Call)
        and isinstance(wezel.func, ast.Attribute)
        and wezel.func.attr == "join"
        and len(wezel.args) == 1
        and isinstance(wezel.args[0], ast.GeneratorExp)
        and isinstance(wezel.args[0].elt, ast.JoinedStr)
        and ast.unparse(wezel.args[0].elt).startswith("f'`{")
        and ast.unparse(wezel.args[0].elt).endswith("}`'")
    )


def naruszenia_nazw_i_identyfikatorow(sciezka: str, plik: Path | None = None) -> list[Naruszenie]:
    """Ta sama rodzina co klucz pola — identyfikator KODU w zdaniu dla projektanta:

    * ``klasa X`` — nazwa klasy ``src`` w tekście (``NetworkSnapshot``, ``Measurement.sigma``);
    * ``nazwa typu E`` — wstawka nazwy typu Pythona (``type(x).__name__``) albo zmiennej
      z niej wyprowadzonej; w module tłumaczonym ``type(x).__name__`` w odwróconych
      apostrofach przechodzi (rodzaj obiektu słowami z ``NAZWY_KLAS_DYNAMIKI_PL``);
    * ``identyfikator bez rodzaju E`` — identyfikator elementu bez polskiej nazwy rodzaju
      przed nim (``Run nie znaleziony: {run_id}``)."""
    drzewo = _drzewo(plik or SRC / sciezka)
    zakres = zakres_src(sciezka)
    klasy = klasy_src()
    tlumaczony = _tlumaczony(sciezka)
    skazone_funkcji = _nazwy_skazone(drzewo)
    funkcja_wezla: dict[int, ast.AST] = {}
    for funkcja in ast.walk(drzewo):
        if isinstance(funkcja, ast.FunctionDef | ast.AsyncFunctionDef):
            for wezel in ast.walk(funkcja):
                funkcja_wezla[id(wezel)] = funkcja
    rodzice_modulu = _rodzice(drzewo)
    wynik: list[Naruszenie] = []
    for komunikat, rodzice_tekstu in teksty_komunikatow(zakres, drzewo):
        wezel, tekst = komunikat.wezel, komunikat.tekst
        stale = tekst.replace(" ⟨⟩ ", " ")
        for nazwa in sorted(
            set(_NAZWA_KLASY.findall(stale)) | set(_KLASA_Z_ATRYBUTEM.findall(stale))
        ):
            if nazwa in klasy:
                wynik.append(Naruszenie(sciezka, wezel.lineno, f"klasa {nazwa}", tekst))
        if not isinstance(wezel, ast.JoinedStr):
            continue
        funkcja = funkcja_wezla.get(id(wezel))
        skazone = skazone_funkcji.get(id(funkcja), set()) if funkcja is not None else set()
        czesci = list(wezel.values)
        for i, czesc in enumerate(czesci):
            if not isinstance(czesc, ast.FormattedValue):
                continue
            wyrazenie = czesc.value
            zrodlo = ast.unparse(wyrazenie)
            uzyte = {n.id for n in _dane_wyrazenia(wyrazenie)} & skazone
            if _NAZWA_TYPU.search(zrodlo) or uzyte:
                dozwolone = tlumaczony and (
                    (_nazwa_typu_tlumaczona(wyrazenie) and _w_apostrofach(czesci, i))
                    or (
                        isinstance(wyrazenie, ast.Name)
                        and funkcja is not None
                        and all(
                            _zlaczenie_w_apostrofach(przypisanie.value)
                            for przypisanie in ast.walk(funkcja)
                            if isinstance(przypisanie, ast.Assign)
                            and any(
                                isinstance(c, ast.Name) and c.id == wyrazenie.id
                                for c in przypisanie.targets
                            )
                        )
                    )
                )
                if not dozwolone:
                    wynik.append(Naruszenie(sciezka, wezel.lineno, f"nazwa typu {zrodlo}", tekst))
            wyliczenie = _wartosc_wyliczenia(
                wyrazenie,
                czesc,
                sciezka,
                drzewo,
                rodzice_tekstu,
                plik or SRC / sciezka,
                rodzice_modulu,
            )
            if wyliczenie is not None:
                wynik.append(
                    Naruszenie(sciezka, wezel.lineno, f"wartość wyliczenia {wyliczenie}", tekst)
                )
            identyfikator = _interpolacja_identyfikatora(wyrazenie)
            if identyfikator is not None:
                przed = "".join(
                    str(c.value) if isinstance(c, ast.Constant) else " ⟨⟩ " for c in czesci[:i]
                )
                if not ma_nazwe_rodzaju(przed):
                    wynik.append(
                        Naruszenie(
                            sciezka,
                            wezel.lineno,
                            f"identyfikator bez rodzaju {identyfikator}",
                            tekst,
                        )
                    )
    zgloszone = {(n.linia, n.powod) for n in wynik}
    for komunikat, rodzice in teksty_komunikatow(ZakresModulu(sciezka), drzewo):
        wezel = komunikat.wezel
        if not isinstance(wezel, ast.JoinedStr) or _w_bledzie_programu(wezel, rodzice):
            continue
        czesci = list(wezel.values)
        for i, czesc in enumerate(czesci):
            if not (
                isinstance(czesc, ast.FormattedValue)
                and _NAZWA_TYPU.search(ast.unparse(czesc.value))
            ):
                continue
            if tlumaczony and _nazwa_typu_tlumaczona(czesc.value) and _w_apostrofach(czesci, i):
                continue
            powod = f"nazwa typu {ast.unparse(czesc.value)}"
            if (wezel.lineno, powod) not in zgloszone:
                wynik.append(Naruszenie(sciezka, wezel.lineno, powod, komunikat.tekst))
    return wynik


# ---------------------------------------------------------------------------
# Reguła sklejeń: kolekcja wklejona w zdanie — elementy rozstrzygnięte z ich źródła
# ---------------------------------------------------------------------------

#: Kolekcje sklejane w zdanie, których elementów składnia nie rozstrzyga (lista przychodzi
#: atrybutem obcego obiektu albo parametrem funkcji), a które SĄ tekstem dla projektanta
#: albo oznaczeniem normowym — klucz ``moduł:wyrażenie kolekcji``; uzasadnienie wskazuje,
#: skąd pochodzi tekst (żywotność: ``test_wylaczenia_sklejen_sa_zywe``).
KOLEKCJE_TEKSTOW_SRC: dict[str, str] = {
    "api/cloud_backup.py:result.errors": (
        "błędy `ProjectArchiveService.import_project`: zdania `verify_archive_integrity` "
        "(`domain/project_archive.py`) i treść błędu archiwum — oba w zakresie strażnika"
    ),
    "application/analyses/frt_sekwencja.py:errors": (
        "zdania walidacji wejścia FRT/HVRT (`frt_hvrt/contracts.py`, kanał `errors.append` "
        "w zakresie strażnika)"
    ),
    "network_model/solvers/frt_hvrt/contracts.py:errors": (
        "zdania tej samej funkcji walidacji (kanał `errors.append` w zakresie strażnika)"
    ),
    "network_model/solvers/ncrfg_ptpiree/engine.py:"
    "poziomy.lvrt_typy if lvrt else poziomy.hvrt_typy": (
        "typy modułu wytwarzania A–D (rozporządzenie 2016/631 art. 5) — `TypModulu`, "
        "oznaczenie normowe, nie kod"
    ),
    "network_model/solvers/ncrfg_ptpiree/engine.py:odbudowa.required_for_modules": (
        "typy modułu wytwarzania A–D (rozporządzenie 2016/631 art. 5) — `TypModulu`"
    ),
    "application/ncrfg_compliance/ocena_wymagan.py:dowod.zakres_typow": (
        "typy modułu wytwarzania A–D (rozporządzenie 2016/631 art. 5) — `TypModulu`"
    ),
    "application/ncrfg_compliance/ocena_wymagan.py:poziomy.lvrt_typy": (
        "typy modułu wytwarzania A–D (rozporządzenie 2016/631 art. 5) — `TypModulu`"
    ),
    "application/analyses/fault_loop/tt_it.py:braki": (
        "identyfikatory odcinków (kabel albo linia) bez susceptancji zerowej, zwracane przez "
        "`pojemnosci_sieci_it` — w zdaniu poprzedzone nazwą rodzaju „odcinki”"
    ),
    "application/koszty/lista_materialowa.py:bez_ilosci": (
        "pole `element` pozycji listy materiałowej — polska nazwa pozycji nadana przez "
        "`application/analyses/lista_materialowa.py` (np. „Transformator blokowy DER”)"
    ),
    "enm/kompilator_grafu.py:korzenie": (
        "identyfikatory szyn źródłowych grafu wejściowego (parametr wywołującego) — w zdaniu "
        "po nazwie rodzaju „szyn źródłowych”"
    ),
    "application/ncrfg_compliance/ocena_wymagan.py:self.certyfikat.zakres_typow": (
        "typy modułu wytwarzania A–D (rozporządzenie 2016/631 art. 5) z rekordu wykazu "
        "PTPiREE — `TypModulu` (`model_bridge._zakres_typow`), oznaczenie normowe, nie kod"
    ),
    "network_model/core/graph.py:nieznane": (
        "identyfikatory węzłów spoza grafu (parametr wołającego `wezly`) — w zdaniu po nazwie "
        "rodzaju „Węzły spoza grafu”"
    ),
    "application/ncrfg_compliance/model_bridge.py:nieznane": (
        "cytat oznaczeń zakresu typów zapisanych w rekordzie wykazu PTPiREE, które nie są "
        "typem A–D — dana z wykazu, nie kod systemu"
    ),
    "analysis/arc_flash/builder.py:opisy": (
        "opisy brakujących wpisów tablicy IEEE 1584-2018 z `ArcFlashCoefficientTable."
        "missing_for_pl` (np. „współczynniki prądu łuku dla kotwy 600 V (tab. 1)”) — zdania "
        "po polsku, kompletność przypina `tests/analysis/test_arc_flash_nazwy_wejsc.py`"
    ),
    "application/analyses/sekcja_zgodnosci_ncrfg.py:dowod.zakres_typow": (
        "typy modułu wytwarzania A–D (rozporządzenie 2016/631 art. 5) z rekordu wykazu "
        "PTPiREE — `TypModulu`, oznaczenie normowe, nie kod"
    ),
    "application/koszty/wycena.py:self.nazwy_bez_ceny": (
        "nazwy pozycji listy materiałowej (`_nazwa_pozycji` → `PozycjaListy.nazwa_pl`)"
    ),
    "application/koszty/wycena.py:self.nazwy_niezgodnej_jednostki": (
        "nazwy pozycji listy materiałowej (`_nazwa_pozycji` → `PozycjaListy.nazwa_pl`)"
    ),
    "application/koszty/wycena.py:self.pozycje_bez_typu": (
        "nazwy pozycji listy materiałowej bez typu katalogowego (`PozycjaListy.nazwa_pl`)"
    ),
    "werdykt/wyjasnienie.py:powody_niepelnosci": (
        "zdania powodów niepełności dowodu z `wyjasnienie.powod_*` (wywołujący: "
        "`decyzja._powody_niepelnosci`, lista `powody` w zakresie strażnika)"
    ),
    "dziedziny/sekcje.py:sufit_powody": (
        "zdania sufitu jakości z `_sufit_jakosci` (lista `powody` w `LISTY_KOMUNIKATOW` — "
        "każde zdanie sprawdzane regułami tekstu; etykiety pól z `PoleSekcji.etykieta_pl`)"
    ),
    "network_model/solvers/ncrfg_ptpiree/stosowalnosc.py:wymaganie.typy": (
        "typy modułu wytwarzania A–D (rozporządzenie 2016/631 art. 5) — `TypModulu`, "
        "oznaczenie normowe, nie kod"
    ),
    "network_model/solvers/ncrfg_ptpiree/stosowalnosc.py:zdolnosci": (
        "polskie nazwy zdolności dodatkowych z `_wymagane_zdolnosci_dodatkowe` („praca "
        "wyspowa”, „rozruch autonomiczny”, „tłumienie oscylacji mocy”) — wynik funkcji, której "
        "składnia wywołania nie rozstrzyga"
    ),
}

#: Kolekcje sklejane w zdanie, których elementy są TOKENAMI FORMATU DANYCH (slug ścieżki
#: API, nazwa operacji API, nagłówek CSV, wartość słownika pliku YAML katalogu albo cennika,
#: klucz rekordu pliku modelu) — cytat zapisu formatu jest jedynym precyzyjnym wskazaniem
#: dla autora danych. Klucz ``moduł:wyrażenie kolekcji`` (żywotność:
#: ``test_wylaczenia_sklejen_sa_zywe``).
KOLEKCJE_FORMATU_DANYCH: dict[str, str] = {
    "api/catalog.py:sorted(pozycje)": "slugi rodzin w ścieżce `GET …/przeglad-wiarygodnosci/{rodzina}`",
    "api/enm.py:sorted(_OP_DISPATCH.keys())": "nazwy operacji pola `op` żądania API modelu",
    "application/analyses/odpowiedz_osd.py:sorted(_COMMANDS)": (
        "wartości pola `command` żądania API odpowiedzi na polecenie OSD"
    ),
    "catalog/cenniki/loader.py:KOLEJNOSC_STANOW": "wartości klucza `status` pliku YAML cennika",
    "catalog/profiles/nc_rfg/loader.py:_KOLEJNOSC_STANOW": (
        "wartości klucza `status` pliku YAML warstwy profilu NC RfG — odmowa wczytania pliku "
        "cytuje dozwolone wartości, które autor wpisuje (decyzja B-01 2026-10-30)"
    ),
    "catalog/profiles/nc_rfg/loader.py:(w.wersja for w in wykaz.wersje)": (
        "wartości klucza `wersja` wykazu WiPWC w pliku YAML warstwy — autor pliku poprawia "
        "powtórzony wpis po jego wartości"
    ),
    "catalog/profiles/nc_rfg/loader.py:sorted(wersje)": "wartości klucza `wersja` wykazu WiPWC w pliku YAML warstwy",
    "catalog/profiles/nc_rfg/loader.py:sorted({i for i in identyfikatory if identyfikatory.count(i) > 1})": (
        "identyfikatory wpisów pliku YAML (klucz `id` wymagań, pozycji Banku Nastaw i programu "
        "badań) — autor pliku usuwa duplikat po identyfikatorze, którego sam użył"
    ),
    "catalog/profiles/nc_rfg/loader.py:nieznane_pokrycie": (
        "identyfikatory wymagań (klucz `id`) wskazane w pokryciu certyfikatem pliku YAML "
        "warstwy WiPWC, których katalog wymagań nie ma"
    ),
    "catalog/profiles/nc_rfg/loader.py:bez_prawa": (
        "identyfikatory wymagań (klucz `id`) w sekcji wykonania prawa pliku YAML operatora, "
        "wobec których rozporządzenie nie przyznaje prawa"
    ),
    "catalog/profiles/nc_rfg/loader.py:sorted(self.parametry)": "klucze sekcji `parametry` scenariusza w pliku YAML programu badań",
    "catalog/profiles/nc_rfg/loader.py:sorted(self.jednostki)": "klucze sekcji `jednostki` scenariusza w pliku YAML programu badań",
    "catalog/profiles/nc_rfg/loader.py:nieznane": "nazwy grup sekcji pliku YAML operatora albo WOS spoza słownika profilu",
    "catalog/profiles/nc_rfg/loader.py:sorted(poza_warstwa)": (
        "wartości klucza `technologie` wymagania w pliku YAML warstwy (PPM, SPGM, MAGAZYN)"
    ),
    "catalog/profiles/nc_rfg/loader.py:sorted(_TECHNOLOGIE_WARSTWY[warstwa])": (
        "dozwolone wartości klucza `technologie` wymagania tej warstwy w pliku YAML"
    ),
    "catalog/cenniki/loader.py:WALUTY_OBSLUGIWANE": (
        "kody walut ISO 4217 klucza `waluta` pliku YAML cennika"
    ),
    "network_model/catalog/types.py:sorted(TOPOLOGIE_PRZEKSZTALTNIKA)": (
        "wartości pola topologii przekształtnika w pliku katalogu typów"
    ),
    "network_model/catalog/types.py:sorted(obecne)": (
        "klucze pól toru maszyny (`POLA_TORU_MASZYNY`) w rekordzie pliku katalogu typów — "
        "autor danych usuwa dokładnie te klucze z rekordu (reguła KAT-T-042)"
    ),
    "network_model/catalog/types.py:PRZEZNACZENIA_PRZEWODU": (
        "wartości pola przeznaczenia przewodu w pliku katalogu typów"
    ),
    "network_model/catalog/wartosci_robocze.py:TOLERANCJE_NAPIECIA_NN": (
        "wartości słownika tolerancji napięcia nN (tabela 1 IEC 60909-0) wpisywane w arkuszu "
        "i w polu modelu"
    ),
    "application/xlsx_import/importer.py:brakujace": (
        "nagłówki kolumn arkusza importu (tabliczka przewodu albo transformatora) — projektant "
        "wpisuje dokładnie ten nagłówek, więc komunikat musi go zacytować"
    ),
    "infrastructure/cgmes/cgmes_importer.py:rodzaje": (
        "nazwy klas CIM jednostek przekształtnika (`PowerElectronicsWindUnit`, "
        "`PhotoVoltaicUnit`, `BatteryUnit`) z importowanego pliku CGMES — cytat zapisu pliku "
        "po słowach „klasy jednostek CIM”"
    ),
    "enm/adapter_dynamiki.py:nadmiarowe": (
        "klucze opcji biegu podane przez klienta API spoza kontraktu nastaw solvera — cytat "
        "odrzuconego klucza żądania"
    ),
    "domain/canonical_operations.py:aliases": "klucze zastępcze ładunku operacji API modelu",
    "enm/pola.py:nieznane": "cytat kluczy rekordu pola spoza kontraktu w pliku modelu",
    "enm/pola.py:zakazane": "cytat kluczy `meta` rekordu pola w pliku modelu",
    "enm/migrations/field_specs_promocja.py:nieznane": (
        "cytat kluczy dawnego wpisu pola stacji w pliku modelu przed migracją"
    ),
    "api/fault_loop.py:net_type_map": (
        "wartości pola `network_type` żądania API pętli zwarcia — oznaczenia układu sieci "
        "wg PN-HD 60364-1 §312.2 (TN-S, TN-C-S, TN-C, TT, IT)"
    ),
    "api/fault_loop.py:pa_map": (
        "wartości pola `protection_arrangement` żądania API pętli zwarcia (PE, PEN — "
        "oznaczenia przewodów wg PN-HD 60364-5-54; NONE — wartość pola bez przewodu "
        "ochronnego)"
    ),
    "api/station_templates.py:(c.value for c in TemplateCategory)": (
        "wartości parametru zapytania `category` ścieżki `GET …/station-templates`"
    ),
    "infrastructure/persistence/repositories/canonical_run_repository.py:obce": (
        "klucze ładunku rozpływu punktu spoza kolumn tabeli (`KOLUMNY_ROZPLYWU`) — diagnoza "
        "niezgodności zapisu z formatem tabeli"
    ),
    "application/contracts/resultset_dynamic_v2.py:rozne[:5]": (
        "klucze szeregów próbek wyniku czasowego (adresy `element.stan` kontraktu ResultSet "
        "dynamiki v2) — diagnoza niezgodności długości szeregów zapisu"
    ),
    "network_model/catalog/types.py:RODZAJE_PRADU_ROZNICOWEGO_RCD": (
        "wartości pola `rcd_type` pliku katalogu typów — oznaczenia typów RCD wg IEC 60755 / "
        "IEC 62423 (AC, A, F, B), które autor danych wpisuje"
    ),
}

#: Metody tekstu, które wywołane ze stałymi przekształcają zapis, nie treść elementu.
_PRZEKSZTALCENIA_TEKSTU: frozenset[str] = frozenset(
    {"replace", "strip", "rstrip", "lstrip", "lower", "upper", "capitalize"}
)
#: Wywołania zwracające tę samą kolekcję (porządek, kopia, zbiór).
_OPAKOWANIA_KOLEKCJI: frozenset[str] = frozenset(
    {"sorted", "list", "tuple", "set", "frozenset", "reversed", "fromkeys", "w_cudzyslowie"}
)
#: Metody dokładające do kolekcji: pojedynczy element albo całą kolekcję.
_DOKLADAJACE_ELEMENT: frozenset[str] = frozenset({"append", "add", "appendleft"})
_DOKLADAJACE_KOLEKCJE: frozenset[str] = frozenset({"extend", "update"})
#: Mapa tekstów po polsku — jej wartości są tekstem dla projektanta (konwencja nazw).
_MAPA_TEKSTOW = re.compile(r"^(?:NAZWY_\w+|ETYKIETA_PL_\w+|ETYKIETY_\w+|OPISY_\w+|\w+_PL)$")
#: Samodzielny element pisany wielkimi literami — kod wartości (``FINISHED``, ``PF``),
#: chyba że jest skrótem inżynierskim albo symbolem wielkości.
_ELEMENT_WIELKIMI = re.compile(r"^[A-Z][A-Z0-9]+$")
#: Samodzielny element ``maly_z_podkreslnikiem`` albo ``kebab-case`` — klucz albo kod.
_ELEMENT_KLUCZ = re.compile(r"^[a-z][a-z0-9]*(?:[_-][a-z0-9]+)+$")

#: Wyrażenie niosące identyfikator elementu (``ref_id``, ``x.edge_id``, ``odbior.ident``) —
#: wskazanie elementu, dopuszczalne przy polskiej nazwie rodzaju przed listą.
_ID_ELEMENTU = re.compile(r"(?:^|\.)(?:ref_id|ref|id|ident|\w+_ref|\w+_id)$")


@dataclass(frozen=True)
class _Element:
    """Element kolekcji: wyrażenie, plik, w którym stoi, i zmienne pętli w jego zasięgu."""

    wyrazenie: ast.expr
    sciezka: str
    srodowisko: tuple[tuple[str, tuple[_Element, ...] | None], ...] = ()

    def zmienna(self, nazwa: str) -> tuple[bool, tuple[_Element, ...] | None]:
        for klucz, wartosc in self.srodowisko:
            if klucz == nazwa:
                return True, wartosc
        return False, None


def _kody_poza_formatem(sciezka: str, kody: list[str]) -> list[str]:
    """Kody tekstu elementu bez tokenów formatu danych modułu, w którym tekst stoi
    (``TOKENY_FORMATU_DANYCH`` — ten sam wpis co dla tekstu wprost w kanale)."""
    return [kod for kod in kody if f"{sciezka}:{kod}" not in TOKENY_FORMATU_DANYCH]


@cache
def _rodzice_src(sciezka: str) -> dict[int, ast.AST]:
    return _rodzice(_drzewo(SRC / sciezka))


class _Sklejenia:
    """Rozstrzyganie elementów kolekcji sklejanej w zdanie z jej źródła w kodzie: literał,
    wyrażenie listowe, przypisanie, ``append``/``extend``, stała modułu (także importowana),
    klucze i wartości słownika, ``get_args`` aliasu ``Literal``. Element nierozstrzygnięty
    jest naruszeniem (strażnik nie zgaduje), chyba że kolekcja ma wpis
    ``KOLEKCJE_TEKSTOW_SRC``."""

    def __init__(self, sciezka: str, drzewo: ast.Module) -> None:
        self.sciezka = sciezka
        self.drzewa: dict[str, ast.Module] = {sciezka: drzewo}
        self.rodzice: dict[str, dict[int, ast.AST]] = {sciezka: _rodzice(drzewo)}

    # -- pomocnicze ---------------------------------------------------------------
    def _drzewo_pliku(self, sciezka: str) -> tuple[ast.Module, dict[int, ast.AST]]:
        if sciezka not in self.drzewa:
            self.drzewa[sciezka] = _drzewo(SRC / sciezka)
            self.rodzice[sciezka] = _rodzice_src(sciezka)
        return self.drzewa[sciezka], self.rodzice[sciezka]

    def _zasiegi(self, wezel: ast.AST, sciezka: str) -> list[ast.AST]:
        _drzewo_pliku, rodzice = self._drzewo_pliku(sciezka)
        wynik: list[ast.AST] = []
        przodek = rodzice.get(id(wezel))
        while przodek is not None:
            if isinstance(przodek, ast.FunctionDef | ast.AsyncFunctionDef | ast.Module):
                wynik.append(przodek)
            przodek = rodzice.get(id(przodek))
        return wynik

    @staticmethod
    def _wezly_zasiegu(zasieg: ast.AST) -> Iterator[ast.AST]:
        """Węzły zasięgu bez ciał zagnieżdżonych funkcji, klas i lambd (inne zasięgi)."""
        stos = list(ast.iter_child_nodes(zasieg))
        while stos:
            wezel = stos.pop()
            yield wezel
            if not isinstance(
                wezel, ast.FunctionDef | ast.AsyncFunctionDef | ast.ClassDef | ast.Lambda
            ):
                stos.extend(ast.iter_child_nodes(wezel))

    def _srodowisko_petli(
        self, wezel: ast.AST, sciezka: str, glebokosc: int
    ) -> tuple[tuple[str, tuple[_Element, ...] | None], ...]:
        """Zmienne pętli ``for`` otaczających węzeł (w tej samej funkcji)."""
        _drzewo_pliku, rodzice = self._drzewo_pliku(sciezka)
        wynik: list[tuple[str, tuple[_Element, ...] | None]] = []
        przodek = rodzice.get(id(wezel))
        while przodek is not None and not isinstance(
            przodek, ast.FunctionDef | ast.AsyncFunctionDef | ast.Module
        ):
            if isinstance(przodek, ast.For):
                wynik += self._wiazania(przodek.target, _Element(przodek.iter, sciezka), glebokosc)
            przodek = rodzice.get(id(przodek))
        return tuple(wynik)

    def _wiazania(
        self, cel: ast.expr, iterowane: _Element, glebokosc: int
    ) -> list[tuple[str, tuple[_Element, ...] | None]]:
        """Zmienne celu pętli → elementy iterowanej kolekcji (krotka: pozycja w literale)."""
        elementy = self.elementy(iterowane, glebokosc + 1)
        if isinstance(cel, ast.Name):
            return [(cel.id, None if elementy is None else tuple(elementy))]
        if isinstance(cel, ast.Tuple):
            wynik: list[tuple[str, tuple[_Element, ...] | None]] = []
            for i, czlon in enumerate(cel.elts):
                if not isinstance(czlon, ast.Name):
                    continue
                if elementy is None or not all(
                    isinstance(e.wyrazenie, ast.Tuple) and len(e.wyrazenie.elts) > i
                    for e in elementy
                ):
                    wynik.append((czlon.id, None))
                    continue
                wynik.append(
                    (
                        czlon.id,
                        tuple(
                            _Element(e.wyrazenie.elts[i], e.sciezka, e.srodowisko)  # type: ignore[attr-defined]
                            for e in elementy
                        ),
                    )
                )
            return wynik
        return []

    def _wartosci_celu_petli(
        self, petla: ast.For | ast.comprehension, nazwa: str, sciezka: str, glebokosc: int
    ) -> list[_Element] | None:
        """Wartości zmiennej pętli: elementy iterowanej kolekcji (cel ``x``) albo pozycja
        krotek literału (cel ``(a, b)`` po krotce krotek tej samej długości); ``None`` —
        składnia nie rozstrzyga."""
        if isinstance(petla.target, ast.Name):
            return self.elementy(_Element(petla.iter, sciezka), glebokosc + 1)
        if not isinstance(petla.target, ast.Tuple) or not isinstance(
            petla.iter, ast.Tuple | ast.List
        ):
            return None
        pozycje = [
            i for i, c in enumerate(petla.target.elts) if isinstance(c, ast.Name) and c.id == nazwa
        ]
        if len(pozycje) != 1:
            return None
        wartosci: list[_Element] = []
        for krotka in petla.iter.elts:
            if not isinstance(krotka, ast.Tuple | ast.List) or len(krotka.elts) != len(
                petla.target.elts
            ):
                return None
            wartosci.append(_Element(krotka.elts[pozycje[0]], sciezka))
        return wartosci

    def _cel_petli(self, wezel: ast.Name, sciezka: str) -> bool:
        """Czy zmienna jest w najbliższym zasięgu, który ją definiuje, WYŁĄCZNIE celem pętli
        (``for x in …``, ``for a, b in …``, wyrażenie listowe) — bez przypisania i bez
        dokładania elementów (``x.append``)."""
        for zasieg in self._zasiegi(wezel, sciezka):
            cele = przypisania = 0
            for w in self._wezly_zasiegu(zasieg):
                if isinstance(w, ast.For | ast.comprehension) and any(
                    isinstance(c, ast.Name) and c.id == wezel.id for c in ast.walk(w.target)
                ):
                    cele += 1
                elif (
                    isinstance(w, ast.Assign | ast.AnnAssign | ast.AugAssign)
                    and any(
                        isinstance(c, ast.Name) and c.id == wezel.id
                        for cel in (w.targets if isinstance(w, ast.Assign) else [w.target])
                        for c in ast.walk(cel)
                    )
                ) or (
                    isinstance(w, ast.Call)
                    and isinstance(w.func, ast.Attribute)
                    and isinstance(w.func.value, ast.Name)
                    and w.func.value.id == wezel.id
                ):
                    przypisania += 1
            if cele or przypisania:
                return bool(cele) and not przypisania
        return False

    def _zrodla_nazwy(
        self, nazwa: str, wezel: ast.AST, sciezka: str, glebokosc: int
    ) -> tuple[list[_Element], list[_Element]] | None:
        """Źródła zmiennej: (całe kolekcje/wartości, pojedyncze elementy dokładane);
        ``None`` — parametr bez miejsc wywołań, cel pętli, którego składnia nie rozstrzyga
        (``_wartosci_celu_petli``), albo brak definicji."""
        for zasieg in self._zasiegi(wezel, sciezka):
            cale: list[_Element] = []
            pojedyncze: list[_Element] = []
            if isinstance(zasieg, ast.FunctionDef | ast.AsyncFunctionDef):
                argumenty = zasieg.args
                if nazwa in {
                    a.arg
                    for a in (
                        *argumenty.posonlyargs,
                        *argumenty.args,
                        *argumenty.kwonlyargs,
                        *(x for x in (argumenty.vararg, argumenty.kwarg) if x is not None),
                    )
                }:
                    return self._argumenty_wywolan(zasieg, nazwa, sciezka, glebokosc)
            for w in self._wezly_zasiegu(zasieg):
                if isinstance(w, ast.Assign):
                    for cel in w.targets:
                        if (
                            isinstance(cel, ast.Subscript)
                            and isinstance(cel.value, ast.Name)
                            and cel.value.id == nazwa
                            and not isinstance(cel.slice, ast.Slice)
                        ):
                            # ``slownik[klucz] = …`` — sklejenie słownika wkleja klucze
                            pojedyncze.append(
                                _Element(
                                    cel.slice,
                                    sciezka,
                                    self._srodowisko_petli(w, sciezka, glebokosc),
                                )
                            )
                        elif isinstance(cel, ast.Name) and cel.id == nazwa:
                            cale.append(
                                _Element(
                                    w.value, sciezka, self._srodowisko_petli(w, sciezka, glebokosc)
                                )
                            )
                        elif isinstance(cel, ast.Tuple) and any(
                            isinstance(c, ast.Name) and c.id == nazwa for c in cel.elts
                        ):
                            return None
                elif (
                    isinstance(w, ast.AnnAssign | ast.AugAssign)
                    and isinstance(w.target, ast.Name)
                    and w.target.id == nazwa
                    and w.value is not None
                ):
                    cale.append(
                        _Element(w.value, sciezka, self._srodowisko_petli(w, sciezka, glebokosc))
                    )
                elif isinstance(w, ast.For | ast.comprehension) and any(
                    isinstance(c, ast.Name) and c.id == nazwa for c in ast.walk(w.target)
                ):
                    wartosci = self._wartosci_celu_petli(w, nazwa, sciezka, glebokosc)
                    if wartosci is None:
                        return None
                    pojedyncze += wartosci
                elif (
                    isinstance(w, ast.Call)
                    and isinstance(w.func, ast.Attribute)
                    and isinstance(w.func.value, ast.Name)
                    and w.func.value.id == nazwa
                    and w.args
                ):
                    srodowisko = self._srodowisko_petli(w, sciezka, glebokosc)
                    if w.func.attr in _DOKLADAJACE_ELEMENT:
                        pojedyncze.append(_Element(w.args[-1], sciezka, srodowisko))
                    elif w.func.attr == "insert" and len(w.args) == 2:
                        pojedyncze.append(_Element(w.args[1], sciezka, srodowisko))
                    elif w.func.attr in _DOKLADAJACE_KOLEKCJE:
                        cale.append(_Element(w.args[0], sciezka, srodowisko))
            if cale or pojedyncze:
                return cale, pojedyncze
        zaimportowana = _importy_nazw(sciezka).get(nazwa) if (SRC / sciezka).exists() else None
        if zaimportowana is not None and glebokosc < 8:
            plik, nazwa_w_pliku = zaimportowana
            drzewo, _rodzice_pliku = self._drzewo_pliku(plik)
            return (
                self._zrodla_nazwy(nazwa_w_pliku, drzewo.body[0], plik, glebokosc + 1)
                if drzewo.body
                else None
            )
        return None

    def _argumenty_wywolan(
        self,
        funkcja: ast.FunctionDef | ast.AsyncFunctionDef,
        nazwa: str,
        sciezka: str,
        glebokosc: int,
    ) -> tuple[list[_Element], list[_Element]] | None:
        """Wartości parametru ``nazwa`` funkcji z jej wywołań w tym samym module (argument
        pozycyjny, nazwany albo wartość domyślna). ``None`` — funkcja bez wywołań w module
        (wołana z zewnątrz albo przekazywana dalej) albo wywołanie z ``*args``/``**kwargs``:
        wartości poza zasięgiem składni."""
        if glebokosc > 6 or funkcja.name == "__init__":
            # Parametr konstruktora: wywołaniem jest utworzenie obiektu klasy (często w innym
            # module), a ``super().__init__(…)`` w tym samym pliku woła konstruktor BAZY — nie
            # ten — więc wartości parametru są poza zasięgiem składni.
            return None
        drzewo, _rodzice_pliku = self._drzewo_pliku(sciezka)
        argumenty = funkcja.args
        pozycyjne = [a.arg for a in (*argumenty.posonlyargs, *argumenty.args)]
        metoda = bool(pozycyjne) and pozycyjne[0] in {"self", "cls"}
        if metoda:
            pozycyjne = pozycyjne[1:]
        if nazwa in {x.arg for x in (argumenty.vararg, argumenty.kwarg) if x is not None}:
            return None
        domyslne: dict[str, ast.expr] = {}
        wszystkie_pozycyjne = [a.arg for a in (*argumenty.posonlyargs, *argumenty.args)]
        for arg, wartosc in zip(
            wszystkie_pozycyjne[len(wszystkie_pozycyjne) - len(argumenty.defaults) :],
            argumenty.defaults,
            strict=True,
        ):
            domyslne[arg] = wartosc
        for arg, wartosc in zip(argumenty.kwonlyargs, argumenty.kw_defaults, strict=True):
            if wartosc is not None:
                domyslne[arg.arg] = wartosc
        wartosci: list[_Element] = []
        wywolania = 0
        for wywolanie in ast.walk(drzewo):
            if not isinstance(wywolanie, ast.Call):
                continue
            cel = wywolanie.func
            if not (
                (isinstance(cel, ast.Name) and cel.id == funkcja.name)
                or (isinstance(cel, ast.Attribute) and cel.attr == funkcja.name and metoda)
            ):
                continue
            wywolania += 1
            if any(isinstance(a, ast.Starred) for a in wywolanie.args) or any(
                k.arg is None for k in wywolanie.keywords
            ):
                return None
            podany: ast.expr | None = next(
                (k.value for k in wywolanie.keywords if k.arg == nazwa), None
            )
            if podany is None and nazwa in pozycyjne:
                pozycja = pozycyjne.index(nazwa)
                if pozycja < len(wywolanie.args):
                    podany = wywolanie.args[pozycja]
            if podany is None:
                podany = domyslne.get(nazwa)
            if podany is None:
                return None
            wartosci.append(
                _Element(podany, sciezka, self._srodowisko_petli(wywolanie, sciezka, glebokosc))
            )
        if not wywolania:
            return None
        return wartosci, []

    def _slownik(self, wyrazenie: ast.expr, element: _Element, glebokosc: int) -> ast.Dict | None:
        if isinstance(wyrazenie, ast.Dict):
            return wyrazenie
        if isinstance(wyrazenie, ast.Name):
            zrodla = self._zrodla_nazwy(wyrazenie.id, wyrazenie, element.sciezka, glebokosc)
            if zrodla is None or zrodla[1] or len(zrodla[0]) != 1:
                return None
            zrodlo = zrodla[0][0]
            return self._slownik(zrodlo.wyrazenie, zrodlo, glebokosc + 1)
        return None

    # -- elementy kolekcji ----------------------------------------------------------
    def elementy(self, kolekcja: _Element, glebokosc: int = 0) -> list[_Element] | None:
        """Elementy kolekcji; ``None`` — źródło poza zasięgiem składni."""
        if glebokosc > 10:
            return None
        rdzen = kolekcja.wyrazenie
        while True:
            if (
                isinstance(rdzen, ast.Call)
                and _nazwa_wywolanej(rdzen) in _OPAKOWANIA_KOLEKCJI
                and rdzen.args
            ):
                rdzen = rdzen.args[0]
            elif isinstance(rdzen, ast.Subscript) and isinstance(rdzen.slice, ast.Slice):
                rdzen = rdzen.value
            else:
                break
        w_tym_samym = lambda w: _Element(w, kolekcja.sciezka, kolekcja.srodowisko)  # noqa: E731
        if isinstance(rdzen, ast.Tuple | ast.List | ast.Set):
            wynik: list[_Element] = []
            for czlon in rdzen.elts:
                if isinstance(czlon, ast.Starred):
                    czesc = self.elementy(w_tym_samym(czlon.value), glebokosc + 1)
                    if czesc is None:
                        return None
                    wynik += czesc
                else:
                    wynik.append(w_tym_samym(czlon))
            return wynik
        if isinstance(rdzen, ast.Dict):
            return [w_tym_samym(k) for k in rdzen.keys if k is not None]
        if isinstance(rdzen, ast.GeneratorExp | ast.ListComp | ast.SetComp):
            srodowisko = list(kolekcja.srodowisko)
            for generator in rdzen.generators:
                iterowane = _Element(generator.iter, kolekcja.sciezka, tuple(srodowisko))
                srodowisko = self._wiazania(generator.target, iterowane, glebokosc) + srodowisko
            return [_Element(rdzen.elt, kolekcja.sciezka, tuple(srodowisko))]
        if isinstance(rdzen, ast.BinOp) and isinstance(rdzen.op, ast.Add | ast.BitOr | ast.Sub):
            lewe = self.elementy(w_tym_samym(rdzen.left), glebokosc + 1)
            if isinstance(rdzen.op, ast.Sub):
                return lewe
            prawe = self.elementy(w_tym_samym(rdzen.right), glebokosc + 1)
            return None if lewe is None or prawe is None else lewe + prawe
        if isinstance(rdzen, ast.Call) and isinstance(rdzen.func, ast.Attribute):
            metoda = rdzen.func.attr
            if metoda in {"keys", "values"}:
                if (
                    metoda == "values"
                    and isinstance(rdzen.func.value, ast.Name)
                    and _MAPA_TEKSTOW.match(rdzen.func.value.id)
                ):
                    return [w_tym_samym(ast.Constant("tekst mapy etykiet po polsku"))]
                slownik = self._slownik(rdzen.func.value, kolekcja, glebokosc)
                if slownik is None:
                    return None
                czlony = slownik.keys if metoda == "keys" else slownik.values
                return [w_tym_samym(c) for c in czlony if c is not None]
        if (
            isinstance(rdzen, ast.Call)
            and _nazwa_wywolanej(rdzen) == "map"
            and len(rdzen.args) == 2
        ):
            funkcja = rdzen.args[0]
            if isinstance(funkcja, ast.Name) and _funkcja_nazywajaca(funkcja.id):
                return [w_tym_samym(ast.Constant("tekst funkcji nazywającej"))]
            return None
        if isinstance(rdzen, ast.Call) and _nazwa_wywolanej(rdzen) == "get_args" and rdzen.args:
            alias = rdzen.args[0]
            if isinstance(alias, ast.Name):
                zrodla = self._zrodla_nazwy(alias.id, alias, kolekcja.sciezka, glebokosc)
                if zrodla and len(zrodla[0]) == 1 and not zrodla[1]:
                    literal = zrodla[0][0]
                    if isinstance(literal.wyrazenie, ast.Subscript):
                        return self.elementy(
                            _Element(literal.wyrazenie.slice, literal.sciezka), glebokosc + 1
                        )
            return None
        if isinstance(rdzen, ast.Call) and isinstance(rdzen.func, ast.Name):
            return self._wynik_funkcji(rdzen.func.id, kolekcja, glebokosc)
        if isinstance(rdzen, ast.Name):
            znana, wartosc = kolekcja.zmienna(rdzen.id)
            if znana:
                return None  # kolekcja niesiona zmienną pętli — poza zasięgiem składni
            zrodla = self._zrodla_nazwy(rdzen.id, rdzen, kolekcja.sciezka, glebokosc)
            if zrodla is None:
                return None
            cale, pojedyncze = zrodla
            wynik = list(pojedyncze)
            for zrodlo in cale:
                if isinstance(zrodlo.wyrazenie, ast.Constant) and zrodlo.wyrazenie.value in (
                    None,
                    "",
                ):
                    continue
                czesc = self.elementy(zrodlo, glebokosc + 1)
                if czesc is None:
                    return None
                wynik += czesc
            return wynik
        return None

    def _wynik_funkcji(
        self, nazwa: str, wywolanie: _Element, glebokosc: int, *, pojedynczy: bool = False
    ) -> list[_Element] | None:
        """Elementy wyniku funkcji ``src`` (ten sam moduł albo import z nazwy): wartości
        jej instrukcji ``return`` rozstrzygnięte w zasięgu funkcji."""
        sciezka = wywolanie.sciezka
        drzewo, _rodzice_pliku = self._drzewo_pliku(sciezka)
        definicja = next(
            (
                w
                for w in drzewo.body
                if isinstance(w, ast.FunctionDef | ast.AsyncFunctionDef) and w.name == nazwa
            ),
            None,
        )
        if definicja is None:
            zaimportowana = _importy_nazw(sciezka).get(nazwa) if (SRC / sciezka).exists() else None
            if zaimportowana is None or glebokosc > 8:
                return None
            plik, nazwa_w_pliku = zaimportowana
            return self._wynik_funkcji(
                nazwa_w_pliku,
                _Element(wywolanie.wyrazenie, plik),
                glebokosc + 1,
                pojedynczy=pojedynczy,
            )
        wynik: list[_Element] = []
        zwroty = [
            w
            for w in self._wezly_zasiegu(definicja)
            if isinstance(w, ast.Return) and w.value is not None
        ]
        if not zwroty:
            return None
        for zwrot in zwroty:
            assert zwrot.value is not None
            if pojedynczy:
                wynik.append(_Element(zwrot.value, sciezka))
                continue
            czesc = self.elementy(_Element(zwrot.value, sciezka), glebokosc + 1)
            if czesc is None:
                return None
            wynik += czesc
        return wynik

    # -- ocena elementu -----------------------------------------------------------
    def naruszenie_elementu(self, element: _Element, glebokosc: int = 0) -> str | None:
        """Powód, dla którego element NIE jest tekstem dla projektanta; ``None`` — czysty."""
        if glebokosc > 10:
            return f"element nierozstrzygnięty {ast.unparse(element.wyrazenie)}"
        wyrazenie = element.wyrazenie
        dalej = lambda w: self.naruszenie_elementu(  # noqa: E731
            _Element(w, element.sciezka, element.srodowisko), glebokosc + 1
        )
        if isinstance(wyrazenie, ast.Constant):
            if not isinstance(wyrazenie.value, str):
                return None
            tekst = wyrazenie.value.strip()
            kody = _kody_poza_formatem(element.sciezka, kody_w_tekscie(tekst))
            if kody:
                return f"kod {kody[0]}"
            if f"{element.sciezka}:{tekst}" in TOKENY_FORMATU_DANYCH:
                return None
            if (
                _ELEMENT_WIELKIMI.match(tekst)
                and tekst not in SKROTY_INZYNIERSKIE
                and tekst not in SYMBOLE_INZYNIERSKIE
            ) or _ELEMENT_KLUCZ.match(tekst):
                return f"kod {tekst}"
            return None
        if isinstance(wyrazenie, ast.JoinedStr):
            stale = "".join(
                str(c.value) if isinstance(c, ast.Constant) else " ⟨⟩ " for c in wyrazenie.values
            )
            kody = _kody_poza_formatem(element.sciezka, kody_w_tekscie(stale))
            if kody:
                return f"kod {kody[0]}"
            for i, czesc in enumerate(wyrazenie.values):
                if not isinstance(czesc, ast.FormattedValue):
                    continue
                wstawka = czesc.value
                if czesc.format_spec is not None:
                    continue  # wstawka formatowana liczbowo (``{t:g}``) — wartość, nie kod
                if isinstance(wstawka, ast.Name):
                    # Wstawka zmiennej pętli: jej wartości rozstrzygnięte ze źródła muszą być
                    # tekstem; wartość nierozstrzygnięta przechodzi jak każda inna wstawka
                    # f-stringu (reguły tekstu czytają wyłącznie stałe części i identyfikatory).
                    znana, wartosci = element.zmienna(wstawka.id)
                    if znana and wartosci is not None:
                        for wartosc in wartosci:
                            powod = self.naruszenie_elementu(wartosc, glebokosc + 1)
                            if powod is not None and powod.startswith("kod "):
                                return powod
                identyfikator = _interpolacja_identyfikatora(wstawka)
                if identyfikator is not None:
                    przed = "".join(
                        str(c.value) if isinstance(c, ast.Constant) else " ⟨⟩ "
                        for c in wyrazenie.values[:i]
                    )
                    if not ma_nazwe_rodzaju(przed):
                        return f"identyfikator bez rodzaju {identyfikator}"
            return None
        if isinstance(wyrazenie, ast.IfExp):
            return dalej(wyrazenie.body) or dalej(wyrazenie.orelse)
        if isinstance(wyrazenie, ast.BoolOp):
            return next((p for w in wyrazenie.values if (p := dalej(w)) is not None), None)
        if isinstance(wyrazenie, ast.BinOp) and isinstance(wyrazenie.op, ast.Add):
            return dalej(wyrazenie.left) or dalej(wyrazenie.right)
        if isinstance(wyrazenie, ast.BinOp) and isinstance(wyrazenie.op, ast.Mod):
            return dalej(wyrazenie.left)
        if isinstance(wyrazenie, ast.Name | ast.Attribute) and _ID_ELEMENTU.search(
            ast.unparse(wyrazenie)
        ):
            return f"identyfikator {ast.unparse(wyrazenie)}"
        if isinstance(wyrazenie, ast.Name):
            znana, wartosci = element.zmienna(wyrazenie.id)
            if znana:
                if wartosci is None:
                    return f"element nierozstrzygnięty {wyrazenie.id}"
                return next(
                    (
                        p
                        for w in wartosci
                        if (p := self.naruszenie_elementu(w, glebokosc + 1)) is not None
                    ),
                    None,
                )
            if _element_nazwany(wyrazenie):
                return None
            zrodla = self._zrodla_nazwy(wyrazenie.id, wyrazenie, element.sciezka, glebokosc)
            if zrodla is None:
                return f"element nierozstrzygnięty {wyrazenie.id}"
            cale, pojedyncze = zrodla
            if pojedyncze and not cale and self._cel_petli(wyrazenie, element.sciezka):
                # Zmienna pętli jako wartość: jej wartościami są elementy iterowanej kolekcji
                # albo pozycja krotek literału (``_wartosci_celu_petli``).
                cale, pojedyncze = pojedyncze, []
            if pojedyncze or not cale:
                return f"element nierozstrzygnięty {wyrazenie.id}"
            return next(
                (p for w in cale if (p := self.naruszenie_elementu(w, glebokosc + 1)) is not None),
                None,
            )
        if isinstance(wyrazenie, ast.Call):
            if _czy_sklejajace(wyrazenie) and wyrazenie.args:
                return self.naruszenie_sklejenia(
                    _Element(wyrazenie.args[0], element.sciezka, element.srodowisko),
                    glebokosc + 1,
                )
            if _nazwa_wywolanej(wyrazenie) in {"str", "repr"} and wyrazenie.args:
                return dalej(wyrazenie.args[0])
            if (
                isinstance(wyrazenie.func, ast.Attribute)
                and wyrazenie.func.attr in _PRZEKSZTALCENIA_TEKSTU
                and all(isinstance(a, ast.Constant) for a in wyrazenie.args)
            ):
                # Przekształcenie tekstu stałymi (``t.replace(".", ",")``, ``t.rstrip("0")``)
                # nie tworzy kodu — element jest tym, co przekształcane.
                return dalej(wyrazenie.func.value)
            if isinstance(wyrazenie.func, ast.Name) and not _funkcja_nazywajaca(wyrazenie.func.id):
                # Element z funkcji ``src``: każda wartość jej ``return`` jest elementem.
                zwroty = self._wynik_funkcji(
                    wyrazenie.func.id,
                    _Element(ast.Tuple(elts=[], ctx=ast.Load()), element.sciezka),
                    glebokosc,
                    pojedynczy=True,
                )
                if zwroty is not None:
                    return next(
                        (
                            p
                            for w in zwroty
                            if (p := self.naruszenie_elementu(w, glebokosc + 1)) is not None
                        ),
                        None,
                    )
            if (
                isinstance(wyrazenie.func, ast.Attribute)
                and wyrazenie.func.attr == "format"
                and isinstance(wyrazenie.func.value, ast.Constant)
            ):
                return dalej(wyrazenie.func.value)
        if (
            isinstance(wyrazenie, ast.Subscript)
            and isinstance(wyrazenie.slice, ast.Constant)
            and _ATRYBUT_TEKSTOWY.search(str(wyrazenie.slice.value))
        ):
            return None  # odczyt pola tekstowego rekordu (``opis["canonical_message_pl"]``)
        if (
            isinstance(wyrazenie, ast.Call)
            and isinstance(wyrazenie.func, ast.Attribute)
            and wyrazenie.func.attr == "get"
            and wyrazenie.args
            and isinstance(wyrazenie.args[0], ast.Constant)
            and _ATRYBUT_TEKSTOWY.search(str(wyrazenie.args[0].value))
        ):
            return None  # ten sam odczyt przez ``rekord.get("nazwa_pl")``
        if (
            isinstance(wyrazenie, ast.Call)
            and isinstance(wyrazenie.func, ast.Attribute)
            and wyrazenie.func.attr == "get"
            and isinstance(wyrazenie.func.value, ast.Name)
            and _MAPA_TEKSTOW.match(wyrazenie.func.value.id)
        ):
            # Odczyt mapy etykiet: czysty, gdy wartość zastępcza też jest tekstem (zastępczy
            # surowy klucz ``MAPA.get(k, k)`` wstawiłby kod do zdania).
            return dalej(wyrazenie.args[1]) if len(wyrazenie.args) > 1 else None
        if _element_nazwany(wyrazenie):
            return None
        if isinstance(wyrazenie, ast.Attribute) and self._atrybut_liczbowy(
            element.sciezka, wyrazenie.attr
        ):
            return None  # liczba (numer odcinka, wartość) — nie kod
        return f"element nierozstrzygnięty {ast.unparse(wyrazenie)}"

    def _atrybut_liczbowy(self, sciezka: str, nazwa: str) -> bool:
        """Czy atrybut ``nazwa`` jest w KAŻDEJ klasie modułu, która go deklaruje, polem
        o adnotacji liczbowej (``int``/``float``) — tekst takiego elementu jest liczbą."""
        drzewo, _rodzice = self._drzewo_pliku(sciezka)
        adnotacje = [
            ast.unparse(w.annotation)
            for klasa in ast.walk(drzewo)
            if isinstance(klasa, ast.ClassDef)
            for w in klasa.body
            if isinstance(w, ast.AnnAssign)
            and isinstance(w.target, ast.Name)
            and w.target.id == nazwa
        ]
        return bool(adnotacje) and all(a in {"int", "float"} for a in adnotacje)

    def naruszenie_sklejenia(self, kolekcja: _Element, glebokosc: int = 0) -> str | None:
        klucz = f"{kolekcja.sciezka}:{ast.unparse(kolekcja.wyrazenie)}"
        if klucz in KOLEKCJE_TEKSTOW_SRC or klucz in KOLEKCJE_FORMATU_DANYCH:
            return None
        elementy = self.elementy(kolekcja, glebokosc)
        if elementy is None:
            return f"kolekcja nierozstrzygnięta {ast.unparse(kolekcja.wyrazenie)}"
        for element in elementy:
            powod = self.naruszenie_elementu(element, glebokosc + 1)
            if powod is not None:
                return powod
        return None


def _tekst_przed(wyrazenie: ast.AST, cel: ast.AST) -> tuple[str, bool]:
    """Tekst zdania stojący PRZED wywołaniem ``cel`` w wyrażeniu tekstu (łańcuch ``+``,
    f-string, warunek ``a if c else b``) i czy ``cel`` w nim wystąpił."""
    if wyrazenie is cel:
        return "", True
    if isinstance(wyrazenie, ast.BinOp) and isinstance(wyrazenie.op, ast.Add):
        lewy, znaleziony = _tekst_przed(wyrazenie.left, cel)
        if znaleziony:
            return lewy, True
        prawy, znaleziony = _tekst_przed(wyrazenie.right, cel)
        return lewy + prawy, znaleziony
    if isinstance(wyrazenie, ast.IfExp):
        for galaz in (wyrazenie.body, wyrazenie.orelse):
            tekst, znaleziony = _tekst_przed(galaz, cel)
            if znaleziony:
                return tekst, True
        return " ⟨⟩ ", False
    if isinstance(wyrazenie, ast.JoinedStr):
        tekst = ""
        for czesc in wyrazenie.values:
            if isinstance(czesc, ast.Constant):
                tekst += str(czesc.value)
                continue
            if any(w is cel for w in ast.walk(czesc)):
                return tekst, True
            tekst += " ⟨⟩ "
        return tekst, False
    if isinstance(wyrazenie, ast.Constant) and isinstance(wyrazenie.value, str):
        return wyrazenie.value, False
    if any(w is cel for w in ast.walk(wyrazenie)):
        return "", True
    return " ⟨⟩ ", False


def naruszenia_sklejen(sciezka: str, plik: Path | None = None) -> list[Naruszenie]:
    """Kolekcja wklejona w zdanie dla projektanta (``", ".join(…)``, ``lista_pl``) — każdy
    element musi być tekstem po polsku: element rozstrzygnięty ze źródła kolekcji (literał,
    wyrażenie listowe, przypisanie, ``append``, stała modułu, klucze słownika) jest
    sprawdzany regułami tekstu (kod, klucz, identyfikator bez rodzaju); element, którego
    składnia nie rozstrzyga, jest naruszeniem, chyba że kolekcja ma wpis
    ``KOLEKCJE_TEKSTOW_SRC`` z uzasadnieniem."""
    drzewo = _drzewo(plik or SRC / sciezka)
    zakres = zakres_src(sciezka)
    sklejenia = _Sklejenia(sciezka, drzewo)
    tlumaczony = _tlumaczony(sciezka)
    sprawdzone: set[int] = set()
    wynik: list[Naruszenie] = []
    for komunikat, rodzice in teksty_komunikatow(zakres, drzewo):
        for wywolanie in ast.walk(_korzen_tekstu(komunikat.wezel, rodzice)):
            if (
                not isinstance(wywolanie, ast.Call)
                or not _czy_sklejajace(wywolanie)
                or not wywolanie.args
                or id(wywolanie) in sprawdzone
            ):
                continue
            sprawdzone.add(id(wywolanie))
            if tlumaczony and _zlaczenie_w_apostrofach(wywolanie):
                continue
            powod = sklejenia.naruszenie_sklejenia(_Element(wywolanie.args[0], sciezka))
            przed, _znaleziony = _tekst_przed(_korzen_tekstu(komunikat.wezel, rodzice), wywolanie)
            if powod is not None and powod.startswith("identyfikator") and ma_nazwe_rodzaju(przed):
                # Rozstrzygnięcie architekta 2026-10-29: wskazania elementów (identyfikatory)
                # zostają, gdy przed listą stoi polska nazwa rodzaju („szyn migawki: …”).
                powod = None
            if powod is not None:
                wynik.append(
                    Naruszenie(
                        sciezka,
                        komunikat.wezel.lineno,
                        f"sklejenie {ast.unparse(wywolanie.args[0])}: {powod}",
                        komunikat.tekst,
                    )
                )
        for wstawka in ast.walk(_korzen_tekstu(komunikat.wezel, rodzice)):
            if (
                isinstance(wstawka, ast.FormattedValue)
                and id(wstawka) not in sprawdzone
                and _zapis_kolekcji(wstawka.value, sklejenia, sciezka, plik or SRC / sciezka)
            ):
                sprawdzone.add(id(wstawka))
                wynik.append(
                    Naruszenie(
                        sciezka,
                        komunikat.wezel.lineno,
                        f"zapis kolekcji {ast.unparse(wstawka.value)}: lista w zapisie Pythona "
                        "(nawiasy i apostrofy) zamiast sklejenia słowami",
                        komunikat.tekst,
                    )
                )
    return wynik


#: Wywołania tworzące kolekcję — wstawione w f-string dają zapis Pythona (``['a', 'b']``).
_KONSTRUKTORY_KOLEKCJI = frozenset({"list", "sorted", "tuple", "set", "frozenset", "dict"})
#: Nazwy typów wyniku będących kolekcją (adnotacja ``-> list[str]``, ``-> Mapping[…]``,
#: ``-> typing.Sequence[…]``, także w unii ``-> list[str] | None``).
_TYPY_KOLEKCJI = frozenset(
    {
        "list",
        "tuple",
        "set",
        "frozenset",
        "dict",
        "List",
        "Tuple",
        "Set",
        "FrozenSet",
        "Dict",
        "Sequence",
        "MutableSequence",
        "Mapping",
        "MutableMapping",
        "AbstractSet",
        "Collection",
        "OrderedDict",
        "defaultdict",
        "Counter",
        "deque",
    }
)
#: Metody wbudowanych kolekcji i tekstu zwracające kolekcję albo jej widok
#: (``dict_keys([...])``, ``['a', 'b']``) — wstawione w f-string dają zapis Pythona.
_METODY_KOLEKCJI_WBUDOWANE = frozenset(
    {"keys", "values", "items", "split", "rsplit", "splitlines", "most_common"}
)


def _typ_kolekcji(adnotacja: ast.expr | None) -> bool:
    """Czy adnotacja wyniku jest kolekcją (także jedną ze stron unii ``X | None``)."""
    if adnotacja is None:
        return False
    if isinstance(adnotacja, ast.BinOp) and isinstance(adnotacja.op, ast.BitOr):
        return _typ_kolekcji(adnotacja.left) or _typ_kolekcji(adnotacja.right)
    baza = adnotacja.value if isinstance(adnotacja, ast.Subscript) else adnotacja
    if isinstance(baza, ast.Name):
        return baza.id in _TYPY_KOLEKCJI
    if isinstance(baza, ast.Attribute):
        return baza.attr in _TYPY_KOLEKCJI
    return False


@cache
def _funkcje_zwracajace_kolekcje(plik: Path) -> frozenset[str]:
    """Funkcje i metody modułu z adnotacją wyniku będącą kolekcją (``-> list[float]``,
    ``-> tuple[…]``, ``-> Mapping[…] | None``) — ich wynik wstawiony w f-string daje zapis
    Pythona. Nazwa zdefiniowana w module także z wynikiem niebędącym kolekcją nie wchodzi
    (rozstrzyga jednomyślność definicji, jak w ``_wywolania_zwracajace_kolekcje_src``)."""
    if not plik.exists():
        return frozenset()
    return _jednomyslne_kolekcje(_definicje_wyniku(_drzewo(plik)).items())


def _definicje_wyniku(drzewo: ast.Module) -> dict[str, list[bool]]:
    """Nazwa funkcji/metody → czy KAŻDA jej definicja w drzewie zwraca kolekcję."""
    definicje: dict[str, list[bool]] = {}
    for wezel in ast.walk(drzewo):
        if isinstance(wezel, ast.FunctionDef | ast.AsyncFunctionDef):
            definicje.setdefault(wezel.name, []).append(_typ_kolekcji(wezel.returns))
    return definicje


def _jednomyslne_kolekcje(definicje: Iterable[tuple[str, list[bool]]]) -> frozenset[str]:
    """Nazwy, których każda definicja zwraca kolekcję."""
    return frozenset(nazwa for nazwa, wyniki in definicje if wyniki and all(wyniki))


@cache
def _wywolania_zwracajace_kolekcje_src() -> frozenset[str]:
    """Funkcje i metody całego ``src`` zwracające kolekcję — nazwa wchodzi, gdy KAŻDA jej
    definicja w ``src`` ma adnotację wyniku będącą kolekcją (jednomyślność: wywołanie
    ``obiekt.opis()`` nie rozstrzyga klasy obiektu, więc nazwa używana w jednej klasie dla
    tekstu, a w innej dla listy, nie jest zgadywana)."""
    zebrane: dict[str, list[bool]] = {}
    for plik in sorted(SRC.rglob("*.py")):
        for nazwa, wyniki in _definicje_wyniku(_drzewo(plik)).items():
            zebrane.setdefault(nazwa, []).extend(wyniki)
    return _jednomyslne_kolekcje(zebrane.items())


def _postac_kolekcji(wyrazenie: ast.expr, plik: Path) -> bool:
    """Wywołanie konstruktora kolekcji, funkcji albo METODY zwracającej kolekcję (moduł,
    cały ``src``, metody wbudowane ``keys``/``values``/``items``/``split``), literał albo
    wyrażenie listowe kolekcji."""
    if isinstance(wyrazenie, ast.Call):
        if isinstance(wyrazenie.func, ast.Name):
            nazwa = wyrazenie.func.id
            return (
                nazwa in _KONSTRUKTORY_KOLEKCJI
                or nazwa in _funkcje_zwracajace_kolekcje(plik)
                or nazwa in _wywolania_zwracajace_kolekcje_src()
            )
        if isinstance(wyrazenie.func, ast.Attribute):
            nazwa = wyrazenie.func.attr
            return (
                nazwa in _METODY_KOLEKCJI_WBUDOWANE
                or nazwa in _funkcje_zwracajace_kolekcje(plik)
                or nazwa in _wywolania_zwracajace_kolekcje_src()
            )
        return False
    return isinstance(
        wyrazenie,
        ast.List | ast.Tuple | ast.Set | ast.Dict | ast.ListComp | ast.SetComp | ast.DictComp,
    )


def _zapis_kolekcji(wyrazenie: ast.expr, sklejenia: _Sklejenia, sciezka: str, plik: Path) -> bool:
    """Czy wstawka f-stringu jest kolekcją (wyświetlaną zapisem Pythona): postać kolekcji
    wprost albo zmienna, której KAŻDE przypisanie (także argument każdego wywołania, gdy
    zmienna jest parametrem) ma postać kolekcji."""
    if _postac_kolekcji(wyrazenie, plik):
        return True
    if not isinstance(wyrazenie, ast.Name):
        return False
    zrodla = sklejenia._zrodla_nazwy(wyrazenie.id, wyrazenie, sciezka, 0)
    if zrodla is None:
        return False
    cale, _pojedyncze = zrodla
    return bool(cale) and all(
        _postac_kolekcji(e.wyrazenie, plik if e.sciezka == sciezka else SRC / e.sciezka)
        for e in cale
    )


#: Zmienna albo atrybut niosący WARTOŚĆ WYLICZENIA (status, stan, rodzaj, tryb, typ, wariant):
#: kod maszynowy, który w zdaniu dla projektanta zastępuje się polską etykietą (funkcja
#: etykiety, mapa ``…_PL``). Dozwolona jest wstawka przez funkcję etykiety (wywołanie nie
#: podlega regule) albo zmienna, której każda wartość rozstrzygnięta ze źródła jest tekstem.
_ZMIENNA_WYLICZENIA = re.compile(
    r"(?:^|[._])(?:status|stan|kind|rodzaj|mode|tryb|type|typ|state|kategoria|category"
    r"|wariant|variant|severity|poziom)$|(?:^|\.)(?:kod|code)$"
)


#: Bazy klas wyliczeń (``enum``) — klasa dziedzicząca po nich (przechodnio) jest wyliczeniem.
_BAZY_WYLICZEN = frozenset({"Enum", "StrEnum", "IntEnum", "Flag", "IntFlag"})
#: Wartość wyliczenia będąca SŁOWEM po polsku (małe litery, spacje, łącznik) — wstawiona
#: w zdanie czyta się jak tekst, nie jak kod (np. ``RODZAJE_OBWODU``: „odbiorczy”).
_WARTOSC_SLOWNA = re.compile(r"[a-ząćęłńóśźż][a-ząćęłńóśźż \-–]*")


def _wartosci_literalu(wezel: ast.expr) -> tuple[str, ...] | None:
    """Wartości ``Literal["A", "B"]`` (także ``typing.Literal``); ``None`` — nie literał."""
    if not (isinstance(wezel, ast.Subscript) and ast.unparse(wezel.value).endswith("Literal")):
        return None
    elementy = wezel.slice.elts if isinstance(wezel.slice, ast.Tuple) else [wezel.slice]
    return tuple(str(e.value) for e in elementy if isinstance(e, ast.Constant))


@cache
def _typy_wyliczen_modulu(plik: Path) -> dict[str, tuple[str, ...]]:
    """Typy wyliczeń ZDEFINIOWANE w module: alias ``X = Literal[…]`` (także ``X: TypeAlias``)
    i klasa wyliczenia (przechodnio od ``Enum``/``StrEnum``…) → wartości napisowe."""
    drzewo = _drzewo(plik)
    typy: dict[str, tuple[str, ...]] = {}
    klasy = {w.name: w for w in drzewo.body if isinstance(w, ast.ClassDef)}
    for wezel in drzewo.body:
        if isinstance(wezel, ast.Assign) and len(wezel.targets) == 1:
            cel, wartosc = wezel.targets[0], wezel.value
        elif isinstance(wezel, ast.AnnAssign) and wezel.value is not None:
            cel, wartosc = wezel.target, wezel.value
        else:
            continue
        wartosci = _wartosci_literalu(wartosc)
        if isinstance(cel, ast.Name) and wartosci is not None:
            typy[cel.id] = wartosci
    wyliczenia: set[str] = set()
    while True:
        nowe = {
            nazwa
            for nazwa, klasa in klasy.items()
            if nazwa not in wyliczenia
            and any(
                ast.unparse(b).split(".")[-1] in _BAZY_WYLICZEN | wyliczenia for b in klasa.bases
            )
        }
        if not nowe:
            break
        wyliczenia |= nowe
    for nazwa in sorted(wyliczenia):
        typy[nazwa] = tuple(
            str(w.value.value)
            for w in klasy[nazwa].body
            if isinstance(w, ast.Assign)
            and isinstance(w.value, ast.Constant)
            and isinstance(w.value.value, str)
        )
    return typy


def _plik_modulu(modul: str) -> Path | None:
    sciezka = SRC.joinpath(*modul.split("."))
    for kandydat in (sciezka.with_suffix(".py"), sciezka / "__init__.py"):
        if kandydat.is_file():
            return kandydat
    return None


def _wartosci_typu(plik: Path, nazwa: str, glebokosc: int = 0) -> tuple[str, ...] | None:
    """Wartości typu wyliczenia ``nazwa`` widzianego w module ``plik``: definicja w module
    albo import ``from pakiet import nazwa`` (przechodnio przez reeksport, do 3 skoków);
    ``None`` — nazwa nie jest typem wyliczenia."""
    typy = _typy_wyliczen_modulu(plik)
    if nazwa in typy:
        return typy[nazwa]
    if glebokosc >= 3:
        return None
    for wezel in _drzewo(plik).body:
        if isinstance(wezel, ast.ImportFrom) and wezel.module and wezel.level == 0:
            for alias in wezel.names:
                if (alias.asname or alias.name) == nazwa:
                    zrodlo = _plik_modulu(wezel.module)
                    if zrodlo is not None:
                        return _wartosci_typu(zrodlo, alias.name, glebokosc + 1)
    return None


def _adnotacja_kodow(plik: Path, adnotacja: ast.expr | None) -> bool:
    """Czy adnotacja (``X``, ``X | None``, ``Optional[X]``, ``Literal[…]``) jest typem
    wyliczenia, którego wartości są KODAMI (nie wszystkie są słowem po polsku)."""
    if adnotacja is None:
        return False
    if isinstance(adnotacja, ast.Constant) and isinstance(adnotacja.value, str):
        try:
            adnotacja = ast.parse(adnotacja.value, mode="eval").body
        except SyntaxError:
            return False
    if isinstance(adnotacja, ast.BinOp) and isinstance(adnotacja.op, ast.BitOr):
        czlony = [adnotacja.left, adnotacja.right]
        bez_none = [c for c in czlony if ast.unparse(c) != "None"]
        return len(bez_none) == 1 and _adnotacja_kodow(plik, bez_none[0])
    if isinstance(adnotacja, ast.Subscript) and ast.unparse(adnotacja.value).endswith("Optional"):
        return _adnotacja_kodow(plik, adnotacja.slice)
    wartosci = _wartosci_literalu(adnotacja)
    if wartosci is None and isinstance(adnotacja, ast.Name | ast.Attribute):
        wartosci = _wartosci_typu(plik, ast.unparse(adnotacja).split(".")[-1])
    return bool(wartosci) and not all(_WARTOSC_SLOWNA.fullmatch(w) for w in wartosci)


def _atrybut_wyliczenia(plik: Path, nazwa: str) -> bool:
    """Atrybut ``nazwa`` jest w KAŻDEJ klasie modułu, która go deklaruje, polem typu
    wyliczenia o wartościach-kodach (``punkt_pomiaru: PunktPomiaruWymagania``)."""
    adnotacje = [
        w.annotation
        for klasa in ast.walk(_drzewo(plik))
        if isinstance(klasa, ast.ClassDef)
        for w in klasa.body
        if isinstance(w, ast.AnnAssign) and isinstance(w.target, ast.Name) and w.target.id == nazwa
    ]
    return bool(adnotacje) and all(_adnotacja_kodow(plik, a) for a in adnotacje)


def _zmienna_wyliczenia(plik: Path, wyrazenie: ast.Name, rodzice: dict[int, ast.AST]) -> bool:
    """Zmienna lokalna typu wyliczenia o wartościach-kodach: parametr funkcji z taką
    adnotacją albo zmienna, której KAŻDE przypisanie w funkcji czyta atrybut takiego typu
    (``ocena = przedmiot.rodzaj_oceny``)."""
    funkcja = rodzice.get(id(wyrazenie))
    while funkcja is not None and not isinstance(funkcja, ast.FunctionDef | ast.AsyncFunctionDef):
        funkcja = rodzice.get(id(funkcja))
    if funkcja is None:
        return False
    argumenty = funkcja.args.posonlyargs + funkcja.args.args + funkcja.args.kwonlyargs
    for argument in argumenty:
        if argument.arg == wyrazenie.id:
            return _adnotacja_kodow(plik, argument.annotation)
    przypisania = [
        w
        for w in ast.walk(funkcja)
        if isinstance(w, ast.Assign | ast.AnnAssign)
        and any(
            isinstance(c, ast.Name) and c.id == wyrazenie.id
            for c in (w.targets if isinstance(w, ast.Assign) else [w.target])
        )
    ]
    if not przypisania:
        return False
    return all(
        (isinstance(w, ast.AnnAssign) and _adnotacja_kodow(plik, w.annotation))
        or (isinstance(w.value, ast.Attribute) and _atrybut_wyliczenia(plik, w.value.attr))
        for w in przypisania
    )


def _test_przynaleznosci(test: ast.expr, zrodlo: str) -> bool:
    """Test ``<wyrażenie> in A`` / ``<wyrażenie> == "X"`` (także ich alternatywa ``or``)."""
    if isinstance(test, ast.BoolOp) and isinstance(test.op, ast.Or):
        return all(_test_przynaleznosci(w, zrodlo) for w in test.values)
    return (
        isinstance(test, ast.Compare)
        and ast.unparse(test.left) == zrodlo
        and all(isinstance(op, ast.In | ast.Eq) for op in test.ops)
    )


def _lancuch_przynaleznosci(warunek: ast.If, zrodlo: str, rodzice: dict[int, ast.AST]) -> bool:
    """Gałąź ``else`` łańcucha ``if x in A: … elif x in B: … else: …``, w którym KAŻDY
    warunek łańcucha jest testem przynależności tego samego wyrażenia — do ``else`` dociera
    wyłącznie wartość spoza wszystkich zbiorów łańcucha."""
    while True:
        if not _test_przynaleznosci(warunek.test, zrodlo):
            return False
        rodzic = rodzice.get(id(warunek))
        if not (
            isinstance(rodzic, ast.If) and len(rodzic.orelse) == 1 and rodzic.orelse[0] is warunek
        ):
            return True
        warunek = rodzic


def _echo_odrzuconej_wartosci(zrodlo: str, wezel: ast.AST, rodzice: dict[int, ast.AST]) -> bool:
    """Wstawka cytuje wartość, której słownik NIE zna — dane wejściowe projektanta albo
    klienta API odrzucone właśnie dlatego, że nie są wartością wyliczenia: tekst stoi
    w gałęzi ``if <wyrażenie> not in …:``, w gałęzi ``else`` łańcucha testów przynależności
    tego wyrażenia (``_lancuch_przynaleznosci``) albo w obsłudze wyjątku ``try`` parsującego to
    samo wyrażenie (``Rodzaj(<wyrażenie>)``, ``Rodzaj(<wyrażenie>.lower())``). Ten sam
    predykat co warunek odmowy — do tekstu dociera wyłącznie wartość spoza zbioru testu,
    więc zdanie cytuje odrzucone wejście. Granica predykatu: zbiór testu musi być CAŁYM
    słownikiem wartości (zbiór częściowy — „dozwolone tutaj” — przepuściłby poprawny kod
    słownika); miejsca ze zbiorem częściowym nazywają wartość etykietą (np.
    ``domain/geometry_overrides.py`` — operacja i zakres nadpisania słowami)."""
    dziecko: ast.AST = wezel
    przodek = rodzice.get(id(wezel))
    while przodek is not None:
        if isinstance(przodek, ast.If) and any(dziecko is w for w in przodek.body):
            for porownanie in ast.walk(przodek.test):
                if (
                    isinstance(porownanie, ast.Compare)
                    and ast.unparse(porownanie.left) == zrodlo
                    and any(isinstance(op, ast.NotIn) for op in porownanie.ops)
                ):
                    return True
        if (
            isinstance(przodek, ast.If)
            and any(dziecko is w for w in przodek.orelse)
            and _lancuch_przynaleznosci(przodek, zrodlo, rodzice)
        ):
            return True
        if isinstance(przodek, ast.ExceptHandler):
            proba = rodzice.get(id(przodek))
            if isinstance(proba, ast.Try):
                for wywolanie in (w for instr in proba.body for w in ast.walk(instr)):
                    if isinstance(wywolanie, ast.Call) and any(
                        ast.unparse(czesc) == zrodlo
                        for argument in wywolanie.args
                        for czesc in ast.walk(argument)
                    ):
                        return True
        dziecko, przodek = przodek, rodzice.get(id(przodek))
    return False


#: Zmienne o nazwie wyliczenia, których wartość W ZDANIU jest słowem projektanta, nie kodem
#: (``moduł:wyrażenie`` → uzasadnienie; żywotność i warunek: ``test_wylaczenia_sklejen_sa_zywe``
#: oraz test przy wpisie).
WYLICZENIA_BEZ_ETYKIETY: dict[str, str] = {
    "application/xlsx_import/importer.py:rodzaj": (
        "rodzaj odcinka z kolumny arkusza (`LINIA`/`KABEL`) — słowo, które projektant sam "
        "wpisał w arkuszu; komunikat cytuje jego zapis, żeby wskazał komórkę do poprawy"
    ),
    "network_model/solvers/fault_loop_iec60364.py:data.network_type.value": (
        "oznaczenie układu sieci wg PN-HD 60364-1 §312.2 (TN-S, TN-C-S, TN-C, TT, IT) — "
        "wartości `NetworkType` są oznaczeniami normy, nie kodami systemu"
    ),
    "network_model/solvers/petla_zwarcia_tt_it.py:uklad.value": (
        "oznaczenie układu sieci wg PN-HD 60364-1 §312.2 (TT, IT) — wartość `NetworkType`"
    ),
    "network_model/catalog/types.py:default.value": (
        "wartość domyślna klucza statusu w pliku katalogu typów (reguły KAT-T-001/002) — "
        "cytowana obok listy dozwolonych wartości pliku, które autor danych wpisuje"
    ),
    "application/analyses/swz/werdykt_tt_it.py:rodzaj": (
        "rodzaj obwodu PN-HD 60364-4-41 §411.3.2.2/.3 — wartości `RODZAJE_OBWODU` są polskimi "
        "słowami („odbiorczy”, „rozdzielczy”); jedyne źródło: `rodzaj_obwodu_dla_aparatu`"
    ),
    "application/analyses/swz/werdykt.py:rodzaj": (
        "rodzaj obwodu PN-HD 60364-4-41 §411.3.2.2/.3 — wartości `RODZAJE_OBWODU` są polskimi "
        "słowami („odbiorczy”, „rozdzielczy”); jedyne źródło: `rodzaj_obwodu_dla_aparatu`"
    ),
    "api/generators.py:req.nc_rfg_module": (
        "typ modułu wytwarzania A–D (rozporządzenie 2016/631 art. 5) wpisany przez "
        "projektanta — oznaczenie normowe, nie kod"
    ),
    "network_model/solvers/ncrfg_ptpiree/stosowalnosc.py:typ": (
        "typ modułu wytwarzania A–D (rozporządzenie 2016/631 art. 5) — `TypModulu`"
    ),
    "domain/der_protection_functions.py:kod": (
        "numer funkcji zabezpieczeniowej wg IEEE C37.2 / ANSI (87BB, 87B, 87L, 87M) — "
        "oznaczenie normowe, obok opisu słownego funkcji w nawiasie"
    ),
    "network_model/solvers/cable_ampacity_derating.py:self.izolacja": (
        "rodzaj izolacji przewodu PVC / XLPE — oznaczenie materiału izolacji wg IEC 60502 "
        "i PN-HD 60364-5-52 (tablice obciążalności), nie kod"
    ),
    "network_model/solvers/cable_ampacity_derating.py:izolacja": (
        "rodzaj izolacji przewodu PVC / XLPE — oznaczenie materiału izolacji wg IEC 60502 "
        "i PN-HD 60364-5-52 (tablice obciążalności), nie kod"
    ),
    "enm/pole_katalogowe.py:konfiguracja.code": (
        "oznaczenie bloku fabrycznego z karty katalogowej producenta (litery jednostek, np. "
        "„LLT” — linia, linia, transformator) — nazwa handlowa konfiguracji, którą projektant "
        "widzi w katalogu rozdzielnicy"
    ),
    "network_model/catalog/switchgear/family_validation.py:configuration.code": (
        "oznaczenie bloku fabrycznego z karty katalogowej producenta (litery jednostek, np. "
        "„LLT”) — obok nazwy bloku `name_pl` i nazwy rodziny"
    ),
}

#: Adres stanu urządzenia ``{x.ident}.{stan}`` w module odmów tłumaczonych: tłumacz zamienia
#: identyfikator na „Nazwę”, a ``„Nazwa”.stan`` na opis stanu (``OPISY_STANOW_PL``,
#: kompletność przypina ``tests/api/test_dynamika_api.py::
#: test_opisy_stanow_obejmuja_kazdy_stan_rodzin_urzadzen_rdzenia``).
_IDENT_URZADZENIA = re.compile(r"(?:^|\.)ident$")


def _adres_stanu_tlumaczony(
    czesc: ast.FormattedValue, sciezka: str, rodzice: dict[int, ast.AST]
) -> bool:
    if not _tlumaczony(sciezka):
        return False
    napis = rodzice.get(id(czesc))
    if not isinstance(napis, ast.JoinedStr):
        return False
    i = next(k for k, w in enumerate(napis.values) if w is czesc)
    if i < 2:
        return False
    kropka, ident = napis.values[i - 1], napis.values[i - 2]
    return (
        isinstance(kropka, ast.Constant)
        and kropka.value == "."
        and isinstance(ident, ast.FormattedValue)
        and _IDENT_URZADZENIA.search(ast.unparse(ident.value)) is not None
    )


def _wartosc_wyliczenia(
    wyrazenie: ast.expr,
    czesc: ast.FormattedValue,
    sciezka: str,
    drzewo: ast.Module,
    rodzice: dict[int, ast.AST],
    plik: Path,
    rodzice_modulu: dict[int, ast.AST],
) -> str | None:
    """Źródło wstawki f-stringu, gdy wstawia WARTOŚĆ WYLICZENIA zamiast etykiety: ``.value``
    wyliczenia (``{x.kind.value}``) albo zmienna/atrybut o nazwie wyliczenia
    (``{self.status}``, ``{der_kind}``, ``{control_mode}``), której wartości nie są tekstem
    po polsku; ``None`` — wstawka czysta (etykieta, liczba, tekst rozstrzygnięty, cytat
    odrzuconego wejścia — ``_echo_odrzuconej_wartosci``)."""
    if czesc.format_spec is not None:
        return None  # wartość formatowana liczbowo
    zrodlo = ast.unparse(wyrazenie)
    if f"{sciezka}:{zrodlo}" in WYLICZENIA_BEZ_ETYKIETY:
        return None
    if _echo_odrzuconej_wartosci(zrodlo, czesc, rodzice):
        return None
    if _adres_stanu_tlumaczony(czesc, sciezka, rodzice):
        return None
    if _wstawka_w_dopisku_kodu(czesc, rodzice_modulu):
        return None  # kod jako dopisek po zdaniu (``DOPISKI_KODU``)
    if isinstance(wyrazenie, ast.Attribute) and wyrazenie.attr == "value":
        return zrodlo
    if (isinstance(wyrazenie, ast.Attribute) and _atrybut_wyliczenia(plik, wyrazenie.attr)) or (
        isinstance(wyrazenie, ast.Name) and _zmienna_wyliczenia(plik, wyrazenie, rodzice_modulu)
    ):
        return zrodlo  # typ wyliczenia o wartościach-kodach z adnotacji (nie z nazwy)
    if not (isinstance(wyrazenie, ast.Name | ast.Attribute) and _ZMIENNA_WYLICZENIA.search(zrodlo)):
        return None
    if isinstance(wyrazenie, ast.Name):
        powod = _Sklejenia(sciezka, drzewo).naruszenie_elementu(_Element(wyrazenie, sciezka))
        return None if powod is None else zrodlo
    return zrodlo


def _w_bledzie_programu(wezel: ast.AST, rodzice: dict[int, ast.AST]) -> bool:
    """Tekst wyjątku spoza kanału (``TypeError``, ``KeyError``, ``RuntimeError``…) — błąd
    programu: odpowiedź 500 i dziennik serwera, nie zdanie dla projektanta."""
    kanaly = kanaly_wywolan()
    przodek = rodzice.get(id(wezel))
    while przodek is not None:
        if isinstance(przodek, ast.Raise):
            wyjatek = przodek.exc
            return isinstance(wyjatek, ast.Call) and _nazwa_wywolanej(wyjatek) not in kanaly
        przodek = rodzice.get(id(przodek))
    return False


@cache
def pozycje_tresci() -> dict[str, int | None]:
    """Pozycja argumentu TREŚCI w wywołaniu kanału: pierwszy parametr o nazwie treści
    (``komunikat``, ``message``…) konstruktora wyjątku albo opakowania ``src``; klasa bez
    własnego konstruktora — argument 0 (``Exception(komunikat)``); ``None`` — treść
    wyłącznie argumentem nazwanym (rekordy, ``HTTPException(detail=…)``)."""
    pozycje: dict[str, int | None] = {
        "ValueError": 0,
        "HTTPException": None,
        "PydanticCustomError": 1,
    }
    kanaly = kanaly_wywolan()
    for plik in sorted(SRC.rglob("*.py")):
        for wezel in ast.walk(_drzewo(plik)):
            if isinstance(wezel, ast.ClassDef) and wezel.name in kanaly:
                if wezel.name in KANALY_REKORDOW:
                    pozycje.setdefault(wezel.name, None)
                    continue
                konstruktor = next(
                    (
                        f
                        for f in wezel.body
                        if isinstance(f, ast.FunctionDef) and f.name == "__init__"
                    ),
                    None,
                )
                if konstruktor is None:
                    pozycje.setdefault(wezel.name, 0)
                    continue
                parametry = [a.arg for a in konstruktor.args.args][1:]
                pozycje.setdefault(
                    wezel.name,
                    next((i for i, a in enumerate(parametry) if a in _PARAMETRY_TRESCI), None),
                )
            elif isinstance(wezel, ast.FunctionDef) and wezel.name in kanaly:
                parametry = [a.arg for a in wezel.args.args if a.arg not in {"self", "cls"}]
                pozycje.setdefault(
                    wezel.name,
                    next((i for i, a in enumerate(parametry) if a in _PARAMETRY_TRESCI), None),
                )
    return pozycje


def _bez_zdania(argument: ast.expr) -> str | None:
    """Opis argumentu treści, który NIE niesie zdania po polsku (sam kod, pusty napis,
    wstawki wyłącznie kodów i identyfikatorów); ``None`` — treść jest zdaniem albo
    zmienną tekstu, której strażnik nie rozstrzyga składniowo."""
    if isinstance(argument, ast.Constant) and isinstance(argument.value, str):
        return None if _LUDZKI.search(argument.value) else repr(argument.value)
    if isinstance(argument, ast.JoinedStr):
        stale = "".join(str(c.value) for c in argument.values if isinstance(c, ast.Constant))
        if _LUDZKI.search(stale):
            return None
        wstawki = [c.value for c in argument.values if isinstance(c, ast.FormattedValue)]
        if all(
            _interpolacja_identyfikatora(w) is not None or _ZMIENNA_KODU.search(ast.unparse(w))
            for w in wstawki
        ):
            return ast.unparse(argument)
        return None
    if isinstance(argument, ast.Name | ast.Attribute) and _ZMIENNA_KODU.search(
        ast.unparse(argument)
    ):
        return ast.unparse(argument)
    return None


def naruszenia_tresci_bez_zdania(sciezka: str, plik: Path | None = None) -> list[Naruszenie]:
    """Komunikat, którego JEDYNĄ treścią jest kod (``odmowa_twarda("KAT-T-006",
    "KAT-T-006")``, ``ValueError(kod)``) — rozstrzygnięcie architekta 2026-10-29: kod reguły
    zostaje WYŁĄCZNIE jako dopisek po polskim zdaniu, które obywa się bez niego. Reguły
    tekstowe pomijają napis bez słowa po polsku (nie jest zdaniem), więc ta reguła czyta
    argument treści wprost."""
    drzewo = _drzewo(plik or SRC / sciezka)
    rodzice = _rodzice(drzewo)
    pozycje = pozycje_tresci()
    kanaly = kanaly_wywolan()
    wynik: list[Naruszenie] = []
    for wezel in ast.walk(drzewo):
        argumenty: list[ast.expr] = []
        if isinstance(wezel, ast.Call):
            nazwa = _nazwa_wywolanej(wezel)
            if nazwa in kanaly:
                pozycja = pozycje.get(nazwa)
                if pozycja is not None and len(wezel.args) > pozycja:
                    argumenty.append(wezel.args[pozycja])
                argumenty += [k.value for k in wezel.keywords if k.arg in _PARAMETRY_TRESCI]
            argumenty += [k.value for k in wezel.keywords if k.arg in KANALY_ZDANIOWE]
            if (
                isinstance(wezel.func, ast.Attribute)
                and wezel.func.attr in {"append", "insert"}
                and isinstance(wezel.func.value, ast.Name)
                and wezel.func.value.id in LISTY_KOMUNIKATOW
                and wezel.args
            ):
                argumenty.append(wezel.args[-1])
        elif isinstance(wezel, ast.Dict):
            argumenty += [
                wartosc
                for klucz, wartosc in zip(wezel.keys, wezel.values, strict=True)
                if isinstance(klucz, ast.Constant) and klucz.value in KANALY_ZDANIOWE
            ]
        elif isinstance(wezel, ast.Assign) and any(
            isinstance(cel, ast.Subscript)
            and isinstance(cel.slice, ast.Constant)
            and cel.slice.value in KANALY_ZDANIOWE
            for cel in wezel.targets
        ):
            argumenty.append(wezel.value)
        else:
            continue
        for argument in {id(a): a for a in argumenty}.values():
            if isinstance(argument, ast.Starred) or _poza_komunikatem(argument, rodzice):
                continue
            opis = _bez_zdania(argument)
            if opis is not None:
                wynik.append(Naruszenie(sciezka, argument.lineno, f"treść bez zdania {opis}", opis))
    return wynik


def _linie_nazw_typow_tlumaczonych(sciezka: str, plik: Path | None = None) -> set[int]:
    """Wiersze f-stringów, w których KAŻDA wstawka w odwróconych apostrofach jest nazwą typu
    (``type(x).__name__``) albo złączeniem nazw w apostrofach — w module tłumaczonym zamienia
    je na rodzaj obiektu słowami ``komunikat_dla_projektanta`` (``NAZWY_KLAS_DYNAMIKI_PL``)."""
    wiersze: set[int] = set()
    for napis in ast.walk(_drzewo(plik or SRC / sciezka)):
        if not isinstance(napis, ast.JoinedStr):
            continue
        czesci = list(napis.values)
        w_apostrofach = [
            czesc.value
            for i, czesc in enumerate(czesci)
            if isinstance(czesc, ast.FormattedValue) and _w_apostrofach(czesci, i)
        ]
        if w_apostrofach and all(_nazwa_typu_tlumaczona(w) for w in w_apostrofach):
            wiersze.add(napis.lineno)
    return wiersze


#: Słowa funkcyjne zdania po angielsku i znaczniki zdania po polsku — reguła języka: tekst
#: dla projektanta z co najmniej dwoma słowami angielskimi i bez żadnego znacznika polskiego
#: jest komunikatem po angielsku (pomiar 2026-10-29: 14 trafień w ``src``, wszystkie realne).
_SLOWA_ANGIELSKIE = re.compile(
    r"\b(?:the|is|are|must|not|for|of|failed|missing|required|unsupported|invalid|cannot"
    r"|should|with|no|has|have|found|unknown)\b",
    re.IGNORECASE,
)
_ZNACZNIKI_POLSKIE = re.compile(
    r"[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]|\b(?:nie|jest|brak|dla|lub|oraz|się|musi|wymaga|bez|albo|na|w|z|do)\b"
)


def naruszenia_jezyka(sciezka: str, plik: Path | None = None) -> list[Naruszenie]:
    """Komunikat dla projektanta po angielsku — produkt mówi do projektanta po polsku
    (kontrakt prezentacji inżynierskiej); błąd programu idzie ``AssertionError``."""
    drzewo = _drzewo(plik or SRC / sciezka)
    return [
        Naruszenie(sciezka, komunikat.wezel.lineno, "komunikat po angielsku", komunikat.tekst)
        for komunikat, _rodzice_tekstu in teksty_komunikatow(zakres_src(sciezka), drzewo)
        if len(_SLOWA_ANGIELSKIE.findall(komunikat.tekst)) >= 2
        and not _ZNACZNIKI_POLSKIE.search(komunikat.tekst)
    ]


def _w_dopisku_kodu(naruszenie: Naruszenie) -> bool:
    """Kod naruszenia stoi WYŁĄCZNIE w dopisku ``(<etykieta z DOPISKI_KODU>: <kod>)`` na końcu
    tekstu (reguła „kod” na stałej treści)."""
    dopisek = _DOPISEK_KODU.search(naruszenie.tekst)
    if dopisek is None or dopisek.group("etykieta") not in DOPISKI_KODU:
        return False
    token = _token_naruszenia(naruszenie)
    return dopisek.group("kod") == token and token not in naruszenie.tekst[: dopisek.start()]


def _wstawka_w_dopisku_kodu(czesc: ast.FormattedValue, rodzice: dict[int, ast.AST]) -> bool:
    """Wstawka f-stringu jest kodem dopisku ``… (<etykieta z DOPISKI_KODU>: {kod})`` na końcu
    tekstu: poprzedza ją stała kończąca się ``(<etykieta>: ``, a po niej stoi wyłącznie ``)``
    (z kropką)."""
    napis = rodzice.get(id(czesc))
    if not isinstance(napis, ast.JoinedStr):
        return False
    i = next(k for k, w in enumerate(napis.values) if w is czesc)
    if i == 0 or not isinstance(napis.values[i - 1], ast.Constant):
        return False
    przed = str(napis.values[i - 1].value)
    po = napis.values[i + 1 :]
    if not (
        len(po) == 1 and isinstance(po[0], ast.Constant) and str(po[0].value).strip() in {")", ")."}
    ):
        return False
    return any(przed.endswith(f"({etykieta}: ") for etykieta in DOPISKI_KODU)


def _token_naruszenia(naruszenie: Naruszenie) -> str:
    """Token kodu z powodu naruszenia reguły tekstowej, pętli albo argumentu
    (``kod bank_nastaw (zmienna pętli sekcja)`` → ``bank_nastaw``)."""
    token = naruszenie.powod.removeprefix("kod ")
    return token if token == _ZASTEPNIK else token.split(" (", 1)[0]


def naruszenia_klasy(sciezka: str, plik: Path | None = None) -> list[Naruszenie]:
    """Naruszenia klasy w module (po wyłączeniach z uzasadnieniem)."""
    wynik: list[Naruszenie] = [
        n
        for n in (
            *naruszenia_petli_kluczy(sciezka, plik),
            *naruszenia_kluczy_w_argumentach(sciezka, plik),
        )
        if f"{sciezka}:{_token_naruszenia(n)}" not in TOKENY_FORMATU_DANYCH
    ]
    wynik += naruszenia_nazw_i_identyfikatorow(sciezka, plik)
    wynik += naruszenia_tresci_bez_zdania(sciezka, plik)
    wynik += naruszenia_sklejen(sciezka, plik)
    wynik += naruszenia_jezyka(sciezka, plik)
    for naruszenie in _surowe_naruszenia(sciezka, plik):
        token = _token_naruszenia(naruszenie)
        if f"{sciezka}:{token}" in TOKENY_FORMATU_DANYCH or _w_dopisku_kodu(naruszenie):
            continue
        if _tlumaczony(sciezka):
            if token == _ZASTEPNIK and sciezka in INTERPOLOWANE_KLUCZE_TLUMACZONE:
                continue
            if token == _ZASTEPNIK and naruszenie.linia in _linie_nazw_typow_tlumaczonych(
                sciezka, plik
            ):
                continue
            klucz = token.strip("`")
            if f"`{klucz}`" in naruszenie.tekst and etykieta_klucza(klucz) is not None:
                continue
        wynik.append(naruszenie)
    return wynik


def _moduly_klasy() -> list[str]:
    return [
        plik.relative_to(SRC).as_posix()
        for plik in sorted(SRC.rglob("*.py"))
        if not _poza_klasa(plik.relative_to(SRC).as_posix())
    ]


def _poza_klasa(sciezka: str) -> bool:
    return any(
        sciezka == wpis or (wpis.endswith("/") and sciezka.startswith(wpis))
        for wpis in MODULY_POZA_KLASA
    )


#: Naruszenia klasy w rdzeniach zamrożonych B-01 czekające na decyzję architekta. Zbiór PUSTY
#: od decyzji B-01 z 2026-10-30 (zgoda na wszystkie 35 miejsc meldunku commitu 3: zmiana
#: wyłącznie argumentów wyjątków i komunikatów oraz stałe słowników nazw w rdzeniach,
#: porównanie drzew składniowych w logu commitu). Zapadka: ``test_odmowy_b01_oczekujace_sa_
#: dokladnym_zbiorem`` przypina pusty zbiór — nowe naruszenie w rdzeniu B-01 czerwieni test
#: i wymaga naprawy po decyzji, nie wpisu tutaj.
ODMOWY_B01_OCZEKUJACE: dict[str, str] = {}


def test_komunikaty_calego_src_bez_kluczy_pol() -> None:
    """KLASA: żaden komunikat odmowy, walidacji ani ostrzeżenia w ``src`` nie niesie klucza
    pola zamiast nazwy wielkości (poza dokładnym zbiorem ``ODMOWY_B01_OCZEKUJACE``)."""
    naruszenia = [
        n
        for sciezka in _moduly_klasy()
        for n in naruszenia_klasy(sciezka)
        if f"{n.plik}:{n.linia}" not in ODMOWY_B01_OCZEKUJACE
    ]
    assert not naruszenia, "\n".join(str(n) for n in naruszenia)


def test_odmowy_b01_oczekujace_sa_dokladnym_zbiorem() -> None:
    """Zapadka: żadne naruszenie klasy w rdzeniach B-01 nie czeka na decyzję — zbiór
    ``ODMOWY_B01_OCZEKUJACE`` jest pusty, a skan rdzeni (``jest_rdzeniem_b01``) nie znajduje
    żadnego naruszenia. Rdzenie są w zakresie skanu (pusty zakres dałby fałszywą zieleń)."""
    assert ODMOWY_B01_OCZEKUJACE == {}
    rdzenie = [sciezka for sciezka in _moduly_klasy() if jest_rdzeniem_b01(sciezka)]
    assert len(rdzenie) >= 10, rdzenie
    w_rdzeniach = [str(n) for sciezka in rdzenie for n in naruszenia_klasy(sciezka)]
    assert not w_rdzeniach, "\n".join(w_rdzeniach)


def test_kanal_obejmuje_wyjatki_projektu_i_pomija_bledy_programu() -> None:
    """Kanał jest wyprowadzony z drzewa klas: wyjątki, których treść projektant widzi
    (scenariusz, import arkusza, brak zasobu, budowa grafu, odmowy dynamiki), są w nim;
    klasy błędu programu — nie."""
    kanaly = kanaly_wywolan()
    for klasa in (
        "OdmowaDanychError",
        "OdmowaNazwana",
        "FaultScenarioValidationError",
        "XlsxValidationError",
        "BrakZasobuError",
        "BenchmarkBuildError",
        "OdmowaDynamiki",
        "OdmowaWejsciaDynamiki",
        "TemplateApplyError",
        "ValueError",
        "HTTPException",
    ):
        assert klasa in kanaly, klasa
    assert not (set(BLEDY_PROGRAMU) & kanaly)
    assert "KeyError" not in kanaly and "TypeError" not in kanaly


def test_wylaczenia_klasy_sa_zywe() -> None:
    """Każde wyłączenie wskazuje istniejące miejsce, które BEZ wyłączenia byłoby naruszeniem
    — martwy wpis byłby furtką dla przyszłego klucza w tym samym miejscu."""
    klasy = klasy_wyjatkow_src()
    for klasa in BLEDY_PROGRAMU:
        assert klasa in klasy, klasa
        z_klasa = [
            plik.relative_to(SRC).as_posix()
            for plik in sorted(SRC.rglob("*.py"))
            if _surowe_naruszenia(plik.relative_to(SRC).as_posix(), wywolania=frozenset({klasa}))
        ]
        assert z_klasa, f"{klasa}: wyłączenie bez naruszenia — zbędne"
    for wpis in MODULY_POZA_KLASA:
        pliki = (
            sorted(p.relative_to(SRC).as_posix() for p in (SRC / wpis).rglob("*.py"))
            if wpis.endswith("/")
            else [wpis]
        )
        assert all((SRC / sciezka).is_file() for sciezka in pliki), wpis
        assert any(
            _surowe_naruszenia(sciezka) or naruszenia_kluczy_w_argumentach(sciezka)
            for sciezka in pliki
        ), f"{wpis}: wyłączenie bez naruszenia — zbędne"
    wylaczone = {tuple(wpis.split("::", 1)) for wpis in HELPERY_POZA_KLASA}
    for sciezka, nazwa in sorted(wylaczone):
        drzewo = _drzewo(SRC / sciezka)
        assert any(
            isinstance(w, ast.FunctionDef | ast.ClassDef) and w.name == nazwa for w in drzewo.body
        ), f"{sciezka}::{nazwa}: brak definicji — wpis zbędny"
    for wpis in TOKENY_FORMATU_DANYCH:
        sciezka, token = wpis.split(":", 1)
        tokeny = {
            _token_naruszenia(n)
            for n in (
                *_surowe_naruszenia(sciezka),
                *naruszenia_petli_kluczy(sciezka),
                *naruszenia_kluczy_w_argumentach(sciezka),
            )
        }
        assert token in tokeny, f"{wpis}: token nie występuje w komunikacie — wpis zbędny"
    for wpis in MODULY_ODMOW_TLUMACZONYCH:
        assert (SRC / wpis).exists(), wpis
    for sciezka in INTERPOLOWANE_KLUCZE_TLUMACZONE:
        tokeny = {n.powod.removeprefix("kod ") for n in _surowe_naruszenia(sciezka)}
        assert _ZASTEPNIK in tokeny, sciezka


def test_rdzenie_b01_sa_w_zakresie_strazenika() -> None:
    """Pin 0: rdzenie zamrożone B-01 NIE mają wyjątku — decyzja architekta 2026-10-29
    przyjęła zmianę WYŁĄCZNIE tekstów ich komunikatów (drzewa składniowe z wymazanymi
    stałymi napisowymi identyczne), więc każdy plik każdego wpisu listy B-01 jest
    sprawdzany tak samo jak reszta ``src``. Przywrócenie wyjątku czerwieni ten test."""
    moduly = set(_moduly_klasy())
    pliki_b01 = sorted(
        sciezka
        for plik in SRC.rglob("*.py")
        if jest_rdzeniem_b01(sciezka := plik.relative_to(SRC).as_posix())
    )
    assert len(pliki_b01) >= len(_rdzenie_b01().sciezki_b01())  # type: ignore[attr-defined]
    assert not [sciezka for sciezka in pliki_b01 if sciezka not in moduly]
    for wpis in _rdzenie_b01().sciezki_b01():  # type: ignore[attr-defined]
        assert any(s == wpis or s.startswith(wpis) for s in pliki_b01), wpis


def _klucz_w_apostrofach(petla: ast.For) -> bool:
    """Czy odmowa w pętli cytuje PIERWSZĄ zmienną pętli w odwróconych apostrofach
    (``f"…`{nazwa}`…"``) — tylko taka interpolacja korzysta z wyłączenia
    ``INTERPOLOWANE_KLUCZE_TLUMACZONE``; pętla z opisem po polsku go nie potrzebuje."""
    cel = petla.target.elts[0]  # type: ignore[attr-defined]
    if not isinstance(cel, ast.Name):
        return False
    for wezel in ast.walk(petla):
        if not isinstance(wezel, ast.JoinedStr):
            continue
        czesci = wezel.values
        for poprzednia, biezaca in zip(czesci, czesci[1:], strict=False):
            if (
                isinstance(poprzednia, ast.Constant)
                and str(poprzednia.value).endswith("`")
                and isinstance(biezaca, ast.FormattedValue)
                and isinstance(biezaca.value, ast.Name)
                and biezaca.value.id == cel.id
            ):
                return True
    return False


def test_petla_nastaw_ma_etykiety() -> None:
    """Interpolowany klucz pętli dodatniości nastaw (``kontrakty.py``) ma etykietę dla
    KAŻDEJ wartości — warunek wyłączenia ``INTERPOLOWANE_KLUCZE_TLUMACZONE``. Pętla, której
    odmowa podaje opis po polsku (punkt pracy: „napięcia węzłów”), wyłączenia nie używa."""
    drzewo = _drzewo(SRC / "network_model/solvers/dynamika/kontrakty.py")
    petle = [
        wezel
        for wezel in ast.walk(drzewo)
        if isinstance(wezel, ast.For)
        and isinstance(wezel.target, ast.Tuple)
        and isinstance(wezel.iter, ast.Tuple)
        and any(
            isinstance(z, ast.Call) and getattr(z.func, "id", "") == "OdmowaDynamiki"
            for z in ast.walk(wezel)
        )
        and _klucz_w_apostrofach(wezel)
    ]
    assert petle, "pętla nastaw zniknęła — wpis INTERPOLOWANE_KLUCZE_TLUMACZONE zbędny"
    klucze = [
        element.elts[0].value
        for petla in petle
        for element in petla.iter.elts  # type: ignore[attr-defined]
        if isinstance(element, ast.Tuple) and isinstance(element.elts[0], ast.Constant)
    ]
    assert klucze and all(etykieta_klucza(k) is not None for k in klucze), klucze


def test_symbole_wielkosci_nie_sa_kluczami() -> None:
    """Symbole z indeksem dolnym (lista z podstawą normową) przechodzą; klucz pola nie."""
    assert kody_w_tekscie("I_B ≤ I_n ≤ I_z; t_b = 0,1 s; c_max; R_A·I_Δn ≤ 50 V; u_k") == []
    assert kody_w_tekscie("Pole in_a musi być dodatnie") == ["in_a"]


def test_strazenik_wykrywa_wstrzykniety_klucz_w_kazdym_kanale(tmp_path: Path) -> None:
    """Iniekcja w kopii modułu spoza inwentarza #142: każdy kanał (wyjątek biblioteczny,
    wyjątek projektu, ``HTTPException``, argument nazwany, rekord) i każdy rodzaj tokenu
    czerwienieje; wyłączenie formatu danych działa wyłącznie dla SWOJEGO pliku."""
    wzor = SRC / "network_model" / "solvers" / "protection_lv_curves.py"
    kopia = tmp_path / "iniekcja.py"
    kopia.write_text(
        wzor.read_text(encoding="utf-8")
        + "\n\ndef _iniekcja(x):\n"
        + "    raise ValueError(f'Prąd in_a musi być dodatni, otrzymano {x}.')\n"
        + "def _iniekcja2(x):\n"
        + "    raise OdmowaNazwana('Pole r_total_ohm jest wymagane', kod='k')\n"
        + "def _iniekcja3(x):\n"
        + "    raise HTTPException(status_code=422, detail='Brak wartości `sk3_mva` w danych')\n"
        + "def _iniekcja4(x):\n"
        + "    return Ostrzezenie(kod='k', message_pl='Tryb SHORT_CIRCUIT_POWER bez danych')\n"
        + "def _iniekcja5(x):\n"
        + "    raise ValueError('Kolumna zaczep_min jest pusta')\n"
        + "def _iniekcja6(x):\n"
        + "    raise KeyError('klucz_wewnetrzny nie istnieje')\n",
        encoding="utf-8",
    )
    sciezka = "network_model/solvers/protection_lv_curves.py"
    tokeny = {n.powod.removeprefix("kod ") for n in naruszenia_klasy(sciezka, kopia)}
    assert {"in_a", "r_total_ohm", "`sk3_mva`", "sk3_mva", "SHORT_CIRCUIT_POWER"} <= tokeny
    assert "zaczep_min" in tokeny  # wyłączenie formatu danych dotyczy wyłącznie importu arkusza
    assert "klucz_wewnetrzny" not in tokeny  # gołe KeyError = błąd programu, poza kanałem
    assert all(
        n.linia > len(wzor.read_text(encoding="utf-8").splitlines())
        for n in naruszenia_klasy(sciezka, kopia)
    )


def test_strazenik_modeluje_zamiane_kluczy_odmow_dynamiki(tmp_path: Path) -> None:
    """W module tłumaczonym klucz w apostrofach z etykietą przechodzi (zamienia go
    ``komunikat_dla_projektanta``); klucz goły i klucz bez etykiety — nie."""
    wzor = SRC / "network_model" / "solvers" / "dynamika" / "kontrakty.py"
    kopia = tmp_path / "kontrakty_iniekcja.py"
    kopia.write_text(
        wzor.read_text(encoding="utf-8")
        + "\n\ndef _iniekcja(x):\n"
        + "    raise OdmowaDynamiki('k', f'Nastawa `dt_s` = {x} poza zakresem')\n"
        + "def _iniekcja2(x):\n"
        + "    raise OdmowaDynamiki('k', f'Nastawa dt_s = {x} poza zakresem')\n"
        + "def _iniekcja3(x):\n"
        + "    raise OdmowaDynamiki('k', f'Nastawa `klucz_bez_etykiety` = {x} odrzucona')\n",
        encoding="utf-8",
    )
    sciezka = "network_model/solvers/dynamika/kontrakty.py"
    nowe = [
        n
        for n in naruszenia_klasy(sciezka, kopia)
        if n.linia > len(wzor.read_text(encoding="utf-8").splitlines())
    ]
    tokeny = {(n.tekst.split("=")[0].strip(), n.powod.removeprefix("kod ")) for n in nowe}
    assert ("Nastawa dt_s", "dt_s") in tokeny
    assert ("Nastawa `klucz_bez_etykiety`", "`klucz_bez_etykiety`") in tokeny
    assert not any(t[0] == "Nastawa `dt_s`" for t in tokeny)


@pytest.mark.parametrize("wpis", sorted(MODULY_POZA_KLASA))
def test_modul_poza_klasa_nie_ma_konsumenta_produkcyjnego(wpis: str) -> None:
    """Warunek wyłączenia ``MODULY_POZA_KLASA``: żaden moduł produkcyjny spoza dozwolonego
    prefiksu (pakiet, który nazwy tylko reeksportuje, albo sam wyłączony pakiet) nie używa
    modułu ani żadnej jego publicznej funkcji czy klasy."""
    dozwolony_prefiks, _ = MODULY_POZA_KLASA[wpis]
    pliki = sorted((SRC / wpis).rglob("*.py")) if wpis.endswith("/") else [SRC / wpis]
    nazwy: set[str] = set()
    moduly: set[str] = set()
    for plik in pliki:
        sciezka = plik.relative_to(SRC).as_posix()
        modul = _modul_pliku(sciezka)
        moduly |= {modul, modul.rsplit(".", 1)[-1]}
        nazwy |= {
            wezel.name
            for wezel in _drzewo(plik).body
            if isinstance(wezel, ast.FunctionDef | ast.ClassDef) and not wezel.name.startswith("_")
        }
    assert nazwy, wpis

    prefiks_modulu = _modul_pliku(dozwolony_prefiks.rstrip("/") + ".py")
    pelne_moduly = {m for m in moduly if "." in m}

    def _konsument(plik: Path) -> bool:
        """Import modułu (albo pakietu) wyłączonego lub import jego publicznej nazwy
        z reeksportu w dozwolonym pakiecie — tekst docstringu nie jest użyciem."""
        for wezel in ast.walk(_drzewo(plik)):
            if isinstance(wezel, ast.Import) and any(
                a.name in pelne_moduly or any(a.name.startswith(m + ".") for m in pelne_moduly)
                for a in wezel.names
            ):
                return True
            if isinstance(wezel, ast.ImportFrom) and wezel.module:
                if wezel.module in pelne_moduly or any(
                    wezel.module.startswith(m + ".") for m in pelne_moduly
                ):
                    return True
                if wezel.module.startswith(prefiks_modulu) and any(
                    a.name in nazwy | moduly for a in wezel.names
                ):
                    return True
        return False

    importujacy = sorted(
        plik.relative_to(SRC).as_posix()
        for plik in SRC.rglob("*.py")
        if not plik.relative_to(SRC).as_posix().startswith(dozwolony_prefiks) and _konsument(plik)
    )
    assert not importujacy, importujacy


#: Wywołania, których literał klucza pola trafia do ``nazwa_pola`` (pozycja argumentu albo
#: nazwa argumentu): ``pole``/``nazwa_pola`` (pierwszy), ``parsuj_uuid`` (drugi — klucz
#: parametru ścieżki), ``param_name=`` resolvera biegu ``api/enm.py``.
_ARGUMENTY_KLUCZA_POLA: dict[str, int] = {"pole": 0, "nazwa_pola": 0, "parsuj_uuid": 1}


def _literalne_klucze_pol() -> list[tuple[str, int, str]]:
    wynik: list[tuple[str, int, str]] = []
    for plik in sorted(SRC.rglob("*.py")):
        sciezka = plik.relative_to(SRC).as_posix()
        for wezel in ast.walk(_drzewo(plik)):
            if not isinstance(wezel, ast.Call):
                continue
            nazwa = getattr(wezel.func, "id", None) or getattr(wezel.func, "attr", None)
            pozycja = _ARGUMENTY_KLUCZA_POLA.get(nazwa or "")
            kandydaci: list[ast.expr] = []
            if pozycja is not None and len(wezel.args) > pozycja:
                # Wywołanie z kontekstem operacji (drugi argument ``pole``) sprawdza
                # strażnik karty #142 — tu wyłącznie klucz ogólny.
                if not (nazwa in {"pole", "nazwa_pola"} and len(wezel.args) > 1):
                    kandydaci.append(wezel.args[pozycja])
            kandydaci.extend(k.value for k in wezel.keywords if k.arg == "param_name")
            for kandydat in kandydaci:
                if isinstance(kandydat, ast.Constant) and isinstance(kandydat.value, str):
                    wynik.append((sciezka, wezel.lineno, kandydat.value))
    return wynik


def test_kazdy_literalny_klucz_pola_w_src_ma_nazwe_w_mapie() -> None:
    """Brak wpisu w ``NAZWY_POL_KONTRAKTU_PL`` nie może wyjść dopiero w ścieżce błędu
    (``KeyError`` → 500 zamiast komunikatu): każdy literał klucza w CAŁYM ``src`` —
    także poza inwentarzem #142 (``parsuj_uuid``, resolver biegu ``param_name=``) — ma
    nazwę po polsku bez tokenu kodu."""
    from enm.slownik_komunikatow import nazwa_pola

    klucze = _literalne_klucze_pol()
    sciezki = {s for s, _, _ in klucze}
    assert {"api/enm.py", "api/execution_runs.py", "api/study_cases.py"} <= sciezki
    assert any(k == "case_id" for _, _, k in klucze)
    assert any(k == "short_circuit_run_id" for _, _, k in klucze)
    braki: list[str] = []
    for sciezka, linia, klucz in klucze:
        try:
            nazwa = nazwa_pola(klucz)
        except KeyError:
            braki.append(f"{sciezka}:{linia}: {klucz} (brak wpisu)")
            continue
        if kody_w_tekscie(nazwa):
            braki.append(f"{sciezka}:{linia}: {klucz} → {nazwa!r} (token kodu w nazwie)")
    assert not braki, braki


def test_pola_segmentow_profilu_maja_etykiety() -> None:
    """Warunek wpisu ``zrodlo_testowe.py`` w ``INTERPOLOWANE_KLUCZE_TLUMACZONE``: odmowa
    skończoności cytuje KAŻDE pole KAŻDEGO segmentu profilu (``vars(segment)``) — każde ma
    etykietę, więc ``komunikat_dla_projektanta`` zamienia je na nazwę."""
    import dataclasses
    import typing

    from network_model.solvers.dynamika.urzadzenia.zrodlo_testowe import SegmentProfilu

    segmenty = typing.get_args(SegmentProfilu)
    assert len(segmenty) == 5, segmenty
    pola = {pole.name for segment in segmenty for pole in dataclasses.fields(segment)}
    assert {"t_s", "u_pu", "kat_deg", "czas_trwania_s"} <= pola
    assert all(etykieta_klucza(pole) is not None for pole in pola), sorted(
        p for p in pola if etykieta_klucza(p) is None
    )


def test_regula_petli_i_opakowan_wykrywa_wstrzykniete_klucze(tmp_path: Path) -> None:
    """Iniekcja: klucz pola wstawiony zmienną pętli (krotka literałów, ``.items()`` słownika
    lokalnego) i tekst przekazany funkcji opakowującej kanał (``odmowa_twarda``) czerwienieją;
    pętla z opisem po polsku i klucz w apostrofach z etykietą w module tłumaczonym — nie."""
    assert "odmowa_twarda" in kanaly_wywolan()
    assert "_odmowa_charakterystyki" in kanaly_wywolan()
    assert "KeyError" not in kanaly_wywolan()
    wzor = SRC / "network_model" / "solvers" / "protection_lv_curves.py"
    kopia = tmp_path / "iniekcja_petli.py"
    kopia.write_text(
        wzor.read_text(encoding="utf-8")
        + "\n\ndef _iniekcja_petli(a, b):\n"
        + "    for nazwa, wartosc in (('in_a', a), ('i_query_a', b)):\n"
        + "        if wartosc <= 0:\n"
        + "            raise ValueError(f'Pole {nazwa} musi być dodatnie')\n"
        + "def _iniekcja_slownika(a):\n"
        + "    liczby = {'r_total_ohm': a}\n"
        + "    for nazwa, wartosc in liczby.items():\n"
        + "        raise OdmowaDanychError(f'{nazwa} = {wartosc} odrzucone')\n"
        + "def _iniekcja_opisu(a):\n"
        + "    for opis, wartosc in (('prąd znamionowy I_n', a),):\n"
        + "        raise ValueError(f'{opis} musi być dodatni')\n"
        + "def _iniekcja_opakowania():\n"
        + "    odmowa_twarda('KAT-T-001', 'Pole cross_section_mm2 musi być dodatnie')\n",
        encoding="utf-8",
    )
    sciezka = "network_model/solvers/protection_lv_curves.py"
    granica = len(wzor.read_text(encoding="utf-8").splitlines())
    tokeny = {
        n.powod.removeprefix("kod ").split(" (")[0]
        for n in naruszenia_klasy(sciezka, kopia)
        if n.linia > granica
    }
    assert {"in_a", "i_query_a", "r_total_ohm", "cross_section_mm2"} <= tokeny, tokeny
    assert not any("I_n" in t or "prąd" in t for t in tokeny), tokeny

    wzor_dyn = SRC / "network_model" / "solvers" / "dynamika" / "kontrakty.py"
    kopia_dyn = tmp_path / "kontrakty_petla.py"
    kopia_dyn.write_text(
        wzor_dyn.read_text(encoding="utf-8")
        + "\n\ndef _iniekcja_tlumaczona(a, b):\n"
        + "    for nazwa, wartosc in (('dt_s', a), ('klucz_bez_etykiety', b)):\n"
        + "        raise OdmowaDynamiki('k', f'Nastawa `{nazwa}` = {wartosc} odrzucona')\n",
        encoding="utf-8",
    )
    sciezka_dyn = "network_model/solvers/dynamika/kontrakty.py"
    granica_dyn = len(wzor_dyn.read_text(encoding="utf-8").splitlines())
    tokeny_dyn = {
        n.powod.removeprefix("kod ").split(" (")[0]
        for n in naruszenia_petli_kluczy(sciezka_dyn, kopia_dyn)
        if n.linia > granica_dyn
    }
    assert tokeny_dyn == {"klucz_bez_etykiety"}, tokeny_dyn


def _literaly_wywolan(
    cele: set[tuple[str, str]], pozycja: int | None, nazwa: str
) -> list[tuple[str, int, str]]:
    """Literały podane w CAŁYM ``src`` funkcji z ``cele`` (rozwiązanej po imporcie) na
    miejscu parametru ``(pozycja, nazwa)``."""
    wynik: list[tuple[str, int, str]] = []
    definicje = dict.fromkeys(cele)
    for plik in sorted(SRC.rglob("*.py")):
        sciezka = plik.relative_to(SRC).as_posix()
        for wywolanie in ast.walk(_drzewo(plik)):
            if not isinstance(wywolanie, ast.Call):
                continue
            if _rozwiaz_wywolanie(sciezka, wywolanie, definicje) is None:
                continue
            for argument in _argumenty_w_miejscach(wywolanie, {(pozycja, nazwa)}):
                if isinstance(argument, ast.Constant) and isinstance(argument.value, str):
                    wynik.append((sciezka, wywolanie.lineno, argument.value))
    return wynik


def test_wylaczenie_rekordu_ir_brama_katalogu_projektu_nazywa_pola() -> None:
    """Warunek wpisu ``BrakujacePoleIRError``: typy, które katalog projektu (arkusz
    projektanta) składa przez ``CatalogRepository.from_records`` (linia, kabel,
    transformator), czytają pola wymagane literałem klucza z ETYKIETĄ (``etykieta_parametru``
    nie spada do opisu ogólnego), a granica katalogu projektu zamienia klucz odmowy na tę
    etykietę — nie cytuje treści wyjątku."""
    from enm.slownik_komunikatow import etykieta_parametru

    drzewo = _drzewo(SRC / "network_model/catalog/types.py")
    klasy = {"LineType", "CableType", "TransformerType"}
    klucze: set[str] = set()
    for klasa in drzewo.body:
        if not (isinstance(klasa, ast.ClassDef) and klasa.name in klasy):
            continue
        for wywolanie in ast.walk(klasa):
            if (
                isinstance(wywolanie, ast.Call)
                and _nazwa_wywolanej(wywolanie).startswith("wymagany_")
                and len(wywolanie.args) > 1
                and isinstance(wywolanie.args[1], ast.Constant)
            ):
                klucze.add(str(wywolanie.args[1].value))
    # Pola wymagane trzech typów arkusza projektanta (impedancja linii/kabla, dane
    # znamionowe transformatora) — zbiór pusty znaczyłby, że wzorzec odczytu się zmienił
    # i warunek wpisu przestał cokolwiek sprawdzać.
    assert {
        "r_ohm_per_km",
        "x_ohm_per_km",
        "rated_current_a",
        "rated_power_mva",
        "uk_percent",
        "voltage_hv_kv",
        "voltage_lv_kv",
    } <= klucze, sorted(klucze)
    ogolne = etykieta_parametru("klucz_spoza_wszystkich_slownikow")
    bez_etykiety = sorted(k for k in klucze if etykieta_parametru(k) == ogolne)
    assert not bez_etykiety, bez_etykiety

    granica = _drzewo(SRC / "enm/katalog_projektu.py")
    obsluga = [
        h
        for h in ast.walk(granica)
        if isinstance(h, ast.ExceptHandler)
        and isinstance(h.type, ast.Name)
        and h.type.id == "BrakujacePoleIRError"
    ]
    assert len(obsluga) == 1, "granica katalogu projektu musi łapać BrakujacePoleIRError"
    tresc = ast.unparse(obsluga[0])
    assert "etykieta_parametru(blad.field)" in tresc, tresc
    assert "str(blad)" not in tresc and "{blad}" not in tresc, tresc
    uzycia = sorted(
        p.relative_to(SRC).as_posix()
        for p in SRC.rglob("*.py")
        if "from_records(" in _tresc(p)
        and not p.relative_to(SRC).as_posix().startswith("network_model/catalog/")
    )
    assert uzycia == ["enm/katalog_projektu.py"], uzycia


def test_wylaczenie_wyniku_rozplywu_klucze_sa_polami_zamrozonego_kontraktu() -> None:
    """Warunek wpisów integralności wyniku rozpływu: każdy literał podany tym pomocnikom jest
    polem zamrożonego kontraktu wyniku (zapisuje go solver, nie projektant)."""
    import dataclasses

    from network_model.solvers.power_flow_newton import PowerFlowNewtonSolution
    from network_model.solvers.power_flow_result import (
        PowerFlowBranchResult,
        PowerFlowBusResult,
        PowerFlowResultV1,
        PowerFlowSummary,
    )

    pola = {
        pole.name
        for klasa in (
            PowerFlowBusResult,
            PowerFlowBranchResult,
            PowerFlowSummary,
            PowerFlowResultV1,
            PowerFlowNewtonSolution,
        )
        for pole in dataclasses.fields(klasa)
    }
    pomocnicy = {
        tuple(w.split("::", 1))
        for w in HELPERY_POZA_KLASA
        if w.split("::", 1)[0]
        in {
            "application/solvers/power_flow_binding.py",
            "application/analyses/voltage_profile_view.py",
            "application/analyses/konwencja_mocy.py",
            "enm/rozplyw_wysp.py",
        }
    }
    assert len(pomocnicy) == 9, pomocnicy
    literaly = [
        lit
        for cel in pomocnicy
        for miejsce in ((1, "klucz"), (1, "pole"))
        for lit in _literaly_wywolan({cel}, *miejsce)  # type: ignore[arg-type]
    ]
    assert len(literaly) >= 40, literaly
    # ``value`` — pole wpisu kroku śladu White Box (``{"value": …, "unit": …}``), który
    # zapisuje ``enm.canonical_analysis`` z rozwiązania solvera; to format śladu wyniku,
    # nie pole wpisywane przez projektanta.
    slad = (SRC / "enm/canonical_analysis.py").read_text(encoding="utf-8")
    assert '"max_mismatch_pu": {"value": float(solution.max_mismatch), "unit": "pu"}' in slad
    spoza = sorted({k for _, _, k in literaly} - pola - {"value"})
    assert not spoza, spoza


def test_wylaczenie_archiwum_klucze_sa_formatem_pliku() -> None:
    """Warunek wpisów formatu archiwum: literał sekcji/pola jest kluczem, który ten sam moduł
    zapisuje do pliku (``"klucz": …`` w słowniku eksportu)."""
    for sciezka, nazwa, miejsce in (
        ("domain/project_archive.py", "_sekcja", (1, "klucz")),
        ("domain/incremental_archive.py", "_wartosc_enum", (2, "sciezka")),
    ):
        literaly = {k for _, _, k in _literaly_wywolan({(sciezka, nazwa)}, *miejsce)}
        assert literaly, (sciezka, nazwa)
        drzewo = _drzewo(SRC / sciezka)
        zapisywane = {
            k.value
            for w in ast.walk(drzewo)
            if isinstance(w, ast.Dict)
            for k in w.keys
            if isinstance(k, ast.Constant)
        }
        assert literaly <= zapisywane, (sciezka, sorted(literaly - zapisywane))


def test_druga_bramka_gotowosci_skasowana() -> None:
    """Jeden walidator gotowości (ADR-025, O-65): walidator ENM z ``CalculationReadiness``.
    Dawny profil ``ReadinessProfileV1`` z bramkami ``require_*``, wyjątkiem
    ``ReadinessGateError`` oraz walidacja przyłączenia ``validate_generator_connections`` —
    równoległe reguły bez konsumenta w produkcie — skasowane w commicie 4 karty komunikatów.
    Zapadka: żaden moduł ``src`` nie definiuje tych nazw ponownie."""
    zakazane = {
        "ReadinessProfileV1",
        "ReadinessGateError",
        "build_readiness_profile",
        "validate_generator_connections",
    }
    definicje = sorted(
        f"{p.relative_to(SRC).as_posix()}::{w.name}"
        for p in SRC.rglob("*.py")
        for w in ast.walk(_drzewo(p))
        if isinstance(w, ast.FunctionDef | ast.AsyncFunctionDef | ast.ClassDef)
        and (w.name in zakazane or (p.name == "readiness.py" and w.name.startswith("require_")))
    )
    assert not definicje, definicje


def test_wylaczenie_odmowy_nazwanej_kod_tylko_w_niezmienniku() -> None:
    """Warunek wpisu ``OdmowaNazwana``: poprawne wywołanie nie wstawia kodu do zdania; kod
    pojawia się w treści wyłącznie w odmowie niezmiennika."""
    from network_model.odmowa_danych import OdmowaNazwana

    odmowa = OdmowaNazwana("Brak mocy źródła w modelu.", kod="polecenie_osd.zrodlo_bez_mocy")
    assert "polecenie_osd" not in str(odmowa)
    # Naruszenie kontraktu konstruktora jest błędem programu (``AssertionError``), nie
    # odmową danych dla projektanta (commit kodów w komunikatach, 2026-10-29).
    with pytest.raises(AssertionError, match="nie należy do treści"):
        OdmowaNazwana("Odmowa polecenie_osd.x w zdaniu", kod="polecenie_osd.x")


def test_wylaczenia_slownikowe_literaly_sa_wartosciami_slownika() -> None:
    """Warunek wpisów „odmowa NIEZNANEJ wartości”: każdy literał z wywołania należy do
    słownika, więc odmowa z jego cytatem nie odpala."""
    from infrastructure.persistence.repositories.document_store_repository import (
        DOCUMENT_TYPES,
    )
    from network_model.catalog.rodzaje_aparatury import WIELKOSCI_ZWARCIOWE_APARATU_SN
    from network_model.catalog.sekcje_modelu import PRZESTRZENIE_Z_SEKCJAMI

    rodzaje_dokumentow = {
        k
        for plik in SRC.rglob("*.py")
        for w in ast.walk(_drzewo(plik))
        if isinstance(w, ast.Call)
        for kw in w.keywords
        if kw.arg == "doc_type" and isinstance(kw.value, ast.Constant)
        for k in [str(kw.value.value)]
    }
    assert rodzaje_dokumentow and rodzaje_dokumentow <= DOCUMENT_TYPES, rodzaje_dokumentow
    sciezka = "network_model/catalog/rodzaje_aparatury.py"
    aparat = {
        k
        for _, _, k in _literaly_wywolan(
            {(sciezka, "wielkosc_zwarciowa_aparatu_sn_dotyczy")}, 1, "pole"
        )
    }
    assert aparat and aparat <= set(WIELKOSCI_ZWARCIOWE_APARATU_SN), aparat
    lacznik = {
        k
        for _, _, k in _literaly_wywolan(
            {(sciezka, "wielkosc_zwarciowa_lacznika_dotyczy")}, 1, "pole"
        )
    }
    assert lacznik <= {"ik_ka", "i_cu_ka", "icw_ka"}, lacznik
    przestrzenie = {
        k
        for _, _, k in _literaly_wywolan(
            {
                ("network_model/catalog/sekcje_modelu.py", "sekcje_typu"),
                ("network_model/catalog/sekcje_modelu.py", "dane_typu"),
            },
            1,
            "przestrzen",
        )
    }
    assert przestrzenie and przestrzenie <= set(PRZESTRZENIE_Z_SEKCJAMI), przestrzenie


def test_regula_argumentow_wykrywa_klucz_przekazany_pomocnikowi(tmp_path: Path) -> None:
    """Iniekcja: literał klucza podany funkcji, która wstawia argument do treści kanału
    (wprost, przechodnio, przez konstruktor wyjątku), czerwienieje; literał podany pomocnikowi
    wyłączonemu (``wymagany_float`` → ``BrakujacePoleIRError``) — nie."""
    wzor = SRC / "api" / "der_sn_documents.py"
    kopia = tmp_path / "iniekcja_argumentow.py"
    kopia.write_text(
        wzor.read_text(encoding="utf-8")
        + "\n\ndef _iniekcja(payload):\n"
        + "    return _zastosowana_wartosc(payload, 'sn_mva', 'r_total_ohm')\n"
        + "def _iniekcja_wylaczona(dane):\n"
        + "    return wymagany_float(dane, 'cross_section_mm2')\n",
        encoding="utf-8",
    )
    granica = len(wzor.read_text(encoding="utf-8").splitlines())
    tokeny = {
        n.powod
        for n in naruszenia_kluczy_w_argumentach("api/der_sn_documents.py", kopia)
        if n.linia > granica
    }
    assert tokeny == {"kod r_total_ohm (argument _zastosowana_wartosc)"}, tokeny
    parametryczne = funkcje_parametryczne_src()
    assert ("api/der_sn_documents.py", "_zastosowana_wartosc") in parametryczne
    assert ("network_model/ir_fields.py", "wymagany_float") not in parametryczne
    assert ("network_model/ir_fields.py", "BrakujacePoleIRError") not in parametryczne


# ---------------------------------------------------------------------------
# Identyfikator KODU w zdaniu: nazwa klasy, nazwa typu, identyfikator bez rodzaju, sam kod
# ---------------------------------------------------------------------------


def _rodziny_klas_dynamiki() -> dict[str, frozenset[str]]:
    """Rodziny klas rdzenia dynamiki, których nazwę odmowa cytuje ``type(x).__name__``:
    zdarzenia harmonogramu (``ZdarzenieDynamiki`` — akcja dozoru, tryb stanowiska),
    segmenty profilu źródła testowego (``SegmentProfilu``) i urządzenia (każda klasa
    ``urzadzenia/`` deklarująca ``stany_przypisywalne`` — protokół ``Urzadzenie``)."""
    from typing import get_args

    from network_model.solvers.dynamika.kontrakty import ZdarzenieDynamiki
    from network_model.solvers.dynamika.urzadzenia.zrodlo_testowe import SegmentProfilu

    urzadzenia = frozenset(
        wezel.name
        for plik in sorted((SRC / "network_model/solvers/dynamika/urzadzenia").rglob("*.py"))
        for wezel in ast.walk(_drzewo(plik))
        if isinstance(wezel, ast.ClassDef)
        and any(
            isinstance(f, ast.FunctionDef) and f.name == "stany_przypisywalne" for f in wezel.body
        )
    )
    return {
        "zdarzenia": frozenset(k.__name__ for k in get_args(ZdarzenieDynamiki)),
        "segmenty": frozenset(k.__name__ for k in get_args(SegmentProfilu)),
        "urzadzenia": urzadzenia,
    }


def test_nazwy_klas_dynamiki_kompletne_wobec_rodzin() -> None:
    """Warunek wyłączenia ``type(x).__name__`` w apostrofach w module tłumaczonym: KAŻDA
    klasa każdej rodziny ma rodzaj obiektu słowami, a każdy wpis słownika jest klasą
    rodziny (martwy wpis byłby fikcją). Rodziny pochodzą z kodu, nie z ręcznej listy."""
    from application.dynamika.odmowy import NAZWY_KLAS_DYNAMIKI_PL

    rodziny = _rodziny_klas_dynamiki()
    assert len(rodziny["urzadzenia"]) >= 10, rodziny["urzadzenia"]
    wszystkie = frozenset().union(*rodziny.values())
    assert not (wszystkie - set(NAZWY_KLAS_DYNAMIKI_PL)), sorted(
        wszystkie - set(NAZWY_KLAS_DYNAMIKI_PL)
    )
    assert not (set(NAZWY_KLAS_DYNAMIKI_PL) - wszystkie)
    for etykieta in NAZWY_KLAS_DYNAMIKI_PL.values():
        assert not kody_w_tekscie(etykieta) and not _NAZWA_KLASY.findall(etykieta), etykieta


def test_odmowa_dynamiki_nazywa_rodzaj_obiektu_slowami() -> None:
    """Realna ścieżka: odmowa rdzenia (akcja dozoru o niechwilowym rodzaju, stan
    nieprzypisywalny urządzenia) przechodzi przez ``komunikat_dla_projektanta`` i nie niesie
    nazwy klasy — niesie rodzaj obiektu słowami."""
    from application.dynamika.odmowy import NAZWY_KLAS_DYNAMIKI_PL, komunikat_dla_projektanta
    from network_model.solvers.dynamika.urzadzenia.maszyna_klasyczna import MaszynaKlasyczna
    from network_model.solvers.dynamika.zdarzenia import sprawdz_przypisanie

    urzadzenie = object.__new__(MaszynaKlasyczna)
    object.__setattr__(urzadzenie, "ident", "G1")
    with pytest.raises(Exception) as blad:
        sprawdz_przypisanie(urzadzenie, "omega_pu", 1.0, 0.5)
    tekst = komunikat_dla_projektanta(str(blad.value), {})
    assert "MaszynaKlasyczna" not in tekst
    assert NAZWY_KLAS_DYNAMIKI_PL["MaszynaKlasyczna"] in tekst, tekst
    assert not [n for n in _NAZWA_KLASY.findall(tekst) if n in klasy_src()], tekst


@pytest.mark.parametrize(
    ("tekst_przed", "oczekiwane"),
    [
        ("Nie znaleziono biegu obliczeń ", True),
        ("Węzeł o ID '", True),
        ("Generator '⟨⟩' (", True),
        ("Wykryto model w projekcie ", True),
        ("Usunięcie zwarcia w węźle ", True),
        ("Run nie znaleziony: ", False),
        ("Kopia zapasowa nie znaleziona: project=", False),
        ("", False),
    ],
)
def test_nazwa_rodzaju_przy_identyfikatorze(tekst_przed: str, oczekiwane: bool) -> None:
    """Predykat reguły identyfikatora: rodzaj obiektu słowem przed identyfikatorem (także
    przez cytowaną nazwę i nawias), a nie sam czasownik albo zapis ``klucz=``."""
    assert ma_nazwe_rodzaju(tekst_przed) is oczekiwane


def test_regula_nazw_klas_typow_i_identyfikatorow_wykrywa_iniekcje(tmp_path: Path) -> None:
    """Iniekcja w kopii modułu (iloczyn: kanał wyjątku × kanał rekordu × tekst w zmiennej ×
    rodzaj tokenu): nazwa klasy ``src`` w zdaniu, ``type(x).__name__`` w kanale i w tekście
    zapisanym do zmiennej, zmienna wyprowadzona z nazwy typu, identyfikator bez rodzaju —
    czerwienieją; identyfikator z rodzajem, nazwa typu w błędzie programu (``TypeError``)
    i zdanie bez identyfikatora kodu — nie."""
    wzor = SRC / "network_model" / "solvers" / "protection_lv_curves.py"
    kopia = tmp_path / "iniekcja_nazw.py"
    kopia.write_text(
        wzor.read_text(encoding="utf-8")
        + "\n\ndef _i1(x):\n"
        + "    raise ValueError('Migawka NetworkSnapshot została zmieniona przez operację.')\n"
        + "def _i2(x):\n"
        + "    raise ValueError(f'Nieobsługiwany element sieci {type(x).__name__} w trasie.')\n"
        + "def _i3(run_id):\n"
        + "    raise ValueError(f'Bieg nie znaleziony w rejestrze: {run_id}')\n"
        + "def _i4(x, run):\n"
        + "    run.error_message = f'Błąd wewnętrzny programu ({type(x).__name__}) — przerwano.'\n"
        + "def _i5(xs):\n"
        + "    obce = tuple(type(x).__name__ for x in xs)\n"
        + "    raise ValueError(f'Zdarzenia spoza trybu stanowiska: {obce} są odrzucone.')\n"
        + "def _i6(element_id):\n"
        + "    return Ostrzezenie(kod='k', message_pl=f'Nie znaleziono: {element_id} w modelu')\n"
        + "def _ok1(run_id):\n"
        + "    raise ValueError(f'Nie znaleziono biegu obliczeń {run_id} w rejestrze.')\n"
        + "def _ok2(x):\n"
        + "    raise TypeError(f'Wartość typu {type(x).__name__} nie ma postaci kanonicznej.')\n",
        encoding="utf-8",
    )
    sciezka = "network_model/solvers/protection_lv_curves.py"
    granica = len(wzor.read_text(encoding="utf-8").splitlines())
    powody = {n.powod for n in naruszenia_klasy(sciezka, kopia) if n.linia > granica}
    assert powody == {
        "klasa NetworkSnapshot",
        "nazwa typu type(x).__name__",
        "identyfikator bez rodzaju run_id",
        "nazwa typu obce",
        # _i5 łapie też reguła zapisu kolekcji: krotka w zdaniu bez sklejenia słowami.
        "zapis kolekcji obce: lista w zapisie Pythona (nawiasy i apostrofy) zamiast sklejenia"
        " słowami",
        "identyfikator bez rodzaju element_id",
    }, powody
    linie = sorted(n.linia - granica for n in naruszenia_klasy(sciezka, kopia) if n.linia > granica)
    # _i2 (kanał) i _i4 (tekst w zmiennej) — oba przypadki nazwy typu są złapane osobno;
    # _i5 daje dwa naruszenia w jednej linii (nazwa typu i zapis kolekcji).
    assert len(linie) == 7, linie


def test_nazwa_typu_w_module_tlumaczonym_tylko_w_apostrofach(tmp_path: Path) -> None:
    """W module tłumaczonym ``type(x).__name__`` w apostrofach (zamiana na rodzaj obiektu
    słowami) i złączenie nazw w apostrofach przechodzą; bez apostrofów — nie."""
    wzor = SRC / "network_model" / "solvers" / "dynamika" / "kontrakty.py"
    kopia = tmp_path / "kontrakty_nazwy.py"
    kopia.write_text(
        wzor.read_text(encoding="utf-8")
        + "\n\ndef _ok(x):\n"
        + "    raise OdmowaDynamiki('k', f'akcja `{type(x).__name__}` nie jest chwilowa')\n"
        + "def _ok2(xs):\n"
        + "    obce = tuple(type(x).__name__ for x in xs)\n"
        + "    lista = ', '.join(f'`{n}`' for n in sorted(obce))\n"
        + "    raise OdmowaDynamiki('k', f'zdarzenia ({lista}) należą do innego trybu')\n"
        + "def _zle(x):\n"
        + "    raise OdmowaDynamiki('k', f'akcja {type(x).__name__} nie jest chwilowa')\n",
        encoding="utf-8",
    )
    sciezka = "network_model/solvers/dynamika/kontrakty.py"
    granica = len(wzor.read_text(encoding="utf-8").splitlines())
    powody = [n.powod for n in naruszenia_klasy(sciezka, kopia) if n.linia > granica]
    assert powody == ["nazwa typu type(x).__name__"], powody


def test_regula_tresci_bez_zdania_wykrywa_sam_kod(tmp_path: Path) -> None:
    """Rozstrzygnięcie architekta: kod reguły zostaje wyłącznie jako dopisek po zdaniu.
    Iniekcja: treść będąca samym kodem (napis, zmienna kodu, f-string z samym kodem,
    argument nazwany rekordu) czerwienieje; zdanie z kodem w dopisku — nie."""
    wzor = SRC / "network_model" / "catalog" / "niezmienniki_katalogu.py"
    kopia = tmp_path / "iniekcja_tresci.py"
    kopia.write_text(
        wzor.read_text(encoding="utf-8")
        + "\n\ndef _i1():\n"
        + "    odmowa_twarda('KAT-T-006', 'KAT-T-006')\n"
        + "def _i2(kod):\n"
        + "    raise ValueError(kod)\n"
        + "def _i3(kod, element_id):\n"
        + "    raise HTTPException(status_code=422, detail=f'{kod}: {element_id}')\n"
        + "def _i4(kod):\n"
        + "    return Ostrzezenie(kod='k', message_pl=kod)\n"
        + "def _ok(kod):\n"
        + "    odmowa_twarda('KAT-T-006', f'Przekrój żyły musi być dodatni (reguła {kod}).')\n",
        encoding="utf-8",
    )
    sciezka = "network_model/catalog/niezmienniki_katalogu.py"
    granica = len(wzor.read_text(encoding="utf-8").splitlines())
    powody = sorted(
        n.powod for n in naruszenia_tresci_bez_zdania(sciezka, kopia) if n.linia > granica
    )
    assert powody == [
        "treść bez zdania 'KAT-T-006'",
        "treść bez zdania f'{kod}: {element_id}'",
        "treść bez zdania kod",
        "treść bez zdania kod",
    ], powody


def test_kod_reguly_katalogu_jest_dopiskiem_po_zdaniu() -> None:
    """Odmowa twardej reguły katalogu: zdanie po polsku, a kod reguły WYŁĄCZNIE jako dopisek
    ``(kod reguły: …)`` na końcu — zdanie bez dopisku jest pełne (obywa się bez kodu)."""
    from network_model.catalog.niezmienniki_katalogu import (
        REGULY_KATALOGU,
        OdmowaKatalogu,
        odmowa_twarda,
    )

    kod = next(k for k, r in sorted(REGULY_KATALOGU.items()) if r.twarda)
    zdanie = "Przekrój żyły musi być dodatni."
    with pytest.raises(OdmowaKatalogu) as blad:
        odmowa_twarda(kod, zdanie)
    tekst = str(blad.value)
    assert tekst == f"{zdanie} (kod reguły: {kod})"
    assert kod not in tekst.removesuffix(f" (kod reguły: {kod})")


def test_warstwy_nc_rfg_tylko_z_pakietu() -> None:
    """Warunek wpisów ``TOKENY_FORMATU_DANYCH`` warstw NC RfG: publiczne wejścia modułu nie
    przyjmują katalogu warstw ani operatorów (pliki są danymi produktu z pakietu), a żaden
    moduł ``src`` spoza modułu nie podaje ich katalogu."""
    sciezka = "catalog/profiles/nc_rfg/loader.py"
    drzewo = _drzewo(SRC / sciezka)
    publiczne = [
        w for w in drzewo.body if isinstance(w, ast.FunctionDef) and not w.name.startswith("_")
    ]
    assert publiczne
    for funkcja in publiczne:
        parametry = [a.arg for a in (*funkcja.args.args, *funkcja.args.kwonlyargs)]
        assert not [p for p in parametry if p.startswith("katalog")], funkcja.name
    for plik in sorted(SRC.rglob("*.py")):
        if plik.relative_to(SRC).as_posix() == sciezka:
            continue
        for wezel in ast.walk(_drzewo(plik)):
            if isinstance(wezel, ast.keyword) and wezel.arg in {
                "katalog_warstw",
                "katalog_operatorow",
            }:
                raise AssertionError(f"{plik}: podaje katalog warstw NC RfG")


# ---------------------------------------------------------------------------
# Żywotność i kompletność list strażnika (kanały, listy, wyłączenia sklejeń i wyliczeń)
# ---------------------------------------------------------------------------

_NAZWA_KANALU_PL = re.compile(r"^[a-z][a-z0-9_]*_pl$")


def _nazwy_w_miejscach_kanalu(drzewo: ast.Module) -> set[str]:
    """Nazwy stojące tam, gdzie strażnik czyta kanał treści: argument nazwany, klucz napisowy
    słownika, klucz napisowy przypisania/odczytu i pole klasy (rekord, model danych)."""
    nazwy: set[str] = set()
    for wezel in ast.walk(drzewo):
        if isinstance(wezel, ast.keyword) and wezel.arg:
            nazwy.add(wezel.arg)
        elif isinstance(wezel, ast.Dict):
            nazwy.update(
                k.value
                for k in wezel.keys
                if isinstance(k, ast.Constant) and isinstance(k.value, str)
            )
        elif (
            isinstance(wezel, ast.Subscript)
            and isinstance(wezel.slice, ast.Constant)
            and isinstance(wezel.slice.value, str)
        ):
            nazwy.add(wezel.slice.value)
        elif isinstance(wezel, ast.ClassDef):
            nazwy.update(
                pole.target.id
                for pole in wezel.body
                if isinstance(pole, ast.AnnAssign) and isinstance(pole.target, ast.Name)
            )
    return nazwy


def test_kanaly_tresci_kompletne_i_zywe() -> None:
    """JEDNA lista kanałów: każdy kanał ma rodzaj ZDANIE albo ETYKIETA i występuje w ``src``
    w miejscu kanału; każda nazwa ``*_pl`` w miejscu kanału w module klasy jest kanałem
    (nowe pole tekstu po polsku bez rodzaju czerwieni test)."""
    assert set(KANALY_TRESCI.values()) <= {ZDANIE, ETYKIETA}
    assert KANALY_ZDANIOWE <= KANALY_SLOW
    wszystkie: set[str] = set()
    bez_rodzaju: dict[str, str] = {}
    for sciezka in sorted(p.relative_to(SRC).as_posix() for p in SRC.rglob("*.py")):
        nazwy = _nazwy_w_miejscach_kanalu(_drzewo(SRC / sciezka))
        wszystkie |= nazwy
        if _poza_klasa(sciezka):
            continue
        for nazwa in nazwy:
            if _NAZWA_KANALU_PL.match(nazwa) and nazwa not in KANALY_TRESCI:
                bez_rodzaju.setdefault(nazwa, sciezka)
    assert not bez_rodzaju, f"pola tekstu po polsku bez rodzaju kanału: {bez_rodzaju}"
    martwe = sorted(set(KANALY_TRESCI) - wszystkie)
    assert not martwe, f"kanały bez wystąpienia w src — wpisy zbędne: {martwe}"


def _listy_zdan_w_funkcjach() -> dict[str, list[str]]:
    """Listy, do których funkcja dokłada zdanie po polsku i które ta sama funkcja wkłada do
    wywołania kanału (odmowa, rekord, ``ValueError``) — nazwa → miejsca wywołań kanału."""
    kanaly = kanaly_wywolan()
    wynik: dict[str, list[str]] = {}
    for sciezka in _moduly_klasy():
        for funkcja in ast.walk(_drzewo(SRC / sciezka)):
            if not isinstance(funkcja, ast.FunctionDef | ast.AsyncFunctionDef):
                continue
            ze_zdaniem = {
                w.func.value.id
                for w in ast.walk(funkcja)
                if isinstance(w, ast.Call)
                and isinstance(w.func, ast.Attribute)
                and w.func.attr in {"append", "insert"}
                and isinstance(w.func.value, ast.Name)
                and w.args
                and isinstance(w.args[-1], ast.Constant | ast.JoinedStr)
                and _LUDZKI.search(
                    "".join(
                        str(c.value)
                        for c in ast.walk(w.args[-1])
                        if isinstance(c, ast.Constant) and isinstance(c.value, str)
                    )
                )
            }
            if not ze_zdaniem:
                continue
            for w in ast.walk(funkcja):
                if isinstance(w, ast.Call) and _nazwa_wywolanej(w) in kanaly:
                    uzyte = {
                        n.id
                        for a in (*w.args, *(k.value for k in w.keywords))
                        for n in ast.walk(a)
                        if isinstance(n, ast.Name)
                    }
                    for nazwa in sorted(ze_zdaniem & uzyte):
                        wynik.setdefault(nazwa, []).append(f"{sciezka}:{w.lineno}")
    return wynik


def test_listy_komunikatow_zywe() -> None:
    """Każda lista komunikatów dostaje w ``src`` zdanie po polsku (wpis żywy), a każda lista
    zdań wkładana w tej samej funkcji do wywołania kanału jest listą komunikatów
    (``frt_hvrt/contracts.py`` ``errors`` → ``OdmowaDanychError``; ``enm/validator.py``
    ``braki`` → ``ValidationIssue``)."""
    zywe: set[str] = set()
    for plik in sorted(SRC.rglob("*.py")):
        for w in ast.walk(_drzewo(plik)):
            if (
                isinstance(w, ast.Call)
                and isinstance(w.func, ast.Attribute)
                and w.func.attr in {"append", "insert"}
                and isinstance(w.func.value, ast.Name)
                and w.func.value.id in LISTY_KOMUNIKATOW
                and w.args
                and any(
                    isinstance(c, ast.Constant)
                    and isinstance(c.value, str)
                    and _LUDZKI.search(c.value)
                    for c in ast.walk(w.args[-1])
                )
            ):
                zywe.add(w.func.value.id)
    assert not set(LISTY_KOMUNIKATOW) - zywe, set(LISTY_KOMUNIKATOW) - zywe
    assert all(uzasadnienie.strip() for uzasadnienie in LISTY_KOMUNIKATOW.values())
    poza = {n: m for n, m in _listy_zdan_w_funkcjach().items() if n not in LISTY_KOMUNIKATOW}
    assert not poza, f"listy zdań wkładane do kanału bez wpisu LISTY_KOMUNIKATOW: {poza}"


@pytest.mark.parametrize(
    ("tablica", "wpis"),
    [
        *(("KOLEKCJE_TEKSTOW_SRC", w) for w in sorted(KOLEKCJE_TEKSTOW_SRC)),
        *(("KOLEKCJE_FORMATU_DANYCH", w) for w in sorted(KOLEKCJE_FORMATU_DANYCH)),
        *(("WYLICZENIA_BEZ_ETYKIETY", w) for w in sorted(WYLICZENIA_BEZ_ETYKIETY)),
    ],
)
def test_wylaczenia_sklejen_sa_zywe(
    tablica: str, wpis: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Każde wyłączenie (kolekcja tekstów, kolekcja tokenów formatu danych, wyliczenie
    o wartościach będących słowem albo oznaczeniem normy) ma uzasadnienie i wskazuje
    miejsce, które BEZ wpisu strażnik zgłasza — martwy wpis byłby furtką."""
    slownik: dict[str, str] = globals()[tablica]
    assert slownik[wpis].strip()
    sciezka = wpis.split(":", 1)[0]
    assert (SRC / sciezka).is_file(), wpis
    przed = len(naruszenia_klasy(sciezka))
    monkeypatch.delitem(slownik, wpis)
    po = len(naruszenia_klasy(sciezka))
    assert po > przed, f"{tablica}[{wpis!r}]: bez wpisu brak naruszenia — wpis zbędny"


def test_wyliczenia_bez_etykiety_maja_wartosci_slowne_albo_normowe() -> None:
    """Warunek wpisów ``WYLICZENIA_BEZ_ETYKIETY`` i kolekcji oznaczeń normowych: wartości
    ``NetworkType`` są oznaczeniami układu sieci wg PN-HD 60364-1 §312.2, ``RODZAJE_OBWODU``
    — polskimi słowami, ``TypModulu`` — typami A–D (rozporządzenie 2016/631 art. 5), klucze
    ``FUNKCJE_INNEJ_STREFY`` — numerami IEEE C37.2 / ANSI, ``Izolacja`` — PVC / XLPE,
    oznaczenia bloków fabrycznych — literami jednostek bloku, ``RODZAJE_PRADU_ROZNICOWEGO_RCD``
    — typami RCD wg IEC 60755 / IEC 62423, ``ProtectionArrangement`` — PE / PEN / NONE.
    Nowa wartość spoza tych zbiorów czerwieni test (wpis wyłączenia przestaje być prawdą)."""
    from typing import get_args

    from application.analyses.swz.werdykt import RODZAJE_OBWODU
    from catalog.profiles.nc_rfg.loader import TypModulu
    from domain.der_protection_functions import FUNKCJE_INNEJ_STREFY
    from network_model.catalog.switchgear.factory_configuration import FACTORY_CONFIGURATIONS
    from network_model.catalog.types import RODZAJE_PRADU_ROZNICOWEGO_RCD
    from network_model.solvers.cable_ampacity_derating import Izolacja
    from network_model.solvers.fault_loop_iec60364 import NetworkType, ProtectionArrangement

    assert {t.value for t in NetworkType} <= {"TN-S", "TN-C-S", "TN-C", "TT", "IT"}
    assert all(re.fullmatch(r"[a-ząćęłńóśźż]+", rodzaj) for rodzaj in RODZAJE_OBWODU)
    assert set(get_args(TypModulu)) == {"A", "B", "C", "D"}
    assert all(re.fullmatch(r"\d{2}[A-Z]{1,2}", kod) for kod in FUNKCJE_INNEJ_STREFY)
    assert set(get_args(Izolacja)) == {"PVC", "XLPE"}
    assert set(RODZAJE_PRADU_ROZNICOWEGO_RCD) == {"AC", "A", "F", "B"}
    assert {p.value for p in ProtectionArrangement} == {"PE", "PEN", "NONE"}
    for blok in FACTORY_CONFIGURATIONS:
        assert blok.code == "".join(u.unit_code for u in blok.units), blok.configuration_ref
        assert blok.name_pl.strip(), blok.configuration_ref


def test_symbole_inzynierskie_maja_podstawe_i_sa_zywe() -> None:
    """Każdy symbol inżynierski ma podstawę (norma albo dokument źródłowy i oznaczenie
    wielkości) i występuje w tekście ``src`` — martwy symbol byłby furtką dla kodu o tym
    samym zapisie."""
    normy = re.compile(r"IEC|PN-|EN \d|IEEE|rozporządzenie|PTPiREE|N SEP|CIGRE")
    teksty = [
        w.value
        for plik in sorted(SRC.rglob("*.py"))
        for w in ast.walk(_drzewo(plik))
        if isinstance(w, ast.Constant) and isinstance(w.value, str)
    ]
    for symbol, podstawa in SYMBOLE_INZYNIERSKIE.items():
        assert normy.search(podstawa) and symbol in podstawa, symbol
        wzor = re.compile(rf"(?<!\w){re.escape(symbol)}(?!\w)")
        assert any(wzor.search(t) for t in teksty), f"{symbol}: brak w src — wpis zbędny"


def test_kanaly_formatujace_sa_zywe() -> None:
    """Każdy kanał formatujący jest funkcją ``src`` z parametrem treści ``tekst``, której
    wynik niesie tę treść w całości (deklaracja „wynik to tekst dla projektanta”), jest
    wołany w ``src`` ze zdaniem po polsku, a znacznik reguły, który dokleja, zdejmuje tłumacz
    błędu walidacji (zdanie zostaje, znacznik — nie)."""
    from dziedziny.kanon import REGULY_KONTRAKTU, naruszenie
    from enm.slownik_komunikatow import opis_pozycji_walidacji

    definicje: dict[str, ast.FunctionDef] = {}
    wolania: dict[str, int] = dict.fromkeys(KANALY_FORMATUJACE, 0)
    for plik in sorted(SRC.rglob("*.py")):
        for w in ast.walk(_drzewo(plik)):
            if isinstance(w, ast.FunctionDef) and w.name in KANALY_FORMATUJACE:
                definicje[w.name] = w
            if (
                isinstance(w, ast.Call)
                and _nazwa_wywolanej(w) in KANALY_FORMATUJACE
                and len(w.args) > 1
                and any(
                    isinstance(c, ast.Constant)
                    and isinstance(c.value, str)
                    and _LUDZKI.search(c.value)
                    for c in ast.walk(w.args[1])
                )
            ):
                wolania[_nazwa_wywolanej(w)] += 1
    assert set(definicje) == set(KANALY_FORMATUJACE), definicje
    for nazwa, funkcja in definicje.items():
        assert [a.arg for a in funkcja.args.args][1:2] == ["tekst"], nazwa
        assert wolania[nazwa] > 0, f"{nazwa}: brak wywołań ze zdaniem w src — wpis zbędny"
    regula = sorted(REGULY_KONTRAKTU)[0]
    zdanie = "Tabela limitów nie może być pusta"
    sformatowane = naruszenie(regula, f"{zdanie}.")
    assert sformatowane.endswith(f"{zdanie}.") and regula in sformatowane
    opis = opis_pozycji_walidacji(
        {"type": "value_error", "loc": ("tabela",), "ctx": {"error": sformatowane}}, None
    )
    assert zdanie in opis and regula not in opis, opis


def test_dopiski_kodu_sa_zywe() -> None:
    """Każda etykieta dopisku kodu ma podstawę i występuje w ``src`` jako dopisek
    ``(<etykieta>: {kod})`` na końcu tekstu po zdaniu — martwa etykieta byłaby furtką dla
    kodu w nawiasie; dopisek nie stoi nigdy w środku zdania."""
    dopiski: dict[str, int] = dict.fromkeys(DOPISKI_KODU, 0)
    for plik in sorted(SRC.rglob("*.py")):
        for w in ast.walk(_drzewo(plik)):
            if not isinstance(w, ast.Constant) or not isinstance(w.value, str):
                continue
            for etykieta in DOPISKI_KODU:
                if f"({etykieta}: " in w.value:
                    dopiski[etykieta] += 1
                    przed = w.value.split(f"({etykieta}: ", 1)[0]
                    assert przed.strip() == "" or _LUDZKI.search(przed) or przed.endswith(" "), (
                        plik,
                        w.value,
                    )
    for etykieta, podstawa in DOPISKI_KODU.items():
        assert etykieta.startswith("kod ") and len(podstawa.strip()) > 40, etykieta
        assert dopiski[etykieta] > 0, f"{etykieta}: brak dopisku w src — wpis zbędny"


#: Iniekcje reguł strażnika (po jednej na regułę): funkcja ``_i_*`` niesie defekt i MUSI
#: dać dokładnie podane naruszenia; ``_ok_*`` jest jej poprawną postacią i nie daje żadnego.
_INIEKCJE_SRC = (
    "\n"
    "\n"
    'RODZAJE_INIEKCJI = ("a", "b")\n'
    'WYNIK_INIEKCJI = {"a": "pierwszy"}\n'
    "\n"
    "\n"
    "def _i_kanal_slownika():\n"
    '    return {"reason_pl": "Pole u_n_kv musi być dodatnie."}\n'
    "\n"
    "\n"
    "def _i_kanal_listy(errors):\n"
    '    errors.append("Pole u_n_kv musi być dodatnie.")\n'
    "\n"
    "\n"
    "def _ok_lista_spoza_kanalow(wiersze):\n"
    '    wiersze.append("Pole u_n_kv musi być dodatnie.")\n'
    "\n"
    "\n"
    "def _i_bez_zdania_kanal_zdaniowy(kod):\n"
    '    return {"reason_pl": kod}\n'
    "\n"
    "\n"
    "def _ok_bez_zdania_kanal_etykiety(kod):\n"
    '    return {"alias_pl": kod}\n'
    "\n"
    "\n"
    "def _i_sklejenie_kodow():\n"
    "    raise ValueError(f\"Brakuje pól: {', '.join(['u_n_kv', 'i_th_ka'])}.\")\n"
    "\n"
    "\n"
    "def _i_sklejenie_nierozstrzygniete(x):\n"
    "    raise ValueError(f\"Brakuje danych: {', '.join(x.braki)}.\")\n"
    "\n"
    "\n"
    "def _ok_sklejenie_slow():\n"
    "    raise ValueError(f\"Brakuje danych: {', '.join(['napięcie znamionowe', 'prąd cieplny'])}.\")\n"
    "\n"
    "\n"
    "def _i_cel_petli_z_kodem():\n"
    '    for pole in ("u_n_kv", "i_th_ka"):\n'
    "        raise ValueError(f\"Brakuje pól: {', '.join([pole])}.\")\n"
    "\n"
    "\n"
    "def _i_parametr_z_wywolan(pola):\n"
    "    raise ValueError(f\"Brakuje pól: {', '.join(pola)}.\")\n"
    "\n"
    "\n"
    "def _wolajacy_parametr():\n"
    '    _i_parametr_z_wywolan(["u_n_kv"])\n'
    "\n"
    "\n"
    "def _i_wartosc_wyliczenia(x):\n"
    '    raise ValueError(f"Rodzaj {x.kind.value} nie jest obsługiwany przez ten moduł.")\n'
    "\n"
    "\n"
    "def _i_zmienna_wyliczenia(status):\n"
    '    raise ValueError(f"Stan {status} nie jest dozwolony w tym miejscu.")\n'
    "\n"
    "\n"
    "def _ok_echo_not_in(rodzaj):\n"
    "    if rodzaj not in RODZAJE_INIEKCJI:\n"
    '        raise ValueError(f"Rodzaj {rodzaj!r} spoza słownika — dozwolone są inne wartości.")\n'
    "\n"
    "\n"
    "def _ok_echo_else(rodzaj):\n"
    "    if rodzaj in RODZAJE_INIEKCJI:\n"
    "        return 1\n"
    "    elif rodzaj in WYNIK_INIEKCJI:\n"
    "        return 2\n"
    "    else:\n"
    '        raise ValueError(f"Rodzaj {rodzaj!r} spoza słownika — dozwolone są inne wartości.")\n'
    "\n"
    "\n"
    "def _ok_echo_else_zagniezdzone(rodzaj, flaga):\n"
    "    if rodzaj in RODZAJE_INIEKCJI:\n"
    "        return 1\n"
    "    elif flaga:\n"
    "        return 2\n"
    "    else:\n"
    '        raise ValueError(f"Rodzaj {rodzaj!r} spoza słownika — dozwolone są inne wartości.")\n'
    "\n"
    "\n"
    "def _ok_echo_except(rodzaj):\n"
    "    try:\n"
    "        int(rodzaj)\n"
    "    except ValueError:\n"
    '        raise ValueError(f"Rodzaj {rodzaj!r} nie jest liczbą — popraw wartość w danych.")\n'
    "\n"
    "\n"
    "def _ok_etykieta_wyliczenia(x):\n"
    '    raise ValueError(f"Rodzaj {NAZWY_RODZAJOW_PL[x.kind]} nie jest obsługiwany przez ten moduł.")\n'
    "\n"
    "\n"
    "def _i_jezyk():\n"
    '    raise ValueError("Bus voltage is required for the computation of the fault current.")\n'
    "\n"
    "\n"
    "def _ok_jezyk_polski():\n"
    '    raise ValueError("Napięcie węzła jest wymagane do obliczenia prądu zwarciowego.")\n'
    "\n"
    "def _i_przeplyw_zmiennej():\n"
    '    tresc = "Pole u_n_kv musi być dodatnie."\n'
    "    raise ValueError(tresc)\n"
    "\n"
    "\n"
    "def _ok_zmienna_poza_kanalem():\n"
    '    tresc = "Pole u_n_kv musi być dodatnie."\n'
    "    return len(tresc)\n"
    "\n"
    "\n"
    "def _odmowa_iniekcji(tekst):\n"
    "    raise ValueError(tekst)\n"
    "\n"
    "\n"
    "def _i_przeplyw_parametru_nazwanego():\n"
    '    _odmowa_iniekcji(tekst="Pole u_n_kv musi być dodatnie.")\n'
    "\n"
    "\n"
    "def _i_przeplyw_parametru_pozycyjnego():\n"
    '    _odmowa_iniekcji("Pole u_n_kv musi być dodatnie.")\n'
    "\n"
    "\n"
    "def _i_przeplyw_wyniku_funkcji():\n"
    '    return "Pole u_n_kv musi być dodatnie."\n'
    "\n"
    "\n"
    "def _wolajacy_wynik():\n"
    "    raise ValueError(_i_przeplyw_wyniku_funkcji())\n"
    "\n"
    "\n"
    "def _ok_sklejenie_pol_tekstowych(dane):\n"
    '    raise ValueError("Dane przyjęte: " + "; ".join(str(d.get("nazwa_pl")) for d in dane) + ".")\n'
    "\n"
    "\n"
    "def _i_sklejenie_pol_kluczy(dane):\n"
    '    raise ValueError("Dane przyjęte: " + "; ".join(str(d.get("klucz")) for d in dane) + ".")\n'
    "\n"
    "\n"
    "\n"
    'TrybIniekcji = Literal["tryb_a", "tryb_b"]\n'
    'RodzajSlownyIniekcji = Literal["odbiorczy", "rozdzielczy"]\n'
    "\n"
    "\n"
    "class _KolorIniekcji(StrEnum):\n"
    '    CZERWONY = "RED_X"\n'
    '    ZIELONY = "GREEN_X"\n'
    "\n"
    "\n"
    "class _PozycjaIniekcji:\n"
    "    numer: int\n"
    "\n"
    "\n"
    "class _i_kanal_konstruktora_bazy(ValueError):\n"
    "    def __init__(self) -> None:\n"
    '        super().__init__("Pole u_n_kv musi być dodatnie.")\n'
    "\n"
    "\n"
    "def _i_typ_literalu(wartosc: TrybIniekcji):\n"
    '    raise ValueError(f"Wartość {wartosc} nie pasuje do tego modułu wcale.")\n'
    "\n"
    "\n"
    "def _ok_typ_literalu_slowny(wartosc: RodzajSlownyIniekcji):\n"
    '    raise ValueError(f"Obwód {wartosc} nie pasuje do tego modułu wcale.")\n'
    "\n"
    "\n"
    "def _i_typ_wyliczenia(barwa: _KolorIniekcji):\n"
    '    raise ValueError(f"Barwa {barwa} nie pasuje do tego modułu wcale.")\n'
    "\n"
    "\n"
    "def _i_kanal_formatujacy():\n"
    '    return naruszenie("regula.x", "Pole u_n_kv musi być dodatnie.")\n'
    "\n"
    "\n"
    "def _ok_dopisek_kodu(kod):\n"
    '    raise ValueError(f"Model nie spełnia reguły katalogu (kod reguły: {kod}).")\n'
    "\n"
    "\n"
    "def _i_kod_poza_dopiskiem(kod):\n"
    '    raise ValueError(f"Model nie spełnia reguły {kod} katalogu, popraw dane.")\n'
    "\n"
    "\n"
    "def _i_kod_z_kropka():\n"
    '    raise ValueError("Odmowa nn.brak_rcd dla obwodu odbiorczego w tej stacji.")\n'
    "\n"
    "\n"
    "def _i_zapis_kolekcji(x):\n"
    '    raise ValueError(f"Powtórzone pozycje listy: {sorted(x)}.")\n'
    "\n"
    "\n"
    "def _i_zapis_zmiennej_kolekcji(x):\n"
    "    lista = [e.nazwa for e in x]\n"
    '    raise ValueError(f"Powtórzone pozycje listy: {lista}.")\n'
    "\n"
    "\n"
    "def _kolekcja_iniekcji() -> list[str]:\n"
    "    return []\n"
    "\n"
    "\n"
    "def _i_zapis_wyniku_funkcji():\n"
    '    raise ValueError(f"Powtórzone pozycje listy: {_kolekcja_iniekcji()}.")\n'
    "\n"
    "\n"
    "class _KlasaIniekcji:\n"
    "    def pozycje_iniekcji(self) -> Sequence[str]:\n"
    "        return ()\n"
    "\n"
    "    def opcjonalne_iniekcji(self) -> dict[str, float] | None:\n"
    "        return None\n"
    "\n"
    "\n"
    "def _i_zapis_wyniku_metody(obiekt):\n"
    '    raise ValueError(f"Powtórzone pozycje listy: {obiekt.pozycje_iniekcji()}.")\n'
    "\n"
    "\n"
    "def _i_zapis_wyniku_metody_opcjonalnej(obiekt):\n"
    '    raise ValueError(f"Powtórzone pozycje listy: {obiekt.opcjonalne_iniekcji()}.")\n'
    "\n"
    "\n"
    "def _i_zapis_kluczy_slownika(slownik):\n"
    '    raise ValueError(f"Powtórzone pozycje listy: {slownik.keys()}.")\n'
    "\n"
    "\n"
    "def _i_zapis_podzialu_tekstu(tekst):\n"
    '    raise ValueError(f"Powtórzone pozycje listy: {tekst.split()}.")\n'
    "\n"
    "\n"
    "def _i_zapis_zmiennej_z_metody(obiekt):\n"
    "    lista = obiekt.pozycje_iniekcji()\n"
    '    raise ValueError(f"Powtórzone pozycje listy: {lista}.")\n'
    "\n"
    "\n"
    "def _ok_liczba_wyniku_metody(obiekt):\n"
    '    raise ValueError(f"Powtórzone pozycje listy: {len(obiekt.pozycje_iniekcji())} wpisów.")\n'
    "\n"
    "\n"
    "def _ok_metoda_tekstu(tekst):\n"
    '    raise ValueError(f"Powtórzona pozycja listy: {tekst.strip()}.")\n'
    "\n"
    "\n"
    "def _ok_liczba_pozycji(x):\n"
    '    raise ValueError(f"Powtórzone pozycje listy: {len(x)} wpisów do usunięcia.")\n'
    "\n"
    "\n"
    "def _ok_liczby_sklejone(x):\n"
    "    raise ValueError(f\"Powtórzone częstotliwości: {', '.join(f'{f:g}' for f in x)} Hz.\")\n"
    "\n"
    "\n"
    "def _ok_atrybut_liczbowy(pozycje):\n"
    "    raise ValueError(f\"Powtórzone numery pozycji: {', '.join(str(p.numer) for p in pozycje)}.\")\n"
    "\n"
    "\n"
    "def _ok_przeksztalcenie_tekstu():\n"
    "    raise ValueError(\n"
    "        f\"Brakuje danych: {', '.join(t.replace('-', ' ') for t in ['napięcie znamionowe'])}.\"\n"
    "    )\n"
    "\n"
    "\n"
    "def _i_przeksztalcenie_kodu():\n"
    "    raise ValueError(f\"Brakuje danych: {', '.join(t.strip() for t in ['u_n_kv'])}.\")\n"
)
_INIEKCJE_DYNAMIKI = (
    "\n"
    "\n"
    "def _ok_adres_stanu(urzadzenie, stan):\n"
    '    raise ValueError(f"Stan {urzadzenie.ident}.{stan} wyszedł poza zakres ważności modelu.")\n'
    "\n"
    "\n"
    "def _i_stan_bez_adresu(urzadzenie, stan):\n"
    '    raise ValueError(f"Stan {stan} urządzenia wyszedł poza zakres ważności modelu.")\n'
)
_OCZEKIWANE_INIEKCJE: dict[str, list[str]] = {
    "_i_kanal_slownika": ["kod u_n_kv"],
    "_i_kanal_listy": ["kod u_n_kv"],
    "_i_bez_zdania_kanal_zdaniowy": ["treść bez zdania kod"],
    "_i_sklejenie_kodow": ["sklejenie ['u_n_kv', 'i_th_ka']: kod u_n_kv"],
    "_i_sklejenie_nierozstrzygniete": ["sklejenie x.braki: kolekcja nierozstrzygnięta x.braki"],
    "_i_cel_petli_z_kodem": ["sklejenie [pole]: kod u_n_kv"],
    "_i_parametr_z_wywolan": ["sklejenie pola: kod u_n_kv"],
    "_i_wartosc_wyliczenia": ["wartość wyliczenia x.kind.value"],
    "_i_zmienna_wyliczenia": ["wartość wyliczenia status"],
    "_i_jezyk": ["komunikat po angielsku"],
    "_i_stan_bez_adresu": ["wartość wyliczenia stan"],
    "_i_przeplyw_zmiennej": ["kod u_n_kv"],
    "_i_przeplyw_parametru_nazwanego": ["kod u_n_kv"],
    "_i_przeplyw_parametru_pozycyjnego": ["kod u_n_kv"],
    "_i_przeplyw_wyniku_funkcji": ["kod u_n_kv"],
    "_i_sklejenie_pol_kluczy": [
        "sklejenie (str(d.get('klucz')) for d in dane): element nierozstrzygnięty d.get('klucz')"
    ],
    "_i_kanal_konstruktora_bazy": ["kod u_n_kv"],
    "_i_typ_literalu": ["wartość wyliczenia wartosc"],
    "_i_typ_wyliczenia": ["wartość wyliczenia barwa"],
    "_i_kanal_formatujacy": ["kod u_n_kv"],
    "_i_kod_poza_dopiskiem": ["wartość wyliczenia kod"],
    "_i_kod_z_kropka": ["kod nn.brak_rcd"],
    "_i_zapis_kolekcji": [
        "zapis kolekcji sorted(x): lista w zapisie Pythona (nawiasy i apostrofy) zamiast sklejenia słowami"
    ],
    "_i_zapis_zmiennej_kolekcji": [
        "zapis kolekcji lista: lista w zapisie Pythona (nawiasy i apostrofy) zamiast sklejenia słowami"
    ],
    "_i_zapis_wyniku_funkcji": [
        "zapis kolekcji _kolekcja_iniekcji(): lista w zapisie Pythona (nawiasy i apostrofy) zamiast sklejenia słowami"
    ],
    "_i_przeksztalcenie_kodu": ["sklejenie (t.strip() for t in ['u_n_kv']): kod u_n_kv"],
    "_i_zapis_wyniku_metody": [
        "zapis kolekcji obiekt.pozycje_iniekcji(): lista w zapisie Pythona (nawiasy i apostrofy) zamiast sklejenia słowami"
    ],
    "_i_zapis_wyniku_metody_opcjonalnej": [
        "zapis kolekcji obiekt.opcjonalne_iniekcji(): lista w zapisie Pythona (nawiasy i apostrofy) zamiast sklejenia słowami"
    ],
    "_i_zapis_kluczy_slownika": [
        "zapis kolekcji slownik.keys(): lista w zapisie Pythona (nawiasy i apostrofy) zamiast sklejenia słowami"
    ],
    "_i_zapis_podzialu_tekstu": [
        "zapis kolekcji tekst.split(): lista w zapisie Pythona (nawiasy i apostrofy) zamiast sklejenia słowami"
    ],
    "_i_zapis_zmiennej_z_metody": [
        "zapis kolekcji lista: lista w zapisie Pythona (nawiasy i apostrofy) zamiast sklejenia słowami"
    ],
}


def _naruszenia_iniekcji(sciezka: str, dopisek: str, tmp_path: Path) -> dict[str, list[str]]:
    wzor = SRC / sciezka
    tresc = wzor.read_text(encoding="utf-8")
    kopia = tmp_path / f"iniekcja_{Path(sciezka).stem}.py"
    kopia.write_text(tresc + dopisek, encoding="utf-8")
    granica = len(tresc.splitlines())
    funkcje = [
        (f.lineno, f.end_lineno or f.lineno, f.name)
        for f in ast.parse(kopia.read_text(encoding="utf-8")).body
        if isinstance(f, ast.FunctionDef | ast.ClassDef) and f.lineno > granica
    ]
    wynik: dict[str, list[str]] = {nazwa: [] for _a, _b, nazwa in funkcje}
    for naruszenie in naruszenia_klasy(sciezka, kopia):
        if naruszenie.linia > granica:
            nazwa = next(n for a, b, n in funkcje if a <= naruszenie.linia <= b)
            wynik[nazwa].append(naruszenie.powod)
    return {nazwa: sorted(powody) for nazwa, powody in wynik.items()}


def test_iniekcje_regul_strazenika_sa_czerwone(tmp_path: Path) -> None:
    """Każda reguła strażnika łapie swoją iniekcję i przepuszcza poprawną postać: klucz pola
    w kanale słownika i listy (lista spoza ``LISTY_KOMUNIKATOW`` — nie), „komunikat bez
    zdania” wyłącznie w kanale ZDANIE, sklejenie kodów / kolekcji nierozstrzygniętej / celu
    pętli / parametru rozstrzygniętego z wywołań, wartość wyliczenia (``.value`` i zmienna
    o nazwie wyliczenia; cytat odrzuconego wejścia ``not in`` / ``else`` łańcucha / ``except``
    i etykieta — nie), komunikat po angielsku oraz adres stanu urządzenia w module odmów
    tłumaczonych (``{x.ident}.{stan}`` — nie, sam ``{stan}`` — tak). Reguły commitu kodów
    w komunikatach: typ ``Literal``/``Enum`` o wartościach-kodach (słowne — nie), kanał
    formatujący ``naruszenie``, konstruktor bazy wyjątku ``super().__init__``, kod z kropką,
    kod poza dopiskiem (dopisek ``(kod reguły: …)`` — nie), zapis kolekcji (konstruktor,
    zmienna, wynik funkcji i METODY — modułu, całego ``src`` i wbudowanej ``keys``/``split``,
    także z adnotacją w unii; liczba elementów, liczby sklejone, liczba elementów wyniku metody
    i metoda tekstu — nie) oraz przekształcenie
    tekstu stałymi (element przekształcany sprawdzany jak bez przekształcenia)."""
    wyniki = {
        **_naruszenia_iniekcji("network_model/core/graph.py", _INIEKCJE_SRC, tmp_path),
        **_naruszenia_iniekcji(
            "network_model/solvers/dynamika/waznosc.py", _INIEKCJE_DYNAMIKI, tmp_path
        ),
    }
    for nazwa, powody in sorted(wyniki.items()):
        if nazwa.startswith("_i_"):
            assert powody == _OCZEKIWANE_INIEKCJE[nazwa], (nazwa, powody)
        elif nazwa.startswith("_ok_"):
            assert powody == [], (nazwa, powody)
    assert set(_OCZEKIWANE_INIEKCJE) == {n for n in wyniki if n.startswith("_i_")}
