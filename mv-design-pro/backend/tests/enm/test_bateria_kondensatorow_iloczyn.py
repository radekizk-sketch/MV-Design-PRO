"""Bateria kondensatorów SN w KAŻDYM konsumencie — iloczyn cech karty UX-04/POLE-BKR-MODEL.

DLACZEGO. Element ``ShuntCapacitor`` niesie układ połączeń, stopnie, dławik, tolerancję
i rezystory rozładowcze; każdy konsument czyta je inaczej:

* rozpływ mocy — moc bierna zależy od napięcia: Q(U) = Q_n·(n_zał/n)·(U/U_n)² (stała
  admitancja), z dławikiem y_d = 1/(jX_L + 1/y); układ połączeń NIE wpływa na rozpływ
  symetryczny;
* zwarcie, składowa zgodna i przeciwna — bateria pominięta (IEC 60909-0, jedyne napięcie czynne
  to c·U_n/√3 w miejscu zwarcia) JAWNIE: założenie biegu na każdą załączoną baterię;
* zwarcie, składowa zerowa — drogę daje WYŁĄCZNIE gwiazda uziemiona (Y0 = Y1);
* prąd pojemnościowy doziemienia (projekt uziemienia punktu neutralnego) — udział
  I_C = √3·B0·U wyłącznie gwiazdy uziemionej;
* walidator — reguły pola BKR (W045–W048) i stan stopni (E043).

Wyrocznie liczbowe są pisane w teście z pierwszych zasad (zespolona admitancja jednej fazy),
NIE wywołują funkcji produktu.

ILOCZYN CECH: układ {podwójna gwiazda izolowana, gwiazda izolowana, gwiazda uziemiona,
trójkąt} × stopnie {jeden stopień, dwa stopnie załączone, dwa stopnie z jednym wyłączonym} ×
napięcie {U_n, 0,95·U_n, 1,05·U_n} × dławik {jest, nie ma} × konsument {rozpływ, zwarcie
3F (pominięcie w śladzie), zwarcie 1F (składowa zerowa), prąd pojemnościowy, walidator}.
Napięcie robocze nie jest wejściem zwarcia IEC 60909 (zastępcze źródło c·U_n) — w zwarciach
cecha napięcia sprawdza niezależność wyniku od nastawy napięcia źródła.
"""

from __future__ import annotations

import cmath
import math
from collections.abc import Iterator
from typing import Any

import pytest
from domain.fault_scenario import FaultLocation, FaultType, ShortCircuitConfig, new_fault_scenario
from enm.bateria_kondensatorow import (
    KOD_BATERIA_PARAMETRY_ROBOCZE,
    KOD_BATERIA_POMINIETA_W_SKLADOWEJ_ZGODNEJ,
    KOD_BATERIA_STOPNIE_NIEZGODNE,
    admitancja_baterii,
)
from enm.canonical_analysis import create_run, execute_run, reset_canonical_runs
from enm.mapping import build_zero_sequence_trace, map_enm_to_network_graph
from enm.models import (
    Bus,
    Cable,
    EnergyNetworkModel,
    ENMHeader,
    Load,
    ShuntCapacitor,
    Source,
    ZespolUziemiajacy,
)
from enm.scenariusze import OperatingScenario, RodzajScenariusza, opcje_biegu_ze_scenariusza
from enm.store import reset_enm_store, set_enm
from enm.validator import ENMValidator
from network_model.core.bateria_kondensatorow import UKLADY_POLACZEN_BATERII
from network_model.odmowa_danych import OdmowaNazwana
from network_model.solvers.v126_academic import V126AcademicSolver
from solver_input.v126_contracts import V126AnalysisType, build_v126_input_from_enm

from tests.enm.test_canonical_sc_c_per_pasmo import N1, _build_mv_lv_enm
from tests.reference_networks.scena_pola_bkr import (
    bateria,
    gpz,
    pole_bkr,
    zbuduj_gpz_z_bkr,
)
from tests.reference_networks.sceny_zajetosci_pol import ok, op
from tests.utils.zespol_uziemiajacy import zespol_uziemiajacy_rekord

Q_N_MVAR = 1.2
U_N_KV = 15.0
STRATY_KW = 0.6
CZESTOTLIWOSC_HZ = 50.0
DLAWIK_MH = 5.0

