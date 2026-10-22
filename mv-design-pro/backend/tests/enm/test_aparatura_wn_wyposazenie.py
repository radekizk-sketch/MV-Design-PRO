"""Aparat pola SN: jedna prawda, kontrola napięcia, wymagania standardu; łącznik 110 kV jako
łącznik topologii zasilania (karta KATALOG-APARATURA-WN po zmianie zakresu 2026-10-22).

Decyzja właściciela 2026-10-22: strona 110 kV jest funkcjonalną granicą zasilania GPZ — nie
projektuje się pól 110 kV ani ich aparatury; łącznik 110 kV ma jeden typ minimalny na rodzaj
(wyłącznik, odłącznik) wyłącznie do wiązania katalogowego i stanu. Rozdzielnica SN — pełna.

Cechy iloczynu:

* rodzaj aparatu ∈ {wyłącznik, odłącznik, uziemnik, ogranicznik przepięć} × klasa pozycji ∈
  {U_r ≥ U_m sieci pola, U_r < U_m} w polu SN 15 kV — odmowa
  ``bay_equipment.voltage_rating_too_low`` z liczbami albo rekord kontroli z marginesem;
* przekładnik ∈ {prądowy, napięciowy} — typ nie niesie napięcia izolacji → „nie oceniono”;
* szablon pola ∈ {każdy kanoniczny szablon SN} × pole ∈ {SN — wymagania = skład szablonu,
  szyna 110 kV — odmowa ``bay_equipment.template_voltage_mismatch``};
* wymagania standardu × {aparat zaprojektowany, brakujący, pole bez szablonu};
* łańcuch aparatury szablonów SN wg ENEA Zeszyt 1 zał. Z.2 (kolejność elektryczna, głowica
  kablowa, przekładnik sprzęgła, pola zespołu uziemiającego i baterii kondensatorów);
* jedna prawda typu łącznika: gałąź z wiązaniem APARAT_SN ↔ projekcja rekordu pola ↔ odczyt
  pola ↔ zmiana typu gałęzi ↔ ``catalog_ref`` w ładunku przypisany gałęzi — × szyna
  {SN, 110 kV};
* kontrola modelu (walidator) × droga wstawienia ∈ {pole ``add_sn_bay``, ogranicznik
  ``add_surge_arrester_sn``, łącznik 110 kV z modelu zewnętrznego bez typu};
* typy minimalne łączników 110 kV: dokładnie wyłącznik i odłącznik, U_m 123 kV, ESTIMATED
  z podstawą i założeniem, bez danych wytrzymałościowych;
* atomowość każdej odmowy i determinizm.

Sieć budowana operacjami domenowymi: GPZ z równoważnikiem po stronie 110 kV (szyna 110 kV
w modelu jako granica zasilania), pola przez ``add_sn_bay``.
"""

from __future__ import annotations

import copy
from typing import Any

import pytest
from application.field_read_model import build_field_read_model
from enm.domain_operations import execute_domain_operation
from enm.katalog_projektu import katalog_biezacy
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader
from enm.pola import napiecia_szyn
from enm.validator import ENMValidator
from enm.wyposazenie_pola import (
    aparaty_za_niskiego_napiecia,
    kontrola_napiecia_aparatu,
    laczniki_wn_bez_typu,
    napiecie_znamionowe_pozycji_kv,
)
from network_model.catalog.bay_templates import (
    BAY_TEMPLATE_REGISTRY,
    protection_codes_for_bay_role,
)

from tests.reference_networks.budowa_przez_api import TRANSFORMATOR_WN_SN, wiazanie

#: Typy minimalne łączników topologii zasilania 110 kV.
WYLACZNIK_110KV = "sw-cb-110kv"
ODLACZNIK_110KV = "sw-ds-110kv"

UMIEJSCOWIENIE: dict[str, str] = {
    "CB": "MIDSTREAM",
    "DS": "UPSTREAM",
    "ES": "GROUND_BRANCH",
    "SURGE_ARRESTER": "GROUND_BRANCH",
    "CT": "MIDSTREAM",
    "VT": "OFF_PATH",
}
RODZAJE_Z_U_R = ("CB", "DS", "ES", "SURGE_ARRESTER")
RODZAJE_PRZEKLADNIKOW = ("CT", "VT")
#: Sieć SN pól testu: 15 kV → U_m = 17,5 kV (IEC 60038 tab. 3).
NAPIECIE_SN_KV = 15.0
U_M_SN_KV = 17.5


def _przestrzen(rodzaj: str) -> str:
    return "OGRANICZNIK_SN" if rodzaj == "SURGE_ARRESTER" else "APARAT_SN"


