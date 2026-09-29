"""Materializacja profilu dynamicznego z katalogu do kopii `Generator.dynamika` (karta AB-P1).

PO CO. Wiązanie `dynamic_model_ref` (profil katalogu `network_model.catalog.der_dynamic`)
żyło w `materialized_params` wytwórcy, ale bieg czasowy `dynamika_rms` czyta WYŁĄCZNIE
`Generator.dynamika` (kontrakt kanoniczny `enm.dynamika_modele`). Nikt nie robił z profilu
tej kopii — `to_parametry_dynamiczne` nie miało wołającego — więc projektant, który
związał źródło z katalogowym modelem dynamicznym, i tak dostawał odmowę „brak bloku
parametrów dynamicznych". Ten moduł jest JEDYNYM miejscem przejścia katalog -> kopia.

REGUŁA KOPII (jedno źródło prawdy, predykaty parami). Dla wytwórcy z wiązaniem kopia jest
FUNKCJĄ dwóch danych: profilu z wiązania i tabliczki urządzenia (baza mocy = `sn_mva`
jednostki × liczba jednostek, `enm.models.liczba_jednostek_zrodla`). Ta sama para daje
bajtowo tę samą kopię (determinizm), a:

* operacja wiązania (`set_der_catalog_bindings`) odrzuca profil NIEZGODNY z rodzajem
  wytwórcy nazwanym kodem — profil PV na turbinie wiatrowej to błąd danych, nie wiązanie;
* KAŻDA odpowiedź operacji domenowej (`enm.domain_operations._response`) przelicza kopie
  wszystkich wytwórców z wiązaniem (`synchronizuj_dynamike_z_wiazan`) — zmiana tabliczki,
  liczby jednostek albo typu katalogowego nie zostawia kopii policzonej ze starych danych;
  kopia, której nie da się zbudować (brak tabliczki, brak danych magazynu), jest USUWANA,
  a powód podaje `stan_dynamiki_generatorow`;
* odwiązanie (`dynamic_model_ref: null`) usuwa kopię razem z wiązaniem;
* bieg `dynamika_rms` i bramka gotowości odmawiają, gdy kopia w migawce nie jest równa
  materializacji (`braki_kopii_dynamiki`) — model zapisany z pominięciem operacji
  domenowych nie przemyci kopii nieaktualnej.

Wytwórca BEZ wiązania zachowuje własny blok `dynamika` (karta producenta, certyfikat —
dane spoza katalogu) nietknięty. Wiązanie ma pierwszeństwo: katalog jest źródłem kopii.

PROFIL TYPU (`materialized_params.dynamic_profile_id`, wskazany przez pozycję katalogu
przekształtnika) NIE jest źródłem kopii — jest PODPOWIEDZIĄ wyboru (`StanDynamikiGeneratora.
profil_typu`). Reguła W6-1 SS0 p.3: profil typowy normy wchodzi do modelu wyłącznie po
JAWNYM wyborze projektanta; automatyczna kopia z typu nadpisywałaby też własny blok
wytwórcy (karta producenta) profilem typowym bez żadnej decyzji.

RODZINY (pomiar katalogu, karta AB-P1 §0.3). Katalog `der_dynamic` ma profile PV i BESS
(nadążne i tworzące sieć) oraz turbin IEC 61400-27 typu 1–4. NIE ma profili maszyny
synchronicznej — dla niej materializacja odmawia `KOD_RODZINA_BEZ_PROFILI`. Profil BESS
opisuje przekształtnik (PCS), a kontrakt `Magazyn` wymaga dodatkowo sprawności ładowania
i rozładowania oraz granic i stanu początkowego SOC — tych danych nie ma ani profil, ani
tabliczka katalogowa wytwórcy, więc materializacja BESS odmawia `KOD_MAGAZYN_DANE` z listą
brakujących pól, zamiast zbudować przekształtnik bez zasobnika (inna rodzina urządzenia).
"""

from __future__ import annotations

import copy
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from network_model.catalog.der_dynamic import (
    DerDynamicProfile,
    InverterDynamicProfile,
    WindTurbineDynamicProfile,
    get_profile,
    list_all_profile_ids,
)
from network_model.odmowa_danych import OdmowaDanychError
from pydantic import TypeAdapter, ValidationError

