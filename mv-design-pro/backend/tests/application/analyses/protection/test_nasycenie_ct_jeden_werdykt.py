"""Jeden werdykt nasycenia przekładnika prądowego w repo (karta CT-JEDEN-WERDYKT).

DEFEKT, KTÓRY TE TESTY PRZYPINAJĄ. Ocena zabezpieczeń liczyła granicę wiarygodności jako
``ALF·I₁n`` z pominięciem obciążenia obwodu wtórnego, a jądro
``network_model/solvers/equipment_checks/ct_burden_saturation.py`` (IEC 61869-2 § 5.6) liczyło
ją z bilansu mocy wtórnej. Pomiar (200/5 A 5P10, S_n 10 VA, R_ct 0,15 Ω, obciążenie 20 VA,
1 500 A): ocena zabezpieczeń → WIARYGODNY (granica 2 000 A), jądro → ALF_eff 5,789474,
granica 1 157,895 A, FAIL. Ręcznie: ALF_eff = 10·(0,15 + 0,4)/(0,15 + 0,8) = 5,789474,
ALF_wym = 1500/200 = 7,5, zapas = −1,710526.

ILOCZYN CECH (reguła KLASA, NIE INSTANCJA):
  {obwód wtórny zapisany, brak} × {R_ct z katalogu, brak} ×
  {ALF z klasy zabezpieczeniowej, klasa pomiarowa bez ALF, brak klasy} ×
  {prąd poniżej granicy jądra, pomiędzy granicą jądra a ALF·I₁n, powyżej ALF·I₁n}.
Komórka „pomiędzy” to ta, na której werdykty się rozjeżdżały. Każda komórka sprawdza
PARĘ: status oceny zabezpieczeń == status nasycenia jądra wołanego niezależnie na tych
samych danych (predykaty parami — jedno źródło prawdy).

Test inwentarza przypina deklarację MAPY dom. 4 #3 („jądro jest jedynym werdyktem
nasycenia”): poza jądrem nie ma formuły ``ALF·I₁n`` ani porównania prądu z nią.

Źródło R_ct: pozycja katalogu CT, z którą przekładnik jest związany (``katalog_dla_modelu``).
Katalog referencyjny nie niesie dziś R_ct dla żadnej z 12 pozycji, więc komórka „R_ct z
katalogu” podstawia repozytorium katalogu z pozycją producenta (ta sama klasa
``CatalogRepository``, ta sama ścieżka ``get_ct_type``) — reszta toru jest produkcyjna.
"""

from __future__ import annotations

import dataclasses
import re
from pathlib import Path
from typing import Any

import pytest
from application.analyses.protection import ocena_nadpradowa as modul
from application.analyses.protection.ocena_nadpradowa import (
    NIEWIARYGODNY,
    WIARYGODNOSC_NIEUSTALONA,
    WIARYGODNY,
    rozwiaz_nastawy,
    wiarygodnosc_punktu,
)
from enm.models import EnergyNetworkModel, ENMHeader, Measurement, ProtectionAssignment
from network_model.catalog import get_default_mv_catalog
from network_model.solvers.equipment_checks.ct_burden_saturation import (
    CtBurdenInput,
    CtDeviceBurden,
    check_ct_burden_saturation,
)

KATALOG_CT = "ct_200_5_5p10_10va_abb"  # 200/5 A 5P10 10 VA — pozycja referencyjna
RCT_PRODUCENTA = 0.15
#: Obwód wtórny o łącznym obciążeniu S_2obl = 20 VA: przewody 2·0,017241·5/2,5 Ω przy
#: I2n = 5 A → 25·0,068964 = 1,7241 VA, aparaty 18,2759 VA.
DLUGOSC_M = 5.0
PRZEKROJ_MM2 = 2.5
MOC_APARATOW_VA = 20.0 - 25.0 * 2.0 * 0.017241 * DLUGOSC_M / PRZEKROJ_MM2

#: ALF_eff ręcznie (wariant pełny): 10·(10 + 25·0,15)/(20 + 25·0,15) = 137,5/23,75.
ALF_EFF_PELNY = 137.5 / 23.75
#: Wariant uproszczony (brak R_ct): 10·10/20.
ALF_EFF_UPROSZCZONY = 5.0

#: Prądy iloczynu: poniżej granicy jądra (≤ 1 000 A w obu wariantach), POMIĘDZY granicą
#: jądra (1 157,9 A / 1 000 A) a ALF·I₁n = 2 000 A, powyżej ALF·I₁n.
PRAD_PONIZEJ, PRAD_POMIEDZY, PRAD_POWYZEJ = 900.0, 1500.0, 2500.0


