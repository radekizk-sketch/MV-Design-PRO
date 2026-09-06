"""Prezentacja nastaw zabezpieczenia nadpradowego — w tym nastaw NIEDOSTEPNYCH.

Karta F-K5 (dlug V12K-189). Decyzja wlasciciela brzmiala: „nastawa bez danych powinna
byc niedostepna". Kalkulator wykonuje to od V12K-189 — zwraca ``None`` zamiast liczby
zastepczej i dolacza kanoniczne kody gotowosci. Brakowalo drugiej polowy: KONSUMENT
PREZENTACYJNY, ktory zamiast pustego pola pokaze projektantowi stan „niedostepna —
uzupelnij dane" RAZEM z powodem i akcja naprawcza.

Ten modul buduje te projekcje JEDEN RAZ, w warstwie interpretacji:
  * pozycja per nastawa: etykieta PL (oznaczenie ANSI/IEC), wartosc albo brak, stan;
  * powod braku i akcja naprawcza pochodza z KANONICZNEGO rejestru kodow gotowosci
    (`domain.canonical_operations.READINESS_CODES`) — zero wlasnych tekstow o naprawie,
    zeby UI, raport i rejestr gotowosci mowily projektantowi to samo;
  * podsumowanie: czy zestaw jest kompletny i ktorych nastaw brakuje.

ZERO FIZYKI: modul nie liczy zadnej nastawy ani nie zgaduje wartosci. Nazywa stan
wyliczony wczesniej przez kalkulator. Nastawa niedostepna NIE dostaje tu wartosci
domyslnej — to bylaby dokladnie ta fabrykacja, ktora V12K-189 usunal.
"""

from __future__ import annotations

from typing import Any

from domain.canonical_operations import READINESS_CODES

STAN_DOSTEPNA = "DOSTEPNA"
STAN_NIEDOSTEPNA = "NIEDOSTEPNA"

# Kolejnosc pozycji jest STALA (determinizm prezentacji) i odpowiada porzadkowi, w jakim
# projektant nastawia przekaznik: stopnie fazowe, potem ziemnozwarciowe.
_POZYCJE: tuple[tuple[str, str, str], ...] = (
    ("i_pickup_51_a", "I> (51) — prad rozruchowy zwloczny", "A"),
    ("i_inst_50_a", "I>> (50) — nastawa bezzwloczna", "A"),
    ("i_pickup_51n_a", "Io> (51N) — prad rozruchowy ziemnozwarciowy", "A"),
    ("i_inst_50n_a", "Io>> (50N) — nastawa bezzwloczna ziemnozwarciowa", "A"),
)

# Ktora nastawa zalezy od ktorego kodu gotowosci. Bez tego odwzorowania kazda pozycja
# dostalaby wszystkie kody biegu i projektant nie wiedzialby, co dokladnie uzupelnic.
_KODY_NASTAWY: dict[str, tuple[str, ...]] = {
    "i_pickup_51_a": ("protection.nominal_current_missing",),
    "i_inst_50_a": ("protection.fault_current_missing",),
    "i_pickup_51n_a": ("protection.fault_current_missing",),
    "i_inst_50n_a": ("protection.fault_current_missing",),
}

KOMUNIKAT_NIEDOSTEPNA = "Niedostepna — uzupelnij dane wejsciowe"
_POWOD_NIEZNANY = (
    "Niedostepna — analiza nie podala powodu. Sprawdz dane wejsciowe biegu zwarciowego "
    "i parametry pola."
)


def _powod_z_kodow(klucz: str, kody_biegu: tuple[str, ...]) -> tuple[str, dict | None]:
    """Powod PL + nawigacja naprawcza dla brakujacej nastawy.

    Bierzemy PIERWSZY kod biegu, ktory dotyczy tej nastawy — kolejnosc `_KODY_NASTAWY`
    wyznacza priorytet. Gdy bieg nie zglosil zadnego dopasowanego kodu, mowimy o tym
    wprost zamiast zmyslac przyczyne (brak przyczyny jest sam w sobie informacja).
    """
    dopuszczalne = _KODY_NASTAWY.get(klucz, ())
    for kod in dopuszczalne:
        if kod in kody_biegu:
            spec = READINESS_CODES.get(kod)
            if spec is not None:
                return (spec.message_pl, spec.fix_navigation)
    return (_POWOD_NIEZNANY, None)


def zbuduj_prezentacje_nastaw(nastawy: dict[str, Any]) -> dict[str, Any]:
    """Projekcja prezentacyjna zestawu nastaw (wejscie: ``OvercurrentSettingsV0.to_dict()``).

    Zwraca strukture gotowa do wyswietlenia i do sekcji raportu:
      pozycje[]      — klucz, etykieta, jednostka, wartosc (``None`` gdy brak), stan,
                       powod_pl / fix_navigation dla stanu NIEDOSTEPNA
      kompletne      — czy wszystkie cztery nastawy sa dostepne
      brakujace[]    — klucze nastaw niedostepnych (kolejnosc jak w pozycjach)
      kody_gotowosci — kanoniczne kody biegu (przepisane, nie wymyslone)
      podsumowanie_pl— jedno zdanie dla naglowka sekcji
    """
    kody_biegu = tuple(str(kod) for kod in (nastawy.get("readiness_codes") or ()))

    pozycje: list[dict[str, Any]] = []
    brakujace: list[str] = []
    for klucz, etykieta, jednostka in _POZYCJE:
        wartosc = nastawy.get(klucz)
        if wartosc is None:
            powod, nawigacja = _powod_z_kodow(klucz, kody_biegu)
            brakujace.append(klucz)
            pozycje.append(
                {
                    "klucz": klucz,
                    "etykieta": etykieta,
                    "jednostka": jednostka,
                    "wartosc": None,
                    "stan": STAN_NIEDOSTEPNA,
                    "komunikat_pl": KOMUNIKAT_NIEDOSTEPNA,
                    "powod_pl": powod,
                    "fix_navigation": nawigacja,
                }
            )
        else:
            pozycje.append(
                {
                    "klucz": klucz,
                    "etykieta": etykieta,
                    "jednostka": jednostka,
                    "wartosc": float(wartosc),
                    "stan": STAN_DOSTEPNA,
                    "komunikat_pl": None,
                    "powod_pl": None,
                    "fix_navigation": None,
                }
            )

    kompletne = not brakujace
    if kompletne:
        podsumowanie = "Wszystkie nastawy wyznaczone z danych projektu."
    else:
        podsumowanie = (
            f"Niedostepne nastawy: {len(brakujace)} z {len(_POZYCJE)} — "
            "uzupelnij dane wejsciowe wskazane przy pozycjach."
        )

    return {
        "pozycje": pozycje,
        "kompletne": kompletne,
        "brakujace": brakujace,
        "kody_gotowosci": list(kody_biegu),
        "podsumowanie_pl": podsumowanie,
    }
