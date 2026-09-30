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
Residuum rozklada sie na czesc PEWNIE obecna `psi(r) = sign(r) max(|r| - rho, 0)` i reszte
mieszczaca sie w `rho`; estymata to `|J^-1 psi(r)| + |J^-1 rho|` (korekta 2026-09-30, karta
PRZENOSNOSC-NIEPEWNOSCI). Na dnie zaokraglen (`psi = 0`) zostaje sama propagacja granicy
(deterministyczna); daleko nad dnem estymata jest krokiem Newtona `|J^-1 r|` z dokladnoscia
do `rho`. Dawna regula (`J^-1 r` przy choc jednej skladowej ponad granica) byla nieciagla na
progu i tuz nad nim spadala do 1,4-7,4 % propagacji granicy (pomiar spacerem po ULP ponizej).

ILOCZYN CECH: {residuum: szum na granicy zaokraglen, tuz nad progiem czesci pewnej,
znaczace} x {siec: SMIB z odbiorem i zwarciem, siec z galezia slepa za przekladnia zespolona,
scena harnessu} x {jadro OpenBLAS: domyslne, Prescott na x86-64} x {liczba watkow BLAS: 1, 2}.
Argumenty estymatora pochodza z RZECZYWISTEJ sciezki biegu (podsluch funkcji w czasie biegu),
nie z recznie zlozonego punktu; punkty tuz nad progiem powstaja z probek na dnie przez
przesuniecie napiecia wezla o kolejne liczby zmiennoprzecinkowe.
"""

from __future__ import annotations

import json
import math
import os
import platform
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

from tests.ci.test_fixtury_harnessu import RTOL_FIXTUR, roznice_z_tolerancja
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


def _czesc_pewna(reszta: np.ndarray, granica: np.ndarray) -> np.ndarray:
    """`psi(r) = sign(r) max(|r| - rho, 0)` wprost ze wzoru, bez kodu produkcji."""
    granica_rzeczywista = np.concatenate((granica, granica))
    return np.sign(reszta) * np.maximum(np.abs(reszta) - granica_rzeczywista, 0.0)


@pytest.mark.parametrize("siec", sorted(SIECI))
def test_estymata_przy_residuum_znaczacym_to_czesc_pewna_plus_dno(
    siec: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Residuum ponad granica (punkt przesuniety o 1e-6 pu): `u_V = |J^-1 psi(r)| + |J^-1 rho|`,
    a daleko nad dnem to wciaz krok Newtona `|J^-1 r|` (intencja dawnego testu tej sciezki).

    „Daleko nad dnem" jest wlasnoscia WEZLA, nie punktu: w sieci z galezia slepa skladowa
    kroku Newtona w jednym wezle ma 1,6e-22 pu przy 1e-6 pu w pozostalych — ponizej
    rozdzielczosci samego podstawienia LU, ktorego blad jest rzedu `u` razy NAJWIEKSZA
    skladowa rozwiazania. Odleglosc estymaty od kroku Newtona jest wiec ograniczona
    propagacja granicy przez modul odwrotnosci plus blad podstawien: `r - psi(r)` i `rho`
    maja skladowe nie wieksze od `rho`, wiec `| u_V - |J^-1 r| | <= 2 (|J^-1| rho)` na wezle
    (nierownosc trojkata; `|J^-1|` — modul elementow odwrotnosci gestej, sieci testowe maja
    po kilka wezlow), z zapasem 1e-9 najwiekszej skladowej kroku na zaokraglenia podstawien.
    """
    wywolania = _wywolania(SIECI[siec](), monkeypatch)[:3]
    monkeypatch.undo()
    for w in wywolania:
        przesuniete = w.napiecia.copy()
        wolne = [k for k in range(w.model.liczba_wezlow) if k not in set(w.model.pozycje_zerowe)]
        przesuniete[wolne] += 1.0e-6
        reszta = residuum_algebry(w.model, w.odbiory, w.urzadzenia, w.stany, przesuniete)
        granica = granica_zaokraglen_residuum(
            w.model, w.odbiory, w.urzadzenia, w.stany, przesuniete
        )
        czesc_pewna = _czesc_pewna(reszta, granica)
        assert np.any(czesc_pewna != 0.0), "residuum nieznaczace"
        pomiar = obserwable.pochodna_napiec_z_niepewnoscia(
            w.model, w.odbiory, w.urzadzenia, w.stany, przesuniete
        )
        przesuniety = _Wywolanie(w.model, w.odbiory, w.urzadzenia, w.stany, przesuniete, pomiar)
        dno = _estymata_z_wektora(przesuniety, np.concatenate((granica, granica)))
        np.testing.assert_allclose(
            pomiar.niepewnosc_napiecia_pu,
            _estymata_z_wektora(przesuniety, czesc_pewna) + dno,
            rtol=1e-12,
            atol=0.0,
        )
        liczba = w.model.liczba_wezlow
        odwrotnosc = np.abs(
            np.linalg.inv(
                jakobian_algebry(w.model, w.odbiory, w.urzadzenia, w.stany, przesuniete).toarray()
            )
        )
        propagacja = odwrotnosc @ np.concatenate((granica, granica))
        granica_rygorystyczna = 2.0 * np.hypot(propagacja[:liczba], propagacja[liczba:])
        krok_newtona = _estymata_z_wektora(przesuniety, reszta)
        odstep = np.abs(pomiar.niepewnosc_napiecia_pu - krok_newtona)
        assert np.all(
            odstep <= granica_rygorystyczna + 1.0e-9 * float(np.max(krok_newtona))
        ), "estymata odbiega od kroku Newtona o wiecej niz propagacja granicy zaokraglen"
        assert np.any(
            krok_newtona > 1.0e6 * granica_rygorystyczna
        ), "zaden wezel nie jest daleko nad dnem — przypadek nie sprawdza drogi Newtona"
        assert np.all(
            pomiar.niepewnosc_napiecia_pu >= dno * (1.0 - 1.0e-12)
        ), "estymata ponizej propagacji dna"