def _pozycje_rodzaju(rodzaj: str) -> list[tuple[float, str]]:
    katalog = katalog_biezacy()
    if rodzaj == "SURGE_ARRESTER":
        slownik: dict[str, Any] = katalog.surge_arrester_types
    else:
        rodzaj_kat = {"CB": "WYLACZNIK", "DS": "ODLACZNIK", "ES": "UZIEMNIK"}[rodzaj]
        slownik = {
            r: t for r, t in katalog.mv_apparatus_types.items() if t.device_kind == rodzaj_kat
        }
    return sorted(
        (u_r, r)
        for r in sorted(slownik)
        if (u_r := napiecie_znamionowe_pozycji_kv(_przestrzen(rodzaj), r)) is not None
        and u_r <= 36.0
    )


def _pozycja(rodzaj: str, klasa: str) -> str:
    """Pozycja klasy SN: ``zgodna`` — najniższa z U_r ≥ U_m sieci 15 kV (przypadek graniczny),
    ``za_niska`` — najwyższa z U_r < U_m (najtrudniejszy przypadek odmowy)."""
    pozycje = _pozycje_rodzaju(rodzaj)
    if klasa == "zgodna":
        return min(p for p in pozycje if p[0] >= U_M_SN_KV)[1]
    return max(p for p in pozycje if p[0] < U_M_SN_KV)[1]


def _op(enm: dict[str, Any], nazwa: str, ladunek: dict[str, Any]) -> dict[str, Any]:
    return execute_domain_operation(enm, nazwa, ladunek)


def _ok(wynik: dict[str, Any]) -> dict[str, Any]:
    assert wynik.get("error") in (None, ""), (wynik.get("error_code"), wynik.get("error"))
    return wynik["snapshot"]


def _gpz() -> dict[str, Any]:
    enm = EnergyNetworkModel(
        header=ENMHeader(name="aparatura-pola", defaults=ENMDefaults(sn_nominal_kv=15.0))
    ).model_dump(mode="json")
    return _ok(
        _op(
            enm,
            "add_grid_source_sn",
            {
                "voltage_kv": NAPIECIE_SN_KV,
                "manual_equivalent": {
                    "short_circuit_input_side": "HV_110",
                    "hv_voltage_kv": 110.0,
                    "sk3_hv_mva": 3000.0,
                    "rx_ratio": 0.1,
                },
                "sections_count": 1,
                "transformer_count": 1,
                "transformer_catalog_binding": wiazanie("TRAFO_SN_NN", TRANSFORMATOR_WN_SN),
            },
        )
    )


def _szyna(enm: dict[str, Any], napiecie_kv: float) -> str:
    napiecia = napiecia_szyn(enm)
    stacja = enm["substations"][0]
    return next(b for b in stacja["bus_refs"] if napiecia.get(b) == napiecie_kv)


def _dodaj_pole(
    enm: dict[str, Any], szyna: str, catalog_ref: str, rola: str = "IN"
) -> tuple[dict[str, Any], str]:
    przed = {b["ref_id"] for b in enm["bays"]}
    po = _ok(
        _op(
            enm,
            "add_sn_bay",
            {
                "bus_ref": szyna,
                "station_ref": enm["substations"][0]["ref_id"],
                "bay_role": rola,
                "catalog_ref": catalog_ref,
            },
        )
    )
    (nowe,) = (b["ref_id"] for b in po["bays"] if b["ref_id"] not in przed)
    return po, nowe


@pytest.fixture(scope="module")
def siec() -> tuple[dict[str, Any], dict[str, str]]:
    """Pole SN 15 kV (wyłącznik 17,5 kV) i łącznik topologii 110 kV (typ minimalny)."""
    enm = _gpz()
    enm, pole_sn = _dodaj_pole(enm, _szyna(enm, NAPIECIE_SN_KV), _pozycja("CB", "zgodna"))
    enm, pole_wn = _dodaj_pole(enm, _szyna(enm, 110.0), WYLACZNIK_110KV)
    return enm, {"SN": pole_sn, "WN": pole_wn}


def _pole(enm: dict[str, Any], ref: str) -> dict[str, Any]:
    return next(b for b in enm["bays"] if b["ref_id"] == ref)


def _galaz(enm: dict[str, Any], ref: str) -> dict[str, Any]:
    return next(g for g in enm["branches"] if g["ref_id"] == ref)


def _lacznik_pola(enm: dict[str, Any], pole_ref: str) -> str:
    refs = _pole(enm, pole_ref)["equipment_refs"]
    return next(r for r in refs if _galaz(enm, r).get("catalog_namespace") == "APARAT_SN")


def _wyposaz(enm: dict[str, Any], pole_ref: str, devices: list[dict[str, Any]]) -> dict[str, Any]:
    return _op(
        enm, "set_bay_equipment", {"bay_ref": pole_ref, "mode": "katalog", "devices": devices}
    )


def _odmowa(enm: dict[str, Any], ladunek: dict[str, Any], kod: str) -> dict[str, Any]:
    wejscie = copy.deepcopy(enm)
    wynik = _op(enm, "set_bay_equipment", ladunek)
    assert wynik.get("error_code") == kod, (wynik.get("error_code"), wynik.get("error"))
    assert wynik["snapshot"] is None
    assert enm == wejscie, "odmowa zmieniła model wejściowy"
    return wynik


