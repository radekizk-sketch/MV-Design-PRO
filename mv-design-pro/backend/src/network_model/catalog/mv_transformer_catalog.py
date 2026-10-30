"""
Katalog transformatorow SN — dane tabliczkowe i zwarciowe.

ZRODLA DANYCH (proweniencja w polach rekordu, widoczna w karcie technicznej UI):
- Jednostki istniejace WN/SN 110/15 i 110/20 kV (deklarowane ZREW T-42) oraz SN/nN
    15/0,4 i 20/0,4 kV (deklarowane ABB / Trafo Zywiec, polscy producenci): straty sprzed
    ekoprojektu, dokumenty niedolaczone — NIEWERYFIKOWANY, znacznik przekroczenia Tier 2.
- Pozycje normatywne SN/nN 15/0,4 i 20/0,4 kV (olejowe i suche, 250–3150 kVA) oraz
    blokowe PV/BESS/FW 15|20/0,385–1,0 kV (suche, 500–3150 kVA): straty = pulap Tier 2
    rozporzadzenia (UE) 548/2014 w brzmieniu 2019/1783, u_k/zaczepy = seria Siemens
    GEAFOL, i0 = GEAFOL (suche) lub BEZ/EG (olejowe) — REFERENCYJNY.
- Karty producentow: Siemens GEAFOL Neo 4GY6364-1EC 2000 kVA 20/0,48 kV — ZWERYFIKOWANY.

KONWENCJE:
- rated_power_mva [MVA] — moc znamionowa
- voltage_hv_kv [kV] — napiecie strony gornej (WN lub SN)
- voltage_lv_kv [kV] — napiecie strony dolnej (SN lub nN)
- uk_percent [%] — napiecie zwarcia
- pk_kw [kW] — straty obciazeniowe (miedziane)
- i0_percent [%] — prad jalowy
- p0_kw [kW] — straty biegu jalowego (zelazne)
- vector_group — grupa polaczen (Yd11, Dyn11, Yd5, etc.)

GRUPY POLACZEN:
- Yd11: gwiazda-trojkat, przesun. 330 stopni (-30) — typowy WN/SN
- Dyn11: trojkat-gwiazda z N, przesun. 330 stopni — typowy SN/nN
- YNd11: gwiazda uziemiona-trojkat, przesun. 330 stopni — z uziemieniem

METADATA (proweniencja, ten sam mechanizm co w pozostalych katalogach):
- verification_status: ZWERYFIKOWANY (karta producenta dolaczona cytatem z adresem),
  REFERENCYJNY (pozycja normatywna/typowa), NIEWERYFIKOWANY (deklaracja bez dokumentu)
- catalog_status: PRODUKCYJNY_V1 (karta producenta) / REFERENCYJNY_V1 (pozostale)
- source_reference: cytat zrodla; verification_note: zakres i zastrzezenia
- contract_version: "2.0" — zamrozony kontrakt katalogu

TYPOSZEREG (225 rekordow, pomiar 2026-10-15):
  WN/SN 110/15 i 110/20 kV: 10, 16, 25, 40, 63 MVA Yd11 — 10 jednostek istniejacych
  SN/nN 15|20/0,4 kV jednostki istniejace: 24 (Dyn11/Yd11, 63–2500 kVA)
  SN/nN 15|20/0,4 kV normatywne Tier 2: 48 (olejowe i suche, 250–3150 kVA)
  SN/nN blokowe 15|20/0,385|0,434|0,48|0,5|0,69|0,8|1,0 kV: 126 normatywnych (500–3150 kVA)
  Karty producentow: 1; polscy producenci (deklarowane, niezweryfikowane): 16
"""

import math
from typing import Any

from network_model.pochodne import kva_na_mva

#: Znacznik noty pozycji, ktorej straty przekraczaja pulap Tier 2 rozporzadzenia (UE)
#: 548/2014 w brzmieniu (UE) 2019/1783 (jedno zrodlo prawdy dla danych i testu pary
#: predykatow `test_katalog_proweniencja_kompletnosc.py`).
ZNACZNIK_PRZEKROCZENIA_TIER2 = "PRZEKRACZA PUŁAP TIER 2"

_SUFIKS_ZRODLA_ISTNIEJACEGO = (
    " — wartości sprzed ekoprojektu (jednostki istniejące); dokument nie jest dołączony "
    "do repozytorium (niezweryfikowany)"
)

#: Nota jednostek istniejacych SN/nN (pomiar 2026-10-15: kazda przekracza tab. I.1 Tier 2).
NOTA_JEDNOSTKA_ISTNIEJACA_SN_NN = (
    f"{ZNACZNIK_PRZEKROCZENIA_TIER2} (UE 548/2014 w brzmieniu 2019/1783, tab. I.1/I.2): "
    "jednostka istniejąca — straty sprzed ekoprojektu, nie opisuje transformatora "
    "wprowadzanego dziś na rynek UE. Dla nowych projektów pozycje normatywne "
    "„tr-sn-nn-…-tier2-…”. Deklarowana seria ABB RESIBLOC jest żywiczna (sucha), a rekord "
    "podaje chłodzenie olejowe — sprzeczność danych bez dokumentu; pułap przekroczony "
    "względem obu tabel (I.1 i I.2)."
)

#: Nota jednostek istniejacych WN/SN (pomiar 2026-10-15: PEI 99,44–99,64 % ponizej
#: minimum tab. I.7 Tier 2 99,615–99,745 %).
NOTA_JEDNOSTKA_ISTNIEJACA_WN_SN = (
    f"{ZNACZNIK_PRZEKROCZENIA_TIER2} (UE 548/2014 w brzmieniu 2019/1783, tab. I.7 — "
    "minimalny PEI): jednostka istniejąca — straty sprzed ekoprojektu. Katalog nie ma "
    "pozycji WN/SN zgodnej z Tier 2: brak karty producenta z kompletem P0/Pk/u_k."
)

# =============================================================================
# TRANSFORMATORY WN/SN (110/15 kV) — Yd11
# Zrodlo: PN-EN 60076-1:2011 / ZREW Transformatory specyfikacja typ T-42
# =============================================================================

TRANSFORMER_WN_SN_110_15: list[dict[str, Any]] = [
    {
        "id": "tr-wn-sn-110-15-10mva-yd11",
        "name": "TR 110/15 kV 10 MVA Yd11",
        "params": {
            "rated_power_mva": 10.0,
            "voltage_hv_kv": 110.0,
            "voltage_lv_kv": 15.0,
            "uk_percent": 10.0,
            "pk_kw": 60.0,
            "i0_percent": 0.5,
            "p0_kw": 13.0,
            "vector_group": "Yd11",
            "cooling_class": "ONAN",
            "tap_min": -5,
            "tap_max": 5,
            "tap_step_percent": 2.5,
            "manufacturer": "ZREW Transformatory",
            "standard": "PN-EN 60076-1:2011",
            "verification_status": "NIEWERYFIKOWANY",
            "catalog_status": "REFERENCYJNY_V1",
            "source_reference": "Deklarowane: PN-EN 60076-1:2011 / ZREW Transformatory specyfikacja typ T-42"
            + _SUFIKS_ZRODLA_ISTNIEJACEGO,
            "contract_version": "2.0",
            "verification_note": NOTA_JEDNOSTKA_ISTNIEJACA_WN_SN,
        },
    },
    {
        "id": "tr-wn-sn-110-15-16mva-yd11",
        "name": "TR 110/15 kV 16 MVA Yd11",
        "params": {
            "rated_power_mva": 16.0,
            "voltage_hv_kv": 110.0,
            "voltage_lv_kv": 15.0,
            "uk_percent": 10.5,
            "pk_kw": 85.0,
            "i0_percent": 0.4,
            "p0_kw": 18.0,
            "vector_group": "Yd11",
            "cooling_class": "ONAN",
            "tap_min": -5,
            "tap_max": 5,
            "tap_step_percent": 2.5,
            "manufacturer": "ZREW Transformatory",
            "standard": "PN-EN 60076-1:2011",
            "verification_status": "NIEWERYFIKOWANY",
            "catalog_status": "REFERENCYJNY_V1",
            "source_reference": "Deklarowane: PN-EN 60076-1:2011 / ZREW Transformatory specyfikacja typ T-42"
            + _SUFIKS_ZRODLA_ISTNIEJACEGO,
            "contract_version": "2.0",
            "verification_note": NOTA_JEDNOSTKA_ISTNIEJACA_WN_SN,
        },
    },
    {
        "id": "tr-wn-sn-110-15-25mva-yd11",
        "name": "TR 110/15 kV 25 MVA Yd11",
        "params": {
            "rated_power_mva": 25.0,
            "voltage_hv_kv": 110.0,
            "voltage_lv_kv": 15.0,
            "uk_percent": 11.0,
            "pk_kw": 120.0,
            "i0_percent": 0.35,
            "p0_kw": 25.0,
            "vector_group": "Yd11",
            "cooling_class": "ONAN",
            "tap_min": -5,
            "tap_max": 5,
            "tap_step_percent": 2.5,
            "manufacturer": "ZREW Transformatory",
            "standard": "PN-EN 60076-1:2011",
            "verification_status": "NIEWERYFIKOWANY",
            "catalog_status": "REFERENCYJNY_V1",
            "source_reference": "Deklarowane: PN-EN 60076-1:2011 / ZREW Transformatory specyfikacja typ T-42"
            + _SUFIKS_ZRODLA_ISTNIEJACEGO,
            "contract_version": "2.0",
            "verification_note": NOTA_JEDNOSTKA_ISTNIEJACA_WN_SN,
        },
    },
    {
        "id": "tr-wn-sn-110-15-40mva-yd11",
        "name": "TR 110/15 kV 40 MVA Yd11",
        "params": {
            "rated_power_mva": 40.0,
            "voltage_hv_kv": 110.0,
            "voltage_lv_kv": 15.0,
            "uk_percent": 11.5,
            "pk_kw": 175.0,
            "i0_percent": 0.3,
            "p0_kw": 35.0,
            "vector_group": "Yd11",
            "cooling_class": "ONAN/ONAF",
            "tap_min": -5,
            "tap_max": 5,
            "tap_step_percent": 2.5,
            "manufacturer": "ZREW Transformatory",
            "standard": "PN-EN 60076-1:2011",
            "verification_status": "NIEWERYFIKOWANY",
            "catalog_status": "REFERENCYJNY_V1",
            "source_reference": "Deklarowane: PN-EN 60076-1:2011 / ZREW Transformatory specyfikacja typ T-42"
            + _SUFIKS_ZRODLA_ISTNIEJACEGO,
            "contract_version": "2.0",
            "verification_note": NOTA_JEDNOSTKA_ISTNIEJACA_WN_SN,
        },
    },
    {
        "id": "tr-wn-sn-110-15-63mva-yd11",
        "name": "TR 110/15 kV 63 MVA Yd11",
        "params": {
            "rated_power_mva": 63.0,
            "voltage_hv_kv": 110.0,
            "voltage_lv_kv": 15.0,
            "uk_percent": 12.0,
            "pk_kw": 260.0,
            "i0_percent": 0.25,
            "p0_kw": 50.0,
            "vector_group": "Yd11",
            "cooling_class": "ONAF",
            "tap_min": -5,
            "tap_max": 5,
            "tap_step_percent": 2.5,
            "manufacturer": "ZREW Transformatory",
            "standard": "PN-EN 60076-1:2011",
            "verification_status": "NIEWERYFIKOWANY",
            "catalog_status": "REFERENCYJNY_V1",
            "source_reference": "Deklarowane: PN-EN 60076-1:2011 / ZREW Transformatory specyfikacja typ T-42"
            + _SUFIKS_ZRODLA_ISTNIEJACEGO,
            "contract_version": "2.0",
            "verification_note": NOTA_JEDNOSTKA_ISTNIEJACA_WN_SN,
        },
    },
]