from .dynamika_modele import ParametryDynamiczne
from .models import liczba_jednostek_zrodla
from .nazwy_elementow import nazwa_elementu
from .slownik_komunikatow import lista_pl, nazwa_pola, nazwa_rodzaju_generatora

#: Klucz wiązania profilu dynamicznego w `materialized_params` wytwórcy.
KLUCZ_WIAZANIA_DYNAMIKI = "dynamic_model_ref"

#: Profil wskazuje inny rodzaj urządzenia niż wytwórca (np. PV na turbinie wiatrowej).
KOD_PROFIL_NIEZGODNY = "der_bindings.dynamic_profile_incompatible"
#: Rodzaj wytwórcy, dla którego katalog nie ma żadnego profilu dynamicznego.
KOD_RODZINA_BEZ_PROFILI = "der_bindings.dynamic_family_without_profiles"
#: Tabliczka wytwórcy nie niesie mocy znamionowej jednostki (`sn_mva`) — brak bazy mocy.
KOD_TABLICZKA_BRAK = "der_bindings.dynamic_nameplate_missing"
#: Magazyn: kontrakt `Magazyn` wymaga danych zasobnika, których katalog nie ma.
KOD_MAGAZYN_DANE = "der_bindings.dynamic_storage_data_missing"
#: Profil wskazany wiązaniem nie istnieje w katalogu.
KOD_PROFIL_NIEZNANY = "der_bindings.catalog_ref_unknown"
#: Kopia `Generator.dynamika` w migawce różna od materializacji jej wiązania.
KOD_KOPIA_NIEAKTUALNA = "dynamika.kopia_katalogowa_nieaktualna"

#: Rodzaj wytwórcy -> predykat profilu, który go opisuje. Klucze = `Generator.gen_type`.
#: `fw_scig` to maszyna klatkowa (IEC 61400-27 typ 1), `fw_dfig` — dwustronnie zasilana
#: (typ 3), `fw_pmsg`/`wind_inverter` — pełny przekształtnik (typ 4). Typ 2 (WRIG) nie ma
#: rodzaju wytwórcy w modelu, więc jego profil nie pasuje do żadnego wytwórcy.
#: `synchronous` i wytwórca bez rodzaju — brak profili w katalogu.
_TYPY_TURBINY_WYTWORCY: dict[str, str] = {
    "fw_scig": "type_1",
    "fw_dfig": "type_3",
    "fw_pmsg": "type_4",
    "wind_inverter": "type_4",
}
_RODZAJ_FALOWNIKA_WYTWORCY: dict[str, str] = {"pv_inverter": "PV", "bess": "BESS"}

#: Pola kontraktu `Magazyn`, których nie niesie ani profil, ani tabliczka wytwórcy —
#: z opisem dla projektanta (komunikat odmowy nie niesie nazw pól kontraktu, karta #142).
_POLA_ZASOBNIKA_SPOZA_KATALOGU: dict[str, str] = {
    "sprawnosc_ladowania": "sprawność ładowania",
    "sprawnosc_rozladowania": "sprawność rozładowania",
    "soc_min": "minimalny stan naładowania",
    "soc_max": "maksymalny stan naładowania",
    "soc_poczatkowy": "początkowy stan naładowania",
}


def _nazwa_profilu(profile_id: str) -> str:
    """Nazwa profilu katalogowego dla projektanta (nie identyfikator pozycji katalogu)."""
    return f"„{get_profile(profile_id).profile_name_pl}”"


class BladMaterializacjiDynamiki(OdmowaDanychError):
    """Nazwana odmowa materializacji profilu (``kod`` = kod błędu operacji/gotowości)."""

    def __init__(self, kod: str, komunikat: str) -> None:
        super().__init__(komunikat)
        self.kod = kod
        self.komunikat = komunikat


class OdmowaKopiiDynamiki(OdmowaDanychError):
    """Odmowa biegu `dynamika_rms`: kopia z katalogu w migawce nie jest aktualna."""

    def __init__(self, komunikat: str, *, elementy: tuple[str, ...]) -> None:
        super().__init__(f"{komunikat} (kod gotowości: {KOD_KOPIA_NIEAKTUALNA})")
        self.kod = KOD_KOPIA_NIEAKTUALNA
        self.elementy = elementy


