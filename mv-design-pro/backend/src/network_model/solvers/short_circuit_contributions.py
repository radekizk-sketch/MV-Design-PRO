"""
Definicje udziałów zwarciowych (contributions) dla IEC 60909.

Próg wkładu pomijalnego (karta PROG-ZERA-WKLADOW, warunkowa zgoda B-01 właściciela
z 2026-10-21): wkład gałęziowy rozpływu prądu zwarciowego o module |I| < 1e-6 A NIE jest
publikowany na liście wkładów (`branch_contributions`) ani w krokach śladu podziału prądu
(`branch_flow_trace`). Taki wpis to „wkład pominięty na podstawie tolerancji numerycznej
(|I| < 1e-6 A)” — NIE zero: jego surowa wartość (3 cyfry znaczące) i kąt fazora trafiają do
zestawienia `wklady_pominiete` wyniku, a bilans pominiętych (liczba, suma modułów, suma
fazorowa per tor źródła) do kroku śladu `wklady_pominiete`. Próg i predykat mają JEDNĄ
definicję — tę niżej; rdzeń IEC 60909 (oba tory: superpozycja falownikowa i rozpływ
Thevenina) i warstwy nad nim czytają ją stąd.
"""

from __future__ import annotations

import cmath
import math
from dataclasses import dataclass
from decimal import ROUND_DOWN, Decimal
from enum import Enum

#: Próg numerycznie pomijalnego wkładu gałęziowego rozpływu prądu zwarciowego, w AMPERACH
#: (1e-6 A = 1 µA = 1e-9 kA). Wkład o |I| < PROG_WKLADU_POMIJALNEGO_A [A] jest „wkładem
#: pominiętym na podstawie tolerancji numerycznej (|I| < 1e-6 A)”. JEDYNA definicja progu
#: w repozytorium (decyzja B-01 właściciela z 2026-10-21, karta PROG-ZERA-WKLADOW): rdzeń
#: IEC 60909 stosuje ją w obu torach wkładów gałęziowych, warstwa prezentacji dostaje jej
#: odbicie w odpowiedzi API rozpływu (`prog_wkladu_pominietego_a`). Powód: gałąź bez
#: fizycznego przepływu daje resztę arytmetyki zmiennoprzecinkowej (pomiar korpusu goldenów:
#: szum do 2,5e-8 A, współczynnik podziału ≤ 1e-13), która przy dawnym predykacie `<= 0`
#: trafiała na listę na jednej maszynie, a na drugiej nie.
PROG_WKLADU_POMIJALNEGO_A: float = 1e-6

#: Liczba cyfr znaczących surowej wartości |I| i kąta fazora w zestawieniu wkładów
#: pominiętych (zapis deterministyczny: bity poniżej trzeciej cyfry nie wchodzą do wyniku).
CYFRY_ZNACZACE_WKLADU_POMINIETEGO: int = 3

#: Tory źródła wkładu gałęziowego (pole `tor` wpisu zestawienia i klucze bilansu w śladzie).
TOR_THEVENIN: str = "thevenin"
TOR_FALOWNIK: str = "falownik"


def jest_wkladem_pominietym(prad_a: float) -> bool:
    """Czy wkład gałęziowy o prądzie ``prad_a`` [A] jest pominięty (|I| < 1e-6 A).

    JEDYNY predykat klasyfikacji wkładu gałęziowego: ``abs(I) < PROG_WKLADU_POMIJALNEGO_A``
    (ostra nierówność — wkład dokładnie na progu jest publikowany). Prąd nieokreślony (NaN)
    nie jest pomijany: porównanie z NaN daje fałsz, więc wpis zostaje widoczny, a nie
    znika jako „pomijalny".
    """
    return abs(prad_a) < PROG_WKLADU_POMIJALNEGO_A


def zaokraglij_cyfry_znaczace(wartosc: float) -> float:
    """``wartosc`` zaokrąglona W STRONĘ ZERA do ``CYFRY_ZNACZACE_WKLADU_POMINIETEGO`` cyfr
    znaczących.

    Rachunek dziesiętny na najkrótszym zapisie dziesiętnym liczby (`repr` — jednoznaczna
    funkcja bitów wejścia), więc deterministyczny; zapis najkrótszy, a nie dokładne
    rozwinięcie binarne, żeby 1,4e-17 nie stało się 1,39e-17. Kierunek „w stronę zera"
    (a nie do najbliższej) gwarantuje, że wkład pominięty (|I| < próg) nigdy nie pokaże
    wartości równej progowi (9,9987e-7 A → 9,99e-7 A, nie 1,00e-6 A). Zero,
    nieskończoność i NaN przechodzą bez zmian.
    """
    if wartosc == 0.0 or not math.isfinite(wartosc):
        return wartosc
    dokladna = Decimal(repr(wartosc))
    kwant = Decimal(1).scaleb(dokladna.adjusted() - (CYFRY_ZNACZACE_WKLADU_POMINIETEGO - 1))
    return float(dokladna.quantize(kwant, rounding=ROUND_DOWN))


def _wykladnik_progu() -> int:
    mantysa, wykladnik = f"{PROG_WKLADU_POMIJALNEGO_A:.0e}".split("e")
    if mantysa != "1":
        raise ValueError("Próg wkładu pomijalnego musi być potęgą dziesięciu.")
    return int(wykladnik)


