from __future__ import annotations

from enum import StrEnum
from typing import Any

from enm.models import EnergyNetworkModel
from network_model.pochodne import prad_roboczy_a
from pydantic import BaseModel, Field
from solver_input.moc_bierna_wytworcy import moc_bierna_wytworcy


class V126AnalysisType(StrEnum):
    POWER_QUALITY_HARMONICS = "power_quality_harmonics"
    SSCI_IMPEDANCE = "ssci_impedance"
    VOLTAGE_STABILITY = "voltage_stability"
    RELIABILITY_CONTINGENCY = "reliability_contingency"
    EARTHING_SAFETY = "earthing_safety"
    INSULATION_COORDINATION = "insulation_coordination"
    EARTH_FAULT_DETECTION = "earth_fault_detection"
    TRANSIENT_TRV = "transient_trv"
    MOTOR_STARTING = "motor_starting"
    HOSTING_CAPACITY = "hosting_capacity"
    OPF_LOSS_LCC = "opf_loss_lcc"
    BENCHMARK_VALIDATION = "benchmark_validation"
    UNCERTAINTY_SENSITIVITY = "uncertainty_sensitivity"
    NEUTRAL_EARTHING_DESIGN = "neutral_earthing_design"


class V126BusInput(BaseModel):
    ref: str
    name: str
    nominal_kv: float = Field(gt=0)
    voltage_pu: float = Field(default=1.0, gt=0)
    load_mw: float = 0.0
    load_mvar: float = 0.0
    generation_mw: float = 0.0
    generation_mvar: float = 0.0
    customer_count: int = Field(default=0, ge=0)
    fault_level_mva: float | None = Field(default=None, gt=0)


class V126BranchInput(BaseModel):
    ref: str
    from_bus_ref: str
    to_bus_ref: str
    kind: str
    length_km: float = Field(default=1.0, gt=0)
    r_ohm_per_km: float = Field(default=0.18, ge=0)
    x_ohm_per_km: float = Field(default=0.12, ge=0)
    # Susceptancja doziemna składowej zgodnej [S/km]. `None` = model/katalog nie
    # niesie pojemności doczepnej tej gałęzi — to NIE JEST zero (karta
    # MOST-WEJSCIA-V126). Rozróżnienie ma skutek: decyzja o ryzyku
    # ferrorezonansu stoi na sumie B·ℓ sieci, a suma z podstawionym zerem
    # meldowała „brak ryzyka" tam, gdzie danych po prostu nie było.
    b_siemens_per_km: float | None = Field(default=None, ge=0)
    # Zero-sequence (line-to-earth) shunt susceptance B0 = ω·C0 [S/km]. Source of the
    # network line-to-earth capacitance for the neutral-earthing design (Petersen/NER).
    # None when the catalog/model has no zero-sequence shunt for this branch — surfaced
    # as "dane niekompletne" (no fabrication of C0).
    b0_siemens_per_km: float | None = Field(default=None)
    # Obciążalność długotrwała [A]. `None` = element NIE MA obciążalności w
    # modelu ani w katalogu (karta MOST-WEJSCIA-V126). Do tej karty pole miało
    # wartość domyślną 300 A, a most dokładał 630 A dla KAŻDEGO aparatu
    # łączeniowego — obie liczby wchodziły wprost do ilorazu I/I_dop, czyli do
    # stopnia obciążenia, dotkliwości N-1 i zdolności przyłączeniowej. Warstwa,
    # która obciążalności potrzebuje, melduje teraz brak po polsku.
    ampacity_a: float | None = Field(default=None, gt=0)
    failure_rate_per_year: float = Field(default=0.015, ge=0)
    mttr_h: float = Field(default=12.0, ge=0)
    is_open: bool = False


