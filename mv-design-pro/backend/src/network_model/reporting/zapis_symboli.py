"""Symbol wielkości w raporcie PDF/DOCX — indeks dolny składany przez format, nie ASCII.

Kontrakt prezentacji (``docs/uiux/KONTRAKT_PREZENTACJI_INZYNIERSKIEJ_V12_7.md``, karta
PROZA-BEZ-SYMBOLI-ASCII): symbol wielkości projektant widzi jako wzór albo słowami, nigdy jako
zapis ASCII ``I_s``. Teksty raportów zabezpieczeń zapisują symbol segmentem ``$I_{s}$``
(ta sama notacja co proza ekranu, którą składa ``TekstZWzorami``); ten moduł rozbija tekst na
odcinki, które renderer formatu składa właściwym środkiem — PDF (reportlab) mniejszym,
obniżonym krojem, DOCX (python-docx) atrybutem ``subscript`` przebiegu.

Obsługiwany zapis segmentu: ``$<podstawa>_{<indeks>}$`` (podstawa i indeks bez ``$``).
Segment spoza tej postaci jest błędem programu — ``ValueError``, nie cichy tekst ASCII.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

_SEGMENT = re.compile(r"\$([^$]*)\$")
_SYMBOL = re.compile(r"([^$_{}]+)_\{([^$_{}]+)\}")


@dataclass(frozen=True)
class Odcinek:
    """Odcinek tekstu raportu: zwykły albo indeks dolny symbolu."""

    tekst: str
    indeks_dolny: bool = False


def odcinki(tekst: str) -> tuple[Odcinek, ...]:
    """Tekst raportu → odcinki do złożenia (proza, podstawa symbolu, indeks dolny)."""
    wynik: list[Odcinek] = []
    poz = 0
    for segment in _SEGMENT.finditer(tekst):
        if segment.start() > poz:
            wynik.append(Odcinek(tekst[poz : segment.start()]))
        symbol = _SYMBOL.fullmatch(segment.group(1))
        if symbol is None:
            raise ValueError(
                f"Segment wzoru {segment.group(0)!r} raportu nie ma postaci podstawa_{{indeks}}."
            )
        wynik.append(Odcinek(symbol.group(1)))
        wynik.append(Odcinek(symbol.group(2), indeks_dolny=True))
        poz = segment.end()
    if poz < len(tekst):
        wynik.append(Odcinek(tekst[poz:]))
    return tuple(wynik)


def tekst_plaski(tekst: str) -> str:
    """Postać bez znaczników (podstawa i indeks sklejone) — do miary szerokości i porównań."""
    return "".join(o.tekst for o in odcinki(tekst))
