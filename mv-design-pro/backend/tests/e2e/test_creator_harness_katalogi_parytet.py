"""Parytet identyfikatorow katalogowych: harness/e2e frontu vs BACKEND (autorytet).

PO CO TEN PLIK (karta FAB-L, §0 L6, 2026-09-05). Harness e2e
(`frontend/src/creator-harness-main.tsx`) mockowal 18 tras katalogowych
bezstanowych/deterministycznych, czesciowo REALNYMI danymi, czesciowo
identyfikatorami ZMYSLONYMI (`pv-1`, `bess-1`, `fw-1`, `rel-1`, `ct-1`, `vt-1`,
`lv-1`, `kab-120`...), ktore walidator backendu (`enm.domain_operations_v2`)
odrzucal, gdy scena probowala je faktycznie zapisac przez REALNE API. Atrapy
tych tras zostaly USUNIETE (kreator idzie dzis do prawdziwego backendu przez
proxy Vite) — ale bez tego testu regres wracalby CICHO: ktos dopisze nowa
scene z wygodnym `device_catalog_ref: 'pv-2'` i nikt tego nie zlapie, dopoki
QA recznie nie sprobuje zapisac.

CO PILNUJE TEN PLIK:

1. Dane scen harnessu — kazda referencja katalogowa MUSI istniec w realnym
   katalogu backendu, z ktorego picker faktycznie czyta (nie w drugiej,
   rownoleglej licie utrzymywanej recznie w tescie — patrz
   `_nieznane_referencje_katalogowe` nizej, ktora jest DOKLADNIE tym samym
   predykatem, ktorego uzywa `set_der_catalog_bindings`).

   GDZIE TE DANE ZYJA (karta HARNESS-RESZTA-2, 2026-09-17). Wczesniej byly to
   recznie pisane rekordy `derDemo({...})` w `creator-harness-main.tsx` i test
   czytal je regexem. Rekordow juz NIE MA: kazda scena harnessu jest dzis
   zasilana FIKSTURA wygenerowana z REALNEGO biegu backendu
   (`backend/scripts/eksport_fixtur_harnessu.py` -> `frontend/src/
   harness-fixtures/generated/*.json`, parytet bajtowy pilnuje
   `tests/ci/test_fixtury_harnessu.py`). Parytet czyta wiec fikstury —
   STRUKTURALNIE (JSON), nie regexem — a skan `.tsx` zostaje jako pulapka na
   nawrot: gdyby ktos znow wpisal referencje recznie do harnessu, wpadnie w te
   same asercje (suma zbiorow `_wartosci_pola` + `_wartosci_klucza_z_fikstur`).
2. Wybrane atrapowe specy e2e (`creator-screenshot.spec.ts`,
   `fk7-dobor-screenshot.spec.ts`, `kreator-oze-max.spec.ts`), ktore prowadza
   klik po prawdziwym `<select>` zasilanym dzis realnym backendem — te same
   pola, ta sama zasada.
3. Sanity: kazde wyodrebnianie MUSI cos znalezc (niepusty zbior). Test, ktory
   milczaco przechodzi bo wzorzec przestal pasowac (np. po przeformatowaniu
   pliku), jest fałszywą pewnością (reguła KLASA NIE INSTANCJA #4) — gorszy niz
   brak testu, bo usypia czujnosc.

HISTORIA ZAKRESU (korekta 2026-09-17). Wczesniejsza wersja tego naglowka
wylaczala z parytetu `catalog_ref` kandydatow doboru kompensacji jako „wynik
analizy, nigdy nie odsylany do pickera". Wylaczenie bylo zbedne: fikstura
`kompensacja_scena_wynik.json` niesie dzis referencje `KOMP_SN_0V6_15KV`/
`KOMP_SN_1V2_15KV`/`KOMP_SN_2V4_15KV`, ktore ISTNIEJA w katalogu
`KOMPENSATOR_SN` (pomiar) i przechodza parytet jak kazda inna referencja.
Wynik analizy tez wskazuje realny sprzet — i tak ma byc.

Test nie uruchamia TypeScriptu ani Playwrighta: fikstury czyta jako JSON,
pliki frontu jako TEKST. Swiadomy wybor — parytet ma dzialac w zwyklym biegu
pytest, bez node'a w petli.
"""