class V126TransformerInput(BaseModel):
    ref: str
    hv_bus_ref: str
    lv_bus_ref: str
    sn_mva: float = Field(gt=0)
    uhv_kv: float = Field(gt=0)
    ulv_kv: float = Field(gt=0)
    uk_percent: float = Field(gt=0)
    pk_kw: float = Field(default=0.0, ge=0)
    # `None` = strata jałowa NIEZNANA (karta FAB-D2, D2) — ENM `Transformer.p0_kw`
    # jest `float | None` (brak w katalogu jest legalny, IEC 60909 tego pola nie
    # wymaga). Podstawienie 0.0 za brak fałszowałoby wynik OPF/LCC (`_opf_loss_lcc`
    # w `network_model/solvers/v126_academic.py`) — zero strat jałowych to WYNIK,
    # nie nieznana dana. Ten solver nie ma dziś własnej ścieżki "brak = niedostępne"
    # (w odróżnieniu od `equipment_checks/transformer_losses.py`, który reużywa
    # `transformer.loss_data_missing`), więc konsument (endpoint API `run_v126_analysis`)
    # odmawia uruchomienia analizy OPF_LOSS_LCC tym samym kodem, zamiast liczyć na
    # milczącym zerze — solver pozostaje nietknięty (B-01, `network_model/solvers/**`).
    p0_kw: float | None = Field(default=None, ge=0)
    vector_group: str | None = None


class V126HarmonicSourceInput(BaseModel):
    bus_ref: str
    source_ref: str
    base_current_a: float = Field(gt=0)
    spectrum_percent: dict[int, float] = Field(default_factory=dict)


class V126ConverterInput(BaseModel):
    ref: str
    bus_ref: str
    mode: str = "GFL"
    rated_mva: float = Field(default=1.0, gt=0)
    virtual_inertia_h_s: float | None = Field(default=None, ge=0)
    damping_d_pu: float | None = Field(default=None, ge=0)
    droop_p_f_percent: float | None = Field(default=None, ge=0)
    droop_q_u_percent: float | None = Field(default=None, ge=0)
    black_start_capable: bool = False
    # SSCI / Z_conv(f) small-signal output-impedance card fields (D-03). Flow
    # from the converter's ConverterType catalog card via build_v126_input_from_enm.
    # All optional: a missing mandatory field surfaces as missing-data in the SSCI
    # solver (no fabrication / no fallback).
    rated_kv: float | None = Field(default=None, gt=0)
    current_loop_bandwidth_hz: float | None = Field(default=None, gt=0)
    voltage_loop_bandwidth_hz: float | None = Field(default=None, gt=0)
    pll_bandwidth_hz: float | None = Field(default=None, gt=0)
    control_delay_ms: float | None = Field(default=None, ge=0)
    filter_l_pu: float | None = Field(default=None, gt=0)
    filter_r_pu: float | None = Field(default=None, ge=0)
    # Operating point (P,Q) at the converter terminal for the SSCI coupling term.
    p_mw: float | None = None
    q_mvar: float | None = None


class V126MotorInput(BaseModel):
    ref: str
    bus_ref: str
    rated_kw: float = Field(gt=0)
    rated_voltage_kv: float = Field(gt=0)
    locked_rotor_multiplier: float = Field(default=6.0, gt=0)
    start_power_factor: float = Field(default=0.22, gt=0, le=1)
    start_time_s: float = Field(default=8.0, gt=0)
    allowable_locked_rotor_time_s: float = Field(default=20.0, gt=0)
    max_torque_pu: float = Field(default=2.0, gt=0)
    critical_slip: float = Field(default=0.2, gt=0, lt=1)
    load_start_torque_pu: float = Field(default=0.6, ge=0)


class V126EarthingInput(BaseModel):
    gpz_ref: str = "GPZ"
    rho1_ohm_m: float = Field(default=100.0, gt=0)
    rho2_ohm_m: float = Field(default=500.0, gt=0)
    h1_m: float = Field(default=0.5, gt=0)
    length_m: float = Field(default=60.0, gt=0)
    width_m: float = Field(default=40.0, gt=0)
    mesh_spacing_m: float = Field(default=6.0, gt=0)
    buried_depth_m: float = Field(default=0.6, gt=0)
    rods_total_length_m: float = Field(default=40.0, ge=0)
    split_factor: float = Field(default=0.65, gt=0, le=1)
    fault_current_ka: float = Field(default=10.0, gt=0)
    fault_clearing_time_s: float = Field(default=0.5, gt=0)
    surface_layer_rho_ohm_m: float = Field(default=2500.0, gt=0)
    surface_layer_derating: float = Field(default=0.74, gt=0)


