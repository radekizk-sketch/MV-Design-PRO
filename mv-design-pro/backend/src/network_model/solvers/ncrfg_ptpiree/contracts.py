"""Kontrakty solvera testów NC RfG / PTPiREE — wersja V2 (plan AB §6, karta AB-1a Pakiet C).

Kontrakt jest addytywny wobec zamrożonych wyników SC/PF. Wejście opisuje JAWNIE
zadeklarowane zdolności modułu wytwarzania energii; solver niczego nie dobiera sam.

ZASADY V2 (kontrakt werdyktu wyjaśnialnego, ``docs/domain/KONTRAKT_WERDYKTU_WYJASNIALNEGO.md``):

* każdy z 20 testów niesie rekord ``OcenaKryterium`` (pole ``ocena``) — test niestosowalny to
  rekord ze ``stosowalnosc.dotyczy=False`` i statusem ``NIE_DOTYCZY``;
* ``verdict`` (``pass`` / ``fail`` / ``no_data`` / ``not_required``) jest enumem WEWNĘTRZNYM
  wyprowadzanym JEDNĄ funkcją całkowitą ``werdykt_maszynowy(ocena)``; ``summary_pl``,
  ``required`` i ``required_reason_pl`` są kopiami pól rekordu (walidator odrzuca rozjazd);
* moduł nie ma agregatu (ani statusu zbiorczego, ani liczników) — zgodność per wymaganie
  liczy ``application/ncrfg_compliance/ocena_wymagan.py`` z rekordów ``ocena`` testów;
* wejście bez fabrykacji: ``der_kind``, ``module_family`` i ``operator_id`` są wymagane,
  ``extra="forbid"`` (pole nieznane — w tym dawny status certyfikatu z żądania — to błąd
  walidacji), wersja procedury pochodzi z profilu, dowód certyfikatu wyprowadza serwer
  (``DowodCertyfikatu`` z mostu modelu) i solver dostaje go osobnym argumentem.
"""

from __future__ import annotations

from datetime import date
from typing import Any, Literal, Self

from catalog.profiles.nc_rfg import DokumentWarstwy, KlasyfikacjaModulu, Technologia, TypModulu
from enm.deklaracje_modulu import DataUmowy, ModulIstniejacy
from enm.nastawy_modulu import NastawyZabezpieczenModulu
from pydantic import BaseModel, ConfigDict, Field, FiniteFloat, model_validator
from werdykt.kontrakt import OcenaKryterium, PodstawaWymagania, StatusWerdyktu
from werdykt.proweniencja import ClaimKind

#: V2 (plan AB §6): rekord ``OcenaKryterium`` per test, bez agregatu modułu, wejście bez
#: wartości domyślnych i bez statusu certyfikatu z żądania.
NCRFG_PTPIREE_CONTRACT = "NcRfgPtpireeTestResultV2"

PtpireeDerKind = Literal["PV", "BESS", "FW", "OTHER"]
#: Rodzina modułu: moduł parku energii albo synchroniczny moduł wytwarzania energii. Moduł
#: morski (tytuł III rozdz. 4 rozporządzenia) przyłącza się do sieci przesyłowej — jest poza
#: narzędziem SN/nN (plan AB O-42), więc nie ma go w słowniku wejścia (422, nie ścieżka
#: „wszystko nie dotyczy").
PtpireeModuleFamily = Literal["PPM", "SyPGM"]
#: Enum wewnętrzny testu (filtry, sortowanie) — nigdy odpowiedź inżynierska.
PtpireeVerdict = Literal["pass", "fail", "no_data", "not_required"]
#: Skąd pochodzą dane wejścia biegu: zatwierdzony model przypadku (most ENM) albo ciało
#: żądania klienta (bieg „co-jeśli" — każda wartość jest daną przyjętą bez walidacji).
ZrodloDanych = Literal["ZATWIERDZONY_MODEL", "ZADANIE_KLIENTA"]

#: JEDYNE odwzorowanie statusu maszynowego rekordu na enum testu (funkcja całkowita na
#: słowniku ``StatusWerdyktu`` — kompletność przypięta testem).
_WERDYKT_MASZYNOWY: dict[StatusWerdyktu, PtpireeVerdict] = {
    "SPELNIA": "pass",
    "NIE_SPELNIA": "fail",
    "NIEJEDNOZNACZNY": "no_data",
    "NIE_OCENIONO": "no_data",
    "BRAK_PODSTAWY": "no_data",
    "BRAK_DOWODU": "no_data",
    "NIE_DOTYCZY": "not_required",
}


