"""Wspólna koperta ``context`` widoków analiz — nazwy zgodne z tym, co niosą.

Warstwa APPLICATION (mapowanie, NIE fizyka). Jedno miejsce, w którym powstaje
sekcja ``context`` odpowiedzi widoku analizy: skąd wynik pochodzi (projekt,
wariant pracy, migawka modelu, przebieg, znacznik czasu).

DLACZEGO TEN MODUŁ ISTNIEJE (V12K-267).
Kopertę budowało SIEDEM niezależnych kopii tego samego kodu
(``dobor_kompensacji``, ``hosting_capacity``, ``migotanie``, ``odpowiedz_osd``,
``pq_area``, ``sanity_bounds``, ``state_estimation``) i każda niosła te same
TRZY nazwy niezgodne z zawartością:

- ``trace_id`` niosło ``str(run.id)`` — identyfikator PRZEBIEGU. Prawdziwy
  ``trace_id`` w tym systemie to skrót TREŚCI artefaktu
  (``application/trace_emitters/deterministic_ids.py``: „identyczne wejście
  logiczne artefaktu → identyczne trace_id"), i tak jest używany w warstwie
  analysis — ``analysis/normative/evaluator.py`` ustawia
  ``trace_id=str(first.artifact_id)``. Jedna nazwa, dwa różne znaczenia w
  dwóch warstwach: kto sięgnie po ``context.trace_id``, żeby pobrać ślad albo
  dowód, zapyta identyfikatorem biegu i dostanie pustkę.
- ``case_name`` niosło ``str(run.case_id)`` — identyfikator pod kluczem „nazwa".
- ``snapshot_id`` niosło ``run.snapshot_hash`` — skrót pod kluczem „id".

Nazwy są tu poprawione u źródła, bez pól zastępczych: alias, którego nikt nie
czyta, byłby długiem udającym zgodność wsteczną. Konsumenci (typy i ekrany
ui2) są przestawieni w tej samej zmianie.

``project_name`` zostaje bez zmian — to FAKTYCZNIE nazwa projektu z nagłówka
migawki, jedyne pole tej koperty, którego nazwa zawsze była prawdziwa.
"""

from __future__ import annotations

from typing import Any

from enm.canonical_analysis import CanonicalRun


def zbuduj_kontekst_widoku(run: CanonicalRun, *, ze_znacznikiem_czasu: bool) -> dict[str, Any]:
    """Zbuduj sekcję ``context`` widoku analizy dla podanego przebiegu.

    Args:
        run: kanoniczny przebieg, z którego czytamy pochodzenie wyniku.
        ze_znacznikiem_czasu: czy dołożyć ``run_timestamp`` i ``project_name``.
            Widoki OZE (zdolność, obszar PQ, odpowiedź OSD, dobór kompensacji)
            historycznie oddają samą trójkę identyfikatorów; widoki jakości i
            estymacji oddają pełną kopertę. Różnica jest zachowana świadomie —
            poszerzenie odpowiedzi to osobna decyzja, nie efekt uboczny
            porządkowania nazw.

    Returns:
        Słownik z kluczami nazwanymi zgodnie z zawartością. Brak danej to
        ``None``, nigdy wartość zastępcza.
    """
    kontekst: dict[str, Any] = {
        "run_id": str(run.id),
        "snapshot_hash": run.snapshot_hash,
        "case_id": str(run.case_id) if run.case_id else None,
    }
    if not ze_znacznikiem_czasu:
        return kontekst

    header = (run.snapshot or {}).get("header") or {}
    return {
        "project_name": str(header.get("name")) if header.get("name") else None,
        # `case_name` zostaje w kopercie jako JAWNE „nazwa nieznana". Kanoniczny
        # przebieg niesie tylko `case_id`; wcześniej wpisywano tu ten identyfikator,
        # czyli nazwę FABRYKOWANO z identyfikatora. Pominięcie klucza byłoby drugim
        # błędem — kontrakt frontu deklaruje `case_name: string | null`, więc brak
        # klucza dałby `undefined` tam, gdzie typ obiecuje `null`.
        "case_name": None,
        "case_id": kontekst["case_id"],
        "run_timestamp": run.created_at.isoformat() if run.created_at else None,
        "snapshot_hash": kontekst["snapshot_hash"],
        "run_id": kontekst["run_id"],
    }
