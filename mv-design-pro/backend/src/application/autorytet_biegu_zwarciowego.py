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

from collections.abc import Mapping
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
        """
        if echo is None:
            return ()
        return self.wiazanie.niezgodnosci(wynik=_wielkosci_z_echa(echo, self.wielkosci))


def _wielkosci_z_echa(echo: Mapping[str, Any], wzorzec: Mapping[str, Any]) -> dict[str, Any]:
    """Przełóż echo konsumenta na pola odcisku, zachowując pola spoza echa.

    Konsument przysyła wielkości w kiloamperach i pod własnymi kluczami
    (``ikss_ka``, ``ip_ka``, ``ith_ka``); odcisk liczy się z pól solvera w
    amperach. Przeliczenie jest tutaj, w warstwie aplikacji, bo jest mapowaniem
    kontraktu — nie fizyką.
    """
    przeliczone = dict(wzorzec)
    for klucz_echa, klucz_pola, mnoznik in (
        ("ikss_ka", "ikss_a", 1000.0),
        ("ip_ka", "ip_a", 1000.0),
        ("ith_ka", "ith_a", 1000.0),
        ("tk_s", "tk_s", 1.0),
    ):
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


def wejscie_zwarciowe_z_biegu(*, run_id: str, punkt_zwarcia: str) -> WejscieZwarcioweZBiegu:
    """Miarodajne wejście zwarciowe wyprowadzone z ZAPISANEGO biegu.

    Podnosi ``BiegNiemiarodajnyError`` przy każdym stanie, w którym liczb nie da
    się uczciwie wskazać. Nie zwraca „pustego wejścia": brak biegu to odmowa.
    """
    from enm.canonical_analysis import get_run

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
