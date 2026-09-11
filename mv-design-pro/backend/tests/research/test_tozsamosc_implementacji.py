"""Wynik niesie odcisk KODU, który go policzył (§3 audytu rundy 3).

PO CO. Tożsamość modelu i tożsamość scenariusza odpowiadają na pytanie „CO
liczono". Żadna z nich nie odpowiada na „CZYM": poprawka w równaniu solvera,
w ograniczniku prądu albo w kryterium zbieżności zmienia przebieg, nie ruszając
ani jednego z pozostałych odcisków. Wynik bez odcisku implementacji daje się
więc przypisać do kodu, który go NIE policzył — i nic tego nie wykryje.

DLACZEGO Z TREŚCI, A NIE Z NUMERU WERSJI. Numer wersji jest deklaracją, którą
ktoś musi podnieść; odcisk treści jest pomiarem, który zmienia się sam. Testy
poniżej pilnują właśnie tej różnicy: zmiana JEDNEGO znaku w JEDNYM module musi
zmienić odcisk, także taka, którą autor uznał za nieistotną.
"""

from __future__ import annotations

import hashlib
import pathlib
import re

import pytest
from dynamic_lab.siec import Galaz, TopologiaSieci
from dynamic_lab.silnik import ModelDynamiczny, SilnikRMS
from dynamic_lab.tozsamosc import _policz_odcisk_implementacji, odcisk_implementacji
from dynamic_lab.urzadzenia import FalownikGFL
from dynamic_lab.wynik import KONTRAKT, WynikDynamiczny

KATALOG = pathlib.Path(_policz_odcisk_implementacji.__globals__["__file__"]).resolve().parent


def _bieg() -> WynikDynamiczny:
    topologia = TopologiaSieci(
        szyny=("A", "SYS"),
        galezie=[Galaz("A", "SYS", 0.02, 0.10)],
        szyny_sztywne={"SYS": complex(1.0, 0.0)},
    )
    model = ModelDynamiczny(topologia=topologia, urzadzenia=[FalownikGFL(ref="D", szyna="A")])
    silnik = SilnikRMS(model, integrator="rk4", krok_s=0.005)
    x0 = silnik.inicjalizuj({"D": complex(0.4, 0.05)})
    return silnik.symuluj(x0, czas_koncowy_s=0.1)


def test_wynik_biegu_niesie_odcisk_implementacji() -> None:
    """Silnik wypełnia odcisk SAM — nie trzeba o nim pamiętać przy każdym wywołaniu."""
    wynik = _bieg()
    assert wynik.odcisk_implementacji == odcisk_implementacji()
    assert re.fullmatch(r"[0-9a-f]{64}", wynik.odcisk_implementacji)
    assert wynik.to_dict()["odcisk_implementacji"] == wynik.odcisk_implementacji


def test_odcisk_jest_deterministyczny_w_obrebie_procesu() -> None:
    assert _policz_odcisk_implementacji() == _policz_odcisk_implementacji()
    assert odcisk_implementacji() == _policz_odcisk_implementacji()


def test_odcisk_obejmuje_KAZDY_modul_pakietu() -> None:
    """Zakres jest ZAMKNIĘTY: wszystkie ``*.py`` pakietu, bez wyjątków.

    Moduł pominięty w odcisku to moduł, którego zmiana jest niewidoczna — czyli
    dokładnie ta luka, przed którą odcisk ma chronić.
    """
    moduly = sorted(s.name for s in KATALOG.glob("*.py"))
    assert "silnik.py" in moduly and "urzadzenia.py" in moduly and "calkowanie.py" in moduly
    odtworzony = hashlib.sha256(
        "\n".join(
            f"{nazwa}:{hashlib.sha256((KATALOG / nazwa).read_bytes()).hexdigest()}"
            for nazwa in moduly
        ).encode("utf-8")
    ).hexdigest()
    assert odtworzony == _policz_odcisk_implementacji()


@pytest.mark.parametrize("modul", ["silnik.py", "urzadzenia.py", "calkowanie.py", "wynik.py"])
def test_zmiana_jednego_znaku_w_module_zmienia_odcisk(tmp_path: pathlib.Path, modul: str) -> None:
    """Iloczyn cech: cztery różne moduły × zmiana o JEDEN znak.

    Odcisk liczony jest z treści KATALOGU, więc test kopiuje pakiet do katalogu
    tymczasowego, zmienia tam jeden znak i liczy odcisk tą samą funkcją na
    kopii. Nie modyfikuje repozytorium.
    """

    def odcisk_katalogu(katalog: pathlib.Path) -> str:
        return hashlib.sha256(
            "\n".join(
                f"{s.name}:{hashlib.sha256(s.read_bytes()).hexdigest()}"
                for s in sorted(katalog.glob("*.py"), key=lambda s: s.name)
            ).encode("utf-8")
        ).hexdigest()

    kopia = tmp_path / "dynamic_lab"
    kopia.mkdir()
    for s in KATALOG.glob("*.py"):
        (kopia / s.name).write_bytes(s.read_bytes())
    przed = odcisk_katalogu(kopia)
    assert przed == _policz_odcisk_implementacji(), "kopia musi startować z tego samego odcisku"

    plik = kopia / modul
    plik.write_bytes(plik.read_bytes() + b"\n# jeden znak wiecej\n")
    assert odcisk_katalogu(kopia) != przed


def test_wynik_zlozony_poza_silnikiem_ma_odcisk_pusty() -> None:
    """Brak odcisku jest MELDUNKIEM BRAKU, nie domyślnym „to na pewno ten kod".

    Wpisanie bieżącego odcisku do wyniku, którego ten kod nie policzył, byłoby
    twierdzeniem fałszywym — i to takim, którego nie da się później podważyć.
    """
    from dynamic_lab.wynik import DiagnostykaSolvera

    wynik = WynikDynamiczny(
        kontrakt=KONTRAKT,
        czas_s=(0.0,),
        sygnaly=(),
        modele=(),
        zdarzenia=(),
        diagnostyka=DiagnostykaSolvera(
            integrator="rk4",
            krok_s=0.01,
            liczba_krokow=0,
            ewaluacje_pochodnych=0,
            maks_residuum_sieci=0.0,
            maks_iteracji_sieci=1,
            zbiegl=True,
            norma_pochodnej_w_t0=0.0,
        ),
        odcisk_scenariusza="a" * 64,
        odcisk_topologii="b" * 64,
    )
    assert wynik.odcisk_implementacji == ""
