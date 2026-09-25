"""Końcówki kart widmowych i sekcji modelu urządzenia (karta AB-H0 §0.7, §0.9, §0.3.7).

Warstwa API wyłącznie ODCZYTUJE — status sekcji wyprowadza JEDNA funkcja
(`dziedziny.sekcje.status_sekcji`) przez dwa adaptery: typu katalogowego
(`network_model.catalog.sekcje_modelu`) i elementu ENM
(`application.model_urzadzenia.sekcje_elementu`). Karta widmowa PROJEKTU powstaje
operacją domenową `dodaj_karte_widmowa_projektu`, a wiązanie z generatorem — kluczem
`karty_widmowe_ref` operacji `set_der_catalog_bindings` (`POST …/enm/domain-ops`).

Trasy:
* `GET /api/catalog/karty-widmowe` — karty katalogu statycznego (opcjonalny filtr typu);
* `GET /api/catalog/karty-widmowe/rejestr` — pokrycie typów przekształtników kartami
  (to samo źródło co tabela SPEC_KATALOGI);
* `GET /api/catalog/karty-widmowe/{karta_id}` — jedna karta katalogu statycznego;
* `GET /api/catalog/sekcje-modelu/{przestrzen}/{typ_id}` — osiem sekcji typu;
* `GET /api/cases/{case_id}/enm/elementy/{ref}/sekcje-modelu` — osiem sekcji elementu
  modelu (katalog MODELU: statyczny + pozycje projektu).
"""

from __future__ import annotations

from api.klucz_twin_dep import KluczTwin
from application.model_urzadzenia.sekcje_elementu import (
    OdmowaSekcjiElementu,
    dane_elementu,
    znajdz_urzadzenie,
)
from dziedziny.karta_widmowa import KartaWidmowa, ModeleWidmoweElementu, OdniesienieKarty
from dziedziny.sekcje import OcenaSekcji, StatusWeryfikacjiRekordu
from enm.store import get_enm
from fastapi import APIRouter, HTTPException
from network_model.catalog.repository import get_default_mv_catalog
from network_model.catalog.sekcje_modelu import (
    PRZESTRZENIE_BEZ_SEKCJI,
    PRZESTRZENIE_Z_SEKCJAMI,
    RejestrKartWidmowych,
    dane_typu,
    oceny_sekcji,
    rejestr_kart_widmowych,
    typ_katalogowy,
)
from pydantic import BaseModel, ConfigDict

router = APIRouter(tags=["karty-widmowe"])


