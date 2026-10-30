from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from enum import StrEnum
from typing import Any, Literal

from enm.bateria_kondensatorow import parametry_baterii
from enm.mapping import (
    impedancja_zrodla_sieciowego,
    map_enm_to_network_graph,
    ref_to_graph_id,
)
from enm.models import (
    GEN_TYPES_PRZEKSZTALTNIKOWE,
    Cable,
    EnergyNetworkModel,
    OverheadLine,
)
from enm.nazwy_elementow import nazwa_elementu, zbuduj_indeks_nazw
from enm.skladowa_zerowa_galezi import napiecia_szyn_kv, skladowa_zerowa_galezi
from enm.slownik_komunikatow import opis_bledu_walidacji
from enm.tolerancja_nn import WyspaNn, wyspy_wezlow_nn
from enm.uziemienie_sekcji import (
    UziemienieSekcji,
    b0_baterii_s,
    baterie_sieci_sn,
    galezie_sieci_sn,
    uziemienie_sieci,
    uziemienie_szyny,
)
from network_model.catalog.wartosci_robocze import (
    PARAMETR_BATERII_UKLAD,
    PROPOZYCJE_NIEZAWODNOSCI,
    element_niezawodnosci,
)
from network_model.core.uziemienie import (
    TRYB_DOZIEMIENIA_TYPU,
    StanAwsc,
    TrybDoziemienia,
)
from network_model.core.voltage_factor import dobierz_c
from network_model.odmowa_danych import (
    OdmowaDanychError,
    OdmowaNazwana,
    odmowa_rdzenia_b01,
)
from network_model.odmowa_pakietu import RekordBrakuPakietu, brak_karty_producenta
from network_model.pochodne import kva_na_mva, prad_roboczy_a
from network_model.pochodne.pasma_napieciowe import (
    napiecie_najwyzsze_sieci_kv,
    pasmo_napieciowe,
)
from network_model.solvers.doziemienie_sn import (
    ETYKIETA_PL_TRYBU,
    PunktNeutralnyDoziemienia,
)
from network_model.solvers.short_circuit_core import build_zbus
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    SerializerFunctionWrapHandler,
    ValidationError,
    model_serializer,
)
from solver_input.moc_bierna_wytworcy import moc_bierna_wytworcy
from werdykt.kontrakt import DanaPrzyjeta, Wielkosc
from werdykt.proweniencja import FieldQuality


class _WejscieV126(BaseModel):
    """Podstawa kontraktu wejścia solvera V12.6: pole spoza kontraktu jest błędem walidacji,
    nie cichym pominięciem (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA: pole ``prad_dlawikow_a``
    wejścia sieci SN fixtury strażnika prezentacji było latami pomijane — projekt uziemienia
    liczył się bez punktów uziemienia, a nikt tego nie widział)."""

    model_config = ConfigDict(extra="forbid")


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


class V126BusInput(_WejscieV126):
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
    #: Impedancja zgodna zasilania systemowego Z_Q = R_Q + jX_Q [Ω] przyłączonego do szyny —
    #: z JEDYNEGO źródła prawdy (`enm.mapping.impedancja_zrodla_sieciowego`, IEC 60909-0
    #: §6.2.1 eq. 6: c·U_nQ²/S''_kQ, R/X z modelu). `None` = szyna bez źródła sieciowego
    #: albo wejście zbudowane poza mostem ENM (solver przyjmuje wtedy podział mocy zwarciowej
    #: ``fault_level_mva`` jako daną przyjętą). Pola addytywne — poza odciskiem, gdy `None`.
    source_r_ohm: float | None = Field(default=None, ge=0)
    source_x_ohm: float | None = Field(default=None, gt=0)
    #: Impedancja zastępcza sieci (Thévenin) w szynie Z_th = R_th + jX_th [Ω] przy 50 Hz,
    #: odniesiona do napięcia znamionowego szyny — przekątna macierzy Z-bus sieci zwarciowej
    #: IEC 60909 składowej zgodnej z KANONICZNEGO budowniczego admitancji
    #: (`short_circuit_core.build_zbus` → `AdmittanceMatrixBuilder`: przekładnia
    #: transformatorów, K_T §6.3.3, Z_Q eq. 6, maszyny Z″), liczona w moście
    #: (`impedancje_zastepcze_szyn`) wyłącznie dla analiz, które ją czytają
    #: (`ANALIZY_IMPEDANCJI_ZASTEPCZEJ`: przepustowość i rozruch silnika). `None` = szyna
    #: w wyspie bez impedancji do odniesienia (brak źródła sieciowego i maszyny) albo
    #: analiza, która jej nie czyta. Pola addytywne — poza odciskiem, gdy `None`.
    thevenin_r_ohm: float | None = Field(default=None, ge=0)
    thevenin_x_ohm: float | None = Field(default=None)

    @model_serializer(mode="wrap")
    def _bez_pustej_impedancji_zrodla(
        self, handler: SerializerFunctionWrapHandler
    ) -> dict[str, Any]:
        dane: dict[str, Any] = handler(self)
        for pole in (
            "source_r_ohm",
            "source_x_ohm",
            "thevenin_r_ohm",
            "thevenin_x_ohm",
        ):
            if dane.get(pole) is None:
                dane.pop(pole, None)
        return dane


class V126BranchInput(_WejscieV126):
    ref: str
    from_bus_ref: str
    to_bus_ref: str
    kind: str
    # Długość i impedancja jednostkowa — pola WYMAGANE: dawne wartości domyślne
    # (1 km, 0,18 + j0,12 Ω/km) liczyły gałąź, której wejście nie opisało.
    length_km: float = Field(gt=0)
    r_ohm_per_km: float = Field(ge=0)
    x_ohm_per_km: float = Field(ge=0)
    # Susceptancja doziemna składowej zgodnej [S/km]. `None` = model/katalog nie
    # niesie pojemności doczepnej tej gałęzi — to NIE JEST zero (karta
    # MOST-WEJSCIA-V126). Rozróżnienie ma skutek: decyzja o ryzyku
    # ferrorezonansu stoi na sumie B·ℓ sieci, a suma z podstawionym zerem
    # meldowała „brak ryzyka" tam, gdzie danych po prostu nie było.
    b_siemens_per_km: float | None = Field(default=None, ge=0)
    # Susceptancja doziemna składowej zerowej B′0 = ω·C′0 [S/km] — źródło pojemności doziemnej
    # sieci w projekcie uziemienia (dławik/rezystor). Z modelu albo wartość robocza odcinka SN
    # (zasada nr 4: kabel C0 = C1, linia B′0 = 0,4·B′1 — `enm.skladowa_zerowa_galezi`, ten
    # sam predykat co bocznik pojemności zwarć i I_C uziemienia sieci; dana przyjęta
    # ESTIMATED w `V126SiecSnInput.dane_przyjete`). `None` = brak podstawy (B′1 nieznane) —
    # nazwana odmowa projektu uziemienia, nie zero.
    b0_siemens_per_km: float | None = Field(default=None)
    # Obciążalność długotrwała [A]. `None` = element NIE MA obciążalności w
    # modelu ani w katalogu (karta MOST-WEJSCIA-V126). Do tej karty pole miało
    # wartość domyślną 300 A, a most dokładał 630 A dla KAŻDEGO aparatu
    # łączeniowego — obie liczby wchodziły wprost do ilorazu I/I_dop, czyli do
    # stopnia obciążenia, dotkliwości N-1 i zdolności przyłączeniowej. Warstwa,
    # która obciążalności potrzebuje, melduje teraz brak po polsku.
    ampacity_a: float | None = Field(default=None, gt=0)
    # Intensywność uszkodzeń [1/rok] i czas odnowy [h] elementu. `None` = brak danej
    # niezawodnościowej — element nie wchodzi do wskaźników przerw i jest nazwany w wyniku
    # (dawne domyślne 0,015/rok i 12 h liczyły element bez danych). Most ENM podaje wartości
    # robocze rejestru (`network_model.catalog.wartosci_robocze`, dane przyjęte ESTIMATED
    # w `V126AcademicInput.dane_przyjete_niezawodnosci`).
    failure_rate_per_year: float | None = Field(default=None, ge=0)
    mttr_h: float | None = Field(default=None, ge=0)
    is_open: bool = False


class V126TransformerInput(_WejscieV126):
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
    # wymaga). Podstawienie 0.0 za brak fałszowałoby wynik solvera FROZEN
    # (`_opf_loss_lcc` w `network_model/solvers/v126_academic.py` sumuje
    # `p0_kw + pk_kw*0.45**2` wprost) — zero strat jałowych to WYNIK, nie
    # nieznana dana. Do karty W3-E (2026-09-09) konsument (endpoint API
    # `run_v126_analysis`) odmawiał URUCHOMIENIA analizy OPF_LOSS_LCC 422-ką
    # `transformer.loss_data_missing`, gdy p0_kw był `None`; karta W3-E
    # wycofała CAŁY rodzaj `opf_loss_lcc` z powierzchni (410, duplikuje kanon
    # `equipment_checks/transformer_losses.py`, który p0_kw czyta z KARTY
    # katalogowej rzeczywistej, nie zaszytego β = 0,45) — bramka warunkowa
    # p0_kw stała się więc zbędna i została zdjęta razem z rodzajem. Pole
    # `p0_kw` zostaje `float | None`: legalny brak wg IEC 60909 to fakt modelu
    # niezależny od tego, który rodzaj V12.6 go dziś czyta, a solver
    # (`_opf_loss_lcc`, nadal FROZEN — B-01) zostaje zdolnością odtwarzalną z
    # historycznych biegów i osiągalną wprost w testach solvera.
    p0_kw: float | None = Field(default=None, ge=0)
    vector_group: str | None = None


class V126HarmonicSourceInput(_WejscieV126):
    bus_ref: str
    source_ref: str
    base_current_a: float = Field(gt=0)
    spectrum_percent: dict[int, float] = Field(default_factory=dict)
    # Karta W2-C: skad widmo TEGO zrodla pochodzi. Jedyny dostawca to jawne wejscie
    # projektanta (`V126RunRequest.parameters.harmonic_spectra`, wzorzec OD-15(a)) —
    # "RECZNE". Dawny dostawca "KATALOG" (`ConverterType.harmonic_spectrum_percent`)
    # zniknal razem z polem (karta AB-H0 §0.5: 0 ze 176 pozycji nioslo widmo; widmo
    # urzadzenia niesie odtad karta widmowa, `Generator.modele_widmowe`). Pole BEZ
    # wartosci domyslnej: budowniczy wejscia zawsze nazywa proweniencje, nigdy jej nie
    # przyjmuje. Pole ADDYTYWNE (solver FROZEN go nie czyta — B-01); sluzy WHITE BOX/UI.
    spectrum_provenance: str


class V126ConverterInput(_WejscieV126):
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


