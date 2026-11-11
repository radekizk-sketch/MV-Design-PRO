"""Odcinek SN przyłączany do szyny sekcji bez pola (karta INSPEKTOR-POLA-DOMKNIECIE, punkt 2).

Decyzja architekta: odcinek przyłączany do szyny sekcji bez wskazania pola przechodzi przez pole
liniowe; gdy takiego pola nie ma albo wszystkie są zajęte, operacja tworzy je w tej samej
operacji, wyposażone jak wzorzec sekcji. Odmowa wyłącznie z przyczyny modelowej (nazwany kod).
Jeden predykat `enm.zajetosc_pol.odcinki_bez_pola` czytają operacje, walidator (`W058`) i akcja
naprawcza `przepnij_element_na_pole`.

Iloczyn cech: operacja {ciąg z szyny, odgałęzienie z szyny (`from_bus_ref`), odgałęzienie
z portu szyny (`from_ref`), pierścień do szyny, przepięcie modelu zastanego} × rodzaj stacji
{SN/nN w odcinku, SN/nN końcowa, GPZ z zaciskami pól, GPZ bez zacisków pól, sekcja 2 GPZ,
sekcja B stacji sekcyjnej} × stan pól {wolne kilka, wolne jedno, wszystkie zajęte, brak pól}
× pole {wskazane, niewskazane} + determinizm + odmowy modelowe + parytet predykatu
operacji i walidatora.
"""

from __future__ import annotations

import copy
from typing import Any

import pytest
from enm.models import EnergyNetworkModel
from enm.pola import pola_sn_stacji, zacisk_pola
from enm.tor_pola import naruszenia_zasady_toru
from enm.validator import ENMValidator
from enm.zajetosc_pol import (
    KOD_WALIDATORA_ODCINEK_BEZ_POLA,
    odcinki_bez_pola,
    szyny_sekcji_sn,
    zajetosc_pol,
)

from tests.reference_networks.sceny_zajetosci_pol import (
    APARAT,
    RODZAJE,
    STANY,
    TRAFO,
    odcinek,
    ok,
    op,
    zbuduj_scene,
)

OPERACJE = ("ciag", "odgalezienie_szyna", "odgalezienie_port", "pierscien")
ROLE_LINIOWE = ("OUT", "FEEDER")


def _szyna_celu(enm: dict[str, Any], rodzaj: str) -> str:
    """Szyna sekcji, do której operacja przyłącza odcinek (bez wskazania pola)."""
    if rodzaj in ("stacja_na_odcinku", "stacja_koncowa"):
        stacja = next(s for s in enm["substations"] if s.get("station_type") != "gpz")
        return next(b for b in stacja["bus_refs"] if b in szyny_sekcji_sn(enm))
    gpz = next(s for s in enm["substations"] if s.get("station_type") == "gpz")
    return str(gpz["bus_refs"][1 if rodzaj == "sekcja_2_gpz" else 0])


def _drugi_koniec_pierscienia(enm: dict[str, Any], rodzaj: str, szyna: str) -> str:
    """Pierścień między dwiema rozdzielnicami: stacja ↔ sekcja 1 GPZ, GPZ ↔ druga sekcja GPZ
    (oba końce wskazane szyną sekcji — oba przechodzą przez pole)."""
    gpz = next(s for s in enm["substations"] if s.get("station_type") == "gpz")
    return next(str(b) for b in gpz["bus_refs"] if b != szyna)


def _wolne_pola_szyny(enm: dict[str, Any], szyna: str) -> list[str]:
    stan = zajetosc_pol(enm)
    return [
        ref
        for ref, z in stan.items()
        if z.bay_role in ROLE_LINIOWE
        and next(p for p in enm["bays"] if p["ref_id"] == ref)["bus_ref"] == szyna
        and not z.zajete
    ]


def _wzorzec_z_aparatem(enm: dict[str, Any], szyna: str) -> dict[str, Any] | None:
    for pole in enm.get("bays") or []:
        if pole.get("bus_ref") != szyna:
            continue
        zacisk = zacisk_pola(pole)
        if zacisk and zacisk != szyna:
            return pole
    return None


