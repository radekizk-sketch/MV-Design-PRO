"""Koordynacja E-28 na urządzeniach i nastawach Z MODELU (karta BIEG-ZABEZPIECZEN-Z-MODELU).

Iloczyn cech:
  pary: z topologii (zawieranie stref) × wskazane (zgodne / sprzeczne / bez oceny) ×
        niejednoznaczne (dwie strefy minimalne),
  porównanie punktu: (t_pod ∈ {brak, liczba}) × (t_nad ∈ {brak, liczba}) ×
        odstęp ∈ {≥ CTI, < CTI, ujemny} → stan pary (fakt: kto zadziała) i liczby,
  kryteria: czułość / przeciążalność / selektywność × wartość wymagana z konfiguracji —
        liczby obok wartości wymaganej, BEZ werdyktu (zakaz P-06),
  wejście: model bez zabezpieczeń, sieć zmieniona od biegu, rodzaj zwarcia 1F, bieg rozpływu
        niewłaściwy, urządzenie z odmową, bezpiecznik bez pasma, determinizm, ślad White Box.
Sieć: G08 (``tests/golden/enm_builders/zabezpieczenia_magistrali``) — urządzenia zapisane
operacjami domenowymi, prądy przekaźników z biegów MAX/MIN.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any
from uuid import uuid4

import pytest
from application.analyses.protection.coordination.analyzer import (
    KOD_BRAK_PASMA_BEZPIECZNIKA,
    OvercurrentCoordinationAnalyzer,
    _klucz_najmniejszego_odstepu,
    _podsumowanie,
    _porownanie,
    pary_jawne,
    pary_z_topologii,
)
from application.analyses.protection.coordination.models import (
    CoordinationConfig,
    ParaSelektywnosci,
)
from application.analyses.protection.coordination.z_biegow import (
    OdmowaKoordynacji,
    _rodzaj_zwarcia,
    koordynacja_z_biegow,
)
from domain.protection_device import (
    STAN_PARY_PL,
    OverloadCheck,
    SelectivityCheck,
    SensitivityCheck,
    StanPary,
)
from enm.canonical_analysis import create_run, execute_run, reset_canonical_runs
from enm.domain_operations import execute_domain_operation
from enm.models import EnergyNetworkModel
from enm.store import get_enm, reset_enm_store, set_enm

from tests.golden.enm_builders.zabezpieczenia_magistrali import (
    NAZWA_ZABEZPIECZENIA_Q1,
    NAZWA_ZABEZPIECZENIA_Q2,
    build_zabezpieczenia_magistrali_enm,
    siec_magistrali,
)

KLUCZ = "case-koordynacja"


def _biegi_modelu(model: EnergyNetworkModel) -> dict[str, str]:
    reset_canonical_runs()
    reset_enm_store()
    set_enm(KLUCZ, model)
    ids: dict[str, str] = {}
    for nazwa, rodzaj, opcje in (
        ("max", "short_circuit_sn", None),
        ("min", "short_circuit_sn", {"scenario": "min"}),
        ("pf", "PF", None),
    ):
        bieg = execute_run(
            create_run(case_id=KLUCZ, klucz_twin=KLUCZ, analysis_type=rodzaj, options=opcje).id
        )
        assert bieg.status == "FINISHED", bieg.error_message
        ids[nazwa] = str(bieg.id)
    return ids


def _koordynuj(
    ids: dict[str, str],
    *,
    config: CoordinationConfig | None = None,
    pary: list[tuple[str, str]] | None = None,
    pf: bool = True,
) -> dict[str, Any]:
    return koordynacja_z_biegow(
        model=get_enm(KLUCZ),
        project_id="projekt",
        sc_run_id=ids["max"],
        sc_run_id_min=ids["min"],
        pf_run_id=ids["pf"] if pf else None,
        pary_wskazane=pary,
        config=config or CoordinationConfig(),
    ).to_dict()


@pytest.fixture()
def biegi() -> Iterator[dict[str, str]]:
    ids = _biegi_modelu(build_zabezpieczenia_magistrali_enm())
    yield ids
    reset_canonical_runs()
    reset_enm_store()


def _refy() -> tuple[str, str]:
    model = get_enm(KLUCZ)
    nazwy = {p.name: p.ref_id for p in model.protection_assignments}
    return nazwy[NAZWA_ZABEZPIECZENIA_Q1], nazwy[NAZWA_ZABEZPIECZENIA_Q2]


# ---------------------------------------------------------------------------
# Pary stopniowania — jeden predykat (zawieranie stref) dla topologii i wskazań
# ---------------------------------------------------------------------------


def test_pary_z_topologii_szereg_trzech_urzadzen_daje_pary_bezposrednie() -> None:
    strefy = {
        "A": frozenset({"1", "2", "3", "4"}),
        "B": frozenset({"2", "3", "4"}),
        "C": frozenset({"4"}),
    }
    pary, odmowy = pary_z_topologii(strefy)
    assert [(p.nadrzedne_ref, p.podrzedne_ref) for p in pary] == [("A", "B"), ("B", "C")]
    assert odmowy == ()


def test_pary_z_topologii_strefy_rozlaczne_bez_par() -> None:
    pary, odmowy = pary_z_topologii({"A": frozenset({"1"}), "B": frozenset({"2"})})
    assert pary == () and odmowy == ()


def test_pary_z_topologii_dwie_strefy_minimalne_to_odmowa_z_kandydatami() -> None:
    strefy = {
        "A": frozenset({"1", "2", "3"}),
        "B": frozenset({"1", "2", "4"}),
        "C": frozenset({"1"}),
    }
    pary, odmowy = pary_z_topologii(strefy)
    assert pary == ()
    assert odmowy[0]["kod"] == "para_niejednoznaczna"
    assert odmowy[0]["kandydaci_nadrzedne"] == ["A", "B"]


@pytest.mark.parametrize(
    ("wskazanie", "kod"),
    [
        (("B", "A"), "para_sprzeczna_z_topologia"),
        (("A", "X"), "para_bez_oceny"),
        (("A", "A"), "para_sprzeczna_z_topologia"),
    ],
)
def test_pary_jawne_sprawdzane_tym_samym_predykatem(wskazanie: tuple[str, str], kod: str) -> None:
    strefy = {"A": frozenset({"1", "2"}), "B": frozenset({"2"})}
    pary, odmowy = pary_jawne([wskazanie], strefy)
    assert pary == ()
    assert odmowy[0]["kod"] == kod


def test_pary_jawne_zgodne_z_topologia_rowne_parom_z_topologii() -> None:
    strefy = {"A": frozenset({"1", "2", "3"}), "B": frozenset({"2", "3"}), "C": frozenset({"3"})}
    z_topologii, _ = pary_z_topologii(strefy)
    jawne, odmowy = pary_jawne([("A", "B"), ("B", "C")], strefy)
    assert odmowy == ()
    assert jawne == z_topologii


# ---------------------------------------------------------------------------
# Porównanie punktu: iloczyn (t_pod, t_nad, odstęp)
# ---------------------------------------------------------------------------


class _Ocena:
    def __init__(self, t: float | None, prad: float) -> None:
        self.t_zadzialania_s = t
        self.prad_przekaznika_a = prad
        self.punkt_ref = "P"
        self.nazwa_punktu_pl = "Szyna P"


@pytest.mark.parametrize(
    ("t_pod", "t_nad", "stan", "margines"),
    [
        (None, None, StanPary.ZADNE_NIE_ZADZIALA, None),
        (None, 0.5, StanPary.PODRZEDNE_NIE_ZADZIALA, None),
        (0.1, None, StanPary.NADRZEDNE_NIE_POBUDZA, None),
        (0.1, 0.4, StanPary.ODSTEP, 0.3),
        (0.1, 0.22, StanPary.ODSTEP, 0.12),
        (0.3, 0.2, StanPary.ODSTEP, -0.1),
    ],
)
def test_porownanie_punktu_iloczyn_cech(
    t_pod: float | None,
    t_nad: float | None,
    stan: StanPary,
    margines: float | None,
) -> None:
    """Iloczyn {kto zadziała} × {odstęp powyżej / poniżej wymaganego / ujemny}: rekord niesie
    FAKT (stan pary) i liczby, bez werdyktu (P-06) — także odstęp mniejszy od wymaganego
    albo ujemny nie jest nazwany „nieskoordynowane", tylko pokazany liczbą obok wymaganej."""
    para = ParaSelektywnosci(nadrzedne_ref="nad", podrzedne_ref="pod")
    wynik = _porownanie(para, _Ocena(t_pod, 1000.0), _Ocena(t_nad, 1001.0), 0.2)  # type: ignore[arg-type]
    assert wynik.stan is stan
    assert not hasattr(wynik, "verdict")
    slownik = wynik.to_dict()
    assert slownik["stan_pl"] == STAN_PARY_PL[stan.value]
    assert not {"verdict", "verdict_pl"} & set(slownik)
    if margines is None:
        assert wynik.margin_s is None
    else:
        assert wynik.margin_s == pytest.approx(margines, abs=1e-9)
    # Rekord sprawdzenia niesie liczby obu stron i zdanie uzasadnienia z punktem po nazwie.
    assert (wynik.t_downstream_s, wynik.t_upstream_s) == (t_pod, t_nad)
    assert (wynik.analysis_current_a, wynik.i_upstream_a) == (1000.0, 1001.0)
    assert (wynik.upstream_device_id, wynik.downstream_device_id) == ("nad", "pod")
    assert wynik.punkt_ref == "P" and wynik.required_margin_s == 0.2
    assert "Szyna P" in wynik.notes_pl
    assert "wymagany co najmniej 0,2 s" in wynik.notes_pl or margines is None
    assert "Δ" not in wynik.notes_pl
    for slowo in ("zachowana", "niezachowana", "prawidłow", "na granicy"):
        assert slowo not in wynik.notes_pl