class V126InsulationInput(BaseModel):
    location_bus_ref: str
    u_m_kv: float = Field(gt=0)
    network_neutral: str = "isolated"
    arrester_mcov_kv: float | None = Field(default=None, gt=0)
    arrester_residual_10ka_kv: float | None = Field(default=None, gt=0)
    predicted_tov_kv: float | None = Field(default=None, gt=0)
    predicted_energy_kj_per_kv: float = Field(default=2.0, ge=0)


class V126AcademicInput(BaseModel):
    base_frequency_hz: float = Field(default=50.0, gt=0)
    buses: list[V126BusInput]
    branches: list[V126BranchInput] = Field(default_factory=list)
    transformers: list[V126TransformerInput] = Field(default_factory=list)
    harmonic_sources: list[V126HarmonicSourceInput] = Field(default_factory=list)
    converters: list[V126ConverterInput] = Field(default_factory=list)
    motors: list[V126MotorInput] = Field(default_factory=list)
    earthing: V126EarthingInput | None = None
    insulation: list[V126InsulationInput] = Field(default_factory=list)
    parameters: dict[str, Any] = Field(default_factory=dict)


class V126RunRequest(BaseModel):
    parameters: dict[str, Any] = Field(default_factory=dict)


_STANDARD_UM_KV: tuple[float, ...] = (12.0, 17.5, 24.0, 36.0)


def _nearest_standard_um_kv(nominal_kv: float) -> float:
    """Najbliższe znormalizowane napięcie najwyższe urządzenia U_m ≥ napięcie znamionowe szyny.

    IEC 60071-1 typoszereg SN. Nie fabrykuje danych ogranicznika — jedynie
    przypisuje poziom izolacji do poziomu napięcia szyny (mapowanie normowe).
    """
    for u_m in _STANDARD_UM_KV:
        if nominal_kv <= u_m:
            return u_m
    return _STANDARD_UM_KV[-1]


def _grounding_type_to_network_neutral(grounding_type: str | None) -> str | None:
    """Mapowanie typu uziemienia punktu neutralnego SN na kategorię TOV solvera.

    IEC 60071: sieć izolowana/skompensowana (Petersen) — ogranicznik widzi
    napięcie ~międzyfazowe przy doziemieniu → "isolated"; sieć skutecznie
    uziemiona (rezystor/bezpośrednio) → "earthed". None gdy brak danych
    (bez fabrykacji — solver użyje własnej udokumentowanej wartości domyślnej).
    """
    if grounding_type in ("isolated", "petersen_coil"):
        return "isolated"
    if grounding_type in ("resistor_grounded", "directly_grounded"):
        return "earthed"
    return None


