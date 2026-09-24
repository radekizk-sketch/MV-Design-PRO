"""EKSPERYMENT PRZYCZYNOWY eps -> tau: skad bierze sie przesuniecie osi czasu.

PYTANIE. Runda 9 zmierzyla, ze w scenariuszach ZE ZDARZENIEM roznica miedzy
przebiegiem produktu a przebiegiem ANDES jest PRZESUNIECIEM OSI CZASU o
`tau = +5,0e-05 s` — STALYM w sekundach, niezaleznym od kroku calkowania (przy
polowieniu `dt` iloraz bledu wynosil 1,000, nie 2). Jednoczesnie w scenariuszach
BEZ zdarzenia `tau/dt` bylo stale i rowne okolo `-0,5`, a blad skalowal sie jak
`dt^1`. Postawiona wtedy hipoteza: `tau = eps/2`, gdzie `eps` to parametr
`System.store_switch_times(models, eps=1e-4)`, ktorym ANDES dokleja do siatki
czasu punkty `t - eps`, `t`, `t + eps` wokol kazdego zdarzenia.

To byla hipoteza oparta na JEDNEJ wartosci `eps`. Jedna wartosc nie odroznia
`eps/2` od dowolnej innej stalej rownej `5e-05 s`. R10 par. 12-15 zada dowodu
SKALOWANIA: jesli `tau*(eps)/eps` jest stale i rowne 1/2 na calym zamiataniu, a
`tau*` NIE zalezy od `dt`, hipoteza jest potwierdzona. Jesli nie skaluje sie z
`eps` — hipoteza jest ODRZUCONA i tak nalezy ja zaraportowac.

MECHANIZM, KTORY HIPOTEZA PRZEWIDUJE. Petla glowna ANDES (`routines/tds.py`)
wykonuje w jednej iteracji: `itm_step()` (calkowanie do chwili `t`), potem
`dae.store()` (ZAPIS probki w chwili `t`), a DOPIERO POTEM `do_switch()`
(wykonanie zdarzenia zaplanowanego na `t`). Probka ANDES w chwili zdarzenia jest
wiec stanem SPRZED zdarzenia. Nasz rdzen ma kontrakt odwrotny i jawny
(`silnik.py`: „probka w chwili `t` jest stanem PO wykonaniu wszystkich zdarzen
tej chwili"). Dodatkowo krok trapezowy ANDES z `t` do `t + eps` usrednia prawa
strone SPRZED i PO zdarzeniu, co jest rownowazne wykonaniu zdarzenia w SRODKU
tego przedzialu, czyli w `t + eps/2`.

CZEGO TEN EKSPERYMENT NIE TWIERDZI. Nie twierdzi, ze ANDES liczy zle. Twierdzi
wylacznie, skad bierze sie roznica na UZYTEJ SCIEZCE POROWNANIA — i pozwala te
roznice usunac z porownania zamiast przypisywac ja fizyce ktoregokolwiek z
programow.
"""

from __future__ import annotations

import json
from contextlib import contextmanager
from dataclasses import dataclass

import numpy as np
from network_model.solvers.dynamika import ZwarcieWezla
from scipy.optimize import minimize_scalar

from tests.network_model.dynamika import uklady
from tests.network_model.dynamika.wyrocznia_andes import sem_szyny, zbuduj_system
from tests.walidacja_fizyczna import stanowisko

#: Zamiatanie `eps` wokol wartosci domyslnej ANDES (1e-4 s) — po dwa rzedy w obie strony.
EPS_ZAMIATANE_S: tuple[float, ...] = (2.5e-5, 5.0e-5, 1.0e-4, 2.0e-4, 4.0e-4)

#: Kroki calkowania do macierzy `dt x eps` (R10 par. 14).
DT_ZAMIATANE_S: tuple[float, ...] = (1.0e-3, 5.0e-4, 2.5e-4, 1.25e-4)

#: Scenariusz: zwarcie przez reaktancje na szynie generatora, zdejmowane.
ZWARCIE = {"t_s": 0.3, "r_f_pu": 0.0, "x_f_pu": 0.2, "t_usuniecia_s": 0.4}
HORYZONT_S = 2.0

#: Okno porownania — CALY odcinek po zdjeciu zwarcia, z zapasem na brzeg siatki.
OKNO_OD_S = 0.45


