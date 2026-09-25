"""Karta widmowa urządzenia — jednostka importu i rekord katalogu (karta AB-H0 §0.7).

Karta jest OSOBNYM rekordem (nie polem typu przekształtnika): typ może mieć wiele raportów
badań (punkty pracy, dziedziny, wydania), a dowód jest per dokument — wzorzec wykazu
PTPiREE i profili ``der_dynamic``. Karta wskazuje typ urządzenia przez ``urzadzenie_ref``
(id typu katalogowego przekształtnika — ten sam id w przestrzeni ``CONVERTER`` i w
projekcjach ``ZRODLO_NN_PV`` / ``ZRODLO_NN_BESS``, bo projekcje zachowują id).

Karta żyje w dwóch miejscach, tym samym typem:

* katalog statyczny (przestrzeń ``KARTA_WIDMOWA``) — WYŁĄCZNIE z wyciągiem dokumentu
  producenta przypiętym SHA-256; bez dokumentu karty nie ma (zero widm „typowych");
* katalog projektu w modelu (``EnergyNetworkModel.katalog_projektu.karty_widmowe``) —
  dane inżyniera (widmo ręczne, import raportu dla projektu) ze statusem
  ``NIEWERYFIKOWANY`` / ``PROJEKTOWY_V1``.

Generator dostaje ZMATERIALIZOWANĄ kopię modeli wybranych kart z proweniencją
(``ModeleWidmoweElementu``) — solver i most V12.6 czytają wyłącznie ENM.

IMPORTY: stdlib, pydantic, ``werdykt.kontrakt``, ``dziedziny.*``.
"""

from __future__ import annotations

from typing import Any, Literal, Self

from dziedziny.kanon import KontraktDziedziny, naruszenie
from dziedziny.sekcje import DowodModelu, RodzajDowodu, StatusWeryfikacjiRekordu
from dziedziny.widmo import ModelZrodlaWidmowego
from pydantic import field_validator, model_validator
from werdykt.kontrakt import DziedzinaFizyki, PodstawaWymagania, Tekst

#: Status katalogu rekordu — wartości ``CatalogStatus`` (parytet przypięty testem).
StatusKataloguKarty = Literal[
    "PRODUKCYJNY_V1", "REFERENCYJNY_V1", "ANALITYCZNY_V1", "TESTOWY", "PROJEKTOWY_V1"
]
#: Przestrzeń, z której pochodzi karta zmaterializowana w elemencie.
PrzestrzenKarty = Literal["STATYCZNA", "PROJEKT"]
#: Rodzaje dowodów dopuszczalne w karcie widmowej (certyfikat zgodności NC RfG nie jest
#: dowodem widma).
DOWODY_KARTY: frozenset[RodzajDowodu] = frozenset(("RAPORT_BADAN", "POMIAR", "CERTYFIKAT_MODELU"))
#: Dziedziny, które może pokrywać dowód karty widmowej.
DZIEDZINY_KARTY: frozenset[DziedzinaFizyki] = frozenset(
    ("HARMONIC_FREQUENCY_DOMAIN", "SUPRAHARMONIC_FREQUENCY_DOMAIN")
)


class KartaWidmowa(KontraktDziedziny):
    """Rekord karty widmowej urządzenia (metadane katalogu wg ``catalog_metadata_guard``)."""

    id: Tekst
    urzadzenie_ref: Tekst
    producent: Tekst
    model_urzadzenia: Tekst
    modele: tuple[ModelZrodlaWidmowego, ...]
    dowody: tuple[DowodModelu, ...] = ()
    podstawa: PodstawaWymagania
    wersja: Tekst
    verification_status: StatusWeryfikacjiRekordu
    source_reference: Tekst
    catalog_status: StatusKataloguKarty
    contract_version: Tekst

    @field_validator("modele")
    @classmethod
    def _modele_niepuste_posortowane(
        cls, modele: tuple[ModelZrodlaWidmowego, ...]
    ) -> tuple[ModelZrodlaWidmowego, ...]:
        if not modele:
            raise ValueError(
                naruszenie(
                    "widmo.niepuste", "Karta widmowa wymaga co najmniej jednego modelu widmowego."
                )
            )
        identy = [m.ident for m in modele]
        if len(set(identy)) != len(identy):
            raise ValueError(
                naruszenie(
                    "karta.modele_unikalne", f"Modele karty powtarzają identyfikatory: {identy}."
                )
            )
        return tuple(sorted(modele, key=lambda m: m.ident))

    @field_validator("dowody")
    @classmethod
    def _dowody_posortowane(cls, dowody: tuple[DowodModelu, ...]) -> tuple[DowodModelu, ...]:
        return tuple(sorted(dowody, key=lambda d: (d.rodzaj, d.odniesienie_pl)))

    @model_validator(mode="after")
    def _dowody_widmowe(self) -> Self:
        for dowod in self.dowody:
            if dowod.rodzaj not in DOWODY_KARTY:
                raise ValueError(
                    naruszenie(
                        "karta.dowody",
                        f"Karta '{self.id}': dowód {dowod.rodzaj} nie jest dowodem widma "
                        "(dopuszczalne: raport badań, pomiar, certyfikat modelu).",
                    )
                )
            spoza = sorted(set(dowod.pokrywa) - DZIEDZINY_KARTY)
            if spoza:
                raise ValueError(
                    naruszenie(
                        "karta.dowody",
                        f"Karta '{self.id}': dowód '{dowod.odniesienie_pl}' pokrywa dziedziny spoza "
                        f"dziedziny częstotliwości: {spoza}.",
                    )
                )
        return self

    def to_dict(self) -> dict[str, Any]:
        """Postać rekordu dla materializacji katalogu (``materialize_catalog_binding``)."""
        return self.model_dump(mode="json")