# =============================================================================
# TRANSFORMATORY WN/SN (110/20 kV) — Yd11
# Zrodlo: PN-EN 60076-1:2011 / ZREW Transformatory specyfikacja typ T-42
# =============================================================================

TRANSFORMER_WN_SN_110_20: list[dict[str, Any]] = [
    {
        "id": "tr-wn-sn-110-20-10mva-yd11",
        "name": "TR 110/20 kV 10 MVA Yd11",
        "params": {
            "rated_power_mva": 10.0,
            "voltage_hv_kv": 110.0,
            "voltage_lv_kv": 20.0,
            "uk_percent": 10.0,
            "pk_kw": 60.0,
            "i0_percent": 0.5,
            "p0_kw": 13.0,
            "vector_group": "Yd11",
            "cooling_class": "ONAN",
            "tap_min": -5,
            "tap_max": 5,
            "tap_step_percent": 2.5,
            "manufacturer": "ZREW Transformatory",
            "standard": "PN-EN 60076-1:2011",
            "verification_status": "NIEWERYFIKOWANY",
            "catalog_status": "REFERENCYJNY_V1",
            "source_reference": "Deklarowane: PN-EN 60076-1:2011 / ZREW Transformatory specyfikacja typ T-42"
            + _SUFIKS_ZRODLA_ISTNIEJACEGO,
            "contract_version": "2.0",
            "verification_note": NOTA_JEDNOSTKA_ISTNIEJACA_WN_SN,
        },
    },
    {
        "id": "tr-wn-sn-110-20-16mva-yd11",
        "name": "TR 110/20 kV 16 MVA Yd11",
        "params": {
            "rated_power_mva": 16.0,
            "voltage_hv_kv": 110.0,
            "voltage_lv_kv": 20.0,
            "uk_percent": 10.5,
            "pk_kw": 85.0,
            "i0_percent": 0.4,
            "p0_kw": 18.0,
            "vector_group": "Yd11",
            "cooling_class": "ONAN",
            "tap_min": -5,
            "tap_max": 5,
            "tap_step_percent": 2.5,
            "manufacturer": "ZREW Transformatory",
            "standard": "PN-EN 60076-1:2011",
            "verification_status": "NIEWERYFIKOWANY",
            "catalog_status": "REFERENCYJNY_V1",
            "source_reference": "Deklarowane: PN-EN 60076-1:2011 / ZREW Transformatory specyfikacja typ T-42"
            + _SUFIKS_ZRODLA_ISTNIEJACEGO,
            "contract_version": "2.0",
            "verification_note": NOTA_JEDNOSTKA_ISTNIEJACA_WN_SN,
        },
    },
    {
        "id": "tr-wn-sn-110-20-25mva-yd11",
        "name": "TR 110/20 kV 25 MVA Yd11",
        "params": {
            "rated_power_mva": 25.0,
            "voltage_hv_kv": 110.0,
            "voltage_lv_kv": 20.0,
            "uk_percent": 11.0,
            "pk_kw": 120.0,
            "i0_percent": 0.35,
            "p0_kw": 25.0,
            "vector_group": "Yd11",
            "cooling_class": "ONAN",
            "tap_min": -5,
            "tap_max": 5,
            "tap_step_percent": 2.5,
            "manufacturer": "ZREW Transformatory",
            "standard": "PN-EN 60076-1:2011",
            "verification_status": "NIEWERYFIKOWANY",
            "catalog_status": "REFERENCYJNY_V1",
            "source_reference": "Deklarowane: PN-EN 60076-1:2011 / ZREW Transformatory specyfikacja typ T-42"
            + _SUFIKS_ZRODLA_ISTNIEJACEGO,
            "contract_version": "2.0",
            "verification_note": NOTA_JEDNOSTKA_ISTNIEJACA_WN_SN,
        },
    },
    {
        "id": "tr-wn-sn-110-20-40mva-yd11",
        "name": "TR 110/20 kV 40 MVA Yd11",
        "params": {
            "rated_power_mva": 40.0,
            "voltage_hv_kv": 110.0,
            "voltage_lv_kv": 20.0,
            "uk_percent": 11.5,
            "pk_kw": 175.0,
            "i0_percent": 0.3,
            "p0_kw": 35.0,
            "vector_group": "Yd11",
            "cooling_class": "ONAN/ONAF",
            "tap_min": -5,
            "tap_max": 5,
            "tap_step_percent": 2.5,
            "manufacturer": "ZREW Transformatory",
            "standard": "PN-EN 60076-1:2011",
            "verification_status": "NIEWERYFIKOWANY",
            "catalog_status": "REFERENCYJNY_V1",
            "source_reference": "Deklarowane: PN-EN 60076-1:2011 / ZREW Transformatory specyfikacja typ T-42"
            + _SUFIKS_ZRODLA_ISTNIEJACEGO,
            "contract_version": "2.0",
            "verification_note": NOTA_JEDNOSTKA_ISTNIEJACA_WN_SN,
        },
    },
    {
        "id": "tr-wn-sn-110-20-63mva-yd11",
        "name": "TR 110/20 kV 63 MVA Yd11",
        "params": {
            "rated_power_mva": 63.0,
            "voltage_hv_kv": 110.0,
            "voltage_lv_kv": 20.0,
            "uk_percent": 12.0,
            "pk_kw": 260.0,
            "i0_percent": 0.25,
            "p0_kw": 50.0,
            "vector_group": "Yd11",
            "cooling_class": "ONAF",
            "tap_min": -5,
            "tap_max": 5,
            "tap_step_percent": 2.5,
            "manufacturer": "ZREW Transformatory",
            "standard": "PN-EN 60076-1:2011",
            "verification_status": "NIEWERYFIKOWANY",
            "catalog_status": "REFERENCYJNY_V1",
            "source_reference": "Deklarowane: PN-EN 60076-1:2011 / ZREW Transformatory specyfikacja typ T-42"
            + _SUFIKS_ZRODLA_ISTNIEJACEGO,
            "contract_version": "2.0",
            "verification_note": NOTA_JEDNOSTKA_ISTNIEJACA_WN_SN,
        },
    },
]


# =============================================================================
# TRANSFORMATORY SN/nN (15/0.4 kV) — Dyn11
# Zrodlo: PN-EN 60076-11:2004 Tabl.A + Rozporzadzenie UE 2019/1783 Tier 2
#         ABB katalog dystrybucyjny RESIBLOC / Trafo Zywiec
# Obejmuje pelny typoszereg: 63, 100, 160, 250, 400, 630, 1000, 1250, 1600, 2000, 2500 kVA
# =============================================================================

