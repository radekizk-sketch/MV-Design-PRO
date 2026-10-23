"""PRZENOSNOSC ESTYMATY NIEPEWNOSCI CZESTOTLIWOSCI (karta PRZENOSNOSC-NIEPEWNOSCI, 2026-09-30).

DEFEKT, KTORY TE TESTY PRZYPINAJA. Po karcie DETERMINIZM-KATA-FAZORA scena dynamiki
harnessu dawala `u_f_est_hz` probki `t = 0` rozne o 0,57 % miedzy jadrami OpenBLAS
(Haswell/Zen na runnerze CI wobec SkylakeX w sesji) i miedzy liczbami watkow, a ten sam plik
fikstury rozjechal sie nawet na jednej maszynie w innym procesie (xdist). Dwie przyczyny,
obie tej samej KLASY — estymata niepewnosci niosla realizacje szumu zaokraglen:

1. Probka `t = 0` byla publikowana w punkcie pracy ROZPLYWU (bramka rownowagi przepuszcza
   `||g|| <= eps_init`), z residuum 2,2e-9 przy tolerancji biegu 1e-10. Blad takiego punktu
   wobec algebry rdzenia zawiera szum zaokraglen rozplywu (napiecia rozne o 1,6e-12 pu miedzy
   jadrami), a estymata `J^-1 r` wiernie go mierzyla. Naprawa: spojna inicjalizacja algebry
   (`silnik.SilnikDynamiki._korekta_algebry_t0`) z reinicjalizacja urzadzen w punkcie
   skorygowanym — bez niej stan `t = 0` sceny harnessu mial `max |f|` 2,9e-5 1/s (29 razy
   ponad `eps_init` sceny), a 10 wezlow meldowalo ROZROZNIALNA odchylke czestotliwosci
   w stanie ustalonym.
2. `u_Vdot` na dnie zaokraglen bylo roznica skonczona pochodnej przy przesunieciu
   wzglednym ~1e-10 — w czesci szumem obliczenia pochodnej (rozrzut miedzy jadrami do
   4,4e-5). Naprawa: krok wydluzony do `sqrt(u)` wzglednie
   (`obserwable.skala_kroku_pochodnej`).
3. Ta sama klasa na progu czesci pewnej residuum: dawna regula brala `J^-1 r`, gdy choc
   jedna skladowa wyszla ponad granice zaokraglen, a tuz nad progiem spadala gleboko pod
   propagacje granicy (SO-1a, probka 372: 4,6e-15 Hz wobec 1,1e-10 Hz); strona progu zalezala
   od jadra BLAS. Naprawa: estymata `|J^-1 psi(r)| + |J^-1 rho|` i `u_Vdot` jako suma dwoch
   roznic skonczonych (`obserwable.pochodna_napiec_z_niepewnoscia`; testy progu w
   `test_niepewnosc_na_granicy_zaokraglen.py`).

ILOCZYN CECH: {siec: SMIB z odbiorem stalej mocy, galaz slepa za przekladnia zespolona,
SMIB z odbiorem CZULYM czestotliwosciowo (stan estymatora), ten sam SMIB z szyna odcieta
w `t = 0` i odbiorem czulym w obszarze beznapieciowym} x {punkt pracy: dokladny (na dnie
zaokraglen), zaburzony w granicy `eps_init`} x {harmonogram: bez zdarzenia w `t = 0`
(probka C), ze zdarzeniem w `t = 0` (probki L i P)} dla probki zero — czyli {klasa elementu
stanowego: urzadzenie o sprzezeniu pradowym, urzadzenie o sprzezeniu napieciowym, odbior bez
stanu, odbior ze stanem przylaczony, odbior ze stanem odciety} x {niezmiennik chwili zero:
algebra rdzenia, rownowaga stanu, jeden predykat reinicjalizacji, slad} (rozszerzenie
niezmiennikow O-58 na odbiory stanowe — karta AB-1b.3b-NA-CZUBKU);
{wywolania estymatora z RZECZYWISTEJ sciezki biegu} x {rezim residuum: na dnie (jedna roznica
skonczona), z czescia pewna (dwie)} x {szum obliczenia pochodnej: +1 u, -1 u} dla kroku
roznicy. Os jadra BLAS x liczby watkow na calej scenie harnessu —
`test_niepewnosc_na_granicy_zaokraglen.py::test_scena_dynamiki_nie_zalezy_od_jadra_i_liczby_watkow_blas`.
"""

from __future__ import annotations

import dataclasses
import math
from collections.abc import Callable
from typing import Any

