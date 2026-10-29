"""Odcinek bez składowej zerowej w modelu liczy się z wartością roboczą (zasada nr 4).

DLACZEGO. Linia albo kabel bez R′0/X′0 w modelu (odcinek z importu, z parametrów ręcznych,
pozycja katalogu bez składowej zerowej) zatrzymywał zwarcia doziemne całego modelu (W001 →
brak zdolności 1F, blokada kwalifikowalności ``ELIG_SC1_MISSING_Z0``, odmowa rozpływu
niesymetrycznego), a w biegu wywołanym z pominięciem bramy węzeł odcięty takim odcinkiem
dostawał przyczynę ``brak_danych``. Zasada nr 4: brak danej urządzenia nie blokuje obliczeń —
obliczenie przyjmuje w sieci SN R′0 = 3·R′1 (kabel ze znaną żyłą powrotną — ekranem każdej
żyły: R′0 = R′1 + R′ żyły powrotnej), X′0 = 3·X′1, tą samą regułą co pozycje katalogu; w sieci
nN kabel ze wspólną żyłą powrotną PE/PEN: R′0 = R′1 + 3·R′PE, X′0 = X′1 + 3·X′PE (ta sama
impedancja pętli co analiza pętli zwarcia IEC 60364-4-41). Wynik niesie daną przyjętą
``ESTIMATED`` w wierszu i założenie biegu ``branch.z0_wartosc_robocza``. Nazwana odmowa
zostaje tam, gdzie wartości roboczej nie da się przyjąć: R′1 albo X′1 równe zeru, kabel nN bez
danych żyły powrotnej (reguła 3·R′1 zaniżałaby R′0 kabla wielożyłowego i zawyżała prąd
doziemny), linia nN, odcinek WN. Ciche zero (kotwica, pominięta gałąź bez śladu) jest
niedopuszczalne.

ILOCZYN CECH: pasmo × rodzaj odcinka {SN: linia, kabel bez danej żyły powrotnej, kabel z żyłą
powrotną; nN: linia, kabel bez danych żyły powrotnej, kabel z żyłą powrotną PE/PEN}
× stan danych {brak R′0 i X′0, brak R′0, brak X′0, R′1 = 0, X′1 = 0} × konsument {zwarcie 1F,
zwarcie 2F+Z (sieć zerowa ``enm.mapping``), rozpływ niesymetryczny (``enm.assembler``),
walidator ENM (W001 i dostępność 1F), kwalifikowalność (``ELIG_SC1_MISSING_Z0``), kreator
(K7 i macierz gotowości)}. Wyrocznia liczbowa: bieg z wartością roboczą daje TEN SAM prąd
co bieg modelu, w którym projektant wpisał dokładnie te wartości — różni się wyłącznie daną
przyjętą i założeniem.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import pytest
from application.eligibility_service import EligibilityService
from application.network_wizard.validator import validate_wizard_state
from domain.eligibility_models import AnalysisType
from enm.assembler import KOD_NIESYMETRIA_BRAK_Z0_GALEZI, diagnoza_niesymetrii
from enm.canonical_analysis import CanonicalRun, _execute_short_circuit, _wykonaj_analize_biegu
from enm.dane_przyjete_galezi import KLUCZ_WIERSZA_DANE_GALEZI, KOD_Z0_ROBOCZE
from enm.mapping import ref_to_graph_id
from enm.models import Bus, Cable, EnergyNetworkModel, ENMHeader, OverheadLine, Source, Transformer
from enm.skladowa_zerowa_galezi import skladowa_zerowa_galezi
from enm.validator import ENMValidator
from network_model.catalog.mv_cable_line_catalog import get_all_cable_types, get_all_line_types
from network_model.catalog.wartosci_robocze import (
    KLUCZ_WARTOSCI_ROBOCZYCH_KATALOGU,
    ZALOZENIE_ODCINKA_NN_R0_ZYLA_POWROTNA,
    ZALOZENIE_ODCINKA_NN_X0_ZYLA_POWROTNA,
    ZALOZENIE_ODCINKA_R0_TRZY_R1,
    ZALOZENIE_ODCINKA_R0_ZYLA_POWROTNA,
    ZALOZENIE_ODCINKA_X0_TRZY_X1,
    wyprowadz_skladowa_zerowa,
)

from tests.enm.test_rozplyw_niesymetryczny_bieg import bieg as bieg_niesymetryczny
from tests.enm.test_rozplyw_niesymetryczny_bieg import siec as siec_niesymetryczna

R1, X1 = 0.2, 0.1
#: Wartości modelu pól, których NIE brakuje (różne od roboczych — stan częściowy rozróżnialny).
R0_MODELU, X0_MODELU = 0.65, 0.35
R_ZYLY_POWROTNEJ, X_ZYLY_POWROTNEJ = 0.5, 0.08

#: (pasmo, rodzaj odcinka) — pasmo z napięcia szyny początku odcinka.
RODZAJE = (
    ("SN", "linia"),
    ("SN", "kabel"),
    ("SN", "kabel_zyla"),
    ("nN", "linia"),
    ("nN", "kabel"),
    ("nN", "kabel_zyla"),
)
IDS_RODZAJOW = [f"{pasmo}-{rodzaj}" for pasmo, rodzaj in RODZAJE]
STANY: dict[str, dict[str, Any]] = {
    "brak_obu": {"r0_ohm_per_km": None, "x0_ohm_per_km": None},
    "brak_r0": {"r0_ohm_per_km": None},
    "brak_x0": {"x0_ohm_per_km": None},
    "r1_zero": {"r0_ohm_per_km": None, "x0_ohm_per_km": None, "r_ohm_per_km": 0.0},
    "x1_zero": {"r0_ohm_per_km": None, "x0_ohm_per_km": None, "x_ohm_per_km": 0.0},
}
BEZ_PODSTAWY = {"r1_zero", "x1_zero"}


def _oczekiwane(pasmo: str, rodzaj: str, stan: str) -> dict[str, tuple[float, str]]:
    """Pola przyjęte wartością roboczą: pole → (wartość [Ω/km], założenie); ``{}`` — odmowa."""
    if stan in BEZ_PODSTAWY:
        return {}
    pola = STANY[stan]
    wynik: dict[str, tuple[float, str]] = {}
    if pasmo == "nN":
        if rodzaj != "kabel_zyla":
            return {}
        if "r0_ohm_per_km" in pola:
            wynik["r0_ohm_per_km"] = (
                R1 + 3 * R_ZYLY_POWROTNEJ,
                ZALOZENIE_ODCINKA_NN_R0_ZYLA_POWROTNA,
            )
        if "x0_ohm_per_km" in pola:
            wynik["x0_ohm_per_km"] = (
                X1 + 3 * X_ZYLY_POWROTNEJ,
                ZALOZENIE_ODCINKA_NN_X0_ZYLA_POWROTNA,
            )
        return wynik
    if "r0_ohm_per_km" in pola:
        wynik["r0_ohm_per_km"] = (
            (R1 + R_ZYLY_POWROTNEJ, ZALOZENIE_ODCINKA_R0_ZYLA_POWROTNA)
            if rodzaj == "kabel_zyla"
            else (3 * R1, ZALOZENIE_ODCINKA_R0_TRZY_R1)
        )
    if "x0_ohm_per_km" in pola:
        wynik["x0_ohm_per_km"] = (3 * X1, ZALOZENIE_ODCINKA_X0_TRZY_X1)
    return wynik


def _odcinek(rodzaj: str, **pola: Any) -> Cable | OverheadLine:
    dane: dict[str, Any] = {
        "ref_id": "odc1",
        "name": "Odcinek K1",
        "from_bus_ref": "sn",
        "to_bus_ref": "st",
        "length_km": 4.0,
        "r_ohm_per_km": R1,
        "x_ohm_per_km": X1,
        "r0_ohm_per_km": R0_MODELU,
        "x0_ohm_per_km": X0_MODELU,
    }
    dane.update(pola)
    if rodzaj == "linia":
        return OverheadLine(**dane)
    if rodzaj == "kabel_zyla":
        dane["return_conductor_r_ohm_per_km_20c"] = R_ZYLY_POWROTNEJ
        dane["return_conductor_x_ohm_per_km"] = X_ZYLY_POWROTNEJ
    return Cable(**dane)


def _siec(odcinek: Cable | OverheadLine, pasmo: str = "SN") -> EnergyNetworkModel:
    """SN: system 110 kV (Z0/Z1 = 1,2) → TR Dyn11 25 MVA → szyna SN → odcinek → stacja S1.
    nN: sieć SN 15 kV → TR Dyn11 630 kVA → rozdzielnica nN → odcinek → złącze nN."""
    if pasmo == "nN":
        szyny = [
            Bus(ref_id="hv", name="Szyna SN stacji", voltage_kv=15.0),
            Bus(ref_id="sn", name="Rozdzielnica nN", voltage_kv=0.4),
            Bus(ref_id="st", name="Złącze nN", voltage_kv=0.4),
        ]
        zrodlo = Source(
            ref_id="src",
            name="Sieć SN",
            bus_ref="hv",
            model="short_circuit_power",
            sk3_mva=250.0,
            rx_ratio=0.1,
            sk3_min_mva=150.0,
            rx_ratio_min=0.15,
        )
        transformator = Transformer(
            ref_id="tr1",
            name="TR SN/nN",
            hv_bus_ref="hv",
            lv_bus_ref="sn",
            sn_mva=0.63,
            uhv_kv=15.0,
            ulv_kv=0.4,
            uk_percent=6.0,
            pk_kw=6.5,
            vector_group="Dyn11",
        )
    else:
        szyny = [
            Bus(ref_id="hv", name="GPZ 110 kV", voltage_kv=110.0),
            Bus(ref_id="sn", name="Rozdzielnia SN", voltage_kv=15.0),
            Bus(ref_id="st", name="Stacja S1", voltage_kv=15.0),
        ]
        zrodlo = Source(
            ref_id="src",
            name="System 110 kV",
            bus_ref="hv",
            model="short_circuit_power",
            sk3_mva=2000.0,
            rx_ratio=0.1,
            sk3_min_mva=1200.0,
            rx_ratio_min=0.15,
            z0_z1_ratio=1.2,
        )
        transformator = Transformer(
            ref_id="tr1",
            name="TR GPZ",
            hv_bus_ref="hv",
            lv_bus_ref="sn",
            sn_mva=25.0,
            uhv_kv=110.0,
            ulv_kv=15.0,
            uk_percent=11.0,
            pk_kw=110.0,
            vector_group="Dyn11",
        )
    return EnergyNetworkModel(
        header=ENMHeader(name="Siec odcinka bez Z0", revision=1),
        buses=szyny,
        sources=[zrodlo],
        transformers=[transformator],
        branches=[odcinek],
    )


def _bieg_zwarcia(enm: EnergyNetworkModel, rodzaj_zwarcia: str) -> CanonicalRun:
    run = CanonicalRun(
        id=UUID("00000000-0000-4000-8000-0000000000e4"),
        case_id="z0-odcinka",
        project_id="z0-odcinka",
        analysis_type="short_circuit_sn",
        status="RUNNING",
        created_at=datetime(2026, 10, 29, tzinfo=UTC),
        snapshot_hash="s",
        input_hash="i",
        snapshot=enm.model_dump(mode="json"),
        validation={},
        readiness={},
        options={"fault_type": rodzaj_zwarcia, "scenario": "max", "thermal_time_seconds": 1.0},
    )
    _execute_short_circuit(run)
    return run


def _wiersz(run: CanonicalRun, szyna: str) -> dict[str, Any]:
    wezel = ref_to_graph_id(szyna)
    return next(r for r in run.raw_result["results"] if r["fault_node_id"] == wezel)


@pytest.mark.parametrize("rodzaj_zwarcia", ["1F", "2FG"])
@pytest.mark.parametrize("stan", sorted(STANY))
@pytest.mark.parametrize(("pasmo", "rodzaj"), RODZAJE, ids=IDS_RODZAJOW)
def test_zwarcie_doziemne_z_wartoscia_robocza_albo_nazwana_odmowa(
    pasmo: str, rodzaj: str, stan: str, rodzaj_zwarcia: str
) -> None:
    run = _bieg_zwarcia(_siec(_odcinek(rodzaj, **STANY[stan]), pasmo), rodzaj_zwarcia)
    wiersz = _wiersz(run, "st")
    oczekiwane = _oczekiwane(pasmo, rodzaj, stan)
    zalozenia = [z for z in run.raw_result.get("zalozenia") or [] if z["code"] == KOD_Z0_ROBOCZE]
    if not oczekiwane:
        # Nazwana odmowa: węzeł odcięty od uziemienia, przyczyna z elementem i wyjaśnieniem.
        assert wiersz["ikss_a"] is None
        brak = wiersz["brak_wyniku_zerowego"]
        assert brak["przyczyna"] == "brak_danych"
        assert brak["elementy"] == ["odc1"]
        assert "wartości roboczej" in brak["wyjasnienie"]["zdanie_pl"]
        # Przyczyna braku wartości roboczej — ta sama treść co W001 (jedno źródło).
        powod = skladowa_zerowa_galezi(
            _siec(_odcinek(rodzaj, **STANY[stan]), pasmo).branches[0],
            15.0 if pasmo == "SN" else 0.4,
        ).brak_podstawy_pl
        assert powod and powod in brak["wyjasnienie"]["zdanie_pl"]
        assert zalozenia == []
        return
    assert wiersz.get("brak_wyniku_zerowego") is None
    assert wiersz["ikss_a"] is not None and wiersz["ikss_a"] > 0.0
    # Wyrocznia: ten sam prąd co model z wartościami wpisanymi przez projektanta.
    jawne = {pole: wartosc for pole, (wartosc, _) in oczekiwane.items()}
    wzorzec = _wiersz(_bieg_zwarcia(_siec(_odcinek(rodzaj, **jawne), pasmo), rodzaj_zwarcia), "st")
    assert wiersz["ikss_a"] == pytest.approx(wzorzec["ikss_a"], rel=1e-12)
    assert KLUCZ_WIERSZA_DANE_GALEZI not in wzorzec
    # Dana przyjęta ESTIMATED — wyłącznie pola przyjęte wartością roboczą, nazwa odcinka z modelu.
    dane = wiersz[KLUCZ_WIERSZA_DANE_GALEZI]
    assert [d["wartosc"]["wartosc"] for d in dane] == pytest.approx(
        [w for w, _ in oczekiwane.values()]
    )
    assert all(d["jakosc"] == "ESTIMATED" for d in dane)
    assert all("wartość robocza (Odcinek K1)" in d["nazwa_pl"] for d in dane)
    (zalozenie,) = zalozenia
    assert zalozenie["element_ref"] == "odc1"
    assert zalozenie["message_pl"].startswith("Odcinek K1: ")
    assert "odcinek bez składowej zerowej w modelu" in zalozenie["message_pl"]
    skladniki = zalozenie["skladniki_z0"]
    assert [d["zalozenie"] for d in skladniki] == [z for _, z in oczekiwane.values()]
    # Ślad sieci zerowej: krok gałęzi z wartościami użytymi i opisem wartości roboczej.
    krok = next(k for k in run.raw_result["siec_zerowa"] if k["key"] == "z0_line[odc1]")
    for pole, (wartosc, zalozenie_pola) in oczekiwane.items():
        assert krok["inputs"][pole] == pytest.approx(wartosc)
        assert zalozenie_pola in krok["notes"]


@pytest.mark.parametrize("stan", sorted(STANY))
@pytest.mark.parametrize(("pasmo", "rodzaj"), RODZAJE, ids=IDS_RODZAJOW)
def test_bramy_gotowosci_i_obliczenie_czytaja_jeden_predykat(
    pasmo: str, rodzaj: str, stan: str
) -> None:
    """Predykaty parami: walidator (W001, dostępność 1F), kwalifikowalność, kreator
    i obliczenie rozstrzygają „składowa zerowa znana” tak samo."""
    enm = _siec(_odcinek(rodzaj, **STANY[stan]), pasmo)
    znana = bool(_oczekiwane(pasmo, rodzaj, stan))
    skladowa = skladowa_zerowa_galezi(enm.branches[0], 15.0 if pasmo == "SN" else 0.4)
    assert skladowa.znana is znana
    assert (skladowa.brak_podstawy_pl is None) is znana

    walidacja = ENMValidator().validate(enm)
    assert ("W001" in {i.code for i in walidacja.issues}) is not znana
    w001 = [i for i in walidacja.issues if i.code == "W001"]
    assert all("wartości roboczej" in i.message_pl for i in w001)
    assert all(str(skladowa.brak_podstawy_pl) in i.message_pl for i in w001)
    if not any(i.severity == "BLOCKER" for i in walidacja.issues):
        assert walidacja.analysis_available.short_circuit_1f is znana

    gotowosc = ENMValidator().readiness(walidacja)
    macierz = EligibilityService().compute_matrix(enm=enm, readiness=gotowosc, case_id="z0")
    wiersz = next(r for r in macierz.matrix if r.analysis_type == AnalysisType.SC_1F)
    blokady = [b for b in wiersz.blockers if b.code == "ELIG_SC1_MISSING_Z0"]
    assert [b.element_ref for b in blokady] == ([] if znana else ["odc1"])
    assert all(str(skladowa.brak_podstawy_pl) in b.message_pl for b in blokady)

    stan_kreatora = validate_wizard_state(enm.model_dump(mode="json"))
    braki_1f = stan_kreatora.readiness_matrix.short_circuit_1f.missing_requirements
    assert any("Brak Z0 w gałęziach" in b for b in braki_1f) is not znana
    # Brak Z0 źródła nie odbiera zdolności zwarcia doziemnego (jak walidator ENM).
    assert not any("źródłach" in b for b in braki_1f)
    k7 = next(s for s in stan_kreatora.steps if s.step_id == "K7")
    (informacja,) = (i for i in k7.issues if i.code == "K7_LINES_NO_Z0")
    assert "wartość roboczą" in informacja.message_pl
    assert ("bez podstawy wartości roboczej" in informacja.message_pl) is not znana


@pytest.mark.parametrize("stan", sorted(STANY))
@pytest.mark.parametrize(("pasmo", "rodzaj"), RODZAJE, ids=IDS_RODZAJOW)
def test_rozplyw_niesymetryczny_z_wartoscia_robocza_albo_nazwana_odmowa(
    pasmo: str, rodzaj: str, stan: str
) -> None:
    """Odbiór faza–N na końcu odcinka: realny I0 płynie odcinkiem do punktu zamknięcia (SN:
    źródło, nN: uzwojenie Dyn11), więc Z0 odcinka wchodzi do równań — wartość robocza daje te
    same napięcia co wartości wpisane, z założeniem biegu; bez podstawy — odmowa nazwana."""

    def _model(**pola: Any) -> EnergyNetworkModel:
        dane = siec_niesymetryczna(fazy="A", szyna_odbioru="b_sn").model_dump(mode="json")
        if pasmo == "nN":
            # Odcinek nN: rozdzielnica nN stacji → złącze nN z odbiorem faza–N.
            dane["buses"].append({"ref_id": "b_zl", "name": "Złącze nN", "voltage_kv": 0.4})
            dane["branches"].append(
                {
                    "ref_id": "odc1",
                    "name": "Odcinek K1",
                    "type": "cable",
                    "from_bus_ref": "b_nn",
                    "to_bus_ref": "b_zl",
                    "length_km": 0.2,
                }
            )
            (odbior,) = dane["loads"]
            odbior["bus_ref"] = "b_zl"
            odcinek = dane["branches"][-1]
        else:
            (odcinek,) = (g for g in dane["branches"] if g["ref_id"] == "cab1")
            odcinek["ref_id"] = "odc1"
        odcinek.update({"r_ohm_per_km": R1, "x_ohm_per_km": X1, "r0_ohm_per_km": R0_MODELU})
        odcinek.update({"x0_ohm_per_km": X0_MODELU})
        if rodzaj == "kabel_zyla":
            odcinek["return_conductor_r_ohm_per_km_20c"] = R_ZYLY_POWROTNEJ
            odcinek["return_conductor_x_ohm_per_km"] = X_ZYLY_POWROTNEJ
        odcinek.update(pola)
        if rodzaj == "linia":
            odcinek["type"] = "line_overhead"
            for pole in [
                p for p in odcinek if p.startswith("return_conductor") or p == "number_of_cores"
            ]:
                odcinek.pop(pole)
        return EnergyNetworkModel.model_validate(dane)

    enm = _model(**STANY[stan])
    odmowy = diagnoza_niesymetrii(enm).odmowy
    oczekiwane = _oczekiwane(pasmo, rodzaj, stan)
    if not oczekiwane:
        assert [(o.kod, o.elementy) for o in odmowy] == [
            (KOD_NIESYMETRIA_BRAK_Z0_GALEZI, ("odc1",))
        ]
        return
    assert odmowy == ()
    run = bieg_niesymetryczny(enm)
    _wykonaj_analize_biegu(run)
    wzorzec = bieg_niesymetryczny(_model(**{p: w for p, (w, _) in oczekiwane.items()}))
    _wykonaj_analize_biegu(wzorzec)
    assert run.raw_result["result_v1"]["converged"] is True
    assert (
        run.raw_result["result_v1"]["bus_results"] == wzorzec.raw_result["result_v1"]["bus_results"]
    )
    kody = {z["kod"]: z["elementy"] for z in run.raw_result["zalozenia"]}
    assert kody[KOD_Z0_ROBOCZE] == ["odc1"]
    assert KOD_Z0_ROBOCZE not in {z["kod"] for z in wzorzec.raw_result["zalozenia"]}
    krok = next(k for k in run.white_box_trace if k["key"] == "pf_unbalanced_branch[odc1]")
    assert "wartość robocza" in krok["inputs"]["zrodlo_z0"]
    for pole, (wartosc, _) in oczekiwane.items():
        assert krok["inputs"][pole] == pytest.approx(wartosc)


def test_regula_wyprowadzenia_jedna_dla_katalogu_i_odcinka_modelu() -> None:
    """Każda pozycja katalogu linii i kabli SN z R′0/X′0 wyprowadzonymi: te same liczby daje
    ``wyprowadz_skladowa_zerowa`` (odcinek modelu ma inny opis założenia, nie inną regułę)."""
    sprawdzone = 0
    for kabel, pozycje in ((False, get_all_line_types()), (True, get_all_cable_types())):
        for pozycja in pozycje:
            params = pozycja.get("params") or {}
            robocze = params.get(KLUCZ_WARTOSCI_ROBOCZYCH_KATALOGU) or {}
            pola = [p for p in ("r0_ohm_per_km", "x0_ohm_per_km") if p in robocze]
            if not pola:
                continue
            wyprowadzone = {
                pole: wartosc
                for pole, wartosc, _ in wyprowadz_skladowa_zerowa(
                    kabel=kabel,
                    r1=float(params["r_ohm_per_km"]),
                    x1=float(params["x_ohm_per_km"]),
                    r_zyly_powrotnej=params.get("return_conductor_r_ohm_per_km_20c"),
                    brak_r0="r0_ohm_per_km" in robocze,
                    brak_x0="x0_ohm_per_km" in robocze,
                    z_katalogu=False,
                )
            }
            assert {p: params[p] for p in pola} == wyprowadzone, pozycja["id"]
            sprawdzone += 1
    assert sprawdzone > 0


@pytest.mark.parametrize("pasmo", ["SN", "nN"])
def test_determinizm_biegu_z_wartoscia_robocza(pasmo: str) -> None:
    enm = _siec(_odcinek("kabel_zyla", **STANY["brak_obu"]), pasmo)
    pierwszy, drugi = _bieg_zwarcia(enm, "1F"), _bieg_zwarcia(enm, "1F")
    assert pierwszy.raw_result == drugi.raw_result


@pytest.mark.parametrize(
    ("napiecie_kv", "fragment"),
    [
        (110.0, "reguła wartości roboczej obejmuje sieci SN i nN"),
        (None, "napięcie szyny odcinka nieznane"),
    ],
    ids=["WN", "napiecie_nieznane"],
)
def test_odcinek_poza_sn_i_nn_bez_wartosci_roboczej(
    napiecie_kv: float | None, fragment: str
) -> None:
    """Linia 110 kV bez R′0/X′0: wartości roboczej 3·R′1 nie ma (R′0/X′0 linii WN wyznacza
    geometria słupa, ``enm.parametry_linii_wn``, albo dana operatora) — odmowa nazwana."""
    skladowa = skladowa_zerowa_galezi(_odcinek("linia", **STANY["brak_obu"]), napiecie_kv)
    assert not skladowa.znana and skladowa.robocze == ()
    assert fragment in str(skladowa.brak_podstawy_pl)