class V126MotorInput(_WejscieV126):
    """Silnik rozruchu bezpośredniego — dane projektanta (gotowość wymaga pól wymaganych
    kontraktu, `v126_gotowosc._KLUCZE_SILNIKA_WYMAGANE` wyprowadza je z tej klasy).

    Pola wymagane bez wartości domyślnych: dawne domyślne (k_LR = 6, cos φ_r = 0,22, t_r = 8 s,
    t_utyku = 20 s, M_max = 2, s_k = 0,2, M_obc = 0,6) liczyły silnik, którego nikt nie opisał.
    ``rated_power_factor``/``rated_efficiency`` — cos φ_n i η_n tabliczki; `None` = wartości
    robocze rejestru maszyn (`wartosci_robocze.PROPOZYCJE_MASZYNY`, dane przyjęte ESTIMATED).
    """

    ref: str
    bus_ref: str
    rated_kw: float = Field(gt=0)
    rated_voltage_kv: float = Field(gt=0)
    locked_rotor_multiplier: float = Field(gt=0)
    start_power_factor: float = Field(gt=0, le=1)
    start_time_s: float = Field(gt=0)
    allowable_locked_rotor_time_s: float = Field(gt=0)
    max_torque_pu: float = Field(gt=0)
    critical_slip: float = Field(gt=0, lt=1)
    load_start_torque_pu: float = Field(ge=0)
    rated_power_factor: float | None = Field(default=None, gt=0, le=1)
    rated_efficiency: float | None = Field(default=None, gt=0, le=1)

    @model_serializer(mode="wrap")
    def _bez_pustych_danych_tabliczki(
        self, handler: SerializerFunctionWrapHandler
    ) -> dict[str, Any]:
        dane: dict[str, Any] = handler(self)
        for pole in ("rated_power_factor", "rated_efficiency"):
            if dane.get(pole) is None:
                dane.pop(pole, None)
        return dane


class V126EarthingInput(_WejscieV126):
    """Uziom stacji (IEEE Std 80) — dane projektanta. Pola liczone są WYMAGANE: dawne wartości
    domyślne (ρ = 100 Ω·m, siatka 60 × 40 m, 10 kA, 0,5 s) liczyły uziom, którego nikt nie
    opisał. ``rho2_ohm_m``/``h1_m`` (grunt dwuwarstwowy) solver tylko przenosi do wyniku.

    ``bus_ref`` — szyna stacji w modelu (dawne ``gpz_ref`` z domyślnym napisem „GPZ" nie
    wskazywało niczego w modelu). Prąd zwarcia doziemnego przed redukcją przychodzi z MODELU
    (``V126AcademicInput.prad_uziomowy`` — przypadki EN 50522 tab. 1 składane w
    ``application.analyses.v126_prad_uziomowy``); ``fault_current_ka`` jest wyłącznie
    nadpisaniem projektanta (dana przyjęta, kompletność dowodu NIEPELNY)."""

    bus_ref: str = Field(min_length=1)
    rho1_ohm_m: float = Field(gt=0)
    rho2_ohm_m: float | None = Field(default=None, gt=0)
    h1_m: float | None = Field(default=None, gt=0)
    length_m: float = Field(gt=0)
    width_m: float = Field(gt=0)
    mesh_spacing_m: float = Field(gt=0)
    buried_depth_m: float = Field(gt=0)
    rods_total_length_m: float = Field(ge=0)
    split_factor: float = Field(gt=0, le=1)
    fault_current_ka: float | None = Field(default=None, gt=0)
    fault_clearing_time_s: float = Field(gt=0)
    surface_layer_rho_ohm_m: float = Field(gt=0)
    surface_layer_derating: float = Field(gt=0)


class V126PrzypadekPraduUziomowegoInput(_WejscieV126):
    """Jeden przypadek zwarcia doziemnego, którego prąd odprowadza uziom stacji (EN 50522:2010
    tab. 1) — wielkości Z MODELU, bez wyboru wielkości miarodajnej (wybiera solver V12.6).

    ``strona`` — sieć SN stacji (galwanicznie połączona sieć jej szyny SN) albo sieć WN
    stacji (szyna WN w tej samej stacji). Strona SN: ``tryb`` i ``stan_awsc`` — sposób pracy
    punktu neutralnego sieci (``UziemienieSekcji.tryb_doziemienia``), ``prad_doziemienia_a`` —
    prąd solvera doziemienia sieci (I_C sieci izolowanej, I_res skompensowanej, I_F
    rezystorowej), ``i_l_a`` — prąd dławików, ``dlawik_w_stacji`` — dławik gaszący sieci jest
    przyłączony w tej stacji (EN 50522 tab. 1 rozróżnia instalacje z dławikiem i bez).
    ``ikss_a`` — I″k1 rdzenia IEC 60909 (scenariusz MAX) największy wśród szyn stacji tej
    sieci; ``None`` poza siecią uziemioną przez małą impedancję. Przyczyny braku i dane
    przyjęte osobno dla obu wielkości (``*_doziemienia`` — solver doziemienia sieci SN,
    ``*_ikss`` — rdzeń IEC 60909): wielkość miarodajną wybiera solver V12.6, więc przyczynę
    i dane przyjęte bierze z tej samej wielkości (predykaty parami)."""

    strona: Literal["SN", "WN"]
    nazwa_pl: str
    bus_ref: str
    tryb: TrybDoziemienia | None = None
    stan_awsc: StanAwsc = "spoczynek"
    prad_doziemienia_a: float | None = Field(default=None, ge=0)
    i_l_a: float | None = Field(default=None, ge=0)
    ikss_a: float | None = Field(default=None, ge=0)
    dlawik_w_stacji: bool = False
    brak_doziemienia_pl: str | None = None
    brak_ikss_pl: str | None = None
    dane_przyjete_doziemienia: list[DanaPrzyjeta] = Field(default_factory=list)
    dane_przyjete_ikss: list[DanaPrzyjeta] = Field(default_factory=list)


class V126PradUziomowyInput(_WejscieV126):
    """Prąd zwarcia doziemnego stacji z modelu: przypadki stron SN i WN stacji szyny
    ``bus_ref`` (``application.analyses.v126_prad_uziomowy.prad_uziomowy_z_modelu``).
    ``brak_pl`` — przyczyna, gdy model nie daje żadnego przypadku (szyna spoza modelu, stacja
    bez sieci SN ani WN, odmowa danych wejścia zwarciowego)."""

    bus_ref: str
    nazwa_stacji_pl: str
    przypadki: list[V126PrzypadekPraduUziomowegoInput] = Field(default_factory=list)
    brak_pl: str | None = None


class V126InsulationInput(_WejscieV126):
    """Miejsce zainstalowania ogranicznika przepięć (koordynacja izolacji IEC 60071).

    ``u_m_kv`` — napięcie najwyższe sieci szyny U_s (IEC 60038; bez niego — U_m karty
    ogranicznika). ``network_neutral`` — tryb doziemienia sieci szyny
    (``network_model.core.uziemienie.TrybDoziemienia``) WYŁĄCZNIE z modelu
    (`_doziemienie_szyny_izolacji`); dawne kategorie „isolated"/„earthed" utożsamiały sieć
    z rezystorem (nieskutecznie uziemioną, k ≈ √3) z siecią uziemioną bezpośrednio
    (karta UX-04, warunek odbioru 2026-10-29). ``earth_fault_factor`` — współczynnik zwarcia
    doziemnego k = U_fazy zdrowej/U_f z solvera doziemienia sieci SN (``doziemienie_sn``);
    ``None`` — solver V12.6 przyjmuje wartość roboczą trybu (dana przyjęta ESTIMATED).
    Parametry ogranicznika (U_c, U_r, U_res, wytrzymałość TOV 10 s) z karty katalogowej
    albo ``None`` — dobór wstępny solvera (wartości robocze jawne w wyniku).
    """

    location_bus_ref: str
    u_m_kv: float = Field(gt=0)
    network_neutral: TrybDoziemienia
    earth_fault_factor: float | None = Field(default=None, gt=0)
    earth_fault_factor_zrodlo_pl: str | None = None
    arrester_mcov_kv: float | None = Field(default=None, gt=0)
    arrester_rated_kv: float | None = Field(default=None, gt=0)
    arrester_residual_10ka_kv: float | None = Field(default=None, gt=0)
    arrester_tov_10s_kv: float | None = Field(default=None, gt=0)


class V126ShuntCapacitorInput(_WejscieV126):
    """Bateria kondensatorów w projekcie uziemienia punktu neutralnego (karta
    UX-04/POLE-BKR-MODEL): susceptancja zerowa fazy względem ziemi B0 [S] policzona w moście
    z pierwszych zasad (``enm.bateria_kondensatorow.admitancja_zerowa_baterii_s``) — niezerowa
    WYŁĄCZNIE dla gwiazdy z uziemionym punktem gwiazdy (Y0 = Y1); gwiazda izolowana, podwójna
    gwiazda izolowana i trójkąt mają B0 = 0 (brak drogi zerowej)."""

    ref: str
    bus_ref: str
    uklad_polaczen: str
    b0_siemens: float = Field(ge=0)
    is_open: bool = False

    @property
    def wnosi_pojemnosc_doziemna(self) -> bool:
        """Bateria wchodzi do pojemności doziemnej sieci: załączona i z drogą zerową (B0 > 0).
        JEDEN predykat solvera (``V126AcademicSolver._neutral_earthing_design``) i gotowości
        analizy (``application.analyses.v126_gotowosc._warunki_punktu_neutralnego``)."""
        return not self.is_open and self.b0_siemens > 0.0


#: Pola wejścia V12.6 DODANE PO ZAMROŻENIU odcisków ``input_hash`` — w postaci serializowanej
#: występują WYŁĄCZNIE, gdy niosą treść (pusta lista = model bez takich elementów; odcisk
#: wejścia bez baterii bit w bit jak przed kartą UX-04/POLE-BKR-MODEL).
_POLA_V126_POZA_ODCISKIEM_GDY_PUSTE: tuple[str, ...] = (
    "shunt_capacitors",
    "dane_przyjete_niezawodnosci",
)


class V126RezystorSnInput(_WejscieV126):
    """Rezystor punktu neutralnego sieci SN w ruchu (z modelu — zespół uziemiający albo
    uzwojenie TR uziemione przez rezystor): R [Ω], prąd znamionowy I_n [A], dopuszczalny czas
    przepływu prądu znamionowego t_n [s]. Wartości robocze niesie ``dane_przyjete`` wejścia."""

    ref: str
    nazwa_pl: str
    r_ohm: float
    i_n_a: float
    t_n_s: float
    #: Impedancja zerowa w szeregu z rezystorem [Ω/fazę] — droga prądu rezystora przy
    #: doziemieniu Z_0/3 + R (sprawdzenie cieplne, IEC 60909-0): transformator uziemiający
    #: zespołu Z_0,TU albo — rezystor w punkcie neutralnym uzwojenia transformatora sieci —
    #: impedancja zerowa transformatora Z_T0 (``enm.uziemienie_sekcji``).
    z0_tu_r_ohm: float | None = None
    z0_tu_x_ohm: float | None = None


class V126PunktNeutralnySnInput(_WejscieV126):
    """Punkt uziemienia sieci SN w ruchu do prądu doziemienia (``doziemienie_sn``): Z_N [Ω]
    gałęzi punktu neutralnego w ruchu (dławik jX_L, rezystor, rezystor wymuszający AWSC —
    równolegle; 0 — wprost) i impedancja zerowa w szeregu Z_0 [Ω/fazę] (Z_0,TU zespołu albo
    Z_T0 transformatora dla punktu neutralnego uzwojenia; ``None`` — brak)."""

    nazwa_pl: str
    z_n_r_ohm: float
    z_n_x_ohm: float
    z0_r_ohm: float | None = None
    z0_x_ohm: float | None = None