import numpy as np
import pytest
from network_model.solvers.dynamika import (
    GalazDynamiki,
    HarmonogramDynamiki,
    OdbiorDynamiki,
    SilnikDynamiki,
    WejscieDynamiki,
    WezelDynamiki,
    ZwarcieWezla,
    obserwable,
)
from network_model.solvers.dynamika.obserwable import JAKOSC_ROZROZNIALNA
from network_model.solvers.dynamika.siec import (
    JEDNOSTKA_ZAOKRAGLENIA,
    granica_zaokraglen_residuum,
    jakobian_algebry,
    residuum_algebry,
    residuum_ponad_granica_zaokraglen,
)
from network_model.solvers.dynamika.silnik import SilnikDynamiki as KlasaSilnika
from network_model.solvers.dynamika.tozsamosc import CYFRY_KWANTYZACJI
from scipy.sparse import linalg as sparse_linalg

from tests.ci.test_fixtury_harnessu import RTOL_FIXTUR
from tests.network_model.dynamika.uklady import (
    F_BAZOWA_HZ,
    U_N_KV,
    X_LINII_PU,
    X_ZWARCIA_PLYTKIEGO_OHM,
    charakterystyka_czula,
    nastawy,
    zbuduj_smib_z_odbiorem,
)

from .test_kat_pradu_rozdzielczosc import wejscie_z_galezia_slepa
from .test_niepewnosc_na_granicy_zaokraglen import SIECI, _wywolania

#: Zaburzenie wzgledne napiecia wezla GEN w punkcie pracy: residuum rzedu |Y_linii| * 1e-10
#: ~ 3e-10 pu miesci sie w `eps_init` = 1e-8 nastaw testowych (bramka przepuszcza), a jest
#: o piec rzedow ponad granica zaokraglen (korekta MUSI sie wykonac).
ZABURZENIE_WZGLEDNE_PUNKTU = 1.0e-10


def _harmonogram(ze_zdarzeniem_w_zerze: bool) -> HarmonogramDynamiki:
    if not ze_zdarzeniem_w_zerze:
        return HarmonogramDynamiki(())
    return HarmonogramDynamiki(
        (
            ZwarcieWezla(
                t_s=0.0,
                wezel="GEN",
                typ="3F",
                r_f_ohm=0.0,
                x_f_ohm=X_ZWARCIA_PLYTKIEGO_OHM,
                t_usuniecia_s=0.05,
                sposob_usuniecia="samoczynne",
            ),
        )
    )


def _smib(ze_zdarzeniem_w_zerze: bool) -> WejscieDynamiki:
    return zbuduj_smib_z_odbiorem().wejscie(
        _harmonogram(ze_zdarzeniem_w_zerze), nastawy(horyzont_s=0.1, krok_wyjscia_s=0.02)
    )


def _galaz_slepa(ze_zdarzeniem_w_zerze: bool) -> WejscieDynamiki:
    wejscie = wejscie_z_galezia_slepa()
    return dataclasses.replace(
        wejscie,
        harmonogram=_harmonogram(ze_zdarzeniem_w_zerze),
        nastawy=dataclasses.replace(wejscie.nastawy, horyzont_s=0.1, krok_wyjscia_s=0.02),
    )


#: Zaburzenie punktu pracy sieci z odbiorem CZULYM: przesuniecie fazy szyny odbioru rzedu
#: 1e-7 rad sprawia, ze prad odbioru przy trzymanym stanie estymatora rozni sie od pradu na
#: rozmaitosci rownowagi o `|dI/dtheta| * 1e-7 ~ 2,5e-9` pu (`k_pf/(w_n T_f) P0`), czyli
#: dwa rzedy ponad tolerancja biegu (1e-11): algebra korekty liczona przy trzymanym stanie
#: i stan `t = 0` bez `x := arg V0` sa rozroznialne od poprawnych (mutacje M75, M76).
#: Residuum takiego punktu (~4e-7 pu) miesci sie w `eps_init` tych sieci (1e-4).
ZABURZENIE_WZGLEDNE_PUNKTU_ODBIORU_CZULEGO = 1.0e-7
EPS_INIT_ODBIORU_CZULEGO = 1.0e-4


def _smib_odbior_czuly(ze_zdarzeniem_w_zerze: bool) -> WejscieDynamiki:
    return zbuduj_smib_z_odbiorem(
        q_odbioru_pu=0.05, charakterystyka=charakterystyka_czula()
    ).wejscie(
        _harmonogram(ze_zdarzeniem_w_zerze),
        nastawy(horyzont_s=0.1, krok_wyjscia_s=0.02, eps_init=EPS_INIT_ODBIORU_CZULEGO),
    )


