"""Pole liniowe SN rozdzielni GPZ wg ENEA Zeszyt 1 — dziewięć szablonów (Z.10 s.89, Z.11.1 s.91,
Z.11 s.90 × wykonanie łączników §13: łącznik trójpołożeniowy, wyłącznik stały z odłącznikiem
szynowym, wyłącznik wysuwny). Karta UX-04/POLE-LINIOWE-WZORZEC z rozszerzeniami 1–4.

Przypina:
* sekwencję każdego szablonu do TABELI odczytu rysunków (`docs/uiux/GPZ_SN_ENEA_ODCZYT_
  RYSUNKOW_2026-10-28.md`) zapisanej w teście z części składowych rysunku, z iniekcjami:
  zamiana przekładnika i wyłącznika, odgałęzienie przekładnika napięciowego przeniesione na
  stronę szyny;
* porty (jedna reguła `porty_toru_pola`, odgałęzienie `pn1`/`pn2` z `odgalezienie`), zbiór
  aparatów poza torem głównym i pary blokad uziemnik ↔ łącznik (`laczniki_drogi_uziemnika`);
* rdzenie CT = pozycja katalogu, uzwojenia VT (trzy, trzecie w otwartym trójkącie);
* zestaw EAZ szablonu wg klasy i słownik funkcji;
* materializację: GPZ (każda sekcja) z rodziną {brak, powietrzna, stało-powietrzna, gazowa bez
  F}, `add_sn_bay`, przydział pola przy odgałęzieniu, `set_bay_equipment` szablonu i katalogu
  (odgałęzienie zachowane przy ponownym zapisie), odmowy W050–W052 w operacji i walidatorze;
* wartości robocze w `dane_przyjete` (ESTIMATED), niezmienność wejścia solverów, determinizm,
  odcisk modelu, odczyt pola i topologię zasilenia.

Iloczyn cech materializacji: szablon (9) × sekcja {1, 2} × droga budowy {GPZ / `add_sn_bay` /
`set_bay_equipment` szablon / katalog}.
"""

from __future__ import annotations

import copy
import itertools
from typing import Any

import pytest
from application.field_read_model import build_field_read_model
from application.topologia_zasilenia import _nieustalone_laczniki
from enm.hash import hash_migawki_enm
from enm.interlock_rules import (
    MAIN_SWITCH_KINDS,
    blokady_zamkniecia,
    is_closed,
    is_open,
)
from enm.mapping import map_enm_to_network_graph
from enm.models import BayPrimaryDevice, EnergyNetworkModel, ENMDefaults, ENMHeader
from enm.validator import ENMValidator
from network_model.catalog.bay_templates import (
    BAY_TEMPLATE_REGISTRY,
    BAY_TEMPLATES_GPZ_LINE,
    WARUNEK_ZRODLA_U0,
    WARUNKI_FUNKCJI_EAZ,
    BayTemplate,
    funkcje_eaz_szablonu,
    szablon_domyslny_pola_liniowego_gpz,
    template_primary_devices,
)
from network_model.catalog.funkcje_eaz import opis_funkcji_eaz_pl
from network_model.catalog.repository import get_default_mv_catalog
from network_model.catalog.rodzaje_aparatury import (
    PORTY_APARATU_POLA,
    RODZAJE_LACZNIKOW_POLA,
    RODZAJE_LACZNIKOW_TORU,
    STANY_OTWARTE_W_TORZE,
    aparaty_poza_torem_glownym,
    laczniki_drogi_uziemnika,
    porty_toru_pola,
)
from pydantic import ValidationError

from tests.reference_networks.sceny_zajetosci_pol import APARAT, KABEL, ZRODLO, ok, op

WYKONANIA_POLA = ("Z10", "Z11_1", "Z11")
WYKONANIA_LACZNIKOW = ("TROJPOLOZENIOWY", "STALY_Z_ODLACZNIKIEM", "WYSUWNY")
RYSUNEK = {"Z10": "Z.10 (s.89)", "Z11_1": "Z.11.1 (s.91)", "Z11": "Z.11 (s.90)"}
SUFIKS = {"Z10": "z10", "Z11_1": "z11_1", "Z11": "z11"}
SUFIKS_LACZNIKOW = {
    "TROJPOLOZENIOWY": "trojpolozeniowy",
    "STALY_Z_ODLACZNIKIEM": "staly_z_odlacznikiem",
    "WYSUWNY": "wysuwny",
}
CT_RYSUNKU = {
    "Z10": "ct_typ_ogolny_osd_200_400_5_5p20_15va",
    "Z11_1": "ct_typ_ogolny_osd_200_400_5_5p20_15va",
    "Z11": "ct_typ_ogolny_osd_200_400_5_5_5_z11",
}


def _id(pole: str, laczniki: str) -> str:
    return f"bay_template_gpz_line_enea_{SUFIKS[pole]}_{SUFIKS_LACZNIKOW[laczniki]}"


KOMBINACJE = list(itertools.product(WYKONANIA_POLA, WYKONANIA_LACZNIKOW))

# ---------------------------------------------------------------------------
# Wyrocznia: tabela odczytu rysunku złożona z części rysunku (NIEZALEŻNA od szablonu).
# Wiersz: (rodzaj, umiejscowienie, oznaczenie, fragment podstawy, odgałęzienie)
# ---------------------------------------------------------------------------


def tabela_odczytu(
    pole: str, laczniki: str
) -> list[tuple[str, str, str, str, str | None]]:
    rys = RYSUNEK[pole]
    wiersze: list[tuple[str, str, str, str, str | None]] = []
    if pole != "Z10":  # Z.11/Z.11.1: wskaźnik napięcia przy szynie
        wiersze.append(("VOLTAGE_INDICATOR", "OFF_PATH", "PF0", rys, None))
    if laczniki == "TROJPOLOZENIOWY":  # §13: łącznik trójpołożeniowy od szyny
        wiersze.append(("THREE_POSITION_SWITCH", "UPSTREAM", "Q1", "§13", None))
    elif (
        laczniki == "STALY_Z_ODLACZNIKIEM"
    ):  # §13: odłącznik szynowy przed wyłącznikiem stałym
        wiersze.append(("DS_BUS", "UPSTREAM", "Q1", "§13", None))
    wiersze.append(("CB", "MIDSTREAM", "Q0", "§13", None))  # wyłącznik próżniowy
    if pole != "Z10":  # odgałęzienie przekładnika napięciowego za wyłącznikiem
        if laczniki == "TROJPOLOZENIOWY":
            wiersze.append(("THREE_POSITION_SWITCH", "OFF_PATH", "Q5", rys, "pn"))
        else:
            wiersze.append(("DS_BRANCH", "OFF_PATH", "Q5", rys, "pn"))
            wiersze.append(("ES", "GROUND_BRANCH", "Q51", rys, "pn"))
        wiersze.append(("CABLE_HEAD", "OFF_PATH", "GK1", rys, "pn"))
        wiersze.append(("VT", "OFF_PATH", "T3", rys, "pn"))
    wiersze.append(("CT", "MIDSTREAM", "T1", rys, None))
    wiersze.append(("VOLTAGE_INDICATOR", "OFF_PATH", "PF1", "§13", None))
    if laczniki != "TROJPOLOZENIOWY":  # §13: uziemnik stały wyprowadzenia
        wiersze.append(("ES", "GROUND_BRANCH", "Q8", "§13", None))
    wiersze.append(("CABLE_HEAD", "DOWNSTREAM", "GK", rys, None))
    wiersze.append(("CORE_BALANCE_CT", "DOWNSTREAM", "T2", rys, None))
    return wiersze


