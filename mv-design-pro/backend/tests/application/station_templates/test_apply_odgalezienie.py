"""Przyłączenie stacji z szablonu: odgałęzienie vs wcięcie przelotowe.

Karta POMIAR-ODGAŁĘZIENIE (etap 2 kontraktu
`docs/domain/POMIAR_ROZLICZENIOWY_SN_V1.md`, rejestr V12K-333; korekta
właściciela: „klienci mają stacje i pomiary w odgałęzieniu od toru").

ZASADA SPRAWDZANA: układ pomiarowo-rozliczeniowy odbiorcy SN mierzy CAŁY i TYLKO
pobór tego odbiorcy, więc tranzyt magistrali OSD NIE MOŻE przechodzić przez
rozdzielnicę klienta. Konsekwencja topologiczna: stacja abonencka (klasa B) wisi
w ODGAŁĘZIENIU, a nie jest wcięta w tor.

Testy są ILOCZYNEM CECH (reguła KLASA, NIE INSTANCJA), a nie przykładem z karty:

    {klasa A (bez pomiaru), klasa B (pomiar, dopływ), klasa C (pomiar, pętla OSD)}
  × {aplikacja na segment MAGISTRALI, aplikacja na segment ODGAŁĘZIENIA}

plus pin grafowy tranzytu, pin kolejności pól, pin roli pola pomiarowego na OBU
drogach zabudowy i pin determinizmu.
"""

from __future__ import annotations

import collections
import copy
import json
from typing import Any

import pytest
from application.station_templates import get_template, list_templates
from application.station_templates.apply import (
    TemplateApplyError,
    _klasa_przylaczenia,
    _ref_wyboru,
    _resolve_sn_bay_roles,
    _resolve_sn_field_specs,
    _resolve_station_type,
    _resolve_transformer_ref_for_template,
    _szyna_nn_stacji,
    _transformer_lv_voltage_kv,
    _zabuduj_stacje_w_odgalezieniu,
)
from enm.domain_operations import execute_domain_operation
from enm.hash import compute_enm_hash
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader

#: Szablony reprezentujące trzy klasy przyłączenia kontraktu §3.
SZABLON_KLASY_A = "tpl_sn_nn_630kva"  # dystrybucyjna OSD: IN, OUT, TR
SZABLON_KLASY_B = "tpl_sn_nn_1000kva"  # abonencka: IN, POMIAR, TR, rezerwa
SZABLON_KLASY_B_PRZEMYSL = "tpl_przemyslowa_1mva_4odplywy"
SZABLON_KLASY_C = "tpl_zksn_3pole_1000kva"  # złącze ZK-SN: IN, OUT, POMIAR, TR


def _wykonaj(enm: dict[str, Any], op_name: str, payload: dict[str, Any]) -> dict[str, Any]:
    wynik = execute_domain_operation(enm_dict=enm, op_name=op_name, payload=payload)
    assert not wynik.get("error"), f"{op_name}: {wynik.get('error_code')} {wynik.get('error')}"
    return wynik


def _binding(namespace: str, item_id: str) -> dict[str, Any]:
    return {
        "catalog_namespace": namespace,
        "catalog_item_id": item_id,
        "catalog_item_version": "2024.1",
    }


def _pusty_enm() -> dict[str, Any]:
    """Pusty model przez KONTRAKT (`EnergyNetworkModel`), nie ręcznie sklejony
    słownik — inaczej migawka nie przechodzi własnej walidacji i pin determinizmu
    (liczony na zwalidowanym modelu) nie miałby czego liczyć."""
    return EnergyNetworkModel(
        header=ENMHeader(name="POMIAR-ODG", defaults=ENMDefaults(sn_nominal_kv=15.0)),
    ).model_dump(mode="json")


def _magistrala(liczba_odcinkow: int = 3) -> tuple[dict[str, Any], list[str]]:
    """GPZ + N odcinków magistrali kablowej. Zwraca (ENM, refy odcinków)."""
    enm = _wykonaj(
        _pusty_enm(),
        "add_grid_source_sn",
        {
            "voltage_kv": 15.0,
            "sk3_mva": 250.0,
            "rx_ratio": 0.1,
            "catalog_binding": _binding("ZRODLO_SN", "src-gpz-15kv-250mva-rx010"),
        },
    )["snapshot"]
    odcinki: list[str] = []
    for i in range(liczba_odcinkow):
        enm = _wykonaj(
            enm,
            "continue_trunk_segment_sn",
            {
                "segment": {
                    "rodzaj": "KABEL",
                    "dlugosc_m": 500 + 50 * i,
                    "name": f"Odcinek {i + 1}",
                    "catalog_binding": _binding("KABEL_SN", "cable-tfk-yakxs-3x120"),
                }
            },
        )["snapshot"]
        odcinki.append(enm["corridors"][0]["ordered_segment_refs"][-1])
    return enm, odcinki


