"""Rekordy werdyktu wyjaśnialnego pozycji oceny normatywnej (karta WERDYKT-MIGRACJA-190).

Każda pozycja raportu normatywnego (reguła rejestru ``rule_registry.RULES`` × dowód) niesie
rekord K: wielkość z dowodu (``ProofDocument.summary.key_results``) wobec limitu z podstawą,
margines, dowód i zakres ważności. Kod zastany ``NormativeItem.status`` jest PROJEKCJĄ tego
rekordu (``status_pozycji``): ``FAIL`` daje wyłącznie rekord ``NIE_SPELNIA``; próg ostrzeżenia
jest sygnałem bliskości limitu nakładanym na rekord spełniony (``WARNING``), nie werdyktem.
Zdanie ``why_pl`` pozycji jest zdaniem rekordu — słowa rozstrzygnięcia nie powstają tutaj.

Warstwa ANALIZY — zero fizyki: wielkości przychodzą gotowe z dowodu, tu wyłącznie porównanie
z limitem przez pakiet ``werdykt`` (jedna reguła decyzji produktu, równość limitu spełnia
relację).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

from analysis.normative.models import NormativeConfig, NormativeSeverity, NormativeStatus
from solver_input.provenance import classify_dynamic_capability
from werdykt import (
    DziedzinaFizyki,
    OcenaKryterium,
    OdnosnikSladu,
    PodstawaWymagania,
    Przedmiot,
    Relacja,
    ZakresWaznosci,
)
from werdykt.kontrakt import JEDNOSTKA_LOGICZNA
from werdykt.porownanie import (
    Porownanie,
    ocena_porownania,
    podstawa_nieustalona,
    podstawa_normy,
    podstawa_zalozenia,
)
from werdykt.porownanie import rozstrzygniecie as rozstrzygniecie_ocen

ZDOLNOSC_OCENY_NORMATYWNEJ: Final = "normatywna.ocena_dowodow"

_DOTYCZY_DOWODU: Final = "reguła rejestru oceny normatywnej stosuje się do dowodu tego pakietu"

_DOKUMENT_KONFIGURACJI: Final = "Konfiguracja oceny normatywnej programu (NormativeConfig)"


def _podstawa_konfiguracji(jednostka_redakcyjna: str, config: NormativeConfig) -> PodstawaWymagania:
    return podstawa_zalozenia(
        _DOKUMENT_KONFIGURACJI,
        jednostka_redakcyjna,
        uwagi_pl=f"odniesienie normowe zadeklarowane w konfiguracji: {config.standard_ref}",
    )


_PODSTAWA_WYLACZALNOSCI: Final = podstawa_normy(
    "IEC 62271-100 (wyłączniki wysokiego napięcia, SN/WN); PN-HD 60364-4-43 (nN)",
    "2021; 2012",
    "5.101 — znamionowy prąd wyłączalny zwarciowy; 434.5.1 — zdolność wyłączania nie mniejsza "
    "od spodziewanego prądu zwarciowego",
)
_PODSTAWA_DYNAMICZNA: Final = podstawa_normy(
    "IEC 62271-1 (aparatura rozdzielcza wysokiego napięcia — wymagania wspólne)",
    "2017",
    "5.7 — znamionowy prąd szczytowy wytrzymywany",
)
_PODSTAWA_CIEPLNA: Final = podstawa_normy(
    "IEC 62271-1 (aparatura rozdzielcza wysokiego napięcia — wymagania wspólne)",
    "2017",
    "5.6 i 5.8 — znamionowy prąd krótkotrwały wytrzymywany i znamionowy czas trwania zwarcia",
)
_PODSTAWA_SC3F: Final = podstawa_normy(
    "IEC 60909-0 (prądy zwarciowe w sieciach trójfazowych prądu przemiennego)",
    "2016",
    "4.2, 8 i 12 — prąd zwarciowy początkowy Ik'', prąd udarowy ip, prąd cieplny Ith",
)


@dataclass(frozen=True)
class _Definicja:
    kryterium_id: str
    opis_pl: str
    warunek_latex: str
    relacja: Relacja
    wielkosc_pl: str
    symbol_latex: str
    limit_pl: str
    rodzaj_analizy: DziedzinaFizyki
    opis_zakresu_pl: str


_DEFINICJE: Final[dict[str, _Definicja]] = {
    "NR_P15_001": _Definicja(
        kryterium_id="normatywna.obciazenie_pradowe",
        opis_pl="Obciążenie prądowe elementu nie większe od progu przekroczenia",
        warunek_latex=r"k_I \le k_{I,\text{limit}}",
        relacja="NIE_WIECEJ",
        wielkosc_pl="obciążenie prądowe elementu (prąd wobec prądu znamionowego)",
        symbol_latex=r"k_I",
        limit_pl="próg przekroczenia obciążenia z konfiguracji oceny normatywnej",
        rodzaj_analizy="POWER_FLOW",
        opis_zakresu_pl="Stan ustalony jednego biegu rozpływu mocy zapisany w dowodzie obciążeń",
    ),
    "NR_P15_002": _Definicja(
        kryterium_id="normatywna.obciazenie_mocowe",
        opis_pl="Obciążenie mocowe elementu nie większe od progu przekroczenia",
        warunek_latex=r"k_S \le k_{S,\text{limit}}",
        relacja="NIE_WIECEJ",
        wielkosc_pl="obciążenie mocowe elementu (moc pozorna wobec mocy znamionowej)",
        symbol_latex=r"k_S",
        limit_pl="próg przekroczenia obciążenia z konfiguracji oceny normatywnej",
        rodzaj_analizy="POWER_FLOW",
        opis_zakresu_pl="Stan ustalony jednego biegu rozpływu mocy zapisany w dowodzie obciążeń",
    ),
    "NR_P18_001": _Definicja(
        kryterium_id="normatywna.wylaczalnosc",
        opis_pl="Zdolność wyłączania aparatu nie mniejsza od prądu wyłączeniowego zwarcia",
        warunek_latex=r"I_b \le I_{cu}",
        relacja="LOGICZNE",
        wielkosc_pl="wynik warunku wyłączalności zapisany w dowodzie zabezpieczeń",
        symbol_latex=r"I_b \le I_{cu}",
        limit_pl="znamionowy prąd wyłączalny aparatu",
        rodzaj_analizy="SHORT_CIRCUIT",
        opis_zakresu_pl="Zwarcie w punkcie dowodu zabezpieczeń nadprądowych",
    ),
    "NR_P18_002": _Definicja(
        kryterium_id="normatywna.warunek_dynamiczny",
        opis_pl="Prąd udarowy zwarcia nie większy od prądu szczytowego wytrzymywanego aparatu",
        warunek_latex=r"i_p \le I_{dyn}",
        relacja="LOGICZNE",
        wielkosc_pl="wynik warunku dynamicznego zapisany w dowodzie zabezpieczeń",
        symbol_latex=r"i_p \le I_{dyn}",
        limit_pl="znamionowy prąd szczytowy wytrzymywany aparatu",
        rodzaj_analizy="SHORT_CIRCUIT",
        opis_zakresu_pl="Zwarcie w punkcie dowodu zabezpieczeń nadprądowych",
    ),
    "NR_P18_003": _Definicja(
        kryterium_id="normatywna.warunek_cieplny",
        opis_pl="Całka Joule'a zwarcia nie większa od wytrzymałości cieplnej aparatu",
        warunek_latex=r"\int i^2\,dt \le I_{th}^2 \, t_{th}",
        relacja="LOGICZNE",
        wielkosc_pl="wynik warunku cieplnego zapisany w dowodzie zabezpieczeń",
        symbol_latex=r"\int i^2\,dt \le I_{th}^2 t_{th}",
        limit_pl="znamionowy prąd krótkotrwały wytrzymywany aparatu w czasie znamionowym",
        rodzaj_analizy="SHORT_CIRCUIT",
        opis_zakresu_pl="Zwarcie w punkcie dowodu zabezpieczeń nadprądowych",
    ),
    "NR_P18_004": _Definicja(
        kryterium_id="normatywna.selektywnosc",
        opis_pl="Zabezpieczenia działają selektywnie",
        warunek_latex=r"\Delta t \ge \Delta t_{\text{min}}",
        relacja="LOGICZNE",
        wielkosc_pl="wynik oceny selektywności zapisany w dowodzie zabezpieczeń",
        symbol_latex=r"\Delta t \ge \Delta t_{\text{min}}",
        limit_pl="stopień selektywności wymagany konfiguracją oceny normatywnej",
        rodzaj_analizy="SHORT_CIRCUIT",
        opis_zakresu_pl="Zwarcie w punkcie dowodu zabezpieczeń nadprądowych",
    ),
    "NR_P19_001": _Definicja(
        kryterium_id="normatywna.napiecie_dotykowe",
        opis_pl="Napięcie dotykowe nie większe od limitu",
        warunek_latex=r"U_T \le U_{T,\text{limit}}",
        relacja="NIE_WIECEJ",
        wielkosc_pl="napięcie dotykowe przy zwarciu doziemnym SN",
        symbol_latex=r"U_T",
        limit_pl="limit napięcia dotykowego z konfiguracji oceny normatywnej",
        rodzaj_analizy="SHORT_CIRCUIT",
        opis_zakresu_pl="Zwarcie doziemne w sieci SN zapisane w dowodzie uziemień",
    ),
    "NR_P19_002": _Definicja(
        kryterium_id="normatywna.prad_doziemny",
        opis_pl="Prąd doziemny nie większy od limitu",
        warunek_latex=r"I_E \le I_{E,\text{limit}}",
        relacja="NIE_WIECEJ",
        wielkosc_pl="prąd doziemny przy zwarciu doziemnym SN",
        symbol_latex=r"I_E",
        limit_pl="limit prądu doziemnego z konfiguracji oceny normatywnej",
        rodzaj_analizy="SHORT_CIRCUIT",
        opis_zakresu_pl="Zwarcie doziemne w sieci SN zapisane w dowodzie uziemień",
    ),
    "NR_P11_001": _Definicja(
        kryterium_id="normatywna.komplet_wynikow_sc3f",
        opis_pl="Dowód zwarcia trójfazowego zawiera komplet wielkości Ik'', ip i Ith",
        warunek_latex=r"\{I_k'', i_p, I_{th}\} \subseteq \text{dowód}",
        relacja="LOGICZNE",
        wielkosc_pl="komplet wielkości zwarcia trójfazowego w dowodzie",
        symbol_latex=r"I_k'',\ i_p,\ I_{th}",
        limit_pl="komplet wielkości wymaganych przez IEC 60909-0",
        rodzaj_analizy="SHORT_CIRCUIT",
        opis_zakresu_pl="Zwarcie trójfazowe w punkcie dowodu SC3F",
    ),
    "NR_P17_001": _Definicja(
        kryterium_id="normatywna.profil_energii_strat",
        opis_pl="Dowód strat zawiera obliczoną energię strat",
        warunek_latex=r"E_{\text{strat}} \in \text{dowód}",
        relacja="LOGICZNE",
        wielkosc_pl="energia strat w dowodzie strat",
        symbol_latex=r"E_{\text{strat}}",
        limit_pl="obecność energii strat w dowodzie",
        rodzaj_analizy="POWER_FLOW",
        opis_zakresu_pl="Profil obciążenia zapisany w dowodzie strat energii",
    ),
}


def _podstawa(rule_id: str, config: NormativeConfig, *, limit_ustalony: bool) -> PodstawaWymagania:
    """Podstawa kryterium reguły. Limity napięcia dotykowego i prądu doziemnego istnieją tylko,
    gdy projektant wpisał je do konfiguracji — bez nich podstawa jest nieustalona (rekord
    ``BRAK_PODSTAWY``: wynik informacyjny, nie spełnienie)."""
    if rule_id in ("NR_P15_001", "NR_P15_002"):
        return _podstawa_konfiguracji(
            "próg przekroczenia obciążenia (loading_fail_pct) i próg ostrzeżenia "
            "(loading_warn_pct)",
            config,
        )
    if rule_id == "NR_P18_001":
        return _PODSTAWA_WYLACZALNOSCI
    if rule_id == "NR_P18_002":
        return _PODSTAWA_DYNAMICZNA
    if rule_id == "NR_P18_003":
        return _PODSTAWA_CIEPLNA
    if rule_id == "NR_P18_004":
        return _podstawa_konfiguracji("wymaganie selektywności (selectivity_required)", config)
    if rule_id in ("NR_P19_001", "NR_P19_002"):
        nazwa = "napięcia dotykowego" if rule_id == "NR_P19_001" else "prądu doziemnego"
        if not limit_ustalony:
            return podstawa_nieustalona(
                _DOKUMENT_KONFIGURACJI,
                uwagi_pl=f"limit {nazwa} nie został wpisany do konfiguracji oceny normatywnej",
            )
        return _podstawa_konfiguracji(f"limity {nazwa} wpisane przez projektanta", config)
    if rule_id == "NR_P11_001":
        return _PODSTAWA_SC3F
    return _podstawa_konfiguracji("obecność profilu energii strat w dowodzie strat", config)


def ocena_pozycji(
    *,
    rule_id: str,
    title_pl: str,
    target_id: str,
    proof_type: str,
    config: NormativeConfig,
    wynik: float | None = None,
    jednostka: str = "1",
    limit: float | None = None,
    spelniony: bool | None = None,
    braki: tuple[str, ...] = (),
    dotyczy: bool = True,
    powod_stosowalnosci_pl: str | None = None,
) -> OcenaKryterium:
    """Rekord K pozycji raportu normatywnego.

    Reguły progowe niosą ``wynik`` (liczba z dowodu) i ``limit`` (próg przekroczenia);
    reguły logiczne niosą ``spelniony`` (``None`` — warunku nie oceniono; ``braki`` nazywają
    przyczynę). ``dotyczy=False`` — kryterium nie stosuje się do przedmiotu (powód obowiązkowy).
    """
    d = _DEFINICJE[rule_id]
    wyznaczono = (wynik is not None) if d.relacja != "LOGICZNE" else (spelniony is not None)
    porownanie = Porownanie(
        kryterium_id=d.kryterium_id,
        opis_pl=d.opis_pl,
        warunek_latex=d.warunek_latex,
        relacja=d.relacja,
        wielkosc_pl=d.wielkosc_pl,
        symbol_latex=d.symbol_latex,
        jednostka=jednostka if d.relacja != "LOGICZNE" else JEDNOSTKA_LOGICZNA,
        wynik=wynik,
        limit=limit,
        limit_pl=d.limit_pl,
        spelniony=spelniony,
        braki=braki,
        dotyczy=dotyczy,
        powod_stosowalnosci_pl=powod_stosowalnosci_pl or _DOTYCZY_DOWODU,
    )
    return ocena_porownania(
        porownanie,
        przedmiot=Przedmiot(
            element_ref=None if target_id == "—" else target_id,
            nazwa_pl=title_pl,
            opis_pl=d.opis_zakresu_pl,
        ),
        podstawa=_podstawa(rule_id, config, limit_ustalony=limit is not None),
        zdolnosc=classify_dynamic_capability(ZDOLNOSC_OCENY_NORMATYWNEJ),
        zakres=ZakresWaznosci(
            rodzaj_analizy=d.rodzaj_analizy,
            opis_pl=d.opis_zakresu_pl,
            wykluczenia=("stany pracy i punkty sieci, dla których nie wygenerowano dowodu",),
        ),
        slad=(
            (
                OdnosnikSladu(
                    krok=f"proof.{proof_type.lower()}",
                    opis_pl=f"Wielkości kluczowe dowodu pakietu {proof_type}",
                ),
            )
            if wyznaczono
            else ()
        ),
        odniesienie="analysis/normative/evaluator.py",
    )


#: Kod zastany i waga pozycji wyprowadzone z rekordu (para bez własnego rozstrzygnięcia).
ProjekcjaPozycji = tuple[NormativeStatus, NormativeSeverity]


def status_pozycji(
    ocena: OcenaKryterium,
    *,
    wynik: float | None = None,
    prog_ostrzezenia: float | None = None,
    nierozstrzygniete: NormativeStatus = NormativeStatus.NOT_COMPUTED,
    waga_nierozstrzygnietych: NormativeSeverity = NormativeSeverity.WARNING,
) -> ProjekcjaPozycji:
    """Kod zastany pozycji z rekordu: ``FAIL`` ⇔ ``NIE_SPELNIA``; rekord spełniony ⇒ ``WARNING``,
    gdy wielkość osiągnęła próg ostrzeżenia (sygnał bliskości limitu), inaczej ``PASS``;
    rekord nierozstrzygnięty ⇒ ``nierozstrzygniete`` (``NOT_COMPUTED`` — wielkości nie
    wyznaczono; ``NOT_EVALUATED`` — dowód nie ocenił warunku albo brak podstawy limitu).
    Kryterium niestosowalne zawsze ``NOT_EVALUATED`` z wagą informacyjną."""
    if ocena.status_maszynowy == "NIE_DOTYCZY":
        return (NormativeStatus.NOT_EVALUATED, NormativeSeverity.INFO)
    rozstrzygniete = rozstrzygniecie_ocen((ocena,))
    if rozstrzygniete is None:
        return (nierozstrzygniete, waga_nierozstrzygnietych)
    if rozstrzygniete == "NIE_SPELNIA":
        return (NormativeStatus.FAIL, NormativeSeverity.FAIL)
    if wynik is not None and prog_ostrzezenia is not None and wynik >= prog_ostrzezenia:
        return (NormativeStatus.WARNING, NormativeSeverity.WARNING)
    return (NormativeStatus.PASS, NormativeSeverity.INFO)