def _pasuje(profil: DerDynamicProfile, gen_type: str | None) -> bool:
    if gen_type is None:
        return False
    if isinstance(profil, InverterDynamicProfile):
        return _RODZAJ_FALOWNIKA_WYTWORCY.get(gen_type) == profil.der_kind
    return _TYPY_TURBINY_WYTWORCY.get(gen_type) == profil.iec_type


def profile_zgodne(gen_type: str | None) -> tuple[str, ...]:
    """Identyfikatory profili katalogu opisujących wytwórcę tego rodzaju (kolejność katalogu).

    JEDEN predykat dla listy wyboru w interfejsie (końcówka gotowości dynamiki) i dla
    walidacji operacji wiązania — lista pokazuje dokładnie to, co operacja przyjmie.
    """
    return tuple(pid for pid in list_all_profile_ids() if _pasuje(get_profile(pid), gen_type))


def rodzina_docelowa(profile_id: str) -> str:
    """Rodzina `Generator.dynamika`, którą da profil (dla opisu w interfejsie)."""
    profil = get_profile(profile_id)
    if isinstance(profil, WindTurbineDynamicProfile):
        return f"wiatr_typ_{profil.iec_type.removeprefix('type_')}"
    if profil.der_kind == "BESS":
        return "magazyn"
    return (
        "przeksztaltnikowa_gfm"
        if profil.control_mode == "grid_forming"
        else "przeksztaltnikowa_gfl"
    )


def model_w_rdzeniu(profile_id: str) -> bool:
    """Czy rdzeń dynamiki ma model elektryczny rodziny tego profilu (`RODZINY_OBSLUGIWANE`).

    Import w chwili wywołania: moduł jest czytany przy każdej odpowiedzi operacji
    domenowej, a zbiór rodzin rdzenia potrzebny jest wyłącznie do opisu listy wyboru.
    """
    from network_model.solvers.dynamika.urzadzenia.fabryka import RODZINY_OBSLUGIWANE

    return rodzina_docelowa(profile_id) in RODZINY_OBSLUGIWANE


_ADAPTER_PARAMETROW: TypeAdapter[ParametryDynamiczne] = TypeAdapter(ParametryDynamiczne)


def _postac_kanoniczna(blok: object) -> dict[str, Any] | None:
    """Blok `dynamika` w postaci kanonicznej (walidacja + zrzut JSON) — porównanie kopii
    nie może zależeć od tego, czy zapis migawki pominął pola `None`. Blok niepoprawny
    (nie waliduje się jako `ParametryDynamiczne`) zwraca `None` — nie jest równy żadnej
    materializacji."""
    if not isinstance(blok, Mapping):
        return None
    try:
        return _ADAPTER_PARAMETROW.validate_python(dict(blok)).model_dump(mode="json")
    except ValidationError:
        return None


def sprawdz_zgodnosc(profile_id: str, gen_type: str | None, nazwa_wytworcy: str) -> None:
    """Odmowa nazwana, gdy profil nie istnieje albo nie opisuje wytwórcy tego rodzaju.

    Treść odmowy czyta projektant: wytwórca i profile nazwane nazwami (model, katalog), rodzaj
    wytwórcy słowem formularza — identyfikatory zostają w kodzie błędu i w polach rekordu
    (karty #142 i #144). `nazwa_wytworcy` = `enm.nazwy_elementow.nazwa_elementu`.
    """
    if profile_id not in list_all_profile_ids():
        raise BladMaterializacjiDynamiki(
            KOD_PROFIL_NIEZNANY,
            f"Wskazany profil dynamiczny wytwórcy „{nazwa_wytworcy}” nie istnieje w katalogu "
            "profili dynamicznych — wybierz profil z listy katalogu.",
        )
    zgodne = profile_zgodne(gen_type)
    if not zgodne:
        raise BladMaterializacjiDynamiki(
            KOD_RODZINA_BEZ_PROFILI,
            f"Katalog nie ma profili dynamicznych dla wytwórcy „{nazwa_wytworcy}” rodzaju "
            f"{nazwa_rodzaju_generatora(gen_type)} — model dynamiczny takiego źródła wymaga "
            "danych producenta (karta maszyny albo certyfikat jednostki), nie profilu typowego.",
        )
    if profile_id not in zgodne:
        raise BladMaterializacjiDynamiki(
            KOD_PROFIL_NIEZGODNY,
            f"Profil {_nazwa_profilu(profile_id)} opisuje inny rodzaj urządzenia niż wytwórca "
            f"„{nazwa_wytworcy}” ({nazwa_rodzaju_generatora(gen_type)}). Profile tego rodzaju: "
            f"{lista_pl((_nazwa_profilu(pid) for pid in zgodne), 'i')}.",
        )


