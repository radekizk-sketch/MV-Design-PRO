"""Zespół uziemiający SN jednym nośnikiem — iloczyn cech ścieżką użytkownika z wyrocznią ręczną
(karta ZU-JEDEN-NOSNIK, kryterium ukończenia).

Sieć powstaje WYŁĄCZNIE operacjami produktu: GPZ 15 kV (równoważnik na szynach SN z katalogu,
S″k = 250 MVA, R/X = 0,1) → odcinek kablowy 500 m z pola liniowego GPZ → stacja SN/nN wstawiona
w połowę odcinka (transformator Dyn11 630 kVA). Zespół uziemiający to transformator uziemiający
ZNyn11 pola ZU (``add_sn_bay`` rola ZU z szablonem wariantu ENEA Zeszyt 1 Z.13–Z.15), a jego
wyposażenie punktu neutralnego (dławik z nastawą i AWSC, rezystor, stany odłączników,
uziemienie bezpośrednie) ustawia operacja ``add_zespol_uziemiajacy_sn`` wskazaniem pola ZU — ta
sama droga co kreator zespołu. Bieg: ``create_run``/``execute_run`` analizy ``short_circuit_sn``
ze scenariusza zwarciowego (stan AWSC w konfiguracji scenariusza).

Iloczyn cech: wyposażenie {Z.13 dławik, Z.13 dławik z AWSC, Z.14 dławik ‖ rezystor, Z.15
rezystor, uziemienie bezpośrednie, sieć izolowana (bez zespołu)} × stany odłączników gałęzi
{wszystkie zamknięte, odłącznik dławika otwarty, odłącznik rezystora otwarty} × stan AWSC
{spoczynek, załączony} × rodzaj zwarcia {1F, 2F+Z} × miejsce zespołu {pole ZU w GPZ, pole ZU
w stacji SN/nN}. Punkt zwarcia: szyna SN stacji SN/nN (droga zerowa przez kabel albo wprost).

Wyrocznia ręczna (IEC 60909-0:2016): Z_Q = c·U_n²/S″k z R/X (§6.2.1 wzór 6, c = 1,1);
Z_1 = Z_2 = Z_Q + Z_L1 (kabel 250 m z pozycji katalogu, admitancje poprzeczne pominięte §4.3.1);
Z_0 = Z_0,TU + 3·Z_N (+ Z_L0 kabla, gdy zespół stoi w GPZ) — bocznik zespołu jedyną drogą
zerową (równoważnik na szynach SN nie niesie Z0 — W-W5-02; uzwojenie D transformatora stacji
przerywa drogę zerową); Z_N — gałęzie w ruchu równolegle: dławik jU_f/I_nastawy, rezystor R_N
z pozycji katalogu, AWSC załączony R_W = U_f/I_W równolegle do dławika. I″k1 = √3·c·U_n/|2Z_1 +
Z_0| (wzór 52), 2F+Z: c·U_n/|Z_1 + Z_2·Z_0/(Z_2 + Z_0)|. Bez drogi przez małą impedancję
(sieć izolowana, skompensowana — także z AWSC, wszystkie gałęzie odłączone) — IEC 60909 nie
definiuje prądu zwarciowego: I″k = brak (``None``), sposób pracy sieci nazwany w
``doziemienie_sieci``.
"""

from __future__ import annotations

import cmath
import math
from typing import Any

import pytest
from domain.fault_scenario import FaultLocation, FaultType, ShortCircuitConfig, new_fault_scenario
from enm.canonical_analysis import create_run, execute_run, reset_canonical_runs
from enm.models import EnergyNetworkModel, Transformer
from enm.punkt_neutralny_zespolu import parametry_z0_zygzaka
from enm.scenariusze import OperatingScenario, RodzajScenariusza, opcje_biegu_ze_scenariusza
from enm.store import reset_enm_store, set_enm
from network_model.catalog.bay_templates import SZABLON_WARIANTU_ZESPOLU
from network_model.catalog.mv_zespol_uziemiajacy_catalog import (
    get_all_neutral_earthing_resistor_records,
)
from network_model.catalog.repository import get_default_mv_catalog

