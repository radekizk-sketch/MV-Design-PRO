"""Zespół uziemiający SN jako jedyna prawda o uziemieniu punktu neutralnego — sonda liczbowa
i iloczyn cech (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA, rdzeń B-01: składowa zerowa i Z_N).

Każda komórka idzie REALNĄ ścieżką użytkownika: operacja domenowa ``add_grid_source_sn``
(GPZ z równoważnikiem 110 kV, transformatory 110/15 kV Yd11 z katalogu, zespoły uziemiające
sekcji w polach ZU) → model w magazynie → bieg kanoniczny ``create_run``/``execute_run``
z przypadkiem obliczeniowym (``OperatingScenario``: stany łączników, stan AWSC) → wiersz
wyniku. Konsumenci uziemienia czytają TEN SAM model efektywny przypadku.

WYROCZNIA RĘCZNA (niezależna od mapowania i od ``enm.uziemienie_sekcji``):

* U_f = U_n/√3; dławik nastawiony na I_L: X_L = U_f/I_L; rezystor: R_N z katalogu
  (= U_f/I_n, sprawdzone); rezystor wymuszający AWSC o prądzie I_W: R_W = U_f/I_W;
* Z_N wariantu (ENEA Zeszyt 1 §16, rysunki Z.13/Z.14/Z.15): dławik jX_L; rezystor R_N;
  Z.14 R_N‖jX_L; Z.13 jX_L w spoczynku i R_W‖jX_L po załączeniu AWSC;
* bocznik zespołu Z_0,ZU = Z_0,TU + 3·Z_N (IEC 60909-0:2016 §6 — impedancja punktu
  neutralnego wchodzi do obwodu zerowego jako 3·Z_N), Z_0,TU z pozycji katalogu;
* punkt neutralny uzwojenia SN transformatora Dyn11 uziemiony przez R_N: Z_0 = Z_T + 3·R_N,
  Z_T = (u_r + j·√(u_k² − u_r²))·U_rT²/S_rT, u_r = P_k/S_rT (bez korekty K_T — składowa
  zerowa transformatora, ślad ``tr_z0_zt``);
* I″_k1 = √3·c·U_n/|Z_1 + Z_2 + Z_0|, c = 1,1 (sieć SN, scenariusz MAX), Z_2 = Z_1.

ILOCZYN CECH: wariant {izolowany, dławik, dławik + AWSC spoczynek, dławik + AWSC załączony,
rezystor, dławik ‖ rezystor, punkt neutralny uzwojenia TR, uziemienie bezpośrednie,
sprzeczne: bezpośrednie + rezystor} × sekcje {1, 2 ze sprzęgłem zamkniętym, 2 z otwartym}
× ZU {w obu sekcjach, w jednej, w żadnej} × łącznik pola ZU {zamknięty, otwarty} ×
konsument {walidator, Z0/Ik1, dowód przekładników napięciowych, ładunek DER (fakty pola
wytwórcy), V12.6, BayEarthFaultPath}. Kombinacja „ZU w żadnej sekcji × łącznik otwarty”
nie ma łącznika do otwarcia — przypięta jako równa wariantowi bez zespołu (nie jest
sprzeczna, jest pusta). Kombinacje sprzeczne dostają odmowę nazwaną (E-ZU-02), nie liczbę.

KOTWICA 1e6 (``enm/mapping.py``): węzeł odcięty od uziemienia grupą połączeń (Yd11 bez
zespołu) dostaje kotwicę numeryczną i przyczynę ``brak_drogi`` — wiersz bez liczby; Z0
węzłów liczonych jest niezależne od wartości kotwicy (sonda z inną stałą).

IDENTYFIKATORY I HASH: dwa niezależne biegi tego samego modelu dają ten sam artefakt
(wiersze, ślad punktu neutralnego, odcisk modelu); model bez zespołu uziemiającego nie
dostaje żadnego nowego klucza biegu (``punkt_neutralny_sn``, ``stan_awsc``).
"""

from __future__ import annotations

import math
import uuid
from typing import Any

import pytest
from api.analysis_run_exports import _sc_row_bilans_linie
from api.generators import _fakty_pola_wytworcy, _sciezka_zwarcia_dla_pola
from application.field_read_model import droga_doziemna_pola
from application.proof_engine.packs.audit2_skladanie import uziemienie_sn_stacji
from domain.fault_scenario import (
    FaultLocation,
    FaultType,
    ShortCircuitConfig,
    new_fault_scenario,
)
from enm import mapping as mapowanie
from enm.canonical_analysis import (
    OGRANICZENIE_WYNIK_NIEFIZYCZNY,
    OPISY_OGRANICZEN_RAPORTOWYCH_PL,
    build_short_circuit_results,
    create_run,
    execute_run,
    reset_canonical_runs,
)
from enm.domain_operations import execute_domain_operation
from enm.hash import compute_enm_hash
from enm.mapping import _ref_to_uuid, map_enm_to_network_graph
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader
from enm.scenariusze import OperatingScenario, RodzajScenariusza, apply_scenario
from enm.store import reset_enm_store, set_enm
from enm.topology import derive
from enm.uziemienie_sekcji import uziemienie_sieci
from enm.validator import ENMValidator
from network_model.catalog.mv_zespol_uziemiajacy_catalog import (
    get_all_earthing_transformer_records,
    get_all_neutral_earthing_resistor_records,
)
from network_model.core.uziemienie import TYP_PUNKTU_NEUTRALNEGO_WARIANTU
from solver_input.v126_contracts import uziemienie_sn_v126

UN_KV = 15.0
C_MAX = 1.1
U_F_V = UN_KV * 1e3 / math.sqrt(3.0)

TU = "TU_ZNYN11_15KV_PW160"
DLAWIK = "DL_40_400A_15KV_CIAGLY"
REZYSTOR = "REZ_200A_15KV"
I_NASTAWY_A = 100.0
I_AWSC_A = 30.0
TRAFO_WN_SN = "tr-wn-sn-110-15-25mva-yd11"


def _params(rekordy: list[dict], ref: str) -> dict[str, Any]:
    return next(r for r in rekordy if r["id"] == ref)["params"]


_TU = _params(get_all_earthing_transformer_records(), TU)
_REZ = _params(get_all_neutral_earthing_resistor_records(), REZYSTOR)
Z0_TU = complex(_TU["r0_ohm"], _TU["x0_ohm"])
R_N = float(_REZ["r_ohm"])
X_L = U_F_V / I_NASTAWY_A
R_AWSC = U_F_V / I_AWSC_A


def _rownolegle(a: complex, b: complex) -> complex:
    return a * b / (a + b)


#: Z_N wariantu w obwodzie zerowym (bez mnożnika 3) — wyrocznia ręczna; ``None`` = brak
#: drogi przez mały bocznik (sieć izolowana albo skompensowana).
Z_N_WARIANTU: dict[str, complex | None] = {
    "izolowany": None,
    "dlawik": None,
    "dlawik_awsc_spoczynek": None,
    "dlawik_awsc_zalaczony": _rownolegle(complex(R_AWSC, 0.0), complex(0.0, X_L)),
    "rezystor": complex(R_N, 0.0),
    "dlawik_rezystor": _rownolegle(complex(R_N, 0.0), complex(0.0, X_L)),
    "bezposrednie": complex(0.0, 0.0),
}
#: Przyczyna braku wyniku zerowego wariantów bez małej impedancji (§0 pkt 7).
PRZYCZYNA_WARIANTU: dict[str, str] = {
    "izolowany": "brak_drogi",
    "dlawik": "poza_zakresem_iec60909",
    "dlawik_awsc_spoczynek": "poza_zakresem_iec60909",
}


