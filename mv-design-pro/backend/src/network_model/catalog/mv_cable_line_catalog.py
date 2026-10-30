"""
Katalog kabli SN i linii napowietrznych — dane elektryczne i cieplne.

ŹRÓDŁA DANYCH:
- Parametry elektryczne: katalogi producentów (NKT, Tele-Fonika), norma IEC 60287
- Parametry cieplne (jth): IEC 60949, PN-EN 60865-1

KONWENCJE:
- R20 [Ω/km] — rezystancja przy 20°C
- X [Ω/km] — reaktancja przy 50 Hz
- C [nF/km] — pojemność międzyfazowa
- jth [A/mm²] — gęstość prądu zwarciowego dla 1s
- Ith [A] — prąd zwarciowy dla 1s (= jth × przekrój)

MATERIAŁY:
- CU — miedź
- AL — aluminium
- AL_ST — aluminium-stal (ACSR/AFL)

IZOLACJE:
- XLPE — polietylen usieciowany (θmax = 90°C, θkz = 250°C)
- EPR — kauczuk etylenowo-propylenowy (θmax = 90°C, θkz = 250°C)
"""

import re
from collections import Counter
from typing import Any

from .types import (
    CATALOG_CONTRACT_VERSION,
    CatalogStatus,
    CatalogVerificationStatus,
)
from .wartosci_robocze import (
    KLUCZ_WARTOSCI_ROBOCZYCH_KATALOGU,
    ZALOZENIE_ITH_ZYLY_POWROTNEJ,
    ZALOZENIE_R0_TRZY_R1,
    ZALOZENIE_R0_ZYLA_POWROTNA,
    ZALOZENIE_R_ZYLY_POWROTNEJ,
    ZALOZENIE_X0_TRZY_X1,
)

# =============================================================================
# STAŁE MATERIAŁOWE — gęstość prądu zwarciowego jth dla 1s [A/mm²]
# =============================================================================

JTH_CU_XLPE = 143.0  # Miedź + XLPE (θb=90°C → θk=250°C)
JTH_AL_XLPE = 94.0  # Aluminium + XLPE (θb=90°C → θk=250°C)
JTH_CU_EPR = 143.0  # Miedź + EPR (θb=90°C → θk=250°C)
JTH_AL_EPR = 94.0  # Aluminium + EPR (θb=90°C → θk=250°C)
JTH_AL_OHL = 94.0  # Aluminium linie napowietrzne (AAC)
JTH_AL_ST_OHL = 88.0  # Aluminium-stal linie napowietrzne (ACSR/AFL)

# Temperatury GRANICZNE zyly przy zwarciu [°C] — druga polowa pary, ktora uzasadnia
# wartosci jth powyzej (komentarze „θb=90°C → θk=250°C" mowily o nich od poczatku,
# ale liczby nie byly danymi, tylko tekstem). Karta F-K1 faza 6: dowod obliczeniowy
# musi pokazac obie temperatury, bo bez nich nie da sie zweryfikowac k.
# Temperatura ROBOCZA zyly izolacji usieciowanej [°C] — pierwsza polowa pary (theta_b)
# do TEMP_SHORT_CIRCUIT_XLPE_C. Dana normowa dla ZADEKLAROWANEJ izolacji (IEC 60502-2),
# a nie wartosc typowa: katalog potwierdza ja jednoglosnie — wszystkie 37 typow XLPE i
# 18 typow EPR, ktore te temperature podaja, podaja 90 °C. Osiem typow polskich
# (YHAKXS/YHKXS) jej NIE podawalo, przez co kryterium IEC 60949 nie mialo pierwszej
# temperatury i konczylo sie brakiem werdyktu (V12K-225).
TEMP_OPERATING_XLPE_C = 90.0  # XLPE / EPR (IEC 60502-2)
TEMP_SHORT_CIRCUIT_XLPE_C = 250.0  # XLPE / EPR, izolacja usieciowana (IEC 60502-2)
TEMP_SHORT_CIRCUIT_PVC_C = 160.0  # PVC (IEC 60502-1 / PN-HD 60364-4-43 tab. 43A)

# Temperatura ROBOCZA przewodu golego linii napowietrznej [°C] — pierwsza polowa pary
# (theta_b). Rekordy linii niosly ja od poczatku w `max_temperature_c`; ta stala nazywa
# ja wprost, zeby domkniecie pary bylo czytelne.
TEMP_OPERATING_OHL_C = 70.0

# Temperatury GRANICZNE przy zwarciu dla przewodow GOLYCH linii napowietrznych [°C].
# Karta F-K1 faza 7. Dla przewodu golego granice wyznacza nie izolacja (jej nie ma),
# lecz utrata wytrzymalosci mechanicznej zyly i dopuszczalna temperatura osprzetu:
# - AAL/AAC (jednorodne aluminium, bez rdzenia stalowego) — 220 °C,
# - AFL/ACSR (aluminium na rdzeniu stalowym) — 200 °C, granica ostrzejsza z uwagi na
#   rdzen i zaciski.
# Te pary NIE sa dobrane dowolnie: podstawione do wzoru IEC 60949 §3 (Al: K = 148
# A·√s/mm², beta = 228 K) odtwarzaja stale JTH powyzej —
#   70 -> 220 °C daje k = 94,50 (katalog: 94,0),
#   70 -> 200 °C daje k = 89,05 (katalog: 88,0),
# a katalog trzyma wartosc ROWNA albo NIZSZA od wzorowej, czyli nigdy optymistyczna.
# Spojnosc pilnuje test `tests/network_model/solvers/test_line_thermal_chain.py`.
TEMP_SHORT_CIRCUIT_OHL_AL_C = 220.0  # AAL / AAC (PN-E-05115 / IEC 61936-1)
TEMP_SHORT_CIRCUIT_OHL_AL_ST_C = 200.0  # AFL / ACSR z rdzeniem stalowym

# Odniesienie normowe pary temperatur przewodu golego (do uzasadnienia k w dowodzie).
# UWAGA: ten napis TRAFIA DO UI (pole „Zrodlo" w dowodzie obliczeniowym), wiec ma
# polskie znaki — konwencja ASCII-PL obowiazuje w rejestrach i komentarzach, nigdy w
# tekstach widocznych dla projektanta.
OHL_THERMAL_SOURCE_REFERENCE = (
    "PN-E-05115 / IEC 61936-1 — temperatury graniczne przewodów gołych przy zwarciu; "
    "k wg IEC 60949 § 3"
)

LINE_SOURCE_REFERENCE = "PN-EN 50182 / IEC 61089 / katalogi rodzin AAL, AFL 6 i AFL 2 dla sieci SN"
CABLE_BASE_SOURCE_REFERENCE = (
    "IEC 60502-2 / IEC 60949 / matryca bazowych kabli SN 12/20 kV MV-DESIGN-PRO"
)
CABLE_MANUFACTURER_SOURCE_REFERENCE = (
    "IEC 60502-2 / karty katalogowe NKT i Tele-Fonika Kable dla rodzin SN"
)
ENEA_OPERATOR_CABLE_SOURCE_REFERENCE = (
    "ENEA Operator - standard projektowy kabli SN; parametry elektryczne z "
    "bazowej matrycy MV-DESIGN-PRO i kart producentów, do pełnej weryfikacji "
    "wymagane jest podpięcie aktualnego dokumentu standardu ENEA Operator"
)
CATALOG_TEST_SOURCE_REFERENCE = (
    "Rekord testowy MV-DESIGN-PRO - nie stosować w katalogu produkcyjnym"
)
#: Rezystywność ρ20 [Ω·mm²/km]: miedź wyżarzona 17,241 (IEC 60028, 1/58 Ω·mm²/m), aluminium
#: 28,264 (IEC 60889). Wartość ρ/S z przekroju ZNAMIONOWEGO jest założeniem (pozycja niesie
#: ``wartosci_robocze``), nie rezystancją żyły powrotnej z karty producenta.
RETURN_CONDUCTOR_RHO_OHM_MM2_PER_KM_20C = {
    "CU": 17.241,
    "AL": 28.264,
}
RETURN_CONDUCTOR_JTH_1S_A_PER_MM2 = {
    "CU": JTH_CU_XLPE,
    "AL": JTH_AL_XLPE,
}
RETURN_CONDUCTOR_SECTION_PATTERN = re.compile(
    r"(?:[13]\s*[x×]\s*)?(\d{2,4})\s*/\s*(\d{1,3})(?!\s*kV)",
    re.IGNORECASE,
)


def _oznacz_wartosc_robocza(params: dict[str, Any], pole: str, zalozenie: str) -> None:
    """Pole wyprowadzone bez danej producenta: wpis ``wartosci_robocze`` (pole → założenie).

    Zero cichych założeń (zasada nr 4): każda wartość policzona tu mnożnikiem albo wzorem
    z oznaczenia pozycji niesie założenie z rejestru ``wartosci_robocze`` — materializacja
    przenosi mapę do gałęzi, a wyniki liczone z tą wartością mają daną przyjętą ``ESTIMATED``.
    """
    robocze = dict(params.get(KLUCZ_WARTOSCI_ROBOCZYCH_KATALOGU) or {})
    robocze[pole] = zalozenie
    params[KLUCZ_WARTOSCI_ROBOCZYCH_KATALOGU] = dict(sorted(robocze.items()))


def _with_cable_return_conductor(record: dict[str, Any]) -> dict[str, Any]:
    """Uzupełnia jawne dane żyły powrotnej z oznaczenia katalogowego kabla."""

    params = dict(record.get("params") or {})
    text = f"{params.get('trade_name', '')} {record.get('name', '')}"
    section = params.get("return_conductor_cross_section_mm2")
    if section is None:
        for phase_raw, return_raw in RETURN_CONDUCTOR_SECTION_PATTERN.findall(text):
            phase_section = int(phase_raw)
            return_section = int(return_raw)
            if phase_section >= 16 and 1 <= return_section <= 95:
                section = return_section
                break
    if section is not None:
        section_float = float(section)
        params["return_conductor_cross_section_mm2"] = section_float
        material = str(params.get("return_conductor_material") or "CU").upper()
        params["return_conductor_material"] = material
        rho = RETURN_CONDUCTOR_RHO_OHM_MM2_PER_KM_20C.get(material)
        if rho is not None and params.get("return_conductor_r_ohm_per_km_20c") is None:
            params["return_conductor_r_ohm_per_km_20c"] = round(rho / section_float, 6)
            _oznacz_wartosc_robocza(
                params, "return_conductor_r_ohm_per_km_20c", ZALOZENIE_R_ZYLY_POWROTNEJ
            )
        jth = RETURN_CONDUCTOR_JTH_1S_A_PER_MM2.get(material)
        if jth is not None:
            params.setdefault("return_conductor_jth_1s_a_per_mm2", jth)
            if params.get("return_conductor_ith_1s_a") is None:
                params["return_conductor_ith_1s_a"] = round(jth * section_float, 6)
                _oznacz_wartosc_robocza(
                    params, "return_conductor_ith_1s_a", ZALOZENIE_ITH_ZYLY_POWROTNEJ
                )
    return {
        "id": record["id"],
        "name": record["name"],
        "params": params,
    }


def _float_param(params: dict[str, Any], key: str) -> float | None:
    value = params.get(key)
    if isinstance(value, int | float):
        return float(value)
    # Rekordy katalogu moga niesc liczbe jako tekst; wszystko inne (w tym brak
    # klucza) daje None — brak danej nie moze stac sie zerem.
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return None
    return None


def _with_zero_sequence_parameters(record: dict[str, Any], *, kind: str) -> dict[str, Any]:
    """Dopisuje jawne katalogowe parametry składowej zerowej R0/X0."""

    params = dict(record.get("params") or {})
    r1 = _float_param(params, "r_ohm_per_km")
    x1 = _float_param(params, "x_ohm_per_km")
    if r1 is None or x1 is None or r1 <= 0 or x1 <= 0:
        return {
            "id": record["id"],
            "name": record["name"],
            "params": params,
        }

    # Karta LINIA-110 (rozstrzygnięcie architekta, pkt 2): żadna z tych reguł nie ma podstawy
    # w karcie producenta ani w normie — każde wyprowadzone pole dostaje jawne założenie
    # (``wartosci_robocze``), a konsumenci wyniku daną przyjętą ESTIMATED.
    if kind == "cable":
        return_r = _float_param(params, "return_conductor_r_ohm_per_km_20c")
        if params.get("r0_ohm_per_km") is None:
            if return_r is not None and return_r > 0:
                params["r0_ohm_per_km"] = round(r1 + return_r, 6)
                _oznacz_wartosc_robocza(params, "r0_ohm_per_km", ZALOZENIE_R0_ZYLA_POWROTNA)
            else:
                params["r0_ohm_per_km"] = round(3.0 * r1, 6)
                _oznacz_wartosc_robocza(params, "r0_ohm_per_km", ZALOZENIE_R0_TRZY_R1)
        if params.get("x0_ohm_per_km") is None:
            params["x0_ohm_per_km"] = round(3.0 * x1, 6)
            _oznacz_wartosc_robocza(params, "x0_ohm_per_km", ZALOZENIE_X0_TRZY_X1)
    elif kind == "line":
        if params.get("r0_ohm_per_km") is None:
            params["r0_ohm_per_km"] = round(3.0 * r1, 6)
            _oznacz_wartosc_robocza(params, "r0_ohm_per_km", ZALOZENIE_R0_TRZY_R1)
        if params.get("x0_ohm_per_km") is None:
            params["x0_ohm_per_km"] = round(3.0 * x1, 6)
            _oznacz_wartosc_robocza(params, "x0_ohm_per_km", ZALOZENIE_X0_TRZY_X1)

    return {
        "id": record["id"],
        "name": record["name"],
        "params": params,
    }