def _kv(wartosc: float) -> str:
    return f"{wartosc:g}".replace(".", ",") + " kV"


# ---------------------------------------------------------------------------
# Kontrola napięcia: rodzaj × klasa pozycji w polu SN
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("klasa", ["zgodna", "za_niska"])
@pytest.mark.parametrize("rodzaj", RODZAJE_Z_U_R)
def test_kontrola_napiecia_aparatu_pola_sn(siec: Any, rodzaj: str, klasa: str) -> None:
    enm, pola = siec
    pozycja = _pozycja(rodzaj, klasa)
    ladunek = {
        "bay_ref": pola["SN"],
        "mode": "katalog",
        "devices": [{"kind": rodzaj, "placement": UMIEJSCOWIENIE[rodzaj], "catalog_ref": pozycja}],
    }
    u_r = napiecie_znamionowe_pozycji_kv(_przestrzen(rodzaj), pozycja)
    assert u_r is not None
    if klasa == "za_niska":
        wynik = _odmowa(enm, ladunek, "bay_equipment.voltage_rating_too_low")
        # Komunikat z liczbami: U_r pozycji i U_m sieci pola; bez identyfikatorów.
        assert _kv(u_r) in wynik["error"] and _kv(U_M_SN_KV) in wynik["error"]
        assert pozycja not in wynik["error"] and pola["SN"] not in wynik["error"]
        return
    wynik = _op(enm, "set_bay_equipment", ladunek)
    assert wynik.get("error") is None, wynik.get("error")
    (aparat,) = wynik["wyposazenie_pola"]["aparaty"]
    kontrola = aparat["kontrola_napiecia"]
    assert kontrola["u_r_kv"] == u_r
    assert kontrola["u_m_sieci_kv"] == U_M_SN_KV
    assert kontrola["margines_kv"] == pytest.approx(u_r - U_M_SN_KV)
    assert kontrola["napiecie_wystarcza"] is True
    assert "PN-EN 62271-1" in kontrola["podstawa_pl"]
    assert _kv(U_M_SN_KV) in kontrola["wyjasnienie_pl"]


@pytest.mark.parametrize("rodzaj", RODZAJE_PRZEKLADNIKOW)
def test_przekladnik_sn_nie_jest_oceniany(siec: Any, rodzaj: str) -> None:
    """Typy przekładników nie niosą napięcia izolacji: kontrola jest „nie oceniono” z
    przyczyną (brak danych ≠ spełnia), operacja nie zgaduje napięcia i nie odmawia."""
    enm, pola = siec
    katalog = katalog_biezacy()
    pozycja = sorted(katalog.ct_types if rodzaj == "CT" else katalog.vt_types)[0]
    wynik = _wyposaz(
        enm,
        pola["SN"],
        [{"kind": rodzaj, "placement": UMIEJSCOWIENIE[rodzaj], "catalog_ref": pozycja}],
    )
    assert wynik.get("error") is None, wynik.get("error")
    kontrola = wynik["wyposazenie_pola"]["aparaty"][0]["kontrola_napiecia"]
    assert kontrola["napiecie_wystarcza"] is None
    assert kontrola["u_r_kv"] is None and kontrola["margines_kv"] is None
    assert kontrola["wyjasnienie_pl"].startswith("Nie oceniono")


def test_predykat_kontroli_na_granicy_u_m() -> None:
    """Granica PN-EN 62271-1 p. 5.2: U_r = U_m wystarcza, U_r < U_m nie (sieć 15 kV:
    U_m = 17,5 kV; aparat 17,5 kV — tak, aparat 12 kV — nie; sieć nN — nie oceniono;
    sieć 110 kV: U_m = 123 kV — typ minimalny łącznika 110 kV na granicy)."""
    katalog = katalog_biezacy()
    wg_u_r: dict[float, str] = {}
    for ref, typ in sorted(katalog.mv_apparatus_types.items()):
        wg_u_r.setdefault(typ.u_n_kv, ref)
    kontrola = kontrola_napiecia_aparatu
    assert kontrola({"kind": "CB", "catalog_ref": wg_u_r[17.5]}, 15.0)["napiecie_wystarcza"]
    zbyt_niski = kontrola({"kind": "CB", "catalog_ref": wg_u_r[12.0]}, 15.0)
    assert zbyt_niski["napiecie_wystarcza"] is False
    nn = kontrola({"kind": "CB", "catalog_ref": wg_u_r[12.0]}, 0.4)
    assert nn["napiecie_wystarcza"] is None
    wn = kontrola({"kind": "CB", "catalog_ref": WYLACZNIK_110KV}, 110.0)
    assert wn["napiecie_wystarcza"] is True and wn["margines_kv"] == 0.0
    sn_na_wn = kontrola({"kind": "CB", "catalog_ref": wg_u_r[24.0]}, 110.0)
    assert sn_na_wn["napiecie_wystarcza"] is False


