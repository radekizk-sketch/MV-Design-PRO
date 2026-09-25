from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping
from typing import Any

from analysis.sanity_bounds.short_circuit_bounds import CREDIBLE
from analysis.ssci_stability.models import SOLVER_INCOMPLETE_STATUS, ocena_ssci_niewykonana
from application.ocena_niewykonana import STATUS_NIE_OCENIONO, ocena_niewykonana, rekord_json
from werdykt import ClaimKind, EvidenceTier, PodstawaWymagania, Przedmiot, ZakresWaznosci

JsonDict = dict[str, Any]

V126_PROOF_VERSION = "AcademicProofPackV1"
#: V2 (karta #145): raport przestał nieść sekcję „Wynik obliczeń" — obcięty zrzut wyniku
#: (24 pierwsze pola, pierwszy element każdej listy, klucze zamiast nazw wielkości) udawał
#: wynik, który ma pełną prezentację na ekranie. Raport niesie tożsamość: dowód (identyfikator,
#: odcisk, liczba kroków śladu), audyt deterministyczny i politykę eksportu.
V126_REPORT_VERSION = "AcademicReportV2"

#: Trasa kanoniczna rankingu N-1/N-2 (pełny re-solve solvera rozpływu) — karta
#: W3-E. `reliability_contingency` V12.6 liczy dotkliwość z `_branch_current_a`
#: (prąd gałęzi z obciążenia węzła docelowego, bez sprzężenia sieci) i NIE jest
#: kanonem rankingu; kanon = `application/analyses/kontyngencje_n1.py`.
RANKING_N1_TRASA_KANONICZNA = "/api/insights/n-1-contingency"
RANKING_N1_EKRAN_KANONICZNY = "Wyniki › Kontyngencje"


def _canonical_payload(payload: Any) -> str:
    return json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _hash(payload: Any) -> str:
    return hashlib.sha256(_canonical_payload(payload).encode("utf-8")).hexdigest()


def _result_payload(run_record: Mapping[str, Any]) -> Mapping[str, Any]:
    result = run_record["result"]
    if not isinstance(result, Mapping):
        raise TypeError("V12.6 run record does not contain a mapping result.")
    return result


#: Klucze rankingu N-1/N-2 zdejmowane z wyniku `reliability_contingency`
#: (karta W3-E, KARTA_W3 §0 rodzina E) — zmierzone w `_reliability`
#: (`network_model/solvers/v126_academic.py:1069-1188`): `contingency_ranking`
#: (lista pozycji rankingu, klucz w kluczu wyniku) i dwa klucze towarzyszące
#: WYŁĄCZNIE rankingowi (meldunek zbiorczy o brakujących obciążalnościach,
#: sensowny tylko jako komentarz DO rankingu, który po zdjęciu rankingu byłby
#: osieroconym, mylącym fragmentem — sugerowałby, że "reszta" ma poprawny
#: ranking N-1, podczas gdy ranking nie jest prezentowany w CAŁOŚCI).
_KLUCZE_RANKINGU_N1 = ("contingency_ranking", "brak_danych", "elementy_bez_obciazalnosci")


