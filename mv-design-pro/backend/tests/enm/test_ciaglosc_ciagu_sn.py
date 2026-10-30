"""Reguła ciągłości ciągu SN w `continue_trunk_segment_sn` (karta UX-04/POLE-LINIOWE-WZORZEC).

PO CO. Dawniej odcinek bez wskazanego ciągu trafiał zawsze do PIERWSZEJ magistrali modelu
(`corridors[0]`), niezależnie od miejsca startu. Odcinek z drugiego pola GPZ (albo z wolnego pola
stacji w środku ciągu) stawał się „kolejnym odcinkiem" magistrali z pola 1.1, choć fizycznie
nie jest z nią połączony: widok logiczny gubił koniec pierwszego kabla, schemat rysował kabel
pola 2.1 jako przedłużenie kabla pola 1.1, a pole 2.1 — bez kabla odejścia. Reguła jest jedna
(`_ciag_kontynuowany_z`): start KONTYNUUJE ciąg, gdy ciąg jest pusty, gdy start jest końcem
ostatniego odcinka ciągu albo leży w tej samej stacji co ten koniec; każdy inny start zaczyna
NOWY ciąg z tego portu. Ciąg wskazany jawnie, którego start nie kontynuuje, to sprzeczny
kontekst wołającego — nazwana odmowa `trunk.start_not_at_trunk_end`.

WYROCZNIA niezależna od kodu operacji: każdy ciąg modelu jest fizycznie ciągły — odcinek `i > 0`
zaczyna się na końcu odcinka `i − 1` albo na szynie tej samej stacji (stacja z rekordów `bays`
i `substations` modelu, nie z funkcji produktu).

ILOCZYN CECH: start {pierwsze pole GPZ przy pustym ciągu, koniec ciągu, drugie pole GPZ tej
samej sekcji, pole GPZ drugiej sekcji, pole wyjściowe stacji na końcu ciągu, pole odgałęźne
stacji w środku ciągu, koniec ciągu z pola drugiej sekcji} × wskazanie ciągu {brak, magistrala
pierwsza, ciąg nieistniejący}. Do tego: determinizm identyfikatora nowego ciągu, odmowa bez
skutku w modelu, przydział pola GPZ zapisany dwustronnie i iniekcja dawnej reguły
(`corridors[0]`) — wyrocznia czerwona.
"""

from __future__ import annotations

import copy
import re
from dataclasses import dataclass
from typing import Any

import pytest
from enm import domain_operations

from tests.reference_networks.sceny_zajetosci_pol import (
    APARAT,
    TRAFO,
    _gpz,
    koniec_ciagu,
    odcinek,
    ok,
    op,
    pola_liniowe,
)

CIAG_NIEISTNIEJACY = "corridor/00000000000000000000000000000000/run"
WZORZEC_NOWEGO_CIAGU = re.compile(r"^corridor/[0-9a-f]{32}/run$")
ODMOWA = "trunk.start_not_at_trunk_end"


def _stacja_szyny_modelu(enm: dict[str, Any], bus_ref: str) -> str | None:
    """Stacja szyny wprost z rekordów modelu: zacisk pola (`terminal_bus_ref`) → stacja pola,
    szyna zbiorcza (`Substation.bus_refs`) → stacja."""
    for bay in enm.get("bays") or []:
        if bay.get("terminal_bus_ref") == bus_ref and bay.get("substation_ref"):
            return str(bay["substation_ref"])
    for stacja in enm.get("substations") or []:
        if bus_ref in (stacja.get("bus_refs") or []):
            return str(stacja["ref_id"])
    return None


