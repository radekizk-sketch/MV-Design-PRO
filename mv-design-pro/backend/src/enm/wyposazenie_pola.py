"""Wyposażenie pola SN — operacja ``set_bay_equipment`` (karty W5-C, GPZ-H5-APARATURA).

PO CO. Rysunek pola (SLD), odczyt pola (`field_read_model`), blokady uziemnika, tor zasilania
i analizy aparatury czytają JEDEN skład pola: ``Bay.primary_devices`` złączone z elementami
modelu pola (``enm.sklad_pola.aparaty_pola``). Ta operacja USTAWIA wyposażenie pola po jego
utworzeniu, catalog-first, a odpowiedź niesie skład pola ze statusem każdego gniazda i aparatu
(``enm.sklad_pola.sklad_pola`` — jedna funkcja statusu: ``ZAPROJEKTOWANE`` /
``WYMAGANE_STANDARDEM_BRAK`` / ``BRAK_POZYCJI_KATALOGU`` / ``RODZAJ_BEZ_KATALOGU`` /
``BRAK_TYPU_GRANICA_WN``, każdy ze zdaniem wyjaśnienia i podstawą).

PIĘĆ TRYBÓW (``mode``, ``TRYBY_WYPOSAZENIA``):

* ``katalog`` — lista ``devices`` od projektanta. Rodzaj z katalogiem (przestrzeń z
  ``enm.sklad_pola.PRZESTRZEN_KATALOGU_APARATU``: aparatura łączeniowa APARAT_SN, przekładniki
  CT/VT, ogranicznik OGRANICZNIK_SN, wyposażenie pól ELEMENT_POLA_SN) WYMAGA ``catalog_ref``
  tej przestrzeni o zgodnym rodzaju pozycji — chyba że aparat obsadza gniazdo standardu
  (``gniazdo_ref``) i wyboru jeszcze nie ma (gniazdo zostaje ``WYMAGANE_STANDARDEM_BRAK``),
  albo wskazuje element modelu (``linked_ref``), który katalog niesie sam (gałąź łącznikowa,
  przekładnik ``Measurement``) — wtedy ``catalog_ref`` aparatu jest ODMAWIANE (jedna prawda
  katalogu). Przekładnik CT/VT z pozycją katalogu i bez ``linked_ref`` powstaje jako rekord
  ``Measurement`` pola (``add_ct``/``add_vt``) — jedyna reprezentacja przekładnika, wiązalna
  z zabezpieczeniem; aparat pola go wskazuje. U_m pozycji jest sprawdzane wobec miejsca w polu
  (``enm.sklad_pola.zgodnosc_um_w_gniezdzie``).
* ``szablon`` — aparaty z szablonu pola (``bay_template_ref`` z ładunku albo z rekordu) przez
  TEN SAM resolver, co budowa pola (``pole_katalogowe.aparaty_pola_z_referencji``).
* ``standard`` — szablon pola standardu ENEA (``szablon_standardu_ref``,
  ``network_model/catalog/gniazda_pol_enea.py``): pole dostaje gniazda w kolejności od szyny,
  każde jako aparat bez pozycji katalogu (``WYMAGANE_STANDARDEM_BRAK``) do obsadzenia trybem
  ``katalog``. Szablon musi przysługiwać roli pola, a szyna pola musi leżeć w tabeli 3
  IEC 60038 (sieć do 35 kV) — szablony standardu opisują wyłącznie rozdzielnicę SN.
* ``wymagania`` — obsadzenie WOLNYCH gniazd szablonu standardu pola pozycjami wymagań standardu
  (``mv_wymagania_enea_catalog.POZYCJE_WYMAGAN_GNIAZD``) tą samą bramą, co tryb ``katalog``
  (rodzaj pozycji, U_m w gnieździe, przekładnik jako ``Measurement``). Gniazdo obsadzone,
  gniazdo związane z elementem modelu (gałąź łącznika, przekładnik — katalog niesie element)
  i gniazdo bez pozycji wymagania (dobór projektanta) zostają bez zmian.
* ``wyczysc`` — usunięcie aparatów rekordu (gniazda szablonu standardu zostają wymagane).

GRANICE (nazwane). Operacja NIE ocenia doboru aparatu wobec prądów (I_r ≥ I_obc,
I_th/I_dyn ≥ prądy zwarciowe) — to analiza wytrzymałości aparatury z wynikiem liczbowym
i limitem. Sprawdza wyłącznie zgodność napięcia najwyższego aparatu z miejscem w polu (aparat
SN o U_m 24 kV na szynie sieci z tabeli 4 IEC 60038 jest błędem modelu, nie doborem). Operacja
NIE ustawia stanu łącznika — stan żyje na gałęzi, a aparat pola wskazuje ją ``linked_ref``.

GRANICA 110 kV (decyzja właściciela 2026-10-22). Strona 110 kV GPZ jest wyłącznie funkcjonalną
granicą zasilania sieci SN: pole na szynie w paśmie WN (``enm.sklad_pola.pole_granicy_wn`` —
jeden predykat ze statusem składu i analizą wytrzymałości) ma dokładnie jeden łącznik pola
z gałęzią modelu, budowany przez operację GPZ, bez szablonów, bez wymagań standardu i bez
katalogu 110 kV. Operacja ODMAWIA takiemu polu
(``bay_equipment.bay_hv_boundary``) — stan łącznika pola 110 kV zmienia scenariusz łączeniowy
przypadku albo operacja łącznika, nie wyposażenie pola.
Przekładnik utworzony wcześniej dla gniazda zostaje w modelu przy zmianie wyposażenia (usuwa
go operacja usunięcia elementu — zabezpieczenie może go wskazywać).
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any, get_args

from network_model.catalog.bay_templates import BAY_TEMPLATE_REGISTRY
from network_model.catalog.gniazda_pol_enea import (
    GniazdoPola,
    SzablonPolaStandardu,
    szablon_pola_standardu,
)
from network_model.catalog.mv_wymagania_enea_catalog import pozycja_wymagania_gniazda
from network_model.catalog.switchgear.apparatus_vocabulary import FAMILY_APPARATUS_FOR_ENM_KIND
from network_model.catalog.switchgear.families import SWITCHGEAR_FAMILY_REGISTRY
from network_model.pochodne.pasma_napieciowe import tabela_napiec_sieci

from .domain_operations import _error_response, _konfiguracja_pola, _response
from .katalog_projektu import katalog_biezacy
from .kopia_graniczna import kopia_graniczna_enm
from .models import BayPrimaryDevice, EnergyNetworkModel
from .pola import czy_pole_nn, poziom_pol, zmien_pole
from .pola import pole as pole_modelu
from .pole_katalogowe import aparaty_pola_z_referencji, pole_katalogowe
from .sklad_pola import (
    NAZWY_RODZAJOW_APARATU_POLA_PL,
    PRZESTRZEN_KATALOGU_APARATU,
    RODZAJE_BEZ_KATALOGU_SN,
    RODZAJE_KATALOGOWE_APARATU,
    RODZAJE_STEROWALNE,
    RODZAJE_Z_GALEZIA,
    RODZAJE_Z_PRZEKLADNIKIEM,
    RODZAJE_Z_ROLA_UZIEMIENIA,
    aparaty_gniazd_standardu,
    aparaty_pola,
    dane_pozycji_aparatu,
    indeks_modelu_pola,
    pole_granicy_wn,
    sklad_pola,
    zgodnosc_um_w_gniezdzie,
)
from .slownik_komunikatow import lista_pl, opis_elementu, pole
from .topology import TYPY_LACZNIKOW_ENM

TRYBY_WYPOSAZENIA: tuple[str, ...] = ("katalog", "szablon", "standard", "wymagania", "wyczysc")

_UMIEJSCOWIENIA: frozenset[str] = frozenset(
    get_args(BayPrimaryDevice.model_fields["placement"].annotation)
)


def _odpowiedz(nowy: dict[str, Any], bay_ref: str, created: list[str]) -> dict[str, Any]:
    wynik = _response(
        nowy,
        created=created or None,
        updated=[bay_ref],
        selection_id=bay_ref,
        selection_type="bay",
        events=[{"event_seq": 1, "event_type": "BAY_EQUIPMENT_SET", "element_id": bay_ref}],
    )
    if "error" in wynik:
        return wynik
    model = EnergyNetworkModel.model_validate(wynik["snapshot"])
    bay = next(b for b in model.bays if b.ref_id == bay_ref)
    wynik["wyposazenie_pola"] = {
        "bay_ref": bay_ref,
        "szablon_standardu_ref": bay.szablon_standardu_ref,
        "sklad": [w.model_dump(mode="json") for w in sklad_pola(indeks_modelu_pola(model), bay)],
    }
    return wynik


def _rola_szablonu(ref: str) -> str | None:
    kanoniczny = BAY_TEMPLATE_REGISTRY.get(ref)
    if kanoniczny is not None:
        return kanoniczny.bay_role
    katalogowy = pole_katalogowe(ref)
    return katalogowy.bay_role if katalogowy is not None else None


def _aparaty_z_szablonu(
    enm: dict[str, Any], rekord: dict[str, Any], payload: dict[str, Any]
) -> tuple[list[dict[str, Any]], str] | dict[str, Any]:
    bay_ref = str(rekord["ref_id"])
    ref = payload.get("bay_template_ref") or rekord.get("bay_template_ref")
    if not isinstance(ref, str) or not ref.strip():
        return _error_response(
            f"{opis_elementu(enm, bay_ref, 'Pole')} nie ma szablonu — wskaż szablon pola w "
            f"polu {pole('bay_template_ref', 'set_bay_equipment')}.",
            "bay_equipment.template_missing",
        )
    rola = _rola_szablonu(ref)
    if rola is None:
        return _error_response(
            f"Pole {pole('bay_template_ref', 'set_bay_equipment')}: katalog nie zna wskazanego "
            "szablonu pola.",
            "bay_equipment.template_unknown",
        )
    if rola != rekord.get("bay_role"):
        return _error_response(
            f"Pole {pole('bay_template_ref', 'set_bay_equipment')}: szablon opisuje pole innej "
            f"funkcji niż {opis_elementu(enm, bay_ref, 'pole')} — wyposażenie z szablonu innej "
            "funkcji nie odpowiada polu w modelu.",
            "bay_equipment.template_role_mismatch",
        )
    aparaty = aparaty_pola_z_referencji(
        field_ref=bay_ref,
        bay_template_ref=ref,
        switchgear_family_ref=rekord.get("switchgear_family_ref"),
    )
    return aparaty, ref


def _napiecie_szyny(enm: dict[str, Any], rekord: Mapping[str, Any]) -> float | None:
    bus_ref = rekord.get("bus_ref")
    for szyna in enm.get("buses", []):
        if isinstance(szyna, dict) and szyna.get("ref_id") == bus_ref:
            napiecie = szyna.get("voltage_kv")
            return float(napiecie) if isinstance(napiecie, int | float) and napiecie else None
    return None


def _szablon_standardu(
    enm: dict[str, Any], rekord: dict[str, Any], payload: dict[str, Any]
) -> SzablonPolaStandardu | dict[str, Any]:
    bay_ref = str(rekord["ref_id"])
    ref = payload.get("szablon_standardu_ref")
    szablon = szablon_pola_standardu(ref) if isinstance(ref, str) else None
    if szablon is None:
        return _error_response(
            f"Pole {pole('szablon_standardu_ref', 'set_bay_equipment')}: wskaż szablon pola "
            "standardu ENEA (pole liniowe, transformatorowe, łącznika szyn, zespołu "
            "uziemiającego, baterii kondensatorów, pomiaru napięcia).",
            "bay_equipment.standard_template_unknown",
        )
    if rekord.get("bay_role") not in szablon.role_pola:
        return _error_response(
            f"Szablon „{szablon.nazwa_pl}” opisuje pole innej funkcji niż "
            f"{opis_elementu(enm, bay_ref, 'pole')} — gniazda standardu przysługują polu "
            "tej samej funkcji.",
            "bay_equipment.standard_template_role_mismatch",
        )
    if tabela_napiec_sieci(_napiecie_szyny(enm, rekord)) != "TAB3":
        return _error_response(
            f"Szablon „{szablon.nazwa_pl}” opisuje pole rozdzielnicy SN, a szyna "
            f"{opis_elementu(enm, bay_ref, 'pola')} nie leży w tabeli 3 IEC 60038 (sieci do "
            "35 kV) albo nie ma napięcia znamionowego.",
            "bay_equipment.standard_template_voltage_mismatch",
        )
    return szablon


def _sprawdz_aparat(
    enm: dict[str, Any],
    rekord: dict[str, Any],
    indeks: int,
    wpis: object,
    galezie: dict[str, dict[str, Any]],
    przekladniki: dict[str, dict[str, Any]],
    szablon: SzablonPolaStandardu | None,
) -> dict[str, Any]:
    """Aparat z ładunku trybu ``katalog`` → rekord ``BayPrimaryDevice`` (z kluczem roboczym
    ``_przekladnik`` — przekładnik do utworzenia) albo odmowa (słownik z kluczem ``error``)."""
    bay_ref = str(rekord["ref_id"])
    numer = indeks + 1
    if not isinstance(wpis, Mapping):
        return _error_response(
            f"Pole {pole('devices', 'set_bay_equipment')}: aparat {numer} nie jest opisem "
            "aparatu (rodzaj, umiejscowienie, pozycja katalogowa).",
            "bay_equipment.device_invalid",
        )
    rodzaj_surowy = wpis.get("kind")
    if (
        rodzaj_surowy not in PRZESTRZEN_KATALOGU_APARATU
        and rodzaj_surowy not in RODZAJE_BEZ_KATALOGU_SN
    ):
        dopuszczalne = lista_pl(
            NAZWY_RODZAJOW_APARATU_POLA_PL[k]
            for k in (*PRZESTRZEN_KATALOGU_APARATU, *sorted(RODZAJE_BEZ_KATALOGU_SN))
        )
        return _error_response(
            f"Pole {pole('devices', 'set_bay_equipment')}: aparat {numer} ma rodzaj spoza "
            f"aparatów pola — dopuszczalne: {dopuszczalne}.",
            "bay_equipment.kind_not_allowed",
        )
    rodzaj = str(rodzaj_surowy)
    nazwa_rodzaju = NAZWY_RODZAJOW_APARATU_POLA_PL[rodzaj]

    gniazdo: GniazdoPola | None = None
    gniazdo_ref = wpis.get("gniazdo_ref")
    if gniazdo_ref is not None:
        if szablon is None:
            return _error_response(
                f"Pole {pole('devices', 'set_bay_equipment')}: aparat {numer} wskazuje gniazdo "
                f"standardu, a {opis_elementu(enm, bay_ref, 'pole')} nie ma szablonu pola "
                "standardu — nadaj go trybem „z szablonu pola standardu”.",
                "bay_equipment.slot_without_template",
            )
        gniazdo = next((g for g in szablon.gniazda if g.id == gniazdo_ref), None)
        if gniazdo is None:
            return _error_response(
                f"Pole {pole('devices', 'set_bay_equipment')}: szablon „{szablon.nazwa_pl}” nie "
                f"ma gniazda wskazanego przez aparat {numer}.",
                "bay_equipment.slot_unknown",
            )
        if gniazdo.rodzaj != rodzaj:
            return _error_response(
                f"Pole {pole('devices', 'set_bay_equipment')}: gniazdo „{gniazdo.nazwa_pl}” "
                f"przyjmuje aparat rodzaju „{NAZWY_RODZAJOW_APARATU_POLA_PL[gniazdo.rodzaj]}”, "
                f"nie „{nazwa_rodzaju}” (aparat {numer}; {gniazdo.podstawa_pl}).",
                "bay_equipment.slot_kind_mismatch",
            )

    umiejscowienie = wpis.get("placement")
    if umiejscowienie is None and gniazdo is not None:
        # Umiejscowienie gniazda jest daną standardu (kolejność od szyny), nie domysłem.
        umiejscowienie = gniazdo.placement
    if umiejscowienie not in _UMIEJSCOWIENIA:
        return _error_response(
            f"Pole {pole('devices', 'set_bay_equipment')}: aparat {numer} ({nazwa_rodzaju}) "
            "nie ma umiejscowienia w torze pola (od szyny, w torze, od strony linii, poza "
            "torem, odgałęzienie do ziemi).",
            "bay_equipment.placement_invalid",
        )
    rodzina_ref = rekord.get("switchgear_family_ref")
    if isinstance(rodzina_ref, str) and rodzina_ref in SWITCHGEAR_FAMILY_REGISTRY:
        rodzina = SWITCHGEAR_FAMILY_REGISTRY[rodzina_ref]
        aparat_rodziny = FAMILY_APPARATUS_FOR_ENM_KIND.get(rodzaj)
        if aparat_rodziny is not None and aparat_rodziny not in rodzina.allowed_apparatus_kinds:
            return _error_response(
                f"Pole {pole('devices', 'set_bay_equipment')}: rodzina rozdzielnicy "
                f"{opis_elementu(enm, bay_ref, 'pola')} nie przewiduje aparatu „{nazwa_rodzaju}” "
                f"(aparat {numer}).",
                "bay_equipment.family_disallows",
            )

    rola_uziemienia = wpis.get("earthing_role")
    if rola_uziemienia is None and gniazdo is not None:
        rola_uziemienia = gniazdo.earthing_role
    if rola_uziemienia is not None and rodzaj not in RODZAJE_Z_ROLA_UZIEMIENIA:
        return _error_response(
            f"Pole {pole('devices', 'set_bay_equipment')}: rolę uziemienia ma wyłącznie "
            f"uziemnik, odłącznik trójpołożeniowy i ogranicznik przepięć, nie {nazwa_rodzaju} "
            f"(aparat {numer}).",
            "bay_equipment.earthing_role_not_applicable",
        )

    linked_ref = wpis.get("linked_ref")
    element_z_katalogiem = False
    if linked_ref is not None:
        linked_ref = str(linked_ref)
        galaz = galezie.get(linked_ref)
        przekladnik = przekladniki.get(linked_ref)
        if rodzaj in RODZAJE_Z_GALEZIA and galaz is not None:
            if linked_ref not in (rekord.get("equipment_refs") or []):
                # Aparat pola wskazuje łącznik TEGO pola (`Bay.equipment_refs`) — łącznik innego
                # pola pokazałby w rysunku i w odczycie pola stan cudzego toru.
                return _error_response(
                    f"Pole {pole('devices', 'set_bay_equipment')}: aparat {numer} "
                    f"({nazwa_rodzaju}) wskazuje {opis_elementu(enm, linked_ref, 'łącznik')}, "
                    f"który nie należy do {opis_elementu(enm, bay_ref, 'pola')} — wskaż łącznik "
                    "z wyposażenia tego pola.",
                    "bay_equipment.linked_ref_other_bay",
                )
            element_z_katalogiem = True
        elif (
            rodzaj in RODZAJE_Z_PRZEKLADNIKIEM
            and przekladnik is not None
            and przekladnik.get("measurement_type") == rodzaj
        ):
            if przekladnik.get("bay_ref") != bay_ref:
                return _error_response(
                    f"Pole {pole('devices', 'set_bay_equipment')}: aparat {numer} "
                    f"({nazwa_rodzaju}) wskazuje przekładnik innego pola — wskaż przekładnik "
                    f"{opis_elementu(enm, bay_ref, 'pola')}.",
                    "bay_equipment.linked_ref_other_bay",
                )
            element_z_katalogiem = True
        else:
            return _error_response(
                f"Pole {pole('devices', 'set_bay_equipment')}: aparat {numer} "
                f"({nazwa_rodzaju}) może wskazywać wyłącznie łącznik modelu (wyłącznik, "
                "odłącznik, rozłącznik, bezpieczniki) albo przekładnik tego samego rodzaju, a "
                "wskazany element nim nie jest.",
                "bay_equipment.linked_ref_invalid",
            )

    catalog_ref = wpis.get("catalog_ref")
    if catalog_ref is not None and (not isinstance(catalog_ref, str) or not catalog_ref.strip()):
        catalog_ref = None
    przestrzen = PRZESTRZEN_KATALOGU_APARATU.get(rodzaj)
    utworz_przekladnik: dict[str, Any] | None = None
    if element_z_katalogiem and catalog_ref is not None:
        return _error_response(
            f"Pole {pole('devices', 'set_bay_equipment')}: aparat {numer} ({nazwa_rodzaju}) "
            f"wskazuje {opis_elementu(enm, str(linked_ref), 'element modelu')}, który niesie "
            "pozycję katalogową sam — zmień typ na elemencie, nie dubluj go na aparacie pola.",
            "bay_equipment.catalog_on_linked_element",
        )
    if przestrzen is None:
        if catalog_ref is not None:
            return _error_response(
                f"Pole {pole('devices', 'set_bay_equipment')}: aparat {numer} ({nazwa_rodzaju}) "
                "nie ma katalogu aparatów pola — jego dane niesie element modelu, któremu służy.",
                "bay_equipment.catalog_not_applicable",
            )
    elif catalog_ref is None and not element_z_katalogiem and gniazdo is None:
        return _error_response(
            f"Pole {pole('devices', 'set_bay_equipment')}: aparat {numer} ({nazwa_rodzaju}) "
            "wymaga pozycji katalogowej — wskaż typ z katalogu.",
            "bay_equipment.catalog_ref_missing",
        )
    elif catalog_ref is not None:
        # Import w funkcji: `domain_operations_v2` rejestruje tę operację (import modułu
        # na swoim szczycie), więc import na szczycie tego modułu zamknąłby cykl. Ta sama
        # brama istnienia i TEN SAM kształt odmowy (przyczyna + akcja naprawcza), co każda
        # operacja V2 wskazująca pozycję katalogu.
        from .domain_operations_v2 import _pozycja_katalogu

        _parametry, blad_pozycji = _pozycja_katalogu(
            namespace=przestrzen,
            catalog_ref=catalog_ref,
            opis_pl=f"Aparat {numer} ({nazwa_rodzaju})",
        )
        if blad_pozycji is not None:
            return blad_pozycji
        dane = dane_pozycji_aparatu(katalog_biezacy(), przestrzen, catalog_ref)
        dozwolone = RODZAJE_KATALOGOWE_APARATU.get(rodzaj)
        if dozwolone is not None and dane.rodzaj_pozycji not in dozwolone:
            return _error_response(
                f"Pole {pole('devices', 'set_bay_equipment')}: pozycja katalogowa aparatu "
                f"{numer} opisuje inny rodzaj aparatu niż „{nazwa_rodzaju}”.",
                "bay_equipment.catalog_kind_mismatch",
            )
        zgodnosc = zgodnosc_um_w_gniezdzie(dane.u_m_kv, _napiecie_szyny(enm, rekord), gniazdo)
        if not zgodnosc.zgodna:
            return _error_response(
                f"Pole {pole('devices', 'set_bay_equipment')}: aparat {numer} "
                f"({nazwa_rodzaju}) — {zgodnosc.przyczyna_pl}. Wskaż pozycję o napięciu "
                "najwyższym właściwym dla miejsca w polu.",
                "bay_equipment.um_mismatch",
            )
        if rodzaj in RODZAJE_Z_PRZEKLADNIKIEM:
            # Przekładnik pola to rekord `Measurement` (wiązalny z zabezpieczeniem) — aparat
            # rekordu wskazuje go, a pozycję katalogu niesie przekładnik (jedna reprezentacja).
            utworz_przekladnik = {"rodzaj": rodzaj, "catalog_ref": catalog_ref}
            catalog_ref = None

    aparat: dict[str, Any] = {
        "device_ref": (
            f"{bay_ref}::gn::{gniazdo.id}" if gniazdo is not None else f"{bay_ref}::dev::{indeks}"
        ),
        "symbol_ref": f"symbol:{rodzaj.lower()}",
        "kind": rodzaj,
        "placement": umiejscowienie,
        "is_controllable": rodzaj in RODZAJE_STEROWALNE,
        "render_variant": "kanoniczny",
    }
    for klucz, wartosc in (
        ("catalog_ref", catalog_ref),
        ("designation", wpis.get("designation")),
        ("earthing_role", rola_uziemienia),
        ("linked_ref", linked_ref),
        ("gniazdo_ref", gniazdo.id if gniazdo is not None else None),
    ):
        if wartosc is not None:
            aparat[klucz] = wartosc
    if utworz_przekladnik is not None:
        aparat["_przekladnik"] = utworz_przekladnik
    return aparat


def _przekladnik_pola(
    enm: dict[str, Any], bay_ref: str, aparat: dict[str, Any]
) -> tuple[dict[str, Any], str | None] | dict[str, Any]:
    """Przekładnik ``Measurement`` dla aparatu CT/VT z pozycją katalogu: istniejący przekładnik
    gniazda (ten sam katalog) albo nowy przez ``add_ct``/``add_vt``. Zwraca ``(model, ref
    utworzonego albo None)`` albo odmowę (słownik z kluczem ``error``)."""
    zadanie = aparat.pop("_przekladnik")
    rodzaj = zadanie["rodzaj"]
    catalog_ref = zadanie["catalog_ref"]
    znacznik = str(aparat.get("gniazdo_ref") or aparat["device_ref"])
    for pomiar in enm.get("measurements", []):
        meta = pomiar.get("meta") if isinstance(pomiar, dict) else None
        if (
            isinstance(meta, dict)
            and pomiar.get("bay_ref") == bay_ref
            and meta.get("gniazdo_ref") == znacznik
        ):
            if pomiar.get("catalog_ref") != catalog_ref:
                return _error_response(
                    f"Miejsce „{znacznik}” {opis_elementu(enm, bay_ref, 'pola')} ma już "
                    f"{opis_elementu(enm, str(pomiar.get('ref_id')), 'przekładnik')} innego "
                    "typu — zmień typ przekładnika albo usuń go, zamiast dokładać drugi.",
                    "bay_equipment.slot_measurement_exists",
                )
            aparat["linked_ref"] = pomiar.get("ref_id")
            return enm, None
    katalog = katalog_biezacy()
    from .domain_operations_v2 import add_ct, add_vt

    if rodzaj == "CT":
        typ_ct = katalog.ct_types[catalog_ref]
        wynik = add_ct(
            enm,
            {
                "bay_ref": bay_ref,
                "catalog_ref": catalog_ref,
                "ratio_primary_a": typ_ct.ratio_primary_a,
                "ratio_secondary_a": typ_ct.ratio_secondary_a,
                "accuracy_class": typ_ct.accuracy_class,
            },
            gniazdo_ref=znacznik,
        )
    else:
        typ_vt = katalog.vt_types[catalog_ref]
        wynik = add_vt(
            enm,
            {
                "bay_ref": bay_ref,
                "catalog_ref": catalog_ref,
                "ratio_primary_v": typ_vt.ratio_primary_v,
                "ratio_secondary_v": typ_vt.ratio_secondary_v,
                "accuracy_class": typ_vt.accuracy_class,
            },
            gniazdo_ref=znacznik,
        )
    if "error" in wynik:
        return wynik
    utworzony = str(wynik["changes"]["created_element_ids"][0])
    aparat["linked_ref"] = utworzony
    return wynik["snapshot"], utworzony


def obsadz_gniazda_wymaganiami(enm: dict[str, Any], bay_ref: str) -> dict[str, Any]:
    """Wolne gniazda szablonu standardu pola → pozycje wymagań standardu (tryb ``wymagania``).

    Zwraca ``{"enm": model, "created": [przekładniki utworzone]}`` albo odmowę (klucz
    ``error``). Model wejściowy jest kopiowany (operacja nie zmienia wejścia). Wolne gniazdo =
    aparat rekordu z ``gniazdo_ref`` bez ``catalog_ref`` i bez wiązania z elementem modelu —
    wiązanie jawne (``linked_ref``) i wiązanie przy odczycie składu (gałąź łącznikowa pola,
    przekładnik ``Measurement``: ``sklad_pola.aparaty_pola``) liczą się tak samo, bo katalog
    niesie wtedy element. Pozycję gniazda wybiera tablica standardu
    (``pozycja_wymagania_gniazda``); gniazdo bez pozycji zostaje do doboru projektanta."""
    nowy = kopia_graniczna_enm(enm)
    rekord = pole_modelu(nowy, bay_ref)
    if rekord is None:
        return _error_response(
            "Wskazane pole rozdzielnicy nie istnieje w modelu sieci.",
            "bay_equipment.bay_not_found",
        )
    szablon = szablon_pola_standardu(rekord.get("szablon_standardu_ref"))
    if szablon is None:
        return _error_response(
            f"{opis_elementu(nowy, bay_ref, 'Pole')} nie ma szablonu pola standardu — nadaj go "
            "trybem „z szablonu pola standardu”, zanim obsadzisz gniazda wymaganiami.",
            "bay_equipment.slot_without_template",
        )
    model = EnergyNetworkModel.model_validate(nowy)
    bay = next(b for b in model.bays if b.ref_id == bay_ref)
    zwiazane = {
        d.gniazdo_ref
        for d in aparaty_pola(indeks_modelu_pola(model), bay)
        if d.gniazdo_ref and (d.linked_ref or d.catalog_ref)
    }
    galezie = {
        str(g.get("ref_id")): g
        for g in nowy.get("branches", [])
        if isinstance(g, dict) and g.get("type") in TYPY_LACZNIKOW_ENM
    }
    przekladniki = {
        str(m.get("ref_id")): m for m in nowy.get("measurements", []) if isinstance(m, dict)
    }
    aparaty: list[dict[str, Any]] = [dict(d) for d in rekord.get("primary_devices") or []]
    utworzone: list[str] = []
    for pozycja, aparat_rekordu in enumerate(aparaty):
        gniazdo_ref = aparat_rekordu.get("gniazdo_ref")
        if not gniazdo_ref or gniazdo_ref in zwiazane:
            continue
        catalog_ref = pozycja_wymagania_gniazda(szablon.id, str(gniazdo_ref))
        if catalog_ref is None:
            continue
        aparat = _sprawdz_aparat(
            nowy,
            rekord,
            pozycja,
            {
                "kind": aparat_rekordu.get("kind"),
                "gniazdo_ref": gniazdo_ref,
                "catalog_ref": catalog_ref,
                "designation": aparat_rekordu.get("designation"),
            },
            galezie,
            przekladniki,
            szablon,
        )
        if "error" in aparat:
            return aparat
        if "_przekladnik" in aparat:
            przygotowany = _przekladnik_pola(nowy, bay_ref, aparat)
            if isinstance(przygotowany, dict):
                return przygotowany
            nowy, utworzony = przygotowany
            if utworzony is not None:
                utworzone.append(utworzony)
        aparaty[pozycja] = aparat
    zmien_pole(nowy, bay_ref, primary_devices=aparaty)
    return {"enm": nowy, "created": utworzone}


def set_bay_equipment(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Ustaw wyposażenie (aparaty pierwotne) pola — tryb ``katalog``/``szablon``/``standard``/
    ``wyczysc``."""
    bay_ref = payload.get("bay_ref")
    if not isinstance(bay_ref, str) or not bay_ref.strip():
        return _error_response(
            f"Uzupełnij pole {pole('bay_ref', 'set_bay_equipment')} — wskaż pole rozdzielnicy.",
            "bay_equipment.bay_ref_missing",
        )
    nowy = kopia_graniczna_enm(enm)
    rekord = pole_modelu(nowy, bay_ref)
    if rekord is None:
        return _error_response(
            "Wskazane pole rozdzielnicy nie istnieje w modelu sieci.",
            "bay_equipment.bay_not_found",
        )
    if czy_pole_nn(nowy, rekord, poziom_pol(nowy)):
        return _error_response(
            f"{opis_elementu(nowy, bay_ref, 'Pole')} jest polem nN — jego aparaty ustawiają "
            "operacje rozdzielnicy nN, nie wyposażenie pola.",
            "bay_equipment.bay_not_mv",
        )
    if pole_granicy_wn(_napiecie_szyny(nowy, rekord)):
        return _error_response(
            f"{opis_elementu(nowy, bay_ref, 'Pole')} leży na szynie 110 kV — strona 110 kV jest "
            "granicą zasilania sieci SN, a jej pole ma wyłącznie łącznik pola z gałęzią modelu. "
            "Stan łącznika zmień w panelu „Scenariusze łączeniowe” przypadku obliczeniowego.",
            "bay_equipment.bay_hv_boundary",
        )
    tryb = payload.get("mode")
    if tryb not in TRYBY_WYPOSAZENIA:
        return _error_response(
            f"Uzupełnij pole {pole('mode', 'set_bay_equipment')} — z katalogu, z szablonu pola, "
            "z szablonu pola standardu, obsadzenie gniazd wymaganiami standardu albo usunięcie "
            "wyposażenia.",
            "bay_equipment.mode_invalid",
        )

    if tryb == "wymagania":
        wynik_obsadzenia = obsadz_gniazda_wymaganiami(nowy, bay_ref)
        if "error" in wynik_obsadzenia:
            return wynik_obsadzenia
        return _odpowiedz(wynik_obsadzenia["enm"], bay_ref, wynik_obsadzenia["created"])

    zmiany: dict[str, Any] = {}
    utworzone: list[str] = []
    if tryb == "wyczysc":
        aparaty: list[dict[str, Any]] = []
    elif tryb == "szablon":
        wynik = _aparaty_z_szablonu(nowy, rekord, payload)
        if isinstance(wynik, dict):
            return wynik
        aparaty, ref_szablonu = wynik
        zmiany["bay_template_ref"] = ref_szablonu
        zmiany["config_id"] = _konfiguracja_pola(ref_szablonu)
    elif tryb == "standard":
        szablon_std = _szablon_standardu(nowy, rekord, payload)
        if isinstance(szablon_std, dict):
            return szablon_std
        aparaty = aparaty_gniazd_standardu(bay_ref, szablon_std)
        zmiany["szablon_standardu_ref"] = szablon_std.id
    else:
        wpisy = payload.get("devices")
        if not isinstance(wpisy, list) or not wpisy:
            return _error_response(
                f"Uzupełnij pole {pole('devices', 'set_bay_equipment')} — wskaż aparaty pola "
                "(albo usuń wyposażenie).",
                "bay_equipment.devices_missing",
            )
        galezie = {
            str(g.get("ref_id")): g
            for g in nowy.get("branches", [])
            if isinstance(g, dict) and g.get("type") in TYPY_LACZNIKOW_ENM
        }
        przekladniki = {
            str(m.get("ref_id")): m for m in nowy.get("measurements", []) if isinstance(m, dict)
        }
        szablon = szablon_pola_standardu(rekord.get("szablon_standardu_ref"))
        aparaty = []
        wskazane: set[str] = set()
        gniazda: set[str] = set()
        for indeks, wpis in enumerate(wpisy):
            aparat = _sprawdz_aparat(nowy, rekord, indeks, wpis, galezie, przekladniki, szablon)
            if "error" in aparat:
                return aparat
            gniazdo_ref = aparat.get("gniazdo_ref")
            if gniazdo_ref is not None:
                if gniazdo_ref in gniazda:
                    # `_sprawdz_aparat` przyjął gniazdo, więc szablon pola je zna.
                    assert szablon is not None
                    nazwa_gniazda = next(g.nazwa_pl for g in szablon.gniazda if g.id == gniazdo_ref)
                    return _error_response(
                        f"Pole {pole('devices', 'set_bay_equipment')}: dwa aparaty obsadzają "
                        f"to samo gniazdo standardu „{nazwa_gniazda}” ({szablon.nazwa_pl}) — "
                        "gniazdo to jeden aparat.",
                        "bay_equipment.slot_duplicate",
                    )
                gniazda.add(str(gniazdo_ref))
            if "_przekladnik" in aparat:
                przygotowany = _przekladnik_pola(nowy, bay_ref, aparat)
                if isinstance(przygotowany, dict):
                    return przygotowany
                nowy, utworzony = przygotowany
                if utworzony is not None:
                    utworzone.append(utworzony)
            linked = aparat.get("linked_ref")
            if linked is not None:
                if linked in wskazane:
                    return _error_response(
                        f"Pole {pole('devices', 'set_bay_equipment')}: dwa aparaty wskazują "
                        "ten sam element modelu — aparat pola to jeden łącznik albo jeden "
                        "przekładnik.",
                        "bay_equipment.linked_ref_duplicate",
                    )
                wskazane.add(str(linked))
            aparaty.append(aparat)

    zmien_pole(nowy, bay_ref, primary_devices=aparaty, **zmiany)
    return _odpowiedz(nowy, bay_ref, utworzone)
