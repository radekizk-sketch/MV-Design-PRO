"""Adapter biegu `dynamika_rms` — złożenie wejścia rdzenia DAE i mapowanie wyniku (karta W6-3B).

CO TO ZAMYKA. Rdzeń dynamiki (`network_model/solvers/dynamika/**`, karta W6-2) i
biblioteka urządzeń (karta W6-3A) istniały, a jedyny punkt wejścia biegu
(`enm/canonical_analysis.py::_execute_dynamika_rms`) odmawiał ZAWSZE — cała
warstwa czasowa była „zdolnością bez toku pracy". Ten moduł jest brakującym
ogniwem: składa `WejscieDynamiki` z migawki efektywnej i punktu pracy z rozpływu,
a wynik oddaje warstwie aplikacyjnej jako ładunek `resultset_dynamic_v1`.

ZERO FIZYKI (CLAUDE.md, reguła NOT-A-SOLVER). Ten moduł SKŁADA i MAPUJE: czyta
admitancje gałęzi z modelu domenowego (`network_model/core/branch.py` — te same
metody, z których czyta rozpływ), przelicza je na jednostki względne bazą z
`network_model/pochodne/` i przepisuje w kontrakt rdzenia. Nie ma tu ani jednego
równania ruchu, ani jednej korekty. Pilnuje `scripts/backend_no_physics_guard.py`.

JEDNA PRAWDA WIDOKU SIECI. Macierz admitancyjna, którą rdzeń dynamiki złoży z
`GalazDynamiki`/`OdsprzegDynamiki` tego adaptera, musi być TĄ SAMĄ macierzą, którą
liczył rozpływ — inaczej punkt pracy z rozpływu nie jest równowagą układu DAE i
bramka równowagi rdzenia (`dynamika.inicjalizacja_niezbiezna`) odrzuca bieg albo,
gorzej, `eps_init` „dobrany pod wynik" przemilcza niespójność. Dlatego:

* admitancja szeregowa i poprzeczna pochodzą z TYCH SAMYCH metod modelu, co
  ``power_flow_newton_internal._get_branch_admittances_ohm``;
* przekładnia zespolona `a = |t|·e^{-jθ}` jest tą samą przekładnią, co w Y-bus
  rozpływu (moduł: zaczep × przekładnia poza-znamionowa; kąt: przesunięcie grupy
  połączeń) — stempel rdzenia (`siec.zloz_model_sieci`) sprowadza się wtedy bit
  w bit do stempla rozpływu;
* łącznik ZAMKNIĘTY wchodzi jako gałąź o impedancji zastępczej łącznika — tej
  samej, którą stempluje rozpływ.

Równość Y-bus obu torów nie jest tu deklaracją: przypina ją test
`tests/enm/test_adapter_dynamiki.py::TestParytetYbus`, który porównuje macierz
złożoną z tego wejścia z macierzą `build_ybus_pu` na sieci Z ŁĄCZNIKAMI,
transformatorem z zaczepem i grupą połączeń przesuwającą fazę.

DŁUG NAZWANY (nie zamknięty w tej karcie). Impedancja zastępcza łącznika
zamkniętego żyje w DWÓCH miejscach: jako zmienna lokalna w zamrożonym rdzeniu
rozpływu (`power_flow_newton_internal._build_ybus_ohm`) i jako stała
`IMPEDANCJA_LACZNIKA_ZAMKNIETEGO_OHM` tutaj. Skonsolidowanie ich wymaga edycji
rdzenia FROZEN (bramka właściciela B-01), więc w tej karcie jest wyłącznie
PRZYPIĘTE testem parytetu — rozjazd wartości wywala test, nie produkcję.

PUNKT PRACY NIGDY Z DOMYSŁU (karta W6-3 §0 p. 5). `PunktPracy` pochodzi z
ZAKOŃCZONEGO biegu rozpływu na TEJ SAMEJ migawce efektywnej. Płaski start 1,0 p.u.
i wartości znamionowe jako punkt pracy są fabrykacją — brak biegu rozpływu kończy
się nazwaną odmową, nie startem „skądkolwiek".

PODZIAŁ MOCY WĘZŁA — JEDEN PREDYKAT. Rozpływ daje moc WYPADKOWĄ węzła
(`S_net = Σ generacja − Σ odbiór`, konwencja generacji). Odbiory dynamiki biorą moc
z modelu (`Load.p_mw/q_mvar`), a moc urządzenia jest WYPROWADZONA z tej samej
liczby: `S_urz = S_net + Σ S_odbiorów węzła`. Dzięki temu prąd wstrzykiwany przez
urządzenie i prąd pobierany przez odbiory sumują się DOKŁADNIE do wstrzyku
węzłowego rozpływu, niezależnie od tego, czy moc bierna źródła jest nastawą
(węzeł PQ), wynikiem regulacji napięcia (węzeł PV), wynikiem kształtowania
falownika (Q(U)/cosφ), czy bilansem szyny zasilającej. Dwa niezależne warunki
(„moc źródła z nastawy" ORAZ „moc odbioru z modelu") zgadzałyby się tylko dla
węzłów PQ bez regulacji — reguła predykatów parami zabrania takiego rozjazdu.
"""

from __future__ import annotations

import cmath
import math
from dataclasses import dataclass
from typing import Any

from enm.dynamika_modele import ParametryDynamiczne
from enm.mapping import ref_to_graph_id
from enm.models import (
    Cable,
    EnergyNetworkModel,
    FuseBranch,
    OverheadLine,
    ShuntCapacitor,
    Source,
    SwitchBranch,
)

# Kontrakt DANYCH (`enm/scenariusze.py`) i kontrakt RDZENIA
# (`solvers/dynamika/kontrakty.py`) mają dla dwóch zdarzeń te same nazwy klas —
# to dwie warstwy tego samego pojęcia, nie duplikat. Aliasujemy stronę DANYCH
# (`*Scenariusza`), żeby nazwy rdzenia zostały w module dokładnie takie, jakie
# niesie jego kontrakt.
from enm.scenariusze import (
    KomendaRegulacji,
    ScenariuszDynamiczny,
    Synchronizacja,
    WylaczenieGalezi,
    ZalaczenieGalezi,
    Zwarcie,
)
from enm.scenariusze import OdlaczenieZrodla as OdlaczenieZrodlaScenariusza
from enm.scenariusze import SkokObciazenia as SkokObciazeniaScenariusza
from network_model.core.branch import LineBranch, TransformerBranch
from network_model.core.graph import NetworkGraph
from network_model.core.switch import SwitchState
from network_model.pochodne import impedancja_z_napiecia_i_mocy_ohm
from network_model.solvers.dynamika import (
    GalazDynamiki,
    HarmonogramDynamiki,
    NastawySolvera,
    OdbiorDynamiki,
    OdlaczenieZrodla,
    OdsprzegDynamiki,
    PunktPracy,
    SkokObciazenia,
    Urzadzenie,
    WejscieDynamiki,
    WezelDynamiki,
    ZmianaGalezi,
    ZwarcieWezla,
)
from network_model.solvers.dynamika.kontrakty import ZdarzenieDynamiki
from network_model.solvers.dynamika.konwencje import moc_pu
from network_model.solvers.dynamika.urzadzenia import (
    PunktPracyUrzadzenia,
    zbuduj_szyne_sztywna,
    zbuduj_urzadzenie,
)
from network_model.solvers.dynamika.urzadzenia.fabryka import RODZINY_OBSLUGIWANE
from network_model.solvers.power_flow_newton_internal import transformer_phase_shift_rad

