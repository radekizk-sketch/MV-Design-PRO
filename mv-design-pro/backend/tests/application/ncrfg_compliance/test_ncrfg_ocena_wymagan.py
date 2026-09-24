"""Ocena zgodności NC RfG per wymaganie — rekordy ``WynikWymagania`` (karta AB-1a Pakiet C).

ILOCZYN CECH (KLASA, NIE INSTANCJA): typ modułu {poniżej progu, A, B, C, D} × technologia
{PPM, SPGM, MAGAZYN} × certyfikat {rekord wykazu obejmujący typ, rekord nieobejmujący typu,
brak, tabliczka niespójna z rejestrem} × źródło danych {żądanie klienta, zatwierdzony model} ×
moduł istniejący {True, False, None} × prawo operatora {skorzystał, nie skorzystał,
nieustalone} × nastawy zabezpieczeń {komplet w obwiedni, poza obwiednią, czas poza obwiednią,
brak}. Sondy karty repo §4 pokryte tu na poziomie oceny: (1) moduł A bez certyfikatu,
(2) moduł A z certyfikatem z wykazu, (3) moduł B — wymagania dynamiczne, (4) SPGM B,
(5) magazyn samodzielny, (6) żądanie klienta nigdy pełne; karta Pakietu C: (14) magazyn,
(15) nastawa U< wobec obwiedni LVRT.
"""

from __future__ import annotations

from typing import Any

import pytest
from application.ncrfg_compliance import (
    KRYTERIA_KOORDYNACJI,
    NcRfgCaseComplianceResponse,
    NcRfgPtpireeRunResponse,
    OcenaWymaganModulu,
    bieg_ncrfg,
    brak_json,
    brak_pl,
    braki,
    ocen_wymagania_biegu,
    ocen_wymagania_modulu,
    zgodnosc_ncrfg_przypadku,
)
from application.ncrfg_compliance.ocena_wymagan import rodzaj_twierdzenia_wymagania
from catalog.profiles.nc_rfg import list_available_operators, load_nc_rfg_profile
from enm.nastawy_modulu import NastawyZabezpieczenModulu
from network_model.solvers.ncrfg_ptpiree import NcRfgPtpireeRunRequest, NcRfgPtpireeSolver
from network_model.solvers.ncrfg_ptpiree.stosowalnosc import (
    POWOD_MAGAZYNU_PL,
    POWOD_MODULU_ISTNIEJACEGO_PL,
    RODZAJE_Z_ROZPORZADZENIA,
)
from werdykt import WynikWymagania
from werdykt.proweniencja import ClaimKind, EvidenceTier

from tests import ncrfg_fabryki as f

TYPY = ("ponizej_progu", "A", "B", "C", "D")
TECHNOLOGIE = {"PPM": ("PV", "PPM"), "SPGM": ("OTHER", "SyPGM"), "MAGAZYN": ("BESS", "PPM")}
_GEN_TYPE = {"PPM": "pv_inverter", "MAGAZYN": "bess"}
_METODA_WLASCIWA = "certyfikat urządzenia z wykazu PTPiREE obejmujący typ"


def _ocena_klienta(modul: Any) -> OcenaWymaganModulu:
    return bieg_ncrfg(
        NcRfgPtpireeRunRequest(modules=[modul]), zrodlo_danych="ZADANIE_KLIENTA"
    ).ocena_wymagan[0]


def _ocena_modelu(*generatory: Any) -> NcRfgCaseComplianceResponse:
    return zgodnosc_ncrfg_przypadku(f.model(*generatory), operator_id=f.OPERATOR, case_id="c-1")


def _w(ocena: OcenaWymaganModulu, wymaganie_id: str) -> WynikWymagania:
    return next(w for w in ocena.wymagania if w.wymaganie_id == wymaganie_id)


def _gen_z_typem(typ: str, **zmiany: Any) -> Any:
    p_max_kw, napiecie_kv = f.TYPY_MOCY[typ]
    return f.generator(p_mw=p_max_kw / 1000.0, **zmiany), napiecie_kv


# --------------------------------------------------------------------------------------
# Rekord dla każdego wymagania; stosowalność typ × technologia
# --------------------------------------------------------------------------------------


