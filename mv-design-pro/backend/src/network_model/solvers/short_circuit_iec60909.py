from __future__ import annotations

import cmath
import math
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

import numpy as np
from network_model.core.czas_wylaczenia import POCHODZENIE_TB_PROJEKTANT, CzasWylaczeniaTb
from network_model.core.graph import NetworkGraph
from network_model.core.impedancja_przejscia import (
    OPISY_ODMOW_IMPEDANCJI,
    impedancja_przejscia_obliczeniowa,
    kod_odmowy_impedancji,
)
from network_model.core.inverter import InverterSource
from network_model.nazwy import jest_nazwa
from network_model.odmowa_danych import (
    RODZAJ_GALAZ,
    RODZAJ_WEZEL,
    OdmowaWejsciaRdzenia,
    OdwolanieElementu,
    RekordOdmowy,
)
from network_model.solvers.machine_sc_iec60909 import (
    MachineShortCircuitResult,
    compute_machine_contributions,
)
from network_model.solvers.short_circuit_contributions import (
    KLASA_WKLADU_ZRODLA,
    KLASA_WKLADU_ZRODLA_INNA_WYSPA,
    KLASA_WKLADU_ZRODLA_POMINIETY,
    NAZWA_WKLADU_POMINIETEGO,
    OPIS_PROGU_WKLADU_POMIJALNEGO,
    OPIS_PROGU_WKLADU_POMIJALNEGO_LATEX,
    PROG_WKLADU_POMIJALNEGO_A,
    PRZYCZYNA_WKLADU_INNA_WYSPA,
    TOLERANCJA_WZGLEDNA_BILANSU,
    TOR_FALOWNIK,
    TOR_THEVENIN,
    ShortCircuitBranchContribution,
    ShortCircuitSourceContribution,
    SourceType,
    WkladPominiety,
    WkladZrodla,
    admitancje_zrodel_macierzy,
    boczniki_zrodel,
    jest_wkladem_pominietym,
    tolerancja_bilansu_a,
    wyspy_macierzy,
    zaokraglij_cyfry_znaczace,
)
from network_model.solvers.short_circuit_core import (
    ShortCircuitPostProcessResult,
    ShortCircuitType,
    SkladowaNieokresowa,
    ZanikPraduMaszyny,
    compute_equivalent_impedance,
    compute_ikss,
    compute_post_fault_quantities,
    odmowa_wezla_zwarcia_spoza_grafu,
    prad_wylaczeniowy_symetryczny_a,
    skladowa_nieokresowa,
    voltage_factor_for_fault,
)
from network_model.whitebox.tracer import WhiteBoxTracer

if TYPE_CHECKING:
    from network_model.core.ybus import AdmittanceMatrixBuilder

# Identyfikator źródła zastępczego (Thevenin / sieć nadrzędna) w wkładach.
# LUSTRO konwencji `_build_source_contributions` (source_id="THEVENIN_GRID").
THEVENIN_GRID_SOURCE_ID: str = "THEVENIN_GRID"

# Kody odmów wejścia (rekord strukturalny `RekordOdmowy`, decyzja O-59, plan A/B §12.2 (k)(m)):
# identyfikator elementu stoi w odwołaniu rekordu, nie w treści komunikatu.
# `KOD_WEZEL_ZWARCIA_SPOZA_GRAFU` — w `short_circuit_core` (jedno źródło z jądrem impedancji).
KOD_GALAZ_BEZ_NAZWY: str = "zwarcie.galaz_bez_nazwy"


# -----------------------------------------------------------------------------
# Result API Contract - Stabilne pola wyniku IEC 60909
# Poniższa lista definiuje gwarantowany kontrakt pól w to_dict().
# -----------------------------------------------------------------------------
EXPECTED_SHORT_CIRCUIT_RESULT_KEYS: list[str] = [
    "short_circuit_type",
    "fault_node_id",
    "c_factor",
    "un_v",
    "zkk_ohm",
    "rx_ratio",
    "kappa",
    "tk_s",
    "tb_s",
    "ikss_a",
    "ip_a",
    "ith_a",
    "ib_a",
    "sk_mva",
    "ik_thevenin_a",
    "ik_inverters_a",
    "ik_total_a",
    "contributions",
    "branch_contributions",
    "white_box_trace",
]

# -----------------------------------------------------------------------------
# Delta FROZEN V12K-128 (zatwierdzona przez właściciela 2026-07-22) — składowe
# symetryczne Z1/Z2/Z0 jako pola ADDYTYWNE wyniku. Obecne w to_dict() WYŁĄCZNIE
# gdy solver je policzył: z1_ohm/z2_ohm dla wszystkich typów zwarcia, z0_ohm
# tylko dla zwarć doziemnych (1F, 2F+G). Starsze wyniki odtworzone bez tych pól
# (domyślnie None) serializują się BAJT-W-BAJT identycznie z kontraktem sprzed
# delty — patrz testy additywności w tests/test_result_api_contract.py.
# -----------------------------------------------------------------------------
OPTIONAL_SHORT_CIRCUIT_RESULT_KEYS: list[str] = [
    "z1_ohm",
    "z2_ohm",
    "z0_ohm",
    # V12K-132 (pkt 7 karty właściciela): ślad WHITE BOX rozpływu prądu
    # zwarciowego od źródła zastępczego (Thevenin) w gałęziach. Obecny w
    # to_dict() WYŁĄCZNIE gdy policzono wkłady gałęziowe
    # (include_branch_contributions=True), sprzężony z `branch_contributions`.
    # None (opcja wyłączona / starszy wynik) → pominięty, payload bajt-w-bajt
    # jak sprzed delty (dowód: testy addytywności).
    "branch_flow_trace",
    # Audyt fizyki fala G (2026-07): wspolczynniki cieplne m/n faktycznie
    # uzyte w ith_a = ikss*sqrt(m+n) (IEC 60909-0 §4.7/§12). Obecne w
    # to_dict() ZAWSZE dla wynikow policzonych PO tej delcie (solver je
    # zawsze liczy); None tylko dla wynikow zrekonstruowanych z payloadu
    # sprzed delty (kompatybilnosc wsteczna).
    "m_factor",
    "n_factor",
    # Karta OD-14 (partia integracji 10, addytywnie, exclude-None): zwarcie przez impedancję
    # przejścia Z_f. Obecne WYŁĄCZNIE dla wyniku z Z_f (tryb IMPEDANCE scenariusza); wynik
    # metaliczny serializuje się bajt w bajt jak przed kartą.
    "z_f_ohm",
    "zkk_metaliczne_ohm",
    "ikss_metaliczny_a",
    "poza_zakresem_iec60909",
    # Karta SC-IB-ITH-ZRODLA (B-01 (n), addytywnie, exclude-None): składowa nieokresowa
    # i_DC(t_b) = √2·I_k''·e^(−ω·t_b·R/X) (IEC 60909-0:2016, rozdz. 10). Od karty
    # TB-WARTOSC-ROBOCZA obecna w KAŻDYM wyniku solvera (t_b punktu zawsze rozstrzygnięte);
    # pole opcjonalne wyłącznie dla wyników odtworzonych z zapisu.
    "i_dc_a",
    # Karta TB-WARTOSC-ROBOCZA (B-01 (n), addytywnie, exclude-None): pochodzenie t_b punktu
    # zwarcia (`CzasWylaczeniaTb.to_dict`) — obecne, gdy t_b NIE pochodzi ze scenariusza
    # projektanta (pola lokalne albo wartość robocza). Wynik z t_b projektanta serializuje się
    # bajt w bajt jak przed kartą; jego pochodzenie niesie konfiguracja biegu.
    "tb_zrodlo",
    # Karta PROG-ZERA-WKLADOW (zgoda B-01 właściciela z 2026-10-21, addytywnie, exclude-None):
    # zestawienie wkładów pominiętych na podstawie tolerancji numerycznej (|I| < 1e-6 A) —
    # obecne WYŁĄCZNIE, gdy policzono wkłady gałęziowe i choć jeden wkład został pominięty.
    "wklady_pominiete",
    # Karta WKLAD-ZRODLA (zgoda B-01 architekta z 2026-10-22, pakiet GPZ H5 R8, addytywnie,
    # exclude-None): wkład każdego źródła (zasilanie systemowe, szyna sztywna, maszyna
    # wirująca) do prądu zwarciowego, I_Q,k = Y_Q,k·Z_kf·I_k'' (IEC 60909-0:2016 §4.2), i jego
    # ślad White Box z krokiem bilansu — obecne WYŁĄCZNIE, gdy policzono wkłady gałęziowe
    # (ta sama kolumna Z_kf macierzy Z-bus co rozpływ Thevenina).
    "wklady_zrodel",
    "wklady_zrodel_slad",
]


