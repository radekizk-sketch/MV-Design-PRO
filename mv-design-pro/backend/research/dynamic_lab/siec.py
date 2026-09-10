"""Warstwa algebraiczna sieci: Ybus, wstrzyknięcia prądu, rozwiązanie ``g(x,V)=0``.

KOD BADAWCZY — patrz `backend/research/README.md`.

To jest ogniwo, którego w produkcyjnym silniku dynamicznym NIE MA (audyt §12:
``initial_voltage_pu = 1.0`` na sztywno, brak Ybus, elementy całkowane niezależnie).
Tutaj napięcie jest ROZWIĄZANIEM układu algebraicznego, a nie stałą.

Sformułowanie
-------------
Dla wektora stanów dynamicznych ``x`` i zespolonych napięć szyn ``V``:

    0 = g(x, V) = Ybus @ V - I_wstrzyk(x, V)

gdzie ``I_wstrzyk`` składa urządzenia. Część urządzeń (maszyna synchroniczna) jest
LINIOWA względem ``V`` i wchodzi jako ekwiwalent Nortona ``I_N - Y_N*V``; część
(falownik o zadanej mocy) jest NIELINIOWA i wymaga iteracji.

Ekwiwalenty Nortona są wnoszone do macierzy (``Y_efektywna = Ybus + diag(Y_N)``),
dzięki czemu iteracja Newtona dotyczy wyłącznie części nieliniowej i zbiega
w kilku krokach.

Zmiana topologii
----------------
Ybus jest BUDOWANY z listy gałęzi i bocznikow, więc zwarcie, wyłączenie linii czy
otwarcie wyłącznika to zmiana listy i przebudowa macierzy — nie „ustawienie
napięcia na 0,05 p.u.". Faktoryzacja jest unieważniana jawnie
(``_uniewaznij_faktoryzacje``), co jest miejscem, w którym produkcyjny solver
docelowo będzie chciał trzymać faktoryzację LU między krokami.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace

import numpy as np
from numpy.typing import NDArray


class SiecOsobliwaError(RuntimeError):
    """Macierz sieci jest osobliwa — brak rozwiązania (np. wyspa bez źródła)."""


class BrakZbieznosciSieciError(RuntimeError):
    """Iteracja algebraiczna sieci nie zbiegła w zadanej liczbie kroków."""


@dataclass(frozen=True)
class Galaz:
    """Gałąź szeregowa (linia/kabel/transformator zastępczy) w p.u. bazy sieci.

    Model pi: impedancja szeregowa ``r + jx`` oraz susceptancja poprzeczna
    ``b_poprzeczna`` dzielona po połowie na oba końce.
    """

    od_szyny: str
    do_szyny: str
    r_pu: float
    x_pu: float
    b_poprzeczna_pu: float = 0.0
    zalaczona: bool = True

    def admitancja_szeregowa(self) -> complex:
        z = complex(self.r_pu, self.x_pu)
        if z == 0:
            raise ValueError(f"Gałąź {self.od_szyny}->{self.do_szyny} ma zerową impedancję")
        return 1.0 / z


@dataclass(frozen=True)
class Bocznik:
    """Admitancja bocznikowa szyny (kompensacja, ale też ZWARCIE przez ``Zf``)."""

    szyna: str
    g_pu: float = 0.0
    b_pu: float = 0.0

    def admitancja(self) -> complex:
        return complex(self.g_pu, self.b_pu)


@dataclass
class TopologiaSieci:
    """Topologia sieci laboratorium: szyny, gałęzie, boczniki, szyny sztywne.

    ``szyny_sztywne`` to szyny o narzuconym napięciu (system nadrzędny / szyna
    nieskończona). Dla nich równanie węzłowe zastępuje się ``V = V_zadane``.
    """

    szyny: tuple[str, ...]
    galezie: list[Galaz] = field(default_factory=list)
    boczniki: list[Bocznik] = field(default_factory=list)
    szyny_sztywne: dict[str, complex] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if len(set(self.szyny)) != len(self.szyny):
            raise ValueError("Powtórzone identyfikatory szyn")
        znane = set(self.szyny)
        for g in self.galezie:
            if g.od_szyny not in znane or g.do_szyny not in znane:
                raise ValueError(f"Gałąź {g.od_szyny}->{g.do_szyny} wskazuje nieznaną szynę")
        for b in self.boczniki:
            if b.szyna not in znane:
                raise ValueError(f"Bocznik na nieznanej szynie {b.szyna}")
        for s in self.szyny_sztywne:
            if s not in znane:
                raise ValueError(f"Szyna sztywna {s} nie istnieje")

    @property
    def indeks(self) -> dict[str, int]:
        return {szyna: i for i, szyna in enumerate(self.szyny)}

    def zbuduj_ybus(self) -> NDArray[np.complex128]:
        """Zbuduj Ybus [p.u.] z bieżącej listy gałęzi i boczników.

        Model pi: dla gałęzi ``y`` szeregowej i ``b`` poprzecznej całkowitej,
        na każdym końcu dokładane jest ``j*b/2``.
        """
        n = len(self.szyny)
        idx = self.indeks
        ybus = np.zeros((n, n), dtype=np.complex128)
        for g in self.galezie:
            if not g.zalaczona:
                continue
            i, j = idx[g.od_szyny], idx[g.do_szyny]
            y = g.admitancja_szeregowa()
            ybus[i, i] += y
            ybus[j, j] += y
            ybus[i, j] -= y
            ybus[j, i] -= y
            if g.b_poprzeczna_pu:
                y_pop = complex(0.0, g.b_poprzeczna_pu / 2.0)
                ybus[i, i] += y_pop
                ybus[j, j] += y_pop
        for b in self.boczniki:
            ybus[idx[b.szyna], idx[b.szyna]] += b.admitancja()
        return ybus

    def z_bocznikiem(self, bocznik: Bocznik) -> TopologiaSieci:
        """Nowa topologia z dodanym bocznikiem (np. zwarcie przez impedancję)."""
        return replace(self, boczniki=[*self.boczniki, bocznik])

    def bez_bocznikow_na(self, szyna: str) -> TopologiaSieci:
        """Nowa topologia bez boczników na wskazanej szynie (zdjęcie zwarcia)."""
        return replace(self, boczniki=[b for b in self.boczniki if b.szyna != szyna])

    def z_wylaczona_galezia(self, od_szyny: str, do_szyny: str) -> TopologiaSieci:
        """Nowa topologia z wyłączoną gałęzią (wyłączenie linii/wyłącznika)."""
        nowe: list[Galaz] = []
        trafiono = False
        for g in self.galezie:
            para = {g.od_szyny, g.do_szyny}
            if para == {od_szyny, do_szyny} and g.zalaczona:
                nowe.append(replace(g, zalaczona=False))
                trafiono = True
            else:
                nowe.append(g)
        if not trafiono:
            raise ValueError(f"Brak załączonej gałęzi {od_szyny}<->{do_szyny}")
        return replace(self, galezie=nowe)


@dataclass
class RozwiazanieSieci:
    """Wynik rozwiązania algebraicznego sieci."""

    napiecia: NDArray[np.complex128]
    iteracje: int
    residuum: float


class SolverSieci:
    """Rozwiązuje ``Ybus @ V = I_wstrzyk(x, V)`` metodą Newtona (rozdział Re/Im).

    Nieliniowość pochodzi wyłącznie od urządzeń o zadanej mocy (falownik).
    Urządzenia liniowe wnoszą ekwiwalent Nortona do macierzy, więc dla sieci
    z samymi maszynami iteracja zbiega w jednym kroku.
    """

    def __init__(
        self,
        topologia: TopologiaSieci,
        *,
        tolerancja: float = 1.0e-12,
        maks_iteracji: int = 40,
    ) -> None:
        self.topologia = topologia
        self.tolerancja = tolerancja
        self.maks_iteracji = maks_iteracji
        self._ybus: NDArray[np.complex128] | None = None

    @property
    def ybus(self) -> NDArray[np.complex128]:
        if self._ybus is None:
            self._ybus = self.topologia.zbuduj_ybus()
        return self._ybus

    def ustaw_topologie(self, topologia: TopologiaSieci) -> None:
        """Podmień topologię i unieważnij zbudowaną macierz (zmiana topologii)."""
        self.topologia = topologia
        self._uniewaznij_faktoryzacje()

    def _uniewaznij_faktoryzacje(self) -> None:
        """Punkt, w którym docelowy solver produkcyjny zwolni faktoryzację LU."""
        self._ybus = None

    def rozwiaz(
        self,
        wstrzykniecia: FunkcjaWstrzyknięć,
        v_start: NDArray[np.complex128],
        *,
        admitancje_nortona: NDArray[np.complex128] | None = None,
    ) -> RozwiazanieSieci:
        """Rozwiąż układ algebraiczny sieci dla zadanego stanu urządzeń.

        Args:
            wstrzykniecia: funkcja ``V -> I`` (wektor zespolony wstrzyknięć).
            v_start: punkt startowy iteracji.
            admitancje_nortona: opcjonalne ``Y_N`` per szyna wnoszone do diagonali
                (część liniowa urządzeń). Wtedy ``wstrzykniecia`` zwraca wyłącznie
                źródłową część prądu ``I_N``.

        Raises:
            SiecOsobliwaError: gdy macierz jest osobliwa.
            BrakZbieznosciSieciError: gdy iteracja nie zbiegła.
        """
        n = len(self.topologia.szyny)
        idx = self.topologia.indeks
        y = self.ybus.copy()
        if admitancje_nortona is not None:
            y[np.diag_indices(n)] += admitancje_nortona

        sztywne = {idx[s]: v for s, v in self.topologia.szyny_sztywne.items()}
        v = v_start.astype(np.complex128).copy()
        for i, v_zadane in sztywne.items():
            v[i] = v_zadane

        for iteracja in range(1, self.maks_iteracji + 1):
            r = y @ v - wstrzykniecia(v)
            for i in sztywne:
                r[i] = 0.0
            norma = float(np.max(np.abs(r))) if n else 0.0
            if norma < self.tolerancja:
                return RozwiazanieSieci(napiecia=v, iteracje=iteracja - 1, residuum=norma)

            jak = self._jakobian(y, wstrzykniecia, v, sztywne)
            rez = np.concatenate([r.real, r.imag])
            try:
                delta = np.linalg.solve(jak, -rez)
            except np.linalg.LinAlgError as exc:  # pragma: no cover - zależy od danych
                raise SiecOsobliwaError(
                    "Macierz sieci jest osobliwa — sprawdź wyspy bez źródła "
                    "i szyny bez połączenia."
                ) from exc
            v = v + (delta[:n] + 1j * delta[n:])
            for i, v_zadane in sztywne.items():
                v[i] = v_zadane

        raise BrakZbieznosciSieciError(
            f"Sieć nie zbiegła w {self.maks_iteracji} iteracjach (residuum {norma:.3e})."
        )

    def _jakobian(
        self,
        y: NDArray[np.complex128],
        wstrzykniecia: FunkcjaWstrzyknięć,
        v: NDArray[np.complex128],
        sztywne: dict[int, complex],
    ) -> NDArray[np.float64]:
        """Jakobian numeryczny residuum względem ``[Re(V), Im(V)]``.

        Numeryczny świadomie: w laboratorium liczy się przejrzystość i możliwość
        podmiany modelu urządzenia bez wyprowadzania pochodnych. Wybór metody dla
        produkcji (analityczny vs numeryczny) jest decyzją wydajnościową,
        udokumentowaną w pakiecie decyzyjnym.
        """
        n = len(v)
        eps = 1.0e-7
        jak = np.zeros((2 * n, 2 * n), dtype=np.float64)
        r0 = y @ v - wstrzykniecia(v)
        for kol in range(n):
            if kol in sztywne:
                jak[kol, kol] = 1.0
                jak[n + kol, n + kol] = 1.0
                continue
            for czesc in (0, 1):
                v_pert = v.copy()
                v_pert[kol] += eps if czesc == 0 else 1j * eps
                r1 = y @ v_pert - wstrzykniecia(v_pert)
                d = (r1 - r0) / eps
                jak[:n, kol + czesc * n] = d.real
                jak[n:, kol + czesc * n] = d.imag
        for i in sztywne:
            jak[i, :] = 0.0
            jak[n + i, :] = 0.0
            jak[i, i] = 1.0
            jak[n + i, n + i] = 1.0
        return jak


FunkcjaWstrzyknięć = object
"""Alias dokumentacyjny: wywoływalne ``NDArray[complex] -> NDArray[complex]``."""


def ybus_z_produkcji(
    ybus_pu: NDArray[np.complex128],
    mapa_indeksow: dict[str, int],
) -> tuple[tuple[str, ...], NDArray[np.complex128]]:
    """Adapter: wynik produkcyjnego ``build_ybus_pu`` → wejście laboratorium.

    Produkcyjny builder (``network_model.solvers.power_flow_newton_internal
    .build_ybus_pu``) zwraca dokładnie ``(ybus_pu, node_id_to_index, ...)``, czyli
    tę samą parę, której potrzebuje warstwa algebraiczna laboratorium. Ten adapter
    jest celowo trywialny — to DOWÓD, że fundament Ybus nie wymaga wymiany, a
    docelowy silnik dynamiczny może go konsumować bez przebudowy.

    Uwaga: laboratorium NIE importuje produkcji na poziomie modułu (izolacja),
    więc adapter przyjmuje już gotowe dane.
    """
    szyny = tuple(sorted(mapa_indeksow, key=lambda s: mapa_indeksow[s]))
    if ybus_pu.shape != (len(szyny), len(szyny)):
        raise ValueError(f"Kształt Ybus {ybus_pu.shape} nie zgadza się z liczbą szyn {len(szyny)}")
    return szyny, np.asarray(ybus_pu, dtype=np.complex128)