def bez_rankingu_n1(result: Mapping[str, Any]) -> JsonDict:
    """Zdejmuje z wyniku `reliability_contingency` ranking N-1/N-2 pochodny od
    `_branch_current_a` (solver FROZEN — B-01, funkcja NIE zmienia solvera,
    tylko postprocessuje jego wynik w warstwie aplikacyjnej) i dokłada stan
    `ranking_n1` z odnośnikiem do rankingu kanonicznego.

    Karta W3-E (KARTA_W3 §0 rodzina E, 9 #2): `_reliability` liczy dotkliwość
    kontyngencji z `_branch_current_a` — prąd wyliczony z obciążenia WĘZŁA
    DOCELOWEGO gałęzi, bez sprzężenia sieci (nie jest to rozpływ). Kanon
    rankingu N-1 = `application/analyses/kontyngencje_n1.py` (pełny re-solve
    solvera rozpływu dla każdej kontyngencji). Wskaźniki niezawodności
    (SAIDI/SAIFI/CAIDI/MAIFI, klucz `indices`) NIE są dotknięte — to JEDYNA
    implementacja tych wskaźników w systemie i zostają widoczne bez zmian.

    Funkcja jest CZYSTA (ten sam wynik solvera → ten sam wynik postprocessu —
    determinizm) i wywoływana RAZ, w `enm/canonical_analysis.py::_execute_v126`,
    zanim wynik trafi do `run_record["result"]` — stąd jeden punkt wywołania
    zasila końcówkę `results` (czyta `run_record["result"]` wprost). Końcówka
    `report` od kontraktu `AcademicReportV2` (karta #145) nie niesie już żadnego pola
    wyniku, a końcówka `proof` (`build_v126_proof_artifact`) czyta WYŁĄCZNIE
    `white_box_trace`, który nigdy nie niósł klucza rankingu — obie są czyste z
    konstrukcji, bez potrzeby osobnego wywołania. `trace` (`GET .../trace`) zostaje SUROWY —
    WHITE BOX solvera jest audytowalny w całości; adnotacja `ranking_n1` jedzie
    tam DODATKOWO jako pole na poziomie odpowiedzi trasy (nie w krokach śladu).
    """
    wynik: JsonDict = dict(result)
    for klucz in _KLUCZE_RANKINGU_N1:
        wynik.pop(klucz, None)

    sanity = wynik.get("sanity")
    if isinstance(sanity, Mapping):
        naruszenia = sanity.get("violations")
        if isinstance(naruszenia, list):
            # `n1_overload` jest DRUGIM, zagnieżdżonym kluczem pochodnym od
            # `_branch_current_a` (filtr `overloaded` w `_reliability` czyta
            # `max_loading_percent` — ten sam prąd gałęzi bez rozpływu) —
            # KLASA, nie instancja: usuwamy WSZYSTKIE klucze rankingu, nie
            # tylko ten nazwany w audycie.
            przefiltrowane = [
                naruszenie
                for naruszenie in naruszenia
                if not (
                    isinstance(naruszenie, Mapping) and naruszenie.get("check") == "n1_overload"
                )
            ]
            if len(przefiltrowane) != len(naruszenia):
                nowy_sanity = dict(sanity)
                nowy_sanity["violations"] = przefiltrowane
                # Ten sam predykat status<->violations co `_sanity_block`
                # solvera (pusta lista naruszeń = w paśmie) — etykieta pasma z JEDNEJ
                # stałej rodziny pasm (`CREDIBLE`), nie z literału solvera.
                nowy_sanity["status"] = CREDIBLE if not przefiltrowane else _SANITY_POZA_ZAKRESEM
                wynik["sanity"] = nowy_sanity

    wynik["ranking_n1"] = {
        "status": "NIEPREZENTOWANY",
        "powod_pl": (
            "ranking liczony z prądu gałęzi bez rozpływu (V12.6); ranking "
            "kanoniczny = pełny re-solve"
        ),
        "ekran": RANKING_N1_EKRAN_KANONICZNY,
        "trasa": RANKING_N1_TRASA_KANONICZNA,
    }
    return wynik


#: Literał statusu bloku wiarygodności zwracany przez solver FROZEN (`_sanity_block`,
#: `network_model/solvers/v126_academic.py`) dla wyniku w paśmie — twierdził weryfikację,
#: której kontrola nie wykonuje. Na granicy aplikacji zamieniany na `CREDIBLE`
#: („w paśmie wiarygodności"), tę samą stałą co pasma zwarć i rozpływu.
_SANITY_SOLVERA_W_PASMIE = "zweryfikowany"
_SANITY_POZA_ZAKRESEM = "poza zakresem wiarygodności"

_RODZAJ_JAKOSC_ENERGII = "power_quality_harmonics"
_RODZAJ_SSCI = "ssci_impedance"
_RODZAJ_NIEZAWODNOSC = "reliability_contingency"

#: Klucz sekcji audytowej wyniku jakości energii — JEDYNE miejsce liczb solvera
#: harmonicznego w odpowiedzi (THD, TDD, K, U_h, skan Z, „rezonanse").
KLUCZ_WYNIKU_AUDYTOWEGO = "wynik_audytowy"