def _zespol(wariant: str, sekcja: int) -> dict[str, Any] | None:
    """Ładunek zespołu uziemiającego sekcji (``add_grid_source_sn.zespoly_uziemiajace``)."""
    dlawik = {"catalog_ref": DLAWIK, "i_nastawy_a": I_NASTAWY_A}
    if wariant in ("izolowany", "uzwojenie_tr"):
        return None
    zespol: dict[str, Any] = {"sekcja": sekcja, "catalog_ref": TU}
    if wariant == "dlawik":
        zespol["dlawik"] = dlawik
    elif wariant.startswith("dlawik_awsc"):
        zespol["dlawik"] = {**dlawik, "awsc": {"i_wymuszany_a": I_AWSC_A}}
    elif wariant == "rezystor":
        zespol["rezystor"] = {"catalog_ref": REZYSTOR}
    elif wariant == "dlawik_rezystor":
        zespol["dlawik"] = dlawik
        zespol["rezystor"] = {"catalog_ref": REZYSTOR}
    elif wariant == "bezposrednie":
        zespol["uziemienie_bezposrednie"] = True
    elif wariant == "sprzeczny":
        zespol["uziemienie_bezposrednie"] = True
        zespol["rezystor"] = {"catalog_ref": REZYSTOR}
    else:
        raise AssertionError(wariant)
    return zespol


def _gpz(sekcje: int, zespoly: list[dict[str, Any]]) -> dict[str, Any]:
    enm = EnergyNetworkModel(
        header=ENMHeader(name="Karta ZU", defaults=ENMDefaults(sn_nominal_kv=UN_KV))
    ).model_dump(mode="json")
    wynik = execute_domain_operation(
        enm_dict=enm,
        op_name="add_grid_source_sn",
        payload={
            "source_name": "GPZ Łąkowa",
            "voltage_kv": UN_KV,
            "sections_count": sekcje,
            "manual_equivalent": {
                "short_circuit_input_side": "HV_110",
                "hv_voltage_kv": 110.0,
                "sk3_hv_mva": 3000.0,
                "rx_ratio": 0.1,
            },
            "transformer_count": sekcje,
            "transformer_catalog_ref": TRAFO_WN_SN,
            "zespoly_uziemiajace": zespoly,
        },
    )
    assert not wynik.get("error"), wynik.get("error")
    return wynik["snapshot"]


def _z_uzwojeniem_tr(migawka: dict[str, Any]) -> dict[str, Any]:
    """Korekta ekspercka transformatora sekcji 1: Dyn11 z punktem neutralnym SN uziemionym
    przez R_N (``update_element_parameters`` — ścieżka projektanta)."""
    tr = next(t for t in migawka["transformers"] if "/001/" in t["ref_id"])
    wynik = execute_domain_operation(
        enm_dict=migawka,
        op_name="update_element_parameters",
        payload={
            "element_ref": tr["ref_id"],
            "parameters": {
                "vector_group": "Dyn11",
                "lv_neutral": {"type": "resistor_grounded", "r_ohm": R_N},
            },
        },
    )
    assert not wynik.get("error"), wynik.get("error")
    return wynik["snapshot"]


def _siec(wariant: str, sekcje: int = 1, zu: str = "jedna") -> dict[str, Any]:
    """Model ``wariant`` w układzie ``sekcje`` z zespołami ``zu`` (obie / jedna / zadna).

    Przy jednej sekcji „obie” = drugi zespół na tej samej szynie (praca równoległa dwóch
    zespołów na jedną sieć) — kreator GPZ przyjmuje jeden zespół na sekcję (odmowa nazwana),
    drugi stawia operacja ``add_zespol_uziemiajacy_sn`` wprost na szynie sekcji."""
    if zu == "zadna":
        zespoly = []
    elif zu == "jedna" or sekcje == 1:
        zespoly = [_zespol(wariant, 1)]
    else:
        zespoly = [_zespol(wariant, 1), _zespol(wariant, 2)]
    migawka = _gpz(sekcje, [z for z in zespoly if z is not None])
    if zu == "obie" and sekcje == 1 and zespoly[0] is not None:
        drugi = {k: v for k, v in zespoly[0].items() if k != "sekcja"}
        wynik = execute_domain_operation(
            enm_dict=migawka,
            op_name="add_zespol_uziemiajacy_sn",
            payload={**drugi, "bus_ref": _szyny(migawka)[0], "name": "Zespół uziemiający 2"},
        )
        assert not wynik.get("error"), wynik.get("error")
        migawka = wynik["snapshot"]
    if wariant == "uzwojenie_tr":
        migawka = _z_uzwojeniem_tr(migawka)
    return migawka


def _szyny(migawka: dict[str, Any]) -> list[str]:
    return [s["bus_ref"] for s in migawka["substations"][0]["gpz_sections"]]


def _lacznik_zu(migawka: dict[str, Any], sekcja: int) -> str:
    """Wyłącznik pola ZU pierwszego zespołu sekcji ``sekcja`` (tor pola: szyna → zacisk)."""
    szyna = _szyny(migawka)[sekcja - 1]
    zespoly = sorted(
        (z for z in migawka["zespoly_uziemiajace"]),
        key=lambda z: z["ref_id"],
    )
    for zespol in zespoly:
        tor = next(
            (
                b
                for b in migawka["branches"]
                if b.get("type") == "breaker" and b["to_bus_ref"] == zespol["bus_ref"]
            ),
            None,
        )
        if tor is not None and tor["from_bus_ref"] == szyna:
            return tor["ref_id"]
    raise AssertionError(f"brak zespołu w sekcji {sekcja}")


def _sprzeglo(migawka: dict[str, Any]) -> str:
    (sprzeglo,) = (b for b in migawka["branches"] if b.get("type") == "bus_coupler")
    return sprzeglo["ref_id"]


def _przypadek(
    migawka: dict[str, Any],
    *,
    otwarte: tuple[str, ...] = (),
    stan_awsc: str = "spoczynek",
    szyna: str | None = None,
) -> OperatingScenario:
    """Przypadek obliczeniowy: stany łączników (scenariusz), stan AWSC i miejsce zwarcia
    (scenariusz zwarcia; bieg ze scenariuszem liczy węzeł zwarcia — domyślnie szyna S1)."""
    zwarcie = new_fault_scenario(
        study_case_id=uuid.UUID(int=1),
        name="Zwarcie doziemne na szynie",
        fault_type=FaultType.SC_1F,
        location=FaultLocation(element_ref=szyna or _szyny(migawka)[0], location_type="BUS"),
        config=ShortCircuitConfig(scenariusz="MAX", stan_awsc=stan_awsc),  # type: ignore[arg-type]
    )
    return OperatingScenario(
        scenario_id="przypadek-zu",
        name="Przypadek zespołu uziemiającego",
        kind=RodzajScenariusza.NORMAL,
        switch_states={ref: "open" for ref in otwarte},
        fault_spec=zwarcie,
    )


@pytest.fixture(autouse=True)
def _czysty_stan():
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


def _bieg(migawka: dict[str, Any], przypadek: OperatingScenario, klucz: str = "zu"):
    set_enm(klucz, EnergyNetworkModel.model_validate(migawka))
    _PRZYPADKI[klucz] = (migawka, przypadek)
    run = create_run(
        case_id=klucz,
        klucz_twin=klucz,
        analysis_type="short_circuit_sn",
        options={"fault_type": "SC_1F"},
        scenariusz=przypadek,
    )
    wynik = execute_run(run.id)
    assert wynik.status == "FINISHED", wynik.error_message
    assert wynik.raw_result is not None
    return wynik


def _wiersze(wynik: Any) -> dict[str, dict[str, Any]]:
    return {r["fault_node_id"]: r for r in wynik.raw_result["results"]}


#: klucz biegu → (migawka, przypadek) — do odczytu węzła topologicznego szyny.
_PRZYPADKI: dict[str, tuple[dict[str, Any], OperatingScenario]] = {}


def _wiersz(wynik: Any, szyna: str) -> dict[str, Any]:
    """Wiersz węzła szyny: szyny scalone zamkniętym łącznikiem (sprzęgło) są jednym węzłem
    topologicznym — wiersz niesie jego reprezentant (``derive`` modelu efektywnego)."""
    migawka, przypadek = _PRZYPADKI[wynik.case_id]
    efektywny = EnergyNetworkModel.model_validate(
        apply_scenario(EnergyNetworkModel.model_validate(migawka), przypadek).snapshot
    )
    wezel = derive(efektywny).wezel_topologiczny.get(szyna, szyna)
    wiersze = _wiersze(wynik)
    return wiersze.get(_ref_to_uuid(szyna)) or wiersze[_ref_to_uuid(wezel)]


