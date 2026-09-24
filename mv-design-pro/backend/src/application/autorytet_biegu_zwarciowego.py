"""Most: bieg kanoniczny → miarodajne wejście zwarciowe (warstwa aplikacji).

DLACZEGO TEN MODUŁ ISTNIEJE (karta S-2 AUTORYTET, `docs/plan/
SYNTEZA_DOMKNIECIA_PRODUKTU_2026-09.md` §0 p. 5). Bramka autorytetu
(`network_model.core.autorytet_wyniku_zwarciowego`) sprawdza proweniencję
MODELU podanego jej wprost i nie pyta, skąd pochodzą LICZBY. Odtworzone na HEAD
`c307e95f`: żądanie z poprawnym modelem, wymyśloną wartością ``ikss_ka`` i
``run_id`` wskazującym bieg, którego nigdy nie było, dawało kompletny pakiet
dowodowy — dla 12,5 kA i dla 999 kA jednakowo (HTTP 200).

REGUŁA, KTÓRĄ TEN MODUŁ EGZEKWUJE:

    liczby zwarciowe wchodzące do decyzji miarodajnej
    pochodzą z ZAPISANEGO BIEGU, nie z żądania.

Konsument podaje ``run_id`` i punkt zwarcia. Wielkości bierzemy z artefaktu tego
biegu (``raw_result``); proweniencję ``k_sc`` wyprowadzamy ze znaczników
zapisanych PRZY TYM BIEGU (``raw_result["k_sc_znaczniki"]``, zapisane przez
`enm/assembler.py::zloz_wejscie_zwarcia` z grafu, który TEN bieg policzył — nie
z migawki dołączonej do żądania); wiązanie (`network_model.core.
wiazanie_wyniku_zwarciowego`) wiąże jedno z drugim. Liczby przysłane przez
konsumenta są wyłącznie ECHEM: wolno je porównać i odrzucić przy rozbieżności,
nigdy użyć.

FAIL-CLOSED NA KAŻDYM KROKU: brak biegu, bieg niezakończony, bieg innego rodzaju,
brak punktu zwarcia w wyniku — każdy z tych stanów jest ODMOWĄ, nie przepustką.
"""

from __future__ import annotations

import math
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

from network_model.core.autorytet_wyniku_zwarciowego import ProweniencjaWynikuZwarciowego
from network_model.core.wiazanie_wyniku_zwarciowego import (
    WiazanieWynikuZwarciowego,
    wielkosci_do_odcisku,
)
from network_model.pochodne.jednostki import a_na_ka, v_na_kv

#: Rodzaje biegu kanonicznego, którego artefakt niesie wielkości zwarciowe.
#: Lista JAWNA, nie dopełnienie: bieg rozpływowy nie ma prądu zwarciowego, więc
#: sięganie do niego po ``ikss_a`` musi być odmową, a nie cichym ``None``.
RODZAJE_BIEGU_ZWARCIOWEGO: frozenset[str] = frozenset({"short_circuit_sn"})


#: Kontrakt ECHA: klucz konsumenta -> (pole wyniku solvera, mnożnik jednostek).
#: Lista ZAMKNIĘTA i wspólna dla przeliczenia i dla wykrywania pól nieznanych —
#: dwie listy, które „dziś się zgadzają", są defektem czekającym na dane brzegowe
#: (reguła KLASA NIE INSTANCJA, CLAUDE.md). ``idyn_ka`` NIE JEST tu wymieniony:
#: nie jest wielkością zwarciową (solver jej nie liczy — jest wymaganiem
#: wytrzymałości dynamicznej aparatu, proxy przez ``ip_ka`` w generatorze
#: dowodu), więc dopisanie jej tutaj byłoby fabrykacją wielkości, której bieg
#: nie policzył.
KLUCZE_ECHA: dict[str, tuple[str, float]] = {
    "u_kv": ("un_v", 1000.0),
    "ikss_ka": ("ikss_a", 1000.0),
    "ip_ka": ("ip_a", 1000.0),
    "ith_ka": ("ith_a", 1000.0),
    "tk_s": ("tk_s", 1.0),
}