@dataclass(frozen=True)
class ShortCircuitResult:
    """
    Wynik obliczeń zwarciowych IEC 60909.

    Canonical API fields (jednostki SI / branżowe):
        short_circuit_type: ShortCircuitType - typ zwarcia (3F/2F/1F/2F+G)
        fault_node_id: str - identyfikator węzła zwarcia
        c_factor: float - współczynnik napięciowy c węzła zwarcia (IEC 60909-0 tab. 1,
            dobór wyłącznie `network_model.core.voltage_factor`; wiersz nN wg tolerancji sieci)
        un_v: float - napięcie znamionowe w punkcie zwarcia [V]
        zkk_ohm: complex - impedancja zastępcza w punkcie zwarcia Zk [Ω]
        rx_ratio: float - stosunek R/X impedancji zastępczej [-]
        kappa: float - współczynnik udaru κ [-]
        tk_s: float - czas trwania zwarcia [s]
        tb_s: float - czas wyłączenia t_b = t_min punktu zwarcia [s] (scenariusz projektanta,
            najkrótszy czas wyłączenia pól lokalnych albo wartość robocza 0,1 s — pochodzenie
            w ``tb_zrodlo``; karta TB-WARTOSC-ROBOCZA)
        ikss_a: float - prąd zwarciowy początkowy Ik'' [A]
        ip_a: float - prąd udarowy Ip [A]
        ith_a: float - prąd zastępczy cieplny Ith = Ik''·√(m + n) [A] (n = 1, górne
            oszacowanie — `short_circuit_core._thermal_mn_factors`)
        ib_a: float - SYMETRYCZNY prąd wyłączeniowy Ib wg IEC 60909-0:2016 rozdz. 9 [A]
            (`short_circuit_core.prad_wylaczeniowy_symetryczny_a`): Ib = Ik'' dla zwarcia
            odległego od generatora, z udziałem źródeł przekształtnikowych i dla zwarć
            niesymetrycznych; z maszynami wirującymi (3F) Ib = Ik'' − Σ ΔU''/(c·Un/√3)·
            (1 − μ·q)·Ik,m'' przy t_min = t_b punktu
        i_dc_a: float | None - składowa nieokresowa iDC(t_b) [A] (IEC 60909-0 rozdz. 10;
            addytywnie — każdy wynik solvera ją niesie)
        tb_zrodlo: dict | None - pochodzenie t_b punktu (addytywnie, exclude-None; ``None``
            dla t_b ze scenariusza projektanta)
        wklady_pominiete: list[WkladPominiety] | None - zestawienie wkładów gałęziowych
            pominiętych na podstawie tolerancji numerycznej (|I| < 1e-6 A; addytywnie,
            exclude-None — ``None``, gdy wkładów nie liczono albo żaden nie był pominięty)
        wklady_zrodel: list[WkladZrodla] | None - wkład każdego źródła części Thevenina
            (zasilanie systemowe, szyna sztywna, maszyna wirująca) do prądu zwarciowego
            (karta WKLAD-ZRODLA; addytywnie, exclude-None — ``None``, gdy wkładów
            gałęziowych nie liczono)
        wklady_zrodel_slad: list[dict] | None - ślad White Box wkładów źródeł: krok per
            źródło i krok bilansu w węźle zwarcia (addytywnie, exclude-None)
        sk_mva: float - moc zwarciowa Sk'' [MVA]
        ik_thevenin_a: float - wkład sieci Thevenina [A]
        ik_inverters_a: float - wkład źródeł falownikowych [A]
        ik_total_a: float - całkowity prąd zwarciowy [A]
        contributions: list[ShortCircuitSourceContribution] - wkłady źródeł
        branch_contributions: list[ShortCircuitBranchContribution] | None - wkłady gałęzi
            o |I| ≥ 1e-6 A (wkład o |I| < 1e-6 A jest pominięty — `wklady_pominiete`)
        white_box_trace: list[dict] - szczegółowy ślad obliczeń

    Aliasy (dla kompatybilności):
        ik_a -> ikss_a
        ip -> ip_a
        ith -> ith_a
        ib -> ib_a
        sk -> sk_mva
    """

    short_circuit_type: ShortCircuitType
    fault_node_id: str
    c_factor: float
    un_v: float
    zkk_ohm: complex
    ikss_a: float
    ip_a: float
    ith_a: float
    sk_mva: float
    rx_ratio: float
    kappa: float
    tk_s: float
    ib_a: float
    tb_s: float
    ik_thevenin_a: float = 0.0
    ik_inverters_a: float = 0.0
    ik_total_a: float = 0.0
    contributions: list[ShortCircuitSourceContribution] = field(default_factory=list)
    branch_contributions: list[ShortCircuitBranchContribution] | None = None
    white_box_trace: list[dict] = field(default_factory=list)
    # Delta FROZEN V12K-128 (addytywna): składowe symetryczne impedancji
    # zastępczej wyliczone przez solver (Z1/Z2 zawsze; Z0 dla zwarć doziemnych).
    # None = wielkość nieobliczana dla tego typu / wynik sprzed delty.
    z1_ohm: complex | None = None
    z2_ohm: complex | None = None
    z0_ohm: complex | None = None
    # V12K-132 (pkt 7 karty właściciela, addytywnie): ślad WHITE BOX rozpływu
    # prądu zwarciowego od źródła zastępczego (Thevenin/sieć nadrzędna) po
    # gałęziach — kroki i wartości pośrednie podziału prądu z macierzy Z-bus.
    # None = wkłady gałęziowe nieliczone (opcja wyłączona) / wynik sprzed delty.
    branch_flow_trace: list[dict] | None = None
    # Audyt fizyki fala G (2026-07, addytywnie): wspolczynniki cieplne m
    # (skladowa DC) i n (skladowa AC) FAKTYCZNIE uzyte w ith_a = ikss*sqrt(m+n)
    # (IEC 60909-0 §4.7/§12; ta sama norma jest juz udokumentowana i uzywana
    # w proof_generator.py dla SC1/SC3F — patrz EQ_SC3F_008/EQ_SC1_011).
    # None = wynik sprzed delty (rekonstrukcja bez tych pol) — payload
    # bajt-w-bajt jak przed delta (dowod: testy addytywnosci kontraktu).
    m_factor: float | None = None
    n_factor: float | None = None
    # Karta OD-14 (partia integracji 10, addytywnie): zwarcie przez impedancję przejścia
    # Z_f = R_f + jX_f [Ω]. `zkk_ohm` niesie wtedy impedancję pętli Z Z_f, a te pola:
    # Z_f, impedancję tej samej pętli przy Z_f = 0, prąd I_k'' zwarcia metalicznego (warunek
    # sanity |I_k(Z_f)| ≤ |I_k(0)|) i znacznik zakresu ważności — norma IEC 60909 definiuje
    # prąd zwarciowy dla zwarcia metalicznego, więc wynik z Z_f jest poza jej zakresem.
    # None = zwarcie metaliczne (payload bajt w bajt jak przed kartą).
    z_f_ohm: complex | None = None
    zkk_metaliczne_ohm: complex | None = None
    ikss_metaliczny_a: float | None = None
    poza_zakresem_iec60909: bool | None = None
    # Karta SC-IB-ITH-ZRODLA (addytywnie): składowa nieokresowa i_DC(t_b) [A].
    # None wyłącznie dla wyniku odtworzonego z zapisu bez tego pola.
    i_dc_a: float | None = None
    # Karta TB-WARTOSC-ROBOCZA (addytywnie): pochodzenie t_b punktu zwarcia; None = t_b ze
    # scenariusza projektanta (payload bez klucza, bajt w bajt jak przed kartą).
    tb_zrodlo: dict[str, Any] | None = None
    # Karta PROG-ZERA-WKLADOW (zgoda B-01 z 2026-10-21, addytywnie): wkłady gałęziowe
    # pominięte na podstawie tolerancji numerycznej (|I| < 1e-6 A) — NIE zera; surowe |I|
    # i kąt fazora w zapisie deterministycznym. None = wkładów nie liczono albo żaden nie
    # był pominięty (payload bez klucza, bajt w bajt jak przed kartą).
    wklady_pominiete: list[WkladPominiety] | None = None
    # Karta WKLAD-ZRODLA (zgoda B-01 architekta z 2026-10-22, addytywnie): wkład per źródło
    # i jego ślad White Box. None = wkładów gałęziowych nie liczono (payload bez kluczy, bajt
    # w bajt jak przed kartą).
    wklady_zrodel: list[WkladZrodla] | None = None
    wklady_zrodel_slad: list[dict] | None = None

    # -------------------------------------------------------------------------
    # Aliasy dla kompatybilności wstecznej (preferuj canonical: ikss_a, ip_a, ...)
    # -------------------------------------------------------------------------
    @property
    def ik_a(self) -> float:
        """Alias dla ikss_a (canonical)."""
        return self.ikss_a

    @property
    def ip(self) -> float:
        """Alias dla ip_a (canonical)."""
        return self.ip_a

    @property
    def ith(self) -> float:
        """Alias dla ith_a (canonical)."""
        return self.ith_a

    @property
    def ib(self) -> float | None:
        """Alias dla ib_a (canonical)."""
        return self.ib_a

    @property
    def sk(self) -> float:
        """Alias dla sk_mva (canonical)."""
        return self.sk_mva

    # -------------------------------------------------------------------------
    # Serializacja JSON-ready
    # -------------------------------------------------------------------------
    def to_dict(self) -> dict:
        """
        Zwraca wynik jako dict z czystymi typami JSON.

        complex -> {"re": float, "im": float}
        Enum -> str (value)
        dataclass contributions -> list[dict]
        numpy types -> native Python types
        """

        def serialize_complex(c: complex) -> dict:
            return {"re": float(c.real), "im": float(c.imag)}

        def serialize_contribution(contrib: ShortCircuitSourceContribution) -> dict:
            return contrib.to_dict()

        def serialize_branch_contribution(
            contrib: ShortCircuitBranchContribution,
        ) -> dict:
            return contrib.to_dict()

        def serialize_value(val: Any) -> Any:
            """Rekurencyjnie konwertuje wartości do typów JSON-ready."""
            if isinstance(val, complex):
                return serialize_complex(val)
            if hasattr(val, "item"):  # numpy scalar
                return val.item()
            if isinstance(val, dict):
                return {k: serialize_value(v) for k, v in val.items()}
            if isinstance(val, list):
                return [serialize_value(v) for v in val]
            return val

        data: dict = {
            "short_circuit_type": self.short_circuit_type.value,
            "fault_node_id": self.fault_node_id,
            "c_factor": float(self.c_factor),
            "un_v": float(self.un_v),
            "zkk_ohm": serialize_complex(self.zkk_ohm),
            "rx_ratio": float(self.rx_ratio),
            "kappa": float(self.kappa),
            "tk_s": float(self.tk_s),
            "tb_s": float(self.tb_s),
            "ikss_a": float(self.ikss_a),
            "ip_a": float(self.ip_a),
            "ith_a": float(self.ith_a),
            "ib_a": float(self.ib_a),
            "sk_mva": float(self.sk_mva),
            "ik_thevenin_a": float(self.ik_thevenin_a),
            "ik_inverters_a": float(self.ik_inverters_a),
            "ik_total_a": float(self.ik_total_a),
            "contributions": [serialize_contribution(c) for c in self.contributions],
            "branch_contributions": (
                [serialize_branch_contribution(c) for c in self.branch_contributions]
                if self.branch_contributions is not None
                else None
            ),
            "white_box_trace": serialize_value(list(self.white_box_trace)),
        }
        # Delta FROZEN V12K-128 (addytywna): składowe symetryczne dołączane tylko
        # gdy solver je policzył. Pominięcie None gwarantuje bajt-w-bajt zgodność
        # payloadu wyników odtworzonych bez tych pól z kontraktem sprzed delty.
        if self.z1_ohm is not None:
            data["z1_ohm"] = serialize_complex(self.z1_ohm)
        if self.z2_ohm is not None:
            data["z2_ohm"] = serialize_complex(self.z2_ohm)
        if self.z0_ohm is not None:
            data["z0_ohm"] = serialize_complex(self.z0_ohm)
        # V12K-132 (addytywnie, exclude-None): ślad WHITE BOX rozpływu Thevenina
        # dołączany WYŁĄCZNIE gdy policzony (wielkości zespolone pośrednie →
        # {re, im} przez serialize_value). Pominięcie None gwarantuje bajt-w-bajt
        # zgodność payloadu wyników bez tego pola z kontraktem sprzed delty.
        if self.branch_flow_trace is not None:
            data["branch_flow_trace"] = serialize_value(list(self.branch_flow_trace))
        # Audyt fizyki fala G (2026-07, addytywnie, exclude-None): m_factor/n_factor
        # dolaczane WYLACZNIE gdy solver je policzyl — pominiecie None gwarantuje
        # bajt-w-bajt zgodnosc payloadu wynikow sprzed delty.
        if self.m_factor is not None:
            data["m_factor"] = float(self.m_factor)
        if self.n_factor is not None:
            data["n_factor"] = float(self.n_factor)
        # Karta OD-14 (addytywnie, exclude-None): pola zwarcia przez impedancję przejścia.
        if self.z_f_ohm is not None:
            data["z_f_ohm"] = serialize_complex(self.z_f_ohm)
        if self.zkk_metaliczne_ohm is not None:
            data["zkk_metaliczne_ohm"] = serialize_complex(self.zkk_metaliczne_ohm)
        if self.ikss_metaliczny_a is not None:
            data["ikss_metaliczny_a"] = float(self.ikss_metaliczny_a)
        if self.poza_zakresem_iec60909 is not None:
            data["poza_zakresem_iec60909"] = bool(self.poza_zakresem_iec60909)
        # Karta SC-IB-ITH-ZRODLA (addytywnie, exclude-None): składowa nieokresowa i_DC(t_b).
        if self.i_dc_a is not None:
            data["i_dc_a"] = float(self.i_dc_a)
        # Karta TB-WARTOSC-ROBOCZA (addytywnie, exclude-None): pochodzenie t_b punktu.
        if self.tb_zrodlo is not None:
            data["tb_zrodlo"] = serialize_value(dict(self.tb_zrodlo))
        # Karta PROG-ZERA-WKLADOW (addytywnie, exclude-None): zestawienie wkładów pominiętych.
        if self.wklady_pominiete is not None:
            data["wklady_pominiete"] = [w.to_dict() for w in self.wklady_pominiete]
        # Karta WKLAD-ZRODLA (addytywnie, exclude-None): wkłady źródeł i ich ślad.
        if self.wklady_zrodel is not None:
            data["wklady_zrodel"] = [w.to_dict() for w in self.wklady_zrodel]
        if self.wklady_zrodel_slad is not None:
            data["wklady_zrodel_slad"] = serialize_value(list(self.wklady_zrodel_slad))
        return data


#: Przypadki normy dla symetrycznego prądu wyłączeniowego (IEC 60909-0:2016, rozdz. 9) — klucz
#: `przypadek` w śladzie „Ib" (wejście dla dowodu SC3F i ekranu wyników).
PRZYPADEK_IB_BEZ_MASZYN = "odlegle_od_generatora"
PRZYPADEK_IB_NIESYMETRYCZNE = "zwarcie_niesymetryczne"
PRZYPADEK_IB_MASZYNY = "z_udzialem_maszyn"


@dataclass(frozen=True)
class PradWylaczeniowy:
    """Prąd wyłączeniowy i składowa nieokresowa jednego punktu — wartości pośrednie śladu.

    ``czas_tb`` — t_b punktu z pochodzeniem (karta TB-WARTOSC-ROBOCZA), ``ib_a`` z
    `prad_wylaczeniowy_symetryczny_a`, ``zaniki`` — pary (wkład maszyny z
    `machine_sc_iec60909`, jej składnik zaniku), ``skladowa_dc`` z `skladowa_nieokresowa`.
    """

    przypadek: str
    czas_tb: CzasWylaczeniaTb
    ib_a: float
    skladowa_dc: SkladowaNieokresowa
    zaniki: tuple[tuple[Any, ZanikPraduMaszyny], ...] = ()

    @property
    def tb_s(self) -> float:
        return self.czas_tb.wartosc_s


@dataclass(frozen=True)
class _PetlaZwarcia:
    """Impedancja pętli i prąd początkowy punktu (wspólna część pełnego toku i
    `prad_poczatkowy_a`)."""

    core: Any
    un_v: float
    ikss_thevenin_a: float
    ik_inverters_a: float
    tlumienie_petli: float | None
    ikss_metaliczny_a: float | None


