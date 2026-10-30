"""Oficjalny indeks rodziny Elektrometal e²TANGO (audyt 2026-10-31).

Dwa rozłączne cele:
- pełna wiedza o rodzinie (SN/nN, detektory, automatyka, WN),
- ostrożny dobór KANONICZNYCH typów zabezpieczeń SN, bez automatycznych funkcji.

functions_published oznacza WYKAZ PRODUCENTA, a nie funkcje zainstalowane i
aktywne na konkretnej instancji. Nie jest wejściem solvera, EAZ ani SLD.
Brak wypełnionej DTR / kodu zamówieniowego = brak podstaw do nastaw.
"""
from __future__ import annotations

from copy import deepcopy
from typing import Any

# Dane celowo proste, bez nowego modelu domenowego ani nowej tabeli SQL.
# Źródła: oficjalne strony i karty Elektrometal Energetyka.
_FAMILY: tuple[dict[str, Any], ...] = [
  {
    "id": "EM_E2TANGO_50",
    "model": "e²TANGO-50",
    "kategoria": "DETEKTOR_ZWARC_SN",
    "integracja": "REFERENCE_ONLY",
    "zrodlo": {
      "wydanie": "Strona producenta: detektor zwarć e²TANGO-50",
      "url": "https://elektrometal-energetyka.pl/zespoly-zabezpieczen-e%C2%B2tango/detektor-zwarc-e%C2%B2tango-50/"
    },
    "uwagi": "Warianty CT, RC, RCx, RCU, RCUR, RCUx, RCUxR: podstawa Katalog Rozwiązania 0.2.12, 04/2026.",
    "funkcje_publikowane": [
      "wykrywanie zwarć fazowych",
      "wykrywanie zwarć doziemnych"
    ],
    "status_funkcji": "DEKLARACJA_RODZINY_LUB_ROLI_NIE_AKTYWNA_KONFIGURACJA",
    "wykonania_wg_zrodla": [
      "CT",
      "RC",
      "RCx",
      "RCU",
      "RCUR",
      "RCUx",
      "RCUxR"
    ],
    "aktywnie_wlaczone_funkcje": None,
    "nastawy": None,
    "przekladnia_ct": None
  },
  {
    "id": "EM_E2TANGO_100",
    "model": "e²TANGO-100",
    "kategoria": "ZABEZPIECZENIE_SN_NN",
    "integracja": "SELECTABLE_SN",
    "zrodlo": {
      "wydanie": "Producent: zespoły zabezpieczeń e²TANGO-100/-150",
      "url": "https://elektrometal-energetyka.pl/zespoly-zabezpieczen-e%C2%B2tango/zespoly-zabezpieczen-e%C2%B2tango-100/"
    },
    "uwagi": "Kompaktowy zespół zabezpieczeń SN/nN; funkcje zależne od wykonania, bez identyfikacji poszczególnych nastaw.",
    "funkcje_publikowane": [],
    "status_funkcji": "DEKLARACJA_RODZINY_LUB_ROLI_NIE_AKTYWNA_KONFIGURACJA",
    "wykonania_wg_zrodla": [],
    "aktywnie_wlaczone_funkcje": None,
    "nastawy": None,
    "przekladnia_ct": None
  },
  {
    "id": "EM_E2TANGO_150",
    "model": "e²TANGO-150",
    "kategoria": "ZABEZPIECZENIE_SN_NN",
    "integracja": "SELECTABLE_SN",
    "zrodlo": {
      "wydanie": "Elektrometal: K-40.1.8, 08/2025, warianty M/L/G/LG",
      "url": "https://elektrometal-energetyka.pl/wp-content/uploads/2025/08/karta-katalogowa-e2TANGO-150-K-40.1.8.pdf"
    },
    "uwagi": "Warianty 150-M, 150-L, 150-G i 150-LG; nie scalać wariantów obwodów I0 i U0.",
    "funkcje_publikowane": [],
    "status_funkcji": "DEKLARACJA_RODZINY_LUB_ROLI_NIE_AKTYWNA_KONFIGURACJA",
    "wykonania_wg_zrodla": [
      "M",
      "L",
      "G",
      "LG"
    ],
    "aktywnie_wlaczone_funkcje": None,
    "nastawy": None,
    "przekladnia_ct": None
  },
  {
    "id": "EM_E2TANGO_200",
    "model": "e²TANGO-200",
    "kategoria": "ZABEZPIECZENIE_SN_NN",
    "integracja": "SELECTABLE_SN",
    "zrodlo": {
      "wydanie": "Producent: e²TANGO-200 tylko w wersji autonomicznej",
      "url": "https://elektrometal-energetyka.pl/zespoly-zabezpieczen-e%C2%B2tango/zespol-zabezpieczen-e%C2%B2tango-200/"
    },
    "uwagi": "Poprzednia generacja 200; producent ogranicza bieżącą ofertę do wykonania autonomicznego. Nie promować jako nowy model 250.",
    "funkcje_publikowane": [],
    "status_funkcji": "DEKLARACJA_RODZINY_LUB_ROLI_NIE_AKTYWNA_KONFIGURACJA",
    "wykonania_wg_zrodla": [
      "S",
      "U"
    ],
    "aktywnie_wlaczone_funkcje": None,
    "nastawy": None,
    "przekladnia_ct": None
  },
  {
    "id": "EM_E2TANGO_250",
    "model": "e²TANGO-250",
    "kategoria": "ZABEZPIECZENIE_SN_NN",
    "integracja": "SELECTABLE_SN",
    "zrodlo": {
      "wydanie": "Elektrometal: K-42.1.8, 10/2025, s. 6–9",
      "url": "https://elektrometal-energetyka.pl/wp-content/uploads/2025/10/Karta-katalogowa-e2TANGO-250-K-42.1.8.pdf"
    },
    "uwagi": "Wykonanie S: 4I+1U, wykonanie U: 1I+4U. Funkcje zależą od S/U; 1 A lub 5 A to konfiguracja wejścia PP.",
    "funkcje_publikowane": [
      "50",
      "50N",
      "51",
      "51N",
      "67",
      "67N",
      "79",
      "50BF",
      "21NY",
      "27/27P",
      "59/59P",
      "59N",
      "81U",
      "81O"
    ],
    "status_funkcji": "DEKLARACJA_RODZINY_LUB_ROLI_NIE_AKTYWNA_KONFIGURACJA",
    "wykonania_wg_zrodla": [
      "S",
      "U"
    ],
    "aktywnie_wlaczone_funkcje": None,
    "nastawy": None,
    "przekladnia_ct": None
  },
  {
    "id": "EM_E2TANGO_400",
    "model": "e²TANGO-400",
    "kategoria": "ZABEZPIECZENIE_SN_NN",
    "integracja": "SELECTABLE_SN",
    "zrodlo": {
      "wydanie": "Producent: Nowa generacja e²TANGO — 400 zastąpiony przez 450",
      "url": "https://elektrometal-energetyka.pl/nowa-generacja-e%C2%B2tango/"
    },
    "uwagi": "Starszy model 400 utrzymywany serwisowo; nowy rozwój zakończony. Zostawić EM_ETANGO_400_V0 bez migracji.",
    "funkcje_publikowane": [],
    "status_funkcji": "DEKLARACJA_RODZINY_LUB_ROLI_NIE_AKTYWNA_KONFIGURACJA",
    "wykonania_wg_zrodla": [],
    "aktywnie_wlaczone_funkcje": None,
    "nastawy": None,
    "przekladnia_ct": None
  },
  {
    "id": "EM_E2TANGO_450",
    "model": "e²TANGO-450",
    "kategoria": "STEROWNIK_POLOWY_SN",
    "integracja": "SELECTABLE_SN",
    "zrodlo": {
      "wydanie": "Elektrometal: K-43.1.7, 07/2025, s. 6–9",
      "url": "https://elektrometal-energetyka.pl/wp-content/uploads/2025/07/Karta-katalogowa-e2TANGO-450-K-43.1.7.pdf"
    },
    "uwagi": "Kolorowy ekran 4,3 cala, 4 wejścia prądowe, podstawowe 1 napięciowe; dodatkowe karty opcjonalne. Funkcje w karcie jako oferta, nie wyposażenie instancji.",
    "funkcje_publikowane": [
      "50",
      "50N",
      "51",
      "51N",
      "67",
      "67N",
      "27/27P",
      "59/59P",
      "59N",
      "81U",
      "81O",
      "50BF",
      "79",
      "21NY",
      "74TCS"
    ],
    "status_funkcji": "DEKLARACJA_RODZINY_LUB_ROLI_NIE_AKTYWNA_KONFIGURACJA",
    "wykonania_wg_zrodla": [],
    "aktywnie_wlaczone_funkcje": None,
    "nastawy": None,
    "przekladnia_ct": None
  },
  {
    "id": "EM_E2TANGO_600",
    "model": "e²TANGO-600",
    "kategoria": "STEROWNIK_POLOWY_SN",
    "integracja": "SELECTABLE_SN",
    "zrodlo": {
      "wydanie": "Elektrometal: K-3.2.21, 05/2025, s. 7–9",
      "url": "https://elektrometal-energetyka.pl/wp-content/uploads/2025/05/Karta-katalogowa-e2TANGO-600-1200-K-3.2.21.pdf"
    },
    "uwagi": "Panel 6 cali; bez dotyku; jednostki J6/J10/J14 zależnie od konfiguracji. Karta podaje funkcje na poziomie rodziny, nie zestaw konkretnej sztuki.",
    "funkcje_publikowane": [
      "13",
      "21NY",
      "23/26",
      "27/27P",
      "27/ARC",
      "27ROC/59ROC",
      "32P",
      "32Q",
      "37",
      "46",
      "48",
      "49",
      "50",
      "50N",
      "50Ns",
      "50G",
      "50HS/SOTF",
      "50LR/51LR",
      "50NC/51NC",
      "51",
      "51N",
      "51Ns",
      "51G",
      "51N/59N",
      "59/59P",
      "59/Ufr",
      "59N",
      "62",
      "66",
      "67",
      "67N",
      "67Ns",
      "67G",
      "74TCS",
      "80",
      "81O",
      "81R",
      "81U",
      "87L/87LG",
      "87M",
      "87T",
      "25",
      "41N",
      "50BF",
      "79",
      "79VF",
      "83",
      "90C"
    ],
    "status_funkcji": "DEKLARACJA_RODZINY_LUB_ROLI_NIE_AKTYWNA_KONFIGURACJA",
    "wykonania_wg_zrodla": [],
    "aktywnie_wlaczone_funkcje": None,
    "nastawy": None,
    "przekladnia_ct": None
  },
  {
    "id": "EM_E2TANGO_800",
    "model": "e²TANGO-800",
    "kategoria": "STEROWNIK_POLOWY_SN",
    "integracja": "SELECTABLE_SN",
    "zrodlo": {
      "wydanie": "Elektrometal: K-3.2.21, 05/2025, s. 7–9",
      "url": "https://elektrometal-energetyka.pl/wp-content/uploads/2025/05/Karta-katalogowa-e2TANGO-600-1200-K-3.2.21.pdf"
    },
    "uwagi": "Panel 6 cali; bez dotyku; jednostki J6/J10/J14 zależnie od konfiguracji. Karta podaje funkcje na poziomie rodziny, nie zestaw konkretnej sztuki.",
    "funkcje_publikowane": [
      "13",
      "21NY",
      "23/26",
      "27/27P",
      "27/ARC",
      "27ROC/59ROC",
      "32P",
      "32Q",
      "37",
      "46",
      "48",
      "49",
      "50",
      "50N",
      "50Ns",
      "50G",
      "50HS/SOTF",
      "50LR/51LR",
      "50NC/51NC",
      "51",
      "51N",
      "51Ns",
      "51G",
      "51N/59N",
      "59/59P",
      "59/Ufr",
      "59N",
      "62",
      "66",
      "67",
      "67N",
      "67Ns",
      "67G",
      "74TCS",
      "80",
      "81O",
      "81R",
      "81U",
      "87L/87LG",
      "87M",
      "87T",
      "25",
      "41N",
      "50BF",
      "79",
      "79VF",
      "83",
      "90C"
    ],
    "status_funkcji": "DEKLARACJA_RODZINY_LUB_ROLI_NIE_AKTYWNA_KONFIGURACJA",
    "wykonania_wg_zrodla": [],
    "aktywnie_wlaczone_funkcje": None,
    "nastawy": None,
    "przekladnia_ct": None
  },
  {
    "id": "EM_E2TANGO_1000",
    "model": "e²TANGO-1000",
    "kategoria": "STEROWNIK_POLOWY_SN",
    "integracja": "SELECTABLE_SN",
    "zrodlo": {
      "wydanie": "Elektrometal: K-3.2.21, 05/2025, s. 7–9",
      "url": "https://elektrometal-energetyka.pl/wp-content/uploads/2025/05/Karta-katalogowa-e2TANGO-600-1200-K-3.2.21.pdf"
    },
    "uwagi": "Panel 7 cali; ekran dotykowy; jednostki J6/J10/J14 zależnie od konfiguracji. Karta podaje funkcje na poziomie rodziny, nie zestaw konkretnej sztuki.",
    "funkcje_publikowane": [
      "13",
      "21NY",
      "23/26",
      "27/27P",
      "27/ARC",
      "27ROC/59ROC",
      "32P",
      "32Q",
      "37",
      "46",
      "48",
      "49",
      "50",
      "50N",
      "50Ns",
      "50G",
      "50HS/SOTF",
      "50LR/51LR",
      "50NC/51NC",
      "51",
      "51N",
      "51Ns",
      "51G",
      "51N/59N",
      "59/59P",
      "59/Ufr",
      "59N",
      "62",
      "66",
      "67",
      "67N",
      "67Ns",
      "67G",
      "74TCS",
      "80",
      "81O",
      "81R",
      "81U",
      "87L/87LG",
      "87M",
      "87T",
      "25",
      "41N",
      "50BF",
      "79",
      "79VF",
      "83",
      "90C"
    ],
    "status_funkcji": "DEKLARACJA_RODZINY_LUB_ROLI_NIE_AKTYWNA_KONFIGURACJA",
    "wykonania_wg_zrodla": [],
    "aktywnie_wlaczone_funkcje": None,
    "nastawy": None,
    "przekladnia_ct": None
  },
  {
    "id": "EM_E2TANGO_1200",
    "model": "e²TANGO-1200",
    "kategoria": "STEROWNIK_POLOWY_SN",
    "integracja": "SELECTABLE_SN",
    "zrodlo": {
      "wydanie": "Elektrometal: K-3.2.21, 05/2025, s. 7–9",
      "url": "https://elektrometal-energetyka.pl/wp-content/uploads/2025/05/Karta-katalogowa-e2TANGO-600-1200-K-3.2.21.pdf"
    },
    "uwagi": "Panel 7 cali; ekran dotykowy; jednostki J6/J10/J14 zależnie od konfiguracji. Karta podaje funkcje na poziomie rodziny, nie zestaw konkretnej sztuki.",
    "funkcje_publikowane": [
      "13",
      "21NY",
      "23/26",
      "27/27P",
      "27/ARC",
      "27ROC/59ROC",
      "32P",
      "32Q",
      "37",
      "46",
      "48",
      "49",
      "50",
      "50N",
      "50Ns",
      "50G",
      "50HS/SOTF",
      "50LR/51LR",
      "50NC/51NC",
      "51",
      "51N",
      "51Ns",
      "51G",
      "51N/59N",
      "59/59P",
      "59/Ufr",
      "59N",
      "62",
      "66",
      "67",
      "67N",
      "67Ns",
      "67G",
      "74TCS",
      "80",
      "81O",
      "81R",
      "81U",
      "87L/87LG",
      "87M",
      "87T",
      "25",
      "41N",
      "50BF",
      "79",
      "79VF",
      "83",
      "90C"
    ],
    "status_funkcji": "DEKLARACJA_RODZINY_LUB_ROLI_NIE_AKTYWNA_KONFIGURACJA",
    "wykonania_wg_zrodla": [],
    "aktywnie_wlaczone_funkcje": None,
    "nastawy": None,
    "przekladnia_ct": None
  },
  {
    "id": "EM_E2TANGO_2000_ODL",
    "model": "e²TANGO-2000-ODL",
    "kategoria": "SPECJALIZOWANY_ZESPOL_WN",
    "integracja": "REFERENCE_ONLY",
    "zrodlo": {
      "wydanie": "Strona produktu Elektrometal e²TANGO-2000, odmiana 2000-ODL",
      "url": "https://elektrometal-energetyka.pl/zespol-zabezpieczen-wn-e%C2%B2tango-2000-odl-zabezpieczenie-odleglosciowe/"
    },
    "uwagi": "Zabezpieczenie odległościowe linii WN; identyfikacja funkcji wg oznaczenia zastosowania, nie dowód nastaw.",
    "funkcje_publikowane": [
      "21"
    ],
    "status_funkcji": "DEKLARACJA_RODZINY_LUB_ROLI_NIE_AKTYWNA_KONFIGURACJA",
    "wykonania_wg_zrodla": [],
    "aktywnie_wlaczone_funkcje": None,
    "nastawy": None,
    "przekladnia_ct": None
  },
  {
    "id": "EM_E2TANGO_2000_TRR",
    "model": "e²TANGO-2000-TRR",
    "kategoria": "SPECJALIZOWANY_ZESPOL_WN",
    "integracja": "REFERENCE_ONLY",
    "zrodlo": {
      "wydanie": "Strona produktu Elektrometal e²TANGO-2000, odmiana 2000-TRR",
      "url": "https://elektrometal-energetyka.pl/zespol-zabezpieczen-wn-e%C2%B2tango-2000-trr-zabezpieczenie-roznicowe-transformatora/"
    },
    "uwagi": "Zabezpieczenie różnicowe transformatora WN; identyfikacja funkcji wg oznaczenia zastosowania, nie dowód nastaw.",
    "funkcje_publikowane": [
      "87T"
    ],
    "status_funkcji": "DEKLARACJA_RODZINY_LUB_ROLI_NIE_AKTYWNA_KONFIGURACJA",
    "wykonania_wg_zrodla": [],
    "aktywnie_wlaczone_funkcje": None,
    "nastawy": None,
    "przekladnia_ct": None
  },
  {
    "id": "EM_E2TANGO_2000_STP",
    "model": "e²TANGO-2000-STP",
    "kategoria": "SPECJALIZOWANY_ZESPOL_WN",
    "integracja": "REFERENCE_ONLY",
    "zrodlo": {
      "wydanie": "Strona produktu Elektrometal e²TANGO-2000, odmiana 2000-STP",
      "url": "https://elektrometal-energetyka.pl/zespol-zabezpieczen-wn-e%C2%B2tango-2000-stp-sterowniki-polowe/"
    },
    "uwagi": "Sterownik polowy WN, nadprądowe i ziemnozwarciowe; identyfikacja funkcji wg oznaczenia zastosowania, nie dowód nastaw.",
    "funkcje_publikowane": [
      "50",
      "51",
      "50N",
      "51N"
    ],
    "status_funkcji": "DEKLARACJA_RODZINY_LUB_ROLI_NIE_AKTYWNA_KONFIGURACJA",
    "wykonania_wg_zrodla": [],
    "aktywnie_wlaczone_funkcje": None,
    "nastawy": None,
    "przekladnia_ct": None
  },
  {
    "id": "EM_E2TANGO_2000_ARN",
    "model": "e²TANGO-2000-ARN",
    "kategoria": "SPECJALIZOWANY_ZESPOL_WN",
    "integracja": "REFERENCE_ONLY",
    "zrodlo": {
      "wydanie": "Strona produktu Elektrometal e²TANGO-2000, odmiana 2000-ARN",
      "url": "https://elektrometal-energetyka.pl/zespol-zabezpieczen-wn-e%C2%B2tango-2000-arn-automatyczny-regulator-napiecia/"
    },
    "uwagi": "Automatyczny regulator napięcia transformatora WN; identyfikacja funkcji wg oznaczenia zastosowania, nie dowód nastaw.",
    "funkcje_publikowane": [],
    "status_funkcji": "DEKLARACJA_RODZINY_LUB_ROLI_NIE_AKTYWNA_KONFIGURACJA",
    "wykonania_wg_zrodla": [],
    "aktywnie_wlaczone_funkcje": None,
    "nastawy": None,
    "przekladnia_ct": None
  },
  {
    "id": "EM_E2TANGO_2000_LRR",
    "model": "e²TANGO-2000-LRR",
    "kategoria": "SPECJALIZOWANY_ZESPOL_WN",
    "integracja": "REFERENCE_ONLY",
    "zrodlo": {
      "wydanie": "Strona produktu Elektrometal e²TANGO-2000, odmiana 2000-LRR",
      "url": "https://elektrometal-energetyka.pl/zespol-zabezpieczen-wn-e%C2%B2tango-2000-lrr-zabezpieczenie-roznicowe-linii/"
    },
    "uwagi": "Zabezpieczenie różnicowe linii WN; identyfikacja funkcji wg oznaczenia zastosowania, nie dowód nastaw.",
    "funkcje_publikowane": [
      "87L"
    ],
    "status_funkcji": "DEKLARACJA_RODZINY_LUB_ROLI_NIE_AKTYWNA_KONFIGURACJA",
    "wykonania_wg_zrodla": [],
    "aktywnie_wlaczone_funkcje": None,
    "nastawy": None,
    "przekladnia_ct": None
  },
  {
    "id": "EM_E2TANGO_SZR_PPZ",
    "model": "e²TANGO-SZR-PPZ",
    "kategoria": "PROFIL_AUTOMATYKI",
    "integracja": "REFERENCE_ONLY",
    "zrodlo": {
      "wydanie": "Elektrometal: Automatyka e²TANGO SZR/PPZ",
      "url": "https://elektrometal-energetyka.pl/rozwiazania-2/automatyka-e%C2%B2tango-szr/"
    },
    "uwagi": "To konfiguracja automatyki oparta na sterownikach e²TANGO, nie niezależny aparat typu relay w katalogu SN.",
    "funkcje_publikowane": [
      "83"
    ],
    "status_funkcji": "DEKLARACJA_RODZINY_LUB_ROLI_NIE_AKTYWNA_KONFIGURACJA",
    "wykonania_wg_zrodla": [],
    "aktywnie_wlaczone_funkcje": None,
    "nastawy": None,
    "przekladnia_ct": None
  }
]

