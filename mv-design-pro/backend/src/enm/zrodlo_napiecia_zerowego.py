"""Źródło napięcia zerowego 3U₀ funkcji 67N pola SN — JEDNA reguła przypisania i oceny.

PO CO (decyzja właściciela 2026-10-29, karta UX-04/POLE-LINIOWE-WZORZEC). Zabezpieczenie
kierunkowe ziemnozwarciowe (67N) mierzy składową zerową prądu I0 i napięcia U0 (ENEA Operator,
„Stacje elektroenergetyczne 110 kV", Zeszyt 1 §26.9: „składowe zerowe prądu (I0) i napięcia
(U0)"). Szablon pola przypisywał 67N automatycznie, choć pole liniowe GPZ samo napięcia zerowego
nie mierzy — funkcja bez wejścia była fikcją. Rysunki standardu wskazują źródło wprost:

* Z.10 (s.89) i Z.11.1 (s.91) — blok „Zab. ziemnozwarciowe" ma dwa wejścia: przekładnik
  Ferrantiego 1/100 (I0) i obwód okrężny „Z, Zz" (U0); przekładnik napięciowy Z.11.1 (trzy
  uzwojenia w gwieździe 0,1/√3) zasila bloki U>/U< i f</f>/df/dt, nie blok ziemnozwarciowy;
* Z.17 (s.97) — pole pomiaru napięcia SN: przekładnik SN/√3 / 0,1/√3 / 0,1/√3 / 0,1/3, uzwojenie
  III (15 VA, kl. 3P) w otwartym trójkącie zasila wejście Uo> sterownika pola i WYCHODZI na obwód
  okrężny „Z,Zz"; §13 — „pola pomiaru napięcia po jednym w każdej sekcji".

WARUNEK przypisania 67N (`bay_templates.WARUNEK_ZRODLA_U0`) — oba składniki naraz:

1. kryterium prądowe I0 — przekładnik Ferrantiego (aparat ``CORE_BALANCE_CT``) w polu;
2. źródło U0 POTWIERDZONE w modelu — `Bay.zrodlo_u0_ref` (deklaracja projektanta) wskazuje
   przekładnik napięciowy (aparat ``VT``) z uzwojeniem otwartego trójkąta
   (`UzwojeniePrzekladnikaNapieciowego.otwarty_trojkat`) w polu pomiaru napięcia szyn
   (rola ``MEASUREMENT``, funkcja pomiaru ``NAPIECIA_SZYN``) na TEJ SAMEJ szynie sekcji co pole
   albo w tym samym polu.

Pole pomiaru napięcia szyn w sekcji bez powiązania NIE jest potwierdzeniem: to projektant wiąże
obwód okrężny pola ze źródłem (system podaje kandydatów — ZASADA NR 4: proponuje, nie zgaduje).

JEDNO ŹRÓDŁO dla: przypisania funkcji (resolver szablonu przy zapisie wyposażenia pola),
odmowy operacji (powiązanie z aparatem, który źródłem nie jest), oceny funkcji pola liniowego
(`enm.pole_liniowe_gpz` — status ``NIE_OCENIONO`` z listą braków, nigdy „spełnia") i walidatora
modelu (W064 — 67N zadeklarowana bez potwierdzonego źródła). Moduł jest regułą czystą (bez stanu),
deterministyczną (kandydaci w kolejności identyfikatorów).
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Any, Literal

from network_model.catalog.bay_templates import WARUNEK_ZRODLA_U0, WARUNKI_FUNKCJI_EAZ
from network_model.catalog.rodzaje_aparatury import RODZAJ_PRZEKLADNIKA_FERRANTIEGO

from .slownik_komunikatow import opis_elementu

__all__ = [
    "AKCJA_NAPRAWCZA_ZRODLA_U0_PL",
    "FUNKCJA_POMIARU_NAPIECIA_SZYN",
    "KOD_WALIDATORA_ZRODLA_U0",
    "KOD_ZRODLA_U0_NIEPOPRAWNEGO",
    "PODSTAWA_ZRODLA_U0",
    "KandydatZrodlaU0",
    "KodBrakuZrodlaU0",
    "NaruszenieZrodlaU0",
    "ZrodloU0Pola",
    "funkcje_bez_zrodla_u0",
    "funkcje_warunkowe_szablonu_pola",
    "kandydaci_zrodla_u0",
    "naruszenia_zrodla_u0",
    "warunki_funkcji_eaz_pola",
    "zrodlo_u0_pola",
]

#: Kod walidatora modelu — kanon gotowości `bay.earth_fault_u0_source_unconfirmed`
#: (`domain.readiness_bridge`).
KOD_WALIDATORA_ZRODLA_U0 = "W064"
#: Kod odmowy operacji `set_bay_equipment`: wskazany aparat nie jest źródłem 3U₀ pola.
KOD_ZRODLA_U0_NIEPOPRAWNEGO = "bay_equipment.zrodlo_u0_niepoprawne"
#: Funkcja pola pomiarowego „pomiar napięcia szyn" (`domain_operations.FUNKCJE_POMIARU_SN`).
FUNKCJA_POMIARU_NAPIECIA_SZYN = "NAPIECIA_SZYN"

PODSTAWA_ZRODLA_U0 = (
    "ENEA Zeszyt 1 §26.9; Z.10 (s.89) i Z.11.1 (s.91) — wejścia bloku zabezpieczenia "
    "ziemnozwarciowego: przekładnik Ferrantiego 1/100 i obwód okrężny „Z, Zz”; Z.17 (s.97) — "
    "uzwojenie III przekładnika pola pomiaru napięcia 0,1/3 w otwartym trójkącie na obwód „Z,Zz”"
)

AKCJA_NAPRAWCZA_ZRODLA_U0_PL = (
    "powiąż wejście napięcia zerowego pola (obwód okrężny „Z, Zz”) z przekładnikiem napięciowym "
    "pola pomiaru napięcia szyn tej sekcji (ENEA Z.17) w wyposażeniu pola na karcie pola — "
    "albo usuń funkcję 67N z zestawu funkcji pola"
)

_RODZAJ_VT = "VT"

#: Kod maszynowy braku warunku 67N — jeden na każdy wpis ``czego_brakuje`` (ta sama kolejność).
KodBrakuZrodlaU0 = Literal[
    "BRAK_FERRANTIEGO",
    "BRAK_POWIAZANIA",
    "BRAK_POLA_POMIARU_NAPIECIA",
    "APARAT_NIEOBECNY",
    "APARAT_NIE_JEST_VT",
    "BRAK_OTWARTEGO_TROJKATA",
    "POLE_NIE_MIERZY_SZYN",
    "INNA_SEKCJA",
]


@dataclass(frozen=True)
class KandydatZrodlaU0:
    """Przekładnik, który może być źródłem 3U₀ pola — propozycja dla projektanta (nie
    powiązanie): aparat, jego pole i opis z tabliczki uzwojenia otwartego trójkąta."""

    vt_ref: str
    pole_ref: str
    opis_pl: str


@dataclass(frozen=True)
class ZrodloU0Pola:
    """Rozstrzygnięcie źródła 3U₀ i kryterium I0 jednego pola — rekord wyjaśnialny.

    ``potwierdzone`` — oba składniki warunku spełnione. ``vt_ref`` / ``pole_zrodla_ref`` —
    przekładnik źródła i jego pole (gdy powiązanie wskazuje poprawne źródło), ``uzwojenie_pl`` —
    tabliczka uzwojenia otwartego trójkąta. ``kandydaci`` — przekładniki z uzwojeniem otwartego
    trójkąta w polach pomiaru napięcia szyn tej sekcji (propozycja dla projektanta).
    ``czego_brakuje`` — konkretne braki (puste, gdy potwierdzone): ``braki_zrodla`` (składnik U0
    — powiązanie i jego poprawność) i brak kryterium prądowego I0; ``kody_brakow`` — te same braki
    kodem maszynowym (`KodBrakuZrodlaU0`, kolejność ``czego_brakuje``; lustro reguły na schemacie
    SLD — `ui/sld/v2/model/zrodloNapieciaZerowego.ts`, parytet
    `tests/ci/test_parytet_zrodla_u0.py`); ``przyczyna_pl`` — zdanie."""

    potwierdzone: bool
    vt_ref: str | None
    pole_zrodla_ref: str | None
    uzwojenie_pl: str | None
    ferranti: bool
    kandydaci: tuple[KandydatZrodlaU0, ...]
    braki_zrodla: tuple[str, ...]
    czego_brakuje: tuple[str, ...]
    kody_brakow: tuple[KodBrakuZrodlaU0, ...]
    przyczyna_pl: str


def _lista(enm: Mapping[str, Any], nazwa: str) -> list[Mapping[str, Any]]:
    return [e for e in enm.get(nazwa) or [] if isinstance(e, Mapping)]


def _aparaty(pole: Mapping[str, Any]) -> list[Mapping[str, Any]]:
    return [a for a in pole.get("primary_devices") or [] if isinstance(a, Mapping)]


def _uzwojenie_otwartego_trojkata(aparat: Mapping[str, Any]) -> Mapping[str, Any] | None:
    for uzwojenie in aparat.get("uzwojenia") or []:
        if isinstance(uzwojenie, Mapping) and uzwojenie.get("otwarty_trojkat") is True:
            return uzwojenie
    return None


def _czy_pole_pomiaru_napiecia_szyn(pole: Mapping[str, Any]) -> bool:
    return (
        pole.get("bay_role") == "MEASUREMENT"
        and pole.get("funkcja_pomiaru") == FUNKCJA_POMIARU_NAPIECIA_SZYN
    )


def _opis_uzwojenia(uzwojenie: Mapping[str, Any]) -> str:
    return (
        f"{uzwojenie.get('przekladnia')}, {uzwojenie.get('moc_va')} VA, "
        f"kl. {uzwojenie.get('klasa')}, otwarty trójkąt"
    )


def kandydaci_zrodla_u0(
    enm: Mapping[str, Any], pole: Mapping[str, Any]
) -> tuple[KandydatZrodlaU0, ...]:
    """Przekładniki napięciowe z uzwojeniem otwartego trójkąta, które MOGĄ być źródłem 3U₀ pola:
    w polach pomiaru napięcia szyn na szynie sekcji pola oraz w samym polu. Kolejność
    identyfikatorów aparatów (deterministyczna)."""
    szyna = pole.get("bus_ref")
    wynik: dict[str, KandydatZrodlaU0] = {}
    for inne in _lista(enm, "bays"):
        if inne.get("ref_id") != pole.get("ref_id") and not (
            _czy_pole_pomiaru_napiecia_szyn(inne) and inne.get("bus_ref") == szyna
        ):
            continue
        for aparat in _aparaty(inne):
            uzwojenie = _uzwojenie_otwartego_trojkata(aparat)
            ref = aparat.get("device_ref")
            if aparat.get("kind") != _RODZAJ_VT or uzwojenie is None or not isinstance(ref, str):
                continue
            wynik[ref] = KandydatZrodlaU0(
                vt_ref=ref,
                pole_ref=str(inne.get("ref_id")),
                opis_pl=(
                    f"przekładnik {_oznaczenie_aparatu(aparat)} "
                    f"w {opis_elementu(dict(enm), inne.get('ref_id'), 'polu')} "
                    f"({_opis_uzwojenia(uzwojenie)})"
                ),
            )
    return tuple(wynik[ref] for ref in sorted(wynik))


def _aparat_i_pole(
    enm: Mapping[str, Any], device_ref: str
) -> tuple[Mapping[str, Any], Mapping[str, Any]] | None:
    for pole in _lista(enm, "bays"):
        for aparat in _aparaty(pole):
            if aparat.get("device_ref") == device_ref:
                return aparat, pole
    return None


def zrodlo_u0_pola(
    enm: Mapping[str, Any], pole: Mapping[str, Any], zrodlo_ref: object = ...
) -> ZrodloU0Pola:
    """Rozstrzygnięcie warunku 67N pola. ``zrodlo_ref`` — powiązanie do sprawdzenia (operacja
    sprawdza wartość z ładunku przed zapisem); domyślnie `Bay.zrodlo_u0_ref` rekordu pola."""
    ref = pole.get("zrodlo_u0_ref") if zrodlo_ref is ... else zrodlo_ref
    opis_pola = opis_elementu(dict(enm), pole.get("ref_id"), "pola")
    kandydaci = kandydaci_zrodla_u0(enm, pole)
    ferranti = any(a.get("kind") == RODZAJ_PRZEKLADNIKA_FERRANTIEGO for a in _aparaty(pole))
    braki_i0: list[tuple[KodBrakuZrodlaU0, str]] = []
    if not ferranti:
        braki_i0.append(
            (
                "BRAK_FERRANTIEGO",
                "przekładnik Ferrantiego w polu — kryterium prądowe I0 zabezpieczenia "
                "ziemnozwarciowego (ENEA Z.10 s.89, Z.11.1 s.91)",
            )
        )
    braki: list[tuple[KodBrakuZrodlaU0, str]] = []
    vt_ref: str | None = None
    pole_zrodla_ref: str | None = None
    uzwojenie_pl: str | None = None
    if not isinstance(ref, str) or not ref.strip():
        if kandydaci:
            braki.append(
                (
                    "BRAK_POWIAZANIA",
                    "powiązanie wejścia napięcia zerowego pola (obwód okrężny „Z, Zz”) "
                    "z przekładnikiem napięciowym pola pomiaru napięcia szyn tej sekcji — "
                    "potwierdzenie projektanta",
                )
            )
        else:
            braki.append(
                (
                    "BRAK_POLA_POMIARU_NAPIECIA",
                    "pole pomiaru napięcia szyn w tej sekcji z przekładnikiem napięciowym "
                    "o uzwojeniu otwartego trójkąta (ENEA Zeszyt 1, Z.17 s.97; §13 — po jednym "
                    "polu pomiaru napięcia w każdej sekcji)",
                )
            )
    else:
        znaleziony = _aparat_i_pole(enm, ref.strip())
        if znaleziony is None:
            braki.append(
                (
                    "APARAT_NIEOBECNY",
                    "przekładnik napięciowy wskazany jako źródło 3U₀ — nie ma go w modelu "
                    "(pole pomiaru napięcia usunięte albo przebudowane)",
                )
            )
        else:
            aparat, pole_zrodla = znaleziony
            uzwojenie = _uzwojenie_otwartego_trojkata(aparat)
            to_samo_pole = pole_zrodla.get("ref_id") == pole.get("ref_id")
            if aparat.get("kind") != _RODZAJ_VT:
                braki.append(
                    (
                        "APARAT_NIE_JEST_VT",
                        "źródło 3U₀ wskazujące przekładnik napięciowy — wskazany aparat nim nie "
                        "jest",
                    )
                )
            elif uzwojenie is None:
                braki.append(
                    (
                        "BRAK_OTWARTEGO_TROJKATA",
                        "uzwojenie otwartego trójkąta (0,1/3) we wskazanym przekładniku "
                        "napięciowym — bez niego przekładnik nie mierzy napięcia zerowego 3U₀",
                    )
                )
            elif not to_samo_pole and not _czy_pole_pomiaru_napiecia_szyn(pole_zrodla):
                braki.append(
                    (
                        "POLE_NIE_MIERZY_SZYN",
                        "źródło 3U₀ w polu pomiaru napięcia szyn — wskazany przekładnik leży "
                        f"w {opis_elementu(dict(enm), pole_zrodla.get('ref_id'), 'polu')}, "
                        "które nie mierzy napięcia szyn",
                    )
                )
            elif not to_samo_pole and pole_zrodla.get("bus_ref") != pole.get("bus_ref"):
                braki.append(
                    (
                        "INNA_SEKCJA",
                        "źródło 3U₀ w tej samej sekcji szyn — obwód okrężny „Z, Zz” nie "
                        "przechodzi między sekcjami, a wskazane pole pomiaru napięcia leży na "
                        "innej szynie",
                    )
                )
            else:
                vt_ref = str(aparat.get("device_ref"))
                pole_zrodla_ref = str(pole_zrodla.get("ref_id"))
                uzwojenie_pl = _opis_uzwojenia(uzwojenie)
    potwierdzone = not braki and not braki_i0
    if potwierdzone:
        przyczyna = (
            f"źródło 3U₀ {opis_pola} potwierdzone: przekładnik "
            f"{_oznaczenie(enm, vt_ref)} w "
            f"{opis_elementu(dict(enm), pole_zrodla_ref, 'polu')} ({uzwojenie_pl}); "
            "kryterium prądowe — przekładnik Ferrantiego pola"
        )
    else:
        przyczyna = (
            f"źródło 3U₀ {opis_pola} niepotwierdzone — funkcja 67N nie mierzy napięcia zerowego "
            f"bez tego źródła ({PODSTAWA_ZRODLA_U0})"
        )
    return ZrodloU0Pola(
        potwierdzone=potwierdzone,
        vt_ref=vt_ref,
        pole_zrodla_ref=pole_zrodla_ref,
        uzwojenie_pl=uzwojenie_pl,
        ferranti=ferranti,
        kandydaci=kandydaci,
        braki_zrodla=tuple(tekst for _, tekst in braki),
        czego_brakuje=tuple(tekst for _, tekst in braki_i0 + braki),
        kody_brakow=tuple(kod for kod, _ in braki_i0 + braki),
        przyczyna_pl=przyczyna,
    )


def _oznaczenie_aparatu(aparat: Mapping[str, Any]) -> str:
    """Oznaczenie przekładnika w tekście dla projektanta: oznaczenie z modelu, a bez niego
    polskie słowo rodzaju („przekładnik napięciowy”) — nigdy identyfikator aparatu
    (`scripts/nazwa_bez_identyfikatora_guard.py`, jedna reguła opisu kandydata i źródła)."""
    oznaczenie = aparat.get("designation")
    return oznaczenie if isinstance(oznaczenie, str) and oznaczenie.strip() else "napięciowy"


def _oznaczenie(enm: Mapping[str, Any], device_ref: str | None) -> str:
    znaleziony = _aparat_i_pole(enm, device_ref) if device_ref is not None else None
    return _oznaczenie_aparatu(znaleziony[0]) if znaleziony is not None else "napięciowy"


def warunki_funkcji_eaz_pola(enm: Mapping[str, Any], pole: Mapping[str, Any]) -> frozenset[str]:
    """Warunki funkcji warunkowych (`bay_templates.WARUNKI_FUNKCJI_EAZ`) spełnione w modelu dla
    pola — wejście resolvera zestawu funkcji (`_resolve_bay_template_protection_codes`)."""
    if zrodlo_u0_pola(enm, pole).potwierdzone:
        return frozenset({WARUNEK_ZRODLA_U0})
    return frozenset()


def funkcje_warunkowe_szablonu_pola(pole: Mapping[str, Any]) -> tuple[str, ...]:
    """Funkcje warunkowe (źródło 3U₀), które szablon pola przypisałby przy spełnionym warunku —
    ten sam resolver co zapis wyposażenia (producent → szablon → rola), z kompletem warunków.
    Puste — pole, którego szablon żadnej funkcji warunkowej nie niesie (powiązanie źródła
    niczego by nie zmieniło, więc karta pola go nie proponuje)."""
    # Import w funkcji: `domain_operations_v2` importuje ten moduł na szczycie.
    from .domain_operations_v2 import _resolve_bay_template_protection_codes

    kody = _resolve_bay_template_protection_codes(
        pole.get("manufacturer_ref"),
        pole.get("bay_template_ref"),
        str(pole.get("bay_role")),
        pole.get("klasa_pola"),
        frozenset(WARUNKI_FUNKCJI_EAZ.values()),
    )
    return funkcje_bez_zrodla_u0(kody)


def funkcje_bez_zrodla_u0(kody: Iterable[object]) -> tuple[str, ...]:
    """Kody funkcji pola, których warunkiem jest źródło 3U₀ (w kolejności zestawu)."""
    return tuple(str(kod) for kod in kody if WARUNKI_FUNKCJI_EAZ.get(str(kod)) == WARUNEK_ZRODLA_U0)


@dataclass(frozen=True)
class NaruszenieZrodlaU0:
    """Pole z zapisaną funkcją warunkową (67N), której warunek nie jest spełniony w modelu —
    rekord walidatora W064 (powiązanie nieaktualne po przebudowie pola pomiaru napięcia, import,
    model sprzed reguły)."""

    bay_ref: str
    funkcje: tuple[str, ...]
    czego_brakuje: tuple[str, ...]
    komunikat_pl: str


def naruszenia_zrodla_u0(enm: Mapping[str, Any]) -> list[NaruszenieZrodlaU0]:
    """Pola z funkcją 67N zapisaną bez potwierdzonego źródła 3U₀ — w kolejności pól modelu."""
    wynik: list[NaruszenieZrodlaU0] = []
    for pole in _lista(enm, "bays"):
        funkcje = funkcje_bez_zrodla_u0(pole.get("protection_codes") or [])
        if not funkcje:
            continue
        zrodlo = zrodlo_u0_pola(enm, pole)
        if zrodlo.potwierdzone:
            continue
        opis = opis_elementu(dict(enm), pole.get("ref_id"), "Pole")
        wynik.append(
            NaruszenieZrodlaU0(
                bay_ref=str(pole.get("ref_id")),
                funkcje=funkcje,
                czego_brakuje=zrodlo.czego_brakuje,
                komunikat_pl=(
                    f"{opis} ma funkcję {', '.join(funkcje)} (zabezpieczenie ziemnozwarciowe "
                    "kierunkowe) bez potwierdzonego źródła napięcia zerowego 3U₀ — brakuje: "
                    f"{'; '.join(zrodlo.czego_brakuje)}. Funkcja bez wejścia U0 niczego nie mierzy "
                    f"({PODSTAWA_ZRODLA_U0})."
                ),
            )
        )
    return wynik