def moc_bazowa_mva(generator: Mapping[str, Any]) -> float | None:
    """Baza mocy kopii: `sn_mva` JEDNOSTKI z tabliczki × liczba jednostek; `None` = brak.

    Ta sama konwencja co moc znamionowa źródła w zwarciach (`enm.mapping.
    _gen_rated_apparent_mva`: `sn_mva` na jednostkę, całość = × liczba jednostek), ale BEZ
    tamtejszej rezerwy |P|/cosφ — baza mocy modelu dynamicznego przyjęta z mocy czynnej
    byłaby liczbą, której tabliczka nie deklaruje.
    """
    tabliczka = generator.get("materialized_params") or {}
    sn = tabliczka.get("sn_mva") if isinstance(tabliczka, Mapping) else None
    if isinstance(sn, bool) or not isinstance(sn, int | float) or sn <= 0:
        return None
    return float(sn) * liczba_jednostek_zrodla(generator)


def materializuj_dynamike(profile_id: str, generator: Mapping[str, Any]) -> dict[str, Any]:
    """Kopia `Generator.dynamika` (JSON) z profilu `profile_id` i tabliczki wytwórcy.

    Odmowy (`BladMaterializacjiDynamiki`): profil nieznany, niezgodny z rodzajem, rodzaj bez
    profili, brak `sn_mva` w tabliczce, magazyn bez danych zasobnika. Wynik jest deterministyczny
    — ta sama para (profil, tabliczka) daje ten sam słownik.
    """
    nazwa = nazwa_elementu(generator, "generators")
    gen_type = generator.get("gen_type")
    sprawdz_zgodnosc(profile_id, gen_type if isinstance(gen_type, str) else None, nazwa)
    baza = moc_bazowa_mva(generator)
    if baza is None:
        raise BladMaterializacjiDynamiki(
            KOD_TABLICZKA_BRAK,
            f"Tabliczka wytwórcy „{nazwa}” nie niesie pola „{nazwa_pola('sn_mva')}” jednostki "
            "— baza mocy modelu dynamicznego jest cechą urządzenia z karty katalogowej. "
            "Przypisz typ katalogowy z mocą znamionową.",
        )
    if gen_type == "bess":
        raise BladMaterializacjiDynamiki(
            KOD_MAGAZYN_DANE,
            f"Magazyn „{nazwa}”: profil {_nazwa_profilu(profile_id)} opisuje przekształtnik "
            "(PCS), a model dynamiczny magazynu wymaga też danych zasobnika, których nie ma "
            f"katalog: {lista_pl(_POLA_ZASOBNIKA_SPOZA_KATALOGU.values(), 'i')}. Przekształtnik "
            "bez zasobnika byłby innym urządzeniem niż zaprojektowane.",
        )
    parametry = get_profile(profile_id).to_parametry_dynamiczne(s_n_mva=baza)
    return parametry.model_dump(mode="json")


def wiazanie_dynamiki(generator: Mapping[str, Any]) -> str | None:
    """Profil wskazany wiązaniem wytwórcy albo `None`."""
    tabliczka = generator.get("materialized_params") or {}
    if not isinstance(tabliczka, Mapping):
        return None
    wartosc = tabliczka.get(KLUCZ_WIAZANIA_DYNAMIKI)
    return str(wartosc) if isinstance(wartosc, str) and wartosc.strip() else None