# ---------------------------------------------------------------------------
# Kody odmów adaptera — rejestr ZAMKNIĘTY, przypięty testem
# `tests/enm/test_adapter_dynamiki.py::test_kody_odmow_zamkniete`.
#
# Kody rdzenia (`network_model/solvers/dynamika/kontrakty.py::KODY_ODMOW`) opisują
# to, czego RDZEŃ nie potrafi policzyć; te opisują to, czego ADAPTER nie potrafi
# złożyć. Dwie warstwy, dwa rejestry — wspólny rejestr wymagałby, żeby rdzeń znał
# pojęcia ENM (migawka, bieg, scenariusz), których z założenia nie zna.
# ---------------------------------------------------------------------------

#: Bieg dynamiki nie wskazuje biegu rozpływu (`options.pf_run_id`).
KOD_PUNKT_PRACY_BRAK = "dynamika.punkt_pracy_brak"
#: Wskazany bieg rozpływu istnieje, ale nie jest zakończonym rozpływem.
KOD_PUNKT_PRACY_NIE_ROZPLYW = "dynamika.punkt_pracy_nie_jest_rozplywem"
#: Bieg rozpływu liczony na INNEJ migawce niż bieg dynamiki.
KOD_PUNKT_PRACY_INNA_MIGAWKA = "dynamika.punkt_pracy_inna_migawka"
#: Rozpływ nie zbiegł albo zostawił węzły nierozwiązane — punkt pracy niepełny.
KOD_PUNKT_PRACY_NIEPELNY = "dynamika.punkt_pracy_niepelny"
#: Brak kompletu nastaw numerycznych w opcjach biegu (zero domyślek liczbowych).
KOD_NASTAWY_BRAK = "dynamika.nastawy_solvera_brak"
#: Brak scenariusza dynamicznego (horyzont + krok wyjścia + zdarzenia).
KOD_SCENARIUSZ_BRAK = "dynamika.scenariusz_dynamiczny_brak"
#: Rodzaj zdarzenia scenariusza spoza zbioru, który rdzeń umie wykonać.
KOD_ZDARZENIE_NIEOBSLUGIWANE = "dynamika.rodzaj_zdarzenia_nieobslugiwany"
#: Skok obciążenia wskazuje element, który nie jest odbiorem modelu.
KOD_SKOK_POZA_ODBIOREM = "dynamika.skok_obciazenia_poza_odbiorem"
#: Generator bez bloku `Generator.dynamika` — brak danych wejściowych DAE.
KOD_ZRODLO_BEZ_DYNAMIKI = "dynamika.zrodlo_bez_bloku_dynamiki"
#: Rodzina parametrów, dla której biblioteka urządzeń nie ma modelu.
KOD_RODZINA_BEZ_MODELU = "dynamika.rodzina_urzadzenia_bez_modelu"
#: Dwa urządzenia dynamiczne na jednej szynie — podział mocy węzła niewyznaczalny.
KOD_WIELE_URZADZEN_W_WEZLE = "dynamika.wiele_urzadzen_w_wezle"
#: Odbiór ZIP — rdzeń zna wyłącznie odbiór o stałej mocy.
KOD_ODBIOR_ZIP = "dynamika.odbior_zip_nieobslugiwany"
#: Źródło sieciowe bez impedancji zastępczej — szyna sztywna jej wymaga.
KOD_ZRODLO_BEZ_IMPEDANCJI = "dynamika.zrodlo_bez_impedancji"
#: Gałąź modelu, której rdzeń nie umie odwzorować w modelu pi.
KOD_GALAZ_NIEOBSLUGIWANA = "dynamika.galaz_nieobslugiwana"
#: Wytwórca, źródło albo odbiór wskazuje szynę, której model nie ma.
KOD_ELEMENT_BEZ_SZYNY = "dynamika.element_bez_szyny"

#: Zamknięty rejestr kodów odmów adaptera. Nowy kod DOPISUJESZ tutaj —
#: `OdmowaWejsciaDynamiki` odrzuca kod spoza rejestru (deklaracja z przypiętym
#: testem, nie obietnica w docstringu).
KODY_ODMOW_ADAPTERA: tuple[str, ...] = (
    KOD_ELEMENT_BEZ_SZYNY,
    KOD_GALAZ_NIEOBSLUGIWANA,
    KOD_NASTAWY_BRAK,
    KOD_ODBIOR_ZIP,
    KOD_PUNKT_PRACY_BRAK,
    KOD_PUNKT_PRACY_INNA_MIGAWKA,
    KOD_PUNKT_PRACY_NIEPELNY,
    KOD_PUNKT_PRACY_NIE_ROZPLYW,
    KOD_RODZINA_BEZ_MODELU,
    KOD_SCENARIUSZ_BRAK,
    KOD_SKOK_POZA_ODBIOREM,
    KOD_WIELE_URZADZEN_W_WEZLE,
    KOD_ZDARZENIE_NIEOBSLUGIWANE,
    KOD_ZRODLO_BEZ_DYNAMIKI,
    KOD_ZRODLO_BEZ_IMPEDANCJI,
)


class OdmowaWejsciaDynamiki(ValueError):
    """Nazwana odmowa złożenia wejścia biegu dynamiki (kod + elementy blokujące).

    Ta sama droga odmowy, co `OdmowaWejsciaRozplywu` w assemblerze rozpływu:
    `execute_run` łapie ją, zapisuje status FAILED i komunikat PL z kodem — BEZ
    FASADY (żaden liczbowy wynik, żaden fałszywy sukces).
    """

    def __init__(self, kod: str, komunikat: str, *, elementy: tuple[str, ...] = ()) -> None:
        if kod not in KODY_ODMOW_ADAPTERA:
            raise AssertionError(
                f"Kod odmowy {kod!r} spoza rejestru KODY_ODMOW_ADAPTERA — dopisz go do rejestru."
            )
        super().__init__(f"{komunikat} (kod gotowości: {kod})")
        self.kod = kod
        self.elementy = elementy


# ---------------------------------------------------------------------------
# Predykaty MODELU — jedno źródło prawdy dla bramki gotowości i dla biegu
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class BrakDynamiki:
    """Jedno naruszenie warunku modelowego biegu dynamiki (kod + elementy + PL)."""

    kod: str
    komunikat_pl: str
    elementy: tuple[str, ...]


