"""Harmonogram zdarzeń — solver-neutralny, z deterministyczną kolejnością.

KOD BADAWCZY — patrz `backend/research/README.md`.

Defekt P0-06 audytu: produkcyjny silnik miał w kontrakcie SZEŚĆ typów zdarzeń,
z których DWA cokolwiek robiły, a zwarcie trójfazowe było stałą ``return 0.05``
— identyczną dla każdego elementu, niezależnie od miejsca zwarcia i impedancji.
Pole ``target_ref`` nie było w ogóle odczytywane.

Tutaj zdarzenie zmienia MODEL SIECI (topologię/boczniki) albo nastawę urządzenia,
a napięcia są tego skutkiem — nigdy odwrotnie. Zdarzenie, którego silnik nie
obsługuje, podnosi wyjątek zamiast zostać cicho zignorowane.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from dynamic_lab.siec import Bocznik, TopologiaSieci

#: Admitancja zastępcza zwarcia METALICZNEGO [p.u.]. To jest REGULARIZACJA
#: NUMERYCZNA, nie wielkość fizyczna: zwarcie o zerowej impedancji ma admitancję
#: nieskończoną, której macierz nie przyjmie. Wartość jest arbitralna, więc jej
#: wpływ na wynik inżynierski MUSI być zmierzony, a nie założony — patrz
#: `tests/research/test_regularizacja_zwarcia.py`, który przemiata 1e4/1e6/1e8
#: i pilnuje, że wielkości inżynierskie nie zależą istotnie od tego wyboru.
ADMITANCJA_ZWARCIA_METALICZNEGO_PU = 1.0e6


class NieobslugiwaneZdarzenieError(RuntimeError):
    """Zdarzenie nie ma implementacji — świadomie głośne, nigdy ciche pominięcie."""


class Zdarzenie(Protocol):
    """Zdarzenie stosowane do modelu w chwili ``czas_s``."""

    czas_s: float
    priorytet: int
    opis: str

    def zastosuj(self, topologia: TopologiaSieci) -> TopologiaSieci:
        """Zwróć NOWĄ topologię po zastosowaniu zdarzenia."""
        ...


@dataclass(frozen=True)
class ZwarcieTrojfazowe:
    """Zwarcie TRÓJFAZOWE SYMETRYCZNE przez impedancję ``Zf`` (bocznik admitancyjny).

    ``r_f_pu``/``x_f_pu`` = 0 oznacza zwarcie metaliczne. Napięcie w miejscu
    zwarcia NIE jest zadawane — wynika z rozwiązania sieci, więc zależy od
    impedancji zwarcia, mocy zwarciowej i odległości elektrycznej odbiorcy.

    GRANICA MODELU — dlaczego to NIE jest zwarcie doziemne
    -----------------------------------------------------
    Całe laboratorium liczy w JEDNEJ macierzy ``Ybus``, czyli wyłącznie w sieci
    **składowej zgodnej** (Z1). Zwarcie niesymetryczne — jednofazowe doziemne,
    dwufazowe, dwufazowe z ziemią — wymaga rozwiązania układu ze składowymi
    **przeciwną (Z2) i zerową (Z0)** oraz połączenia sieci składowych zgodnie
    z rodzajem zwarcia; ani Z2, ani Z0 w tym modelu nie istnieją.

    Bocznik dodany do sieci zgodnej **reprezentuje wyłącznie zwarcie symetryczne**.
    Poprzednia nazwa tej klasy (``ZwarcieTrojfazowe``) sugerowała zwarcie
    jednofazowe i była **semantycznie błędna** — model nie ma czym go policzyć.
    Zmiana nazwy jest naprawą tej pomyłki, nie kosmetyką: nazwa typu jest tu
    jedyną informacją, która trafia do śladu wyniku (``zdarzenia[].typ``).

    Zwarcia niesymetryczne w tym prototypie są **nieobsługiwane** — nie ma dla
    nich zaślepki zwracającej „coś", bo zaślepka byłaby fabrykacją.
    """

    czas_s: float
    szyna: str
    r_f_pu: float = 0.0
    x_f_pu: float = 0.0
    admitancja_metaliczna_pu: float | None = None
    """Nadpisanie REGULARIZACJI zwarcia metalicznego [p.u.]; ``None`` = wartość
    domyślna modułu. Parametr istnieje po to, żeby arbitralność tej stałej dała
    się ZMIERZYĆ (sweep 1e4/1e6/1e8), a nie tylko opisać w komentarzu."""
    priorytet: int = 10
    opis: str = "zwarcie trójfazowe symetryczne"

    @property
    def identyfikator(self) -> str:
        """TOŻSAMOŚĆ tego zwarcia — deterministyczna, z miejsca i chwili.

        Bocznik zwarciowy niesie ją jako ``Bocznik.zrodlo``, dzięki czemu zdjęcie
        zwarcia usuwa DOKŁADNIE ten bocznik, a nie wszystko, co na tej szynie
        wisi (defekt E1 audytu). Dwa zwarcia na tej samej szynie w różnych
        chwilach mają różne tożsamości i są zdejmowane niezależnie.
        """
        return f"zwarcie:{self.szyna}:{self.czas_s!r}"

    def admitancja_zwarcia(self) -> complex:
        """Admitancja bocznika zwarciowego [p.u.] — z jawną regularizacją metaliczną."""
        z_f = complex(self.r_f_pu, self.x_f_pu)
        if abs(z_f) < 1.0e-9:
            y = (
                ADMITANCJA_ZWARCIA_METALICZNEGO_PU
                if self.admitancja_metaliczna_pu is None
                else self.admitancja_metaliczna_pu
            )
            return complex(y, 0.0)
        return 1.0 / z_f

    def zastosuj(self, topologia: TopologiaSieci) -> TopologiaSieci:
        y_f = self.admitancja_zwarcia()
        return topologia.z_bocznikiem(
            Bocznik(
                szyna=self.szyna,
                g_pu=y_f.real,
                b_pu=y_f.imag,
                zrodlo=self.identyfikator,
            )
        )


@dataclass(frozen=True)
class ZdjecieZwarcia:
    """Wyłączenie zwarcia — usuwa DOKŁADNIE JEDEN bocznik: bocznik tego zwarcia.

    Defekt E1 audytu: poprzednia wersja wołała ``bez_bocznikow_na(szyna)``, czyli
    kasowała wszystkie boczniki szyny. Szyna z baterią kondensatorów traciła ją
    bezpowrotnie w chwili zdjęcia zwarcia, więc ``Ybus`` po zdjęciu NIE wracał do
    ``Ybus`` sprzed zwarcia, a cała dalsza symulacja dotyczyła innej sieci niż ta,
    którą scenariusz opisywał. Nic tego nie sygnalizowało.

    ``identyfikator_zwarcia`` pozwala wskazać zwarcie wprost. Gdy go nie podano,
    a na szynie jest DOKŁADNIE JEDNO zwarcie, zdejmowane jest ono; gdy jest ich
    więcej, operacja jest błędem, bo „zdejmij zwarcie" przestaje być
    jednoznaczne — cisza w tym miejscu byłaby zgadywaniem, którą awarię
    operator miał na myśli.
    """

    czas_s: float
    szyna: str
    identyfikator_zwarcia: str | None = None
    priorytet: int = 20
    opis: str = "zdjęcie zwarcia"

    def zastosuj(self, topologia: TopologiaSieci) -> TopologiaSieci:
        if self.identyfikator_zwarcia is not None:
            return topologia.bez_bocznika_o_zrodle(self.identyfikator_zwarcia)

        zwarcia = [
            zrodlo
            for zrodlo in topologia.zrodla_bocznikow_na(self.szyna)
            if zrodlo.startswith("zwarcie:")
        ]
        if not zwarcia:
            raise ValueError(
                f"Na szynie {self.szyna} nie ma bocznika zwarciowego do zdjęcia. "
                f"Boczniki na tej szynie: {topologia.zrodla_bocznikow_na(self.szyna)}."
            )
        if len(zwarcia) > 1:
            raise ValueError(
                f"Na szynie {self.szyna} jest {len(zwarcia)} zwarć ({zwarcia}). "
                "Podaj `identyfikator_zwarcia` — które z nich zdejmujemy."
            )
        return topologia.bez_bocznika_o_zrodle(zwarcia[0])


@dataclass(frozen=True)
class WylaczenieGalezi:
    """Otwarcie wyłącznika / wyłączenie linii — REALNA zmiana topologii."""

    czas_s: float
    od_szyny: str
    do_szyny: str
    priorytet: int = 30
    opis: str = "wyłączenie gałęzi"

    def zastosuj(self, topologia: TopologiaSieci) -> TopologiaSieci:
        return topologia.z_wylaczona_galezia(self.od_szyny, self.do_szyny)


@dataclass
class HarmonogramZdarzen:
    """Uporządkowany harmonogram z deterministycznym rozstrzyganiem równoczesności.

    Kolejność: ``(czas_s, priorytet, indeks_wstawienia)``. Trzeci klucz gwarantuje
    stabilność przy identycznym czasie I priorytecie — bez niego kolejność
    zależałaby od implementacji sortowania i wynik przestałby być powtarzalny.
    """

    zdarzenia: list[Zdarzenie]

    def __post_init__(self) -> None:
        self._uporzadkowane = sorted(
            enumerate(self.zdarzenia),
            key=lambda para: (para[1].czas_s, para[1].priorytet, para[0]),
        )

    #: Tolerancja rozpoznania chwili zerowej [s].
    TOLERANCJA_ZERA_S = 1.0e-12

    def do_chwili(self, od_s: float, do_s: float) -> list[Zdarzenie]:
        """Zdarzenia w przedziale ``(od_s, do_s]`` w kolejności deterministycznej."""
        return [z for _, z in self._uporzadkowane if od_s < z.czas_s <= do_s]

    def w_chwili_zero(self) -> list[Zdarzenie]:
        """Zdarzenia o czasie 0 — stosowane PRZED pierwszym rozwiązaniem sieci.

        Wydzielone z ``do_chwili``, bo tamten przedział jest otwarty od lewej i
        chwila 0 nie należy do żadnego przedziału ``(t_{k-1}, t_k]``. Bez tej
        metody zdarzenie zadane na t = 0 nie było stosowane NIGDY, a harmonogram
        nadal je wymieniał (defekt E2 audytu: wynik opisywał scenariusz, którego
        nie policzył). Ujemne czasy zdarzeń są tu również łapane — należą do
        stanu 0-, czyli do warunku początkowego, a nie do przebiegu.
        """
        return [z for _, z in self._uporzadkowane if z.czas_s <= self.TOLERANCJA_ZERA_S]

    def czasy(self) -> tuple[float, ...]:
        return tuple(z.czas_s for _, z in self._uporzadkowane)


@dataclass(frozen=True)
class ZwarcieNiesymetryczne:
    """Zwarcie niesymetryczne — JAWNIE NIEOBSŁUGIWANE, nigdy ciche przybliżenie.

    Istnieje po to, żeby próba policzenia zwarcia 1F/2F/2FE kończyła się
    **głośnym błędem**, a nie podstawieniem zwarcia trójfazowego „bo i tak
    podobne". Defekt P0-06 audytu polegał między innymi na tym, że kontrakt
    obiecywał sześć typów zdarzeń, a dwa cokolwiek robiły — reszta była cicha.

    Aby to policzyć, model musiałby nieść ``Ybus`` składowej przeciwnej i zerowej
    oraz regułę łączenia sieci składowych. To jest zakres, którego prototyp NIE
    ma i którego nie udaje.
    """

    czas_s: float
    szyna: str
    rodzaj: str = "1F"
    priorytet: int = 10
    opis: str = "zwarcie niesymetryczne (nieobsługiwane)"

    def zastosuj(self, topologia: TopologiaSieci) -> TopologiaSieci:
        raise NieobslugiwaneZdarzenieError(
            f"Zwarcie niesymetryczne „{self.rodzaj}" + "” na szynie "
            f"{self.szyna} wymaga sieci składowych Z1/Z2/Z0; laboratorium liczy "
            "wyłącznie w składowej zgodnej. Model NIE podstawia zwarcia "
            "trójfazowego w jego miejsce — to byłaby fabrykacja."
        )
