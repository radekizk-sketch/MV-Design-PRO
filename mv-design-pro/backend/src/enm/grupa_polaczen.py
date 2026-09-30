"""Grupa połączeń transformatora dwuuzwojeniowego — JEDEN słownik i JEDEN parser
(IEC 60076-1 § 7, notacja zegarowa; karta W5-A, decyzja F-4 / G6).

Przed tą kartą walidator sprawdzał wyłącznie OBECNOŚĆ grupy (W004), katalog
podstawiał domyślne ``"Dyn11"`` za brak danej, front przyjmował wolny tekst, a
dostępność punktu neutralnego wyprowadzał osobny parser w
``enm/zero_sequence_transformer.py``. Tu jest jedno źródło dla:

* walidatora ENM (``E-W5-02``: wartość spoza słownika = błąd blokujący),
* modelu składowej zerowej (parser → litery uzwojeń i dostępność punktu
  neutralnego, ``E-W5-03``),
* OpenAPI (``GrupaPolaczenIEC60076`` w odpowiedzi ``GET /api/catalog/grupy-polaczen``)
  i frontu (lista wyboru zamiast wolnego tekstu — pin testem do snapshotu OpenAPI).

Słownik jest ZAMKNIĘTY i WYPROWADZONY z reguły normy (``_generuj_slownik``,
pin testem równości z literałem): uzwojenie GN ∈ {Y, YN, D, Z, ZN}, DN ∈
{y, yn, d, z, zn}; grupy jednorodne (Yy, Dd, Dz) — godziny 0 i 6; grupy mieszane
(Dy, Yd, Yz) — godziny 1, 5, 7, 11 (tablica grup wg IEC 60076-1). Litera ``N``/``n``
oznacza punkt neutralny WYPROWADZONY (dostępny do uziemienia); jej brak w
uzwojeniu gwiazdowym/zygzakowym oznacza punkt niedostępny, a trójkąt punktu
neutralnego nie ma wcale.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, get_args

GrupaPolaczenIEC60076 = Literal[
    "Yy0",
    "Yy6",
    "Yyn0",
    "Yyn6",
    "YNy0",
    "YNy6",
    "YNyn0",
    "YNyn6",
    "Dd0",
    "Dd6",
    "Dz0",
    "Dz6",
    "Dzn0",
    "Dzn6",
    "Dy1",
    "Dy5",
    "Dy7",
    "Dy11",
    "Dyn1",
    "Dyn5",
    "Dyn7",
    "Dyn11",
    "Yd1",
    "Yd5",
    "Yd7",
    "Yd11",
    "YNd1",
    "YNd5",
    "YNd7",
    "YNd11",
    "Yz1",
    "Yz5",
    "Yz7",
    "Yz11",
    "Yzn1",
    "Yzn5",
    "Yzn7",
    "Yzn11",
    "YNz1",
    "YNz5",
    "YNz7",
    "YNz11",
    "YNzn1",
    "YNzn5",
    "YNzn7",
    "YNzn11",
]

#: Słownik jako krotka (kolejność literału = kolejność w OpenAPI i na liście frontu).
GRUPY_POLACZEN_IEC60076: tuple[str, ...] = get_args(GrupaPolaczenIEC60076)
_ZBIOR_GRUP: frozenset[str] = frozenset(GRUPY_POLACZEN_IEC60076)

_GODZINY_JEDNORODNE: tuple[int, ...] = (0, 6)
_GODZINY_MIESZANE: tuple[int, ...] = (1, 5, 7, 11)
#: Pary (typ GN, typ DN) dopuszczone przez tablicę IEC 60076-1 wraz z godzinami.
_PARY_UZWOJEN: tuple[tuple[str, str, tuple[int, ...]], ...] = (
    ("Y", "y", _GODZINY_JEDNORODNE),
    ("D", "d", _GODZINY_JEDNORODNE),
    ("D", "z", _GODZINY_JEDNORODNE),
    ("D", "y", _GODZINY_MIESZANE),
    ("Y", "d", _GODZINY_MIESZANE),
    ("Y", "z", _GODZINY_MIESZANE),
)


def _warianty_gn(typ: str) -> tuple[str, ...]:
    return (typ, typ + "N") if typ in ("Y", "Z") else (typ,)


def _warianty_dn(typ: str) -> tuple[str, ...]:
    return (typ, typ + "n") if typ in ("y", "z") else (typ,)


def _generuj_slownik() -> tuple[str, ...]:
    """Reguła normy → słownik; test równości z literałem pinuje oba na raz."""
    grupy: list[str] = []
    for gn, dn, godziny in _PARY_UZWOJEN:
        for w_gn in _warianty_gn(gn):
            for w_dn in _warianty_dn(dn):
                for godzina in godziny:
                    grupy.append(f"{w_gn}{w_dn}{godzina}")
    return tuple(grupy)


@dataclass(frozen=True)
class GrupaPolaczen:
    """Rozbiór grupy: typy uzwojeń (Y/D/Z), dostępność punktów neutralnych, godzina."""

    gn_typ: str
    gn_punkt_neutralny: bool
    dn_typ: str
    dn_punkt_neutralny: bool
    godzina: int

    @property
    def przesuniecie_stopnie(self) -> int:
        return self.godzina * 30


def grupa_polaczen_poprawna(wartosc: object) -> bool:
    """Czy wartość jest grupą ze słownika IEC 60076-1 (dokładne dopasowanie)."""
    return isinstance(wartosc, str) and wartosc in _ZBIOR_GRUP


def parsuj_grupe_polaczen(wartosc: str) -> GrupaPolaczen:
    """Rozbiór grupy ze słownika; wartość spoza słownika = ``ValueError`` nazwany.

    Przykłady: 'Dyn11' → (D, brak; Y, dostępny; 11); 'YNd11' → (Y, dostępny; D,
    brak; 11); 'Yy0' → (Y, niedostępny; Y, niedostępny; 0).
    """
    if not grupa_polaczen_poprawna(wartosc):
        raise ValueError(
            f"Grupa połączeń {wartosc!r} nie należy do słownika IEC 60076-1 "
            f"(dopuszczalne: {', '.join(GRUPY_POLACZEN_IEC60076)})."
        )
    litery = "".join(ch for ch in wartosc if ch.isalpha())
    godzina = int("".join(ch for ch in wartosc if ch.isdigit()))
    gn = "".join(ch for ch in litery if ch.isupper())
    dn = "".join(ch for ch in litery if ch.islower())
    return GrupaPolaczen(
        gn_typ=gn[0],
        gn_punkt_neutralny="N" in gn,
        dn_typ=dn[0].upper(),
        dn_punkt_neutralny="n" in dn,
        godzina=godzina,
    )
