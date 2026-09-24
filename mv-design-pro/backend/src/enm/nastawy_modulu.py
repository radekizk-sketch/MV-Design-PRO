"""Nastawy zabezpieczeń modułu wytwarzania energii zapisane w modelu (plan AB O-32).

Moduł-liść importowany przez ``enm/models.py`` (``Generator.nastawy_zabezpieczen``) i przez
kontrakt wejścia solvera PTPiREE (``NcRfgPtpireeModuleInput.nastawy_zabezpieczen_modulu``).
Zero fizyki: wyłącznie kształt danych, które konsumują kryteria koordynacji statycznej
(``frt.koordynacja_nastaw_u_min`` — nastawa U< i jej czas wobec obwiedni LVRT profilu;
``rocof.koordynacja_nastaw_lom`` — nastawa RoCoF/LoM wobec wytrzymałości RoCoF), budowane
w ``application/ncrfg_compliance/ocena_wymagan.py``.

NAZWY PÓL = słownik zamknięty Banku Nastaw operatora (``catalog.profiles.nc_rfg.loader.
JEDNOSTKI_NASTAW``): ta sama pozycja ma tę samą nazwę po stronie wymagania operatora i po
stronie nastawy modułu, więc porównanie nie potrzebuje żadnego mapowania. Parytet nazw jest
przypięty testem w obie strony (``tests/enm/test_nastawy_modulu.py``); jednostki pól są
jednostkami słownika (U w ``p.u. (U_n)``, czasy w ``s``, częstotliwość w ``Hz``, RoCoF
w ``Hz/s``, przesunięcie fazy w ``deg``).

ZERO FABRYKACJI: każde pole jest opcjonalne i domyślnie ``None`` (brak nastawy w modelu to
stan „nieoceniony", nigdy wartość typowa). Nastawa podana bez wskazania, skąd pochodzi
(nastawnik, dokument), jest odrzucana — ``zrodlo_pl`` jest obowiązkowe, gdy podano choć
jedną wartość.
"""

from __future__ import annotations

from typing import Self

from pydantic import BaseModel, ConfigDict, Field, FiniteFloat, model_validator

#: Pola wartości nastaw w kolejności słownika Banku Nastaw (parytet przypięty testem).
POLA_NASTAW: tuple[str, ...] = (
    "u_min_pu",
    "u_min_czas_s",
    "u_max_pu",
    "u_max_czas_s",
    "f_min_hz",
    "f_min_czas_s",
    "f_max_hz",
    "f_max_czas_s",
    "rocof_hz_s",
    "rocof_czas_s",
    "przesuniecie_fazy_deg",
)


class NastawyZabezpieczenModulu(BaseModel):
    """Nastawy zabezpieczeń modułu (U<, U>, f<, f>, RoCoF, skok wektora) ze źródłem.

    Zakresy są fizyczne (napięcie względne i czasy nieujemne, częstotliwość i RoCoF
    dodatnie, przesunięcie fazy w przedziale (0, 180] stopni). Pary progów tej samej
    wielkości są uporządkowane: ``u_min_pu < u_max_pu`` i ``f_min_hz < f_max_hz``, gdy obie
    wartości pary są podane.

    Tryb ścisły (``strict``): nastawa jest liczbą — wartość logiczna (``true`` → 1,0) ani
    napis (``"0.8"``) nie są po cichu zamieniane na próg zabezpieczenia; liczba całkowita
    jest liczbą (``1`` → 1,0).
    """

    model_config = ConfigDict(frozen=True, extra="forbid", strict=True)

    u_min_pu: FiniteFloat | None = Field(default=None, ge=0.0)
    u_min_czas_s: FiniteFloat | None = Field(default=None, ge=0.0)
    u_max_pu: FiniteFloat | None = Field(default=None, gt=0.0)
    u_max_czas_s: FiniteFloat | None = Field(default=None, ge=0.0)
    f_min_hz: FiniteFloat | None = Field(default=None, gt=0.0)
    f_min_czas_s: FiniteFloat | None = Field(default=None, ge=0.0)
    f_max_hz: FiniteFloat | None = Field(default=None, gt=0.0)
    f_max_czas_s: FiniteFloat | None = Field(default=None, ge=0.0)
    rocof_hz_s: FiniteFloat | None = Field(default=None, gt=0.0)
    rocof_czas_s: FiniteFloat | None = Field(default=None, ge=0.0)
    przesuniecie_fazy_deg: FiniteFloat | None = Field(default=None, gt=0.0, le=180.0)
    #: Skąd pochodzą nastawy (nastawnik zabezpieczenia, karta nastaw, dokument projektu).
    zrodlo_pl: str | None = Field(default=None, min_length=1)

    @model_validator(mode="after")
    def _zrodlo_i_porzadek(self) -> Self:
        podane = [pole for pole in POLA_NASTAW if getattr(self, pole) is not None]
        if podane and (self.zrodlo_pl is None or not self.zrodlo_pl.strip()):
            raise ValueError(
                f"Nastawy zabezpieczeń modułu ({', '.join(podane)}) bez wskazania źródła — "
                "podaj `zrodlo_pl` (nastawnik zabezpieczenia, karta nastaw albo dokument)."
            )
        for dolna, gorna in (("u_min_pu", "u_max_pu"), ("f_min_hz", "f_max_hz")):
            wartosc_dolna = getattr(self, dolna)
            wartosc_gorna = getattr(self, gorna)
            if (
                wartosc_dolna is not None
                and wartosc_gorna is not None
                and not wartosc_dolna < wartosc_gorna
            ):
                raise ValueError(
                    f"Nastawa `{dolna}` = {wartosc_dolna} nie jest mniejsza od `{gorna}` = "
                    f"{wartosc_gorna} — próg dolny musi leżeć poniżej progu górnego."
                )
        return self
