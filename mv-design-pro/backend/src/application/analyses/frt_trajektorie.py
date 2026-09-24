"""Serwis aplikacyjny: trajektorie FRT/HVRT modułu OZE z WYMAGANĄ obwiednią profilu operatora.

Warstwa APPLICATION (ZERO fizyki). Dla wskazanego modułu DER (typ katalogowy
przekształtnika) i profilu operatora NC RfG:
- uruchamia FROZEN solver ``FrtHvrtSolverAdapter`` (``network_model.solvers.frt_hvrt``)
  przez współdzieloną budowę wejścia ``build_frt_hvrt_input``,
- dokłada obwiednię profilu operatora — punkty krzywej LVRT/HVRT (czas→napięcie)
  z ``NcRfgProfile.voltage_levels`` (``catalog.profiles.nc_rfg.loader``) — WYŁĄCZNIE jako
  informację o wymaganiu,
- NIE wydaje werdyktu: trajektoria solvera jest funkcją ZADANĄ scenariuszem (napięcie =
  profil wejściowy), a „utrzymanie pracy" i „margines do krzywej" liczy on z kryterium
  v > 0,05 p.u. wobec TEGO SAMEGO profilu wejściowego — tautologia (sonda audytu
  2026-09-23: zapad do 0,06 p.u. przez 3 s był uznawany za dotrzymanie obwiedni). Każdy
  scenariusz i widok niosą rekord kontraktu werdyktu (`ocena`, ``werdykt.OcenaKryterium``
  o statusie ``NIE_OCENIONO`` z podstawą = obwiednia profilu z jej stanem źródła), a pola
  solvera zostają w odpowiedzi jako materiał audytowy (sekcja `sekcja_audytowa_pl`).

Odwzorowania (plik:linia w kodzie źródłowym):
- trajektoria + status + margines ← ``FrtScenarioResult``
  (``network_model.solvers.frt_hvrt.contracts``),
- obwiednia LVRT/HVRT ← ``NcRfgProfile.voltage_levels.lvrt`` / ``.hvrt``, punkty
  ``NcRfgRideThroughPoint(time_s, voltage_pu)`` (``catalog.profiles.nc_rfg.loader``),
- budowa wejścia solvera ← ``application.ncrfg_compliance.frt_input.build_frt_hvrt_input``.
"""

from __future__ import annotations

from typing import Any, Literal, cast

from application.ncrfg_compliance.frt_input import build_frt_hvrt_input
from application.ocena_niewykonana import ocena_niewykonana, rekord_json
from catalog.profiles.nc_rfg.loader import NcRfgProfile
from network_model.catalog.types import ConverterType
from network_model.solvers.frt_hvrt import FrtHvrtSolverAdapter
from network_model.solvers.frt_hvrt.contracts import FrtHvrtResult, FrtScenario
from solver_input.provenance import classify_dynamic_capability
from werdykt import ClaimKind, PodstawaWymagania, Przedmiot, ZakresWaznosci

# Zaokrąglenie wartości wyjściowych — determinizm i czytelność.
_ROUND = 6

# Karta S-4 (W6-0): kod gotowości ISTNIEJĄCY (`domain/canonical_operations.py::
# READINESS_CODES`) — status solvera FROZEN `no_module` NIGDY nie dociera do
# FE jako `status_solvera` (S-4: `no_module` przestaje istnieć jako stan poza
# kontraktami FROZEN); mapowany NA GRANICY na `blocked` z tym kodem nazwanym.
KOD_GOTOWOSCI_BRAK_MODELU_DYNAMICZNEGO = "der.dynamic_profile_missing"