TRANSFORMER_SN_NN_15_04_DYN11: list[dict[str, Any]] = [
    {
        "id": "tr-sn-nn-15-04-63kva-dyn11",
        "name": "TR 15/0.4 kV 63 kVA Dyn11",
        "params": {
            "rated_power_mva": 0.063,
            "voltage_hv_kv": 15.0,
            "voltage_lv_kv": 0.4,
            "uk_percent": 4.0,
            "pk_kw": 1.35,
            "i0_percent": 2.8,
            "p0_kw": 0.20,
            "vector_group": "Dyn11",
            "cooling_class": "ONAN",
            "tap_min": -2,
            "tap_max": 2,
            "tap_step_percent": 2.5,
            "manufacturer": "ABB",
            "standard": "PN-EN 60076-11:2004",
            "verification_status": "NIEWERYFIKOWANY",
            "catalog_status": "REFERENCYJNY_V1",
            "source_reference": "Deklarowane: PN-EN 60076-11:2004 Tabl.A / ABB RESIBLOC katalog"
            + _SUFIKS_ZRODLA_ISTNIEJACEGO,
            "contract_version": "2.0",
            "verification_note": NOTA_JEDNOSTKA_ISTNIEJACA_SN_NN,
        },
    },
    {
        "id": "tr-sn-nn-15-04-100kva-dyn11",
        "name": "TR 15/0.4 kV 100 kVA Dyn11",
        "params": {
            "rated_power_mva": 0.100,
            "voltage_hv_kv": 15.0,
            "voltage_lv_kv": 0.4,
            "uk_percent": 4.0,
            "pk_kw": 2.15,
            "i0_percent": 2.5,
            "p0_kw": 0.30,
            "vector_group": "Dyn11",
            "cooling_class": "ONAN",
            "tap_min": -2,
            "tap_max": 2,
            "tap_step_percent": 2.5,
            "manufacturer": "ABB",
            "standard": "PN-EN 60076-11:2004",
            "verification_status": "NIEWERYFIKOWANY",
            "catalog_status": "REFERENCYJNY_V1",
            "source_reference": "Deklarowane: PN-EN 60076-11:2004 Tabl.A / ABB RESIBLOC katalog"
            + _SUFIKS_ZRODLA_ISTNIEJACEGO,
            "contract_version": "2.0",
            "verification_note": NOTA_JEDNOSTKA_ISTNIEJACA_SN_NN,
        },
    },
    {
        "id": "tr-sn-nn-15-04-160kva-dyn11",
        "name": "TR 15/0.4 kV 160 kVA Dyn11",
        "params": {
            "rated_power_mva": 0.160,
            "voltage_hv_kv": 15.0,
            "voltage_lv_kv": 0.4,
            "uk_percent": 4.0,
            "pk_kw": 3.10,
            "i0_percent": 2.3,
            "p0_kw": 0.46,
            "vector_group": "Dyn11",
            "cooling_class": "ONAN",
            "tap_min": -2,
            "tap_max": 2,
            "tap_step_percent": 2.5,
            "manufacturer": "ABB",
            "standard": "PN-EN 60076-11:2004",
            "verification_status": "NIEWERYFIKOWANY",
            "catalog_status": "REFERENCYJNY_V1",
            "source_reference": "Deklarowane: PN-EN 60076-11:2004 Tabl.A / ABB RESIBLOC katalog"
            + _SUFIKS_ZRODLA_ISTNIEJACEGO,
            "contract_version": "2.0",
            "verification_note": NOTA_JEDNOSTKA_ISTNIEJACA_SN_NN,
        },
    },
    {
        "id": "tr-sn-nn-15-04-250kva-dyn11",
        "name": "TR 15/0.4 kV 250 kVA Dyn11",
        "params": {
            "rated_power_mva": 0.250,
            "voltage_hv_kv": 15.0,
            "voltage_lv_kv": 0.4,
            "uk_percent": 4.5,
            "pk_kw": 4.20,
            "i0_percent": 2.0,
            "p0_kw": 0.61,
            "vector_group": "Dyn11",
            "cooling_class": "ONAN",
            "tap_min": -2,
            "tap_max": 2,
            "tap_step_percent": 2.5,
            "manufacturer": "ABB",
            "standard": "PN-EN 60076-11:2004",
            "verification_status": "NIEWERYFIKOWANY",
            "catalog_status": "REFERENCYJNY_V1",
            "source_reference": "Deklarowane: PN-EN 60076-11:2004 Tabl.A / ABB RESIBLOC katalog"
            + _SUFIKS_ZRODLA_ISTNIEJACEGO,
            "contract_version": "2.0",
            "verification_note": NOTA_JEDNOSTKA_ISTNIEJACA_SN_NN,
        },
    },
    {
        "id": "tr-sn-nn-15-04-400kva-dyn11",
        "name": "TR 15/0.4 kV 400 kVA Dyn11",
        "params": {
            "rated_power_mva": 0.400,
            "voltage_hv_kv": 15.0,
            "voltage_lv_kv": 0.4,
            "uk_percent": 4.5,
            "pk_kw": 5.75,
            "i0_percent": 1.8,
            "p0_kw": 0.93,
            "vector_group": "Dyn11",
            "cooling_class": "ONAN",
            "tap_min": -2,
            "tap_max": 2,
            "tap_step_percent": 2.5,
            "manufacturer": "ABB",
            "standard": "PN-EN 60076-11:2004",
            "verification_status": "NIEWERYFIKOWANY",
            "catalog_status": "REFERENCYJNY_V1",
            "source_reference": "Deklarowane: PN-EN 60076-11:2004 Tabl.A / ABB RESIBLOC katalog"
            + _SUFIKS_ZRODLA_ISTNIEJACEGO,
            "contract_version": "2.0",
            "verification_note": NOTA_JEDNOSTKA_ISTNIEJACA_SN_NN,
        },
    },
    {
        "id": "tr-sn-nn-15-04-630kva-dyn11",
        "name": "TR 15/0.4 kV 630 kVA Dyn11",
        "params": {
            "rated_power_mva": 0.630,
            "voltage_hv_kv": 15.0,
            "voltage_lv_kv": 0.4,
            "uk_percent": 5.0,
            "pk_kw": 8.00,
            "i0_percent": 1.5,
            "p0_kw": 1.30,
            "vector_group": "Dyn11",
            "cooling_class": "ONAN",
            "tap_min": -2,
            "tap_max": 2,
            "tap_step_percent": 2.5,
            "manufacturer": "ABB",
            "standard": "PN-EN 60076-11:2004",
            "verification_status": "NIEWERYFIKOWANY",
            "catalog_status": "REFERENCYJNY_V1",
            "source_reference": "Deklarowane: PN-EN 60076-11:2004 Tabl.A / ABB RESIBLOC katalog"
            + _SUFIKS_ZRODLA_ISTNIEJACEGO,
            "contract_version": "2.0",
            "verification_note": NOTA_JEDNOSTKA_ISTNIEJACA_SN_NN,
        },
    },
    {
        "id": "tr-sn-nn-15-04-1000kva-dyn11",
        "name": "TR 15/0.4 kV 1000 kVA Dyn11",
        "params": {
            "rated_power_mva": 1.000,
            "voltage_hv_kv": 15.0,
            "voltage_lv_kv": 0.4,
            "uk_percent": 6.0,
            "pk_kw": 11.00,
            "i0_percent": 1.2,
            "p0_kw": 1.70,
            "vector_group": "Dyn11",
            "cooling_class": "ONAN",
            "tap_min": -2,
            "tap_max": 2,
            "tap_step_percent": 2.5,
            "manufacturer": "ABB",
            "standard": "PN-EN 60076-11:2004",
            "verification_status": "NIEWERYFIKOWANY",
            "catalog_status": "REFERENCYJNY_V1",
            "source_reference": "Deklarowane: PN-EN 60076-11:2004 Tabl.A / ABB RESIBLOC katalog"
            + _SUFIKS_ZRODLA_ISTNIEJACEGO,
            "contract_version": "2.0",
            "verification_note": NOTA_JEDNOSTKA_ISTNIEJACA_SN_NN,
        },
    },
    {
        "id": "tr-sn-nn-15-04-1250kva-dyn11",
        "name": "TR 15/0.4 kV 1250 kVA Dyn11",
        "params": {
            "rated_power_mva": 1.250,
            "voltage_hv_kv": 15.0,
            "voltage_lv_kv": 0.4,
            "uk_percent": 6.0,
            "pk_kw": 13.50,
            "i0_percent": 1.0,
            "p0_kw": 2.10,
            "vector_group": "Dyn11",
            "cooling_class": "ONAN",
            "tap_min": -2,
            "tap_max": 2,
            "tap_step_percent": 2.5,
            "manufacturer": "ABB",
            "standard": "PN-EN 60076-11:2004",
            "verification_status": "NIEWERYFIKOWANY",
            "catalog_status": "REFERENCYJNY_V1",
            "source_reference": "Deklarowane: PN-EN 60076-11:2004 Tabl.A / ABB RESIBLOC katalog"
            + _SUFIKS_ZRODLA_ISTNIEJACEGO,
            "contract_version": "2.0",
            "verification_note": NOTA_JEDNOSTKA_ISTNIEJACA_SN_NN,
        },
    },
    {
        "id": "tr-sn-nn-15-04-1600kva-dyn11",
        "name": "TR 15/0.4 kV 1600 kVA Dyn11",
        "params": {
            "rated_power_mva": 1.600,
            "voltage_hv_kv": 15.0,
            "voltage_lv_kv": 0.4,
            "uk_percent": 6.0,
            "pk_kw": 17.00,
            "i0_percent": 0.9,
            "p0_kw": 2.50,
            "vector_group": "Dyn11",
            "cooling_class": "ONAN",
            "tap_min": -2,
            "tap_max": 2,
            "tap_step_percent": 2.5,
            "manufacturer": "ABB",
            "standard": "PN-EN 60076-11:2004",
            "verification_status": "NIEWERYFIKOWANY",
            "catalog_status": "REFERENCYJNY_V1",
            "source_reference": "Deklarowane: PN-EN 60076-11:2004 Tabl.A / ABB RESIBLOC katalog"
            + _SUFIKS_ZRODLA_ISTNIEJACEGO,
            "contract_version": "2.0",
            "verification_note": NOTA_JEDNOSTKA_ISTNIEJACA_SN_NN,
        },
    },
    {
        "id": "tr-sn-nn-15-04-2000kva-dyn11",
        "name": "TR 15/0.4 kV 2000 kVA Dyn11",
        "params": {
            "rated_power_mva": 2.000,
            "voltage_hv_kv": 15.0,
            "voltage_lv_kv": 0.4,
            "uk_percent": 6.0,
            "pk_kw": 21.00,
            "i0_percent": 0.8,
            "p0_kw": 3.00,
            "vector_group": "Dyn11",
            "cooling_class": "ONAN/ONAF",
            "tap_min": -2,
            "tap_max": 2,
            "tap_step_percent": 2.5,
            "manufacturer": "ABB",
            "standard": "PN-EN 60076-11:2004",
            "verification_status": "NIEWERYFIKOWANY",
            "catalog_status": "REFERENCYJNY_V1",
            "source_reference": "Deklarowane: PN-EN 60076-11:2004 Tabl.A / ABB RESIBLOC katalog"
            + _SUFIKS_ZRODLA_ISTNIEJACEGO,
            "contract_version": "2.0",
            "verification_note": NOTA_JEDNOSTKA_ISTNIEJACA_SN_NN,
        },
    },
    {
        "id": "tr-sn-nn-15-04-2500kva-dyn11",
        "name": "TR 15/0.4 kV 2500 kVA Dyn11",
        "params": {
            "rated_power_mva": 2.500,
            "voltage_hv_kv": 15.0,
            "voltage_lv_kv": 0.4,
            "uk_percent": 6.0,
            "pk_kw": 26.00,
            "i0_percent": 0.7,
            "p0_kw": 3.70,
            "vector_group": "Dyn11",
            "cooling_class": "ONAF",
            "tap_min": -2,
            "tap_max": 2,
            "tap_step_percent": 2.5,
            "manufacturer": "ABB",
            "standard": "PN-EN 60076-11:2004",
            "verification_status": "NIEWERYFIKOWANY",
            "catalog_status": "REFERENCYJNY_V1",
            "source_reference": "Deklarowane: PN-EN 60076-11:2004 Tabl.A / ABB RESIBLOC katalog"
            + _SUFIKS_ZRODLA_ISTNIEJACEGO,
            "contract_version": "2.0",
            "verification_note": NOTA_JEDNOSTKA_ISTNIEJACA_SN_NN,
        },
    },
]


# =============================================================================
# TRANSFORMATORY SN/nN (20/0.4 kV) — Dyn11
# Zrodlo: PN-EN 60076-11:2004 / Trafo Zywiec / ABB katalog dystrybucyjny
# Obejmuje pelny typoszereg: 63, 100, 160, 250, 400, 630, 1000, 1250, 1600 kVA
# =============================================================================

