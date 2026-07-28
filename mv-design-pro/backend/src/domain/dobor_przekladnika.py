"""Dobor przekladnika pradowego pola wytworcy — kryteria normowe (karta E21-4).

DLACZEGO TEN MODUL ISTNIEJE. Ekran pokazywal przekladnik jako NAZWE katalogowa
(„CT 200/5 A kl. 5P10 10 VA") i nic wiecej. Wlasciciel wskazal, ze bez sprawdzenia
przekladni wobec pradu chronionego toru, obciazalnosci cieplnej i dynamicznej,
nasycenia oraz zgodnosci z wejsciem przekaznika „jego wybor nie ma wiarygodnosci
inzynierskiej". Dane do tych sprawdzen katalog niesie od V12K-254 (Ith, Idyn, Fs,
ALF, obciazalnosc), wiec kryteria daja sie policzyc — a nie tylko nazwac.

ZERO FIZYKI SIECI. Modul NIE liczy pradu zwarciowego ani pradu roboczego sieci:
prad zwarciowy poczatkowy i szczytowy przychodza Z SOLVERA, a prad znamionowy toru
z tabliczki (moc i napiecie modelu). Tutaj zestawiane sa WYMAGANIA z MOZLIWOSCIAMI
przekladnika wg wzorow normowych na podanych wartosciach — to samo, co katalog robi
z rodzajem rdzenia i Idyn (V12K-239, V12K-254).

KRYTERIA (kazde z podstawa normowa i jawnym rachunkiem):
  1. Przekladnia      — prad roboczy toru nie moze przekraczac pradu pierwotnego CT.
  2. Wykorzystanie    — bardzo niskie wykorzystanie przekladni psuje dokladnosc
                        (informacja, nie blad).
  3. Rodzaj rdzenia   — funkcje zabezpieczeniowe wymagaja rdzenia zabezpieczeniowego.
  4. Nasycenie (ALF)  — ALF·In musi pokryc prad zwarciowy odniesiony do przekladni.
  5. Wytrzymalosc cieplna — Ith >= Ik''·sqrt(tk) (rownowaznosc cieplna, IEC 61869-2).
  6. Wytrzymalosc dynamiczna — Idyn >= ip (prad szczytowy z solwera).
  7. Prad wtorny      — 1 A / 5 A musi zgadzac sie z wejsciem przekaznika.
  8. Obciazalnosc     — moc znamionowa rdzenia >= obciazenie obwodu wtornego.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any, Literal

#: Ponizej tego wykorzystania przekladni dokladnosc pomiaru pradu roboczego jest slaba
#: (blad wzgledny rosnie przy malym wykorzystaniu zakresu). Progu nie ma w normie jako
#: wymagania — to praktyka projektowa, wiec kryterium jest INFORMACJA, nie werdyktem.
PROG_WYKORZYSTANIA_PRZEKLADNI = 0.2

Werdykt = Literal["spelnione", "niespelnione", "informacja", "brak_danych"]


@dataclass(frozen=True)
class WymaganiaToru:
    """Fakty o chronionym torze — WSZYSTKIE z modelu albo z solwera, zadnej domyslnej."""

    #: Prad roboczy (znamionowy) chronionego toru [A] — z tabliczki: moc i napiecie.
    prad_roboczy_a: float | None = None
    #: Poczatkowy prad zwarciowy [kA] — Z SOLWERA (IEC 60909).
    ik_ka: float | None = None
    #: Prad szczytowy zwarcia [kA] — Z SOLWERA.
    ip_ka: float | None = None
    #: Czas trwania zwarcia przyjety do sprawdzenia cieplnego [s].
    czas_zwarcia_s: float | None = None
    #: Prad wejscia przekaznika [A] (1 albo 5) — z karty urzadzenia.
    prad_wejscia_przekaznika_a: float | None = None
    #: Obciazenie obwodu wtornego [VA] — dana PROJEKTOWA (przewody + przekaznik).
    obciazenie_obwodu_va: float | None = None
    #: Czy przekladnik ma zasilac funkcje zabezpieczeniowe.
    dla_zabezpieczen: bool = True


@dataclass(frozen=True)
class Kryterium:
    kod: str
    nazwa_pl: str
    podstawa_pl: str
    werdykt: Werdykt
    #: Wartosc WYMAGANA (z toru) i DOSTEPNA (z przekladnika) — jawny rachunek.
    wymagane: str | None = None
    dostepne: str | None = None
    komentarz_pl: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "kod": self.kod,
            "nazwa_pl": self.nazwa_pl,
            "podstawa_pl": self.podstawa_pl,
            "werdykt": self.werdykt,
            "wymagane": self.wymagane,
            "dostepne": self.dostepne,
            "komentarz_pl": self.komentarz_pl,
        }


@dataclass(frozen=True)
class WynikDoboru:
    kryteria: list[Kryterium] = field(default_factory=list)

    @property
    def niespelnione(self) -> list[Kryterium]:
        return [k for k in self.kryteria if k.werdykt == "niespelnione"]

    @property
    def bez_danych(self) -> list[Kryterium]:
        return [k for k in self.kryteria if k.werdykt == "brak_danych"]

    @property
    def dobor_potwierdzony(self) -> bool:
        """Dobor potwierdzony = zadne kryterium nie jest niespelnione ANI bez danych.

        Brak danej NIE jest zgodnoscia — to trzeci stan, ktory musi byc widoczny
        (precedens V12K-232: „nie wiem" nie jest werdyktem „spelnione").
        """
        return not self.niespelnione and not self.bez_danych

    def to_dict(self) -> dict[str, Any]:
        return {
            "kryteria": [k.to_dict() for k in self.kryteria],
            "dobor_potwierdzony": self.dobor_potwierdzony,
            "liczba_niespelnionych": len(self.niespelnione),
            "liczba_bez_danych": len(self.bez_danych),
        }


def _liczba(wartosc: float | None, jednostka: str, miejsca: int = 1) -> str | None:
    if wartosc is None:
        return None
    return f"{wartosc:.{miejsca}f} {jednostka}"


def sprawdz_dobor_ct(przekladnik: dict[str, Any], tor: WymaganiaToru) -> WynikDoboru:
    """Zestaw kryteriow doboru dla podanego typu CT i chronionego toru.

    `przekladnik` to slownik z katalogu (`CTType.to_dict()`), zeby modul nie zalezal
    od klasy katalogu i dzialal tez na danych zmaterializowanych w modelu.
    """

    kryteria: list[Kryterium] = []
    in_a = przekladnik.get("ratio_primary_a")
    in_wtorny = przekladnik.get("ratio_secondary_a")
    alf = przekladnik.get("accuracy_limit_factor")
    zastosowanie = przekladnik.get("application")
    ith = przekladnik.get("ith_ka_1s")
    idyn = przekladnik.get("idyn_ka_peak")
    obciazalnosc = przekladnik.get("burden_va")

    # --- 1. Przekladnia wobec pradu roboczego toru -------------------------------
    if tor.prad_roboczy_a is None or in_a is None:
        kryteria.append(
            Kryterium(
                kod="ct.przekladnia",
                nazwa_pl="Przekładnia wobec prądu roboczego toru",
                podstawa_pl="Prąd pierwotny przekładnika musi pokryć prąd roboczy toru.",
                werdykt="brak_danych",
                wymagane=_liczba(tor.prad_roboczy_a, "A"),
                dostepne=_liczba(in_a, "A"),
                komentarz_pl=(
                    "Brakuje prądu roboczego toru albo przekładni — sprawdzenia nie da "
                    "się wykonać."
                ),
            )
        )
    else:
        spelnione = tor.prad_roboczy_a <= in_a
        kryteria.append(
            Kryterium(
                kod="ct.przekladnia",
                nazwa_pl="Przekładnia wobec prądu roboczego toru",
                podstawa_pl="Prąd pierwotny przekładnika musi pokryć prąd roboczy toru.",
                werdykt="spelnione" if spelnione else "niespelnione",
                wymagane=_liczba(tor.prad_roboczy_a, "A"),
                dostepne=_liczba(in_a, "A"),
                komentarz_pl=(
                    None
                    if spelnione
                    else "Prąd roboczy przekracza prąd pierwotny — przekładnik pracowałby "
                    "w przeciążeniu, a pomiar byłby zafałszowany."
                ),
            )
        )

        # --- 2. Wykorzystanie przekladni (informacja) ----------------------------
        wykorzystanie = tor.prad_roboczy_a / in_a if in_a > 0 else None
        if wykorzystanie is not None and wykorzystanie < PROG_WYKORZYSTANIA_PRZEKLADNI:
            kryteria.append(
                Kryterium(
                    kod="ct.wykorzystanie_przekladni",
                    nazwa_pl="Wykorzystanie przekładni",
                    podstawa_pl=(
                        "Przy bardzo niskim wykorzystaniu zakresu rośnie błąd względny "
                        "pomiaru (praktyka projektowa, nie wymaganie normy)."
                    ),
                    werdykt="informacja",
                    wymagane=f"≥ {PROG_WYKORZYSTANIA_PRZEKLADNI:.0%} prądu pierwotnego",
                    dostepne=f"{wykorzystanie:.0%}",
                    komentarz_pl="Rozważ przekładnik o niższym prądzie pierwotnym.",
                )
            )

    # --- 3. Rodzaj rdzenia -------------------------------------------------------
    if tor.dla_zabezpieczen:
        if zastosowanie is None:
            kryteria.append(
                Kryterium(
                    kod="ct.rodzaj_rdzenia",
                    nazwa_pl="Rodzaj rdzenia",
                    podstawa_pl="Funkcje zabezpieczeniowe wymagają rdzenia zabezpieczeniowego (IEC 61869-2).",
                    werdykt="brak_danych",
                    dostepne=str(przekladnik.get("accuracy_class")),
                    komentarz_pl="Klasy dokładności nie da się rozstrzygnąć na rodzaj rdzenia.",
                )
            )
        else:
            ok_rdzen = zastosowanie in ("protection", "dual")
            kryteria.append(
                Kryterium(
                    kod="ct.rodzaj_rdzenia",
                    nazwa_pl="Rodzaj rdzenia",
                    podstawa_pl="Funkcje zabezpieczeniowe wymagają rdzenia zabezpieczeniowego (IEC 61869-2).",
                    werdykt="spelnione" if ok_rdzen else "niespelnione",
                    wymagane="rdzeń zabezpieczeniowy (klasa z literą P)",
                    dostepne=str(przekladnik.get("accuracy_class")),
                    komentarz_pl=(
                        None
                        if ok_rdzen
                        else "Rdzeń pomiarowy nasyca się przy prądzie zwarciowym — "
                        "zabezpieczenie mogłoby nie zadziałać."
                    ),
                )
            )

    # --- 4. Nasycenie: ALF wobec pradu zwarciowego -------------------------------
    if tor.ik_ka is None or in_a is None or alf is None:
        kryteria.append(
            Kryterium(
                kod="ct.alf",
                nazwa_pl="Zapas do nasycenia (ALF)",
                podstawa_pl="ALF·In musi pokryć prąd zwarciowy odniesiony do przekładni (IEC 61869-2).",
                werdykt="brak_danych",
                wymagane=_liczba(tor.ik_ka, "kA"),
                dostepne=(f"ALF {alf:.0f}" if alf is not None else None),
                komentarz_pl="Brakuje prądu zwarciowego z obliczeń albo ALF przekładnika.",
            )
        )
    else:
        wymagany_alf = (tor.ik_ka * 1000.0) / in_a
        spelnione = alf >= wymagany_alf
        kryteria.append(
            Kryterium(
                kod="ct.alf",
                nazwa_pl="Zapas do nasycenia (ALF)",
                podstawa_pl="ALF·In musi pokryć prąd zwarciowy odniesiony do przekładni (IEC 61869-2).",
                werdykt="spelnione" if spelnione else "niespelnione",
                wymagane=f"ALF ≥ {wymagany_alf:.1f} (Ik″ {tor.ik_ka:.2f} kA / In {in_a:.0f} A)",
                dostepne=f"ALF {alf:.0f}",
                komentarz_pl=(
                    None
                    if spelnione
                    else "Rdzeń nasyci się przed osiągnięciem prądu zwarciowego — "
                    "zabezpieczenie zobaczy prąd mniejszy od rzeczywistego."
                ),
            )
        )

    # --- 5. Wytrzymalosc cieplna -------------------------------------------------
    if tor.ik_ka is None or tor.czas_zwarcia_s is None or ith is None:
        kryteria.append(
            Kryterium(
                kod="ct.wytrzymalosc_cieplna",
                nazwa_pl="Wytrzymałość cieplna zwarciowa",
                podstawa_pl="Ith ≥ Ik″·√tk — równoważność cieplna prądu zwarcia (IEC 61869-2).",
                werdykt="brak_danych",
                dostepne=_liczba(ith, "kA / 1 s", 1),
                komentarz_pl=(
                    "Brakuje prądu zwarciowego, czasu jego trwania albo prądu cieplnego "
                    "przekładnika."
                ),
            )
        )
    else:
        wymagany_ith = tor.ik_ka * math.sqrt(tor.czas_zwarcia_s)
        spelnione = ith >= wymagany_ith
        kryteria.append(
            Kryterium(
                kod="ct.wytrzymalosc_cieplna",
                nazwa_pl="Wytrzymałość cieplna zwarciowa",
                podstawa_pl="Ith ≥ Ik″·√tk — równoważność cieplna prądu zwarcia (IEC 61869-2).",
                werdykt="spelnione" if spelnione else "niespelnione",
                wymagane=(
                    f"{wymagany_ith:.2f} kA / 1 s "
                    f"(Ik″ {tor.ik_ka:.2f} kA, tk {tor.czas_zwarcia_s:.2f} s)"
                ),
                dostepne=_liczba(ith, "kA / 1 s", 1),
                komentarz_pl=(
                    None
                    if spelnione
                    else "Uzwojenie pierwotne przekroczyłoby dopuszczalną temperaturę "
                    "podczas zwarcia."
                ),
            )
        )

    # --- 6. Wytrzymalosc dynamiczna ----------------------------------------------
    if tor.ip_ka is None or idyn is None:
        kryteria.append(
            Kryterium(
                kod="ct.wytrzymalosc_dynamiczna",
                nazwa_pl="Wytrzymałość dynamiczna",
                podstawa_pl="Idyn ≥ ip — siły elektrodynamiczne od prądu szczytowego (IEC 61869-2).",
                werdykt="brak_danych",
                dostepne=_liczba(idyn, "kA", 1),
                komentarz_pl="Brakuje prądu szczytowego z obliczeń albo prądu dynamicznego.",
            )
        )
    else:
        spelnione = idyn >= tor.ip_ka
        kryteria.append(
            Kryterium(
                kod="ct.wytrzymalosc_dynamiczna",
                nazwa_pl="Wytrzymałość dynamiczna",
                podstawa_pl="Idyn ≥ ip — siły elektrodynamiczne od prądu szczytowego (IEC 61869-2).",
                werdykt="spelnione" if spelnione else "niespelnione",
                wymagane=_liczba(tor.ip_ka, "kA", 2),
                dostepne=_liczba(idyn, "kA", 1),
                komentarz_pl=(
                    None
                    if spelnione
                    else "Siły elektrodynamiczne przekroczyłyby wytrzymałość mechaniczną "
                    "uzwojenia."
                ),
            )
        )

    # --- 7. Zgodnosc pradu wtornego z wejsciem przekaznika -----------------------
    if tor.prad_wejscia_przekaznika_a is None or in_wtorny is None:
        kryteria.append(
            Kryterium(
                kod="ct.prad_wtorny",
                nazwa_pl="Zgodność prądu wtórnego z wejściem przekaźnika",
                podstawa_pl="Prąd wtórny przekładnika musi odpowiadać wejściu prądowemu urządzenia.",
                werdykt="brak_danych",
                dostepne=_liczba(in_wtorny, "A", 0),
                komentarz_pl="Brakuje danej o wejściu prądowym wybranego urządzenia.",
            )
        )
    else:
        spelnione = abs(in_wtorny - tor.prad_wejscia_przekaznika_a) < 1e-6
        kryteria.append(
            Kryterium(
                kod="ct.prad_wtorny",
                nazwa_pl="Zgodność prądu wtórnego z wejściem przekaźnika",
                podstawa_pl="Prąd wtórny przekładnika musi odpowiadać wejściu prądowemu urządzenia.",
                werdykt="spelnione" if spelnione else "niespelnione",
                wymagane=_liczba(tor.prad_wejscia_przekaznika_a, "A", 0),
                dostepne=_liczba(in_wtorny, "A", 0),
                komentarz_pl=(
                    None
                    if spelnione
                    else "Niezgodność prądu wtórnego oznacza błąd pomiaru w całym torze "
                    "zabezpieczeniowym."
                ),
            )
        )

    # --- 8. Obciazalnosc obwodu wtornego -----------------------------------------
    if tor.obciazenie_obwodu_va is None or obciazalnosc is None:
        kryteria.append(
            Kryterium(
                kod="ct.obciazalnosc",
                nazwa_pl="Obciążalność wobec obwodu wtórnego",
                podstawa_pl="Moc znamionowa rdzenia ≥ obciążenie obwodu (przewody + urządzenie).",
                werdykt="brak_danych",
                dostepne=_liczba(obciazalnosc, "VA", 0),
                komentarz_pl=(
                    "Obciążenie obwodu wtórnego jest daną projektową — podaj sumę "
                    "rezystancji przewodów i poboru urządzenia."
                ),
            )
        )
    else:
        spelnione = obciazalnosc >= tor.obciazenie_obwodu_va
        kryteria.append(
            Kryterium(
                kod="ct.obciazalnosc",
                nazwa_pl="Obciążalność wobec obwodu wtórnego",
                podstawa_pl="Moc znamionowa rdzenia ≥ obciążenie obwodu (przewody + urządzenie).",
                werdykt="spelnione" if spelnione else "niespelnione",
                wymagane=_liczba(tor.obciazenie_obwodu_va, "VA", 1),
                dostepne=_liczba(obciazalnosc, "VA", 0),
                komentarz_pl=(
                    None
                    if spelnione
                    else "Przeciążony obwód wtórny obniża rzeczywisty ALF — rdzeń nasyci "
                    "się wcześniej, niż wynika z klasy."
                ),
            )
        )

    return WynikDoboru(kryteria=kryteria)
