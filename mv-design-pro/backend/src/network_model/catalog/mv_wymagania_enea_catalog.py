"""Pozycje katalogu WYMAGAŃ STANDARDU ENEA Operator dla pól rozdzielnicy SN stacji 110 kV/SN
(karta GPZ-H5-APARATURA).

PO CO. Gniazda pól standardu (``gniazda_pol_enea.py``) wymagają aparatów, których katalog nie
miał wcale: odłącznika trójpołożeniowego i uziemnika pola SN, przekładnika Ferrantiego oraz
wyposażenia pól funkcyjnych SN (wskaźnik napięcia, transformator uziemiający, dławik gaszący,
rezystory, bateria pola BKR). Aparatury 110 kV tu nie ma — strona 110 kV jest funkcjonalną
granicą zasilania sieci SN (decyzja właściciela 2026-10-22, nagłówek ``gniazda_pol_enea``).
Impedancji uziemienia punktu neutralnego pozycje dławika i rezystora nie niosą — sposób
uziemienia i jego impedancję niesie ``GroundingConfig`` źródła z katalogu
``mv_neutral_grounding`` (``MvNeutralGroundingItem``); pozycja wyposażenia pola opisuje aparat
(zakres prądu, regulacja, obudowa), nie parametr fizyki.
Producenckich kart tych aparatów w repozytorium nie ma — pozycje niosą WYMAGANIA standardu
jako dane (status ``WYMAGANIE_STANDARDU_V1``): każda wartość jest progiem wymagania z
cytowaną podstawą, producent jest nieznany (``manufacturer = None``), a parametr, którego
standard nie podaje, jest polem nieobecnym (``None``). Dobór wykonawczy zastępuje pozycję
wymagania pozycją producenta.

ŹRÓDŁO: ENEA Operator sp. z o.o., „Stacje elektroenergetyczne 110 kV. Zeszyt 1. Stacje
dwutransformatorowe 110 kV/SN", wersja 02.2023-2 — numer punktu, tabeli albo rysunku przy
każdej pozycji (``source_reference``) i każdej interpretacji (``verification_note``).

KONWENCJE: ``un_kv`` aparatury łączeniowej = napięcie znamionowe aparatu U_r = U_m
(IEC 62271-1, jak cały katalog aparatury, nagłówek ``mv_switch_catalog.py``); ``icw_ka`` =
prąd wytrzymywany krótkotrwale przez ``icw_duration_s``; ``in_a``/``ik_ka`` = 0,0 dla rodzajów,
którym prąd ciągły albo wyłączalny nie przysługuje z definicji (uziemnik, odłącznik).
"""

from __future__ import annotations

from typing import Any

from .gniazda_pol_enea import (
    INTERPRETACJA_TROJPOLOZENIOWY,
    NAZWA_ODLACZNIKA_TROJPOLOZENIOWEGO,
)
from .types import CATALOG_CONTRACT_VERSION, CatalogStatus, CatalogVerificationStatus

DOKUMENT = (
    "ENEA Operator, Stacje elektroenergetyczne 110 kV, Zeszyt 1 — stacje dwutransformatorowe "
    "110 kV/SN (wersja 02.2023-2)"
)

_NOTA_WYMAGANIA = (
    "Pozycja WYMAGANIA STANDARDU — wartości są progami wymagań operatora (z podstawą), nie "
    "danymi wyrobu; parametr nieobecny = standard go nie podaje. Dobór wykonawczy wymaga "
    "pozycji producenta spełniającej te progi."
)


def _metadane(podstawa: str, *, interpretacja: str | None = None) -> dict[str, Any]:
    nota = _NOTA_WYMAGANIA if interpretacja is None else f"{_NOTA_WYMAGANIA} {interpretacja}"
    return {
        "manufacturer": None,
        "verification_status": CatalogVerificationStatus.REFERENCYJNY.value,
        "catalog_status": CatalogStatus.WYMAGANIE_STANDARDU_V1.value,
        "source_reference": f"{DOKUMENT}: {podstawa}",
        "contract_version": CATALOG_CONTRACT_VERSION,
        "verification_note": nota,
    }