def build_v126_insulation_from_enm(enm: EnergyNetworkModel) -> list[V126InsulationInput]:
    """Most model → koordynacja izolacji IEC 60071 (G-STK-7).

    Dla każdego ogranicznika przepięć w modelu (aparat pierwotny pola
    ``kind == "SURGE_ARRESTER"``) buduje wejście ``V126InsulationInput``,
    aby analiza ``insulation_coordination`` (_insulation) liczyła margines BIL
    z DANYCH MODELU, nie z ręcznych parametrów. Zero fabrykacji:

    - parametry ogranicznika (MCOV/U_res/TOV/energia) z rekordu katalogu
      ``mv_surge_arrester_catalog`` po ``catalog_ref`` — gdy brak karty,
      pola pozostają ``None`` (solver wykonuje dobór wstępny, udokumentowany);
    - U_m z karty katalogowej albo z poziomu napięcia szyny (typoszereg IEC);
    - ``network_neutral`` z uziemienia punktu neutralnego (szyna lub
      transformator) — gdy brak danych, kontraktowa wartość domyślna.

    Deduplikacja per (szyna, ``catalog_ref``) — ograniczniki fazowe w jednym
    miejscu dają jedno wejście koordynacji. Kolejność deterministyczna
    (kolejność pól w modelu).
    """
    from network_model.catalog.mv_surge_arrester_catalog import get_all_surge_arrester_types

    catalog: dict[str, dict[str, Any]] = {
        str(record["id"]): record["params"] for record in get_all_surge_arrester_types()
    }
    bus_by_ref = {bus.ref_id: bus for bus in enm.buses}

    def _resolve_network_neutral(bus_ref: str) -> str | None:
        bus = bus_by_ref.get(bus_ref)
        if bus is not None and bus.grounding is not None:
            mapped = _grounding_type_to_network_neutral(bus.grounding.type)
            if mapped is not None:
                return mapped
        for transformer in enm.transformers:
            if transformer.lv_bus_ref == bus_ref and transformer.lv_neutral is not None:
                mapped = _grounding_type_to_network_neutral(transformer.lv_neutral.type)
                if mapped is not None:
                    return mapped
            if transformer.hv_bus_ref == bus_ref and transformer.hv_neutral is not None:
                mapped = _grounding_type_to_network_neutral(transformer.hv_neutral.type)
                if mapped is not None:
                    return mapped
        return None

    rows: list[V126InsulationInput] = []
    seen: set[tuple[str, str | None]] = set()

    def _emit(bus_ref: str, catalog_ref: str | None) -> None:
        bus = bus_by_ref.get(bus_ref)
        if bus is None:
            return
        dedup_key = (bus_ref, catalog_ref)
        if dedup_key in seen:
            return
        params = catalog.get(catalog_ref) if catalog_ref else None
        if params is None and bus.voltage_kv < 1.0:
            # Ogranicznik nN bez karty katalogowej — poza zakresem koordynacji
            # izolacji SN (IEC 60071 SN). Pomiń, aby nie fabrykować U_m SN.
            return
        seen.add(dedup_key)
        neutral = _resolve_network_neutral(bus_ref)
        if params is not None:
            rows.append(
                V126InsulationInput(
                    location_bus_ref=bus_ref,
                    u_m_kv=float(params["u_m_kv"]),
                    network_neutral=neutral or "isolated",
                    arrester_mcov_kv=float(params["mcov_kv"]),
                    arrester_residual_10ka_kv=float(params["u_residual_at_10ka_kv"]),
                    predicted_tov_kv=float(params["tov_10s_kv"]),
                    predicted_energy_kj_per_kv=float(params["energy_absorption_kj_per_kv"]),
                )
            )
        else:
            rows.append(
                V126InsulationInput(
                    location_bus_ref=bus_ref,
                    u_m_kv=_nearest_standard_um_kv(bus.voltage_kv),
                    network_neutral=neutral or "isolated",
                )
            )

    # Kanał 1: aparaty pierwotne na Bay (bezpośrednia serializacja / read-model).
    for bay in enm.bays:
        for device in bay.primary_devices:
            if device.kind == "SURGE_ARRESTER":
                _emit(bay.bus_ref, device.catalog_ref)

    # Kanał 2: field_specs stacji (kanoniczna ścieżka operacji add_surge_arrester_sn,
    # G-STK-8). Ograniczniki żyją na field_spec — ten sam kanał czyta read-model pola
    # (glif SLD). Parytet: most widzi ograniczniki z obu kanałów, deduplikacja wspólna.
    for substation in enm.substations:
        field_specs = substation.meta.get("field_specs")
        if not isinstance(field_specs, list):
            continue
        for spec in field_specs:
            if not isinstance(spec, dict):
                continue
            spec_bus_ref = spec.get("bus_ref")
            arresters = spec.get("surge_arresters")
            if not isinstance(spec_bus_ref, str) or not isinstance(arresters, list):
                continue
            for item in arresters:
                if isinstance(item, dict):
                    ref = item.get("catalog_ref")
                    _emit(spec_bus_ref, ref if isinstance(ref, str) else None)

    return rows