# ---------------------------------------------------------------------------
# Koordynacja na sieci G08
# ---------------------------------------------------------------------------


def test_koordynacja_urzadzen_modelu_komplet_sprawdzen(biegi: dict[str, str]) -> None:
    q1, q2 = _refy()
    wynik = _koordynuj(biegi)
    assert "overall_verdict" not in wynik
    assert {d["id"] for d in wynik["devices"]} == {q1, q2}
    assert wynik["pary"] == [{"nadrzedne_ref": q1, "podrzedne_ref": q2}]
    (selektywnosc,) = wynik["selectivity_checks"]
    assert selektywnosc["t_downstream_s"] == pytest.approx(0.1)
    assert selektywnosc["t_upstream_s"] == pytest.approx(0.4)
    assert selektywnosc["margin_s"] == pytest.approx(0.3)
    assert selektywnosc["required_margin_s"] == pytest.approx(0.2)
    assert selektywnosc["stan"] == "ODSTEP"
    assert selektywnosc["nazwa_punktu_pl"] == "Stacja S02"
    czulosc = {c["device_id"]: c for c in wynik["sensitivity_checks"]}
    assert czulosc[q2]["i_pickup_a"] == pytest.approx(180.0)
    assert czulosc[q1]["i_pickup_a"] == pytest.approx(240.0)
    for c in czulosc.values():
        assert c["ratio"] == pytest.approx(c["i_fault_min_a"] / c["i_pickup_a"], rel=1e-6)
        assert c["required_ratio"] == pytest.approx(1.5)
    for c in wynik["overload_checks"]:
        assert c["ratio"] == pytest.approx(c["i_pickup_a"] / c["i_operating_a"], rel=1e-6)
        assert c["required_ratio"] == pytest.approx(1.2)
    for rodzaj in ("sensitivity_checks", "selectivity_checks", "overload_checks"):
        assert all("verdict" not in c for c in wynik[rodzaj])
    podsumowanie = wynik["summary"]
    assert podsumowanie["kryteria"]["minimum_grading_margin_s"] == pytest.approx(0.2)
    assert podsumowanie["selectivity"]["najmniejszy_odstep_s"] == pytest.approx(0.3)
    assert podsumowanie["sensitivity"]["najmniejszy_iloraz"] == pytest.approx(
        min(c["ratio"] for c in czulosc.values())
    )
    assert not {"pass", "fail", "marginal", "error"} & set(podsumowanie["selectivity"])