# ---------------------------------------------------------------------------
# APARAT_SN — odłącznik trójpołożeniowy i uziemnik pola SN
# ---------------------------------------------------------------------------


def _lacznik(
    item_id: str,
    name: str,
    *,
    equipment_kind: str,
    un_kv: float,
    in_a: float,
    ik_ka: float,
    icw_ka: float | None,
    icw_duration_s: float | None,
    i_cu_ka: float | None,
    naped: str | None,
    podstawa: str,
    interpretacja: str | None = None,
) -> dict[str, Any]:
    return {
        "id": item_id,
        "name": name,
        "params": {
            "equipment_kind": equipment_kind,
            "un_kv": un_kv,
            "in_a": in_a,
            "ik_ka": ik_ka,
            "icw_ka": icw_ka,
            "icw_duration_s": icw_duration_s,
            "medium": None,
            "u_m_kv": un_kv,
            "i_cu_ka": i_cu_ka,
            "naped": naped,
            **_metadane(podstawa, interpretacja=interpretacja),
        },
    }


WYMAGANIA_APARATURY_LACZENIOWEJ: list[dict[str, Any]] = [
    *[
        _lacznik(
            f"enea-wym-sn-ds-es-24kv-{in_a:.0f}a-16ka-3s",
            f"{NAZWA_ODLACZNIKA_TROJPOLOZENIOWEGO[0].upper()}{NAZWA_ODLACZNIKA_TROJPOLOZENIOWEGO[1:]}"
            f" SN 24 kV {in_a:.0f} A 16 kA/3 s (wymaganie ENEA)",
            equipment_kind="DISCONNECTOR_EARTH_SWITCH",
            un_kv=24.0,
            in_a=in_a,
            ik_ka=0.0,
            icw_ka=16.0,
            icw_duration_s=3.0,
            i_cu_ka=None,
            naped="uziemnik: jeden wspólny napęd dla trzech faz",
            podstawa=(
                f"§13 (rozdzielnica 24 kV, odłączniki trójpołożeniowe dopuszczone, wspólny napęd "
                f"uziemnika), §9.2 (16 kA przez 3 s), {podstawa_pradu}"
            ),
            interpretacja=(
                f"{INTERPRETACJA_TROJPOLOZENIOWY[0].upper()}{INTERPRETACJA_TROJPOLOZENIOWY[1:]}."
            ),
        )
        for in_a, podstawa_pradu in (
            (630.0, "tabele 3 i 4 (pole liniowe, zespołu uziemiającego, BKR 630 A)"),
            (1250.0, "tabela 3 (pola TR i łącznika szyn, transformator do 25 MVA, 1250 A)"),
            (2000.0, "tabela 4 (pola TR i łącznika szyn, transformator 25–40 MVA, 2000 A)"),
        )
    ],
    _lacznik(
        "enea-wym-sn-es-24kv-16ka-3s",
        "Uziemnik pola SN 24 kV 16 kA/3 s (wymaganie ENEA)",
        equipment_kind="EARTH_SWITCH",
        un_kv=24.0,
        in_a=0.0,
        ik_ka=0.0,
        icw_ka=16.0,
        icw_duration_s=3.0,
        i_cu_ka=None,
        naped="jeden wspólny napęd dla trzech faz",
        podstawa="§13 (rozdzielnica 24 kV, wspólny napęd uziemnika), §9.2 (16 kA przez 3 s)",
    ),
]


# ---------------------------------------------------------------------------
# CT — przekładnik Ferrantiego pola liniowego SN
# ---------------------------------------------------------------------------


def _ct(
    item_id: str,
    name: str,
    *,
    ratio_primary_a: float,
    ratio_secondary_a: float,
    u_m_kv: float | None,
    odmiana: str,
    podstawa: str,
    interpretacja: str | None = None,
) -> dict[str, Any]:
    return {
        "id": item_id,
        "name": name,
        "params": {
            "ratio_primary_a": ratio_primary_a,
            "ratio_secondary_a": ratio_secondary_a,
            "accuracy_class": None,
            "burden_va": None,
            "ith_ka_1s": None,
            "u_m_kv": u_m_kv,
            "odmiana": odmiana,
            **_metadane(podstawa, interpretacja=interpretacja),
        },
    }


