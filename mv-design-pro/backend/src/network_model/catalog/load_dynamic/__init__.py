"""Katalog profili modelu dynamicznego ODBIORÓW (karta modeli odbiorów, decyzja O-56).

PO CO. Bieg czasowy `dynamika_rms` wymaga od każdego odbioru dwóch parametrów, których
rozpływ nie zna: napięcia przejścia składowych prądowej i mocowej w stałą impedancję
(`U_min`) i — dla odbioru czułego częstotliwościowo — stałej czasowej pomiaru
częstotliwości (`T_f`). Źródłem tych danych jest TEN katalog: profil wiąże się z odbiorem
jedną operacją domenową (`set_load_dynamic_binding`), a kopię `Load.dynamika` buduje jedna
funkcja materializacji (`enm.dynamika_z_katalogu.materializuj_dynamike_odbioru`).

DLACZEGO OSOBNY KATALOG, A NIE SEKCJA TYPU ODBIORU (pomiar 2026-09-25). Katalog typów
odbiorów (`mv_auxiliary_catalog.get_all_load_types`) ma trzy pozycje, wszystkie stałej
mocy (`model="PQ"`), opisujące MOC ZNAMIONOWĄ odbioru (15 kW, 30 kW, 75 kW). Odbiór
w modelu nie musi mieć typu katalogowego (odbiory z importu i z kreatora nN niosą moc
wprost), a współczynniki ZIP przychodzą z `materialized_params`. Parametry dynamiczne
opisują natomiast ZACHOWANIE składu odbioru przy zapadzie i zmianie częstotliwości,
niezależne od mocy znamionowej — ten sam profil dotyczy odbioru 15 kW i 5 MW. Sekcja
w typie odbioru wymagałaby typu katalogowego od każdego odbioru i powielała profil w każdej
pozycji mocy; osobny katalog wiąże się z KAŻDYM odbiorem, tak jak katalog `der_dynamic`
z każdym wytwórcą.

PROFIL NIESIE WYŁĄCZNIE PARAMETRY MODELU DYNAMICZNEGO. Kształt charakterystyki
(współczynniki ZIP, czułości k) zostaje w typie odbioru i `materialized_params` — to on
rozstrzyga, które pola profilu kopia odbioru czyta (`kontrakty.wymagane_parametry_odbioru`):
odbiór czysto impedancyjny nie dostaje `U_min`, odbiór bez czułości częstotliwościowej —
`T_f`. Profil jest więc KOMPLETNY (oba pola wymagane), a kopia — dokładnie tym, czego
używają równania odbioru.

ZERO DOMYŚLEK, JAKOŚĆ `ESTIMATED`. Wartości są TYPOWE (nie zmierzone na odbiorze), każda
z podstawą po polsku w profilu (`podstawa_u_min_pl`, `podstawa_t_pomiaru_pl`) — ekran
dynamiki pokazuje ją obok wyboru. Stopień dowodowy wyniku policzonego z profilu typowego
jest deklaracją (`dane_przyjete_biegu` — dane przyjęte bez walidacji).
"""

from __future__ import annotations

from typing import Literal

from enm.dynamika_modele import ModelDynamicznyOdbioru, ProweniencjaParametrow
from pydantic import BaseModel, ConfigDict, Field


