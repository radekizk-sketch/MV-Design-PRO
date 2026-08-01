"""
Proof Inspector — P11.1d Read-Only Viewer

STATUS: CANONICAL & BINDING
Reference: P11_1d_PROOF_UI_EXPORT.md

Warstwa przegladu, audytu i eksportu dowodow P11.
Read-only: brak mutacji, brak logiki decyzyjnej.
Inspector NIE generuje dowodow — tylko je prezentuje.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from application.proof_engine.proof_inspector.types import (
    CounterfactualRow,
    CounterfactualView,
    HeaderView,
    InspectorView,
    ProtectionComparisonRow,
    ProtectionComparisonView,
    StepView,
    SummaryView,
    UnitCheckView,
    ValueView,
)

if TYPE_CHECKING:
    from application.proof_engine.types import (
        ProofDocument,
        ProofStep,
        ProofValue,
    )

from application.proof_engine.types import SEMANTIC_ALIASES, ProofType

# =============================================================================
# Completeness Requirements — P11.1e
# =============================================================================

# Required key_results keys for each proof type (structural completeness)
COMPLETENESS_REQUIREMENTS: dict[str, tuple[str, ...]] = {
    ProofType.SC3F_IEC60909.value: (
        "ikss_ka",
        "ip_ka",
        "ith_ka",
        "sk_mva",
        # idyn_ka is optional: if absent, ip_ka acts as proxy (BINDING: I_dyn = i_p)
    ),
    ProofType.VDROP.value: (
        "delta_u_total_percent",
        "u_kv",
    ),
    ProofType.EQUIPMENT_PROOF.value: (
        "u_m_ok",
        "icu_ok",
        "idyn_ok",
        "ith_ok",
        "overall_ok",
    ),
    ProofType.PROTECTION_OVERCURRENT.value: (
        "breaking_ok",
        "dynamic_ok",
        "thermal_ok",
        "selectivity_ok",
    ),
    ProofType.EARTHING_GROUND_FAULT_SN.value: (
        "i_earth_a",
        "earthing_mode",
        "computed_status",
    ),
}


class ProofInspector:
    """
    Inspector dowodow matematycznych (read-only).

    Wejscie: ProofDocument
    Wyjscie: InspectorView (strukturalny widok)

    Funkcje:
    - Lista krokow dowodu (kolejnosc deterministyczna)
    - Podglad: wzor -> dane -> podstawienie -> wynik -> jednostki
    - Widoczny mapping_key dla kazdej wielkosci
    - Tryb A/B (jesli ProofDocument counterfactual)

    INVARIANT: Brak mutacji ProofDocument.
    """

    def __init__(self, document: ProofDocument) -> None:
        """
        Inicjalizuje Inspector dla danego ProofDocument.

        Args:
            document: ProofDocument do inspekcji (frozen, immutable)
        """
        self._document = document
        self._view: InspectorView | None = None

    @property
    def document(self) -> ProofDocument:
        """Zwraca oryginalny dokument (read-only)."""
        return self._document

    def get_view(self) -> InspectorView:
        """
        Zwraca pelny widok dokumentu.

        Returns:
            InspectorView z wszystkimi danymi do prezentacji
        """
        if self._view is None:
            self._view = self._build_view()
        return self._view

    def get_steps(self) -> tuple[StepView, ...]:
        """
        Zwraca liste krokow w deterministycznej kolejnosci.

        Returns:
            Krotka StepView posortowana po step_number
        """
        view = self.get_view()
        return tuple(sorted(view.steps, key=lambda s: s.step_number))

    def get_step(self, step_id: str) -> StepView | None:
        """
        Zwraca pojedynczy krok po ID.

        Args:
            step_id: Identyfikator kroku (np. "SC3F_STEP_001")

        Returns:
            StepView lub None jesli nie znaleziono
        """
        for step in self.get_steps():
            if step.step_id == step_id:
                return step
        return None

    def get_step_by_number(self, step_number: int) -> StepView | None:
        """
        Zwraca pojedynczy krok po numerze.

        Args:
            step_number: Numer kroku (1, 2, 3, ...)

        Returns:
            StepView lub None jesli nie znaleziono
        """
        for step in self.get_steps():
            if step.step_number == step_number:
                return step
        return None

    def get_summary(self) -> SummaryView:
        """
        Zwraca podsumowanie dowodu.

        Returns:
            SummaryView z glownymi wynikami
        """
        return self.get_view().summary

    def get_header(self) -> HeaderView:
        """
        Zwraca naglowek dokumentu.

        Returns:
            HeaderView z metadanymi projektu
        """
        return self.get_view().header

    def is_counterfactual(self) -> bool:
        """
        Sprawdza czy dokument to porownanie counterfactual A/B.

        Returns:
            True jesli dokument zawiera dane counterfactual
        """
        return self.get_view().is_counterfactual

    def get_counterfactual_table(self) -> CounterfactualView | None:
        """
        Zwraca tabele counterfactual A/B/Delta.

        Returns:
            CounterfactualView lub None jesli to nie counterfactual
        """
        return self.get_view().counterfactual

    def get_mapping_keys(self) -> dict[str, str]:
        """
        Zwraca wszystkie mapping_keys z dokumentu.

        Przydatne do audytu i tracability.

        Returns:
            Slownik: symbol -> mapping_key
        """
        keys: dict[str, str] = {}
        for step in self.get_steps():
            for val in step.input_values:
                keys[val.symbol] = val.mapping_key
            keys[step.result.symbol] = step.result.mapping_key
        return dict(sorted(keys.items()))

    def validate_completeness(self) -> tuple[bool, tuple[str, ...]]:
        """
        Waliduje kompletność strukturalną dokumentu dowodowego.

        Sprawdza obecność wymaganych kluczy w key_results dla danego typu dowodu.
        Brak obliczeń — tylko sprawdzenie strukturalne.

        Returns:
            Krotka (passed, missing_keys):
            - passed: True jeśli wszystkie wymagane klucze są obecne
            - missing_keys: Posortowana lista brakujących kluczy (deterministyczna)

        Note:
            Dla SC3F: jeśli brak idyn_ka, sprawdza czy ip_ka istnieje jako proxy.
            BINDING: I_dyn = i_p (prąd dynamiczny = prąd udarowy).
        """
        proof_type = self._document.proof_type.value
        key_results = self._document.summary.key_results

        # Get requirements for this proof type
        required_keys = COMPLETENESS_REQUIREMENTS.get(proof_type, ())
        if not required_keys:
            # No requirements defined for this proof type
            return True, ()

        present_keys = set(key_results.keys())
        missing: list[str] = []

        for key in required_keys:
            if key not in present_keys:
                missing.append(key)

        # Special case for SC3F: idyn_ka uses ip_ka as proxy
        if proof_type == ProofType.SC3F_IEC60909.value:
            if "idyn_ka" not in present_keys and "ip_ka" in present_keys:
                # ip_ka acts as proxy for idyn_ka (BINDING: I_dyn = i_p)
                pass
            elif "idyn_ka" not in present_keys and "ip_ka" not in present_keys:
                # Both missing — report idyn_ka as missing (ip_ka already in list)
                if "idyn_ka" not in missing:
                    missing.append("idyn_ka")

        # Return sorted missing keys for determinism
        return len(missing) == 0, tuple(sorted(missing))

    # =========================================================================
    # Private methods
    # =========================================================================

    def _build_view(self) -> InspectorView:
        """Buduje InspectorView z ProofDocument."""
        doc = self._document

        # Build header view
        header_view = self._build_header_view()

        # Build step views
        step_views = tuple(
            self._build_step_view(step) for step in sorted(doc.steps, key=lambda s: s.step_number)
        )

        # Build summary view
        summary_view = self._build_summary_view()

        # Check for counterfactual
        is_cf, cf_view = self._build_counterfactual_view()

        return InspectorView(
            document_id=doc.document_id,
            artifact_id=doc.artifact_id,
            created_at=doc.created_at,
            proof_type=doc.proof_type.value,
            title=doc.title_pl,
            header=header_view,
            steps=step_views,
            summary=summary_view,
            counterfactual=cf_view,
            is_counterfactual=is_cf,
        )

    def _build_header_view(self) -> HeaderView:
        """Buduje HeaderView z ProofHeader."""
        h = self._document.header
        return HeaderView(
            project_name=h.project_name,
            case_name=h.case_name,
            run_timestamp=h.run_timestamp,
            solver_version=h.solver_version,
            target_id=h.target_id,
            element_kind=h.element_kind,
            fault_location=h.fault_location,
            fault_type=h.fault_type,
            voltage_factor=h.voltage_factor,
            source_bus=h.source_bus,
            target_bus=h.target_bus,
        )

    def _build_step_view(self, step: ProofStep) -> StepView:
        """Buduje StepView z ProofStep."""
        input_views = tuple(
            self._build_value_view(val) for val in sorted(step.input_values, key=lambda v: v.symbol)
        )

        result_view = self._build_value_view(step.result)

        unit_check_view = UnitCheckView(
            passed=step.unit_check.passed,
            derivation=step.unit_check.derivation,
            expected_unit=step.unit_check.expected_unit,
            computed_unit=step.unit_check.computed_unit,
        )

        return StepView(
            step_number=step.step_number,
            step_id=step.step_id,
            title=step.title_pl,
            equation_id=step.equation.equation_id,
            formula_latex=step.equation.latex,
            standard_ref=step.equation.standard_ref,
            input_values=input_views,
            substitution_latex=step.substitution_latex,
            result=result_view,
            unit_check=unit_check_view,
            source_keys=dict(sorted(step.source_keys.items())),
        )

    def _build_value_view(self, val: ProofValue, alias_pl: str | None = None) -> ValueView:
        """Buduje ValueView z ProofValue."""
        return ValueView(
            symbol=val.symbol,
            value=val.formatted,
            raw_value=val.value,
            unit=val.unit,
            mapping_key=val.source_key,
            alias_pl=alias_pl,
        )

    def _build_summary_view(self) -> SummaryView:
        """Buduje SummaryView z ProofSummary z aliasami semantycznymi."""
        s = self._document.summary

        key_results: dict[str, ValueView] = {}
        for key, val in sorted(s.key_results.items()):
            # Lookup semantic alias for this key
            alias = SEMANTIC_ALIASES.get(key)
            alias_pl = alias.alias_pl if alias else None
            key_results[key] = self._build_value_view(val, alias_pl=alias_pl)

        protection_view = None
        if self._document.proof_type == ProofType.PROTECTION_OVERCURRENT:
            protection_view = self._build_protection_comparisons()

        return SummaryView(
            key_results=key_results,
            unit_check_passed=s.unit_check_passed,
            total_steps=s.total_steps,
            warnings=s.warnings,
            overall_status=s.overall_status,
            failed_checks=s.failed_checks,
            protection_comparisons=protection_view,
        )

    def _build_protection_comparisons(self) -> ProtectionComparisonView | None:
        summary = self._document.summary
        kr = summary.key_results

        def _status_value(key: str) -> str:
            val = kr.get(key)
            if val is None:
                return "NOT_EVALUATED"
            if isinstance(val.value, str):
                return val.value
            return str(val.value)

        def _why(status: str) -> str:
            if status == "OK":
                return "Warunek spełniony: margines dodatni."
            if status == "NOT_OK":
                return "Warunek niespełniony: margines ujemny."
            return "Brak danych do oceny."

        def _value_or_placeholder(key: str, symbol: str, unit: str) -> ValueView:
            if key in kr:
                return self._build_value_view(kr[key])
            return ValueView(
                symbol=symbol,
                value=f"— {unit}".strip(),
                raw_value="—",
                unit=unit,
                mapping_key=key,
                alias_pl=None,
            )

        rows: list[ProtectionComparisonRow] = []

        rows.append(
            ProtectionComparisonRow(
                name="Wyłączalność",
                left=_value_or_placeholder("ikss_ka", "I_k''", "kA"),
                right=_value_or_placeholder("icu_ka", "I_{cu}", "kA"),
                margin=kr.get("breaking_margin_ka")
                and self._build_value_view(kr["breaking_margin_ka"]),
                status=_status_value("breaking_ok"),
                why_pl=_why(_status_value("breaking_ok")),
            )
        )
        rows.append(
            ProtectionComparisonRow(
                name="Dynamiczny",
                left=_value_or_placeholder("ip_ka", "i_p", "kA"),
                right=_value_or_placeholder("idyn_ka", "I_{dyn}", "kA"),
                margin=kr.get("dynamic_margin_ka")
                and self._build_value_view(kr["dynamic_margin_ka"]),
                status=_status_value("dynamic_ok"),
                why_pl=_why(_status_value("dynamic_ok")),
            )
        )
        rows.append(
            ProtectionComparisonRow(
                name="Cieplny",
                left=_value_or_placeholder("i2t_ka2s", "\\int i^{2} dt", "kA²s"),
                right=_value_or_placeholder("ith_limit_ka2s", "I_{th}", "kA²s"),
                margin=kr.get("thermal_margin_ka2s")
                and self._build_value_view(kr["thermal_margin_ka2s"]),
                status=_status_value("thermal_ok"),
                why_pl=_why(_status_value("thermal_ok")),
            )
        )
        rows.append(
            ProtectionComparisonRow(
                name="Selektywność",
                left=_value_or_placeholder("selectivity_downstream_max_s", "t_{down,max}", "s"),
                right=_value_or_placeholder("selectivity_upstream_min_s", "t_{up,min}", "s"),
                margin=kr.get("selectivity_margin_s")
                and self._build_value_view(kr["selectivity_margin_s"]),
                status=_status_value("selectivity_ok"),
                why_pl=_why(_status_value("selectivity_ok")),
            )
        )

        return ProtectionComparisonView(rows=tuple(rows))

    def _build_counterfactual_view(
        self,
    ) -> tuple[bool, CounterfactualView | None]:
        """
        Buduje CounterfactualView jesli dokument to counterfactual.

        Sprawdza obecnosc kluczy delta_* w key_results.
        """
        summary = self._document.summary
        kr = summary.key_results
        proof_type = self._document.proof_type.value

        if proof_type == ProofType.LOAD_CURRENTS_OVERLOAD.value:
            overload_rows: list[CounterfactualRow] = []
            diff = summary.counterfactual_diff

            def _coerce_float(value: object) -> float | None:
                if isinstance(value, int | float):
                    return float(value)
                return None

            def _add_row(key: str, symbol_latex: str, unit: str) -> None:
                key_a = f"{key}_a"
                key_b = f"{key}_b"
                key_d = f"delta_{key}"
                if key_a not in kr or key_b not in kr or key_d not in diff:
                    return
                value_a = _coerce_float(kr[key_a].value)
                value_b = _coerce_float(kr[key_b].value)
                delta = _coerce_float(diff[key_d].value)
                if value_a is None or value_b is None or delta is None:
                    return
                overload_rows.append(
                    CounterfactualRow(
                        name=key,
                        symbol_latex=symbol_latex,
                        unit=unit,
                        value_a=value_a,
                        value_b=value_b,
                        delta=delta,
                    )
                )

            _add_row("s_mva", r"S", "MVA")
            _add_row("i_ka", r"I", "kA")
            _add_row("k_i_percent", r"k_{I}", "%")
            _add_row("m_i_percent", r"m_{I}", "%")
            _add_row("k_s_percent", r"k_{S}", "%")
            _add_row("m_s_percent", r"m_{S}", "%")

            if overload_rows:
                return True, CounterfactualView(
                    rows=tuple(overload_rows),
                    has_vdrop_data=False,
                )
            return False, None

        # Check for counterfactual markers
        is_cf = "delta_k_q" in kr and "delta_q_raw" in kr and "delta_q_cmd" in kr

        if not is_cf:
            return False, None

        rows: list[CounterfactualRow] = []

        # Q_cmd row
        if "q_cmd_a" in kr and "q_cmd_b" in kr:
            q_a = kr["q_cmd_a"].value
            q_b = kr["q_cmd_b"].value
            delta_q = kr["delta_q_cmd"].value
            rows.append(
                CounterfactualRow(
                    name="Q_cmd",
                    symbol_latex=r"Q_{cmd}",
                    unit="Mvar",
                    value_a=float(q_a) if isinstance(q_a, int | float) else 0.0,
                    value_b=float(q_b) if isinstance(q_b, int | float) else 0.0,
                    delta=float(delta_q) if isinstance(delta_q, int | float) else 0.0,
                )
            )

        # Check for VDROP data (P11.1c)
        has_vdrop = "u_a_kv" in kr and "u_b_kv" in kr and "delta_u_voltage_kv" in kr

        if has_vdrop:
            u_a = kr["u_a_kv"].value
            u_b = kr["u_b_kv"].value
            delta_u = kr["delta_u_voltage_kv"].value
            rows.append(
                CounterfactualRow(
                    name="U",
                    symbol_latex=r"U",
                    unit="kV",
                    value_a=float(u_a) if isinstance(u_a, int | float) else 0.0,
                    value_b=float(u_b) if isinstance(u_b, int | float) else 0.0,
                    delta=float(delta_u) if isinstance(delta_u, int | float) else 0.0,
                )
            )

        cf_view = CounterfactualView(
            rows=tuple(rows),
            has_vdrop_data=has_vdrop,
        )

        return True, cf_view


# =============================================================================
# Factory function
# =============================================================================


def inspect(document: ProofDocument) -> InspectorView:
    """
    Factory function tworzaca widok dokumentu.

    Uzycie:
        view = inspect(proof_document)
        for step in view.steps:
            print(step.title)

    Args:
        document: ProofDocument do inspekcji

    Returns:
        InspectorView (read-only widok)
    """
    return ProofInspector(document).get_view()
