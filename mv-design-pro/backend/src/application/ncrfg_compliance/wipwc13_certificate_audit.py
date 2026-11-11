"""WiPWC 1.3 załącznik nr 1 (lit. a–v) oraz §9 i §10 — audyt CERTYFIKATU.

Są to kryteria kompletności dokumentu i okresu ważności, nie automatyczna
autoryzacja podpisu, akredytacji jednostki, wpisu PTPiREE ani zgoda OSD.
Przechowuje tylko wskazania, daty i SHA-256 artefaktu; bez pełnego PDF.
"""
from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator
from enm.deklaracje_modulu import DataUmowy

WIPWC_URL = "https://ptpiree.pl/wp-content/uploads/2024/12/wipwc_2024_10_01-1.pdf"
Typ = Literal["A","B","C","D"]
WiPwc = Literal["1.2","1.3"]


class MetadaneCertyfikatu(BaseModel):
    """Dane odczytane z ORYGINALNEGO certyfikatu, nie z wykazu produktów."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    tytul: str | None = None                           # lit. a
    jednostka_certyfikujaca: str | None = None          # b
    adres_jednostki_certyfikujacej: str | None = None
    miejsce_badania: str | None = None                  # c
    numer_certyfikatu: str | None = None                # d
    identyfikacja_stron: bool | None = None
    wnioskodawca: str | None = None                     # e
    producent: str | None = None                       # f
    adres_producenta: str | None = None
    zaklad_produkcyjny: str | None = None               # g
    produkt: str | None = None                         # h
    model: str | None = None                           # i
    firmware: str | None = None
    podstawa_nc_rfg: str | None = None                  # j
    podstawa_wos: str | None = None
    bank_nastaw_pl: str | None = None                   # k
    deklaracja_zgodnosci_wipwc13: bool | None = None    # l
    program_cert_17067: str | None = None               # m
    alternatywna_podstawa_programu: str | None = None   # m: wyjątek
    metodyka_oceny: str | None = None                   # n
    dokumenty_badan: tuple[str,...] = ()                # o
    logo_jednostki: bool | None = None                  # p
    numer_akredytacji: str | None = None                # q
    symbol_akredytacji: bool | None = None
    miejsce_wydania: str | None = None                  # r
    data_wydania: DataUmowy | None = None
    data_waznosci_do: DataUmowy | None = None           # s
    osoba_podpisujaca: str | None = None                # t
    podpis_w_dokumencie: bool | None = None
    zakres_techniczny_tabela: tuple[str,...] = ()      # u
    zakres_typow: tuple[Typ,...] = ()                   # u, także pierwsza strona
    informacje_dodatkowe: str | None = None             # v, opcjonalne
    sha256_pdf: str | None = Field(default=None,pattern=r"^[0-9a-fA-F]{64}$")
    referencja_vault: str | None = None
    zrodlo_opisu: str | None = None

    @model_validator(mode="after")
    def _source(self) -> "MetadaneCertyfikatu":
        if any(x is not None for x in (
            self.numer_certyfikatu,self.sha256_pdf,self.data_wydania
        )) and not (self.zrodlo_opisu and self.zrodlo_opisu.strip()):
            raise ValueError(
                "Metadane certyfikatu wymagają identyfikatora źródła dokumentu."
            )
        return self


class OcenaZalacznikaWipwc(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    litera: str
    przedmiot: str
    obecne_w_opisie: bool
    powod_pl: str
    pdf_strona: Literal[24,25]


def _max_five_years(date_from: date) -> date:
    try:
        return date_from.replace(year=date_from.year+5)
    except ValueError:
        # 29.02: kalendarzowa data maksymalna przy braku 29.02 w roku docelowym.
        return date_from.replace(year=date_from.year+5,day=28)


def audyt_certyfikatu(
    fakt: MetadaneCertyfikatu,
    *,
    typ: Typ,
    wersja: WiPwc,
    data_oceny: date,
) -> dict:
    """Rozdziel obecność pola od autentyczności i dopuszczalności jego treści."""
    checks: list[OcenaZalacznikaWipwc]=[]
    def check(letter:str,subject:str,ok:bool,page:int,why:str="") -> None:
        checks.append(OcenaZalacznikaWipwc(
            litera=letter,przedmiot=subject,obecne_w_opisie=ok,
            powod_pl=why if why else (
                "Metadane zadeklarowano; należy skonfrontować z oryginałem."
                if ok else "Brak wymaganych danych w opisie dokumentu."
            ),pdf_strona=page
        ))
    text=lambda x: isinstance(x,str) and bool(x.strip())
    check("a","tytuł certyfikatu",text(fakt.tytul),24)
    check("b","jednostka i jej adres",
          text(fakt.jednostka_certyfikujaca) and text(fakt.adres_jednostki_certyfikujacej),24)
    check("c","miejsce oceny",text(fakt.miejsce_badania),24)
    check("d","numer, identyfikacja stron",
          text(fakt.numer_certyfikatu) and fakt.identyfikacja_stron is True,24)
    check("e","wnioskodawca",text(fakt.wnioskodawca),24)
    check("f","producent i adres",text(fakt.producent) and text(fakt.adres_producenta),24)
    check("g","zakład produkcyjny",text(fakt.zaklad_produkcyjny),24)
    check("h","wyrób",text(fakt.produkt),24)
    check("i","model i firmware",text(fakt.model) and text(fakt.firmware),24)
    check("j","podstawa NC RfG i WOS",
          text(fakt.podstawa_nc_rfg) and text(fakt.podstawa_wos),24)
    check("k","Bank Nastaw dla A/B",
          typ not in ("A","B") or text(fakt.bank_nastaw_pl),24)
    check("l","zgodność programu z WiPWC",
          fakt.deklaracja_zgodnosci_wipwc13 is True,24)
    check("m","program EN ISO/IEC 17067 lub dopuszczony wyjątek",
          text(fakt.program_cert_17067) or text(fakt.alternatywna_podstawa_programu),24)
    check("n","metodyka oceny",text(fakt.metodyka_oceny),24)
    check("o","dokumenty i raporty badań",bool(fakt.dokumenty_badan),25)
    check("p","logo jednostki",fakt.logo_jednostki is True,25)
    check("q","symbol i numer akredytacji",
          fakt.symbol_akredytacji is True and text(fakt.numer_akredytacji),25)
    check("r","miejsce i data wydania",
          text(fakt.miejsce_wydania) and fakt.data_wydania is not None,25)
    check("s","data ważności",fakt.data_waznosci_do is not None,25)
    check("t","osoba i podpis",text(fakt.osoba_podpisujaca) and
          fakt.podpis_w_dokumencie is True,25)
    check("u","tabela zdolności i typ PGM",
          bool(fakt.zakres_techniczny_tabela) and typ in fakt.zakres_typow,25)
    # v jest polem dodatkowym, nie bezwarunkowym kryterium obecności.
    missing=[x.litera for x in checks if not x.obecne_w_opisie]
    issues=[]
    issue=fakt.data_wydania
    expiry=fakt.data_waznosci_do
    if issue is None or expiry is None:
        issues.append("BRAK_DAT_POCZATKOWEJ_KONCOWEJ")
    else:
        if expiry<issue:
            issues.append("ODWROCONY_OKRES_WAZNOSCI")
        if expiry>_max_five_years(issue):
            issues.append("OKRES_WAZNOSCI_PONAD_5_LAT")
        if data_oceny>expiry:
            issues.append("CERTYFIKAT_PO_TERMINIE_WAZNOSCI")
        if data_oceny<issue:
            issues.append("CERTYFIKAT_JESZCZE_NIEWYDANY")
    if wersja=="1.2" and data_oceny>date(2026,12,31):
        issues.append("WIPWC_12_PO_TERMINIE_AKCEPTACJI")
    if wersja=="1.2" and data_oceny>=date(2027,1,1):
        issues.append("WIPWC13_OBOWIAZKOWE")
    if not fakt.sha256_pdf:
        issues.append("BRAK_ODCISKU_ORYGINALU_SHA256")
    if not fakt.referencja_vault:
        issues.append("BRAK_DOSTEPU_DO_ORYGINALU_VAULT")
    return {
        "typ_mwe":typ,"wipwc_wydanie":wersja,
        "data_oceny":data_oceny.isoformat(),
        "podstawa":"WiPWC 1.3, Załącznik 1 lit. a–v, §9 i §10",
        "podstawa_url":WIPWC_URL,
        "kontrole":[x.model_dump(mode="json") for x in checks],
        "brakujace_litery":missing,
        "naruszenia_dat_i_pochodzenia":list(dict.fromkeys(issues)),
        "kompletnosc_metadanych":len(missing)==0,
        "status_formalny":"NIE_ZWERYFIKOWANO_AUTENTYCZNOSCI_ANI_AKCEPTACJI",
        "ograniczenie":(
            "Sprawdza tylko deklarowane pola i kalendarz ważności. "
            "Nie bada podpisu kryptograficznego, zakresu akredytacji PCA, "
            "certyfikacji zgodnie z danym typem/firmware, aktualnego wykazu "
            "PTPiREE i potwierdzenia operatora."
        )
    }