def _with_catalog_quality(
    record: dict[str, Any],
    *,
    source_reference: str,
    verification_status: str,
    catalog_status: str,
    verification_note: str | None = None,
) -> dict[str, Any]:
    """Dopisuje jawne metadane jakości do surowego rekordu katalogowego."""

    params = dict(record.get("params") or {})
    params.setdefault("source_reference", source_reference)
    params.setdefault("verification_status", verification_status)
    params.setdefault("catalog_status", catalog_status)
    params.setdefault("contract_version", CATALOG_CONTRACT_VERSION)
    if verification_note and not params.get("verification_note"):
        params["verification_note"] = verification_note
    return {
        "id": record["id"],
        "name": record["name"],
        "params": params,
    }


def _line_family(record_id: str) -> str:
    if record_id.startswith("line-base-al-st-"):
        return "AFL_6"
    if record_id.startswith("line-base-afl2-"):
        return "AFL_2"
    if record_id.startswith("line-base-al-"):
        return "AAL"
    return "TEST"


def _cable_family(record_id: str) -> str:
    if record_id.startswith("cable-enea-2026-nkt-"):
        return "NKT_ENEA_2026"
    if record_id.startswith("cable-enea-operator-"):
        return "ENEA_OPERATOR"
    if record_id.startswith("cable-nkt-"):
        return "NKT"
    if record_id.startswith("cable-tfk-"):
        return "TELE_FONIKA"
    # K30-22: Polish PN-HD 620 S2 families
    if record_id.startswith("cable-polish-yhakxs-"):
        return "POLISH_YHAKXS"
    if record_id.startswith("cable-polish-yhkxs-"):
        return "POLISH_YHKXS"
    if record_id.startswith("cable-base-xlpe-cu-1c-"):
        return "XLPE_CU_1C"
    if record_id.startswith("cable-base-xlpe-al-1c-"):
        return "XLPE_AL_1C"
    if record_id.startswith("cable-base-xlpe-cu-3c-"):
        return "XLPE_CU_3C"
    if record_id.startswith("cable-base-xlpe-al-3c-"):
        return "XLPE_AL_3C"
    if record_id.startswith("cable-base-epr-cu-1c-"):
        return "EPR_CU_1C"
    if record_id.startswith("cable-base-epr-al-1c-"):
        return "EPR_AL_1C"
    if record_id.startswith("cable-base-epr-cu-3c-"):
        return "EPR_CU_3C"
    if record_id.startswith("cable-base-epr-al-3c-"):
        return "EPR_AL_3C"
    return "TEST"


def _with_line_short_circuit_temperature(record: dict[str, Any]) -> dict[str, Any]:
    """Domyka pare temperatur przewodu GOLEGO (theta_b -> theta_k) wg materialu zyly.

    Karta F-K1 faza 7. Rekordy linii niosly `jth_1s_a_per_mm2` i `max_temperature_c`
    (theta_b), ale temperatura koncowa theta_k nie byla dana — istniala tylko jako
    komentarz przy stalych JTH. Bez niej dowod obliczeniowy kryterium cieplnego nie
    mogl uzasadnic wspolczynnika k dla linii napowietrznej i nazywal go „brakiem".

    Przypisanie jest deterministyczne i wynika WYLACZNIE z materialu zyly zapisanego
    w rekordzie — zaden material nieznany nie dostaje wartosci domyslnej (brak
    pozostaje brakiem, zgodnie z zasada zero fabrykacji).
    """
    params = dict(record.get("params") or {})
    material = str(params.get("conductor_material") or "").strip().upper()
    temperatura_zwarciowa = {
        "AL": TEMP_SHORT_CIRCUIT_OHL_AL_C,
        "AL_ST": TEMP_SHORT_CIRCUIT_OHL_AL_ST_C,
    }.get(material)
    if temperatura_zwarciowa is not None:
        params.setdefault("short_circuit_temperature_c", temperatura_zwarciowa)
        params.setdefault("thermal_source_reference", OHL_THERMAL_SOURCE_REFERENCE)
    return {"id": record["id"], "name": record["name"], "params": params}


def _line_records_with_quality() -> list[dict[str, Any]]:
    production = [
        _with_catalog_quality(
            _with_line_short_circuit_temperature(
                _with_zero_sequence_parameters(record, kind="line")
            ),
            source_reference=LINE_SOURCE_REFERENCE,
            verification_status=CatalogVerificationStatus.CZESCIOWO_ZWERYFIKOWANY.value,
            catalog_status=CatalogStatus.PRODUKCYJNY_V1.value,
        )
        for record in LINE_AL_BASE + LINE_AL_ST_BASE + LINE_AFL2_BASE
    ]
    tests = [
        _with_catalog_quality(
            record,
            source_reference=CATALOG_TEST_SOURCE_REFERENCE,
            verification_status=CatalogVerificationStatus.REFERENCYJNY.value,
            catalog_status=CatalogStatus.TESTOWY.value,
            verification_note="Rekord zachowany wyłącznie do testów kompletności danych cieplnych.",
        )
        for record in LINE_INCOMPLETE_TYPES
    ]
    return production + tests


#: Karta KATALOG-KOMPLETNY-PROWENIENCJA (runda 3): kable „PN-HD 620 S2" polskich producentow
#: niosly ZWERYFIKOWANY/PRODUKCYJNY_V1 i flage `ptpire_certified` bez zadnego dokumentu
#: (bez numeru karty, strony, adresu; „PTPiREE WiPWC" bez numeru certyfikatu). Ta sama
#: klasa co polskie transformatory: deklaracja bez dokumentu => NIEWERYFIKOWANY, flaga
#: certyfikatu zdjeta (flaga wymaga zrodla z dokumentem certyfikatu).
ZRODLO_KABLI_POLSKICH_DEKLAROWANE = (
    "Deklarowane: PN-HD 620 S2 / TF Kable Telefonika / Bitner Kable / PTPiREE WiPWC — "
    "dokument nie jest dołączony do repozytorium (niezweryfikowany)"
)
NOTA_KABLI_POLSKICH_DEKLAROWANYCH = (
    "Pozycja deklarowana: brak karty katalogowej producenta (numer, strona, adres) i brak "
    "dokumentu certyfikatu PTPiREE — status NIEWERYFIKOWANY, bez flagi certyfikatu. "
    "Parametry do potwierdzenia kartą producenta."
)


def _cable_records_with_quality() -> list[dict[str, Any]]:
    # Historyczne 4 identyfikatory sa zachowane dla istniejacych projektow.
    # Zadnego z ich oznaczen nie ma w aktualnej tab. 3 ENEA 03.2026.
    # Nie wolno ich prezentowac jako aktualnego standardu ENEA.
    legacy_operator_records = [
        _with_catalog_quality(
            _with_zero_sequence_parameters(_with_cable_return_conductor(record), kind="cable"),
            source_reference=ENEA_KABLE_SN_2026_SOURCE_REFERENCE,
            verification_status=CatalogVerificationStatus.REFERENCYJNY.value,
            catalog_status=CatalogStatus.REFERENCYJNY_V1.value,
            verification_note=(
                "Rekord historyczny zachowany dla starych projektów. Oznaczenie/przekrój "
                "NIE występuje w aktualnej tabeli 3 standardu ENEA 03.2026. "
                "Nie wybierać do nowej inwestycji ENEA; zamiast niego wybierz "
                "zweryfikowany wariant XRUHAKXS1 70/25, 150/25 lub 240/25."
            ),
        )
        for record in CABLE_ENEA_OPERATOR_STANDARD_TYPES
    ]
    for legacy in legacy_operator_records:
        legacy["name"] = legacy["name"].replace(
            "ENEA Operator standard - ", "Profil historyczny — "
        )
        legacy["params"].pop("manufacturer", None)
        legacy["params"]["standard"] = "Profil historyczny (poza ENEA 03.2026 tab. 3)"
    operator_records = [
        _with_zero_sequence_parameters(_with_cable_return_conductor(record), kind="cable")
        for record in CABLE_ENEA_2026_NKT_TYPES
    ] + legacy_operator_records + [
        _with_zero_sequence_parameters(_with_cable_return_conductor(record), kind="cable")
        for record in CABLE_NKT_PELNY_ODBIORCA_TYPES
    ]
    base_records = [
        _with_catalog_quality(
            _with_zero_sequence_parameters(_with_cable_return_conductor(record), kind="cable"),
            source_reference=CABLE_BASE_SOURCE_REFERENCE,
            verification_status=CatalogVerificationStatus.CZESCIOWO_ZWERYFIKOWANY.value,
            catalog_status=CatalogStatus.PRODUKCYJNY_V1.value,
        )
        for record in (
            CABLE_XLPE_CU_1C_BASE
            + CABLE_XLPE_AL_1C_BASE
            + CABLE_XLPE_CU_3C_BASE
            + CABLE_XLPE_AL_3C_BASE
            + CABLE_EPR_CU_1C_BASE
            + CABLE_EPR_AL_1C_BASE
            + CABLE_EPR_CU_3C_BASE
            + CABLE_EPR_AL_3C_BASE
        )
    ]
    manufacturer_records = [
        _with_catalog_quality(
            _with_zero_sequence_parameters(_with_cable_return_conductor(record), kind="cable"),
            source_reference=CABLE_MANUFACTURER_SOURCE_REFERENCE,
            verification_status=CatalogVerificationStatus.ZWERYFIKOWANY.value,
            catalog_status=CatalogStatus.PRODUKCYJNY_V1.value,
        )
        for record in CABLE_NKT_TYPES + CABLE_TELEFONIKA_TYPES
    ]
    # K30-22: Polish PN-HD 620 S2 standard cables (YHAKXS Al + YHKXS Cu)
    polish_pn_hd_records = [
        _with_catalog_quality(
            _with_zero_sequence_parameters(_with_cable_return_conductor(record), kind="cable"),
            source_reference=ZRODLO_KABLI_POLSKICH_DEKLAROWANE,
            verification_status=CatalogVerificationStatus.NIEWERYFIKOWANY.value,
            catalog_status=CatalogStatus.REFERENCYJNY_V1.value,
            verification_note=NOTA_KABLI_POLSKICH_DEKLAROWANYCH,
        )
        for record in CABLE_POLISH_PN_HD_620
    ]
    tests = [
        _with_catalog_quality(
            _with_cable_return_conductor(record),
            source_reference=CATALOG_TEST_SOURCE_REFERENCE,
            verification_status=CatalogVerificationStatus.REFERENCYJNY.value,
            catalog_status=CatalogStatus.TESTOWY.value,
            verification_note="Rekord zachowany wyłącznie do testów kompletności danych cieplnych.",
        )
        for record in CABLE_INCOMPLETE_TYPES
    ]
    return operator_records + base_records + manufacturer_records + polish_pn_hd_records + tests


def _status_list(records: list[dict[str, Any]], field_name: str) -> list[str]:
    return sorted(
        {
            str((record.get("params") or {}).get(field_name))
            for record in records
            if (record.get("params") or {}).get(field_name)
        }
    )


# =============================================================================
# TYPY BAZOWE — KABLE XLPE MIEDZIOWE 1-ŻYŁOWE
# =============================================================================