def _widok_bez_modelu_dynamicznego(
    result: FrtHvrtResult,
    *,
    modul_der: dict[str, Any],
    operator: dict[str, Any],
    dodatkowe: dict[str, Any],
) -> dict[str, Any]:
    """Widok „brak modelu dynamicznego" — mapowanie granicy S-4 (karta S-1+S-4).

    Solver FROZEN `FrtHvrtSolverAdapter` deklaruje status `no_module` w swoim
    kontrakcie (`FrtHvrtStatus`), choć dziś nigdy go faktycznie nie zwraca
    (`brak danych wejściowych` daje `input_invalid`, walidowane wejście —
    wynikiem silnika). Ta funkcja jest bezpiecznikiem GRANICY: gdyby kiedyś
    zwrócił, widok aplikacyjny NIGDY nie przepuszcza literału `no_module` do
    FE — zamienia go na `blocked` z nazwanym, istniejącym kodem gotowości.
    """
    return {
        "modul_der": modul_der,
        "operator": operator,
        "status_solvera": "blocked",
        "kod_gotowosci": KOD_GOTOWOSCI_BRAK_MODELU_DYNAMICZNEGO,
        "missing_fields_pl": [
            result.no_module_reason_pl or "Brak modelu dynamicznego DER w wejściu solvera."
        ],
        **dodatkowe,
    }


#: Wartość dawnego pola werdyktu (kontrakt `str` zachowany) — JEDYNA do czasu biegu
#: dynamiki na silniku kanonicznym. Dawne „w obwiedni / poza obwiednią / moduł wypadł"
#: skasowane (tautologia kryterium v > 0,05 p.u. wobec profilu wejściowego).
WERDYKT_NIE_OCENIONO_PL = "nie oceniono"

#: Nagłówek sekcji audytowej pól solvera (trajektoria, utrzymanie, margines, odzysk).
SEKCJA_AUDYTOWA_FRT_PL = (
    "Wynik uproszczonego solvera trajektorii — nie jest wynikiem inżynierskim "
    "(napięcie zadane profilem wejściowym, kryterium utrzymania wobec tego samego profilu)"
)

#: Powód braku oceny — JEDNO miejsce dla wywodu scenariusza, braków rekordu i wykluczeń
#: zakresu ważności (tekst o stanie solvera, nie werdykt).
POWOD_BRAKU_OCENY_FRT_PL = (
    "trajektoria obecnego solvera nie jest rozwiązaniem sieci — napięcie jest zadane profilem "
    "wejściowym scenariusza, a kryterium v > 0,05 p.u. liczone wobec tego samego profilu jest "
    "tautologią (sonda audytu 2026-09-23: zapad do 0,06 p.u. trwający 3 s był uznawany za "
    "dotrzymanie obwiedni)"
)
#: Konkretne braki powierzchni FRT (po brakach nazwanych przez regułę K) — co trzeba dostarczyć.
BRAKI_OCENY_FRT: tuple[str, ...] = (
    "Bieg dynamiki RMS modułu na silniku kanonicznym z modelem sieci, zweryfikowany wyrocznią "
    "— " + POWOD_BRAKU_OCENY_FRT_PL + ".",
    "Ocena trajektorii z rozwiązania sieci wobec obwiedni profilu operatora i nastaw "
    "zabezpieczeń modułu.",
    "Do czasu biegu kanonicznego: certyfikat albo raport z badań modułu wykazujący zdolność "
    "przejścia przez zakłócenie (trajektoria tego okna nie jest takim dowodem).",
)
#: Wykluczenia zakresu ważności trajektorii (wchodzą do zastrzeżeń rekordu).
WYKLUCZENIA_TRAJEKTORII_FRT: tuple[str, ...] = (
    "trajektoria wyznaczona z rozwiązania sieci",
    "kryterium utrzymania pracy niezależne od profilu wejściowego",
)
#: Stopień dowodowy trajektorii — z rejestru zdolności dynamicznych (jedno źródło).
_ZDOLNOSC_TRAJEKTORII = "frt_hvrt.trajectory"
_NAZWA_RODZAJU_PL = {
    "lvrt": "Zdolność przejścia przez zapad napięcia (LVRT) nad obwiednią profilu operatora",
    "hvrt": "Zdolność przejścia przez wzrost napięcia (HVRT) pod obwiednią profilu operatora",
}


