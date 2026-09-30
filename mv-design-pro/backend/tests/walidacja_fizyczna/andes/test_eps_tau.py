"""Eksperyment eps -> tau jako BRAMKA (R10 par. 12-15).

Oznaczony `andes`, bo wymaga wyroczni zewnetrznej spoza zaleznosci produkcyjnych.
To NIE jest ciche odznaczenie: manifest dowodow nazywa D-09 poziomem L4 WLASNIE
dlatego, ze jego bramka nie jest bramka kazdego PR — i wskazuje, gdzie ten dowod
jest wykonywany.
"""

from __future__ import annotations

import pytest

from . import eksperyment_eps_tau as eksperyment

#: Marker, NIE `importorskip`. Bieg bez ANDES DESELEKCJONUJE te testy (jawnie, z
#: liczba w meldunku), zamiast je POMIJAC (cicho, z „1 skipped"). Ta sama konwencja,
#: co w `tests/network_model/dynamika/test_wyrocznia_andes.py`. Modul importuje sie
#: bez ANDES, bo `eksperyment_eps_tau` wola `import andes` dopiero w ciele funkcji —
#: dokladnie tak, jak robi to wyrocznia w `wyrocznia_andes.zbuduj_system`.
pytestmark = pytest.mark.andes


@pytest.fixture(scope="module")
def pomiary() -> dict:
    """Komplet pomiarow liczony RAZ na modul — kazdy bieg ANDES trwa dziesiatki sekund.

    Bramka CI uzywa DWOCH zamiatan (po `eps` przy stalym `dt` i po `dt` przy stalym
    `eps`), bo to one rozstrzygaja postac prawa. Pelna macierz `dt x eps` zostaje w
    module eksperymentu (`python -m ...eksperyment_eps_tau`) — jest potwierdzeniem,
    nie rozstrzygnieciem, a kosztuje kolejne dwanascie biegow wyroczni.
    """
    po_eps = eksperyment.zamiatanie_eps()
    po_dt = eksperyment.zamiatanie_dt_przy_stalym_eps()
    return {
        "eps": po_eps,
        "dt": po_dt,
        "kryminalistyka": eksperyment.kryminalistyka_zdarzenia(),
        "werdykt": eksperyment.werdykt(po_eps, po_dt),
    }


def test_zamiatanie_eps_daje_polowe_pierwszego_kroku(pomiary: dict) -> None:
    """`tau*` sledzi POLOWE pierwszego kroku po zdarzeniu na calym zamiataniu `eps`."""
    for wiersz in pomiary["eps"]:
        krok = eksperyment.pierwszy_krok_po_zdarzeniu_s(wiersz["dt_s"], wiersz["eps_s"])
        assert wiersz["tau_optymalne_s"] == pytest.approx(0.5 * krok, rel=0.05), wiersz
        assert wiersz["redukcja_krotnosc"] > 20.0, wiersz


def test_zamiatanie_dt_lamie_hipoteze_wyjsciowa(pomiary: dict) -> None:
    """Przy `dt < eps` `tau*` schodzi do `dt/2` — hipoteza `eps/2` przestaje obowiazywac.

    Ten test jest FALSYFIKATOREM postaci wyjsciowej, nie jej potwierdzeniem: gdyby
    `tau*` bylo stale rowne `eps/2`, asercja o `dt/2` bylaby czerwona.
    """
    ponizej = [w for w in pomiary["dt"] if w["dt_s"] < w["eps_s"]]
    assert ponizej, "zamiatanie musi przekraczac punkt zalamania dt = eps"
    for wiersz in ponizej:
        assert wiersz["tau_optymalne_s"] == pytest.approx(0.5 * wiersz["dt_s"], rel=0.05), wiersz
        assert wiersz["tau_na_eps"] < 0.45, wiersz


def test_probka_andes_w_chwili_zdarzenia_jest_sprzed_zdarzenia(pomiary: dict) -> None:
    """Kryminalistyka: ANDES zapisuje probke PRZED wykonaniem zdarzenia tej chwili."""
    dane = pomiary["kryminalistyka"]
    assert dane["probka_w_chwili_zdarzenia_jest"] == "SPRZED ZDARZENIA", dane
    assert dane["napiecie_w_t_plus_eps_pu"] < 0.9 * dane["napiecie_w_t_pu"], dane


def test_werdykt_jest_udowodniony(pomiary: dict) -> None:
    """Komplet danych musi dawac ocene PROVEN dla postaci ostatecznej."""
    ocena = pomiary["werdykt"]
    assert ocena["OCENA"] == "PROVEN", ocena
    assert ocena["najgorsze_odchylenie_hipotezy_wyjsciowej"] > 0.2, (
        "hipoteza wyjsciowa musi byc ROZROZNIALNA od ostatecznej — inaczej zamiatanie "
        "niczego nie rozstrzyga"
    )
