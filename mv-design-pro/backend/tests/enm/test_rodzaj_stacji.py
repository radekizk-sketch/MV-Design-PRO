"""Rodzaj stacji z JEDNEJ reguły (karta ETYKIETA-STACJI-PRZELOTOWEJ, SLD_CAD_SPEC_V3 §19.3).

Pokrycie jako ILOCZYN CECH (reguła KLASA §2):
  * reguła czysta: liczba pól liniowych 0–4 × sprzęgło × połączone wyprowadzenia 0–2;
  * źródło kategorii pola: rola kanoniczna / katalogowa / modelu × rodzaj pola katalogowego
    (potrzeb własnych, rezerwowe, odgromnikowe — rola `FEEDER`, ale nie liniowe);
  * walidator: deklaracja zgodna / niezgodna / brak rodzaju (`mv_lv`) / GPZ — W043 wyłącznie
    przy niezgodności, z akcją naprawczą zmieniającą deklarację i bez identyfikatorów
    w tekście dla projektanta; W044 dla pola o roli nierozpoznanej;
  * operacje budowy stacji (wcięcie i koniec ciągu) × rola spoza słownika: jawna odmowa
    (dawniej wcięcie robiło z niej pole odgałęźne, koniec ciągu ją pomijał); deklaracja
    „końcowa" zapisywana tak samo w obu drogach; nazwa domyślna bez kodu rodzaju;
  * zmiana deklaracji operacją `update_element_parameters` (akcja naprawcza) — dozwolona
    w obrębie stacji SN/nN, odmowa dla GPZ i rozdzielnicy nN;
  * operacja katalogowa pola zapisuje rodzaj pola — pole potrzeb własnych nie zmienia rodzaju;
  * szablony stacji: deklaracja ze składu pól tą samą regułą; katalog szablonów
    `network_model/catalog/station_templates.py` spójny z regułą;
  * kwalifikacja pętli zwarcia nN i zgodność OSD rozpoznają stację SN/nN po każdej deklaracji
    stacji SN/nN, nie tylko `mv_lv`;
  * plik parytetu frontu bajtowo równy generatorowi.
"""

from __future__ import annotations

import copy
import itertools
from typing import Any

import pytest
from application.station_templates.apply import _resolve_station_type
from domain.canonical_operations import READINESS_CODES
from domain.readiness_bridge import ODWZOROWANIE_WALIDATOR_NA_KANON
from enm.domain_operations import execute_domain_operation
from enm.models import EnergyNetworkModel
from enm.rodzaj_stacji import (
    KOD_KANONICZNY_ROLA_POLA_NIEROZPOZNANA,
    KOD_KANONICZNY_RODZAJ_NIEZGODNY,
    KOD_WALIDATORA_ROLA_POLA_NIEROZPOZNANA,
    KOD_WALIDATORA_RODZAJ_NIEZGODNY,
    TYPY_STACJI_SN_NN,
    kategoria_pola,
    rodzaj_stacji,
    rodzaj_z_topologii,
    rodzaj_ze_skladu_pol,
    rodzaje_stacji,
)
from enm.validator import ENMValidator
from network_model.catalog.bay_templates import get_bay_template
from network_model.catalog.station_templates import STATION_TEMPLATE_REGISTRY
from network_model.catalog.switchgear.canonical_fallback import _CANONICAL_FALLBACK_MAPPING

from tests.enm.test_append_station_on_endpoint import _build_gpz_with_endpoint, op
from tests.reference_networks.rodzaj_stacji_parytet import (
    FRONTEND,
    KOMENDA_REGENERACJI,
    MODEL_ILOCZYNU,
    WYJSCIE,
    render_parytetu,
)

APARAT = "sw-cb-abb-vd4-17kv-630a"
TRAFO = "tr-sn-nn-15-04-630kva-dyn11"
NAZWA_PL = {
    "terminal": "końcowa",
    "inline": "przelotowa",
    "branch": "odgałęźna",
    "sectional": "sekcyjna",
}


