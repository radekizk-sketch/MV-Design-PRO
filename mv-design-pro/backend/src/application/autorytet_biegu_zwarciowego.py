"""Most: bieg kanoniczny → miarodajne wejście zwarciowe (warstwa aplikacji).

DLACZEGO TEN MODUŁ ISTNIEJE (audyt niezależny, plan naprawy §3). Bramka
autorytetu sprawdzała dotąd proweniencję MODELU podanego w żądaniu i nie pytała,
skąd pochodzą LICZBY. Odtworzone na HEAD: żądanie z poprawnym modelem, wymyśloną
wartością ``ik3p`` i ``run_id`` wskazującym bieg, którego nigdy nie było, dawało
kompletny pakiet dowodowy — dla 12,5 kA i dla 999 kA jednakowo (HTTP 200).

REGUŁA, KTÓRĄ TEN MODUŁ EGZEKWUJE:

    liczby zwarciowe wchodzące do decyzji miarodajnej
    pochodzą z ZAPISANEGO BIEGU, nie z żądania.

Konsument podaje ``run_id`` i punkt zwarcia. Wielkości bierzemy z artefaktu tego
biegu; proweniencję ``k_sc`` wyprowadzamy z migawki, która w tym biegu została
policzona (a nie z migawki dołączonej do żądania); wiązanie wiąże jedno z drugim.
Liczby przysłane przez konsumenta są wyłącznie ECHEM: wolno je porównać i odrzucić
przy rozbieżności, nigdy użyć.

FAIL-CLOSED NA KAŻDYM KROKU: brak biegu, bieg niezakończony, bieg innego rodzaju,
brak punktu zwarcia w wyniku — każdy z tych stanów jest ODMOWĄ, nie przepustką.
"""

from __future__ import annotations

import math
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from network_model.core.autorytet_wyniku_zwarciowego import (
    ProweniencjaWynikuZwarciowego,
)
from network_model.core.wiazanie_wyniku_zwarciowego import (
    WiazanieWynikuZwarciowego,
    wielkosci_do_odcisku,
)

#: Rodzaje analizy kanonicznej, których artefakt niesie wielkości zwarciowe.
#: Lista JAWNA, nie dopełnienie: bieg rozpływowy nie ma prądu zwarciowego, więc
#: sięganie do niego po ``ikss_a`` musi być odmową, a nie cichym ``None``.
RODZAJE_BIEGU_ZWARCIOWEGO: frozenset[str] = frozenset(
    {
        "short_circuit_sn",
        "SC_3F",
        "SC_1F",
        "SC_2F",
        "SC_2F_G",
    }
)


#: Kontrakt ECHA: klucz konsumenta -> (pole wyniku solvera, mnożnik jednostek).
#: Lista ZAMKNIĘTA i wspólna dla przeliczenia i dla wykrywania pól nieznanych —
#: dwie listy, które „dziś się zgadzają", są defektem czekającym na dane brzegowe.
KLUCZE_ECHA: dict[str, tuple[str, float]] = {
    "u_kv": ("un_v", 1000.0),
    "ikss_ka": ("ikss_a", 1000.0),
    "ip_ka": ("ip_a", 1000.0),
    "ith_ka": ("ith_a", 1000.0),
    "tk_s": ("tk_s", 1.0),
}


class BiegNiemiarodajnyError(Exception):
    """Bieg nie może być źródłem liczb dla decyzji miarodajnej.

    ``powod`` jest kodem maszynowym (warstwa API mapuje go na odpowiedź),
    ``komunikat_pl`` mówi projektantowi, co zrobić.
    """

    def __init__(self, powod: str, komunikat_pl: str) -> None:
        self.powod = powod
        self.komunikat_pl = komunikat_pl
        super().__init__(komunikat_pl)


