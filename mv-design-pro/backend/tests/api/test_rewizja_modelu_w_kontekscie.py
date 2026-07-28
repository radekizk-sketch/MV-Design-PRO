"""LICZBOWA rewizja modelu w kontekscie biegu (V12K-264).

DEFEKT, KTORY TO ODBLOKOWUJE. Kontrakt wynikow niosl wylacznie `snapshot_ref`
(hash) i `result_status` (enum FRESH/OUTDATED). Zaden ekran analizy nie mial wiec
LICZBY do porownania z `header.revision` biezacego modelu, przez co wspolny
`FreshnessBadge` byl POMIJANY — mowia o tym wprost komentarze w
`zwarciaModel.ts` („kontrakt wynikow zwarciowych nie niesie LICZBOWEJ rewizji…
badge pominiety") i `rozplywAdapter.ts` („mapowanie enum→liczba byloby
zgadywaniem"). Znacznik swiezosci istnial w kodzie i nie pokazywal sie nigdy.

Pole jest ADDYTYWNE i brane WPROST z naglowka snapshotu biegu — zero wyliczen,
zero mapowan. Bieg bez rewizji w snapshotcie dostaje `None`, bo brak danej nie
moze stac sie liczba.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from api.analysis_case_context import build_analysis_case_context
from enm.canonical_analysis import CanonicalRun


def _bieg(snapshot: object) -> CanonicalRun:
    """REALNY `CanonicalRun` — nie atrapa.

    Wlasny obiekt-podstawka rozjezdzal sie z kontraktem przy kazdym nowym polu,
    ktore czyta builder kontekstu (`power_flow_trace`, `result_status`, …). Atrapa
    o innym ksztalcie niz produkcja testuje wlasny ksztalt, nie produkt — dlatego
    budujemy prawdziwy rekord biegu.
    """
    return CanonicalRun(
        id=uuid4(),
        case_id="case-1",
        project_id="proj-1",
        analysis_type="short_circuit_sn",
        status="FINISHED",
        created_at=datetime.now(UTC),
        snapshot_hash="sha256:abc",
        input_hash="input-hash",
        snapshot=snapshot,
        validation={},
        readiness={},
    )


def test_kontekst_niesie_LICZBOWA_rewizje_modelu():
    kontekst = build_analysis_case_context(_bieg({"header": {"revision": 7}}))
    assert kontekst["rewizja_modelu"] == 7
    # Hash zostaje — pole jest DODANE, nie zamienione (kontrakt addytywny).
    assert kontekst["snapshot_ref"] == "sha256:abc"


def test_bieg_bez_rewizji_daje_None_a_nie_zero():
    # Zero byloby liczba i wygladalo jak rewizja poczatkowa — brak danej musi
    # zostac brakiem, zeby konsument pominal znacznik zamiast klamac.
    assert build_analysis_case_context(_bieg({"header": {}}))["rewizja_modelu"] is None
    assert build_analysis_case_context(_bieg(None))["rewizja_modelu"] is None
    assert build_analysis_case_context(_bieg({}))["rewizja_modelu"] is None


def test_rewizja_nieliczbowa_jest_odrzucona():
    # Snapshot ze zdegenerowanym naglowkiem nie moze przepchnac napisu jako rewizji.
    assert (
        build_analysis_case_context(_bieg({"header": {"revision": "siedem"}}))["rewizja_modelu"]
        is None
    )
