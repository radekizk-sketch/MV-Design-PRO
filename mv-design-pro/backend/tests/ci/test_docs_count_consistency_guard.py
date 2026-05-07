"""Phase 0B-2: testy guard'a docs_count_consistency.

Walidują:
  1. Pattern parser rozpoznaje "N cases" / "N+ cases" / "N tests".
  2. Format dokładny ("N") wymaga równości.
  3. Format "N+" wymaga >=N i <= TOLERANCE_FACTOR*N.
  4. Brak pliku testowego → mismatch.
  5. CI smoke: guard przechodzi na aktualnym repo (no mismatches).
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

GUARD_PATH = Path(__file__).resolve().parents[3] / "scripts" / "docs_count_consistency_guard.py"
spec = importlib.util.spec_from_file_location("docs_count_guard", GUARD_PATH)
assert spec is not None and spec.loader is not None
guard_module = importlib.util.module_from_spec(spec)
sys.modules["docs_count_guard"] = guard_module
spec.loader.exec_module(guard_module)

DOC_PATTERN = guard_module.DOC_PATTERN
TS_TEST_PATTERN = guard_module.TS_TEST_PATTERN
PY_TEST_PATTERN = guard_module.PY_TEST_PATTERN


def test_doc_pattern_recognizes_exact_count() -> None:
    """`foo.test.ts` — 21 cases — dokładna liczba bez '+'."""
    line = "- `foo.test.ts` — 21 cases:"
    matches = list(DOC_PATTERN.finditer(line))
    assert len(matches) == 1
    m = matches[0]
    assert m.group("filename") == "foo.test.ts"
    assert m.group("count") == "21"
    assert m.group("plus") == ""


def test_doc_pattern_recognizes_lower_bound_with_plus() -> None:
    """`foo.test.tsx` — 117+ cases — N+ (lower bound)."""
    line = "  `foo.test.tsx` — 117+ cases SCADA-grade:"
    matches = list(DOC_PATTERN.finditer(line))
    assert len(matches) == 1
    m = matches[0]
    assert m.group("count") == "117"
    assert m.group("plus") == "+"


def test_doc_pattern_recognizes_tests_synonym() -> None:
    """Synonimy: 'cases' / 'tests' / 'test cases'."""
    cases = [
        "- `a.test.ts` — 5 cases.",
        "- `b.test.ts` — 5 tests.",
        "- `c.test.ts` — 5 test cases.",
    ]
    for line in cases:
        matches = list(DOC_PATTERN.finditer(line))
        assert len(matches) == 1, f"Nie zmatchowano: {line!r}"


def test_doc_pattern_skips_non_test_files() -> None:
    """Pattern ignoruje pliki bez `.test.` w nazwie."""
    line = "- `foo.ts` — 21 cases"
    assert list(DOC_PATTERN.finditer(line)) == []


def test_ts_test_pattern_counts_it_and_test() -> None:
    """it(...) i test(...) liczone, it.todo NIE."""
    code = """
    it('case 1', () => {});
    test('case 2', () => {});
    it.skip('case 3', () => {});
    it.todo('case 4');
    """
    count = len(TS_TEST_PATTERN.findall(code))
    # it + test + it.skip = 3 (skip wlicza, todo NIE bo regex wymaga `(`).
    assert count == 3


def test_py_test_pattern_counts_def_test() -> None:
    """def test_... i async def test_... liczone."""
    code = """
def test_foo():
    pass

async def test_bar():
    pass

def helper():
    pass
