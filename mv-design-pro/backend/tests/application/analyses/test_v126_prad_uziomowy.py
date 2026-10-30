"""Prąd zwarcia doziemnego stacji z modelu w bezpieczeństwie uziomu V12.6 (EN 50522:2010 tab. 1).

Karta UX-04/POLE-ZU-SKLADOWA-ZEROWA (commit 5). Prąd odprowadzany przez uziom stacji nie jest
już liczbą wpisywaną w formularzu (dawne ``fault_current_ka`` obowiązkowe i fikcyjna szyna
„GPZ”): przychodzi z modelu wg sposobu pracy punktu neutralnego sieci, w której leży stacja,
a projektant może go nadpisać (dana przyjęta ESTIMATED, dowód NIEPELNY).

Testy biegną realną ścieżką użytkownika — ``POST /api/cases/{id}/runs/v126/earthing_safety``
z danymi uziomu i szyną stacji, wynik z ``result_url`` — na sieci z kreatora GPZ (110/15 kV,
zespół uziemiający sekcji, 2 km kabla).

Iloczyn cech (każda kombinacja to osobny bieg API):

* sposób pracy punktu neutralnego SN: izolowany × kompensowany × rezystor × bezpośredni;
* strona WN stacji: liczona (Z0/Z1 sieci zasilającej = 3 → I″k1 110 kV z IEC 60909) × bez Z0
  (przypadek WN z nazwaną przyczyną braku);
* źródło prądu: z modelu × nadpisane przez projektanta;
* dodatkowo stacja odbiorcza 15/0,4 kV na końcu kabla (dławik gaszący nie stoi „w tej
  stacji”, więc sieć skompensowana daje I_res, nie √(I_L² + I_res²); szyna nN poza
  EN 50522; brak strony WN) dla czterech sposobów, oraz węzeł pomocniczy (nazwany brak);
* AWSC: dwa przypadki SN (automatyka w spoczynku i załączona), rozstrzyga większy.

Wyrocznie ręczne (wzory jawne, bez kodu solvera) — ``tests.enm.test_doziemienie_tryby_
punktu_neutralnego``: I_C = √3·U_n·B0, I_res i I_L z prądu punktów neutralnych, I″k1 sieci
uziemionej rezystorem √3·c·U_n/|2Z1 + (Z0_TU + 3R_N)∥(1/jB0)|, I″k1 110 kV √3·c·U_n/|2Z_Q +
Z0_Q|. Stacja odbiorcza — ta sama liczba co bieg zwarciowy IEC 60909 (predykat parą: wejście
uziomu = wiersz zwarcia doziemnego biegu kanonicznego).

Na końcu intencja skasowanego testu grupy połączeń (``test_vector_group_earth_fault_touch_
voltage.py``, kasacja 6bfd4bcab): grupa połączeń transformatora → I″k1 po stronie 15 kV
(Dyn11 8849,00 A, YNyn0 7932,23 A) → U_E = r·I″k1·R_E — teraz tą samą ścieżką API.
"""

from __future__ import annotations

import importlib.util
import math
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from api.main import app
from enm.canonical_analysis import reset_canonical_runs
from enm.domain_operations import execute_domain_operation
from enm.klucz_twin import klucz_twin_projektu
from enm.models import Bus, EnergyNetworkModel, ENMDefaults, ENMHeader, Source, Transformer
from enm.store import reset_enm_store, set_enm
from fastapi.testclient import TestClient

from tests.enm import test_skladowa_zerowa_zu as zu
from tests.enm.test_doziemienie_tryby_punktu_neutralnego import (
    ODCINKI,
    SPOSOBY,
    SQ3,
    UN_V,
    WARIANT_TRYBU,
    _b0_odcinkow_s,
    _bieg_szyny,
    _wyrocznia_sposobu,
    _z1_reczne,
    _z_odcinkami,
    wyrocznia_pradu,
)
from tests.utils.biegi import uruchom_v126

#: Dane uziomu stacji (siatka 60 × 40 m, oczko 6 m) — bez prądu: prąd daje model.
UZIOM: dict[str, float] = {
    "rho1_ohm_m": 100.0,
    "length_m": 60.0,
    "width_m": 40.0,
    "mesh_spacing_m": 6.0,
    "buried_depth_m": 0.6,
    "rods_total_length_m": 40.0,
    "split_factor": 0.65,
    "fault_clearing_time_s": 0.5,
    "surface_layer_rho_ohm_m": 2500.0,
    "surface_layer_derating": 0.74,
}
NADPISANIE_KA = 4.0
Z0_Z1_SIECI_WN = 3.0
SK_Q_MVA = 3000.0
RX_Q = 0.1
U_WN_V = 110e3