def _zespolona(wartosc: dict[str, float]) -> complex:
    return complex(wartosc["re"], wartosc["im"])


def _z_t_ohm(migawka: dict[str, Any]) -> complex:
    tr = next(t for t in migawka["transformers"] if "/001/" in t["ref_id"])
    u_r = tr["pk_kw"] / 1000.0 / tr["sn_mva"]
    u_k = tr["uk_percent"] / 100.0
    return complex(u_r, math.sqrt(u_k**2 - u_r**2)) * tr["ulv_kv"] ** 2 / tr["sn_mva"]


def _ik1(z1: complex, z0: complex) -> float:
    return math.sqrt(3.0) * C_MAX * UN_KV * 1e3 / abs(2.0 * z1 + z0)


def _sprawdz_liczony(wiersz: dict[str, Any], z0_oczekiwane: complex) -> None:
    assert wiersz.get("brak_wyniku_zerowego") is None
    z1 = _zespolona(wiersz["z1_ohm"])
    assert _zespolona(wiersz["z2_ohm"]) == pytest.approx(z1, rel=1e-12)
    assert _zespolona(wiersz["z0_ohm"]) == pytest.approx(z0_oczekiwane, rel=1e-9)
    assert wiersz["ikss_a"] == pytest.approx(_ik1(z1, z0_oczekiwane), rel=1e-9)


def _sprawdz_odmowe(wiersz: dict[str, Any], przyczyna: str) -> None:
    assert wiersz["ikss_a"] is None
    brak = wiersz.get("brak_wyniku_zerowego")
    assert brak is not None and brak["przyczyna"] == przyczyna, brak
    wyjasnienie = brak["wyjasnienie"]
    assert wyjasnienie["zdanie_pl"] and wyjasnienie["przyczyna_pl"]
    assert brak["kod"].startswith("fault.zero_sequence_")
    assert brak["status"] in ("NIE_DOTYCZY", "BRAK_PODSTAWY")
    # Werdykt wyjaśnialny: brak podstawy nazywa, czego brakuje; ref_id nie trafia do zdania.
    if brak["status"] == "BRAK_PODSTAWY":
        assert wyjasnienie["czego_brakuje"]
    for ref_id in brak["elementy"]:
        assert ref_id not in wyjasnienie["zdanie_pl"]


# ---------------------------------------------------------------------------
# Sonda liczbowa: wariant × stan AWSC (jedna sekcja, zespół w polu ZU zamkniętym)
# ---------------------------------------------------------------------------

WARIANTY_SONDY = (
    ("izolowany", "spoczynek"),
    ("dlawik", "spoczynek"),
    ("dlawik_awsc", "spoczynek"),
    ("dlawik_awsc", "zalaczony"),
    ("rezystor", "spoczynek"),
    ("dlawik_rezystor", "spoczynek"),
    ("bezposrednie", "spoczynek"),
    ("uzwojenie_tr", "spoczynek"),
)


def _klucz_wariantu(wariant: str, stan: str) -> str:
    return f"{wariant}_{stan}" if wariant == "dlawik_awsc" else wariant


@pytest.mark.parametrize(("wariant", "stan_awsc"), WARIANTY_SONDY)
def test_sonda_ik1_wariantu_z_wyroczni_recznej(wariant: str, stan_awsc: str) -> None:
    migawka = _siec(wariant)
    wiersz = _wiersz(_bieg(migawka, _przypadek(migawka, stan_awsc=stan_awsc)), _szyny(migawka)[0])
    if wariant == "uzwojenie_tr":
        _sprawdz_liczony(wiersz, _z_t_ohm(migawka) + 3.0 * R_N)
        return
    klucz = _klucz_wariantu(wariant, stan_awsc)
    z_n = Z_N_WARIANTU[klucz]
    if z_n is None:
        _sprawdz_odmowe(wiersz, PRZYCZYNA_WARIANTU[klucz])
        return
    _sprawdz_liczony(wiersz, Z0_TU + 3.0 * z_n)


def test_sonda_wartosci_bezwzgledne_z_podstawa() -> None:
    """Liczby przepisane do dokumentu karty (sonda B-01) — przypięte, by dokument nie kłamał.

    R_N = 43,3 Ω (U_f/200 A), X_L = 86,60 Ω (U_f/100 A), R_W = 288,7 Ω (U_f/30 A),
    Z_0,TU = 1,5 + j6,0 Ω (katalog, wartość robocza)."""
    assert R_N == pytest.approx(U_F_V / 200.0, rel=1e-3)
    oczekiwane = {
        # Z0 = Z_0,TU + 3R_N = 131,40+j6,00 Ω → |2Z1+Z0| = 131,75 Ω → 28 579 V / 131,75 Ω
        "rezystor": 216.9,
        # Z_N = R_N‖jX_L = 34,64+j17,32 Ω → Z0 = 105,42+j57,96 Ω → |2Z1+Z0| = 121,42 Ω
        "dlawik_rezystor": 235.4,
        # Z_N = R_W‖jX_L = 23,84+j79,45 Ω → Z0 = 73,01+j244,36 Ω → |2Z1+Z0| = 257,1 Ω
        "dlawik_awsc_zalaczony": 111.2,
        # Z0 = Z_0,TU = 1,5+j6,0 Ω → |2Z1+Z0| = 8,26 Ω
        "bezposrednie": 3_460.0,
    }
    for klucz, ik1 in oczekiwane.items():
        wariant, stan = (
            ("dlawik_awsc", "zalaczony")
            if klucz == "dlawik_awsc_zalaczony"
            else (klucz, "spoczynek")
        )
        migawka = _siec(wariant)
        wiersz = _wiersz(
            _bieg(migawka, _przypadek(migawka, stan_awsc=stan), klucz=klucz), _szyny(migawka)[0]
        )
        assert wiersz["ikss_a"] == pytest.approx(ik1, rel=5e-3), (klucz, wiersz["ikss_a"])


def test_slad_white_box_niesie_oba_stany_awsc() -> None:
    """Z.13: ślad punktu neutralnego niesie Z_N w spoczynku (jX_L) i po załączeniu AWSC
    (R_W‖jX_L) w KAŻDYM stanie przypadku; stan przypadku w artefakcie tylko przy załączonej."""
    migawka = _siec("dlawik_awsc")
    for stan in ("spoczynek", "zalaczony"):
        wynik = _bieg(migawka, _przypadek(migawka, stan_awsc=stan), klucz=f"slad-{stan}")
        (krok,) = wynik.raw_result["punkt_neutralny_sn"]
        assert krok["inputs"]["stan_awsc"] == stan
        assert _zespolona(krok["inputs"]["z_n_spoczynek_ohm"]) == pytest.approx(
            complex(0.0, X_L), rel=1e-12
        )
        assert _zespolona(krok["inputs"]["z_n_awsc_zalaczony_ohm"]) == pytest.approx(
            Z_N_WARIANTU["dlawik_awsc_zalaczony"], rel=1e-12
        )
        if stan == "zalaczony":
            assert wynik.raw_result["stan_awsc"] == "zalaczony"
        else:
            assert "stan_awsc" not in wynik.raw_result


def test_kombinacja_sprzeczna_to_odmowa_nazwana_nie_liczba() -> None:
    """Uziemienie bezpośrednie razem z rezystorem: operacja odmawia na wejściu, a rekord
    sprzeczny z innej drogi wczytania (import archiwum) daje E-ZU-02 walidatora i nazwaną
    przyczynę u konsumentów zamiast typu."""
    with pytest.raises(AssertionError, match="Uziemienie bezpośrednie"):
        _siec("sprzeczny")
    migawka = _siec("rezystor")
    migawka["zespoly_uziemiajace"][0]["uziemienie_bezposrednie"] = True
    enm = EnergyNetworkModel.model_validate(migawka)
    kody = [i.code for i in ENMValidator().validate(enm).issues]
    assert "E-ZU-02" in kody
    (sekcja,) = uziemienie_sieci(enm)
    assert sekcja.odmowy and "sprzeczne" in sekcja.odmowy[0]
    assert uziemienie_sn_v126(enm).przyczyna_braku_pl
    stacja = enm.substations[0].ref_id
    (pole,) = uziemienie_sn_stacji(enm, stacja, ["Pole liniowe 01"])["pola"]
    assert pole["typ_punktu_neutralnego"] is None and pole["przyczyna_braku"]


