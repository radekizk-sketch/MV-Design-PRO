"""Rodzaje aparatury łączeniowej SN i właściwe im wielkości zwarciowe — JEDNO źródło.

Liść bez importów modułów projektu: czytają go bramka rekordu (KAT-T-050 w
``catalog.types``), projekcja ``APARAT_SN`` (``catalog.repository``), rejestr wartości
roboczych (``catalog.wartosci_robocze`` — ``types`` importuje ten rejestr, więc zbiory nie
mogą żyć w ``types``), most dowodu doboru (``equipment_proof.catalog_bridge``) i eksport
fikstury frontu (``scripts/eksport_fixtur_harnessu.py`` → rozróżnienie „nie dotyczy” /
„brak danych” w interfejsie).

Rozróżnienie dwóch braków liczby w rekordzie aparatu:

* „nie dotyczy” — rodzaj aparatu z definicji normy tej wielkości nie ma (zdolność
  wyłączania zwarć rozłącznika, odłącznika i uziemnika; prąd krótkotrwały wytrzymywany
  bezpiecznika) — rozstrzyga RODZAJ, pole jest zawsze ``None``;
* „brak danych” — wielkość jest właściwa rodzajowi, a karta katalogowa jej nie podaje —
  pole ``None``.

Zero nie jest żadnym z nich (bramka KAT-T-050 odrzuca je w każdej wielkości).
"""

from __future__ import annotations

#: Komplet rodzajów aparatury łączeniowej (``SwitchEquipmentType.equipment_kind``).
RODZAJE_APARATURY_LACZENIOWEJ: frozenset[str] = frozenset(
    {"CIRCUIT_BREAKER", "LOAD_SWITCH", "DISCONNECTOR", "EARTH_SWITCH", "FUSE", "RECLOSER"}
)
#: Rodzaje aparatury łączeniowej SN ze ZNAMIONOWĄ zdolnością łączeniową zwarciową
#: (``SwitchEquipmentType.ik_ka``): wyłącznik i reklozer (PN-EN 62271-100 / -111) oraz
#: bezpiecznik (PN-EN 60282-1). Rozłącznik, odłącznik i uziemnik tej zdolności nie mają
#: z definicji normy — JEDNO źródło dla bramki rekordu (KAT-T-050) i dla odczytu
#: „nie dotyczy” zdolności wyłączania (``equipment_proof.catalog_bridge``).
RODZAJE_LACZNIKA_ZE_ZDOLNOSCIA_WYLACZANIA: frozenset[str] = frozenset(
    {"CIRCUIT_BREAKER", "RECLOSER", "FUSE"}
)
#: Rodzaje aparatury łączeniowej SN BEZ prądu krótkotrwałego wytrzymywanego
#: (``SwitchEquipmentType.icw_ka``): wkładka bezpiecznikowa przepala się, nie
#: przewodzi zwarcia przez czas znamionowy (PN-EN 60282-1 nie definiuje I_cw).
RODZAJE_LACZNIKA_BEZ_PRADU_KROTKOTRWALEGO: frozenset[str] = frozenset({"FUSE"})


#: Wielkości zwarciowe rekordu łącznika (``SwitchEquipmentType``) objęte bramką KAT-T-050.
WIELKOSCI_ZWARCIOWE_LACZNIKA: tuple[str, ...] = ("ik_ka", "icw_ka", "i_cu_ka")

