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

#: Przestrzeń katalogu punktów pośrednich SN (słup rozgałęźny, ZKSN) — własny katalog obiektów.
PRZESTRZEN_PUNKTU_POSREDNIEGO_SN = "mv_branch_points"

#: Kod odmowy ładunku z zamiennikiem klucza wiązania.
KOD_ZAMIENNIKA_KLUCZA = "catalog.binding_key_alias"

#: Kod odmowy wiązania bez identyfikatora pozycji albo o złym kształcie.
KOD_WIAZANIA_NIEPOPRAWNEGO = "catalog.binding_invalid"

#: Kod odmowy wiązania deklarującego przestrzeń katalogu inną niż przestrzeń RODZAJU
#: elementu (ten sam kod co ``assign_catalog_to_element``).
KOD_PRZESTRZENI_NIEZGODNEJ = "catalog.namespace_mismatch"

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

    ``catalog_binding`` → ``catalog_ref``, ``catalog_item_id``, ``catalog_item_version``,
    ``catalog_namespace``, ``catalog_version`` (pola wiązania podane obok wiązania);
    ``<rola>_catalog_binding`` → ``<rola>_catalog_ref``, ``<rola>_catalog_item_id``.
    Funkcja jest też podstawą strażnika kontraktu operacji
    (``scripts/klucz_katalogu_guard.py``): kształt węzła z kluczem wiązania nie może
    zawierać żadnego z tych kluczy.
    """
    if klucz_wiazania == KLUCZ_WIAZANIA:
        return (
            "catalog_ref",
            "catalog_item_id",
            "catalog_item_version",
            "catalog_namespace",
            "catalog_version",
        )
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


def odmowa_przestrzeni(
    przestrzen_wiazania: str | None, przestrzen_rodzaju: str, *, opis_pl: str = "Element"
) -> OdczytWiazania | None:
    """Odmowa :data:`KOD_PRZESTRZENI_NIEZGODNEJ`, gdy wiązanie deklaruje przestrzeń inną niż
    przestrzeń rodzaju elementu; ``None`` — zgodna albo niezadeklarowana.

    JEDNO źródło prawdy przestrzeni (karta JEDEN-KLUCZ-KATALOGU, V12K-316 dług 4): kategoria
    katalogu wynika z RODZAJU tworzonego elementu. Dawniej brama API przyjmowała przestrzeń
    z wiązania, a operacja nadpisywała ją przestrzenią rodzaju — para predykatów sprawdzała
    pozycję w jednej kategorii, a materializowała w drugiej. Woła ją :func:`odczytaj_wiazanie`
    (brama API i operacje V2) oraz materializacja operacji V1 (``_materialize_catalog_payload``).
    """
    if przestrzen_wiazania is None or przestrzen_wiazania == przestrzen_rodzaju:
        return None
    return OdczytWiazania(
        kod_bledu=KOD_PRZESTRZENI_NIEZGODNEJ,
        komunikat_pl=(
            f"{opis_pl}: wiązanie deklaruje grupę katalogu „{przestrzen_wiazania}”, a element "
            f"tego rodzaju bierze pozycję z grupy „{przestrzen_rodzaju}” — wskaż pozycję "
            "z właściwej grupy albo pomiń grupę w wiązaniu."
        ),
    )


def _tekst(wartosc: object) -> str | None:
    if isinstance(wartosc, str) and wartosc.strip():
        return wartosc.strip()
    return None


def odczytaj_wiazanie(
    wezel: object,
    klucz: str = KLUCZ_WIAZANIA,
    *,
    opis_pl: str = "Element",
    przestrzen_rodzaju: str | None = None,
) -> OdczytWiazania:
    """Odczytaj wiązanie ``wezel[klucz]`` — jedyny odczyt pozycji katalogu ładunku.

    Odmowa :data:`KOD_ZAMIENNIKA_KLUCZA`, gdy węzeł niesie zamiennik klucza
    (:func:`zamienniki_klucza`) albo wiązanie niesie zamiennik pola
    (:data:`ZAMIENNIKI_W_WIAZANIU`) — niezależnie od wartości: obecność klucza jest
    deklaracją drugiej drogi wskazania. Odmowa :data:`KOD_WIAZANIA_NIEPOPRAWNEGO`, gdy
    wiązanie nie jest słownikiem albo nie niesie ``catalog_item_id``. Węzeł bez
    klucza wiązania (albo z wartością ``None``) nie wskazuje pozycji.

    ``przestrzen_rodzaju`` (przestrzeń katalogu RODZAJU elementu): wynik niesie tę przestrzeń,
    a wiązanie deklarujące inną daje odmowę :data:`KOD_PRZESTRZENI_NIEZGODNEJ`
    (:func:`odmowa_przestrzeni`).
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
    przestrzen = _tekst(surowe.get("catalog_namespace"))
    if przestrzen_rodzaju is not None:
        odmowa = odmowa_przestrzeni(przestrzen, przestrzen_rodzaju, opis_pl=opis_pl)
        if odmowa is not None:
            return odmowa
        przestrzen = przestrzen_rodzaju
    return OdczytWiazania(
        pozycja=pozycja,
        wersja=_tekst(surowe.get("catalog_item_version")),
        przestrzen=przestrzen,
    )


