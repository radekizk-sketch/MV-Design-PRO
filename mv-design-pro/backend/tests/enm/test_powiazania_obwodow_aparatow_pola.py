"""Powiązania obwodów wtórnych wzorca pola na rekordach aparatów (poprawki P0 2026-10-29 karty
UX-04/POLE-LINIOWE-WZORZEC): napęd łącznika (`BayPrimaryDevice.naped` — wyłącznik Q0 silnikowy,
łącznik trójpołożeniowy Q1 zasobnikowy z obsługą ręczną, decyzja architekta 2026-10-30), funkcje
EAZ mierzące z przekładnika (`funkcje_eaz_zasilane`) i działające na wyłącznik
(`funkcje_eaz_wylaczajace`). Schemat pola rysuje z nich połączenia przekaźnika z rdzeniem CT,
przekładnikiem Ferrantiego, uzwojeniem VT i wyłącznikiem oraz znaki napędu przy łącznikach.

Iloczyn cech: szablon (9: Z.10 / Z.11.1 / Z.11 × wykonanie łączników) × droga zapisu {budowa GPZ,
`set_bay_equipment` szablon, katalog z oznaczeniami wzorca, katalog z innym oznaczeniem
przekładnika, katalog bez przekładnika Ferrantiego, zmiana szablonu, usunięcie wyposażenia}.

Wyrocznie: (1) tabela odczytu rysunku Z.11.1 s.91 zapisana literalnie (kto mierzy z T1, T2, T3,
co działa na Q0); (2) powiązania przeliczone wprost z danych wzorca, ograniczone do funkcji,
które pole MA (`Bay.protection_codes` — zestaw korygowany klasą pola, IRiESD II.4.5.4.2);
(3) PREDYKAT PARAMI z odczytem pola (`pole_liniowe_gpz._opis_wejscia`): dla funkcji pola odczyt
mówi „brak aparatu w polu" dokładnie wtedy, gdy aparat o oznaczeniu wejścia nie ma funkcji
w `funkcje_eaz_zasilane`; funkcja wzorca, której pole nie ma, nie wiąże żadnego aparatu.
"""

from __future__ import annotations

import copy
import itertools
from typing import Any

import pytest
from enm.hash import hash_migawki_enm
from enm.models import BayPrimaryDevice, EnergyNetworkModel, ENMDefaults, ENMHeader
from enm.pole_liniowe_gpz import _opis_wejscia
from network_model.catalog.bay_templates import BAY_TEMPLATE_REGISTRY
from network_model.catalog.obwody_wtorne_pola import (
    POLA_POWIAZAN_APARATU,
    RODZAJ_APARATU_WEJSCIA,
    ObwodyWtornePola,
    powiazania_aparatow_pola,
)
from pydantic import ValidationError

from tests.reference_networks.scena_geometrii_stacji import dodaj_pole_pomiaru_napiecia_z17
from tests.reference_networks.sceny_zajetosci_pol import APARAT, ZRODLO, ok, op

SZABLONY = sorted(t for t, s in BAY_TEMPLATE_REGISTRY.items() if s.obwody_wtorne is not None)
DROGI = ("szablon", "katalog_oznaczenia_wzorca", "katalog_inne_oznaczenie_t1", "katalog_bez_t2")
Z11_1 = "bay_template_gpz_line_enea_z11_1_trojpolozeniowy"
Z10 = "bay_template_gpz_line_enea_z10_trojpolozeniowy"


def _rodzina(szablon_id: str) -> str:
    """Rodzina rozdzielnicy dopuszczająca wykonanie łączników szablonu (ENEA Zeszyt 1 §13)."""
    if "trojpolozeniowy" in szablon_id:
        return "TYP_OGOLNY_OSD__GPZ_SSIS"
    return "TYP_OGOLNY_OSD__GPZ_AIS"


def _gpz(szablon_id: str = Z11_1) -> dict[str, Any]:
    pusty = EnergyNetworkModel(header=ENMHeader(name="POWIAZANIA", defaults=ENMDefaults()))
    payload: dict[str, Any] = {
        "voltage_kv": 15.0,
        "sk3_mva": 250.0,
        "catalog_ref": ZRODLO,
        "sections_count": 1,
        "line_fields_per_section": 1,
        "gpz_line_field_apparatus": {"catalog_ref": APARAT},
        "switchgear_family_ref": _rodzina(szablon_id),
    }
    return ok(op(pusty.model_dump(mode="json"), "add_grid_source_sn", payload))