#: Rodzaj aparatu SN projekcji ``APARAT_SN`` (``MVApparatusType.device_kind``) z rodzaju
#: rekordu łącznika (``SwitchEquipmentType.equipment_kind``) — JEDNO odwzorowanie dla
#: projekcji katalogu (``repository._derive_mv_apparatus_records``) i dla rozstrzygnięcia
#: „nie dotyczy” wielkości aparatu SN.
RODZAJ_APARATU_SN_Z_RODZAJU_LACZNIKA: dict[str, str] = {
    "CIRCUIT_BREAKER": "WYLACZNIK",
    "LOAD_SWITCH": "ROZLACZNIK",
    "DISCONNECTOR": "ODLACZNIK",
    "EARTH_SWITCH": "UZIEMNIK",
    "FUSE": "ROZLACZNIK_BEZPIECZNIKOWY",
    "RECLOSER": "REKLOZER",
}
#: Pole projekcji aparatu SN ← pole rekordu łącznika (te same wielkości zwarciowe).
POLE_LACZNIKA_Z_POLA_APARATU_SN: dict[str, str] = {
    "breaking_capacity_ka": "ik_ka",
    "i_th_ka": "icw_ka",
}
#: Wielkości zwarciowe pozycji aparatu SN (``MVApparatusType``) objęte bramką KAT-T-050.
WIELKOSCI_ZWARCIOWE_APARATU_SN: tuple[str, ...] = (
    "breaking_capacity_ka",
    "making_capacity_ka",
    "i_th_ka",
    "i_dyn_ka",
)


def wielkosc_zwarciowa_lacznika_dotyczy(equipment_kind: str, pole: str) -> bool:
    """Czy wielkość zwarciowa ``pole`` rekordu łącznika jest właściwa jego rodzajowi.

    JEDNO źródło rozstrzygnięcia „nie dotyczy” dla bramki rekordu (KAT-T-050),
    projekcji ``APARAT_SN`` i konsumentów wyjaśnień: ``ik_ka`` (znamionowa zdolność
    wyłączania zwarć) i ``i_cu_ka`` (znamionowy prąd wyłączalny zwarciowy) mają wyłącznie
    rodzaje z ``RODZAJE_LACZNIKA_ZE_ZDOLNOSCIA_WYLACZANIA``, ``icw_ka`` (prąd krótkotrwały
    wytrzymywany) — wszystkie rodzaje poza ``RODZAJE_LACZNIKA_BEZ_PRADU_KROTKOTRWALEGO``.
    """
    if pole in ("ik_ka", "i_cu_ka"):
        return equipment_kind in RODZAJE_LACZNIKA_ZE_ZDOLNOSCIA_WYLACZANIA
    if pole == "icw_ka":
        return equipment_kind not in RODZAJE_LACZNIKA_BEZ_PRADU_KROTKOTRWALEGO
    raise ValueError(f"Nieznana wielkość zwarciowa łącznika: {pole!r}")


def wielkosc_zwarciowa_aparatu_sn_dotyczy(device_kind: str, pole: str) -> bool:
    """Czy wielkość zwarciowa ``pole`` pozycji aparatu SN jest właściwa jego rodzajowi.

    Rozstrzyga przez rodzaj rekordu łącznika (odwrócone
    ``RODZAJ_APARATU_SN_Z_RODZAJU_LACZNIKA``) — ten sam predykat co bramka rekordu.
    Rodzaj spoza odwzorowania (pozycja aparatu SN nie z projekcji katalogu łączników) i
    pole bez odpowiednika w rekordzie łącznika (``making_capacity_ka``, ``i_dyn_ka``) nie
    mają rozstrzygnięcia „nie dotyczy” — wielkość traktowana jako właściwa.
    """
    if pole not in WIELKOSCI_ZWARCIOWE_APARATU_SN:
        raise ValueError(f"Nieznana wielkość zwarciowa aparatu SN: {pole!r}")
    pole_lacznika = POLE_LACZNIKA_Z_POLA_APARATU_SN.get(pole)
    rodzaj_lacznika = _RODZAJ_LACZNIKA_Z_RODZAJU_APARATU_SN.get(device_kind)
    if pole_lacznika is None or rodzaj_lacznika is None:
        return True
    return wielkosc_zwarciowa_lacznika_dotyczy(rodzaj_lacznika, pole_lacznika)