def _podstawa_obwiedni(profile: NcRfgProfile, rodzaj: Literal["lvrt", "hvrt"]) -> PodstawaWymagania:
    """Podstawa kryterium FRT = obwiednia z profilu operatora, ze stanem źródła NAZWANYM wprost.

    Profil operatora nie wskazuje dokumentu źródłowego obwiedni (wydania ani jednostki
    redakcyjnej), więc podstawa ma rodzaj ``NIEUSTALONA`` i stan ``NIEUSTALONE`` — kontrakt
    werdyktu nie pozwala podnieść stanu bez dokumentu. Tożsamość podstawy (operator, rewizja
    pliku profilu, rodzaj obwiedni) pochodzi z danych profilu, nie jest dopisana ręcznie.
    """
    return PodstawaWymagania(
        rodzaj="NIEUSTALONA",
        dokument=(
            f"Profil wymagań przyłączeniowych operatora {profile.operator_name_pl}, rewizja pliku "
            f"{profile.last_revision} — obwiednia {rodzaj.upper()}"
        ),
        status="NIEUSTALONE",
        uwagi_pl=(
            "profil nie wskazuje dokumentu źródłowego obwiedni — wydanie i jednostka "
            "redakcyjna nieustalone"
        ),
    )


def ocena_frt_niewykonana(
    *,
    converter: ConverterType,
    profile: NcRfgProfile,
    rodzaj: Literal["lvrt", "hvrt"],
    kryterium_id: str,
    opis_przedmiotu_pl: str,
) -> dict[str, Any]:
    """Rekord ``NIE_OCENIONO`` (``werdykt.OcenaKryterium``) trajektorii albo sekwencji FRT.

    Podstawa kryterium = obwiednia profilu operatora (``_podstawa_obwiedni``); dowód
    ``BRAK_METODY`` na zdolności o poziomie z rejestru (trajektoria MVP); model przekształtnika
    bez walidacji (``UNVALIDATED_MODEL``).
    """
    podstawa = _podstawa_obwiedni(profile, rodzaj)
    ewidencja = classify_dynamic_capability(_ZDOLNOSC_TRAJEKTORII)
    return rekord_json(
        ocena_niewykonana(
            kryterium_id=kryterium_id,
            przedmiot=Przedmiot(
                element_ref=converter.id,
                nazwa_pl=converter.name,
                opis_pl=opis_przedmiotu_pl,
            ),
            opis_kryterium_pl=_NAZWA_RODZAJU_PL[rodzaj],
            podstawa=podstawa,
            powod_stosowalnosci_pl=(
                "obwiednia "
                + rodzaj.upper()
                + " z profilu operatora "
                + profile.operator_name_pl
                + " dla badanego modułu DER (stosowalność wg typu modułu rozstrzyga ocena "
                "zgodności NC RfG)"
            ),
            rodzaj_twierdzenia=ClaimKind.DYNAMIC_PERFORMANCE,
            poziom=ewidencja.tier,
            status_modelu="UNVALIDATED_MODEL",
            zakres_waznosci=ZakresWaznosci(
                opis_pl=(
                    "Trajektoria uproszczonego solvera prób FRT/HVRT — napięcie zadane profilem "
                    "wejściowym scenariusza"
                ),
                technologia=converter.kind.value,
                wykluczenia=WYKLUCZENIA_TRAJEKTORII_FRT,
            ),
            powod_braku_niepewnosci_pl=(
                "brak wielkości rozstrzygającej — trajektoria nie jest wynikiem oceny, więc "
                "niepewność wyniku nie dotyczy"
            ),
            czego_brakuje=BRAKI_OCENY_FRT,
        )
    )


_VALID_TEST_KINDS = ("lvrt", "hvrt")


def opis_obwiedni_wymaganej(rodzaj: str) -> str:
    """Opis obwiedni profilu — informacja o WYMAGANIU, nigdy podstawa oceny."""
    return (
        "Wymagana obwiednia "
        + rodzaj.upper()
        + " profilu operatora (informacja): dozwolony przebieg napięcia (czas→napięcie) wg "
        "profilu NC RfG — nie jest podstawą oceny, bo trajektoria nie jest rozwiązaniem sieci."
    )


def _round(value: float) -> float:
    return round(float(value), _ROUND)


