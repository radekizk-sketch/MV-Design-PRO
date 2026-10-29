"""W5-C: wyposażenie pola SN — operacja ``set_bay_equipment`` i trzy stany danych aparatu.

PO CO. Rysunek pola (SLD) i każdy czytelnik aparatów pola (`field_read_model`, blokady
uziemnika, tor zasilania) czyta ``Bay.primary_devices``. Pole bez szablonu dostawało pustą
listę, a renderer rysował wtedy pole „z konwencji" — bez danych, ale bez nazwania tego.
Projektant nie miał operacji, która wyposażenie pola USTAWIA po jego utworzeniu. Ta
operacja ją daje, catalog-first, a stan danych każdego aparatu jest nazwany:

* ``MODEL`` — aparat z pozycją katalogową (``catalog_ref``): dana projektowa z dowodem —
  pozycja katalogu aparatów SN (tryb ``katalog``) albo szablon aparatu z BOM-u katalogowego
  pola rodziny rozdzielnicy (tryb ``szablon`` z polem producenta,
  ``BayDeviceInstanceTemplate.device_template_ref``);
* ``PROPOZYCJA`` — aparat z szablonu pola albo rodzaju bez katalogu SN (głowica kablowa,
  wkładka bezpiecznikowa, transformator pola): WARTOŚĆ ROBOCZA. Odpowiedź operacji niesie
  ją jako ``DanaPrzyjeta`` z jakością ``ESTIMATED`` (kontrakt werdyktu wyjaśnialnego —
  dana przyjęta bez pełnej walidacji ma nazwę, powód i jakość, nigdy nie jest „pewna");
* ``BRAK_DANYCH`` — pole bez aparatów (``primary_devices == []``).

Stan wyprowadza ``stan_danych_aparatu`` / ``stan_danych_wyposazenia`` z ``catalog_ref``
— bez nowego pola zapisanego obok (jedna prawda).

TRZY TRYBY (``mode``):

* ``katalog`` — lista ``devices`` od projektanta. Rodzaj z katalogiem SN (wyłącznik,
  rozłącznik, odłącznik, uziemnik — APARAT_SN; przekładnik prądowy — CT; przekładnik
  napięciowy — VT; ogranicznik przepięć — OGRANICZNIK_SN) WYMAGA ``catalog_ref`` tej
  przestrzeni (brama istnienia ``domain_operations_v2._pozycja_katalogu``), a dla APARAT_SN —
  zgodnego ``device_kind`` pozycji. Rodzaj bez katalogu SN nie przyjmuje ``catalog_ref``.
  Rodzina rozdzielnicy pola (``switchgear_family_ref``) zawęża rodzaje do
  ``allowed_apparatus_kinds``.
* ``szablon`` — aparaty z szablonu pola (``bay_template_ref`` z ładunku albo z rekordu)
  przez TEN SAM resolver, co budowa pola (``pole_katalogowe.aparaty_pola_z_referencji``):
  szablon kanoniczny daje propozycję, katalogowe pole rodziny — aparaty z BOM-u.
* ``wyczysc`` — usunięcie wyposażenia (stan ``BRAK_DANYCH``).

POZIOM IZOLACJI (reguła modelu, nie ocena doboru). Aparat z katalogu o napięciu najwyższym
U_m (aparatura rozdzielcza: U_r, PN-EN 62271-1 p. 5.2; ogranicznik: U_m typu) niższym od
napięcia najwyższego sieci U_s szyny pola (IEC 60038 tab. 3–5, IEC 60071-1:2006 p. 3.9–3.10)
jest aparatem innego poziomu napięcia — odmowa ``bay_equipment.voltage_insufficient`` w trybie
``katalog`` i ``szablon`` (aparaty z BOM-u rodziny). Ten sam predykat i ta sama tabela, co
odmowa ``spd.voltage_mismatch`` operacji ``add_surge_arrester_sn``
(`domain_operations_v2.odmowa_poziomu_izolacji`). Przekładniki CT/VT: katalog nie niesie U_m
(tylko przekładnię i klasę), więc reguła nie ma dla nich danej.

GRANICE (nazwane, nie przemilczane). Operacja NIE ocenia doboru aparatu pod obciążenie
i zwarcie (I_r ≥ I_obc, I_th/I_dyn ≥ prądy zwarciowe) — to kryteria warstwy analizy (dowód
doboru aparatury) z wynikiem liczbowym i limitem; ocena „na wejściu" byłaby werdyktem bez
wyjaśnienia. Operacja NIE ustawia stanu łącznika — stan żyje na gałęzi
(``status``/``normal_state``, operacje ``open_switch``/``close_switch``/
``set_normal_open_point``), a aparat pola wskazuje ją ``linked_ref``.

PORTY (karta UX-04/POLE-LINIOWE-WZORZEC). Kolejność ``devices`` w trybie ``katalog`` jest
kolejnością fizyczną od szyny: porty aparatów (``BayPrimaryDevice.ports``) wyprowadza z niej
pisarz rekordu pola (``enm.pola.zmien_pole`` → ``rodzaje_aparatury.porty_toru_pola``) — tą samą
regułą, co szablon pola i BOM katalogowego pola rodziny.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any, Literal, get_args

from network_model.catalog.bay_templates import (
    _SWITCHABLE_PRIMARY_KINDS,
    BAY_TEMPLATE_REGISTRY,
    KLASY_POLA_LINIOWEGO,
    NAZWY_KLASY_POLA_PL,
)
from network_model.catalog.gazy_fluorowane import STANY_OBIEKTU
from network_model.catalog.rodzaje_aparatury import (
    KLUCZ_ODGALEZIENIA,
    RODZAJ_LACZNIKA_TROJPOLOZENIOWEGO,
    RODZAJ_PRZEKLADNIKA_FERRANTIEGO,
    RODZAJ_WSKAZNIKA_NAPIECIA,
)
from network_model.catalog.switchgear.apparatus_vocabulary import FAMILY_APPARATUS_FOR_ENM_KIND
from network_model.catalog.switchgear.families import SWITCHGEAR_FAMILY_REGISTRY
from werdykt.kontrakt import DanaPrzyjeta
from werdykt.proweniencja import FieldQuality

from .domain_operations import (
    _error_response,
    _konfiguracja_pola,
    _powiaz_aparaty_pola_z_galezia,
    _response,
)
from .katalog_projektu import katalog_biezacy
from .kopia_graniczna import kopia_graniczna_enm
from .models import BayPrimaryDevice
from .pola import aparaty_po_wymianie, czy_pole_nn, poziom_pol, zmien_pole
from .pola import pole as pole_modelu
from .pole_katalogowe import aparaty_pola_z_referencji, pole_katalogowe
from .slownik_komunikatow import lista_pl, opis_elementu, pole
from .topology import TYPY_LACZNIKOW_ENM

StanDanychAparatu = Literal["MODEL", "PROPOZYCJA", "BRAK_DANYCH"]
TrybWyposazenia = Literal["katalog", "szablon", "wyczysc"]

#: Rodzaj aparatu pierwotnego pola → przestrzeń katalogu SN. JEDYNA tablica tej reguły.
PRZESTRZEN_KATALOGU_APARATU: dict[str, str] = {
    "CB": "APARAT_SN",
    "LOAD_SWITCH": "APARAT_SN",
    "DS": "APARAT_SN",
    "ES": "APARAT_SN",
    "CT": "CT",
    "VT": "VT",
    "SURGE_ARRESTER": "OGRANICZNIK_SN",
    # Aparaty pola baterii kondensatorów (`catalog.rodzaje_aparatury`): przekładnik
    # niezrównoważenia jest przekładnikiem prądowym, przekładnik międzyfazowy — napięciowym.
    "UNBALANCE_CT": "CT",
    "PHASE_TO_PHASE_VT": "VT",
}

#: Rodzaj aparatu APARAT_SN (``MVApparatusType.device_kind``) dopuszczony dla rodzaju
#: aparatu pierwotnego pola. Reklozer jest wyłącznikiem z automatyką SPZ; rozłącznik
#: bezpiecznikowy — rozłącznikiem pola transformatorowego (wkładki są jego częścią).
RODZAJE_KATALOGOWE_APARATU: dict[str, frozenset[str]] = {
    "CB": frozenset({"WYLACZNIK", "REKLOZER"}),
    "LOAD_SWITCH": frozenset({"ROZLACZNIK", "ROZLACZNIK_BEZPIECZNIKOWY"}),
    "DS": frozenset({"ODLACZNIK"}),
    "ES": frozenset({"UZIEMNIK"}),
}

#: Rodzaje aparatu pola SN bez katalogu SN w repozytorium — przyjmowane wyłącznie jako
#: wartość robocza (``PROPOZYCJA``), nigdy z ``catalog_ref``.
#: Łącznik trójpołożeniowy, wskaźnik napięcia i przekładnik Ferrantiego (karta
#: UX-04/POLE-LINIOWE-WZORZEC, ENEA Zeszyt 1 Z.10) nie mają przestrzeni katalogu SN — są
#: wartością roboczą z `dane_przyjete` (jakość ESTIMATED), nigdy daną producenta.
RODZAJE_BEZ_KATALOGU_SN: frozenset[str] = frozenset(
    {
        "FUSE",
        "CABLE_HEAD",
        "TRANSFORMER_DEVICE",
        RODZAJ_LACZNIKA_TROJPOLOZENIOWEGO,
        RODZAJ_WSKAZNIKA_NAPIECIA,
        RODZAJ_PRZEKLADNIKA_FERRANTIEGO,
    }
)

#: Rodzaje aparatu wskazujące gałąź łącznikową modelu (``linked_ref``) — ich stan
#: (otwarty/zamknięty) jest stanem tej gałęzi.
RODZAJE_Z_GALEZIA: frozenset[str] = frozenset({"CB", "LOAD_SWITCH", "DS", "FUSE"})
#: Rodzaje z rolą uziemienia (``earthing_role``).
RODZAJE_Z_ROLA_UZIEMIENIA: frozenset[str] = frozenset({"ES", "SURGE_ARRESTER"})
#: Aparaty łączeniowe toru (sterowalne) — TEN SAM zbiór, co szablony pola.
RODZAJE_STEROWALNE: frozenset[str] = _SWITCHABLE_PRIMARY_KINDS

_UMIEJSCOWIENIA: frozenset[str] = frozenset(
    get_args(BayPrimaryDevice.model_fields["placement"].annotation)
)

#: Nazwa rodzaju aparatu w zdaniu dla projektanta.
NAZWY_RODZAJOW_APARATU_POLA_PL: dict[str, str] = {
    "CB": "wyłącznik",
    "LOAD_SWITCH": "rozłącznik",
    "DS": "odłącznik",
    "ES": "uziemnik",
    "CT": "przekładnik prądowy",
    "VT": "przekładnik napięciowy",
    "SURGE_ARRESTER": "ogranicznik przepięć",
    "FUSE": "bezpieczniki",
    "CABLE_HEAD": "głowica kablowa",
    "TRANSFORMER_DEVICE": "transformator pola",
    RODZAJ_LACZNIKA_TROJPOLOZENIOWEGO: "łącznik trójpołożeniowy",
    RODZAJ_WSKAZNIKA_NAPIECIA: "wskaźnik napięcia",
    RODZAJ_PRZEKLADNIKA_FERRANTIEGO: "przekładnik Ferrantiego",
    "UNBALANCE_CT": "przekładnik niezrównoważenia baterii",
    "PHASE_TO_PHASE_VT": "przekładnik napięciowy międzyfazowy",
}


def stan_danych_aparatu(aparat: Mapping[str, Any] | BayPrimaryDevice) -> StanDanychAparatu:
    """``MODEL`` gdy aparat ma pozycję katalogową, inaczej ``PROPOZYCJA`` (wartość robocza)."""
    ref = aparat.get("catalog_ref") if isinstance(aparat, Mapping) else aparat.catalog_ref
    return "MODEL" if isinstance(ref, str) and ref.strip() else "PROPOZYCJA"


def stan_danych_wyposazenia(
    aparaty: Sequence[Mapping[str, Any]] | Sequence[BayPrimaryDevice],
) -> StanDanychAparatu:
    """Stan danych wyposażenia pola: ``BRAK_DANYCH`` (brak aparatów), ``MODEL`` (każdy
    aparat z katalogu), inaczej ``PROPOZYCJA`` (co najmniej jedna wartość robocza)."""
    if not aparaty:
        return "BRAK_DANYCH"
    stany = {stan_danych_aparatu(a) for a in aparaty}
    return "MODEL" if stany == {"MODEL"} else "PROPOZYCJA"


def dane_przyjete_wyposazenia(aparaty: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Aparaty w stanie ``PROPOZYCJA`` jako dane przyjęte (kontrakt werdyktu, jakość
    ``ESTIMATED``) — w kolejności aparatów pola."""
    wynik: list[dict[str, Any]] = []
    for aparat in aparaty:
        if stan_danych_aparatu(aparat) != "PROPOZYCJA":
            continue
        rodzaj = NAZWY_RODZAJOW_APARATU_POLA_PL.get(str(aparat.get("kind")), "aparat")
        oznaczenie = aparat.get("designation")
        nazwa = f"{rodzaj} {oznaczenie}" if oznaczenie else rodzaj
        powod = (
            "rodzaj aparatu bez katalogu SN — przyjęty z szablonu pola jako wartość robocza"
            if aparat.get("kind") in RODZAJE_BEZ_KATALOGU_SN
            else "aparat z szablonu pola bez pozycji katalogowej — wartość robocza do "
            "zastąpienia wyborem z katalogu"
        )
        wynik.append(
            DanaPrzyjeta(
                nazwa_pl=nazwa,
                wartosc=None,
                powod_pl=powod,
                jakosc=FieldQuality.ESTIMATED,
            ).model_dump(mode="json")
        )
    return wynik