WYMAGANIA_PRZEKLADNIKOW_PRADOWYCH: list[dict[str, Any]] = [
    _ct(
        "enea-wym-sn-ct-ferranti-100-1",
        "Przekładnik Ferrantiego pola liniowego SN 100/1 (wymaganie ENEA)",
        ratio_primary_a=100.0,
        ratio_secondary_a=1.0,
        # Przekładnik nakładany na kabel — bez izolacji pierwotnej sieci (U_m nie dotyczy).
        u_m_kv=None,
        odmiana="FERRANTI",
        podstawa="§13 (przekładnik Ferrantiego w polu liniowym, złącze pomiarowe), rys. Z.10",
        interpretacja=(
            "Interpretacja rysunku: opis „1/100” przy przekładniku na rys. Z.10 odczytany jako "
            "przekładnia 100/1."
        ),
    ),
]


# ---------------------------------------------------------------------------
# ELEMENT_POLA_SN — wyposażenie pól SN
# ---------------------------------------------------------------------------


def _element(item_id: str, name: str, rodzaj: str, podstawa: str, **pola: Any) -> dict[str, Any]:
    return {
        "id": item_id,
        "name": name,
        "params": {"rodzaj": rodzaj, **pola, **_metadane(podstawa)},
    }


_TRANSFORMATOR_UZIEMIAJACY_WSPOLNE: dict[str, Any] = {
    "grupa_polaczen": "ZNyn11",
    "regulacja_pl": (
        "trójstopniowa beznapięciowa ±5% po stronie SN, ręczny napęd przełącznika zaczepów"
    ),
    "chlodzenie": "ONAN",
    "u_nn_v": 400.0,
    "s_nn_kva_min": 100.0,
}

WYMAGANIA_ELEMENTOW_POLA: list[dict[str, Any]] = [
    _element(
        "enea-wym-sn-wskaznik-napiecia-24kv",
        "Stacjonarny wskaźnik obecności napięcia SN 24 kV (wymaganie ENEA)",
        "WSKAZNIK_NAPIECIA",
        "§13 (stacjonarne wskaźniki obecności napięcia współpracujące z urządzeniami do "
        "uzgadniania faz; rozdzielnica 24 kV)",
        u_m_kv=24.0,
        uzgadnianie_faz=True,
    ),
    _element(
        "enea-wym-sn-transformator-uziemiajacy-rezystor",
        "Transformator uziemiający ZNyn11 z uzwojeniem nn — sieć uziemiona przez rezystor "
        "(wymaganie ENEA)",
        "TRANSFORMATOR_UZIEMIAJACY",
        "§16 (wymagania dla transformatora uziemiającego — punkt neutralny przez rezystor)",
        **_TRANSFORMATOR_UZIEMIAJACY_WSPOLNE,
    ),
    _element(
        "enea-wym-sn-transformator-uziemiajacy-kompensowany",
        "Transformator uziemiający ZNyn11 z uzwojeniem nn — sieć skompensowana (wymaganie ENEA)",
        "TRANSFORMATOR_UZIEMIAJACY",
        "§16 (wymagania techniczne transformatora uziemiającego — sieć skompensowana)",
        **_TRANSFORMATOR_UZIEMIAJACY_WSPOLNE,
        tryb_pracy_pl="praca dorywcza 2 h; moc uzwojenia kompensującego dostosowana do "
        "maksymalnego prądu dławika gaszącego",
    ),
    _element(
        "enea-wym-sn-dlawik-gaszacy-40-400a",
        "Dławik gaszący z płynną regulacją 40–400 A (wymaganie ENEA)",
        "DLAWIK_GASZACY",
        "§16 (dławik minimum 40–400 A, wymagania dla dławika gaszącego)",
        prad_zakres_min_a=40.0,
        prad_zakres_max_a=400.0,
        regulacja_zakres_pl="automatyczna płynna regulacja prądu kompensacyjnego 10–100%",
        uzwojenie_wtorne_pl="500 V (±10%), obciążalność ≥ 500 A przez 60 s",
        przekladnik_pl="przekładnia do zakresu 5 A, moc ≥ 15 VA, klasa ≥ 1",
        chlodzenie="ONAN",
        tryb_pracy_pl="praca dorywcza 2 h (KB 2)",
    ),
    _element(
        "enea-wym-sn-rezystor-wymuszajacy-awsc-20-40a",
        "Rezystor wymuszający AWSC (strona wtórna dławika) 20–40 A (wymaganie ENEA)",
        "REZYSTOR_WYMUSZAJACY",
        "§16 (AWSC z rezystorem po stronie wtórnej, prądy pierwotne 20–40 A)",
        prad_wymuszany_min_a=20.0,
        prad_wymuszany_max_a=40.0,
    ),
    _element(
        "enea-wym-sn-rezystor-uziemiajacy",
        "Rezystor uziemiający punktu neutralnego SN (wymaganie ENEA)",
        "REZYSTOR_UZIEMIAJACY",
        "§16 (wymagania dla rezystora uziemiającego)",
        obudowa_pl="z blach nierdzewnych; skrzynka obwodu wtórnego przekładnika na zewnątrz",
        przekladnik_pl="przekładnik prądowy z przekładnią zgodnie ze specyfikacją",
    ),
    _element(
        "enea-wym-sn-bateria-podwojna-gwiazda",
        "Bateria kondensatorów pola BKR w układzie podwójnej gwiazdy (wymaganie ENEA)",
        "BATERIA_KONDENSATOROW",
        "§17 (podwójna gwiazda, ogniwo ≥ 100 kvar, przekładnik w połączeniu międzygwiazdowym)",
        uklad="podwójna gwiazda",
        q_ogniwa_min_kvar=100.0,
        jednostki_pl="jednofazowe, dwubiegunowo izolowane, nietoksyczny impregnat",
        przekladnik_niezrownowazenia=True,
    ),
]