def porty_oczekiwane(pole: str, laczniki: str) -> list[tuple[str, dict[str, str]]]:
    """Porty z tabeli: tor szyna → w1 → … → kabel; odgałęzienie od wyjścia wyłącznika
    (`pn1` za łącznikiem odgałęzienia, `pn2` za głowicą przekładnika)."""
    wynik: list[tuple[str, dict[str, str]]] = []
    if pole != "Z10":
        wynik.append(("VOLTAGE_INDICATOR", {"przylacze": "szyna"}))
    wezly = iter(["w1", "w2", "w3"])
    biezacy = "szyna"
    if laczniki != "WYSUWNY":
        nastepny = next(wezly)
        rodzaj = "THREE_POSITION_SWITCH" if laczniki == "TROJPOLOZENIOWY" else "DS"
        wynik.append((rodzaj, {"we": biezacy, "wy": nastepny}))
        biezacy = nastepny
    za_wylacznikiem = next(wezly)
    wynik.append(("CB", {"we": biezacy, "wy": za_wylacznikiem}))
    if pole != "Z10":
        rodzaj = "THREE_POSITION_SWITCH" if laczniki == "TROJPOLOZENIOWY" else "DS"
        wynik.append((rodzaj, {"we": za_wylacznikiem, "wy": "pn1"}))
        if laczniki != "TROJPOLOZENIOWY":
            wynik.append(("ES", {"przylacze": "pn1"}))
        wynik.append(("CABLE_HEAD", {"we": "pn1", "wy": "pn2"}))
        wynik.append(("VT", {"przylacze": "pn2"}))
    za_przekladnikiem = next(wezly)
    wynik.append(("CT", {"we": za_wylacznikiem, "wy": za_przekladnikiem}))
    wynik.append(("VOLTAGE_INDICATOR", {"przylacze": za_przekladnikiem}))
    if laczniki != "TROJPOLOZENIOWY":
        wynik.append(("ES", {"przylacze": za_przekladnikiem}))
    wynik.append(("CABLE_HEAD", {"we": za_przekladnikiem, "wy": "kabel"}))
    wynik.append(("CORE_BALANCE_CT", {"obwod": "kabel"}))
    return wynik


def rozbieznosci_z_tabela(
    szablon: BayTemplate, tabela: list[tuple[str, str, str, str, str | None]]
) -> list[str]:
    wynik: list[str] = []
    urzadzenia = sorted(szablon.devices, key=lambda d: d.position)
    if len(urzadzenia) != len(tabela):
        wynik.append(f"liczba pozycji {len(urzadzenia)} ≠ {len(tabela)}")
    for i, (urz, (rodzaj, umiejscowienie, oznaczenie, podstawa, odg)) in enumerate(
        zip(urzadzenia, tabela, strict=False)
    ):
        faktyczne = (urz.kind, urz.placement, urz.designation_q, urz.odgalezienie)
        if faktyczne != (rodzaj, umiejscowienie, oznaczenie, odg):
            wynik.append(
                f"poz. {i}: {faktyczne} ≠ {(rodzaj, umiejscowienie, oznaczenie, odg)}"
            )
        if (
            not urz.podstawa
            or podstawa not in urz.podstawa
            or "ENEA Zeszyt 1" not in urz.podstawa
        ):
            wynik.append(f"poz. {i}: podstawa {urz.podstawa!r} bez „{podstawa}”")
    return wynik


def porty(aparat: dict[str, Any]) -> dict[str, str | None]:
    return {p["port_id"]: p["wezel"] for p in aparat.get("ports", [])}


def _krotki(
    aparaty: list[dict[str, Any]]
) -> list[tuple[str, str, dict[str, str | None]]]:
    return [(a["designation"], a["kind"], porty(a)) for a in aparaty]


# ---------------------------------------------------------------------------
# Szablon ↔ rysunek
# ---------------------------------------------------------------------------


def test_rejestr_ma_dokladnie_dziewiec_szablonow_pola_liniowego_gpz():
    assert sorted(t.template_id for t in BAY_TEMPLATES_GPZ_LINE) == sorted(
        _id(p, lacz) for p, lacz in KOMBINACJE
    )


@pytest.mark.parametrize("pole,laczniki", KOMBINACJE)
def test_szablon_zgodny_z_tabela_odczytu(pole: str, laczniki: str):
    szablon = BAY_TEMPLATE_REGISTRY[_id(pole, laczniki)]
    assert rozbieznosci_z_tabela(szablon, tabela_odczytu(pole, laczniki)) == []
    assert (szablon.wykonanie_pola, szablon.wykonanie_lacznikow) == (pole, laczniki)
    assert szablon.podstawa and f"ENEA Zeszyt 1, {RYSUNEK[pole]}" in szablon.podstawa
    assert "§13" in szablon.podstawa
    assert szablon.render_variant == "qet_en60617"
    assert szablon.bay_role == "OUT" and szablon.tylko_gpz is True
    # Z.10–Z.11: brak odłącznika liniowego (DS_LINE).
    assert "DS_LINE" not in [d.kind for d in szablon.devices]


def test_iniekcja_zamiana_przekladnika_i_wylacznika_czerwieni_tabele():
    zamieniony = copy.deepcopy(
        BAY_TEMPLATE_REGISTRY[_id("Z11", "STALY_Z_ODLACZNIKIEM")]
    )
    cb = next(d for d in zamieniony.devices if d.kind == "CB")
    ct = next(d for d in zamieniony.devices if d.kind == "CT")
    cb.position, ct.position = ct.position, cb.position
    assert rozbieznosci_z_tabela(
        zamieniony, tabela_odczytu("Z11", "STALY_Z_ODLACZNIKIEM")
    )