def napiecie_najwyzsze_aparatu_kv(rodzaj: object, catalog_ref: object) -> float | None:
    """Napięcie najwyższe U_m aparatu pola z pozycji katalogu (``None`` — brak danej).

    APARAT_SN: ``u_n_kv`` pozycji (napięcie znamionowe aparatu rozdzielczego jest wartością
    U_m, PN-EN 62271-1 p. 5.2); OGRANICZNIK_SN: ``u_m_kv`` typu. CT/VT: katalog nie niesie
    U_m — ``None``.
    """
    if not isinstance(catalog_ref, str) or not catalog_ref.strip():
        return None
    przestrzen = PRZESTRZEN_KATALOGU_APARATU.get(str(rodzaj))
    katalog = katalog_biezacy()
    if przestrzen == "APARAT_SN":
        aparat = katalog.get_mv_apparatus_type(catalog_ref)
        return float(aparat.u_n_kv) if aparat is not None else None
    if przestrzen == "OGRANICZNIK_SN":
        ogranicznik = katalog.get_surge_arrester_type(catalog_ref)
        return float(ogranicznik.u_m_kv) if ogranicznik is not None else None
    return None


def _odmowa_izolacji_aparatow(
    enm: dict[str, Any], rekord: dict[str, Any], aparaty: Sequence[Mapping[str, Any]]
) -> dict[str, Any] | None:
    """Pierwsza odmowa poziomu izolacji wśród aparatów pola (kolejność aparatów)."""
    from .domain_operations_v2 import _bus_voltage_kv, odmowa_poziomu_izolacji

    bus_ref = rekord.get("bus_ref")
    napiecie_szyny = _bus_voltage_kv(enm, bus_ref) if isinstance(bus_ref, str) else None
    for numer, aparat in enumerate(aparaty, start=1):
        rodzaj = aparat.get("kind")
        odmowa = odmowa_poziomu_izolacji(
            u_m_kv=napiecie_najwyzsze_aparatu_kv(rodzaj, aparat.get("catalog_ref")),
            bus_voltage_kv=napiecie_szyny,
            opis_pl=(
                f"Pole {pole('devices', 'set_bay_equipment')}: aparat {numer} "
                f"({NAZWY_RODZAJOW_APARATU_POLA_PL.get(str(rodzaj), 'aparat')}) "
                f"{opis_elementu(enm, str(rekord.get('ref_id')), 'pola')}"
            ),
            error_code="bay_equipment.voltage_insufficient",
        )
        if odmowa is not None:
            return odmowa
    return None