def _wykonaj(enm: dict[str, Any], operacja: str, rodzaj: str, szyna: str) -> dict[str, Any]:
    if operacja == "ciag":
        return op(
            enm, "continue_trunk_segment_sn", {"from_terminal_id": szyna, "segment": odcinek(333)}
        )
    if operacja == "odgalezienie_szyna":
        return op(enm, "start_branch_segment_sn", {"from_bus_ref": szyna, "segment": odcinek(155)})
    if operacja == "odgalezienie_port":
        return op(
            # Port startu wskazany zaciskiem szyny sekcji w `from_ref` — jedna postać portu
            # (`_rozwiaz_port_startu`, rozstrzygnięcie architekta 2026-10-30), bez `.BRANCH`.
            enm,
            "start_branch_segment_sn",
            {"from_ref": szyna, "segment": odcinek(156)},
        )
    return op(
        enm,
        "connect_secondary_ring_sn",
        {
            "from_bus_ref": _drugi_koniec_pierscienia(enm, rodzaj, szyna),
            "to_bus_ref": szyna,
            "segment": odcinek(444),
        },
    )


def _nowy_odcinek(przed: dict[str, Any], po: dict[str, Any]) -> dict[str, Any]:
    stare = {b["ref_id"] for b in przed["branches"]}
    return next(
        b
        for b in po["branches"]
        if b["ref_id"] not in stare and b.get("type") in ("cable", "line_overhead")
    )


@pytest.mark.parametrize("stan", STANY)
@pytest.mark.parametrize("rodzaj", RODZAJE)
@pytest.mark.parametrize("operacja", OPERACJE)
def test_odcinek_z_szyny_sekcji_zawsze_przez_pole(operacja: str, rodzaj: str, stan: str) -> None:
    scena = zbuduj_scene(rodzaj, stan)
    enm = scena.enm
    szyna = _szyna_celu(enm, rodzaj)
    przed = copy.deepcopy(enm)
    wolne = _wolne_pola_szyny(enm, szyna)
    wzorzec = _wzorzec_z_aparatem(enm, szyna)

    wynik = _wykonaj(enm, operacja, rodzaj, szyna)
    assert enm == przed, "operacja nie może mutować modelu wejściowego"
    model = ok(wynik)

    # Żaden odcinek modelu nie leży na szynie sekcji bez pola (jeden predykat).
    assert odcinki_bez_pola(model) == []
    nowy = _nowy_odcinek(przed, model)
    stan_pol = zajetosc_pol(model)
    pole_celu = next(
        ref
        for ref, z in stan_pol.items()
        if nowy["ref_id"] in z.odcinki_fizyczne
        and next(p for p in model["bays"] if p["ref_id"] == ref)["bus_ref"] == szyna
    )
    utworzone = [
        z["element_id"] for z in wynik["domain_events"] if z["event_type"] == "LINE_FIELD_CREATED"
    ]
    pola_przed = {p["ref_id"] for p in przed.get("bays") or []}
    nowe_pola_szyny = [
        p["ref_id"]
        for p in model["bays"]
        if p["ref_id"] not in pola_przed and p.get("bus_ref") == szyna
    ]
    if wolne:
        # Wolne pole liniowe — pierwsze w kolejności danych; żadnego nowego pola na tej szynie.
        assert pole_celu == wolne[0]
        assert nowe_pola_szyny == []
        assert pole_celu not in utworzone
    else:
        # Brak wolnego pola — pole utworzone w tej operacji, z komunikatem dla projektanta.
        assert nowe_pola_szyny == [pole_celu]
        assert pole_celu in utworzone
        zdanie = next(a["action"] for a in wynik["audit_trail"] if a["element_id"] == pole_celu)
        assert zdanie.startswith("Utworzono nowe pole liniowe") and "/" not in zdanie
        assert pole_celu in wynik["changes"]["created_element_ids"]
        pole_nowe = next(p for p in model["bays"] if p["ref_id"] == pole_celu)
        assert pole_nowe["bay_role"] in ROLE_LINIOWE
        # Operacja projektowa nadaje stan obiektu jawnie (jedyny builder pola, argument
        # obowiązkowy) — pole utworzone przy przyłączeniu odcinka i jego aparat są PROJEKTOWANE.
        assert pole_nowe["stan_obiektu"] == "PROJEKTOWANY"
        zacisk = zacisk_pola(pole_nowe)
        if wzorzec is None:
            assert zacisk in (None, szyna)
            assert "bez aparatu" in zdanie
        else:
            assert zacisk and zacisk != szyna
            aparat = next(
                b for b in model["branches"] if b["ref_id"] in pole_nowe["equipment_refs"]
            )
            aparat_wzorca = next(
                b
                for b in model["branches"]
                if {b.get("from_bus_ref"), b.get("to_bus_ref")} == {szyna, zacisk_pola(wzorzec)}
            )
            assert (aparat["type"], aparat.get("catalog_ref")) == (
                aparat_wzorca["type"],
                aparat_wzorca.get("catalog_ref"),
            )
            assert aparat["status"] == "closed"
            assert "wyposażone jak pole wzorcowe sekcji" in zdanie
    # Walidator modelu nie zgłasza odcinka bez pola po żadnej operacji.
    kody = {
        i.code for i in ENMValidator().validate(EnergyNetworkModel.model_validate(model)).issues
    }
    assert KOD_WALIDATORA_ODCINEK_BEZ_POLA not in kody


