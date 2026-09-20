"""Konwencje rdzenia dynamiki: jednostki, bazy, znaki, uklad dq <-> siec (SS0 p.1).

JEDNO MIEJSCE NA KAZDA KONWENCJE. Kazda transformacja ukladu odniesienia, kazde
przejscie miedzy baza urzadzenia a baza ukladu i kazda umowa znakowa mieszka
TUTAJ. Urzadzenie, ktore trzyma wlasna kopie obrotu dq, jest defektem czekajacym
na rozjazd znaku — dlatego protokol `Urzadzenie` wola te funkcje, nie powtarza ich.

UMOWY ZNAKOWE (obowiazuja w calym pakiecie):
* prad i moc URZADZENIA — konwencja GENERACJI: dodatnie = oddawane do sieci;
* moc ODBIORU — konwencja POBORU: dodatnie = pobierane z sieci;
* fazory sieciowe w ukladzie wirujacym z predkoscia synchroniczna (RMS), wiec
  os czasu niesie OBWIEDNIE, nie chwilowe wartosci fazowe;
* kat `delta` liczony od osi odniesienia sieci, rosnacy przeciwnie do wskazowek.

UKLAD dq (Sauer & Pai). Os q pokrywa sie z kierunkiem `delta`, os d wyprzedza ja
o -90 stopni:

    V_siec = (V_d + j V_q) * exp(j (delta - pi/2))

Sprawdzian tozsamosciowy (przypiety testem): dla modelu klasycznego napiecie
wewnetrzne lezy na osi q (`E_d = 0`, `E_q = E'`), wiec powyzsze daje dokladnie
`E' * exp(j delta)` — kanoniczne „E' za X'd".
"""

from __future__ import annotations

import cmath
import math

from network_model.pochodne import impedancja_z_napiecia_i_mocy_ohm

from .kontrakty import KOD_PARAMETRY_SPRZECZNE, OdmowaDynamiki

#: Cwierc obrotu — przesuniecie osi q wzgledem osi odniesienia fazora sieciowego.
CWIERC_OBROTU_RAD = math.pi / 2.0


def pulsacja_bazowa_rad_s(f_bazowa_hz: float) -> float:
    """Pulsacja bazowa omega_0 = 2*pi*f [rad/s] — baza czasu rownan ruchu."""
    return 2.0 * math.pi * f_bazowa_hz


def dq_na_siec(skladowa_d: float, skladowa_q: float, delta_rad: float) -> complex:
    """Fazor sieciowy z pary (d, q) przy kacie wirnika `delta_rad`."""
    return complex(skladowa_d, skladowa_q) * cmath.exp(1j * (delta_rad - CWIERC_OBROTU_RAD))


def siec_na_dq(fazor: complex, delta_rad: float) -> tuple[float, float]:
    """Para (d, q) z fazora sieciowego przy kacie wirnika `delta_rad`."""
    obrocony = fazor * cmath.exp(-1j * (delta_rad - CWIERC_OBROTU_RAD))
    return obrocony.real, obrocony.imag


def zmiana_bazy_impedancji(
    wartosc_pu: float, s_bazowa_urzadzenia_mva: float, s_bazowa_ukladu_mva: float
) -> float:
    """Impedancja/reaktancja pu z bazy URZADZENIA na baze UKLADU (ta sama baza napiecia).

    JEDEN przelicznik dla calego pakietu. Przeglad watku badawczego (P1-B55-02)
    zmierzyl, do czego prowadzi jego brak: model o bazie 100 MVA przyjmowal
    urzadzenie o bazie 50 MVA, ten sam sygnal `0,5 pu` znaczyl 50 MW po stronie
    sieci i 25 MW po stronie zasobu, a blad skali 2:1 NIE malal przy dt -> 0,
    bo nie byl bledem calkowania. Dlatego kazde wejscie urzadzenia przechodzi
    tedy przy budowie, a nie „gdzies pozniej".
    """
    if s_bazowa_urzadzenia_mva <= 0.0 or s_bazowa_ukladu_mva <= 0.0:
        raise OdmowaDynamiki(
            KOD_PARAMETRY_SPRZECZNE,
            "Bazy mocy musza byc dodatnie "
            f"(urzadzenie={s_bazowa_urzadzenia_mva}, uklad={s_bazowa_ukladu_mva})",
            s_bazowa_urzadzenia_mva=s_bazowa_urzadzenia_mva,
            s_bazowa_ukladu_mva=s_bazowa_ukladu_mva,
        )
    return wartosc_pu * (s_bazowa_ukladu_mva / s_bazowa_urzadzenia_mva)