def test_iniekcja_odgalezienie_vt_po_stronie_szyny_czerwieni_tabele_i_porty():
    """Z.11.1 s.91: przekładnik napięciowy linii leży ZA wyłącznikiem. Odgałęzienie przeniesione
    przed wyłącznik (strona szyny) musi być wykryte — przez tabelę i przez porty."""
    szablon = copy.deepcopy(BAY_TEMPLATE_REGISTRY[_id("Z11_1", "TROJPOLOZENIOWY")])
    urz = sorted(szablon.devices, key=lambda d: d.position)
    cb = next(d for d in urz if d.kind == "CB")
    for d in urz:
        if d.odgalezienie and d.position > cb.position:
            d.position -= 10
    szablon.devices = sorted(urz, key=lambda d: d.position)
    assert rozbieznosci_z_tabela(szablon, tabela_odczytu("Z11_1", "TROJPOLOZENIOWY"))
    aparaty = porty_toru_pola(
        [
            {
                "device_ref": f"d{i}",
                "designation": d.designation_q,
                "kind": "DS" if d.kind in {"DS_BUS", "DS_BRANCH"} else d.kind,
                "placement": d.placement,
                **({"odgalezienie": d.odgalezienie} if d.odgalezienie else {}),
            }
            for i, d in enumerate(szablon.devices)
        ]
    )
    vt = next(a for a in aparaty if a["kind"] == "VT")
    q5 = next(a for a in aparaty if a["designation"] == "Q5")
    assert (
        porty(q5)["we"] != "w2"
    ), "odgałęzienie przed wyłącznikiem nie wychodzi z jego wyjścia"
    assert porty(vt) == {"przylacze": "pn2"}


@pytest.mark.parametrize("pole,laczniki", KOMBINACJE)
def test_porty_aparatow_szablonu_z_sekwencji(pole: str, laczniki: str):
    aparaty = template_primary_devices(_id(pole, laczniki), field_ref="pole-x")
    assert [(a["kind"], porty(a)) for a in aparaty] == porty_oczekiwane(pole, laczniki)
    for aparat in aparaty:
        assert aparat["render_variant"] == "qet_en60617"
        assert set(porty(aparat)) == set(PORTY_APARATU_POLA[aparat["kind"]])
        BayPrimaryDevice.model_validate(aparat)
    # Aparaty poza torem głównym = odgałęzienie przekładnika napięciowego (jedna reguła).
    odgalezienie = {"Q5", "GK1", "T3"} | (
        {"Q51"} if laczniki != "TROJPOLOZENIOWY" else set()
    )
    oczekiwane = odgalezienie if pole != "Z10" else set()
    assert aparaty_poza_torem_glownym(_krotki(aparaty)) == oczekiwane
    assert {a["designation"] for a in aparaty if a.get("odgalezienie")} == oczekiwane


@pytest.mark.parametrize("pole,laczniki", KOMBINACJE)
def test_pary_blokad_uziemnikow_z_portow(pole: str, laczniki: str):
    """Uziemnik wiąże łączniki od swojego węzła w stronę szyny do pierwszego odłączającego:
    Q8 — wyłącznik i odłącznik szynowy (bez łącznika odgałęzienia), Q51 — tylko Q5."""
    aparaty = template_primary_devices(_id(pole, laczniki), field_ref="pole-x")
    drogi = laczniki_drogi_uziemnika(_krotki(aparaty))
    oczekiwane: dict[str, frozenset[str]] = {}
    if laczniki == "STALY_Z_ODLACZNIKIEM":
        oczekiwane["Q8"] = frozenset({"Q0", "Q1"})
    elif laczniki == "WYSUWNY":
        oczekiwane["Q8"] = frozenset({"Q0"})
    if pole != "Z10" and laczniki != "TROJPOLOZENIOWY":
        oczekiwane["Q51"] = frozenset({"Q5"})
    assert drogi == oczekiwane


def test_porty_toru_deterministyczne_idempotentne_i_nie_nadpisuja_jawnych():
    aparaty = template_primary_devices(
        _id("Z11", "STALY_Z_ODLACZNIKIEM"), field_ref="pole-x"
    )
    bez_portow = [{k: v for k, v in a.items() if k != "ports"} for a in aparaty]
    assert porty_toru_pola(bez_portow) == aparaty
    assert porty_toru_pola(aparaty) == aparaty
    assert all("ports" not in a for a in bez_portow), "wejście nietknięte"
    jawne = copy.deepcopy(aparaty)
    jawne[2]["ports"] = [
        {"port_id": "we", "wezel": "x"},
        {"port_id": "wy", "wezel": "y"},
    ]
    assert porty_toru_pola(jawne) == jawne


@pytest.mark.parametrize("w_odgalezieniu", [False, True])
@pytest.mark.parametrize("rodzaj", sorted(PORTY_APARATU_POLA))
def test_porty_kazdego_rodzaju_aparatu_z_jednej_listy_portow(
    rodzaj: str, w_odgalezieniu: bool
):
    """Iloczyn {każdy rodzaj z JEDNEJ listy portów — w tym aparaty pola BKR (przekładnik
    niezrównoważenia: ``obwod``, przekładnik międzyfazowy: ``A``/``B``)} × {tor główny,
    odgałęzienie}: aparat dostaje KOMPLET portów swojego rodzaju; aparat nie-torowy (komplet inny
    niż ``we``/``wy``) przyłącza WSZYSTKIE porty do jednego, bieżącego węzła (dwa zaciski
    przekładnika międzyfazowego to dwie fazy tego samego węzła jednokreskowego)."""
    aparat: dict[str, Any] = {"kind": rodzaj}
    if w_odgalezieniu:
        aparat["odgalezienie"] = "o"
    wynik = porty_toru_pola([{"kind": "CB"}, aparat, {"kind": "CABLE_HEAD"}])[1]
    komplet = PORTY_APARATU_POLA[rodzaj]
    assert [p["port_id"] for p in wynik["ports"]] == list(komplet)
    wezly = [p["wezel"] for p in wynik["ports"]]
    if komplet == ("we", "wy"):
        # Wejście na węźle za wyłącznikiem, wyjście na nowym węźle (toru albo odgałęzienia).
        assert wezly == ["w1", "o1" if w_odgalezieniu else "w2"]
    else:
        assert len(set(wezly)) == 1, wezly
        assert wezly[0] == "w1"


