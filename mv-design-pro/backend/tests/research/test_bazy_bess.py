"""Audyt baz magazynu urządzenie↔sieć — dowód wykonywalny (plan pre-Fable §2).

CO TU JEST NOWEGO WOBEC `test_bilans_energii_magazynu.py`. Tamten plik sprawdza
RÓWNANIE SOC: czy energia oddana pochodzi z zasobu. To za mało, bo równanie SOC
może być poprawne, a przelicznik między bazą urządzenia a bazą sieci może
siedzieć w kilku miejscach naraz. Wtedy ta sama bateria zachowuje się inaczej
dlatego, że ktoś wybrał inne ``S_bazowa`` — a równanie SOC nie drgnie i żaden
test tego równania tego nie zobaczy.

TEZA MIERZONA TUTAJ: trajektoria FIZYCZNA (``SOC(t)`` i ``P(t)`` w MW) jest
NIEZALEŻNA od wyboru bazy mocy sieci, o ile wszystkie wielkości p.u. przeliczono
na nową bazę. Baza jest umową rachunkową, nie fizyką.
"""

from __future__ import annotations

import numpy as np
import pytest
from dynamic_lab.bazy_bess import (
    PIERWIASTEK_Z_TRZECH,
    SEKUND_W_GODZINIE,
    LancuchBazBESS,
    NiespojnaBazaError,
    audytuj_spojnosc_krokow,
    waga_sprawnosci,
)
from dynamic_lab.siec import Galaz, TopologiaSieci
from dynamic_lab.silnik import ModelDynamiczny, SilnikRMS
from dynamic_lab.urzadzenia_oze import MagazynEnergiiBESS
from dynamic_lab.wynik import PrzestrzenSygnalu

#: Układ FIZYCZNY, wyrażany dalej na różnych bazach — wielkości w jednostkach SI.
S_ZNAMIONOWA_MVA = 20.0
V_ZNAMIONOWE_KV = 0.69
V_SIECI_KV = 15.0
E_POJEMNOSC_MWH = 0.010
MOC_ROBOCZA_MW = 10.0

KROK_S = 0.0025
CZAS_KONCOWY_S = 3.0


def _lancuch(s_bazowa_sieci_mva: float) -> LancuchBazBESS:
    return LancuchBazBESS(
        s_bazowa_sieci_mva=s_bazowa_sieci_mva,
        v_bazowa_sieci_kv=V_SIECI_KV,
        s_znamionowa_urzadzenia_mva=S_ZNAMIONOWA_MVA,
        v_znamionowe_urzadzenia_kv=V_ZNAMIONOWE_KV,
        e_pojemnosc_mwh=E_POJEMNOSC_MWH,
    )


def _bieg_na_bazie(
    s_bazowa_sieci_mva: float,
    *,
    moc_robocza_mw: float = MOC_ROBOCZA_MW,
    sprawnosc_rozladowania: float = 1.0,
    sprawnosc_ladowania: float = 1.0,
    dt: float = KROK_S,
) -> dict[str, np.ndarray | float]:
    """TEN SAM układ fizyczny, wyrażony na zadanej bazie mocy sieci.

    Wszystko, co jest p.u., przeliczamy z wielkości FIZYCZNYCH przez łańcuch —
    nie przepisujemy liczb p.u. między bazami ręcznie. O to właśnie chodzi: gdy
    droga jest jedna, zmiana bazy nie ma jak przeciec do fizyki.
    """
    lancuch = _lancuch(s_bazowa_sieci_mva)
    magazyn = MagazynEnergiiBESS(
        ref="BAT",
        szyna="BAT",
        e_pojemnosc_mwh=lancuch.e_pojemnosc_mwh,
        s_bazowa_mva=lancuch.s_bazowa_sieci_mva,
        s_falownika_pu=lancuch.s_falownika_pu,
        soc_poczatkowy=0.5,
        sprawnosc_rozladowania=sprawnosc_rozladowania,
        sprawnosc_ladowania=sprawnosc_ladowania,
    )
    topologia = TopologiaSieci(
        szyny=("BAT", "SYS"),
        galezie=[Galaz("BAT", "SYS", 0.01, 0.05)],
        szyny_sztywne={"SYS": complex(1.0, 0.0)},
    )
    model = ModelDynamiczny(
        topologia=topologia, urzadzenia=[magazyn], s_bazowa_mva=lancuch.s_bazowa_sieci_mva
    )
    silnik = SilnikRMS(model, integrator="rk4", krok_s=dt)
    p_pu = lancuch.moc_pu(moc_robocza_mw)
    x0 = silnik.inicjalizuj({"BAT": complex(p_pu, 0.0)})
    wynik = silnik.symuluj(x0, czas_koncowy_s=CZAS_KONCOWY_S)

    czas = np.asarray(wynik.czas_s, dtype=np.float64)
    soc = np.asarray(wynik.sygnal("soc", "BAT", PrzestrzenSygnalu.STAN).wartosci, dtype=np.float64)
    p_ac_pu = np.asarray(
        wynik.sygnal("p_pu", "BAT", PrzestrzenSygnalu.WYJSCIE).wartosci, dtype=np.float64
    )
    return {
        "lancuch": lancuch,
        "czas": czas,
        "soc": soc,
        "p_ac_pu": p_ac_pu,
        "p_ac_mw": p_ac_pu * s_bazowa_sieci_mva,
    }


