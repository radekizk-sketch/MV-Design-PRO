"""Parytet fixtury odpowiedzi V12.6 ze stanem solvera (karta V126-JEZYK).

DRUGI KONIEC PARY dla strażnika prezentacji w warstwie frontu
(`frontend/src/ui2/wyniki/akademickie/__tests__/prezentacja.straznik.test.tsx`).
Strażnik renderuje ekran na fixturze `odpowiedziSolvera.json`; gdyby fixtura
rozjechała się z solverem, strażnik pilnowałby stanu, którego już nie ma —
i pole dodane w solverze weszłoby na ekran jako kod produkcyjny bez czerwieni.

Porównujemy ZBIÓR ŚCIEŻEK KLUCZY, nie wartości: prezentacja stoi na kluczach,
a wartości zmieniają się przy każdej zmianie numeryki (test byłby kruchy bez
korzyści). Determinizm samych wartości pilnują testy solvera.
"""

from __future__ import annotations

import json
from typing import Any

from tests.ci.generuj_odpowiedzi_v126 import SCIEZKA_FIXTURY, zbuduj_odpowiedzi


def _sciezki(payload: Any, prefiks: str = "") -> set[str]:
    """Zbiór ścieżek liści ładunku; indeksy tablic sprowadzone do `[]`."""
    if isinstance(payload, dict):
        wynik: set[str] = set()
        for klucz, wartosc in payload.items():
            dziecko = klucz if prefiks == "" else f"{prefiks}.{klucz}"
            wynik |= _sciezki(wartosc, dziecko)
        return wynik or {prefiks}
    if isinstance(payload, list):
        wynik = set()
        for element in payload:
            wynik |= _sciezki(element, f"{prefiks}[]")
        return wynik or {prefiks}
    return {prefiks}


def test_fixtura_odpowiedzi_zgodna_z_solverem() -> None:
    """Fixtura strażnika prezentacji odpowiada bieżącemu kształtowi wyników."""
    zapisana = json.loads(SCIEZKA_FIXTURY.read_text(encoding="utf-8"))
    biezaca = zbuduj_odpowiedzi()

    assert set(zapisana) == set(biezaca), (
        "Rozjazd zbioru rodzajów między fixturą a solverem — uruchom "
        "`python tests/ci/generuj_odpowiedzi_v126.py`"
    )
    for rodzaj in sorted(biezaca):
        assert _sciezki(zapisana[rodzaj]) == _sciezki(biezaca[rodzaj]), (
            f"Rodzaj {rodzaj}: kształt wyniku zmienił się względem fixtury strażnika "
            "prezentacji — uruchom `python tests/ci/generuj_odpowiedzi_v126.py` "
            "i uzupełnij prezentację nowych pól w `ui2/wyniki/akademickie/prezentacja.ts`"
        )


def test_kazdy_krok_sladu_ma_polska_postac_wyniku() -> None:
    """Każdy krok śladu KAŻDEGO rodzaju niesie `result_pl` — liczbę z jednostką.

    Deklaracja z docstringa `TraceBuilder.add` MA PRZYPIĘTY TEST (zasada
    „deklaracja bez testu = fałszywa pewność"): argument nazwany bez wartości
    domyślnej wymusza pole w czasie pisania kodu, a ten test pilnuje, że pole
    nie jest puste ani nie jest zrzutem słownika.
    """
    from network_model.solvers.v126_academic import V126AcademicSolver
    from solver_input.v126_contracts import V126AnalysisType

    from tests.ci.generuj_odpowiedzi_v126 import model_wejsciowy

    solver = V126AcademicSolver()
    model = model_wejsciowy()
    for analysis_type in V126AnalysisType:
        envelope = solver.run(analysis_type, model)
        kroki = envelope["white_box_trace"]
        assert kroki, f"{analysis_type.value}: ślad bez kroków"
        for krok in kroki:
            opis = krok.get("result_pl")
            assert (
                isinstance(opis, str) and opis.strip()
            ), f"{analysis_type.value}/{krok['key']}: brak polskiej postaci wyniku kroku"
            assert (
                "{" not in opis and "}" not in opis
            ), f"{analysis_type.value}/{krok['key']}: wynik kroku jest zrzutem słownika: {opis}"