STRONY_WN = ("liczona", "bez_z0")
ZRODLA = ("model", "nadpisanie")

_STRAZNIK_PROZY = Path(__file__).resolve().parents[4] / "scripts" / "slad_proza_bez_latex_guard.py"
_spec = importlib.util.spec_from_file_location("slad_proza_bez_latex_guard", _STRAZNIK_PROZY)
assert _spec is not None and _spec.loader is not None
straznik_prozy = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(straznik_prozy)


def _slad_bez_latex_w_prozie(koperta: dict[str, Any]) -> None:
    """Kontrakt pól kroku śladu (predykat ``slad_proza_bez_latex_guard`` — jedno źródło reguły):
    podstawienie kroku prądu uziomowego to proza bez ``$…$`` w KAŻDEJ gałęzi rozstrzygnięcia
    (z modelu, nadpisanie, nazwany brak), choć uzasadnienie wyniku niesie wzory dla KaTeX-a."""
    assert straznik_prozy.naruszenia_danych(koperta["white_box_trace"], "earthing_safety") == []


@pytest.fixture(autouse=True)
def _czysty_stan() -> Iterator[None]:
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


@pytest.fixture(scope="module")
def klient() -> Iterator[TestClient]:
    with TestClient(app) as client:
        yield client


# ---------------------------------------------------------------------------
# Model i bieg
# ---------------------------------------------------------------------------


def _siec(wariant: str, *, z0_wn: bool) -> dict[str, Any]:
    """GPZ 110/15 kV (Yd11) z zespołem uziemiającym ``wariant`` sekcji 1 i 2 km kabla; sieć
    zasilająca 110 kV z Z0/Z1 = 3 (``z0_wn``) albo bez danych składowej zerowej."""
    enm = EnergyNetworkModel(
        header=ENMHeader(name="Uziom stacji", defaults=ENMDefaults(sn_nominal_kv=zu.UN_KV))
    ).model_dump(mode="json")
    zastepcza: dict[str, Any] = {
        "short_circuit_input_side": "HV_110",
        "hv_voltage_kv": 110.0,
        "sk3_hv_mva": SK_Q_MVA,
        "rx_ratio": RX_Q,
    }
    if z0_wn:
        zastepcza["z0_z1_ratio"] = Z0_Z1_SIECI_WN
    zespol = zu._zespol(wariant, 1)
    wynik = execute_domain_operation(
        enm_dict=enm,
        op_name="add_grid_source_sn",
        payload={
            "source_name": "GPZ Łąkowa",
            "voltage_kv": zu.UN_KV,
            "sections_count": 1,
            "manual_equivalent": zastepcza,
            "transformer_count": 1,
            "transformer_catalog_ref": zu.TRAFO_WN_SN,
            "zespoly_uziemiajace": [] if zespol is None else [zespol],
        },
    )
    assert not wynik.get("error"), wynik.get("error")
    return _z_odcinkami(wynik["snapshot"], ODCINKI["kabel"])


def _szyna_sn_stacji(migawka: dict[str, Any]) -> str:
    return zu._szyny(migawka)[0]


#: Stacja odbiorcza SN/nN na końcu kabla (kreator stacji końcowej — ścieżka projektanta).
APARAT_POLA = "sw-cb-abb-vd4-17kv-630a"
TRAFO_SN_NN = "tr-sn-nn-15-04-630kva-dyn11"


def _z_stacja_odbiorcza(migawka: dict[str, Any]) -> dict[str, Any]:
    """Dokłada stację końcową 15/0,4 kV na zacisku końcowym kabla (``append_station_on_
    endpoint``) — stacja bez dławika gaszącego i bez strony WN, z szyną nN."""
    (koniec,) = (b["ref_id"] for b in migawka["buses"] if b["ref_id"].endswith("/downstream"))
    wynik = execute_domain_operation(
        enm_dict=migawka,
        op_name="append_station_on_endpoint",
        payload={
            "endpoint_bus_ref": koniec,
            "station": {"name": "Stacja Brzozowa", "station_type": "terminal"},
            "field_apparatus_catalog_ref": APARAT_POLA,
            "transformer": {"transformer_catalog_ref": TRAFO_SN_NN},
            "nn_voltage_kv": 0.4,
            "sn_fields": [{"field_role": "LINIA_IN"}],
        },
    )
    assert not wynik.get("error"), wynik.get("error")
    return wynik["snapshot"]