# ---------------------------------------------------------------------------
# ŁAŃCUCH: WYPROWADZENIA WYMIAROWE
# ---------------------------------------------------------------------------


def test_bazy_wyprowadzone_zgadzaja_sie_z_postacia_zamknieta() -> None:
    """Każda baza pochodna sprawdzona wzorem, nie „wygląda sensownie\"."""
    lancuch = _lancuch(100.0)
    assert lancuch.i_bazowy_sieci_ka == pytest.approx(100.0 / (PIERWIASTEK_Z_TRZECH * V_SIECI_KV))
    assert lancuch.i_bazowy_urzadzenia_ka == pytest.approx(
        S_ZNAMIONOWA_MVA / (PIERWIASTEK_Z_TRZECH * V_ZNAMIONOWE_KV)
    )
    assert lancuch.z_bazowa_sieci_ohm == pytest.approx(V_SIECI_KV**2 / 100.0)
    assert lancuch.s_falownika_pu == pytest.approx(S_ZNAMIONOWA_MVA / 100.0)


def test_moc_w_obie_strony_jest_bijekcja() -> None:
    lancuch = _lancuch(100.0)
    for p_mw in (-25.0, 0.0, 7.5, 20.0):
        assert lancuch.moc_mw(lancuch.moc_pu(p_mw)) == pytest.approx(p_mw, rel=1e-15)


def test_dwa_wejscia_do_dsoc_dt_daja_te_sama_liczbe() -> None:
    """Deklaracja „jedna droga\" bez testu jest fałszywą pewnością."""
    lancuch = _lancuch(100.0)
    for p_pu in (-0.3, -0.05, 0.0, 0.2, 0.5):
        waga = waga_sprawnosci(p_pu, sprawnosc_rozladowania=0.95, sprawnosc_ladowania=0.9)
        assert lancuch.dsoc_dt_z_mocy_pu(p_pu, waga) == pytest.approx(
            lancuch.dsoc_dt_z_mocy_mw(lancuch.moc_mw(p_pu), waga), rel=1e-15
        )


def test_dsoc_dt_liczone_z_mocy_fizycznej_NIE_ZAWIERA_bazy() -> None:
    """Sedno niezmienniczości — sprawdzone na samym przeliczniku.

    ``dSOC/dt`` wyrażone przez MW nie ma prawa zależeć od ``S_bazowa``. Jeżeli
    zależy, to znaczy, że baza wsiąkła w fizykę.
    """
    waga = 1.0
    for p_mw in (-8.0, 3.0, 12.0):
        wartosci = {
            baza: _lancuch(baza).dsoc_dt_z_mocy_mw(p_mw, waga)
            for baza in (1.0, 10.0, 100.0, 1000.0)
        }
        assert len({round(v, 15) for v in wartosci.values()}) == 1, wartosci