# ---------------------------------------------------------------------------
# Szablon pola × napięcie pola; wymagane standardem / zaprojektowane / brakujące
# ---------------------------------------------------------------------------


def test_szablon_sn_na_szynie_110kv_jest_odmowa(siec: Any) -> None:
    """Szablony pól dotyczą rozdzielnicy SN — strona 110 kV nie jest przedmiotem projektu pól."""
    enm, pola = siec
    wynik = _odmowa(
        enm,
        {"bay_ref": pola["WN"], "mode": "szablon", "bay_template_ref": "bay_template_line_in"},
        "bay_equipment.template_voltage_mismatch",
    )
    assert "110 kV" in wynik["error"] and "rozdzielnicy SN" in wynik["error"]


@pytest.mark.parametrize("szablon", sorted(BAY_TEMPLATE_REGISTRY))
def test_szablon_sn_w_polu_sn_daje_wymagania_standardu(szablon: str) -> None:
    sklad = BAY_TEMPLATE_REGISTRY[szablon]
    enm = _gpz()
    enm, pole_sn = _dodaj_pole(
        enm, _szyna(enm, NAPIECIE_SN_KV), _pozycja("CB", "zgodna"), sklad.bay_role
    )
    wynik = _op(
        enm,
        "set_bay_equipment",
        {"bay_ref": pole_sn, "mode": "szablon", "bay_template_ref": szablon},
    )
    assert wynik.get("error") is None, wynik.get("error")
    wymagania = wynik["wyposazenie_pola"]["wymagania_standardu"]
    assert wymagania["bay_template_ref"] == szablon
    if sklad.podstawa_pl is not None:
        assert wymagania["podstawa_pl"] == sklad.podstawa_pl
    else:
        assert sklad.name in wymagania["podstawa_pl"]
    assert wymagania["liczba_wymaganych"] == len(sklad.devices)
    assert [p["designation"] for p in wymagania["pozycje"]] == [
        d.designation_q for d in sorted(sklad.devices, key=lambda d: d.position)
    ]
    # Szablon w całości = każdy wymagany aparat zaprojektowany (jako propozycja ESTIMATED).
    assert wymagania["liczba_brakujacych"] == 0
    assert {p["stan"] for p in wymagania["pozycje"]} == {"ZAPROJEKTOWANY"}


def test_brakujace_aparaty_pola_liniowego_sn(siec: Any) -> None:
    """Pole liniowe SN wymaga Q1, Q0, T1, Q2, Q9, GK. Zaprojektowano wyłącznik i odłącznik
    szynowy — reszta jest BRAKUJĄCA i nazwana w wyjaśnieniu z oznaczeniem."""
    enm, pola = siec
    z_szablonem = _ok(
        _op(
            enm,
            "set_bay_equipment",
            {"bay_ref": pola["SN"], "mode": "szablon", "bay_template_ref": "bay_template_line_in"},
        )
    )
    wynik = _wyposaz(
        z_szablonem,
        pola["SN"],
        [
            {
                "kind": "DS",
                "placement": "UPSTREAM",
                "catalog_ref": _pozycja("DS", "zgodna"),
                "designation": "Q1",
            },
            {
                "kind": "CB",
                "placement": "MIDSTREAM",
                "catalog_ref": _pozycja("CB", "zgodna"),
                "designation": "Q0",
            },
        ],
    )
    assert wynik.get("error") is None, wynik.get("error")
    wymagania = wynik["wyposazenie_pola"]["wymagania_standardu"]
    stany = {p["designation"]: p["stan"] for p in wymagania["pozycje"]}
    assert {d for d, s in stany.items() if s == "ZAPROJEKTOWANY"} == {"Q1", "Q0"}
    assert wymagania["liczba_zaprojektowanych"] == 2
    assert wymagania["liczba_brakujacych"] == len(stany) - 2
    for brak in (d for d, s in stany.items() if s == "BRAKUJACY"):
        assert brak in wymagania["wyjasnienie_pl"]
    flagi = [a["wymagany_standardem"] for a in wynik["wyposazenie_pola"]["aparaty"]]
    assert flagi == [True, True]


def test_bez_szablonu_brak_wymagan(siec: Any) -> None:
    enm, pola = siec
    wynik = _wyposaz(
        enm,
        pola["SN"],
        [{"kind": "CB", "placement": "MIDSTREAM", "catalog_ref": _pozycja("CB", "zgodna")}],
    )
    wymagania = wynik["wyposazenie_pola"]["wymagania_standardu"]
    assert wymagania["liczba_wymaganych"] == 0
    assert wymagania["pozycje"] == []


# ---------------------------------------------------------------------------
# Łańcuch aparatury szablonów SN (ENEA Zeszyt 1 §13, §16, §17, §19, zał. Z.2)
# ---------------------------------------------------------------------------


def _rodzaje(szablon: str) -> list[str]:
    devices = sorted(BAY_TEMPLATE_REGISTRY[szablon].devices, key=lambda d: d.position)
    return [d.kind for d in devices]


