"""Wspólne fabryki rekordów kontraktów dziedziny częstotliwości (testy pakietu ``dziedziny``).

Liczby w fabrykach są DANYMI TESTOWYMI kontraktu (kształt, reguły walidacji), a nie danymi
urządzeń — żadna nie trafia do katalogu ani do produktu.
"""

from __future__ import annotations

from typing import Any

from dziedziny.kanon import Przedzial
from dziedziny.karta_widmowa import KartaWidmowa
from dziedziny.pomiar import AgregacjaPomiaru, OknoPomiaru, ParametryPomiaru
from dziedziny.sekcje import DowodModelu
from dziedziny.widmo import (
    ModelParametryczny,
    ModelZrodlaWidmowego,
    OdniesienieAmplitudy,
    OdniesienieFazy,
    ParametrModelu,
    PunktAdmitancji,
    PunktImpedancji,
    PunktPracyWidma,
    SkladowaWidma,
    ZakresCzestotliwosci,
    ZapytaniePunktuPracy,
)
from werdykt.kontrakt import PodstawaWymagania, Wielkosc
from werdykt.proweniencja import FieldQuality

F1 = 50.0


def podstawa(
    status: str = "WSKAZANE", rodzaj: str = "KATALOG_PRODUCENTA", dokument: str = "Raport R-1"
) -> PodstawaWymagania:
    if status == "NIEUSTALONE":
        return PodstawaWymagania(rodzaj=rodzaj, dokument=dokument, status="NIEUSTALONE")
    return PodstawaWymagania(
        rodzaj=rodzaj,
        dokument=dokument,
        wydanie="2024-01",
        jednostka_redakcyjna="tabela 3",
        status=status,
    )


def pomiar_kompletny(*, rbw: bool = True) -> ParametryPomiaru:
    return ParametryPomiaru(
        metoda="IEC 61000-4-7, grupowanie podgrup",
        czestotliwosc_probkowania_hz=10240.0,
        okno=OknoPomiaru(
            rodzaj_pl="prostokątne zsynchronizowane", dlugosc_s=0.2, liczba_okresow=10
        ),
        rozdzielczosc_hz=5.0,
        rbw_hz=200.0 if rbw else None,
        agregacja=AgregacjaPomiaru(czas_s=600.0, statystyka_pl="wartość średnia 10 min"),
        podstawa=podstawa(dokument="Protokół pomiaru P-7"),
    )


def punkt_pracy(
    p: tuple[float, float] = (0.0, 1.0),
    domkniecie: tuple[bool, bool] = (True, True),
    **inne: Any,
) -> PunktPracyWidma:
    return PunktPracyWidma(
        baza_mocy="S_N_URZADZENIA",
        p=Przedzial(
            dolna=p[0], gorna=p[1], domkniecie_dolne=domkniecie[0], domkniecie_gorne=domkniecie[1]
        ),
        **inne,
    )


def zapytanie(p: float = 0.5, **inne: Any) -> ZapytaniePunktuPracy:
    dane: dict[str, Any] = {"baza_mocy": "S_N_URZADZENIA", "p": p, "stacjonarny": True}
    dane.update(inne)
    return ZapytaniePunktuPracy(**dane)


def skladowa(
    f_hz: float,
    wartosc: float = 3.0,
    jednostka: str = "%",
    faza: float | None = None,
    powod: str | None = "faza nieznana — karta nie podaje",
) -> SkladowaWidma:
    return SkladowaWidma(
        f_hz=f_hz,
        amplituda=Wielkosc(wartosc=wartosc, jednostka=jednostka),
        faza_deg=faza,
        faza_nieznana_powod_pl=None if faza is not None else powod,
    )


def odniesienie_pradu() -> OdniesienieAmplitudy:
    return OdniesienieAmplitudy(rodzaj="I_N_URZADZENIA", pola_karty=("sn_mva", "un_kv"))


def model(**nadpisania: Any) -> ModelZrodlaWidmowego:
    """Model CURRENT_SPECTRUM z harmonicznymi 5 i 7 w % I_n (wartości testowe)."""
    dane: dict[str, Any] = {
        "ident": "m-1",
        "rodzaj": "CURRENT_SPECTRUM",
        "dziedzina": "HARMONIC_FREQUENCY_DOMAIN",
        "f1_hz": F1,
        "zakres_czestotliwosci": ZakresCzestotliwosci(f_min_hz=0.0, f_max_hz=2500.0),
        "skladowe": (skladowa(250.0), skladowa(350.0, 2.0)),
        "punkt_pracy": punkt_pracy(),
        "odniesienie_amplitudy": odniesienie_pradu(),
        "podstawa": podstawa(),
        "wersja": "1",
    }
    dane.update(nadpisania)
    return ModelZrodlaWidmowego(**dane)


def model_zmierzony(**nadpisania: Any) -> ModelZrodlaWidmowego:
    dane: dict[str, Any] = {
        "ident": "m-zm",
        "rodzaj": "MEASURED_SPECTRUM",
        "pomiar": pomiar_kompletny(),
    }
    dane.update(nadpisania)
    return model(**dane)


def model_parametryczny(jakosc: FieldQuality = FieldQuality.ESTIMATED) -> ModelZrodlaWidmowego:
    return model(
        ident="m-zconv",
        rodzaj="FREQUENCY_DEPENDENT_EQUIVALENT",
        skladowe=(),
        odniesienie_amplitudy=None,
        model_parametryczny=ModelParametryczny(
            rodzina="Z_conv_literaturowy",
            parametry=(
                ParametrModelu(
                    nazwa="current_loop_bandwidth_hz",
                    wartosc=Wielkosc(wartosc=900.0, jednostka="Hz"),
                    jakosc=jakosc,
                ),
            ),
        ),
    )


def admitancja(*f: float) -> tuple[PunktAdmitancji, ...]:
    return tuple(PunktAdmitancji(f_hz=x, g_s=0.001, b_s=-0.002) for x in f)


def impedancja(*f: float) -> tuple[PunktImpedancji, ...]:
    return tuple(PunktImpedancji(f_hz=x, r_ohm=0.1, x_ohm=1.0) for x in f)


def odniesienie_fazy() -> OdniesienieFazy:
    return OdniesienieFazy(wielkosc="U_1_ZACISKOW", konwencja="THETA_H_MINUS_H_THETA_1")


def dowod(
    rodzaj: str, pokrywa: tuple[str, ...], status: str = "WSKAZANE", odniesienie: str = "D-1"
) -> DowodModelu:
    return DowodModelu(
        rodzaj=rodzaj,
        pokrywa=pokrywa,
        podstawa=podstawa(status=status, dokument=f"Dokument {odniesienie}"),
        odniesienie_pl=odniesienie,
    )


def karta(**nadpisania: Any) -> KartaWidmowa:
    dane: dict[str, Any] = {
        "id": "karta-1",
        "urzadzenie_ref": "conv-test",
        "producent": "PRODUCENT",
        "model_urzadzenia": "MODEL",
        "modele": (model(),),
        "podstawa": podstawa(),
        "wersja": "1",
        "verification_status": "NIEWERYFIKOWANY",
        "source_reference": "Raport R-1, tabela 3",
        "catalog_status": "PROJEKTOWY_V1",
        "contract_version": "2.0",
    }
    dane.update(nadpisania)
    return KartaWidmowa(**dane)
