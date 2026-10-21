"""Porownanie A/B WYNIKOW ZWARCIOWYCH per PUNKT ZWARCIOWY (karta KD-3, poz. 11).

DLUG, KTORY TO ZAMYKA (V12K-290). Tryb zwarciowy ekranu porownan liczyl roznice
W WARSTWIE PREZENTACJI: `zwarciePorownanieModel.ts` odejmowal dwie wartosci z
dwoch przebiegow i dzielil je przez siebie, zeby pokazac procent. To arytmetyka
na wynikach solvera po stronie klienta — dokladnie ta sama klasa, ktora dla
porownan ROZPLYWU zamknela luka L-13 (karta KD-2).

DLACZEGO NOWY MODUL, A NIE ROZSZERZENIE ISTNIEJACYCH. System mial dwie sciezki
porownan zwarciowych i ZADNA nie dawala tego, czego potrzebuje ekran:
  * `application/comparison/service._compare_short_circuit` — POJEDYNCZA,
    ZAGREGOWANA delta (jeden Ik''/ip/Ith/Sk z jednego payloadu na przebieg),
    a nie wartosci per wezel;
  * dawny `domain/sc_comparison.build_comparison` — delty per element, ale punkty
    BEZ ODPOWIEDNIKA w drugim przebiegu byly CICHO POMIJANE (modul bez konsumenta
    od karty BATCH-ROUTER, usuniety w karcie TB-WARTOSC-ROBOCZA).
Ten modul robi jedno i drugie: per punkt, z JAWNYM znacznikiem obecnosci.

ZAKRES (kanon niezmienny): INTERPRETACJA, zero fizyki. Wielkosci przychodza
gotowe z dwoch zestawow wynikow; tutaj powstaja wylacznie roznice.

INWARIANTY:
1. delta bezwzgledna = B − A (znak mowi o kierunku zmiany),
2. delta wzgledna liczona wobec A: (B − A)/|A|·100; A = 0 ⇒ ``None`` (wartosc
   NIE ISTNIEJE — bez epsilonow i bez zaokraglen),
3. pola procentowe sa ADDYTYWNE i pomijane w serializacji, gdy None
   (``exclude_none``) — starszy konsument nie widzi zadnej zmiany,
4. punkt obecny tylko po jednej stronie zachowuje swoje wartosci i dostaje
   ``obecny_w`` = "A" albo "B"; delty pozostaja ``None``,
5. kolejnosc wierszy: unia identyfikatorow posortowana rosnaco (determinizm).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from enm.nazwy_elementow import opis_bez_nazwy
from network_model.core.czas_wylaczenia import POCHODZENIE_TB_PROJEKTANT
from network_model.nazwy import nazwa_nadana

#: Znaczniki obecnosci punktu w przebiegach.
OBECNY_W_OBU = "AB"
OBECNY_TYLKO_A = "A"
OBECNY_TYLKO_B = "B"


def procent_roznicy(wartosc_a: float | None, wartosc_b: float | None) -> float | None:
    """Roznica wzgledna B wobec A w procentach: (B − A)/|A|·100 [%].

    Ta sama regula co w porownaniach rozplywu (`domain.power_flow_comparison`):
    odniesieniem jest zawsze przebieg A, mianownik w wartosci bezwzglednej (znak
    wyniku pokrywa sie ze znakiem delty). Brak ktorejkolwiek strony albo A = 0
    daje ``None`` — uczciwy brak, nie zero.
    """
    if wartosc_a is None or wartosc_b is None or wartosc_a == 0.0:
        return None
    return (wartosc_b - wartosc_a) / abs(wartosc_a) * 100.0


def _delta(wartosc_a: float | None, wartosc_b: float | None) -> float | None:
    """Roznica bezwzgledna B − A; brak ktorejkolwiek strony ⇒ ``None``."""
    if wartosc_a is None or wartosc_b is None:
        return None
    return wartosc_b - wartosc_a


def _liczba(dane: dict[str, Any], klucz: str) -> float | None:
    """Odczyt liczby z wiersza wyniku; brak/None/nie-liczba ⇒ ``None``."""
    wartosc = dane.get(klucz)
    if isinstance(wartosc, bool) or not isinstance(wartosc, int | float):
        return None
    return float(wartosc)


def _pochodzenie_tb(wiersz: dict[str, Any] | None) -> tuple[str | None, bool | None]:
    """Pochodzenie t_b punktu i znacznik wartości roboczej — odczyt z wiersza wyniku.

    Wiersz z t_b spoza scenariusza niesie ``tb_zrodlo`` (``CzasWylaczeniaTb.to_dict``);
    wiersz z t_b projektanta ma samo ``tb_s`` bez ``tb_zrodlo`` (kontrakt addytywny
    karty TB-WARTOSC-ROBOCZA) — to pochodzenie ``PROJEKTANT``. Wiersz bez ``tb_s``
    (starszy wynik, punkt bez odpowiednika) ⇒ ``(None, None)`` — uczciwy brak.
    """
    if wiersz is None:
        return None, None
    zrodlo = wiersz.get("tb_zrodlo")
    if isinstance(zrodlo, dict) and isinstance(zrodlo.get("pochodzenie"), str):
        return str(zrodlo["pochodzenie"]), bool(zrodlo.get("wartosc_robocza"))
    if _liczba(wiersz, "tb_s") is not None:
        return POCHODZENIE_TB_PROJEKTANT, False
    return None, None


@dataclass(frozen=True)
class PunktZwarciowyDiff:
    """Jeden punkt zwarciowy w porownaniu A/B.

    Pola ``*_a``/``*_b`` to wartosci z przebiegow, ``delta_*`` — roznice
    bezwzgledne, ``delta_*_percent`` — wzgledne. Wszystkie moga byc ``None``
    (brak danej w wyniku albo punkt bez odpowiednika) i wtedy NIE trafiaja do
    serializacji.
    """

    target_id: str
    target_name: str
    obecny_w: str
    #: Ref elementu SIECI odpowiadajacy punktowi zwarcia (`element_id` wiersza
    #: kanonicznego) — TOZSAMOSC UZYWANA NA SCHEMACIE. Punkt zwarcia jest
    #: adresowany dwoma refami: `target_id` (wezel grafu przebiegu) oraz
    #: `element_id` (element modelu). Nakladka roznic na schemacie musi trafic
    #: w ten drugi — dokladnie ta sama regula, ktorej uzywa akcja „Pokaz na
    #: schemacie" ekranu zwarc (`element_id ?? target_id`). Pole ADDYTYWNE:
    #: starszy wynik bez `element_id` ⇒ ``None`` ⇒ pominiete w serializacji.
    element_id: str | None = None
    ikss_ka_a: float | None = None
    ikss_ka_b: float | None = None
    delta_ikss_ka: float | None = None
    delta_ikss_percent: float | None = None
    ip_ka_a: float | None = None
    ip_ka_b: float | None = None
    delta_ip_ka: float | None = None
    delta_ip_percent: float | None = None
    ith_ka_a: float | None = None
    ith_ka_b: float | None = None
    delta_ith_ka: float | None = None
    delta_ith_percent: float | None = None
    sk_mva_a: float | None = None
    sk_mva_b: float | None = None
    delta_sk_mva: float | None = None
    delta_sk_percent: float | None = None
    # Pelny bilans IEC 60909 (kolumny trybu eksperckiego ekranu porownan).
    # Te same reguly: brak pola w starszym wyniku ⇒ None ⇒ pole pomijane.
    rk_ohm_a: float | None = None
    rk_ohm_b: float | None = None
    delta_rk_ohm: float | None = None
    delta_rk_percent: float | None = None
    xk_ohm_a: float | None = None
    xk_ohm_b: float | None = None
    delta_xk_ohm: float | None = None
    delta_xk_percent: float | None = None
    zk_ohm_a: float | None = None
    zk_ohm_b: float | None = None
    delta_zk_ohm: float | None = None
    delta_zk_percent: float | None = None
    xr_ratio_a: float | None = None
    xr_ratio_b: float | None = None
    delta_xr_ratio: float | None = None
    delta_xr_percent: float | None = None
    i2t_ka2s_a: float | None = None
    i2t_ka2s_b: float | None = None
    delta_i2t_ka2s: float | None = None
    delta_i2t_percent: float | None = None
    # Karta TB-WARTOSC-ROBOCZA: wielkości zależne od czasu wyłączenia t_b (I_b z udziałem
    # maszyn, i_DC(t_b)) i sam t_b punktu z pochodzeniem — różnica I_b/i_DC między biegami
    # bywa skutkiem samej zmiany t_b (wartość robocza → t_b projektanta), więc porównanie
    # niesie t_b i jego pochodzenie obok delt. Te same reguły exclude_none.
    ib_ka_a: float | None = None
    ib_ka_b: float | None = None
    delta_ib_ka: float | None = None
    delta_ib_percent: float | None = None
    i_dc_ka_a: float | None = None
    i_dc_ka_b: float | None = None
    delta_i_dc_ka: float | None = None
    delta_i_dc_percent: float | None = None
    tb_s_a: float | None = None
    tb_s_b: float | None = None
    delta_tb_s: float | None = None
    delta_tb_percent: float | None = None
    #: Pochodzenie t_b strony (``PROJEKTANT`` / ``Z_POL`` / ``PROPOZYCJA``) i znacznik
    #: wartości roboczej — przepisane z wiersza wyniku, nie wyliczane.
    tb_pochodzenie_a: str | None = None
    tb_pochodzenie_b: str | None = None
    tb_wartosc_robocza_a: bool | None = None
    tb_wartosc_robocza_b: bool | None = None

    def to_dict(self) -> dict[str, Any]:
        """Serializacja z pominieciem pol nieistniejacych (``exclude_none``)."""
        dane: dict[str, Any] = {
            "target_id": self.target_id,
            "target_name": self.target_name,
            "obecny_w": self.obecny_w,
        }
        if self.element_id is not None:
            dane["element_id"] = self.element_id
        for klucz, wartosc in (
            ("ikss_ka_a", self.ikss_ka_a),
            ("ikss_ka_b", self.ikss_ka_b),
            ("delta_ikss_ka", self.delta_ikss_ka),
            ("delta_ikss_percent", self.delta_ikss_percent),
            ("ip_ka_a", self.ip_ka_a),
            ("ip_ka_b", self.ip_ka_b),
            ("delta_ip_ka", self.delta_ip_ka),
            ("delta_ip_percent", self.delta_ip_percent),
            ("ith_ka_a", self.ith_ka_a),
            ("ith_ka_b", self.ith_ka_b),
            ("delta_ith_ka", self.delta_ith_ka),
            ("delta_ith_percent", self.delta_ith_percent),
            ("sk_mva_a", self.sk_mva_a),
            ("sk_mva_b", self.sk_mva_b),
            ("delta_sk_mva", self.delta_sk_mva),
            ("delta_sk_percent", self.delta_sk_percent),
            ("rk_ohm_a", self.rk_ohm_a),
            ("rk_ohm_b", self.rk_ohm_b),
            ("delta_rk_ohm", self.delta_rk_ohm),
            ("delta_rk_percent", self.delta_rk_percent),
            ("xk_ohm_a", self.xk_ohm_a),
            ("xk_ohm_b", self.xk_ohm_b),
            ("delta_xk_ohm", self.delta_xk_ohm),
            ("delta_xk_percent", self.delta_xk_percent),
            ("zk_ohm_a", self.zk_ohm_a),
            ("zk_ohm_b", self.zk_ohm_b),
            ("delta_zk_ohm", self.delta_zk_ohm),
            ("delta_zk_percent", self.delta_zk_percent),
            ("xr_ratio_a", self.xr_ratio_a),
            ("xr_ratio_b", self.xr_ratio_b),
            ("delta_xr_ratio", self.delta_xr_ratio),
            ("delta_xr_percent", self.delta_xr_percent),
            ("i2t_ka2s_a", self.i2t_ka2s_a),
            ("i2t_ka2s_b", self.i2t_ka2s_b),
            ("delta_i2t_ka2s", self.delta_i2t_ka2s),
            ("delta_i2t_percent", self.delta_i2t_percent),
            ("ib_ka_a", self.ib_ka_a),
            ("ib_ka_b", self.ib_ka_b),
            ("delta_ib_ka", self.delta_ib_ka),
            ("delta_ib_percent", self.delta_ib_percent),
            ("i_dc_ka_a", self.i_dc_ka_a),
            ("i_dc_ka_b", self.i_dc_ka_b),
            ("delta_i_dc_ka", self.delta_i_dc_ka),
            ("delta_i_dc_percent", self.delta_i_dc_percent),
            ("tb_s_a", self.tb_s_a),
            ("tb_s_b", self.tb_s_b),
            ("delta_tb_s", self.delta_tb_s),
            ("delta_tb_percent", self.delta_tb_percent),
            ("tb_pochodzenie_a", self.tb_pochodzenie_a),
            ("tb_pochodzenie_b", self.tb_pochodzenie_b),
            ("tb_wartosc_robocza_a", self.tb_wartosc_robocza_a),
            ("tb_wartosc_robocza_b", self.tb_wartosc_robocza_b),
        ):
            if wartosc is not None:
                dane[klucz] = wartosc
        return dane


@dataclass(frozen=True)
class ZwarciaPorownanie:
    """Wynik porownania dwoch przebiegow zwarciowych."""

    run_id_a: str
    run_id_b: str
    punkty: tuple[PunktZwarciowyDiff, ...]
    #: Ile punktow ma odpowiednik po obu stronach, a ile jest osieroconych.
    liczba_punktow_wspolnych: int
    liczba_punktow_tylko_a: int
    liczba_punktow_tylko_b: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "run_id_a": self.run_id_a,
            "run_id_b": self.run_id_b,
            "punkty": [p.to_dict() for p in self.punkty],
            "liczba_punktow_wspolnych": self.liczba_punktow_wspolnych,
            "liczba_punktow_tylko_a": self.liczba_punktow_tylko_a,
            "liczba_punktow_tylko_b": self.liczba_punktow_tylko_b,
        }


def zbuduj_porownanie_zwarc(
    *,
    run_id_a: str,
    run_id_b: str,
    wiersze_a: list[dict[str, Any]],
    wiersze_b: list[dict[str, Any]],
) -> ZwarciaPorownanie:
    """Zbuduj porownanie per punkt zwarciowy z dwoch zestawow wierszy wynikow.

    Wiersze to kanoniczne wiersze wyniku zwarciowego (`target_id`, `target_name`,
    `ikss_ka`, `ip_ka`, `ith_ka`, `sk_mva`). Funkcja jest CZYSTA i
    deterministyczna: te same wejscia dają identyczne wyjscie.
    """
    mapa_a = {str(w.get("target_id")): w for w in wiersze_a if w.get("target_id") is not None}
    mapa_b = {str(w.get("target_id")): w for w in wiersze_b if w.get("target_id") is not None}
    klucze = sorted(set(mapa_a) | set(mapa_b))

    punkty: list[PunktZwarciowyDiff] = []
    wspolne = tylko_a = tylko_b = 0
    for klucz in klucze:
        a = mapa_a.get(klucz)
        b = mapa_b.get(klucz)
        if a is not None and b is not None:
            obecny = OBECNY_W_OBU
            wspolne += 1
        elif a is not None:
            obecny = OBECNY_TYLKO_A
            tylko_a += 1
        else:
            obecny = OBECNY_TYLKO_B
            tylko_b += 1

        zrodlo = a or b or {}
        # Wiersz bez nazwy celu (starszy wynik) nazywa opis rodzaju — nigdy klucz wiersza,
        # który jest identyfikatorem węzła (karta NAZWY-JEDNO-ZRODLO, klasa karty #144).
        nazwa = nazwa_nadana(zrodlo.get("target_name")) or opis_bez_nazwy("buses")
        # Ref schematu: `element_id` wiersza; brak pola (starszy wynik) ⇒ None,
        # a konsument nakladki schodzi wtedy na `target_id` — JEDNA regula,
        # ta sama co w akcji „Pokaz na schemacie" ekranu zwarc.
        element_id = zrodlo.get("element_id")
        wartosci: dict[str, tuple[float | None, float | None]] = {
            pole: (
                _liczba(a, pole) if a is not None else None,
                _liczba(b, pole) if b is not None else None,
            )
            for pole in (
                "ikss_ka",
                "ip_ka",
                "ith_ka",
                "sk_mva",
                "rk_ohm",
                "xk_ohm",
                "zk_ohm",
                "xr_ratio",
                "i2t_ka2s",
                "ib_ka",
                "i_dc_ka",
                "tb_s",
            )
        }
        tb_a = _pochodzenie_tb(a)
        tb_b = _pochodzenie_tb(b)

        punkty.append(
            PunktZwarciowyDiff(
                target_id=klucz,
                target_name=nazwa,
                obecny_w=obecny,
                element_id=str(element_id) if element_id is not None else None,
                ikss_ka_a=wartosci["ikss_ka"][0],
                ikss_ka_b=wartosci["ikss_ka"][1],
                delta_ikss_ka=_delta(*wartosci["ikss_ka"]),
                delta_ikss_percent=procent_roznicy(*wartosci["ikss_ka"]),
                ip_ka_a=wartosci["ip_ka"][0],
                ip_ka_b=wartosci["ip_ka"][1],
                delta_ip_ka=_delta(*wartosci["ip_ka"]),
                delta_ip_percent=procent_roznicy(*wartosci["ip_ka"]),
                ith_ka_a=wartosci["ith_ka"][0],
                ith_ka_b=wartosci["ith_ka"][1],
                delta_ith_ka=_delta(*wartosci["ith_ka"]),
                delta_ith_percent=procent_roznicy(*wartosci["ith_ka"]),
                sk_mva_a=wartosci["sk_mva"][0],
                sk_mva_b=wartosci["sk_mva"][1],
                delta_sk_mva=_delta(*wartosci["sk_mva"]),
                delta_sk_percent=procent_roznicy(*wartosci["sk_mva"]),
                rk_ohm_a=wartosci["rk_ohm"][0],
                rk_ohm_b=wartosci["rk_ohm"][1],
                delta_rk_ohm=_delta(*wartosci["rk_ohm"]),
                delta_rk_percent=procent_roznicy(*wartosci["rk_ohm"]),
                xk_ohm_a=wartosci["xk_ohm"][0],
                xk_ohm_b=wartosci["xk_ohm"][1],
                delta_xk_ohm=_delta(*wartosci["xk_ohm"]),
                delta_xk_percent=procent_roznicy(*wartosci["xk_ohm"]),
                zk_ohm_a=wartosci["zk_ohm"][0],
                zk_ohm_b=wartosci["zk_ohm"][1],
                delta_zk_ohm=_delta(*wartosci["zk_ohm"]),
                delta_zk_percent=procent_roznicy(*wartosci["zk_ohm"]),
                xr_ratio_a=wartosci["xr_ratio"][0],
                xr_ratio_b=wartosci["xr_ratio"][1],
                delta_xr_ratio=_delta(*wartosci["xr_ratio"]),
                delta_xr_percent=procent_roznicy(*wartosci["xr_ratio"]),
                i2t_ka2s_a=wartosci["i2t_ka2s"][0],
                i2t_ka2s_b=wartosci["i2t_ka2s"][1],
                delta_i2t_ka2s=_delta(*wartosci["i2t_ka2s"]),
                delta_i2t_percent=procent_roznicy(*wartosci["i2t_ka2s"]),
                ib_ka_a=wartosci["ib_ka"][0],
                ib_ka_b=wartosci["ib_ka"][1],
                delta_ib_ka=_delta(*wartosci["ib_ka"]),
                delta_ib_percent=procent_roznicy(*wartosci["ib_ka"]),
                i_dc_ka_a=wartosci["i_dc_ka"][0],
                i_dc_ka_b=wartosci["i_dc_ka"][1],
                delta_i_dc_ka=_delta(*wartosci["i_dc_ka"]),
                delta_i_dc_percent=procent_roznicy(*wartosci["i_dc_ka"]),
                tb_s_a=wartosci["tb_s"][0],
                tb_s_b=wartosci["tb_s"][1],
                delta_tb_s=_delta(*wartosci["tb_s"]),
                delta_tb_percent=procent_roznicy(*wartosci["tb_s"]),
                tb_pochodzenie_a=tb_a[0],
                tb_pochodzenie_b=tb_b[0],
                tb_wartosc_robocza_a=tb_a[1],
                tb_wartosc_robocza_b=tb_b[1],
            )
        )

    return ZwarciaPorownanie(
        run_id_a=run_id_a,
        run_id_b=run_id_b,
        punkty=tuple(punkty),
        liczba_punktow_wspolnych=wspolne,
        liczba_punktow_tylko_a=tylko_a,
        liczba_punktow_tylko_b=tylko_b,
    )