#: Stopnie: (liczba stopni nadana na elemencie, stan stopni, udział n_zał/n).
STOPNIE: dict[str, tuple[int | None, list[bool] | None, float]] = {
    "jeden_stopien": (None, None, 1.0),
    "dwa_zalaczone": (2, [True, True], 1.0),
    "dwa_jeden_wylaczony": (2, [True, False], 0.5),
}
NAPIECIA_PU = (1.0, 0.95, 1.05)
DLAWIKI = (None, DLAWIK_MH)


@pytest.fixture(autouse=True)
def _czysty_stan() -> Iterator[None]:
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


def _bateria(uklad: str, stopnie: str, dlawik_mh: float | None, *, bus_ref: str) -> ShuntCapacitor:
    liczba, stan, _ = STOPNIE[stopnie]
    pola: dict[str, Any] = {"uklad_polaczen": uklad}
    if liczba is not None:
        pola["liczba_stopni"] = liczba
    if stan is not None:
        pola["stopnie_zalaczone"] = stan
    if dlawik_mh is not None:
        pola["dlawik_ograniczajacy"] = True
        pola["dlawik_indukcyjnosc_mh"] = dlawik_mh
    else:
        pola["dlawik_ograniczajacy"] = False
    return ShuntCapacitor(
        ref_id="BAT",
        name="Bateria kondensatorów",
        bus_ref=bus_ref,
        rated_mvar=Q_N_MVAR,
        rated_kv=U_N_KV,
        catalog_ref="KOMP_SN_1V2_15KV",
        catalog_namespace="KOMPENSATOR_SN",
        parameter_source="CATALOG",
        source_mode="KATALOG",
        meta={"loss_kw": STRATY_KW},
        **pola,
    )


def _admitancja_fazy_s(udzial: float, dlawik_mh: float | None) -> complex:
    """Wyrocznia: admitancja fazy baterii [S] z pierwszych zasad — B = Q_n·u/U_n²,
    G = P_str·u/U_n², dławik szeregowy X_L = 2πfL."""
    y = complex(STRATY_KW / 1000.0 * udzial, Q_N_MVAR * udzial) / U_N_KV**2
    if dlawik_mh is None or y == 0:
        return y
    x_l = 2.0 * math.pi * CZESTOTLIWOSC_HZ * dlawik_mh * 1e-3
    return 1.0 / (complex(0.0, x_l) + 1.0 / y)


# ---------------------------------------------------------------------------
# Rozpływ mocy: Q(U) przez realny bieg (create_run → execute_run)
# ---------------------------------------------------------------------------


def _siec_rozplywu(u_set_pu: float, bat: ShuntCapacitor) -> EnergyNetworkModel:
    """Szyna zasilająca (bilansująca, napięcie nastawy źródła) z baterią i kabel do odbioru —
    napięcie szyny baterii jest DOKŁADNIE nastawą źródła."""
    return EnergyNetworkModel(
        header=ENMHeader(name="BKR rozpływ"),
        buses=[
            Bus(ref_id="S", name="Szyna zasilająca", voltage_kv=U_N_KV),
            Bus(ref_id="L", name="Szyna odbiorcza", voltage_kv=U_N_KV),
        ],
        sources=[
            Source(
                ref_id="Q",
                name="Sieć zasilająca",
                bus_ref="S",
                model="short_circuit_power",
                sk3_mva=2500.0,
                r_ohm=0.5,
                x_ohm=5.0,
                rx_ratio=0.1,
                r0_ohm=0.6,
                x0_ohm=6.0,
                u_set_pu=u_set_pu,
                catalog_ref="src-x",
                catalog_namespace="ZRODLO_SN",
                parameter_source="CATALOG",
                source_mode="KATALOG",
            )
        ],
        branches=[
            Cable(
                ref_id="K",
                name="Kabel SN",
                from_bus_ref="S",
                to_bus_ref="L",
                length_km=1.0,
                r_ohm_per_km=0.25,
                x_ohm_per_km=0.1,
                catalog_ref="cable-x",
                catalog_namespace="KABEL_SN",
                parameter_source="CATALOG",
                source_mode="KATALOG",
            )
        ],
        loads=[Load(ref_id="ODB", name="Odbiór", bus_ref="L", p_mw=1.0, q_mvar=0.5)],
        shunt_capacitors=[bat],
    )


def _bieg_rozplywu(enm: EnergyNetworkModel) -> dict[str, Any]:
    set_enm("bkr", enm)
    wynik = execute_run(create_run(case_id="bkr", klucz_twin="bkr", analysis_type="PF").id)
    assert wynik.status == "FINISHED", wynik.error_message
    return wynik.raw_result or {}


