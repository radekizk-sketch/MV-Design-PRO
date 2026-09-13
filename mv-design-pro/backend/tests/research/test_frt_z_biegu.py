"""§11.3/4 — czy ocena FRT naprawdę konsumuje ślad biegu, i co robi, gdy nie może.

KOD BADAWCZY — patrz `backend/research/README.md`.

Przebiegi w tym pliku pochodzą z REALNEGO biegu `SilnikRMS` na sieci SN z dwoma
falownikami (`benchmarki.siec_sn_z_der`) ze zwarciem i jego zdjęciem — a nie z
tablic złożonych pod tezę. Przypadki przeciwne (ślad urwany, bieg niezbieżny,
brakujący kanał, kanał w złej przestrzeni i w złej jednostce) powstają przez
UJMOWANIE czegoś temu samemu biegowi, więc różnią się od przypadku dobrego
dokładnie jedną rzeczą.
"""

from __future__ import annotations

import dataclasses

import numpy as np
import pytest
from dynamic_lab.benchmarki import harmonogram_zwarcia, siec_sn_z_der
from dynamic_lab.frt import (
    KRYTERIUM_CZAS_ODPOWIEDZI_BIERNEJ,
    KRYTERIUM_LOGIKA_WYLACZENIA_OEM,
    KRYTERIUM_OBWIEDNIA,
    KRYTERIUM_OBWOD_DC,
    KRYTERIUM_ODBUDOWA_MOCY,
    KRYTERIUM_PRAD_WSPARCIA,
    KRYTERIUM_STAN_PRZYLACZENIA,
    DziedzinaOdbudowy,
    DziennikPrzylaczenia,
    KryteriumOdbudowyMocy,
    ManifestKryteriowProfilu,
    ObwiedniaFrt,
    PrzebiegPraduWsparcia,
    StatusKryterium,
    WerdyktFrt,
    WymaganiePraduBiernego,
    WymaganieZdolnosciFrt,
    moc_pozorna_z_fazorow,
    prad_wsparcia_z_fazora,
)
from dynamic_lab.frt_z_biegu import (
    KANALY_KRYTERIOW,
    PowodNieorzekalnosci,
    ocen_frt_z_biegu,
    wyciagnij_wejscia_frt,
)
from dynamic_lab.silnik import SilnikRMS
from dynamic_lab.wynik import (
    KompletnoscPrzebiegu,
    PrzestrzenSygnalu,
    Sygnal,
    WynikDynamiczny,
)

CHWILA_ZWARCIA_S = 0.5
CZAS_TRWANIA_S = 0.15
HORYZONT_S = 1.0

#: Reaktancja zwarcia przypadku odniesienia. Dobrana POMIAREM, nie z palca —
#: patrz `test_zwarcie_metaliczne_na_szynie_z_odbiorem_STALEJ_MOCY_nie_ma_rozwiazania`.
X_ZWARCIA_PU = 0.3
#: Reaktancja, przy której algebra sieci NIE MA rozwiązania (odbiór stałej mocy).
X_ZWARCIA_BEZ_ROZWIAZANIA_PU = 0.05

_PAMIEC: dict[tuple[float, float, float], WynikDynamiczny] = {}


def _bieg(
    czas_koncowy_s: float = 2.0,
    krok_s: float = 0.002,
    x_f_pu: float = X_ZWARCIA_PU,
) -> WynikDynamiczny:
    """REALNY bieg: sieć SN z dwoma falownikami, zwarcie na SN2 i jego zdjęcie.

    Pamięć podręczna jest bezpieczna, bo `WynikDynamiczny` jest niemutowalny,
    a silnik startuje każdy bieg od stanu modelu (nie od poprzedniego biegu).
    """
    klucz = (czas_koncowy_s, krok_s, x_f_pu)
    if klucz not in _PAMIEC:
        model, moce = siec_sn_z_der()
        silnik = SilnikRMS(model, integrator="trapez_niejawny", krok_s=krok_s)
        x0 = silnik.inicjalizuj(moce)
        _PAMIEC[klucz] = silnik.symuluj(
            x0,
            czas_koncowy_s=czas_koncowy_s,
            harmonogram=harmonogram_zwarcia(
                szyna="SN2",
                chwila_s=CHWILA_ZWARCIA_S,
                czas_trwania_s=CZAS_TRWANIA_S,
                x_f_pu=x_f_pu,
            ),
        )
    return _PAMIEC[klucz]