def _odpowiedz(nowy: dict[str, Any], bay_ref: str, aparaty: list[dict[str, Any]]) -> dict[str, Any]:
    wynik = _response(
        nowy,
        updated=[bay_ref],
        selection_id=bay_ref,
        selection_type="bay",
        events=[{"event_seq": 1, "event_type": "BAY_EQUIPMENT_SET", "element_id": bay_ref}],
    )
    if "error" in wynik:
        return wynik
    wynik["wyposazenie_pola"] = {
        "bay_ref": bay_ref,
        "stan_danych": stan_danych_wyposazenia(aparaty),
        "aparaty": [
            {"device_ref": a.get("device_ref"), "stan_danych": stan_danych_aparatu(a)}
            for a in aparaty
        ],
        "dane_przyjete": dane_przyjete_wyposazenia(aparaty),
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
    # Karta UX-04/POLE-LINIOWE-WZORZEC: aparat główny szablonu WSKAZUJE łącznik modelu tego
    # pola (`Bay.equipment_refs`) — ta sama reguła co budowa pola liniowego GPZ
    # (`_powiaz_aparaty_pola_z_galezia`); bez tego rysunek pokazywał wyłącznik bez stanu przy
    # zamkniętej gałęzi aparatu. Stanu łączników operacja nie ustawia (`z_polozeniem=False`).
    galezie_pola = [
        g
        for g in enm.get("branches", [])
        if isinstance(g, dict)
        and g.get("type") in TYPY_LACZNIKOW_ENM
        and g.get("ref_id") in (rekord.get("equipment_refs") or [])
    ]
    if len(galezie_pola) == 1:
        aparaty = _powiaz_aparaty_pola_z_galezia(aparaty, galezie_pola[0], z_polozeniem=False)
    return aparaty, ref


def _sprawdz_aparat(
    enm: dict[str, Any],
    rekord: dict[str, Any],
    indeks: int,
    wpis: object,
    galezie: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    """Aparat z ładunku trybu ``katalog`` → rekord ``BayPrimaryDevice`` albo odmowa
    (słownik z kluczem ``error``)."""
    bay_ref = str(rekord["ref_id"])
    numer = indeks + 1
    if not isinstance(wpis, Mapping):
        return _error_response(
            f"Pole {pole('devices', 'set_bay_equipment')}: aparat {numer} nie jest opisem "
            "aparatu (rodzaj, umiejscowienie, pozycja katalogowa).",
            "bay_equipment.device_invalid",
        )
    rodzaj = wpis.get("kind")
    if rodzaj not in PRZESTRZEN_KATALOGU_APARATU and rodzaj not in RODZAJE_BEZ_KATALOGU_SN:
        dopuszczalne = lista_pl(
            NAZWY_RODZAJOW_APARATU_POLA_PL[k]
            for k in (*PRZESTRZEN_KATALOGU_APARATU, *sorted(RODZAJE_BEZ_KATALOGU_SN))
        )
        return _error_response(
            f"Pole {pole('devices', 'set_bay_equipment')}: aparat {numer} ma rodzaj spoza "
            f"aparatów pola SN — dopuszczalne: {dopuszczalne}.",
            "bay_equipment.kind_not_allowed",
        )
    nazwa_rodzaju = NAZWY_RODZAJOW_APARATU_POLA_PL[str(rodzaj)]
    umiejscowienie = wpis.get("placement")
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
        aparat_rodziny = FAMILY_APPARATUS_FOR_ENM_KIND.get(str(rodzaj))
        if aparat_rodziny is not None and aparat_rodziny not in rodzina.allowed_apparatus_kinds:
            return _error_response(
                f"Pole {pole('devices', 'set_bay_equipment')}: rodzina rozdzielnicy "
                f"{opis_elementu(enm, bay_ref, 'pola')} nie przewiduje aparatu „{nazwa_rodzaju}” "
                f"(aparat {numer}).",
                "bay_equipment.family_disallows",
            )

    catalog_ref = wpis.get("catalog_ref")
    przestrzen = PRZESTRZEN_KATALOGU_APARATU.get(str(rodzaj))
    if przestrzen is None:
        if catalog_ref is not None:
            return _error_response(
                f"Pole {pole('devices', 'set_bay_equipment')}: aparat {numer} ({nazwa_rodzaju}) "
                "nie ma katalogu SN — przyjmowany jest jako wartość robocza bez pozycji "
                "katalogowej.",
                "bay_equipment.catalog_not_applicable",
            )
    else:
        if not isinstance(catalog_ref, str) or not catalog_ref.strip():
            return _error_response(
                f"Pole {pole('devices', 'set_bay_equipment')}: aparat {numer} ({nazwa_rodzaju}) "
                "wymaga pozycji katalogowej — wskaż typ z katalogu.",
                "bay_equipment.catalog_ref_missing",
            )
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
        dozwolone = RODZAJE_KATALOGOWE_APARATU.get(str(rodzaj))
        if dozwolone is not None:
            pozycja = katalog_biezacy().mv_apparatus_types.get(catalog_ref)
            rodzaj_katalogu = getattr(pozycja, "device_kind", None)
            if rodzaj_katalogu not in dozwolone:
                return _error_response(
                    f"Pole {pole('devices', 'set_bay_equipment')}: pozycja katalogowa aparatu "
                    f"{numer} opisuje inny rodzaj aparatu niż „{nazwa_rodzaju}”.",
                    "bay_equipment.catalog_kind_mismatch",
                )

    stan_obiektu = wpis.get("stan_obiektu")
    if stan_obiektu is not None and stan_obiektu not in STANY_OBIEKTU:
        return _error_response(
            f"Pole {pole('devices', 'set_bay_equipment')}: aparat {numer} ({nazwa_rodzaju}) ma "
            "stan obiektu spoza słownika — istniejący albo projektowany (puste: aparat "
            "niezmieniony zachowuje stan, nowy jest projektowany).",
            "bay_equipment.object_state_invalid",
        )
    rola_uziemienia = wpis.get("earthing_role")
    if rola_uziemienia is not None and rodzaj not in RODZAJE_Z_ROLA_UZIEMIENIA:
        return _error_response(
            f"Pole {pole('devices', 'set_bay_equipment')}: rolę uziemienia ma wyłącznie "
            f"uziemnik i ogranicznik przepięć, nie {nazwa_rodzaju} (aparat {numer}).",
            "bay_equipment.earthing_role_not_applicable",
        )
    linked_ref = wpis.get("linked_ref")
    if linked_ref is not None:
        galaz = galezie.get(str(linked_ref))
        if rodzaj not in RODZAJE_Z_GALEZIA or galaz is None:
            return _error_response(
                f"Pole {pole('devices', 'set_bay_equipment')}: aparat {numer} "
                f"({nazwa_rodzaju}) może wskazywać wyłącznie łącznik modelu, a wskazany element "
                "nim nie jest.",
                "bay_equipment.linked_ref_invalid",
            )
        if str(linked_ref) not in (rekord.get("equipment_refs") or []):
            # Aparat pola wskazuje łącznik TEGO pola (`Bay.equipment_refs`) — łącznik innego
            # pola pokazałby w rysunku i w odczycie pola stan cudzego toru.
            return _error_response(
                f"Pole {pole('devices', 'set_bay_equipment')}: aparat {numer} "
                f"({nazwa_rodzaju}) wskazuje {opis_elementu(enm, str(linked_ref), 'łącznik')}, "
                f"który nie należy do {opis_elementu(enm, bay_ref, 'pola')} — wskaż łącznik "
                "z wyposażenia tego pola.",
                "bay_equipment.linked_ref_other_bay",
            )
    odgalezienie = wpis.get("odgalezienie")
    if odgalezienie is not None and (
        not isinstance(odgalezienie, str) or not odgalezienie.strip().isalnum()
    ):
        return _error_response(
            f"Pole {pole('devices', 'set_bay_equipment')}: aparat {numer} ({nazwa_rodzaju}) ma "
            "oznaczenie odgałęzienia toru, które nie jest krótkim identyfikatorem (litery "
            "i cyfry, np. „pn” — odgałęzienie przekładnika napięciowego).",
            "bay_equipment.branch_invalid",
        )
    przekladnia = wpis.get("przekladnia")
    if przekladnia is not None and (
        rodzaj != "CORE_BALANCE_CT" or not isinstance(przekladnia, str) or not przekladnia.strip()
    ):
        return _error_response(
            f"Pole {pole('devices', 'set_bay_equipment')}: aparat {numer} ({nazwa_rodzaju}) ma "
            "przekładnię, a zapisuje się ją wyłącznie przekładnikowi Ferrantiego (np. „1/100” — "
            "zapis z rysunku standardu).",
            "bay_equipment.ratio_not_applicable",
        )
    aparat: dict[str, Any] = {
        "device_ref": f"{bay_ref}::dev::{indeks}",
        "symbol_ref": f"symbol:{str(rodzaj).lower()}",
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
        ("stan_obiektu", stan_obiektu),
        ("przekladnia", przekladnia.strip() if isinstance(przekladnia, str) else None),
        # Odgałęzienie toru (`rodzaje_aparatury.KLUCZ_ODGALEZIENIA`): porty aparatu wyprowadza
        # z niego pisarz rekordu (`porty_toru_pola`) — ta sama reguła co szablon pola Z.11.1/Z.11.
        (KLUCZ_ODGALEZIENIA, odgalezienie.strip() if isinstance(odgalezienie, str) else None),
    ):
        if wartosc is not None:
            aparat[klucz] = wartosc
    # Tabliczka przekładnika z POZYCJI KATALOGU (jedno źródło): rdzenie typu CT, uzwojenia typu
    # VT (`CTType.lista_rdzeni`, `VTType.lista_uzwojen`) — ta sama lista, którą niesie szablon
    # pola wskazujący tę pozycję.
    if rodzaj == "CT" and isinstance(catalog_ref, str):
        typ_ct = katalog_biezacy().ct_types.get(catalog_ref)
        rdzenie = typ_ct.lista_rdzeni() if typ_ct is not None else ()
        if rdzenie:
            aparat["rdzenie"] = [r.model_dump(mode="json") for r in rdzenie]
    if rodzaj == "VT" and isinstance(catalog_ref, str):
        typ_vt = katalog_biezacy().vt_types.get(catalog_ref)
        uzwojenia = typ_vt.lista_uzwojen() if typ_vt is not None else ()
        if uzwojenia:
            aparat["uzwojenia"] = [u.model_dump(mode="json") for u in uzwojenia]
    return aparat


def set_bay_equipment(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Ustaw wyposażenie (aparaty pierwotne) pola SN — tryb ``katalog``/``szablon``/``wyczysc``."""
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
            "operacje rozdzielnicy nN, nie wyposażenie pola SN.",
            "bay_equipment.bay_not_mv",
        )
    tryb = payload.get("mode")
    if tryb not in get_args(TrybWyposazenia):
        return _error_response(
            f"Uzupełnij pole {pole('mode', 'set_bay_equipment')} — z katalogu, z szablonu pola "
            "albo usunięcie wyposażenia.",
            "bay_equipment.mode_invalid",
        )

    zmiany: dict[str, Any] = {}
    # Klasa pola liniowego (IRiESD II.4.5.4.2.1–2.3): klucz obecny w ładunku ustawia ją
    # (`null` — klasa nieustalona), nieobecny zostawia klasę rekordu.
    if "klasa_pola" in payload:
        klasa = payload.get("klasa_pola")
        if klasa is not None and klasa not in KLASY_POLA_LINIOWEGO:
            return _error_response(
                f"Pole {pole('klasa_pola', 'set_bay_equipment')}: klasa spoza słownika — "
                f"{lista_pl(NAZWY_KLASY_POLA_PL[k] for k in KLASY_POLA_LINIOWEGO)} "
                "(puste: klasa nieustalona).",
                "bay_equipment.line_class_invalid",
            )
        zmiany["klasa_pola"] = klasa
    if tryb == "wyczysc":
        aparaty: list[dict[str, Any]] = []
    elif tryb == "szablon":
        wynik = _aparaty_z_szablonu(nowy, rekord, payload)
        if isinstance(wynik, dict):
            return wynik
        aparaty, ref_szablonu = wynik
        zmiany["bay_template_ref"] = ref_szablonu
        zmiany["config_id"] = _konfiguracja_pola(ref_szablonu)
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
        aparaty = []
        wskazane_galezie: set[str] = set()
        for indeks, wpis in enumerate(wpisy):
            aparat = _sprawdz_aparat(nowy, rekord, indeks, wpis, galezie)
            if "error" in aparat:
                return aparat
            linked = aparat.get("linked_ref")
            if linked is not None:
                if linked in wskazane_galezie:
                    return _error_response(
                        f"Pole {pole('devices', 'set_bay_equipment')}: dwa aparaty wskazują "
                        "ten sam łącznik modelu — aparat pola to jeden łącznik.",
                        "bay_equipment.linked_ref_duplicate",
                    )
                wskazane_galezie.add(str(linked))
            aparaty.append(aparat)

    # Poziom izolacji — ten sam predykat w trybie katalogu i szablonu (BOM rodziny).
    odmowa_izolacji = _odmowa_izolacji_aparatow(nowy, rekord, aparaty)
    if odmowa_izolacji is not None:
        return odmowa_izolacji

    # Funkcje EAZ pola z jego szablonu i klasy — TEN SAM resolver co każda operacja tworząca
    # pole (`_resolve_bay_template_protection_codes`: producent → szablon → rola). Zmiana
    # szablonu albo klasy przelicza zestaw; tryb bez zmiany żadnej z nich zestawu nie dotyka.
    szablon_po = zmiany.get("bay_template_ref", rekord.get("bay_template_ref"))
    klasa_po = zmiany.get("klasa_pola", rekord.get("klasa_pola"))
    if szablon_po and (
        szablon_po != rekord.get("bay_template_ref") or klasa_po != rekord.get("klasa_pola")
    ):
        from .domain_operations_v2 import _resolve_bay_template_protection_codes

        zmiany["protection_codes"] = _resolve_bay_template_protection_codes(
            rekord.get("manufacturer_ref"), szablon_po, str(rekord.get("bay_role")), klasa_po
        )
    # Stan obiektu instancji (korekta właściciela 2026-10-28): aparat niezmieniony zachowuje
    # stan, aparat wymieniony albo dodany jest nową instancją — projektowaną.
    aparaty = aparaty_po_wymianie(rekord.get("primary_devices") or [], aparaty)
    zmien_pole(nowy, bay_ref, primary_devices=aparaty, **zmiany)
    # Gałąź łącznika wskazana aparatem pola (`linked_ref`) to TEN SAM fizyczny aparat — jej stan
    # obiektu jest stanem aparatu (jedno źródło: `enm.gaz_fluorowany_pola.stan_obiektu_lacznika`).
    stany_galezi = {
        str(a["linked_ref"]): a.get("stan_obiektu") for a in aparaty if a.get("linked_ref")
    }
    for galaz in nowy.get("branches") or []:
        if isinstance(galaz, dict) and galaz.get("ref_id") in stany_galezi:
            galaz["stan_obiektu"] = stany_galezi[galaz["ref_id"]]
    return _odpowiedz(nowy, bay_ref, aparaty)