@pytest.mark.parametrize("technologia", sorted(TECHNOLOGIE))
@pytest.mark.parametrize("typ", TYPY)
def test_rekord_dla_kazdego_wymagania_w_kolejnosci_profilu(typ: str, technologia: str) -> None:
    der_kind, rodzina = TECHNOLOGIE[technologia]
    ocena = _ocena_klienta(f.modul_typu(typ, der_kind=der_kind, module_family=rodzina))
    profil = load_nc_rfg_profile(f.OPERATOR)
    assert [w.wymaganie_id for w in ocena.wymagania] == [w.id for w in profil.wymagania]
    typ_modulu = ocena.klasyfikacja.modul
    for wymaganie, rekord in zip(profil.wymagania, ocena.wymagania, strict=True):
        if typ_modulu is None:
            assert rekord.status_maszynowy == "NIE_DOTYCZY"
            assert rekord.stosowalnosc.powod_pl == ocena.klasyfikacja.powod_pl
            continue
        if technologia == "MAGAZYN" and wymaganie.zrodlo.rodzaj in RODZAJE_Z_ROZPORZADZENIA:
            assert rekord.status_maszynowy == "NIE_DOTYCZY"
            assert rekord.stosowalnosc.powod_pl == POWOD_MAGAZYNU_PL
            continue
        assert rekord.stosowalnosc.dotyczy is wymaganie.dotyczy(typ_modulu, technologia)
        if rekord.stosowalnosc.dotyczy:
            # Żądanie klienta: W nigdy SPELNIA, nigdy dowód pełny, nigdy certyfikat.
            assert rekord.status_maszynowy != "SPELNIA"
            assert rekord.kompletnosc_dowodu != "PELNY"
            assert rekord.sposob_wykazania != "CERTYFIKAT"


@pytest.mark.parametrize("typ", ["A", "B", "C", "D"])
def test_magazyn_samodzielny_z_modelu_wymagania_nc_rfg_nie_dotycza(typ: str) -> None:
    """Sonda (14): generator BESS samodzielny — każde wymaganie NC RfG ``NIE_DOTYCZY`` z
    powodem art. 3 ust. 2 lit. d (O-28)."""
    p_max_kw, napiecie_kv = f.TYPY_MOCY[typ]
    zgodnosc = zgodnosc_ncrfg_przypadku(
        f.model(f.generator(p_mw=p_max_kw / 1000.0, gen_type="bess"), napiecie_kv=napiecie_kv),
        operator_id=f.OPERATOR,
        case_id="c-1",
    )
    assert zgodnosc.bieg is not None
    ocena = zgodnosc.bieg.ocena_wymagan[0]
    assert ocena.technologia == "MAGAZYN"
    for rekord in ocena.wymagania:
        assert rekord.status_maszynowy == "NIE_DOTYCZY"
        assert "art. 3 ust. 2 lit. d" in rekord.stosowalnosc.powod_pl
    assert braki(zgodnosc.bieg.ocena_wymagan) == []


@pytest.mark.parametrize("istniejacy", [True, False, None])
def test_modul_istniejacy_art_4_wylacza_wymagania_rozporzadzenia(istniejacy: bool | None) -> None:
    ocena = _ocena_klienta(f.modul_typu("B", modul_istniejacy=istniejacy))
    profil = load_nc_rfg_profile(f.OPERATOR)
    for wymaganie, rekord in zip(profil.wymagania, ocena.wymagania, strict=True):
        if not wymaganie.dotyczy("B", "PPM"):
            # Typ/technologia rozstrzygają wcześniej (powód typu, nie art. 4).
            assert rekord.status_maszynowy == "NIE_DOTYCZY"
        elif istniejacy is True and wymaganie.zrodlo.rodzaj in RODZAJE_Z_ROZPORZADZENIA:
            assert rekord.status_maszynowy == "NIE_DOTYCZY"
            assert rekord.stosowalnosc.powod_pl == POWOD_MODULU_ISTNIEJACEGO_PL
        else:
            assert rekord.stosowalnosc.dotyczy
            assert rekord.stosowalnosc.modul_istniejacy is istniejacy
            if istniejacy is None:
                assert any("nieustalony" in z for z in rekord.wyjasnienie.zastrzezenia)


# --------------------------------------------------------------------------------------
# Sposób wykazania: brak metody, certyfikat (reguła WiPWC NIEUSTALONE), test
# --------------------------------------------------------------------------------------