def _obwiednia() -> ObwiedniaFrt:
    """Obwiednia LVRT pokrywająca cały horyzont — łagodna, bo nie ona jest tu badana."""
    return ObwiedniaFrt(
        rodzaj="lvrt",
        punkty=((0.0, 0.0), (0.15, 0.0), (0.3, 0.3), (1.0, 0.6)),
    )


def _wymaganie(
    *,
    stan_przylaczenia: StatusKryterium = StatusKryterium.NIE_DOTYCZY,
    odbudowa: StatusKryterium = StatusKryterium.NIE_DOTYCZY,
    prad_wsparcia: StatusKryterium = StatusKryterium.NIE_DOTYCZY,
) -> WymaganieZdolnosciFrt:
    """Manifest jest KOMPLETNY — wszystkie kryteria mają jawny status.

    Kryterium pominięte w manifeście jest NIEZMAPOWANE i samo w sobie blokuje
    werdykt pozytywny (fail-closed). To zachowanie jest właściwe i nie wolno go
    obchodzić: pierwsza wersja tego pliku mapowała cztery kryteria z siedmiu i
    dostawała `NIEROZSTRZYGALNE` niezależnie od danych — czyli testy „ścieżki
    uczciwej" zieleniłyby się na złym powodzie albo (jak tutaj) czerwieniły.
    """
    return WymaganieZdolnosciFrt(
        obwiednia=_obwiednia(),
        horyzont_s=HORYZONT_S,
        manifest=ManifestKryteriowProfilu.z_mapy(
            {
                KRYTERIUM_OBWIEDNIA: StatusKryterium.WYMAGANE,
                KRYTERIUM_STAN_PRZYLACZENIA: stan_przylaczenia,
                KRYTERIUM_ODBUDOWA_MOCY: odbudowa,
                KRYTERIUM_PRAD_WSPARCIA: prad_wsparcia,
                KRYTERIUM_CZAS_ODPOWIEDZI_BIERNEJ: StatusKryterium.NIE_DOTYCZY,
                KRYTERIUM_LOGIKA_WYLACZENIA_OEM: StatusKryterium.NIE_DOTYCZY,
                KRYTERIUM_OBWOD_DC: StatusKryterium.NIE_DOTYCZY,
            }
        ),
        kryterium_odbudowy=(
            None
            if odbudowa is not StatusKryterium.WYMAGANE
            else KryteriumOdbudowyMocy(
                prog_wzgledny=0.9,
                czas_utrzymania_s=0.2,
                dziedzina=DziedzinaOdbudowy.GENERACJA,
                minimalna_moc_odniesienia_pu=0.05,
            )
        ),
        wymaganie_pradu_biernego=(
            None
            if prad_wsparcia is not StatusKryterium.WYMAGANE
            else WymaganiePraduBiernego(wspolczynnik_k=2.0, pasmo_martwe_pu=0.1)
        ),
        identyfikator_profilu="profil-testowy",
    )


def _bez_sygnalu(
    wynik: WynikDynamiczny,
    klucz: str,
    element_ref: str,
    przestrzen: PrzestrzenSygnalu = PrzestrzenSygnalu.WYJSCIE,
) -> WynikDynamiczny:
    """Ten sam bieg BEZ jednego kanału — różnica dokładnie jednej rzeczy."""
    return dataclasses.replace(
        wynik,
        sygnaly=tuple(
            s
            for s in wynik.sygnaly
            if not (
                s.klucz == klucz and s.element_ref == element_ref and s.przestrzen is przestrzen
            )
        ),
    )


def _podmien_sygnal(wynik: WynikDynamiczny, stary: Sygnal, nowy: Sygnal) -> WynikDynamiczny:
    return dataclasses.replace(
        wynik, sygnaly=tuple(nowy if s is stary else s for s in wynik.sygnaly)
    )