def _stacja_odbiorcza(migawka: dict[str, Any]) -> dict[str, Any]:
    (stacja,) = (s for s in migawka["substations"] if s["name"] == "Stacja Brzozowa")
    return stacja


def _szyna_sn_stacji_odbiorczej(migawka: dict[str, Any]) -> str:
    napiecia = {b["ref_id"]: b["voltage_kv"] for b in migawka["buses"]}
    (szyna,) = (r for r in _stacja_odbiorcza(migawka)["bus_refs"] if napiecia[r] == zu.UN_KV)
    return szyna


def _bieg_uziomu(
    klient: TestClient,
    model: EnergyNetworkModel,
    bus_ref: str,
    *,
    nadpisanie_ka: float | None = None,
) -> dict[str, Any]:
    """Bieg ``earthing_safety`` przez API; zwraca kopertę wyniku solvera (``result``,
    ``white_box_trace``, ``deterministic_hash``)."""
    reset_enm_store()
    projekt = klient.post("/api/projects", json={"name": "Uziom stacji"})
    assert projekt.status_code == 201, projekt.text
    przypadek = klient.post(
        "/api/study-cases", json={"project_id": projekt.json()["id"], "name": "Przypadek"}
    )
    assert przypadek.status_code == 201, przypadek.text
    set_enm(klucz_twin_projektu(projekt.json()["id"]), model)
    uziom: dict[str, Any] = {**UZIOM, "bus_ref": bus_ref}
    if nadpisanie_ka is not None:
        uziom["fault_current_ka"] = nadpisanie_ka
    zlecenie = uruchom_v126(
        klient, str(przypadek.json()["id"]), "earthing_safety", {"earthing": uziom}
    )
    assert zlecenie.status_code == 202, zlecenie.text
    wynik = klient.get(zlecenie.json()["result_url"])
    assert wynik.status_code == 200, wynik.text
    koperta = wynik.json()["result"]
    assert isinstance(koperta, dict)
    assert isinstance(koperta["result"], dict)
    return koperta


# ---------------------------------------------------------------------------
# Wyrocznie ręczne
# ---------------------------------------------------------------------------


def _i_c() -> float:
    return SQ3 * UN_V * _b0_odcinkow_s(ODCINKI["kabel"])


def _wyrocznia_sn_stacji(tryb: str) -> tuple[str, float]:
    """(wielkość EN 50522 tab. 1, prąd [A]) szyny SN stacji GPZ — dławik stoi w tej stacji."""
    if tryb == "izolowany":
        return "I_C", _i_c()
    if tryb == "kompensowany":
        o = wyrocznia_pradu(tryb, _i_c(), [(complex(0.0, zu.X_L), zu.Z0_TU)])
        return "√(I_L² + I_res²)", math.hypot(o["i_l"], o["prad"])
    if tryb == "rezystor":
        # Sieć uziemiona przez rezystor: I″k1 IEC 60909 (c = 1,1), Z0 = (Z0_TU + 3R_N)∥(1/jB0)
        # — NIE prąd doziemienia solvera sieci (U_f bez c), który meldowany jest obok.
        b0 = _b0_odcinkow_s(ODCINKI["kabel"])
        z0 = 1.0 / (1.0 / (zu.Z0_TU + 3.0 * zu.R_N) + 1j * b0)
        return "I″k1", SQ3 * zu.C_MAX * UN_V / abs(2.0 * _z1_reczne() + z0)
    return "I″k1", _wyrocznia_sposobu("bezposrednie")["prad"]


def _wyrocznia_wn() -> float:
    """I″k1 szyny 110 kV: sieć zasilająca Z_Q = c·U²/S″k (R/X = 0,1), Z0 = 3·Z_Q; transformator
    Yd11 (gwiazda WN bez uziemienia) nie wnosi drogi zerowej."""
    z_q = zu.C_MAX * (U_WN_V / 1e3) ** 2 / SK_Q_MVA
    x_q = z_q / math.sqrt(1.0 + RX_Q**2)
    z1 = complex(RX_Q * x_q, x_q)
    return SQ3 * zu.C_MAX * U_WN_V / abs(2.0 * z1 + Z0_Z1_SIECI_WN * z1)