@pytest.mark.parametrize("typ", ["A", "B"])
def test_bez_certyfikatu_wymagania_bez_testu_to_brak_dowodu_z_nazwana_metoda(typ: str) -> None:
    """Sonda (1): 13.1a, 13.1b, 13.3, 13.4, 13.7 → ``BRAK_DOWODU`` („brak metody")."""
    ocena = _ocena_klienta(f.modul_typu(typ))
    for wymaganie_id in ("RFG_13_1A", "RFG_13_1B", "RFG_13_3", "RFG_13_4", "RFG_13_7"):
        rekord = _w(ocena, wymaganie_id)
        assert rekord.sposob_wykazania == "BRAK_METODY"
        assert rekord.status_maszynowy == "BRAK_DOWODU"
        assert any(_METODA_WLASCIWA in b for b in rekord.wyjasnienie.czego_brakuje)
    # LFSM-O (13.2): parametr zastany o stanie NIEUSTALONE → BRAK_PODSTAWY.
    assert _w(ocena, "RFG_13_2").status_maszynowy == "BRAK_PODSTAWY"


@pytest.mark.parametrize("typ", ["A", "B"])
def test_certyfikat_z_wykazu_przy_regule_nieustalonej_nigdy_nie_spelnia(typ: str) -> None:
    """Sonda (2): certyfikat dopasowany przez serwer, reguła pokrycia WiPWC ``NIEUSTALONE``
    → rekord z podstawą reguły sposobu wykazania, dowód niepełny, nigdy ``SPELNIA``."""
    generator, napiecie = _gen_z_typem(typ, materialized_params=f.tabliczka(f.rekord_wykazu("A,B")))
    zgodnosc = zgodnosc_ncrfg_przypadku(
        f.model(generator, napiecie_kv=napiecie), operator_id=f.OPERATOR, case_id="c-1"
    )
    assert zgodnosc.bieg is not None
    assert zgodnosc.bieg.modules[0].dowod_certyfikatu is not None
    ocena = zgodnosc.bieg.ocena_wymagan[0]
    profil = load_nc_rfg_profile(f.OPERATOR)
    certyfikatowe = [w for w in profil.wymagania if typ in w.certyfikat_pokrywa_typy]
    assert certyfikatowe
    for wymaganie in certyfikatowe:
        rekord = _w(ocena, wymaganie.id)
        assert rekord.sposob_wykazania == "CERTYFIKAT"
        assert rekord.podstawa_sposobu_wykazania == wymaganie.pokrycie_zrodlo
        assert rekord.status_maszynowy != "SPELNIA"
        assert rekord.kompletnosc_dowodu == "NIEPELNY"
        assert any(p.startswith("Reguła sposobu wykazania") for p in rekord.powody_niepelnosci)
        assert rekord.oceny_skladowe[0].kryterium_id == "certyfikat.pokrycie_wymagania"
        assert rekord.oceny_skladowe[0].dowod.metoda == "CERTYFIKAT"
        if wymaganie.id not in KRYTERIA_KOORDYNACJI:
            assert rekord.status_maszynowy == "BRAK_DOWODU"
            assert "WiPWC" in (rekord.wyjasnienie.przyczyna_pl or "")


@pytest.mark.parametrize("certyfikat", ["nie_obejmuje", "tabliczka_niespojna"])
def test_certyfikat_nieobejmujacy_typu_albo_odrzucony_zostaje_brakiem_metody(
    certyfikat: str,
) -> None:
    rekord_wykazu = f.rekord_wykazu("C,D" if certyfikat == "nie_obejmuje" else "A,B")
    tabliczka = (
        f.tabliczka(rekord_wykazu)
        if certyfikat == "nie_obejmuje"
        else f.tabliczka(rekord_wykazu, ptpiree_document_number="INNY/NUMER")
    )
    generator, napiecie = _gen_z_typem("A", materialized_params=tabliczka)
    zgodnosc = zgodnosc_ncrfg_przypadku(
        f.model(generator, napiecie_kv=napiecie), operator_id=f.OPERATOR, case_id="c-1"
    )
    assert zgodnosc.bieg is not None
    rekord = _w(zgodnosc.bieg.ocena_wymagan[0], "RFG_13_1A")
    assert rekord.sposob_wykazania == "BRAK_METODY"
    assert rekord.status_maszynowy == "BRAK_DOWODU"
    if certyfikat == "nie_obejmuje":
        assert zgodnosc.certyfikaty_odrzucone == []
        assert any("nie obejmuje typu A" in b for b in rekord.wyjasnienie.czego_brakuje)
    else:
        assert zgodnosc.bieg.modules[0].dowod_certyfikatu is None
        [odrzucony] = zgodnosc.certyfikaty_odrzucone
        assert "przeczy rekordowi" in odrzucony.powod_pl
        assert any(odrzucony.powod_pl in b for b in rekord.wyjasnienie.czego_brakuje)