def _pole(enm: dict[str, Any]) -> dict[str, Any]:
    return next(b for b in enm["bays"] if "gpz_line_field" in (b.get("tags") or []))


def _po_ref(enm: dict[str, Any], ref: str) -> dict[str, Any]:
    return next(b for b in enm["bays"] if b["ref_id"] == ref)


def _z_szablonu(enm: dict[str, Any], szablon_id: str) -> dict[str, Any]:
    pole = _pole(enm)
    return ok(
        op(
            enm,
            "set_bay_equipment",
            {"bay_ref": pole["ref_id"], "mode": "szablon", "bay_template_ref": szablon_id},
        )
    )


def _wpisy_katalogu(rekord: dict[str, Any]) -> list[dict[str, Any]]:
    wpisy = []
    for a in rekord["primary_devices"]:
        wpis = {k: a[k] for k in ("kind", "placement", "designation") if a.get(k)}
        for klucz in ("catalog_ref", "linked_ref", "odgalezienie", "przekladnia"):
            if a.get(klucz):
                wpis[klucz] = a[klucz]
        if a["kind"] == "VT":
            wpis["catalog_ref"] = "vt_15kv_fz_100_3_05_3p_arteche"
        if a["kind"] == "DS":
            wpis["catalog_ref"] = "sw-ds-abb-ojs-17kv-630a"
        if a["kind"] == "ES":
            wpis["catalog_ref"] = "sw-es-generic-17kv"
        wpisy.append(wpis)
    return wpisy


def _zapis(enm: dict[str, Any], szablon_id: str, droga: str) -> dict[str, Any]:
    enm = _z_szablonu(enm, szablon_id)
    if droga == "szablon":
        return enm
    rekord = _pole(enm)
    wpisy = _wpisy_katalogu(rekord)
    if droga == "katalog_inne_oznaczenie_t1":
        for w in wpisy:
            if w.get("designation") == "T1":
                w["designation"] = "T11"
    elif droga == "katalog_bez_t2":
        wpisy = [w for w in wpisy if w.get("designation") != "T2"]
    return ok(
        op(
            enm,
            "set_bay_equipment",
            {"bay_ref": rekord["ref_id"], "mode": "katalog", "devices": wpisy},
        )
    )


def _oczekiwane(
    obwody: ObwodyWtornePola, aparaty: list[dict[str, Any]], funkcje_pola: list[str]
) -> dict[str, dict[str, Any]]:
    """Wyrocznia z danych wzorca: oznaczenie aparatu → oczekiwane pola powiązań (tylko funkcje
    pola)."""
    wynik: dict[str, dict[str, Any]] = {
        str(a.get("designation")): {} for a in aparaty if a.get("designation")
    }
    rodzaj = {str(a.get("designation")): a["kind"] for a in aparaty if a.get("designation")}
    # Napęd: atrybut łącznika po oznaczeniu i rodzaju, niezależnie od funkcji pola.
    for n in obwody.napedy:
        if rodzaj.get(n.aparat) == n.rodzaj_aparatu:
            wynik[n.aparat]["naped"] = n.naped
    for p in obwody.powiazania:
        if p.funkcja not in funkcje_pola:
            continue
        if p.wylacznik is not None and rodzaj.get(p.wylacznik) == "CB":
            pola = wynik[p.wylacznik]
            pola.setdefault("funkcje_eaz_wylaczajace", [])
            if p.funkcja not in pola["funkcje_eaz_wylaczajace"]:
                pola["funkcje_eaz_wylaczajace"].append(p.funkcja)
        for w in p.wejscia:
            if w.aparat is not None and rodzaj.get(w.aparat) == RODZAJ_APARATU_WEJSCIA[w.rodzaj]:
                pola = wynik[w.aparat]
                pola.setdefault("funkcje_eaz_zasilane", [])
                if p.funkcja not in pola["funkcje_eaz_zasilane"]:
                    pola["funkcje_eaz_zasilane"].append(p.funkcja)
    return wynik


def _powiazania(rekord: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        str(a.get("designation")): {k: a[k] for k in POLA_POWIAZAN_APARATU if a.get(k)}
        for a in rekord["primary_devices"]
        if a.get("designation")
    }


