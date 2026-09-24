import ast
from functools import cache
from pathlib import Path

import pytest
from application.solvers.solver_capability_registry import (
    SOLVER_CAPABILITY_REGISTRY,
    SolverCapability,
    solver_capabilities_contract,
)

_KATALOG_TESTOW = Path(__file__).resolve().parent
# Moduł asercji wspólnych testów uczciwości — jego funkcje (np. `sprawdz_ocene_niewykonana`)
# wchodzą do przechodniego przeglądu ciała testu odniesienia.
_POMOCNICZE_UCZCIWOSCI = _KATALOG_TESTOW / "uczciwosc" / "pomocnicze.py"
_STATUS_OCENY_NIEWYKONANEJ = "NIE_OCENIONO"


@cache
def _definicje_funkcji(sciezka: Path) -> dict[str, ast.FunctionDef]:
    drzewo = ast.parse(sciezka.read_text(encoding="utf-8"))
    return {wezel.name: wezel for wezel in ast.walk(drzewo) if isinstance(wezel, ast.FunctionDef)}


def _test_odniesienia_dowodzi_oceny_niewykonanej(wpis: SolverCapability) -> bool:
    """Czy ciało testu odniesienia (przechodnio przez funkcje pomocnicze własnego modułu
    i modułu `uczciwosc/pomocnicze.py`) sprawdza status ``NIE_OCENIONO`` ścieżki użytkownika."""
    plik, *czlony = wpis.reference_test.split("::")
    definicje = {
        **_definicje_funkcji(_POMOCNICZE_UCZCIWOSCI),
        **_definicje_funkcji(_KATALOG_TESTOW / plik),
    }
    do_odwiedzenia = [czlony[-1]]
    odwiedzone: set[str] = set()
    while do_odwiedzenia:
        nazwa = do_odwiedzenia.pop()
        if nazwa in odwiedzone or nazwa not in definicje:
            continue
        odwiedzone.add(nazwa)
        for wezel in ast.walk(definicje[nazwa]):
            if isinstance(wezel, ast.Constant) and wezel.value == _STATUS_OCENY_NIEWYKONANEJ:
                return True
            if isinstance(wezel, ast.Call) and isinstance(wezel.func, ast.Name):
                do_odwiedzenia.append(wezel.func.id)
    return False


def test_advanced_solver_capability_registry_is_complete_and_real() -> None:
    expected = {
        "SC_3F",
        "SC_1F",
        "SC_2F",
        "SC_2F_G",
        "LOAD_FLOW_NR",
        "LOAD_FLOW_GS_DIAGNOSTIC",
        "LOAD_FLOW_FD_PERFORMANCE",
        # Karta W5-D (2026-09-16): rozpływ niesymetryczny (BFS per faza) jako bieg
        # produktu `PF_UNBALANCED` — nowa zdolność w rejestrze.
        "LOAD_FLOW_UNBALANCED_BFS",
        "PHASE_STATE_SN",
        "DYNAMIC_STABILITY",
        "POWER_QUALITY_HARMONICS",
        "SSCI_IMPEDANCE",
        "VOLTAGE_STABILITY",
        "RELIABILITY_CONTINGENCY",
        "EARTHING_SAFETY",
        "NEUTRAL_EARTHING_DESIGN",
        "INSULATION_COORDINATION",
        "EARTH_FAULT_DETECTION",
        "TRANSIENT_TRV",
        "MOTOR_STARTING",
        "HOSTING_CAPACITY",
        "OPF_LOSS_LCC",
        "BENCHMARK_VALIDATION",
        "UNCERTAINTY_SENSITIVITY",
    }

    # Karta W3-E (2026-09-09): HOSTING_CAPACITY i OPF_LOSS_LCC duplikują kanon
    # liczony gdzie indziej (impedancja Thevenina lokalna / β zaszyte) i nie
    # uruchamiają już NOWYCH biegów (410) — `availability` "withdrawn" dla tych
    # dwóch jest UCZCIWE (solver je nadal implementuje i solver_version/
    # proof_support/reportable zostają bez zmian; "available" na tej
    # powierzchni sugerowałoby nieprawdę: że nowy bieg jest możliwy).
    wycofane = {"HOSTING_CAPACITY", "OPF_LOSS_LCC"}
    assert set(SOLVER_CAPABILITY_REGISTRY) == expected
    for capability in SOLVER_CAPABILITY_REGISTRY.values():
        oczekiwana_dostepnosc = "withdrawn" if capability.capability in wycofane else "available"
        assert capability.availability == oczekiwana_dostepnosc, capability.capability
        assert capability.proof_support is True
        assert capability.output_contract
        assert capability.reference_test.endswith(".py") or ".py::" in capability.reference_test


