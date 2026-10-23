"""GPZ (rola A, „Zasilanie sieci") — szablony stacji zasilających 110/SN.

V12T-016 (rejestr długu): rola A miała ZERO szablonów — projektant zaczynający
projekt od Głównego Punktu Zasilania (źródło sieci SN, korzeń modelu) nie miał
gotowego pakietu katalogowego, mimo że maszyneria domenowa istniała
(`enm/domain_operations.py::add_grid_source_sn`, „pierwszy krok budowy sieci SN").

Droga zabudowy JEST INNA niż pozostałych kategorii: GPZ jest KORZENIEM modelu
(nie wstawia się „w segment", bo żadnego segmentu jeszcze nie ma), więc
`apply.py` rozpoznaje kategorię korzenia i woła `add_grid_source_sn` zamiast
`insert_station_on_segment_sn`.

Dwa układy (karta GPZ-H5, `TemplateSchema.gpz_uklad`):

1. **ENEA H5 — wzorzec podstawowy** (`GPZ_UKLAD_H5`; ENEA Operator, Zeszyt 1 „Stacje
   110 kV” §11.1: dwie linie 110 kV, dwa pola transformatorowe, jedno pole łącznika szyn;
   stacja z jedną linią 110 kV nie jest dopuszczona). Strona 110 kV jest w modelu:
   dwie sekcje szyn 110 kV, każda z WŁASNYM torem zasilania L1/L2 (linia, stacja
   zasilająca, równoważnik sieci — DANE PROJEKTU, szablon ich nie niesie i bez nich
   odmawia), łącznik szyn 110 kV ze stanem normalnym z danych (ENEA nie określa stanu
   domyślnego), transformatory 110/SN z katalogu przypisane JAWNIE: TR1 sekcja 110 kV 1 →
   sekcja SN 1, TR2 sekcja 110 kV 2 → sekcja SN 2 (liczba transformatorów może być
   ograniczona do jednego — §11.1). Tryb rezerwy transformatorowej (§26.10.5: ukryta albo
   jawna) jest wyborem projektanta, nie domyślną szablonu. Na każdej sekcji SN pola
   funkcyjne (§13, zał. Z.2): zespołu uziemiającego, baterii kondensatorów i pomiaru
   napięcia — bez elementów (zespół uziemiający i bateria powstają wyłącznie z danych);
   łącznik szyn SN w dwóch celach (zał. Z.2). Każde pole ma skład z szablonu pola
   standardu ENEA (`network_model/catalog/gniazda_pol_enea.py`): gniazda aparatury
   w kolejności od szyny, z wymaganiami i podstawą; pola zapisane w kolejności rozdzielni
   (zał. Z.1 i Z.2). Dane projektu: liczba pól liniowych na sekcję SN (zał. Z.2 — „dostosowana
   do potrzeb”), wariant pola zespołu uziemiającego (§16) i obsadzenie gniazd pozycjami
   wymagań standardu (opcjonalne; bez niego gniazda czekają na dobór aparatu).
2. **Równoważnik sieci na szynach SN** (`GPZ_UKLAD_ROWNOWAZNIK_SN`): granica modelu = szyny
   SN (karta GPZ-MODEL). Każda sekcja SN ma WŁASNY równoważnik z katalogu (warunki
   przyłączenia OSD — Sk3 widziana z szyn sekcji, zawiera impedancję transformatora
   110/SN zasilającego tę sekcję), łącznik szyn SN normalnie OTWARTY. Uzasadnienie:
   rezerwa ukryta ENEA Zeszyt 1 §26.10.5 — każdy transformator zasila swoją sekcję,
   łącznik szyn SN otwarty; dawny układ „jeden równoważnik na sekcji 1, sekcja 2 przez
   zamknięte sprzęgło” opisywał stan, który w układzie normalnym GPZ nie występuje.

Uziemienie punktu neutralnego SN: dana projektu (`params_override['grounding']`, ENEA
Zeszyt 1 §16 — sposób pracy punktu neutralnego wg projektu dla sekcji). Szablon nie
zakłada sieci izolowanej: brak danej = odmowa zwarcia doziemnego z przyczyną.
"""

