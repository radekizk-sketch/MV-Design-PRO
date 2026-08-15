"""
EligibilityService — PR-17: Analysis Eligibility Matrix

Application-layer service computing the eligibility matrix for all analysis types.
Determines whether each analysis (SC_3F, SC_2F, SC_1F, LOAD_FLOW) can be executed
given the current ENM state and readiness.

INVARIANTS:
- Zero heuristics: only rules based on ENM structure + catalog presence + readiness
- Never calls solvers
- Never mutates ENM
- Deterministic: identical ENM + readiness -> identical matrix + content_hash
- Reuses FixAction from PR-13

ARCHITECTURE:
- Lives in APPLICATION layer
- Consumes domain models (ENM, ReadinessResult, eligibility_models)
- No physics calculations
"""

from __future__ import annotations

from domain.eligibility_models import (
    AnalysisEligibilityIssue,
    AnalysisEligibilityMatrix,
    AnalysisEligibilityResult,
    AnalysisType,
    IssueSeverity,
    build_eligibility_matrix,
    build_eligibility_result,
)
from enm.fix_actions import FixAction
from enm.models import (
    Cable,
    EnergyNetworkModel,
    OverheadLine,
)
from enm.validator import ReadinessResult


class EligibilityService:
    """Computes the Analysis Eligibility Matrix.

    Rules:
    A. Global gate: readiness.ready == false -> all INELIGIBLE
    B. SC_3F: source + buses + catalog_ref + impedance
    C. SC_1F: SC_3F prereqs + Z0 on branches/sources
    D. SC_2F: SC_3F prereqs + Z2 data
    E. LOAD_FLOW: source + buses + catalog_ref + loads/generators
    """

    def compute_matrix(
        self,
        *,
        enm: EnergyNetworkModel,
        readiness: ReadinessResult,
        case_id: str,
    ) -> AnalysisEligibilityMatrix:
        """Compute full eligibility matrix for all analysis types.

        Args:
            enm: Current EnergyNetworkModel
            readiness: Readiness check result from ENMValidator
            case_id: Study case identifier

        Returns:
            AnalysisEligibilityMatrix with deterministic content_hash
        """
        results = [
            self._compute_sc_3f(enm, readiness),
            self._compute_sc_2f(enm, readiness),
            self._compute_sc_1f(enm, readiness),
            self._compute_load_flow(enm, readiness),
        ]

        return build_eligibility_matrix(
            case_id=case_id,
            enm_revision=enm.header.revision,
            results=results,
        )

    # ------------------------------------------------------------------
    # Gate A: Global readiness check
    # ------------------------------------------------------------------

    @staticmethod
    def _readiness_blocker() -> AnalysisEligibilityIssue:
        """ELIG_NOT_READY: model not ready for any analysis."""
        return AnalysisEligibilityIssue(
            code="ELIG_NOT_READY",
            severity=IssueSeverity.BLOCKER,
            message_pl=(
                "Model sieci nie jest gotowy do obliczeń. "
                "Rozwiąż blokady w panelu gotowości inżynieryjnej."
            ),
        )

    # ------------------------------------------------------------------
    # Gate B: SC_3F
    # ------------------------------------------------------------------

    def _compute_sc_3f(
        self,
        enm: EnergyNetworkModel,
        readiness: ReadinessResult,
    ) -> AnalysisEligibilityResult:
        blockers: list[AnalysisEligibilityIssue] = []
        warnings: list[AnalysisEligibilityIssue] = []

        # A: Global gate
        if not readiness.ready:
            blockers.append(self._readiness_blocker())

        # B1: Source required
        self._check_source_present(enm, blockers)

        # B2: Buses required
        self._check_buses_present(enm, blockers)

        # B3: catalog_ref on branches and transformers
        self._check_catalog_refs(enm, blockers)

        # B4: impedance from catalog (branches must have non-zero impedance)
        self._check_branch_impedance(enm, blockers)

        # B5: transformer uk_percent
        self._check_transformer_uk(enm, blockers)

        # B6: source short-circuit params
        self._check_source_sc_params(enm, blockers)

        return build_eligibility_result(
            analysis_type=AnalysisType.SC_3F,
            blockers=blockers,
            warnings=warnings,
        )

    # ------------------------------------------------------------------
    # Gate C: SC_1F
    # ------------------------------------------------------------------

    def _compute_sc_1f(
        self,
        enm: EnergyNetworkModel,
        readiness: ReadinessResult,
    ) -> AnalysisEligibilityResult:
        blockers: list[AnalysisEligibilityIssue] = []
        warnings: list[AnalysisEligibilityIssue] = []
        info: list[AnalysisEligibilityIssue] = []

        # A: Global gate
        if not readiness.ready:
            blockers.append(self._readiness_blocker())

        # SC_3F prerequisites (reuse checks)
        self._check_source_present(enm, blockers)
        self._check_buses_present(enm, blockers)
        self._check_catalog_refs(enm, blockers)
        self._check_branch_impedance(enm, blockers)
        self._check_transformer_uk(enm, blockers)
        self._check_source_sc_params(enm, blockers)

        # C1: Z0 on branches
        self._check_branch_z0(enm, blockers)

        # C2: Z0 on sources
        self._check_source_z0(enm, blockers)

        # C3: Earthing/grounding model availability
        self._check_earthing_model(enm, blockers)

        return build_eligibility_result(
            analysis_type=AnalysisType.SC_1F,
            blockers=blockers,
            warnings=warnings,
            info=info,
        )

    # ------------------------------------------------------------------
    # Gate D: SC_2F
    # ------------------------------------------------------------------

    def _compute_sc_2f(
        self,
        enm: EnergyNetworkModel,
        readiness: ReadinessResult,
    ) -> AnalysisEligibilityResult:
        blockers: list[AnalysisEligibilityIssue] = []
        warnings: list[AnalysisEligibilityIssue] = []

        # A: Global gate
        if not readiness.ready:
            blockers.append(self._readiness_blocker())

        # SC_3F prerequisites
        self._check_source_present(enm, blockers)
        self._check_buses_present(enm, blockers)
        self._check_catalog_refs(enm, blockers)
        self._check_branch_impedance(enm, blockers)
        self._check_transformer_uk(enm, blockers)
        self._check_source_sc_params(enm, blockers)

        # D1: Z2 (negative sequence) data on branches
        # Per IEC 60909, for overhead lines Z2 = Z1 is standard, but we
        # require explicit data — no heuristics (Z2 != Z1 assumption).
        # Currently the ENM branch model does not have explicit Z2 fields,
        # so we emit CONTRACT_NOT_READY for all branches.
        self._check_branch_z2(enm, blockers)

        # D2: Z2 on sources
        self._check_source_z2(enm, blockers)

        return build_eligibility_result(
            analysis_type=AnalysisType.SC_2F,
            blockers=blockers,
            warnings=warnings,
        )

    # ------------------------------------------------------------------
    # Gate E: LOAD_FLOW
    # ------------------------------------------------------------------

    def _compute_load_flow(
        self,
        enm: EnergyNetworkModel,
        readiness: ReadinessResult,
    ) -> AnalysisEligibilityResult:
        blockers: list[AnalysisEligibilityIssue] = []
        warnings: list[AnalysisEligibilityIssue] = []

        # A: Global gate
        if not readiness.ready:
            blockers.append(self._readiness_blocker())

        # E1: Source required
        self._check_source_present(enm, blockers)

        # E2: Buses required
        self._check_buses_present(enm, blockers)

        # E3: catalog_ref
        self._check_catalog_refs(enm, blockers)

        # E4: Branch impedance (needed for load flow too)
        self._check_branch_impedance(enm, blockers)

        # E5: Transformer uk_percent
        self._check_transformer_uk(enm, blockers)

        # E6: Loads or generators must exist for meaningful load flow
        if not enm.loads and not enm.generators:
            blockers.append(
                AnalysisEligibilityIssue(
                    code="ELIG_LF_NO_LOADS_OR_GENERATORS",
                    severity=IssueSeverity.BLOCKER,
                    message_pl=(
                        "Brak odbiorów i generatorów w modelu. "
                        "Rozpływ mocy wymaga co najmniej jednego odbioru lub generatora."
                    ),
                    fix_action=FixAction(
                        action_type="ADD_MISSING_DEVICE",
                        modal_type="LoadModal",
                        payload_hint={"required": "load_or_generator"},
                    ),
                )
            )

        # E7: Bus voltage > 0 (already validated but explicit for eligibility)
        for bus in enm.buses:
            if bus.voltage_kv <= 0:
                blockers.append(
                    AnalysisEligibilityIssue(
                        code="ELIG_LF_BUS_NO_VOLTAGE",
                        severity=IssueSeverity.BLOCKER,
                        message_pl=(
                            f"Szyna '{bus.ref_id}' nie ma napięcia znamionowego "
                            f"(voltage_kv <= 0). Rozpływ mocy wymaga napięć na wszystkich szynach."
                        ),
                        element_ref=bus.ref_id,
                        element_type="bus",
                        fix_action=FixAction(
                            action_type="OPEN_MODAL",
                            element_ref=bus.ref_id,
                            modal_type="NodeModal",
                            payload_hint={"required": "voltage_kv"},
                        ),
                    )
                )

        return build_eligibility_result(
            analysis_type=AnalysisType.LOAD_FLOW,
            blockers=blockers,
            warnings=warnings,
        )

    # ==================================================================
    # Shared check methods
    # ==================================================================

    @staticmethod
    def _check_source_present(
        enm: EnergyNetworkModel,
        blockers: list[AnalysisEligibilityIssue],
    ) -> None:
        if not enm.sources:
            blockers.append(
                AnalysisEligibilityIssue(
                    code="ELIG_SC3_MISSING_SOURCE",
                    severity=IssueSeverity.BLOCKER,
                    message_pl=(
                        "Brak źródła zasilania w modelu sieci. "
                        "Dodaj źródło (sieć zewnętrzna lub generator)."
                    ),
                    fix_action=FixAction(
                        action_type="ADD_MISSING_DEVICE",
                        modal_type="SourceModal",
                        payload_hint={"required": "source"},
                    ),
                )
            )

    @staticmethod
    def _check_buses_present(
        enm: EnergyNetworkModel,
        blockers: list[AnalysisEligibilityIssue],
    ) -> None:
        if not enm.buses:
            blockers.append(
                AnalysisEligibilityIssue(
                    code="ELIG_SC3_MISSING_BUSES",
                    severity=IssueSeverity.BLOCKER,
                    message_pl=(
                        "Brak szyn (węzłów) w modelu sieci. " "Dodaj co najmniej jedną szynę."
                    ),
                    fix_action=FixAction(
                        action_type="ADD_MISSING_DEVICE",
                        modal_type="NodeModal",
                        payload_hint={"required": "bus"},
                    ),
                )
            )

    @staticmethod
    def _check_catalog_refs(
        enm: EnergyNetworkModel,
        blockers: list[AnalysisEligibilityIssue],
    ) -> None:
        for branch in enm.branches:
            if isinstance(branch, OverheadLine | Cable) and not branch.catalog_ref:
                blockers.append(
                    AnalysisEligibilityIssue(
                        code="ELIG_SC3_MISSING_CATALOG_REF",
                        severity=IssueSeverity.BLOCKER,
                        message_pl=(
                            f"Gałąź '{branch.ref_id}' nie ma referencji katalogowej (catalog_ref). "
                            f"Przypisz element z katalogu."
                        ),
                        element_ref=branch.ref_id,
                        element_type="branch",
                        fix_action=FixAction(
                            action_type="SELECT_CATALOG",
                            element_ref=branch.ref_id,
                            modal_type="BranchModal",
                            payload_hint={"required": "catalog_ref"},
                        ),
                    )
                )

        for trafo in enm.transformers:
            if not trafo.catalog_ref:
                blockers.append(
                    AnalysisEligibilityIssue(
                        code="ELIG_SC3_MISSING_CATALOG_REF",
                        severity=IssueSeverity.BLOCKER,
                        message_pl=(
                            f"Transformator '{trafo.ref_id}' nie ma referencji katalogowej (catalog_ref). "
                            f"Przypisz transformator z katalogu."
                        ),
                        element_ref=trafo.ref_id,
                        element_type="transformer",
                        fix_action=FixAction(
                            action_type="SELECT_CATALOG",
                            element_ref=trafo.ref_id,
                            modal_type="TransformerModal",
                            payload_hint={"required": "catalog_ref"},
                        ),
                    )
                )

    @staticmethod
    def _check_branch_impedance(
        enm: EnergyNetworkModel,
        blockers: list[AnalysisEligibilityIssue],
    ) -> None:
        for branch in enm.branches:
            if isinstance(branch, OverheadLine | Cable):
                if branch.r_ohm_per_km == 0 and branch.x_ohm_per_km == 0:
                    blockers.append(
                        AnalysisEligibilityIssue(
                            code="ELIG_SC3_MISSING_IMPEDANCE",
                            severity=IssueSeverity.BLOCKER,
                            message_pl=(
                                f"Gałąź '{branch.ref_id}' ma zerową impedancję "
                                f"(R=0, X=0 Ω/km). Wprowadź parametry impedancji."
                            ),
                            element_ref=branch.ref_id,
                            element_type="branch",
                            fix_action=FixAction(
                                action_type="OPEN_MODAL",
                                element_ref=branch.ref_id,
                                modal_type="BranchModal",
                                payload_hint={"required": "impedance"},
                            ),
                        )
                    )

    @staticmethod
    def _check_transformer_uk(
        enm: EnergyNetworkModel,
        blockers: list[AnalysisEligibilityIssue],
    ) -> None:
        for trafo in enm.transformers:
            if trafo.uk_percent <= 0:
                blockers.append(
                    AnalysisEligibilityIssue(
                        code="ELIG_SC3_MISSING_IMPEDANCE",
                        severity=IssueSeverity.BLOCKER,
                        message_pl=(
                            f"Transformator '{trafo.ref_id}' nie ma napięcia zwarcia "
                            f"(uk% <= 0). Wprowadź uk%."
                        ),
                        element_ref=trafo.ref_id,
                        element_type="transformer",
                        fix_action=FixAction(
                            action_type="OPEN_MODAL",
                            element_ref=trafo.ref_id,
                            modal_type="TransformerModal",
                            payload_hint={"required": "uk_percent"},
                        ),
                    )
                )

    @staticmethod
    def _check_source_sc_params(
        enm: EnergyNetworkModel,
        blockers: list[AnalysisEligibilityIssue],
    ) -> None:
        for source in enm.sources:
            has_sk = source.sk3_mva is not None and source.sk3_mva > 0
            has_rx = (
                source.r_ohm is not None
                and source.x_ohm is not None
                and (source.r_ohm > 0 or source.x_ohm > 0)
            )
            has_ik = source.ik3_ka is not None and source.ik3_ka > 0
            if not (has_sk or has_rx or has_ik):
                blockers.append(
                    AnalysisEligibilityIssue(
                        code="ELIG_SC3_SOURCE_NO_SC_PARAMS",
                        severity=IssueSeverity.BLOCKER,
                        message_pl=(
                            f"Źródło '{source.ref_id}' nie ma parametrów zwarciowych "
                            f"(brak Sk'', Ik'' lub R/X). Wprowadź dane."
                        ),
                        element_ref=source.ref_id,
                        element_type="source",
                        fix_action=FixAction(
                            action_type="OPEN_MODAL",
                            element_ref=source.ref_id,
                            modal_type="SourceModal",
                            payload_hint={"required": "short_circuit_params"},
                        ),
                    )
                )

    # ------------------------------------------------------------------
    # SC_1F specific checks
    # ------------------------------------------------------------------

    @staticmethod
    def _check_branch_z0(
        enm: EnergyNetworkModel,
        blockers: list[AnalysisEligibilityIssue],
    ) -> None:
        for branch in enm.branches:
            if isinstance(branch, OverheadLine | Cable):
                if branch.r0_ohm_per_km is None and branch.x0_ohm_per_km is None:
                    blockers.append(
                        AnalysisEligibilityIssue(
                            code="ELIG_SC1_MISSING_Z0",
                            severity=IssueSeverity.BLOCKER,
                            message_pl=(
                                f"Gałąź '{branch.ref_id}' nie ma danych składowej zerowej (Z₀). "
                                f"Zwarcie jednofazowe wymaga R₀/X₀."
                            ),
                            element_ref=branch.ref_id,
                            element_type="branch",
                            fix_action=FixAction(
                                action_type="OPEN_MODAL",
                                element_ref=branch.ref_id,
                                modal_type="BranchModal",
                                payload_hint={"required": "zero_sequence"},
                            ),
                        )
                    )

    @staticmethod
    def _check_source_z0(
        enm: EnergyNetworkModel,
        blockers: list[AnalysisEligibilityIssue],
    ) -> None:
        for source in enm.sources:
            has_z0 = (
                source.r0_ohm is not None and source.x0_ohm is not None
            ) or source.z0_z1_ratio is not None
            if not has_z0:
                blockers.append(
                    AnalysisEligibilityIssue(
                        code="ELIG_SC1_MISSING_Z0",
                        severity=IssueSeverity.BLOCKER,
                        message_pl=(
                            f"Źródło '{source.ref_id}' nie ma danych składowej zerowej (Z₀). "
                            f"Zwarcie jednofazowe wymaga R₀/X₀ lub stosunku Z₀/Z₁."
                        ),
                        element_ref=source.ref_id,
                        element_type="source",
                        fix_action=FixAction(
                            action_type="OPEN_MODAL",
                            element_ref=source.ref_id,
                            modal_type="SourceModal",
                            payload_hint={"required": "zero_sequence"},
                        ),
                    )
                )

    @staticmethod
    def _check_earthing_model(
        enm: EnergyNetworkModel,
        blockers: list[AnalysisEligibilityIssue],
    ) -> None:
        """Sprawdza dostępność modelu uziemienia punktu neutralnego dla SC_1F.

        DLACZEGO BLOKADA, A NIE INFORMACJA (V12K-219). Prąd zwarcia jednofazowego
        wg IEC 60909 wynosi ``I″k1 = √3·c·Un / |Z1 + Z2 + Z0|`` — a ``Z0`` sieci
        SN jest ZDOMINOWANA przez sposób pracy punktu neutralnego:

        * sieć **izolowana** — ``Z0`` pojemnościowa, prąd doziemny to prąd
          pojemnościowy ``I_C = 3·ω·C0·U_f`` (rząd dziesiątek amperów),
        * sieć **kompensowana** (dławik Petersena) — ``L_p`` równolegle z ``C0``,
          w rezonansie zostaje prąd resztkowy (rząd pojedynczych amperów),
        * uziemienie przez **rezystor** — prąd ograniczony konstrukcyjnie
          (rząd setek amperów),
        * uziemienie **bezpośrednie** — prąd porównywalny z trójfazowym (kA).

        Rozpiętość między siecią kompensowaną a bezpośrednio uziemioną sięga
        TRZECH RZĘDÓW WIELKOŚCI, więc bez tej danej wynik nie jest „przybliżony",
        tylko dowolny. Od niego zależą dalej: czułość i dobór zabezpieczeń
        ziemnozwarciowych (51N/67N), napięcia dotykowe na uziomach stacji
        (PN-EN 50522) i wymagana rezystancja uziomu.

        HISTORIA POPRAWKI: kod powstał jako INFO, gdy komunikat mówił „funkcja
        w przygotowaniu" (audyt 2026-05-28). Po przeformułowaniu na „brak danych"
        severity została INFO przez przeoczenie, mimo że docstring od początku
        zapowiadał blokadę. Stan sprzed poprawki dopuszczał uruchomienie SC_1F
        bez podstawy fizycznej — to fabrykacja wyniku, nie ułatwienie.

        Model uziemienia uznajemy za obecny, gdy niesie go SZYNA (``bus.grounding``)
        ALBO punkt neutralny transformatora (``hv_neutral``/``lv_neutral``) — w
        praktyce krajowej punkt neutralny sieci SN uziemia się właśnie po stronie
        dolnej transformatora GPZ, więc obie drogi są równoprawne.
        """
        has_grounding = any(bus.grounding is not None for bus in enm.buses)
        has_trafo_neutral = any(
            trafo.hv_neutral is not None or trafo.lv_neutral is not None
            for trafo in enm.transformers
        )

        if not has_grounding and not has_trafo_neutral and enm.buses:
            blockers.append(
                AnalysisEligibilityIssue(
                    code="ELIG_SC1_EARTHING_MODEL_INCOMPLETE",
                    severity=IssueSeverity.BLOCKER,
                    message_pl=(
                        "Dane niekompletne: brak modelu uziemienia. "
                        "Zwarcie jednofazowe wymaga sposobu uziemienia punktu "
                        "neutralnego — uzupełnij uziemienie szyny lub punkt "
                        "neutralny transformatora, aby uruchomić obliczenie."
                    ),
                    fix_action=FixAction(
                        action_type="OPEN_MODAL",
                        modal_type="NodeModal",
                        payload_hint={"required": "grounding"},
                    ),
                )
            )

    # ------------------------------------------------------------------
    # SC_2F specific checks
    # ------------------------------------------------------------------

    @staticmethod
    def _check_branch_z2(
        enm: EnergyNetworkModel,
        blockers: list[AnalysisEligibilityIssue],
    ) -> None:
        """Check Z2 (negative sequence) data availability on branches.

        The ENM branch model does not yet have explicit Z2 fields.
        Per the spec: no heuristics (do NOT assume Z2=Z1).
        Emit CONTRACT_NOT_READY if any line/cable branches exist.
        """
        has_line_branches = any(isinstance(branch, OverheadLine | Cable) for branch in enm.branches)
        if has_line_branches:
            blockers.append(
                AnalysisEligibilityIssue(
                    code="ELIG_SC2_CONTRACT_NOT_READY",
                    severity=IssueSeverity.BLOCKER,
                    message_pl=(
                        "Kontrakt solver-input nie zawiera pól składowej ujemnej (Z₂) "
                        "dla gałęzi. Zwarcie dwufazowe wymaga rozszerzenia kontraktu danych. "
                        "Zostanie udostępnione w przyszłej aktualizacji."
                    ),
                )
            )

    @staticmethod
    def _check_source_z2(
        enm: EnergyNetworkModel,
        blockers: list[AnalysisEligibilityIssue],
    ) -> None:
        """Check Z2 data on sources.

        Sources also lack explicit Z2 fields in current model.
        """
        if enm.sources:
            blockers.append(
                AnalysisEligibilityIssue(
                    code="ELIG_SC2_MISSING_Z2",
                    severity=IssueSeverity.BLOCKER,
                    message_pl=(
                        "Źródła nie posiadają danych składowej ujemnej (Z₂). "
                        "Zwarcie dwufazowe wymaga parametrów Z₂ dla źródeł."
                    ),
                )
            )
