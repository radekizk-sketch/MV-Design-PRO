"""ESTYMATA BLEDU PRZY RESIDUUM NA GRANICY ZAOKRAGLEN (karta DETERMINIZM-KATA-FAZORA, 2026-09-29).

DEFEKT, KTORY TE TESTY PRZYPINAJA. Estymata bledu rozwiazania sieci `u_V = |J^-1 r|` (W6-A)
brala obliczone residuum takie, jakie jest. Gdy Newton konczy sie residuum, ktore jest juz
tylko szumem formowania `Y V - I` (np. punkt startowy kroku lezy w tolerancji i iteracja sie
nie wykonuje), `J^-1 r` jest realizacja szumu: w tej samej probce sceny dynamiki harnessu
estymata pochodnej napiec wynosila 1,9e-9 albo 1,2e-10 pu/s zaleznie od liczby watkow
OpenBLAS, a kod jakosci czestotliwosci przelaczal sie miedzy „rozroznialna" i
„nierozroznialna". Fikstura sceny zapisana na maszynie o 2 rdzeniach nie przechodzila testu na
maszynie o 4 rdzeniach.

REGULA. `siec.granica_zaokraglen_residuum` daje granice bledu, z jakim residuum jest w ogole
obliczalne: `rho_k = gamma_m (sum_j |Y_kj||V_j| + sum_t |I_t|)` (Higham 2002, lemat 3.1).
Residuum mieszczace sie w tej granicy w KAZDEJ skladowej nie niesie informacji o bledzie —
estymata jest wtedy `J^-1 rho` (deterministyczna). Residuum znaczace idzie droga `J^-1 r`
bez zmian (przypina to `test_obserwable.py::test_a01_punkt_skorygowany_jest_krokiem_w_strone_
rozwiazania`, a tu dodatkowo iloczyn z sieciami ponizej).

ILOCZYN CECH: {residuum: szum na granicy zaokraglen, znaczace} x {siec: SMIB z odbiorem
i zwarciem, siec z galezia slepa za przekladnia zespolona, scena harnessu} x {liczba watkow
BLAS: 1, 2}. Argumenty estymatora pochodza z RZECZYWISTEJ sciezki biegu (podsluch funkcji
w czasie biegu), nie z recznie zlozonego punktu.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import pytest
from network_model.solvers.dynamika import (
    HarmonogramDynamiki,
    SilnikDynamiki,
    WejscieDynamiki,
    ZwarcieWezla,
    obserwable,
)
from network_model.solvers.dynamika.odbiory import prad_wstrzykiwany_pu
from network_model.solvers.dynamika.siec import (
    JEDNOSTKA_ZAOKRAGLENIA,
    granica_zaokraglen_residuum,
    jakobian_algebry,
    ograniczenia_napiecia,
    residuum_algebry,
)
from scipy.sparse import linalg as sparse_linalg

from tests.ci.test_fixtury_harnessu import roznice_z_tolerancja
from tests.network_model.dynamika.uklady import (
    X_ZWARCIA_PLYTKIEGO_OHM,
    nastawy,
    zbuduj_smib_z_odbiorem,
)

from .test_kat_pradu_rozdzielczosc import wejscie_z_galezia_slepa

KATALOG_BACKENDU = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class _Wywolanie:
    """Argumenty i wynik jednego wywolania estymatora w czasie biegu."""

    model: Any
    odbiory: tuple[Any, ...]
    urzadzenia: tuple[Any, ...]
    stany: tuple[np.ndarray, ...]
    napiecia: np.ndarray
    pomiar: obserwable.PochodnaZNiepewnoscia


def _wejscie_smib_ze_zwarciem() -> WejscieDynamiki:
    uklad = zbuduj_smib_z_odbiorem()
    return uklad.wejscie(
        HarmonogramDynamiki(
            (
                ZwarcieWezla(
                    t_s=0.1,
                    wezel="GEN",
                    typ="3F",
                    r_f_ohm=0.0,
                    # Zapad PLYTKI: przy glebokim (X_ZWARCIA_OHM, 0,01 pu) odbior stalej mocy
                    # w wezle zwarcia nie ma rozwiazania algebry i rdzen slusznie odmawia biegu.
                    x_f_ohm=X_ZWARCIA_PLYTKIEGO_OHM,
                    t_usuniecia_s=0.2,
                    sposob_usuniecia="samoczynne",
                ),
            )
        ),
        nastawy(horyzont_s=0.5, krok_wyjscia_s=0.02),
    )


SIECI = {
    "smib_z_odbiorem_i_zwarciem": _wejscie_smib_ze_zwarciem,
    "galaz_slepa_za_przekladnia_zespolona": wejscie_z_galezia_slepa,
}


def _wywolania(wejscie: WejscieDynamiki, monkeypatch: pytest.MonkeyPatch) -> list[_Wywolanie]:
    """Uruchom bieg i zapisz KAZDE wywolanie estymatora z jego argumentami i wynikiem."""
    zapis: list[_Wywolanie] = []
    oryginal = obserwable.pochodna_napiec_z_niepewnoscia

    def podsluch(model, odbiory, urzadzenia, stany, napiecia):  # type: ignore[no-untyped-def]
        pomiar = oryginal(model, odbiory, urzadzenia, stany, napiecia)
        zapis.append(
            _Wywolanie(
                model, odbiory, urzadzenia, tuple(s.copy() for s in stany), napiecia.copy(), pomiar
            )
        )
        return pomiar

    monkeypatch.setattr(obserwable, "pochodna_napiec_z_niepewnoscia", podsluch)
    SilnikDynamiki(wejscie=wejscie).uruchom()
    assert zapis, "bieg nie wywolal estymatora ani razu — test niczego by nie sprawdzil"
    return zapis


def _granica_niezalezna(w: _Wywolanie) -> np.ndarray:
    """Ta sama granica liczona wprost z gestej Ybus — petla po wierszach, bez kodu produkcji."""
    ybus = w.model.ybus.toarray()
    liczba = w.model.liczba_wezlow
    ograniczone = dict(ograniczenia_napiecia(w.model, w.urzadzenia))
    wynik = np.zeros(liczba)
    for k in range(liczba):
        if k in ograniczone:
            indeks = ograniczone[k]
            narzucone = (
                0j
                if indeks is None
                else w.urzadzenia[indeks].napiecie_bez_obciazenia(w.stany[indeks])
            )
            m = 2
            wynik[k] = (m * JEDNOSTKA_ZAOKRAGLENIA / (1 - m * JEDNOSTKA_ZAOKRAGLENIA)) * (
                abs(complex(w.napiecia[k])) + abs(narzucone)
            )
            continue
        skladniki_y = [
            abs(ybus[k, j]) * abs(complex(w.napiecia[j])) for j in range(liczba) if ybus[k, j] != 0
        ]
        prady = [
            abs(prad_wstrzykiwany_pu(o, complex(w.napiecia[k])))
            for o in w.odbiory
            if w.model.indeks_wezla[o.wezel] == k
        ] + [
            abs(u.prad_pu(s, complex(w.napiecia[k])))
            for u, s in zip(w.urzadzenia, w.stany, strict=True)
            if w.model.indeks_wezla[u.wezel] == k
        ]
        m = len(skladniki_y) + len(prady) + 3
        wynik[k] = (m * JEDNOSTKA_ZAOKRAGLENIA / (1 - m * JEDNOSTKA_ZAOKRAGLENIA)) * (
            sum(skladniki_y) + sum(prady)
        )
    return wynik


def _estymata_z_wektora(w: _Wywolanie, wektor: np.ndarray) -> np.ndarray:
    rozklad = sparse_linalg.splu(
        jakobian_algebry(w.model, w.odbiory, w.urzadzenia, w.stany, w.napiecia)
    )
    rozwiazanie = rozklad.solve(wektor)
    liczba = w.model.liczba_wezlow
    return np.abs(rozwiazanie[:liczba] + 1j * rozwiazanie[liczba:])


@pytest.mark.parametrize("siec", sorted(SIECI))
def test_granica_zaokraglen_to_suma_modulow_skladnikow_wiersza(
    siec: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    for w in _wywolania(SIECI[siec](), monkeypatch):
        produkcja = granica_zaokraglen_residuum(
            w.model, w.odbiory, w.urzadzenia, w.stany, w.napiecia
        )
        assert np.all(np.isfinite(produkcja)) and np.all(produkcja >= 0.0)
        np.testing.assert_allclose(produkcja, _granica_niezalezna(w), rtol=1e-12, atol=0.0)


@pytest.mark.parametrize("siec", sorted(SIECI))
def test_estymata_przy_residuum_szumu_jest_propagacja_granicy(
    siec: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Residuum mieszczace sie w granicy: `u_V = |J^-1 rho|`, nie realizacja szumu `|J^-1 r|`.

    Pierwsza asercja pilnuje, ze wzorzec naprawde ma probki z residuum-szumem — bez niej test
    przeszedlby na rdzeniu z dawna estymata i niczego by nie dowodzil.
    """
    szum = 0
    for w in _wywolania(SIECI[siec](), monkeypatch):
        reszta = residuum_algebry(w.model, w.odbiory, w.urzadzenia, w.stany, w.napiecia)
        granica = granica_zaokraglen_residuum(w.model, w.odbiory, w.urzadzenia, w.stany, w.napiecia)
        granica_rzeczywista = np.concatenate((granica, granica))
        if np.any(np.abs(reszta) > granica_rzeczywista):
            continue
        szum += 1
        np.testing.assert_allclose(
            w.pomiar.niepewnosc_napiecia_pu,
            _estymata_z_wektora(w, granica_rzeczywista),
            rtol=1e-12,
            atol=0.0,
        )
    assert szum > 0, "bieg nie mial ani jednej probki z residuum na granicy zaokraglen"