def _obwod() -> dict[str, Any]:
    return {
        "dlugosc_przewodu_m": DLUGOSC_M,
        "przekroj_przewodu_mm2": PRZEKROJ_MM2,
        "obciazenia_aparatow": [{"nazwa": "przekaźnik + amperomierz", "moc_va": MOC_APARATOW_VA}],
    }


def _model(*, obwod: bool, klasa: str | None) -> tuple[EnergyNetworkModel, ProtectionAssignment]:
    ct = Measurement(
        ref_id="ct-pola",
        name="Przekładnik pola",
        measurement_type="CT",
        bus_ref="szyna",
        catalog_ref=KATALOG_CT,
        rating={
            "ratio_primary": 200.0,
            "ratio_secondary": 5.0,
            "accuracy_class": klasa,
            "burden_va": 10.0,
        },
        obwod_wtorny=_obwod() if obwod else None,
    )
    przypisanie = ProtectionAssignment(
        ref_id="zab-pola",
        name="Zabezpieczenie pola",
        breaker_ref="q-pola",
        ct_ref="ct-pola",
        device_type="overcurrent",
        catalog_ref="REF-OC-200",
        settings=[
            {
                "function_type": "overcurrent_51",
                "threshold_a": 2.0,
                "threshold_unit": "A_WTORNY",
                "curve_type": "IEC_SI",
                "time_multiplier": 0.2,
            }
        ],
    )
    model = EnergyNetworkModel(
        header=ENMHeader(name="Nasycenie CT — test"),
        measurements=[ct],
        protection_assignments=[przypisanie],
    )
    return model, przypisanie


@pytest.fixture
def katalog_z_rct(monkeypatch: pytest.MonkeyPatch) -> None:
    """Pozycja katalogu CT z rezystancją uzwojenia z karty producenta (R_ct 0,15 Ω)."""
    bazowy = get_default_mv_catalog()
    pozycja = dataclasses.replace(bazowy.get_ct_type(KATALOG_CT), rct_ohm=RCT_PRODUCENTA)
    katalog = dataclasses.replace(bazowy, ct_types={**bazowy.ct_types, KATALOG_CT: pozycja})
    monkeypatch.setattr(modul, "katalog_dla_modelu", lambda _enm: katalog)


def _status_jadra(*, obwod: bool, rct: bool, klasa: str | None, prad_a: float) -> str:
    """Status nasycenia jądra wołanego NIEZALEŻNIE (dane wpisane w teście, nie z modułu)."""
    alf = {"5P10": 10.0, "0.5": None, None: None}[klasa]
    wynik = check_ct_burden_saturation(
        CtBurdenInput(
            i2n_a=5.0,
            sn_va=10.0,
            alf=alf,
            dlugosc_przewodu_m=DLUGOSC_M if obwod else None,
            przekroj_przewodu_mm2=PRZEKROJ_MM2 if obwod else None,
            obciazenia_aparatow=(
                (CtDeviceBurden(nazwa="przekaźnik + amperomierz", moc_va=MOC_APARATOW_VA),)
                if obwod
                else ()
            ),
            rct_ohm=RCT_PRODUCENTA if rct else None,
            alf_wymagany=prad_a / 200.0,
        )
    )
    return {"PASS": WIARYGODNY, "FAIL": NIEWIARYGODNY}.get(
        wynik.status_nasycenia, WIARYGODNOSC_NIEUSTALONA
    )


def _oczekiwany(*, obwod: bool, rct: bool, klasa: str | None, prad_a: float) -> str:
    """Oczekiwanie z rachunku RĘCZNEGO (stałe na górze pliku), nie z kodu."""
    if not obwod or klasa != "5P10":
        return WIARYGODNOSC_NIEUSTALONA
    alf_eff = ALF_EFF_PELNY if rct else ALF_EFF_UPROSZCZONY
    return WIARYGODNY if alf_eff >= prad_a / 200.0 else NIEWIARYGODNY