#: Nagłówek sekcji audytowej (tekst widoczny dla projektanta, bez kodów projektu).
NAGLOWEK_WYNIKU_NIEZWALIDOWANEGO_PL = (
    "Wynik solvera niezwalidowanego — nie jest wynikiem inżynierskim "
    "(sondy audytu harmonicznych z 2026-09-23)"
)
#: Ustalenia audytu harmonicznych 2026-09-23 — stan faktyczny solvera, powód braku oceny.
POWODY_NIEZWALIDOWANIA_HARMONICZNYCH_PL: tuple[str, ...] = (
    "Brak przekładni transformatora: szyny różnych poziomów napięcia liczone są w omach "
    "bez sprowadzenia do wspólnej bazy.",
    "Rezystancja transformatora zaniżona o czynnik kwadratu napięcia znamionowego.",
    "Sieć nadrzędna zastąpiona admitancją 1e6 S na pierwszej szynie modelu; moc zwarciowa "
    "źródła zasilania nie wchodzi do obliczeń harmonicznych.",
    "Kondensatory, odbiory i admitancja przekształtnika nie są modelowane.",
    "Liczonych jest wyłącznie 18 zaszytych rzędów (2, 3, 5, 7, 11, 13, 17, 19, 23, 25, 29, 31, "
    "35, 37, 41, 43, 47, 49); pozostałe rzędy widma są cicho pomijane.",
    "Wszystkie źródła mają fazę zerową — prądy harmoniczne sumują się koherentnie.",
    "Współczynnik THD odniesiony jest do napięcia znamionowego, nie do składowej podstawowej "
    "z rozpływu.",
    "„Rezonans” to każdy punkt skanu z modułem impedancji ponad 10 razy większym niż przy 50 Hz "
    "— jeden rezonans daje dziesiątki wpisów.",
    "Żadna wielkość nie ma niezależnej wyroczni (obliczenia ręcznego ani programu zewnętrznego).",
)
#: Konkretne braki powierzchni E-40 (po brakach nazwanych przez regułę K).
BRAKI_OCENY_JAKOSCI_ENERGII: tuple[str, ...] = (
    "Solver harmoniczny na wspólnej macierzy admitancyjnej z przekładnią transformatora, "
    "impedancją źródła zasilania, kondensatorami i odbiorami — obecny solver liczy sieć bez "
    "przekładni i zastępuje sieć nadrzędną admitancją 1e6 S na pierwszej szynie modelu; jego "
    "liczby są dostępne wyłącznie w sekcji audytowej.",
    "Niezależna wyrocznia potwierdzająca wynik (obliczenie ręczne sieci dwu- i trzyszynowej, "
    "rezonans równoległy, program zewnętrzny).",
    "Rejestr wymagań jakości energii z dokumentem, wydaniem, poziomem napięcia i punktem oceny.",
    "Do czasu solvera z wyrocznią: pomiar jakości energii albo obliczenie zewnętrzne w punkcie "
    "oceny — decyzji projektowych o harmonicznych nie opiera się na liczbach tego solvera.",
)


def ocena_jakosci_energii_niewykonana() -> JsonDict:
    """Rekord ``NIE_OCENIONO`` (``werdykt.OcenaKryterium``) analizy harmonicznych (ekran E-40).

    Podstawa: PN-EN 50160 wskazana z nazwy, bez wydania i jednostki redakcyjnej limitu współczynnika odkształcenia napięcia THD
    w rejestrze wymagań — stan źródła ``NIEUSTALONE`` (rejestr jest jednym z braków).
    """
    return rekord_json(
        ocena_niewykonana(
            kryterium_id="power_quality_harmonics.kompatybilnosc",
            przedmiot=Przedmiot(
                element_ref=None,
                nazwa_pl="Szyny sieci modelu",
                opis_pl="Odkształcenie napięcia i prądu w węzłach sieci modelu",
            ),
            opis_kryterium_pl=(
                "Kompatybilność harmoniczna napięć i prądów w węzłach sieci (współczynnik "
                "odkształcenia harmonicznego napięcia THD i prądu TDD)"
            ),
            podstawa=PodstawaWymagania(
                rodzaj="NORMA",
                dokument="PN-EN 50160",
                status="NIEUSTALONE",
                uwagi_pl=(
                    "wydanie i jednostka redakcyjna limitu współczynnika odkształcenia napięcia "
                    "THD nieustalone w rejestrze wymagań jakości energii"
                ),
            ),
            powod_stosowalnosci_pl="sieć modelu ze źródłami odkształcającymi (przekształtniki)",
            rodzaj_twierdzenia=ClaimKind.STATIC_CALCULATION,
            poziom=EvidenceTier.UNVALIDATED_MODEL,
            status_modelu="NIE_DOTYCZY",
            zakres_waznosci=ZakresWaznosci(
                rodzaj_analizy="HARMONIC_FREQUENCY_DOMAIN",
                opis_pl="Solver harmoniczny V12.6 (niezwalidowany)",
                wykluczenia=(
                    "przekładnia transformatora między poziomami napięcia",
                    "impedancja sieci nadrzędnej z mocy zwarciowej źródła",
                    "kondensatory, odbiory i admitancja przekształtnika",
                    "rzędy harmoniczne spoza 18 zaszytych rzędów",
                ),
            ),
            powod_braku_niepewnosci_pl=(
                "brak wielkości rozstrzygającej — liczby solvera są materiałem audytowym, więc "
                "niepewność wyniku nie dotyczy"
            ),
            czego_brakuje=BRAKI_OCENY_JAKOSCI_ENERGII,
        )
    )