from tests.reference_networks.sceny_zajetosci_pol import KABEL, ZRODLO, ok, op, zbuduj_scene
from tests.utils.zespol_uziemiajacy import ladunek_zespolu

_UN_KV = 15.0
_C = 1.1
_U_F_V = _UN_KV * 1e3 / math.sqrt(3.0)
_I_NASTAWY_A = 100.0
_I_AWSC_A = 30.0
#: wyposażenie → (szablon pola ZU, wariant ładunku ``ladunek_zespolu``, AWSC)
WARIANTY: dict[str, tuple[str | None, str | None, bool]] = {
    "Z13": ("Z13", "dlawik", False),
    "Z13_awsc": ("Z13", "dlawik", True),
    "Z14": ("Z14", "dlawik_rezystor", False),
    "Z15": ("Z15", "rezystor", False),
    "bezposrednie": ("Z15", "bezposrednie", False),
    "izolowany": (None, None, False),
}
ODLACZNIKI = ("zamkniete", "dlawik_otwarty", "rezystor_otwarty")
MIEJSCA = ("gpz", "stacja")


@pytest.fixture(autouse=True)
def _czysty_magazyn():
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


def _stacja_sn_nn(enm: dict[str, Any]) -> dict[str, Any]:
    return next(s for s in enm["substations"] if s.get("station_type") != "gpz")


def _szyna_sn_stacji(enm: dict[str, Any]) -> str:
    stacja = _stacja_sn_nn(enm)
    napiecia = {b["ref_id"]: b.get("voltage_kv") for b in enm["buses"]}
    return next(r for r in stacja["bus_refs"] if napiecia.get(r) == _UN_KV)


def _ladunek(wariant: str, odlaczniki: str) -> dict[str, Any] | None:
    _, rodzaj, awsc = WARIANTY[wariant]
    if rodzaj is None:
        return None
    ladunek = ladunek_zespolu(
        rodzaj,  # type: ignore[arg-type]
        i_nastawy_a=_I_NASTAWY_A if "dlawik" in rodzaj else None,
        awsc={"i_wymuszany_a": _I_AWSC_A} if awsc else None,
    )
    for galaz in ("dlawik", "rezystor"):
        if galaz in ladunek and odlaczniki == f"{galaz}_otwarty":
            ladunek[galaz]["stan_odlacznika"] = "otwarty"
    return ladunek


def _siec(miejsce: str, wariant: str, odlaczniki: str) -> tuple[dict[str, Any], str]:
    """Sieć sceny z zespołem w polu ZU ``miejsce`` — wyłącznie operacjami produktu."""
    enm = zbuduj_scene("stacja_na_odcinku", "wolne_kilka").enm
    szyna_zwarcia = _szyna_sn_stacji(enm)
    szablon, _, _ = WARIANTY[wariant]
    if szablon is None:
        return enm, szyna_zwarcia
    if miejsce == "gpz":
        gpz = next(s for s in enm["substations"] if s.get("station_type") == "gpz")
        szyna_pola, stacja = gpz["gpz_sections"][0]["bus_ref"], gpz["ref_id"]
    else:
        szyna_pola, stacja = szyna_zwarcia, _stacja_sn_nn(enm)["ref_id"]
    zadanie: dict[str, Any] = {
        "bus_ref": szyna_pola,
        "station_ref": stacja,
        "bay_role": "ZU",
        "apparatus_kind": "CB",
    }
    if miejsce == "gpz":
        # Szablony Z.13–Z.15 (ENEA Zeszyt 1) opisują pola rozdzielni SN stacji 110 kV/SN —
        # w stacji SN/nN pole ZU powstaje bez szablonu GPZ, a transformator uziemiający
        # instaluje operacja zespołu wskazaniem pola (ta sama droga, ten sam pisarz).
        zadanie["bay_template_ref"] = SZABLON_WARIANTU_ZESPOLU[szablon].template_id
    enm = ok(op(enm, "add_sn_bay", zadanie))
    pole_zu = next(b for b in enm["bays"] if b.get("bay_role") == "ZU")
    ladunek = _ladunek(wariant, odlaczniki)
    assert ladunek is not None
    enm = ok(op(enm, "add_zespol_uziemiajacy_sn", {"bay_ref": pole_zu["ref_id"], **ladunek}))
    return enm, szyna_zwarcia