@pytest.mark.parametrize("dlawik_mh", DLAWIKI, ids=["bez_dlawika", "z_dlawikiem"])
@pytest.mark.parametrize("u_pu", NAPIECIA_PU, ids=["Un", "0.95Un", "1.05Un"])
@pytest.mark.parametrize("stopnie", sorted(STOPNIE))
def test_rozplyw_moc_bierna_zalezy_od_napiecia_dla_kazdego_ukladu(
    stopnie: str, u_pu: float, dlawik_mh: float | None
) -> None:
    udzial = STOPNIE[stopnie][2]
    y = _admitancja_fazy_s(udzial, dlawik_mh)
    u_kv = u_pu * U_N_KV
    q_oczekiwane = y.imag * u_kv**2
    p_oczekiwane = y.real * u_kv**2
    wyniki_ukladow: list[float] = []
    for uklad in UKLADY_POLACZEN_BATERII:
        raw = _bieg_rozplywu(_siec_rozplywu(u_pu, _bateria(uklad, stopnie, dlawik_mh, bus_ref="S")))
        [wpis] = raw["baterie_kondensatorow"]
        assert wpis["u_pu"] == pytest.approx(u_pu, abs=1e-12)
        # Wynik White Box baterii: Q(U) = b·|U|²·S_b — nie stała Q_n.
        assert wpis["q_mvar"] == pytest.approx(q_oczekiwane, rel=1e-9), uklad
        assert wpis["p_mw"] == pytest.approx(p_oczekiwane, rel=1e-9), uklad
        assert wpis["udzial_stopni"] == udzial
        assert (wpis["x_dlawika_ohm"] is None) is (dlawik_mh is None)
        # Fizyka rozwiązania solvera (nie zapis White Box): bilans szyny zasilającej —
        # źródło oddaje do kabla q_from minus to, co oddaje bateria.
        wynik_v1 = raw["result_v1"]
        [kabel] = wynik_v1["branch_results"]
        slack_q = float(wynik_v1["summary"]["slack_q_mvar"])
        slack_p = float(wynik_v1["summary"]["slack_p_mw"])
        assert slack_q - float(kabel["q_from_mvar"]) == pytest.approx(-q_oczekiwane, abs=1e-7)
        assert slack_p - float(kabel["p_from_mw"]) == pytest.approx(p_oczekiwane, abs=1e-7)
        # Bez danej roboczej w admitancji (dławik i liczba stopni nadane na elemencie, albo
        # jeden stopień bez stanu stopni — u = 1 niezależnie od liczby) brak założenia biegu.
        assert [
            z for z in raw.get("zalozenia") or [] if z["code"] == KOD_BATERIA_PARAMETRY_ROBOCZE
        ] == []
        wyniki_ukladow.append(float(wpis["q_mvar"]))
    # Rozpływ symetryczny nie zależy od układu połączeń.
    assert len(set(wyniki_ukladow)) == 1


def test_rozplyw_wszystkie_stopnie_wylaczone_bateria_nie_oddaje_mocy() -> None:
    bat = _bateria("TROJKAT", "dwa_zalaczone", DLAWIK_MH, bus_ref="S").model_copy(
        update={"stopnie_zalaczone": [False, False]}
    )
    [wpis] = _bieg_rozplywu(_siec_rozplywu(1.0, bat))["baterie_kondensatorow"]
    assert wpis["udzial_stopni"] == 0.0
    assert wpis["q_mvar"] == 0.0
    assert wpis["p_mw"] == 0.0


def test_rozplyw_dlawik_z_wartosci_roboczej_ma_zalozenie_biegu() -> None:
    """Dławik nienadany (ani element, ani typ) — admitancja z wartości roboczej rejestru:
    założenie biegu z daną przyjętą ESTIMATED (zasada nr 4)."""
    bat = _bateria("TROJKAT", "jeden_stopien", None, bus_ref="S").model_copy(
        update={"dlawik_ograniczajacy": None}
    )
    raw = _bieg_rozplywu(_siec_rozplywu(1.0, bat))
    [zalozenie] = [z for z in raw["zalozenia"] if z["code"] == KOD_BATERIA_PARAMETRY_ROBOCZE]
    assert zalozenie["element_ref"] == "BAT"
    assert {d["jakosc"] for d in zalozenie["dane_przyjete"]} == {"ESTIMATED"}
    # Dławik wyłącznie z wartości roboczej (liczba stopni nie wchodzi bez stanu stopni).
    assert zalozenie["parametry"] == ["dlawik_ograniczajacy"]
    assert "wartością roboczą: dławik ograniczający prąd załączania." in zalozenie["message_pl"]


