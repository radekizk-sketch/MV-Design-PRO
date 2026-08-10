from __future__ import annotations

import json

import verification_entrypoints_guard as guard


def _repo(tmp_path, scripts):
    root = tmp_path / "repo"
    frontend = root / "frontend"
    workflows = tmp_path / ".github" / "workflows"
    (root / "scripts").mkdir(parents=True)
    frontend.mkdir()
    workflows.mkdir(parents=True)
    package = frontend / "package.json"
    package.write_text(json.dumps({"scripts": scripts}), encoding="utf-8")
    return root, package, workflows


def test_npm_run_wskazujacy_nieistniejacy_plik_jest_bledem(tmp_path) -> None:
    root, package, workflows = _repo(tmp_path, {"test:pin": "vitest run src/brak.test.ts"})
    assert guard.check_verification_entrypoints(package, workflows, root) == [
        "[npm-missing-target] test:pin: src/brak.test.ts"
    ]


def test_npm_run_wskazujacy_istniejacy_plik_przechodzi(tmp_path) -> None:
    root, package, workflows = _repo(tmp_path, {"test:pin": "vitest run src/jest.test.ts"})
    (package.parent / "src").mkdir()
    (package.parent / "src" / "jest.test.ts").touch()
    assert guard.check_verification_entrypoints(package, workflows, root) == []


def test_suita_verify_bez_wywolania_ci_jest_bledem(tmp_path) -> None:
    root, package, workflows = _repo(tmp_path, {})
    (root / "scripts" / "verify_release.py").touch()
    assert guard.check_verification_entrypoints(package, workflows, root) == [
        "[verification-not-in-ci] scripts/verify_release.py"
    ]


def test_suita_verify_wywolywana_w_ci_przechodzi(tmp_path) -> None:
    root, package, workflows = _repo(tmp_path, {})
    (root / "scripts" / "verify_release.py").touch()
    (workflows / "verify.yml").write_text(
        "run: python scripts/verify_release.py\n", encoding="utf-8"
    )
    assert guard.check_verification_entrypoints(package, workflows, root) == []
