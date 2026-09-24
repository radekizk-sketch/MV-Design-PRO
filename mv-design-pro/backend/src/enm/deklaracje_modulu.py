"""Deklaracje modułu wytwarzania energii zapisane w modelu i pisarz pól NC RfG generatora.

Moduł-liść importowany przez ``enm/models.py`` (``Generator.deklaracje_modulu``), przez
operacje domenowe zapisu generatora (``add_converter_source``, ``update_element_parameters``),
przez żądanie ``POST .../generators`` (``api/generators.py``) i przez kontrakt wejścia solvera
(``network_model/solvers/ncrfg_ptpiree/contracts.py`` — typy ``DataUmowy`` i
``ModulIstniejacy``; ten sam kierunek zależności co ``enm/nastawy_modulu.py``).
Zero fizyki: wyłącznie kształt danych, które konsumuje pakiet testów zgodności NC RfG /
PTPiREE przez most modelu (``application/ncrfg_compliance/model_bridge.py``) — odbiór Pakietu
C (plan AB O-50 pkt 6).

NAZWY PÓL = nazwy pól kontraktu wejścia solvera ``NcRfgPtpireeModuleInput`` (1:1, parytet
nazw, typów i dziedzin przypięty testem ``tests/enm/test_deklaracje_modulu.py``). Blok niesie
KAŻDE pole wejścia solvera, które nie ma innego nośnika w modelu (wcześniej most wpisywał tam
„BRAK W MODELU"): moc minimalna (T10/T11), funkcje regulacji i zaprzestania generacji
(T05, T12, T13) z tempem zmiany mocy i czasem zaprzestania, czas odbudowy mocy czynnej (T16),
wzmocnienie prądu biernego (T17), zdolności dodatkowe i ich wymaganie w programie badań
(T18), komunikacja z operatorem i rejestrator zakłóceń (T19) oraz THD_U źródła (T20).

ZERO FABRYKACJI: każde pole jest opcjonalne i domyślnie ``None`` — brak deklaracji w modelu
to ocena niewykonana z nazwanym brakiem, nigdy wartość typowa ani „niezadeklarowane"
(``False`` znaczy: projektant zadeklarował brak funkcji). Deklaracja podana bez wskazania,
skąd pochodzi (karta katalogowa, deklaracja wytwórcy, dokument), jest odrzucana —
``zrodlo_pl`` jest obowiązkowe, gdy podano choć jedną wartość.
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from datetime import date
from typing import Annotated, Any, Self

from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    FiniteFloat,
    StrictBool,
    TypeAdapter,
    ValidationError,
    model_validator,
)

from .nastawy_modulu import NastawyZabezpieczenModulu

_DATA_ISO = re.compile(r"\d{4}-\d{2}-\d{2}")


def _data_iso(wartosc: object) -> object:
    """Data umowy wyłącznie jako data albo napis ISO ``RRRR-MM-DD``. Liczba (także zapisana
    napisem) nie jest datą: pydantic w trybie łagodnym czyta ją jako czas uniksowy (``0`` →
    1970-01-01, ``"1735689600"`` → 2025-01-01), co po cichu podstawiłoby datę umowy
    przyłączeniowej — a z nią wersję procedury PTPiREE i warstw profilu."""
    if isinstance(wartosc, date) or (isinstance(wartosc, str) and _DATA_ISO.fullmatch(wartosc)):
        return wartosc
    raise ValueError(
        f"data umowy przyłączeniowej musi być datą kalendarzową w zapisie RRRR-MM-DD — podano "
        f"{wartosc!r}"
    )


#: Data umowy przyłączeniowej modułu — JEDEN typ dla wszystkich nośników pola (model
#: ``Generator``, żądanie ``POST .../generators``, wejście solvera ``NcRfgPtpireeModuleInput``,
#: pisarz operacji :func:`pola_nc_rfg_generatora`): data albo napis ISO, nigdy liczba.
DataUmowy = Annotated[date, BeforeValidator(_data_iso)]
#: Status modułu istniejącego (art. 4 ust. 1 rozporządzenia 2016/631) — JEDEN typ dla tych
#: samych nośników: wyłącznie wartość logiczna (``"1"``, ``0`` czy ``"tak"`` nie są statusem).
ModulIstniejacy = StrictBool

#: Pola deklaracji w kolejności kontraktu wejścia solvera (parytet przypięty testem).
POLA_DEKLARACJI: tuple[str, ...] = (
    "p_min_kw",
    "has_scada_communication",
    "has_disturbance_recorder",
    "active_power_control_enabled",
    "stop_generation_enabled",
    "reduction_generation_enabled",
    "island_operation_required",
    "island_operation_capable",
    "black_start_required",
    "black_start_capable",
    "power_oscillation_damping_required",
    "power_oscillation_damping_enabled",
    "ramp_rate_pct_per_min",
    "reactive_current_gain",
    "p_recovery_time_s",
    "harmonic_thdu_percent",
    "cease_generation_time_s",
)


class DeklaracjeModulu(BaseModel):
    """Deklaracje modułu (dane testów T05, T10–T13, T16–T20) ze źródłem.

    Jednostki: ``p_min_kw`` w kW, ``ramp_rate_pct_per_min`` w % P_max/min,
    ``reactive_current_gain`` bezwymiarowe (p.u./p.u.), ``p_recovery_time_s`` i
    ``cease_generation_time_s`` w s, ``harmonic_thdu_percent`` w %. Pola ``*_required``
    to wymaganie zdolności dodatkowej w programie szczegółowym badań operatora (brak =
    nie wymagano), pozostałe pola logiczne — deklaracja zdolności modułu (brak = nie
    zadeklarowano, ``False`` = zadeklarowano brak).

    Pola są ŚCISŁE (``strict=True`` na polu — te same ograniczenia co pola wejścia solvera
    ``NcRfgPtpireeModuleInput``, parytet przypięty testem): deklaracja ma typ swojego pola —
    wartość logiczna nie staje się liczbą (``true`` → 1,0 s), napis nie staje się liczbą ani
    wartością logiczną (``"1.5"``, ``"true"``), liczba nie staje się wartością logiczną
    (``1``); liczba całkowita w polu liczbowym jest liczbą (``100`` → 100,0 kW).
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    p_min_kw: FiniteFloat | None = Field(default=None, ge=0, strict=True)
    has_scada_communication: bool | None = Field(default=None, strict=True)
    has_disturbance_recorder: bool | None = Field(default=None, strict=True)
    active_power_control_enabled: bool | None = Field(default=None, strict=True)
    stop_generation_enabled: bool | None = Field(default=None, strict=True)
    reduction_generation_enabled: bool | None = Field(default=None, strict=True)
    island_operation_required: bool | None = Field(default=None, strict=True)
    island_operation_capable: bool | None = Field(default=None, strict=True)
    black_start_required: bool | None = Field(default=None, strict=True)
    black_start_capable: bool | None = Field(default=None, strict=True)
    power_oscillation_damping_required: bool | None = Field(default=None, strict=True)
    power_oscillation_damping_enabled: bool | None = Field(default=None, strict=True)
    ramp_rate_pct_per_min: FiniteFloat | None = Field(default=None, gt=0, strict=True)
    reactive_current_gain: FiniteFloat | None = Field(default=None, ge=0, strict=True)
    p_recovery_time_s: FiniteFloat | None = Field(default=None, ge=0, strict=True)
    harmonic_thdu_percent: FiniteFloat | None = Field(default=None, ge=0, strict=True)
    cease_generation_time_s: FiniteFloat | None = Field(default=None, gt=0, strict=True)
    #: Skąd pochodzą deklaracje (karta katalogowa, deklaracja wytwórcy, dokument projektu).
    zrodlo_pl: str | None = Field(default=None, min_length=1)

    @model_validator(mode="after")
    def _zrodlo(self) -> Self:
        podane = [pole for pole in POLA_DEKLARACJI if getattr(self, pole) is not None]
        if podane and (self.zrodlo_pl is None or not self.zrodlo_pl.strip()):
            raise ValueError(
                f"Deklaracje modułu ({', '.join(podane)}) bez wskazania źródła — podaj "
                "`zrodlo_pl` (karta katalogowa, deklaracja wytwórcy albo dokument projektu)."
            )
        return self