@dataclass(frozen=True)
class WejscieZwarcioweZBiegu:
    """Komplet, którego konsument miarodajny potrzebuje — wyprowadzony z biegu."""

    proweniencja: ProweniencjaWynikuZwarciowego
    wiazanie: WiazanieWynikuZwarciowego
    wielkosci: dict[str, Any]
    """Liczby zwarciowe Z ARTEFAKTU BIEGU — to ich wolno użyć, nie tych z żądania."""

    def niezgodnosci_z_echem(self, echo: Mapping[str, Any] | None) -> tuple[str, ...]:
        """Czym liczby przysłane przez konsumenta różnią się od liczb biegu.

        ``None`` (konsument nic nie przysłał) jest w porządku — bierzemy liczby
        biegu. Przysłane i RÓŻNE nie są w porządku: konsument zamierzał użyć
        czegoś innego, niż policzył solver, i musi się o tym dowiedzieć.

        KLUCZ SPOZA LISTY TEŻ JEST NIEZGODNOŚCIĄ. Pole, którego nie umiemy
        porównać, nie wchodzi do odcisku — więc ciche przyjęcie go znaczyłoby
        „przysłałeś liczbę, zignorowaliśmy ją i nic o tym nie powiedzieliśmy".
        To jest ta sama klasa milczenia, przez którą wielkości z żądania
        wchodziły do dowodu.
        """
        if echo is None:
            return ()
        nieznane = sorted(k for k in echo if k not in KLUCZE_ECHA)
        roznice = list(self.wiazanie.niezgodnosci(wynik=_wielkosci_z_echa(echo, self.wielkosci)))
        if nieznane:
            roznice.append(
                f"pola spoza kontraktu wielkości zwarciowych: {', '.join(nieznane)} — "
                f"porównywalne są wyłącznie {', '.join(sorted(KLUCZE_ECHA))}"
            )
        return tuple(roznice)


def _wielkosci_z_echa(echo: Mapping[str, Any], wzorzec: Mapping[str, Any]) -> dict[str, Any]:
    """Przełóż echo konsumenta na pola odcisku, zachowując pola spoza echa.

    Konsument przysyła wielkości w kilo- (``u_kv``, ``ikss_ka``, ``ip_ka``,
    ``ith_ka``); odcisk liczy się z pól solvera w jednostkach podstawowych
    (``un_v`` w woltach, prądy w amperach). LISTA JEST ZAMKNIĘTA i pokrywa
    KOMPLET wielkości, które konsument może przysłać — pole pominięte tutaj
    przechodziłoby przez porównanie bez zmiany odcisku, czyli podmiana w nim
    byłaby niewidoczna (dokładnie to zdarzyło się przy pierwszym przebiegu dla
    ``u_kv``). Przeliczenie jest tutaj, w warstwie aplikacji, bo jest mapowaniem
    kontraktu — nie fizyką.
    """
    przeliczone = dict(wzorzec)
    for klucz_echa, (klucz_pola, mnoznik) in KLUCZE_ECHA.items():
        if klucz_echa not in echo or echo[klucz_echa] is None:
            continue
        try:
            przeliczone[klucz_pola] = float(echo[klucz_echa]) * mnoznik
        except (TypeError, ValueError):
            # Wartość nieprzeliczalna zostawiamy jako podaną: odcisk i tak się
            # rozjedzie, a komunikat ma wskazać ROZBIEŻNOŚĆ, nie typ.
            przeliczone[klucz_pola] = echo[klucz_echa]
    return przeliczone


def _wiersz_dla_punktu(artefakt: Mapping[str, Any], punkt_zwarcia: str) -> dict[str, Any] | None:
    for wiersz in artefakt.get("results", []) or []:
        if isinstance(wiersz, Mapping) and wiersz.get("fault_node_id") == punkt_zwarcia:
            return dict(wiersz)
    return None


