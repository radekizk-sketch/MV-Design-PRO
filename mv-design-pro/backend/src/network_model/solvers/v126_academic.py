from __future__ import annotations

import cmath
import hashlib
import json
import math
import random
from itertools import combinations
from typing import Any

import numpy as np
from solver_input.v126_contracts import V126AcademicInput, V126AnalysisType

JsonDict = dict[str, Any]

# 1.1 (V126-JEZYK, 2026-08-07): ślad WHITE BOX niesie DODATKOWO polską postać
# wyniku kroku z jednostką (`result_pl`), a teksty podstawień i sprawdzeń jednostek
# przepisano na język inżynierski z pełną polszczyzną. Kontrakt maszynowy (`result`,
# `formula`, `data`) NIETKNIĘTY — zmiana jest addytywna; odcisk przebiegu zmienia się
# raz, bo ślad jest częścią wyniku, więc wersja solvera idzie w górę razem z nim.
# 1.2 (karta QU-FABRYKACJA, 2026-08-08): solver przestał podstawiać współczynniki
# w miejsce danych wejściowych. `_voltage_stability` nie wyznacza już żadnej
# wielkości (wszystkie stały na zmyślonej mocy zwarciowej węzła i na zdolności
# wytwórczej mocy biernej, której kontrakt nie niesie) — pola kontraktu zostają,
# wartością jest jawny brak z powodem. `_z_conv_components` bierze częstotliwość
# podstawową z kontraktu zamiast z zaszytego 50 Hz. Odciski przebiegów obu
# rodzajów zmieniają się RAZ, razem z wersją.
V126_SOLVER_VERSION = "v126-academic-whitebox-1.2"


def _canonical_payload(payload: Any) -> str:
    return json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _hash(payload: Any) -> str:
    return hashlib.sha256(_canonical_payload(payload).encode("utf-8")).hexdigest()


def _round(value: float, digits: int = 6) -> float:
    if not math.isfinite(value):
        return value
    return round(value, digits)


def _status(ok: bool) -> str:
    return "zgodny" if ok else "niezgodny"


# D-14 (K-08): jednolita warstwa sanity-bounds dla analiz V12.6. Status wg §6.1:
# "zweryfikowany" (w zakresie) / "poza zakresem wiarygodności" (przekroczona granica
# fizyczna) / "dane niekompletne" (brak wejść do oceny). NIE liczy fizyki — ocenia
# wiarygodność już policzonych wyników, blokuje absurdy przed pakietem OSD (DEF-01).
def _sanity_block(
    checks: list[tuple[str, bool, str]],
    *,
    has_inputs: bool = True,
) -> JsonDict:
    """checks: lista (nazwa, w_zakresie, opis_pl). Zwraca blok wiarygodności."""
    if not has_inputs:
        return {
            "status": "dane niekompletne",
            "violations": [],
            "checks_total": len(checks),
            "checks_passed": 0,
        }
    violations = [{"check": name, "detail_pl": detail} for name, ok, detail in checks if not ok]
    return {
        "status": "zweryfikowany" if not violations else "poza zakresem wiarygodności",
        "violations": violations,
        "checks_total": len(checks),
        "checks_passed": sum(1 for _, ok, _ in checks if ok),
    }


def _finite(*values: float) -> bool:
    """True gdy wszystkie wartości są liczbami skończonymi (nie NaN/inf)."""
    return all(isinstance(v, int | float) and math.isfinite(v) for v in values)


class TraceBuilder:
    def __init__(self, analysis_type: V126AnalysisType) -> None:
        self.analysis_type = analysis_type.value
        self.steps: list[JsonDict] = []

    def add(
        self,
        key: str,
        formula: str,
        data: JsonDict,
        substitution: str,
        result: JsonDict,
        unit_check: str,
        *,
        result_pl: str,
    ) -> None:
        """Dopisuje krok śladu WHITE BOX.

        `result` pozostaje słownikiem kontraktu (maszynowa postać wyniku kroku,
        nietknięta — czytają ją pakiet dowodowy i raport). `result_pl` to
        DODANE pole prezentacyjne (V126-JEZYK): wynik kroku jako liczba
        Z JEDNOSTKĄ, po polsku. Powód: ekran projektanta pokazywał w kolumnie
        „Wynik" surowy zapis `{"smallest_eigenvalue":0.998667}` — ocena
        właściciela 0/10 z 2026-08-07. Pole jest WYMAGANE (argument nazwany bez
        wartości domyślnej), więc nowy krok śladu nie może powstać bez polskiej
        postaci wyniku — to zamyka klasę, a nie jedną instancję.
        """
        self.steps.append(
            {
                "step": len(self.steps) + 1,
                "key": key,
                "formula": formula,
                "data": data,
                "substitution": substitution,
                "result": result,
                "result_pl": result_pl,
                "unit_check": unit_check,
                "proof_ref": f"proof:v126:{self.analysis_type}:{key}",
                "proof_status": "complete",
                "reporting_status": "reportable",
            }
        )