@contextmanager
def wymuszony_eps(eps_s: float):
    """Podmien `System.store_switch_times` tak, by uzywal zadanego `eps`.

    Podmiana jest OPAKOWANIEM oryginalu (nie kopia jego cial), wiec nie powiela
    logiki ANDES i nie moze sie z nia rozjechac. Zdejmowana bezwarunkowo.
    """
    import andes

    oryginal = andes.system.System.store_switch_times

    def zastepnik(self, models, eps=eps_s):  # noqa: ANN001
        return oryginal(self, models, eps=eps_s)

    andes.system.System.store_switch_times = zastepnik
    try:
        yield
    finally:
        andes.system.System.store_switch_times = oryginal


@dataclass(frozen=True)
class Przebieg:
    czas_s: np.ndarray
    delta_rad: np.ndarray


def przebieg_produktu(dt_s: float) -> Przebieg:
    """Bieg RDZENIA na tym samym ukladzie i tym samym zdarzeniu."""
    uklad = stanowisko.zbuduj()
    zdarzenie = ZwarcieWezla(
        t_s=ZWARCIE["t_s"],
        wezel="GEN",
        typ="3F",
        r_f_ohm=ZWARCIE["r_f_pu"] * stanowisko.Z_BAZOWA_OM,
        x_f_ohm=ZWARCIE["x_f_pu"] * stanowisko.Z_BAZOWA_OM,
        t_usuniecia_s=ZWARCIE["t_usuniecia_s"],
        sposob_usuniecia="samoczynne",
    )
    wynik = stanowisko.uruchom(
        uklad, (zdarzenie,), horyzont_s=HORYZONT_S, dt_s=dt_s, krok_wyjscia_s=dt_s
    )
    import cmath

    odniesienie = cmath.phase(sem_szyny(uklady.zbuduj_smib()))
    return Przebieg(
        czas_s=stanowisko.czas(wynik, strony=stanowisko.SIATKA_PRAWOSTRONNA),
        delta_rad=stanowisko.szereg(wynik, "delta_rad@G1", strony=stanowisko.SIATKA_PRAWOSTRONNA)
        - odniesienie,
    )


def przebieg_andes(dt_s: float, eps_s: float) -> Przebieg:
    """Bieg WYROCZNI z wymuszonym `eps` siatki zdarzen."""
    import cmath

    uklad = uklady.zbuduj_smib()
    with wymuszony_eps(eps_s):
        system = zbuduj_system(uklad, zwarcie=ZWARCIE)
        system.PFlow.run()
        system.TDS.config.tf = HORYZONT_S
        system.TDS.config.tstep = dt_s
        system.TDS.config.tol = 1.0e-10
        system.TDS.run()
    odniesienie = cmath.phase(sem_szyny(uklad))
    czas = np.array(system.dae.ts.t, dtype=float)
    indeks = system.GENCLS.delta.a[0]
    delta = np.array([w[indeks] for w in system.dae.ts.x], dtype=float)
    return Przebieg(czas_s=czas, delta_rad=delta - odniesienie)


def blad_po_przesunieciu(
    produkt: Przebieg, wzorzec: Przebieg, tau_s: float, od_s: float, do_s: float
) -> float:
    """`max_t | delta_wzorca(t + tau) - delta_produktu(t) |` na zadanym odcinku."""
    maska = (produkt.czas_s >= od_s) & (produkt.czas_s <= do_s)
    if not maska.any():
        raise AssertionError(f"Odcinek [{od_s}, {do_s}] nie zawiera probek")
    chwile = produkt.czas_s[maska] + tau_s
    if chwile.min() < wzorzec.czas_s[0] or chwile.max() > wzorzec.czas_s[-1]:
        raise AssertionError(
            "Przesuniete chwile wychodza poza wzorzec — interpolacja "
            "przytrzymalaby skrajna wartosc (R10 par. 16)."
        )
    na_siatce = np.interp(chwile, wzorzec.czas_s, wzorzec.delta_rad)
    return float(np.max(np.abs(na_siatce - produkt.delta_rad[maska])))


