"""Karty widmowe w modelu — karta projektu, wiązanie z generatorem, proweniencja (AB-H0 §0.7).

JEDNO miejsce reguł kart widmowych po stronie ENM, wołane przez operacje domenowe
(``set_der_catalog_bindings`` — klucz ``karty_widmowe_ref``; ``assign_catalog_to_element``
— przematerializowanie; ``dodaj_karte_widmowa_projektu``) i przez odczyt sekcji elementu
(``application.model_urzadzenia.sekcje_elementu``):

* ``materializuj_karty_generatora`` — karty z katalogu MODELU (statyczny + projekt,
  ``katalog_dla_modelu``/``katalog_biezacy``) wskazujące typ generatora (``urzadzenie_ref
  == catalog_ref``) → ``ModeleWidmoweElementu`` z proweniencją (id, wersja, przestrzeń
  STATYCZNA/PROJEKT, odcisk). Karta innego urządzenia albo nieznana → ``BladKartWidmowych``
  z NAZWANYM kodem; zero cichego pominięcia;
* ``problemy_zrodel_modeli`` — odczyt: każde źródło zmaterializowanych modeli musi się
  rozstrzygać w katalogu modelu z TYM SAMYM odciskiem (karta usunięta z projektu albo
  zmieniona po materializacji = problem nazwany, konsument odmawia odczytu);
* ``dodaj_karte_do_sekcji`` — karta projektu: kontrakt ``KartaWidmowa`` (odmowa z kodem
  ``KAT-T``), status danych inżyniera, typ urządzenia istniejący w katalogu, kolizje id.

Karta NIE trafia do ``materialized_params`` — jedyne miejsce prawdy o powiązaniu to
proweniencja w polu typowanym ``Generator.modele_widmowe``.
"""

from __future__ import annotations

import logging
from collections.abc import Iterable, Mapping
from typing import Any

from dziedziny.karta_widmowa import (
    KartaWidmowa,
    ModeleWidmoweElementu,
    PrzestrzenKarty,
    materializuj_modele_widmowe,
)
from network_model.catalog.karty_widmowe import karta_widmowa_z_rekordu
from network_model.catalog.niezmienniki_katalogu import OdmowaKatalogu
from network_model.catalog.repository import CatalogRepository, get_default_mv_catalog
from pydantic import ValidationError

from .katalog_projektu import STATUS_KATALOGU_PROJEKTU, STATUS_WERYFIKACJI_ARKUSZA
from .nazwy_elementow import nazwa_nadana_pozycji_katalogu
from .slownik_komunikatow import (
    NAZWY_STATUSOW_KATALOGU_PL,
    NAZWY_STATUSOW_WERYFIKACJI_PL,
    opis_bledu_walidacji,
    pole,
)

logger = logging.getLogger(__name__)

#: Klucz payloadu ``set_der_catalog_bindings`` — lista id kart widmowych generatora.
KLUCZ_KART_WIDMOWYCH = "karty_widmowe_ref"


class BladKartWidmowych(ValueError):
    """Nazwana odmowa operacji na kartach widmowych (``kod`` = kod błędu operacji).

    ``kod_reguly`` — kod twardej reguły katalogu (``KAT-T-…``), gdy odmówiła brama rekordu
    karty; trafia do maszynowej części odpowiedzi operacji, nie do zdania (karta #142).
    """

    def __init__(self, kod: str, komunikat: str, *, kod_reguly: str | None = None) -> None:
        super().__init__(komunikat)
        self.kod = kod
        self.kod_reguly = kod_reguly


def _opis_karty(karta: KartaWidmowa) -> str:
    """Karta widmowa w treści komunikatu: producent, model i wersja — nie identyfikator."""
    return f"karta widmowa {karta.producent} {karta.model_urzadzenia} (wersja {karta.wersja})"


def _opis_typu(katalog: CatalogRepository, ref: object, rodzaj: str) -> str:
    """Typ katalogu w treści komunikatu: nazwa typu z katalogu modelu — nie identyfikator."""
    if not ref:
        return f"{rodzaj} bez wskazania"
    typ = katalog.get_converter_type(str(ref))
    if typ is None:
        return f"{rodzaj} spoza katalogu przekształtników modelu"
    nazwa = nazwa_nadana_pozycji_katalogu(typ)
    return f"{rodzaj} „{nazwa}”" if nazwa is not None else f"{rodzaj} bez nazwy"


def przestrzen_karty(karta_id: str) -> PrzestrzenKarty:
    """``STATYCZNA`` — karta katalogu statycznego, ``PROJEKT`` — karta z modelu."""
    return "STATYCZNA" if karta_id in get_default_mv_catalog().karty_widmowe else "PROJEKT"


