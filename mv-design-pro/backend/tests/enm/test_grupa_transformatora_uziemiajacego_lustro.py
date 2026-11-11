"""Predykat grupy transformatora uziemiającego: backend = front (karta ZU-JEDEN-NOSNIK).

Jedynym nośnikiem zespołu uziemiającego jest transformator z uzwojeniem GÓRNYM w zygzak
z wyprowadzonym punktem neutralnym (``enm.punkt_neutralny_zespolu.grupa_transformatora_
uziemiajacego``). Front rozpoznaje ten sam transformator (rysunek pola ZU, wykluczenie
z transformatorów rozdzielczych stacji) stałą ``GRUPY_TRANSFORMATORA_UZIEMIAJACEGO``
w ``frontend/src/types/uziemienie.ts``. Test przypina oba kierunki: zbiór grup słownika
spełniających predykat backendu == lista frontu, i == grupy słownika zaczynające się od „ZN”
(postać, którą test frontu porównuje ze snapshotem OpenAPI).
"""

from __future__ import annotations

import re
from pathlib import Path

from enm.grupa_polaczen import GRUPY_POLACZEN_IEC60076
from enm.punkt_neutralny_zespolu import grupa_transformatora_uziemiajacego

PLIK_FRONTU = Path(__file__).resolve().parents[3] / "frontend" / "src" / "types" / "uziemienie.ts"


def _lista_frontu() -> list[str]:
    tresc = PLIK_FRONTU.read_text(encoding="utf-8")
    blok = re.search(
        r"GRUPY_TRANSFORMATORA_UZIEMIAJACEGO: readonly string\[\] = \[(.*?)\];", tresc, re.S
    )
    assert blok, "brak stałej GRUPY_TRANSFORMATORA_UZIEMIAJACEGO we froncie"
    return re.findall(r"'([^']+)'", blok.group(1))


def test_lista_frontu_rowna_predykatowi_backendu() -> None:
    backend = [g for g in GRUPY_POLACZEN_IEC60076 if grupa_transformatora_uziemiajacego(g)]
    assert backend, "słownik grup nie ma żadnej grupy transformatora uziemiającego"
    assert _lista_frontu() == backend


def test_predykat_backendu_to_litera_zn_uzwojenia_gornego() -> None:
    assert [g for g in GRUPY_POLACZEN_IEC60076 if grupa_transformatora_uziemiajacego(g)] == [
        g for g in GRUPY_POLACZEN_IEC60076 if g.startswith("ZN")
    ]
    # Zygzak bez punktu neutralnego i zygzak po stronie dolnej nie są transformatorem
    # uziemiającym sieci SN; grupa spoza słownika — także nie.
    for grupa in ("Zd0", "Zy1", "Dzn0", "Yzn5", "ZNyn12", "", None):
        assert not grupa_transformatora_uziemiajacego(grupa), grupa
