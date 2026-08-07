"""
SC Symmetrical (3F) Proof Pack — pakiet dowodowy zwarcia trójfazowego (G-SCM F2).

STATUS: CANONICAL & BINDING
Rejestr: V12K-054 (G-SCM F2). Domyka lukę: zwarcie 3-fazowe (najczęstsze) nie miało
dotąd pakietu dowodowego, a generator ``ProofGenerator.generate_sc3f_proof`` (jedyne
miejsce z krokami maszynowymi μ/q/i_b, IEC 60909-0:2016 §6.6) był osierocony.

Wszystko liczy się po stronie serwera z kanonicznego snapshotu ENM (ZERO fizyki w
UI, WHITE BOX):
- ``zwarcie_3f_ze_snapshotu`` (warstwa wiązania) → graf + FROZEN wynik
  I″k / ip / I_th / S_k. Mapowanie ENM i wejście w solver stoją TAM, nie tutaj:
  pakiet dowodowy OPISUJE wynik, nie produkuje go (dług PACK-SC3F-WIAZANIE
  domknięty 2026-08-07; bliźniak `wynik_zwarcia_1f_ze_snapshotu` dla pakietu
  niesymetrycznego).
- ``compute_machine_contributions`` → rozbicie per-maszyna (μ, q, i_b) — dołączane do
  dowodu WYŁĄCZNIE gdy sieć zawiera maszyny wirujące (brak → dowód bez sekcji
  maszynowej, determinizm zachowany).

INVARIANTS:
- Solver nietknięty (mapowanie read-only z wyniku); FROZEN Result API nietknięte.
- Deterministyczny (ten sam snapshot + węzeł → identyczny dowód/fingerprint).
- LaTeX-only math (formuły w generatorze dowodu).
- I_dyn oraz I_th obowiązkowe w dowodzie SC3F.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from application.proof_engine.proof_generator import ProofGenerator, SC3FInput
from application.proof_engine.proof_pack import (
    ProofPackBuilder,
    ProofPackContext,
    deterministic_artifact_id,
    dokument_deterministyczny,
)
from application.proof_engine.types import ProofDocument
from application.solvers.short_circuit_binding import zwarcie_3f_ze_snapshotu
from network_model.solvers.machine_sc_iec60909 import compute_machine_contributions


@dataclass
class SC3FPackInput:
    """Dane wejściowe pakietu dowodowego SC3F.

    Fizyka liczona po stronie serwera z ``snapshot`` (ENM) — klient nie przekazuje
    wyników zwarciowych ani rozbicia maszynowego (ZERO fizyki w UI).
    """

    project_name: str
    case_name: str
    snapshot: dict[str, Any]
    fault_node_id: str
    run_timestamp: datetime
    solver_version: str
    c_factor: float = 1.10
    tk_s: float = 1.0


@dataclass(frozen=True)
class SC3FPackResult:
    """Wynik pakietu dowodowego SC3F."""

    proof_sc3f: ProofDocument
    has_machines: bool
    all_passed: bool

    def to_dict(self) -> dict[str, Any]:
        return {
            "proof_sc3f": self.proof_sc3f.to_dict(),
            "has_machines": self.has_machines,
            "all_passed": self.all_passed,
        }


class SC3FProofPack:
    """Generator pakietu dowodowego zwarcia trójfazowego (IEC 60909-0:2016)."""

    @classmethod
    def generate(
        cls,
        data: SC3FPackInput,
        artifact_id: UUID | None = None,
    ) -> SC3FPackResult:
        """Zbuduj dowód SC3F z kanonicznego snapshotu ENM (fizyka serwerowa)."""
        if artifact_id is None:
            artifact_id = uuid4()

        # FIZYKA NIE DZIEJE SIĘ TUTAJ (dług PACK-SC3F-WIAZANIE domknięty 2026-08-07).
        # Mapowanie snapshotu i wejście w solver stoją w warstwie wiązania; pakiet
        # dowodowy OPISUJE wynik, nie produkuje go (kanon: „Proof Engine reads results
        # READ-ONLY"). Graf wraca razem z wynikiem, bo rozbicie per-maszyna niżej musi
        # liczyć się na TYM SAMYM grafie — drugie mapowanie byłoby drugim źródłem prawdy.
        zwarcie = zwarcie_3f_ze_snapshotu(
            snapshot=data.snapshot,
            fault_node_id=data.fault_node_id,
            c_factor=data.c_factor,
            tk_s=data.tk_s,
        )
        result = zwarcie.wynik
        graph = zwarcie.graf

        # Rozbicie per-maszyna (μ/q/i_b, §6.6) z tego samego grafu; t_min = czas prądu
        # wyłączeniowego (tb_s), zgodnie z torem AnalysisRunService. Dołączane do dowodu
        # tylko gdy realnie są maszyny — inaczej dowód bez sekcji maszynowej (determinizm).
        machine_result = compute_machine_contributions(
            graph,
            result.fault_node_id,
            c_factor=result.c_factor,
            t_min_s=result.tb_s,
        )
        has_machines = bool(machine_result.contributions)

        sc3f_input = SC3FInput(
            project_name=data.project_name,
            case_name=data.case_name,
            fault_node_id=result.fault_node_id,
            fault_type=result.short_circuit_type.value,
            run_timestamp=data.run_timestamp,
            solver_version=data.solver_version,
            c_factor=result.c_factor,
            u_n_kv=result.un_v / 1000.0,
            z_thevenin_ohm=result.zkk_ohm,
            ikss_ka=result.ikss_a / 1000.0,
            ip_ka=result.ip_a / 1000.0,
            ith_ka=result.ith_a / 1000.0,
            sk_mva=result.sk_mva,
            kappa=result.kappa,
            rx_ratio=result.rx_ratio,
            tk_s=result.tk_s,
            # Audyt fizyki fala G (2026-07): m_factor/n_factor FAKTYCZNIE uzyte
            # przez solver do ith_a = ikss*sqrt(m+n) (IEC 60909-0 SS4.7/SS12) —
            # niesione z wyniku solvera, zeby wywod White Box (krok Ith,
            # EQ_SC3F_008) podstawial LICZBY SPOJNE z wyswietlanym ith_ka.
            # Honest fallback (1,0; 0,0) tylko dla starszych wynikow solvera
            # sprzed delty (m_factor=None) — bez zmyslania.
            m_factor=result.m_factor if result.m_factor is not None else 1.0,
            n_factor=result.n_factor if result.n_factor is not None else 0.0,
            machine_result=machine_result if has_machines else None,
            # Karta S-C (2026-07-22): kroki I_b(t_b) i I²t w dowodzie — wartości
            # z FROZEN wyniku solvera (ib_a/tb_s), zero fizyki w proof engine.
            ib_ka=result.ib_a / 1000.0,
            tb_s=result.tb_s,
        )
        proof = ProofGenerator.generate_sc3f_proof(sc3f_input, artifact_id)
        return SC3FPackResult(
            proof_sc3f=proof,
            has_machines=has_machines,
            all_passed=proof.summary.unit_check_passed,
        )

    @classmethod
    def generate_zip(
        cls,
        data: SC3FPackInput,
        context: ProofPackContext,
        artifact_id: UUID | None = None,
    ) -> bytes:
        """Zbuduj ZIP pakietu dowodowego SC3F.

        Bez jawnego ``artifact_id`` identyfikator artefaktu wyprowadzamy z tożsamości
        pakietu (``deterministic_artifact_id``) — inaczej dwa pobrania tego samego
        przebiegu różniłyby się bajtami, wbrew deklaracji ``manifest.json``.
        """
        result = cls.generate(data, artifact_id or deterministic_artifact_id(context))
        return ProofPackBuilder(context).build(
            dokument_deterministyczny(result.proof_sc3f, context, data.run_timestamp)
        )

    @classmethod
    def validate_completeness(cls, result: SC3FPackResult) -> list[str]:
        """Weryfikuje obecność OBOWIĄZKOWYCH wyników SC3F (§4.1 + karta S-C).

        Pakiet liczy z FROZEN wyniku solvera, który zawsze niesie ib_a/tb_s —
        pełny bilans (I_b, I²t) jest więc obowiązkowy w dowodzie pakietu.
        """
        required_keys = {"ikss_ka", "ip_ka", "ith_ka", "idyn_ka", "ib_ka", "i2t_ka2s"}
        key_results = result.proof_sc3f.summary.key_results
        return [key for key in sorted(required_keys) if key not in key_results]