def _krok(tekst: str, latex: str | None = None) -> dict[str, Any]:
    """Krok wywodu WHITE BOX: tekst (ASCII-PL, deterministyczny) + opcjonalny LaTeX.

    Kontrakt kanoniczny ``{tekst, latex}`` — wzorzec 1:1 z
    ``analysis.energy_validation.builder._krok`` (zasada wywodow KaTeX 2026-07-22).
    """
    return {"tekst": tekst, "latex": latex}


def _wywod_scenariusza(scenario: FrtScenario | None) -> list[dict[str, Any]]:
    """Wywód scenariusza: echo wejścia → charakter trajektorii → ocena niewykonana.

    Czysty formatter (ZERO fizyki, ZERO werdyktu): liczby pochodzą z echa wejścia solvera
    (zapad/wzrost, czas trwania). Dawny wywód „wzór marginesu → podstawienie → SPEŁNIONE"
    skasowany — margines solvera to min(v − 0,05) liczony wobec profilu wejściowego, nie
    wobec krzywej profilu operatora. Formaty stałe (determinizm), ASCII-PL.
    """
    kroki: list[dict[str, Any]] = []
    if scenario is not None:
        kroki.append(
            _krok(
                f"Scenariusz {scenario.scenario_id} ({scenario.test_kind.upper()}): "
                f"napiecie zaklocenia {scenario.voltage_dip_depth_pu:.4f} p.u. "
                f"przez {scenario.fault_duration_s:.4f} s (echo wejscia solvera prob FRT/HVRT)."
            )
        )
    kroki.append(
        _krok(
            "Trajektoria: napiecie zadane profilem wejsciowym scenariusza (nie rozwiazanie "
            "sieci); prad bierny i moc czynna z odpowiedzi inercyjnej uproszczonego modelu."
        )
    )
    kroki.append(_krok(f"Ocena niewykonana: {POWOD_BRAKU_OCENY_FRT_PL}."))
    return kroki


def _wejscie_solvera_echo(scenario: FrtScenario | None) -> dict[str, Any] | None:
    """Echo parametrów wejścia solvera dla scenariusza (ślad WHITE BOX).

    Wzorzec ``wejscie_solvera`` z ``frt_sekwencja`` — zapad/wzrost napięcia i czas
    trwania zakłócenia (stałe testbenchu NC RfG z ``frt_input``). ``None`` gdy brak
    dopasowania scenariusza wejścia po ``scenario_id`` (nie powinno wystąpić).
    """
    if scenario is None:
        return None
    return {
        "test_kind": scenario.test_kind,
        "voltage_dip_depth_pu": _round(scenario.voltage_dip_depth_pu),
        "fault_duration_s": _round(scenario.fault_duration_s),
        "target_der_ref": scenario.target_der_ref,
    }


