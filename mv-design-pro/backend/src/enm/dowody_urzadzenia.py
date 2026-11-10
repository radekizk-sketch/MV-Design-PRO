"""Zainstalowana wersja urządzenia OZE/PPM do dowodzenia pokrycia certyfikatem.

To NIE kopia katalogu producenta, lecz ślad as-built instalacji. Weryfikacja
zgodności typu jest odczytem rejestru PTPiREE, nie danymi podawanymi przez klienta.
"""
from __future__ import annotations

from datetime import date
from typing import Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .deklaracje_modulu import DataUmowy


class DowodKonfiguracjiUrzadzenia(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    wersja_oprogramowania: str | None = Field(default=None, min_length=1)
    numer_seryjny: str | None = Field(default=None, min_length=1)
    data_potwierdzenia: DataUmowy | None = None
    identyfikator_protokolu: str | None = Field(default=None, min_length=1)
    zrodlo_pl: str | None = Field(default=None, min_length=1)

    @model_validator(mode="after")
    def _proweniencja(self) -> Self:
        dane = (
            self.wersja_oprogramowania, self.numer_seryjny,
            self.data_potwierdzenia, self.identyfikator_protokolu,
        )
        if any(x is not None for x in dane) and not (self.zrodlo_pl and self.zrodlo_pl.strip()):
            raise ValueError(
                "As-built urządzenia bez dowodu źródłowego: protokół/karta/odczyt "
                "firmware musi mieć identyfikator i źródło."
            )
        return self
