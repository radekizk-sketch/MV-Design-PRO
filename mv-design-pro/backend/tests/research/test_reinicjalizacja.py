"""Re-inicjalizacja po zmianie topologii — dowód wykonywalny (plan pre-Fable §1).

DŁUG ZAMYKANY TU (raport §11.3): jedyną drogą do punktu startowego była
`SilnikRMS.inicjalizuj`, czyli rozpływ ustalony. Na topologii zwarciowej liczy
on NOWY punkt pracy i nadpisuje stany dynamiczne — zmierzone ``max Δx0 ≈ 1,09``.
Ten plik najpierw ODTWARZA tę liczbę, a potem pokazuje, że operacja
`reinicjalizuj` jej nie produkuje, bo trzyma stany różniczkowe i rozwiązuje od
nowa wyłącznie algebrę.
"""

from __future__ import annotations

import numpy as np
import pytest
from dynamic_lab.benchmarki import smib
from dynamic_lab.reinicjalizacja import (
    DiagnostykaReinicjalizacji,
    KryteriumReinicjalizacji,
    PowodUzgodnienia,
    ReinicjalizacjaNieudanaError,
    punkt_startowy_algebry,
    reinicjalizuj,
    residuum_kcl,
    residuum_szyn_sztywnych,
)
from dynamic_lab.siec import Galaz, TopologiaSieci
from dynamic_lab.silnik import SilnikRMS
from dynamic_lab.zdarzenia import WylaczenieGalezi, ZdjecieZwarcia, ZwarcieTrojfazowe

KROK_S = 0.004


def _silnik_i_punkt(**kwargs):
    model, moce = smib(**kwargs)
    silnik = SilnikRMS(model, integrator="rk4", krok_s=KROK_S)
    x0 = silnik.inicjalizuj(moce)
    return silnik, x0, moce


def _topologia_zwarciowa(silnik: SilnikRMS, szyna: str = "GEN") -> TopologiaSieci:
    return ZwarcieTrojfazowe(czas_s=0.0, szyna=szyna).zastosuj(silnik.model.topologia)


# ---------------------------------------------------------------------------
# ODTWORZENIE DEFEKTU
# ---------------------------------------------------------------------------


def test_rozplyw_na_topologii_zwarciowej_NIE_DAJE_punktu_startowego() -> None:
    """Odtworzenie defektu z raportu §11.3 — i to w mocniejszej postaci.

    Raport zapisał ``max Δx0 = 1,09421789``, czyli że rozpływowa droga do punktu
    startowego DAJE punkt, tylko inny. Na zwarciu metalicznym na zaciskach
    maszyny jest jeszcze gorzej: rozpływ w ogóle NIE ZBIEGA, bo szuka punktu
    pracy sieci, w której napięcie węzła wymuszono do zera. Jedyna dostępna
    droga do re-inicjalizacji nie działa więc nie „z małym błędem", tylko wcale.

    Ten test NIE pomija się (`skip`), gdy rozpływ odmówi — odmowa JEST mierzoną
    tezą. Pominięty test nie jest dowodem niczego.
    """
    from dynamic_lab.siec import BrakZbieznosciSieciError, SiecOsobliwaError

    silnik, x0_zdrowa, moce = _silnik_i_punkt()
    zwarta = _topologia_zwarciowa(silnik, szyna="GEN")

    silnik.model.topologia = zwarta
    silnik.solver_sieci.ustaw_topologie(zwarta)
    silnik._v_zatwierdzone = None
    try:
        x0_zwarciowa = silnik.inicjalizuj(moce)
    except (BrakZbieznosciSieciError, SiecOsobliwaError, RuntimeError):
        return  # teza potwierdzona: droga rozpływowa nie daje punktu
    delta = float(np.max(np.abs(x0_zwarciowa - x0_zdrowa)))
    assert delta > 1.0e-2, (
        "Rozpływ na topologii zwarciowej albo nie zbiega, albo daje INNY punkt pracy. "
        "Jeżeli robi ani jedno, ani drugie — ten test przestał mierzyć defekt, który opisuje."
    )