@pytest.mark.parametrize("pole,laczniki", KOMBINACJE)
def test_przekladniki_rdzenie_z_katalogu_i_uzwojenia_vt(pole: str, laczniki: str):
    aparaty = template_primary_devices(_id(pole, laczniki), field_ref="pole-x")
    z_katalogiem = {
        a["kind"]: a.get("catalog_ref") for a in aparaty if a.get("catalog_ref")
    }
    assert z_katalogiem == {"CT": CT_RYSUNKU[pole]}
    ct = next(a for a in aparaty if a["kind"] == "CT")
    typ = next(
        t for t in get_default_mv_catalog().list_ct_types() if t.id == CT_RYSUNKU[pole]
    )
    assert ct["rdzenie"] == [r.model_dump(mode="json") for r in typ.lista_rdzeni()]
    assert len(ct["rdzenie"]) == (3 if pole == "Z11" else 1)
    vt = [a for a in aparaty if a["kind"] == "VT"]
    if pole == "Z10":
        assert vt == []
        return
    (t3,) = vt
    # Rysunki s.90 i s.91: SN/√3 / 0,1/√3 / 0,1/√3 / 0,1/√3 — trzy uzwojenia fazowe, bez
    # otwartego trójkąta (napięcie zerowe obwodami okrężnymi „Z, Zz" z przekładnika szyn).
    assert [u["otwarty_trojkat"] for u in t3["uzwojenia"]] == [False, False, False]
    assert [u["przekladnia"] for u in t3["uzwojenia"]] == ["SN/√3 / 0,1/√3"] * 3


@pytest.mark.parametrize(
    "pole,laczniki,klasa",
    list(
        itertools.product(
            WYKONANIA_POLA,
            WYKONANIA_LACZNIKOW,
            [None, "ODBIORCZE", "MIESZANE", "DEDYKOWANE_WYTWORCY"],
        )
    ),
)
def test_zestaw_eaz_szablonu_ze_slownika_i_wg_klasy(
    pole: str, laczniki: str, klasa: str | None
):
    # Iloczyn: wykonanie × łączniki × klasa × warunek źródła 3U₀ {niespełniony, spełniony}
    # (decyzja właściciela 2026-10-29 pkt 4: 67N tylko przy potwierdzonym źródle 3U₀ i
    # Ferrantim — bez spełnionego warunku szablon funkcji nie przypisuje).
    zestaw = funkcje_eaz_szablonu(_id(pole, laczniki), klasa)
    zestaw_z_u0 = funkcje_eaz_szablonu(_id(pole, laczniki), klasa, {WARUNEK_ZRODLA_U0})
    for wariant in (zestaw, zestaw_z_u0):
        assert len(wariant) == len(set(wariant))
        for kod in wariant:
            assert opis_funkcji_eaz_pl(kod), kod  # każdy kod ma nazwę PL w słowniku
        if klasa in {"MIESZANE", "DEDYKOWANE_WYTWORCY"}:
            assert "SCO" not in wariant
        if klasa == "DEDYKOWANE_WYTWORCY":
            assert not {"79", "SPZE", "67"} & set(wariant)
        if klasa == "MIESZANE":
            assert "67" in wariant
        if klasa == "ODBIORCZE":
            assert "81U" in wariant  # IRiESD II.4.5.4.2.1 pkt 5
    assert "67N" not in zestaw
    # Warunek spełniony dokłada WYŁĄCZNIE funkcje warunkowe (bez zmiany kolejności reszty).
    assert [k for k in zestaw_z_u0 if k not in WARUNKI_FUNKCJI_EAZ] == zestaw
    if klasa is None:
        rysunek = list(BAY_TEMPLATE_REGISTRY[_id(pole, laczniki)].funkcje_eaz)
        assert zestaw_z_u0 == rysunek
        assert zestaw == [k for k in rysunek if k not in WARUNKI_FUNKCJI_EAZ]
        # Rysunki Z.10/Z.11.1/Z.11 niosą 67N (wariantowo) — warunek ma na czym działać.
        assert "67N" in rysunek


# ---------------------------------------------------------------------------
# Łączniki, położenia, blokady
# ---------------------------------------------------------------------------


def test_zbiory_lacznikow_i_polozen_otwartych():
    assert RODZAJE_LACZNIKOW_POLA == {
        "CB",
        "LOAD_SWITCH",
        "DS",
        "ES",
        "FUSE",
        "THREE_POSITION_SWITCH",
    }
    assert (
        MAIN_SWITCH_KINDS == RODZAJE_LACZNIKOW_TORU == RODZAJE_LACZNIKOW_POLA - {"ES"}
    )
    assert is_open("uziemiony") and not is_closed("uziemiony")
    for stan in ("nieznany", "awaria", None):
        assert not is_open(stan) and not is_closed(stan)
    assert set(STANY_OTWARTE_W_TORZE) == {
        "otwarty",
        "otwarty_naped_rozbrojony",
        "uziemiony",
    }


def test_walidator_portow_i_polozenia_uziemiony():
    baza = {
        "device_ref": "d",
        "symbol_ref": "symbol:cb",
        "kind": "CB",
        "placement": "MIDSTREAM",
    }
    with pytest.raises(ValidationError, match="nie ma portu"):
        BayPrimaryDevice.model_validate({**baza, "ports": [{"port_id": "przylacze"}]})
    with pytest.raises(ValidationError, match="powtórzony port"):
        BayPrimaryDevice.model_validate(
            {**baza, "ports": [{"port_id": "we"}, {"port_id": "we", "wezel": "w1"}]}
        )
    with pytest.raises(ValidationError, match="uziemiony"):
        BayPrimaryDevice.model_validate(
            {**baza, "switch_state": {"actual_state": "uziemiony"}}
        )
    with pytest.raises(ValidationError):
        BayPrimaryDevice.model_validate({**baza, "odgalezienie": "p n"})


def test_blokady_trojpolozeniowy_uziemiony_dopuszcza_zamkniety_wylacznik():
    """Kabel uziemia się przez zamknięty wyłącznik przy łączniku w położeniu „uziemiony"."""
    brak = {"we": None, "wy": None}
    aparaty = [
        ("q1", "THREE_POSITION_SWITCH", "uziemiony", brak),
        ("q0", "CB", "zamkniety", brak),
    ]
    assert blokady_zamkniecia(aparaty) == {"q1": False, "q0": False}
    ais = [
        ("q1", "DS", "zamkniety", {}),
        ("q0", "CB", "otwarty", {}),
        ("q9", "ES", "otwarty", {}),
    ]
    assert blokady_zamkniecia(ais)["q9"] is True
    nieznany = [
        ("q1", "THREE_POSITION_SWITCH", "nieznany", {}),
        ("q9", "ES", "otwarty", {}),
    ]
    assert blokady_zamkniecia(nieznany)["q9"] is None


