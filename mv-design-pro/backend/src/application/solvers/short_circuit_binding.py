"""
Warstwa wiązania solvera IEC 60909 dla pakietów dowodowych zwarć.

Funkcje ``wynik_zwarcia_1f_ze_snapshotu`` i ``zwarcie_3f_ze_snapshotu`` mapują migawkę
ENM na graf i wołają zamrożony solver IEC 60909 dla pakietów dowodowych SC1/SC3F —
pakiet dowodowy opisuje wynik, nie produkuje go.

Karta RESULTSET-MARTWE-MAPPERY (2026-09-30, zgoda B-01 w decyzji O-59): typ
``ShortCircuitBindingResult`` skasowany razem z jedynymi konsumentami — martwymi
mapperami ``short_circuit_to_resultset_v1.py`` i ``sc_binding_meta.py``. Jedynym
producentem ``ResultSetV1`` jest ``application/result_mapping/canonical_run_to_resultset_v1.py``;
bramka wskrzeszenia: ``scripts/resultset_v1_schema_guard.py``.

Karta TORY-TYLKO-W-TESTACH (2026-09-30): dawny punkt wejścia ``execute_short_circuit``
(ścieżka execution engine, skasowanego kartą CV-3.3-A) z własną regułą rozstrzygania c
(``_resolve_c_factor`` — override liczony względem domyślnej klasy ``StudyCaseConfig``)
skasowany: nie miał konsumenta w produkcie. Zwarcia liczy bieg kanoniczny
(``enm/canonical_analysis.py::_execute_short_circuit`` → ``enm/assembler.py::
zloz_wejscie_zwarcia``: c per pasmo z ``voltage_factor.dobierz_c``, nadpisanie wyłącznie
``nadpisanie_c`` z uzasadnieniem, scenariusz MIN z ``build_min_scenario_graph``). Bramka wskrzeszenia:
``scripts/legacy_public_path_guard.py``.

Karta TB-WARTOSC-ROBOCZA (B-01 (n)): czas wyłączenia t_b rozstrzyga się PER PUNKT ZWARCIA
jedną funkcją (``czas_tb_punktu``): t_b scenariusza projektanta > najkrótszy czas wyłączenia
pól lokalnych punktu (``application.analyses.protection.czas_wylaczenia_pola``) > wartość
robocza 0,1 s (``network_model.core.czas_wylaczenia``). Dyspozycja rodzaju zwarcia do rdzenia
(``wynik_zwarcia_punktu``) żyje tu, nie w biegu kanonicznym. Bieg, wkłady na żądanie
i pakiety dowodowe rozstrzygają t_b TĄ SAMĄ funkcją, więc t_b wiersza, dowodu i rozbicia
maszyn nie mogą się rozjechać; pakiety SC1/SC3F wołają rdzeń bezpośrednio (ustalony rodzaj
zwarcia), bo granica odmów B-01 obejmuje wyłącznie jedno wywołanie rdzenia.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from enm.tolerancja_nn import dobierz_c_wezla
from enm.zdania_odmow_rdzenia import nazwy_w_odmowach_rdzenia
from network_model.core.czas_wylaczenia import (
    KLUCZ_OPCJI_CZASU_TB,
    CzasWylaczeniaTb,
    czas_tb_projektanta,
    czas_tb_roboczy,
)
from network_model.core.graph import NetworkGraph
from network_model.core.voltage_factor import DoborC, NadpisanieC, Scenario
from network_model.odmowa_danych import odmowa_rdzenia_b01
from network_model.solvers.short_circuit_core import (
    ShortCircuitType,
    odmowa_wezla_zwarcia_spoza_grafu,
)
from network_model.solvers.short_circuit_iec60909 import (
    ShortCircuitIEC60909Solver,
    ShortCircuitResult,
)

if TYPE_CHECKING:
    from application.analyses.protection.czas_wylaczenia_pola import PoleLokalne
    from enm.assembler import WejscieZwarcia

#: Rodzaj zwarcia w dopełniaczu — zdanie opisu prądu, przy którym sprawdzono charakterystykę.
_RODZAJ_ZWARCIA_PL: dict[ShortCircuitType, str] = {
    ShortCircuitType.THREE_PHASE: "trójfazowego",
    ShortCircuitType.SINGLE_PHASE_GROUND: "jednofazowego z ziemią",
    ShortCircuitType.TWO_PHASE: "dwufazowego",
    ShortCircuitType.TWO_PHASE_GROUND: "dwufazowego z ziemią",
}


def pola_lokalne_biegu(wejscie: WejscieZwarcia) -> Mapping[str, tuple[PoleLokalne, ...]] | None:
    """Mapa węzeł → pola lokalne zbudowana RAZ na bieg (karta TB-WARTOSC-ROBOCZA).

    ``None`` — scenariusz podaje t_b projektanta, więc pól nie trzeba czytać (pierwszeństwo
    (a) rozstrzyga każdy punkt). Import leniwy z tego samego powodu co w ``czas_tb_punktu``.
    """
    if wejscie.tb_projektanta_s is not None:
        return None
    from application.analyses.protection.czas_wylaczenia_pola import pola_lokalne_wezlow

    return pola_lokalne_wezlow(wejscie.enm)


def czas_tb_punktu(
    wejscie: WejscieZwarcia,
    node_id: str,
    *,
    c_factor: float,
    z_f_ohm: complex | None,
    pola_lokalne: Mapping[str, tuple[PoleLokalne, ...]] | None = None,
    granica_b01: bool = False,
) -> CzasWylaczeniaTb:
    """t_b punktu zwarcia z pochodzeniem — JEDYNE rozstrzygnięcie (karta TB-WARTOSC-ROBOCZA).

    Pierwszeństwo (§0.1): (a) t_b scenariusza projektanta (``WejscieZwarcia.
    tb_projektanta_s``, reguła danych ``czas_tb_z_danych``) — dla wszystkich punktów;
    (b) najkrótszy czas wyłączenia pól lokalnych punktu (wzorzec PowerFactory „break time:
    min. of local”) przy prądzie I_k'' punktu z rdzenia (``prad_poczatkowy_a`` — ta sama
    liczba co ``ikss_a`` wiersza; I_k'' nie zależy od t_b); (c) wartość robocza 0,1 s.

    ``pola_lokalne`` — mapa węzeł → pola lokalne zbudowana RAZ na bieg
    (``pola_lokalne_wezlow``); ``None`` = zbuduj z modelu wejścia (wołający jednego punktu).
    Import warstwy pól jest leniwy: ``czas_wylaczenia_pola`` czyta pola przez
    ``application.field_read_model``, który ładuje bieg kanoniczny — a bieg ładuje ten moduł.

    ``granica_b01`` — wołający pakietu dowodowego i wkładów na żądanie tłumaczy ``ValueError``
    rdzenia na odmowę danych (``odmowa_rdzenia_b01``); granica obejmuje WYŁĄCZNIE wywołanie
    rdzenia (``polykanie_wyjatkow_guard``), więc stoi tutaj, wokół jedynego wywołania rdzenia
    tej funkcji, a nie u wołającego wokół całego rozstrzygnięcia. Bieg kanoniczny granicy nie
    stawia (surowy ``ValueError`` rdzenia jest w biegu błędem programu). Argumenty rdzenia
    budowane raz — obie gałęzie wołają rdzeń z tym samym wejściem.
    """
    if wejscie.tb_projektanta_s is not None:
        return czas_tb_projektanta(wejscie.tb_projektanta_s)
    from application.analyses.protection.czas_wylaczenia_pola import (
        czas_tb_z_pol_lokalnych,
        pola_lokalne_wezlow,
    )

    mapa = pola_lokalne if pola_lokalne is not None else pola_lokalne_wezlow(wejscie.enm)
    pola = mapa.get(node_id, ())
    if not pola:
        return czas_tb_roboczy(
            "do szyny punktu zwarcia nie jest przyłączone żadne pole stacji z aparatem "
            "z katalogu"
        )
    argumenty_rdzenia: dict[str, Any] = {
        "short_circuit_type": wejscie.short_circuit_type,
        "graph": wejscie.solve_graph,
        "fault_node_id": node_id,
        "c_factor": c_factor,
        "z0_bus": wejscie.z0_bus,
        "z_f_ohm": z_f_ohm,
    }
    if granica_b01:
        with odmowa_rdzenia_b01():
            prad_a = ShortCircuitIEC60909Solver.prad_poczatkowy_a(**argumenty_rdzenia)
    else:
        prad_a = ShortCircuitIEC60909Solver.prad_poczatkowy_a(**argumenty_rdzenia)
    return czas_tb_z_pol_lokalnych(
        wejscie.enm,
        pola,
        prad_a=prad_a,
        rodzaj_zwarcia_pl=_RODZAJ_ZWARCIA_PL[wejscie.short_circuit_type],
    )


def wynik_zwarcia_punktu(
    wejscie: WejscieZwarcia,
    node_id: str,
    *,
    c_factor: float,
    czas_tb: CzasWylaczeniaTb,
    wklady: bool,
    z_f_ohm: complex | None,
) -> ShortCircuitResult:
    """Dyspozycja rodzaju zwarcia do FROZEN solvera IEC 60909 — JEDNA dla biegu, wkładów na
    żądanie i pakietów dowodowych (bez granicy odmów — tę stawia wołający)."""
    typ = wejscie.short_circuit_type
    if typ == ShortCircuitType.THREE_PHASE:
        return ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=wejscie.solve_graph,
            fault_node_id=node_id,
            c_factor=c_factor,
            tk_s=wejscie.tk_s,
            czas_tb=czas_tb,
            include_branch_contributions=wklady,
            z_f_ohm=z_f_ohm,
        )
    if typ == ShortCircuitType.SINGLE_PHASE_GROUND:
        return ShortCircuitIEC60909Solver.compute_1ph_short_circuit(
            graph=wejscie.solve_graph,
            fault_node_id=node_id,
            c_factor=c_factor,
            tk_s=wejscie.tk_s,
            czas_tb=czas_tb,
            z0_bus=wejscie.z0_bus,
            include_branch_contributions=wklady,
            z_f_ohm=z_f_ohm,
        )
    if typ == ShortCircuitType.TWO_PHASE:
        return ShortCircuitIEC60909Solver.compute_2ph_short_circuit(
            graph=wejscie.solve_graph,
            fault_node_id=node_id,
            c_factor=c_factor,
            tk_s=wejscie.tk_s,
            czas_tb=czas_tb,
            include_branch_contributions=wklady,
            z_f_ohm=z_f_ohm,
        )
    return ShortCircuitIEC60909Solver.compute_2ph_ground_short_circuit(
        graph=wejscie.solve_graph,
        fault_node_id=node_id,
        c_factor=c_factor,
        tk_s=wejscie.tk_s,
        czas_tb=czas_tb,
        z0_bus=wejscie.z0_bus,
        include_branch_contributions=wklady,
        z_f_ohm=z_f_ohm,
    )


def _wejscie_pakietu(
    *,
    snapshot: dict[str, Any],
    fault_type: str,
    scenariusz: Scenario,
    nadpisanie_c: NadpisanieC | None,
    tk_s: float,
    tb_s: float | None,
    rozszerzenia_audit2: dict[str, Any] | None,
) -> WejscieZwarcia:
    """Wejście zwarciowe pakietu dowodowego — TEN SAM assembler co bieg kanoniczny.

    Karta WSPOLCZYNNIK-C-JEDEN-NOSNIK: pakiet dowodowy dotąd mapował snapshot sam
    (zawsze graf MAX, c podane liczbą przez wołającego, domyślnie 1,10). Dla biegu MIN
    liczył więc INNĄ fizykę niż bieg (bez korekty R_θ i Z_Qmin), a dla węzła nN c z SN.
    Teraz graf solvera, Z0 i dobór c pochodzą z ``enm.assembler.zloz_wejscie_zwarcia``
    — jedna ścieżka fizyki dla biegu i dla jego dowodu.
    """
    from enm.assembler import zloz_wejscie_zwarcia

    opcje: dict[str, Any] = {
        "fault_type": fault_type,
        "scenario": scenariusz.lower(),
        "thermal_time_seconds": tk_s,
    }
    if tb_s is not None:
        # Karta SC-IB-ITH-ZRODLA: t_b biegu, którego dowód powstaje — ta sama reguła danych
        # i ten sam klucz opcji co bieg. Brak = rozstrzygnięcie punktu (`czas_tb_punktu`:
        # pola lokalne albo wartość robocza), jak w biegu (karta TB-WARTOSC-ROBOCZA).
        opcje[KLUCZ_OPCJI_CZASU_TB] = tb_s
    if nadpisanie_c is not None:
        opcje["nadpisanie_c"] = nadpisanie_c.to_dict()
    return zloz_wejscie_zwarcia(snapshot, opcje, rozszerzenia_audit2=rozszerzenia_audit2)


def _dobor_c_wezla(wejscie: WejscieZwarcia, fault_node_id: str) -> DoborC:
    """c węzła zwarcia pakietu — ``voltage_factor.dobierz_c``, jak w biegu.

    Węzeł spoza grafu: ta sama odmowa strukturalna co rdzeń (identyfikator w odwołaniu
    rekordu, nie w treści — decyzja O-59, §12.2 (k)).
    """
    if fault_node_id not in wejscie.graph.nodes:
        raise odmowa_wezla_zwarcia_spoza_grafu(fault_node_id)
    return dobierz_c_wezla(
        wejscie.graph.nodes[fault_node_id], wejscie.scenario_c, wejscie.nadpisanie_c
    )


@dataclass(frozen=True)
class Zwarcie1FZeSnapshotu:
    """FROZEN wynik zwarcia 1F z doborem c (wartość i podstawa) dla dowodu."""

    wynik: ShortCircuitResult
    dobor_c: DoborC


def wynik_zwarcia_1f_ze_snapshotu(
    *,
    snapshot: dict[str, Any],
    fault_node_id: str,
    scenariusz: Scenario,
    nadpisanie_c: NadpisanieC | None,
    tk_s: float,
    tb_s: float | None,
    rozszerzenia_audit2: dict[str, Any] | None = None,
    z_f_ohm: complex | None = None,
) -> Zwarcie1FZeSnapshotu:
    """FROZEN wynik zwarcia 1F ze snapshotu ENM — impedancje składowe Z1/Z2/Z0.

    PO CO TA FUNKCJA (2026-08-07, naprawa czerwonej bramki po karcie PACK-DOWODY).
    Pakiet dowodowy zwarć niesymetrycznych potrzebuje Z1/Z2/Z0, a sieć zerową
    liczy WYŁĄCZNIE wariant jednofazowy — przebieg 3F ich nie produkuje. Fizyka
    (mapowanie snapshotu, macierz zerowa, wejście w solver) stoi w warstwie wiązania,
    pakiet dostaje gotowy FROZEN wynik i tylko go opisuje (`no_direct_fault_params_guard`,
    „Proof Engine reads results READ-ONLY").

    Karta WSPOLCZYNNIK-C-JEDEN-NOSNIK: graf, Z0 i c z assemblera biegu
    (``_wejscie_pakietu``); ``tb_s`` — t_b scenariusza biegu (``None`` = t_b punktu
    rozstrzyga ``czas_tb_punktu``, jak w biegu — karta TB-WARTOSC-ROBOCZA).
    """
    wejscie = _wejscie_pakietu(
        snapshot=snapshot,
        fault_type="1F",
        scenariusz=scenariusz,
        nadpisanie_c=nadpisanie_c,
        tk_s=tk_s,
        tb_s=tb_s,
        rozszerzenia_audit2=rozszerzenia_audit2,
    )
    dobor_c = _dobor_c_wezla(wejscie, fault_node_id)
    # Solver IEC 60909 jest rdzeniem B-01: odmowę wejścia (węzeł zwarcia spoza grafu, gałąź
    # bez nazwy) podnosi rekordem strukturalnym (decyzja O-59) — pierwsza granica składa zdanie
    # z nazwami z grafu solvera (jak bieg kanoniczny), druga tłumaczy inne `ValueError` rdzenia
    # na odmowę danych (karta ODMOWA-DANYCH-422).
    with nazwy_w_odmowach_rdzenia(wejscie.solve_graph):
        czas_tb = czas_tb_punktu(
            wejscie, fault_node_id, c_factor=dobor_c.wartosc, z_f_ohm=z_f_ohm, granica_b01=True
        )
    with nazwy_w_odmowach_rdzenia(wejscie.solve_graph), odmowa_rdzenia_b01():
        wynik = ShortCircuitIEC60909Solver.compute_1ph_short_circuit(
            graph=wejscie.solve_graph,
            fault_node_id=fault_node_id,
            c_factor=dobor_c.wartosc,
            tk_s=wejscie.tk_s,
            czas_tb=czas_tb,
            z0_bus=wejscie.z0_bus,
            z_f_ohm=z_f_ohm,
        )
    return Zwarcie1FZeSnapshotu(wynik=wynik, dobor_c=dobor_c)


@dataclass(frozen=True)
class ZwarcieZeSnapshotu:
    """FROZEN wynik zwarcia razem z grafem, na którym powstał, i doborem c.

    Graf wraca do wołającego CELOWO: rozbicie per-maszyna (`compute_machine_contributions`)
    musi liczyć się na TYM SAMYM grafie co zwarcie. Zbudowanie drugiego z tego samego
    snapshotu dałoby dwa źródła prawdy (reguła KLASA §3 — predykaty parami z jednego
    źródła). ``dobor_c`` niesie wartość c i jej podstawę (White Box) do dowodu.
    """

    wynik: ShortCircuitResult
    graf: NetworkGraph
    dobor_c: DoborC


def zwarcie_3f_ze_snapshotu(
    *,
    snapshot: dict[str, Any],
    fault_node_id: str,
    scenariusz: Scenario,
    nadpisanie_c: NadpisanieC | None,
    tk_s: float,
    tb_s: float | None,
    rozszerzenia_audit2: dict[str, Any] | None = None,
    z_f_ohm: complex | None = None,
) -> ZwarcieZeSnapshotu:
    """FROZEN wynik zwarcia 3F ze snapshotu ENM — dla pakietu dowodowego SC3F i wkładów.

    Bliźniak `wynik_zwarcia_1f_ze_snapshotu` (dług PACK-SC3F-WIAZANIE): pakiet ma
    OPISYWAĆ wynik, nie produkować go. Graf solvera i c z assemblera biegu
    (karta WSPOLCZYNNIK-C-JEDEN-NOSNIK); ``tb_s`` — t_b scenariusza biegu (``None`` = t_b
    punktu z ``czas_tb_punktu``: pola lokalne albo wartość robocza).

    `z_f_ohm` (karta OD-14): impedancja przejścia biegu, którego pakiet dowodowy powstaje —
    dowód opisuje TEN SAM wynik co bieg (dawniej pakiet biegu przez Z_f przeliczałby zwarcie
    metaliczne i podpisywał je jako dowód biegu). `None` = zwarcie metaliczne, bit w bit.
    """
    wejscie = _wejscie_pakietu(
        snapshot=snapshot,
        fault_type="3F",
        scenariusz=scenariusz,
        nadpisanie_c=nadpisanie_c,
        tk_s=tk_s,
        tb_s=tb_s,
        rozszerzenia_audit2=rozszerzenia_audit2,
    )
    dobor_c = _dobor_c_wezla(wejscie, fault_node_id)
    # rdzeń B-01 — jak w `wynik_zwarcia_1f_ze_snapshotu`
    with nazwy_w_odmowach_rdzenia(wejscie.solve_graph):
        czas_tb = czas_tb_punktu(
            wejscie, fault_node_id, c_factor=dobor_c.wartosc, z_f_ohm=z_f_ohm, granica_b01=True
        )
    with nazwy_w_odmowach_rdzenia(wejscie.solve_graph), odmowa_rdzenia_b01():
        wynik = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=wejscie.solve_graph,
            fault_node_id=fault_node_id,
            c_factor=dobor_c.wartosc,
            tk_s=wejscie.tk_s,
            czas_tb=czas_tb,
            z_f_ohm=z_f_ohm,
        )
    return ZwarcieZeSnapshotu(wynik=wynik, graf=wejscie.solve_graph, dobor_c=dobor_c)


@dataclass(frozen=True)
class GrafIDoborC:
    """Graf solvera biegu, dobór c i t_b punktu — wejście rozbicia maszynowego (wkłady)."""

    graf: NetworkGraph
    fault_node_id: str
    dobor_c: DoborC
    #: Karta TB-WARTOSC-ROBOCZA: t_min = t_b punktu z ``czas_tb_punktu`` (ta sama reguła co
    #: wiersz biegu) — rozbicie maszyn nie ma drugiego źródła t_b.
    czas_tb: CzasWylaczeniaTb
    #: Partia 2 (uzgodnienie kart LINIA-110 i PODSTAWA-Q w wkładach na żądanie): znacznik
    #: tolerancji sieci nN z wartości roboczej węzła i dane przyjęte gałęzi (zapis JSON) z TYCH
    #: SAMYCH założeń wejścia co wiersz biegu (`dane_przyjete_galezi_punktow`) — wkłady stoją na
    #: tych samych danych przyjętych co I″k punktu.
    tolerancja_nn_robocza: bool = False
    dane_przyjete_galezi: tuple[dict[str, Any], ...] = ()


def graf_i_dobor_c_punktu(
    *,
    snapshot: dict[str, Any],
    fault_ref: str,
    scenariusz: Scenario,
    nadpisanie_c: NadpisanieC | None,
    tb_s: float | None,
    z_f_ohm: complex | None,
) -> GrafIDoborC:
    """Graf solvera (assembler biegu), c i t_b punktu dla wkładów zwarciowych na żądanie.

    ``fault_ref`` = id węzła grafu albo ref ENM szyny (UI zna ref z wyniku, solver
    deterministyczny UUID z ref). Karta WSPOLCZYNNIK-C-JEDEN-NOSNIK: c z tabeli 1 dla
    pasma TEGO węzła i scenariusza oglądanego biegu (dawniej zawsze 1,10). Karta
    TB-WARTOSC-ROBOCZA: ``tb_s`` — t_b scenariusza oglądanego biegu; ``None`` = t_b punktu
    z pól lokalnych albo wartość robocza (``czas_tb_punktu``, jak w biegu).
    """
    from enm.mapping import _ref_to_uuid

    wejscie = _wejscie_pakietu(
        snapshot=snapshot,
        fault_type="3F",
        scenariusz=scenariusz,
        nadpisanie_c=nadpisanie_c,
        tk_s=1.0,
        tb_s=tb_s,
        rozszerzenia_audit2=None,
    )
    fault_node_id = fault_ref if fault_ref in wejscie.graph.nodes else _ref_to_uuid(fault_ref)
    dobor_c = _dobor_c_wezla(wejscie, fault_node_id)
    with nazwy_w_odmowach_rdzenia(wejscie.solve_graph):
        czas_tb = czas_tb_punktu(
            wejscie, fault_node_id, c_factor=dobor_c.wartosc, z_f_ohm=z_f_ohm, granica_b01=True
        )
    from enm.dane_przyjete_galezi import dane_przyjete_galezi_punktow

    dane_galezi = dane_przyjete_galezi_punktow(
        wejscie.zalozenia,
        wejscie.graph,
        (fault_node_id,),
        skladowe_zerowe=wejscie.skladowe_zerowe,
    ).get(fault_node_id, ())
    return GrafIDoborC(
        graf=wejscie.solve_graph,
        fault_node_id=fault_node_id,
        dobor_c=dobor_c,
        czas_tb=czas_tb,
        tolerancja_nn_robocza=bool(wejscie.graph.nodes[fault_node_id].tolerancja_nn_robocza),
        dane_przyjete_galezi=tuple(dict(d) for d in dane_galezi),
    )