class V126SiecSnInput(_WejscieV126):
    """Jedna GALWANICZNIE połączona sieć SN modelu (składowa topologii przy stanach łączników
    — `enm.uziemienie_sekcji.UziemienieSekcji`). Dwie sekcje GPZ przy otwartym sprzęgle to dwie
    sieci: każda ma własny punkt neutralny, własną pojemność doziemną i własny zespół
    uziemiający, więc prąd pojemnościowy I_C i dobór dławika albo rezystora liczy się dla każdej
    osobno (IEC 60909-0 / PN-EN 50522: I_C = √3·ω·C_0·U_n sieci połączonej galwanicznie).

    ``szyna_ref`` — szyna sekcji identyfikująca sieć na schemacie (szyna punktu uziemienia
    w ruchu, a bez niego pierwsza szyna sieci po ``ref_id``); ``szyny`` — wszystkie szyny sieci.
    """

    szyna_ref: str
    nazwa_pl: str
    wariant: str
    opis_pl: str
    #: Napięcie znamionowe sieci SN [kV] z tej samej prawdy — podstawa I_C = √3·U_n·B_0
    #: (dawniej solver brał najwyższe napięcie szyny modelu, czyli 110 kV w modelu GPZ).
    napiecie_kv: float | None = None
    szyny: list[str] = Field(default_factory=list)
    #: Linie i kable w ruchu TEJ sieci (`enm.uziemienie_sekcji.galezie_sieci_sn`): jedyne
    #: gałęzie, których pojemność doziemna wchodzi do jej I_C i do oceny ferrorezonansu.
    galezie_sieci: list[str] = Field(default_factory=list)
    #: Baterie kondensatorów załączone na szynach TEJ sieci (`baterie_sieci_sn` — ten sam
    #: predykat, z którego `uziemienie_sieci` dokłada B_0 gwiazdy uziemionej): jedyne baterie,
    #: które solver i gotowość rozważają dla jej I_C.
    baterie_sieci: list[str] = Field(default_factory=list)
    #: Rezystory punktów neutralnych w ruchu (stan normalny) — projekt uziemienia rezystorowego
    #: sprawdza REZYSTOR MODELU (dawny parametr biegu „docelowy prąd doziemienia" i „energia
    #: znamionowa rezystora" nadpisywały model — §0 pkt 4).
    rezystory: list[V126RezystorSnInput] = Field(default_factory=list)
    #: Punkty uziemienia sieci w ruchu w stanie normalnym (AWSC w spoczynku) i po załączeniu
    #: AWSC (puste, gdy żaden punkt nie ma rezystora wymuszającego) — z tej samej prawdy co
    #: wiersz zwarcia jednofazowego (``UziemienieSekcji.dane_doziemienia``): prąd doziemienia
    #: projektu uziemienia (I_ef rezystora, I_res dławika) liczy ten sam solver co wiersz.
    punkty_neutralne: list[V126PunktNeutralnySnInput] = Field(default_factory=list)
    punkty_neutralne_awsc: list[V126PunktNeutralnySnInput] = Field(default_factory=list)
    #: W ruchu jest dławik (rozstrojenie v) / punkt neutralny uzwojenia YNyn (zastrzeżenie).
    dlawik_w_ruchu: bool = False
    droga_szeregowa: bool = False
    #: Współczynnik napięciowy c_max sieci (IEC 60909-0 tab. 1) z JEDYNEGO nośnika c
    #: (`network_model.core.voltage_factor.dobierz_c`, scenariusz MAX) i jego podstawa —
    #: największy prąd rezystora przy doziemieniu w sprawdzeniu cieplnym (`None` — wejście
    #: zbudowane poza mostem modelu: solver odmawia sprawdzenia cieplnego, nie zgaduje c).
    c_max: float | None = None
    c_max_zrodlo_pl: str | None = None
    #: Dane przyjęte ESTIMATED parametrów urządzeń punktu neutralnego i B′0 odcinków tej sieci
    #: (I_C), które wchodzą do analizy (zasada nr 4) — wynik na nich ma kompletność dowodu
    #: NIEPELNY.
    dane_przyjete: list[DanaPrzyjeta] = Field(default_factory=list)


class V126UziemienieSnInput(_WejscieV126):
    """Sposób uziemienia punktu neutralnego sieci SN z MODELU (karta UX-04/POLE-ZU-SKLADOWA-
    ZEROWA §0 pkt 4) — wejście analiz V12.6 zależnych od punktu neutralnego (projekt
    uziemienia, metoda detekcji doziemień, ferrorezonans). Parametry biegu nie nadpisują go.

    ``wariant`` — `WariantUziemieniaSekcji` w stanie normalnym (AWSC w spoczynku), wspólny dla
    wszystkich sieci SN modelu; ``przyczyna_braku_pl`` — nazwana przyczyna, gdy sposobu nie da
    się ustalić (zespół bez elementu w punkcie neutralnym, sieci SN modelu różnie uziemione,
    model bez sieci SN); ``sieci`` — każda galwanicznie połączona sieć SN osobno.
    """

    wariant: str | None = None
    wariant_awsc_zalaczony: str | None = None
    regulacja_nadazna: bool = False
    opis_pl: str = ""
    przyczyna_braku_pl: str | None = None
    sieci: list[V126SiecSnInput] = Field(default_factory=list)


#: Wariant uziemienia sekcji SN → typ projektu uziemienia punktu neutralnego V12.6 (D-06a/b):
#: dławik (także z AWSC — w spoczynku sieć skompensowana) → projekt dławika; rezystor
#: i dławik‖rezystor (Z.14 — składowa czynna prądu doziemienia) → projekt rezystora.
#: Warianty `izolowany` i `bezposrednie` nie mają czego projektować.
PROJEKT_UZIEMIENIA_WARIANTU: dict[str, str] = {
    "dlawik": "petersen_coil",
    "dlawik_awsc": "petersen_coil",
    "rezystor": "resistor_grounded",
    "dlawik_rezystor": "resistor_grounded",
}


def brak_uziemienia_sn(
    uziemienie: V126UziemienieSnInput | None, *, projekt_zespolu: bool = False
) -> str | None:
    """Nazwana przyczyna, gdy wejście nie niesie sposobu uziemienia sieci SN z modelu.

    JEDYNY predykat dla solvera (odmowa „dane niekompletne") i gotowości (warunek
    `model.uziemienie_sn`) — predykaty parami. ``projekt_zespolu``: projekt uziemienia
    wymaga dławika gaszącego albo rezystora w punkcie neutralnym sieci (zespół uziemiający
    albo uzwojenie SN transformatora); jego brak to brak MODELU, nie wartość proponowana.
    """
    if uziemienie is None:
        return (
            "Wejście analizy nie niesie sposobu uziemienia punktu neutralnego sieci SN z "
            "modelu — analiza zależna od punktu neutralnego niewykonana."
        )
    if uziemienie.przyczyna_braku_pl is not None:
        return uziemienie.przyczyna_braku_pl
    if uziemienie.wariant is None:
        return "Sposób uziemienia punktu neutralnego sieci SN modelu nieustalony."
    if projekt_zespolu and uziemienie.wariant not in PROJEKT_UZIEMIENIA_WARIANTU:
        return (
            f"Sieć SN modelu: {uziemienie.opis_pl} Projekt uziemienia punktu neutralnego "
            "dotyczy dławika gaszącego albo rezystora w punkcie neutralnym sieci — zamodeluj "
            "zespół uziemiający w polu sekcji SN."
        )
    return None


class V126AcademicInput(_WejscieV126):
    base_frequency_hz: float = Field(default=50.0, gt=0)
    buses: list[V126BusInput]
    branches: list[V126BranchInput] = Field(default_factory=list)
    transformers: list[V126TransformerInput] = Field(default_factory=list)
    harmonic_sources: list[V126HarmonicSourceInput] = Field(default_factory=list)
    converters: list[V126ConverterInput] = Field(default_factory=list)
    motors: list[V126MotorInput] = Field(default_factory=list)
    earthing: V126EarthingInput | None = None
    #: Prąd zwarcia doziemnego stacji uziomu z modelu (EN 50522 tab. 1) — wyłącznie dla
    #: analizy bezpieczeństwa uziomu ze wskazaną szyną stacji.
    prad_uziomowy: V126PradUziomowyInput | None = None
    insulation: list[V126InsulationInput] = Field(default_factory=list)
    parameters: dict[str, Any] = Field(default_factory=dict)
    shunt_capacitors: list[V126ShuntCapacitorInput] = Field(default_factory=list)
    #: Uziemienie sieci SN z modelu — wyłącznie dla analiz z `ANALIZY_UZIEMIENIA_SN`.
    uziemienie_sn: V126UziemienieSnInput | None = None
    #: Dane przyjęte niezawodności (wartości robocze rejestru — intensywność uszkodzeń i czas
    #: odnowy elementów bez danych modelu), wypełniane przez most ENM; solver przenosi je do
    #: wyniku analizy niezawodności (zasada nr 4: wynik na nich ma kompletność NIEPELNY).
    dane_przyjete_niezawodnosci: list[DanaPrzyjeta] = Field(default_factory=list)

    @model_serializer(mode="wrap")
    def _bez_pustych_pol_addytywnych(
        self, handler: SerializerFunctionWrapHandler
    ) -> dict[str, Any]:
        # Pola addytywne obecne WYŁĄCZNIE, gdy niosą treść: uziemienie — gdy analiza je czyta,
        # baterie — gdy model je ma. Zapis wejścia, `input_hash` i ziarno losowania (hosting
        # capacity) pozostałych analiz i modeli bez baterii bajtowo bez zmian.
        dane: dict[str, Any] = handler(self)
        for pole_opcjonalne in ("uziemienie_sn", "prad_uziomowy"):
            if dane.get(pole_opcjonalne) is None:
                dane.pop(pole_opcjonalne, None)
        for pole in _POLA_V126_POZA_ODCISKIEM_GDY_PUSTE:
            if dane.get(pole) == []:
                del dane[pole]
        return dane


#: Analizy V12.6, których wynik zależy od sposobu uziemienia punktu neutralnego sieci SN.
ANALIZY_UZIEMIENIA_SN: frozenset[V126AnalysisType] = frozenset(
    {
        V126AnalysisType.NEUTRAL_EARTHING_DESIGN,
        V126AnalysisType.EARTH_FAULT_DETECTION,
        V126AnalysisType.TRANSIENT_TRV,
    }
)


#: Analizy V12.6, które czytają impedancję zastępczą sieci w szynie (`V126BusInput.thevenin_*`).
ANALIZY_IMPEDANCJI_ZASTEPCZEJ: frozenset[V126AnalysisType] = frozenset(
    {V126AnalysisType.HOSTING_CAPACITY, V126AnalysisType.MOTOR_STARTING}
)