@pytest.mark.parametrize(
    ("szablon", "pierwsze", "ostatnie"),
    [
        ("bay_template_transformer", ["DS_BUS", "CB"], ["CABLE_HEAD", "TRANSFORMER_DEVICE"]),
        ("bay_template_coupler", ["DS_BUS", "CB", "CT"], []),
        (
            "bay_template_earthing",
            ["DS_BUS", "CB", "CT", "ES", "CABLE_HEAD"],
            ["CABLE_HEAD", "SURGE_ARRESTER"],
        ),
        (
            "bay_template_capacitor",
            ["DS_BUS", "CB", "CT", "ES", "CABLE_HEAD"],
            ["SURGE_ARRESTER", "VT"],
        ),
    ],
)
def test_lancuch_aparatury_szablonu_sn(
    szablon: str, pierwsze: list[str], ostatnie: list[str]
) -> None:
    """Kolejność elektryczna od szyny (ENEA Zeszyt 1 zał. Z.2): odłącznik szynowy →
    wyłącznik → przekładnik prądowy → … → głowica kablowa przedziału przyłączeniowego →
    urządzenie stanowiska. Pole sprzęgła niesie przekładnik prądowy zaraz za wyłącznikiem,
    pole transformatorowe — głowicę mostu kablowego przed transformatorem, pola ZU i BKR —
    ograniczniki stanowiska (§19), pole BKR — przekładnik napięciowy rozładowczy (§17).
    Pole ZU nie niesie transformatora uziemiającego: zespół jest uziemieniem punktu
    neutralnego źródła (jeden nośnik — ``GroundingConfig``), nie aparatem pola."""
    rodzaje = _rodzaje(szablon)
    if szablon == "bay_template_earthing":
        assert "TRANSFORMER_DEVICE" not in rodzaje
    assert rodzaje[: len(pierwsze)] == pierwsze
    if ostatnie:
        assert rodzaje[-len(ostatnie) :] == ostatnie
    sklad = BAY_TEMPLATE_REGISTRY[szablon]
    assert sklad.podstawa_pl is not None and "Z.2" in sklad.podstawa_pl


def test_pozycje_szablonow_sa_ciagle_i_unikalne() -> None:
    for szablon in sorted(BAY_TEMPLATE_REGISTRY):
        pozycje = [d.position for d in BAY_TEMPLATE_REGISTRY[szablon].devices]
        assert sorted(pozycje) == list(range(len(pozycje))), szablon


def test_wymagane_funkcje_zabezpieczen_maja_przekladnik_pradowy() -> None:
    """Klasa defektu „rola deklaruje zabezpieczenia, szablon nie ma czym mierzyć prądu”:
    każdy szablon, którego rola wymaga funkcji zabezpieczeniowych, ma przekładnik prądowy —
    poza szablonami nazwanymi tu jawnie z przyczyną (wynik pomiaru, nie domysł)."""
    bez_ct = sorted(
        szablon.template_id
        for szablon in BAY_TEMPLATE_REGISTRY.values()
        if protection_codes_for_bay_role(szablon.bay_role)
        and "CT" not in {d.kind for d in szablon.devices}
    )
    assert bez_ct == BEZ_PRZEKLADNIKA_PRADOWEGO


#: Szablony bez przekładnika prądowego mimo funkcji zabezpieczeń roli (pomiar 2026-10-22).
#: Oba niosą rolę zastępczą FEEDER, bo kanon ról nie ma roli pola rezerwowego ani potrzeb
#: własnych: pole rezerwowe nie ma łącznika wyłączającego (odłącznik + uziemnik — nie ma czego
#: zabezpieczać), pole potrzeb własnych chroni bezpiecznik SN (F1), który sam jest funkcją
#: nadprądową. Każdy inny szablon bez przekładnika prądowego jest defektem.
BEZ_PRZEKLADNIKA_PRADOWEGO: list[str] = ["bay_template_aux", "bay_template_reserve"]


# ---------------------------------------------------------------------------
# Jedna prawda typu łącznika: gałąź ↔ projekcja ↔ odczyt pola
# ---------------------------------------------------------------------------


def _odczyt(migawka: dict[str, Any], pole_ref: str) -> dict[str, Any]:
    odczyt = build_field_read_model("pola", EnergyNetworkModel.model_validate(migawka))
    (pole_odczytu,) = (f for f in odczyt["fields"] if f["bay_ref"] == pole_ref)
    return pole_odczytu["canonical_model"]["base_model"]


