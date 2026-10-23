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

Wkład źródła do prądu zwarciowego (karta WKLAD-ZRODLA, zgoda B-01 architekta z 2026-10-22,
pakiet GPZ H5 R8): rozbicie części Thevenina I_k''^(Th) (wpis ``THEVENIN_GRID`` listy
``contributions``) na źródła — zasilania systemowe, szyny sztywne i maszyny wirujące —
metodą zastępczego źródła napięcia (IEC 60909-0:2016 §4.2): I_Q,k = Y_Q,k · Z_kf · I_k''.
Wpis to `WkladZrodla`; klasyfikacja wkładu pomijalnego czyta TEN SAM predykat
`jest_wkladem_pominietym` (bez drugiego progu), a źródło w innej wyspie niż węzeł zwarcia
ma wkład STRUKTURALNIE zerowy z przyczyną.
"""

from __future__ import annotations

import cmath
import math
from dataclasses import dataclass
from decimal import ROUND_DOWN, Decimal
from enum import Enum
from typing import TYPE_CHECKING

import numpy as np
from network_model.core.node import NodeType
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import connected_components

if TYPE_CHECKING:
    from network_model.core.graph import NetworkGraph
    from network_model.core.ybus import AdmittanceMatrixBuilder

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


# ---------------------------------------------------------------------------------------------
# Wkład źródła do prądu zwarciowego (karta WKLAD-ZRODLA)
# ---------------------------------------------------------------------------------------------

#: Rodzaje boczników źródeł zwarciowych macierzy Y (kontekst zwarciowy budowniczego
#: `AdmittanceMatrixBuilder`): zasilanie systemowe — SEM za Z_Q (IEC 60909-0:2016 §3.2,
#: `GridShortCircuitSource`, stempel `_ground_slack_buses`).
RODZAJ_BOCZNIKA_SIEC: str = "siec"
#: Węzeł SLACK bez zasilania systemowego — odniesienie idealne szyny sztywnej (V12K-184,
#: stempel `_ground_slack_buses`); admitancja odczytana z przekątnej stempla, nie zaszyta tu.
RODZAJ_BOCZNIKA_SZYNA_SZTYWNA: str = "szyna_sztywna"
#: Maszyna synchroniczna — SEM za Z″ (IEC 60909-0:2016 §6.3, stempel `_add_machine_shunts`).
RODZAJ_BOCZNIKA_MASZYNA_SYNCHRONICZNA: str = "maszyna_synchroniczna"
#: Maszyna asynchroniczna — SEM za Z_M (IEC 60909-0:2016 §6.7, stempel `_add_machine_shunts`).
RODZAJ_BOCZNIKA_MASZYNA_ASYNCHRONICZNA: str = "maszyna_asynchroniczna"

#: Rodzaje źródeł wpisu `WkladZrodla` — rodzaje boczników macierzy Y, bo wpis powstaje
#: z bocznika (`boczniki_zrodel`).
RODZAJE_ZRODLA_WKLADU: tuple[str, ...] = (
    RODZAJ_BOCZNIKA_SIEC,
    RODZAJ_BOCZNIKA_SZYNA_SZTYWNA,
    RODZAJ_BOCZNIKA_MASZYNA_SYNCHRONICZNA,
    RODZAJ_BOCZNIKA_MASZYNA_ASYNCHRONICZNA,
)

#: Klasa wpisu (rodzaj rekordu, nie werdykt): wkład liczony, wkład pominięty progiem
#: `jest_wkladem_pominietym`, źródło w innej wyspie — zawsze z liczbą i przyczyną we wpisie.
KLASA_WKLADU_ZRODLA: str = "WKLAD"
KLASA_WKLADU_ZRODLA_POMINIETY: str = "POMINIETY"
KLASA_WKLADU_ZRODLA_INNA_WYSPA: str = "INNA_WYSPA"

#: Przyczyna wkładu strukturalnie zerowego — wynika z topologii, nie z wartości liczbowej.
PRZYCZYNA_WKLADU_INNA_WYSPA: str = (
    "źródło w innej wyspie niż węzeł zwarcia: brak drogi przez gałęzie w ruchu i zamknięte "
    "łączniki, więc impedancja wzajemna Z_kf = 0 z topologii — wkład strukturalnie zerowy"
)

#: Tolerancja WZGLĘDNA bilansu wkładów w węźle zwarcia — kontrakt bilansu KCL rozpływu
#: prądu zwarciowego (suma kontrolna ``thevenin_flow_balance``: |Σ − I_k''^(Th)| w granicy
#: rel = 1e-9, abs = 1e-6 A — `tests/test_short_circuit_iec60909.py`). Bezwzględna dolna
#: granica to `PROG_WKLADU_POMIJALNEGO_A`: różnica poniżej progu wkładu pomijalnego jest
#: nierozróżnialna od wkładu pominiętego.
TOLERANCJA_WZGLEDNA_BILANSU: float = 1e-9


def tolerancja_bilansu_a(prad_a: float) -> float:
    """Dopuszczalna reszta bilansu wkładów [A] dla prądu ``prad_a`` [A]:
    max(1e-9·|I|, 1e-6 A) — ta sama postać co ``pytest.approx(rel=1e-9, abs=1e-6)``."""
    return max(TOLERANCJA_WZGLEDNA_BILANSU * abs(prad_a), PROG_WKLADU_POMIJALNEGO_A)


def prad_do_tekstu_sladu(prad_a: float) -> float:
    """Prąd [A] do TEKSTU śladu WHITE BOX: wartość o module poniżej
    `PROG_WKLADU_POMIJALNEGO_A` wypisywana jako 0.

    Prąd poniżej progu wkładu pomijalnego jest w tekście szumem arytmetyki — przy
    I_k'' rzędu 1e4 A część urojona sumy fazorowej wkładów i prąd członów poprzecznych
    wychodzą rzędu 1e-13 A, a ich znak i cyfry zależą od maszyny (kolejność sumowania
    iloczynów macierzowych BLAS). Ten sam predykat co klasyfikacja wkładu
    (`jest_wkladem_pominietym`) — jedno źródło prawdy progu. Reguła dotyczy wyłącznie
    TEKSTU (``substitution``/``substitution_latex``); pola liczbowe kroku niosą wartość pełną.
    """
    return 0.0 if jest_wkladem_pominietym(prad_a) else prad_a


def fazor_do_tekstu_sladu(fazor_a: complex) -> complex:
    """Fazor prądu [A] do TEKSTU śladu: każda część (rzeczywista, urojona) osobno
    przez `prad_do_tekstu_sladu`."""
    return complex(prad_do_tekstu_sladu(fazor_a.real), prad_do_tekstu_sladu(fazor_a.imag))


@dataclass(frozen=True)
class WkladZrodla:
    """Wkład jednego źródła do prądu zwarciowego w węźle zwarcia (karta WKLAD-ZRODLA).

    Metoda zastępczego źródła napięcia (IEC 60909-0:2016 §4.2): sieć jest pasywna, jedynym
    źródłem jest c·U_n/√3 w miejscu zwarcia; zasilania systemowe i maszyny są bocznikami
    Y_Q,k = 1/Z_Q,k w macierzy Y. Prąd zwarciowy I_f wpływa do ziemi w węźle zwarcia f, więc
    napięcia węzłowe ze zwarcia to ΔV = −Z_bus[:, f]·I_f, a prąd bocznika k płynący OD źródła
    DO sieci (w stronę zwarcia) to I_Q,k = Y_Q,k · Z_kf · I_f — ten sam kierunek co wkłady
    gałęziowe (prąd do węzła zwarcia). Współczynnik k_Q = Y_Q,k·Z_kf jest bezwymiarowy
    (per-unit); jego kąt to kąt fazora wkładu względem fazora I_k''^(Th).

    Attributes:
        rodzaj: rodzaj źródła (`RODZAJE_ZRODLA_WKLADU`).
        source_id: identyfikator źródła w grafie (szyna sztywna — identyfikator węzła).
        source_name: nazwa z modelu.
        node_id: węzeł przyłączenia źródła w grafie.
        klasa: `KLASA_WKLADU_ZRODLA` / `_POMINIETY` (|I| < 1e-6 A, `jest_wkladem_pominietym`)
            / `_INNA_WYSPA` (wkład strukturalnie zerowy).
        i_a: |I_Q,k| odniesiony do napięcia węzła zwarcia [A] — wielkość bilansu
            Σ I_Q,k = I_k''^(Th); wpis pominięty — 3 cyfry znaczące w stronę zera.
        i_zaciski_a: ten sam prąd na zaciskach źródła, w poziomie napięcia jego węzła [A]
            (I_Q,k · U_n,f / U_n,k).
        kat_deg: kąt fazora wkładu względem I_k''^(Th) [°]; ``None`` dla wkładu zerowego.
        udzial: i_a / I_k'' (prąd całkowity z falownikami) [-] — ta sama podstawa co
            ``share`` listy ``contributions``.
        przyczyna: wyjaśnienie wpisu pominiętego albo zerowego; ``None`` dla wkładu.
    """

    rodzaj: str
    source_id: str
    source_name: str
    node_id: str
    klasa: str
    i_a: float
    i_zaciski_a: float
    kat_deg: float | None
    udzial: float
    przyczyna: str | None

    def to_dict(self) -> dict:
        """Zwraca wpis jako dict z czystymi typami JSON."""
        return {
            "rodzaj": self.rodzaj,
            "source_id": self.source_id,
            "source_name": self.source_name,
            "node_id": self.node_id,
            "klasa": self.klasa,
            "i_a": float(self.i_a),
            "i_zaciski_a": float(self.i_zaciski_a),
            "kat_deg": None if self.kat_deg is None else float(self.kat_deg),
            "udzial": float(self.udzial),
            "przyczyna": self.przyczyna,
        }


@dataclass(frozen=True)
class BocznikZrodla:
    """Bocznik źródła zwarciowego w przekątnej macierzy Y sieci zwarciowej (karta WKLAD-ZRODLA).

    Attributes:
        rodzaj: ``RODZAJ_BOCZNIKA_*``.
        element_id: identyfikator źródła w grafie (szyna sztywna — identyfikator węzła).
        nazwa: nazwa z modelu (szyna sztywna — nazwa węzła).
        node_id: węzeł przyłączenia w grafie.
        indeks: indeks węzła (reprezentanta scalenia zamkniętymi łącznikami) w macierzy Y.
        y_pu: admitancja bocznika [pu].
    """

    rodzaj: str
    element_id: str
    nazwa: str
    node_id: str
    indeks: int
    y_pu: complex


def admitancje_zrodel_macierzy(builder: AdmittanceMatrixBuilder, rozmiar: int) -> np.ndarray:
    """Przekątna boczników źródeł macierzy Y [pu] — z metod stemplujących SAMEGO budowniczego.

    `AdmittanceMatrixBuilder.build` w kontekście zwarciowym dokłada do przekątnej boczniki
    źródeł metodami `_ground_slack_buses` (zasilania systemowe, szyny sztywne) i
    `_add_machine_shunts` (maszyny wirujące). Te same metody wywołane na macierzy zerowej
    dają admitancję źródeł per węzeł DOKŁADNIE taką, jaką stempel wstawia do macierzy — bez
    drugiej kopii reguł stemplowania. Wymaga budowniczego po `build` (mapa węzłów).
    """
    y = np.zeros((rozmiar, rozmiar), dtype=complex)
    builder._ground_slack_buses(y)
    builder._add_machine_shunts(y)
    return np.diag(y).copy()


def boczniki_zrodel(
    graph: NetworkGraph,
    builder: AdmittanceMatrixBuilder,
    admitancje_zrodel: np.ndarray,
) -> tuple[BocznikZrodla, ...]:
    """Rozbicie admitancji źródeł macierzy Y na źródła — w kolejności stemplowania.

    Zasilanie systemowe w węźle macierzy i o Z_Q ≠ 0: Y_Q = Z_base/Z_Q; maszyna wirująca
    w węźle macierzy i o |Z″| ≠ 0: Y″ = Z_base/Z″ (wzory stempla, IEC 60909-0:2016 §3.2,
    §6.3, §6.7). Szyna sztywna: pierwszy węzeł SLACK indeksu bez zasilania systemowego —
    jej admitancja to RESZTA przekątnej stempla (`admitancje_zrodel`) po maszynach tego
    indeksu, więc wartość odniesienia idealnego nie ma tu drugiej kopii.

    Zgodność rozbicia z macierzą (para predykatów: zbiór źródeł w macierzy i zbiór źródeł
    w wyniku) sprawdza krok bilansu wkładów: człony gałęziowe liczy się z macierzy jako
    sumę kolumnową Y minus `admitancje_zrodel`, więc źródło pominięte albo dopisane w tym
    rozbiciu zostawia w bilansie resztę równą swojemu wkładowi.
    """
    indeksy = builder.node_id_to_index
    sieciowe: list[BocznikZrodla] = []
    indeksy_sieci: set[int] = set()
    for src in graph.get_grid_sc_sources():
        idx = indeksy.get(src.node_id)
        if idx is None or src.z_ohm == 0:
            continue
        sieciowe.append(
            BocznikZrodla(
                rodzaj=RODZAJ_BOCZNIKA_SIEC,
                element_id=src.id,
                nazwa=src.name,
                node_id=src.node_id,
                indeks=idx,
                y_pu=builder.get_zbase_ohm(src.node_id) / src.z_ohm,
            )
        )
        indeksy_sieci.add(idx)
    maszyny: list[BocznikZrodla] = []
    for rodzaj, zrodla in (
        (RODZAJ_BOCZNIKA_MASZYNA_SYNCHRONICZNA, graph.get_synchronous_machine_sources()),
        (RODZAJ_BOCZNIKA_MASZYNA_ASYNCHRONICZNA, graph.get_asynchronous_machine_sources()),
    ):
        for maszyna in zrodla:
            idx = indeksy.get(maszyna.node_id)
            if idx is None or abs(maszyna.z_internal_ohm) == 0.0:
                continue
            maszyny.append(
                BocznikZrodla(
                    rodzaj=rodzaj,
                    element_id=maszyna.id,
                    nazwa=maszyna.name,
                    node_id=maszyna.node_id,
                    indeks=idx,
                    y_pu=builder.get_zbase_ohm(maszyna.node_id) / maszyna.z_internal_ohm,
                )
            )
    sztywne: list[BocznikZrodla] = []
    widziane: set[int] = set()
    for node in graph.nodes.values():
        if node.node_type != NodeType.SLACK:
            continue
        idx = indeksy.get(node.id)
        if idx is None or idx in widziane:
            continue
        widziane.add(idx)
        if idx in indeksy_sieci:
            continue
        y_maszyn = sum((m.y_pu for m in maszyny if m.indeks == idx), 0j)
        sztywne.append(
            BocznikZrodla(
                rodzaj=RODZAJ_BOCZNIKA_SZYNA_SZTYWNA,
                element_id=node.id,
                nazwa=node.name,
                node_id=node.id,
                indeks=idx,
                y_pu=complex(admitancje_zrodel[idx]) - y_maszyn,
            )
        )
    return (*sieciowe, *sztywne, *maszyny)


def wyspy_macierzy(y_bus: np.ndarray) -> np.ndarray:
    """Etykieta wyspy per indeks macierzy Y — składowe spójne grafu niezerowych wpisów.

    Macierz Y jest blokowo-przekątna względem wysp (węzły bez drogi przez gałęzie w ruchu
    i zamknięte łączniki), więc jej odwrotność też — impedancja wzajemna Z_kf węzłów
    różnych wysp jest STRUKTURALNIE zerowa. Wyspa pochodzi z wzoru niezerowych wpisów
    tej samej macierzy, którą odwrócono (topologia, nie wartość liczbowa Z_kf). Etykiety
    deterministyczne (przegląd od indeksu 0).
    """
    _, etykiety = connected_components(csr_matrix(y_bus != 0), directed=False)
    return np.asarray(etykiety)
