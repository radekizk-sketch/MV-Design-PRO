"""Powiązania obwodów wtórnych wzorca pola: napęd łącznika na rekordzie aparatu
(`BayPrimaryDevice.naped` — wyłącznik Q0 silnikowy, łącznik trójpołożeniowy Q1 zasobnikowy
z obsługą ręczną, decyzja architekta 2026-10-30) oraz wiązania JEDYNEGO sterownika pola
(karta OCHRONA-JEDNO-ZRODLO, ADR-022): wejścia pomiarowe (`ProtectionAssignment.wejscia` —
rdzeń CT, przekładnik Ferrantiego, uzwojenie VT) i macierz wyzwoleń (funkcja → wyłącznik).
Schemat pola rysuje z nich połączenia przekaźnika z przekładnikami i wyłącznikiem.

Iloczyn cech: szablon (9: Z.10 / Z.11.1 / Z.11 × wykonanie łączników) × droga zapisu {budowa GPZ,
`set_bay_equipment` szablon, katalog z oznaczeniami wzorca, katalog z innym oznaczeniem
przekładnika, katalog bez przekładnika Ferrantiego, zmiana szablonu, usunięcie wyposażenia}.

Wyrocznie: (1) tabela odczytu rysunku Z.11.1 s.91 zapisana literalnie (kto mierzy z T1, T2, T3,
co działa na Q0); (2) wiązania przeliczone wprost z danych wzorca, ograniczone do funkcji,
które pole MA (funkcje sterownika — zestaw korygowany klasą pola, IRiESD II.4.5.4.2);
(3) PREDYKAT PARAMI z odczytem pola (`pole_liniowe_gpz._opis_wejscia`): dla funkcji pola odczyt
mówi „brak aparatu w polu" dokładnie wtedy, gdy sterownik nie wiąże funkcji z aparatem
o oznaczeniu wejścia; funkcja wzorca, której pole nie ma, nie wiąże żadnego aparatu.
"""

from __future__ import annotations

import copy
import itertools
from typing import Any

import pytest
from enm.hash import hash_migawki_enm
from enm.models import BayPrimaryDevice, EnergyNetworkModel, ENMDefaults, ENMHeader
from enm.pole_liniowe_gpz import _opis_wejscia
from enm.zabezpieczenie import (
    funkcje_wylaczajace_aparat,
    funkcje_zasilane_z_aparatu,
    kody_funkcji_pola,
    ref_aparatu_wyzwalanego,
    sterownik_pola,
)
from network_model.catalog.bay_templates import BAY_TEMPLATE_REGISTRY
from network_model.catalog.obwody_wtorne_pola import (
    POLA_POWIAZAN_APARATU,
    RODZAJ_APARATU_WEJSCIA,
    RODZAJE_WEJSCIA_POZA_POLEM,
    ObwodyWtornePola,
    napedy_aparatow_pola,
)
from pydantic import ValidationError

from tests.reference_networks.scena_geometrii_stacji import (
    dodaj_pole_gpz_z_szablonu,
    dodaj_pole_pomiaru_napiecia_z17,
)
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
        # Pole łącznika szyn (Z.12) łączy dwie sekcje — w rozdzielnicy o jednej sekcji jest
        # odmową `field.coupler_requires_two_sections` (decyzja architekta D3).
        "sections_count": 2 if BAY_TEMPLATE_REGISTRY[szablon_id].bay_role == "COUPLER" else 1,
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
        if a["kind"] == "CB" and "catalog_ref" not in wpis:
            # Pole Z.7/Z.12/Z.16 z szablonu: wyłącznik bez typu (wartość robocza szablonu);
            # tryb katalogowy wymaga pozycji — ta sama co wyłącznik pola liniowego kreatora.
            wpis["catalog_ref"] = APARAT
        if a["kind"] == "SURGE_ARRESTER" and "catalog_ref" not in wpis:
            wpis["catalog_ref"] = "arrester-abb-polim-d-17p5kv-10ka"
        if a["kind"] == "PHASE_TO_PHASE_VT" and "catalog_ref" not in wpis:
            # Z.16 s.96: przekładnik międzyfazowy SN/0,1 kl. 3P (rozładowanie baterii).
            wpis["catalog_ref"] = "vt_15kv_100v_3p_abb"
        if a["kind"] == "UNBALANCE_CT" and "catalog_ref" not in wpis:
            # Z.16 s.96: przekładnik niezrównoważenia między punktami gwiazd (jeden rdzeń).
            wpis["catalog_ref"] = "ct_50_1_0_5_5va_arteche"
        wpisy.append(wpis)
    return wpisy