def bieg_zwarciowy_miarodajny(run_id: str | None) -> Any:
    """Zwróć ZAPISANY bieg zwarciowy albo odmów — JEDNO miejsce wszystkich kontroli.

    Trzy stany odmowy są ROZŁĄCZNE, bo różni je naprawa: biegu nie ma (przelicz),
    bieg jest innego rodzaju (wskaż zwarciowy), bieg nie jest zakończony (poczekaj).
    Jeden wspólny kod odmowy kazałby projektantowi zgadywać, który z trzech.
    """
    from enm.canonical_analysis import get_run

    if run_id is None or not str(run_id).strip():
        raise BiegNiemiarodajnyError(
            "BIEG_NIE_WSKAZANY",
            "Nie wskazano biegu zwarciowego. Wielkości zwarciowe wchodzące do decyzji "
            "miarodajnej pochodzą z zapisanego biegu, nie z żądania.",
        )
    try:
        identyfikator = UUID(str(run_id))
    except (TypeError, ValueError) as exc:
        raise BiegNiemiarodajnyError(
            "BIEG_NIE_ISTNIEJE",
            f"Identyfikator biegu '{run_id}' nie jest identyfikatorem biegu kanonicznego. "
            "Dowód powstaje z zapisanego biegu, więc bieg musi istnieć.",
        ) from exc

    bieg = get_run(identyfikator)
    if bieg is None:
        raise BiegNiemiarodajnyError(
            "BIEG_NIE_ISTNIEJE",
            f"Bieg '{run_id}' nie istnieje. Dowód nie może powstać z biegu, którego nie ma "
            "— przelicz zwarcie i podaj identyfikator wykonanego biegu.",
        )
    if bieg.analysis_type not in RODZAJE_BIEGU_ZWARCIOWEGO:
        raise BiegNiemiarodajnyError(
            "BIEG_INNEGO_RODZAJU",
            f"Bieg '{run_id}' jest rodzaju '{bieg.analysis_type}' i nie niesie wielkości "
            "zwarciowych. Wskaż bieg zwarciowy.",
        )
    if bieg.status != "FINISHED":
        raise BiegNiemiarodajnyError(
            "BIEG_NIEZAKONCZONY",
            f"Bieg '{run_id}' ma stan '{bieg.status}'. Wielkości niezakończonego biegu nie są "
            "wynikiem — poczekaj na zakończenie albo przelicz ponownie.",
        )
    return bieg


def wejscie_zwarciowe_z_biegu(*, run_id: str, punkt_zwarcia: str) -> WejscieZwarcioweZBiegu:
    """Miarodajne wejście zwarciowe wyprowadzone z ZAPISANEGO biegu.

    Podnosi ``BiegNiemiarodajnyError`` przy każdym stanie, w którym liczb nie da
    się uczciwie wskazać. Nie zwraca „pustego wejścia": brak biegu to odmowa.
    """
    bieg = bieg_zwarciowy_miarodajny(run_id)
    artefakt = bieg.raw_result or {}
    wiersz = _wiersz_dla_punktu(artefakt, punkt_zwarcia)
    if wiersz is None:
        dostepne = sorted(
            str(w.get("fault_node_id"))
            for w in (artefakt.get("results") or [])
            if isinstance(w, Mapping)
        )
        raise BiegNiemiarodajnyError(
            "PUNKT_ZWARCIA_SPOZA_BIEGU",
            f"Bieg '{run_id}' nie zawiera punktu zwarcia '{punkt_zwarcia}'. "
            f"Policzone punkty: {', '.join(dostepne) if dostepne else 'brak'}.",
        )

    from application.autorytet_zwarciowy import proweniencja_ze_snapshotu

    proweniencja = proweniencja_ze_snapshotu(bieg.snapshot)
    wiazanie = WiazanieWynikuZwarciowego.z_biegu(
        run_id=str(bieg.id),
        snapshot_id=bieg.snapshot_hash,
        punkt_zwarcia=punkt_zwarcia,
        migawka_wejscia=bieg.snapshot or {},
        wynik=wiersz,
    )
    return WejscieZwarcioweZBiegu(
        proweniencja=proweniencja,
        wiazanie=wiazanie,
        wielkosci=wielkosci_do_odcisku(wiersz),
    )


# ---------------------------------------------------------------------------
# Koordynacja zabezpieczeń — prądy z DWÓCH biegów (maksymalnego i minimalnego)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class WejscieKoordynacjiZBiegow:
    """Prądy zwarciowe koordynacji wyprowadzone z dwóch ZAPISANYCH biegów.

    Koordynacja potrzebuje DWÓCH scenariuszy: maksymalnego (selektywność,
    wytrzymałość) i minimalnego (czułość). Kanoniczny bieg liczy JEDEN scenariusz,
    więc miarodajna koordynacja wymaga dwóch biegów — i obu trzeba dowieść.
    """

    proweniencja: ProweniencjaWynikuZwarciowego
    wiazanie_max: WiazanieWynikuZwarciowego
    wiazanie_min: WiazanieWynikuZwarciowego
    prady_max_a: dict[str, float]
    prady_min_a: dict[str, float]
    wartosci_odrzucone: tuple[str, ...] = ()
    """Wiersze biegów, których prądu NIE wolno użyć — z podaniem przyczyny.

    Puste znaczy „każdy wiersz obu biegów niósł liczbę nadającą się do
    koordynacji". Niepuste MUSI zablokować wynik autorytatywny: wiersz z
    ``NaN`` nie jest wierszem bez prądu, tylko wierszem, którego prąd nie jest
    liczbą — a to inna informacja i inna decyzja."""