def test_model_BESS_zgadza_sie_z_LANCUCHEM_a_nie_ma_wlasnego_przelicznika() -> None:
    """Model i łańcuch liczą to samo — to jest kontrola „bez drugiej kopii\".

    Gdyby `MagazynEnergiiBESS` miał własny mnożnik (inne 3600, brakujące
    ``S_bazowa``, kW zamiast MW), ta równość by pękła. Test porównuje pochodną
    SOC zwróconą przez MODEL z wartością z łańcucha.
    """
    for s_bazowa in (20.0, 100.0):
        lancuch = _lancuch(s_bazowa)
        magazyn = MagazynEnergiiBESS(
            ref="BAT",
            szyna="BAT",
            e_pojemnosc_mwh=lancuch.e_pojemnosc_mwh,
            s_bazowa_mva=lancuch.s_bazowa_sieci_mva,
            s_falownika_pu=lancuch.s_falownika_pu,
        )
        napiecie = complex(1.0, 0.0)
        p_pu = lancuch.moc_pu(MOC_ROBOCZA_MW)
        x = magazyn.inicjalizuj(napiecie, complex(p_pu, 0.0))
        d_soc_modelu = float(magazyn.pochodne(x, napiecie)[2])
        d_soc_lancucha = lancuch.dsoc_dt_z_mocy_pu(p_pu, 1.0)
        assert d_soc_modelu == pytest.approx(
            d_soc_lancucha, rel=1e-12
        ), f"S_bazowa={s_bazowa}: model {d_soc_modelu:.6e} vs łańcuch {d_soc_lancucha:.6e}"


# ---------------------------------------------------------------------------
# NIEZMIENNICZOŚĆ WOBEC ZMIANY BAZY — NA REALNYCH BIEGACH
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("mnoznik", [0.1, 0.5, 2.0, 10.0])
def test_trajektoria_fizyczna_NIEZMIENNA_przy_zmianie_bazy_mocy(mnoznik: float) -> None:
    """S_base ×10 i /10 z planu §2 — plus dwa szczeble pośrednie.

    Porównujemy WIELKOŚCI FIZYCZNE: ``SOC(t)`` (bezwymiarowy) i ``P(t)`` w MW.
    Wielkości p.u. porównywać nie wolno — one MAJĄ się zmienić, to jest sens
    zmiany bazy.
    """
    odniesienie = _bieg_na_bazie(100.0)
    zmieniona = _bieg_na_bazie(100.0 * mnoznik)

    assert np.array_equal(odniesienie["czas"], zmieniona["czas"])
    roznica_soc = float(np.max(np.abs(odniesienie["soc"] - zmieniona["soc"])))
    roznica_mw = float(np.max(np.abs(odniesienie["p_ac_mw"] - zmieniona["p_ac_mw"])))
    assert roznica_soc < 1.0e-12, f"SOC zależy od bazy: max Δ = {roznica_soc:.3e}"
    assert roznica_mw < 1.0e-9, f"moc [MW] zależy od bazy: max Δ = {roznica_mw:.3e}"


def test_moc_w_pu_ZMIENIA_SIE_przy_zmianie_bazy() -> None:
    """Druga strona predykatu.

    Bez tego zdania poprzedni test przechodziłby także dla implementacji, która
    ignoruje bazę całkowicie — a wtedy p.u. nic by nie znaczyło.
    """
    odniesienie = _bieg_na_bazie(100.0)
    dziesieciokrotna = _bieg_na_bazie(1000.0)
    assert float(np.max(np.abs(odniesienie["p_ac_pu"]))) == pytest.approx(
        10.0 * float(np.max(np.abs(dziesieciokrotna["p_ac_pu"]))), rel=1e-9
    )