@pytest.mark.parametrize("safety_factor_s", [0.1, 0.16, 0.25])
def test_selektywnosc_wymagany_odstep_z_kryteriow(
    biegi: dict[str, str], safety_factor_s: float
) -> None:
    """Odstęp Q1–Q2 w S02 = 0,3 s niezależnie od kryteriów; wymagany = CTI = 0,1 + zapas
    (0,2 / 0,26 / 0,35 s) — liczba obok liczby, także gdy odstęp jest mniejszy od wymaganego
    (zapas 0,25 s), bez werdyktu."""
    wynik = _koordynuj(biegi, config=CoordinationConfig(safety_factor_s=safety_factor_s))
    (sprawdzenie,) = wynik["selectivity_checks"]
    assert sprawdzenie["margin_s"] == pytest.approx(0.3)
    assert sprawdzenie["required_margin_s"] == pytest.approx(0.1 + safety_factor_s)
    assert "verdict" not in sprawdzenie
    assert wynik["summary"]["kryteria"]["minimum_grading_margin_s"] == pytest.approx(
        0.1 + safety_factor_s
    )


@pytest.mark.parametrize("wymagany", [1.5, 40.0, 60.0])
def test_czulosc_wymagany_iloraz_z_kryteriow(biegi: dict[str, str], wymagany: float) -> None:
    """Q2: I_min ≈ 7970 A / 180 A ≈ 44,3 — iloraz z biegu minimalnego niezależny od kryterium,
    wymagany z konfiguracji (także powyżej ilorazu), bez werdyktu."""
    _q1, q2 = _refy()
    wynik = _koordynuj(biegi, config=CoordinationConfig(sensitivity_ratio_required=wymagany))
    czulosc = {c["device_id"]: c for c in wynik["sensitivity_checks"]}
    assert czulosc[q2]["ratio"] == pytest.approx(44.3, abs=0.1)
    assert czulosc[q2]["required_ratio"] == wymagany
    assert czulosc[q2]["nazwa_punktu_pl"] == "Stacja S02"
    assert "verdict" not in czulosc[q2]


