"""Zakaz gazów fluorowanych w obiektach projektowanych — reguła liścia i dane katalogu.

PO CO. Dyrektywa właściciela 2026-10-28 („nowe pola nie mogą być w SF6") i rozporządzenie (UE)
2024/573, art. 13 ust. 9 lit. a (rozdzielnice SN do 24 kV od 2026-01-01) i lit. b (powyżej
24 kV do 52 kV od 2030-01-01). Ust. 10 (przeniesienie) i ust. 7 (serwis) dotyczą wyłącznie
aparatów istniejących. Reguła mieszka w JEDNYM miejscu
(`network_model.catalog.gazy_fluorowane.odmowa_gazu_fluorowanego_pl`); ten moduł przypina:

1. tabelę reguły jako iloczyn cech: stan obiektu {ISTNIEJACY, PROJEKTOWANY, nieustalony} ×
   gaz pozycji {z gazem, bez gazu, nierozstrzygnięty};
2. medium: SF₆ i mieszaniny fluoronitrylu i fluoroketonu są gazem fluorowanym, próżnia
   i powietrze nie (wielkość liter i spacje bez znaczenia);
3. dane katalogu, na których reguła stoi (deklaracje w docstringach liścia i rodziny):
   każdy aparat SN przerywający prąd (wyłącznik, rozłącznik, reklozer — obie przestrzenie
   katalogu) deklaruje medium wprost, a medium niepodane mają wyłącznie aparaty bez komory
   gaszeniowej (odłącznik, uziemnik, bezpiecznik); każda rodzina rozdzielnic deklaruje
   medium łączników;
4. wyprowadzenie gazu rodziny z dwóch osi (izolacja × medium łączników) — iloczyn;
5. pokrycie wariantów wykonania bez gazów fluorowanych (AIS, SSIS, gazowa bez F) i aparat
   bez gazu dla każdego rodzaju przerywającego w obu klasach napięcia (12 kV, 24 kV).
"""

from __future__ import annotations

import itertools

import pytest
from enm.katalog_projektu import katalog_biezacy
from network_model.catalog.gazy_fluorowane import (
    AKCJA_NAPRAWCZA_GAZU_FLUOROWANEGO_PL,
    MEDIA_ZE_GAZEM_FLUOROWANYM,
    NAZWY_STANOW_OBIEKTU_PL,
    STANY_OBIEKTU,
    czy_gaz_fluorowany_dopuszczony,
    czy_medium_z_gazem_fluorowanym,
    odmowa_gazu_fluorowanego_pl,
)
from network_model.catalog.switchgear.families import SWITCHGEAR_FAMILY_REGISTRY
from network_model.catalog.switchgear.switchgear_family import SwitchgearFamily

# ---------------------------------------------------------------------------
# 1. Reguła — iloczyn stan × gaz
# ---------------------------------------------------------------------------

STANY = ("ISTNIEJACY", "PROJEKTOWANY", None)
GAZY = (True, False, None)


@pytest.mark.parametrize(("stan", "gaz"), list(itertools.product(STANY, GAZY)))
def test_regula_iloczyn_stan_x_gaz(stan: str | None, gaz: bool | None) -> None:
    powod = odmowa_gazu_fluorowanego_pl("Pole X", gaz_fluorowany=gaz, stan_obiektu=stan)
    if stan == "ISTNIEJACY":
        # Art. 13 ust. 10 i ust. 7 — obiekt istniejący może mieć SF₆.
        assert powod is None
    elif gaz is False:
        assert powod is None
    else:
        # Obiekt projektowany ALBO stan nieustalony (brak danej nie zwalnia z zakazu);
        # gaz potwierdzony albo nierozstrzygnięty (brak potwierdzenia ≠ brak gazu).
        assert powod is not None
        assert powod.startswith("Pole X ")
        assert "2024/573" in powod and "art. 13 ust. 9" in powod
        assert powod.endswith(f"Akcja naprawcza: {AKCJA_NAPRAWCZA_GAZU_FLUOROWANEGO_PL}.")
        tresc = "wykorzystuje gaz fluorowany" if gaz is True else "nie potwierdza wykonania"
        assert tresc in powod


