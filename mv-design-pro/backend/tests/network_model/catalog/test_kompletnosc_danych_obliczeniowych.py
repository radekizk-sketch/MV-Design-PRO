"""Każdy przewód produkcyjny DA SIĘ sprawdzić cieplnie — z katalogu albo z normy.

CO TEN TEST PILNUJE, A CZEGO NIE. Nie żąda, żeby każda pozycja katalogu niosła
``J_th``: dziewięć produkcyjnych typów kabli SN (rodziny YHAKXS i YHKXS) go NIE
MA i to jest stan POPRAWNY — producent tego współczynnika nie publikuje, a
`network_model.solvers.conductor_thermal_withstand.derive_k_iec60949` wyprowadza
go z materiału żyły i pary temperatur wg IEC 60949 §4, znakując ślad jako
``K_SOURCE_DERIVED_IEC60949`` zamiast ``K_SOURCE_CATALOG``.

DLACZEGO WPISANIE ``J_th`` DO TYCH POZYCJI BYŁOBY REGRESJĄ, NIE NAPRAWĄ. Kanon
§19 wymaga rozróżnienia DANE_WPROST_OD_PRODUCENTA od WYPROWADZONE: wartość
tablicowa wpisana do rekordu katalogowego kazałaby śladowi zameldować
``K_SOURCE_CATALOG``, czyli twierdzić, że producent tę liczbę podał. Pierwsza
wersja tego pliku właśnie tak „uzupełniała braki" — i była błędem, bo mierzyła
obecność pola zamiast możliwości policzenia.

WŁAŚCIWY NIEZMIENNIK: dla każdej pozycji produkcyjnej kryterium zwarciowe ma
podstawę — ``J_th``/``I_th`` z katalogu ALBO komplet danych do wyprowadzenia
(materiał + para temperatur, ``θk > θb``). Pozycja bez OBU dróg kończy się
werdyktem NIEDOSTĘPNY: kabel realnie używany w sieci zostaje niesprawdzony, a
projektant widzi dobór wyglądający na kompletny.
"""

from __future__ import annotations

import pytest
from network_model.catalog.mv_cable_line_catalog import CATALOG_TEST_SOURCE_REFERENCE
from network_model.catalog.repository import get_default_mv_catalog
from network_model.solvers.conductor_thermal_withstand import derive_k_iec60949

RODZINY_PRZEWODOW = ("list_cable_types", "list_line_types", "list_lv_cable_types")


def _produkcyjne(pozycje: list) -> list:
    """Rekordy testowe wyłączone po JAWNYM znaczniku źródła, nie po nazwie.

    `cable-incomplete-test` i `line-incomplete-test` są celowo niekompletne —
    sprawdzają, czy warstwa analizy uczciwie melduje brak danych. Wyjątek po
    treści `source_reference` nie rozleje się na produkcję przy zmianie nazw.
    """
    return [t for t in pozycje if (t.source_reference or "") != CATALOG_TEST_SOURCE_REFERENCE]


def _ma_podstawe_katalogowa(typ: object) -> bool:
    return (getattr(typ, "ith_1s_a", None) or 0) > 0 or (
        getattr(typ, "jth_1s_a_per_mm2", None) or 0
    ) > 0


@pytest.mark.parametrize("akcesor", RODZINY_PRZEWODOW)
def test_kazdy_przewod_ma_podstawe_oceny_cieplnej(akcesor: str) -> None:
    """Katalog ALBO wyprowadzenie — trzeciej drogi nie ma, a braku obu nie wolno.

    Wołamy PRAWDZIWE `derive_k_iec60949`, nie własną kopię warunku: gdyby norma
    albo tablica materiałów w solverze się zmieniła, ten test ma się rozjechać
    razem z nią, a nie zostać przy nieaktualnym „albo-albo".
    """
    bez_podstawy = [
        t.id
        for t in _produkcyjne(getattr(get_default_mv_catalog(), akcesor)())
        if not _ma_podstawe_katalogowa(t)
        and derive_k_iec60949(
            conductor_material=getattr(t, "conductor_material", None),
            temp_operating_c=getattr(t, "max_temperature_c", None),
            temp_short_circuit_c=getattr(t, "short_circuit_temperature_c", None),
        )
        is None
    ]
    assert not bez_podstawy, (
        f"Pozycje produkcyjne bez ŻADNEJ podstawy oceny cieplnej (ani katalog, ani "
        f"wyprowadzenie IEC 60949) — kryterium zwarciowe doboru pozostanie "
        f"NIESPRAWDZONE: {bez_podstawy}"
    )


@pytest.mark.parametrize("akcesor", RODZINY_PRZEWODOW)
def test_gestosc_z_katalogu_ma_przekroj_do_przeliczenia(akcesor: str) -> None:
    """``I_th = J_th · S`` — sama gęstość bez przekroju niczego nie policzy.

    PREDYKATY PARAMI: pola, które „dziś są razem", rozejdą się przy pierwszym
    imporcie wnoszącym tylko jedno z nich.
    """
    niespojne = [
        t.id
        for t in _produkcyjne(getattr(get_default_mv_catalog(), akcesor)())
        if not (t.ith_1s_a or 0) > 0
        and (t.jth_1s_a_per_mm2 or 0) > 0
        and not (t.cross_section_mm2 or 0) > 0
    ]
    assert not niespojne, f"Gęstość J_th bez przekroju — I_th niepoliczalne: {niespojne}"


def test_katalogowe_k_zgadza_sie_z_wyprowadzeniem_normatywnym() -> None:
    """Wartość Z KATALOGU i wartość Z NORMY muszą opisywać ten sam przewód.

    NAJMOCNIEJSZA KONTROLA, JAKA JEST TU MOŻLIWA — i jedyna niezależna: dla
    pozycji, które ``J_th`` PODAJĄ, liczymy je drugi raz ze wzoru IEC 60949 na
    ZADEKLAROWANEJ przez tę samą pozycję trójce (materiał, θb, θk). Rozjazd
    większy niż tolerancja zaokrągleń tablicowych znaczy, że któraś z dwóch
    liczb opisuje inny przewód niż deklaruje rekord — i wynik zwarciowy będzie
    zawyżony albo zaniżony bez żadnego sygnału, bo „liczba jest z katalogu".

    Tolerancja 1 % pokrywa różnicę między wartością tablicową (IEC 60364-5-54
    tab. 43A zaokrągla miedź/XLPE do 143) a wynikiem wzoru (142,874) — to ta
    sama wielkość podana z inną dokładnością, nie dwie różne dane.
    """
    rozjazdy: list[str] = []
    for akcesor in RODZINY_PRZEWODOW:
        for t in _produkcyjne(getattr(get_default_mv_catalog(), akcesor)()):
            jth = getattr(t, "jth_1s_a_per_mm2", None)
            if not (jth or 0) > 0:
                continue
            wyprowadzone = derive_k_iec60949(
                conductor_material=getattr(t, "conductor_material", None),
                temp_operating_c=getattr(t, "max_temperature_c", None),
                temp_short_circuit_c=getattr(t, "short_circuit_temperature_c", None),
            )
            if wyprowadzone is None:
                continue
            k_norma = wyprowadzone.k_a_s05_per_mm2
            if abs(jth - k_norma) / k_norma > 0.01:
                rozjazdy.append(f"{t.id}: katalog k={jth}, IEC 60949 daje {k_norma:.3f}")
    assert not rozjazdy, (
        "Współczynnik k z katalogu rozjeżdża się z wyprowadzeniem normatywnym na "
        "zadeklarowanej trójce (materiał, θb, θk): " + "; ".join(rozjazdy)
    )