# ---------------------------------------------------------------------------
# Reguła czysta
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("liniowe", "sprzeglo", "polaczone"),
    list(itertools.product(range(5), (False, True), range(3))),
)
def test_regula_iloczyn_pol_sprzegla_i_polaczen(
    liniowe: int, sprzeglo: bool, polaczone: int
) -> None:
    rodzaj = rodzaj_z_topologii(liniowe, sprzeglo, polaczone)
    if sprzeglo:
        assert rodzaj == "sectional"
    elif liniowe >= 3:
        assert rodzaj == "branch"
    elif liniowe == 2:
        assert rodzaj == ("inline" if polaczone >= 2 else "terminal")
    else:
        assert rodzaj == "terminal"


@pytest.mark.parametrize(
    ("spec", "kategoria"),
    [
        ({"meta": {"field_role": "LINIA_ODG"}, "bay_role": "TR"}, "liniowe"),
        ({"meta": {"field_role": "line_branch"}}, "liniowe"),
        ({"meta": {"field_role": "COS_INNEGO"}, "bay_role": "OUT"}, "liniowe"),
        ({"bay_role": " feeder "}, "liniowe"),
        ({"bay_role": "FEEDER", "bay_kind": "potrzeb_wlasnych"}, "inne"),
        ({"bay_role": "FEEDER", "meta": {"bay_kind": "Rezerwowe"}}, "inne"),
        ({"bay_role": "FEEDER", "bay_kind": "odgromnikowe"}, "inne"),
        ({"bay_role": "FEEDER", "bay_kind": "liniowe_odplywowe"}, "liniowe"),
        ({"bay_role": "COUPLER"}, "sprzeglo"),
        ({"meta": {"field_role": "SPRZEGLO"}}, "sprzeglo"),
        ({"bay_role": "OZE", "meta": {"field_role": "PV_SN"}}, "inne"),
        ({"bay_role": "MEASUREMENT"}, "inne"),
        ({"bay_role": "XYZ"}, None),
        ({}, None),
    ],
)
def test_kategoria_pola(spec: dict[str, Any], kategoria: str | None) -> None:
    assert kategoria_pola(spec) == kategoria


def test_model_iloczynu_cech_rodzaje() -> None:
    wynik = {ref: r.rodzaj for ref, r in rodzaje_stacji(MODEL_ILOCZYNU).items()}
    assert wynik == {
        "A1": "branch",
        "C1": "terminal",
        "K1": "terminal",
        "L1": "branch",
        "N1": "inline",
        "O1": "branch",
        "O2": "branch",
        "P1": "inline",
        "P2": "terminal",
        "S1": "sectional",
        "S2": "sectional",
        "W1": "terminal",
    }
    # GPZ i rozdzielnica nN — rodzaj nie dotyczy.
    assert rodzaj_stacji(MODEL_ILOCZYNU, "G") is None
    assert rodzaj_stacji(MODEL_ILOCZYNU, "R") is None


def test_regula_nie_zalezy_od_deklaracji_ani_kolejnosci_galezi() -> None:
    bazowy = {ref: r.rodzaj for ref, r in rodzaje_stacji(MODEL_ILOCZYNU).items()}
    for deklaracja in ("inline", "branch", "terminal", "sectional", "mv_lv", "customer"):
        model = copy.deepcopy(MODEL_ILOCZYNU)
        for stacja in model["substations"]:
            if stacja.get("station_type") not in ("gpz", "rozdzielnica_nn"):
                stacja["station_type"] = deklaracja
        model["branches"] = list(reversed(model["branches"]))
        assert {ref: r.rodzaj for ref, r in rodzaje_stacji(model).items()} == bazowy


# ---------------------------------------------------------------------------
# Budowa przez operacje domenowe
# ---------------------------------------------------------------------------


def _siec_z_odcinkiem() -> tuple[dict[str, Any], str]:
    """GPZ — odcinek — „Stacja Końcowa" (na końcu ciągu): stacja wcięta w odcinek ma OBA pola
    liniowe połączone ze stacjami (GPZ i „Stacja Końcowa")."""
    snap, koniec = _build_gpz_with_endpoint()
    snap = op(
        snap,
        "append_station_on_endpoint",
        {
            "endpoint_bus_ref": koniec,
            "field_apparatus_catalog_ref": APARAT,
            "station": {"name": "Stacja Końcowa", "station_type": "terminal"},
            "nn_voltage_kv": 0.4,
        },
    )
    return snap, snap["corridors"][0]["ordered_segment_refs"][-1]