def _sygnal(
    wynik: WynikDynamiczny,
    klucz: str,
    element_ref: str,
    przestrzen: PrzestrzenSygnalu = PrzestrzenSygnalu.WYJSCIE,
) -> Sygnal:
    """Przestrzeń jest OBOWIĄZKOWA (z domyślną „wyjście"), a nie opcjonalna.

    Pominięcie jej w pierwszej wersji tego pliku dało `too many values to unpack`
    na `p_pu@DER2`: falownik ma stan o tej samej nazwie co wyjście. To jest ta
    sama kolizja, przed którą chroni `PrzestrzenSygnalu` — i dobrze, że test
    nadział się na nią jako pierwszy.
    """
    (znaleziony,) = (
        s
        for s in wynik.sygnaly
        if s.klucz == klucz and s.element_ref == element_ref and s.przestrzen is przestrzen
    )
    return znaleziony


# ---------------------------------------------------------------------------
# 0. BIEG ODNIESIENIA — czy w ogóle jest co konsumować
# ---------------------------------------------------------------------------


def test_slad_biegu_niesie_kanaly_wymagane_przez_kryteria() -> None:
    """Zanim cokolwiek orzekniemy: czy silnik w ogóle zapisuje te kanały.

    Bez tego testu cała reszta pliku mogłaby zielenić się na braku danych.
    """
    wynik = _bieg()
    for kanal in KANALY_KRYTERIOW[KRYTERIUM_OBWIEDNIA]:
        sygnal = _sygnal(wynik, kanal.klucz, "DER2")
        assert sygnal.przestrzen is kanal.przestrzen
        assert sygnal.jednostka == kanal.jednostka
    for kryterium in (KRYTERIUM_ODBUDOWA_MOCY, KRYTERIUM_PRAD_WSPARCIA):
        for kanal in KANALY_KRYTERIOW[kryterium]:
            if kanal.element != "modul":
                continue
            sygnal = _sygnal(wynik, kanal.klucz, "DER2")
            assert sygnal.przestrzen is kanal.przestrzen
            assert sygnal.jednostka == kanal.jednostka


def test_zwarcie_faktycznie_zapada_napiecie_w_sladzie() -> None:
    """Bieg musi zawierać ZDARZENIE, inaczej ocena FRT orzeka o niczym."""
    wynik = _bieg()
    czas = np.asarray(wynik.czas_s)
    u = np.asarray(_sygnal(wynik, "u_pu", "DER2").wartosci)
    w_zwarciu = (czas > CHWILA_ZWARCIA_S) & (czas < CHWILA_ZWARCIA_S + CZAS_TRWANIA_S)
    przed = u[czas < CHWILA_ZWARCIA_S].max()
    assert u[w_zwarciu].min() < przed - 0.1, "zwarcie nie zapadło napięcia — nie ma czego oceniać"


# ---------------------------------------------------------------------------
# 1. ŚCIEŻKA UCZCIWA
# ---------------------------------------------------------------------------


def test_ocena_z_realnego_biegu_jest_rozstrzygalna() -> None:
    """Kierunek przeciwny do wszystkich testów braku: na dobrym biegu ma działać."""
    ocena, braki = ocen_frt_z_biegu(
        _bieg(),
        szyna="DER2",
        modul_ref="DER2",
        wymaganie=_wymaganie(),
        chwila_zaklocenia_s=CHWILA_ZWARCIA_S,
    )
    assert braki == ()
    assert ocena.werdykt is not WerdyktFrt.NIEROZSTRZYGALNE
    (wiersz,) = (w for w in ocena.wiersze if w.kryterium == KRYTERIUM_OBWIEDNIA)
    assert wiersz.zrodlo_przebiegu.startswith("bieg:")
    assert wiersz.zmierzone is not None