def _z_szablonu_wg_roli(enm: dict[str, Any], szablon_id: str) -> tuple[dict[str, Any], str]:
    """Pole z szablonu ścieżką użytkownika: pole liniowe GPZ — wyposażenie pola liniowego
    z kreatora; szablon innej roli (Z.7, Z.12, Z.16) — nowe pole tej roli w sekcji 1
    (`add_sn_bay` + `set_bay_equipment`), bo szablon innej funkcji pola liniowego nie wyposaża
    (`bay_equipment.template_role_mismatch`)."""
    szablon = BAY_TEMPLATE_REGISTRY[szablon_id]
    if szablon.wykonanie_pola is not None:
        enm = _z_szablonu(enm, szablon_id)
        return enm, _pole(enm)["ref_id"]
    sekcja = _po_ref(enm, _pole(enm)["ref_id"])["gpz_section_id"]
    return dodaj_pole_gpz_z_szablonu(enm, sekcja, szablon)


def _zapis(enm: dict[str, Any], szablon_id: str, droga: str) -> tuple[dict[str, Any], str]:
    enm, ref = _z_szablonu_wg_roli(enm, szablon_id)
    if droga == "szablon":
        return enm, ref
    rekord = _po_ref(enm, ref)
    wpisy = _wpisy_katalogu(rekord)
    if droga == "katalog_inne_oznaczenie_t1":
        for w in wpisy:
            if w.get("designation") == "T1":
                w["designation"] = "T11"
    elif droga == "katalog_bez_t2":
        wpisy = [w for w in wpisy if w.get("designation") != "T2"]
    enm = ok(
        op(
            enm,
            "set_bay_equipment",
            {"bay_ref": rekord["ref_id"], "mode": "katalog", "devices": wpisy},
        )
    )
    return enm, ref


def _oczekiwane(
    obwody: ObwodyWtornePola, aparaty: list[dict[str, Any]], funkcje_pola: list[str]
) -> dict[str, dict[str, Any]]:
    """Wyrocznia z danych wzorca: oznaczenie aparatu → napęd, funkcje mierzące z aparatu
    (``zasilane``) i działające na niego (``wylaczajace``) — tylko funkcje pola."""
    wynik: dict[str, dict[str, Any]] = {
        str(a.get("designation")): {} for a in aparaty if a.get("designation")
    }
    rodzaj = {str(a.get("designation")): a["kind"] for a in aparaty if a.get("designation")}
    # Napęd: atrybut łącznika po oznaczeniu i rodzaju, niezależnie od funkcji pola.
    for n in obwody.napedy:
        if rodzaj.get(n.aparat) == n.rodzaj_aparatu:
            wynik[n.aparat]["naped"] = n.naped

    def _dopisz(oznaczenie: str, klucz: str, kod: str) -> None:
        lista = wynik[oznaczenie].setdefault(klucz, [])
        if kod not in lista:
            lista.append(kod)

    # Kolejność kodów = kolejność funkcji sterownika (zestaw pola), nie kolejność rysunku.
    for kod in funkcje_pola:
        for p in obwody.powiazania:
            if p.funkcja != kod:
                continue
            if p.wylacznik is not None and rodzaj.get(p.wylacznik) == "CB":
                _dopisz(p.wylacznik, "wylaczajace", kod)
            for w in p.wejscia:
                if w.rodzaj in RODZAJE_WEJSCIA_POZA_POLEM:
                    # Przekładnik w gałęzi rezystora punktu neutralnego (Z.14, Z.15) leży poza
                    # celą pola — nie ma aparatu pola do związania.
                    continue
                if (
                    w.aparat is not None
                    and rodzaj.get(w.aparat) == RODZAJ_APARATU_WEJSCIA[w.rodzaj]
                ):
                    _dopisz(w.aparat, "zasilane", kod)
    return wynik