def _bieg(enm: dict[str, Any], szyna: str, rodzaj: FaultType, stan_awsc: str) -> dict[str, Any]:
    set_enm("zu1", EnergyNetworkModel.model_validate(enm))
    spec = new_fault_scenario(
        study_case_id="zu1",
        name="Zwarcie doziemne",
        fault_type=rodzaj,
        location=FaultLocation(element_ref=szyna, location_type="BUS"),
        config=ShortCircuitConfig.from_dict(
            {"scenariusz": "MAX", "thermal_time_seconds": 0.5, "stan_awsc": stan_awsc}
        ),
    )
    opcje = opcje_biegu_ze_scenariusza(
        OperatingScenario(
            scenario_id=f"scn-{rodzaj.value}-{stan_awsc}",
            name="t",
            kind=RodzajScenariusza.FAULT_STUDY,
            fault_spec=spec,
        )
    )
    run = create_run(
        case_id="zu1", klucz_twin="zu1", analysis_type="short_circuit_sn", options=opcje
    )
    wynik = execute_run(run.id)
    assert wynik.status == "FINISHED", wynik.error_message
    [wiersz] = (wynik.raw_result or {})["results"]
    return wiersz


# --------------------------------------------------------------------------- wyrocznia ręczna


def _z_q() -> complex:
    rekord = next(r for r in get_default_mv_catalog().list_source_system_types() if r.id == ZRODLO)
    rx = float(rekord.rx_ratio)
    z_abs = _C * _UN_KV**2 / float(rekord.sk3_mva)
    x = z_abs / math.sqrt(1.0 + rx**2)
    return complex(x * rx, x)


def _kabel(dlugosc_km: float) -> tuple[complex, complex]:
    typ = next(t for t in get_default_mv_catalog().list_cable_types() if t.id == KABEL)
    z1 = complex(typ.r_ohm_per_km, typ.x_ohm_per_km) * dlugosc_km
    z0 = complex(typ.r0_ohm_per_km, typ.x0_ohm_per_km) * dlugosc_km
    return z1, z0


def _b0_odcinka(enm: dict[str, Any]) -> float:
    """B0 odcinka 250 m [S] — reguła pasma SN dla kabla bez B′0 w modelu: B′0 = B′1
    (wartość robocza ``wyprowadz_susceptancje_zerowa_sn``, dana przyjęta wiersza)."""
    [b1] = {b["b_siemens_per_km"] for b in enm["branches"] if b.get("type") == "cable"}
    assert all(
        b.get("b0_siemens_per_km") is None for b in enm["branches"] if b.get("type") == "cable"
    )
    return float(b1) * 0.25


def _k(z1: complex, z0: complex) -> float:
    """Współczynnik zwarcia doziemnego k = max(|U_b|, |U_c|)/E przy zwarciu 1F fazy a
    (składowe symetryczne, Z_2 = Z_1): U_b = a²·E − I_0·(Z_0 + a²·Z_1 + a·Z_1), I_0 = E/(2Z_1+Z_0).
    """
    a = cmath.exp(2j * math.pi / 3.0)
    i0 = 1.0 / (2.0 * z1 + z0)
    u_b = a * a - i0 * (z0 + a * a * z1 + a * z1)
    u_c = a - i0 * (z0 + a * z1 + a * a * z1)
    return max(abs(u_b), abs(u_c))