def test_blokada_uziemnika_odgalezienia_nie_zalezy_od_wylacznika():
    """Z.11 stały: Q51 blokuje tylko zamknięty Q5 — zamknięty wyłącznik Q0 go nie blokuje."""
    aparaty = template_primary_devices(
        _id("Z11", "STALY_Z_ODLACZNIKIEM"), field_ref="p"
    )
    stany = {
        "Q1": "zamkniety",
        "Q0": "zamkniety",
        "Q5": "otwarty",
        "Q51": "otwarty",
        "Q8": "otwarty",
    }
    wejscie = [
        (
            a["designation"],
            a["kind"] if a["kind"] != "DS_BRANCH" else "DS",
            stany.get(a["designation"]),
            porty(a),
        )
        for a in aparaty
        if a["designation"] in stany
    ]
    blokady = blokady_zamkniecia(wejscie)
    assert blokady["Q51"] is False and blokady["Q8"] is True


# ---------------------------------------------------------------------------
# Materializacja pól liniowych GPZ
# ---------------------------------------------------------------------------

RODZINY = {
    None: _id("Z10", "TROJPOLOZENIOWY"),
    "TYP_OGOLNY_OSD__GPZ_AIS": _id("Z10", "STALY_Z_ODLACZNIKIEM"),
    "TYP_OGOLNY_OSD__GPZ_SSIS": _id("Z10", "TROJPOLOZENIOWY"),
    "TYP_OGOLNY_OSD__GPZ_GAZ_BEZ_F": _id("Z10", "TROJPOLOZENIOWY"),
}


def _gpz(sekcje: int = 2, rodzina: str | None = None) -> dict[str, Any]:
    pusty = EnergyNetworkModel(
        header=ENMHeader(name="POLE-GPZ", defaults=ENMDefaults())
    )
    payload: dict[str, Any] = {
        "voltage_kv": 15.0,
        "sk3_mva": 250.0,
        "catalog_ref": ZRODLO,
        "sections_count": sekcje,
        "line_fields_per_section": 2,
        "gpz_line_field_apparatus": {"catalog_ref": APARAT},
    }
    if rodzina:
        payload["switchgear_family_ref"] = rodzina
    return ok(op(pusty.model_dump(mode="json"), "add_grid_source_sn", payload))


def _pola_liniowe(enm: dict[str, Any]) -> list[dict[str, Any]]:
    return [b for b in enm["bays"] if "gpz_line_field" in (b.get("tags") or [])]


def _sprawdz_pole(enm: dict[str, Any], pole: dict[str, Any], szablon_id: str) -> None:
    szablon = BAY_TEMPLATE_REGISTRY[szablon_id]
    galezie = {b["ref_id"]: b for b in enm["branches"]}
    assert pole["bay_template_ref"] == szablon_id
    aparaty = pole["primary_devices"]
    assert [(a["kind"], porty(a)) for a in aparaty] == porty_oczekiwane(
        szablon.wykonanie_pola, szablon.wykonanie_lacznikow
    )
    assert [a["designation"] for a in aparaty] == [
        w[2]
        for w in tabela_odczytu(szablon.wykonanie_pola, szablon.wykonanie_lacznikow)
    ]
    cb = next(a for a in aparaty if a["kind"] == "CB")
    (galaz_ref,) = pole["equipment_refs"]
    assert cb["linked_ref"] == galaz_ref and galezie[galaz_ref]["type"] == "breaker"
    assert cb.get("catalog_ref") == APARAT
    assert pole["protection_codes"] == funkcje_eaz_szablonu(
        szablon_id, pole.get("klasa_pola")
    )
    for aparat in aparaty:
        assert aparat["device_ref"].startswith(pole["ref_id"])


@pytest.mark.parametrize("rodzina", list(RODZINY))
def test_gpz_kazda_sekcja_pole_liniowe_wg_izolacji_rodziny(rodzina: str | None):
    """Szablon domyślny wg izolacji rodziny (§13): powietrzna → wyłącznik stały z odłącznikiem,
    pozostałe → łącznik trójpołożeniowy (ZASADA NR 4 — propozycja zamiast odmowy)."""
    enm = _gpz(sekcje=2, rodzina=rodzina)
    pola = _pola_liniowe(enm)
    assert len(pola) == 4
    assert {p["gpz_section_id"] for p in pola} == {
        s["section_id"]
        for st in enm["substations"]
        for s in st.get("gpz_sections") or []
    }
    for pole in pola:
        _sprawdz_pole(enm, pole, RODZINY[rodzina])
    EnergyNetworkModel.model_validate(enm)
    kody = {
        i.code
        for i in ENMValidator().validate(EnergyNetworkModel.model_validate(enm)).issues
    }
    assert not kody & {"W050", "W051", "W052"}


@pytest.mark.parametrize("izolacja", [None, "air", "ssis", "gaz_bez_f", "sf6"])
def test_szablon_domyslny_dopuszczony_w_izolacji(izolacja: str | None):
    szablon = szablon_domyslny_pola_liniowego_gpz(izolacja)
    assert szablon.wykonanie_pola == "Z10"
    oczekiwane = "STALY_Z_ODLACZNIKIEM" if izolacja == "air" else "TROJPOLOZENIOWY"
    assert szablon.wykonanie_lacznikow == oczekiwane


def test_gpz_deterministyczny_te_same_identyfikatory_i_odcisk():
    a, b = _gpz(), _gpz()
    assert _pola_liniowe(a) == _pola_liniowe(b)
    assert hash_migawki_enm(a) == hash_migawki_enm(b)


@pytest.mark.parametrize("sekcje", [1, 2])
@pytest.mark.parametrize("z_aparatem", [True, False])
def test_funkcje_eaz_tylko_w_polu_z_aparatem_albo_szablonem(
    z_aparatem: bool, sekcje: int
):
    """Iloczyn {aparat pola z katalogu, brak aparatu} × liczba sekcji: pole liniowe GPZ bez
    pozycji katalogowej aparatu nie ma szablonu, aparatów ani czym wyłączyć — funkcje EAZ
    z roli byłyby fabrykacją (kanon resolvera: pole bez wyłącznika = puste). Pole z aparatem
    niesie zestaw swojego szablonu."""
    pusty = EnergyNetworkModel(
        header=ENMHeader(name="POLE-GPZ", defaults=ENMDefaults())
    )
    payload: dict[str, Any] = {
        "voltage_kv": 15.0,
        "sk3_mva": 250.0,
        "catalog_ref": ZRODLO,
        "sections_count": sekcje,
        "line_fields_per_section": 1,
    }
    if z_aparatem:
        payload["gpz_line_field_apparatus"] = {"catalog_ref": APARAT}
    enm = ok(op(pusty.model_dump(mode="json"), "add_grid_source_sn", payload))
    pola = _pola_liniowe(enm)
    assert len(pola) == sekcje
    for pole in pola:
        if z_aparatem:
            assert pole[
                "protection_codes"
            ], "pole z wyłącznikiem niesie funkcje szablonu"
            assert pole["protection_codes"] == funkcje_eaz_szablonu(
                pole["bay_template_ref"], pole.get("klasa_pola")
            )
        else:
            assert pole["bay_template_ref"] is None
            assert not pole["equipment_refs"] and not pole["primary_devices"]
            assert pole["protection_codes"] == []


