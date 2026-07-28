"""Dobor przekladnikow pola wytworcy — kryteria normowe (karta E21-4).

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

KRYTERIA PRZEKLADNIKA NAPIECIOWEGO (`sprawdz_dobor_vt`, dane katalogu z V12K-255):
  1. Napiecie pierwotne — przekladnia wobec napiecia sieci; rozpoznanie ukladu
                          (miedzyfazowy vs faza-ziemia U_n/√3).
  2. Rodzaj uzwojenia   — funkcje zabezpieczeniowe wymagaja klasy z litera P.
  3. Wspolczynnik F_v   — 1,9 w sieci maloprądowej, 1,5 w bezposrednio uziemionej;
                          czas (30 s / 8 h) zalezy od automatycznego wylaczania.
  4. Napiecie wtorne    — 100 V / 110 V (albo /√3) wobec wejscia przekaznika.
  5. Obciazalnosc       — moc znamionowa uzwojenia >= obciazenie obwodu.
  6. Tor napiecia zerowego — otwarty trojkat wymaga ukladu faza-ziemia, uzwojenie
                          resztkowe wymaga trzeciego uzwojenia w przekladniku.
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
    #: Prady wejsc pomiarowych przekaznika [A] — z katalogu urzadzen. To ZBIOR
    #: (typowo 1 A i 5 A), bo urzadzenie przyjmuje kilka wartosci znamionowych.
    prady_wejsc_przekaznika_a: tuple[float, ...] | None = None
    #: Pochodzenie powyzszej deklaracji (karta producenta / szereg preferowany normy).
    zrodlo_wejsc_pl: str | None = None
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
    if not tor.prady_wejsc_przekaznika_a or in_wtorny is None:
        kryteria.append(
            Kryterium(
                kod="ct.prad_wtorny",
                nazwa_pl="Zgodność prądu wtórnego z wejściem przekaźnika",
                podstawa_pl=(
                    "Prąd wtórny przekładnika musi być jedną z wartości znamionowych "
                    "wejścia prądowego urządzenia (IEC 60255-1)."
                ),
                werdykt="brak_danych",
                dostepne=_liczba(in_wtorny, "A", 0),
                komentarz_pl="Brakuje danej o wejściu prądowym wybranego urządzenia.",
            )
        )
    else:
        spelnione = any(abs(in_wtorny - w) < 1e-6 for w in tor.prady_wejsc_przekaznika_a)
        wykaz = " / ".join(f"{w:.0f} A" for w in tor.prady_wejsc_przekaznika_a)
        kryteria.append(
            Kryterium(
                kod="ct.prad_wtorny",
                nazwa_pl="Zgodność prądu wtórnego z wejściem przekaźnika",
                podstawa_pl=(
                    "Prąd wtórny przekładnika musi być jedną z wartości znamionowych "
                    "wejścia prądowego urządzenia (IEC 60255-1)."
                ),
                werdykt="spelnione" if spelnione else "niespelnione",
                wymagane=wykaz,
                dostepne=_liczba(in_wtorny, "A", 0),
                komentarz_pl=(
                    (
                        f"Podstawa danych o wejściu: {tor.zrodlo_wejsc_pl}."
                        if tor.zrodlo_wejsc_pl
                        else None
                    )
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


# =============================================================================
# PRZEKLADNIK NAPIECIOWY (VT)
# =============================================================================

#: Dopuszczalne odchylenie przekladni od wartosci wzorcowej przy rozpoznawaniu ukladu
#: pracy (miedzyfazowy vs faza-ziemia) i przy zgodnosci napiecia wtornego.
#:
#: Pasmo jest CIASNE i taki jest zamysl: napiecia znamionowe przekladnikow to wartosci
#: ZNORMALIZOWANE (100 V, 110 V, 100/√3 V), a nie pomiary — pasmo ma pokryc wylacznie
#: zaokraglenia katalogowe (20000/√3 zapisane jako 11547,0; 100/√3 jako 57,7). Szersze
#: pasmo uznawaloby 110 V za zgodne ze wejsciem 100 V, a to 10% bledu w kazdej nastawie
#: napieciowej toru — dokladnie ten defekt wykryl test zgodnosci napiecia wtornego.
TOLERANCJA_PRZEKLADNI_NAPIECIOWEJ = 0.02

#: Powyzej tej krotnosci napiecia sieci przekladnik jest nadwymiarowany — pomiar traci
#: rozdzielczosc. Praktyka projektowa, nie wymaganie normy => INFORMACJA.
PROG_NADWYMIAROWANIA_VT = 1.5

#: Sieci, w ktorych zwarcie doziemne NIE jest ograniczane male impedancja punktu
#: neutralnego: napiecie faz zdrowych rosnie do napiecia miedzyfazowego, wiec norma
#: wymaga wspolczynnika napieciowego 1,9 (IEC 61869-3 tab. 2). „rezystor" jest tu
#: swiadomie: siec uziemiona przez rezystor NIE jest siecia skutecznie uziemiona.
UZIEMIENIA_WYMAGAJACE_19: frozenset[str] = frozenset({"izolowany", "cewka_petersena", "rezystor"})

WSPOLCZYNNIK_SIEC_UZIEMIONA = 1.5
WSPOLCZYNNIK_SIEC_MALOPRADOWA = 1.9
CZAS_WSPOLCZYNNIKA_KROTKI_S = 30.0
CZAS_WSPOLCZYNNIKA_DLUGI_S = 8 * 3600.0


@dataclass(frozen=True)
class WymaganiaToruNapieciowego:
    """Fakty o torze napieciowym — z modelu, nigdy domyslne."""

    #: Napiecie znamionowe sieci w tym punkcie [V] — z modelu (szyna pola).
    napiecie_sieci_v: float | None = None
    #: Sposob uziemienia punktu neutralnego — z modelu; „nieznany" znaczy NIEZNANY.
    tryb_uziemienia: str | None = None
    #: Czy zwarcie doziemne jest wylaczane automatycznie — dana PROJEKTOWA; decyduje
    #: o CZASIE wspolczynnika napieciowego (30 s vs 8 h), nie o jego wartosci.
    zwarcie_doziemne_wylaczane_automatycznie: bool | None = None
    #: Napiecia wejsc pomiarowych przekaznika [V] — ZBIOR wartosci znamionowych.
    napiecia_wejsc_przekaznika_v: tuple[float, ...] | None = None
    #: Pochodzenie powyzszej deklaracji (karta producenta / szereg preferowany normy).
    zrodlo_wejsc_pl: str | None = None
    #: Obciazenie obwodu wtornego [VA] — dana PROJEKTOWA.
    obciazenie_obwodu_va: float | None = None
    #: Zadeklarowane w modelu zrodlo napiecia zerowego: „otwarty_trojkat_vt",
    #: „uzwojenie_resztkowe_vt", „obliczone" albo „brak".
    zrodlo_napiecia_zerowego: str | None = None
    #: Czy przekladnik ma zasilac funkcje zabezpieczeniowe.
    dla_zabezpieczen: bool = True


def _blisko(wartosc: float, wzorzec: float, tolerancja: float) -> bool:
    if wzorzec <= 0:
        return False
    return abs(wartosc - wzorzec) / wzorzec <= tolerancja


def _wymagany_wspolczynnik_napieciowy(tryb: str | None) -> float | None:
    """Wymagana wartosc F_v wyprowadzona ze sposobu uziemienia (IEC 61869-3 tab. 2).

    `None` = sposobu uziemienia nie ustalono; wymagania NIE zgadujemy (V12K-246:
    domysl „bezposrednio uziemiony" zamienial brak danej w najmniej ostrozny werdykt).
    """
    if tryb is None or tryb == "nieznany":
        return None
    if tryb in UZIEMIENIA_WYMAGAJACE_19:
        return WSPOLCZYNNIK_SIEC_MALOPRADOWA
    if tryb == "bezposrednio_uziemiony":
        return WSPOLCZYNNIK_SIEC_UZIEMIONA
    return None


def _czas_wspolczynnika_pl(czas_s: float | None) -> str | None:
    if czas_s is None:
        return None
    if czas_s >= 3600.0:
        return f"{czas_s / 3600.0:.0f} h"
    return f"{czas_s:.0f} s"


def sprawdz_dobor_vt(przekladnik: dict[str, Any], tor: WymaganiaToruNapieciowego) -> WynikDoboru:
    """Zestaw kryteriow doboru przekladnika napieciowego dla podanego toru.

    `przekladnik` to slownik z katalogu (`VTType.to_dict()`) — modul nie zalezy od klasy
    katalogu i dziala tez na danych zmaterializowanych w modelu.
    """

    kryteria: list[Kryterium] = []
    un_pierwotne = przekladnik.get("ratio_primary_v")
    un_wtorne = przekladnik.get("ratio_secondary_v")
    rodzaj = przekladnik.get("application")
    fv = przekladnik.get("rated_voltage_factor")
    czas_fv = przekladnik.get("voltage_factor_duration_s")
    obciazalnosc = przekladnik.get("burden_va")
    uzwojenie_resztkowe = przekladnik.get("has_residual_winding")

    #: Uklad pracy uzwojenia pierwotnego rozpoznany z przekladni — potrzebny takze
    #: kryterium toru napiecia zerowego, dlatego liczony raz.
    uklad: str | None = None

    # --- 1. Napiecie pierwotne wobec napiecia sieci ------------------------------
    if tor.napiecie_sieci_v is None or un_pierwotne is None:
        kryteria.append(
            Kryterium(
                kod="vt.napiecie_pierwotne",
                nazwa_pl="Przekładnia wobec napięcia sieci",
                podstawa_pl=(
                    "Napięcie pierwotne odpowiada napięciu sieci (układ międzyfazowy) "
                    "albo napięciu fazowemu U_n/√3 (układ faza–ziemia)."
                ),
                werdykt="brak_danych",
                wymagane=_liczba(tor.napiecie_sieci_v, "V", 0),
                dostepne=_liczba(un_pierwotne, "V", 0),
                komentarz_pl="Brakuje napięcia sieci w tym punkcie albo przekładni.",
            )
        )
    else:
        faza_ziemia = tor.napiecie_sieci_v / math.sqrt(3.0)
        if _blisko(un_pierwotne, faza_ziemia, TOLERANCJA_PRZEKLADNI_NAPIECIOWEJ):
            uklad = "faza_ziemia"
        elif _blisko(un_pierwotne, tor.napiecie_sieci_v, TOLERANCJA_PRZEKLADNI_NAPIECIOWEJ):
            uklad = "miedzyfazowy"
        elif un_pierwotne > tor.napiecie_sieci_v:
            # Przekladnik przewymiarowany (np. na napiecie Um rozdzielnicy) — dopuszczalny,
            # bo izolacja i F_v maja zapas; kosztem rozdzielczosci pomiaru.
            uklad = "miedzyfazowy"
        kryteria.append(
            Kryterium(
                kod="vt.napiecie_pierwotne",
                nazwa_pl="Przekładnia wobec napięcia sieci",
                podstawa_pl=(
                    "Napięcie pierwotne odpowiada napięciu sieci (układ międzyfazowy) "
                    "albo napięciu fazowemu U_n/√3 (układ faza–ziemia)."
                ),
                werdykt="spelnione" if uklad is not None else "niespelnione",
                wymagane=(
                    f"{tor.napiecie_sieci_v:.0f} V (międzyfazowo) "
                    f"albo {faza_ziemia:.0f} V (faza–ziemia)"
                ),
                dostepne=_liczba(un_pierwotne, "V", 0),
                komentarz_pl=(
                    "Rozpoznany układ pracy: faza–ziemia (przekładnia U_n/√3)."
                    if uklad == "faza_ziemia"
                    else (
                        "Rozpoznany układ pracy: międzyfazowy."
                        if uklad == "miedzyfazowy"
                        else "Napięcie pierwotne jest niższe od napięcia sieci — przekładnik "
                        "pracowałby w przepięciu, a izolacja nie ma zapasu."
                    )
                ),
            )
        )
        if uklad is not None and un_pierwotne > tor.napiecie_sieci_v * PROG_NADWYMIAROWANIA_VT:
            kryteria.append(
                Kryterium(
                    kod="vt.nadwymiarowanie",
                    nazwa_pl="Nadwymiarowanie przekładni",
                    podstawa_pl=(
                        "Przy dużym zapasie przekładni sygnał wtórny jest mały w stosunku "
                        "do zakresu wejścia (praktyka projektowa, nie wymaganie normy)."
                    ),
                    werdykt="informacja",
                    wymagane=f"≤ {PROG_NADWYMIAROWANIA_VT:.1f}× napięcia sieci",
                    dostepne=f"{un_pierwotne / tor.napiecie_sieci_v:.2f}× napięcia sieci",
                    komentarz_pl="Rozważ przekładnik dopasowany do napięcia sieci.",
                )
            )

    # --- 2. Rodzaj uzwojenia -----------------------------------------------------
    if tor.dla_zabezpieczen:
        if rodzaj is None:
            kryteria.append(
                Kryterium(
                    kod="vt.rodzaj_uzwojenia",
                    nazwa_pl="Rodzaj uzwojenia",
                    podstawa_pl=(
                        "Funkcje zabezpieczeniowe wymagają uzwojenia zabezpieczeniowego "
                        "— klasa z literą P (IEC 61869-3 § 5.6.202)."
                    ),
                    werdykt="brak_danych",
                    dostepne=str(przekladnik.get("accuracy_class")),
                    komentarz_pl=("Klasy dokładności nie da się rozstrzygnąć na rodzaj uzwojenia."),
                )
            )
        else:
            ok = rodzaj == "protection"
            kryteria.append(
                Kryterium(
                    kod="vt.rodzaj_uzwojenia",
                    nazwa_pl="Rodzaj uzwojenia",
                    podstawa_pl=(
                        "Funkcje zabezpieczeniowe wymagają uzwojenia zabezpieczeniowego "
                        "— klasa z literą P (IEC 61869-3 § 5.6.202)."
                    ),
                    werdykt="spelnione" if ok else "niespelnione",
                    wymagane="uzwojenie zabezpieczeniowe (klasa 3P albo 6P)",
                    dostepne=str(przekladnik.get("accuracy_class")),
                    komentarz_pl=(
                        None
                        if ok
                        else "Uzwojenie pomiarowe ma zdefiniowaną dokładność tylko w "
                        "otoczeniu napięcia znamionowego — przy zapadzie i przy "
                        "przepięciu ziemnozwarciowym pomiar dla zabezpieczeń traci "
                        "wiarygodność."
                    ),
                )
            )

    # --- 3. Wspolczynnik napieciowy F_v ------------------------------------------
    wymagany_fv = _wymagany_wspolczynnik_napieciowy(tor.tryb_uziemienia)
    wymagany_czas = (
        None
        if tor.zwarcie_doziemne_wylaczane_automatycznie is None
        else (
            CZAS_WSPOLCZYNNIKA_KROTKI_S
            if tor.zwarcie_doziemne_wylaczane_automatycznie
            else CZAS_WSPOLCZYNNIKA_DLUGI_S
        )
    )
    # W sieci bezposrednio uziemionej norma podaje jeden czas (30 s) — zwarcie doziemne
    # jest tam zwarciem wielkopradowym i musi byc wylaczone, wiec dana o automatyce
    # nie jest potrzebna do rozstrzygniecia.
    if wymagany_fv == WSPOLCZYNNIK_SIEC_UZIEMIONA:
        wymagany_czas = CZAS_WSPOLCZYNNIKA_KROTKI_S
    if wymagany_fv is None or fv is None or wymagany_czas is None or czas_fv is None:
        brakujace: list[str] = []
        if wymagany_fv is None:
            brakujace.append(
                "sposób uziemienia punktu neutralnego sieci (decyduje o wartości 1,5 albo 1,9)"
            )
        if wymagany_czas is None:
            brakujace.append(
                "informacja, czy zwarcie doziemne jest wyłączane automatycznie "
                "(decyduje o czasie 30 s albo 8 h)"
            )
        if fv is None or czas_fv is None:
            brakujace.append("współczynnik napięciowy przekładnika z karty producenta")
        kryteria.append(
            Kryterium(
                kod="vt.wspolczynnik_napieciowy",
                nazwa_pl="Współczynnik napięciowy",
                podstawa_pl=(
                    "F_v opisuje krotność napięcia znamionowego wytrzymywaną z "
                    "zachowaniem dokładności; w sieci małoprądowej zwarcie doziemne "
                    "podnosi napięcie faz zdrowych do międzyfazowego (IEC 61869-3 tab. 2)."
                ),
                werdykt="brak_danych",
                dostepne=(
                    None
                    if fv is None
                    else f"{fv:.1f} przez {_czas_wspolczynnika_pl(czas_fv) or 'czas nieznany'}"
                ),
                komentarz_pl="Brakuje: " + "; ".join(brakujace) + ".",
            )
        )
    else:
        ok_fv = fv >= wymagany_fv
        ok_czas = czas_fv >= wymagany_czas
        kryteria.append(
            Kryterium(
                kod="vt.wspolczynnik_napieciowy",
                nazwa_pl="Współczynnik napięciowy",
                podstawa_pl=(
                    "F_v opisuje krotność napięcia znamionowego wytrzymywaną z "
                    "zachowaniem dokładności; w sieci małoprądowej zwarcie doziemne "
                    "podnosi napięcie faz zdrowych do międzyfazowego (IEC 61869-3 tab. 2)."
                ),
                werdykt="spelnione" if ok_fv and ok_czas else "niespelnione",
                wymagane=f"{wymagany_fv:.1f} przez {_czas_wspolczynnika_pl(wymagany_czas)}",
                dostepne=f"{fv:.1f} przez {_czas_wspolczynnika_pl(czas_fv)}",
                komentarz_pl=(
                    None
                    if ok_fv and ok_czas
                    else (
                        "Zbyt niska krotność napięcia — przy zwarciu doziemnym rdzeń "
                        "nasyci się, a pomiar napięcia przestanie być wiarygodny."
                        if not ok_fv
                        else "Krotność jest wystarczająca, ale deklarowana na krótszy "
                        "czas niż czas trwania doziemienia w tej sieci."
                    )
                ),
            )
        )

    # --- 4. Napiecie wtorne wobec wejscia przekaznika ----------------------------
    podstawa_wtorne = (
        "Napięcie wtórne musi być jedną z wartości znamionowych wejścia napięciowego "
        "urządzenia (IEC 60255-1) — wprost albo przez √3 w układzie faza–ziemia."
    )
    if not tor.napiecia_wejsc_przekaznika_v or un_wtorne is None:
        kryteria.append(
            Kryterium(
                kod="vt.napiecie_wtorne",
                nazwa_pl="Zgodność napięcia wtórnego z wejściem przekaźnika",
                podstawa_pl=podstawa_wtorne,
                werdykt="brak_danych",
                dostepne=_liczba(un_wtorne, "V", 1),
                komentarz_pl="Brakuje danej o wejściu napięciowym wybranego urządzenia.",
            )
        )
    else:
        pasuje = any(
            _blisko(un_wtorne, w, TOLERANCJA_PRZEKLADNI_NAPIECIOWEJ)
            or _blisko(un_wtorne, w / math.sqrt(3.0), TOLERANCJA_PRZEKLADNI_NAPIECIOWEJ)
            for w in tor.napiecia_wejsc_przekaznika_v
        )
        wykaz = " / ".join(
            f"{w:.0f} V (albo {w / math.sqrt(3.0):.1f} V faza–ziemia)"
            for w in tor.napiecia_wejsc_przekaznika_v
        )
        kryteria.append(
            Kryterium(
                kod="vt.napiecie_wtorne",
                nazwa_pl="Zgodność napięcia wtórnego z wejściem przekaźnika",
                podstawa_pl=podstawa_wtorne,
                werdykt="spelnione" if pasuje else "niespelnione",
                wymagane=wykaz,
                dostepne=_liczba(un_wtorne, "V", 1),
                komentarz_pl=(
                    (
                        f"Podstawa danych o wejściu: {tor.zrodlo_wejsc_pl}."
                        if tor.zrodlo_wejsc_pl
                        else None
                    )
                    if pasuje
                    else "Niezgodność napięcia wtórnego przekłada się wprost na błąd "
                    "nastaw napięciowych w całym torze."
                ),
            )
        )

    # --- 5. Obciazalnosc obwodu wtornego -----------------------------------------
    if tor.obciazenie_obwodu_va is None or obciazalnosc is None:
        kryteria.append(
            Kryterium(
                kod="vt.obciazalnosc",
                nazwa_pl="Obciążalność wobec obwodu wtórnego",
                podstawa_pl="Moc znamionowa uzwojenia ≥ obciążenie obwodu (IEC 61869-3).",
                werdykt="brak_danych",
                dostepne=_liczba(obciazalnosc, "VA", 0),
                komentarz_pl=(
                    "Obciążenie obwodu napięciowego jest daną projektową — podaj sumę "
                    "poboru urządzeń zasilanych z tego uzwojenia."
                ),
            )
        )
    else:
        ok = obciazalnosc >= tor.obciazenie_obwodu_va
        kryteria.append(
            Kryterium(
                kod="vt.obciazalnosc",
                nazwa_pl="Obciążalność wobec obwodu wtórnego",
                podstawa_pl="Moc znamionowa uzwojenia ≥ obciążenie obwodu (IEC 61869-3).",
                werdykt="spelnione" if ok else "niespelnione",
                wymagane=_liczba(tor.obciazenie_obwodu_va, "VA", 1),
                dostepne=_liczba(obciazalnosc, "VA", 0),
                komentarz_pl=(
                    None
                    if ok
                    else "Przeciążone uzwojenie wychodzi z klasy dokładności — zmierzone "
                    "napięcie będzie zaniżone."
                ),
            )
        )

    # --- 6. Tor napiecia zerowego ------------------------------------------------
    # Kryterium powstaje TYLKO wtedy, gdy model deklaruje zrodlo napiecia zerowego.
    # Jego BRAK jest nazwany w doborze funkcji zabezpieczeniowych (V12K-252) jako
    # kwestia otwarta — powtarzanie go tutaj byloby szumem.
    zrodlo = tor.zrodlo_napiecia_zerowego
    if zrodlo in ("otwarty_trojkat_vt", "uzwojenie_resztkowe_vt", "obliczone"):
        kryteria.append(_kryterium_toru_zerowego(zrodlo, uklad, uzwojenie_resztkowe))

    return WynikDoboru(kryteria=kryteria)


def _kryterium_toru_zerowego(
    zrodlo: str, uklad: str | None, uzwojenie_resztkowe: bool | None
) -> Kryterium:
    """Czy wybrany przekladnik realizuje ZADEKLAROWANY w modelu tor napiecia zerowego.

    Trzy zrodla to trzy rozne wymagania konstrukcyjne, nie synonimy:
      * otwarty trojkat  — trzy przekladniki faza-ziemia, uzwojenia wtorne w otwartym
                           trojkacie; nie wymaga trzeciego uzwojenia,
      * uzwojenie resztkowe — wymaga TRZECIEGO uzwojenia w przekladniku (dana
                           konstrukcyjna producenta),
      * obliczone        — 3U0 sumowane numerycznie w urzadzeniu; wymaga pomiaru
                           napiec fazowych, czyli ukladu faza-ziemia.
    """
    nazwa = "Realizacja toru napięcia zerowego"
    podstawa = (
        "Kryterium ziemnozwarciowe kierunkowe (67N) i zerowe nadnapięciowe (59N) "
        "wymagają pomiaru 3U0 — jego droga musi istnieć w konstrukcji przekładnika."
    )
    if zrodlo == "uzwojenie_resztkowe_vt":
        if uzwojenie_resztkowe is None:
            return Kryterium(
                kod="vt.tor_napiecia_zerowego",
                nazwa_pl=nazwa,
                podstawa_pl=podstawa,
                werdykt="brak_danych",
                wymagane="uzwojenie resztkowe (trzecie) w przekładniku",
                komentarz_pl=(
                    "Karta producenta tego typu nie mówi, czy uzwojenie resztkowe "
                    "istnieje. W katalogu jest rodzina faza–ziemia z uzwojeniem "
                    "resztkowym — wybierz typ z tej rodziny albo uzupełnij kartę."
                ),
            )
        return Kryterium(
            kod="vt.tor_napiecia_zerowego",
            nazwa_pl=nazwa,
            podstawa_pl=podstawa,
            werdykt="spelnione" if uzwojenie_resztkowe else "niespelnione",
            wymagane="uzwojenie resztkowe (trzecie) w przekładniku",
            dostepne=(
                "uzwojenie resztkowe" if uzwojenie_resztkowe else "brak uzwojenia resztkowego"
            ),
            komentarz_pl=(
                None
                if uzwojenie_resztkowe
                else "Model deklaruje napięcie zerowe z uzwojenia resztkowego, a wybrany "
                "typ go nie ma — kryterium kierunkowe nie miałoby sygnału."
            ),
        )

    # Otwarty trojkat i pomiar obliczany wymagaja tego samego: pomiaru napiec fazowych.
    wymagane = "układ faza–ziemia (przekładnia U_n/√3)"
    if uklad is None:
        return Kryterium(
            kod="vt.tor_napiecia_zerowego",
            nazwa_pl=nazwa,
            podstawa_pl=podstawa,
            werdykt="brak_danych",
            wymagane=wymagane,
            komentarz_pl=(
                "Układu pracy przekładnika nie ustalono, bo nie zgadza się przekładnia "
                "z napięciem sieci — najpierw rozstrzygnij kryterium przekładni."
            ),
        )
    ok = uklad == "faza_ziemia"
    return Kryterium(
        kod="vt.tor_napiecia_zerowego",
        nazwa_pl=nazwa,
        podstawa_pl=podstawa,
        werdykt="spelnione" if ok else "niespelnione",
        wymagane=wymagane,
        dostepne=("układ faza–ziemia" if ok else "układ międzyfazowy"),
        komentarz_pl=(
            None
            if ok
            else "Przekładnik międzyfazowy nie mierzy napięć fazowych, więc suma 3U0 "
            "nie powstanie — ani w otwartym trójkącie, ani numerycznie w urządzeniu."
        ),
    )