def identyfikatory_kart(wartosc: object) -> tuple[str, ...] | None:
    """Lista id kart z payloadu: ``None``/``[]`` = odwiązanie (``None``); inny kształt
    niż lista łańcuchów → ``BladKartWidmowych`` (łańcuch nie jest iterowany znakami)."""
    if wartosc is None:
        return None
    if not isinstance(wartosc, list | tuple) or not all(
        isinstance(element, str) and element.strip() for element in wartosc
    ):
        raise BladKartWidmowych(
            "der_bindings.karty_widmowe_ref_invalid",
            f"Pole {pole(KLUCZ_KART_WIDMOWYCH)} musi wskazywać listę kart widmowych "
            "z katalogu modelu.",
        )
    if not wartosc:
        return None
    if len(set(wartosc)) != len(wartosc):
        raise BladKartWidmowych(
            "der_bindings.karty_widmowe_ref_invalid",
            f"Pole {pole(KLUCZ_KART_WIDMOWYCH)} wskazuje tę samą kartę widmową więcej niż raz.",
        )
    return tuple(sorted(str(element) for element in wartosc))


def nieznane_karty(karty_ids: Iterable[str], katalog: CatalogRepository) -> list[str]:
    """Id kart nieistniejących w katalogu modelu (w kolejności wejścia)."""
    return [karta_id for karta_id in karty_ids if katalog.get_karta_widmowa(karta_id) is None]


def materializuj_karty_generatora(
    karty_ids: tuple[str, ...], catalog_ref: str | None, katalog: CatalogRepository
) -> ModeleWidmoweElementu:
    """Modele widmowe generatora z kart katalogu modelu (reguły w docstringu modułu)."""
    nieznane = nieznane_karty(karty_ids, katalog)
    if nieznane:
        raise BladKartWidmowych(
            "der_bindings.catalog_ref_unknown",
            f"Pole {pole(KLUCZ_KART_WIDMOWYCH)} wskazuje karty spoza katalogu modelu "
            f"(liczba: {len(nieznane)}) — wybierz karty widmowe z katalogu.",
        )
    karty = [katalog.get_karta_widmowa(karta_id) for karta_id in karty_ids]
    obce = [
        f"{_opis_karty(karta)} opisuje {_opis_typu(katalog, karta.urzadzenie_ref, 'typ')}"
        for karta in karty
        if karta is not None and karta.urzadzenie_ref != catalog_ref
    ]
    if obce:
        raise BladKartWidmowych(
            "der_bindings.karta_widmowa_innego_urzadzenia",
            "Karty widmowe opisują inne urządzenie niż "
            f"{_opis_typu(katalog, catalog_ref, 'typ generatora')}: "
            + "; ".join(obce)
            + ". Karta widmowa należy do typu urządzenia, który wskazuje.",
        )
    try:
        return materializuj_modele_widmowe(
            tuple((karta, przestrzen_karty(karta.id)) for karta in karty if karta is not None)
        )
    except ValidationError as blad:
        raise BladKartWidmowych(
            "der_bindings.karty_widmowe_kolizja",
            f"Modele wskazanych kart nie dają się złożyć w element: {opis_bledu_walidacji(blad)}.",
        ) from blad


def problemy_zrodel_modeli(
    modele_widmowe: ModeleWidmoweElementu, catalog_ref: str | None, katalog: CatalogRepository
) -> list[str]:
    """Nazwane problemy proweniencji zmaterializowanych modeli wobec katalogu modelu."""
    problemy: list[str] = []
    for zrodlo in modele_widmowe.zrodla:
        karta = katalog.get_karta_widmowa(zrodlo.karta_id)
        if karta is None:
            problemy.append(
                f"karta widmowa zmaterializowana w wersji {zrodlo.wersja} nie istnieje już "
                "w katalogu modelu — usunięta po materializacji"
            )
        elif karta.odcisk() != zrodlo.odcisk_karty:
            problemy.append(
                f"{_opis_karty(karta)} zmieniona po materializacji (zmaterializowana wersja "
                f"{zrodlo.wersja})"
            )
        elif karta.urzadzenie_ref != catalog_ref:
            problemy.append(
                f"{_opis_karty(karta)} opisuje {_opis_typu(katalog, karta.urzadzenie_ref, 'typ')}"
                f", a generator ma {_opis_typu(katalog, catalog_ref, 'typ')}"
            )
    return problemy