def _wstaw(
    snap: dict[str, Any], odcinek: str, typ: str, pola: list[str], **stacja: Any
) -> dict[str, Any]:
    return execute_domain_operation(
        snap,
        "insert_station_on_segment_sn",
        {
            "segment_id": odcinek,
            "field_apparatus_catalog_ref": APARAT,
            "insert_at": {"mode": "RATIO", "value": 0.5},
            "station": {"station_type": typ, "sn_voltage_kv": 15.0, "nn_voltage_kv": 0.4, **stacja},
            "nn_earthing": {"lv_system": "TN-C-S"},
            "sn_fields": [{"field_role": r} for r in pola],
            "transformer": {"create": True, "transformer_catalog_ref": TRAFO},
            "nn_block": {"outgoing_feeders_nn_count": 1},
        },
    )


def _problemy(snap: dict[str, Any]) -> list[Any]:
    return ENMValidator().validate(EnergyNetworkModel.model_validate(snap)).issues


def _stacja_pola(snap: dict[str, Any]) -> dict[str, Any]:
    """Stacja wstawiona przez test (nie GPZ i nie „Stacja Końcowa" sceny)."""
    return next(
        s
        for s in snap["substations"]
        if s["station_type"] != "gpz" and s.get("name") != "Stacja Końcowa"
    )


@pytest.mark.parametrize("rola", ["PV_SN", "BESS_SN", "OZE", "XYZ", ""])
def test_wciecie_odmawia_roli_spoza_slownika(rola: str) -> None:
    snap, odcinek = _siec_z_odcinkiem()
    wynik = _wstaw(snap, odcinek, "B", ["LINIA_IN", "LINIA_OUT", rola, "TRANSFORMATOROWE"])
    assert wynik.get("error_code") == "station.insert.field_role_invalid"
    assert "słownika ról pól" in wynik["error"]


@pytest.mark.parametrize("rola", ["PV_SN", "OZE", "XYZ"])
def test_koniec_ciagu_odmawia_roli_spoza_slownika(rola: str) -> None:
    snap, koniec = _build_gpz_with_endpoint()
    wynik = execute_domain_operation(
        snap,
        "append_station_on_endpoint",
        {
            "endpoint_bus_ref": koniec,
            "field_apparatus_catalog_ref": APARAT,
            "station": {"name": "Stacja X", "station_type": "terminal"},
            "nn_voltage_kv": 0.4,
            "sn_fields": [{"field_role": "LINIA_IN"}, {"field_role": rola}],
        },
    )
    assert wynik.get("error_code") == "station.append.field_role_invalid"


def test_deklaracja_koncowa_zapisywana_tak_samo_w_obu_drogach() -> None:
    snap, odcinek = _siec_z_odcinkiem()
    for typ in ("A", "terminal"):
        wynik = _wstaw(copy.deepcopy(snap), odcinek, typ, ["LINIA_IN", "TRANSFORMATOROWE"])
        assert not wynik.get("error"), wynik.get("error")
        stacja = _stacja_pola(wynik["snapshot"])
        assert stacja["station_type"] == "terminal"
        assert "station_type_sn" not in stacja["meta"]
        assert "station_type_semantic" not in stacja["meta"]
    snap2, koniec = _build_gpz_with_endpoint()
    for typ in ("A", "terminal", "mv_lv"):
        stan = op(
            copy.deepcopy(snap2),
            "append_station_on_endpoint",
            {
                "endpoint_bus_ref": koniec,
                "field_apparatus_catalog_ref": APARAT,
                "station": {"name": "Stacja K", "station_type": typ},
                "nn_voltage_kv": 0.4,
            },
        )
        stacja = _stacja_pola(stan)
        assert stacja["station_type"] == ("mv_lv" if typ == "mv_lv" else "terminal")
        assert "station_type_semantic" not in stacja["meta"]