def _smib_odbior_czuly_i_szyna_odcieta(ze_zdarzeniem_w_zerze: bool) -> WejscieDynamiki:
    """SMIB z odbiorem czulym + szyna `B` odcieta w `t = 0` (linia otwarta) z drugim odbiorem
    czulym: odbior w obszarze beznapieciowym ma stan estymatora (`x = 0` przy `V = 0`),
    ktorego korekta NIE moze ruszyc — napiecie jego wezla jest zerem z wiersza ograniczenia."""
    wejscie = _smib_odbior_czuly(ze_zdarzeniem_w_zerze)
    return dataclasses.replace(
        wejscie,
        wezly=(*wejscie.wezly, WezelDynamiki("B", U_N_KV)),
        galezie=(
            *wejscie.galezie,
            GalazDynamiki(
                "LB", "GEN", "B", 1.0 / complex(0.0, X_LINII_PU), 0.0, 1 + 0j, False, "linia"
            ),
        ),
        odbiory=(
            *wejscie.odbiory,
            OdbiorDynamiki("ODB_B", "B", 0.1, 0.02, charakterystyka=charakterystyka_czula()),
        ),
    )


SIECI_PROBKI_ZERO: dict[str, Callable[[bool], WejscieDynamiki]] = {
    "smib_z_odbiorem": _smib,
    "galaz_slepa_za_przekladnia_zespolona": _galaz_slepa,
    "smib_z_odbiorem_czulym": _smib_odbior_czuly,
    "smib_z_odbiorem_czulym_i_szyna_odcieta": _smib_odbior_czuly_i_szyna_odcieta,
}


def _zaburz_punkt_pracy(wejscie: WejscieDynamiki) -> WejscieDynamiki:
    zaburzenie = (
        ZABURZENIE_WZGLEDNE_PUNKTU_ODBIORU_CZULEGO
        if any(odbior.charakterystyka.k_pf != 0.0 for odbior in wejscie.odbiory)
        else ZABURZENIE_WZGLEDNE_PUNKTU
    )
    napiecia = dict(wejscie.punkt_pracy.napiecia_pu)
    napiecia["GEN"] = napiecia["GEN"] * (1.0 + zaburzenie)
    return dataclasses.replace(
        wejscie, punkt_pracy=dataclasses.replace(wejscie.punkt_pracy, napiecia_pu=napiecia)
    )


@dataclasses.dataclass
class _ProbkaZero:
    """Pierwsze probkowanie biegu: strona, model i napiecia, na ktorych je zapisano."""

    strona: str
    model: Any
    odbiory: tuple[Any, ...]
    urzadzenia: tuple[Any, ...]
    stany: tuple[np.ndarray, ...]
    napiecia: np.ndarray


def _bieg_z_probka_zero(
    wejscie: WejscieDynamiki, monkeypatch: pytest.MonkeyPatch
) -> tuple[Any, _ProbkaZero]:
    """Uruchom bieg i zapisz argumenty PIERWSZEGO probkowania (chwila 0, strona C albo L)."""
    zapis: list[_ProbkaZero] = []
    oryginal = KlasaSilnika._probkuj

    def podsluch(self, probkowanie, strona, t_s, model, odbiory, urzadzenia, stany, napiecia):  # type: ignore[no-untyped-def]
        if not zapis:
            zapis.append(
                _ProbkaZero(
                    strona,
                    model,
                    odbiory,
                    urzadzenia,
                    tuple(np.array(s, copy=True) for s in stany),
                    np.array(napiecia, copy=True),
                )
            )
        return oryginal(self, probkowanie, strona, t_s, model, odbiory, urzadzenia, stany, napiecia)

    monkeypatch.setattr(KlasaSilnika, "_probkuj", podsluch)
    wynik = SilnikDynamiki(wejscie=wejscie).uruchom()
    assert zapis, "bieg nie zapisal ani jednej probki"
    return wynik, zapis[0]