def werdykt_maszynowy(ocena: OcenaKryterium) -> PtpireeVerdict:
    """Enum testu z rekordu oceny: ``SPELNIA`` → ``pass``, ``NIE_SPELNIA`` → ``fail``,
    ``NIE_DOTYCZY`` → ``not_required``, każdy inny status → ``no_data``."""
    return _WERDYKT_MASZYNOWY[ocena.status_maszynowy]


def technologia_modulu(der_kind: PtpireeDerKind, module_family: PtpireeModuleFamily) -> Technologia:
    """Technologia modułu w rozumieniu profilu regulacyjnego — JEDYNE odwzorowanie.

    ``SyPGM`` → ``SPGM``; ``PPM`` z ``der_kind == "BESS"`` → ``MAGAZYN`` (samodzielny magazyn
    energii, poza rozporządzeniem 2016/631 — plan AB O-28; instalacja hybrydowa to generator
    z magazynem jako częścią, w modelu dwa osobne generatory, więc moduł hybrydowy jest
    modułem części wytwórczej); pozostałe ``PPM`` → ``PPM``.
    """
    if module_family == "SyPGM":
        return "SPGM"
    if der_kind == "BESS":
        return "MAGAZYN"
    return "PPM"


class DowodCertyfikatu(BaseModel):
    """Rekord wykazu certyfikowanych urządzeń PTPiREE dopasowany PO STRONIE SERWERA.

    Budowany wyłącznie w ``application/ncrfg_compliance/model_bridge.py`` z tabliczki
    urządzenia zatwierdzonego modelu dopasowanej do rejestru (snapshot wykazu wskazany przez
    warstwę WiPWC profilu). Pola pochodzą z rekordu rejestru, nie z tabliczki. Klient API nie
    może go przysłać (``/run`` nie ma takiego pola).
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    rekord_id: str = Field(min_length=1)
    producent: str = Field(min_length=1)
    model: str = Field(min_length=1)
    numer_dokumentu: str = Field(min_length=1)
    data_akceptacji: str | None
    wersja_wipwc: str = Field(min_length=1)
    wersja_wos: str | None
    #: Typy modułów, dla których rekord wykazu obowiązuje (kolumna wykazu). Pusty zakres nie
    #: pokrywa niczego (certyfikat jednostki bez zakresu typu nie wykazuje wymagań modułu).
    zakres_typow: tuple[TypModulu, ...]
    warunek_waznosci: str | None
    adres_zrodla: str | None
    podstawa: PodstawaWymagania

    def pokrywa(self, typ: TypModulu | None) -> bool:
        """Czy rekord wykazu obejmuje typ modułu — JEDYNY predykat „certyfikat zweryfikowany
        dla typu" (czyta go stosowalność testów solvera i ocena wymagań)."""
        return typ is not None and typ in self.zakres_typow