def test_nazwa_domyslna_bez_kodu_rodzaju() -> None:
    snap, odcinek = _siec_z_odcinkiem()
    wynik = _wstaw(snap, odcinek, "inline", ["LINIA_IN", "LINIA_OUT", "TRANSFORMATOROWE"])
    assert _stacja_pola(wynik["snapshot"])["name"] == "Stacja S01"
    # Druga stacja bez nazwy — kolejny wolny kod, nadal bez kodu rodzaju.
    stan = wynik["snapshot"]
    odcinek2 = stan["corridors"][0]["ordered_segment_refs"][0]
    wynik2 = _wstaw(stan, odcinek2, "branch", ["LINIA_IN", "LINIA_OUT", "LINIA_ODG"])
    nazwy = sorted(s["name"] for s in wynik2["snapshot"]["substations"] if s["station_type"] != "gpz")
    assert nazwy == ["Stacja Końcowa", "Stacja S01", "Stacja S02"]


@pytest.mark.parametrize(
    ("typ", "pola", "rodzaj", "ostrzezenie"),
    [
        # Sytuacja kadru karty: deklaracja przelotowa, 3 pola liniowe.
        ("inline", ["LINIA_IN", "LINIA_OUT", "LINIA_ODG", "TRANSFORMATOROWE"], "branch", True),
        ("branch", ["LINIA_IN", "LINIA_OUT", "LINIA_ODG", "TRANSFORMATOROWE"], "branch", False),
        # Wcięcie w odcinek łączy oba końce — deklaracja końcowa przy dwóch połączonych polach.
        ("terminal", ["LINIA_IN", "TRANSFORMATOROWE"], "inline", True),
        (
            "sectional",
            ["LINIA_IN", "LINIA_OUT", "SPRZEGLO", "TRANSFORMATOROWE"],
            "sectional",
            False,
        ),
    ],
)
def test_walidator_w043_tylko_przy_niezgodnosci(
    typ: str, pola: list[str], rodzaj: str, ostrzezenie: bool
) -> None:
    snap, odcinek = _siec_z_odcinkiem()
    wynik = _wstaw(snap, odcinek, typ, pola, station_name="Stacja Klonowa")
    assert not wynik.get("error"), wynik.get("error")
    stan = wynik["snapshot"]
    stacja = _stacja_pola(stan)
    assert rodzaj_stacji(stan, stacja["ref_id"]).rodzaj == rodzaj
    w043 = [i for i in _problemy(stan) if i.code == KOD_WALIDATORA_RODZAJ_NIEZGODNY]
    assert bool(w043) is ostrzezenie
    if ostrzezenie:
        (problem,) = w043
        assert problem.severity == "IMPORTANT"
        assert problem.element_refs == [stacja["ref_id"]]
        assert "Stacja „Stacja Klonowa”" in problem.message_pl
        assert f"z topologii wynika stacja {NAZWA_PL[rodzaj]}" in problem.message_pl
        # Tekst dla projektanta bez identyfikatorów maszynowych i kodów.
        for zakazany in ("stn/", "station_type", "inline", "branch", "terminal", "sectional"):
            assert zakazany not in problem.message_pl
            assert zakazany not in (problem.suggested_fix or "")
        assert problem.fix_action.modal_type == "update_element_parameters"
        assert problem.fix_action.payload_hint == {
            "element_ref": stacja["ref_id"],
            "field": "station_type",
            "value": rodzaj,
        }


def test_akcja_naprawcza_w043_zdejmuje_ostrzezenie() -> None:
    snap, odcinek = _siec_z_odcinkiem()
    stan = _wstaw(
        snap, odcinek, "inline", ["LINIA_IN", "LINIA_OUT", "LINIA_ODG", "TRANSFORMATOROWE"]
    )["snapshot"]
    (problem,) = [i for i in _problemy(stan) if i.code == KOD_WALIDATORA_RODZAJ_NIEZGODNY]
    hint = problem.fix_action.payload_hint
    po = op(
        stan,
        "update_element_parameters",
        {"element_ref": hint["element_ref"], "parameters": {hint["field"]: hint["value"]}},
    )
    assert _stacja_pola(po)["station_type"] == "branch"
    assert not [i for i in _problemy(po) if i.code == KOD_WALIDATORA_RODZAJ_NIEZGODNY]


