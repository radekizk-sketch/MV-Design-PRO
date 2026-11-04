"""
Builder macierzy admitancyjnej (Y-bus) dla sieci elektroenergetycznej.

Macierz Y-bus jest wyznaczana na podstawie danych z NetworkGraph
(nodes, branches, switches). Gałęzie nieaktywne (in_service=False)
nie są uwzględniane. Zamknięte łączniki (switches) powodują scalenie
węzłów (zero-impedance merge) zgodnie z IEC 60909.

System per-unit:
    Sbase = 100 MVA (konfigurowalny)
    Vbase_i = voltage_level_kv węzła i
    Zbase_i = Vbase_i² / Sbase [Ω]
    Y-bus, Z-bus w jednostkach per-unit
"""

from __future__ import annotations

from collections.abc import Iterator

import numpy as np
from network_model.pochodne import impedancja_z_napiecia_i_mocy_ohm

from .branch import Branch, LineBranch, TransformerBranch
from .graph import NetworkGraph
from .node import NodeType
from .topologia import UniaWezlow

S_BASE_MVA: float = 100.0

#: Podstawa normowa pominięcia admitancji poprzecznych gałęzi w sieci zwarciowej — JEDNO źródło
#: tekstu dla budowniczego (`AdmittanceMatrixBuilder.build(siec_zwarciowa=True)`) i kroku śladu
#: WHITE BOX solvera IEC 60909 (`admitancje_poprzeczne_pominiete`).
PODSTAWA_POMINIECIA_ADMITANCJI_POPRZECZNYCH: str = (
    "IEC 60909-0:2016 pkt 5.2 f) — w składowej zgodnej i przeciwnej pojemności linii się "
    "pomija; pkt 5.3.1 — zastępcze źródło napięcia c·U_n/√3 w miejscu zwarcia jest jedynym "
    "napięciem czynnym sieci. Sieć składowej zgodnej i przeciwnej (Z_2 = Z_1) zawiera "
    "admitancje szeregowe gałęzi oraz boczniki zasilań i maszyn wirujących; pojemności linii "
    "i kabli (B/2 na każdym końcu) nie wchodzą do niej. Składowa zerowa — warunek pkt 5.2 f): "
    "pojemności linii uwzględnia się w sieciach uziemionych przez małą impedancję, gdy "
    "współczynnik zwarcia doziemnego jest większy niż 1,4; metoda składowych symetrycznych — "
    "pkt 5.3.2. Warunek sprawdza złożenie macierzy składowej zerowej (`enm/mapping.py`, krok "
    "śladu sieci zerowej „warunek współczynnika zwarcia doziemnego”). Parafraza normy (nie "
    "cytat) — ustalenie "
    "właściciela 2026-10-22."
)