@pytest.mark.parametrize("zdolnosc", sorted(SOLVER_CAPABILITY_REGISTRY))
def test_stan_walidacji_zdolnosci_wynika_z_dowodu_testu_odniesienia(zdolnosc: str) -> None:
    """Test KLASY (uczciwość natychmiastowa 2026-09-23), nie przykład z karty.

    Intencja zachowana: rejestr kompletny i realny. Zmiana kanonu: zdolność wykonywana bez
    oceny inżynierskiej (solver bez wyroczni / tor bez rozwiązania sieci) ma status
    ``UNVALIDATED``. Dla KAŻDEJ zdolności, bez listy nazw zaszytej w teście:

    * ``UNVALIDATED`` ⇔ test odniesienia dowodzi oceny niewykonanej (``NIE_OCENIONO``) na
      ścieżce użytkownika — jedno źródło prawdy dla obu kierunków, więc zdolność nie wróci
      do „implemented" bez zmiany dowodu, a nowy tor bez oceny nie ukryje się jako
      „implemented";
    * zdolność ``UNVALIDATED`` ma test odniesienia w pakiecie ``uczciwosc/``, nie jest
      raportowalna, a jej zakres stosowania nazywa powód i mówi, że ocena jest niewykonana;
    * raportowalna jest wyłącznie zdolność ``implemented``.
    """
    wpis = SOLVER_CAPABILITY_REGISTRY[zdolnosc]  # type: ignore[index]
    niezwalidowana = wpis.implementation_status == "UNVALIDATED"

    assert _test_odniesienia_dowodzi_oceny_niewykonanej(wpis) is niezwalidowana, wpis.reference_test
    assert wpis.reportable is (not niezwalidowana), zdolnosc
    if niezwalidowana:
        assert wpis.reference_test.startswith("uczciwosc/"), wpis.reference_test
        assert "niewykonana" in wpis.applicability, wpis.applicability
        assert "werdykt" not in wpis.applicability.replace("bez werdyktu", ""), wpis.applicability


def test_advanced_solver_capability_contract_reports_full_support() -> None:
    contract = solver_capabilities_contract()
    pozycje = contract["capabilities"]

    assert contract["contract"] == "SolverCapabilityRegistryV1"
    # Karta W3-E: dwie zdolności "withdrawn" — `all_available` jest teraz
    # UCZCIWIE False (nie fabrykujemy "wszystko dostępne", gdy dwie z 25
    # zdolności nie przyjmują już nowego biegu).
    assert contract["all_available"] is False
    # Uczciwość natychmiastowa (2026-09-23): agregaty nie zastępują kryteriów składowych —
    # „wszystko zaimplementowane / raportowalne" wynika z pozycji rejestru (zmiana kanonu:
    # dawniej przypięte stałą True). Dowód (ślad) nadal wspierany przez wszystkie zdolności.
    assert contract["all_implemented"] is all(
        item["implementation_status"] == "implemented" for item in pozycje
    )
    assert contract["all_reportable"] is all(bool(item["reportable"]) for item in pozycje)
    assert contract["all_proof_supported"] is True
    niezwalidowane_kontraktu = sorted(
        item["capability"] for item in pozycje if item["implementation_status"] != "implemented"
    )
    niezwalidowane_rejestru = sorted(
        wpis.capability
        for wpis in SOLVER_CAPABILITY_REGISTRY.values()
        if wpis.implementation_status == "UNVALIDATED"
    )
    assert niezwalidowane_kontraktu == niezwalidowane_rejestru
    # W3-D (2026-09-09): 25 -> 23 (kasacja source_compliance x2); W3-E: 2 pozycje "withdrawn", nie skasowane;
    # W5-D (2026-09-16): 23 -> 24 (LOAD_FLOW_UNBALANCED_BFS — rozpływ niesymetryczny jako bieg produktu).
    assert len(pozycje) == 24
    niedostepne = sorted(
        item["capability"] for item in pozycje if item["availability"] != "available"
    )
    assert niedostepne == ["HOSTING_CAPACITY", "OPF_LOSS_LCC"]