#: Najwiecej kolejnych liczb zmiennoprzecinkowych, o ktore przesuwamy czesc rzeczywista
#: napiecia wezla, szukajac progu czesci pewnej. Pomiar 2026-09-30: prog wypada po 1-7
#: przesunieciach (residuum rosnie o |Y_kk| ulp(V_k) na krok, a granica to gamma_m razy suma
#: modulow wiersza, czyli kilka ulp) — zapas trzech rzedow wielkosci.
NAJWIECEJ_KROKOW_ULP = 4096


def _prog_czesci_pewnej(w: _Wywolanie, wezel: int) -> tuple[np.ndarray, np.ndarray] | None:
    """Para punktow rozniacych sie JEDNA liczba zmiennoprzecinkowa czesci rzeczywistej napiecia
    wezla: ostatni na dnie zaokraglen (`psi = 0`) i pierwszy z czescia pewna (`psi != 0`)."""
    ponizej = w.napiecia.copy()
    for _ in range(NAJWIECEJ_KROKOW_ULP):
        powyzej = ponizej.copy()
        powyzej[wezel] = complex(np.nextafter(ponizej[wezel].real, np.inf), ponizej[wezel].imag)
        reszta = residuum_algebry(w.model, w.odbiory, w.urzadzenia, w.stany, powyzej)
        granica = granica_zaokraglen_residuum(w.model, w.odbiory, w.urzadzenia, w.stany, powyzej)
        if np.any(_czesc_pewna(reszta, granica) != 0.0):
            return ponizej, powyzej
        ponizej = powyzej
    return None