def test_przeciazalnosc_bez_biegu_rozplywu_to_nazwany_brak(biegi: dict[str, str]) -> None:
    wynik = _koordynuj(biegi, pf=False)
    assert all(c["ratio"] is None for c in wynik["overload_checks"])
    assert all(c["i_operating_a"] is None for c in wynik["overload_checks"])
    assert all("rozpływu" in c["notes_pl"] for c in wynik["overload_checks"])
    podsumowanie = wynik["summary"]["overload"]
    assert podsumowanie["najmniejszy_iloraz"] is None
    assert podsumowanie["bez_wartosci"] == len(wynik["overload_checks"])


def test_pary_wskazane_sprzeczne_nie_daja_sprawdzenia(biegi: dict[str, str]) -> None:
    q1, q2 = _refy()
    wynik = _koordynuj(biegi, pary=[(q2, q1)])
    assert wynik["selectivity_checks"] == []
    assert wynik["odmowy_par"][0]["kod"] == "para_sprzeczna_z_topologia"


def test_krzywe_tcc_z_jednej_sciezki_czasu(biegi: dict[str, str]) -> None:
    from application.analyses.protection.ocena_nadpradowa import czas_urzadzenia, rozwiaz_nastawy

    wynik = _koordynuj(biegi)
    model = get_enm(KLUCZ)
    for krzywa in wynik["tcc_curves"]:
        przypisanie = next(
            p for p in model.protection_assignments if p.ref_id == krzywa["device_id"]
        )
        nastawy = rozwiaz_nastawy(model, przypisanie)
        assert len(krzywa["points"]) == 60
        for punkt in krzywa["points"]:
            _slady, decydujacy = czas_urzadzenia(nastawy.stopnie, punkt["current_a"])
            assert decydujacy is not None
            assert punkt["time_s"] == pytest.approx(decydujacy["t_s"], abs=1e-9)
        czasy = [p["time_s"] for p in krzywa["points"]]
        assert czasy == sorted(czasy, reverse=True)


def test_znaczniki_tylko_dla_punktow_stref(biegi: dict[str, str]) -> None:
    wynik = _koordynuj(biegi)
    etykiety = sorted(m["label_pl"] for m in wynik["fault_markers"])
    assert etykiety == [
        "Ik'' max 3F (Stacja S01)",
        "Ik'' max 3F (Stacja S02)",
        "Ik'' min 3F (Stacja S01)",
        "Ik'' min 3F (Stacja S02)",
    ]


def test_determinizm(biegi: dict[str, str]) -> None:
    def bez_tozsamosci(wynik: dict[str, Any]) -> dict[str, Any]:
        return {k: v for k, v in wynik.items() if k not in {"run_id", "created_at"}}

    assert bez_tozsamosci(_koordynuj(biegi)) == bez_tozsamosci(_koordynuj(biegi))