#: Aparat łączeniowy jest elementem SKUPIONYM: jego impedancja styku to omy, a nie
#: omy na kilometr. Kontrakt V12.6 niesie parę (Ω/km, km) i WSZĘDZIE używa jej
#: ILOCZYNU (`_branch_z_ohm`, stempel Y, straty), więc aparat wchodzi z długością
#: JEDNOSTKOWĄ, a impedancja skupiona trafia wprost do pola per-km — iloczyn równa
#: się wtedy dokładnie impedancji skupionej.
#:
#: PRZED TĄ KARTĄ most dawał aparatowi długość 0,001 km i wstawiał tę samą omową
#: wartość do pola per-km, czyli DZIELIŁ realną rezystancję styku przez 1000. Błąd
#: był niewidoczny wyłącznie dlatego, że drugi defekt (`r_ohm or 0.001`) i tak
#: kasował każdą realną daną, w tym jawne 0,0.
_DLUGOSC_JEDNOSTKOWA_APARATU_KM = 1.0


def _liczba_lub_none(wartosc: Any) -> float | None:
    """Wartość liczbowa albo `None` — bez podstawiania czegokolwiek w miejsce braku."""
    if isinstance(wartosc, bool) or not isinstance(wartosc, int | float):
        return None
    return float(wartosc)


def _obciazalnosc_dlugotrwala_a(branch: Any) -> float | None:
    """Obciążalność długotrwała gałęzi [A] — WYŁĄCZNIE z modelu albo z katalogu.

    Jedno źródło prawdy dla WSZYSTKICH rodzajów gałęzi (kabel, linia napowietrzna,
    aparat łączeniowy), w kolejności:

    1. jawna obciążalność gałęzi w modelu (``rating.in_a``);
    2. materializacja katalogowa gałęzi — ``rated_current_a`` (kontrakt KABEL_SN /
       LINIA_SN) albo ``i_n_a`` (kontrakt APARAT_SN, ``solver_fields=("u_n_kv",
       "i_n_a")``). Ta sama precedencja, co w ``enm.domain_operations_v2.
       _resolve_apparatus_rated_current_a`` — reużycie zamiast drugiej reguły,
       która rozjedzie się przy pierwszej zmianie katalogu.

    Zwraca ``None``, gdy żadne z tych źródeł nie istnieje: element NIE MA
    obciążalności, a warstwa, która jej potrzebuje, melduje to wprost. Wartość
    niedodatnia jest traktowana jak brak — kontrakt wymaga ``gt=0``, a „0 A"
    obciążalnością nie jest.
    """
    rating = getattr(branch, "rating", None)
    jawna = _liczba_lub_none(getattr(rating, "in_a", None))
    if jawna is not None and jawna > 0:
        return jawna
    materializacja = getattr(branch, "materialized_params", None)
    if isinstance(materializacja, dict):
        for klucz in ("rated_current_a", "i_n_a"):
            z_katalogu = _liczba_lub_none(materializacja.get(klucz))
            if z_katalogu is not None and z_katalogu > 0:
                return z_katalogu
    return None


