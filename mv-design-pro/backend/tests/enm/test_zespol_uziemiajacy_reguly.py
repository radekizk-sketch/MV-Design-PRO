"""Zespół uziemiający SN: odmowy operacji i reguły walidatora z wyjaśnieniem (karta
UX-04/POLE-ZU-SKLADOWA-ZEROWA §0 pkt 5, 7, 10).

Każda odmowa operacji ``add_zespol_uziemiajacy_sn`` jest nazwana (``error_code`` z rodziny
``zu.*``) i nie zostawia skutku w modelu. Reguły walidatora (E-ZU-01/02, W-ZU-01…06) są
iloczynem cech, w którym defekt mógłby się schować: wariant punktu neutralnego × SPZ, wariant
× wyłączenie od transformatorów (brak / komplet / część / spoza modelu) × liczba sekcji
i stan sprzęgła, odbiór potrzeb własnych {brak, nieistniejący, na innej szynie, na szynie
zespołu}, napięcie typu wobec sieci, szyna spoza pasma SN. Każdy rekord niesie zdanie
z kryterium i podstawą (werdykt wyjaśnialny), nie sam kod.
"""

from __future__ import annotations

import copy
from typing import Any

import pytest
from enm.domain_operations import execute_domain_operation
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader
from enm.validator import ENMValidator

from tests.enm.test_skladowa_zerowa_zu import (
    DLAWIK,
    REZYSTOR,
    TRAFO_WN_SN,
    TU,
    UN_KV,
    _gpz,
    _siec,
    _szyny,
    _zespol,
)

OPERACJA = "add_zespol_uziemiajacy_sn"


def _pole_zu(migawka: dict[str, Any]) -> dict[str, Any]:
    return next(b for b in migawka["bays"] if b["bay_role"] == "ZU")


def _pole_liniowe(migawka: dict[str, Any]) -> dict[str, Any]:
    return next(b for b in migawka["bays"] if b["bay_role"] == "FEEDER")


def _operacja(migawka: dict[str, Any], ladunek: dict[str, Any]) -> dict[str, Any]:
    return execute_domain_operation(enm_dict=migawka, op_name=OPERACJA, payload=ladunek)


def _baza() -> dict[str, Any]:
    """GPZ z jedną sekcją i zespołem Z.15 w polu ZU (miejsce dla odmów pola i szyny)."""
    return _siec("rezystor")


def _ladunek_rezystora(migawka: dict[str, Any], **zmiany: Any) -> dict[str, Any]:
    ladunek: dict[str, Any] = {
        "bus_ref": _szyny(migawka)[0],
        "catalog_ref": TU,
        "rezystor": {"catalog_ref": REZYSTOR},
    }
    ladunek.update(zmiany)
    return ladunek


def _szyna_wn(migawka: dict[str, Any]) -> str:
    return next(b["ref_id"] for b in migawka["buses"] if b["voltage_kv"] == 110.0)


ODMOWY: dict[str, Any] = {
    "zu.not_found": lambda m: _ladunek_rezystora(m, zespol_ref="zespol-spoza-modelu"),
    "zu.bay_not_found": lambda m: {**_ladunek_rezystora(m), "bay_ref": "pole-spoza-modelu"},
    "zu.bay_role_mismatch": lambda m: {
        **_ladunek_rezystora(m),
        "bus_ref": None,
        "bay_ref": _pole_liniowe(m)["ref_id"],
    },
    "zu.bay_bus_mismatch": lambda m: {
        **_ladunek_rezystora(m),
        "bay_ref": _pole_zu(m)["ref_id"],
    },
    "zu.bus_missing": lambda m: {**_ladunek_rezystora(m), "bus_ref": None},
    "zu.bus_not_found": lambda m: _ladunek_rezystora(m, bus_ref="szyna-spoza-modelu"),
    "zu.bus_not_sn": lambda m: _ladunek_rezystora(m, bus_ref=_szyna_wn(m)),
    "zu.catalog_required": lambda m: {
        k: v for k, v in _ladunek_rezystora(m).items() if k != "catalog_ref"
    },
    "zu.voltage_mismatch.tu": lambda m: _ladunek_rezystora(m, catalog_ref="TU_ZNYN11_20KV_PW160"),
    "zu.voltage_mismatch.rezystor": lambda m: _ladunek_rezystora(
        m, rezystor={"catalog_ref": "REZ_200A_20KV"}
    ),
    "zu.voltage_mismatch.dlawik": lambda m: _ladunek_rezystora(
        m, rezystor=None, dlawik={"catalog_ref": "DL_40_400A_20KV_CIAGLY"}
    ),
    "zu.coil_setting_out_of_range": lambda m: _ladunek_rezystora(
        m, rezystor=None, dlawik={"catalog_ref": DLAWIK, "i_nastawy_a": 500.0}
    ),
    "zu.payload_invalid.nastawa": lambda m: _ladunek_rezystora(
        m, rezystor=None, dlawik={"catalog_ref": DLAWIK, "i_nastawy_a": -1.0}
    ),
    "zu.payload_invalid.strona_awsc": lambda m: _ladunek_rezystora(
        m, rezystor=None, dlawik={"catalog_ref": DLAWIK, "awsc": {"strona": "trzecia"}}
    ),
    "zu.payload_invalid.odlacznik": lambda m: _ladunek_rezystora(
        m, rezystor={"catalog_ref": REZYSTOR, "stan_odlacznika": "uchylony"}
    ),
    "zu.payload_invalid.spz": lambda m: _ladunek_rezystora(m, spz="tak"),
    "zu.direct_with_element": lambda m: _ladunek_rezystora(m, uziemienie_bezposrednie=True),
    "zu.neutral_element_missing": lambda m: _ladunek_rezystora(m, rezystor=None),
    "zu.transformer_not_found": lambda m: _ladunek_rezystora(
        m, wylaczenie_od_transformatorow_refs=["transformator-spoza-modelu"]
    ),
    "zu.load_not_found": lambda m: _ladunek_rezystora(m, odbior_pw_ref="odbior-spoza-modelu"),
}