def braki_modelu_dynamiki(enm: EnergyNetworkModel) -> tuple[BrakDynamiki, ...]:
    """Warunki MODELOWE biegu `dynamika_rms` — JEDEN predykat dla gotowości i biegu.

    Bramka gotowości (`application/calculation_readiness/service.py::
    _check_dynamika_rms`) i adapter biegu czytają DOKŁADNIE tę listę, więc
    „gotowość mówi ready, a bieg odmawia" nie ma gdzie powstać (reguła
    predykatów parami: warunek wejścia i wyjścia z jednego źródła prawdy).

    Warunki PER BIEG (punkt pracy, nastawy numeryczne, scenariusz) NIE są tutaj —
    zależą od opcji biegu, których model nie zna; sprawdza je adapter, a bramka
    gotowości dostaje je osobnym argumentem (`punkt_pracy_rozplywu`).

    Kolejność wpisów jest deterministyczna (kolejność warunków, wewnątrz warunku
    posortowane `ref_id`).
    """
    braki: list[BrakDynamiki] = []

    # Wiszące referencje szyn są pierwsze: bez nich KAŻDY kolejny warunek
    # (podział mocy węzła, budowa urządzenia) sięgałby po szynę, której nie ma,
    # i kończył się wyjątkiem BEZ NAZWY zamiast odmową z komunikatem.
    # `enm/mapping.py` takie elementy po cichu POMIJA przy budowie grafu, więc
    # rozpływ liczy się bez nich — dla biegu czasowego byłoby to liczenie innej
    # sieci niż zapisana.
    szyny = {bus.ref_id for bus in enm.buses}
    powiazania: list[tuple[str, str]] = [
        (element.ref_id, element.bus_ref)
        for element in (*enm.generators, *enm.sources, *enm.loads, *enm.shunt_capacitors)
    ]
    for galaz in enm.branches:
        powiazania.append((galaz.ref_id, galaz.from_bus_ref))
        powiazania.append((galaz.ref_id, galaz.to_bus_ref))
    for trafo in enm.transformers:
        powiazania.append((trafo.ref_id, trafo.hv_bus_ref))
        powiazania.append((trafo.ref_id, trafo.lv_bus_ref))
    wiszace = tuple(
        sorted(f"{ref_id} -> {bus_ref}" for ref_id, bus_ref in powiazania if bus_ref not in szyny)
    )
    if wiszace:
        braki.append(
            BrakDynamiki(
                kod=KOD_ELEMENT_BEZ_SZYNY,
                komunikat_pl=(
                    "Element modelu wskazuje szynę, której model nie ma — bieg czasowy "
                    "liczyłby sieć inną niż zapisana (przy budowie grafu taki element jest "
                    f"pomijany bez śladu). Wiszące referencje: {', '.join(wiszace)}."
                ),
                elementy=wiszace,
            )
        )

    bez_bloku = tuple(sorted(gen.ref_id for gen in enm.generators if gen.dynamika is None))
    if bez_bloku:
        braki.append(
            BrakDynamiki(
                kod=KOD_ZRODLO_BEZ_DYNAMIKI,
                komunikat_pl=(
                    "Bieg dynamiki czasowej wymaga bloku parametrów dynamicznych dla KAŻDEGO "
                    "wytwórcy w modelu (karta producenta, certyfikat jednostki albo profil "
                    f"typowy normy). Brak bloku: {', '.join(bez_bloku)}."
                ),
                elementy=bez_bloku,
            )
        )

    bez_modelu: list[str] = []
    for gen in sorted(enm.generators, key=lambda g: g.ref_id):
        parametry: ParametryDynamiczne | None = gen.dynamika
        if parametry is None:
            continue
        if parametry.rodzina not in RODZINY_OBSLUGIWANE:
            bez_modelu.append(f"{gen.ref_id} ({parametry.rodzina})")
    if bez_modelu:
        braki.append(
            BrakDynamiki(
                kod=KOD_RODZINA_BEZ_MODELU,
                komunikat_pl=(
                    "Biblioteka urządzeń dynamicznych nie ma modelu elektrycznego dla "
                    f"zadeklarowanej rodziny parametrów: {', '.join(bez_modelu)}. Rodziny "
                    f"z modelem: {', '.join(RODZINY_OBSLUGIWANE)}."
                ),
                elementy=tuple(bez_modelu),
            )
        )

    zip_odbiory = tuple(sorted(load.ref_id for load in enm.loads if load.model == "zip"))
    if zip_odbiory:
        braki.append(
            BrakDynamiki(
                kod=KOD_ODBIOR_ZIP,
                komunikat_pl=(
                    "Rdzeń dynamiki czasowej modeluje wyłącznie odbiór o stałej mocy; odbiór "
                    "o charakterystyce napięciowej (ZIP) pobierałby w biegu inną moc niż w "
                    f"rozpływie, z którego pochodzi punkt pracy. Odbiory ZIP: "
                    f"{', '.join(zip_odbiory)}."
                ),
                elementy=zip_odbiory,
            )
        )

    urzadzenia_wezla: dict[str, list[str]] = {}
    for gen in enm.generators:
        urzadzenia_wezla.setdefault(gen.bus_ref, []).append(gen.ref_id)
    for zrodlo in enm.sources:
        urzadzenia_wezla.setdefault(zrodlo.bus_ref, []).append(zrodlo.ref_id)
    kolizje = tuple(
        f"{szyna}: {', '.join(sorted(refy))}"
        for szyna, refy in sorted(urzadzenia_wezla.items())
        if len(refy) > 1
    )
    if kolizje:
        braki.append(
            BrakDynamiki(
                kod=KOD_WIELE_URZADZEN_W_WEZLE,
                komunikat_pl=(
                    "Na jednej szynie stoi więcej niż jedno urządzenie dynamiczne — rozpływ "
                    "podaje moc WYPADKOWĄ szyny, więc podziału tej mocy między urządzenia nie "
                    f"da się wyprowadzić bez zgadywania. Szyny: {'; '.join(kolizje)}."
                ),
                elementy=kolizje,
            )
        )

    return tuple(braki)


# ---------------------------------------------------------------------------
# Punkt pracy z biegu rozpływu
# ---------------------------------------------------------------------------


def odmow_gdy_braki_modelu(enm: EnergyNetworkModel) -> None:
    """Zamień pierwszy brak modelowy na NAZWANĄ odmowę (albo nie rób nic).

    Wołana DWA razy na ścieżce biegu i to jest celowe: raz przez wykonawcę PRZED
    budową grafu IR (mapowanie ENM→graf ma własne, węższe odmowy dla części tych
    samych stanów — np. źródło na nieistniejącej szynie — i bez tego wyprzedzenia
    projektant dostałby komunikat mapowania zamiast kodu biegu czasowego), raz
    przez `zloz_wejscie_dynamiki` (bo adapter wolno wywołać z gotowym grafem, bez
    wykonawcy). Jedno źródło prawdy warunków, dwa miejsca wywołania — nie dwa
    zbiory warunków.
    """
    braki = braki_modelu_dynamiki(enm)
    if braki:
        pierwszy = braki[0]
        raise OdmowaWejsciaDynamiki(pierwszy.kod, pierwszy.komunikat_pl, elementy=pierwszy.elementy)


@dataclass(frozen=True)
class PunktPracyRozplywu:
    """Rozwiązanie rozpływu przełożone na identyfikatory ENM (`ref_id`).

    `napiecia_pu` — fazor napięcia szyny; `wstrzyki_pu` — moc WYPADKOWA szyny w
    konwencji generacji (dodatnia = wstrzyk do sieci), oba w bazie `base_mva`
    TEGO biegu rozpływu (nie z opcji biegu dynamiki: baza jest cechą punktu
    pracy, a dwie bazy tej samej wielkości pu dają trwały błąd skali).
    """

    napiecia_pu: dict[str, complex]
    wstrzyki_pu: dict[str, complex]
    base_mva: float
    run_id: str
    snapshot_hash: str


