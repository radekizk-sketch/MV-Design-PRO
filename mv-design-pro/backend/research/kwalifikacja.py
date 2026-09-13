#!/usr/bin/env python3
"""Uprząż kwalifikacyjna — JEDNO polecenie, wynik MASZYNOWY.

KOD BADAWCZY — patrz `backend/research/README.md`.

PO CO. Dowody laboratorium są rozsiane po 851 testach. Prowadzący nie powinien
rekonstruować z nich stanu ręcznie — to jest praca, przy której łatwo przeoczyć
brak, a brak jest tu najważniejszą informacją. Ta uprząż uruchamia komplet i
zwraca jeden dokument JSON.

CZEGO TA UPRZĄŻ NIE ROBI. Nie nadaje żadnego statusu dowodowego i nie może:
warstwa dynamiczna pozostaje ``UNVALIDATED_MODEL``, a promocja jest decyzją
architektoniczną prowadzącego. Zielony wynik uprzęży znaczy „zmierzone i
spójne", nigdy „zwalidowane".

POMINIĘTA WYROCZNIA JEST WIDOCZNA JAKO POMINIĘTA. Gdy ANDES nie jest
zainstalowany, sekcja wyroczni zewnętrznej mówi to wprost, a pole
``dowod_zewnetrzny_istnieje`` jest ``false``. Brak dowodu nie zamienia się w
jego posiadanie przez to, że nic się nie wywaliło.

Uruchomienie:
    python backend/research/kwalifikacja.py            # pełny bieg
    python backend/research/kwalifikacja.py --szybko   # bez CCT i drabiny kroku
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import math
import pathlib
import sys
import time
from collections.abc import Iterable, Mapping
from enum import StrEnum
from typing import Any

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))


from dynamic_lab.benchmarki import (  # noqa: E402
    czas_krytyczny_zwarcia,
    porownaj_integratory,
    siec_sn_z_der,
    smib,
)
from dynamic_lab.calkowanie import INTEGRATORY  # noqa: E402
from dynamic_lab.katalog_mutacji import mutacje_laboratorium  # noqa: E402
from dynamic_lab.mutacje import uruchom_kampanie  # noqa: E402
from dynamic_lab.silnik import SilnikRMS  # noqa: E402
from dynamic_lab.sonda_mutacyjna import wykonaj_sondy_w_podprocesie  # noqa: E402
from dynamic_lab.tozsamosc import odcisk_implementacji  # noqa: E402
from dynamic_lab.walidacja import WyroczniaRownychPol  # noqa: E402

#: Wyrocznie zewnętrzne, o które pytamy przy każdym biegu.
WYROCZNIE_ZEWNETRZNE: tuple[tuple[str, str], ...] = (
    ("dynamika_andes", "andes"),
    ("rozplyw_pandapower", "pandapower"),
)


def _stan_wyroczni_zewnetrznych() -> dict[str, Any]:
    """Stan wyroczni — POMINIĘTA jest osobnym stanem, nie brakiem wpisu."""
    raporty: list[dict[str, Any]] = []
    for nazwa, pakiet in WYROCZNIE_ZEWNETRZNE:
        specyfikacja = importlib.util.find_spec(pakiet)
        if specyfikacja is None:
            raporty.append(
                {
                    "nazwa": nazwa,
                    "pakiet": pakiet,
                    "stan": "POMINIETA",
                    "powod": (
                        f"Pakiet '{pakiet}' nie jest zainstalowany. Porównanie NIE "
                        f"zostało wykonane — ten bieg nie wnosi dowodu niezależnego."
                    ),
                }
            )
            continue
        modul = importlib.import_module(pakiet)
        raporty.append(
            {
                "nazwa": nazwa,
                "pakiet": pakiet,
                "stan": "DOSTEPNA",
                "wersja": str(getattr(modul, "__version__", "nieznana")),
            }
        )
    return {
        "raporty": raporty,
        "dowod_zewnetrzny_mozliwy": all(r["stan"] == "DOSTEPNA" for r in raporty),
    }


def _porownanie_trajektorii(szybko: bool) -> dict[str, Any]:
    """Trajektoria wobec ANDES — ODCINKAMI, z werdyktem wg jawnego kryterium.

    CO TO MIERZY, A CZEGO NIE. Jest to cross-check NUMERYCZNY dwóch implementacji
    tego samego modelu klasycznego, nie walidacja fizyczna — i wynik mówi to
    wprost w polu ``czego_status_NIE_znaczy``. Werdykt
    ``ZGODNE_W_GRANICACH_WZORCA`` znaczy „w granicach niepewności WŁASNEJ wzorca,
    zmierzonej całką pierwszą", i niczego ponadto.

    W trybie ``--szybko`` drabina kroku jest pomijana (osiem biegów wzorca i
    laboratorium), a status zostaje NIEROZSTRZYGNIĘTY tam, gdzie drabina była
    potrzebna — brak pomiaru jest raportowany jako brak, nie jako zgodność.
    """
    if importlib.util.find_spec("andes") is None:
        return {
            "stan": "POMINIETE",
            "powod": "ANDES niezainstalowany — porównanie trajektorii NIE wykonane.",
        }
    from dynamic_lab.wzorzec_trajektoria import odbior_trajektorii

    ocena = odbior_trajektorii(integrator="rk4", z_drabina=not szybko)
    return {"stan": "WYKONANE", **ocena.to_dict()}


def _residua_inicjalizacji() -> dict[str, Any]:
    """‖f(x₀,y₀)‖ i residuum sieci dla przypadków odniesienia."""
    wyniki: list[dict[str, Any]] = []
    for nazwa, buduj in (("smib", smib), ("siec_sn_z_der", siec_sn_z_der)):
        model, moce = buduj()
        silnik = SilnikRMS(model, integrator="rk4", krok_s=0.002)
        x0 = silnik.inicjalizuj(moce)
        v0 = silnik.rozwiaz_siec(x0)
        wyniki.append(
            {
                "przypadek": nazwa,
                "norma_pochodnej": float(silnik.norma_pochodnej(x0)),
                "liczba_stanow": int(x0.size),
                "liczba_szyn": int(v0.size),
            }
        )
    return {
        "przypadki": wyniki,
        "najgorsza_norma_pochodnej": max(w["norma_pochodnej"] for w in wyniki),
    }


def _porownanie_integratorow(szybko: bool) -> dict[str, Any]:
    if szybko:
        return {"stan": "POMINIETE", "powod": "tryb --szybko"}
    wyniki = porownaj_integratory(kroki_s=(0.002, 0.010), czas_koncowy_s=2.0)
    # POLA CZYTANE WPROST, BEZ `getattr` z wartością zastępczą. Pierwsza wersja
    # tej funkcji używała `getattr(w, "blad_maks", None)` i po cichu wypisywała
    # `null` dla KAŻDEJ pozycji, bo kontrakt nazywa to pole inaczej. Raport
    # wyglądał na kompletny i nie niósł ani jednej liczby — dokładnie ta klasa
    # cichej porażki, którą ta uprząż ma wykrywać. Zmiana kontraktu ma teraz
    # wywalić raport GŁOŚNO, a nie wypełnić go pustkami.
    return {
        "stan": "WYKONANE",
        "pozycje": [
            {
                "integrator": w.nazwa,
                "krok_s": w.krok_s,
                "blad_max_vs_odniesienie": w.blad_max_vs_odniesienie,
                "ewaluacje_pochodnych": w.ewaluacje_pochodnych,
                "zbiegl": w.zbiegl,
                "czestotliwosc_oscylacji_hz": w.czestotliwosc_oscylacji_hz,
            }
            for w in wyniki
        ],
    }


#: Dopuszczalny błąd względny CCT wobec zamkniętego wzoru równych pól.
#: Wyprowadzony z ROZDZIELCZOŚCI bisekcji (0,005 s przy CCT ≈ 0,42 s daje 1,2 %),
#: a nie dobrany pod wynik — patrz `tests/research/test_cct_wyrocznia.py`.
TOLERANCJA_CCT_WZGLEDNA = 0.015


def _czas_krytyczny(szybko: bool) -> dict[str, Any]:
    """CCT z symulacji KONTRA zamknięty wzór kryterium równych pól.

    PORÓWNANIE JEST WYKONYWANE, NIE ZAPOWIADANE (recenzja niezależna,
    P2-DELTA-22). Poprzednia wersja miała ten docstring i zwracała wyłącznie
    ``cct_symulacja_s`` — zapowiedź wyroczni bez wyroczni. Wartość analityczna
    istniała w laboratorium (``WyroczniaRownychPol``) i była używana w testach,
    więc raport pomijał porównanie, które dało się zrobić jedną linią.
    """
    if szybko:
        return {"stan": "POMINIETE", "powod": "tryb --szybko"}
    h_s, x_linii = 4.0, 0.15
    cct_symulacja = czas_krytyczny_zwarcia(h_s=h_s, x_linii_pu=x_linii, dokladnosc_s=0.005)

    # Wyrocznia budowana Z PUNKTU PRACY LABORATORIUM. Gdyby `delta0` i `E'`
    # pochodziły z osobnego rachunku, porównywalibyśmy dwie różne konfiguracje.
    model, moce = smib(h_s=h_s, x_linii_pu=x_linii)
    silnik = SilnikRMS(model, integrator="rk4", krok_s=0.004)
    x0 = silnik.inicjalizuj(moce)
    wyrocznia = WyroczniaRownychPol(
        e_prim_pu=float(x0[2]),
        v_sys_pu=1.0,
        x_calkowite_pu=0.30 + x_linii,
        delta0_rad=float(x0[0]),
        p0_pu=0.5,
        h_s=h_s,
    )
    cct_analityczny = wyrocznia.czas_krytyczny_s
    blad_wzgledny = abs(cct_symulacja - cct_analityczny) / cct_analityczny
    return {
        "stan": "WYKONANE",
        "h_s": h_s,
        "x_linii_pu": x_linii,
        "cct_symulacja_s": cct_symulacja,
        "cct_analityczny_s": cct_analityczny,
        "blad_wzgledny": blad_wzgledny,
        "tolerancja_wzgledna": TOLERANCJA_CCT_WZGLEDNA,
        "zgodne": blad_wzgledny <= TOLERANCJA_CCT_WZGLEDNA,
    }


#: Domyślny wykonawca sond kampanii: REALNE podmiany kodu w procesach potomnych.
#: Wystawiony jako stała, żeby dało się go PRZYPIĄĆ testem — uprząż, w której
#: ktoś podmieniłby go na atrapę, meldowałaby zabicia bez uruchomienia czegokolwiek.
WYKONAWCA_SOND_DOMYSLNY = wykonaj_sondy_w_podprocesie


def _kampania_mutacyjna(wykonaj_sondy: Any) -> dict[str, Any]:
    """Kampania na REALNYCH podmianach kodu, każda z kontrolą bazową.

    Kosztowna z definicji: każda mutacja to dwa przebiegi sond w procesach
    potomnych (pomiar: 61 s dla dziesięciu mutacji). Taniej się nie da bez
    rezygnacji z kontroli bazowej, a bez niej „zabicie" przestaje cokolwiek
    znaczyć (plan naprawy §4).
    """
    return uruchom_kampanie(mutacje_laboratorium(), wykonaj_sondy=wykonaj_sondy).to_dict()


#: Największe dopuszczalne ``||f(x0, y0)||`` przy inicjalizacji. Wartość NIE jest
#: dobrana pod pomiar: to tolerancja równowagi, której używa sam silnik
#: (`SilnikRMS.tolerancja_rownowagi`), czyli próg, po którym laboratorium samo
#: orzeka „start jest w równowadze". Zmierzone: SMIB 8,3267e-17, sieć SN z DER 0,0.
MAKS_NORMA_POCHODNEJ_W_T0 = 1.0e-6

#: Dopuszczalne odchylenie RZĘDU OBSERWOWANEGO od rzędu zadeklarowanego.
#:
#: KOREKTA WŁASNEGO BŁĘDU (recenzja niezależna, P1-DELTA-36). Pierwsza wersja
#: bramkowała BEZWZGLĘDNY błąd pozycji progiem 1e-2 rad, uzasadniając go
#: pomiarami RK4 i trapezu (1,438e-09 … 1,002e-03). Zestaw porównania zawiera
#: jednak TAKŻE dwie metody Eulera, a ich błędy — całkowicie poprawne dla rzędu 1
#: — wynoszą 1,262e-02 … 1,119e-01 rad. Próg odrzucał więc DETERMINISTYCZNIE
#: własny, niezmieniony benchmark laboratorium. Nie zauważyłem tego, bo dobrałem
#: próg z liczb, które akurat miałem przepisane w raporcie, i nie uruchomiłem
#: pełnej uprzęży po dołożeniu bramki.
#:
#: Jeden próg bezwzględny dla metod RÓŻNEGO RZĘDU jest zresztą błędny co do
#: zasady: metoda rzędu 1 przy kroku 10 ms MA mieć błąd rzędu 0,1 rad i nie jest
#: to defekt, tylko jej definicja. Sensowne kryterium porównuje rząd OBSERWOWANY
#: z ZADEKLAROWANYM (`Integrator.rzad`) — czyli sprawdza, czy metoda zachowuje
#: się jak ta, za którą się podaje. To ta sama reguła, co w §5: rząd się MIERZY,
#: nie czyta z etykiety.
#:
#: ZMIERZONE (kroki 2 ms i 10 ms, horyzont 2 s):
#:   euler_jawny     rząd 1 -> obserwowany 1,243  (odchylenie 0,243)
#:   euler_niejawny  rząd 1 -> obserwowany 0,796  (odchylenie 0,204)
#:   rk4             rząd 4 -> obserwowany 4,002  (odchylenie 0,002)
#:   trapez_niejawny rząd 2 -> obserwowany 1,999  (odchylenie 0,001)
#: Pasmo 0,5 daje zapas ponad dwukrotny wobec najgorszego odchylenia, a złapałoby
#: degradację o cały rząd (np. RK4 liczące jak metoda rzędu 2: odchylenie 2,0).
MAKS_ODCHYLENIE_RZEDU = 0.5

#: Największy dopuszczalny błąd pozycji NAJGĘSTSZEJ [rad] — miara WIELKOŚCI,
#: uzupełniająca kryterium rzędu.
#:
#: Sam rząd nie wystarcza: metoda z błędem 1e99 przy obu krokach, skalującym się
#: jak ``dt^4``, ma rząd obserwowany 4 i przeszłaby kontrolę rzędu, nie mówiąc o
#: zagadnieniu nic. Potrzebna jest więc druga miara — ale NIE druga stała
#: dobrana per metoda, bo to był właśnie defekt P1-DELTA-36.
#:
#: Ten próg wynika z SYGNAŁU, nie z metody, więc stosuje się jednakowo do
#: wszystkich: kąt wirnika kołysze się w tych przypadkach o rząd 1 rad, a błąd
#: porównywalny z amplitudą znaczy, że przebieg nie opisuje kołysania. Dlatego
#: liczy się go WYŁĄCZNIE na kroku najgęstszym, gdzie każda metoda ma prawo być
#: najbliżej odniesienia.
#:
#: ZMIERZONE na kroku 2 ms: euler_jawny 1,513e-02, euler_niejawny 1,262e-02,
#: rk4 1,438e-09, trapez 4,011e-05 — najgorsza legalna wartość ma 33-krotny zapas.
MAKS_BLAD_NA_NAJGESTSZYM_KROKU_RAD = 0.5


#: Statusy werdyktu, które ta uprząż ROZPOZNAJE. Zbiór ZAMKNIĘTY: status spoza
#: niego nie jest statusem dobrym, tylko werdyktem, którego uprząż nie umie
#: odczytać — a nieodczytanego werdyktu nie wolno liczyć jako pozytywny.
STATUSY_ROZPOZNAWANE: frozenset[str] = frozenset(
    {"zgodne_w_granicach_wzorca", "niezgodne", "nierozstrzygniete"}
)

#: Statusy, które NIE rozstrzygają — idą do braków, nie do luk.
STATUSY_BEZ_ROZSTRZYGNIECIA: frozenset[str] = frozenset({"nierozstrzygniete"})


class StatusKwalifikacji(StrEnum):
    """Trzy stany, nie dwa (recenzja niezależna, P1-DELTA-33).

    Poprzednia wersja zbierała wyłącznie LUKI, a pominięty albo nierozstrzygnięty
    pomiar luką nie był — co samo w sobie było słuszne. Skutek jednak był taki, że
    kod wyjścia wynosił 0, czyli pominięcie ZRÓWNYWAŁO SIĘ z kwalifikacją. Zdanie
    z komentarza („nie wolno mylić pominięcia ani z porażką, ani z sukcesem")
    wymaga TRZECIEGO stanu, bo przy dwóch każdy brak musi wpaść do jednego z nich.
    """

    ZAKWALIFIKOWANE = "ZAKWALIFIKOWANE"
    """Każdy wymagany pomiar WYKONANY i mieszczący się we własnym kryterium."""
    NIEKOMPLETNE = "NIEKOMPLETNE"
    """Wymagany pomiar pominięty albo nierozstrzygnięty — brak dowodu, nie porażka."""
    ODRZUCONE = "ODRZUCONE"
    """Pomiar wykonany i POZA kryterium — to jest porażka kwalifikacji."""


def _braki_kwalifikacji(raport: dict[str, Any]) -> list[str]:
    """Wymagane pomiary, których NIE MA albo są nierozstrzygnięte.

    Brak dowodu nie jest dowodem braku ani dowodem posiadania — dlatego zbierany
    osobno od luk i dlatego daje własny status i własny kod wyjścia.
    """
    braki: list[str] = []
    for klucz, opis, wymagane in (
        ("trajektoria_vs_andes", "porównanie trajektorii z wzorcem zewnętrznym", ("status",)),
        (
            "czas_krytyczny_zwarcia",
            "czas krytyczny zwarcia wobec kryterium równych pól",
            ("zgodne",),
        ),
        ("porownanie_integratorow", "porównanie integratorów", ("pozycje",)),
    ):
        sekcja = raport.get(klucz) or {}
        stan = sekcja.get("stan")
        if stan != "WYKONANE":
            braki.append(f"{opis}: {stan or 'BRAK SEKCJI'} — pomiar nie został wykonany")
            continue
        # POLA WYMAGANE — `WYKONANE` bez werdyktu nie jest wykonanym pomiarem.
        for pole in wymagane:
            if sekcja.get(pole) is None:
                braki.append(f'{opis}: brak wymaganego pola „{pole}" mimo stanu WYKONANE')
        # POPULACJA NIEPUSTA — lista zero pozycji nie daje żadnych naruszeń, więc
        # bez tego warunku pusty benchmark przechodziłby jako bezbłędny.
        if "pozycje" in wymagane and not (sekcja.get("pozycje") or []):
            braki.append(f"{opis}: zero pozycji porównania — nie ma czego oceniać")
        # ZAMKNIĘTY ZBIÓR STATUSÓW — status nieznany NIE jest statusem dobrym.
        status = sekcja.get("status")
        if status is not None and status not in STATUSY_ROZPOZNAWANE:
            braki.append(
                f'{opis}: status „{status}" spoza zamkniętego zbioru '
                f"{sorted(STATUSY_ROZPOZNAWANE)} — nierozpoznanego werdyktu nie wolno "
                f"czytać jako pozytywnego"
            )
        elif status in STATUSY_BEZ_ROZSTRZYGNIECIA:
            braki.append(
                f"{opis}: NIEROZSTRZYGNIĘTE — "
                f"{sekcja.get('nierozstrzygniete') or 'bez podanej przyczyny'}"
            )
    return braki


def _luki_rzedu_integratorow(pozycje: Iterable[Mapping[str, Any]]) -> list[str]:
    """Rząd OBSERWOWANY każdej metody wobec jej rzędu ZADEKLAROWANEGO.

    Rząd liczony z dwóch kroków tej samej metody: ``p = log(e2/e1)/log(dt2/dt1)``.
    Metoda z jedną pozycją nie ma z czego dać rzędu — i to jest BRAK pomiaru,
    zgłaszany jako luka, a nie milczące przejście.
    """
    po_metodzie: dict[str, list[tuple[float, float]]] = {}
    for p in pozycje:
        blad = float(p["blad_max_vs_odniesienie"])
        if math.isfinite(blad) and blad > 0.0:
            po_metodzie.setdefault(str(p["integrator"]), []).append((float(p["krok_s"]), blad))

    luki: list[str] = []
    for nazwa, pary in sorted(po_metodzie.items()):
        if len(pary) < 2:
            luki.append(
                f"Porównanie integratorów: {nazwa} ma {len(pary)} pozycję — rzędu "
                f"nie da się zmierzyć z jednego kroku"
            )
            continue
        pary.sort()
        (dt1, e1), (dt2, e2) = pary[0], pary[-1]
        # WIELKOŚĆ na kroku NAJGĘSTSZYM — rząd poprawny przy absurdalnej stałej
        # przeszedłby samo kryterium rzędu.
        if e1 > MAKS_BLAD_NA_NAJGESTSZYM_KROKU_RAD:
            luki.append(
                f"Porównanie integratorów: {nazwa} ma na najgęstszym kroku "
                f"({dt1:g} s) błąd {e1:.3e} rad, powyżej "
                f"{MAKS_BLAD_NA_NAJGESTSZYM_KROKU_RAD:g} rad — porównywalny z "
                f"amplitudą kołysania, więc przebieg nie opisuje zagadnienia"
            )
        rzad_obserwowany = math.log(e2 / e1) / math.log(dt2 / dt1)
        integrator = INTEGRATORY.get(nazwa)
        if integrator is None:
            luki.append(f"Porównanie integratorów: {nazwa} nie jest w rejestrze integratorów")
            continue
        odchylenie = abs(rzad_obserwowany - integrator.rzad)
        if odchylenie > MAKS_ODCHYLENIE_RZEDU:
            luki.append(
                f"Porównanie integratorów: {nazwa} deklaruje rząd {integrator.rzad}, "
                f"a zachowuje się jak rząd {rzad_obserwowany:.3f} "
                f"(odchylenie {odchylenie:.3f} > {MAKS_ODCHYLENIE_RZEDU:g})"
            )
    return luki


def _luki_kwalifikacji(raport: dict[str, Any]) -> list[str]:
    """LUKI, czyli pomiary WYKONANE i leżące POZA własnym kryterium.

    PO CO TO ISTNIEJE (recenzja niezależna, P2-DELTA-22). Kod wyjścia zależał
    WYŁĄCZNIE od przeżytych mutacji krytycznych. Znaczyło to, że dowolnie duży
    błąd trajektorii, CCT rozjechany z wzorem zamkniętym albo niezbieżna pozycja
    porównania integratorów dawały kod 0 — uprząż mierzyła, ale nie orzekała.

    POMIAR POMINIĘTY NIE JEST LUKĄ — jest BRAKIEM i idzie do
    ``_braki_kwalifikacji``. Rozdzielenie jest konieczne, żeby „nie zmierzono"
    nie zrównało się z „zmierzono i dobrze".
    """
    luki: list[str] = []

    mutacje = raport["mutacje"]
    if mutacje["przezyly_krytyczne"]:
        luki.append(f"Mutacje krytyczne, które przeżyły: {mutacje['przezyly_krytyczne']}")
    if not mutacje["liczba_mutacji"]:
        luki.append("Kampania mutacyjna jest PUSTA — 0/0 nie jest wynikiem dodatnim.")

    trajektoria = raport["trajektoria_vs_andes"]
    if trajektoria["stan"] == "WYKONANE" and trajektoria.get("status") == "niezgodne":
        luki.append(f"Trajektoria wobec wzorca: NIEZGODNE — {trajektoria.get('niespelnione')}")

    cct = raport["czas_krytyczny_zwarcia"]
    if cct["stan"] == "WYKONANE" and not cct["zgodne"]:
        luki.append(
            f"CCT rozjeżdża się z kryterium równych pól: błąd względny "
            f"{cct['blad_wzgledny']:.3e} > {cct['tolerancja_wzgledna']:.3e}"
        )

    integratory = raport["porownanie_integratorow"]
    if integratory["stan"] == "WYKONANE":
        niezbiezne = [p for p in integratory["pozycje"] if not p["zbiegl"]]
        if niezbiezne:
            luki.append(
                f"Porównanie integratorów: pozycje niezbieżne "
                f"{[(p['integrator'], p['krok_s']) for p in niezbiezne]}"
            )
        # WIELKOŚĆ BŁĘDU, NIE TYLKO FLAGA ZBIEŻNOŚCI (recenzja, P1-DELTA-34).
        # „Zbiegł" mówi o ITERACJI, nie o dokładności.
        niepoprawne = [
            p
            for p in integratory["pozycje"]
            if not math.isfinite(float(p["blad_max_vs_odniesienie"]))
        ]
        if niepoprawne:
            luki.append(
                f"Porównanie integratorów: błąd niepoprawny (NaN/Inf) — "
                f"{[(p['integrator'], p['krok_s']) for p in niepoprawne]}"
            )
        # RZĄD OBSERWOWANY WOBEC ZADEKLAROWANEGO (recenzja, P1-DELTA-36).
        # Bezwzględny próg wspólny dla metod różnego rzędu odrzucał własny
        # benchmark; metoda rzędu 1 MA mieć większy błąd niż metoda rzędu 4.
        luki.extend(_luki_rzedu_integratorow(integratory["pozycje"]))

    # RESIDUUM INICJALIZACJI BYŁO MIERZONE I NIEBRAMKOWANE (recenzja, P1-DELTA-34).
    # Bieg startujący daleko od równowagi opisuje przebieg, którego nikt nie zadał:
    # kołysanie bierze się wtedy z niespójnego punktu startowego, a nie ze zdarzenia.
    residua = raport.get("residua_inicjalizacji") or {}
    najgorsza = residua.get("najgorsza_norma_pochodnej")
    if najgorsza is None:
        luki.append("Residua inicjalizacji: brak pomiaru w raporcie")
    elif not math.isfinite(float(najgorsza)) or float(najgorsza) > MAKS_NORMA_POCHODNEJ_W_T0:
        luki.append(
            f"Residuum inicjalizacji {float(najgorsza):.3e} przekracza "
            f"{MAKS_NORMA_POCHODNEJ_W_T0:g} — start nie jest w równowadze"
        )

    return luki


def zbierz_raport(*, szybko: bool = False, wykonaj_sondy: Any = None) -> dict[str, Any]:
    """Pełny raport kwalifikacyjny laboratorium.

    ``wykonaj_sondy`` istnieje WYŁĄCZNIE po to, żeby testy uprzęży nie musiały
    uruchamiać dwudziestu procesów potomnych pytest dla sprawdzenia KSZTAŁTU
    raportu. Wartość domyślna jest realna; że jest realna, pilnuje osobny test.
    """
    start = time.monotonic()
    mutacje = _kampania_mutacyjna(wykonaj_sondy or WYKONAWCA_SOND_DOMYSLNY)
    raport: dict[str, Any] = {
        "kontrakt": "RaportKwalifikacyjnyLaboratoriumV1",
        "status_dowodowy": "UNVALIDATED_MODEL",
        "uwaga": (
            "Raport MIERZY spójność laboratorium. NIE nadaje statusu dowodowego i nie "
            "może go nadać — promocja jest decyzją architektoniczną prowadzącego."
        ),
        "odcisk_implementacji": odcisk_implementacji(),
        "tryb": "szybki" if szybko else "pelny",
        "wyrocznie_zewnetrzne": _stan_wyroczni_zewnetrznych(),
        "residua_inicjalizacji": _residua_inicjalizacji(),
        "trajektoria_vs_andes": _porownanie_trajektorii(szybko),
        "porownanie_integratorow": _porownanie_integratorow(szybko),
        "czas_krytyczny_zwarcia": _czas_krytyczny(szybko),
        "mutacje": mutacje,
    }
    raport["luki_kwalifikacji"] = _luki_kwalifikacji(raport)
    raport["braki_kwalifikacji"] = _braki_kwalifikacji(raport)
    raport["status_kwalifikacji"] = (
        StatusKwalifikacji.ODRZUCONE
        if raport["luki_kwalifikacji"]
        else (
            StatusKwalifikacji.NIEKOMPLETNE
            if raport["braki_kwalifikacji"]
            else StatusKwalifikacji.ZAKWALIFIKOWANE
        )
    ).value
    raport["czas_biegu_s"] = round(time.monotonic() - start, 3)
    raport["podsumowanie"] = {
        "mutacje_zabite": f"{mutacje['zabite']}/{mutacje['liczba_mutacji']}",
        "luki_krytyczne": mutacje["przezyly_krytyczne"],
        "najgorsza_norma_pochodnej": raport["residua_inicjalizacji"]["najgorsza_norma_pochodnej"],
        "dowod_zewnetrzny_wykonany": raport["trajektoria_vs_andes"]["stan"] == "WYKONANE",
        # UWAGA: `wyrocznie_zewnetrzne` mówi o DOSTĘPNOŚCI pakietów. Wykonany
        # jest wyłącznie ANDES TDS; porównania pandapower ta uprząż NIE
        # przeprowadza, więc obecność pakietu nie jest dowodem rozpływu
        # (recenzja niezależna, P2-DELTA-23).
        "rozplyw_pandapower_wykonany": False,
        "werdykt_trajektorii": raport["trajektoria_vs_andes"].get("status", "POMINIETE"),
    }
    return raport


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--szybko", action="store_true", help="pomiń CCT i porównanie metod")
    parser.add_argument("--do-pliku", type=str, default=None, help="zapisz JSON do pliku")
    argumenty = parser.parse_args()

    raport = zbierz_raport(szybko=argumenty.szybko)
    tresc = json.dumps(raport, indent=2, ensure_ascii=False, default=str)
    if argumenty.do_pliku:
        pathlib.Path(argumenty.do_pliku).write_text(tresc, encoding="utf-8")
        print(f"Raport zapisany: {argumenty.do_pliku}")
    else:
        print(tresc)

    # Kod wyjścia mówi o LUKACH KWALIFIKACJI, nie o „sukcesie". Luką jest KAŻDY
    # zmierzony wynik poza własnym kryterium — nie tylko przeżyta mutacja.
    # Zawężenie tego warunku do samych mutacji sprawiało, że uprząż mierzyła, ale
    # nie orzekała (recenzja niezależna, P2-DELTA-22).
    for luka in raport["luki_kwalifikacji"]:
        print(f"LUKA KWALIFIKACJI: {luka}", file=sys.stderr)
    for brak in raport["braki_kwalifikacji"]:
        print(f"BRAK DOWODU: {brak}", file=sys.stderr)
    # TRZY STANY, TRZY KODY. Kod 0 znaczy „każdy wymagany pomiar wykonany i w
    # kryterium". Pominięcie ma własny kod, bo zrównanie go z zerem czyniłoby
    # brak dowodu nieodróżnialnym od dowodu.
    if raport["status_kwalifikacji"] == StatusKwalifikacji.ODRZUCONE.value:
        return 1
    if raport["status_kwalifikacji"] == StatusKwalifikacji.NIEKOMPLETNE.value:
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