def test_dopuszczenie_wylacznie_dla_istniejacego() -> None:
    assert [s for s in STANY if czy_gaz_fluorowany_dopuszczony(s)] == ["ISTNIEJACY"]
    assert set(STANY_OBIEKTU) == {"ISTNIEJACY", "PROJEKTOWANY"}
    assert set(NAZWY_STANOW_OBIEKTU_PL) == set(STANY_OBIEKTU)


@pytest.mark.parametrize(
    ("medium", "gaz"),
    [
        ("SF6", True),
        ("sf6", True),
        (" SF6 ", True),
        ("C4-FN", True),
        ("C5-FK", True),
        ("VACUUM", False),
        ("AIR", False),
        ("", False),
        (None, False),
    ],
)
def test_medium_z_gazem_fluorowanym(medium: str | None, gaz: bool) -> None:
    assert czy_medium_z_gazem_fluorowanym(medium) is gaz


def test_zbior_mediow_obejmuje_kazdy_gaz_fluorowany() -> None:
    assert {"SF6", "C4-FN", "C5-FK"} == MEDIA_ZE_GAZEM_FLUOROWANYM


# ---------------------------------------------------------------------------
# 2. Dane katalogu — medium każdego aparatu przerywającego SN
# ---------------------------------------------------------------------------

#: Rodzaje przerywające prąd (komora gaszeniowa) w obu przestrzeniach katalogu SN.
RODZAJE_PRZERYWAJACE_LACZNIKA = frozenset({"CIRCUIT_BREAKER", "LOAD_SWITCH", "RECLOSER"})
RODZAJE_PRZERYWAJACE_APARATU = frozenset({"WYLACZNIK", "ROZLACZNIK", "REKLOZER"})
#: Granica SN zakazu (art. 13 ust. 9 lit. b: do 52 kV). Wyłącznik 110 kV (typ minimalny
#: topologii zasilania) leży poza zakresem rozporządzenia dla SN i poza kartą (WN bez zmian).
GRANICA_SN_KV = 52.0


def test_kazdy_lacznik_przerywajacy_sn_deklaruje_medium() -> None:
    katalog = katalog_biezacy()
    bez_medium = sorted(
        ref
        for ref, typ in katalog.switch_equipment_types.items()
        if typ.equipment_kind in RODZAJE_PRZERYWAJACE_LACZNIKA
        and typ.un_kv <= GRANICA_SN_KV
        and not (typ.medium or "").strip()
    )
    assert not bez_medium, bez_medium


def test_kazdy_aparat_przerywajacy_sn_deklaruje_medium() -> None:
    katalog = katalog_biezacy()
    bez_medium = sorted(
        ref
        for ref, typ in katalog.mv_apparatus_types.items()
        if typ.device_kind in RODZAJE_PRZERYWAJACE_APARATU
        and typ.u_n_kv <= GRANICA_SN_KV
        and not (typ.medium or "").strip()
    )
    assert not bez_medium, bez_medium


def test_medium_niepodane_wylacznie_bez_komory_gaszeniowej() -> None:
    """Deklaracja liścia: medium niepodane mają wyłącznie odłącznik, uziemnik, bezpiecznik
    (oraz wyłącznik WN spoza zakresu SN)."""
    katalog = katalog_biezacy()
    rodzaje = {
        typ.equipment_kind
        for typ in katalog.switch_equipment_types.values()
        if not (typ.medium or "").strip() and typ.un_kv <= GRANICA_SN_KV
    }
    assert rodzaje <= {"DISCONNECTOR", "EARTH_SWITCH", "FUSE"}, rodzaje


@pytest.mark.parametrize("un_kv", [12.0, 24.0])
@pytest.mark.parametrize("rodzaj", sorted(RODZAJE_PRZERYWAJACE_APARATU - {"REKLOZER"}))
def test_istnieje_aparat_bez_gazu_kazdego_rodzaju_i_klasy_napiecia(
    rodzaj: str, un_kv: float
) -> None:
    """Pole projektowane ma czym zastąpić aparat z SF₆: rodzaj × klasa napięcia."""
    katalog = katalog_biezacy()
    assert any(
        typ.device_kind == rodzaj
        and typ.u_n_kv >= un_kv
        and (typ.medium or "").strip()
        and not czy_medium_z_gazem_fluorowanym(typ.medium)
        for typ in katalog.mv_apparatus_types.values()
    ), (rodzaj, un_kv)