def _jest_kluczem_wskazania(nazwa: str) -> bool:
    """Czy nazwa klucza jest drogą wskazania pozycji katalogu (wiązanie albo zamiennik)."""
    return (
        nazwa in zamienniki_klucza(KLUCZ_WIAZANIA) + (KLUCZ_WIAZANIA,)
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
    from domain.canonical_operations import (
        CANONICAL_OPERATIONS,
        klucze_spoza_kontraktu,
        resolve_operation_name,
    )

    if resolve_operation_name(operacja) not in CANONICAL_OPERATIONS:
        # Nieznaną operację odrzuca dyspozytor kodem `dispatcher.unknown_operation` —
        # tu nie ma kontraktu, względem którego klucz byłby zamiennikiem.
        return []
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


def _jest_kluczem_wiazania(nazwa: str) -> bool:
    return nazwa == KLUCZ_WIAZANIA or nazwa.endswith("_" + KLUCZ_WIAZANIA)


def _bledy_wiazan_w_wezle(
    wezel: object,
    ksztalt: object,
    sciezka: str,
    wynik: list[tuple[str, OdczytWiazania]],
) -> None:
    elementy: list[tuple[str, object]]
    if isinstance(wezel, Mapping):
        elementy = [(sciezka, wezel)]
    elif isinstance(wezel, list):
        elementy = [(f"{sciezka}[{i}]", e) for i, e in enumerate(wezel)]
    else:
        return
    pola = getattr(ksztalt, "pola", frozenset())
    zagniezdzone = getattr(ksztalt, "zagniezdzone", {})
    for prefiks, element in elementy:
        if not isinstance(element, Mapping):
            continue
        for klucz in sorted(pola):
            if _jest_kluczem_wiazania(klucz) and klucz in element:
                odczyt = odczytaj_wiazanie(element, klucz, opis_pl=f"{prefiks}.{klucz}")
                if odczyt.kod_bledu is not None:
                    wynik.append((f"{prefiks}.{klucz}", odczyt))
        for klucz, pod in zagniezdzone.items():
            if not _jest_kluczem_wiazania(klucz) and klucz in element:
                _bledy_wiazan_w_wezle(element[klucz], pod, f"{prefiks}.{klucz}", wynik)


def bledy_wiazan_w_ladunku(
    operacja: str, ladunek: Mapping[str, Any]
) -> list[tuple[str, OdczytWiazania]]:
    """Odmowy odczytu KAŻDEGO wiązania kontraktu operacji obecnego w ładunku.

    Jedno miejsce kontroli kształtu wiązań (wiązanie nie-obiekt, bez ``catalog_item_id``,
    z zamiennikiem pola wewnątrz) dla wszystkich kluczy wiązań — także ról
    (``<rola>_catalog_binding``) czytanych w operacji tylko po pozycji. Woła je dyspozytor
    operacji i brama API obok :func:`zamienniki_klucza_w_ladunku`, więc obie strony pary
    predykatów odrzucają ten sam ładunek tym samym kodem. Ścieżka: ``sn_fields[0].x``.
    """
    from domain.canonical_operations import (
        CANONICAL_OPERATIONS,
        KSZTALTY_ZAGNIEZDZONE,
        klucze_kontraktu,
        resolve_operation_name,
    )

    nazwa = resolve_operation_name(operacja)
    if nazwa not in CANONICAL_OPERATIONS:
        return []
    wynik: list[tuple[str, OdczytWiazania]] = []
    for klucz in sorted(klucze_kontraktu(nazwa)):
        if _jest_kluczem_wiazania(klucz) and klucz in ladunek:
            odczyt = odczytaj_wiazanie(ladunek, klucz, opis_pl=klucz)
            if odczyt.kod_bledu is not None:
                wynik.append((klucz, odczyt))
    for klucz, ksztalt in KSZTALTY_ZAGNIEZDZONE.get(nazwa, {}).items():
        if not _jest_kluczem_wiazania(klucz) and klucz in ladunek:
            _bledy_wiazan_w_wezle(ladunek[klucz], ksztalt, klucz, wynik)
    return wynik


def pozycja_wiazania(wezel: object, klucz: str) -> str | None:
    """Pozycja katalogu wskazana wiązaniem ``wezel[klucz]`` (``None`` — brak albo odmowa).

    Do odczytu w operacji PO kontroli :func:`bledy_wiazan_w_ladunku` w dyspozytorze — odmowa
    kształtu nie dociera wtedy do handlera; ta sama funkcja odczytu co brama API.
    """
    return odczytaj_wiazanie(wezel, klucz).pozycja
