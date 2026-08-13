"""Wiązanie spadku napięcia: ZAPIS BIEGU → odcinki gotowe dla dowodu.

STATUS: CANONICAL (karta PACK-BEZ-KONSUMENTA, rejestr V12K).

DEFEKT, KTÓRY TO ZAMYKA. Generator pakietu dowodowego spadku napięcia
(``application/proof_engine/packs/vdrop.py``) nie miał żadnego konsumenta. Wpis
długu PACK-DLUG-SPADEK tłumaczył to tak: „wymaga DEFINICJI odcinka odniesienia,
której bieg nie niesie — dowolny wybór odcinka byłby fabrykacją zakresu dowodu".

TEZA DŁUGU OBALONA POMIAREM, ALE TYLKO W POŁOWIE. Dane odcinka bieg niesie w
całości (impedancja jednostkowa i długość ze snapshotu, przepływ P/Q z zamrożonego
wyniku, napięcie początku odcinka z ``node_voltage_kv``) — brakowało wyłącznie
ODPOWIEDZI NA PYTANIE „który odcinek". I to jest prawdziwa treść tamtego wpisu.
Rozwiązanie nie polega jednak na wybraniu odcinka przez kod (to byłaby fabrykacja
zakresu, wpis miał rację), tylko na oddaniu wyboru UŻYTKOWNIKOWI — dokładnie tak,
jak brama oddaje mu wybór punktu zwarcia. Ten moduł wystawia zbiór ODCINKÓW, z
których użytkownik wybiera; nie wybiera za niego i nie zgaduje.

WZORZEC BLIŹNIACZY: ``application/solvers/power_flow_binding.py``. Tamten odtwarza
zamrożony wynik rozpływu, ten składa opis odcinka. **Żaden z nich nie liczy
fizyki** — tu nie ma ani jednego działania na wielkościach fizycznych; jest odczyt,
kontrola kompletności i złożenie struktury. Mnożenie ``r·L`` i wzór na ΔU stoją w
generatorze dowodu, gdzie były od początku.

ZERO FABRYKACJI (warunek brzegowy karty). Odcinek, któremu brakuje choć jednej
wielkości, NIE JEST OFERTĄ — nie dostaje zera ani wartości domyślnej. Odcinkiem
jest wyłącznie linia napowietrzna albo kabel: aparat łączeniowy nie ma długości,
a transformator zmienia napięcie przekładnią, nie spadkiem wzdłużnym, więc wzór
ΔU = (R·P + X·Q)/U_n² nie opisuje ani jednego, ani drugiego.

ZGODNOŚĆ Z WYNIKIEM BIEGU — ZMIERZONA, NIE ZAŁOŻONA (i słabsza, niż wyglądała).
Wzór dowodu ΔU = (R·P + X·Q)/U_n² jest klasycznym przybliżeniem: pomija składową
poprzeczną, którą rozpływ zna dokładnie. Zmierzone na dwóch sieciach:

* SAM SPADEK ΔU zgadza się z biegiem bardzo dobrze. Sieć 110/15 kV, ΔU = 6,36 %:
  dowód 0,9536 kV wobec 0,9532 kV z napięć węzłowych biegu — różnica 0,4 V.
  Kabel SN przy ΔU = 0,03 %: różnica poniżej 0,001 V. Ten wynik ma pin.
* NAPIĘCIE KOŃCA ODCINKA (krok EQ_VDROP_007) jest słabsze: 13,858 kV w dowodzie
  wobec 13,845 kV w biegu — 12,4 V, czyli 0,09 % U. Przyczyna jest arytmetyczna,
  nie fizyczna: krok mnoży ΔU ODNIESIONE DO U_n przez napięcie POCZĄTKU odcinka,
  a te dwie podstawy są różne, gdy początek nie stoi na napięciu znamionowym.
  Przy U_początku = U_n różnica znika (zmierzone 0,000 V).

Pierwszy pomiar tej karty pokazywał 0,245 V i wyglądał na dowód pełnej zgodności —
bo padł na sieci, w której początek odcinka stał DOKŁADNIE na 15 kV, czyli akurat
tam, gdzie mieszanie podstaw nic nie kosztuje. Deklaracja została osłabiona do
prawdy zamiast zostać przy liczbie z wygodnego przypadku.

DŁUG PODSTAWA-VDROP — ZAMKNIĘTY (karta PODSTAWA-VDROP, 2026-08-12). Naprawa
zmieniła kanoniczne równanie EQ_VDROP_007: odjęcie w kV (``U = U_source −
ΔU_total``, oba w kV) zamiast mnożenia U_source przez ułamek ΔU_total%
odniesiony do U_n. ΔU_total w kV pochodzi z SUMY spadków odcinkowych w
jednostkach bezwzględnych — łańcuch EQ_VDROP_001..006 TEGO SAMEGO dowodu
(R, X, P, Q, U_n odcinka), przeliczony przez U_n, NIGDY z wyniku biegu (to
byłoby dowodzeniem cyrkularnym). Ta warstwa (``voltage_drop_binding.py``) się
NIE zmieniła — dostarczała komplet R/X/P/Q/U_n/U_początku już wcześniej;
naprawa siedzi wyłącznie w ``proof_generator.py`` (krok EQ_VDROP_007) i
``equation_registry.py`` (definicja równania), zgodnie z zapowiedzią wyżej.

POMIAR PO NAPRAWIE (sieć 110/15 kV, ta sama co wyżej: U_początku = 14,7984 kV,
ΔU_total = 6,3574 %). Krok EQ_VDROP_007 daje teraz 13,8448 kV wobec 13,8452 kV
z napięć węzłowych biegu — 0,375 V rozjazdu, ZNACZĄCO mniej niż 12,4 V sprzed
naprawy (redukcja ~33×). Rezydualna różnica jest tej samej natury co różnica
SAMEGO ΔU zmierzona wyżej (0,4 V) — bo po naprawie są ALGEBRAICZNIE tą samą
liczbą: U_source kroku i napięcie węzła początku z biegu to TA SAMA wartość
(``u_poczatku_kv`` tej warstwy), więc rozjazd U_end = rozjazd ΔU_total_kV, nie
nowy, niezależny błąd. Rezydualne 0,375 V wynika z przybliżenia ΔU =
(R·P+X·Q)/U_n², które pomija składową poprzeczną znaną rozpływowi dokładnie —
NIE z mieszania podstaw (usuniętego z konstrukcji). Pin:
``tests/api/test_pakiet_dowodowy_biegu.py::test_napiecie_konca_z_dowodu_zgadza_sie_z_napieciem_biegu_karta_podstawa_vdrop``
oraz testy jednostkowe w
``tests/proof_engine/test_proof_engine.py::TestVDROPPodstawaKonca``.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

#: Rodzaj wyniku, jaki zapisuje tor rozpływu (``enm.canonical_analysis``).
RODZAJ_WYNIKU_ROZPLYWU = "load_flow"

#: Rodzaje gałęzi ENM, które SĄ odcinkiem o spadku wzdłużnym. Lista ZAMKNIĘTA:
#: rodzaj spoza niej nie ma impedancji jednostkowej i długości, więc wzór dowodu
#: nie ma się na czym oprzeć. Pin równości zbiorów: tests/application/test_wiazanie_spadku_napiecia.py.
RODZAJE_ODCINKA: frozenset[str] = frozenset({"line_overhead", "cable"})


class BrakDanychSpadkuError(ValueError):
    """Zapis biegu nie niesie danych, z których dowód spadku mógłby powstać uczciwie.

    Komunikat jest po polsku i nazywa BRAKUJĄCĄ rzecz — brama pakietu pokazuje go
    projektantowi wprost, zamiast milczeć albo składać dowód z domysłów.
    """


@dataclass(frozen=True)
class OdcinekSpadku:
    """Odcinek linii/kabla przebiegu wraz z kompletem danych dowodu spadku napięcia."""

    id_galezi: str
    nazwa: str
    od_szyny: str
    do_szyny: str
    r_ohm_per_km: float
    x_ohm_per_km: float
    length_km: float
    p_mw: float
    q_mvar: float
    u_n_kv: float
    u_poczatku_kv: float


def odcinki_spadku_napiecia(
    *,
    raw_result: dict[str, Any] | None,
    snapshot: dict[str, Any] | None,
) -> list[OdcinekSpadku]:
    """Odcinki przebiegu, dla których da się złożyć dowód spadku napięcia.

    Kolejność deterministyczna (po identyfikatorze gałęzi). Pusta lista NIE jest
    błędem — bieg może nie mieć ani jednej linii i ani jednego kabla (sama
    rozdzielnia z transformatorem); wtedy pakiet przebiegu powstaje bez dowodu
    spadku, a brama mówi to wprost.

    Podnosi ``BrakDanychSpadkuError``, gdy bieg nie jest rozpływem albo gdy jego
    artefakt nie ma struktur, na których cała ta operacja stoi — bo wtedy pusta
    lista kłamałaby („nie ma odcinków" zamiast „nie ma z czego czytać").
    """
    artefakt = raw_result or {}
    if artefakt.get("analysis_type") != RODZAJ_WYNIKU_ROZPLYWU:
        raise BrakDanychSpadkuError(
            "Ten przebieg nie jest rozpływem mocy — dowodu spadku napięcia nie da "
            "się z niego złożyć."
        )

    galezie_grafu = _slownik(artefakt.get("graph"), "graph").get("branches")
    wezly_grafu = _slownik(artefakt.get("graph"), "graph").get("nodes")
    if not isinstance(galezie_grafu, dict) or not isinstance(wezly_grafu, dict):
        raise BrakDanychSpadkuError(
            "Artefakt przebiegu nie zawiera opisu gałęzi i węzłów sieci — "
            "bez niego nie wiadomo, jakie odcinki bieg policzył."
        )
    napiecia_kv = artefakt.get("node_voltage_kv")
    if not isinstance(napiecia_kv, dict):
        raise BrakDanychSpadkuError(
            "Przebieg nie podaje napięć węzłowych w kV — dowód spadku nie miałby "
            "od czego odmierzyć napięcia początku odcinka."
        )
    przeplywy = _przeplywy_galezi(artefakt)
    odcinki_enm = _odcinki_ze_snapshotu(snapshot)

    wynik: list[OdcinekSpadku] = []
    for id_galezi in sorted(galezie_grafu):
        opis = galezie_grafu[id_galezi]
        if not isinstance(opis, dict):
            continue
        odcinek = _zloz_odcinek(
            id_galezi=str(id_galezi),
            opis=opis,
            odcinki_enm=odcinki_enm,
            przeplywy=przeplywy,
            wezly_grafu=wezly_grafu,
            napiecia_kv=napiecia_kv,
        )
        if odcinek is not None:
            wynik.append(odcinek)
    return wynik


def _zloz_odcinek(
    *,
    id_galezi: str,
    opis: dict[str, Any],
    odcinki_enm: dict[str, dict[str, Any]],
    przeplywy: dict[str, dict[str, Any]],
    wezly_grafu: dict[str, Any],
    napiecia_kv: dict[str, Any],
) -> OdcinekSpadku | None:
    """Jeden odcinek albo ``None``, gdy czegokolwiek brakuje (nigdy zapas).

    Zwrócenie ``None`` znaczy „ta gałąź nie jest ofertą" — bo nie jest odcinkiem
    (aparat, transformator), bo solver jej nie policzył (gałąź otwarta) albo bo
    zabrakło wielkości. Odcinek spoza tej listy kończy się w bramie jawną odmową,
    więc brak nie może zamienić się w cichy dowód z podstawioną liczbą.
    """
    ref_enm = opis.get("element_id")
    if not isinstance(ref_enm, str):
        return None
    dane_enm = odcinki_enm.get(ref_enm)
    if dane_enm is None:
        return None

    przeplyw = przeplywy.get(id_galezi)
    if przeplyw is None:
        return None

    od_wezla = opis.get("from_node_id")
    do_wezla = opis.get("to_node_id")
    if not isinstance(od_wezla, str) or not isinstance(do_wezla, str):
        return None

    wezel_poczatku = wezly_grafu.get(od_wezla)
    wezel_konca = wezly_grafu.get(do_wezla)
    if not isinstance(wezel_poczatku, dict) or not isinstance(wezel_konca, dict):
        return None

    u_n_kv = _opcjonalna_liczba(wezel_poczatku.get("voltage_level"))
    u_poczatku_kv = _opcjonalna_liczba(napiecia_kv.get(od_wezla))
    p_mw = _opcjonalna_liczba(przeplyw.get("p_from_mw"))
    q_mvar = _opcjonalna_liczba(przeplyw.get("q_from_mvar"))
    if u_n_kv is None or u_poczatku_kv is None or p_mw is None or q_mvar is None:
        return None
    # Napięcie znamionowe stoi w mianowniku wzoru ΔU — zero albo wartość ujemna
    # nie jest „małą liczbą", tylko brakiem podstawy dowodu.
    if u_n_kv <= 0.0 or u_poczatku_kv <= 0.0:
        return None

    return OdcinekSpadku(
        id_galezi=id_galezi,
        nazwa=_nazwa_odcinka(opis, ref_enm),
        od_szyny=_ref_wezla(wezel_poczatku, od_wezla),
        do_szyny=_ref_wezla(wezel_konca, do_wezla),
        r_ohm_per_km=dane_enm["r_ohm_per_km"],
        x_ohm_per_km=dane_enm["x_ohm_per_km"],
        length_km=dane_enm["length_km"],
        p_mw=p_mw,
        q_mvar=q_mvar,
        u_n_kv=u_n_kv,
        u_poczatku_kv=u_poczatku_kv,
    )


def _odcinki_ze_snapshotu(snapshot: dict[str, Any] | None) -> dict[str, dict[str, Any]]:
    """Impedancja jednostkowa i długość odcinków modelu, po identyfikatorze ENM.

    Wyłącznie gałęzie z ``RODZAJE_ODCINKA`` i wyłącznie z KOMPLETEM trzech
    wielkości — gałąź bez którejkolwiek z nich nie trafia do słownika, więc nie
    może stać się ofertą z podstawionym zerem.
    """
    wynik: dict[str, dict[str, Any]] = {}
    for surowa in (snapshot or {}).get("branches") or []:
        if not isinstance(surowa, dict):
            continue
        if str(surowa.get("type")) not in RODZAJE_ODCINKA:
            continue
        ref_id = surowa.get("ref_id")
        if not isinstance(ref_id, str) or not ref_id:
            continue
        r = _opcjonalna_liczba(surowa.get("r_ohm_per_km"))
        x = _opcjonalna_liczba(surowa.get("x_ohm_per_km"))
        dlugosc = _opcjonalna_liczba(surowa.get("length_km"))
        if r is None or x is None or dlugosc is None:
            continue
        # Odcinek zerowej długości nie ma spadku wzdłużnego do udokumentowania —
        # dowód „ΔU = 0, bo L = 0" jest prawdziwy, ale nie jest dowodem odcinka.
        if dlugosc <= 0.0:
            continue
        wynik[ref_id] = {"r_ohm_per_km": r, "x_ohm_per_km": x, "length_km": dlugosc}
    return wynik


def _przeplywy_galezi(artefakt: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Przepływy P/Q gałęzi z zamrożonego wyniku, po identyfikatorze gałęzi."""
    wynik_v1 = artefakt.get("result_v1")
    if not isinstance(wynik_v1, dict):
        raise BrakDanychSpadkuError(
            "Przebieg nie zawiera artefaktu wyniku rozpływu. Uruchom obliczenie ponownie."
        )
    wiersze = wynik_v1.get("branch_results")
    if not isinstance(wiersze, list):
        raise BrakDanychSpadkuError(
            "Artefakt wyniku rozpływu nie zawiera przepływów gałęziowych — "
            "dowód spadku nie miałby czego podstawić za P i Q."
        )
    return {
        str(wiersz["branch_id"]): wiersz
        for wiersz in wiersze
        if isinstance(wiersz, dict) and isinstance(wiersz.get("branch_id"), str)
    }


def _slownik(wartosc: Any, nazwa: str) -> dict[str, Any]:
    if not isinstance(wartosc, dict):
        raise BrakDanychSpadkuError(
            f"Artefakt przebiegu nie zawiera struktury: {nazwa}. Uruchom obliczenie ponownie."
        )
    return wartosc


def _nazwa_odcinka(opis: dict[str, Any], ref_enm: str) -> str:
    nazwa = opis.get("name")
    return nazwa if isinstance(nazwa, str) and nazwa.strip() else ref_enm


def _ref_wezla(wezel: dict[str, Any], id_wezla: str) -> str:
    ref = wezel.get("element_id")
    return ref if isinstance(ref, str) and ref.strip() else id_wezla


def _opcjonalna_liczba(wartosc: Any) -> float | None:
    """Skończona liczba albo ``None`` — nigdy zapas.

    ``None`` w artefakcie oznacza wielkość, której solver nie policzył (serializacja
    zamienia NaN na ``null``), a wartość nieskończona nie nadaje się do dowodu.
    Oba przypadki znaczą „brak", nie „zero".
    """
    if isinstance(wartosc, bool) or not isinstance(wartosc, int | float):
        return None
    liczba = float(wartosc)
    return liczba if math.isfinite(liczba) else None
