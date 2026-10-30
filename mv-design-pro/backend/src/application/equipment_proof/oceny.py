"""Rekordy werdyktu wyjaśnialnego dowodu doboru aparatury (karta WERDYKT-MIGRACJA-190, C33).

DLACZEGO TU. Dowód doboru aparatury (``EquipmentProofGenerator``) wystawiał każdemu z czterech
sprawdzeń (U_m, I_cu, I_dyn, I_th) i całemu doborowi gołe słowo ``PASS``/``FAIL`` — także przy
BRAKU danej („Brak podstawy: nie podano U_m aparatu” z kodem ``FAIL``) — a podsumowanie dowodu
drukowało je jako wynik („PASS —”). Kontrakt werdyktu wyjaśnialnego
(`docs/domain/KONTRAKT_WERDYKTU_WYJASNIALNEGO.md`) wymaga przy każdym statusie pełnego rekordu:
co oceniono, kryterium, wynik z jednostką, limit z podstawą, margines, przyczynę, dowód i zakres
ważności; brak danej daje ``NIE_OCENIONO`` (brak danych ≠ nie spełnia ≠ spełnia).

JEDNA REGUŁA NA KRYTERIUM. Kryteria dynamiczny i cieplny pochodzą z tego samego budowniczego co
walidator katalogu wytrzymałości i ocena pól stacji (``audit2_oceny.oceny_wytrzymalosci_aparatu``
z regułą limitu cieplnego ``limit_cieplny_aparatu_ka``); wielkość kryterium wyłączania
z jedynego predykatu ``wielkosc_kryterium_wylaczania``, jego podstawa z
``podstawa_kryterium_wylaczania``. Kod agregatu dowodu (``ProofSummary.overall_status``) jest
PROJEKCJĄ rekordów (``werdykt.porownanie.projekcja_statusu``).

Warstwa aplikacji — zero fizyki: porównanie danych znamionowych z wielkościami zapisanego biegu.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, Final

from application.equipment_proof.types import DeviceRating
from application.equipment_proof.wielkosc_wylaczania import (
    WielkoscKryteriumWylaczania,
    podstawa_kryterium_wylaczania,
)
from network_model.catalog.audit2_oceny import oceny_wytrzymalosci_aparatu, zakres_wytrzymalosci
from network_model.pochodne.pasma_napieciowe import napiecie_wymagane_izolacji_kv
from solver_input.provenance import classify_dynamic_capability
from werdykt import (
    DanaPrzyjeta,
    OcenaKryterium,
    OdnosnikSladu,
    Przedmiot,
    WynikWymagania,
    ZakresWaznosci,
)
from werdykt.porownanie import (
    Porownanie,
    ocena_porownania,
    podstawa_katalogu,
    podstawa_normy,
    wymaganie_z_ocen,
)

#: Zdolność dowodu doboru aparatu w rejestrze dowodowym (`solver_input/provenance`).
ZDOLNOSC_DOBORU_APARATU: Final = "aparatura.dobor_aparatu_punktu"
_ODNIESIENIE: Final = "application/equipment_proof/oceny.py"

PODSTAWA_IZOLACJI: Final = podstawa_normy(
    "IEC 60071-1 (PN-EN 60071-1) Koordynacja izolacji; IEC 60038 Napięcia normalne IEC",
    "2006 / 2009",
    "IEC 60071-1 p. 3.9–3.10 i PN-EN 62271-1 p. 5.2 (U_m aparatu ≥ U_s sieci); U_s z IEC 60038 "
    "tab. 3–5, w paśmie nN napięcie znamionowe sieci (IEC 60947-1)",
    uwagi_pl=(
        "napięcie znamionowe aparatu jest górną granicą napięcia sieci, dla której go "
        "zaprojektowano — aparat 15 kV nie pokrywa sieci 15 kV (U_s = 17,5 kV)"
    ),
)


@dataclass(frozen=True)
class OcenyDoboruAparatu:
    """Rekordy K czterech sprawdzeń doboru aparatu i rekord W doboru (jedno źródło statusów)."""

    izolacja: OcenaKryterium
    wylaczanie: OcenaKryterium
    dynamiczna: OcenaKryterium
    cieplna: OcenaKryterium
    wymaganie: WynikWymagania

    @property
    def oceny(self) -> tuple[OcenaKryterium, ...]:
        return (self.izolacja, self.wylaczanie, self.dynamiczna, self.cieplna)


def _liczba(wartosc: Any) -> float | None:
    if isinstance(wartosc, bool) or not isinstance(wartosc, int | float):
        return None
    return float(wartosc)


def _etykieta_aparatu(device: DeviceRating) -> str:
    """Pozycja danych znamionowych w podstawie limitu: nazwa aparatu i typ katalogowy."""
    return device.name_pl if not device.type_ref else f"{device.name_pl} (typ {device.type_ref})"


def _zakres(punkt_pl: str) -> ZakresWaznosci:
    """Zakres rekordów doboru — ten sam kształt co rekordów wytrzymałości (``zakres_wytrzymalosci``),
    bo rekord W nad czterema kryteriami nie może być opisany szerzej niż składniki."""
    return zakres_wytrzymalosci(
        f"Dobór aparatu w punkcie zabudowy ({punkt_pl}) wobec wielkości zapisanego biegu "
        "zwarciowego IEC 60909 i napięcia znamionowego punktu"
    )


def _slad(run_id: str, krok: str, opis_pl: str) -> tuple[OdnosnikSladu, ...]:
    return (OdnosnikSladu(run_id=run_id, krok=krok, opis_pl=opis_pl),)


def ocena_izolacji(
    *,
    kryterium_id: str,
    przedmiot: Przedmiot,
    device: DeviceRating,
    u_n_kv: float | None,
    zakres: ZakresWaznosci,
    run_id: str,
) -> OcenaKryterium:
    """Rekord K poziomu izolacji: napięcie najwyższe sieci U_s w punkcie zabudowy nie przekracza
    napięcia najwyższego aparatu U_m. Wielkością ocenianą jest U_s wyznaczone z napięcia punktu
    biegu (ta sama tablica ``napiecie_wymagane_izolacji_kv`` co predykat
    ``pasma_napieciowe.izolacja_pokrywa_siec``, granica równości dopuszczona — parytet obu
    przypina test), limitem — U_m z danych znamionowych aparatu (jak I_cu, I_dyn, I_th: wielkość
    sieci wobec zdolności aparatu). Brak U_n punktu daje ``NIE_OCENIONO``, brak U_m aparatu —
    ``BRAK_PODSTAWY`` z nazwanym brakiem (jak przy pozostałych danych znamionowych)."""
    u_s = napiecie_wymagane_izolacji_kv(u_n_kv)
    braki: list[str] = []
    if u_s is None:
        braki.append(
            "bieg nie niesie napięcia znamionowego punktu U_n z napięciem najwyższym sieci U_s "
            "w tablicach IEC 60038"
        )
    if device.u_m_kv is None:
        braki.append(f"nie podano napięcia najwyższego U_m aparatu „{device.name_pl}”")
    return ocena_porownania(
        Porownanie(
            kryterium_id=f"{kryterium_id}.izolacja",
            opis_pl=(
                "Napięcie najwyższe sieci w punkcie zabudowy nie przekracza napięcia "
                "najwyższego aparatu"
            ),
            relacja="NIE_WIECEJ",
            wielkosc_pl=(
                "napięcie najwyższe sieci U_s"
                + ("" if u_n_kv is None else f" dla U_n = {u_n_kv:g} kV".replace(".", ","))
            ),
            warunek_latex=r"U_s(U_n) \le U_m",
            symbol_latex="U_s",
            jednostka="kV",
            wynik=u_s,
            limit=device.u_m_kv,
            limit_pl="napięcie najwyższe aparatu U_m (dla aparatury rozdzielczej U_r)",
            braki=tuple(braki),
        ),
        przedmiot=przedmiot,
        podstawa=PODSTAWA_IZOLACJI,
        podstawa_limitu=podstawa_katalogu(
            _etykieta_aparatu(device), "napięcie najwyższe urządzenia U_m (U_r)"
        ),
        zdolnosc=classify_dynamic_capability(ZDOLNOSC_DOBORU_APARATU),
        zakres=zakres,
        slad=_slad(
            run_id,
            f"{kryterium_id}:izolacja",
            f"U_n = {u_n_kv} kV (bieg); U_s = {u_s} kV (IEC 60038); U_m = {device.u_m_kv} kV "
            "(dane aparatu)",
        ),
        odniesienie=_ODNIESIENIE,
    )


def ocena_wylaczania(
    *,
    kryterium_id: str,
    przedmiot: Przedmiot,
    device: DeviceRating,
    wielkosc: WielkoscKryteriumWylaczania | None,
    wymagana_ka: float | None,
    dane_przyjete: tuple[DanaPrzyjeta, ...],
    zakres: ZakresWaznosci,
    run_id: str,
) -> OcenaKryterium:
    """Rekord K zdolności wyłączania: wielkość z jedynego predykatu (I_b dla wyłącznika SN/WN,
    I″k dla nN i bezpiecznika) ≤ I_cu aparatu. Rozłącznik, odłącznik i uziemnik —
    ``NIE_DOTYCZY`` z powodem (rodzaj aparatu, nie brak danej)."""
    braki: list[str] = []
    if wielkosc is None:
        braki.append(
            "bieg nie niesie napięcia znamionowego punktu zwarcia — nie wiadomo, czy porównać "
            "I_b (SN/WN, IEC 62271-100), czy spodziewany I″k (nN, IEC 60947-2)"
        )
    elif wymagana_ka is None:
        braki.append(
            f"wielkości biegu nie niosą wielkości {wielkosc.nazwa_pl} punktu zwarcia "
            "(przelicz bieg zwarciowy)"
        )
    if device.i_cu_ka is None and not device.i_cu_not_applicable:
        braki.append(f"nie podano zdolności wyłączania I_cu aparatu „{device.name_pl}”")
    symbol = wielkosc.symbol if wielkosc is not None else "I_b"
    return ocena_porownania(
        Porownanie(
            kryterium_id=f"{kryterium_id}.wylaczanie",
            opis_pl=(
                "Prąd, który aparat ma przerwać w punkcie zabudowy, nie przekracza jego "
                "znamionowej zdolności wyłączania zwarciowej"
                + (f" ({wielkosc.nazwa_pl})" if wielkosc is not None else "")
            ),
            relacja="NIE_WIECEJ",
            wielkosc_pl=(
                f"{wielkosc.nazwa_pl} w punkcie zabudowy"
                if wielkosc is not None
                else "prąd wyłączany w punkcie zabudowy"
            ),
            warunek_latex=rf"{symbol} \le I_{{cu}}",
            symbol_latex=symbol,
            jednostka="kA",
            wynik=wymagana_ka if wielkosc is not None else None,
            limit=device.i_cu_ka,
            limit_pl="znamionowa zdolność wyłączania zwarciowa aparatu I_cu",
            braki=tuple(braki),
            dotyczy=not device.i_cu_not_applicable,
            powod_stosowalnosci_pl=(
                "aparat nie przerywa prądu zwarciowego z definicji normy (rozłącznik, "
                "odłącznik, uziemnik) — kryterium wyłączania go nie dotyczy"
                if device.i_cu_not_applicable
                else "aparat przerywa prąd zwarciowy w punkcie zabudowy"
            ),
        ),
        przedmiot=przedmiot,
        podstawa=podstawa_kryterium_wylaczania(wielkosc),
        podstawa_limitu=podstawa_katalogu(
            _etykieta_aparatu(device), "znamionowa zdolność wyłączania zwarciowa I_cu"
        ),
        zdolnosc=classify_dynamic_capability(ZDOLNOSC_DOBORU_APARATU),
        zakres=zakres,
        dane_przyjete=dane_przyjete,
        slad=_slad(
            run_id,
            f"{kryterium_id}:wylaczanie",
            f"{symbol} = {wymagana_ka} kA (bieg); I_cu = {device.i_cu_ka} kA (dane aparatu)",
        ),
        odniesienie=_ODNIESIENIE,
    )


def oceny_doboru_aparatu(
    *,
    device: DeviceRating,
    required: Mapping[str, Any],
    wielkosc: WielkoscKryteriumWylaczania | None,
    punkt_pl: str,
    run_id: str,
    dane_ip: tuple[DanaPrzyjeta, ...] = (),
    dane_ith: tuple[DanaPrzyjeta, ...] = (),
    dane_wylaczania: tuple[DanaPrzyjeta, ...] = (),
) -> OcenyDoboruAparatu:
    """Cztery rekordy K doboru aparatu i rekord W nad nimi.

    Wymagany prąd szczytowy: ``idyn_ka`` wiersza biegu, a gdy go brak — prąd udarowy ``ip_ka``
    (ta sama wielkość: wartość szczytowa prądu zwarciowego w punkcie zabudowy). Prąd cieplny
    ``ith_ka`` przy czasie zwarcia ``tk_s``.
    """
    kryterium_id = f"dobor_aparatu.{device.device_id}"
    przedmiot = Przedmiot(
        element_ref=device.device_id,
        nazwa_pl=device.name_pl,
        opis_pl=f"aparat w punkcie zabudowy ({punkt_pl})",
    )
    zakres = _zakres(punkt_pl)
    izolacja = ocena_izolacji(
        kryterium_id=kryterium_id,
        przedmiot=przedmiot,
        device=device,
        u_n_kv=_liczba(required.get("u_kv")),
        zakres=zakres,
        run_id=run_id,
    )
    wylaczanie = ocena_wylaczania(
        kryterium_id=kryterium_id,
        przedmiot=przedmiot,
        device=device,
        wielkosc=wielkosc,
        wymagana_ka=_liczba(required.get(wielkosc.klucz)) if wielkosc is not None else None,
        dane_przyjete=dane_wylaczania,
        zakres=zakres,
        run_id=run_id,
    )
    ip_ka = _liczba(required.get("idyn_ka"))
    if ip_ka is None:
        ip_ka = _liczba(required.get("ip_ka"))
    dynamiczna, cieplna = oceny_wytrzymalosci_aparatu(
        kryterium_id=kryterium_id,
        przedmiot=przedmiot,
        etykieta_pl=_etykieta_aparatu(device),
        i_dyn_ka=device.i_dyn_ka,
        i_th_ka=device.i_th_ka,
        i_th_duration_s=device.t_th_s,
        i_peak_calculated_ka=ip_ka,
        i_thermal_calculated_ka=_liczba(required.get("ith_ka")),
        t_clearing_s=_liczba(required.get("tk_s")),
        zakres_opis_pl=zakres.opis_pl,
        dane_dynamiczna=dane_ip,
        dane_cieplna=dane_ith,
        zdolnosc_id=ZDOLNOSC_DOBORU_APARATU,
        odniesienie=_ODNIESIENIE,
    )
    wymaganie = wymaganie_z_ocen(
        wymaganie_id=kryterium_id,
        nazwa_pl=f"Dobór aparatu „{device.name_pl}” w punkcie zabudowy",
        podstawa=PODSTAWA_IZOLACJI,
        oceny=(izolacja, wylaczanie, dynamiczna, cieplna),
        zdolnosc=classify_dynamic_capability(ZDOLNOSC_DOBORU_APARATU),
        zakres=zakres,
        odniesienie=_ODNIESIENIE,
    )
    return OcenyDoboruAparatu(
        izolacja=izolacja,
        wylaczanie=wylaczanie,
        dynamiczna=dynamiczna,
        cieplna=cieplna,
        wymaganie=wymaganie,
    )
