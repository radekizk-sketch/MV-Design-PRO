"""Jedyny odczyt wiązania katalogowego z ładunku operacji domenowej.

Karta JEDEN-KLUCZ-KATALOGU. Pozycję katalogu w ładunku operacji wskazuje WYŁĄCZNIE
wiązanie (``catalog_binding`` albo ``<rola>_catalog_binding``): słownik
``CatalogBinding`` z ``catalog_item_id`` (oraz opcjonalnie ``catalog_namespace``,
``catalog_item_version``). Dawne zamienniki klucza — ``catalog_ref``,
``catalog_item_id``/``catalog_item_version`` na wierzchu węzła, ``<rola>_catalog_ref``
obok ``<rola>_catalog_binding`` i ``catalog_ref`` wewnątrz wiązania — dawały parę
rozbieżnych predykatów: brama API czytała je w innej kolejności niż operacja, więc
ładunek z dwiema różnymi wartościami był bramkowany po jednej, a zapisywany po drugiej.

Ta funkcja jest JEDNYM źródłem prawdy dla obu stron pary predykatów: brama API
(``api/domain_ops_policy.py``) i operacje domenowe (``enm/domain_operations*.py``)
czytają wiązanie wyłącznie przez :func:`odczytaj_wiazanie`. Ładunek niosący zamiennik
jest odrzucany nazwanym kodem :data:`KOD_ZAMIENNIKA_KLUCZA` z komunikatem, który nazywa
odrzucony klucz i klucz jedyny — bez zapasu i bez migracji ładunku.

Pola MODELU ENM (``branch.catalog_ref``, ``devices[].catalog_ref`` operacji
``set_bay_equipment``) nie są kluczem ładunku wiązania i tu nie wchodzą.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

#: Klucz kanoniczny wiązania w węźle ładunku.
KLUCZ_WIAZANIA = "catalog_binding"

#: Kod odmowy ładunku z zamiennikiem klucza wiązania.
KOD_ZAMIENNIKA_KLUCZA = "catalog.binding_key_alias"

#: Kod odmowy wiązania bez identyfikatora pozycji albo o złym kształcie.
KOD_WIAZANIA_NIEPOPRAWNEGO = "catalog.binding_invalid"

#: Pola słownika wiązania (``CatalogBinding``) — jedyne klucze wewnątrz wiązania.
POLA_WIAZANIA: frozenset[str] = frozenset(
    {
        "catalog_item_id",
        "catalog_item_version",
        "catalog_namespace",
        "materialize",
        "snapshot_mapping_version",
    }
)

#: Zamienniki zakazane WEWNĄTRZ słownika wiązania.
ZAMIENNIKI_W_WIAZANIU: tuple[str, ...] = ("catalog_ref", "item_id", "namespace")


def zamienniki_klucza(klucz_wiazania: str) -> tuple[str, ...]:
    """Zakazane zamienniki klucza wiązania na poziomie węzła ładunku.

    ``catalog_binding`` → ``catalog_ref``, ``catalog_item_id``, ``catalog_item_version``;
    ``<rola>_catalog_binding`` → ``<rola>_catalog_ref``, ``<rola>_catalog_item_id``.
    Funkcja jest też podstawą strażnika kontraktu operacji
    (``scripts/klucz_katalogu_guard.py``): kształt węzła z kluczem wiązania nie może
    zawierać żadnego z tych kluczy.
    """
    if klucz_wiazania == KLUCZ_WIAZANIA:
        return ("catalog_ref", "catalog_item_id", "catalog_item_version")
    if not klucz_wiazania.endswith("_" + KLUCZ_WIAZANIA):
        raise ValueError(f"{klucz_wiazania!r} nie jest kluczem wiązania katalogowego")
    rola = klucz_wiazania[: -len("_" + KLUCZ_WIAZANIA)]
    return (f"{rola}_catalog_ref", f"{rola}_catalog_item_id")


@dataclass(frozen=True)
class OdczytWiazania:
    """Wynik odczytu wiązania z węzła ładunku.

    ``pozycja`` — identyfikator pozycji (``catalog_item_id``) albo ``None``, gdy węzeł
    nie wskazuje pozycji; ``kod_bledu``/``komunikat_pl`` — odmowa (zamiennik klucza
    albo wiązanie bez identyfikatora). Odmowa wyklucza pozycję.
    """

    pozycja: str | None = None
    wersja: str | None = None
    przestrzen: str | None = None
    kod_bledu: str | None = None
    komunikat_pl: str | None = None

    @property
    def wskazuje(self) -> bool:
        return self.pozycja is not None

    def wiazanie(self, przestrzen: str, wersja_domyslna: str = "2024.1") -> dict[str, Any]:
        """Wiązanie sprowadzone do przestrzeni RODZAJU elementu (V12K-316 dług 4).

        Kategoria katalogu wynika z tego, JAKI element operacja tworzy, nie z deklaracji
        ładunku — ta sama wartość wybiera akcesor katalogu i trafia do migawki.
        """
        assert self.pozycja is not None, "wiązanie bez pozycji"
        return {
            "catalog_namespace": przestrzen,
            "catalog_item_id": self.pozycja,
            "catalog_item_version": self.wersja or wersja_domyslna,
            "materialize": True,
            "snapshot_mapping_version": "1.0",
        }


def _tekst(wartosc: object) -> str | None:
    if isinstance(wartosc, str) and wartosc.strip():
        return wartosc.strip()
    return None


def odczytaj_wiazanie(
    wezel: object,
    klucz: str = KLUCZ_WIAZANIA,
    *,
    opis_pl: str = "Element",
) -> OdczytWiazania:
    """Odczytaj wiązanie ``wezel[klucz]`` — jedyny odczyt pozycji katalogu ładunku.

    Odmowa :data:`KOD_ZAMIENNIKA_KLUCZA`, gdy węzeł niesie zamiennik klucza
    (:func:`zamienniki_klucza`) albo wiązanie niesie zamiennik pola
    (:data:`ZAMIENNIKI_W_WIAZANIU`) — niezależnie od wartości: obecność klucza jest
    deklaracją drugiej drogi wskazania. Odmowa :data:`KOD_WIAZANIA_NIEPOPRAWNEGO`, gdy
    wiązanie nie jest słownikiem albo nie niesie ``catalog_item_id``. Węzeł bez
    klucza wiązania (albo z wartością ``None``) nie wskazuje pozycji.
    """
    if not isinstance(wezel, Mapping):
        return OdczytWiazania()
    for zamiennik in zamienniki_klucza(klucz):
        if zamiennik in wezel:
            return OdczytWiazania(
                kod_bledu=KOD_ZAMIENNIKA_KLUCZA,
                komunikat_pl=(
                    f"{opis_pl}: klucz „{zamiennik}” nie wskazuje pozycji katalogu — "
                    f"pozycję wskazuje wyłącznie wiązanie „{klucz}” "
                    "(z identyfikatorem „catalog_item_id”)."
                ),
            )
    surowe = wezel.get(klucz)
    if surowe is None:
        return OdczytWiazania()
    if not isinstance(surowe, Mapping):
        return OdczytWiazania(
            kod_bledu=KOD_WIAZANIA_NIEPOPRAWNEGO,
            komunikat_pl=f"{opis_pl}: wiązanie „{klucz}” musi być obiektem.",
        )
    for zamiennik in ZAMIENNIKI_W_WIAZANIU:
        if zamiennik in surowe:
            return OdczytWiazania(
                kod_bledu=KOD_ZAMIENNIKA_KLUCZA,
                komunikat_pl=(
                    f"{opis_pl}: pole „{zamiennik}” wiązania „{klucz}” nie wskazuje "
                    "pozycji katalogu — identyfikatorem pozycji jest wyłącznie "
                    "„catalog_item_id”."
                ),
            )
    pozycja = _tekst(surowe.get("catalog_item_id"))
    if pozycja is None:
        return OdczytWiazania(
            kod_bledu=KOD_WIAZANIA_NIEPOPRAWNEGO,
            komunikat_pl=(
                f"{opis_pl}: wiązanie „{klucz}” nie niesie identyfikatora pozycji "
                "„catalog_item_id”."
            ),
        )
    return OdczytWiazania(
        pozycja=pozycja,
        wersja=_tekst(surowe.get("catalog_item_version")),
        przestrzen=_tekst(surowe.get("catalog_namespace")),
    )


def _jest_kluczem_wskazania(nazwa: str) -> bool:
    """Czy nazwa klucza jest drogą wskazania pozycji katalogu (wiązanie albo zamiennik)."""
    return (
        nazwa in ("catalog_ref", "catalog_item_id", "catalog_item_version", KLUCZ_WIAZANIA)
        or nazwa in ZAMIENNIKI_W_WIAZANIU
        or nazwa.endswith(("_catalog_ref", "_catalog_item_id", "_" + KLUCZ_WIAZANIA))
    )


def zamienniki_klucza_w_ladunku(operacja: str, ladunek: Mapping[str, Any]) -> list[str]:
    """Ścieżki kluczy wskazania pozycji katalogu, których kontrakt operacji nie zna.

    Kontrakt operacji (``domain.canonical_operations``) jest RÓWNY odczytom handlera
    (``tests/ci/test_spec_operacji_rowna_odczytom_handlera.py``), a po karcie
    JEDEN-KLUCZ-KATALOGU żaden kształt nie niesie zamiennika obok wiązania
    (``scripts/klucz_katalogu_guard.py``). Klucz wskazania spoza kontraktu jest więc
    zamiennikiem — dawną drugą drogą wskazania — i operacja go odrzuca nazwanym kodem
    :data:`KOD_ZAMIENNIKA_KLUCZA`, zamiast pominąć po cichu. Woła to dyspozytor operacji
    (``enm.domain_operations.execute_domain_operation``) i brama API
    (``api.domain_ops_policy.validate_and_materialize_catalog_binding``).
    """
    from domain.canonical_operations import klucze_spoza_kontraktu

    return [
        sciezka
        for sciezka in klucze_spoza_kontraktu(operacja, dict(ladunek))
        if _jest_kluczem_wskazania(sciezka.rsplit(".", 1)[-1].split("[", 1)[0])
    ]


def komunikat_zamiennikow_pl(sciezki: list[str]) -> str:
    """Zdanie odmowy ładunku z zamiennikami klucza wiązania."""
    lista = ", ".join(f"„{s}”" for s in sciezki)
    return (
        f"Ładunek wskazuje pozycję katalogu kluczem spoza kontraktu operacji ({lista}). "
        "Pozycję katalogu wskazuje wyłącznie wiązanie „catalog_binding” "
        "(albo „<rola>_catalog_binding”) z identyfikatorem „catalog_item_id”."
    )