class SekcjeModeluOdpowiedz(BaseModel):
    """Osiem sekcji modelu urządzenia (typu albo elementu) z kontekstem danych."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    #: Przestrzeń katalogu i typ, z którego dane pochodzą (`None` — element bez typu).
    przestrzen: str | None
    typ_id: str | None
    #: `ref_id` elementu ENM (`None` — odpowiedź dla typu katalogowego).
    element_ref: str | None
    #: Klasa definicji składników sekcji (klasa typu albo `Generator` dla elementu).
    klasa: str
    status_weryfikacji_rekordu: StatusWeryfikacjiRekordu
    sekcje: tuple[OcenaSekcji, ...]
    #: Proweniencja modeli widmowych elementu (karty zmaterializowane w elemencie).
    zrodla_modeli_widmowych: tuple[OdniesienieKarty, ...] = ()


def _blad(status: int, kod: str, komunikat: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": kod, "message_pl": komunikat})


@router.get("/api/catalog/karty-widmowe", response_model=list[KartaWidmowa])
def lista_kart_widmowych(urzadzenie_ref: str | None = None) -> list[KartaWidmowa]:
    """Karty widmowe katalogu statycznego (posortowane po typie i id)."""
    return get_default_mv_catalog().list_karty_widmowe(urzadzenie_ref=urzadzenie_ref)


@router.get("/api/catalog/karty-widmowe/rejestr", response_model=RejestrKartWidmowych)
def rejestr_kart() -> RejestrKartWidmowych:
    """Pokrycie typów przekształtników kartami widmowymi ze statusem sekcji częstotliwości."""
    return rejestr_kart_widmowych(get_default_mv_catalog())


@router.get("/api/catalog/karty-widmowe/{karta_id}", response_model=KartaWidmowa)
def karta_widmowa(karta_id: str) -> KartaWidmowa:
    karta = get_default_mv_catalog().get_karta_widmowa(karta_id)
    if karta is None:
        raise _blad(
            404,
            "karta_widmowa.nieznana",
            f"Karta widmowa '{karta_id}' nie istnieje w katalogu statycznym.",
        )
    return karta


@router.get(
    "/api/catalog/sekcje-modelu/{przestrzen}/{typ_id}", response_model=SekcjeModeluOdpowiedz
)
def sekcje_modelu_typu(przestrzen: str, typ_id: str) -> SekcjeModeluOdpowiedz:
    """Osiem sekcji modelu typu katalogowego (status wyprowadzany przy każdym zapytaniu)."""
    if przestrzen not in PRZESTRZENIE_Z_SEKCJAMI:
        powod = PRZESTRZENIE_BEZ_SEKCJI.get(przestrzen)
        if powod is None:
            raise _blad(
                404, "sekcje.przestrzen_nieznana", f"Przestrzeń '{przestrzen}' nie istnieje."
            )
        raise _blad(
            422,
            "sekcje.brak_widoku",
            f"Przestrzeń '{przestrzen}' nie ma widoku sekcji modelu: {powod}.",
        )
    repozytorium = get_default_mv_catalog()
    if typ_katalogowy(repozytorium, przestrzen, typ_id) is None:
        raise _blad(
            404,
            "sekcje.typ_nieznany",
            f"Typ '{typ_id}' nie istnieje w przestrzeni {przestrzen}.",
        )
    dane = dane_typu(repozytorium, przestrzen, typ_id)
    return SekcjeModeluOdpowiedz(
        przestrzen=przestrzen,
        typ_id=typ_id,
        element_ref=None,
        klasa=dane.klasa,
        status_weryfikacji_rekordu=dane.status_weryfikacji_rekordu,
        sekcje=oceny_sekcji(dane),
    )


#: Kod odmowy odczytu sekcji elementu → status HTTP (brak zasobu vs stan modelu).
_STATUS_ODMOWY: dict[str, int] = {
    "sekcje.element_nieznany": 404,
    "sekcje.brak_widoku": 422,
    "sekcje.typ_niedostepny": 422,
    "sekcje.karta_widmowa_niedostepna": 422,
}


@router.get(
    "/api/cases/{case_id}/enm/elementy/{ref:path}/sekcje-modelu",
    response_model=SekcjeModeluOdpowiedz,
)
def sekcje_modelu_elementu(case_id: str, ref: str, klucz: KluczTwin) -> SekcjeModeluOdpowiedz:
    """Osiem sekcji modelu urządzenia elementu ENM (katalog MODELU, karty z proweniencją)."""
    migawka = get_enm(klucz).model_dump(mode="json")
    try:
        dane = dane_elementu(migawka, ref)
    except OdmowaSekcjiElementu as odmowa:
        raise _blad(_STATUS_ODMOWY[odmowa.kod], odmowa.kod, str(odmowa)) from odmowa
    _, element = znajdz_urzadzenie(migawka, ref)
    surowe_modele = element.get("modele_widmowe")
    zrodla = (
        ModeleWidmoweElementu.model_validate(surowe_modele).zrodla
        if isinstance(surowe_modele, dict)
        else ()
    )
    return SekcjeModeluOdpowiedz(
        przestrzen=element.get("catalog_namespace"),
        typ_id=element.get("catalog_ref"),
        element_ref=ref,
        klasa=dane.klasa,
        status_weryfikacji_rekordu=dane.status_weryfikacji_rekordu,
        sekcje=oceny_sekcji(dane),
        zrodla_modeli_widmowych=zrodla,
    )