def tau_optymalne(produkt: Przebieg, wzorzec: Przebieg, *, zakres_s: float) -> dict[str, float]:
    """Znajdz `tau*` minimalizujace blad; zwroc takze blad przed i po korekcie."""
    do_s = min(float(produkt.czas_s[-1]), float(wzorzec.czas_s[-1])) - zakres_s
    bez_korekty = blad_po_przesunieciu(produkt, wzorzec, 0.0, OKNO_OD_S, do_s)
    optimum = minimize_scalar(
        lambda tau: blad_po_przesunieciu(produkt, wzorzec, tau, OKNO_OD_S, do_s),
        bounds=(-zakres_s, zakres_s),
        method="bounded",
        options={"xatol": 1e-14},
    )
    return {
        "tau_optymalne_s": float(optimum.x),
        "blad_bez_korekty_rad": bez_korekty,
        "blad_po_korekcie_rad": float(optimum.fun),
        "redukcja_krotnosc": (bez_korekty / float(optimum.fun) if optimum.fun else float("inf")),
    }


def zamiatanie_eps(dt_s: float = 5.0e-4) -> list[dict[str, float]]:
    """PIERWSZY test hipotezy: `tau*` wobec `eps` przy STALYM kroku calkowania."""
    produkt = przebieg_produktu(dt_s)
    wiersze: list[dict[str, float]] = []
    for eps in EPS_ZAMIATANE_S:
        wzorzec = przebieg_andes(dt_s, eps)
        pomiar = tau_optymalne(produkt, wzorzec, zakres_s=max(3.0 * dt_s, 3.0 * eps))
        pomiar.update({"dt_s": dt_s, "eps_s": eps, "tau_na_eps": pomiar["tau_optymalne_s"] / eps})
        wiersze.append(pomiar)
    return wiersze


def macierz_dt_eps(
    kroki: tuple[float, ...] = DT_ZAMIATANE_S,
    epsilony: tuple[float, ...] = (5.0e-5, 1.0e-4, 2.0e-4),
) -> list[dict[str, float]]:
    """DRUGI test: czy `tau*` zalezy od `dt` (nie powinno), a od `eps` (powinno)."""
    wiersze: list[dict[str, float]] = []
    for dt_s in kroki:
        produkt = przebieg_produktu(dt_s)
        for eps in epsilony:
            wzorzec = przebieg_andes(dt_s, eps)
            pomiar = tau_optymalne(produkt, wzorzec, zakres_s=max(3.0 * dt_s, 3.0 * eps))
            pomiar.update(
                {"dt_s": dt_s, "eps_s": eps, "tau_na_eps": pomiar["tau_optymalne_s"] / eps}
            )
            wiersze.append(pomiar)
    return wiersze


def kryminalistyka_zdarzenia(dt_s: float = 5.0e-4, eps_s: float = 1.0e-4) -> dict:
    """TRZECI test: co ANDES ma W PROBCE w chwili zdarzenia — stan sprzed czy po.

    Sprawdzenie jest BEZPOSREDNIE: porownujemy probke ANDES w chwili `t_zw` z
    wartoscia, ktora przebieg mialby, gdyby zdarzenie jeszcze nie zaszlo
    (ekstrapolacja z dwoch probek sprzed zdarzenia), oraz z probka `t_zw + eps`.
    Kat wirnika jest CIAGLY przez zdarzenie, wiec rozroznienia szukamy w
    wielkosci, ktora skacze: w mocy elektrycznej / napieciu wezla.
    """
    uklad = uklady.zbuduj_smib()
    with wymuszony_eps(eps_s):
        system = zbuduj_system(uklad, zwarcie=ZWARCIE)
        system.PFlow.run()
        system.TDS.config.tf = 0.5
        system.TDS.config.tstep = dt_s
        system.TDS.config.tol = 1.0e-10
        system.TDS.run()
    czas = np.array(system.dae.ts.t, dtype=float)
    indeks_v = system.Bus.v.a[0]
    napiecie = np.array([w[indeks_v] for w in system.dae.ts.y], dtype=float)

    t_zw = float(ZWARCIE["t_s"])
    siatka_wokol = [float(x) for x in czas[(czas >= t_zw - 3 * eps_s) & (czas <= t_zw + 3 * eps_s)]]

    def probka(chwila: float) -> float | None:
        blisko = np.flatnonzero(np.abs(czas - chwila) <= 1e-12)
        return float(napiecie[blisko[0]]) if blisko.size else None

    przed = probka(t_zw - eps_s)
    w_chwili = probka(t_zw)
    po = probka(t_zw + eps_s)
    return {
        "eps_s": eps_s,
        "dt_s": dt_s,
        "siatka_czasu_wokol_zdarzenia_s": siatka_wokol,
        "napiecie_w_t_minus_eps_pu": przed,
        "napiecie_w_t_pu": w_chwili,
        "napiecie_w_t_plus_eps_pu": po,
        "probka_w_chwili_zdarzenia_jest": (
            "SPRZED ZDARZENIA"
            if przed is not None and w_chwili is not None and abs(w_chwili - przed) < 1e-6
            else (
                "PO ZDARZENIU"
                if po is not None and w_chwili is not None and abs(w_chwili - po) < 1e-6
                else "NIEROZSTRZYGNIETE"
            )
        ),
        "kolejnosc_w_petli_andes": (
            "itm_step -> dae.store -> do_switch (routines/tds.py: 397, 406, 430) — "
            "zapis probki POPRZEDZA wykonanie zdarzenia tej samej chwili"
        ),
        "kontrakt_rdzenia": (
            "probka w chwili t jest stanem PO wykonaniu wszystkich zdarzen tej chwili "
            "(silnik.py, docstring modulu)"
        ),
    }


