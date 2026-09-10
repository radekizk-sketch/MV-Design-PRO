"""Kandydat kontraktu wyniku dynamicznego: szereg czasowy + tożsamość + diagnostyka.

KOD BADAWCZY — patrz `backend/research/README.md`.
**KANDYDAT, NIE KANON.** Nie zastępuje ``ResultSetV1`` bez akceptacji właściciela.

Dlaczego istniejący kontrakt nie wystarcza (audyt §25):
- ``resultset_v1_schema.json`` jest z założenia MIGAWKOWY — nie ma osi czasu,
  tablicy próbek ani ``dt``;
- kontrakty dynamiczne w produkcji są trzy, równoległe i niekanoniczne;
- brakuje ``f(t)``, ``Efd(t)``, ``Pm(t)``, ``SOC(t)``; ``P(t)``/``Q(t)`` są
  zadeklarowane, ale nigdy nie wypełniane;
- dwa z trzech wyników nie mają ŻADNEGO odcisku i nie wiążą się z migawką sieci.

Zasada projektowa tego kandydata: **wynik musi dać się odtworzyć i obalić.**
Dlatego niesie nie tylko przebiegi, ale tożsamość modelu, scenariusza i migawki,
tolerancje numeryczne oraz stan zbieżności — bez tego nie da się orzec, czy dwa
różne wyniki to różnica fizyki, czy różnica nastaw solvera.

Przydatność dowodowa NIE jest polem tego kontraktu — decyduje o niej rejestr
``solver_input.provenance`` po stronie produkcji. Wynik laboratorium jest z
definicji ``UNVALIDATED_MODEL``.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from typing import Any

KONTRAKT = "DynamicResultSetKandydatV1"


@dataclass(frozen=True)
class Sygnal:
    """Pojedynczy przebieg czasowy z jawną jednostką i przypisaniem."""

    klucz: str
    etykieta_pl: str
    jednostka: str
    element_ref: str | None
    wartosci: tuple[float, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "klucz": self.klucz,
            "etykieta_pl": self.etykieta_pl,
            "jednostka": self.jednostka,
            "element_ref": self.element_ref,
            "wartosci": list(self.wartosci),
        }


@dataclass(frozen=True)
class TozsamoscModelu:
    """Kto liczył — model, jego wersja i zestaw parametrów.

    ``odcisk_parametrow`` pozwala wykryć, że „ten sam" model policzył co innego,
    bo zmieniono parametr. Bez tego porównanie dwóch biegów jest bez wartości.
    """

    element_ref: str
    klasa_modelu: str
    liczba_stanow: int
    nazwy_stanow: tuple[str, ...]
    odcisk_parametrow: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "element_ref": self.element_ref,
            "klasa_modelu": self.klasa_modelu,
            "liczba_stanow": self.liczba_stanow,
            "nazwy_stanow": list(self.nazwy_stanow),
            "odcisk_parametrow": self.odcisk_parametrow,
        }


@dataclass(frozen=True)
class BladSolvera:
    """Forensyka niepowodzenia — dlaczego, kiedy i na czym symulacja padła.

    PO CO. Pierwsza wersja tego laboratorium redukowała KAŻDE niepowodzenie do
    jednego ``zbiegl = False``. Pod tym Booleanem chowały się cztery zupełnie
    różne zdarzenia, wymagające czterech różnych reakcji inżyniera:

      - Newton integratora się rozjechał  -> zmniejsz krok albo zmień metodę,
      - macierz sieci osobliwa            -> wyspa bez źródła / błąd topologii,
      - model zwrócił NaN/Inf             -> błąd równań urządzenia,
      - przekroczono limit iteracji sieci -> zaostrz/poluzuj tolerancję.

    Wynik, z którego nie da się odczytać, KTÓRE z nich zaszło, nie nadaje się
    ani na ślad White Box, ani na materiał dowodowy — a to jest deklarowany cel
    kandydata kontraktu. Ten typ jest odpowiedzią na tę lukę.
    """

    klasa: str
    """Nazwa klasy wyjątku, np. ``BrakZbieznosciSieciError``."""
    komunikat: str
    faza: str
    """Gdzie padło: ``"algebra_sieci"``, ``"calkowanie"`` albo ``"probkowanie"``."""
    czas_s: float
    """Chwila symulacji, w której nastąpiło niepowodzenie."""
    krok_s: float
    """Długość kroku, na którym padło (może być krótsza od nominalnej)."""
    numer_kroku: int
    residuum_sieci: float
    """Największe residuum algebraiczne zaobserwowane do tej chwili."""
    stan_skonczony: bool
    """Czy wektor stanu był skończony tuż przed niepowodzeniem (NaN/Inf = False)."""
    stany_niesksonczone: tuple[str, ...] = ()
    """Nazwy stanów (``urzadzenie.stan``), które przestały być skończone."""
    szyny_niesksonczone: tuple[str, ...] = ()
    """Szyny, których napięcie przestało być skończone."""

    def to_dict(self) -> dict[str, Any]:
        return {
            "klasa": self.klasa,
            "komunikat": self.komunikat,
            "faza": self.faza,
            "czas_s": self.czas_s,
            "krok_s": self.krok_s,
            "numer_kroku": self.numer_kroku,
            "residuum_sieci": self.residuum_sieci,
            "stan_skonczony": self.stan_skonczony,
            "stany_niesksonczone": list(self.stany_niesksonczone),
            "szyny_niesksonczone": list(self.szyny_niesksonczone),
        }


@dataclass(frozen=True)
class DiagnostykaSolvera:
    """Czy wynikowi wolno ufać od strony NUMERYCZNEJ (to nie to samo co fizycznie)."""

    integrator: str
    krok_s: float
    liczba_krokow: int
    ewaluacje_pochodnych: int
    maks_residuum_sieci: float
    maks_iteracji_sieci: int
    zbiegl: bool
    norma_pochodnej_w_t0: float
    """``||f(x0, y0)||`` — dowód (lub jego brak), że start jest w równowadze."""
    blad: BladSolvera | None = None
    """Wypełnione DOKŁADNIE wtedy, gdy ``zbiegl`` jest ``False``."""
    czas_osiagniety_s: float = 0.0
    """Do której chwili symulacja realnie doszła (przy błędzie < żądany koniec)."""
    kroki_skrocone: int = 0
    """Ile kroków zostało skróconych, żeby trafić dokładnie w zdarzenie/koniec."""

    def __post_init__(self) -> None:
        if self.zbiegl and self.blad is not None:
            raise ValueError("Wynik zbieżny nie może nieść opisu błędu")
        if not self.zbiegl and self.blad is None:
            raise ValueError(
                "Wynik niezbieżny MUSI nieść opis błędu — sam `zbiegl=False` "
                "nie pozwala odróżnić rozjechanego Newtona od osobliwej sieci."
            )

    def to_dict(self) -> dict[str, Any]:
        return {
            "integrator": self.integrator,
            "krok_s": self.krok_s,
            "liczba_krokow": self.liczba_krokow,
            "ewaluacje_pochodnych": self.ewaluacje_pochodnych,
            "maks_residuum_sieci": self.maks_residuum_sieci,
            "maks_iteracji_sieci": self.maks_iteracji_sieci,
            "zbiegl": self.zbiegl,
            "norma_pochodnej_w_t0": self.norma_pochodnej_w_t0,
            "blad": self.blad.to_dict() if self.blad is not None else None,
            "czas_osiagniety_s": self.czas_osiagniety_s,
            "kroki_skrocone": self.kroki_skrocone,
        }


@dataclass(frozen=True)
class WynikDynamiczny:
    """Kandydat wyniku symulacji dynamicznej."""

    kontrakt: str
    czas_s: tuple[float, ...]
    sygnaly: tuple[Sygnal, ...]
    modele: tuple[TozsamoscModelu, ...]
    zdarzenia: tuple[dict[str, Any], ...]
    diagnostyka: DiagnostykaSolvera
    odcisk_scenariusza: str
    odcisk_topologii: str
    uwaga_dowodowa_pl: str = (
        "Wynik z laboratorium badawczego. NIE jest dowodem regulacyjnym "
        "ani zwalidowaną symulacją fizyczną."
    )

    def sygnal(self, klucz: str, element_ref: str | None = None) -> Sygnal:
        """Pobierz przebieg po kluczu (i opcjonalnie elemencie)."""
        for s in self.sygnaly:
            if s.klucz == klucz and (element_ref is None or s.element_ref == element_ref):
                return s
        dostepne = sorted({f"{s.klucz}@{s.element_ref}" for s in self.sygnaly})
        raise KeyError(f"Brak sygnału {klucz}@{element_ref}. Dostępne: {dostepne}")

    def to_dict(self) -> dict[str, Any]:
        return {
            "kontrakt": self.kontrakt,
            "czas_s": list(self.czas_s),
            "sygnaly": [s.to_dict() for s in self.sygnaly],
            "modele": [m.to_dict() for m in self.modele],
            "zdarzenia": list(self.zdarzenia),
            "diagnostyka": self.diagnostyka.to_dict(),
            "odcisk_scenariusza": self.odcisk_scenariusza,
            "odcisk_topologii": self.odcisk_topologii,
            "uwaga_dowodowa_pl": self.uwaga_dowodowa_pl,
        }

    def odcisk_wyniku(self) -> str:
        """SHA-256 kanonicznej postaci — powtarzalność biegu."""
        return odcisk(self.to_dict())


def odcisk(payload: Any) -> str:
    """Deterministyczny SHA-256 z kanonicznego JSON."""
    tekst = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(tekst.encode("utf-8")).hexdigest()


@dataclass
class ZbieraczPrzebiegow:
    """Akumulator przebiegów w trakcie symulacji (kolejność deterministyczna)."""

    _dane: dict[tuple[str, str | None], list[float]] = field(default_factory=dict)
    _meta: dict[tuple[str, str | None], tuple[str, str]] = field(default_factory=dict)

    def dodaj(
        self,
        klucz: str,
        wartosc: float,
        *,
        element_ref: str | None = None,
        etykieta_pl: str = "",
        jednostka: str = "",
    ) -> None:
        k = (klucz, element_ref)
        if k not in self._dane:
            self._dane[k] = []
            self._meta[k] = (etykieta_pl or klucz, jednostka)
        self._dane[k].append(float(wartosc))

    def sygnaly(self) -> tuple[Sygnal, ...]:
        return tuple(
            Sygnal(
                klucz=klucz,
                etykieta_pl=self._meta[(klucz, ref)][0],
                jednostka=self._meta[(klucz, ref)][1],
                element_ref=ref,
                wartosci=tuple(wartosci),
            )
            for (klucz, ref), wartosci in sorted(
                self._dane.items(), key=lambda para: (para[0][0], para[0][1] or "")
            )
        )