def impedancje_zastepcze_szyn(enm: EnergyNetworkModel) -> dict[str, dict[str, float]]:
    """Z_th szyn modelu [Ω] z KANONICZNEGO budowniczego sieci zwarciowej (decyzja O-26:
    bez czwartego budowniczego admitancji) — `{ref szyny: {thevenin_r_ohm, thevenin_x_ohm}}`.

    Graf IR modelu (`enm.mapping.map_enm_to_network_graph`, scenariusz MAX) bez wysp bez
    impedancji do odniesienia (`NetworkGraph.wezly_bez_impedancji_do_odniesienia` — ten sam
    predykat co graf solvera zwarć), macierz `short_circuit_core.build_zbus`:
    Z_th = Z_bus[k,k]·Z_b,k, Z_b,k = U_n,k²/S_b. Macierz niesie przekładnię transformatora
    (impedancja widziana z szyny nN zawiera sieć SN sprowadzoną przez (U_rTLV/U_rTHV)²),
    współczynnik korekcyjny K_T (IEC 60909-0:2016 §6.3.3, eq. 12a), Z_Q zasilania
    systemowego (§6.2.1 eq. 6, ze współczynnikiem c) i impedancje Z″ maszyn wirujących;
    admitancje poprzeczne gałęzi są pominięte (§5.2 f). Szyna spoza grafu solvera (wyspa
    bez źródła sieciowego i maszyny) nie ma wpisu — solver melduje brak nazwany.
    Odmowa danych rdzenia (macierz osobliwa) przechodzi jako `OdmowaDanychError`."""
    graf = map_enm_to_network_graph(enm)
    bez_odniesienia = graf.wezly_bez_impedancji_do_odniesienia()
    if bez_odniesienia:
        graf = graf.podgraf(wezel for wezel in graf.nodes if wezel not in bez_odniesienia)
    if not graf.nodes:
        return {}
    with odmowa_rdzenia_b01():
        budowniczy, z_bus = build_zbus(graf)
    indeks = budowniczy.node_id_to_index
    wynik: dict[str, dict[str, float]] = {}
    for bus in enm.buses:
        wezel = ref_to_graph_id(bus.ref_id)
        k = indeks.get(wezel)
        if k is None:
            continue
        z_th = complex(z_bus[k, k]) * budowniczy.get_zbase_ohm(wezel)
        wynik[bus.ref_id] = {
            "thevenin_r_ohm": max(z_th.real, 0.0),
            "thevenin_x_ohm": z_th.imag,
        }
    return wynik


def uziemienie_sn_v126(enm: EnergyNetworkModel) -> V126UziemienieSnInput:
    """Uziemienie sieci SN modelu dla V12.6 z JEDYNEJ funkcji (`enm.uziemienie_sekcji`).

    Analizy V12.6 opisują jedną sieć SN; model z kilkoma sieciami SN o RÓŻNYM sposobie
    uziemienia (np. dwie sekcje przy otwartym sprzęgle, każda z innym zespołem) dostaje
    nazwaną przyczynę zamiast wyboru jednej z nich.
    """
    sekcje = uziemienie_sieci(enm)
    if not sekcje:
        return V126UziemienieSnInput(
            przyczyna_braku_pl="Model nie ma sieci SN — sposobu uziemienia punktu neutralnego "
            "sieci SN nie ma czego ustalić."
        )
    odmowy = [o for s in sekcje for o in s.odmowy]
    if odmowy:
        return V126UziemienieSnInput(przyczyna_braku_pl=" ".join(odmowy))
    napiecia = sorted({s.napiecie_kv for s in sekcje})
    if len(napiecia) > 1:
        return V126UziemienieSnInput(
            przyczyna_braku_pl=(
                "Sieci SN modelu mają różne napięcia znamionowe ("
                + ", ".join(f"{u:g} kV" for u in napiecia)
                + ") — analiza V12.6 dotyczy jednej sieci; rozdziel przypadki obliczeniowe."
            )
        )
    warianty = sorted({s.wariant("spoczynek") for s in sekcje})
    if len(warianty) > 1:
        return V126UziemienieSnInput(
            przyczyna_braku_pl=(
                "Sieci SN modelu mają różny sposób uziemienia punktu neutralnego ("
                + "; ".join(s.opis_pl() for s in sekcje)
                + ") — analiza V12.6 dotyczy jednej sieci; rozdziel przypadki obliczeniowe "
                "albo ujednolić uziemienie."
            )
        )
    return _wejscie_uziemienia(enm, sekcje)


def _wejscie_uziemienia(
    enm: EnergyNetworkModel, sekcje: tuple[UziemienieSekcji, ...]
) -> V126UziemienieSnInput:
    return V126UziemienieSnInput(
        wariant=sekcje[0].wariant("spoczynek"),
        wariant_awsc_zalaczony=sekcje[0].wariant("zalaczony"),
        regulacja_nadazna=all(s.regulacja_nadazna for s in sekcje),
        opis_pl=" ".join(s.opis_pl() for s in sekcje),
        sieci=[_wejscie_sieci(enm, sekcja) for sekcja in sekcje],
    )


def _wejscie_sieci(enm: EnergyNetworkModel, sekcja: UziemienieSekcji) -> V126SiecSnInput:
    """Jedna galwanicznie połączona sieć SN — zakres gałęzi, szyny, rezystory i dławiki
    WYŁĄCZNIE tej sieci (ta sama składowa, z której `uziemienie_sieci` liczy B_0 i I_C)."""
    rezystory = sekcja.rezystory_w_ruchu("spoczynek")
    dane_spoczynek = sekcja.dane_doziemienia("spoczynek")
    z_awsc = sekcja.ma_awsc
    c_max = dobierz_c(sekcja.napiecie_kv, "MAX", None, tolerancja_nn=None)
    szyny_modelu = {b.ref_id: b for b in enm.buses}
    # Sieć nazwana szynami sekcji GPZ, które do niej należą (kolejność sekcji stacji) — szyna
    # punktu neutralnego bywa zaciskiem pola zespołu i nie odróżnia sieci; model bez sekcji
    # GPZ w sieci: szyna punktu uziemienia w ruchu, inaczej pierwsza szyna sieci.
    szyny_sieci = frozenset(sekcja.szyny)
    szyny_sekcji = [
        s.bus_ref
        for stacja in enm.substations
        for s in stacja.gpz_sections
        if s.bus_ref in szyny_sieci
    ]
    szyny_punktow = sorted({p.bus_ref for p in sekcja.punkty_w_ruchu})
    szyna_ref = (
        szyny_sekcji[0]
        if szyny_sekcji
        else (szyny_punktow[0] if szyny_punktow else sekcja.szyny[0])
    )
    # Szyna bez nazwy nadanej: opis rodzaju („Szyna bez nazwy"), nigdy identyfikator.
    opis_szyn = ", ".join(
        nazwa_elementu(szyny_modelu.get(ref), "buses") for ref in (szyny_sekcji or [szyna_ref])
    )
    return V126SiecSnInput(
        szyna_ref=szyna_ref,
        nazwa_pl=f"Sieć SN {sekcja.napiecie_kv:g} kV — {opis_szyn}",
        wariant=sekcja.wariant("spoczynek"),
        opis_pl=sekcja.opis_pl(),
        napiecie_kv=sekcja.napiecie_kv,
        szyny=list(sekcja.szyny),
        galezie_sieci=[g.ref_id for g in galezie_sieci_sn(enm, frozenset(sekcja.szyny))],
        baterie_sieci=[b.ref_id for b in baterie_sieci_sn(enm, frozenset(sekcja.szyny))],
        rezystory=[
            V126RezystorSnInput(
                ref=r.element_ref,
                nazwa_pl=r.nazwa_pl,
                r_ohm=r.r.wartosc,
                i_n_a=r.i_n.wartosc,
                t_n_s=r.t_n.wartosc,
                z0_tu_r_ohm=None if r.z0_tu_ohm is None else r.z0_tu_ohm.real,
                z0_tu_x_ohm=None if r.z0_tu_ohm is None else r.z0_tu_ohm.imag,
            )
            for r in rezystory
        ],
        punkty_neutralne=_punkty_doziemienia(dane_spoczynek.punkty),
        punkty_neutralne_awsc=(
            _punkty_doziemienia(sekcja.dane_doziemienia("zalaczony").punkty) if z_awsc else []
        ),
        dlawik_w_ruchu=dane_spoczynek.dlawik_w_ruchu,
        droga_szeregowa=dane_spoczynek.droga_szeregowa,
        c_max=c_max.wartosc,
        c_max_zrodlo_pl=c_max.zrodlo,
        dane_przyjete=_bez_powtorzen(
            [
                *sekcja.dane_przyjete_doziemienia("spoczynek"),
                *(sekcja.dane_przyjete_doziemienia("zalaczony") if z_awsc else ()),
                *(d for r in rezystory for d in r.dane_przyjete()),
            ]
        ),
    )


def _punkty_doziemienia(
    punkty: tuple[PunktNeutralnyDoziemienia, ...],
) -> list[V126PunktNeutralnySnInput]:
    return [
        V126PunktNeutralnySnInput(
            nazwa_pl=p.nazwa_pl,
            z_n_r_ohm=p.z_n_ohm.real,
            z_n_x_ohm=p.z_n_ohm.imag,
            z0_r_ohm=None if p.z0_tu_ohm is None else p.z0_tu_ohm.real,
            z0_x_ohm=None if p.z0_tu_ohm is None else p.z0_tu_ohm.imag,
        )
        for p in punkty
    ]


def _bez_powtorzen(dane: list[DanaPrzyjeta]) -> list[DanaPrzyjeta]:
    """Dane przyjęte bez powtórzeń (ten sam parametr wchodzi do prądu doziemienia
    i do sprawdzenia rezystora) — kolejność pierwszego wystąpienia."""
    wynik: list[DanaPrzyjeta] = []
    widziane: set[str] = set()
    for dana in dane:
        klucz = dana.model_dump_json()
        if klucz not in widziane:
            widziane.add(klucz)
            wynik.append(dana)
    return wynik


class V126RunRequest(BaseModel):
    parameters: dict[str, Any] = Field(default_factory=dict)


@dataclass(frozen=True)
class _DoziemienieSzynyIzolacji:
    """Tryb doziemienia sieci szyny i współczynnik zwarcia doziemnego k (``None`` — solver
    V12.6 przyjmuje wartość roboczą trybu) z jego podstawą."""

    tryb: TrybDoziemienia
    k: float | None
    zrodlo_pl: str | None


def _doziemienie_szyny_izolacji(
    enm: EnergyNetworkModel, bus_ref: str
) -> _DoziemienieSzynyIzolacji | None:
    """Tryb doziemienia sieci szyny (koordynacja izolacji) z modelu albo ``None``.

    Szyna SN: jedyna prawda `enm.uziemienie_sekcji` (stan normalny — AWSC w spoczynku; sieć
    kompensowana nie zmienia trybu po załączeniu AWSC, Z.13) i współczynnik k z solvera
    doziemienia tej sieci (``UziemienieSekcji.doziemienie``: doziemienie metaliczne, napięcia
    faz zdrowych z modelu admitancyjnego punktu neutralnego); sieć z odmową zespołu →
    ``None``. Szyna poza SN (WN, nN): punkt neutralny źródła NA tej szynie (sieć 110 kV za
    granicą modelu) albo uzwojenia transformatora na tej szynie — tryb z JEDNEGO
    odwzorowania ``TRYB_DOZIEMIENIA_TYPU``, k nieznany (solver przyjmuje wartość roboczą);
    brak opisu → ``None`` (W5-D p. 12).
    """
    szyna = next((b for b in enm.buses if b.ref_id == bus_ref), None)
    if szyna is None:
        return None
    if pasmo_napieciowe(szyna.voltage_kv) == "SN":
        sekcja = uziemienie_szyny(enm, bus_ref)
        if sekcja is None or sekcja.odmowy:
            return None
        doziemienie = sekcja.doziemienie("spoczynek")
        return _DoziemienieSzynyIzolacji(
            tryb=sekcja.tryb_doziemienia("spoczynek"),
            k=doziemienie.wspolczynnik_k,
            zrodlo_pl=(
                None
                if doziemienie.wspolczynnik_k is None
                else f"solver doziemienia sieci SN — {ETYKIETA_PL_TRYBU[doziemienie.tryb]}, "
                "doziemienie "
                "metaliczne (IEC 60071-1: k = U_fazy zdrowej/U_f)"
            ),
        )
    for source in enm.sources:
        if source.bus_ref == bus_ref and source.neutral_grounding is not None:
            tryb = TRYB_DOZIEMIENIA_TYPU.get(source.neutral_grounding.type or "")
            if tryb is not None:
                return _DoziemienieSzynyIzolacji(tryb=tryb, k=None, zrodlo_pl=None)
    for transformer in enm.transformers:
        for strona_szyny, konfiguracja in (
            (transformer.lv_bus_ref, transformer.lv_neutral),
            (transformer.hv_bus_ref, transformer.hv_neutral),
        ):
            if strona_szyny == bus_ref and konfiguracja is not None:
                tryb = TRYB_DOZIEMIENIA_TYPU.get(konfiguracja.type or "")
                if tryb is not None:
                    return _DoziemienieSzynyIzolacji(tryb=tryb, k=None, zrodlo_pl=None)
    return None


