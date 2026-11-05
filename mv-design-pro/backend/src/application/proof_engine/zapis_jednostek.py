"""Zapis jednostki wartości dowodu w LaTeX (eksport LaTeX/PDF dowodu).

DLACZEGO. Jednostka wartości kroku (`ProofValue.unit`, `SymbolDefinition.unit`) jest daną
w zapisie Unicode (`Ω`, `Ω/km`, `kA²s`, `μS/km`, `°C`). Eksport wstawiał ją do wzoru jako
`\\text{Ω}`: preambuła dokumentu (`inputenc` utf8 + `fontenc` T1) nie ma znaku Ω ani μ
w kodowaniu T1, więc `pdflatex` przerywał kompilację na pierwszej impedancji, a KaTeX
pokazywał znak z czcionki tekstowej zamiast symbolu. Zapis kanoniczny jednostki we wzorze:
litery jednostki prostym krojem (`\\mathrm{kA}`), symbol om jako `\\Omega`, mikro jako `\\mu`,
potęga jako `^{2}`, procent jako `\\%` — wyłącznie znaki ASCII.

Jednostka bez wymiaru (`—`, `-`, pusta) zostaje kreską w trybie tekstowym (`\\text{—}`):
kreska pauzy jest w kodowaniu T1 i tak wyglądał dotychczasowy zapis.
"""

from __future__ import annotations

import re

from application.proof_engine.types import JEDNOSTKI_BEZWYMIAROWE

#: Znak jednostki Unicode → zapis LaTeX (zbiór zamknięty; inny znak spoza ASCII zostaje
#: i czerwieni test zapisu ASCII jednostek rejestru równań).
_ZNAKI: dict[str, str] = {
    "Ω": r"\Omega",
    "μ": r"\mu",
    "µ": r"\mu",
    "²": "^{2}",
    "³": "^{3}",
    "°": r"{}^{\circ}",
    "%": r"\%",
    "·": r"\cdot ",
}
_POTEGA_UJEMNA = re.compile("⁻¹")
_TOKEN = re.compile(r"[A-Za-z0-9.]+|⁻¹|.", re.DOTALL)


def jednostka_latex(jednostka: str) -> str:
    """Jednostka w zapisie wzoru LaTeX (`kA` → `\\mathrm{kA}`, `Ω/km` → `\\Omega/\\mathrm{km}`).

    Jednostka bez wymiaru → `\\text{—}`; spacja jednostki złożonej → `\\,`.
    """
    jednostka = jednostka.strip()
    if jednostka in JEDNOSTKI_BEZWYMIAROWE:
        return r"\text{—}"
    czesci: list[str] = []
    tokeny = _TOKEN.findall(jednostka)
    indeks = 0
    while indeks < len(tokeny):
        token = tokeny[indeks]
        indeks += 1
        if token == "√" and indeks < len(tokeny):
            # Pierwiastek obejmuje następny człon jednostki (`A·√s/mm²` → `\sqrt{\mathrm{s}}`).
            czesci.append(rf"\sqrt{{{jednostka_latex(tokeny[indeks])}}}")
            indeks += 1
        elif _POTEGA_UJEMNA.fullmatch(token):
            czesci.append("^{-1}")
        elif token.isascii() and token.isdigit():
            czesci.append(token)
        elif token[0].isascii() and (token[0].isalnum() or token[0] == "."):
            czesci.append(rf"\mathrm{{{token}}}")
        elif token == " ":
            czesci.append(r"\,")
        else:
            czesci.append(_ZNAKI.get(token, token))
    return "".join(czesci)