def test_zmiana_deklaracji_tylko_w_obrebie_stacji_sn_nn() -> None:
    snap, odcinek = _siec_z_odcinkiem()
    stan = _wstaw(snap, odcinek, "inline", ["LINIA_IN", "LINIA_OUT", "TRANSFORMATOROWE"])[
        "snapshot"
    ]
    stacja = _stacja_pola(stan)
    gpz = next(s for s in stan["substations"] if s["station_type"] == "gpz")
    for element, wartosc in ((stacja, "gpz"), (stacja, "rozdzielnica_nn"), (gpz, "inline")):
        wynik = execute_domain_operation(
            stan,
            "update_element_parameters",
            {"element_ref": element["ref_id"], "parameters": {"station_type": wartosc}},
        )
        assert wynik.get("error_code") == "station.station_type_change_invalid", (element, wartosc)
    for wartosc in sorted(TYPY_STACJI_SN_NN):
        po = op(
            copy.deepcopy(stan),
            "update_element_parameters",
            {"element_ref": stacja["ref_id"], "parameters": {"station_type": wartosc}},
        )
        assert _stacja_pola(po)["station_type"] == wartosc


def test_w044_pole_o_roli_nierozpoznanej_w_modelu_zastanym() -> None:
    snap, odcinek = _siec_z_odcinkiem()
    stan = _wstaw(snap, odcinek, "inline", ["LINIA_IN", "LINIA_OUT", "TRANSFORMATOROWE"])[
        "snapshot"
    ]
    stacja = _stacja_pola(stan)
    stacja["meta"]["field_specs"].append(
        {"field_ref": "pole-nieznane", "name": "Pole X", "bay_role": "XYZ"}
    )
    problemy = [i for i in _problemy(stan) if i.code == KOD_WALIDATORA_ROLA_POLA_NIEROZPOZNANA]
    assert len(problemy) == 1
    assert "Pole SN „Pole X”" in problemy[0].message_pl
    assert problemy[0].fix_action.action_type == "NAVIGATE_TO_ELEMENT"
    assert rodzaj_stacji(stan, stacja["ref_id"]).pola_nierozpoznane[0].field_ref == "pole-nieznane"


def test_most_gotowosci_i_kanon_kodow() -> None:
    assert ODWZOROWANIE_WALIDATOR_NA_KANON[KOD_WALIDATORA_RODZAJ_NIEZGODNY] == (
        KOD_KANONICZNY_RODZAJ_NIEZGODNY
    )
    assert ODWZOROWANIE_WALIDATOR_NA_KANON[KOD_WALIDATORA_ROLA_POLA_NIEROZPOZNANA] == (
        KOD_KANONICZNY_ROLA_POLA_NIEROZPOZNANA
    )
    assert READINESS_CODES[KOD_KANONICZNY_RODZAJ_NIEZGODNY].fix_navigation["modal"] == (
        "update_element_parameters"
    )
    assert KOD_KANONICZNY_ROLA_POLA_NIEROZPOZNANA in READINESS_CODES


def test_pole_potrzeb_wlasnych_z_katalogu_nie_zmienia_rodzaju() -> None:
    """Operacja katalogowa pola zapisuje rodzaj pola — pole potrzeb własnych (w katalogu rola
    `FEEDER`) nie robi ze stacji przelotowej odgałęźnej (znalezisko (b) karty)."""
    from enm.pole_katalogowe import _rejestr_pol_katalogowych

    szablon = next(
        t for t in _rejestr_pol_katalogowych().values() if t.bay_kind == "potrzeb_wlasnych"
    )
    snap, odcinek = _siec_z_odcinkiem()
    stan = _wstaw(snap, odcinek, "inline", ["LINIA_IN", "LINIA_OUT", "TRANSFORMATOROWE"])[
        "snapshot"
    ]
    stacja = _stacja_pola(stan)
    przed = rodzaj_stacji(stan, stacja["ref_id"])
    assert przed.rodzaj == "inline"
    po = op(
        stan,
        "add_sn_bay_from_catalog",
        {
            "station_ref": stacja["ref_id"],
            "bus_ref": stacja["bus_refs"][0],
            "complete_bay_template_ref": szablon.template_ref,
            "apparatus_catalog_ref": APARAT,
        },
    )
    nowe = [
        spec
        for spec in _stacja_pola(po)["meta"]["field_specs"]
        if spec.get("bay_template_ref") == szablon.template_ref
    ]
    assert len(nowe) == 1
    assert nowe[0]["bay_role"] == "FEEDER"
    assert nowe[0]["bay_kind"] == "potrzeb_wlasnych"
    assert rodzaj_stacji(po, stacja["ref_id"]).rodzaj == "inline"
    assert rodzaj_stacji(po, stacja["ref_id"]).pola_liniowe == 2