def pierwszy_krok_po_zdarzeniu_s(dt_s: float, eps_s: float) -> float:
    """Dlugosc PIERWSZEGO kroku, ktory ANDES wykona po zdarzeniu: `min(eps, dt)`.

    ANDES przycina krok, zeby nie przeskoczyc nastepnej chwili przelaczenia
    (`routines/tds.py`: `if (dae.t + h) > switch_times[idx]: h = switch_times[idx] - dae.t`).
    Po zdarzeniu w chwili `t` nastepna chwila na siatce przelaczen to `t + eps`, wiec
    krok wynosi `eps`, o ile `eps < dt`; w przeciwnym razie zwykly krok `dt` konczy sie
    wczesniej i to on jest pierwszy.
    """
    return min(eps_s, dt_s)


def werdykt(zamiatanie: list[dict[str, float]], macierz: list[dict[str, float]]) -> dict:
    """PROVEN / SUPPORTED / UNRESOLVED / REFUTED wedlug samych liczb (R10 par. 42 D).

    HIPOTEZA W POSTACI OSTATECZNEJ: `tau* = min(eps, dt) / 2`, czyli POLOWA
    PIERWSZEGO KROKU wykonanego po zdarzeniu.

    Jak doszlo do tej postaci — uczciwie. Hipoteza wyjsciowa brzmiala `tau* = eps/2`
    i zostala postawiona na JEDNEJ wartosci `eps` (runda 9). Zamiatanie `eps` przy
    stalym `dt = 5e-4 s` ja potwierdzilo (`tau*/eps` = 0,5006 / 0,5012 / 0,50007 /
    0,50016 / 0,49999 dla `eps` od 2,5e-5 do 4e-4 — zakres 16-krotny, a blad bez
    korekty skalowal sie z `eps` LINIOWO). Ale macierz `dt x eps` ja ZLAMALA w
    jednym punkcie: dla `dt = 1,25e-4 s` i `eps = 2e-4 s` wyszlo `tau*/eps = 0,309`,
    a nie 0,5. Ten punkt jest JEDYNYM w macierzy, w ktorym `eps > dt`. Zmierzone
    `tau* = 6,174e-05 s` to 0,494 * `dt` — czyli polowa kroku `dt`, nie polowa `eps`.

    To nie jest dopasowanie po fakcie, tylko konsekwencja tego samego mechanizmu:
    trapez na PIERWSZYM przedziale po zdarzeniu usrednia prawa strone sprzed i po
    zdarzeniu, co jest rownowazne wykonaniu zdarzenia w SRODKU tego przedzialu.
    Dlugoscia tego przedzialu jest `eps` tylko dopoki `eps < dt`. Hipoteza wyjsciowa
    byla wiec NIEPELNA (prawdziwa w zakresie, w ktorym ja mierzono), a nie falszywa
    — i tak nalezy ja raportowac.
    """
    odchylenia = []
    for wiersz in list(zamiatanie) + list(macierz):
        krok = pierwszy_krok_po_zdarzeniu_s(wiersz["dt_s"], wiersz["eps_s"])
        odchylenia.append(
            {
                "dt_s": wiersz["dt_s"],
                "eps_s": wiersz["eps_s"],
                "pierwszy_krok_s": krok,
                "tau_optymalne_s": wiersz["tau_optymalne_s"],
                "tau_na_polowe_kroku": wiersz["tau_optymalne_s"] / (0.5 * krok),
            }
        )
    najgorsze = max(abs(x["tau_na_polowe_kroku"] - 1.0) for x in odchylenia)

    # Kontrola hipotezy WYJSCIOWEJ (tau = eps/2) na tych samych danych — zeby bylo
    # widac, ze rozroznienie miedzy nia a postacia ostateczna JEST mierzalne.
    najgorsze_wyjsciowej = max(
        abs(w["tau_optymalne_s"] / (0.5 * w["eps_s"]) - 1.0)
        for w in list(zamiatanie) + list(macierz)
    )

    if najgorsze <= 0.05:
        ocena = "PROVEN"
    elif najgorsze <= 0.15:
        ocena = "SUPPORTED"
    elif najgorsze > 0.5:
        ocena = "REFUTED"
    else:
        ocena = "UNRESOLVED"
    return {
        "hipoteza_ostateczna": "tau* = min(eps, dt)/2 — polowa PIERWSZEGO kroku po zdarzeniu",
        "hipoteza_wyjsciowa_rundy_9": "tau* = eps/2 (prawdziwa wylacznie dla eps < dt)",
        "odchylenia": odchylenia,
        "najgorsze_odchylenie_hipotezy_ostatecznej": najgorsze,
        "najgorsze_odchylenie_hipotezy_wyjsciowej": najgorsze_wyjsciowej,
        "OCENA": ocena,
    }