def _z0_wezla(
    y_zu: complex, miejsce: str, z_l0: complex, b0: float, z1_wezlow: dict[str, complex]
) -> complex:
    """Z_0 w szynie SN stacji z macierzy Y_0 trzech węzłów (G — szyna GPZ, S — szyna stacji,
    E — koniec dalszej połówki odcinka): kable szeregowo Z_L0, bocznik zespołu Y_ZU w węźle
    zespołu; pojemności doziemne B0 (model π, B/2 na koniec) WCHODZĄ wyłącznie, gdy
    współczynnik zwarcia doziemnego k > 1,4 w którymkolwiek węźle sieci zerowej (IEC 60909-0:2016
    pkt 5.2 f), k z macierzy BEZ pojemności)."""
    import numpy as np

    def macierz(z_pojemnosciami: bool) -> np.ndarray:
        y = np.zeros((3, 3), dtype=complex)
        y_l = 1.0 / z_l0
        for i, j in ((0, 1), (1, 2)):
            y[i, i] += y_l
            y[j, j] += y_l
            y[i, j] -= y_l
            y[j, i] -= y_l
            if z_pojemnosciami:
                y[i, i] += 1j * b0 / 2.0
                y[j, j] += 1j * b0 / 2.0
        y[0 if miejsce == "gpz" else 1, 0 if miejsce == "gpz" else 1] += y_zu
        return y

    z_bez = np.linalg.inv(macierz(False))
    k_max = max(_k(z1_wezlow[w], complex(z_bez[i, i])) for i, w in enumerate("GSE"))
    z = np.linalg.inv(macierz(k_max > 1.4))
    return complex(z[1, 1])


def _r_n(enm: dict[str, Any]) -> float:
    tu = next(t for t in enm["transformers"] if t.get("vector_group") == "ZNyn11")
    ref = tu["hv_neutral"]["rezystor"]["catalog_ref"]
    rekord = next(r for r in get_all_neutral_earthing_resistor_records() if r["id"] == ref)
    return float(rekord["params"]["r_ohm"])


def _z_n(enm: dict[str, Any], wariant: str, odlaczniki: str, stan_awsc: str) -> complex | None:
    """Z_N gałęzi w ruchu (równolegle) albo ``None`` — brak drogi przez małą impedancję."""
    if wariant == "izolowany":
        return None
    if wariant == "bezposrednie":
        return 0j
    galezie: list[complex] = []
    dlawik = "dlawik" if wariant != "Z15" else None
    rezystor = "rezystor" if wariant in ("Z14", "Z15") else None
    if dlawik and odlaczniki != "dlawik_otwarty":
        galezie.append(complex(0.0, _U_F_V / _I_NASTAWY_A))
        if wariant == "Z13_awsc" and stan_awsc == "zalaczony":
            galezie.append(complex(_U_F_V / _I_AWSC_A, 0.0))
    if rezystor and odlaczniki != "rezystor_otwarty":
        galezie.append(complex(_r_n(enm), 0.0))
    if not galezie or not (rezystor and odlaczniki != "rezystor_otwarty"):
        # Bez gałęzi rezystora w ruchu sieć jest izolowana albo skompensowana (także z AWSC
        # załączonym) — IEC 60909 nie definiuje prądu zwarciowego.
        return None
    admitancja = sum(1.0 / z for z in galezie)
    return 1.0 / admitancja


def _wyrocznia(
    enm: dict[str, Any], miejsce: str, wariant: str, odlaczniki: str, stan_awsc: str
) -> tuple[complex, complex | None]:
    z_l1, z_l0 = _kabel(0.25)
    z_q = _z_q()
    z1 = z_q + z_l1
    z_n = _z_n(enm, wariant, odlaczniki, stan_awsc)
    if z_n is None:
        return z1, None
    from enm.models import Transformer

    tu = Transformer.model_validate(
        next(t for t in enm["transformers"] if t.get("vector_group") == "ZNyn11")
    )
    r0, x0 = parametry_z0_zygzaka(tu, _UN_KV)
    y_zu = 1.0 / (complex(r0.wartosc, x0.wartosc) + 3.0 * z_n)
    z1_wezlow = {"G": z_q, "S": z1, "E": z1 + z_l1}
    return z1, _z0_wezla(y_zu, miejsce, z_l0, _b0_odcinka(enm), z1_wezlow)


