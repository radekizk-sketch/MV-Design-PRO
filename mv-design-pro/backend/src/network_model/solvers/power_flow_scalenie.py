"""Rozpływ mocy na węzłach ELEKTRYCZNYCH: scalenie zamkniętych łączników i przepływ łącznika.

FIZYKA. Zamknięty łącznik nie ma impedancji, więc jego końce mają jedno napięcie. Rozpływ
NR/GS/FD liczy na węzłach elektrycznych — grupach węzłów wyspy połączonych zamkniętymi
łącznikami (`network_model.core.scalenie_lacznikow.scal_laczniki`, ten sam predykat
i ten sam reprezentant co sieć zwarciowa `core/ybus.py`). Macierz admitancyjna węzłów
elektrycznych to `Y_e = Tᵀ·Y·T`, gdzie `Y` jest macierzą węzłów wyspy BEZ łączników,
a `T` przypisuje węzłowi jego węzeł elektryczny. Dawny model rozpływu — łącznik jako
impedancja zastępcza 0,0001 + j0,0001 Ω (obejście osobliwego jakobianu, K30-14) — był
drugą fizyką tej samej sieci: dodanie zamkniętego wyłącznika do pola zmieniało napięcia
o 3·10⁻⁵ j.w. i moc bierną o 5·10⁻³ Mvar (sonda B-01 karty pola GPZ). Tak samo jak tu
modelują łącznik PowerFactory (łącznik bez impedancji) i pandapower (łączniki szyna–szyna
scalane w jedną szynę obliczeniową).

ZADANIA WĘZŁÓW. Zadania mocy (PQ z wielomianem ZIP i regulacją falownika, PV, boczniki)
zostają przy WĘZŁACH wyspy — każde liczone własnym wzorem w napięciu swojego węzła
elektrycznego — i dopiero ich suma tworzy zadanie węzła elektrycznego (`zredukuj`). Dzięki
temu dwa odbiory ZIP o różnych wielomianach albo dwa falowniki Q(U) w jednej grupie są
odwzorowane dokładnie, bez agregatu współczynników.

PRZEPŁYW ŁĄCZNIKA. Moc łącznika nie wynika z impedancji (jej nie ma), tylko z bilansu mocy
węzłów grupy (I prawo Kirchhoffa): w każdym węźle grupy moc z elementów przyłączonych do
węzła minus moc oddana do gałęzi i bocznika musi odpłynąć łącznikami. Gdy łączniki grupy
tworzą drzewo, rozwiązanie jest jednoznaczne. W pętli łączników bilans węzłów go nie
wyznacza; przyjmujemy rozwiązanie o najmniejszej normie euklidesowej — granicę rozpływu
przez równe impedancje styków przy impedancji dążącej do zera (zasada Thomsona: rozkład
prądów w sieci rezystancyjnej minimalizuje straty; dla równych rezystancji jest to
rozwiązanie I prawa Kirchhoffa o najmniejszej normie). Liczone przez układ z laplasjanem
grafu łączników uziemionym w reprezentancie grupy — deterministycznie.

WĘZŁY NAPIĘCIOWE W JEDNEJ GRUPIE. Kilka węzłów PV w jednym węźle elektrycznym wymaga
zgodnych nastaw napięcia (sprzeczność = odmowa nazwana, nigdy wybór jednej). Ich łączna
moc bierna jest wyznaczona, podział między źródła — nie; przyjmujemy regułę MATPOWER
(`pfsoln`): każde źródło na tym samym ułamku swojego przedziału mocy biernej. Węzeł PV
scalony z węzłem bilansującym jest tym samym, co węzeł bilansujący z zadaniem PV —
odmowa (napięcie trzyma sieć zasilająca).
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Any

import numpy as np
from network_model.core.graph import NetworkGraph
from network_model.core.scalenie_lacznikow import GrupaScalenia, scal_laczniki
from network_model.odmowa_danych import (
    RODZAJ_WEZEL,
    OdmowaWejsciaRdzenia,
    OdwolanieElementu,
    RekordOdmowy,
)
from network_model.solvers.power_flow_inverter import InverterControl
from network_model.solvers.power_flow_types import PQSpec, PVSpec
from network_model.solvers.power_flow_zip import ZipCoeffs, zip_factor

KOD_LACZNIK_ROZNE_NAPIECIA = "rozplyw.lacznik_laczy_rozne_napiecia_znamionowe"
KOD_NASTAWY_NAPIECIA_SPRZECZNE = "rozplyw.nastawy_napiecia_sprzeczne_w_wezle_scalonym"
KOD_WEZEL_NAPIECIOWY_SCALONY_Z_BILANSUJACYM = "rozplyw.wezel_napieciowy_scalony_z_bilansujacym"

PODSTAWA_SCALENIA = (
    "Zamknięty łącznik nie ma impedancji — węzły połączone zamkniętymi łącznikami są jednym "
    "węzłem elektrycznym o jednym napięciu (macierz admitancyjna Y_e = Tᵀ·Y·T; reprezentant "
    "grupy — najmniejszy identyfikator węzła). Ten sam podział stosuje sieć zwarciowa "
    "IEC 60909 (scalenie zamkniętych łączników, impedancja zerowa)."
)
METODA_PRZEPLYWU_DRZEWO = (
    "bilans mocy węzłów grupy (I prawo Kirchhoffa); łączniki grupy tworzą drzewo — "
    "rozwiązanie jednoznaczne"
)
METODA_PRZEPLYWU_PETLA = (
    "bilans mocy węzłów grupy (I prawo Kirchhoffa); pętla łączników — bilans nie wyznacza "
    "rozdziału, przyjęto rozwiązanie o najmniejszej normie (zasada Thomsona: granica rozpływu "
    "przez równe impedancje styków dążące do zera)"
)
PODSTAWA_PODZIALU_Q_PV = (
    "Łączna moc bierna źródeł PV węzła scalonego wynika z bilansu węzła; podział między "
    "źródła — reguła MATPOWER (pfsoln): każde źródło na tym samym ułamku swojego przedziału "
    "mocy biernej [Q_min, Q_max]; przy zerowym łącznym przedziale — po równo. Moc czynna "
    "źródła = jego zadanie, a rezyduum bilansu (rząd tolerancji zbieżności) po równo."
)


def _odwolania(refs: Iterable[str]) -> tuple[OdwolanieElementu, ...]:
    return tuple(OdwolanieElementu(RODZAJ_WEZEL, ref) for ref in sorted(set(refs)))


@dataclass(frozen=True)
class ScalenieWyspy:
    """Węzły wyspy rozpływu i ich węzły elektryczne.

    Indeks PEŁNY — pozycja węzła w posortowanej liście węzłów wyspy (`wezly`); na nim żyją
    zadania mocy (PQ, PV, ZIP, falowniki, boczniki). Indeks ZREDUKOWANY — pozycja węzła
    elektrycznego w posortowanej liście reprezentantów (`reprezentanci`); na nim żyje
    macierz admitancyjna, napięcia i niewiadome solvera. Brak zamkniętego łącznika w wyspie
    (`trywialne`) = oba indeksy są tym samym, a `rozwin`/`zredukuj` oddają TEN SAM obiekt —
    sieć bez łączników liczy się bit w bit jak przed kartą.
    """

    wezly: tuple[str, ...]
    indeks_pelny: dict[str, int]
    reprezentanci: tuple[str, ...]
    indeks_wezla: dict[str, int]
    mapa: np.ndarray
    czlonkowie: tuple[tuple[int, ...], ...]
    grupy: tuple[GrupaScalenia, ...]

    @property
    def trywialne(self) -> bool:
        return not self.grupy

    @property
    def reprezentant_indeksu(self) -> dict[int, str]:
        """Indeks zredukowany → identyfikator reprezentanta (etykiety śladu)."""
        return dict(enumerate(self.reprezentanci))

    def reprezentant(self, node_id: str) -> str:
        return self.reprezentanci[self.indeks_wezla[node_id]]

    def rozwin(self, x: np.ndarray) -> np.ndarray:
        """Wartości węzłów elektrycznych → wartości węzłów wyspy (kopia wartości grupy)."""
        if self.trywialne:
            return x
        return x[self.mapa]

    def zredukuj(self, x: np.ndarray) -> np.ndarray:
        """Wartości węzłów wyspy → sumy po węzłach elektrycznych (kolejność członków grupy)."""
        if self.trywialne:
            return x
        wynik = np.empty(len(self.czlonkowie), dtype=x.dtype)
        for pozycja, czlonkowie in enumerate(self.czlonkowie):
            suma = x[czlonkowie[0]]
            for czlonek in czlonkowie[1:]:
                suma = suma + x[czlonek]
            wynik[pozycja] = suma
        return wynik

    def nosnik(self, indeks: int, kandydaci: Iterable[int]) -> int:
        """Pierwszy (wg identyfikatora) węzeł wyspy grupy `indeks` spośród `kandydaci`."""
        zbior = set(kandydaci)
        for czlonek in self.czlonkowie[indeks]:
            if czlonek in zbior:
                return czlonek
        raise AssertionError(f"Węzeł elektryczny {indeks} nie ma węzła spośród kandydatów")


def odmowy_napiec_lacznikow(
    graph: NetworkGraph, wezly: Iterable[str] | None = None
) -> list[RekordOdmowy]:
    """Zamknięty łącznik między węzłami o RÓŻNYCH napięciach znamionowych — błąd modelu.

    Łącznik nie przenosi napięcia z jednego poziomu na drugi (robi to transformator); scalony
    węzeł nie ma jednej bazy napięciowej. Porównanie dokładne (bez tolerancji — tolerancja
    byłaby heurystyką): ta sama szyna modelu ma jedną wartość napięcia znamionowego.
    """
    scalenie = scal_laczniki(graph, wezly)
    odmowy: list[RekordOdmowy] = []
    for grupa in scalenie.grupy:
        napiecia = {graph.nodes[w].voltage_level for w in grupa.czlonkowie}
        if len(napiecia) > 1:
            odmowy.append(
                RekordOdmowy(
                    KOD_LACZNIK_ROZNE_NAPIECIA,
                    "Zamknięty łącznik łączy węzły o różnych napięciach znamionowych "
                    f"({', '.join(f'{u:g} kV' for u in sorted(napiecia))}) — łącznik nie ma "
                    "impedancji ani przekładni, więc połączone nim węzły muszą mieć to samo "
                    "napięcie znamionowe (przejście między napięciami tylko przez "
                    "transformator).",
                    _odwolania(grupa.czlonkowie),
                )
            )
    return odmowy


def odmowy_wezlow_napieciowych(
    graph: NetworkGraph,
    pv_specs: Iterable[PVSpec],
    slack_node_id: str,
    slack_u_pu: float,
    wezly: Iterable[str] | None = None,
) -> list[RekordOdmowy]:
    """Węzły PV w jednym węźle elektrycznym: nastawy zgodne, bez węzła bilansującego.

    `wezly` — węzły wyspy zasilanej (domyślnie cały graf); PV spoza nich nie jest liczony.
    Jedyne źródło tych predykatów: woła je walidacja wejścia (`odmowy_wejscia`) i
    przygotowanie rozpływu przed redukcją nastaw (`zredukuj_pv`).
    """
    scalenie = scal_laczniki(graph, wezly)
    nastawy: dict[str, list[tuple[str, float]]] = {}
    for spec in pv_specs:
        rep = scalenie.reprezentant.get(spec.node_id)
        if rep is None:
            continue
        nastawy.setdefault(rep, []).append((spec.node_id, float(spec.u_pu)))
    rep_bilansujacy = scalenie.reprezentant.get(slack_node_id)
    odmowy: list[RekordOdmowy] = []
    for rep in sorted(nastawy):
        wpisy = nastawy[rep]
        if rep == rep_bilansujacy and any(node_id != slack_node_id for node_id, _ in wpisy):
            odmowy.append(
                RekordOdmowy(
                    KOD_WEZEL_NAPIECIOWY_SCALONY_Z_BILANSUJACYM,
                    "Węzeł o regulowanym napięciu (PV) jest połączony zamkniętymi łącznikami "
                    "z węzłem bilansującym — to jeden węzeł elektryczny, którego napięcie "
                    f"trzyma sieć zasilająca ({slack_u_pu:g} j.w.); źródło nie może go "
                    "regulować (ustaw zadaną moc bierną źródła albo otwórz łącznik).",
                    _odwolania([slack_node_id, *(node_id for node_id, _ in wpisy)]),
                )
            )
            continue
        wartosci = {u for _, u in wpisy}
        if len(wartosci) > 1:
            odmowy.append(
                RekordOdmowy(
                    KOD_NASTAWY_NAPIECIA_SPRZECZNE,
                    "Węzły o regulowanym napięciu (PV) połączone zamkniętymi łącznikami mają "
                    "różne nastawy napięcia "
                    f"({', '.join(f'{u:g} j.w.' for u in sorted(wartosci))}) — to jeden węzeł "
                    "elektryczny o jednym napięciu; ujednolić nastawy albo otworzyć łącznik.",
                    _odwolania(node_id for node_id, _ in wpisy),
                )
            )
    return odmowy


def zbuduj_scalenie(graph: NetworkGraph, wezly_wyspy: Iterable[str]) -> ScalenieWyspy:
    """Węzły elektryczne wyspy; łącznik między różnymi napięciami — odmowa nazwana."""
    wezly = tuple(sorted(wezly_wyspy))
    odmowy = odmowy_napiec_lacznikow(graph, wezly)
    if odmowy:
        raise OdmowaWejsciaRdzenia(odmowy)
    scalenie = scal_laczniki(graph, wezly)
    indeks_pelny = {wezel: pozycja for pozycja, wezel in enumerate(wezly)}
    reprezentanci = tuple(sorted({scalenie.reprezentant[w] for w in wezly}))
    indeks_rep = {rep: pozycja for pozycja, rep in enumerate(reprezentanci)}
    indeks_wezla = {w: indeks_rep[scalenie.reprezentant[w]] for w in wezly}
    czlonkowie: list[list[int]] = [[] for _ in reprezentanci]
    for wezel in wezly:
        czlonkowie[indeks_wezla[wezel]].append(indeks_pelny[wezel])
    return ScalenieWyspy(
        wezly=wezly,
        indeks_pelny=indeks_pelny,
        reprezentanci=reprezentanci,
        indeks_wezla=indeks_wezla,
        mapa=np.array([indeks_wezla[w] for w in wezly], dtype=int),
        czlonkowie=tuple(tuple(c) for c in czlonkowie),
        grupy=scalenie.grupy,
    )


def indeksy_typow(
    scalenie: ScalenieWyspy,
    slack_node_id: str,
    pq_node_ids: Iterable[str],
    pv_node_ids: Iterable[str],
) -> tuple[int, list[int], list[int]]:
    """(indeks bilansujący, indeksy PQ, indeksy PV) węzłów elektrycznych.

    Węzeł elektryczny z węzłem bilansującym jest bilansujący, z węzłem PV — PV, z węzłem PQ —
    PQ. Węzeł wyspy bez zadania nie nadaje typu. Węzeł elektryczny jednowęzłowy dostaje
    dokładnie typy swojego węzła (bez łączników — zbiory jak przed kartą).
    """
    slack_index = scalenie.indeks_wezla[slack_node_id]
    pv = sorted({scalenie.indeks_wezla[n] for n in pv_node_ids if n in scalenie.indeks_wezla})
    pq_set = {scalenie.indeks_wezla[n] for n in pq_node_ids if n in scalenie.indeks_wezla}
    wielowezlowe = {
        pozycja for pozycja, czlonkowie in enumerate(scalenie.czlonkowie) if len(czlonkowie) > 1
    }
    nadrzedne = (set(pv) | {slack_index}) & wielowezlowe
    pq = sorted(pq_set - nadrzedne)
    return slack_index, pq, pv


def zredukuj_pv(
    scalenie: ScalenieWyspy,
    pv_setpoints: dict[int, float],
    pv_q_limits: dict[int, tuple[float, float]],
) -> tuple[dict[int, float], dict[int, tuple[float, float]]]:
    """Nastawy i granice Q węzłów PV (indeks pełny) → węzły elektryczne.

    Nastawy grupy są równe — gwarantuje to odmowa `odmowy_wezlow_napieciowych`, sprawdzana
    przed redukcją (jedno źródło predykatu); różne nastawy tutaj = błąd programu. Granice
    grupy — sumy granic źródeł (MATPOWER: łączny przedział mocy biernej generatorów szyny).
    """
    if scalenie.trywialne:
        return pv_setpoints, pv_q_limits
    nastawy: dict[int, float] = {}
    granice: dict[int, tuple[float, float]] = {}
    for pelny in sorted(pv_setpoints):
        zred = int(scalenie.mapa[pelny])
        u = pv_setpoints[pelny]
        if zred in nastawy and nastawy[zred] != u:
            raise AssertionError(
                "Sprzeczne nastawy napięcia w węźle scalonym — odmowa "
                f"{KOD_NASTAWY_NAPIECIA_SPRZECZNE} powinna zatrzymać rozpływ wcześniej"
            )
        nastawy.setdefault(zred, u)
    for pelny in sorted(pv_q_limits):
        zred = int(scalenie.mapa[pelny])
        q_min, q_max = pv_q_limits[pelny]
        if zred in granice:
            poprzednie = granice[zred]
            granice[zred] = (poprzednie[0] + q_min, poprzednie[1] + q_max)
        else:
            granice[zred] = (q_min, q_max)
    return nastawy, granice


def zadanie_wezla(
    scalenie: ScalenieWyspy,
    indeks: int,
    modul_napiecia: float,
    p_spec: np.ndarray,
    q_spec: np.ndarray,
    zip_table: Mapping[int, ZipCoeffs],
    zip_const: tuple[np.ndarray, np.ndarray] | None,
    inv_table: Mapping[int, InverterControl],
    q_inv: Mapping[int, float],
    pomin: frozenset[int] = frozenset(),
) -> tuple[float, float]:
    """Zadane wstrzyknięcie (P, Q) węzła elektrycznego `indeks` przy module napięcia.

    Suma zadań węzłów wyspy grupy (bez węzłów `pomin`), każde własnym wzorem: wielomian
    ZIP odbioru (z częścią stałą — generacją — dodaną po wielomianie) i moc bierna Q(U)
    falownika `q_inv` (stan relaksacji GS/FD). Węzeł jednowęzłowy: dokładnie dawne
    wyrażenie solvera Gaussa–Seidla (bit w bit).
    """
    p_i = 0.0
    q_i = 0.0
    pierwszy = True
    czlonkowie = scalenie.czlonkowie[indeks] if not scalenie.trywialne else (indeks,)
    for czlonek in czlonkowie:
        if czlonek in pomin:
            continue
        p_m = p_spec[czlonek]
        q_m = q_spec[czlonek]
        if czlonek in zip_table:
            c = zip_table[czlonek]
            p_m = p_m * zip_factor(c.a_p, c.b_p, c.c_p, modul_napiecia, c.v0_pu)
            q_m = q_m * zip_factor(c.a_q, c.b_q, c.c_q, modul_napiecia, c.v0_pu)
            if zip_const is not None:
                p_m += zip_const[0][czlonek]
                q_m += zip_const[1][czlonek]
        if czlonek in inv_table:
            q_m += q_inv[czlonek]
        if pierwszy:
            p_i, q_i = p_m, q_m
            pierwszy = False
        else:
            p_i += p_m
            q_i += q_m
    return float(p_i), float(q_i)


def q_pozostalych(
    scalenie: ScalenieWyspy, indeks: int, pv_pelne: frozenset[int], q_pelne: np.ndarray
) -> float:
    """Moc bierna węzłów grupy BEZ źródeł PV (odbiory, źródła PQ) — z tablicy węzłów wyspy.

    Granice Q węzła PV dotyczą mocy źródeł, więc w grupie z odbiorem porównuje się
    `Q_węzła_elektrycznego − Q_pozostałych` (reguła MATPOWER: Q_gen = Q_calc + Q_d).
    """
    suma = 0.0
    for czlonek in scalenie.czlonkowie[indeks]:
        if czlonek not in pv_pelne:
            suma += float(q_pelne[czlonek])
    return suma


def wstrzykniecia_pv(
    scalenie: ScalenieWyspy,
    pv_specs: Iterable[PVSpec],
    p_calc: np.ndarray,
    q_calc: np.ndarray,
    p_pq: Mapping[str, float],
    q_pq: Mapping[str, float],
    base_mva: float,
) -> tuple[dict[str, float], dict[str, float]]:
    """Moc wstrzyknięta przez każde źródło PV (pu, konwencja wstrzyknięcia).

    Węzeł elektryczny jednowęzłowy: moc węzła z równania węzłowego (jak przed kartą).
    Grupa: moc źródeł PV = moc węzła elektrycznego − moc węzłów PQ grupy; P źródła = jego
    zadanie (+ równy udział rezyduum), Q — reguła MATPOWER (`PODSTAWA_PODZIALU_Q_PV`).
    """
    specs = [spec for spec in pv_specs if spec.node_id in scalenie.indeks_wezla]
    p_out: dict[str, float] = {}
    q_out: dict[str, float] = {}
    po_grupach: dict[int, list[PVSpec]] = {}
    for spec in specs:
        po_grupach.setdefault(scalenie.indeks_wezla[spec.node_id], []).append(spec)
    for zred, zrodla in po_grupach.items():
        pelne_grupy = scalenie.czlonkowie[zred] if not scalenie.trywialne else (zred,)
        if len(pelne_grupy) == 1:
            spec = zrodla[0]
            p_out[spec.node_id] = float(p_calc[zred])
            q_out[spec.node_id] = float(q_calc[zred])
            continue
        wezly_pv = {spec.node_id for spec in zrodla}
        p_zrodel = float(p_calc[zred])
        q_zrodel = float(q_calc[zred])
        for pelny in pelne_grupy:
            wezel = scalenie.wezly[pelny]
            if wezel in wezly_pv:
                continue
            p_zrodel -= p_pq.get(wezel, 0.0)
            q_zrodel -= q_pq.get(wezel, 0.0)
        liczba = len(zrodla)
        if liczba == 1:
            p_out[zrodla[0].node_id] = p_zrodel
            q_out[zrodla[0].node_id] = q_zrodel
            continue
        p_zadane = [-spec.p_mw / base_mva for spec in zrodla]
        rezyduum = (p_zrodel - sum(p_zadane)) / liczba
        q_min = [spec.q_min_mvar / base_mva for spec in zrodla]
        q_max = [spec.q_max_mvar / base_mva for spec in zrodla]
        przedzial = sum(q_max) - sum(q_min)
        for numer, spec in enumerate(zrodla):
            p_out[spec.node_id] = p_zadane[numer] + rezyduum
            if przedzial > 0.0:
                ulamek = (q_zrodel - sum(q_min)) / przedzial
                q_out[spec.node_id] = q_min[numer] + ulamek * (q_max[numer] - q_min[numer])
            else:
                q_out[spec.node_id] = q_min[numer] + (q_zrodel - sum(q_min)) / liczba
    return p_out, q_out


def moc_bilansujaca(
    scalenie: ScalenieWyspy,
    slack_node_id: str,
    slack_power_wezla: complex,
    p_pq: Mapping[str, float],
    q_pq: Mapping[str, float],
) -> complex:
    """Moc źródła bilansującego: moc jego węzła elektrycznego − moc pozostałych węzłów grupy."""
    zred = scalenie.indeks_wezla[slack_node_id]
    if scalenie.trywialne or len(scalenie.czlonkowie[zred]) == 1:
        return slack_power_wezla
    moc = slack_power_wezla
    for pelny in scalenie.czlonkowie[zred]:
        wezel = scalenie.wezly[pelny]
        if wezel == slack_node_id:
            continue
        moc -= complex(p_pq.get(wezel, 0.0), q_pq.get(wezel, 0.0))
    return moc


def przeplywy_lacznikow(
    scalenie: ScalenieWyspy,
    graph: NetworkGraph,
    napiecia: Mapping[str, complex],
    wstrzykniecia: Mapping[str, complex],
    branch_s_from: Mapping[str, complex],
    branch_s_to: Mapping[str, complex],
    boczniki: Mapping[str, complex],
    base_mva: float,
) -> dict[str, Any]:
    """Przepływ mocy i prąd każdego zamkniętego łącznika wyspy z bilansu węzłów grupy.

    `wstrzykniecia` — moc z elementów przyłączonych do węzła (odbiory, źródła PQ/PV, źródło
    bilansujące; pu, konwencja wstrzyknięcia); `branch_s_*` — moc wpływająca do gałęzi na jej
    końcach (pu); `boczniki` — admitancja bocznika węzła (pu). Moc łącznika `od → do`
    mierzona na końcu `od` (łącznik bez strat: na końcu `do` moc przeciwna).
    """
    grupy_slad: list[dict[str, Any]] = []
    laczniki_slad: list[dict[str, Any]] = []
    for grupa in scalenie.grupy:
        czlonkowie = list(grupa.czlonkowie)
        pozycja = {wezel: i for i, wezel in enumerate(czlonkowie)}
        napiecie = complex(napiecia[grupa.reprezentant])
        bilans = np.zeros(len(czlonkowie), dtype=complex)
        for wezel, i in pozycja.items():
            bilans[i] += complex(wstrzykniecia.get(wezel, 0j))
            y_bocznika = complex(boczniki.get(wezel, 0j))
            bilans[i] -= abs(napiecie) ** 2 * np.conj(y_bocznika)
        for branch_id in sorted(branch_s_from):
            branch = graph.branches[branch_id]
            if branch.from_node_id in pozycja:
                bilans[pozycja[branch.from_node_id]] -= complex(branch_s_from[branch_id])
            if branch.to_node_id in pozycja:
                bilans[pozycja[branch.to_node_id]] -= complex(branch_s_to[branch_id])
        incydencja = np.zeros((len(czlonkowie), len(grupa.laczniki)), dtype=float)
        for k, switch_id in enumerate(grupa.laczniki):
            switch = graph.switches[switch_id]
            incydencja[pozycja[switch.from_node_id], k] = 1.0
            incydencja[pozycja[switch.to_node_id], k] = -1.0
        laplasjan = incydencja @ incydencja.T
        potencjal = np.zeros(len(czlonkowie), dtype=complex)
        if len(czlonkowie) > 1:
            potencjal[1:] = np.linalg.solve(laplasjan[1:, 1:], bilans[1:])
        moce = incydencja.T @ potencjal
        drzewo = len(grupa.laczniki) == len(czlonkowie) - 1
        napiecie_kv = graph.nodes[grupa.reprezentant].voltage_level
        prad_bazowy_ka = (
            base_mva / (np.sqrt(3.0) * napiecie_kv) if napiecie_kv and napiecie_kv > 0 else None
        )
        for k, switch_id in enumerate(grupa.laczniki):
            switch = graph.switches[switch_id]
            moc = complex(moce[k])
            prad_pu = np.conj(moc / napiecie) if napiecie != 0 else complex("nan")
            laczniki_slad.append(
                {
                    "switch_id": switch_id,
                    "from_node_id": switch.from_node_id,
                    "to_node_id": switch.to_node_id,
                    "p_from_mw": float(moc.real * base_mva),
                    "q_from_mvar": float(moc.imag * base_mva),
                    "i_ka": (
                        float(abs(prad_pu) * prad_bazowy_ka) if prad_bazowy_ka is not None else None
                    ),
                    "reprezentant": grupa.reprezentant,
                }
            )
        grupy_slad.append(
            {
                "reprezentant": grupa.reprezentant,
                "czlonkowie": list(grupa.czlonkowie),
                "laczniki": list(grupa.laczniki),
                "metoda_przeplywu": METODA_PRZEPLYWU_DRZEWO if drzewo else METODA_PRZEPLYWU_PETLA,
                "rezyduum_bilansu_mva": float(abs(complex(np.sum(bilans))) * base_mva),
            }
        )
    return {
        "podstawa": PODSTAWA_SCALENIA,
        "grupy": grupy_slad,
        "laczniki": sorted(laczniki_slad, key=lambda wpis: wpis["switch_id"]),
    }


def wstrzykniecia_elementow(
    scalenie: ScalenieWyspy,
    pq_specs: Iterable[PQSpec],
    p_pq: Mapping[str, float],
    q_pq: Mapping[str, float],
    p_pv: Mapping[str, float],
    q_pv: Mapping[str, float],
    slack_node_id: str,
    slack_power: complex,
) -> dict[str, complex]:
    """Moc z elementów przyłączonych do węzłów grup (do bilansu przepływu łączników)."""
    wynik: dict[str, complex] = {}
    w_grupach = {w for grupa in scalenie.grupy for w in grupa.czlonkowie}
    for spec in pq_specs:
        if spec.node_id in w_grupach and spec.node_id in p_pq:
            wynik[spec.node_id] = complex(p_pq[spec.node_id], q_pq[spec.node_id])
    for wezel in p_pv:
        if wezel in w_grupach:
            wynik[wezel] = complex(p_pv[wezel], q_pv[wezel])
    if slack_node_id in w_grupach:
        wynik[slack_node_id] = slack_power
    return wynik


def slad_grup(scalenie: ScalenieWyspy) -> dict[str, Any]:
    """Ślad WHITE BOX scalenia (bez przepływów — te dopisuje `przeplywy_lacznikow`)."""
    return {
        "podstawa": PODSTAWA_SCALENIA,
        "grupy": [
            {
                "reprezentant": grupa.reprezentant,
                "czlonkowie": list(grupa.czlonkowie),
                "laczniki": list(grupa.laczniki),
            }
            for grupa in scalenie.grupy
        ],
    }


__all__ = [
    "KOD_LACZNIK_ROZNE_NAPIECIA",
    "KOD_NASTAWY_NAPIECIA_SPRZECZNE",
    "KOD_WEZEL_NAPIECIOWY_SCALONY_Z_BILANSUJACYM",
    "METODA_PRZEPLYWU_DRZEWO",
    "METODA_PRZEPLYWU_PETLA",
    "PODSTAWA_PODZIALU_Q_PV",
    "PODSTAWA_SCALENIA",
    "ScalenieWyspy",
    "indeksy_typow",
    "moc_bilansujaca",
    "odmowy_napiec_lacznikow",
    "odmowy_wezlow_napieciowych",
    "przeplywy_lacznikow",
    "slad_grup",
    "wstrzykniecia_elementow",
    "wstrzykniecia_pv",
    "q_pozostalych",
    "zadanie_wezla",
    "zbuduj_scalenie",
    "zredukuj_pv",
]