from __future__ import annotations

from application.station_templates._choices import (
    GPZ_SOURCE_OPTIONS_15,
    GPZ_SOURCE_OPTIONS_20,
    PROT_FEEDER_OPTIONS,
    SN_APPARATUS_OPTIONS,
    SN_APPARATUS_OPTIONS_24KV,
    TR_WN_SN_OPTIONS_15,
    TR_WN_SN_OPTIONS_20,
)
from application.station_templates.schema import (
    GPZ_UKLAD_H5,
    GPZ_UKLAD_ROWNOWAZNIK_SN,
    BayRoleSpec,
    CatalogChoice,
    DanaProjektuSzablonu,
    StationTemplate,
    TemplateCategory,
    TemplateParamFloat,
    TemplateParamInt,
    TemplateSchema,
    WarunekWymagalnosci,
)
from enm.domain_operations import (
    MAX_GPZ_LINE_FIELDS_PER_SECTION,
    OBSADZENIE_WYMAGANIAMI_STANDARDU,
    PODSTAWA_WARIANTU_ZU_PL,
)
from enm.rezerwa_gpz import (
    NAZWA_TRYBU_REZERWY_PL,
    PODPOWIEDZ_STANU_LACZNIKA_SZYN_WN_PL,
    PODPOWIEDZ_TRYBU_REZERWY_PL,
    PODSTAWA_STANU_LACZNIKA_SZYN_WN_PL,
    PODSTAWA_TRYBU_REZERWY_PL,
    TRYB_REZERWY_JAWNEJ,
    TRYBY_REZERWY,
)
from network_model.catalog.gniazda_pol_enea import SZABLONY_POL_STANDARDU, SZABLONY_POL_ZU_SN

#: Pola funkcyjne każdej sekcji SN GPZ H5 (ENEA Zeszyt 1 §13, zał. Z.2) — role operacji
#: `add_grid_source_sn` (`gpz_sections[].function_bays`).
POLA_FUNKCYJNE_SEKCJI_H5: tuple[str, ...] = ("EARTHING", "CAPACITOR", "MEASUREMENT")

#: Liczba cel łącznika szyn SN GPZ H5 (ENEA Zeszyt 1, zał. Z.2).
CELE_LACZNIKA_SN_H5 = 2

#: Dane projektu szablonu H5 — pola wejścia z podpowiedzią i podstawą, bez wartości domyślnej
#: (wpis 7 koordynacji pkt 6). `apply.py::_ladunek_gpz_h5` przekazuje do operacji WYŁĄCZNIE
#: klucze tej listy (`klucz_ladunku`) — deklaracja i przekazanie z jednego źródła.
#: Maksymalna liczba transformatorów 110/SN układu H5 (ENEA Zeszyt 1 §11.1: dwa pola
#: transformatorowe) — zakres parametru `transformer_count` i numerów transformatora
#: rezerwowego z JEDNEJ stałej.
MAX_TRANSFORMATOROW_H5 = 2
#: Transformator rezerwowy (numer i wyłącznik pola SN) — wymagany przy rezerwie jawnej
#: z co najmniej dwoma transformatorami (ta sama koniunkcja, co odmowa `add_grid_source_sn`).
WARUNEK_TRANSFORMATORA_REZERWOWEGO: tuple[WarunekWymagalnosci, ...] = (
    WarunekWymagalnosci(klucz="reserve_mode", rowna=TRYB_REZERWY_JAWNEJ),
    WarunekWymagalnosci(klucz="transformer_count", co_najmniej=2),
)