from __future__ import annotations

import json
import re
from collections.abc import Callable
from functools import lru_cache
from pathlib import Path
from typing import Any

import pytest

_FRONTEND_ROOT = Path(__file__).resolve().parents[3] / "frontend"
_HARNESS_TS = _FRONTEND_ROOT / "src" / "creator-harness-main.tsx"
_FIKSTURY_DIR = _FRONTEND_ROOT / "src" / "harness-fixtures" / "generated"
_E2E_DIR = _FRONTEND_ROOT / "e2e"


#: Referencje katalogowe scen zbudowanych na SIECI ZLOTEJ
#: (`backend/tests/cgmes/golden_enm.py::build_golden_enm`), ktorych realny
#: katalog NIE ZNA — scena „pulpit"/„siec zlota"/„zbieznosc"/„skladowe".
#:
#: POMIAR (2026-09-17): 7 referencji z 21 unikalnych w fiksturach. Elementy
#: sieci zlotej deklaruja `parameter_source="CATALOG"`, ale ich parametry sa
#: WPISANE WPROST w budowniczym testowym — zadna materializacja nie zaszla
#: (`materialized_params` puste), wiec identyfikatory nigdy nie musialy
#: istniec. To dlug PRODUKTOWY (deklaracja pochodzenia bez pokrycia), nie
#: usterka harnessu: naprawa = materializacja sieci zlotej z realnego katalogu,
#: czyli INNE parametry kazdego elementu, a przez to inne wyniki WSZYSTKICH
#: rodzin analiz — lacznie z zamrozonym zbiorem odniesienia
#: `tests/golden/parytet_scenariuszy/zlote_hashe.json` (baseline SPRZED
#: migracji `apply_scenario`, ktorego przeliczenie kasuje jego wartosc
#: dowodowa). Decyzja o przeliczeniu kanonu nalezy do wlasciciela — do tego
#: czasu zbior jest ZAMKNIETY i zapadkowy: kazda NOWA referencja bez pokrycia
#: wywala test (nie wolno jej tu dopisac „bo tak bylo"), a znikniecie wpisu
#: rowniez (naprawa sieci zlotej ma wrocic tu jako zmiana tej listy).
_REFERENCJE_SIECI_ZLOTEJ_BEZ_POKRYCIA: frozenset[tuple[str | None, str]] = frozenset(
    {
        ("KABEL_SN", "cable-yakxs-3x120"),
        ("LINIA_SN", "line-afl-70"),
        ("TRAFO_SN_NN", "tr-110-15-25mva-ynd11"),
        ("TRAFO_SN_NN", "tr-15-04-630kva-dyn11"),
        ("ZRODLO_SN", "src-gpz-110kv-2500mva"),
        # Wytworcy sieci zlotej niosą GOLĄ referencje (bez `catalog_namespace`),
        # wiec nie sa wiazaniem katalogowym w rozumieniu `CatalogBinding`.
        (None, "gen-sync-2mva"),
        (None, "conv-pv-nn-0p5mw"),
    }
)


def _tekst(path: Path) -> str:
    if not path.is_file():  # pragma: no cover - zabezpieczenie przed przeniesieniem pliku
        pytest.fail(f"Brak pliku {path} — parytet nie ma czego porownac.")
    return path.read_text(encoding="utf-8")