def _pola_doziemienia_izolacji(doziemienie: _DoziemienieSzynyIzolacji) -> dict[str, Any]:
    return {
        "network_neutral": doziemienie.tryb,
        "earth_fault_factor": doziemienie.k,
        "earth_fault_factor_zrodlo_pl": doziemienie.zrodlo_pl,
    }


def wiersze_izolacji_projektanta(
    enm: EnergyNetworkModel, wiersze: list[dict[str, Any]]
) -> list[V126InsulationInput]:
    """Wiersze koordynacji izolacji z parametrów projektanta z kategorią TOV Z MODELU.

    Projektant podaje dane ogranicznika; kategorii TOV (sposobu uziemienia sieci) nie podaje
    — parametr biegu nie nadpisuje modelu (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA §0 pkt 4).

    Raises:
        OdmowaDanychError: wiersz niesie ``network_neutral``, szyna wiersza nie ma w modelu
            sposobu uziemienia (komunikat po polsku nazywa szynę) albo wiersz jest niezgodny
            z kontraktem wejścia (komunikat walidacji).
    """
    wynik: list[V126InsulationInput] = []
    for wiersz in wiersze:
        for klucz in ("network_neutral", "earth_fault_factor", "earth_fault_factor_zrodlo_pl"):
            if klucz in wiersz:
                raise OdmowaDanychError(
                    "Sposób uziemienia sieci i współczynnik zwarcia doziemnego wiersza "
                    "koordynacji izolacji wynikają z modelu (zespół uziemiający albo punkt "
                    f"neutralny uzwojenia) — parametr „{klucz}” nie jest przyjmowany."
                )
        bus_ref = str(wiersz.get("location_bus_ref", ""))
        doziemienie = _doziemienie_szyny_izolacji(enm, bus_ref)
        if doziemienie is None:
            szyna = next((b for b in enm.buses if b.ref_id == bus_ref), None)
            nazwa = nazwa_elementu(szyna, "buses") if szyna is not None else "spoza modelu"
            raise OdmowaDanychError(
                f"Szyna {nazwa}: model nie określa uziemienia punktu neutralnego sieci — "
                "kategorii przepięć dorywczych nie da się przyjąć."
            )
        try:
            wynik.append(
                V126InsulationInput.model_validate(
                    {**wiersz, **_pola_doziemienia_izolacji(doziemienie)}
                )
            )
        except ValidationError as exc:
            raise OdmowaDanychError(
                f"Dane koordynacji izolacji niezgodne z kontraktem: {opis_bledu_walidacji(exc)}."
            ) from exc
    return wynik


def build_v126_insulation_from_enm(enm: EnergyNetworkModel) -> list[V126InsulationInput]:
    """Most model → koordynacja izolacji IEC 60071 (G-STK-7).

    Dla każdego ogranicznika przepięć w modelu (aparat pierwotny pola
    ``kind == "SURGE_ARRESTER"``) buduje wejście ``V126InsulationInput``,
    aby analiza ``insulation_coordination`` (_insulation) liczyła margines BIL
    z DANYCH MODELU, nie z ręcznych parametrów. Zero fabrykacji:

    - ZDOLNOŚĆ ogranicznika (U_c, U_r, U_res przy 10 kA, wytrzymałość TOV 10 s) z rekordu
      katalogu ``mv_surge_arrester_catalog`` po ``catalog_ref`` — gdy brak karty, pola
      pozostają ``None`` (solver wykonuje dobór wstępny z wartościami roboczymi jawnymi
      w wyniku);
    - U_m = napięcie najwyższe sieci U_s szyny (IEC 60038,
      `pasma_napieciowe.napiecie_najwyzsze_sieci_kv`), a bez niego — U_m karty ogranicznika;
    - ``network_neutral`` (tryb doziemienia) i współczynnik k ZAWSZE z modelu
      (`_doziemienie_szyny_izolacji`: szyna SN — jedyna prawda
      `enm.uziemienie_sekcji`, karta UX-04/POLE-ZU-SKLADOWA-ZEROWA; szyna WN/nN — punkt
      neutralny źródła albo uzwojenia NA tej szynie) — karta W5-D p. 12
      (OD-24): ogranicznik na szynie, której uziemienia model nie zna, NIE
      dostaje wiersza z podstawioną wartością ``"isolated"`` (do W5-D most
      fabrykował tu ``neutral or "isolated"``); taka szyna trafia do
      ``ograniczniki_bez_uziemienia_sieci`` i blokuje gotowość koordynacji
      izolacji warunkiem nazwanym (``application/analyses/v126_gotowosc.py``).

    Deduplikacja per (szyna, ``catalog_ref``) — ograniczniki fazowe w jednym
    miejscu dają jedno wejście koordynacji. Kolejność deterministyczna
    (kolejność pól w modelu).
    """
    return _wejscia_izolacji(enm)[0]


def ograniczniki_bez_uziemienia_sieci(enm: EnergyNetworkModel) -> tuple[str, ...]:
    """``ref_id`` szyn z ogranicznikiem przepięć, dla których model nie niesie uziemienia
    punktu neutralnego (ani szyna, ani transformator) — wejście koordynacji izolacji
    NIE jest dla nich budowane (W5-D p. 12: zero podstawionego ``"isolated"``)."""
    return _wejscia_izolacji(enm)[1]


def braki_poziomu_izolacji(
    enm: EnergyNetworkModel, wiersze: list[V126InsulationInput]
) -> list[RekordBrakuPakietu]:
    """P2 (karta OD-17a): miejsca koordynacji izolacji bez poziomu izolacji udarowej
    chronionych aparatów z karty producenta — rekord na KAŻDY wiersz wejścia ``wiersze``,
    które solver faktycznie liczy (gotowość podaje wiersze z modelu, bieg — wiersze wejścia po
    danych projektanta; ta sama funkcja po obu stronach, predykaty parami).

    ``V126InsulationInput`` nie ma pola poziomu izolacji aparatów, a żaden typ katalogowy
    aparatu, kabla ani transformatora nie niesie poziomu BIL/LIWL pozycji (tylko klasę
    napięciową), więc margines ochrony solver V12.6 (rdzeń B-01) liczy wobec poziomu
    normowego IEC 60071-1 dla U_m — rekord ``BRAK_PODSTAWY``: wynik informacyjny wobec
    przyjętej wartości normowej, a nie wobec danych zainstalowanych aparatów.
    """
    szyny = {bus.ref_id: bus for bus in enm.buses}
    rekordy: list[RekordBrakuPakietu] = []
    for wiersz in wiersze:
        szyna = szyny.get(wiersz.location_bus_ref)
        rekordy.append(
            brak_karty_producenta(
                [
                    (
                        "poziom_izolacji_udarowej",
                        "znamionowy poziom izolacji udarowej piorunowej (BIL/LIWL) chronionych "
                        "aparatów",
                    )
                ],
                nazwa_elementu=(
                    nazwa_elementu(szyna, "buses") if szyna is not None else "szyna spoza modelu"
                ),
                rodzaj_elementu_pl="Szyna z ogranicznikiem przepięć",
                skutek_pl=(
                    "Margines ochrony ogranicznika liczony jest informacyjnie wobec poziomu "
                    "normowego IEC 60071-1 dla napięcia najwyższego urządzeń, a nie wobec "
                    "poziomu izolacji zainstalowanych aparatów."
                ),
                status="BRAK_PODSTAWY",
            ).rekord()
        )
    return rekordy


def _wejscia_izolacji(
    enm: EnergyNetworkModel,
) -> tuple[list[V126InsulationInput], tuple[str, ...]]:
    from network_model.catalog.mv_surge_arrester_catalog import get_all_surge_arrester_types

    catalog: dict[str, dict[str, Any]] = {
        str(record["id"]): record["params"] for record in get_all_surge_arrester_types()
    }
    bus_by_ref = {bus.ref_id: bus for bus in enm.buses}
    bez_uziemienia: list[str] = []

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
        # Bez karty ogranicznika poziom izolacji chronionych aparatów to napięcie najwyższe
        # SIECI U_s szyny z tabeli IEC 60038 (`napiecie_najwyzsze_sieci_kv` — ta sama tabela,
        # co odmowa poziomu izolacji operacji; dawny typoszereg 12/17,5/24/36 kV dawał sieci
        # 6 kV U_m = 12 kV zamiast 7,2 kV, a sieci 110 kV — 36 kV).
        u_s_kv = napiecie_najwyzsze_sieci_kv(bus.voltage_kv)
        if params is None and u_s_kv is None:
            # Ogranicznik nN (albo szyna bez napięcia lub poza tablicami IEC 60038) bez karty
            # katalogowej — poza zakresem koordynacji izolacji IEC 60071. Pomiń, aby nie
            # fabrykować U_m.
            return
        seen.add(dedup_key)
        doziemienie = _doziemienie_szyny_izolacji(enm, bus_ref)
        if doziemienie is None:
            # W5-D p. 12: brak uziemienia w modelu = brak wiersza, nie „isolated".
            if bus_ref not in bez_uziemienia:
                bez_uziemienia.append(bus_ref)
            return
        # Napięcie przepięcia dorywczego i poziom izolacji chronionych aparatów to cechy SIECI
        # szyny (U_s z IEC 60038); U_m karty ogranicznika — wyłącznie bez U_s szyny. Karta
        # ogranicznika niesie jego ZDOLNOŚĆ (U_c, U_r, U_res, wytrzymałość TOV 10 s) — dawniej
        # wytrzymałość TOV 10 s z karty wchodziła jako PRZEWIDYWANE przepięcie sieci.
        u_m_kv = u_s_kv if u_s_kv is not None else float(params["u_m_kv"]) if params else None
        if u_m_kv is None:
            return
        rows.append(
            V126InsulationInput(
                location_bus_ref=bus_ref,
                u_m_kv=u_m_kv,
                **_pola_doziemienia_izolacji(doziemienie),
                arrester_mcov_kv=float(params["mcov_kv"]) if params else None,
                arrester_rated_kv=float(params["u_rated_kv"]) if params else None,
                arrester_residual_10ka_kv=(
                    float(params["u_residual_at_10ka_kv"]) if params else None
                ),
                arrester_tov_10s_kv=float(params["tov_10s_kv"]) if params else None,
            )
        )

    # Ograniczniki przepięć pól — rekordy `bays` (jedyny nośnik pól, karta W5-B), dwa pola
    # rekordu: aparaty pierwotne pola (`Bay.primary_devices`, rodzaj SURGE_ARRESTER —
    # serializacja bezpośrednia / szablon) i typowana lista `Bay.surge_arresters` (operacja
    # `add_surge_arrester_sn`, G-STK-8; ten sam rekord czyta read-model pola — glif SLD).
    # Deduplikacja wspólna (`_emit`); kolejność: najpierw aparaty pierwotne wszystkich pól,
    # potem listy ograniczników (kolejność wierszy jak przed kartą W5-B).
    for bay in enm.bays:
        for device in bay.primary_devices:
            if device.kind == "SURGE_ARRESTER":
                _emit(bay.bus_ref, device.catalog_ref)
    for bay in enm.bays:
        for ogranicznik in bay.surge_arresters:
            _emit(bay.bus_ref, ogranicznik.catalog_ref)

    return rows, tuple(bez_uziemienia)


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