def test_reinicjalizacja_DAJE_punkt_tam_gdzie_rozplyw_odmawia() -> None:
    """Druga strona: nowa droga działa dokładnie w warunkach, w których stara pada.

    Bez tego zdania poprzedni test dowodziłby wyłącznie, że zwarcie jest trudne.
    """
    silnik, x0, _ = _silnik_i_punkt()
    wynik = reinicjalizuj(
        silnik, topologia_docelowa=_topologia_zwarciowa(silnik, szyna="GEN"), x_przed=x0
    )
    assert wynik.diagnostyka.residuum_kcl < 1.0e-9
    assert np.array_equal(wynik.x, x0)


def test_norma_f_po_zwarciu_ZGADZA_SIE_Z_POSTACIA_ZAMKNIETA() -> None:
    """WYROCZNIA ANALITYCZNA, nie tylko „liczba wygląda rozsądnie".

    Przy zwarciu metalicznym na zaciskach maszyny moc elektryczna spada do zera,
    a mechaniczna zostaje. Równanie ruchu daje wtedy wprost

        dω/dt = (P_m - P_e) / (2H) = P_m / (2H).

    Dla ``P_m = 0,5`` i ``H = 4 s`` to ``0,0625``. ``||f||_inf`` jest zdominowana
    przez tę współrzędną, więc musi się z nią zgodzić — i to jest sprawdzenie
    FIZYKI re-inicjalizacji, a nie tylko jej spójności numerycznej.
    """
    h_s = 4.0
    p_m = 0.5
    silnik, x0, _ = _silnik_i_punkt(h_s=h_s)
    wynik = reinicjalizuj(
        silnik, topologia_docelowa=_topologia_zwarciowa(silnik, szyna="GEN"), x_przed=x0
    )
    oczekiwane = p_m / (2.0 * h_s)
    assert wynik.diagnostyka.norma_f == pytest.approx(
        oczekiwane, rel=1.0e-3
    ), f"||f|| = {wynik.diagnostyka.norma_f:.6e}, postać zamknięta = {oczekiwane:.6e}"


# ---------------------------------------------------------------------------
# WŁASNOŚĆ PODSTAWOWA: STANY TRZYMANE, ALGEBRA OD NOWA
# ---------------------------------------------------------------------------


def test_reinicjalizacja_TRZYMA_stany_rozniczkowe() -> None:
    """Δx = 0 dokładnie, gdy żaden ogranicznik nie jest naruszony.

    Fizyka: strumień, kąt i prędkość są ciągłe przy idealnym przełączeniu.
    Zero nie jest tu „małą liczbą" — jest dokładną tożsamością, bo nic nie ma
    prawa dotknąć tych współrzędnych.
    """
    silnik, x0, _ = _silnik_i_punkt()
    wynik = reinicjalizuj(silnik, topologia_docelowa=_topologia_zwarciowa(silnik), x_przed=x0)
    assert wynik.diagnostyka.delta_x_max == 0.0
    assert np.array_equal(wynik.x, x0)
    assert wynik.diagnostyka.uzgodnienia == ()


def test_reinicjalizacja_ROZWIAZUJE_algebre_od_nowa() -> None:
    """Napięcia MUSZĄ się zmienić — zwarcie na szynie to inna sieć.

    Druga strona predykatu do testu powyżej: gdyby „trzymanie stanu" objęło też
    algebrę, re-inicjalizacja byłaby nic nierobiącą funkcją tożsamościową.
    """
    silnik, x0, _ = _silnik_i_punkt()
    v_przed = silnik.rozwiaz_siec(x0).copy()
    wynik = reinicjalizuj(silnik, topologia_docelowa=_topologia_zwarciowa(silnik), x_przed=x0)
    assert float(np.max(np.abs(wynik.v - v_przed))) > 1.0e-3


@pytest.mark.parametrize(
    "zdarzenie",
    [
        pytest.param(ZwarcieTrojfazowe(czas_s=0.1, szyna="GEN"), id="zwarcie_GEN"),
        pytest.param(ZwarcieTrojfazowe(czas_s=0.1, szyna="SYS"), id="zwarcie_SYS"),
        pytest.param(WylaczenieGalezi(czas_s=0.1, od_szyny="GEN", do_szyny="SYS"), id="wylaczenie"),
    ],
)
def test_residua_po_reinicjalizacji_mieszcza_sie_w_kryterium(zdarzenie) -> None:
    """ILOCZYN CECH: trzy rodzaje mutacji topologii × komplet residuów.

    Bramkowana jest SPÓJNOŚĆ ALGEBRY (KCL, szyny sztywne), nie równowaga —
    zwarcie z definicji równowagę łamie i to jest fizyka, nie usterka.
    """
    silnik, x0, _ = _silnik_i_punkt()
    docelowa = zdarzenie.zastosuj(silnik.model.topologia)
    wynik = reinicjalizuj(silnik, topologia_docelowa=docelowa, x_przed=x0)
    naruszenia = KryteriumReinicjalizacji().naruszenia(wynik.diagnostyka)
    assert naruszenia == (), naruszenia
    assert wynik.diagnostyka.delta_x_max == 0.0