def get_enea_switch_requirement_types() -> list[dict[str, Any]]:
    """Pozycje wymagań ENEA aparatury łączeniowej (przestrzeń APARAT_SN)."""
    return list(WYMAGANIA_APARATURY_LACZENIOWEJ)


def get_enea_ct_requirement_types() -> list[dict[str, Any]]:
    """Pozycje wymagań ENEA przekładników prądowych (przestrzeń CT)."""
    return list(WYMAGANIA_PRZEKLADNIKOW_PRADOWYCH)


def get_enea_field_element_types() -> list[dict[str, Any]]:
    """Pozycje wymagań ENEA wyposażenia pól SN (przestrzeń ELEMENT_POLA_SN)."""
    return list(WYMAGANIA_ELEMENTOW_POLA)


# ---------------------------------------------------------------------------
# Gniazdo pola standardu → pozycja wymagania (obsadzenie „wymaganiami standardu”)
# ---------------------------------------------------------------------------

_VI_SN = "enea-wym-sn-wskaznik-napiecia-24kv"
_ES_SN = "enea-wym-sn-es-24kv-16ka-3s"
_DS_ES_SN_630 = "enea-wym-sn-ds-es-24kv-630a-16ka-3s"
_FERRANTI_SN = "enea-wym-sn-ct-ferranti-100-1"


def _gniazda_linii_sn(szablon: str, *, wskaznik_szyny: bool) -> dict[tuple[str, str], str]:
    wynik = {
        (szablon, "DS_ES"): _DS_ES_SN_630,
        (szablon, "ES"): _ES_SN,
        (szablon, "VI_KB"): _VI_SN,
        (szablon, "CT_F"): _FERRANTI_SN,
    }
    if wskaznik_szyny:
        wynik[(szablon, "VI_SZ")] = _VI_SN
    return wynik