# Do katalogu kanonicznego dodajemy TYLKO istniejące wyroby nadające się do
# ręcznego doboru w polu SN. e²TANGO-50 jest DETEKTOREM, WN=poza tym zakresem,
# SZR/PPZ=konfiguracją aplikacyjną, a 250/450 są już w katalogu (#517).
_ALREADY_IN_CATALOG: frozenset[str] = frozenset({
    "EM_E2TANGO_250", "EM_E2TANGO_450",
})


def list_etango_family_references() -> list[dict[str, Any]]:
    """Indeks czytelniczy; głębokie kopie wykluczają mutację katalogu przez API."""
    return sorted((deepcopy(item) for item in _FAMILY), key=lambda item: item["id"])


def get_etango_sn_catalog_additions() -> list[dict[str, Any]]:
    """Addytywne rekordy MV ProtectionDeviceType, bez zmyślonych prądów/nastaw."""
    result: list[dict[str, Any]] = []
    for row in _FAMILY:
        if row["integracja"] != "SELECTABLE_SN" or row["id"] in _ALREADY_IN_CATALOG:
            continue
        note = row["uwagi"] + " Funkcje producenta nie są aktywowane automatycznie."
        result.append({
            "id": row["id"],
            "name_pl": "Elektrometal " + row["model"],
            "params": {
                "vendor": "ELEKTROMETAL",
                "series": "e2TANGO",
                "revision": None,
                "rated_current_a": None,
                "analytical_library_ref": None,
                "notes_pl": note,
                "verification_status": "CZESCIOWO_ZWERYFIKOWANY",
                "source_reference": row["zrodlo"]["wydanie"] + "; " + row["zrodlo"]["url"],
                "catalog_status": "REFERENCYJNY_V1",
                "contract_version": "2.0",
                "verification_note": (
                    "Producent potwierdza rodzinę i zastosowanie; wariant sprzętowy, "
                    "czynne funkcje, przekładniki i nastawy wymagają dowodu z DTR "
                    "i konfiguracji konkretnej instancji."
                ),
            },
        })
    return result