DANE_PROJEKTU_H5: tuple[DanaProjektuSzablonu, ...] = (
    DanaProjektuSzablonu(
        klucz="hv_sections",
        podpowiedz_pl=(
            "Dla każdej z dwóch sekcji szyn 110 kV tor zasilania: nazwa linii 110 kV, stacja "
            "zasilająca i równoważnik sieci z warunków przyłączenia OSD (Sk″ max i min, R/X, "
            "składowa zerowa)"
        ),
        podstawa_pl=(
            "Wymagania techniczne ENEA Operator, Zeszyt 1, §11.1 — układ H5 ma dwie linie "
            "zasilające 110 kV, stacja z jedną linią 110 kV nie jest dopuszczona"
        ),
        typ_wartosci="tory_zasilania_110kv",
    ),
    DanaProjektuSzablonu(
        klucz="hv_coupler.normal_state",
        podpowiedz_pl=PODPOWIEDZ_STANU_LACZNIKA_SZYN_WN_PL,
        podstawa_pl=PODSTAWA_STANU_LACZNIKA_SZYN_WN_PL,
        typ_wartosci="wybor",
        wartosci=(("open", "otwarty"), ("closed", "zamknięty")),
    ),
    DanaProjektuSzablonu(
        klucz="hv_coupler.justification",
        podpowiedz_pl="Dlaczego łącznik szyn 110 kV pracuje normalnie zamknięty",
        podstawa_pl=PODSTAWA_STANU_LACZNIKA_SZYN_WN_PL,
        typ_wartosci="tekst",
        wymagana_gdy=(WarunekWymagalnosci(klucz="hv_coupler.normal_state", rowna="closed"),),
    ),
    DanaProjektuSzablonu(
        klucz="reserve_mode",
        podpowiedz_pl=PODPOWIEDZ_TRYBU_REZERWY_PL,
        podstawa_pl=PODSTAWA_TRYBU_REZERWY_PL,
        typ_wartosci="wybor",
        wartosci=tuple((tryb, NAZWA_TRYBU_REZERWY_PL[tryb]) for tryb in TRYBY_REZERWY),
    ),
    DanaProjektuSzablonu(
        klucz="reserve_transformer",
        podpowiedz_pl="Numer transformatora rezerwowego (nieobciążonego w normalnej pracy)",
        podstawa_pl=PODSTAWA_TRYBU_REZERWY_PL,
        typ_wartosci="liczba_calkowita",
        wartosci=tuple(
            (str(n), f"transformator {n}") for n in range(1, MAX_TRANSFORMATOROW_H5 + 1)
        ),
        wymagana_gdy=WARUNEK_TRANSFORMATORA_REZERWOWEGO,
    ),
    DanaProjektuSzablonu(
        klucz="reserve_transformer_apparatus",
        podpowiedz_pl=(
            "Wyłącznik pola SN transformatora rezerwowego z katalogu — normalnie otwarty"
        ),
        podstawa_pl=PODSTAWA_TRYBU_REZERWY_PL,
        typ_wartosci="pozycja_katalogu",
        wymagana_gdy=WARUNEK_TRANSFORMATORA_REZERWOWEGO,
    ),
    DanaProjektuSzablonu(
        klucz="line_fields_per_section",
        podpowiedz_pl="Liczba pól liniowych na każdej sekcji SN (odpływy magistral)",
        podstawa_pl=(
            "ENEA Operator, Zeszyt 1, zał. Z.2 — liczba pól liniowych dostosowana do potrzeb "
            "(rysunek pokazuje 11 pól liniowych na sekcję); §13 — rozdzielnica na co najmniej "
            "32 pola docelowo"
        ),
        typ_wartosci="liczba_calkowita",
        wartosci=tuple((str(n), str(n)) for n in range(1, MAX_GPZ_LINE_FIELDS_PER_SECTION + 1)),
    ),
    DanaProjektuSzablonu(
        klucz="earthing_bay_template",
        podpowiedz_pl=(
            "Sposób uziemienia punktu neutralnego sieci SN — wynik analizy projektu stacji; "
            "wyznacza wariant pola zespołu uziemiającego obu sekcji"
        ),
        podstawa_pl=PODSTAWA_WARIANTU_ZU_PL,
        typ_wartosci="wybor",
        wartosci=tuple((ref, SZABLONY_POL_STANDARDU[ref].nazwa_pl) for ref in SZABLONY_POL_ZU_SN),
    ),
    DanaProjektuSzablonu(
        klucz="bay_apparatus",
        podpowiedz_pl=(
            "Obsadzenie gniazd pól pozycjami wymagań standardu ENEA (progi wymagań z podstawą, "
            "bez producenta) — do zastąpienia doborem producenta"
        ),
        podstawa_pl=(
            "ENEA Operator, Zeszyt 1 — §9.1, §9.2, §11.1, §13, §16, §17, §19, tabele 2–5, "
            "rys. Z.1–Z.17 (wymagania aparatury pól)"
        ),
        typ_wartosci="wybor",
        wartosci=(
            (
                OBSADZENIE_WYMAGANIAMI_STANDARDU,
                "pozycje wymagań standardu ENEA w gniazdach",
            ),
        ),
        opcjonalna=True,
        skutek_braku_pl="bez wyboru gniazda czekają na dobór aparatu",
    ),
)


