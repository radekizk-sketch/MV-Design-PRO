"""Parytet zrzutu szablonów pól we froncie z odpowiedzią backendu (karta UX-04/POLE-LINIOWE-WZORZEC).

`frontend/src/ui2/kreatory/stacja/__tests__/fixturySzablonowPol.ts` deklaruje się jako zrzut
1:1 `GET /api/catalog/complete-bay-templates` — testy kreatora stacji (generator rysunku pola,
podgląd rozdzielnicy) stoją na TYCH danych. Zrzut ręczny dryfował: skróty sprzed kilku zmian
katalogu i oznaczenia aparatów sprzed schematu DIN 40719-2 (Q9 odłącznik liniowy, Q8 uziemnik),
więc testy frontu sprawdzały rysunek pola, którego backend już nie proponuje. Ten test parsuje
plik i porównuje, dla każdego szablonu, `hash` oraz listę (rodzaj, oznaczenie) aparatów
z wynikiem tej samej funkcji, którą woła końcówka. Rozjazd = czerwony test.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
from network_model.catalog.switchgear.canonical_fallback import (
    list_switchgear_solution_templates_for_manufacturer,
)

ZRZUT = (
    Path(__file__).resolve().parents[3]
    / "frontend"
    / "src"
    / "ui2"
    / "kreatory"
    / "stacja"
    / "__tests__"
    / "fixturySzablonowPol.ts"
)

#: Szablony zrzutu, których backend nie zwraca — z przyczyną. Kompozycja producenta
#: (`device_instances`) jest w rodzinach repozytorium pusta; fikstura nakłada ją na pole
#: `ABB__SAFERING__LINE_OUT` (kształt kontraktu `BayDeviceInstanceTemplate`), więc ten wpis
#: nie ma odpowiednika w odpowiedzi końcówki. Jego układ bazowy dziedziczy z LINE_OUT, który
#: jest sprawdzany.
SPOZA_BACKENDU = {"ABB__SAFERING__LINE_OUT__PROD"}

_APARAT = re.compile(r"kind: '(\w+)',\s*designation_q: '([^']+)'", re.S)


def _bloki() -> dict[str, str]:
    zrodlo = ZRZUT.read_text(encoding="utf-8")
    czesci = re.split(r"^export const (\w+)", zrodlo, flags=re.M)
    return dict(zip(czesci[1::2], czesci[2::2], strict=True))


def _szablony_zrzutu() -> dict[str, tuple[str, list[tuple[str, str]]]]:
    bloki = _bloki()

    def pole(nazwa: str, klucz: str) -> str | None:
        blok = bloki[nazwa]
        m = re.search(rf"^  {klucz}: '([^']+)'", blok, re.M)
        if m:
            return m.group(1)
        rodzic = re.search(r"^  \.\.\.(\w+),", blok, re.M)
        return pole(rodzic.group(1), klucz) if rodzic else None

    def aparaty(nazwa: str) -> list[tuple[str, str]]:
        blok = bloki[nazwa]
        if "devices: [" in blok:
            return _APARAT.findall(blok.split("devices: [", 1)[1].split("    ],", 1)[0])
        rodzic = re.search(r"^  \.\.\.(\w+),", blok, re.M)
        assert rodzic, f"{nazwa}: brak listy aparatów i rodzica"
        return aparaty(rodzic.group(1))

    wynik: dict[str, tuple[str, list[tuple[str, str]]]] = {}
    for nazwa in bloki:
        ref = pole(nazwa, "template_ref") if "template_ref:" in bloki[nazwa] else None
        if ref is None or ref in SPOZA_BACKENDU:
            continue
        skrot = pole(nazwa, "hash")
        assert skrot, f"{nazwa}: brak skrótu szablonu"
        wynik[ref] = (skrot, aparaty(nazwa))
    return wynik


def _backend() -> dict[str, tuple[str, list[tuple[str, str]]]]:
    wynik: dict[str, tuple[str, list[tuple[str, str]]]] = {}
    for producent in ("ABB",):
        for t in list_switchgear_solution_templates_for_manufacturer(producent):
            d = t.model_dump(mode="json")
            wynik[d["template_ref"]] = (
                d["hash"],
                [(a["kind"], a["designation_q"]) for a in d["base_template"]["devices"]],
            )
    return wynik


def test_zrzut_niesie_szablony() -> None:
    assert len(_szablony_zrzutu()) == 8


@pytest.mark.parametrize("ref", sorted(_szablony_zrzutu()))
def test_szablon_zrzutu_rowny_odpowiedzi_backendu(ref: str) -> None:
    backend = _backend()
    assert ref in backend, f"{ref}: backend nie zwraca szablonu"
    skrot, aparaty = _szablony_zrzutu()[ref]
    assert aparaty == backend[ref][1]
    assert skrot == backend[ref][0]