@pytest.mark.parametrize("operacja", OPERACJE)
@pytest.mark.parametrize("rodzaj", ["stacja_koncowa", "gpz_z_zaciskami", "gpz_bez_zaciskow"])
def test_determinizm_pola_utworzonego(operacja: str, rodzaj: str) -> None:
    """To samo wejście → ta sama migawka i te same identyfikatory pola, zacisku i aparatu."""
    enm = zbuduj_scene(rodzaj, "zajete_wszystkie").enm
    szyna = _szyna_celu(enm, rodzaj)
    a = ok(_wykonaj(copy.deepcopy(enm), operacja, rodzaj, szyna))
    b = ok(_wykonaj(copy.deepcopy(enm), operacja, rodzaj, szyna))
    for m in (a, b):
        m["header"].pop("created_at", None)
        m["header"].pop("updated_at", None)
    assert a == b


# ---------------------------------------------------------------------------
# Pole WSKAZANE wprost
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("rodzaj", RODZAJE)
def test_pole_wskazane_wolne_jest_uzyte_a_zajete_stacji_odmawia(rodzaj: str) -> None:
    enm = zbuduj_scene(rodzaj, "wolne_kilka").enm
    szyna = _szyna_celu(enm, rodzaj)
    wolne = _wolne_pola_szyny(enm, szyna)
    assert wolne
    # Jedno pole szyny zajęte ciągiem — żeby wskazanie zajętego pola miało czego dotyczyć.
    enm = ok(op(enm, "continue_trunk_segment_sn", {"field_ref": wolne[0], "segment": odcinek(320)}))
    wolne = _wolne_pola_szyny(enm, szyna)
    assert wolne
    model = ok(
        op(enm, "continue_trunk_segment_sn", {"field_ref": wolne[0], "segment": odcinek(321)})
    )
    nowy = _nowy_odcinek(enm, model)
    assert nowy["meta"]["origin_bay_ref"] == wolne[0]
    assert odcinki_bez_pola(model) == []
    zajete = [
        ref
        for ref, z in zajetosc_pol(enm).items()
        if z.zajete
        and z.bay_role in ROLE_LINIOWE
        and next(p for p in enm["bays"] if p["ref_id"] == ref)["bus_ref"] == szyna
    ]
    if not zajete:
        return
    # Ciąg ze wskazanego ZAJĘTEGO pola — jawny wybór projektanta, nazwana odmowa bez skutku.
    przed = copy.deepcopy(enm)
    odmowa = op(enm, "continue_trunk_segment_sn", {"field_ref": zajete[0], "segment": odcinek(322)})
    assert odmowa.get("error_code") == "field.line_field_occupied"
    assert enm == przed
    # Odgałęzienie ze wskazanego zajętego pola: stacja SN/nN odmawia, GPZ przydziela nowe pole
    # kanonem pól GPZ — z tym samym komunikatem dla projektanta co przy szynie sekcji.
    wynik = op(
        # Port startu z pola = `ref_id` pola (jedna postać portu, bez dawnego `.BRANCH`).
        enm,
        "start_branch_segment_sn",
        {"from_ref": zajete[0], "segment": odcinek(157)},
    )
    if rodzaj in ("stacja_na_odcinku", "stacja_koncowa"):
        assert wynik.get("error_code") == "field.line_field_occupied"
    else:
        model = ok(wynik)
        assert odcinki_bez_pola(model) == []
        # Kanon GPZ: wskazane pole zajęte → pierwsze wolne pole sekcji (tu jest), bez nowego pola.
        nowy = _nowy_odcinek(enm, model)
        assert nowy["meta"]["origin_bay_ref"] in wolne
        assert not [z for z in wynik["domain_events"] if z["event_type"] == "LINE_FIELD_CREATED"]


# ---------------------------------------------------------------------------
# Sekcja B stacji sekcyjnej i szyna spoza rozdzielnicy
# ---------------------------------------------------------------------------