# ---------------------------------------------------------------------------
# Szablony stacji
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("role", "rodzaj"),
    [
        (["IN", "TR"], "inline"),  # wcięcie domyka pole wyjściowe
        (["IN", "OUT", "TR"], "inline"),
        (["IN", "OUT", "FEEDER", "TR"], "branch"),
        (["IN", "COUPLER", "OUT", "TR"], "sectional"),
        (["IN", "OUT", "MEASUREMENT", "TR"], "inline"),
        ([], "inline"),
    ],
)
def test_deklaracja_szablonu_ze_skladu_pol(role: list[str], rodzaj: str) -> None:
    assert _resolve_station_type(role) == rodzaj


def test_katalog_szablonow_stacji_spojny_z_regula() -> None:
    """`topological_type` szablonów katalogu = reguła na ich składzie pól (pola rezerwowe
    i potrzeb własnych rozpoznane po rodzaju pola z mapowania kanonicznego katalogu)."""
    rodzaj_pola_szablonu = {
        base.template_id: rodzaj for base, rodzaj, _ in _CANONICAL_FALLBACK_MAPPING
    }
    for szablon in STATION_TEMPLATE_REGISTRY.values():
        sklad = [
            (
                rodzaj_pola_szablonu.get(pole.bay_template_id)
                if rodzaj_pola_szablonu.get(pole.bay_template_id)
                in {"potrzeb_wlasnych", "rezerwowe"}
                else get_bay_template(pole.bay_template_id).bay_role
            )
            for pole in szablon.bays
        ]
        rodzaj = rodzaj_ze_skladu_pol(sklad, polaczone_wyprowadzenia=2)
        assert NAZWA_PL[rodzaj] == szablon.topological_type, szablon.template_id


# ---------------------------------------------------------------------------
# Kwalifikacja FLNN i zgodność OSD — stacja SN/nN po każdej deklaracji SN/nN
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("deklaracja", sorted(TYPY_STACJI_SN_NN))
def test_kwalifikacja_petli_nn_rozpoznaje_kazda_deklaracje_stacji_sn_nn(deklaracja: str) -> None:
    from domain.eligibility_models import AnalysisType

    from tests.application.test_eligibility_service_nn import _ready_nn_enm, _row

    enm = _ready_nn_enm()
    enm = enm.model_copy(
        update={
            "substations": [
                s.model_copy(update={"station_type": deklaracja}) for s in enm.substations
            ]
        }
    )
    row = _row(enm, AnalysisType.FAULT_LOOP_NN)
    assert "ELIG_FLNN_MISSING_STATION" not in [b.code for b in row.blockers]


@pytest.mark.parametrize("deklaracja", sorted(TYPY_STACJI_SN_NN))
def test_zgodnosc_osd_obejmuje_kazda_deklaracje_stacji_sn_nn(deklaracja: str) -> None:
    from tests.reference_engine.test_compliance_engine import (
        _enm,
        _pack_report,
        _rmu_line_bay,
        _station,
    )

    pack = _pack_report(_enm([_rmu_line_bay()], _station(deklaracja, "slupowa")), "osd_enea")
    assert any(
        c.rule_code == "osd_enea.station.prefabricated_compact_preferred" and c.status == "fail"
        for c in pack.checks
    )


# ---------------------------------------------------------------------------
# Parytet frontu
# ---------------------------------------------------------------------------


def test_plik_parytetu_jest_bajtowo_rowny_generatorowi() -> None:
    plik = FRONTEND / WYJSCIE
    assert plik.exists(), f"brak {WYJSCIE}. {KOMENDA_REGENERACJI}"
    assert (
        plik.read_text(encoding="utf-8") == render_parytetu()
    ), f"{WYJSCIE} ROZJECHANY z generatorem. {KOMENDA_REGENERACJI}"