def punkt_pracy_z_biegu_rozplywu(
    *,
    run_id: str,
    analysis_type: str,
    status: str,
    snapshot_hash: str,
    raw_result: dict[str, Any] | None,
    snapshot: dict[str, Any],
    oczekiwany_snapshot_hash: str,
) -> PunktPracyRozplywu:
    """Punkt pracy z ZAKOŃCZONEGO biegu rozpływu na TEJ SAMEJ migawce.

    Argumenty są rozłożonym `CanonicalRun` (nie samym obiektem), żeby ten moduł
    nie wiązał się z rejestrem biegów: adapter jest funkcją (migawka, opcje,
    dane), a magazyn biegów otwiera wołający.

    Każdy brak kończy się NAZWANĄ odmową: inny rodzaj biegu, bieg niezakończony,
    inna migawka, brak zbieżności, węzły nierozwiązane. Punkt pracy „prawie
    dobry" nie istnieje — bieg dynamiki startowałby wtedy skokiem, a pierwsza
    sekunda przebiegu byłaby artefaktem rozruchu.
    """
    if analysis_type != "PF":
        raise OdmowaWejsciaDynamiki(
            KOD_PUNKT_PRACY_NIE_ROZPLYW,
            f"Bieg {run_id!r} wskazany jako punkt pracy nie jest rozpływem mocy "
            f"(rodzaj: {analysis_type!r})",
            elementy=(run_id,),
        )
    if status != "FINISHED":
        raise OdmowaWejsciaDynamiki(
            KOD_PUNKT_PRACY_NIE_ROZPLYW,
            f"Bieg rozpływu {run_id!r} nie jest zakończony (status: {status!r})",
            elementy=(run_id,),
        )
    if snapshot_hash != oczekiwany_snapshot_hash:
        raise OdmowaWejsciaDynamiki(
            KOD_PUNKT_PRACY_INNA_MIGAWKA,
            f"Bieg rozpływu {run_id!r} był liczony na innej migawce efektywnej "
            f"({snapshot_hash!r}) niż bieg dynamiki ({oczekiwany_snapshot_hash!r}) — punkt "
            "pracy musi pochodzić z TEJ SAMEJ sieci",
            elementy=(run_id,),
        )
    wynik = (raw_result or {}).get("result_v1")
    if not isinstance(wynik, dict):
        raise OdmowaWejsciaDynamiki(
            KOD_PUNKT_PRACY_NIEPELNY,
            f"Bieg rozpływu {run_id!r} nie niesie wyniku w kontrakcie `result_v1`",
            elementy=(run_id,),
        )
    if not wynik.get("converged"):
        raise OdmowaWejsciaDynamiki(
            KOD_PUNKT_PRACY_NIEPELNY,
            f"Bieg rozpływu {run_id!r} nie zbiegł — nie ma punktu pracy do startu",
            elementy=(run_id,),
        )
    nierozwiazane = tuple(sorted(str(pozycja) for pozycja in wynik.get("unsolved_node_ids") or ()))
    if nierozwiazane:
        raise OdmowaWejsciaDynamiki(
            KOD_PUNKT_PRACY_NIEPELNY,
            f"Bieg rozpływu {run_id!r} zostawił węzły bez rozwiązania "
            f"({len(nierozwiazane)}) — punkt pracy nie obejmuje całej sieci",
            elementy=nierozwiazane,
        )

    ref_wezla = {ref_to_graph_id(bus["ref_id"]): str(bus["ref_id"]) for bus in snapshot["buses"]}
    base_mva = float(wynik["base_mva"])
    napiecia: dict[str, complex] = {}
    wstrzyki: dict[str, complex] = {}
    for szyna in wynik.get("bus_results") or []:
        ref_id = ref_wezla.get(str(szyna["bus_id"]))
        if ref_id is None:
            continue
        modul = szyna["v_pu"]
        kat_deg = szyna["angle_deg"]
        moc_p = szyna["p_injected_mw"]
        moc_q = szyna["q_injected_mvar"]
        if modul is None or kat_deg is None or moc_p is None or moc_q is None:
            raise OdmowaWejsciaDynamiki(
                KOD_PUNKT_PRACY_NIEPELNY,
                f"Bieg rozpływu {run_id!r} nie ma kompletu wielkości szyny {ref_id!r} "
                "(moduł/kąt napięcia, moc wypadkowa)",
                elementy=(ref_id,),
            )
        napiecia[ref_id] = cmath.rect(float(modul), math.radians(float(kat_deg)))
        wstrzyki[ref_id] = complex(moc_pu(float(moc_p), base_mva), moc_pu(float(moc_q), base_mva))
    brakujace = tuple(sorted(set(ref_wezla.values()) - set(napiecia)))
    if brakujace:
        raise OdmowaWejsciaDynamiki(
            KOD_PUNKT_PRACY_NIEPELNY,
            f"Bieg rozpływu {run_id!r} nie obejmuje szyn migawki: {', '.join(brakujace)}",
            elementy=brakujace,
        )
    return PunktPracyRozplywu(
        napiecia_pu=napiecia,
        wstrzyki_pu=wstrzyki,
        base_mva=base_mva,
        run_id=run_id,
        snapshot_hash=snapshot_hash,
    )


# ---------------------------------------------------------------------------
# Nastawy numeryczne i scenariusz
# ---------------------------------------------------------------------------

#: Pola nastaw numerycznych, które MUSI podać wołający. Horyzont i krok wyjścia
#: pochodzą ze scenariusza (są cechą scenariusza, nie numeryki), więc ich tu nie ma.
POLA_NASTAW: tuple[str, ...] = (
    "dt_s",
    "dt_min_s",
    "dt_max_s",
    "tolerancja",
    "tolerancja_kroku",
    "eps_init",
    "max_iteracji_newtona",
    "max_nawrotow",
    "integrator",
)

#: Klucz opcji biegu niosący nastawy numeryczne solvera.
KLUCZ_NASTAW = "nastawy_solvera"
#: Klucz opcji biegu niosący scenariusz dynamiczny (projekcja `OperatingScenario.dynamika`).
KLUCZ_SCENARIUSZA = "dynamika"
#: Klucz opcji biegu wskazujący bieg rozpływu, z którego pochodzi punkt pracy.
KLUCZ_BIEGU_ROZPLYWU = "pf_run_id"