TRANSFORMER_SN_NN_20_04_DYN11: list[dict[str, Any]] = [
    {
        "id": "tr-sn-nn-20-04-63kva-dyn11",
        "name": "TR 20/0.4 kV 63 kVA Dyn11",
        "params": {
            "rated_power_mva": 0.063,
            "voltage_hv_kv": 20.0,
            "voltage_lv_kv": 0.4,
            "uk_percent": 4.0,
            "pk_kw": 1.35,
            "i0_percent": 2.8,
            "p0_kw": 0.20,
            "vector_group": "Dyn11",
            "cooling_class": "ONAN",
            "tap_min": -2,
            "tap_max": 2,
            "tap_step_percent": 2.5,
            "manufacturer": "Trafo Zywiec",
            "standard": "PN-EN 60076-11:2004",
            "verification_status": "NIEWERYFIKOWANY",
            "catalog_status": "REFERENCYJNY_V1",
            "source_reference": "Deklarowane: PN-EN 60076-11:2004 Tabl.A / Trafo Zywiec katalog"
            + _SUFIKS_ZRODLA_ISTNIEJACEGO,
            "contract_version": "2.0",
            "verification_note": NOTA_JEDNOSTKA_ISTNIEJACA_SN_NN,
        },
    },
    {
        "id": "tr-sn-nn-20-04-100kva-dyn11",
        "name": "TR 20/0.4 kV 100 kVA Dyn11",
        "params": {
            "rated_power_mva": 0.100,
            "voltage_hv_kv": 20.0,
            "voltage_lv_kv": 0.4,
            "uk_percent": 4.0,
            "pk_kw": 2.15,
            "i0_percent": 2.5,
            "p0_kw": 0.30,
            "vector_group": "Dyn11",
            "cooling_class": "ONAN",
            "tap_min": -2,
            "tap_max": 2,
            "tap_step_percent": 2.5,
            "manufacturer": "ABB",
            "standard": "PN-EN 60076-11:2004",
            "verification_status": "NIEWERYFIKOWANY",
            "catalog_status": "REFERENCYJNY_V1",
            "source_reference": "Deklarowane: PN-EN 60076-11:2004 Tabl.A / ABB RESIBLOC katalog"
            + _SUFIKS_ZRODLA_ISTNIEJACEGO,
            "contract_version": "2.0",
            "verification_note": NOTA_JEDNOSTKA_ISTNIEJACA_SN_NN,
        },
    },
    {
        "id": "tr-sn-nn-20-04-160kva-dyn11",
        "name": "TR 20/0.4 kV 160 kVA Dyn11",
        "params": {
            "rated_power_mva": 0.160,
            "voltage_hv_kv": 20.0,
            "voltage_lv_kv": 0.4,
            "uk_percent": 4.0,
            "pk_kw": 3.10,
            "i0_percent": 2.3,
            "p0_kw": 0.46,
            "vector_group": "Dyn11",
            "cooling_class": "ONAN",
            "tap_min": -2,
            "tap_max": 2,
            "tap_step_percent": 2.5,
            "manufacturer": "Trafo Zywiec",
            "standard": "PN-EN 60076-11:2004",
            "verification_status": "NIEWERYFIKOWANY",
            "catalog_status": "REFERENCYJNY_V1",
            "source_reference": "Deklarowane: PN-EN 60076-11:2004 Tabl.A / Trafo Zywiec katalog"
            + _SUFIKS_ZRODLA_ISTNIEJACEGO,
            "contract_version": "2.0",
            "verification_note": NOTA_JEDNOSTKA_ISTNIEJACA_SN_NN,
        },
    },
    {
        "id": "tr-sn-nn-20-04-250kva-dyn11",
        "name": "TR 20/0.4 kV 250 kVA Dyn11",
        "params": {
            "rated_power_mva": 0.250,
            "voltage_hv_kv": 20.0,
            "voltage_lv_kv": 0.4,
            "uk_percent": 4.5,
            "pk_kw": 4.20,
            "i0_percent": 2.0,
            "p0_kw": 0.61,
            "vector_group": "Dyn11",
            "cooling_class": "ONAN",
            "tap_min": -2,
            "tap_max": 2,
            "tap_step_percent": 2.5,
            "manufacturer": "ABB",
            "standard": "PN-EN 60076-11:2004",
            "verification_status": "NIEWERYFIKOWANY",
            "catalog_status": "REFERENCYJNY_V1",
            "source_reference": "Deklarowane: PN-EN 60076-11:2004 Tabl.A / ABB RESIBLOC katalog"
            + _SUFIKS_ZRODLA_ISTNIEJACEGO,
            "contract_version": "2.0",
            "verification_note": NOTA_JEDNOSTKA_ISTNIEJACA_SN_NN,
        },
    },
    {
        "id": "tr-sn-nn-20-04-400kva-dyn11",
        "name": "TR 20/0.4 kV 400 kVA Dyn11",
        "params": {
            "rated_power_mva": 0.400,
            "voltage_hv_kv": 20.0,
            "voltage_lv_kv": 0.4,
            "uk_percent": 4.5,
            "pk_kw": 5.75,
            "i0_percent": 1.8,
            "p0_kw": 0.93,
            "vector_group": "Dyn11",
            "cooling_class": "ONAN",
            "tap_min": -2,
            "tap_max": 2,
            "tap_step_percent": 2.5,
            "manufacturer": "ABB",
            "standard": "PN-EN 60076-11:2004",
            "verification_status": "NIEWERYFIKOWANY",
            "catalog_status": "REFERENCYJNY_V1",
            "source_reference": "Deklarowane: PN-EN 60076-11:2004 Tabl.A / ABB RESIBLOC katalog"
            + _SUFIKS_ZRODLA_ISTNIEJACEGO,
            "contract_version": "2.0",
            "verification_note": NOTA_JEDNOSTKA_ISTNIEJACA_SN_NN,
        },
    },
    {
        "id": "tr-sn-nn-20-04-630kva-dyn11",
        "name": "TR 20/0.4 kV 630 kVA Dyn11",
        "params": {
            "rated_power_mva": 0.630,
            "voltage_hv_kv": 20.0,
            "voltage_lv_kv": 0.4,
            "uk_percent": 5.0,
            "pk_kw": 8.00,
            "i0_percent": 1.5,
            "p0_kw": 1.30,
            "vector_group": "Dyn11",
            "cooling_class": "ONAN",
            "tap_min": -2,
            "tap_max": 2,
            "tap_step_percent": 2.5,
            "manufacturer": "ABB",
            "standard": "PN-EN 60076-11:2004",
            "verification_status": "NIEWERYFIKOWANY",
            "catalog_status": "REFERENCYJNY_V1",
            "source_reference": "Deklarowane: PN-EN 60076-11:2004 Tabl.A / ABB RESIBLOC katalog"
            + _SUFIKS_ZRODLA_ISTNIEJACEGO,
            "contract_version": "2.0",
            "verification_note": NOTA_JEDNOSTKA_ISTNIEJACA_SN_NN,
        },
    },
    {
        "id": "tr-sn-nn-20-04-1000kva-dyn11",
        "name": "TR 20/0.4 kV 1000 kVA Dyn11",
        "params": {
            "rated_power_mva": 1.000,
            "voltage_hv_kv": 20.0,
            "voltage_lv_kv": 0.4,
            "uk_percent": 6.0,
            "pk_kw": 11.00,
            "i0_percent": 1.2,
            "p0_kw": 1.70,
            "vector_group": "Dyn11",
            "cooling_class": "ONAN",
            "tap_min": -2,
            "tap_max": 2,
            "tap_step_percent": 2.5,
            "manufacturer": "ABB",
            "standard": "PN-EN 60076-11:2004",
            "verification_status": "NIEWERYFIKOWANY",
            "catalog_status": "REFERENCYJNY_V1",
            "source_reference": "Deklarowane: PN-EN 60076-11:2004 Tabl.A / ABB RESIBLOC katalog"
            + _SUFIKS_ZRODLA_ISTNIEJACEGO,
            "contract_version": "2.0",
            "verification_note": NOTA_JEDNOSTKA_ISTNIEJACA_SN_NN,
        },
    },
    {
        "id": "tr-sn-nn-20-04-1250kva-dyn11",
        "name": "TR 20/0.4 kV 1250 kVA Dyn11",
        "params": {
            "rated_power_mva": 1.250,
            "voltage_hv_kv": 20.0,
            "voltage_lv_kv": 0.4,
            "uk_percent": 6.0,
            "pk_kw": 13.50,
            "i0_percent": 1.0,
            "p0_kw": 2.10,
            "vector_group": "Dyn11",
            "cooling_class": "ONAN",
            "tap_min": -2,
            "tap_max": 2,
            "tap_step_percent": 2.5,
            "manufacturer": "ABB",
            "standard": "PN-EN 60076-11:2004",
            "verification_status": "NIEWERYFIKOWANY",
            "catalog_status": "REFERENCYJNY_V1",
            "source_reference": "Deklarowane: PN-EN 60076-11:2004 Tabl.A / ABB RESIBLOC katalog"
            + _SUFIKS_ZRODLA_ISTNIEJACEGO,
            "contract_version": "2.0",
            "verification_note": NOTA_JEDNOSTKA_ISTNIEJACA_SN_NN,
        },
    },
    {
        "id": "tr-sn-nn-20-04-1600kva-dyn11",
        "name": "TR 20/0.4 kV 1600 kVA Dyn11",
        "params": {
            "rated_power_mva": 1.600,
            "voltage_hv_kv": 20.0,
            "voltage_lv_kv": 0.4,
            "uk_percent": 6.0,
            "pk_kw": 17.00,
            "i0_percent": 0.9,
            "p0_kw": 2.50,
            "vector_group": "Dyn11",
            "cooling_class": "ONAN/ONAF",
            "tap_min": -2,
            "tap_max": 2,
            "tap_step_percent": 2.5,
            "manufacturer": "ABB",
            "standard": "PN-EN 60076-11:2004",
            "verification_status": "NIEWERYFIKOWANY",
            "catalog_status": "REFERENCYJNY_V1",
            "source_reference": "Deklarowane: PN-EN 60076-11:2004 Tabl.A / ABB RESIBLOC katalog"
            + _SUFIKS_ZRODLA_ISTNIEJACEGO,
            "contract_version": "2.0",
            "verification_note": NOTA_JEDNOSTKA_ISTNIEJACA_SN_NN,
        },
    },
]


# =============================================================================
# TRANSFORMATORY SN/nN — Yd11 (specjalne, wyzsze moce, bez punktu neutralnego)
# Zrodlo: PN-EN 60076-11:2004 / ABB katalog dystrybucyjny
# =============================================================================

TRANSFORMER_SN_NN_15_04_YD11: list[dict[str, Any]] = [
    {
        "id": "tr-sn-nn-15-04-630kva-yd11",
        "name": "TR 15/0.4 kV 630 kVA Yd11",
        "params": {
            "rated_power_mva": 0.630,
            "voltage_hv_kv": 15.0,
            "voltage_lv_kv": 0.4,
            "uk_percent": 5.0,
            "pk_kw": 8.00,
            "i0_percent": 1.5,
            "p0_kw": 1.30,
            "vector_group": "Yd11",
            "cooling_class": "ONAN",
            "tap_min": -2,
            "tap_max": 2,
            "tap_step_percent": 2.5,
            "manufacturer": "ABB",
            "standard": "PN-EN 60076-11:2004",
            "verification_status": "NIEWERYFIKOWANY",
            "catalog_status": "REFERENCYJNY_V1",
            "source_reference": "Deklarowane: PN-EN 60076-11:2004 Tabl.A / ABB RESIBLOC katalog"
            + _SUFIKS_ZRODLA_ISTNIEJACEGO,
            "contract_version": "2.0",
            "verification_note": NOTA_JEDNOSTKA_ISTNIEJACA_SN_NN,
        },
    },
    {
        "id": "tr-sn-nn-15-04-1000kva-yd11",
        "name": "TR 15/0.4 kV 1000 kVA Yd11",
        "params": {
            "rated_power_mva": 1.000,
            "voltage_hv_kv": 15.0,
            "voltage_lv_kv": 0.4,
            "uk_percent": 6.0,
            "pk_kw": 11.00,
            "i0_percent": 1.2,
            "p0_kw": 1.70,
            "vector_group": "Yd11",
            "cooling_class": "ONAN",
            "tap_min": -2,
            "tap_max": 2,
            "tap_step_percent": 2.5,
            "manufacturer": "ABB",
            "standard": "PN-EN 60076-11:2004",
            "verification_status": "NIEWERYFIKOWANY",
            "catalog_status": "REFERENCYJNY_V1",
            "source_reference": "Deklarowane: PN-EN 60076-11:2004 Tabl.A / ABB RESIBLOC katalog"
            + _SUFIKS_ZRODLA_ISTNIEJACEGO,
            "contract_version": "2.0",
            "verification_note": NOTA_JEDNOSTKA_ISTNIEJACA_SN_NN,
        },
    },
]