def synchronizuj_dynamike_z_wiazan(enm: dict[str, Any]) -> dict[str, Any]:
    """Kopie `Generator.dynamika` = materializacja wiązania — dla KAŻDEGO wytwórcy z wiązaniem.

    Zwraca ten sam słownik, gdy nic się nie zmienia (determinizm migawek bez wiązań i z
    kopiami aktualnymi); inaczej płytką kopię modelu z nową listą wytwórców. Wiązania,
    którego nie da się zmaterializować, nie zostawia z kopią — pole `dynamika` znika.
    """
    generatory = enm.get("generators")
    if not isinstance(generatory, list):
        return enm
    nowe: list[Any] = []
    zmiana = False
    for generator in generatory:
        if not isinstance(generator, dict):
            nowe.append(generator)
            continue
        profil = wiazanie_dynamiki(generator)
        if profil is None:
            nowe.append(generator)
            continue
        try:
            kopia: dict[str, Any] | None = materializuj_dynamike(profil, generator)
        except BladMaterializacjiDynamiki:
            kopia = None
        obecna = generator.get("dynamika")
        if (kopia is None and obecna is None) or (
            kopia is not None and _postac_kanoniczna(obecna) == kopia
        ):
            nowe.append(generator)
            continue
        zmiana = True
        zaktualizowany = dict(generator)
        if kopia is None:
            zaktualizowany.pop("dynamika", None)
        else:
            zaktualizowany["dynamika"] = copy.deepcopy(kopia)
        nowe.append(zaktualizowany)
    if not zmiana:
        return enm
    return {**enm, "generators": nowe}


@dataclass(frozen=True)
class StanDynamikiGeneratora:
    """Stan modelu dynamicznego jednego wytwórcy (odczyt dla interfejsu i gotowości)."""

    ref_id: str
    nazwa: str
    gen_type: str | None
    wiazanie: str | None
    #: `z_katalogu` — kopia zgodna z wiązaniem; `wlasny` — blok bez wiązania (dane spoza
    #: katalogu); `brak` — ani bloku, ani wiązania; `odmowa` — wiązanie, którego nie da się
    #: zmaterializować; `nieaktualna` — kopia różna od materializacji wiązania.
    stan: str
    rodzina: str | None
    zrodlo_proweniencji: str | None
    odniesienie_proweniencji: str | None
    odmowa_kod: str | None
    odmowa_komunikat: str | None
    profile_zgodne: tuple[str, ...]
    #: Profil wskazany przez TYP katalogowy wytwórcy (podpowiedź wyboru), gdy zgodny z rodzajem.
    profil_typu: str | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "ref_id": self.ref_id,
            "nazwa": self.nazwa,
            "gen_type": self.gen_type,
            "wiazanie": self.wiazanie,
            "stan": self.stan,
            "rodzina": self.rodzina,
            "zrodlo_proweniencji": self.zrodlo_proweniencji,
            "odniesienie_proweniencji": self.odniesienie_proweniencji,
            "odmowa_kod": self.odmowa_kod,
            "odmowa_komunikat": self.odmowa_komunikat,
            "profil_typu": self.profil_typu,
            "profile_zgodne": [
                {
                    "profile_id": pid,
                    "nazwa": get_profile(pid).profile_name_pl,
                    "rodzina_docelowa": rodzina_docelowa(pid),
                    "model_w_rdzeniu": model_w_rdzeniu(pid),
                }
                for pid in self.profile_zgodne
            ],
        }


def stan_dynamiki_generatorow(enm: Mapping[str, Any]) -> tuple[StanDynamikiGeneratora, ...]:
    """Stan każdego wytwórcy modelu (kolejność: `ref_id`) — z powodem, gdy kopii brak."""
    wynik: list[StanDynamikiGeneratora] = []
    generatory = [g for g in enm.get("generators") or [] if isinstance(g, Mapping)]
    for generator in sorted(generatory, key=lambda g: str(g.get("ref_id") or "")):
        ref = str(generator.get("ref_id") or generator.get("id") or "?")
        gen_type_surowy = generator.get("gen_type")
        gen_type = gen_type_surowy if isinstance(gen_type_surowy, str) else None
        profil = wiazanie_dynamiki(generator)
        blok = generator.get("dynamika")
        blok = blok if isinstance(blok, Mapping) else None
        odmowa: BladMaterializacjiDynamiki | None = None
        if profil is None:
            stan = "wlasny" if blok is not None else "brak"
        else:
            try:
                kopia = materializuj_dynamike(profil, generator)
            except BladMaterializacjiDynamiki as blad:
                odmowa = blad
                stan = "odmowa"
            else:
                stan = "z_katalogu" if _postac_kanoniczna(blok) == kopia else "nieaktualna"
        proweniencja = blok.get("proweniencja") if blok is not None else None
        proweniencja = proweniencja if isinstance(proweniencja, Mapping) else {}
        wynik.append(
            StanDynamikiGeneratora(
                ref_id=ref,
                nazwa=nazwa_elementu(generator, "generators"),
                gen_type=gen_type,
                wiazanie=profil,
                stan=stan,
                rodzina=str(blok["rodzina"]) if blok is not None and "rodzina" in blok else None,
                zrodlo_proweniencji=(
                    str(proweniencja["zrodlo"]) if "zrodlo" in proweniencja else None
                ),
                odniesienie_proweniencji=(
                    str(proweniencja["odniesienie"]) if "odniesienie" in proweniencja else None
                ),
                odmowa_kod=odmowa.kod if odmowa is not None else None,
                odmowa_komunikat=odmowa.komunikat if odmowa is not None else None,
                profile_zgodne=profile_zgodne(gen_type),
                profil_typu=_profil_typu(generator, gen_type),
            )
        )
    return tuple(wynik)