@pytest.mark.parametrize("szablon_id,droga", list(itertools.product(SZABLONY, DROGI)))
def test_powiazania_aparatow_wg_wzorca_i_predykat_parami_z_odczytem(szablon_id: str, droga: str):
    enm = _zapis(_gpz(szablon_id), szablon_id, droga)
    rekord = _pole(enm)
    obwody = BAY_TEMPLATE_REGISTRY[szablon_id].obwody_wtorne
    assert obwody is not None
    assert _powiazania(rekord) == _oczekiwane(
        obwody, rekord["primary_devices"], rekord["protection_codes"]
    )
    # Każdy rekord przechodzi kontrakt aparatu (walidator powiązań na rodzaju).
    for a in rekord["primary_devices"]:
        BayPrimaryDevice.model_validate(a)
    # Predykat parami: odczyt pola i powiązania na aparacie z JEDNEJ reguły dopasowania.
    aparaty = {str(a["designation"]): a for a in rekord["primary_devices"] if a.get("designation")}
    wylaczajace = {
        kod for a in rekord["primary_devices"] for kod in a.get("funkcje_eaz_wylaczajace") or []
    }
    for p in obwody.powiazania:
        if p.funkcja not in rekord["protection_codes"]:
            # Funkcja wzorca, której pole nie ma (korekta klasą pola) — nie wiąże aparatu.
            assert all(
                p.funkcja not in (a.get("funkcje_eaz_zasilane") or [])
                for a in rekord["primary_devices"]
            ), (droga, p.funkcja)
            assert p.funkcja not in wylaczajace, (droga, p.funkcja)
            continue
        for w in p.wejscia:
            if w.aparat is None:
                continue
            brak = "brak aparatu w polu" in _opis_wejscia(w, aparaty)
            zasilane = (aparaty.get(w.aparat) or {}).get("funkcje_eaz_zasilane") or []
            assert brak is (p.funkcja not in zasilane), (droga, p.funkcja, w.aparat)
    if droga == "katalog_inne_oznaczenie_t1":
        t11 = next(a for a in rekord["primary_devices"] if a.get("designation") == "T11")
        assert "funkcje_eaz_zasilane" not in t11 or not t11["funkcje_eaz_zasilane"]
    if droga == "katalog_bez_t2":
        assert all(a["kind"] != "CORE_BALANCE_CT" for a in rekord["primary_devices"])


#: Tabela odczytu rysunku ENEA Z.11.1 s.91 (`docs/uiux/UX04_POLE_LINIOWE_WZORZEC.md` §9.3),
#: zapisana literalnie: co działa na Q0 i kto mierzy z T1, T2, T3. 51N to kryterium prądowe Io
#: bloku „Zab. ziemnozwarciowe t1, t2" z przekładnika Ferrantiego T2 (czerwona linia z zacisku 2
#: rysunku; uwaga sesji głównej 2026-10-29 pkt 4, §11.9) — w polu BEZ warunku źródła 3U₀.
TABELA_Z11_1_WYLACZAJACE_Q0 = [
    "51", "50", "51N", "67N", "50BF", "79", "SCO",
    "27", "59", "81U", "81O", "81R", "NZ", "SPZE", "OWG",
]  # fmt: skip
TABELA_Z11_1_ZASILANE = {
    "T1": ["51", "50", "ZS", "50BF", "67"],
    "T2": ["51N", "67N"],
    "T3": ["67", "27", "59", "81U", "81O", "81R", "NZ"],
}