@pytest.mark.parametrize("siec", sorted(SIECI))
def test_estymata_przy_residuum_znaczacym_jest_krokiem_newtona(
    siec: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Residuum ponad granica (punkt przesuniety o 1e-6 pu): `u_V = |J^-1 r|` bez zmian."""
    for w in _wywolania(SIECI[siec](), monkeypatch)[:3]:
        przesuniete = w.napiecia.copy()
        wolne = [k for k in range(w.model.liczba_wezlow) if k not in set(w.model.pozycje_zerowe)]
        przesuniete[wolne] += 1.0e-6
        reszta = residuum_algebry(w.model, w.odbiory, w.urzadzenia, w.stany, przesuniete)
        granica = granica_zaokraglen_residuum(
            w.model, w.odbiory, w.urzadzenia, w.stany, przesuniete
        )
        assert np.any(np.abs(reszta) > np.concatenate((granica, granica))), "residuum nieznaczace"
        pomiar = obserwable.pochodna_napiec_z_niepewnoscia(
            w.model, w.odbiory, w.urzadzenia, w.stany, przesuniete
        )
        przesuniety = _Wywolanie(w.model, w.odbiory, w.urzadzenia, w.stany, przesuniete, pomiar)
        np.testing.assert_allclose(
            pomiar.niepewnosc_napiecia_pu,
            _estymata_z_wektora(przesuniety, reszta),
            rtol=1e-12,
            atol=0.0,
        )


# ---------------------------------------------------------------------------
# Cala scena dynamiki harnessu przy 1 i 2 watkach BLAS
# ---------------------------------------------------------------------------

_SKRYPT_SCENY = """
import json, sys
sys.path.insert(0, "scripts")
import eksport_fixtur_harnessu as eksport
json.dump(eksport.FIXTURY["dynamika_scena_przebiegi"](), sys.stdout, sort_keys=True)
"""


def _scena(liczba_watkow: int) -> dict[str, Any]:
    """Scena w OSOBNYM procesie z zadana liczba watkow BLAS (ustalana przy ladowaniu biblioteki).

    Sciezka importu dziedziczona z biezacego procesu — harness mutacji podstawia swoje lustro
    `src/` i ten test widzi zmutowany rdzen.
    """
    srodowisko = dict(os.environ)
    srodowisko["PYTHONPATH"] = os.pathsep.join(p for p in sys.path if p)
    for zmienna in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS"):
        srodowisko[zmienna] = str(liczba_watkow)
    proces = subprocess.run(
        [sys.executable, "-c", _SKRYPT_SCENY],
        cwd=KATALOG_BACKENDU,
        env=srodowisko,
        capture_output=True,
        text=True,
        timeout=600,
        check=False,
    )
    assert proces.returncode == 0, proces.stderr[-4000:]
    return json.loads(proces.stdout)


def test_scena_dynamiki_nie_zalezy_od_liczby_watkow_blas() -> None:
    """Ta sama scena przy 1 i 2 watkach: komparator fikstur harnessu nie widzi ZADNEJ roznicy.

    Obejmuje wszystkie kanaly naraz: katy pradow (rozdzielczosc rozwiazania), czestotliwosc,
    jej estymate niepewnosci i kod jakosci (granica zaokraglen residuum), moduly i moce.
    Przed poprawka ta para dawala rozne katy szumu i rozne kody jakosci czestotliwosci.
    """
    jeden = _scena(1)
    dwa = _scena(2)
    roznice = roznice_z_tolerancja(jeden, dwa)
    assert roznice == [], "\n".join(roznice[:20])