@pytest.mark.parametrize(("eta_roz", "eta_lad"), [(1.0, 1.0), (0.95, 0.92), (0.88, 0.99)])
def test_niezmienniczosc_bazy_takze_ze_sprawnosciami(eta_roz: float, eta_lad: float) -> None:
    """ILOCZYN CECH: zmiana bazy × niezerowe straty.

    Sprawności wchodzą w ten sam tor co baza, więc pomyłka mnożnika mogłaby się
    ujawnić dopiero przy ``η != 1``.
    """
    a = _bieg_na_bazie(100.0, sprawnosc_rozladowania=eta_roz, sprawnosc_ladowania=eta_lad)
    b = _bieg_na_bazie(10.0, sprawnosc_rozladowania=eta_roz, sprawnosc_ladowania=eta_lad)
    assert float(np.max(np.abs(a["soc"] - b["soc"]))) < 1.0e-12


def test_niezmienniczosc_takze_przy_ladowaniu() -> None:
    """Kierunek ujemny ma własną gałąź sprawności — więc własny test."""
    a = _bieg_na_bazie(100.0, moc_robocza_mw=-8.0, sprawnosc_ladowania=0.9)
    b = _bieg_na_bazie(25.0, moc_robocza_mw=-8.0, sprawnosc_ladowania=0.9)
    assert float(np.max(np.abs(a["soc"] - b["soc"]))) < 1.0e-12
    assert a["soc"][-1] > a["soc"][0], "ładowanie ma PODNOSIĆ soc"


def test_alternatywna_moc_znamionowa_urzadzenia_daje_inna_moc_pu_ale_te_sama_fizyke() -> None:
    """„alternative device rating\" z planu §2.

    Ta sama moc robocza [MW] na magazynie o innej mocy znamionowej to ten sam
    punkt pracy sieci, ale inne wykorzystanie przekształtnika. ``s_falownika_pu``
    MUSI się zmienić, a ``dSOC/dt`` — nie, bo zależy od mocy i pojemności, a nie
    od tego, jak duży jest falownik.
    """
    maly = LancuchBazBESS(
        s_bazowa_sieci_mva=100.0,
        v_bazowa_sieci_kv=V_SIECI_KV,
        s_znamionowa_urzadzenia_mva=12.0,
        v_znamionowe_urzadzenia_kv=V_ZNAMIONOWE_KV,
        e_pojemnosc_mwh=E_POJEMNOSC_MWH,
    )
    duzy = LancuchBazBESS(
        s_bazowa_sieci_mva=100.0,
        v_bazowa_sieci_kv=V_SIECI_KV,
        s_znamionowa_urzadzenia_mva=40.0,
        v_znamionowe_urzadzenia_kv=V_ZNAMIONOWE_KV,
        e_pojemnosc_mwh=E_POJEMNOSC_MWH,
    )
    assert maly.s_falownika_pu != duzy.s_falownika_pu
    assert maly.dsoc_dt_z_mocy_mw(MOC_ROBOCZA_MW, 1.0) == pytest.approx(
        duzy.dsoc_dt_z_mocy_mw(MOC_ROBOCZA_MW, 1.0), rel=1e-15
    )


def test_alternatywny_poziom_napiecia_zmienia_WYLACZNIE_baze_pradu() -> None:
    """„alternative voltage level\" z planu §2 — z jawnym zakresem.

    W tym laboratorium sieć liczy na JEDNEJ bazie napięcia, więc poziom napięcia
    nie wchodzi do równania SOC. Wchodzi do bazy PRĄDU i impedancji — i tam jest
    sprawdzany. Twierdzenie „napięcie nie ma wpływu\" byłoby fałszywe bez tego
    rozróżnienia.
    """
    a = _lancuch(100.0)
    b = LancuchBazBESS(
        s_bazowa_sieci_mva=100.0,
        v_bazowa_sieci_kv=2.0 * V_SIECI_KV,
        s_znamionowa_urzadzenia_mva=S_ZNAMIONOWA_MVA,
        v_znamionowe_urzadzenia_kv=V_ZNAMIONOWE_KV,
        e_pojemnosc_mwh=E_POJEMNOSC_MWH,
    )
    assert b.i_bazowy_sieci_ka == pytest.approx(a.i_bazowy_sieci_ka / 2.0)
    assert b.z_bazowa_sieci_ohm == pytest.approx(4.0 * a.z_bazowa_sieci_ohm)
    assert b.dsoc_dt_z_mocy_mw(MOC_ROBOCZA_MW, 1.0) == pytest.approx(
        a.dsoc_dt_z_mocy_mw(MOC_ROBOCZA_MW, 1.0), rel=1e-15
    )


