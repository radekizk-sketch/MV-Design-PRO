"""KOPIA GRANICZNA ENM — jedna implementacja pojęcia z kontraktu TOPO-COPY.

KONTEKST. Kontrakt mutacji warstwy topologicznej (`enm/topology_ops.py`, V12K-323)
mówi wprost: „Kopiowanie NIE jest odpowiedzialnością tej warstwy — należy do
GRANICY OPERACJI DOMENOWEJ, która i tak robi własną prywatną kopię na wejściu".
Ta granica była dotąd rozsiana po 50 miejscach jako gołe `copy.deepcopy(enm)` —
pojęcie istniało w kontrakcie, ale nie miało JEDNEJ implementacji. Ten moduł ją
daje: wszystkie granice wołają `kopia_graniczna_enm`, więc każda przyszła decyzja
o sposobie kopiowania ma jedno miejsce zamiany.

DLACZEGO NIE `copy.deepcopy` (karta S9-9, pomiar). Model ENM jest DOKUMENTEM
JSON — słowniki, listy i wartości proste — a `copy.deepcopy` płaci za ogólność,
której ten dokument nie potrzebuje: dyspozycję po `__reduce_ex__`, notes `memo`
indeksowany `id()` i listę `_keep_alive`. Zmierzone na realnym modelu:

    stacje   copy.deepcopy   kopia_graniczna_enm
       10        8,5 ms            2,8 ms
       50       21,2 ms            7,6 ms
      100       39,2 ms           15,1 ms

Kopia to 30 % kosztu `POST /station-templates/{id}/apply` na sieci 100 stacji,
a operacja domenowa woła ją raz na wejściu (łańcuch szablonu — kilka razy).

RÓWNOWAŻNOŚĆ. Wynik jest RÓWNY (`==`) wynikowi `copy.deepcopy` i tak samo
NIEZALEŻNY od oryginału: żaden słownik ani lista nie są współdzielone, więc
mutacja kopii nie sięga wejścia (i odwrotnie). Wartości proste (`str`, `int`,
`float`, `bool`, `None`) są niezmienne, więc ich współdzielenie jest nieodróżnialne
od kopiowania — tak samo robi `copy.deepcopy` (`_deepcopy_atomic`). Cokolwiek
innego (np. `datetime` w modelu przed serializacją) idzie przez `copy.deepcopy`,
więc zachowanie brzegowe jest zachowane, nie zgadywane.

JEDNA RÓŻNICA, NAZWANA WPROST: `copy.deepcopy` zachowuje WSPÓŁDZIELENIE — dwa
odwołania do tego samego podsłownika dają w kopii jeden wspólny obiekt. Tutaj
dostają dwa osobne. Dla dokumentu ENM jest to bez znaczenia dla RÓWNOŚCI (a ta
jest przypięta testem), a pod względem izolacji jest ostrzejsze, nie słabsze:
mutacja przez jedno odwołanie nie może wyciec przez drugie.

ZAŁOŻENIE (spełnione z konstrukcji): dokument jest ACYKLICZNY. ENM powstaje z
`model_dump(mode="json")` albo z `json.loads`, a `compute_enm_hash` serializuje
go do JSON — cykl wywróciłby system wcześniej i głośniej niż tutaj. Rekurencji
nie ograniczamy sztucznie, żeby nie udawać obsługi przypadku, który jest
niemożliwy w tym kontrakcie.

Pin równoważności i izolacji: `tests/enm/test_kopia_graniczna.py`.
"""

from __future__ import annotations

import copy
from typing import Any, cast

_WARTOSCI_PROSTE = (str, int, float, bool, type(None))


def kopia_graniczna_enm(enm: dict[str, Any]) -> dict[str, Any]:
    """Prywatna kopia dokumentu ENM na granicy operacji domenowej.

    Równoważna `copy.deepcopy(enm)` pod względem równości i izolacji (patrz
    nagłówek modułu), tańsza dla struktur JSON-owych.
    """
    return {klucz: _kopia_wartosci(wartosc) for klucz, wartosc in enm.items()}


def _kopia_wartosci(wartosc: object) -> object:
    """Kopia POJEDYNCZEJ wartości dokumentu — rekurencja po słownikach i listach.

    Typ `object`, nie `Any`: wartość dokumentu JSON może być czymkolwiek, ale
    NIC w tej funkcji nie zakłada o niej niczego ponad klasę — a `Any` wyłączałoby
    sprawdzanie typów u wołających (zapadka `test_no_any_in_domain_types`).
    """
    klasa = wartosc.__class__
    if klasa is dict:
        return {
            klucz: _kopia_wartosci(pod) for klucz, pod in cast("dict[str, object]", wartosc).items()
        }
    if klasa is list:
        return [_kopia_wartosci(element) for element in cast("list[object]", wartosc)]
    if klasa in _WARTOSCI_PROSTE:
        return wartosc
    # Typ spoza dokumentu JSON (np. `datetime`, `Decimal`, podklasa `dict`/`list`)
    # — oddajemy pole ogólnej maszynerii zamiast zgadywać jej semantykę.
    return copy.deepcopy(wartosc)