"""
    count = len(PY_TEST_PATTERN.findall(code))
    assert count == 2


def test_check_reference_exact_match(tmp_path: Path) -> None:
    """Format dokładny ("N"): actual == N → OK, != → mismatch."""
    DocReference = guard_module.DocReference
    repo = tmp_path
    (repo / "frontend" / "src").mkdir(parents=True)
    test_file = repo / "frontend" / "src" / "exact.test.ts"
    test_file.write_text(
        "it('a', () => {});\nit('b', () => {});\nit('c', () => {});\n",
        encoding="utf-8",
    )

    ref_ok = DocReference(
        doc_path=repo / "x.md", line_number=1, filename="exact.test.ts",
        declared_count=3, is_lower_bound=False,
    )
    assert guard_module._check_reference(ref_ok, repo, strict=False) is None

    ref_mismatch = DocReference(
        doc_path=repo / "x.md", line_number=1, filename="exact.test.ts",
        declared_count=4, is_lower_bound=False,
    )
    m = guard_module._check_reference(ref_mismatch, repo, strict=False)
    assert m is not None
    assert m.actual_count == 3
    assert "dokładnie" in m.reason


def test_check_reference_lower_bound_drop(tmp_path: Path) -> None:
    """Format "N+": actual < N → mismatch."""
    DocReference = guard_module.DocReference
    repo = tmp_path
    (repo / "frontend" / "src").mkdir(parents=True)
    test_file = repo / "frontend" / "src" / "lb.test.ts"
    test_file.write_text("it('a', ()=>{});", encoding="utf-8")

    ref = DocReference(
        doc_path=repo / "x.md", line_number=1, filename="lb.test.ts",
        declared_count=10, is_lower_bound=True,
    )
    m = guard_module._check_reference(ref, repo, strict=False)
    assert m is not None
    assert m.actual_count == 1
    assert "spadek" in m.reason


def test_check_reference_lower_bound_within_range(tmp_path: Path) -> None:
    """Format "N+": actual >= N i <= TOLERANCE*N → OK."""
    DocReference = guard_module.DocReference
    repo = tmp_path
    (repo / "frontend" / "src").mkdir(parents=True)
    test_file = repo / "frontend" / "src" / "lb.test.ts"
    # 15 testów; doc deklaruje 10+; 15/10=1.5, < 3.0 (TOLERANCE) → OK.
    test_file.write_text("\n".join(f"it('c{i}', ()=>{{}});" for i in range(15)), encoding="utf-8")

    ref = DocReference(
        doc_path=repo / "x.md", line_number=1, filename="lb.test.ts",
        declared_count=10, is_lower_bound=True,
    )
    assert guard_module._check_reference(ref, repo, strict=False) is None


def test_check_reference_lower_bound_exceeds_tolerance(tmp_path: Path) -> None:
    """Format "N+": actual > TOLERANCE*N → mismatch (doc nieaktualny)."""
    DocReference = guard_module.DocReference
    repo = tmp_path
    (repo / "frontend" / "src").mkdir(parents=True)
    test_file = repo / "frontend" / "src" / "lb.test.ts"
    # 50 testów; doc deklaruje 10+; 50/10=5.0 > 3.0 → mismatch.
    test_file.write_text("\n".join(f"it('c{i}', ()=>{{}});" for i in range(50)), encoding="utf-8")

    ref = DocReference(
        doc_path=repo / "x.md", line_number=1, filename="lb.test.ts",
        declared_count=10, is_lower_bound=True,
    )
    m = guard_module._check_reference(ref, repo, strict=False)
    assert m is not None
    assert "Zaktualizuj doc count" in m.reason


def test_check_reference_missing_test_file(tmp_path: Path) -> None:
    """Brak pliku testowego pod SEARCH_ROOTS → mismatch."""
    DocReference = guard_module.DocReference
    repo = tmp_path
    (repo / "frontend" / "src").mkdir(parents=True)
    ref = DocReference(
        doc_path=repo / "x.md", line_number=1, filename="missing.test.ts",
        declared_count=5, is_lower_bound=False,
    )
    m = guard_module._check_reference(ref, repo, strict=False)
    assert m is not None
    assert "nie znaleziony" in m.reason


def test_guard_smoke_real_repo() -> None:
    """CI smoke: guard NA AKTUALNYM repo nie ma mismatches.
    Jeśli ten test fail'uje, ktoś dodał test bez aktualizacji doc count
    (lub usunął). Aktualizuj doc albo testy."""
    repo_root = Path(__file__).resolve().parents[3]
    refs = guard_module._parse_doc_references(repo_root)
    mismatches = []
    for ref in refs:
        m = guard_module._check_reference(ref, repo_root, strict=False)
        if m is not None:
            mismatches.append(m)
    assert mismatches == [], (
        f"docs_count_consistency_guard znalazł {len(mismatches)} naruszeń: "
        + "\n".join(f"  {m.ref.doc_path.name}:{m.ref.line_number} — {m.reason}" for m in mismatches)
    )
