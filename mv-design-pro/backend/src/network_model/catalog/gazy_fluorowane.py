"""Zakaz gazów fluorowanych w PROJEKTOWANYCH polach SN — jedno źródło reguły (dyrektywa
właściciela 2026-10-28: „nowe pola nie mogą być w SF6").

PODSTAWA. Rozporządzenie (UE) 2024/573, art. 13 ust. 9: zakaz wprowadzania do użytku rozdzielnic
elektrycznych, które wykorzystują w medium izolującym lub przerywającym łuk elektryczny fluorowane
gazy cieplarniane albo których działanie jest od nich zależne — lit. a: rozdzielnice SN
w dystrybucji pierwotnej i wtórnej do 24 kV włącznie od 2026-01-01; lit. b: powyżej 24 kV do
52 kV włącznie od 2030-01-01. Dyrektywa właściciela rozciąga zakaz na KAŻDE napięcie pola SN
(wyjątki ust. 11–13 nie są modelowane — dyrektywa jest bezwzględna). ENEA Operator „Stacje
elektroenergetyczne 110 kV", Zeszyt 1, §13 dopuszcza izolację „SF6 lub inną o zbliżonych
właściwościach dielektrycznych w tym powietrzną" i wymaga wyłączników z próżniowymi komorami
gaszeniowymi — wzorzec pola wybiera więc wyłącznie wykonania bez gazów fluorowanych.

GRANICA ZAKAZU. Zakaz dotyczy wprowadzania do użytku, czyli obiektów PROJEKTOWANYCH. Art. 13
ust. 10 (przeniesienie istniejącej rozdzielnicy w inne miejsce nie jest wprowadzeniem do użytku)
i ust. 7 (serwis aparatów z SF6) dotyczą wyłącznie aparatów ISTNIEJĄCYCH. Model sieci niesie
stan obiektu (`StanObiektu`: ``ISTNIEJACY`` / ``PROJEKTOWANY``) na polu rozdzielnicy i na
instancji aparatu pola (`enm.models.Bay.stan_obiektu`, `BayPrimaryDevice.stan_obiektu`): gaz
fluorowany jest dopuszczony WYŁĄCZNIE w obiekcie istniejącym. Nowe pole dobudowane do
istniejącej rozdzielnicy SF6 jest projektowane, a aparat wymieniony w istniejącym polu jest nową
instancją (projektowaną) — w obu przypadkach bez SF6. Stan nieustalony (``None`` — rekord sprzed
atrybutu) NIE jest stanem istniejącym: brak danej nie zwalnia z zakazu.

Moduł jest LIŚCIEM (wyłącznie stdlib + typing): czytają go rodziny rozdzielnic, katalog aparatów,
operacje domenowe, walidator modelu i API bez cyklu importów.
"""

from __future__ import annotations

from typing import Literal, get_args

__all__ = [
    "AKCJA_NAPRAWCZA_GAZU_FLUOROWANEGO_PL",
    "KOD_ODMOWY_GAZU_FLUOROWANEGO",
    "MEDIA_ZE_GAZEM_FLUOROWANYM",
    "NAZWY_STANOW_OBIEKTU_PL",
    "PODSTAWA_ZAKAZU_GAZU_FLUOROWANEGO",
    "STANY_OBIEKTU",
    "StanObiektu",
    "czy_gaz_fluorowany_dopuszczony",
    "czy_medium_z_gazem_fluorowanym",
    "odmowa_gazu_fluorowanego_pl",
    "powod_odmowy_gazu_fluorowanego_pl",
    "powod_odmowy_medium_nieznanego_pl",
]

#: Stan obiektu sieci (pole rozdzielnicy, instancja aparatu pola): ``ISTNIEJACY`` — obiekt
#: zastany w sieci (ustawia go WYŁĄCZNIE jawna operacja „oznacz jako istniejący" albo import
#: istniejącej sieci niosący stan); ``PROJEKTOWANY`` — obiekt nowy, tworzony operacją
#: projektową (każda operacja tworząca nadaje go jawnie).
StanObiektu = Literal["ISTNIEJACY", "PROJEKTOWANY"]
STANY_OBIEKTU: tuple[str, ...] = get_args(StanObiektu)

NAZWY_STANOW_OBIEKTU_PL: dict[str, str] = {
    "ISTNIEJACY": "istniejący",
    "PROJEKTOWANY": "projektowany",
}

#: Media z fluorowanym gazem cieplarnianym w katalogu aparatów (``SwitchEquipmentType.medium``,
#: ``MVApparatusType.medium``). Zbiór obejmuje też mieszaniny z fluoronitrylem (``C4-FN``)
#: i fluoroketonem (``C5-FK``): są fluorowanymi gazami, więc zakaz „każdego F-gazu" obejmuje je
#: tak samo jak SF6.
MEDIA_ZE_GAZEM_FLUOROWANYM: frozenset[str] = frozenset({"SF6", "C4-FN", "C5-FK"})

