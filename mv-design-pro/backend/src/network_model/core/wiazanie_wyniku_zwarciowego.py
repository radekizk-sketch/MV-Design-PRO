"""Wiązanie wyniku zwarciowego z biegiem, który go policzył — odporność na podmianę.

DLACZEGO TEN MODUŁ ISTNIEJE (audyt niezależny, plan naprawy §3). Poprzednia
remediacja związała AUTORYTET z proweniencją MODELU: bramka pytała, czy źródła
falownikowe mają zadeklarowane ``k_sc``. Nie pytała o rzecz najważniejszą —
czy LICZBY, których konsument zamierza użyć, pochodzą z tego modelu.

ODTWORZONE NA HEAD (pomiar, nie hipoteza)::

    POST /api/equipment-proof/pack
      snapshot            = poprawny model bez źródeł falownikowych
      run_id              = "BIEG-KTORY-NIGDY-NIE-ISTNIAL"
      required_fault_results.ik3p_ka = 12,5  -> HTTP 200, pakiet 23 103 B
      required_fault_results.ik3p_ka = 999,0 -> HTTP 200, pakiet 23 158 B

Obie liczby — zmyślona i absurdalna — dawały kompletny pakiet dowodowy doboru
aparatury. Model był miarodajny; liczby nie miały z nim nic wspólnego.

CO WIĄZANIE ROBI. Łączy w JEDNĄ tożsamość sześć wielkości, które muszą opisywać
ten sam rachunek: identyfikator biegu, identyfikator migawki modelu, punkt
zwarcia, odcisk pełnej migawki wejścia, odcisk liczb wyniku i odcisk
implementacji solvera. Pieczęć jest funkcją skrótu po wszystkich sześciu, więc
zmiana KTÓREJKOLWIEK z nich daje inną pieczęć.

CZEGO WIĄZANIE NIE ROBI — I TO JEST WAŻNIEJSZE OD TEGO, CO ROBI. Pieczęć NIE
JEST podpisem kryptograficznym: nie ma klucza tajnego, więc ktoś, kto zna dane,
policzy ją sam. Wiązanie wykrywa PODMIANĘ WYNIKU (liczby inne niż policzone,
bieg inny niż wskazany, model inny niż ten, z którego liczby wyszły, kod inny
niż ten, który je policzył) — nie wykrywa PREPAROWANIA CAŁEGO BIEGU przez
kogoś, kto ma dostęp do zapisu biegów. Obietnica odporności na przeciwnika z
dostępem do magazynu byłaby obietnicą, której ten mechanizm nie dotrzymuje.

DLACZEGO ODCISK IMPLEMENTACJI. Ta sama sieć i ten sam punkt zwarcia dadzą inne
liczby po poprawce w solverze. Bez odcisku kodu wynik da się przypisać do
implementacji, która go NIE policzyła — dokładnie ta sama klasa defektu, którą
w laboratorium dynamicznym zamyka ``dynamic_lab.tozsamosc.odcisk_implementacji``.
"""

from __future__ import annotations

import hashlib
import json
import math
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

#: Wielkości wyniku zwarciowego, które wchodzą do odcisku. Lista jest ZAMKNIĘTA
#: i jawna: odcisk liczony z „czegokolwiek, co przyszło" zmieniałby się przy
#: każdym dodaniu pola metadanych i przestałby cokolwiek znaczyć.
POLA_WYNIKU_ZWARCIOWEGO: tuple[str, ...] = (
    "fault_node_id",
    "short_circuit_type",
    "c_factor",
    "un_v",
    "ikss_a",
    "ip_a",
    "ith_a",
    "tk_s",
    "kappa",
    "rx_ratio",
)

#: Moduły, których treść składa się na odcisk implementacji solvera zwarciowego.
#: Ścieżki są WZGLĘDNE wobec katalogu `src` i wypisane jawnie — odcisk liczony z
#: całego drzewa zmieniałby się przy każdej edycji dowolnego pliku i przestałby
#: wskazywać na kod, który liczył zwarcie.
MODULY_IMPLEMENTACJI_ZWARCIOWEJ: tuple[str, ...] = (
    "network_model/solvers/short_circuit_iec60909.py",
    "network_model/core/wklad_zwarciowy_przeksztaltnika.py",
    "network_model/core/inverter.py",
)


class NiepelneWiazanieError(ValueError):
    """Wiązanie budowane z danych, które nie wystarczają do identyfikacji biegu."""