TRANSFORMER_SN_NN_20_04_YD11: list[dict[str, Any]] = [
    {
        "id": "tr-sn-nn-20-04-630kva-yd11",
        "name": "TR 20/0.4 kV 630 kVA Yd11",
        "params": {
            "rated_power_mva": 0.630,
            "voltage_hv_kv": 20.0,
            "voltage_lv_kv": 0.4,
            "uk_percent": 5.0,
            "pk_kw": 8.00,
            "i0_percent": 1.5,
            "p0_kw": 1.30,
            "vector_group": "Yd11",
            "cooling_class": "ONAN",
            "tap_min": -2,
            "tap_max": 2,
            "tap_step_percent": 2.5,
            "manufacturer": "ABB",
            "standard": "PN-EN 60076-11:2004",
            "verification_status": "NIEWERYFIKOWANY",
            "catalog_status": "REFERENCYJNY_V1",
            "source_reference": "Deklarowane: PN-EN 60076-11:2004 Tabl.A / ABB RESIBLOC katalog"
            + _SUFIKS_ZRODLA_ISTNIEJACEGO,
            "contract_version": "2.0",
            "verification_note": NOTA_JEDNOSTKA_ISTNIEJACA_SN_NN,
        },
    },
    {
        "id": "tr-sn-nn-20-04-1000kva-yd11",
        "name": "TR 20/0.4 kV 1000 kVA Yd11",
        "params": {
            "rated_power_mva": 1.000,
            "voltage_hv_kv": 20.0,
            "voltage_lv_kv": 0.4,
            "uk_percent": 6.0,
            "pk_kw": 11.00,
            "i0_percent": 1.2,
            "p0_kw": 1.70,
            "vector_group": "Yd11",
            "cooling_class": "ONAN",
            "tap_min": -2,
            "tap_max": 2,
            "tap_step_percent": 2.5,
            "manufacturer": "ABB",
            "standard": "PN-EN 60076-11:2004",
            "verification_status": "NIEWERYFIKOWANY",
            "catalog_status": "REFERENCYJNY_V1",
            "source_reference": "Deklarowane: PN-EN 60076-11:2004 Tabl.A / ABB RESIBLOC katalog"
            + _SUFIKS_ZRODLA_ISTNIEJACEGO,
            "contract_version": "2.0",
            "verification_note": NOTA_JEDNOSTKA_ISTNIEJACA_SN_NN,
        },
    },
]


# =============================================================================
# PROWENIENCJA KATALOGU TRANSFORMATOROW (karta KATALOG-KOMPLETNY-PROWENIENCJA, 2026-10-15)
# =============================================================================
#
# Kazda pozycja niesie zrodlo w polach metadanych katalogu (`source_reference`,
# `verification_status`, `catalog_status`, `verification_note`) — tych samych, ktore
# pokazuje karta techniczna UI (`KartaTechniczna.tsx`, sekcja „Pochodzenie danych").
# Trzy rodzaje proweniencji, rozpoznawalne po danych (bez osobnego mechanizmu):
#
# * KARTA PRODUCENTA — `verification_status = ZWERYFIKOWANY`, `source_reference` cytuje
#   dokument producenta (typ, numer, adres, data dostepu);
# * POZYCJA NORMATYWNA — `verification_status = REFERENCYJNY`, straty P0/Pk = PULAP Tier 2
#   rozporzadzenia (UE) 548/2014 w brzmieniu (UE) 2019/1783, u_k/i0/zaczepy = seria
#   Siemens GEAFOL (decyzja wlasciciela 2026-10-15: „normatywne teraz + karty producentow
#   pozniej"). To NIE jest egzemplarz producenta — pozycja producenta dochodzi pozniej jako
#   osobny rekord z karta PDF, bez zmiany tego mechanizmu;
# * JEDNOSTKA ISTNIEJACA / DANE NIEZWERYFIKOWANE — `verification_status = NIEWERYFIKOWANY`,
#   nota z `ZNACZNIK_PRZEKROCZENIA_TIER2`: straty przekraczaja pulap Tier 2, wiec pozycja
#   nie opisuje transformatora wprowadzanego dzis na rynek UE.
#
# Para predykatow (regula KLASA, NIE INSTANCJA pkt 3): znacznik przekroczenia w nocie
# i obliczona niezgodnosc z tabelami ponizej musza sie pokrywac w OBIE strony —
# pilnuje `tests/network_model/catalog/test_katalog_proweniencja_kompletnosc.py`.

#: Cytat rozporzadzenia — tabele I.1/I.2 (pulapy strat, Sr <= 3150 kVA) oraz I.4/I.5/I.7
#: (minimalny PEI dla Sr > 3150 kVA i transformatorow duzej mocy).
ZRODLO_TIER2 = (
    "Rozporządzenie Komisji (UE) nr 548/2014, załącznik I, w brzmieniu rozporządzenia "
    "(UE) 2019/1783 — Tier 2 (od 1.07.2021): tab. I.1 (olejowe) i I.2 (suche), "
    "pułapy strat P0 i Pk; tekst: https://www.legislation.gov.uk/eur/2014/548/annex/I "
    "(dostęp 2026-10-15)"
)

#: Cytat serii Siemens GEAFOL — zrodlo u_k, i0 i zakresu zaczepow pozycji normatywnych.
ZRODLO_GEAFOL_UK = (
    "Siemens AG, broszura „GEAFOL Neo / CARECO” MSDT201901 (2019), tabela „Selection of "
    "ordering data for Standard 20kV/22kV/24kV” (str. 7): u_k 6 % dla 200–2500 kVA, "
    "8 % dla 3150 kVA (przypisanie u_k z kolumny scalonej do wierszy jest interpretacją "
    "układu tabeli), prąd jałowy i0 z kolumny „No-load Current”, zaczepy ±2×2,5 %; "
    "https://assets.new.siemens.com/siemens/assets/api/uuid:87d559ac-1ef0-4230-bff6-"
    "8ecd2897827a/gzbianyaqi.pdf (dostęp 2026-10-15)"
)

#: Tab. I.1 (olejowe, Um <= 24 kV / Um <= 1,1 kV), kolumny Tier 2: S_r [kVA] -> (Pk, P0) [W].
#: Wiersz „<= 25" zapisany jako 25. P0 dla 1600 kVA = 1080 W (A0 - 10 % z 1200 W; pierwotny
#: tekst 2014 mial blad „180", poprawiony rozporzadzeniem 2019/1783).
TIER2_OLEJOWE_PK_P0_W: dict[int, tuple[float, float]] = {
    25: (600.0, 63.0),
    50: (750.0, 81.0),
    100: (1250.0, 130.0),
    160: (1750.0, 189.0),
    250: (2350.0, 270.0),
    315: (2800.0, 324.0),
    400: (3250.0, 387.0),
    500: (3900.0, 459.0),
    630: (4600.0, 540.0),
    800: (6000.0, 585.0),
    1000: (7600.0, 693.0),
    1250: (9500.0, 855.0),
    1600: (12000.0, 1080.0),
    2000: (15000.0, 1305.0),
    2500: (18500.0, 1575.0),
    3150: (23000.0, 1980.0),
}

#: Tab. I.2 (suche, Um <= 24 kV / Um <= 1,1 kV), kolumny Tier 2. Wiersz „<= 50" jako 50.
TIER2_SUCHE_PK_P0_W: dict[int, tuple[float, float]] = {
    50: (1500.0, 180.0),
    100: (1800.0, 252.0),
    160: (2600.0, 360.0),
    250: (3400.0, 468.0),
    400: (4500.0, 675.0),
    630: (7100.0, 990.0),
    800: (8000.0, 1170.0),
    1000: (9000.0, 1395.0),
    1250: (11000.0, 1620.0),
    1600: (13000.0, 1980.0),
    2000: (16000.0, 2340.0),
    2500: (19000.0, 2790.0),
    3150: (22000.0, 3420.0),
}

#: Tab. I.7 (olejowe duzej mocy, Um > 36 kV), Tier 2: S_r [MVA] -> minimalny PEI [%].
TIER2_PEI_OLEJOWE_DUZEJ_MOCY_PROC: dict[float, float] = {
    0.025: 98.251,
    0.05: 98.891,
    0.1: 99.093,
    0.16: 99.191,
    0.25: 99.283,
    0.315: 99.320,
    0.4: 99.369,
    0.5: 99.398,
    0.63: 99.437,
    0.8: 99.473,
    1.0: 99.484,
    1.25: 99.487,
    1.6: 99.494,
    2.0: 99.502,
    2.5: 99.514,
    3.15: 99.518,
    4.0: 99.532,
    5.0: 99.548,
    6.3: 99.571,
    8.0: 99.593,
    10.0: 99.615,
    12.5: 99.640,
    16.0: 99.663,
    20.0: 99.684,
    25.0: 99.700,
    31.5: 99.712,
    40.0: 99.724,
    50.0: 99.734,
    63.0: 99.745,
    80.0: 99.758,
    100.0: 99.770,
    125.0: 99.780,
    160.0: 99.790,
    200.0: 99.797,
}

#: Seria Siemens GEAFOL 20/22/24 kV (broszura MSDT201901, str. 7): S_r [kVA] ->
#: (u_k [%], i0 [%]). u_k z kolumny scalonej (6 % dla 200–2500, 8 % dla 3150).
GEAFOL_24KV_UK_I0_PROC: dict[int, tuple[float, float]] = {
    200: (6.0, 0.8),
    250: (6.0, 0.8),
    315: (6.0, 0.8),
    400: (6.0, 0.8),
    500: (6.0, 0.8),
    630: (6.0, 0.6),
    800: (6.0, 0.6),
    1000: (6.0, 0.6),
    1250: (6.0, 0.6),
    1600: (6.0, 0.6),
    2000: (6.0, 0.5),
    2500: (6.0, 0.5),
    3150: (8.0, 0.4),
}

RODZAJ_OLEJOWY = "olejowy"
RODZAJ_SUCHY = "suchy"

_TABELA_TIER2_WG_RODZAJU: dict[str, dict[int, tuple[float, float]]] = {
    RODZAJ_OLEJOWY: TIER2_OLEJOWE_PK_P0_W,
    RODZAJ_SUCHY: TIER2_SUCHE_PK_P0_W,
}
_NUMER_TABELI_TIER2: dict[str, str] = {RODZAJ_OLEJOWY: "I.1", RODZAJ_SUCHY: "I.2"}
_CHLODZENIE_WG_RODZAJU: dict[str, str] = {RODZAJ_OLEJOWY: "ONAN", RODZAJ_SUCHY: "AN"}


