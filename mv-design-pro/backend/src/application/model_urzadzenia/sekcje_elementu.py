"""Sekcje modelu urządzenia ELEMENTU ENM — drugi adapter tej samej reguły (AB-H0 §0.3.7).

Typ katalogowy i element budują wejście JEDNEJ funkcji statusu przez TĘ SAMĄ funkcję
``network_model.catalog.sekcje_modelu.wejscia_sekcji`` — różni się wyłącznie dostęp do
danych (``DaneUrzadzenia``):

* pola = ``materialized_params`` elementu (to, co czytają solvery), nie rekord typu —
  zgubione przy materializacji pole jest widoczne jako brak (test parytetu typ ↔ element);
  odbiór i bateria kondensatorów niosą dane katalogu w POLACH TYPOWANYCH elementu
  (``Load.p_mw``/``q_mvar``/``model``, ``ShuntCapacitor.rated_mvar``/``rated_kv``) — te
  pola są odwzorowane na nazwy pól typu (``_POLA_TYPOWANE``; wyłącznie zmiana jednostki);
* klasa definicji składników: generator przekształtnikowy (przestrzenie ``CONVERTER``/
  ``ZRODLO_NN_PV``/``ZRODLO_NN_BESS``, albo bez katalogu z ``gen_type`` przekształtnikowym)
  → ``Generator`` (nazwy pól tabliczki elementu); pozostałe elementy → klasa typu
  przestrzeni (materializacja zachowuje nazwy pól typu);
* status weryfikacji rekordu = status typu w katalogu MODELU (``katalog_dla_modelu``);
  element bez typu katalogowego niesie dane inżyniera → ``NIEWERYFIKOWANY``;
* modele widmowe = ``Generator.modele_widmowe`` (kopia z proweniencją), dowody kart —
  z kart rozstrzygniętych w katalogu modelu; karta usunięta albo zmieniona po
  materializacji = ODMOWA nazwana (``OdmowaSekcjiElementu``), nigdy cichy odczyt;
* sekcja ``dynamic`` generatora: pole widoku ``model_dynamiczny`` — blok DAE
  ``Generator.dynamika`` i profil ``der_dynamic`` (wiązanie ``dynamic_model_ref`` ma
  pierwszeństwo przed profilem typu ``dynamic_profile_id`` — ta sama kolejność co resolver
  profili), jakość = najsłabsza z obecnych źródeł.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from types import MappingProxyType
from typing import Any, cast, get_args

from dziedziny.karta_widmowa import ModeleWidmoweElementu
from dziedziny.sekcje import OcenaSekcji, StatusWeryfikacjiRekordu
from enm.katalog_projektu import katalog_dla_modelu
from enm.katalog_projektu_karty import problemy_zrodel_modeli
from enm.models import GEN_TYPES_PRZEKSZTALTNIKOWE, EnergyNetworkModel
from network_model.catalog.sekcje_modelu import (
    JAKOSC_ZRODLA_DYNAMIKI,
    KLASA_ELEMENTU_PRZEKSZTALTNIKOWEGO,
    POLE_MODELU_DYNAMICZNEGO_ELEMENTU,
    PRZESTRZENIE_BEZ_SEKCJI,
    PRZESTRZENIE_PRZEKSZTALTNIKOWE,
    PRZESTRZENIE_Z_SEKCJAMI,
    DaneUrzadzenia,
    dowod_certyfikatu_ptpiree,
    dowody_kart,
    jakosc_profilu_dynamicznego,
    najslabsza_jakosc,
    oceny_sekcji,
    typ_katalogowy,
)
from network_model.pochodne import mvar_na_kvar, mw_na_kw
from werdykt.proweniencja import FieldQuality

#: Kolekcje ENM, których elementy mają model urządzenia (wiersz „urządzenia").
KOLEKCJE_URZADZEN: tuple[str, ...] = (
    "generators",
    "sources",
    "transformers",
    "branches",
    "loads",
    "shunt_capacitors",
)
#: Status weryfikacji danych elementu bez typu katalogowego (dane inżyniera).
STATUS_ELEMENTU_BEZ_TYPU: StatusWeryfikacjiRekordu = "NIEWERYFIKOWANY"


def _pola_odbioru(element: Mapping[str, Any]) -> dict[str, Any]:
    """Odbiór: moc w polach typowanych elementu (MW/Mvar) → nazwy pól ``LoadType``."""
    meta = element.get("meta") or {}
    p_mw, q_mvar = element.get("p_mw"), element.get("q_mvar")
    return {
        "p_kw": mw_na_kw(float(p_mw)) if p_mw is not None else None,
        "q_kvar": mvar_na_kvar(float(q_mvar)) if q_mvar is not None else None,
        "model": element.get("model"),
        "cos_phi": meta.get("cos_phi") if isinstance(meta, Mapping) else None,
    }


def _pola_kompensatora(element: Mapping[str, Any]) -> dict[str, Any]:
    """Bateria kondensatorów: pola typowane elementu (nazwy ``ShuntCapacitorType``)."""
    meta = element.get("meta") or {}
    return {
        "rated_mvar": element.get("rated_mvar"),
        "rated_kv": element.get("rated_kv"),
        "loss_kw": meta.get("loss_kw") if isinstance(meta, Mapping) else None,
    }


#: Kolekcje, których elementy niosą dane katalogu w polach typowanych (nie w
#: ``materialized_params``) — odwzorowanie na nazwy pól typu przestrzeni.
_POLA_TYPOWANE: Mapping[str, Callable[[Mapping[str, Any]], dict[str, Any]]] = MappingProxyType(
    {"loads": _pola_odbioru, "shunt_capacitors": _pola_kompensatora}
)


class OdmowaSekcjiElementu(ValueError):
    """Nazwana odmowa odczytu sekcji elementu (``kod`` = kod błędu dla konsumenta)."""

    def __init__(self, kod: str, komunikat: str) -> None:
        super().__init__(komunikat)
        self.kod = kod


def _migawka(enm: EnergyNetworkModel | Mapping[str, Any]) -> Mapping[str, Any]:
    if isinstance(enm, EnergyNetworkModel):
        return enm.model_dump(mode="json")
    return enm


def znajdz_urzadzenie(migawka: Mapping[str, Any], ref: str) -> tuple[str, Mapping[str, Any]]:
    """Kolekcja i element urządzenia o ``ref_id`` (``KOLEKCJE_URZADZEN``) albo odmowa."""
    for kolekcja in KOLEKCJE_URZADZEN:
        for element in migawka.get(kolekcja) or []:
            if isinstance(element, Mapping) and element.get("ref_id") == ref:
                return kolekcja, element
    raise OdmowaSekcjiElementu(
        "sekcje.element_nieznany",
        f"Element '{ref}' nie istnieje w modelu wśród urządzeń ({', '.join(KOLEKCJE_URZADZEN)}).",
    )


def _klasa(kolekcja: str, element: Mapping[str, Any]) -> str:
    przestrzen = element.get("catalog_namespace")
    if kolekcja == "generators" and (
        przestrzen in PRZESTRZENIE_PRZEKSZTALTNIKOWE
        or (przestrzen is None and element.get("gen_type") in GEN_TYPES_PRZEKSZTALTNIKOWE)
    ):
        return KLASA_ELEMENTU_PRZEKSZTALTNIKOWEGO
    if przestrzen in PRZESTRZENIE_Z_SEKCJAMI:
        return PRZESTRZENIE_Z_SEKCJAMI[str(przestrzen)][0]
    powod = (
        PRZESTRZENIE_BEZ_SEKCJI.get(str(przestrzen), "przestrzeń nieznana")
        if przestrzen
        else "element bez przestrzeni katalogu i bez rodzaju przekształtnikowego"
    )
    raise OdmowaSekcjiElementu(
        "sekcje.brak_widoku",
        f"Element '{element.get('ref_id')}' nie ma widoku sekcji modelu: {powod}.",
    )


def _model_dynamiczny(
    element: Mapping[str, Any], pola: Mapping[str, Any]
) -> tuple[str | None, FieldQuality | None]:
    """Opis źródeł modelu dynamicznego elementu i najsłabsza jakość (``None`` — brak)."""
    opisy: list[str] = []
    jakosci: list[FieldQuality | None] = []
    blok = element.get("dynamika")
    if isinstance(blok, Mapping):
        zrodlo = (blok.get("proweniencja") or {}).get("zrodlo")
        opisy.append(f"blok DAE rodziny {blok.get('rodzina')} (źródło {zrodlo})")
        jakosci.append(JAKOSC_ZRODLA_DYNAMIKI.get(str(zrodlo)))
    profil = pola.get("dynamic_model_ref") or pola.get("dynamic_profile_id")
    if profil is not None:
        skad = "wiązanie elementu" if pola.get("dynamic_model_ref") else "profil typu"
        opisy.append(f"profil {profil} ({skad})")
        jakosci.append(jakosc_profilu_dynamicznego(profil))
    if not opisy:
        return None, None
    return "; ".join(opisy), najslabsza_jakosc(tuple(jakosci))


def dane_elementu(enm: EnergyNetworkModel | Mapping[str, Any], ref: str) -> DaneUrzadzenia:
    """Dane urządzenia elementu ENM dla widoku sekcji (reguły w docstringu modułu)."""
    migawka = _migawka(enm)
    kolekcja, element = znajdz_urzadzenie(migawka, ref)
    klasa = _klasa(kolekcja, element)
    katalog = katalog_dla_modelu(migawka)
    catalog_ref = element.get("catalog_ref")
    przestrzen = element.get("catalog_namespace")

    status_rekordu: StatusWeryfikacjiRekordu = STATUS_ELEMENTU_BEZ_TYPU
    if catalog_ref and przestrzen:
        typ = typ_katalogowy(katalog, str(przestrzen), str(catalog_ref))
        if typ is None:
            raise OdmowaSekcjiElementu(
                "sekcje.typ_niedostepny",
                f"Typ {catalog_ref!r} elementu '{ref}' nie istnieje w katalogu modelu "
                f"(przestrzeń {przestrzen}) — sekcji nie da się ocenić bez rekordu typu.",
            )
        status_typu = str(typ.verification_status)
        if status_typu not in get_args(StatusWeryfikacjiRekordu):
            raise OdmowaSekcjiElementu(
                "sekcje.typ_niedostepny",
                f"Typ {catalog_ref!r} ma status weryfikacji {status_typu!r} spoza słownika "
                "katalogu (reguła KAT-T-001).",
            )
        status_rekordu = cast(StatusWeryfikacjiRekordu, status_typu)  # zawężone wyżej

    surowe = element.get("materialized_params")
    if kolekcja in _POLA_TYPOWANE:
        pola: dict[str, Any] = _POLA_TYPOWANE[kolekcja](element)
    else:
        pola = dict(surowe) if isinstance(surowe, Mapping) else {}
    jakosci_zrodel: dict[str, FieldQuality | None] = {}
    if klasa == KLASA_ELEMENTU_PRZEKSZTALTNIKOWEGO:
        opis, jakosc = _model_dynamiczny(element, pola)
        pola[POLE_MODELU_DYNAMICZNEGO_ELEMENTU] = opis
        jakosci_zrodel[POLE_MODELU_DYNAMICZNEGO_ELEMENTU] = jakosc
    elif "dynamic_profile_id" in pola:
        jakosci_zrodel["dynamic_profile_id"] = jakosc_profilu_dynamicznego(
            pola.get("dynamic_profile_id")
        )

    modele: tuple[Any, ...] = ()
    karty: tuple[Any, ...] = ()
    surowe_modele = element.get("modele_widmowe")
    if isinstance(surowe_modele, Mapping):
        modele_elementu = ModeleWidmoweElementu.model_validate(dict(surowe_modele))
        problemy = problemy_zrodel_modeli(
            modele_elementu, str(catalog_ref) if catalog_ref else None, katalog
        )
        if problemy:
            raise OdmowaSekcjiElementu(
                "sekcje.karta_widmowa_niedostepna",
                f"Modele widmowe elementu '{ref}' mają nieaktualną proweniencję: "
                + "; ".join(problemy)
                + ". Przematerializuj karty (`set_der_catalog_bindings`, `karty_widmowe_ref`).",
            )
        modele = modele_elementu.modele
        karty = tuple(
            karta
            for karta in (
                katalog.get_karta_widmowa(zrodlo.karta_id) for zrodlo in modele_elementu.zrodla
            )
            if karta is not None
        )

    dowod_ptpiree = dowod_certyfikatu_ptpiree(pola)
    return DaneUrzadzenia(
        klasa=klasa,
        pola=MappingProxyType(pola),
        status_weryfikacji_rekordu=status_rekordu,
        modele_widmowe=modele,
        dowody=(*dowody_kart(karty), *((dowod_ptpiree,) if dowod_ptpiree else ())),
        jakosci_zrodel=MappingProxyType(jakosci_zrodel),
    )


def sekcje_elementu(
    enm: EnergyNetworkModel | Mapping[str, Any], ref: str
) -> tuple[OcenaSekcji, ...]:
    """Osiem sekcji modelu urządzenia elementu ENM ze statusem, powodem i składnikami."""
    return oceny_sekcji(dane_elementu(enm, ref))


__all__ = [
    "KOLEKCJE_URZADZEN",
    "STATUS_ELEMENTU_BEZ_TYPU",
    "OdmowaSekcjiElementu",
    "dane_elementu",
    "sekcje_elementu",
]
