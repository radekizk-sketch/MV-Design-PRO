"""Towarzysze werdyktu w nosnikach analiz (karta AB-1a-bis) — ILOCZYN CECH.

Cechy, w ktorych defekt moglby sie schowac (regula KLASA, NIE INSTANCJA):
nosnik (walidacja energetyczna, profil napiec, raport normatywny, krzywe I–t,
wrazliwosc, rekomendacje) x stan werdyktu (PASS / WARNING / FAIL / NIE OBLICZONO)
x towarzysz (wartosc, odniesienie, margines, podstawa, dowod) x postac (obiekt
Pythona i slownik API po serializacji). Kazdy nosnik przechodzi przez PRAWDZIWY
builder (sciezka produkcyjna), nie przez recznie zlozony obiekt.

Predykat parami: znak zapasu i werdykt pochodza z tej samej nierownosci — test
przypina, ze `margines <= 0` <=> FAIL (granica przekroczenia) dla nosnikow z
jedna granica, oraz ze zadna podstawa nie udaje zweryfikowanego zrodla (liczby
bez cytowanego wydania i punktu w kodzie = `UNVERIFIED_SOURCE`).
"""

from __future__ import annotations

from typing import Any

import pytest
from analysis.energy_validation.builder import EnergyValidationBuilder
from analysis.energy_validation.models import (
    EnergyCheckType,
    EnergyValidationConfig,
    EnergyValidationContext,
    EnergyValidationStatus,
)
from analysis.normative.evaluator import NormativeEvaluator
from analysis.normative.kryteria_napiecia import (
    KRYTERIUM_PRZEKROCZENIE_PROCENT,
    podstawa_progu_napiecia,
)
from analysis.normative.models import NormativeConfig, NormativeStatus
from analysis.normative.rule_registry import RULES
from analysis.protection_curves_it.builder import ProtectionCurvesITBuilder
from analysis.recommendations.builder import RecommendationBuilder
from analysis.recommendations.serializer import entry_to_dict
from analysis.sensitivity.builder import SensitivityBuilder
from analysis.sensitivity.models import ZAPAS_GRANICZNY, SensitivityDecision
from analysis.voltage_profile.builder import VoltageProfileBuilder
from analysis.voltage_profile.models import VoltageProfileContext, VoltageProfileStatus
from application.proof_engine.types import ProofType, ProofValue
from solver_input.provenance import StatusZrodla

from tests.analysis.test_energy_validation import _build_pf_result, _build_simple_graph
from tests.analysis.test_normative_p20 import _make_proof
from tests.analysis.test_protection_curves_it_cp22 import (
    _sample_normative_report,
    _sample_proof,
    _sample_protection_insight,
)
from tests.analysis.test_sensitivity import _protection_insight
from tests.analysis.test_voltage_profile_p21 import RUN_TS
from tests.analysis.test_voltage_profile_p21 import _make_graph as _graf_profilu
from tests.analysis.test_voltage_profile_p21 import _make_pf_result as _pf_profilu

GRUPY = ("wartosc", "odniesienie", "margines", "podstawa", "dowod")


def _sprawdz_podstawe(podstawa: dict[str, Any] | None) -> None:
    assert podstawa is not None
    assert podstawa["zrodlo_status"] == StatusZrodla.UNVERIFIED_SOURCE
    # Wydanie nie jest przypiete w kodzie zadnego z dostawcow — nigdy zmyslone.
    assert podstawa["wersja"] is None
    assert podstawa["uwaga_pl"]


def _sprawdz_slownik(pozycja: dict[str, Any]) -> None:
    for grupa in GRUPY:
        assert grupa in pozycja, f"brak towarzysza {grupa} w {sorted(pozycja)}"
    _sprawdz_podstawe(pozycja["podstawa"])


# ---------------------------------------------------------------------------
# Walidacja energetyczna: kontrola x stan x towarzysz
# ---------------------------------------------------------------------------


def _widok_walidacji(**pf: Any) -> Any:
    kontekst = EnergyValidationContext(
        project_name="P",
        case_name="C",
        case_id="case-1",
        run_timestamp=None,
        snapshot_hash=None,
        run_id="bieg-pf-1",
    )
    return EnergyValidationBuilder(kontekst).build(
        _build_pf_result(**pf), _build_simple_graph(), EnergyValidationConfig()
    )