class NcRfgPtpireeModuleInput(BaseModel):
    """Dane jednego modułu (PGM/PPM) do pakietu testów zgodności."""

    model_config = ConfigDict(extra="forbid")

    der_ref: str = Field(min_length=1)
    der_name: str | None = None
    der_kind: PtpireeDerKind
    module_family: PtpireeModuleFamily
    operator_id: str = Field(min_length=1)
    p_max_kw: FiniteFloat = Field(gt=0)
    p_min_kw: FiniteFloat | None = Field(default=None, ge=0, strict=True)
    voltage_kv: FiniteFloat = Field(gt=0)
    #: Moduł istniejący w rozumieniu art. 4 ust. 1 rozporządzenia 2016/631 (``None`` —
    #: nieustalone: moduł oceniany jak nowy, każdy rekord niesie zastrzeżenie).
    modul_istniejacy: ModulIstniejacy | None = None
    #: Data umowy przyłączeniowej — resolver wersji warstw profilu (plan AB O-31); ten sam typ
    #: co model i pisarz operacji (``enm.deklaracje_modulu.DataUmowy``: liczba nie jest datą).
    data_umowy_przylaczeniowej: DataUmowy | None = None
    #: Nastawy zabezpieczeń modułu (plan AB O-32) — kryteria koordynacji statycznej.
    nastawy_zabezpieczen_modulu: NastawyZabezpieczenModulu | None = None

    has_lvrt_curve: bool = False
    has_hvrt_curve: bool = False
    has_pf_droop: bool = False
    has_qu_curve: bool = False
    has_dynamic_model: bool = False
    #: Deklaracje zdolności modułu (T05, T12, T13, T18, T19): ``None`` — nie zadeklarowano
    #: (test daje ocenę niewykonaną z nazwanym brakiem), ``False`` — zadeklarowano brak
    #: funkcji, ``True`` — zadeklarowano funkcję (odbiór Pakietu C, plan AB O-50).
    #: Pola deklaracji modułu (nazwy 1:1 z ``enm.deklaracje_modulu.DeklaracjeModulu``) są
    #: ŚCISŁE jak blok modelu: wartość innego rodzaju nie jest po cichu zamieniana
    #: (``true`` ↛ 1,0 s, ``"1.5"`` ↛ 1,5, ``1`` ↛ ``true``) — jeden predykat na każdym nośniku.
    has_scada_communication: bool | None = Field(default=None, strict=True)
    has_disturbance_recorder: bool | None = Field(default=None, strict=True)
    active_power_control_enabled: bool | None = Field(default=None, strict=True)
    stop_generation_enabled: bool | None = Field(default=None, strict=True)
    reduction_generation_enabled: bool | None = Field(default=None, strict=True)
    #: Zdolności dodatkowe wymagane programem szczegółowym badań operatora (T18) — wymaganie
    #: istnieje wyłącznie wtedy, gdy program je wskazał (``False`` = nie wskazano).
    island_operation_required: bool = Field(default=False, strict=True)
    island_operation_capable: bool | None = Field(default=None, strict=True)
    black_start_required: bool = Field(default=False, strict=True)
    black_start_capable: bool | None = Field(default=None, strict=True)
    power_oscillation_damping_required: bool = Field(default=False, strict=True)
    power_oscillation_damping_enabled: bool | None = Field(default=None, strict=True)

    droop_percent: FiniteFloat | None = Field(default=None, gt=0)
    dead_band_hz: FiniteFloat | None = Field(default=None, ge=0)
    ramp_rate_pct_per_min: FiniteFloat | None = Field(default=None, gt=0, strict=True)
    cos_phi_min: FiniteFloat | None = Field(default=None, gt=0, le=1)
    q_range_pct_pn_min: FiniteFloat | None = None
    q_range_pct_pn_max: FiniteFloat | None = None
    reactive_current_gain: FiniteFloat | None = Field(default=None, ge=0, strict=True)
    p_recovery_time_s: FiniteFloat | None = Field(default=None, ge=0, strict=True)
    harmonic_thdu_percent: FiniteFloat | None = Field(default=None, ge=0, strict=True)
    #: T12: czas od polecenia na porcie wejściowym do zaprzestania generacji mocy czynnej
    #: (NC RfG art. 13 ust. 6 — kryterium w warstwie NC RfG profilu).
    cease_generation_time_s: FiniteFloat | None = Field(default=None, gt=0, strict=True)


class NcRfgPtpireeRunRequest(BaseModel):
    """Pakiet uruchomienia testów dla jednego lub wielu modułów.

    Brak wersji procedury (pochodzi z profilu), brak ziarna (solver jest deterministyczny
    bez losowości) i brak jakiegokolwiek pola certyfikatu — ``extra="forbid"``.
    """

    model_config = ConfigDict(extra="forbid")

    modules: list[NcRfgPtpireeModuleInput] = Field(min_length=1)
    requested_test_ids: list[str] = Field(default_factory=list)


class NcRfgTraceStep(BaseModel):
    step: int
    test_id: str
    key: str
    formula: str
    data: dict[str, Any]
    substitution: str
    result: dict[str, Any]
    unit_check: str
    proof_ref: str


class NcRfgPtpireeTestDefinition(BaseModel):
    """Definicja testu kanonu T01–T20 z JEDYNYM rejestrem zdolności dowodowej testu.

    ``zdolnosc_id`` — identyfikator zdolności w rejestrze ``solver_input.provenance``
    (poziom dowodowy ``EvidenceTier``); ``rodzaj_twierdzenia`` — rodzaj twierdzenia, które
    test wspiera (konfiguracja zadeklarowana albo zachowanie dynamiczne).
    """

    test_id: str
    ability_pl: str
    procedure_basis_pl: str
    default_for_modules: list[str]
    # Typy, dla których procedura wymaga testu, gdy moduł NIE ma certyfikatu urządzenia
    # z wykazu PTPiREE obejmującego ten typ.
    required_without_certificate_for: list[str] = Field(default_factory=list)
    conditional_pl: str | None = None
    zdolnosc_id: str = Field(min_length=1)
    rodzaj_twierdzenia: ClaimKind


