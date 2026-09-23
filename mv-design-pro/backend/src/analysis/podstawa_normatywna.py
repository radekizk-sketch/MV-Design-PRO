"""Podstawa normatywna wymagania — JEDEN typ dla wszystkich nosnikow werdyktu.

Warstwa ANALIZY (interpretacja, zero fizyki). Typ mieszka tutaj, a nie w
``application/analyses/werdykt_projektowy.py`` (gdzie powstal w karcie AB-1a D2),
bo dostawcy analiz (``analysis/**``: walidacja energetyczna, profil napiec, raport
normatywny, wrazliwosc, rekomendacje, krzywe I–t) niosa podstawe WPROST w pozycji
(karta AB-1a-bis), a ``werdykt_projektowy`` importuje tych dostawcow — import w
druga strone zamknalby cykl. ``werdykt_projektowy`` uzywa tego samego typu (import
stad) — jeden kontrakt, nie drugi.

``zrodlo_status`` = ``StatusZrodla`` z ``solver_input.provenance`` (jedna os statusu
zrodla normatywnego, karta AB-1a D5). Dokument/wersja/klauzula nieprzypiete w kodzie
z cytowanym zrodlem -> ``None`` + ``UNVERIFIED_SOURCE`` (karta AB-1a §0 R-7: liczba
zostaje, zmienia sie jej opis).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from solver_input.provenance import StatusZrodla


@dataclass(frozen=True)
class PodstawaNormatywna:
    """Podstawa wymagania: dokument, wersja, klauzula i status zrodla.

    ``zrodlo_status`` jest OBOWIAZKOWE (bez domyslnej) — podstawa bez
    rozstrzygniecia, czy zrodlo potwierdzono, bylaby ta sama niejawnoscia, ktora
    ta klasa zamyka. Gdy dokument/wersja/klauzula nie sa potwierdzone, pola sa
    ``None`` (nie tekst zastepczy), a ``uwaga_pl`` mowi, czego brakuje.
    ``render_pl()`` jest JEDYNYM zrodlem tekstowego ``norma_pl`` pozycji, ktora
    niesie podstawe (pin w ``PozycjaWerdyktu.__post_init__``).
    """

    dokument: str | None
    wersja: str | None
    klauzula: str | None
    zrodlo_status: StatusZrodla
    uwaga_pl: str | None = None

    def render_pl(self) -> str:
        czesci = [
            czesc
            for czesc in (
                self.dokument,
                f"wersja {self.wersja}" if self.wersja else None,
                self.klauzula,
            )
            if czesc
        ]
        return ", ".join(czesci) if czesci else "Brak wskazanego dokumentu podstawy wymagania"

    def to_dict(self) -> dict[str, Any]:
        return {
            "dokument": self.dokument,
            "wersja": self.wersja,
            "klauzula": self.klauzula,
            "zrodlo_status": self.zrodlo_status,
            "uwaga_pl": self.uwaga_pl,
        }


def podstawa_niezweryfikowana(uwaga_pl: str, *, dokument: str | None = None) -> PodstawaNormatywna:
    """Podstawa bez przypietej wersji i klauzuli: ``UNVERIFIED_SOURCE`` z uwaga.

    Jedyna droga budowy podstaw dostawcow analiz (AB-1a-bis): zaden z nich nie ma
    w kodzie cytowanego wydania ani punktu dokumentu, wiec ``wersja``/``klauzula``
    sa ``None`` z definicji, a ``dokument`` tylko wtedy, gdy kod NAZYWA dokument.
    """
    return PodstawaNormatywna(
        dokument=dokument,
        wersja=None,
        klauzula=None,
        zrodlo_status=StatusZrodla.UNVERIFIED_SOURCE,
        uwaga_pl=uwaga_pl,
    )


def dowod_pozycji(
    *, run_id: str | None, element_id: str | None, trace_ref: str | None
) -> dict[str, str | None]:
    """Odwolanie do dowodu — JEDEN ksztalt karty AB-1a D2 (``OcenaElementu.dowod``):
    ``{run_id, element_id, trace_ref}``; brak danej = ``None`` (nigdy zastepnik)."""
    return {"run_id": run_id, "element_id": element_id, "trace_ref": trace_ref}
