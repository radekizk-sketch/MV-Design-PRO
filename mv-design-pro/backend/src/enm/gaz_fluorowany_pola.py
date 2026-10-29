"""Zakaz gazów fluorowanych w polach SN modelu — JEDNA reguła dla operacji, walidatora i API.

Reguła (dyrektywa właściciela 2026-10-28; rozporządzenie (UE) 2024/573, art. 13 ust. 9–10) mieszka
w liściu `network_model.catalog.gazy_fluorowane.odmowa_gazu_fluorowanego_pl`; ten moduł
przykłada ją do rekordów modelu. Nośniki gazu fluorowanego są CZTERY i każdy ma własny stan
obiektu:

* RODZINA rozdzielnicy pola (`Bay.switchgear_family_ref` → `SwitchgearFamily.gaz_fluorowany`,
  wyprowadzone z izolacji i medium łączników) — stan pola (`Bay.stan_obiektu`);
* APARAT pola z pozycją katalogu (`BayPrimaryDevice.catalog_ref` → medium pozycji aparatu,
  `MVApparatusType.medium`) — stan instancji aparatu (`BayPrimaryDevice.stan_obiektu`);
* APARAT GŁÓWNY pola (`Bay.apparatus_catalog_ref`) bez lustra w wyposażeniu ani w łączniku
  pola — stan pola;
* ŁĄCZNIK — gałąź łączeniowa modelu (`SwitchBranch`) z pozycją katalogu aparatów SN, której
  nie opisuje aparat pola z tą samą pozycją (rozłącznik sekcyjny w ciągu, łącznik pola bez
  lustra w wyposażeniu). Stan (`stan_obiektu_lacznika`, jedno źródło): aparat pola wskazujący
  gałąź (`BayPrimaryDevice.linked_ref`), inaczej stan samej gałęzi (`SwitchBranch.stan_obiektu`
  — każda gałąź łączeniowa utworzona operacją ma go nadany), inaczej stan pola, do którego
  gałąź należy (`Bay.equipment_refs` — gałąź sprzed atrybutu). Operacja stanu pola ustawia
  stan pola, jego aparatów i jego łączników razem, więc jeden fizyczny aparat ma jeden stan.

Pole bez rodziny nie deklaruje medium — nie ma czego oceniać (brak wyboru wyrobu nie blokuje
projektu, ZASADA NR 4); aparat bez pozycji katalogu (wartość robocza) tak samo.

Strażnik operacji (`nowe_naruszenia_gazu_fluorowanego`) porównuje model przed i po operacji:
odmowa dotyczy naruszeń, których przed operacją nie było (ten sam nośnik, ten sam stan). Pole
zastanego zapisu (stan nieustalony) z SF₆ nie blokuje więc niezwiązanych edycji, ale każda zmiana
jego rodziny, aparatu albo stanu przechodzi przez regułę. Walidator modelu raportuje wszystkie
naruszenia (`naruszenia_gazu_fluorowanego`).
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Any, Literal

from network_model.catalog.gazy_fluorowane import (
    czy_medium_z_gazem_fluorowanym,
    odmowa_gazu_fluorowanego_pl,
)

from .katalog_projektu import katalog_biezacy
from .nazwy_elementow import nazwa_nadana_pozycji_katalogu
from .slownik_komunikatow import opis_elementu, opis_obiektu
from .stan_normalny import TYPY_LACZNIKOW_ZE_STANEM_NORMALNYM

__all__ = [
    "KOD_WALIDATORA_GAZU_FLUOROWANEGO",
    "NaruszenieGazuFluorowanego",
    "czy_aparat_z_gazem_fluorowanym",
    "RODZAJE_GALEZI_LACZENIOWYCH",
    "aparat_lacznika",
    "naruszenia_gazu_fluorowanego",
    "naruszenia_gazu_fluorowanego_lacznikow",
    "naruszenia_gazu_fluorowanego_pola",
    "nowe_naruszenia_gazu_fluorowanego",
    "stan_obiektu_lacznika",
]

#: Kod walidatora modelu (`enm.validator.ENMValidator._check_gaz_fluorowany`) — kanon gotowości
#: `bay.fluorinated_gas_not_existing` (`domain.readiness_bridge`).
KOD_WALIDATORA_GAZU_FLUOROWANEGO = "W045"


@dataclass(frozen=True)
class NaruszenieGazuFluorowanego:
    """Nośnik gazu fluorowanego w obiekcie, który nie jest istniejący.

    ``klucz`` — tożsamość naruszenia do porównania przed/po operacji (pole, nośnik, pozycja,
    stan); ``komunikat_pl`` — zdanie dla projektanta z podstawą i akcją naprawczą."""

    bay_ref: str
    element_ref: str
    nosnik: Literal["RODZINA", "APARAT", "LACZNIK"]
    klucz: tuple[str, ...]
    komunikat_pl: str


def czy_aparat_z_gazem_fluorowanym(catalog_ref: str | None) -> bool:
    """Czy pozycja katalogu aparatu SN ma medium z gazem fluorowanym (katalog bieżący modelu —
    statyczny + pozycje projektu)."""
    if not isinstance(catalog_ref, str) or not catalog_ref:
        return False
    pozycja = katalog_biezacy().mv_apparatus_types.get(catalog_ref)
    return czy_medium_z_gazem_fluorowanym(getattr(pozycja, "medium", None))


def _napis(wartosc: object) -> str | None:
    return wartosc.strip() if isinstance(wartosc, str) and wartosc.strip() else None


def naruszenia_gazu_fluorowanego_pola(
    enm: Mapping[str, Any], pole: Mapping[str, Any]
) -> list[NaruszenieGazuFluorowanego]:
    """Naruszenia zakazu w jednym rekordzie pola (rodzina, potem aparaty w kolejności listy)."""
    bay_ref = str(pole.get("ref_id") or "")
    opis_pola = opis_elementu(dict(enm), bay_ref, "pola")
    wynik: list[NaruszenieGazuFluorowanego] = []
    stan_pola = _napis(pole.get("stan_obiektu"))
    rodzina_ref = _napis(pole.get("switchgear_family_ref"))
    # Import LENIWY: pakiet `switchgear` importuje szablony pól (`bay_templates`), a te — kanon ról
    # pola z `enm`; import na poziomie modułu zamykałby cykl `enm` → walidator → `switchgear`
    # → `bay_templates` → `enm` przy imporcie szablonów jako pierwszych.
    from network_model.catalog.switchgear.families import SWITCHGEAR_FAMILY_REGISTRY

    rodzina = SWITCHGEAR_FAMILY_REGISTRY.get(rodzina_ref or "")
    if rodzina is not None:
        powod = odmowa_gazu_fluorowanego_pl(
            f"Rodzina rozdzielnicy {rodzina.family_name} {opis_pola}",
            gaz_fluorowany=rodzina.gaz_fluorowany,
            stan_obiektu=stan_pola,
        )
        if powod is not None:
            wynik.append(
                NaruszenieGazuFluorowanego(
                    bay_ref=bay_ref,
                    element_ref=bay_ref,
                    nosnik="RODZINA",
                    klucz=(bay_ref, "RODZINA", rodzina.switchgear_family_ref, stan_pola or ""),
                    komunikat_pl=powod,
                )
            )
    for aparat in pole.get("primary_devices") or []:
        if not isinstance(aparat, Mapping):
            continue
        catalog_ref = _napis(aparat.get("catalog_ref"))
        if not czy_aparat_z_gazem_fluorowanym(catalog_ref):
            continue
        stan_aparatu = _napis(aparat.get("stan_obiektu"))
        pozycja = katalog_biezacy().mv_apparatus_types.get(str(catalog_ref))
        nazwa = nazwa_nadana_pozycji_katalogu(pozycja) or "pozycja katalogu aparatów"
        device_ref = str(aparat.get("device_ref") or "")
        powod = odmowa_gazu_fluorowanego_pl(
            f"Aparat {nazwa} {opis_pola}",
            gaz_fluorowany=True,
            stan_obiektu=stan_aparatu,
        )
        if powod is not None:
            wynik.append(
                NaruszenieGazuFluorowanego(
                    bay_ref=bay_ref,
                    element_ref=device_ref or bay_ref,
                    nosnik="APARAT",
                    klucz=(bay_ref, "APARAT", device_ref, str(catalog_ref), stan_aparatu or ""),
                    komunikat_pl=powod,
                )
            )
    # Aparat główny pola (`Bay.apparatus_catalog_ref`) bez lustra — ani aparat wyposażenia,
    # ani łącznik pola (`equipment_refs`) nie niesie tej pozycji, więc żaden nośnik wyżej ani
    # nośnik ŁĄCZNIK go nie ocenia. Stan: stan pola (aparat główny powstaje razem z polem).
    glowny_ref = _napis(pole.get("apparatus_catalog_ref"))
    if czy_aparat_z_gazem_fluorowanym(glowny_ref) and not _lustro_aparatu_glownego(
        enm, pole, str(glowny_ref)
    ):
        pozycja = katalog_biezacy().mv_apparatus_types.get(str(glowny_ref))
        nazwa = nazwa_nadana_pozycji_katalogu(pozycja) or "pozycja katalogu aparatów"
        powod = odmowa_gazu_fluorowanego_pl(
            f"Aparat główny {nazwa} {opis_pola}",
            gaz_fluorowany=True,
            stan_obiektu=stan_pola,
        )
        if powod is not None:
            wynik.append(
                NaruszenieGazuFluorowanego(
                    bay_ref=bay_ref,
                    element_ref=bay_ref,
                    nosnik="APARAT",
                    klucz=(bay_ref, "APARAT_GLOWNY", "", str(glowny_ref), stan_pola or ""),
                    komunikat_pl=powod,
                )
            )
    return wynik


def _lustro_aparatu_glownego(
    enm: Mapping[str, Any], pole: Mapping[str, Any], catalog_ref: str
) -> bool:
    """Aparat główny pola jest opisany aparatem wyposażenia albo łącznikiem pola z tą samą
    pozycją katalogu (wtedy ocenia go nośnik APARAT albo ŁĄCZNIK — jedno naruszenie na jeden
    fizyczny aparat)."""
    if any(
        isinstance(a, Mapping) and _napis(a.get("catalog_ref")) == catalog_ref
        for a in pole.get("primary_devices") or []
    ):
        return True
    refy = set(pole.get("equipment_refs") or [])
    return any(
        isinstance(g, Mapping)
        and g.get("ref_id") in refy
        and g.get("type") in RODZAJE_GALEZI_LACZENIOWYCH
        and _napis(g.get("catalog_ref")) == catalog_ref
        for g in enm.get("branches") or []
    )


def _pola(enm: Mapping[str, Any]) -> Iterable[Mapping[str, Any]]:
    for pole in enm.get("bays") or []:
        if isinstance(pole, Mapping):
            yield pole


#: Rodzaje gałęzi łączeniowych modelu (`enm.models.SwitchBranch.type`) — jedno źródło z rodzajami
#: łącznika z pozycją normalną (`enm.stan_normalny`; lustro frontu `types/enm.ts::isSwitchBranch`,
#: przypięte `tests/enm/test_wyposazenie_pola_lustro_frontu.py`). Bezpiecznik nie ma komory
#: gaszeniowej z gazem i nie niesie stanu obiektu.
RODZAJE_GALEZI_LACZENIOWYCH = frozenset(TYPY_LACZNIKOW_ZE_STANEM_NORMALNYM)


def aparat_lacznika(enm: Mapping[str, Any], ref: str) -> Mapping[str, Any] | None:
    """Aparat pola wskazujący gałąź łączeniową (`BayPrimaryDevice.linked_ref`) — on niesie stan
    tego fizycznego aparatu; `None`, gdy gałęzi nie opisuje żaden aparat pola."""
    for pole in _pola(enm):
        for aparat in pole.get("primary_devices") or []:
            if isinstance(aparat, Mapping) and _napis(aparat.get("linked_ref")) == ref:
                return aparat
    return None


def stan_obiektu_lacznika(enm: Mapping[str, Any], galaz: Mapping[str, Any]) -> str | None:
    """Stan obiektu gałęzi łączeniowej — JEDNO źródło dla reguły gazu, operacji stanu
    i wymiany pozycji katalogu łącznika.

    Źródła stanu jednego fizycznego aparatu: aparat pola wskazujący gałąź (`linked_ref`)
    i stan samej gałęzi (`SwitchBranch.stan_obiektu` — każda gałąź utworzona operacją ma go
    nadany). Operacje ustawiają je RAZEM (`set_object_state`, `set_bay_equipment`,
    `assign_catalog_to_element`); gdy się rozjadą (droga zapisu spoza operacji — kreator sieci,
    zapis zastany), łącznik jest istniejący WYŁĄCZNIE, gdy każde źródło mówi „istniejący"
    (brak zgody nie zwalnia z zakazu). Gałąź bez żadnego z tych źródeł należąca do pola
    (`equipment_refs` — rekord sprzed atrybutu) → stan pola."""
    ref = _napis(galaz.get("ref_id"))
    if ref is None:
        return None
    zrodla: list[str | None] = []
    aparat = aparat_lacznika(enm, ref)
    if aparat is not None:
        zrodla.append(_napis(aparat.get("stan_obiektu")))
    wlasny = _napis(galaz.get("stan_obiektu"))
    if wlasny is not None:
        zrodla.append(wlasny)
    if not zrodla:
        for pole in _pola(enm):
            if ref in (pole.get("equipment_refs") or []):
                return _napis(pole.get("stan_obiektu"))
        return None
    if all(stan == "ISTNIEJACY" for stan in zrodla):
        return "ISTNIEJACY"
    if "PROJEKTOWANY" in zrodla:
        return "PROJEKTOWANY"
    return None


def _opisany_aparatem_pola(enm: Mapping[str, Any], ref: str, catalog_ref: str) -> bool:
    """Gałąź ma lustro w wyposażeniu pola z TĄ SAMĄ pozycją katalogu — nośnik APARAT już ją
    ocenia (jeden fizyczny aparat = jedno naruszenie)."""
    for pole in _pola(enm):
        for aparat in pole.get("primary_devices") or []:
            if (
                isinstance(aparat, Mapping)
                and _napis(aparat.get("linked_ref")) == ref
                and _napis(aparat.get("catalog_ref")) == catalog_ref
            ):
                return True
    return False


def naruszenia_gazu_fluorowanego_lacznikow(
    enm: Mapping[str, Any],
) -> list[NaruszenieGazuFluorowanego]:
    """Naruszenia zakazu w gałęziach łączeniowych (kolejność gałęzi modelu)."""
    wynik: list[NaruszenieGazuFluorowanego] = []
    for galaz in enm.get("branches") or []:
        if not isinstance(galaz, Mapping) or galaz.get("type") not in RODZAJE_GALEZI_LACZENIOWYCH:
            continue
        ref = _napis(galaz.get("ref_id"))
        catalog_ref = _napis(galaz.get("catalog_ref"))
        if ref is None or catalog_ref is None or not czy_aparat_z_gazem_fluorowanym(catalog_ref):
            continue
        if _opisany_aparatem_pola(enm, ref, catalog_ref):
            continue
        stan = stan_obiektu_lacznika(enm, galaz)
        pole_galezi = next((p for p in _pola(enm) if ref in (p.get("equipment_refs") or [])), None)
        bay_ref = str(pole_galezi.get("ref_id") or "") if pole_galezi is not None else ""
        pozycja = katalog_biezacy().mv_apparatus_types.get(catalog_ref)
        nazwa = nazwa_nadana_pozycji_katalogu(pozycja) or "pozycja katalogu aparatów"
        powod = odmowa_gazu_fluorowanego_pl(
            f"{opis_obiektu(galaz, 'Łącznik')} ({nazwa})",
            gaz_fluorowany=True,
            stan_obiektu=stan,
        )
        if powod is not None:
            wynik.append(
                NaruszenieGazuFluorowanego(
                    bay_ref=bay_ref,
                    element_ref=ref,
                    nosnik="LACZNIK",
                    klucz=(bay_ref, "LACZNIK", ref, catalog_ref, stan or ""),
                    komunikat_pl=powod,
                )
            )
    return wynik


def naruszenia_gazu_fluorowanego(enm: Mapping[str, Any]) -> list[NaruszenieGazuFluorowanego]:
    """Wszystkie naruszenia zakazu w modelu (pola z aparatami, potem łączniki — kolejność
    rekordów modelu, deterministyczna)."""
    wynik: list[NaruszenieGazuFluorowanego] = []
    for pole in _pola(enm):
        wynik.extend(naruszenia_gazu_fluorowanego_pola(enm, pole))
    wynik.extend(naruszenia_gazu_fluorowanego_lacznikow(enm))
    return wynik


def nowe_naruszenia_gazu_fluorowanego(
    przed: Mapping[str, Any], po: Mapping[str, Any]
) -> list[NaruszenieGazuFluorowanego]:
    """Naruszenia w modelu po operacji, których nie było przed nią (ten sam klucz nośnika).

    Strażnik KAŻDEJ operacji domenowej (`domain_operations.execute_domain_operation`): jedna
    reguła obejmuje utworzenie pola, dobudowę pola do istniejącej rozdzielnicy, wymianę aparatu,
    przypisanie typu rozdzielnicy, zmianę stanu obiektu i każdą przyszłą drogę zapisu pola."""
    istniejace = {n.klucz for n in naruszenia_gazu_fluorowanego(przed)}
    return [n for n in naruszenia_gazu_fluorowanego(po) if n.klucz not in istniejace]
