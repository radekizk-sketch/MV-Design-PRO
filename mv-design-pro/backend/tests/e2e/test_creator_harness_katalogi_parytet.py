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

1. Dane scen w harnessie (`device_catalog_ref`/`battery_catalog_ref`/
   `dynamic_model_ref`/`protection_catalog_ref`/`ct_catalog_ref`/
   `ptpiree_certificate_ref`) — kazda wartosc MUSI istniec w realnym katalogu
   backendu, z ktorego picker faktycznie czyta (nie w drugiej, rownoleglej
   licie utrzymywanej recznie w tescie — patrz `_nieznane_referencje_katalogowe`
   nizej, ktora jest DOKLADNIE tym samym predykatem, ktorego uzywa
   `set_der_catalog_bindings`).
2. Wybrane atrapowe specy e2e (`creator-screenshot.spec.ts`,
   `fk7-dobor-screenshot.spec.ts`, `kreator-oze-max.spec.ts`), ktore prowadza
   klik po prawdziwym `<select>` zasilanym dzis realnym backendem — te same
   pola, ta sama zasada.
3. Sanity: kazde wyodrebnianie MUSI cos znalezc (niepusty zbior). Test, ktory
   milczaco przechodzi bo wzorzec przestal pasowac (np. po przeformatowaniu
   pliku), jest fałszywą pewnością (reguła KLASA NIE INSTANCJA #4) — gorszy niz
   brak testu, bo usypia czujnosc.

Poza zakresem CELOWO (patrz komentarz w harnessie przy
`/api/oze-analysis/compensation-sizing`): `catalog_ref` kandydatow doboru
kompensacji (`cap-0v3`/`cap-0v6`/`cap-0v9`) — to WYNIK ANALIZY (solver/analysis
result, wyjatek karty (a)), terminalny i tylko-do-odczytu, nigdy nie odsylany
z powrotem do zadnego pickera katalogu.

Test czyta pliki frontu jako TEKST (nie uruchamia TypeScriptu/Playwrighta) —
swiadomy wybor: parytet ma dzialac w zwyklym biegu pytest, bez node'a w petli.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

_FRONTEND_ROOT = Path(__file__).resolve().parents[3] / "frontend"
_HARNESS_TS = _FRONTEND_ROOT / "src" / "creator-harness-main.tsx"
_E2E_DIR = _FRONTEND_ROOT / "e2e"


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


def _der_kind_i_device_ref_pary(source: str) -> list[tuple[str, str]]:
    """Pary (der_kind, device_catalog_ref) z blokow `derDemo({...})` harnessu.

    Katalogi DER sa PLASKIMI obiektami (`catalogs: { ...EMPTY_DER_CATALOGS,
    pole: 'wartosc', ... }`, zero zagniezdzonych `{}`) — `[^{}]*` bezpiecznie
    zatrzymuje sie na PIERWSZYM `}`, wiec dopasowanie nigdy nie przeskakuje do
    NASTEPNEGO rekordu DER. `.*?` niechlanie miedzy `der_kind` a `catalogs`
    (moga je dzielic inne pola rekordu, np. `name`/`bus_przylaczenia_ref`).
    """
    wzorzec = re.compile(
        r"der_kind:\s*'(PV|BESS|FW)'.*?catalogs:\s*\{([^{}]*)\}",
        re.DOTALL,
    )
    pary: list[tuple[str, str]] = []
    for kind, blok in wzorzec.findall(source):
        for ref in re.findall(r"device_catalog_ref:\s*\n?\s*'([^']+)'", blok):
            pary.append((kind, ref))
    return pary


class TestHarnessDaneScen:
    """`creator-harness-main.tsx`: dane scen wskazuja na REALNE pozycje katalogu."""

    def test_device_catalog_ref_istnieje_w_katalogu_wlasciwego_rodzaju(self) -> None:
        from api.catalog import (
            list_bess_inverter_types,
            list_pv_inverter_types,
            list_wind_inverter_types,
        )

        source = _tekst(_HARNESS_TS)
        pary = _der_kind_i_device_ref_pary(source)
        assert pary, (
            "Wzorzec (der_kind, device_catalog_ref) nie znalazl NIC w harnessie — "
            "regex nie pasuje (przeformatowanie pliku?) albo scena zniknela. Test "
            "milczaco przechodzacy bez znalezisk jest falszywa pewnoscia."
        )

        znane_wg_rodzaju = {
            "PV": {str(i["id"]) for i in list_pv_inverter_types()},
            "BESS": {str(i["id"]) for i in list_bess_inverter_types()},
            "FW": {str(i["id"]) for i in list_wind_inverter_types()},
        }
        for kind, ref in pary:
            assert ref in znane_wg_rodzaju[kind], (
                f"device_catalog_ref='{ref}' (der_kind={kind}) nie istnieje w realnym "
                f"katalogu backendu — harness zapisywalby wartosc, ktorej picker "
                f"nigdy by nie pokazal jako wybranej (a backend odrzucilby zapis)."
            )

    def test_battery_catalog_ref_istnieje_w_katalogu_baterii_bess(self) -> None:
        from network_model.catalog import get_default_mv_catalog

        source = _tekst(_HARNESS_TS)
        refy = _wartosci_pola(source, "battery_catalog_ref")
        assert refy, "Brak battery_catalog_ref w harnessie — scena 'macierz' zniknela?"

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
        # Import `enm.domain_operations` PRZED `domain_operations_v2` — ten drugi
        # modul importowany BEZPOSREDNIO jako pierwszy w procesie konczy sie
        # `ImportError` (czesciowo zainicjowany modul, cykl domain_operations.py:
        # `from .domain_operations_v2 import ALL_V2_HANDLERS`). Ten sam porzadek
        # importow co `tests/enm/test_set_der_catalog_bindings.py`.
        import enm.domain_operations  # noqa: F401
        from enm.domain_operations_v2 import _nieznane_referencje_katalogowe

        source = _tekst(_HARNESS_TS)
        protection_refy = _wartosci_pola(source, "protection_catalog_ref")
        ct_refy = _wartosci_pola(source, "ct_catalog_ref")
        dynamic_refy = _wartosci_pola(source, "dynamic_model_ref")
        assert protection_refy and ct_refy and dynamic_refy, (
            "Brak protection_catalog_ref/ct_catalog_ref/dynamic_model_ref w "
            "harnessie — scena 'wiazania'/'frt'/'macierz' zniknela albo zmienila ksztalt."
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

        source = _tekst(_HARNESS_TS)
        refy = _wartosci_pola(source, "ptpiree_certificate_ref")
        assert refy, "Brak ptpiree_certificate_ref w harnessie — scena 'macierz' (pv-1) zniknela?"

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