def _wartosci_pola(source: str, pole: str) -> set[str]:
    """Wartosci przypisane do `pole: '...'` w zrodle TS.

    `\\s` (nie tylko spacja) miedzy dwukropkiem a literalem — Prettier zawija
    dlugie wartosci (np. `ptpiree_certificate_ref`) na osobny wiersz.
    """
    return set(re.findall(rf"\b{re.escape(pole)}\s*:\s*\n?\s*'([^']+)'", source))


def _wartosci_select(source: str, testid: str) -> set[str]:
    """Wartosci `.selectOption('...')` wywolane na `getByTestId('<testid>')` w specu e2e."""
    wzorzec = re.compile(
        r"getByTestId\('" + re.escape(testid) + r"'\)\s*\.selectOption\('([^']+)'\)"
    )
    return set(wzorzec.findall(source))


def _identyfikatory_porownan(source: str) -> set[str]:
    """Identyfikatory porownywane w specu e2e wprost: `t.id === '...'` (wybor pozycji
    REALNEGO katalogu po odpowiedzi backendu — E2E-FULL-FIX-2, karta FAB-L L6)."""
    return set(re.findall(r"\.id\s*===\s*'([^']+)'", source))


@lru_cache(maxsize=1)
def _fikstury_scen() -> tuple[tuple[str, Any], ...]:
    """(nazwa pliku, dane) kazdej fikstury sceny harnessu.

    Fikstury powstaja z REALNYCH biegow backendu i sa danymi WSZYSTKICH scen —
    patrz docstring modulu. Pusty katalog konczy test bledem, nie cisza.
    """
    pliki = sorted(_FIKSTURY_DIR.glob("*.json"))
    if not pliki:  # pragma: no cover - zabezpieczenie przed przeniesieniem katalogu
        pytest.fail(f"Brak fikstur scen w {_FIKSTURY_DIR} — parytet nie ma czego porownac.")
    return tuple((p.name, json.loads(p.read_text(encoding="utf-8"))) for p in pliki)


def _przejdz(wezel: Any, odwiedz: Callable[[dict[str, Any]], None]) -> None:
    """Rekurencyjny przejazd po strukturze JSON (slowniki i listy, dowolna glebokosc).

    Fikstury roznia sie ksztaltem (migawka ENM, wynik analizy, slad) i te same
    pola siedza na roznych glebokosciach — przejazd po CALOSCI jest jedynym
    sposobem, zeby parytet obejmowal KLASE („kazda referencja w danych scen"),
    a nie wybrane sciezki, ktore ktos pamietal (regula KLASA NIE INSTANCJA #1).
    """
    if isinstance(wezel, dict):
        odwiedz(wezel)
        for podwezel in wezel.values():
            _przejdz(podwezel, odwiedz)
    elif isinstance(wezel, list):
        for podwezel in wezel:
            _przejdz(podwezel, odwiedz)


def _wartosci_klucza_z_fikstur(klucz: str) -> set[str]:
    """Wartosci tekstowe pola `klucz` wystepujace GDZIEKOLWIEK w fiksturach scen."""
    znalezione: set[str] = set()

    def odwiedz(slownik: dict[str, Any]) -> None:
        wartosc = slownik.get(klucz)
        if isinstance(wartosc, str) and wartosc:
            znalezione.add(wartosc)

    for _, dane in _fikstury_scen():
        _przejdz(dane, odwiedz)
    return znalezione