def zamiatanie_dt_przy_stalym_eps(
    eps_s: float = 2.0e-4,
    kroki: tuple[float, ...] = (1.0e-3, 5.0e-4, 2.5e-4, 1.25e-4, 6.25e-5),
) -> list[dict[str, float]]:
    """TEST ROZSTRZYGAJACY: przy STALYM `eps` zamiatamy `dt` przez punkt zalamania.

    Predykcja postaci ostatecznej jest OSTRA i falsyfikowalna: dla `dt > eps`
    (trzy pierwsze kroki) `tau*` ma stac na `eps/2 = 1,0e-4 s`, a dla `dt < eps`
    (dwa ostatnie) ma ZJECHAC do `dt/2`, czyli 6,25e-5 i 3,125e-5 s. Hipoteza
    wyjsciowa `tau = eps/2` przewiduje plaska linie na calym zamiataniu.
    """
    wiersze: list[dict[str, float]] = []
    for dt_s in kroki:
        produkt = przebieg_produktu(dt_s)
        wzorzec = przebieg_andes(dt_s, eps_s)
        pomiar = tau_optymalne(produkt, wzorzec, zakres_s=max(3.0 * dt_s, 3.0 * eps_s))
        krok = pierwszy_krok_po_zdarzeniu_s(dt_s, eps_s)
        pomiar.update(
            {
                "dt_s": dt_s,
                "eps_s": eps_s,
                "pierwszy_krok_s": krok,
                "tau_na_eps": pomiar["tau_optymalne_s"] / eps_s,
                "tau_na_polowe_kroku": pomiar["tau_optymalne_s"] / (0.5 * krok),
            }
        )
        wiersze.append(pomiar)
    return wiersze


if __name__ == "__main__":  # pragma: no cover — wejscie eksperymentu
    zam = zamiatanie_eps()
    for wiersz in zam:
        print(json.dumps(wiersz), flush=True)
    mac = macierz_dt_eps()
    for wiersz in mac:
        print(json.dumps(wiersz), flush=True)
    zam_dt = zamiatanie_dt_przy_stalym_eps()
    for wiersz in zam_dt:
        print(json.dumps(wiersz), flush=True)
    print("=== RAPORT ===")
    print(
        json.dumps(
            {
                "zamiatanie_eps": zam,
                "macierz_dt_eps": mac,
                "zamiatanie_dt_przy_stalym_eps": zam_dt,
                "kryminalistyka": kryminalistyka_zdarzenia(),
                "werdykt": werdykt(zam, mac + zam_dt),
            },
            indent=1,
            ensure_ascii=False,
            default=str,
        )
    )