@pytest.mark.parametrize(
    ("prad_ka", "oczekiwany"),
    [
        (0.1, EnergyValidationStatus.PASS),
        (0.45, EnergyValidationStatus.WARNING),
        (0.6, EnergyValidationStatus.FAIL),
    ],
)
def test_walidacja_obciazenie_galezi_stan_x_towarzysze(
    prad_ka: float, oczekiwany: EnergyValidationStatus
) -> None:
    widok = _widok_walidacji(branch_current_ka={"line-1": prad_ka})
    (pozycja,) = (i for i in widok.items if i.check_type == EnergyCheckType.BRANCH_LOADING)
    assert pozycja.status == oczekiwany
    assert pozycja.wartosc == pozycja.observed_value
    assert pozycja.odniesienie == pozycja.limit_fail
    assert pozycja.margines == pytest.approx(-pozycja.margin_pct)
    # Predykat parami: FAIL <=> zapas do granicy przekroczenia <= 0.
    assert (pozycja.margines <= 0) == (oczekiwany == EnergyValidationStatus.FAIL)
    assert pozycja.dowod == {
        "run_id": "bieg-pf-1",
        "element_id": "line-1",
        "trace_ref": "white_box",
    }
    _sprawdz_slownik(widok.to_dict()["items"][widok.items.index(pozycja)])


def test_walidacja_kazda_kontrola_i_stan_nie_obliczono_niesie_towarzyszy() -> None:
    """Wszystkie piec rodzajow kontroli, takze NOT_COMPUTED (brak danych PF)."""
    pelny = _widok_walidacji(
        branch_current_ka={"line-1": 0.1},
        branch_s_from_mva={"tr-1": 10 + 2j},
        node_voltage_kv={"bus-a": 112.0, "bus-b": 15.5},
    )
    pusty = _widok_walidacji(losses_total_pu=complex("nan"), slack_power_pu=complex("nan"))
    rodzaje = {i.check_type for i in pelny.items} | {i.check_type for i in pusty.items}
    assert rodzaje == set(EnergyCheckType)
    for widok in (pelny, pusty):
        for pozycja, slownik in zip(widok.items, widok.to_dict()["items"], strict=True):
            _sprawdz_slownik(slownik)
            if pozycja.status == EnergyValidationStatus.NOT_COMPUTED:
                # Brak danej = None, nigdy wartosc zastepcza.
                assert pozycja.wartosc is None and pozycja.margines is None
                assert pozycja.dowod is not None and pozycja.dowod["trace_ref"] is None


def test_walidacja_podstawa_napiecia_z_jednego_zrodla() -> None:
    widok = _widok_walidacji(node_voltage_kv={"bus-a": 112.0})
    napiecie = [i for i in widok.items if i.check_type == EnergyCheckType.VOLTAGE_DEVIATION]
    assert napiecie
    for pozycja in napiecie:
        assert pozycja.podstawa == podstawa_progu_napiecia(KRYTERIUM_PRZEKROCZENIE_PROCENT)
        assert pozycja.podstawa.dokument == "PN-EN 50160"


def test_prog_napiecia_z_konfiguracji_nie_udaje_normy() -> None:
    assert podstawa_progu_napiecia(7.5).dokument is None
    assert podstawa_progu_napiecia(None).dokument is None


# ---------------------------------------------------------------------------
# Profil napiec: stan x towarzysz
# ---------------------------------------------------------------------------


def test_profil_napiec_stan_x_towarzysze() -> None:
    kontekst = VoltageProfileContext(
        project_name="P",
        case_name="C",
        run_timestamp=RUN_TS,
        snapshot_id=None,
        trace_id="artefakt-1",
        run_id="bieg-pf-2",
    )
    widok = VoltageProfileBuilder(graph=_graf_profilu(), context=kontekst).build(
        _pf_profilu(), NormativeConfig()
    )
    stany = {w.status for w in widok.rows}
    assert stany == set(VoltageProfileStatus)
    for wiersz, slownik in zip(widok.rows, widok.to_dict()["rows"], strict=True):
        _sprawdz_slownik(slownik)
        assert wiersz.odniesienie == NormativeConfig().voltage_fail_pct
        assert wiersz.dowod == {
            "run_id": "bieg-pf-2",
            "element_id": wiersz.bus_id,
            "trace_ref": "artefakt-1",
        }
        if wiersz.status == VoltageProfileStatus.NOT_COMPUTED:
            assert wiersz.wartosc is None and wiersz.margines is None
        else:
            assert wiersz.wartosc == pytest.approx(abs(wiersz.delta_pct))
            assert (wiersz.margines <= 0) == (wiersz.status == VoltageProfileStatus.FAIL)