#: Pola NC RfG generatora zapisywane operacjami domenowymi (tworzenie i aktualizacja) —
#: JEDNA lista dla obu pisarzy (predykat zapisu z jednego źródła).
POLA_NC_RFG_GENERATORA: tuple[str, ...] = (
    "modul_istniejacy",
    "data_umowy_przylaczeniowej",
    "nastawy_zabezpieczen",
    "deklaracje_modulu",
)

_MODUL_ISTNIEJACY: TypeAdapter[bool] = TypeAdapter(ModulIstniejacy)
_DATA: TypeAdapter[date] = TypeAdapter(DataUmowy)


def _opis_bledu(blad: ValidationError) -> str:
    return "; ".join(
        f"{'.'.join(str(czesc) for czesc in pozycja['loc']) or 'wartość'}: {pozycja['msg']}"
        for pozycja in blad.errors()
    )


def pola_nc_rfg_generatora(
    parametry: Mapping[str, Any],
) -> tuple[dict[str, Any], tuple[str, str] | None]:
    """Znormalizowane pola NC RfG generatora z ładunku operacji zapisu (JEDEN walidator dla
    ``add_converter_source`` i ``update_element_parameters``).

    Zwraca ``(pola, None)`` — tylko pola obecne w ładunku, w postaci JSON modelu (``None``
    zdejmuje daną: wraca stan „nieustalone") — albo ``({}, (komunikat, kod))`` przy pierwszej
    wartości spoza kontraktu. Kontrakty (te same typy co model, żądanie HTTP i wejście
    solvera): ``modul_istniejacy`` — :data:`ModulIstniejacy`; ``data_umowy_przylaczeniowej`` —
    :data:`DataUmowy`; ``nastawy_zabezpieczen`` — ``NastawyZabezpieczenModulu``;
    ``deklaracje_modulu`` — ``DeklaracjeModulu``.
    """
    pola: dict[str, Any] = {}
    for pole in POLA_NC_RFG_GENERATORA:
        if pole not in parametry:
            continue
        wartosc = parametry[pole]
        if wartosc is None:
            pola[pole] = None
            continue
        if pole == "modul_istniejacy":
            try:
                pola[pole] = _MODUL_ISTNIEJACY.validate_python(wartosc)
            except ValidationError:
                return {}, (
                    "Status modułu istniejącego (art. 4 ust. 1 rozporządzenia 2016/631) musi "
                    f"być wartością logiczną albo pusty — podano {wartosc!r}.",
                    "generator.modul_istniejacy_invalid",
                )
            continue
        try:
            if pole == "data_umowy_przylaczeniowej":
                pola[pole] = _DATA.validate_python(wartosc).isoformat()
            elif pole == "nastawy_zabezpieczen":
                pola[pole] = NastawyZabezpieczenModulu.model_validate(wartosc).model_dump(
                    mode="json", exclude_none=True
                )
            else:
                pola[pole] = DeklaracjeModulu.model_validate(wartosc).model_dump(
                    mode="json", exclude_none=True
                )
        except ValidationError as blad:
            kody = {
                "data_umowy_przylaczeniowej": "generator.data_umowy_invalid",
                "nastawy_zabezpieczen": "generator.nastawy_zabezpieczen_invalid",
                "deklaracje_modulu": "generator.deklaracje_modulu_invalid",
            }
            return {}, (f"Pole `{pole}` poza kontraktem: {_opis_bledu(blad)}.", kody[pole])
    return pola, None