def _wiazania_katalogowe_z_fikstur() -> dict[tuple[str, str], tuple[str | None, set[str]]]:
    """(catalog_namespace, identyfikator) -> (wersja katalogu, fikstury, w ktorych wystepuje).

    Wiazanie katalogowe to para PRZESTRZEN + IDENTYFIKATOR (kontrakt
    `CatalogBinding`), niezaleznie od tego, czy element zapisal je jako
    `catalog_ref` (element ENM) czy `catalog_item_id` (zapis wiazania w
    `meta.catalog_binding`/`catalog_context`).
    """
    wiazania: dict[tuple[str, str], tuple[str | None, set[str]]] = {}

    for nazwa, dane in _fikstury_scen():

        def odwiedz(slownik: dict[str, Any], _nazwa: str = nazwa) -> None:
            przestrzen = slownik.get("catalog_namespace")
            identyfikator = slownik.get("catalog_ref") or slownik.get("catalog_item_id")
            if not isinstance(przestrzen, str) or not isinstance(identyfikator, str):
                return
            parametry = slownik.get("materialized_params")
            wersja = slownik.get("catalog_item_version")
            if not isinstance(wersja, str) and isinstance(parametry, dict):
                wersja = parametry.get("catalog_item_version")
            klucz = (przestrzen, identyfikator)
            poprzednia, zrodla = wiazania.get(klucz, (None, set()))
            zrodla.add(_nazwa)
            wiazania[klucz] = (
                poprzednia or (wersja if isinstance(wersja, str) else None),
                zrodla,
            )

        _przejdz(dane, odwiedz)
    return wiazania


def _gole_referencje_katalogowe_z_fikstur() -> dict[str, set[str]]:
    """`catalog_ref` BEZ `catalog_namespace` -> fikstury, w ktorych wystepuje.

    Taka referencja nie jest wiazaniem (`CatalogBinding` wymaga przestrzeni),
    ale nadal wskazuje pozycje katalogu — i nadal moze byc zmyslona, wiec
    parytet sprawdza ja wobec WSZYSTKICH przestrzeni katalogu.
    """
    gole: dict[str, set[str]] = {}

    for nazwa, dane in _fikstury_scen():

        def odwiedz(slownik: dict[str, Any], _nazwa: str = nazwa) -> None:
            identyfikator = slownik.get("catalog_ref")
            if not isinstance(identyfikator, str) or not identyfikator:
                return
            if isinstance(slownik.get("catalog_namespace"), str):
                return
            gole.setdefault(identyfikator, set()).add(_nazwa)

        _przejdz(dane, odwiedz)
    return gole