def dodaj_karte_do_sekcji(
    sekcja: Mapping[str, Any] | None, rekord: Mapping[str, Any], katalog: CatalogRepository
) -> tuple[dict[str, Any], KartaWidmowa]:
    """Nowa sekcja ``katalog_projektu`` z dołożoną kartą projektu (i karta).

    Reguły: kontrakt ``KartaWidmowa`` (``OdmowaKatalogu`` → kod ``karta_widmowa.odrzucona``
    z kodem ``KAT-T``); status danych inżyniera (``NIEWERYFIKOWANY``/``PROJEKTOWY_V1``);
    ``urzadzenie_ref`` = typ przekształtnika istniejący w katalogu modelu; id wolne w
    katalogu statycznym i w sekcji — ta sama treść pod tym samym id jest idempotentna.
    """
    try:
        karta = karta_widmowa_z_rekordu(rekord)
    except OdmowaKatalogu as blad:
        # Odmowa bramy rekordu karty jest pisana dla opiekuna katalogu (identyfikator karty,
        # opis biblioteki walidacji po angielsku, kod reguły). Kod reguły idzie do maszynowej
        # części odpowiedzi, pełna treść — do dziennika serwera; projektant dostaje zdanie
        # z nazwami pól formularza (błąd kształtu danych karty jest przyczyną odmowy).
        logger.warning("Odmowa karty widmowej projektu %s: %s", blad.kod, blad)
        przyczyna = blad.__cause__ or blad.__context__
        szczegoly = (
            f": {opis_bledu_walidacji(przyczyna)}" if isinstance(przyczyna, ValidationError) else ""
        )
        raise BladKartWidmowych(
            "karta_widmowa.odrzucona",
            "Karta widmowa z arkusza narusza twardą regułę katalogu kart widmowych"
            f"{szczegoly} — popraw kartę w arkuszu i zapisz ją ponownie.",
            kod_reguly=blad.kod,
        ) from blad
    if (
        karta.verification_status != STATUS_WERYFIKACJI_ARKUSZA
        or karta.catalog_status != STATUS_KATALOGU_PROJEKTU
    ):
        raise BladKartWidmowych(
            "karta_widmowa.status_projektu",
            f"Karta projektu ({_opis_karty(karta)}) niesie dane inżyniera: status weryfikacji "
            f"„{NAZWY_STATUSOW_WERYFIKACJI_PL[STATUS_WERYFIKACJI_ARKUSZA]}” i status katalogu "
            f"„{NAZWY_STATUSOW_KATALOGU_PL[STATUS_KATALOGU_PROJEKTU]}” (otrzymano "
            f"„{NAZWY_STATUSOW_WERYFIKACJI_PL.get(karta.verification_status, 'inny')}” / "
            f"„{NAZWY_STATUSOW_KATALOGU_PL.get(karta.catalog_status, 'inny')}”) — status "
            "zweryfikowany nadaje wyłącznie katalog statyczny z dokumentem.",
        )
    if katalog.get_converter_type(karta.urzadzenie_ref) is None:
        raise BladKartWidmowych(
            "karta_widmowa.urzadzenie_nieznane",
            f"Karta projektu ({_opis_karty(karta)}) wskazuje typ urządzenia, którego nie ma "
            "w katalogu przekształtników modelu.",
        )
    statyczna = get_default_mv_catalog().karty_widmowe.get(karta.id)
    if statyczna is not None:
        raise BladKartWidmowych(
            "karta_widmowa.id_zajety",
            f"Identyfikator karty „{karta.id}” z arkusza należy do karty katalogu statycznego "
            f"({_opis_karty(statyczna)}) — karta projektu nie może jej przesłonić; nadaj "
            "karcie własny identyfikator.",
        )
    nowa: dict[str, Any] = {klucz: list(wartosc) for klucz, wartosc in (sekcja or {}).items()}
    istniejace = [dict(r) for r in nowa.get("karty_widmowe", [])]
    for poprzednia in istniejace:
        if poprzednia.get("id") != karta.id:
            continue
        if KartaWidmowa.model_validate(poprzednia).odcisk() == karta.odcisk():
            return nowa, karta
        raise BladKartWidmowych(
            "karta_widmowa.id_zajety",
            f"Karta projektu o identyfikatorze „{karta.id}” z arkusza istnieje z inną treścią "
            "— nowe wydanie karty dostaje nowy identyfikator.",
        )
    zajete = {
        str(r.get("id"))
        for rodzaj, rekordy in nowa.items()
        if rodzaj != "karty_widmowe"
        for r in rekordy
    }
    if karta.id in zajete:
        raise BladKartWidmowych(
            "karta_widmowa.id_zajety",
            f"Identyfikator karty „{karta.id}” z arkusza jest już użyty przez inną pozycję "
            "katalogu projektu.",
        )
    nowa["karty_widmowe"] = sorted(
        [*istniejace, karta.model_dump(mode="json")], key=lambda r: str(r["id"])
    )
    return nowa, karta


__all__ = [
    "KLUCZ_KART_WIDMOWYCH",
    "BladKartWidmowych",
    "dodaj_karte_do_sekcji",
    "identyfikatory_kart",
    "materializuj_karty_generatora",
    "nieznane_karty",
    "problemy_zrodel_modeli",
    "przestrzen_karty",
]