# ---------------------------------------------------------------------------
# Iloczyn: sekcje × ZU × łącznik pola ZU (wariant Z.15 — liczby z wyroczni)
# ---------------------------------------------------------------------------

Z0_ZU = Z0_TU + 3.0 * R_N

#: (sekcje, sprzęgło, ZU, łącznik ZU sekcji 1) → oczekiwanie na szynie S1 i S2: liczba
#: (Z0) albo przyczyna braku wyniku zerowego.
UKLADY: dict[tuple[int, str, str, str], tuple[Any, Any]] = {
    (1, "-", "obie", "zamkniety"): (Z0_ZU / 2.0, None),
    (1, "-", "obie", "otwarty"): (Z0_ZU, None),
    (1, "-", "jedna", "zamkniety"): (Z0_ZU, None),
    (1, "-", "jedna", "otwarty"): ("brak_drogi", None),
    (1, "-", "zadna", "zamkniety"): ("brak_drogi", None),
    (1, "-", "zadna", "otwarty"): ("brak_drogi", None),
    (2, "zamkniete", "obie", "zamkniety"): (Z0_ZU / 2.0, Z0_ZU / 2.0),
    (2, "zamkniete", "obie", "otwarty"): (Z0_ZU, Z0_ZU),
    (2, "zamkniete", "jedna", "zamkniety"): (Z0_ZU, Z0_ZU),
    (2, "zamkniete", "jedna", "otwarty"): ("brak_drogi", "brak_drogi"),
    (2, "zamkniete", "zadna", "zamkniety"): ("brak_drogi", "brak_drogi"),
    (2, "zamkniete", "zadna", "otwarty"): ("brak_drogi", "brak_drogi"),
    (2, "otwarte", "obie", "zamkniety"): (Z0_ZU, Z0_ZU),
    (2, "otwarte", "obie", "otwarty"): ("brak_drogi", Z0_ZU),
    (2, "otwarte", "jedna", "zamkniety"): (Z0_ZU, "brak_drogi"),
    (2, "otwarte", "jedna", "otwarty"): ("brak_drogi", "brak_drogi"),
    (2, "otwarte", "zadna", "zamkniety"): ("brak_drogi", "brak_drogi"),
    (2, "otwarte", "zadna", "otwarty"): ("brak_drogi", "brak_drogi"),
}


def _uklad(
    sekcje: int, sprzeglo: str, zu: str, lacznik: str, szyna_zwarcia: int = 0
) -> tuple[dict[str, Any], OperatingScenario]:
    migawka = _siec("rezystor", sekcje=sekcje, zu=zu)
    otwarte: list[str] = []
    if sprzeglo == "otwarte":
        otwarte.append(_sprzeglo(migawka))
    if lacznik == "otwarty" and zu != "zadna":
        otwarte.append(_lacznik_zu(migawka, 1))
    return migawka, _przypadek(
        migawka, otwarte=tuple(otwarte), szyna=_szyny(migawka)[szyna_zwarcia]
    )


@pytest.mark.parametrize(("sekcje", "sprzeglo", "zu", "lacznik"), sorted(UKLADY))
def test_iloczyn_sekcji_zu_i_lacznika_ik1_z_wyroczni(
    sekcje: int, sprzeglo: str, zu: str, lacznik: str
) -> None:
    oczekiwania = UKLADY[(sekcje, sprzeglo, zu, lacznik)][:sekcje]
    for indeks, oczekiwanie in enumerate(oczekiwania):
        # Zwarcie na szynie sekcji ``indeks`` (bieg ze scenariuszem liczy węzeł zwarcia).
        migawka, przypadek = _uklad(sekcje, sprzeglo, zu, lacznik, szyna_zwarcia=indeks)
        szyna = _szyny(migawka)[indeks]
        wiersz = _wiersz(_bieg(migawka, przypadek, klucz=f"uklad-{indeks}"), szyna)
        if isinstance(oczekiwanie, str):
            _sprawdz_odmowe(wiersz, oczekiwanie)
        else:
            _sprawdz_liczony(wiersz, oczekiwanie)


# ---------------------------------------------------------------------------
# Iloczyn: konsumenci × wariant × układ (jedna prawda — ten sam model efektywny)
# ---------------------------------------------------------------------------

WARIANTY_KONSUMENTOW = (
    "izolowany",
    "dlawik",
    "dlawik_awsc",
    "rezystor",
    "dlawik_rezystor",
    "uzwojenie_tr",
)
UKLADY_KONSUMENTOW = (
    (1, "-", "jedna", "zamkniety"),
    (1, "-", "jedna", "otwarty"),
    (1, "-", "obie", "zamkniety"),
    (2, "zamkniete", "jedna", "zamkniety"),
    (2, "otwarte", "jedna", "zamkniety"),
    (2, "otwarte", "obie", "zamkniety"),
)


def _wariant_sekcji(wariant: str, w_sekcji: bool) -> str:
    """Wariant sieci SN sekcji wg wyroczni (spoczynek AWSC)."""
    if not w_sekcji or wariant == "izolowany":
        return "izolowany"
    if wariant == "uzwojenie_tr":
        return "rezystor"
    return wariant


def _sekcje_z_uziemieniem(sekcje: int, sprzeglo: str, zu: str, lacznik: str) -> tuple[bool, bool]:
    """Czy sieć SN szyny S1 / S2 ma zespół (albo uzwojenie TR) w ruchu."""
    s1 = zu in ("obie", "jedna") and not (lacznik == "otwarty" and zu == "jedna")
    if zu == "obie" and sekcje == 1:
        s1 = True
    s2 = (zu == "obie") or (sprzeglo == "zamkniete" and s1)
    return s1, s2


