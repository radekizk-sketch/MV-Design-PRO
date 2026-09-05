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
wykluczone) — ale WYŁĄCZNIE dla SZKIELETU wyniku (struktura kontraktu bez
liczb i bez poddrzew śladu White Box); liczby kontraktu są zapisywane w złotym
pliku i porównywane z tolerancją, poddrzewa śladu nie są porównywane między
maszynami w ogóle (``widok_parytetu``, ``porownaj_wpis``: surowy wynik solvera
nie jest przenośny między maszynami przy żadnej kwantyzacji do cyfr — pomiar CI
runy 4871/4873; struktura śladu też nie — run 4876). Skróty poddrzew szkieletu
do głębokości ``GLEBOKOSC_SKROTOW`` (``skroty_szkieletu``) są w złotym pliku po
to, żeby czerwony CI nazwał ŚCIEŻKĘ rozbieżności, a nie tylko hash. Odmowa
(wyjątek) TEŻ jest wynikiem i też jest pinowana — parytet odmowy jest częścią
parytetu.

Decyzje:
- sieci z rejestru budowane ``registry.zbuduj_wszystkie`` (tylko ``PostacSieci.ENM``;
  dialekt benchmarków B-BENCH nie idzie torem kanonicznym — do zwinięcia w CV-4.3);
- bieg w pamięci: stały ``id``/``case_id``/``snapshot_hash``/``created_at`` (proof_ref
  liczony z tych pól jest wtedy stały), zero magazynu, zero DB (opcje audit2 puste);