def _przypadki(wynik: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {p["strona"] + ":" + p["stan_awsc"]: p for p in wynik["prad_uziomowy"]["przypadki"]}


def _sprawdz_uziom(wynik: dict[str, Any], i_f_a: float) -> None:
    """I_E = r·I_F, U_E = I_E·R_E (EN 50522 — wzrost potencjału uziomu)."""
    assert wynik["i_f_ka"] == pytest.approx(i_f_a / 1000.0, rel=1e-5, abs=1e-6)
    # Pola wyniku zaokrąglone do 6 miejsc (kA, kV) — tolerancja bezwzględna 1e-6.
    assert wynik["i_g_ka"] == pytest.approx(
        wynik["i_f_ka"] * UZIOM["split_factor"], rel=1e-5, abs=1e-6
    )
    assert wynik["gpr_kv"] == pytest.approx(wynik["i_g_ka"] * wynik["r_g_ohm"], rel=1e-5, abs=1e-6)


def _sprawdz_dane_i_kompletnosc(wynik: dict[str, Any]) -> None:
    """Każda dana przyjęta prądu jest szacowana (nie udaje danej producenta) i wchodzi do
    statusu danych KAŻDEGO rekordu oceny uziomu (ZASADA NR 4) — rekord niesie wtedy dowód
    NIEPELNY, a wynik też. Kompletność wyniku liczy jedna funkcja API z rekordów oceny
    (``v126_oceny.kompletnosc_wyniku``); kryteria napięć rażeniowych są założeniami
    inżynierskimi (Z-4, Z-5 rejestru), więc dowód jest niepełny także bez danych prądu.
    """
    for dana in wynik["dane_przyjete"]:
        assert dana["jakosc"] == "ESTIMATED", dana
        assert dana["powod_pl"], dana
    assert wynik["oceny"]
    for ocena in wynik["oceny"]:
        nazwy = {d["nazwa_pl"] for d in ocena["dowod"]["status_danych"]["dane_przyjete"]}
        assert {d["nazwa_pl"] for d in wynik["dane_przyjete"]} <= nazwy
        assert ocena["kompletnosc_dowodu"] == "NIEPELNY"
    assert wynik["kompletnosc_dowodu"] == "NIEPELNY"


# ---------------------------------------------------------------------------
# Iloczyn: sposób SN × strona WN × źródło prądu (szyna SN stacji GPZ)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("zrodlo", ZRODLA)
@pytest.mark.parametrize("strona_wn", STRONY_WN)
@pytest.mark.parametrize("tryb", SPOSOBY)
def test_prad_stacji_z_modelu_iloczyn_sposob_wn_zrodlo(
    klient: TestClient, tryb: str, strona_wn: str, zrodlo: str
) -> None:
    migawka = _siec(WARIANT_TRYBU[tryb], z0_wn=strona_wn == "liczona")
    szyna = _szyna_sn_stacji(migawka)
    koperta = _bieg_uziomu(
        klient,
        EnergyNetworkModel.model_validate(migawka),
        szyna,
        nadpisanie_ka=NADPISANIE_KA if zrodlo == "nadpisanie" else None,
    )
    wynik = koperta["result"]
    assert wynik["bus_ref"] == szyna
    przypadki = _przypadki(wynik)
    assert set(przypadki) == {"SN:spoczynek", "WN:spoczynek"}

    # Strona SN — wielkość EN 50522 tab. 1 wg sposobu pracy punktu neutralnego.
    sn = przypadki["SN:spoczynek"]
    wielkosc, prad_sn = _wyrocznia_sn_stacji(tryb)
    assert sn["tryb"] == tryb
    assert sn["wielkosc"] == wielkosc
    assert sn["prad_a"] == pytest.approx(prad_sn, rel=1e-5)
    assert sn["brak_pl"] is None
    assert sn["nazwa_pl"] == "sieć SN 15 kV — Szyna GPZ S1 15 kV"

    # Strona WN — I″k1 110 kV albo nazwana przyczyna braku (nigdy zero ani liczba domyślna).
    wn = przypadki["WN:spoczynek"]
    assert wn["wielkosc"] == "I″k1"
    if strona_wn == "liczona":
        assert wn["prad_a"] == pytest.approx(_wyrocznia_wn(), rel=1e-6)
        assert wn["brak_pl"] is None
    else:
        assert wn["prad_a"] is None
        assert "Z0 sieci zasilającej nieznane" in wn["brak_pl"]

    # Rozstrzygnięcie: nadpisanie projektanta albo największy przypadek z modelu.
    z_modelu = max(p for p in (sn["prad_a"], wn["prad_a"]) if p is not None)
    rozstrzyga = sn["nazwa_pl"] if z_modelu == sn["prad_a"] else wn["nazwa_pl"]
    if strona_wn == "liczona":
        assert rozstrzyga == wn["nazwa_pl"], "I″k1 110 kV przewyższa każdy prąd SN tej sieci"
    if zrodlo == "nadpisanie":
        _sprawdz_uziom(wynik, NADPISANIE_KA * 1000.0)
        assert wynik["prad_uziomowy"]["rozstrzyga"] == "nadpisanie projektanta"
        (dana,) = wynik["dane_przyjete"]
        assert dana["nazwa_pl"] == "Prąd zwarcia doziemnego stacji (nadpisanie projektanta)"
        assert dana["wartosc"] == {"wartosc": NADPISANIE_KA, "jednostka": "kA"}
        # Powód nazywa wartość z modelu, którą projektant zastąpił (zapis polski: przecinek).
        z_modelu_ka = str(round(z_modelu / 1000.0, 6)).replace(".", ",")
        assert f"{z_modelu_ka} kA — {rozstrzyga}" in dana["powod_pl"]
    else:
        _sprawdz_uziom(wynik, z_modelu)
        assert wynik["prad_uziomowy"]["rozstrzyga"] == rozstrzyga
        assert rozstrzyga in wynik["prad_uziomowy"]["uzasadnienie_pl"]
        assert "EN 50522" in wynik["prad_uziomowy"]["podstawa_pl"]
    _sprawdz_dane_i_kompletnosc(wynik)

    # Ślad White Box: krok prądu uziomowego z przypadkami i rozstrzygnięciem.
    (krok,) = (k for k in koperta["white_box_trace"] if k["key"] == "en50522_prad_uziomowy")
    assert krok["result"]["rozstrzyga"] == wynik["prad_uziomowy"]["rozstrzyga"]
    assert len(krok["data"]["przypadki"]) == 2
    # Podstawienie kroku i uzasadnienie wyniku z tych samych wartości: przy nadpisaniu tekst
    # identyczny; z modelu podstawienie to uzasadnienie bez wzoru symbolu (proza kroku).
    uzasadnienie = wynik["prad_uziomowy"]["uzasadnienie_pl"]
    if zrodlo == "nadpisanie":
        assert krok["substitution"] == uzasadnienie
    else:
        przed, _, po = uzasadnienie.partition(" = ")
        assert krok["substitution"] == przed.rsplit(" ($", 1)[0] + " (" + po
    _slad_bez_latex_w_prozie(koperta)


@pytest.mark.parametrize("tryb", SPOSOBY)
def test_stacja_odbiorcza_rowna_biegowi_zwarciowemu(klient: TestClient, tryb: str) -> None:
    """Stacja odbiorcza 15/0,4 kV zasilana z GPZ: jeden przypadek SN (szyna nN poza EN 50522,
    brak strony WN), liczba równa wierszowi zwarcia doziemnego biegu kanonicznego IEC 60909
    tej szyny (predykat parą); sieć skompensowana — I_res, bo dławik gaszący stoi w GPZ,
    nie w tej stacji (EN 50522 tab. 1)."""
    migawka = _z_stacja_odbiorcza(_siec(WARIANT_TRYBU[tryb], z0_wn=False))
    szyna = _szyna_sn_stacji_odbiorczej(migawka)
    napiecia = {b["ref_id"]: b["voltage_kv"] for b in migawka["buses"]}
    assert 0.4 in {napiecia[r] for r in _stacja_odbiorcza(migawka)["bus_refs"]}
    wiersz = zu._wiersz(_bieg_szyny(migawka, szyna, (), klucz=f"stacja-{tryb}"), szyna)
    reset_canonical_runs()
    wynik = _bieg_uziomu(klient, EnergyNetworkModel.model_validate(migawka), szyna)["result"]
    ((klucz, przypadek),) = _przypadki(wynik).items()
    assert klucz == "SN:spoczynek"
    assert przypadek["bus_ref"] == szyna
    assert przypadek["nazwa_pl"].startswith("sieć SN 15 kV — ")
    if tryb in ("rezystor", "bezposrednie"):
        oczekiwany, wielkosc = wiersz["ikss_a"], "I″k1"
    else:
        oczekiwany = wiersz["doziemienie_sieci"]["prad_a"]
        wielkosc = "I_C" if tryb == "izolowany" else "I_res"
    assert przypadek["wielkosc"] == wielkosc
    assert oczekiwany is not None
    assert przypadek["prad_a"] == pytest.approx(oczekiwany, rel=1e-6)
    if tryb in ("izolowany", "kompensowany"):
        # Prąd sieci nieuziemionej nie zależy od miejsca doziemienia (impedancje podłużne
        # pominięte) — ta sama wyrocznia co dla szyny GPZ.
        assert przypadek["prad_a"] == pytest.approx(_wyrocznia_sposobu(tryb)["prad"], rel=1e-5)
    _sprawdz_uziom(wynik, przypadek["prad_a"])
    _sprawdz_dane_i_kompletnosc(wynik)


def test_wezel_pomocniczy_to_nazwany_brak(klient: TestClient) -> None:
    """Zacisk końcowy kabla (węzeł pomocniczy, ``helper_bus``) nie jest szyną rozdzielni — ta
    sama reguła co punkty zwarcia biegu IEC 60909; bieg blokuje warunek gotowości z przyczyną,
    a z nadpisaniem projektanta liczy się z nazwanym brakiem prądu z modelu."""
    migawka = _siec("rezystor", z0_wn=False)
    (koniec,) = (b for b in migawka["buses"] if b["ref_id"].endswith("/downstream"))
    assert "helper_bus" in koniec["tags"]
    model = EnergyNetworkModel.model_validate(migawka)
    koperta = _bieg_uziomu(klient, model, koniec["ref_id"], nadpisanie_ka=NADPISANIE_KA)
    _slad_bez_latex_w_prozie(koperta)
    wynik = koperta["result"]
    assert wynik["prad_uziomowy"]["przypadki"] == []
    (dana,) = wynik["dane_przyjete"]
    assert "węzłem pomocniczym" in dana["powod_pl"]
    _sprawdz_uziom(wynik, NADPISANIE_KA * 1000.0)


def test_awsc_dwa_przypadki_rozstrzyga_zalaczona(klient: TestClient) -> None:
    """Sieć skompensowana z AWSC: przypadek automatyki w spoczynku i załączonej (wymuszona
    składowa czynna); uziom wymiaruje większy — z wyroczni ręcznej obu stanów."""
    migawka = _siec("dlawik_awsc_spoczynek", z0_wn=False)
    wynik = _bieg_uziomu(
        klient, EnergyNetworkModel.model_validate(migawka), _szyna_sn_stacji(migawka)
    )["result"]
    przypadki = _przypadki(wynik)
    assert set(przypadki) == {"SN:spoczynek", "SN:zalaczony", "WN:spoczynek"}
    oczekiwane: dict[str, float] = {}
    for stan, nazwa_stanu in (("spoczynek", "AWSC w spoczynku"), ("zalaczony", "AWSC załączona")):
        z_n = zu.Z_N_WARIANTU[f"dlawik_awsc_{stan}"]
        assert z_n is not None
        o = wyrocznia_pradu("kompensowany", _i_c(), [(z_n, zu.Z0_TU)])
        oczekiwane[stan] = math.hypot(o["i_l"], o["prad"])
        p = przypadki[f"SN:{stan}"]
        assert p["prad_a"] == pytest.approx(oczekiwane[stan], rel=1e-5)
        assert p["nazwa_pl"].endswith(f"({nazwa_stanu})")
    assert oczekiwane["zalaczony"] > oczekiwane["spoczynek"]
    assert wynik["prad_uziomowy"]["rozstrzyga"] == przypadki["SN:zalaczony"]["nazwa_pl"]
    _sprawdz_uziom(wynik, oczekiwane["zalaczony"])


def test_determinizm_dwa_biegi_ten_sam_wynik(klient: TestClient) -> None:
    migawka = _siec("dlawik", z0_wn=True)
    model = EnergyNetworkModel.model_validate(migawka)
    a = _bieg_uziomu(klient, model, _szyna_sn_stacji(migawka))
    b = _bieg_uziomu(klient, model, _szyna_sn_stacji(migawka))
    assert a["deterministic_hash"] == b["deterministic_hash"]
    assert a["result"] == b["result"]
    assert a["white_box_trace"] == b["white_box_trace"]


def test_szyna_spoza_modelu_to_nazwany_brak_bez_liczby(klient: TestClient) -> None:
    """Szyna stacji spoza modelu i brak nadpisania: nazwany brak, żadnych napięć rażeniowych."""
    migawka = _siec("izolowany", z0_wn=False)
    reset_enm_store()
    projekt = klient.post("/api/projects", json={"name": "Uziom stacji"}).json()["id"]
    przypadek = klient.post(
        "/api/study-cases", json={"project_id": projekt, "name": "Przypadek"}
    ).json()["id"]
    set_enm(klucz_twin_projektu(projekt), EnergyNetworkModel.model_validate(migawka))
    odmowa = uruchom_v126(
        klient, str(przypadek), "earthing_safety", {"earthing": {**UZIOM, "bus_ref": "brak"}}
    )
    # Gotowość blokuje bieg: szyna spoza modelu nie daje prądu (warunek model.prad_uziomowy).
    assert odmowa.status_code == 422, odmowa.text
    assert "model.prad_uziomowy" in odmowa.text


# ---------------------------------------------------------------------------
# Intencja skasowanego testu grupy połączeń: grupa → I″k1 → U_E = r·I″k1·R_E
# ---------------------------------------------------------------------------

#: I″k1 po stronie 15 kV (c = 1,1) sieci z testu skasowanego w 6bfd4bcab — wartości
#: odniesienia tamtego testu (wyrocznia składowych symetrycznych: Dyn11 — Z0 = Z0_T,
#: YNyn0 — Z0 = Z0_T + Z0_Q·(15/110)²).
IK1_GRUPY_A = {"Dyn11": 8849.00, "YNyn0": 7932.23}


def _siec_grupy(grupa: str) -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(name="Grupa połączeń"),
        buses=[
            Bus(ref_id="bus_wn", name="Szyna 110 kV", voltage_kv=110.0),
            Bus(ref_id="bus_sn", name="Szyna 15 kV", voltage_kv=15.0),
        ],
        sources=[
            Source(
                ref_id="siec_wn",
                name="Sieć 110 kV",
                bus_ref="bus_wn",
                model="thevenin",
                r_ohm=0.8,
                x_ohm=8.0,
                r0_ohm=2.0,
                x0_ohm=20.0,
            )
        ],
        transformers=[
            Transformer(
                ref_id="tr",
                name="Transformator 110/15 kV",
                hv_bus_ref="bus_wn",
                lv_bus_ref="bus_sn",
                sn_mva=25.0,
                uhv_kv=110.0,
                ulv_kv=15.0,
                uk_percent=11.0,
                pk_kw=110.0,
                vector_group=grupa,
            )
        ],
    )