def _identyfikatory_wiersza(wiersz: Mapping[str, Any], grafy: Mapping[str, Any]) -> tuple[str, ...]:
    """Identyfikatory, po których wolno dopasować wiersz do lokalizacji urządzenia.

    Kolejność i zbiór są TE SAME co w widoku, który czyta ekran koordynacji
    (`canonical_analysis.build_short_circuit_results`: ``target_id`` = węzeł
    zwarcia, ``element_id`` = element modelu albo węzeł). Gdyby backend
    dopasowywał inaczej niż ekran, ta sama lokalizacja trafiałaby na inny wiersz
    po obu stronach — i porównanie „liczba z żądania wobec liczby biegu" byłoby
    porównaniem dwóch różnych punktów sieci.
    """
    wezel = str(wiersz.get("fault_node_id") or "")
    element = str((grafy.get(wezel) or {}).get("element_id") or "") or wezel
    return tuple(dict.fromkeys(x for x in (wezel, element) if x))


def _prad_koordynacji(wartosc: Any) -> float | None:
    """Prąd nadający się do koordynacji albo ``None`` — JEDEN predykat.

    Używany PRZY BUDOWIE mapy i PRZY PORÓWNANIU z żądaniem. Dwa niezależne
    sprawdzenia tej samej własności rozjeżdżają się przy pierwszej wartości
    brzegowej — a tutaj wartością brzegową jest ``NaN``, który przechodzi przez
    KAŻDE porównanie jako fałsz.
    """
    try:
        liczba = float(wartosc)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(liczba) or liczba <= 0.0:
        return None
    return liczba


def _prady_zwarciowe_biegu(bieg: Any, opis_biegu: str) -> tuple[dict[str, float], tuple[str, ...]]:
    """``identyfikator lokalizacji -> I''k [A]`` z artefaktu biegu + ODRZUCONE.

    Pierwszy wiersz wygrywa — tak samo jak w widoku ekranu; kolejność wyników
    biegu jest deterministyczna, więc odwzorowanie też.

    KAŻDY WIERSZ, NIE PIERWSZY (recenzja niezależna, P0-DELTA-25). Poprzednia
    wersja wołała ``float(wartosc)`` bez kontroli skończoności dla wszystkich
    wierszy poza pierwszym (tylko pierwszy wchodził do wiązania wyniku). ``NaN``
    wchodził wtedy do mapy, a porównanie ``abs(podany - NaN) > tolerancja`` jest
    FAŁSZEM dla każdego ``podany`` — więc dowolny prąd z żądania przechodził jako
    „zgodny z biegiem". Zmierzony kontrprzykład recenzenta: ``999999 A`` dla MAX i
    ``1 A`` dla MIN, obie przyjęte bez jednej różnicy.

    To jest ta sama reguła KLASA, NIE INSTANCJA, którą ten moduł stosuje gdzie
    indziej: kontrola nałożona na wiersz PIERWSZY nie jest kontrolą nałożoną na
    wiersze.
    """
    artefakt = bieg.raw_result or {}
    grafy = (artefakt.get("graph") or {}).get("nodes") or {}
    mapa: dict[str, float] = {}
    odrzucone: list[str] = []
    for numer, wiersz in enumerate(artefakt.get("results", []) or []):
        if not isinstance(wiersz, Mapping):
            continue
        surowa = wiersz.get("ikss_a")
        if surowa is None:
            continue
        liczba = _prad_koordynacji(surowa)
        identyfikatory = _identyfikatory_wiersza(wiersz, grafy)
        if liczba is None:
            odrzucone.append(
                f"bieg {opis_biegu}, wiersz {numer} "
                f"({', '.join(identyfikatory) or 'bez identyfikatora'}): prąd "
                f"zwarciowy {surowa!r} nie jest skończoną liczbą dodatnią, więc "
                f"nie może potwierdzić żadnej wartości koordynacji"
            )
            continue
        for ident in identyfikatory:
            mapa.setdefault(ident, liczba)
    return mapa, tuple(odrzucone)