def _gpz_rownowaznik_sn(
    tpl_id: str,
    name_pl: str,
    description_pl: str,
    *,
    source_options: tuple[CatalogChoice, ...],
    apparatus_options: tuple[CatalogChoice, ...],
    line_fields_per_section: int,
    use_case: str,
) -> StationTemplate:
    return StationTemplate(
        id=tpl_id,
        name_pl=name_pl,
        category=TemplateCategory.GPZ_110_SN,
        description_pl=description_pl,
        use_case_pl=use_case,
        nc_rfg_type=None,
        icon="station-gpz",
        tags=("GPZ", "zasilanie sieci", "korzeń modelu", "równoważnik na szynach SN"),
        schema=TemplateSchema(
            # Granica zasilania SN: transformatory 110/SN poza modelem (docstring modułu).
            transformer_options=(),
            transformer_count=TemplateParamInt(
                default=0,
                min_value=0,
                max_value=0,
                label_pl="Transformatory 110/SN poza modelem (równoważnik na szynach SN)",
            ),
            sn_bays_count=TemplateParamInt(
                default=line_fields_per_section,
                min_value=2,
                max_value=12,
                label_pl="Liczba pól liniowych na sekcję",
            ),
            sn_bay_roles=(
                BayRoleSpec(role="FEEDER", okreslenie_pl="(sekcja 1)"),
                BayRoleSpec(role="FEEDER", okreslenie_pl="(sekcja 2)"),
                BayRoleSpec(role="COUPLER", okreslenie_pl="szyn SN (normalnie otwarty)"),
            ),
            sn_bay_protection_options=PROT_FEEDER_OPTIONS,
            sn_bay_apparatus_options=apparatus_options,
            grid_source_options=source_options,
            protection_settings_default="tpl_feeder_15kv_sectional",
            gpz_uklad=GPZ_UKLAD_ROWNOWAZNIK_SN,
            # GPZ zasila sieć SN — bez własnej strony nN.
            nn_feeders_count=TemplateParamInt(
                default=0, min_value=0, max_value=0, label_pl="Bez odpływów nN"
            ),
            nn_feeder_cb_options=(),
            nn_load_default_kw=TemplateParamFloat(
                default=0.0, min_value=0.0, max_value=0.0, unit="kW", label_pl="Bez odbioru nN"
            ),
        ),
    )


