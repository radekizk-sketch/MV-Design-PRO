"""Deterministyczny solver testów zgodności NC RfG według procedury PTPiREE (kontrakt V2).

Solver nie zastępuje badań terenowych ani symulacji dynamiki. Porównuje JAWNIE zadeklarowane
dane modułu wytwarzania energii z wymaganiami profilu regulacyjnego i każdy z 20 testów kanonu
T01–T20 zamyka rekordem ``OcenaKryterium`` (kontrakt werdyktu wyjaśnialnego): przedmiot,
kryterium z warunkiem w LaTeX, wynik z jednostką, limit z podstawą, margines, niepewność,
dowód, zakres ważności i ślad. Status, margines, etykietę i tekst liczy ``werdykt`` — solver
nie ma własnej logiki statusu ani tekstu werdyktu.

ZASADY (plan AB §6 p. 3–4, karta AB-1a Pakiet C):

* zero liczb kryterium w kodzie — tolerancje, progi, czasy i obwiednie pochodzą z profilu
  (``catalog.profiles.nc_rfg``), klasa modułu z JEDYNEJ klasyfikacji krajowej
  (``klasyfikacja_modulu``) z podstawą progów i powodem;
* stosowalność testu wyznacza JEDNA funkcja ``stosowalnosc.stosowalnosc_testu`` (te same
  predykaty czyta ocena wymagań) i nigdy nie zależy od obecności danych;
* jeden test = jeden rekord K; test o kilku warunkach ocenia kryterium główne procedury, a
  pozostałe warunki trafiają do śladu WHITE BOX informacyjnie (zapisane w zakresie ważności);
* poziom dowodowy i rodzaj twierdzenia czyta się z rejestru: ``TEST_CATALOG`` (rodzaj
  twierdzenia i identyfikator zdolności) i ``solver_input.provenance`` (poziom zdolności);
* testy zachowania dynamicznego (T14–T18) bez biegu dynamiki dają ocenę niewykonaną —
  porównanie deklaracji nie wykazuje zachowania dynamicznego (wartość zadeklarowana, jeśli
  podana, jest pokazywana informacyjnie);
* dane z żądania klienta są danymi przyjętymi bez walidacji (``UNVALIDATED_INPUT``), dane
  zatwierdzonego modelu — zwalidowane; certyfikat urządzenia jest wyłącznie rekordem wykazu
  dopasowanym przez serwer (argument ``certyfikaty``), nigdy polem żądania.
"""

from __future__ import annotations

import hashlib
import json
import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from types import MappingProxyType
from typing import Any

from catalog.profiles.nc_rfg import (
    KlasyfikacjaModulu,
    NcRfgProfile,
    Technologia,
    WymaganieRegulacyjne,
    klasyfikacja_modulu,
    load_nc_rfg_profile,
    najslabszy_stan,
)
from catalog.profiles.nc_rfg.loader import NcRfgRideThroughPoint
from solver_input.provenance import classify_dynamic_capability
from werdykt import (
    DanaPrzyjeta,
    Kryterium,
    LimitKryterium,
    Niepewnosc,
    OcenaKryterium,
    OdnosnikSladu,
    PodstawaWymagania,
    Przedmiot,
    Relacja,
    StatusDanych,
    StatusDowodu,
    Stosowalnosc,
    Wielkosc,
    WynikKryterium,
    ZakresWaznosci,
    format_liczba,
    format_wielkosc,
    ocen_kryterium,
)
from werdykt.proweniencja import ClaimKind

from .contracts import (
    NCRFG_PTPIREE_CONTRACT,
    DowodCertyfikatu,
    NcRfgPtpireeModuleInput,
    NcRfgPtpireeModuleResult,
    NcRfgPtpireeRunRequest,
    NcRfgPtpireeRunResult,
    NcRfgPtpireeTestDefinition,
    NcRfgPtpireeTestResult,
    NcRfgTraceStep,
    ZrodloDanych,
    technologia_modulu,
    werdykt_maszynowy,
)
from .stosowalnosc import NAZWA_TECHNOLOGII_PL, stosowalnosc_testu, stosowalnosc_wymagania

#: 2.0 (plan AB §6, 2026-09-22/23): kontrakt V2 — rekord ``OcenaKryterium`` per test, kryteria
#: z profilu (zero liczb kryterium w kodzie), jedna funkcja stosowalności, T12 wg NC RfG
#: art. 13 ust. 6, testy dynamiki bez biegu = ocena niewykonana, bez agregatu modułu.
NCRFG_PTPiREE_SOLVER_VERSION = "ncrfg-ptpiree-whitebox-2.0"

_PUSTE_CERTYFIKATY: Mapping[str, DowodCertyfikatu] = MappingProxyType({})
#: Definicja jednostki procentu (1 % = 1/100) — przelicznik jednostki, nie liczba kryterium.
_PROCENT = 100.0

#: Jednostki wielkości testów (kontrakt werdyktu §1: jednostka jawna, baza p.u. nazwana).
_J_PROCENT = "%"
_J_RAMPA = "%/min"
_J_MINUTY = "min"
_J_SEKUNDY = "s"
_J_HZ = "Hz"
_J_BEZWYMIAROWA = "1"
_J_Q = "p.u. (P_n modułu)"
_J_U = "p.u. (U_n)"
_J_KW = "kW"

_NIEPEWNOSC_DEKLARACJI = Niepewnosc(
    nie_dotyczy=True,
    powod_pl="porównanie wartości zadeklarowanych — niepewność numeryczna nie dotyczy",
)
_OPIS_ZAKRESU = (
    "porównanie danych zadeklarowanych modułu z wymaganiem profilu — nie wykazuje zachowania "
    "dynamicznego"
)
_WYKLUCZENIE_DYNAMIKI = "zachowanie dynamiczne"
_POWOD_DANEJ_KLIENTA = "wartość z żądania klienta — bez walidacji w modelu"
_BRAK_BIEGU_DYNAMIKI = (
    "bieg dynamiki RMS modułu w scenariuszu zakłócenia — narzędzie nie wykonuje tego biegu "
    "dla testów procedury; porównanie deklaracji nie wykazuje zachowania dynamicznego"
)


def _canonical_payload(payload: Any) -> str:
    return json.dumps(
        payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False
    )


def _hash(payload: Any) -> str:
    return hashlib.sha256(_canonical_payload(payload).encode("utf-8")).hexdigest()


def _round(value: float, digits: int = 6) -> float:
    if not math.isfinite(value):
        raise ValueError(f"Wartość nieskończona albo nieokreślona w wyniku testu: {value!r}.")
    return round(value, digits)


def _ulamek(procent: float) -> float:
    """Wartość w procentach jako ułamek (definicja jednostki %)."""
    return procent / _PROCENT


def _logiczna(wartosc: bool) -> Wielkosc:
    """Wielkość logiczna kontraktu werdyktu: 1 = stan wymagany, 0 = stan przeciwny."""
    return Wielkosc(wartosc=float(wartosc), jednostka=_J_BEZWYMIAROWA)


def _najslabsza(*podstawy: PodstawaWymagania) -> PodstawaWymagania:
    """Podstawa limitu złożonego z kilku wartości profilu = podstawa o najsłabszym stanie
    (limit jest tak mocny, jak jego najsłabszy składnik); remis — pierwsza podana."""
    stan = najslabszy_stan(p.status for p in podstawy)
    return next(p for p in podstawy if p.status == stan)


def _z_uwaga(podstawa: PodstawaWymagania, uwaga: str) -> PodstawaWymagania:
    """Ta sama podstawa z dopisaną uwagą (walidacja typu przy konstrukcji)."""
    dane = podstawa.model_dump()
    dane["uwagi_pl"] = "; ".join(u for u in (podstawa.uwagi_pl, uwaga) if u)
    return PodstawaWymagania.model_validate(dane)


