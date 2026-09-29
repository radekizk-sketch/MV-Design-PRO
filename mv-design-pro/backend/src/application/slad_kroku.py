r"""Kontrakt pól kroku śladu WHITE BOX na granicy warstwy aplikacji.

KONTRAKT (karta DOWOD-CIEPLNY, 2026-09-25): zapis matematyczny kroku idzie
WYŁĄCZNIE do pól ``*_latex`` (``formula_latex``, ``substitution_latex``) jako
LaTeX goły (bez ``$$``); pola bez przyrostka (``substitution``, ``notes``,
``title``) są prozą, którą ekrany pokazują tekstem. Predykat kontraktu i
strażnik korpusu fikstur: ``scripts/slad_proza_bez_latex_guard.py``.

DLACZEGO MAPOWANIE, A NIE NAPRAWA U ŹRÓDŁA. Rdzeń IEC 60909
(``network_model/solvers/short_circuit_iec60909.py``) jest rdzeniem B-01
(``scripts/rdzenie_b01.py``) — zmiana wymaga decyzji właściciela. Rdzeń wpisuje
w krokach z ``KLUCZE_ZWARCIA_LATEX_W_PROZIE`` i z przedrostkiem
``PREFIKSY_KLUCZY_ZWARCIA_LATEX_W_PROZIE`` TEN SAM zapis LaTeX do
``substitution`` i do ``substitution_latex`` (przypięte testem
``tests/ci/test_slad_proza_bez_latex.py``). Granica aplikacji usuwa więc
duplikat z pola prozy PO KLUCZU KROKU, bez parsowania tekstu: zapis
matematyczny zostaje nietknięty w ``substitution_latex``. Kroki rdzenia spoza
rejestru (``thevenin_flow_*``) niosą w ``substitution`` zapis tekstowy bez
znaczników LaTeX i przechodzą bez zmian.

DRUGA POŁOWA KONTRAKTU — ZAPIS SKŁADALNY. Pole ``*_latex`` ma się złożyć w KaTeX-u
(``MathRenderer``); inaczej ekran pokazuje surowy zapis. Rdzeń w krokach śladu
podziału prądu (``thevenin_flow_<gałąź>``, ``thevenin_flow_balance``) pisze indeks
``ga\l`` — polecenie ``\l`` (ł) z plain TeX-a, którego KaTeX nie zna. Granica
aplikacji podmienia ``formula_latex`` tych kroków PO KLUCZU na zapis wierny wzorowi
rdzenia, z indeksem ``\text{gał}``. Przesłanka (dokładny tekst rdzenia) jest
przypięta testem — zmiana rdzenia zapali test zamiast cicho nadpisać nowy wzór.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any

#: Klucze kroków rdzenia IEC 60909, w których ``substitution`` jest kopią
#: ``substitution_latex`` (zapis LaTeX w polu prozy).
KLUCZE_ZWARCIA_LATEX_W_PROZIE: frozenset[str] = frozenset(
    {"Zk", "Ikss", "kappa", "Ip", "Ib", "Ith", "Sk"}
)

#: Przedrostki kluczy kroków rdzenia z tą samą kopią (korekcja K_T per gałąź:
#: ``KT[<branch_id>]``).
PREFIKSY_KLUCZY_ZWARCIA_LATEX_W_PROZIE: tuple[str, ...] = ("KT[",)


#: Wzory rdzenia z indeksem ``ga\l`` (nieskładalnym w KaTeX-u) i ich zapis na granicy.
WZOR_RDZENIA_PRAD_GALEZI = (
    r"I_{ga\l} = \left| (\underline{V}_i - \underline{V}_j)\,"
    r"\underline{y}_{ij} \right| \cdot I_k''^{(Th)}"
)
WZOR_RDZENIA_BILANS = r"\sum_{ga\l \to k} I_{ga\l} = I_k''^{(Th)}"
WZOR_PRAD_GALEZI = (
    r"I_{\text{gał}} = \left| (\underline{V}_i - \underline{V}_j)\,"
    r"\underline{y}_{ij} \right| \cdot I_k''^{(Th)}"
)
WZOR_BILANS = r"\sum_{\text{gał} \to k} I_{\text{gał}} = I_k''^{(Th)}"

KLUCZ_BILANSU_PODZIALU = "thevenin_flow_balance"
KLUCZ_USTAWIENIA_PODZIALU = "thevenin_flow_setup"
PREFIKS_PRADU_GALEZI = "thevenin_flow_"


def wzor_zwarcia_na_granicy(klucz: object) -> str | None:
    """Zapis ``formula_latex`` kroku rdzenia podmieniany na granicy (``None`` = bez zmian)."""
    if not isinstance(klucz, str):
        return None
    if klucz == KLUCZ_BILANSU_PODZIALU:
        return WZOR_BILANS
    if klucz.startswith(PREFIKS_PRADU_GALEZI) and klucz != KLUCZ_USTAWIENIA_PODZIALU:
        return WZOR_PRAD_GALEZI
    return None


def krok_zwarcia_z_latex_w_prozie(klucz: object) -> bool:
    """Czy krok rdzenia IEC 60909 o tym kluczu niesie LaTeX w polu prozy."""
    if not isinstance(klucz, str):
        return False
    return klucz in KLUCZE_ZWARCIA_LATEX_W_PROZIE or klucz.startswith(
        PREFIKSY_KLUCZY_ZWARCIA_LATEX_W_PROZIE
    )


def kroki_zwarcia_w_kontrakcie(kroki: Iterable[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """Kopie kroków śladu rdzenia IEC 60909 zgodne z kontraktem pól kroku.

    Kroki z rejestru tracą pole ``substitution`` (kopię ``substitution_latex``);
    kroki podziału prądu dostają składalny ``formula_latex``; pozostałe pola i
    pozostałe kroki przechodzą bez zmian. Wejście nie jest modyfikowane (wynik FROZEN
    solvera zostaje nietknięty).
    """
    wynik: list[dict[str, Any]] = []
    for krok in kroki:
        kopia = dict(krok)
        klucz = kopia.get("key")
        if krok_zwarcia_z_latex_w_prozie(klucz):
            kopia.pop("substitution", None)
        wzor = wzor_zwarcia_na_granicy(klucz)
        if wzor is not None:
            kopia["formula_latex"] = wzor
        wynik.append(kopia)
    return wynik