def test_slad_white_box_po_polsku(biegi: dict[str, str]) -> None:
    kroki = _koordynuj(biegi)["trace_steps"]
    rodzaje = {k["step"] for k in kroki}
    assert {"urzadzenia_z_modelu", "czulosc", "przeciazalnosc", "selektywnosc", "krzywe_tcc"} <= (
        rodzaje
    )
    assert all(k["description_pl"] for k in kroki)


def test_model_bez_zabezpieczen_odmowa_nazwana() -> None:
    enm, _a, _b = siec_magistrali()
    ids = _biegi_modelu(EnergyNetworkModel.model_validate(enm))
    with pytest.raises(OdmowaKoordynacji) as odmowa:
        _koordynuj(ids)
    assert odmowa.value.powod == "BRAK_ZABEZPIECZEN_W_MODELU"


def test_zmiana_sieci_po_biegu_odmowa(biegi: dict[str, str]) -> None:
    dane = get_enm(KLUCZ).model_dump(mode="json")
    kabel = next(g["ref_id"] for g in dane["branches"] if g["type"] == "cable")
    wynik = execute_domain_operation(
        dane,
        "update_element_parameters",
        {"element_ref": kabel, "parameters": {"length_km": 3.0, "parameter_source": "CATALOG"}},
    )
    assert wynik.get("error") is None
    set_enm(KLUCZ, EnergyNetworkModel.model_validate(wynik["snapshot"]))
    with pytest.raises(OdmowaKoordynacji) as odmowa:
        _koordynuj(biegi)
    assert odmowa.value.powod == "SIEC_ZMIENIONA_OD_BIEGU"


def test_edycja_nastaw_po_biegu_liczy_na_nowych_nastawach(biegi: dict[str, str]) -> None:
    """Nastawy Q2 z czasem 0,35 s (DT) po biegach — odstęp do Q1 (0,4 s) spada do 0,05 s."""
    _q1, q2 = _refy()
    wynik = execute_domain_operation(
        get_enm(KLUCZ).model_dump(mode="json"),
        "update_protection_settings",
        {
            "protection_ref": q2,
            "settings": [
                {
                    "function_type": "overcurrent_50",
                    "threshold_a": 15.0,
                    "threshold_unit": "A_WTORNY",
                    "curve_type": "DT",
                    "time_delay_s": 0.35,
                }
            ],
        },
    )
    assert wynik.get("error") is None, wynik.get("error")
    set_enm(KLUCZ, EnergyNetworkModel.model_validate(wynik["snapshot"]))
    selektywnosc = _koordynuj(biegi)["selectivity_checks"][0]
    assert selektywnosc["margin_s"] == pytest.approx(0.05)
    assert selektywnosc["required_margin_s"] == pytest.approx(0.2)
    assert selektywnosc["stan"] == "ODSTEP"


def test_urzadzenie_z_odmowa_widoczne_jako_brak_oceny(biegi: dict[str, str]) -> None:
    """Q2 bez jednostki progu (nastawa niekompletna) — czułość bez ilorazu z brakami, bez pary."""
    _q1, q2 = _refy()
    wynik = execute_domain_operation(
        get_enm(KLUCZ).model_dump(mode="json"),
        "update_protection_settings",
        {"protection_ref": q2, "settings": [{"function_type": "overcurrent_51"}]},
    )
    assert wynik.get("error") is None, wynik.get("error")
    set_enm(KLUCZ, EnergyNetworkModel.model_validate(wynik["snapshot"]))
    koordynacja = _koordynuj(biegi)
    czulosc = {c["device_id"]: c for c in koordynacja["sensitivity_checks"]}
    assert czulosc[q2]["ratio"] is None
    assert czulosc[q2]["i_pickup_a"] is None
    assert "próg" in czulosc[q2]["notes_pl"].lower()
    assert koordynacja["selectivity_checks"] == []
    assert koordynacja["odmowy_urzadzen"][0]["urzadzenie_ref"] == q2
    assert koordynacja["summary"]["sensitivity"]["bez_wartosci"] == 1


@pytest.mark.parametrize("rodzaj", ["1F", "2F+Z", None])
def test_rodzaj_zwarcia_inny_niz_miedzyfazowy_odmowa(rodzaj: str | None) -> None:
    class _Bieg:
        raw_result = {"short_circuit_type": rodzaj}

    with pytest.raises(OdmowaKoordynacji) as odmowa:
        _rodzaj_zwarcia(_Bieg(), "maksymalny")
    assert odmowa.value.powod == "RODZAJ_ZWARCIA_NIEWLASCIWY"


