"""Ostrożny przegląd certyfikatu PTPiREE w realnym przypadku ENM.

Nigdy nie wydaje certyfikatu lub formalnej akceptacji. Używa ISTNIEJĄCEGO
model_bridge.weryfikacja_certyfikatu do doboru rekordu ze snapshotu i tylko
dodaje sprawdzenia dat, firmware, wydań WOS i aktualności rejestru.
Nie kopiuje wykazu; nie ufa polom certyfikatu z żądania HTTP.
"""
from __future__ import annotations

import json
import re
from datetime import date
from pathlib import Path
from typing import Any, Literal

from catalog.profiles.nc_rfg import load_nc_rfg_profile
from enm.models import EnergyNetworkModel
from network_model.catalog.mv_ptpiree_catalog import (
    get_all_ptpiree_generator_certificates,
    get_ptpiree_catalog_manifest,
)
from network_model.solvers.ncrfg_ptpiree.contracts import DowodCertyfikatu
from pydantic import BaseModel, ConfigDict

from .model_bridge import weryfikacja_certyfikatu
from .regulatory_effectivity import wybierz_wos

URL_WYKAZ = "https://ptpiree.pl/kodeksy-sieci/wykaz-certyfikatow/"
_WIPWC_12_LAST = date(2026, 12, 31)
_FIRMWARE_TOKEN = re.compile(r"[A-Za-z0-9][A-Za-z0-9._+-]*\Z")
_OBSERVATIONS = (
    Path(__file__).parents[2] / "catalog" / "profiles" / "nc_rfg"
    / "ptpiree_source_observations.json"
)
Ocena = Literal[
    "ODRZUCONO", "NIE_OCENIONO", "WYMAGA_POTWIERDZENIA",
    "PODSTAWA_WSTEPNA",
]