def test_residuum_kcl_liczone_NIEZALEZNIE_od_solvera() -> None:
    """„Solver zgłosił zbieżność" nie jest sprawdzeniem solvera.

    Sprawdzamy, że `residuum_kcl` naprawdę mierzy ``I - Ybus·V``: dla napięć
    PRZESUNIĘTYCH o stałą residuum musi urosnąć. Gdyby funkcja zwracała liczbę
    solvera, przesunięcie nic by nie zmieniło.
    """
    silnik, x0, _ = _silnik_i_punkt()
    wynik = reinicjalizuj(silnik, topologia_docelowa=_topologia_zwarciowa(silnik), x_przed=x0)
    wstrzykniecia = silnik._wstrzykniecia(wynik.x)
    dobre = residuum_kcl(wynik.topologia, wstrzykniecia(wynik.v), wynik.v)
    zepsute_v = wynik.v + 0.05
    zle = residuum_kcl(wynik.topologia, wstrzykniecia(zepsute_v), zepsute_v)
    assert dobre < 1.0e-9
    assert zle > 1.0e-3


def test_residuum_szyn_sztywnych_wykrywa_zlamanie_warunku() -> None:
    silnik, x0, _ = _silnik_i_punkt()
    wynik = reinicjalizuj(silnik, topologia_docelowa=_topologia_zwarciowa(silnik), x_przed=x0)
    assert residuum_szyn_sztywnych(wynik.topologia, wynik.v) < 1.0e-9
    zepsute = wynik.v.copy()
    zepsute[wynik.topologia.indeks["SYS"]] = complex(0.5, 0.0)
    assert residuum_szyn_sztywnych(wynik.topologia, zepsute) == pytest.approx(0.5)


# ---------------------------------------------------------------------------
# METAMORFIA: A -> B -> A
# ---------------------------------------------------------------------------


def test_cykl_topologii_A_B_A_odtwarza_punkt_A() -> None:
    """Kluczowy test metamorficzny z planu §1.

    Bez upływu czasu między przełączeniami stan różniczkowy się nie zmienia, więc
    para ``(A, x)`` na końcu cyklu jest tą samą parą co na początku. Napięcia
    MUSZĄ wrócić do wartości z A — jeżeli nie wracają, znaczy, że gdzieś siedzi
    stan zależny od drogi, a nie od argumentów.
    """
    silnik, x0, _ = _silnik_i_punkt()
    topologia_a = silnik.model.topologia
    v_a = silnik.rozwiaz_siec(x0).copy()

    w_b = reinicjalizuj(silnik, topologia_docelowa=_topologia_zwarciowa(silnik), x_przed=x0)
    w_a = reinicjalizuj(silnik, topologia_docelowa=topologia_a, x_przed=w_b.x)

    assert np.array_equal(w_a.x, x0), "stan różniczkowy nie wrócił do A"
    assert float(np.max(np.abs(w_a.v - v_a))) < 1.0e-9, "algebra nie wróciła do A"
    # Punkt A był równowagą, więc po pełnym cyklu MUSI nią znowu być.
    assert KryteriumReinicjalizacji(wymagaj_rownowagi=True).naruszenia(w_a.diagnostyka) == ()
    # ...a w środku cyklu (topologia zwarciowa) równowagi NIE MA — bez tego
    # zdania test przechodziłby także dla operacji, która nic nie robi.
    assert w_b.diagnostyka.norma_f > 1.0e-3