@pytest.mark.parametrize("uklad", UKLADY_KONSUMENTOW, ids=lambda u: "-".join(map(str, u)))
@pytest.mark.parametrize("wariant", WARIANTY_KONSUMENTOW)
def test_konsumenci_czytaja_jedna_prawde(wariant: str, uklad: tuple[int, str, str, str]) -> None:
    sekcje, sprzeglo, zu, lacznik = uklad
    migawka = _siec(wariant, sekcje=sekcje, zu=zu)
    otwarte: list[str] = []
    if sprzeglo == "otwarte":
        otwarte.append(_sprzeglo(migawka))
    if lacznik == "otwarty" and wariant != "uzwojenie_tr" and migawka["zespoly_uziemiajace"]:
        otwarte.append(_lacznik_zu(migawka, 1))
    bazowy = EnergyNetworkModel.model_validate(migawka)
    przypadek = _przypadek(migawka, otwarte=tuple(otwarte))
    enm = EnergyNetworkModel.model_validate(apply_scenario(bazowy, przypadek).snapshot)
    szyny = _szyny(migawka)

    if wariant == "uzwojenie_tr":
        w_s1, w_s2 = True, sekcje == 2 and sprzeglo == "zamkniete"
    elif wariant == "izolowany":
        w_s1 = w_s2 = False
    else:
        w_s1, w_s2 = _sekcje_z_uziemieniem(sekcje, sprzeglo, zu, lacznik)
    oczekiwane = [_wariant_sekcji(wariant, w_s1), _wariant_sekcji(wariant, w_s2)][:sekcje]

    # Jedna prawda: uziemienie każdej sieci SN.
    sekcja_szyny = {s: u for u in uziemienie_sieci(enm) for s in u.szyny}
    warianty = [sekcja_szyny[s].wariant("spoczynek") for s in szyny]
    assert warianty == oczekiwane

    # Walidator: praca równoległa zespołów na jednej sieci → W-ZU-04 z wyjaśnieniem.
    problemy = ENMValidator().validate(enm).issues
    rownolegle = sum(
        1
        for s in {id(u): u for u in sekcja_szyny.values()}.values()
        if len([p for p in s.punkty_w_ruchu if p.rodzaj == "zespol_uziemiajacy"]) > 1
    )
    assert sum(1 for i in problemy if i.code == "W-ZU-04") == rownolegle
    if wariant in ("rezystor", "dlawik_rezystor") and enm.zespoly_uziemiajace:
        # Rezystor bez wyłączenia od TR WN/SN (IRiESD II.4.5.4.3) — ostrzeżenie z treścią.
        assert any(i.code == "W-ZU-02" and i.message_pl for i in problemy)

    # Dowód przekładników napięciowych (pola stacji po oznaczeniu).
    stacja = enm.substations[0].ref_id
    pola_gpz = sorted(
        (b for b in enm.bays if b.substation_ref == stacja and b.bay_role != "ZU"),
        key=lambda b: b.bus_ref,
    )
    for pole in pola_gpz:
        oznaczenie = pole.bay_number or pole.feeder_short_name or pole.name
        (wpis,) = uziemienie_sn_stacji(enm, stacja, [oznaczenie])["pola"]
        oczekiwany_typ = TYP_PUNKTU_NEUTRALNEGO_WARIANTU[oczekiwane[szyny.index(pole.bus_ref)]]
        if wpis["typ_punktu_neutralnego"] is None:
            # Oznaczenie wspólne dla pól różnych sekcji o różnym uziemieniu — przyczyna.
            assert wpis["przyczyna_braku"]
        else:
            assert wpis["typ_punktu_neutralnego"] == oczekiwany_typ

    # BayEarthFaultPath (dana modelu, bez biegu) i fakty pola wytwórcy (dobór funkcji DER).
    for pole in sorted(enm.bays, key=lambda b: b.ref_id):
        szyna = pole.bus_ref
        if szyna not in szyny or pole.bay_role == "ZU":
            continue
        droga = droga_doziemna_pola(enm, pole.ref_id).model_dump(mode="json")
        oczekiwany_typ = TYP_PUNKTU_NEUTRALNEGO_WARIANTU[oczekiwane[szyny.index(szyna)]]
        assert droga["neutral_grounding_mode"] == oczekiwany_typ
        sekcja = sekcja_szyny[szyna]
        zespoly = [p.element_ref for p in sekcja.punkty_w_ruchu if p.rodzaj == "zespol_uziemiajacy"]
        assert droga["grounding_device_ref"] == (zespoly[0] if zespoly else None)
        fakty = _fakty_pola_wytworcy(
            {"ref_id": "pv-1", "gen_type": "pv_inverter", "p_mw": 1.0},
            _sciezka_zwarcia_dla_pola(enm, pole.ref_id),
        )
        assert fakty.neutral_grounding_mode == oczekiwany_typ

    # V12.6: jedna sieć albo nazwana przyczyna (sieci o różnym uziemieniu).
    v126 = uziemienie_sn_v126(enm)
    if len(set(oczekiwane)) == 1:
        assert v126.wariant == oczekiwane[0] and v126.przyczyna_braku_pl is None
    else:
        assert v126.wariant is None and v126.przyczyna_braku_pl


# ---------------------------------------------------------------------------
# Przyczyny braku wyniku zerowego i kotwica numeryczna
# ---------------------------------------------------------------------------


def test_wezly_wn_bez_z0_zrodla_to_brak_danych_a_sn_liczy_sie_z_zespolu() -> None:
    """§0 pkt 3: Z0 źródła 110 kV nie decyduje o sieci SN. Bez Z0 równoważnika bieg 1F NIE
    jest blokowany (W002 ostrzega), węzeł 110 kV dostaje ``brak_danych`` ze źródłem
    w elementach, a szyna SN za Yd11 liczy się z zespołu."""
    migawka = _siec("rezystor")
    enm = EnergyNetworkModel.model_validate(migawka)
    walidacja = ENMValidator().validate(enm)
    assert "W002" in [i.code for i in walidacja.issues]
    assert walidacja.analysis_available.short_circuit_1f is True
    szyna_wn = next(b["ref_id"] for b in migawka["buses"] if b["voltage_kv"] == 110.0)
    wiersz_wn = _wiersz(_bieg(migawka, _przypadek(migawka, szyna=szyna_wn), klucz="wn"), szyna_wn)
    _sprawdz_odmowe(wiersz_wn, "brak_danych")
    assert wiersz_wn["brak_wyniku_zerowego"]["status"] == "BRAK_PODSTAWY"
    assert wiersz_wn["brak_wyniku_zerowego"]["elementy"] == [migawka["sources"][0]["ref_id"]]
    _sprawdz_liczony(
        _wiersz(_bieg(migawka, _przypadek(migawka), klucz="sn"), _szyny(migawka)[0]), Z0_ZU
    )


def _wiersz_odpowiedzi(wynik: Any, szyna: str) -> dict[str, Any]:
    """Wiersz ODPOWIEDZI wyników zwarć (ekran, raport, porównanie) dla szyny."""
    uuid_wezla = _wiersz(wynik, szyna)["fault_node_id"]
    return next(
        r for r in build_short_circuit_results(wynik)["rows"] if r["target_id"] == uuid_wezla
    )


@pytest.mark.parametrize(
    ("wariant", "napiecie_szyny", "przyczyna"),
    [
        ("izolowany", UN_KV, "brak_drogi"),
        ("dlawik", UN_KV, "poza_zakresem_iec60909"),
        ("rezystor", 110.0, "brak_danych"),
        ("rezystor", UN_KV, None),
    ],
)
def test_wiersz_odpowiedzi_niesie_nazwana_przyczyne(
    wariant: str, napiecie_szyny: float, przyczyna: str | None
) -> None:
    """§0 pkt 7: nazwana przyczyna braku wyniku zerowego przechodzi z artefaktu biegu do
    wiersza odpowiedzi (``non_physical_reason`` = kod, ``brak_wyniku_zerowego``), a opis
    ograniczenia raportowego jest jej wyjaśnieniem — nie ogólnikiem o wartości nieskończonej.
    Wiersz liczony nie niesie żadnego z tych pól (addytywność)."""
    migawka = _siec(wariant)
    szyna = next(b["ref_id"] for b in migawka["buses"] if b["voltage_kv"] == napiecie_szyny)
    wynik = _bieg(migawka, _przypadek(migawka, szyna=szyna), klucz=f"odp-{wariant}")
    wiersz = _wiersz_odpowiedzi(wynik, szyna)
    if przyczyna is None:
        assert "non_physical_reason" not in wiersz
        assert "brak_wyniku_zerowego" not in wiersz
        assert wiersz["ikss_ka"] is not None
        assert OGRANICZENIE_WYNIK_NIEFIZYCZNY not in wiersz["reporting_limitations"]
        assert not any(
            linia.startswith("Ograniczenie wyniku:") for linia in _sc_row_bilans_linie(wiersz)
        )
        return
    brak = wiersz["brak_wyniku_zerowego"]
    assert brak["przyczyna"] == przyczyna
    assert wiersz["non_physical_reason"] == brak["kod"]
    assert brak["kod"].startswith("fault.zero_sequence_")
    assert wiersz["ikss_ka"] is None
    assert wiersz["reporting_status"] == "not_reportable"
    assert wiersz["reporting_limitations"] == [OGRANICZENIE_WYNIK_NIEFIZYCZNY]
    assert wiersz["reporting_limitations_pl"] == [brak["wyjasnienie"]["zdanie_pl"]]
    assert (
        brak["wyjasnienie"]["zdanie_pl"]
        != OPISY_OGRANICZEN_RAPORTOWYCH_PL[OGRANICZENIE_WYNIK_NIEFIZYCZNY]
    )
    # Raport PDF/DOCX: wiersz bez liczb niesie zdanie przyczyny, nie same kreski.
    assert f"Ograniczenie wyniku: {brak['wyjasnienie']['zdanie_pl']}" in _sc_row_bilans_linie(
        wiersz
    )