@pytest.mark.parametrize("szyna", ["SN", "WN"])
def test_typ_lacznika_z_galezi_a_nie_z_rekordu_pola(siec: Any, szyna: str) -> None:
    enm, pola = siec
    pole_ref = pola[szyna]
    lacznik = _lacznik_pola(enm, pole_ref)
    typ_galezi = _galaz(enm, lacznik)["catalog_ref"]
    po = _ok(
        _wyposaz(enm, pole_ref, [{"kind": "CB", "placement": "MIDSTREAM", "linked_ref": lacznik}])
    )
    (zapisany,) = _pole(po, pole_ref)["primary_devices"]
    assert zapisany.get("catalog_ref") is None, "rekord pola skopiował typ gałęzi"
    (urzadzenie,) = _odczyt(po, pole_ref)["equipment_devices"]
    assert urzadzenie["catalog_ref"] == typ_galezi and urzadzenie["typ_z_galezi"] is True

    # Zmiana typu gałęzi — projekcja pola idzie za gałęzią. Na szynie 110 kV katalog ma
    # jeden typ na rodzaj, więc zmiana na odłącznik 110 kV (ta sama przestrzeń APARAT_SN).
    katalog = katalog_biezacy().mv_apparatus_types
    u_r = katalog[typ_galezi].u_n_kv
    inny = next(
        r
        for r, t in sorted(katalog.items())
        if t.u_n_kv == u_r and r != typ_galezi and t.device_kind in ("WYLACZNIK", "ODLACZNIK")
    )
    po_zmianie = _ok(
        _op(
            po,
            "assign_catalog_to_element",
            {"element_ref": lacznik, "catalog_item_id": inny, "catalog_namespace": "APARAT_SN"},
        )
    )
    (urzadzenie,) = _odczyt(po_zmianie, pole_ref)["equipment_devices"]
    assert urzadzenie["catalog_ref"] == inny


def test_catalog_ref_w_ladunku_przypisuje_galaz(siec: Any) -> None:
    enm, pola = siec
    pole_ref = pola["SN"]
    lacznik = _lacznik_pola(enm, pole_ref)
    typ_galezi = _galaz(enm, lacznik)["catalog_ref"]
    nowy = next(
        r
        for r, t in sorted(katalog_biezacy().mv_apparatus_types.items())
        if t.device_kind == "WYLACZNIK" and t.u_n_kv == 24.0 and r != typ_galezi
    )
    wynik = _wyposaz(
        enm,
        pole_ref,
        [{"kind": "CB", "placement": "MIDSTREAM", "linked_ref": lacznik, "catalog_ref": nowy}],
    )
    assert wynik.get("error") is None, wynik.get("error")
    po = wynik["snapshot"]
    assert _galaz(po, lacznik)["catalog_ref"] == nowy
    (zapisany,) = _pole(po, pole_ref)["primary_devices"]
    assert zapisany.get("catalog_ref") is None
    assert wynik["wyposazenie_pola"]["aparaty"][0]["catalog_ref"] == nowy


@pytest.mark.parametrize("szyna", ["SN", "WN"])
def test_catalog_ref_za_niskiej_klasy_dla_lacznika_jest_odmowa_atomowa(
    siec: Any, szyna: str
) -> None:
    """Gałąź łącznika nie dostaje typu o U_r < U_m sieci — ani w polu SN (12 kV w sieci
    15 kV), ani na granicy zasilania 110 kV (aparat SN zamiast typu 110 kV)."""
    enm, pola = siec
    lacznik = _lacznik_pola(enm, pola[szyna])
    pozycja = _pozycja("CB", "za_niska") if szyna == "SN" else _pozycja("CB", "zgodna")
    _odmowa(
        enm,
        {
            "bay_ref": pola[szyna],
            "mode": "katalog",
            "devices": [
                {
                    "kind": "CB",
                    "placement": "MIDSTREAM",
                    "linked_ref": lacznik,
                    "catalog_ref": pozycja,
                }
            ],
        },
        "bay_equipment.voltage_rating_too_low",
    )


def test_aparat_pola_bez_galezi_w_wytrzymalosci_a_nie_w_czasie_wylaczenia(siec: Any) -> None:
    """Uziemnik zapisany w rekordzie pola (bez gałęzi) jest aparatem pola dla weryfikacji
    wytrzymałości; czas wyłączenia czyta wyłącznie gałęzie (łącznik wyłącza zwarcie,
    uziemnik nie). Przynależność do pola — z ``Bay.equipment_refs``."""
    from application.analyses.aparaty_pol import aparaty_pol_stacji

    enm, pola = siec
    lacznik = _lacznik_pola(enm, pola["SN"])
    uziemnik = _pozycja("ES", "zgodna")
    po = _ok(
        _wyposaz(
            enm,
            pola["SN"],
            [
                {"kind": "CB", "placement": "MIDSTREAM", "linked_ref": lacznik},
                {"kind": "ES", "placement": "GROUND_BRANCH", "catalog_ref": uziemnik},
            ],
        )
    )
    model = EnergyNetworkModel.model_validate(po)
    stacja = next(s for s in model.substations if s.ref_id == po["substations"][0]["ref_id"])
    wszystkie = aparaty_pol_stacji(model, stacja)[pola["SN"]]
    assert [(a.catalog_ref, a.galaz) for a in wszystkie] == [
        (_galaz(po, lacznik)["catalog_ref"], True),
        (uziemnik, False),
    ]
    galezie = aparaty_pol_stacji(model, stacja, wylacznie_galezie=True)[pola["SN"]]
    assert [a.aparat_ref for a in galezie] == [lacznik]


