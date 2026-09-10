from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping
from typing import Any

JsonDict = dict[str, Any]

V126_PROOF_VERSION = "AcademicProofPackV1"
V126_REPORT_VERSION = "AcademicReportV1"

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


def _metric_rows(value: Any, prefix: str = "", limit: int = 24) -> list[JsonDict]:
    rows: list[JsonDict] = []
    if len(rows) >= limit:
        return rows
    if not isinstance(value, Mapping):
        rows.append({"label": prefix or "wynik", "value": value})
        return rows
    for key in sorted(value):
        if len(rows) >= limit:
            break
        item = value[key]
        label = f"{prefix}.{key}" if prefix else str(key)
        if isinstance(item, list):
            rows.append({"label": label, "value": f"{len(item)} pozycji"})
            if item and isinstance(item[0], Mapping):
                for child_key in sorted(item[0])[:6]:
                    rows.append({"label": f"{label}[0].{child_key}", "value": item[0][child_key]})
                    if len(rows) >= limit:
                        break
        elif isinstance(item, Mapping):
            rows.extend(_metric_rows(item, label, limit - len(rows)))
        else:
            rows.append({"label": label, "value": item})
    return rows[:limit]


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
    zasila WSZYSTKICH trzech konsumentów payloadu: końcówkę `results` (czyta
    `run_record["result"]` wprost), końcówkę `report` (`build_v126_report_artifact`
    czyta `result_payload["result"]` — TEN SAM słownik) i końcówkę `proof`
    (`build_v126_proof_artifact` czyta WYŁĄCZNIE `white_box_trace`, który nigdy
    nie niósł klucza rankingu — trzeci konsument jest więc czysty z konstrukcji,
    bez potrzeby osobnego wywołania). `trace` (`GET .../trace`) zostaje SUROWY —
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
                # solvera (`_status`/`"zweryfikowany" if not violations else
                # …`) — reużyty tutaj, nie wymyślony na nowo (predykaty parami,
                # jedno źródło prawdy o tym, co oznacza pusta lista naruszeń).
                nowy_sanity["status"] = (
                    "zweryfikowany" if not przefiltrowane else "poza zakresem wiarygodności"
                )
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
    result = _result_payload(run_record)
    payload = result.get("result", {})
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
                "section_id": "wynik",
                "title": "Wynik obliczeń",
                "metrics": _metric_rows(payload),
            },
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