def _zastosuj_szablon(
    enm: dict[str, Any],
    template_id: str,
    segment_ref: str,
    *,
    overrides: dict[str, Any] | None = None,
    insert_at_ratio: float = 0.5,
) -> dict[str, Any]:
    """Ta sama logika wyboru drogi, co `_zastosuj_szablon_pod_blokada` (krok 1).

    Odtworzona bez magazynu ENM i bez blokady przypadku — testujemy REGUŁĘ
    wyboru drogi zabudowy, a nie warstwę trwałości.
    """
    overrides = overrides or {}
    template = get_template(template_id)
    assert template is not None, template_id
    liczba_pol = int(overrides.get("sn_bays_count", template.schema.sn_bays_count.default))
    role = _resolve_sn_bay_roles(template, liczba_pol)
    specyfikacje = _resolve_sn_field_specs(
        template, bay_roles=role, overrides=overrides, catalog_profile=None
    )
    transformator = _resolve_transformer_ref_for_template(
        template, overrides=overrides, catalog_profile=None
    )
    nn_kv = _transformer_lv_voltage_kv(transformator) or 0.4
    station_spec = {"name_pl": template.name_pl, "sn_voltage_kv": 15, "nn_voltage_kv": nn_kv}
    transformer_spec = {"transformer_catalog_ref": transformator}
    nn_block = {"outgoing_feeders_nn_count": 2, "outgoing_feeders_nn": []}
    klasa = _klasa_przylaczenia(role)
    dziennik: list[dict[str, Any]] = []

    if klasa == "B":
        enm_po, station_ref, nn_bus_ref, created = _zabuduj_stacje_w_odgalezieniu(
            enm_dict=enm,
            template=template,
            target_segment_id=segment_ref,
            insert_at_ratio=insert_at_ratio,
            overrides=overrides,
            station_spec=station_spec,
            transformer_spec=transformer_spec,
            sn_field_specs=specyfikacje,
            nn_block_spec=nn_block,
            operations_log=dziennik,
        )
    else:
        wynik = _wykonaj(
            enm,
            "insert_station_on_segment_sn",
            {
                "segment_id": segment_ref,
                "insert_at": {"mode": "RATIO", "value": insert_at_ratio},
                "station": {**station_spec, "station_type": _resolve_station_type(template)},
                "transformer": transformer_spec,
                "sn_fields": specyfikacje,
                "nn_block": nn_block,
            },
        )
        enm_po = wynik["snapshot"]
        station_ref = _ref_wyboru(wynik)
        nn_bus_ref = _szyna_nn_stacji(enm_po, station_ref, nn_kv)
        created = (wynik.get("changes") or {}).get("created_element_ids") or []
        dziennik.append({"op": "insert_station_on_segment_sn", "created": created})

    return {
        "enm": enm_po,
        "klasa": klasa,
        "role": role,
        "station_ref": station_ref,
        "nn_bus_ref": nn_bus_ref,
        "created": created,
        "operations_log": dziennik,
    }


def _szyna_sn_stacji(enm: dict[str, Any], station_ref: str, nn_bus_ref: str | None) -> str:
    substation = next(s for s in enm["substations"] if s["ref_id"] == station_ref)
    szyny = [ref for ref in substation["bus_refs"] if ref != nn_bus_ref]
    assert szyny, f"Stacja {station_ref} bez szyny SN"
    return szyny[0]