@pytest.mark.parametrize("przypadek", sorted(ODMOWY))
def test_odmowa_operacji_nazwana_bez_skutku(przypadek: str) -> None:
    migawka = _baza()
    przed = copy.deepcopy(migawka)
    ladunek = {k: v for k, v in ODMOWY[przypadek](migawka).items() if v is not None}
    wynik = _operacja(migawka, ladunek)
    assert wynik["error_code"] == przypadek.split(".")[0] + "." + przypadek.split(".")[1]
    assert wynik["error"] and wynik["snapshot"] is None
    assert migawka == przed


def test_kreator_gpz_odmawia_dwoch_zespolow_w_jednej_sekcji() -> None:
    """Kreator GPZ przyjmuje jeden zespół na sekcję — praca równoległa dwóch zespołów na
    jedną sieć jest decyzją projektanta (osobna operacja), nie skutkiem kreatora."""
    with pytest.raises(AssertionError):
        _gpz(1, [_zespol("rezystor", 1), _zespol("rezystor", 1)])


# ---------------------------------------------------------------------------
# Reguły walidatora — iloczyn cech
# ---------------------------------------------------------------------------


def _problemy(migawka: dict[str, Any], kod: str) -> list[Any]:
    return [
        i
        for i in ENMValidator().validate(EnergyNetworkModel.model_validate(migawka)).issues
        if i.code == kod
    ]


def _z_rezystorem(wariant: str) -> bool:
    return wariant in ("rezystor", "dlawik_rezystor")


WARIANTY = ("dlawik", "dlawik_awsc", "rezystor", "dlawik_rezystor", "bezposrednie")


@pytest.mark.parametrize("wariant", WARIANTY)
@pytest.mark.parametrize("spz", [False, True])
def test_spz_tylko_przy_rezystorze(wariant: str, spz: bool) -> None:
    """§0 pkt 10 (ENEA Zeszyt 1 §26.9.6 s. 54): SPZ transformatora uziemiającego wyłącznie
    w sieci z rezystorem w punkcie neutralnym."""
    migawka = _siec(wariant)
    migawka["zespoly_uziemiajace"][0]["spz"] = spz
    problemy = _problemy(migawka, "W-ZU-01")
    if spz and not _z_rezystorem(wariant):
        (problem,) = problemy
        assert "§26.9.6" in problem.message_pl and "niespełnione" in problem.message_pl
        assert problem.element_refs == [migawka["zespoly_uziemiajace"][0]["ref_id"]]
    else:
        assert problemy == []


def _transformatory(migawka: dict[str, Any]) -> list[str]:
    return sorted(t["ref_id"] for t in migawka["transformers"])