def zmiana_bazy_stalej_bezwladnosci(
    h_s: float, s_bazowa_urzadzenia_mva: float, s_bazowa_ukladu_mva: float
) -> float:
    """Stala bezwladnosci H z bazy urzadzenia na baze ukladu: H_uklad = H * S_urz/S_uklad.

    Kierunek jest ODWROTNY niz dla impedancji (H jest energia kinetyczna odniesiona
    do mocy bazowej, impedancja jest odwrotnie proporcjonalna do mocy bazowej) —
    dlatego to OSOBNA funkcja, a nie ten sam przelicznik z innym argumentem.
    Predykat pary „w gore / w dol" ma jedno zrodlo prawdy w tym module.
    """
    if s_bazowa_urzadzenia_mva <= 0.0 or s_bazowa_ukladu_mva <= 0.0:
        raise OdmowaDynamiki(
            KOD_PARAMETRY_SPRZECZNE,
            "Bazy mocy musza byc dodatnie "
            f"(urzadzenie={s_bazowa_urzadzenia_mva}, uklad={s_bazowa_ukladu_mva})",
            s_bazowa_urzadzenia_mva=s_bazowa_urzadzenia_mva,
            s_bazowa_ukladu_mva=s_bazowa_ukladu_mva,
        )
    return h_s * (s_bazowa_urzadzenia_mva / s_bazowa_ukladu_mva)


def sprawdz_stala_bezwladnosci(h_s: float, *, urzadzenie: str, rodzina: str) -> float:
    """Stala bezwladnosci MUSI byc dodatnia i skonczona — inaczej rownania nie ma.

    TO NIE JEST PROG WIARYGODNOSCI, TYLKO WARUNEK ISTNIENIA (R10 par. 11, defekt F-7).
    Rownanie wahan ma postac `dOmega/dt = (P_m - P_e - D dOmega) / (2H)`:

    * `H = 0`  -> dzielenie przez zero; predkosc nie jest funkcja czasu, tylko
      rownaniem algebraicznym `P_m = P_e + D dOmega` innego typu, ktorego ten model
      nie zawiera;
    * `H < 0`  -> odwrocona przyczynowosc: nadwyzka mocy mechanicznej HAMUJE wirnik.
      Taki uklad jest rozbiezny z definicji, a jego bieg nie jest symulacja niczego;
    * `H` nieskonczone albo NaN -> parametr nie jest liczba.

    ZADNEGO MINIMUM NIE WPROWADZAMY. `H = 0,05 s` jest dla maszyny synchronicznej
    nieprawdopodobne fizycznie, ale MATEMATYCZNIE poprawne — uklad jest wtedy tylko
    sztywniejszy, a o zbieznosc kroku dba wlasna maszyneria Newtona, ktora melduje
    `dynamika.krok_niezbiezny`, gdy nie daje rady. Wiarygodnosc parametru jest
    pytaniem katalogowym, nie warunkiem rozwiazywalnosci, i wymyslona granica
    („H >= 0,5 s") zaczelaby decydowac o fizyce zamiast o danych.

    Zwraca `h_s` bez zmiany, zeby wolajacy mogl uzyc jej w wyrazeniu i nie mial
    drugiej drogi obok sprawdzenia.
    """
    if not math.isfinite(h_s) or h_s <= 0.0:
        raise OdmowaDynamiki(
            KOD_PARAMETRY_SPRZECZNE,
            f"Stala bezwladnosci urzadzenia {urzadzenie!r} (rodzina {rodzina}) wynosi {h_s} — "
            "rownanie wahan wymaga H > 0 i skonczonego. Dla H = 0 rownanie ruchu nie "
            "istnieje (dzielenie przez zero), dla H < 0 nadwyzka mocy mechanicznej "
            "hamowalaby wirnik. To warunek istnienia rownania, nie prog wiarygodnosci.",
            urzadzenie=urzadzenie,
            rodzina=rodzina,
            h_s=h_s,
        )
    return h_s