def test_rozlaczniki_ogolne_bez_gazu_sa_wartosciami_roboczymi() -> None:
    """Typ ogólny bez producenta nigdy nie udaje karty wyrobu (ZASADA NR 4)."""
    katalog = katalog_biezacy()
    for ref in ("sw-ls-ogolny-prozniowy-12kv-630a", "sw-ls-ogolny-prozniowy-24kv-630a"):
        typ = katalog.switch_equipment_types[ref]
        assert typ.equipment_kind == "LOAD_SWITCH"
        assert typ.medium == "VACUUM"
        assert typ.verification_status == "REFERENCYJNY"
        statusy = typ.card_field_status or {}
        assert statusy, ref
        assert all(s.get("quality") == "ESTIMATED" for s in statusy.values()), statusy


# ---------------------------------------------------------------------------
# 3. Rodziny — dwie osie gazu, deklaracja w każdej rodzinie
# ---------------------------------------------------------------------------


def test_kazda_rodzina_deklaruje_medium_lacznikow_i_izolacje() -> None:
    braki = sorted(
        ref
        for ref, rodzina in SWITCHGEAR_FAMILY_REGISTRY.items()
        if rodzina.medium_lacznikow is None or rodzina.insulation_type == "unknown"
    )
    assert not braki, braki


IZOLACJE = ("air", "ssis", "gaz_bez_f", "sf6", "unknown")
MEDIA_LACZNIKOW = ("SF6", "PROZNIA", "POWIETRZE", "KATALOG_APARATOW", None)


@pytest.mark.parametrize(("izolacja", "medium"), list(itertools.product(IZOLACJE, MEDIA_LACZNIKOW)))
def test_gaz_rodziny_iloczyn_izolacja_x_medium(izolacja: str, medium: str | None) -> None:
    wzorzec = next(iter(SWITCHGEAR_FAMILY_REGISTRY.values()))
    rodzina = SwitchgearFamily.model_validate(
        {**wzorzec.model_dump(), "insulation_type": izolacja, "medium_lacznikow": medium}
    )
    if izolacja == "sf6" or medium == "SF6":
        oczekiwany: bool | None = True
    elif izolacja == "unknown" or medium is None:
        oczekiwany = None
    else:
        oczekiwany = False
    assert rodzina.gaz_fluorowany is oczekiwany
    # Pole projektowane: jedna reguła; pole istniejące: wyłącznie oś statusu rodziny.
    assert rodzina.dopuszczona_do_nowych_pol is (
        rodzina.dopuszczona_do_budowania and oczekiwany is False
    )
    assert rodzina.powod_odmowy_dla_stanu("ISTNIEJACY") == rodzina.powod_blokady_pl


@pytest.mark.parametrize("izolacja", ["air", "ssis", "gaz_bez_f"])
def test_kazdy_wariant_wykonania_bez_gazu_ma_rodzine_dla_nowych_pol(izolacja: str) -> None:
    rodziny = [
        r
        for r in SWITCHGEAR_FAMILY_REGISTRY.values()
        if r.insulation_type == izolacja and r.dopuszczona_do_nowych_pol
    ]
    assert rodziny, izolacja


def test_rodziny_z_gazem_zostaja_w_katalogu_dla_pol_istniejacych() -> None:
    """SF₆ zostaje w katalogu (inwentaryzacja pól istniejących), a picker nowych pól je
    odfiltrowuje — rodzina z gazem jest dopuszczona do budowania, nie do nowych pól."""
    z_gazem = [r for r in SWITCHGEAR_FAMILY_REGISTRY.values() if r.gaz_fluorowany is True]
    assert z_gazem
    for rodzina in z_gazem:
        assert not rodzina.dopuszczona_do_nowych_pol
        powod = rodzina.powod_blokady_nowych_pol_pl or ""
        assert rodzina.powod_blokady_pl or AKCJA_NAPRAWCZA_GAZU_FLUOROWANEGO_PL in powod