def _sciezka_zasilania(enm: dict[str, Any], cel_bus: str) -> list[str]:
    """Najkrótsza ścieżka szyn od źródła GPZ do celu po ZAMKNIĘTYCH połączeniach.

    Graf obejmuje WSZYSTKIE zamknięte gałęzie (odcinki, aparaty pól, łączniki
    wewnętrzne punktów odgałęzienia) — czyli realną drogę prądu, a nie wybraną
    podklasę elementów. Węższy graf (tylko kable/linie) fałszowałby wynik: przy
    odgałęzieniu prąd przechodzi przez łącznik portu ZKSN, więc stacja klienta
    wyglądałaby na odciętą od sieci.
    """
    graf: dict[str, list[str]] = collections.defaultdict(list)
    for branch in enm["branches"]:
        if branch.get("status") == "open":
            continue
        if not branch.get("from_bus_ref") or not branch.get("to_bus_ref"):
            continue
        graf[branch["from_bus_ref"]].append(branch["to_bus_ref"])
        graf[branch["to_bus_ref"]].append(branch["from_bus_ref"])
    start = enm["sources"][0]["bus_ref"]
    kolejka = collections.deque([(start, [start])])
    odwiedzone = {start}
    while kolejka:
        wezel, sciezka = kolejka.popleft()
        if wezel == cel_bus:
            return sciezka
        for sasiad in graf[wezel]:
            if sasiad not in odwiedzone:
                odwiedzone.add(sasiad)
                kolejka.append((sasiad, sciezka + [sasiad]))
    raise AssertionError(f"Brak ścieżki zasilania do {cel_bus}")


def _role_pol_stacji(enm: dict[str, Any], station_ref: str) -> list[str]:
    """Role pól SN stacji W KOLEJNOŚCI Z DANYCH (`meta.field_specs`).

    To ta sama tablica, z której rysunek bierze kolejność pól
    (`buildStationMiniBaysFromFieldSpecs`, V12K-330).
    """
    substation = next(s for s in enm["substations"] if s["ref_id"] == station_ref)
    return [str(spec.get("bay_role")) for spec in (substation.get("meta") or {})["field_specs"]]


# ---------------------------------------------------------------------------
# Predykat klasy — z ról pól, nie z nazwy ani kategorii
# ---------------------------------------------------------------------------


def test_klasa_przylaczenia_wynika_z_rol_pol_a_nie_z_nazwy_szablonu() -> None:
    """Kontrakt §3: klasa czytana z zestawu ról, który zostanie ZBUDOWANY."""
    assert _klasa_przylaczenia(["IN", "OUT", "TR"]) == "A"
    assert _klasa_przylaczenia(["IN", "MEASUREMENT", "TR", "OUT"]) == "B"
    assert _klasa_przylaczenia(["IN", "MEASUREMENT"]) == "B"
    assert _klasa_przylaczenia(["IN", "OUT", "MEASUREMENT", "TR"]) == "C"


def test_kazdy_szablon_z_pomiarem_ma_rozstrzygnieta_klase_przylaczenia() -> None:
    """KLASA, nie instancja: KAŻDA rodzina szablonów z polem pomiarowym musi
    trafić do klasy B albo C — żadna nie może zostać stacją dystrybucyjną,
    bo to ona decyduje o drodze zabudowy (odgałęzienie vs wcięcie)."""
    zbadane = 0
    for template in list_templates():
        role = _resolve_sn_bay_roles(template, template.schema.sn_bays_count.default)
        if "MEASUREMENT" not in role:
            assert _klasa_przylaczenia(role) == "A"
            continue
        zbadane += 1
        assert _klasa_przylaczenia(role) in ("B", "C"), (
            f"Szablon '{template.id}' deklaruje pomiar rozliczeniowy, ale klasa "
            f"przyłączenia wyszła A ({role}) — zostałby wcięty w tranzyt."
        )
    assert zbadane >= 7, f"Test ma objąć wszystkie rodziny z pomiarem (objęte: {zbadane})"