def test_galaz_bez_z0_odcina_wezel_brak_danych() -> None:
    """Trzecia przyczyna: gałąź w ruchu bez R′0/X′0 odcina węzeł od zespołu — wynik
    zerowy węzła za nią nazwany ``brak_danych`` (bezpośrednio na mapowaniu: bieg blokuje
    W001 wcześniej, bo przy drodze równoległej brak nie byłby widoczny w klasyfikacji)."""
    migawka = _siec("rezystor")
    szyna = _szyny(migawka)[0]
    migawka["buses"].append(
        {"ref_id": "szyna-za-kablem", "name": "Szyna za kablem", "voltage_kv": UN_KV}
    )
    migawka["branches"].append(
        {
            "ref_id": "kabel-bez-z0",
            "name": "Kabel bez danych zerowych",
            "type": "cable",
            "from_bus_ref": szyna,
            "to_bus_ref": "szyna-za-kablem",
            "length_km": 1.0,
            "r_ohm_per_km": 0.125,
            "x_ohm_per_km": 0.086,
            "catalog_ref": "cable-base-xlpe-al-3c-240",
        }
    )
    enm = EnergyNetworkModel.model_validate(migawka)
    siec = mapowanie.zbuduj_siec_zerowa(enm, map_enm_to_network_graph(enm))
    brak = siec.przyczyny[_ref_to_uuid("szyna-za-kablem")]
    assert brak.przyczyna == "brak_danych"
    assert brak.elementy == ("kabel-bez-z0",)
    assert _ref_to_uuid(szyna) not in siec.przyczyny


def test_kotwica_1e6_nie_udaje_uziemienia(monkeypatch: pytest.MonkeyPatch) -> None:
    """§0 pkt 7: węzeł odcięty grupą połączeń (Yd11, sekcja 2 bez zespołu, sprzęgło
    otwarte) — wiersz bez liczby z przyczyną ``brak_drogi``; Z0 węzła liczonego (sekcja 1)
    nie zależy od wartości kotwicy (blok rozprzężony)."""
    migawka, przypadek = _uklad(2, "otwarte", "jedna", "zamkniety")
    enm = EnergyNetworkModel.model_validate(
        apply_scenario(EnergyNetworkModel.model_validate(migawka), przypadek).snapshot
    )
    graf = map_enm_to_network_graph(enm)
    siec = mapowanie.zbuduj_siec_zerowa(enm, graf)
    s1, s2 = (_ref_to_uuid(s) for s in _szyny(migawka))
    assert siec.przyczyny[s2].przyczyna == "brak_drogi"
    assert s1 not in siec.przyczyny
    indeks = mapowanie.AdmittanceMatrixBuilder(graf)
    indeks.build(siec_zwarciowa=True)
    i1 = indeks.node_id_to_index[s1]
    z0_s1 = siec.z0_bus[i1, i1]

    zrodlo = mapowanie._assemble_zero_sequence_y0

    def _inna_kotwica(*args: Any, **kwargs: Any) -> Any:
        wynik = zrodlo(*args, **kwargs)
        for idx in range(wynik.size):
            if wynik.y0_bus[idx, idx] == complex(1e6, 0.0):
                wynik.y0_bus[idx, idx] = complex(1e3, 0.0)
        return wynik

    monkeypatch.setattr(mapowanie, "_assemble_zero_sequence_y0", _inna_kotwica)
    siec_inna = mapowanie.zbuduj_siec_zerowa(enm, graf)
    assert siec_inna.z0_bus[i1, i1] == pytest.approx(z0_s1, rel=1e-12)
    # Wiersz kotwicy: Z0 = 1/Y_kotwicy — wartość czysto numeryczna, której bieg nie pokazuje.
    i2 = indeks.node_id_to_index[s2]
    assert siec.z0_bus[i2, i2] == pytest.approx(1.0 / complex(1e6, 0.0), rel=1e-9)
    assert siec_inna.z0_bus[i2, i2] == pytest.approx(1.0 / complex(1e3, 0.0), rel=1e-9)


# ---------------------------------------------------------------------------
# Determinizm i hash
# ---------------------------------------------------------------------------


def _bez_identyfikatorow_biegu(raw: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in raw.items() if k not in ("run_id", "proof_refs")}


def test_determinizm_dwa_biegi_ten_sam_artefakt_i_odcisk() -> None:
    migawka_a = _siec("dlawik_rezystor", sekcje=2, zu="obie")
    migawka_b = _siec("dlawik_rezystor", sekcje=2, zu="obie")
    assert compute_enm_hash(EnergyNetworkModel.model_validate(migawka_a)) == compute_enm_hash(
        EnergyNetworkModel.model_validate(migawka_b)
    )
    assert [z["ref_id"] for z in migawka_a["zespoly_uziemiajace"]] == [
        z["ref_id"] for z in migawka_b["zespoly_uziemiajace"]
    ]
    a = _bieg(migawka_a, _przypadek(migawka_a), klucz="det-a")
    b = _bieg(migawka_b, _przypadek(migawka_b), klucz="det-b")
    wiersze_a = {k: (v["ikss_a"], v["z0_ohm"]) for k, v in _wiersze(a).items()}
    wiersze_b = {k: (v["ikss_a"], v["z0_ohm"]) for k, v in _wiersze(b).items()}
    assert wiersze_a == wiersze_b
    assert a.raw_result["punkt_neutralny_sn"] == b.raw_result["punkt_neutralny_sn"]


def test_model_bez_zespolu_bez_nowych_kluczy_biegu() -> None:
    migawka = _siec("izolowany")
    wynik = _bieg(migawka, _przypadek(migawka))
    assert "punkt_neutralny_sn" not in wynik.raw_result
    assert "stan_awsc" not in wynik.raw_result


# ---------------------------------------------------------------------------
# V12.6 — prąd pojemnościowy sieci SN z tej samej prawdy (predykaty parami)
# ---------------------------------------------------------------------------

KABEL_SN = "cable-tfk-yakxs-3x120"
#: B′0 kabla wpisany przez projektanta w odcinku (``zero_sequence``): kabel SN o polu
#: promieniowym — pojemność doziemna żyły = pojemność robocza C′ = 390 nF/km pozycji katalogu.
#: Katalog linii i kabli SN nie niesie B′0 (żadna pozycja — patrz dokument karty §6).
B0_KABLA_S_PER_KM = 2.0 * math.pi * 50.0 * 390e-9


def _z_magistrala(migawka: dict[str, Any], dlugosci_m: tuple[int, ...]) -> dict[str, Any]:
    for dlugosc in dlugosci_m:
        odcinek = {
            "rodzaj": "KABEL",
            "dlugosc_m": dlugosc,
            "catalog_ref": KABEL_SN,
            "zero_sequence": {"b0_siemens_per_km": B0_KABLA_S_PER_KM},
        }
        wynik = execute_domain_operation(
            enm_dict=migawka,
            op_name="continue_trunk_segment_sn",
            payload={"segment": odcinek},
        )
        assert not wynik.get("error"), wynik.get("error")
        migawka = wynik["snapshot"]
    return migawka


@pytest.mark.parametrize("wariant", ["dlawik", "rezystor", "dlawik_rezystor"])
@pytest.mark.parametrize("dlugosci_m", [(2000,), (1500, 3500)], ids=["1-odcinek", "2-odcinki"])
def test_v126_prad_pojemnosciowy_rowny_jedynej_prawdzie(
    wariant: str, dlugosci_m: tuple[int, ...]
) -> None:
    """Projekt uziemienia V12.6 liczy I_C = √3·U_n·B_0 z TEJ SAMEJ sieci SN co
    ``uziemienie_sieci`` (ten sam predykat gałęzi ``galezie_sieci_sn`` i to samo U_n).

    Sonda przed kartą: w modelu GPZ 110/15 kV solver brał U_l = najwyższe napięcie szyny
    MODELU (110 kV), więc I_C był zawyżony 110/15 = 7,33 raza, a do B_0 wchodziła każda linia
    i kabel modelu, także spoza sieci SN."""
    from network_model.solvers.v126_academic import V126AcademicSolver
    from solver_input.v126_contracts import V126AnalysisType, build_v126_input_from_enm

    enm = EnergyNetworkModel.model_validate(_z_magistrala(_siec(wariant), dlugosci_m))
    assert any(b.voltage_kv == 110.0 for b in enm.buses)
    (siec,) = uziemienie_sieci(enm)
    assert siec.b0_s > 0.0 and not siec.galezie_bez_b0
    wejscie = build_v126_input_from_enm(enm, analysis_type=V126AnalysisType.NEUTRAL_EARTHING_DESIGN)
    assert wejscie.uziemienie_sn is not None
    (siec_v126,) = wejscie.uziemienie_sn.sieci
    assert siec_v126.napiecie_kv == UN_KV
    assert len(siec_v126.galezie_sieci) == len(dlugosci_m)
    wynik = V126AcademicSolver().run(V126AnalysisType.NEUTRAL_EARTHING_DESIGN, wejscie)["result"]
    assert wynik["network_line_voltage_kv"] == UN_KV
    assert siec.prad_pojemnosciowy_a is not None
    # Wynik V12.6 zaokrąglony do 4 miejsc (``_round(ic_a, 4)``).
    assert wynik["capacitive_earth_fault_current_a"] == pytest.approx(
        siec.prad_pojemnosciowy_a, abs=1e-4
    )
    # Wyrocznia ręczna: I_C = √3·U_n·ΣB0·ℓ.
    b0 = sum(
        g.b0_siemens_per_km * g.length_km
        for g in enm.branches
        if getattr(g, "b0_siemens_per_km", None) is not None
    )
    assert wynik["capacitive_earth_fault_current_a"] == pytest.approx(
        math.sqrt(3.0) * UN_KV * 1e3 * b0, abs=1e-4
    )