@pytest.mark.parametrize("prad_a", [PRAD_PONIZEJ, PRAD_POMIEDZY, PRAD_POWYZEJ])
@pytest.mark.parametrize("klasa", ["5P10", "0.5", None])
@pytest.mark.parametrize("rct", [True, False], ids=["rct_z_katalogu", "rct_brak"])
@pytest.mark.parametrize("obwod", [True, False], ids=["obwod_zapisany", "obwod_brak"])
def test_iloczyn_cech_status_oceny_rowny_statusowi_jadra(
    obwod: bool,
    rct: bool,
    klasa: str | None,
    prad_a: float,
    request: pytest.FixtureRequest,
) -> None:
    if rct:
        request.getfixturevalue("katalog_z_rct")
    model, przypisanie = _model(obwod=obwod, klasa=klasa)
    nastawy = rozwiaz_nastawy(model, przypisanie)

    wynik = wiarygodnosc_punktu(nastawy, prad_a)

    oczekiwany = _oczekiwany(obwod=obwod, rct=rct, klasa=klasa, prad_a=prad_a)
    assert wynik.wiarygodnosc == oczekiwany
    # Para predykatów: ten sam status co jądro na tych samych danych — jeden werdykt.
    assert wynik.wiarygodnosc == _status_jadra(obwod=obwod, rct=rct, klasa=klasa, prad_a=prad_a)
    assert wynik.nasycenie is not None
    if oczekiwany == WIARYGODNOSC_NIEUSTALONA:
        kody = set(wynik.nasycenie["readiness_codes"])
        if not obwod:
            assert "ct.secondary_circuit_missing" in kody
        if klasa != "5P10":
            assert "ct.accuracy_limit_missing" in kody
        assert "nie sprawdzono" in wynik.powod_pl
    else:
        assert "ALF_eff" in wynik.powod_pl and "granic" in wynik.powod_pl


def test_przyklad_z_karty_ten_sam_status_co_jadro_z_wyjasnieniem(katalog_z_rct: None) -> None:
    """200/5 A 5P10, S_n 10 VA, R_ct 0,15 Ω, S_2obl 20 VA, 1 500 A → FAIL jądra, granica
    1 157,895 A, zapas −1,710526 — komunikat mówi, przy jakim prądzie i dlaczego."""
    model, przypisanie = _model(obwod=True, klasa="5P10")
    wynik = wiarygodnosc_punktu(rozwiaz_nastawy(model, przypisanie), 1500.0)

    assert wynik.wiarygodnosc == NIEWIARYGODNY
    nasycenie = wynik.nasycenie
    assert nasycenie is not None
    assert nasycenie["status_nasycenia"] == "FAIL"
    assert nasycenie["alf_efektywny"] == pytest.approx(5.789474, abs=1e-6)
    assert nasycenie["granica_nasycenia_a"] == pytest.approx(1157.895, abs=1e-3)
    assert nasycenie["zapas_alf"] == pytest.approx(-1.710526, abs=1e-6)
    assert nasycenie["alf_wymagany"] == pytest.approx(7.5)
    assert nasycenie["wariant_alf"] == "PELNY_IEC61869_2"
    assert nasycenie["white_box_trace"], "ślad jądra musi dojść do odpowiedzi"
    # Zdanie dla projektanta: prąd nasycenia, ALF_eff, przyczyny (obciążenie, R_ct), zapas.
    assert "1157,8947 A" in wynik.powod_pl
    assert "5,7895" in wynik.powod_pl
    assert "S_2obl 20 VA" in wynik.powod_pl
    assert "R_ct 0,15 Ω" in wynik.powod_pl
    assert "−1,7105" in wynik.powod_pl or "-1,7105" in wynik.powod_pl


def test_ocena_punktu_niesie_werdykt_jadra_i_bez_marginesu_przy_nasyceniu(
    katalog_z_rct: None,
) -> None:
    """Przez całą ścieżkę oceny (strefa → prąd przekaźnika → rekord): komórka „pomiędzy”
    daje NIEWIARYGODNY i brak marginesu liczbowego — dawniej WIARYGODNY z marginesem."""
    from application.analyses.protection.ocena_nadpradowa import ocen_zabezpieczenia

    from tests.application.analyses.protection.test_ocena_nadpradowa import (
        B2,
        Q1,
        _graf,
    )

    model, _ = _model(obwod=True, klasa="5P10")
    przypisanie = model.protection_assignments[0].model_copy(update={"breaker_ref": Q1})
    model = model.model_copy(update={"protection_assignments": [przypisanie]})
    graf = _graf()
    wynik = ocen_zabezpieczenia(
        enm=model,
        graph=graf,
        wiersze_zwarcia=[{"fault_node_id": B2, "ikss_a": 1500.0, "contributions": []}],
        rozplyw_punktu=lambda _p: [],
        nazwy_wezlow={w: w for w in graf.nodes},
        odniesienie_biegu="bieg testowy",
    )
    (punkt,) = (o for o in wynik.oceny if o.punkt_ref == B2)
    assert punkt.prad_przekaznika_a == pytest.approx(1500.0)
    assert punkt.wiarygodnosc == NIEWIARYGODNY
    assert punkt.margines_procent is None
    assert punkt.nasycenie_ct is not None
    assert punkt.nasycenie_ct["status_nasycenia"] == "FAIL"
    assert punkt.to_dict()["nasycenie_ct"]["granica_nasycenia_a"] == pytest.approx(
        1157.895, abs=1e-3
    )