CABLE_XLPE_CU_1C_BASE: list[dict[str, Any]] = [
    {
        "id": "cable-base-xlpe-cu-1c-70",
        "name": "Kabel XLPE Cu 1×70 mm²",
        "params": {
            "conductor_material": "CU",
            "insulation_type": "XLPE",
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "cross_section_mm2": 70,
            "number_of_cores": 1,
            "r_ohm_per_km": 0.268,
            "x_ohm_per_km": 0.123,
            "c_nf_per_km": 220,
            "rated_current_a": 245,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 90,
            "jth_1s_a_per_mm2": JTH_CU_XLPE,
            "standard": "IEC 60502-2",
        },
    },
    {
        "id": "cable-base-xlpe-cu-1c-120",
        "name": "Kabel XLPE Cu 1×120 mm²",
        "params": {
            "conductor_material": "CU",
            "insulation_type": "XLPE",
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "cross_section_mm2": 120,
            "number_of_cores": 1,
            "r_ohm_per_km": 0.153,
            "x_ohm_per_km": 0.112,
            "c_nf_per_km": 264,
            "rated_current_a": 340,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 90,
            "jth_1s_a_per_mm2": JTH_CU_XLPE,
            "standard": "IEC 60502-2",
        },
    },
    {
        "id": "cable-base-xlpe-cu-1c-150",
        "name": "Kabel XLPE Cu 1×150 mm²",
        "params": {
            "conductor_material": "CU",
            "insulation_type": "XLPE",
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "cross_section_mm2": 150,
            "number_of_cores": 1,
            "r_ohm_per_km": 0.124,
            "x_ohm_per_km": 0.108,
            "c_nf_per_km": 285,
            "rated_current_a": 395,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 90,
            "jth_1s_a_per_mm2": JTH_CU_XLPE,
            "standard": "IEC 60502-2",
        },
    },
    {
        "id": "cable-base-xlpe-cu-1c-185",
        "name": "Kabel XLPE Cu 1×185 mm²",
        "params": {
            "conductor_material": "CU",
            "insulation_type": "XLPE",
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "cross_section_mm2": 185,
            "number_of_cores": 1,
            "r_ohm_per_km": 0.099,
            "x_ohm_per_km": 0.104,
            "c_nf_per_km": 305,
            "rated_current_a": 450,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 90,
            "jth_1s_a_per_mm2": JTH_CU_XLPE,
            "standard": "IEC 60502-2",
        },
    },
    {
        "id": "cable-base-xlpe-cu-1c-240",
        "name": "Kabel XLPE Cu 1×240 mm²",
        "params": {
            "conductor_material": "CU",
            "insulation_type": "XLPE",
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "cross_section_mm2": 240,
            "number_of_cores": 1,
            "r_ohm_per_km": 0.0754,
            "x_ohm_per_km": 0.099,
            "c_nf_per_km": 340,
            "rated_current_a": 530,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 90,
            "jth_1s_a_per_mm2": JTH_CU_XLPE,
            "standard": "IEC 60502-2",
        },
    },
    {
        "id": "cable-base-xlpe-cu-1c-300",
        "name": "Kabel XLPE Cu 1×300 mm²",
        "params": {
            "conductor_material": "CU",
            "insulation_type": "XLPE",
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "cross_section_mm2": 300,
            "number_of_cores": 1,
            "r_ohm_per_km": 0.0601,
            "x_ohm_per_km": 0.095,
            "c_nf_per_km": 375,
            "rated_current_a": 615,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 90,
            "jth_1s_a_per_mm2": JTH_CU_XLPE,
            "standard": "IEC 60502-2",
        },
    },
    {
        "id": "cable-base-xlpe-cu-1c-400",
        "name": "Kabel XLPE Cu 1×400 mm²",
        "params": {
            "conductor_material": "CU",
            "insulation_type": "XLPE",
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "cross_section_mm2": 400,
            "number_of_cores": 1,
            "r_ohm_per_km": 0.0470,
            "x_ohm_per_km": 0.091,
            "c_nf_per_km": 420,
            "rated_current_a": 720,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 90,
            "jth_1s_a_per_mm2": JTH_CU_XLPE,
            "standard": "IEC 60502-2",
        },
    },
]

# =============================================================================
# TYPY BAZOWE — KABLE XLPE ALUMINIOWE 1-ŻYŁOWE
# =============================================================================

CABLE_XLPE_AL_1C_BASE: list[dict[str, Any]] = [
    {
        "id": "cable-base-xlpe-al-1c-70",
        "name": "Kabel XLPE Al 1×70 mm²",
        "params": {
            "conductor_material": "AL",
            "insulation_type": "XLPE",
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "cross_section_mm2": 70,
            "number_of_cores": 1,
            "r_ohm_per_km": 0.443,
            "x_ohm_per_km": 0.123,
            "c_nf_per_km": 220,
            "rated_current_a": 190,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 90,
            "jth_1s_a_per_mm2": JTH_AL_XLPE,
            "standard": "IEC 60502-2",
        },
    },
    {
        "id": "cable-base-xlpe-al-1c-120",
        "name": "Kabel XLPE Al 1×120 mm²",
        "params": {
            "conductor_material": "AL",
            "insulation_type": "XLPE",
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "cross_section_mm2": 120,
            "number_of_cores": 1,
            "r_ohm_per_km": 0.253,
            "x_ohm_per_km": 0.112,
            "c_nf_per_km": 264,
            "rated_current_a": 265,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 90,
            "jth_1s_a_per_mm2": JTH_AL_XLPE,
            "standard": "IEC 60502-2",
        },
    },
    {
        "id": "cable-base-xlpe-al-1c-150",
        "name": "Kabel XLPE Al 1×150 mm²",
        "params": {
            "conductor_material": "AL",
            "insulation_type": "XLPE",
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "cross_section_mm2": 150,
            "number_of_cores": 1,
            "r_ohm_per_km": 0.206,
            "x_ohm_per_km": 0.108,
            "c_nf_per_km": 285,
            "rated_current_a": 305,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 90,
            "jth_1s_a_per_mm2": JTH_AL_XLPE,
            "standard": "IEC 60502-2",
        },
    },
    {
        "id": "cable-base-xlpe-al-1c-185",
        "name": "Kabel XLPE Al 1×185 mm²",
        "params": {
            "conductor_material": "AL",
            "insulation_type": "XLPE",
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "cross_section_mm2": 185,
            "number_of_cores": 1,
            "r_ohm_per_km": 0.164,
            "x_ohm_per_km": 0.104,
            "c_nf_per_km": 305,
            "rated_current_a": 350,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 90,
            "jth_1s_a_per_mm2": JTH_AL_XLPE,
            "standard": "IEC 60502-2",
        },
    },
    {
        "id": "cable-base-xlpe-al-1c-240",
        "name": "Kabel XLPE Al 1×240 mm²",
        "params": {
            "conductor_material": "AL",
            "insulation_type": "XLPE",
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "cross_section_mm2": 240,
            "number_of_cores": 1,
            "r_ohm_per_km": 0.125,
            "x_ohm_per_km": 0.099,
            "c_nf_per_km": 340,
            "rated_current_a": 410,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 90,
            "jth_1s_a_per_mm2": JTH_AL_XLPE,
            "standard": "IEC 60502-2",
        },
    },
    {
        "id": "cable-base-xlpe-al-1c-300",
        "name": "Kabel XLPE Al 1×300 mm²",
        "params": {
            "conductor_material": "AL",
            "insulation_type": "XLPE",
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "cross_section_mm2": 300,
            "number_of_cores": 1,
            "r_ohm_per_km": 0.100,
            "x_ohm_per_km": 0.095,
            "c_nf_per_km": 375,
            "rated_current_a": 475,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 90,
            "jth_1s_a_per_mm2": JTH_AL_XLPE,
            "standard": "IEC 60502-2",
        },
    },
    {
        "id": "cable-base-xlpe-al-1c-400",
        "name": "Kabel XLPE Al 1×400 mm²",
        "params": {
            "conductor_material": "AL",
            "insulation_type": "XLPE",
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "cross_section_mm2": 400,
            "number_of_cores": 1,
            "r_ohm_per_km": 0.0778,
            "x_ohm_per_km": 0.091,
            "c_nf_per_km": 420,
            "rated_current_a": 555,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 90,
            "jth_1s_a_per_mm2": JTH_AL_XLPE,
            "standard": "IEC 60502-2",
        },
    },
]

# =============================================================================
# TYPY BAZOWE — KABLE XLPE 3-ŻYŁOWE (Cu i Al)
# =============================================================================

CABLE_XLPE_CU_3C_BASE: list[dict[str, Any]] = [
    {
        "id": "cable-base-xlpe-cu-3c-70",
        "name": "Kabel XLPE Cu 3×70 mm²",
        "params": {
            "conductor_material": "CU",
            "insulation_type": "XLPE",
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "cross_section_mm2": 70,
            "number_of_cores": 3,
            "r_ohm_per_km": 0.268,
            "x_ohm_per_km": 0.110,
            "c_nf_per_km": 320,
            "rated_current_a": 215,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 90,
            "jth_1s_a_per_mm2": JTH_CU_XLPE,
            "standard": "IEC 60502-2",
        },
    },
    {
        "id": "cable-base-xlpe-cu-3c-120",
        "name": "Kabel XLPE Cu 3×120 mm²",
        "params": {
            "conductor_material": "CU",
            "insulation_type": "XLPE",
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "cross_section_mm2": 120,
            "number_of_cores": 3,
            "r_ohm_per_km": 0.153,
            "x_ohm_per_km": 0.100,
            "c_nf_per_km": 390,
            "rated_current_a": 295,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 90,
            "jth_1s_a_per_mm2": JTH_CU_XLPE,
            "standard": "IEC 60502-2",
        },
    },
    {
        "id": "cable-base-xlpe-cu-3c-150",
        "name": "Kabel XLPE Cu 3×150 mm²",
        "params": {
            "conductor_material": "CU",
            "insulation_type": "XLPE",
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "cross_section_mm2": 150,
            "number_of_cores": 3,
            "r_ohm_per_km": 0.124,
            "x_ohm_per_km": 0.095,
            "c_nf_per_km": 420,
            "rated_current_a": 340,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 90,
            "jth_1s_a_per_mm2": JTH_CU_XLPE,
            "standard": "IEC 60502-2",
        },
    },
    {
        "id": "cable-base-xlpe-cu-3c-185",
        "name": "Kabel XLPE Cu 3×185 mm²",
        "params": {
            "conductor_material": "CU",
            "insulation_type": "XLPE",
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "cross_section_mm2": 185,
            "number_of_cores": 3,
            "r_ohm_per_km": 0.099,
            "x_ohm_per_km": 0.091,
            "c_nf_per_km": 450,
            "rated_current_a": 390,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 90,
            "jth_1s_a_per_mm2": JTH_CU_XLPE,
            "standard": "IEC 60502-2",
        },
    },
    {
        "id": "cable-base-xlpe-cu-3c-240",
        "name": "Kabel XLPE Cu 3×240 mm²",
        "params": {
            "conductor_material": "CU",
            "insulation_type": "XLPE",
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "cross_section_mm2": 240,
            "number_of_cores": 3,
            "r_ohm_per_km": 0.0754,
            "x_ohm_per_km": 0.086,
            "c_nf_per_km": 500,
            "rated_current_a": 455,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 90,
            "jth_1s_a_per_mm2": JTH_CU_XLPE,
            "standard": "IEC 60502-2",
        },
    },
    {
        "id": "cable-base-xlpe-cu-3c-300",
        "name": "Kabel XLPE Cu 3×300 mm²",
        "params": {
            "conductor_material": "CU",
            "insulation_type": "XLPE",
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "cross_section_mm2": 300,
            "number_of_cores": 3,
            "r_ohm_per_km": 0.0601,
            "x_ohm_per_km": 0.082,
            "c_nf_per_km": 550,
            "rated_current_a": 520,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 90,
            "jth_1s_a_per_mm2": JTH_CU_XLPE,
            "standard": "IEC 60502-2",
        },
    },
]

CABLE_XLPE_AL_3C_BASE: list[dict[str, Any]] = [
    {
        "id": "cable-base-xlpe-al-3c-70",
        "name": "Kabel XLPE Al 3×70 mm²",
        "params": {
            "conductor_material": "AL",
            "insulation_type": "XLPE",
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "cross_section_mm2": 70,
            "number_of_cores": 3,
            "r_ohm_per_km": 0.443,
            "x_ohm_per_km": 0.110,
            "c_nf_per_km": 320,
            "rated_current_a": 165,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 90,
            "jth_1s_a_per_mm2": JTH_AL_XLPE,
            "standard": "IEC 60502-2",
        },
    },
    {
        "id": "cable-base-xlpe-al-3c-120",
        "name": "Kabel XLPE Al 3×120 mm²",
        "params": {
            "conductor_material": "AL",
            "insulation_type": "XLPE",
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "cross_section_mm2": 120,
            "number_of_cores": 3,
            "r_ohm_per_km": 0.253,
            "x_ohm_per_km": 0.100,
            "c_nf_per_km": 390,
            "rated_current_a": 230,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 90,
            "jth_1s_a_per_mm2": JTH_AL_XLPE,
            "standard": "IEC 60502-2",
        },
    },
    {
        "id": "cable-base-xlpe-al-3c-150",
        "name": "Kabel XLPE Al 3×150 mm²",
        "params": {
            "conductor_material": "AL",
            "insulation_type": "XLPE",
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "cross_section_mm2": 150,
            "number_of_cores": 3,
            "r_ohm_per_km": 0.206,
            "x_ohm_per_km": 0.095,
            "c_nf_per_km": 420,
            "rated_current_a": 265,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 90,
            "jth_1s_a_per_mm2": JTH_AL_XLPE,
            "standard": "IEC 60502-2",
        },
    },
    {
        "id": "cable-base-xlpe-al-3c-185",
        "name": "Kabel XLPE Al 3×185 mm²",
        "params": {
            "conductor_material": "AL",
            "insulation_type": "XLPE",
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "cross_section_mm2": 185,
            "number_of_cores": 3,
            "r_ohm_per_km": 0.164,
            "x_ohm_per_km": 0.091,
            "c_nf_per_km": 450,
            "rated_current_a": 305,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 90,
            "jth_1s_a_per_mm2": JTH_AL_XLPE,
            "standard": "IEC 60502-2",
        },
    },
    {
        "id": "cable-base-xlpe-al-3c-240",
        "name": "Kabel XLPE Al 3×240 mm²",
        "params": {
            "conductor_material": "AL",
            "insulation_type": "XLPE",
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "cross_section_mm2": 240,
            "number_of_cores": 3,
            "r_ohm_per_km": 0.125,
            "x_ohm_per_km": 0.086,
            "c_nf_per_km": 500,
            "rated_current_a": 355,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 90,
            "jth_1s_a_per_mm2": JTH_AL_XLPE,
            "standard": "IEC 60502-2",
        },
    },
    {
        "id": "cable-base-xlpe-al-3c-300",
        "name": "Kabel XLPE Al 3×300 mm²",
        "params": {
            "conductor_material": "AL",
            "insulation_type": "XLPE",
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "cross_section_mm2": 300,
            "number_of_cores": 3,
            "r_ohm_per_km": 0.100,
            "x_ohm_per_km": 0.082,
            "c_nf_per_km": 550,
            "rated_current_a": 405,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 90,
            "jth_1s_a_per_mm2": JTH_AL_XLPE,
            "standard": "IEC 60502-2",
        },
    },
]