def _impedancja_skupiona_aparatu_ohm(branch: Any) -> tuple[float, float]:
    """Impedancja styku aparatu (R, X) [Ω] — z modelu, z JAWNYM zerem włącznie.

    PREDYKATY PARAMI (reguła KLASA §3). Wejście i wyjście warunku pochodzą z
    jednego źródła prawdy: rozstrzyga WYŁĄCZNIE ``is None`` (dana nieobecna),
    nigdy prawdziwościowość liczby. Przed tą kartą most liczył
    ``getattr(branch, "r_ohm", None) or 0.001``, więc jawnie zadeklarowane
    ``r_ohm = 0.0`` — wartość, którą operacje domenowe nadają KAŻDEMU tworzonemu
    aparatowi (``domain_operations``: „r_ohm": 0.0, „x_ohm": 0.0) — było
    podmieniane na 0,001. Operator ``or`` nie odróżnia braku danej od zera, a
    rezystancja styku aparatu łączeniowego jest fizycznie bliska zeru, więc
    podmieniana była DANA, nie brak.

    Brak danej daje impedancję zerową, i to NIE JEST podstawienie liczby: aparat
    łączeniowy jest w kanonie modelu urządzeniem BEZ impedancji (tabela pojęć w
    ``CLAUDE.md``; drugi most, ``enm.mapping``, mapuje ``SwitchBranch`` na
    ``Switch`` — obiekt, który impedancji nie ma w ogóle). Pola ``r_ohm``/``x_ohm``
    są opcjonalnym UŚCIŚLENIEM tego kanonu. Zero jest więc znaczeniem modelu, a nie
    liczbą z powietrza — w odróżnieniu od zmyślonych 0,001 Ω.

    Konsument zerowej impedancji jest po stronie solvera: gałąź zwarta o
    impedancji zerowej to POŁĄCZENIE IDEALNE i tak ją stempluje
    ``V126AcademicSolver._ybus`` (redukcja węzłów), zamiast — jak przed tą kartą
    — cicho ją pomijać i rozspajać sieć.
    """
    r_ohm = _liczba_lub_none(getattr(branch, "r_ohm", None))
    x_ohm = _liczba_lub_none(getattr(branch, "x_ohm", None))
    return (r_ohm if r_ohm is not None else 0.0, x_ohm if x_ohm is not None else 0.0)