TEST_CATALOG: list[NcRfgPtpireeTestDefinition] = [
    NcRfgPtpireeTestDefinition(
        test_id="T01",
        ability_pl="LFSM-O - ograniczanie mocy przy nadczęstotliwości",
        procedure_basis_pl=(
            "LFSM-O jest zdolnością wymaganą od modułu typu A i B (NC RfG art. 13 ust. 2); "
            "dla typów C i D test jest obowiązkowy."
        ),
        default_for_modules=["C", "D"],
        conditional_pl=(
            "Dla typu A i B test jest wymagany, gdy certyfikat urządzenia z wykazu "
            "PTPiREE nie obejmuje typu modułu (katalog wymagań profilu, NC RfG art. 13 ust. 2)."
        ),
        zdolnosc_id="ncrfg_ptpiree.frequency_response",
        rodzaj_twierdzenia=ClaimKind.DECLARED_CONFIGURATION,
    ),
    NcRfgPtpireeTestDefinition(
        test_id="T02",
        ability_pl="LFSM-U - zwiększanie mocy przy podczęstotliwości",
        procedure_basis_pl="Zakres testów zgodności NC RfG dla modułów typu C i D.",
        default_for_modules=["C", "D"],
        zdolnosc_id="ncrfg_ptpiree.frequency_response",
        rodzaj_twierdzenia=ClaimKind.DECLARED_CONFIGURATION,
    ),
    NcRfgPtpireeTestDefinition(
        test_id="T03",
        ability_pl="FSM - regulacja częstotliwości w paśmie normalnym",
        procedure_basis_pl="Zakres testów zgodności NC RfG dla modułów typu C i D.",
        default_for_modules=["C", "D"],
        zdolnosc_id="ncrfg_ptpiree.frequency_response",
        rodzaj_twierdzenia=ClaimKind.DECLARED_CONFIGURATION,
    ),
    NcRfgPtpireeTestDefinition(
        test_id="T04",
        ability_pl="Regulacja odbudowy częstotliwości",
        procedure_basis_pl="Zakres testów zgodności NC RfG dla modułów typu C i D.",
        default_for_modules=["C", "D"],
        zdolnosc_id="ncrfg_ptpiree.frequency_response",
        rodzaj_twierdzenia=ClaimKind.DECLARED_CONFIGURATION,
    ),
    NcRfgPtpireeTestDefinition(
        test_id="T05",
        ability_pl="Możliwość regulacji mocy czynnej",
        procedure_basis_pl="Program ramowy testów PPM oraz sprawdzenia dodatkowe dla regulacji P.",
        default_for_modules=["B", "C", "D"],
        zdolnosc_id="ncrfg_ptpiree.declared_configuration",
        rodzaj_twierdzenia=ClaimKind.DECLARED_CONFIGURATION,
    ),
    NcRfgPtpireeTestDefinition(
        test_id="T06",
        ability_pl="Tryb regulacji napięcia",
        procedure_basis_pl="Zakres testów zgodności PPM typu C i D.",
        default_for_modules=["C", "D"],
        zdolnosc_id="ncrfg_ptpiree.reactive_voltage_mode",
        rodzaj_twierdzenia=ClaimKind.DECLARED_CONFIGURATION,
    ),
    NcRfgPtpireeTestDefinition(
        test_id="T07",
        ability_pl="Tryb regulacji mocy biernej Q",
        procedure_basis_pl="Zakres testów zgodności PPM typu C i D.",
        default_for_modules=["C", "D"],
        zdolnosc_id="ncrfg_ptpiree.reactive_voltage_mode",
        rodzaj_twierdzenia=ClaimKind.DECLARED_CONFIGURATION,
    ),
    NcRfgPtpireeTestDefinition(
        test_id="T08",
        ability_pl="Tryb regulacji współczynnika mocy cosφ",
        procedure_basis_pl="Zakres testów zgodności PPM typu C i D.",
        default_for_modules=["C", "D"],
        zdolnosc_id="ncrfg_ptpiree.reactive_voltage_mode",
        rodzaj_twierdzenia=ClaimKind.DECLARED_CONFIGURATION,
    ),
    NcRfgPtpireeTestDefinition(
        test_id="T09",
        ability_pl="Zdolność do generacji mocy biernej",
        procedure_basis_pl="Zakres testów zgodności PPM typu B, C i D.",
        default_for_modules=["B", "C", "D"],
        zdolnosc_id="ncrfg_ptpiree.reactive_voltage_mode",
        rodzaj_twierdzenia=ClaimKind.DECLARED_CONFIGURATION,
    ),
    NcRfgPtpireeTestDefinition(
        test_id="T10",
        ability_pl="Potwierdzenie mocy maksymalnej PMAX",
        procedure_basis_pl="Sprawdzenia dodatkowe procedury PTPiREE dla typu B, C i D.",
        default_for_modules=["B", "C", "D"],
        zdolnosc_id="ncrfg_ptpiree.declared_configuration",
        rodzaj_twierdzenia=ClaimKind.DECLARED_CONFIGURATION,
    ),
    NcRfgPtpireeTestDefinition(
        test_id="T11",
        ability_pl="Potwierdzenie mocy minimalnej PMIN",
        procedure_basis_pl="Sprawdzenia dodatkowe procedury PTPiREE dla typu B, C i D.",
        default_for_modules=["B", "C", "D"],
        zdolnosc_id="ncrfg_ptpiree.declared_configuration",
        rodzaj_twierdzenia=ClaimKind.DECLARED_CONFIGURATION,
    ),
    NcRfgPtpireeTestDefinition(
        test_id="T12",
        ability_pl="Zaprzestanie generacji mocy czynnej",
        procedure_basis_pl=(
            "Interfejs logiczny: zaprzestanie generacji w czasie wymaganym NC RfG "
            "art. 13 ust. 6; test wymagany dla typu A/B przy braku certyfikatu."
        ),
        default_for_modules=[],
        required_without_certificate_for=["A", "B"],
        conditional_pl=(
            "Wymagany, gdy certyfikat urządzenia z wykazu PTPiREE nie obejmuje typu modułu."
        ),
        zdolnosc_id="ncrfg_ptpiree.declared_configuration",
        rodzaj_twierdzenia=ClaimKind.DECLARED_CONFIGURATION,
    ),
    NcRfgPtpireeTestDefinition(
        test_id="T13",
        ability_pl="Zmniejszenie generacji mocy czynnej",
        procedure_basis_pl="Dodatkowy test zgodności, wymagany dla typu B przy braku certyfikatu.",
        default_for_modules=[],
        required_without_certificate_for=["B"],
        conditional_pl=(
            "Wymagany, gdy certyfikat urządzenia z wykazu PTPiREE nie obejmuje typu modułu."
        ),
        zdolnosc_id="ncrfg_ptpiree.declared_configuration",
        rodzaj_twierdzenia=ClaimKind.DECLARED_CONFIGURATION,
    ),
    NcRfgPtpireeTestDefinition(
        test_id="T14",
        ability_pl="LVRT - pozostanie w pracy przy zapadzie napięcia",
        procedure_basis_pl="Test FRT dla modułów B/C/D oraz profili operatora.",
        default_for_modules=["B", "C", "D"],
        zdolnosc_id="ncrfg_ptpiree.ride_through",
        rodzaj_twierdzenia=ClaimKind.DYNAMIC_PERFORMANCE,
    ),
    NcRfgPtpireeTestDefinition(
        test_id="T15",
        ability_pl="HVRT - pozostanie w pracy przy wzroście napięcia",
        procedure_basis_pl="Test HVRT dla modułów B/C/D oraz profili operatora.",
        default_for_modules=["B", "C", "D"],
        zdolnosc_id="ncrfg_ptpiree.ride_through",
        rodzaj_twierdzenia=ClaimKind.DYNAMIC_PERFORMANCE,
    ),
    NcRfgPtpireeTestDefinition(
        test_id="T16",
        ability_pl="Odbudowa mocy czynnej po zakłóceniu",
        procedure_basis_pl="Wymaganie profilu operatora dla modułów B/C/D.",
        default_for_modules=["B", "C", "D"],
        zdolnosc_id="ncrfg_ptpiree.p_recovery",
        rodzaj_twierdzenia=ClaimKind.DYNAMIC_PERFORMANCE,
    ),
    NcRfgPtpireeTestDefinition(
        test_id="T17",
        ability_pl="Prąd bierny podczas FRT",
        procedure_basis_pl=(
            "Szybki prąd zwarciowy: NC RfG art. 20 ust. 2 lit. b — moduły PARKU ENERGII typu B "
            "(katalog wymagań profilu); moduł synchroniczny typu B nie ma tego "
            "wymagania. Dla typów C i D — zakres procedury."
        ),
        default_for_modules=["C", "D"],
        zdolnosc_id="ncrfg_ptpiree.reactive_current_frt",
        rodzaj_twierdzenia=ClaimKind.DYNAMIC_PERFORMANCE,
    ),
    NcRfgPtpireeTestDefinition(
        test_id="T18",
        ability_pl="Praca wyspowa, rozruch autonomiczny i tłumienie oscylacji",
        procedure_basis_pl=(
            "Sprawdzenia dodatkowe wykonywane, gdy zdolność jest wymagana przez właściwego "
            "operatora systemu."
        ),
        default_for_modules=[],
        conditional_pl=(
            "Wymagany, gdy program szczegółowy wskazuje wymaganą zdolność dodatkową (zakres "
            "programu, nie obecność danych)."
        ),
        zdolnosc_id="ncrfg_ptpiree.extended_dynamic_capability",
        rodzaj_twierdzenia=ClaimKind.DYNAMIC_PERFORMANCE,
    ),
    NcRfgPtpireeTestDefinition(
        test_id="T19",
        ability_pl="Rejestracja zakłóceń i komunikacja z operatorem",
        procedure_basis_pl="Dane pomocnicze wymagane do wiarygodnego programu szczegółowego testów.",
        default_for_modules=["C", "D"],
        zdolnosc_id="ncrfg_ptpiree.declared_configuration",
        rodzaj_twierdzenia=ClaimKind.DECLARED_CONFIGURATION,
    ),
    NcRfgPtpireeTestDefinition(
        test_id="T20",
        ability_pl="Jakość energii - współczynnik THDu źródła",
        procedure_basis_pl="Kontrola uzupełniająca dla przyłączenia PPM z falownikami.",
        default_for_modules=[],
        conditional_pl=(
            "Wymagany wyłącznie z zakresu programu szczegółowego; nie zastępuje pełnej analizy "
            "harmonicznych."
        ),
        zdolnosc_id="ncrfg_ptpiree.power_quality_declared",
        rodzaj_twierdzenia=ClaimKind.DECLARED_CONFIGURATION,
    ),
]


class TraceBuilder:
    def __init__(self) -> None:
        self.steps: list[NcRfgTraceStep] = []

    def add(
        self,
        test_id: str,
        key: str,
        formula: str,
        data: dict[str, Any],
        substitution: str,
        result: dict[str, Any],
        unit_check: str,
    ) -> str:
        proof_ref = f"proof:ncrfg-ptpiree:{test_id}:{key}:{len(self.steps) + 1}"
        self.steps.append(
            NcRfgTraceStep(
                step=len(self.steps) + 1,
                test_id=test_id,
                key=key,
                formula=formula,
                data=data,
                substitution=substitution,
                result=result,
                unit_check=unit_check,
                proof_ref=proof_ref,
            )
        )
        return proof_ref


@dataclass(frozen=True)
class _Kontekst:
    """Wspólne wejścia oceny wszystkich testów jednego modułu."""

    modul: NcRfgPtpireeModuleInput
    profile: NcRfgProfile
    klasyfikacja: KlasyfikacjaModulu
    technologia: Technologia
    certyfikat: DowodCertyfikatu | None
    zrodlo_danych: ZrodloDanych
    input_hash: str
    trace: TraceBuilder
    przedmiot: Przedmiot
    podstawa_procedury: PodstawaWymagania


@dataclass
class _Specyfikacja:
    """Kryterium główne testu z danymi użytymi w ocenie (buduje je funkcja testu)."""

    kryterium_id: str
    kryterium: Kryterium
    wynik: WynikKryterium | None = None
    limit: LimitKryterium | None = None
    tolerancja: Wielkosc | None = None
    #: Dane wejścia użyte w teście (nazwa z polem wejścia, wartość z jednostką).
    dane: list[tuple[str, Wielkosc]] = field(default_factory=list)
    braki: list[str] = field(default_factory=list)
    metrics: dict[str, Any] = field(default_factory=dict)
    kroki: list[str] = field(default_factory=list)
    uwaga_zakresu: str | None = None