def test_dwa_kolejne_zdarzenia_topologiczne() -> None:
    """Zwarcie, potem wyłączenie gałęzi — bez powrotu do stanu zdrowego."""
    model, moce = smib(x_linii_pu=0.15)
    # Druga gałąź, żeby wyłączenie nie odcinało maszyny od systemu.
    model.topologia = TopologiaSieci(
        szyny=model.topologia.szyny,
        galezie=[
            *[
                Galaz(g.od_szyny, g.do_szyny, g.r_pu, g.x_pu, ident="tor-1")
                for g in model.topologia.galezie
            ],
            Galaz("GEN", "SYS", 0.0, 0.30, ident="tor-2"),
        ],
        szyny_sztywne=dict(model.topologia.szyny_sztywne),
    )
    silnik = SilnikRMS(model, integrator="rk4", krok_s=KROK_S)
    x0 = silnik.inicjalizuj(moce)

    po_zwarciu = reinicjalizuj(silnik, topologia_docelowa=_topologia_zwarciowa(silnik), x_przed=x0)
    # ZDJĘCIE ZWARCIA ROBI ZDARZENIE, nie ręczny filtr po boczniku. Pierwsza
    # wersja tego testu filtrowała `zrodlo != "zwarcie"`, a rzeczywisty znacznik
    # to `zwarcie:<szyna>` — filtr nie łapał nic, zwarcie zostawało w sieci i
    # test „po zdjęciu" mierzył układ NADAL ZWARTY. Reużycie zdarzenia zamiast
    # własnej kopii jego semantyki usuwa całą tę klasę pomyłek.
    bez_zwarcia = ZdjecieZwarcia(czas_s=0.15, szyna="GEN").zastosuj(silnik.model.topologia)
    po_zdjeciu = reinicjalizuj(silnik, topologia_docelowa=bez_zwarcia, x_przed=po_zwarciu.x)
    docelowa = po_zdjeciu.topologia.z_wylaczona_galezia_po_id("tor-2")
    po_wylaczeniu = reinicjalizuj(silnik, topologia_docelowa=docelowa, x_przed=po_zdjeciu.x)

    for etap in (po_zwarciu, po_zdjeciu, po_wylaczeniu):
        assert etap.diagnostyka.delta_x_max == 0.0
        assert KryteriumReinicjalizacji().naruszenia(etap.diagnostyka) == ()
    # Zdjęcie zwarcia wraca do topologii, na której punkt BYŁ równowagą — więc
    # tutaj równowagi wolno ZAŻĄDAĆ i musi się utrzymać.
    assert KryteriumReinicjalizacji(wymagaj_rownowagi=True).naruszenia(po_zdjeciu.diagnostyka) == ()


def test_reinicjalizacja_na_TEJ_SAMEJ_topologii_nic_nie_zmienia() -> None:
    """Operacja musi być idempotentna — inaczej „re-inicjalizacja" sama jest zdarzeniem."""
    silnik, x0, _ = _silnik_i_punkt()
    pierwszy = reinicjalizuj(silnik, topologia_docelowa=silnik.model.topologia, x_przed=x0)
    drugi = reinicjalizuj(silnik, topologia_docelowa=pierwszy.topologia, x_przed=pierwszy.x)
    assert np.array_equal(drugi.x, pierwszy.x)
    assert float(np.max(np.abs(drugi.v - pierwszy.v))) < 1.0e-12
    # Ta sama topologia = punkt nadal jest równowagą; tu równowagi ŻĄDAMY.
    assert KryteriumReinicjalizacji(wymagaj_rownowagi=True).naruszenia(drugi.diagnostyka) == ()


# ---------------------------------------------------------------------------
# BRAK UKRYTEJ HISTORII
# ---------------------------------------------------------------------------


def test_wynik_zalezy_WYLACZNIE_od_pary_topologia_stan() -> None:
    """Dwie RÓŻNE drogi do tej samej pary ``(topologia, x)`` → identyczny wynik.

    To jest wykonywalna postać zdania „no history-dependent hidden state". Droga
    pierwsza idzie prosto do B; druga błądzi przez zwarcie na innej szynie i
    wraca. Gdyby cokolwiek w silniku pamiętało drogę (napięcia zatwierdzone jako
    ziarno Newtona, licznik, cache faktoryzacji), te dwa wyniki by się różniły.
    """
    silnik_a, x0, _ = _silnik_i_punkt()
    cel = _topologia_zwarciowa(silnik_a, szyna="GEN")
    prosto = reinicjalizuj(silnik_a, topologia_docelowa=cel, x_przed=x0)

    silnik_b, x0b, _ = _silnik_i_punkt()
    assert np.array_equal(x0b, x0)
    okrezna_topologia = _topologia_zwarciowa(silnik_b, szyna="SYS")
    reinicjalizuj(silnik_b, topologia_docelowa=okrezna_topologia, x_przed=x0b)
    reinicjalizuj(silnik_b, topologia_docelowa=silnik_b.model.topologia, x_przed=x0b)
    okreznie = reinicjalizuj(
        silnik_b,
        topologia_docelowa=_topologia_zwarciowa(silnik_b, szyna="GEN"),
        x_przed=x0b,
    )

    assert np.array_equal(okreznie.x, prosto.x)
    assert float(np.max(np.abs(okreznie.v - prosto.v))) < 1.0e-12
    assert okreznie.diagnostyka.residuum_kcl == pytest.approx(
        prosto.diagnostyka.residuum_kcl, abs=1.0e-15
    )


