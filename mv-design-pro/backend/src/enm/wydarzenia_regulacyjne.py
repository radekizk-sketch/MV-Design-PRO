"""Zdarzenia prawne MWE — odrębne daty WOS/WiPWC/PTPiREE, bez domyślania z daty umowy.

Nie określa wymagań ani ich spełnienia. Wpisy są częścią ENM, weryfikowane i
wersjonowane wraz z przypadkiem; przy braku zdarzenia nie wolno zgadywać daty.
"""
from __future__ import annotations

from datetime import date
from typing import Self

from pydantic import BaseModel, ConfigDict, Field, StrictBool, model_validator

from .deklaracje_modulu import DataUmowy


class WydarzeniaRegulacyjne(BaseModel):
    """Źródłowo potwierdzone daty dla NC RfG/WOS 2025 i PTPiREE 3.0.

    Daty są nominalnymi datami kalendarzowymi, nie czasem Unix. Znaczna zmiana
    umowy nie wynika z samego faktu remontu.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    data_wydania_warunkow: DataUmowy | None = None
    data_zgloszenia_przylaczenia: DataUmowy | None = None
    data_zgloszenia_modernizacji: DataUmowy | None = None
    znaczna_zmiana_umowy: StrictBool | None = None
    data_oswiadczenia_gotowosci_przylaczenia: DataUmowy | None = None
    data_oswiadczenia_gotowosci_przyjecia_napiecia: DataUmowy | None = None
    zrodlo_pl: str | None = Field(default=None, min_length=1)

    @model_validator(mode="after")
    def _require_source(self) -> Self:
        dane = (
            self.data_wydania_warunkow,
            self.data_zgloszenia_przylaczenia,
            self.data_zgloszenia_modernizacji,
            self.znaczna_zmiana_umowy,
            self.data_oswiadczenia_gotowosci_przylaczenia,
            self.data_oswiadczenia_gotowosci_przyjecia_napiecia,
        )
        if any(x is not None for x in dane) and not (self.zrodlo_pl and self.zrodlo_pl.strip()):
            raise ValueError("Każde zdarzenie regulacyjne wymaga wskazania źródła dokumentowego.")
        return self
