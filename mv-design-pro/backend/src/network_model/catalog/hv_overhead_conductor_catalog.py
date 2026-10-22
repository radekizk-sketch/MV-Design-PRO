"""Katalog przewodów linii napowietrznych 110 kV (karta LINIA-110, przestrzeń PRZEWOD_LINII_WN).

PO CO. Standard ENEA Operator „Elektroenergetyczne linie napowietrzne i kablowe 110 kV”
(wersja 06.2026, obowiązuje od 01.10.2026; SHA-256 pobranego PDF
``8aacbe4ab5bbd8094363003227c4316f7c1c700eaff8dd5b71d90e827b85670e``) w §4.1 (s. 9–10/40)
wymaga przewodów fazowych ACSR (AFL) 240 mm² — drutów aluminiowych A1 na rdzeniu stalowym wg
PN-EN 50182 — „o parametrach nie gorszych niż 243-AL1/39-ST1A”, projektowanych na temperaturę
+80 °C. W §4.2 wymaga przewodu odgromowego (OPGW 48J). R, X i B linii dla składowej zgodnej
i zerowej każe wyznaczać obliczeniowo dla projektu (§7.1 lit. j, s. 34/40) — dlatego typ
katalogowy niesie DANE WYROBU, a parametry linii liczy solver
``network_model.solvers.parametry_linii_napowietrznej`` z geometrii słupa.

ŹRÓDŁO DANYCH WYROBU. PN-EN 50182 (EN 50182:2001), tablica przewodów AL1/ST1A stosowanych
w Niemczech — odczyt z przedruku tablicy normy: Lumpi-Berndorf, „Overhead line conductors
EN 50182”, wydanie 2 / wrzesień 2015, s. 9/26, „Characteristics of aluminium conductors steel
reinforced used in Germany – Type AL1/ST1A, Technical data according to EN50182/2001”
(SHA-256 PDF ``8639b51fdc0eda1b552636ccf394485eb865c2b1ed95d76758437d66fefcca32``); wiersz
243-AL1/39-ST1A potwierdzony drugim przedrukiem (tablica EN 50182:2001 typ A1/ST1A, Lumino
Industries: d = 21,80 mm, R = 0,1188 Ω/km). Numer tablicy w tekście PN-EN 50182 nie jest
zweryfikowany (norma płatna, brak tekstu w repo) — stąd status CZESCIOWO_ZWERYFIKOWANY.

Obciążalność z tej samej tablicy (uwaga 3 tablicy): wiatr 0,6 m/s, promieniowanie słoneczne,
temperatura otoczenia 35 °C, temperatura przewodu 80 °C, do 60 Hz.

WARTOŚCI SPOZA TABLICY (każda z podstawą):
  * α = 0,004 1/K — IEC 60909-0:2016, wzór R_L(θ_e) (miedź, aluminium i stopy aluminium);
    ta sama wartość co ``application/solvers/lv_temperature_correction.py``;
  * temperatura dopuszczalna długotrwale 80 °C — standard ENEA linii 110 kV §4.1;
  * temperatura graniczna przy zwarciu 200 °C i jej odniesienie — ta sama para co przewody
    AFL linii SN (``mv_cable_line_catalog.TEMP_SHORT_CIRCUIT_OHL_AL_ST_C``);
  * Jth(1 s) = 84 A/mm² — wzór IEC 60949 §3 (Al: K = 148 A·√s/mm², β = 228 K) dla pary
    80 → 200 °C daje k = 148·√ln(428/308) = 84,89; katalog trzyma wartość zaokrągloną W DÓŁ
    (konwencja ``mv_cable_line_catalog``: nigdy optymistycznie; test
    ``test_line_thermal_chain``);
  * GMR — tablica go nie podaje (``gmr_mm`` = ``None``), solver wyznacza go z budowy
    (warstwy 10 + 16 drutów Al dla budowy 26/7, 12 dla 12/7; średnica rdzenia 7-drutowego =
    3·średnica drutu stalowego).

PRZEWÓD ODGROMOWY. Standard ENEA podaje dla OPGW 48J wyłącznie dane mechaniczne i cieplne
(RTS 51 kN, 6,5 kA / 1 s) — bez rezystancji i budowy, więc OPGW nie ma tu rekordu (zero
fabrykacji). Katalog niesie przewód stalowo-aluminiowy 97-AL1/56-ST1A (95/55) z tej samej
tablicy PN-EN 50182 jako typ przewodu odgromowego, który projektant może wskazać, i który
rejestr wartości roboczych proponuje jako ZAŁOŻENIE INŻYNIERSKIE zastępujące OPGW, gdy projekt
nie wskazuje przewodu odgromowego (``wartosci_robocze`` — rodzina linii 110 kV).
"""