def nastawy_z_opcji(options: dict[str, Any], scenariusz: ScenariuszDynamiczny) -> NastawySolvera:
    """`NastawySolvera` z opcji biegu — ZERO domyślek liczbowych w adapterze.

    Brak którejkolwiek nastawy jest brakiem POLA WYMAGANEGO, nie powodem do
    podstawienia „typowej" wartości: krok całkowania i tolerancje rozstrzygają o
    tym, co bieg pokaże, więc podstawione po cichu byłyby cudzą decyzją
    inżynierską zapisaną jako wynik projektanta.
    """
    surowe = options.get(KLUCZ_NASTAW)
    if not isinstance(surowe, dict):
        raise OdmowaWejsciaDynamiki(
            KOD_NASTAWY_BRAK,
            "Bieg dynamiki czasowej wymaga kompletu nastaw numerycznych w opcjach biegu "
            f"(`{KLUCZ_NASTAW}`): {', '.join(POLA_NASTAW)}",
            elementy=POLA_NASTAW,
        )
    brakujace = tuple(pole for pole in POLA_NASTAW if surowe.get(pole) is None)
    if brakujace:
        raise OdmowaWejsciaDynamiki(
            KOD_NASTAWY_BRAK,
            f"Opcje biegu nie niosą nastaw numerycznych: {', '.join(brakujace)}",
            elementy=brakujace,
        )
    nadmiarowe = tuple(sorted(set(surowe) - set(POLA_NASTAW)))
    if nadmiarowe:
        raise OdmowaWejsciaDynamiki(
            KOD_NASTAWY_BRAK,
            f"Opcje biegu niosą nastawy spoza kontraktu solvera: {', '.join(nadmiarowe)}",
            elementy=nadmiarowe,
        )
    return NastawySolvera(
        dt_s=float(surowe["dt_s"]),
        dt_min_s=float(surowe["dt_min_s"]),
        dt_max_s=float(surowe["dt_max_s"]),
        tolerancja=float(surowe["tolerancja"]),
        tolerancja_kroku=float(surowe["tolerancja_kroku"]),
        eps_init=float(surowe["eps_init"]),
        max_iteracji_newtona=int(surowe["max_iteracji_newtona"]),
        max_nawrotow=int(surowe["max_nawrotow"]),
        horyzont_s=float(scenariusz.horyzont_s),
        krok_wyjscia_s=float(scenariusz.krok_wyjscia_s),
        integrator=str(surowe["integrator"]),  # type: ignore[arg-type]
    )


def scenariusz_z_opcji(options: dict[str, Any]) -> ScenariuszDynamiczny:
    """`ScenariuszDynamiczny` z opcji biegu (projekcja `OperatingScenario.dynamika`).

    Walidacja jest kontraktem pydantic (`extra="forbid"`, zakresy, spójność
    horyzontu) — adapter nie ma własnej, równoległej reguły poprawności
    scenariusza.
    """
    surowy = options.get(KLUCZ_SCENARIUSZA)
    if not isinstance(surowy, dict):
        raise OdmowaWejsciaDynamiki(
            KOD_SCENARIUSZ_BRAK,
            "Bieg dynamiki czasowej wymaga scenariusza dynamicznego w opcjach biegu "
            f"(`{KLUCZ_SCENARIUSZA}`: horyzont symulacji, krok wyjścia, harmonogram zdarzeń)",
            elementy=(KLUCZ_SCENARIUSZA,),
        )
    return ScenariuszDynamiczny.model_validate(surowy)


def harmonogram_z_scenariusza(
    scenariusz: ScenariuszDynamiczny,
    *,
    identy_odbiorow: frozenset[str],
    base_mva: float,
) -> HarmonogramDynamiki:
    """`HarmonogramDynamiki` z harmonogramu scenariusza — rodzaj spoza zbioru = odmowa.

    Rdzeń wykonuje pięć rodzajów zdarzeń: założenie zwarcia, zdjęcie zwarcia (wpis
    rozwijany z `t_usuniecia_s`), otwarcie gałęzi, zamknięcie gałęzi, odłączenie
    źródła i skok obciążenia. Komenda regulacji i synchronizacja źródła są w
    kontrakcie danych (W6-1), ale rdzeń ich nie wykonuje — kończą się NAZWANĄ
    odmową, nigdy cichym pominięciem (pominięte zdarzenie zamieniłoby scenariusz
    projektanta w inny scenariusz bez jednego śladu).

    Kolejność ZAPISU jest zachowana (`zdarzenia`, nie `zdarzenia_uporzadkowane`) —
    to ona jest treścią odcisku harmonogramu i rozstrzyga remisy czasowe; sortowanie
    stabilne po czasie robi rdzeń (`zdarzenia.zbuduj_harmonogram`), w jednym miejscu.
    """
    zdarzenia: list[ZdarzenieDynamiki] = []
    for zdarzenie in scenariusz.zdarzenia:
        if isinstance(zdarzenie, Zwarcie):
            zdarzenia.append(
                ZwarcieWezla(
                    t_s=zdarzenie.t_s,
                    wezel=zdarzenie.bus_ref,
                    typ=zdarzenie.typ,
                    r_f_ohm=zdarzenie.r_f_ohm,
                    x_f_ohm=zdarzenie.x_f_ohm,
                    t_usuniecia_s=zdarzenie.t_usuniecia_s,
                )
            )
        elif isinstance(zdarzenie, WylaczenieGalezi | ZalaczenieGalezi):
            zdarzenia.append(
                ZmianaGalezi(
                    t_s=zdarzenie.t_s,
                    galaz=zdarzenie.element_ref,
                    zalaczona=isinstance(zdarzenie, ZalaczenieGalezi),
                )
            )
        elif isinstance(zdarzenie, OdlaczenieZrodlaScenariusza):
            zdarzenia.append(OdlaczenieZrodla(t_s=zdarzenie.t_s, zrodlo=zdarzenie.ref_id))
        elif isinstance(zdarzenie, SkokObciazeniaScenariusza):
            if zdarzenie.ref_id not in identy_odbiorow:
                raise OdmowaWejsciaDynamiki(
                    KOD_SKOK_POZA_ODBIOREM,
                    f"Skok obciążenia w chwili {zdarzenie.t_s} s wskazuje element "
                    f"{zdarzenie.ref_id!r}, który nie jest odbiorem modelu — rdzeń dynamiki "
                    "zmienia skokowo moc ODBIORU; skokowa zmiana nastawy wytwórcy jest "
                    "komendą regulacji, której rdzeń nie wykonuje",
                    elementy=(zdarzenie.ref_id,),
                )
            zdarzenia.append(
                SkokObciazenia(
                    t_s=zdarzenie.t_s,
                    odbior=zdarzenie.ref_id,
                    delta_p_pu=moc_pu(zdarzenie.delta_p_mw, base_mva),
                    delta_q_pu=moc_pu(zdarzenie.delta_q_mvar, base_mva),
                )
            )
        elif isinstance(zdarzenie, KomendaRegulacji | Synchronizacja):
            raise OdmowaWejsciaDynamiki(
                KOD_ZDARZENIE_NIEOBSLUGIWANE,
                f"Zdarzenie {zdarzenie.rodzaj!r} w chwili {zdarzenie.t_s} s jest w kontrakcie "
                "danych, ale rdzeń dynamiki czasowej go nie wykonuje — bieg z takim "
                "harmonogramem liczyłby INNY scenariusz niż zapisany",
                elementy=(zdarzenie.rodzaj,),
            )
        else:  # pragma: no cover — unia zamknięta, gałąź istnieje dla czytelnika
            raise AssertionError(f"Nieznany rodzaj zdarzenia scenariusza: {zdarzenie!r}")
    return HarmonogramDynamiki(zdarzenia=tuple(zdarzenia))


# ---------------------------------------------------------------------------
# Widok sieci: węzły, gałęzie, odsprzęgi, odbiory, urządzenia
# ---------------------------------------------------------------------------