def _sanity_z_etykieta_pasma(sanity: Any) -> Any:
    """Blok wiarygodności z etykietą pasma zamiast „zweryfikowany" (bez innych zmian)."""
    if isinstance(sanity, Mapping) and sanity.get("status") == _SANITY_SOLVERA_W_PASMIE:
        return {**sanity, "status": CREDIBLE}
    return sanity


def _jakosc_energii_bez_werdyktu(ladunek: Mapping[str, Any]) -> JsonDict:
    """Wynik jakości energii bez werdyktu: ocena niewykonana + liczby w sekcji audytowej.

    Status kompatybilności węzła staje się `NIE_OCENIONO` (dawniej „zgodny" także dla szyny
    bez danych harmonicznych), a lista „przekroczonych limitów" znika — to były werdykty
    liczone z liczb niezwalidowanych. Liczby (THD, TDD, K, U_h, skan Z, „rezonanse") i blok
    wiarygodności trafiają WYŁĄCZNIE do sekcji audytowej z nagłówkiem o niezwalidowaniu.
    """
    wezly: list[JsonDict] = []
    for wezel in ladunek.get("nodes") or []:
        if not isinstance(wezel, Mapping):
            continue
        bez_werdyktu = {k: v for k, v in wezel.items() if k != "violated_limits"}
        bez_werdyktu["compatibility_status"] = STATUS_NIE_OCENIONO
        wezly.append(bez_werdyktu)
    reszta = {k: v for k, v in ladunek.items() if k not in ("nodes", "sanity")}
    return {
        **reszta,
        "ocena": ocena_jakosci_energii_niewykonana(),
        KLUCZ_WYNIKU_AUDYTOWEGO: {
            "naglowek_pl": NAGLOWEK_WYNIKU_NIEZWALIDOWANEGO_PL,
            "powody_pl": list(POWODY_NIEZWALIDOWANIA_HARMONICZNYCH_PL),
            "nodes": wezly,
            "sanity": _sanity_z_etykieta_pasma(ladunek.get("sanity")),
        },
    }


def _tekst_lub_brak(wartosc: Any) -> str | None:
    """Odnośnik z ładunku solvera jako tekst albo ``None`` (brak wartości to brak, nie „None")."""
    return str(wartosc) if wartosc not in (None, "") else None


def wynik_v126_dla_powierzchni(
    analysis_type: str, envelope: Mapping[str, Any], *, nazwy: Mapping[str, str]
) -> JsonDict:
    """JEDYNA granica „wynik solvera V12.6 → wynik powierzchni" (API, raport, fixtury).

    Solver FROZEN (B-01) zostaje nietknięty: koperta, ślad White Box i odcisk
    (`deterministic_hash`, liczony przez solver PRZED tą funkcją) przechodzą bez zmian;
    zmienia się wyłącznie ładunek `envelope["result"]`:
      - KAŻDY rodzaj: etykieta bloku wiarygodności „zweryfikowany" → „w paśmie
        wiarygodności" (kontrola pasma, nie weryfikacja);
      - `reliability_contingency`: ranking N-1/N-2 zdjęty (`bez_rankingu_n1`, karta W3-E);
      - `power_quality_harmonics`: ocena niewykonana, liczby w sekcji audytowej;
      - `ssci_impedance`: ocena niewykonana (Z_grid bez przekładni transformatora) — ten
        sam rekord co widok stabilności SSCI.
    Wołana w `enm/canonical_analysis.py::_execute_v126` (ścieżka API) i w generatorze fixtury
    strażnika prezentacji (`tests/ci/generuj_odpowiedzi_v126.py`) — fixtura jest odciskiem
    ODPOWIEDZI API, nie surowego solvera. `nazwy` — indeks `ref_id -> nazwa` migawki modelu
    biegu (`enm.nazwy_elementow.zbuduj_indeks_nazw`): przedmiot oceny SSCI nazywa
    przekształtnik i szynę nazwami z modelu (karta #144).
    """
    ladunek_solvera = envelope.get("result")
    if not isinstance(ladunek_solvera, Mapping):
        return dict(envelope)
    ladunek: JsonDict = dict(ladunek_solvera)
    if "sanity" in ladunek:
        ladunek["sanity"] = _sanity_z_etykieta_pasma(ladunek["sanity"])
    if analysis_type == _RODZAJ_NIEZAWODNOSC:
        ladunek = bez_rankingu_n1(ladunek)
    elif analysis_type == _RODZAJ_JAKOSC_ENERGII:
        ladunek = _jakosc_energii_bez_werdyktu(ladunek)
    elif analysis_type == _RODZAJ_SSCI:
        ladunek["ocena"] = ocena_ssci_niewykonana(
            converter_ref=_tekst_lub_brak(ladunek.get("converter_ref")),
            bus_ref=_tekst_lub_brak(ladunek.get("bus_ref")),
            nazwy=nazwy,
            tablice_obecne=ladunek.get("status") != SOLVER_INCOMPLETE_STATUS,
            braki_danych=[str(pole) for pole in ladunek.get("missing_fields") or []],
        )
    return {**envelope, "result": ladunek}