def test_przydzial_pola_przy_odgalezieniu_tym_samym_wzorcem():
    """Pole dokładane przydziałem odgałęzienia — TEN SAM wzorzec co pola tworzone z GPZ."""
    pusty = EnergyNetworkModel(
        header=ENMHeader(name="POLE-GPZ", defaults=ENMDefaults())
    )
    enm = ok(
        op(
            pusty.model_dump(mode="json"),
            "add_grid_source_sn",
            {
                "voltage_kv": 15.0,
                "sk3_mva": 250.0,
                "catalog_ref": ZRODLO,
                "line_fields_per_section": 1,
                "gpz_line_field_apparatus": {"catalog_ref": APARAT},
                "switchgear_family_ref": "TYP_OGOLNY_OSD__GPZ_AIS",
            },
        )
    )
    kabel = {"rodzaj": "KABEL", "dlugosc_m": 300, "catalog_ref": KABEL}
    enm = ok(op(enm, "continue_trunk_segment_sn", {"segment": kabel}))
    (pierwsze,) = _pola_liniowe(enm)
    enm = ok(
        op(
            enm,
            "start_branch_segment_sn",
            {"from_ref": pierwsze["ref_id"], "segment": kabel},
        )
    )
    pola = _pola_liniowe(enm)
    assert len(pola) == 2, "odgałęzienie z zajętego pola dostaje nowe pole liniowe"
    for pole in pola:
        _sprawdz_pole(enm, pole, _id("Z10", "STALY_Z_ODLACZNIKIEM"))


def test_add_sn_bay_w_sekcji_gpz_bez_szablonu_dostaje_wzorzec():
    enm = _gpz(sekcje=2)
    stacja = next(s for s in enm["substations"] if s.get("gpz_sections"))
    for sekcja in stacja["gpz_sections"]:
        wynik = op(
            enm,
            "add_sn_bay",
            {
                "station_ref": stacja["ref_id"],
                "bus_ref": sekcja["bus_ref"],
                "bay_role": "OUT",
                "apparatus_kind": "BREAKER",
                "catalog_binding": {
                    "catalog_namespace": "APARAT_SN",
                    "catalog_item_id": APARAT,
                },
            },
        )
        enm = ok(wynik)
        pole = next(
            b
            for b in enm["bays"]
            if b["ref_id"] == wynik["selection_hint"]["element_id"]
        )
        _sprawdz_pole(enm, pole, _id("Z10", "TROJPOLOZENIOWY"))
        assert pole["gpz_section_id"] == sekcja["section_id"]


@pytest.mark.parametrize(
    "pole_rys,laczniki,sekcja",
    list(itertools.product(WYKONANIA_POLA, WYKONANIA_LACZNIKOW, [0, 2])),
)
def test_set_bay_equipment_szablon_w_kazdej_sekcji(
    pole_rys: str, laczniki: str, sekcja: int
):
    enm = _gpz(sekcje=2, rodzina="TYP_OGOLNY_OSD__GPZ_SSIS")
    pole = _pola_liniowe(enm)[sekcja]
    szablon_id = _id(pole_rys, laczniki)
    wynik = op(
        enm,
        "set_bay_equipment",
        {"bay_ref": pole["ref_id"], "mode": "szablon", "bay_template_ref": szablon_id},
    )
    nowy = ok(wynik)
    rekord = next(b for b in nowy["bays"] if b["ref_id"] == pole["ref_id"])
    _sprawdz_pole(nowy, rekord, szablon_id)

    # Położenie łącznika bez gałęzi (`switch_state`): instancja niezmieniona (ten sam
    # identyfikator, rodzaj i pozycja katalogu — `pola.aparaty_po_wymianie`) zachowuje położenie
    # sprzed zapisu (ponowny szablon nie przestawia łączników: pole GPZ budowane z tym samym
    # szablonem ma Q1 zamknięty), aparat wymieniony jest nowy bez położenia (nieustalone, nigdy
    # domysł). Szablon sam położenia nie nadaje.
    def _instancja(a: dict[str, Any]) -> tuple[str, str, str]:
        return (a["device_ref"], a["kind"], a.get("catalog_ref") or "")

    polozenia_przed = {
        _instancja(a): a.get("switch_state") for a in pole["primary_devices"]
    }
    for aparat in rekord["primary_devices"]:
        assert aparat.get("switch_state") == polozenia_przed.get(
            _instancja(aparat)
        ), aparat["device_ref"]
    if szablon_id == pole["bay_template_ref"]:
        # Ten sam szablon: co najmniej jedno położenie przeniesione (inaczej asercja wyżej
        # byłaby pusta dla iloczynu, w którym przeniesienie występuje).
        assert any(a.get("switch_state") for a in rekord["primary_devices"])
    # Wartości robocze (bez danych producenta) jawnie w `dane_przyjete` (ZASADA NR 4).
    przyjete = wynik["wyposazenie_pola"]["dane_przyjete"]
    assert przyjete and {d["jakosc"] for d in przyjete} == {"ESTIMATED"}
    bez_katalogu = [a for a in rekord["primary_devices"] if not a.get("catalog_ref")]
    assert len(przyjete) == len(bez_katalogu)
    # Drugie pole w tej samej sekcji nietknięte.
    for inne in _pola_liniowe(nowy):
        if inne["ref_id"] != pole["ref_id"]:
            assert inne == next(b for b in enm["bays"] if b["ref_id"] == inne["ref_id"])