#: Impedancja zastępcza łącznika ZAMKNIĘTEGO [Ω] — ta sama wartość, którą
#: stempluje Y-bus rozpływu (`power_flow_newton_internal._build_ybus_ohm`, zmienna
#: lokalna `Y_CLOSED_SWITCH = 1/(0,0001 + j0,0001)`). Łącznik nie ma impedancji
#: fizycznej; ta wartość jest wyłącznie liczbowym odwzorowaniem zwarcia
#: galwanicznego dwóch szyn w macierzy admitancyjnej. Rozjazd z rozpływem wywala
#: test parytetu Y-bus (`tests/enm/test_adapter_dynamiki.py::TestParytetYbus`).
IMPEDANCJA_LACZNIKA_ZAMKNIETEGO_OHM = complex(0.0001, 0.0001)


@dataclass(frozen=True)
class WidokSieciDynamiki:
    """Elementy sieciowe biegu dynamiki wyprowadzone z migawki i grafu IR."""

    wezly: tuple[WezelDynamiki, ...]
    galezie: tuple[GalazDynamiki, ...]
    odsprzegi: tuple[OdsprzegDynamiki, ...]
    odbiory: tuple[OdbiorDynamiki, ...]


def _napiecie_wezla_kv(graph: NetworkGraph, node_id: str) -> float:
    return float(graph.nodes[node_id].voltage_level)


def _sprawdz_szyny(ref_id: str, szyny_elementu: tuple[str, ...], znane: set[str]) -> None:
    """Element wskazujący szynę spoza modelu = NAZWANA odmowa, nigdy cichy skip.

    `enm/mapping.py` taki element POMIJA przy budowie grafu (`continue`) — dla
    rozpływu to zachowanie zastane, dla biegu czasowego byłoby liczeniem innej
    sieci niż zapisana. Ten sam warunek zgłasza `braki_modelu_dynamiki`, więc
    bramka gotowości i bieg mówią jedno.
    """
    brakujace = tuple(sorted(szyna for szyna in szyny_elementu if szyna not in znane))
    if brakujace:
        raise OdmowaWejsciaDynamiki(
            KOD_ELEMENT_BEZ_SZYNY,
            f"Element {ref_id!r} wskazuje szynę spoza modelu: {', '.join(brakujace)}",
            elementy=tuple(f"{ref_id} -> {szyna}" for szyna in brakujace),
        )


def _przekladnia_zespolona(graph: NetworkGraph, branch: TransformerBranch) -> complex:
    """Przekładnia zespolona `a = |t|·e^{-jθ}` gałęzi transformatorowej.

    Moduł: zaczep (`get_tap_ratio`) razy przekładnia POZA-ZNAMIONOWA wynikająca z
    różnicy między tabliczką a napięciami znamionowymi szyn — dokładnie ten sam
    iloczyn, który składa Y-bus rozpływu. Kąt: przesunięcie fazowe grupy połączeń
    (`transformer_phase_shift_rad`, jedno źródło prawdy dla obu torów).
    """
    u_hv = _napiecie_wezla_kv(graph, branch.from_node_id)
    u_lv = _napiecie_wezla_kv(graph, branch.to_node_id)
    modul = branch.get_tap_ratio()
    if u_hv > 0.0 and u_lv > 0.0:
        modul = modul * ((branch.voltage_hv_kv / u_hv) / (branch.voltage_lv_kv / u_lv))
    return modul * cmath.exp(-1j * transformer_phase_shift_rad(branch.vector_group))


def zloz_widok_sieci(
    snapshot: dict[str, Any], graph: NetworkGraph, *, base_mva: float
) -> WidokSieciDynamiki:
    """Węzły, gałęzie (model pi z przekładnią zespoloną), odsprzęgi i odbiory.

    Kolejność KAŻDEJ krotki jest kolejnością `ref_id` z migawki — indeksacja
    węzłów rdzenia jest kolejnością zapisu, więc deterministyczne wejście daje
    deterministyczną macierz i deterministyczny odcisk migawki.
    """
    enm = EnergyNetworkModel.model_validate(snapshot)
    wezly = tuple(
        WezelDynamiki(ident=bus.ref_id, u_n_kv=float(bus.voltage_kv))
        for bus in sorted(enm.buses, key=lambda b: b.ref_id)
    )
    znane_szyny = {wezel.ident for wezel in wezly}

    galezie: list[GalazDynamiki] = []
    for branch in sorted(enm.branches, key=lambda b: b.ref_id):
        _sprawdz_szyny(branch.ref_id, (branch.from_bus_ref, branch.to_bus_ref), znane_szyny)
        element_id = ref_to_graph_id(branch.ref_id)
        if isinstance(branch, OverheadLine | Cable):
            linia = graph.branches.get(element_id)
            if not isinstance(linia, LineBranch):
                raise OdmowaWejsciaDynamiki(
                    KOD_GALAZ_NIEOBSLUGIWANA,
                    f"Gałąź {branch.ref_id!r} nie ma odwzorowania w modelu obliczeniowym",
                    elementy=(branch.ref_id,),
                )
            if not linia.in_service:
                continue
            z_bazowa = impedancja_z_napiecia_i_mocy_ohm(
                _napiecie_wezla_kv(graph, linia.to_node_id), base_mva
            )
            galezie.append(
                GalazDynamiki(
                    ident=branch.ref_id,
                    wezel_od=branch.from_bus_ref,
                    wezel_do=branch.to_bus_ref,
                    y_szeregowa_pu=linia.get_series_admittance() * z_bazowa,
                    b_poprzeczna_pu=(linia.get_shunt_admittance() * z_bazowa).imag,
                    przekladnia=complex(1.0, 0.0),
                )
            )
        elif isinstance(branch, SwitchBranch | FuseBranch):
            lacznik = graph.switches.get(element_id)
            if lacznik is None:
                # Ta sama reakcja, co dla linii i transformatora bez odwzorowania —
                # brak elementu w modelu obliczeniowym jest niespójnością wejścia,
                # nie stanem ruchowym (stany ruchowe to `in_service`/`state` niżej).
                raise OdmowaWejsciaDynamiki(
                    KOD_GALAZ_NIEOBSLUGIWANA,
                    f"Łącznik {branch.ref_id!r} nie ma odwzorowania w modelu obliczeniowym",
                    elementy=(branch.ref_id,),
                )
            if not lacznik.in_service or lacznik.state != SwitchState.CLOSED:
                continue
            z_bazowa = impedancja_z_napiecia_i_mocy_ohm(
                _napiecie_wezla_kv(graph, lacznik.to_node_id), base_mva
            )
            galezie.append(
                GalazDynamiki(
                    ident=branch.ref_id,
                    wezel_od=branch.from_bus_ref,
                    wezel_do=branch.to_bus_ref,
                    y_szeregowa_pu=z_bazowa / IMPEDANCJA_LACZNIKA_ZAMKNIETEGO_OHM,
                    b_poprzeczna_pu=0.0,
                    przekladnia=complex(1.0, 0.0),
                )
            )
        else:
            raise OdmowaWejsciaDynamiki(
                KOD_GALAZ_NIEOBSLUGIWANA,
                f"Gałąź {branch.ref_id!r} rodzaju {branch.type!r} nie ma odwzorowania w "
                "modelu pi rdzenia dynamiki",
                elementy=(branch.ref_id,),
            )

    for trafo in sorted(enm.transformers, key=lambda t: t.ref_id):
        _sprawdz_szyny(trafo.ref_id, (trafo.hv_bus_ref, trafo.lv_bus_ref), znane_szyny)
        element = graph.branches.get(ref_to_graph_id(trafo.ref_id))
        if not isinstance(element, TransformerBranch):
            raise OdmowaWejsciaDynamiki(
                KOD_GALAZ_NIEOBSLUGIWANA,
                f"Transformator {trafo.ref_id!r} nie ma odwzorowania w modelu obliczeniowym",
                elementy=(trafo.ref_id,),
            )
        if not element.in_service:
            continue
        z_bazowa = impedancja_z_napiecia_i_mocy_ohm(
            _napiecie_wezla_kv(graph, element.to_node_id), base_mva
        )
        impedancja_ohm = element.get_short_circuit_impedance_ohm_lv()
        if impedancja_ohm == 0:
            raise OdmowaWejsciaDynamiki(
                KOD_GALAZ_NIEOBSLUGIWANA,
                f"Transformator {trafo.ref_id!r} ma zerową impedancję zwarciową — "
                "gałąź bez impedancji nie ma skończonej admitancji",
                elementy=(trafo.ref_id,),
            )
        galezie.append(
            GalazDynamiki(
                ident=trafo.ref_id,
                wezel_od=trafo.hv_bus_ref,
                wezel_do=trafo.lv_bus_ref,
                y_szeregowa_pu=z_bazowa / impedancja_ohm,
                b_poprzeczna_pu=0.0,
                przekladnia=_przekladnia_zespolona(graph, element),
            )
        )

    odsprzegi = tuple(
        OdsprzegDynamiki(
            ident=bateria.ref_id,
            wezel=bateria.bus_ref,
            g_pu=0.0,
            b_pu=moc_pu(_moc_baterii_mvar(bateria), base_mva),
        )
        for bateria in sorted(enm.shunt_capacitors, key=lambda s: s.ref_id)
        if bateria.status == "closed"
    )

    odbiory = tuple(
        OdbiorDynamiki(
            ident=odbior.ref_id,
            wezel=odbior.bus_ref,
            p_pu=moc_pu(float(odbior.p_mw), base_mva),
            q_pu=moc_pu(float(odbior.q_mvar), base_mva),
        )
        for odbior in sorted(enm.loads, key=lambda load: load.ref_id)
    )
    return WidokSieciDynamiki(
        wezly=wezly, galezie=tuple(galezie), odsprzegi=odsprzegi, odbiory=odbiory
    )