def build_v126_proof_artifact(run_record: Mapping[str, Any]) -> JsonDict:
    result = _result_payload(run_record)
    trace_steps = result.get("white_box_trace", [])
    if not isinstance(trace_steps, list):
        trace_steps = []
    deterministic_hash = str(result["deterministic_hash"])
    analysis_type = str(run_record["analysis_type"])
    steps = []
    for index, step in enumerate(trace_steps, start=1):
        if not isinstance(step, Mapping):
            continue
        steps.append(
            {
                "ordinal": index,
                "proof_ref": step.get("proof_ref") or f"proof:v126:{analysis_type}:{index}",
                "formula": step.get("formula"),
                "data": step.get("data", {}),
                "substitution": step.get("substitution"),
                "result": step.get("result", {}),
                # V126-JEZYK: polska postać wyniku kroku (liczba z jednostką)
                # jedzie DO PAKIETU DOWODOWEGO — inaczej ekran dowodu wracałby
                # do zrzutu słownika, mimo naprawionego śladu (ta sama klasa,
                # drugi konsument).
                "result_pl": step.get("result_pl"),
                "unit_check": step.get("unit_check"),
                "proof_status": step.get("proof_status", "complete"),
            }
        )
    proof = {
        "contract": V126_PROOF_VERSION,
        "proof_id": f"proof:v126:{analysis_type}:{deterministic_hash[:16]}",
        "run_id": run_record["run_id"],
        "case_id": run_record["case_id"],
        "analysis_type": analysis_type,
        "source_result_hash": deterministic_hash,
        "trace_step_count": len(steps),
        "steps": steps,
    }
    proof["proof_hash"] = _hash(proof)
    return proof


def build_v126_report_artifact(run_record: Mapping[str, Any], proof: Mapping[str, Any]) -> JsonDict:
    """Artefakt raportu analizy V12.6 — TOŻSAMOŚĆ raportu, nie kopia wyniku.

    Sekcje o stałych kluczach metryk (etykiety polskie nadaje ekran z typowanej mapy):
    ``dowod`` (``proof_id``, ``proof_hash``, ``trace_step_count``) i ``audyt``
    (``result_hash``, ``solver_version``, ``input_hash``). Wynik obliczeń ma pełną
    prezentację na ekranie i w pakiecie dowodowym, więc raport go nie powtarza.
    """
    result = _result_payload(run_record)
    analysis_type = str(run_record["analysis_type"])
    source_result_hash = str(result["deterministic_hash"])
    proof_hash = str(proof["proof_hash"])
    report = {
        "contract": V126_REPORT_VERSION,
        "report_id": f"report:v126:{analysis_type}:{source_result_hash[:16]}",
        "run_id": run_record["run_id"],
        "case_id": run_record["case_id"],
        "analysis_type": analysis_type,
        "source_result_hash": source_result_hash,
        "source_proof_hash": proof_hash,
        "export_policy": "frozen_result_and_proof_only",
        "sections": [
            {
                "section_id": "dowod",
                "title": "Dowód obliczeń",
                "metrics": [
                    {"label": "proof_id", "value": proof["proof_id"]},
                    {"label": "proof_hash", "value": proof_hash},
                    {"label": "trace_step_count", "value": proof["trace_step_count"]},
                ],
            },
            {
                "section_id": "audyt",
                "title": "Audyt deterministyczny",
                "metrics": [
                    {"label": "result_hash", "value": source_result_hash},
                    {"label": "solver_version", "value": result.get("solver_version")},
                    {"label": "input_hash", "value": result.get("input_hash")},
                ],
            },
        ],
    }
    report["report_hash"] = _hash(report)
    return report