def zmiana_bazy_mocy_wzglednej(
    wartosc_pu: float, s_bazowa_urzadzenia_mva: float, s_bazowa_ukladu_mva: float
) -> float:
    """Moc (albo granice mocy) w pu z bazy URZADZENIA na baze UKLADU.

    Kierunek jest TEN SAM, co dla stalej bezwladnosci (`wartosc * S_urz/S_uklad`) i
    ODWROTNY niz dla impedancji — dlatego przelicznik jest jeden, a ta funkcja
    tylko nazywa go po wielkosci, ktora przelicza. Uzywaja jej granice mocy
    turbiny, granice ladowania/rozladowania magazynu i moce znamionowe
    przeksztaltnikow; gdyby kazde z tych miejsc mialo wlasny mnoznik, jedno z nich
    predzej czy pozniej poszloby w druga strone.
    """
    return zmiana_bazy_stalej_bezwladnosci(wartosc_pu, s_bazowa_urzadzenia_mva, s_bazowa_ukladu_mva)


def moc_pu(moc_mva: float, s_bazowa_mva: float) -> float:
    """Moc [MVA/MW/Mvar] na jednostki wzgledne bazy ukladu."""
    if s_bazowa_mva <= 0.0:
        raise OdmowaDynamiki(
            KOD_PARAMETRY_SPRZECZNE,
            f"Baza mocy musi byc dodatnia (otrzymano {s_bazowa_mva})",
            s_bazowa_mva=s_bazowa_mva,
        )
    return moc_mva / s_bazowa_mva


def moc_zespolona_pu(napiecie_pu: complex, prad_pu: complex) -> complex:
    """Moc zespolona S = V * conj(I) [pu] — konwencja pradu z argumentu."""
    return napiecie_pu * prad_pu.conjugate()


def admitancja_zwarcia_pu(
    r_f_ohm: float, x_f_ohm: float, u_n_kv: float, s_bazowa_mva: float
) -> complex:
    """Admitancja zwarcia w wezle [pu] z impedancji zwarcia [Ohm] (SS0 p.5).

    Baza impedancji wezla Z_b = U_n^2/S_b liczy `network_model/pochodne`
    (`impedancja_z_napiecia_i_mocy_ohm`) — ta sama formula, ktora wyznacza baze
    pu w rozpływie i w zwarciach, wiec rdzen dynamiki nie ma jej wlasnej kopii.

    Zwarcie metaliczne (`R_f = X_f = 0`) nie ma skonczonej admitancji. Wolajacy
    (`zdarzenia.py::zbuduj_harmonogram`) odrzuca je NAZWANA odmowa
    `KOD_ZWARCIE_METALICZNE` — z testem przypietym do tej obietnicy. Ten `raise`
    zostaje jako ostatnia bariera dla kazdej innej sciezki wywolania: „bardzo duza
    liczba" byla by cicha fabrykacja.
    """
    z_bazowa_ohm = impedancja_z_napiecia_i_mocy_ohm(u_n_kv, s_bazowa_mva)
    z_zwarcia_pu = complex(r_f_ohm, x_f_ohm) / z_bazowa_ohm
    if z_zwarcia_pu == 0:
        raise ZeroDivisionError(
            "Zwarcie metaliczne (R_f = X_f = 0) nie ma skonczonej admitancji — "
            "impedancja zwarcia musi byc niezerowa."
        )
    return 1.0 / z_zwarcia_pu


__all__ = [
    "CWIERC_OBROTU_RAD",
    "admitancja_zwarcia_pu",
    "dq_na_siec",
    "moc_pu",
    "moc_zespolona_pu",
    "pulsacja_bazowa_rad_s",
    "siec_na_dq",
    "zmiana_bazy_impedancji",
    "zmiana_bazy_mocy_wzglednej",
    "sprawdz_stala_bezwladnosci",
    "zmiana_bazy_stalej_bezwladnosci",
]