def _moc_baterii_mvar(bateria: ShuntCapacitor) -> float:
    """Moc bierna baterii kondensatorów [Mvar] — ta sama liczba, którą rozpływ
    stempluje jako `b_pu` (`enm/assembler.py::_build_shunt_specs_from_snapshot`)."""
    return float(bateria.rated_mvar)


# ---------------------------------------------------------------------------
# Urządzenia
# ---------------------------------------------------------------------------


def _moc_urzadzenia_pu(
    *,
    szyna: str,
    punkt: PunktPracyRozplywu,
    odbiory: tuple[OdbiorDynamiki, ...],
) -> complex:
    """Moc oddawana przez urządzenie szyny = wstrzyk wypadkowy + moc odbiorów szyny.

    JEDEN predykat podziału mocy węzła (patrz docstring modułu): prąd urządzenia i
    prądy odbiorów sumują się dokładnie do wstrzyku węzłowego rozpływu, więc punkt
    pracy JEST równowagą układu DAE niezależnie od tego, czy moc bierna źródła
    pochodzi z nastawy, z regulacji napięcia, z kształtowania falownika, czy z
    bilansu szyny zasilającej.
    """
    moc_odbiorow = sum(
        (complex(odbior.p_pu, odbior.q_pu) for odbior in odbiory if odbior.wezel == szyna),
        complex(0.0, 0.0),
    )
    return punkt.wstrzyki_pu[szyna] + moc_odbiorow


def zloz_urzadzenia(
    snapshot: dict[str, Any],
    graph: NetworkGraph,
    *,
    punkt: PunktPracyRozplywu,
    odbiory: tuple[OdbiorDynamiki, ...],
    base_mva: float,
    f_bazowa_hz: float,
) -> tuple[Urzadzenie, ...]:
    """Urządzenia dynamiczne: źródła sieciowe jako szyny sztywne, wytwórcy przez fabrykę.

    Fabryka (`solvers/dynamika/urzadzenia/fabryka.py::zbuduj_urzadzenie`) jest
    JEDYNYM szwem między kontraktem danych a rdzeniem — adapter nie zna ani jednej
    klasy urządzenia i nie ma gdzie „poprawić" fizyki. Źródło sieciowe nie ma bloku
    `ParametryDynamiczne` (nie jest wytwórcą projektu, jest warunkiem brzegowym), więc
    idzie własnym, jawnym konstruktorem szyny sztywnej.
    """
    enm = EnergyNetworkModel.model_validate(snapshot)
    urzadzenia: list[Urzadzenie] = []

    impedancje_zrodel = {zrodlo.name: zrodlo.z_ohm for zrodlo in graph.get_grid_sc_sources()}
    for zrodlo in sorted(enm.sources, key=lambda s: s.ref_id):
        z_ohm = _impedancja_zrodla_ohm(zrodlo, impedancje_zrodel)
        if z_ohm is None or z_ohm == 0:
            raise OdmowaWejsciaDynamiki(
                KOD_ZRODLO_BEZ_IMPEDANCJI,
                f"Źródło sieciowe {zrodlo.ref_id!r} nie ma impedancji zastępczej "
                "(moc zwarciowa albo R/X) — sieć nadrzędna o nieskończonej mocy zwarciowej "
                "nie ma skończonej admitancji, więc nie da się jej postawić jako warunku "
                "brzegowego biegu czasowego",
                elementy=(zrodlo.ref_id,),
            )
        z_bazowa = impedancja_z_napiecia_i_mocy_ohm(
            _napiecie_wezla_kv(graph, ref_to_graph_id(zrodlo.bus_ref)), base_mva
        )
        z_pu = z_ohm / z_bazowa
        urzadzenia.append(
            zbuduj_szyne_sztywna(
                ident=zrodlo.ref_id,
                wezel=zrodlo.bus_ref,
                # Impedancja jest JUŻ w bazie układu (przeliczona wyżej bazą szyny
                # przyłączenia), więc przelicznik bazy fabryki jest tożsamością.
                s_zwarciowa_mva=base_mva,
                r_pu=z_pu.real,
                x_pu=z_pu.imag,
                s_bazowa_mva=base_mva,
            )
        )

    for gen in sorted(enm.generators, key=lambda g: g.ref_id):
        parametry = gen.dynamika
        if parametry is None:
            raise OdmowaWejsciaDynamiki(
                KOD_ZRODLO_BEZ_DYNAMIKI,
                f"Wytwórca {gen.ref_id!r} nie ma bloku parametrów dynamicznych — bieg "
                "czasowy nie ma z czego zbudować jego modelu",
                elementy=(gen.ref_id,),
            )
        urzadzenia.append(
            zbuduj_urzadzenie(
                parametry,
                ident=gen.ref_id,
                wezel=gen.bus_ref,
                s_bazowa_mva=base_mva,
                f_bazowa_hz=f_bazowa_hz,
                punkt_pracy_wezla=PunktPracyUrzadzenia(
                    napiecie_pu=punkt.napiecia_pu[gen.bus_ref],
                    moc_pu=_moc_urzadzenia_pu(szyna=gen.bus_ref, punkt=punkt, odbiory=odbiory),
                ),
            )
        )
    return tuple(urzadzenia)