def _sprawdz_doziemienie(
    enm: dict[str, Any], wariant: str, odlaczniki: str, stan_awsc: str, doziemienie: dict
) -> None:
    """Wyrocznia doziemienia sieci izolowanej i skompensowanej (prąd nie jest prądem
    zwarciowym IEC 60909): I_C = √3·U_n·B0 sieci galwanicznej (obie połówki odcinka);
    I_N = U_f/(Z_N + Z_0,TU/3) gałęzi dławika w ruchu (z AWSC załączonym równolegle R_W),
    I_w = Re I_N, I_L = −Im I_N, I_res = √(I_w² + (I_C − I_L)²). Wartości wiersza zaokrąglone
    do 1e-4 A."""
    i_c = math.sqrt(3.0) * _UN_KV * 1e3 * 2.0 * _b0_odcinka(enm)
    assert doziemienie["i_c_a"] == pytest.approx(i_c, abs=6e-5)
    dlawik_w_ruchu = wariant in ("Z13", "Z13_awsc", "Z14") and odlaczniki != "dlawik_otwarty"
    if not dlawik_w_ruchu:
        assert doziemienie["tryb"] == "izolowany", doziemienie
        assert doziemienie["prad_a"] == pytest.approx(i_c, abs=6e-5)
        return
    assert doziemienie["tryb"] == "kompensowany", doziemienie
    tu = Transformer.model_validate(
        next(t for t in enm["transformers"] if t.get("vector_group") == "ZNyn11")
    )
    r0, x0 = parametry_z0_zygzaka(tu, _UN_KV)
    y_n = 1.0 / complex(0.0, _U_F_V / _I_NASTAWY_A)
    if wariant == "Z13_awsc" and stan_awsc == "zalaczony":
        y_n += 1.0 / (_U_F_V / _I_AWSC_A)
    i_n = _U_F_V / (1.0 / y_n + complex(r0.wartosc, x0.wartosc) / 3.0)
    i_w, i_l = i_n.real, -i_n.imag
    assert doziemienie["i_w_a"] == pytest.approx(i_w, abs=6e-5)
    assert doziemienie["i_l_a"] == pytest.approx(i_l, abs=6e-5)
    assert doziemienie["prad_a"] == pytest.approx(math.hypot(i_w, i_c - i_l), abs=2e-4)
    assert doziemienie["stan_awsc"] == stan_awsc


def _ikss(rodzaj: FaultType, z1: complex, z0: complex) -> float:
    if rodzaj is FaultType.SC_1F:
        return math.sqrt(3.0) * _C * _UN_KV * 1e3 / abs(2.0 * z1 + z0)
    return _C * _UN_KV * 1e3 / abs(z1 + z1 * z0 / (z1 + z0))


def _zespolona(wartosc: Any) -> complex:
    if isinstance(wartosc, dict):
        return complex(float(wartosc["re"]), float(wartosc["im"]))
    if isinstance(wartosc, list | tuple):
        return complex(float(wartosc[0]), float(wartosc[1]))
    return complex(wartosc)


def _przypadki() -> list[tuple[str, str, str, str]]:
    wynik = []
    for wariant in WARIANTY:
        for odlaczniki in ODLACZNIKI:
            if odlaczniki == "dlawik_otwarty" and wariant not in ("Z13", "Z13_awsc", "Z14"):
                continue
            if odlaczniki == "rezystor_otwarty" and wariant not in ("Z14", "Z15"):
                continue
            for stan_awsc in ("spoczynek", "zalaczony"):
                for miejsce in MIEJSCA:
                    if wariant == "izolowany" and miejsce == "stacja":
                        continue
                    wynik.append((wariant, odlaczniki, stan_awsc, miejsce))
    return wynik


_POLA_MODELU = {pole.alias or nazwa for nazwa, pole in EnergyNetworkModel.model_fields.items()}