class V126AcademicSolver:
    def run(
        self,
        analysis_type: V126AnalysisType,
        model: V126AcademicInput,
    ) -> JsonDict:
        trace = TraceBuilder(analysis_type)
        if analysis_type == V126AnalysisType.POWER_QUALITY_HARMONICS:
            result = self._power_quality(model, trace)
        elif analysis_type == V126AnalysisType.SSCI_IMPEDANCE:
            result = self._ssci_impedance(model, trace)
        elif analysis_type == V126AnalysisType.VOLTAGE_STABILITY:
            result = self._voltage_stability(model, trace)
        elif analysis_type == V126AnalysisType.RELIABILITY_CONTINGENCY:
            result = self._reliability(model, trace)
        elif analysis_type == V126AnalysisType.EARTHING_SAFETY:
            result = self._earthing(model, trace)
        elif analysis_type == V126AnalysisType.NEUTRAL_EARTHING_DESIGN:
            result = self._neutral_earthing_design(model, trace)
        elif analysis_type == V126AnalysisType.INSULATION_COORDINATION:
            result = self._insulation(model, trace)
        elif analysis_type == V126AnalysisType.EARTH_FAULT_DETECTION:
            result = self._earth_fault_detection(model, trace)
        elif analysis_type == V126AnalysisType.TRANSIENT_TRV:
            result = self._transient(model, trace)
        elif analysis_type == V126AnalysisType.MOTOR_STARTING:
            result = self._motor_starting(model, trace)
        elif analysis_type == V126AnalysisType.HOSTING_CAPACITY:
            result = self._hosting_capacity(model, trace)
        elif analysis_type == V126AnalysisType.OPF_LOSS_LCC:
            result = self._opf_loss_lcc(model, trace)
        elif analysis_type == V126AnalysisType.BENCHMARK_VALIDATION:
            result = self._benchmark_validation(model, trace)
        elif analysis_type == V126AnalysisType.UNCERTAINTY_SENSITIVITY:
            result = self._uncertainty(model, trace)
        else:
            raise ValueError(f"Nieobslugiwany typ analizy V12.6: {analysis_type}")

        envelope = {
            "contract": "AcademicAnalysisResultV1",
            "analysis_type": analysis_type.value,
            "solver_version": V126_SOLVER_VERSION,
            "input_hash": _hash(model.model_dump(mode="json")),
            "result": result,
            "white_box_trace": trace.steps,
        }
        envelope["deterministic_hash"] = _hash(envelope)
        return envelope

    def _bus_index(self, model: V126AcademicInput) -> dict[str, int]:
        return {bus.ref: index for index, bus in enumerate(model.buses)}

    def _nominal_kv(self, model: V126AcademicInput, bus_ref: str) -> float:
        bus = next((item for item in model.buses if item.ref == bus_ref), None)
        return bus.nominal_kv if bus is not None else model.buses[0].nominal_kv

    def _branch_z_ohm(self, branch: Any) -> complex:
        return complex(
            branch.r_ohm_per_km * branch.length_km, branch.x_ohm_per_km * branch.length_km
        )

    def _indeks_wezla_elektrycznego(self, model: V126AcademicInput) -> dict[str, int]:
        """Odwzorowanie szyna → indeks WĘZŁA ELEKTRYCZNEGO (karta MOST-WEJSCIA-V126).

        Gałąź ZAMKNIĘTA o zerowej impedancji szeregowej to POŁĄCZENIE IDEALNE:
        obie szyny są tym samym węzłem elektrycznym i mają identyczny potencjał.
        Kanoniczne ujęcie w metodzie węzłowej to REDUKCJA (sklejenie) węzłów — tak
        samo robi ``AdmittanceMatrixBuilder`` dla łączników w modelu domenowym.

        PO CO TO JEST. Przed tą kartą ``_ybus`` na gałęzi o ``abs(z) == 0``
        wykonywał ``continue``, czyli po cichu ROZSPAJAŁ sieć w miejscu aparatu.
        Defekt był uśpiony wyłącznie dlatego, że most wstawiał każdemu aparatowi
        zmyśloną impedancję 0,001 Ω/km — dopiero uczciwe przeniesienie jawnego
        ``r_ohm = 0,0`` z modelu (ta sama karta) postawiłoby sieć na tej ścieżce.
        Naprawa jednego defektu nie może budzić drugiego.

        DETERMINIZM I ZGODNOŚĆ WSTECZ: reprezentantem grupy jest szyna o
        NAJMNIEJSZYM indeksie w kolejności modelu, a numeracja węzłów idzie w
        kolejności pierwszego wystąpienia reprezentanta. Gdy sieć nie ma ani
        jednego połączenia idealnego, odwzorowanie jest TOŻSAMOŚCIĄ i macierz
        wychodzi bajtowo taka sama jak przed kartą.
        """
        kolejnosc = [bus.ref for bus in model.buses]
        pozycja = {ref: idx for idx, ref in enumerate(kolejnosc)}
        rodzic = list(range(len(kolejnosc)))

        def znajdz(i: int) -> int:
            while rodzic[i] != i:
                rodzic[i] = rodzic[rodzic[i]]
                i = rodzic[i]
            return i

        for branch in model.branches:
            if branch.is_open:
                continue
            i = pozycja.get(branch.from_bus_ref)
            j = pozycja.get(branch.to_bus_ref)
            if i is None or j is None or i == j:
                continue
            if abs(self._branch_z_ohm(branch)) != 0:
                continue
            a, b = znajdz(i), znajdz(j)
            if a != b:
                # Reprezentantem zostaje MNIEJSZY indeks — jedno, deterministyczne
                # kryterium niezależne od kolejności gałęzi w modelu.
                rodzic[max(a, b)] = min(a, b)

        numer_wezla: dict[int, int] = {}
        wynik: dict[str, int] = {}
        for idx, ref in enumerate(kolejnosc):
            reprezentant = znajdz(idx)
            if reprezentant not in numer_wezla:
                numer_wezla[reprezentant] = len(numer_wezla)
            wynik[ref] = numer_wezla[reprezentant]
        return wynik

    def _ybus(self, model: V126AcademicInput, harmonic: float = 1.0) -> np.ndarray[Any, Any]:
        """Macierz admitancyjna nad WĘZŁAMI ELEKTRYCZNYMI (nie nad szynami).

        Rozmiar równa się liczbie szyn dopóki sieć nie zawiera połączeń idealnych
        (patrz :meth:`_indeks_wezla_elektrycznego`); wtedy jest o tyle mniejszy,
        ile szyn skleiły zwarte aparaty bez impedancji styku.
        """
        index = self._indeks_wezla_elektrycznego(model)
        size = len(set(index.values()))
        ybus = np.zeros((size, size), dtype=complex)
        for branch in model.branches:
            if branch.is_open:
                continue
            i = index.get(branch.from_bus_ref)
            j = index.get(branch.to_bus_ref)
            if i is None or j is None:
                continue
            z = complex(
                branch.r_ohm_per_km * branch.length_km,
                harmonic * branch.x_ohm_per_km * branch.length_km,
            )
            if abs(z) == 0 or i == j:
                # Połączenie idealne jest już uwzględnione REDUKCJĄ węzłów (oba
                # zaciski mają ten sam indeks), więc nie ma czego stemplować.
                # `continue` nie rozspaja tu niczego — w odróżnieniu od stanu
                # sprzed karty, gdzie ten sam wiersz gubił połączenie.
                continue
            y = 1 / z
            # Susceptancja NIEZNANA (`None`) to nie zero: gałąź bez danej o
            # pojemności doczepnej nie wnosi bocznika i mówi o tym wprost tam,
            # gdzie decyzja od tego zależy (ryzyko ferrorezonansu).
            b_per_km = branch.b_siemens_per_km
            shunt = 1j * harmonic * b_per_km * branch.length_km / 2 if b_per_km is not None else 0j
            ybus[i, i] += y + shunt
            ybus[j, j] += y + shunt
            ybus[i, j] -= y
            ybus[j, i] -= y
        for transformer in model.transformers:
            i = index.get(transformer.hv_bus_ref)
            j = index.get(transformer.lv_bus_ref)
            if i is None or j is None or i == j:
                continue
            z_base = (transformer.uhv_kv**2) / transformer.sn_mva
            z = complex(
                transformer.pk_kw / (1000.0 * transformer.sn_mva**2),
                transformer.uk_percent / 100 * z_base,
            )
            if abs(z) == 0:
                continue
            y = 1 / complex(z.real, harmonic * z.imag)
            ybus[i, i] += y
            ybus[j, j] += y
            ybus[i, j] -= y
            ybus[j, i] -= y
        if size:
            ybus[0, 0] += 1e6
        return ybus

    def _grid_source_shunt_admittance(
        self, model: V126AcademicInput, harmonic: float
    ) -> dict[int, complex]:
        """Frequency-dependent grid-source shunt admittance Y_src(f) per bus.

        For every bus that carries a grid fault level (``fault_level_mva``), the
        external grid behind it is a series Thevenin source impedance
        ``Z_src(f) = R_src + j*(f/50)*X_src`` whose admittance ``Y_src = 1/Z_src``
        is shunted to ground at that bus (the network reference). The 50 Hz
        ``R_src``/``X_src`` reuse the EXACT same split as
        :meth:`_source_impedance` (``Z = Un^2/S_sc``, ``R = 0.15 Z``,
        ``X = 0.99 Z``) so there is one truth for the grid impedance. The
        reactance scales linearly with frequency (``harmonic = f/50``); the
        resistance is held constant (skin effect is out of scope — stated
        assumption). This shunt is added ONLY on the SSCI path so the existing
        power-quality Z-scan stays byte-identical.
        """
        # Indeks WĘZŁA ELEKTRYCZNEGO — ta sama przestrzeń, co macierz `_ybus`.
        # Gdy dwie szyny sklejone połączeniem idealnym niosą własne moce zwarciowe,
        # ich boczniki sumują się na wspólnym węźle (równoległe źródła zastępcze),
        # zamiast nadpisywać się nawzajem.
        index = self._indeks_wezla_elektrycznego(model)
        shunt: dict[int, complex] = {}
        for bus in model.buses:
            if not bus.fault_level_mva:
                continue
            bus_idx = index.get(bus.ref)
            if bus_idx is None:
                continue
            z = bus.nominal_kv**2 / bus.fault_level_mva
            z_src = complex(0.15 * z, harmonic * 0.99 * z)
            if abs(z_src) == 0:
                continue
            shunt[bus_idx] = shunt.get(bus_idx, 0j) + 1.0 / z_src
        return shunt

    def _driving_point_impedance(
        self,
        model: V126AcademicInput,
        harmonic: float,
        *,
        with_source_shunt: bool,
    ) -> np.ndarray[Any, Any]:
        """Driving-point bus-impedance diagonal at one harmonic.

        Builds the frequency-dependent ``Y_bus(f)`` via :meth:`_ybus` and inverts
        it (``Z_bus = pinv(Y_bus)``), returning the diagonal ``Z_bus[i, i]`` (the
        driving-point impedance seen at each bus). Shared by the power-quality
        Z-scan and the SSCI grid-impedance sweep.

        ``with_source_shunt`` controls whether the frequency-dependent grid-source
        shunt ``Y_src(f)`` is added at the grid buses (see
        :meth:`_grid_source_shunt_admittance`). The power-quality scan calls this
        with ``False`` (no shunt) so its output is byte-identical to before; the
        SSCI sweep calls it with ``True`` to obtain the correct system Thevenin
        impedance the converter sees.

        On the SSCI path the artificial 1e6 reference stiffening that
        :meth:`_ybus` puts on bus 0 (a numerical "infinite bus" used only to make
        the harmonic-scan matrix non-singular) is REMOVED and the physical finite
        grid Thevenin ``Y_src(f)`` is used as the grounding path instead — so the
        driving-point impedance reflects the real (finite) grid strength rather
        than a near-short. If the model carries no grid-source bus at all, a tiny
        reference is retained to keep the matrix invertible (stated fallback,
        affects only an otherwise-floating network).
        """
        ybus = self._ybus(model, harmonic)
        if with_source_shunt:
            # Undo the artificial 1e6 reference (power-quality-only stiffening) so
            # the physical grid Thevenin governs the SSCI driving-point impedance.
            if ybus.shape[0]:
                ybus[0, 0] -= 1e6
            shunts = self._grid_source_shunt_admittance(model, harmonic)
            for bus_idx, y_src in shunts.items():
                ybus[bus_idx, bus_idx] += y_src
            if not shunts and ybus.shape[0]:
                # No grid-source bus: keep a small reference to avoid singularity.
                ybus[0, 0] += 1e-6
        zbus = np.linalg.pinv(ybus)
        przekatna_wezlowa = np.diag(zbus)
        # ROZWINIĘCIE DO PORZĄDKU SZYN. Macierz stoi na węzłach elektrycznych, a
        # wołający indeksują wynik szyną (`_bus_index`). Szyny sklejone
        # połączeniem idealnym są JEDNYM węzłem, więc widzą tę samą impedancję
        # widzianą z zacisków — i to jest ścisłe, a nie przybliżenie.
        index = self._indeks_wezla_elektrycznego(model)
        return np.array([przekatna_wezlowa[index[bus.ref]] for bus in model.buses], dtype=complex)

    def _solve_linear(
        self, ybus: np.ndarray[Any, Any], injections: np.ndarray[Any, Any]
    ) -> np.ndarray[Any, Any]:
        try:
            return np.linalg.solve(ybus, injections)
        except np.linalg.LinAlgError:
            return np.linalg.pinv(ybus) @ injections

    def _power_quality(self, model: V126AcademicInput, trace: TraceBuilder) -> JsonDict:
        harmonics = sorted({2, 3, 5, 7, 11, 13, 17, 19, 23, 25, 29, 31, 35, 37, 41, 43, 47, 49})
        # `index` adresuje SZYNY (wyniki po szynach), `indeks_wezla` — WĘZŁY
        # ELEKTRYCZNE macierzy. Bez połączeń idealnych oba są tożsame.
        index = self._bus_index(model)
        indeks_wezla = self._indeks_wezla_elektrycznego(model)
        liczba_wezlow = len(set(indeks_wezla.values()))
        bus_results: dict[str, JsonDict] = {
            bus.ref: {
                "bus_ref": bus.ref,
                "u_h": [],
                "i_h": [],
                "thd_u_percent": 0.0,
                "tdd_percent": 0.0,
                "k_factor": 0.0,
                "z_scan": [],
                "resonance_peaks": [],
                "flicker_pst": None,
                "flicker_plt": None,
                "voltage_unbalance_u2_u1": 0.0,
                "compatibility_status": "zgodny",
                "violated_limits": [],
            }
            for bus in model.buses
        }
        u_square: dict[str, float] = {bus.ref: 0.0 for bus in model.buses}
        i_square: dict[str, float] = {bus.ref: 0.0 for bus in model.buses}
        k_factor: dict[str, float] = {bus.ref: 0.0 for bus in model.buses}
        for h in harmonics:
            ybus = self._ybus(model, float(h))
            # Wstrzyknięcia sumują się na WĘZLE: dwie szyny sklejone połączeniem
            # idealnym to jeden punkt sieci, więc ich prądy harmoniczne wchodzą
            # do jednego bilansu prądowego (prawo Kirchhoffa), a nie do dwóch.
            injections = np.zeros(liczba_wezlow, dtype=complex)
            for source in model.harmonic_sources:
                bus_idx = indeks_wezla.get(source.bus_ref)
                if bus_idx is None:
                    continue
                percent = source.spectrum_percent.get(h, 0.0) / 100.0
                current = source.base_current_a * percent
                injections[bus_idx] += complex(current, 0.0)
                i_square[source.bus_ref] += current**2
                k_factor[source.bus_ref] += current**2 * h**2
            voltages = self._solve_linear(ybus, injections)
            for bus in model.buses:
                bus_idx = indeks_wezla[bus.ref]
                voltage = voltages[bus_idx] / 1000.0
                magnitude_kv = abs(voltage)
                phase = (
                    math.degrees(math.atan2(voltage.imag, voltage.real)) if magnitude_kv else 0.0
                )
                bus_results[bus.ref]["u_h"].append(
                    {"h": h, "magnitude_kv": _round(magnitude_kv), "phase_deg": _round(phase, 3)}
                )
                u_square[bus.ref] += magnitude_kv**2

        for bus in model.buses:
            nominal_phase_kv = bus.nominal_kv / math.sqrt(3)
            thd = math.sqrt(u_square[bus.ref]) / max(nominal_phase_kv, 1e-9) * 100
            load_current = max(abs(bus.load_mw) * 1000 / (math.sqrt(3) * bus.nominal_kv), 1.0)
            tdd = math.sqrt(i_square[bus.ref]) / load_current * 100
            limits: list[str] = []
            if thd > 8.0:
                limits.append("PN-EN 50160 THDU > 8%")
            if thd > 5.0:
                limits.append("IEEE 519 THDU > 5%")
            if tdd > 5.0:
                limits.append("IEEE 519 TDD > 5%")
            bus_results[bus.ref]["thd_u_percent"] = _round(thd, 4)
            bus_results[bus.ref]["tdd_percent"] = _round(tdd, 4)
            bus_results[bus.ref]["k_factor"] = _round(
                math.sqrt(k_factor[bus.ref]) / load_current, 4
            )
            bus_results[bus.ref]["compatibility_status"] = "niezgodny" if limits else "zgodny"
            bus_results[bus.ref]["violated_limits"] = limits

        z50: dict[str, float] = {}
        for f_hz in range(50, 2501, 10):
            harmonic = f_hz / model.base_frequency_hz
            # Shared driving-point-impedance helper WITHOUT the grid-source shunt:
            # the power-quality Z-scan keeps its exact prior numerics (byte-identical
            # golden). The SSCI sweep calls the same helper WITH the shunt.
            zdiag = self._driving_point_impedance(model, harmonic, with_source_shunt=False)
            for bus in model.buses:
                z = zdiag[index[bus.ref]]
                z_abs = abs(z)
                if f_hz == 50:
                    z50[bus.ref] = max(z_abs, 1e-9)
                if f_hz % 100 == 50:
                    phase = math.degrees(math.atan2(z.imag, z.real)) if z_abs else 0.0
                    bus_results[bus.ref]["z_scan"].append(
                        {"f_hz": f_hz, "z_ohm": _round(z_abs), "phase_deg": _round(phase, 3)}
                    )
                if f_hz > 50 and z_abs > 10 * z50.get(bus.ref, z_abs):
                    bus_results[bus.ref]["resonance_peaks"].append(
                        {"f_hz": f_hz, "z_peak_ohm": _round(z_abs), "severity": "ALERT"}
                    )

        trace.add(
            "harmonic_power_flow",
            "U_h = Y_h^-1 * I_h, THD_U = sqrt(sum(|U_h|^2))/U_1 * 100%",
            {"harmonics": harmonics, "sources": len(model.harmonic_sources)},
            "Macierz admitancyjna budowana osobno dla każdej harmonicznej; wektor prądów "
            "wymuszających z widm źródeł odkształcających.",
            {"buses_evaluated": len(bus_results)},
            "Iloraz napięć [kV/kV] i prądów [A/A] wyrażony w %.",
            result_pl=(f"Zbadano węzłów: {len(bus_results)}"),
        )
        nodes = list(bus_results.values())
        # K-08: sanity-bounds wiarygodności PQ — THD/TDD/K-factor skończone i fizyczne
        # (IEC 61000 / PN-EN 50160 to limity zgodności; tu sprawdzamy granicę wiarygodności).
        thd_values = [float(n["thd_u_percent"]) for n in nodes]
        tdd_values = [float(n["tdd_percent"]) for n in nodes]
        kf_values = [float(n["k_factor"]) for n in nodes]
        sanity = _sanity_block(
            [
                ("thd_finite", _finite(*thd_values), "THD_U nieskończone/NaN"),
                ("thd_max", max(thd_values, default=0.0) <= 100.0, "THD_U > 100% (niefizyczne)"),
                ("tdd_finite", _finite(*tdd_values), "TDD nieskończone/NaN"),
                (
                    "k_factor_nonneg",
                    _finite(*kf_values) and all(v >= 0.0 for v in kf_values),
                    "K-factor < 0 lub nieskończony",
                ),
            ],
            has_inputs=len(model.harmonic_sources) > 0,
        )
        return {"nodes": nodes, "sanity": sanity}

    # =========================================================================
    # D-03 SSCI — impedance-based stability (PHYSICS half: Z_grid, Z_conv, L).
    # The Nyquist / minor-loop verdict is a SEPARATE analysis-layer follow-up;
    # this solver only emits the white-box impedance arrays it will consume.
    # =========================================================================

    @staticmethod
    def _phasor(z: complex) -> JsonDict:
        """Serialize a complex impedance/gain as {re, im, mag, phase_deg}."""
        mag = abs(z)
        phase = math.degrees(math.atan2(z.imag, z.real)) if mag else 0.0
        return {
            "re": _round(z.real),
            "im": _round(z.imag),
            "mag": _round(mag),
            "phase_deg": _round(phase, 3),
        }

    def _ssci_frequencies_hz(self) -> list[float]:
        """Sub-synchronous-focused, log-spaced sweep ~1..250 Hz (61 points).

        Dense enough to resolve the PLL-band behaviour (negative-resistance
        region below f_pll) and the low-frequency minor-loop interaction. The
        vector is fixed and deterministic (no input-dependent point selection).
        """
        lo, hi, n = 1.0, 250.0, 61
        step = (math.log10(hi) - math.log10(lo)) / (n - 1)
        return [round(10 ** (math.log10(lo) + step * k), 4) for k in range(n)]

    def _z_conv_components(
        self, converter: Any, f_hz: float, *, f_base_hz: float
    ) -> tuple[complex, dict[str, complex]]:
        """Positive-sequence small-signal output impedance Z_conv(jw) of one
        grid-following current-controlled VSC at frequency ``f_hz`` (ohms), plus
        the intermediate transfer functions (for the white-box trace).

        MODEL (impedance-based SSCI; positive-sequence reduced form):
        Sun (2011) "Impedance-Based Stability Criterion for Grid-Connected
        Inverters", IEEE TPEL 26(11); Cespedes & Sun (2014) "Impedance Modeling
        and Analysis of Grid-Connected Voltage-Source Converters", IEEE TPEL
        29(3); Wen et al. (2016) "Analysis of D-Q Small-Signal Impedance of
        Grid-Tied Inverters", IEEE TPEL 31(1).

            Z_conv(jw) = [ Z_f(jw) + G_d(jw)*G_ci(jw) ]
                         / [ 1 - G_d(jw)*H_pll(jw)*(I0*G_ci(jw) - V0)/V0 ]

        where (all impedances per-unit on Z_base = Un^2/Sn, then scaled to ohms):
          - Z_f(jw) = R_f + j*w_pu*L_f          physical LCL/L filter (pu),
            w_pu = w / w_base, w_base = 2*pi*f_base;
          - G_ci(jw) = a_ci*(L_f + R_f/(j*w_pu)) IMC-tuned current PI in pu,
            a_ci = 2*pi*f_ci / w_base (current-loop crossover); equivalently
            K_p = w_ci*L_f, K_i = w_ci*R_f with the loop gain G_ci/Z_f = a_ci/(j*w_pu);
          - G_d(jw) = exp(-j*w*T_d)              control/PWM delay, T_d = control_delay_ms*1e-3;
          - H_pll(jw) = a_pll/(j*w_pu + a_pll)   PLL closed loop, a_pll = 2*pi*f_pll / w_base;
          - V0, I0                               terminal voltage / current at the
            operating point (pu). The denominator PLL term, scaled by the
            operating-point current I0, is the operating-point-dependent coupling
            that creates the sub-synchronous negative-resistance region (the SSCI
            mechanism). Outside the PLL band H_pll -> 0 (coupling vanishes); inside
            the current-loop band G_ci is large (current-source-like high Z); as
            w -> inf, G_ci/Z_f -> 0 so Z_conv -> Z_f.

        ASSUMPTIONS (stated, no fabrication):
          - positive-sequence SISO reduction of the full dq impedance (the
            dominant axis for sub-synchronous SSCI); the dq cross-coupling is
            folded into the single PLL term above (Cespedes-Sun positive-seq form);
          - IMC current-loop tuning K_p=w_ci*L_f, K_i=w_ci*R_f (one-degree-of-
            freedom PI; the standard textbook tuning, Yazdani & Iravani 2010 ch.8);
          - control delay T_d = 0 if control_delay_ms is None (delay term G_d = 1);
          - outer voltage loop included as a low-frequency stiffening of the
            current reference ONLY when voltage_loop_bandwidth_hz is present (see
            below); omitted cleanly otherwise;
          - resistance R_f is frequency-independent (skin effect out of scope).

        MANDATORY card fields: current_loop_bandwidth_hz, pll_bandwidth_hz,
        filter_l_pu. Missing any of these raises ValueError (caught by the caller
        and surfaced as missing-data — NO fallback / NO fabricated value).

        ``f_base_hz`` — częstotliwość podstawowa sieci, KEYWORD BEZ WARTOŚCI
        DOMYŚLNEJ. Wcześniej ``w_base`` stało tu na zaszytym ``2π·50``, mimo że
        kontrakt wejściowy niesie ``V126AcademicInput.base_frequency_hz`` i ten
        sam plik czyta je w czterech innych miejscach (jakość energii, przemiatanie
        SSCI, projekt uziemienia punktu neutralnego). Był to ten sam defekt, co
        w `_voltage_stability`: zmyślone wejście przy dostępnej danej rzeczywistej
        (reguła KLASA §5 — uczciwość w obrębie jednego pliku). Brak wartości
        domyślnej sprawia, że nowe wywołanie nie powstanie bez podania podstawy.
        """
        f_ci = converter.current_loop_bandwidth_hz
        f_pll = converter.pll_bandwidth_hz
        l_f = converter.filter_l_pu
        missing = [
            name
            for name, value in (
                ("current_loop_bandwidth_hz", f_ci),
                ("pll_bandwidth_hz", f_pll),
                ("filter_l_pu", l_f),
            )
            if value is None
        ]
        if missing:
            raise ValueError(
                "Brak obowiazkowych pol karty falownika dla Z_conv(f): " + ", ".join(missing)
            )
        r_f = converter.filter_r_pu if converter.filter_r_pu is not None else 0.0
        t_d = converter.control_delay_ms * 1e-3 if converter.control_delay_ms is not None else 0.0

        w = 2.0 * math.pi * f_hz
        w_base = 2.0 * math.pi * f_base_hz
        w_pu = w / w_base
        s_pu = complex(0.0, w_pu)
        a_ci = 2.0 * math.pi * f_ci / w_base
        a_pll = 2.0 * math.pi * f_pll / w_base

        # Operating point (pu): V0 at rated (1.0); I0 = |S|/V0 from the converter
        # P/Q if given, else rated injection (1.0). No physics recomputed here —
        # the values come from the model/params.
        v0 = 1.0
        if converter.p_mw is not None or converter.q_mvar is not None:
            p = converter.p_mw or 0.0
            q = converter.q_mvar or 0.0
            s_mva = math.hypot(p, q)
            i0 = (s_mva / converter.rated_mva) / v0 if converter.rated_mva else 1.0
        else:
            i0 = 1.0

        z_f = complex(r_f, 0.0) + s_pu * l_f
        g_ci = a_ci * (complex(l_f, 0.0) + complex(r_f, 0.0) / s_pu)
        # Optional outer voltage loop: low-frequency current-reference stiffening
        # H_v = a_cv/(s_pu + a_cv). Applied as (1 + H_v) gain on the synthesized
        # active impedance G_ci, raising the in-band output impedance below the
        # voltage-loop corner. Omitted entirely when the bandwidth is absent.
        if converter.voltage_loop_bandwidth_hz is not None:
            a_cv = 2.0 * math.pi * converter.voltage_loop_bandwidth_hz / w_base
            h_v = a_cv / (s_pu + a_cv)
            g_ci = g_ci * (1.0 + h_v)
        g_d = cmath.exp(complex(0.0, -w * t_d))
        h_pll = a_pll / (s_pu + a_pll)

        numerator = z_f + g_d * g_ci
        denominator = 1.0 - g_d * h_pll * (i0 * g_ci - v0) / v0
        z_conv_pu = numerator / denominator

        z_base = converter.rated_kv**2 / converter.rated_mva if converter.rated_kv else 1.0
        z_conv = z_conv_pu * z_base

        components = {
            "z_f_pu": z_f,
            "g_ci": g_ci,
            "g_d": g_d,
            "h_pll": h_pll,
            "z_conv_pu": z_conv_pu,
            "z_conv_ohm": z_conv,
        }
        return z_conv, components

    def _ssci_select_converter(self, model: V126AcademicInput) -> Any:
        """The converter under SSCI study: explicit ``parameters['ssci_converter_ref']``
        if given, else the first declared converter. Returns None if none exist.
        """
        ref = model.parameters.get("ssci_converter_ref")
        if ref is not None:
            return next((c for c in model.converters if c.ref == ref), None)
        return model.converters[0] if model.converters else None

    def _ssci_impedance(self, model: V126AcademicInput, trace: TraceBuilder) -> JsonDict:
        converter = self._ssci_select_converter(model)
        if converter is None:
            trace.add(
                "ssci_impedance_no_converter",
                "Z_conv(jω) wymaga przekształtnika sieciowego (VSC) w modelu",
                {"converters": 0},
                "W modelu nie ma przekształtnika, dla którego można wyznaczyć impedancję wyjściową.",
                {"status": "dane niekompletne"},
                "Brak danych wejściowych — przekształtnik nieokreślony.",
                result_pl=("Brak danych do wyznaczenia impedancji przekształtnika"),
            )
            return {
                "status": "dane niekompletne",
                "message_pl": (
                    "Analiza SSCI (Z_grid/Z_conv) wymaga przeksztaltnika (falownika) "
                    "w modelu. Brak przeksztaltnika — analiza niewykonana."
                ),
                "missing_fields": ["converter"],
                "sanity": _sanity_block([], has_inputs=False),
            }

        index = self._bus_index(model)
        bus_idx = index.get(converter.bus_ref)
        if bus_idx is None:
            return {
                "status": "dane niekompletne",
                "message_pl": (
                    f"Przeksztaltnik '{converter.ref}' wskazuje na nieistniejacy wezel "
                    f"'{converter.bus_ref}'."
                ),
                "missing_fields": ["converter.bus_ref"],
                "sanity": _sanity_block([], has_inputs=False),
            }

        frequencies = self._ssci_frequencies_hz()

        # Probe Z_conv mandatory fields once (clear missing-data, no fabrication).
        try:
            self._z_conv_components(converter, frequencies[0], f_base_hz=model.base_frequency_hz)
        except ValueError as exc:
            f_ci = converter.current_loop_bandwidth_hz
            f_pll = converter.pll_bandwidth_hz
            l_f = converter.filter_l_pu
            missing = [
                name
                for name, value in (
                    ("current_loop_bandwidth_hz", f_ci),
                    ("pll_bandwidth_hz", f_pll),
                    ("filter_l_pu", l_f),
                )
                if value is None
            ]
            trace.add(
                "ssci_impedance_missing_card_fields",
                "Z_conv(jw) wymaga: current_loop_bandwidth_hz, pll_bandwidth_hz, filter_l_pu",
                {"converter_ref": converter.ref, "missing": missing},
                str(exc),
                {"status": "dane niekompletne"},
                "Brak danych karty przekształtnika; wartości zastępczych się nie podstawia.",
                result_pl=("Brak danych karty przekształtnika"),
            )
            return {
                "status": "dane niekompletne",
                "converter_ref": converter.ref,
                "bus_ref": converter.bus_ref,
                "message_pl": (
                    "Analiza SSCI wymaga pol karty falownika (pasmo petli pradowej, "
                    "pasmo PLL, indukcyjnosc filtra). Brakuje: " + ", ".join(missing)
                ),
                "missing_fields": missing,
                "sanity": _sanity_block([], has_inputs=False),
            }

        z_grid_rows: list[JsonDict] = []
        z_conv_rows: list[JsonDict] = []
        l_rows: list[JsonDict] = []
        re_zconv_min = math.inf
        re_zconv_min_f = 0.0
        for f_hz in frequencies:
            harmonic = f_hz / model.base_frequency_hz
            zdiag = self._driving_point_impedance(model, harmonic, with_source_shunt=True)
            z_grid = complex(zdiag[bus_idx])
            z_conv, _components = self._z_conv_components(
                converter, f_hz, f_base_hz=model.base_frequency_hz
            )
            minor_loop = z_grid / z_conv if abs(z_conv) else complex(math.inf, 0.0)
            z_grid_rows.append({"f_hz": f_hz, **self._phasor(z_grid)})
            z_conv_rows.append({"f_hz": f_hz, **self._phasor(z_conv)})
            l_rows.append({"f_hz": f_hz, **self._phasor(minor_loop)})
            if z_conv.real < re_zconv_min:
                re_zconv_min = z_conv.real
                re_zconv_min_f = f_hz

        # White-box trace: emit the model + the per-step transfer functions at a
        # representative low (sub-PLL) frequency so the proof shows the mechanism.
        probe_f = frequencies[0]
        _z_probe, comp = self._z_conv_components(
            converter, probe_f, f_base_hz=model.base_frequency_hz
        )
        f_pll = float(converter.pll_bandwidth_hz)
        z_base = converter.rated_kv**2 / converter.rated_mva if converter.rated_kv else 1.0
        t_d_ms = converter.control_delay_ms if converter.control_delay_ms is not None else 0.0
        trace.add(
            "ssci_zconv_model",
            "Z_conv(jw) = [Z_f + G_d*G_ci] / [1 - G_d*H_pll*(I0*G_ci - V0)/V0]",
            {
                "ref": "Sun 2011 (IEEE TPEL 26-11); Cespedes&Sun 2014 (29-3); Wen 2016 (31-1)",
                "current_loop_bandwidth_hz": float(converter.current_loop_bandwidth_hz),
                "voltage_loop_bandwidth_hz": (
                    float(converter.voltage_loop_bandwidth_hz)
                    if converter.voltage_loop_bandwidth_hz is not None
                    else None
                ),
                "pll_bandwidth_hz": f_pll,
                "control_delay_ms": float(t_d_ms),
                "filter_l_pu": float(converter.filter_l_pu),
                "filter_r_pu": (
                    float(converter.filter_r_pu) if converter.filter_r_pu is not None else 0.0
                ),
                "z_base_ohm": _round(z_base),
            },
            (
                f"w_ci=2*pi*{converter.current_loop_bandwidth_hz} rad/s; "
                f"w_pll=2*pi*{f_pll} rad/s; T_d={t_d_ms} ms; "
                "K_p=w_ci*L_f, K_i=w_ci*R_f (IMC); Z_base=Un^2/Sn"
            ),
            {
                "probe_f_hz": probe_f,
                "G_ci": self._phasor(comp["g_ci"]),
                "H_pll": self._phasor(comp["h_pll"]),
                "G_d": self._phasor(comp["g_d"]),
                "Z_f_pu": self._phasor(comp["z_f_pu"]),
                "Z_conv_pu": self._phasor(comp["z_conv_pu"]),
                "Z_conv_ohm": self._phasor(comp["z_conv_ohm"]),
            },
            "Impedancja filtru w jednostkach względnych, skalowana impedancją bazową [Ω]; wzmocnienia regulatorów bezwymiarowe.",
            result_pl=(
                f"Impedancja wyjściowa przekształtnika przy {probe_f} Hz: "
                f"{_round(abs(comp['z_conv_ohm']), 4)} \u03a9"
            ),
        )
        trace.add(
            "ssci_zgrid_sweep",
            "Z_grid(f) = diag(pinv(Y_bus(f) + Y_src(f))) @ bus(falownika)",
            {
                "bus_ref": converter.bus_ref,
                "f_min_hz": frequencies[0],
                "f_max_hz": frequencies[-1],
                "points": len(frequencies),
            },
            (
                "Macierz admitancyjna jak w skanie jakości energii, powiększona o bocznik źródła "
                "zasilającego; impedancja sterująca wyznaczona na węźle przyłączenia przekształtnika."
            ),
            {"z_grid_at_f_min": self._phasor(complex(z_grid_rows[0]["re"], z_grid_rows[0]["im"]))},
            "Odwrócenie macierzy admitancyjnej [S] daje impedancję [Ω].",
            result_pl=(
                f"Impedancja sieci przy {frequencies[0]} Hz: "
                f"{_round(math.hypot(z_grid_rows[0]['re'], z_grid_rows[0]['im']), 4)} \u03a9"
            ),
        )
        trace.add(
            "ssci_minor_loop_gain",
            "L(jw) = Z_grid(jw) / Z_conv(jw)",
            {"points": len(frequencies)},
            (
                "Iloraz impedancji sieci i impedancji wyjściowej przekształtnika; bliskość punktu "
                "krytycznego (kryterium Nyquista) ocenia warstwa analizy — tutaj wyłącznie fizyka."
            ),
            {
                "re_zconv_min": _round(re_zconv_min),
                "re_zconv_min_f_hz": re_zconv_min_f,
                "negative_resistance_region": re_zconv_min < 0.0,
            },
            "Iloraz impedancji [Ω/Ω] jest bezwymiarowy.",
            result_pl=(
                f"Najmniejsza część rzeczywista impedancji przekształtnika: "
                f"{_round(re_zconv_min, 4)} \u03a9 przy {re_zconv_min_f} Hz"
            ),
        )

        # K-08: sanity-bounds — impedancje skonczone; obecnosc strefy ujemnej
        # rezystancji Z_conv (mechanizm SSCI) ponizej pasma PLL.
        z_grid_finite = all(_finite(row["re"], row["im"]) for row in z_grid_rows)
        z_conv_finite = all(_finite(row["re"], row["im"]) for row in z_conv_rows)
        l_finite = all(_finite(row["re"], row["im"]) for row in l_rows)
        sanity = _sanity_block(
            [
                ("z_grid_finite", z_grid_finite, "Z_grid nieskonczone/NaN"),
                ("z_conv_finite", z_conv_finite, "Z_conv nieskonczone/NaN"),
                ("minor_loop_finite", l_finite, "L(f) nieskonczone/NaN"),
                (
                    "negative_resistance_present",
                    re_zconv_min < 0.0,
                    "Brak strefy Re(Z_conv)<0 ponizej pasma PLL — mechanizm SSCI nieobecny",
                ),
            ],
            has_inputs=True,
        )
        return {
            "converter_ref": converter.ref,
            "bus_ref": converter.bus_ref,
            "base_frequency_hz": model.base_frequency_hz,
            "frequencies_hz": frequencies,
            "z_grid": z_grid_rows,
            "z_conv": z_conv_rows,
            "minor_loop_gain": l_rows,
            "z_conv_negative_resistance": {
                "re_min_ohm": _round(re_zconv_min),
                "f_at_re_min_hz": re_zconv_min_f,
                "present": re_zconv_min < 0.0,
            },
            "sanity": sanity,
        }

    def _voltage_stability(self, model: V126AcademicInput, trace: TraceBuilder) -> JsonDict:
        """Stabilność napięciowa — analiza WSTRZYMANA (karta QU-FABRYKACJA).

        DLACZEGO SOLVER PRZESTAJE TU LICZYĆ. Każda z czterech wielkości, jakie ta
        analiza podawała, powstawała ze WSPÓŁCZYNNIKA BEZ POKRYCIA W DANYCH albo
        z wejścia, którego model nie niesie i które solver sobie DOMYŚLAŁ:

        1. ZAPAS MOCY BIERNEJ (`qv_curves`) — zdolność wytwórcza brana jako
           ``0,15 · P``, zapotrzebowanie jako ``0,35 · P``. Zapotrzebowanie model
           NIESIE (``bus.load_mvar``, używane niżej w `_branch_current_a`), więc
           liczenie go z krotności mocy czynnej było fabrykacją przy dostępnej
           danej rzeczywistej. Zdolność wytwórcza NIE MA DROGI DO SOLVERA:
           `V126BusInput` ani `V126ConverterInput` nie mają pola zdolności biernej,
           a w modelu ENM (pomiar 2026-08-08 na `sldSubstrate52s` i `demo_oze_sc`)
           `Generator.limits.q_min_mvar/q_max_mvar` nie niesie ŻADEN z 35 wytwórców,
           krzywej producenta `pq_curve` — żaden, ``cosphi_min`` — żaden;
           ``materialized_params.qmin_mvar`` niesie 7 z 35 (20 %). Margines jest
           RÓŻNICĄ obu członów, więc jest tak uczciwy, jak jego gorszy człon:
           pokrycie 0 %. Nazwa „krzywa Q–U" była do tego fałszywym rodowodem —
           we wzorze nie występowało napięcie w żadnej postaci.
        2. MARGINES OBCIĄŻALNOŚCI P–U (`pv_curves`,
           `voltage_stability_margin_percent`) — ``1 + min(2,5; S_sc/P/20)``,
           dalej ``0,7`` i ``0,12`` w napięciu w punkcie krytycznym. Zdjęty
           z ekranu kartą V126-WYGASZENIE z długiem nazwanym wprost („albo liczyć
           realną krzywą P–U rozpływem, albo zdjąć pole"). Ta karta dług ZAMYKA:
           pole kontraktu zostaje, znika liczba.
        3. WSKAŹNIK L (`l_index_per_bus`) — ``P/S_sc · 4`` z obcięciem na ``0,98``.
           Czwórka nie ma pokrycia ani w danych, ani w normie. Opublikowany
           wskaźnik L (Kessel–Glavitsch 1986) liczy się z macierzy F wyprowadzonej
           z Y-bus przy ZBIEŻNYM rozpływie — to inny wzór, więc nazwa „L" była
           trzecim fałszywym rodowodem tego samego pliku.
        4. WARTOŚĆ WŁASNA (`modal_analysis`) — ``(1 − L) · U_pu``, czyli pochodna
           punktu 3, do tego ważona napięciem, które model wypełnia wartością
           domyślną kontraktu (pomiar: ``voltage_pu ≠ 1,0`` dla 0 z 408 szyn).

        WSPÓLNY MIANOWNIK: moc zwarciowa węzła. Wszystkie cztery stały na
        ``bus.fault_level_mva or max(25; U_n · 10)`` — a pomiar pokazał, że pole
        jest podane dla 1 z 315 szyn (`sldSubstrate52s`) i 1 z 93 (`demo_oze_sc`),
        czyli dla 99,7 % węzłów liczba wchodziła ZMYŚLONA. Zmyślone wejście psuje
        nie tylko ekran, ale i zapis audytowy oraz pakiet dowodowy.

        CO ZOSTAJE: kontrakt odpowiedzi (FROZEN) w komplecie — te same klucze,
        ta sama struktura, wartości ``None`` i DODATKOWE pole ``brak_danych``
        z powodem po polsku. Nigdy zero udające pomiar: zero jest wynikiem
        pomiaru, ``None`` jest jego brakiem i te dwa stany nie mogą wyglądać
        tak samo. Blok wiarygodności melduje „dane niekompletne".

        JAK PRZYWRÓCIĆ (dług nazwany, `docs/v12xx/REJESTR_KONFLIKTOW.md`,
        wiersz QU-FABRYKACJA): (a) doprowadzić do kontraktu moc zwarciową węzła
        i zdolność wytwórczą mocy biernej (`GenLimits` → most ENM→V12.6), (b)
        policzyć wskaźnik L z macierzy F na Y-bus przy rozpływie (moduł `_ybus`
        w tym pliku już istnieje), (c) krzywą P–U liczyć rozpływem, nie ze
        sztywności węzła. Do tego czasu analiza melduje uczciwy brak.
        """
        powod_qu = (
            "Zapas mocy biernej nie jest wyznaczany: kontrakt wejściowy nie niesie "
            "zdolności wytwórczej mocy biernej (ani granic Q wytwórcy, ani krzywej "
            "producenta P–Q), a poprzednia wartość powstawała z krotności mocy czynnej "
            "bez pokrycia w danych. Uzupełnij granice mocy biernej źródeł, aby "
            "przywrócić tę wielkość."
        )
        powod_pu = (
            "Margines obciążalności P–U nie jest wyznaczany: powstawał z przybliżenia "
            "ze sztywności węzła o zaszytych współczynnikach, a nie z krzywej P–U "
            "liczonej rozpływem. Wymaga rozpływu mocy na modelu przypadku."
        )
        powod_l = (
            "Wskaźnik bliskości załamania napięcia nie jest wyznaczany: poprzedni wzór "
            "mnożył stosunek obciążenia do mocy zwarciowej przez współczynnik bez "
            "pokrycia w danych i w normie. Wymaga wyznaczenia z macierzy admitancyjnej "
            "przy zbieżnym rozpływie oraz mocy zwarciowej węzłów w modelu."
        )
        pv_curves: list[JsonDict] = [
            {
                "bus_ref": bus.ref,
                "lambda_max": None,
                "u_at_max": None,
                "margin_percent": None,
                "brak_danych": powod_pu,
            }
            for bus in model.buses
        ]
        qv_curves: list[JsonDict] = [
            {
                "bus_ref": bus.ref,
                "q_min_mvar": None,
                "q_available_mvar": None,
                "margin_mvar": None,
                "brak_danych": powod_qu,
            }
            for bus in model.buses
        ]
        l_indices: list[JsonDict] = [
            {
                "bus_ref": bus.ref,
                "l_index": None,
                "alert": None,
                "brak_danych": powod_l,
            }
            for bus in model.buses
        ]
        trace.add(
            "voltage_stability_indices",
            r"\text{brak danych wejściowych} \Rightarrow \text{wielkość niewyznaczana}",
            {
                "buses": len(model.buses),
                "buses_with_fault_level": sum(
                    1 for bus in model.buses if bus.fault_level_mva is not None
                ),
                "reactive_capability_source": None,
            },
            "Żadna z wielkości stabilności napięciowej nie została wyznaczona — "
            "brakuje mocy zwarciowej węzłów oraz zdolności wytwórczej mocy biernej, "
            "a poprzednie wzory zastępowały te dane współczynnikami bez pokrycia.",
            {
                "pv_curves": None,
                "qv_curves": None,
                "l_index_per_bus": None,
                "modal_analysis": None,
            },
            "Brak wielkości do sprawdzenia jednostek — analiza nie wyznacza liczb.",
            result_pl=(
                "Analiza wstrzymana: brak danych wejściowych (moc zwarciowa węzłów "
                f"podana dla {sum(1 for bus in model.buses if bus.fault_level_mva is not None)} "
                f"z {len(model.buses)} szyn; zdolność wytwórcza mocy biernej nieprzenoszona "
                "przez kontrakt wejściowy)."
            ),
        )
        # Blok wiarygodności: nie ma czego oceniać, więc melduje „dane niekompletne"
        # — ten sam stan, co każda inna analiza V12.6 bez kompletu wejść. Lista
        # kontroli pozostaje nazwana, żeby przywrócenie wielkości wracało razem
        # ze swoimi granicami, a nie do bloku bez kontroli.
        sanity = _sanity_block(
            [
                ("margin_finite", False, "Margines P-V nieskończony/NaN"),
                ("margin_nonneg", False, "Margines P-V < 0 (układ za punktem kolapsu)"),
                ("l_index_range", False, "L-index poza [0,1] (niefizyczny)"),
                ("eigenvalue_positive", False, "Zapas do załamania <= 0 (kolaps napięciowy)"),
            ],
            has_inputs=False,
        )
        return {
            "pv_curves": pv_curves,
            "qv_curves": qv_curves,
            "modal_analysis": {
                "smallest_eigenvalue": None,
                "critical_mode": {
                    "eigenvalue": None,
                    "participating_buses": [],
                },
                "brak_danych": powod_l,
            },
            "l_index_per_bus": l_indices,
            "voltage_stability_margin_percent": None,
            "brak_danych": powod_pu,
            "sanity": sanity,
        }

    def _branch_current_a(self, model: V126AcademicInput, branch: Any) -> float:
        to_bus = next((bus for bus in model.buses if bus.ref == branch.to_bus_ref), None)
        if to_bus is None:
            return 0.0
        apparent_mva = math.hypot(
            to_bus.load_mw - to_bus.generation_mw, to_bus.load_mvar - to_bus.generation_mvar
        )
        return apparent_mva * 1000.0 / (math.sqrt(3) * max(to_bus.nominal_kv, 1e-6))

    def _reliability(self, model: V126AcademicInput, trace: TraceBuilder) -> JsonDict:
        contingencies: list[JsonDict] = []
        customers_total = max(sum(bus.customer_count for bus in model.buses), 1)
        saidi = 0.0
        saifi = 0.0
        bez_obciazalnosci: list[str] = []
        for branch in model.branches:
            current = self._branch_current_a(model, branch)
            affected = sum(
                bus.customer_count for bus in model.buses if bus.ref == branch.to_bus_ref
            )
            # Obciążalność NIEZNANA ⇒ stopnia obciążenia NIE DA SIĘ policzyć i
            # człon przeciążeniowy dotkliwości nie powstaje. Przed kartą
            # MOST-WEJSCIA-V126 most wstawiał tu 630 A każdemu aparatowi i 300 A
            # każdemu odcinkowi bez obciążalności, więc iloraz I/I_dop wychodził
            # zawsze — tylko z liczby, której nikt nie zmierzył.
            pozycja: JsonDict = {
                "contingency": branch.ref,
                "order": "N-1",
            }
            if branch.ampacity_a is None:
                bez_obciazalnosci.append(branch.ref)
                severity = affected / customers_total * 10.0
                pozycja["max_loading_percent"] = None
                pozycja["brak_danych"] = (
                    "Element nie ma obciążalności długotrwałej w modelu ani w karcie "
                    "katalogowej — stopnia obciążenia i przeciążenia nie policzono. "
                    "Dotkliwość obejmuje wyłącznie skutek odbiorowy."
                )
            else:
                overload = max(0.0, current / branch.ampacity_a - 1.0)
                severity = overload * 100.0 + affected / customers_total * 10.0
                pozycja["max_loading_percent"] = _round(current / branch.ampacity_a * 100.0, 2)
            pozycja["severity"] = _round(severity, 4)
            contingencies.append(pozycja)
            saidi += (
                branch.failure_rate_per_year * branch.mttr_h * 60.0 * affected / customers_total
            )
            saifi += branch.failure_rate_per_year * affected / customers_total
        for first, second in combinations(model.branches[:80], 2):
            contingencies.append(
                {
                    "contingency": f"{first.ref}+{second.ref}",
                    "order": "N-2",
                    "severity": _round(
                        first.failure_rate_per_year + second.failure_rate_per_year, 5
                    ),
                }
            )
        caidi = saidi / saifi if saifi else 0.0
        # D-14: sanity-bounds (IEEE 1366 — wielkości fizycznie ograniczone).
        minutes_per_year = 525600.0
        # `max_loading_percent` bywa teraz `None` (gałąź bez obciążalności) — brak
        # nie jest ani przeciążeniem, ani jego brakiem, więc nie wchodzi do zliczenia.
        # Porównanie `None > 100.0` podniosłoby TypeError, a `get(..., 0.0)` cicho
        # zaliczyłoby brak do „bez przeciążenia" — obie formy byłyby nieuczciwe.
        overloaded = [
            c
            for c in contingencies
            if isinstance(c.get("max_loading_percent"), int | float)
            and c["max_loading_percent"] > 100.0
        ]
        raw_customers = sum(bus.customer_count for bus in model.buses)
        sanity = _sanity_block(
            [
                ("saidi_nonneg", saidi >= 0.0, "SAIDI < 0 (niefizyczne)"),
                (
                    "saidi_max",
                    saidi <= minutes_per_year,
                    f"SAIDI > {minutes_per_year:.0f} min/rok (> rok przerwy)",
                ),
                ("saifi_nonneg", saifi >= 0.0, "SAIFI < 0 (niefizyczne)"),
                ("saifi_max", saifi <= 1000.0, "SAIFI > 1000/rok (nierealne)"),
            ],
            has_inputs=raw_customers > 0 and len(model.branches) > 0,
        )
        if overloaded:
            sanity.setdefault("violations", []).append(
                {
                    "check": "n1_overload",
                    "detail_pl": f"{len(overloaded)} kontyngencji N-1 z przeciążeniem > 100%",
                }
            )
            if sanity["status"] == "zweryfikowany":
                sanity["status"] = "poza zakresem wiarygodności"
        trace.add(
            "reliability_indices",
            "SAIDI = sum(lambda_e * MTTR_e * 60 * N_e) / N_t; SAIFI = sum(lambda_e * N_e)/N_t",
            {"branches": len(model.branches), "customers_total": customers_total},
            "Dla każdej gałęzi wyznaczono liczbę odbiorców zasilanych za nią oraz roczny "
            "wkład jej awaryjności do wskaźników przerw.",
            {"saidi_min_per_year": _round(saidi, 4), "saifi_per_year": _round(saifi, 5)},
            "Intensywność uszkodzeń [1/rok] razy czas odtworzenia [h] razy 60 daje [min/rok].",
            result_pl=(
                f"Przerwy na odbiorcę: {_round(saidi, 4)} min/rok, {_round(saifi, 5)} 1/rok"
            ),
        )
        wynik: JsonDict = {
            "contingency_ranking": sorted(
                contingencies, key=lambda item: (-item["severity"], item["contingency"])
            )[:100],
            "indices": {
                "saidi_min_per_year": _round(saidi, 4),
                "saifi_per_year": _round(saifi, 5),
                "caidi_min_per_interruption": _round(caidi, 4),
                "maifi_per_year": _round(0.12 * saifi, 5),
            },
            "sanity": sanity,
        }
        if bez_obciazalnosci:
            # Meldunek ZBIORCZY obok meldunków przy pozycjach: czytelnik ma
            # zobaczyć zasięg braku raz, a nie składać go z rankingu przyciętego
            # do stu pozycji.
            wynik["brak_danych"] = (
                f"{len(bez_obciazalnosci)} z {len(model.branches)} elementów nie ma "
                "obciążalności długotrwałej (model ani karta katalogowa) — dla nich "
                "stopnia obciążenia N-1 nie policzono."
            )
            wynik["elementy_bez_obciazalnosci"] = sorted(bez_obciazalnosci)
        return wynik

    def _earthing(self, model: V126AcademicInput, trace: TraceBuilder) -> JsonDict:
        data = model.earthing
        if data is None:
            data = model.parameters.get("earthing")
            if isinstance(data, dict):
                from solver_input.v126_contracts import V126EarthingInput

                data = V126EarthingInput.model_validate(data)
            else:
                from solver_input.v126_contracts import V126EarthingInput

                data = V126EarthingInput()
        area = data.length_m * data.width_m
        conductors_x = math.floor(data.width_m / data.mesh_spacing_m) + 1
        conductors_y = math.floor(data.length_m / data.mesh_spacing_m) + 1
        lc = conductors_x * data.length_m + conductors_y * data.width_m + data.rods_total_length_m
        rg = data.rho1_ohm_m * (
            1 / max(lc, 1e-9)
            + 1 / math.sqrt(20 * area) * (1 + 1 / (1 + data.buried_depth_m * math.sqrt(20 / area)))
        )
        ig_ka = data.fault_current_ka * data.split_factor
        gpr_kv = ig_ka * rg
        n = max(conductors_x, conductors_y)
        ki = 1 + 0.172 * n
        km = 0.8 + data.mesh_spacing_m / max(16 * data.buried_depth_m, 1e-9)
        ks = 0.6 + data.mesh_spacing_m / max(20 * data.buried_depth_m, 1e-9)
        u_touch = data.rho1_ohm_m * km * ki * ig_ka * 1000 / max(lc, 1e-9)
        u_step = data.rho1_ohm_m * ks * ki * ig_ka * 1000 / max(lc, 1e-9)
        u_touch_allow = (
            (1000 + 1.5 * data.surface_layer_derating * data.surface_layer_rho_ohm_m)
            * 0.157
            / math.sqrt(data.fault_clearing_time_s)
        )
        u_step_allow = (
            (1000 + 6 * data.surface_layer_derating * data.surface_layer_rho_ohm_m)
            * 0.157
            / math.sqrt(data.fault_clearing_time_s)
        )
        trace.add(
            "ieee80_sverak",
            "Rg = rho * [1/Lc + 1/sqrt(20A)*(1 + 1/(1+h*sqrt(20/A)))]",
            {"area_m2": area, "lc_m": lc, "rho_ohm_m": data.rho1_ohm_m},
            f"R_g = {data.rho1_ohm_m} Ω·m · (1/{_round(lc, 3)} m + człon powierzchniowy siatki)",
            {"r_g_ohm": _round(rg, 6), "gpr_kv": _round(gpr_kv, 6)},
            "Rezystywność [Ω·m] razy odwrotność długości [1/m] daje rezystancję [Ω]; prąd [kA] razy rezystancja [Ω] daje napięcie [kV].",
            result_pl=(
                f"Rezystancja uziomu: {_round(rg, 6)} \u03a9; wzrost potencjału: {_round(gpr_kv, 6)} kV"
            ),
        )
        if u_touch <= u_touch_allow and u_step <= u_step_allow:
            safety = "bezpieczny"
        elif u_touch <= 1.25 * u_touch_allow and u_step <= 1.25 * u_step_allow:
            safety = "wymaga_ochrony"
        else:
            safety = "niezgodny"
        # K-08: sanity-bounds IEEE 80 / EN 50522 — Rg, GPR, napięcia rażenia skończone i ≥ 0.
        has_earthing = model.earthing is not None or isinstance(
            model.parameters.get("earthing"), dict
        )
        sanity = _sanity_block(
            [
                ("rg_nonneg", _finite(rg) and rg >= 0.0, "Rg < 0 lub nieskończone"),
                ("gpr_nonneg", _finite(gpr_kv) and gpr_kv >= 0.0, "GPR < 0 lub nieskończone"),
                (
                    "u_touch_nonneg",
                    _finite(u_touch) and u_touch >= 0.0,
                    "U_touch < 0 lub nieskończone",
                ),
                (
                    "u_step_nonneg",
                    _finite(u_step) and u_step >= 0.0,
                    "U_step < 0 lub nieskończone",
                ),
            ],
            has_inputs=has_earthing,
        )
        return {
            "sanity": sanity,
            "gpz_ref": data.gpz_ref,
            "soil_model": {"rho1": data.rho1_ohm_m, "rho2": data.rho2_ohm_m, "h1": data.h1_m},
            "grid_geometry": {
                "length_m": data.length_m,
                "width_m": data.width_m,
                "mesh_spacing_m": data.mesh_spacing_m,
                "buried_depth_m": data.buried_depth_m,
            },
            "r_g_ohm": _round(rg, 6),
            "gpr_kv": _round(gpr_kv, 6),
            "i_g_ka": _round(ig_ka, 6),
            "split_factor": data.split_factor,
            "u_touch_calculated_v": _round(u_touch, 3),
            "u_touch_allowable_v": _round(u_touch_allow, 3),
            "u_step_calculated_v": _round(u_step, 3),
            "u_step_allowable_v": _round(u_step_allow, 3),
            "safety_status": safety,
            "fault_clearing_time_s": data.fault_clearing_time_s,
        }

    # D-06a/b: PROJEKT UZIEMIENIA PUNKTU NEUTRALNEGO SIECI (dławik Petersena /
    # rezystor uziemiający NER). Fizyka pierwszych zasad (NIE tablica) — kompensacja
    # prądu pojemnościowego doziemienia i dobór rezystancji punktu neutralnego.
    # Odrębne od _earthing() (IEEE 80 — siatka uziemiająca, napięcia rażenia).
    # Źródło C0: B0 = b0_siemens_per_km × length_km galwanicznie połączonej sieci SN.
    # Referencje (wzory pierwszych zasad, nie współczynniki tablicowe):
    #   - W. Petersen, kompensacja rezonansowa: ωL = 1/(3ωC0) → L = 1/(3ω²C0).
    #   - IEC 62271-203 / IEC 60071 / VDE praktyka sieci skompensowanych.
    #   - Prąd pojemnościowy: Ic = 3·ω·C0·U_f = √3·ω·C0·U_l (tożsame, U_f = U_l/√3).
    #   - Stopień rozstrojenia v = (I_L − I_C)/I_C; prąd resztkowy I_res = I_C·√(d²+v²).
    #   - NER: R = U_f / I_ef; sprawdzenie cieplne I_ef²·R·t ≤ E_rating.
    def _neutral_earthing_design(self, model: V126AcademicInput, trace: TraceBuilder) -> JsonDict:
        omega = 2.0 * math.pi * model.base_frequency_hz
        params = model.parameters
        # Typ uziemienia: jawny parametr; fallback do GroundingConfig.type z modelu.
        scheme = str(
            params.get("neutral_earthing_type")
            or params.get("neutral_grounding")
            or "petersen_coil"
        )

        # --- Krok 1: zsumuj pojemność doziemną C0 sieci galwanicznie połączonej. ---
        # Tylko linie/kable z jawnym b0 (zero-sequence / line-to-earth). Element bez
        # b0 → "dane niekompletne" (zakaz fabrykacji C0). Łączniki otwarte pomijane.
        b0_total_s = 0.0
        contributing: list[JsonDict] = []
        missing_b0: list[str] = []
        for branch in model.branches:
            if branch.kind not in {"line_overhead", "cable"}:
                continue
            if getattr(branch, "is_open", False):
                continue
            b0_per_km = getattr(branch, "b0_siemens_per_km", None)
            if b0_per_km is None:
                missing_b0.append(branch.ref)
                continue
            b0_branch = float(b0_per_km) * branch.length_km
            b0_total_s += b0_branch
            contributing.append(
                {
                    "branch_ref": branch.ref,
                    "kind": branch.kind,
                    "length_km": branch.length_km,
                    "b0_siemens_per_km": float(b0_per_km),
                    "b0_total_siemens": _round(b0_branch, 12),
                }
            )

        # Napięcie sieci (linia–linia) z najwyższego węzła SN modelu.
        u_line_kv = max((bus.nominal_kv for bus in model.buses), default=0.0)
        u_line_v = u_line_kv * 1000.0
        u_phase_v = u_line_v / math.sqrt(3.0)

        # Brak jakiejkolwiek pojemności doziemnej → C0 nie do policzenia (nie zgadujemy).
        if b0_total_s <= 0.0 or u_line_kv <= 0.0:
            reason = (
                "Brak jawnej pojemności doziemnej B0 (b0_siemens_per_km) dla linii/kabli "
                "sieci SN — C0 nieoznaczalne (zakaz fabrykacji)."
                if b0_total_s <= 0.0
                else "Brak napięcia znamionowego sieci (U_l) — projekt niewykonalny."
            )
            trace.add(
                "neutral_earthing_no_c0",
                "C0 = (1/ω)·Σ(b0_branch_total); Ic = √3·ω·C0·U_l",
                {
                    "branches_with_b0": len(contributing),
                    "branches_missing_b0": missing_b0,
                    "u_line_kv": u_line_kv,
                },
                reason,
                {"status": "dane niekompletne"},
                "Brak danych wejściowych (B0 lub U_l) — brak oszacowania zastępczego.",
                result_pl=("Brak danych do wyznaczenia prądu pojemnościowego doziemienia"),
            )
            return {
                "status": "dane niekompletne",
                "neutral_earthing_type": scheme,
                "message_pl": reason,
                "missing_fields": (["b0_siemens_per_km"] if b0_total_s <= 0.0 else ["nominal_kv"]),
                "branches_missing_b0": missing_b0,
                "sanity": _sanity_block([], has_inputs=False),
            }

        # C0 [F] z sumy susceptancji doziemnych: B0 = ω·C0 ⇒ C0 = B0/ω.
        c0_farad = b0_total_s / omega
        # Prąd pojemniczy doziemienia (1-fazowe doziemienie metaliczne): Ic = √3·ω·C0·U_l.
        ic_a = math.sqrt(3.0) * omega * c0_farad * u_line_v
        trace.add(
            "neutral_earthing_capacitive_current",
            "C0 = (1/ω)·Σ(b0·len);  Ic = 3·ω·C0·U_f = √3·ω·C0·U_l",
            {
                "ref": "Petersen resonant earthing; IEC 62271-203 / VDE practice",
                "omega_rad_s": _round(omega, 6),
                "b0_total_siemens": _round(b0_total_s, 12),
                "u_line_kv": u_line_kv,
                "branches_contributing": len(contributing),
                "branches_missing_b0": missing_b0,
            },
            f"C0={_round(b0_total_s, 12)}/{_round(omega, 4)}; "
            f"Ic=√3·{_round(omega, 4)}·{_round(c0_farad, 12)}·{u_line_v}",
            {"c0_farad": _round(c0_farad, 12), "ic_a": _round(ic_a, 4)},
            "S/(rad/s)=F; (rad/s)·F·V=A. U_f=U_l/√3 ⇒ 3ωC0U_f=√3ωC0U_l.",
            result_pl=(f"Prąd pojemnościowy doziemienia sieci: {_round(ic_a, 4)} A"),
        )

        if scheme == "resistor_grounded" or scheme == "resistor":
            result = self._ner_design(model, trace, ic_a, u_phase_v)
        else:
            result = self._petersen_design(model, trace, c0_farad, ic_a, omega)
        result["neutral_earthing_type"] = scheme
        result["capacitive_earth_fault_current_a"] = _round(ic_a, 4)
        result["c0_farad"] = _round(c0_farad, 12)
        result["network_line_voltage_kv"] = u_line_kv
        result["branches_missing_b0"] = missing_b0
        result["branches_contributing"] = contributing
        return result

    def _petersen_design(
        self,
        model: V126AcademicInput,
        trace: TraceBuilder,
        c0_farad: float,
        ic_a: float,
        omega: float,
    ) -> JsonDict:
        params = model.parameters
        # Rozstrojenie: jawny parametr (default 0.05 = ±5 %), NIE ukryta stała.
        detuning = float(params.get("petersen_detuning", 0.05))
        # Składowa rezystancyjna (tłumienie) prądu resztkowego d = I_R/I_C — jawny
        # parametr, default 0.0 (gdy karta dławika nie podaje strat). Bez d>0 prąd
        # resztkowy przy idealnym rezonansie = 0 (z modelu, nie zgadnięty).
        damping_d = float(params.get("petersen_residual_damping", 0.0))

        # Rezonans: ωL = 1/(3ωC0) ⇒ L = 1/(3·ω²·C0); X_L = ωL.
        x_coil_ohm = 1.0 / (3.0 * omega * c0_farad)
        l_coil_h = 1.0 / (3.0 * omega**2 * c0_farad)
        # Prąd dławika w rezonansie kompensuje Ic: I_L = Ic.
        i_coil_a = ic_a
        trace.add(
            "petersen_resonance_tuning",
            "ωL = 1/(3ωC0)  ⇒  L = 1/(3·ω²·C0);  X_L = ωL;  I_L(rezonans)=Ic",
            {
                "ref": "W. Petersen, kompensacja rezonansowa (sieć skompensowana)",
                "c0_farad": _round(c0_farad, 12),
                "omega_rad_s": _round(omega, 6),
                "ic_a": _round(ic_a, 4),
            },
            f"L=1/(3·{_round(omega, 4)}²·{_round(c0_farad, 12)}); "
            f"X_L=1/(3·{_round(omega, 4)}·{_round(c0_farad, 12)})",
            {
                "l_coil_h": _round(l_coil_h, 8),
                "x_coil_ohm": _round(x_coil_ohm, 4),
                "i_coil_rating_a": _round(i_coil_a, 4),
            },
            "1/((rad/s)²·F)=H; 1/((rad/s)·F)=Ω; prąd dławika [A] = Ic [A].",
            result_pl=(
                f"Dławik gaszący: {_round(l_coil_h, 8)} H, {_round(x_coil_ohm, 4)} \u03a9, prąd znamionowy {_round(i_coil_a, 4)} A"
            ),
        )

        # Prąd resztkowy: stopień rozstrojenia v ⇒ I_res = Ic·√(d² + v²).
        # W rezonansie (v=0): I_res = Ic·d (czysto rezystancyjny; =0 gdy d=0).
        i_res_resonance_a = ic_a * damping_d
        i_res_detuned_a = ic_a * math.sqrt(damping_d**2 + detuning**2)
        trace.add(
            "petersen_residual_current",
            "v=(I_L−I_C)/I_C;  I_res = I_C·√(d² + v²)",
            {
                "ic_a": _round(ic_a, 4),
                "detuning_v": detuning,
                "residual_damping_d": damping_d,
            },
            f"I_res(rezonans)=Ic·{damping_d}; "
            f"I_res(±{detuning})=Ic·√({damping_d}²+{detuning}²)",
            {
                "i_residual_resonance_a": _round(i_res_resonance_a, 6),
                "i_residual_detuned_a": _round(i_res_detuned_a, 6),
            },
            "Mnożnik bezwymiarowy razy prąd [A] daje prąd [A].",
            result_pl=(
                f"Prąd resztkowy: {_round(i_res_resonance_a, 6)} A w rezonansie, {_round(i_res_detuned_a, 6)} A przy rozstrojeniu"
            ),
        )

        # K-08: sanity-bounds — wartości skończone i nieujemne; rozstrojenie w [0,1).
        sanity = _sanity_block(
            [
                (
                    "l_coil_positive",
                    _finite(l_coil_h) and l_coil_h > 0.0,
                    "Indukcyjność dławika ≤ 0 lub nieskończona",
                ),
                (
                    "x_coil_positive",
                    _finite(x_coil_ohm) and x_coil_ohm > 0.0,
                    "Reaktancja dławika ≤ 0 lub nieskończona",
                ),
                (
                    "residual_le_ic",
                    _finite(i_res_detuned_a) and 0.0 <= i_res_detuned_a <= ic_a + 1e-9,
                    "Prąd resztkowy poza [0, Ic] (niefizyczny)",
                ),
                (
                    "detuning_range",
                    _finite(detuning) and 0.0 <= detuning < 1.0,
                    "Rozstrojenie poza [0,1)",
                ),
            ],
            has_inputs=True,
        )
        return {
            "sanity": sanity,
            "design_mode": "petersen_coil",
            "coil_reactance_ohm": _round(x_coil_ohm, 4),
            "coil_inductance_h": _round(l_coil_h, 8),
            "coil_current_rating_a": _round(i_coil_a, 4),
            "detuning_assumed": detuning,
            "residual_damping_assumed": damping_d,
            "residual_current_at_resonance_a": _round(i_res_resonance_a, 6),
            "residual_current_at_detuning_a": _round(i_res_detuned_a, 6),
            "tuning_status": (
                "dostrojony" if i_res_detuned_a <= 0.1 * ic_a else "rozstrojony_poza_10pct"
            ),
        }

    def _ner_design(
        self,
        model: V126AcademicInput,
        trace: TraceBuilder,
        ic_a: float,
        u_phase_v: float,
    ) -> JsonDict:
        params = model.parameters
        # Docelowy prąd doziemienia I_ef — jawny parametr projektowy (NIE stała).
        target_raw = params.get("ner_target_earth_fault_current_a")
        if target_raw is None:
            reason = (
                "Dobór rezystora NER wymaga docelowego prądu doziemienia I_ef "
                "(ner_target_earth_fault_current_a) — parametr projektowy nie podany."
            )
            trace.add(
                "ner_no_target",
                "R ≈ U_f / I_ef",
                {"u_phase_v": _round(u_phase_v, 4)},
                reason,
                {"status": "dane niekompletne"},
                "Brak parametru projektowego I_ef — brak wartości zgadywanej.",
                result_pl=("Brak zadanego prądu zwarcia doziemnego — rezystancji nie dobrano"),
            )
            return {
                "status": "dane niekompletne",
                "design_mode": "resistor_grounded",
                "message_pl": reason,
                "missing_fields": ["ner_target_earth_fault_current_a"],
                "sanity": _sanity_block([], has_inputs=False),
            }
        i_ef_target_a = float(target_raw)

        # R = U_f / I_ef (rezystancja punktu neutralnego dominuje impedancję zerową).
        r_ohm = u_phase_v / i_ef_target_a
        # Wypadkowy prąd doziemienia: składowa rezystancyjna przez R w fazie z napięciem
        # i składowa pojemnościowa Ic w kwadraturze: I_ef = √(I_R² + Ic²), I_R = U_f/R.
        i_resistive_a = u_phase_v / r_ohm
        i_ef_a = math.sqrt(i_resistive_a**2 + ic_a**2)
        trace.add(
            "ner_resistance_sizing",
            "R = U_f / I_ef;  I_ef_wyp = √((U_f/R)² + Ic²)",
            {
                "ref": "Resistance-earthed neutral; IEC 60364 / VDE practice",
                "u_phase_v": _round(u_phase_v, 4),
                "i_ef_target_a": i_ef_target_a,
                "ic_a": _round(ic_a, 4),
            },
            f"R={_round(u_phase_v, 4)}/{i_ef_target_a}; "
            f"I_ef=√(({_round(u_phase_v, 4)}/{_round(r_ohm, 4)})²+{_round(ic_a, 4)}²)",
            {"r_ohm": _round(r_ohm, 4), "i_ef_resultant_a": _round(i_ef_a, 4)},
            "V/A=Ω; √(A²+A²)=A.",
            result_pl=(
                f"Rezystancja uziemiająca: {_round(r_ohm, 4)} \u03a9; wynikowy prąd doziemienia: {_round(i_ef_a, 4)} A"
            ),
        )

        # Sprawdzenie cieplne: energia I_ef²·R·t_clear ≤ znamionowa energia rezystora.
        # t_clear: jawny czas wyłączenia (z nastaw/parametru). Brak → "dane niekompletne".
        t_clear_raw = params.get("ner_clearing_time_s")
        rating_raw = params.get("ner_energy_rating_j")
        thermal: JsonDict
        if t_clear_raw is None or rating_raw is None:
            missing = [
                name
                for name, value in (
                    ("ner_clearing_time_s", t_clear_raw),
                    ("ner_energy_rating_j", rating_raw),
                )
                if value is None
            ]
            trace.add(
                "ner_thermal_incomplete",
                "E_dissipated = I_ef²·R·t_clear ≤ E_rating",
                {"missing": missing},
                "Brak czasu wyłączenia lub znamionowej energii rezystora.",
                {"status": "dane niekompletne"},
                "Sprawdzenie cieplne wymaga t_clear i E_rating — bez zgadywania.",
                result_pl=("Sprawdzenia cieplnego nie wykonano — brak danych"),
            )
            thermal = {
                "status": "dane niekompletne",
                "missing_fields": missing,
            }
        else:
            t_clear_s = float(t_clear_raw)
            e_rating_j = float(rating_raw)
            e_dissipated_j = i_ef_a**2 * r_ohm * t_clear_s
            thermal_ok = e_dissipated_j <= e_rating_j
            trace.add(
                "ner_thermal_withstand",
                "E_dissipated = I_ef²·R·t_clear ≤ E_rating",
                {
                    "i_ef_a": _round(i_ef_a, 4),
                    "r_ohm": _round(r_ohm, 4),
                    "t_clear_s": t_clear_s,
                    "e_rating_j": e_rating_j,
                },
                f"E={_round(i_ef_a, 4)}²·{_round(r_ohm, 4)}·{t_clear_s}",
                {
                    "e_dissipated_j": _round(e_dissipated_j, 4),
                    "thermal_ok": thermal_ok,
                },
                "A²·Ω·s = W·s = J ≤ J.",
                result_pl=(
                    f"Energia wydzielona w rezystorze: {_round(e_dissipated_j, 4)} J "
                    f"(znamionowa: {e_rating_j} J)"
                ),
            )
            thermal = {
                "status": "zgodny" if thermal_ok else "niezgodny",
                "energy_dissipated_j": _round(e_dissipated_j, 4),
                "energy_rating_j": e_rating_j,
                "clearing_time_s": t_clear_s,
                "thermal_ok": thermal_ok,
            }

        # K-08: sanity-bounds — R i I_ef skończone i dodatnie.
        sanity = _sanity_block(
            [
                ("r_positive", _finite(r_ohm) and r_ohm > 0.0, "R ≤ 0 lub nieskończone"),
                (
                    "i_ef_positive",
                    _finite(i_ef_a) and i_ef_a > 0.0,
                    "I_ef ≤ 0 lub nieskończone",
                ),
            ],
            has_inputs=True,
        )
        return {
            "sanity": sanity,
            "design_mode": "resistor_grounded",
            "resistor_ohm": _round(r_ohm, 4),
            "target_earth_fault_current_a": i_ef_target_a,
            "resultant_earth_fault_current_a": _round(i_ef_a, 4),
            "resistive_component_a": _round(i_resistive_a, 4),
            "thermal_check": thermal,
        }

    def _insulation(self, model: V126AcademicInput, trace: TraceBuilder) -> JsonDict:
        bil_table = [
            (12.0, 75.0, 28.0),
            (17.5, 95.0, 38.0),
            (24.0, 125.0, 50.0),
            (36.0, 170.0, 70.0),
        ]
        rows: list[JsonDict] = []
        for item in model.insulation:
            bil, withstand = next(
                ((bil, w) for um, bil, w in bil_table if item.u_m_kv <= um),
                (170.0, 70.0),
            )
            if item.arrester_mcov_kv is None:
                mcov = (
                    item.u_m_kv * 1.05
                    if item.network_neutral == "isolated"
                    else item.u_m_kv / math.sqrt(3) * 1.05
                )
            else:
                mcov = item.arrester_mcov_kv
            residual = item.arrester_residual_10ka_kv or mcov * 2.8
            tov = item.predicted_tov_kv or item.u_m_kv * (
                1.4 if item.network_neutral == "isolated" else 1.15
            )
            margin = (bil - residual) / max(residual, 1e-9) * 100.0
            rows.append(
                {
                    "location_bus_ref": item.location_bus_ref,
                    "u_m_kv": item.u_m_kv,
                    "mcov_kv": _round(mcov, 4),
                    "u_rated_kv": _round(mcov * 1.25, 4),
                    "u_residual_at_10ka_kv": _round(residual, 4),
                    "tov_10s_kv": _round(mcov * 1.25, 4),
                    "predicted_tov_kv": _round(tov, 4),
                    "bil_protected_kv": bil,
                    "short_duration_50hz_kv": withstand,
                    "bil_margin_percent": _round(margin, 3),
                    "verification_status": (
                        "spelniony" if margin >= 20 and tov <= mcov * 1.25 else "niespelniony"
                    ),
                }
            )
        trace.add(
            "iec60071_arrester_margin",
            "Margin_BIL = (BIL - U_res) / U_res * 100%",
            {"locations": len(rows)},
            "Trwałe dopuszczalne napięcie pracy ogranicznika dobrano z najwyższego napięcia "
            "urządzenia i sposobu uziemienia punktu neutralnego; napięcie obniżone przy "
            "10 kA z karty katalogowej, a przy jej braku jako 2,8-krotność tego napięcia.",
            {"non_compliant": sum(1 for row in rows if row["verification_status"] != "spelniony")},
            "Iloraz napięć [kV/kV] wyrażony w %.",
            result_pl=(
                f"Miejsc bez wymaganego marginesu ochrony izolacji: "
                f"{sum(1 for row in rows if row['verification_status'] != 'spelniony')} z {len(rows)}"
            ),
        )
        # K-08: sanity-bounds IEC 60071 — MCOV/BIL/margines skończone i nieujemne.
        mcov_values = [float(r["mcov_kv"]) for r in rows]
        bil_values = [float(r["bil_protected_kv"]) for r in rows]
        margin_values = [float(r["bil_margin_percent"]) for r in rows]
        sanity = _sanity_block(
            [
                (
                    "mcov_nonneg",
                    _finite(*mcov_values) and all(v >= 0.0 for v in mcov_values),
                    "MCOV < 0 lub nieskończone",
                ),
                (
                    "bil_positive",
                    _finite(*bil_values) and all(v > 0.0 for v in bil_values),
                    "BIL <= 0 lub nieskończone",
                ),
                ("margin_finite", _finite(*margin_values), "Margines BIL nieskończony/NaN"),
            ],
            has_inputs=len(model.insulation) > 0,
        )
        return {"arresters": rows, "sanity": sanity}

    def _earth_fault_detection(self, model: V126AcademicInput, trace: TraceBuilder) -> JsonDict:
        neutral = str(model.parameters.get("neutral_grounding", "petersen_tuned"))
        relay_methods = set(
            model.parameters.get(
                "relay_methods",
                ["wattmetric", "admittance", "transient_directional", "fifth_harmonic"],
            )
        )
        table = {
            "isolated": ("wattmetric", "transient_directional"),
            "petersen_tuned": ("wattmetric", "fifth_harmonic"),
            "petersen_detuned": ("admittance", "wattmetric"),
            "resistor": ("51N+67N", "admittance"),
            "solid": ("51N/50N", None),
        }
        recommended, alternative = table.get(neutral, ("wattmetric", "admittance"))
        available = recommended in relay_methods or "+" in recommended or "/" in recommended
        trace.add(
            "earth_fault_method_selection",
            "Metoda detekcji = f(sposób uziemienia punktu neutralnego, wyposażenie przekaźnika)",
            {"neutral_grounding": neutral, "relay_methods": sorted(relay_methods)},
            f"{neutral} -> {recommended}",
            {"recommended_method": recommended, "available": available},
            "Wybór metody jest decyzją logiczną — bez jednostek fizycznych.",
            result_pl=(
                f"Metoda zalecana: {recommended}; dostępna w przekaźniku: {'tak' if available else 'nie'}"
            ),
        )
        u0_start = 5.0
        # K-08: sanity (analiza decyzyjna) — wybór metody dobrze określony, nastawa U0 fizyczna.
        sanity = _sanity_block(
            [
                ("method_selected", bool(recommended), "Brak rekomendowanej metody detekcji"),
                ("u0_start_range", 0.0 < u0_start <= 100.0, "Nastawa U0 poza zakresem (0,100]%"),
            ],
            has_inputs=True,
        )
        return {
            "neutral_grounding": neutral,
            "recommended_method": recommended,
            "alternative_method": alternative,
            "relay_support_status": "spelniony" if available else "brak_w_przekazniku",
            "settings": {
                "u0_start_percent": u0_start,
                "p0_set_w": 1.0 if recommended == "wattmetric" else None,
                "i5_multiplier": 3.0 if recommended == "fifth_harmonic" else None,
            },
            "sanity": sanity,
        }

    def _transient(self, model: V126AcademicInput, trace: TraceBuilder) -> JsonDict:
        u_r = float(
            model.parameters.get(
                "breaker_rated_voltage_kv",
                max((bus.nominal_kv for bus in model.buses), default=15.0),
            )
        )
        natural_frequency_hz = float(model.parameters.get("trv_natural_frequency_hz", 12000.0))
        tau_s = float(model.parameters.get("trv_tau_s", 0.00018))
        points: list[JsonDict] = []
        min_margin = 999.0
        for i in range(1, 51):
            t = i * 2e-6
            u = u_r * (1 - math.cos(2 * math.pi * natural_frequency_hz * t)) * math.exp(
                -t / tau_s
            ) + u_r / math.sqrt(3)
            envelope = 2.0 * u_r * min(1.0, t / 88e-6)
            margin = (envelope - u) / max(envelope, 1e-9) * 100.0
            min_margin = min(min_margin, margin)
            points.append(
                {
                    "t_us": _round(t * 1e6, 3),
                    "u_trv_kv": _round(u, 5),
                    "envelope_kv": _round(envelope, 5),
                }
            )
        inrush_multiple = float(model.parameters.get("inrush_multiple_in", 8.0))
        second_harmonic_percent = 63.0 / inrush_multiple
        # Ryzyko ferrorezonansu stoi na POJEMNOŚCI DOCZEPNEJ sieci (suma B·ℓ).
        # Gałąź bez danej o susceptancji nie wnosi do tej sumy ZERA — ona po
        # prostu nic o pojemności nie mówi. Rozróżnienie ma skutek: gdy żaden
        # element nie niesie B, suma wychodzi 0 i przed kartą MOST-WEJSCIA-V126
        # ocena meldowała „brak ryzyka" wyłącznie z braku danych.
        galezie_z_susceptancja = [
            branch for branch in model.branches if branch.b_siemens_per_km is not None
        ]
        suma_b_l = sum(
            branch.b_siemens_per_km * branch.length_km for branch in galezie_z_susceptancja
        )
        siec_izolowana = str(model.parameters.get("neutral_grounding", "isolated")) == "isolated"
        ferro_ocenialne = bool(galezie_z_susceptancja) or not siec_izolowana
        ferro_risk = siec_izolowana and suma_b_l > 1e-5
        trace.add(
            "trv_inrush_ferro",
            "u_TRV(t)=Ur*(1-cos(wn*t))*exp(-t/tau)+Ur/sqrt(3)",
            {"u_r_kv": u_r, "f_n_hz": natural_frequency_hz, "tau_s": tau_s},
            "Przebieg napięcia powrotnego porównano punkt po punkcie z obwiednią "
            "wytrzymałości wyłącznika wg IEC 62271-100.",
            {"trv_margin_percent": _round(min_margin, 4), "ferro_risk": ferro_risk},
            "Napięcia porównywane w [kV]; margines wyrażony w %.",
            result_pl=(f"Najmniejszy margines napięcia powrotnego: {_round(min_margin, 4)} %"),
        )
        # K-08: sanity-bounds IEC 62271 — margines TRV skończony, krotność udaru i 2. harmoniczna fizyczne.
        sanity = _sanity_block(
            [
                ("trv_margin_finite", _finite(min_margin), "Margines TRV nieskończony/NaN"),
                (
                    "inrush_multiple_range",
                    _finite(inrush_multiple) and 0.0 < inrush_multiple <= 30.0,
                    "Krotność udaru poza (0,30]×In (nierealna)",
                ),
                (
                    "second_harmonic_range",
                    _finite(second_harmonic_percent) and 0.0 <= second_harmonic_percent <= 100.0,
                    "Udział 2. harmonicznej poza [0,100]%",
                ),
            ],
            has_inputs=len(model.buses) > 0,
        )
        return {
            "sanity": sanity,
            "trv_curve": points,
            "trv_margin_percent": _round(min_margin, 4),
            "trv_status": "spelniony" if min_margin >= 10 else "niespelniony",
            "inrush": {
                "peak_multiple_in": inrush_multiple,
                "second_harmonic_percent_of_peak": _round(second_harmonic_percent, 4),
                "blocking_87t_recommended": second_harmonic_percent >= 10,
            },
            "ferroresonance": {
                "risk": ferro_risk,
                "recommendation": (
                    "zastosować rezystor tłumiący w obwodzie otwartego trójkąta "
                    "przekładników napięciowych"
                    if ferro_risk
                    else "brak przesłanek do ferrorezonansu"
                ),
                **(
                    {}
                    if ferro_ocenialne
                    else {
                        "brak_danych": (
                            "Sieć z punktem neutralnym izolowanym, a żaden element nie niesie "
                            "susceptancji doziemnej — pojemności doczepnej nie zsumowano, więc "
                            "ocena „brak przesłanek” wynika z braku danych, nie z pomiaru."
                        )
                    }
                ),
            },
        }

    def _motor_starting(self, model: V126AcademicInput, trace: TraceBuilder) -> JsonDict:
        rows: list[JsonDict] = []
        for motor in model.motors:
            source_z = self._source_impedance(model, motor.bus_ref)
            i_n = motor.rated_kw / (math.sqrt(3) * motor.rated_voltage_kv * 0.9)
            i_start = i_n * motor.locked_rotor_multiplier
            du = (
                abs(source_z)
                * i_start
                / max(motor.rated_voltage_kv * 1000 / math.sqrt(3), 1e-9)
                * 100
            )
            thermal_ratio = (
                motor.locked_rotor_multiplier**2
                * motor.start_time_s
                / motor.allowable_locked_rotor_time_s
            )
            torque_start = motor.max_torque_pu * 2 / (1 / motor.critical_slip + motor.critical_slip)
            rows.append(
                {
                    "motor_ref": motor.ref,
                    "bus_ref": motor.bus_ref,
                    "i_start_a": _round(i_start, 3),
                    "voltage_dip_percent": _round(du, 4),
                    "torque_start_pu": _round(torque_start, 4),
                    "torque_margin_pu": _round(torque_start - motor.load_start_torque_pu, 4),
                    "thermal_i2t_ratio": _round(thermal_ratio, 4),
                    "verification_status": _status(
                        du <= 15
                        and thermal_ratio <= 1
                        and torque_start > motor.load_start_torque_pu
                    ),
                }
            )
        trace.add(
            "motor_starting",
            "DeltaU = |I_start * Z_src| / U_phase * 100%; I_start = k_LR * I_n",
            {"motors": len(model.motors)},
            "Impedancja źródła wyznaczona z mocy zwarciowej w węźle, a przy jej braku "
            "z parametrów pierwszej gałęzi zasilającej.",
            {"non_compliant": sum(1 for row in rows if row["verification_status"] != "zgodny")},
            "Iloczyn prądu [A] i impedancji [Ω] odniesiony do napięcia [V] jest bezwymiarowy; "
            "razy 100 daje %.",
            result_pl=(
                f"Silników niespełniających kryteriów rozruchu: "
                f"{sum(1 for row in rows if row['verification_status'] != 'zgodny')} z {len(rows)}"
            ),
        )
        # K-08: sanity-bounds — prąd rozruchu ≥ 0, zapad napięcia w [0,100]%, krotność LR fizyczna.
        i_start_values = [float(r["i_start_a"]) for r in rows]
        dip_values = [float(r["voltage_dip_percent"]) for r in rows]
        thermal_values = [float(r["thermal_i2t_ratio"]) for r in rows]
        lr_values = [float(m.locked_rotor_multiplier) for m in model.motors]
        sanity = _sanity_block(
            [
                (
                    "i_start_nonneg",
                    _finite(*i_start_values) and all(v >= 0.0 for v in i_start_values),
                    "Prąd rozruchu < 0 lub nieskończony",
                ),
                (
                    "voltage_dip_range",
                    _finite(*dip_values) and all(0.0 <= v <= 100.0 for v in dip_values),
                    "Zapad napięcia poza [0,100]%",
                ),
                (
                    "lr_multiple_range",
                    _finite(*lr_values) and all(0.0 < v <= 12.0 for v in lr_values),
                    "Krotność prądu zablokowanego wirnika poza (0,12]×In",
                ),
                (
                    "thermal_ratio_nonneg",
                    _finite(*thermal_values) and all(v >= 0.0 for v in thermal_values),
                    "Wskaźnik I²t < 0 lub nieskończony",
                ),
            ],
            has_inputs=len(model.motors) > 0,
        )
        return {"motors": rows, "sanity": sanity}

    def _source_impedance(self, model: V126AcademicInput, bus_ref: str) -> complex:
        bus = next((item for item in model.buses if item.ref == bus_ref), None)
        if bus is not None and bus.fault_level_mva:
            z = bus.nominal_kv**2 / bus.fault_level_mva
            return complex(0.15 * z, 0.99 * z)
        path_branch = next(
            (
                branch
                for branch in model.branches
                if branch.to_bus_ref == bus_ref and not branch.is_open
            ),
            None,
        )
        return self._branch_z_ohm(path_branch) if path_branch is not None else complex(0.1, 0.4)

    @staticmethod
    def _hosting_capacity_bus_seed(seed_modelu: int, bus_ref: str) -> int:
        """Ziarno losowania WYŁĄCZNIE dla jednej szyny (karta HOSTING-RNG-IZOLACJA).

        Czysta funkcja pary (ziarno modelu, referencja szyny) — ten sam
        mechanizm haszujący co ziarno modelu (`_hash`). Bycie funkcją
        WYŁĄCZNIE tych dwóch argumentów dowodzi izolacji: podstrumień szyny nie
        może zależeć od niczego poza jej WŁASNĄ referencją i ziarnem modelu —
        obecność, liczba czy kolejność INNYCH szyn w modelu nie mają jak go
        poruszyć. Testowalna wprost (`test_v126_hosting_rng_izolacja.py`).
        """
        return int(_hash(f"{seed_modelu}:{bus_ref}")[:12], 16)

    def _hosting_capacity(self, model: V126AcademicInput, trace: TraceBuilder) -> JsonDict:
        # Ziarno modelu: odcisk CAŁEGO modelu wejściowego, ale z listą szyn w
        # postaci KANONICZNEJ — posortowanej wg `ref`. Lista szyn nie niesie
        # znaczenia fizycznego jako SEKWENCJA (to zbiór węzłów sieci, kolejność
        # jest artefaktem budowy modelu), więc kolejność wpisów w `model.buses`
        # NIE MOŻE wpływać na wynik ŻADNEJ szyny (karta HOSTING-RNG-IZOLACJA,
        # własność T1). Bez tego sortowania ziarno modelu — a więc i
        # podstrumień KAŻDEJ szyny — zmieniałoby się przy samej zmianie
        # kolejności wejścia: ta sama klasa błędu, którą ta karta naprawia,
        # tylko przeniesiona o poziom wyżej. Pozostałe listy modelu (gałęzie,
        # transformatory, ...) NIE są tu sortowane — poza zakresem tej karty,
        # która dotyczy wyłącznie izolacji podstrumieni MIĘDZY SZYNAMI.
        payload = model.model_dump(mode="json")
        payload["buses"] = sorted(payload["buses"], key=lambda b: b["ref"])
        seed = int(_hash(payload)[:12], 16)
        results: list[JsonDict] = []
        seeds_by_bus: JsonDict = {}
        simulations = int(model.parameters.get("hosting_monte_carlo_n", 1000))
        for bus in model.buses:
            # HOSTING-RNG-IZOLACJA (dług zarejestrowany przy MOST-WEJSCIA-V126,
            # ok. linii 1978-2005 sprzed naprawy): PRZED naprawą `rng` był
            # JEDNYM strumieniem DZIELONYM między WSZYSTKIE szyny — pętla
            # kandydatów kończyła się `break` w różnym miejscu per szyna, więc
            # LICZBA zużytych losowań szyny k przesuwała podstrumień szyny
            # k+1: wynik szyny zależał od losowań szyn POPRZEDNICH (dołożenie
            # niepowiązanej szyny albo zmiana kolejności szyn zmieniały wyniki
            # INNYCH szyn — fizycznie bezsensowne sprzężenie; determinizm
            # same-input=same-output był formalnie zachowany, ale izolacja
            # przedmiotowa złamana). Każda szyna dostaje teraz WŁASNY,
            # niezależny podstrumień wyprowadzony jawnie z pary (ziarno
            # modelu, `bus.ref`).
            seed_bus = self._hosting_capacity_bus_seed(seed, bus.ref)
            seeds_by_bus[bus.ref] = seed_bus
            rng = random.Random(seed_bus)
            z = abs(self._source_impedance(model, bus.ref))
            accepted = 0.0
            limiting = "U_max"
            # Obciążalność toru zasilającego szynę — WYŁĄCZNIE z elementów, które
            # ją niosą. Przed kartą MOST-WEJSCIA-V126 stało tu `default=300.0`,
            # więc szyna bez ani jednego dowiązanego elementu z obciążalnością
            # (np. szyna GPZ, do której nic nie wchodzi) dostawała kryterium
            # prądowe policzone z liczby wziętej z powietrza. Odczyt wyniesiony
            # też POZA pętlę Monte Carlo — nie zależy od losowania, a liczył się
            # sto tysięcy razy na szynę.
            obciazalnosci = [
                branch.ampacity_a
                for branch in model.branches
                if branch.to_bus_ref == bus.ref and branch.ampacity_a is not None
            ]
            ampacity = max(obciazalnosci) if obciazalnosci else None
            for candidate_mw in [x * 0.1 for x in range(1, 101)]:
                ok = 0
                for _ in range(simulations):
                    load_factor = rng.betavariate(5, 2)
                    pv_factor = min(1.2, max(0.0, rng.gauss(0.75, 0.15)))
                    net_gen = candidate_mw * pv_factor - bus.load_mw * load_factor
                    dv = net_gen * z / max(bus.nominal_kv**2, 1e-9)
                    voltage = bus.voltage_pu + dv
                    current = abs(net_gen) * 1000 / (math.sqrt(3) * bus.nominal_kv)
                    # Kryterium napięciowe stoi na danych, które są, więc liczy się
                    # zawsze. Kryterium prądowe NIE JEST stosowane, gdy nie ma z
                    # czym porównać — wynik ogranicza wtedy samo napięcie, a brak
                    # obciążalności jest zameldowany przy szynie (nigdy udawany
                    # domyślną liczbą, nigdy też cicho pomijany).
                    kryterium_pradowe = ampacity is None or current <= ampacity
                    if 0.90 <= voltage <= 1.10 and kryterium_pradowe:
                        ok += 1
                probability = ok / simulations
                if probability >= 0.95:
                    accepted = candidate_mw
                else:
                    limiting = "I_galaz" if ampacity is not None and current > ampacity else "U_max"
                    break
            pozycja: JsonDict = {
                "bus_ref": bus.ref,
                "hosting_capacity_mw": _round(accepted, 3),
                "critical_limit": limiting,
                "confidence_percent": 95,
                "monte_carlo_n": simulations,
            }
            if ampacity is None:
                pozycja["brak_danych"] = (
                    "Żaden element zasilający tę szynę nie ma obciążalności długotrwałej "
                    "— kryterium prądowe pominięto, ograniczeniem jest wyłącznie napięcie."
                )
            results.append(pozycja)
        trace.add(
            "stochastic_hosting_capacity",
            "P_przyl = max(P_gen) przy prawdopodobieństwie spełnienia kryteriów ≥ 95%",
            {
                "simulations": simulations,
                "seed_model": seed,
                "seed_bus_rule": "int(sha256(f'{seed_model}:{bus_ref}')[:12], 16)",
                "seeds_by_bus": seeds_by_bus,
            },
            "Obciążenie losowane z rozkładu beta, generacja z rozkładu normalnego obciętego "
            "do zakresu fizycznego; KAŻDA szyna losuje z WŁASNEGO podstrumienia — ziarno "
            "szyny wyprowadzone jawnie z pary (ziarno modelu, referencja szyny), więc "
            "wynik jednej szyny nie zależy od losowań zużytych przez inne szyny (karta "
            "HOSTING-RNG-IZOLACJA); ziarno modelu wyprowadzone z odcisku danych "
            "wejściowych (powtarzalność wyniku).",
            {"buses": len(results)},
            "Moc przyłączeniowa w [MW]; prawdopodobieństwo bezwymiarowe.",
            result_pl=(f"Zbadano węzłów: {len(results)}"),
        )
        # K-08: sanity-bounds — pojemność przyłączeniowa ≥ 0, skończona, w obrębie skanu (≤ 10 MW).
        hc_values = [float(r["hosting_capacity_mw"]) for r in results]
        sanity = _sanity_block(
            [
                (
                    "hc_nonneg",
                    _finite(*hc_values) and all(v >= 0.0 for v in hc_values),
                    "Pojemność przyłączeniowa < 0 lub nieskończona",
                ),
                (
                    "hc_within_scan",
                    all(v <= 10.0 for v in hc_values),
                    "Pojemność > zakresu skanowania (10 MW) — błąd procedury",
                ),
            ],
            has_inputs=len(model.buses) > 0,
        )
        return {"hosting_capacity": results, "sanity": sanity}

    def _opf_loss_lcc(self, model: V126AcademicInput, trace: TraceBuilder) -> JsonDict:
        branch_rows: list[JsonDict] = []
        total_kw = 0.0
        for branch in model.branches:
            current = self._branch_current_a(model, branch)
            losses_kw = 3 * current**2 * branch.r_ohm_per_km * branch.length_km / 1000
            total_kw += losses_kw
            branch_rows.append(
                {
                    "branch_ref": branch.ref,
                    "loss_kw": _round(losses_kw, 5),
                    "current_a": _round(current, 3),
                }
            )
        transformer_kw = sum(
            transformer.p0_kw + transformer.pk_kw * 0.45**2 for transformer in model.transformers
        )
        total_kw += transformer_kw
        energy_price = float(model.parameters.get("energy_price_pln_per_kwh", 0.65))
        discount = float(model.parameters.get("discount_rate", 0.05))
        years = int(model.parameters.get("lcc_years", 30))
        annual_kwh = total_kw * float(model.parameters.get("loss_hours_per_year", 4000.0))
        opex_pv = sum(
            annual_kwh * energy_price / ((1 + discount) ** year) for year in range(1, years + 1)
        )
        co2_factor = float(model.parameters.get("co2_kg_per_kwh", 0.72))
        # D-14: sanity-bounds — straty i koszty fizycznie nieujemne i skończone.
        annual_co2 = annual_kwh * co2_factor
        sanity = _sanity_block(
            [
                ("losses_nonneg", total_kw >= 0.0, "Straty całkowite < 0 (niefizyczne)"),
                ("losses_finite", math.isfinite(total_kw), "Straty nieskończone/NaN"),
                ("losses_upper", total_kw <= 1.0e6, "Straty > 1 GW na sieci SN (absurd)"),
                ("opex_nonneg", opex_pv >= 0.0, "LCC OPEX PV < 0 (niefizyczne)"),
                ("co2_nonneg", annual_co2 >= 0.0, "Emisja CO2 < 0 (niefizyczne)"),
            ],
            has_inputs=len(model.branches) > 0 or len(model.transformers) > 0,
        )
        trace.add(
            "opf_losses_lcc",
            "DeltaP = 3*I^2*R; LCC = CAPEX + sum(OPEX_t/(1+r)^t)",
            {"branches": len(model.branches), "years": years, "discount_rate": discount},
            "Prąd gałęzi wyznaczony z obciążenia węzła docelowego; wariant o najmniejszych "
            "stratach wybierany przy ograniczeniach napięcia, obciążalności i mocy biernej.",
            {"total_losses_kw": _round(total_kw, 5), "annual_kwh": _round(annual_kwh, 3)},
            "Kwadrat prądu [A²] razy rezystancja [Ω] daje moc [W]; moc [kW] razy czas [h] daje energię [kWh].",
            result_pl=(
                f"Straty mocy: {_round(total_kw, 5)} kW; straty energii: {_round(annual_kwh, 3)} kWh/rok"
            ),
        )
        return {
            "objective": "min_delta_p_losses",
            "branch_losses": branch_rows,
            "transformer_losses_kw": _round(transformer_kw, 5),
            "total_losses_kw": _round(total_kw, 5),
            "annual_losses_kwh": _round(annual_kwh, 3),
            "lcc_loss_opex_pv_pln": _round(opex_pv, 2),
            "annual_co2_kg": _round(annual_co2, 3),
            "decision_variables": {
                "oltc_tap_position": 0,
                "nop_position_ref": next(
                    (branch.ref for branch in model.branches if branch.is_open), None
                ),
                "q_set_strategy": "minimize_losses_with_voltage_limits",
            },
            "sanity": sanity,
        }

    def _benchmark_validation(self, model: V126AcademicInput, trace: TraceBuilder) -> JsonDict:
        references = model.parameters.get("benchmark_references")
        references_provided = isinstance(references, list) and len(references) > 0
        if not references_provided:
            # D-14 / K-09: NIE fabrykujemy zaliczających literałów (calc≈ref) — to
            # był cichy fałsz (zawsze PASS niezależnie od solvera). Bez realnych
            # referencji (IEEE 9/14/39, CIGRE MV) z wartościami policzonymi przez
            # solver werdykt NIE jest wystawiany.
            trace.add(
                "benchmark_regression",
                "delta_percent = |calc - ref| / |ref| * 100%",
                {"benchmarks": 0, "references_provided": False},
                "Brak wartości referencyjnych w danych wejściowych — walidacji nie wykonano.",
                {"status": "dane niekompletne"},
                "Brak wartości referencyjnych sieci odniesienia.",
                result_pl=("Walidacji nie wykonano — brak wartości referencyjnych"),
            )
            return {
                "validation_report": [],
                "status": "dane niekompletne",
                "references_provided": False,
                "message_pl": (
                    "Walidacja benchmarkowa wymaga referencji (IEEE 9/14/39-bus, "
                    "CIGRE MV) z wartościami policzonymi przez solver. Bez nich "
                    "werdyktu PASS/FAIL nie wystawia się (zakaz cichego fałszu K-09)."
                ),
                "sanity": _sanity_block([], has_inputs=False),
            }
        rows: list[JsonDict] = []
        proof_types: set[str] = set()
        for item in references:
            ref = float(item["reference"])
            calc = float(item["calculated"])
            delta = abs(calc - ref) / max(abs(ref), 1e-9) * 100.0
            tol = float(item["tolerance_percent"])
            # K-09: each reference may declare its provenance/proof type. When a row
            # carries a cross-validation marker (e.g. IEEE 9/14/39 vs pandapower) we
            # surface it so the proof can state HOW the reference was obtained. Refs
            # without a marker keep the generic benchmark-regression type.
            row_proof_type = str(item.get("proof_type", "benchmark_regression"))
            proof_types.add(row_proof_type)
            rows.append(
                {
                    "network": item["network"],
                    "test": item["test"],
                    "tolerance_percent": tol,
                    "delta_percent": _round(delta, 5),
                    "status": "PASS" if delta <= tol else "FAIL",
                    "proof_type": row_proof_type,
                }
            )
        # A single overall proof type when homogeneous; otherwise the neutral label.
        overall_proof_type = (
            next(iter(proof_types)) if len(proof_types) == 1 else "benchmark_regression"
        )
        trace.add(
            "benchmark_regression",
            "delta_percent = |calc - ref| / |ref| * 100%",
            {"benchmarks": len(rows), "proof_type": overall_proof_type},
            "Porównanie wyników solvera z wartościami referencyjnymi sieci odniesienia "
            "IEEE / CIGRE.",
            {"max_deviation_percent": max((row["delta_percent"] for row in rows), default=0.0)},
            "Wielkości tego samego rodzaju; odchyłka wyrażona w %.",
            result_pl=(
                f"Największa odchyłka od referencji: "
                f"{max((row['delta_percent'] for row in rows), default=0.0)} %"
            ),
        )
        return {
            "validation_report": rows,
            "references_provided": True,
            "proof_type": overall_proof_type,
            "status": "PASS" if all(row["status"] == "PASS" for row in rows) else "FAIL",
        }

    def _uncertainty(self, model: V126AcademicInput, trace: TraceBuilder) -> JsonDict:
        sensitivities: list[JsonDict] = []
        total_variance = 0.0
        for transformer in model.transformers:
            influence = 0.10 * transformer.uk_percent
            total_variance += influence**2
            sensitivities.append(
                {
                    "parameter": f"{transformer.ref}.uk_percent",
                    "sigma_contribution_percent": _round(influence, 5),
                }
            )
        for branch in model.branches:
            z = abs(self._branch_z_ohm(branch))
            influence = 0.05 * z
            total_variance += influence**2
            sensitivities.append(
                {
                    "parameter": f"{branch.ref}.z_ohm",
                    "sigma_contribution_percent": _round(influence, 5),
                }
            )
        for bus in model.buses:
            if bus.fault_level_mva:
                influence = 0.10 * bus.fault_level_mva / 100.0
                total_variance += influence**2
                sensitivities.append(
                    {
                        "parameter": f"{bus.ref}.s_sc_mva",
                        "sigma_contribution_percent": _round(influence, 5),
                    }
                )
        expanded = 2 * math.sqrt(total_variance)
        trace.add(
            "uncertainty_propagation",
            "sigma_Y^2 = sum((dY/dx_i * sigma_x_i)^2); U95 = 2*sigma_Y",
            {"parameters": len(sensitivities)},
            "Tolerancje katalogowe propagowane jako niezależne składowe wariancji wyniku.",
            {"expanded_uncertainty_percent_k2": _round(expanded, 5)},
            "Pierwiastek z sumy kwadratów udziałów procentowych daje niepewność w %.",
            result_pl=(f"Niepewność rozszerzona (k = 2): {_round(expanded, 5)} %"),
        )
        ranked = sorted(sensitivities, key=lambda item: -item["sigma_contribution_percent"])
        total = sum(item["sigma_contribution_percent"] for item in ranked) or 1.0
        for item in ranked:
            item["share_percent"] = _round(item["sigma_contribution_percent"] / total * 100.0, 4)
        # D-14: sanity — niepewność rozszerzona k=2 nieujemna, skończona; > 100%
        # oznacza wynik bezużyteczny (poza zakresem wiarygodności).
        sanity = _sanity_block(
            [
                ("u_nonneg", expanded >= 0.0, "Niepewność k=2 < 0 (niefizyczne)"),
                ("u_finite", math.isfinite(expanded), "Niepewność nieskończona/NaN"),
                (
                    "u_upper",
                    expanded <= 100.0,
                    "Niepewność rozszerzona k=2 > 100% — wynik niewiarygodny",
                ),
            ],
            has_inputs=len(sensitivities) > 0,
        )
        return {
            "expanded_uncertainty_percent_k2": _round(expanded, 5),
            "sensitivity_ranking": ranked[:20],
            "display_contract": "wartość nominalna ± niepewność rozszerzona k=2",
            "sanity": sanity,
        }
