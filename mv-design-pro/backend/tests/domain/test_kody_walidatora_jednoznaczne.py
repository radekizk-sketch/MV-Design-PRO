"""Kody walidatora modelu — jeden kod, jedna reguła.

Scalenie karty UX-04/POLE-LINIOWE-WZORZEC do drzewa integracji (2026-11-11) wykryło kolizję
numeru: karta pola liniowego nadała `W049` regule gazu fluorowanego
(`enm.gaz_fluorowany_pola.KOD_WALIDATORA_GAZU_FLUOROWANEGO`, 2026-10-29), a karta
INSPEKTOR-POLA-DOMKNIECIE — niezależnie, 2026-11-05 — regule odcinka SN na szynie sekcji bez pola
(`enm.zajetosc_pol.KOD_WALIDATORA_ODCINEK_BEZ_POLA`). W drzewie scalonym walidator zgłaszał oba
warunki tym samym kodem, a słownik `ODWZOROWANIE_WALIDATOR_NA_KANON` miał powtórzony klucz —
Python zostawia ostatni wpis, więc ostrzeżenie odcinka bez pola trafiało do gotowości jako
„gaz fluorowany". Rozstrzygnięcie: kod nadany wcześniej zostaje, późniejsza reguła dostaje
wolny numer `W058`.

Klasa defektu: dwa niezależne miejsca nadawania numerów kodów walidatora (stała modułu
`KOD_WALIDATORA_*`, słownik kodów reguły modułu, literał `code="W…"` w `enm/validator.py`)
i jeden słownik mostu gotowości. Testy przypinają oba końce:
  1. słownik mostu nie ma powtórzonych kluczy (AST — powtórzenie w literale słownika jest
     ciche w czasie wykonania);
  2. każdy numer kodu ma DOKŁADNIE jedno miejsce nadania w `src/enm` (stała albo wpis słownika
     modułu) i nie pokrywa się z literałem kodu emitowanym wprost w walidatorze.
"""

from __future__ import annotations

import ast
import re
from pathlib import Path

SRC = Path(__file__).resolve().parents[2] / "src"
KOD = re.compile(r"^W\d{3}$")


def _slownik_mostu() -> ast.Dict:
    drzewo = ast.parse((SRC / "domain" / "readiness_bridge.py").read_text(encoding="utf-8"))
    for wezel in ast.walk(drzewo):
        if (
            isinstance(wezel, ast.AnnAssign)
            and isinstance(wezel.target, ast.Name)
            and wezel.target.id == "ODWZOROWANIE_WALIDATOR_NA_KANON"
            and isinstance(wezel.value, ast.Dict)
        ):
            return wezel.value
    raise AssertionError("brak słownika ODWZOROWANIE_WALIDATOR_NA_KANON w readiness_bridge.py")


def test_most_gotowosci_bez_powtorzonych_kodow() -> None:
    klucze = [k.value for k in _slownik_mostu().keys if isinstance(k, ast.Constant)]
    powtorzone = sorted({k for k in klucze if klucze.count(k) > 1})
    assert powtorzone == [], f"powtórzone kody walidatora w moście gotowości: {powtorzone}"


def _miejsca_nadania() -> dict[str, list[str]]:
    """Kod walidatora → miejsca nadania w `src/enm` (stała modułu i wpisy słowników modułu)."""
    miejsca: dict[str, list[str]] = {}
    for plik in sorted((SRC / "enm").glob("*.py")):
        if plik.name == "validator.py":
            continue
        drzewo = ast.parse(plik.read_text(encoding="utf-8"))
        for wezel in drzewo.body:
            cel = wezel.targets[0] if isinstance(wezel, ast.Assign) else None
            if isinstance(wezel, ast.AnnAssign):
                cel = wezel.target
            wartosc = wezel.value if isinstance(wezel, ast.Assign | ast.AnnAssign) else None
            if not isinstance(cel, ast.Name) or wartosc is None:
                continue
            if isinstance(wartosc, ast.Constant) and isinstance(wartosc.value, str):
                if KOD.match(wartosc.value):
                    miejsca.setdefault(wartosc.value, []).append(f"{plik.name}:{cel.id}")
            elif isinstance(wartosc, ast.Dict):
                for klucz, v in zip(wartosc.keys, wartosc.values, strict=True):
                    if (
                        isinstance(v, ast.Constant)
                        and isinstance(v.value, str)
                        and KOD.match(v.value)
                    ):
                        nazwa = ast.unparse(klucz) if klucz is not None else "**"
                        miejsca.setdefault(v.value, []).append(f"{plik.name}:{cel.id}[{nazwa}]")
    return miejsca


def test_kazdy_kod_walidatora_ma_jedno_miejsce_nadania() -> None:
    miejsca = _miejsca_nadania()
    # Wyrocznia nie jest pusta: reguły pola liniowego, odcinka bez pola i źródła 3U₀.
    assert {"W049", "W050", "W057", "W058", "W064"} <= set(miejsca)
    kolizje = {kod: m for kod, m in miejsca.items() if len(m) > 1}
    assert kolizje == {}, f"kod walidatora nadany w kilku miejscach: {kolizje}"
    walidator = (SRC / "enm" / "validator.py").read_text(encoding="utf-8")
    literaly = set(re.findall(r'code="(W\d{3})"', walidator))
    assert literaly & set(miejsca) == set(), (
        "kod emitowany wprost w walidatorze pokrywa się z kodem nadanym w module reguły: "
        f"{sorted(literaly & set(miejsca))}"
    )


def test_odcinek_bez_pola_i_gaz_fluorowany_maja_rozne_kody_i_kanony() -> None:
    from domain.readiness_bridge import ODWZOROWANIE_WALIDATOR_NA_KANON
    from enm.gaz_fluorowany_pola import KOD_WALIDATORA_GAZU_FLUOROWANEGO
    from enm.zajetosc_pol import KOD_WALIDATORA_ODCINEK_BEZ_POLA

    assert KOD_WALIDATORA_GAZU_FLUOROWANEGO != KOD_WALIDATORA_ODCINEK_BEZ_POLA
    assert ODWZOROWANIE_WALIDATOR_NA_KANON[KOD_WALIDATORA_ODCINEK_BEZ_POLA] == (
        "station.segment_without_field"
    )
    assert ODWZOROWANIE_WALIDATOR_NA_KANON[KOD_WALIDATORA_GAZU_FLUOROWANEGO] == (
        "bay.fluorinated_gas_not_existing"
    )