def build_frt_trajectories_view(
    converter: ConverterType,
    profile: NcRfgProfile,
    test_kind: str,
) -> dict[str, Any]:
    """Zbuduj widok trajektorii FRT/HVRT modułu DER z obwiednią profilu operatora.

    Raises:
        ValueError: gdy ``test_kind`` nie jest ``lvrt``/``hvrt`` — komunikat w języku polskim.
    """
    if test_kind not in _VALID_TEST_KINDS:
        raise ValueError(
            f"Nieznany rodzaj testu '{test_kind}'. Dozwolone rodzaje: "
            + ", ".join(_VALID_TEST_KINDS)
            + "."
        )
    kind = cast(Literal["lvrt", "hvrt"], test_kind)

    # Obwiednia profilu operatora — punkty krzywej czas→napięcie.
    curve_points = profile.voltage_levels.lvrt if kind == "lvrt" else profile.voltage_levels.hvrt
    obwiednia = [
        {"czas_s": _round(pt.time_s), "napiecie_pu": _round(pt.voltage_pu)} for pt in curve_points
    ]

    modul_der = {
        "id": converter.id,
        "nazwa": converter.name,
        "kind": converter.kind.value,
        "pmax_mw": _round(converter.pmax_mw),
        "un_kv": _round(converter.un_kv),
    }
    operator = {"id": profile.operator_id, "nazwa": profile.operator_name_pl}

    # Bieg FROZEN solvera przez współdzieloną budowę wejścia (ta sama ścieżka co checker).
    solver_input = build_frt_hvrt_input(
        converter.id,
        kind,
        scenario_id=f"{kind}_{converter.id}",
    )
    result = FrtHvrtSolverAdapter().run(solver_input)
    if result.status == "no_module":
        return _widok_bez_modelu_dynamicznego(
            result,
            modul_der=modul_der,
            operator=operator,
            dodatkowe={"test_kind": kind, "scenariusze": []},
        )

    # Echo parametrow wejscia solvera per scenariusz — dopasowanie po scenario_id
    # (wzorzec ``wejscie_solvera`` z ``frt_sekwencja``).
    scenarios_by_id = {sc.scenario_id: sc for sc in solver_input.scenarios}

    scenariusze: list[dict[str, Any]] = []
    for sc in result.scenario_results:
        trajektoria = [
            {
                "czas_s": _round(pt.time_s),
                "napiecie_pu": _round(pt.voltage_pu),
                "iq_bierny_pu": _round(pt.iq_reactive_pu),
                "p_czynna_pu": _round(pt.p_active_pu),
            }
            for pt in sc.trajectory
        ]
        scenariusze.append(
            {
                "scenario_id": sc.scenario_id,
                # Pola solvera poniżej (status, utrzymanie, marginesy, odzysk) są
                # materiałem AUDYTOWYM — tautologia wobec profilu wejściowego.
                "status": sc.status,
                "stayed_connected": sc.stayed_connected,
                "margin_to_curve_s": (
                    None if sc.margin_to_curve_s is None else _round(sc.margin_to_curve_s)
                ),
                "margin_to_curve_pu": (
                    None if sc.margin_to_curve_pu is None else _round(sc.margin_to_curve_pu)
                ),
                "p_recovery_time_s": (
                    None if sc.p_recovery_time_s is None else _round(sc.p_recovery_time_s)
                ),
                "werdykt_pl": WERDYKT_NIE_OCENIONO_PL,
                "ocena": ocena_frt_niewykonana(
                    converter=converter,
                    profile=profile,
                    rodzaj=kind,
                    kryterium_id=f"frt_hvrt.{kind}.{converter.id}.{sc.scenario_id}",
                    opis_przedmiotu_pl=(
                        f"Moduł DER {converter.name} w scenariuszu {sc.scenario_id} testu "
                        f"{kind.upper()} profilu operatora {profile.operator_name_pl}"
                    ),
                ),
                "liczba_punktow_trajektorii": len(trajektoria),
                # Ślad WHITE BOX — parametry wejścia solvera dla tego scenariusza.
                "wejscie_solvera": _wejscie_solvera_echo(scenarios_by_id.get(sc.scenario_id)),
                # Wywód {tekst, latex} (zasada KaTeX 2026-07-22): echo wejścia, charakter
                # trajektorii i powód braku oceny — bez marginesu i bez werdyktu.
                "wywod": _wywod_scenariusza(scenarios_by_id.get(sc.scenario_id)),
                "trajektoria": trajektoria,
            }
        )

    return {
        "modul_der": modul_der,
        "operator": operator,
        "test_kind": kind,
        "status_solvera": result.status,
        # Stopień dowodowy trajektorii (karta S-1 §0.9): trajektoria MVP jest
        # funkcją zadaną parametryzowaną scenariuszem, nie rozwiązaniem sieci —
        # UNVALIDATED_MODEL, nieprzydatne jako dowód regulacyjny (fail-closed).
        "ocena_dowodowa": classify_dynamic_capability("frt_hvrt.trajectory").to_dict(),
        "ocena": ocena_frt_niewykonana(
            converter=converter,
            profile=profile,
            rodzaj=kind,
            kryterium_id=f"frt_hvrt.{kind}.{converter.id}",
            opis_przedmiotu_pl=(
                f"Moduł DER {converter.name} w teście {kind.upper()} profilu operatora "
                f"{profile.operator_name_pl}"
            ),
        ),
        "sekcja_audytowa_pl": SEKCJA_AUDYTOWA_FRT_PL,
        "obwiednia_profilu": {
            "rodzaj": kind,
            "opis": opis_obwiedni_wymaganej(kind),
            "punkty": obwiednia,
        },
        "scenariusze": scenariusze,
    }