#: Zapis progu w tekście (tytuł kroku śladu, uzasadnienia) — WYPROWADZONY z progu.
OPIS_PROGU_WKLADU_POMIJALNEGO: str = f"|I| < 1e{_wykladnik_progu()} A"
#: Zapis progu w LaTeX-u (wzór kroku śladu) — WYPROWADZONY z progu.
OPIS_PROGU_WKLADU_POMIJALNEGO_LATEX: str = (
    rf"I_{{\text{{próg}}}} = 10^{{{_wykladnik_progu()}}}\,\mathrm{{A}}"
)
#: Nazwa wpisu zestawienia — dosłownie wg decyzji właściciela z 2026-10-21.
NAZWA_WKLADU_POMINIETEGO: str = (
    f"wkład pominięty na podstawie tolerancji numerycznej ({OPIS_PROGU_WKLADU_POMIJALNEGO})"
)


class SourceType(Enum):
    GRID = "GRID"
    INVERTER = "INVERTER"


@dataclass(frozen=True)
class ShortCircuitSourceContribution:
    """
    Wkład źródła do prądu w punkcie zwarcia (RMS).

    Attributes:
        source_id: str - identyfikator źródła
        source_name: str - nazwa źródła
        source_type: SourceType - typ źródła (GRID/INVERTER)
        node_id: str | None - identyfikator węzła źródła
        i_contrib_a: float - wkład prądowy [A]
        share: float - udział względny (0.0–1.0)
    """

    source_id: str
    source_name: str
    source_type: SourceType
    node_id: str | None
    i_contrib_a: float
    share: float

    def to_dict(self) -> dict:
        """Zwraca wkład jako dict z czystymi typami JSON."""
        return {
            "source_id": self.source_id,
            "source_name": self.source_name,
            "source_type": self.source_type.value,
            "node_id": self.node_id,
            "i_contrib_a": float(self.i_contrib_a),
            "share": float(self.share),
        }


@dataclass(frozen=True)
class ShortCircuitBranchContribution:
    """
    Wkład źródła do prądu w gałęzi (RMS, moduł).

    Attributes:
        source_id: str - identyfikator źródła
        branch_id: str - identyfikator gałęzi
        from_node_id: str - węzeł początkowy gałęzi
        to_node_id: str - węzeł końcowy gałęzi
        i_contrib_a: float - prąd w gałęzi [A]
        direction: str - kierunek przepływu ("from_to" lub "to_from")
    """

    source_id: str
    branch_id: str
    from_node_id: str
    to_node_id: str
    i_contrib_a: float
    direction: str

    def to_dict(self) -> dict:
        """Zwraca wkład jako dict z czystymi typami JSON."""
        return {
            "source_id": self.source_id,
            "branch_id": self.branch_id,
            "from_node_id": self.from_node_id,
            "to_node_id": self.to_node_id,
            "i_contrib_a": float(self.i_contrib_a),
            "direction": self.direction,
        }


@dataclass(frozen=True)
class WkladPominiety:
    """Wkład pominięty na podstawie tolerancji numerycznej (|I| < 1e-6 A) — NIE zero.

    Wpis zestawienia ``ShortCircuitResult.wklady_pominiete``: gałąź, której wkład od
    jednego źródła spełnił `jest_wkladem_pominietym`, więc nie wszedł do listy wkładów
    (`branch_contributions`) ani do kroków śladu podziału prądu. Surowa wartość jest
    zachowana do audytu w zapisie deterministycznym (``CYFRY_ZNACZACE_WKLADU_POMINIETEGO``
    cyfr znaczących): bity poniżej trzeciej cyfry to szum arytmetyki zależny od maszyny
    (BLAS/CPU), więc nie wchodzą do wyniku ani do jego skrótów.

    Attributes:
        tor: tor źródła — ``TOR_THEVENIN`` (sieć zastępcza) albo ``TOR_FALOWNIK``
        source_id: identyfikator źródła wkładu
        branch_id: identyfikator gałęzi
        i_a: surowy moduł prądu gałęzi |I| [A], 3 cyfry znaczące (w stronę zera)
        kat_deg: kąt fazora prądu gałęzi (strona ``from``) względem prądu źródła [°],
            3 cyfry znaczące (w stronę zera); ``None`` dla |I| = 0 (kąt nieokreślony)
    """

    tor: str
    source_id: str
    branch_id: str
    i_a: float
    kat_deg: float | None

    @classmethod
    def z_wartosci(
        cls, *, tor: str, source_id: str, branch_id: str, i_a: float, fazor_a: complex
    ) -> WkladPominiety:
        """Wpis z surowego modułu ``i_a`` [A] — tej wartości, którą sklasyfikował predykat
        `jest_wkladem_pominietym` — i fazora prądu gałęzi [A] (kąt), w zapisie
        deterministycznym (`zaokraglij_cyfry_znaczace`)."""
        return cls(
            tor=tor,
            source_id=source_id,
            branch_id=branch_id,
            i_a=zaokraglij_cyfry_znaczace(float(i_a)),
            kat_deg=(
                None
                if fazor_a == 0
                else zaokraglij_cyfry_znaczace(math.degrees(cmath.phase(fazor_a)))
            ),
        )

    def to_dict(self) -> dict:
        """Zwraca wpis jako dict z czystymi typami JSON."""
        return {
            "tor": self.tor,
            "source_id": self.source_id,
            "branch_id": self.branch_id,
            "i_a": float(self.i_a),
            "kat_deg": None if self.kat_deg is None else float(self.kat_deg),
        }
