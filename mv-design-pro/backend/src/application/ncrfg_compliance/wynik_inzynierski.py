"""Adapter wyniku FROZEN testu NC RfG/PTPiREE na wynik inżynierski (karta AB-1a D2).

PO CO. Solver ``network_model/solvers/ncrfg_ptpiree`` (FROZEN, B-01) wydaje werdykt
testu jako literał (``pass/fail/no_data/not_required``) z luźnym słownikiem
``metrics`` — bez wartości wymaganej, marginesu, podstawy i statusu dowodu w jednym
obiekcie. Kontrakt solvera nie może dostać pól, więc ten adapter opakowuje wynik
testu w ISTNIEJĄCY kształt wyniku wyjaśnialnego (``PozycjaWerdyktu`` +
``OcenaElementu`` z ``application/analyses/werdykt_projektowy.py`` — zero trzeciego
kontraktu, R-2) i dokłada go ADDYTYWNIE do odpowiedzi biegu (``wynik_inzynierski``
per moduł i test, obok ``evidence_by_test``).

ZASADY (wiążące):

* Liczby WYŁĄCZNIE ze śladu solvera (``white_box_trace`` po ``trace_refs`` testu)
  i z ``metrics`` — adapter niczego nie liczy, nie wyprowadza granic ze stałych
  solvera (np. „2 × czas referencyjny"), nie oblicza marginesu, którego solver nie
  podał. Brak danej = ``None`` (kreska), nigdy wartość zastępcza.
* Werdykt testu przechodzi przez STOPIEŃ DOWODOWY (``solver_input.dowod_ncrfg``):
  ``pass`` oparty na zdolności niedopuszczalnej dowodowo NIE jest „spełnia", tylko
  „brak podstaw" z NAZWANYM stanem (deklaracja / test bez treści / brak symulacji /
  limit niezweryfikowany). ``fail`` zostaje „nie spełnia" (wynik wykazany).
* Podstawa: dokument procedury z biegu, ``zrodlo_status = UNVERIFIED_SOURCE`` dla
  WSZYSTKICH testów — wersje dokumentów wymagań (WOS/IRiESD) nie są potwierdzone
  (decyzja właściciela w toku), więc żadna podstawa nie udaje zweryfikowanej.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from application.analyses.werdykt_projektowy import (
    ELEMENT_ZRODLO,
    GRUPA_PRZYLACZENIE,
    STAN_NARUSZONE,
    STAN_NIE_DOTYCZY,
    STAN_NIESPRAWDZONE,
    STAN_SPELNIONE,
    WARUNEK_NIE_WIECEJ,
    WARUNEK_ZGODNOSC,
    WYNIK_BRAK_PODSTAW,
    WYNIK_NIE_SPELNIA,
    WYNIK_SPELNIA,
    ZRODLO_NCRFG,
    ZRODLO_NIEZWERYFIKOWANE,
    DefinicjaKryterium,
    OcenaElementu,
    PodstawaNormatywna,
    PozycjaWerdyktu,
    PunktKrytyczny,
)
from catalog.profiles.nc_rfg import NcRfgProfile, load_nc_rfg_profile
from network_model.solvers.ncrfg_ptpiree.contracts import (
    NcRfgPtpireeModuleResult,
    NcRfgPtpireeRunResult,
    NcRfgPtpireeTestResult,
    NcRfgTraceStep,
)
from network_model.solvers.ncrfg_ptpiree.engine import TEST_CATALOG
from solver_input.dowod_ncrfg import ocena_dowodowa_testu
from solver_input.provenance import BRAK_DOWODU_PL, CapabilityEvidence


@dataclass(frozen=True)
class _Wielkosc:
    """Skąd w śladzie testu leży wartość i wymaganie (klucze danych/wyniku kroku)."""

    wielkosc_pl: str
    symbol: str
    symbol_latex: str
    jednostka: str
    wartosc: tuple[str, str]  # ("data" | "result", klucz)
    odniesienie: tuple[str, str] | None
    margines: tuple[str, str] | None
    warunek_latex: str


#: Testy, dla których ślad solvera niesie JEDNĄ wielkość porównywaną z JEDNĄ
#: granicą w relacji „nie więcej niż" (albo samą wartość). Pozostałe testy
#: (T01-T04, T06, T07, T09, T18, T19) sprawdzają koniunkcję kilku warunków albo
#: flagi — skalarna wartość/granica byłaby tu uproszczeniem, więc zostają
#: kryterium zgodności z uzasadnieniem solvera (``summary_pl``).
#: T05/T12/T13/T17: ślad niesie wartość, ale granicę solver wyprowadza w kodzie
#: (np. „2 × czas referencyjny", „K_FRT ≥ 2") i NIE podaje jej — adapter jej nie
#: odtwarza (``odniesienie = None``).
_WIELKOSCI_TESTOW: dict[str, _Wielkosc] = {
    "T05": _Wielkosc(
        "Czas ustalenia mocy czynnej po zmianie nastawy",
        "t_ust",
        r"t_{\mathrm{ust}}",
        "min",
        ("result", "settling_time_min"),
        None,
        None,
        "",
    ),
    "T08": _Wielkosc(
        "Minimalny współczynnik mocy modułu",
        "cos φ_min",
        r"\cos\varphi_{\min}",
        "-",
        ("data", "cos_phi_min_module"),
        ("data", "cos_phi_min_profile"),
        None,
        r"\cos\varphi_{\min,\mathrm{mod}} \leq \cos\varphi_{\min,\mathrm{wym}}",
    ),
    "T10": _Wielkosc(
        "Moc maksymalna modułu",
        "P_max",
        r"P_{\max}",
        "kW",
        ("result", "value_kw"),
        None,
        None,
        "",
    ),
    "T11": _Wielkosc(
        "Moc minimalna modułu",
        "P_min",
        r"P_{\min}",
        "kW",
        ("result", "value_kw"),
        ("data", "p_max_kw"),
        None,
        r"0 \leq P_{\min} < P_{\max}",
    ),
    "T12": _Wielkosc(
        "Czas wykonania komendy zaprzestania generacji",
        "t_kom",
        r"t_{\mathrm{kom}}",
        "min",
        ("result", "execution_time_min"),
        None,
        None,
        "",
    ),
    "T13": _Wielkosc(
        "Czas wykonania komendy zmniejszenia generacji",
        "t_kom",
        r"t_{\mathrm{kom}}",
        "min",
        ("result", "execution_time_min"),
        None,
        None,
        "",
    ),
    "T16": _Wielkosc(
        "Czas odbudowy mocy czynnej po zakłóceniu",
        "t_odb",
        r"t_{\mathrm{odb}}",
        "s",
        ("data", "module_s"),
        ("data", "profile_s"),
        ("result", "margin_s"),
        r"t_{\mathrm{odb,mod}} \leq t_{\mathrm{odb,wym}}",
    ),
    "T17": _Wielkosc(
        "Prąd bierny podczas zapadu",
        "I_q",
        r"I_q",
        "p.u.",
        ("result", "iq_pu"),
        None,
        None,
        "",
    ),
    "T20": _Wielkosc(
        "Współczynnik odkształcenia napięcia THD_U",
        "THD_U",
        r"\mathrm{THD}_U",
        "%",
        ("data", "thdu_percent"),
        ("data", "limit_percent"),
        ("result", "margin_percent"),
        r"\mathrm{THD}_U \leq \mathrm{THD}_{U,\mathrm{lim}}",
    ),
}

#: Nazwany stan dowodowy testu z werdyktem ``pass`` opartym na zdolności
#: niedopuszczalnej dowodowo — per zdolność rejestru (``provenance.py``).
_STAN_BEZ_DOWODU_PL: dict[str, str] = {
    "ncrfg_ptpiree.test_bez_tresci": (
        "Test bez treści — wynik nie zależy od danych modułu: warunek sprawdzany przez "
        "test jest już wymuszony przez kontrakt danych wejściowych."
    ),
    "ncrfg_ptpiree.ride_through": (
        "Brak symulacji — napięcie „symulowane” jest przypisane z krzywej profilu, nie "
        "policzone; zapas wychodzi zerowy niezależnie od danych modułu."
    ),
    "ncrfg_ptpiree.power_quality_declared": (
        "Limit niezweryfikowany — próg THD_U jest stałą silnika obliczeń, nie wymaganiem "
        "z dokumentu; THD napięcia jest własnością sieci w miejscu przyłączenia, nie "
        "emisją urządzenia."
    ),
}
_STAN_DEKLARACJI_PL = (
    "Deklaracja wnioskodawcy — porównanie zadeklarowanej wartości z wymaganiem nie "
    "dowodzi zachowania modułu w czasie."
)
_STAN_BRAK_KLASYFIKACJI_PL = "Brak klasyfikacji dowodowej testu w rejestrze — wynik nie jest dowodem (fail-closed)."

_WYNIK_Z_WERDYKTU: dict[str, str] = {
    "pass": WYNIK_SPELNIA,
    "fail": WYNIK_NIE_SPELNIA,
    "no_data": WYNIK_BRAK_PODSTAW,
}


def _stan_bez_dowodu_pl(ewidencja: CapabilityEvidence | None) -> str:
    if ewidencja is None:
        return _STAN_BRAK_KLASYFIKACJI_PL
    nazwany = _STAN_BEZ_DOWODU_PL.get(ewidencja.capability_id)
    if nazwany is not None:
        return nazwany
    if ewidencja.tier.value == "DECLARATION":
        return _STAN_DEKLARACJI_PL
    return f"{BRAK_DOWODU_PL}: {ewidencja.rationale_pl}"


def _liczba(wartosc: Any) -> float | None:
    if isinstance(wartosc, bool) or not isinstance(wartosc, int | float):
        return None
    return float(wartosc)


def _krok_sladu(
    test: NcRfgPtpireeTestResult, slad: Sequence[NcRfgTraceStep]
) -> NcRfgTraceStep | None:
    """Pierwszy krok śladu wskazany przez test (``trace_refs`` → ``proof_ref``)."""
    po_ref = {krok.proof_ref: krok for krok in slad}
    for ref in test.trace_refs:
        if ref in po_ref:
            return po_ref[ref]
    return None


def _z_kroku(
    krok: NcRfgTraceStep | None, adres: tuple[str, str] | None
) -> float | None:
    if krok is None or adres is None:
        return None
    zrodlo, klucz = adres
    slownik: Mapping[str, Any] = krok.data if zrodlo == "data" else krok.result
    return _liczba(slownik.get(klucz))


def _podstawa(test_id: str, procedura: str, profil: NcRfgProfile) -> PodstawaNormatywna:
    definicja = next((d for d in TEST_CATALOG if d.test_id == test_id), None)
    opis = definicja.procedure_basis_pl if definicja is not None else None
    uwagi = [
        opis,
        (
            f"Wartości wymagań z profilu operatora {profil.operator_name_pl} (rewizja "
            f"{profil.last_revision}); dokument źródłowy, wersja i klauzula profilu nie są "
            "potwierdzone."
        ),
    ]
    if test_id == "T20":
        uwagi.append(
            "Granica 8 % pochodzi ze stałej silnika obliczeń, nie z profilu operatora ani "
            "z dokumentu wymagań."
        )
    return PodstawaNormatywna(
        dokument=procedura,
        wersja=None,
        klauzula=None,
        zrodlo_status=ZRODLO_NIEZWERYFIKOWANE,
        uwaga_pl=" ".join(u for u in uwagi if u),
    )


def z_testu_ncrfg(
    test: NcRfgPtpireeTestResult,
    modul: NcRfgPtpireeModuleResult,
    profil: NcRfgProfile,
    *,
    procedura: str,
    slad: Sequence[NcRfgTraceStep],
) -> PozycjaWerdyktu:
    """Wynik jednego testu NC RfG jako pozycja wyniku wyjaśnialnego.

    ``procedura`` — wersja procedury z biegu (``NcRfgPtpireeRunResult.
    procedure_version``); ``slad`` — ``white_box_trace`` biegu (liczby testu).
    """
    podstawa = _podstawa(test.test_id, procedura, profil)
    krok = _krok_sladu(test, slad)
    wielkosc = _WIELKOSCI_TESTOW.get(test.test_id)
    definicja = DefinicjaKryterium(
        kryterium_id=f"ncrfg.{test.test_id}",
        etap="E7",
        nazwa_pl=f"{test.test_id} — {test.ability_pl}",
        warunek_pl=(
            krok.formula
            if krok is not None
            else "Kryterium procedury (brak kroku śladu)"
        ),
        norma_pl=podstawa.render_pl(),
        zrodlo=ZRODLO_NCRFG,
        element_rodzaj=ELEMENT_ZRODLO,
        grupa=GRUPA_PRZYLACZENIE,
        wielkosc_pl=wielkosc.wielkosc_pl if wielkosc is not None else test.ability_pl,
        symbol=wielkosc.symbol if wielkosc is not None else "-",
        jednostka=wielkosc.jednostka if wielkosc is not None else "-",
        warunek=(
            WARUNEK_NIE_WIECEJ
            if wielkosc is not None and wielkosc.odniesienie is not None
            else WARUNEK_ZGODNOSC
        ),
        symbol_latex=wielkosc.symbol_latex if wielkosc is not None else "",
        warunek_latex=wielkosc.warunek_latex if wielkosc is not None else "",
    )
    if test.verdict == "not_required":
        return PozycjaWerdyktu(
            definicja=definicja,
            stan=STAN_NIE_DOTYCZY,
            powod_pl=test.required_reason_pl,
            podstawa=podstawa,
        )

    ewidencja = ocena_dowodowa_testu(test.test_id)
    dopuszczalny = ewidencja is not None and ewidencja.regulatory_evidence_eligible
    wynik = _WYNIK_Z_WERDYKTU.get(test.verdict, WYNIK_BRAK_PODSTAW)
    powod_kod: str | None = None
    powod_pl: str | None = None
    uzasadnienie = test.summary_pl
    if wynik == WYNIK_SPELNIA and not dopuszczalny:
        # „spełnia" bez dopuszczalnego dowodu to BRAK PODSTAW z nazwanym stanem.
        wynik = WYNIK_BRAK_PODSTAW
        powod_pl = _stan_bez_dowodu_pl(ewidencja)
        powod_kod = ewidencja.capability_id if ewidencja is not None else None
        uzasadnienie = f"{powod_pl} Wynik solvera: {test.summary_pl}"
    elif wynik == WYNIK_BRAK_PODSTAW:
        powod_pl = test.summary_pl

    wartosc = _z_kroku(krok, wielkosc.wartosc if wielkosc is not None else None)
    odniesienie = _z_kroku(krok, wielkosc.odniesienie if wielkosc is not None else None)
    margines = _z_kroku(krok, wielkosc.margines if wielkosc is not None else None)
    ewidencja_ride = (
        ewidencja is not None
        and ewidencja.capability_id == "ncrfg_ptpiree.ride_through"
    )
    if ewidencja_ride:
        # Wielkość „symulowana" T14/T15 nie jest policzona — nie ma wartości ani zapasu.
        wartosc, margines = None, None
    czas_krytyczny = _liczba(test.metrics.get("critical_time_s"))
    punkt = (
        PunktKrytyczny(element_ref=modul.der_ref, wspolrzedna={"t_s": czas_krytyczny})
        if czas_krytyczny is not None
        else None
    )
    element = OcenaElementu(
        element_id=modul.der_ref,
        element_nazwa=modul.der_name,
        element_rodzaj=ELEMENT_ZRODLO,
        wynik=wynik,
        wartosc=wartosc,
        odniesienie=odniesienie,
        jednostka=definicja.jednostka,
        margines=margines,
        margines_jednostka=(
            ("pkt proc." if definicja.jednostka == "%" else definicja.jednostka)
            if margines is not None
            else ""
        ),
        uzasadnienie_pl=uzasadnienie,
        wniosek_pl=_wniosek(wynik, test, powod_pl),
        dowod={
            "run_id": None,
            "element_id": modul.der_ref,
            "trace_ref": test.trace_refs[0] if test.trace_refs else None,
        },
        punkt_krytyczny=punkt,
    )
    stan = {
        WYNIK_SPELNIA: STAN_SPELNIONE,
        WYNIK_NIE_SPELNIA: STAN_NARUSZONE,
    }.get(wynik, STAN_NIESPRAWDZONE)
    return PozycjaWerdyktu(
        definicja=definicja,
        stan=stan,
        liczba_ocenionych=1 if wynik != WYNIK_BRAK_PODSTAW else 0,
        liczba_naruszen=1 if wynik == WYNIK_NIE_SPELNIA else 0,
        liczba_niesprawdzonych=1 if wynik == WYNIK_BRAK_PODSTAW else 0,
        wiodacy_element_id=modul.der_ref,
        wiodacy_opis_pl=test.summary_pl,
        powod_kod=powod_kod,
        powod_pl=powod_pl,
        elementy=(element,),
        podstawa=podstawa,
    )


def _wniosek(wynik: str, test: NcRfgPtpireeTestResult, powod_pl: str | None) -> str:
    """Wniosek formalny z werdyktu testu i stanu dowodowego (bez liczb własnych)."""
    if wynik == WYNIK_SPELNIA:
        return f"Wymaganie testu {test.test_id} spełnione na podstawie dopuszczalnej dowodowo."
    if wynik == WYNIK_NIE_SPELNIA:
        return f"Wymaganie testu {test.test_id} nie jest spełnione: {test.summary_pl.rstrip('.')}."
    powod = (powod_pl or test.summary_pl).rstrip(".")
    return f"Brak podstaw do oceny spełnienia wymagania testu {test.test_id}: {powod}."


def wyniki_inzynierskie_biegu(
    result: NcRfgPtpireeRunResult,
) -> dict[str, dict[str, dict[str, Any]]]:
    """Wynik inżynierski KAŻDEGO testu każdego modułu biegu (``der_ref → test_id → pozycja``).

    Kolejność deterministyczna (sortowanie kluczy) — ta sama postać co
    ``evidence_by_test`` koperty biegu.
    """
    wynik: dict[str, dict[str, dict[str, Any]]] = {}
    for modul in result.modules:
        profil = load_nc_rfg_profile(modul.operator_id)
        wynik[modul.der_ref] = {
            test.test_id: z_testu_ncrfg(
                test,
                modul,
                profil,
                procedura=result.procedure_version,
                slad=result.white_box_trace,
            ).to_dict()
            for test in sorted(modul.tests, key=lambda t: t.test_id)
        }
    return dict(sorted(wynik.items()))


__all__ = ["wyniki_inzynierskie_biegu", "z_testu_ncrfg"]