def _stacja_sekcyjna() -> dict[str, Any]:
    enm = zbuduj_scene("gpz_z_zaciskami", "wolne_kilka").enm
    pole = next(ref for ref, z in zajetosc_pol(enm).items() if z.bay_role in ROLE_LINIOWE)
    enm = ok(op(enm, "continue_trunk_segment_sn", {"field_ref": pole, "segment": odcinek(500)}))
    dzielony = [b for b in enm["branches"] if b.get("type") == "cable"][-1]
    return ok(
        op(
            enm,
            "insert_station_on_segment_sn",
            {
                "segment_ref": dzielony["ref_id"],
                "field_apparatus_catalog_ref": APARAT,
                "station_type": "D",
                "insert_at": {"value": 0.5},
                "station": {"name": "Stacja Sekcyjna", "sn_voltage_kv": 15.0, "nn_voltage_kv": 0.4},
                "transformer": {"create": True, "transformer_catalog_ref": TRAFO},
            },
        )
    )


@pytest.mark.parametrize("operacja", OPERACJE[:3])
def test_sekcja_b_stacji_sekcyjnej_dostaje_pole_na_swojej_szynie(operacja: str) -> None:
    enm = _stacja_sekcyjna()
    stacja = next(s for s in enm["substations"] if s.get("name") == "Stacja Sekcyjna")
    sekcje = [b for b in stacja["bus_refs"] if b in szyny_sekcji_sn(enm)]
    assert len(sekcje) == 2
    for szyna in sekcje:
        wynik = _wykonaj(copy.deepcopy(enm), operacja, "stacja_na_odcinku", szyna)
        model = ok(wynik)
        assert odcinki_bez_pola(model) == []
        nowy = _nowy_odcinek(enm, model)
        pole = next(
            p
            for p in pola_sn_stacji(model, stacja["ref_id"])
            if zacisk_pola(p) in (nowy["from_bus_ref"], nowy["to_bus_ref"])
        )
        assert pole["bus_ref"] == szyna


def test_szyna_spoza_rozdzielnicy_bez_pola_i_bez_odmowy() -> None:
    """Koniec ciągu (szyna terenowa, nie szyna sekcji stacji): odcinek przyłącza się wprost —
    nie ma rozdzielnicy, w której powstałoby pole, więc ani pola, ani odmowy."""
    enm = zbuduj_scene("gpz_z_zaciskami", "wolne_kilka").enm
    pole = next(ref for ref, z in zajetosc_pol(enm).items() if z.bay_role in ROLE_LINIOWE)
    enm = ok(op(enm, "continue_trunk_segment_sn", {"field_ref": pole, "segment": odcinek(500)}))
    koniec = [b for b in enm["branches"] if b.get("type") == "cable"][-1]["to_bus_ref"]
    assert koniec not in szyny_sekcji_sn(enm)
    wynik = op(
        enm, "continue_trunk_segment_sn", {"from_terminal_id": koniec, "segment": odcinek(222)}
    )
    model = ok(wynik)
    assert len(model["bays"]) == len(enm["bays"])
    assert _nowy_odcinek(enm, model)["from_bus_ref"] == koniec
    assert [z for z in wynik["domain_events"] if z["event_type"] == "LINE_FIELD_CREATED"] == []


# ---------------------------------------------------------------------------
# Odmowy z przyczyny modelowej
# ---------------------------------------------------------------------------


def test_odmowa_modelowa_limit_pol_sekcji_gpz() -> None:
    from enm.domain_operations import MAX_GPZ_LINE_FIELDS_PER_SECTION

    enm = zbuduj_scene("gpz_z_zaciskami", "wolne_kilka").enm
    szyna = _szyna_celu(enm, "gpz_z_zaciskami")
    for n in range(MAX_GPZ_LINE_FIELDS_PER_SECTION):
        enm = ok(
            op(
                enm,
                "continue_trunk_segment_sn",
                {"from_terminal_id": szyna, "segment": odcinek(600 + n)},
            )
        )
    przed = copy.deepcopy(enm)
    wynik = op(
        enm, "continue_trunk_segment_sn", {"from_terminal_id": szyna, "segment": odcinek(999)}
    )
    assert wynik.get("error_code") == "branch_connection.gpz_line_fields_exhausted"
    assert wynik.get("snapshot") is None
    assert enm == przed