#: Rodzaje generatora, dla których V12.6 buduje wejście przekształtnika/źródła
#: harmonicznego = kanoniczny zbiór `enm.models.GEN_TYPES_PRZEKSZTALTNIKOWE` (karta
#: AB-H0 Pakiet D: dawna lokalna kopia pomijała `wind_inverter` — turbina z pełnym
#: przekształtnikiem znikała z analiz V12.6 bez kodu). `build_v126_input_from_enm`,
#: `pominiete_zrodla_v126` i `generatory_przeksztaltnikowe_v126` czytają TEN obiekt
#: (reguła KLASA §3; parytet: `tests/enm/test_gen_types_przeksztaltnikowe.py`).


def generatory_przeksztaltnikowe_v126(enm: EnergyNetworkModel) -> list[str]:
    """Referencje generatorów PV/BESS/wiatrowych (kandydatów przekształtnika/
    źródła harmonicznego V12.6) modelu — używane przez `api/v126_academic.py`
    do listy generatorów w komunikacie 422, kiedy ŻADEN z nich nie ma danych
    (ten sam zbiór `GEN_TYPES_PRZEKSZTALTNIKOWE`, co budowa wejścia)."""
    return [g.ref_id for g in enm.generators if g.gen_type in GEN_TYPES_PRZEKSZTALTNIKOWE]


@dataclass(frozen=True)
class WidmaJawne:
    """Jawne widma harmoniczne projektanta po walidacji.

    ``widma`` = widma przyjęte W CAŁOŚCI {generator_ref: {rząd: %}};
    ``odrzucone`` = {generator_ref: powód} — widmo z choćby jednym błędnym wpisem jest
    odrzucane W CAŁOŚCI z nazwanym powodem (zero częściowego czyszczenia: widmo bez
    jednej harmonicznej to INNE widmo niż podane, a różnica nie byłaby nigdzie widoczna).
    """

    widma: dict[str, dict[int, float]]
    odrzucone: dict[str, str]


def _blad_wpisu_widma(rzad: object, procent: object) -> str | None:
    """Powód odrzucenia jednego wpisu `{rząd: %}` albo `None` (wpis poprawny)."""
    if isinstance(procent, bool):
        return f"rząd {rzad!r}: wartość logiczna {procent!r} zamiast procentu"
    try:
        rzad_i = int(str(rzad))
        procent_f = float(procent)  # type: ignore[arg-type]  # dowolny wpis JSON
    except (TypeError, ValueError):
        return f"wpis {rzad!r}: {procent!r} nie jest parą liczb (rząd, procent)"
    if rzad_i < 2 or rzad_i > 50:
        return f"rząd {rzad_i} poza zakresem 2…50"
    if not 0.0 <= procent_f <= 100.0:
        return f"rząd {rzad_i}: {procent_f} % poza zakresem 0…100 %"
    return None


def _widma_jawne_z_parametrow(parameters: dict[str, Any] | None) -> WidmaJawne:
    """Jawne widma harmoniczne z wejścia projektanta (`V126RunRequest.parameters.
    harmonic_spectra: {generator_ref: {rząd: %}}`, wzorzec OD-15(a) „nastawy jako
    wejście jawne") — proweniencja RECZNE (jedyne źródło widma wejścia V12.6).
    Widmo z choćby jednym wpisem źle ukształtowanym (rząd/wartość nienumeryczne, rząd
    poza 2..50, procent poza 0..100) jest ODRZUCANE W CAŁOŚCI z powodem wymieniającym
    każdy błędny wpis — generator wraca do stanu „brak widma" (kod
    `generator.harmonic_spectrum_missing` z tym powodem), nigdy nie dostaje widma
    połowicznie wyczyszczonego bez ostrzeżenia."""
    widma: dict[str, dict[int, float]] = {}
    odrzucone: dict[str, str] = {}
    if not isinstance(parameters, dict):
        return WidmaJawne(widma, odrzucone)
    surowe = parameters.get("harmonic_spectra")
    if not isinstance(surowe, dict):
        return WidmaJawne(widma, odrzucone)
    for generator_ref, widmo in surowe.items():
        if not isinstance(generator_ref, str):
            continue
        if not isinstance(widmo, dict) or not widmo:
            odrzucone[generator_ref] = "widmo ręczne puste albo nie jest mapą {rząd: %}"
            continue
        bledy = [
            blad
            for rzad, procent in widmo.items()
            if (blad := _blad_wpisu_widma(rzad, procent)) is not None
        ]
        rzedy = [int(str(rzad)) for rzad in widmo] if not bledy else []
        bledy += [f"rząd {r} podany wielokrotnie" for r in sorted(set(rzedy)) if rzedy.count(r) > 1]
        if bledy:
            odrzucone[generator_ref] = "; ".join(bledy)
            continue
        widma[generator_ref] = {int(str(rzad)): float(procent) for rzad, procent in widmo.items()}
    return WidmaJawne(widma, odrzucone)


@dataclass(frozen=True)
class OcenaKartyPrzeksztaltnika:
    """Ocena karty katalogowej JEDNEGO generatora przekształtnikowego (PV/BESS/
    wiatrowego) dla wejścia V12.6 — JEDNO źródło prawdy dla decyzji WŁĄCZ/POMIŃ,
    używane RÓWNOCZEŚNIE przez `build_v126_input_from_enm` (buduje wejście
    solvera) i `pominiete_zrodla_v126`/`api/v126_academic.py` (tłumaczą
    pominięcia w odpowiedzi 422/`pominiete_zrodla`) — reguła KLASA §3
    (predykaty parami z JEDNEGO źródła prawdy), żeby obie strony nigdy się nie
    rozjechały (to dokładnie ta klasa błędu, którą przegląd 2026-08-01 znalazł
    cztery razy)."""

    generator_ref: str
    card: dict[str, Any]
    rated_mva: float | None
    mode: str
    control_mode: str | None
    droop_p_f_percent: float | None
    droop_q_u_percent: float | None
    converter_kod: str | None
    converter_powod: str | None
    spectrum: dict[int, float] | None
    spectrum_provenance: str | None
    spectrum_kod: str | None
    spectrum_powod: str | None
    #: Karta OD-17a: brak widma z karty producenta (źródło bez karty widmowej i bez widma
    #: ręcznego) — nazwana odmowa braku pakietu kart producentów; `spectrum_powod` = jej zdanie.
    odmowa_widma: RekordBrakuPakietu | None = None


def odmowa_braku_widma(generator: Any) -> RekordBrakuPakietu:
    """P2: przekształtnik bez widma harmonicznych z karty producenta — JEDNA nazwana odmowa
    (kod ``BRAK_KARTY_PRODUCENTA:widmo_harmoniczne``) dla wejścia V12.6 i jego gotowości."""
    return brak_karty_producenta(
        [("widmo_harmoniczne", "widmo prądu harmonicznych przekształtnika")],
        nazwa_elementu=nazwa_elementu(generator, "generators"),
        rodzaj_elementu_pl="Źródło",
        skutek_pl=(
            "Przekształtnik nie wchodzi do analizy harmonicznych jako źródło odkształcające; "
            "widmo można też podać ręcznie w oknie analizy."
        ),
    ).rekord()


def _oceb_karte_przeksztaltnika(
    generator: Any, jawne_widma: WidmaJawne
) -> OcenaKartyPrzeksztaltnika:
    """Ocena karty katalogowej jednego generatora PV/BESS/wiatrowego — zero
    fabrykacji: każda wielkość pochodzi z `generator.materialized_params`
    (karta katalogowa `ConverterType` materializowana przez `MaterializationContract`)
    albo z jawnego wejścia projektanta; brak w obu miejscach zostaje `None` +
    kod gotowości nazwany po polsku, nigdy zaszytą liczbą wspólną dla wszystkich
    przekształtników."""
    card = generator.materialized_params or {}
    ref = generator.ref_id
    if not card:
        return OcenaKartyPrzeksztaltnika(
            generator_ref=ref,
            card={},
            rated_mva=None,
            mode="GFL",
            control_mode=None,
            droop_p_f_percent=None,
            droop_q_u_percent=None,
            converter_kod="generator.converter_card_missing",
            converter_powod=(
                "Generator nie ma żadnego powiązania z katalogiem przekształtników "
                "— brak danych karty (napięcie, moc znamionowa, tryb regulacji)."
            ),
            spectrum=None,
            spectrum_provenance=None,
            spectrum_kod="generator.harmonic_spectrum_missing",
            spectrum_powod="Generator nie ma karty katalogowej — widmo harmoniczne nieznane.",
        )

    # Moc znamionowa: WYŁĄCZNIE z karty (`sn_mva` — pole materializowane z
    # `ConverterType.sn_mva`, kontrakt CONVERTER; `s_n_kva` jako zapasowy klucz
    # dla generatorów materializowanych z innego namespace'u katalogowego —
    # ZRODLO_NN_PV/ZRODLO_NN_BESS, gdzie karta niesie moc w kVA, nie w MVA).
    # Brak w OBU miejscach => `None`, NIGDY `max(P, 0,1 MVA)` — sufit z powietrza
    # udawał tabliczkę znamionową przekształtnika.
    rated_mva = _liczba_lub_none(card.get("sn_mva"))
    if rated_mva is None or rated_mva <= 0:
        s_n_kva = _liczba_lub_none(card.get("s_n_kva"))
        rated_mva = kva_na_mva(s_n_kva) if s_n_kva is not None and s_n_kva > 0 else None

    # Tryb: grid-forming z KARTY (pole istniejące `control_mode`, wartość
    # "GRID_FORMING" — mv_converter_catalog.py:726,1047,1066), nigdy z rodzaju
    # źródła. Brak deklaracji GFM w karcie => grid-following: to WŁASNOŚĆ karty
    # (przekształtnik bez zadeklarowanej zdolności tworzenia napięcia pracuje
    # jako podążający za siecią), nie domysł z `gen_type`.
    control_mode = card.get("control_mode")
    control_mode = control_mode if isinstance(control_mode, str) else None
    mode = "GFL" if control_mode != "GRID_FORMING" else "GFM_droop"

    # Droop: WYŁĄCZNIE z karty, WYŁĄCZNIE dla trybu grid-forming (statyzm P/f i
    # Q/U jest własnością regulatora GFM — dla GFL kontrakt niesie `None`, jak
    # przed tą kartą; naprawiona jest tylko ZASZYTA WARTOŚĆ 4,0/3,0 wspólna dla
    # każdego przekształtnika GFM, nie sama reguła bramkowania trybem).
    droop_p_f = _liczba_lub_none(card.get("droop_p_f_percent")) if mode != "GFL" else None
    droop_q_u = _liczba_lub_none(card.get("droop_q_u_percent")) if mode != "GFL" else None

    converter_kod: str | None = None
    converter_powod: str | None = None
    if rated_mva is None:
        converter_kod = "generator.converter_card_missing"
        converter_powod = (
            "Karta katalogowa przekształtnika nie niesie mocy znamionowej (Sn) — "
            "przekształtnik pominięty w wejściu V12.6."
        )

    # Widmo WYŁĄCZNIE z jawnego wejścia projektanta. Karta katalogowa przekształtnika
    # nie niesie widma (pole `harmonic_spectrum_percent` skasowane — karta AB-H0 §0.5),
    # więc odczyt klucza z `materialized_params` czytałby wyłącznie wartość wstrzykniętą
    # mimo katalogu — tor skasowany u źródła, nie osłonięty.
    widmo_reczne = jawne_widma.widma.get(ref)
    odmowa_widma: RekordBrakuPakietu | None = None
    if widmo_reczne:
        spectrum: dict[int, float] | None = widmo_reczne
        spectrum_provenance: str | None = "RECZNE"
        spectrum_kod: str | None = None
        spectrum_powod: str | None = None
    elif ref in jawne_widma.odrzucone:
        spectrum = None
        spectrum_provenance = None
        spectrum_kod = "generator.harmonic_spectrum_missing"
        spectrum_powod = (
            "Widmo ręczne przekształtnika odrzucone w całości — "
            f"{jawne_widma.odrzucone[ref]}. Popraw widmo w oknie analizy."
        )
    elif generator.modele_widmowe is not None and generator.modele_widmowe.zrodla:
        # Źródło MA kartę widmową (dane producenta są w modelu), ale wejście audytowe V12.6
        # przyjmuje wyłącznie widmo ręczne — to nie jest brak danych pakietu właściciela.
        spectrum = None
        spectrum_provenance = None
        spectrum_kod = "generator.harmonic_spectrum_missing"
        spectrum_powod = (
            "Źródło ma przypisaną kartę widmową, ale wejście analizy audytowej przyjmuje "
            "wyłącznie widmo podane ręcznie — podaj widmo w oknie analizy."
        )
    else:
        spectrum = None
        spectrum_provenance = None
        spectrum_kod = "generator.harmonic_spectrum_missing"
        odmowa_widma = odmowa_braku_widma(generator)
        spectrum_powod = odmowa_widma.komunikat_pl

    return OcenaKartyPrzeksztaltnika(
        generator_ref=ref,
        card=card,
        rated_mva=rated_mva,
        mode=mode,
        control_mode=control_mode,
        droop_p_f_percent=droop_p_f,
        droop_q_u_percent=droop_q_u,
        converter_kod=converter_kod,
        converter_powod=converter_powod,
        spectrum=spectrum,
        spectrum_provenance=spectrum_provenance,
        spectrum_kod=spectrum_kod,
        spectrum_powod=spectrum_powod,
        odmowa_widma=odmowa_widma,
    )