class OdniesienieKarty(KontraktDziedziny):
    """Proweniencja karty zmaterializowanej w elemencie: id, wersja, przestrzeń i odcisk
    SHA-256 karty (``KartaWidmowa.odcisk()``) z chwili materializacji."""

    karta_id: Tekst
    wersja: Tekst
    przestrzen: PrzestrzenKarty
    odcisk_karty: Tekst


class ModeleWidmoweElementu(KontraktDziedziny):
    """Zmaterializowana kopia modeli z kart powiązanych z elementem (nośnik w ENM)."""

    modele: tuple[ModelZrodlaWidmowego, ...]
    zrodla: tuple[OdniesienieKarty, ...]

    @field_validator("zrodla")
    @classmethod
    def _zrodla_niepuste_posortowane(
        cls, zrodla: tuple[OdniesienieKarty, ...]
    ) -> tuple[OdniesienieKarty, ...]:
        if not zrodla:
            raise ValueError(
                naruszenie(
                    "karta.materializacja",
                    "Modele widmowe elementu wymagają co najmniej jednej karty źródłowej.",
                )
            )
        identy = [z.karta_id for z in zrodla]
        if len(set(identy)) != len(identy):
            raise ValueError(
                naruszenie("karta.materializacja", f"Karty źródłowe powtarzają się: {identy}.")
            )
        return tuple(sorted(zrodla, key=lambda z: z.karta_id))

    @field_validator("modele")
    @classmethod
    def _modele_posortowane(
        cls, modele: tuple[ModelZrodlaWidmowego, ...]
    ) -> tuple[ModelZrodlaWidmowego, ...]:
        if not modele:
            raise ValueError(
                naruszenie("karta.materializacja", "Modele widmowe elementu nie mogą być puste.")
            )
        identy = [m.ident for m in modele]
        if len(set(identy)) != len(identy):
            raise ValueError(
                naruszenie(
                    "karta.materializacja",
                    f"Modele z różnych kart powtarzają identyfikatory: {identy} — identyfikator "
                    "modelu musi być unikalny w obrębie elementu.",
                )
            )
        return tuple(sorted(modele, key=lambda m: m.ident))


def materializuj_modele_widmowe(
    karty: tuple[tuple[KartaWidmowa, PrzestrzenKarty], ...],
) -> ModeleWidmoweElementu:
    """Zmaterializuj modele z kart (wraz z przestrzenią pochodzenia) w nośnik elementu.

    JEDNA reguła kopiowania dla karty statycznej i karty projektu: modele przepisane bez
    zmian, proweniencja = (id, wersja, przestrzeń, odcisk karty).
    """
    if not karty:
        raise ValueError(
            naruszenie(
                "karta.materializacja",
                "Materializacja modeli widmowych wymaga co najmniej jednej karty.",
            )
        )
    return ModeleWidmoweElementu(
        modele=tuple(model for karta, _ in karty for model in karta.modele),
        zrodla=tuple(
            OdniesienieKarty(
                karta_id=karta.id,
                wersja=karta.wersja,
                przestrzen=przestrzen,
                odcisk_karty=karta.odcisk(),
            )
            for karta, przestrzen in karty
        ),
    )


__all__ = [
    "DOWODY_KARTY",
    "DZIEDZINY_KARTY",
    "KartaWidmowa",
    "ModeleWidmoweElementu",
    "OdniesienieKarty",
    "PrzestrzenKarty",
    "StatusKataloguKarty",
    "materializuj_modele_widmowe",
]
