"""Komunikaty `message_pl` rejestru kodów gotowości mają poprawną polszczyznę.

Karta READINESS-DOC (2026-09-09, generator słownika kodów gotowości) wykryła, że
dwanaście kodów bloku "Zrodla nN" (karta F-K6, V12K-206) miało `message_pl` BEZ
polskich znaków diakrytycznych — jedyny taki fragment w całym rejestrze (pozostałe
102 kody w chwili odbioru karty używały poprawnej polszczyzny). Treść była
przeniesiona 1:1 z `docs/ui/UI_UX_10_10_ABSOLUTE_PLUS_ACTIONS_AND_MODALS_CANONICAL.md`
(dokument spoza hierarchii dokumentów tego repo, poza zakresem tej karty), który
niesie ten sam defekt u źródła.

`message_pl` jest polem treści WYŚWIETLANEJ UŻYTKOWNIKOWI (patrz naglówek
`domain/canonical_operations.py`, sekcja "READINESS CODES"), więc brak
diakrytyków jest defektem PRODUKTU, nie kosmetyką dokumentacji — naprawiono w
źródle (rejestrze), nie tylko w generowanym słowniku
(`docs/domain/READINESS_FIXACTIONS_CANONICAL_PL.md`).

Dwie bramki, zgodnie z regułą KLASA-NIE-INSTANCJA:
  1. `test_dwanascie_naprawionych_komunikatow_ma_poprawna_tresc` — pinuje
     DOKŁADNĄ, poprawioną treść tych 12 kodów (instancja z karty).
  2. `test_zaden_komunikat_nie_niesie_znanego_rozpadu_diakrytykow` — zamknięty,
     zmierzony zbiór słów, które w tym rejestrze occurred WYŁĄCZNIE jako rozpad
     diakrytyku (np. "Zrodlo" zamiast "Źródło"), sprawdzony na CAŁYM rejestrze —
     łapie tę samą klasę defektu w przyszłym kodzie, nie tylko w tych 12 wpisach.
     Zbiór NIE jest listą słów bez diakrytyków w ogóle (wiele poprawnych zdań PL
     nie potrzebuje żadnego) — to lista KONKRETNYCH form, które w tym rejestrze
     nigdy nie są poprawne same w sobie.
"""

from __future__ import annotations

import re

from domain.canonical_operations import READINESS_CODES

#: Karta READINESS-DOC (2026-09-09) — dokładna, poprawiona treść dwunastu kodów
#: bloku "Zrodla nN" (F-K6/V12K-206). Regresja na ten słownik = ktoś przywrócił
#: tekst bez diakrytyków.
KOMUNIKATY_NAPRAWIONE_KARTA_READINESS_DOC: dict[str, str] = {
    "nn.source.field_missing": "Źródło nN nie jest przypięte do pola źródłowego",
    "nn.source.switch_missing": "Pole źródłowe nN nie posiada aparatu łączeniowego",
    "nn.source.catalog_missing": "Źródło nN nie ma przypisanego katalogu urządzenia",
    "nn.source.parameters_missing": "Źródło nN nie ma wymaganych parametrów elektrycznych",
    "nn.voltage_missing": "Napięcie szyny nN nie jest określone",
    "pv.control_mode_missing": "Falownik PV nie ma określonego trybu regulacji",
    "bess.energy_module_missing": "Falownik BESS nie ma przypisanego modułu magazynu energii",
    "bess.soc_limits_invalid": (
        "Ograniczenia SOC magazynu BESS są nieprawidłowe (min >= max albo poza zakresem 0-100%)"
    ),
    "ups.backup_time_invalid": "Czas podtrzymania UPS jest nieprawidłowy (musi być > 0)",
    "nn.switch.catalog_ref_missing": "Aparat łączeniowy pola nN nie ma przypisanego katalogu",
    "nn.measurement.required_missing": "Źródło nN nie ma przypisanego punktu pomiaru energii",
    "genset.fuel_type_missing": "Agregat nie ma określonego rodzaju paliwa",
}


def test_dwanascie_naprawionych_komunikatow_ma_poprawna_tresc() -> None:
    for kod, oczekiwany in KOMUNIKATY_NAPRAWIONE_KARTA_READINESS_DOC.items():
        assert kod in READINESS_CODES, f"kod {kod!r} zniknął z rejestru — zaktualizuj tę pinezkę"
        assert READINESS_CODES[kod].message_pl == oczekiwany, (
            f"{kod}: message_pl odjechał od naprawionej treści karty READINESS-DOC "
            f"(oczekiwano {oczekiwany!r}, jest {READINESS_CODES[kod].message_pl!r})"
        )


#: Zamknięty, zmierzony zbiór (karta READINESS-DOC, 2026-09-09): formy, które w TYM
#: rejestrze wystąpiły WYŁĄCZNIE jako rozpad polskiego znaku diakrytycznego — nigdy
#: jako poprawne samodzielne słowo polskie. Dopisz nową formę tu świadomie, dopiero
#: gdy naprawisz analogiczny rozpad w nowym kodzie (nie odwrotnie: to nie jest lista
#: prewencyjna pod przyszłe słowa, których dziś nie ma w rejestrze).
#:
#: CELOWO BEZ "sa": rozpad "są" -> "sa" jest tej samej klasy, ale "SA" (małą/wielką
#: literą) jest też żywym polskim skrótem "Spółka Akcyjna" w nazwach firm (np. "PGE
#: SA") — biała lista tego tokenu fałszywie zapaliłaby się na poprawnej treści, więc
#: zamiast dopisywać wyjątek od wyjątku, token zostaje POZA tym zamkniętym zbiorem.
ROZPADY_DIAKRYTYKOW_ZAMKNIETY_ZBIOR: frozenset[str] = frozenset(
    {
        "zrodlo",
        "zrodlowe",
        "zrodlowego",
        "przypiete",
        "urzadzenia",
        "parametrow",
        "napiecie",
        "okreslone",
        "okreslonego",
        "modulu",
        "laczeniowy",
        "laczeniowego",
        "nieprawidlowy",
        "nieprawidlowe",
        "byc",
    }
)

_SLOWO = re.compile(r"[a-ząćęłńóśźżA-ZĄĆĘŁŃÓŚŹŻ]+")


def test_zaden_komunikat_nie_niesie_znanego_rozpadu_diakrytykow() -> None:
    naruszenia: list[str] = []
    for kod, spec in READINESS_CODES.items():
        slowa = {w.lower() for w in _SLOWO.findall(spec.message_pl)}
        trafienia = slowa & ROZPADY_DIAKRYTYKOW_ZAMKNIETY_ZBIOR
        if trafienia:
            naruszenia.append(f"{kod}: {sorted(trafienia)} w {spec.message_pl!r}")
    assert (
        not naruszenia
    ), "message_pl z rozpadem diakrytyku (rejestr, nie dokument):\n" + "\n".join(naruszenia)