class AdmittanceMatrixBuilder:
    """
    Builder macierzy Y-bus w systemie per-unit.

    Zapewnia deterministyczne mapowanie node_id -> indeks macierzy
    (sortowanie alfabetyczne po node_id). Zamknięte łączniki scalają
    węzły (IEC 60909: łącznik zamknięty = zerowa impedancja).

    System per-unit:
        Sbase = S_BASE_MVA (domyślnie 100 MVA)
        Vbase = voltage_level węzła [kV]
        Zbase = Vbase² / Sbase [Ω]
    """

    def __init__(self, graph: NetworkGraph) -> None:
        self._graph = graph
        self._node_id_to_index: dict[str, int] = {}
        self._representative_ids: list[str] = []

    @property
    def node_id_to_index(self) -> dict[str, int]:
        """Zwraca mapowanie node_id -> indeks w macierzy Y-bus."""
        return dict(self._node_id_to_index)

    def _build_merged_node_map(self) -> tuple[list[str], dict[str, int]]:
        """
        Scala węzły połączone zamkniętymi łącznikami i buduje mapowanie.

        Returns:
            Tuple (representative_ids_sorted, all_node_id_to_index).
        """
        # Jedyne jądro scalania (CV-4.3): ``network_model.core.topologia.UniaWezlow`` —
        # ta sama reguła reprezentanta (najmniejszy identyfikator klasy), więc porządek
        # wierszy macierzy Y jest bit w bit taki jak przed konsolidacją.
        all_node_ids = sorted(self._graph.nodes.keys())
        unia = UniaWezlow(all_node_ids)

        for sw in self._graph.switches.values():
            if not getattr(sw, "in_service", True):
                continue
            if sw.is_closed:
                if sw.from_node_id in self._graph.nodes and sw.to_node_id in self._graph.nodes:
                    unia.polacz(sw.from_node_id, sw.to_node_id)

        representatives = sorted({unia.znajdz(nid) for nid in all_node_ids})
        rep_to_idx = {rep: idx for idx, rep in enumerate(representatives)}
        node_to_idx = {nid: rep_to_idx[unia.znajdz(nid)] for nid in all_node_ids}

        return representatives, node_to_idx

    def _get_representative_voltage_kv(self, rep_id: str) -> float:
        """Napięcie znamionowe węzła reprezentatywnego [kV]."""
        return self._graph.nodes[rep_id].voltage_level

    def build(self, *, siec_zwarciowa: bool) -> np.ndarray:
        """
        Buduje macierz Y-bus w systemie per-unit.

        Zamknięte łączniki scalają węzły (zero-impedance merge).

        ``siec_zwarciowa`` (argument OBOWIĄZKOWY, bez wartości domyślnej — każdy wołający
        nazywa reprezentację jawnie; pin: ``test_ybus.py::test_build_wymaga_jawnej_reprezentacji``)
        — JEDEN predykat reprezentacji sieci zwarciowej IEC 60909 składowej
        zgodnej; solver przyjmuje ją także za sieć składowej przeciwnej (Z_2 = Z_1,
        `short_circuit_core.compute_equivalent_impedance` bez `z2_bus` — żaden wołający go nie
        podaje):

        * admitancje poprzeczne gałęzi (B/2 linii i kabli na każdym końcu) są POMINIĘTE —
          ``PODSTAWA_POMINIECIA_ADMITANCJI_POPRZECZNYCH``; admitancja szeregowa bez zmian;
        * zasilania systemowe wchodzą jako bocznik Y_Q = 1/Z_Q, a węzeł SLACK bez Z_Q —
          admitancją idealną (`_ground_slack_buses`);
        * maszyny wirujące wchodzą jako bocznik Y″ = 1/Z″ (`_add_machine_shunts`).

        ``siec_zwarciowa=False`` — macierz gałęzi w pełnym modelu π (z B/2), bez boczników
        źródeł; używa jej wyłącznie test parytetu z budowniczym rozpływu
        (`tests/network_model/test_parytet_admitancji_rozplyw_zwarcia.py`). Rozpływ, estymacja
        stanu i dynamika mają własnego budowniczego (`build_ybus_pu`) z B/2 — tam pojemności
        linii są fizyką stanu ustalonego i zostają.

        Returns:
            Numpy ndarray o dtype=complex i rozmiarze (n, n) w per-unit.
        """
        self._representative_ids, self._node_id_to_index = self._build_merged_node_map()

        size = len(self._representative_ids)
        y_bus = np.zeros((size, size), dtype=complex)

        for _, from_idx, to_idx, y_series_pu, y_shunt_pu, ratio in self._stemple_galezi():
            if siec_zwarciowa:
                # IEC 60909-0:2016 pkt 5.2 f) — patrz PODSTAWA_POMINIECIA_ADMITANCJI_POPRZECZNYCH.
                # Ten sam bocznik (ten sam iterator `_stemple_galezi`) wylicza
                # `admitancje_poprzeczne_pominiete` dla śladu WHITE BOX. Dla gałęzi bez
                # susceptancji (B = 0) bocznik i tak był zerem, więc taka sieć ma Y-bus bit
                # w bit jak przed kartą BEZ-POJEMNOSCI.
                y_shunt_pu = 0j

            # Model gałęzi z przekładnią POZA-ZNAMIONOWĄ `a` (idealny transformator
            # po stronie `from`, admitancja odniesiona do strony `to`):
            #     Y[f,f] += y/a²   Y[f,t] -= y/a   Y[t,f] -= y/a   Y[t,t] += y
            # Dla `a = 1` (linie, kable i transformatory dopasowane do baz napięciowych
            # węzłów, bez zaczepu) wzór redukuje się do symetrycznego wpisu sprzed
            # V12K-186 — dzielenie przez 1.0 jest w IEEE-754 dokładne, więc takie
            # sieci mają Y-bus BIT-IDENTYCZNY.
            y_off = y_series_pu / ratio
            y_bus[from_idx, to_idx] -= y_off
            y_bus[to_idx, from_idx] -= y_off

            y_bus[from_idx, from_idx] += y_series_pu / (ratio * ratio) + y_shunt_pu
            y_bus[to_idx, to_idx] += y_series_pu + y_shunt_pu

        if siec_zwarciowa:
            self._ground_slack_buses(y_bus)
            # Rotating machines (IEC 60909 §6.3/§6.7) are voltage-behind-Z″ sources;
            # in the SC context they add a shunt Y″=1/Z″ at their node, exactly as the
            # slack is grounded. SC context ONLY (siec_zwarciowa ⇒ called solely by
            # short_circuit_core); no-op when no machines ⇒ existing networks unchanged.
            self._add_machine_shunts(y_bus)

        return y_bus

    def _ground_slack_buses(self, y_bus: np.ndarray) -> None:
        """
        Dodaje admitancje bocznikowe (do ziemi) dla wezlow zasilajacych.

        Zasilanie systemowe (IEC 60909-0 §3.2) to SEM ZA impedancja Z_Q — w
        metodzie Z-bus bocznik Y_Q = 1/Z_Q w wezle przylaczenia. Uziemienie
        tego samego wezla admitancja idealna ZWIERALOBY Z_Q i dawalo szyne
        nieskonczona (V12K-184): Ik'' na szynie GPZ rosl do wartosci
        ograniczonej wylacznie impedancja linii/kabli, a moc zwarciowa
        zrodla (Sk'') nie wchodzila do obliczen wcale.

        Referencje napiecia admitancja idealna (1e6 pu) stosujemy WYLACZNIE
        dla wezla SLACK BEZ zadeklarowanej impedancji zrodla — model szyny
        nieskonczonej jest wtedy jedyna dostepna informacja.
        """
        grid_y_pu: dict[int, complex] = {}
        for src in self._graph.get_grid_sc_sources():
            idx = self._node_id_to_index.get(src.node_id)
            if idx is None or src.z_ohm == 0:
                continue
            z_base = self.get_zbase_ohm(src.node_id)
            grid_y_pu[idx] = grid_y_pu.get(idx, 0j) + z_base / src.z_ohm

        y_slack_pu = complex(1e6, 0.0)
        seen_indices: set[int] = set()
        for node in self._graph.nodes.values():
            if node.node_type == NodeType.SLACK:
                idx = self._node_id_to_index.get(node.id)
                if idx is not None and idx not in seen_indices:
                    y_bus[idx, idx] += grid_y_pu.get(idx, y_slack_pu)
                    seen_indices.add(idx)
        # Zasilania systemowe w wezlach nie-SLACK (np. druga sekcja GPZ) tez sa
        # SEM za Z_Q — deterministyczna kolejnosc po indeksie.
        for idx in sorted(grid_y_pu):
            if idx not in seen_indices:
                y_bus[idx, idx] += grid_y_pu[idx]

    def _add_machine_shunts(self, y_bus: np.ndarray) -> None:
        """Add rotating-machine SC sources as shunt admittances Y″ = 1/Z″ (IEC 60909
        §6.3 synchronous, §6.7 asynchronous). A machine is a voltage source behind Z″;
        in the Z-bus method that is a shunt to the (grounded) EMF reference at the
        machine's node. Deterministic order (sources are id-sorted); a no-op when no
        machine sources exist, so machine-free networks keep a byte-identical Y-bus."""
        machines: list[tuple[str, complex]] = [
            (m.node_id, m.z_internal_ohm) for m in self._graph.get_synchronous_machine_sources()
        ] + [(m.node_id, m.z_internal_ohm) for m in self._graph.get_asynchronous_machine_sources()]
        for node_id, z_internal_ohm in machines:
            idx = self._node_id_to_index.get(node_id)
            if idx is None or abs(z_internal_ohm) == 0.0:
                continue
            z_base = self.get_zbase_ohm(node_id)
            y_bus[idx, idx] += z_base / z_internal_ohm

    def _stemple_galezi(
        self,
    ) -> Iterator[tuple[Branch, int, int, complex, complex, float]]:
        """Gałęzie stemplowane do macierzy: (gałąź, indeks od, indeks do, Y_szeregowa pu,
        Y_poprzeczna NA KONIEC pu, przekładnia `a`).

        JEDYNE źródło zbioru gałęzi i ich admitancji dla `build` i
        `admitancje_poprzeczne_pominiete` (predykaty parami z jednego miejsca): gałąź
        w ruchu między RÓŻNYMI węzłami scalonymi; gałąź wewnątrz węzła scalonego zamkniętymi
        łącznikami nie wchodzi do macierzy w ogóle. Wymaga mapy węzłów z
        `_build_merged_node_map` (ustawia ją wołający). Kolejność = kolejność gałęzi grafu
        (porządek sumowania stempli, od którego zależą bity macierzy).
        """
        for branch in self._graph.branches.values():
            if not branch.in_service:
                continue
            from_idx = self._node_id_to_index[branch.from_node_id]
            to_idx = self._node_id_to_index[branch.to_node_id]
            if from_idx == to_idx:
                continue
            y_series_pu, y_shunt_pu, ratio = self._get_branch_admittances_pu(branch)
            yield branch, from_idx, to_idx, y_series_pu, y_shunt_pu, ratio

    def admitancje_poprzeczne_pominiete(self) -> list[tuple[Branch, complex]]:
        """Gałęzie, których admitancja poprzeczna NIE wchodzi do sieci zwarciowej.

        Para (gałąź, Y_poprzeczna NA KONIEC w pu bazy systemowej — dokładnie stempel, który
        `build(siec_zwarciowa=True)` zeruje na obu końcach) dla każdej gałęzi z
        `_stemple_galezi` o Y_poprzecznej ≠ 0. Ten sam iterator co `build`, więc zbiór
        pominiętych i zbiór zerowanych to jeden zbiór. Kolejność deterministyczna
        (identyfikator gałęzi).
        """
        self._representative_ids, self._node_id_to_index = self._build_merged_node_map()
        pominiete = [
            (branch, y_shunt_pu)
            for branch, _, _, _, y_shunt_pu, _ in self._stemple_galezi()
            if y_shunt_pu != 0
        ]
        return sorted(pominiete, key=lambda para: para[0].id)

    def get_zbase_ohm(self, node_id: str) -> float:
        """Zwraca Zbase [Ω] dla danego węzła: Vn² / Sbase."""
        vn_kv = self._graph.nodes[node_id].voltage_level
        return impedancja_z_napiecia_i_mocy_ohm(vn_kv, S_BASE_MVA)

    def _get_branch_admittances_pu(self, branch: Branch) -> tuple[complex, complex, float]:
        """
        Zwraca (Y_series_pu, Y_shunt_per_end_pu, przekładnia_poza_znamionowa).

        Trzeci element to przekładnia `a` modelu z idealnym transformatorem po
        stronie `from`; dla linii i kabli zawsze 1.0.
        """
        if isinstance(branch, LineBranch):
            vn_kv = self._graph.nodes[branch.from_node_id].voltage_level
            z_base = impedancja_z_napiecia_i_mocy_ohm(vn_kv, S_BASE_MVA)
            z_total_ohm = branch.get_total_impedance()
            if z_total_ohm == 0:
                raise ZeroDivisionError("Cannot compute line admittance: impedance is zero")
            z_pu = z_total_ohm / z_base
            y_series_pu = 1.0 / z_pu
            y_shunt_total_s = branch.get_shunt_admittance()
            y_shunt_total_pu = y_shunt_total_s * z_base
            y_shunt_per_end_pu = y_shunt_total_pu / 2.0
            return y_series_pu, y_shunt_per_end_pu, 1.0

        if isinstance(branch, TransformerBranch):
            # IEC 60909-0 §3.3.3: network transformers enter the short-circuit
            # network with the corrected impedance Z_TK = K_T · (R_T + jX_T).
            # This builder is the IEC 60909 SC/Z-bus network (grounds slack,
            # adds machine shunts); power flow uses a separate Y-bus builder, so
            # the K_T correction stays confined to short-circuit.
            z_pu_sn = branch.get_short_circuit_impedance_pu_corrected()
            # ZMIANA BAZY (V12K-186). `z_pu_sn` jest w per-unit na bazie WŁASNEJ
            # transformatora: mocy `rated_power_mva` i napięcia `voltage_lv_kv`.
            # Macierz pracuje na bazie systemowej: `S_BASE_MVA` i napięciu
            # ZNAMIONOWYM WĘZŁA. Przeliczenie wymaga OBU członów:
            #     z_pu_sys = z_pu_sn · (S_BASE/S_r) · (U_lv_TR / U_bazowe_szyny_LV)²
            # Człon napięciowy był pominięty, co przy transformatorze katalogowym
            # 110/15 kV na szynie 15,75 kV zawyżało |Z| o (15,75/15)² = 1,1025 i
            # ZANIŻAŁO Ik″ o 9,3 % — cicho, bo walidator porównuje napięcia szyn
            # tylko względem siebie (HV ≥ LV), nigdy z tabliczką transformatora.
            u_base_hv = self._graph.nodes[branch.from_node_id].voltage_level
            u_base_lv = self._graph.nodes[branch.to_node_id].voltage_level
            if u_base_hv > 0.0 and u_base_lv > 0.0:
                v_scale = branch.voltage_lv_kv / u_base_lv
                # Przekładnia poza-znamionowa: stosunek przekładni RZECZYWISTEJ
                # (tabliczka × zaczep) do przekładni BAZOWEJ (napięcia węzłów).
                # `get_tap_ratio()` to kanoniczne źródło zaczepu — TapChanger, gdy
                # jest, inaczej `1 + poz·krok%` — TA SAMA metoda, z której korzysta
                # rozpływ mocy, więc obie analizy widzą JEDEN transformator.
                ratio = ((branch.voltage_hv_kv / u_base_hv) / v_scale) * branch.get_tap_ratio()
            else:
                # Węzeł bez napięcia znamionowego: brak podstawy do zmiany bazy —
                # zostaje zachowanie sprzed V12K-186 (walidator i tak zgłasza błąd
                # `voltage_level <= 0`, więc solver nie powinien tu dotrzeć).
                v_scale = 1.0
                ratio = branch.get_tap_ratio()
            z_pu_base = z_pu_sn * (S_BASE_MVA / branch.rated_power_mva) * (v_scale * v_scale)
            if z_pu_base == 0:
                raise ZeroDivisionError("Cannot compute transformer admittance: impedance is zero")
            y_series_pu = 1.0 / z_pu_base
            y_shunt_per_end_pu = 0.0 + 0.0j
            return y_series_pu, y_shunt_per_end_pu, ratio

        raise ValueError(f"Unsupported branch type: {branch.branch_type}")