def test_na_baze_sieci_zachowuje_wielkosci_FIZYCZNE() -> None:
    a = _lancuch(100.0)
    b = a.na_baze_sieci(37.0)
    assert b.s_znamionowa_urzadzenia_mva == a.s_znamionowa_urzadzenia_mva
    assert b.e_pojemnosc_mwh == a.e_pojemnosc_mwh
    assert b.v_bazowa_sieci_kv == a.v_bazowa_sieci_kv
    assert b.s_falownika_pu != a.s_falownika_pu


# ---------------------------------------------------------------------------
# AUDYT SPÓJNOŚCI KROKÓW
# ---------------------------------------------------------------------------


def test_audyt_krokow_nie_zglasza_nic_na_poprawnym_biegu() -> None:
    bieg = _bieg_na_bazie(100.0)
    niespojnosci = audytuj_spojnosc_krokow(
        bieg["lancuch"],
        czasy_s=list(bieg["czas"]),
        p_pu=list(bieg["p_ac_pu"]),
        soc=list(bieg["soc"]),
        sprawnosc_rozladowania=1.0,
        sprawnosc_ladowania=1.0,
    )
    assert niespojnosci == (), niespojnosci[:3]


def test_audyt_krokow_WYKRYWA_przeskalowany_przebieg_soc() -> None:
    """Kontrola bazowa audytu: przebieg z zepsutym mnożnikiem musi zostać złapany."""
    bieg = _bieg_na_bazie(100.0)
    zepsuty_soc = bieg["soc"][0] + (bieg["soc"] - bieg["soc"][0]) * 2.0
    niespojnosci = audytuj_spojnosc_krokow(
        bieg["lancuch"],
        czasy_s=list(bieg["czas"]),
        p_pu=list(bieg["p_ac_pu"]),
        soc=list(zepsuty_soc),
        sprawnosc_rozladowania=1.0,
        sprawnosc_ladowania=1.0,
    )
    assert niespojnosci, "audyt przepuścił przebieg SOC przeskalowany dwukrotnie"


# ---------------------------------------------------------------------------
# MUTACJE WYMAGANE PLANEM §2 — KAŻDA MUSI ZOSTAĆ ZABITA
# ---------------------------------------------------------------------------


def _d_soc_modelu(magazyn: MagazynEnergiiBESS, p_pu: float) -> float:
    napiecie = complex(1.0, 0.0)
    x = magazyn.inicjalizuj(napiecie, complex(p_pu, 0.0))
    return float(magazyn.pochodne(x, napiecie)[2])