# =============================================================================
# TYPY BAZOWE — KABLE EPR (Cu i Al, 1-żyłowe i 3-żyłowe)
# =============================================================================

CABLE_EPR_CU_1C_BASE: list[dict[str, Any]] = [
    {
        "id": "cable-base-epr-cu-1c-70",
        "name": "Kabel EPR Cu 1×70 mm²",
        "params": {
            "conductor_material": "CU",
            "insulation_type": "EPR",
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "cross_section_mm2": 70,
            "number_of_cores": 1,
            "r_ohm_per_km": 0.268,
            "x_ohm_per_km": 0.130,
            "c_nf_per_km": 200,
            "rated_current_a": 240,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 90,
            "jth_1s_a_per_mm2": JTH_CU_EPR,
            "standard": "IEC 60502-2",
        },
    },
    {
        "id": "cable-base-epr-cu-1c-120",
        "name": "Kabel EPR Cu 1×120 mm²",
        "params": {
            "conductor_material": "CU",
            "insulation_type": "EPR",
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "cross_section_mm2": 120,
            "number_of_cores": 1,
            "r_ohm_per_km": 0.153,
            "x_ohm_per_km": 0.118,
            "c_nf_per_km": 240,
            "rated_current_a": 330,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 90,
            "jth_1s_a_per_mm2": JTH_CU_EPR,
            "standard": "IEC 60502-2",
        },
    },
    {
        "id": "cable-base-epr-cu-1c-150",
        "name": "Kabel EPR Cu 1×150 mm²",
        "params": {
            "conductor_material": "CU",
            "insulation_type": "EPR",
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "cross_section_mm2": 150,
            "number_of_cores": 1,
            "r_ohm_per_km": 0.124,
            "x_ohm_per_km": 0.113,
            "c_nf_per_km": 260,
            "rated_current_a": 385,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 90,
            "jth_1s_a_per_mm2": JTH_CU_EPR,
            "standard": "IEC 60502-2",
        },
    },
    {
        "id": "cable-base-epr-cu-1c-185",
        "name": "Kabel EPR Cu 1×185 mm²",
        "params": {
            "conductor_material": "CU",
            "insulation_type": "EPR",
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "cross_section_mm2": 185,
            "number_of_cores": 1,
            "r_ohm_per_km": 0.099,
            "x_ohm_per_km": 0.109,
            "c_nf_per_km": 280,
            "rated_current_a": 440,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 90,
            "jth_1s_a_per_mm2": JTH_CU_EPR,
            "standard": "IEC 60502-2",
        },
    },
    {
        "id": "cable-base-epr-cu-1c-240",
        "name": "Kabel EPR Cu 1×240 mm²",
        "params": {
            "conductor_material": "CU",
            "insulation_type": "EPR",
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "cross_section_mm2": 240,
            "number_of_cores": 1,
            "r_ohm_per_km": 0.0754,
            "x_ohm_per_km": 0.104,
            "c_nf_per_km": 310,
            "rated_current_a": 515,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 90,
            "jth_1s_a_per_mm2": JTH_CU_EPR,
            "standard": "IEC 60502-2",
        },
    },
]

CABLE_EPR_AL_1C_BASE: list[dict[str, Any]] = [
    {
        "id": "cable-base-epr-al-1c-70",
        "name": "Kabel EPR Al 1×70 mm²",
        "params": {
            "conductor_material": "AL",
            "insulation_type": "EPR",
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "cross_section_mm2": 70,
            "number_of_cores": 1,
            "r_ohm_per_km": 0.443,
            "x_ohm_per_km": 0.130,
            "c_nf_per_km": 200,
            "rated_current_a": 185,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 90,
            "jth_1s_a_per_mm2": JTH_AL_EPR,
            "standard": "IEC 60502-2",
        },
    },
    {
        "id": "cable-base-epr-al-1c-120",
        "name": "Kabel EPR Al 1×120 mm²",
        "params": {
            "conductor_material": "AL",
            "insulation_type": "EPR",
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "cross_section_mm2": 120,
            "number_of_cores": 1,
            "r_ohm_per_km": 0.253,
            "x_ohm_per_km": 0.118,
            "c_nf_per_km": 240,
            "rated_current_a": 255,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 90,
            "jth_1s_a_per_mm2": JTH_AL_EPR,
            "standard": "IEC 60502-2",
        },
    },
    {
        "id": "cable-base-epr-al-1c-150",
        "name": "Kabel EPR Al 1×150 mm²",
        "params": {
            "conductor_material": "AL",
            "insulation_type": "EPR",
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "cross_section_mm2": 150,
            "number_of_cores": 1,
            "r_ohm_per_km": 0.206,
            "x_ohm_per_km": 0.113,
            "c_nf_per_km": 260,
            "rated_current_a": 295,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 90,
            "jth_1s_a_per_mm2": JTH_AL_EPR,
            "standard": "IEC 60502-2",
        },
    },
    {
        "id": "cable-base-epr-al-1c-185",
        "name": "Kabel EPR Al 1×185 mm²",
        "params": {
            "conductor_material": "AL",
            "insulation_type": "EPR",
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "cross_section_mm2": 185,
            "number_of_cores": 1,
            "r_ohm_per_km": 0.164,
            "x_ohm_per_km": 0.109,
            "c_nf_per_km": 280,
            "rated_current_a": 340,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 90,
            "jth_1s_a_per_mm2": JTH_AL_EPR,
            "standard": "IEC 60502-2",
        },
    },
    {
        "id": "cable-base-epr-al-1c-240",
        "name": "Kabel EPR Al 1×240 mm²",
        "params": {
            "conductor_material": "AL",
            "insulation_type": "EPR",
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "cross_section_mm2": 240,
            "number_of_cores": 1,
            "r_ohm_per_km": 0.125,
            "x_ohm_per_km": 0.104,
            "c_nf_per_km": 310,
            "rated_current_a": 400,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 90,
            "jth_1s_a_per_mm2": JTH_AL_EPR,
            "standard": "IEC 60502-2",
        },
    },
]

CABLE_EPR_CU_3C_BASE: list[dict[str, Any]] = [
    {
        "id": "cable-base-epr-cu-3c-70",
        "name": "Kabel EPR Cu 3×70 mm²",
        "params": {
            "conductor_material": "CU",
            "insulation_type": "EPR",
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "cross_section_mm2": 70,
            "number_of_cores": 3,
            "r_ohm_per_km": 0.268,
            "x_ohm_per_km": 0.115,
            "c_nf_per_km": 290,
            "rated_current_a": 210,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 90,
            "jth_1s_a_per_mm2": JTH_CU_EPR,
            "standard": "IEC 60502-2",
        },
    },
    {
        "id": "cable-base-epr-cu-3c-120",
        "name": "Kabel EPR Cu 3×120 mm²",
        "params": {
            "conductor_material": "CU",
            "insulation_type": "EPR",
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "cross_section_mm2": 120,
            "number_of_cores": 3,
            "r_ohm_per_km": 0.153,
            "x_ohm_per_km": 0.105,
            "c_nf_per_km": 355,
            "rated_current_a": 290,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 90,
            "jth_1s_a_per_mm2": JTH_CU_EPR,
            "standard": "IEC 60502-2",
        },
    },
    {
        "id": "cable-base-epr-cu-3c-150",
        "name": "Kabel EPR Cu 3×150 mm²",
        "params": {
            "conductor_material": "CU",
            "insulation_type": "EPR",
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "cross_section_mm2": 150,
            "number_of_cores": 3,
            "r_ohm_per_km": 0.124,
            "x_ohm_per_km": 0.100,
            "c_nf_per_km": 385,
            "rated_current_a": 330,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 90,
            "jth_1s_a_per_mm2": JTH_CU_EPR,
            "standard": "IEC 60502-2",
        },
    },
    {
        "id": "cable-base-epr-cu-3c-185",
        "name": "Kabel EPR Cu 3×185 mm²",
        "params": {
            "conductor_material": "CU",
            "insulation_type": "EPR",
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "cross_section_mm2": 185,
            "number_of_cores": 3,
            "r_ohm_per_km": 0.099,
            "x_ohm_per_km": 0.096,
            "c_nf_per_km": 415,
            "rated_current_a": 380,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 90,
            "jth_1s_a_per_mm2": JTH_CU_EPR,
            "standard": "IEC 60502-2",
        },
    },
]

CABLE_EPR_AL_3C_BASE: list[dict[str, Any]] = [
    {
        "id": "cable-base-epr-al-3c-70",
        "name": "Kabel EPR Al 3×70 mm²",
        "params": {
            "conductor_material": "AL",
            "insulation_type": "EPR",
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "cross_section_mm2": 70,
            "number_of_cores": 3,
            "r_ohm_per_km": 0.443,
            "x_ohm_per_km": 0.115,
            "c_nf_per_km": 290,
            "rated_current_a": 160,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 90,
            "jth_1s_a_per_mm2": JTH_AL_EPR,
            "standard": "IEC 60502-2",
        },
    },
    {
        "id": "cable-base-epr-al-3c-120",
        "name": "Kabel EPR Al 3×120 mm²",
        "params": {
            "conductor_material": "AL",
            "insulation_type": "EPR",
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "cross_section_mm2": 120,
            "number_of_cores": 3,
            "r_ohm_per_km": 0.253,
            "x_ohm_per_km": 0.105,
            "c_nf_per_km": 355,
            "rated_current_a": 225,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 90,
            "jth_1s_a_per_mm2": JTH_AL_EPR,
            "standard": "IEC 60502-2",
        },
    },
    {
        "id": "cable-base-epr-al-3c-150",
        "name": "Kabel EPR Al 3×150 mm²",
        "params": {
            "conductor_material": "AL",
            "insulation_type": "EPR",
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "cross_section_mm2": 150,
            "number_of_cores": 3,
            "r_ohm_per_km": 0.206,
            "x_ohm_per_km": 0.100,
            "c_nf_per_km": 385,
            "rated_current_a": 260,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 90,
            "jth_1s_a_per_mm2": JTH_AL_EPR,
            "standard": "IEC 60502-2",
        },
    },
    {
        "id": "cable-base-epr-al-3c-185",
        "name": "Kabel EPR Al 3×185 mm²",
        "params": {
            "conductor_material": "AL",
            "insulation_type": "EPR",
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "cross_section_mm2": 185,
            "number_of_cores": 3,
            "r_ohm_per_km": 0.164,
            "x_ohm_per_km": 0.096,
            "c_nf_per_km": 415,
            "rated_current_a": 295,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 90,
            "jth_1s_a_per_mm2": JTH_AL_EPR,
            "standard": "IEC 60502-2",
        },
    },
]

# =============================================================================
# TYPY BAZOWE — LINIE NAPOWIETRZNE AL (AAC)
# =============================================================================