def test_grupa_polaczen_wyznacza_prad_i_napiecie_uziomu(klient: TestClient) -> None:
    wyniki = {g: _bieg_uziomu(klient, _siec_grupy(g), "bus_sn")["result"] for g in IK1_GRUPY_A}
    for grupa, ik1 in IK1_GRUPY_A.items():
        wynik = wyniki[grupa]
        ((klucz, przypadek),) = _przypadki(wynik).items()
        assert klucz == "SN:spoczynek"
        # Punkt neutralny 15 kV uziemiony bezpośrednio (yn) — miarodajny I″k1 (EN 50522 tab. 1).
        assert przypadek["tryb"] == "bezposrednie"
        assert przypadek["wielkosc"] == "I″k1"
        assert przypadek["prad_a"] == pytest.approx(ik1, abs=0.01)
        _sprawdz_uziom(wynik, ik1)
    # Ta sama siatka uziomu: U_E proporcjonalne do I″k1 grupy (U_E = r·I″k1·R_E).
    dyn, ynyn = wyniki["Dyn11"], wyniki["YNyn0"]
    assert dyn["r_g_ohm"] == ynyn["r_g_ohm"]
    assert dyn["gpr_kv"] / ynyn["gpr_kv"] == pytest.approx(
        IK1_GRUPY_A["Dyn11"] / IK1_GRUPY_A["YNyn0"], rel=1e-5
    )
    assert dyn["gpr_kv"] > ynyn["gpr_kv"]