_CERTYFIKATY = ("obejmuje", "nie_obejmuje", "tabliczka_niespojna", "brak")


def _generator_z_certyfikatem(typ: str, certyfikat: str) -> tuple[Any, float]:
    if certyfikat == "brak":
        return _gen_z_typem(typ)
    rekord_wykazu = f.rekord_wykazu("C,D" if certyfikat == "nie_obejmuje" else "A,B")
    zmiany = (
        {"ptpiree_document_number": "INNY/NUMER"} if certyfikat == "tabliczka_niespojna" else {}
    )
    return _gen_z_typem(typ, materialized_params=f.tabliczka(rekord_wykazu, **zmiany))


@pytest.mark.parametrize("certyfikat", _CERTYFIKATY)
@pytest.mark.parametrize("typ", TYPY)
def test_poziom_certyfikatu_badania_typu_wylacznie_przy_certyfikacie(
    typ: str, certyfikat: str
) -> None:
    """Odbiór Pakietu C (plan AB O-50), iloczyn typ modułu × certyfikat {obejmuje typ, nie
    obejmuje, tabliczka niespójna z wykazem, brak}: rekord W ze sposobem CERTYFIKAT i jego
    składowa certyfikatu niosą ``dowod.poziom == TYPE_TEST_CERTIFICATE``; rekord bez
    certyfikatu (inny sposób, certyfikat nieobejmujący typu, odrzucony albo brak) — nigdy."""
    generator, napiecie = _generator_z_certyfikatem(typ, certyfikat)
    zgodnosc = zgodnosc_ncrfg_przypadku(
        f.model(generator, napiecie_kv=napiecie), operator_id=f.OPERATOR, case_id="c-1"
    )
    rekordy = [
        w for o in (zgodnosc.bieg.ocena_wymagan if zgodnosc.bieg else []) for w in o.wymagania
    ]
    certyfikatem = [w for w in rekordy if w.sposob_wykazania == "CERTYFIKAT"]
    # Wykaz pokrywa typy A i B (reguła warstwy WiPWC profilu) — tylko wtedy sposób CERTYFIKAT.
    assert bool(certyfikatem) == (certyfikat == "obejmuje" and typ in ("A", "B"))
    for rekord in rekordy:
        ma_certyfikat = rekord.sposob_wykazania == "CERTYFIKAT"
        assert (
            rekord.dowod.poziom is EvidenceTier.TYPE_TEST_CERTIFICATE
        ) == ma_certyfikat, rekord.wymaganie_id
        for ocena in rekord.oceny_skladowe:
            assert (ocena.dowod.poziom is EvidenceTier.TYPE_TEST_CERTIFICATE) == (
                ocena.dowod.metoda == "CERTYFIKAT"
            ), (rekord.wymaganie_id, ocena.kryterium_id)
            if not ma_certyfikat:
                assert ocena.dowod.poziom is not EvidenceTier.TYPE_TEST_CERTIFICATE


def test_certyfikat_odrzucony_przekazany_do_oceny_modulu() -> None:
    modul = f.modul_typu("A")
    wynik = NcRfgPtpireeSolver().run(
        NcRfgPtpireeRunRequest(modules=[modul]), zrodlo_danych="ZATWIERDZONY_MODEL"
    )
    ocena = ocen_wymagania_modulu(
        modul,
        wynik.modules[0],
        input_hash=wynik.input_hash,
        certyfikat_odrzucony_pl="powód odrzucenia testowy",
    )
    rekord = _w(ocena, "RFG_13_3")
    assert any(
        "certyfikat z tabliczki urządzenia: powód odrzucenia testowy" in b
        for b in rekord.wyjasnienie.czego_brakuje
    )


# --------------------------------------------------------------------------------------
# Prawo operatora: skorzystał / nie skorzystał / nieustalone
# --------------------------------------------------------------------------------------


