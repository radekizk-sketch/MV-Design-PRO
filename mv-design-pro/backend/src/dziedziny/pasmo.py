"""Definicja pasma widma (``SupraharmonicBand`` planu) — dana z dokumentu, nie definicja w kodzie.

Jedna klasa dla dziedziny harmonicznej i supraharmonicznej: grupowanie harmonicznych
IEC 61000-4-7 i pasma 2–150 kHz opisuje ten sam zestaw pól (zakres, rozdzielczość, pasmo
agregacji, metoda pomiaru, dokument, wersja). ZERO literałów pasm w kodzie produktu:
definicje żyją w danych profilu regulacyjnego (warstwa jakości energii, sekcja ``pasma:``)
i powstają WYŁĄCZNIE z dokumentem (tytuł, wydanie, jednostka redakcyjna). Bez dokumentu
pasmo nie istnieje, a metryka pasma kończy się brakiem podstawy z nazwanym dokumentem.

Walidator: f_min < f_max, rozdzielczość > 0, pasmo agregacji ≥ rozdzielczość. Reguła
pary pasmo ↔ model: pasmo supraharmoniczne wymaga pasma rozdzielczości (RBW) w parametrach
pomiaru każdego modelu, który je wskazuje (``modele_niezgodne_z_pasmem``).

IMPORTY: stdlib, pydantic, ``werdykt.kontrakt``, ``dziedziny.*``.
"""

from __future__ import annotations

from typing import Self

from dziedziny.kanon import Dodatnia, KontraktDziedziny, Nieujemna, naruszenie
from dziedziny.widmo import DziedzinaWidmowa, ModelZrodlaWidmowego
from pydantic import model_validator
from werdykt.kontrakt import PodstawaWymagania, Tekst


class PasmoWidma(KontraktDziedziny):
    """Pasmo widma z dokumentu (np. grupa podgrup IEC 61000-4-7, pasmo 2–150 kHz)."""

    ident: Tekst
    dziedzina: DziedzinaWidmowa
    f_min_hz: Nieujemna
    f_max_hz: Dodatnia
    rozdzielczosc_hz: Dodatnia
    pasmo_agregacji_hz: Dodatnia
    metoda_pomiaru: Tekst
    podstawa: PodstawaWymagania
    wersja: Tekst

    @model_validator(mode="after")
    def _spojnosc(self) -> Self:
        if not self.f_min_hz < self.f_max_hz:
            raise ValueError(
                naruszenie(
                    "pasmo.definicja",
                    f"Pasmo '{self.ident}': f_min < f_max wymagane ({self.f_min_hz} ≥ "
                    f"{self.f_max_hz} Hz).",
                )
            )
        if self.pasmo_agregacji_hz < self.rozdzielczosc_hz:
            raise ValueError(
                naruszenie(
                    "pasmo.definicja",
                    f"Pasmo '{self.ident}': pasmo agregacji {self.pasmo_agregacji_hz} Hz węższe od "
                    f"rozdzielczości {self.rozdzielczosc_hz} Hz.",
                )
            )
        return self


def modele_niezgodne_z_pasmem(
    pasmo: PasmoWidma, modele: tuple[ModelZrodlaWidmowego, ...]
) -> tuple[str, ...]:
    """Identyfikatory modeli wskazujących pasmo, które naruszają jego wymagania.

    Model wskazuje pasmo przez ``pasmo_ref == pasmo.ident``. Naruszenia: inna dziedzina niż
    pasmo; dla pasma supraharmonicznego — brak parametrów pomiaru albo brak RBW.
    """
    niezgodne: list[str] = []
    for model in sorted(modele, key=lambda m: m.ident):
        if model.pasmo_ref != pasmo.ident:
            continue
        if model.dziedzina != pasmo.dziedzina:
            niezgodne.append(model.ident)
            continue
        if pasmo.dziedzina == "SUPRAHARMONIC_FREQUENCY_DOMAIN" and (
            model.pomiar is None or model.pomiar.rbw_hz is None
        ):
            niezgodne.append(model.ident)
    return tuple(niezgodne)


__all__ = ["PasmoWidma", "modele_niezgodne_z_pasmem"]