from __future__ import annotations

from typing import Any

from .mv_cable_line_catalog import OHL_THERMAL_SOURCE_REFERENCE, TEMP_SHORT_CIRCUIT_OHL_AL_ST_C
from .types import CATALOG_CONTRACT_VERSION, CatalogStatus, CatalogVerificationStatus

#: Odniesienie źródłowe danych wyrobu (pole ``source_reference`` rekordu — widoczne w UI).
ZRODLO_PN_EN_50182_AL1_ST1A = (
    "PN-EN 50182 (EN 50182:2001) — tablica przewodów AL1/ST1A stosowanych w Niemczech; odczyt "
    "z przedruku Lumpi-Berndorf „Overhead line conductors EN 50182”, wyd. 2/09.2015, s. 9/26"
)
UWAGA_WERYFIKACJI = (
    "Dane tablicowe potwierdzone dwoma przedrukami tablicy EN 50182:2001; numer tablicy "
    "w tekście PN-EN 50182 niezweryfikowany (brak tekstu normy w repozytorium)."
)
#: Temperatura dopuszczalna długotrwale przewodu linii 110 kV [°C] — standard ENEA §4.1.
TEMPERATURA_PRZEWODU_110KV_C = 80.0
#: Temperaturowy współczynnik rezystancji aluminium [1/K] — IEC 60909-0:2016, wzór R_L(θ_e).
ALFA_ALUMINIUM_1_PER_K = 0.004
#: Jth(1 s) przewodu AFL dla pary 80 → 200 °C [A/mm²] — IEC 60949 §3, zaokrąglone w dół.
JTH_AL_ST_OHL_80C = 84.0
NAPIECIE_ZNAMIONOWE_SIECI_KV = 110.0

#: Identyfikator przewodu fazowego wymaganego przez standard ENEA linii 110 kV (§4.1).
ID_AFL6_240 = "przewod-wn-243-al1-39-st1a"
#: Identyfikator przewodu odgromowego katalogu (zastępnik OPGW w wartości roboczej).
ID_ODGROMOWY_95_55 = "przewod-wn-97-al1-56-st1a"


def _rekord(
    *,
    item_id: str,
    name: str,
    oznaczenie: str,
    przeznaczenie: str,
    przekroj_al_mm2: float,
    przekroj_st_mm2: float,
    warstwy_al: tuple[int, ...],
    liczba_drutow_st: int,
    d_al_mm: float,
    d_st_mm: float,
    d_rdzenia_mm: float,
    d_mm: float,
    masa_kg_per_km: float,
    wytrzymalosc_kn: float,
    r20_ohm_per_km: float,
    prad_a: float | None,
) -> dict[str, Any]:
    params: dict[str, Any] = {
        "oznaczenie": oznaczenie,
        "przeznaczenie": przeznaczenie,
        "conductor_material": "AL_ST",
        "cross_section_mm2": przekroj_al_mm2,
        "przekroj_stali_mm2": przekroj_st_mm2,
        "srednica_mm": d_mm,
        "warstwy_al": list(warstwy_al),
        "liczba_drutow_st": liczba_drutow_st,
        "srednica_drutu_al_mm": d_al_mm,
        "srednica_drutu_st_mm": d_st_mm,
        "srednica_rdzenia_mm": d_rdzenia_mm,
        "r20_dc_ohm_per_km": r20_ohm_per_km,
        "alfa_1_per_k": ALFA_ALUMINIUM_1_PER_K,
        "masa_kg_per_km": masa_kg_per_km,
        "wytrzymalosc_kn": wytrzymalosc_kn,
        "voltage_rating_kv": NAPIECIE_ZNAMIONOWE_SIECI_KV,
        "max_temperature_c": TEMPERATURA_PRZEWODU_110KV_C,
        "rated_current_a": prad_a,
        "jth_1s_a_per_mm2": JTH_AL_ST_OHL_80C,
        "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_OHL_AL_ST_C,
        "thermal_source_reference": OHL_THERMAL_SOURCE_REFERENCE,
        "standard": "PN-EN 50182",
        "source_reference": ZRODLO_PN_EN_50182_AL1_ST1A,
        "verification_status": CatalogVerificationStatus.CZESCIOWO_ZWERYFIKOWANY.value,
        "catalog_status": CatalogStatus.PRODUKCYJNY_V1.value,
        "contract_version": CATALOG_CONTRACT_VERSION,
        "verification_note": UWAGA_WERYFIKACJI,
    }
    return {"id": item_id, "name": name, "params": params}