@pytest.mark.parametrize("pole_rys", WYKONANIA_POLA)
def test_set_bay_equipment_katalog_zachowuje_odgalezienie(pole_rys: str):
    """Ponowny zapis pola w trybie katalogu (projektant poprawia pozycje) odtwarza porty
    odgałęzienia z `odgalezienie` zapisanego na aparacie — tor główny i odgałęzienie bez zmian.
    """
    enm = _gpz(sekcje=1, rodzina="TYP_OGOLNY_OSD__GPZ_AIS")
    pole = _pola_liniowe(enm)[0]
    szablon_id = _id(pole_rys, "STALY_Z_ODLACZNIKIEM")
    enm = ok(
        op(
            enm,
            "set_bay_equipment",
            {
                "bay_ref": pole["ref_id"],
                "mode": "szablon",
                "bay_template_ref": szablon_id,
            },
        )
    )
    rekord = next(b for b in enm["bays"] if b["ref_id"] == pole["ref_id"])
    urzadzenia = []
    for a in rekord["primary_devices"]:
        wpis = {k: a[k] for k in ("kind", "placement", "designation") if a.get(k)}
        for klucz in ("catalog_ref", "linked_ref", "odgalezienie"):
            if a.get(klucz):
                wpis[klucz] = a[klucz]
        if a["kind"] == "VT":
            wpis["catalog_ref"] = "vt_15kv_fz_100_3_05_3p_arteche"
        if a["kind"] == "DS":
            wpis["catalog_ref"] = "sw-ds-abb-ojs-17kv-630a"
        if a["kind"] == "ES":
            wpis["catalog_ref"] = "sw-es-generic-17kv"
        urzadzenia.append(wpis)
    wynik = op(
        enm,
        "set_bay_equipment",
        {"bay_ref": pole["ref_id"], "mode": "katalog", "devices": urzadzenia},
    )
    po = next(b for b in ok(wynik)["bays"] if b["ref_id"] == pole["ref_id"])
    assert [
        (a["kind"], porty(a), a.get("odgalezienie")) for a in po["primary_devices"]
    ] == [
        (a["kind"], porty(a), a.get("odgalezienie")) for a in rekord["primary_devices"]
    ]
    # Iniekcja: bez `odgalezienie` obchód toru nie wie, że Q5 leży w odgałęzieniu.
    if pole_rys != "Z10":
        bez = [{k: v for k, v in u.items() if k != "odgalezienie"} for u in urzadzenia]
        wynik_bez = op(
            enm,
            "set_bay_equipment",
            {"bay_ref": pole["ref_id"], "mode": "katalog", "devices": bez},
        )
        po_bez = next(b for b in ok(wynik_bez)["bays"] if b["ref_id"] == pole["ref_id"])
        assert [porty(a) for a in po_bez["primary_devices"]] != [
            porty(a) for a in rekord["primary_devices"]
        ]


# ---------------------------------------------------------------------------
# Odmowy W050–W052: operacja i walidator, ta sama reguła
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "rodzina,szablon_id,klasa,kod",
    [
        (
            "TYP_OGOLNY_OSD__GPZ_AIS",
            _id("Z10", "TROJPOLOZENIOWY"),
            None,
            "pole.wykonanie_lacznikow_niezgodne_z_izolacja",
        ),
        (
            "TYP_OGOLNY_OSD__GPZ_AIS",
            _id("Z11", "TROJPOLOZENIOWY"),
            "MIESZANE",
            "pole.wykonanie_lacznikow_niezgodne_z_izolacja",
        ),
        (
            "TYP_OGOLNY_OSD__GPZ_SSIS",
            _id("Z10", "WYSUWNY"),
            "DEDYKOWANE_WYTWORCY",
            "pole.klasa_pola_niezgodna_z_wykonaniem",
        ),
        (
            "TYP_OGOLNY_OSD__GPZ_AIS",
            _id("Z10", "STALY_Z_ODLACZNIKIEM"),
            "MIESZANE",
            "pole.klasa_pola_niezgodna_z_wykonaniem",
        ),
    ],
)
def test_odmowa_operacji_i_walidatora_z_jednej_reguly(rodzina, szablon_id, klasa, kod):
    enm = _gpz(sekcje=1, rodzina=rodzina)
    pole = _pola_liniowe(enm)[0]
    payload: dict[str, Any] = {
        "bay_ref": pole["ref_id"],
        "mode": "szablon",
        "bay_template_ref": szablon_id,
    }
    if klasa:
        payload["klasa_pola"] = klasa
    odmowa = op(enm, "set_bay_equipment", payload)
    assert odmowa["error_code"] == kod
    # Ten sam stan zapisany wprost (model zastany) — walidator raportuje kod W04x.
    zastany = copy.deepcopy(enm)
    rekord = next(b for b in zastany["bays"] if b["ref_id"] == pole["ref_id"])
    rekord["bay_template_ref"] = szablon_id
    rekord["klasa_pola"] = klasa
    kody = {
        i.code: i
        for i in ENMValidator()
        .validate(EnergyNetworkModel.model_validate(zastany))
        .issues
    }
    oczekiwany = {
        "pole.wykonanie_lacznikow_niezgodne_z_izolacja": "W050",
        "pole.szablon_tylko_gpz": "W051",
        "pole.klasa_pola_niezgodna_z_wykonaniem": "W052",
    }[kod]
    assert oczekiwany in kody and kody[oczekiwany].suggested_fix


def test_szablon_gpz_poza_gpz_odrzucony_w047():
    """Pole stacji SN spoza GPZ: wzorce Z.10/Z.11.1/Z.11 opisują pola rozdzielni 110 kV/SN."""
    from tests.reference_networks.sceny_zajetosci_pol import zbuduj_scene

    enm = zbuduj_scene("stacja_na_odcinku", "wolne_kilka").enm
    pole_sn = next(
        b
        for b in enm["bays"]
        if not b.get("gpz_section_id") and b.get("bay_role") == "OUT"
    )
    odmowa = op(
        enm,
        "set_bay_equipment",
        {
            "bay_ref": pole_sn["ref_id"],
            "mode": "szablon",
            "bay_template_ref": _id("Z10", "TROJPOLOZENIOWY"),
        },
    )
    assert odmowa["error_code"] == "pole.szablon_tylko_gpz"


# ---------------------------------------------------------------------------
# Solver, odcisk, odczyt pola, topologia
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("pole_rys", WYKONANIA_POLA)
def test_wejscie_solverow_niezmienione_przez_aparaty_pola(pole_rys: str):
    """Aparaty pola (porty, odgałęzienie VT, łączniki bez gałęzi) nie wchodzą do grafu sieci."""
    enm = _gpz()
    for pole in _pola_liniowe(enm):
        enm = ok(
            op(
                enm,
                "set_bay_equipment",
                {
                    "bay_ref": pole["ref_id"],
                    "mode": "szablon",
                    "bay_template_ref": _id(pole_rys, "TROJPOLOZENIOWY"),
                },
            )
        )
    bez = copy.deepcopy(enm)
    for pole in bez["bays"]:
        pole["primary_devices"] = []
    graf_a = map_enm_to_network_graph(EnergyNetworkModel.model_validate(enm))
    graf_b = map_enm_to_network_graph(EnergyNetworkModel.model_validate(bez))
    for atrybut in (
        "nodes",
        "branches",
        "switches",
        "grid_sc_sources",
        "inverter_sources",
    ):
        assert repr(sorted(getattr(graf_a, atrybut).items())) == repr(
            sorted(getattr(graf_b, atrybut).items())
        ), atrybut


