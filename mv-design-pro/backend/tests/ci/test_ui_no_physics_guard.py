from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[3]
SCRIPTS_DIR = PROJECT_ROOT / "scripts"


def _load_script(module_name: str):
    script_path = SCRIPTS_DIR / f"{module_name}.py"
    spec = importlib.util.spec_from_file_location(module_name, script_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load script module: {script_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


ui_no_physics_guard = _load_script("ui_no_physics_guard")


def test_guard_is_green_on_repo_ui_and_ui2():
    """ui/** and ui2/** must contain no non-allowlisted network physics.

    H-1 (2026-07-22): scope extended from ui2/** only to ui/**+ui2/** after the
    R1-R3 "relocate UI physics -> backend" epic closed. Remaining raw hits in
    ui/** are covered by the reasoned ALLOWLIST (see module docstring).
    """
    assert ui_no_physics_guard.scan_tree(ui_no_physics_guard.SCAN_DIRS) == []


def test_scan_dirs_covers_ui_and_ui2():
    """H-1 scope extension: default SCAN_DIRS must include both layers."""
    scan_dirs = set(ui_no_physics_guard.SCAN_DIRS)
    repo_root = ui_no_physics_guard.REPO_ROOT
    assert repo_root / "frontend" / "src" / "ui" in scan_dirs
    assert repo_root / "frontend" / "src" / "ui2" in scan_dirs


def test_guard_main_returns_zero_on_repo():
    assert ui_no_physics_guard.main() == 0


def test_ui_allowlist_matches_measured_baseline():
    """Baseline (re-measured 2026-08-13, N-D3 kasacja): exactly 13 raw
    physics-pattern hits in frontend/src/ui/** (pre-allowlist, via scan_file
    which the allowlist
    never touches), classified 0 class-a (real physics) / 13 class-b (false
    positive: string, label, comment continuation, ratio of two backend values,
    unit conversion, chart-axis normalisation) / 0 class-c. If this count
    changes, a new hit appeared and MUST be re-classified explicitly
    (allowlisted with a reason, or fixed as a real physics defect) -- never
    silently absorbed by a broader allowlist entry.

    WHY THE NUMBER MOVED (5 -> 18 raw, 5 -> 15 allowlist entries). Not drift:
    K7-B WIDENED THE DETECTION PATTERNS. Until that card the guard only knew the
    quantities that produced the defect which created it (sqrt(3), impedance,
    dU/dP), so fifteen places in ui/** computing IEC 60255 characteristics,
    IEC 60909 withstand scaling, adiabatic conductor sizing, earthing resistance,
    instrument-transformer burden, THD and hosting capacity passed under a GREEN
    guard. Those places were relocated to the backend or deleted (see
    docs/uiux/DLUG_FIZYKA_W_UI_2026-07.md §7); what the new patterns still see in
    ui/** are only labels, comments and ratios -- itemised in ALLOWLIST.

    HISTORY. H-1 (2026-07-22) measured 22 raw hits / 18 entries; V12K-267
    re-measured 5 after commit dc525539 moved the frontend VT catalog to the
    backend; K7-B (2026-07-31) widened patterns and measured 18; KD-2 acceptance
    (2026-07-31) re-measured 16 after card KD-1 (V12K-289) deleted the dead
    station-wizard-v2 component holding two allowlisted label hits (KD-1's own
    gates skipped pytest -- zero backend files in its diff -- so this backend
    test scanning frontend files could only catch it on the merged tip);
    N-D3 kasacja (2026-08-13, row N-D3-POMIAR-U2 in
    docs/v12xx/REJESTR_KONFLIKTOW.md) re-measured 13 after deleting the whole
    station-wizard-v2 contracts library (3 raw hits / 2 allowlist entries;
    zero consumers measured on both branches). All
    re-measurements lowered the baseline BY MEASUREMENT, never by widening
    tolerance.
    """
    scan_dir = ui_no_physics_guard.REPO_ROOT / "frontend" / "src" / "ui"
    raw = 0
    for path in sorted(scan_dir.rglob("*")):
        if not path.is_file() or path.suffix not in ui_no_physics_guard.SCAN_EXTENSIONS:
            continue
        if ui_no_physics_guard._should_exclude_file(path):
            continue
        raw += len(ui_no_physics_guard.scan_file(path))
    assert raw == 13


def test_ui_allowlist_entries_are_not_stale():
    """Every ALLOWLIST entry must correspond to an actual current raw hit at
    that exact (path, line) -- a stale entry would mean the underlying code
    moved/changed and the exception is no longer verified against real code.
    """
    for (rel_path, line_no), reason in ui_no_physics_guard.ALLOWLIST.items():
        assert reason, f"allowlist entry {rel_path}:{line_no} must have a reason"
        full_path = ui_no_physics_guard.REPO_ROOT / rel_path
        assert full_path.is_file(), f"allowlisted path does not exist: {rel_path}"
        hit_lines = {ln for ln, _content, _pattern in ui_no_physics_guard.scan_file(full_path)}
        assert (
            line_no in hit_lines
        ), f"allowlist entry {rel_path}:{line_no} is stale (no longer a raw hit)"


def test_allowlist_is_scoped_to_exact_line_not_whole_file(tmp_path: Path, monkeypatch):
    """A new violation on a DIFFERENT line of an allowlisted file must still be
    flagged -- the allowlist must not degrade into a whole-file exemption.
    """
    fake_root = tmp_path
    ui_dir = fake_root / "frontend" / "src" / "ui" / "network-build" / "station-der"
    ui_dir.mkdir(parents=True, exist_ok=True)
    target = ui_dir / "protection-catalogs.ts"
    target.write_text(
        "export const ALLOWED = 15 / Math.sqrt(3); // pretend allowlisted line 1\n"
        "export function newBug(reactanceOhm: number, lengthKm: number) {\n"
        "  return reactanceOhm * lengthKm; // NEW physics, not allowlisted\n"
        "}\n",
        encoding="utf-8",
    )

    monkeypatch.setattr(ui_no_physics_guard, "REPO_ROOT", fake_root)
    monkeypatch.setattr(
        ui_no_physics_guard,
        "ALLOWLIST",
        {
            (
                "frontend/src/ui/network-build/station-der/protection-catalogs.ts",
                1,
            ): "c: test fixture, pretend catalog constant",
        },
    )

    violations = ui_no_physics_guard.scan_tree([ui_dir])
    flagged_lines = {line_no for _path, line_no, _line, _pattern in violations}

    assert 1 not in flagged_lines, "allowlisted line 1 must be filtered out"
    assert 3 in flagged_lines, "new physics on line 3 must still be caught"


def test_guard_detects_synthetic_physics_in_ui_legacy_layer(tmp_path: Path):
    """A sensitivityAnalyzer-class defect landing in the legacy ui/** layer
    (not just ui2/**) must be caught after the H-1 scope extension."""
    physics_file = tmp_path / "frontend" / "src" / "ui" / "oze" / "badAnalyzer.ts"
    physics_file.parent.mkdir(parents=True, exist_ok=True)
    physics_file.write_text(
        "export function estimate(dUdP: number, dUdQ: number, p: number, q: number) {\n"
        "  const deltaU = dUdP * p + dUdQ * q;\n"
        "  const ik3a = (1.1 * uV) / (Math.sqrt(3) * zTotalOhm);\n"
        "  const x = reactanceOhmPerKm * lengthKm;\n"
        "  return { deltaU, ik3a, x };\n"
        "}\n",
        encoding="utf-8",
    )

    violations = ui_no_physics_guard.scan_tree([physics_file.parent])

    assert violations, "guard must flag physics computation in a ui/** module"
    flagged_lines = {line_no for _path, line_no, _line, _pattern in violations}
    assert {2, 3, 4}.issubset(flagged_lines)


def test_guard_detects_synthetic_physics_in_ui2(tmp_path: Path):
    """A sensitivityAnalyzer-class defect (physics in the client) must be caught."""
    physics_file = tmp_path / "frontend" / "src" / "ui2" / "oze" / "badAnalyzer.ts"
    physics_file.parent.mkdir(parents=True, exist_ok=True)
    physics_file.write_text(
        "export function estimate(dUdP: number, dUdQ: number, p: number, q: number) {\n"
        "  const deltaU = dUdP * p + dUdQ * q;\n"
        "  const ik3a = (1.1 * uV) / (Math.sqrt(3) * zTotalOhm);\n"
        "  const x = reactanceOhmPerKm * lengthKm;\n"
        "  return { deltaU, ik3a, x };\n"
        "}\n",
        encoding="utf-8",
    )

    violations = ui_no_physics_guard.scan_tree([physics_file.parent])

    assert violations, "guard must flag physics computation in a ui2 module"
    flagged_lines = {line_no for _path, line_no, _line, _pattern in violations}
    # deltaU/dUdP arithmetic (line 2), √3 short-circuit (line 3), reactance (line 4).
    assert {2, 3, 4}.issubset(flagged_lines)


def test_guard_does_not_flag_current_false_positives(tmp_path: Path):
    """The bare token `current` (aria-current, Tailwind, React setters) is NOT physics."""
    fp_file = tmp_path / "frontend" / "src" / "ui2" / "shell" / "SafeComponent.tsx"
    fp_file.parent.mkdir(parents=True, exist_ok=True)
    fp_file.write_text(
        "export function SafeComponent() {\n"
        "  const [n, setN] = useState(0);\n"
        "  setN((current) => current + 1);\n"
        "  typeaheadBuffer.current += key;\n"
        "  return (\n"
        "    <button\n"
        '      aria-current="page"\n'
        '      className="border-current bg-current text-current"\n'
        '      data-testid="breadcrumb-current-item"\n'
        "    />\n"
        "  );\n"
        "}\n",
        encoding="utf-8",
    )

    assert ui_no_physics_guard.scan_tree([fp_file.parent]) == []


def test_guard_does_not_flag_backend_result_reads(tmp_path: Path):
    """Reading/formatting backend short-circuit results (Sk, Ik) is allowed."""
    read_file = tmp_path / "frontend" / "src" / "ui2" / "wyniki" / "readModel.ts"
    read_file.parent.mkdir(parents=True, exist_ok=True)
    read_file.write_text(
        "export function row(r: { sk_mva: number | null }) {\n"
        "  const skA = r.sk_mva;\n"
        "  const deltaU = r.delta_u_pct;\n"
        "  return { skA, kolDeltaU: deltaU };\n"
        "}\n",
        encoding="utf-8",
    )

    assert ui_no_physics_guard.scan_tree([read_file.parent]) == []


# =============================================================================
# K7-B (2026-07-31) — REGRESJE WSTRZYKNIETE dla NOWYCH rodzin wzorcow.
#
# Kazdy test ponizej odtwarza JEDEN z rachunkow, ktore karta K7-B zastala w
# `frontend/src/ui/**` przy ZIELONYM guardzie. Jesli ktorykolwiek wrocilby do
# warstwy prezentacji, guard musi go zlapac — inaczej rozszerzenie wzorcow
# byloby kosmetyka.
# =============================================================================


def _skan(tmp_path: Path, nazwa: str, tresc: str, warstwa: str = "ui"):
    plik = tmp_path / "frontend" / "src" / warstwa / "kreator" / nazwa
    plik.parent.mkdir(parents=True, exist_ok=True)
    plik.write_text(tresc, encoding="utf-8")
    return ui_no_physics_guard.scan_tree([plik.parent])


def test_guard_lapie_charakterystyke_idmt_iec60255(tmp_path: Path):
    """`computeTripTime` — trzy rownolegle kopie tego rachunku zyly w ui/**."""
    violations = _skan(
        tmp_path,
        "protectionContract.ts",
        "export function computeTripTime(m: number, tms: number, alpha: number) {\n"
        "  const denominator = Math.pow(m, alpha) - 1;\n"
        "  return (0.14 * tms) / denominator;\n"
        "}\n",
    )
    flagged = {ln for _p, ln, _c, _pat in violations}
    assert {2, 3}.issubset(flagged), violations


def test_guard_lapie_skalowanie_wytrzymalosci_cieplnej(tmp_path: Path):
    """`validateDeviceWithstand` — glowny trop karty K7-B (IEC 60909)."""
    violations = _skan(
        tmp_path,
        "protection-catalogs.ts",
        "export function validateDeviceWithstand(d: Dev, tClearing: number) {\n"
        "  const i_th_effective = d.i_th_1s_ka * Math.sqrt(d.i_th_duration_s / tClearing);\n"
        "  const utilization_dyn = (d.i_peak_calculated_ka / d.i_dyn_ka) * 100;\n"
        "  return { i_th_effective, utilization_dyn };\n"
        "}\n",
    )
    flagged = {ln for _p, ln, _c, _pat in violations}
    assert {2, 3}.issubset(flagged), violations


def test_guard_lapie_dobor_przekroju_adiabatyczny(tmp_path: Path):
    """`cableAmpacityValidator` — S_min = I*sqrt(t)/k oraz derating obciazalnosci."""
    violations = _skan(
        tmp_path,
        "cableAmpacityValidator.ts",
        "export function validateCableAmpacity(i: In) {\n"
        "  const deratedAmpacity = i.ratedAmpacityA * i.groupingFactor;\n"
        "  const thermalMm2 = (i.shortCircuitKa * 1000 * Math.sqrt(i.tS)) / i.k;\n"
        "  return { deratedAmpacity, thermalMm2 };\n"
        "}\n",
    )
    flagged = {ln for _p, ln, _c, _pat in violations}
    assert {2, 3}.issubset(flagged), violations


def test_guard_lapie_rezystancje_uziemienia_i_bilans_wtorny(tmp_path: Path):
    """`earthingGridCalculator` (IEEE 80) i `computeCtBurden` (IEC 61869-2)."""
    violations = _skan(
        tmp_path,
        "earthingAndBurden.ts",
        "export function obliczenia(soilResistivityOhmM: number, w: Wiring, c: Core) {\n"
        "  const rg = soilResistivityOhmM * (1 / w.lengthM);\n"
        "  const rp = (2 * w.lengthM) / (w.conductivityMperOhmMm2 * w.crossSectionMm2);\n"
        "  const margin = ((c.ratedBurdenVa - c.computedBurdenVa) / c.ratedBurdenVa) * 100;\n"
        "  return { rg, rp, margin };\n"
        "}\n",
    )
    flagged = {ln for _p, ln, _c, _pat in violations}
    assert {2, 3, 4}.issubset(flagged), violations


def test_guard_lapie_thd_i_prad_szczytowy(tmp_path: Path):
    """THD wg PN-EN 50160 oraz prad szczytowy ip = kappa*sqrt(2)*Ik (IEC 60909)."""
    violations = _skan(
        tmp_path,
        "powerQualityContract.ts",
        "export function jakosc(thdu: number, kappa: number, ikss: number) {\n"
        "  const thduPct = thdu * 100;\n"
        "  const ip = kappa * Math.sqrt(2) * ikss;\n"
        "  return { thduPct, ip };\n"
        "}\n",
    )
    flagged = {ln for _p, ln, _c, _pat in violations}
    assert {2, 3}.issubset(flagged), violations


def test_guard_nie_zglasza_specyfikatora_modulu_ani_komentarza_jsx(tmp_path: Path):
    """Sciezka modulu i komentarz JSX nie sa dzieleniem — inaczej allowlista
    puchlaby o wpisy bez tresci, a kazdy taki wpis to zgoda na cala linie."""
    violations = _skan(
        tmp_path,
        "Ekran.tsx",
        "import { A } from './ShortCircuitFlowOverlayAdapter';\n"
        "export { WykresIkssChart } from './WykresIkssChart';\n"
        "export function Ekran() {\n"
        "  return (\n"
        "    <div>\n"
        "      {/* Pickup Current */}\n"
        "      {/* Time Multiplier (TMS/TD) */}\n"
        "    </div>\n"
        "  );\n"
        "}\n",
    )
    assert violations == [], violations


def test_guard_nie_zglasza_odczytu_wielkosci_zwarciowych(tmp_path: Path):
    """Odczyt i formatowanie gotowych wielkosci zwarciowych (bez mnozenia i
    dzielenia) zostaje dozwolone — guard ma lapac RACHUNEK, nie slownictwo."""
    violations = _skan(
        tmp_path,
        "readWithstand.ts",
        "export function wiersz(r: { i_th_ka: number; i_dyn_ka: number }) {\n"
        "  const ith = r.i_th_ka.toFixed(1);\n"
        "  const idyn = r.i_dyn_ka.toFixed(1);\n"
        "  return `withstand: ${ith} + ${idyn}`;\n"
        "}\n",
    )
    assert violations == [], violations


# =============================================================================
# K7-B — REGRESJA WSTRZYKNIETA NA ORYGINALNYCH LINIACH.
#
# Ponizej sa PRAWDZIWE linie kodu, ktore karta K7-B wyjela z `frontend/src/ui/**`
# (skopiowane 1:1 przed usunieciem), a nie ich uproszczone parafrazy. To jest
# najmocniejszy dostepny dowod, ze rozszerzenie wzorcow dziala: gdyby ktorykolwiek
# z tych rachunkow wrocil do warstwy prezentacji dokladnie w tej postaci, w ktorej
# tam byl, guard zwroci RC=1. Kazdy wpis nazywa modul zrodlowy.
# =============================================================================

USUNIETE_RACHUNKI = [
    (
        "protection-catalogs.validateDeviceWithstand — skalowanie I_th (IEC 60909)",
        "const i_th_effective = device.i_th_1s_ka * Math.sqrt("
        "device.i_th_duration_s / Math.max(args.t_clearing_s, 0.01));",
    ),
    (
        "protection-catalogs.validateDeviceWithstand — wykorzystanie I_dyn",
        "const utilization_dyn = (args.i_peak_calculated_ka / device.i_dyn_ka) * 100;",
    ),
    (
        "ProtectionWizard.computeAutoTms — krotnosc pradu (IEC 60255-151)",
        "const ratio = i_fault_A / i_pickup_A;",
    ),
    (
        "selectivity-grading.computeTripTime — charakterystyka IDMT",
        "return (curve.tms * c.k) / denominator;",
    ),
    (
        "protectionContract.computeTripTime — wykladnik charakterystyki",
        "const denominator = Math.pow(currentMultiplier, constants.alpha) - 1;",
    ),
    (
        "protectionContract.checkProtectionCoordination — krotnosc wzgledem nastawy",
        "const downRatio = input.faultCurrent / input.downstream.pickup;",
    ),
    (
        "cableAmpacityValidator — obciazalnosc po deratingu",
        "const deratedAmpacity = ratedAmpacityA * groupingFactor * ambientFactor;",
    ),
    (
        "cableAmpacityValidator — przekroj adiabatyczny S_min (IEC 60949)",
        "thermalShortCircuitMm2 = Math.ceil((shortCircuitKa * 1000 * Math.sqrt("
        "shortCircuitDurationS)) / k);",
    ),
    (
        "earthingGridCalculator — rezystancja siatki (IEEE 80)",
        "const rg = soilResistivityOhmM * (term1 + term2);",
    ),
    (
        "earthingGridCalculator — napiecie dotykowe",
        "const touchVoltageV = gridResistanceOhm * faultCurrentA * 0.5;",
    ),
    (
        "ctMultiCoreContract.computeWireResistance (IEC 61869-2)",
        "return (2 * wiring.lengthM) / (wiring.conductivityMperOhmMm2 * "
        "wiring.crossSectionMm2);",
    ),
    (
        "ctMultiCoreContract.computeCtBurden — margines mocy wtornej",
        "const margin = ((core.ratedBurdenVa - computed) / core.ratedBurdenVa) * 100;",
    ),
    (
        "ctMultiCoreContract.checkCtSaturation — krotnosc Ik/I1n",
        "const ikRatio = shortCircuitCurrentA / primaryCurrentA;",
    ),
    (
        "vtMultiWindingContract.computeVtBurden — rezystancja obwodu wtornego",
        "const rp = (2 * wiring.lengthM) / (wiring.conductivityMperOhmMm2 * "
        "wiring.crossSectionMm2);",
    ),
    (
        "powerQualityContract.checkHarmonicCompliance — THD (PN-EN 50160)",
        "const thduPct = thdu * 100;",
    ),
    (
        "ctVtRatioValidator — wymagany ALF",
        "const requiredAlf = (shortCircuitCurrentKa * 1000) / primaryCurrentA;",
    ),
    (
        "protectionAutoSetter — nastawa z pradu zwarciowego",
        "pickupValue: Math.round(0.8 * input.shortCircuitKa * 1000),",
    ),
    (
        "measurementBurdenValidator — rezystancja przewodow wtornych",
        "const rp = (2 * CU_RESISTIVITY_OHM_MM2_PER_M * cableLengthM) / " "cableCrossSectionMm2;",
    ),
    (
        "lfDerivedMetrics — obciazenie liczone z ampacyjnosci",
        "const loadingPct = (iMetric.value / ampacityA) * 100;",
    ),
    (
        "ip = kappa * sqrt(2) * Ik'' (IEC 60909)",
        "const ip = kappa * Math.sqrt(2) * ikssKa;",
    ),
]


@pytest.mark.parametrize("opis,linia", USUNIETE_RACHUNKI, ids=[o for o, _ in USUNIETE_RACHUNKI])
def test_guard_lapie_kazdy_rachunek_usuniety_karta_k7b(
    opis: str, linia: str, tmp_path: Path
) -> None:
    plik = tmp_path / "frontend" / "src" / "ui" / "kreator" / "wznowiony.ts"
    plik.parent.mkdir(parents=True, exist_ok=True)
    plik.write_text(f"export function f() {{\n  {linia}\n}}\n", encoding="utf-8")

    violations = ui_no_physics_guard.scan_tree([plik.parent])

    assert violations, f"guard PRZEPUSCIL rachunek, ktory K7-B usunela z ui/**: {opis}"