def test_zmierzone_napiecie_pochodzi_ZE_SLADU_a_nie_z_obwiedni() -> None:
    """Defekt P0-01 w nowym przebraniu: wielkość „zmierzona" musi być z biegu.

    Sprawdzane WARTOŚCIĄ: napięcie w wierszu White Box musi występować w śladzie
    (z dokładnością interpolacji), a jednocześnie NIE MOŻE być równe wymaganiu —
    równość obu byłaby tautologią z audytu.
    """
    wynik = _bieg()
    ocena, _ = ocen_frt_z_biegu(
        wynik,
        szyna="DER2",
        modul_ref="DER2",
        wymaganie=_wymaganie(),
        chwila_zaklocenia_s=CHWILA_ZWARCIA_S,
    )
    (wiersz,) = (w for w in ocena.wiersze if w.kryterium == KRYTERIUM_OBWIEDNIA)
    u = np.asarray(_sygnal(wynik, "u_pu", "DER2").wartosci)
    assert wiersz.zmierzone is not None
    assert u.min() - 1e-9 <= wiersz.zmierzone <= u.max() + 1e-9
    assert wiersz.wymagane is not None
    assert wiersz.zmierzone != pytest.approx(wiersz.wymagane, abs=1e-12)


def test_wartosc_przedzaklocaniowa_jest_brana_SCISLE_przed_zdarzeniem() -> None:
    """Próbka w samej chwili zakłócenia może już nieść jego skutek."""
    wynik = _bieg()
    wejscia = wyciagnij_wejscia_frt(
        wynik,
        szyna="DER2",
        modul_ref="DER2",
        wymaganie=_wymaganie(odbudowa=StatusKryterium.NIE_DOTYCZY),
        chwila_zaklocenia_s=CHWILA_ZWARCIA_S,
    )
    czas = np.asarray(wynik.czas_s)
    u = np.asarray(_sygnal(wynik, "u_pu", "DER2").wartosci)
    oczekiwane = u[czas < CHWILA_ZWARCIA_S - 1e-9][-1]
    assert wejscia.napiecie_przed_zaklocaniem_pu == pytest.approx(float(oczekiwane))


# ---------------------------------------------------------------------------
# 2. PRZYPADKI PRZECIWNE — ŚLAD JAKO MATERIAŁ DOWODOWY
# ---------------------------------------------------------------------------


def test_slad_krotszy_niz_okno_jest_NIEROZSTRZYGALNY() -> None:
    """Brakujący ogon okna to brak danych, nie spełnienie wymagania."""
    wynik = _bieg(czas_koncowy_s=0.9)  # okno sięga 1,5 s
    ocena, braki = ocen_frt_z_biegu(
        wynik,
        szyna="DER2",
        modul_ref="DER2",
        wymaganie=_wymaganie(),
        chwila_zaklocenia_s=CHWILA_ZWARCIA_S,
    )
    assert ocena.werdykt is WerdyktFrt.NIEROZSTRZYGALNE
    assert PowodNieorzekalnosci.SLAD_KONCZY_SIE_PRZED_KONCEM_OKNA in {b.powod for b in braki}


def test_slad_zaczynajacy_sie_PO_zaklocaniu_jest_NIEROZSTRZYGALNY() -> None:
    """Symetryczny brak z drugiej strony okna — osobny powód, nie ten sam."""
    wynik = _bieg()
    ocena, braki = ocen_frt_z_biegu(
        wynik,
        szyna="DER2",
        modul_ref="DER2",
        wymaganie=_wymaganie(),
        chwila_zaklocenia_s=-0.5,
    )
    assert ocena.werdykt is WerdyktFrt.NIEROZSTRZYGALNE
    assert PowodNieorzekalnosci.SLAD_ZACZYNA_SIE_PO_ZAKLOCENIU in {b.powod for b in braki}