def _kanonicznie(wartosc: Any) -> Any:
    """Postać kanoniczna wartości do skrótu — deterministyczna i bez zgadywania.

    ``float`` idzie przez ``repr``, a nie przez formatowanie o ustalonej liczbie
    miejsc: skrót ma odróżniać liczby RÓŻNE, a zaokrąglenie do np. sześciu cyfr
    zrównałoby 12,3456789 kA z 12,3456791 kA — czyli przepuściłoby podmianę.
    ``NaN`` i ``±Inf`` nie mają postaci kanonicznej jako WYNIK (to nie jest
    liczba, którą wolno czymkolwiek uzasadnić), więc są odrzucane głośno.
    """
    if isinstance(wartosc, bool):
        return wartosc
    if isinstance(wartosc, float):
        if not math.isfinite(wartosc):
            raise NiepelneWiazanieError(
                f"Wielkość wyniku zwarciowego nie jest liczbą skończoną ({wartosc!r}). "
                "Wynik z NaN/Inf nie może być podstawą decyzji ani przedmiotem wiązania."
            )
        return repr(float(wartosc))
    if isinstance(wartosc, Mapping):
        return {
            str(k): _kanonicznie(v) for k, v in sorted(wartosc.items(), key=lambda p: str(p[0]))
        }
    if isinstance(wartosc, list | tuple):
        return [_kanonicznie(v) for v in wartosc]
    return wartosc


def odcisk_danych(dane: Any) -> str:
    """SHA-256 kanonicznej postaci danych. Ta sama treść → ten sam odcisk."""
    tresc = json.dumps(
        _kanonicznie(dane), sort_keys=True, ensure_ascii=False, separators=(",", ":")
    )
    return hashlib.sha256(tresc.encode("utf-8")).hexdigest()


def wielkosci_do_odcisku(wynik: Mapping[str, Any]) -> dict[str, Any]:
    """Podzbiór wyniku wchodzący do odcisku — WYŁĄCZNIE pola z listy zamkniętej.

    Brak pola nie jest uzupełniany zerem ani pomijany po cichu: wchodzi jako
    ``None``, więc wynik niekompletny ma INNY odcisk niż kompletny. Ciche
    pominięcie zrównałoby „nie policzono I_th" z „policzono I_th = 0".
    """
    return {pole: wynik.get(pole) for pole in POLA_WYNIKU_ZWARCIOWEGO}


_KATALOG_ZRODEL = Path(__file__).resolve().parents[2]
_odcisk_implementacji_cache: str | None = None


def odcisk_implementacji_zwarciowej() -> str:
    """Odcisk KODU, który liczy zwarcie — treść modułów z listy jawnej.

    Liczony RAZ na proces: pliki źródłowe nie zmieniają się w trakcie biegu, a
    czytanie ich przy każdym wyniku zamieniłoby odcisk w koszt wejścia/wyjścia
    proporcjonalny do liczby rachunków.
    """
    global _odcisk_implementacji_cache
    if _odcisk_implementacji_cache is None:
        tresci: dict[str, str] = {}
        for wzgledna in MODULY_IMPLEMENTACJI_ZWARCIOWEJ:
            sciezka = _KATALOG_ZRODEL / wzgledna
            tresci[wzgledna] = hashlib.sha256(sciezka.read_bytes()).hexdigest()
        _odcisk_implementacji_cache = odcisk_danych(tresci)
    return _odcisk_implementacji_cache