def rodzaj_izolacji_transformatora(cooling_class: str | None) -> str | None:
    """Rodzaj izolacji z oznaczenia chlodzenia IEC 60076-2/-11 (pierwsza litera).

    ``O``/``K``/``L`` — ciecz izolacyjna (olej mineralny, ciecz o wysokim punkcie zaplonu)
    => tab. I.1; ``A`` — powietrze (transformator suchy) => tab. I.2. Brak oznaczenia ->
    ``None`` (rodzaju nie da sie odczytac, nic nie jest zgadywane).
    """
    if not cooling_class:
        return None
    pierwsza = cooling_class.strip().upper()[:1]
    if pierwsza in {"O", "K", "L"}:
        return RODZAJ_OLEJOWY
    if pierwsza == "A":
        return RODZAJ_SUCHY
    return None


def pulap_strat_tier2_w(rodzaj: str, moc_kva: float) -> tuple[float, float] | None:
    """Pulap (Pk, P0) [W] wg tab. I.1/I.2 Tier 2 dla mocy z zakresu tabeli.

    Przypis „a" tabel: moce posrednie — interpolacja liniowa. Wiersz najnizszy tabeli
    („<= 25"/„<= 50") obejmuje moce mniejsze. Moc > 3150 kVA lezy poza tab. I.1/I.2
    (wymaganie PEI) -> ``None``.
    """
    tabela = _TABELA_TIER2_WG_RODZAJU[rodzaj]
    moce = sorted(tabela)
    if moc_kva > moce[-1]:
        return None
    if moc_kva <= moce[0]:
        return tabela[moce[0]]
    for dolna, gorna in zip(moce, moce[1:], strict=False):
        if dolna <= moc_kva <= gorna:
            udzial = (moc_kva - dolna) / (gorna - dolna)
            pk_d, p0_d = tabela[dolna]
            pk_g, p0_g = tabela[gorna]
            return (pk_d + udzial * (pk_g - pk_d), p0_d + udzial * (p0_g - p0_d))
    return None  # nieosiagalne: przedzial pokryty petla


def _w_na_kw_bez_przekroczenia(wartosc_w: float) -> float:
    """[W] -> [kW] z zaokragleniem W DOL do 0,1 W — pulap Tier 2 to wartosc MAKSYMALNA,
    wiec zapis interpolowanego pulapu nie moze go przekroczyc nawet o ulamek wata."""
    return math.floor(wartosc_w * 10.0 + 1e-9) / 10000.0


def _token(value: float) -> str:
    return f"{value:g}".replace(".", "p")



#: Dane i0 dla referencyjnych modeli olejowych — z katalogow OLEJOWYCH.
#: BEZ ecoFIT2, 2025, s. 5, Um <= 24 (25) kV: 250/400/630/800/1000/
#: 1250/1600/2000/2500/3150 kVA. Brakujace moce 315/500: karty EG System.
#: Wartosci sa przeniesione do modelu NORMATYWNEGO (P0/Pk Tier2, uk GEAFOL).
#: Nie sa deklaracja parametrow jednego wyrobu ani pomiarem konkretnego typu.
ZRODLO_I0_OLEJ_BEZ = (
    "BEZ Transformátory ecoFIT², LIQUID-FILLED MEDIUM POWER TRANSFORMERS,"
    " 2025, s. 5, Um <= 24(25) kV, No-load current I0 (%);"
    " https://www.bez.sk/wp-content/uploads/2025/04/"
    "BEZ_OIL_transformers_catalogue_05_2025_ENG.pdf (dostęp 2026-10-30)"
)
ZRODLO_I0_OLEJ_EG_315 = (
    "EG System, EG-TO-0315-24-P-K, 315 kVA 21/0,8 kV Dyn5, i0 = 0,8 %;"
    " https://www.egsystem-sklep.pl/images/karty-katalogowe-trafo-olej-JAN25/"
    "EG-TO-0315-24-P-K-21-08_E2.pdf (dostęp 2026-10-30)"
)
ZRODLO_I0_OLEJ_EG_500 = (
    "EG System, EG-TO-0500-17-P-K, 500 kVA 15,75/0,42 kV Dyn5, i0 = 0,6 %;"
    " https://www.egsystem-sklep.pl/images/karty-katalogowe-trafo-olej-JAN25/"
    "EG-TO-0500-17-P-K-1575-042_E2.pdf (dostęp 2026-10-30)"
)
I0_OLEJOWE_REFERENCYJNE_PROC: dict[int, float] = {
    250: 0.45,
    315: 0.8,
    400: 0.4,
    500: 0.6,
    630: 0.3,
    800: 0.25,
    1000: 0.2,
    1250: 0.17,
    1600: 0.15,
    2000: 0.13,
    2500: 0.13,
    3150: 0.13,
}


def zrodlo_referencyjnego_i0_olejowego(moc_kva: int) -> str:
    if moc_kva == 315:
        return ZRODLO_I0_OLEJ_EG_315
    if moc_kva == 500:
        return ZRODLO_I0_OLEJ_EG_500
    return ZRODLO_I0_OLEJ_BEZ


def _pozycja_normatywna(
    *,
    item_id: str,
    name: str,
    moc_kva: int,
    hv_kv: float,
    lv_kv: float,
    rodzaj: str,
) -> dict[str, Any]:
    """Pozycja NORMATYWNA: straty = pulap Tier 2, u_k/zaczepy = GEAFOL; i0 = GEAFOL lub BEZ/EG.

    i0: suche z GEAFOL; olejowe z katalogow BEZ/EG dla tej samej mocy,
    ale innego modelu. Wszystkie pozycje normatywne sa REFERENCYJNE.
    """
    pulap = pulap_strat_tier2_w(rodzaj, float(moc_kva))
    if pulap is None:
        raise ValueError(f"{item_id}: moc {moc_kva} kVA poza tab. I.1/I.2 — brak pułapu strat")
    pk_w, p0_w = pulap
    uk_proc, geafol_i0 = GEAFOL_24KV_UK_I0_PROC[moc_kva]
    i0_proc = (
        geafol_i0 if rodzaj == RODZAJ_SUCHY
        else I0_OLEJOWE_REFERENCYJNE_PROC[moc_kva]
    )
    zrodlo_i0 = (
        ZRODLO_GEAFOL_UK if rodzaj == RODZAJ_SUCHY
        else zrodlo_referencyjnego_i0_olejowego(moc_kva)
    )
    tabela = _NUMER_TABELI_TIER2[rodzaj]
    return {
        "id": item_id,
        "name": name,
        "params": {
            "rated_power_mva": kva_na_mva(moc_kva),
            "voltage_hv_kv": hv_kv,
            "voltage_lv_kv": lv_kv,
            "uk_percent": uk_proc,
            "pk_kw": _w_na_kw_bez_przekroczenia(pk_w),
            "i0_percent": i0_proc,
            "p0_kw": _w_na_kw_bez_przekroczenia(p0_w),
            "vector_group": "Dyn11",
            "cooling_class": _CHLODZENIE_WG_RODZAJU[rodzaj],
            "tap_min": -2,
            "tap_max": 2,
            "tap_step_percent": 2.5,
            "standard": "UE 548/2014 (2019/1783) Tier 2",
            "verification_status": "REFERENCYJNY",
            "catalog_status": "REFERENCYJNY_V1",
            "source_reference": (
                f"{ZRODLO_TIER2} || u_k i zaczepy: {ZRODLO_GEAFOL_UK}"
                f" || i0 ({rodzaj}): {zrodlo_i0}"
            ),
            "contract_version": "2.0",
            "verification_note": (
                f"Pozycja NORMATYWNA/TYPOWA — nie egzemplarz producenta. Transformator "
                f"{rodzaj} {moc_kva} kVA: Pk = {pk_w:.1f} W i P0 = {p0_w:.1f} W to pułap "
                f"Tier 2 z tab. {tabela}"
                + (
                    " (interpolacja liniowa wg przypisu a tabeli)"
                    if moc_kva not in (_TABELA_TIER2_WG_RODZAJU[rodzaj])
                    else ""
                )
                + f"; u_k = {uk_proc:g} % z serii Siemens GEAFOL 20/22/24 kV"
                + (
                    f", i0 = {i0_proc:g} % z tej samej serii (suchej)"
                    if rodzaj == RODZAJ_SUCHY
                    else f", i0 = {i0_proc:g} % z ODRĘBNEJ serii transformatorów olejowych"
                )
                + "; model referencyjny z różnych źródeł, nie tabliczka jednego wyrobu"
                + (
                    "; dla 315/500 kVA karta źródłowa ma INNĄ przekładnię i grupę"
                    if rodzaj == RODZAJ_OLEJOWY and moc_kva in (315, 500)
                    else ""
                )
                + ". Dla HV 15 kV przyjęto serię Um 24 kV (tab. I.1/I.2 obejmuje Um ≤ 24 kV "
                "łącznie). Pozycję producenta dopisuje się osobnym rekordem z karty PDF."
            ),
        },
    }


# =============================================================================
# TRANSFORMATORY SN/nN 15/0,4 i 20/0,4 kV — NORMATYWNE Tier 2 (nowe projekty)
# =============================================================================

#: Moce serii normatywnej 0,4 kV: wiersze serii GEAFOL (zrodlo u_k) od 250 kVA. Moce
#: < 200 kVA (63/100/160) NIE maja zrodla u_k (seria GEAFOL 24 kV zaczyna sie od 200 kVA)
#: — pozostaja wylacznie jako jednostki istniejace (ponizej), bez pozycji normatywnej.
_MOCE_NORMATYWNE_04_KVA: tuple[int, ...] = (
    250,
    315,
    400,
    500,
    630,
    800,
    1000,
    1250,
    1600,
    2000,
    2500,
    3150,
)

TRANSFORMER_SN_NN_04_TIER2: list[dict[str, Any]] = [
    _pozycja_normatywna(
        item_id=f"tr-sn-nn-{_token(_hv)}-04-{_moc}kva-dyn11-tier2-"
        + ("olej" if _rodzaj == RODZAJ_OLEJOWY else "suchy"),
        name=f"TR {_hv:g}/0.4 kV {_moc} kVA Dyn11 {_rodzaj} — normatywny Tier 2",
        moc_kva=_moc,
        hv_kv=_hv,
        lv_kv=0.4,
        rodzaj=_rodzaj,
    )
    for _hv in (15.0, 20.0)
    for _rodzaj in (RODZAJ_OLEJOWY, RODZAJ_SUCHY)
    for _moc in _MOCE_NORMATYWNE_04_KVA
]


