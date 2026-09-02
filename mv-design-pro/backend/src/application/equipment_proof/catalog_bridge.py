"""Most katalog aparatury -> dowod wytrzymalosci (KARTA UM-ICU-KATALOG).

CO SIE ZMIENIA. `EquipmentProofGenerator` czyta wylacznie `device.u_m_kv` i
`device.i_cu_ka` z payloadu, ktory dotad musial byc w calosci dostarczony
przez wywolujacego (frontend/API klient) — katalogi aparatury SN i nN nie
niosly tych pol, wiec nawet gdy klient wskazywal `type_ref` katalogowy, dowod
nie mial skad wziac U_m/I_cu i konczyl sie pozornym FAIL „brak podstawy".

Ten modul domyka ogniwo: dla `type_ref` wskazujacego pozycje katalogu
aparatury laczeniowej SN (`SwitchEquipmentType`, `mv_switch_catalog.py`) albo
nN (`LVApparatusType`, `mv_auxiliary_catalog.py`) zwraca U_m/I_cu WPROST z
katalogu — z jawnym rozroznieniem miedzy "brak danej" (aparat POWINIEN miec
zdolnosc wylaczania, ale karta jej nie wniosla) a "nie dotyczy" (aparat NIE MA
tej zdolnosci z definicji normy: rozlacznik/odlacznik/uziemnik).

WARSTWA APLIKACJI — ZERO FIZYKI WLASNEJ: to czysty odczyt katalogu (repository
lookup), zero obliczen. Rownania i kryteria PASS/FAIL/NIE_DOTYCZY zostaja w
`EquipmentProofGenerator` (P12).

ZERO FABRYKACJI: `type_ref` bez odpowiednika w zadnym katalogu zwraca pusty
wynik (`u_m_kv=None`, `i_cu_ka=None`, `i_cu_not_applicable=False`) — generator
zwroci uczciwe "brak podstawy", nigdy nie zgadnie liczby.
"""

from __future__ import annotations

from dataclasses import dataclass

from network_model.catalog.repository import CatalogRepository, get_default_mv_catalog

#: Rodzaje aparatury SN BEZ zdolnosci wylaczania zwarc z definicji normy
#: (rozlacznik/odlacznik/uziemnik) — I_cu jest dla nich NIE_DOTYCZY, nigdy
#: brakiem danej. Wylaczniki, reklozery i bezpieczniki (CIRCUIT_BREAKER,
#: RECLOSER, FUSE) MAJA te zdolnosc, wiec nie trafiaja na te liste.
RODZAJE_SN_BEZ_ZDOLNOSCI_WYLACZANIA: frozenset[str] = frozenset(
    {"LOAD_SWITCH", "DISCONNECTOR", "EARTH_SWITCH"}
)


@dataclass(frozen=True)
class CatalogUmIcu:
    """Wynik odczytu U_m/I_cu z katalogu aparatury dla danego ``type_ref``."""

    u_m_kv: float | None
    i_cu_ka: float | None
    i_cu_not_applicable: bool
    found_in_catalog: bool


_PUSTY_WYNIK = CatalogUmIcu(
    u_m_kv=None, i_cu_ka=None, i_cu_not_applicable=False, found_in_catalog=False
)


def resolve_um_icu_from_catalog(
    type_ref: str | None,
    *,
    repo: CatalogRepository | None = None,
) -> CatalogUmIcu:
    """Odczytuje U_m/I_cu dla pozycji katalogu aparatury SN albo nN.

    Args:
        type_ref: identyfikator pozycji katalogu (``SwitchEquipmentType.id``
            z katalogu SN albo ``LVApparatusType.id`` z katalogu nN). ``None``
            albo pusty lancuch zwraca pusty wynik bez przeszukiwania.
        repo: repozytorium katalogu (domyslnie ``get_default_mv_catalog()``).

    Returns:
        ``CatalogUmIcu`` z odczytanymi wartosciami. Gdy ``type_ref`` nie
        wystepuje w ZADNYM katalogu, ``found_in_catalog`` jest ``False`` i
        obie liczby zostaja ``None`` — wywolujacy NIE fabrykuje wartosci
        zastepczej.
    """
    if not type_ref:
        return _PUSTY_WYNIK
    catalog = repo if repo is not None else get_default_mv_catalog()

    switch_type = catalog.get_switch_equipment_type(type_ref)
    if switch_type is not None:
        not_applicable = switch_type.equipment_kind in RODZAJE_SN_BEZ_ZDOLNOSCI_WYLACZANIA
        return CatalogUmIcu(
            u_m_kv=switch_type.u_m_kv,
            i_cu_ka=None if not_applicable else switch_type.i_cu_ka,
            i_cu_not_applicable=not_applicable,
            found_in_catalog=True,
        )

    lv_type = catalog.get_lv_apparatus_type(type_ref)
    if lv_type is not None:
        # Cala aparatura laczeniowa nN w katalogu (WYLACZNIK_GLOWNY,
        # WYLACZNIK_ODPLYWOWY, ROZLACZNIK_BEZPIECZNIKOWY) ma zdolnosc
        # wylaczania — rozlacznik bezpiecznikowy dzieki wkladce NH (2c).
        #
        # KOREKTA (karta P0.7, „Stanowisko nN runda 3" —
        # docs/nn/UZGODNIENIA_WATKOW_2026-08-13.md): `i_cu_ka` niesie teraz
        # "nie dotyczy" (None) dla ROZLACZNIK_BEZPIECZNIKOWY (sam rozlacznik
        # bez wkladki nie ma wlasnej zdolnosci) — wartosc KOMBINACJI
        # rozlacznik+wkladka zyje w `conditional_sc_current_ka`. Bez tego
        # fallbacku dowod wytrzymalosci nN odziedziczylby SN-owe NIE_DOTYCZY
        # DOKLADNIE tam, gdzie wartosc realnie istnieje — dokladnie defekt,
        # przed ktorym ostrzegala runda 2 ("Prosba (U5 rozszerzenie)").
        icu = lv_type.i_cu_ka
        if icu is None and lv_type.conditional_sc_current_ka is not None:
            icu = lv_type.conditional_sc_current_ka
        return CatalogUmIcu(
            u_m_kv=lv_type.u_m_kv,
            i_cu_ka=icu,
            i_cu_not_applicable=False,
            found_in_catalog=True,
        )

    return _PUSTY_WYNIK
