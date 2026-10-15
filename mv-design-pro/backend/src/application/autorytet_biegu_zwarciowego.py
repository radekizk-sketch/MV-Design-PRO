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

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from application.analyses.opis_przebiegu import rodzaj_przebiegu_pl, stan_przebiegu_pl
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
            "Wskazany identyfikator nie jest identyfikatorem zapisanego biegu obliczeń. "
            "Dowód powstaje z zapisanego biegu, więc bieg musi istnieć.",
        ) from exc

    bieg = get_run(identyfikator)
    if bieg is None:
        raise BiegNiemiarodajnyError(
            "BIEG_NIE_ISTNIEJE",
            "Wskazany bieg obliczeń nie istnieje. Dowód nie może powstać z biegu, którego "
            "nie ma — przelicz zwarcie i wskaż wykonany bieg.",
        )
    if bieg.analysis_type not in RODZAJE_BIEGU_ZWARCIOWEGO:
        raise BiegNiemiarodajnyError(
            "BIEG_INNEGO_RODZAJU",
            f"Wskazany bieg to {rodzaj_przebiegu_pl(bieg.analysis_type)} i nie niesie "
            "wielkości zwarciowych. Wskaż bieg zwarciowy.",
        )
    if bieg.status != "FINISHED":
        raise BiegNiemiarodajnyError(
            "BIEG_NIEZAKONCZONY",
            f"Wskazany bieg jest w stanie: {stan_przebiegu_pl(bieg.status)}. Wielkości "
            "niezakończonego biegu nie są wynikiem — poczekaj na zakończenie albo przelicz "
            "ponownie.",
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
        liczba_punktow = sum(1 for w in (artefakt.get("results") or []) if isinstance(w, Mapping))
        raise BiegNiemiarodajnyError(
            "PUNKT_ZWARCIA_SPOZA_BIEGU",
            "Wskazany bieg nie zawiera wybranego punktu zwarcia (policzonych punktów w "
            f"biegu: {liczba_punktow}) — przelicz zwarcie obejmujące ten punkt.",
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
    """Dwa ZAPISANE biegi koordynacji (maksymalny i minimalny) po kontroli autorytetu.

    Koordynacja potrzebuje DWÓCH scenariuszy: maksymalnego (selektywność) i minimalnego
    (czułość). Kanoniczny bieg liczy JEDEN scenariusz, więc miarodajna koordynacja wymaga
    dwóch biegów — i obu trzeba dowieść. Prądy przekaźników liczy jedna ścieżka oceny
    zabezpieczeń z rozpływu tych biegów (`ocena_nadpradowa`), nie ten moduł.
    """

    proweniencja: ProweniencjaWynikuZwarciowego
    bieg_max: Any
    bieg_min: Any


def _scenariusz_biegu(bieg: Any, opis: str) -> str:
    """``MAX`` albo ``MIN`` — z artefaktu biegu (``raw_result["scenario"]``), nie z domysłu.

    Bieg bez zapisanego scenariusza nie może być wskazany jako maksymalny ani minimalny:
    odmowa nazwana (dawna wartość zastępcza „MAX" czyniła z niego bieg maksymalny)."""
    scenariusz = (bieg.raw_result or {}).get("scenario")
    if not isinstance(scenariusz, str) or not scenariusz:
        raise BiegNiemiarodajnyError(
            "SCENARIUSZ_BIEGU_NIEUSTALONY",
            f"Bieg wskazany jako {opis} nie ma zapisanego scenariusza zwarciowego (MAX albo "
            "MIN) — przelicz bieg zwarciowy na bieżącym modelu.",
        )
    return scenariusz.upper()


def wejscie_koordynacji_z_biegow(
    *, run_id_max: str | None, run_id_min: str | None
) -> WejscieKoordynacjiZBiegow:
    """Biegi koordynacji: MAKSYMALNY i MINIMALNY — obu wymaganych — z proweniencją obu.

    KONTROLE, KAŻDA Z WŁASNĄ PRZYCZYNĄ:
    - oba biegi istnieją, są zwarciowe i zakończone (`bieg_zwarciowy_miarodajny`),
    - każdy bieg ma zapisany scenariusz (brak = odmowa, nigdy domyślne „MAX"),
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
        rzeczywisty = _scenariusz_biegu(bieg, opis)
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
        proweniencja=proweniencja_obu, bieg_max=bieg_max, bieg_min=bieg_min
    )
