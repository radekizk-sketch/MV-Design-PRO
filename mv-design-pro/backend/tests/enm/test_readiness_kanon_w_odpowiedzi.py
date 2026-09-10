"""Testy DROGI kanonu kodow gotowosci do odpowiedzi operacji domenowej (V12K-271).

Do tej karty priorytet kanoniczny (`ReadinessCodeSpec.priority`) docieral wylacznie
do punktu koncowego gotowosci inzynierskiej (`api/enm.py`). Odpowiedz operacji
domenowej — z ktorej czyta CALA powloka ui2 (pulpit projektu, panel gotowosci) —
nie niosla go w ogole, wiec kazde szeregowanie blokad po stronie przegladarki
musialoby byc heurystyka. Wzbogacenie jest ADDYTYWNE: dokladane sa wylacznie
klucze `canonical_*`, zaden istniejacy klucz nie zmienia sie ani nie znika.

KLASA, NIE INSTANCJA: wzbogacenie dziala na CALYCH listach `blockers`/`warnings`
na koncu `_build_readiness`, wiec obejmuje zarowno zgloszenia walidatora ENM, jak
i zgloszenia domenowe dokladane pozniej w tej samej funkcji. Testy nizej pilnuja
obu grup ORAZ tego, ze kod bez rzetelnego odwzorowania NIE dostaje nic.
"""

from __future__ import annotations

from domain.canonical_operations import READINESS_CODES
from domain.readiness_bridge import ODWZOROWANIE_WALIDATOR_NA_KANON
from enm.domain_operations import _build_readiness, _wzbogac_o_kanon

KLUCZE_KANONU = {
    "canonical_code",
    "canonical_level",
    "canonical_priority",
    "canonical_area",
    "canonical_message_pl",
    "canonical_fix_navigation",
}


def _zgloszenie(code: str, element_ref: str | None = None) -> dict:
    return {
        "code": code,
        "message_pl": "Komunikat walidatora.",
        "element_ref": element_ref,
        "severity": "BLOKUJACE",
    }


# ---------------------------------------------------------------------------
# Wzbogacenie pojedynczych zgloszen
# ---------------------------------------------------------------------------


def test_kod_walidatora_z_odwzorowaniem_dostaje_priorytet_kanoniczny() -> None:
    zgloszenia = [_zgloszenie("E001", "GPZ-1")]
    _wzbogac_o_kanon(zgloszenia)

    spec = READINESS_CODES[ODWZOROWANIE_WALIDATOR_NA_KANON["E001"]]
    assert zgloszenia[0]["canonical_code"] == spec.code
    assert zgloszenia[0]["canonical_priority"] == spec.priority
    assert zgloszenia[0]["canonical_level"] == spec.level.value
    assert zgloszenia[0]["canonical_area"] == spec.area.value


def test_kod_juz_kanoniczny_dostaje_swoj_wlasny_priorytet() -> None:
    zgloszenia = [_zgloszenie("source.sk3_invalid", "GPZ-1")]
    _wzbogac_o_kanon(zgloszenia)

    assert zgloszenia[0]["canonical_code"] == "source.sk3_invalid"
    assert zgloszenia[0]["canonical_priority"] == READINESS_CODES["source.sk3_invalid"].priority


def test_kod_bez_odwzorowania_nie_dostaje_ZADNEGO_pola_kanonicznego() -> None:
    """Brak priorytetu jest DANA, nie luka do zalatania najblizszym kodem."""
    zgloszenia = [_zgloszenie("switch.catalog_ref_missing", "SW-1")]
    _wzbogac_o_kanon(zgloszenia)

    assert KLUCZE_KANONU.isdisjoint(zgloszenia[0].keys())


def test_wzbogacenie_nie_rusza_istniejacych_kluczy() -> None:
    """Addytywnosc: tresc walidatora zostaje nietknieta (kanon jej nie podmienia)."""
    zgloszenia = [_zgloszenie("E001", "GPZ-1")]
    przed = dict(zgloszenia[0])
    _wzbogac_o_kanon(zgloszenia)

    for klucz, wartosc in przed.items():
        assert zgloszenia[0][klucz] == wartosc