# ---------------------------------------------------------------------------
# Kontrola modelu (walidator) — aparat wstawiony inną operacją niż set_bay_equipment
# ---------------------------------------------------------------------------


def _zgloszenia(enm: dict[str, Any], kod: str) -> list[Any]:
    wynik = ENMValidator().validate(EnergyNetworkModel.model_validate(enm))
    return [i for i in wynik.issues if i.code == kod]


def test_walidator_lacznik_za_niskiej_klasy_w_polu_sn_dodanym_add_sn_bay() -> None:
    enm = _gpz()
    enm, _ = _dodaj_pole(enm, _szyna(enm, NAPIECIE_SN_KV), _pozycja("CB", "zgodna"))
    assert not _zgloszenia(enm, "apparatus.voltage_rating_too_low")
    za_niski = _pozycja("CB", "za_niska")
    enm, pole_zle = _dodaj_pole(enm, _szyna(enm, NAPIECIE_SN_KV), za_niski)
    lacznik = _lacznik_pola(enm, pole_zle)
    (zgl,) = _zgloszenia(enm, "apparatus.voltage_rating_too_low")
    assert zgl.element_refs == [lacznik]
    (wpis,) = aparaty_za_niskiego_napiecia(enm)
    u_r = napiecie_znamionowe_pozycji_kv("APARAT_SN", za_niski)
    assert u_r is not None
    assert wpis["kontrola_napiecia"]["u_r_kv"] == u_r
    assert wpis["kontrola_napiecia"]["u_m_sieci_kv"] == U_M_SN_KV
    assert wpis["kontrola_napiecia"]["margines_kv"] == pytest.approx(u_r - U_M_SN_KV)
    # Komunikat nazywa element i pozycję słowami, nie identyfikatorem.
    assert lacznik not in zgl.message_pl and za_niski not in zgl.message_pl
    assert _kv(U_M_SN_KV) in zgl.message_pl
    # Ostrzeżenie nie blokuje obliczeń (Zasada nr 4: dobór aparatu nie zatrzymuje zwarć).
    assert zgl.severity != "BLOCKER"


def test_walidator_ogranicznik_za_niskiej_klasy_w_polu_sn(siec: Any) -> None:
    enm, pola = siec

    def z_ogranicznikiem(pozycja: str) -> dict[str, Any]:
        return _ok(
            _op(
                enm,
                "add_surge_arrester_sn",
                {
                    "station_ref": enm["substations"][0]["ref_id"],
                    "field_ref": pola["SN"],
                    "catalog_binding": {
                        "catalog_namespace": "OGRANICZNIK_SN",
                        "catalog_item_id": pozycja,
                        "catalog_item_version": "2024.1",
                        "materialize": True,
                    },
                },
            )
        )

    dobry = z_ogranicznikiem(_pozycja("SURGE_ARRESTER", "zgodna"))
    assert aparaty_za_niskiego_napiecia(dobry) == []
    zly = z_ogranicznikiem(_pozycja("SURGE_ARRESTER", "za_niska"))
    (wpis,) = aparaty_za_niskiego_napiecia(zly)
    assert wpis["rodzaj"] == "SURGE_ARRESTER"
    assert [z.element_refs for z in _zgloszenia(zly, "apparatus.voltage_rating_too_low")] == [
        [wpis["element_ref"]]
    ]


def test_lacznik_110kv_bez_typu_nie_jest_przyjety_po_cichu(siec: Any) -> None:
    """Łącznik topologii zasilania 110 kV musi mieć typ katalogowy (reguła wiązania). Pole
    bez wskazanego aparatu jest kanoniczne (``add_sn_bay`` przyjmuje je jak pole SN —
    projektant dobiera aparat później), ale łącznik 110 kV bez typu NIE jest przyjęty po
    cichu: walidator zgłasza ``apparatus.hv_switch_catalog_missing`` z akcją wyboru z
    katalogu — dla obu dróg wstawienia: operacji domenowej i modelu zewnętrznego (gałąź
    z importu bez ``catalog_ref``). Łącznik SN bez typu nie należy do tej reguły."""
    enm, pola = siec
    assert laczniki_wn_bez_typu(enm) == []
    assert not _zgloszenia(enm, "apparatus.hv_switch_catalog_missing")

    przed = {b["ref_id"] for b in enm["bays"]}
    z_operacji = _ok(
        _op(
            enm,
            "add_sn_bay",
            {
                "bus_ref": _szyna(enm, 110.0),
                "station_ref": enm["substations"][0]["ref_id"],
                "bay_role": "IN",
            },
        )
    )
    (nowe_pole,) = (b["ref_id"] for b in z_operacji["bays"] if b["ref_id"] not in przed)
    (lacznik_nowy,) = (
        r
        for r in _pole(z_operacji, nowe_pole)["equipment_refs"]
        if any(g["ref_id"] == r for g in z_operacji["branches"])
    )
    assert _galaz(z_operacji, lacznik_nowy).get("catalog_ref") is None
    assert [w["element_ref"] for w in laczniki_wn_bez_typu(z_operacji)] == [lacznik_nowy]
    assert [
        z.element_refs for z in _zgloszenia(z_operacji, "apparatus.hv_switch_catalog_missing")
    ] == [[lacznik_nowy]]

    zewnetrzny = copy.deepcopy(enm)
    lacznik_wn = _lacznik_pola(zewnetrzny, pola["WN"])
    lacznik_sn = _lacznik_pola(zewnetrzny, pola["SN"])
    for ref in (lacznik_wn, lacznik_sn):
        _galaz(zewnetrzny, ref)["catalog_ref"] = None
    (wpis,) = laczniki_wn_bez_typu(zewnetrzny)
    assert wpis["element_ref"] == lacznik_wn and wpis["napiecie_kv"] == 110.0
    (zgl,) = _zgloszenia(zewnetrzny, "apparatus.hv_switch_catalog_missing")
    assert zgl.element_refs == [lacznik_wn]
    assert "110 kV" in zgl.message_pl and lacznik_wn not in zgl.message_pl
    assert zgl.severity != "BLOCKER"
    assert zgl.fix_action is not None and zgl.fix_action.action_type == "SELECT_CATALOG"