# ---------------------------------------------------------------------------
# Raport normatywny: regula x stan x towarzysz
# ---------------------------------------------------------------------------


def test_raport_normatywny_stan_x_towarzysze() -> None:
    dowody = [
        _make_proof(
            proof_type=ProofType.LOAD_CURRENTS_OVERLOAD,
            key_results={"k_i_percent": ProofValue.create("k_I", wartosc, "%", "k_i_percent")},
            target_id=cel,
            document_id=f"00000000-0000-0000-0000-00000000030{n}",
        )
        for n, (cel, wartosc) in enumerate((("L_FAIL", 120.0), ("L_WARN", 90.0), ("L_OK", 50.0)))
    ]
    raport = NormativeEvaluator().evaluate(dowody, NormativeConfig())
    stany = {p.status for p in raport.items}
    assert {NormativeStatus.FAIL, NormativeStatus.WARNING, NormativeStatus.PASS} <= stany
    assert NormativeStatus.NOT_COMPUTED in stany  # reguly bez pakietu dowodowego
    for pozycja, slownik in zip(raport.items, raport.to_dict()["items"], strict=True):
        _sprawdz_slownik(slownik)
        assert pozycja.wartosc == pozycja.observed_value
        assert pozycja.odniesienie == pozycja.limit_value
        if pozycja.margin is not None:
            assert pozycja.margines == pytest.approx(-pozycja.margin)
        if pozycja.status == NormativeStatus.NOT_COMPUTED and pozycja.target_id == "—":
            assert pozycja.dowod is None  # brak pakietu dowodowego = brak dowodu
        else:
            assert pozycja.dowod is not None and pozycja.dowod["trace_ref"]


def test_kazda_regula_rejestru_ma_podstawe_niezweryfikowana() -> None:
    for regula in RULES:
        _sprawdz_podstawe(regula.podstawa.to_dict())


# ---------------------------------------------------------------------------
# Krzywe I–t, wrazliwosc, rekomendacje (agregaty i nosniki przepisujace)
# ---------------------------------------------------------------------------


def test_krzywe_it_werdykt_zliczeniowy_z_tych_samych_pozycji() -> None:
    raport = _sample_normative_report()
    widok = ProtectionCurvesITBuilder().build(
        protection_insight=_sample_protection_insight(),
        proofs_p18=[_sample_proof()],
        normative_report_p20=raport,
    )
    _sprawdz_slownik(widok.to_dict())
    assert widok.odniesienie is not None and widok.wartosc is not None
    assert widok.wartosc <= widok.odniesienie
    # FAIL agregatu <=> nie wszystkie reguly pary spelnione.
    assert (widok.normative_status == NormativeStatus.FAIL) == (widok.wartosc < widok.odniesienie)
    assert widok.margines == min(widok.margins_pct.values())


def test_wrazliwosc_i_rekomendacje_przepisuja_towarzyszy_zrodla() -> None:
    raport = NormativeEvaluator().evaluate(
        [
            _make_proof(
                proof_type=ProofType.LOAD_CURRENTS_OVERLOAD,
                key_results={"k_i_percent": ProofValue.create("k_I", 120.0, "%", "k_i_percent")},
                target_id="L_FAIL",
            )
        ],
        NormativeConfig(),
    )
    wrazliwosc = SensitivityBuilder().build([], raport, None, _protection_insight(), None)
    assert wrazliwosc.entries
    for wpis, slownik in zip(wrazliwosc.entries, wrazliwosc.to_dict()["entries"], strict=True):
        _sprawdz_slownik(slownik)
        assert wpis.odniesienie == ZAPAS_GRANICZNY
        assert wpis.wartosc == wpis.base_margin == wpis.margines
        assert wpis.podstawa is not None
        if wpis.base_decision != SensitivityDecision.NOT_COMPUTED:
            assert (wpis.margines >= 0) == (wpis.base_decision == SensitivityDecision.PASS)
    zrodlo_normatywne = [w for w in wrazliwosc.entries if w.parameter_id == "load_q"]
    assert zrodlo_normatywne[0].podstawa == RULES[0].podstawa

    rekomendacje = RecommendationBuilder().build(
        proofs=[],
        sensitivity=wrazliwosc,
        normative_report=raport,
        voltage_profile=None,
        protection_insight=None,
        protection_curves_it=None,
    )
    wpisy = [rekomendacje.primary, *rekomendacje.alternatives]
    for wpis in wpisy:
        assert wpis is not None
        _sprawdz_slownik(entry_to_dict(wpis))
        assert wpis.podstawa is not None