def _powiazania(enm: dict[str, Any], rekord: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Odczyt modelu: napęd z rekordu aparatu, funkcje z JEDYNEGO sterownika pola."""
    sterownik = sterownik_pola(enm, rekord["ref_id"]) or {}
    wynik: dict[str, dict[str, Any]] = {}
    for a in rekord["primary_devices"]:
        if not a.get("designation"):
            continue
        pola = {k: a[k] for k in POLA_POWIAZAN_APARATU if a.get(k)}
        zasilane = funkcje_zasilane_z_aparatu(sterownik, a["device_ref"])
        wylaczajace = funkcje_wylaczajace_aparat(sterownik, ref_aparatu_wyzwalanego(a))
        if zasilane:
            pola["zasilane"] = zasilane
        if wylaczajace:
            pola["wylaczajace"] = wylaczajace
        wynik[str(a["designation"])] = pola
    return wynik


@pytest.mark.parametrize("szablon_id,droga", list(itertools.product(SZABLONY, DROGI)))
def test_powiazania_aparatow_wg_wzorca_i_predykat_parami_z_odczytem(szablon_id: str, droga: str):
    enm, ref = _zapis(_gpz(szablon_id), szablon_id, droga)
    rekord = _po_ref(enm, ref)
    obwody = BAY_TEMPLATE_REGISTRY[szablon_id].obwody_wtorne
    assert obwody is not None
    kody = kody_funkcji_pola(enm, rekord["ref_id"])
    assert kody, (szablon_id, droga)
    assert _powiazania(enm, rekord) == _oczekiwane(obwody, rekord["primary_devices"], kody)
    # Każdy rekord przechodzi kontrakt aparatu.
    for a in rekord["primary_devices"]:
        BayPrimaryDevice.model_validate(a)
    # Predykat parami: odczyt pola i wiązania sterownika z JEDNEJ reguły dopasowania.
    sterownik = sterownik_pola(enm, rekord["ref_id"])
    aparaty = {str(a["designation"]): a for a in rekord["primary_devices"] if a.get("designation")}
    for p in obwody.powiazania:
        if p.funkcja not in kody:
            # Funkcja wzorca, której pole nie ma (korekta klasą pola) — nie wiąże aparatu.
            for a in rekord["primary_devices"]:
                assert p.funkcja not in funkcje_zasilane_z_aparatu(sterownik, a["device_ref"])
                assert p.funkcja not in funkcje_wylaczajace_aparat(
                    sterownik, ref_aparatu_wyzwalanego(a)
                )
            continue
        for w in p.wejscia:
            if w.aparat is None:
                continue
            if w.rodzaj in RODZAJE_WEJSCIA_POZA_POLEM:
                # Odczyt opisuje przekładnik z nośnika punktu neutralnego, nigdy „brak aparatu".
                opis = _opis_wejscia(w, aparaty)
                assert "poza polem" in opis and "brak aparatu" not in opis, (droga, opis)
                continue
            brak = "brak aparatu w polu" in _opis_wejscia(w, aparaty)
            aparat = aparaty.get(w.aparat)
            zasilane = funkcje_zasilane_z_aparatu(sterownik, aparat["device_ref"]) if aparat else []
            assert brak is (p.funkcja not in zasilane), (droga, p.funkcja, w.aparat)
    if droga == "katalog_inne_oznaczenie_t1":
        t11 = next(a for a in rekord["primary_devices"] if a.get("designation") == "T11")
        assert funkcje_zasilane_z_aparatu(sterownik, t11["device_ref"]) == []
        assert "ct_ref" not in sterownik["wejscia"]
    if droga == "katalog_bez_t2":
        assert all(a["kind"] != "CORE_BALANCE_CT" for a in rekord["primary_devices"])
        assert sterownik["wejscia"].get("i0_uklad") != "FERRANTI"


#: Tabela odczytu rysunku ENEA Z.11.1 s.91 (`docs/uiux/UX04_POLE_LINIOWE_WZORZEC.md` §9.3),
#: zapisana literalnie: co działa na Q0 i kto mierzy z T1, T2, T3. 51N to kryterium prądowe Io
#: bloku „Zab. ziemnozwarciowe t1, t2" z przekładnika Ferrantiego T2 (czerwona linia z zacisku 2
#: rysunku; uwaga sesji głównej 2026-10-29 pkt 4, §11.9) — w polu BEZ warunku źródła 3U₀.
#: Kolejność kodów — kolejność funkcji sterownika pola (zestaw szablonu).
TABELA_Z11_1_WYLACZAJACE_Q0 = {
    "51", "50", "51N", "67N", "50BF", "79", "SCO",
    "27", "59", "81U", "81O", "81R", "NZ", "SPZE", "OWG",
}  # fmt: skip
TABELA_Z11_1_ZASILANE = {
    "T1": {"51", "50", "ZS", "50BF", "67"},
    "T2": {"51N", "67N"},
    "T3": {"67", "27", "59", "81U", "81O", "81R", "NZ"},
}


@pytest.mark.parametrize("zrodlo_u0", [False, True], ids=["bez_zrodla_u0", "zrodlo_u0_z17"])
def test_tabela_rysunku_z11_1(zrodlo_u0: bool):
    """Wyrocznia literalna z rysunku s.91: pole liniowe z klasą pola niesie tabelę ograniczoną
    do SWOICH funkcji (funkcje sterownika — w polu klasy mieszanej bez SCO, IRiESD
    II.4.5.4.2). Decyzja właściciela 2026-10-29 pkt 4: 67N (i jego wejście z przekładnika
    Ferrantiego T2) pole ma WYŁĄCZNIE z potwierdzonym źródłem 3U₀ — przekładnikiem pola pomiaru
    napięcia Z.17 sekcji powiązanym w modelu; bez niego T2 zasila wyłącznie 51N (kryterium
    prądowe Io, bez warunku — uwaga sesji głównej pkt 4)."""
    obwody = BAY_TEMPLATE_REGISTRY[Z11_1].obwody_wtorne
    assert obwody is not None
    # Wzorzec rysunku = tabela 1:1 (wszystkie funkcje rysunku, bez korekty klasą pola).
    wzorzec_q0 = {p.funkcja for p in obwody.powiazania if p.wylacznik == "Q0"}
    assert wzorzec_q0 == TABELA_Z11_1_WYLACZAJACE_Q0
    for oznaczenie, kody in TABELA_Z11_1_ZASILANE.items():
        assert {
            p.funkcja for p in obwody.powiazania for w in p.wejscia if w.aparat == oznaczenie
        } == kody, oznaczenie
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
    kody_pola = kody_funkcji_pola(enm, rekord["ref_id"])
    # Pole klasy mieszanej: zestaw bez SCO — funkcja rysunku, której pole nie ma, nie wiąże Q0.
    assert "SCO" not in kody_pola and "SCO" in TABELA_Z11_1_WYLACZAJACE_Q0
    p = _powiazania(enm, rekord)
    assert p["Q0"]["naped"] == "SILNIKOWY"
    assert set(p["Q0"]["wylaczajace"]) == TABELA_Z11_1_WYLACZAJACE_Q0 & set(kody_pola)
    assert ("67N" in kody_pola) is zrodlo_u0
    for oznaczenie, kody in TABELA_Z11_1_ZASILANE.items():
        assert set(p[oznaczenie].get("zasilane", [])) == kody & set(kody_pola), oznaczenie
    assert p["T2"] == {"zasilane": ["51N", "67N"] if zrodlo_u0 else ["51N"]}
    # Łącznik trójpołożeniowy Q1: znak napędu (kwadrat na sprzężeniu, obsługa ręczna) na s.91;
    # odłącznik z uziemieniem Q5 odgałęzienia przekładnika napięciowego — bez znaku napędu.
    assert p["Q1"] == {"naped": "ZASOBNIKOWY_RECZNY"}
    for oznaczenie in ("PF0", "Q5", "GK1", "PF1", "GK"):
        assert p[oznaczenie] == {}


def test_zmiana_zestawu_funkcji_pola_przelicza_powiazania():
    """Predykat parami (zestaw funkcji sterownika × wiązania): zmiana zestawu funkcji pisarzem
    `zmien_pole` bez zmiany aparatów przelicza wiersze macierzy wyzwoleń (iniekcja: przeliczanie
    tylko przy zmianie aparatów zostawia Q0 wyłączany funkcją, której pole już nie ma)."""
    from enm.pola import zmien_pole

    enm = _z_szablonu(_gpz(), Z11_1)
    rekord = _pole(enm)
    zmien_pole(enm, rekord["ref_id"], funkcje_eaz=["51", "50"])
    po = _powiazania(enm, _po_ref(enm, rekord["ref_id"]))
    assert po["Q0"] == {"naped": "SILNIKOWY", "wylaczajace": ["51", "50"]}
    assert po["T1"] == {"zasilane": ["51", "50"]}
    assert po["T2"] == {} and po["T3"] == {}
    sterownik = sterownik_pola(enm, rekord["ref_id"])
    assert {w["funkcja_ref"] for w in sterownik["macierz_wyzwolen"]} == {"51", "50"}
    # Napęd jest atrybutem łącznika, nie powiązaniem funkcji — zestaw funkcji go nie zdejmuje.
    assert po["Q1"] == {"naped": "ZASOBNIKOWY_RECZNY"}
    zmien_pole(enm, rekord["ref_id"], funkcje_eaz=[])
    po = _powiazania(enm, _po_ref(enm, rekord["ref_id"]))
    assert po["Q0"] == {"naped": "SILNIKOWY"} and po["Q1"] == {"naped": "ZASOBNIKOWY_RECZNY"}
    assert sterownik_pola(enm, rekord["ref_id"])["macierz_wyzwolen"] == []


def test_budowa_gpz_niesie_powiazania_szablonu_domyslnego():
    """Pole liniowe GPZ zbudowane operacją GPZ (pisarz `dodaj_pole`) ma sterownik z wiązaniami
    szablonu, który budowa mu nadała — bez osobnego zapisu wyposażenia."""
    enm = _gpz()
    rekord = _pole(enm)
    obwody = BAY_TEMPLATE_REGISTRY[rekord["bay_template_ref"]].obwody_wtorne
    assert obwody is not None
    kody = kody_funkcji_pola(enm, rekord["ref_id"])
    assert _powiazania(enm, rekord) == _oczekiwane(obwody, rekord["primary_devices"], kody)
    assert _powiazania(enm, rekord)["Q0"]["naped"] == "SILNIKOWY"


def test_zmiana_szablonu_przepina_wejscia_na_aparaty_wlasciwego_rodzaju():
    """Regresja (karta OCHRONA-JEDNO-ZRODLO): identyfikator aparatu pola wynika z numeru
    kolejnego (``…::dev::N``), więc po zmianie szablonu ten sam identyfikator wskazuje INNY
    aparat. Wcześniejsze wiązanie wejścia, które teraz wskazuje aparat innego rodzaju (rdzeń
    CT → wyłącznik), nie zostaje: pisarz stosuje tę samą regułę rodzaju wejścia co walidator
    modelu (`RODZAJE_WEJSCIA_STEROWNIKA`). Iniekcja: zachowanie wiązania po samym istnieniu
    identyfikatora daje ``ct_ref`` = wyłącznik Q0."""
    from enm.zabezpieczenie import RODZAJE_WEJSCIA_STEROWNIKA, naruszenia_referencji_sterownika

    # Zmiana szablonu TEGO SAMEGO pola liniowego — szablon innej funkcji pola (Z.7, Z.12, Z.13–Z.16)
    # pola liniowego nie wyposaża (`bay_equipment.template_role_mismatch`); ten sam predykat co
    # droga zapisu `_z_szablonu_wg_roli`.
    for szablon_id in [s for s in SZABLONY if BAY_TEMPLATE_REGISTRY[s].wykonanie_pola is not None]:
        enm = _z_szablonu(_gpz(), szablon_id)
        rekord = _pole(enm)
        sterownik = sterownik_pola(enm, rekord["ref_id"])
        rodzaj = {a["device_ref"]: a["kind"] for a in rekord["primary_devices"]}
        for klucz, dopuszczone in RODZAJE_WEJSCIA_STEROWNIKA.items():
            wartosc = sterownik["wejscia"].get(klucz)
            for ref in wartosc if isinstance(wartosc, list) else [wartosc] if wartosc else []:
                assert rodzaj[ref] in dopuszczone, (szablon_id, klucz, rodzaj[ref])
        assert naruszenia_referencji_sterownika(enm, sterownik) == [], szablon_id


def test_zmiana_szablonu_i_usuniecie_wyposazenia_zdejmuja_powiazania():
    enm = _z_szablonu(_gpz(), Z11_1)
    po_z10_enm = _z_szablonu(enm, Z10)
    po_z10 = _pole(po_z10_enm)
    assert "T3" not in _powiazania(po_z10_enm, po_z10)
    obwody_z10 = BAY_TEMPLATE_REGISTRY[Z10].obwody_wtorne
    assert obwody_z10 is not None
    assert _powiazania(po_z10_enm, po_z10) == _oczekiwane(
        obwody_z10, po_z10["primary_devices"], kody_funkcji_pola(po_z10_enm, po_z10["ref_id"])
    )
    pole = _pole(enm)
    po_wyczyszczeniu = ok(
        op(enm, "set_bay_equipment", {"bay_ref": pole["ref_id"], "mode": "wyczysc"})
    )
    pusty = _po_ref(po_wyczyszczeniu, pole["ref_id"])
    assert pusty["primary_devices"] == []
    sterownik = sterownik_pola(po_wyczyszczeniu, pole["ref_id"])
    # Bez aparatów sterownik nie wiąże ani przekładnika, ani wyłącznika.
    assert sterownik is None or (
        sterownik["macierz_wyzwolen"] == []
        and not any(k.endswith("_ref") or k.endswith("_refs") for k in sterownik["wejscia"])
    )


SZABLONY_BEZ_OBWODOW = {
    "OUT": "bay_template_line_out",
    "IN": "bay_template_line_in",
    "TR": "bay_template_transformer",
    "MEASUREMENT": "bay_template_measurement",
}


def test_pola_bez_obwodow_wzorca_nie_maja_napedow_wzorca():
    """Szablony bez obwodów wtórnych wzorca (pole liniowe ogólne, zasilające, transformatorowe,
    pomiaru napięcia) — żaden aparat nie dostaje napędu wzorca (bez domysłu z oznaczenia Q0),
    a pole liniowe przełączone z Z.11.1 na szablon ogólny traci dawny napęd."""
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
    pierwszy = napedy_aparatow_pola(wejscie, obwody)
    assert wejscie == rekord["primary_devices"]  # wejście nietknięte
    assert napedy_aparatow_pola(pierwszy, obwody) == pierwszy  # idempotentna
    assert napedy_aparatow_pola(wejscie, None) == [
        {k: v for k, v in a.items() if k not in POLA_POWIAZAN_APARATU} for a in wejscie
    ]


@pytest.mark.parametrize("kind", ["CT", "DS", "VT", "CABLE_HEAD"])
def test_kontrakt_aparatu_odrzuca_naped_na_niewlasciwym_rodzaju(kind: str):
    rekord = {
        "device_ref": "pole::dev::0",
        "symbol_ref": f"symbol:{kind.lower()}",
        "kind": kind,
        "placement": "MIDSTREAM",
        "naped": "SILNIKOWY",
    }
    with pytest.raises(ValidationError):
        BayPrimaryDevice.model_validate(rekord)


@pytest.mark.parametrize("pole_dawne", ["funkcje_eaz_zasilane", "funkcje_eaz_wylaczajace"])
def test_kontrakt_aparatu_nie_ma_dawnych_powiazan_funkcji(pole_dawne: str):
    """Druga struktura skasowana (ADR-022, karta OCHRONA-JEDNO-ZRODLO): aparat pola nie niesie
    powiązań funkcji — niesie je sterownik. Dawne pole nie trafia do rekordu."""
    assert pole_dawne not in BayPrimaryDevice.model_fields
    rekord = {
        "device_ref": "pole::dev::0",
        "symbol_ref": "symbol:cb",
        "kind": "CB",
        "placement": "MIDSTREAM",
        pole_dawne: ["51"],
    }
    assert pole_dawne not in BayPrimaryDevice.model_validate(rekord).model_dump()


def test_kontrakt_aparatu_przyjmuje_naped_wylacznika():
    rekord = {
        "device_ref": "pole::dev::0",
        "symbol_ref": "symbol:cb",
        "kind": "CB",
        "placement": "MIDSTREAM",
        "naped": "SILNIKOWY",
    }
    assert BayPrimaryDevice.model_validate(rekord).naped == "SILNIKOWY"


def test_odcisk_modelu_bez_napedu_jak_brak_pola_a_naped_i_sterownik_sa_trescia():
    enm = _z_szablonu(_gpz(), Z11_1)
    bez = copy.deepcopy(enm)
    puste = copy.deepcopy(enm)
    for b in bez["bays"]:
        for a in b["primary_devices"]:
            a.pop("naped", None)
    for b in puste["bays"]:
        for a in b["primary_devices"]:
            a["naped"] = None
    assert hash_migawki_enm(bez) == hash_migawki_enm(puste)
    assert hash_migawki_enm(enm) != hash_migawki_enm(puste)
    # Wiązanie sterownika jest treścią modelu.
    inny = copy.deepcopy(enm)
    inny["protection_assignments"][0]["macierz_wyzwolen"] = []
    assert hash_migawki_enm(inny) != hash_migawki_enm(enm)
    # Determinizm: ta sama droga zapisu → ten sam odcisk.
    assert hash_migawki_enm(_z_szablonu(_gpz(), Z11_1)) == hash_migawki_enm(enm)


@pytest.mark.parametrize(
    "klucz,rodzaj_obcy",
    [
        ("ct_ref", "CB"),
        ("ct_ref", "VT"),
        ("i0_ct_ref", "CT"),
        ("vt_ref", "CT"),
        ("vt_ref", "CORE_BALANCE_CT"),
    ],
)
def test_wejscie_na_aparacie_innego_rodzaju_jest_naruszeniem_i_wraca_z_wzorca(
    klucz: str, rodzaj_obcy: str
):
    """Predykat parami (walidator × pisarz): wejście sterownika wskazujące aparat pola innego
    rodzaju niż dopuszczony dla wejścia (`RODZAJE_WEJSCIA_STEROWNIKA`) jest naruszeniem modelu
    i pisarz z szablonu go nie zachowuje — przy KAŻDEJ zmianie zestawu funkcji, nie tylko przy
    wymianie aparatów (iniekcja: reguła samego istnienia identyfikatora zostawia wejście)."""
    from enm.pola import zmien_pole
    from enm.zabezpieczenie import NARUSZENIE_PRZEKLADNIK, naruszenia_referencji_sterownika

    enm = _z_szablonu(_gpz(), Z11_1)
    rekord = _pole(enm)
    obcy = next(a for a in rekord["primary_devices"] if a["kind"] == rodzaj_obcy)
    sterownik = sterownik_pola(enm, rekord["ref_id"])
    poprawne = dict(sterownik["wejscia"])
    sterownik["wejscia"][klucz] = obcy["device_ref"]
    if klucz == "i0_ct_ref":
        sterownik["wejscia"]["i0_uklad"] = "FERRANTI"
    naruszenia = naruszenia_referencji_sterownika(enm, sterownik)
    assert [(n[0], n[2]) for n in naruszenia] == [(NARUSZENIE_PRZEKLADNIK, obcy["device_ref"])]
    assert "innego rodzaju" in naruszenia[0][1]
    zmien_pole(enm, rekord["ref_id"], funkcje_eaz=kody_funkcji_pola(enm, rekord["ref_id"]))
    po = sterownik_pola(enm, rekord["ref_id"])
    assert po["wejscia"] == poprawne
    assert naruszenia_referencji_sterownika(enm, po) == []