# ---------------------------------------------------------------------------
# Typy minimalne łączników 110 kV (granica zasilania GPZ)
# ---------------------------------------------------------------------------


def test_katalog_110kv_to_wylacznie_typy_minimalne_lacznikow() -> None:
    """Decyzja właściciela 2026-10-22: żadnych przekładników, ograniczników, uziemników ani
    odłączników z uziemnikiem 110 kV — jeden wyłącznik i jeden odłącznik."""
    katalog = katalog_biezacy()
    aparaty = {r: t for r, t in katalog.mv_apparatus_types.items() if t.u_n_kv > 40.5}
    rekordy = sorted(r for r, t in katalog.switch_equipment_types.items() if t.un_kv > 40.5)
    ograniczniki = [r for r, t in katalog.surge_arrester_types.items() if (t.u_m_kv or 0) > 40.5]
    assert {r: t.device_kind for r, t in aparaty.items()} == {
        WYLACZNIK_110KV: "WYLACZNIK",
        ODLACZNIK_110KV: "ODLACZNIK",
    }
    assert rekordy == [WYLACZNIK_110KV, ODLACZNIK_110KV]
    assert ograniczniki == []
    # Przekładnik napięciowy 110 kV — napięcie pierwotne powyżej pasma SN (fazowe 110/√3 kV).
    assert not [r for r, t in katalog.vt_types.items() if t.ratio_primary_v > 40500.0]
    # Typy przekładników prądowych nie niosą napięcia izolacji; rodzina 110 kV nie istnieje.
    assert not [r for r in katalog.ct_types if r.startswith("ct_110kv")]


@pytest.mark.parametrize("ref", [WYLACZNIK_110KV, ODLACZNIK_110KV])
def test_typ_minimalny_lacznika_110kv_estimated_bez_wytrzymalosci(ref: str) -> None:
    katalog = katalog_biezacy()
    rekord = katalog.switch_equipment_types[ref]
    aparat = katalog.mv_apparatus_types[ref]
    assert rekord.u_m_kv == 123.0 and rekord.un_kv == 123.0 and aparat.u_n_kv == 123.0
    assert rekord.manufacturer is None
    # Bez danych wytrzymałościowych: projekcja nie niesie I_th.
    assert rekord.icw_ka == 0.0 and rekord.i_cu_ka is None
    assert aparat.i_th_ka is None
    assert rekord.verification_status == "REFERENCYJNY"
    # Każde pole danych ESTIMATED z podstawą i jawnym założeniem; projekcja niesie jakość.
    for status in (rekord.card_field_status, aparat.card_field_status):
        assert status
        for wpis in status.values():
            assert wpis["quality"] == "ESTIMATED"
            assert wpis["source_ref"] and wpis["note"]


# ---------------------------------------------------------------------------
# Determinizm
# ---------------------------------------------------------------------------


def test_determinizm_odpowiedzi_i_migawki(siec: Any) -> None:
    enm, pola = siec
    ladunek = {
        "bay_ref": pola["SN"],
        "mode": "szablon",
        "bay_template_ref": "bay_template_line_in",
    }
    a = _op(copy.deepcopy(enm), "set_bay_equipment", ladunek)
    b = _op(copy.deepcopy(enm), "set_bay_equipment", ladunek)
    assert a["snapshot"] == b["snapshot"]
    assert a["wyposazenie_pola"] == b["wyposazenie_pola"]
    pierwszy, drugi = _gpz(), _gpz()
    pierwszy.pop("header"), drugi.pop("header")
    assert pierwszy == drugi
