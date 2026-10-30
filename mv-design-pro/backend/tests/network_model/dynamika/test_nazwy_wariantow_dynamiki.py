"""Słowniki nazw rdzenia dynamiki dla tekstów odmów — parytet z kontraktem ENM.

Tekst odmowy rdzenia dynamiki nazywa typ turbiny, wariant regulatora i rodzinę urządzenia
słowami projektanta (kod zostaje w polu maszynowym szczegółów odmowy). Słownik węższy niż
kontrakt kończy się ``KeyError`` w chwili odmowy, a pozycja spoza kontraktu jest fantomem —
dlatego zbiór kluczy jest RÓWNY zbiorowi wartości ``Literal`` kontraktu, w obie strony.
"""

from __future__ import annotations

from typing import get_args

import pytest
from enm.dynamika_modele import (
    RODZINY_PARAMETROW_DYNAMICZNYCH,
    RegulatorNapiecia,
    RegulatorObrotow,
    StabilizatorSystemowy,
    TypIecTurbiny,
)
from enm.models import Branch, Cable, FuseBranch, OverheadLine, SwitchBranch
from network_model.solvers.dynamika.urzadzenia.fabryka import (
    NAZWY_RODZIN_KONTRAKTU_PL,
    NAZWY_RODZIN_PL,
    RODZINY_OBSLUGIWANE,
    lista_rodzin_pl,
)
from network_model.solvers.dynamika.urzadzenia.regulatory import (
    NAZWY_WARIANTOW_REGULATOROW_PL,
)
from network_model.solvers.dynamika.urzadzenia.turbina_wiatrowa import (
    NAZWY_TYPOW_TURBINY_PL,
)


def _wartosci_literalu(klasa: type, pole: str) -> set[str]:
    return set(get_args(klasa.model_fields[pole].annotation))


def test_typy_turbiny_rowne_kontraktowi() -> None:
    assert set(NAZWY_TYPOW_TURBINY_PL) == set(get_args(TypIecTurbiny))


def test_warianty_regulatorow_rowne_kontraktowi() -> None:
    kontrakt = (
        _wartosci_literalu(RegulatorNapiecia, "typ")
        | _wartosci_literalu(RegulatorObrotow, "typ")
        | _wartosci_literalu(StabilizatorSystemowy, "typ")
    )
    assert set(NAZWY_WARIANTOW_REGULATOROW_PL) == kontrakt


def test_rodziny_skladane_i_kontraktu_rowne_rejestrom() -> None:
    assert set(NAZWY_RODZIN_PL) == set(RODZINY_OBSLUGIWANE)
    assert set(NAZWY_RODZIN_KONTRAKTU_PL) == set(RODZINY_PARAMETROW_DYNAMICZNYCH)


@pytest.mark.parametrize(
    "slownik",
    [NAZWY_TYPOW_TURBINY_PL, NAZWY_WARIANTOW_REGULATOROW_PL, NAZWY_RODZIN_KONTRAKTU_PL],
)
def test_nazwa_nie_jest_kodem(slownik: dict[str, str]) -> None:
    for kod, nazwa in slownik.items():
        assert nazwa != kod
        assert "_" not in nazwa, (kod, nazwa)


def test_lista_rodzin_w_zdaniu_bez_kodow() -> None:
    tekst = lista_rodzin_pl(RODZINY_OBSLUGIWANE)
    for kod in RODZINY_OBSLUGIWANE:
        if "_" in kod:  # „synchroniczna”, „magazyn” są słowami także w nazwie projektanta
            assert kod not in tekst, kod
    assert "„maszyna synchroniczna z regulatorami”" in tekst


def test_unia_galezi_zamknieta_dla_adaptera_dynamiki() -> None:
    """`zloz_widok_sieci` odwzorowuje linię, kabel, łącznik i bezpiecznik; czwarta gałąź
    `else` adaptera jest ``AssertionError`` (błąd programu) — nowy rodzaj gałęzi w unii
    ``Branch`` czerwieni ten test, zanim trafi do biegu."""
    unia = get_args(Branch)[0]  # Annotated[unia, Field(discriminator=...)]
    assert set(get_args(unia)) == {OverheadLine, Cable, SwitchBranch, FuseBranch}