def test_wzbogacenie_jest_idempotentne() -> None:
    zgloszenia = [_zgloszenie("E001", "GPZ-1")]
    _wzbogac_o_kanon(zgloszenia)
    pierwszy = dict(zgloszenia[0])
    _wzbogac_o_kanon(zgloszenia)

    assert zgloszenia[0] == pierwszy


def test_pusta_lista_nie_wywraca_wzbogacenia() -> None:
    zgloszenia: list[dict] = []
    _wzbogac_o_kanon(zgloszenia)
    assert zgloszenia == []


def test_zgloszenie_bez_klucza_code_nie_wywraca_wzbogacenia() -> None:
    zgloszenia = [{"message_pl": "bez kodu", "element_ref": None, "severity": "BLOKUJACE"}]
    _wzbogac_o_kanon(zgloszenia)
    assert KLUCZE_KANONU.isdisjoint(zgloszenia[0].keys())


# ---------------------------------------------------------------------------
# Wzbogacenie w pelnej sciezce `_build_readiness`
# ---------------------------------------------------------------------------


def _enm_pusty() -> dict:
    from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader

    enm = EnergyNetworkModel(
        header=ENMHeader(name="test", defaults=ENMDefaults(sn_nominal_kv=15.0)),
    )
    return enm.model_dump(mode="json")


def test_odpowiedz_gotowosci_niesie_priorytet_dla_braku_zrodla() -> None:
    """Pusty model zglasza brak zrodla (E001) — i ma teraz priorytet w odpowiedzi."""
    readiness, _fix_actions = _build_readiness(_enm_pusty())

    zgloszenia = list(readiness["blockers"]) + list(readiness["warnings"])
    z_kanonem = [z for z in zgloszenia if "canonical_priority" in z]
    assert z_kanonem, "zaden wpis gotowosci pustego modelu nie dostal priorytetu kanonicznego"
    for wpis in z_kanonem:
        assert isinstance(wpis["canonical_priority"], int)
        assert wpis["canonical_code"] in READINESS_CODES


def test_kazde_zgloszenie_z_polem_kanonicznym_ma_KOMPLET_pol() -> None:
    """Polowiczne wzbogacenie byloby gorsze od zadnego — konsument nie wie, co dostal."""
    readiness, _ = _build_readiness(_enm_pusty())

    for wpis in list(readiness["blockers"]) + list(readiness["warnings"]):
        obecne = KLUCZE_KANONU & set(wpis.keys())
        assert obecne in (set(), KLUCZE_KANONU), f"niepelny kanon w zgloszeniu: {wpis['code']}"


def test_wzbogacenie_nie_zmienia_werdyktu_gotowosci() -> None:
    """Kanon dokłada TRESC, nie zmienia decyzji — `ready` i liczby bez zmian."""
    enm = _enm_pusty()
    readiness, _ = _build_readiness(enm)

    liczba_blokad = len(readiness["blockers"])
    liczba_ostrzezen = len(readiness["warnings"])
    gotowosc = readiness["ready"]

    # Powtorne wywolanie na tym samym modelu daje ten sam werdykt (determinizm).
    powtorka, _ = _build_readiness(enm)
    assert powtorka["ready"] == gotowosc
    assert len(powtorka["blockers"]) == liczba_blokad
    assert len(powtorka["warnings"]) == liczba_ostrzezen


# ---------------------------------------------------------------------------
# Odbiór CV-3.3-B: `sources.bus_missing` walidatora → kanon `source.connection_missing`
# ---------------------------------------------------------------------------


def test_zrodlo_bez_szyny_ma_droge_do_kanonu() -> None:
    """Jedyny dawny emiter `source.connection_missing` był w skasowanym R2 —
    droga do projektanta prowadzi odtąd z walidatora ENM przez most."""
    assert ODWZOROWANIE_WALIDATOR_NA_KANON["sources.bus_missing"] == "source.connection_missing"
    spec = READINESS_CODES["source.connection_missing"]
    zgloszenia = [_zgloszenie("sources.bus_missing", "src_1")]
    _wzbogac_o_kanon(zgloszenia)
    assert zgloszenia[0]["canonical_code"] == "source.connection_missing"
    assert zgloszenia[0]["canonical_priority"] == spec.priority
    assert zgloszenia[0]["canonical_fix_navigation"] == spec.fix_navigation