@dataclass(frozen=True)
class OdbiorcyZParametrow:
    """Liczba odbiorców zasilanych z szyn, odczytana z wejścia projektanta.

    ``liczby`` = poprawne wpisy {ref szyny: liczba odbiorców ≥ 0};
    ``bledne`` = wpisy odrzucone (wartość nie jest liczbą całkowitą ≥ 0), nazwane
    kluczem — gotowość (`v126_gotowosc._warunki_niezawodnosci`) odmawia biegu, gdy
    lista nie jest pusta, więc żaden odrzucony wpis nie znika po cichu.
    """

    liczby: dict[str, int]
    bledne: tuple[str, ...]


def odbiorcy_z_parametrow(parameters: dict[str, Any] | None) -> OdbiorcyZParametrow:
    """Parametr `customer_counts` (`{ref szyny: liczba odbiorców}`) — karta B-02.

    Model ENM NIE niesie liczby odbiorców zasilanych z szyny (żaden element modelu
    nie ma takiego pola), a wskaźniki SAIDI/SAIFI/CAIDI analizy niezawodności są
    tą liczbą ważone. Do tej karty most wpisywał 0 odbiorców na każdej szynie,
    więc solver liczył wskaźniki „bez odbiorców" — zera z braku danych, nie z
    pomiaru. Liczba odbiorców wchodzi WYŁĄCZNIE jawnym wejściem projektanta;
    ta funkcja jest JEDYNYM miejscem odczytu (most buduje `customer_count`
    szyn, gotowość ocenia ten sam odczyt — predykaty parami)."""
    if not isinstance(parameters, dict):
        return OdbiorcyZParametrow({}, ())
    surowe = parameters.get("customer_counts")
    if not isinstance(surowe, dict):
        return OdbiorcyZParametrow({}, ())
    liczby: dict[str, int] = {}
    bledne: list[str] = []
    for ref, liczba in surowe.items():
        klucz = str(ref)
        if isinstance(liczba, bool) or not isinstance(liczba, int | float):
            bledne.append(klucz)
            continue
        if float(liczba) < 0 or float(liczba) != int(liczba):
            bledne.append(klucz)
            continue
        liczby[klucz] = int(liczba)
    return OdbiorcyZParametrow(liczby, tuple(bledne))


def _impedancja_zrodla_szyny(
    enm: EnergyNetworkModel, bus_ref: str, bus_kv: float, wyspy_nn: dict[str, WyspaNn]
) -> dict[str, float]:
    """Z_Q zasilania systemowego szyny z JEDYNEGO źródła prawdy impedancji źródła
    (`enm.mapping.impedancja_zrodla_sieciowego`, IEC 60909-0:2016 §6.2.1 eq. 6, scenariusz
    MAX) — kilka źródeł na szynie łączy się równolegle. Szyna bez źródła albo źródło bez
    danych impedancji → brak pól (solver nie dostaje liczby zastępczej)."""
    admitancja = 0j
    for source in enm.sources:
        if source.bus_ref != bus_ref:
            continue
        wyspa = wyspy_nn.get(bus_ref)
        wynik = impedancja_zrodla_sieciowego(
            source,
            bus_kv,
            "MAX",
            tolerancja_nn=None if wyspa is None else wyspa.tolerancja,
            tolerancja_nn_robocza=wyspa is not None and wyspa.robocza,
        )
        if wynik is not None and abs(wynik[0]) > 0.0:
            admitancja += 1.0 / wynik[0]
    if admitancja == 0j:
        return {}
    z_q = 1.0 / admitancja
    return {"source_r_ohm": max(z_q.real, 0.0), "source_x_ohm": z_q.imag}


#: Kod maszynowy odmowy parametru ``reliability_data`` (pole odmowy, nie treść zdania).
KOD_DANE_NIEZAWODNOSCI_NIEPOPRAWNE = "v126.dane_niezawodnosci_niepoprawne"


def niezawodnosc_z_parametrow(
    parameters: dict[str, Any] | None,
    nazwy_elementow: Mapping[str, str],
) -> dict[str, dict[str, float]]:
    """Parametr ``reliability_data`` (`{ref elementu: {failure_rate_per_year, mttr_h}}`) —
    wartości projektanta zastępujące wartości robocze rejestru niezawodności (zasada nr 4
    pkt 3). Intensywność uszkodzeń jest CAŁKOWITA dla elementu [1/rok] (nie na km).

    ``nazwy_elementow`` — indeks ``ref → nazwa pokazywana`` modelu (`enm.nazwy_elementow`): zdanie
    odmowy nazywa element nazwą z modelu, identyfikator i pole idą w ``dane`` odmowy.

    Raises:
        OdmowaNazwana: wpis niebędący liczbą nieujemną (kod
            ``v126.dane_niezawodnosci_niepoprawne``) — zdanie nazywa element i pole.
    """
    if not isinstance(parameters, dict):
        return {}
    surowe = parameters.get("reliability_data")
    if not isinstance(surowe, dict):
        return {}
    nazwy = {"failure_rate_per_year": "intensywność uszkodzeń", "mttr_h": "czas odnowy"}
    wynik: dict[str, dict[str, float]] = {}
    for ref, wpis in surowe.items():
        nazwa = nazwy_elementow.get(str(ref), "spoza modelu")
        if not isinstance(wpis, dict):
            raise OdmowaNazwana(
                f"Dane niezawodności elementu {nazwa} muszą podawać intensywność uszkodzeń "
                "i czas odnowy.",
                kod=KOD_DANE_NIEZAWODNOSCI_NIEPOPRAWNE,
                dane={"ref": str(ref)},
            )
        wartosci: dict[str, float] = {}
        for pole, nazwa_pl in nazwy.items():
            if pole not in wpis:
                continue
            liczba = wpis[pole]
            if isinstance(liczba, bool) or not isinstance(liczba, int | float) or liczba < 0:
                raise OdmowaNazwana(
                    f"Dane niezawodności elementu {nazwa}: {nazwa_pl} musi być liczbą "
                    "nieujemną.",
                    kod=KOD_DANE_NIEZAWODNOSCI_NIEPOPRAWNE,
                    dane={"ref": str(ref), "pole": pole},
                )
            wartosci[pole] = float(liczba)
        wynik[str(ref)] = wartosci
    return wynik


class _NiezawodnoscGalezi:
    """λ i czas odnowy gałęzi: wartość projektanta (``reliability_data``) albo wartość robocza
    rejestru (`wartosci_robocze.PROPOZYCJE_NIEZAWODNOSCI`) — dane przyjęte zbiera ta sama
    klasa, która podstawia wartość (predykaty parami: dana przyjęta ⇔ wartość robocza).
    Powód danej przyjętej wylicza elementy NAZWĄ z modelu (tekst czyta projektant)."""

    def __init__(self, projektant: dict[str, dict[str, float]]) -> None:
        self._projektant = projektant
        self._robocze: dict[tuple[str, str], list[str]] = {}

    def galaz(
        self, ref: str, nazwa: str, rodzaj: str, dlugosc_km: float | None
    ) -> dict[str, float | None]:
        propozycja = PROPOZYCJE_NIEZAWODNOSCI[element_niezawodnosci(rodzaj)]
        wpis = self._projektant.get(ref, {})
        lam: float | None
        if "failure_rate_per_year" in wpis:
            lam = wpis["failure_rate_per_year"]
        elif not propozycja.na_km:
            lam = propozycja.intensywnosc_uszkodzen
            self._robocze.setdefault((propozycja.element, "lambda"), []).append(nazwa)
        elif dlugosc_km is None:
            # Wartość robocza na km bez długości odcinka nie daje liczby — nazwany brak
            # (gałąź poza wskaźnikami, `elementy_bez_danych_niezawodnosci`), nie λ na 1 km.
            lam = None
        else:
            lam = propozycja.intensywnosc_uszkodzen * dlugosc_km
            self._robocze.setdefault((propozycja.element, "lambda"), []).append(nazwa)
        if "mttr_h" in wpis:
            mttr = wpis["mttr_h"]
        else:
            mttr = propozycja.czas_odnowy_h
            self._robocze.setdefault((propozycja.element, "mttr"), []).append(nazwa)
        return {"failure_rate_per_year": lam, "mttr_h": mttr}

    def dane_przyjete(self) -> list[DanaPrzyjeta]:
        wynik: list[DanaPrzyjeta] = []
        for element, propozycja in PROPOZYCJE_NIEZAWODNOSCI.items():
            for wielkosc in ("lambda", "mttr"):
                nazwy = self._robocze.get((element, wielkosc))
                if not nazwy:
                    continue
                if wielkosc == "lambda":
                    nazwa = f"Intensywność uszkodzeń — {propozycja.nazwa_pl}"
                    wartosc = Wielkosc(
                        wartosc=propozycja.intensywnosc_uszkodzen,
                        jednostka=propozycja.jednostka_intensywnosci,
                    )
                else:
                    nazwa = f"Czas odnowy zasilania — {propozycja.nazwa_pl}"
                    wartosc = Wielkosc(wartosc=propozycja.czas_odnowy_h, jednostka="h")
                wynik.append(
                    DanaPrzyjeta(
                        nazwa_pl=nazwa,
                        wartosc=wartosc,
                        powod_pl=(
                            f"Model nie niesie danych niezawodnościowych elementów "
                            f"({len(nazwy)}: {', '.join(sorted(nazwy))}) — przyjęto wartość "
                            f"roboczą rejestru ({propozycja.odniesienie}); projektant podaje "
                            "własną w danych niezawodności analizy."
                        ),
                        jakosc=FieldQuality.ESTIMATED,
                    )
                )
        return wynik