def test_bieg_rozplywu_innego_rodzaju_odmowa(biegi: dict[str, str]) -> None:
    with pytest.raises(OdmowaKoordynacji) as odmowa:
        koordynacja_z_biegow(
            model=get_enm(KLUCZ),
            project_id="projekt",
            sc_run_id=biegi["max"],
            sc_run_id_min=biegi["min"],
            pf_run_id=biegi["max"],
            pary_wskazane=None,
            config=CoordinationConfig(),
        )
    assert odmowa.value.powod == "BIEG_ROZPLYWU_NIEMIARODAJNY"
    with pytest.raises(OdmowaKoordynacji) as brak:
        koordynacja_z_biegow(
            model=get_enm(KLUCZ),
            project_id="projekt",
            sc_run_id=biegi["max"],
            sc_run_id_min=biegi["min"],
            pf_run_id=str(uuid4()),
            pary_wskazane=None,
            config=CoordinationConfig(),
        )
    assert brak.value.powod == "BIEG_ROZPLYWU_NIEMIARODAJNY"


def test_bezpiecznik_bez_pasma_ma_pozycje_tcc_bez_punktow(biegi: dict[str, str]) -> None:
    """Bezpiecznik modelu nie dostaje krzywej przekaźnikowej — pozycja TCC bez punktów,
    próg i TMS ``None`` (bezpiecznik ich nie ma), powód po polsku."""
    from uuid import UUID

    from application.analyses.protection.coordination.models import CoordinationInput
    from enm.canonical_analysis import get_run, ocen_zabezpieczenia_biegu

    model = get_enm(KLUCZ)
    bieg = get_run(UUID(biegi["max"]))
    ocena = ocen_zabezpieczenia_biegu(model, bieg)
    wejscie = CoordinationInput(
        ocena_max=ocena,
        ocena_min=ocena,
        pary=(),
        odmowy_par=(),
        prady_robocze={},
        prady_punktow_max={},
        prady_punktow_min={},
        rodzaj_zwarcia_max="3F",
        rodzaj_zwarcia_min="3F",
        bezpieczniki=(
            {"id": "F1", "name": "Bezpiecznik F1", "device_type": "FUSE", "nastawy": None},
        ),
        config=CoordinationConfig(),
        project_id="p",
        sc_run_id=biegi["max"],
        sc_run_id_min=biegi["max"],
    )
    wynik = OvercurrentCoordinationAnalyzer(config=CoordinationConfig()).analyze(wejscie).to_dict()
    bezpiecznik = next(k for k in wynik["tcc_curves"] if k["device_id"] == "F1")
    assert bezpiecznik["points"] == []
    assert bezpiecznik["podstawa_kod"] == KOD_BRAK_PASMA_BEZPIECZNIKA
    assert bezpiecznik["pickup_current_a"] is None and bezpiecznik["time_multiplier"] is None
    assert "IEC 60282-1" in bezpiecznik["powod_pl"]
    assert not any(c["device_id"] == "F1" for c in wynik["sensitivity_checks"])


# ---------------------------------------------------------------------------
# Liczby zbiorcze i punkt pary — bez werdyktu (P-06)
# ---------------------------------------------------------------------------


def _selektywnosc(stan: StanPary, margines: float | None, punkt: str) -> SelectivityCheck:
    return SelectivityCheck(
        upstream_device_id="nad",
        downstream_device_id="pod",
        analysis_current_a=1000.0,
        t_upstream_s=None,
        t_downstream_s=None,
        margin_s=margines,
        required_margin_s=0.3,
        stan=stan,
        notes_pl=f"punkt {punkt}",
        punkt_ref=punkt,
    )


def _czulosc(iloraz: float | None) -> SensitivityCheck:
    return SensitivityCheck("u", 900.0, 300.0, iloraz, None, 1.5, "czułość")


def _przeciazalnosc(iloraz: float | None) -> OverloadCheck:
    return OverloadCheck("u", 100.0, 300.0, iloraz, None, 1.2, "przeciążalność")


S = StanPary