def test_teksty_sladu_maja_polskie_znaki_diakrytyczne() -> None:
    """Teksty śladu są po polsku, nie „po polsku bez ogonków".

    Ocena właściciela 0/10 wskazała wprost: „Dla kazdego wezla liczony jest
    margines P-V…". Test szuka typowych wyrazów polskich zapisanych bez znaków
    diakrytycznych w polach czytanych przez ekran i pakiet dowodowy.
    """
    import re

    from network_model.solvers.v126_academic import V126AcademicSolver
    from solver_input.v126_contracts import V126AnalysisType

    from tests.ci.generuj_odpowiedzi_v126 import model_wejsciowy

    # METODA: tokenizujemy WYŁĄCZNIE wyrazy złożone z liter ASCII
    # (`\b[a-zA-Z]+\b` nie dopasuje „impedancję", bo `ę` jest znakiem wyrazowym
    # i granicy po `j` nie ma) i porównujemy je ze zbiorem form, których poprawny
    # zapis WYMAGA znaku diakrytycznego. Dzięki temu strażnik nie krzyczy na
    # poprawną polszczyznę („wyznaczono", „bezwymiarowy") — strażnik z fałszywymi
    # alarmami zostaje wyciszony i przestaje chronić. Do zbioru NIE trafiają
    # wyrazy poprawne bez ogonków („impedancja", „uziemienia", „obwiednia",
    # „wyznaczono", „bezwymiarowy") — sprawdzone jeden po drugim.
    WYMAGAJA_OGONKOW = {
        "kazdy",
        "kazda",
        "kazde",
        "kazdego",
        "kazdej",
        "kazdym",
        "wezel",
        "wezla",
        "wezle",
        "wezlow",
        "wezlach",
        "galaz",
        "galez",
        "galezi",
        "galezie",
        "prad",
        "pradu",
        "pradow",
        "pradem",
        "napiecie",
        "napiecia",
        "napiec",
        "zrodlo",
        "zrodla",
        "zrodel",
        "wartosc",
        "wartosci",
        "czlon",
        "czlonu",
        "czlony",
        "porownano",
        "porownana",
        "porownane",
        "porownanie",
        "obciazenie",
        "obciazenia",
        "obciazen",
        "spelniony",
        "spelnione",
        "spelniona",
        "niespelniony",
        "niespelnione",
        "niespelniona",
        "tlumiacy",
        "tlumiaca",
        "tlumiace",
        "przeksztaltnik",
        "przeksztaltnika",
        "przeksztaltnikow",
        "awaryjnosc",
        "awaryjnosci",
        "bliskosc",
        "bliskosci",
        "wejsciowy",
        "wejsciowe",
        "wejsciowych",
        "wejsciowa",
        "wyjsciowy",
        "wyjsciowa",
        "wyjsciowej",
        "dlawik",
        "dlawika",
        "dlawikiem",
        "gaszacy",
        "gaszacego",
        "wylacznik",
        "wylacznika",
        "czestotliwosc",
        "czestotliwosci",
        "dlugosc",
        "dlugosci",
        "szerokosc",
        "szerokosci",
        "sztywnosc",
        "sztywnosci",
        "gestosc",
        "gestosci",
        "przeplyw",
    }
    solver = V126AcademicSolver()
    model = model_wejsciowy()
    naruszenia: list[str] = []
    for analysis_type in V126AnalysisType:
        envelope = solver.run(analysis_type, model)
        for krok in envelope["white_box_trace"]:
            for pole in ("substitution", "unit_check", "result_pl"):
                tekst = str(krok.get(pole, ""))
                for wyraz in re.findall(r"\b[a-zA-Z]+\b", tekst):
                    if wyraz.lower() in WYMAGAJA_OGONKOW:
                        naruszenia.append(
                            f"{analysis_type.value}/{krok['key']}/{pole}: "
                            f"„{wyraz}” w „{tekst[:80]}”"
                        )
                        break
    assert naruszenia == [], "Teksty śladu bez polskich znaków:\n" + "\n".join(naruszenia)