LINE_AL_BASE: list[dict[str, Any]] = [
    {
        "id": "line-base-al-16",
        "name": "Linia AAL 16 mm²",
        "params": {
            "conductor_material": "AL",
            "cross_section_mm2": 16,
            "r_ohm_per_km": 1.800,
            "x_ohm_per_km": 0.405,
            "b_us_per_km": 2.55,
            "rated_current_a": 85,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 70,
            "jth_1s_a_per_mm2": JTH_AL_OHL,
            "standard": "PN-EN 50182",
            "source_reference": "PN-EN 50182 / norma IEC 61089 / dane katalogowe AAC",
        },
    },
    {
        "id": "line-base-al-25",
        "name": "Linia AAL 25 mm²",
        "params": {
            "conductor_material": "AL",
            "cross_section_mm2": 25,
            "r_ohm_per_km": 1.150,
            "x_ohm_per_km": 0.390,
            "b_us_per_km": 2.65,
            "rated_current_a": 110,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 70,
            "jth_1s_a_per_mm2": JTH_AL_OHL,
            "standard": "PN-EN 50182",
        },
    },
    {
        "id": "line-base-al-35",
        "name": "Linia Al 35 mm²",
        "params": {
            "conductor_material": "AL",
            "cross_section_mm2": 35,
            "r_ohm_per_km": 0.822,
            "x_ohm_per_km": 0.377,
            "b_us_per_km": 2.75,
            "rated_current_a": 140,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 70,
            "jth_1s_a_per_mm2": JTH_AL_OHL,
            "standard": "PN-EN 50182",
        },
    },
    {
        "id": "line-base-al-50",
        "name": "Linia Al 50 mm²",
        "params": {
            "conductor_material": "AL",
            "cross_section_mm2": 50,
            "r_ohm_per_km": 0.576,
            "x_ohm_per_km": 0.365,
            "b_us_per_km": 2.85,
            "rated_current_a": 175,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 70,
            "jth_1s_a_per_mm2": JTH_AL_OHL,
            "standard": "PN-EN 50182",
        },
    },
    {
        "id": "line-base-al-70",
        "name": "Linia Al 70 mm²",
        "params": {
            "conductor_material": "AL",
            "cross_section_mm2": 70,
            "r_ohm_per_km": 0.411,
            "x_ohm_per_km": 0.353,
            "b_us_per_km": 2.95,
            "rated_current_a": 220,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 70,
            "jth_1s_a_per_mm2": JTH_AL_OHL,
            "standard": "PN-EN 50182",
        },
    },
    {
        "id": "line-base-al-95",
        "name": "Linia Al 95 mm²",
        "params": {
            "conductor_material": "AL",
            "cross_section_mm2": 95,
            "r_ohm_per_km": 0.303,
            "x_ohm_per_km": 0.342,
            "b_us_per_km": 3.05,
            "rated_current_a": 270,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 70,
            "jth_1s_a_per_mm2": JTH_AL_OHL,
            "standard": "PN-EN 50182",
        },
    },
    {
        "id": "line-base-al-120",
        "name": "Linia Al 120 mm²",
        "params": {
            "conductor_material": "AL",
            "cross_section_mm2": 120,
            "r_ohm_per_km": 0.240,
            "x_ohm_per_km": 0.333,
            "b_us_per_km": 3.15,
            "rated_current_a": 315,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 70,
            "jth_1s_a_per_mm2": JTH_AL_OHL,
            "standard": "PN-EN 50182",
        },
    },
    {
        "id": "line-base-al-150",
        "name": "Linia AAL 150 mm²",
        "params": {
            "conductor_material": "AL",
            "cross_section_mm2": 150,
            "r_ohm_per_km": 0.192,
            "x_ohm_per_km": 0.325,
            "b_us_per_km": 3.25,
            "rated_current_a": 365,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 70,
            "jth_1s_a_per_mm2": JTH_AL_OHL,
            "standard": "PN-EN 50182",
        },
    },
    {
        "id": "line-base-al-185",
        "name": "Linia AAL 185 mm²",
        "params": {
            "conductor_material": "AL",
            "cross_section_mm2": 185,
            "r_ohm_per_km": 0.154,
            "x_ohm_per_km": 0.318,
            "b_us_per_km": 3.35,
            "rated_current_a": 420,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 70,
            "jth_1s_a_per_mm2": JTH_AL_OHL,
            "standard": "PN-EN 50182",
            "source_reference": "PN-EN 50182 / norma IEC 61089 / dane katalogowe AAC",
        },
    },
    {
        "id": "line-base-al-240",
        "name": "Linia AAL 240 mm²",
        "params": {
            "conductor_material": "AL",
            "cross_section_mm2": 240,
            "r_ohm_per_km": 0.119,
            "x_ohm_per_km": 0.309,
            "b_us_per_km": 3.45,
            "rated_current_a": 490,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 70,
            "jth_1s_a_per_mm2": JTH_AL_OHL,
            "standard": "PN-EN 50182",
            "source_reference": "PN-EN 50182 / norma IEC 61089 / dane katalogowe AAC",
        },
    },
]

# =============================================================================
# TYPY BAZOWE — LINIE NAPOWIETRZNE AL/ST (ACSR/AFL)
# =============================================================================

LINE_AL_ST_BASE: list[dict[str, Any]] = [
    {
        "id": "line-base-al-st-16",
        "name": "Linia AFL 6 16/2,7 mm²",
        "params": {
            "conductor_material": "AL_ST",
            "cross_section_mm2": 16,
            "r_ohm_per_km": 1.800,
            "x_ohm_per_km": 0.408,
            "b_us_per_km": 2.55,
            "rated_current_a": 90,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 70,
            "jth_1s_a_per_mm2": JTH_AL_ST_OHL,
            "standard": "PN-EN 50182",
            "source_reference": "PN-EN 50182 / katalog linii AFL 6 / typowe dane OSD",
        },
    },
    {
        "id": "line-base-al-st-25",
        "name": "Linia AFL 6 25/4,2 mm²",
        "params": {
            "conductor_material": "AL_ST",
            "cross_section_mm2": 25,
            "r_ohm_per_km": 1.146,
            "x_ohm_per_km": 0.395,
            "b_us_per_km": 2.60,
            "rated_current_a": 115,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 70,
            "jth_1s_a_per_mm2": JTH_AL_ST_OHL,
            "standard": "PN-EN 50182",
        },
    },
    {
        "id": "line-base-al-st-35",
        "name": "Linia AFL 6 35/6,0 mm²",
        "params": {
            "conductor_material": "AL_ST",
            "cross_section_mm2": 35,
            "r_ohm_per_km": 0.814,
            "x_ohm_per_km": 0.380,
            "b_us_per_km": 2.70,
            "rated_current_a": 145,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 70,
            "jth_1s_a_per_mm2": JTH_AL_ST_OHL,
            "standard": "PN-EN 50182",
        },
    },
    {
        "id": "line-base-al-st-50",
        "name": "Linia AFL 6 50/8,0 mm²",
        "params": {
            "conductor_material": "AL_ST",
            "cross_section_mm2": 50,
            "r_ohm_per_km": 0.572,
            "x_ohm_per_km": 0.368,
            "b_us_per_km": 2.80,
            "rated_current_a": 185,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 70,
            "jth_1s_a_per_mm2": JTH_AL_ST_OHL,
            "standard": "PN-EN 50182",
        },
    },
    {
        "id": "line-base-al-st-70",
        "name": "Linia AFL 6 70/11,0 mm²",
        "params": {
            "conductor_material": "AL_ST",
            "cross_section_mm2": 70,
            "r_ohm_per_km": 0.408,
            "x_ohm_per_km": 0.355,
            "b_us_per_km": 2.90,
            "rated_current_a": 230,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 70,
            "jth_1s_a_per_mm2": JTH_AL_ST_OHL,
            "standard": "PN-EN 50182",
        },
    },
    {
        "id": "line-base-al-st-95",
        "name": "Linia AFL 6 95/16,0 mm²",
        "params": {
            "conductor_material": "AL_ST",
            "cross_section_mm2": 95,
            "r_ohm_per_km": 0.299,
            "x_ohm_per_km": 0.344,
            "b_us_per_km": 3.00,
            "rated_current_a": 280,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 70,
            "jth_1s_a_per_mm2": JTH_AL_ST_OHL,
            "standard": "PN-EN 50182",
        },
    },
    {
        "id": "line-base-al-st-120",
        "name": "Linia AFL 6 120/20,0 mm²",
        "params": {
            "conductor_material": "AL_ST",
            "cross_section_mm2": 120,
            "r_ohm_per_km": 0.236,
            "x_ohm_per_km": 0.335,
            "b_us_per_km": 3.10,
            "rated_current_a": 330,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 70,
            "jth_1s_a_per_mm2": JTH_AL_ST_OHL,
            "standard": "PN-EN 50182",
        },
    },
    {
        "id": "line-base-al-st-150",
        "name": "Linia AFL 8 150/25,0 mm²",
        "params": {
            "conductor_material": "AL_ST",
            "cross_section_mm2": 150,
            "r_ohm_per_km": 0.189,
            "x_ohm_per_km": 0.327,
            "b_us_per_km": 3.20,
            "rated_current_a": 380,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 70,
            "jth_1s_a_per_mm2": JTH_AL_ST_OHL,
            "standard": "PN-EN 50182",
        },
    },
    {
        "id": "line-base-al-st-185",
        "name": "Linia AFL 8 185/30,0 mm²",
        "params": {
            "conductor_material": "AL_ST",
            "cross_section_mm2": 185,
            "r_ohm_per_km": 0.152,
            "x_ohm_per_km": 0.319,
            "b_us_per_km": 3.30,
            "rated_current_a": 440,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 70,
            "jth_1s_a_per_mm2": JTH_AL_ST_OHL,
            "standard": "PN-EN 50182",
            "source_reference": "PN-EN 50182 / katalog linii AFL 8 / typowe dane OSD",
        },
    },
    {
        "id": "line-base-al-st-240",
        "name": "Linia AFL 8 240/40,0 mm²",
        "params": {
            "conductor_material": "AL_ST",
            "cross_section_mm2": 240,
            "r_ohm_per_km": 0.117,
            "x_ohm_per_km": 0.310,
            "b_us_per_km": 3.40,
            "rated_current_a": 520,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 70,
            "jth_1s_a_per_mm2": JTH_AL_ST_OHL,
            "standard": "PN-EN 50182",
            "source_reference": "PN-EN 50182 / katalog linii AFL 8 / typowe dane OSD",
        },
    },
]

# =============================================================================
# TYPY BAZOWE — LINIE NAPOWIETRZNE AFL 2 (ACSR lekki rdzeń stalowy)
# Stosowane w sieciach SN o mniejszych obciążeniach mechanicznych
# =============================================================================

LINE_AFL2_BASE: list[dict[str, Any]] = [
    {
        "id": "line-base-afl2-35",
        "name": "Linia AFL 2 35/6,2 mm²",
        "params": {
            "conductor_material": "AL_ST",
            "cross_section_mm2": 35,
            "r_ohm_per_km": 0.822,
            "x_ohm_per_km": 0.381,
            "b_us_per_km": 2.72,
            "rated_current_a": 148,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 70,
            "jth_1s_a_per_mm2": JTH_AL_ST_OHL,
            "standard": "PN-EN 50182",
            "source_reference": "PN-EN 50182 / katalog linii AFL 2 / dane typowe",
        },
    },
    {
        "id": "line-base-afl2-50",
        "name": "Linia AFL 2 50/8,0 mm²",
        "params": {
            "conductor_material": "AL_ST",
            "cross_section_mm2": 50,
            "r_ohm_per_km": 0.574,
            "x_ohm_per_km": 0.369,
            "b_us_per_km": 2.82,
            "rated_current_a": 185,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 70,
            "jth_1s_a_per_mm2": JTH_AL_ST_OHL,
            "standard": "PN-EN 50182",
            "source_reference": "PN-EN 50182 / katalog linii AFL 2 / dane typowe",
        },
    },
    {
        "id": "line-base-afl2-70",
        "name": "Linia AFL 2 70/11,0 mm²",
        "params": {
            "conductor_material": "AL_ST",
            "cross_section_mm2": 70,
            "r_ohm_per_km": 0.410,
            "x_ohm_per_km": 0.357,
            "b_us_per_km": 2.92,
            "rated_current_a": 232,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 70,
            "jth_1s_a_per_mm2": JTH_AL_ST_OHL,
            "standard": "PN-EN 50182",
            "source_reference": "PN-EN 50182 / katalog linii AFL 2 / dane typowe",
        },
    },
    {
        "id": "line-base-afl2-95",
        "name": "Linia AFL 2 95/16,0 mm²",
        "params": {
            "conductor_material": "AL_ST",
            "cross_section_mm2": 95,
            "r_ohm_per_km": 0.301,
            "x_ohm_per_km": 0.346,
            "b_us_per_km": 3.02,
            "rated_current_a": 280,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 70,
            "jth_1s_a_per_mm2": JTH_AL_ST_OHL,
            "standard": "PN-EN 50182",
            "source_reference": "PN-EN 50182 / katalog linii AFL 2 / dane typowe",
        },
    },
    {
        "id": "line-base-afl2-120",
        "name": "Linia AFL 2 120/20,0 mm²",
        "params": {
            "conductor_material": "AL_ST",
            "cross_section_mm2": 120,
            "r_ohm_per_km": 0.238,
            "x_ohm_per_km": 0.337,
            "b_us_per_km": 3.12,
            "rated_current_a": 332,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 70,
            "jth_1s_a_per_mm2": JTH_AL_ST_OHL,
            "standard": "PN-EN 50182",
            "source_reference": "PN-EN 50182 / katalog linii AFL 2 / dane typowe",
        },
    },
]