# ---------------------------------------------------------------------------
# ILOCZYN CECH: {klasa A, B, C} × {magistrala, odgałęzienie}
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("template_id", "oczekiwana_klasa", "oczekiwana_droga"),
    [
        (SZABLON_KLASY_A, "A", "insert_station_on_segment_sn"),
        (SZABLON_KLASY_B, "B", "append_station_on_endpoint"),
        (SZABLON_KLASY_B_PRZEMYSL, "B", "append_station_on_endpoint"),
        (SZABLON_KLASY_C, "C", "insert_station_on_segment_sn"),
    ],
)
@pytest.mark.parametrize("na_odgalezieniu", [False, True])
def test_droga_zabudowy_zalezy_od_klasy_a_nie_od_rodzaju_odcinka(
    template_id: str,
    oczekiwana_klasa: str,
    oczekiwana_droga: str,
    na_odgalezieniu: bool,
) -> None:
    """Iloczyn cech {klasa} × {odcinek magistrali, odcinek odgałęzienia}.

    Zakaz kontraktu §1 dotyczy KAŻDEGO toru przesyłu, nie tylko magistrali —
    stacja abonencka nie może stać w szeregu także na odgałęzieniu (byłby to
    tranzyt do dalszych odbiorów przez rozdzielnicę klienta). Dlatego predykat
    drogi patrzy WYŁĄCZNIE na klasę szablonu.
    """
    enm, odcinki = _magistrala(3)
    if na_odgalezieniu:
        # Odgałęzienie powstaje realną drogą produkcyjną: klasa B na magistrali.
        wynik_bazowy = _zastosuj_szablon(enm, SZABLON_KLASY_B, odcinki[0])
        enm = wynik_bazowy["enm"]
        cel = next(b["ref_id"] for b in enm["branches"] if b["ref_id"].endswith("/branch_segment"))
    else:
        cel = odcinki[1]

    wynik = _zastosuj_szablon(enm, template_id, cel)
    assert wynik["klasa"] == oczekiwana_klasa
    wykonane = [wpis["op"] for wpis in wynik["operations_log"]]
    assert oczekiwana_droga in wykonane, f"Droga zabudowy {wykonane}"
    if oczekiwana_klasa == "B":
        assert "start_branch_segment_sn" in wykonane
        assert "insert_station_on_segment_sn" not in wykonane


# ---------------------------------------------------------------------------
# PIN: tranzyt magistrali nie przechodzi przez rozdzielnicę klienta
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("template_id", [SZABLON_KLASY_B, SZABLON_KLASY_B_PRZEMYSL])
def test_tranzyt_magistrali_nie_przechodzi_przez_rozdzielnice_klienta(template_id: str) -> None:
    """PIN kontraktu §1 — dowód GRAFOWY, nie deklaracja.

    Po zastosowaniu szablonu klasy B na odcinku magistrali ścieżka zasilania
    z GPZ do KOŃCA magistrali (za miejscem przyłączenia) nie może zawierać szyny
    SN stacji klienta. Iniekcja przywracająca wcięcie przelotowe dla klasy B
    wywala ten test.
    """
    enm, odcinki = _magistrala(3)
    wynik = _zastosuj_szablon(enm, template_id, odcinki[1])
    enm_po = wynik["enm"]

    szyna_klienta = _szyna_sn_stacji(enm_po, wynik["station_ref"], wynik["nn_bus_ref"])
    koniec_magistrali = next(
        b["to_bus_ref"] for b in enm_po["branches"] if b["ref_id"] == odcinki[2]
    )
    sciezka = _sciezka_zasilania(enm_po, koniec_magistrali)

    assert szyna_klienta not in sciezka, (
        "Tranzyt magistrali przechodzi przez szynę SN stacji klienta "
        f"({szyna_klienta}) — pomiar rozliczeniowy leżałby w torze tranzytu "
        f"(zakaz kontraktu §1). Ścieżka: {sciezka}"
    )
    # Ta sama szyna MUSI być zasilana z magistrali — inaczej „brak tranzytu"
    # oznaczałby po prostu stację odciętą od sieci.
    assert _sciezka_zasilania(enm_po, szyna_klienta), "Stacja klienta bez zasilania"


def test_stacja_dystrybucyjna_bez_pomiaru_zostaje_wcieta_w_tranzyt() -> None:
    """Druga strona pary: klasa A ma tranzyt PRZEZ szynę stacji — tak działa
    stacja przelotowa OSD i to zachowanie nie może zniknąć przy okazji naprawy."""
    enm, odcinki = _magistrala(3)
    wynik = _zastosuj_szablon(enm, SZABLON_KLASY_A, odcinki[1])
    enm_po = wynik["enm"]
    szyna_stacji = _szyna_sn_stacji(enm_po, wynik["station_ref"], wynik["nn_bus_ref"])
    koniec_magistrali = next(
        b["to_bus_ref"] for b in enm_po["branches"] if b["ref_id"] == odcinki[2]
    )
    assert szyna_stacji in _sciezka_zasilania(enm_po, koniec_magistrali)