def build_v126_input_from_enm(
    enm: EnergyNetworkModel,
    *,
    parameters: dict[str, Any] | None = None,
) -> V126AcademicInput:
    load_by_bus: dict[str, tuple[float, float]] = {}
    for load in enm.loads:
        p, q = load_by_bus.get(load.bus_ref, (0.0, 0.0))
        load_by_bus[load.bus_ref] = (p + load.p_mw, q + load.q_mvar)

    # Napiecie znamionowe szyny przylaczenia — DANA MODELU. Do tej karty prad
    # bazowy zrodla harmonicznego liczyl sie z ZASZYTYCH 15 kV, wiec kazde zrodlo
    # spoza tego poziomu (nN 0,4 kV, SN 20 kV, 30 kV) dostawalo prad bazowy
    # zafalszowany proporcja napiec — a ten prad wchodzi wprost do wstrzykniecia
    # harmonicznych, czyli do THD, TDD i oceny zgodnosci.
    napiecie_szyny_kv = {bus.ref_id: bus.voltage_kv for bus in enm.buses}

    gen_by_bus: dict[str, tuple[float, float]] = {}
    converters: list[V126ConverterInput] = []
    harmonic_sources: list[V126HarmonicSourceInput] = []
    for generator in enm.generators:
        # Karta FAB-H (H2, KLASA NIE INSTANCJA): Q rozstrzygane przez JEDNO wspólne
        # źródło prawdy (moc_bierna_wytworcy), tak samo jak enm/mapping.py i
        # enm/canonical_analysis.py oraz bramka gotowości
        # (calculation_readiness/service.py::_generator_q_mvar_jawne). BRAK => 0,0
        # jako strukturalne wypełnienie agregatu szyny (`gen_by_bus` jest float
        # nie-Optional); analizy V12.6, które faktycznie CZYTAJĄ tę Q
        # (RELIABILITY_CONTINGENCY, OPF_LOSS_LCC — via `_branch_current_a`) są
        # zablokowane PRZED uruchomieniem solvera przez `api/v126_academic.py`
        # (kod gotowości `generator.q_missing`), gdy Q jest naprawdę nieznane.
        wynik_q = moc_bierna_wytworcy(generator, generator.materialized_params)
        p, q = gen_by_bus.get(generator.bus_ref, (0.0, 0.0))
        # Q nieznane = wklad POMINIETY w agregacie szyny (nie 0,0); analizy czytajace
        # Q sa zablokowane przed solverem (`generator.q_missing`), pozostale Q nie czytaja.
        gen_by_bus[generator.bus_ref] = (
            p + generator.p_mw,
            q + wynik_q.q_mvar if wynik_q.q_mvar is not None else q,
        )
        if generator.gen_type in {"pv_inverter", "bess", "fw_pmsg", "fw_dfig", "fw_scig"}:
            rated = max(abs(generator.p_mw), 0.1)
            mode = "GFL" if generator.gen_type != "bess" else "GFM_droop"
            # SSCI / Z_conv(f) card fields flow from the converter's ConverterType
            # catalog card (materialized into the generator's solver params). No
            # fabrication: a field absent from the card stays None and the SSCI
            # solver surfaces it as missing-data.
            card = generator.materialized_params or {}

            def _card_float(key: str, _card: dict[str, Any] = card) -> float | None:
                value = _card.get(key)
                return float(value) if value is not None else None

            rated_kv = _card_float("un_kv")
            converters.append(
                V126ConverterInput(
                    ref=generator.ref_id,
                    bus_ref=generator.bus_ref,
                    mode=mode,
                    rated_mva=rated,
                    droop_p_f_percent=4.0 if mode != "GFL" else None,
                    droop_q_u_percent=3.0 if mode != "GFL" else None,
                    rated_kv=rated_kv,
                    current_loop_bandwidth_hz=_card_float("current_loop_bandwidth_hz"),
                    voltage_loop_bandwidth_hz=_card_float("voltage_loop_bandwidth_hz"),
                    pll_bandwidth_hz=_card_float("pll_bandwidth_hz"),
                    control_delay_ms=_card_float("control_delay_ms"),
                    filter_l_pu=_card_float("filter_l_pu"),
                    filter_r_pu=_card_float("filter_r_pu"),
                    p_mw=generator.p_mw,
                    # Q przeksztaltnika z TEGO SAMEGO zrodla prawdy co agregat szyny
                    # (jawne Q albo Q-set-point karty); None = nieznane (brama SSCI w API).
                    q_mvar=wynik_q.q_mvar,
                )
            )
            # Prad bazowy z napiecia SZYNY PRZYLACZENIA (dana modelu), nie z
            # zaszytych 15 kV. Gdy szyna generatora nie istnieje w modelu, zrodla
            # harmonicznego NIE MA — brak wezla to brak miejsca wstrzykniecia,
            # a nie powod do przyjecia napiecia z powietrza.
            un_kv = napiecie_szyny_kv.get(generator.bus_ref)
            if un_kv is not None and un_kv > 0:
                harmonic_sources.append(
                    V126HarmonicSourceInput(
                        bus_ref=generator.bus_ref,
                        source_ref=generator.ref_id,
                        base_current_a=prad_roboczy_a(rated, un_kv),
                        spectrum_percent={5: 3.0, 7: 2.0, 11: 1.2, 13: 1.0},
                    )
                )

    buses = [
        V126BusInput(
            ref=bus.ref_id,
            name=bus.name,
            nominal_kv=bus.voltage_kv,
            load_mw=load_by_bus.get(bus.ref_id, (0.0, 0.0))[0],
            load_mvar=load_by_bus.get(bus.ref_id, (0.0, 0.0))[1],
            generation_mw=gen_by_bus.get(bus.ref_id, (0.0, 0.0))[0],
            generation_mvar=gen_by_bus.get(bus.ref_id, (0.0, 0.0))[1],
            fault_level_mva=next(
                (source.sk3_mva for source in enm.sources if source.bus_ref == bus.ref_id), None
            ),
        )
        for bus in enm.buses
    ]

    branches: list[V126BranchInput] = []
    for branch in enm.branches:
        if getattr(branch, "status", "closed") == "open":
            is_open = True
        else:
            is_open = False
        if branch.type in {"line_overhead", "cable"}:
            # `length_km`, `r_ohm_per_km`, `x_ohm_per_km` sa polami WYMAGANYMI
            # modeli `OverheadLine`/`Cable`, wiec czytamy je wprost. Do tej karty
            # staly tu `getattr(..., 1.0 / 0.18 / 0.12)`; te wartosci zapasowe byly
            # NIEOSIAGALNE (pydantic nie dopusci obiektu bez pola wymaganego), a
            # mimo to czytalo sie je jak zadeklarowane zalozenie projektowe.
            # Martwa wartosc zapasowa jest grozniejsza niz brak: wyglada na
            # zabezpieczenie, wiec wylacza czujnosc.
            length_km = float(branch.length_km)
            b0_per_km = getattr(branch, "b0_siemens_per_km", None)
            b_per_km = getattr(branch, "b_siemens_per_km", None)
            branches.append(
                V126BranchInput(
                    ref=branch.ref_id,
                    from_bus_ref=branch.from_bus_ref,
                    to_bus_ref=branch.to_bus_ref,
                    kind=branch.type,
                    length_km=length_km,
                    r_ohm_per_km=float(branch.r_ohm_per_km),
                    x_ohm_per_km=float(branch.x_ohm_per_km),
                    b_siemens_per_km=(float(b_per_km) if b_per_km is not None else None),
                    b0_siemens_per_km=(float(b0_per_km) if b0_per_km is not None else None),
                    ampacity_a=_obciazalnosc_dlugotrwala_a(branch),
                    failure_rate_per_year=(0.08 if branch.type == "line_overhead" else 0.015)
                    * length_km,
                    mttr_h=3.5 if branch.type == "line_overhead" else 12.0,
                    is_open=is_open,
                )
            )
        elif branch.type in {"switch", "breaker", "bus_coupler", "disconnector"}:
            r_ohm, x_ohm = _impedancja_skupiona_aparatu_ohm(branch)
            branches.append(
                V126BranchInput(
                    ref=branch.ref_id,
                    from_bus_ref=branch.from_bus_ref,
                    to_bus_ref=branch.to_bus_ref,
                    kind=branch.type,
                    # Dlugosc jednostkowa: iloczyn (Ω/km · km) rowna sie impedancji
                    # SKUPIONEJ aparatu, bez przelicznika i bez gubienia rzedu.
                    length_km=_DLUGOSC_JEDNOSTKOWA_APARATU_KM,
                    r_ohm_per_km=r_ohm / _DLUGOSC_JEDNOSTKOWA_APARATU_KM,
                    x_ohm_per_km=x_ohm / _DLUGOSC_JEDNOSTKOWA_APARATU_KM,
                    ampacity_a=_obciazalnosc_dlugotrwala_a(branch),
                    failure_rate_per_year=0.015,
                    mttr_h=4.0,
                    is_open=is_open,
                )
            )

    transformers = [
        V126TransformerInput(
            ref=transformer.ref_id,
            hv_bus_ref=transformer.hv_bus_ref,
            lv_bus_ref=transformer.lv_bus_ref,
            sn_mva=transformer.sn_mva,
            uhv_kv=transformer.uhv_kv,
            ulv_kv=transformer.ulv_kv,
            uk_percent=transformer.uk_percent,
            pk_kw=transformer.pk_kw,
            # Karta FAB-D2 (D2): brak strat jałowych w ENM zostaje `None`, nie 0.0
            # (zero strat jest wynikiem, nie nieznaną daną) — patrz komentarz przy
            # definicji pola `V126TransformerInput.p0_kw` powyżej.
            p0_kw=transformer.p0_kw,
            vector_group=transformer.vector_group,
        )
        for transformer in enm.transformers
    ]

    return V126AcademicInput(
        base_frequency_hz=enm.buses[0].frequency_hz or 50.0 if enm.buses else 50.0,
        buses=buses,
        branches=branches,
        transformers=transformers,
        harmonic_sources=harmonic_sources,
        converters=converters,
        insulation=build_v126_insulation_from_enm(enm),
        parameters=parameters or {},
    )