def pominiete_zrodla_v126(
    enm: EnergyNetworkModel, *, parameters: dict[str, Any] | None = None
) -> list[dict[str, Any]]:
    """Generatory PV/BESS/wiatrowe pominięte (całkowicie albo tylko co do widma
    harmonicznych) w wejściu V12.6 — TA SAMA ocena karty co
    `build_v126_input_from_enm` (`_oceb_karte_przeksztaltnika`, JEDNO źródło
    prawdy, reguła KLASA §3), więc odpowiedź API nigdy nie rozjedzie się z tym,
    co faktycznie trafiło do modelu solvera. Używane przez `api/v126_academic.py`
    do bramki 422 (żadne źródło nie ma danych) i pola `pominiete_zrodla`
    (część ma dane). Zwraca listę `{ref, kod, powod}` — pusta, gdy wszystkie
    kandydujące generatory mają kompletne dane. Pominięcie z braku widma w karcie producenta
    niesie dodatkowo `odmowa_pakietu` (rekord nazwanej odmowy braku pakietu, karta OD-17a)."""
    jawne_widma = _widma_jawne_z_parametrow(parameters)
    wynik: list[dict[str, Any]] = []
    for generator in enm.generators:
        if generator.gen_type not in GEN_TYPES_PRZEKSZTALTNIKOWE:
            continue
        ocena = _oceb_karte_przeksztaltnika(generator, jawne_widma)
        if ocena.converter_kod is not None:
            wynik.append(
                {
                    "ref": ocena.generator_ref,
                    "kod": ocena.converter_kod,
                    "powod": ocena.converter_powod or "",
                }
            )
        elif ocena.spectrum_kod is not None:
            wpis: dict[str, Any] = {
                "ref": ocena.generator_ref,
                "kod": ocena.spectrum_kod,
                "powod": ocena.spectrum_powod or "",
            }
            if ocena.odmowa_widma is not None:
                wpis["odmowa_pakietu"] = ocena.odmowa_widma.model_dump(mode="json")
            wynik.append(wpis)
    return wynik


def build_v126_input_from_enm(
    enm: EnergyNetworkModel,
    *,
    parameters: dict[str, Any] | None = None,
    analysis_type: V126AnalysisType | None = None,
) -> V126AcademicInput:
    """Wejście solvera V12.6 z modelu. ``analysis_type`` z `ANALIZY_UZIEMIENIA_SN` dokłada
    uziemienie sieci SN z modelu (`uziemienie_sn_v126`); pozostałe analizy go nie niosą."""
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
    wyspy_nn = wyspy_wezlow_nn(enm)

    jawne_widma = _widma_jawne_z_parametrow(parameters)
    # Karta B-02: liczba odbiorców szyny z jawnego parametru projektanta
    # (`customer_counts`), bo model jej nie niesie; brak wpisu = 0 (gotowość
    # niezawodności odmawia biegu przy sumie zerowej, więc 0 nie jest domysłem).
    odbiorcy_szyn = odbiorcy_z_parametrow(parameters).liczby
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
        if generator.gen_type in GEN_TYPES_PRZEKSZTALTNIKOWE:
            # Karta W2-C (zero fabrykacji wejścia V12.6): moc znamionowa, tryb
            # (GFL/GFM) i statyzmy droop pochodzą WYŁĄCZNIE z karty katalogowej
            # przekształtnika, widmo harmoniczne — WYŁĄCZNIE z jawnego wejścia
            # projektanta (`_oceb_karte_przeksztaltnika`
            # — JEDNO źródło prawdy dzielone z `pominiete_zrodla_v126`, reguła
            # KLASA §3). Brak karty w ogóle ALBO brak mocy znamionowej w karcie
            # => przekształtnik POMINIĘTY z wejścia V12.6 w całości (kod
            # `generator.converter_card_missing`, bramkowane przed solverem w
            # `api/v126_academic.py`) — nie `max(P, 0,1 MVA)`.
            ocena = _oceb_karte_przeksztaltnika(generator, jawne_widma)
            if ocena.converter_kod is not None:
                continue
            card = ocena.card

            # SSCI / Z_conv(f) card fields flow from the converter's ConverterType
            # catalog card (materialized into the generator's solver params). No
            # fabrication: a field absent from the card stays None and the SSCI
            # solver surfaces it as missing-data.
            def _card_float(key: str, _card: dict[str, Any] = card) -> float | None:
                value = _card.get(key)
                return float(value) if value is not None else None

            rated_kv = _card_float("un_kv")
            converters.append(
                V126ConverterInput(
                    ref=generator.ref_id,
                    bus_ref=generator.bus_ref,
                    mode=ocena.mode,
                    rated_mva=ocena.rated_mva,
                    droop_p_f_percent=ocena.droop_p_f_percent,
                    droop_q_u_percent=ocena.droop_q_u_percent,
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
            # a nie powod do przyjecia napiecia z powietrza. Widmo (`ocena.spectrum`)
            # jest `None`, gdy projektant nie podal go recznie (karta katalogowa widma
            # nie niesie) — zrodlo NIE WCHODZI do wejscia (kod
            # `generator.harmonic_spectrum_missing`), zamiast dostac zaszyte widmo
            # wspolne dla kazdego przeksztaltnika (fabrykacja usunieta ta karta).
            un_kv = napiecie_szyny_kv.get(generator.bus_ref)
            if (
                ocena.spectrum is not None
                and ocena.spectrum_provenance is not None
                and ocena.rated_mva is not None  # zawsze prawda po `converter_kod is None`
                and un_kv is not None
                and un_kv > 0
            ):
                harmonic_sources.append(
                    V126HarmonicSourceInput(
                        bus_ref=generator.bus_ref,
                        source_ref=generator.ref_id,
                        base_current_a=prad_roboczy_a(ocena.rated_mva, un_kv),
                        spectrum_percent=ocena.spectrum,
                        spectrum_provenance=ocena.spectrum_provenance,
                    )
                )

    # Impedancja zastępcza szyn — wyłącznie dla analiz, które ją czytają (graf IR i macierz
    # Z-bus nie są budowane dla pozostałych analiz V12.6; ich wejście bez zmian).
    zastepcze = (
        impedancje_zastepcze_szyn(enm) if analysis_type in ANALIZY_IMPEDANCJI_ZASTEPCZEJ else {}
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
            customer_count=odbiorcy_szyn.get(bus.ref_id, 0),
            fault_level_mva=next(
                (source.sk3_mva for source in enm.sources if source.bus_ref == bus.ref_id), None
            ),
            **_impedancja_zrodla_szyny(enm, bus.ref_id, bus.voltage_kv, wyspy_nn),
            **zastepcze.get(bus.ref_id, {}),
        )
        for bus in enm.buses
    ]

    branches: list[V126BranchInput] = []
    napiecia_szyn = napiecia_szyn_kv(enm)
    niezawodnosc = _NiezawodnoscGalezi(
        niezawodnosc_z_parametrow(parameters, zbuduj_indeks_nazw(enm))
    )
    for branch in enm.branches:
        if getattr(branch, "status", "closed") == "open":
            is_open = True
        else:
            is_open = False
        if isinstance(branch, OverheadLine | Cable):
            # `length_km`, `r_ohm_per_km`, `x_ohm_per_km` sa polami WYMAGANYMI
            # modeli `OverheadLine`/`Cable`, wiec czytamy je wprost. Do tej karty
            # staly tu `getattr(..., 1.0 / 0.18 / 0.12)`; te wartosci zapasowe byly
            # NIEOSIAGALNE (pydantic nie dopusci obiektu bez pola wymaganego), a
            # mimo to czytalo sie je jak zadeklarowane zalozenie projektowe.
            # Martwa wartosc zapasowa jest grozniejsza niz brak: wyglada na
            # zabezpieczenie, wiec wylacza czujnosc.
            length_km = float(branch.length_km)
            b0_per_km = skladowa_zerowa_galezi(
                branch, napiecia_szyn.get(branch.from_bus_ref)
            ).b0_s_per_km
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
                    **niezawodnosc.galaz(
                        branch.ref_id, nazwa_elementu(branch, "branches"), branch.type, length_km
                    ),
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
                    **niezawodnosc.galaz(
                        branch.ref_id, nazwa_elementu(branch, "branches"), branch.type, None
                    ),
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

    # Częstotliwość studium z nagłówka modelu — to samo pole, z którego mapowanie ENM → IR
    # i prawda o uziemieniu sieci (B_0 baterii) liczą admitancje; dawniej częstotliwość
    # pierwszej szyny albo domyślne 50 Hz (druga prawda o częstotliwości).
    czestotliwosc_hz = float(enm.header.defaults.frequency_hz)
    return V126AcademicInput(
        base_frequency_hz=czestotliwosc_hz,
        buses=buses,
        branches=branches,
        transformers=transformers,
        harmonic_sources=harmonic_sources,
        converters=converters,
        insulation=build_v126_insulation_from_enm(enm),
        parameters=parameters or {},
        uziemienie_sn=(uziemienie_sn_v126(enm) if analysis_type in ANALIZY_UZIEMIENIA_SN else None),
        dane_przyjete_niezawodnosci=niezawodnosc.dane_przyjete(),
        # Karta UX-04/POLE-BKR-MODEL: baterie kondensatorów z susceptancją zerową względem
        # ziemi (gwiazda uziemiona wnosi prąd pojemnościowy doziemienia, pozostałe układy nie).
        shunt_capacitors=[
            V126ShuntCapacitorInput(
                ref=bateria.ref_id,
                bus_ref=bateria.bus_ref,
                uklad_polaczen=str(parametry_baterii(bateria)[PARAMETR_BATERII_UKLAD].wartosc),
                # B_0 z jedynej prawdy o uziemieniu sieci (`b0_baterii_s`) — ta sama liczba,
                # którą `uziemienie_sieci` dokłada do I_C sieci baterii.
                b0_siemens=b0_baterii_s(enm, bateria),
                is_open=bateria.status == "open",
            )
            for bateria in sorted(enm.shunt_capacitors, key=lambda b: b.ref_id)
        ],
    )
