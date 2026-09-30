"""Kanon słownictwa ról pól SN — JEDNA prawda polskich nazw ról pól w backendzie (karta #141).

Po co: ta sama rola pola rozdzielnicy SN miała w produkcie kilka nazw („Pole sprzęgła" obok
„Pole sprzęgłowe", „Pole liniowe wejściowe" obok „liniowe dopływowe", „Pole odgałęźne" obok
„odpływowe"). Projektant widział różne słowa na to samo pole w kreatorze, na schemacie,
w szufladzie, w katalogu szablonów pól i w wynikach.

Kanon = mapa `NAZWA_ROLI_POLA_SN_PL` + nazwy ogólne (pole źródłowe bez technologii, pole bez
roli). Lustro frontendu: `FIELD_ROLE_LABEL_PL`, `FIELD_SOURCE_LABEL_PL`, `FIELD_GENERIC_LABEL_PL`
w `frontend/src/ui/sld/v2/station-rozdzielnia/contract.ts` — parytet obu stron przypięty testem
(`tests/enm/test_nazwy_pol_bez_kodow.py`). Każde inne słownictwo ról (rola pola w modelu
`Bay.bay_role`: IN/OUT/FEEDER/TR/COUPLER/MEASUREMENT/OZE, technologia źródła) najpierw
przechodzi na rolę kanonu, dopiero potem bierze nazwę z kanonu. Poza tym modułem backend nie
trzyma żadnej listy polskich nazw ról pól (strażnik `tests/ci/test_etykiety_rol_pol_sn.py`).

Moduł-LIŚĆ: bez importów spoza biblioteki standardowej — czytają go operacje ENM, katalog typów
(szablony pól, konfiguracje fabryczne), szablony stacji i analizy, więc nie może domykać cyklu.
"""

from __future__ import annotations

#: Rola pola podana aliasem modelu (`Bay.bay_role`, skróty kreatorów i szablonów) albo rolą
#: kanoniczną (`field_role`) → rola kanoniczna. JEDEN słownik dla operacji budujących stację
#: (`insert_station_on_segment_sn`, `append_station_on_endpoint`) i dla nazw ról — ta sama
#: tablica decyduje, jaką rolę dostaje pole i jak się nazywa (predykaty parami).
#: Rola źródłowa modelu `OZE` nie ma roli kanonicznej: technologię źródła zna dopiero pole
#: z generatorem, więc jej nazwą jest nazwa ogólna pola źródłowego.
ROLA_POLA_SN_Z_ALIASU: dict[str, str] = {
    "IN": "LINIA_IN",
    "OUT": "LINIA_OUT",
    "FEEDER": "LINIA_ODG",
    "TR": "TRANSFORMATOROWE",
    "COUPLER": "SPRZEGLO",
    "MEASUREMENT": "POMIAROWE",
    "LINIA_IN": "LINIA_IN",
    "LINIA_OUT": "LINIA_OUT",
    "LINIA_ODG": "LINIA_ODG",
    "TRANSFORMATOROWE": "TRANSFORMATOROWE",
    "SPRZEGLO": "SPRZEGLO",
    "POMIAROWE": "POMIAROWE",
}

#: Polska nazwa pola SN wg roli kanonicznej. Kod roli (`LINIA_IN`, `TR`) jest wartością pola
#: `field_role`/`bay_role`, nigdy częścią nazwy, którą projektant widzi na schemacie, w drzewie
#: i w zdaniach wyników.
NAZWA_ROLI_POLA_SN_PL: dict[str, str] = {
    "LINIA_IN": "Pole liniowe wejściowe",
    "LINIA_OUT": "Pole liniowe wyjściowe",
    "LINIA_ODG": "Pole odgałęźne",
    "TRANSFORMATOROWE": "Pole transformatorowe",
    "SPRZEGLO": "Pole sprzęgła",
    "POMIAROWE": "Pole pomiarowe",
    "PV_SN": "Pole źródłowe PV",
    "BESS_SN": "Pole źródłowe BESS",
    "FW_SN": "Pole źródłowe FW",
}

#: Pole źródłowe bez rozpoznanej technologii (rola modelu `OZE`).
NAZWA_POLA_ZRODLOWEGO_SN_PL = "Pole źródłowe SN"
#: Pole bez roli albo z rolą spoza kanonu — nazwa ogólna, bez zgadywania roli.
NAZWA_POLA_SN_OGOLNA_PL = "Pole SN"

#: Technologia źródła przekształtnikowego (`source_technology`) → rola kanoniczna pola
#: źródłowego SN.
ROLA_POLA_ZRODLOWEGO_SN_Z_TECHNOLOGII: dict[str, str] = {
    "PV": "PV_SN",
    "BESS": "BESS_SN",
    "FW": "FW_SN",
}


def kanoniczna_rola_pola_sn(raw: object) -> str:
    """Kanoniczna rola pola SN z dowolnego przyjmowanego aliasu.

    Rola nierozpoznana przechodzi bez zmiany (wołający decyduje, co z nią zrobić) — funkcja
    NIE zgaduje roli i nie podstawia domyślnej."""
    if not isinstance(raw, str):
        return ""
    normalized = raw.strip().upper()
    return ROLA_POLA_SN_Z_ALIASU.get(normalized, normalized)


def nazwa_roli_pola_sn(rola: object) -> str:
    """Polska nazwa pola SN dla roli podanej kanonicznie (`LINIA_IN`) albo aliasem modelu (`IN`).

    Rola źródłowa modelu (`OZE`) daje nazwę ogólną pola źródłowego; rola pusta albo spoza
    kanonu — nazwę ogólną „Pole SN" (funkcja nie zgaduje roli)."""
    if isinstance(rola, str) and rola.strip().upper() == "OZE":
        return NAZWA_POLA_ZRODLOWEGO_SN_PL
    return NAZWA_ROLI_POLA_SN_PL.get(kanoniczna_rola_pola_sn(rola), NAZWA_POLA_SN_OGOLNA_PL)


def nazwa_pola_zrodlowego_sn(technologia: object) -> str:
    """Nazwa pola źródłowego SN dla technologii źródła (PV/BESS/FW); technologia nieznana —
    nazwa ogólna pola źródłowego (bez zgadywania technologii)."""
    rola = (
        ROLA_POLA_ZRODLOWEGO_SN_Z_TECHNOLOGII.get(technologia.strip().upper())
        if isinstance(technologia, str)
        else None
    )
    return NAZWA_ROLI_POLA_SN_PL[rola] if rola else NAZWA_POLA_ZRODLOWEGO_SN_PL


def nazwa_roli_pola_sn_z_okresleniem(rola: object, okreslenie: str = "") -> str:
    """Nazwa roli z kanonu + określenie (np. „(sekcja A)", „sekcyjnego", „rezerwowe").

    Etykiety szablonów i jednostek katalogowych składają się WYŁĄCZNIE tą drogą — termin roli
    zawsze pochodzi z kanonu, a szablon dokłada tylko to, co go odróżnia."""
    nazwa = nazwa_roli_pola_sn(rola)
    okreslenie = okreslenie.strip()
    return f"{nazwa} {okreslenie}" if okreslenie else nazwa