class ShortCircuitIEC60909Solver:
    @staticmethod
    def _prad_wylaczeniowy(
        *,
        graph: NetworkGraph,
        fault_node_id: str,
        short_circuit_type: ShortCircuitType,
        c_factor: float,
        czas_tb: CzasWylaczeniaTb,
        z_f: complex | None,
        ik_total_a: float,
        ikss_thevenin_a: float,
        rx_ratio: float,
    ) -> PradWylaczeniowy:
        """I_b (IEC 60909-0:2016, rozdz. 9) i i_DC(t_b) (rozdz. 10) — jeden tok dla 4 rodzajów.

        Udział maszyn wirujących liczy WYŁĄCZNIE `machine_sc_iec60909.compute_machine_
        contributions` (μ, q, ΔU″ na tej samej macierzy Z-bus co I_k'') — rdzeń nie ma drugiej
        implementacji krzywych. i_DC z prądu części Thevenina (sieć zasilająca + maszyny):
        źródła przekształtnikowe nie mają składowej nieokresowej. t_b punktu (``czas_tb``)
        rozstrzyga warstwa wiązania (karta TB-WARTOSC-ROBOCZA) — rdzeń go nie zgaduje.
        """
        tb_s = czas_tb.wartosc_s
        skladowa = skladowa_nieokresowa(ikss_a=ikss_thevenin_a, rx_ratio=rx_ratio, tb_s=tb_s)
        if short_circuit_type != ShortCircuitType.THREE_PHASE:
            return PradWylaczeniowy(
                przypadek=PRZYPADEK_IB_NIESYMETRYCZNE,
                czas_tb=czas_tb,
                ib_a=prad_wylaczeniowy_symetryczny_a(ikss_a=ik_total_a),
                skladowa_dc=skladowa,
            )
        if (
            not graph.get_synchronous_machine_sources()
            and not graph.get_asynchronous_machine_sources()
        ):
            return PradWylaczeniowy(
                przypadek=PRZYPADEK_IB_BEZ_MASZYN,
                czas_tb=czas_tb,
                ib_a=prad_wylaczeniowy_symetryczny_a(ikss_a=ik_total_a),
                skladowa_dc=skladowa,
            )
        maszyny: MachineShortCircuitResult = compute_machine_contributions(
            graph, fault_node_id, c_factor=c_factor, t_min_s=tb_s, z_f_ohm=z_f
        )
        zaniki: list[tuple[Any, ZanikPraduMaszyny]] = []
        for wklad in maszyny.contributions:
            zaniki.append(
                (
                    wklad,
                    ZanikPraduMaszyny(
                        ikss_czesciowy_a=wklad.ikss_partial_a,
                        mu=wklad.mu,
                        q=wklad.q,
                        delta_u_wzgledne=wklad.delta_u_wzgledne,
                    ),
                )
            )
        return PradWylaczeniowy(
            przypadek=PRZYPADEK_IB_MASZYNY,
            czas_tb=czas_tb,
            ib_a=prad_wylaczeniowy_symetryczny_a(
                ikss_a=ik_total_a, zaniki=tuple(zanik for _, zanik in zaniki)
            ),
            zaniki=tuple(zaniki),
            skladowa_dc=skladowa,
        )

    @staticmethod
    def _sprawdz_wejscie(graph: NetworkGraph, fault_node_id: str) -> None:
        """Walidacja wejścia wspólna czterech rodzajów zwarcia — przed biegiem.

        Węzeł zwarcia musi istnieć w grafie, a każda gałąź w eksploatacji mieć nazwę: tytuły
        kroków śladu White Box (korekcja K_T transformatora, prąd Thevenina w gałęzi) nazywają
        gałąź nazwą z modelu, nigdy identyfikatorem (O-59, §12.2 (m)). Mapowanie ENM → graf
        nadaje każdej gałęzi nazwę (`enm/mapping.py`, `nazwa_elementu`), więc odmowa dotyczy
        grafów budowanych poza modelem (np. z migawki bez pola nazwy).
        """
        if fault_node_id not in graph.nodes:
            raise odmowa_wezla_zwarcia_spoza_grafu(fault_node_id)
        bez_nazwy = sorted(
            branch_id
            for branch_id, branch in graph.branches.items()
            if getattr(branch, "in_service", True) and not jest_nazwa(branch.name)
        )
        if bez_nazwy:
            raise OdmowaWejsciaRdzenia(
                [
                    RekordOdmowy(
                        KOD_GALAZ_BEZ_NAZWY,
                        "Ślad obliczeń zwarciowych nazywa każdą gałąź w eksploatacji nazwą "
                        f"z modelu; gałęzi bez nazwy: {len(bez_nazwy)}.",
                        tuple(OdwolanieElementu(RODZAJ_GALAZ, ref) for ref in bez_nazwy),
                    )
                ]
            )

    @staticmethod
    def _compute_fault_result(
        *,
        short_circuit_type: ShortCircuitType,
        fault_node_id: str,
        c_factor: float,
        tk_s: float,
        czas_tb: CzasWylaczeniaTb,
        un_v: float,
        post: ShortCircuitPostProcessResult,
        z_equiv: complex,
        ikss_thevenin: float,
        ik_inverters: float,
        ib_a: float,
        ib_przypadek: str,
        i_dc_a: float,
        contributions: list[ShortCircuitSourceContribution],
        branch_contributions: list[ShortCircuitBranchContribution] | None,
        white_box_trace: list[dict],
        z1: complex | None = None,
        z2: complex | None = None,
        z0: complex | None = None,
        branch_flow_trace: list[dict] | None = None,
        z_f: complex | None = None,
        z_equiv_metaliczne: complex | None = None,
        ikss_metaliczny_a: float | None = None,
        wklady_pominiete: list[WkladPominiety] | None = None,
        wklady_zrodel: list[WkladZrodla] | None = None,
        wklady_zrodel_slad: list[dict] | None = None,
    ) -> ShortCircuitResult:
        ik_total = ikss_thevenin + ik_inverters
        return ShortCircuitResult(
            short_circuit_type=short_circuit_type,
            fault_node_id=fault_node_id,
            c_factor=c_factor,
            un_v=un_v,
            zkk_ohm=z_equiv,
            ikss_a=ik_total,
            ip_a=post.ip_a,
            ith_a=post.ith_a,
            sk_mva=post.sk_mva,
            rx_ratio=post.rx_ratio,
            kappa=post.kappa,
            tk_s=tk_s,
            ib_a=ib_a,
            tb_s=czas_tb.wartosc_s,
            ik_thevenin_a=ikss_thevenin,
            ik_inverters_a=ik_inverters,
            ik_total_a=ik_total,
            contributions=contributions,
            branch_contributions=branch_contributions,
            white_box_trace=white_box_trace,
            z1_ohm=z1,
            z2_ohm=z2,
            z0_ohm=z0,
            branch_flow_trace=branch_flow_trace,
            m_factor=post.m_factor,
            n_factor=post.n_factor,
            z_f_ohm=z_f,
            zkk_metaliczne_ohm=z_equiv_metaliczne,
            ikss_metaliczny_a=ikss_metaliczny_a,
            poza_zakresem_iec60909=True if z_f is not None else None,
            i_dc_a=i_dc_a,
            tb_zrodlo=ShortCircuitIEC60909Solver._zrodlo_tb_wiersza(czas_tb, ib_przypadek),
            wklady_pominiete=wklady_pominiete,
            wklady_zrodel=wklady_zrodel,
            wklady_zrodel_slad=wklady_zrodel_slad,
        )

    @staticmethod
    def _zrodlo_tb_wiersza(czas_tb: CzasWylaczeniaTb, ib_przypadek: str) -> dict[str, Any] | None:
        """Pochodzenie t_b w wierszu wyniku (``None`` dla t_b projektanta) z flagą
        ``ib_z_udzialem_maszyn``: I_b zależy od t_b wyłącznie przez zanik prądów maszyn
        wirujących (μ, q — IEC 60909-0:2016 rozdz. 9), więc konsument oceny wyłączania wie,
        czy wartość robocza t_b stoi za porównywanym I_b, czy tylko za informacyjną i_DC."""
        zrodlo = ShortCircuitIEC60909Solver._zrodlo_tb_wyniku(czas_tb)
        if zrodlo is None:
            return None
        return {**zrodlo, "ib_z_udzialem_maszyn": ib_przypadek == PRZYPADEK_IB_MASZYNY}

    @staticmethod
    def _zrodlo_tb_wyniku(czas_tb: CzasWylaczeniaTb) -> dict[str, Any] | None:
        """Pochodzenie t_b w wyniku i w śladzie — ``None`` dla t_b ze scenariusza projektanta
        (pochodzenie biegu, payload bajt w bajt jak przed kartą TB-WARTOSC-ROBOCZA)."""
        if czas_tb.pochodzenie == POCHODZENIE_TB_PROJEKTANT:
            return None
        return czas_tb.to_dict()

    @staticmethod
    def _format_complex(value: complex) -> str:
        real = f"{value.real:.6g}"
        imag = f"{abs(value.imag):.6g}"
        sign = "+" if value.imag >= 0 else "-"
        return f"{real}{sign}j{imag}"

    @staticmethod
    def _format_float(value: float) -> str:
        return f"{value:.6g}"

    @staticmethod
    def _format_complex_latex(value: complex) -> str:
        real = f"{value.real:.6g}"
        imag = f"{abs(value.imag):.6g}"
        sign = "+" if value.imag >= 0 else "-"
        return f"\\left({real} {sign} j {imag}\\right)"

    @staticmethod
    def _append_transformer_kt_trace(tracer: WhiteBoxTracer, graph: NetworkGraph) -> None:
        """WHITE BOX (IEC 60909-0 §3.3.3): jawny ślad korekcji impedancji K_T dla
        każdego transformatora sieciowego w modelu. Kolejność deterministyczna
        (sort po id gałęzi). Bez ukrytych korekcji — K_T ze wzorem i podstawieniem
        liczb; Z_T i Z_TK w per-unit na wartościach znamionowych TR."""
        from network_model.core.branch import TransformerBranch

        fmt = ShortCircuitIEC60909Solver._format_float
        fmt_c = ShortCircuitIEC60909Solver._format_complex_latex
        for branch_id in sorted(graph.branches.keys()):
            branch = graph.branches[branch_id]
            if not isinstance(branch, TransformerBranch):
                continue
            if not getattr(branch, "in_service", True):
                continue
            x_t = branch.get_relative_reactance_xt()
            c_max = branch.get_voltage_factor_c_max()
            k_t = branch.get_kt_correction_factor()
            z_t = branch.get_short_circuit_impedance_pu()
            z_tk = branch.get_short_circuit_impedance_pu_corrected()
            # X_T on the HV side [Ω] = x_T · (U_rT,HV² / S_rT) (rated base ohm).
            z_base_hv_ohm = (
                (branch.voltage_hv_kv**2) / branch.rated_power_mva
                if branch.rated_power_mva > 0
                else 0.0
            )
            x_t_ohm_hv = x_t * z_base_hv_ohm
            tracer.add(
                key=f"KT[{branch_id}]",
                title=f"Korekcja impedancji transformatora sieciowego {branch.name}",
                formula_latex=r"K_T = 0.95 \cdot \frac{c_{max}}{1 + 0.6 \cdot x_T}",
                inputs={
                    "branch_id": branch_id,
                    "s_rt_mva": branch.rated_power_mva,
                    "u_rt_hv_kv": branch.voltage_hv_kv,
                    "u_rt_lv_kv": branch.voltage_lv_kv,
                    "x_t_pu": x_t,
                    "x_t_ohm_hv": x_t_ohm_hv,
                    "c_max": c_max,
                },
                substitution=(f"0.95 \\cdot \\frac{{{fmt(c_max)}}}{{1 + 0.6 \\cdot {fmt(x_t)}}}"),
                substitution_latex=(
                    f"0.95 \\cdot \\frac{{{fmt(c_max)}}}{{1 + 0.6 \\cdot {fmt(x_t)}}}"
                ),
                result={
                    "k_t": k_t,
                    "z_t_pu": z_t,
                    "z_tk_pu": z_tk,
                    "z_tk_formula_latex": (
                        f"Z_{{TK}} = K_T \\cdot Z_T = {fmt(k_t)} \\cdot {fmt_c(z_t)}"
                        f" = {fmt_c(z_tk)}"
                    ),
                },
            )

    @staticmethod
    def _build_white_box_trace(
        *,
        short_circuit_type: ShortCircuitType,
        fault_node_id: str,
        c_factor: float,
        un_v: float,
        tk_s: float,
        z_equiv: complex,
        z1: complex,
        z2: complex,
        z0: complex | None,
        ikss_a: float,
        post: ShortCircuitPostProcessResult,
        wylaczeniowy: PradWylaczeniowy,
        graph: NetworkGraph | None = None,
        z_f: complex | None = None,
        z_equiv_metaliczne: complex | None = None,
        ikss_metaliczny_a: float | None = None,
        tlumienie_petli: float | None = None,
    ) -> list[dict]:
        tracer = WhiteBoxTracer()
        if graph is not None:
            ShortCircuitIEC60909Solver._append_transformer_kt_trace(tracer, graph)
        z_equiv_abs = abs(z_equiv)
        voltage_factor = voltage_factor_for_fault(short_circuit_type)
        if z_f is not None:
            ShortCircuitIEC60909Solver._append_impedancja_przejscia_trace(
                tracer, short_circuit_type=short_circuit_type, z_f=z_f
            )

        z_inputs = {
            "z1_ohm": z1,
            "z2_ohm": z2,
            "fault_node_id": fault_node_id,
            "short_circuit_type": short_circuit_type.value,
        }
        if z0 is not None:
            z_inputs["z0_ohm"] = z0

        if z_f is not None:
            z_inputs["z_f_ohm"] = z_f
            formula, substitution = ShortCircuitIEC60909Solver._formula_petli_z_impedancja(
                short_circuit_type, z1=z1, z2=z2, z0=z0, z_f=z_f
            )
        elif short_circuit_type == ShortCircuitType.THREE_PHASE:
            formula = r"Z_k = Z_1"
            substitution = ShortCircuitIEC60909Solver._format_complex_latex(z1)
        elif short_circuit_type == ShortCircuitType.TWO_PHASE:
            formula = r"Z_k = Z_1 + Z_2"
            substitution = (
                f"{ShortCircuitIEC60909Solver._format_complex_latex(z1)}"
                f" + {ShortCircuitIEC60909Solver._format_complex_latex(z2)}"
            )
        elif short_circuit_type == ShortCircuitType.SINGLE_PHASE_GROUND:
            formula = r"Z_k = Z_1 + Z_2 + Z_0"
            substitution = (
                f"{ShortCircuitIEC60909Solver._format_complex_latex(z1)}"
                f" + {ShortCircuitIEC60909Solver._format_complex_latex(z2)}"
                f" + {ShortCircuitIEC60909Solver._format_complex_latex(z0 or 0)}"
            )
        else:
            formula = r"Z_k = Z_1 + \frac{Z_2 \cdot Z_0}{Z_2 + Z_0}"
            denominator = z2 + (z0 or 0)
            substitution = (
                f"{ShortCircuitIEC60909Solver._format_complex_latex(z1)}"
                f" + \\frac{{{ShortCircuitIEC60909Solver._format_complex_latex(z2)}"
                f" \\cdot {ShortCircuitIEC60909Solver._format_complex_latex(z0 or 0)}}}"
                f"{{{ShortCircuitIEC60909Solver._format_complex_latex(denominator)}}}"
            )

        tracer.add(
            key="Zk",
            title="Impedancja zastępcza w punkcie zwarcia",
            formula_latex=formula,
            inputs=z_inputs,
            substitution=substitution,
            substitution_latex=substitution,
            result={
                "z_equiv_ohm": z_equiv,
                "r_ohm": z_equiv.real,
                "x_ohm": z_equiv.imag,
                "z_equiv_abs_ohm": z_equiv_abs,
            },
        )

        tracer.add(
            key="Ikss",
            title="Prąd zwarciowy początkowy symetryczny",
            formula_latex=r"I_{k}'' = \frac{c \cdot U_n \cdot k_U}{\left|Z_k\right|}",
            inputs={
                "c_factor": c_factor,
                "un_v": un_v,
                "voltage_factor": voltage_factor,
                "z_equiv_abs_ohm": z_equiv_abs,
            },
            substitution=(
                f"\\frac{{{ShortCircuitIEC60909Solver._format_float(c_factor)} \\cdot "
                f"{ShortCircuitIEC60909Solver._format_float(un_v)} \\cdot "
                f"{ShortCircuitIEC60909Solver._format_float(voltage_factor)}}}"
                f"{{{ShortCircuitIEC60909Solver._format_float(z_equiv_abs)}}}"
            ),
            substitution_latex=(
                f"\\frac{{{ShortCircuitIEC60909Solver._format_float(c_factor)} \\cdot "
                f"{ShortCircuitIEC60909Solver._format_float(un_v)} \\cdot "
                f"{ShortCircuitIEC60909Solver._format_float(voltage_factor)}}}"
                f"{{{ShortCircuitIEC60909Solver._format_float(z_equiv_abs)}}}"
            ),
            result={"ikss_a": ikss_a},
        )

        r_ohm = z_equiv.real
        x_ohm = z_equiv.imag
        rx_ratio = post.rx_ratio
        tracer.add(
            key="kappa",
            title="Współczynnik udaru",
            formula_latex=r"\kappa = 1.02 + 0.98 \cdot e^{-3 R/X}",
            inputs={"r_ohm": r_ohm, "x_ohm": x_ohm, "rx_ratio": rx_ratio},
            substitution=(
                f"1.02 + 0.98 \\cdot e^{{-3 \\cdot {ShortCircuitIEC60909Solver._format_float(rx_ratio)}}}"
            ),
            substitution_latex=(
                f"1.02 + 0.98 \\cdot e^{{-3 \\cdot {ShortCircuitIEC60909Solver._format_float(rx_ratio)}}}"
            ),
            result={"kappa": post.kappa},
        )

        tracer.add(
            key="Ip",
            title="Prąd udarowy",
            formula_latex=r"I_p = \kappa \cdot \sqrt{2} \cdot I_{k}''",
            inputs={"kappa": post.kappa, "ikss_a": ikss_a},
            substitution=(
                f"{ShortCircuitIEC60909Solver._format_float(post.kappa)}"
                f" \\cdot \\sqrt{{2}} \\cdot {ShortCircuitIEC60909Solver._format_float(ikss_a)}"
            ),
            substitution_latex=(
                f"{ShortCircuitIEC60909Solver._format_float(post.kappa)}"
                f" \\cdot \\sqrt{{2}} \\cdot {ShortCircuitIEC60909Solver._format_float(ikss_a)}"
            ),
            result={"ip_a": post.ip_a},
        )

        ShortCircuitIEC60909Solver._append_prad_wylaczeniowy_trace(
            tracer, ikss_a=ikss_a, c_factor=c_factor, wylaczeniowy=wylaczeniowy
        )
        ShortCircuitIEC60909Solver._append_skladowa_nieokresowa_trace(
            tracer, czas_tb=wylaczeniowy.czas_tb, skladowa=wylaczeniowy.skladowa_dc
        )

        tracer.add(
            key="Ith",
            title="Prąd zastępczy cieplny",
            formula_latex=r"I_{th} = I_{k}'' \cdot \sqrt{m + n}",
            inputs={"ikss_a": ikss_a, "m_factor": post.m_factor, "n_factor": post.n_factor},
            substitution=(
                f"{ShortCircuitIEC60909Solver._format_float(ikss_a)}"
                f" \\cdot \\sqrt{{{ShortCircuitIEC60909Solver._format_float(post.m_factor)}"
                f" + {ShortCircuitIEC60909Solver._format_float(post.n_factor)}}}"
            ),
            substitution_latex=(
                f"{ShortCircuitIEC60909Solver._format_float(ikss_a)}"
                f" \\cdot \\sqrt{{{ShortCircuitIEC60909Solver._format_float(post.m_factor)}"
                f" + {ShortCircuitIEC60909Solver._format_float(post.n_factor)}}}"
            ),
            result={"ith_a": post.ith_a},
        )

        tracer.add(
            key="Sk",
            title="Moc zwarciowa",
            formula_latex=r"S_k = \sqrt{3} \cdot U_n \cdot I_{k}'' / 10^6",
            inputs={"un_v": un_v, "ikss_a": ikss_a},
            substitution=(
                f"\\sqrt{{3}} \\cdot {ShortCircuitIEC60909Solver._format_float(un_v)}"
                f" \\cdot {ShortCircuitIEC60909Solver._format_float(ikss_a)} / 10^6"
            ),
            substitution_latex=(
                f"\\sqrt{{3}} \\cdot {ShortCircuitIEC60909Solver._format_float(un_v)}"
                f" \\cdot {ShortCircuitIEC60909Solver._format_float(ikss_a)} / 10^6"
            ),
            result={"sk_mva": post.sk_mva},
        )

        if z_f is not None and z_equiv_metaliczne is not None and ikss_metaliczny_a is not None:
            ShortCircuitIEC60909Solver._append_sanity_impedancji_trace(
                tracer,
                short_circuit_type=short_circuit_type,
                z_equiv=z_equiv,
                z_equiv_metaliczne=z_equiv_metaliczne,
                ikss_a=ikss_a,
                ikss_metaliczny_a=ikss_metaliczny_a,
                tlumienie_petli=tlumienie_petli,
            )

        return tracer.to_list()

    @staticmethod
    def _append_prad_wylaczeniowy_trace(
        tracer: WhiteBoxTracer,
        *,
        ikss_a: float,
        c_factor: float,
        wylaczeniowy: PradWylaczeniowy,
    ) -> None:
        """Krok śladu „Ib" — symetryczny prąd wyłączeniowy, JEDNA definicja z rdzenia.

        Wzór i podstawienie zależą od przypadku normy (IEC 60909-0:2016, rozdz. 9), liczba
        zawsze pochodzi z `prad_wylaczeniowy_symetryczny_a` — ślad nie liczy jej sam.
        """
        fmt = ShortCircuitIEC60909Solver._format_float
        if wylaczeniowy.przypadek != PRZYPADEK_IB_MASZYNY:
            uwagi = {
                PRZYPADEK_IB_BEZ_MASZYN: (
                    "Zwarcie odległe od generatora (brak maszyn wirujących w sieci): składowa "
                    "okresowa nie zanika, Ib = Ik'' (IEC 60909-0:2016, rozdz. 9). Źródła "
                    "przekształtnikowe są źródłami prądowymi bez zaniku — ich udział wchodzi "
                    "do Ib w całości."
                ),
                PRZYPADEK_IB_NIESYMETRYCZNE: (
                    "Zwarcie niesymetryczne: IEC 60909-0:2016, rozdz. 9 przyjmuje Ib = Ik'' "
                    "(zanik strumienia maszyn nie jest uwzględniany)."
                ),
            }[wylaczeniowy.przypadek]
            tracer.add(
                key="Ib",
                title="Prąd wyłączeniowy symetryczny",
                formula_latex=r"I_b = I_{k}''",
                inputs={"ikss_a": ikss_a, "przypadek": wylaczeniowy.przypadek},
                substitution=fmt(ikss_a),
                substitution_latex=fmt(ikss_a),
                result={"ib_a": wylaczeniowy.ib_a},
                notes=uwagi,
            )
            return
        wzor = (
            r"I_b = I_{k}'' - \sum_m \frac{\Delta U''_m}{c\,U_n/\sqrt{3}}"
            r"\left(1 - \mu_m q_m\right) I''_{k,m}"
        )
        maszyny = [
            {
                "source_id": wklad.source_id,
                "machine_type": wklad.machine_type,
                "ikss_czesciowy_a": wklad.ikss_partial_a,
                "ratio_ik_ir": wklad.ratio_ik_ir,
                "mu": wklad.mu,
                "q": wklad.q,
                "delta_u_wzgledne": wklad.delta_u_wzgledne,
                "ubytek_a": zanik.ubytek_a,
            }
            for wklad, zanik in wylaczeniowy.zaniki
        ]
        wejscia: dict[str, Any] = {
            "ikss_a": ikss_a,
            "c_factor": c_factor,
            "tb_s": wylaczeniowy.tb_s,
            "przypadek": wylaczeniowy.przypadek,
            "maszyny": maszyny,
        }
        zrodlo_tb = ShortCircuitIEC60909Solver._zrodlo_tb_wyniku(wylaczeniowy.czas_tb)
        if zrodlo_tb is not None:
            wejscia["tb_zrodlo"] = zrodlo_tb
        skladniki = " - ".join(
            f"{fmt(zanik.delta_u_wzgledne)} \\cdot (1 - {fmt(zanik.mu)} \\cdot "
            f"{fmt(zanik.q)}) \\cdot {fmt(zanik.ikss_czesciowy_a)}"
            for _, zanik in wylaczeniowy.zaniki
        )
        podstawienie = f"{fmt(ikss_a)} - {skladniki}"
        tracer.add(
            key="Ib",
            title="Prąd wyłączeniowy symetryczny",
            formula_latex=wzor,
            inputs=wejscia,
            substitution=podstawienie,
            substitution_latex=podstawienie,
            result={"ib_a": wylaczeniowy.ib_a},
            notes=(
                "Zwarcie z udziałem maszyn wirujących (IEC 60909-0:2016, rozdz. 9): od Ik'' "
                "odejmuje się zanik składowej okresowej każdej maszyny; μ z krotności "
                "Ik,m''/Ir,m na zaciskach maszyny i t_min = t_b, q = 1 dla maszyny "
                "synchronicznej, q z mocy na parę biegunów dla asynchronicznej; ΔU''_m — spadek "
                "na reaktancji podprzejściowej maszyny. Źródła przekształtnikowe wchodzą do "
                "Ik'' i Ib bez zaniku." + ShortCircuitIEC60909Solver._uwaga_tb(wylaczeniowy.czas_tb)
            ),
        )

    @staticmethod
    def _uwaga_tb(czas_tb: CzasWylaczeniaTb) -> str:
        """Zdanie komentarza obliczeń o pochodzeniu t_b (puste dla t_b projektanta)."""
        if czas_tb.pochodzenie == POCHODZENIE_TB_PROJEKTANT:
            return ""
        return f" Czas wyłączenia: {czas_tb.opis_pl}"

    @staticmethod
    def _append_skladowa_nieokresowa_trace(
        tracer: WhiteBoxTracer, *, czas_tb: CzasWylaczeniaTb, skladowa: SkladowaNieokresowa
    ) -> None:
        """Krok śladu „iDC" — składowa nieokresowa w chwili t_b (IEC 60909-0:2016, rozdz. 10)."""
        fmt = ShortCircuitIEC60909Solver._format_float
        wzor = r"i_{DC} = \sqrt{2} \cdot I_{k}'' \cdot e^{-2 \pi f \, t_b \, R/X}"
        zrodlo_tb = ShortCircuitIEC60909Solver._zrodlo_tb_wyniku(czas_tb)
        podstawienie = (
            f"\\sqrt{{2}} \\cdot {fmt(skladowa.ikss_a)} \\cdot "
            f"e^{{-2 \\pi \\cdot 50 \\cdot {fmt(skladowa.tb_s)} \\cdot "
            f"{fmt(skladowa.rx_ratio)}}}"
        )
        tracer.add(
            key="iDC",
            title="Składowa nieokresowa prądu zwarciowego w chwili t_b",
            formula_latex=wzor,
            inputs={
                "ikss_a": skladowa.ikss_a,
                "tb_s": skladowa.tb_s,
                "rx_ratio": skladowa.rx_ratio,
                "f_hz": 50.0,
                "wykladnik": skladowa.wykladnik,
                "wspolczynnik_zaniku": skladowa.wspolczynnik_zaniku,
                **({"tb_zrodlo": zrodlo_tb} if zrodlo_tb is not None else {}),
            },
            substitution=podstawienie,
            substitution_latex=podstawienie,
            result={"i_dc_a": skladowa.i_dc_a},
            notes=(
                "Ik'' części sieci niosącej składową nieokresową (sieć zasilająca i maszyny "
                "wirujące); źródła przekształtnikowe nie mają składowej nieokresowej "
                "(IEC 60909-0:2016). R/X — ten sam stosunek pętli zwarcia co we "
                "współczynniku κ." + ShortCircuitIEC60909Solver._uwaga_tb(czas_tb)
            ),
        )

    @staticmethod
    def _append_impedancja_przejscia_trace(
        tracer: WhiteBoxTracer, *, short_circuit_type: ShortCircuitType, z_f: complex
    ) -> None:
        """Krok White Box „Z_f" (karta OD-14): dana wejściowa i zakres ważności wyniku."""
        tracer.add(
            key="Zf",
            title="Impedancja przejścia w miejscu zwarcia (poza zakresem IEC 60909)",
            formula_latex=r"Z_f = R_f + j X_f",
            inputs={
                "r_f_ohm": z_f.real,
                "x_f_ohm": z_f.imag,
                "short_circuit_type": short_circuit_type.value,
            },
            substitution=ShortCircuitIEC60909Solver._format_complex(z_f),
            substitution_latex=ShortCircuitIEC60909Solver._format_complex_latex(z_f),
            result={"z_f_ohm": z_f, "z_f_abs_ohm": abs(z_f), "poza_zakresem_iec60909": True},
            notes=(
                "Norma IEC 60909 definiuje prąd zwarciowy dla zwarcia metalicznego (Z_f = 0). "
                "Wynik ze zwarcia przez impedancję przejścia jest poza zakresem normy: nie jest "
                "podstawą doboru wytrzymałości zwarciowej ani pakietu dowodowego aparatury."
            ),
        )

    @staticmethod
    def _formula_petli_z_impedancja(
        short_circuit_type: ShortCircuitType,
        *,
        z1: complex,
        z2: complex,
        z0: complex | None,
        z_f: complex,
    ) -> tuple[str, str]:
        """Wzór i podstawienie impedancji pętli ze Z_f — te same wyrażenia co
        `short_circuit_core.impedancja_petli_zwarcia` (jedno źródło wzorów pętli)."""
        fmt = ShortCircuitIEC60909Solver._format_complex_latex
        if short_circuit_type == ShortCircuitType.THREE_PHASE:
            return r"Z_k = Z_1 + Z_f", f"{fmt(z1)} + {fmt(z_f)}"
        if short_circuit_type == ShortCircuitType.TWO_PHASE:
            return r"Z_k = Z_1 + Z_2 + Z_f", f"{fmt(z1)} + {fmt(z2)} + {fmt(z_f)}"
        if z0 is None:
            # Nieosiągalne: `compute_equivalent_impedance` wymaga Z_0 dla 1F i 2F+G, zanim
            # powstanie ślad. Jawny błąd programu zamiast cichego zera we wzorze śladu.
            raise ValueError(f"Z0 is required for {short_circuit_type.value} loop formula")
        z0_val = z0
        if short_circuit_type == ShortCircuitType.SINGLE_PHASE_GROUND:
            return (
                r"Z_k = Z_1 + Z_2 + Z_0 + 3 Z_f",
                f"{fmt(z1)} + {fmt(z2)} + {fmt(z0_val)} + 3 \\cdot {fmt(z_f)}",
            )
        z0_toru = z0_val + 3.0 * z_f
        return (
            r"Z_k = Z_1 + \frac{Z_2 \cdot (Z_0 + 3 Z_f)}{Z_2 + Z_0 + 3 Z_f}",
            f"{fmt(z1)} + \\frac{{{fmt(z2)} \\cdot {fmt(z0_toru)}}}{{{fmt(z2 + z0_toru)}}}",
        )

    @staticmethod
    def _append_sanity_impedancji_trace(
        tracer: WhiteBoxTracer,
        *,
        short_circuit_type: ShortCircuitType,
        z_equiv: complex,
        z_equiv_metaliczne: complex,
        ikss_a: float,
        ikss_metaliczny_a: float,
        tlumienie_petli: float | None,
    ) -> None:
        """Krok White Box „sanity_Zf": prąd przez impedancję przejścia wobec zwarcia
        metalicznego tej samej pętli.

        Dla 3F, 2F i 1F impedancja pętli to SUMA impedancji metalicznej A i składnika
        k·Z_f (k = 1, 1, 3); przy Re(A), Im(A), R_f, X_f ≥ 0 zachodzi
        |A + k·Z_f|² = |A|² + |k·Z_f|² + 2k·Re(A·conj(Z_f)) ≥ |A|², więc |I_k(Z_f)| ≤ |I_k(0)|
        jest własnością algebraiczną. Dla 2F+G Z_f wchodzi do gałęzi RÓWNOLEGŁEJ
        Z_2 ∥ (Z_0 + 3Z_f) i ta własność NIE zachodzi ogólnie (Z_2 indukcyjna, Z_0 rezystancyjna
        dają |Z_2 ∥ (Z_0 + 3jX_f)| < |Z_2 ∥ Z_0|) — krok podaje stosunek bez twierdzenia.
        """
        szeregowa = short_circuit_type != ShortCircuitType.TWO_PHASE_GROUND
        # `bool`/`float` jawnie: impedancje z macierzy Z-bus są typu numpy, a ślad trafia do
        # artefaktu biegu (JSON) — `numpy.bool_` nie jest serializowalny ani równy `True`.
        przeslanka = bool(
            szeregowa and z_equiv_metaliczne.real >= 0.0 and z_equiv_metaliczne.imag >= 0.0
        )
        stosunek = float(ikss_a / ikss_metaliczny_a) if ikss_metaliczny_a > 0 else None
        tracer.add(
            key="sanity_Zf",
            title="Prąd zwarcia przez impedancję przejścia wobec zwarcia metalicznego",
            formula_latex=r"\left|I_k''(Z_f)\right| \le \left|I_k''(0)\right|",
            inputs={
                "z_equiv_ohm": z_equiv,
                "z_equiv_metaliczne_ohm": z_equiv_metaliczne,
                "ikss_a": ikss_a,
                "ikss_metaliczny_a": ikss_metaliczny_a,
                "tlumienie_petli": tlumienie_petli,
            },
            substitution=(
                f"{ShortCircuitIEC60909Solver._format_float(ikss_a)} A vs "
                f"{ShortCircuitIEC60909Solver._format_float(ikss_metaliczny_a)} A"
            ),
            substitution_latex=(
                f"{ShortCircuitIEC60909Solver._format_float(ikss_a)}"
                r" \le "
                f"{ShortCircuitIEC60909Solver._format_float(ikss_metaliczny_a)}"
            ),
            result={
                "stosunek": stosunek,
                "warunek_spelniony": bool(ikss_a <= ikss_metaliczny_a),
                "warunek_wynika_z_algebry": przeslanka,
            },
            notes=(
                "Pętla szeregowa (3F, 2F, 1F) z impedancją metaliczną w pierwszej ćwiartce: "
                "warunek wynika z algebry. Zwarcie dwufazowe z ziemią: Z_f w gałęzi równoległej "
                "składowej zerowej — stosunek podany bez twierdzenia. Wkład falowników "
                "przeniesiony do miejsca zwarcia mnożony przez tłumienie pętli "
                "|Z_k(0)|/|Z_k(Z_f)| — dla 3F to dokładna superpozycja Z_kj/(Z_kk + Z_f)."
            ),
        )

    @staticmethod
    def _inverter_transfer_factors(
        graph: NetworkGraph,
        fault_node_id: str,
        *,
        builder: AdmittanceMatrixBuilder | None = None,
        z_bus: np.ndarray | None = None,
    ) -> dict[str, float]:
        """
        Współczynniki przeniesienia wkładu falowników do węzła zwarcia.

        Falownik (IEC 60909-0 §6.8, źródło z pełnowymiarowym przekształtnikiem)
        jest źródłem PRĄDOWYM I_skPF = k·I_rN na SWOICH zaciskach. Prąd, który z
        tego wstrzyknięcia dopływa do zwarcia w węźle k, wynika z superpozycji na
        macierzy Z-bus:

            I_k = I_j · Z_kj / Z_kk

        Dodatkowo prąd znamionowy falownika jest wyrażony przy napięciu jego
        węzła, więc do węzła zwarcia przenosi się przekładnią U_j/U_k (rachunek
        w per-unit: I_pu = I_A / I_base, I_base = S_base/(√3·U_n)).

        Bez tego przeniesienia wkład falownika wchodził do zwarcia 1:1 w amperach,
        niezależnie od poziomu napięcia i odległości elektrycznej (V12K-184):
        15 mikroźródeł 0,4 kV dawało 21,5 kA na szynie 15 kV, czyli 559 MVA mocy
        zwarciowej z kilkunastu MW przyłączonej generacji.

        Dla falownika stojącego W węźle zwarcia współczynnik wynosi dokładnie 1
        (Z_kk/Z_kk = 1, U_j/U_k = 1) — sieci z DER na szynie zwarcia zachowują
        dotychczasowe wyniki co do bitu.
        """
        from network_model.solvers.short_circuit_core import build_zbus

        sources = graph.get_inverter_sources()
        if not sources:
            return {}
        if builder is None or z_bus is None:
            builder, z_bus = build_zbus(graph)

        index_map = builder.node_id_to_index
        fault_index = index_map.get(fault_node_id)
        if fault_index is None:
            return {}
        z_kk = z_bus[fault_index, fault_index]
        un_k = graph.nodes[fault_node_id].voltage_level
        if z_kk == 0 or un_k <= 0:
            return {}

        factors: dict[str, float] = {}
        for source in sources:
            source_index = index_map.get(source.node_id)
            node = graph.nodes.get(source.node_id)
            if source_index is None or node is None or node.voltage_level <= 0:
                continue
            z_kj = z_bus[fault_index, source_index]
            factors[source.id] = abs(z_kj / z_kk) * (node.voltage_level / un_k)
        return factors

    @staticmethod
    def _inverter_contributions_by_source(
        graph: NetworkGraph,
        fault_node_id: str,
        short_circuit_type: ShortCircuitType,
        tlumienie_petli: float | None = None,
    ) -> dict[str, float]:
        """Wkład prądowy [A] każdego falownika, przeniesiony do węzła zwarcia.

        `tlumienie_petli` (karta OD-14): przy zwarciu przez impedancję przejścia Z_f wkład
        przeniesiony mnoży się przez |Z_k(0)|/|Z_k(Z_f)| — dla 3F to dokładna superpozycja
        I_k = I_j·Z_kj/(Z_kk + Z_f); dla zwarć niesymetrycznych to samo przybliżenie, którym
        model falownika przenosi wkład przy Z_f = 0. `None` (zwarcie metaliczne) — bez mnożenia,
        wynik bit w bit jak przed kartą. JEDNO miejsce tego mnożenia dla sumy wkładów, listy
        wkładów źródeł i wkładów gałęziowych.
        """
        sources = graph.get_inverter_sources()
        if not sources:
            return {}
        factors = ShortCircuitIEC60909Solver._inverter_transfer_factors(graph, fault_node_id)
        contributions: dict[str, float] = {}
        for source in sources:
            i_terminal = ShortCircuitIEC60909Solver._inverter_contribution_for_type(
                source, short_circuit_type
            )
            contributions[source.id] = ShortCircuitIEC60909Solver._wklad_z_tlumieniem(
                i_terminal * factors.get(source.id, 0.0), tlumienie_petli
            )
        return contributions

    @staticmethod
    def _wklad_z_tlumieniem(i_contrib: float, tlumienie_petli: float | None) -> float:
        """Wkład falownika po tłumieniu pętli impedancją przejścia (karta OD-14)."""
        return i_contrib if tlumienie_petli is None else i_contrib * tlumienie_petli

    @staticmethod
    def _compute_inverter_contribution(
        graph: NetworkGraph,
        fault_node_id: str,
        short_circuit_type: ShortCircuitType,
        tlumienie_petli: float | None = None,
    ) -> float:
        """
        Sumuje wkład prądowy źródeł falownikowych zgodnie z IEC 60909 (model uproszczony).
        """
        return float(
            sum(
                ShortCircuitIEC60909Solver._inverter_contributions_by_source(
                    graph, fault_node_id, short_circuit_type, tlumienie_petli
                ).values()
            )
        )

    @staticmethod
    def _inverter_contribution_for_type(
        source: InverterSource,
        short_circuit_type: ShortCircuitType,
    ) -> float:
        if short_circuit_type == ShortCircuitType.THREE_PHASE:
            return source.ik_sc_a
        if short_circuit_type == ShortCircuitType.TWO_PHASE:
            return source.ik_sc_a if source.contributes_negative_sequence else 0.0
        if short_circuit_type in {
            ShortCircuitType.SINGLE_PHASE_GROUND,
            ShortCircuitType.TWO_PHASE_GROUND,
        }:
            return source.ik_sc_a if source.contributes_zero_sequence else 0.0
        return 0.0

    @staticmethod
    def _build_source_contributions(
        graph: NetworkGraph,
        fault_node_id: str,
        short_circuit_type: ShortCircuitType,
        ik_thevenin_a: float,
        ik_total_a: float,
        tlumienie_petli: float | None = None,
    ) -> list[ShortCircuitSourceContribution]:
        """
        Buduje listę wkładów prądowych źródeł do prądu zwarcia.
        """
        contributions: list[ShortCircuitSourceContribution] = []
        base = ik_total_a if ik_total_a > 0 else 0.0
        grid_share = ik_thevenin_a / base if base > 0 else 0.0
        contributions.append(
            ShortCircuitSourceContribution(
                source_id="THEVENIN_GRID",
                source_name="Thevenin Grid",
                source_type=SourceType.GRID,
                node_id=None,
                i_contrib_a=ik_thevenin_a,
                share=grid_share,
            )
        )

        # Wkłady przeniesione do węzła zwarcia (V12K-184) — te same wartości, które
        # sumują się do ik_inverters_a, więc udziały (share) sumują się do 1.
        referred = ShortCircuitIEC60909Solver._inverter_contributions_by_source(
            graph, fault_node_id, short_circuit_type, tlumienie_petli
        )
        for source in graph.get_inverter_sources():
            i_contrib = referred.get(source.id, 0.0)
            share = i_contrib / base if base > 0 else 0.0
            contributions.append(
                ShortCircuitSourceContribution(
                    source_id=source.id,
                    source_name=source.name,
                    source_type=SourceType.INVERTER,
                    node_id=source.node_id,
                    i_contrib_a=i_contrib,
                    share=share,
                )
            )

        contributions.sort(key=lambda item: (item.source_type != SourceType.GRID, item.source_id))
        return contributions

    @staticmethod
    def _build_branch_contributions_for_inverters(
        graph: NetworkGraph,
        fault_node_id: str,
        short_circuit_type: ShortCircuitType,
        tlumienie_petli: float | None = None,
        *,
        builder: AdmittanceMatrixBuilder | None = None,
        z_bus: np.ndarray | None = None,
    ) -> tuple[list[ShortCircuitBranchContribution], list[WkladPominiety]]:
        """
        Wkłady falowników do prądów gałęzi (superpozycja Z-bus, moduły RMS).

        Metoda identyczna z torem Thevenina: iniekcja JEDNOSTKOWA (+1 w węźle
        źródła, −1 w węźle zwarcia) daje bezwymiarowe współczynniki podziału
        ``f = (V_i − V_j)·y_ij`` (admitancja szeregowa w per-unit, SPÓJNA z
        macierzą Y-bus), a prąd gałęzi ``I = |f| · I_wkład``. ``I_wkład`` to
        wkład falownika PRZENIESIONY do węzła zwarcia (V12K-184).

        Klasyfikacja wkładu (karta PROG-ZERA-WKLADOW, zgoda B-01 z 2026-10-21) — JEDEN
        predykat `jest_wkladem_pominietym` (|I| < 1e-6 A): wkład gałęzi o takim prądzie to
        „wkład pominięty na podstawie tolerancji numerycznej (|I| < 1e-6 A)” — nie trafia
        do listy wkładów, tylko do zwracanego zestawienia wkładów pominiętych (surowe |I|
        i kąt fazora). Ten sam predykat na wkładzie przeniesionym źródła: źródło, którego
        wkład do zwarcia jest pomijalny, nie rozprowadza prądu po gałęziach (surowa wartość
        stoi w `contributions` wyniku). Zwraca (wkłady, wkłady pominięte).
        """
        sources = graph.get_inverter_sources()
        if not sources:
            return [], []

        from network_model.solvers.short_circuit_core import build_zbus

        if builder is None or z_bus is None:
            builder, z_bus = build_zbus(graph)
        contributions: list[ShortCircuitBranchContribution] = []
        pominiete: list[WkladPominiety] = []

        fault_index = builder.node_id_to_index.get(fault_node_id)
        if fault_index is None:
            return [], []
        factors = ShortCircuitIEC60909Solver._inverter_transfer_factors(
            graph, fault_node_id, builder=builder, z_bus=z_bus
        )

        for source in sources:
            i_terminal = ShortCircuitIEC60909Solver._inverter_contribution_for_type(
                source, short_circuit_type
            )
            # Dana wejściowa źródła (k·I_rN z deklaracji; 0.0 = źródło nie zasila zwarć tego
            # rodzaju), nie wkład policzony — predykat dziedziny danej, nie tolerancji.
            if i_terminal <= 0:
                continue
            source_index = builder.node_id_to_index.get(source.node_id)
            if source_index is None or source_index == fault_index:
                continue
            i_contrib = ShortCircuitIEC60909Solver._wklad_z_tlumieniem(
                i_terminal * factors.get(source.id, 0.0), tlumienie_petli
            )
            if jest_wkladem_pominietym(i_contrib):
                continue

            # FIX (karta W-C, Zero-Debt): wektor iniekcji MUSI mieć wymiar macierzy
            # Z-bus (liczba węzłów REPREZENTATYWNYCH po scaleniu zamkniętych
            # łączników), nie liczbę wszystkich węzłów — `node_id_to_index` mapuje
            # KAŻDY węzeł na indeks reprezentanta, więc przy scaleniach
            # len(node_id_to_index) > z_bus.shape[0] i mnożenie pękało (matmul
            # mismatch) dla każdej sieci z zamkniętym łącznikiem. Defekt
            # pre-existing toru `include_branch_contributions` (scenariusze).
            i_inj = np.zeros(z_bus.shape[0], dtype=complex)
            i_inj[source_index] = complex(1.0, 0.0)
            i_inj[fault_index] = complex(-1.0, 0.0)
            v_nodes = z_bus @ i_inj

            for branch_id, branch in graph.branches.items():
                if not getattr(branch, "in_service", True):
                    continue
                # Admitancja w PER-UNIT — Z-bus też jest w pu; wcześniej ten tor
                # mieszał pu z omami (SI), co dawało niespójne moduły prądów.
                admittance = ShortCircuitIEC60909Solver._series_admittance_pu(builder, branch)
                if admittance is None:
                    continue
                y_series, ratio = admittance
                from_index = builder.node_id_to_index.get(branch.from_node_id)
                to_index = builder.node_id_to_index.get(branch.to_node_id)
                if from_index is None or to_index is None:
                    continue
                v_from = v_nodes[from_index]
                v_to = v_nodes[to_index]
                # Prąd po stronie `from` w modelu z przekładnią poza-znamionową
                # (V12K-186); dla a = 1 redukuje się do (V_from − V_to)·y.
                i_branch = (v_from / (ratio * ratio) - v_to / ratio) * y_series * i_contrib
                i_mag = abs(i_branch)
                if jest_wkladem_pominietym(i_mag):
                    pominiete.append(
                        WkladPominiety.z_wartosci(
                            tor=TOR_FALOWNIK,
                            source_id=source.id,
                            branch_id=branch_id,
                            i_a=float(i_mag),
                            fazor_a=complex(i_branch),
                        )
                    )
                    continue
                direction = "from_to" if abs(v_from) >= abs(v_to) else "to_from"
                contributions.append(
                    ShortCircuitBranchContribution(
                        source_id=source.id,
                        branch_id=branch_id,
                        from_node_id=branch.from_node_id,
                        to_node_id=branch.to_node_id,
                        i_contrib_a=i_mag,
                        direction=direction,
                    )
                )

        contributions.sort(key=lambda item: (item.source_id, item.branch_id))
        pominiete.sort(key=lambda item: (item.source_id, item.branch_id))
        return contributions, pominiete

    @staticmethod
    def _series_admittance_pu(builder: object, branch: object) -> tuple[complex, float] | None:
        """Admitancja szeregowa gałęzi w per-unit + przekładnia — SPÓJNE z Y-bus.

        Reużywa `AdmittanceMatrixBuilder._get_branch_admittances_pu` (ten sam
        buider co `build_zbus`), dzięki czemu prawo Kirchhoffa (KCL) domyka się
        w napięciach węzłowych z Z-bus — warunek konieczny dokładnego bilansu
        rozpływu Thevenina z Ik'' w węźle zwarcia. Gałąź o nieobsługiwanym typie
        albo zerowej impedancji → None (pomijana, jak w torze superpozycji).

        Zwraca `(y_series_pu, a)`, gdzie `a` to przekładnia poza-znamionowa
        gałęzi (1.0 dla linii i kabli). Prąd po stronie `from` liczy się wtedy
        jako `(V_from/a² − V_to/a)·y` — przy `a = 1` to zwykłe `(V_from−V_to)·y`.
        """
        getter = getattr(builder, "_get_branch_admittances_pu", None)
        if getter is None:
            return None
        try:
            y_series_pu, _shunt, ratio = getter(branch)
        except (ValueError, ZeroDivisionError):
            return None
        return y_series_pu, float(ratio)

    @staticmethod
    def _build_branch_contributions_for_thevenin(
        graph: NetworkGraph,
        fault_node_id: str,
        ik_thevenin_a: float,
        *,
        builder: AdmittanceMatrixBuilder | None = None,
        z_bus: np.ndarray | None = None,
    ) -> tuple[list[ShortCircuitBranchContribution], list[dict], list[WkladPominiety]]:
        """Rozpływ prądu zwarciowego źródła zastępczego (Thevenin / sieć
        nadrzędna) po gałęziach — WHITE BOX (V12K-132, pkt 7 karty właściciela).

        Metoda (ZERO heurystyk, wyłącznie algebra Z-bus — standardowy podział
        prądów): iniekcja jednostkowa -1 (pu) w węźle zwarcia daje napięcia
        węzłowe ze zwarcia ``V = Z_bus · i_inj``. Współczynnik podziału gałęzi
        ``f = (V_i − V_j) · y_ij`` (admitancja szeregowa pu SPÓJNA z Y-bus), a
        prąd gałęzi ``I = |f| · Ik''(Thevenin)``. Z KCL suma modułów
        współczynników gałęzi wchodzących do węzła zwarcia = 1, więc
        ``Σ I_gałęzi(→ węzeł) = Ik''(Thevenin)`` — bilans dokładny (dowód
        testem). Topologia podziału z sieci zgodnej (``build_zbus`` — TA SAMA
        macierz co istniejący tor superpozycji falownikowej); moduł prądu z
        ``Ik''(Thevenin)`` zależnego od typu zwarcia (spójnie z torem
        superpozycji, który też skaluje jeden podział pu wielkością per typ).

        Klasyfikacja wkładu (karta PROG-ZERA-WKLADOW, zgoda B-01 z 2026-10-21) — JEDEN
        predykat `jest_wkladem_pominietym` (|I| < 1e-6 A), ten sam co w torze falownikowym:
        gałąź o takim prądzie to „wkład pominięty na podstawie tolerancji numerycznej
        (|I| < 1e-6 A)” — bez wpisu na liście wkładów i bez kroku śladu
        ``thevenin_flow_<gałąź>``, z wpisem w zwracanym zestawieniu wkładów pominiętych
        (surowe |I| i kąt fazora). Suma kontrolna KCL obejmuje gałęzie OPUBLIKOWANE — ten
        sam zbiór co lista wkładów i kroki śladu.

        Zwraca (wkłady per gałąź, ślad WHITE BOX, wkłady pominięte). Pomijalny
        ``ik_thevenin_a`` (brak źródła zastępczego) → ([], [], []) — uczciwy brak, jak tor
        superpozycji dla sieci bez falowników; surowa wartość stoi w `contributions` wyniku.
        """
        if jest_wkladem_pominietym(ik_thevenin_a):
            return [], [], []

        from network_model.solvers.short_circuit_core import build_zbus

        if builder is None or z_bus is None:
            builder, z_bus = build_zbus(graph)
        fault_index = builder.node_id_to_index.get(fault_node_id)
        if fault_index is None:
            return [], [], []

        # Iniekcja jednostkowa w węźle zwarcia (współczynniki podziału prądu).
        i_inj = np.zeros(z_bus.shape[0], dtype=complex)
        i_inj[fault_index] = complex(-1.0, 0.0)
        v_nodes = z_bus @ i_inj

        contributions: list[ShortCircuitBranchContribution] = []
        pominiete: list[WkladPominiety] = []
        tracer = WhiteBoxTracer()
        tracer.add(
            key="thevenin_flow_setup",
            title="Podział prądu Thevenina — iniekcja jednostkowa w węźle zwarcia",
            formula_latex=(
                r"\underline{V} = \underline{Z}_{bus} \cdot \underline{i}_{inj},"
                r"\quad \underline{i}_{inj,k} = -1"
            ),
            inputs={
                "fault_node_id": fault_node_id,
                "fault_index": fault_index,
                "ik_thevenin_a": ik_thevenin_a,
                "n_nodes": int(z_bus.shape[0]),
            },
            substitution=f"i_inj[{fault_index}] = -1 (pu); V = Z_bus @ i_inj",
            substitution_latex=f"\\underline{{i}}_{{inj,{fault_index}}} = -1",
            result={"v_nodes_pu": [complex(v) for v in v_nodes]},
            notes=(
                "Napięcia węzłowe ze zwarcia z macierzy Z-bus sieci zgodnej "
                "(build_zbus, ta sama macierz co tor superpozycji falownikowej)."
            ),
        )

        fraction_sum_into_fault = 0.0
        for branch_id, branch in graph.branches.items():
            if not getattr(branch, "in_service", True):
                continue
            admittance = ShortCircuitIEC60909Solver._series_admittance_pu(builder, branch)
            if admittance is None:
                continue
            y_series_pu, ratio = admittance
            from_index = builder.node_id_to_index.get(branch.from_node_id)
            to_index = builder.node_id_to_index.get(branch.to_node_id)
            if from_index is None or to_index is None or from_index == to_index:
                continue
            v_from = v_nodes[from_index]
            v_to = v_nodes[to_index]
            # Jak wyżej (V12K-186): prąd strony `from` przy przekładni a.
            fraction = (v_from / (ratio * ratio) - v_to / ratio) * y_series_pu
            f_mag = float(abs(fraction))
            i_a = f_mag * ik_thevenin_a
            if jest_wkladem_pominietym(i_a):
                pominiete.append(
                    WkladPominiety.z_wartosci(
                        tor=TOR_THEVENIN,
                        source_id=THEVENIN_GRID_SOURCE_ID,
                        branch_id=branch_id,
                        i_a=i_a,
                        fazor_a=complex(fraction) * ik_thevenin_a,
                    )
                )
                continue
            # Kierunek: prąd zwarciowy płynie DO węzła zwarcia. W iniekcji
            # jednostkowej |V| rośnie w stronę zwarcia (największe |V| = węzeł
            # zwarcia), więc prąd płynie do węzła o większym |V|: "from_to" gdy
            # koniec "to" jest bliżej zwarcia (|V_to| >= |V_from|).
            direction = "from_to" if abs(v_to) >= abs(v_from) else "to_from"
            # Bilans KCL: licz udział gałęzi WCHODZĄCEJ do węzła zwarcia.
            if branch.to_node_id == fault_node_id and direction == "from_to":
                fraction_sum_into_fault += f_mag
            elif branch.from_node_id == fault_node_id and direction == "to_from":
                fraction_sum_into_fault += f_mag
            contributions.append(
                ShortCircuitBranchContribution(
                    source_id=THEVENIN_GRID_SOURCE_ID,
                    branch_id=branch_id,
                    from_node_id=branch.from_node_id,
                    to_node_id=branch.to_node_id,
                    i_contrib_a=i_a,
                    direction=direction,
                )
            )
            tracer.add(
                key=f"thevenin_flow_{branch_id}",
                title=f"Prąd zwarciowy Thevenina w gałęzi {branch.name}",
                formula_latex=(
                    r"I_{ga\l} = \left| (\underline{V}_i - \underline{V}_j)\,"
                    r"\underline{y}_{ij} \right| \cdot I_k''^{(Th)}"
                ),
                inputs={
                    "branch_id": branch_id,
                    "from_node_id": branch.from_node_id,
                    "to_node_id": branch.to_node_id,
                    "v_from_pu": complex(v_from),
                    "v_to_pu": complex(v_to),
                    "y_series_pu": complex(y_series_pu),
                    "ik_thevenin_a": ik_thevenin_a,
                },
                substitution=(
                    f"|({ShortCircuitIEC60909Solver._format_complex(complex(v_from))} - "
                    f"{ShortCircuitIEC60909Solver._format_complex(complex(v_to))}) * "
                    f"{ShortCircuitIEC60909Solver._format_complex(complex(y_series_pu))}| * "
                    f"{ShortCircuitIEC60909Solver._format_float(ik_thevenin_a)}"
                ),
                substitution_latex=(
                    f"\\left| \\left("
                    f"{ShortCircuitIEC60909Solver._format_complex_latex(complex(v_from))}"
                    f" - {ShortCircuitIEC60909Solver._format_complex_latex(complex(v_to))}"
                    f"\\right) \\cdot "
                    f"{ShortCircuitIEC60909Solver._format_complex_latex(complex(y_series_pu))}"
                    f"\\right| \\cdot "
                    f"{ShortCircuitIEC60909Solver._format_float(ik_thevenin_a)}"
                ),
                result={
                    "fraction": f_mag,
                    "i_contrib_a": i_a,
                    "direction": direction,
                },
            )

        contributions.sort(key=lambda item: (item.source_id, item.branch_id))
        tracer.add(
            key="thevenin_flow_balance",
            title="Suma kontrolna bilansu prądu w węźle zwarcia (KCL)",
            formula_latex=r"\sum_{ga\l \to k} I_{ga\l} = I_k''^{(Th)}",
            inputs={
                "fault_node_id": fault_node_id,
                "ik_thevenin_a": ik_thevenin_a,
            },
            substitution=(
                f"Σ = {ShortCircuitIEC60909Solver._format_float(fraction_sum_into_fault * ik_thevenin_a)}"
                f" ≈ {ShortCircuitIEC60909Solver._format_float(ik_thevenin_a)}"
            ),
            substitution_latex=(
                f"\\sum = {ShortCircuitIEC60909Solver._format_float(fraction_sum_into_fault * ik_thevenin_a)}"
                f" \\approx {ShortCircuitIEC60909Solver._format_float(ik_thevenin_a)}"
            ),
            result={
                "sum_into_fault_a": fraction_sum_into_fault * ik_thevenin_a,
                "fraction_sum": fraction_sum_into_fault,
            },
            notes=(
                "KCL: suma modułów współczynników gałęzi wchodzących do węzła "
                "zwarcia = 1, więc Σ prądów gałęziowych = Ik''(Thevenin)."
            ),
        )
        pominiete.sort(key=lambda item: (item.source_id, item.branch_id))
        return contributions, tracer.to_list(), pominiete

    @staticmethod
    def _build_branch_contributions(
        graph: NetworkGraph,
        fault_node_id: str,
        short_circuit_type: ShortCircuitType,
        ik_thevenin_a: float,
        ik_total_a: float,
        tlumienie_petli: float | None = None,
    ) -> tuple[
        list[ShortCircuitBranchContribution],
        list[dict],
        list[WkladPominiety],
        list[WkladZrodla],
        list[dict],
    ]:
        """Łączy wkłady gałęziowe: superpozycja falownikowa (istniejąca,
        BEZ ZMIAN) + rozpływ Thevenina (V12K-132, addytywnie). Deterministyczny
        sort ``(source_id, branch_id)`` — wpisy falownikowe zachowują swoje
        wartości bajt-w-bajt (source_id inwertera vs "THEVENIN_GRID").

        Wkłady pominięte obu torów (|I| < 1e-6 A, karta PROG-ZERA-WKLADOW) — ten sam sort;
        niepuste zestawienie dokłada do śladu krok `wklady_pominiete` z bilansem per tor.

        Karta WKLAD-ZRODLA: wkłady źródeł (`_wklady_zrodel`) z TEJ SAMEJ macierzy Z-bus co oba
        tory rozpływu — macierz jest budowana raz, tutaj (wcześniej każdy tor odwracał Y
        osobno; ta sama macierz wejściowa daje te same liczby, więc listy gałęziowe są bit
        w bit takie jak przed kartą)."""
        from network_model.solvers.short_circuit_core import build_zbus

        builder, z_bus = build_zbus(graph)
        inverter, pominiete_fal = (
            ShortCircuitIEC60909Solver._build_branch_contributions_for_inverters(
                graph,
                fault_node_id,
                short_circuit_type,
                tlumienie_petli,
                builder=builder,
                z_bus=z_bus,
            )
        )
        thevenin, trace, pominiete_th = (
            ShortCircuitIEC60909Solver._build_branch_contributions_for_thevenin(
                graph, fault_node_id, ik_thevenin_a, builder=builder, z_bus=z_bus
            )
        )
        combined = sorted(inverter + thevenin, key=lambda item: (item.source_id, item.branch_id))
        pominiete = sorted(
            pominiete_fal + pominiete_th, key=lambda item: (item.source_id, item.branch_id)
        )
        if pominiete:
            trace = [*trace, ShortCircuitIEC60909Solver._krok_wkladow_pominietych(pominiete)]
        wklady_zrodel, slad_zrodel = ShortCircuitIEC60909Solver._wklady_zrodel(
            graph=graph,
            fault_node_id=fault_node_id,
            short_circuit_type=short_circuit_type,
            ik_thevenin_a=ik_thevenin_a,
            ik_total_a=ik_total_a,
            builder=builder,
            z_bus=z_bus,
        )
        return combined, trace, pominiete, wklady_zrodel, slad_zrodel

    @staticmethod
    def _wklady_zrodel(
        *,
        graph: NetworkGraph,
        fault_node_id: str,
        short_circuit_type: ShortCircuitType,
        ik_thevenin_a: float,
        ik_total_a: float,
        builder: AdmittanceMatrixBuilder,
        z_bus: np.ndarray,
    ) -> tuple[list[WkladZrodla], list[dict]]:
        """Wkład każdego źródła części Thevenina do prądu zwarciowego — WHITE BOX.

        Metoda zastępczego źródła napięcia (IEC 60909-0:2016 §4.2; karta WKLAD-ZRODLA, zgoda
        B-01 architekta z 2026-10-22). Sieć jest pasywna, a jedynym źródłem jest c·U_n/√3
        w miejscu zwarcia f; zasilania systemowe (Y_Q = 1/Z_Q), szyny sztywne i maszyny
        wirujące (Y″ = 1/Z″) są bocznikami macierzy Y. Prąd zwarciowy I_f odpływa z węzła f,
        więc napięcia ze zwarcia ΔV = −Z_bus[:, f]·I_f, a prąd bocznika k od źródła do sieci:

            I_Q,k = Y_Q,k · Z_kf · I_k''^(Th)

        (ta sama kolumna Z_kf, z której rozpływ Thevenina bierze napięcia węzłowe —
        ``thevenin_flow_setup`` ma V = −Z_bus[:, f]; kierunek „do węzła zwarcia" jak we wkładach
        gałęziowych). Admitancje źródeł per węzeł pochodzą z metod stemplujących budowniczego
        (`admitancje_zrodel_macierzy`), rozbicie na źródła — `boczniki_zrodel`; macierz Y to
        ta sama macierz sieci zwarciowej, którą odwrócono (`builder.build()` w trybie
        domyślnym, czyli zwarciowym — tym samym co `build_zbus`; krok bilansu sprawdza
        zgodność, bo Σ_j (Σ_i Y_ij)·Z_jf = 1 tylko dla Y = Z⁻¹). Rozkład liczy się w sieci zgodnej
        dla każdego rodzaju zwarcia, skalowany prądem I_k''^(Th) tego rodzaju — ta sama podstawa
        co wkłady gałęziowe; dla zwarć doziemnych (1F, 2F+Z) składowa zerowa rozpływa się
        w sieci zerowej, której rozkładu na źródła rdzeń nie liczy (zakres w śladzie).

        Klasyfikacja wpisu: źródło w innej wyspie macierzy niż węzeł zwarcia
        (`wyspy_macierzy` — wzór niezerowych wpisów Y) ma wkład STRUKTURALNIE zerowy
        z przyczyną; inaczej JEDEN predykat `jest_wkladem_pominietym` (|I| < 1e-6 A).

        Bilans (krok śladu ``wklady_zrodel_bilans``): z Y·Z = 1 suma kolumny f iloczynu daje
        Σ_j s_j·Z_jf = 1, gdzie s_j = Σ_i Y_ij (suma kolumnowa). s_j = admitancja źródeł węzła
        j (stempel) + człon poprzeczny gałęzi c_j (pojemności linii, jeśli wchodzą do sieci
        zwarciowej, i przekładnia poza-znamionowa: y·(1 − 1/a)² na gałąź). Stąd
        Σ_k I_Q,k + Σ_j c_j·Z_jf·I_k''^(Th) = I_k''^(Th); reszta (fazorowo, z wkładami
        pominiętymi) w `tolerancja_bilansu_a`; I_k'' = I_k''^(Th) + I_k(falowniki).
        """
        fault_index = builder.node_id_to_index.get(fault_node_id)
        if fault_index is None:
            return [], []
        # Typy JSON-owe wpisów i śladu (rdzeń podaje prąd jako ``numpy.float64``): konwersja
        # ``float`` jest dokładna — liczby bez zmian, ``bilans_domkniety`` to ``bool``.
        ik_thevenin_a = float(ik_thevenin_a)
        ik_total_a = float(ik_total_a)
        fmt = ShortCircuitIEC60909Solver._format_float
        fmt_c = ShortCircuitIEC60909Solver._format_complex
        fmt_cl = ShortCircuitIEC60909Solver._format_complex_latex
        y_bus = builder.build()
        admitancje_zrodel = admitancje_zrodel_macierzy(builder, y_bus.shape[0])
        wyspy = wyspy_macierzy(y_bus)
        wyspa_zwarcia = wyspy[fault_index]
        un_f_kv = graph.nodes[fault_node_id].voltage_level
        tracer = WhiteBoxTracer()
        wpisy: list[WkladZrodla] = []
        suma_fazorowa = 0j
        suma_modulow = 0.0
        for bocznik in boczniki_zrodel(graph, builder, admitancje_zrodel):
            if wyspy[bocznik.indeks] != wyspa_zwarcia:
                wpis = WkladZrodla(
                    rodzaj=bocznik.rodzaj,
                    source_id=bocznik.element_id,
                    source_name=bocznik.nazwa,
                    node_id=bocznik.node_id,
                    klasa=KLASA_WKLADU_ZRODLA_INNA_WYSPA,
                    i_a=0.0,
                    i_zaciski_a=0.0,
                    kat_deg=None,
                    udzial=0.0,
                    przyczyna=PRZYCZYNA_WKLADU_INNA_WYSPA,
                )
                wpisy.append(wpis)
                tracer.add(
                    key=f"wklad_zrodla_{bocznik.element_id}",
                    title=f"Wkład źródła {bocznik.nazwa} do prądu zwarciowego",
                    formula_latex=r"\underline{I}_{Q,k} = 0",
                    inputs={
                        "source_id": bocznik.element_id,
                        "rodzaj": bocznik.rodzaj,
                        "node_id": bocznik.node_id,
                        "y_pu": complex(bocznik.y_pu),
                        "ik_thevenin_a": ik_thevenin_a,
                    },
                    substitution=(
                        "Źródło w innej wyspie niż węzeł zwarcia — Z_kf = 0 z topologii, I = 0 A."
                    ),
                    substitution_latex=r"\underline{Z}_{kf} = 0 \Rightarrow \underline{I}_{Q,k} = 0",
                    result={
                        "i_a": 0.0,
                        "i_zaciski_a": 0.0,
                        "klasa": KLASA_WKLADU_ZRODLA_INNA_WYSPA,
                    },
                    notes=PRZYCZYNA_WKLADU_INNA_WYSPA,
                )
                continue
            # U_n węzła źródła jest dodatnie: szynę z U_n ≤ 0 blokuje walidator ENM (E004),
            # a gałąź do węzła z U_n = 0 nie daje się zestemplować (Z_base = 0) — przelicznik
            # na zaciski liczony wprost, bez zastępnika dla „U_n = 0".
            un_k_kv = graph.nodes[bocznik.node_id].voltage_level
            z_kf = complex(z_bus[bocznik.indeks, fault_index])
            wspolczynnik = complex(bocznik.y_pu) * z_kf
            fazor_a = wspolczynnik * ik_thevenin_a
            i_a = abs(wspolczynnik) * ik_thevenin_a
            suma_fazorowa += fazor_a
            suma_modulow += i_a
            pominiety = jest_wkladem_pominietym(i_a)
            kat = None if wspolczynnik == 0 else math.degrees(cmath.phase(wspolczynnik))
            i_zaciski_a = i_a * un_f_kv / un_k_kv
            udzial = i_a / ik_total_a if ik_total_a > 0 else 0.0
            if pominiety:
                wpis = WkladZrodla(
                    rodzaj=bocznik.rodzaj,
                    source_id=bocznik.element_id,
                    source_name=bocznik.nazwa,
                    node_id=bocznik.node_id,
                    klasa=KLASA_WKLADU_ZRODLA_POMINIETY,
                    i_a=zaokraglij_cyfry_znaczace(i_a),
                    i_zaciski_a=zaokraglij_cyfry_znaczace(i_zaciski_a),
                    kat_deg=None if kat is None else zaokraglij_cyfry_znaczace(kat),
                    udzial=zaokraglij_cyfry_znaczace(udzial),
                    przyczyna=NAZWA_WKLADU_POMINIETEGO,
                )
            else:
                wpis = WkladZrodla(
                    rodzaj=bocznik.rodzaj,
                    source_id=bocznik.element_id,
                    source_name=bocznik.nazwa,
                    node_id=bocznik.node_id,
                    klasa=KLASA_WKLADU_ZRODLA,
                    i_a=i_a,
                    i_zaciski_a=i_zaciski_a,
                    kat_deg=kat,
                    udzial=udzial,
                    przyczyna=None,
                )
            wpisy.append(wpis)
            tracer.add(
                key=f"wklad_zrodla_{bocznik.element_id}",
                title=f"Wkład źródła {bocznik.nazwa} do prądu zwarciowego",
                formula_latex=(
                    r"\underline{I}_{Q,k} = \underline{Y}_{Q,k} \cdot \underline{Z}_{kf} \cdot "
                    r"I_k''^{(Th)}"
                ),
                inputs={
                    "source_id": bocznik.element_id,
                    "rodzaj": bocznik.rodzaj,
                    "node_id": bocznik.node_id,
                    "y_pu": complex(bocznik.y_pu),
                    "z_kf_pu": z_kf,
                    "ik_thevenin_a": ik_thevenin_a,
                    "un_zwarcia_kv": un_f_kv,
                    "un_zrodla_kv": un_k_kv,
                },
                substitution=(
                    f"I = |({fmt_c(complex(bocznik.y_pu))}) * ({fmt_c(z_kf)})| * "
                    f"{fmt(ik_thevenin_a)} A = {fmt(i_a)} A"
                ),
                substitution_latex=(
                    f"\\left| {fmt_cl(complex(bocznik.y_pu))} \\cdot {fmt_cl(z_kf)} \\right| "
                    f"\\cdot {fmt(ik_thevenin_a)}\\,\\mathrm{{A}} = {fmt(i_a)}\\,\\mathrm{{A}}"
                ),
                result={
                    "wspolczynnik_pu": wspolczynnik,
                    "i_a": i_a,
                    "i_zaciski_a": i_zaciski_a,
                    "kat_deg": kat,
                    "klasa": wpis.klasa,
                },
                notes=wpis.przyczyna,
            )
        czlony = y_bus.sum(axis=0) - admitancje_zrodel
        wspolczynnik_czlonow = complex(czlony @ z_bus[:, fault_index])
        prad_czlonow = wspolczynnik_czlonow * ik_thevenin_a
        suma_bilansu = suma_fazorowa + prad_czlonow
        reszta_a = float(abs(suma_bilansu - ik_thevenin_a))
        tolerancja_a = tolerancja_bilansu_a(ik_thevenin_a)
        ik_inverters_a = ik_total_a - ik_thevenin_a
        tracer.add(
            key="wklady_zrodel_bilans",
            title="Bilans wkładów źródeł w węźle zwarcia",
            formula_latex=(
                r"\sum_{Q} \underline{I}_{Q,k} + \underline{I}_{\text{poprz}} = "
                r"I_k''^{(Th)}, \quad I_k'' = I_k''^{(Th)} + I_{k}^{(\text{fal})}"
            ),
            inputs={
                "fault_node_id": fault_node_id,
                "short_circuit_type": short_circuit_type.value,
                "ik_thevenin_a": ik_thevenin_a,
                "ik_inverters_a": ik_inverters_a,
                "ik_total_a": ik_total_a,
                "liczba_zrodel": len(wpisy),
                "tolerancja_wzgledna": TOLERANCJA_WZGLEDNA_BILANSU,
                "prog_wkladu_pominietego_a": PROG_WKLADU_POMIJALNEGO_A,
            },
            substitution=(
                f"Suma fazorowa wkładów źródeł {fmt_c(suma_fazorowa)} A, prąd członów "
                f"poprzecznych gałęzi {fmt_c(prad_czlonow)} A, razem {fmt_c(suma_bilansu)} A "
                f"wobec I_k''(Th) = {fmt(ik_thevenin_a)} A; reszta {fmt(reszta_a)} A, "
                f"dopuszczalna {fmt(tolerancja_a)} A."
            ),
            substitution_latex=(
                f"{fmt_cl(suma_fazorowa)} + {fmt_cl(prad_czlonow)} = {fmt_cl(suma_bilansu)}"
                f"\\,\\mathrm{{A}} \\approx {fmt(ik_thevenin_a)}\\,\\mathrm{{A}}"
            ),
            result={
                "suma_fazorowa_zrodel_a": suma_fazorowa,
                "suma_modulow_zrodel_a": suma_modulow,
                "prad_czlonow_poprzecznych_a": prad_czlonow,
                "suma_bilansu_a": suma_bilansu,
                "reszta_a": reszta_a,
                "tolerancja_a": tolerancja_a,
                "bilans_domkniety": reszta_a <= tolerancja_a,
            },
            notes=(
                "Kryterium: |Σ wkładów źródeł (z pominiętymi) + prąd członów poprzecznych − "
                "I_k''(Th)| ≤ max(1e-9·I_k''(Th), 1e-6 A). Człony poprzeczne gałęzi to suma "
                "kolumnowa macierzy Y sieci zwarciowej minus admitancja źródeł węzła: "
                "przekładnia poza-znamionowa transformatorów (y·(1 − 1/a)²) i admitancje "
                "poprzeczne linii, o ile wchodzą do sieci zwarciowej; przy przekładniach "
                "znamionowych i bez admitancji poprzecznych są zerowe. Źródło pominięte albo "
                "dopisane w rozbiciu na źródła zostawia resztę równą swojemu wkładowi. Źródła "
                "przekształtnikowe nie są bocznikami macierzy — ich wkład I_k(fal) stoi per "
                "źródło w liście `contributions` wyniku. Rozkład "
                "w sieci zgodnej (macierz Z-bus składowej zgodnej) dla każdego rodzaju zwarcia, "
                "tak jak wkłady gałęziowe; dla zwarć doziemnych prąd składowej zerowej rozpływa "
                "się w sieci zerowej, której rozkładu na źródła rdzeń nie liczy."
            ),
        )
        return wpisy, tracer.to_list()

    @staticmethod
    def _krok_wkladow_pominietych(pominiete: list[WkladPominiety]) -> dict[str, Any]:
        """Krok śladu WHITE BOX: wkłady pominięte na podstawie tolerancji numerycznej.

        Bilans per tor źródła z wartości zestawienia (te same 3 cyfry znaczące co wpisy,
        więc krok jest funkcją zestawienia, nie szumu poniżej trzeciej cyfry): liczba
        wpisów i suma modułów (górne ograniczenie prądu pominiętego); dla toru sieci
        zastępczej także suma fazorowa — wszystkie jej wpisy odnoszą kąt do JEDNEGO prądu
        I_k''(Th). Toru falowników nie sumuje się fazorowo: kąt wpisu jest odniesiony do
        prądu WŁASNEGO źródła (rdzeń przenosi wkład falownika jako moduł), więc suma
        fazorów różnych źródeł nie miałaby treści fizycznej. Zestawienie wpisów (gałąź,
        surowe |I|, kąt, tor) stoi w polu wyniku ``wklady_pominiete``.
        """
        wejscie: dict[str, Any] = {"prog_a": PROG_WKLADU_POMIJALNEGO_A}
        wynik: dict[str, Any] = {}
        opisy: list[str] = []
        for tor in (TOR_THEVENIN, TOR_FALOWNIK):
            wpisy = [w for w in pominiete if w.tor == tor]
            if not wpisy:
                continue
            wynik[f"liczba_pominietych_{tor}"] = len(wpisy)
            wynik[f"suma_modulow_pominietych_{tor}_a"] = zaokraglij_cyfry_znaczace(
                float(sum(w.i_a for w in wpisy))
            )
            if tor == TOR_THEVENIN:
                suma_fazorowa = complex(
                    sum(
                        0j if w.kat_deg is None else cmath.rect(w.i_a, math.radians(w.kat_deg))
                        for w in wpisy
                    )
                )
                wynik[f"suma_fazorowa_pominietych_{tor}_a"] = complex(
                    zaokraglij_cyfry_znaczace(suma_fazorowa.real),
                    zaokraglij_cyfry_znaczace(suma_fazorowa.imag),
                )
            opisy.append(
                f"{'sieć zastępcza' if tor == TOR_THEVENIN else 'falowniki'}: {len(wpisy)}"
            )
        tracer = WhiteBoxTracer()
        tracer.add(
            key="wklady_pominiete",
            title=f"Wkłady pominięte na podstawie tolerancji numerycznej "
            f"({OPIS_PROGU_WKLADU_POMIJALNEGO})",
            formula_latex=(
                r"\left| \underline{I}_{\text{gał}} \right| < "
                + OPIS_PROGU_WKLADU_POMIJALNEGO_LATEX
            ),
            inputs=wejscie,
            substitution=(
                f"Liczba wkładów gałęziowych pominiętych: {len(pominiete)} ({'; '.join(opisy)})."
            ),
            result=wynik,
            notes=(
                f"Każdy taki wpis to {NAZWA_WKLADU_POMINIETEGO} — nie zero: surowy moduł "
                "prądu i kąt fazora (3 cyfry znaczące, w stronę zera) są w zestawieniu "
                "wkładów pominiętych wyniku. Wpis nie wchodzi do listy wkładów gałęziowych "
                "ani do sumy kontrolnej bilansu w węźle zwarcia."
            ),
        )
        return tracer.to_list()[0]

    @staticmethod
    def _sprawdz_impedancje_przejscia(
        z_f_ohm: complex | None, fault_node_id: str
    ) -> complex | None:
        """Impedancja przejścia Z_f — reguła danych z jednego źródła
        (`network_model.core.impedancja_przejscia`, karta OD-14). Odmowa strukturalna: kod,
        treść bez identyfikatora, węzeł zwarcia w odwołaniu rekordu. Z_f = 0 → `None`
        (zwarcie metaliczne bit w bit, bez flagi „poza zakresem")."""
        if z_f_ohm is None:
            return None
        kod = kod_odmowy_impedancji(float(z_f_ohm.real), float(z_f_ohm.imag))
        if kod is not None:
            raise OdmowaWejsciaRdzenia(
                [
                    RekordOdmowy(
                        kod,
                        OPISY_ODMOW_IMPEDANCJI[kod],
                        (OdwolanieElementu(RODZAJ_WEZEL, fault_node_id),),
                    )
                ]
            )
        return impedancja_przejscia_obliczeniowa(float(z_f_ohm.real), float(z_f_ohm.imag))

    @staticmethod
    def _petla_zwarcia(
        *,
        short_circuit_type: ShortCircuitType,
        graph: NetworkGraph,
        fault_node_id: str,
        c_factor: float,
        z0_bus: np.ndarray | None,
        z_f_ohm: complex | None,
    ) -> _PetlaZwarcia:
        """Walidacja wejścia, impedancja pętli i prąd początkowy I_k'' punktu — JEDNA funkcja.

        Wołana przez pełny tor (`_oblicz_zwarcie`) i przez `prad_poczatkowy_a` (karta
        TB-WARTOSC-ROBOCZA: prąd, przy którym warstwa wiązania sprawdza charakterystyki
        zabezpieczeń pól lokalnych, zanim rozstrzygnie t_b punktu). Jedno źródło liczby: prąd
        sprawdzania charakterystyki i ``ikss_a`` wiersza są tym samym obliczeniem, bit w bit.
        """
        ShortCircuitIEC60909Solver._sprawdz_wejscie(graph, fault_node_id)
        if c_factor <= 0:
            raise ValueError("c_factor must be > 0")
        z_f = ShortCircuitIEC60909Solver._sprawdz_impedancje_przejscia(z_f_ohm, fault_node_id)

        core = compute_equivalent_impedance(
            graph=graph,
            fault_node_id=fault_node_id,
            short_circuit_type=short_circuit_type,
            z0_bus=z0_bus,
            z_f=z_f,
        )
        un_v = graph.nodes[fault_node_id].voltage_level * 1000.0
        ikss = compute_ikss(
            un_v=un_v,
            c_factor=c_factor,
            short_circuit_type=short_circuit_type,
            z_equiv=core.z_equiv,
        )
        tlumienie_petli: float | None = None
        ikss_metaliczny_a: float | None = None
        if core.z_equiv_metaliczne is not None:
            tlumienie_petli = abs(core.z_equiv_metaliczne) / abs(core.z_equiv)
            ikss_metaliczny_a = compute_ikss(
                un_v=un_v,
                c_factor=c_factor,
                short_circuit_type=short_circuit_type,
                z_equiv=core.z_equiv_metaliczne,
            ) + ShortCircuitIEC60909Solver._compute_inverter_contribution(
                graph=graph,
                fault_node_id=fault_node_id,
                short_circuit_type=short_circuit_type,
            )
        ik_inverters = ShortCircuitIEC60909Solver._compute_inverter_contribution(
            graph=graph,
            fault_node_id=fault_node_id,
            short_circuit_type=short_circuit_type,
            tlumienie_petli=tlumienie_petli,
        )
        return _PetlaZwarcia(
            core=core,
            un_v=un_v,
            ikss_thevenin_a=ikss,
            ik_inverters_a=ik_inverters,
            tlumienie_petli=tlumienie_petli,
            ikss_metaliczny_a=ikss_metaliczny_a,
        )

    @staticmethod
    def prad_poczatkowy_a(
        *,
        short_circuit_type: ShortCircuitType,
        graph: NetworkGraph,
        fault_node_id: str,
        c_factor: float,
        z0_bus: np.ndarray | None = None,
        z_f_ohm: complex | None = None,
    ) -> float:
        """Prąd zwarciowy początkowy I_k'' punktu [A] (część Thevenina + źródła
        przekształtnikowe) — ta sama liczba co ``ikss_a`` pełnego wyniku.

        Karta TB-WARTOSC-ROBOCZA: t_b punktu bez czasu ze scenariusza rozstrzyga się z czasu
        wyłączenia pól lokalnych, a charakterystyka zabezpieczenia pola zależy od prądu. I_k''
        nie zależy od t_b, więc warstwa wiązania liczy go przed pełnym torem (który potrzebuje
        t_b dla μ, q, I_b, i_DC) — tym samym kodem (`_petla_zwarcia`), nie drugą fizyką.
        """
        petla = ShortCircuitIEC60909Solver._petla_zwarcia(
            short_circuit_type=short_circuit_type,
            graph=graph,
            fault_node_id=fault_node_id,
            c_factor=c_factor,
            z0_bus=z0_bus,
            z_f_ohm=z_f_ohm,
        )
        return petla.ikss_thevenin_a + petla.ik_inverters_a

    @staticmethod
    def _oblicz_zwarcie(
        *,
        short_circuit_type: ShortCircuitType,
        graph: NetworkGraph,
        fault_node_id: str,
        c_factor: float,
        tk_s: float,
        czas_tb: CzasWylaczeniaTb,
        z0_bus: np.ndarray | None,
        include_branch_contributions: bool,
        z_f_ohm: complex | None,
    ) -> ShortCircuitResult:
        """JEDEN tor obliczenia zwarcia IEC 60909 dla czterech rodzajów zwarcia.

        Partia integracji 10 (karta OD-14): cztery metody publiczne `compute_*_short_circuit`
        miały cztery kopie tego samego toku (walidacja → impedancja pętli → I_k'' → wkład
        falowników → wielkości pozwarciowe → ślad → wkłady źródeł i gałęzi → wynik). Impedancja
        przejścia Z_f wchodzi do JEDNEGO toku — żadna z czterech dróg nie może jej pominąć.
        Kolejność wywołań jak w dawnych metodach: wynik metaliczny bit w bit.

        ``czas_tb`` (karta TB-WARTOSC-ROBOCZA): t_b PUNKTU z pochodzeniem, rozstrzygnięty
        w warstwie wiązania — rdzeń nie ma wartości domyślnej ani gałęzi „brak t_b".
        """
        if tk_s <= 0:
            raise ValueError("tk_s must be > 0")
        petla = ShortCircuitIEC60909Solver._petla_zwarcia(
            short_circuit_type=short_circuit_type,
            graph=graph,
            fault_node_id=fault_node_id,
            c_factor=c_factor,
            z0_bus=z0_bus,
            z_f_ohm=z_f_ohm,
        )
        core = petla.core
        un_v = petla.un_v
        ikss = petla.ikss_thevenin_a
        tlumienie_petli = petla.tlumienie_petli
        ikss_metaliczny_a = petla.ikss_metaliczny_a
        ik_inverters = petla.ik_inverters_a
        ik_total = ikss + ik_inverters
        post = compute_post_fault_quantities(
            ikss=ik_total,
            un_v=un_v,
            z_equiv=core.z_equiv,
            tk_s=tk_s,
        )
        wylaczeniowy = ShortCircuitIEC60909Solver._prad_wylaczeniowy(
            graph=graph,
            fault_node_id=fault_node_id,
            short_circuit_type=short_circuit_type,
            c_factor=c_factor,
            czas_tb=czas_tb,
            z_f=core.z_f,
            ik_total_a=ik_total,
            ikss_thevenin_a=ikss,
            rx_ratio=post.rx_ratio,
        )
        white_box_trace = ShortCircuitIEC60909Solver._build_white_box_trace(
            short_circuit_type=short_circuit_type,
            fault_node_id=fault_node_id,
            c_factor=c_factor,
            un_v=un_v,
            tk_s=tk_s,
            z_equiv=core.z_equiv,
            z1=core.z1,
            z2=core.z2,
            z0=core.z0,
            ikss_a=ik_total,
            post=post,
            wylaczeniowy=wylaczeniowy,
            graph=graph,
            z_f=core.z_f,
            z_equiv_metaliczne=core.z_equiv_metaliczne,
            ikss_metaliczny_a=ikss_metaliczny_a,
            tlumienie_petli=tlumienie_petli,
        )
        contributions = ShortCircuitIEC60909Solver._build_source_contributions(
            graph=graph,
            fault_node_id=fault_node_id,
            short_circuit_type=short_circuit_type,
            ik_thevenin_a=ikss,
            ik_total_a=ik_total,
            tlumienie_petli=tlumienie_petli,
        )
        branch_contributions, branch_flow_trace, wklady_pominiete, wklady_zrodel, slad_zrodel = (
            ShortCircuitIEC60909Solver._build_branch_contributions(
                graph=graph,
                fault_node_id=fault_node_id,
                short_circuit_type=short_circuit_type,
                ik_thevenin_a=ikss,
                ik_total_a=ik_total,
                tlumienie_petli=tlumienie_petli,
            )
            if include_branch_contributions
            else (None, None, None, None, None)
        )
        return ShortCircuitIEC60909Solver._compute_fault_result(
            short_circuit_type=short_circuit_type,
            fault_node_id=fault_node_id,
            c_factor=c_factor,
            tk_s=tk_s,
            czas_tb=czas_tb,
            un_v=un_v,
            post=post,
            z_equiv=core.z_equiv,
            ikss_thevenin=ikss,
            ik_inverters=ik_inverters,
            ib_a=wylaczeniowy.ib_a,
            ib_przypadek=wylaczeniowy.przypadek,
            i_dc_a=wylaczeniowy.skladowa_dc.i_dc_a,
            contributions=contributions,
            branch_contributions=branch_contributions,
            white_box_trace=white_box_trace,
            z1=core.z1,
            z2=core.z2,
            z0=core.z0,
            branch_flow_trace=branch_flow_trace,
            z_f=core.z_f,
            z_equiv_metaliczne=core.z_equiv_metaliczne,
            ikss_metaliczny_a=ikss_metaliczny_a,
            wklady_pominiete=wklady_pominiete or None,
            wklady_zrodel=wklady_zrodel,
            wklady_zrodel_slad=slad_zrodel,
        )

    @staticmethod
    def compute_3ph_short_circuit(
        graph: NetworkGraph,
        fault_node_id: str,
        c_factor: float,
        tk_s: float,
        *,
        czas_tb: CzasWylaczeniaTb,
        include_branch_contributions: bool = False,
        z_f_ohm: complex | None = None,
    ) -> ShortCircuitResult:
        """
        IEC 60909: 3-phase short-circuit currents (Ik'', Ip, Ith) and Sk''.

        Ik'' = (c * Un) / (sqrt(3) * |Zkk|)
        where Zkk is diagonal element of Zbus = inv(Ybus).

        kappa = 1.02 + 0.98 * exp(-3 * R/X)
        Ip = kappa * sqrt(2) * Ik''
        Ith = Ik'' * sqrt(m + n)   (m z kappa i tk; n = 1 — górne oszacowanie, patrz
                                   short_circuit_core._thermal_mn_factors)
        Sk'' = sqrt(3) * Un * Ik''
        Ib = Ik'' - sum_m dU''_m/(c*Un/sqrt(3)) * (1 - mu_m*q_m) * Ik,m''  (IEC 60909-0
             rozdz. 9; bez maszyn wirujących Ib = Ik'')
        iDC(tb) = sqrt(2) * Ik'' * exp(-2*pi*f*tb*R/X)  (IEC 60909-0 rozdz. 10)

        ``czas_tb`` — czas wyłączenia t_b = t_min PUNKTU z pochodzeniem (karta
        TB-WARTOSC-ROBOCZA): scenariusz projektanta, najkrótszy czas wyłączenia pól lokalnych
        albo wartość robocza — rozstrzyga warstwa wiązania, parametr bez wartości domyślnej.
        ``z_f_ohm`` (karta OD-14): zwarcie przez impedancję przejścia, Zk = Z1 + Zf.
        """
        return ShortCircuitIEC60909Solver._oblicz_zwarcie(
            short_circuit_type=ShortCircuitType.THREE_PHASE,
            graph=graph,
            fault_node_id=fault_node_id,
            c_factor=c_factor,
            tk_s=tk_s,
            czas_tb=czas_tb,
            z0_bus=None,
            include_branch_contributions=include_branch_contributions,
            z_f_ohm=z_f_ohm,
        )

    @staticmethod
    def compute_1ph_short_circuit(
        graph: NetworkGraph,
        fault_node_id: str,
        c_factor: float,
        tk_s: float,
        *,
        czas_tb: CzasWylaczeniaTb,
        z0_bus: np.ndarray | None = None,
        include_branch_contributions: bool = False,
        z_f_ohm: complex | None = None,
    ) -> ShortCircuitResult:
        """
        IEC 60909: single-phase-to-ground fault using Z1, Z2, Z0.

        Ik'' = (sqrt(3) * c * Un) / |Z1 + Z2 + Z0|
        ``z_f_ohm`` (karta OD-14): Zk = Z1 + Z2 + Z0 + 3·Zf.
        """
        if z0_bus is None:
            raise ValueError("Z0 bus matrix is required for 1F fault computation")
        return ShortCircuitIEC60909Solver._oblicz_zwarcie(
            short_circuit_type=ShortCircuitType.SINGLE_PHASE_GROUND,
            graph=graph,
            fault_node_id=fault_node_id,
            c_factor=c_factor,
            tk_s=tk_s,
            czas_tb=czas_tb,
            z0_bus=z0_bus,
            include_branch_contributions=include_branch_contributions,
            z_f_ohm=z_f_ohm,
        )

    @staticmethod
    def compute_2ph_short_circuit(
        graph: NetworkGraph,
        fault_node_id: str,
        c_factor: float,
        tk_s: float,
        *,
        czas_tb: CzasWylaczeniaTb,
        include_branch_contributions: bool = False,
        z_f_ohm: complex | None = None,
    ) -> ShortCircuitResult:
        """
        IEC 60909: two-phase fault using Z1 and Z2.

        Ik'' = (c * Un) / |Z1 + Z2|
        ``z_f_ohm`` (karta OD-14): Zk = Z1 + Z2 + Zf.
        """
        return ShortCircuitIEC60909Solver._oblicz_zwarcie(
            short_circuit_type=ShortCircuitType.TWO_PHASE,
            graph=graph,
            fault_node_id=fault_node_id,
            c_factor=c_factor,
            tk_s=tk_s,
            czas_tb=czas_tb,
            z0_bus=None,
            include_branch_contributions=include_branch_contributions,
            z_f_ohm=z_f_ohm,
        )

    @staticmethod
    def compute_2ph_ground_short_circuit(
        graph: NetworkGraph,
        fault_node_id: str,
        c_factor: float,
        tk_s: float,
        *,
        czas_tb: CzasWylaczeniaTb,
        z0_bus: np.ndarray | None = None,
        include_branch_contributions: bool = False,
        z_f_ohm: complex | None = None,
    ) -> ShortCircuitResult:
        """
        IEC 60909: two-phase-to-ground fault using Z1, Z2, Z0.

        Ik'' = (c * Un) / |Z1 + Z2·Z0/(Z2 + Z0)|
        ``z_f_ohm`` (karta OD-14): Zk = Z1 + Z2·(Z0 + 3Zf)/(Z2 + Z0 + 3Zf).
        """
        if z0_bus is None:
            raise ValueError("Z0 bus matrix is required for 2F+G fault computation")
        return ShortCircuitIEC60909Solver._oblicz_zwarcie(
            short_circuit_type=ShortCircuitType.TWO_PHASE_GROUND,
            graph=graph,
            fault_node_id=fault_node_id,
            c_factor=c_factor,
            tk_s=tk_s,
            czas_tb=czas_tb,
            z0_bus=z0_bus,
            include_branch_contributions=include_branch_contributions,
            z_f_ohm=z_f_ohm,
        )


ShortCircuitResult3PH = ShortCircuitResult