@pytest.mark.parametrize("rodzaj", [FaultType.SC_1F, FaultType.SC_2F_G], ids=["1F", "2F+Z"])
@pytest.mark.parametrize(("wariant", "odlaczniki", "stan_awsc", "miejsce"), _przypadki())
def test_iloczyn_z_wyrocznia_reczna(
    wariant: str, odlaczniki: str, stan_awsc: str, miejsce: str, rodzaj: FaultType
) -> None:
    enm, szyna = _siec(miejsce, wariant, odlaczniki)
    # Jeden nośnik: zespół to transformator ZNyn11 wskazany wyposażeniem pola ZU, bez kolekcji
    # i zapisu w ``meta`` (każdy z dawnych nośników byłby drugą prawdą).
    tu = [t for t in enm["transformers"] if t.get("vector_group") == "ZNyn11"]
    assert len(tu) == (0 if wariant == "izolowany" else 1)
    # Migawka ma wyłącznie kolekcje kontraktu ENM (żadnej osobnej kolekcji zespołów), a ``meta``
    # transformatora nie niesie żadnego zapisu zespołu.
    assert set(enm) <= _POLA_MODELU, sorted(set(enm) - _POLA_MODELU)
    for t in tu:
        assert not [k for k in (t.get("meta") or {}) if "uziem" in k], t.get("meta")
        pole = next(b for b in enm["bays"] if t["ref_id"] in (b.get("equipment_refs") or []))
        assert pole["bay_role"] == "ZU"
        gpz = next(s for s in enm["substations"] if s.get("station_type") == "gpz")
        stacja_pola = gpz if miejsce == "gpz" else _stacja_sn_nn(enm)
        assert pole["bus_ref"] in stacja_pola["bus_refs"]

    wiersz = _bieg(enm, szyna, rodzaj, stan_awsc)
    z1, z0 = _wyrocznia(enm, miejsce, wariant, odlaczniki, stan_awsc)
    if z0 is None:
        # Poza zakresem IEC 60909 (rozdz. 1): brak prądu zwarciowego, sposób pracy sieci i prąd
        # doziemienia z solvera doziemienia (wiersz 1F) — wyrocznia ręczna niżej.
        assert wiersz.get("ikss_a") is None
        assert wiersz.get("brak_wyniku_zerowego")
        if rodzaj is FaultType.SC_1F:
            _sprawdz_doziemienie(enm, wariant, odlaczniki, stan_awsc, wiersz["doziemienie_sieci"])
        return
    assert _zespolona(wiersz["z1_ohm"]) == pytest.approx(z1, rel=1e-9)
    assert _zespolona(wiersz["z0_ohm"]) == pytest.approx(z0, rel=1e-9)
    assert wiersz["ikss_a"] == pytest.approx(_ikss(rodzaj, z1, z0), rel=1e-9)


def test_wyrocznia_iloczynu_nie_jest_zdegenerowana() -> None:
    """Wyrocznia odróżnia miejsce zespołu (kabel w drodze zerowej), AWSC i stany odłączników —
    inaczej iloczyn mierzyłby jeden przypadek wiele razy."""
    enm, _ = _siec("gpz", "Z14", "zamkniete")
    z_gpz = _wyrocznia(enm, "gpz", "Z14", "zamkniete", "spoczynek")[1]
    z_stacja = _wyrocznia(enm, "stacja", "Z14", "zamkniete", "spoczynek")[1]
    z_bez_dlawika = _wyrocznia(enm, "gpz", "Z14", "dlawik_otwarty", "spoczynek")[1]
    assert z_gpz is not None and z_stacja is not None and z_bez_dlawika is not None
    assert abs(z_gpz - z_stacja) > 1e-3
    assert abs(z_gpz - z_bez_dlawika) > 1e-3
    assert _wyrocznia(enm, "gpz", "Z14", "rezystor_otwarty", "spoczynek")[1] is None
    assert cmath.isfinite(z_gpz)