def test_ziarno_algebry_nie_zalezy_od_historii() -> None:
    """Punkt startowy Newtona wyprowadzony z topologii, nie z poprzedniego biegu."""
    silnik, _, _ = _silnik_i_punkt()
    ziarno = punkt_startowy_algebry(silnik.model.topologia)
    idx = silnik.model.topologia.indeks
    assert ziarno[idx["SYS"]] == complex(1.0, 0.0)
    assert ziarno[idx["GEN"]] == complex(1.0, 0.0)


# ---------------------------------------------------------------------------
# ODMOWA I WYCOFANIE
# ---------------------------------------------------------------------------


def test_nieudana_reinicjalizacja_NIE_zostawia_silnika_w_polowie_zmiany() -> None:
    """Operacja meldująca błąd nie zostawia żadnego skutku.

    Topologia bez drogi do szyny sztywnej jest osobliwa — solver odmawia.
    Sprawdzamy, że po odmowie silnik liczy na topologii SPRZED próby, a nie na
    tej, której nie udało się przyjąć.
    """
    silnik, x0, _ = _silnik_i_punkt()
    przed = silnik.model.topologia
    # Szyna bez gałęzi, bez bocznika i bez urządzenia daje wiersz zerowy w Ybus,
    # czyli macierz osobliwą. To jest odmowa REALNA, nie wymuszona atrapą.
    odcieta = TopologiaSieci(
        szyny=(*przed.szyny, "WISZACA"),
        galezie=list(przed.galezie),
        szyny_sztywne=dict(przed.szyny_sztywne),
    )
    with pytest.raises(ReinicjalizacjaNieudanaError):
        reinicjalizuj(silnik, topologia_docelowa=odcieta, x_przed=x0)
    assert silnik.model.topologia is przed
    assert silnik.solver_sieci.topologia is przed


def test_stan_nieskonczony_odrzucony_na_wejsciu() -> None:
    silnik, x0, _ = _silnik_i_punkt()
    zepsuty = x0.copy()
    zepsuty[0] = float("nan")
    with pytest.raises(Exception, match="stan przed re-inicjalizacją|nieskończ|NaN"):
        reinicjalizuj(silnik, topologia_docelowa=_topologia_zwarciowa(silnik), x_przed=zepsuty)


# ---------------------------------------------------------------------------
# UZGODNIENIA — ZAMKNIĘTY ZBIÓR POWODÓW
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("strona", ["gora", "dol"])
def test_uzgodnienie_tylko_wobec_zadeklarowanego_ogranicznika(strona: str) -> None:
    """Stan poza granicą modelu jest rzutowany — i ZAPISANY z pełnym śladem.

    OBIE GAŁĘZIE, nie jedna. Pierwsza wersja sprawdzała wyłącznie przekroczenie
    GÓRNEJ granicy, więc mutacja wyłączająca gałąź ``wartosc < ogr.dol``
    PRZEŻYŁA: testu dolnej granicy po prostu nie było. Predykat ma dwie strony,
    więc test musi mieć dwie strony.
    """
    from dynamic_lab.calkowanie import OgraniczenieStanu

    silnik, x0, _ = _silnik_i_punkt()
    indeks = 0
    if strona == "gora":
        dol, gora = -10.0, float(x0[indeks]) - 0.25
        oczekiwana = gora
    else:
        dol, gora = float(x0[indeks]) + 0.25, 10.0
        oczekiwana = dol
    silnik._zbierz_ograniczniki = lambda: (  # type: ignore[method-assign]
        OgraniczenieStanu(
            indeks=indeks,
            dol=dol,
            gora=gora,
            nazwa="stan_testowy",
            znaczenie="granica wstrzyknięta testem, żeby sprawdzić ŚLAD uzgodnienia",
        ),
    )
    wynik = reinicjalizuj(silnik, topologia_docelowa=_topologia_zwarciowa(silnik), x_przed=x0)
    assert len(wynik.diagnostyka.uzgodnienia) == 1
    uz = wynik.diagnostyka.uzgodnienia[0]
    assert uz.powod is PowodUzgodnienia.OGRANICZNIK_STANU
    assert uz.po == pytest.approx(oczekiwana)
    assert uz.skok == pytest.approx(0.25)
    assert uz.znaczenie
    assert wynik.diagnostyka.delta_x_max == pytest.approx(0.25)