# =============================================================================
# TYPY PRODUCENTÓW — NKT
# =============================================================================

CABLE_NKT_TYPES: list[dict[str, Any]] = [
    {
        "id": "cable-nkt-n2xs2y-1x150",
        "name": "NKT N2XS2Y 1×150/25 mm² 12/20 kV",
        "params": {
            "manufacturer": "NKT",
            "trade_name": "N2XS2Y 1x150/25",
            "base_type_id": "cable-base-xlpe-al-1c-150",
            "conductor_material": "AL",
            "insulation_type": "XLPE",
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "cross_section_mm2": 150,
            "number_of_cores": 1,
            "r_ohm_per_km": 0.206,
            "x_ohm_per_km": 0.107,
            "c_nf_per_km": 290,
            "rated_current_a": 310,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 90,
            "jth_1s_a_per_mm2": JTH_AL_XLPE,
            "standard": "IEC 60502-2",
        },
    },
    {
        "id": "cable-nkt-n2xs2y-1x240",
        "name": "NKT N2XS2Y 1×240/25 mm² 12/20 kV",
        "params": {
            "manufacturer": "NKT",
            "trade_name": "N2XS2Y 1x240/25",
            "base_type_id": "cable-base-xlpe-al-1c-240",
            "conductor_material": "AL",
            "insulation_type": "XLPE",
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "cross_section_mm2": 240,
            "number_of_cores": 1,
            "r_ohm_per_km": 0.125,
            "x_ohm_per_km": 0.098,
            "c_nf_per_km": 345,
            "rated_current_a": 420,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 90,
            "jth_1s_a_per_mm2": JTH_AL_XLPE,
            "standard": "IEC 60502-2",
        },
    },
    {
        "id": "cable-nkt-na2xs2y-3x150",
        "name": "NKT NA2XS2Y 3×150/25 mm² 12/20 kV",
        "params": {
            "manufacturer": "NKT",
            "trade_name": "NA2XS2Y 3x150/25",
            "base_type_id": "cable-base-xlpe-al-3c-150",
            "conductor_material": "AL",
            "insulation_type": "XLPE",
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "cross_section_mm2": 150,
            "number_of_cores": 3,
            "r_ohm_per_km": 0.206,
            "x_ohm_per_km": 0.094,
            "c_nf_per_km": 425,
            "rated_current_a": 270,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 90,
            "jth_1s_a_per_mm2": JTH_AL_XLPE,
            "standard": "IEC 60502-2",
        },
    },
]

# =============================================================================
# TYPY PRODUCENTÓW — TELE-FONIKA KABLE
# =============================================================================

CABLE_TELEFONIKA_TYPES: list[dict[str, Any]] = [
    {
        "id": "cable-tfk-xruhakxs-1x150",
        "name": "TFK XRUHAKXS 1×150/25 mm² 12/20 kV",
        "params": {
            "manufacturer": "Tele-Fonika Kable",
            "trade_name": "XRUHAKXS 1x150/25",
            "base_type_id": "cable-base-xlpe-al-1c-150",
            "conductor_material": "AL",
            "insulation_type": "XLPE",
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "cross_section_mm2": 150,
            "number_of_cores": 1,
            "r_ohm_per_km": 0.206,
            "x_ohm_per_km": 0.108,
            "c_nf_per_km": 285,
            "rated_current_a": 305,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 90,
            "jth_1s_a_per_mm2": JTH_AL_XLPE,
            "standard": "IEC 60502-2",
        },
    },
    {
        "id": "cable-tfk-xruhakxs-1x240",
        "name": "TFK XRUHAKXS 1×240/25 mm² 12/20 kV",
        "params": {
            "manufacturer": "Tele-Fonika Kable",
            "trade_name": "XRUHAKXS 1x240/25",
            "base_type_id": "cable-base-xlpe-al-1c-240",
            "conductor_material": "AL",
            "insulation_type": "XLPE",
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "cross_section_mm2": 240,
            "number_of_cores": 1,
            "r_ohm_per_km": 0.125,
            "x_ohm_per_km": 0.099,
            "c_nf_per_km": 340,
            "rated_current_a": 410,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 90,
            "jth_1s_a_per_mm2": JTH_AL_XLPE,
            "standard": "IEC 60502-2",
        },
    },
    {
        "id": "cable-tfk-yakxs-3x120",
        "name": "TFK YAKXS 3×120/16 mm² 12/20 kV",
        "params": {
            "manufacturer": "Tele-Fonika Kable",
            "trade_name": "YAKXS 3x120/16",
            "base_type_id": "cable-base-xlpe-al-3c-120",
            "conductor_material": "AL",
            "insulation_type": "XLPE",
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "cross_section_mm2": 120,
            "number_of_cores": 3,
            "r_ohm_per_km": 0.253,
            "x_ohm_per_km": 0.100,
            "c_nf_per_km": 390,
            "rated_current_a": 230,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 90,
            "jth_1s_a_per_mm2": JTH_AL_XLPE,
            "standard": "IEC 60502-2",
        },
    },
]

# =============================================================================
# TYP NIEKOMPLETNY — do testów (brak danych cieplnych)
# =============================================================================

CABLE_ENEA_OPERATOR_STANDARD_TYPES: list[dict[str, Any]] = [
    {
        "id": "cable-enea-operator-xruhakxs-1x120",
        "name": "ENEA Operator standard - XRUHAKXS 1x120/25 mm2 12/20 kV",
        "params": {
            "manufacturer": "ENEA Operator",
            "trade_name": "XRUHAKXS 1x120/25",
            "base_type_id": "cable-base-xlpe-al-1c-120",
            "conductor_material": "AL",
            "insulation_type": "XLPE",
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "cross_section_mm2": 120,
            "number_of_cores": 1,
            "r_ohm_per_km": 0.253,
            "x_ohm_per_km": 0.118,
            "c_nf_per_km": 240,
            "rated_current_a": 255,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 90,
            "jth_1s_a_per_mm2": JTH_AL_XLPE,
            "standard": "ENEA Operator / PN-HD 620 / IEC 60502-2",
        },
    },
    {
        "id": "cable-enea-operator-xruhakxs-1x240",
        "name": "ENEA Operator standard - XRUHAKXS 1x240/25 mm2 12/20 kV",
        "params": {
            "manufacturer": "ENEA Operator",
            "trade_name": "XRUHAKXS 1x240/25",
            "base_type_id": "cable-base-xlpe-al-1c-240",
            "conductor_material": "AL",
            "insulation_type": "XLPE",
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "cross_section_mm2": 240,
            "number_of_cores": 1,
            "r_ohm_per_km": 0.125,
            "x_ohm_per_km": 0.099,
            "c_nf_per_km": 340,
            "rated_current_a": 410,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 90,
            "jth_1s_a_per_mm2": JTH_AL_XLPE,
            "standard": "ENEA Operator / PN-HD 620 / IEC 60502-2",
        },
    },
    {
        "id": "cable-enea-operator-na2xs2y-1x150",
        "name": "ENEA Operator standard - NA2XS2Y 1x150/25 mm2 12/20 kV",
        "params": {
            "manufacturer": "ENEA Operator",
            "trade_name": "NA2XS2Y 1x150/25",
            "base_type_id": "cable-base-xlpe-al-1c-150",
            "conductor_material": "AL",
            "insulation_type": "XLPE",
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "cross_section_mm2": 150,
            "number_of_cores": 1,
            "r_ohm_per_km": 0.206,
            "x_ohm_per_km": 0.107,
            "c_nf_per_km": 290,
            "rated_current_a": 310,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 90,
            "jth_1s_a_per_mm2": JTH_AL_XLPE,
            "standard": "ENEA Operator / PN-HD 620 / IEC 60502-2",
        },
    },
    {
        "id": "cable-enea-operator-na2xs2y-1x240",
        "name": "ENEA Operator standard - NA2XS2Y 1x240/25 mm2 12/20 kV",
        "params": {
            "manufacturer": "ENEA Operator",
            "trade_name": "NA2XS2Y 1x240/25",
            "base_type_id": "cable-base-xlpe-al-1c-240",
            "conductor_material": "AL",
            "insulation_type": "XLPE",
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "cross_section_mm2": 240,
            "number_of_cores": 1,
            "r_ohm_per_km": 0.125,
            "x_ohm_per_km": 0.098,
            "c_nf_per_km": 345,
            "rated_current_a": 420,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 90,
            "jth_1s_a_per_mm2": JTH_AL_XLPE,
            "standard": "ENEA Operator / PN-HD 620 / IEC 60502-2",
        },
    },
]


# Obowiazujacy od 01.07.2026 standard ENEA: tab. 3 dopuszcza kable
# XUHAKXS1/XRUHAKXS1/XnUHAKXS1/XnRUHAKXS1 o zyle roboczej 70, 150, 240 mm2
# i powrotnej 25 mm2, U0/U = 12/20 kV. Nie jest to katalog producenta!
ENEA_KABLE_SN_2026_URL = (
    "https://www.operator.enea.pl/media/4774/uslugi-dystrybucyjne/"
    "elektroenergetyczne-linie-kablowe-sn-obowiazuje-od-01072026pdf.pdf"
)
NKT_XRUHAKXS1_KARTA_URL = (
    "https://sklep.enexon.pl/amfile/file/download/file/708137/product/8814/"
)
ENEA_KABLE_SN_2026_SOURCE_REFERENCE = (
    "ENEA Operator, Elektroenergetyczne linie kablowe SN, wer. 03.2026,"
    " zatw. uchwałą 202/2026, obowiązuje 01.07.2026, pkt 4.2.2, tab. 3: "
    + ENEA_KABLE_SN_2026_URL
)
NKT_XRUHAKXS1_2026_SOURCE_REFERENCE = (
    ENEA_KABLE_SN_2026_SOURCE_REFERENCE
    + " || NKT, XRUHAKXS1 12/20 kV, CTL00109 rev. 4,"
    " s. 1-3 (dane wyrobu): " + NKT_XRUHAKXS1_KARTA_URL
)
NKT_XUHAKXS1_KARTA_URL = (
    "https://sklep.enexon.pl/amfile/file/download/file/845270/product/236262/"
)
NKT_XUHAKXS1_2026_SOURCE_REFERENCE = (
    ENEA_KABLE_SN_2026_SOURCE_REFERENCE
    + " || NKT, XUHAKXS1 12/20 kV, CTL00352 rev. 1,"
    " s. 1-2 (dane wyrobu): " + NKT_XUHAKXS1_KARTA_URL
)


def _kabel_nkt_zgodny_z_enea_2026(
    *, przekroj: int, r20: float, pojemnosc_uf: float, indukcyjnosc_mh: float,
    iz_ziemia_trojkat_a: float, ith_fazowy_ka: float,
    rodzina: str = "XRUHAKXS1",
) -> dict[str, Any]:
    """Wariant z tab. 3 ENEA i karty NKT; reaktancja X=2*pi*50*L (uklad trojkat)."""
    import math

    if przekroj not in (70, 150, 240) or rodzina not in ("XRUHAKXS1", "XUHAKXS1"):
        raise ValueError("Typ/przekrój nie występuje w tab. 3 ENEA 03.2026")
    nazwa_zrodla = (
        NKT_XRUHAKXS1_2026_SOURCE_REFERENCE
        if rodzina == "XRUHAKXS1"
        else NKT_XUHAKXS1_2026_SOURCE_REFERENCE
    )
    return {
        "id": f"cable-enea-2026-nkt-{rodzina.lower()}-{przekroj}-25",
        "name": f"NKT {rodzina} 1×{przekroj}/25 mm² 12/20 kV (ENEA 03.2026)",
        "params": {
            "manufacturer": "NKT",
            "trade_name": f"{rodzina} 1x{przekroj}/25",
            "conductor_material": "AL",
            "insulation_type": "XLPE",
            "return_conductor_material": "CU",
            "return_conductor_cross_section_mm2": 25.0,
            "return_conductor_ith_1s_a": 5000.0,
            "return_conductor_jth_1s_a_per_mm2": 200.0,
            "cross_section_mm2": float(przekroj),
            "number_of_cores": 1,
            "r_ohm_per_km": r20,
            "x_ohm_per_km": round(math.tau * 50.0 * indukcyjnosc_mh / 1000.0, 6),
            "c_nf_per_km": pojemnosc_uf * 1000.0,
            "rated_current_a": iz_ziemia_trojkat_a,
            "ith_1s_a": ith_fazowy_ka * 1000.0,
            "jth_1s_a_per_mm2": JTH_AL_XLPE,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": TEMP_OPERATING_XLPE_C,
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "standard": "ENEA Operator SN 03.2026, tab. 3; PN-HD 620 10-R",
            "source_reference": nazwa_zrodla,
            "verification_status": "CZESCIOWO_ZWERYFIKOWANY",
            "catalog_status": "PRODUKCYJNY_V1",
            "contract_version": CATALOG_CONTRACT_VERSION,
            "verification_note": (
                "R20/C/L/Ith/Iz z NKT "
                + ("CTL00109 rev. 4" if rodzina == "XRUHAKXS1" else "CTL00352 rev. 1")
                + " (L w trójkąt, f=50 Hz). "
                "Iz dotyczy gruntu 20°C, rezystywności 1,0 K m/W, "
                "głębokości 0,7 m, obciążenia 0,7, kabli w trójkąt. "
                "Ith żyły powrotnej 5 kA/1 s z tabeli NKT; "
                "R0/X0 i rezystancja powrotna z założeń modelu, "
                "nie z dokumentacji producenta. "
                "Zgodność typ/przekrój z ENEA nie stanowi zatwierdzenia "
                "całego projektu ani gwarancji obciążalności w innych warunkach. "
                "ENEA tab. 2 wymaga klasy CPR Eca w stacjach z obsługą "
                "wewnętrzną lub budynkach stacji 110 kV/SN, a Fca dopuszcza "
                "dla rowów i stacji z obsługą zewnętrzną: klasę CPR "
                "konkretnego wariantu sprawdź w jego aktualnej DoP. "
                "Wymagana także weryfikacja powłoki HDPE z pkt 4.2.1."
            ),
        },
    }


