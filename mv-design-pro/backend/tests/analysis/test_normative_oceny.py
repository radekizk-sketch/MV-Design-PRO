"""Ocena normatywna z rekordów werdyktu wyjaśnialnego (karta WERDYKT-MIGRACJA-190, grupa 4).

Iloczyn cech: rodzaj reguły {progowa obciążenia ×2, progowa napięcia dotykowego, progowa prądu
doziemnego, logiczna ×3, selektywność, komplet SC3F, profil strat} × stan wielkości w dowodzie
{poniżej progu ostrzeżenia, na progu ostrzeżenia, między progami, na progu przekroczenia, powyżej,
brak klucza, wartość nieliczbowa} × konfiguracja progów {oba, tylko ostrzeżenie, tylko
przekroczenie, brak} × wymaganie selektywności {tak, nie} + brak dowodu pakietu dla każdej reguły.

Niezmienniki dla każdej pozycji: kod ``status`` jest projekcją rekordu (``FAIL`` ⇔
``NIE_SPELNIA``; ``PASS``/``WARNING`` ⇒ ``SPELNIA``; ``NOT_*`` ⇒ rekord nierozstrzygnięty albo
niestosowalny), ``why_pl`` jest zdaniem rekordu, serializacja niesie rekord i wyjaśnienie.
"""

from __future__ import annotations

import json
from datetime import datetime
from uuid import UUID

import pytest
from analysis.normative.evaluator import NormativeEvaluator
from analysis.normative.models import (
    NormativeConfig,
    NormativeItem,
    NormativeSeverity,
    NormativeStatus,
)
from analysis.normative.rule_registry import RULES
from analysis.normative.serializer import item_to_dict
from application.proof_engine.types import (
    ProofDocument,
    ProofHeader,
    ProofSummary,
    ProofType,
    ProofValue,
)

RUN_TS = datetime(2024, 1, 1, 12, 0, 0)


def _proof(proof_type: ProofType, key_results: dict[str, ProofValue], n: int) -> ProofDocument:
    return ProofDocument(
        document_id=UUID(int=n),
        artifact_id=UUID(int=10_000 + n),
        created_at=RUN_TS,
        proof_type=proof_type,
        title_pl="Test",
        header=ProofHeader(
            project_name="Proj",
            case_name="Case",
            run_timestamp=RUN_TS,
            solver_version="test",
            target_id=f"T{n}",
        ),
        steps=(),
        summary=ProofSummary(
            key_results=key_results, unit_check_passed=True, total_steps=0, warnings=()
        ),
    )


def _tekst(wartosc: str, klucz: str) -> ProofValue:
    return ProofValue(symbol=klucz, value=wartosc, unit="—", formatted=wartosc, source_key=klucz)


def _pozycja(
    proof_type: ProofType, rule_id: str, key_results: dict[str, ProofValue], cfg: NormativeConfig
) -> NormativeItem:
    raport = NormativeEvaluator().evaluate([_proof(proof_type, key_results, 1)], cfg)
    (pozycja,) = (i for i in raport.items if i.rule_id == rule_id)
    return pozycja


def _niezmienniki(pozycja: NormativeItem) -> None:
    status_k = pozycja.ocena.status_maszynowy
    if pozycja.status == NormativeStatus.FAIL:
        assert status_k == "NIE_SPELNIA"
        assert pozycja.severity == NormativeSeverity.FAIL
    elif pozycja.status in (NormativeStatus.PASS, NormativeStatus.WARNING):
        assert status_k == "SPELNIA"
    else:
        assert status_k not in ("SPELNIA", "NIE_SPELNIA")
    assert pozycja.why_pl == pozycja.ocena.wyjasnienie.zdanie_pl
    assert pozycja.wyjasnienie == pozycja.ocena.wyjasnienie
    slownik = item_to_dict(pozycja)
    assert slownik["ocena"]["status_maszynowy"] == status_k
    assert slownik["wyjasnienie"]["zdanie_pl"] == pozycja.why_pl


# --- reguły progowe obciążenia -------------------------------------------------------------

