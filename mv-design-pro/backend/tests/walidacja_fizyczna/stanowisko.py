"""STANOWISKO PRODUKTU: parametryzowany SMIB uruchamiany silnikiem produkcyjnym.

Druga strona porownania. Te same parametry fizyczne co w `wyrocznia.py`, ale
podawane JAWNIE po obu stronach — nic nie jest importowane z jednej do drugiej.
Gdyby wyrocznia i stanowisko dzielily zrodlo parametrow, zgodnosc wynikow
mogłaby pochodzic ze wspolnego bledu wejscia.

BAZA URZADZENIA JEST PARAMETREM. `s_n_mva` domyslnie ROZNI sie od bazy ukladu
(`S_BAZOWA_MVA`), bo baza rowna bazie ukladu czyni przeliczenie jednostek
mnozeniem przez 1,0 — czyli kazdy blad KIERUNKU przeliczenia (impedancja
`z * S_sys/S_dev` kontra bezwladnosc `H * S_dev/S_sys`) jest w takim wzorcu
NIEWIDOCZNY. To byl zmierzony slepy punkt wzorca W6-F (F-1).
"""

from __future__ import annotations

import cmath
import math

import numpy as np
from network_model.solvers.dynamika import (
    GalazDynamiki,
    HarmonogramDynamiki,
    NastawySolvera,
    OdbiorDynamiki,
    PunktPracy,
    SilnikDynamiki,
    WejscieDynamiki,
    WezelDynamiki,
)
from network_model.solvers.dynamika.urzadzenia import (
    zbuduj_maszyne_klasyczna,
    zbuduj_szyne_sztywna,
)

S_BAZOWA_MVA = 100.0
F_BAZOWA_HZ = 50.0
U_N_KV = 15.0

#: Impedancja bazowa wezla — sluzy do przeliczania reaktancji zwarcia z omow na pu.
Z_BAZOWA_OM = U_N_KV**2 / S_BAZOWA_MVA


def zbuduj(
    *,
    h_s: float = 3.5,
    d_pu: float = 0.0,
    x_prim_pu: float = 0.3,
    ra_pu: float = 0.0,
    x_linii_pu: float = 0.3,
    x_systemu_pu: float = 0.05,
    u_gen_pu: float = 1.05,
    p_gen_pu: float = 0.8,
    odbior_p_pu: float | None = None,
    dwutorowa: bool = False,
    s_n_mva: float | None = None,
) -> dict:
    """SMIB o parametrach zadanych W BAZIE UKLADU.

    `s_n_mva` to baza znamionowa MASZYNY. Gdy jest inna niz `S_BAZOWA_MVA`,
    parametry maszyny podawane fabryce sa przeliczane tak, zeby PO przeliczeniu
    do bazy ukladu wyszly dokladnie `h_s` i `x_prim_pu` — czyli fizyka ukladu
    jest ta sama, a tor przeliczenia jednostek zostaje realnie uzyty.
    """
    kat = math.asin(p_gen_pu * x_linii_pu / u_gen_pu)
    v_gen = u_gen_pu * cmath.exp(1j * kat)
    v_sys = complex(1.0, 0.0)
    i_linii = (v_gen - v_sys) / complex(0.0, x_linii_pu)

    baza_maszyny = S_BAZOWA_MVA if s_n_mva is None else s_n_mva
    # Odwrocenie przeliczen `konwencje`: H skaluje sie S_dev/S_sys, impedancja S_sys/S_dev.
    h_w_bazie_maszyny = h_s * S_BAZOWA_MVA / baza_maszyny
    x_w_bazie_maszyny = x_prim_pu * baza_maszyny / S_BAZOWA_MVA
    ra_w_bazie_maszyny = ra_pu * baza_maszyny / S_BAZOWA_MVA
    d_w_bazie_maszyny = d_pu * S_BAZOWA_MVA / baza_maszyny

    maszyna = zbuduj_maszyne_klasyczna(
        ident="G1",
        wezel="GEN",
        s_n_mva=baza_maszyny,
        h_s=h_w_bazie_maszyny,
        d_pu=d_w_bazie_maszyny,
        x_prim_pu=x_w_bazie_maszyny,
        ra_pu=ra_w_bazie_maszyny,
        s_bazowa_mva=S_BAZOWA_MVA,
        f_bazowa_hz=F_BAZOWA_HZ,
    )
    szyna = zbuduj_szyne_sztywna(
        ident="SYS1",
        wezel="SYS",
        s_zwarciowa_mva=S_BAZOWA_MVA,
        r_pu=0.0,
        x_pu=x_systemu_pu,
        s_bazowa_mva=S_BAZOWA_MVA,
    )
    if dwutorowa:
        galezie = tuple(
            GalazDynamiki(
                f"LINIA{n}",
                "GEN",
                "SYS",
                1.0 / complex(0.0, 2.0 * x_linii_pu),
                0.0,
                complex(1.0, 0.0),
                True,
                "linia",
            )
            for n in (1, 2)
        )
    else:
        galezie = (
            GalazDynamiki(
                "LINIA",
                "GEN",
                "SYS",
                1.0 / complex(0.0, x_linii_pu),
                0.0,
                complex(1.0, 0.0),
                True,
                "linia",
            ),
        )
    if odbior_p_pu is None:
        odbiory: tuple[OdbiorDynamiki, ...] = ()
        moc_gen = v_gen * i_linii.conjugate()
    else:
        odbiory = (OdbiorDynamiki("ODB1", "GEN", odbior_p_pu, 0.0),)
        prad_odb = complex(odbior_p_pu, 0.0).conjugate() / v_gen.conjugate()
        moc_gen = v_gen * (i_linii + prad_odb).conjugate()
    return {
        "wezly": (WezelDynamiki("GEN", U_N_KV), WezelDynamiki("SYS", U_N_KV)),
        "galezie": galezie,
        "odbiory": odbiory,
        "urzadzenia": (maszyna, szyna),
        "punkt_pracy": PunktPracy(
            napiecia_pu={"GEN": v_gen, "SYS": v_sys},
            moce_zrodel_pu={"G1": moc_gen, "SYS1": v_sys * (-i_linii).conjugate()},
        ),
    }