def _impedancja_zrodla_ohm(
    zrodlo: Source, impedancje_po_nazwie: dict[str, complex]
) -> complex | None:
    """Impedancja zgodna źródła [Ω] z grafu IR — TA SAMA, którą widzi zwarcie.

    Graf nazywa źródło zwarciowe nazwą elementu ENM albo (przy pustej nazwie) jego
    `ref_id` — `enm/mapping.py` buduje je dokładnie tak. Wyprowadzanie impedancji
    drugą drogą (z `sk3_mva`/`rx_ratio` wprost) byłoby DRUGĄ PRAWDĄ o tym samym
    źródle i pierwsza rozbieżność scenariusza c-max/c-min rozjechałaby oba tory.
    """
    for klucz in (zrodlo.name, zrodlo.ref_id):
        if klucz and klucz in impedancje_po_nazwie:
            return impedancje_po_nazwie[klucz]
    return None


# ---------------------------------------------------------------------------
# Złożenie całości
# ---------------------------------------------------------------------------


def zloz_wejscie_dynamiki(
    snapshot: dict[str, Any],
    options: dict[str, Any],
    *,
    punkt: PunktPracyRozplywu,
    graph: NetworkGraph,
    f_bazowa_hz: float,
) -> WejscieDynamiki:
    """Kompletne wejście rdzenia dynamiki z migawki efektywnej, opcji i punktu pracy.

    `graph` jest grafem IR zbudowanym z TEJ SAMEJ migawki, którą liczył rozpływ —
    admitancje gałęzi czyta się z niego, a nie z drugiego przebiegu mapowania.
    """
    odmow_gdy_braki_modelu(EnergyNetworkModel.model_validate(snapshot))

    base_mva = punkt.base_mva
    scenariusz = scenariusz_z_opcji(options)
    nastawy = nastawy_z_opcji(options, scenariusz)
    widok = zloz_widok_sieci(snapshot, graph, base_mva=base_mva)
    urzadzenia = zloz_urzadzenia(
        snapshot,
        graph,
        punkt=punkt,
        odbiory=widok.odbiory,
        base_mva=base_mva,
        f_bazowa_hz=f_bazowa_hz,
    )
    harmonogram = harmonogram_z_scenariusza(
        scenariusz,
        identy_odbiorow=frozenset(odbior.ident for odbior in widok.odbiory),
        base_mva=base_mva,
    )
    moce_zrodel = {
        urzadzenie.ident: _moc_urzadzenia_pu(
            szyna=urzadzenie.wezel, punkt=punkt, odbiory=widok.odbiory
        )
        for urzadzenie in urzadzenia
    }
    return WejscieDynamiki(
        wezly=widok.wezly,
        galezie=widok.galezie,
        odsprzegi=widok.odsprzegi,
        odbiory=widok.odbiory,
        urzadzenia=urzadzenia,
        punkt_pracy=PunktPracy(napiecia_pu=dict(punkt.napiecia_pu), moce_zrodel_pu=moce_zrodel),
        harmonogram=harmonogram,
        nastawy=nastawy,
        s_bazowa_mva=base_mva,
        f_bazowa_hz=f_bazowa_hz,
    )


def zalozenia_wejscia(snapshot: dict[str, Any]) -> tuple[str, ...]:
    """Założenia ADAPTERA (nie rdzenia) — jawne, deterministyczne, po polsku.

    Proweniencja parametrów dynamicznych KAŻDEGO wytwórcy wchodzi tutaj, bo
    decyduje o tym, jak wolno czytać wynik: przebieg policzony z profilu typowego
    normy jest wynikiem modelu zbudowanego z deklaracji, nie z pomiaru jednostki.
    """
    enm = EnergyNetworkModel.model_validate(snapshot)
    zalozenia = [
        "Punkt pracy pochodzi z biegu rozpływu na tej samej migawce efektywnej "
        "(zero płaskiego startu).",
        "Impedancja zastępcza sieci nadrzędnej jest tą samą impedancją, którą model "
        "podaje obliczeniom zwarciowym (Z_Q wg IEC 60909).",
        "Łącznik zamknięty wchodzi do macierzy admitancyjnej jako gałąź o impedancji "
        "zastępczej łącznika — tak samo jak w rozpływie mocy.",
    ]
    for gen in sorted(enm.generators, key=lambda g: g.ref_id):
        if gen.dynamika is None:  # pragma: no cover — odmowa zadziałałaby wcześniej
            continue
        proweniencja = gen.dynamika.proweniencja
        zalozenia.append(
            f"Parametry dynamiczne wytwórcy {gen.ref_id}: {proweniencja.zrodlo} "
            f"({proweniencja.odniesienie})."
        )
    return tuple(zalozenia)


__all__ = [
    "IMPEDANCJA_LACZNIKA_ZAMKNIETEGO_OHM",
    "KLUCZ_BIEGU_ROZPLYWU",
    "KLUCZ_NASTAW",
    "KLUCZ_SCENARIUSZA",
    "KODY_ODMOW_ADAPTERA",
    "KOD_ELEMENT_BEZ_SZYNY",
    "KOD_GALAZ_NIEOBSLUGIWANA",
    "KOD_NASTAWY_BRAK",
    "KOD_ODBIOR_ZIP",
    "KOD_PUNKT_PRACY_BRAK",
    "KOD_PUNKT_PRACY_INNA_MIGAWKA",
    "KOD_PUNKT_PRACY_NIEPELNY",
    "KOD_PUNKT_PRACY_NIE_ROZPLYW",
    "KOD_RODZINA_BEZ_MODELU",
    "KOD_SCENARIUSZ_BRAK",
    "KOD_SKOK_POZA_ODBIOREM",
    "KOD_WIELE_URZADZEN_W_WEZLE",
    "KOD_ZDARZENIE_NIEOBSLUGIWANE",
    "KOD_ZRODLO_BEZ_DYNAMIKI",
    "KOD_ZRODLO_BEZ_IMPEDANCJI",
    "POLA_NASTAW",
    "BrakDynamiki",
    "OdmowaWejsciaDynamiki",
    "PunktPracyRozplywu",
    "WidokSieciDynamiki",
    "braki_modelu_dynamiki",
    "odmow_gdy_braki_modelu",
    "harmonogram_z_scenariusza",
    "nastawy_z_opcji",
    "punkt_pracy_z_biegu_rozplywu",
    "scenariusz_z_opcji",
    "zalozenia_wejscia",
    "zloz_urzadzenia",
    "zloz_wejscie_dynamiki",
    "zloz_widok_sieci",
]