# ---------------------------------------------------------------------------
# Zwarcia: realny bieg zwarciowy (create_run → execute_run)
# ---------------------------------------------------------------------------


def _opcje_zwarcia(rodzaj: FaultType) -> dict[str, Any]:
    spec = new_fault_scenario(
        study_case_id="bkr",
        name="Zwarcie na szynie SN",
        fault_type=rodzaj,
        location=FaultLocation(element_ref=N1, location_type="BUS"),
        config=ShortCircuitConfig.from_dict({"scenariusz": "MAX", "thermal_time_seconds": 0.5}),
    )
    return opcje_biegu_ze_scenariusza(
        OperatingScenario(
            scenario_id=f"bkr-{rodzaj.value}",
            name="Zwarcie",
            kind=RodzajScenariusza.FAULT_STUDY,
            fault_spec=spec,
        )
    )


def _siec_zwarcia(bat: ShuntCapacitor | None, u_set_pu: float) -> EnergyNetworkModel:
    enm = _build_mv_lv_enm("BKR zwarcie")
    zrodla = [z.model_copy(update={"u_set_pu": u_set_pu}) for z in enm.sources]
    return enm.model_copy(
        update={"sources": zrodla, "shunt_capacitors": [bat] if bat is not None else []}
    )


def _bieg_zwarcia(enm: EnergyNetworkModel, rodzaj: FaultType) -> dict[str, Any]:
    set_enm("bkr", enm)
    wynik = execute_run(
        create_run(
            case_id="bkr",
            klucz_twin="bkr",
            analysis_type="short_circuit_sn",
            options=_opcje_zwarcia(rodzaj),
        ).id
    )
    assert wynik.status == "FINISHED", wynik.error_message
    return wynik.raw_result or {}


def _zespolona(wartosc: dict[str, float]) -> complex:
    return complex(wartosc["re"], wartosc["im"])


@pytest.mark.parametrize("u_pu", NAPIECIA_PU, ids=["Un", "0.95Un", "1.05Un"])
@pytest.mark.parametrize("dlawik_mh", DLAWIKI, ids=["bez_dlawika", "z_dlawikiem"])
@pytest.mark.parametrize("stopnie", sorted(STOPNIE))
@pytest.mark.parametrize("uklad", UKLADY_POLACZEN_BATERII)
def test_zwarcie_3f_bateria_pominieta_jawnie_w_sladzie(
    uklad: str, stopnie: str, dlawik_mh: float | None, u_pu: float
) -> None:
    odniesienie = _bieg_zwarcia(_siec_zwarcia(None, u_pu), FaultType.SC_3F)
    raw = _bieg_zwarcia(
        _siec_zwarcia(_bateria(uklad, stopnie, dlawik_mh, bus_ref=N1), u_pu), FaultType.SC_3F
    )
    [wiersz], [wiersz_odniesienia] = raw["results"], odniesienie["results"]
    # Pominięcie w składowej zgodnej: prąd i impedancja zwarciowa bit w bit jak bez baterii,
    # niezależnie od nastawy napięcia źródła (zastępcze źródło c·U_n/√3).
    assert wiersz["ikss_a"] == wiersz_odniesienia["ikss_a"]
    assert wiersz["z1_ohm"] == wiersz_odniesienia["z1_ohm"]
    zalozenia = [z for z in raw["zalozenia"] if str(z["code"]).startswith("shunt.")]
    [zalozenie] = zalozenia
    assert zalozenie["code"] == KOD_BATERIA_POMINIETA_W_SKLADOWEJ_ZGODNEJ
    assert zalozenie["element_ref"] == "BAT"
    assert zalozenie["uklad_polaczen"] == uklad
    assert "IEC 60909-0" in zalozenie["message_pl"]
    assert "składowej zgodnej i przeciwnej" in zalozenie["message_pl"]
    # Zwarcie trójfazowe nie ma składowej zerowej — brak opisu drogi zerowej w zdaniu.
    assert "Składowa zerowa" not in zalozenie["message_pl"]
    assert odniesienie["zalozenia"] == [
        z for z in raw["zalozenia"] if not str(z["code"]).startswith("shunt.")
    ]