@pytest.mark.parametrize("wariant", ["rezystor", "dlawik_rezystor", "uzwojenie_tr"])
@pytest.mark.parametrize("t_wyl_s", [None, 1.0])
def test_v126_rezystor_z_modelu_z_danymi_przyjetymi(wariant: str, t_wyl_s: float | None) -> None:
    """Projekt uziemienia rezystorowego V12.6 sprawdza REZYSTOR MODELU (§0 pkt 4): R, I_n, t_n
    z zespołu (pozycja katalogu z wartościami roboczymi → dane przyjęte ESTIMATED, NIEPELNY)
    albo z uzwojenia TR uziemionego przez R_N (R projektanta, I_n z R, t_n roboczy). W Z.14
    dławik w ruchu kompensuje I_C prądem nastawy. Iloczyn: wariant × czas wyłączenia."""
    from network_model.solvers.v126_academic import V126AcademicSolver
    from solver_input.v126_contracts import V126AnalysisType, build_v126_input_from_enm

    enm = EnergyNetworkModel.model_validate(_z_magistrala(_siec(wariant), (2000,)))
    parametry = {} if t_wyl_s is None else {"ner_clearing_time_s": t_wyl_s}
    wejscie = build_v126_input_from_enm(
        enm, parameters=parametry, analysis_type=V126AnalysisType.NEUTRAL_EARTHING_DESIGN
    )
    wejscie = wejscie.model_copy(update={"parameters": parametry})
    assert wejscie.uziemienie_sn is not None
    (uziemienie,) = wejscie.uziemienie_sn.sieci
    (rezystor,) = uziemienie.rezystory
    assert rezystor.r_ohm == pytest.approx(R_N, rel=1e-9)
    assert rezystor.i_n_a == pytest.approx(
        200.0 if wariant != "uzwojenie_tr" else U_F_V / R_N, rel=1e-9
    )
    assert rezystor.t_n_s == 10.0
    nazwy = [d.nazwa_pl for d in uziemienie.dane_przyjete]
    assert any(n.startswith("Dopuszczalny czas przepływu") for n in nazwy)
    # Nastawa dławika projektanta (MODEL): zakres dławika nie kształtuje prądu — bez wpisu.
    assert not any(n.startswith("Prąd minimalny zakresu") for n in nazwy)
    assert not any(n.startswith("Prąd maksymalny zakresu") for n in nazwy)
    assert uziemienie.prad_dlawikow_a == (I_NASTAWY_A if wariant == "dlawik_rezystor" else None)

    wynik = V126AcademicSolver().run(V126AnalysisType.NEUTRAL_EARTHING_DESIGN, wejscie)["result"]
    assert wynik["neutral_earthing_type"] == "resistor_grounded"
    assert wynik["kompletnosc_dowodu"] == "NIEPELNY"
    assert wynik["resistor_ohm"] == pytest.approx(R_N, abs=1e-4)
    i_r = U_F_V / R_N
    i_c = wynik["capacitive_earth_fault_current_a"]
    i_l = I_NASTAWY_A if wariant == "dlawik_rezystor" else 0.0
    assert wynik["resultant_earth_fault_current_a"] == pytest.approx(
        math.hypot(i_r, i_c - i_l), abs=1e-3
    )
    if t_wyl_s is None:
        assert wynik["thermal_check"]["missing_fields"] == ["ner_clearing_time_s"]
    else:
        assert wynik["thermal_check"]["energy_dissipated_j"] == pytest.approx(
            i_r**2 * R_N * t_wyl_s, rel=1e-6
        )


# ---------------------------------------------------------------------------
# Dane przyjęte bocznika zespołu w wierszach zwarcia doziemnego (§0 pkt 4, zasada nr 4)
# ---------------------------------------------------------------------------

_R0_TU = "Rezystancja zerowa transformatora uziemiającego R0"
_X0_TU = "Reaktancja zerowa transformatora uziemiającego X0"
_R_REZ = "Rezystancja rezystora uziemiającego"
_I_AWSC = "Prąd czynny wymuszany przez AWSC (strona pierwotna)"
_NASTAWA = "Prąd nastawy dławika"

#: Wyrocznia: parametry bocznika z wartości roboczej wariantu z sondy — TU z pozycji typowej
#: katalogu (R0, X0) zawsze, R rezystora z pozycji typowej, gdy rezystor jest w ruchu; nastawa
#: dławika i prąd AWSC podane przez projektanta (``_zespol``) — bez wpisu.
ROBOCZE_WARIANTU: dict[str, set[str]] = {
    "dlawik_awsc_zalaczony": {_R0_TU, _X0_TU},
    "rezystor": {_R0_TU, _X0_TU, _R_REZ},
    "dlawik_rezystor": {_R0_TU, _X0_TU, _R_REZ},
    "bezposrednie": {_R0_TU, _X0_TU},
}


def _nazwy_danych(wiersz: dict[str, Any]) -> set[str]:
    from enm.dane_przyjete_galezi import dane_przyjete_galezi_wiersza

    return {d.nazwa_pl for d in dane_przyjete_galezi_wiersza(wiersz)}


def _zalozenia_zu(wynik: Any) -> list[dict[str, Any]]:
    return [
        z
        for z in wynik.raw_result.get("zalozenia") or ()
        if z.get("code") == "zespol_uziemiajacy.wartosc_robocza"
    ]


@pytest.mark.parametrize(("wariant", "stan_awsc"), WARIANTY_SONDY)
def test_wiersz_zwarcia_doziemnego_niesie_dane_przyjete_bocznika(
    wariant: str, stan_awsc: str
) -> None:
    """Wiersz liczony (I″k1 z bocznikiem zespołu) niesie dane przyjęte ESTIMATED dokładnie
    tych parametrów bocznika, które stoją na wartości roboczej; wiersz bez liczby (sieć
    skompensowana, izolowana) — żadnych. Bieg niesie założenie nazwane tego samego kodu
    WYŁĄCZNIE, gdy zespół w ruchu ma parametr roboczy."""
    from enm.dane_przyjete_galezi import dane_przyjete_biegu

    migawka = _siec(wariant)
    wynik = _bieg(migawka, _przypadek(migawka, stan_awsc=stan_awsc))
    wiersz = _wiersz(wynik, _szyny(migawka)[0])
    nazwa_zespolu = " (Zespół uziemiający sekcji 1)"
    oczekiwane = {
        n + nazwa_zespolu for n in ROBOCZE_WARIANTU.get(_klucz_wariantu(wariant, stan_awsc), ())
    }
    if wiersz["ikss_a"] is None:
        assert _nazwy_danych(wiersz) == set()
    else:
        assert _nazwy_danych(wiersz) == oczekiwane
    zalozenia = _zalozenia_zu(wynik)
    if wariant in ("izolowany", "uzwojenie_tr"):
        assert zalozenia == []
    else:
        (zalozenie,) = zalozenia
        assert zalozenie["bus_ref"] == migawka["zespoly_uziemiajace"][0]["bus_ref"]
        assert all(d["jakosc"] == "ESTIMATED" for d in zalozenie["dane_przyjete"])
        assert "Zespół uziemiający sekcji 1: bocznik" in zalozenie["message_pl"]
    # Agregat biegu (werdykty spoza wiersza) niesie te same dane.
    assert oczekiwane <= {d.nazwa_pl for d in dane_przyjete_biegu(wynik.raw_result)}