CABLE_ENEA_2026_NKT_TYPES: list[dict[str, Any]] = [
    _kabel_nkt_zgodny_z_enea_2026(
        przekroj=70, r20=0.443, pojemnosc_uf=0.19,
        indukcyjnosc_mh=0.42, iz_ziemia_trojkat_a=260,
        ith_fazowy_ka=6.6,
    ),
    _kabel_nkt_zgodny_z_enea_2026(
        przekroj=150, r20=0.206, pojemnosc_uf=0.25,
        indukcyjnosc_mh=0.37, iz_ziemia_trojkat_a=398,
        ith_fazowy_ka=14.2,
    ),
    _kabel_nkt_zgodny_z_enea_2026(
        przekroj=240, r20=0.125, pojemnosc_uf=0.29,
        indukcyjnosc_mh=0.35, iz_ziemia_trojkat_a=523,
        ith_fazowy_ka=22.7,
    ),
    # Bez uszczelnienia poprzecznego: osobna karta NKT CTL00352 rev. 1.
    _kabel_nkt_zgodny_z_enea_2026(
        przekroj=70, r20=0.443, pojemnosc_uf=0.19,
        indukcyjnosc_mh=0.42, iz_ziemia_trojkat_a=260,
        ith_fazowy_ka=6.6, rodzina="XUHAKXS1",
    ),
    _kabel_nkt_zgodny_z_enea_2026(
        przekroj=150, r20=0.206, pojemnosc_uf=0.25,
        indukcyjnosc_mh=0.37, iz_ziemia_trojkat_a=398,
        ith_fazowy_ka=14.2, rodzina="XUHAKXS1",
    ),
    _kabel_nkt_zgodny_z_enea_2026(
        przekroj=240, r20=0.125, pojemnosc_uf=0.29,
        indukcyjnosc_mh=0.35, iz_ziemia_trojkat_a=523,
        ith_fazowy_ka=22.7, rodzina="XUHAKXS1",
    ),
]



# Pełny typoszereg NKT CTL00109 rev. 4 — także poza specyfikacją ENEA.
# W instalacji odbiorcy nie wolno filtrować katalogu po tab. 3 ENEA.
# R20/C/L/Iz/Ith pochodzą z kart PRODUCENTA; X = 2π·50 Hz·L(trójkąt).
# Odrębne wartości L przy innym przekroju ekranu mają własny wiersz.
# Format: przekrój, powrót, R20, C [µF/km], L[mH/km], Iz_grunt_trojkąt,
# Ith_żyły [kA], Ith_powrotu[kA].
_NKT_CTL00109_PELNY_TYPO_SZEREG: tuple[tuple[int, int, float, float, float, int, float, float], ...] = (
    (50, 16, 0.641, 0.17, 0.45, 212, 4.7, 3.2),
    (70, 25, 0.443, 0.19, 0.42, 260, 6.6, 5.0),
    (120, 25, 0.253, 0.23, 0.39, 354, 11.3, 5.0),
    (120, 50, 0.253, 0.23, 0.38, 354, 11.3, 10.0),
    (150, 25, 0.206, 0.25, 0.37, 398, 14.2, 5.0),
    (150, 50, 0.206, 0.25, 0.37, 398, 14.2, 10.0),
    (240, 25, 0.125, 0.29, 0.35, 523, 22.7, 5.0),
    (240, 50, 0.125, 0.29, 0.34, 523, 22.7, 10.0),
    (300, 25, 0.100, 0.32, 0.33, 589, 28.4, 5.0),
    (300, 50, 0.100, 0.32, 0.33, 589, 28.4, 10.0),
    (400, 25, 0.0778, 0.36, 0.32, 675, 37.8, 5.0),
    (400, 50, 0.0778, 0.36, 0.32, 675, 37.8, 10.0),
    (500, 25, 0.0605, 0.40, 0.31, 766, 47.3, 5.0),
    (630, 25, 0.0469, 0.44, 0.29, 870, 59.6, 5.0),
    (630, 35, 0.0469, 0.44, 0.29, 870, 59.6, 7.0),
    (630, 50, 0.0469, 0.44, 0.29, 870, 59.6, 10.0),
)

def _nkt_pelny_odcinek_od_punktu_przylaczenia() -> list[dict[str, Any]]:
    """Warianty CTL00109 poza 3 typami już istniejącymi jako ENEA 2026."""
    import math

    pokryte_enea = {(70, 25), (150, 25), (240, 25)}
    wynik = []
    for przekroj, powrot, r20, pojemnosc, l_mh, iz, ith, ith_powrot in _NKT_CTL00109_PELNY_TYPO_SZEREG:
        if (przekroj, powrot) in pokryte_enea:
            continue
        wynik.append({
            "id": f"cable-nkt-xruhakxs1-{przekroj}-{powrot}-12-20",
            "name": f"NKT XRUHAKXS1 1×{przekroj}/{powrot} mm² 12/20 kV",
            "params": {
                "manufacturer": "NKT",
                "trade_name": f"XRUHAKXS1 1x{przekroj}/{powrot}",
                "conductor_material": "AL",
                "return_conductor_material": "CU",
                "return_conductor_cross_section_mm2": float(powrot),
                "return_conductor_ith_1s_a": ith_powrot * 1000.0,
                "return_conductor_jth_1s_a_per_mm2": ith_powrot * 1000.0 / powrot,
                "insulation_type": "XLPE",
                "cross_section_mm2": float(przekroj),
                "number_of_cores": 1,
                "r_ohm_per_km": r20,
                "x_ohm_per_km": round(math.tau * 50.0 * l_mh / 1000, 6),
                "c_nf_per_km": pojemnosc * 1000.0,
                "rated_current_a": float(iz),
                "ith_1s_a": ith * 1000.0,
                "jth_1s_a_per_mm2": ith * 1000.0 / przekroj,
                "voltage_rating_kv": 20.0,
                "max_temperature_c": TEMP_OPERATING_XLPE_C,
                "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
                "standard": "PN-HD 620 10-R",
                "source_reference": (
                    "NKT XRUHAKXS1 12/20 kV, CTL00109 rev. 4, str. 2-3: "
                    + NKT_XRUHAKXS1_KARTA_URL
                ),
                "catalog_status": "PRODUKCYJNY_V1",
                "verification_status": "CZESCIOWO_ZWERYFIKOWANY",
                "contract_version": CATALOG_CONTRACT_VERSION,
                "verification_note": (
                    "Parametry elektryczne i cieplne z dokładnego wiersza NKT "
                    "CTL00109 rev. 4. Iz: trójkąt, grunt 20°C, 1,0 K m/W, "
                    "głębokość 0,7 m, współczynnik obciążenia 0,7. "
                    "Składowa zerowa R0/X0 jest liczona z jawnych założeń "
                    "i nie pochodzi z karty NKT. "
                    "To pełnoprawny wariant kabla dla instalacji odbiorcy; "
                    "nie oznaczono zgodności z ograniczonym typoszeregiem ENEA."
                ),
            },
        })
    return wynik


CABLE_NKT_PELNY_ODBIORCA_TYPES = _nkt_pelny_odcinek_od_punktu_przylaczenia()

CABLE_INCOMPLETE_TYPES: list[dict[str, Any]] = [
    {
        "id": "cable-incomplete-test",
        "name": "Kabel testowy (niekompletne dane cieplne)",
        "params": {
            "conductor_material": "AL",
            "insulation_type": "XLPE",
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "cross_section_mm2": 120,
            "number_of_cores": 1,
            "r_ohm_per_km": 0.253,
            "x_ohm_per_km": 0.112,
            "c_nf_per_km": 264,
            "rated_current_a": 265,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 90,
            # BRAK: ith_1s_a i jth_1s_a_per_mm2 — niekompletne dane cieplne
            "standard": "TEST",
        },
    },
]

LINE_INCOMPLETE_TYPES: list[dict[str, Any]] = [
    {
        "id": "line-incomplete-test",
        "name": "Linia testowa (niekompletne dane cieplne)",
        "params": {
            "conductor_material": "AL",
            "cross_section_mm2": 70,
            "r_ohm_per_km": 0.411,
            "x_ohm_per_km": 0.353,
            "b_us_per_km": 2.95,
            "rated_current_a": 220,
            "voltage_rating_kv": 20.0,
            "max_temperature_c": 70,
            # BRAK: ith_1s_a i jth_1s_a_per_mm2 — niekompletne dane cieplne
            "standard": "TEST",
        },
    },
]

# =============================================================================
# AGREGACJA — wszystkie typy kabli
# =============================================================================


def get_all_cable_types() -> list[dict[str, Any]]:
    """
    Zwraca wszystkie typy kabli SN w deterministycznej kolejności.

    Kolejność: bazowe XLPE Cu 1C, bazowe XLPE Al 1C, bazowe XLPE Cu 3C,
    bazowe XLPE Al 3C, bazowe EPR Cu 1C, bazowe EPR Al 1C,
    bazowe EPR Cu 3C, bazowe EPR Al 3C, producenci, niekompletne.
    """
    return _cable_records_with_quality()


def get_all_line_types() -> list[dict[str, Any]]:
    """
    Zwraca wszystkie typy linii napowietrznych SN w deterministycznej kolejności.

    Kolejność: bazowe AAL (Al), bazowe AFL 6 (Al/St), bazowe AFL 2 (Al/St lekki), niekompletne.
    Rodziny:
    - AAL: czyste aluminium, przekroje 16-240 mm² (10 rekordów)
    - AFL 6: aluminium-stal 6% rdzenia, przekroje 16-240 mm² (10 rekordów)
    - AFL 2: aluminium-stal 2% rdzenia (lekkie), przekroje 35-120 mm² (5 rekordów)
    """
    return _line_records_with_quality()


def get_base_cable_type_ids() -> list[str]:
    """Zwraca ID wszystkich bazowych typów kabli."""
    base_lists = [
        CABLE_XLPE_CU_1C_BASE,
        CABLE_XLPE_AL_1C_BASE,
        CABLE_XLPE_CU_3C_BASE,
        CABLE_XLPE_AL_3C_BASE,
        CABLE_EPR_CU_1C_BASE,
        CABLE_EPR_AL_1C_BASE,
        CABLE_EPR_CU_3C_BASE,
        CABLE_EPR_AL_3C_BASE,
    ]
    return [t["id"] for lst in base_lists for t in lst]


def get_base_line_type_ids() -> list[str]:
    """Zwraca ID wszystkich bazowych typów linii."""
    return [t["id"] for t in LINE_AL_BASE + LINE_AL_ST_BASE + LINE_AFL2_BASE]


def get_manufacturer_cable_type_ids() -> list[str]:
    """Zwraca ID wszystkich typów kabli producentów."""
    return [t["id"] for t in CABLE_NKT_TYPES + CABLE_TELEFONIKA_TYPES]


# =============================================================================
# STATYSTYKI KATALOGU
# =============================================================================