@pytest.mark.parametrize("siec", sorted(SIECI))
def test_estymata_tuz_nad_progiem_czesci_pewnej_nie_spada_pod_dno(
    siec: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Na progu czesci pewnej estymata jest CIAGLA i nie schodzi ponizej propagacji dna.

    DEFEKT (pomiar 2026-09-30). Dawna regula brala `|J^-1 r|`, gdy choc jedna skladowa `r`
    wyszla ponad granice. Tuz nad progiem reszta residuum jest szumem, a `|J^-1 r|` spadalo
    do 1,4-7,4 % propagacji granicy w punkcie rozniacym sie JEDNA liczba zmiennoprzecinkowa
    od punktu na dnie; w SO-1a (probka 372) — do 4,6e-15 Hz wobec 1,1e-10 Hz. Ktora strona
    progu wypadla w danej probce, zalezalo od jadra BLAS.

    Punkty sa pochodna RZECZYWISTEJ sciezki: kazda probka biegu na dnie x kazdy wezel zywy,
    przesuniety o kolejne liczby zmiennoprzecinkowe az do progu. Sprawdzamy: `u_V` nad
    progiem >= propagacji dna, skok `u_V` przez prog <= `|J^-1 psi|` (ciaglosc wzgledem czesci
    pewnej), `u_Vdot` nad progiem nie mniejsze niz ponizej (w granicy szumu roznicy
    skonczonej, `RTOL_FIXTUR`). Asercje niepustosci: przypadki istnieja, dawna regula spadalaby
    w nich pod dno, a `u_Vdot` jest mierzone na probkach, w ktorych jest dodatnie.
    """
    wywolania = _wywolania(SIECI[siec](), monkeypatch)
    # Podsluch zdjety PRZED wlasnymi wywolaniami estymatora — inaczej dopisywalby je do
    # iterowanej listy i petla nigdy by sie nie skonczyla.
    monkeypatch.undo()
    progi = 0
    z_pochodna = 0
    najnizsza_dawna = math.inf
    for w in wywolania:
        reszta = residuum_algebry(w.model, w.odbiory, w.urzadzenia, w.stany, w.napiecia)
        granica = granica_zaokraglen_residuum(w.model, w.odbiory, w.urzadzenia, w.stany, w.napiecia)
        if np.any(_czesc_pewna(reszta, granica) != 0.0):
            continue
        zywe = np.abs(w.napiecia) > 0.0
        zywe[list(w.model.pozycje_zerowe)] = False
        for wezel in np.flatnonzero(zywe & (w.napiecia.real != 0.0)):
            para = _prog_czesci_pewnej(w, int(wezel))
            assert (
                para is not None
            ), f"wezel {wezel}: brak progu czesci pewnej w {NAJWIECEJ_KROKOW_ULP} krokach"
            ponizej, powyzej = para
            przed = obserwable.pochodna_napiec_z_niepewnoscia(
                w.model, w.odbiory, w.urzadzenia, w.stany, ponizej
            )
            po = obserwable.pochodna_napiec_z_niepewnoscia(
                w.model, w.odbiory, w.urzadzenia, w.stany, powyzej
            )
            reszta_po = residuum_algebry(w.model, w.odbiory, w.urzadzenia, w.stany, powyzej)
            granica_po = granica_zaokraglen_residuum(
                w.model, w.odbiory, w.urzadzenia, w.stany, powyzej
            )
            punkt_po = _Wywolanie(w.model, w.odbiory, w.urzadzenia, w.stany, powyzej, po)
            dno_po = _estymata_z_wektora(punkt_po, np.concatenate((granica_po, granica_po)))
            skladnik_pewny = _estymata_z_wektora(punkt_po, _czesc_pewna(reszta_po, granica_po))
            dawna = _estymata_z_wektora(punkt_po, reszta_po)

            assert np.all(
                po.niepewnosc_napiecia_pu[zywe] >= dno_po[zywe] * (1.0 - 1.0e-12)
            ), "estymata tuz nad progiem ponizej propagacji dna zaokraglen"
            skok = np.abs(po.niepewnosc_napiecia_pu[zywe] - przed.niepewnosc_napiecia_pu[zywe])
            assert np.all(
                skok <= skladnik_pewny[zywe] + 1.0e-9 * przed.niepewnosc_napiecia_pu[zywe]
            ), "estymata nieciagla na progu czesci pewnej"
            najnizsza_dawna = min(najnizsza_dawna, float(np.min(dawna[zywe] / dno_po[zywe])))

            baza = przed.niepewnosc_pochodnej_pu_s[zywe]
            nad = po.niepewnosc_pochodnej_pu_s[zywe]
            mierzalne = np.isfinite(baza) & np.isfinite(nad) & (baza > 0.0)
            if np.any(mierzalne):
                assert np.all(
                    nad[mierzalne] >= baza[mierzalne] * (1.0 - RTOL_FIXTUR)
                ), "niepewnosc pochodnej tuz nad progiem ponizej niepewnosci na dnie"
                z_pochodna += 1
            progi += 1
    assert progi > 0, "bieg nie mial probek na dnie zaokraglen — test niczego nie sprawdzil"
    assert z_pochodna > 0, "zaden prog nie mial dodatniej niepewnosci pochodnej"
    assert najnizsza_dawna < 0.5, (
        f"dawna regula nie spadalaby tu pod dno (min {najnizsza_dawna:.3e}) — przypadki nie "
        "rozrozniaja reguly"
    )


# ---------------------------------------------------------------------------
# Cala scena dynamiki harnessu przy 1 i 2 watkach BLAS
# ---------------------------------------------------------------------------

#: Eksporter fixtur ladowany z PLIKU (jak w `tests/ci/test_fixtury_harnessu.py`), a nie przez
#: dopisanie katalogu `scripts` do sciezki importu — dopisek przeslanialby pakiety zrodlowe
#: (`tests/ci/test_testy_nie_cieniuja_pakietow_zrodlowych.py`).
_SKRYPT_SCENY = """
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location(
    "eksport_fixtur_harnessu", "scripts/eksport_fixtur_harnessu.py"
)
eksport = importlib.util.module_from_spec(spec)
spec.loader.exec_module(eksport)
json.dump(eksport.FIXTURY["dynamika_scena_przebiegi"](), sys.stdout, sort_keys=True)
"""


#: Jadra OpenBLAS, ktorymi test sceny przestawia kolejnosc sumowania (zmienna
#: `OPENBLAS_CORETYPE`, czytana przy ladowaniu biblioteki). `None` — jadro wybrane przez
#: biblioteke dla procesora maszyny; `Prescott` (SSE3) istnieje na KAZDYM procesorze x86-64,
#: wiec wymuszenie go nie grozi nielegalna instrukcja. Na innej architekturze nazwy jader sa
#: inne i os jadra sprowadza sie do jadra domyslnego (os liczby watkow zostaje).
#: Pomiar 2026-09-30: przed poprawka PRZENOSNOSC-NIEPEWNOSCI para (domyslne SkylakeX,
#: Prescott) dawala `u_f_est_hz` probki 0 rozne o 0,31 %, a (Haswell, 2 watki) — o 0,57 %.
JADRA_OPENBLAS: tuple[str | None, ...] = (
    (None, "Prescott") if platform.machine().lower() in {"x86_64", "amd64"} else (None,)
)


def _scena(liczba_watkow: int, jadro: str | None = None) -> dict[str, Any]:
    """Scena w OSOBNYM procesie z zadana liczba watkow BLAS i jadrem OpenBLAS (oba ustalane
    przy ladowaniu biblioteki).

    Sciezka importu dziedziczona z biezacego procesu — harness mutacji podstawia swoje lustro
    `src/` i ten test widzi zmutowany rdzen.
    """
    srodowisko = dict(os.environ)
    srodowisko["PYTHONPATH"] = os.pathsep.join(p for p in sys.path if p)
    for zmienna in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS"):
        srodowisko[zmienna] = str(liczba_watkow)
    srodowisko.pop("OPENBLAS_CORETYPE", None)
    if jadro is not None:
        srodowisko["OPENBLAS_CORETYPE"] = jadro
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


def test_scena_dynamiki_nie_zalezy_od_jadra_i_liczby_watkow_blas() -> None:
    """Ta sama scena w iloczynie {jadro OpenBLAS} x {1, 2 watki}: komparator fikstur harnessu
    nie widzi ZADNEJ roznicy miedzy zadna para wariantow.

    Obejmuje wszystkie kanaly naraz: katy pradow (rozdzielczosc rozwiazania), czestotliwosc,
    jej estymate niepewnosci i kod jakosci (granica zaokraglen residuum, spojna inicjalizacja
    algebry w `t = 0`, krok roznicy pochodnej), moduly i moce. Przed karta
    DETERMINIZM-KATA-FAZORA para liczb watkow dawala rozne katy szumu i kody jakosci; przed
    karta PRZENOSNOSC-NIEPEWNOSCI inne jadro (runner CI) dawalo inna `u_f_est_hz` probki 0.
    """
    warianty = {
        (jadro, watki): _scena(watki, jadro) for jadro in JADRA_OPENBLAS for watki in (1, 2)
    }
    (wzorzec_klucz, wzorzec), *reszta = warianty.items()
    for klucz, wariant in reszta:
        roznice = roznice_z_tolerancja(wzorzec, wariant)
        assert roznice == [], f"{wzorzec_klucz} wobec {klucz}:\n" + "\n".join(roznice[:20])