@pytest.mark.parametrize(
    ("nazwa", "zepsuj"),
    [
        (
            "brak_czynnika_S_bazowa",
            lambda lancuch, p_pu, waga: -p_pu * waga / SEKUND_W_GODZINIE / lancuch.e_pojemnosc_mwh,
        ),
        (
            "podwojny_czynnik_S_bazowa",
            lambda lancuch, p_pu, waga: -p_pu
            * lancuch.s_bazowa_sieci_mva**2
            * waga
            / SEKUND_W_GODZINIE
            / lancuch.e_pojemnosc_mwh,
        ),
        (
            "kW_zamiast_MW",
            lambda lancuch, p_pu, waga: -p_pu
            * lancuch.s_bazowa_sieci_mva
            * 1000.0
            * waga
            / SEKUND_W_GODZINIE
            / lancuch.e_pojemnosc_mwh,
        ),
        (
            "zly_czynnik_3600",
            lambda lancuch, p_pu, waga: -p_pu
            * lancuch.s_bazowa_sieci_mva
            * waga
            / 60.0
            / lancuch.e_pojemnosc_mwh,
        ),
        (
            "odwrocony_znak",
            lambda lancuch, p_pu, waga: +p_pu
            * lancuch.s_bazowa_sieci_mva
            * waga
            / SEKUND_W_GODZINIE
            / lancuch.e_pojemnosc_mwh,
        ),
    ],
)
def test_mutacja_przelicznika_jest_wykrywana(nazwa: str, zepsuj) -> None:
    """Pięć mutacji mnożnika z planu §2 — każda musi rozjechać się z modelem.

    Mutacja jest tu wstrzykiwana W ŁAŃCUCH (wzór zastępczy), a porównywana z
    pochodną liczoną przez MODEL. Gdyby przelicznik był w modelu tylko jeden i
    zgodny z łańcuchem, każda z tych postaci musi dać INNĄ liczbę — inaczej
    znaczy, że łańcuch i model liczą coś, czego mnożnik nie dotyczy.
    """
    lancuch = _lancuch(100.0)
    magazyn = MagazynEnergiiBESS(
        ref="BAT",
        szyna="BAT",
        e_pojemnosc_mwh=lancuch.e_pojemnosc_mwh,
        s_bazowa_mva=lancuch.s_bazowa_sieci_mva,
        s_falownika_pu=lancuch.s_falownika_pu,
    )
    p_pu = lancuch.moc_pu(MOC_ROBOCZA_MW)
    prawidlowe = _d_soc_modelu(magazyn, p_pu)
    zmutowane = zepsuj(lancuch, p_pu, 1.0)
    assert prawidlowe != pytest.approx(
        zmutowane, rel=1e-9
    ), f'mutacja „{nazwa}" NIE zmienia wyniku — przelicznik nie jest sprawdzany'


@pytest.mark.parametrize("kierunek", ["rozladowanie", "ladowanie"])
def test_mutacja_sprawnosci_jest_wykrywana(kierunek: str) -> None:
    """Dwie ostatnie mutacje z planu §2: zła sprawność ładowania / rozładowania.

    Sprawność wchodzi TYLKO do jednej gałęzi znaku, więc pomyłka jest widoczna
    wyłącznie w tej gałęzi — dlatego obie są sprawdzane osobno.
    """
    p_mw = 10.0 if kierunek == "rozladowanie" else -10.0
    p_pu = _lancuch(100.0).moc_pu(p_mw)
    poprawna = waga_sprawnosci(p_pu, sprawnosc_rozladowania=0.9, sprawnosc_ladowania=0.8)
    zamieniona = waga_sprawnosci(p_pu, sprawnosc_rozladowania=0.8, sprawnosc_ladowania=0.9)
    assert poprawna != pytest.approx(zamieniona, rel=1e-9)
    # ...i że gałąź jest ta, o której mówimy:
    if kierunek == "rozladowanie":
        assert poprawna == pytest.approx(1.0 / 0.9)
    else:
        assert poprawna == pytest.approx(0.8)


def test_waga_sprawnosci_na_zerze_idzie_galezia_ladowania() -> None:
    """Przypadek brzegowy ``P = 0`` ma być rozstrzygnięty jawnie, a nie przypadkiem."""
    assert waga_sprawnosci(0.0, sprawnosc_rozladowania=0.5, sprawnosc_ladowania=0.7) == 0.7


# ---------------------------------------------------------------------------
# FAIL-CLOSED NA DANYCH BAZY
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "pole",
    [
        "s_bazowa_sieci_mva",
        "v_bazowa_sieci_kv",
        "s_znamionowa_urzadzenia_mva",
        "v_znamionowe_urzadzenia_kv",
        "e_pojemnosc_mwh",
    ],
)
@pytest.mark.parametrize("zla_wartosc", [0.0, -1.0, float("nan"), float("inf")])
def test_baza_niepoprawna_odmawia(pole: str, zla_wartosc: float) -> None:
    """ILOCZYN CECH: pięć pól × cztery wartości spoza dziedziny.

    Baza równa zeru dzieli przez zero, ujemna odwraca znak fizyki, NaN rozlewa
    się na cały przebieg. Żadna z nich nie ma prawa dać obiektu.
    """
    argumenty = {
        "s_bazowa_sieci_mva": 100.0,
        "v_bazowa_sieci_kv": V_SIECI_KV,
        "s_znamionowa_urzadzenia_mva": S_ZNAMIONOWA_MVA,
        "v_znamionowe_urzadzenia_kv": V_ZNAMIONOWE_KV,
        "e_pojemnosc_mwh": E_POJEMNOSC_MWH,
    }
    argumenty[pole] = zla_wartosc
    with pytest.raises(NiespojnaBazaError):
        LancuchBazBESS(**argumenty)