def test_zwarcie_metaliczne_na_szynie_z_odbiorem_STALEJ_MOCY_nie_ma_rozwiazania() -> None:
    """ZMIERZONA granica ważności modelu — i źródło przypadku niezbieżnego niżej.

    Na SN2 siedzi ``OdbiorStalejMocy`` (P = −0,5 p.u.). Model stałej mocy żąda
    ``I = S*/V*``, więc przy zapadzie napięcia do zera prąd rośnie bez granicy i
    układ algebraiczny PRZESTAJE MIEĆ ROZWIĄZANIE. To NIE jest defekt Newtona:
    komunikat solvera mówi wprost, że każdy krok zmniejszał normę (nawrót
    Armijo), więc nie ma ani rozjazdu, ani cyklu — zadanie po prostu nie ma
    punktu stałego. Jedyną uczciwą reakcją jest meldunek braku zbieżności, a nie
    „jakieś" napięcie.

    Zmierzone: przy ``x_f = 0,05`` p.u. bieg przerywa się w 0,498 s (chwila
    zwarcia) z najlepszym residuum 1,181 przy progu 1,0e-12; przy ``x_f = 0,3``
    p.u. bieg przechodzi cały horyzont, a napięcie DER2 zapada do 0,612 p.u.
    """
    wynik = _bieg(x_f_pu=X_ZWARCIA_BEZ_ROZWIAZANIA_PU)
    diag = wynik.diagnostyka
    assert diag.zbiegl is False
    assert diag.kompletnosc is KompletnoscPrzebiegu.PRZERWANY_BLEDEM
    assert diag.blad is not None
    assert diag.blad.faza == "algebra_sieci"
    assert diag.czas_osiagniety_s == pytest.approx(CHWILA_ZWARCIA_S, abs=0.01)


def test_bieg_NIEZBIEZNY_nie_jest_materialem_dowodowym() -> None:
    """Przebiegi biegu, który nie zbiegł, nie są rozwiązaniem zadanego układu.

    Przypadek jest REALNY — to bieg z testu wyżej, a nie diagnostyka podmieniona
    pod tezę. Ślad niesie 249 poprawnych próbek sprzed zwarcia, więc konsument
    czytający wyłącznie przebiegi zobaczyłby komplet liczb.
    """
    wynik = _bieg(x_f_pu=X_ZWARCIA_BEZ_ROZWIAZANIA_PU)
    ocena, braki = ocen_frt_z_biegu(
        wynik,
        szyna="DER2",
        modul_ref="DER2",
        wymaganie=_wymaganie(),
        chwila_zaklocenia_s=CHWILA_ZWARCIA_S,
    )
    assert ocena.werdykt is WerdyktFrt.NIEROZSTRZYGALNE
    powody = {b.powod for b in braki}
    assert PowodNieorzekalnosci.BIEG_NIEZBIEZNY in powody
    assert PowodNieorzekalnosci.PRZEBIEG_PRZERWANY in powody


def test_przebieg_PRZERWANY_bledem_nie_jest_materialem_dowodowym() -> None:
    wynik = _bieg()
    urwany = dataclasses.replace(
        wynik,
        diagnostyka=dataclasses.replace(
            wynik.diagnostyka,
            kompletnosc=KompletnoscPrzebiegu.PRZERWANY_BLEDEM,
            czas_osiagniety_s=0.4,
        ),
    )
    ocena, braki = ocen_frt_z_biegu(
        urwany,
        szyna="DER2",
        modul_ref="DER2",
        wymaganie=_wymaganie(),
        chwila_zaklocenia_s=CHWILA_ZWARCIA_S,
    )
    assert ocena.werdykt is WerdyktFrt.NIEROZSTRZYGALNE
    assert PowodNieorzekalnosci.PRZEBIEG_PRZERWANY in {b.powod for b in braki}


def test_bieg_z_krokami_PONIZEJ_TOLERANCJI_nie_jest_materialem_dowodowym() -> None:
    """`zbiegl=True` nie znaczy „spełnia zadeklarowaną tolerancję".

    Bieg dopuszczający zastój kończy się bez wyjątku, mając kroki powyżej progu —
    i przed tą zmianą wejście FRT w ogóle tego pola nie widziało.
    """
    wynik = _bieg()
    diag = wynik.diagnostyka
    z_zastojem = dataclasses.replace(
        wynik,
        diagnostyka=dataclasses.replace(
            diag,
            kroki_scisle_zbiezne=diag.liczba_krokow - 3,
            kroki_na_podlodze_numerycznej=3,
            najgorsze_rho=1249.0,
        ),
    )
    ocena, braki = ocen_frt_z_biegu(
        z_zastojem,
        szyna="DER2",
        modul_ref="DER2",
        wymaganie=_wymaganie(),
        chwila_zaklocenia_s=CHWILA_ZWARCIA_S,
    )
    assert ocena.werdykt is WerdyktFrt.NIEROZSTRZYGALNE
    assert PowodNieorzekalnosci.KROKI_PONIZEJ_TOLERANCJI in {b.powod for b in braki}


