"""Operator sieci i efektywny profil NC RfG źródła — JEDNO miejsce rozstrzygania.

DECYZJA ARCHITEKTA (dodatek karty GPZ-DANE-ANALIZ). Operator sieci (OSD/OSP) jest JEDNĄ daną
modelu na poziomie sieci, nie atrybutem każdego źródła. Nośnik: ``header.connection_conditions.
operator_sieci`` (``ConnectionConditions`` — warunki przyłączenia z dokumentu OSD; operator jest
wystawcą tych warunków). ADR-027 wiąże profil zgodności (``compliance_profile``) z umownym
punktem przyłączenia, którego nośnikiem w v1 (jeden punkt na projekt, ``header.
connection_conditions`` pojedyncze) jest właśnie ``ConnectionConditions`` — nie węzeł, nie
gałąź, nie parametr solvera, więc zakaz Core Rule 5 nie jest naruszony.

DZIEDZICZENIE. Profil NC RfG źródła = operator sieci, gdy źródło nie wskazuje własnego profilu
(``materialized_params.profiles.nc_rfg_profile_ref``). Wskazanie własnego profilu RÓŻNEGO od
operatora sieci jest NADPISANIEM — dopuszczalnym wyłącznie z powodem
(``profiles.nc_rfg_profile_powod``, np. przyłączenie do sieci innego operatora — PSE przy
110 kV). Brak powodu przy rozbieżności = ostrzeżenie walidatora z wyjaśnieniem (dana sieci
zmieniona po wyborze profilu źródła) albo odmowa zapisu (pisarz wiązań). Jeden predykat
``wymaga_powodu_nadpisania`` rozstrzyga obie strony.

KONSUMENCI (każdy czyta TĘ funkcję, nie surowe pole): walidator (dopuszczalność trybu regulacji
napięcia, ostrzeżenie rozbieżności), gotowość DER (oś NC RfG), most zgodności NC RfG
(``application.ncrfg_compliance.model_bridge`` — operator modułu, Bank Nastaw i rejestr WiPWC
z profilu modułu), raport zgodności referencyjnej (pakiet OSD operatora sieci). Frontend ma JEDNO lustro tej
reguły (`station-der/profilNcRfg.ts`) przypięte parytetem do tej funkcji (fikstura
`ncrfg_profil_efektywny_parytet` generowana z `efektywny_profil_ncrfg` na iloczynie cech).
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Any, Literal, TypeVar

from catalog.profiles.nc_rfg import list_available_operators, load_nc_rfg_profile
from enm.models import GEN_TYPES_PRZEKSZTALTNIKOWE

KLUCZ_PROFILU_ZRODLA = "nc_rfg_profile_ref"
KLUCZ_POWODU_NADPISANIA = "nc_rfg_profile_powod"
POLE_OPERATORA_SIECI = "operator_sieci"

#: Treść braku danej MODELU w raporcie przypadku (pakiet OSD nie jest wybierany domysłem).
BRAK_OPERATORA_SIECI_PL = (
    "Model nie wskazuje operatora sieci — standard operatora (pakiet OSD) nie jest oceniany. "
    "Wskaż operatora sieci w warunkach przyłączenia projektu."
)

ZrodloProfilu = Literal["PROFIL_ZRODLA", "OPERATOR_SIECI", "BRAK"]


def _pole(obiekt: object, klucz: str) -> object:
    if isinstance(obiekt, Mapping):
        return obiekt.get(klucz)
    return getattr(obiekt, klucz, None)


def _tekst(wartosc: object) -> str | None:
    if not isinstance(wartosc, str):
        return None
    return wartosc.strip() or None


def operatorzy_katalogu() -> tuple[str, ...]:
    """Identyfikatory operatorów z katalogu profili NC RfG (warstwa OSD), deterministycznie."""
    return tuple(list_available_operators())


OPERATOR_SPOZA_KATALOGU_PL = "spoza katalogu profili NC RfG"


def nazwa_operatora_pl(operator_id: str) -> str:
    """Nazwa operatora dla projektanta (``operator_name_pl`` warstwy OSD katalogu profili) —
    JEDYNA funkcja nazwy operatora (walidator, operacje modelu, rejestr pakietów referencyjnych).

    Wartość spoza katalogu (model z importu z pominięciem pisarza) nie ma nazwy: zwrot mówi to
    słowami — identyfikator nie udaje nazwy operatora (`nazwa_bez_identyfikatora_guard`)."""
    if operator_id in operatorzy_katalogu():
        return load_nc_rfg_profile(operator_id).operator_name_pl
    return OPERATOR_SPOZA_KATALOGU_PL


def nazwy_operatorow_katalogu_pl() -> str:
    """Lista operatorów katalogu słowami (do treści odmowy i podpowiedzi naprawy)."""
    return ", ".join(nazwa_operatora_pl(o) for o in operatorzy_katalogu())


def operator_sieci_modelu(enm: object) -> str | None:
    """Operator sieci modelu (obiekt ``EnergyNetworkModel`` albo słownik migawki)."""
    warunki = _pole(_pole(enm, "header"), "connection_conditions")
    return _tekst(_pole(warunki, POLE_OPERATORA_SIECI)) if warunki is not None else None


def profil_wlasny_zrodla(generator: object) -> tuple[str | None, str | None]:
    """(profil wskazany przez źródło, powód nadpisania) — jedyny odczyt magazynu profilu,
    do którego pisze ``set_der_catalog_bindings`` (``materialized_params.profiles``)."""
    materialized = _pole(generator, "materialized_params")
    profile = materialized.get("profiles") if isinstance(materialized, Mapping) else None
    if not isinstance(profile, Mapping):
        return None, None
    return _tekst(profile.get(KLUCZ_PROFILU_ZRODLA)), _tekst(profile.get(KLUCZ_POWODU_NADPISANIA))


def wymaga_powodu_nadpisania(profil_zrodla: str | None, operator_sieci: str | None) -> bool:
    """Czy profil źródła jest NADPISANIEM operatora sieci (wymaga powodu)? Jeden predykat dla
    pisarza wiązań (odmowa zapisu) i walidatora (ostrzeżenie rozbieżności)."""
    return (
        profil_zrodla is not None and operator_sieci is not None and profil_zrodla != operator_sieci
    )


@dataclass(frozen=True)
class EfektywnyProfilNcRfg:
    """Efektywny profil NC RfG źródła z pochodzeniem."""

    operator_id: str | None
    zrodlo: ZrodloProfilu
    operator_sieci: str | None
    profil_zrodla: str | None
    powod_nadpisania_pl: str | None

    @property
    def nadpisanie(self) -> bool:
        return wymaga_powodu_nadpisania(self.profil_zrodla, self.operator_sieci)

    @property
    def nadpisanie_bez_powodu(self) -> bool:
        return self.nadpisanie and self.powod_nadpisania_pl is None

    def to_dict(self) -> dict[str, Any]:
        return {
            "operator_id": self.operator_id,
            "zrodlo": self.zrodlo,
            "operator_sieci": self.operator_sieci,
            "profil_zrodla": self.profil_zrodla,
            "powod_nadpisania_pl": self.powod_nadpisania_pl,
            "nadpisanie": self.nadpisanie,
            "nadpisanie_bez_powodu": self.nadpisanie_bez_powodu,
        }


def efektywny_profil_ncrfg(generator: object, operator_sieci: str | None) -> EfektywnyProfilNcRfg:
    """Efektywny profil NC RfG źródła: własny profil źródła albo operator sieci."""
    profil, powod = profil_wlasny_zrodla(generator)
    if profil is not None:
        return EfektywnyProfilNcRfg(
            operator_id=profil,
            zrodlo="PROFIL_ZRODLA",
            operator_sieci=operator_sieci,
            profil_zrodla=profil,
            powod_nadpisania_pl=powod if wymaga_powodu_nadpisania(profil, operator_sieci) else None,
        )
    if operator_sieci is not None:
        return EfektywnyProfilNcRfg(
            operator_id=operator_sieci,
            zrodlo="OPERATOR_SIECI",
            operator_sieci=operator_sieci,
            profil_zrodla=None,
            powod_nadpisania_pl=None,
        )
    return EfektywnyProfilNcRfg(
        operator_id=None,
        zrodlo="BRAK",
        operator_sieci=None,
        profil_zrodla=None,
        powod_nadpisania_pl=None,
    )


_G = TypeVar("_G")


def zrodla_ncrfg(generatory: Iterable[_G]) -> list[_G]:
    """Źródła objęte oceną NC RfG (przekształtnikowe — ten sam zbiór co most zgodności)."""
    return [g for g in generatory if _pole(g, "gen_type") in GEN_TYPES_PRZEKSZTALTNIKOWE]


#: Analizy i reguły czytające operatora sieci (profil efektywny źródeł, pakiet OSD raportu).
KONSUMENCI_OPERATORA_SIECI: tuple[str, ...] = (
    "zgodnosc_nc_rfg",
    "gotowosc_der",
    "regulacja_napiecia",
    "zgodnosc_referencyjna",
)


def opis_pola_operatora_sieci() -> dict[str, Any]:
    """Definicja pola „Operator sieci” dla rejestru pól GPZ frontendu (tablica parytetu
    ``rozdzielnica_gpz_parytet_v1.json``, blok ``pole_operatora_sieci``): klucz, nazwa (słowo
    frontu ze słownika komunikatów), pisarz, ścieżka w modelu, słownik zamknięty = operatorzy
    katalogu profili NC RfG i konsumenci."""
    from enm.slownik_komunikatow import NAZWY_POL_KONTRAKTU_PL

    return {
        "klucz": POLE_OPERATORA_SIECI,
        "rodzaj": "slownik",
        "nazwa_pl": NAZWY_POL_KONTRAKTU_PL[POLE_OPERATORA_SIECI],
        "operacja": "set_connection_conditions",
        "sciezka_w_modelu": f"header.connection_conditions.{POLE_OPERATORA_SIECI}",
        "kod_bledu": "connection_conditions.operator_unknown",
        "dozwolone": list(operatorzy_katalogu()),
        "konsumenci": list(KONSUMENCI_OPERATORA_SIECI),
    }
