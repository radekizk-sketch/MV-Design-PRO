"""Aparaty toru pola SN tworzonego bez wskazanego szablonu — JEDNO źródło dla każdej drogi
budowy pola SN (karta SZABLONY-POL, rozszerzenie sesji głównej 2026-11-11).

Dlaczego: operacje stacyjne (`insert_station_on_segment_sn`, `append_station_on_endpoint`,
`add_sn_bay`) tworzyły w polu bez szablonu WYŁĄCZNIE gałąź aparatu głównego
(`equipment_refs = [aparat]`) i pustą listę `Bay.primary_devices`. Kompozytor SLD rysuje tor
pola wyłącznie z rekordów aparatów (`apparatusSequence.ts`, dyrektywa 2026-10-21 — bez
gramatyk w rysunku), więc pole stacji było gołym kwadratem łącznika, a funkcje EAZ pola
pochodziły z szablonu kanonicznego roli, którego aparatów pole nie miało.

Reguła (jedna para predykatów z JEDNEGO szablonu — `SZABLON_KANONICZNY_ROLI` dla stacji SN/nN,
szablony ENEA Zeszyt 1 dla rozdzielni GPZ): pole bez szablonu, bez bloku fabrycznego i bez
aparatów dostaje aparaty TEGO szablonu, z którego dostało funkcje EAZ. Konstrukcja pola wynika
z rodzaju aparatu głównego WSKAZANEGO w katalogu (`device_kind` pozycji gałęzi aparatu):

* pole WYŁĄCZNIKOWE (wyłącznik, reklozer) — aparaty szablonu i jego funkcje EAZ;
* pole ROZŁĄCZNIKOWE stacji SN/nN (rozłącznik, rozłącznik bezpiecznikowy, odłącznik — pola
  RMU) — szablon `SZABLON_ROZLACZNIKOWY_ROLI` (rozłącznik, uziemnik, głowica albo wkładki
  i transformator), BEZ przekładników prądowych i bez funkcji EAZ przekaźnika: łącznik bez
  zdolności wyłączania zwarć nie ma czego wyłączać od zabezpieczenia, a pole transformatorowe
  chroni wkładka bezpiecznikowa. Rozdzielnia GPZ jest wyłącznikowa (Zeszyt 1 §13) — wskazany
  rodzaj zastępuje tam aparat główny szablonu ENEA.

Aparat główny wskazuje gałąź aparatu pola (`linked_ref`), łączniki bez własnej gałęzi dostają
położenie zgodne ze stanem gałęzi (`_powiaz_aparaty_pola_z_galezia`). Topologia obliczeniowa
pola zostaje jedną gałęzią aparatu głównego — pozostałe aparaty toru są topologią WEWNĘTRZNĄ
pola (porty `porty_toru_pola`) i nie zmieniają wyników zwarć ani rozpływu (test parytetu
`tests/enm/test_aparaty_pol_sn.py`). Aparat bez pozycji katalogu jest wartością roboczą
(`dane_przyjete_wyposazenia`, jakość ESTIMATED — ZASADA NR 4).
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any, Literal

#: Konstrukcja pola SN wg rodzaju aparatu głównego.
KonstrukcjaPola = Literal["WYLACZNIKOWE", "ROZLACZNIKOWE"]

#: Typ gałęzi aparatu → rodzaj aparatu głównego, gdy gałąź nie wskazuje pozycji katalogu.
_RODZAJ_Z_TYPU_GALEZI: dict[str, str] = {
    "breaker": "WYLACZNIK",
    "bus_coupler": "WYLACZNIK",
    "switch": "ROZLACZNIK",
    "disconnector": "ODLACZNIK",
}


def rodzaj_aparatu_glownego(galaz: Mapping[str, Any] | None) -> str | None:
    """`device_kind` aparatu głównego pola z pozycji katalogu gałęzi, inaczej z typu gałęzi."""
    if galaz is None:
        return None
    from enm.domain_operations import _rodzaj_aparatu_sn_z_katalogu

    catalog_ref = galaz.get("catalog_ref")
    if isinstance(catalog_ref, str) and catalog_ref:
        kind = _rodzaj_aparatu_sn_z_katalogu(catalog_ref)
        if kind is not None:
            return kind
    return _RODZAJ_Z_TYPU_GALEZI.get(str(galaz.get("type")))


def konstrukcja_pola(rodzaj: str | None) -> KonstrukcjaPola:
    """Konstrukcja pola wg rodzaju aparatu głównego — brak aparatu = pole wyłącznikowe
    szablonu (szablon kanoniczny roli jest polem wyłącznikowym)."""
    from network_model.catalog.bay_templates import _main_apparatus_primary_kind

    glowny = _main_apparatus_primary_kind(rodzaj)
    return "WYLACZNIKOWE" if glowny in (None, "CB") else "ROZLACZNIKOWE"


def szablon_domyslny_pola_sn(
    bay_role: str, *, gpz: bool, insulation_type: str | None
) -> str | None:
    """Szablon, z którego pole SN bez wskazanego szablonu bierze aparaty i funkcje EAZ.

    Stacja SN/nN — `SZABLON_KANONICZNY_ROLI` (ten sam, z którego
    `_resolve_bay_template_protection_codes` bierze funkcje EAZ). Rozdzielnia GPZ — szablon
    ENEA Zeszyt 1 roli: pole liniowe Z.10 (wykonanie łączników wg izolacji rodziny, §13),
    transformatorowe Z.7, łącznika szyn Z.12, baterii kondensatorów Z.16, pomiaru napięcia
    Z.17. Pole źródłowe OZE (stacja i GPZ) — szablon kanoniczny roli (`BAY_TEMPLATE_DER_PV`,
    ten sam, z którego pole bierze funkcje EAZ); pole źródłowe z kreatora DER-SN ma aparaty
    z jawnej konfiguracji (`mv_source_field_primary_devices`) i tu nie trafia. `None` — pole
    zespołu uziemiającego (zawsze z szablonem wariantu, `enm.zespol_uziemiajacy`)."""
    from network_model.catalog import bay_templates as bt

    if bay_role == "ZU":
        return None
    if bay_role == "OZE":
        return bt.SZABLON_KANONICZNY_ROLI["OZE"].template_id
    if gpz:
        szablony_gpz = {
            "TR": bt.BAY_TEMPLATE_GPZ_TRANSFORMATOR_Z7,
            "COUPLER": bt.BAY_TEMPLATE_GPZ_LACZNIK_SZYN_Z12,
            "BKR": bt.BAY_TEMPLATE_GPZ_BKR_Z16,
            "MEASUREMENT": bt.BAY_TEMPLATE_GPZ_POMIAR_NAPIECIA_Z17,
        }
        if bay_role in szablony_gpz:
            return szablony_gpz[bay_role].template_id
        if bay_role in ("IN", "OUT", "FEEDER"):
            return bt.szablon_domyslny_pola_liniowego_gpz(insulation_type).template_id
        return None
    szablon = bt.SZABLON_KANONICZNY_ROLI.get(bay_role)
    return szablon.template_id if szablon is not None else None


def aparaty_domyslne_pola_sn(
    *,
    field_ref: str,
    szablon_id: str,
    bay_role: str,
    gpz: bool,
    galaz: Mapping[str, Any] | None,
    stan_obiektu: str | None,
) -> tuple[list[dict[str, Any]], str]:
    """Aparaty pola z szablonu domyślnego wg konstrukcji wskazanego aparatu głównego,
    powiązane z gałęzią aparatu pola; zwraca (aparaty, szablon, z którego pochodzą).

    Pole rozłącznikowe stacji SN/nN — szablon `SZABLON_ROZLACZNIKOWY_ROLI` (pole RMU, bez
    odłączników i przekładników prądowych); pole wyłącznikowe i pole GPZ — szablon domyślny
    (`szablon_domyslny_pola_sn`) z aparatem głównym zastąpionym wskazanym rodzajem
    (`template_primary_devices`, ta sama reguła co wybór aparatu w kreatorze). Czysta
    funkcja (deterministyczne `device_ref`)."""
    from enm.domain_operations import _powiaz_aparaty_pola_z_galezia
    from enm.pola import aparaty_ze_stanem_pola
    from network_model.catalog.bay_templates import (
        SZABLON_ROZLACZNIKOWY_ROLI,
        _main_apparatus_primary_kind,
        rodzaj_aparatu_glownego_szablonu,
        template_primary_devices,
    )

    rodzaj = rodzaj_aparatu_glownego(galaz)
    if (
        not gpz
        and konstrukcja_pola(rodzaj) == "ROZLACZNIKOWE"
        and bay_role in SZABLON_ROZLACZNIKOWY_ROLI
    ):
        szablon_id = SZABLON_ROZLACZNIKOWY_ROLI[bay_role].template_id
        # Rozłącznik szablonu RMU zastępuje wskazany rodzaj, gdy jest nim odłącznik (pole
        # z odłącznikiem jako aparatem głównym); rozłącznik bezpiecznikowy zostaje rozłącznikiem
        # z wkładkami (`_powiaz_aparaty_pola_z_galezia` wiąże gałąź z rozłącznikiem).
        glowny = _main_apparatus_primary_kind(rodzaj)
        aparaty = template_primary_devices(
            szablon_id,
            field_ref=field_ref,
            main_apparatus_kind="DS" if glowny == "DS" else None,
        )
    else:
        # Łącznik trójpołożeniowy szablonu (pole pomiaru napięcia Z.17) JEST odłącznikiem toru —
        # gałąź odłącznika go nie zastępuje (`_powiaz_aparaty_pola_z_galezia` wiąże ją z nim).
        zgodny = (
            _main_apparatus_primary_kind(rodzaj) == "DS"
            and rodzaj_aparatu_glownego_szablonu(szablon_id) == "THREE_POSITION_SWITCH"
        )
        aparaty = template_primary_devices(
            szablon_id, field_ref=field_ref, main_apparatus_kind=None if zgodny else rodzaj
        )
    if galaz is not None:
        aparaty = _powiaz_aparaty_pola_z_galezia(aparaty, galaz)
    return aparaty_ze_stanem_pola(aparaty, stan_obiektu), szablon_id


def uzupelnij_aparaty_pol_sn(enm: dict[str, Any], refy_pol: Iterable[str]) -> None:
    """Pola SN `refy_pol` bez szablonu, bez bloku i bez aparatów dostają aparaty toru
    (`aparaty_domyslne_pola_sn`); pole rozłącznikowe traci funkcje EAZ przekaźnika. Pola nN,
    pola z szablonem, blokiem albo aparatami — bez zmian. Zmienia `enm` w miejscu."""
    from enm.pola import czy_pole_nn, poziom_pol, zmien_pole
    from network_model.catalog.bay_templates import BAY_TEMPLATE_REGISTRY
    from network_model.catalog.switchgear.families import SWITCHGEAR_FAMILY_REGISTRY

    poziom = poziom_pol(enm)
    galezie = {str(b.get("ref_id")): b for b in enm.get("branches", []) if isinstance(b, Mapping)}
    stacje = {str(s.get("ref_id")): s for s in enm.get("substations", []) if isinstance(s, Mapping)}
    for ref in refy_pol:
        rekord = next(
            (b for b in enm.get("bays", []) if isinstance(b, Mapping) and b.get("ref_id") == ref),
            None,
        )
        if rekord is None or czy_pole_nn(enm, rekord, poziom):
            continue
        if rekord.get("primary_devices") or rekord.get("bay_template_ref"):
            continue
        if rekord.get("wybor_bloku"):
            continue
        stacja = stacje.get(str(rekord.get("substation_ref")))
        rodzina = SWITCHGEAR_FAMILY_REGISTRY.get(str(rekord.get("switchgear_family_ref") or ""))
        szablon_id = szablon_domyslny_pola_sn(
            str(rekord.get("bay_role")),
            gpz=stacja is not None and stacja.get("station_type") == "gpz",
            insulation_type=rodzina.insulation_type if rodzina is not None else None,
        )
        if szablon_id is None:
            continue
        galaz = next((galezie[e] for e in rekord.get("equipment_refs") or [] if e in galezie), None)
        if galaz is None:
            # Pole bez gałęzi aparatu jest rezerwą (pole GPZ bez aparatu, pole sprzęgła po
            # usunięciu sprzęgła) — rekordy aparatów bez łącznika w topologii byłyby fantomem.
            continue
        gpz = stacja is not None and stacja.get("station_type") == "gpz"
        aparaty, szablon_aparatow = aparaty_domyslne_pola_sn(
            field_ref=str(ref),
            szablon_id=szablon_id,
            bay_role=str(rekord.get("bay_role")),
            gpz=gpz,
            galaz=galaz,
            stan_obiektu=rekord.get("stan_obiektu"),
        )
        zmiany: dict[str, Any] = {"primary_devices": aparaty}
        if szablon_aparatow != szablon_id:
            # Pole rozłącznikowe: funkcje EAZ z TEGO szablonu, z którego są aparaty (para
            # predykatów z jednego źródła) — szablon RMU nie ma przekaźnika.
            zmiany["funkcje_eaz"] = list(BAY_TEMPLATE_REGISTRY[szablon_aparatow].funkcje_eaz)
        zmien_pole(enm, str(ref), **zmiany)