def test_klasa_b_na_odgalezieniu_nie_wnosi_tranzytu_do_pierwszego_klienta() -> None:
    """Iloczyn cech {klasa B} × {odcinek odgałęzienia}: drugi klient wisi na
    WŁASNYM pod-odgałęzieniu, a droga do pierwszego klienta go nie dotyka."""
    enm, odcinki = _magistrala(3)
    pierwszy = _zastosuj_szablon(enm, SZABLON_KLASY_B, odcinki[1])
    enm_po = pierwszy["enm"]
    odcinek_galezi = next(
        b["ref_id"] for b in enm_po["branches"] if b["ref_id"].endswith("/branch_segment")
    )
    drugi = _zastosuj_szablon(enm_po, SZABLON_KLASY_B_PRZEMYSL, odcinek_galezi)

    szyna_pierwszego = _szyna_sn_stacji(
        drugi["enm"], pierwszy["station_ref"], pierwszy["nn_bus_ref"]
    )
    szyna_drugiego = _szyna_sn_stacji(drugi["enm"], drugi["station_ref"], drugi["nn_bus_ref"])
    assert szyna_drugiego not in _sciezka_zasilania(drugi["enm"], szyna_pierwszego)
    assert szyna_pierwszego not in _sciezka_zasilania(drugi["enm"], szyna_drugiego)


# ---------------------------------------------------------------------------
# PIN: pole pomiarowe istnieje i ma właściwą rolę na OBU drogach zabudowy
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("template_id", "oczekiwane_role"),
    [
        (SZABLON_KLASY_B, ["IN", "MEASUREMENT", "TR", "OUT"]),
        (SZABLON_KLASY_C, ["IN", "OUT", "MEASUREMENT", "TR"]),
    ],
)
def test_kolejnosc_pol_w_modelu_jest_kolejnoscia_z_szablonu(
    template_id: str, oczekiwane_role: list[str]
) -> None:
    """V12K-330: kolejność pól w modelu = kolejność deklaracji szablonu.

    Dla stacji abonenckiej daje to układ [dopływ, POMIAR, TR, rezerwa] — pomiar
    od strony dopływu gałęzi, tak jak wymaga kontrakt. Rysunek czyta tę samą
    tablicę, więc kolejność na schemacie jest tą samą kolejnością.
    """
    enm, odcinki = _magistrala(3)
    wynik = _zastosuj_szablon(enm, template_id, odcinki[1])
    assert _role_pol_stacji(wynik["enm"], wynik["station_ref"]) == oczekiwane_role


@pytest.mark.parametrize("template_id", [SZABLON_KLASY_B, SZABLON_KLASY_B_PRZEMYSL])
def test_pole_pomiarowe_ma_role_pomiarowa_a_nie_odplywowa(template_id: str) -> None:
    """Pole pomiarowe MUSI trafić do modelu z rolą MEASUREMENT.

    Dwa defekty tej samej klasy naprawione razem: wcięcie w odcinek zapisywało
    pomiar jako FEEDER (nie do odróżnienia od odgałęzienia), a stacja na końcu
    ciągu POMIJAŁA takie pole w całości. Oba słowniki ról były niepełne — teraz
    jest jeden.
    """
    enm, odcinki = _magistrala(3)
    wynik = _zastosuj_szablon(enm, template_id, odcinki[1])
    role = _role_pol_stacji(wynik["enm"], wynik["station_ref"])
    assert role.count("MEASUREMENT") == 1, f"Role pól: {role}"
    assert "FEEDER" not in role, f"Pomiar zapisany jako pole odpływowe: {role}"

    # Rekord Bay (read-model, zabezpieczenia, SLD) też zna rolę pomiarową.
    bays = [b for b in wynik["enm"]["bays"] if b.get("substation_ref") == wynik["station_ref"]]
    assert [b["bay_role"] for b in bays].count("MEASUREMENT") == 1, bays


def test_wciecie_w_odcinek_takze_zapisuje_pomiar_jako_pole_pomiarowe() -> None:
    """Druga droga zabudowy (klasa C — złącze ZK-SN z pętlą OSD) — ten sam pin.

    Bez tego przypadku naprawa dotyczyłaby INSTANCJI (jednej drogi), a nie klasy.
    """
    enm, odcinki = _magistrala(3)
    wynik = _zastosuj_szablon(enm, SZABLON_KLASY_C, odcinki[1])
    role = _role_pol_stacji(wynik["enm"], wynik["station_ref"])
    assert role.count("MEASUREMENT") == 1, f"Role pól złącza: {role}"


# ---------------------------------------------------------------------------
# Parametry odgałęzienia — jawne, bez zgadywania
# ---------------------------------------------------------------------------