@pytest.mark.parametrize("skorzystal", [True, False, None])
def test_prawo_operatora(monkeypatch: pytest.MonkeyPatch, skorzystal: bool | None) -> None:
    wymaganie_id = "RFG_20_2A"
    if skorzystal is not None:
        f.podmien_profil(monkeypatch, f.profil_z_prawem(wymaganie_id, skorzystal))
    profil_wymaganie = load_nc_rfg_profile(f.OPERATOR).wymaganie(wymaganie_id)
    rekord = _w(_ocena_klienta(f.modul_typu("B")), wymaganie_id)
    if skorzystal is False:
        assert rekord.status_maszynowy == "NIE_DOTYCZY"
        assert "nie skorzystał z prawa" in rekord.stosowalnosc.powod_pl
        assert rekord.stosowalnosc.podstawa is not None
        assert rekord.stosowalnosc.podstawa.status == "WSKAZANE"
    elif skorzystal is True:
        assert rekord.stosowalnosc.dotyczy
        assert rekord.podstawa == profil_wymaganie.zrodlo
        assert not any("IRiESD albo warunki" in b for b in rekord.wyjasnienie.czego_brakuje)
    else:
        # Nieustalone: wymaganie obowiązuje, a podstawą jest wykonanie prawa w warstwie OSD
        # (stan NIEUSTALONE) — dowód niepełny z nazwanym dokumentem operatora.
        assert rekord.stosowalnosc.dotyczy
        assert rekord.podstawa.status == "NIEUSTALONE"
        assert rekord.podstawa.rodzaj == profil_wymaganie.wykonanie_prawa_zrodlo.rodzaj
        assert rekord.kompletnosc_dowodu == "NIEPELNY"
        assert rekord.status_maszynowy != "SPELNIA"
        assert any("IRiESD albo warunki" in b for b in rekord.wyjasnienie.czego_brakuje)


# --------------------------------------------------------------------------------------
# Koordynacja nastaw (O-32)
# --------------------------------------------------------------------------------------


def _nastawy(**wartosci: float) -> NastawyZabezpieczenModulu:
    return NastawyZabezpieczenModulu(zrodlo_pl="karta nastaw testowa", **wartosci)


@pytest.mark.parametrize(
    "nastawy, oczekiwanie",
    [
        (None, "brak"),
        ({"u_min_pu": 0.04, "u_min_czas_s": 0.1}, "w_obwiedni"),
        ({"u_min_pu": 0.8, "u_min_czas_s": 0.2}, "poza_obwiednia"),
        ({"u_min_pu": 0.95, "u_min_czas_s": 5.0}, "czas_poza_obwiednia"),
    ],
)
def test_koordynacja_nastawy_u_min_z_obwiednia_lvrt(
    nastawy: dict[str, float] | None, oczekiwanie: str
) -> None:
    """Sonda (15): nastawa U< wobec obwiedni LVRT profilu jako składowa RFG_14_3 (moduł B);
    obwiednia o stanie NIEUSTALONE → krok PODSTAWA reguły K (``BRAK_PODSTAWY``)."""
    ustawienia = None if nastawy is None else _nastawy(**nastawy)
    ocena = _ocena_klienta(f.modul_typu("B", nastawy_zabezpieczen_modulu=ustawienia))
    rekord = _w(ocena, "RFG_14_3")
    [k] = [o for o in rekord.oceny_skladowe if o.kryterium_id == "frt.koordynacja_nastaw_u_min"]
    assert k.kryterium.relacja == "OBWIEDNIA_GORNA"
    if oczekiwanie == "brak":
        assert k.status_maszynowy == "NIE_OCENIONO"
        assert any("u_min_pu" in b for b in k.wyjasnienie.czego_brakuje)
        return
    assert k.status_maszynowy == "BRAK_PODSTAWY"
    assert k.margines is not None
    if oczekiwanie == "w_obwiedni":
        assert k.margines.wartosc.wartosc >= 0
    else:
        assert k.margines.wartosc.wartosc < 0
    if oczekiwanie == "czas_poza_obwiednia":
        assert k.wynik is not None and k.wynik.chwila_s == 3.0
        assert "poza przedziałem obwiedni" in k.wynik.punkt_krytyczny_pl