def naruszenia_ciaglosci(enm: dict[str, Any]) -> list[str]:
    """Ciągi, w których kolejny odcinek nie zaczyna się na końcu poprzedniego ani w tej samej
    stacji (pusta lista = każdy ciąg fizycznie ciągły)."""
    galezie = {b["ref_id"]: b for b in enm.get("branches") or []}
    wynik: list[str] = []
    for ciag in enm.get("corridors") or []:
        odcinki = [galezie[r] for r in ciag.get("ordered_segment_refs") or [] if r in galezie]
        for poprzedni, kolejny in zip(odcinki, odcinki[1:], strict=False):
            koniec, start = poprzedni["to_bus_ref"], kolejny["from_bus_ref"]
            if start == koniec:
                continue
            stacja = _stacja_szyny_modelu(enm, start)
            if stacja is not None and stacja == _stacja_szyny_modelu(enm, koniec):
                continue
            wynik.append(
                f"{ciag['ref_id']}: {kolejny['ref_id']} nie kontynuuje {poprzedni['ref_id']}"
            )
    return wynik


@dataclass(frozen=True)
class Start:
    nazwa: str
    enm: dict[str, Any]
    payload: dict[str, Any]
    #: Czy start kontynuuje pierwszą magistralę (inaczej — nowy ciąg albo inny ciąg).
    kontynuuje_pierwsza: bool
    #: Pole GPZ startu (nowy ciąg dostaje jego przydział) albo `None`.
    pole_gpz: str | None = None
    #: Ciąg, który start kontynuuje, gdy nie jest to pierwsza magistrala.
    kontynuowany_inny: str | None = None


def _pierwsza_magistrala(enm: dict[str, Any]) -> dict[str, Any]:
    return next(c for c in enm["corridors"] if c["ref_id"].endswith("/corridor_01"))


def _gpz_z_magistrala() -> tuple[dict[str, Any], list[str]]:
    enm = _gpz(z_zaciskami=True)
    pola = pola_liniowe(enm, "gpz/")
    enm = ok(op(enm, "continue_trunk_segment_sn", {"field_ref": pola[0], "segment": odcinek(500)}))
    return enm, pola


def _stacja_na_koncu() -> dict[str, Any]:
    enm, _ = _gpz_z_magistrala()
    return ok(
        op(
            enm,
            "append_station_on_endpoint",
            {
                "endpoint_bus_ref": koniec_ciagu(enm),
                "station": {"name": "Stacja Brzozowa", "station_type": "terminal"},
                "field_apparatus_catalog_ref": APARAT,
                "transformer": {"transformer_catalog_ref": TRAFO},
                "nn_voltage_kv": 0.4,
                "sn_fields": [
                    {"field_role": "LINIA_IN"},
                    {"field_role": "LINIA_OUT"},
                    {"field_role": "LINIA_ODG"},
                ],
            },
        )
    )


def _stacja_w_srodku() -> dict[str, Any]:
    enm, _ = _gpz_z_magistrala()
    dzielony = [b for b in enm["branches"] if b.get("type") == "cable"][-1]
    return ok(
        op(
            enm,
            "insert_station_on_segment_sn",
            {
                "segment_ref": dzielony["ref_id"],
                "field_apparatus_catalog_ref": APARAT,
                "station_type": "B",
                "insert_at": {"value": 0.5},
                "station": {"name": "Stacja Lipowa", "sn_voltage_kv": 15.0, "nn_voltage_kv": 0.4},
                "sn_fields": ["IN", "OUT", "FEEDER", "FEEDER"],
                "transformer": {"create": True, "transformer_catalog_ref": TRAFO},
            },
        )
    )


def _pole_stacji(enm: dict[str, Any], rola: str) -> str:
    stacja = next(s for s in enm["substations"] if s.get("station_type") != "gpz")
    pola = [
        b
        for b in enm["bays"]
        if b.get("substation_ref") == stacja["ref_id"] and b.get("bay_role") == rola
    ]
    wolne = [b for b in pola if not _zajete(enm, b["ref_id"])]
    return str(wolne[0]["ref_id"])


def _zajete(enm: dict[str, Any], field_ref: str) -> bool:
    from enm.zajetosc_pol import zajetosc_pol

    return zajetosc_pol(enm)[field_ref].zajete