# =============================================================================
# TRANSFORMATORY BLOKOWE ZRODEL PRZEKSZTALTNIKOWYCH PV / BESS / FW (nN/SN)
# =============================================================================
#
# Art. 1 ust. 2 lit. b rozporzadzenia 548/2014: wylaczenie transformatorow
# prostownikowych „nie obejmuje transformatorow ... dla zastosowan w turbinach wiatrowych
# i fotowoltaice" — transformator blokowy PV/FW podlega Tier 2 tak jak dystrybucyjny.
#
# Napiecia strony nN: napiecia wyjsciowe falownikow z kart producentow w katalogu
# przeksztaltnikow (0,385 kV — SMA SC 2200; 0,434 kV — SMA SC 2475; 0,48 kV — Tesla
# Megapack 2 XL; 0,65 kV — strona sieci przeksztaltnika Vestas V112, General Specification
# 0011-9181 i 0034-7282 tab. 3-2; 0,69 kV — typowe wyjscie turbin i PCS; 0,8 kV — Huawei
# SUN2000-330KTL-H1) oraz napiecia referencyjnych
# modeli obliczeniowych (0,5 i 1,0 kV). Wszystkie <= 1,1 kV, wiec tab. I.2 bez korekty I.3.
# Wykonanie suche (zywiczne): jedyna karta producenta transformatora blokowego w zrodlach
# (Siemens Energy GEAFOL Neo 2000 kVA 20/0,48 kV, nizej) jest sucha, a seria zrodlowa
# u_k/i0 (GEAFOL) jest sucha — pozycja olejowa nie mialaby zrodla i0.
#
# Moce > 3150 kVA (dawne 4,0/5,0 MVA): rozporzadzenie podaje dla nich tylko minimalny PEI
# (tab. I.4/I.5), z ktorego P0 i Pk osobno wyznaczyc sie nie da — pozycji brak (zablokowane
# danymi). Transformatory blokowe turbin Vestas V112 (3450 kVA 10–35/0,65 kV Dyn5 — dok.
# 0011-9181 tab. 3-3; 3750 kVA 11,1–22/0,65 kV Dyn5 — dok. 0034-7282 tab. 3-3) maja
# w dokumentach u_k i straty, ale zgodnosci z Tier 2 powyzej 3150 kVA (minimalny PEI
# tab. I.5) nie da sie ocenic bez tabeli, ktorej repozytorium nie cytuje, a 4000 kVA
# 0,65/33 kV (deklaracja DNV V112-3.45) nie podaje u_k ani strat i ma 33 kV — pozycji
# brak (zablokowane danymi). Strona dolna SN (dawne 3,15/6,0/6,3 kV): pulapy P0/Pk dalyby sie wyznaczyc
# (tab. I.3: +10 % P0, +10 % Pk dla drugiego uzwojenia Um > 1,1 kV), ale zadne zrodlo
# w materialach nie podaje u_k ani i0 transformatora SN/SN (seria GEAFOL obejmuje tylko
# strone nN; IEC 60076-5 tab. 1 nieodczytana) — pozycji brak (zablokowane danymi), zamiast
# dawnego szacunku bez zrodla.

_NAPIECIA_NN_BLOKOWYCH_KV: tuple[float, ...] = (0.385, 0.434, 0.48, 0.5, 0.65, 0.69, 0.8, 1.0)
_MOCE_BLOKOWYCH_KVA: tuple[int, ...] = (500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150)


def _etykieta_mocy(moc_kva: int) -> str:
    return f"{moc_kva} kVA" if moc_kva < 1000 else f"{kva_na_mva(moc_kva):g} MVA"


TRANSFORMER_SN_NN_INVERTER_BLOCK: list[dict[str, Any]] = [
    _pozycja_normatywna(
        item_id=(
            f"tr-sn-nn-{_token(_hv)}-{_token(_lv)}-{_token(kva_na_mva(_moc))}mva-dyn11-inverter"
        ),
        name=(
            f"TR {_hv:g}/{_lv:g} kV {_etykieta_mocy(_moc)} Dyn11 PV/BESS/FW "
            "suchy — normatywny Tier 2"
        ),
        moc_kva=_moc,
        hv_kv=_hv,
        lv_kv=_lv,
        rodzaj=RODZAJ_SUCHY,
    )
    for _hv in (15.0, 20.0)
    for _lv in _NAPIECIA_NN_BLOKOWYCH_KV
    for _moc in _MOCE_BLOKOWYCH_KVA
]


# =============================================================================
# KARTY PRODUCENTOW TRANSFORMATOROW
# =============================================================================

TRANSFORMER_KARTY_PRODUCENTOW: list[dict[str, Any]] = [
    {
        "id": "tr-sn-nn-20-0p48-2mva-dyn11-siemens-geafol-neo-4gy6364",
        "name": "Siemens Energy GEAFOL Neo 4GY6364-1EC 2000 kVA 20/0.48 kV Dyn11 (suchy)",
        "params": {
            "rated_power_mva": 2.0,
            "voltage_hv_kv": 20.0,
            "voltage_lv_kv": 0.48,
            "uk_percent": 6.0,
            # Pk120 gwarantowane (temperatura odniesienia klasy F wg IEC 60076-11).
            "pk_kw": 16.0,
            # Karta Neo nie podaje i0. GEAFOL 24 kV to inna seria:
            # pole jest referencyjne, NIE gwarantowane dla tego typu.
            "i0_percent": GEAFOL_24KV_UK_I0_PROC[2000][1],
            "p0_kw": 2.34,
            "vector_group": "Dyn11",
            "cooling_class": "AN",
            # Zaczepy karty: „±2,5; ±5 %" => -2..+2 po 2,5 %.
            "tap_min": -2,
            "tap_max": 2,
            "tap_step_percent": 2.5,
            "manufacturer": "Siemens Energy",
            "standard": "IEC 60076-11:2018; UE 548/2014 (2019/1783)",
            "verification_status": "ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "source_reference": (
                "Siemens Energy, „Product information requirements according to Commission "
                "Regulation (EU) No 548/2014”, typ 4GY6364-1EC (Sr. B382978), GEAFOL Neo, "
                "Budapeszt, grudzień 2025; https://assets.siemens-energy.com/dam/"
                "21d60220-d7c1-473c-8eef-b3db0095a922/GEAFOL-Distribution-Transformer-"
                "Information-acc--to-EU-Regulation-548-2014-pdf_Original%20file.pdf "
                "(dostęp 2026-10-15); i0 referencyjny z INNEJ serii: "
                + ZRODLO_GEAFOL_UK
            ),
            "contract_version": "2.0",
            "verification_note": (
                "Karta producenta: Sr = 2000 kVA, Dyn11, U1 = 20 000 V, U2 = 480 V, chłodzenie "
                "AN; P0 = 2340 W gwarantowane (1974 W zmierzone); Pk120 = 16 000 W "
                "gwarantowane (15 174 W zmierzone; Pk75 = 14 000 W); u_k = 6 % ±10 %; "
                "zaczepy ±2,5; ±5 %. Prąd jałowy i0 = 0,5 % z INNEJ serii "
                "GEAFOL 24 kV (REFERENCYJNY, nie pomiar/gwarancja Neo). "
                "Wartości gwarantowane P0/Pk równe pułapowi Tier 2 tab. I.2 dla 2000 kVA."
            ),
        },
    },
]


# =============================================================================
# FUNKCJE DOSTEPU
# =============================================================================


def get_all_transformer_types() -> list[dict[str, Any]]:
    """Zwraca wszystkie typy transformatorow w katalogu."""
    return TRANSFORMER_WN_SN_110_15 + TRANSFORMER_WN_SN_110_20 + get_sn_nn_transformer_types()


def get_wn_sn_transformer_types() -> list[dict[str, Any]]:
    """Zwraca transformatory WN/SN (110/15 kV i 110/20 kV)."""
    return TRANSFORMER_WN_SN_110_15 + TRANSFORMER_WN_SN_110_20


def get_sn_nn_transformer_types() -> list[dict[str, Any]]:
    """Zwraca transformatory SN/nN: jednostki istniejace, normatywne Tier 2, blokowe
    PV/BESS/FW (normatywne) i pozycje z kart producentow."""
    return (
        TRANSFORMER_SN_NN_15_04_DYN11
        + TRANSFORMER_SN_NN_20_04_DYN11
        + TRANSFORMER_SN_NN_15_04_YD11
        + TRANSFORMER_SN_NN_20_04_YD11
        + TRANSFORMER_SN_NN_04_TIER2
        + TRANSFORMER_SN_NN_INVERTER_BLOCK
        + TRANSFORMER_KARTY_PRODUCENTOW
        + TRANSFORMER_POLISH_PTPIRE
    )


def get_transformer_catalog_statistics() -> dict[str, Any]:
    """Zwraca statystyki katalogu transformatorow (wszystko wyprowadzone z rekordow)."""
    all_types = get_all_transformer_types()
    wn_sn = get_wn_sn_transformer_types()
    sn_nn = get_sn_nn_transformer_types()

    vector_groups = sorted({t["params"]["vector_group"] for t in all_types})
    power_ratings = sorted({t["params"]["rated_power_mva"] for t in all_types})
    napiecia = sorted(
        {(t["params"]["voltage_hv_kv"], t["params"]["voltage_lv_kv"]) for t in all_types}
    )

    return {
        "liczba_transformatorow_ogolem": len(all_types),
        "liczba_wn_sn": len(wn_sn),
        "liczba_sn_nn": len(sn_nn),
        "statusy_weryfikacji": sorted({t["params"]["verification_status"] for t in all_types}),
        "statusy_katalogowe": sorted({t["params"]["catalog_status"] for t in all_types}),
        "grupy_polaczen": vector_groups,
        "moce_znamionowe_mva": power_ratings,
        "producenci": sorted(
            {str(t["params"]["manufacturer"]) for t in all_types if t["params"].get("manufacturer")}
        ),
        "napiecia_wn_sn": [
            f"{hv:g}/{lv:g} kV"
            for hv, lv in napiecia
            if (hv, lv)
            in {(t["params"]["voltage_hv_kv"], t["params"]["voltage_lv_kv"]) for t in wn_sn}
        ],
        "napiecia_sn_nn": [
            f"{hv:g}/{lv:g} kV"
            for hv, lv in napiecia
            if (hv, lv)
            in {(t["params"]["voltage_hv_kv"], t["params"]["voltage_lv_kv"]) for t in sn_nn}
        ],
    }


def get_transformer_catalog_quality_summary() -> dict[str, Any]:
    """Zwraca jawne metadane jakosci dla katalogu transformatorow."""
    all_types = get_all_transformer_types()
    verified = sum(
        1 for item in all_types if item["params"]["verification_status"] == "ZWERYFIKOWANY"
    )
    unverified = sum(
        1 for item in all_types if item["params"]["verification_status"] == "NIEWERYFIKOWANY"
    )

    return {
        "liczba_transformatorow_ogolem": len(all_types),
        "liczba_zweryfikowanych": verified,
        "liczba_nieweryfikowanych": unverified,
        "statusy_weryfikacji": sorted({t["params"]["verification_status"] for t in all_types}),
        "statusy_katalogowe": sorted({t["params"]["catalog_status"] for t in all_types}),
        "contract_version": "2.0",
    }