class TestHarnessDaneScen:
    """Dane scen harnessu (fikstury z realnych biegow) wskazuja REALNE pozycje katalogu."""

    def test_wiazania_katalogowe_scen_wskazuja_realne_pozycje_katalogu(self) -> None:
        """Kazde wiazanie PRZESTRZEN+IDENTYFIKATOR materializuje sie w realnym katalogu.

        Predykat to `materialize_catalog_binding` — DOKLADNIE ta funkcja, ktora
        materializuje parametry elementu w produkcji (`materialize_snapshot_elements`),
        wiec test nie odtwarza logiki „PV z listy falownikow PV, BESS z listy BESS"
        drugi raz: przestrzen wiazania sama wybiera katalog (regula KLASA NIE
        INSTANCJA #3 — jedno zrodlo prawdy dla warunku wejscia i wyjscia).
        """
        from network_model.catalog import get_default_mv_catalog
        from network_model.catalog.materialization import materialize_catalog_binding
        from network_model.catalog.types import CatalogBinding

        wiazania = _wiazania_katalogowe_z_fikstur()
        assert wiazania, (
            "Zadna fikstura sceny nie niesie wiazania katalogowego — fikstury "
            "zmienily ksztalt albo katalog fikstur jest pusty. Test milczaco "
            "przechodzacy bez znalezisk jest falszywa pewnoscia."
        )

        katalog = get_default_mv_catalog()
        bez_pokrycia: set[tuple[str | None, str]] = set()
        for (przestrzen, identyfikator), (wersja, zrodla) in sorted(wiazania.items()):
            wynik = materialize_catalog_binding(
                CatalogBinding(
                    catalog_namespace=przestrzen,
                    catalog_item_id=identyfikator,
                    # Wersja NIE bierze udzialu w wyszukaniu pozycji (laduje tylko
                    # w sladzie audytowym `MaterializationAuditEntry`) — wiazania
                    # bez zapisanej wersji dostaja "1.0", bo `CatalogBinding`
                    # wymaga niepustego pola.
                    catalog_item_version=wersja or "1.0",
                ),
                katalog,
            )
            if wynik.success:
                continue
            assert wynik.error_code == "catalog.item_not_found", (
                f"Wiazanie {przestrzen}/{identyfikator} (fikstury: {sorted(zrodla)}) "
                f"nie zmaterializowalo sie z powodu INNEGO niz brak pozycji: "
                f"{wynik.error_code} — {wynik.error_message_pl}"
            )
            bez_pokrycia.add((przestrzen, identyfikator))

        oczekiwane = {para for para in _REFERENCJE_SIECI_ZLOTEJ_BEZ_POKRYCIA if para[0] is not None}
        assert bez_pokrycia == oczekiwane, (
            "Zbior wiazan bez pokrycia w katalogu ZMIENIL SIE.\n"
            f"  nowe (defekt — referencja, ktorej katalog nie zna): "
            f"{sorted(bez_pokrycia - oczekiwane)}\n"
            f"  zniknely (jesli to naprawa sieci zlotej — zdejmij wpis z "
            f"`_REFERENCJE_SIECI_ZLOTEJ_BEZ_POKRYCIA`): {sorted(oczekiwane - bez_pokrycia)}"
        )

    def test_gole_referencje_katalogowe_scen_istnieja_w_jakiejs_przestrzeni(self) -> None:
        """`catalog_ref` bez `catalog_namespace` tez musi wskazywac realna pozycje.

        Gola referencja nie jest wiazaniem (`CatalogBinding` wymaga przestrzeni),
        wiec poprzedni test jej nie widzi — a zmyslic ja rownie latwo. Pytamy
        wiec kazda przestrzen katalogu: „znasz ten identyfikator?".
        """
        from network_model.catalog import get_default_mv_catalog
        from network_model.catalog.materialization import materialize_catalog_binding
        from network_model.catalog.types import CatalogBinding, CatalogNamespace

        gole = _gole_referencje_katalogowe_z_fikstur()
        assert gole, (
            "Zadna fikstura sceny nie niesie golej referencji katalogowej — "
            "wzorzec przestal pasowac (zmiana ksztaltu fikstur?)."
        )

        katalog = get_default_mv_catalog()
        bez_pokrycia: dict[str, set[str]] = {}
        for identyfikator, zrodla in sorted(gole.items()):
            trafienie = any(
                materialize_catalog_binding(
                    CatalogBinding(
                        catalog_namespace=przestrzen.value,
                        catalog_item_id=identyfikator,
                        catalog_item_version="1.0",
                    ),
                    katalog,
                ).success
                for przestrzen in CatalogNamespace
            )
            if not trafienie:
                bez_pokrycia[identyfikator] = zrodla

        oczekiwane = {
            identyfikator
            for przestrzen, identyfikator in _REFERENCJE_SIECI_ZLOTEJ_BEZ_POKRYCIA
            if przestrzen is None
        }
        assert set(bez_pokrycia) == oczekiwane, (
            "Zbior golych referencji bez pokrycia w katalogu ZMIENIL SIE.\n"
            f"  nowe (defekt — zadna przestrzen katalogu nie zna tego "
            f"identyfikatora): "
            f"{ {ref: sorted(bez_pokrycia[ref]) for ref in sorted(set(bez_pokrycia) - oczekiwane)} }\n"
            f"  zniknely (jesli to naprawa sieci zlotej — zdejmij wpis z "
            f"`_REFERENCJE_SIECI_ZLOTEJ_BEZ_POKRYCIA`): "
            f"{sorted(oczekiwane - set(bez_pokrycia))}"
        )

    def test_battery_catalog_ref_istnieje_w_katalogu_baterii_bess(self) -> None:
        from network_model.catalog import get_default_mv_catalog

        refy = _wartosci_klucza_z_fikstur("battery_catalog_ref") | _wartosci_pola(
            _tekst(_HARNESS_TS), "battery_catalog_ref"
        )
        assert refy, "Brak battery_catalog_ref w danych scen — scena 'macierz' zniknela?"

        katalog = get_default_mv_catalog()
        for ref in refy:
            assert katalog.get_bess_battery_type(ref) is not None, (
                f"battery_catalog_ref='{ref}' nie istnieje w katalogu BATERIA_BESS "
                f"(`get_default_mv_catalog().get_bess_battery_type`) — dokladnie ten "
                f"predykat uzywa `_materializuj_bateria_bess`."
            )

    def test_protection_ct_vt_dynamic_model_refy_znane_wedlug_walidatora_domeny(self) -> None:
        """Jedno wywolanie realnego predykatu domenowego zamiast wlasnej reimplementacji.

        `_nieznane_referencje_katalogowe` to DOKLADNIE ta funkcja, ktora sprawdza
        `set_der_catalog_bindings` — wolanie jej wprost (zamiast osobno odtwarzac
        logike "12 wpisow repozytorium MV ALBO 51 wpisow katalogu producentow")
        eliminuje ryzyko dwoch niezaleznych predykatow, ktore "dzis sie zgadzaja"
        (KLASA NIE INSTANCJA #3).
        """
        from enm.domain_operations_v2 import _nieznane_referencje_katalogowe

        source = _tekst(_HARNESS_TS)
        protection_refy = _wartosci_klucza_z_fikstur("protection_catalog_ref") | _wartosci_pola(
            source, "protection_catalog_ref"
        )
        ct_refy = _wartosci_klucza_z_fikstur("ct_catalog_ref") | _wartosci_pola(
            source, "ct_catalog_ref"
        )
        dynamic_refy = _wartosci_klucza_z_fikstur("dynamic_model_ref") | _wartosci_pola(
            source, "dynamic_model_ref"
        )
        assert protection_refy and ct_refy and dynamic_refy, (
            "Brak protection_catalog_ref/ct_catalog_ref/dynamic_model_ref w danych "
            "scen — scena 'wiazania'/'oze'/'macierz' zniknela albo zmienila ksztalt."
        )

        for ref in protection_refy:
            nieznane = _nieznane_referencje_katalogowe({"protection_catalog_ref": ref})
            assert (
                not nieznane
            ), f"protection_catalog_ref='{ref}' nieznany walidatorowi domeny: {nieznane}"
        for ref in ct_refy:
            nieznane = _nieznane_referencje_katalogowe({"ct_catalog_ref": ref})
            assert not nieznane, f"ct_catalog_ref='{ref}' nieznany walidatorowi domeny: {nieznane}"
        for ref in dynamic_refy:
            nieznane = _nieznane_referencje_katalogowe({"dynamic_model_ref": ref})
            assert (
                not nieznane
            ), f"dynamic_model_ref='{ref}' nieznany walidatorowi domeny: {nieznane}"

    def test_ptpiree_certificate_ref_istnieje_w_katalogu_pv_i_jest_powiazany(self) -> None:
        from api.catalog import list_pv_inverter_types

        refy = _wartosci_klucza_z_fikstur("ptpiree_certificate_ref") | _wartosci_pola(
            _tekst(_HARNESS_TS), "ptpiree_certificate_ref"
        )
        assert refy, "Brak ptpiree_certificate_ref w danych scen — scena 'macierz' zniknela?"

        powiazane = {
            str(i["ptpiree_certificate_ref"])
            for i in list_pv_inverter_types()
            if i.get("ptpiree_status") == "POWIAZANY" and i.get("ptpiree_certificate_ref")
        }
        for ref in refy:
            assert ref in powiazane, (
                f"ptpiree_certificate_ref='{ref}' nie odpowiada zadnej pozycji katalogu PV "
                f"ze statusem POWIAZANY — wartosc nie ma pokrycia w wykazie PTPiREE."
            )


