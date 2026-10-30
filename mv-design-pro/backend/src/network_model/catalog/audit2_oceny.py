"""Rekordy werdyktu wyjaśnialnego kryteriów audytu 2 (karta WERDYKT-MIGRACJA-190, domena 8).

DLACZEGO TU. Reguły audytu 2 (`audit2_catalogs`) zwracały same rozstrzygnięcia — krotkę
``(bool, komunikat)``, słownik ``{"ok": …, "message_pl": "OK: …"}`` albo słowo statusu — a pakiet
dowodów, końcówki walidatorów, raport i ekrany wypisywały je jako „OK” / „BLOKER”. Kontrakt
werdyktu wyjaśnialnego (`docs/domain/KONTRAKT_WERDYKTU_WYJASNIALNEGO.md`) wymaga przy każdym
statusie pełnego rekordu: co oceniono, kryterium, wynik z jednostką, limit z podstawą i stanem
źródła, margines, przyczynę, dowód i zakres ważności. Ten moduł składa rekordy K (jedno
kryterium) i W (wymaganie wieloczłonowe) wspólnym budowniczym ``werdykt.porownanie`` — JEDNO
źródło rozstrzygnięcia dla końcówek ``/api/v1/catalog/audit2/validate-*``, pakietu dowodów
audytu 2 i oceny wytrzymałości aparatury pól stacji (`application/analyses/
wytrzymalosc_aparatury_pol.py`, która bierze stąd definicje kryteriów, podstawy i limit cieplny).

BRAK DANYCH ≠ SPEŁNIA. Brak wielkości daje ``NIE_OCENIONO`` z nazwanym brakiem, limit bez
podstawy — ``BRAK_PODSTAWY``, kryterium nie stosujące się — ``NIE_DOTYCZY`` z powodem.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any, Final

from network_model.core.uziemienie import ETYKIETA_PL_PUNKTU_NEUTRALNEGO, TypPunktuNeutralnego
from solver_input.provenance import classify_dynamic_capability
from werdykt import (
    DanaPrzyjeta,
    OcenaKryterium,
    OdnosnikSladu,
    PodstawaWymagania,
    Przedmiot,
    WynikWymagania,
    ZakresWaznosci,
    format_liczba,
)
from werdykt.porownanie import (
    DOTYCZY_OBIEKTU,
    Porownanie,
    ocena_porownania,
    podstawa_katalogu,
    podstawa_nieustalona,
    podstawa_normy,
    wymaganie_z_ocen,
)

#: Zdolność wytrzymałości zwarciowej aparatury w rejestrze dowodowym (`solver_input/provenance`).
ZDOLNOSC_WYTRZYMALOSCI: Final = "aparatura.wytrzymalosc_zwarciowa_pola"
#: Zdolność doboru przekładników (kryterium współczynnika napięciowego VT).
ZDOLNOSC_PRZEKLADNIKA: Final = "aparatura.dobor_przekladnika"
#: Zdolności kontroli konfiguracji stacji audytu 2.
ZDOLNOSC_TRYBOW_BESS: Final = "audyt2.tryby_pracy_magazynu"
ZDOLNOSC_PLANU_ZACZEPOW: Final = "audyt2.plan_zaczepow"
ZDOLNOSC_BILANSU_EKSPORTU: Final = "audyt2.bilans_eksportu_stacji"

#: Odniesienie dowodu rekordów tego modułu.
_ODNIESIENIE: Final = "network_model/catalog/audit2_oceny.py"


def _slad(krok: str, opis_pl: str) -> tuple[OdnosnikSladu, ...]:
    """Krok śladu WHITE BOX porównania (zestawienie wielkości z limitem w tym module)."""
    return (OdnosnikSladu(krok=krok, opis_pl=opis_pl),)


# ---------------------------------------------------------------------------
# Wytrzymałość zwarciowa aparatury (I_dyn / I_th) — definicje kryteriów JEDNE na system
# ---------------------------------------------------------------------------

IEC_62271_1: Final = (
    "IEC 62271-1 (PN-EN 62271-1) Wysokonapięciowa aparatura rozdzielcza i sterownicza"
)
IEC_62271_1_WYDANIE: Final = "2007"
IEC_60865_1: Final = "IEC 60865-1 (PN-EN 60865-1) Prądy zwarciowe — obliczanie skutków"
IEC_60865_1_WYDANIE: Final = "2011"

#: Jednostka redakcyjna normy aparatury dla każdej wielkości znamionowej.
PARAGRAF_ZNAMIENIA: Final[dict[str, str]] = {
    "i_dyn": "§ 4.6 znamionowy prąd szczytowy wytrzymywany I_p",
    "i_th": "§ 4.5 znamionowy prąd krótkotrwały wytrzymywany I_k i § 4.7 czas jego trwania t_k",
    "i_cu": (
        "znamionowa zdolność wyłączania zwarciowa I_cu (wyłącznik SN: IEC 62271-100 § 4.101 "
        "znamionowy prąd wyłączalny zwarciowy I_sc)"
    ),
}

PODSTAWA_WYTRZYMALOSCI_DYNAMICZNEJ: Final = PodstawaWymagania(
    rodzaj="NORMA",
    dokument=IEC_62271_1,
    wydanie=IEC_62271_1_WYDANIE,
    jednostka_redakcyjna=PARAGRAF_ZNAMIENIA["i_dyn"],
    status="WSKAZANE",
    uwagi_pl=(
        "aparat wytrzymuje dynamicznie zwarcie, gdy prąd udarowy w miejscu zabudowy nie "
        "przekracza jego znamionowego prądu szczytowego wytrzymywanego"
    ),
)

PODSTAWA_WYTRZYMALOSCI_CIEPLNEJ: Final = PodstawaWymagania(
    rodzaj="NORMA",
    dokument=IEC_60865_1,
    wydanie=IEC_60865_1_WYDANIE,
    jednostka_redakcyjna=(
        "wytrzymałość cieplna urządzeń elektrycznych: I_th ≤ I_thr dla T_k ≤ T_kr oraz "
        "I_th ≤ I_thr·√(T_kr/T_k) dla T_k ≥ T_kr"
    ),
    status="WSKAZANE",
    uwagi_pl=(
        "prąd cieplny zastępczy zwarcia porównany z prądem krótkotrwałym aparatu "
        "przeliczonym na czas wyłączenia; przy czasie krótszym od znamionowego limitem jest "
        "sam prąd znamionowy (bez przeliczenia w górę)"
    ),
)

OPIS_WYTRZYMALOSCI_DYNAMICZNEJ_PL: Final = (
    "Prąd udarowy zwarcia w punkcie zabudowy pola nie przekracza znamionowego prądu "
    "szczytowego wytrzymywanego aparatu"
)
WARUNEK_WYTRZYMALOSCI_DYNAMICZNEJ_LATEX: Final = r"i_p \le I_{dyn}"
OPIS_WYTRZYMALOSCI_CIEPLNEJ_PL: Final = (
    "Prąd cieplny zastępczy zwarcia w punkcie zabudowy pola nie przekracza prądu "
    "krótkotrwałego aparatu przeliczonego na czas wyłączenia zwarcia"
)
WARUNEK_WYTRZYMALOSCI_CIEPLNEJ_LATEX: Final = (
    r"I_{th} \le I_{thr}\sqrt{\min\left(1,\ \frac{T_{kr}}{T_k}\right)}"
)


def limit_cieplny_aparatu_ka(
    i_th_ka: float | None, i_th_duration_s: float | None, t_clearing_s: float | None
) -> float | None:
    """Prąd krótkotrwały aparatu przeliczony na czas wyłączenia [kA] — JEDNO miejsce reguły.

    IEC 60865-1: przeliczenie działa WYŁĄCZNIE w dół — aparat sprawdzony próbą I_thr przez T_kr
    nie jest przez to sprawdzony prądem większym przy czasie krótszym (karta
    WYTRZYMALOSC-PRAD-POLA). ``None`` — znamion albo czasu wyłączenia nie ustalono (brak danej
    nie jest limitem).
    """
    if (
        i_th_ka is None
        or i_th_ka <= 0
        or i_th_duration_s is None
        or i_th_duration_s <= 0
        or t_clearing_s is None
        or t_clearing_s <= 0
    ):
        return None
    if t_clearing_s <= i_th_duration_s:
        return i_th_ka
    return i_th_ka * math.sqrt(i_th_duration_s / t_clearing_s)


def zakres_wytrzymalosci(opis_pl: str) -> ZakresWaznosci:
    """Zakres ważności rekordów wytrzymałości aparatu — JEDEN dla K i W (W nie może być
    opisany szerzej niż składniki)."""
    return ZakresWaznosci(
        rodzaj_analizy="SHORT_CIRCUIT",
        opis_pl=opis_pl,
        wykluczenia=(
            "zwarcia niesymetryczne",
            "rozdział prądu zwarcia na gałęzie pola — porównany pełny prąd podany do oceny",
        ),
    )


def oceny_wytrzymalosci_aparatu(
    *,
    kryterium_id: str,
    przedmiot: Przedmiot,
    etykieta_pl: str,
    i_dyn_ka: float | None,
    i_th_ka: float | None,
    i_th_duration_s: float | None,
    i_peak_calculated_ka: float | None,
    i_thermal_calculated_ka: float | None,
    t_clearing_s: float | None,
    zakres_opis_pl: str,
    dane_dynamiczna: Sequence[DanaPrzyjeta] = (),
    dane_cieplna: Sequence[DanaPrzyjeta] = (),
    zdolnosc_id: str = ZDOLNOSC_WYTRZYMALOSCI,
    odniesienie: str = _ODNIESIENIE,
) -> tuple[OcenaKryterium, OcenaKryterium]:
    """Dwa rekordy K wytrzymałości aparatu ze znamion pozycji katalogu: dynamiczny
    (i_p ≤ I_dyn) i cieplny (I_th ≤ I_thr·√min(1, T_kr/T_k)).

    Znamiona są danymi karty katalogowej pozycji (``podstawa_katalogu``); nieznane znamię albo
    nieznany czas wyłączenia dają rekord ``NIE_OCENIONO``/``BRAK_PODSTAWY`` z nazwanym brakiem —
    „nie da się sprawdzić” to inny stan niż „nie wytrzymuje”.

    ``dane_dynamiczna`` / ``dane_cieplna`` — dane przyjęte, na których stoi porównywany prąd
    (wartości robocze biegu: tolerancja sieci nN, gałęzie, parametry maszyn) — rekord ma wtedy
    kompletność dowodu ``NIEPELNY``. ``zdolnosc_id`` / ``odniesienie`` — zdolność i moduł
    wołającego (walidator katalogu albo dowód doboru aparatury), gdy reguła jest ta sama.
    """
    zdolnosc = classify_dynamic_capability(zdolnosc_id)
    zakres = zakres_wytrzymalosci(zakres_opis_pl)
    braki_dyn: list[str] = []
    if i_dyn_ka is None or i_dyn_ka <= 0:
        braki_dyn.append(f"pozycja „{etykieta_pl}” nie niesie znamionowego prądu szczytowego I_dyn")
    dynamiczna = ocena_porownania(
        Porownanie(
            kryterium_id=f"{kryterium_id}.dynamiczna",
            opis_pl=OPIS_WYTRZYMALOSCI_DYNAMICZNEJ_PL,
            relacja="NIE_WIECEJ",
            wielkosc_pl="prąd udarowy zwarcia w punkcie zabudowy",
            warunek_latex=WARUNEK_WYTRZYMALOSCI_DYNAMICZNEJ_LATEX,
            symbol_latex=r"i_p",
            jednostka="kA",
            wynik=i_peak_calculated_ka,
            limit=i_dyn_ka if i_dyn_ka is not None and i_dyn_ka > 0 else None,
            limit_pl="znamionowy prąd szczytowy wytrzymywany aparatu I_dyn",
            braki=tuple(braki_dyn),
        ),
        przedmiot=przedmiot,
        podstawa=PODSTAWA_WYTRZYMALOSCI_DYNAMICZNEJ,
        podstawa_limitu=podstawa_katalogu(etykieta_pl, PARAGRAF_ZNAMIENIA["i_dyn"]),
        zdolnosc=zdolnosc,
        zakres=zakres,
        slad=_slad(
            f"{kryterium_id}.dynamiczna",
            "prąd udarowy podany do oceny wobec I_dyn pozycji katalogu",
        ),
        dane_przyjete=dane_dynamiczna,
        odniesienie=odniesienie,
    )
    limit_th = limit_cieplny_aparatu_ka(i_th_ka, i_th_duration_s, t_clearing_s)
    braki_th: list[str] = []
    if i_th_ka is None or i_th_duration_s is None:
        braki_th.append(
            f"pozycja „{etykieta_pl}” nie niesie prądu krótkotrwałego I_th z czasem t_th"
        )
    if t_clearing_s is None:
        braki_th.append("czas wyłączenia zwarcia nie jest ustalony")
    cieplna = ocena_porownania(
        Porownanie(
            kryterium_id=f"{kryterium_id}.cieplna",
            opis_pl=OPIS_WYTRZYMALOSCI_CIEPLNEJ_PL,
            relacja="NIE_WIECEJ",
            wielkosc_pl="prąd cieplny zastępczy zwarcia w punkcie zabudowy",
            warunek_latex=WARUNEK_WYTRZYMALOSCI_CIEPLNEJ_LATEX,
            symbol_latex=r"I_{th}",
            jednostka="kA",
            wynik=i_thermal_calculated_ka,
            limit=limit_th,
            # Opis limitu tylko przy komplecie wejść reguły (ten sam warunek, przy którym
            # `limit_cieplny_aparatu_ka` zwraca liczbę).
            limit_pl=(
                f"prąd krótkotrwały {format_liczba(i_th_ka)} kA / "
                f"{format_liczba(i_th_duration_s)} s przeliczony na czas wyłączenia "
                f"T_k = {format_liczba(t_clearing_s)} s"
                if limit_th is not None
                and i_th_ka is not None
                and i_th_duration_s is not None
                and t_clearing_s is not None
                else None
            ),
            braki=tuple(braki_th),
        ),
        przedmiot=przedmiot,
        podstawa=PODSTAWA_WYTRZYMALOSCI_CIEPLNEJ,
        podstawa_limitu=podstawa_katalogu(etykieta_pl, PARAGRAF_ZNAMIENIA["i_th"]),
        zdolnosc=zdolnosc,
        zakres=zakres,
        slad=_slad(
            f"{kryterium_id}.cieplna",
            "prąd cieplny podany do oceny wobec I_th przeliczonego na czas wyłączenia",
        ),
        dane_przyjete=dane_cieplna,
        odniesienie=odniesienie,
    )
    return dynamiczna, cieplna


def wymaganie_wytrzymalosci_aparatu(
    *,
    wymaganie_id: str,
    nazwa_pl: str,
    oceny: Sequence[OcenaKryterium],
    zakres: ZakresWaznosci,
) -> WynikWymagania:
    """Rekord W wytrzymałości zwarciowej aparatu nad rekordami składowymi (dynamicznym,
    cieplnym i — w ocenie pól stacji — zdolności wyłączania)."""
    return wymaganie_z_ocen(
        wymaganie_id=wymaganie_id,
        nazwa_pl=nazwa_pl,
        podstawa=PODSTAWA_WYTRZYMALOSCI_DYNAMICZNEJ,
        oceny=oceny,
        zdolnosc=classify_dynamic_capability(ZDOLNOSC_WYTRZYMALOSCI),
        zakres=zakres,
        odniesienie=_ODNIESIENIE,
    )


@dataclass(frozen=True)
class WytrzymaloscAparatuKatalogu:
    """Ocena aparatu z katalogu wytrzymałości wobec prądów podanych do oceny: rekordy K
    (dynamiczny, cieplny), rekord W i liczby pomocnicze (limit cieplny, wykorzystanie)."""

    dynamiczna: OcenaKryterium
    cieplna: OcenaKryterium
    wymaganie: WynikWymagania
    i_th_effective_ka: float | None
    utilization_dyn_percent: float | None
    utilization_th_percent: float | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "wymaganie": self.wymaganie.model_dump(mode="json"),
            "message_pl": self.wymaganie.wyjasnienie.zdanie_pl,
            "i_th_effective_ka": self.i_th_effective_ka,
            "utilization_dyn_percent": self.utilization_dyn_percent,
            "utilization_th_percent": self.utilization_th_percent,
        }


def _wykorzystanie_procent(wynik: float, limit: float | None) -> float | None:
    return None if limit is None or limit <= 0 else wynik / limit * 100


def ocen_aparat_katalogu_wytrzymalosci(
    *,
    device_id: str,
    i_peak_calculated_ka: float,
    i_thermal_calculated_ka: float,
    t_clearing_s: float,
    przedmiot_nazwa_pl: str | None = None,
) -> WytrzymaloscAparatuKatalogu | None:
    """Wytrzymałość aparatu wskazanego pozycją katalogu wytrzymałości (karta zabezpieczeń,
    pakiet dowodów audytu 2). ``None`` — pozycji nie ma w katalogu (wołający mówi to jawnie;
    brak pozycji nie jest oceną)."""
    from network_model.catalog.audit2_catalogs import get_device_withstand

    device = get_device_withstand(device_id)
    if device is None:
        return None
    nazwa = przedmiot_nazwa_pl or device.label_pl
    przedmiot = Przedmiot(
        element_ref=None,
        nazwa_pl=nazwa,
        opis_pl=f"aparat „{device.label_pl}” wobec prądów zwarciowych podanych do oceny",
    )
    zakres_pl = (
        f"Aparat „{device.label_pl}” wobec prądu udarowego i prądu cieplnego zastępczego "
        "podanych do oceny oraz czasu wyłączenia zwarcia."
    )
    dynamiczna, cieplna = oceny_wytrzymalosci_aparatu(
        kryterium_id=f"audyt2.wytrzymalosc.{device_id}",
        przedmiot=przedmiot,
        etykieta_pl=device.label_pl,
        i_dyn_ka=device.i_dyn_ka,
        i_th_ka=device.i_th_1s_ka,
        i_th_duration_s=device.i_th_duration_s,
        i_peak_calculated_ka=i_peak_calculated_ka,
        i_thermal_calculated_ka=i_thermal_calculated_ka,
        t_clearing_s=t_clearing_s,
        zakres_opis_pl=zakres_pl,
    )
    limit_th = limit_cieplny_aparatu_ka(device.i_th_1s_ka, device.i_th_duration_s, t_clearing_s)
    return WytrzymaloscAparatuKatalogu(
        dynamiczna=dynamiczna,
        cieplna=cieplna,
        wymaganie=wymaganie_wytrzymalosci_aparatu(
            wymaganie_id=f"audyt2.wytrzymalosc.{device_id}",
            nazwa_pl=f"Wytrzymałość zwarciowa aparatu „{nazwa}”",
            oceny=(dynamiczna, cieplna),
            zakres=zakres_wytrzymalosci(zakres_pl),
        ),
        i_th_effective_ka=limit_th,
        utilization_dyn_percent=_wykorzystanie_procent(i_peak_calculated_ka, device.i_dyn_ka),
        utilization_th_percent=_wykorzystanie_procent(i_thermal_calculated_ka, limit_th),
    )


# ---------------------------------------------------------------------------
# Współczynnik napięciowy przekładnika napięciowego wobec uziemienia sieci (IEC 61869-3)
# ---------------------------------------------------------------------------

PODSTAWA_WSPOLCZYNNIKA_VT: Final = podstawa_normy(
    "IEC 61869-3 (PN-EN 61869-3) Przekładniki — przekładniki napięciowe indukcyjne",
    "2011",
    "tab. 2 — znamionowy współczynnik napięciowy wg sposobu uziemienia sieci",
)

#: Zakres kryterium VT audytu 2: krotność bez czasu deklaracji (czas ocenia dobór przekładnika).
_ZAKRES_VT: Final = ZakresWaznosci(
    rodzaj_analizy="POWER_FLOW",
    opis_pl=(
        "Przekładnik napięciowy z uzwojeniem pierwotnym pracującym między fazą a ziemią w sieci "
        "SN o podanym sposobie uziemienia punktu neutralnego."
    ),
    wykluczenia=(
        "czas deklaracji współczynnika napięciowego (30 s / 8 h) — ocenia go kryterium "
        "doboru przekładnika pola (`vt.wspolczynnik_napieciowy`, domain/dobor_przekladnika.py)",
        "uzwojenie pracujące między fazami — wymaga wyłącznie współczynnika ciągłego",
    ),
)


def ocena_wspolczynnika_napieciowego_vt(
    *,
    voltage_factor: float | None,
    grounding_type: TypPunktuNeutralnego,
    przedmiot: Przedmiot,
) -> OcenaKryterium:
    """Rekord K: współczynnik napięciowy VT (faza–ziemia) nie mniejszy od wymaganego dla sposobu
    uziemienia sieci — wymaganie z JEDNEJ reguły ``wymagany_wspolczynnik_napieciowy``
    (V12K-256). Nieznany współczynnik daje ``NIE_OCENIONO`` (dawniej podstawiano 1,9 —
    V12K-258)."""
    from domain.dobor_przekladnika import wymagany_wspolczynnik_napieciowy

    wymagany = wymagany_wspolczynnik_napieciowy(grounding_type, "faza_ziemia")
    siec_pl = ETYKIETA_PL_PUNKTU_NEUTRALNEGO[grounding_type]
    return ocena_porownania(
        Porownanie(
            kryterium_id="audyt2.vt.wspolczynnik_napieciowy_uziemienie",
            opis_pl=(
                "Współczynnik napięciowy przekładnika (uzwojenie faza–ziemia) nie mniejszy od "
                f"wymaganego dla sieci o punkcie neutralnym {siec_pl}"
            ),
            relacja="NIE_MNIEJ",
            wielkosc_pl="znamionowy współczynnik napięciowy przekładnika",
            warunek_latex=r"F_v \ge F_{v,wym}",
            symbol_latex=r"F_v",
            jednostka="1",
            wynik=voltage_factor,
            limit=wymagany,
            limit_pl=f"współczynnik wymagany dla sieci o punkcie neutralnym {siec_pl}",
            braki=(
                (
                    "współczynnik napięciowy przekładnika — typ spoza katalogu albo karta bez "
                    "tej danej",
                )
                if voltage_factor is None
                else ()
            ),
        ),
        przedmiot=przedmiot,
        podstawa=PODSTAWA_WSPOLCZYNNIKA_VT,
        zdolnosc=classify_dynamic_capability(ZDOLNOSC_PRZEKLADNIKA),
        zakres=_ZAKRES_VT,
        slad=_slad(
            "audyt2.vt.wspolczynnik_napieciowy_uziemienie",
            "współczynnik napięciowy typu wobec wymaganego dla sposobu uziemienia",
        ),
        odniesienie=_ODNIESIENIE,
    )


# ---------------------------------------------------------------------------
# Tryby pracy magazynu energii wobec zdolności przekształtnika
# ---------------------------------------------------------------------------

#: Podstawa kryterium zdolności: definicja usługi z katalogu trybów (usługa symetryczna wymaga
#: pracy w czterech ćwiartkach, praca wyspowa — przekształtnika tworzącego napięcie).
PODSTAWA_TRYBU_BESS: Final = podstawa_katalogu(
    "katalog trybów pracy magazynu energii audytu 2",
    "wymagania usługi wobec przekształtnika (praca czterokwadrantowa, tworzenie napięcia)",
)


def _zakres_bess(der_nazwa: str) -> ZakresWaznosci:
    return ZakresWaznosci(
        rodzaj_analizy="POWER_FLOW",
        opis_pl=(
            f"Magazyn energii {der_nazwa}: zgodność wybranych usług z deklaracją zdolności "
            "przekształtnika z karty katalogowej typu."
        ),
        wykluczenia=(
            "wymagania rynku bilansującego wobec usług (czas reakcji, rezerwa) — regulamin "
            "operatora systemu przesyłowego, poza modelem",
        ),
    )


def ocena_zdolnosci_trybu_bess(
    *,
    tryb_id: str,
    tryb_pl: str,
    zdolnosc_id: str,
    wymagana_zdolnosc_pl: str,
    wymagana: bool,
    zdolnosc_pcs: bool | None,
    der_nazwa: str,
    przedmiot: Przedmiot,
) -> OcenaKryterium:
    """Rekord K: przekształtnik ma zdolność, której wymaga definicja usługi. Usługa bez tego
    wymagania — ``NIE_DOTYCZY``; zdolność nieustalona w karcie — ``NIE_OCENIONO`` (brak danych
    nie jest potwierdzeniem zdolności)."""
    return ocena_porownania(
        Porownanie(
            kryterium_id=f"audyt2.bess.{tryb_id}.{zdolnosc_id}",
            opis_pl=(
                f"Przekształtnik ma zdolność, której wymaga usługa „{tryb_pl}”: "
                f"{wymagana_zdolnosc_pl}"
            ),
            relacja="LOGICZNE",
            wielkosc_pl=f"zdolność przekształtnika: {wymagana_zdolnosc_pl}",
            spelniony=zdolnosc_pcs if wymagana else None,
            stan_pl=(
                None
                if zdolnosc_pcs is None
                else (
                    f"przekształtnik {'ma' if zdolnosc_pcs else 'nie ma'} zdolności: "
                    f"{wymagana_zdolnosc_pl}"
                )
            ),
            braki=(
                (
                    f"karta przekształtnika magazynu {der_nazwa} nie podaje zdolności: "
                    f"{wymagana_zdolnosc_pl} — zdolności nie da się potwierdzić",
                )
                if wymagana and zdolnosc_pcs is None
                else ()
            ),
            dotyczy=wymagana,
            powod_stosowalnosci_pl=(
                f"usługa „{tryb_pl}” wymaga zdolności: {wymagana_zdolnosc_pl}"
                if wymagana
                else f"usługa „{tryb_pl}” nie wymaga zdolności: {wymagana_zdolnosc_pl}"
            ),
        ),
        przedmiot=przedmiot,
        podstawa=PODSTAWA_TRYBU_BESS,
        zdolnosc=classify_dynamic_capability(ZDOLNOSC_TRYBOW_BESS),
        zakres=_zakres_bess(der_nazwa),
        slad=_slad(
            f"audyt2.bess.{tryb_id}.{zdolnosc_id}",
            "wymaganie usługi z katalogu trybów wobec deklaracji przekształtnika",
        ),
        odniesienie=_ODNIESIENIE,
    )


def ocena_trybu_spoza_katalogu(
    *, tryb_ref: str, der_nazwa: str, przedmiot: Przedmiot
) -> OcenaKryterium:
    """Rekord K trybu wskazanego w konfiguracji, którego nie ma w katalogu — ``NIE_OCENIONO``:
    definicji usługi nie znamy, więc jej wymagań wobec przekształtnika nie da się sprawdzić."""
    return ocena_porownania(
        Porownanie(
            kryterium_id=f"audyt2.bess.{tryb_ref}.katalog",
            opis_pl="Tryb pracy magazynu ma definicję w katalogu trybów",
            relacja="LOGICZNE",
            wielkosc_pl="definicja trybu pracy w katalogu",
            spelniony=None,
            braki=(
                f"trybu pracy wskazanego dla magazynu {der_nazwa} nie ma w katalogu trybów — "
                "wymagań usługi wobec przekształtnika nie da się ustalić",
            ),
        ),
        przedmiot=przedmiot,
        podstawa=PODSTAWA_TRYBU_BESS,
        zdolnosc=classify_dynamic_capability(ZDOLNOSC_TRYBOW_BESS),
        zakres=_zakres_bess(der_nazwa),
        slad=_slad(f"audyt2.bess.{tryb_ref}.katalog", "wyszukanie trybu w katalogu trybów pracy"),
        odniesienie=_ODNIESIENIE,
    )


def wymaganie_trybow_bess(
    *, der_nazwa: str, przedmiot: Przedmiot, oceny: Sequence[OcenaKryterium]
) -> WynikWymagania:
    """Rekord W trybów pracy magazynu. Gdy żaden wybrany tryb nie wymaga zdolności
    przekształtnika (np. sama redukcja szczytów), wymaganie nie dotyczy magazynu — rekord
    ``NIE_DOTYCZY`` z powodem, nie „ocena niewykonana”."""
    dotyczy = any(k.stosowalnosc.dotyczy for k in oceny)
    return wymaganie_z_ocen(
        dotyczy=dotyczy,
        powod_stosowalnosci_pl=(
            DOTYCZY_OBIEKTU
            if dotyczy
            else (
                f"żaden tryb pracy wybrany dla magazynu {der_nazwa} nie wymaga pracy "
                "czterokwadrantowej ani tworzenia napięcia przez przekształtnik"
            )
        ),
        wymaganie_id="audyt2.bess.tryby_pracy",
        nazwa_pl=f"Tryby pracy magazynu energii {der_nazwa} wobec zdolności przekształtnika",
        podstawa=PODSTAWA_TRYBU_BESS,
        oceny=oceny,
        zdolnosc=classify_dynamic_capability(ZDOLNOSC_TRYBOW_BESS),
        zakres=_zakres_bess(der_nazwa),
        odniesienie=_ODNIESIENIE,
    )


# ---------------------------------------------------------------------------
# Przełącznik zaczepów transformatora
# ---------------------------------------------------------------------------

PODSTAWA_PRZELACZNIKA: Final = podstawa_katalogu(
    "katalog przełączników zaczepów audytu 2",
    "przeznaczenie przełącznika (klasa transformatora) i regulacja pod obciążeniem",
)


def _zakres_zaczepow(transformer_nazwa: str) -> ZakresWaznosci:
    return ZakresWaznosci(
        rodzaj_analizy="POWER_FLOW",
        opis_pl=(
            f"Transformator {transformer_nazwa}: przełącznik zaczepów przypisany w konfiguracji "
            "stacji wobec klasy transformatora z napięć modelu."
        ),
        wykluczenia=("zakres i krok regulacji wobec profilu napięć — ocenia rozpływ mocy",),
    )


def oceny_przelacznika_zaczepow(
    *,
    transformer_nazwa: str,
    przedmiot: Przedmiot,
    przelacznik_pl: str | None,
    klasa_pl: str,
    przeznaczenie_pl: str | None,
    pasuje_do_klasy: bool | None,
    wymaga_avr: bool,
    obsluguje_avr: bool | None,
) -> tuple[OcenaKryterium, OcenaKryterium]:
    """Dwa rekordy K planu zaczepów: przełącznik przeznaczony dla klasy transformatora oraz
    regulacja automatyczna (AVR), gdy model jej wymaga. Przełącznik spoza katalogu —
    ``NIE_OCENIONO`` obu kryteriów z nazwanym brakiem."""
    zdolnosc = classify_dynamic_capability(ZDOLNOSC_PLANU_ZACZEPOW)
    zakres = _zakres_zaczepow(transformer_nazwa)
    brak_katalogu = (
        (
            f"przełącznika zaczepów wskazanego dla transformatora {transformer_nazwa} nie ma w "
            "katalogu przełączników",
        )
        if przelacznik_pl is None
        else ()
    )
    klasa = ocena_porownania(
        Porownanie(
            kryterium_id="audyt2.zaczepy.klasa_transformatora",
            opis_pl=(f"Przełącznik zaczepów przeznaczony dla transformatora klasy {klasa_pl}"),
            relacja="LOGICZNE",
            wielkosc_pl="przeznaczenie przełącznika zaczepów",
            spelniony=pasuje_do_klasy,
            stan_pl=(
                None
                if przelacznik_pl is None
                else f"„{przelacznik_pl}” — przeznaczenie: {przeznaczenie_pl}"
            ),
            braki=brak_katalogu,
        ),
        przedmiot=przedmiot,
        podstawa=PODSTAWA_PRZELACZNIKA,
        zdolnosc=zdolnosc,
        zakres=zakres,
        slad=_slad(
            "audyt2.zaczepy.klasa_transformatora",
            "przeznaczenie pozycji katalogu wobec klasy transformatora z napięć modelu",
        ),
        odniesienie=_ODNIESIENIE,
    )
    avr = ocena_porownania(
        Porownanie(
            kryterium_id="audyt2.zaczepy.regulacja_automatyczna",
            opis_pl="Przełącznik zaczepów obsługuje regulację automatyczną napięcia (AVR)",
            relacja="LOGICZNE",
            wielkosc_pl="regulacja automatyczna przełącznika",
            spelniony=obsluguje_avr if wymaga_avr else None,
            stan_pl=(
                None
                if obsluguje_avr is None
                else (
                    "przełącznik pod obciążeniem z regulacją automatyczną"
                    if obsluguje_avr
                    else "przełącznik beznapięciowy — bez regulacji automatycznej"
                )
            ),
            braki=brak_katalogu if wymaga_avr else (),
            dotyczy=wymaga_avr,
            powod_stosowalnosci_pl=(
                "konfiguracja stacji wymaga regulacji automatycznej napięcia"
                if wymaga_avr
                else "konfiguracja stacji nie wymaga regulacji automatycznej napięcia"
            ),
        ),
        przedmiot=przedmiot,
        podstawa=PODSTAWA_PRZELACZNIKA,
        zdolnosc=zdolnosc,
        zakres=zakres,
        slad=_slad(
            "audyt2.zaczepy.regulacja_automatyczna",
            "regulacja pozycji katalogu wobec wymogu konfiguracji stacji",
        ),
        odniesienie=_ODNIESIENIE,
    )
    return klasa, avr


def wymaganie_planu_zaczepow(
    *, transformer_nazwa: str, przedmiot: Przedmiot, oceny: Sequence[OcenaKryterium]
) -> WynikWymagania:
    return wymaganie_z_ocen(
        wymaganie_id="audyt2.zaczepy.plan",
        nazwa_pl=f"Plan zaczepów transformatora {transformer_nazwa}",
        podstawa=PODSTAWA_PRZELACZNIKA,
        oceny=oceny,
        zdolnosc=classify_dynamic_capability(ZDOLNOSC_PLANU_ZACZEPOW),
        zakres=_zakres_zaczepow(transformer_nazwa),
        odniesienie=_ODNIESIENIE,
    )


# ---------------------------------------------------------------------------
# Bilans eksportu stacji wobec granicy zdolności przyłączeniowej
# ---------------------------------------------------------------------------

#: Granica eksportu stacji do sieci OSD wynika z warunków przyłączenia (moc przyłączeniowa) —
#: model jej nie niesie, a dawne progi 0,8 / 1,5 / 3,0 stosunku eksportu do importu nie miały
#: żadnej podstawy (ani normy, ani dokumentu OSD).
PODSTAWA_GRANICY_EKSPORTU: Final = podstawa_nieustalona(
    "warunki przyłączenia OSD — moc przyłączeniowa stacji",
    uwagi_pl=(
        "granica eksportu wynika z warunków przyłączenia wydanych przez OSD; model ich nie "
        "niesie, więc limitu nie ma"
    ),
)


def ocena_eksportu_stacji(
    *, stacja_nazwa: str, przedmiot: Przedmiot, p_export_kw: float, p_import_kw: float
) -> OcenaKryterium:
    """Rekord K bilansu eksportu: eksport netto stacji do sieci OSD wobec granicy zdolności
    przyłączeniowej. Brak eksportu netto — ``NIE_DOTYCZY``; eksport — ``BRAK_PODSTAWY`` z wynikiem
    informacyjnym (granicy z warunków przyłączenia model nie niesie)."""
    netto = p_export_kw - p_import_kw
    eksport = netto > 0
    return ocena_porownania(
        Porownanie(
            kryterium_id="audyt2.eksport.netto",
            opis_pl=(
                "Eksport netto stacji do sieci OSD nie przekracza granicy zdolności "
                "przyłączeniowej z warunków przyłączenia"
            ),
            relacja="NIE_WIECEJ",
            wielkosc_pl="eksport netto stacji (moc źródeł minus moc odbiorów)",
            warunek_latex=r"P_{exp} = \sum P_{DER} - \sum P_{odb} \le P_{przyl}",
            symbol_latex=r"P_{exp}",
            jednostka="kW",
            wynik=netto,
            limit=None,
            dotyczy=eksport,
            powod_stosowalnosci_pl=(
                f"stacja {stacja_nazwa} oddaje moc do sieci OSD (moc źródeł "
                f"{format_liczba(p_export_kw)} kW przy mocy odbiorów "
                f"{format_liczba(p_import_kw)} kW)"
                if eksport
                else (
                    f"stacja {stacja_nazwa} nie oddaje mocy do sieci OSD (moc źródeł "
                    f"{format_liczba(p_export_kw)} kW nie przekracza mocy odbiorów "
                    f"{format_liczba(p_import_kw)} kW)"
                )
            ),
        ),
        przedmiot=przedmiot,
        podstawa=PODSTAWA_GRANICY_EKSPORTU,
        zdolnosc=classify_dynamic_capability(ZDOLNOSC_BILANSU_EKSPORTU),
        zakres=ZakresWaznosci(
            rodzaj_analizy="POWER_FLOW",
            opis_pl=(
                f"Stacja {stacja_nazwa}: bilans mocy znamionowych źródeł z konfiguracji stacji "
                "i mocy odbiorów z modelu — stan najgorszy (pełna generacja)."
            ),
            wykluczenia=("profil dobowy generacji i obciążenia",),
        ),
        slad=_slad("audyt2.eksport.netto", "suma mocy źródeł stacji minus suma mocy odbiorów"),
        odniesienie=_ODNIESIENIE,
    )


def wymaganie_eksportu_stacji(*, stacja_nazwa: str, ocena: OcenaKryterium) -> WynikWymagania:
    """Rekord W bilansu eksportu stacji nad jednym kryterium (eksport netto wobec granicy)."""
    return wymaganie_z_ocen(
        wymaganie_id="audyt2.eksport.bilans",
        nazwa_pl=f"Bilans eksportu stacji {stacja_nazwa} wobec warunków przyłączenia",
        podstawa=PODSTAWA_GRANICY_EKSPORTU,
        oceny=(ocena,),
        zdolnosc=classify_dynamic_capability(ZDOLNOSC_BILANSU_EKSPORTU),
        zakres=ocena.zakres_waznosci,
        odniesienie=_ODNIESIENIE,
        # Bez eksportu netto wymaganie granicy eksportu nie stosuje się do stacji — ten sam
        # predykat i powód co kryterium składowe (jedno źródło stosowalności).
        dotyczy=ocena.stosowalnosc.dotyczy,
        powod_stosowalnosci_pl=ocena.stosowalnosc.powod_pl,
    )


def wymaganie_wspolczynnika_vt(*, pole_pl: str, ocena: OcenaKryterium) -> WynikWymagania:
    """Rekord W przekładnika napięciowego pola nad kryterium współczynnika napięciowego."""
    return wymaganie_z_ocen(
        wymaganie_id="audyt2.vt.uziemienie",
        nazwa_pl=f"Przekładnik napięciowy pola {pole_pl} wobec uziemienia sieci",
        podstawa=PODSTAWA_WSPOLCZYNNIKA_VT,
        oceny=(ocena,),
        zdolnosc=classify_dynamic_capability(ZDOLNOSC_PRZEKLADNIKA),
        zakres=_ZAKRES_VT,
        odniesienie=_ODNIESIENIE,
    )
