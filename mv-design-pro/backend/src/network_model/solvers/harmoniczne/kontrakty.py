"""Kontrakty dziedziny czestotliwosci — pasmo supraharmoniczne i blad kontraktu.

Program A/B, kamien AB-1d_min (wymaganie S-54, dokument
`docs/plan/PROGRAM_AB_DYNAMIKA_I_JAKOSC_ENERGII_2026-09.md` §5.3): ZERO FIZYKI.
Pakiet `network_model/solvers/harmoniczne/` powstaje przed rdzeniem
harmonicznym, zeby kontrakty wejscia biegow `harmoniczne`,
`skan_czestotliwosciowy` i `supraharmoniczne` mialy JEDNO miejsce, zanim
pojawi sie pierwszy solver (AB-2H). Pierwszym konsumentem jest walidacja opcji
tych biegow (`enm/biegi_czestotliwosciowe.py`), ktora konczy sie odmowa
nazwana — nigdy wartoscia domyslna.

`SupraharmonicBand` (S-54): definicja pasma NIE jest zaszyta w produkcie.
Kazde pole jest wymagane i nie ma wartosci domyslnej — w szczegolnosci
granice 2 kHz / 150 kHz NIE sa stalymi tego modulu: pasmo pochodzi z
dokumentu zrodlowego wskazanego w `source_document` (w wersji `version`),
a porownanie z limitem albo pomiarem wymaga tej samej metody pomiaru
(`measurement_method`, zastrzezenie S-67 p. 4: rodzaj detektora i grupowanie).
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

#: Kody odmow kontraktow dziedziny czestotliwosci — zbior ZAMKNIETY (pin w testach).
KOD_OS_NIEPOPRAWNA = "czestotliwosc.os_niepoprawna"
KOD_PASMO_NIEPOPRAWNE = "czestotliwosc.pasmo_niepoprawne"
KODY_KONTRAKTU_CZESTOTLIWOSCI: tuple[str, ...] = (
    KOD_OS_NIEPOPRAWNA,
    KOD_PASMO_NIEPOPRAWNE,
)


class KontraktCzestotliwosciError(ValueError):
    """Dane wejscia nie spelniaja kontraktu osi albo pasma — odmowa NAZWANA.

    Kontrakt nie poprawia danych po cichu (nie sortuje, nie usuwa duplikatow,
    nie uzupelnia brakow): dane niezgodne z kontraktem wracaja do wolajacego
    z kodem z `KODY_KONTRAKTU_CZESTOTLIWOSCI` i komunikatem PL.
    """

    def __init__(self, kod: str, komunikat: str) -> None:
        if kod not in KODY_KONTRAKTU_CZESTOTLIWOSCI:
            raise AssertionError(f"kod spoza zbioru kontraktu: {kod!r}")
        super().__init__(f"{komunikat} (kod: {kod})")
        self.kod = kod
        self.komunikat = komunikat


def liczba_dodatnia(wartosc: Any, *, pole: str, kod: str) -> float:
    """Skonczona liczba > 0 — wspolna walidacja pol czestotliwosci [Hz] (bez domyslnej)."""
    if isinstance(wartosc, bool) or not isinstance(wartosc, int | float):
        raise KontraktCzestotliwosciError(
            kod, f"Pole {pole!r} musi byc liczba [Hz], otrzymano {wartosc!r}"
        )
    liczba = float(wartosc)
    if not math.isfinite(liczba) or liczba <= 0.0:
        raise KontraktCzestotliwosciError(
            kod,
            f"Pole {pole!r} musi byc skonczona liczba dodatnia, otrzymano {wartosc!r}",
        )
    return liczba


def tekst_niepusty(wartosc: Any, *, pole: str, kod: str) -> str:
    """Niepusty napis (zrodlo, dokument, wersja, metoda) — bez domyslnej."""
    if not isinstance(wartosc, str) or not wartosc.strip():
        raise KontraktCzestotliwosciError(
            kod, f"Pole {pole!r} musi byc niepustym napisem, otrzymano {wartosc!r}"
        )
    return wartosc


#: Pola `SupraharmonicBand` — komplet wymagany (S-54), kolejnosc = kolejnosc kontraktu.
POLA_PASMA_SUPRAHARMONICZNEGO: tuple[str, ...] = (
    "f_min_hz",
    "f_max_hz",
    "frequency_resolution_hz",
    "aggregation_bandwidth_hz",
    "measurement_method",
    "source_document",
    "version",
)


@dataclass(frozen=True)
class SupraharmonicBand:
    """Pasmo supraharmoniczne z definicja zrodlowa (S-54) — wszystkie pola wymagane.

    - ``f_min_hz`` / ``f_max_hz`` — granice pasma [Hz], ``0 < f_min < f_max``;
    - ``frequency_resolution_hz`` — rozdzielczosc widma [Hz] (``<= f_max - f_min``);
    - ``aggregation_bandwidth_hz`` — szerokosc pasma grupowania [Hz]
      (``<= f_max - f_min``) — bez niej energia pasma z dwoch zrodel jest
      nieporownywalna;
    - ``measurement_method`` — metoda pomiaru / rodzaj detektora (S-67 p. 4);
    - ``source_document`` / ``version`` — dokument, z ktorego pochodzi definicja
      pasma, i jego wersja (zakaz jednej definicji bez zrodla).
    """

    f_min_hz: float
    f_max_hz: float
    frequency_resolution_hz: float
    aggregation_bandwidth_hz: float
    measurement_method: str
    source_document: str
    version: str

    def __post_init__(self) -> None:
        kod = KOD_PASMO_NIEPOPRAWNE
        f_min = liczba_dodatnia(self.f_min_hz, pole="f_min_hz", kod=kod)
        f_max = liczba_dodatnia(self.f_max_hz, pole="f_max_hz", kod=kod)
        if not f_min < f_max:
            raise KontraktCzestotliwosciError(
                kod, f"Pasmo wymaga f_min_hz < f_max_hz, otrzymano {f_min} >= {f_max}"
            )
        szerokosc = f_max - f_min
        for pole in ("frequency_resolution_hz", "aggregation_bandwidth_hz"):
            wartosc = liczba_dodatnia(getattr(self, pole), pole=pole, kod=kod)
            if wartosc > szerokosc:
                raise KontraktCzestotliwosciError(
                    kod,
                    f"Pole {pole!r} = {wartosc} Hz przekracza szerokosc pasma "
                    f"{szerokosc} Hz — pasmo nie zawiera ani jednego przedzialu",
                )
        for pole in ("measurement_method", "source_document", "version"):
            tekst_niepusty(getattr(self, pole), pole=pole, kod=kod)

    @classmethod
    def z_dict(cls, dane: Any) -> SupraharmonicBand:
        """Pasmo z ladunku JSON — komplet pol wymagany, pole nadmiarowe = odmowa."""
        if not isinstance(dane, dict):
            raise KontraktCzestotliwosciError(
                KOD_PASMO_NIEPOPRAWNE,
                f"Pasmo supraharmoniczne musi byc obiektem, otrzymano {dane!r}",
            )
        brakujace = [pole for pole in POLA_PASMA_SUPRAHARMONICZNEGO if pole not in dane]
        if brakujace:
            raise KontraktCzestotliwosciError(
                KOD_PASMO_NIEPOPRAWNE,
                "Pasmo supraharmoniczne bez wymaganych pol (brak wartosci domyslnych): "
                + ", ".join(brakujace),
            )
        nadmiarowe = sorted(set(dane) - set(POLA_PASMA_SUPRAHARMONICZNEGO))
        if nadmiarowe:
            raise KontraktCzestotliwosciError(
                KOD_PASMO_NIEPOPRAWNE,
                "Pasmo supraharmoniczne zawiera pola spoza kontraktu: " + ", ".join(nadmiarowe),
            )
        return cls(**{pole: dane[pole] for pole in POLA_PASMA_SUPRAHARMONICZNEGO})

    def to_dict(self) -> dict[str, Any]:
        return {pole: getattr(self, pole) for pole in POLA_PASMA_SUPRAHARMONICZNEGO}

    def opis_pl(self) -> str:
        """Opis pasma do komunikatu odmowy (granice, rozdzielczosc, zrodlo definicji)."""
        return (
            f"pasmo {self.f_min_hz:g}–{self.f_max_hz:g} Hz, rozdzielczość "
            f"{self.frequency_resolution_hz:g} Hz, grupowanie {self.aggregation_bandwidth_hz:g} Hz, "
            f"metoda pomiaru „{self.measurement_method}”, definicja: "
            f"{self.source_document} (wersja {self.version})"
        )


__all__ = [
    "KODY_KONTRAKTU_CZESTOTLIWOSCI",
    "KOD_OS_NIEPOPRAWNA",
    "KOD_PASMO_NIEPOPRAWNE",
    "POLA_PASMA_SUPRAHARMONICZNEGO",
    "KontraktCzestotliwosciError",
    "SupraharmonicBand",
    "liczba_dodatnia",
    "tekst_niepusty",
]