def _scenariusz_biegu(bieg: Any) -> str:
    """``MAX`` albo ``MIN`` — z artefaktu biegu, nie z nazwy ani z domysłu."""
    return str((bieg.raw_result or {}).get("scenario") or "MAX").upper()


def wejscie_koordynacji_z_biegow(
    *, run_id_max: str | None, run_id_min: str | None
) -> WejscieKoordynacjiZBiegow:
    """Prądy koordynacji z biegu MAKSYMALNEGO i MINIMALNEGO — obu wymaganych.

    KONTROLE, KAŻDA Z WŁASNĄ PRZYCZYNĄ:
    - oba biegi istnieją, są zwarciowe i zakończone (`bieg_zwarciowy_miarodajny`),
    - bieg maksymalny niesie scenariusz MAX, minimalny — MIN; zamiana miejscami
      dałaby czułość liczoną z prądu maksymalnego, czyli werdykt zawyżony,
    - oba biegi mają TĘ SAMĄ migawkę modelu; prądy z dwóch różnych sieci opisują
      dwa różne układy, a marginesy między nimi nie znaczą nic.
    """
    bieg_max = bieg_zwarciowy_miarodajny(run_id_max)
    bieg_min = bieg_zwarciowy_miarodajny(run_id_min)

    for bieg, oczekiwany, opis in (
        (bieg_max, "MAX", "maksymalny"),
        (bieg_min, "MIN", "minimalny"),
    ):
        rzeczywisty = _scenariusz_biegu(bieg)
        if rzeczywisty != oczekiwany:
            raise BiegNiemiarodajnyError(
                "SCENARIUSZ_BIEGU_NIEZGODNY",
                f"Bieg wskazany jako {opis} niesie scenariusz '{rzeczywisty}', "
                f"a wymagany jest '{oczekiwany}'. Czułość liczona z prądu maksymalnego "
                "albo selektywność z minimalnego dałaby werdykt bez pokrycia w fizyce.",
            )

    if bieg_max.snapshot_hash != bieg_min.snapshot_hash:
        raise BiegNiemiarodajnyError(
            "BIEGI_Z_ROZNYCH_MODELI",
            f"Bieg maksymalny opisuje model {bieg_max.snapshot_hash[:16]}…, a minimalny "
            f"{bieg_min.snapshot_hash[:16]}…. Marginesy liczone między prądami z dwóch "
            "różnych sieci nie znaczą nic — przelicz oba scenariusze na tym samym modelu.",
        )

    from application.autorytet_zwarciowy import proweniencja_ze_snapshotu

    def wiazanie(bieg: Any) -> WiazanieWynikuZwarciowego:
        wiersze = (bieg.raw_result or {}).get("results") or []
        pierwszy = dict(wiersze[0]) if wiersze else {}
        return WiazanieWynikuZwarciowego.z_biegu(
            run_id=str(bieg.id),
            snapshot_id=bieg.snapshot_hash,
            punkt_zwarcia=str(pierwszy.get("fault_node_id") or "brak"),
            migawka_wejscia=bieg.snapshot or {},
            wynik=pierwszy,
        )

    prady_max, odrzucone_max = _prady_zwarciowe_biegu(bieg_max, "maksymalny")
    prady_min, odrzucone_min = _prady_zwarciowe_biegu(bieg_min, "minimalny")

    # PROWENIENCJA Z OBU BIEGÓW, NIE Z MAKSYMALNEGO (recenzja, P0-DELTA-24).
    # Poprzednia wersja brała ją wyłącznie z migawki biegu MAX. Bieg MIN mógł
    # wtedy nieść `DEFAULT_FORBIDDEN`, a koordynacja i tak dostawała proweniencję
    # `DEKLARACJA` i używała minimalnego prądu — czyli wynik, którego właściciel
    # jawnie zakazał, ustanawiał nastawę czułości.
    #
    # Znaczniki obu migawek są SUMOWANE: zastrzeżenie któregokolwiek biegu jest
    # zastrzeżeniem koordynacji, bo koordynacja konsumuje OBA prądy. Suma, a nie
    # wybór jednego — wybór wymagałby uzasadnienia, którego nie ma: nie istnieje
    # powód, dla którego wkład DER miałby być miarodajny w jednym scenariuszu i
    # nieistotny w drugim.
    proweniencja_max = proweniencja_ze_snapshotu(bieg_max.snapshot)
    proweniencja_min = proweniencja_ze_snapshotu(bieg_min.snapshot)
    proweniencja_obu = ProweniencjaWynikuZwarciowego.ze_znacznikow(
        tuple(proweniencja_max.znaczniki_k_sc) + tuple(proweniencja_min.znaczniki_k_sc)
    )

    return WejscieKoordynacjiZBiegow(
        proweniencja=proweniencja_obu,
        wiazanie_max=wiazanie(bieg_max),
        wiazanie_min=wiazanie(bieg_min),
        prady_max_a=prady_max,
        prady_min_a=prady_min,
        wartosci_odrzucone=odrzucone_max + odrzucone_min,
    )