def test_zwarcie_bateria_otwarta_bez_zalozenia_i_bez_wplywu() -> None:
    bat = _bateria("GWIAZDA_UZIEMIONA", "jeden_stopien", None, bus_ref=N1).model_copy(
        update={"status": "open"}
    )
    for rodzaj in (FaultType.SC_3F, FaultType.SC_1F):
        odniesienie = _bieg_zwarcia(_siec_zwarcia(None, 1.0), rodzaj)
        raw = _bieg_zwarcia(_siec_zwarcia(bat, 1.0), rodzaj)
        assert raw["results"][0]["ikss_a"] == odniesienie["results"][0]["ikss_a"]
        assert [z for z in raw["zalozenia"] if str(z["code"]).startswith("shunt.")] == []


@pytest.mark.parametrize("dlawik_mh", DLAWIKI, ids=["bez_dlawika", "z_dlawikiem"])
@pytest.mark.parametrize("stopnie", sorted(STOPNIE))
@pytest.mark.parametrize("uklad", UKLADY_POLACZEN_BATERII)
def test_zwarcie_1f_droga_zerowa_wylacznie_gwiazdy_uziemionej(
    uklad: str, stopnie: str, dlawik_mh: float | None
) -> None:
    odniesienie = _bieg_zwarcia(_siec_zwarcia(None, 1.0), FaultType.SC_1F)
    bat = _bateria(uklad, stopnie, dlawik_mh, bus_ref=N1)
    raw = _bieg_zwarcia(_siec_zwarcia(bat, 1.0), FaultType.SC_1F)
    [wiersz], [wiersz_odniesienia] = raw["results"], odniesienie["results"]
    z0, z0_odniesienia = _zespolona(wiersz["z0_ohm"]), _zespolona(wiersz_odniesienia["z0_ohm"])
    uziemiona = uklad == "GWIAZDA_UZIEMIONA"
    if uziemiona:
        # Bateria to bocznik do ziemi w sieci zerowej: 1/Z0 = 1/Z0_bez + Y_fazy.
        y_fazy = _admitancja_fazy_s(STOPNIE[stopnie][2], dlawik_mh)
        assert 1.0 / z0 - 1.0 / z0_odniesienia == pytest.approx(y_fazy, rel=1e-9)
        assert wiersz["ikss_a"] != wiersz_odniesienia["ikss_a"]
    else:
        assert z0 == z0_odniesienia
        assert wiersz["ikss_a"] == wiersz_odniesienia["ikss_a"]
    # Składowa zgodna — bez zmian w każdym układzie.
    assert wiersz["z1_ohm"] == wiersz_odniesienia["z1_ohm"]
    [pominiecie] = [
        z for z in raw["zalozenia"] if z["code"] == KOD_BATERIA_POMINIETA_W_SKLADOWEJ_ZGODNEJ
    ]
    assert pominiecie["droga_zerowa"] is uziemiona
    assert "Składowa zerowa" in pominiecie["message_pl"]
    # Zdanie o układzie elementu (podstawa normowa po nim opisuje oba przypadki).
    zdanie_ukladu = pominiecie["message_pl"].split(" Podstawa: ")[2]
    assert ("(Y0 = Y1)" in pominiecie["message_pl"]) is uziemiona
    assert ("nie ma połączenia z ziemią" in pominiecie["message_pl"]) is not uziemiona
    assert zdanie_ukladu.startswith("Metoda składowych symetrycznych")
    robocze = [z for z in raw["zalozenia"] if z["code"] == KOD_BATERIA_PARAMETRY_ROBOCZE]
    # Układ nadany na elemencie; liczba stopni wchodzi do Y0 tylko gwiazdy uziemionej — jest
    # wartością roboczą wyłącznie przy jednym stopniu bez liczby nadanej (ani typ, ani element).
    oczekiwane_robocze = uziemiona and STOPNIE[stopnie][0] is None
    assert bool(robocze) is oczekiwane_robocze
    if robocze:
        assert robocze[0]["parametry"] == ["liczba_stopni"]
        # Zdanie nazywa DOKŁADNIE parametr roboczy (nie układ połączeń, nadany na elemencie).
        assert "wartością roboczą: liczba stopni baterii." in robocze[0]["message_pl"]
        assert "układ połączeń baterii" not in robocze[0]["message_pl"]
        assert {d["jakosc"] for d in robocze[0]["dane_przyjete"]} == {"ESTIMATED"}
    # Ślad budowy macierzy Y0: wpis baterii z decyzją o drodze zerowej.
    enm = _siec_zwarcia(bat, 1.0)
    slad = {w["key"]: w for w in build_zero_sequence_trace(enm, map_enm_to_network_graph(enm))}
    wpis = slad["z0_shunt_capacitor[BAT]"]
    assert (wpis["result"]["y0_pu"] == 0) is not uziemiona