def _gpz_h5(
    tpl_id: str,
    name_pl: str,
    description_pl: str,
    *,
    transformer_options: tuple[CatalogChoice, ...],
    apparatus_options: tuple[CatalogChoice, ...],
    use_case: str,
) -> StationTemplate:
    return StationTemplate(
        id=tpl_id,
        name_pl=name_pl,
        category=TemplateCategory.GPZ_110_SN,
        description_pl=description_pl,
        use_case_pl=use_case,
        nc_rfg_type=None,
        icon="station-gpz",
        tags=("GPZ", "zasilanie sieci", "korzeń modelu", "ENEA H5", "strona 110 kV"),
        schema=TemplateSchema(
            transformer_options=transformer_options,
            # ENEA §11.1: dwa pola transformatorowe; liczba transformatorów może być
            # ograniczona do jednego (sekcja SN 2 zasilana wtedy łącznikiem szyn SN —
            # wyłącznie przy rezerwie jawnej, inaczej odmowa operacji).
            transformer_count=TemplateParamInt(
                default=2,
                min_value=1,
                max_value=MAX_TRANSFORMATOROW_H5,
                label_pl="Liczba transformatorów 110/SN (pola transformatorowe H5)",
            ),
            # Liczba pól liniowych na sekcję SN jest DANĄ PROJEKTU (`line_fields_per_section`
            # w `dane_projektu`, zał. Z.2) — parametr szablonu bez zakresu, by formularz nie
            # miał drugiej kontrolki tej samej danej.
            sn_bays_count=TemplateParamInt(
                default=0,
                min_value=0,
                max_value=0,
                label_pl="Liczba pól liniowych na sekcję SN — dana projektu",
            ),
            sn_bay_roles=(
                BayRoleSpec(role="TR", okreslenie_pl="(sekcja 1)"),
                BayRoleSpec(role="TR", okreslenie_pl="(sekcja 2)"),
                BayRoleSpec(role="FEEDER", okreslenie_pl="(sekcja 1)"),
                BayRoleSpec(role="FEEDER", okreslenie_pl="(sekcja 2)"),
                BayRoleSpec(role="EARTHING"),
                BayRoleSpec(role="CAPACITOR"),
                BayRoleSpec(role="MEASUREMENT", okreslenie_pl="napięcia szyn"),
                BayRoleSpec(role="COUPLER", okreslenie_pl="szyn SN (dwie cele)"),
            ),
            sn_bay_protection_options=PROT_FEEDER_OPTIONS,
            sn_bay_apparatus_options=apparatus_options,
            protection_settings_default="tpl_feeder_15kv_sectional",
            gpz_uklad=GPZ_UKLAD_H5,
            dane_projektu=DANE_PROJEKTU_H5,
            # GPZ zasila sieć SN — bez własnej strony nN.
            nn_feeders_count=TemplateParamInt(
                default=0, min_value=0, max_value=0, label_pl="Bez odpływów nN"
            ),
            nn_feeder_cb_options=(),
            nn_load_default_kw=TemplateParamFloat(
                default=0.0, min_value=0.0, max_value=0.0, unit="kW", label_pl="Bez odbioru nN"
            ),
        ),
    )


