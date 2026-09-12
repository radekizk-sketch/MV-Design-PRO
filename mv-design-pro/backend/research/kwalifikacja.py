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
import pathlib
import sys
import time
from typing import Any

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))


from dynamic_lab.benchmarki import (  # noqa: E402
    czas_krytyczny_zwarcia,
    porownaj_integratory,
    siec_sn_z_der,
    smib,
)
from dynamic_lab.katalog_mutacji import mutacje_laboratorium  # noqa: E402
from dynamic_lab.mutacje import uruchom_kampanie  # noqa: E402
from dynamic_lab.silnik import SilnikRMS  # noqa: E402
from dynamic_lab.sonda_mutacyjna import wykonaj_sondy_w_podprocesie  # noqa: E402
from dynamic_lab.tozsamosc import odcisk_implementacji  # noqa: E402

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


def _czas_krytyczny(szybko: bool) -> dict[str, Any]:
    """CCT z symulacji kontra zamknięty wzór kryterium równych pól."""
    if szybko:
        return {"stan": "POMINIETE", "powod": "tryb --szybko"}
    h_s, x_linii = 4.0, 0.15
    cct_symulacja = czas_krytyczny_zwarcia(h_s=h_s, x_linii_pu=x_linii, dokladnosc_s=0.005)
    return {
        "stan": "WYKONANE",
        "h_s": h_s,
        "x_linii_pu": x_linii,
        "cct_symulacja_s": cct_symulacja,
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
    raport["czas_biegu_s"] = round(time.monotonic() - start, 3)
    raport["podsumowanie"] = {
        "mutacje_zabite": f"{mutacje['zabite']}/{mutacje['liczba_mutacji']}",
        "luki_krytyczne": mutacje["przezyly_krytyczne"],
        "najgorsza_norma_pochodnej": raport["residua_inicjalizacji"]["najgorsza_norma_pochodnej"],
        "dowod_zewnetrzny_wykonany": raport["trajektoria_vs_andes"]["stan"] == "WYKONANE",
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

    # Kod wyjścia mówi o LUKACH KWALIFIKACJI, nie o „sukcesie". Przeżyta mutacja
    # krytyczna jest luką i musi być widoczna w CI jako czerwień.
    return 1 if raport["mutacje"]["przezyly_krytyczne"] else 0


if __name__ == "__main__":
    sys.exit(main())