def _starty() -> list[Start]:
    pusty = _gpz(z_zaciskami=True)
    pola_pustego = pola_liniowe(pusty, "gpz/")
    z_magistrala, pola = _gpz_z_magistrala()
    koniec_sekcji_2 = ok(
        op(
            z_magistrala,
            "continue_trunk_segment_sn",
            {"field_ref": pola[2], "segment": odcinek(400)},
        )
    )
    ciag_sekcji_2 = next(
        c["ref_id"]
        for c in koniec_sekcji_2["corridors"]
        if (c.get("meta") or {}).get("gpz_field_ref") == pola[2]
    )
    na_koncu = _stacja_na_koncu()
    w_srodku = _stacja_w_srodku()
    return [
        Start("pierwsze_pole_gpz_pusty_ciag", pusty, {"field_ref": pola_pustego[0]}, True),
        Start(
            "koniec_ciagu",
            z_magistrala,
            {"from_terminal_id": koniec_ciagu(z_magistrala)},
            True,
        ),
        Start("drugie_pole_gpz_sekcji_1", z_magistrala, {"field_ref": pola[1]}, False, pola[1]),
        Start("pole_gpz_sekcji_2", z_magistrala, {"field_ref": pola[2]}, False, pola[2]),
        Start(
            "pole_wyjsciowe_stacji_na_koncu",
            na_koncu,
            {"field_ref": _pole_stacji(na_koncu, "OUT")},
            True,
        ),
        Start(
            "pole_odgalezne_stacji_w_srodku",
            w_srodku,
            {"field_ref": _pole_stacji(w_srodku, "FEEDER")},
            False,
        ),
        Start(
            "koniec_ciagu_z_pola_sekcji_2",
            koniec_sekcji_2,
            {"from_terminal_id": koniec_ciagu(koniec_sekcji_2)},
            False,
            kontynuowany_inny=ciag_sekcji_2,
        ),
    ]


STARTY = _starty()
WSKAZANIA = ("brak", "magistrala_pierwsza", "nieistniejacy")


def _wykonaj_z_wejsciem(start: Start, wskazanie: str) -> tuple[dict[str, Any], dict[str, Any]]:
    payload: dict[str, Any] = {**copy.deepcopy(start.payload), "segment": odcinek(321, "Badany")}
    if wskazanie == "magistrala_pierwsza":
        payload["trunk_id"] = _pierwsza_magistrala(start.enm)["ref_id"]
    elif wskazanie == "nieistniejacy":
        payload["trunk_id"] = CIAG_NIEISTNIEJACY
    wejscie = copy.deepcopy(start.enm)
    return op(wejscie, "continue_trunk_segment_sn", payload), wejscie


def _wykonaj(start: Start, wskazanie: str) -> dict[str, Any]:
    return _wykonaj_z_wejsciem(start, wskazanie)[0]


def _nowy_odcinek(przed: dict[str, Any], po: dict[str, Any]) -> str:
    stare = {b["ref_id"] for b in przed["branches"]}
    nowe = [
        b["ref_id"] for b in po["branches"] if b["ref_id"] not in stare and b.get("type") == "cable"
    ]
    assert len(nowe) == 1, nowe
    return nowe[0]


def _ciag_odcinka(enm: dict[str, Any], segment_ref: str) -> dict[str, Any]:
    return next(c for c in enm["corridors"] if segment_ref in (c.get("ordered_segment_refs") or []))