def get_all_overhead_conductor_types() -> list[dict[str, Any]]:
    """Surowe rekordy (id/name/params) — kolejność stała (determinizm)."""
    return [
        _rekord(
            item_id="przewod-wn-184-al1-30-st1a",
            name="AFL-6 185 mm² (184-AL1/30-ST1A)",
            oznaczenie="184-AL1/30-ST1A",
            przeznaczenie="FAZOWY",
            przekroj_al_mm2=183.8,
            przekroj_st_mm2=29.8,
            warstwy_al=(10, 16),
            liczba_drutow_st=7,
            d_al_mm=3.00,
            d_st_mm=2.33,
            d_rdzenia_mm=6.99,
            d_mm=19.0,
            masa_kg_per_km=741.0,
            wytrzymalosc_kn=65.27,
            r20_ohm_per_km=0.1571,
            prad_a=535.0,
        ),
        _rekord(
            item_id=ID_AFL6_240,
            name="AFL-6 240 mm² (243-AL1/39-ST1A)",
            oznaczenie="243-AL1/39-ST1A",
            przeznaczenie="FAZOWY",
            przekroj_al_mm2=243.1,
            przekroj_st_mm2=39.5,
            warstwy_al=(10, 16),
            liczba_drutow_st=7,
            d_al_mm=3.45,
            d_st_mm=2.68,
            d_rdzenia_mm=8.04,
            d_mm=21.8,
            masa_kg_per_km=980.1,
            wytrzymalosc_kn=85.12,
            r20_ohm_per_km=0.1188,
            prad_a=645.0,
        ),
        _rekord(
            item_id="przewod-wn-304-al1-49-st1a",
            name="AFL-6 300 mm² (304-AL1/49-ST1A)",
            oznaczenie="304-AL1/49-ST1A",
            przeznaczenie="FAZOWY",
            przekroj_al_mm2=304.3,
            przekroj_st_mm2=49.5,
            warstwy_al=(10, 16),
            liczba_drutow_st=7,
            d_al_mm=3.86,
            d_st_mm=3.00,
            d_rdzenia_mm=9.00,
            d_mm=24.4,
            masa_kg_per_km=1227.3,
            wytrzymalosc_kn=105.09,
            r20_ohm_per_km=0.0949,
            prad_a=740.0,
        ),
        _rekord(
            item_id=ID_ODGROMOWY_95_55,
            name="Przewód odgromowy 95/55 mm² (97-AL1/56-ST1A)",
            oznaczenie="97-AL1/56-ST1A",
            przeznaczenie="ODGROMOWY",
            przekroj_al_mm2=96.5,
            przekroj_st_mm2=56.3,
            warstwy_al=(12,),
            liczba_drutow_st=7,
            d_al_mm=3.20,
            d_st_mm=3.20,
            d_rdzenia_mm=9.60,
            d_mm=16.0,
            masa_kg_per_km=706.8,
            wytrzymalosc_kn=77.85,
            r20_ohm_per_km=0.2992,
            prad_a=None,
        ),
    ]