def test_odcisk_pustych_list_jak_brak_pola():
    # Pola addytywne aparatu pola (porty, odgałęzienie, przekładnia przekładnika Ferrantiego):
    # brak klucza i wartość pusta/`None` to ten sam odcisk (migawki sprzed atrybutu nie
    # tracą świeżości wyników), a wartość nadana jest treścią modelu.
    enm = _gpz()
    assert any(
        aparat.get("przekladnia")
        for pole in enm["bays"]
        for aparat in pole["primary_devices"]
    )
    bez = copy.deepcopy(enm)
    z_pusta = copy.deepcopy(enm)
    for pole in bez["bays"]:
        for aparat in pole["primary_devices"]:
            aparat.pop("ports", None)
            aparat.pop("odgalezienie", None)
            aparat.pop("przekladnia", None)
            aparat.pop("wykonanie", None)
    for pole in z_pusta["bays"]:
        for aparat in pole["primary_devices"]:
            aparat["ports"] = []
            aparat["odgalezienie"] = None
            aparat["przekladnia"] = None
            aparat["wykonanie"] = None
    assert hash_migawki_enm(bez) == hash_migawki_enm(z_pusta)
    assert hash_migawki_enm(enm) != hash_migawki_enm(z_pusta)
    tylko_przekladnia = copy.deepcopy(z_pusta)
    for pole, zrodlowe in zip(tylko_przekladnia["bays"], enm["bays"], strict=True):
        for aparat, zrodlowy in zip(
            pole["primary_devices"], zrodlowe["primary_devices"], strict=True
        ):
            aparat["przekladnia"] = zrodlowy.get("przekladnia")
    assert hash_migawki_enm(tylko_przekladnia) != hash_migawki_enm(z_pusta)
    # Wykonanie wyłącznika (stałe / wysuwne, rozstrzygnięcie architekta 2026-10-30 pkt 3):
    # szablon pola GPZ nadaje je wyłącznikowi, wartość nadana jest treścią modelu.
    assert any(
        aparat.get("wykonanie")
        for pole in enm["bays"]
        for aparat in pole["primary_devices"]
    )
    tylko_wykonanie = copy.deepcopy(z_pusta)
    for pole, zrodlowe in zip(tylko_wykonanie["bays"], enm["bays"], strict=True):
        for aparat, zrodlowy in zip(
            pole["primary_devices"], zrodlowe["primary_devices"], strict=True
        ):
            aparat["wykonanie"] = zrodlowy.get("wykonanie")
    assert hash_migawki_enm(tylko_wykonanie) != hash_migawki_enm(z_pusta)


def _z_polozeniem_q1(
    enm: dict[str, Any], stan: str
) -> tuple[dict[str, Any], dict[str, Any]]:
    nowy = copy.deepcopy(enm)
    pole = _pola_liniowe(nowy)[0]
    q1 = next(
        a for a in pole["primary_devices"] if a["kind"] == "THREE_POSITION_SWITCH"
    )
    q1["switch_state"] = {"actual_state": stan}
    return nowy, pole


@pytest.mark.parametrize("stan", ["zamkniety", "otwarty", "uziemiony", "nieznany"])
def test_odczyt_pola_niesie_polozenie_lacznika_trojpolozeniowego(stan: str):
    enm, pole = _z_polozeniem_q1(_gpz(sekcje=1), stan)
    odczyt = build_field_read_model("case-gpz", EnergyNetworkModel.model_validate(enm))
    rekord = next(f for f in odczyt["fields"] if f["bay_ref"] == pole["ref_id"])
    aparaty = rekord["canonical_model"]["base_model"]["primary_devices"]
    q1 = next(d for d in aparaty if d["kind"] == "THREE_POSITION_SWITCH")
    assert q1["switch_state"]["actual_state"] == stan
    assert q1["ports"] == [
        {"port_id": "we", "wezel": "szyna"},
        {"port_id": "wy", "wezel": "w1"},
    ]


@pytest.mark.parametrize("stan", ["otwarty", "uziemiony", "nieznany"])
def test_topologia_trojpolozeniowy_nie_zamkniety_przy_zamknietym_wylaczniku_jest_nieustalony(
    stan: str,
):
    enm, pole = _z_polozeniem_q1(_gpz(sekcje=1), stan)
    nieustalone = _nieustalone_laczniki(EnergyNetworkModel.model_validate(enm))
    (galaz_ref,) = pole["equipment_refs"]
    assert galaz_ref in nieustalone
    assert nieustalone[galaz_ref].stan_zgloszony == stan


def test_topologia_trojpolozeniowy_zamkniety_nie_zglasza_niczego():
    enm, pole = _z_polozeniem_q1(_gpz(sekcje=1), "zamkniety")
    assert pole["equipment_refs"][0] not in _nieustalone_laczniki(
        EnergyNetworkModel.model_validate(enm)
    )


def test_topologia_lacznik_odgalezienia_vt_otwarty_nie_przerywa_toru():
    """Z.11.1: otwarty Q5 (odgałęzienie przekładnika napięciowego) nie czyni pola nieustalonym —
    aparat poza torem głównym (jedna reguła `aparaty_poza_torem_glownym`)."""
    enm = _gpz(sekcje=1)
    pole = _pola_liniowe(enm)[0]
    enm = ok(
        op(
            enm,
            "set_bay_equipment",
            {
                "bay_ref": pole["ref_id"],
                "mode": "szablon",
                "bay_template_ref": _id("Z11_1", "TROJPOLOZENIOWY"),
            },
        )
    )
    rekord = next(b for b in enm["bays"] if b["ref_id"] == pole["ref_id"])
    for a in rekord["primary_devices"]:
        if a["designation"] == "Q1":
            a["switch_state"] = {"actual_state": "zamkniety"}
        if a["designation"] == "Q5":
            a["switch_state"] = {"actual_state": "otwarty"}
    assert pole["equipment_refs"][0] not in _nieustalone_laczniki(
        EnergyNetworkModel.model_validate(enm)
    )