# =============================================================================
# K30-18: TRANSFORMATORY SN/NN — POZYCJE Z DEKLAROWANYCH KATALOGOW POLSKICH PRODUCENTOW
# =============================================================================
#
# PROWENIENCJA (karta KATALOG-KOMPLETNY-PROWENIENCJA, pomiar 2026-10-15). Pozycje deklarowaly
# zrodlo „katalog <producenta> 2024", status ZWERYFIKOWANY, zgodnosc z Tier 2 rozporzadzenia
# (UE) 2019/1783 i certyfikat PTPiREE. Pomiar wzgledem tab. I.1/I.2 Tier 2: KAZDA z tych
# pozycji przekracza pulap strat jalowych (np. ZPUE TZH 630 kVA: P0 = 0,81 kW > 0,54 kW),
# wiec deklaracja zgodnosci jest sprzeczna z wlasnymi liczbami, a zaden z dokumentow nie
# jest dolaczony do repozytorium. Status sprowadzony do prawdy: NIEWERYFIKOWANY, znacznik
# przekroczenia w nocie, bez deklaracji Tier 2 i bez flagi certyfikatu PTPiREE (nie ma
# dokumentu, ktory by ja potwierdzal). Liczby zostaja — sa jedynym sladem deklarowanego
# zrodla i nie wolno ich „poprawic" bez karty producenta.


def _polish_transformer(
    item_id: str,
    name: str,
    manufacturer: str,
    rated_kva: int,
    uk_percent: float,
    pk_kw: float,
    p0_kw: float,
    i0_percent: float,
    *,
    voltage_hv_kv: float = 15.0,
    voltage_lv_kv: float = 0.4,
    vector_group: str,
    series: str = "",
    source_reference: str,
    cooling_class: str = "ONAN",
) -> dict[str, Any]:
    return {
        "id": item_id,
        "name": name,
        "params": {
            "rated_power_mva": kva_na_mva(rated_kva),
            "voltage_hv_kv": voltage_hv_kv,
            "voltage_lv_kv": voltage_lv_kv,
            "uk_percent": uk_percent,
            "pk_kw": pk_kw,
            "i0_percent": i0_percent,
            "p0_kw": p0_kw,
            "vector_group": vector_group,
            "cooling_class": cooling_class,
            "tap_min": -2,
            "tap_max": 2,
            "tap_step_percent": 2.5,
            "manufacturer": manufacturer,
            "series": series,
            "standard": "PN-EN 60076-1",
            "verification_status": "NIEWERYFIKOWANY",
            "catalog_status": "REFERENCYJNY_V1",
            "source_reference": (
                f"Deklarowane: {source_reference} — dokument nie jest dołączony do "
                "repozytorium i nie został odnaleziony (niezweryfikowany)"
            ),
            "contract_version": "2.0",
            "verification_note": (
                f"{ZNACZNIK_PRZEKROCZENIA_TIER2} (UE 548/2014 w brzmieniu 2019/1783, "
                "tab. I.1/I.2): deklaracja zgodności z Tier 2 sprzeczna z wartościami strat "
                "— dane niezweryfikowane; dla nowych projektów pozycje normatywne Tier 2."
            ),
        },
    }


TRANSFORMER_POLISH_PTPIRE: list[dict[str, Any]] = [
    # WZL Kedzierzyn-Kozle — rodzina TPMnR (Transformator Przemyslowy MnR)
    _polish_transformer(
        "wzl-tpmnr-250-15-04",
        "WZL TPMnR 250 kVA 15/0.4 kV Dyn11",
        "WZL Kędzierzyn-Koźle",
        rated_kva=250,
        uk_percent=4.0,
        pk_kw=3.25,
        p0_kw=0.43,
        i0_percent=2.0,
        series="TPMnR",
        source_reference="WZL Kędzierzyn-Koźle katalog TPMnR 2024",
        vector_group="Dyn11",
    ),
    _polish_transformer(
        "wzl-tpmnr-400-15-04",
        "WZL TPMnR 400 kVA 15/0.4 kV Dyn11",
        "WZL Kędzierzyn-Koźle",
        rated_kva=400,
        uk_percent=4.0,
        pk_kw=4.6,
        p0_kw=0.61,
        i0_percent=1.6,
        series="TPMnR",
        source_reference="WZL Kędzierzyn-Koźle katalog TPMnR 2024",
        vector_group="Dyn11",
    ),
    _polish_transformer(
        "wzl-tpmnr-630-15-04",
        "WZL TPMnR 630 kVA 15/0.4 kV Dyn11",
        "WZL Kędzierzyn-Koźle",
        rated_kva=630,
        uk_percent=4.0,
        pk_kw=6.3,
        p0_kw=0.85,
        i0_percent=1.3,
        series="TPMnR",
        source_reference="WZL Kędzierzyn-Koźle katalog TPMnR 2024",
        vector_group="Dyn11",
    ),
    _polish_transformer(
        "wzl-tpmnr-1000-15-04",
        "WZL TPMnR 1000 kVA 15/0.4 kV Dyn11",
        "WZL Kędzierzyn-Koźle",
        rated_kva=1000,
        uk_percent=6.0,
        pk_kw=9.0,
        p0_kw=1.25,
        i0_percent=1.1,
        series="TPMnR",
        source_reference="WZL Kędzierzyn-Koźle katalog TPMnR 2024",
        vector_group="Dyn11",
    ),
    _polish_transformer(
        "wzl-tpmnr-1600-15-04",
        "WZL TPMnR 1600 kVA 15/0.4 kV Dyn11",
        "WZL Kędzierzyn-Koźle",
        rated_kva=1600,
        uk_percent=6.0,
        pk_kw=13.5,
        p0_kw=1.85,
        i0_percent=0.9,
        series="TPMnR",
        source_reference="WZL Kędzierzyn-Koźle katalog TPMnR 2024",
        vector_group="Dyn11",
    ),
    # ZPUE Trafo Wloszczowa — TZH/TZE hermetyczne
    _polish_transformer(
        "zpue-tzh-100-15-04",
        "ZPUE TZH 100 kVA 15/0.4 kV Dyn11 (hermetyczny)",
        "ZPUE Trafo Włoszczowa",
        rated_kva=100,
        uk_percent=4.0,
        pk_kw=1.75,
        p0_kw=0.21,
        i0_percent=2.5,
        series="TZH",
        source_reference="ZPUE Trafo katalog TZH/TZE 2024 / PTPiRE WiPWC",
        vector_group="Dyn11",
    ),
    _polish_transformer(
        "zpue-tzh-250-15-04",
        "ZPUE TZH 250 kVA 15/0.4 kV Dyn11 (hermetyczny)",
        "ZPUE Trafo Włoszczowa",
        rated_kva=250,
        uk_percent=4.0,
        pk_kw=3.10,
        p0_kw=0.40,
        i0_percent=2.0,
        series="TZH",
        source_reference="ZPUE Trafo katalog TZH/TZE 2024 / PTPiRE WiPWC",
        vector_group="Dyn11",
    ),
    _polish_transformer(
        "zpue-tzh-400-15-04",
        "ZPUE TZH 400 kVA 15/0.4 kV Dyn11 (hermetyczny)",
        "ZPUE Trafo Włoszczowa",
        rated_kva=400,
        uk_percent=4.0,
        pk_kw=4.40,
        p0_kw=0.59,
        i0_percent=1.6,
        series="TZH",
        source_reference="ZPUE Trafo katalog TZH/TZE 2024 / PTPiRE WiPWC",
        vector_group="Dyn11",
    ),
    _polish_transformer(
        "zpue-tzh-630-15-04",
        "ZPUE TZH 630 kVA 15/0.4 kV Dyn11 (hermetyczny)",
        "ZPUE Trafo Włoszczowa",
        rated_kva=630,
        uk_percent=4.0,
        pk_kw=6.10,
        p0_kw=0.81,
        i0_percent=1.3,
        series="TZH",
        source_reference="ZPUE Trafo katalog TZH/TZE 2024 / PTPiRE WiPWC",
        vector_group="Dyn11",
    ),
    _polish_transformer(
        "zpue-tzh-1000-15-04",
        "ZPUE TZH 1000 kVA 15/0.4 kV Dyn11 (hermetyczny)",
        "ZPUE Trafo Włoszczowa",
        rated_kva=1000,
        uk_percent=6.0,
        pk_kw=8.70,
        p0_kw=1.20,
        i0_percent=1.1,
        series="TZH",
        source_reference="ZPUE Trafo katalog TZH/TZE 2024 / PTPiRE WiPWC",
        vector_group="Dyn11",
    ),
    # Energen Polska — TONr suche zywiczne
    _polish_transformer(
        "energen-tonr-630-15-04",
        "Energen TONr 630 kVA 15/0.4 kV Dyn11 (suchy)",
        "Energen Polska",
        rated_kva=630,
        uk_percent=6.0,
        pk_kw=6.50,
        p0_kw=1.20,
        i0_percent=1.4,
        series="TONr",
        source_reference="Energen Polska katalog TONr 2024 / IEC 60076-11",
        vector_group="Dyn11",
        cooling_class="AN",
    ),
    _polish_transformer(
        "energen-tonr-1000-15-04",
        "Energen TONr 1000 kVA 15/0.4 kV Dyn11 (suchy)",
        "Energen Polska",
        rated_kva=1000,
        uk_percent=6.0,
        pk_kw=9.40,
        p0_kw=1.70,
        i0_percent=1.2,
        series="TONr",
        source_reference="Energen Polska katalog TONr 2024 / IEC 60076-11",
        vector_group="Dyn11",
        cooling_class="AN",
    ),
    _polish_transformer(
        "energen-tonr-1600-15-04",
        "Energen TONr 1600 kVA 15/0.4 kV Dyn11 (suchy)",
        "Energen Polska",
        rated_kva=1600,
        uk_percent=6.0,
        pk_kw=13.0,
        p0_kw=2.40,
        i0_percent=1.0,
        series="TONr",
        source_reference="Energen Polska katalog TONr 2024 / IEC 60076-11",
        vector_group="Dyn11",
        cooling_class="AN",
    ),
    # Trafocomp - typowe rozmiary
    _polish_transformer(
        "trafocomp-t-160-15-04",
        "Trafocomp T 160 kVA 15/0.4 kV Dyn11",
        "Trafocomp",
        rated_kva=160,
        uk_percent=4.0,
        pk_kw=2.4,
        p0_kw=0.30,
        i0_percent=2.3,
        series="T",
        source_reference="Trafocomp katalog 2024",
        vector_group="Dyn11",
    ),
    _polish_transformer(
        "trafocomp-t-400-15-04",
        "Trafocomp T 400 kVA 15/0.4 kV Dyn11",
        "Trafocomp",
        rated_kva=400,
        uk_percent=4.0,
        pk_kw=4.5,
        p0_kw=0.60,
        i0_percent=1.6,
        series="T",
        source_reference="Trafocomp katalog 2024",
        vector_group="Dyn11",
    ),
    _polish_transformer(
        "trafocomp-t-1000-15-04",
        "Trafocomp T 1000 kVA 15/0.4 kV Dyn11",
        "Trafocomp",
        rated_kva=1000,
        uk_percent=6.0,
        pk_kw=9.0,
        p0_kw=1.25,
        i0_percent=1.1,
        series="T",
        source_reference="Trafocomp katalog 2024",
        vector_group="Dyn11",
    ),
]
