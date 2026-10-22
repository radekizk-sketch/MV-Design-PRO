"""
Warstwa topologiczna ENM — JEDYNY serwis topologii (konstytucja C.2.2, CV-4.3).

Dwie czyste, deterministyczne funkcje ENM → widok:

* ``derive(snapshot) -> TopologyView`` — topologia WYPROWADZANA z migawki (nigdy
  zapisywana jako prawda, konstytucja C.2.1): węzły topologiczne (szyny scalone
  przez ZAMKNIĘTE łączniki), wyspy (składowe po gałęziach w ruchu i transformatorach),
  sekcje (składowe BEZ transformatorów — domeny napięciowe), źródła odniesienia per
  wyspa (źródło sieciowe / maszyna synchroniczna / asynchroniczna — IEC 60909-0 §4.2),
  punkty otwarte. Konsumenci: assembler IR, wykonawcy biegów, walidator, projekcja nN,
  gotowość, N-1. Algorytmy grafowe pochodzą WYŁĄCZNIE z
  ``network_model.core.topologia`` (to samo jądro woła IR: ``NetworkGraph``,
  ``AdmittanceMatrixBuilder``) — jedna implementacja, dwa poziomy identyfikatorów.
* ``build_topology_graph(enm) -> TopologyGraph`` — identyfikacja TRUNK, korytarzy,
  punktów wejścia, węzłów T (SLD / geometria stacji).

Semantyka „w ruchu" jest TA SAMA co w ``enm/mapping.py`` (ENM → IR): gałąź
(linia, kabel, łącznik, bezpiecznik) łączy szyny wtedy i tylko wtedy, gdy
``status == "closed"``; transformator łączy zawsze; element z końcem poza szynami
migawki nie łączy niczego (jest wykazany w ``krawedzie_pominiete``, nie gubiony
cicho). Element NIEOBECNY w migawce efektywnej (``out_of_service`` scenariusza,
konstytucja B.3) po prostu nie istnieje — nie ma osobnej flagi ``in_service``.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass

from network_model.core.topologia import (
    krawedzie_kazdej_drogi,
    przeglad_wszerz,
    scal_wezly,
    skladowe_spojne,
)
from network_model.pochodne.pasma_napieciowe import pasmo_napieciowe

from .models import (
    Cable,
    EnergyNetworkModel,
    Junction,
    OverheadLine,
)
from .pola import poziom_pol
from .stan_normalny import TYPY_LACZNIKOW_ZE_STANEM_NORMALNYM
from .tor_pola import szyny_stacji

#: Typy gałęzi ENM będące łącznikami: zamknięty łącznik SCALA szyny w jeden węzeł
#: topologiczny (CN → TN), linia/kabel — nie (to impedancja między dwoma węzłami).
#: Zbiór zgodny z ``enm/mapping.py`` (``SwitchBranch.type`` + ``FuseBranch.type``).
TYPY_LACZNIKOW_ENM: frozenset[str] = frozenset(
    {"switch", "breaker", "bus_coupler", "disconnector", "fuse"}
)
#: Generatory będące maszynami z impedancją do odniesienia w zwarciu (IEC 60909-0 §4.2,
#: równoważne źródło napięciowe): synchroniczne oraz asynchroniczne (Type 3 DFIG,
#: SCIG). Falownik (pv_inverter, bess, wind_inverter, fw_pmsg) jest źródłem
#: PRĄDOWYM bez impedancji (§6.8) — wyspa zasilana wyłącznie falownikami nie ma
#: odniesienia. Jedno źródło prawdy dla ``enm/mapping.py`` i wykonawców.
TYPY_MASZYN_SYNCHRONICZNYCH: frozenset[str] = frozenset({"synchronous"})
TYPY_MASZYN_ASYNCHRONICZNYCH: frozenset[str] = frozenset({"fw_dfig", "fw_scig"})


def _kolekcja(snapshot: object, nazwa: str) -> list[object]:
    if isinstance(snapshot, Mapping):
        wartosc = snapshot.get(nazwa) or []
    else:
        wartosc = getattr(snapshot, nazwa, None) or []
    return list(wartosc)


def _pole(element: object, nazwa: str, domyslne: object = None) -> object:
    if isinstance(element, Mapping):
        return element.get(nazwa, domyslne)
    return getattr(element, nazwa, domyslne)


@dataclass(frozen=True)
class Wyspa:
    """Wyspa = składowa spójna szyn po gałęziach w ruchu i transformatorach."""

    szyny: tuple[str, ...]
    #: ``ref_id`` źródeł sieciowych (``Source``) na szynach wyspy.
    zrodla_sieciowe: tuple[str, ...]
    #: ``ref_id`` generatorów będących maszynami synchronicznymi/asynchronicznymi.
    maszyny: tuple[str, ...]
    #: ``ref_id`` WSZYSTKICH generatorów na szynach wyspy (maszyny + falowniki).
    generatory: tuple[str, ...]

    @property
    def zasilona(self) -> bool:
        """Zasilenie = obecność źródła sieciowego (semantyka E003 walidatora i
        energizacji nN: generator NIE zasila wyspy — może zniknąć ze scenariusza)."""
        return bool(self.zrodla_sieciowe)

    @property
    def ma_odniesienie(self) -> bool:
        """Impedancja do odniesienia w zwarciu: źródło sieciowe albo maszyna
        (``canonical_analysis._wezly_bez_impedancji_do_odniesienia``, CI-PARYTET-5)."""
        return bool(self.zrodla_sieciowe or self.maszyny)


@dataclass(frozen=True)
class TopologyView:
    """Topologia wyprowadzona z migawki efektywnej. Wszystkie krotki posortowane;
    kolejność wysp i sekcji: malejąco po liczbie szyn, potem po pierwszej szynie."""

    szyny: tuple[str, ...]
    #: szyna → reprezentant węzła topologicznego (najmniejszy ``ref_id`` klasy
    #: scalonej ZAMKNIĘTYMI łącznikami); szyna bez łącznika reprezentuje samą siebie.
    wezel_topologiczny: Mapping[str, str]
    wyspy: tuple[Wyspa, ...]
    #: składowe po gałęziach w ruchu BEZ transformatorów (domeny napięciowe).
    sekcje: tuple[tuple[str, ...], ...]
    laczniki_otwarte: tuple[str, ...]
    galezie_otwarte: tuple[str, ...]
    #: ``ref_id`` gałęzi/transformatorów z końcem poza szynami migawki (nie łączą).
    krawedzie_pominiete: tuple[str, ...]

    def wyspa_szyny(self, ref_id: str) -> Wyspa | None:
        for wyspa in self.wyspy:
            if ref_id in wyspa.szyny:
                return wyspa
        return None

    def szyny_bez_odniesienia(self) -> frozenset[str]:
        return frozenset(s for w in self.wyspy if not w.ma_odniesienie for s in w.szyny)

    def szyny_niezasilone(self) -> frozenset[str]:
        return frozenset(s for w in self.wyspy if not w.zasilona for s in w.szyny)

    @property
    def wezly_topologiczne(self) -> tuple[str, ...]:
        return tuple(sorted(set(self.wezel_topologiczny.values())))


def _uporzadkuj(skladowe: Iterable[tuple[str, ...]]) -> tuple[tuple[str, ...], ...]:
    return tuple(sorted(skladowe, key=lambda s: (-len(s), s[0])))


@dataclass(frozen=True)
class KrawedzTopologii:
    """Element łączący dwie szyny migawki w ruchu (zamknięta gałąź albo transformator)."""

    ref_id: str
    szyna_a: str
    szyna_b: str
    #: ``galaz`` (linia, kabel), ``lacznik`` (``TYPY_LACZNIKOW_ENM``) albo ``transformator``.
    rodzaj: str


@dataclass(frozen=True)
class PodzialKrawedzi:
    """Podział elementów łączących migawki wg semantyki „w ruchu" — JEDNO źródło dla
    ``derive`` i dla każdego konsumenta, który przegląda graf szyn (tor zasilania,
    ``application/topologia_zasilenia.py``). Kolejność: gałęzie po ``ref_id``, potem
    transformatory po ``ref_id``."""

    szyny: tuple[str, ...]
    w_ruchu: tuple[KrawedzTopologii, ...]
    laczniki_otwarte: tuple[str, ...]
    galezie_otwarte: tuple[str, ...]
    krawedzie_pominiete: tuple[str, ...]


def podziel_krawedzie(snapshot: EnergyNetworkModel | Mapping[str, object]) -> PodzialKrawedzi:
    """Sklasyfikuj gałęzie i transformatory migawki: w ruchu / otwarte / pominięte.

    Gałąź łączy szyny wtedy i tylko wtedy, gdy ``status == "closed"``; transformator łączy
    zawsze; element z końcem poza szynami migawki jest pominięty (nie gubiony cicho).
    """
    szyny = tuple(sorted(str(_pole(b, "ref_id")) for b in _kolekcja(snapshot, "buses")))
    znane = set(szyny)
    w_ruchu: list[KrawedzTopologii] = []
    laczniki_otwarte: list[str] = []
    galezie_otwarte: list[str] = []
    pominiete: list[str] = []

    for galaz in sorted(_kolekcja(snapshot, "branches"), key=lambda g: str(_pole(g, "ref_id"))):
        ref = str(_pole(galaz, "ref_id"))
        a = str(_pole(galaz, "from_bus_ref"))
        b = str(_pole(galaz, "to_bus_ref"))
        if a not in znane or b not in znane:
            pominiete.append(ref)
            continue
        lacznik = str(_pole(galaz, "type")) in TYPY_LACZNIKOW_ENM
        if _pole(galaz, "status", "closed") != "closed":
            (laczniki_otwarte if lacznik else galezie_otwarte).append(ref)
            continue
        w_ruchu.append(KrawedzTopologii(ref, a, b, "lacznik" if lacznik else "galaz"))

    for trafo in sorted(_kolekcja(snapshot, "transformers"), key=lambda t: str(_pole(t, "ref_id"))):
        ref = str(_pole(trafo, "ref_id"))
        hv = str(_pole(trafo, "hv_bus_ref"))
        lv = str(_pole(trafo, "lv_bus_ref"))
        if hv not in znane or lv not in znane:
            pominiete.append(ref)
            continue
        w_ruchu.append(KrawedzTopologii(ref, hv, lv, "transformator"))

    return PodzialKrawedzi(
        szyny=szyny,
        w_ruchu=tuple(w_ruchu),
        laczniki_otwarte=tuple(laczniki_otwarte),
        galezie_otwarte=tuple(galezie_otwarte),
        krawedzie_pominiete=tuple(pominiete),
    )


def szyny_sekcji_gpz(snapshot: EnergyNetworkModel | Mapping[str, object]) -> frozenset[str]:
    """Szyny sekcji SN GPZ — z jawnego rejestru `gpz_sections` stacji `station_type == "gpz"`."""
    return frozenset(
        str(_pole(sekcja, "bus_ref"))
        for stacja in _kolekcja(snapshot, "substations")
        if _pole(stacja, "station_type") == "gpz"
        for sekcja in _kolekcja(stacja, "gpz_sections")
        if _pole(sekcja, "bus_ref")
    )


def stacje_transformatorow_zasilajacych_gpz(
    snapshot: EnergyNetworkModel | Mapping[str, object],
) -> Mapping[str, str]:
    """`ref_id` transformatora WN/SN zasilającego GPZ → `ref_id` jego stacji GPZ.

    Karta GPZ-MODEL: JEDNO źródło predykatu dla walidatora (E066 — transformator GPZ bez
    zasilania od strony 110 kV) i dla operacji, które szukają transformatora „stacji"
    (transformator blokowy źródła przekształtnikowego): transformator zasilający GPZ jest
    granicą zasilania sieci SN, nigdy transformatorem blokowym ani stacyjnym SN/nN.

    Karta GPZ-H5: transformator należy do GPZ, gdy jego strona dolna leży na szynie sekcji
    SN GPZ ALBO gdy jest w rejestrze `transformer_refs` stacji GPZ. Druga droga obejmuje
    transformator rezerwowy rezerwy jawnej (ENEA Zeszyt 1 §26.10.5) — jego strona dolna to
    zacisk przed normalnie otwartym wyłącznikiem pola SN, nie szyna sekcji — oraz
    transformator stacji GPZ, której szyna SN nie ma wpisu w `gpz_sections`. Przynależność
    i stacja pochodzą z TEJ SAMEJ funkcji (predykaty parami): czytelnik nie wyprowadza
    stacji drugą drogą (dawny walidator E066 szukał jej po szynie sekcji i dla transformatora
    z rejestru kończył się `KeyError`). Pierwszeństwo ma szyna sekcji (połączenie fizyczne),
    potem rejestr; stacje i transformatory w kolejności `ref_id`."""
    stacje_gpz = sorted(
        (
            stacja
            for stacja in _kolekcja(snapshot, "substations")
            if _pole(stacja, "station_type") == "gpz"
        ),
        key=lambda stacja: str(_pole(stacja, "ref_id")),
    )
    stacja_sekcji: dict[str, str] = {}
    for stacja in stacje_gpz:
        for sekcja in _kolekcja(stacja, "gpz_sections"):
            szyna = _pole(sekcja, "bus_ref")
            if szyna:
                stacja_sekcji.setdefault(str(szyna), str(_pole(stacja, "ref_id")))
    wynik: dict[str, str] = {}
    for trafo in sorted(_kolekcja(snapshot, "transformers"), key=lambda t: str(_pole(t, "ref_id"))):
        szyna_dolna = str(_pole(trafo, "lv_bus_ref"))
        if szyna_dolna in stacja_sekcji:
            wynik[str(_pole(trafo, "ref_id"))] = stacja_sekcji[szyna_dolna]
    for stacja in stacje_gpz:
        for ref in _kolekcja(stacja, "transformer_refs"):
            wynik.setdefault(str(ref), str(_pole(stacja, "ref_id")))
    znane = {str(_pole(t, "ref_id")) for t in _kolekcja(snapshot, "transformers")}
    return {ref: stacja for ref, stacja in sorted(wynik.items()) if ref in znane}


def transformatory_zasilajace_gpz(
    snapshot: EnergyNetworkModel | Mapping[str, object],
) -> frozenset[str]:
    """`ref_id` transformatorów WN/SN zasilających GPZ — klucze
    `stacje_transformatorow_zasilajacych_gpz` (jedno źródło przynależności i stacji)."""
    return frozenset(stacje_transformatorow_zasilajacych_gpz(snapshot))


def derive(snapshot: EnergyNetworkModel | Mapping[str, object]) -> TopologyView:
    """Wyprowadź ``TopologyView`` z migawki (``EnergyNetworkModel`` albo słownik ENM).

    Czysta funkcja: ten sam model → identyczny widok, niezależnie od kolejności
    elementów w kolekcjach (szyny sortowane po ``ref_id``).
    """
    podzial = podziel_krawedzie(snapshot)
    szyny = podzial.szyny
    znane = set(szyny)
    krawedzie_wysp = [(k.szyna_a, k.szyna_b) for k in podzial.w_ruchu]
    krawedzie_sekcji = [
        (k.szyna_a, k.szyna_b) for k in podzial.w_ruchu if k.rodzaj != "transformator"
    ]
    pary_laczen = [(k.szyna_a, k.szyna_b) for k in podzial.w_ruchu if k.rodzaj == "lacznik"]

    zrodla_szyny: dict[str, list[str]] = {}
    for zrodlo in _kolekcja(snapshot, "sources"):
        szyna = str(_pole(zrodlo, "bus_ref"))
        if szyna in znane:
            zrodla_szyny.setdefault(szyna, []).append(str(_pole(zrodlo, "ref_id")))
    maszyny_szyny: dict[str, list[str]] = {}
    generatory_szyny: dict[str, list[str]] = {}
    for gen in _kolekcja(snapshot, "generators"):
        szyna = str(_pole(gen, "bus_ref"))
        if szyna not in znane:
            continue
        ref = str(_pole(gen, "ref_id"))
        generatory_szyny.setdefault(szyna, []).append(ref)
        typ = _pole(gen, "gen_type")
        if typ in TYPY_MASZYN_SYNCHRONICZNYCH or typ in TYPY_MASZYN_ASYNCHRONICZNYCH:
            maszyny_szyny.setdefault(szyna, []).append(ref)

    wyspy = tuple(
        Wyspa(
            szyny=skladowa,
            zrodla_sieciowe=tuple(sorted(r for s in skladowa for r in zrodla_szyny.get(s, ()))),
            maszyny=tuple(sorted(r for s in skladowa for r in maszyny_szyny.get(s, ()))),
            generatory=tuple(sorted(r for s in skladowa for r in generatory_szyny.get(s, ()))),
        )
        for skladowa in _uporzadkuj(skladowe_spojne(szyny, krawedzie_wysp))
    )
    return TopologyView(
        szyny=szyny,
        wezel_topologiczny=scal_wezly(szyny, pary_laczen),
        wyspy=wyspy,
        sekcje=_uporzadkuj(skladowe_spojne(szyny, krawedzie_sekcji)),
        laczniki_otwarte=podzial.laczniki_otwarte,
        galezie_otwarte=podzial.galezie_otwarte,
        krawedzie_pominiete=podzial.krawedzie_pominiete,
    )


# ---------------------------------------------------------------------------
# Karta GPZ-H5: rola łącznika — JEDNO źródło prawdy (walidator, scenariusze, API)
# ---------------------------------------------------------------------------

#: Łącznik szyn sekcji 110 kV GPZ (ŁS-110 układu H5).
ROLA_LACZNIK_SZYN_WN = "LACZNIK_SZYN_WN"
#: Łącznik szyn sekcji SN GPZ (ŁS-SN układu H5).
ROLA_LACZNIK_SZYN_SN = "LACZNIK_SZYN_SN"
#: Łącznik szyn sekcji rozdzielnicy nN (``Substation.nn_sections``).
ROLA_LACZNIK_SZYN_NN = "LACZNIK_SZYN_NN"
#: Łącznik pola transformatorowego: między szyną stacji a zaciskiem transformatora TEJ stacji
#: (np. wyłącznik pola SN transformatora rezerwowego GPZ, rezerwa jawna ENEA §26.10.5).
ROLA_LACZNIK_POLA_TRANSFORMATOROWEGO = "LACZNIK_POLA_TRANSFORMATOROWEGO"
#: Punkt podziału sieci: łącznik normalnie otwarty (``normal_state == "open"``), który nie
#: łączy dwóch szyn tej samej stacji i nie jest łącznikiem pola transformatorowego.
ROLA_PUNKT_PODZIALU = "PUNKT_PODZIALU"

#: Role łączników szyn stacji — łącznik WEWNĄTRZ rozdzielni, nie punkt podziału sieci.
ROLE_LACZNIKOW_SZYN: frozenset[str] = frozenset(
    {ROLA_LACZNIK_SZYN_WN, ROLA_LACZNIK_SZYN_SN, ROLA_LACZNIK_SZYN_NN}
)

_ROLA_WG_PASMA: dict[str, str] = {
    "WN": ROLA_LACZNIK_SZYN_WN,
    "SN": ROLA_LACZNIK_SZYN_SN,
    "nN": ROLA_LACZNIK_SZYN_NN,
}


def stacje_szyn_rozdzielni(
    snapshot: EnergyNetworkModel | Mapping[str, object],
) -> Mapping[str, frozenset[str]]:
    """Szyna → zbiór ``ref_id`` stacji, do których należy (po ``ref_id`` szyny).

    Szyną stacji jest szyna z ``Substation.bus_refs`` oraz szyna sekcji z jawnych
    rejestrów sekcji (``gpz_hv_sections``, ``gpz_sections``, ``nn_sections``) — rejestry
    dokładane, bo archiwalny model może nie powtarzać szyny sekcji w ``bus_refs``.
    Zbiór, a nie jedna stacja: szyna wpisana do dwóch stacji nie może po cichu należeć
    do tej, która wypadła pierwsza w kolejności."""
    wynik: dict[str, set[str]] = {}
    for stacja in _kolekcja(snapshot, "substations"):
        ref_stacji = str(_pole(stacja, "ref_id"))
        szyny = {str(b) for b in _kolekcja(stacja, "bus_refs") if b}
        for rejestr in ("gpz_hv_sections", "gpz_sections", "nn_sections"):
            for sekcja in _kolekcja(stacja, rejestr):
                szyna = _pole(sekcja, "bus_ref")
                if szyna:
                    szyny.add(str(szyna))
        for szyna in szyny:
            wynik.setdefault(szyna, set()).add(ref_stacji)
    return {szyna: frozenset(stacje) for szyna, stacje in wynik.items()}


def role_lacznikow(
    snapshot: EnergyNetworkModel | Mapping[str, object],
) -> Mapping[str, str]:
    """Rola każdego łącznika z pozycją normalną (``ref_id`` → rola), po ``ref_id``.

    Reguła (jedna, bez domysłu; rozstrzygnięcie architekta, wpis 7 koordynacji wątków
    2026-10-22, pkt 1): łącznik, którego OBA końce są szynami TEJ SAMEJ stacji
    (``stacje_szyn_rozdzielni``), jest łącznikiem szyn — pasmo napięcia szyny
    (``pasmo_napieciowe``: WN ≥ 110 kV, SN, nN ≤ 1 kV) rozstrzyga 110 kV / SN / nN.
    Doprecyzowanie z pomiaru: łącznik szyn SN jest łącznikiem szyn
    wyłącznie w stacji zasilającej (``station_type == "gpz"``). W stacji SN w magistrali
    (sekcyjna, rozdzielcza, SN/nN) sekcja A niesie pole zasilające, a sekcja B pole odpływowe
    (``insert_station_on_segment_sn``), więc sprzęgło leży w torze prądowym magistrali —
    jego otwarcie rozcina magistralę jak łącznik sekcyjny w ciągu i normalnie otwarte jest
    punktem podziału pierścienia (bez tego walidator I005 meldował pierścień rozcięty
    w stacji sekcyjnej jako pierścień bez punktu podziału).
    Łącznik między szyną stacji (``Substation.bus_refs``) a zaciskiem transformatora tej
    stacji (``transformer_refs``), który sam nie jest szyną stacji, jest łącznikiem pola
    transformatorowego — jego otwarcie odstawia transformator, nie dzieli sieci. Każdy inny
    łącznik z ``normal_state == "open"`` jest punktem podziału sieci; łącznik bez tych
    warunków nie ma roli (zwykły łącznik toru). Rola NIE zależy od ``status``
    (bieżącego położenia) — zamknięcie łącznika w scenariuszu nie zmienia, czym jest.
    """
    stacje_szyn = stacje_szyn_rozdzielni(snapshot)
    stacje_gpz = {
        str(_pole(st, "ref_id"))
        for st in _kolekcja(snapshot, "substations")
        if _pole(st, "station_type") == "gpz"
    }
    trafa = {str(_pole(t, "ref_id")): t for t in _kolekcja(snapshot, "transformers")}
    zaciski_pol_tr: set[tuple[str, str]] = set()
    for stacja in _kolekcja(snapshot, "substations"):
        szyny_tej_stacji = {str(b) for b in _kolekcja(stacja, "bus_refs")}
        for ref_tr in _kolekcja(stacja, "transformer_refs"):
            trafo = trafa.get(str(ref_tr))
            if trafo is None:
                continue
            for koniec in (_pole(trafo, "hv_bus_ref"), _pole(trafo, "lv_bus_ref")):
                if koniec and str(koniec) not in szyny_tej_stacji:
                    zaciski_pol_tr.update((s, str(koniec)) for s in szyny_tej_stacji)
    napiecie = {
        str(_pole(b, "ref_id")): _pole(b, "voltage_kv") for b in _kolekcja(snapshot, "buses")
    }
    wynik: dict[str, str] = {}
    for galaz in sorted(_kolekcja(snapshot, "branches"), key=lambda g: str(_pole(g, "ref_id"))):
        if _pole(galaz, "type") not in TYPY_LACZNIKOW_ZE_STANEM_NORMALNYM:
            continue
        ref = str(_pole(galaz, "ref_id"))
        a = str(_pole(galaz, "from_bus_ref"))
        b = str(_pole(galaz, "to_bus_ref"))
        wspolne = stacje_szyn.get(a, frozenset()) & stacje_szyn.get(b, frozenset())
        if wspolne:
            u = napiecie.get(a)
            pasmo = pasmo_napieciowe(float(u)) if isinstance(u, int | float) else None
            if pasmo is not None and (pasmo != "SN" or bool(wspolne & stacje_gpz)):
                wynik[ref] = _ROLA_WG_PASMA[pasmo]
                continue
        if (a, b) in zaciski_pol_tr or (b, a) in zaciski_pol_tr:
            wynik[ref] = ROLA_LACZNIK_POLA_TRANSFORMATOROWEGO
            continue
        if _pole(galaz, "normal_state") == "open":
            wynik[ref] = ROLA_PUNKT_PODZIALU
    return wynik


@dataclass(frozen=True)
class PolaczenieNiezaleznychZrodel:
    """Zamknięte łączniki szyn sekcji łączące wyspy z NIEZALEŻNYMI równoważnikami sieci.

    ``laczniki`` — zamknięte łączniki szyn (po ``ref_id``), których otwarcie rozdziela
    źródła wyspy; ``grupy_zrodel`` — źródła sieciowe po rozdzieleniu (każda grupa to
    jeden niezależny równoważnik albo równoważniki już połączone gałęzią sieci)."""

    laczniki: tuple[str, ...]
    grupy_zrodel: tuple[tuple[str, ...], ...]


def polaczenia_niezaleznych_zrodel(
    snapshot: EnergyNetworkModel | Mapping[str, object],
) -> tuple[PolaczenieNiezaleznychZrodel, ...]:
    """Wyspy, w których źródła sieciowe łączy WYŁĄCZNIE zamknięty łącznik szyn sekcji.

    Karta GPZ-H5 (R6): dwa tory zasilania 110 kV (L1, L2) to dwa NIEZALEŻNE równoważniki
    sieci — ich impedancje są znane z osobna, ale sieć nadrzędna, która je łączy, nie
    jest w modelu. Zamknięcie łącznika szyn 110 kV albo SN tworzy wyspę, w której rozpływ
    i zwarcie liczyłyby sumę niezależnych źródeł — fikcję. Predykat: w wyspie z ≥ 2
    źródłami sieciowymi otwórz WSZYSTKIE zamknięte łączniki szyn sekcji
    (``role_lacznikow``); jeśli źródła rozpadają się na ≥ 2 składowe, wyspa łączy
    niezależne równoważniki. Wszystkie łączniki naraz — inaczej oba łączniki zamknięte
    (ŁS-110 i ŁS-SN) tworzą oczko, w którym otwarcie jednego niczego nie rozdziela.
    Źródła połączone gałęzią sieci (linia, kabel, transformator poza łącznikiem szyn)
    są JEDNĄ siecią z jawną impedancją — ten przypadek liczy zwarcie (decyzja OD-7)."""
    role = role_lacznikow(snapshot)
    podzial = podziel_krawedzie(snapshot)
    laczniki_szyn = {
        k.ref_id
        for k in podzial.w_ruchu
        if k.rodzaj == "lacznik" and role.get(k.ref_id) in ROLE_LACZNIKOW_SZYN
    }
    if not laczniki_szyn:
        return ()
    widok = derive(snapshot)
    zrodla_szyny: dict[str, list[str]] = {}
    for zrodlo in _kolekcja(snapshot, "sources"):
        zrodla_szyny.setdefault(str(_pole(zrodlo, "bus_ref")), []).append(
            str(_pole(zrodlo, "ref_id"))
        )
    skladowe = skladowe_spojne(
        podzial.szyny,
        ((k.szyna_a, k.szyna_b) for k in podzial.w_ruchu if k.ref_id not in laczniki_szyn),
    )
    skladowa_szyny = {szyna: indeks for indeks, sk in enumerate(skladowe) for szyna in sk}
    wynik: list[PolaczenieNiezaleznychZrodel] = []
    for wyspa in widok.wyspy:
        if len(wyspa.zrodla_sieciowe) < 2:
            continue
        grupy: dict[int, list[str]] = {}
        for szyna in wyspa.szyny:
            for zrodlo in zrodla_szyny.get(szyna, ()):
                grupy.setdefault(skladowa_szyny[szyna], []).append(zrodlo)
        if len(grupy) < 2:
            continue
        szyny_wyspy = set(wyspa.szyny)
        laczniki = tuple(
            sorted(
                k.ref_id
                for k in podzial.w_ruchu
                if k.ref_id in laczniki_szyn
                and k.szyna_a in szyny_wyspy
                and skladowa_szyny[k.szyna_a] != skladowa_szyny[k.szyna_b]
            )
        )
        wynik.append(
            PolaczenieNiezaleznychZrodel(
                laczniki=laczniki,
                grupy_zrodel=tuple(sorted(tuple(sorted(g)) for g in grupy.values())),
            )
        )
    return tuple(sorted(wynik, key=lambda p: p.laczniki))


# ---------------------------------------------------------------------------
# W5-C: punkty podziału — WYPROWADZANE z pozycji normalnej łączników
# ---------------------------------------------------------------------------


def punkty_podzialu(snapshot: EnergyNetworkModel | Mapping[str, object]) -> tuple[str, ...]:
    """Punkty normalnie otwarte sieci: łączniki roli ``PUNKT_PODZIALU`` (po ``ref_id``).

    JEDYNE źródło punktów podziału (W5-C): pozycja normalna łącznika
    (``SwitchBranch.normal_state``) — z rolą z ``role_lacznikow`` (karta GPZ-H5): łącznik
    szyn sekcji stacji (ŁS-110, ŁS-SN, sprzęgło rozdzielnicy nN) normalnie otwarty NIE jest
    punktem podziału sieci, tylko rezerwą wewnątrz rozdzielni. Dawna kopia przy magistrali
    (``Corridor.no_point_ref``) jest skasowana — konsumenci (walidator I005, widok
    korytarzy, tor zasilania, widoki logiczne) czytają ten akcesor.
    """
    return tuple(
        sorted(ref for ref, rola in role_lacznikow(snapshot).items() if rola == ROLA_PUNKT_PODZIALU)
    )


def _graf_konfiguracji_normalnej(
    snapshot: EnergyNetworkModel | Mapping[str, object],
    *,
    wymuszony_zamkniety: str | None = None,
) -> tuple[tuple[str, ...], list[tuple[str, str, str]], dict[str, tuple[str, str]]]:
    """Graf szyn sieci w KONFIGURACJI NORMALNEJ, z otwartymi punktami podziału.

    Łącznik z zadeklarowaną pozycją normalną łączy wg ``normal_state`` (punkt
    normalnie otwarty — nigdy, nawet chwilowo zamknięty); każda inna gałąź wg
    ``status`` (jak ``podziel_krawedzie``); transformator łączy zawsze.
    ``wymuszony_zamkniety`` — łącznik traktowany jako zamknięty (kandydat na nowy
    punkt podziału). Zwraca (szyny, krawędzie (ref, a, b), końce punktów podziału).
    """
    szyny = tuple(sorted(str(_pole(b, "ref_id")) for b in _kolekcja(snapshot, "buses")))
    znane = set(szyny)
    krawedzie: list[tuple[str, str, str]] = []
    konce_punktow: dict[str, tuple[str, str]] = {}
    for galaz in sorted(_kolekcja(snapshot, "branches"), key=lambda g: str(_pole(g, "ref_id"))):
        ref = str(_pole(galaz, "ref_id"))
        a = str(_pole(galaz, "from_bus_ref"))
        b = str(_pole(galaz, "to_bus_ref"))
        if a not in znane or b not in znane:
            continue
        stan_normalny = (
            _pole(galaz, "normal_state")
            if _pole(galaz, "type") in TYPY_LACZNIKOW_ZE_STANEM_NORMALNYM
            else None
        )
        if ref == wymuszony_zamkniety:
            krawedzie.append((ref, a, b))
            continue
        if stan_normalny == "open":
            konce_punktow[ref] = (a, b)
            continue
        stan = stan_normalny if stan_normalny is not None else _pole(galaz, "status", "closed")
        if stan == "closed":
            krawedzie.append((ref, a, b))
    for trafo in sorted(_kolekcja(snapshot, "transformers"), key=lambda t: str(_pole(t, "ref_id"))):
        hv = str(_pole(trafo, "hv_bus_ref"))
        lv = str(_pole(trafo, "lv_bus_ref"))
        if hv in znane and lv in znane:
            krawedzie.append((str(_pole(trafo, "ref_id")), hv, lv))
    return szyny, krawedzie, konce_punktow


def poprzednie_punkty_podzialu(
    snapshot: EnergyNetworkModel | Mapping[str, object], lacznik_ref: str
) -> tuple[str, ...]:
    """Punkty podziału TEGO SAMEGO pierścienia, co łącznik ``lacznik_ref`` (po ``ref_id``).

    Punkt podziału P należy do pierścienia łącznika L, gdy w konfiguracji normalnej
    z L zamkniętym (``_graf_konfiguracji_normalnej``) zamknięcie P utworzyłoby pętlę,
    której KAŻDA droga prowadzi przez L — czyli przeniesienie punktu podziału z P na
    L zachowuje układ promieniowy i zasilenie wszystkich odbiorów pętli. Definicja
    strukturalna, bez domysłu: rozstrzyga ``krawedzie_kazdej_drogi`` jądra topologii.
    Więcej niż jeden wynik = pierścień o kilku punktach podziału zależnych od L
    (topologia „theta") — wybór należy do projektanta, nie do operacji.
    """
    szyny, krawedzie, konce = _graf_konfiguracji_normalnej(
        snapshot, wymuszony_zamkniety=lacznik_ref
    )
    # Karta GPZ-H5: kandydatem jest wyłącznie punkt podziału sieci — łącznik szyn sekcji
    # stacji (normalnie otwarty ŁS-SN między sekcjami, z których wychodzi pierścień) nie
    # jest punktem podziału i przeniesienie punktu nie może go cicho zamknąć.
    punkty = set(punkty_podzialu(snapshot))
    wynik: list[str] = []
    for ref, (a, b) in sorted(konce.items()):
        if ref == lacznik_ref or ref not in punkty:
            continue
        mosty = krawedzie_kazdej_drogi(szyny, krawedzie, a, b)
        if mosty is not None and lacznik_ref in mosty:
            wynik.append(ref)
    return tuple(wynik)


def punkty_podzialu_korytarza(
    snapshot: EnergyNetworkModel | Mapping[str, object], segment_refs: Iterable[str]
) -> tuple[str, ...]:
    """Punkty podziału magistrali o odcinkach ``segment_refs`` (po ``ref_id``).

    Punkt podziału należy do magistrali, gdy jest jej odcinkiem (łącznik wstawiony w
    ciąg) albo gdy jego zamknięcie w konfiguracji normalnej utworzyłoby pętlę, której
    każda droga prowadzi przez odcinek magistrali (pierścień zamykany tym punktem
    obejmuje magistralę). Zastępuje skasowane ``Corridor.no_point_ref``.
    """
    odcinki = set(segment_refs)
    punkty = punkty_podzialu(snapshot)
    if not punkty:
        return ()
    szyny, krawedzie, konce = _graf_konfiguracji_normalnej(snapshot)
    wynik: list[str] = []
    for ref in punkty:
        if ref in odcinki:
            wynik.append(ref)
            continue
        if ref not in konce:
            continue
        a, b = konce[ref]
        mosty = krawedzie_kazdej_drogi(szyny, krawedzie, a, b)
        if mosty and odcinki.intersection(mosty):
            wynik.append(ref)
    return tuple(wynik)


@dataclass(frozen=True)
class TrunkSegment:
    """Segment toru głównego SN (od GPZ w dół)."""

    branch_ref: str
    from_bus_ref: str
    to_bus_ref: str
    length_km: float
    order: int


@dataclass(frozen=True)
class EntryPoint:
    """Punkt wejścia kabli zewnętrznych do stacji."""

    substation_ref: str
    bus_ref: str
    entry_point_ref: str | None


@dataclass(frozen=True)
class TopologyNode:
    """Węzeł topologiczny (szyna z metadanymi topologicznymi)."""

    bus_ref: str
    voltage_kv: float
    is_source_bus: bool
    substation_ref: str | None
    junction_ref: str | None
    degree: int  # liczba gałęzi podłączonych


@dataclass(frozen=True)
class TopologyGraph:
    """Graf topologiczny — projekcja ENM na przestrzeń topologiczną.

    INVARIANT: Ten sam ENM → identyczny TopologyGraph (determinizm).
    """

    nodes: tuple[TopologyNode, ...]
    trunk_segments: tuple[TrunkSegment, ...]
    entry_points: tuple[EntryPoint, ...]
    corridors: tuple[CorridorInfo, ...]
    junctions: tuple[JunctionInfo, ...]
    source_bus_refs: tuple[str, ...]
    stats: TopologyStats


@dataclass(frozen=True)
class CorridorInfo:
    """Informacja o magistrali."""

    ref_id: str
    name: str
    corridor_type: str
    segment_count: int
    total_length_km: float
    has_no_point: bool


@dataclass(frozen=True)
class JunctionInfo:
    """Informacja o węźle T."""

    ref_id: str
    name: str
    junction_type: str
    branch_count: int
    bus_ref: str | None


@dataclass(frozen=True)
class TopologyStats:
    """Statystyki topologiczne."""

    bus_count: int
    branch_count: int
    transformer_count: int
    substation_count: int
    bay_count: int
    junction_count: int
    corridor_count: int
    total_line_length_km: float
    source_count: int


def build_topology_graph(enm: EnergyNetworkModel) -> TopologyGraph:
    """
    Zbuduj graf topologiczny z ENM.

    Czysta, deterministyczna funkcja. Ten sam ENM → identyczny wynik.

    Args:
        enm: EnergyNetworkModel — kanoniczny model sieci.

    Returns:
        TopologyGraph z pełną informacją topologiczną.
    """
    # Zbierz referencje
    source_bus_refs = sorted({s.bus_ref for s in enm.sources})
    branch_map = {b.ref_id: b for b in enm.branches}

    # Bus → substation mapping
    bus_to_sub: dict[str, str] = {}
    poziom = poziom_pol(enm)
    for sub in enm.substations:
        # POLA-W-TORZE: zaciski pól SN i szyny za aparatami pól nN należą do stacji.
        for br in sorted(szyny_stacji(enm, sub, poziom)):
            bus_to_sub.setdefault(br, sub.ref_id)

    # Bus → junction mapping
    bus_to_junc: dict[str, str] = {}
    for _junc in enm.junctions:
        # Heurystyka: szukamy szyny, która ma ≥3 gałęzie (T-node)
        # Na razie mapujemy po branch_refs
        pass

    # Policz stopień węzłów (degree)
    bus_degree: dict[str, int] = {b.ref_id: 0 for b in enm.buses}
    for branch in enm.branches:
        if branch.status == "closed":
            if branch.from_bus_ref in bus_degree:
                bus_degree[branch.from_bus_ref] += 1
            if branch.to_bus_ref in bus_degree:
                bus_degree[branch.to_bus_ref] += 1
    for trafo in enm.transformers:
        if trafo.hv_bus_ref in bus_degree:
            bus_degree[trafo.hv_bus_ref] += 1
        if trafo.lv_bus_ref in bus_degree:
            bus_degree[trafo.lv_bus_ref] += 1

    # Buduj TopologyNodes (posortowane po ref_id dla determinizmu)
    topo_nodes = []
    for bus in sorted(enm.buses, key=lambda b: b.ref_id):
        topo_nodes.append(
            TopologyNode(
                bus_ref=bus.ref_id,
                voltage_kv=bus.voltage_kv,
                is_source_bus=bus.ref_id in source_bus_refs,
                substation_ref=bus_to_sub.get(bus.ref_id),
                junction_ref=bus_to_junc.get(bus.ref_id),
                degree=bus_degree.get(bus.ref_id, 0),
            )
        )

    # Buduj trunk segments (segmenty toru głównego)
    trunk_segments = _identify_trunk(enm, source_bus_refs)

    # Buduj entry points
    entry_points = []
    for sub in sorted(enm.substations, key=lambda s: s.ref_id):
        for br in sorted(sub.bus_refs):
            entry_points.append(
                EntryPoint(
                    substation_ref=sub.ref_id,
                    bus_ref=br,
                    entry_point_ref=sub.entry_point_ref,
                )
            )

    # Corridor info
    corridor_infos = []
    for corr in sorted(enm.corridors, key=lambda c: c.ref_id):
        total_len = 0.0
        for seg_ref in corr.ordered_segment_refs:
            # Osobna nazwa: `branch` z petli po `enm.branches` (wyzej) NIGDY nie jest
            # `None`, a `branch_map.get()` moze nie znalezc segmentu. Wspoldzielenie
            # nazwy chowalo mozliwy brak przed analiza.
            segment = branch_map.get(seg_ref)
            if segment and isinstance(segment, OverheadLine | Cable):
                total_len += segment.length_km
        corridor_infos.append(
            CorridorInfo(
                ref_id=corr.ref_id,
                name=corr.name,
                corridor_type=corr.corridor_type,
                segment_count=len(corr.ordered_segment_refs),
                total_length_km=round(total_len, 3),
                has_no_point=bool(punkty_podzialu_korytarza(enm, corr.ordered_segment_refs)),
            )
        )

    # Junction info
    junction_infos = []
    for junc in sorted(enm.junctions, key=lambda j: j.ref_id):
        # Spróbuj znaleźć szynę powiązaną z węzłem T
        # Heurystyka: szyna, której degree ≥ 3 i jest podłączona do gałęzi z junction
        junc_bus = _find_junction_bus(junc, enm)
        junction_infos.append(
            JunctionInfo(
                ref_id=junc.ref_id,
                name=junc.name,
                junction_type=junc.junction_type,
                branch_count=len(junc.connected_branch_refs),
                bus_ref=junc_bus,
            )
        )

    # Statystyki
    total_line_length = 0.0
    for branch in enm.branches:
        if isinstance(branch, OverheadLine | Cable):
            total_line_length += branch.length_km

    stats = TopologyStats(
        bus_count=len(enm.buses),
        branch_count=len(enm.branches),
        transformer_count=len(enm.transformers),
        substation_count=len(enm.substations),
        bay_count=len(enm.bays),
        junction_count=len(enm.junctions),
        corridor_count=len(enm.corridors),
        total_line_length_km=round(total_line_length, 3),
        source_count=len(enm.sources),
    )

    return TopologyGraph(
        nodes=tuple(topo_nodes),
        trunk_segments=tuple(trunk_segments),
        entry_points=tuple(entry_points),
        corridors=tuple(corridor_infos),
        junctions=tuple(junction_infos),
        source_bus_refs=tuple(source_bus_refs),
        stats=stats,
    )


def _identify_trunk(
    enm: EnergyNetworkModel,
    source_bus_refs: list[str],
) -> list[TrunkSegment]:
    """Identyfikuj segmenty toru głównego SN (BFS od szyny zasilającej)."""
    if not source_bus_refs:
        return []

    # Zbierz gałęzie indeksowane po szynie
    bus_branches: dict[str, list[tuple[str, str, float]]] = {}
    for branch in enm.branches:
        if branch.status != "closed":
            continue
        if isinstance(branch, OverheadLine | Cable):
            length = branch.length_km
        else:
            length = 0.0
        bus_branches.setdefault(branch.from_bus_ref, []).append(
            (branch.ref_id, branch.to_bus_ref, length)
        )
        bus_branches.setdefault(branch.to_bus_ref, []).append(
            (branch.ref_id, branch.from_bus_ref, length)
        )

    # Uwzględnij transformatory (łączą szyny WN/SN — kluczowe dla trunk BFS)
    for trafo in enm.transformers:
        bus_branches.setdefault(trafo.hv_bus_ref, []).append((trafo.ref_id, trafo.lv_bus_ref, 0.0))
        bus_branches.setdefault(trafo.lv_bus_ref, []).append((trafo.ref_id, trafo.hv_bus_ref, 0.0))

    # Przegląd wszerz od kolejnych szyn źródłowych ze wspólnym zbiorem odwiedzonych —
    # jedyne jądro (``network_model.core.topologia.przeglad_wszerz``); kolejność
    # segmentów = kolejność odkrycia szyn, jak dotąd.
    visited: set[str] = set()
    trunk: list[TrunkSegment] = []

    def _sasiedzi(current: str) -> list[tuple[tuple[str, float], str]]:
        return [
            ((br_ref, length), next_bus)
            for br_ref, next_bus, length in sorted(
                bus_branches.get(current, []), key=lambda x: x[0]
            )
        ]

    for src_bus in source_bus_refs:
        drzewo = przeglad_wszerz(src_bus, _sasiedzi, odwiedzone=visited)
        for next_bus, rodzic in drzewo.items():
            if rodzic is None:
                continue
            (br_ref, length), current = rodzic
            trunk.append(
                TrunkSegment(
                    branch_ref=br_ref,
                    from_bus_ref=current,
                    to_bus_ref=next_bus,
                    length_km=length,
                    order=len(trunk),
                )
            )

    return trunk


def _find_junction_bus(junc: Junction, enm: EnergyNetworkModel) -> str | None:
    """Znajdź szynę powiązaną z węzłem T (heurystyka: wspólna szyna gałęzi)."""
    bus_counts: dict[str, int] = {}
    branch_map = {b.ref_id: b for b in enm.branches}
    for br_ref in junc.connected_branch_refs:
        branch = branch_map.get(br_ref)
        if branch:
            bus_counts[branch.from_bus_ref] = bus_counts.get(branch.from_bus_ref, 0) + 1
            bus_counts[branch.to_bus_ref] = bus_counts.get(branch.to_bus_ref, 0) + 1

    if not bus_counts:
        return None

    # Szyna z największą liczbą powiązań
    return max(bus_counts, key=lambda k: bus_counts[k])