def test_dlugosc_i_katalog_odgalezienia_pochodza_z_parametrow_projektanta() -> None:
    """Parametry jawne mają pierwszeństwo przed wzorcem kreatora."""
    enm, odcinki = _magistrala(3)
    wynik = _zastosuj_szablon(
        enm,
        SZABLON_KLASY_B,
        odcinki[1],
        overrides={
            "branch_length_m": 420,
            "branch_segment_catalog_ref": "cable-enea-operator-na2xs2y-1x240",
            "branch_point_catalog_ref": "RSN-12",
        },
    )
    odcinek = next(b for b in wynik["enm"]["branches"] if b["ref_id"].endswith("/branch_segment"))
    assert odcinek["length_km"] == pytest.approx(0.420)
    assert odcinek["catalog_ref"] == "cable-enea-operator-na2xs2y-1x240"
    punkt = next(bp for bp in wynik["enm"]["branch_points"])
    assert punkt["catalog_ref"] == "RSN-12"


def test_domyslny_typ_odcinka_galezi_pochodzi_z_odcinka_macierzystego() -> None:
    """Wzorzec kreatora odgałęzienia (`initial_catalog_ref` z odcinka źródła) —
    nie zaszyty typ kabla."""
    enm, odcinki = _magistrala(3)
    wynik = _zastosuj_szablon(enm, SZABLON_KLASY_B, odcinki[1])
    odcinek_galezi = next(
        b for b in wynik["enm"]["branches"] if b["ref_id"].endswith("/branch_segment")
    )
    odcinek_macierzysty_ref = odcinki[1]
    macierzysty = next(
        b
        for b in wynik["enm"]["branches"]
        if b["ref_id"].startswith(odcinek_macierzysty_ref.rsplit("/", 1)[0])
        and b.get("catalog_ref")
    )
    assert odcinek_galezi["catalog_ref"] == macierzysty["catalog_ref"]
    # Domyślna długość = wzorzec kreatora odgałęzienia (1 km).
    assert odcinek_galezi["length_km"] == pytest.approx(1.0)


def test_odcinek_bez_pozycji_katalogowej_konczy_sie_bledem_zamiast_domyslu() -> None:
    """Zero zgadywania: brak wiązania katalogowego odcinka macierzystego i brak
    wskazania projektanta ⇒ jawny błąd, nigdy podstawiony typ kabla."""
    enm, odcinki = _magistrala(3)
    enm_bez_katalogu = copy.deepcopy(enm)
    for branch in enm_bez_katalogu["branches"]:
        if branch["ref_id"] == odcinki[1]:
            branch.pop("catalog_ref", None)
    with pytest.raises(TemplateApplyError) as wyjatek:
        _zastosuj_szablon(enm_bez_katalogu, SZABLON_KLASY_B, odcinki[1])
    assert wyjatek.value.code == "template.branch_segment_catalog_missing"


def test_punkt_odgalezienia_pasuje_do_osrodka_odcinka_macierzystego() -> None:
    """Kabel ⇒ ZKSN, linia napowietrzna ⇒ słup rozgałęźny. Para wymuszona przez
    domenę; tu pilnujemy, że aplikacja szablonu jej nie łamie."""
    enm, odcinki = _magistrala(3)
    wynik = _zastosuj_szablon(enm, SZABLON_KLASY_B, odcinki[1])
    punkt = next(bp for bp in wynik["enm"]["branch_points"])
    assert punkt["branch_point_type"] == "zksn"
    assert punkt["catalog_ref"] == "RSN-6"


# ---------------------------------------------------------------------------
# Determinizm
# ---------------------------------------------------------------------------


def test_dwa_takie_same_zastosowania_daja_identyczny_model() -> None:
    """Reguła determinizmu: ten sam wejściowy model + ten sam szablon ⇒ ta sama
    migawka (identyczny hash), także na drodze odgałęzienia (trzy operacje
    domenowe łańcuchem)."""
    enm, odcinki = _magistrala(3)
    pierwszy = _zastosuj_szablon(copy.deepcopy(enm), SZABLON_KLASY_B, odcinki[1])
    drugi = _zastosuj_szablon(copy.deepcopy(enm), SZABLON_KLASY_B, odcinki[1])
    assert compute_enm_hash(EnergyNetworkModel.model_validate(pierwszy["enm"])) == compute_enm_hash(
        EnergyNetworkModel.model_validate(drugi["enm"])
    )
    assert json.dumps(pierwszy["enm"], sort_keys=True) == json.dumps(drugi["enm"], sort_keys=True)
