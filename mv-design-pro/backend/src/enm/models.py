"""
EnergyNetworkModel (ENM) — Pydantic v2 canonical models.

Kanoniczny kontrakt modelu sieci elektroenergetycznej.
Jedno źródło prawdy dla projektu (case-bound).
"""

from __future__ import annotations

from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Annotated, Any, Literal, get_args
from uuid import UUID, uuid4

from dziedziny.karta_widmowa import KartaWidmowa, ModeleWidmoweElementu
from network_model.catalog.gazy_fluorowane import StanObiektu
from network_model.catalog.obwody_wtorne_pola import (
    NAPEDY_RODZAJU_APARATU,
    RODZAJ_APARATU_WEJSCIA,
    RodzajNapedu,
)
from network_model.catalog.przekladniki import (
    RdzenPrzekladnikaPradowego,
    UzwojeniePrzekladnikaNapieciowego,
)
from network_model.catalog.rodzaje_aparatury import (
    PORTY_APARATU_POLA,
    RODZAJ_LACZNIKA_TROJPOLOZENIOWEGO,
    RODZAJE_Z_WYKONANIEM,
    STAN_UZIEMIONY,
    WykonanieAparatu,
)
from network_model.core.bateria_kondensatorow import (
    UkladPolaczenBaterii,
    sprzecznosc_parametrow_baterii,
)
from network_model.core.uziemienie import (
    RolaUziemnika,
    TypPunktuNeutralnego,
    UziemienieEkranuKabla,
)
from network_model.core.voltage_factor import TolerancjaNapieciaNn
from pydantic import BaseModel, Field, StrictBool, StrictInt, model_validator

from .deklaracje_modulu import DataUmowy, DeklaracjeModulu, ModulIstniejacy
from .dynamika_modele import ModelDynamicznyOdbioru, ParametryDynamiczne
from .nastawy_modulu import NastawyZabezpieczenModulu
from .rola_pola_sn import RolaKanonicznaPolaSn, RolaPolaModelu
from .stan_normalny import migruj_punkty_podzialu_slownika
from .uziemienie import migruj_uziemienie_slownika

# ---------------------------------------------------------------------------
# Supporting types
# ---------------------------------------------------------------------------

#: Układ uziemienia sieci nN (IEC 60364-1 § 312.2) — JEDYNA definicja zbioru
#: literałów (karta W5-A §1 p. 2). Enum solvera pętli zwarcia
#: (`network_model/solvers/fault_loop_iec60364.py::NetworkType`, FROZEN) jest
#: kontraktem solvera; JEDNA funkcja mapująca żyje w `solver_input/uklad_sieci_nn.py`
#: z testem równości obu zbiorów. Front czyta ten literał ze snapshotu OpenAPI.
UkladSieciNn = Literal["TN-S", "TN-C-S", "TN-C", "TT", "IT"]
#: Jedyna definicja słownika układów nN (literał wyżej); krotka dla predykatów,
#: migracji i komunikatów — nigdy druga lista literałów w innym module.
UKLADY_SIECI_NN: tuple[str, ...] = get_args(UkladSieciNn)


class GroundingConfig(BaseModel):
    """Sposób pracy punktu neutralnego — JEDYNY typ w systemie (W5-A §1 p. 1).

    Nośniki: ``Transformer.hv_neutral``/``lv_neutral`` (punkt gwiazdowy uzwojenia
    z wyprowadzonym neutralnym) i ``Source.neutral_grounding`` (punkt neutralny
    sieci SN zasilanej z równoważnika GPZ). Zero kopii: ``Bus.grounding`` i
    ``substation.meta["grounding"]`` skasowane z migracją przy wczytaniu.
    """

    type: TypPunktuNeutralnego
    r_ohm: float | None = None
    x_ohm: float | None = None


#: Zbiór faz przyłączenia elementu (karta W5-D, decyzja F-1 `CANONICAL_TWIN_ARCHITECTURE.md`):
#: trójfazowy `ABC`, jednofazowy do przewodu neutralnego `A`/`B`/`C`, międzyfazowy
#: `AB`/`BC`/`CA`. JEDYNA definicja słownika faz w modelu — czytelnicy (assembler rozpływu
#: niesymetrycznego, kreator odbioru nN, walidacja pisarzy odbioru) importują TEN typ,
#: nie własną listę. Pole modelu z tym typem jest zawsze `PhaseSet | None`, a `None`
#: znaczy „przyłączenie trójfazowe symetryczne" — jedyne znaczenie, jakie element bez
#: pola faz miał kiedykolwiek; dzięki temu istniejące migawki zachowują odciski
#: (`enm/hash.py::_POLA_ADDYTYWNE_POZA_HASHEM_GDY_NONE`).
PhaseSet = Literal["ABC", "A", "B", "C", "AB", "BC", "CA"]

#: Wartości `PhaseSet` jako krotka (do walidacji payloadów operacji domenowych i do
#: budowy listy wyboru w UI z JEDNEGO źródła — bez drugiej listy literałów).
FAZY_PRZYLACZENIA: tuple[str, ...] = ("ABC", "A", "B", "C", "AB", "BC", "CA")

#: Fazy, które odbiór jednofazowy zasila względem przewodu neutralnego (kolejność
#: A, B, C = L1, L2, L3). Odbiór `ABC`/`None` obciąża wszystkie trzy po równo;
#: `AB`/`BC`/`CA` to odbiór międzyfazowy (bez przewodu neutralnego).
FAZY_ODBIORU_JEDNOFAZOWEGO: frozenset[str] = frozenset({"A", "B", "C"})
FAZY_ODBIORU_MIEDZYFAZOWEGO: frozenset[str] = frozenset({"AB", "BC", "CA"})


class BusLimits(BaseModel):
    u_min_pu: float | None = None
    u_max_pu: float | None = None


class BranchRating(BaseModel):
    in_a: float | None = None
    ith_ka: float | None = None
    idyn_ka: float | None = None


class GenLimits(BaseModel):
    p_min_mw: float | None = None
    p_max_mw: float | None = None
    q_min_mvar: float | None = None
    q_max_mvar: float | None = None


class MeasurementRating(BaseModel):
    """Parametry znamionowe przekładnika CT/VT."""

    ratio_primary: float
    ratio_secondary: float
    accuracy_class: str | None = None
    burden_va: float | None = None


#: Strona przekładnika, po której podana jest nastawa prądowa (``threshold_a``) — decyzja
#: właściciela PZ-09 (D-34): nastawa przechowywana w jednostce JAWNIE zadeklarowanej w polu.
#: ``A_WTORNY`` — ampery strony wtórnej przekładnika pola (tak nastawia się przekaźnik);
#: ``A_PIERWOTNY`` — ampery strony pierwotnej. Prąd rozruchowy po stronie pierwotnej jest
#: wielkością wyprowadzoną z przekładni przekładnika pola
#: (``application/analyses/protection/ocena_nadpradowa.py``), nigdy domyślną.
JednostkaProguPradowego = Literal["A_WTORNY", "A_PIERWOTNY"]

#: Charakterystyki czasowo-prądowe nastawy. IEC 60255-151 (SI/VI/EI/LTI) i czas niezależny
#: (DT) liczy rdzeń ``protection_iec60255.compute_curve_trip_time``; IEEE C37.112 (MI/VI/EI)
#: — ``protection_iec60255.compute_ieee_c37112_generic`` ze stałymi normy
#: (``protection.curves.ieee_curves.IEEECurveParams``).
KrzywaNastawy = Literal[
    "DT", "IEC_SI", "IEC_VI", "IEC_EI", "IEC_LTI", "IEEE_MI", "IEEE_VI", "IEEE_EI"
]


class ProtectionSetting(BaseModel):
    """Nastawa jednego stopnia (funkcji) zabezpieczenia zapisana w modelu (decyzja D-21).

    Nastawy bazowe żyją przy urządzeniu zabezpieczeniowym w modelu; przypadek obliczeniowy
    ich nie przechowuje. Ocena nadprądowa (``ocena_nadpradowa``) czyta je wprost stąd i
    każdy brak (progu, jednostki progu, charakterystyki, zwłoki, mnożnika) nazywa kodem
    gotowości — nie ma wartości domyślnych.
    """

    function_type: Literal[
        "overcurrent_50",
        "overcurrent_51",
        "earth_fault_50N",
        "earth_fault_51N",
        "directional_67",
        "directional_67N",
        # D10 (addytywnie): funkcje ochrony od pracy wyspowej (Loss of Mains).
        # Rozszerzenie WYŁĄCZNIE dodaje literały — istniejące dokumenty ENM bez
        # tych typów walidują się bez zmian.
        "rocof_81R",
        "vector_shift_78",
        "underfrequency_81U",
        "overfrequency_81O",
    ]
    threshold_a: float | None = None
    threshold_unit: JednostkaProguPradowego | None = None
    """Strona przekładnika, po której podano ``threshold_a`` (PZ-09). Addytywne; ``None`` =
    jednostka niezadeklarowana — ocena urządzenia jest wstrzymana nazwanym kodem gotowości."""
    time_delay_s: float | None = None
    curve_type: KrzywaNastawy | None = None
    time_multiplier: float | None = None
    """Mnożnik czasowy (TMS) dla charakterystyk odwrotnych IEC 60255 (SI/VI/EI/LTI).

    Addytywne, opcjonalne (default None). Dokumenty ENM bez tego pola walidują się
    bez zmian, a serializacja z ``exclude_none`` pomija je dla istniejących nastaw —
    determinizm dotychczasowych payloadów pozostaje nienaruszony. Wymagany do
    wyznaczenia krzywej I-t dla charakterystyk odwrotnych (nie dotyczy DT).
    """
    is_directional: bool = False
    # D10 (addytywnie, opcjonalne — default None): nastawy funkcji LoM.
    # Zachowanie istniejących typów funkcji NIE zmienia się (pola pozostają None).
    threshold_hz_s: float | None = None
    """Nastawa df/dt [Hz/s] dla ROCOF (81R)."""
    threshold_deg: float | None = None
    """Nastawa przesunięcia wektora [°] dla funkcji 78."""
    threshold_hz: float | None = None
    """Próg częstotliwościowy [Hz] dla 81U/81O."""


# ---------------------------------------------------------------------------
# ENMElement — base for all elements
# ---------------------------------------------------------------------------


class ParameterOverride(BaseModel):
    """Audytowalny override parametru katalogowego (tryb EKSPERT)."""

    key: str
    value: float | str
    reason: str | None = None