def nastawy(
    *,
    dt_s: float = 1e-3,
    horyzont_s: float = 3.0,
    krok_wyjscia_s: float = 1e-3,
    integrator: str = "trapez_niejawny",
    adaptacyjny: bool = False,
    tolerancja: float = 1e-11,
    tolerancja_kroku: float = 1e-6,
    max_iteracji_newtona: int = 60,
    tolerancja_lokalizacji_zdarzen_s: float | None = None,
) -> NastawySolvera:
    """Nastawy wzorca — kazde pole podane JAWNIE (kontrakt zakazuje domyslek)."""
    return NastawySolvera(
        dt_s=dt_s,
        dt_min_s=dt_s / 64.0 if adaptacyjny else dt_s,
        dt_max_s=dt_s * 8.0 if adaptacyjny else dt_s,
        tolerancja=tolerancja,
        tolerancja_kroku=tolerancja_kroku,
        eps_init=1e-8,
        max_iteracji_newtona=max_iteracji_newtona,
        max_nawrotow=40,
        horyzont_s=horyzont_s,
        krok_wyjscia_s=krok_wyjscia_s,
        integrator=integrator,  # type: ignore[arg-type]
        tolerancja_lokalizacji_zdarzen_s=tolerancja_lokalizacji_zdarzen_s,
    )


def uruchom(uklad: dict, harmonogram=(), dozory=(), **kw):
    """Bieg produktu na zadanym ukladzie, harmonogramie zdarzen i dozorach."""
    ust = nastawy(**kw)
    wejscie = WejscieDynamiki(
        wezly=uklad["wezly"],
        galezie=uklad["galezie"],
        odsprzegi=(),
        odbiory=uklad["odbiory"],
        urzadzenia=uklad["urzadzenia"],
        punkt_pracy=uklad["punkt_pracy"],
        harmonogram=HarmonogramDynamiki(zdarzenia=tuple(harmonogram), dozory=tuple(dozory)),
        nastawy=ust,
        s_bazowa_mva=S_BAZOWA_MVA,
        f_bazowa_hz=F_BAZOWA_HZ,
    )
    return SilnikDynamiki(wejscie).uruchom()


#: Strony probek odtwarzajace DAWNA siatke wyjscia (karta AB-1b.1 par. 0 pkt 0): probki
#: siatki `C` i probka prawostronna `P` kazdej chwili zdarzenia — dokladnie te chwile i te
#: stany, ktore rdzen oddawal przed wprowadzeniem probek obustronnych. Bramki mierzace
#: trajektorie wobec wyroczni czytaja te strony, zeby definicja porownania sie nie zmienila.
SIATKA_PRAWOSTRONNA = "CP"


def _indeksy_stron(wynik, strony: str) -> list[int]:
    if not strony or set(strony) - {"C", "L", "P"}:
        raise ValueError(f"Strony probek spoza zbioru C/L/P: {strony!r}")
    return [i for i, strona in enumerate(wynik.strona_probki) if strona in strony]


def szereg(wynik, klucz: str, *, strony: str) -> np.ndarray:
    """Probki kanalu o JAWNIE wskazanych stronach (`C`, `L`, `P`).

    Wartosc niedostepna (`None`) NIE jest zamieniana na NaN: `np.asarray(..., float)`
    zrobilby z niej NaN, a np. `max(0.0, nan)` zwraca 0,0 — brak zniknalby z pomiaru bez
    sladu. Kanal z `None` na wybranych stronach konczy sie tu jawnym bledem.
    """
    indeksy = _indeksy_stron(wynik, strony)
    wartosci = [wynik.probki[klucz][i] for i in indeksy]
    brakujace = [wynik.os_czasu_s[i] for i, w in zip(indeksy, wartosci, strict=True) if w is None]
    if brakujace:
        raise ValueError(
            f"Kanal {klucz} ma wartosc niedostepna (None) na stronach {strony!r} w chwilach "
            f"{brakujace[:5]} — wybierz strony jawnie, zamiast zamieniac brak na liczbe"
        )
    return np.asarray(wartosci, dtype=float)


def czas(wynik, *, strony: str) -> np.ndarray:
    """Chwile probek o JAWNIE wskazanych stronach (ta sama selekcja co `szereg`)."""
    return np.asarray([wynik.os_czasu_s[i] for i in _indeksy_stron(wynik, strony)], dtype=float)


def indeks_probki(wynik, t_s: float, strona: str) -> int:
    """Indeks JEDYNEJ probki o chwili `t_s` i stronie `strona` (blad, gdy brak/wiele)."""
    trafienia = [
        i
        for i, (t, s) in enumerate(zip(wynik.os_czasu_s, wynik.strona_probki, strict=True))
        if s == strona and abs(t - t_s) <= 1e-12
    ]
    if len(trafienia) != 1:
        raise ValueError(f"Probka t={t_s} strona {strona}: trafienia {trafienia}")
    return trafienia[0]


__all__ = [
    "F_BAZOWA_HZ",
    "SIATKA_PRAWOSTRONNA",
    "S_BAZOWA_MVA",
    "U_N_KV",
    "Z_BAZOWA_OM",
    "czas",
    "indeks_probki",
    "nastawy",
    "szereg",
    "uruchom",
    "zbuduj",
]