# ---------------------------------------------------------------------------
# 3. PRZYPADKI PRZECIWNE — KANAŁY
# ---------------------------------------------------------------------------


def test_brak_kanalu_napiecia_nazywa_KTOREGO_kanalu_brakuje() -> None:
    wynik = _bez_sygnalu(_bieg(), "u_pu", "DER2")
    ocena, braki = ocen_frt_z_biegu(
        wynik,
        szyna="DER2",
        modul_ref="DER2",
        wymaganie=_wymaganie(),
        chwila_zaklocenia_s=CHWILA_ZWARCIA_S,
    )
    assert ocena.werdykt is WerdyktFrt.NIEROZSTRZYGALNE
    (brak,) = (b for b in braki if b.powod is PowodNieorzekalnosci.BRAK_KANALU)
    assert brak.kanal is not None and brak.kanal.klucz == "u_pu"
    assert brak.jako_slownik()["powod"] == "brak_wymaganego_kanalu"


def test_brak_kanalu_mocy_czynnej_dotyczy_TYLKO_kryterium_odbudowy() -> None:
    """Kanał wiąże się z KRYTERIUM, nie z całą oceną — inaczej brak jednego
    sygnału kasowałby kryteria, które go nie potrzebują."""
    # Usuwamy WYJŚCIE `p_pu`; STAN o tej samej nazwie ZOSTAJE — falownik ma oba.
    # Dlatego właściwym powodem jest „kanał w innej przestrzeni", a nie „brak kanału":
    # sygnał o tej nazwie w śladzie jest, tylko nie jest tą wielkością fizyczną.
    wynik = _bez_sygnalu(_bieg(), "p_pu", "DER2")
    assert any(
        s.klucz == "p_pu" and s.element_ref == "DER2" and s.przestrzen is PrzestrzenSygnalu.STAN
        for s in wynik.sygnaly
    )
    wejscia = wyciagnij_wejscia_frt(
        wynik,
        szyna="DER2",
        modul_ref="DER2",
        wymaganie=_wymaganie(odbudowa=StatusKryterium.WYMAGANE),
        chwila_zaklocenia_s=CHWILA_ZWARCIA_S,
    )
    (brak,) = (
        b for b in wejscia.braki if b.powod is PowodNieorzekalnosci.KANAL_W_INNEJ_PRZESTRZENI
    )
    assert brak.kryterium == KRYTERIUM_ODBUDOWA_MOCY
    assert wejscia.przebieg_napiecia is not None, "brak mocy nie może zabrać napięcia"


def test_kanal_w_ZLEJ_PRZESTRZENI_nie_jest_brany_za_wyjscie_modelu() -> None:
    """Zmienna stanu o tej samej nazwie NIE JEST tą samą wielkością fizyczną.

    To jest dokładnie kolizja, która w laboratorium już raz wystąpiła (`p_pu`
    falownika: wyjście i stan) i była wtedy niewidoczna.
    """
    wynik = _bieg()
    stary = _sygnal(wynik, "u_pu", "DER2")
    podmieniony = _podmien_sygnal(
        wynik, stary, dataclasses.replace(stary, przestrzen=PrzestrzenSygnalu.STAN)
    )
    _, braki = ocen_frt_z_biegu(
        podmieniony,
        szyna="DER2",
        modul_ref="DER2",
        wymaganie=_wymaganie(),
        chwila_zaklocenia_s=CHWILA_ZWARCIA_S,
    )
    assert PowodNieorzekalnosci.KANAL_W_INNEJ_PRZESTRZENI in {b.powod for b in braki}


