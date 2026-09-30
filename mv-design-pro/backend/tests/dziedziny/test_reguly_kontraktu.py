"""Rejestr reguł kontraktów liścia ``dziedziny`` — każda odmowa nazwana identyfikatorem.

Konsumenci rozpoznają regułę po identyfikatorze (katalog mapuje go na kod ``KAT-T``,
importer karty — na kod odmowy wiersza), więc: (1) każdy ``raise ValueError`` walidatora
i każdy wpis listy naruszeń modelu widmowego niesie ``naruszenie(<id>, …)``; (2) każdy
identyfikator rejestru jest używany (brak martwych wpisów); (3) parser komunikatu zwraca
identyfikatory w kolejności wystąpienia.
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest
from dziedziny.kanon import REGULY_KONTRAKTU, naruszenie, reguly_w_komunikacie
from pydantic import ValidationError

from tests.dziedziny import fabryki as f

KATALOG = Path(__file__).resolve().parents[2] / "src" / "dziedziny"
#: Jedyny `raise ValueError` bez identyfikatora: zbiorczy komunikat modelu widmowego,
#: który SKŁADA listę naruszeń — każde z nich niesie własny identyfikator.
ZBIORCZE = {("widmo.py", "Model widmowy")}


def _wywolania_bledow() -> list[tuple[str, int, ast.expr]]:
    wynik: list[tuple[str, int, ast.expr]] = []
    for plik in sorted(KATALOG.glob("*.py")):
        drzewo = ast.parse(plik.read_text(encoding="utf-8"))
        for wezel in ast.walk(drzewo):
            if (
                isinstance(wezel, ast.Raise)
                and isinstance(wezel.exc, ast.Call)
                and getattr(wezel.exc.func, "id", "") == "ValueError"
            ):
                wynik.append((plik.name, wezel.lineno, wezel.exc.args[0]))
            if (
                isinstance(wezel, ast.Call)
                and isinstance(wezel.func, ast.Attribute)
                and wezel.func.attr == "append"
                and getattr(wezel.func.value, "id", "") == "bledy"
            ):
                wynik.append((plik.name, wezel.lineno, wezel.args[0]))
    return wynik


def test_kazda_odmowa_walidatora_niesie_identyfikator_reguly() -> None:
    bez_reguly = []
    for plik, linia, argument in _wywolania_bledow():
        if isinstance(argument, ast.Call) and getattr(argument.func, "id", "") == "naruszenie":
            continue
        zrodlo = ast.unparse(argument)
        if any(plik == p and fragment in zrodlo for p, fragment in ZBIORCZE):
            continue
        bez_reguly.append(f"{plik}:{linia}")
    assert not bez_reguly, f"odmowy bez identyfikatora reguły: {bez_reguly}"
    assert len(_wywolania_bledow()) > 50, "skan stracił kotwicę"


def test_kazdy_identyfikator_rejestru_jest_uzywany_i_istnieje() -> None:
    uzyte: set[str] = set()
    for _, _, argument in _wywolania_bledow():
        if isinstance(argument, ast.Call) and getattr(argument.func, "id", "") == "naruszenie":
            pierwszy = argument.args[0]
            assert isinstance(pierwszy, ast.Constant), "identyfikator reguły musi być literałem"
            uzyte.add(str(pierwszy.value))
    assert uzyte <= set(REGULY_KONTRAKTU), sorted(uzyte - set(REGULY_KONTRAKTU))
    assert set(REGULY_KONTRAKTU) == uzyte, sorted(set(REGULY_KONTRAKTU) - uzyte)


def test_parser_komunikatu_i_odmowa_nieznanej_reguly() -> None:
    tekst = naruszenie("widmo.faza", "a") + " | " + naruszenie("widmo.amplituda", "b")
    assert reguly_w_komunikacie(tekst + naruszenie("widmo.faza", "c")) == (
        "widmo.faza",
        "widmo.amplituda",
    )
    assert reguly_w_komunikacie("[nieznana.regula] x") == ()
    with pytest.raises(KeyError, match="spoza rejestru"):
        naruszenie("nieznana.regula", "x")


def test_odmowa_modelu_niesie_identyfikatory_wszystkich_naruszen() -> None:
    with pytest.raises(ValidationError) as blad:
        f.model(
            skladowe=(f.skladowa(250.0), f.skladowa(250.0)),
            czestotliwosc_przelaczania_hz=16000.0,
        )
    reguly = reguly_w_komunikacie(str(blad.value))
    assert set(reguly) == {"widmo.czestotliwosc", "widmo.przelaczanie"}