@pytest.mark.parametrize("zrodlo_u0", [False, True], ids=["bez_zrodla_u0", "zrodlo_u0_z17"])
def test_tabela_rysunku_z11_1(zrodlo_u0: bool):
    """Wyrocznia literalna z rysunku s.91: wzorzec (wszystkie funkcje rysunku) daje tabelę
    1:1; pole liniowe z klasą pola niesie tabelę ograniczoną do SWOICH funkcji
    (`protection_codes` — w polu klasy mieszanej bez SCO, IRiESD II.4.5.4.2). Decyzja
    właściciela 2026-10-29 pkt 4: 67N (i jego powiązanie z przekładnikiem Ferrantiego T2) pole
    ma WYŁĄCZNIE z potwierdzonym źródłem 3U₀ — przekładnikiem pola pomiaru napięcia Z.17 sekcji
    powiązanym w modelu; bez niego T2 zasila wyłącznie 51N (kryterium prądowe Io, bez warunku
    — uwaga sesji głównej pkt 4)."""
    obwody = BAY_TEMPLATE_REGISTRY[Z11_1].obwody_wtorne
    assert obwody is not None
    enm = _z_szablonu(_gpz(), Z11_1)
    # Klasa pola mieszanego (Z.11.1 — pole z generacją, IRiESD II.4.5.4.2): zestaw bez SCO.
    zadanie: dict[str, Any] = {
        "bay_ref": _pole(enm)["ref_id"],
        "mode": "szablon",
        "bay_template_ref": Z11_1,
        "klasa_pola": "MIESZANE",
    }
    if zrodlo_u0:
        enm, vt_ref = dodaj_pole_pomiaru_napiecia_z17(enm, _pole(enm)["gpz_section_id"])
        zadanie["zrodlo_u0_ref"] = vt_ref
    enm = ok(op(enm, "set_bay_equipment", zadanie))
    rekord = _pole(enm)
    wszystkie = [p.funkcja for p in obwody.powiazania]
    p_wzorca = {
        str(a.get("designation")): {k: a[k] for k in POLA_POWIAZAN_APARATU if a.get(k)}
        for a in powiazania_aparatow_pola(rekord["primary_devices"], obwody, wszystkie)
    }
    assert p_wzorca["Q0"] == {
        "naped": "SILNIKOWY",
        "funkcje_eaz_wylaczajace": TABELA_Z11_1_WYLACZAJACE_Q0,
    }
    for oznaczenie, kody in TABELA_Z11_1_ZASILANE.items():
        assert p_wzorca[oznaczenie] == {"funkcje_eaz_zasilane": kody}
    kody_pola = rekord["protection_codes"]
    # Pole klasy mieszanej: zestaw bez SCO — funkcja rysunku, której pole nie ma, nie wiąże Q0.
    assert "SCO" not in kody_pola and "SCO" in TABELA_Z11_1_WYLACZAJACE_Q0
    p = _powiazania(rekord)
    assert p["Q0"] == {
        "naped": "SILNIKOWY",
        "funkcje_eaz_wylaczajace": [k for k in TABELA_Z11_1_WYLACZAJACE_Q0 if k in kody_pola],
    }
    assert ("67N" in kody_pola) is zrodlo_u0
    for oznaczenie, kody in TABELA_Z11_1_ZASILANE.items():
        oczekiwane = [k for k in kody if k in kody_pola]
        assert p[oznaczenie] == ({"funkcje_eaz_zasilane": oczekiwane} if oczekiwane else {})
    assert p["T2"] == {"funkcje_eaz_zasilane": ["51N", "67N"] if zrodlo_u0 else ["51N"]}
    # Łącznik trójpołożeniowy Q1: znak napędu (kwadrat na sprzężeniu, obsługa ręczna) na s.91;
    # odłącznik z uziemieniem Q5 odgałęzienia przekładnika napięciowego — bez znaku napędu.
    assert p_wzorca["Q1"] == p["Q1"] == {"naped": "ZASOBNIKOWY_RECZNY"}
    for oznaczenie in ("PF0", "Q5", "GK1", "PF1", "GK"):
        assert p[oznaczenie] == {}


def test_zmiana_zestawu_funkcji_pola_przelicza_powiazania():
    """Predykat parami (zestaw funkcji pola × powiązania aparatów): zmiana `protection_codes`
    pisarzem `zmien_pole` bez zmiany aparatów przelicza powiązania (iniekcja: przeliczanie
    tylko przy zmianie aparatów zostawia Q0 wyłączany funkcją, której pole już nie ma)."""
    from enm.pola import zmien_pole

    enm = _z_szablonu(_gpz(), Z11_1)
    rekord = _pole(enm)
    zmien_pole(enm, rekord["ref_id"], protection_codes=["51", "50"])
    po = _powiazania(_po_ref(enm, rekord["ref_id"]))
    assert po["Q0"] == {"naped": "SILNIKOWY", "funkcje_eaz_wylaczajace": ["51", "50"]}
    assert po["T1"] == {"funkcje_eaz_zasilane": ["51", "50"]}
    assert po["T2"] == {} and po["T3"] == {}
    # Napęd jest atrybutem łącznika, nie powiązaniem funkcji — zestaw funkcji go nie zdejmuje.
    assert po["Q1"] == {"naped": "ZASOBNIKOWY_RECZNY"}
    zmien_pole(enm, rekord["ref_id"], protection_codes=[])
    po = _powiazania(_po_ref(enm, rekord["ref_id"]))
    assert po["Q0"] == {"naped": "SILNIKOWY"} and po["Q1"] == {"naped": "ZASOBNIKOWY_RECZNY"}