_RODZAJ_LACZNIKA_Z_RODZAJU_APARATU_SN: dict[str, str] = {
    aparat: lacznik for lacznik, aparat in RODZAJ_APARATU_SN_Z_RODZAJU_LACZNIKA.items()
}


# ---------------------------------------------------------------------------
# Aparaty pola baterii kondensatorów (BKR) — karta UX-04/POLE-BKR-MODEL
# ---------------------------------------------------------------------------
#
# ENEA Operator, Stacje 110 kV, Zeszyt 1, §17 s. 32 i Zał. 16: bateria w układzie podwójnej
# gwiazdy z izolowanymi punktami gwiazd ma przekładnik prądowy w połączeniu międzygwiazdowym
# (zabezpieczenie od uszkodzeń kondensatorów Ir>) i dwa przekładniki napięciowe międzyfazowe
# (L1-L2, L2-L3) do rozładowania baterii i do zabezpieczenia nadnapięciowego U>. Oba rodzaje
# są aparatami pola (`BayPrimaryDevice.kind`); lustro frontu:
# `frontend/src/ui/sld/v3/compose/rodzajeAparatowPolaBkr.ts` (równość przypina
# `tests/ci/test_parytet_rodzajow_aparatow_pola_bkr.py`). Sekcja jest addytywna wobec listy
# portów aparatów pola (`PORTY_APARATU_POLA`) budowanej równolegle kartą wzorca pola liniowego
# — scalenie dokłada `PORTY_APARATOW_POLA_BKR` do tej listy bez zmiany wpisów.

#: Przekładnik prądowy niezrównoważenia: obejmuje połączenie między punktami gwiazd baterii
#: (prąd niezrównoważenia przy uszkodzeniu jednostek kondensatorowych), nie przerywa toru.
RODZAJ_PRZEKLADNIKA_NIEZROWNOWAZENIA = "UNBALANCE_CT"
#: Przekładnik napięciowy międzyfazowy (nieuziemiony, PN-EN 61869-3 — zaciski pierwotne A i B):
#: rozładowanie baterii po wyłączeniu i pomiar napięcia do zabezpieczenia U>.
RODZAJ_PRZEKLADNIKA_NAPIECIOWEGO_MIEDZYFAZOWEGO = "PHASE_TO_PHASE_VT"

#: Jedyny port przekładnika niezrównoważenia — obwód, który przekładnik OBEJMUJE (połączenie
#: międzygwiazdowe); przekładnik nie leży w torze pola, więc nie ma pary zacisków toru.
PORT_OBWODU_MIEDZYGWIAZDOWEGO = "obwod"
#: Zaciski pierwotne przekładnika nieuziemionego wg PN-EN 61869-3 (oznaczenie A i B).
PORT_FAZY_A = "A"
PORT_FAZY_B = "B"

#: Porty aparatów pola BKR wg rodzaju — kolejność stała.
PORTY_APARATOW_POLA_BKR: dict[str, tuple[str, ...]] = {
    RODZAJ_PRZEKLADNIKA_NIEZROWNOWAZENIA: (PORT_OBWODU_MIEDZYGWIAZDOWEGO,),
    RODZAJ_PRZEKLADNIKA_NAPIECIOWEGO_MIEDZYFAZOWEGO: (PORT_FAZY_A, PORT_FAZY_B),
}
#: Rodzaje aparatów pola BKR (klucze ``PORTY_APARATOW_POLA_BKR``).
RODZAJE_APARATOW_POLA_BKR: frozenset[str] = frozenset(PORTY_APARATOW_POLA_BKR)

#: Liczba przekładników napięciowych międzyfazowych rozładowujących baterię (Zeszyt 1 §17
#: s. 32: „2 PN międzyfazowe do rozładowania"; Zał. 16: L1-L2 i L2-L3 — układ V obejmuje
#: wszystkie trzy fazy baterii).
LICZBA_PRZEKLADNIKOW_ROZLADOWCZYCH_BATERII = 2