def test_kanal_w_ZLEJ_JEDNOSTCE_jest_odrzucany() -> None:
    """Liczba w kV zamiast p.u. przechodzi każdą kontrolę kształtu."""
    wynik = _bieg()
    stary = _sygnal(wynik, "u_pu", "DER2")
    podmieniony = _podmien_sygnal(wynik, stary, dataclasses.replace(stary, jednostka="kV"))
    _, braki = ocen_frt_z_biegu(
        podmieniony,
        szyna="DER2",
        modul_ref="DER2",
        wymaganie=_wymaganie(),
        chwila_zaklocenia_s=CHWILA_ZWARCIA_S,
    )
    assert PowodNieorzekalnosci.NIEZGODNA_JEDNOSTKA in {b.powod for b in braki}


def test_kanal_z_INNEJ_SZYNY_nie_zastepuje_wlasciwej() -> None:
    """Napięcie na GPZ (szyna sztywna) nie jest napięciem na zaciskach modułu."""
    wynik = _bez_sygnalu(_bieg(), "u_pu", "DER2")
    _, braki = ocen_frt_z_biegu(
        wynik,
        szyna="DER2",
        modul_ref="DER2",
        wymaganie=_wymaganie(),
        chwila_zaklocenia_s=CHWILA_ZWARCIA_S,
    )
    assert PowodNieorzekalnosci.BRAK_KANALU in {b.powod for b in braki}
    # ...a ten sam bieg z kanałem GPZ nadal NIE ma kanału DER2:
    assert any(s.element_ref == "GPZ" and s.klucz == "u_pu" for s in wynik.sygnaly)


# ---------------------------------------------------------------------------
# 4. STAN PRZYŁĄCZENIA — ZMIERZONE OGRANICZENIE, NIE DOMYSŁ
# ---------------------------------------------------------------------------


def test_stan_przylaczenia_wymagany_bez_dziennika_daje_JAWNY_brak() -> None:
    """Ślad nie niesie stanu łącznika — i moduł mówi to wprost, zamiast zgadywać."""
    ocena, braki = ocen_frt_z_biegu(
        _bieg(),
        szyna="DER2",
        modul_ref="DER2",
        wymaganie=_wymaganie(stan_przylaczenia=StatusKryterium.WYMAGANE),
        chwila_zaklocenia_s=CHWILA_ZWARCIA_S,
    )
    assert ocena.werdykt is WerdyktFrt.NIEROZSTRZYGALNE
    (brak,) = (b for b in braki if b.powod is PowodNieorzekalnosci.BRAK_DZIENNIKA_PRZYLACZENIA)
    assert brak.kryterium == KRYTERIUM_STAN_PRZYLACZENIA


def test_podany_dziennik_przylaczenia_zdejmuje_ten_brak() -> None:
    """Kierunek przeciwny: brak znika, gdy dane rzeczywiście są."""
    dziennik = DziennikPrzylaczenia(
        stan_poczatkowy=True,
        zdarzenia=(),
        obowiazuje_od_s=0.0,
        obowiazuje_do_s=2.0,
        zrodlo="test",
    )
    ocena, braki = ocen_frt_z_biegu(
        _bieg(),
        szyna="DER2",
        modul_ref="DER2",
        wymaganie=_wymaganie(stan_przylaczenia=StatusKryterium.WYMAGANE),
        chwila_zaklocenia_s=CHWILA_ZWARCIA_S,
        dziennik_przylaczenia=dziennik,
    )
    assert braki == ()
    assert ocena.werdykt is not WerdyktFrt.NIEROZSTRZYGALNE


