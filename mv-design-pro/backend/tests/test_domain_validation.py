from domain.validation import ValidationIssue, ValidationReport


def test_validation_report_is_valid() -> None:
    report = ValidationReport()

    assert report.is_valid is True
    assert report.to_dict()["errors"] == []
    assert report.to_dict()["warnings"] == []


def test_validation_report_collects_and_sorts() -> None:
    report = ValidationReport()
    report = report.with_warning(
        ValidationIssue(code="W02", message="warn", element_id="B", field="x")
    )
    report = report.with_warning(
        ValidationIssue(code="W01", message="warn", element_id="A", field="x")
    )
    report = report.with_error(
        ValidationIssue(code="E01", message="error", element_id="B", field="y")
    )

    payload = report.to_dict()

    assert payload["is_valid"] is False
    assert [issue["code"] for issue in payload["warnings"]] == ["W01", "W02"]
    assert payload["errors"][0]["field"] == "y"