class NcRfgPtpireeTestResult(BaseModel):
    """Wynik testu: rekord ``ocena`` + pola pochodne (kopie z rekordu, walidowane parami)."""

    test_id: str
    ability_pl: str
    required: bool
    required_reason_pl: str
    verdict: PtpireeVerdict
    summary_pl: str
    metrics: dict[str, Any] = Field(default_factory=dict)
    trace_refs: list[str] = Field(default_factory=list)
    ocena: OcenaKryterium

    @model_validator(mode="after")
    def _pola_z_rekordu(self) -> Self:
        rozjazdy = [
            nazwa
            for nazwa, wartosc, z_rekordu in (
                ("verdict", self.verdict, werdykt_maszynowy(self.ocena)),
                ("summary_pl", self.summary_pl, self.ocena.wyjasnienie.zdanie_pl),
                ("required", self.required, self.ocena.stosowalnosc.dotyczy),
                ("required_reason_pl", self.required_reason_pl, self.ocena.stosowalnosc.powod_pl),
            )
            if wartosc != z_rekordu
        ]
        if rozjazdy:
            raise ValueError(
                f"Test {self.test_id}: pola {rozjazdy} różnią się od rekordu oceny — pola "
                "pochodne są kopiami rekordu, nie osobnym predykatem."
            )
        return self


class NcRfgPtpireeModuleResult(BaseModel):
    """Wynik modułu: klasyfikacja z podstawą i powodem, technologia, dowód certyfikatu i
    rekordy testów. Bez agregatu i bez liczników (O-13) — zgodność per wymaganie liczy
    ocena wymagań."""

    der_ref: str
    der_name: str | None
    operator_id: str
    operator_name_pl: str
    #: Klasa z ``klasyfikacja.modul`` (``None`` — moduł poniżej progu istotności).
    module_type: TypModulu | None
    klasyfikacja: KlasyfikacjaModulu
    der_kind: PtpireeDerKind
    module_family: PtpireeModuleFamily
    technologia: Technologia
    modul_istniejacy: bool | None
    data_umowy_przylaczeniowej: date | None
    #: Wersja procedury PTPiREE obowiązująca w dniu umowy przyłączeniowej (resolver warstw).
    wersja_procedury: DokumentWarstwy
    # Wersja i skrót profilu efektywnego, wobec którego liczono testy.
    profile_version: str
    profile_hash: str
    p_max_kw: float
    voltage_kv: float
    #: Rekord wykazu PTPiREE dopasowany przez serwer (``None`` — brak dowodu certyfikatu).
    dowod_certyfikatu: DowodCertyfikatu | None
    zrodlo_danych: ZrodloDanych
    tests: list[NcRfgPtpireeTestResult]

    @model_validator(mode="after")
    def _spojnosc(self) -> Self:
        if self.module_type != self.klasyfikacja.modul:
            raise ValueError(
                f"Moduł {self.der_ref}: module_type {self.module_type} ≠ klasyfikacja "
                f"{self.klasyfikacja.modul}."
            )
        oczekiwana = technologia_modulu(self.der_kind, self.module_family)
        if self.technologia != oczekiwana:
            raise ValueError(
                f"Moduł {self.der_ref}: technologia {self.technologia} ≠ {oczekiwana} "
                f"(rodzaj {self.der_kind}, rodzina {self.module_family})."
            )
        if self.zrodlo_danych == "ZADANIE_KLIENTA" and self.dowod_certyfikatu is not None:
            raise ValueError(
                f"Moduł {self.der_ref}: dowód certyfikatu w biegu z żądania klienta — rekord "
                "wykazu wyprowadza wyłącznie serwer z zatwierdzonego modelu."
            )
        return self


class NcRfgPtpireeRunResult(BaseModel):
    contract: str = NCRFG_PTPIREE_CONTRACT
    #: Wersja procedury PTPiREE z profilu (warstwa wspólna dla operatorów; bez daty umowy —
    #: wersja per moduł w ``modules[].wersja_procedury``).
    procedure_version: DokumentWarstwy
    solver_version: str
    input_hash: str
    deterministic_hash: str
    modules: list[NcRfgPtpireeModuleResult]
    test_catalog: list[NcRfgPtpireeTestDefinition]
    white_box_trace: list[NcRfgTraceStep]
    report_pl: str