# ---------------------------------------------------------------------------
# 5. PRĄD WSPARCIA — JEDNA DEFINICJA, DWIE DROGI WEJŚCIA
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("napiecie", "prad"),
    [
        (complex(1.0, 0.0), complex(0.8, -0.3)),
        (complex(0.6, 0.4), complex(0.2, 0.5)),
        (complex(-0.7, 0.2), complex(-0.1, -0.9)),
        (complex(0.05, -0.02), complex(1.1, 0.4)),
    ],
)
def test_oba_konstruktory_pradu_wsparcia_daja_to_samo(napiecie: complex, prad: complex) -> None:
    """Tożsamość ``I_q = Q/|V|`` jest wyprowadzona w docstringu — tu jest ZMIERZONA.

    Bez tego testu droga „z mocy biernej" byłaby DRUGĄ PRAWDĄ o tej samej
    wielkości, a zgodność obu — wyłącznie deklaracją w komentarzu.
    """
    s = moc_pozorna_z_fazorow(napiecie, prad)
    z_fazorow = PrzebiegPraduWsparcia.z_fazorow(
        czas_s=(0.0, 1.0),
        napiecie_zespolone=(napiecie, napiecie),
        prad_zespolony=(prad, prad),
        zrodlo="test",
        element_ref="DER",
    )
    z_mocy = PrzebiegPraduWsparcia.z_mocy_biernej(
        czas_s=(0.0, 1.0),
        moc_bierna_pu=(s.imag, s.imag),
        napiecie_modul_pu=(abs(napiecie), abs(napiecie)),
        zrodlo="test",
        element_ref="DER",
    )
    assert z_mocy.wartosci_pu[0] == pytest.approx(z_fazorow.wartosci_pu[0], rel=1e-12, abs=1e-15)
    assert z_fazorow.wartosci_pu[0] == pytest.approx(
        prad_wsparcia_z_fazora(napiecie, prad), rel=1e-12, abs=1e-15
    )


def test_prad_wsparcia_z_biegu_zgadza_sie_z_definicja_probka_po_probce() -> None:
    """Przebieg wydobyty ze śladu musi być TĄ wielkością, a nie podobną."""
    wynik = _bieg()
    bez_kryterium = wyciagnij_wejscia_frt(
        wynik,
        szyna="DER2",
        modul_ref="DER2",
        wymaganie=_wymaganie(prad_wsparcia=StatusKryterium.NIE_DOTYCZY),
        chwila_zaklocenia_s=CHWILA_ZWARCIA_S,
    )
    assert bez_kryterium.przebieg_pradu_wsparcia is None, (
        "kryterium NIE_DOTYCZY nie ma prawa pobierać kanału — pobranie „na wszelki "
        'wypadek" robi z opcjonalnego sygnału milczące wymaganie'
    )

    z_kryterium = wyciagnij_wejscia_frt(
        wynik,
        szyna="DER2",
        modul_ref="DER2",
        wymaganie=_wymaganie(prad_wsparcia=StatusKryterium.WYMAGANE),
        chwila_zaklocenia_s=CHWILA_ZWARCIA_S,
    )
    assert z_kryterium.braki == ()
    przebieg = z_kryterium.przebieg_pradu_wsparcia
    assert przebieg is not None

    q = np.asarray(_sygnal(wynik, "q_pu", "DER2").wartosci)
    u = np.asarray(_sygnal(wynik, "u_pu", "DER2").wartosci)
    assert np.allclose(np.asarray(przebieg.wartosci_pu), q / u, rtol=1e-12, atol=1e-15)
    # ...i NIE jest to samo `q_pu`: gdyby adapter podał surową moc bierną, test
    # przeszedłby wszędzie tam, gdzie napięcie jest bliskie 1,0 p.u.
    assert not np.allclose(np.asarray(przebieg.wartosci_pu), q, rtol=1e-6, atol=1e-9)


def test_prad_wsparcia_przy_napieciu_ZEROWYM_jest_bledem_a_nie_zerem() -> None:
    """Zwarcie metaliczne na zaciskach to BRAK tej wielkości, nie jej zero."""
    with pytest.raises(ValueError, match="fazy nie ma"):
        PrzebiegPraduWsparcia.z_mocy_biernej(
            czas_s=(0.0, 1.0),
            moc_bierna_pu=(0.2, 0.2),
            napiecie_modul_pu=(1.0, 0.0),
            zrodlo="test",
            element_ref="DER",
        )