# ---------------------------------------------------------------------------
# Prąd pojemnościowy doziemienia (projekt uziemienia punktu neutralnego)
# ---------------------------------------------------------------------------


def _siec_kompensowana(bat: ShuntCapacitor | None) -> EnergyNetworkModel:
    """Sieć zwarciowa z punktem neutralnym uziemionym przez dławik gaszący (Z.13): projekt
    uziemienia punktu neutralnego czyta sposób uziemienia WYŁĄCZNIE z zespołu uziemiającego
    sekcji (jedyna prawda `enm.uziemienie_sekcji`; parametr biegu go nie nadpisuje)."""
    enm = _siec_zwarcia(bat, 1.0)
    [zespol] = enm.zespoly_uziemiajace
    return enm.model_copy(
        update={
            "zespoly_uziemiajace": [
                ZespolUziemiajacy.model_validate(
                    zespol_uziemiajacy_rekord(zespol.ref_id, zespol.bus_ref, wariant="dlawik")
                )
            ]
        }
    )


def _wejscie_projektu_uziemienia(enm: EnergyNetworkModel) -> Any:
    """Wejście projektu uziemienia z modelu — ścieżka produktu (`execute_v126_run` buduje je
    z rodzajem analizy, który dokłada uziemienie sieci SN z jedynej prawdy
    `enm.uziemienie_sekcji`; bez niego solver odmawia: „dane niekompletne")."""
    return build_v126_input_from_enm(enm, analysis_type=V126AnalysisType.NEUTRAL_EARTHING_DESIGN)


@pytest.mark.parametrize("dlawik_mh", DLAWIKI, ids=["bez_dlawika", "z_dlawikiem"])
@pytest.mark.parametrize("stopnie", sorted(STOPNIE))
@pytest.mark.parametrize("uklad", UKLADY_POLACZEN_BATERII)
def test_prad_pojemnosciowy_tylko_gwiazdy_uziemionej(
    uklad: str, stopnie: str, dlawik_mh: float | None
) -> None:
    enm = _siec_kompensowana(None)
    # Kable z jawną pojemnością doziemną — ten sam przypadek zawsze ma C0 sieci.
    b0_kabli = 1e-4
    enm = enm.model_copy(
        update={
            "branches": [
                g.model_copy(update={"b0_siemens_per_km": b0_kabli}) if isinstance(g, Cable) else g
                for g in enm.branches
            ]
        }
    )
    odniesienie = V126AcademicSolver().run(
        V126AnalysisType.NEUTRAL_EARTHING_DESIGN, _wejscie_projektu_uziemienia(enm)
    )["result"]
    z_baterii = enm.model_copy(
        update={"shunt_capacitors": [_bateria(uklad, stopnie, dlawik_mh, bus_ref=N1)]}
    )
    wejscie = _wejscie_projektu_uziemienia(z_baterii)
    wynik = V126AcademicSolver().run(V126AnalysisType.NEUTRAL_EARTHING_DESIGN, wejscie)["result"]
    i_c, i_c_odniesienia = (
        wynik["capacitive_earth_fault_current_a"],
        odniesienie["capacitive_earth_fault_current_a"],
    )
    if uklad == "GWIAZDA_UZIEMIONA":
        b0 = _admitancja_fazy_s(STOPNIE[stopnie][2], dlawik_mh).imag
        # I_C baterii = √3·B0·U_l (U_l w kV, B0 w S → kA; ×1000 → A); zaokrąglenie wyniku 1e-4.
        assert i_c - i_c_odniesienia == pytest.approx(math.sqrt(3.0) * b0 * U_N_KV * 1e3, abs=2e-4)
        assert [b["shunt_capacitor_ref"] for b in wynik["shunt_capacitors_contributing"]] == ["BAT"]
        assert wynik["shunt_capacitors_without_zero_path"] == []
    else:
        assert i_c == i_c_odniesienia
        assert wynik["shunt_capacitors_contributing"] == []
        assert wynik["shunt_capacitors_without_zero_path"] == ["BAT"]
    # Model bez baterii: odcisk wejścia bez pola baterii (zamrożone odciski bit w bit).
    assert "shunt_capacitors" not in build_v126_input_from_enm(enm).model_dump(mode="json")
    assert "shunt_capacitors_contributing" not in odniesienie