@pytest.mark.parametrize("wariant", WARIANTY)
@pytest.mark.parametrize("wylaczenie", ["brak", "komplet", "czesc", "spoza_modelu"])
@pytest.mark.parametrize("uklad", [(1, "-"), (2, "zamkniete"), (2, "otwarte")])
def test_wylaczenie_od_transformatorow_przy_rezystorze(
    wariant: str, wylaczenie: str, uklad: tuple[int, str]
) -> None:
    """§0 pkt 10 (IRiESD II.4.5.4.3.5 s. 53): przy rezystorze każde automatyczne wyłączenie
    pola SN transformatora WN/SN sieci wyłącza zespół. Sieć zespołu to sekcja pola ZU —
    przy zamkniętym sprzęgle obie sekcje, więc oba transformatory."""
    sekcje, sprzeglo = uklad
    migawka = _siec(wariant, sekcje=sekcje, zu="jedna")
    if sprzeglo == "otwarte":
        sprzeglo_ref = next(b for b in migawka["branches"] if b.get("type") == "bus_coupler")
        sprzeglo_ref["status"] = "open"
    trafo = _transformatory(migawka)
    trafo_sekcji_1 = [t for t in trafo if "/001/" in t]
    zasilajace = trafo if sprzeglo != "otwarte" else trafo_sekcji_1
    zespol = migawka["zespoly_uziemiajace"][0]
    zespol["wylaczenie_od_transformatorow_refs"] = {
        "brak": [],
        "komplet": zasilajace,
        "czesc": zasilajace[:1] if len(zasilajace) > 1 else [],
        "spoza_modelu": ["transformator-spoza-modelu"],
    }[wylaczenie]
    problemy = _problemy(migawka, "W-ZU-02")
    oczekiwane: list[list[str]] = []
    if _z_rezystorem(wariant):
        brakujace = [t for t in zasilajace if t not in zespol["wylaczenie_od_transformatorow_refs"]]
        if brakujace:
            oczekiwane.append([zespol["ref_id"], *brakujace])
    if wylaczenie == "spoza_modelu":
        oczekiwane.append([zespol["ref_id"]])
    assert sorted(p.element_refs for p in problemy) == sorted(oczekiwane)
    for problem in problemy:
        assert "II.4.5.4.3.5" in problem.message_pl


@pytest.mark.parametrize("odbior", ["brak", "nieistniejacy", "inna_szyna", "szyna_zespolu"])
def test_odbior_potrzeb_wlasnych_uzwojenia_pw(odbior: str) -> None:
    migawka = _siec("rezystor")
    zespol = migawka["zespoly_uziemiajace"][0]
    szyna_odbioru = {"inna_szyna": _szyny(migawka)[0], "szyna_zespolu": zespol["bus_ref"]}
    if odbior in szyna_odbioru:
        migawka["loads"].append(
            {
                "ref_id": "odbior-pw",
                "name": "Potrzeby własne GPZ",
                "bus_ref": szyna_odbioru[odbior],
                "p_mw": 0.05,
                "q_mvar": 0.01,
            }
        )
    zespol["odbior_pw_ref"] = None if odbior == "brak" else "odbior-pw"
    problemy = _problemy(migawka, "W-ZU-03")
    if odbior in ("nieistniejacy", "inna_szyna"):
        (problem,) = problemy
        assert "§27.1" in problem.message_pl
        fragment = "nie istnieje" if odbior == "nieistniejacy" else "innej szynie"
        assert fragment in problem.message_pl
    else:
        assert problemy == []


@pytest.mark.parametrize("wariant", WARIANTY)
def test_uziemienie_bezposrednie_poza_zeszytem(wariant: str) -> None:
    problemy = _problemy(_siec(wariant), "W-ZU-05")
    if wariant == "bezposrednie":
        (problem,) = problemy
        assert "§16" in problem.message_pl
    else:
        assert problemy == []


@pytest.mark.parametrize(("u_tu", "ostrzezenie"), [(15.0, False), (20.0, True), (None, False)])
def test_napiecie_transformatora_uziemiajacego_wobec_sieci(
    u_tu: float | None, ostrzezenie: bool
) -> None:
    """Rekord z innej drogi wczytania (import) z typem na inne napięcie: W-ZU-06 z liczbami;
    brak napięcia typu w rekordzie nie jest domysłem zgodności ani niezgodności."""
    migawka = _siec("rezystor")
    zespol = migawka["zespoly_uziemiajace"][0]
    zespol["u_n_kv"] = None
    zespol["materialized_params"] = {
        k: v for k, v in zespol["materialized_params"].items() if k != "u_n_kv"
    }
    if u_tu is not None:
        zespol["materialized_params"]["u_n_kv"] = u_tu
    problemy = _problemy(migawka, "W-ZU-06")
    if ostrzezenie:
        (problem,) = problemy
        assert "20 kV" in problem.message_pl and "15 kV" in problem.message_pl
    else:
        assert problemy == []


@pytest.mark.parametrize("szyna", ["nieistniejaca", "wn"])
def test_zespol_poza_siecia_sn_blokuje(szyna: str) -> None:
    migawka = _siec("rezystor")
    zespol = migawka["zespoly_uziemiajace"][0]
    zespol["bus_ref"] = "szyna-spoza-modelu" if szyna == "nieistniejaca" else _szyna_wn(migawka)
    (problem,) = _problemy(migawka, "E-ZU-01")
    assert problem.severity == "BLOCKER" or str(problem.severity).endswith("BLOCKER")
    assert "Zeszyt 1 §16" in problem.message_pl
    fragment = "nie istnieje" if szyna == "nieistniejaca" else "110 kV"
    assert fragment in problem.message_pl