def test_odmowa_modelowa_sekcja_gpz_nieopisana() -> None:
    enm = zbuduj_scene("gpz_bez_zaciskow", "brak_pol").enm
    szyna = _szyna_celu(enm, "gpz_bez_zaciskow")
    for stacja in enm["substations"]:
        if stacja.get("station_type") == "gpz":
            stacja["gpz_sections"] = [
                s for s in stacja.get("gpz_sections") or [] if s.get("bus_ref") != szyna
            ]
    wynik = op(
        enm, "continue_trunk_segment_sn", {"from_terminal_id": szyna, "segment": odcinek(333)}
    )
    assert wynik.get("error_code") == "field.auto_field_section_unknown"
    assert "/" not in str(wynik.get("error")).split("—")[0] or "„" in str(wynik.get("error"))


# ---------------------------------------------------------------------------
# Model zastany: walidator W058 i akcja naprawcza (ten sam predykat)
# ---------------------------------------------------------------------------


def _model_zastany(rodzaj: str, stan: str) -> tuple[dict[str, Any], str]:
    """Odcinek doprowadzony do szyny sekcji z pominięciem pola (stan sprzed karty: zbudowany
    operacją, a potem koniec przeniesiony z zacisku pola na szynę i pochodzenie zdjęte)."""
    enm = zbuduj_scene(rodzaj, stan).enm
    szyna = _szyna_celu(enm, rodzaj)
    wynik = op(enm, "start_branch_segment_sn", {"from_bus_ref": szyna, "segment": odcinek(177)})
    model = ok(wynik)
    nowy = _nowy_odcinek(enm, model)
    nowy["from_bus_ref"] = szyna
    nowy.pop("meta", None)
    # Pole utworzone przy budowie znika razem z zaciskiem i aparatem — model zastany nie ma pola,
    # przez które odcinek mógłby przejść, więc akcja naprawcza musi je utworzyć.
    for zdarzenie in wynik["domain_events"]:
        if zdarzenie["event_type"] != "LINE_FIELD_CREATED":
            continue
        pole = next(p for p in model["bays"] if p["ref_id"] == zdarzenie["element_id"])
        model["bays"] = [p for p in model["bays"] if p["ref_id"] != pole["ref_id"]]
        aparaty = set(pole.get("equipment_refs") or [])
        model["branches"] = [b for b in model["branches"] if b["ref_id"] not in aparaty]
        zacisk = zacisk_pola(pole)
        if zacisk and zacisk != szyna:
            model["buses"] = [b for b in model["buses"] if b["ref_id"] != zacisk]
    return model, nowy["ref_id"]


@pytest.mark.parametrize("stan", STANY)
@pytest.mark.parametrize("rodzaj", RODZAJE)
def test_walidator_w049_i_przepiecie_tworzy_pole(rodzaj: str, stan: str) -> None:
    model, ref = _model_zastany(rodzaj, stan)
    bez_pola = odcinki_bez_pola(model)
    assert [o.branch_ref for o in bez_pola] == [ref]
    issues = ENMValidator().validate(EnergyNetworkModel.model_validate(model)).issues
    w049 = [i for i in issues if i.code == KOD_WALIDATORA_ODCINEK_BEZ_POLA]
    # Parytet: walidator zgłasza DOKŁADNIE odcinki z predykatu operacji (jedno źródło).
    assert sorted(i.element_refs[0] for i in w049) == sorted(o.branch_ref for o in bez_pola)
    assert {
        n.element_ref for n in naruszenia_zasady_toru(model) if n.rodzaj_elementu == "odcinek"
    } == {o.branch_ref for o in bez_pola}
    zgloszenie = w049[0]
    assert zgloszenie.severity == "IMPORTANT"
    assert zgloszenie.fix_action is not None
    assert zgloszenie.fix_action.modal_type == "przepnij_element_na_pole"
    assert "/" not in zgloszenie.message_pl.split("—")[0] or "„" in zgloszenie.message_pl
    # Akcja naprawcza z ładunkiem z podpowiedzi (bez pola — pole wskazuje model albo powstaje).
    payload = {
        k: v
        for k, v in (zgloszenie.fix_action.payload_hint or {}).items()
        if k in ("element_ref", "field_ref")
    }
    wynik = op(model, "przepnij_element_na_pole", payload)
    naprawiony = ok(wynik)
    assert odcinki_bez_pola(naprawiony) == []
    kody = {
        i.code
        for i in ENMValidator().validate(EnergyNetworkModel.model_validate(naprawiony)).issues
    }
    assert KOD_WALIDATORA_ODCINEK_BEZ_POLA not in kody
    if "field_ref" not in payload:
        assert [z for z in wynik["domain_events"] if z["event_type"] == "LINE_FIELD_CREATED"]