def test_prad_pojemnosciowy_bateria_jedynym_zrodlem_c0_gotowosc_i_solver_zgodne() -> None:
    """Kable bez B0, bateria w gwieździe uziemionej: gotowość przepuszcza bieg (ten sam
    predykat co suma C0 solvera), solver liczy I_C baterii i nazywa kable pominięte."""
    from application.analyses.v126_gotowosc import ocen_gotowosc_v126

    for uklad, oczekiwana in (("GWIAZDA_UZIEMIONA", True), ("PODWOJNA_GWIAZDA_IZOLOWANA", False)):
        enm = _siec_kompensowana(_bateria(uklad, "jeden_stopien", None, bus_ref=N1))
        gotowosc = ocen_gotowosc_v126(enm, V126AnalysisType.NEUTRAL_EARTHING_DESIGN, {})
        [warunek] = [w for w in gotowosc.warunki if w.kod == "galezie.b0"]
        assert warunek.spelniony is oczekiwana, uklad
        wynik = V126AcademicSolver().run(
            V126AnalysisType.NEUTRAL_EARTHING_DESIGN, _wejscie_projektu_uziemienia(enm)
        )["result"]
        assert ("capacitive_earth_fault_current_a" in wynik) is oczekiwana
        if oczekiwana:
            # Wyłącznie gałęzie sieci SN galwanicznie połączonej z punktem neutralnym — kabel nN
            # (za transformatorem SN/nN, inna sieć galwaniczna) nie wnosi C0 do I_C sieci SN.
            assert wynik["branches_missing_b0"] == ["C_SN"]
            [pominiete] = [w for w in gotowosc.warunki if w.kod == "galezie.bez_b0"]
            assert pominiete.spelniony is False and pominiete.blokujacy is False


# ---------------------------------------------------------------------------
# Walidator: reguły pola BKR (scena z operacji domenowych)
# ---------------------------------------------------------------------------


def _kody_bkr(enm: dict[str, Any]) -> list[str]:
    wynik = ENMValidator().validate(EnergyNetworkModel.model_validate(enm))
    return sorted(
        i.code for i in wynik.issues if i.code in {"E043", "W044", "W045", "W046", "W047", "W048"}
    )


@pytest.mark.parametrize("rezystory", [None, True, False], ids=["robocze", "sa", "brak"])
@pytest.mark.parametrize("liczba_vt", [0, 1, 2])
@pytest.mark.parametrize("przekladnik", [True, False], ids=["z_przekladnikiem", "bez_przekladnika"])
@pytest.mark.parametrize("uklad", [*UKLADY_POLACZEN_BATERII, None])
def test_walidator_przekladniki_pola_bkr(
    uklad: str | None, przekladnik: bool, liczba_vt: int, rezystory: bool | None
) -> None:
    enm = zbuduj_gpz_z_bkr(
        uklad=uklad,
        przekladnik_niezrownowazenia=przekladnik,
        liczba_vt=liczba_vt,
        rezystory_wewnetrzne=rezystory,
        dlawik_mh=DLAWIK_MH if liczba_vt % 2 else None,
    )
    # Układ nienadany: tabliczka typu katalogowego (podwójna gwiazda izolowana).
    uklad_rozstrzygniety = uklad or "PODWOJNA_GWIAZDA_IZOLOWANA"
    oczekiwane: list[str] = []
    if uklad_rozstrzygniety == "PODWOJNA_GWIAZDA_IZOLOWANA" and not przekladnik:
        oczekiwane.append("W046")
    # Rezystory nienadane: wartość robocza „brak rezystorów" (założenie zachowawcze).
    if not rezystory and liczba_vt < 2:
        oczekiwane.append("W047")
    assert _kody_bkr(enm) == oczekiwane
    wynik = ENMValidator().validate(EnergyNetworkModel.model_validate(enm))
    for problem in wynik.issues:
        if problem.code in {"W046", "W047"}:
            # Werdykt wyjaśnialny: kryterium z podstawą, stan modelu i skutek w zdaniu.
            assert "Zeszyt 1" in problem.message_pl
            assert problem.fix_action is not None
            assert problem.fix_action.element_ref == pole_bkr(enm)["ref_id"]


@pytest.mark.parametrize(
    ("budowa", "oczekiwane"),
    [
        ({}, []),
        ({"z_polem": False}, ["W045"]),
        ({"rola_pola": "FEEDER"}, ["W045"]),
        ({"wylaczenie": []}, ["W048"]),
        ({"wylaczenie": None}, ["W048"]),
    ],
    ids=["pole_bkr", "bez_pola", "pole_innej_roli", "bez_transformatorow", "tylko_tr1"],
)
def test_walidator_pole_bkr_i_wylaczenie_od_transformatorow(
    budowa: dict[str, Any], oczekiwane: list[str]
) -> None:
    if budowa.get("wylaczenie", 0) is None:
        # Sprzęgło zamknięte: sekcję 1 zasilają TR1 i TR2 — lista z samym TR1 jest niepełna.
        enm0 = zbuduj_gpz_z_bkr()
        tr1 = sorted(t["ref_id"] for t in enm0["transformers"])[0]
        budowa = {"wylaczenie": [tr1]}
    enm = zbuduj_gpz_z_bkr(**budowa)
    assert _kody_bkr(enm) == oczekiwane