@pytest.mark.parametrize("wskazanie", WSKAZANIA)
@pytest.mark.parametrize("start", STARTY, ids=[s.nazwa for s in STARTY])
def test_start_x_wskazanie_ciagu(start: Start, wskazanie: str) -> None:
    odpowiedz, wejscie = _wykonaj_z_wejsciem(start, wskazanie)
    jawna_niekontynuowana = wskazanie == "magistrala_pierwsza" and not start.kontynuuje_pierwsza
    if jawna_niekontynuowana:
        # Sprzeczny kontekst: odmowa nazwana, bez migawki wyniku i bez skutku w modelu wejścia.
        assert odpowiedz.get("error_code") == ODMOWA, odpowiedz.get("error")
        assert "nie jest końcem tego ciągu" in str(odpowiedz.get("error"))
        assert odpowiedz.get("snapshot") is None
        assert wejscie == start.enm
        return
    po = ok(odpowiedz)
    assert naruszenia_ciaglosci(po) == []
    segment_ref = _nowy_odcinek(start.enm, po)
    ciag = _ciag_odcinka(po, segment_ref)
    przed_ids = {c["ref_id"] for c in start.enm["corridors"]}
    if start.kontynuuje_pierwsza:
        assert ciag["ref_id"] == _pierwsza_magistrala(start.enm)["ref_id"]
        assert ciag["ordered_segment_refs"][-1] == segment_ref
        assert {c["ref_id"] for c in po["corridors"]} == przed_ids
        return
    if start.kontynuowany_inny is not None:
        assert ciag["ref_id"] == start.kontynuowany_inny
        assert ciag["ordered_segment_refs"][-1] == segment_ref
        assert {c["ref_id"] for c in po["corridors"]} == przed_ids
        return
    # Nowy ciąg z portu startu: jeden odcinek, identyfikator deterministyczny, pierwsza
    # magistrala bez zmian, ciąg liniowy rodzaju `branch` z portem startu = zacisk odcinka.
    assert WZORZEC_NOWEGO_CIAGU.match(ciag["ref_id"]), ciag["ref_id"]
    assert ciag["ref_id"] not in przed_ids
    assert ciag["ordered_segment_refs"] == [segment_ref]
    assert _pierwsza_magistrala(po) == _pierwsza_magistrala(start.enm)
    run = next(r for r in po["line_runs"] if r["id"] == ciag["ref_id"])
    nowy_kabel = next(b for b in po["branches"] if b["ref_id"] == segment_ref)
    assert run["run_kind"] == "branch"
    assert run["starting_port_ref"] == nowy_kabel["from_bus_ref"]
    assert [s["segment_ref"] for s in run["segments"]] == [segment_ref]
    pole_meta = {b["ref_id"]: b.get("meta") or {} for b in po["bays"]}
    if start.pole_gpz is not None:
        # Przydział pola GPZ dwustronnie: ciąg wskazuje pole, pole wskazuje ciąg; nazwa
        # magistrali z numerem kolejnym.
        assert (ciag.get("meta") or {}).get("gpz_field_ref") == start.pole_gpz
        assert pole_meta[start.pole_gpz].get("assigned_corridor_ref") == ciag["ref_id"]
        assert re.fullmatch(r"Magistrala \d{2}", ciag["name"]), ciag["name"]
        # Pole startu jest zajęte tym ciągiem, żadne inne pole GPZ nie przejęło przydziału.
        przydzialy = {
            ref: m.get("assigned_corridor_ref")
            for ref, m in pole_meta.items()
            if m.get("assigned_corridor_ref") == ciag["ref_id"]
        }
        assert przydzialy == {start.pole_gpz: ciag["ref_id"]}
    else:
        assert "gpz_field_ref" not in (ciag.get("meta") or {})
        assert ciag["name"] == "Odgałęzienie SN kablowe"


def _sygnatura_ciagow(przed: dict[str, Any], po: dict[str, Any]) -> list[tuple[Any, ...]]:
    """Układ ciągów po operacji z identyfikatorami nowych obiektów zastąpionymi znacznikiem
    (identyfikatory wynikają z ładunku operacji, a wskazanie ciągu jest jego częścią)."""
    stare_ciagi = {c["ref_id"] for c in przed["corridors"]}
    stare_odcinki = {b["ref_id"] for b in przed["branches"]}
    return [
        (
            c["ref_id"] if c["ref_id"] in stare_ciagi else "NOWY",
            c.get("name"),
            tuple(r if r in stare_odcinki else "NOWY" for r in c.get("ordered_segment_refs") or []),
            (c.get("meta") or {}).get("gpz_field_ref"),
        )
        for c in po["corridors"]
    ]