GPZ_110_SN_TEMPLATES = (
    _gpz_h5(
        "tpl_gpz_h5_110_15_2x25mva",
        "GPZ 110/15 kV w układzie H5, 2 × 25 MVA",
        "Główny Punkt Zasilania 110/15 kV w układzie H5 (ENEA Operator, Zeszyt 1 §11.1): "
        "dwie linie 110 kV (tory zasilania L1 i L2 z danych projektu), dwie sekcje szyn "
        "110 kV z łącznikiem szyn, dwa transformatory 110/15 kV z katalogu przypisane "
        "jawnie do sekcji, dwie sekcje SN z łącznikiem szyn SN w dwóch celach, na każdej "
        "sekcji SN pola zespołu uziemiającego, baterii kondensatorów i pomiaru napięcia.",
        transformer_options=TR_WN_SN_OPTIONS_15,
        apparatus_options=SN_APPARATUS_OPTIONS,
        use_case="Typowa stacja 110/15 kV OSD z dwoma liniami zasilającymi 110 kV "
        "i rezerwą transformatorową.",
    ),
    _gpz_h5(
        "tpl_gpz_h5_110_20_2x25mva",
        "GPZ 110/20 kV w układzie H5, 2 × 25 MVA",
        "Główny Punkt Zasilania 110/20 kV w układzie H5 (ENEA Operator, Zeszyt 1 §11.1): "
        "dwie linie 110 kV (tory zasilania L1 i L2 z danych projektu), dwie sekcje szyn "
        "110 kV z łącznikiem szyn, dwa transformatory 110/20 kV z katalogu przypisane "
        "jawnie do sekcji, dwie sekcje SN z łącznikiem szyn SN w dwóch celach, na każdej "
        "sekcji SN pola zespołu uziemiającego, baterii kondensatorów i pomiaru napięcia.",
        transformer_options=TR_WN_SN_OPTIONS_20,
        apparatus_options=SN_APPARATUS_OPTIONS_24KV,
        use_case="Typowa stacja 110/20 kV OSD z dwoma liniami zasilającymi 110 kV "
        "i rezerwą transformatorową.",
    ),
    _gpz_rownowaznik_sn(
        "tpl_gpz_sn_15_2s_4p",
        "GPZ 15 kV — równoważnik na szynach SN, dwie sekcje, 4 pola liniowe na sekcję",
        "Główny Punkt Zasilania opisany równoważnikami sieci na szynach SN 15 kV "
        "(warunki przyłączenia OSD): dwie sekcje szyn SN, każda z własnym równoważnikiem, "
        "łącznik szyn SN normalnie otwarty, po 4 pola liniowe na sekcji. Transformatory "
        "110/SN są zawarte w równoważnikach i nie są elementami modelu.",
        source_options=GPZ_SOURCE_OPTIONS_15,
        apparatus_options=SN_APPARATUS_OPTIONS,
        line_fields_per_section=4,
        use_case="GPZ zasilający obszar dystrybucyjny SN 15 kV, gdy OSD podał warunki "
        "przyłączenia na szynach SN (strona 110 kV poza zakresem projektu).",
    ),
    _gpz_rownowaznik_sn(
        "tpl_gpz_sn_15_2s_6p",
        "GPZ 15 kV — równoważnik na szynach SN, dwie sekcje, 6 pól liniowych na sekcję",
        "Duży Główny Punkt Zasilania opisany równoważnikami sieci na szynach SN 15 kV: "
        "dwie sekcje szyn SN, każda z własnym równoważnikiem, łącznik szyn SN normalnie "
        "otwarty, po 6 pól liniowych na sekcji. Transformatory 110/SN są zawarte "
        "w równoważnikach i nie są elementami modelu.",
        source_options=GPZ_SOURCE_OPTIONS_15,
        apparatus_options=SN_APPARATUS_OPTIONS,
        line_fields_per_section=6,
        use_case="Duży GPZ obszaru miejskiego/przemysłowego SN 15 kV z wieloma "
        "magistralami odpływowymi, warunki przyłączenia na szynach SN.",
    ),
    _gpz_rownowaznik_sn(
        "tpl_gpz_sn_20_2s_4p",
        "GPZ 20 kV — równoważnik na szynach SN, dwie sekcje, 4 pola liniowe na sekcję",
        "Główny Punkt Zasilania opisany równoważnikami sieci na szynach SN 20 kV: dwie "
        "sekcje szyn SN, każda z własnym równoważnikiem, łącznik szyn SN normalnie "
        "otwarty, po 4 pola liniowe na sekcji. Transformatory 110/SN są zawarte "
        "w równoważnikach i nie są elementami modelu.",
        source_options=GPZ_SOURCE_OPTIONS_20,
        apparatus_options=SN_APPARATUS_OPTIONS_24KV,
        line_fields_per_section=4,
        use_case="GPZ zasilający obszar dystrybucyjny SN 20 kV, warunki przyłączenia "
        "na szynach SN.",
    ),
)