class BiegNiemiarodajnyError(Exception):
    """Bieg nie może być źródłem liczb dla decyzji miarodajnej.

    ``powod`` jest kodem maszynowym (warstwa API mapuje go na odpowiedź 422),
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
    (``un_v`` w woltach, prądy w amperach — `network_model.pochodne.jednostki.
    ka_na_a`/``kv_na_v``, czysty mnożnik/dzielnik, zero fizyki). LISTA JEST
    ZAMKNIĘTA i pokrywa KOMPLET wielkości, które konsument może przysłać — pole
    pominięte tutaj przechodziłoby przez porównanie bez zmiany odcisku, czyli
    podmiana w nim byłaby niewidoczna. Przeliczenie jest tutaj, w warstwie
    aplikacji, bo jest mapowaniem kontraktu — nie fizyką.
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


def _proweniencja_biegu(bieg: Any) -> ProweniencjaWynikuZwarciowego:
    """Proweniencja k_sc ZAPISANEGO biegu — ze znaczników, nie z modelu na nowo.

    Znaczniki (``raw_result["k_sc_znaczniki"]``) zostały policzone RAZ, z grafu,
    który TEN bieg faktycznie policzył (`enm/assembler.py::zloz_wejscie_zwarcia`,
    `ProweniencjaWynikuZwarciowego.z_grafu`). Klucz nieobecny — bieg sprzed karty
    S-2 albo sieć bez czynnych falowników — daje proweniencję MIARODAJNĄ z pustymi
    znacznikami (`ze_znacznikow(())`): brak falowników nie jest brakiem danych.
    """
    znaczniki = (bieg.raw_result or {}).get("k_sc_znaczniki") or ()
    return ProweniencjaWynikuZwarciowego.ze_znacznikow(znaczniki)


def wejscie_zwarciowe_z_biegu(*, run_id: str | None, punkt_zwarcia: str) -> WejscieZwarcioweZBiegu:
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

    wiazanie = WiazanieWynikuZwarciowego.z_biegu(
        run_id=str(bieg.id),
        snapshot_id=bieg.snapshot_hash,
        punkt_zwarcia=punkt_zwarcia,
        migawka_wejscia=bieg.snapshot or {},
        wynik=wiersz,
    )
    return WejscieZwarcioweZBiegu(
        proweniencja=_proweniencja_biegu(bieg),
        wiazanie=wiazanie,
        wielkosci=wielkosci_do_odcisku(wiersz),
    )


def wielkosci_kontraktu_klienta(wielkosci_biegu: Mapping[str, Any]) -> dict[str, Any]:
    """Wielkości solvera (A, V) -> klucze kontraktu doboru aparatury (kA, kV).

    CZYSTE MAPOWANIE JEDNOSTEK (`network_model.pochodne.jednostki.a_na_ka`/
    ``v_na_kv``), ZERO FIZYKI. ``idyn_ka`` NIE POWSTAJE tutaj — patrz
    `KLUCZE_ECHA` powyżej dla uzasadnienia.
    """

    def _na_liczbe(wartosc: object) -> float | None:
        if wartosc is None:
            return None
        if isinstance(wartosc, bool) or not isinstance(wartosc, int | float):
            raise TypeError(
                f"Wielkość biegu ma typ {type(wartosc).__name__}, a mapowanie jednostek "
                "kontraktu doboru aparatury wymaga liczby — nie zgadujemy."
            )
        return float(wartosc)

    un_v = _na_liczbe(wielkosci_biegu.get("un_v"))
    ikss_a = _na_liczbe(wielkosci_biegu.get("ikss_a"))
    ip_a = _na_liczbe(wielkosci_biegu.get("ip_a"))
    ith_a = _na_liczbe(wielkosci_biegu.get("ith_a"))
    tk_s = wielkosci_biegu.get("tk_s")

    wynik: dict[str, Any] = {}
    if un_v is not None:
        wynik["u_kv"] = v_na_kv(un_v)
    if ikss_a is not None:
        wynik["ikss_ka"] = a_na_ka(ikss_a)
    if ip_a is not None:
        wynik["ip_ka"] = a_na_ka(ip_a)
    if ith_a is not None:
        wynik["ith_ka"] = a_na_ka(ith_a)
    if tk_s is not None:
        wynik["tk_s"] = tk_s
    return wynik


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
    migawka: Mapping[str, Any] = field(default_factory=dict)
    """Migawka modelu, na której stoją OBA biegi (ta sama — sprawdzone). Źródło
    rozstrzygnięcia zacisku urządzenia na gałęzi albo łączniku (szyna, na której
    leży prąd zwarciowy lokalizacji — decyzja O-51 pkt 7)."""


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

    KAŻDY WIERSZ, NIE PIERWSZY: ``NaN``/wartość niepoprawna w KTÓRYMKOLWIEK
    wierszu musi wejść do ``wartosci_odrzucone`` — kontrola nałożona tylko na
    pierwszy wiersz nie jest kontrolą nałożoną na wiersze (reguła KLASA NIE
    INSTANCJA, CLAUDE.md: iloczyn cech, nie przykład).
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

    # PROWENIENCJA Z OBU BIEGÓW, NIE Z MAKSYMALNEGO. Bieg MIN mógłby nieść
    # domyślkę systemową, podczas gdy MAX niesie samą deklarację — koordynacja
    # konsumuje OBA prądy, więc zastrzeżenie KTÓREGOKOLWIEK biegu jest
    # zastrzeżeniem całej koordynacji. Znaczniki są SUMOWANE, nie wybierane:
    # nie ma podstawy, dla której wkład DER miałby być miarodajny w jednym
    # scenariuszu i nieistotny w drugim.
    proweniencja_max = _proweniencja_biegu(bieg_max)
    proweniencja_min = _proweniencja_biegu(bieg_min)
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
        migawka=bieg_max.snapshot or {},
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
    wejscie: WejscieKoordynacjiZBiegow,
    prady_zadania: Iterable[Mapping[str, Any]],
    *,
    szyny_lokalizacji: Mapping[str, str] | None = None,
    odmowy_lokalizacji: Mapping[str, str] | None = None,
) -> tuple[str, ...]:
    """Czym prądy z żądania różnią się od prądów biegów. Pusto = to te same liczby.

    `szyny_lokalizacji` / `odmowy_lokalizacji` — wynik `szyny_zwarcia_lokalizacji`
    (decyzja O-51 pkt 7): lokalizacja-gałąź albo łącznik ma prąd zwarciowy SZYNY swojego
    zacisku, więc porównanie idzie z wierszem biegu tej szyny; lokalizacja z odmową
    resolvera nie ma czym potwierdzić podanej wartości (niezgodność z powodem)."""
    szyny = szyny_lokalizacji or {}
    odmowy = odmowy_lokalizacji or {}
    # WARTOŚCI ODRZUCONE IDĄ PIERWSZE. Wiersz, którego prąd nie jest liczbą, nie
    # może zostać „potwierdzony" żadną wartością z żądania — a bez tej pozycji
    # jego brak w mapie wyglądałby jak brak lokalizacji w biegu, czyli inna
    # przyczyna i mylący komunikat.
    roznice: list[str] = list(wejscie.wartosci_odrzucone)
    for pozycja in prady_zadania:
        lokalizacja = str(pozycja.get("location_id") or "")
        if lokalizacja in odmowy:
            roznice.append(f"{lokalizacja}: brak szyny zwarcia lokalizacji — {odmowy[lokalizacja]}")
            continue
        szyna = szyny.get(lokalizacja, lokalizacja)
        opis_punktu = lokalizacja if szyna == lokalizacja else f"{lokalizacja} (szyna {szyna})"
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
            z_biegu = mapa.get(szyna)
            if z_biegu is None:
                roznice.append(
                    f"{opis_punktu}: bieg {opis} nie zawiera prądu zwarciowego dla tej "
                    "lokalizacji — nie ma czym potwierdzić podanej wartości"
                )
                continue
            odchylka = abs(float(podany) - z_biegu)
            if odchylka > TOLERANCJA_WZGLEDNA_PRADU * max(abs(z_biegu), 1.0):
                roznice.append(
                    f"{opis_punktu}.{klucz}: podano {float(podany):.6f} A, "
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