_OBCIAZENIE = [
    (50.0, NormativeStatus.PASS, 80.0),
    (80.0, NormativeStatus.WARNING, 80.0),
    (90.0, NormativeStatus.WARNING, 80.0),
    # Równość z progiem przekroczenia spełnia relację „nie większe” (reguła pakietu werdykt).
    (100.0, NormativeStatus.WARNING, 80.0),
    (120.0, NormativeStatus.FAIL, 100.0),
]


@pytest.mark.parametrize(
    ("rule_id", "klucz"), [("NR_P15_001", "k_i_percent"), ("NR_P15_002", "k_s_percent")]
)
@pytest.mark.parametrize(("wartosc", "status", "limit"), _OBCIAZENIE)
def test_obciazenie_iloczyn(
    rule_id: str, klucz: str, wartosc: float, status: NormativeStatus, limit: float
) -> None:
    pozycja = _pozycja(
        ProofType.LOAD_CURRENTS_OVERLOAD,
        rule_id,
        {klucz: ProofValue.create("k", wartosc, "%", klucz)},
        NormativeConfig(),
    )
    assert pozycja.status == status
    assert pozycja.limit_value == limit
    assert pozycja.margin == pytest.approx(wartosc - limit)
    assert pozycja.ocena.limit is not None
    assert pozycja.ocena.limit.wartosc is not None
    assert pozycja.ocena.limit.wartosc.wartosc == 100.0
    assert pozycja.ocena.podstawa.rodzaj == "ZALOZENIE_PROJEKTOWE"
    _niezmienniki(pozycja)


@pytest.mark.parametrize("rule_id", ["NR_P15_001", "NR_P15_002"])
@pytest.mark.parametrize(
    "key_results",
    [{}, {"k_i_percent": _tekst("dużo", "k_i_percent"), "k_s_percent": _tekst("x", "k_s_percent")}],
)
def test_obciazenie_brak_wielkosci(rule_id: str, key_results: dict[str, ProofValue]) -> None:
    pozycja = _pozycja(ProofType.LOAD_CURRENTS_OVERLOAD, rule_id, key_results, NormativeConfig())
    assert pozycja.status == NormativeStatus.NOT_COMPUTED
    assert pozycja.ocena.status_maszynowy == "NIE_OCENIONO"
    assert pozycja.ocena.wyjasnienie.czego_brakuje
    _niezmienniki(pozycja)


# --- reguły progowe uziemień: iloczyn wartości × konfiguracji progów ------------------------

_PROGI = {
    "oba": (40.0, 50.0),
    "tylko_ostrzezenie": (40.0, None),
    "tylko_przekroczenie": (None, 50.0),
    "brak": (None, None),
}


@pytest.mark.parametrize(
    ("rule_id", "klucz", "pola"),
    [
        ("NR_P19_001", "u_touch_v", ("touch_voltage_warn_v", "touch_voltage_fail_v")),
        ("NR_P19_002", "i_earth_a", ("earth_current_warn_a", "earth_current_fail_a")),
    ],
)
@pytest.mark.parametrize("progi", sorted(_PROGI))
@pytest.mark.parametrize("wartosc", [10.0, 40.0, 45.0, 50.0, 60.0])
def test_uziemienia_iloczyn(
    rule_id: str, klucz: str, pola: tuple[str, str], progi: str, wartosc: float
) -> None:
    warn, fail = _PROGI[progi]
    cfg = NormativeConfig(**{pola[0]: warn, pola[1]: fail})
    pozycja = _pozycja(
        ProofType.EARTHING_GROUND_FAULT_SN,
        rule_id,
        {klucz: ProofValue.create("x", wartosc, "V", klucz)},
        cfg,
    )
    _niezmienniki(pozycja)
    if warn is None and fail is None:
        # Brak limitu ≠ spełnia: podstawa nieustalona, wynik informacyjny (dawniej prąd
        # doziemny bez limitów dostawał PASS).
        assert pozycja.status == NormativeStatus.NOT_EVALUATED
        assert pozycja.ocena.status_maszynowy == "BRAK_PODSTAWY"
        assert pozycja.requires == pola
        assert pozycja.limit_value is None
        return
    przekroczenie = fail if fail is not None else warn
    ostrzezenie = warn if warn is not None else przekroczenie
    assert przekroczenie is not None and ostrzezenie is not None
    if wartosc > przekroczenie:
        assert pozycja.status == NormativeStatus.FAIL
    elif wartosc >= ostrzezenie:
        assert pozycja.status == NormativeStatus.WARNING
    else:
        assert pozycja.status == NormativeStatus.PASS