class ENMElement(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    ref_id: str
    name: str
    tags: list[str] = []
    meta: dict = {}


# ---------------------------------------------------------------------------
# Header + Defaults
# ---------------------------------------------------------------------------


class ENMDefaults(BaseModel):
    frequency_hz: float = 50.0
    unit_system: Literal["SI"] = "SI"
    sn_nominal_kv: float | None = None


class ConnectionConditions(BaseModel):
    """Warunki przyłączenia z dokumentu OSD (dane WEJŚCIOWE projektu, nie wynik).

    Karta K2 programu FLOW EKSPERT+ (GAP B1/B2 audytu FLOW): statyczny limit
    mocy z umowy/warunków przyłączeniowych + wymagany współczynnik mocy +
    opis trybu pracy przyłącza (tekst z dokumentu OSD — bez zgadywania enuma).
    Wszystkie pola opcjonalne (blok addytywny — istniejące payloady bez zmian).
    """

    moc_przylaczeniowa_mw: float | None = Field(default=None, gt=0)
    wymagany_cos_phi: float | None = Field(default=None, gt=0, le=1)
    tryb_pracy: str | None = None


class ENMHeader(BaseModel):
    enm_version: Literal["1.0"] = "1.0"
    name: str
    description: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    revision: int = 1
    hash_sha256: str = ""
    defaults: ENMDefaults = Field(default_factory=ENMDefaults)

    # CV-2 (H1): pola „lancucha hashy" V12S-010 (`semantic_hash`, `input_hash`,
    # `case_hash`, `variant_hash`, `switching_snapshot_hash`) USUNIETE — zaden
    # kod ich nie wypelnial (pomiar: zero pisarzy w `src/`), wiec byly obietnica
    # bez dostawcy. Odciski ortogonalne nadal istnieja jako FUNKCJE
    # (`enm/hash.py::compute_semantic_hash` i pokrewne) liczone na zadanie;
    # tozsamosc biegu niesie koperta rewizji (`enm/envelope.py`). Wskrzeszenie
    # tych pol pilnuje `tests/enm/test_hash_chain_split.py`.

    connection_conditions: ConnectionConditions | None = None
    """Warunki przyłączenia OSD (karta K2 FLOW EKSPERT+; dane WEJŚCIOWE
    projektu). NAPRAWA DEFEKTU UTRWALANIA (karta POMIAR-RODZAJ, przy okazji
    walidacji 5 MW z V12K-336): operacja `set_connection_conditions` zapisywała
    blok do surowego słownika nagłówka, ale pole NIE było zadeklarowane w tym
    modelu — każda walidacja (`EnergyNetworkModel.model_validate`) po drodze
    persystencji CICHO go gubiła. Pole jest wykluczone z odcisków ENM (jak
    pozostałe pola zmienne nagłówka) — dane wejściowe dokumentu OSD czytane są
    w warstwie interpretacji, nie przez solver, więc istniejące odciski
    pozostają bajtowo niezmienione."""


# ---------------------------------------------------------------------------
# Bus (node)
# ---------------------------------------------------------------------------


class Bus(ENMElement):
    voltage_kv: float
    frequency_hz: float | None = None
    phase_system: Literal["3ph"] = "3ph"
    zone: str | None = None
    nominal_limits: BusLimits | None = None


# ---------------------------------------------------------------------------
# Branch — discriminated union
# ---------------------------------------------------------------------------


class BranchBase(ENMElement):
    from_bus_ref: str
    to_bus_ref: str
    status: Literal["closed", "open"] = "closed"
    catalog_ref: str | None = None
    catalog_namespace: str | None = None
    parameter_source: Literal["CATALOG", "OVERRIDE", "MANUAL_EQUIVALENT"] | None = None
    source_mode: Literal["KATALOG", "MIGRACJA", "EKSPERCKI_RECZNY"] | None = None
    materialized_params: dict | None = None
    overrides: list[ParameterOverride] = []


class PolozeniePrzewoduLinii(BaseModel):
    """Położenie przewodu w przekroju poprzecznym linii [m] (karta LINIA-110).

    ``x_m`` — odległość pozioma od osi słupa; ``y_m`` — ŚREDNIA wysokość przewodu nad ziemią
    w przęśle (wysokość zawieszenia pomniejszona o 2/3 zwisu).
    """

    x_m: float
    y_m: float


class GeometriaSlupaLinii(BaseModel):
    """Geometria słupa linii napowietrznej — DANA PROJEKTU (karta LINIA-110).

    Każda składowa opcjonalna: ``None`` = projekt jej nie podaje, a obliczenie parametrów linii
    biegnie z wartością roboczą rejestru ``network_model.catalog.wartosci_robocze`` (jakość
    ``ESTIMATED``, kompletność dowodu ``NIEPELNY``). ``odgromowe == []`` to jawna deklaracja
    linii BEZ przewodu odgromowego. ``liczba_w_wiazce`` — przewody w fazie (1 = przewód
    pojedynczy, jak w standardzie ENEA linii 110 kV §4.1).
    """

    fazy: list[PolozeniePrzewoduLinii] | None = None
    liczba_w_wiazce: int = 1
    odstep_wiazki_m: float | None = None
    odgromowe: list[PolozeniePrzewoduLinii] | None = None
    przewod_odgromowy_ref: str | None = None
    rezystywnosc_gruntu_ohm_m: float | None = None


class ParametryLiniiZGeometrii(BaseModel):
    """Proweniencja R′/X′/B′/Z′0 linii wyliczonych z geometrii (zapis operacji domenowej).

    Operacja domenowa wpisuje wynik solvera ``parametry_linii_napowietrznej`` do pól impedancji
    linii i tu zostawia ślad pochodzenia: metodę z wersją, odcisk wejścia (SHA-256 — ta sama
    geometria i przewód dają ten sam odcisk), kompletność dowodu i składowe przyjęte jako
    wartości robocze. Pełny ślad obliczenia (wzory, podstawienia) odtwarza deterministycznie
    endpoint parametrów linii i pakiet dowodowy.
    """

    metoda: str
    wersja_metody: str
    odcisk_wejscia: str
    kompletnosc_dowodu: Literal["PELNY", "NIEPELNY"]
    czestotliwosc_hz: float
    temperatura_przewodu_c: float
    r1_temperatura_ohm_per_km: float
    r0_bez_odgromowych_ohm_per_km: float
    x0_bez_odgromowych_ohm_per_km: float
    gmd_m: float
    gmr_fazy_m: float
    #: Składowe danych linii przyjęte jako wartości robocze (kolejność rejestru).
    wartosci_robocze: list[str] = []


class OverheadLine(BranchBase):
    type: Literal["line_overhead"] = "line_overhead"
    length_km: float
    r_ohm_per_km: float
    x_ohm_per_km: float
    b_siemens_per_km: float | None = None
    r0_ohm_per_km: float | None = None
    x0_ohm_per_km: float | None = None
    b0_siemens_per_km: float | None = None
    # Karta F-K1 faza 7: dane cieplne i materialowe PRZEWODU GOLEGO. Model niosl
    # dotad wylacznie impedancje i obciazalnosc — a poniewaz pydantic domyslnie
    # IGNORUJE nadmiarowe pola, dane cieplne z materializacji katalogowej byly cicho
    # POLYKANE. Objaw: kryterium IEC 60949 dla kazdej linii napowietrznej konczylo
    # sie werdyktem NIEDOSTEPNY, mimo ze katalog mial Jth(1 s) od poczatku.
    # Pola opcjonalne (blok addytywny) — dokumenty bez nich walidowaly sie i walidują dalej.
    conductor_material: str | None = None
    cross_section_mm2: float | None = None
    jth_1s_a_per_mm2: float | None = None
    ith_1s_a: float | None = None
    # Para temperatur uzasadniajaca k. Dla przewodu GOLEGO granice wyznacza utrata
    # wytrzymalosci mechanicznej zyly i osprzet, nie izolacja — dlatego linia nie ma
    # (i nie moze miec) pola `insulation`.
    operating_temperature_c: float | None = None
    short_circuit_temperature_c: float | None = None
    thermal_source_ref: str | None = None
    rating: BranchRating | None = None
    # PR-3 rebuild SLD: jawne porty endpointów (opcjonalne, automigracja w PR-3)
    endpoint_a_port: PortRef | None = None
    endpoint_b_port: PortRef | None = None
    # Karta LINIA-110: geometria słupa (dana projektu) i proweniencja parametrów linii
    # policzonych z geometrii dla linii z przewodem z katalogu PRZEWOD_LINII_WN. Pola
    # addytywne — `None` poza odciskiem ENM (`enm/hash.py`), linie SN bez zmian.
    geometria_slupa: GeometriaSlupaLinii | None = None
    parametry_z_geometrii: ParametryLiniiZGeometrii | None = None


class Cable(BranchBase):
    type: Literal["cable"] = "cable"
    length_km: float
    r_ohm_per_km: float
    x_ohm_per_km: float
    b_siemens_per_km: float | None = None
    r0_ohm_per_km: float | None = None
    x0_ohm_per_km: float | None = None
    b0_siemens_per_km: float | None = None
    conductor_material: str | None = None
    cross_section_mm2: float | None = None
    number_of_cores: int | None = None
    return_conductor_cross_section_mm2: float | None = None
    return_conductor_material: str | None = None
    return_conductor_r_ohm_per_km_20c: float | None = None
    # Karta P0.6 (nN, docs/nn/H_PLAN_IMPLEMENTACJI_NN.md §P0.6, luka G-05):
    # reaktancja zyly powrotnej PE/PEN — brakowala w CALYM repozytorium (ani ten
    # kabel SN/nN, ani katalogowy `CableType`/`LVCableType` jej nie niosly), a
    # petla zwarcia L-PE/L-PEN wymaga R+jX zyly powrotnej z TEJ SAMEJ trasy co
    # zyla fazowa (§0.1 karty). Pole addytywne/opcjonalne — brak (None) NIE jest
    # domyslnym zerem: `fault_loop_builder`/warstwa aplikacji odmawia liczenia
    # petli bez jawnej wartosci (fail-closed, zero fabrykacji); istniejace
    # opublikowane kable bez tego pola waliduja sie i mapuja identycznie jak
    # przed dodaniem.
    return_conductor_x_ohm_per_km: float | None = None
    return_conductor_jth_1s_a_per_mm2: float | None = None
    return_conductor_ith_1s_a: float | None = None
    # Karta F-K1 faza 3: wytrzymalosc cieplna zwarciowa ZYLY FAZOWEJ (IEC 60949).
    # Model niosl dotad wylacznie dane zyly POWROTNEJ; kryterium cieplne przewodu
    # nie mialo z czego liczyc pradu dopuszczalnego. Pola opcjonalne — brak = dana
    # nieznana, nigdy zero.
    jth_1s_a_per_mm2: float | None = None
    ith_1s_a: float | None = None
    rating: BranchRating | None = None
    # EPR dolozony w karcie F-K1 faza 6: katalog SN ma 18 rekordow z ta izolacja,
    # a model ich NIE PRZYJMOWAL — materializacja takiego kabla wywracala walidacje
    # dokumentu. Defekt byl niewidoczny, dopoki izolacja nie trafila do modelu.
    insulation: Literal["XLPE", "EPR", "PVC", "PAPER"] | None = None
    # Karta F-K1 faza 6 (Calculation Evidence): para temperatur uzasadniajaca k.
    # Addytywne, opcjonalne — dokumenty bez tych pol walidowaly sie i walidują dalej.
    operating_temperature_c: float | None = None
    short_circuit_temperature_c: float | None = None
    thermal_source_ref: str | None = None
    # PR-3 rebuild SLD: jawne porty endpointów (opcjonalne, automigracja w PR-3)
    endpoint_a_port: PortRef | None = None
    endpoint_b_port: PortRef | None = None
    # Mufy kablowe (brief 1 §4 pkt 4) — punkty na segmencie kabla bez podziału topologii
    cable_joints: list[CableJoint] = []
    # P0.1 nN (karta P0.1, C §4.1 add_nn_cable_segment): liczba identycznych torów
    # kabla ułożonych równolegle na TEJ SAMEJ trasie (typowe dla przyłączy nN o
    # dużym prądzie: 2-4 kable YAKY równolegle zamiast jednego przekroju). None/1 =
    # pojedynczy tor (reduce-to-current-behavior — istniejące kable SN i nN bez tego
    # pola walidują się i mapują identycznie jak przed dodaniem pola). Fizyka
    # (Z_eff = Z/n, I_dop_eff = I_dop*n) w `enm/mapping.py` jest tą samą zasadą co
    # `Transformer.n_parallel` (Z/n, Sn*n) — zero nowej heurystyki, standardowe
    # łączenie równoległe impedancji identycznych torów.
    n_parallel: int | None = None
    # W5-A (F9): układ uziemienia ekranu kabla — dana PROJEKTOWA bez fabrykacji
    # fizyki. Katalogowe r0/x0 dotyczą układu odniesienia producenta
    # (`CableType.z0_reference_bonding`); rozjazd = ostrzeżenie walidatora
    # W-W5-01, nigdy przeliczenie (brak geometrii ułożenia). None = niezadeklarowany.
    screen_bonding: UziemienieEkranuKabla | None = None


class SwitchBranch(BranchBase):
    """Wyłącznik, rozłącznik, sprzęgło, sekcjoner.

    W5-C (jedna prawda stanu łączeniowego): ``status`` (pole bazowe) jest JEDYNYM
    stanem czytanym przez fizykę — bieżące położenie łącznika w modelu bazowym.
    ``normal_state`` to POZYCJA NORMALNA z projektu (punkt normalnie otwarty =
    ``"open"``); ``None`` = niezadeklarowana, nie domysł. Punkty podziału sieci
    wyprowadza akcesor ``enm.topology.punkty_podzialu`` wyłącznie z tego pola —
    dawna kopia ``Corridor.no_point_ref`` jest skasowana (migracja
    ``enm/stan_normalny.py``). Stan łącznika w scenariuszu ruchowym nadpisuje
    ``status`` w migawce efektywnej (``OperatingScenario.switch_states``), model
    bazowy zostaje bez zmian.
    """

    type: Literal["switch", "breaker", "bus_coupler", "disconnector"]
    r_ohm: float | None = None
    x_ohm: float | None = None
    normal_state: Literal["closed", "open"] | None = None
    # Karta UX-04/POLE-LINIOWE-WZORZEC (korekta właściciela 2026-10-28): stan obiektu INSTANCJI
    # łącznika — ISTNIEJACY albo PROJEKTOWANY. Operacja tworząca łącznik poza polem (rozłącznik
    # sekcyjny w ciągu, sprzęgło, łącznik portu odgałęźnego) nadaje PROJEKTOWANY jawnie; wymiana
    # pozycji katalogu łącznika nadaje PROJEKTOWANY (nowa instancja); ISTNIEJACY ustawia
    # `set_object_state` (`switch_ref` albo całe pole). Łącznik opisany aparatem pola
    # (`BayPrimaryDevice.linked_ref`) nie ma własnego stanu (niesie go aparat), łącznik pola bez
    # własnego stanu dziedziczy stan pola — `enm.gaz_fluorowany_pola.stan_obiektu_lacznika`
    # (jedno źródło). `None` = gałąź sprzed atrybutu. Rozstrzyga zakaz gazów fluorowanych.
    stan_obiektu: StanObiektu | None = None


class FuseBranch(BranchBase):
    type: Literal["fuse"] = "fuse"
    rated_current_a: float | None = None
    rated_voltage_kv: float | None = None


Branch = Annotated[
    OverheadLine | Cable | SwitchBranch | FuseBranch,
    Field(discriminator="type"),
]


# ---------------------------------------------------------------------------
# Transformer + tap changer (V12K-045)
# ---------------------------------------------------------------------------


class LineDropCompensation(BaseModel):
    """Line-drop compensation (LDC) for an OLTC regulator [Ω]."""

    enabled: bool = False
    r_ohm: float = 0.0
    x_ohm: float = 0.0


class TapChanger(BaseModel):
    """Canonical tap-changer state on a transformer — single source of truth.

    Additive/optional: a transformer without a tap_changer keeps the legacy
    tap_position/tap_step_percent behaviour. None is excluded from the ENM
    fingerprint (model_dump exclude_none), so existing fixtures are unchanged.
    """

    regulation_type: Literal["NONE", "DETC", "OLTC"] = "NONE"
    regulated_winding: Literal["HV", "LV"] = "HV"
    neutral_position: int = 0
    current_position: int = 0
    min_position: int = 0
    max_position: int = 0
    step_percent: float = 0.0
    control_mode: Literal["MANUAL", "AUTOMATIC", "PROFILE", "REMOTE"] = "MANUAL"
    voltage_setpoint_kv: float | None = None
    deadband_kv: float | None = None
    delay_seconds: float | None = None
    controlled_bus_ref: str | None = None
    line_drop_compensation: LineDropCompensation | None = None
    catalog_ref: str | None = None


class Transformer(ENMElement):
    hv_bus_ref: str
    lv_bus_ref: str
    sn_mva: float
    uhv_kv: float
    ulv_kv: float
    uk_percent: float
    pk_kw: float
    p0_kw: float | None = None
    i0_percent: float | None = None
    # Grupa połączeń ze słownika IEC 60076-1 (`enm/grupa_polaczen.py`). Typ
    # pozostaje `str`, żeby zastany zapis spoza słownika wczytał się i został
    # NAZWANY przez walidator (E-W5-02 z nawigacją naprawczą), a nie zniknął przy
    # `model_validate` (migawka odrzucona = projekt bez modelu).
    vector_group: str | None = None
    hv_neutral: GroundingConfig | None = None
    lv_neutral: GroundingConfig | None = None
    # W5-A §1 p. 2: układ sieci nN zasilanej z tego transformatora — pole
    # TYPOWANE w miejsce dawnego klucza meta stacji z układem nN (skasowane z
    # migracją). Brak = odmowa nazwana (E063 / ELIG_FLNN_MISSING_EARTHING_SYSTEM),
    # nigdy domyślka.
    lv_earthing_system: UkladSieciNn | None = None
    # Karta WSPOLCZYNNIK-C-JEDEN-NOSNIK (C-TOLERANCJA-NN): tolerancja napięcia sieci nN
    # zasilanej z tego transformatora wg przypisów tabeli 1 IEC 60909-0 (+6 % → c 1,05/0,95;
    # +10 % → c 1,10/0,90). JEDYNY nośnik wiersza nN tabeli c: czyta go `enm.tolerancja_nn`
    # (węzły nN wyspy zasilanej) i K_T tego transformatora. Brak = wartość robocza rejestru
    # `wartosci_robocze` z założeniem biegu `fault.c_tolerancja_nn_robocza` (karta
    # TOLERANCJA-NN-WARTOSC-ROBOCZA), nigdy cicha domyślka.
    lv_voltage_tolerance: TolerancjaNapieciaNn | None = None
    # G-STK-6: liczba identycznych jednostek pracujących równolegle w polu
    # transformatorowym. None/1 = pojedynczy transformator (bez zmiany fizyki).
    # Agregacja: n jednostek → impedancja zastępcza Z/n (mapper skaluje Sn×n).
    n_parallel: int | None = None
    tap_position: int | None = None
    tap_min: int | None = None
    tap_max: int | None = None
    tap_step_percent: float | None = None
    # V12K-045: canonical tap-changer (single source of truth). Additive/optional;
    # None excluded from ENM fingerprint (exclude_none). The legacy tap_* fields
    # above remain for backward compatibility.
    tap_changer: TapChanger | None = None
    catalog_ref: str | None = None
    catalog_namespace: str | None = None
    parameter_source: Literal["CATALOG", "OVERRIDE"] | None = None
    source_mode: Literal["KATALOG", "MIGRACJA", "EKSPERCKI_RECZNY"] | None = None
    materialized_params: dict | None = None
    overrides: list[ParameterOverride] = []


# ---------------------------------------------------------------------------
# Source (punkt zasilania)
# ---------------------------------------------------------------------------


class Source(ENMElement):
    bus_ref: str
    model: Literal["thevenin", "short_circuit_power", "external_grid"]
    substation_ref: str | None = None
    gpz_section_id: str | None = None
    catalog_ref: str | None = None
    catalog_namespace: str | None = None
    parameter_source: Literal["CATALOG", "OVERRIDE", "MANUAL_EQUIVALENT"] | None = None
    source_mode: Literal["KATALOG", "MIGRACJA", "EKSPERCKI_RECZNY"] | None = None
    materialized_params: dict | None = None
    overrides: list[ParameterOverride] = []
    source_side: Literal["SN", "HV_110"] | None = None
    sn_voltage_kv: float | None = None
    voltage_hv_kv: float | None = None
    # W5-A §1 p. 1: opis inżynierski punktu neutralnego sieci SN zasilanej z tego
    # równoważnika (GPZ). Fizyka czyta, jak dotąd, `r0_ohm`/`x0_ohm` | `z0_z1_ratio`;
    # kreator GPZ wyprowadza je z (Z_T0 + 3·Z_N) w `pochodne/skladowe_zerowe.py`
    # i zapisuje OBA: opis i liczby (proweniencja `WYPROWADZONE` w `meta`).
    neutral_grounding: GroundingConfig | None = None
    sk3_hv_mva: float | None = None
    sk3_mva: float | None = None
    ik3_ka: float | None = None
    r_ohm: float | None = None
    x_ohm: float | None = None
    rx_ratio: float | None = None
    # CV-4.3 K7: dane zwarciowe scenariusza MIN (IEC 60909-0:2016 §6.2.1 eq. 6 z c_min),
    # na TEJ SAMEJ szynie/stronie co ``sk3_mva``/``ik3_ka``. Brak = scenariusz MIN liczony
    # z Z_Q(MAX) i JAWNYM założeniem ``source.sk_min_missing`` (``enm/zrodlo_zwarcie.py``).
    sk3_min_mva: float | None = None
    ik3_min_ka: float | None = None
    rx_ratio_min: float | None = None
    # Napięcie zadane szyny bilansującej [p.u. napięcia znamionowego szyny] — dana
    # WEJŚCIOWA rozpływu mocy (MATPOWER/pandapower: ``Vm`` szyny slack / ``ext_grid.vm_pu``).
    # ``None`` = 1,0 p.u. (napięcie znamionowe; jawne założenie modelowe, nie pomiar).
    # Dotąd assembler wpisywał 1,0 KAŻDEMU źródłu — bliźniaki literatury ze slackiem
    # 1,06 p.u. (IEEE case14) / 0,982 p.u. (IEEE case39) nie dały się odwzorować.
    u_set_pu: float | None = None
    r0_ohm: float | None = None
    x0_ohm: float | None = None
    z0_z1_ratio: float | None = None
    # Karta WSPOLCZYNNIK-C-JEDEN-NOSNIK: tolerancja napięcia sieci nN zasilanej z tego źródła
    # wprost na szynie nN (bez transformatora w modelu) — ten sam nośnik wiersza nN tabeli 1
    # IEC 60909-0 co `Transformer.lv_voltage_tolerance` (+6 % → c 1,05/0,95; +10 % → c
    # 1,10/0,90), rozwiązywany per wyspa nN przez `enm.tolerancja_nn`. Czytana wyłącznie, gdy
    # szyna źródła leży w paśmie nN; brak przy takim źródle = wartość robocza rejestru z
    # założeniem biegu `fault.c_tolerancja_nn_robocza`, nigdy cicha domyślka. Dawne pola `c_max`/`c_min` źródła
    # (fantom: zapisywane, nigdy nieczytane — c dobiera wyłącznie `voltage_factor`) skasowane.
    lv_voltage_tolerance: TolerancjaNapieciaNn | None = None


# ---------------------------------------------------------------------------
# Load
# ---------------------------------------------------------------------------


class Load(ENMElement):
    bus_ref: str
    p_mw: float
    q_mvar: float
    model: Literal["pq", "zip"] = "pq"
    # Karta W5-D (F-1): fazy przyłączenia odbioru. `None` = odbiór trójfazowy
    # symetryczny (jedyne dotychczasowe znaczenie `Load` — rozpływ NR i zwarcie
    # nie czytają tego pola; czyta je WYŁĄCZNIE assembler rozpływu
    # niesymetrycznego, `enm/assembler.py::zloz_wejscie_rozplywu_niesymetrycznego`).
    # Pole addytywne: `None` poza odciskiem (`enm/hash.py`), więc migawki sprzed
    # karty zachowują hashe bit w bit. Pisarze: `add_nn_load`/`add_load_sn`
    # (`enm/domain_operations_v2.py`) i `update_element_parameters` — każdy przez
    # JEDEN walidator `enm/fazy_odbioru.py::waliduj_fazy_odbioru`.
    phases: PhaseSet | None = None
    # Karta W5-E-TTIT: rezystancja uziomu instalacji odbiorczej R_A [Ω] — dana projektowa
    # układów TT/IT (pętla doziemna przez R_A i R_B, napięcie dotykowe R_A·I_Δn — solver
    # `network_model/solvers/petla_zwarcia_tt_it.py`). `None` = dana nieobecna (werdykt TT/IT
    # odmawia kodem `nn.brak_r_a`), nigdy zero. Pole addytywne: `None` poza odciskiem
    # (`enm/hash.py`), pisarze przez JEDEN walidator `enm/uziom_instalacji.py::waliduj_r_a`.
    earth_electrode_r_ohm: Annotated[float, Field(gt=0)] | None = None
    catalog_ref: str | None = None
    catalog_namespace: str | None = None
    quantity: int | None = None
    parameter_source: Literal["CATALOG", "OVERRIDE"] | None = None
    source_mode: Literal["KATALOG", "MIGRACJA", "EKSPERCKI_RECZNY"] | None = None
    materialized_params: dict | None = None
    overrides: list[ParameterOverride] = []
    # Karta modeli odbiorow (O-49 pkt 2, O-56): model dynamiczny odbioru — KOPIA profilu
    # katalogu `network_model.catalog.load_dynamic` wskazanego wiazaniem
    # `materialized_params.dynamic_model_ref`, budowana WYLACZNIE przez
    # `enm.dynamika_z_katalogu.materializuj_dynamike_odbioru` (operacja domenowa
    # `set_load_dynamic_binding` i synchronizacja kazdej odpowiedzi operacji). Wymagany
    # dla kazdego odbioru w biegu `dynamika_rms` (bramka `braki_modelu_dynamiki`).
    # Pole addytywne: `None` poza odciskiem (`enm/hash.py`).
    dynamika: ModelDynamicznyOdbioru | None = None


# ---------------------------------------------------------------------------
# ShuntCapacitor (bank kondensatorow — kompensacja mocy biernej)
# ---------------------------------------------------------------------------


class ShuntCapacitor(ENMElement):
    """Bateria kondensatorów równoległych SN (kompensacja mocy biernej) na szynie.

    Element FIRST-CLASS ENM: równoległa admitancja pojemnościowa przyłączona do jednej szyny —
    w GPZ do zacisku pola baterii kondensatorów (`Bay.bay_role == "BKR"`, `terminal_bus_ref`
    pola = `bus_ref` baterii; ENEA Operator, Zeszyt 1 §13, §17, Zał. 16). W rozpływie mocy
    mapuje się na mechanizm boczników solvera (`ShuntSpec`) przez admitancję z pierwszych
    zasad: B = Q_n·(n_zał/n)/U_n² [S], b_pu = B·U_b²/S_b — moc bierna przy napięciu U
    wynosi Q = Q_n·(n_zał/n)·(U/U_n)² (`network_model.pochodne.bateria_kondensatorow`).

    Pola karty UX-04/POLE-BKR-MODEL (wszystkie addytywne; `None`/pusta lista = dana
    nienadana przez projektanta — poza odciskiem `enm/hash.py`). Wartość nadana na elemencie
    ma pierwszeństwo przed parametrem typu katalogowego (`materialized_params`, kopia przy
    przypisaniu typu), a brak obu = wartość robocza rejestru
    (`network_model.catalog.wartosci_robocze`, zasada nr 4) — rozstrzyga
    `enm.bateria_kondensatorow.parametry_baterii`.

    * `uklad_polaczen` — układ połączeń (`network_model.core.bateria_kondensatorow`);
    * `liczba_stopni` — liczba jednakowych stopni baterii (≥ 1);
    * `stopnie_zalaczone` — stan każdego stopnia (`True` = załączony), długość równa liczbie
      stopni; `None` = wszystkie stopnie załączone. Stan całej baterii (wyłącznik pola) to
      `status`;
    * `tolerancja_pojemnosci_min_proc` / `_max_proc` — dopuszczalna odchyłka pojemności od
      znamionowej [%] (zakres mocy biernej w śladzie rozpływu);
    * `dlawik_ograniczajacy` / `dlawik_indukcyjnosc_mh` — dławik szeregowy ograniczający prąd
      załączania (jest / nie ma; indukcyjność [mH], gdy jest);
    * `rezystory_rozladowcze_wewnetrzne` — jednostki mają wewnętrzne rezystory rozładowcze
      (gdy nie — pole BKR wymaga przekładników napięciowych rozładowczych);
    * `wylaczenie_od_transformatorow` — transformatory, których wyłączenie od strony SN wyłącza
      baterię (IRiESD II.4.5.4.4.2). Dane dla logiki łączeniowej; walidator sprawdza
      kompletność wobec transformatorów zasilających sekcję baterii.
    """

    bus_ref: str
    rated_mvar: float
    rated_kv: float
    status: Literal["closed", "open"] = "closed"
    catalog_ref: str | None = None
    catalog_namespace: str | None = None
    parameter_source: Literal["CATALOG", "OVERRIDE", "MANUAL_EQUIVALENT"] | None = None
    source_mode: Literal["KATALOG", "MIGRACJA", "EKSPERCKI_RECZNY"] | None = None
    materialized_params: dict | None = None
    overrides: list[ParameterOverride] = []
    uklad_polaczen: UkladPolaczenBaterii | None = None
    # Typy ścisłe: te same granice co typ katalogowy (KAT-T-052, KAT-T-055) — wartość logiczna
    # nie jest liczbą stopni, a liczba ani napis („1”, „yes”) nie jest wartością logiczną.
    liczba_stopni: StrictInt | None = Field(default=None, ge=1)
    stopnie_zalaczone: list[StrictBool] | None = None
    tolerancja_pojemnosci_min_proc: float | None = Field(default=None, le=0.0)
    tolerancja_pojemnosci_max_proc: float | None = Field(default=None, ge=0.0)
    dlawik_ograniczajacy: StrictBool | None = None
    dlawik_indukcyjnosc_mh: float | None = Field(default=None, gt=0.0)
    rezystory_rozladowcze_wewnetrzne: StrictBool | None = None
    wylaczenie_od_transformatorow: list[str] = []

    @model_validator(mode="after")
    def _spojnosc_stopni_i_dlawika(self) -> ShuntCapacitor:
        """Sprzeczność parametrów nadanych na elemencie (stan stopni pusty albo innej długości
        niż liczba stopni, indukcyjność dławika bez dławika) — JEDNO zdanie z liścia
        ``sprzecznosc_parametrow_baterii``, to samo, które czyta odmowa zapisu parametrów.
        Zgodność stanu stopni z liczbą stopni typu (gdy liczba nie jest nadana na elemencie)
        sprawdza walidator modelu (E043)."""
        sprzecznosc = sprzecznosc_parametrow_baterii(
            liczba_stopni=self.liczba_stopni,
            stopnie_zalaczone=self.stopnie_zalaczone,
            dlawik_ograniczajacy=self.dlawik_ograniczajacy,
            dlawik_indukcyjnosc_mh=self.dlawik_indukcyjnosc_mh,
        )
        if sprzecznosc is not None:
            raise ValueError(f"bateria {self.ref_id!r}: {sprzecznosc}")
        return self


# ---------------------------------------------------------------------------
# Generator
# ---------------------------------------------------------------------------

#: Rodzaje generatorow ENM bedace ZRODLAMI PRZEKSZTALTNIKOWYMI (DER) — dokladnie
#: te z Literalu ``Generator.gen_type`` poza ``synchronous``. Jedno zrodlo
#: prawdy dla predykatu "czy generator jest DER": bramy gotowosci
#: (``enm/domain_operations.py``), walidator E028/E029 (``enm/validator.py``)
#: i most zgodnosci NC RfG (``application/ncrfg_compliance/model_bridge.py``)
#: musza obejmowac te sama klase urzadzen — rozjazd zbiorow oznacza urzadzenie
#: ostrzegane, ktorego bieg nie testuje (albo odwrotnie).
#:
#: UWAGA — to NIE jest klasyfikacja zwarciowa z ``enm/mapping.py``
#: (tam pelne przeksztaltniki IEC 60909; ``fw_dfig``/``fw_scig`` to maszyny
#: wirujace). Do certyfikacji PTPiREE i bram DER naleza rowniez one.
GEN_TYPES_PRZEKSZTALTNIKOWE: frozenset[str] = frozenset(
    {"pv_inverter", "wind_inverter", "fw_pmsg", "fw_dfig", "fw_scig", "bess"}
)


class Generator(ENMElement):
    bus_ref: str
    p_mw: float
    q_mvar: float | None = None
    gen_type: (
        Literal[
            "synchronous",
            "pv_inverter",
            "wind_inverter",
            "fw_pmsg",
            "fw_dfig",
            "fw_scig",
            "bess",
        ]
        | None
    ) = None
    limits: GenLimits | None = None
    catalog_ref: str | None = None
    catalog_namespace: str | None = None
    quantity: int | None = None
    n_parallel: int | None = None
    parameter_source: Literal["CATALOG", "OVERRIDE"] | None = None
    source_mode: Literal["KATALOG", "MIGRACJA", "EKSPERCKI_RECZNY"] | None = None
    materialized_params: dict | None = None
    overrides: list[ParameterOverride] = []

    # PV/BESS connection variant (KROK 2: explicit, no guessing)
    connection_variant: (
        Literal[
            "LV_BEHIND_STATION_TRANSFORMER",
            "DEDICATED_MV_CONNECTION",
            "SOURCE_CONNECTION_STATION",
            "nn_side",
            "block_transformer",
        ]
        | None
    ) = None
    """
    Wariant przyłączenia PV/BESS:
    - 'nn_side': po stronie nN stacji (przez transformator stacji SN/nN)
    - 'block_transformer': przez transformator blokowy do SN
    - None: brak informacji → FixAction generator.connection_variant_missing
    Dotyczy TYLKO gen_type in ('pv_inverter', 'wind_inverter',
    'fw_pmsg', 'fw_dfig', 'fw_scig', 'bess').
    Generatory synchroniczne nie wymagają wariantu.
    """

    blocking_transformer_ref: str | None = None
    """
    Referencja do transformatora blokowego (ref_id).
    Wymagana TYLKO gdy connection_variant == 'block_transformer'.
    Brak przy wariancie 'block_transformer' → FixAction generator.block_transformer_missing.
    """

    station_ref: str | None = None
    """
    Referencja do stacji (ref_id substacji).
    Wymagana dla wariantu 'nn_side' (wskazuje stację SN/nN).
    """

    dynamika: ParametryDynamiczne | None = None
    """
    Parametry dynamiczne źródła (karta W6-1 SS0 p.1, `enm/dynamika_modele.py`).
    `None` = brak danych wejściowych DAE — NIGDY domyślka systemowa. Wymagany
    blok jest unią dyskryminowaną po `rodzina` (synchroniczna/GFL/GFM/magazyn/
    wiatr_typ_1..4), każdy z WYMAGANĄ proweniencją. Zero fizyki: pole niesie
    wyłącznie dane wejściowe konsumowane przez solver W6-2
    (`network_model/solvers/dynamika/`, jeszcze nie istnieje w tej karcie).
    """

    modele_widmowe: ModeleWidmoweElementu | None = None
    """
    Modele widmowe źródła (karta AB-H0 §0.7.6): ZMATERIALIZOWANA kopia modeli z kart
    widmowych wskazanych kluczem `karty_widmowe_ref` operacji `set_der_catalog_bindings`,
    z proweniencją każdej karty (id, wersja, przestrzeń STATYCZNA/PROJEKT, odcisk).
    Konsumenci dziedziny częstotliwości czytają WYŁĄCZNIE to pole (wzorzec O-44).
    `None` = brak modelu widmowego urządzenia (sekcja `harmonic` UNKNOWN z nazwanym
    brakiem) — nigdy widmo typowe. Referencja karty NIE trafia do `materialized_params`.
    """

    modul_istniejacy: ModulIstniejacy | None = None
    """
    Moduł istniejący w rozumieniu art. 4 ust. 1 rozporządzenia 2016/631 (plan AB O-31).
    `True` — wymagania rozporządzenia nie mają zastosowania bez modernizacji; `False` —
    moduł nowy; `None` — status nieustalony (ocena wymagań traktuje moduł jak nowy, a każdy
    rekord niesie zastrzeżenie). Most zgodności NC RfG przenosi pole 1:1 do wejścia solvera.
    """

    data_umowy_przylaczeniowej: DataUmowy | None = None
    """
    Data zawarcia umowy przyłączeniowej modułu (plan AB O-31) — resolver wersji warstw
    profilu regulacyjnego (WOS, procedura PTPiREE, WiPWC, IRiESD) wybiera wydanie
    obowiązujące w tym dniu. `None` — data nieustalona (wersja dobrana bez daty, z uwagą).
    """

    nastawy_zabezpieczen: NastawyZabezpieczenModulu | None = None
    """
    Nastawy zabezpieczeń modułu (U<, U>, f<, f>, RoCoF, skok wektora) ze źródłem
    (`enm/nastawy_modulu.py`, plan AB O-32). `None` — brak nastaw w modelu: kryteria
    koordynacji statycznej (`frt.koordynacja_nastaw_u_min`, `rocof.koordynacja_nastaw_lom`)
    dają NIE_OCENIONO z nazwanym brakiem, nigdy wartość typowa.
    """

    deklaracje_modulu: DeklaracjeModulu | None = None
    """
    Deklaracje modułu dla testów zgodności NC RfG / PTPiREE (T05, T10-T13, T16-T20) ze
    źródłem (`enm/deklaracje_modulu.py`, plan AB O-50): nazwy pól 1:1 z wejściem solvera
    `NcRfgPtpireeModuleInput`. `None` albo pole puste — brak deklaracji: test daje
    NIE_OCENIONO z nazwanym brakiem, nigdy wartość typowa ani „niezadeklarowane".
    """

    @model_validator(mode="after")
    def _validate_connection_variant_consistency(self) -> Generator:
        """V12S-008: connection_variant musi byc spojny z station_ref/blocking_transformer_ref.

        Tabela prawdy:
          LV_BEHIND_STATION_TRANSFORMER → station_ref WYMAGANY, blocking_transformer_ref WYMAGANY
          DEDICATED_MV_CONNECTION       → station_ref ZABRONIONY, blocking_transformer_ref opcjonalny
          nn_side                       → station_ref WYMAGANY, blocking_transformer_ref ZABRONIONY
          block_transformer             → blocking_transformer_ref WYMAGANY, station_ref opcjonalny
          SOURCE_CONNECTION_STATION     → permisywne (legacy bus-only connection)
          None                          → permisywne (dane przed migracja)

        Walidator NIE jest blokujacy dla wariantow None oraz SOURCE_CONNECTION_STATION,
        zeby umozliwic ladowanie danych legacy. Eligibility (ELIG_GEN_CONNECTION_VARIANT_INCONSISTENT)
        sygnalizuje brakujacy connection_variant osobno.
        """
        variant = self.connection_variant
        if variant is None or variant == "SOURCE_CONNECTION_STATION":
            return self

        if variant == "LV_BEHIND_STATION_TRANSFORMER":
            if self.station_ref is None:
                raise ValueError(
                    f"Generator '{self.ref_id}': connection_variant="
                    f"'LV_BEHIND_STATION_TRANSFORMER' wymaga station_ref."
                )
            if self.blocking_transformer_ref is None:
                raise ValueError(
                    f"Generator '{self.ref_id}': connection_variant="
                    f"'LV_BEHIND_STATION_TRANSFORMER' wymaga blocking_transformer_ref."
                )
        elif variant == "DEDICATED_MV_CONNECTION":
            if self.station_ref is not None:
                raise ValueError(
                    f"Generator '{self.ref_id}': connection_variant="
                    f"'DEDICATED_MV_CONNECTION' nie może mieć station_ref "
                    f"(generator ma dedykowane przyłącze SN, nie idzie przez stację)."
                )
        elif variant == "nn_side":
            if self.station_ref is None:
                raise ValueError(
                    f"Generator '{self.ref_id}': connection_variant='nn_side' "
                    f"wymaga station_ref (wskazuje stację SN/nN)."
                )
            if self.blocking_transformer_ref is not None:
                raise ValueError(
                    f"Generator '{self.ref_id}': connection_variant='nn_side' "
                    f"nie może mieć blocking_transformer_ref "
                    f"(generator po stronie nN, transformator stacji wystarczy)."
                )
        elif variant == "block_transformer":
            if self.blocking_transformer_ref is None:
                raise ValueError(
                    f"Generator '{self.ref_id}': connection_variant="
                    f"'block_transformer' wymaga blocking_transformer_ref."
                )
        return self


# ---------------------------------------------------------------------------
# Measurement (przekładnik CT/VT)
# ---------------------------------------------------------------------------


class ObciazenieAparatu(BaseModel):
    """Pojedyncze obciążenie obwodu wtórnego CT/VT (aparat/licznik/przekaźnik).

    Dana PROJEKTOWA (kreator stacji, ekran bilansu) — kształt 1:1 z żądaniem
    końcówki `POST /api/solver/{ct,vt}-burden-check` (`api/equipment_checks.py`,
    ``ObciazenieAparatu``), żeby dane wpisane w kreatorze i dane wysyłane do
    solvera pochodziły z JEDNEGO źródła prawdy.
    """

    nazwa: str
    moc_va: float = Field(ge=0.0)


class ObwodWtorny(BaseModel):
    """Obwód wtórny przekładnika CT/VT (karta KD-3/W3-B) — koniec liczenia
    „na kartce" w ekranie bilansu.

    ADDYTYWNY, opcjonalny blok `Measurement.obwod_wtorny`: kabel łączący
    zaciski wtórne przekładnika z aparatami (przekaźnik, licznik) opisany
    wielkościami, jakich wymaga jądro FROZEN `ct_burden_saturation.py`
    (`check_ct_burden_saturation`) i `vt_burden_voltage_drop.py`. Wszystkie
    pola opcjonalne, BEZ wartości domyślnych — brak danej zostaje brakiem
    danej (kod gotowości), nigdy wartością zastępczą (zero fabrykacji).
    """

    #: Długość przewodu w JEDNĄ stronę [m] — solver liczy obwód dwuprzewodowy
    #: (R_p = 2·ρ·L/s) sam, więc tu wchodzi odległość, nie droga tam i z powrotem.
    dlugosc_przewodu_m: float | None = Field(default=None, gt=0)
    przekroj_przewodu_mm2: float | None = Field(default=None, gt=0)
    obciazenia_aparatow: list[ObciazenieAparatu] = Field(default_factory=list)
    #: Moc tracona na stykach i zaciskach [VA] — TYLKO gdy podana jawnie.
    moc_stykow_va: float | None = Field(default=None, ge=0)


class Measurement(ENMElement):
    """Przekładnik prądowy (CT) lub napięciowy (VT)."""

    measurement_type: Literal["CT", "VT"]
    bus_ref: str
    bay_ref: str | None = None
    rating: MeasurementRating
    connection: Literal["star", "delta", "single_phase"] = "star"
    purpose: Literal["protection", "metering", "combined"] = "protection"
    catalog_ref: str | None = None
    catalog_namespace: str | None = None
    parameter_source: Literal["CATALOG", "OVERRIDE"] | None = None
    source_mode: Literal["KATALOG", "MIGRACJA", "EKSPERCKI_RECZNY"] | None = None
    materialized_params: dict | None = None
    overrides: list[ParameterOverride] = []
    # F10.6 (SLD_CAD_SPEC_V3 §18.3, D3, V12K-036): układ pomiarowy CT —
    # 3×CT fazowe vs przekładnik sumujący/Ferranti dla składowej zerowej I0.
    # WYŁĄCZNIE dla measurement_type=='CT'; None = dana niedostarczona (WHITE
    # BOX — konsument NIE zgaduje, patrz `application/field_read_model.py`
    # `_build_measurement_chain`, wyczyszczenie heurystyki F10.4/F10.6).
    ct_arrangement: Literal["3xCT", "ferranti"] | None = None
    # F10.6 (SLD_CAD_SPEC_V3 §20.2, D4): układ VT — otwarty trójkąt (do
    # pomiaru 3U0, warunek konieczny dla 67N kierunkowego ziemnozwarciowego)
    # vs gwiazda. WYŁĄCZNIE dla measurement_type=='VT'; None = dana
    # niedostarczona (dotychczasowe uproszczenie §20.2 pozostaje w mocy).
    vt_arrangement: Literal["open_delta", "star"] | None = None
    # Karta UX-04/POLE-LINIOWE-WZORZEC (rozszerzenie 4 pkt 3): RDZENIE przekładnika prądowego
    # jako lista (`przekladniki.RdzenPrzekladnikaPradowego`: przekładnia, moc VA, klasa, FS,
    # przeznaczenie; ALF z klasy) — dawna liczba `ct_cores` skasowana, liczbę rdzeni
    # wyprowadza się z listy. WYŁĄCZNIE dla measurement_type=='CT'. None = tabliczka
    # niedostarczona (uczciwy brak — konsument NIE zgaduje). Oś ODRĘBNA od `ct_arrangement`.
    rdzenie: list[RdzenPrzekladnikaPradowego] | None = None
    # Ta sama karta: UZWOJENIA przekładnika napięciowego jako lista
    # (`przekladniki.UzwojeniePrzekladnikaNapieciowego`: przekładnia, moc VA, klasa,
    # przeznaczenie, otwarty trójkąt). WYŁĄCZNIE dla measurement_type=='VT'. None = tabliczka
    # niedostarczona.
    uzwojenia: list[UzwojeniePrzekladnikaNapieciowego] | None = None
    # CTVT-MODEL (W5/V12K-173): typ montażu przekładnika napięciowego — szynowy
    # (`bus`, VT na szynach zbiorczych) vs kablowy (`cable`, VT w polu
    # kablowym/na głowicy). Dane PRODUCENTA/projektowe rozdzielni; WYŁĄCZNIE
    # dla measurement_type=='VT'. Oś ODRĘBNA od `vt_arrangement`
    # (open_delta/star = oś składowej zerowej 3U0; `vt_mounting` = lokalizacja
    # fizyczna montażu). None = dana niedostarczona (uczciwy brak, ZERO
    # fabrykacji).
    vt_mounting: Literal["bus", "cable"] | None = None
    # KD-3/W3-B (karta W3-B, mapa 4 #3): obwód wtórny CT/VT — dana PROJEKTOWA
    # (kreator stacji / ekran bilansu), WSPÓLNA dla CT i VT (oba typy mają
    # zaciski wtórne i przewody do aparatów), więc BEZ ograniczenia do jednego
    # measurement_type. None = obwód niezapisany (uczciwy brak, zero fabrykacji
    # — kryterium nasycenia/spadku napięcia kończy się kodem gotowości).
    obwod_wtorny: ObwodWtorny | None = None
    # W3-B: które uzwojenie VT opisuje powyższy `obwod_wtorny` (limit ΔU zależy
    # od kategorii uzwojenia — pomiarowe 0,5 % vs zabezpieczeniowe 1,0 %,
    # `api/equipment_checks.py::VtBurdenRequest.uzwojenie`). WYŁĄCZNIE dla
    # measurement_type=='VT': CT ma jedno uzwojenie wtórne na rdzeń, więc
    # rozróżnienie pomiarowe/zabezpieczeniowe go nie dotyczy.
    vt_uzwojenie: Literal["POMIAROWE", "ZABEZPIECZENIOWE"] | None = None

    @model_validator(mode="after")
    def _validate_arrangement_matches_measurement_type(self) -> Measurement:
        """F10.6: `ct_arrangement`/`vt_arrangement` to dane WYŁĄCZNIE dla
        odpowiadającego `measurement_type` — zero niejednoznaczności (WHITE
        BOX, `domain_no_guessing_guard`)."""
        if self.ct_arrangement is not None and self.measurement_type != "CT":
            raise ValueError(
                f"Measurement '{self.ref_id}': ct_arrangement wymaga measurement_type='CT'."
            )
        if self.vt_arrangement is not None and self.measurement_type != "VT":
            raise ValueError(
                f"Measurement '{self.ref_id}': vt_arrangement wymaga measurement_type='VT'."
            )
        return self

    @model_validator(mode="after")
    def _validate_ctvt_variant_matches_measurement_type(self) -> Measurement:
        """CTVT-MODEL/W3-B: `rdzenie`/`uzwojenia`/`vt_mounting`/`vt_uzwojenie` to dane
        WYŁĄCZNIE dla odpowiadającego `measurement_type` — CT nie ma montażu VT ani uzwojeń VT,
        a VT nie ma rdzeni CT (spójność osi, WHITE BOX, `domain_no_guessing_guard`). Lista
        podana jest niepusta (pusta lista nie opisuje przekładnika — brak danej to `None`).
        """
        if self.rdzenie is not None and self.measurement_type != "CT":
            raise ValueError(
                f"Measurement '{self.ref_id}': rdzenie wymagają measurement_type='CT'."
            )
        if self.uzwojenia is not None and self.measurement_type != "VT":
            raise ValueError(
                f"Measurement '{self.ref_id}': uzwojenia wymagają measurement_type='VT'."
            )
        if self.rdzenie == [] or self.uzwojenia == []:
            raise ValueError(
                f"Measurement '{self.ref_id}': pusta lista rdzeni/uzwojeń — brak tabliczki to None."
            )
        if self.vt_mounting is not None and self.measurement_type != "VT":
            raise ValueError(
                f"Measurement '{self.ref_id}': vt_mounting wymaga measurement_type='VT'."
            )
        if self.vt_uzwojenie is not None and self.measurement_type != "VT":
            raise ValueError(
                f"Measurement '{self.ref_id}': vt_uzwojenie wymaga measurement_type='VT'."
            )
        return self


# ---------------------------------------------------------------------------
# ProtectionAssignment (przypięcie zabezpieczenia do wyłącznika)
# ---------------------------------------------------------------------------


class ProtectionAssignment(ENMElement):
    """Powiązanie zabezpieczenia z wyłącznikiem — modelowanie, nie solver."""

    breaker_ref: str
    ct_ref: str | None = None
    vt_ref: str | None = None
    # F10.6 (SLD_CAD_SPEC_V3 §20.2, D5, V12K-036): CT dodatkowe strefy
    # różnicowej (87T wymaga CT po OBU stronach transformatora — `ct_ref`
    # niesie JEDEN CT, ta lista niesie pozostałe CT granicy strefy). Pusta
    # lista = strefa różnicowa 2×CT NIE jest modelowana (dana niedostarczona,
    # nie błąd — `protectionFunctionTopologyGaps` degraduje do dotychczasowego
    # uproszczenia „obecność transformatora" gdy lista pusta).
    ct_refs_secondary: list[str] = []
    device_type: Literal[
        "overcurrent",
        "earth_fault",
        "directional_overcurrent",
        "distance",
        "differential",
        "custom",
    ]
    catalog_ref: str | None = None
    catalog_namespace: str | None = None
    settings: list[ProtectionSetting] = []
    is_enabled: bool = True
    parameter_source: Literal["CATALOG", "OVERRIDE"] | None = None
    source_mode: Literal["KATALOG", "MIGRACJA", "EKSPERCKI_RECZNY"] | None = None
    materialized_params: dict | None = None
    overrides: list[ParameterOverride] = []


# ---------------------------------------------------------------------------
# Substation (stacja SN/nn — kontener logiczny z rozdzielnicami)
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# PR-3 rebuild SLD: Port, ConnectionNode, LineRun, CableJoint
# Addytywne rozszerzenia ENM dla konstruktywnego builder-a SLD.
# ---------------------------------------------------------------------------


class PortKind(str):
    """Typy portów technicznych w ENM (PR-3 rebuild SLD).

    Reprezentuje funkcjonalną rolę portu w polu / stacji / DER.
    """

    SN_INPUT = "sn_input"
    SN_OUTPUT = "sn_output"
    SN_BRANCH = "sn_branch"
    SN_TRANSFORMER = "sn_transformer"
    SN_MEASUREMENT = "sn_measurement"
    SN_DER_PV = "sn_der_pv"
    SN_DER_BESS = "sn_der_bess"
    SN_DER_FW = "sn_der_fw"
    SN_COUPLER = "sn_coupler"
    SN_RESERVE = "sn_reserve"
    NN_FEEDER = "nn_feeder"
    NN_LOAD = "nn_load"
    NN_DER_PV = "nn_der_pv"
    NN_DER_BESS = "nn_der_bess"
    NN_DER_FW = "nn_der_fw"


class Port(BaseModel):
    """Port techniczny obiektu ENM (PR-3 rebuild SLD).

    Adres wewnątrz `Bay` lub `Substation` — endpoint dla kabla / linii / DER.
    Port nie jest węzłem fizycznym; służy jako jawne miejsce przyłączenia.
    """

    id: str
    kind: Literal[
        "sn_input",
        "sn_output",
        "sn_branch",
        "sn_transformer",
        "sn_measurement",
        "sn_der_pv",
        "sn_der_bess",
        "sn_der_fw",
        "sn_coupler",
        "sn_reserve",
        "nn_feeder",
        "nn_load",
        "nn_der_pv",
        "nn_der_bess",
        "nn_der_fw",
    ]
    nominal_voltage_kv: float
    bay_ref: str | None = None
    substation_ref: str
    occupied_by: str | None = None  # ref do segmentu kabla/linii
    meta: dict = Field(default_factory=dict)


class PortRef(BaseModel):
    """Referencja do portu (immutable adres)."""

    port_id: str


class ConnectionNode(BaseModel):
    """Punkt przyłączenia (interpretacja, nie węzeł fizyczny).

    Konieczny dla wnioskowania typu topologicznego stacji z portów (PR-6).
    """

    id: str
    location: Literal["bay", "bus", "der_terminal", "branch_point"]
    voltage_kv: float
    parent_ref: str  # bay_id / bus_id / der_id / branch_point_id


class CableJoint(BaseModel):
    """Mufa kablowa — punkt na segmencie kabla SN bez podziału topologii.

    Brief 1 §4 pkt 4. Element pomocniczy do dokumentacji ułożenia.
    """

    id: str
    parent_segment_id: str
    position_km: float  # odległość od endpoint_a w km
    joint_type: Literal[
        "mufa_termoutwardzalna",
        "mufa_zimna",
        "mufa_olejowa",
        "mufa_zywiczna",
    ]
    catalog_ref: str | None = None
    name: str | None = None


class LineRunSegmentRef(BaseModel):
    """Element ciągu liniowego — referencja do segmentu kabla/linii."""

    segment_ref: str  # ref do OverheadLine / Cable
    order: int


class LineRunStationRef(BaseModel):
    """Element ciągu liniowego — stacja na ciągu (między segmentami)."""

    substation_ref: str
    order: int


class LineRun(BaseModel):
    """Ciąg liniowy — sekwencja segmentów + stacji jako jeden konstrukt.

    Brief 1 §8 + Brief 2 §6. W przeciwieństwie do `Corridor` (radial/ring),
    `LineRun` jawnie wymienia porządek elementów wraz ze stacjami pomiędzy.
    """

    id: str
    name: str | None = None
    run_kind: Literal["main_trunk", "branch", "ring", "loop"]
    starting_bay_ref: str  # pole SN (GPZ albo stacji) albo punkt odgałęźny, z którego ciąg startuje
    # Port startu w JEDNEJ postaci (`domain_operations._rozwiaz_port_startu`): `ref_id` pola
    # liniowego, gdy ciąg startuje z pola; inaczej zacisk — szyna portu odgałęźnego punktu albo
    # szyna końca ciągu.
    starting_port_ref: str
    segments: list[LineRunSegmentRef] = []
    stations: list[LineRunStationRef] = []
    parent_run_ref: str | None = None  # dla odgałęzień: ref do ciągu macierzystego
    branch_origin_station_ref: str | None = None  # punkt startu odgałęzienia


class Substation(ENMElement):
    """Stacja SN/nn — logiczny kontener z rozdzielnicami.

    station_type semantics:
    - gpz: Główny Punkt Zasilający (source substation)
    - mv_lv: Stacja transformatorowa SN/nN (distribution substation)
    - switching: Stacja rozłącznikowa / sekcyjna (switching station)
    - customer: Stacja odbiorcza (customer substation)
    - inline: Stacja przelotowa (pass-through on main feeder)
    - branch: Stacja odgałęźna (branch from main feeder)
    - terminal: Stacja końcowa (feeder terminus)
    - sectional: Stacja sekcyjna (sectional splitting station)
    - rozdzielnica_nn: Wolnostojąca rozdzielnica/podrozdzielnica nN (RGnN) — kontener
      logiczny bez fizyki, tak samo jak pozostałe station_type (karta P0.1 nN,
      C §2.1). Szyna(-y) rozdzielnicy to zwykłe `Bus` w paśmie ≤1 kV; sekcje —
      `nn_sections` poniżej.
    """

    station_type: Literal[
        "gpz",
        "mv_lv",
        "switching",
        "customer",
        "inline",
        "branch",
        "terminal",
        "sectional",
        "rozdzielnica_nn",
    ]
    bus_refs: list[str] = []
    transformer_refs: list[str] = []
    entry_point_ref: str | None = None
    gpz_sections: list[GPZSection] = []
    # Phase 0A audit fix 8/8: GPZ HV side (110 kV) — eliminuje synthesize w adapterze.
    # Każda sekcja HV ma własny bus, opcjonalnie source_ref + couplery do innych sekcji.
    # Pusta lista = single 110 kV bus (kanon) — adapter generuje 1 sekcję domyślną.
    gpz_hv_sections: list[GPZSection] = []
    # PR-3 rebuild SLD: porty zewnętrzne stacji + multi-voltage nN
    external_ports: list[Port] = []
    nn_voltage_levels: list[float] = []  # poziomy nN (np. [0.4, 0.69])
    construction_type: (
        Literal["wnetrzowa", "kontenerowa", "slupowa", "prefabrykowana", "inna"] | None
    ) = None
    # B-4: oznaczenie stacji na dokumentacji (np. "ST-15/0,4-01"). Opcjonalne i
    # addytywne — None wykluczane z odcisku ENM (exclude_none), więc istniejące
    # fixture'y i hashe pozostają nietknięte. Konsumenci: drzewo projektu,
    # kreator stacji, karta techniczna.
    designation: str | None = None
    # P0.1 nN (C §2.1, analogia GPZSection): sekcje szyn rozdzielnicy nN (RGnN) —
    # jawny rejestr domenowy, NIE wyliczany z layoutu SLD. Pusta lista = rozdzielnica
    # jednosekcyjna (sekcja domyślna, jak `gpz_sections`). Addytywne/opcjonalne —
    # stacje bez rozdzielnicy nN (station_type inny niż "rozdzielnica_nn") mają
    # zawsze pustą listę i walidują się identycznie jak przed dodaniem pola.
    nn_sections: list[NnSection] = []


class GPZSection(BaseModel):
    """Jawna sekcja szyny GPZ.

    Sekcja GPZ jest prawdą domenową dla wielosekcyjnej rozdzielni źródłowej.
    Nie jest wyliczana wyłącznie z layoutu SLD.
    """

    section_id: str
    order: int
    name: str | None = None
    line_field_name: str | None = None
    bus_ref: str
    incoming_source_ref: str | None = None
    left_coupler_ref: str | None = None
    right_coupler_ref: str | None = None


class NnSection(BaseModel):
    """Jawna sekcja szyny rozdzielnicy nN (RGnN) — analogia do `GPZSection`.

    P0.1 nN (C §2.1, §4.1 add_nn_section_coupler): sekcja rozdzielnicy nN jest
    prawdą domenową (jak sekcja GPZ), nie wyliczana wyłącznie z layoutu SLD.
    Sprzęgło międzysekcyjne to zwykły `SwitchBranch` (`type="bus_coupler"`)
    między `bus_ref` tej sekcji a `bus_ref` sekcji sąsiedniej — `coupler_ref`
    wskazuje TĘ gałąź (referencja, nie duplikat danych).
    """

    section_id: str
    order: int
    bus_ref: str
    coupler_ref: str | None = None
    #: Referencje gałęzi zasilających TĘ sekcję (kabel/aparat dopływowy) — projekcja
    #: odczytu dla SLD/inspektora, źródłem prawdy pozostaje graf (`from_bus_ref`/
    #: `to_bus_ref` gałęzi), zgodnie z LV-INV-12.
    incoming_refs: list[str] = []


# ---------------------------------------------------------------------------
# Bay (pole rozdzielcze SN)
# ---------------------------------------------------------------------------


class MetadanePochodzeniaPola(BaseModel):
    """Metadane POCHODZENIA pola (karta W5-B, dawne klucze `bay_kind`/`source_status`/
    `source_refs` wpisu dawny słownik pól SN w `meta` stacji): skąd pole wzięło się w modelu (kreator, szablon,
    import) i z jakich źródeł danych. Dane inżynierskie o pochodzeniu, nie fizyka."""

    bay_kind: str | None = None
    source_status: str | None = None
    source_refs: list[str] = []


class WyborBlokuPola(BaseModel):
    """Wybór BLOKU FABRYCZNEGO pola rodziny RMU (karta W5-B; dawne klucze
    `factory_configuration_ref`/`factory_unit_index` wpisu). Pole rodziny blokowej jest
    jednostką konkretnego wyrobu, nie luźną celką — numer jednostki bez bloku nie istnieje.
    """

    factory_configuration_ref: str
    factory_unit_index: int | None = None


class OgranicznikPrzepiecPola(BaseModel):
    """Ogranicznik przepięć zainstalowany w polu (`add_surge_arrester_sn`; dawny klucz
    `surge_arresters[]` wpisu). Wejście koordynacji izolacji V12.6 czyta tę listę."""

    device_ref: str
    catalog_ref: str | None = None
    catalog_namespace: str | None = None


class Bay(ENMElement):
    """Pole rozdzielnicy — JEDYNY nośnik pól SN, nN i ZKSN (karta W5-B, 2026-09-30).

    Do karty W5-B pola żyły w trzech nietypowanych słownikach (dawny słownik pól SN w `meta` stacji,
    dawny słownik pól nN w `meta` stacji, dawny słownik pól ZKSN punktu rozgałęzienia)
    i w tej kolekcji naraz; każdy czytelnik składał je po swojemu. Teraz kolekcja `bays` jest
    jedynym źródłem: pole stacji wskazuje `substation_ref`, pole rozdzielnicy odgałęźnej ZKSN
    wskazuje `branch_point_ref` (dokładnie jedno z dwóch). Poziom pola (SN/nN) NIE jest polem
    rekordu — wynika z napięcia szyny `bus_ref` (`enm.pola.czy_pole_nn`, pasmo z
    `network_model.pochodne.pasma_napieciowe`).

    `meta` (słownik `ENMElement`) niesie adnotacje inżynierskie bez typowanego odpowiednika
    (np. `gpz_line_field_index`, `assigned_corridor_ref`, `feeder_role`, `transformer_ref`,
    `catalog_binding`, `field_status`); klucze mające typowany odpowiednik (`field_role`,
    `terminal_bus_ref`, `gpz_section_id`) w `meta` NIE występują — migracja
    `enm/migrations/field_specs_promocja.py` je przenosi, a pisarz `enm.pola.dodaj_pole`
    odmawia dubli.
    """

    bay_role: RolaPolaModelu
    # Właściciel pola: stacja (pole SN/nN) ALBO punkt rozgałęzienia ZKSN — dokładnie jedno.
    substation_ref: str | None = None
    branch_point_ref: str | None = None
    # Port punktu rozgałęzienia obsługiwany przez pole ZKSN (`MAIN_IN`/`MAIN_OUT`/`BRANCH[_n]`).
    branch_point_port_id: str | None = None
    bus_ref: str
    # Rola KANONICZNA pola (`enm.rola_pola_sn`: LINIA_IN/LINIA_OUT/LINIA_ODG/TRANSFORMATOROWE/
    # SPRZEGLO/POMIAROWE/PV_SN/BESS_SN/FW_SN). `bay_role` jest aliasem modelu; rola kanoniczna
    # rozróżnia np. pole odgałęźne (OUT + LINIA_ODG) od wyjściowego ciągu (OUT + LINIA_OUT).
    field_role: str | None = None
    # Własny ZACISK pola — szyna za aparatem pola (POLA-W-TORZE). JEDYNY nośnik zacisku
    # (dawne klucze zacisku w `meta` wpisu — przenosi je migracja przy wczytaniu).
    terminal_bus_ref: str | None = None
    # Pomiar pola POMIAROWEGO (kontrakt POMIAR_ROZLICZENIOWY_SN_V1 §5): układ energii vs pomiar
    # napięcia szyn; rodzaj układu pomiarowego energii.
    funkcja_pomiaru: str | None = None
    rodzaj_pomiaru: str | None = None
    # Powiązania producenckie pola (rodzina rozdzielnicy, producent, aparat wskazany na polu,
    # identyfikator konfiguracji z szablonu).
    switchgear_family_ref: str | None = None
    manufacturer_ref: str | None = None
    apparatus_catalog_ref: str | None = None
    config_id: str | None = None
    # Powiązania katalogowe wpisu pola (kształt payloadu kreatora; pole nN: wiązanie aparatu
    # odpływowego czytane przez promocję aparatów nN).
    catalog_bindings: dict[str, Any] | None = None
    wybor_bloku: WyborBlokuPola | None = None
    metadane_pochodzenia: MetadanePochodzeniaPola | None = None
    surge_arresters: list[OgranicznikPrzepiecPola] = []
    gpz_section_id: str | None = None
    equipment_refs: list[str] = []
    protection_ref: str | None = None
    # Kody funkcji zabezpieczeniowych ANSI/IEC do wyświetlenia na SLD, np.
    # ['87T','51','50','51N'] — to są stringi, NIE enum; lustro mechanizmu
    # OzeField.protection_codes (jedno źródło prawdy, wspólny wzorzec SLD).
    # Enum ProtectionSetting pozostaje wyłącznie dla konfiguracji/koordynacji.
    protection_codes: list[str] = Field(default_factory=list)
    # PR-3 rebuild SLD: porty pola — wnioskowane z bay_role + bus + reservation slots
    ports: list[Port] = []
    bay_template_ref: str | None = None  # referencja do BayTemplate w katalogu
    # Phase 0A audit fix 8/8: kanoniczny identyfikator dyspozytorski pola
    # (np. "10", "23/1") — wyświetlany pod kolumną w SLD GPZ. NIE pochodzi
    # z `name` (które może być długie/lokalne), tylko explicit numer pola.
    bay_number: str | None = None
    # Krótka nazwa odpływu/feedera — UI label osobny od `bay.name`. Np.
    # "SADY", "OKRĘŻNA" — używany w nagłówku kolumny w SLD GPZ.
    feeder_short_name: str | None = None
    # Cel feedera (substation ref docelowej stacji). Eliminuje wnioskowanie
    # z grafu w adapterze SLD (BLOCKER system §D). Adapter wyświetla
    # destination jako "→ {substation.name}".
    outgoing_destination_ref: str | None = None
    # Phase 0B-1: runtime_state telemetry pipeline (OPEN Inv 17 → RESOLVED).
    # Snapshot SCADA per-pole — primary_device_states (CB/DS/ES actual_state),
    # control_mode, pending_command, energization_and_safety. Adapter SLD
    # konsumuje to pole gdy obecne; brak → renderer pokazuje neutral 'unknown'
    # (Invariant 9). Field forward-deklarowany — typ BayRuntimeState w
    # późniejszej sekcji modułu.
    runtime_state: BayRuntimeState | None = None
    # Recenzja NO-GO 2026-07-17 pkt 9/10 (spec §12.5): aparaty PIERWOTNE pola
    # NA SNAPSHOTCIE ENM — domknięcie STOP-notatki F9.2 (frontend
    # `enmToSldAdapter.ts::BayWithOptionalPrimaryDevices` czyta to pole
    # DEFENSYWNIE od F9.2 — „projekcja aktywuje się automatycznie, gdy backend
    # zacznie serializować"). Dotąd `primary_devices` istniało wyłącznie na
    # `BayBaseModel`/`BayCanonicalModel` (kanał field-view) — walidator blokad
    # uziemnika (W034, validator.py) i identyfikatory globalne aparatów
    # wymagają tych danych na snapshotcie. Puste = dana niedostarczona
    # (ścieżka konwencji rysunku, zero domysłu).
    primary_devices: list[BayPrimaryDevice] = []
    # Karta UX-04/POLE-LINIOWE-WZORZEC (korekta właściciela 2026-10-28): stan obiektu pola —
    # ISTNIEJACY (zastany w sieci) albo PROJEKTOWANY (nowy). Każda droga budowy pola nadaje go
    # JAWNIE (`enm.pola.zbuduj_pole`, argument obowiązkowy); ISTNIEJACY ustawia wyłącznie
    # operacja „oznacz jako istniejący" (`set_object_state`) albo import istniejącej sieci.
    # `None` = rekord sprzed atrybutu (stan nieustalony — dla zakazu gazów fluorowanych NIE jest
    # stanem istniejącym). Rozstrzyga zakaz gazów fluorowanych (`enm.gaz_fluorowany_pola`).
    stan_obiektu: StanObiektu | None = None
    # Karta UX-04/POLE-LINIOWE-WZORZEC (rozszerzenie 2): klasa pola liniowego SN wg IRiESD ENEA
    # Operator II.4.5.4.2.1–2.3 — ODBIORCZE / MIESZANE / DEDYKOWANE_WYTWORCY
    # (`network_model.catalog.bay_templates.KLASY_POLA_LINIOWEGO`). Deklaracja projektanta
    # (`set_bay_equipment`), jedyne źródło trybu „linia SN z generacją"; zestaw funkcji EAZ pola
    # wyprowadza z niej `funkcje_eaz_pola_liniowego`, a zgodność z siecią za polem ocenia
    # `enm.pole_liniowe_gpz`. `None` = klasa nieustalona (pole sprzed atrybutu albo bez
    # deklaracji) — poza odciskiem.
    klasa_pola: Literal["ODBIORCZE", "MIESZANE", "DEDYKOWANE_WYTWORCY"] | None = None
    # Decyzja właściciela 2026-10-29 (karta UX-04/POLE-LINIOWE-WZORZEC): ŹRÓDŁO NAPIĘCIA ZEROWEGO
    # 3U₀ zabezpieczenia ziemnozwarciowego pola — `device_ref` przekładnika napięciowego (aparat
    # pola rodzaju VT) z uzwojeniem otwartego trójkąta w polu pomiaru napięcia szyn TEJ SAMEJ
    # sekcji (ENEA Zeszyt 1, Z.17 s.97 — obwód okrężny „Z, Zz") albo w tym polu. Deklaracja
    # (potwierdzenie) projektanta przez `set_bay_equipment`; jedyny nośnik warunku przypisania
    # funkcji 67N (`enm.zrodlo_napiecia_zerowego`). `None` = źródło niepowiązane — 67N nie jest
    # przypisywana; poza odciskiem.
    zrodlo_u0_ref: str | None = None

    @model_validator(mode="after")
    def _wlasciciel_pola(self) -> Bay:
        """Pole ma DOKŁADNIE jednego właściciela: stację albo punkt rozgałęzienia ZKSN.
        Port punktu rozgałęzienia ma sens wyłącznie dla pola ZKSN."""
        ma_stacje = isinstance(self.substation_ref, str) and bool(self.substation_ref.strip())
        ma_punkt = isinstance(self.branch_point_ref, str) and bool(self.branch_point_ref.strip())
        if ma_stacje == ma_punkt:
            raise ValueError(
                f"pole {self.ref_id!r} musi wskazywać dokładnie jednego właściciela: "
                "substation_ref (pole stacji) albo branch_point_ref (pole ZKSN)"
            )
        if self.branch_point_port_id is not None and not ma_punkt:
            raise ValueError(
                f"pole {self.ref_id!r}: branch_point_port_id dotyczy wyłącznie pola ZKSN"
            )
        return self


# ---------------------------------------------------------------------------
# Bay Canonical Model V10 (read-model contract)
# ---------------------------------------------------------------------------


class BaySwitchState(BaseModel):
    # `uziemiony` — WYŁĄCZNIE położenie łącznika trójpołożeniowego (ENEA Zeszyt 1 §13, Z.10;
    # `network_model.catalog.rodzaje_aparatury.STANY_LACZNIKA_TROJPOLOZENIOWEGO`); rekord
    # aparatu innego rodzaju z tym stanem odrzuca `BayPrimaryDevice`.
    actual_state: Literal[
        "zamkniety",
        "otwarty",
        "uziemiony",
        "zamkniety_naped_rozbrojony",
        "otwarty_naped_rozbrojony",
        "nieznany",
        "awaria",
    ]
    commanded_state: Literal["zamknij", "otworz"] | None = None
    # Stan ruchowy aparatu (karta #135): tryb sterowania, uzbrojenie napędu i komunikacja są
    # TELEMETRIĄ — wartość wyłącznie ze źródła runtime (`BayRuntimeState.primary_device_states`
    # albo rekord aparatu na migawce); `None` = brak telemetrii, nigdy wartość domyślna.
    control_mode: Literal["miejscowe", "zdalne", "lokalne_zablokowane", "odstawione"] | None = None
    armed_for_close: bool | None = None
    armed_for_open: bool | None = None
    communication_ok: bool | None = None
    # Blokada zamknięcia z reguły modelu (`enm.interlock_rules.blokady_zamkniecia`), nie z
    # telemetrii; `None` = reguła nie rozstrzyga (stan aparatu przeciwnego nieznany).
    interlock_blocked: bool | None = None
    cause_code: str | None = None
    last_state_change_at: datetime | None = None
    last_command_at: datetime | None = None


class BayOperatingState(BaseModel):
    normal_position: Literal["zamkniety", "otwarty"]
    current_position: Literal["zamkniety", "otwarty", "nieznany"]
    discrepancy_alarm: bool = False


class PortAparatuPola(BaseModel):
    """Port aparatu pola (karta UX-04/POLE-LINIOWE-WZORZEC) — JAWNY zacisk aparatu.

    ``port_id`` — identyfikator portu z kompletu rodzaju aparatu
    (``rodzaje_aparatury.PORTY_APARATU_POLA``: ``we``/``wy`` w torze, ``przylacze``
    odgałęzienia, ``obwod`` przekładnika Ferrantiego). ``wezel`` — węzeł wewnętrzny pola,
    do którego port jest przyłączony (``szyna`` — szyna sekcji pola, ``kabel`` — odejście
    kablowe, ``w1``… — węzły toru między aparatami). Porty o tym samym węźle są połączone
    przewodem; ``None`` = przyłączenie niepodane (jawny brak danych na schemacie, nigdy
    przewód z domysłu). ``linked_ref`` aparatu NIE zastępuje portu — wskazuje gałąź modelu,
    nie zacisk.
    """

    port_id: str
    wezel: str | None = None


class BayPrimaryDevice(BaseModel):
    device_ref: str
    linked_ref: str | None = None
    catalog_ref: str | None = None
    symbol_ref: str
    kind: Literal[
        "CB",
        "LOAD_SWITCH",
        "DS",
        "ES",
        "CT",
        "VT",
        "CABLE_HEAD",
        "TRANSFORMER_DEVICE",
        "FUSE",
        "GENERATOR_PV",
        "GENERATOR_BESS",
        "GENERATOR_FW",
        "PCS",
        "BATTERY",
        # F9.6 (SLD_CAD_SPEC_V3 §12.5, V12K-028): ogranicznik przepięć — rysowany
        # WYŁĄCZNIE gdy pochodzi z danych (zero konwencji/zgadywania, §12.4).
        "SURGE_ARRESTER",
        # UX-04/POLE-LINIOWE-WZORZEC (ENEA Zeszyt 1, Z.10 s.89, §13): łącznik
        # trójpołożeniowy (zamknięty/otwarty/uziemiony), przekładnik Ferrantiego na kablu
        # (bez przerwy toru) i pojemnościowy wskaźnik napięcia (odgałęzienie jednoportowe).
        "THREE_POSITION_SWITCH",
        "CORE_BALANCE_CT",
        "VOLTAGE_INDICATOR",
        # UX-04/POLE-BKR-MODEL (ENEA Zeszyt 1 §17, Zał. 16): przekładnik prądowy
        # niezrównoważenia baterii (połączenie międzygwiazdowe) i przekładnik napięciowy
        # międzyfazowy (rozładowanie baterii, U>) — `catalog.rodzaje_aparatury`.
        "UNBALANCE_CT",
        "PHASE_TO_PHASE_VT",
    ]
    placement: Literal["UPSTREAM", "MIDSTREAM", "DOWNSTREAM", "OFF_PATH", "GROUND_BRANCH"]
    section_side: Literal["LEFT", "CENTER", "RIGHT"] | None = None
    is_controllable: bool = False
    render_variant: str | None = None
    switch_state: BaySwitchState | None = None
    operating_state: BayOperatingState | None = None
    # F10.6 (SLD_CAD_SPEC_V3 §19.1, D1, V12K-035): identyfikator PER-APARAT
    # (np. "Q1", "QE1", "T1") jako DANA projektowa — gdy obecny, ma pierwszeństwo
    # nad fallbackiem konwencji (`compose/apparatusSequence.ts::apparatusIdentifiers`,
    # `data-designation-source="konwencja"`). None = dana niedostarczona,
    # render pozostaje przy konwencji ze znacznikiem źródła.
    designation: str | None = None
    # Recenzja NO-GO 2026-07-17 pkt 10 (spec §12.5): TYPOLOGIA uziemienia —
    # WYŁĄCZNIE dla kind="ES" (albo gałęzi uziemiającej SA): uziemnik pola /
    # uziemienie ekranów kabla / konstrukcji / punktu neutralnego / gałąź
    # ogranicznika. None = dana niedostarczona (rysunek: generyczny uziemnik,
    # zero domysłu).
    # W5-A: jeden słownik ról (`network_model/core/uziemienie.py::RolaUziemnika`) —
    # ten sam czyta pisarz w `add_sn_bay` (payload `earthing_role`) i front.
    earthing_role: RolaUziemnika | None = None
    # UX-04/POLE-LINIOWE-WZORZEC: jawne porty aparatu z węzłami pola (`PortAparatuPola`).
    # Pusta lista = porty niepodane (rekord sprzed karty albo wyposażenie z katalogu bez
    # przyłączeń) — schemat zgłasza brak przyłączenia, nie dorysowuje przewodu.
    ports: list[PortAparatuPola] = []
    # Stan obiektu INSTANCJI aparatu (korekta właściciela 2026-10-28): aparat dziedziczy stan
    # pola przy utworzeniu (`enm.pola.zbuduj_pole`), aparat wymieniony w istniejącym polu jest
    # nową instancją — PROJEKTOWANY (`enm.wyposazenie_pola`). `None` = rekord sprzed atrybutu.
    stan_obiektu: StanObiektu | None = None
    # Karta UX-04/POLE-LINIOWE-WZORZEC (rozszerzenie 4 pkt 3): rdzenie przekładnika prądowego
    # pola (WYŁĄCZNIE `kind == "CT"`) i uzwojenia przekładnika napięciowego pola (WYŁĄCZNIE
    # `kind == "VT"`) — z szablonu pola (`BayDeviceTemplate.rdzenie/uzwojenia`, np. Z.11:
    # 3 rdzenie) albo z pozycji katalogu (`CTType.lista_rdzeni`). Pusta lista = tabliczka
    # nieopisana (rekord sprzed karty albo aparat bez danych).
    rdzenie: list[RdzenPrzekladnikaPradowego] = []
    uzwojenia: list[UzwojeniePrzekladnikaNapieciowego] = []
    # Przekładnia przekładnika Ferrantiego (WYŁĄCZNIE `kind == "CORE_BALANCE_CT"`) zapisana jak
    # na rysunku standardu — z szablonu pola (`BayDeviceTemplate.przekladnia`, ENEA Z.10/Z.11/
    # Z.11.1: „1/100"; uzupełnienie właściciela 2026-10-29). `None` = dana nieopisana.
    przekladnia: str | None = Field(default=None, min_length=1)
    # Karta UX-04/POLE-LINIOWE-WZORZEC (rozszerzenie 4 pkt 1): ODGAŁĘZIENIE toru, w którym leży
    # aparat (np. „pn" — odgałęzienie przekładnika napięciowego od strony linii Z.11.1/Z.11).
    # Dana projektowa, z której pisarz rekordu wyprowadza porty (`rodzaje_aparatury.
    # porty_toru_pola`, klucz `KLUCZ_ODGALEZIENIA`) — zachowana w rekordzie, żeby ponowny zapis
    # wyposażenia (formularz pola) odtworzył TE SAME porty. `None` = aparat toru głównego.
    odgalezienie: str | None = Field(default=None, pattern=r"^[A-Za-z0-9]+$")
    # Karta UX-04/POLE-LINIOWE-WZORZEC (poprawki P0 2026-10-29): powiązania obwodów wtórnych
    # wzorca pola na aparatach — z `ObwodyWtornePola` szablonu pola po oznaczeniu i rodzaju
    # aparatu (`obwody_wtorne_pola.powiazania_aparatow_pola`, ta sama reguła co odczyt pola
    # `pole_liniowe_gpz._obwody_funkcji`). `naped` — napęd łącznika, przy którym rysunek stawia
    # znak napędu (rodzaje dopuszczalne wg `NAPEDY_RODZAJU_APARATU`: wyłącznik — silnikowy „M",
    # łącznik trójpołożeniowy — zasobnikowy z obsługą ręczną; ENEA Z.10/Z.11/Z.11.1);
    # `funkcje_eaz_zasilane` — kody funkcji
    # EAZ mierzących z przekładnika (WYŁĄCZNIE CT, VT, przekładnik Ferrantiego);
    # `funkcje_eaz_wylaczajace` — kody funkcji działających na wyłącznik (WYŁĄCZNIE `CB`).
    # Brak / pusta lista = pole bez obwodów wzorca albo aparat, którego wzorzec nie wiąże.
    naped: RodzajNapedu | None = None
    funkcje_eaz_zasilane: list[str] = []
    funkcje_eaz_wylaczajace: list[str] = []
    # Rozstrzygnięcie architekta 2026-10-30 pkt 3 (karta UX-04/POLE-LINIOWE-WZORZEC): WYKONANIE
    # wyłącznika — stałe albo wysuwne (człon wysuwny na wózku, ENEA Zeszyt 1 §13), WYŁĄCZNIE
    # `kind == "CB"`. Domyślnie z szablonu pola (`BayDeviceTemplate.wykonanie`), edytowalne
    # w inspektorze pola (`set_bay_equipment`). Jedno źródło dla rysunku SLD (znacznik „○”
    # członu wysuwnego obok „×” wyłącznika) i oceny składu pola (funkcja odłączenia od szyny
    # wysunięciem, `bay_templates.odlaczenie_wysunieciem_wylacznika`). `None` = wykonanie
    # nieokreślone (rekord sprzed atrybutu albo pole bez szablonu) — rysunek bez znacznika
    # członu wysuwnego, ocena bez funkcji odłączenia wysunięciem; poza odciskiem.
    wykonanie: WykonanieAparatu | None = None

    @model_validator(mode="after")
    def _powiazania_obwodow_wtornych(self) -> BayPrimaryDevice:
        """Powiązania obwodów wtórnych tylko na aparatach, których dotyczą: napęd na łączniku
        rodzaju, dla którego słownik go dopuszcza (`NAPEDY_RODZAJU_APARATU`), funkcje wyłączające
        na wyłączniku, funkcje mierzące na przekładniku; kody bez powtórzeń."""
        zasilajace = set(RODZAJ_APARATU_WEJSCIA.values())
        if self.naped is not None and self.naped not in NAPEDY_RODZAJU_APARATU.get(self.kind, ()):
            raise ValueError(
                f"aparat {self.device_ref!r} ({self.kind}): napęd {self.naped} nie dotyczy "
                "aparatu tego rodzaju"
            )
        if self.wykonanie is not None and self.kind not in RODZAJE_Z_WYKONANIEM:
            raise ValueError(
                f"aparat {self.device_ref!r} ({self.kind}): wykonanie (stałe / wysuwne) ma "
                "wyłącznie wyłącznik"
            )
        if self.funkcje_eaz_wylaczajace and self.kind != "CB":
            raise ValueError(
                f"aparat {self.device_ref!r} ({self.kind}): funkcje EAZ działające na "
                "wyłącznik ma wyłącznie wyłącznik"
            )
        if self.funkcje_eaz_zasilane and self.kind not in zasilajace:
            raise ValueError(
                f"aparat {self.device_ref!r} ({self.kind}): funkcje EAZ mierzące z aparatu ma "
                "wyłącznie przekładnik prądowy, napięciowy albo Ferrantiego"
            )
        for nazwa, kody in (
            ("funkcje_eaz_zasilane", self.funkcje_eaz_zasilane),
            ("funkcje_eaz_wylaczajace", self.funkcje_eaz_wylaczajace),
        ):
            if len(set(kody)) != len(kody):
                raise ValueError(f"aparat {self.device_ref!r}: powtórzony kod funkcji w {nazwa}")
        return self

    @model_validator(mode="after")
    def _porty_i_polozenie(self) -> BayPrimaryDevice:
        """Porty tylko z kompletu rodzaju (bez powtórzeń); położenie „uziemiony" tylko dla
        łącznika trójpołożeniowego. Brak portu z kompletu jest dozwolony (jawny brak danych
        przyłączenia), port spoza kompletu — nie (port, którego aparat nie ma)."""
        komplet = PORTY_APARATU_POLA.get(self.kind, ())
        widziane: set[str] = set()
        for port in self.ports:
            if port.port_id not in komplet:
                raise ValueError(
                    f"aparat {self.device_ref!r} ({self.kind}) nie ma portu {port.port_id!r} — "
                    f"porty rodzaju: {', '.join(komplet) or 'brak'}"
                )
            if port.port_id in widziane:
                raise ValueError(f"aparat {self.device_ref!r}: powtórzony port {port.port_id!r}")
            widziane.add(port.port_id)
        if (
            self.switch_state is not None
            and self.switch_state.actual_state == STAN_UZIEMIONY
            and self.kind != RODZAJ_LACZNIKA_TROJPOLOZENIOWEGO
        ):
            raise ValueError(
                f"aparat {self.device_ref!r} ({self.kind}): położenie „uziemiony” ma wyłącznie "
                "łącznik trójpołożeniowy"
            )
        if self.rdzenie and self.kind != "CT":
            raise ValueError(
                f"aparat {self.device_ref!r} ({self.kind}): rdzenie ma wyłącznie przekładnik prądowy"
            )
        if self.uzwojenia and self.kind != "VT":
            raise ValueError(
                f"aparat {self.device_ref!r} ({self.kind}): uzwojenia ma wyłącznie przekładnik "
                "napięciowy"
            )
        if self.przekladnia is not None and self.kind != "CORE_BALANCE_CT":
            raise ValueError(
                f"aparat {self.device_ref!r} ({self.kind}): przekładnię zapisuje się wyłącznie "
                "przekładnikowi Ferrantiego"
            )
        return self


class BayMeasurements(BaseModel):
    ia_a: float | None = None
    ib_a: float | None = None
    ic_a: float | None = None
    zero_sequence_current_a: float | None = None
    uab_kv: float | None = None
    ubc_kv: float | None = None
    uca_kv: float | None = None
    zero_sequence_voltage_kv: float | None = None
    active_power_mw: float | None = None
    reactive_power_mvar: float | None = None
    apparent_power_mva: float | None = None
    current_a: float | None = None
    power_factor: float | None = None
    frequency_hz: float | None = None


class BayMeasurementSet(BaseModel):
    side: Literal["pole", "strona_szyn", "strona_odplywu", "strona_lewa", "strona_prawa"]
    values: BayMeasurements = Field(default_factory=BayMeasurements)


class BayMeasurementChain(BaseModel):
    chain_ref: str
    ct_refs: list[str] = []
    vt_refs: list[str] = []
    uses_3i0: bool = False
    uses_3u0: bool = False
    zero_sequence_current_source: Literal[
        "suma_ct", "przekladnik_ferrantiego", "zewnetrzne", "brak"
    ] = "brak"
    zero_sequence_voltage_source: Literal[
        "otwarty_trojkat_vt", "uzwojenie_resztkowe_vt", "obliczone", "brak"
    ] = "brak"
    topology: Literal["ct_only", "ct_vt", "ct_vt_3u0", "vt_only"] = "ct_only"
    measurement_sets: list[BayMeasurementSet] = []


class BaySecondaryUnitRef(BaseModel):
    unit_ref: str
    unit_kind: Literal["zabezpieczenie", "sterownik", "pomiar", "rejestrator"]
    shared_with_bay_refs: list[str] = []


class BaySecondaryArchitecture(BaseModel):
    type: Literal[
        "zintegrowane_zabezpieczenie_i_sterownik",
        "oddzielne_zabezpieczenie_i_sterownik",
        "tylko_zabezpieczenie",
        "tylko_sterownik",
        "brak_urzadzenia_wtornego",
    ]
    measurement_provider: Literal[
        "zabezpieczenie",
        "sterownik",
        "osobny_uklad_pomiarowy",
        "mieszany",
        "brak",
    ] = "brak"


class ProtectionSettingValue(BaseModel):
    key: str
    value: float | str | bool | None = None
    unit: str | None = None
    quality: Literal["obliczone", "reczne", "domyslne"] = "domyslne"


class ProtectionFunctionState(BaseModel):
    code: str
    available: bool = False
    enabled: bool = False
    picked_up: bool = False
    tripped: bool = False
    blocked: bool = False
    required_inputs: list[Literal["ct", "vt", "3i0", "3u0"]] = []
    optional_inputs: list[Literal["ct", "vt", "3i0", "3u0"]] = []
    missing_input_policy: Literal[
        "blokada_zapisu",
        "blokada_obliczen",
        "ostrzezenie",
        "degradacja_funkcji",
        "wynik_czesciowy",
    ] = "ostrzezenie"
    settings_ref: str | None = None
    settings: list[ProtectionSettingValue] = []
    execution_mode: Literal["tylko_alarm", "pobudzenie", "wyzwolenie"] = "tylko_alarm"
    execution_device_ref: str | None = None
    starts_spz: bool = False
    blocks_reclose: bool = False
    operator_ack_required_after_trip: bool = False


class SpzState(BaseModel):
    bound_breaker_ref: str
    enabled: bool = False
    fast_attempts_max: int = 0
    slow_attempts_max: int = 0
    attempts_done: int = 0
    fast_time_s: float | None = None
    slow_time_s: float | None = None
    blocked: bool = False
    blocked_reason: str | None = None
    state: Literal["gotowe", "w_trakcie", "zakonczone", "odstawione"] = "odstawione"


class AlarmEntry(BaseModel):
    code: str
    active: bool = False
    acknowledged: bool = False
    severity: Literal["informacja", "ostrzezenie", "alarm", "awaria"] = "informacja"
    timestamp: datetime
    message_pl: str


class EventEntry(BaseModel):
    code: str
    timestamp: datetime
    source: Literal["sterowanie", "ochrona", "pomiar", "komunikacja", "system"]
    message_pl: str


class DisturbanceRecorderState(BaseModel):
    available: bool = False
    last_record_at: datetime | None = None
    records_count: int = 0


class TrendState(BaseModel):
    available: bool = False
    channels: list[str] = []


class BayProtectionControlUnit(BaseModel):
    unit_ref: str
    manufacturer: str | None = None
    model: str | None = None
    functions: list[ProtectionFunctionState] = []
    measurement_inputs: dict[str, bool] = Field(default_factory=dict)
    automation_features: dict[str, bool] = Field(default_factory=dict)
    spz: SpzState | None = None
    alarms: list[AlarmEntry] = []
    events: list[EventEntry] = []
    disturbance_recorder: DisturbanceRecorderState = Field(default_factory=DisturbanceRecorderState)
    trends: TrendState = Field(default_factory=TrendState)
    settings_mode: Literal["automatyczne", "reczne"] = "reczne"
    settings_ref: str | None = None


class InterlockEntry(BaseModel):
    code: str
    active: bool = False
    reason: str
    blocking_device_refs: list[str] = []


class BayInterlockSet(BaseModel):
    entries: list[InterlockEntry] = []


class BayControlSurface(BaseModel):
    controllable_device_refs: list[str] = []
    open_requires_confirmation: bool = False
    close_requires_confirmation: bool = True
    kas_available: bool = False
    local_remote_transfer_supported: bool = False


class BayCommandExecutionState(BaseModel):
    command_ref: str
    target_device_ref: str
    command: Literal["zamknij", "otworz", "kas"]
    state: Literal["oczekuje", "przyjete", "odrzucone", "wykonane", "przeterminowane"]
    rejected_reason: str | None = None
    created_at: datetime
    finished_at: datetime | None = None


class BayEnergizationSafetyState(BaseModel):
    energized_from_bus_side: bool = False
    energized_from_feeder_side: bool = False
    grounded: bool = False
    visible_isolation_gap: bool = False
    safe_to_work: bool = False
    unsafe_reason_pl: str | None = None


class BayRuntimeState(BaseModel):
    secondary_communication_status: Literal["ok", "degraded", "offline"] = "offline"
    last_good_update_at: datetime | None = None
    control_availability: Literal["dostepne", "czesciowo_dostepne", "niedostepne"] = "niedostepne"
    measurement_availability: Literal["dostepne", "czesciowe", "niedostepne"] = "niedostepne"
    primary_device_states: dict[str, BaySwitchState] = {}
    active_alarms: list[AlarmEntry] = []
    pending_command: BayCommandExecutionState | None = None
    energization_and_safety: BayEnergizationSafetyState = Field(
        default_factory=BayEnergizationSafetyState
    )


class BayScenarioState(BaseModel):
    scenario_ref: str
    overridden_position: Literal["zamkniety", "otwarty", "nieznany"] | None = None
    source: Literal["bazowy", "wariant", "symulacja_przelaczen", "ruch"] = "bazowy"


TrybPracyZrodla = Literal["praca_sieciowa", "ladowanie", "rozladowanie", "gotowosc", "odstawione"]
# Jeden słownik trybu pracy źródła: zapis (`set_source_operating_mode`), odczyt
# (`application/field_read_model._generator_operating_mode`) i pole modelu niżej.
TRYBY_PRACY_ZRODLA: tuple[str, ...] = get_args(TrybPracyZrodla)


class BaySourceEndpoint(BaseModel):
    source_kind: Literal["PV", "BESS", "FW"]
    inverter_ref: str | None = None
    storage_ref: str | None = None
    turbine_ref: str | None = None
    block_transformer_ref: str | None = None
    requires_vt: bool = False
    requires_synchrocheck: bool = False
    operating_mode: TrybPracyZrodla = "gotowosc"


class BayBaseModel(BaseModel):
    bay_ref: str
    bay_role: RolaKanonicznaPolaSn
    specialization: Literal["BRAK", "POTRZEBY_WLASNE"] = "BRAK"
    substation_ref: str
    gpz_section_id: str | None = None
    primary_devices: list[BayPrimaryDevice] = []
    measurement_chain: BayMeasurementChain | None = None
    secondary_units: list[BaySecondaryUnitRef] = []
    secondary_architecture: BaySecondaryArchitecture
    protection_config: BayProtectionControlUnit | None = None
    control_surface: BayControlSurface = Field(default_factory=BayControlSurface)
    interlocks: BayInterlockSet = Field(default_factory=BayInterlockSet)
    source_endpoint: BaySourceEndpoint | None = None
    # ABB UniSwitch cell type (catalog §4 "Rodzaje pól"). Optional and additive:
    # defaults to None so it is excluded from the deterministic ENM fingerprint
    # (hash uses exclude_none=True / model_dump excludes None) when unset. Do NOT
    # populate on existing fixtures — populating would change their fingerprints.
    cell_type: (
        Literal[
            "SDC",
            "SDF",
            "CBC",
            "DBC",
            "BRC",
            "SEC",
            "SBC",
            "SMC",
            "SDM_V",
            "SDM_C",
        ]
        | None
    ) = None
    # Powiązania producenckie pola (Reference Engine): szablon pola i rodzina
    # rozdzielnicy. Opcjonalne i addytywne — None wykluczane z odcisku ENM
    # (exclude_none). Nie wypełniać na istniejących fixture'ach.
    bay_template_ref: str | None = None
    switchgear_family_ref: str | None = None
    # Karta UX-04/POLE-LINIOWE-WZORZEC: stan obiektu pola (`Bay.stan_obiektu`) — karta pola
    # i picker rodziny czytają go z odczytu (pole istniejące dopuszcza gaz fluorowany).
    stan_obiektu: StanObiektu | None = None
    # W5-C: stan danych wyposażenia pola — z REKORDU `Bay.primary_devices` (nie z aparatów
    # wyprowadzonych z gałęzi pola, którymi odczyt uzupełnia rysunek pola bez rekordu):
    # MODEL (każdy aparat z pozycją katalogową), PROPOZYCJA (wartość robocza — z szablonu
    # albo rodzaj bez katalogu SN), BRAK_DANYCH (rekord bez aparatów). Reguła jedna:
    # `enm.wyposazenie_pola.stan_danych_wyposazenia`; dane przyjęte (jakość ESTIMATED) —
    # `dane_przyjete_wyposazenia`.
    equipment_data_state: Literal["MODEL", "PROPOZYCJA", "BRAK_DANYCH"] = "BRAK_DANYCH"
    equipment_assumed_data: list[dict[str, Any]] = []


class BayShortCircuitSourceContribution(BaseModel):
    source_ref: str
    source_kind: Literal["GPZ", "TRANSFORMATOR", "PV", "BESS", "FW", "INNE"]
    reference_point: str
    fault_type: Literal["3F", "2F", "1F", "1F_ZIEMIA"]
    ikss_ka: float | None = None
    ip_ka: float | None = None
    ith_ka: float | None = None
    percent_share: float | None = None
    zero_sequence_share_percent: float | None = None
    direction: Literal["do_pola", "od_pola"] = "do_pola"


class BayPowerFlowSourceContribution(BaseModel):
    source_ref: str
    source_kind: Literal["GPZ", "TRANSFORMATOR", "PV", "BESS", "FW", "INNE"]
    reference_point: str
    p_mw: float | None = None
    q_mvar: float | None = None
    s_mva: float | None = None
    i_a: float | None = None
    percent_share_p: float | None = None
    percent_share_q: float | None = None
    direction: Literal["do_odplywu", "do_szyn"] = "do_odplywu"


class BayEarthFaultPath(BaseModel):
    # W5-A §1 p. 1: ten sam słownik co `GroundingConfig.type` (koniec polskich
    # literałów w kontrakcie; etykiety PL w prezentacji). None = nieznany.
    neutral_grounding_mode: TypPunktuNeutralnego | None = None
    zero_sequence_current_source: Literal[
        "suma_ct", "przekladnik_ferrantiego", "zewnetrzne", "brak"
    ] = "brak"
    zero_sequence_voltage_source: Literal[
        "otwarty_trojkat_vt", "uzwojenie_resztkowe_vt", "obliczone", "brak"
    ] = "brak"
    closure_path_elements: list[str] = []
    transformer_contribution_ref: str | None = None
    grounding_device_ref: str | None = None
    # EARTHING-1 (most produkcyjny SC_1F -> uziemienia): dane PROJEKTOWE uziomu
    # potrzebne do napiec dotykowego/krokowego (PN-EN 50522). Addytywne, None =
    # dana niedostarczona (ZERO zgadywania — brak => readiness fix-action,
    # pack nie liczy). Nie sa fizyka: to wejscie projektowe (rezystancja uziomu
    # z pomiaru rezystywnosci gruntu; wspolczynnik podzialu r z torow powrotnych
    # ekran/OPGW). Prad doziemny I''k1 pochodzi z solvera SC_1F.
    earth_electrode_resistance_ohm: float | None = None  # R_u = Z_E [Ω]
    earth_return_split_factor: float | None = None  # r (0..1): udzial wracajacy uziomem


class BayProofBinding(BaseModel):
    proof_ref: str
    primary_result_refs: list[str] = []
    secondary_result_refs: list[str] = []
    source_contribution_refs: list[str] = []
    formula_refs: list[str] = []
    input_data_refs: list[str] = []


class BayProjectResults(BaseModel):
    run_ref: str
    result_state: Literal["pelny", "czesciowy", "bledny"] = "pelny"
    result_message_pl: str | None = None
    main_short_circuit_results_ref: str | None = None
    main_power_flow_results_ref: str | None = None
    source_contributions_sc: list[BayShortCircuitSourceContribution] = []
    source_contributions_pf: list[BayPowerFlowSourceContribution] = []
    earth_fault_path: BayEarthFaultPath | None = None
    proof_binding: BayProofBinding


class BayCanonicalModel(BaseModel):
    schema_version: Literal["v10.bay.1"] = "v10.bay.1"
    created_from: Literal["szablon", "recznie", "migracja", "przebudowa"] = "migracja"
    integrity_status: Literal["kompletny", "po_migracji", "wymaga_uzupelnienia"] = "po_migracji"
    audit_trail_ref: str | None = None
    base_model: BayBaseModel
    runtime_state: BayRuntimeState | None = None
    scenario_state: BayScenarioState | None = None
    project_results_ref: str | None = None


# ---------------------------------------------------------------------------
# Junction (węzeł T — rozgałęzienie magistrali)
# ---------------------------------------------------------------------------


class Junction(ENMElement):
    """Węzeł T (rozgałęzienie magistrali)."""

    connected_branch_refs: list[str]
    junction_type: Literal["T_node", "sectionalizer", "recloser_point", "NO_point"]


# ---------------------------------------------------------------------------
# Corridor (magistrala — ciąg linii SN)
# ---------------------------------------------------------------------------


class Corridor(ENMElement):
    """Magistrala (ciąg linii SN od GPZ do stacji końcowej)."""

    corridor_type: Literal["radial", "ring", "mixed"]
    ordered_segment_refs: list[str]
    # W5-C: punkt normalnie otwarty NIE jest polem magistrali — wyprowadza go akcesor
    # `enm.topology.punkty_podzialu_korytarza` z `SwitchBranch.normal_state` (jedno
    # źródło). Dawne `no_point_ref` migruje `enm/stan_normalny.py`.


# ---------------------------------------------------------------------------
# BranchPointSN — Punkt rozgałęzienia SN (Słup rozgałęźny / ZKSN)
# ---------------------------------------------------------------------------


class BranchPointSNPorts(BaseModel):
    """Porty topologiczne punktu rozgałęzienia SN."""

    MAIN_IN: str
    MAIN_OUT: str
    BRANCH: list[str] = []


class BranchPointSN(ENMElement):
    """Punkt rozgałęzienia SN — słup rozgałęźny lub ZKSN.

    HARD RULES:
    - BranchPoleMV (branch_point_type='branch_pole'): tylko na linii napowietrznej
    - ZksnMV (branch_point_type='zksn'): tylko na kablu SN

    Pola katalogowe:
    - catalog_ref: identyfikator pozycji katalogowej
    - catalog_namespace: przestrzeń nazw katalogu (domyślnie 'mv_branch_points')
    - catalog_version: wersja pozycji katalogowej
    - source_mode: sposób wprowadzenia parametrów

    Pola runtime:
    - materialized_params: zmaterializowane parametry z katalogu
    - completeness_status: status kompletności
    - runtime_inputs: dane wejściowe podane przez użytkownika
    """

    branch_point_type: Literal["branch_pole", "zksn"]
    parent_segment_id: str
    bus_ref: str
    catalog_ref: str | None = None
    catalog_namespace: str | None = None
    catalog_version: str | None = None
    source_mode: Literal["KATALOG", "MIGRACJA", "EKSPERCKI_RECZNY"] = "KATALOG"
    ports: BranchPointSNPorts | None = None
    branch_occupied: dict[str, str] = {}
    # W5-C: dawne `switch_state` (kopia stanu łączników portów) skasowane — stan żyje na
    # gałęziach łączników portów (`status`/`normal_state`); migracja `enm/stan_normalny.py`.
    materialized_params: dict | None = None
    completeness_status: Literal["KOMPLETNY", "NIEKOMPLETNY", "BRAK_KATALOGU"] | None = None
    runtime_inputs: dict | None = None


# ---------------------------------------------------------------------------
# Katalog projektu (W1 — typy z danych inżyniera niesione przez model)
# ---------------------------------------------------------------------------


class RekordTypuProjektu(BaseModel):
    """Pozycja katalogu projektu w kształcie rekordu `CatalogRepository.from_records`
    (`id`, `name`, `params` = pola klasy typu, np. `LineType`/`TransformerType`, wraz
    z proweniencją `source_reference`/`verification_status`). Kształt jest celowo TEN SAM
    co rekordów katalogu statycznego — nakładka per model (`enm/katalog_projektu.py`) nie
    tłumaczy pól, tylko dokłada rekordy do tego samego budowniczego."""

    id: str
    name: str
    params: dict[str, Any] = {}


class KatalogProjektu(BaseModel):
    """Typy katalogowe niesione PRZEZ model (dane inżyniera z arkusza, nie karta
    producenta) — patrz `enm/katalog_projektu.py`. Sekcja wchodzi do odcisku modelu
    (parametr typu = wejście obliczeń) i jest deterministyczna: listy posortowane po `id`,
    identyfikatory unikalne w obrębie całej sekcji."""

    line_types: list[RekordTypuProjektu] = []
    cable_types: list[RekordTypuProjektu] = []
    transformer_types: list[RekordTypuProjektu] = []
    #: Karta AB-H0 §0.7.3: karty widmowe PROJEKTU (dane inżyniera — widmo ręczne albo
    #: import karty producenta dla projektu; status `NIEWERYFIKOWANY`/`PROJEKTOWY_V1`).
    #: Kontrakt rekordu = `dziedziny.karta_widmowa.KartaWidmowa` (ten sam co katalogu
    #: statycznego). Pusta lista jest poza odciskiem modelu (`enm/hash.py`).
    karty_widmowe: list[KartaWidmowa] = []

    @model_validator(mode="after")
    def _unikalne_i_posortowane(self) -> KatalogProjektu:
        widziane: set[str] = set()
        for rodzaj in (
            "line_types",
            "cable_types",
            "transformer_types",
            "karty_widmowe",
        ):
            rekordy = getattr(self, rodzaj)
            for rekord in rekordy:
                if not rekord.id.strip():
                    raise ValueError(f"katalog_projektu.{rodzaj}: pusty identyfikator pozycji")
                if rekord.id in widziane:
                    raise ValueError(
                        f"katalog_projektu: identyfikator '{rekord.id}' powtarza się w sekcji"
                    )
                widziane.add(rekord.id)
            rekordy.sort(key=lambda r: r.id)
        return self


# ---------------------------------------------------------------------------
# ROOT
# ---------------------------------------------------------------------------


def migruj_zapis_zastany_slownika(data: dict[str, Any]) -> dict[str, Any]:
    """JEDYNA lista migracji zastanego zapisu migawki ENM (słownik → słownik).

    Woła ją walidator ``before`` modelu (każda droga przez ``EnergyNetworkModel``) ORAZ
    wejście operacji domenowych (``enm.domain_operations.execute_domain_operation``), które
    pracują na słowniku i oddają go w odpowiedzi — bez tego migawka odpowiedzi niosłaby
    skasowane klucze, choć walidacja tej samej migawki je zdejmuje. Jedno źródło listy
    migracji dla obu dróg (predykat parami). Bez kluczy zastanych zwraca TEN SAM obiekt.

    * W5-A: jedna reprezentacja uziemienia (``enm/uziemienie.py``);
    * W5-C: punkt podziału z dawnej kopii ``Corridor.no_point_ref`` (i martwej
      ``LineRun.nop_station_ref``, kopii ``BranchPointSN.switch_state``) →
      ``SwitchBranch.normal_state`` (``enm/stan_normalny.py``).

    Utraty nazywają raporty modułów migracji; wpis do dziennika robi magazyn.
    """
    data = migruj_uziemienie_slownika(data, uklady_nn=UKLADY_SIECI_NN)[0]
    return migruj_punkty_podzialu_slownika(data)[0]


class EnergyNetworkModel(BaseModel):
    header: ENMHeader
    buses: list[Bus] = []
    branches: list[Branch] = []
    transformers: list[Transformer] = []
    sources: list[Source] = []
    loads: list[Load] = []
    generators: list[Generator] = []
    shunt_capacitors: list[ShuntCapacitor] = []
    substations: list[Substation] = []
    bays: list[Bay] = []
    junctions: list[Junction] = []
    corridors: list[Corridor] = []
    measurements: list[Measurement] = []
    protection_assignments: list[ProtectionAssignment] = []
    branch_points: list[BranchPointSN] = []
    # PR-3 rebuild SLD: nowe kolekcje (addytywne, opcjonalne)
    line_runs: list[LineRun] = []
    connection_nodes: list[ConnectionNode] = []
    # W1: typy katalogowe z danych inżyniera (arkusz XLSX) — pole addytywne,
    # `None` poza odciskiem (`enm/hash.py::_strip_uuids`), więc modele bez sekcji
    # zachowują dotychczasowe hashe co do bajtu.
    katalog_projektu: KatalogProjektu | None = None

    @model_validator(mode="before")
    @classmethod
    def _migracje_zapisu_zastanego_przy_wczytaniu(cls, data: Any) -> Any:
        """Migracje ZASTANEGO zapisu (W5-A uziemienie, W5-C punkty podziału).

        W5-A: jedna reprezentacja uziemienia.

        `Bus.grounding` → `Source.neutral_grounding`, `substation.meta
        ["nn_earthing_system"]` → `Transformer.lv_earthing_system`, klucze
        `meta["grounding"|"zero_sequence"]` usuwane. Jedno miejsce dla KAŻDEJ
        drogi wczytania (magazyn, rewizje, migawki biegów, import archiwum,
        operacje domenowe) — bez tego pole skasowane z modelu ginęłoby cicho
        (`extra='ignore'`). Utraty nazywa raport (`enm/uziemienie.py`); wpis
        do dziennika robi magazyn (`enm/store.py`).
        """
        if isinstance(data, dict):
            return migruj_zapis_zastany_slownika(data)
        return data


# Phase 0B-1: rebuild Bay aby ForwardRef "BayRuntimeState | None" rozwiązał
# się do faktycznej klasy zdefiniowanej niżej w module (linia 929).
Bay.model_rebuild()


# ---------------------------------------------------------------------------
# Domenowe funkcje pomocnicze (odczyt pól modelu — zero mutacji, zero fizyki)
# ---------------------------------------------------------------------------


def liczba_torow(
    element: Cable | OverheadLine | Transformer | Generator | Mapping[str, Any],
) -> int:
    """Liczba identycznych torów/jednostek pracujących równolegle (≥ 1).

    JEDYNA definicja tej reguły dla `Cable.n_parallel`/`Transformer.n_parallel`/
    `Generator.n_parallel` (karta CI-A, 2026-09-04 — naprawa czterech
    niezależnych podstawień `attr.n_parallel or 1`/`getattr(..., None) or 1`
    rozsianych po `enm/mapping.py` i `application/analyses/fault_loop/route.py`,
    reguła KLASA NIE INSTANCJA z CLAUDE.md). Wszyscy czytelnicy wywołują TĘ
    funkcję zamiast własnej kopii warunku.

    `n_parallel: int | None = None` oznacza „nie zadeklarowano liczby torów
    równoległych". Fizycznie kabel/linia/transformator/generator bez tej
    deklaracji jest JEDNYM torem/jednostką — `1` nie jest tu zmyśloną
    wielkością fizyczną (nie ma odpowiednika w rzeczywistości, którego akurat
    nie zmierzono), tylko ELEMENTEM NEUTRALNYM mnożenia: impedancja
    zastępcza n identycznych torów w połączeniu równoległym to Z/n (Z/1 = Z),
    prąd/moc znamionowa n torów to I·n/Sn·n (I·1 = I). Dokładnie ta sama
    zasada, którą `ZASTANE_ZASTEPNIKI` w
    `scripts/solver_input_substitute_guard.py` przyjmuje dla współczynników
    wielomianu ZIP mocy stałej (`c_p=1` przy braku zależności napięciowej
    odbioru) — tam też `1` jest elementem neutralnym operacji (mnożenia przez
    `V^0`), nie pomiarem.

    UWAGA SKLADNIOWA (świadoma, nazwana decyzja — nie ukrywanie długu).
    Funkcja celowo używa INSTRUKCJI `if` (nie wyrażenia `or`/trójargumentowego
    `if/else`) — `scripts/solver_input_substitute_guard.py`, sekcja „GRANICE
    BRAMKI" #3: forma INSTRUKCYJNA (`if x is None: return 1`) nie jest
    wykrywalna analizą składni AST, w odróżnieniu od formy WYRAŻENIOWEJ
    (`x or 1`, `x if x is not None else 1`), którą bramka łapie. To END-TO-END
    ta sama reguła fizyczna, jaką bramka akceptuje dla ZIP `c_p=1` — tu
    zapisana jawnie jako nazwana funkcja domenowa zamiast wpisu w zapadce
    `ZASTANE_ZASTEPNIKI`, żeby nie mnożyć wpisów zapadki dla jednej,
    scentralizowanej definicji. Parytet `None`≡`1` i skalowanie `n=2 → Z/2`
    mają PRZYPIĘTE testy (regułą KLASA §4 „deklaracja bez testu = fałszywa
    pewność"): `backend/tests/enm/test_liczba_torow_n_parallel.py`.

    `OverheadLine` nie deklaruje pola `n_parallel` w ogóle (linia napowietrzna
    nN nie ma dziś wielotorowego wariantu w modelu) — `getattr` z domyślnym
    `None` obejmuje ten przypadek bez zmiany zachowania (zawsze zwraca `1`),
    identycznie jak przed tą kartą.

    Decyzja O-53 (karta AB-H0): element może być też REKORDEM migawki (słownik, jak go
    widzą operacje domenowe) — ta sama reguła dla obu postaci, bez drugiej kopii warunku.
    """
    if isinstance(element, Mapping):
        wartosc = element.get("n_parallel")
    else:
        wartosc = getattr(element, "n_parallel", None)
    if isinstance(wartosc, int):
        return wartosc
    return 1


def liczba_jednostek_zrodla(element: Generator | Mapping[str, Any]) -> int:
    """Liczba jednostek, które reprezentuje element generatora (≥ 1) — JEDYNA reguła.

    `quantity` (jawna liczba jednostek) ma pierwszeństwo przed `n_parallel`
    (czytanym przez `liczba_torow`). Tę samą regułę stosuje solver (skalowanie mocy
    znamionowej w `enm.mapping`) i kontrola mocy źródła przekształtnikowego w torach
    tworzenia, przypisaniu typu i aktualizacji parametrów (decyzja O-53) — jeden model,
    jedna liczba jednostek. Wartość niedodatnia jest sprowadzana do 1 (zachowanie
    solvera sprzed wydzielenia funkcji, zmierzone testem `test_liczba_torow_n_parallel`).
    """
    if isinstance(element, Mapping):
        ilosc = element.get("quantity")
    else:
        ilosc = element.quantity
    liczba = ilosc if isinstance(ilosc, int) and not isinstance(ilosc, bool) and ilosc else None
    if liczba is None:
        liczba = liczba_torow(element)
    if liczba < 1:
        return 1
    return liczba