@pytest.mark.parametrize("przypadek", ["bez_elementu", "sprzeczny"])
def test_zespol_bez_elementu_albo_sprzeczny_to_brak_modelu(przypadek: str) -> None:
    migawka = _siec("rezystor")
    zespol = migawka["zespoly_uziemiajace"][0]
    if przypadek == "bez_elementu":
        zespol["rezystor"] = None
    else:
        zespol["uziemienie_bezposrednie"] = True
    (problem,) = _problemy(migawka, "E-ZU-02")
    assert "nie wchodzi do składowej zerowej" in problem.message_pl


def _gpz_tr(sekcje: int, transformatory: int, zespoly: list[dict[str, Any]]) -> dict[str, Any]:
    """GPZ z równoważnikiem 110 kV i ``transformatory`` transformatorami WN/SN w modelu."""
    enm = EnergyNetworkModel(
        header=ENMHeader(name="Karta ZU", defaults=ENMDefaults(sn_nominal_kv=UN_KV))
    ).model_dump(mode="json")
    return execute_domain_operation(
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
            "transformer_count": transformatory,
            "transformer_catalog_ref": TRAFO_WN_SN,
            "zespoly_uziemiajace": zespoly,
        },
    )


@pytest.mark.parametrize("deklaracja", [None, False, True])
@pytest.mark.parametrize("sekcja", [1, 2])
@pytest.mark.parametrize("uklad", [(2, 2), (2, 1)], ids=["2sekcje-2TR", "2sekcje-1TR"])
def test_wylaczenie_od_transformatora_sekcji_z_kreatora_gpz(
    deklaracja: bool | None, sekcja: int, uklad: tuple[int, int]
) -> None:
    """Transformatory WN/SN powstają w tej samej operacji co zespół — kreator GPZ wskazuje
    je deklaracją ``wylaczenie_od_transformatora_sekcji``. Iloczyn: deklaracja {brak, nie,
    tak} × sekcja zespołu {1, 2} × liczba transformatorów {2, 1 — sekcja 2 bez TR}.
    Rozwiązanie: transformatory, których strona SN jest szyną sekcji zespołu; deklaracja
    bez transformatora sekcji = odmowa nazwana, model bez zmian. Z deklaracją przy
    rezystorze reguła W-ZU-02 (IRiESD II.4.5.4.3.5) nie ma braku dla sekcji zespołu."""
    sekcje, transformatory = uklad
    zespol = {**_zespol("rezystor", sekcja)}
    if deklaracja is not None:
        zespol["wylaczenie_od_transformatora_sekcji"] = deklaracja
    wynik = _gpz_tr(sekcje, transformatory, [zespol])
    if deklaracja and sekcja > transformatory:
        assert wynik.get("error_code") == "zu.transformer_not_found", wynik.get("error")
        assert f"Sekcja {sekcja}" in wynik["error"]
        assert not (wynik.get("snapshot") or {}).get("zespoly_uziemiajace")
        return
    assert not wynik.get("error"), wynik.get("error")
    migawka = wynik["snapshot"]
    (zu,) = migawka["zespoly_uziemiajace"]
    pole = next(b for b in migawka["bays"] if b["ref_id"] == zu["bay_ref"])
    trafo_sekcji = sorted(
        t["ref_id"] for t in migawka["transformers"] if t["lv_bus_ref"] == pole["bus_ref"]
    )
    assert zu["wylaczenie_od_transformatorow_refs"] == (trafo_sekcji if deklaracja else [])
    assert "wylaczenie_od_transformatora_sekcji" not in zu
    if deklaracja:
        assert trafo_sekcji, "transformator sekcji musi istnieć, gdy deklaracja przeszła"


@pytest.mark.parametrize(
    "zmiana",
    [
        {"wylaczenie_od_transformatora_sekcji": "tak"},
        {"wylaczenie_od_transformatora_sekcji": True, "wylaczenie_od_transformatorow_refs": ["x"]},
    ],
    ids=["nie-logiczna", "z-jawna-lista"],
)
def test_wylaczenie_od_transformatora_sekcji_odmowy(zmiana: dict[str, Any]) -> None:
    wynik = _gpz_tr(1, 1, [{**_zespol("rezystor", 1), **zmiana}])
    assert wynik.get("error_code") == "zu.payload_invalid", wynik.get("error")
    assert not (wynik.get("snapshot") or {}).get("zespoly_uziemiajace")