@pytest.mark.parametrize("stan_awsc", ["spoczynek", "zalaczony"])
def test_prad_awsc_roboczy_tylko_gdy_awsc_zalaczony(stan_awsc: str) -> None:
    """AWSC bez prądu wymuszanego: wartość robocza I_W kształtuje bocznik WYŁĄCZNIE po
    załączeniu AWSC — w spoczynku założenie biegu jej nie wymienia (ten sam predykat stanu
    co Y0), po załączeniu wiersz liczony niesie ją jako daną przyjętą."""
    migawka = _gpz(
        1,
        [
            {
                "sekcja": 1,
                "catalog_ref": TU,
                "dlawik": {"catalog_ref": DLAWIK, "i_nastawy_a": I_NASTAWY_A, "awsc": {}},
            }
        ],
    )
    wynik = _bieg(migawka, _przypadek(migawka, stan_awsc=stan_awsc))
    (zalozenie,) = _zalozenia_zu(wynik)
    nazwy_biegu = {d["nazwa_pl"] for d in zalozenie["dane_przyjete"]}
    nazwa_awsc = _I_AWSC + " (Zespół uziemiający sekcji 1)"
    wiersz = _wiersz(wynik, _szyny(migawka)[0])
    if stan_awsc == "spoczynek":
        assert nazwa_awsc not in nazwy_biegu
        assert wiersz["ikss_a"] is None and _nazwy_danych(wiersz) == set()
    else:
        assert nazwa_awsc in nazwy_biegu
        assert wiersz["ikss_a"] is not None
        assert nazwa_awsc in _nazwy_danych(wiersz)


def test_nastawa_dlawika_robocza_w_danych_bocznika() -> None:
    """Dławik bez nastawy projektanta w Z.14: nastawa robocza (środek zakresu §16) kształtuje
    R_N‖jX_L — wiersz niesie ją jako daną przyjętą."""
    migawka = _gpz(
        1,
        [
            {
                "sekcja": 1,
                "catalog_ref": TU,
                "dlawik": {"catalog_ref": DLAWIK},
                "rezystor": {"catalog_ref": REZYSTOR},
            }
        ],
    )
    wynik = _bieg(migawka, _przypadek(migawka))
    wiersz = _wiersz(wynik, _szyny(migawka)[0])
    assert wiersz["ikss_a"] is not None
    assert _NASTAWA + " (Zespół uziemiający sekcji 1)" in _nazwy_danych(wiersz)


def test_wartosci_projektanta_bez_danych_przyjetych() -> None:
    """Projektant wpisuje R0/X0 transformatora uziemiającego i R rezystora (dane producenta,
    inne niż pozycja typowa) — bocznik nie stoi na wartości roboczej: bieg bez założenia
    zespołu, wiersz bez danych przyjętych, a I″k1 z wyroczni ręcznej z wartości projektanta."""
    migawka = _siec("rezystor")
    zespol = migawka["zespoly_uziemiajace"][0]
    wynik_op = execute_domain_operation(
        enm_dict=migawka,
        op_name="update_element_parameters",
        payload={
            "element_ref": zespol["ref_id"],
            "parameters": {
                "r0_ohm": 2.0,
                "x0_ohm": 7.0,
                "rezystor": {**zespol["rezystor"], "r_ohm": 40.0},
            },
        },
    )
    assert not wynik_op.get("error"), wynik_op.get("error")
    migawka = wynik_op["snapshot"]
    wynik = _bieg(migawka, _przypadek(migawka))
    wiersz = _wiersz(wynik, _szyny(migawka)[0])
    assert _zalozenia_zu(wynik) == []
    assert _nazwy_danych(wiersz) == set()
    _sprawdz_liczony(wiersz, complex(2.0, 7.0) + 3.0 * 40.0)


def test_parametr_spoza_kontraktu_zespolu_to_nazwana_odmowa() -> None:
    """Bramka kontraktu pól obejmuje zespół uziemiający: klucz kontraktu (nastawa dławika)
    zapisuje się, klucz spoza kontraktu jest odmową ``params.key_not_allowed`` bez migawki —
    nigdy cichym sukcesem, który walidacja modelu zgubiłaby po cichu."""
    migawka = _siec("dlawik")
    zespol = migawka["zespoly_uziemiajace"][0]
    zapis = execute_domain_operation(
        enm_dict=migawka,
        op_name="update_element_parameters",
        payload={"element_ref": zespol["ref_id"], "parameters": {"name": "ZU sekcji 1"}},
    )
    assert not zapis.get("error"), zapis.get("error")
    odmowa = execute_domain_operation(
        enm_dict=migawka,
        op_name="update_element_parameters",
        payload={"element_ref": zespol["ref_id"], "parameters": {"feeder_short_name": "ZU1"}},
    )
    assert odmowa["error_code"] == "params.key_not_allowed"
    assert odmowa["snapshot"] is None


@pytest.mark.parametrize("zu", ["obie", "jedna"])
@pytest.mark.parametrize("sprzeglo_otwarte", [False, True], ids=["sprzeglo-zamkniete", "otwarte"])
def test_dane_przyjete_bocznika_wg_skladowej_sieci_zerowej(zu: str, sprzeglo_otwarte: bool) -> None:
    """Dwie sekcje × zespoły {w obu, w jednej} × sprzęgło: wiersz szyny niesie dane przyjęte
    WYŁĄCZNIE zespołów z jej składowej sieci zerowej (sprzęgło zamknięte — oba, otwarte —
    własny); sekcja bez zespołu w osobnej składowej nie ma liczby ani danych."""
    migawka = _siec("rezystor", sekcje=2, zu=zu)
    otwarte = (_sprzeglo(migawka),) if sprzeglo_otwarte else ()
    szyny = _szyny(migawka)
    zespoly_sekcji = {1: {1}, 2: {2} if zu == "obie" else set()}
    if not sprzeglo_otwarte:
        zespoly_sekcji = {1: zespoly_sekcji[1] | zespoly_sekcji[2]}
        zespoly_sekcji[2] = zespoly_sekcji[1]
    for numer, szyna in enumerate(szyny, start=1):
        # Scenariusz zwarcia liczy węzeł miejsca zwarcia — jeden bieg na szynę sekcji.
        wynik = _bieg(
            migawka, _przypadek(migawka, otwarte=otwarte, szyna=szyna), klucz=f"zu-s{numer}"
        )
        wiersz = _wiersz(wynik, szyna)
        oczekiwane = {
            n + f" (Zespół uziemiający sekcji {k})"
            for k in zespoly_sekcji[numer]
            for n in ROBOCZE_WARIANTU["rezystor"]
        }
        if not zespoly_sekcji[numer]:
            assert wiersz["ikss_a"] is None
        assert _nazwy_danych(wiersz) == oczekiwane, (numer, szyna)


def test_dane_przyjete_wezla_z_skladowa_zerowa_niosa_bocznik() -> None:
    """Wielkość liczona wprost z modelu z Z0 węzła (równoważnik sieci SN, ``build_zero_\
    sequence_zbus``) niesie dane przyjęte bocznika zespołu; bez składowej zerowej — nie."""
    from enm.dane_przyjete_galezi import dane_przyjete_wezla

    enm = EnergyNetworkModel.model_validate(_siec("rezystor"))
    szyna = _szyny(enm.model_dump(mode="json"))[0]
    z_z0 = {d["nazwa_pl"] for d in dane_przyjete_wezla(enm, szyna, ze_skladowa_zerowa=True)}
    assert z_z0 == {n + " (Zespół uziemiający sekcji 1)" for n in ROBOCZE_WARIANTU["rezystor"]}
    assert dane_przyjete_wezla(enm, szyna, ze_skladowa_zerowa=False) == ()