def test_walidator_sprzeglo_otwarte_wystarcza_transformator_sekcji() -> None:
    """Sprzęgło otwarte: baterię zasila wyłącznie TR1 (sekcja 1) — lista z TR1 jest pełna,
    a ta sama lista przy sprzęgle zamkniętym daje W048 (ten sam model, jedna cecha)."""
    enm = zbuduj_gpz_z_bkr()
    tr = sorted(t["ref_id"] for t in enm["transformers"])
    szyna_1 = gpz(enm)["gpz_sections"][0]["bus_ref"]
    [tr1] = [t["ref_id"] for t in enm["transformers"] if t["lv_bus_ref"] == szyna_1]
    enm = ok(
        op(
            enm,
            "update_element_parameters",
            {
                "element_ref": bateria(enm)["ref_id"],
                "parameters": {"wylaczenie_od_transformatorow": [tr1]},
            },
        )
    )
    assert _kody_bkr(enm) == ["W048"]
    sprzeglo = next(b for b in enm["branches"] if b.get("type") == "bus_coupler")
    otwarte = ok(op(enm, "set_normal_open_point", {"switch_ref": sprzeglo["ref_id"]}))
    assert _kody_bkr(otwarte) == []
    assert len(tr) == 2


def test_walidator_wylaczenie_od_transformatora_spoza_modelu() -> None:
    enm = zbuduj_gpz_z_bkr()
    zmieniony = op(
        enm,
        "update_element_parameters",
        {
            "element_ref": bateria(enm)["ref_id"],
            "parameters": {"wylaczenie_od_transformatorow": ["tr/nieistniejacy"]},
        },
    )
    # Operacja odmawia zapisu nieznanego transformatora — ten sam predykat co walidator.
    assert zmieniony.get("error")


def test_stan_stopni_niezgodny_z_typem_e043_i_odmowa_assemblera_z_jednego_predykatu() -> None:
    """Liczba stopni z typu (1), stan stopni na elemencie dwupozycyjny: walidator blokuje E043,
    a liczenie admitancji odmawia nazwanym kodem — ten sam predykat (``niezgodnosc_stopni``)."""
    enm = zbuduj_gpz_z_bkr()
    rekord = dict(bateria(enm))
    rekord["stopnie_zalaczone"] = [True, False]
    enm_niezgodny = {**enm, "shunt_capacitors": [rekord]}
    assert _kody_bkr(enm_niezgodny) == ["E043"]
    with pytest.raises(OdmowaNazwana) as odmowa:
        admitancja_baterii(rekord, napiecie_bazy_kv=15.0, moc_bazy_mva=100.0, czestotliwosc_hz=50.0)
    assert odmowa.value.kod == KOD_BATERIA_STOPNIE_NIEZGODNE
    # Operacja edycji odmawia tego samego stanu (trzeci konsument predykatu).
    assert op(
        enm,
        "update_element_parameters",
        {"element_ref": rekord["ref_id"], "parameters": {"stopnie_zalaczone": [True, False]}},
    ).get("error")


def test_wyrocznia_admitancji_zgodna_z_mostem_dla_kazdej_cechy() -> None:
    """Most produktu (``admitancja_baterii``) i wyrocznia testu dają tę samą admitancję fazy
    dla każdego iloczynu stopnie × dławik (sprawdzian samej wyroczni)."""
    for stopnie in STOPNIE:
        for dlawik_mh in DLAWIKI:
            bat = _bateria("TROJKAT", stopnie, dlawik_mh, bus_ref="S").model_dump(mode="json")
            y_pu = admitancja_baterii(
                bat, napiecie_bazy_kv=U_N_KV, moc_bazy_mva=100.0, czestotliwosc_hz=50.0
            ).y_pu
            y_s = _admitancja_fazy_s(STOPNIE[stopnie][2], dlawik_mh)
            assert y_pu * 100.0 / U_N_KV**2 == pytest.approx(y_s, rel=1e-12)
            assert cmath.isfinite(y_pu)