#: ``(szablon pola standardu, gniazdo) → pozycja wymagania`` — gniazda, których wymagania
#: standard podaje BEZWARUNKOWO i które jedna pozycja wymagania wyraża w całości. Gniazda
#: poza tablicą zostają do doboru projektanta, bo pozycja wymagania byłaby domysłem:
#: wyłącznik, przekładniki i ograniczniki pól SN (katalog ma pozycje producentów; przekładnie
#: i rdzenie zależą od mocy transformatora), odłącznik trójpołożeniowy pól głównych SN (prąd ciągły
#: 1250 A albo 2000 A wg mocy transformatora — tabele 3/4) i odłączniki gałęzi punktu
#: neutralnego zespołu uziemiającego (standard nie podaje ich znamion). Spójność rodzaju,
#: przestrzeni i U_m każdej pozycji z gniazdem przypina
#: ``tests/network_model/catalog/test_pozycje_wymagan_gniazd.py``.
POZYCJE_WYMAGAN_GNIAZD: dict[tuple[str, str], str] = {
    # SN — pola liniowe (zał. Z.2, Z.10, Z.11, Z.11.1)
    **_gniazda_linii_sn("ENEA_SN_LINIA", wskaznik_szyny=False),
    **_gniazda_linii_sn("ENEA_SN_LINIA_POMIAR_ROZLICZENIOWY", wskaznik_szyny=True),
    **_gniazda_linii_sn("ENEA_SN_LINIA_POMIAR_NAPIECIA", wskaznik_szyny=True),
    # SN — pole transformatorowe (zał. Z.7): wskaźniki i uziemnik
    ("ENEA_SN_TR", "VI_SZ"): _VI_SN,
    ("ENEA_SN_TR", "ES"): _ES_SN,
    ("ENEA_SN_TR", "VI_KB"): _VI_SN,
    # SN — łącznik szyn (układ zał. Z.2, wyposażenie zał. Z.12 — A3): wskaźniki przy sekcjach
    ("ENEA_SN_LS", "VI_A"): _VI_SN,
    ("ENEA_SN_LS", "VI_B"): _VI_SN,
    ("ENEA_SN_LS_CELA_SPRZEGLA", "VI_SZ"): _VI_SN,
    ("ENEA_SN_LS_CELA_WYLACZNIKOWA", "VI_SZ"): _VI_SN,
    # SN — pole baterii kondensatorów (§17, zał. Z.16)
    ("ENEA_SN_BKR", "DS_ES"): _DS_ES_SN_630,
    ("ENEA_SN_BKR", "VI_KB"): _VI_SN,
    ("ENEA_SN_BKR", "BK"): "enea-wym-sn-bateria-podwojna-gwiazda",
    # SN — pola zespołu uziemiającego (§16, zał. Z.13–Z.15)
    ("ENEA_SN_ZU_DLAWIK", "DS_ES"): _DS_ES_SN_630,
    ("ENEA_SN_ZU_DLAWIK", "TU"): "enea-wym-sn-transformator-uziemiajacy-kompensowany",
    ("ENEA_SN_ZU_DLAWIK", "DL"): "enea-wym-sn-dlawik-gaszacy-40-400a",
    ("ENEA_SN_ZU_DLAWIK", "AWSC"): "enea-wym-sn-rezystor-wymuszajacy-awsc-20-40a",
    ("ENEA_SN_ZU_DLAWIK_REZYSTOR", "DS_ES"): _DS_ES_SN_630,
    ("ENEA_SN_ZU_DLAWIK_REZYSTOR", "TU"): "enea-wym-sn-transformator-uziemiajacy-kompensowany",
    ("ENEA_SN_ZU_DLAWIK_REZYSTOR", "DL"): "enea-wym-sn-dlawik-gaszacy-40-400a",
    ("ENEA_SN_ZU_DLAWIK_REZYSTOR", "RZ"): "enea-wym-sn-rezystor-uziemiajacy",
    ("ENEA_SN_ZU_REZYSTOR", "DS_ES"): _DS_ES_SN_630,
    ("ENEA_SN_ZU_REZYSTOR", "TU"): "enea-wym-sn-transformator-uziemiajacy-rezystor",
    ("ENEA_SN_ZU_REZYSTOR", "RZ"): "enea-wym-sn-rezystor-uziemiajacy",
    # SN — pole pomiaru napięcia (zał. Z.17)
    ("ENEA_SN_POMIAR", "DS_ES"): _DS_ES_SN_630,
    ("ENEA_SN_POMIAR", "VI"): _VI_SN,
}


def pozycja_wymagania_gniazda(szablon_ref: str, gniazdo_ref: str) -> str | None:
    """Pozycja wymagania standardu dla gniazda pola (``None`` — gniazdo do doboru projektanta)."""
    return POZYCJE_WYMAGAN_GNIAZD.get((szablon_ref, gniazdo_ref))