# --- reguły logiczne i selektywność --------------------------------------------------------

_WARUNKI = {
    "OK": (NormativeStatus.PASS, "SPELNIA"),
    "NOT_OK": (NormativeStatus.FAIL, "NIE_SPELNIA"),
    "NOT_EVALUATED": (NormativeStatus.NOT_EVALUATED, "NIE_OCENIONO"),
    "COS_INNEGO": (NormativeStatus.NOT_COMPUTED, "NIE_OCENIONO"),
}


@pytest.mark.parametrize(
    ("rule_id", "klucz"),
    [("NR_P18_001", "breaking_ok"), ("NR_P18_002", "dynamic_ok"), ("NR_P18_003", "thermal_ok")],
)
@pytest.mark.parametrize("wynik", sorted(_WARUNKI))
def test_warunki_logiczne_iloczyn(rule_id: str, klucz: str, wynik: str) -> None:
    pozycja = _pozycja(
        ProofType.PROTECTION_OVERCURRENT, rule_id, {klucz: _tekst(wynik, klucz)}, NormativeConfig()
    )
    status, status_k = _WARUNKI[wynik]
    assert pozycja.status == status
    assert pozycja.ocena.status_maszynowy == status_k
    assert pozycja.ocena.podstawa.rodzaj == "NORMA"
    _niezmienniki(pozycja)


@pytest.mark.parametrize("wymagana", [True, False])
@pytest.mark.parametrize("wynik", sorted(_WARUNKI))
def test_selektywnosc_iloczyn(wymagana: bool, wynik: str) -> None:
    pozycja = _pozycja(
        ProofType.PROTECTION_OVERCURRENT,
        "NR_P18_004",
        {"selectivity_ok": _tekst(wynik, "selectivity_ok")},
        NormativeConfig(selectivity_required=wymagana),
    )
    _niezmienniki(pozycja)
    if wynik == "NOT_EVALUATED" and not wymagana:
        assert pozycja.ocena.status_maszynowy == "NIE_DOTYCZY"
        assert pozycja.status == NormativeStatus.NOT_EVALUATED
        assert pozycja.severity == NormativeSeverity.INFO
        return
    status, status_k = _WARUNKI[wynik]
    assert pozycja.status == status
    assert pozycja.ocena.status_maszynowy == status_k
    if status_k == "NIE_OCENIONO":
        assert pozycja.severity == NormativeSeverity.WARNING


@pytest.mark.parametrize("brakujace", [(), ("ip_ka",), ("ikss_ka", "ip_ka", "ith_ka")])
def test_komplet_sc3f(brakujace: tuple[str, ...]) -> None:
    klucze = {
        k: ProofValue.create(k, 1.0, "kA", k)
        for k in ("ikss_ka", "ip_ka", "ith_ka")
        if k not in brakujace
    }
    pozycja = _pozycja(ProofType.SC3F_IEC60909, "NR_P11_001", klucze, NormativeConfig())
    _niezmienniki(pozycja)
    assert pozycja.requires == brakujace
    assert pozycja.status == (NormativeStatus.NOT_COMPUTED if brakujace else NormativeStatus.PASS)


@pytest.mark.parametrize("obecny", [True, False])
def test_profil_strat(obecny: bool) -> None:
    klucze = {"e_loss_kwh": ProofValue.create("E", 12.0, "kWh", "e_loss_kwh")} if obecny else {}
    pozycja = _pozycja(ProofType.LOSSES_ENERGY, "NR_P17_001", klucze, NormativeConfig())
    _niezmienniki(pozycja)
    assert pozycja.status == (NormativeStatus.PASS if obecny else NormativeStatus.NOT_COMPUTED)