def test_bieg_zabezpieczen_z_obwodem_zapisanym_operacja_uzytkownika() -> None:
    """Ścieżka użytkownika: sieć wzorcowa G08 → obwód wtórny zapisany operacją domenową
    ``set_measurement_secondary_circuit`` → bieg zwarciowy → bieg ``protection_sn``.
    Status każdej oceny == status jądra przy prądzie przekaźnika z biegu."""
    from enm.canonical_analysis import create_run, execute_run, reset_canonical_runs
    from enm.domain_operations import execute_domain_operation
    from enm.store import reset_enm_store, set_enm

    from tests.golden.enm_builders.zabezpieczenia_magistrali import (
        build_zabezpieczenia_magistrali_enm,
    )

    model = build_zabezpieczenia_magistrali_enm()
    migawka = model.model_dump(mode="json")
    for ct in sorted(model.measurements, key=lambda m: m.ref_id):
        wynik_op = execute_domain_operation(
            migawka,
            "set_measurement_secondary_circuit",
            {"measurement_ref": ct.ref_id, "obwod_wtorny": _obwod()},
        )
        assert wynik_op.get("error") is None, wynik_op.get("error")
        migawka = wynik_op["snapshot"]
    model = EnergyNetworkModel.model_validate(migawka)

    reset_canonical_runs()
    reset_enm_store()
    set_enm("case-ct", model)
    sc = execute_run(
        create_run(case_id="case-ct", klucz_twin="case-ct", analysis_type="short_circuit_sn").id
    )
    assert sc.status == "FINISHED", sc.error_message
    zab = execute_run(
        create_run(
            case_id="case-ct",
            klucz_twin="case-ct",
            analysis_type="protection_sn",
            options={"sc_run_id": str(sc.id)},
        ).id
    )
    assert zab.status == "FINISHED", zab.error_message
    oceny = zab.raw_result["protection_result"]["evaluations"]
    assert oceny
    for ocena in oceny:
        # G08: 600/5 A 5P20, S_n 15 VA, katalog bez R_ct → wariant uproszczony jądra.
        jadro = check_ct_burden_saturation(
            CtBurdenInput(
                i2n_a=5.0,
                sn_va=15.0,
                alf=20.0,
                dlugosc_przewodu_m=DLUGOSC_M,
                przekroj_przewodu_mm2=PRZEKROJ_MM2,
                obciazenia_aparatow=(
                    CtDeviceBurden(nazwa="przekaźnik + amperomierz", moc_va=MOC_APARATOW_VA),
                ),
                alf_wymagany=ocena["i_fault_a"] / 600.0,
            )
        )
        oczekiwany = {"PASS": WIARYGODNY, "FAIL": NIEWIARYGODNY}[jadro.status_nasycenia]
        assert ocena["wiarygodnosc"] == oczekiwany
        assert ocena["nasycenie_ct"]["alf_efektywny"] == pytest.approx(jadro.alf_efektywny)
        assert ocena["nasycenie_ct"]["wariant_alf"] == "UPROSZCZONY_BEZ_RCT"


#: ZAMKNIĘTA lista miejsc poza jądrem, w których iloczyn współczynnika ALF i prądu
#: występuje w kodzie — każde nowe miejsce to naruszenie deklaracji MAPY dom. 4 #3.
_DOZWOLONE_ILOCZYNY_ALF = {
    # Prezentacja granicy ALF_eff jądra w amperach (``granica_nasycenia_a``) — status
    # pochodzi wyłącznie z ``status_nasycenia`` jądra.
    "application/analyses/protection/ocena_nadpradowa.py": 1,
}
_JADRO = "network_model/solvers/equipment_checks/ct_burden_saturation.py"
_ILOCZYN_ALF = re.compile(r"\balf\w*(?:\.\w+)*\s*\*|\*\s*(?:\w+\.)*\w*alf\w*\b", re.IGNORECASE)


def test_inwentarz_zero_formul_alf_razy_prad_poza_jadrem() -> None:
    zrodla = Path(__file__).resolve().parents[4] / "src"
    znalezione: dict[str, int] = {}
    for plik in sorted(zrodla.rglob("*.py")):
        wzgledna = plik.relative_to(zrodla).as_posix()
        if wzgledna == _JADRO:
            continue
        kod = "\n".join(
            linia
            for linia in plik.read_text(encoding="utf-8").splitlines()
            if not linia.lstrip().startswith("#")
        )
        trafienia = [
            t for t in _ILOCZYN_ALF.findall(kod) if not re.search(r"\balfa\b", t, re.IGNORECASE)
        ]
        if trafienia:
            znalezione[wzgledna] = len(trafienia)
    assert znalezione == _DOZWOLONE_ILOCZYNY_ALF