class StanRejestru(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    stan: Literal["AKTUALNY_WOBEC_OBSERWACJI", "STARSZY_NIZ_OBSERWACJA", "NIEUSTALONY"]
    data_sprawdzenia: str
    zrodlo: str
    przestarzale_wersje: tuple[str, ...]
    brakujace_wersje: tuple[str, ...]
    ostrzezenie_pl: str


class OcenaUrzadzenia(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    der_ref: str
    status: Ocena
    kod: str
    powody_pl: tuple[str, ...]
    rekord_wykazu: str | None = None
    wersja_wipwc: str | None = None
    wersja_wos: str | None = None
    data_oceny: date
    zrodlo: str = URL_WYKAZ
    # To jest wyłącznie dokument audytu, nie status Werdyktu SPELNIA
    akceptacja_operatora: bool = False


def ocen_stan_rejestru() -> StanRejestru:
    """Porównanie snapshotu lokalnego z obserwacją strony — nie synchro wykazu."""
    manifest = get_ptpiree_catalog_manifest()
    with _OBSERVATIONS.open(encoding="utf-8") as handle:
        obs = json.load(handle)
    w_repo = {
        x["wipwc_version"]: x["publication_date"] for x in manifest["sources"]
    }
    starsze = tuple(
        x["wipwc_version"]
        for x in obs["sources"]
        if x["wipwc_version"] in w_repo
        and w_repo[x["wipwc_version"]] < x["publication_date"]
    )
    brak = tuple(
        x["wipwc_version"] for x in obs["sources"]
        if x["wipwc_version"] not in w_repo
    )
    if starsze:
        stan = "STARSZY_NIZ_OBSERWACJA"
    elif brak:
        stan = "NIEUSTALONY"
    else:
        stan = "AKTUALNY_WOBEC_OBSERWACJI"
    return StanRejestru(
        stan=stan,
        data_sprawdzenia=str(obs["checked_at"]),
        zrodlo=str(obs["source_page_url"]),
        przestarzale_wersje=starsze,
        brakujace_wersje=brak,
        ostrzezenie_pl=(
            "Porównanie TYLKO do historycznej obserwacji źródła, nie potwierdza "
            "aktualności na dziś. Rekordy certyfikatów wymagają niezależnej "
            "weryfikacji autentyczności i akceptacji operatora."
        ),
    )


def _odmowa(der_ref: str, kiedy: date, kod: str, *powody: str,
            cert: DowodCertyfikatu | None = None) -> OcenaUrzadzenia:
    return OcenaUrzadzenia(
        der_ref=der_ref, data_oceny=kiedy, status="NIE_OCENIONO", kod=kod,
        powody_pl=tuple(powody),
        rekord_wykazu=cert.rekord_id if cert else None,
        wersja_wipwc=cert.wersja_wipwc if cert else None,
        wersja_wos=cert.wersja_wos if cert else None,
    )


def _data(wartosc: object) -> date | None:
    if not isinstance(wartosc, str) or not wartosc:
        return None
    try:
        return date.fromisoformat(wartosc)
    except ValueError:
        return None


def _rekordy_wykazu() -> dict[str, dict[str, Any]]:
    return {
        str(x["id"]): x.get("params") or {}
        for x in get_all_ptpiree_generator_certificates()
    }


def oceny_certyfikatow_przypadku(
    enm: EnergyNetworkModel,
    *,
    operator_id: str,
    data_oceny: date,
) -> dict[str, Any]:
    """Tylko read-only dokumentacyjny przegląd dla generatorów przekształtnikowych.

    Ponowne dopasowanie certyfikatu z istniejącego serwerowego model_bridge,
    lecz bez starego błędu utożsamiania daty umowy z datą akceptacji.
    Akceptacja u OSD NIE jest wykonywana ani potwierdzana.
    """
    from .bieg import wejscia_ncrfg_przypadku

    profile = load_nc_rfg_profile(operator_id)
    wejscia = wejscia_ncrfg_przypadku(
        enm, operator_id=operator_id, case_id="ocena-certyfikatow"
    )
    po_ref = {gen.ref_id: gen for gen in enm.generators}
    rejestr = _rekordy_wykazu()
    stan_rejestru = ocen_stan_rejestru()
    wynik: list[OcenaUrzadzenia] = []
    for mod in wejscia.modules:
        if mod.der_kind == "BESS":
            wynik.append(_odmowa(
                mod.der_ref, data_oceny, "NIE_DOTYCZY_NC_RFG_MAGAZYN",
                "Samodzielny magazyn energii: odrębne wymagania i dowody "
                "krajowe, bez automatycznego stosowania WiPWC dla PGM.",
            ))
            continue
        generator = po_ref[mod.der_ref]
        tabliczka = generator.materialized_params or {}
        dostepny = weryfikacja_certyfikatu(
            mod.der_ref, tabliczka, profile=profile, data_umowy=None
        )
        if not isinstance(dostepny, DowodCertyfikatu):
            powody = (
                "Brak serwerowo potwierdzonego dopasowania modelu i rekordu wykazu; "
                "w razie rozbieżności sprawdzić tabliczkę, numer i wariant urządzenia."
            )
            if dostepny is not None and hasattr(dostepny, "powod_pl"):
                powody = str(dostepny.powod_pl)
            wynik.append(_odmowa(mod.der_ref, data_oceny, "BRAK_DOWODU_Z_REJESTRU", powody))
            continue

        cert = dostepny
        rec = rejestr.get(cert.rekord_id)
        if rec is None:
            wynik.append(_odmowa(
                mod.der_ref, data_oceny, "REKORD_UCIEKL_Z_SNAPSHOTU",
                "Związany rekord nie jest dostępny w odczytanym rejestrze.", cert=cert
            ))
            continue
        # Brak fałszywej zgodności przy zakończeniu okresu WiPWC 1.2.
        if cert.wersja_wipwc == "1.2" and data_oceny > _WIPWC_12_LAST:
            wynik.append(OcenaUrzadzenia(
                der_ref=mod.der_ref, data_oceny=data_oceny,
                status="ODRZUCONO", kod="WIPWC_12_PO_TERMINIE",
                powody_pl=("WiPWC 1.2 — koniec akceptacji 31.12.2026.",),
                rekord_wykazu=cert.rekord_id, wersja_wipwc=cert.wersja_wipwc,
                wersja_wos=cert.wersja_wos,
            ))
            continue
        akceptacja = _data(rec.get("document_acceptance_date"))
        if akceptacja is None:
            wynik.append(_odmowa(
                mod.der_ref, data_oceny, "BRAK_DATY_AKCEPTACJI_REKORDU",
                "Nie ma wiarygodnej daty akceptacji konkretnego dokumentu w wykazie.",
                cert=cert,
            ))
            continue
        if data_oceny > akceptacja:
            wynik.append(OcenaUrzadzenia(
                der_ref=mod.der_ref, data_oceny=data_oceny,
                status="ODRZUCONO", kod="DATA_AKCEPTACJI_MINELA",
                powody_pl=("Data akceptacji konkretnego rekordu w wykazie minęła.",),
                rekord_wykazu=cert.rekord_id, wersja_wipwc=cert.wersja_wipwc,
                wersja_wos=cert.wersja_wos,
            ))
            continue
        if stan_rejestru.stan != "AKTUALNY_WOBEC_OBSERWACJI":
            wynik.append(_odmowa(
                mod.der_ref, data_oceny, "SNAPSHOT_NIEAKTUALNY",
                "Lokalny wykaz PTPiREE jest starszy od ostatniej potwierdzonej publikacji.",
                cert=cert,
            ))
            continue
        # Typ PGM oraz WOS wybiera istniejąca funkcja z profilu, nie nowa klasyfikacja.
        from catalog.profiles.nc_rfg import klasyfikacja_modulu
        typ_pgm = klasyfikacja_modulu(mod.p_max_kw, mod.voltage_kv).modul
        if not cert.pokrywa(typ_pgm):
            wynik.append(_odmowa(
                mod.der_ref, data_oceny, "ZAKRES_TYPU_MWE",
                "Certyfikat nie wykazuje zdolności dla typu ocenianego modułu.",
                cert=cert,
            ))
            continue
        wybrany_wos = wybierz_wos(
            typ_pgm, generator.wydarzenia_regulacyjne, generator.modul_istniejacy
        ) if typ_pgm is not None else None
        if wybrany_wos is None or wybrany_wos.status != "USTALONO":
            wynik.append(_odmowa(
                mod.der_ref, data_oceny, "NIEUSTALONA_PODSTAWA_WOS",
                "Brak źródłowo ustalonego zastosowanego WOS dla tego modułu.",
                cert=cert,
            ))
            continue
        if str(cert.wersja_wos or "").strip() not in {
            wybrany_wos.wydanie, f"WOS {wybrany_wos.wydanie}"
        }:
            wynik.append(_odmowa(
                mod.der_ref, data_oceny, "ROZBIEZNOSC_WOS",
                "WOS certyfikatu nie odpowiada wybranej podstawie projektu; "
                "nie badano jeszcze wyjątków i zasad przejściowych.",
                cert=cert,
            ))
            continue
        fw_ref = str(rec.get("firmware_version") or "").strip()
        dowod = generator.dowod_konfiguracji_urzadzenia
        fw_instalacji = (dowod.wersja_oprogramowania or "").strip() if dowod else ""
        if fw_ref:
            if not fw_instalacji:
                wynik.append(_odmowa(
                    mod.der_ref, data_oceny, "BRAK_FIRMWARE_AS_BUILT",
                    "Wykaz wskazuje firmware, lecz w modelu brak dowodu firmware instalacji.",
                    cert=cert,
                ))
                continue
            if not _FIRMWARE_TOKEN.fullmatch(fw_ref):
                wynik.append(_odmowa(
                    mod.der_ref, data_oceny, "ZLOZONY_ZAKRES_FIRMWARE",
                    "Wykaz ma złożony zakres firmware, wymaga manualnej interpretacji.",
                    cert=cert,
                ))
                continue
            if fw_ref != fw_instalacji:
                wynik.append(OcenaUrzadzenia(
                    der_ref=mod.der_ref, data_oceny=data_oceny,
                    status="ODRZUCONO", kod="FIRMWARE_NIEZGODNE",
                    powody_pl=("Wersja firmware instalacji nie jest wersją wpisaną w wykazie.",),
                    rekord_wykazu=cert.rekord_id, wersja_wipwc=cert.wersja_wipwc,
                    wersja_wos=cert.wersja_wos,
                ))
                continue
        # Snapshot i typ nie wystarczają do weryfikacji autentyczności podpisu,
        # akredytacji jednostki, aktualnego zawieszenia oraz próby na PCC.
        wynik.append(OcenaUrzadzenia(
            der_ref=mod.der_ref, data_oceny=data_oceny,
            status="PODSTAWA_WSTEPNA", kod="KONTROLA_DALSZEJ_AUTENTYCZNOSCI",
            powody_pl=(
                "Zgodność danych rejestrowych nie dowodzi autentyczności certyfikatu, "
                "akredytacji wydawcy, konfiguracji PPC ani akceptacji OSD.",
            ),
            rekord_wykazu=cert.rekord_id, wersja_wipwc=cert.wersja_wipwc,
            wersja_wos=cert.wersja_wos,
        ))
    return {
        "data_oceny": data_oceny.isoformat(),
        "operator_id": operator_id,
        "rejestr": stan_rejestru.model_dump(mode="json"),
        "urzadzenia": [x.model_dump(mode="json") for x in wynik],
        "pominiete": [p.model_dump(mode="json") for p in wejscia.pominiete],
        "status_formalny": "NIE_WYDANO_CERTYFIKATU_ANI_ZGODY_OPERATORA",
    }