@pytest.mark.parametrize("rocof", [None, 2.0])
def test_koordynacja_nastawy_rocof_bez_wartosci_krajowej(rocof: float | None) -> None:
    ustawienia = None if rocof is None else _nastawy(rocof_hz_s=rocof)
    rekord = _w(
        _ocena_klienta(f.modul_typu("A", nastawy_zabezpieczen_modulu=ustawienia)), "RFG_13_1B"
    )
    [k] = rekord.oceny_skladowe
    assert k.kryterium_id == "rocof.koordynacja_nastaw_lom"
    assert k.status_maszynowy == ("NIE_OCENIONO" if rocof is None else "BRAK_PODSTAWY")
    assert any("Bank Nastaw" in b for b in k.wyjasnienie.czego_brakuje)
    # BRAK_METODY: składowa informacyjna, wymaganie pozostaje BRAK_DOWODU.
    assert rekord.sposob_wykazania == "BRAK_METODY"
    assert rekord.status_maszynowy == "BRAK_DOWODU"


@pytest.mark.parametrize("operator_id", list_available_operators())
def test_kryteria_koordynacji_przypisane_do_istniejacych_wymagan(operator_id: str) -> None:
    identyfikatory = {w.id for w in load_nc_rfg_profile(operator_id).wymagania}
    assert set(KRYTERIA_KOORDYNACJI) <= identyfikatory


# --------------------------------------------------------------------------------------
# Dowód łączony, pokrycie programu, rodzaj twierdzenia
# --------------------------------------------------------------------------------------


def test_dowod_laczony_najslabszy_poziom_i_pokrycie_programu() -> None:
    """Sonda (3): moduł B — 14(3), 20(2)(b), 20(3) nieocenione (brak biegu dynamiki),
    pokrycie programu ``CZESCIOWE``; wymaganie z porównaniem konfiguracji — ``NIE_DOTYCZY``."""
    ocena = _ocena_klienta(f.modul_typu("B"))
    for wymaganie_id in ("RFG_14_3", "RFG_20_2B", "RFG_20_3"):
        rekord = _w(ocena, wymaganie_id)
        assert rekord.status_maszynowy == "NIE_OCENIONO"
        assert rekord.pokrycie_programu == "CZESCIOWE"
        assert "program badań profilu: stan źródła „nieustalone”" in rekord.pokrycie_programu_pl
        assert rekord.dowod.poziom == EvidenceTier.NOT_SIMULATED
        assert rekord.dowod.rodzaj_twierdzenia == ClaimKind.DYNAMIC_PERFORMANCE
        assert any("bieg dynamiki" in b for b in rekord.wyjasnienie.czego_brakuje)
    konfiguracja = _w(ocena, "RFG_14_2")
    assert konfiguracja.pokrycie_programu == "NIE_DOTYCZY"
    assert "porównaniem konfiguracji" in konfiguracja.pokrycie_programu_pl
    assert konfiguracja.dowod.rodzaj_twierdzenia == ClaimKind.DECLARED_CONFIGURATION
    assert konfiguracja.dowod.poziom == EvidenceTier.DECLARATION


def test_spgm_typu_b() -> None:
    """Sonda (4): SPGM B → 20(2)(b) ``NIE_DOTYCZY``, 17(3) ``NIE_OCENIONO``."""
    ocena = _ocena_klienta(f.modul_typu("B", der_kind="OTHER", module_family="SyPGM"))
    assert _w(ocena, "RFG_20_2B").status_maszynowy == "NIE_DOTYCZY"
    assert _w(ocena, "RFG_17_3").status_maszynowy == "NIE_OCENIONO"


def test_rodzaj_twierdzenia_wymagania() -> None:
    profil = load_nc_rfg_profile(f.OPERATOR)
    assert rodzaj_twierdzenia_wymagania(profil.wymaganie("RFG_13_1A")) == (
        ClaimKind.DYNAMIC_PERFORMANCE
    )
    assert rodzaj_twierdzenia_wymagania(profil.wymaganie("RFG_13_2")) == (
        ClaimKind.DECLARED_CONFIGURATION
    )
    assert rodzaj_twierdzenia_wymagania(profil.wymaganie("RFG_14_3")) == (
        ClaimKind.DYNAMIC_PERFORMANCE
    )


# --------------------------------------------------------------------------------------
# Braki, spójność kopert, determinizm
# --------------------------------------------------------------------------------------