def _flaga(nazwa: str, wartosc: bool) -> tuple[str, Wielkosc]:
    return nazwa, _logiczna(wartosc)


def _flagi(*pozycje: tuple[str, bool | None]) -> list[tuple[str, Wielkosc]]:
    """Dane przyjęte z deklaracji logicznych — wyłącznie zadeklarowanych (``None`` = brak
    deklaracji nie jest daną, tylko brakiem nazwanym w ``czego_brakuje``)."""
    return [_flaga(nazwa, wartosc) for nazwa, wartosc in pozycje if wartosc is not None]


def _obwiednia_pl(punkty: Sequence[NcRfgRideThroughPoint]) -> str:
    return "; ".join(
        f"t = {format_liczba(p.time_s)} s: {format_liczba(p.voltage_pu)} {_J_U}" for p in punkty
    )


class NcRfgPtpireeSolver:
    """Pakiet testów zgodności NC RfG / PTPiREE (porównanie deklaracji z profilem)."""

    def run(
        self,
        request: NcRfgPtpireeRunRequest,
        *,
        zrodlo_danych: ZrodloDanych,
        certyfikaty: Mapping[str, DowodCertyfikatu] = _PUSTE_CERTYFIKATY,
    ) -> NcRfgPtpireeRunResult:
        """Uruchom testy dla modułów żądania.

        ``zrodlo_danych`` — skąd pochodzą dane wejścia (model albo żądanie klienta);
        ``certyfikaty`` — rekordy wykazu PTPiREE dopasowane przez serwer, po ``der_ref``
        (wyłącznie dla danych zatwierdzonego modelu: bieg z żądania klienta nie może nieść
        certyfikatu). Nieznany identyfikator testu w programie szczegółowym, certyfikat dla
        modułu spoza żądania albo certyfikat w biegu z żądania to ``ValueError``.
        """
        znane = {definicja.test_id for definicja in TEST_CATALOG}
        wymuszone = {item.strip().upper() for item in request.requested_test_ids if item.strip()}
        nieznane = sorted(wymuszone - znane)
        if nieznane:
            raise ValueError(
                f"Program szczegółowy wymusza nieznane testy {nieznane} — kanon testów PTPiREE "
                f"obejmuje {sorted(znane)}."
            )
        if zrodlo_danych == "ZADANIE_KLIENTA" and certyfikaty:
            raise ValueError(
                "Bieg z danych żądania klienta nie może nieść certyfikatu urządzenia — rekord "
                "wykazu PTPiREE wyprowadza wyłącznie serwer z zatwierdzonego modelu."
            )
        referencje = [modul.der_ref for modul in request.modules]
        obce = sorted(set(certyfikaty) - set(referencje))
        if obce:
            raise ValueError(f"Certyfikaty dla modułów spoza żądania: {obce}.")
        input_hash = _hash(
            {
                "zadanie": request.model_dump(mode="json"),
                "zrodlo_danych": zrodlo_danych,
                "certyfikaty": {
                    der_ref: certyfikaty[der_ref].model_dump(mode="json")
                    for der_ref in sorted(certyfikaty)
                },
            }
        )
        trace = TraceBuilder()
        modules = [
            self._run_module(
                modul,
                trace,
                wymuszone,
                zrodlo_danych=zrodlo_danych,
                certyfikat=certyfikaty.get(modul.der_ref),
                input_hash=input_hash,
            )
            for modul in request.modules
        ]
        procedura = load_nc_rfg_profile(request.modules[0].operator_id).wersja_warstwy(
            "PROCEDURA_PTPIREE", None
        )
        envelope = {
            "contract": NCRFG_PTPIREE_CONTRACT,
            "procedure_version": procedura.model_dump(mode="json"),
            "solver_version": NCRFG_PTPiREE_SOLVER_VERSION,
            "input_hash": input_hash,
            "modules": [module.model_dump(mode="json") for module in modules],
            "test_catalog": [definition.model_dump(mode="json") for definition in TEST_CATALOG],
            "white_box_trace": [step.model_dump(mode="json") for step in trace.steps],
            "report_pl": self._build_report(modules, procedura.tytul, procedura.wydanie),
        }
        return NcRfgPtpireeRunResult.model_validate(
            {**envelope, "deterministic_hash": _hash(envelope)}
        )

    # ------------------------------------------------------------------
    # Moduł
    # ------------------------------------------------------------------

    def _run_module(
        self,
        modul: NcRfgPtpireeModuleInput,
        trace: TraceBuilder,
        wymuszone: set[str],
        *,
        zrodlo_danych: ZrodloDanych,
        certyfikat: DowodCertyfikatu | None,
        input_hash: str,
    ) -> NcRfgPtpireeModuleResult:
        profile = load_nc_rfg_profile(modul.operator_id)
        klasyfikacja = klasyfikacja_modulu(modul.p_max_kw, modul.voltage_kv)
        technologia = technologia_modulu(modul.der_kind, modul.module_family)
        wersja_procedury = profile.wersja_warstwy(
            "PROCEDURA_PTPIREE", modul.data_umowy_przylaczeniowej
        )
        typ_pl = (
            f"moduł wytwarzania energii typu {klasyfikacja.modul}"
            if klasyfikacja.modul is not None
            else "urządzenie poniżej progu istotności modułu wytwarzania energii"
        )
        przedmiot = Przedmiot(
            element_ref=modul.der_ref,
            nazwa_pl=modul.der_name or modul.der_ref,
            opis_pl=(
                f"{typ_pl} ({NAZWA_TECHNOLOGII_PL[technologia]}), P_max "
                f"{format_liczba(modul.p_max_kw)} kW, napięcie przyłączenia "
                f"{format_liczba(modul.voltage_kv)} kV"
            ),
        )
        kontekst = _Kontekst(
            modul=modul,
            profile=profile,
            klasyfikacja=klasyfikacja,
            technologia=technologia,
            certyfikat=certyfikat,
            zrodlo_danych=zrodlo_danych,
            input_hash=input_hash,
            trace=trace,
            przedmiot=przedmiot,
            podstawa_procedury=PodstawaWymagania(
                rodzaj="PROCEDURA_PTPIREE",
                dokument=wersja_procedury.tytul,
                wydanie=wersja_procedury.wydanie,
                jednostka_redakcyjna=None,
                status="NIEUSTALONE",
                uwagi_pl="; ".join(
                    u
                    for u in (
                        "punkt programu ramowego testu nie jest wskazany w profilu — "
                        "jednostka redakcyjna procedury nieustalona",
                        wersja_procedury.uwagi_pl,
                    )
                    if u
                ),
            ),
        )
        tests = [
            self._run_test(definicja, kontekst, definicja.test_id in wymuszone)
            for definicja in TEST_CATALOG
        ]
        return NcRfgPtpireeModuleResult(
            der_ref=modul.der_ref,
            der_name=modul.der_name,
            operator_id=modul.operator_id,
            operator_name_pl=profile.operator_name_pl,
            module_type=klasyfikacja.modul,
            klasyfikacja=klasyfikacja,
            der_kind=modul.der_kind,
            module_family=modul.module_family,
            technologia=technologia,
            modul_istniejacy=modul.modul_istniejacy,
            data_umowy_przylaczeniowej=modul.data_umowy_przylaczeniowej,
            wersja_procedury=wersja_procedury,
            profile_version=profile.wersja_profilu,
            profile_hash=profile.skrot_profilu,
            p_max_kw=_round(modul.p_max_kw, 3),
            voltage_kv=_round(modul.voltage_kv, 3),
            dowod_certyfikatu=certyfikat,
            zrodlo_danych=zrodlo_danych,
            tests=tests,
        )

    # ------------------------------------------------------------------
    # Test — stosowalność, kryterium główne, rekord K
    # ------------------------------------------------------------------

    def _run_test(
        self, definicja: NcRfgPtpireeTestDefinition, k: _Kontekst, wymuszony: bool
    ) -> NcRfgPtpireeTestResult:
        wymagania = k.profile.wymagania_testu(definicja.test_id)
        stosowalnosc = stosowalnosc_testu(
            definicja,
            wymagania,
            wymuszony=wymuszony,
            modul=k.modul,
            klasyfikacja=k.klasyfikacja,
            technologia=k.technologia,
            certyfikat=k.certyfikat,
            operator_name_pl=k.profile.operator_name_pl,
        )
        krok_stosowalnosci = k.trace.add(
            definicja.test_id,
            "stosowalnosc",
            "wymagany = wymuszony ∨ (klasa ∧ technologia ∧ ¬istniejący ∧ (wykazuje wymaganie "
            "przez test ∨ zakres procedury ∨ brak certyfikatu obejmującego typ ∨ zdolność "
            "dodatkowa programu))",
            {
                "wymuszony": wymuszony,
                "klasa": k.klasyfikacja.modul,
                "technologia": k.technologia,
                "modul_istniejacy": k.modul.modul_istniejacy,
                "wymagania_testu": [w.id for w in wymagania],
                "zakres_procedury": list(definicja.default_for_modules),
                "wymagany_bez_certyfikatu": list(definicja.required_without_certificate_for),
                "certyfikat_rekord": None if k.certyfikat is None else k.certyfikat.rekord_id,
            },
            f"dotyczy = {stosowalnosc.dotyczy}",
            {"dotyczy": stosowalnosc.dotyczy, "powod_pl": stosowalnosc.powod_pl},
            "Wartości logiczne bez jednostek.",
        )
        spec = self._specyfikacja(definicja, k)
        ocena = self._ocena(definicja, k, stosowalnosc, wymagania, spec, krok_stosowalnosci)
        krok_oceny = k.trace.add(
            definicja.test_id,
            "ocena_kryterium",
            "status = reguła K kontraktu werdyktu (stosowalność → metoda → wynik → podstawa "
            "→ niejednoznaczność → margines)",
            {"kryterium_id": ocena.kryterium_id, "relacja": ocena.kryterium.relacja},
            f"status = {ocena.status_maszynowy}",
            {
                "status_maszynowy": ocena.status_maszynowy,
                "kompletnosc_dowodu": ocena.kompletnosc_dowodu,
                "odcisk_oceny": ocena.odcisk(),
            },
            "Status maszynowy bez jednostek.",
        )
        return NcRfgPtpireeTestResult(
            test_id=definicja.test_id,
            ability_pl=definicja.ability_pl,
            required=stosowalnosc.dotyczy,
            required_reason_pl=stosowalnosc.powod_pl,
            verdict=werdykt_maszynowy(ocena),
            summary_pl=ocena.wyjasnienie.zdanie_pl,
            metrics=spec.metrics,
            trace_refs=[krok_stosowalnosci, *spec.kroki, krok_oceny],
            ocena=ocena,
        )

    def _podstawa_kryterium(
        self, wymagania: Sequence[WymaganieRegulacyjne], k: _Kontekst
    ) -> PodstawaWymagania:
        """Podstawa kryterium testu: źródło pierwszego (w kolejności profilu) wymagania
        wykazywanego testem, które DOTYCZY modułu; gdy żadne nie dotyczy (albo test nie
        wykazuje żadnego wymagania) — warstwa procedury PTPiREE."""
        for wymaganie in wymagania:
            if stosowalnosc_wymagania(
                wymaganie,
                klasyfikacja=k.klasyfikacja,
                technologia=k.technologia,
                modul_istniejacy=k.modul.modul_istniejacy,
                operator_name_pl=k.profile.operator_name_pl,
            ).dotyczy:
                return wymaganie.zrodlo
        return k.podstawa_procedury

    def _ocena(
        self,
        definicja: NcRfgPtpireeTestDefinition,
        k: _Kontekst,
        stosowalnosc: Stosowalnosc,
        wymagania: Sequence[WymaganieRegulacyjne],
        spec: _Specyfikacja,
        krok_stosowalnosci: str,
    ) -> OcenaKryterium:
        """JEDYNA budowa rekordu K testu — wszystko poza polami testu robi ``werdykt``."""
        if k.zrodlo_danych == "ZATWIERDZONY_MODEL":
            status_danych = StatusDanych(stan="ZWALIDOWANE")
        else:
            dane = [
                (
                    "moc maksymalna modułu (p_max_kw)",
                    Wielkosc(wartosc=k.modul.p_max_kw, jednostka=_J_KW),
                ),
                (
                    "napięcie przyłączenia modułu (voltage_kv)",
                    Wielkosc(wartosc=k.modul.voltage_kv, jednostka="kV"),
                ),
                *spec.dane,
            ]
            status_danych = StatusDanych(
                stan="UNVALIDATED_INPUT",
                dane_przyjete=tuple(
                    DanaPrzyjeta(
                        nazwa_pl=nazwa, wartosc=wartosc, powod_pl=_POWOD_DANEJ_KLIENTA, jakosc=None
                    )
                    for nazwa, wartosc in dict.fromkeys(dane)
                ),
            )
        dowod = StatusDowodu(
            metoda="DEKLARACJA",
            poziom=classify_dynamic_capability(definicja.zdolnosc_id).tier,
            rodzaj_twierdzenia=definicja.rodzaj_twierdzenia,
            status_modelu="NIE_DOTYCZY",
            status_danych=status_danych,
            odniesienie=f"bieg {k.input_hash}",
        )
        opis_zakresu = _OPIS_ZAKRESU
        if spec.uwaga_zakresu is not None:
            opis_zakresu = f"{_OPIS_ZAKRESU}; {spec.uwaga_zakresu}"
        kroki = [krok_stosowalnosci, *spec.kroki]
        return ocen_kryterium(
            kryterium_id=spec.kryterium_id,
            przedmiot=k.przedmiot,
            kryterium=spec.kryterium,
            podstawa=self._podstawa_kryterium(wymagania, k),
            stosowalnosc=stosowalnosc,
            wynik=spec.wynik,
            limit=spec.limit,
            niepewnosc=_NIEPEWNOSC_DEKLARACJI,
            dowod=dowod,
            zakres_waznosci=ZakresWaznosci(
                opis_pl=opis_zakresu,
                technologia=NAZWA_TECHNOLOGII_PL[k.technologia],
                wykluczenia=(_WYKLUCZENIE_DYNAMIKI,),
            ),
            slad=[
                OdnosnikSladu(
                    krok=ref, opis_pl=f"krok śladu testu {definicja.test_id} ({ref.split(':')[3]})"
                )
                for ref in kroki
            ],
            tolerancja=spec.tolerancja,
            braki_dodatkowe=spec.braki,
        )

    def _specyfikacja(self, definicja: NcRfgPtpireeTestDefinition, k: _Kontekst) -> _Specyfikacja:
        test_id = definicja.test_id
        if test_id in {"T01", "T02", "T03"}:
            return self._statyzm(definicja, k)
        if test_id == "T04":
            return self._rampa_odbudowy(definicja, k)
        if test_id in {"T05", "T13"}:
            return self._czas_regulacji_p(definicja, k)
        if test_id in {"T06", "T07", "T09"}:
            return self._zakres_q(definicja, k)
        if test_id == "T08":
            return self._cos_phi(definicja, k)
        if test_id in {"T10", "T11"}:
            return self._moc_zadeklarowana(definicja, k)
        if test_id == "T12":
            return self._zaprzestanie_generacji(definicja, k)
        if test_id in {"T14", "T15"}:
            return self._pozostanie_w_pracy(definicja, k)
        if test_id == "T16":
            return self._odbudowa_p(definicja, k)
        if test_id == "T17":
            return self._prad_bierny(definicja, k)
        if test_id == "T18":
            return self._zdolnosci_dodatkowe(definicja, k)
        if test_id == "T19":
            return self._obserwowalnosc(definicja, k)
        if test_id == "T20":
            return self._thd_u(definicja, k)
        raise ValueError(f"Test {test_id} nie ma zdefiniowanego kryterium — kanon T01–T20.")

    # ------------------------------------------------------------------
    # Kryteria główne testów
    # ------------------------------------------------------------------

    def _statyzm(self, definicja: NcRfgPtpireeTestDefinition, k: _Kontekst) -> _Specyfikacja:
        """T01–T03: statyzm P(f) modułu w tolerancji wokół wartości wymaganej (pasmo).

        Warunek strefy martwej i odpowiedź ΔP w punkcie częstotliwości testu są zapisane w
        śladzie informacyjnie — procedura nie rozróżnia ich jako osobnych testów."""
        modul, odpowiedz = k.modul, k.profile.frequency_response
        kryteria, f_n = k.profile.kryteria_akceptacji, k.profile.czestotliwosc_znamionowa_hz
        identyfikator = {"T01": "lfsm_o", "T02": "lfsm_u", "T03": "fsm"}[definicja.test_id]
        spec = _Specyfikacja(
            kryterium_id=f"{identyfikator}.statyzm",
            kryterium=Kryterium(
                opis_pl=f"{definicja.ability_pl}: statyzm P(f) modułu w tolerancji wymaganej",
                warunek_latex=r"\left| s - s_{\mathrm{wym}} \right| \le \Delta s",
                relacja="PASMO",
            ),
            uwaga_zakresu=(
                "kryterium główne testu: statyzm w tolerancji; strefa martwa modułu i odpowiedź "
                "ΔP w punkcie częstotliwości testu zapisane w śladzie informacyjnie (procedura "
                "nie rozróżnia ich jako osobnych testów)"
            ),
        )
        spec.dane.append(_flaga("funkcja P(f) modułu (has_pf_droop)", modul.has_pf_droop))
        tolerancja = kryteria.tolerancja_statyzmu_pp
        if tolerancja > 0:
            spec.limit = LimitKryterium(
                pasmo=(
                    Wielkosc(wartosc=odpowiedz.pf_droop_percent - tolerancja, jednostka=_J_PROCENT),
                    Wielkosc(wartosc=odpowiedz.pf_droop_percent + tolerancja, jednostka=_J_PROCENT),
                ),
                podstawa=_najslabsza(odpowiedz.zrodlo, kryteria.zrodlo),
                zakres_stosowalnosci_pl=f"statyzm wymagany ± tolerancja testu ({definicja.test_id})",
                wersja_profilu=k.profile.wersja_profilu,
            )
            spec.tolerancja = Wielkosc(wartosc=tolerancja, jednostka="pp")
        else:
            spec.braki.append(
                "tolerancja statyzmu kryterium akceptacji dodatnia — profil podaje 0 pp, więc "
                "kryterium nie ma postaci pasma (program ramowy testu procedury PTPiREE)"
            )
        if modul.dead_band_hz is not None:
            spec.dane.append(
                (
                    "strefa martwa modułu (dead_band_hz)",
                    Wielkosc(wartosc=modul.dead_band_hz, jednostka=_J_HZ),
                )
            )
        if not modul.has_pf_droop or modul.droop_percent is None:
            spec.braki.append(
                "statyzm P(f) modułu (droop_percent) z deklaracją funkcji P(f) (has_pf_droop)"
            )
            return spec
        spec.dane.append(
            (
                "statyzm P(f) modułu (droop_percent)",
                Wielkosc(wartosc=modul.droop_percent, jednostka=_J_PROCENT),
            )
        )
        spec.wynik = WynikKryterium(
            wielkosc_pl="statyzm P(f) modułu (zadeklarowany)",
            symbol_latex="s",
            wartosc=Wielkosc(wartosc=modul.droop_percent, jednostka=_J_PROCENT),
            metoda="DEKLARACJA",
        )
        czestotliwosc = (
            kryteria.czestotliwosc_testu_pod_hz
            if definicja.test_id == "T02"
            else kryteria.czestotliwosc_testu_nad_hz
        )
        dane_sladu: dict[str, Any] = {
            "czestotliwosc_testu_hz": czestotliwosc,
            "f_n_hz": f_n,
            "p_max_kw": modul.p_max_kw,
            "statyzm_modulu_pct": modul.droop_percent,
            "statyzm_wymagany_pct": odpowiedz.pf_droop_percent,
            "tolerancja_statyzmu_pp": tolerancja,
            "strefa_martwa_modulu_hz": modul.dead_band_hz,
            "strefa_martwa_wymagana_hz": odpowiedz.dead_band_hz,
            "tolerancja_strefy_martwej_hz": kryteria.tolerancja_strefy_martwej_hz,
        }
        wynik_sladu: dict[str, Any] = {}
        if modul.dead_band_hz is not None:
            odchylka_hz = max(abs(czestotliwosc - f_n) - modul.dead_band_hz, 0.0)
            # Odpowiedź ΔP nasycona na mocy maksymalnej modułu (informacyjnie w śladzie).
            delta_p_kw = min(
                modul.p_max_kw,
                modul.p_max_kw * odchylka_hz / (f_n * _ulamek(modul.droop_percent)),
            )
            wynik_sladu = {
                "delta_p_kw": _round(delta_p_kw, 3),
                "strefa_martwa_w_tolerancji": modul.dead_band_hz
                <= odpowiedz.dead_band_hz + kryteria.tolerancja_strefy_martwej_hz,
            }
            spec.metrics = {"delta_p_kw": _round(delta_p_kw, 3), "frequency_hz": czestotliwosc}
        spec.kroki.append(
            k.trace.add(
                definicja.test_id,
                "frequency_response",
                "ΔP = Pmax · min(1, max(|f − f_n| − db, 0) / (f_n · s)); kryterium: "
                "|s − s_wym| ≤ Δs",
                dane_sladu,
                f"|{format_liczba(modul.droop_percent)} − "
                f"{format_liczba(odpowiedz.pf_droop_percent)}| ≤ {format_liczba(tolerancja)}",
                wynik_sladu,
                "% − % = pp; kW · Hz / Hz = kW.",
            )
        )
        return spec

    def _rampa_odbudowy(self, definicja: NcRfgPtpireeTestDefinition, k: _Kontekst) -> _Specyfikacja:
        """T04: tempo zmiany mocy modułu nie mniejsze niż wymagany udział tempa profilu."""
        modul, odpowiedz = k.modul, k.profile.frequency_response
        kryteria = k.profile.kryteria_akceptacji
        wymagana = kryteria.min_udzial_rampy_odbudowy * odpowiedz.ramp_rate_pct_per_min
        spec = _Specyfikacja(
            kryterium_id="odbudowa_f.tempo_zmiany_mocy",
            kryterium=Kryterium(
                opis_pl=f"{definicja.ability_pl}: tempo zmiany mocy czynnej modułu",
                warunek_latex=r"r \ge k_{r} \cdot r_{\mathrm{wym}}",
                relacja="NIE_MNIEJ",
            ),
            limit=LimitKryterium(
                wartosc=Wielkosc(wartosc=wymagana, jednostka=_J_RAMPA),
                podstawa=_najslabsza(odpowiedz.zrodlo, kryteria.zrodlo),
                zakres_stosowalnosci_pl="udział wymaganego tempa zmiany mocy (kryterium akceptacji)",
                wersja_profilu=k.profile.wersja_profilu,
            ),
            uwaga_zakresu=(
                "kryterium główne testu: tempo odbudowy mocy; nastawy odpowiedzi "
                "częstotliwościowej ocenia test T01"
            ),
        )
        if modul.ramp_rate_pct_per_min is None:
            spec.braki.append("tempo zmiany mocy czynnej modułu (ramp_rate_pct_per_min)")
            return spec
        rampa = Wielkosc(wartosc=modul.ramp_rate_pct_per_min, jednostka=_J_RAMPA)
        spec.dane.append(("tempo zmiany mocy czynnej modułu (ramp_rate_pct_per_min)", rampa))
        spec.wynik = WynikKryterium(
            wielkosc_pl="tempo zmiany mocy czynnej modułu (zadeklarowane)",
            symbol_latex="r",
            wartosc=rampa,
            metoda="DEKLARACJA",
        )
        spec.kroki.append(
            k.trace.add(
                definicja.test_id,
                "tempo_odbudowy",
                "r ≥ k_r · r_wym",
                {
                    "tempo_modulu_pct_min": modul.ramp_rate_pct_per_min,
                    "udzial_wymagany": kryteria.min_udzial_rampy_odbudowy,
                    "tempo_wymagane_profilu_pct_min": odpowiedz.ramp_rate_pct_per_min,
                },
                f"{format_liczba(modul.ramp_rate_pct_per_min)} ≥ "
                f"{format_liczba(kryteria.min_udzial_rampy_odbudowy)} · "
                f"{format_liczba(odpowiedz.ramp_rate_pct_per_min)}",
                {"tempo_wymagane_pct_min": _round(wymagana, 4)},
                "%/min · 1 = %/min.",
            )
        )
        return spec

    def _czas_regulacji_p(
        self, definicja: NcRfgPtpireeTestDefinition, k: _Kontekst
    ) -> _Specyfikacja:
        """T05 (regulacja do zadanej mocy) i T13 (zdalne zmniejszenie generacji): czas
        wykonania z zadeklarowanego tempa zmiany mocy wobec czasu dopuszczalnego."""
        modul, odpowiedz = k.modul, k.profile.frequency_response
        kryteria = k.profile.kryteria_akceptacji
        t05 = definicja.test_id == "T05"
        udzial = (
            kryteria.udzial_mocy_testu_regulacji
            if t05
            else kryteria.udzial_mocy_komendy_zmniejszenia
        )
        krotnosc = kryteria.krotnosc_czasu_ustalenia if t05 else kryteria.krotnosc_czasu_komendy
        minimum = kryteria.min_czas_ustalenia_min if t05 else kryteria.min_czas_komendy_min
        funkcja = modul.active_power_control_enabled if t05 else modul.reduction_generation_enabled
        nazwa_funkcji = (
            "regulacja mocy czynnej (active_power_control_enabled)"
            if t05
            else "zdalne zmniejszenie generacji (reduction_generation_enabled)"
        )
        # Czas przejścia od P_max do udziału P_max przy tempie r [% P_max / min].
        czas_odniesienia = (1 - udzial) / _ulamek(odpowiedz.ramp_rate_pct_per_min)
        dopuszczalny = max(krotnosc * czas_odniesienia, minimum)
        spec = _Specyfikacja(
            kryterium_id="regulacja_p.czas_ustalenia" if t05 else "zmniejszenie_generacji.czas",
            kryterium=Kryterium(
                opis_pl=(
                    f"{definicja.ability_pl}: czas przejścia do "
                    f"{format_liczba(udzial * _PROCENT)} % P_max przy zadeklarowanym tempie zmiany mocy"
                ),
                warunek_latex=(
                    r"t = \frac{1 - u}{r} \le \max\left(k \cdot \frac{1 - u}{r_{\mathrm{wym}}},"
                    r"\; t_{\min}\right)"
                ),
                relacja="NIE_WIECEJ",
            ),
            limit=LimitKryterium(
                wartosc=Wielkosc(wartosc=dopuszczalny, jednostka=_J_MINUTY),
                podstawa=_najslabsza(odpowiedz.zrodlo, kryteria.zrodlo),
                zakres_stosowalnosci_pl="krotność czasu odniesienia z tempa wymaganego profilu",
                wersja_profilu=k.profile.wersja_profilu,
            ),
        )
        spec.dane.extend(_flagi((nazwa_funkcji, funkcja)))
        if modul.ramp_rate_pct_per_min is not None:
            spec.dane.append(
                (
                    "tempo zmiany mocy czynnej modułu (ramp_rate_pct_per_min)",
                    Wielkosc(wartosc=modul.ramp_rate_pct_per_min, jednostka=_J_RAMPA),
                )
            )
        if not funkcja or modul.ramp_rate_pct_per_min is None:
            spec.braki.append(
                f"deklaracja funkcji: {nazwa_funkcji} i tempo zmiany mocy czynnej modułu "
                "(ramp_rate_pct_per_min)"
            )
            return spec
        czas = (1 - udzial) / _ulamek(modul.ramp_rate_pct_per_min)
        spec.wynik = WynikKryterium(
            wielkosc_pl="czas wykonania z zadeklarowanego tempa zmiany mocy",
            symbol_latex="t",
            wartosc=Wielkosc(wartosc=czas, jednostka=_J_MINUTY),
            metoda="DEKLARACJA",
        )
        spec.metrics = {
            "czas_wykonania_min": _round(czas, 4),
            "czas_dopuszczalny_min": _round(dopuszczalny, 4),
        }
        spec.kroki.append(
            k.trace.add(
                definicja.test_id,
                "czas_regulacji_p",
                "t = (1 − u) / r ≤ max(k · (1 − u) / r_wym, t_min)",
                {
                    "udzial_mocy_docelowej": udzial,
                    "tempo_modulu_pct_min": modul.ramp_rate_pct_per_min,
                    "tempo_wymagane_pct_min": odpowiedz.ramp_rate_pct_per_min,
                    "krotnosc": krotnosc,
                    "czas_minimalny_min": minimum,
                },
                f"t = {format_liczba(czas)} min ≤ {format_liczba(dopuszczalny)} min",
                {
                    "czas_wykonania_min": _round(czas, 4),
                    "czas_odniesienia_min": _round(czas_odniesienia, 4),
                    "czas_dopuszczalny_min": _round(dopuszczalny, 4),
                },
                "1 / (1/min) = min.",
            )
        )
        return spec

    def _zakres_q(self, definicja: NcRfgPtpireeTestDefinition, k: _Kontekst) -> _Specyfikacja:
        """T06/T07/T09: pokrycie wymaganego zakresu mocy biernej — ocena strony zakresu o
        mniejszym zapasie (strona dolna: Q_min ≤ Q_wym,min; górna: Q_max ≥ Q_wym,max).

        Margines rekordu jest zapasem strony krytycznej, więc najmniejszy zapas pokrycia jest
        zawsze tym, który orzeka; zapas drugiej strony jest w śladzie."""
        modul, bierna = k.modul, k.profile.reactive_power
        identyfikator = {"T06": "regulacja_u", "T07": "regulacja_q", "T09": "q"}[definicja.test_id]
        podstawa_limitu = bierna.zrodlo
        spec = _Specyfikacja(
            kryterium_id=f"{identyfikator}.zakres_mocy_biernej",
            kryterium=Kryterium(
                opis_pl=(
                    f"{definicja.ability_pl}: pokrycie wymaganego zakresu mocy biernej — strona "
                    "zakresu o mniejszym zapasie"
                ),
                warunek_latex=(
                    r"Q_{\min} \le Q_{\mathrm{wym},\min} \;\wedge\; Q_{\max} \ge "
                    r"Q_{\mathrm{wym},\max}"
                ),
                relacja="NIE_MNIEJ",
            ),
            uwaga_zakresu=(
                "oceniono stronę zakresu mocy biernej o mniejszym zapasie pokrycia; zapas "
                "drugiej strony zapisany w śladzie"
            ),
        )
        potrzebna_krzywa = definicja.test_id in {"T06", "T07"}
        if potrzebna_krzywa:
            spec.dane.append(
                _flaga("krzywa Q(U) albo tryb regulacji Q (has_qu_curve)", modul.has_qu_curve)
            )
        for nazwa, wartosc in (
            ("dolna granica zakresu Q modułu (q_range_pct_pn_min)", modul.q_range_pct_pn_min),
            ("górna granica zakresu Q modułu (q_range_pct_pn_max)", modul.q_range_pct_pn_max),
        ):
            if wartosc is not None:
                spec.dane.append((nazwa, Wielkosc(wartosc=wartosc, jednostka=_J_Q)))
        braki_danych = modul.q_range_pct_pn_min is None or modul.q_range_pct_pn_max is None
        if braki_danych or (potrzebna_krzywa and not modul.has_qu_curve):
            spec.limit = LimitKryterium(
                wartosc=Wielkosc(wartosc=bierna.q_range_pct_pn_max, jednostka=_J_Q),
                podstawa=podstawa_limitu,
                zakres_stosowalnosci_pl="górna granica wymaganego zakresu mocy biernej",
                wersja_profilu=k.profile.wersja_profilu,
            )
            spec.braki.append(
                "zakres mocy biernej modułu (q_range_pct_pn_min, q_range_pct_pn_max)"
                + (" z deklaracją krzywej Q(U) (has_qu_curve)" if potrzebna_krzywa else "")
            )
            return spec
        assert modul.q_range_pct_pn_min is not None and modul.q_range_pct_pn_max is not None
        zapas_dolny = bierna.q_range_pct_pn_min - modul.q_range_pct_pn_min
        zapas_gorny = modul.q_range_pct_pn_max - bierna.q_range_pct_pn_max
        dolna = zapas_dolny <= zapas_gorny
        relacja: Relacja = "NIE_WIECEJ" if dolna else "NIE_MNIEJ"
        wartosc_modulu = modul.q_range_pct_pn_min if dolna else modul.q_range_pct_pn_max
        wartosc_wymagana = bierna.q_range_pct_pn_min if dolna else bierna.q_range_pct_pn_max
        strona = "dolna (Q_min)" if dolna else "górna (Q_max)"
        spec.kryterium = Kryterium(
            opis_pl=(
                f"{definicja.ability_pl}: pokrycie wymaganego zakresu mocy biernej — strona "
                "zakresu o mniejszym zapasie"
            ),
            warunek_latex=(
                r"Q_{\min} \le Q_{\mathrm{wym},\min}"
                if dolna
                else r"Q_{\max} \ge Q_{\mathrm{wym},\max}"
            ),
            relacja=relacja,
        )
        spec.limit = LimitKryterium(
            wartosc=Wielkosc(wartosc=wartosc_wymagana, jednostka=_J_Q),
            podstawa=podstawa_limitu,
            zakres_stosowalnosci_pl=f"strona {strona} wymaganego zakresu mocy biernej",
            wersja_profilu=k.profile.wersja_profilu,
        )
        spec.wynik = WynikKryterium(
            wielkosc_pl=f"granica zakresu mocy biernej modułu, strona {strona} (zadeklarowana)",
            symbol_latex=r"Q_{\min}" if dolna else r"Q_{\max}",
            wartosc=Wielkosc(wartosc=wartosc_modulu, jednostka=_J_Q),
            punkt_krytyczny_pl=f"strona {strona} zakresu — mniejszy zapas pokrycia",
            metoda="DEKLARACJA",
        )
        spec.metrics = {
            "q_min_kvar": _round(modul.p_max_kw * modul.q_range_pct_pn_min, 3),
            "q_max_kvar": _round(modul.p_max_kw * modul.q_range_pct_pn_max, 3),
        }
        spec.kroki.append(
            k.trace.add(
                definicja.test_id,
                "zakres_mocy_biernej",
                "zapas_dolny = Q_wym,min − Q_min; zapas_gorny = Q_max − Q_wym,max; orzeka "
                "strona o mniejszym zapasie",
                {
                    "zakres_modulu_pu": [modul.q_range_pct_pn_min, modul.q_range_pct_pn_max],
                    "zakres_wymagany_pu": [bierna.q_range_pct_pn_min, bierna.q_range_pct_pn_max],
                    "p_max_kw": modul.p_max_kw,
                },
                f"min({format_liczba(zapas_dolny)}, {format_liczba(zapas_gorny)})",
                {
                    "zapas_dolny_pu": _round(zapas_dolny, 6),
                    "zapas_gorny_pu": _round(zapas_gorny, 6),
                    "strona_krytyczna": "dolna" if dolna else "gorna",
                    "q_min_kvar": spec.metrics["q_min_kvar"],
                    "q_max_kvar": spec.metrics["q_max_kvar"],
                },
                "p.u. (P_n) − p.u. (P_n) = p.u. (P_n); kW · p.u. = kvar.",
            )
        )
        return spec

    def _cos_phi(self, definicja: NcRfgPtpireeTestDefinition, k: _Kontekst) -> _Specyfikacja:
        """T08: najmniejszy cosφ modułu nie większy niż wymagany (zakres regulacji cosφ)."""
        modul, bierna = k.modul, k.profile.reactive_power
        spec = _Specyfikacja(
            kryterium_id="cos_phi.zakres",
            kryterium=Kryterium(
                opis_pl=f"{definicja.ability_pl}: najmniejszy współczynnik mocy modułu",
                warunek_latex=r"\cos\varphi_{\min} \le \cos\varphi_{\mathrm{wym},\min}",
                relacja="NIE_WIECEJ",
            ),
            limit=LimitKryterium(
                wartosc=Wielkosc(wartosc=bierna.cos_phi_min, jednostka=_J_BEZWYMIAROWA),
                podstawa=bierna.zrodlo,
                zakres_stosowalnosci_pl="wymagany najmniejszy współczynnik mocy",
                wersja_profilu=k.profile.wersja_profilu,
            ),
        )
        if modul.cos_phi_min is None:
            spec.braki.append("najmniejszy współczynnik mocy modułu (cos_phi_min)")
            return spec
        wartosc = Wielkosc(wartosc=modul.cos_phi_min, jednostka=_J_BEZWYMIAROWA)
        spec.dane.append(("najmniejszy współczynnik mocy modułu (cos_phi_min)", wartosc))
        spec.wynik = WynikKryterium(
            wielkosc_pl="najmniejszy współczynnik mocy modułu (zadeklarowany)",
            symbol_latex=r"\cos\varphi_{\min}",
            wartosc=wartosc,
            metoda="DEKLARACJA",
        )
        spec.kroki.append(
            k.trace.add(
                definicja.test_id,
                "wspolczynnik_mocy",
                "cosφ_min,moduł ≤ cosφ_min,wym",
                {
                    "cos_phi_min_modulu": modul.cos_phi_min,
                    "cos_phi_min_wymagany": bierna.cos_phi_min,
                },
                f"{format_liczba(modul.cos_phi_min)} ≤ {format_liczba(bierna.cos_phi_min)}",
                {},
                "cosφ jest bezwymiarowy.",
            )
        )
        return spec

    def _moc_zadeklarowana(
        self, definicja: NcRfgPtpireeTestDefinition, k: _Kontekst
    ) -> _Specyfikacja:
        """T10 (P_max zadeklarowana) i T11 (P_min zadeklarowana i mniejsza od P_max) —
        spójność deklaracji programu szczegółowego (kryterium logiczne)."""
        modul = k.modul
        if definicja.test_id == "T10":
            spec = _Specyfikacja(
                kryterium_id="pmax.deklaracja",
                kryterium=Kryterium(
                    opis_pl=f"{definicja.ability_pl}: moc maksymalna zadeklarowana w programie",
                    warunek_latex=r"P_{\max} > 0",
                    relacja="LOGICZNE",
                ),
            )
            spec.dane.append(
                (
                    "moc maksymalna modułu (p_max_kw)",
                    Wielkosc(wartosc=modul.p_max_kw, jednostka=_J_KW),
                )
            )
            spec.wynik = WynikKryterium(
                wielkosc_pl="deklaracja mocy maksymalnej",
                symbol_latex=r"P_{\max}",
                wartosc=_logiczna(True),
                punkt_krytyczny_pl=(
                    f"moc maksymalna zadeklarowana w programie szczegółowym: "
                    f"{format_liczba(modul.p_max_kw)} kW"
                ),
                metoda="DEKLARACJA",
            )
            return spec
        spec = _Specyfikacja(
            kryterium_id="pmin.deklaracja",
            kryterium=Kryterium(
                opis_pl=(
                    f"{definicja.ability_pl}: moc minimalna zadeklarowana i mniejsza od mocy "
                    "maksymalnej"
                ),
                warunek_latex=r"0 \le P_{\min} < P_{\max}",
                relacja="LOGICZNE",
            ),
        )
        if modul.p_min_kw is None:
            spec.braki.append("moc minimalna modułu (p_min_kw)")
            return spec
        spec.dane.append(
            ("moc minimalna modułu (p_min_kw)", Wielkosc(wartosc=modul.p_min_kw, jednostka=_J_KW))
        )
        spojna = modul.p_min_kw < modul.p_max_kw
        spec.wynik = WynikKryterium(
            wielkosc_pl="deklaracja mocy minimalnej",
            symbol_latex=r"P_{\min}",
            wartosc=_logiczna(spojna),
            punkt_krytyczny_pl=(
                f"P_min = {format_liczba(modul.p_min_kw)} kW, P_max = "
                f"{format_liczba(modul.p_max_kw)} kW"
            ),
            metoda="DEKLARACJA",
        )
        return spec

    def _zaprzestanie_generacji(
        self, definicja: NcRfgPtpireeTestDefinition, k: _Kontekst
    ) -> _Specyfikacja:
        """T12: czas zaprzestania generacji po poleceniu wobec czasu z NC RfG art. 13 ust. 6.

        Dla modułu typu innego niż A wymaganie formalnie wynika z art. 14 ust. 2 (bez czasu
        w rozporządzeniu) — procedura stosuje ten sam czas, więc podstawa limitu ma stan
        najsłabszej z podstaw (czas z NC RfG i kryteria akceptacji procedury) z uwagą."""
        modul = k.modul
        wymaganie = k.profile.zaprzestanie_generacji
        podstawa = wymaganie.zrodlo
        if k.klasyfikacja.modul != "A":
            podstawa = _z_uwaga(
                _najslabsza(wymaganie.zrodlo, k.profile.kryteria_akceptacji.zrodlo),
                "czas z NC RfG art. 13 ust. 6 przyjęty przez procedurę dla modułu typu "
                f"{k.klasyfikacja.modul} (dla typu B wymaganie wynika z art. 14 ust. 2)",
            )
        spec = _Specyfikacja(
            kryterium_id="zaprzestanie_generacji.czas",
            kryterium=Kryterium(
                opis_pl=f"{definicja.ability_pl}: czas od polecenia do zaprzestania generacji",
                warunek_latex=r"t_{\mathrm{zap}} \le t_{\max}",
                relacja="NIE_WIECEJ",
            ),
            limit=LimitKryterium(
                wartosc=Wielkosc(wartosc=wymaganie.czas_max_s, jednostka=_J_SEKUNDY),
                podstawa=podstawa,
                zakres_stosowalnosci_pl="interfejs logiczny modułu (port wejściowy polecenia)",
                wersja_profilu=k.profile.wersja_profilu,
            ),
        )
        spec.dane.extend(
            _flagi(
                (
                    "funkcja zaprzestania generacji (stop_generation_enabled)",
                    modul.stop_generation_enabled,
                )
            )
        )
        if modul.cease_generation_time_s is not None:
            spec.dane.append(
                (
                    "czas zaprzestania generacji (cease_generation_time_s)",
                    Wielkosc(wartosc=modul.cease_generation_time_s, jednostka=_J_SEKUNDY),
                )
            )
        if not modul.stop_generation_enabled or modul.cease_generation_time_s is None:
            spec.braki.append(
                "deklaracja funkcji zaprzestania generacji (stop_generation_enabled) i czas "
                "zaprzestania generacji (cease_generation_time_s)"
            )
            return spec
        spec.wynik = WynikKryterium(
            wielkosc_pl="czas zaprzestania generacji po poleceniu (zadeklarowany)",
            symbol_latex=r"t_{\mathrm{zap}}",
            wartosc=Wielkosc(wartosc=modul.cease_generation_time_s, jednostka=_J_SEKUNDY),
            metoda="DEKLARACJA",
        )
        spec.metrics = {"cease_generation_time_s": modul.cease_generation_time_s}
        spec.kroki.append(
            k.trace.add(
                definicja.test_id,
                "zaprzestanie_generacji",
                "t_zap ≤ t_max",
                {
                    "czas_zaprzestania_s": modul.cease_generation_time_s,
                    "czas_max_s": wymaganie.czas_max_s,
                },
                f"{format_liczba(modul.cease_generation_time_s)} ≤ "
                f"{format_liczba(wymaganie.czas_max_s)}",
                {},
                "s − s = s.",
            )
        )
        return spec

    def _pozostanie_w_pracy(
        self, definicja: NcRfgPtpireeTestDefinition, k: _Kontekst
    ) -> _Specyfikacja:
        """T14/T15: pozostanie modułu w pracy podczas zapadu (LVRT) albo wzrostu (HVRT)
        napięcia — kryterium LOGICZNE z warunkiem wstępnym obwiedni profilu.

        Obwiednia jest warunkiem wstępnym uruchomienia obowiązku (kontrakt werdyktu §5.1),
        nie limitem marginesu. Bez biegu dynamiki modułu nie ma wyniku — deklaracje krzywej
        FRT albo modelu dynamicznego nie są wynikiem."""
        modul, poziomy = k.modul, k.profile.voltage_levels
        lvrt = definicja.test_id == "T14"
        punkty = poziomy.lvrt if lvrt else poziomy.hvrt
        nazwa = "zapadu" if lvrt else "wzrostu"
        relacja_pl = "nie niższe niż obwiednia LVRT" if lvrt else "nie wyższe niż obwiednia HVRT"
        spec = _Specyfikacja(
            kryterium_id="frt.pozostanie_w_pracy_lvrt" if lvrt else "frt.pozostanie_w_pracy_hvrt",
            kryterium=Kryterium(
                opis_pl=(
                    f"Pozostanie modułu w pracy podczas {nazwa} napięcia (moduł nie odłączony przez "
                    "własne zabezpieczenia ani ogranicznik)"
                ),
                warunek_latex=r"\text{moduł przyłączony w całym przedziale obwiedni}",
                relacja="LOGICZNE",
                warunek_wstepny_pl=(
                    f"napięcie w punkcie przyłączenia {relacja_pl} profilu (typy "
                    f"{', '.join(poziomy.lvrt_typy if lvrt else poziomy.hvrt_typy)}): "
                    f"{_obwiednia_pl(punkty)}"
                ),
                warunek_wstepny_podstawa=poziomy.lvrt_zrodlo if lvrt else poziomy.hvrt_zrodlo,
            ),
            braki=[_BRAK_BIEGU_DYNAMIKI],
        )
        spec.kroki.append(
            k.trace.add(
                definicja.test_id,
                "pozostanie_w_pracy_bez_biegu",
                "moduł przyłączony ∀t, gdy U(t) " + ("≥" if lvrt else "≤") + " U_obwiedni(t)",
                {
                    "obwiednia": [p.model_dump(mode="json") for p in punkty],
                    "deklaracja_krzywej": modul.has_lvrt_curve if lvrt else modul.has_hvrt_curve,
                    "deklaracja_modelu_dynamicznego": modul.has_dynamic_model,
                },
                "brak przebiegu U(t) i stanu przyłączenia modułu z biegu dynamiki — "
                "podstawienie niewykonalne",
                {},
                "Wartości logiczne bez jednostek.",
            )
        )
        return spec

    def _odbudowa_p(self, definicja: NcRfgPtpireeTestDefinition, k: _Kontekst) -> _Specyfikacja:
        """T16: czas odbudowy mocy czynnej po zakłóceniu (zachowanie dynamiczne — wartość
        zadeklarowana wyłącznie informacyjnie; tempo odbudowy w śladzie)."""
        modul, odbudowa = k.modul, k.profile.p_recovery_after_fault
        spec = _Specyfikacja(
            kryterium_id="odbudowa_p.czas",
            kryterium=Kryterium(
                opis_pl=f"{definicja.ability_pl}: czas odbudowy mocy czynnej po zakłóceniu",
                warunek_latex=r"t_{\mathrm{odb}} \le t_{\mathrm{odb,wym}}",
                relacja="NIE_WIECEJ",
            ),
            limit=LimitKryterium(
                wartosc=Wielkosc(wartosc=odbudowa.p_recovery_time_s, jednostka=_J_SEKUNDY),
                podstawa=odbudowa.zrodlo,
                zakres_stosowalnosci_pl=(
                    f"moduły typu {', '.join(odbudowa.required_for_modules)}; tempo odbudowy "
                    f"{format_liczba(odbudowa.p_recovery_rate_pct_per_s)} %/s w śladzie"
                ),
                wersja_profilu=k.profile.wersja_profilu,
            ),
            braki=[_BRAK_BIEGU_DYNAMIKI],
        )
        if modul.p_recovery_time_s is not None:
            wartosc = Wielkosc(wartosc=modul.p_recovery_time_s, jednostka=_J_SEKUNDY)
            spec.dane.append(("czas odbudowy mocy czynnej (p_recovery_time_s)", wartosc))
            spec.wynik = WynikKryterium(
                wielkosc_pl="czas odbudowy mocy czynnej (wartość zadeklarowana)",
                symbol_latex=r"t_{\mathrm{odb}}",
                wartosc=wartosc,
                metoda="DEKLARACJA",
            )
        spec.kroki.append(
            k.trace.add(
                definicja.test_id,
                "odbudowa_p",
                "t_odb ≤ t_odb,wym (wymaga przebiegu P(t) z biegu dynamiki)",
                {
                    "czas_zadeklarowany_s": modul.p_recovery_time_s,
                    "czas_wymagany_s": odbudowa.p_recovery_time_s,
                    "tempo_wymagane_pct_s": odbudowa.p_recovery_rate_pct_per_s,
                },
                "brak przebiegu P(t) z biegu dynamiki — wartość zadeklarowana informacyjnie",
                {},
                "s − s = s.",
            )
        )
        return spec

    def _prad_bierny(self, definicja: NcRfgPtpireeTestDefinition, k: _Kontekst) -> _Specyfikacja:
        """T17: wzmocnienie prądu biernego podczas zwarcia (zachowanie dynamiczne — wartość
        zadeklarowana wyłącznie informacyjnie)."""
        modul, kryteria = k.modul, k.profile.kryteria_akceptacji
        spec = _Specyfikacja(
            kryterium_id="szybki_prad_bierny.wzmocnienie",
            kryterium=Kryterium(
                opis_pl=f"{definicja.ability_pl}: wzmocnienie prądu biernego ΔI_q / ΔU",
                warunek_latex=r"K_{\mathrm{FRT}} = \frac{\Delta I_q}{\Delta U} \ge K_{\min}",
                relacja="NIE_MNIEJ",
            ),
            limit=LimitKryterium(
                wartosc=Wielkosc(wartosc=kryteria.k_frt_min, jednostka=_J_BEZWYMIAROWA),
                podstawa=kryteria.zrodlo,
                zakres_stosowalnosci_pl=(
                    "punkt testu: spadek napięcia "
                    f"{format_liczba(kryteria.spadek_napiecia_testu_frt_pu)} {_J_U}"
                ),
                wersja_profilu=k.profile.wersja_profilu,
            ),
            braki=[_BRAK_BIEGU_DYNAMIKI],
        )
        if modul.reactive_current_gain is not None:
            wartosc = Wielkosc(wartosc=modul.reactive_current_gain, jednostka=_J_BEZWYMIAROWA)
            spec.dane.append(("wzmocnienie prądu biernego (reactive_current_gain)", wartosc))
            spec.wynik = WynikKryterium(
                wielkosc_pl="wzmocnienie prądu biernego (wartość zadeklarowana)",
                symbol_latex=r"K_{\mathrm{FRT}}",
                wartosc=wartosc,
                metoda="DEKLARACJA",
            )
        spec.kroki.append(
            k.trace.add(
                definicja.test_id,
                "prad_bierny_frt",
                "K_FRT ≥ K_min (wymaga przebiegu I_q(t) z biegu dynamiki)",
                {
                    "wzmocnienie_zadeklarowane": modul.reactive_current_gain,
                    "wzmocnienie_minimalne": kryteria.k_frt_min,
                    "spadek_napiecia_testu_pu": kryteria.spadek_napiecia_testu_frt_pu,
                },
                "brak przebiegu I_q(t) z biegu dynamiki — wartość zadeklarowana informacyjnie",
                {},
                "p.u. / p.u. = 1.",
            )
        )
        return spec

    def _zdolnosci_dodatkowe(
        self, definicja: NcRfgPtpireeTestDefinition, k: _Kontekst
    ) -> _Specyfikacja:
        """T18: praca wyspowa, rozruch autonomiczny i tłumienie oscylacji (zachowanie
        dynamiczne — deklaracje zdolności pokazywane wyłącznie informacyjnie)."""
        modul = k.modul
        wymagane = [
            (nazwa, zdolna)
            for nazwa, wymagana, zdolna in (
                ("praca wyspowa", modul.island_operation_required, modul.island_operation_capable),
                ("rozruch autonomiczny", modul.black_start_required, modul.black_start_capable),
                (
                    "tłumienie oscylacji mocy",
                    modul.power_oscillation_damping_required,
                    modul.power_oscillation_damping_enabled,
                ),
            )
            if wymagana
        ]
        spec = _Specyfikacja(
            kryterium_id="zdolnosci_dodatkowe.zachowanie",
            kryterium=Kryterium(
                opis_pl=(
                    f"{definicja.ability_pl}: moduł realizuje zdolności dodatkowe wskazane w "
                    "programie szczegółowym"
                ),
                warunek_latex=r"\text{każda wymagana zdolność dodatkowa realizowana}",
                relacja="LOGICZNE",
            ),
            braki=[_BRAK_BIEGU_DYNAMIKI],
        )
        spec.dane.extend(_flagi(*((f"deklaracja zdolności: {n}", z) for n, z in wymagane)))
        if not wymagane:
            spec.braki.append(
                "wskazanie w programie szczegółowym zdolności dodatkowej wymaganej przez "
                "operatora (praca wyspowa, rozruch autonomiczny, tłumienie oscylacji)"
            )
            return spec
        niezadeklarowane = [nazwa for nazwa, zdolna in wymagane if zdolna is None]
        if niezadeklarowane:
            spec.braki.append(
                "deklaracja zdolności dodatkowej modułu: " + ", ".join(niezadeklarowane)
            )
            return spec
        wszystkie = all(zdolna for _, zdolna in wymagane)
        spec.wynik = WynikKryterium(
            wielkosc_pl="deklaracja zdolności dodatkowych (informacyjnie)",
            symbol_latex="",
            wartosc=_logiczna(wszystkie),
            punkt_krytyczny_pl="; ".join(
                f"{nazwa}: {'zadeklarowana' if zdolna else 'zadeklarowany brak'}"
                for nazwa, zdolna in wymagane
            ),
            metoda="DEKLARACJA",
        )
        spec.kroki.append(
            k.trace.add(
                definicja.test_id,
                "zdolnosci_dodatkowe",
                "każda wymagana zdolność dodatkowa realizowana (wymaga biegu dynamiki)",
                {"wymagane": dict(wymagane)},
                "deklaracje zdolności informacyjnie — brak biegu dynamiki",
                {},
                "Wartości logiczne bez jednostek.",
            )
        )
        return spec

    def _obserwowalnosc(self, definicja: NcRfgPtpireeTestDefinition, k: _Kontekst) -> _Specyfikacja:
        """T19: komunikacja z operatorem i rejestrator zakłóceń zadeklarowane (logiczne)."""
        modul = k.modul
        spec = _Specyfikacja(
            kryterium_id="obserwowalnosc.komunikacja_i_rejestrator",
            kryterium=Kryterium(
                opis_pl=(
                    f"{definicja.ability_pl}: komunikacja z operatorem i rejestrator zakłóceń "
                    "zadeklarowane"
                ),
                warunek_latex=r"\text{komunikacja} \wedge \text{rejestrator zakłóceń}",
                relacja="LOGICZNE",
            ),
        )
        komunikacja, rejestrator = modul.has_scada_communication, modul.has_disturbance_recorder
        spec.dane.extend(
            _flagi(
                ("komunikacja z operatorem (has_scada_communication)", komunikacja),
                ("rejestrator zakłóceń (has_disturbance_recorder)", rejestrator),
            )
        )
        if komunikacja is None or rejestrator is None:
            spec.braki.append(
                "deklaracja modułu: "
                + ", ".join(
                    nazwa
                    for nazwa, wartosc in (
                        ("komunikacja z operatorem (has_scada_communication)", komunikacja),
                        ("rejestrator zakłóceń (has_disturbance_recorder)", rejestrator),
                    )
                    if wartosc is None
                )
            )
            return spec
        spec.wynik = WynikKryterium(
            wielkosc_pl="deklaracja komunikacji i rejestratora zakłóceń",
            symbol_latex="",
            wartosc=_logiczna(komunikacja and rejestrator),
            punkt_krytyczny_pl=(
                f"komunikacja z operatorem: "
                f"{'zadeklarowana' if komunikacja else 'zadeklarowany brak'}; "
                f"rejestrator zakłóceń: "
                f"{'zadeklarowany' if rejestrator else 'zadeklarowany brak'}"
            ),
            metoda="DEKLARACJA",
        )
        return spec

    def _thd_u(self, definicja: NcRfgPtpireeTestDefinition, k: _Kontekst) -> _Specyfikacja:
        """T20: THD_U źródła (wartość katalogowa) nie większe niż dopuszczalne."""
        modul, kryteria = k.modul, k.profile.kryteria_akceptacji
        spec = _Specyfikacja(
            kryterium_id="jakosc_energii.thd_u",
            kryterium=Kryterium(
                opis_pl=f"{definicja.ability_pl}: współczynnik odkształcenia napięcia źródła",
                warunek_latex=r"\mathrm{THD}_U \le \mathrm{THD}_{U,\max}",
                relacja="NIE_WIECEJ",
            ),
            limit=LimitKryterium(
                wartosc=Wielkosc(wartosc=kryteria.thd_u_max_pct, jednostka=_J_PROCENT),
                podstawa=kryteria.zrodlo,
                zakres_stosowalnosci_pl="kontrola uzupełniająca wartości katalogowej",
                wersja_profilu=k.profile.wersja_profilu,
            ),
        )
        if modul.harmonic_thdu_percent is None:
            spec.braki.append(
                "współczynnik THDu źródła z karty katalogowej (harmonic_thdu_percent)"
            )
            return spec
        wartosc = Wielkosc(wartosc=modul.harmonic_thdu_percent, jednostka=_J_PROCENT)
        spec.dane.append(("współczynnik THDu źródła (harmonic_thdu_percent)", wartosc))
        spec.wynik = WynikKryterium(
            wielkosc_pl="współczynnik THDu źródła (wartość katalogowa)",
            symbol_latex=r"\mathrm{THD}_U",
            wartosc=wartosc,
            metoda="DEKLARACJA",
        )
        spec.metrics = {"thdu_percent": modul.harmonic_thdu_percent}
        spec.kroki.append(
            k.trace.add(
                definicja.test_id,
                "thd_u",
                "THD_U ≤ THD_U,max",
                {
                    "thdu_percent": modul.harmonic_thdu_percent,
                    "limit_percent": kryteria.thd_u_max_pct,
                },
                f"{format_liczba(modul.harmonic_thdu_percent)} ≤ "
                f"{format_liczba(kryteria.thd_u_max_pct)}",
                {},
                "% − % = pp.",
            )
        )
        return spec

    # ------------------------------------------------------------------
    # Raport
    # ------------------------------------------------------------------

    def _build_report(
        self, modules: list[NcRfgPtpireeModuleResult], tytul: str, wydanie: str | None
    ) -> str:
        """Raport tekstowy bez liczników: per moduł klasyfikacja z powodem, technologia, a per
        test etykieta Z REKORDU i zdanie wyjaśnienia (testy niestosowalne pominięte)."""
        lines = [
            "Raport testów zgodności NC RfG / PTPiREE (porównanie danych zadeklarowanych z "
            "profilem regulacyjnym)",
            f"Procedura: {tytul}" + (f", wydanie {wydanie}" if wydanie else ""),
            f"Solver: {NCRFG_PTPiREE_SOLVER_VERSION}",
            "",
        ]
        for module in modules:
            lines.extend(
                [
                    f"Moduł: {module.der_name or module.der_ref}",
                    f"Operator: {module.operator_name_pl}; P_max: "
                    f"{format_wielkosc(Wielkosc(wartosc=module.p_max_kw, jednostka=_J_KW))}",
                    f"Klasyfikacja: {module.klasyfikacja.powod_pl}",
                    f"Technologia: {NAZWA_TECHNOLOGII_PL[module.technologia]}",
                    f"Profil wymagań: {module.profile_version} (skrót {module.profile_hash})",
                ]
            )
            for test in module.tests:
                if test.ocena.status_maszynowy == "NIE_DOTYCZY":
                    continue
                lines.append(
                    f"- {test.test_id} {test.ability_pl}: {test.ocena.etykieta.etykieta_pl} — "
                    f"{test.ocena.wyjasnienie.zdanie_pl}"
                )
            lines.append("")
        return "\n".join(lines).strip()
