"""Harness parytetu ASSEMBLERA (karta CV-4.1, konstytucja C.2.3).

Po co: karta CV-4.1 wycina z ``enm/canonical_analysis.py`` składanie wejścia
solvera rozpływu i zwarcia do osobnego modułu ``enm/assembler.py`` (jeden
assembler ES → IR → kontrakt). Refaktor jest dozwolony WYŁĄCZNIE, gdy wynik
każdego biegu kanonicznego jest bit w bit ten sam co przed wycięciem — a to
da się udowodnić tylko wtedy, gdy hashe wyników zebrano na stanie SPRZED
zmiany. Ten harness liczy PF i zwarcia (3F max/min, 1F, 2F, 2FG) dla KAŻDEJ
sieci ENM rejestru (``tests/golden/registry.py``) torem kanonicznym
(``_execute_power_flow`` / ``_execute_short_circuit`` na ``CanonicalRun`` w
pamięci) i hashuje ``raw_result`` tą samą funkcją, co harness parytetu
scenariuszy (``hash_widoku``: kwantyzacja kontraktu liczb, klucze lotne
wykluczone). Odmowa (wyjątek) TEŻ jest wynikiem i też jest pinowana —
parytet odmowy jest częścią parytetu.

Decyzje:
- sieci z rejestru budowane ``registry.zbuduj_wszystkie`` (tylko ``PostacSieci.ENM``;
  dialekt benchmarków B-BENCH nie idzie torem kanonicznym — do zwinięcia w CV-4.3);
- bieg w pamięci: stały ``id``/``case_id``/``snapshot_hash``/``created_at`` (proof_ref
  liczony z tych pól jest wtedy stały), zero magazynu, zero DB (opcje audit2 puste);
- klucz: ``<id rejestru>/<nr>:<nazwa nagłówka ENM>/<analiza>``.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from enm.canonical_analysis import CanonicalRun, _execute_power_flow, _execute_short_circuit
from enm.models import EnergyNetworkModel

from tests.golden import registry
from tests.golden.parytet_scenariuszy.harness import hash_widoku
from tests.golden.registry import REJESTR, PostacSieci

_ID_BIEGU = UUID("00000000-0000-4000-8000-0000000000c4")  # CV-4, stały dla CAŁEGO harnessu
_CZAS_BIEGU = datetime(2026, 1, 1, tzinfo=UTC)

#: Warianty zwarcia pinowane per sieć: (klucz, opcje biegu).
WARIANTY_ZWARC: tuple[tuple[str, dict[str, Any]], ...] = (
    ("SC_3F_max", {"fault_type": "3F", "scenario": "max", "thermal_time_seconds": 1.0}),
    ("SC_3F_min", {"fault_type": "3F", "scenario": "min", "thermal_time_seconds": 1.0}),
    ("SC_1F_max", {"fault_type": "1F", "scenario": "max", "thermal_time_seconds": 1.0}),
    ("SC_2F_max", {"fault_type": "2F", "scenario": "max", "thermal_time_seconds": 1.0}),
    ("SC_2FG_max", {"fault_type": "2FG", "scenario": "max", "thermal_time_seconds": 1.0}),
)


def _jako_enm(siec: object) -> EnergyNetworkModel:
    return siec if isinstance(siec, EnergyNetworkModel) else EnergyNetworkModel.model_validate(siec)


def sieci_enm_rejestru() -> list[tuple[str, EnergyNetworkModel]]:
    """Wszystkie sieci ENM rejestru w deterministycznej kolejności (rejestr → indeks)."""
    wynik: list[tuple[str, EnergyNetworkModel]] = []
    for wpis in REJESTR:
        if not wpis.budowniczowie or wpis.postac is not PostacSieci.ENM:
            continue
        for indeks, siec in enumerate(registry.zbuduj_wszystkie(wpis.id)):
            enm = _jako_enm(siec)
            nazwa = str(enm.header.name or "").strip() or "bez_nazwy"
            wynik.append((f"{wpis.id}/{indeks:02d}:{nazwa}", enm))
    return wynik


def _bieg(
    enm: EnergyNetworkModel, *, klucz: str, analysis_type: str, options: dict[str, Any]
) -> CanonicalRun:
    return CanonicalRun(
        id=_ID_BIEGU,
        case_id=f"parytet-cv4-{klucz}",
        project_id="parytet-cv4",
        analysis_type=analysis_type,
        status="FINISHED",
        created_at=_CZAS_BIEGU,
        snapshot_hash=f"snap-{klucz}",
        input_hash=f"in-{klucz}",
        snapshot=enm.model_dump(mode="json"),
        validation={},
        readiness={},
        options=dict(options),
    )


def _wynik_lub_odmowa(wykonaj: Any, run: CanonicalRun) -> dict[str, Any]:
    try:
        wykonaj(run)
    except Exception as exc:  # noqa: BLE001 — odmowa jest wynikiem pinowanym
        return {"sha256": None, "odmowa": f"{type(exc).__name__}: {exc}"}
    return {"sha256": hash_widoku(run.raw_result), "odmowa": None}


def zbierz_hashe(
    sieci: list[tuple[str, EnergyNetworkModel]] | None = None
) -> dict[str, dict[str, Any]]:
    """Hashe PF + wariantów zwarć dla każdej sieci ENM rejestru (deterministyczne)."""
    wyniki: dict[str, dict[str, Any]] = {}
    for klucz_sieci, enm in sieci if sieci is not None else sieci_enm_rejestru():
        klucz_pf = f"{klucz_sieci}/PF"
        wyniki[klucz_pf] = _wynik_lub_odmowa(
            _execute_power_flow, _bieg(enm, klucz=klucz_pf, analysis_type="PF", options={})
        )
        for nazwa, opcje in WARIANTY_ZWARC:
            klucz = f"{klucz_sieci}/{nazwa}"
            wyniki[klucz] = _wynik_lub_odmowa(
                _execute_short_circuit,
                _bieg(enm, klucz=klucz, analysis_type="short_circuit_sn", options=opcje),
            )
    return wyniki
