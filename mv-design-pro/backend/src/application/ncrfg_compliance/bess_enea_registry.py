"""ENEA IRiESD I.5: obowiązki rejestrowe magazynów energii, NIE NC RfG.

Oparto na IRiESD v2.3 (tekst ujednolicony od 19.10.2026), I.5.2-4,
oraz stronie ENEA o rejestrze MEE. Zmiany na rynku energii podlegają
odrębnym terminom; nie przenosić wymagań certyfikacji MWE na BESS.
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Self

from pydantic import BaseModel, ConfigDict, Field, FiniteFloat, StrictBool, model_validator
from enm.deklaracje_modulu import DataUmowy

IRIESD_URL=(
    "https://www.operator.enea.pl/media/4612/teczka-prasowa/"
    "5iriesdtj-od-19102026zmpkt2i3ka45pdf.pdf"
)
ENEA_REGISTRY_URL=(
    "https://www.operator.enea.pl/przylaczenie-do-sieci/"
    "magazyny-energii-elektrycznej"
)


class DaneMagazynuDoRejestru(BaseModel):
    model_config=ConfigDict(extra="forbid",frozen=True)
    moc_zainstalowana_kw: FiniteFloat=Field(gt=0,strict=True)
    w_instalacji_wytworczej_lub_odbiorczej: StrictBool | None = None
    oddano_do_eksploatacji: DataUmowy | None = None
    data_przekazania_informacji_osd: DataUmowy | None = None
    data_wpisu_osd: DataUmowy | None = None
    identyfikator_zrodla: str | None = Field(default=None,min_length=1)

    @model_validator(mode="after")
    def require_source(self) -> Self:
        if (self.oddano_do_eksploatacji or self.data_przekazania_informacji_osd
           or self.data_wpisu_osd) and not (
            self.identyfikator_zrodla and self.identyfikator_zrodla.strip()
        ):
            raise ValueError("Dane o rejestrze magazynu wymagają źródła dokumentowego.")
        return self


def oceń_rejestr_magazynu(wej: DaneMagazynuDoRejestru, *, na_dzien: date) -> dict:
    """7 dni dla informacji posiadacza, 14 dni dla wpisu OSD: różni adresaci.

    Nie wnioskuje z p_mw źródła mocy ZAINSTALOWANEJ magazynu, bo p_mw
    jest mocą roboczą i może różnić się od mocy przyłączeniowej/PCS.
    """
    installed = wej.moc_zainstalowana_kw
    if installed<=50.0:
        register="POZA_ZAKRESEM_WPISU_I5_2"
    elif installed<=10000.0:
        register="WPIS_WYMAGANY_I5_2"
    else:
        register="POZA_ZAKRESEM_I5_2_PONAD_10MW_WYMAGA_ODREBNEJ_OCENY"

    info="NIEUSTALONE"
    deadline=None
    if wej.w_instalacji_wytworczej_lub_odbiorczej is False:
        info="NIE_DOTYCZY_I5_4"
    elif wej.w_instalacji_wytworczej_lub_odbiorczej is True:
        if wej.oddano_do_eksploatacji is None:
            info="BRAK_DATY_ODDANIA"
        else:
            deadline=wej.oddano_do_eksploatacji + timedelta(days=7)
            sent=wej.data_przekazania_informacji_osd
            if sent is None:
                info="TERMIN_MINAL" if na_dzien>deadline else "DO_PRZEKAZANIA"
            elif sent>deadline:
                info="PRZEKAZANO_PO_TERMINIE"
            else:
                info="PRZEKAZANO_W_TERMINIE_WG_DEKLARACJI"

    odrębne = (
        "Dokument IRiESD ustanawia odrębne obowiązki dla MEE. "
        "Wymagana jest ocena warunków przyłączenia, wymaganych zabezpieczeń "
        "i telemechaniki; nie stosować automatycznie NC RfG do samodzielnego magazynu."
    )
    # Termin wpisu operatora wynosi 14 dni od odpowiedniego zdarzenia,
    # ale nie da się automatycznie ustalić zdarzenia "od ... lub ...",
    # bez potwierdzenia właściwej podstawy przez ENEA.
    operator="BRAK_POTWIERDZENIA_WPISU_OSD"
    if wej.data_wpisu_osd is not None:
        operator="DATA_WPISU_ZADEKLAROWANA_WYMAGA_DOWODU"
    return {
        "moc_zainstalowana_kw":installed,
        "ocena_na_dzien":na_dzien.isoformat(),
        "wymagany_wpis":register,
        "obowiazek_informacji_posiadacza":info,
        "termin_informacji_7dni":deadline.isoformat() if deadline else None,
        "wpis_operatora":operator,
        "termin_operatora_i5_3_dni":14,
        "operator_termin_podstawa":"Oddanie do eksploatacji lub otrzymanie informacji, wg I.5.3",
        "zrodlo_iriesd":IRIESD_URL,
        "sekcje_iriesd":["I.5.2","I.5.3","I.5.4"],
        "zrodlo_rejestr":ENEA_REGISTRY_URL,
        "status_kompletnosci_zgodnosci":"NIE_OCENIONO",
        "zrodlo_uwaga":(
            "IRiESD z października 2026 r. posiada zmienione daty wejścia "
            "w życie wybranych kart CSiRE. Zweryfikować bieżącą treść "
            "tego punktu i warunki danego magazynu."
        ),
        "warunki_dalsze_pl":odrębne
    }