PODSTAWA_ZAKAZU_GAZU_FLUOROWANEGO = (
    "rozporządzenie (UE) 2024/573, art. 13 ust. 9 lit. a (rozdzielnice SN do 24 kV, od "
    "2026-01-01) i lit. b (powyżej 24 kV do 52 kV, od 2030-01-01); dyrektywa właściciela "
    "2026-10-28 — nowe pola SN bez gazów fluorowanych w każdym napięciu; ENEA Zeszyt 1, §13 — "
    "wyłączniki z próżniowymi komorami gaszeniowymi"
)

#: Kod odmowy operacji domenowej (``error_code``) — jeden dla każdej drogi: utworzenie pola,
#: dobudowa pola do istniejącej rozdzielnicy, wymiana aparatu, przypisanie typu rozdzielnicy,
#: zmiana stanu obiektu.
KOD_ODMOWY_GAZU_FLUOROWANEGO = "pole.gaz_fluorowany"

AKCJA_NAPRAWCZA_GAZU_FLUOROWANEGO_PL = "wybierz wykonanie bez gazów fluorowanych"


def czy_medium_z_gazem_fluorowanym(medium: str | None) -> bool:
    """Czy medium pozycji katalogu aparatu zawiera gaz fluorowany.

    ``None`` (pozycja nie podaje medium) NIE jest gazem fluorowanym: każdy aparat łączeniowy SN
    przerywający prąd (wyłącznik, rozłącznik, reklozer) deklaruje medium wprost (pin
    `tests/network_model/catalog/test_gazy_fluorowane.py`), a medium niepodane mają wyłącznie
    aparaty bez komory gaszeniowej (odłącznik, uziemnik, bezpiecznik)."""
    return isinstance(medium, str) and medium.strip().upper() in MEDIA_ZE_GAZEM_FLUOROWANYM


def czy_gaz_fluorowany_dopuszczony(stan_obiektu: str | None) -> bool:
    """Gaz fluorowany jest dopuszczony WYŁĄCZNIE w obiekcie istniejącym (art. 13 ust. 9–10)."""
    return stan_obiektu == "ISTNIEJACY"


def powod_odmowy_gazu_fluorowanego_pl(co_pl: str) -> str:
    """Zdanie odmowy dla projektanta: co odmówiono, dlaczego (podstawa) i akcja naprawcza."""
    return (
        f"{co_pl} wykorzystuje gaz fluorowany (SF₆) w izolacji albo w gaszeniu łuku — obiekt "
        f"projektowany nie może go zawierać ({PODSTAWA_ZAKAZU_GAZU_FLUOROWANEGO}). "
        f"Akcja naprawcza: {AKCJA_NAPRAWCZA_GAZU_FLUOROWANEGO_PL}."
    )


def powod_odmowy_medium_nieznanego_pl(co_pl: str) -> str:
    """Zdanie odmowy dla pozycji, która nie potwierdza wykonania bez gazów fluorowanych."""
    return (
        f"{co_pl} nie potwierdza wykonania bez gazów fluorowanych — obiekt projektowany wymaga "
        f"potwierdzenia ({PODSTAWA_ZAKAZU_GAZU_FLUOROWANEGO}). Akcja naprawcza: "
        f"{AKCJA_NAPRAWCZA_GAZU_FLUOROWANEGO_PL}."
    )


def odmowa_gazu_fluorowanego_pl(
    co_pl: str, *, gaz_fluorowany: bool | None, stan_obiektu: str | None
) -> str | None:
    """JEDYNA reguła zakazu: zdanie odmowy albo ``None`` (wolno).

    ``gaz_fluorowany`` — ``True`` (pozycja z gazem fluorowanym), ``False`` (potwierdzone
    wykonanie bez gazu), ``None`` (pozycja nie rozstrzyga — dla obiektu projektowanego to też
    odmowa: brak potwierdzenia nie jest dowodem braku gazu). Obiekt istniejący — zawsze wolno
    (art. 13 ust. 10: przeniesienie istniejącej rozdzielnicy nie jest wprowadzeniem do użytku;
    ust. 7: serwis). Czytają ją: oferta rodzin i aparatów w API (filtr pickerów), strażnik
    operacji domenowych i walidator modelu — trzy miejsca, jedna reguła."""
    if czy_gaz_fluorowany_dopuszczony(stan_obiektu):
        return None
    if gaz_fluorowany is True:
        return powod_odmowy_gazu_fluorowanego_pl(co_pl)
    if gaz_fluorowany is None:
        return powod_odmowy_medium_nieznanego_pl(co_pl)
    return None