def test_budowa_gpz_niesie_powiazania_szablonu_domyslnego():
    """Pole liniowe GPZ zbudowane operacją GPZ (pisarz `dodaj_pole`) ma powiązania szablonu,
    który budowa mu nadała — bez osobnego zapisu wyposażenia."""
    enm = _gpz()
    rekord = _pole(enm)
    obwody = BAY_TEMPLATE_REGISTRY[rekord["bay_template_ref"]].obwody_wtorne
    assert obwody is not None
    assert _powiazania(rekord) == _oczekiwane(
        obwody, rekord["primary_devices"], rekord["protection_codes"]
    )
    assert _powiazania(rekord)["Q0"]["naped"] == "SILNIKOWY"


def test_zmiana_szablonu_i_usuniecie_wyposazenia_zdejmuja_powiazania():
    enm = _z_szablonu(_gpz(), Z11_1)
    po_z10 = _pole(_z_szablonu(enm, Z10))
    assert "T3" not in _powiazania(po_z10)
    obwody_z10 = BAY_TEMPLATE_REGISTRY[Z10].obwody_wtorne
    assert obwody_z10 is not None
    assert _powiazania(po_z10) == _oczekiwane(
        obwody_z10, po_z10["primary_devices"], po_z10["protection_codes"]
    )
    pole = _pole(enm)
    pusty = _po_ref(
        ok(op(enm, "set_bay_equipment", {"bay_ref": pole["ref_id"], "mode": "wyczysc"})),
        pole["ref_id"],
    )
    assert pusty["primary_devices"] == []


SZABLONY_BEZ_OBWODOW = {
    "OUT": "bay_template_line_out",
    "IN": "bay_template_line_in",
    "TR": "bay_template_transformer",
    "MEASUREMENT": "bay_template_measurement",
}


def test_pola_bez_obwodow_wzorca_nie_maja_powiazan():
    """Szablony bez obwodów wtórnych wzorca (pole liniowe ogólne, zasilające, transformatorowe,
    pomiaru napięcia) — żaden aparat nie dostaje powiązań (bez domysłu z oznaczenia Q0/T1),
    a pole liniowe przełączone z Z.11.1 na szablon ogólny traci dawne powiązania."""
    enm = _z_szablonu(_gpz(), Z11_1)
    stacja = next(s for s in enm["substations"] if s.get("gpz_sections"))
    for rola in ("IN", "TR", "MEASUREMENT"):
        wynik = op(
            enm,
            "add_sn_bay",
            {
                "station_ref": stacja["ref_id"],
                "bus_ref": stacja["gpz_sections"][0]["bus_ref"],
                "bay_role": rola,
                "apparatus_kind": "BREAKER",
                "catalog_binding": {"catalog_namespace": "APARAT_SN", "catalog_item_id": APARAT},
            },
        )
        enm = ok(wynik)
    for pole in list(enm["bays"]):
        szablon_id = SZABLONY_BEZ_OBWODOW[pole["bay_role"]]
        assert BAY_TEMPLATE_REGISTRY[szablon_id].obwody_wtorne is None
        enm = ok(
            op(
                enm,
                "set_bay_equipment",
                {"bay_ref": pole["ref_id"], "mode": "szablon", "bay_template_ref": szablon_id},
            )
        )
    assert {b["bay_role"] for b in enm["bays"]} == set(SZABLONY_BEZ_OBWODOW)
    # Negatyw ma treść: wśród pól są wyłączniki i przekładniki (rodzaje, które wzorzec wiąże).
    rodzaje = {a["kind"] for b in enm["bays"] for a in b["primary_devices"]}
    assert {"CB", "CT", "VT"} <= rodzaje, rodzaje
    for b in enm["bays"]:
        assert b["primary_devices"], b["ref_id"]
        for a in b["primary_devices"]:
            assert not any(a.get(k) for k in POLA_POWIAZAN_APARATU), (b["ref_id"], a)


