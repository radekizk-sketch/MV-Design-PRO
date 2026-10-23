"""Czas wyłączenia zwarcia PER POLE STACJI z nastaw zabezpieczeń (karta KD-6, poz. 3).

DŁUG, KTÓRY TO ZAMYKA (nazwany w odbiorze V12K-291). Kryterium cieplne
wytrzymałości aparatury (I_th ≤ I_th_zn·√(min(1, t_zn/t_wył))) potrzebuje czasu
wyłączenia. Do tej karty czas brał się WYŁĄCZNIE z liczby WPISANEJ RĘCZNIE w
konfiguracji stacji — czyli werdykt cieplny opierał się na deklaracji
projektanta, choć wyglądał jak wynik z modelu. Model tymczasem niesie nastawy
zabezpieczeń pola, a katalog aparatu — jego czas własny (albo, gdy karta go nie podaje,
rejestr wartości roboczych — wartość robocza z jawnym źródłem).

CO ROBI TEN MODUŁ: dla każdego pola stacji składa czas wyłączenia z DWÓCH
członów, obu pochodzących z danych:

    t_wył = t_nastawy(charakterystyka, prąd zwarciowy) + t_własny(aparat)

WARSTWA ANALIZ, NIE SOLVER: żaden wzór nie powstaje tutaj. Nastawy i czas członu
nastawczego pochodzą z JEDNEJ ścieżki oceny nadprądowej
(``protection/ocena_nadpradowa.py``: ``rozwiaz_nastawy`` — jednostka progu, przekładnia
przekładnika, zakresy katalogu; ``czas_urzadzenia`` — rdzeń IEC 60255, najszybszy stopień,
który ruszył), tak samo jak dla gałęzi — jedna reguła, nie dwie. Czas własny pochodzi z
JEDNEGO rozstrzygnięcia parametrów aparatu (``aparaty_pol.parametry_aparatu``: wartość
projektanta na elemencie modelu > karta katalogowa APARAT_SN > propozycja rejestru wartości
roboczych) — z pochodzeniem w odpowiedzi.

PRĄD PER POLE (karta WYTRZYMALOSC-PRAD-POLA): prąd, przy którym sprawdzana jest
charakterystyka, to prąd zwarcia trójfazowego w punkcie zabudowy TEGO pola, wzięty z wiersza
zapisanego biegu (``ik_pol_ka`` kluczowane referencją pola — buduje je
``wytrzymalosc_aparatury_pol.prady_pol_z_biegu``). Dawniej jedna liczba z żądania
obsługiwała wszystkie pola stacji, więc charakterystyka odwrotna pola po stronie innej
sekcji albo innego napięcia liczyła czas przy cudzym prądzie. Przyjęcie pełnego prądu
punktu zabudowy jako prądu aparatu pola jest jawnym założeniem w odpowiedzi
(``zalozenia_pl``). Sumowanie dwóch czasów NIE jest fizyką — to definicja czasu trwania
zwarcia (IEC 60909-0 § 4.7).

ZERO HEURYSTYK I ZERO FABRYKACJI:
  - brak nastaw / brak prądu / prąd poniżej rozruchu ⇒ czas ``None`` z kodem
    gotowości i powodem po polsku (NIGDY wartość zastępcza),
  - brak czasu własnego wyłącznika w KARCIE katalogowej NIE blokuje czasu wyłączenia (zasada
    nr 4, V12K-351): człon nastawczy powiększa wartość ROBOCZA czasu własnego (profil typowy
    wyłącznika próżniowego SN z rejestru albo wartość nadana przez projektanta), a odpowiedź
    niesie jej pochodzenie i zdanie o wpływie (``czas_wlasny``, ``zalozenia_pl``). Nigdy SAM
    człon nastawczy — krótszy czas dawałby wyższy limit cieplny (karta WYTRZYMALOSC-PRAD-POLA).
  - kod ``READINESS_BRAK_CZASU_WLASNEGO`` zostaje WYŁĄCZNIE dla braku MODELU: wyłącznik
    otwierany przez zabezpieczenie nie leży w polu, jego pozycji nie ma w katalogu albo
    zabezpieczenie otwiera aparat, który nie przerywa zwarcia (czas własny nie dotyczy).
  - czas własny pochodzi wyłącznie z pozycji katalogu WYŁĄCZNIKA, który to zabezpieczenie
    otwiera (``ProtectionAssignment.breaker_ref``) — nie z pierwszego aparatu pola, który
    akurat niesie liczbę (odłącznik nie wyłącza zwarcia).

WHITE BOX: odpowiedź niesie oba człony osobno, nastawę (funkcja, próg, krzywa,
mnożnik), stałe charakterystyki użyte w rachunku i prąd, przy którym czas
policzono.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from application.analyses.aparaty_pol import (
    AparatPola,
    aparaty_pol_stacji,
    parametry_aparatu,
    znajdz_stacje,
)
from application.analyses.protection.ocena_nadpradowa import czas_urzadzenia, rozwiaz_nastawy
from application.field_read_model import collect_bays
from enm.mapping import ref_to_graph_id
from enm.models import Bay, EnergyNetworkModel, ProtectionAssignment
from enm.nazwy_elementow import nazwa_elementu
from enm.tor_pola import szyna_raportowa
from network_model.catalog.wartosci_robocze import (
    PARAMETR_CZAS_WLASNY,
    WartoscRozstrzygnieta,
    liczba_pl,
)
from network_model.core.czas_wylaczenia import (
    POCHODZENIE_TB_Z_POL,
    CzasWylaczeniaTb,
    czas_tb_roboczy,
)
from network_model.pochodne import ka_na_a

# ---------------------------------------------------------------------------
# Kody gotowości i źródła — brak nazwany wprost
# ---------------------------------------------------------------------------

READINESS_BRAK_PRADU = "aparatura.brak_pradu_poczatkowego"
READINESS_BRAK_APARATU = "aparatura.pole_bez_aparatu"
READINESS_BRAK_NASTAW = "aparatura.brak_nastaw_pola"
READINESS_PONIZEJ_ROZRUCHU = "aparatura.prad_ponizej_rozruchu"
READINESS_BRAK_CZASU_WLASNEGO = "aparatura.brak_czasu_wlasnego_wylacznika"

ZRODLO_NASTAWY_POLA = "nastawy_pola"

_ZALOZENIE_PRADU_POLA = (
    "Charakterystykę zabezpieczenia sprawdzono przy prądzie zwarcia trójfazowego w punkcie "
    "zabudowy pola (szyna pola, wiersz zapisanego biegu) — pełny prąd punktu przyjęty jako "
    "prąd przekaźnika pola."
)


def _bez_czasu(kod: str, powod_pl: str, **slad: Any) -> dict[str, Any]:
    return {
        "t_clearing_s": None,
        "zrodlo": None,
        "powod_pl": powod_pl,
        "czlon_nastawczy_s": None,
        "czas_wlasny_wylacznika_s": None,
        "czas_wlasny": None,
        "zalozenia_pl": [],
        "kody_gotowosci": [kod],
        **slad,
    }


def _przypisanie_pola(
    enm: EnergyNetworkModel, aparat_refy: set[str], protection_ref: str | None
) -> ProtectionAssignment | None:
    """Czynne zabezpieczenie pola: po wyłączniku pola albo po ``protection_ref``.

    Kolejność deterministyczna (po ``ref_id``), żeby pole z dwoma przypisaniami
    zawsze dawało ten sam czas.
    """
    kandydaci = [
        wpis
        for wpis in sorted(enm.protection_assignments, key=lambda w: str(w.ref_id))
        if wpis.is_enabled
        and (wpis.breaker_ref in aparat_refy or (protection_ref and wpis.ref_id == protection_ref))
    ]
    if not kandydaci:
        return None
    return kandydaci[0]


def _czas_wlasny_aparatu(wylacznik: AparatPola) -> WartoscRozstrzygnieta | None:
    """Czas własny wyłącznika z JEDNEGO rozstrzygnięcia (``None`` = pozycji nie ma w katalogu)."""
    pozycja, parametry = parametry_aparatu(wylacznik)
    if pozycja is None:
        return None
    return parametry[PARAMETR_CZAS_WLASNY]


def _zalozenie_czasu_wlasnego(czas_wlasny: WartoscRozstrzygnieta) -> str:
    """Zdanie komentarza obliczeń o czasie własnym przyjętym jako wartość robocza."""
    assert czas_wlasny.wartosc is not None
    return (
        f"Czas własny wyłącznika {liczba_pl(czas_wlasny.wartosc)} s — "
        f"{czas_wlasny.opis_zrodla_pl()}"
    )


def czasy_wylaczenia_pol_stacji(
    *,
    enm: EnergyNetworkModel,
    station_ref: str,
    ik_pol_ka: Mapping[str, float | None],
) -> dict[str, dict[str, Any]]:
    """Czas wyłączenia dla każdego pola stacji, ze śladem pochodzenia.

    Args:
        enm: model (pola, aparaty, nastawy zabezpieczeń).
        station_ref: referencja stacji (``ref_id`` albo ``id``).
        ik_pol_ka: prąd zwarciowy początkowy w punkcie zabudowy KAŻDEGO pola [kA],
            kluczowany referencją pola — przy nim sprawdzana jest charakterystyka
            zabezpieczenia tego pola. Brak wpisu albo ``None`` ⇒ czasu nie da się
            wyznaczyć (charakterystyka odwrotna zależy od prądu, a prądu nie zgadujemy
            ani nie pożyczamy od innego pola).

    Returns:
        Mapa referencja pola → rozbicie czasu wyłączenia. Pole bez rozstrzygnięcia
        dostaje ``t_clearing_s = None`` z kodem gotowości i powodem po polsku.
    """
    stacja = znajdz_stacje(enm, station_ref)
    if stacja is None:
        return {}

    aparaty = aparaty_pol_stacji(enm, stacja)
    wynik: dict[str, dict[str, Any]] = {}
    for bay in collect_bays(enm):
        if bay.substation_ref != stacja.ref_id:
            continue
        ik_pola = ik_pol_ka.get(bay.ref_id)
        wynik[bay.ref_id] = _czas_wylaczenia_pola(
            enm,
            bay,
            aparaty.get(bay.ref_id, []),
            ka_na_a(ik_pola) if ik_pola is not None else None,
        )
    return wynik


def _czas_wylaczenia_pola(
    enm: EnergyNetworkModel,
    bay: Bay,
    aparaty_pola: Sequence[AparatPola],
    prad_a: float | None,
) -> dict[str, Any]:
    """Czas wyłączenia JEDNEGO pola przy prądzie ``prad_a`` [A] — JEDYNE rozstrzygnięcie.

    Wołane przez widok pól stacji (``czasy_wylaczenia_pol_stacji``) i przez rozstrzygnięcie
    t_b punktu zwarcia z pól lokalnych (``czas_tb_z_pol_lokalnych``, karta
    TB-WARTOSC-ROBOCZA) — czas pola i t_b punktu nie mogą się rozjechać.
    """
    if not aparaty_pola:
        return _bez_czasu(
            READINESS_BRAK_APARATU,
            "Pole nie ma w modelu aparatu z katalogu, więc nie ma czym wyłączyć zwarcia.",
        )

    wpis = _przypisanie_pola(enm, {a.aparat_ref for a in aparaty_pola}, bay.protection_ref)
    if wpis is None:
        return _bez_czasu(
            READINESS_BRAK_NASTAW,
            "Aparat tego pola nie ma przypisanego czynnego zabezpieczenia, "
            "więc czas zadziałania jest niewyznaczalny.",
        )

    nazwa_zabezpieczenia = nazwa_elementu(wpis, "protection_assignments")
    nastawy = rozwiaz_nastawy(enm, wpis)
    if not nastawy.gotowe:
        return _bez_czasu(
            READINESS_BRAK_NASTAW,
            " ".join(b.komunikat_pl for b in nastawy.braki),
            urzadzenie_ref=wpis.ref_id,
            braki_nastaw=[b.to_dict() for b in nastawy.braki],
        )

    najczulszy = min(nastawy.stopnie, key=lambda s: (s.prog_pierwotny_a, s.funkcja))
    if prad_a is None:
        return _bez_czasu(
            READINESS_BRAK_PRADU,
            "Wynik biegu nie niesie prądu zwarciowego początkowego w punkcie zabudowy "
            "tego pola, więc nie ma przy jakim prądzie sprawdzić charakterystyki "
            "zabezpieczenia.",
            urzadzenie_ref=wpis.ref_id,
            funkcja=najczulszy.funkcja,
            prad_rozruchowy_a=najczulszy.prog_pierwotny_a,
        )

    slady_stopni, decydujacy = czas_urzadzenia(nastawy.stopnie, prad_a)
    odniesienie = decydujacy if decydujacy is not None else None
    slad: dict[str, Any] = {
        "urzadzenie_ref": wpis.ref_id,
        "urzadzenie_nazwa": wpis.name,
        "funkcja": (odniesienie or {}).get("funkcja", najczulszy.funkcja),
        "krzywa": (odniesienie or {}).get("krzywa", najczulszy.krzywa),
        "prad_rozruchowy_a": (odniesienie or {}).get("Is_a", najczulszy.prog_pierwotny_a),
        "prad_zwarciowy_a": prad_a,
        "tms": (odniesienie or {}).get("TMS", najczulszy.tms),
        "stala_a": ((odniesienie or {}).get("stale") or {}).get("A"),
        "stala_b": ((odniesienie or {}).get("stale") or {}).get("B"),
        "stopnie": slady_stopni,
    }

    if decydujacy is None:
        return _bez_czasu(
            READINESS_PONIZEJ_ROZRUCHU,
            f"Prąd zwarciowy {prad_a:.1f} A nie przekracza progu rozruchowego "
            f"{najczulszy.prog_pierwotny_a:g} A najczulszego stopnia "
            f"{najczulszy.etykieta_pl}, więc to zabezpieczenie nie zadziała.",
            **slad,
        )
    czas_nastawy = float(decydujacy["t_s"])
    krzywa_txt = str(decydujacy["krzywa"])

    wylacznik = next((a for a in aparaty_pola if a.aparat_ref == wpis.breaker_ref), None)
    pozycja_ref = wylacznik.catalog_ref if wylacznik is not None else None
    czas_wlasny = _czas_wlasny_aparatu(wylacznik) if wylacznik is not None else None
    opis_czlonu = (
        f"Czas stopnia {decydujacy['etykieta_pl']} ({krzywa_txt}) zabezpieczenia "
        f"{nazwa_zabezpieczenia} przy prądzie {prad_a:.1f} A"
    )
    if czas_wlasny is None or czas_wlasny.wartosc is None:
        # Brak MODELU (nie parametru urządzenia): wyłącznik poza polem, aparat spoza
        # katalogu albo aparat, który nie przerywa zwarcia. Czas wyłączenia = człon
        # nastawczy + czas własny wyłącznika; bez drugiego członu czasu NIE MA (sam człon
        # jest krótszy, więc dawałby wyższy limit cieplny). Człon zostaje jako ślad.
        if wylacznik is None:
            powod_braku = (
                f"Wyłącznik otwierany przez zabezpieczenie {nazwa_zabezpieczenia} nie leży "
                "w tym polu, więc jego czasu własnego nie ma skąd odczytać"
            )
        elif czas_wlasny is None:
            powod_braku = (
                f"Aparat otwierany przez zabezpieczenie {nazwa_zabezpieczenia} nie ma "
                f"pozycji „{pozycja_ref}” w katalogu aparatów SN"
            )
        else:
            powod_braku = (
                f"Zabezpieczenie {nazwa_zabezpieczenia} otwiera aparat, który nie wyłącza "
                f"zwarcia: {czas_wlasny.powod_braku_pl}"
            )
        return {
            **_bez_czasu(
                READINESS_BRAK_CZASU_WLASNEGO,
                f"{opis_czlonu} wynosi {czas_nastawy:.6g} s. {powod_braku} — czasu "
                "wyłączenia zwarcia nie da się złożyć, a sam człon nastawczy zaniżyłby "
                "go i zawyżył limit cieplny aparatu.",
                **slad,
            ),
            "zrodlo": ZRODLO_NASTAWY_POLA,
            "czlon_nastawczy_s": czas_nastawy,
            "czas_wlasny_pozycja_ref": pozycja_ref,
            "czas_wlasny": czas_wlasny.to_dict() if czas_wlasny is not None else None,
            "zalozenia_pl": [_ZALOZENIE_PRADU_POLA],
        }

    zalozenia = [_ZALOZENIE_PRADU_POLA]
    if czas_wlasny.robocza:
        zalozenia.append(_zalozenie_czasu_wlasnego(czas_wlasny))
    return {
        "t_clearing_s": round(czas_nastawy + czas_wlasny.wartosc, 6),
        "zrodlo": ZRODLO_NASTAWY_POLA,
        "powod_pl": (
            f"{opis_czlonu} powiększony o czas własny wyłącznika"
            + (" (wartość robocza)." if czas_wlasny.robocza else ".")
        ),
        "czlon_nastawczy_s": czas_nastawy,
        "czas_wlasny_wylacznika_s": czas_wlasny.wartosc,
        "czas_wlasny_pozycja_ref": pozycja_ref,
        "czas_wlasny": czas_wlasny.to_dict(),
        "zalozenia_pl": zalozenia,
        "kody_gotowosci": [],
        **slad,
    }


# ---------------------------------------------------------------------------
# t_b punktu zwarcia z pól lokalnych (karta TB-WARTOSC-ROBOCZA, §0.1 (b))
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class PoleLokalne:
    """Pole stacji z aparatem katalogowym przyłączone do szyny punktu zwarcia."""

    bay: Bay
    aparaty: tuple[AparatPola, ...]


def pola_lokalne_wezlow(enm: EnergyNetworkModel) -> dict[str, tuple[PoleLokalne, ...]]:
    """Węzeł grafu zwarciowego → pola lokalne (wzorzec PowerFactory „break time: min. of
    local”).

    Punkt zabudowy pola = szyna pola, raportowana pod szyną niepomocniczą tego samego węzła
    elektrycznego (``szyna_raportowa`` — zacisk pola za zamkniętym aparatem to ta sama szyna,
    ta sama reguła co ``wytrzymalosc_aparatury_pol.prady_pol_z_biegu``); identyfikator węzła
    grafu z ``ref_to_graph_id`` (to samo przełożenie co mapowanie modelu na graf). Pole bez
    aparatu katalogowego nie ma czym wyłączyć zwarcia — nie jest polem lokalnym. Kolejność
    pól po referencji (determinizm).
    """
    migawka = enm.model_dump(mode="json")
    aparaty_stacji: dict[str, dict[str, list[AparatPola]]] = {}
    wynik: dict[str, list[PoleLokalne]] = {}
    for bay in sorted(collect_bays(enm), key=lambda b: b.ref_id):
        if bay.substation_ref not in aparaty_stacji:
            stacja = znajdz_stacje(enm, bay.substation_ref)
            aparaty_stacji[bay.substation_ref] = (
                aparaty_pol_stacji(enm, stacja) if stacja is not None else {}
            )
        aparaty_pola = aparaty_stacji[bay.substation_ref].get(bay.ref_id, [])
        if not aparaty_pola:
            continue
        wezel = ref_to_graph_id(szyna_raportowa(migawka, bay.bus_ref))
        wynik.setdefault(wezel, []).append(PoleLokalne(bay=bay, aparaty=tuple(aparaty_pola)))
    return {wezel: tuple(pola) for wezel, pola in wynik.items()}


def _nazwa_pola(bay: Bay) -> str:
    return (bay.bay_number or nazwa_elementu(bay, "bays")).strip()


def czas_tb_z_pol_lokalnych(
    enm: EnergyNetworkModel,
    pola: Sequence[PoleLokalne],
    *,
    prad_a: float,
    rodzaj_zwarcia_pl: str,
) -> CzasWylaczeniaTb:
    """t_b punktu zwarcia = najmniejszy czas wyłączenia pól lokalnych (§0.1 (b)) albo wartość
    robocza (§0.1 (c)), gdy żadne pole lokalne nie daje czasu.

    Czas pola z ``_czas_wylaczenia_pola`` (człon nastawczy z oceny nadprądowej + czas własny
    wyłącznika z rejestru wartości roboczych) przy prądzie ``prad_a`` = I_k'' punktu zwarcia
    biegu (``ShortCircuitIEC60909Solver.prad_poczatkowy_a`` — ta sama liczba co ``ikss_a``
    wiersza). Czas własny będący wartością roboczą przenosi się na t_b (``robocza``, jakość
    ``ESTIMATED``). Równe czasy rozstrzyga referencja pola (determinizm).
    """
    if not pola:
        return czas_tb_roboczy(
            "do szyny punktu zwarcia nie jest przyłączone żadne pole stacji z aparatem "
            "z katalogu"
        )
    czasy = [(pole, _czas_wylaczenia_pola(enm, pole.bay, pole.aparaty, prad_a)) for pole in pola]
    z_czasem = [(pole, czas) for pole, czas in czasy if czas["t_clearing_s"] is not None]
    if not z_czasem:
        powody = "; ".join(
            f"pole {_nazwa_pola(pole.bay)} — {str(czas['powod_pl']).rstrip('.')}"
            for pole, czas in czasy
        )
        return czas_tb_roboczy(
            "żadne pole z wyłącznikiem przyłączone do szyny punktu zwarcia nie daje czasu "
            f"wyłączenia z nastaw zabezpieczenia ({powody})"
        )
    pole, czas = min(z_czasem, key=lambda pc: (float(pc[1]["t_clearing_s"]), pc[0].bay.ref_id))
    czas_wlasny = czas["czas_wlasny"]
    robocza = bool(czas_wlasny["wartosc_robocza"])
    nazwa = _nazwa_pola(pole.bay)
    t_b = float(czas["t_clearing_s"])
    opis = (
        f"t_b = {liczba_pl(t_b)} s — najkrótszy czas wyłączenia pól lokalnych punktu zwarcia "
        f"(pole {nazwa}, z {len(pola)} pól z aparatem przy szynie), suma członu nastawczego "
        f"{liczba_pl(float(czas['czlon_nastawczy_s']))} s ({str(czas['powod_pl']).rstrip('.')}) "
        f"i czasu własnego wyłącznika {liczba_pl(float(czas['czas_wlasny_wylacznika_s']))} s "
        f"({czas_wlasny['opis_zrodla_pl'].rstrip('.')}). Charakterystykę sprawdzono przy "
        f"prądzie I_k'' punktu zwarcia {rodzaj_zwarcia_pl} {liczba_pl(round(prad_a, 1))} A."
    )
    if robocza:
        opis += (
            " Czas własny wyłącznika jest wartością roboczą, więc t_b też — zmień t_b "
            "w scenariuszu zwarciowym albo nadaj czas własny wyłącznika, aby przeliczyć."
        )
    return CzasWylaczeniaTb(
        wartosc_s=t_b,
        pochodzenie=POCHODZENIE_TB_Z_POL,
        robocza=robocza,
        opis_pl=opis,
        pole_ref=pole.bay.ref_id,
        pole_nazwa=nazwa,
        zabezpieczenie_ref=str(czas["urzadzenie_ref"]),
        czlon_nastawczy_s=float(czas["czlon_nastawczy_s"]),
        czas_wlasny_s=float(czas["czas_wlasny_wylacznika_s"]),
        czas_wlasny_pochodzenie=czas_wlasny["pochodzenie"],
        prad_zwarciowy_a=float(prad_a),
    )