@pytest.mark.parametrize("start", STARTY, ids=[s.nazwa for s in STARTY])
def test_ciag_nieistniejacy_jak_brak_wskazania(start: Start) -> None:
    """Nieaktualny kontekst (ciąg, którego już nie ma) nie przekierowuje odcinka — ten sam układ
    ciągów, co bez wskazania."""
    bez = ok(_wykonaj(start, "brak"))
    nieaktualny = ok(_wykonaj(start, "nieistniejacy"))
    assert _sygnatura_ciagow(start.enm, nieaktualny) == _sygnatura_ciagow(start.enm, bez)


@pytest.mark.parametrize(
    "start", [s for s in STARTY if not s.kontynuuje_pierwsza], ids=lambda s: s.nazwa
)
def test_determinizm_identyfikatora_nowego_ciagu(start: Start) -> None:
    pierwszy = ok(_wykonaj(start, "brak"))
    drugi = ok(_wykonaj(start, "brak"))
    assert pierwszy == drugi
    assert [c["ref_id"] for c in pierwszy["corridors"]] == [c["ref_id"] for c in drugi["corridors"]]


def test_przydzial_pierwszego_pola_sekcji_2_nie_przejmuje_magistrali_pola_1_1() -> None:
    """Samonaprawa przydziału (`_allocate_gpz_line_field_for_branch`): pole 0 sekcji 2 nie dostaje
    magistrali zasilanej z pola 1.1 — odgałęzienie z pola 2.1 zostaje na polu 2.1 (kabel
    fizycznie na jego zacisku), a pole 2.2 pozostaje wolne."""
    enm, pola = _gpz_z_magistrala()
    po = ok(
        op(
            enm,
            "start_branch_segment_sn",
            {"from_ref": f"{pola[2]}.BRANCH", "segment": odcinek(250)},
        )
    )
    meta = {b["ref_id"]: b.get("meta") or {} for b in po["bays"]}
    magistrala = _pierwsza_magistrala(po)["ref_id"]
    assert meta[pola[2]].get("assigned_corridor_ref") not in (None, magistrala)
    assert not _zajete(po, pola[3])
    assert naruszenia_ciaglosci(po) == []


def test_iniekcja_dawnej_reguly_pierwszej_magistrali_wyrocznia_czerwona(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Powrót do `corridors[0]` (dawna reguła) dokleja odcinek pola 2.1 do magistrali pola 1.1 —
    wyrocznia ciągłości to wykrywa."""

    def pierwszy_ciag(enm: dict[str, Any], start_bus: str) -> str | None:
        korytarze = enm.get("corridors") or []
        return str(korytarze[0]["ref_id"]) if korytarze else None

    monkeypatch.setattr(domain_operations, "_ciag_dla_startu", pierwszy_ciag)
    start = next(s for s in STARTY if s.nazwa == "pole_gpz_sekcji_2")
    po = ok(_wykonaj(start, "brak"))
    assert naruszenia_ciaglosci(po) != []


def test_wyrocznia_ciaglosci_lapie_odcinek_spoza_ciagu() -> None:
    """Wyrocznia sama w sobie: ciąg z odcinkiem doklejonym spoza jego końca — naruszenie."""
    start = next(s for s in STARTY if s.nazwa == "pole_gpz_sekcji_2")
    po = ok(_wykonaj(start, "brak"))
    zly = copy.deepcopy(po)
    nowy = _nowy_odcinek(start.enm, po)
    magistrala = _pierwsza_magistrala(zly)
    magistrala["ordered_segment_refs"] = [*magistrala["ordered_segment_refs"], nowy]
    assert naruszenia_ciaglosci(zly) != []