def test_funkcja_czysta_i_deterministyczna():
    obwody = BAY_TEMPLATE_REGISTRY[Z11_1].obwody_wtorne
    rekord = _pole(_z_szablonu(_gpz(), Z11_1))
    wejscie = copy.deepcopy(rekord["primary_devices"])
    kody = rekord["protection_codes"]
    pierwszy = powiazania_aparatow_pola(wejscie, obwody, kody)
    assert wejscie == rekord["primary_devices"]  # wejście nietknięte
    assert powiazania_aparatow_pola(pierwszy, obwody, kody) == pierwszy  # idempotentna
    assert powiazania_aparatow_pola(wejscie, None, kody) == [
        {k: v for k, v in a.items() if k not in POLA_POWIAZAN_APARATU} for a in wejscie
    ]


@pytest.mark.parametrize(
    "kind,pole_powiazania,wartosc",
    [
        ("CT", "naped", "SILNIKOWY"),
        ("DS", "naped", "SILNIKOWY"),
        ("CT", "funkcje_eaz_wylaczajace", ["51"]),
        ("VT", "funkcje_eaz_wylaczajace", ["27"]),
        ("CB", "funkcje_eaz_zasilane", ["51"]),
        ("CABLE_HEAD", "funkcje_eaz_zasilane", ["67N"]),
        ("CT", "funkcje_eaz_zasilane", ["51", "51"]),
        ("CB", "funkcje_eaz_wylaczajace", ["51", "51"]),
    ],
)
def test_kontrakt_aparatu_odrzuca_powiazania_na_niewlasciwym_rodzaju(
    kind: str, pole_powiazania: str, wartosc: Any
):
    rekord = {
        "device_ref": "pole::dev::0",
        "symbol_ref": f"symbol:{kind.lower()}",
        "kind": kind,
        "placement": "MIDSTREAM",
        pole_powiazania: wartosc,
    }
    with pytest.raises(ValidationError):
        BayPrimaryDevice.model_validate(rekord)


@pytest.mark.parametrize(
    "kind,pole_powiazania,wartosc",
    [
        ("CB", "naped", "SILNIKOWY"),
        ("CB", "funkcje_eaz_wylaczajace", ["51", "50"]),
        ("CT", "funkcje_eaz_zasilane", ["51"]),
        ("VT", "funkcje_eaz_zasilane", ["27"]),
        ("CORE_BALANCE_CT", "funkcje_eaz_zasilane", ["67N"]),
    ],
)
def test_kontrakt_aparatu_przyjmuje_powiazania_wlasciwego_rodzaju(
    kind: str, pole_powiazania: str, wartosc: Any
):
    rekord = {
        "device_ref": "pole::dev::0",
        "symbol_ref": f"symbol:{kind.lower()}",
        "kind": kind,
        "placement": "MIDSTREAM",
        pole_powiazania: wartosc,
    }
    assert getattr(BayPrimaryDevice.model_validate(rekord), pole_powiazania) == wartosc


def test_odcisk_modelu_bez_powiazan_jak_brak_pola_a_powiazania_sa_trescia():
    enm = _z_szablonu(_gpz(), Z11_1)
    bez = copy.deepcopy(enm)
    puste = copy.deepcopy(enm)
    for b in bez["bays"]:
        for a in b["primary_devices"]:
            for k in POLA_POWIAZAN_APARATU:
                a.pop(k, None)
    for b in puste["bays"]:
        for a in b["primary_devices"]:
            a["naped"] = None
            a["funkcje_eaz_zasilane"] = []
            a["funkcje_eaz_wylaczajace"] = []
    assert hash_migawki_enm(bez) == hash_migawki_enm(puste)
    assert hash_migawki_enm(enm) != hash_migawki_enm(puste)
    for klucz in POLA_POWIAZAN_APARATU:
        tylko = copy.deepcopy(puste)
        for b, zrodlowe in zip(tylko["bays"], enm["bays"], strict=True):
            for a, z in zip(b["primary_devices"], zrodlowe["primary_devices"], strict=True):
                if z.get(klucz):
                    a[klucz] = z[klucz]
        assert hash_migawki_enm(tylko) != hash_migawki_enm(puste), klucz
    # Determinizm: ta sama droga zapisu → ten sam odcisk.
    assert hash_migawki_enm(_z_szablonu(_gpz(), Z11_1)) == hash_migawki_enm(enm)