- klucz: ``<id rejestru>/<nr>:<nazwa nagłówka ENM>/<analiza>``.
"""

from __future__ import annotations

import re
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


#: Klucze poddrzew śladu White Box per węzeł zwarcia (``results[i].*``). Poddrzewo
#: śladu NIE wchodzi do porównania między maszynami W OGÓLE — ani liczby, ani
#: struktura. Solver (FROZEN, B-01) buduje listy śladu progiem zerowym na liczbie
#: (``if i_a <= 0: continue`` / ``if i_mag <= 0: continue`` w
#: ``_build_branch_contributions_for_*``), więc gałąź o prądzie DOKŁADNIE 0 na
#: jednej maszynie i 10⁻¹⁷ na drugiej wchodzi do listy albo nie — długość listy,
#: pozycja wpisu bilansu KCL i obecność notatek (``notes``: ``None``/napis) są
#: funkcją szumu. Pomiar: CI run 4876 na ``40e49c22`` — 155 wpisów SC
#: (G00/G03/G04/G05/G08) z innym szkieletem przy ZEROWEJ rozbieżności liczb
#: kontraktu; sonda lokalna (szum 10⁻¹² na ``np.linalg.inv``) odtwarza klasę:
#: G04/00 ``branch_contributions`` 9 vs 10, ``branch_flow_trace`` 6 vs 7. Rozmiar
#: (sieć G00/00, 52 stacje, SC 3F): per węzeł zwarcia ``branch_contributions``
#: 2 906 liczb / 0,8 MB, ``branch_flow_trace`` 1 579, ``white_box_trace`` 628 —
#: razem 549 k liczb / 108 MB JSON na JEDEN bieg; liczby kontraktu (``ikss_a``,
#: ``ip_a``, ``ith_a``, ``ib_a``, ``sk_mva``, ``kappa``, ``zkk_ohm``,
#: ``contributions``…) to ~64 na węzeł. Ślad jest funkcją TYCH SAMYCH wielkości,
#: które kontrakt niesie w agregatach — parytet agregatów + obecność śladu to
#: dowód dla CI; lokalnie (ta sama maszyna) ``test_harness_jest_deterministyczny``
#: wymaga równości DOKŁADNEJ także śladu (``slad_sha256`` — skrót pełnych
#: poddrzew śladu, liczony tylko w pamięci, nie w złotym pliku).
KLUCZE_SLADU_LICZBOWEGO: frozenset[str] = frozenset(
    {"branch_contributions", "branch_flow_trace", "white_box_trace"}
)
#: Tolerancja porównania liczb kontraktu między maszynami (jednostki kontraktu:
#: MW, Mvar, kV, kA, A, pu, Ω, s). ATOL = 10⁻⁶ jednostki (1 W, 1 mV, 1 mA):
#: pomiar CI run 4875 (52 stacje, PF) — 324 wartości gałęzi rzędu 10⁻¹⁴…10⁻⁶
#: (przepływy gałęzi nieobciążonych) to czysty szum zaokrągleń, przy ATOL 10⁻⁹
#: 14 z nich przekraczało tolerancję między maszynami. Uzasadnienie w
#: ``widok_parytetu``.
RTOL_PARYTETU = 2e-6
ATOL_PARYTETU = 1e-6
#: Cyfry znaczące zapisu wartości w złotym pliku (błąd zapisu ≤ 5·10⁻⁷ < RTOL).
CYFRY_ZAPISU = 7
#: Głębokość mapy skrótów poddrzew szkieletu (``skroty_szkieletu``): 2 = klucze
#: szczytu (``$.results``, ``$.graph``…) i ich bezpośrednie dzieci
#: (``$.results[7]``, ``$.graph.nodes``) — czerwony CI wskazuje węzeł zwarcia,
#: a test dopisuje szkielet tego poddrzewa do meldunku. Głębiej (klucze wiersza
#: wyniku × ~100 węzłów) mapa rosłaby do tysięcy wpisów na bieg.
GLEBOKOSC_SKROTOW = 2
DLUGOSC_SKROTU = 16
ZNACZNIK_LICZBY = "<f>"
ZNACZNIK_SLADU = "<slad>"
ZNACZNIK_SKROTU = "<sha256>"
_SKROT_HEX = re.compile(r"[0-9a-f]{64}")
_TOKEN_SCIEZKI = re.compile(r"\.([^.\[]+)|\[(\d+)\]")


def widok_parytetu(wartosc: Any) -> tuple[Any, list[tuple[str, float]], list[Any]]:
    r"""Szkielet (porównywany DOKŁADNIE), liczby kontraktu (z tolerancją), ślady (lokalnie).

    Dlaczego nie jeden hash: surowy wynik solvera nie jest przenośny między
    maszynami przy ŻADNEJ kwantyzacji do cyfr — CI (run 4871 na ``3d47c275``:
    9 cyfr znaczących; run 4873 na ``5793a3e0``: 9 cyfr znaczących ∧ 9 miejsc
    dziesiętnych) dawało inne hashe niż ta sama gałąź lokalnie, przy
    identycznych odmowach. Źródło: rozwiązania układów o złym uwarunkowaniu
    (Ybus/Zbus sieci z bardzo małymi impedancjami) wzmacniają szum sumowania
    BLAS/CPU do 10⁻⁸…10⁻⁹ względnie, a każde zaokrąglenie do siatki ma granice
    — przy tysiącach wartości na bieg jakaś zawsze leży przy granicy. Hash jest
    więc właściwy TYLKO dla części dyskretnej wyniku, która jest funkcją WEJŚCIA,
    nie liczb solvera; liczby wymagają porównania z tolerancją względem
    ZAPISANYCH wartości.

    Szkielet: ``raw_result`` (klucze posortowane, listy w kolejności) z każdą
    liczbą zmiennoprzecinkową zastąpioną znacznikiem ``"<f>"``; ``bool``/``int``/
    ``str``/``None`` zostają — statusy, ograniczenia raportowe, identyfikatory
    węzłów, długości list kontraktu (liczba węzłów zwarcia, wkładów źródeł) są
    porównywane DOKŁADNIE, z dwoma wyjątkami zmierzonymi na CI: (1) poddrzewa
    ``KLUCZE_SLADU_LICZBOWEGO`` → ``"<slad>"`` (``None`` zostaje ``None`` — obecność
    śladu jest funkcją opcji biegu): ich struktura powstaje progiem zerowym na
    liczbie solvera (run 4876, patrz komentarz przy stałej), a wcześniej (run
    4875) napisy w nich niosły liczby sformatowane do 6 cyfr (``substitution_latex``
    ``0.6 \cdot 0.0483606``) — ten sam szum w innej postaci; (2) skróty SHA-256
    pochodne od WYNIKU (``proof_ref = "proof:short-circuit:<64 hex>"``,
    ``proof_binding.proof_ref``) różnią się między maszynami dokładnie dlatego, że
    wynik różni się szumem — 64-znakowy heks w napisie → ``"<sha256>"`` (prefiks
    zostaje, więc rodzaj dowodu i jego obecność są porównywane). Liczby: wszystkie
    liczby zmiennoprzecinkowe poza poddrzewami śladu, jako pary (ścieżka, wartość)
    w deterministycznej kolejności obejścia szkieletu. Ślady: pełne poddrzewa
    śladu w kolejności obejścia — do skrótu ``slad_sha256`` (tylko ta sama maszyna).
    """
    liczby: list[tuple[str, float]] = []
    slady: list[Any] = []

    def _odwiedz(w: Any, sciezka: str) -> Any:
        if isinstance(w, bool) or w is None or isinstance(w, int):
            return w
        if isinstance(w, str):
            return _SKROT_HEX.sub(ZNACZNIK_SKROTU, w)
        if isinstance(w, float):
            liczby.append((sciezka, w))
            return ZNACZNIK_LICZBY
        if isinstance(w, dict):
            widok: dict[str, Any] = {}
            for klucz in sorted(w):
                if klucz in KLUCZE_SLADU_LICZBOWEGO and w[klucz] is not None:
                    slady.append(w[klucz])
                    widok[klucz] = ZNACZNIK_SLADU
                else:
                    widok[klucz] = _odwiedz(w[klucz], f"{sciezka}.{klucz}")
            return widok
        if isinstance(w, list | tuple):
            return [_odwiedz(x, f"{sciezka}[{i}]") for i, x in enumerate(w)]
        return w

    szkielet = _odwiedz(_do_postaci_json(wartosc), "$")
    return szkielet, liczby, slady


def skroty_szkieletu(szkielet: Any) -> dict[str, str]:
    """Skróty poddrzew szkieletu do głębokości ``GLEBOKOSC_SKROTOW`` (bez korzenia).

    Diagnostyka czerwonego CI: ``porownaj_wpis`` nazywa ścieżki, których skrót
    różni się od złotego (liście — rodzic różni się, bo różni się dziecko).
    """
    skroty: dict[str, str] = {}

    def _zejdz(w: Any, sciezka: str, glebokosc: int) -> None:
        if glebokosc > 0:
            skroty[sciezka] = hash_widoku(w)[:DLUGOSC_SKROTU]
        if glebokosc >= GLEBOKOSC_SKROTOW:
            return
        if isinstance(w, dict):
            for klucz, v in w.items():
                _zejdz(v, f"{sciezka}.{klucz}", glebokosc + 1)
        elif isinstance(w, list):
            for i, v in enumerate(w):
                _zejdz(v, f"{sciezka}[{i}]", glebokosc + 1)

    _zejdz(szkielet, "$", 0)
    return skroty


def poddrzewo(szkielet: Any, sciezka: str) -> Any:
    """Poddrzewo szkieletu pod ścieżką ``$.klucz[3].klucz`` (do meldunku testu)."""
    w = szkielet
    for klucz, indeks in _TOKEN_SCIEZKI.findall(sciezka):
        w = w[int(indeks)] if indeks else w[klucz]
    return w


def zapis_liczby(wartosc: float) -> float:
    """Wartość do złotego pliku: ``CYFRY_ZAPISU`` cyfr znaczących, zero bez znaku."""
    if wartosc == 0.0:
        return 0.0
    return float(f"{wartosc:.{CYFRY_ZAPISU - 1}e}")


def sciezki_rozbieznosci_szkieletu(zloty: dict[str, Any], teraz: dict[str, Any]) -> list[str]:
    """Liście mapy skrótów, które różnią się między złotym a bieżącym wpisem.

    Bez mapy po którejś stronie (wpis sprzed mapy) — pusta lista: każda ścieżka
    „różniłaby się", a to nie jest diagnoza.
    """
    zl, te = zloty.get("szkielet_skroty") or {}, teraz.get("szkielet_skroty") or {}
    if not zl or not te:
        return []
    rozne = sorted(p for p in set(zl) | set(te) if zl.get(p) != te.get(p))
    return [p for p in rozne if not any(q.startswith((p + ".", p + "[")) for q in rozne if q != p)]


def porownaj_wpis(zloty: dict[str, Any], teraz: dict[str, Any]) -> list[str]:
    """Rozbieżności złoty↔teraz (pusta lista = parytet).

    Odmowa: tekst DOKŁADNIE. Szkielet: hash DOKŁADNIE, meldunek nazywa ścieżki
    z mapy skrótów. Liczby: ta sama długość i ``|a − b| ≤ ATOL + RTOL·|a|`` dla
    każdej pary; meldunek podaje ścieżki z ``teraz["sciezki"]`` (jeśli są), żeby
    rozbieżność dało się wskazać w wyniku.
    """
    if zloty.get("odmowa") != teraz.get("odmowa"):
        return [f"odmowa: złoty={zloty.get('odmowa')!r} teraz={teraz.get('odmowa')!r}"]
    if zloty.get("odmowa") is not None:
        return []
    if zloty.get("szkielet_sha256") != teraz.get("szkielet_sha256"):
        sciezki = sciezki_rozbieznosci_szkieletu(zloty, teraz)
        return [
            f"szkielet: złoty={zloty.get('szkielet_sha256')} teraz={teraz.get('szkielet_sha256')}"
            f"; ścieżki ({len(sciezki)}): {', '.join(sciezki[:8]) or 'brak mapy skrótów'}"
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


#: Pola wpisu liczone tylko w pamięci (odtwarzalne z bieżącego wyniku, tylko ta
#: sama maszyna) — nie trafiają do złotego pliku.
POLA_TYLKO_W_PAMIECI: frozenset[str] = frozenset({"sciezki", "szkielet", "slad_sha256"})


def wpis_do_zapisu(wpis: dict[str, Any]) -> dict[str, Any]:
    """Wpis złotego pliku: bez pól ``POLA_TYLKO_W_PAMIECI``."""
    return {k: v for k, v in wpis.items() if k not in POLA_TYLKO_W_PAMIECI}


def wpis_z_wyniku(raw_result: Any) -> dict[str, Any]:
    """Wpis parytetu z surowego wyniku biegu (bez odmowy)."""
    szkielet, liczby, slady = widok_parytetu(raw_result)
    return {
        "odmowa": None,
        "szkielet_sha256": hash_widoku(szkielet),
        "szkielet_skroty": skroty_szkieletu(szkielet),
        "liczby": [zapis_liczby(x) for _, x in liczby],
        "sciezki": [sciezka for sciezka, _ in liczby],
        "szkielet": szkielet,
        "slad_sha256": hash_widoku(slady),
    }


def _wynik_lub_odmowa(wykonaj: Any, run: CanonicalRun) -> dict[str, Any]:
    try:
        wykonaj(run)
    except Exception as exc:  # noqa: BLE001 — odmowa jest wynikiem pinowanym
        return {
            "odmowa": f"{type(exc).__name__}: {exc}",
            "szkielet_sha256": None,
            "szkielet_skroty": None,
            "liczby": None,
            "sciezki": None,
            "szkielet": None,
            "slad_sha256": None,
        }
    return wpis_z_wyniku(run.raw_result)


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