@dataclass(frozen=True)
class WiazanieWynikuZwarciowego:
    """Tożsamość rachunku zwarciowego: bieg + model + punkt + liczby + kod."""

    run_id: str
    snapshot_id: str
    punkt_zwarcia: str
    odcisk_wejscia: str
    odcisk_wyniku: str
    odcisk_implementacji: str

    def __post_init__(self) -> None:
        puste = [
            nazwa
            for nazwa, wartosc in (
                ("run_id", self.run_id),
                ("snapshot_id", self.snapshot_id),
                ("punkt_zwarcia", self.punkt_zwarcia),
                ("odcisk_wejscia", self.odcisk_wejscia),
                ("odcisk_wyniku", self.odcisk_wyniku),
                ("odcisk_implementacji", self.odcisk_implementacji),
            )
            if not str(wartosc).strip()
        ]
        if puste:
            raise NiepelneWiazanieError(
                f"Wiązanie wyniku zwarciowego bez pól: {', '.join(puste)}. "
                "Wiązanie niepełne nie identyfikuje rachunku, więc nie wolno go "
                "zbudować — brak wiązania jest uczciwszy niż wiązanie częściowe."
            )

    @classmethod
    def z_biegu(
        cls,
        *,
        run_id: str,
        snapshot_id: str,
        punkt_zwarcia: str,
        migawka_wejscia: Mapping[str, Any],
        wynik: Mapping[str, Any],
    ) -> WiazanieWynikuZwarciowego:
        """Wiązanie policzone z DANYCH biegu — jedyna droga jego powstania."""
        return cls(
            run_id=str(run_id),
            snapshot_id=str(snapshot_id),
            punkt_zwarcia=str(punkt_zwarcia),
            odcisk_wejscia=odcisk_danych(migawka_wejscia),
            odcisk_wyniku=odcisk_danych(wielkosci_do_odcisku(wynik)),
            odcisk_implementacji=odcisk_implementacji_zwarciowej(),
        )

    @property
    def pieczec(self) -> str:
        """SHA-256 po WSZYSTKICH polach wiązania."""
        return odcisk_danych(self.to_dict())

    def to_dict(self) -> dict[str, str]:
        return {
            "run_id": self.run_id,
            "snapshot_id": self.snapshot_id,
            "punkt_zwarcia": self.punkt_zwarcia,
            "odcisk_wejscia": self.odcisk_wejscia,
            "odcisk_wyniku": self.odcisk_wyniku,
            "odcisk_implementacji": self.odcisk_implementacji,
        }

    def niezgodnosci(
        self,
        *,
        run_id: str | None = None,
        snapshot_id: str | None = None,
        punkt_zwarcia: str | None = None,
        wynik: Mapping[str, Any] | None = None,
        migawka_wejscia: Mapping[str, Any] | None = None,
    ) -> tuple[str, ...]:
        """Czym przedłożone dane RÓŻNIĄ SIĘ od wiązania. Pusto = to ten sam rachunek.

        Argument pominięty (``None``) NIE jest sprawdzany — konsument deklaruje,
        co przedkłada. Sprawdzenie pola, którego nikt nie podał, byłoby
        porównaniem z domyślką, czyli zgadywaniem.
        """
        roznice: list[str] = []
        if run_id is not None and str(run_id) != self.run_id:
            roznice.append(f"run_id: przedłożono {run_id!r}, wiązanie niesie {self.run_id!r}")
        if snapshot_id is not None and str(snapshot_id) != self.snapshot_id:
            roznice.append(
                f"snapshot_id: przedłożono {snapshot_id!r}, wiązanie niesie {self.snapshot_id!r}"
            )
        if punkt_zwarcia is not None and str(punkt_zwarcia) != self.punkt_zwarcia:
            roznice.append(
                f"punkt zwarcia: przedłożono {punkt_zwarcia!r}, "
                f"wiązanie niesie {self.punkt_zwarcia!r}"
            )
        if wynik is not None:
            odcisk = odcisk_danych(wielkosci_do_odcisku(wynik))
            if odcisk != self.odcisk_wyniku:
                roznice.append(
                    f"liczby wyniku: odcisk przedłożonych {odcisk[:16]}…, "
                    f"wiązanie niesie {self.odcisk_wyniku[:16]}…"
                )
        if migawka_wejscia is not None:
            odcisk = odcisk_danych(migawka_wejscia)
            if odcisk != self.odcisk_wejscia:
                roznice.append(
                    f"migawka wejścia: odcisk przedłożonej {odcisk[:16]}…, "
                    f"wiązanie niesie {self.odcisk_wejscia[:16]}…"
                )
        if odcisk_implementacji_zwarciowej() != self.odcisk_implementacji:
            roznice.append(
                f"odcisk implementacji: bieżący kod {odcisk_implementacji_zwarciowej()[:16]}…, "
                f"wiązanie niesie {self.odcisk_implementacji[:16]}…"
            )
        return tuple(roznice)


def wiazanie_z_zapisu(zapis: Mapping[str, Any] | None) -> WiazanieWynikuZwarciowego | None:
    """Odtwórz wiązanie z zapisu (JSON w artefakcie biegu). ``None`` przy braku.

    Zapis niekompletny daje ``None``, a nie wiązanie częściowe: „nie wiem, z
    czego to jest" musi zostać brakiem, bo wiązanie częściowe przeszłoby część
    porównań i wyglądałoby na dowód.
    """
    if not zapis:
        return None
    try:
        return WiazanieWynikuZwarciowego(
            run_id=str(zapis["run_id"]),
            snapshot_id=str(zapis["snapshot_id"]),
            punkt_zwarcia=str(zapis["punkt_zwarcia"]),
            odcisk_wejscia=str(zapis["odcisk_wejscia"]),
            odcisk_wyniku=str(zapis["odcisk_wyniku"]),
            odcisk_implementacji=str(zapis["odcisk_implementacji"]),
        )
    except (KeyError, NiepelneWiazanieError):
        return None


def _wszystkie_pola_obecne(zapisy: Iterable[Mapping[str, Any]]) -> bool:
    """Pomocnicze dla konsumentów, którzy walidują partie zapisów naraz."""
    return all(wiazanie_z_zapisu(z) is not None for z in zapisy)