def get_catalog_statistics() -> dict[str, Any]:
    """Zwraca statystyki katalogu kabli i linii SN."""
    all_cables = get_all_cable_types()
    all_lines = get_all_line_types()

    base_cable_ids = set(get_base_cable_type_ids())
    manufacturer_cable_ids = set(get_manufacturer_cable_type_ids())
    incomplete_cable_ids = {t["id"] for t in CABLE_INCOMPLETE_TYPES}
    incomplete_line_ids = {t["id"] for t in LINE_INCOMPLETE_TYPES}

    return {
        "liczba_kabli_ogolem": len(all_cables),
        "liczba_kabli_produkcyjnych": len(
            [
                record
                for record in all_cables
                if (record.get("params") or {}).get("catalog_status")
                == CatalogStatus.PRODUKCYJNY_V1.value
            ]
        ),
        "liczba_kabli_bazowych": len(base_cable_ids),
        "liczba_kabli_producentow": len(manufacturer_cable_ids),
        "liczba_kabli_niekompletnych": len(incomplete_cable_ids),
        "liczba_linii_ogolem": len(all_lines),
        "liczba_linii_produkcyjnych": len(
            [
                record
                for record in all_lines
                if (record.get("params") or {}).get("catalog_status")
                == CatalogStatus.PRODUKCYJNY_V1.value
            ]
        ),
        "liczba_linii_bazowych": len(get_base_line_type_ids()),
        "liczba_linii_niekompletnych": len(incomplete_line_ids),
        "producenci_kabli": ["NKT", "Tele-Fonika Kable"],
        "rodziny_kabli": sorted(
            {
                family
                for family in (_cable_family(record["id"]) for record in all_cables)
                if family != "TEST"
            }
        ),
        "rodziny_linii": sorted(
            {
                family
                for family in (_line_family(record["id"]) for record in all_lines)
                if family != "TEST"
            }
        ),
        "materialy_przewodu": ["CU", "AL", "AL_ST"],
        "izolacje_kabli": ["XLPE", "EPR"],
        "przekroje_kabli_mm2": sorted(
            {
                int((record.get("params") or {}).get("cross_section_mm2", 0))
                for record in all_cables
                if (record.get("params") or {}).get("cross_section_mm2")
            }
        ),
        "przekroje_linii_mm2": sorted(
            {
                int((record.get("params") or {}).get("cross_section_mm2", 0))
                for record in all_lines
                if (record.get("params") or {}).get("cross_section_mm2")
            }
        ),
        "statusy_weryfikacji": _status_list(all_cables + all_lines, "verification_status"),
        "statusy_katalogowe": _status_list(all_cables + all_lines, "catalog_status"),
    }


def get_line_catalog_quality_summary() -> dict[str, Any]:
    """Zwraca podsumowanie jakości i szerokości katalogu linii napowietrznych."""

    lines = get_all_line_types()
    verification_counter = Counter(
        (record.get("params") or {}).get("verification_status") for record in lines
    )
    catalog_counter = Counter(
        (record.get("params") or {}).get("catalog_status") for record in lines
    )
    return {
        "liczba_linii_ogolem": len(lines),
        "liczba_linii_produkcyjnych": catalog_counter.get(CatalogStatus.PRODUKCYJNY_V1.value, 0),
        "liczba_linii_testowych": catalog_counter.get(CatalogStatus.TESTOWY.value, 0),
        "liczba_czesciowo_zweryfikowanych": verification_counter.get(
            CatalogVerificationStatus.CZESCIOWO_ZWERYFIKOWANY.value, 0
        ),
        "liczba_referencyjnych": verification_counter.get(
            CatalogVerificationStatus.REFERENCYJNY.value, 0
        ),
        "rodziny_linii": sorted(
            {
                family
                for family in (_line_family(record["id"]) for record in lines)
                if family != "TEST"
            }
        ),
        "przekroje_linii_mm2": sorted(
            {
                int((record.get("params") or {}).get("cross_section_mm2", 0))
                for record in lines
                if (record.get("params") or {}).get("cross_section_mm2")
            }
        ),
        "statusy_weryfikacji": _status_list(lines, "verification_status"),
        "statusy_katalogowe": _status_list(lines, "catalog_status"),
        "contract_version": CATALOG_CONTRACT_VERSION,
    }


def get_cable_catalog_quality_summary() -> dict[str, Any]:
    """Zwraca podsumowanie jakości i szerokości katalogu kabli SN."""

    cables = get_all_cable_types()
    verification_counter = Counter(
        (record.get("params") or {}).get("verification_status") for record in cables
    )
    catalog_counter = Counter(
        (record.get("params") or {}).get("catalog_status") for record in cables
    )
    return {
        "liczba_kabli_ogolem": len(cables),
        "liczba_kabli_produkcyjnych": catalog_counter.get(CatalogStatus.PRODUKCYJNY_V1.value, 0),
        "liczba_kabli_testowych": catalog_counter.get(CatalogStatus.TESTOWY.value, 0),
        "liczba_zweryfikowanych": verification_counter.get(
            CatalogVerificationStatus.ZWERYFIKOWANY.value, 0
        ),
        "liczba_czesciowo_zweryfikowanych": verification_counter.get(
            CatalogVerificationStatus.CZESCIOWO_ZWERYFIKOWANY.value, 0
        ),
        "rodziny_kabli": sorted(
            {
                family
                for family in (_cable_family(record["id"]) for record in cables)
                if family != "TEST"
            }
        ),
        "przekroje_kabli_mm2": sorted(
            {
                int((record.get("params") or {}).get("cross_section_mm2", 0))
                for record in cables
                if (record.get("params") or {}).get("cross_section_mm2")
            }
        ),
        "liczba_typow_1z": sum(
            1 for record in cables if (record.get("params") or {}).get("number_of_cores") == 1
        ),
        "liczba_typow_3z": sum(
            1 for record in cables if (record.get("params") or {}).get("number_of_cores") == 3
        ),
        "statusy_weryfikacji": _status_list(cables, "verification_status"),
        "statusy_katalogowe": _status_list(cables, "catalog_status"),
        "contract_version": CATALOG_CONTRACT_VERSION,
    }


# =============================================================================
# K30-22: KABLE POLSKIE PN-HD 620 S2 — RODZINA YHAKXS / YHKXS / XRUHKXS
# =============================================================================
#
# Polish standard MV cables per PN-HD 620 S2:
# - YHAKXS — XLPE aluminum, 1-zylowy, standard polski
# - YHKXS — XLPE miedz, 1-zylowy, standard polski
# - XRUHKXS — XLPE multi-core, distribution
# - AXRUHKXS — XLPE aluminum multi-core
#
# Producenci: TF Kable Telefonika, NKT, Bitner, ELPAR (Polski Producent
# Aparatury Rozdzielczej Niskiego Napięcia). Deklaracja zgodnosci z PTPiREE bez dokumentu —
# pozycje NIEWERYFIKOWANE (patrz ZRODLO_KABLI_POLSKICH_DEKLAROWANE).

CABLE_POLISH_PN_HD_620: list[dict[str, Any]] = [
    # YHAKXS 12/20 kV — aluminum single-core (najczesciej uzywany w PL)
    {
        "id": "cable-polish-yhakxs-1c-50",
        "name": "YHAKXS 1×50 12/20 kV (TF Kable)",
        "params": {
            "kind": "CABLE",
            "type": "cable",
            "voltage_rating_kv": 20.0,
            "cross_section_mm2": 50.0,
            "number_of_cores": 1,
            "conductor_material": "AL",
            "insulation_type": "XLPE",
            "max_temperature_c": TEMP_OPERATING_XLPE_C,
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "r_ohm_per_km": 0.641,
            "x_ohm_per_km": 0.130,
            "c_nf_per_km": 270.0,
            "rated_current_a": 160.0,
            "manufacturer": "TF Kable Telefonika",
            "series": "YHAKXS",
            "standard": "PN-HD 620 S2",
        },
    },
    {
        "id": "cable-polish-yhakxs-1c-95",
        "name": "YHAKXS 1×95 12/20 kV (TF Kable)",
        "params": {
            "kind": "CABLE",
            "type": "cable",
            "voltage_rating_kv": 20.0,
            "cross_section_mm2": 95.0,
            "number_of_cores": 1,
            "conductor_material": "AL",
            "insulation_type": "XLPE",
            "max_temperature_c": TEMP_OPERATING_XLPE_C,
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "r_ohm_per_km": 0.320,
            "x_ohm_per_km": 0.123,
            "c_nf_per_km": 320.0,
            "rated_current_a": 230.0,
            "manufacturer": "TF Kable Telefonika",
            "series": "YHAKXS",
            "standard": "PN-HD 620 S2",
        },
    },
    {
        "id": "cable-polish-yhakxs-1c-120",
        "name": "YHAKXS 1×120 12/20 kV (TF Kable)",
        "params": {
            "kind": "CABLE",
            "type": "cable",
            "voltage_rating_kv": 20.0,
            "cross_section_mm2": 120.0,
            "number_of_cores": 1,
            "conductor_material": "AL",
            "insulation_type": "XLPE",
            "max_temperature_c": TEMP_OPERATING_XLPE_C,
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "r_ohm_per_km": 0.253,
            "x_ohm_per_km": 0.121,
            "c_nf_per_km": 350.0,
            "rated_current_a": 265.0,
            "manufacturer": "TF Kable Telefonika",
            "series": "YHAKXS",
            "standard": "PN-HD 620 S2",
        },
    },
    {
        "id": "cable-polish-yhakxs-1c-150",
        "name": "YHAKXS 1×150 12/20 kV (TF Kable)",
        "params": {
            "kind": "CABLE",
            "type": "cable",
            "voltage_rating_kv": 20.0,
            "cross_section_mm2": 150.0,
            "number_of_cores": 1,
            "conductor_material": "AL",
            "insulation_type": "XLPE",
            "max_temperature_c": TEMP_OPERATING_XLPE_C,
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "r_ohm_per_km": 0.206,
            "x_ohm_per_km": 0.119,
            "c_nf_per_km": 380.0,
            "rated_current_a": 300.0,
            "manufacturer": "TF Kable Telefonika",
            "series": "YHAKXS",
            "standard": "PN-HD 620 S2",
        },
    },
    {
        "id": "cable-polish-yhakxs-1c-240",
        "name": "YHAKXS 1×240 12/20 kV (TF Kable)",
        "params": {
            "kind": "CABLE",
            "type": "cable",
            "voltage_rating_kv": 20.0,
            "cross_section_mm2": 240.0,
            "number_of_cores": 1,
            "conductor_material": "AL",
            "insulation_type": "XLPE",
            "max_temperature_c": TEMP_OPERATING_XLPE_C,
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "r_ohm_per_km": 0.125,
            "x_ohm_per_km": 0.115,
            "c_nf_per_km": 420.0,
            "rated_current_a": 380.0,
            "manufacturer": "TF Kable Telefonika",
            "series": "YHAKXS",
            "standard": "PN-HD 620 S2",
        },
    },
    # YHKXS 12/20 kV — copper single-core (industrial/data center)
    {
        "id": "cable-polish-yhkxs-1c-95",
        "name": "YHKXS 1×95 Cu 12/20 kV (TF Kable)",
        "params": {
            "kind": "CABLE",
            "type": "cable",
            "voltage_rating_kv": 20.0,
            "cross_section_mm2": 95.0,
            "number_of_cores": 1,
            "conductor_material": "CU",
            "insulation_type": "XLPE",
            "max_temperature_c": TEMP_OPERATING_XLPE_C,
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "r_ohm_per_km": 0.193,
            "x_ohm_per_km": 0.122,
            "c_nf_per_km": 320.0,
            "rated_current_a": 300.0,
            "manufacturer": "TF Kable Telefonika",
            "series": "YHKXS",
            "standard": "PN-HD 620 S2",
        },
    },
    {
        "id": "cable-polish-yhkxs-1c-150",
        "name": "YHKXS 1×150 Cu 12/20 kV (Bitner)",
        "params": {
            "kind": "CABLE",
            "type": "cable",
            "voltage_rating_kv": 20.0,
            "cross_section_mm2": 150.0,
            "number_of_cores": 1,
            "conductor_material": "CU",
            "insulation_type": "XLPE",
            "max_temperature_c": TEMP_OPERATING_XLPE_C,
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "r_ohm_per_km": 0.124,
            "x_ohm_per_km": 0.119,
            "c_nf_per_km": 380.0,
            "rated_current_a": 380.0,
            "manufacturer": "Bitner Kable",
            "series": "YHKXS",
            "standard": "PN-HD 620 S2",
        },
    },
    {
        "id": "cable-polish-yhkxs-1c-240",
        "name": "YHKXS 1×240 Cu 12/20 kV (Bitner)",
        "params": {
            "kind": "CABLE",
            "type": "cable",
            "voltage_rating_kv": 20.0,
            "cross_section_mm2": 240.0,
            "number_of_cores": 1,
            "conductor_material": "CU",
            "insulation_type": "XLPE",
            "max_temperature_c": TEMP_OPERATING_XLPE_C,
            "short_circuit_temperature_c": TEMP_SHORT_CIRCUIT_XLPE_C,
            "r_ohm_per_km": 0.076,
            "x_ohm_per_km": 0.115,
            "c_nf_per_km": 420.0,
            "rated_current_a": 480.0,
            "manufacturer": "Bitner Kable",
            "series": "YHKXS",
            "standard": "PN-HD 620 S2",
        },
    },
]