def test_zbior_powodow_uzgodnienia_jest_ZAMKNIETY() -> None:
    """Deklaracja bez testu to fałszywa pewność — więc zbiór jest przypięty.

    Dopisanie powodu wymaga podania równania wymuszającego skok stanu; ten test
    pilnuje, żeby nie stało się to przy okazji.
    """
    assert [p.value for p in PowodUzgodnienia] == ["ogranicznik_stanu"]


def test_diagnostyka_jest_serializowalna_i_kompletna() -> None:
    """Uprząż kwalifikacyjna czyta JSON — brak pola tam to brak dowodu."""
    silnik, x0, _ = _silnik_i_punkt()
    wynik = reinicjalizuj(silnik, topologia_docelowa=_topologia_zwarciowa(silnik), x_przed=x0)
    slownik = wynik.diagnostyka.jako_slownik()
    for pole in (
        "delta_x_max",
        "delta_y_max",
        "norma_f",
        "norma_f_zasobowa",
        "norma_g",
        "residuum_kcl",
        "residuum_napiecia_szyn",
        "iteracje_sieci",
        "uzgodnienia",
    ):
        assert pole in slownik, pole
    import json

    json.dumps(slownik)


def test_kryterium_wykrywa_kazde_z_trzech_residuow() -> None:
    """Trzy progi, trzy osobne naruszenia — żaden nie jest ozdobą."""
    kryterium = KryteriumReinicjalizacji()
    baza = {
        "delta_x_max": 0.0,
        "delta_x_per_stan": (),
        "delta_y_max": 0.0,
        "delta_y_per_szyna": (),
        "norma_f": 0.0,
        "norma_f_zasobowa": 0.0,
        "norma_g": 0.0,
        "residuum_kcl": 0.0,
        "residuum_napiecia_szyn": 0.0,
        "uzgodnienia": (),
        "iteracje_sieci": 1,
    }
    assert kryterium.naruszenia(DiagnostykaReinicjalizacji(**baza)) == ()
    for pole, wartosc in (
        ("residuum_kcl", 1.0),
        ("residuum_napiecia_szyn", 1.0),
        ("norma_f", float("nan")),
        ("residuum_kcl", float("inf")),
    ):
        assert kryterium.naruszenia(DiagnostykaReinicjalizacji(**{**baza, pole: wartosc})), (
            pole,
            wartosc,
        )
    # ``norma_f`` jest MIERZONA zawsze, a BRAMKOWANA tylko na żądanie: po zwarciu
    # równowagi nie ma i nie może być (patrz docstring kryterium).
    poza_rownowaga = DiagnostykaReinicjalizacji(**{**baza, "norma_f": 1.0})
    assert kryterium.naruszenia(poza_rownowaga) == ()
    assert KryteriumReinicjalizacji(wymagaj_rownowagi=True).naruszenia(poza_rownowaga)


# ---------------------------------------------------------------------------
# WZMOCNIENIA PO KONTROLI MUTACYJNEJ
# (trzy mutacje PRZEŻYŁY pierwszą wersję tych testów — patrz docstringi)
# ---------------------------------------------------------------------------