# ---------------------------------------------------------------------------
# ZAKAZ POWIELONEGO SKALOWANIA — jeden przelicznik, dwóch konsumentów
# ---------------------------------------------------------------------------


def test_granica_waznosci_kroku_i_pochodna_SOC_licza_z_JEDNEGO_przelicznika() -> None:
    """Defekt wykryty kontrolą mutacyjną w tej rundzie.

    Wyrażenie ``s_bazowa_mva / (3600 · e_pojemnosc_mwh)`` stało w modelu DWA
    RAZY: w pochodnej ``d_soc`` i w `krok_maksymalny_s`. Mutacja usuwająca
    ``s_bazowa_mva`` z jednego z tych miejsc zabijała tylko część testów, bo
    drugie liczyło nadal poprawnie. Rozjazd byłby wyjątkowo podstępny: granica
    ważności liczona innym mnożnikiem niż fizyka meldowałaby „krok jest
    bezpieczny\" dla kroku, przy którym model łamie okno pracy.

    Test wiąże OBA konsumenty z jednym przelicznikiem, licząc każdy z nich z
    postaci zamkniętej.
    """
    magazyn = MagazynEnergiiBESS(
        ref="BAT",
        szyna="BAT",
        e_pojemnosc_mwh=0.010,
        s_bazowa_mva=100.0,
        s_falownika_pu=0.2,
        sprawnosc_rozladowania=0.9,
        sprawnosc_ladowania=0.8,
    )
    tempo = magazyn.tempo_soc_na_jednostke_mocy()
    assert tempo == pytest.approx(100.0 / (SEKUND_W_GODZINIE * 0.010), rel=1e-15)

    # Konsument 1: pochodna SOC.
    napiecie = complex(1.0, 0.0)
    p_pu = 0.1
    x = magazyn.inicjalizuj(napiecie, complex(p_pu, 0.0))
    d_soc = float(magazyn.pochodne(x, napiecie)[2])
    assert d_soc == pytest.approx(-p_pu * (1.0 / 0.9) * tempo, rel=1e-9)

    # Konsument 2: granica ważności kroku.
    szybkosc_maks = 0.2 * tempo * max(1.0 / 0.9, 0.8)
    assert magazyn.krok_maksymalny_s() == pytest.approx(
        magazyn.pasmo_soc / szybkosc_maks, rel=1e-12
    )


def test_zmiana_przelicznika_rusza_OBA_konsumentow() -> None:
    """Druga strona: jedno źródło znaczy, że zmiana widoczna jest wszędzie.

    Gdyby konsumenci mieli własne kopie, zmiana pojemności ruszyłaby jednego, a
    drugiego nie.
    """
    wspolne = {"ref": "BAT", "szyna": "BAT", "s_bazowa_mva": 100.0, "s_falownika_pu": 0.2}
    maly = MagazynEnergiiBESS(e_pojemnosc_mwh=0.010, **wspolne)
    duzy = MagazynEnergiiBESS(e_pojemnosc_mwh=0.100, **wspolne)
    assert duzy.tempo_soc_na_jednostke_mocy() == pytest.approx(
        maly.tempo_soc_na_jednostke_mocy() / 10.0, rel=1e-12
    )
    assert duzy.krok_maksymalny_s() == pytest.approx(10.0 * maly.krok_maksymalny_s(), rel=1e-12)

    napiecie = complex(1.0, 0.0)
    x_maly = maly.inicjalizuj(napiecie, complex(0.1, 0.0))
    x_duzy = duzy.inicjalizuj(napiecie, complex(0.1, 0.0))
    assert float(duzy.pochodne(x_duzy, napiecie)[2]) == pytest.approx(
        float(maly.pochodne(x_maly, napiecie)[2]) / 10.0, rel=1e-9
    )