class LoadDynamicProfile(BaseModel):
    """Profil modelu dynamicznego odbioru (szablon kopii `Load.dynamika`)."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    profile_id: str = Field(min_length=1)
    profile_name_pl: str = Field(min_length=1)
    #: Jaki skład odbioru profil opisuje — zdanie dla projektanta na liście wyboru.
    opis_pl: str = Field(min_length=1)
    proweniencja: ProweniencjaParametrow
    #: Jakość danych profilu na osi `solver_input.provenance.FieldQuality` — wartość typowa.
    jakosc: Literal["ESTIMATED"]
    u_min_pu: float = Field(gt=0.0, lt=1.0)
    podstawa_u_min_pl: str = Field(min_length=1)
    t_pomiaru_czestotliwosci_s: float = Field(gt=0.0)
    podstawa_t_pomiaru_pl: str = Field(min_length=1)

    def to_model_dynamiczny(
        self, *, u_min_uzyte: bool, t_pomiaru_uzyte: bool
    ) -> ModelDynamicznyOdbioru:
        """Kopia `Load.dynamika` z polami, które równania TEGO odbioru czytają.

        `u_min_uzyte`/`t_pomiaru_uzyte` = `kontrakty.wymagane_parametry_odbioru` kształtu
        charakterystyki odbioru (jedno źródło reguł — wołający nie ma własnego predykatu).
        """
        return ModelDynamicznyOdbioru(
            proweniencja=self.proweniencja,
            u_min_pu=self.u_min_pu if u_min_uzyte else None,
            t_pomiaru_czestotliwosci_s=self.t_pomiaru_czestotliwosci_s if t_pomiaru_uzyte else None,
        )


#: Odniesienie profilu typowego: przewodnik modelowania obciążeń w symulacjach RMS (postać
#: modelu: ZIP × czynnik częstotliwościowy, przejście do stałej impedancji przy zapadzie).
#: Tekst trafia do zdań dla projektanta (dana przyjęta, zastrzeżenie oceny), więc nie niesie
#: kodu jakości — jakość jest polem rekordu (`jakosc`), a zdanie mówi „oszacowane" po polsku.
_ODNIESIENIE_ODBIORU = (
    "IEEE Std 2781-2022 (modelowanie obciążeń w symulacjach systemu elektroenergetycznego)"
)

PROFIL_ODBIORU_ZAGREGOWANEGO_SN = LoadDynamicProfile(
    profile_id="load_dyn_zagregowany_sn",
    profile_name_pl="Odbiór zagregowany sieci SN — profil typowy",
    opis_pl=(
        "Odbiór zastępczy stacji albo ciągu odbiorów (mieszanka napędów, oświetlenia, "
        "odbiorników elektronicznych) — przejście do stałej impedancji przy głębokim zapadzie, "
        "pomiar częstotliwości z opóźnieniem kilku okresów sieci."
    ),
    proweniencja=ProweniencjaParametrow(
        zrodlo="profil_typowy_normy", odniesienie=_ODNIESIENIE_ODBIORU
    ),
    jakosc="ESTIMATED",
    u_min_pu=0.7,
    podstawa_u_min_pl=(
        "Próg 0,7 pu przejścia odbioru stałej mocy i stałego prądu w stałą impedancję to "
        "wartość typowa programów symulacji RMS (PSS/E: próg charakterystyki stałej mocy "
        "PQBRAK, wartość domyślna 0,7 pu). Poniżej progu odbiorniki elektroniczne i napędy "
        "nie utrzymują mocy — przyjęcie stałej mocy dawałoby prąd rosnący bez granic."
    ),
    t_pomiaru_czestotliwosci_s=0.1,
    podstawa_t_pomiaru_pl=(
        "Stała 0,1 s (pięć okresów sieci 50 Hz) — rząd stałych czasowych filtrów pomiaru "
        "częstotliwości szyny w modelach RMS obciążeń; odbiorniki reagują na częstotliwość "
        "przez prędkość napędów, nie natychmiast. Żadna norma nie podaje jednej wartości — "
        "dana szacowana, do zastąpienia pomiarem odbioru."
    ),
)

#: Rejestr profili (kolejność = kolejność listy wyboru w interfejsie).
PROFILE_ODBIOROW: tuple[LoadDynamicProfile, ...] = (PROFIL_ODBIORU_ZAGREGOWANEGO_SN,)

_PO_ID: dict[str, LoadDynamicProfile] = {p.profile_id: p for p in PROFILE_ODBIOROW}
if len(_PO_ID) != len(PROFILE_ODBIOROW):  # pragma: no cover - obrona rejestru
    raise AssertionError("Katalog profili odbiorów: powtórzony identyfikator profilu.")


def list_load_profile_ids() -> tuple[str, ...]:
    """Identyfikatory profili w kolejności katalogu."""
    return tuple(p.profile_id for p in PROFILE_ODBIOROW)


def get_load_profile(profile_id: str) -> LoadDynamicProfile:
    """Profil o danym identyfikatorze; nieznany identyfikator to `KeyError` (bez domysłu)."""
    return _PO_ID[profile_id]


__all__ = [
    "PROFILE_ODBIOROW",
    "PROFIL_ODBIORU_ZAGREGOWANEGO_SN",
    "LoadDynamicProfile",
    "get_load_profile",
    "list_load_profile_ids",
]