class TestE2eSpecyPickeryKatalogu:
    """Specy e2e, ktore klikaja `<select>` zasilany dzis REALNYM backendem."""

    def test_creator_screenshot_spec_uzywa_realnych_identyfikatorow(self) -> None:
        from api.catalog import (
            list_cable_types,
            list_ct_types,
            list_pv_inverter_types,
            list_vt_types,
        )
        from application.analyses.protection.catalog.catalog_store import list_devices
        from network_model.catalog import get_default_mv_catalog

        source = _tekst(_E2E_DIR / "creator-screenshot.spec.ts")

        konwerter = _wartosci_select(source, "mvd-kreator-oze-konwerter")
        vt = _wartosci_select(source, "mvd-kreator-oze-aparatura-vt")
        zab = _wartosci_select(source, "mvd-kreator-oze-aparatura-zabezpieczenie")
        kabel = _wartosci_select(source, "mvd-kreator-magistrala-katalog")
        assert konwerter and vt and zab and kabel, (
            "Co najmniej jeden z czterech pickerow (konwerter/vt/zabezpieczenie/"
            "magistrala) nie zwrocil zadnej wartosci — wzorzec .selectOption nie "
            "pasuje (przeformatowanie specu?) albo krok zniknal."
        )

        pv_ids = {str(i["id"]) for i in list_pv_inverter_types()}
        for ref in konwerter:
            assert (
                ref in pv_ids
            ), f"'mvd-kreator-oze-konwerter' wybiera '{ref}', ktorego nie ma w pv-inverter-types."

        vt_ids = {str(i["id"]) for i in list_vt_types()}
        for ref in vt:
            assert (
                ref in vt_ids
            ), f"'mvd-kreator-oze-aparatura-vt' wybiera '{ref}', ktorego nie ma w vt-types."
        for ref in _identyfikatory_porownan(source):
            if ref.startswith("vt_"):
                assert ref in vt_ids, (
                    f"spec porownuje `.id === '{ref}'`, ktorego nie ma w vt-types — spec "
                    "cytuje identyfikator spoza realnego katalogu."
                )
        assert any(ref.startswith("vt_") for ref in _identyfikatory_porownan(source)), (
            "spec ma wybierac pozycje VT po identyfikatorze z odpowiedzi backendu "
            "(E2E-FULL-FIX-2) — wzorzec `.id === 'vt_...'` zniknal."
        )

        vendor_ids = {d.device_id for d in list_devices()}
        katalog = get_default_mv_catalog()
        for ref in zab:
            assert ref in vendor_ids or katalog.get_protection_device_type(ref) is not None, (
                f"'mvd-kreator-oze-aparatura-zabezpieczenie' wybiera '{ref}' spoza obu "
                f"zbiorow, ktore sprawdza `_nieznane_referencje_katalogowe`."
            )

        cable_ids = {str(i["id"]) for i in list_cable_types()}
        for ref in kabel:
            assert (
                ref in cable_ids
            ), f"'mvd-kreator-magistrala-katalog' wybiera '{ref}', ktorego nie ma w cable-types."

        # `ct_200_5_5p10_10va_abb` jest juz sprawdzony przez test harnessu powyzej
        # (to samo pole/ta sama wartosc) — tu tylko potwierdzamy obecnosc w CT.
        ct_ids = {str(i["id"]) for i in list_ct_types()}
        for ref in _wartosci_select(source, "mvd-kreator-oze-aparatura-ct"):
            assert (
                ref in ct_ids
            ), f"'mvd-kreator-oze-aparatura-ct' wybiera '{ref}', ktorego nie ma w ct-types."

    def test_fk7_dobor_spec_falownik_realny_i_dobor_pokrywa_sie_z_solverem(self) -> None:
        """Powtorka empirycznej weryfikacji karty FAB-L: ten sam wejscie -> ten sam
        werdykt solvera (`preview_der_selection`), jaki spec zaklada w komentarzach
        (TR 2,5 MVA, I_TR 96,2 A, 50 mm² -> 70 mm² po korekcie warunkow ulozenia).
        """
        from api.catalog import list_pv_inverter_types
        from api.grid_source_preview import (
            CableLayingConditionsRequest,
            DerSelectionPreviewRequest,
            preview_der_selection,
        )

        source = _tekst(_E2E_DIR / "fk7-dobor-screenshot.spec.ts")
        konwerter = _wartosci_select(source, "mvd-kreator-oze-konwerter")
        assert (
            konwerter
        ), "'mvd-kreator-oze-konwerter' nie zwrocil zadnej wartosci w fk7-dobor-screenshot.spec.ts."
        (ref,) = konwerter  # spec wybiera dokladnie JEDEN falownik

        pv_by_id = {str(i["id"]): i for i in list_pv_inverter_types()}
        assert (
            ref in pv_by_id
        ), f"'mvd-kreator-oze-konwerter' wybiera '{ref}', ktorego nie ma w pv-inverter-types."
        pmax_mw = float(pv_by_id[ref]["p_max_kw"]) / 1000.0
        un_kv = float(pv_by_id[ref]["un_kv"])

        wejscie = {
            "sum_active_power_mw": pmax_mw * 2,  # spec: `mvd-kreator-oze-liczba` = 2
            "inverter_output_kv": un_kv,
            "sn_bus_voltage_kv": 15.0,  # `bus-sn-demo` w harnessie
            "cable_length_km": 1.0,
            "cos_phi": 0.95,
            "transformer_reserve_pu": 0.1,
            "cable_reserve_pu": 0.3,
            "field_reserve_pu": 0.1,
            "max_delta_u_pct": 2.0,
            "reactive_character": "inductive",
        }

        katalogowe = preview_der_selection(DerSelectionPreviewRequest(**wejscie))
        assert katalogowe.transformer.proposal is not None
        assert katalogowe.transformer.proposal.sn_mva == pytest.approx(2.5)
        assert katalogowe.cable.proposal is not None
        assert katalogowe.cable.proposal.cross_section_mm2 == pytest.approx(50.0)

        skorygowane = preview_der_selection(
            DerSelectionPreviewRequest(
                **wejscie,
                laying_conditions=CableLayingConditionsRequest(
                    set_name="ziemia_3_kable_warstwa_200mm"
                ),
            )
        )
        assert skorygowane.cable.proposal is not None
        assert skorygowane.cable.proposal.cross_section_mm2 == pytest.approx(70.0), (
            "Korekta obciazalnosci (ziemia/3 kable/200 mm) MUSI podniesc przekroj "
            "wzgledem warunkow katalogowych — to jedyny powod istnienia sceny F-K7."
        )

    def test_kreator_oze_max_spec_nie_odwoluje_sie_juz_do_usunietego_pola(self) -> None:
        """`fault_current_data_ref` USUNIETE karta FAB-L (§0 L2) — regres wracalby
        cicho, gdyby spec dalej wypelnial nieistniejacy testid `dane-zwarciowe`.

        Sprawdzamy PELNY stary testid (interakcja), nie golą podniazwę — ta
        wraca legalnie w komentarzu dokumentujacym USUNIECIE (jak w calej tej
        karcie: `// USUNIĘTE — X`).
        """
        source = _tekst(_E2E_DIR / "kreator-oze-max.spec.ts")
        assert "getByTestId('mvd-kreator-oze-aparatura-dane-zwarciowe')" not in source
        assert "['fault_current_data_ref']" not in source
        assert (
            "mvd-kreator-oze-aparatura-model-dynamiczny" in source
        ), "Spec MUSI wypelniac picker modelu dynamicznego (zastapil usuniete pole)."