@pytest.mark.parametrize("wartosc", [12.0, 12, complex(3.0, -4.0), "12 kWh"])
def test_profil_strat_typ_wartosci_dowodu(wartosc: float | complex | str) -> None:
    """Iloczyn: typ wartości dowodu (rzeczywista, całkowita, zespolona, tekst) × reguła obecności.
    Pozycja zapisuje wartość obserwowaną tak, by ładunek przeszedł przez JSON — liczba
    zespolona dowodu jako tekst (dawniej trafiała do pola ``float | str`` wprost)."""
    klucze = {
        "e_loss_kwh": ProofValue(
            symbol="E", value=wartosc, unit="kWh", formatted="x", source_key="e_loss_kwh"
        )
    }
    pozycja = _pozycja(ProofType.LOSSES_ENERGY, "NR_P17_001", klucze, NormativeConfig())
    _niezmienniki(pozycja)
    assert pozycja.status == NormativeStatus.PASS
    oczekiwana = str(wartosc) if isinstance(wartosc, complex) else wartosc
    assert pozycja.observed_value == oczekiwana
    json.dumps(item_to_dict(pozycja), allow_nan=False)


@pytest.mark.parametrize("wartosc", [complex(80.0, 1.0), "80 %"])
def test_regula_progowa_bez_liczby_rzeczywistej(wartosc: complex | str) -> None:
    """Reguła progowa porównuje wyłącznie liczbę rzeczywistą: wartość zespolona albo tekstowa
    dowodu to brak wielkości (``NIE_OCENIONO``), nigdy spełnienie."""
    klucze = {
        "k_i_percent": ProofValue(
            symbol="k", value=wartosc, unit="%", formatted="x", source_key="k_i_percent"
        )
    }
    pozycja = _pozycja(ProofType.LOAD_CURRENTS_OVERLOAD, "NR_P15_001", klucze, NormativeConfig())
    _niezmienniki(pozycja)
    assert pozycja.ocena.status_maszynowy == "NIE_OCENIONO"


def test_brak_dowodu_kazdej_reguly() -> None:
    raport = NormativeEvaluator().evaluate([], NormativeConfig())
    assert sorted(i.rule_id for i in raport.items) == sorted(r.rule_id for r in RULES)
    for pozycja in raport.items:
        assert pozycja.status == NormativeStatus.NOT_COMPUTED
        assert pozycja.ocena.status_maszynowy == "NIE_OCENIONO"
        (regula,) = (r for r in RULES if r.rule_id == pozycja.rule_id)
        assert pozycja.requires == (regula.proof_type.value,)
        _niezmienniki(pozycja)


def test_raport_deterministyczny_z_rekordami() -> None:
    proofs = [
        _proof(
            ProofType.LOAD_CURRENTS_OVERLOAD,
            {"k_i_percent": ProofValue.create("k", 90.0, "%", "k_i_percent")},
            n,
        )
        for n in range(3)
    ]
    a = NormativeEvaluator().evaluate(proofs, NormativeConfig()).to_dict()
    b = NormativeEvaluator().evaluate(list(reversed(proofs)), NormativeConfig()).to_dict()
    assert a == b
    assert all("ocena" in pozycja and "wyjasnienie" in pozycja for pozycja in a["items"])


def test_kazda_regula_rejestru_ma_ewaluator() -> None:
    """Rejestr zamknięty: każda reguła ma definicję rekordu i gałąź ewaluatora (reguła bez
    ewaluatora jest błędem programu, nie pozycją „nieobsługiwana”)."""
    for rule in RULES:
        raport = NormativeEvaluator().evaluate([_proof(rule.proof_type, {}, 7)], NormativeConfig())
        (pozycja,) = (i for i in raport.items if i.rule_id == rule.rule_id)
        assert pozycja.target_id == "T7"
        _niezmienniki(pozycja)
