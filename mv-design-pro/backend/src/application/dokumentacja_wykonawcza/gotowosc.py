"""Gotowość projektu do DOKUMENTACJI WYKONAWCZEJ (karta KOMPLETNOSC-POLA-TR §0 pkt 2).

CO TO ROZSTRZYGA. Dokumentacja wykonawcza (profil raportu ``wykonawczy`` — PW)
opisuje, CO i JAK ma zostać zbudowane: rysunki, nominalia aparatury, zestawienia
pól. Model, w którym transformator wisi na szynie SN bez skonfigurowanego pola
transformatorowego, NIE opisuje wykonalnej rozdzielni — nie da się z niego
wyprowadzić ani aparatury odejścia, ani jego nominaliów. Praca koncepcyjna i
OBLICZENIA na takim modelu są w pełni legalne (transformator istnieje, solver go
liczy), więc bramka nie dotyka ani jednego, ani drugiego: zamyka WYŁĄCZNIE drogę
do dokumentacji wykonawczej.

DLACZEGO WARSTWA APLIKACJI. To jest INTERPRETACJA stanu modelu („czy wolno
wydać PW"), a nie fizyka ani mutacja — zero obliczeń, zero zmian w modelu.
Sygnał pochodzi z JEDNEGO predykatu domenowego
(`enm/pole_transformatorowe.py`), tego samego, który zapala ostrzeżenie W041 w
bramce gotowości inżynierskiej i marker „!" na rysunku SLD.

LISTA BLOKAD JEST OTWARTA. Dziś niesie jedną pozycję (brak pola
transformatorowego SN). Każda kolejna karta, która nazwie warunek zamykający
drogę do PW, dokłada tu pozycję — kontrakt odpowiedzi (`blokady[]`) jest z tego
powodu listą od pierwszego dnia, a nie pojedynczym polem.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from enm.pole_transformatorowe import komunikat_braku_pola, transformatory_bez_pola_sn

#: Profil raportu, którego dotyczy ta bramka (kontrakt `api/analysis_run_exports.py`).
PROFIL_DOKUMENTACJI_WYKONAWCZEJ = "wykonawczy"


@dataclass(frozen=True)
class BlokadaDokumentacji:
    """Jeden powód, dla którego projekt nie jest gotowy do dokumentacji wykonawczej."""

    code: str
    """Kanoniczny kod gotowości (`domain/canonical_operations.READINESS_CODES`)."""

    message_pl: str
    """Komunikat dla projektanta — ten sam, który niesie ostrzeżenie gotowości."""

    element_refs: tuple[str, ...]
    """Realne referencje elementów modelu (nigdy fabrykowane)."""


@dataclass(frozen=True)
class GotowoscDokumentacjiWykonawczej:
    """Werdykt bramki: gotowość + komplet powodów jej braku."""

    gotowy: bool
    blokady: tuple[BlokadaDokumentacji, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "gotowy": self.gotowy,
            "blokady": [
                {
                    "code": blokada.code,
                    "message_pl": blokada.message_pl,
                    "element_refs": list(blokada.element_refs),
                }
                for blokada in self.blokady
            ],
        }


def ocen_gotowosc_dokumentacji_wykonawczej(enm: Any) -> GotowoscDokumentacjiWykonawczej:
    """Werdykt dla modelu/migawki ENM (słownik migawki albo `EnergyNetworkModel`).

    Deterministyczny: kolejność blokad pochodzi z uporządkowanego wyniku
    predykatu (stacja, transformator).
    """
    blokady = tuple(
        BlokadaDokumentacji(
            code="transformer.bay_missing",
            message_pl=komunikat_braku_pola(znalezisko),
            element_refs=(znalezisko.transformer_ref, znalezisko.station_ref),
        )
        for znalezisko in transformatory_bez_pola_sn(enm)
    )
    return GotowoscDokumentacjiWykonawczej(gotowy=not blokady, blokady=blokady)


def komunikat_odmowy(werdykt: GotowoscDokumentacjiWykonawczej) -> str:
    """Zdanie odmowy eksportu — wymienia POWODY, nie sam fakt odmowy."""
    powody = "; ".join(blokada.message_pl for blokada in werdykt.blokady)
    return (
        "Projekt nie jest gotowy do dokumentacji wykonawczej, więc raport w profilu "
        "„Wykonawczy” nie może zostać wygenerowany. "
        f"Powody: {powody}"
    )