def _siec_z_odbiorem_stalej_mocy():
    """Sieć z odbiorem o stałej mocy — algebra z DWOMA pierwiastkami.

    Po co osobny przypadek: na SMIB algebra ma jedno rozwiązanie, więc Newton
    dochodzi do niego z DOWOLNEGO ziarna. Taki benchmark nie potrafi odróżnić
    ziarna wyprowadzonego z topologii od ziarna wziętego z historii — i dlatego
    mutacja „seeduj z poprzedniego biegu" przeżyła pierwszą wersję testu.
    Odbiór o stałej mocy daje klasyczną parę rozwiązań (gałąź wysokonapięciowa i
    niskonapięciowa); ziarno decyduje, do którego się zbiegnie.
    """
    from dynamic_lab.silnik import ModelDynamiczny
    from dynamic_lab.urzadzenia import OdbiorStalejMocy

    topo = TopologiaSieci(
        szyny=("SYS", "ODB"),
        galezie=[Galaz("SYS", "ODB", r_pu=0.02, x_pu=0.20)],
        szyny_sztywne={"SYS": complex(1.0, 0.0)},
    )
    odbior = OdbiorStalejMocy(ref="L1", szyna="ODB", p_pu=-0.6, q_pu=-0.2)
    return ModelDynamiczny(topologia=topo, urzadzenia=[odbior])


def test_ziarno_NIE_pochodzi_z_historii_gdy_algebra_ma_dwa_pierwiastki() -> None:
    """Zabija mutację „seeduj Newtona napięciami poprzedniego biegu".

    Zatruwamy `_v_zatwierdzone` gałęzią niskonapięciową. Gdyby
    `reinicjalizuj` brało stamtąd ziarno, zbiegłoby do rozwiązania
    niskonapięciowego — fizycznie istniejącego, ale INNEGO niż punkt pracy.
    Ziarno wyprowadzone z topologii daje gałąź wysokonapięciową niezależnie od
    tego, co zostało w silniku po poprzednim biegu.
    """
    silnik = SilnikRMS(_siec_z_odbiorem_stalej_mocy(), integrator="rk4", krok_s=KROK_S)
    x = np.zeros(0, dtype=float)
    zdrowe = reinicjalizuj(silnik, topologia_docelowa=silnik.model.topologia, x_przed=x)
    idx = silnik.model.topologia.indeks
    assert abs(zdrowe.v[idx["ODB"]]) > 0.8, "punkt odniesienia miał być gałęzią wysokonapięciową"

    silnik._v_zatwierdzone = np.array([complex(1.0, 0.0), complex(0.12, 0.0)])
    po_zatruciu = reinicjalizuj(silnik, topologia_docelowa=silnik.model.topologia, x_przed=x)
    assert abs(po_zatruciu.v[idx["ODB"]]) == pytest.approx(
        abs(zdrowe.v[idx["ODB"]]), abs=1.0e-12
    ), "ziarno Newtona przeciekło z historii silnika"


def test_residuum_kcl_w_diagnostyce_jest_LICZONE_a_nie_przepisane_z_solvera() -> None:
    """Zabija mutację ``kcl = rozwiazanie.residuum``.

    Solver podstawiony w tym teście MELDUJE zbieżność idealną (``residuum=0``),
    ale zwraca napięcia przesunięte o stałą — czyli kłamie. Diagnostyka liczona
    niezależnie musi to zobaczyć; diagnostyka przepisana z solvera powtórzyłaby
    jego zero. Pierwsza wersja testu wołała `residuum_kcl` wprost, więc w ogóle
    nie dotykała miejsca, w którym ta liczba trafia do wyniku.
    """
    silnik, x0, _ = _silnik_i_punkt()
    prawdziwy_rozwiaz = silnik.solver_sieci.rozwiaz

    def klamliwy(wstrzykniecia, v_start, **kwargs):
        wynik = prawdziwy_rozwiaz(wstrzykniecia, v_start, **kwargs)
        from dataclasses import replace

        return replace(wynik, napiecia=wynik.napiecia + 0.05, residuum=0.0)

    silnik.solver_sieci.rozwiaz = klamliwy  # type: ignore[method-assign]
    wynik = reinicjalizuj(silnik, topologia_docelowa=silnik.model.topologia, x_przed=x0)
    assert (
        wynik.diagnostyka.norma_g == 0.0
    ), "solver miał zameldować zero — inaczej test nie mierzy tezy"
    assert (
        wynik.diagnostyka.residuum_kcl > 1.0e-3
    ), "residuum KCL przepisano z solvera zamiast policzyć niezależnie"
    assert KryteriumReinicjalizacji().naruszenia(
        wynik.diagnostyka
    ), "kryterium musi odrzucić bieg, w którym niezależne KCL nie domyka się"