def _profil_typu(generator: Mapping[str, Any], gen_type: str | None) -> str | None:
    tabliczka = generator.get("materialized_params") or {}
    wartosc = tabliczka.get("dynamic_profile_id") if isinstance(tabliczka, Mapping) else None
    if isinstance(wartosc, str) and wartosc in profile_zgodne(gen_type):
        return wartosc
    return None


def braki_kopii_dynamiki(enm: Mapping[str, Any]) -> tuple[str, ...]:
    """`ref_id` wytwórców, których kopia z katalogu w migawce jest NIEAKTUALNA (posortowane).

    JEDEN predykat dla bramki gotowości `dynamika_rms` i dla wykonawcy biegu. Wytwórca z
    wiązaniem, którego nie da się zmaterializować i który NIE ma bloku, nie jest tu liczony
    — to brak bloku, który odmawia adapter biegu (`dynamika.zrodlo_bez_bloku_dynamiki`),
    a powód podaje `stan_dynamiki_generatorow`.
    """
    return tuple(
        stan.ref_id
        for stan in stan_dynamiki_generatorow(enm)
        if stan.stan == "nieaktualna" or (stan.stan == "odmowa" and _ma_blok(enm, stan.ref_id))
    )


def _ma_blok(enm: Mapping[str, Any], ref_id: str) -> bool:
    for generator in enm.get("generators") or []:
        if isinstance(generator, Mapping) and generator.get("ref_id") == ref_id:
            return generator.get("dynamika") is not None
    return False


def odmow_gdy_kopia_nieaktualna(enm: Mapping[str, Any]) -> None:
    """Odmowa biegu, gdy migawka niesie kopię z katalogu inną niż materializacja wiązania."""
    nieaktualne = braki_kopii_dynamiki(enm)
    if nieaktualne:
        nazwy = {stan.ref_id: stan.nazwa for stan in stan_dynamiki_generatorow(enm)}
        raise OdmowaKopiiDynamiki(
            "Blok parametrów dynamicznych wytwórcy nie odpowiada jego wiązaniu z katalogiem "
            "(zmieniła się tabliczka albo profil po zapisaniu kopii) — bieg liczyłby model "
            "inny niż wskazany. Odśwież wiązanie modelu dynamicznego: "
            f"{lista_pl((f'„{nazwy[ref]}”' for ref in nieaktualne), 'i')}.",
            elementy=nieaktualne,
        )


__all__ = [
    "KLUCZ_WIAZANIA_DYNAMIKI",
    "KOD_KOPIA_NIEAKTUALNA",
    "KOD_MAGAZYN_DANE",
    "KOD_PROFIL_NIEZGODNY",
    "KOD_PROFIL_NIEZNANY",
    "KOD_RODZINA_BEZ_PROFILI",
    "KOD_TABLICZKA_BRAK",
    "BladMaterializacjiDynamiki",
    "OdmowaKopiiDynamiki",
    "StanDynamikiGeneratora",
    "braki_kopii_dynamiki",
    "materializuj_dynamike",
    "model_w_rdzeniu",
    "moc_bazowa_mva",
    "odmow_gdy_kopia_nieaktualna",
    "profile_zgodne",
    "rodzina_docelowa",
    "sprawdz_zgodnosc",
    "stan_dynamiki_generatorow",
    "synchronizuj_dynamike_z_wiazan",
    "wiazanie_dynamiki",
]