def test_braki_to_wymagania_stosowalne_bez_spelnia() -> None:
    """Brak = wymaganie stosowalne bez SPELNIA, przypisane do modułu (odbiór Pakietu C, plan
    AB O-50 pkt 7): każda pozycja niesie ``der_ref`` i ``der_name`` modułu, którego dotyczy —
    dwa moduły × {typ B z brakami, poniżej progu bez wymagań stosowalnych}."""
    oceny = [
        _ocena_klienta(f.modul_typu("B")),
        _ocena_klienta(f.modul_typu("ponizej_progu", der_ref="pv-2", der_name="PV 0,5 kW")),
        _ocena_klienta(f.modul_typu("B", der_ref="pv-3", der_name="PV 2 MW bis")),
    ]
    pozycje = braki(oceny)
    oczekiwane = [
        (o.der_ref, o.der_name, w)
        for o in oceny
        for w in o.wymagania
        if w.stosowalnosc.dotyczy and w.status_maszynowy != "SPELNIA"
    ]
    assert [(p.der_ref, p.der_name, p.rekord) for p in pozycje] == oczekiwane
    assert {p.der_ref for p in pozycje} == {"pv-1", "pv-3"}
    assert braki([oceny[1]]) == []
    pierwsza = pozycje[0]
    assert brak_json(pierwsza) == {
        "der_ref": pierwsza.der_ref,
        "der_name": pierwsza.der_name,
        "rekord": pierwsza.rekord.model_dump(mode="json"),
    }
    assert brak_pl(pierwsza) == {
        "der_ref": pierwsza.der_ref,
        "der_name": pierwsza.der_name,
        "zdanie_pl": pierwsza.rekord.wyjasnienie.zdanie_pl,
    }


def test_ocena_i_wynik_solvera_rozjechane_sa_odrzucane() -> None:
    a, b = f.modul_typu("A"), f.modul_typu("B", der_ref="pv-2")
    wynik = NcRfgPtpireeSolver().run(
        NcRfgPtpireeRunRequest(modules=[a]), zrodlo_danych="ZATWIERDZONY_MODEL"
    )
    with pytest.raises(ValueError, match="nie odpowiada"):
        ocen_wymagania_modulu(b, wynik.modules[0], input_hash=wynik.input_hash)
    with pytest.raises(ValueError, match="nie odpowiadają"):
        ocen_wymagania_biegu(NcRfgPtpireeRunRequest(modules=[b]), wynik)
    ocena = ocen_wymagania_biegu(NcRfgPtpireeRunRequest(modules=[a]), wynik)
    with pytest.raises(ValueError, match="Ocena wymagań obejmuje"):
        NcRfgPtpireeRunResponse(**wynik.model_dump(), ocena_wymagan=[*ocena, *ocena])


def test_koperta_przypadku_bieg_wtedy_gdy_sa_moduly() -> None:
    pusty = _ocena_modelu()
    assert pusty.bieg is None and pusty.der_count == 0
    with pytest.raises(ValueError):
        NcRfgCaseComplianceResponse(
            case_id="c",
            operator_id=f.OPERATOR,
            der_count=1,
            pominiete=[],
            certyfikaty_odrzucone=[],
            bieg=None,
        )


@pytest.mark.parametrize("zrodlo", ["model", "klient"])
def test_determinizm_i_odtwarzalnosc_rekordow_w(zrodlo: str) -> None:
    def ocena() -> OcenaWymaganModulu:
        if zrodlo == "klient":
            return _ocena_klienta(f.modul_typu("B"))
        generator, napiecie = _gen_z_typem(
            "B", materialized_params=f.tabliczka(f.rekord_wykazu("A,B"))
        )
        zgodnosc = zgodnosc_ncrfg_przypadku(
            f.model(generator, napiecie_kv=napiecie), operator_id=f.OPERATOR, case_id="c-1"
        )
        assert zgodnosc.bieg is not None
        return zgodnosc.bieg.ocena_wymagan[0]

    pierwsza, druga = ocena(), ocena()
    assert [w.kanoniczny_json() for w in pierwsza.wymagania] == [
        w.kanoniczny_json() for w in druga.wymagania
    ]
    for rekord in pierwsza.wymagania:
        assert "NaN" not in rekord.kanoniczny_json()
        assert WynikWymagania.model_validate_json(rekord.model_dump_json()) == rekord