@pytest.mark.parametrize("ze_zdarzeniem_w_zerze", [False, True], ids=["probka_C", "probki_L_P"])
@pytest.mark.parametrize("zaburzony", [False, True], ids=["punkt_dokladny", "punkt_zaburzony"])
@pytest.mark.parametrize("siec", sorted(SIECI_PROBKI_ZERO))
def test_probka_zero_lezy_na_algebrze_rdzenia(
    siec: str, zaburzony: bool, ze_zdarzeniem_w_zerze: bool, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Probka `t = 0` spelnia tolerancje algebry biegu jak kazda inna — takze gdy punkt pracy
    przychodzi z residuum ponad dnem zaokraglen; punkt juz na dnie zostaje BITOWO bez zmian.

    Korekta zalezy od predykatu `siec.residuum_ponad_granica_zaokraglen`, wyprowadzonego z tej
    samej czesci pewnej residuum `psi(r)`, z ktorej estymator liczy skladnik `|J^-1 psi|` —
    slad biegu mowi, czy sie wykonala.

    Stan `t = 0` jest ROWNOWAGA ukladu, nie tylko punktem algebry: `max |f|` stanow rownowagi
    (liczone tu niezaleznie) nie przekracza dziesieciokrotnosci tej samej normy w punkcie
    rozplywu, ktory bramka przyjela (ten sam konstruktor `stan_poczatkowy`, inny punkt),
    a slad niesie obie normy bramki ocenionej na stanie `t = 0` (`residuum_f_po`,
    `residuum_g_po`). Pomiar 2026-09-30 (punkt zaburzony): bez
    reinicjalizacji urzadzen 2,26e-13, z reinicjalizacja 3,2e-17 (bramka: 3,2e-17). Slad
    niesie `max_zmiana_mocy_urzadzen_pu` (zmiana mocy oddawanej przy przesunieciu napiec),
    a probka `C` stanu ustalonego nie ma w zadnym wezle odchylki czestotliwosci
    ROZROZNIALNEJ.
    """
    wejscie = SIECI_PROBKI_ZERO[siec](ze_zdarzeniem_w_zerze)
    if zaburzony:
        wejscie = _zaburz_punkt_pracy(wejscie)
    wynik, probka = _bieg_z_probka_zero(wejscie, monkeypatch)
    assert probka.strona == ("L" if ze_zdarzeniem_w_zerze else "C")

    korekta = wynik.slad_white_box["inicjalizacja"]["korekta_algebry"]
    punkt = wejscie.punkt_pracy
    punkt_pracy = np.array(
        [complex(punkt.napiecia_pu.get(ident, 0j)) for ident in probka.model.identy_wezlow],
        dtype=complex,
    )
    liczba_odbiorow = len(probka.odbiory)
    # Stany PUNKTU PRACY (te same konstruktory, co inicjalizacja silnika: `x(0) = arg V_pf`
    # odbiorow ze stanem, `stan_poczatkowy(V, S)` urzadzen) — probka niesie juz stany po
    # reinicjalizacji w punkcie skorygowanym. Krotka wyrownana z `(*odbiory, *urzadzenia)`.
    stany_punktu = (
        *(
            odbior.stan_poczatkowy_odbioru(
                complex(punkt_pracy[probka.model.indeks_wezla[odbior.wezel]])
            )
            for odbior in probka.odbiory
        ),
        *(
            urzadzenie.stan_poczatkowy(
                punkt.napiecia_pu[urzadzenie.wezel], punkt.moce_zrodel_pu[urzadzenie.ident]
            )
            for urzadzenie in probka.urzadzenia
        ),
    )
    reszta_punktu = residuum_algebry(
        probka.model, probka.odbiory, probka.urzadzenia, stany_punktu, punkt_pracy
    )
    granica_punktu = granica_zaokraglen_residuum(
        probka.model, probka.odbiory, probka.urzadzenia, stany_punktu, punkt_pracy
    )
    oczekiwana = residuum_ponad_granica_zaokraglen(reszta_punktu, granica_punktu)
    assert (
        korekta["wykonana"] is oczekiwana
    ), "korekta algebry t = 0 rozstrzygnieta innym predykatem niz droga estymatora"
    if zaburzony:
        assert oczekiwana, "zaburzenie nie wyprowadzilo residuum ponad dno — test nic nie mierzy"
        assert wynik.slad_white_box["inicjalizacja"]["residuum_g"] <= wejscie.nastawy.eps_init
        assert korekta["iteracje_newtona"] >= 1
        assert korekta["max_przesuniecie_pu"] > 0.0

    reszta = residuum_algebry(
        probka.model, probka.odbiory, probka.urzadzenia, probka.stany, probka.napiecia
    )
    assert (
        float(np.linalg.norm(reszta)) <= wejscie.nastawy.tolerancja
    ), "probka t = 0 nie spelnia tolerancji algebry biegu"
    assert korekta["residuum_po"] <= wejscie.nastawy.tolerancja
    if not korekta["wykonana"]:
        assert np.array_equal(
            probka.napiecia, punkt_pracy
        ), "punkt na dnie zaokraglen zmieniony — korekta musi byc bitowo pusta"
        assert all(
            np.array_equal(stan, stan_punktu)
            for stan, stan_punktu in zip(probka.stany, stany_punktu, strict=True)
        ), "stany elementow punktu na dnie zmienione — reinicjalizacja musi byc pusta"

    elementy = (*probka.odbiory, *probka.urzadzenia)
    norma_rownowagi = _norma_rownowagi(elementy, probka.stany, probka.napiecia, probka)
    bramka_f = wynik.slad_white_box["inicjalizacja"]["residuum_f"]
    assert norma_rownowagi <= 10.0 * max(bramka_f, JEDNOSTKA_ZAOKRAGLENIA), (
        f"stan t = 0 nie jest rownowaga: max |f| {norma_rownowagi:.3e} wobec {bramka_f:.3e} "
        "w punkcie rozplywu przyjetym przez bramke"
    )
    assert korekta["residuum_f_po"] == pytest.approx(
        norma_rownowagi, rel=10.0 ** (1 - CYFRY_KWANTYZACJI), abs=0.0
    ), "slad korekty podaje inna norme rownowagi niz stan probki"
    # Druga norma bramki na stanie t = 0 — `max |g|` skladowych residuum algebry.
    assert korekta["residuum_g_po"] == pytest.approx(
        float(np.max(np.abs(reszta))), rel=10.0 ** (1 - CYFRY_KWANTYZACJI), abs=0.0
    ), "slad korekty podaje inna norme algebry niz stan probki"
    assert korekta["residuum_g_po"] <= wejscie.nastawy.eps_init
    if zaburzony:
        bez_reinicjalizacji = _norma_rownowagi(elementy, stany_punktu, probka.napiecia, probka)
        assert bez_reinicjalizacji > 10.0 * max(bramka_f, JEDNOSTKA_ZAOKRAGLENIA), (
            "stany punktu pracy sa rownowaga takze w punkcie skorygowanym — przypadek nie "
            "rozroznia reinicjalizacji"
        )
        assert korekta["max_zmiana_mocy_urzadzen_pu"] > 0.0
    # Zmiana mocy urzadzen w sladzie to DOKLADNIE skutek korekty napiec przy stanach punktu
    # pracy: `|V0 conj(I(x, V0)) - V conj(I(x, V))|` — reinicjalizacja zachowuje prad, wiec
    # moc probki `t = 0` jest moca oddawana w punkcie skorygowanym.
    zmiany_mocy = [
        abs(
            complex(probka.napiecia[pozycja])
            * urzadzenie.prad_pu(stan, complex(probka.napiecia[pozycja])).conjugate()
            - complex(punkt_pracy[pozycja])
            * urzadzenie.prad_pu(stan, complex(punkt_pracy[pozycja])).conjugate()
        )
        for urzadzenie, stan in zip(probka.urzadzenia, stany_punktu[liczba_odbiorow:], strict=True)
        if urzadzenie.sprzezenie == "pradowe"
        for pozycja in (probka.model.indeks_wezla[urzadzenie.wezel],)
    ]
    assert korekta["max_zmiana_mocy_urzadzen_pu"] == pytest.approx(
        max(zmiany_mocy), rel=10.0 ** (1 - CYFRY_KWANTYZACJI), abs=0.0
    ), "slad korekty podaje inna zmiane mocy urzadzen niz przesuniecie punktu"
    _sprawdz_odbiory_ze_stanem(wynik, korekta, probka, stany_punktu, punkt_pracy, zaburzony)
    if not ze_zdarzeniem_w_zerze:
        for klucz, szereg in wynik.probki.items():
            if klucz.startswith("jakosc_f@"):
                assert (
                    szereg[0] != JAKOSC_ROZROZNIALNA
                ), f"{klucz}: stan ustalony t = 0 z ROZROZNIALNA odchylka czestotliwosci"


def _sprawdz_odbiory_ze_stanem(
    wynik: Any,
    korekta: dict[str, Any],
    probka: _ProbkaZero,
    stany_punktu: tuple[np.ndarray, ...],
    punkt_pracy: np.ndarray,
    zaburzony: bool,
) -> None:
    """Niezmienniki chwili zero dla ODBIOROW ZE STANEM (estymator czestotliwosci widzianej).

    * odbior przylaczony: stan `t = 0` to `arg V0` PUNKTU SKORYGOWANEGO — dokladnie ten sam
      konstruktor `stan_poczatkowy_odbioru`, co w `t = 0` z rozplywu (rownowaga `e = 0`),
      a czestotliwosc widziana w probce zero jest czestotliwoscia znamionowa DOKLADNIE;
    * odbior odciety (`V = 0` z wiersza ograniczenia): stan bez zmiany bitowo — jeden predykat
      reinicjalizacji z urzadzeniami (napiecie wezla nie zostalo przesuniete);
    * slad: `max_zmiana_kata_estymatorow_rad` = najwieksza zmiana stanu odbioru (klucz
      wylacznie przy odbiorach ze stanem), dodatnia przy punkcie zaburzonym;
    * prad odbioru w stanie `t = 0` jest pradem rozmaitosci rownowagi (`f_hat = f_n`), przy
      ktorym algebra korekty zbiegla.
    """
    ze_stanem = [
        (indeks, odbior) for indeks, odbior in enumerate(probka.odbiory) if odbior.nazwy_stanow
    ]
    if not ze_stanem:
        assert "max_zmiana_kata_estymatorow_rad" not in korekta, (
            "slad biegu bez odbiorow ze stanem zmieniony — klucz estymatorow tylko przy "
            "odbiorach czulych"
        )
        return
    zmiany: list[float] = []
    for indeks, odbior in ze_stanem:
        pozycja = probka.model.indeks_wezla[odbior.wezel]
        napiecie = complex(probka.napiecia[pozycja])
        stan = probka.stany[indeks]
        zmiany.append(float(np.max(np.abs(stan - stany_punktu[indeks]))))
        if not odbior.przylaczony:
            assert napiecie == 0 and complex(punkt_pracy[pozycja]) == 0
            assert np.array_equal(
                stan, stany_punktu[indeks]
            ), f"{odbior.ident}: stan odbioru odcietego ruszony przez korekte t = 0"
            continue
        assert np.array_equal(stan, odbior.stan_poczatkowy_odbioru(napiecie)), (
            f"{odbior.ident}: stan estymatora t = 0 nie jest rownowaga punktu skorygowanego "
            "(x != arg V0)"
        )
        assert odbior.czestotliwosc_widziana_hz(stan, napiecie) == F_BAZOWA_HZ
        assert odbior.prad_pu(stan, napiecie) == pytest.approx(
            odbior.w_rownowadze_estymatora().prad_pu(stan, napiecie), rel=1e-15, abs=1e-300
        )
        assert wynik.probki[f"f_odbioru_hz@{odbior.ident}"][0] == F_BAZOWA_HZ
        assert wynik.probki[f"kat_pomiaru_rad@{odbior.ident}"][0] == float(stan[0])
        if zaburzony:
            assert zmiany[-1] > 0.0, f"{odbior.ident}: zaburzenie nie przesunelo fazy szyny"
    assert korekta["max_zmiana_kata_estymatorow_rad"] == pytest.approx(
        max(zmiany), rel=10.0 ** (1 - CYFRY_KWANTYZACJI), abs=0.0
    ), "slad korekty podaje inna zmiane kata estymatorow niz stany probki"


def _norma_rownowagi(
    elementy: tuple[Any, ...], stany: tuple[np.ndarray, ...], napiecia: np.ndarray, probka: Any
) -> float:
    """`max |f|` stanow, ktore w rownowadze musza miec pochodna zerowa — wprost z protokolu
    elementow stanowych (odbiory ze stanem i urzadzenia), bez kodu bramki silnika."""
    norma = 0.0
    for element, stan in zip(elementy, stany, strict=True):
        pochodne = element.pochodne(
            stan, complex(napiecia[probka.model.indeks_wezla[element.wezel]])
        )
        bez_rownowagi = set(element.stany_bez_rownowagi)
        for nazwa, wartosc in zip(element.nazwy_stanow, pochodne, strict=True):
            if nazwa not in bez_rownowagi:
                norma = max(norma, abs(float(wartosc)))
    return norma


# ---------------------------------------------------------------------------
# Krok roznicy skonczonej pochodnej napiec
# ---------------------------------------------------------------------------

SQRT_U = math.sqrt(JEDNOSTKA_ZAOKRAGLENIA)


def test_krok_wzgledny_pochodnej_to_pierwiastek_jednostki_zaokraglenia() -> None:
    assert obserwable.KROK_WZGLEDNY_POCHODNEJ == SQRT_U


@pytest.mark.parametrize(
    "wzgledne",
    [0.0, 1.0e-300, 1.0e-16, 1.0e-12, 0.5 * SQRT_U, SQRT_U, 2.0 * SQRT_U, 1.0e-3, 0.9],
)
@pytest.mark.parametrize("modul", [1.0, 1.0e-3, 1.0e-9])
def test_skala_kroku_pochodnej_nigdy_nie_zmienia_kierunku_ani_nie_skraca_kroku(
    wzgledne: float, modul: float
) -> None:
    """`s >= 1`, skonczone; przesuniecie wzgledne ponizej `sqrt(u)` wydluzone DOKLADNIE do
    `sqrt(u)` w najbardziej przesunietym wezle; od `sqrt(u)` w gore `s = 1` (bitowo dawna
    roznica skonczona); punkt przesuniety nie przekracza zera fazora w zadnym wezle zywym.

    Iloczyn: {przesuniecie wzgledne: zero, podnormalne, dno zaokraglen, ponizej/na/ponad
    progiem, duze} x {modul napiecia: 1, 1e-3, 1e-9 pu} x {wezel wylaczony z badania z
    wiekszym przesunieciem niz zywe}.
    """
    napiecia = modul * np.exp(1j * np.array([0.1, -0.7, 2.3, 0.0]))
    napiecia[3] = 0.0  # wezel o napieciu narzuconym zerem — wylaczony z badania
    badane = np.array([True, True, True, False])
    niepewnosc = np.array([wzgledne, 0.5 * wzgledne, 0.25 * wzgledne, 1.0]) * modul
    niepewnosc[3] = 1.0  # wylaczony wezel NIE wplywa na skale
    skala = obserwable.skala_kroku_pochodnej(napiecia, niepewnosc, badane)

    assert math.isfinite(skala) and skala >= 1.0
    # Przesuniecie wzgledne liczone z TABLIC (modul `exp(jx)` bywa o ULP mniejszy od 1, wiec
    # parametr `wzgledne` nie jest dokladnie tym, co widzi funkcja — na samym progu decyduje
    # ostatni bit, a regula ma byc spelniona dla wartosci rzeczywistej).
    zywe = badane & (np.abs(napiecia) > 0.0)
    rzeczywiste = float(np.max(niepewnosc[zywe] / np.abs(napiecia[zywe])))
    if 0.0 < rzeczywiste < SQRT_U:
        assert skala * rzeczywiste == pytest.approx(SQRT_U, rel=4.0 * JEDNOSTKA_ZAOKRAGLENIA)
    else:
        assert skala == 1.0
    kierunek = np.exp(1j * np.array([0.4, 1.9, -2.2, 0.0])) * niepewnosc
    przesuniete = napiecia - skala * kierunek
    if wzgledne < 1.0:
        assert np.all(
            np.abs(przesuniete[zywe]) >= np.abs(napiecia[zywe]) * (1.0 - max(wzgledne, SQRT_U))
        )


@pytest.mark.parametrize(
    "niepewnosc_wezla", [math.inf, math.nan], ids=["nieskonczona", "nieokreslona"]
)
def test_skala_kroku_pochodnej_przy_estymacie_nieskonczonej_jest_jednoscia(
    niepewnosc_wezla: float,
) -> None:
    """Estymata nieskonczona albo nieokreslona nie produkuje mnoznika — o niedostepnosci
    rozstrzyga kontrola domeny wolajacego (`u_V` niesk. -> wezly NIEDOSTEPNE)."""
    napiecia = np.array([1.0 + 0.0j, 0.9 - 0.1j])
    niepewnosc = np.array([1.0e-14, niepewnosc_wezla])
    assert obserwable.skala_kroku_pochodnej(napiecia, niepewnosc, np.array([True, True])) == 1.0


def _skladniki_bledu(w: Any) -> list[np.ndarray]:
    """Niezerowe skladniki estymaty bledu w kolejnosci produkcji: `J^-1 psi(r)`, `J^-1 rho`.

    Liczone wprost ze wzoru (`splu` jakobianu), bez kodu estymatora."""
    liczba = w.model.liczba_wezlow
    reszta = residuum_algebry(w.model, w.odbiory, w.urzadzenia, w.stany, w.napiecia)
    granica = np.concatenate(
        (granica_zaokraglen_residuum(w.model, w.odbiory, w.urzadzenia, w.stany, w.napiecia),) * 2
    )
    czesc_pewna = np.sign(reszta) * np.maximum(np.abs(reszta) - granica, 0.0)
    rozklad = sparse_linalg.splu(
        jakobian_algebry(w.model, w.odbiory, w.urzadzenia, w.stany, w.napiecia)
    )
    skladniki = []
    for wektor in (czesc_pewna, granica):
        if not np.any(wektor != 0.0):
            continue
        rozwiazanie = rozklad.solve(wektor)
        skladniki.append(rozwiazanie[:liczba] + 1j * rozwiazanie[liczba:])
    return skladniki


@pytest.mark.parametrize("siec", sorted(SIECI))
def test_krok_roznicy_pochodnej_nigdy_ponizej_pierwiastka_u(
    siec: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Na RZECZYWISTEJ sciezce biegu kazdy punkt, w ktorym liczona jest druga pochodna, lezy
    wzglednie co najmniej `sqrt(u)` od punktu obliczonego (w najbardziej przesunietym wezle
    zywym) — albo dokladnie w swoim skladniku estymaty bledu, gdy ten jest wiekszy. Punktow
    jest tyle, ile niezerowych skladnikow (`J^-1 psi(r)`, `J^-1 rho`): jeden na dnie
    zaokraglen, dwa przy residuum z czescia pewna — i oba rezimy musza wystapic w biegu.
    """
    wywolania = _wywolania(SIECI[siec](), monkeypatch)
    monkeypatch.undo()
    przesuniete: list[np.ndarray] = []
    oryginal = obserwable.pochodna_napiec

    def podsluch(model, odbiory, urzadzenia, stany, napiecia):  # type: ignore[no-untyped-def]
        przesuniete.append(np.array(napiecia, copy=True))
        return oryginal(model, odbiory, urzadzenia, stany, napiecia)

    monkeypatch.setattr(obserwable, "pochodna_napiec", podsluch)
    sprawdzone_wg_liczby_skladnikow = {1: 0, 2: 0}
    for w in wywolania:
        przesuniete.clear()
        pomiar = obserwable.pochodna_napiec_z_niepewnoscia(
            w.model, w.odbiory, w.urzadzenia, w.stany, w.napiecia
        )
        if not np.all(np.isfinite(pomiar.niepewnosc_pochodnej_pu_s)):
            continue
        skladniki = _skladniki_bledu(w)
        assert len(przesuniete) == len(
            skladniki
        ), "liczba roznic skonczonych rozna od liczby niezerowych skladnikow estymaty"
        badane = np.ones(w.model.liczba_wezlow, dtype=bool)
        badane[list(w.model.pozycje_zerowe)] = False
        zywe = badane & (np.abs(w.napiecia) > 0.0)
        for punkt, skladnik in zip(przesuniete, skladniki, strict=True):
            krok = float(np.max(np.abs(w.napiecia[zywe] - punkt[zywe]) / np.abs(w.napiecia[zywe])))
            wlasny = float(np.max(np.abs(skladnik[zywe]) / np.abs(w.napiecia[zywe])))
            assert krok == pytest.approx(max(wlasny, SQRT_U), rel=1.0e-6)
        sprawdzone_wg_liczby_skladnikow[len(skladniki)] += 1
    assert all(
        sprawdzone_wg_liczby_skladnikow.values()
    ), f"bieg nie pokryl obu rezimow residuum: {sprawdzone_wg_liczby_skladnikow}"


@pytest.mark.parametrize("siec", sorted(SIECI))
def test_u_vdot_odporne_na_jednostke_zaokraglenia_w_obliczeniu_pochodnej(
    siec: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Jedna jednostka zaokraglenia szumu w obliczeniu pochodnej przesunietej (w skali
    `||Vdot||_inf`, dwie realizacje: +u i -u) zmienia `u_Vdot` co najwyzej o `RTOL_FIXTUR/10`
    wzglednie — dziesieciokrotny zapas wzgledem kontraktu przenosnosci fikstur, tej samej
    konwencji, ktora wyznaczyla progi komparatora.

    Pomiar (2026-09-30): z wydluzonym krokiem 2,3e-6 (SMIB) i 3,4e-6 (galaz slepa); z dawna
    roznica przy przesunieciu rzedu estymaty na dnie zaokraglen — 0,93-1,0, czyli `u_Vdot`
    bylo w calosci szumem.
    """
    wywolania = _wywolania(SIECI[siec](), monkeypatch)
    monkeypatch.undo()
    oryginal = obserwable.pochodna_napiec

    def z_szumem(znak: float) -> Callable[..., np.ndarray]:
        def pochodna(model, odbiory, urzadzenia, stany, napiecia):  # type: ignore[no-untyped-def]
            wynik = oryginal(model, odbiory, urzadzenia, stany, napiecia)
            wzor = np.where(np.arange(wynik.shape[0]) % 2 == 0, 1.0, -1.0) * (1 + 1j) / math.sqrt(2)
            return wynik + znak * JEDNOSTKA_ZAOKRAGLENIA * float(np.max(np.abs(wynik))) * wzor

        return pochodna

    zmierzone = 0
    for w in wywolania:
        realizacje = []
        for znak in (1.0, -1.0):
            monkeypatch.setattr(obserwable, "pochodna_napiec", z_szumem(znak))
            realizacje.append(
                obserwable.pochodna_napiec_z_niepewnoscia(
                    w.model, w.odbiory, w.urzadzenia, w.stany, w.napiecia
                ).niepewnosc_pochodnej_pu_s
            )
        dodatnia, ujemna = realizacje
        skonczone = np.isfinite(dodatnia) & np.isfinite(ujemna)
        skala = np.maximum(np.abs(dodatnia), np.abs(ujemna))
        wazne = skonczone & (skala > 0.0)
        if not np.any(wazne):
            continue
        zmiana = float(np.max(np.abs(dodatnia[wazne] - ujemna[wazne]) / skala[wazne]))
        assert zmiana <= RTOL_FIXTUR / 10.0, (
            f"u_Vdot zmienia sie o {zmiana:.3e} wzglednie przy szumie jednej jednostki "
            "zaokraglenia w obliczeniu pochodnej"
        )
        zmierzone += 1
    assert zmierzone > 0, "zadne wywolanie nie mialo skonczonej niepewnosci pochodnej"