@pytest.mark.parametrize(
    ("czulosc", "odstepy", "przeciazalnosc"),
    [
        ([], [], []),
        ([3.0, None], [(S.ODSTEP, 0.4), (S.ODSTEP, 0.25)], [2.0]),
        ([None], [(S.PODRZEDNE_NIE_ZADZIALA, None)], [None, None]),
        ([1.1, 0.7], [(S.ODSTEP, -0.1), (S.NADRZEDNE_NIE_POBUDZA, None)], [0.9, 5.0]),
    ],
    ids=["bez_sprawdzen", "komplet_z_brakiem", "same_braki", "wartosci_ponizej_wymaganych"],
)
def test_podsumowanie_to_liczby_bez_werdyktu_ogolnego(
    czulosc: list[float | None],
    odstepy: list[tuple[StanPary, float | None]],
    przeciazalnosc: list[float | None],
) -> None:
    """Iloczyn {liczba sprawdzeń} × {wartość: jest, brak} × {powyżej, poniżej wymaganej}:
    podsumowanie niesie najmniejsze wartości i liczbę sprawdzeń bez wartości — nigdy
    werdyktu ogólnego ani liczników „prawidłowe / nieprawidłowe" (P-06)."""
    sprawdzenia_c = [_czulosc(w) for w in czulosc]
    sprawdzenia_s = [_selektywnosc(st, m, f"p{i}") for i, (st, m) in enumerate(odstepy)]
    sprawdzenia_p = [_przeciazalnosc(w) for w in przeciazalnosc]
    wynik = _podsumowanie([], sprawdzenia_c, sprawdzenia_s, sprawdzenia_p)

    def najmniejsza(wartosci: list[float | None]) -> float | None:
        liczby = [w for w in wartosci if w is not None]
        return min(liczby) if liczby else None

    assert wynik["sensitivity"] == {
        "sprawdzenia": len(czulosc),
        "najmniejszy_iloraz": najmniejsza(czulosc),
        "bez_wartosci": czulosc.count(None),
    }
    assert wynik["selectivity"] == {
        "sprawdzenia": len(odstepy),
        "najmniejszy_odstep_s": najmniejsza([m for _s, m in odstepy]),
        "bez_odstepu": sum(1 for _s, m in odstepy if m is None),
    }
    assert wynik["overload"] == {
        "sprawdzenia": len(przeciazalnosc),
        "najmniejszy_iloraz": najmniejsza(przeciazalnosc),
        "bez_wartosci": przeciazalnosc.count(None),
    }
    assert "overall_verdict" not in wynik and "overall_verdict_pl" not in wynik


@pytest.mark.parametrize(
    ("punkty", "oczekiwany"),
    [
        # Rozstrzyga najmniejszy odstęp.
        ([(S.ODSTEP, 0.5, "a"), (S.ODSTEP, 0.35, "b")], "b"),
        # Nadrzędne się nie pobudza — nie ogranicza pary, ustępuje punktowi z odstępem.
        ([(S.NADRZEDNE_NIE_POBUDZA, None, "a"), (S.ODSTEP, 0.4, "b")], "b"),
        # Podrzędne nie zadziała (samo albo z nadrzędnym) — mniejszego odstępu nie ma.
        ([(S.ODSTEP, -0.3, "a"), (S.PODRZEDNE_NIE_ZADZIALA, None, "b")], "b"),
        ([(S.ODSTEP, 0.1, "a"), (S.ZADNE_NIE_ZADZIALA, None, "b")], "b"),
        ([(S.NADRZEDNE_NIE_POBUDZA, None, "a"), (S.ZADNE_NIE_ZADZIALA, None, "b")], "b"),
        # Ujemny odstęp jest mniejszy od każdego dodatniego.
        ([(S.ODSTEP, 0.25, "a"), (S.ODSTEP, -0.05, "b")], "b"),
        # Remis odstępu — kolejność deterministyczna po punkcie.
        ([(S.ODSTEP, 0.4, "b"), (S.ODSTEP, 0.4, "a")], "a"),
    ],
)
def test_punkt_pary_o_najmniejszym_odstepie(
    punkty: list[tuple[StanPary, float | None, str]], oczekiwany: str
) -> None:
    sprawdzenia = [_selektywnosc(st, m, p) for st, m, p in punkty]
    assert min(sprawdzenia, key=_klucz_najmniejszego_odstepu).punkt_ref == oczekiwany
