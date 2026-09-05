"""Harness parytetu ASSEMBLERA (karta CV-4.1, konstytucja C.2.3).

Po co: karta CV-4.1 wycina z ``enm/canonical_analysis.py`` składanie wejścia
solvera rozpływu i zwarcia do osobnego modułu ``enm/assembler.py`` (jeden
assembler ES → IR → kontrakt). Refaktor jest dozwolony WYŁĄCZNIE, gdy wynik
każdego biegu kanonicznego jest bit w bit ten sam co przed wycięciem — a to
da się udowodnić tylko wtedy, gdy hashe wyników zebrano na stanie SPRZED
zmiany. Ten harness liczy PF i zwarcia (3F max/min, 1F, 2F, 2FG) dla KAŻDEJ
sieci ENM rejestru (``tests/golden/registry.py``) torem kanonicznym
(``_execute_power_flow`` / ``_execute_short_circuit`` na ``CanonicalRun`` w
pamięci) i hashuje ``raw_result`` tą samą funkcją, co harness parytetu
scenariuszy (``hash_widoku``: kwantyzacja kontraktu liczb, klucze lotne
wykluczone) — ale WYŁĄCZNIE dla SZKIELETU wyniku (struktura bez liczb);
liczby kontraktu są zapisywane w złotym pliku i porównywane z tolerancją
(``widok_parytetu``, ``porownaj_wpis``: surowy wynik solvera nie jest przenośny
między maszynami przy żadnej kwantyzacji do cyfr — pomiar CI runy 4871/4873). Odmowa (wyjątek) TEŻ jest wynikiem i też jest pinowana —
parytet odmowy jest częścią parytetu.

Decyzje:
- sieci z rejestru budowane ``registry.zbuduj_wszystkie`` (tylko ``PostacSieci.ENM``;
  dialekt benchmarków B-BENCH nie idzie torem kanonicznym — do zwinięcia w CV-4.3);
- bieg w pamięci: stały ``id``/``case_id``/``snapshot_hash``/``created_at`` (proof_ref
  liczony z tych pól jest wtedy stały), zero magazynu, zero DB (opcje audit2 puste);
- klucz: ``<id rejestru>/<nr>:<nazwa nagłówka ENM>/<analiza>``.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from enm.canonical_analysis import CanonicalRun, _execute_power_flow, _execute_short_circuit
from enm.models import EnergyNetworkModel

from tests.golden import registry
from tests.golden.parytet_scenariuszy.harness import _do_postaci_json, hash_widoku
from tests.golden.registry import REJESTR, PostacSieci

_ID_BIEGU = UUID("00000000-0000-4000-8000-0000000000c4")  # CV-4, stały dla CAŁEGO harnessu
_CZAS_BIEGU = datetime(2026, 1, 1, tzinfo=UTC)

#: Warianty zwarcia pinowane per sieć: (klucz, opcje biegu).
WARIANTY_ZWARC: tuple[tuple[str, dict[str, Any]], ...] = (
    ("SC_3F_max", {"fault_type": "3F", "scenario": "max", "thermal_time_seconds": 1.0}),
    ("SC_3F_min", {"fault_type": "3F", "scenario": "min", "thermal_time_seconds": 1.0}),
    ("SC_1F_max", {"fault_type": "1F", "scenario": "max", "thermal_time_seconds": 1.0}),
    ("SC_2F_max", {"fault_type": "2F", "scenario": "max", "thermal_time_seconds": 1.0}),
    ("SC_2FG_max", {"fault_type": "2FG", "scenario": "max", "thermal_time_seconds": 1.0}),
)


def _jako_enm(siec: object) -> EnergyNetworkModel:
    return siec if isinstance(siec, EnergyNetworkModel) else EnergyNetworkModel.model_validate(siec)


def sieci_enm_rejestru() -> list[tuple[str, EnergyNetworkModel]]:
    """Wszystkie sieci ENM rejestru w deterministycznej kolejności (rejestr → indeks)."""
    wynik: list[tuple[str, EnergyNetworkModel]] = []
    for wpis in REJESTR:
        if not wpis.budowniczowie or wpis.postac is not PostacSieci.ENM:
            continue
        for indeks, siec in enumerate(registry.zbuduj_wszystkie(wpis.id)):
            enm = _jako_enm(siec)
            nazwa = str(enm.header.name or "").strip() or "bez_nazwy"
            wynik.append((f"{wpis.id}/{indeks:02d}:{nazwa}", enm))
    return wynik


def _bieg(
    enm: EnergyNetworkModel, *, klucz: str, analysis_type: str, options: dict[str, Any]
) -> CanonicalRun:
    return CanonicalRun(
        id=_ID_BIEGU,
        case_id=f"parytet-cv4-{klucz}",
        project_id="parytet-cv4",
        analysis_type=analysis_type,
        status="FINISHED",
        created_at=_CZAS_BIEGU,
        snapshot_hash=f"snap-{klucz}",
        input_hash=f"in-{klucz}",
        snapshot=enm.model_dump(mode="json"),
        validation={},
        readiness={},
        options=dict(options),
    )


#: Klucze śladu White Box per węzeł zwarcia (``results[i].*``) — ich LICZBY nie
#: wchodzą do porównania liczbowego (struktura, klucze i długości list zostają w
#: szkielecie). Pomiar (sieć G00/00, 52 stacje, SC 3F): per węzeł zwarcia
#: ``branch_contributions`` 2 906 liczb / 0,8 MB, ``branch_flow_trace`` 1 579,
#: ``white_box_trace`` 628 — razem 549 k liczb / 108 MB JSON na JEDEN bieg;
#: liczby kontraktu (``ikss_a``, ``ip_a``, ``ith_a``, ``ib_a``, ``sk_mva``, ``kappa``,
#: ``zkk_ohm``, ``contributions``…) to ~64 na węzeł. Ślad jest funkcją TYCH SAMYCH
#: wielkości, które kontrakt niesie w agregatach — parytet agregatów + parytet
#: struktury śladu to dowód wystarczający dla CI; lokalnie (ta sama maszyna)
#: ``test_harness_jest_deterministyczny`` nadal wymaga równości DOKŁADNEJ.
KLUCZE_SLADU_LICZBOWEGO: frozenset[str] = frozenset(
    {"branch_contributions", "branch_flow_trace", "white_box_trace"}
)
#: Tolerancja porównania liczb kontraktu między maszynami (jednostki kontraktu:
#: MW, Mvar, kV, kA, A, pu, Ω, s). Uzasadnienie w ``widok_parytetu``.
RTOL_PARYTETU = 2e-6
ATOL_PARYTETU = 1e-9
#: Cyfry znaczące zapisu wartości w złotym pliku (błąd zapisu ≤ 5·10⁻⁷ < RTOL).
CYFRY_ZAPISU = 7
ZNACZNIK_LICZBY = "<f>"


def widok_parytetu(wartosc: Any) -> tuple[Any, list[tuple[str, float]]]:
    """Szkielet (porównywany DOKŁADNIE) + liczby kontraktu (porównywane z tolerancją).

    Dlaczego nie jeden hash: surowy wynik solvera nie jest przenośny między
    maszynami przy ŻADNEJ kwantyzacji do cyfr — CI (run 4871 na ``3d47c275``:
    9 cyfr znaczących; run 4873 na ``5793a3e0``: 9 cyfr znaczących ∧ 9 miejsc
    dziesiętnych) dawało inne hashe niż ta sama gałąź lokalnie, przy
    identycznych odmowach. Źródło: rozwiązania układów o złym uwarunkowaniu
    (Ybus/Zbus sieci z bardzo małymi impedancjami) wzmacniają szum sumowania
    BLAS/CPU do 10⁻⁸…10⁻⁹ względnie, a każde zaokrąglenie do siatki ma granice
    — przy tysiącach wartości na bieg jakaś zawsze leży przy granicy. Hash jest
    więc właściwy TYLKO dla części dyskretnej wyniku; liczby wymagają
    porównania z tolerancją względem ZAPISANYCH wartości.

    Szkielet: cały ``raw_result`` (klucze posortowane, listy w kolejności) z każdą
    liczbą zmiennoprzecinkową zastąpioną znacznikiem ``"<f>"``; ``bool``/``int``/
    ``str``/``None`` zostają — statusy, ograniczenia raportowe, identyfikatory
    węzłów, ``proof_ref``, długości list (liczba węzłów zwarcia, wkładów, kroków
    śladu) są porównywane DOKŁADNIE. Liczby: wszystkie liczby zmiennoprzecinkowe
    poza poddrzewami ``KLUCZE_SLADU_LICZBOWEGO``, jako pary (ścieżka, wartość) w
    deterministycznej kolejności obejścia szkieletu.
    """
    liczby: list[tuple[str, float]] = []

    def _odwiedz(w: Any, sciezka: str, w_sladzie: bool) -> Any:
        if isinstance(w, bool) or w is None or isinstance(w, int | str):
            return w
        if isinstance(w, float):
            if not w_sladzie:
                liczby.append((sciezka, w))
            return ZNACZNIK_LICZBY
        if isinstance(w, dict):
            return {
                klucz: _odwiedz(
                    w[klucz], f"{sciezka}.{klucz}", w_sladzie or klucz in KLUCZE_SLADU_LICZBOWEGO
                )
                for klucz in sorted(w)
            }
        if isinstance(w, list | tuple):
            return [_odwiedz(x, f"{sciezka}[{i}]", w_sladzie) for i, x in enumerate(w)]
        return w

    szkielet = _odwiedz(_do_postaci_json(wartosc), "$", False)
    return szkielet, liczby


def zapis_liczby(wartosc: float) -> float:
    """Wartość do złotego pliku: ``CYFRY_ZAPISU`` cyfr znaczących, zero bez znaku."""
    if wartosc == 0.0:
        return 0.0
    return float(f"{wartosc:.{CYFRY_ZAPISU - 1}e}")


def porownaj_wpis(zloty: dict[str, Any], teraz: dict[str, Any]) -> list[str]:
    """Rozbieżności złoty↔teraz (pusta lista = parytet).

    Odmowa: tekst DOKŁADNIE. Szkielet: hash DOKŁADNIE. Liczby: ta sama długość i
    ``|a − b| ≤ ATOL + RTOL·|a|`` dla każdej pary; meldunek podaje ścieżki z
    ``teraz["sciezki"]`` (jeśli są), żeby rozbieżność dało się wskazać w wyniku.
    """
    if zloty.get("odmowa") != teraz.get("odmowa"):
        return [f"odmowa: złoty={zloty.get('odmowa')!r} teraz={teraz.get('odmowa')!r}"]
    if zloty.get("odmowa") is not None:
        return []
    if zloty.get("szkielet_sha256") != teraz.get("szkielet_sha256"):
        return [
            f"szkielet: złoty={zloty.get('szkielet_sha256')} teraz={teraz.get('szkielet_sha256')}"
        ]
    zl, te = zloty.get("liczby") or [], teraz.get("liczby") or []
    if len(zl) != len(te):
        return [f"liczba wartości kontraktu: złoty={len(zl)} teraz={len(te)}"]
    sciezki = teraz.get("sciezki") or []
    rozbieznosci = [
        (i, a, b)
        for i, (a, b) in enumerate(zip(zl, te, strict=True))
        if abs(a - b) > ATOL_PARYTETU + RTOL_PARYTETU * abs(a)
    ]
    if not rozbieznosci:
        return []
    przyklady = ", ".join(
        f"{sciezki[i] if i < len(sciezki) else '#' + str(i)}: złoty={a!r} teraz={b!r}"
        for i, a, b in rozbieznosci[:5]
    )
    return [f"liczby: {len(rozbieznosci)} rozbieżności ponad tolerancję, np. {przyklady}"]


def wpis_do_zapisu(wpis: dict[str, Any]) -> dict[str, Any]:
    """Wpis złotego pliku: bez ścieżek (są odtwarzalne z bieżącego wyniku)."""
    return {k: v for k, v in wpis.items() if k != "sciezki"}


def _wynik_lub_odmowa(wykonaj: Any, run: CanonicalRun) -> dict[str, Any]:
    try:
        wykonaj(run)
    except Exception as exc:  # noqa: BLE001 — odmowa jest wynikiem pinowanym
        return {
            "odmowa": f"{type(exc).__name__}: {exc}",
            "szkielet_sha256": None,
            "liczby": None,
            "sciezki": None,
        }
    szkielet, liczby = widok_parytetu(run.raw_result)
    return {
        "odmowa": None,
        "szkielet_sha256": hash_widoku(szkielet),
        "liczby": [zapis_liczby(x) for _, x in liczby],
        "sciezki": [sciezka for sciezka, _ in liczby],
    }


def zbierz_hashe(
    sieci: list[tuple[str, EnergyNetworkModel]] | None = None
) -> dict[str, dict[str, Any]]:
    """Hashe PF + wariantów zwarć dla każdej sieci ENM rejestru (deterministyczne)."""
    wyniki: dict[str, dict[str, Any]] = {}
    for klucz_sieci, enm in sieci if sieci is not None else sieci_enm_rejestru():
        klucz_pf = f"{klucz_sieci}/PF"
        wyniki[klucz_pf] = _wynik_lub_odmowa(
            _execute_power_flow, _bieg(enm, klucz=klucz_pf, analysis_type="PF", options={})
        )
        for nazwa, opcje in WARIANTY_ZWARC:
            klucz = f"{klucz_sieci}/{nazwa}"
            wyniki[klucz] = _wynik_lub_odmowa(
                _execute_short_circuit,
                _bieg(enm, klucz=klucz, analysis_type="short_circuit_sn", options=opcje),
            )
    return wyniki