#: Ile prąd podany w żądaniu może się różnić od prądu biegu, żeby uznać go za TEN
#: SAM. Wartość wynika z drogi liczby: bieg → widok (A → kA, dzielenie przez 1000)
#: → ekran → żądanie (kA → A, mnożenie przez 1000). Podwójne przeliczenie przez
#: 1000 w double daje błąd względny rzędu 1e-16; próg 1e-9 jest o siedem rzędów
#: luźniejszy, a nadal o dziewięć rzędów ostrzejszy niż jakakolwiek PODMIANA
#: wartości inżynierskiej. NIE jest to tolerancja fizyczna — to margines
#: przeliczenia jednostek.
TOLERANCJA_WZGLEDNA_PRADU = 1.0e-9


def niezgodnosci_pradow_koordynacji(
    wejscie: WejscieKoordynacjiZBiegow, prady_zadania: Iterable[Mapping[str, Any]]
) -> tuple[str, ...]:
    """Czym prądy z żądania różnią się od prądów biegów. Pusto = to te same liczby."""
    # WARTOŚCI ODRZUCONE IDĄ PIERWSZE. Wiersz, którego prąd nie jest liczbą, nie
    # może zostać „potwierdzony" żadną wartością z żądania — a bez tej pozycji
    # jego brak w mapie wyglądałby jak brak lokalizacji w biegu, czyli inna
    # przyczyna i mylący komunikat.
    roznice: list[str] = list(wejscie.wartosci_odrzucone)
    for pozycja in prady_zadania:
        lokalizacja = str(pozycja.get("location_id") or "")
        for klucz, mapa, opis in (
            ("ik_max_3f_a", wejscie.prady_max_a, "maksymalny"),
            ("ik_min_3f_a", wejscie.prady_min_a, "minimalny"),
        ):
            podany = pozycja.get(klucz)
            if podany is None:
                continue
            # WARTOŚĆ Z ŻĄDANIA TEŻ MUSI BYĆ LICZBĄ. `abs(NaN - x) > tolerancja`
            # jest fałszem, więc bez tego sprawdzenia `NaN` w żądaniu przechodził
            # jako zgodny z każdym prądem biegu — ta sama dziura, tylko z drugiej
            # strony porównania.
            if _prad_koordynacji(podany) is None:
                roznice.append(
                    f"{lokalizacja}.{klucz}: podana wartość {podany!r} nie jest "
                    f"skończoną liczbą dodatnią"
                )
                continue
            z_biegu = mapa.get(lokalizacja)
            if z_biegu is None:
                roznice.append(
                    f"{lokalizacja}: bieg {opis} nie zawiera prądu zwarciowego dla tej "
                    "lokalizacji — nie ma czym potwierdzić podanej wartości"
                )
                continue
            odchylka = abs(float(podany) - z_biegu)
            if odchylka > TOLERANCJA_WZGLEDNA_PRADU * max(abs(z_biegu), 1.0):
                roznice.append(
                    f"{lokalizacja}.{klucz}: podano {float(podany):.6f} A, "
                    f"bieg {opis} policzył {z_biegu:.6f} A"
                )
        for klucz in ("ik_max_2f_a", "ik_min_1f_a"):
            if pozycja.get(klucz) is not None:
                roznice.append(
                    f"{lokalizacja}.{klucz}: wielkość niezwiązana z żadnym biegiem — "
                    "kanoniczny bieg zwarciowy liczy zwarcie trójfazowe, więc prądu "
                    "dwufazowego ani jednofazowego nie ma czym potwierdzić"
                )
    return tuple(roznice)
