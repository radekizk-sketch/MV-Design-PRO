"""Kryterium wytrzymalosci zwarciowej PRZEWODU (IEC 60949 / PN-HD 60364-5-54).

Karta F-K1 programu FLOW (docs/uiux/AUDYT_I_PROJEKT_FLOW_2026-07.md, znalezisko Z1).

DLACZEGO TEN MODUL POWSTAL. Dobor przewodu sprawdzal dotad DWA kryteria:
obciazalnosc dlugotrwala oraz zmiane napiecia. Brakowalo trzeciego, normowego i w
sieciach SN czesto WIAZACEGO: czy przekroj wytrzyma prad zwarciowy przez czas, w
ktorym zabezpieczenie zwarcie wylaczy. Kabel poprawny pradowo i napieciowo moze
ulec zniszczeniu przy zwarciu.

Wszystkie skladniki tego rachunku byly juz w systemie i nie mialy odbiorcy:
katalog niesie Ith(1s) / Jth(1s) (IEC 60949), solver zwarciowy liczy Ith, analiza
zabezpieczen wyznacza czas wylaczenia. Ten modul jest ogniwem, ktore je zestawia.

PODSTAWA FIZYCZNA. Nagrzewanie zwarciowe zyly przyjmuje sie za ADIABATYCZNE
(czas zwarcia jest krotki wobec stalej czasowej odplywu ciepla do otoczenia), a
przyrost temperatury jest proporcjonalny do calki Joule'a:

    I^2 * t = const   =>   I_dop(t) = I_th(1s) * sqrt(1 s / t)

Ta sama zasada rownowaznej energii cieplnej rzadzi sprawdzeniem APARATU
(`application/equipment_proof/generator.py::_check_ith`) — tu stosujemy ja do
PRZEWODU. Rownowaznie, przez minimalny przekroj:

    S_min = I_th * sqrt(t) / k,   gdzie k = Jth(1s) [A/mm^2]

ZERO FABRYKACJI (precedens V12K-189). Brak ktorejkolwiek danej wejsciowej daje
wynik NIEDOSTEPNY z kanonicznym kodem gotowosci — nigdy wartosci zastepczej ani
domyslnej stalej materialowej. Zgadniety material zyly falszowalby werdykt
bezpieczenstwa.

WHITE BOX: wynik niesie prad dopuszczalny, wykorzystanie, minimalny przekroj,
uzyty wzor i zalozenia.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

# Kanoniczne kody gotowosci (zsynchronizowane z domain.canonical_operations.READINESS_CODES).
READINESS_CONDUCTOR_THERMAL_DATA_MISSING = "conductor.thermal_data_missing"
READINESS_FAULT_DURATION_MISSING = "conductor.fault_duration_missing"
READINESS_FAULT_CURRENT_MISSING = "conductor.fault_current_missing"

STATUS_PASS = "PASS"
STATUS_FAIL = "FAIL"
STATUS_UNAVAILABLE = "UNAVAILABLE"

_FORMULA_REF = "I_dop(t) = I_th(1s)·√(1 s / t);  S_min = I_th·√t / Jth(1s)"


@dataclass(frozen=True)
class ConductorThermalInput:
    """Dane wejsciowe sprawdzenia cieplnego przewodu.

    Kazde pole moze byc None — brak danej daje wynik NIEDOSTEPNY z kodem gotowosci,
    a nie liczbe zastepcza.

    ``ith_a``            — prad zwarciowy ekwiwalentny cieplnie [A] z biegu zwarciowego
                           (IEC 60909-0 §12: I_th = I″k·√(m+n)).
    ``fault_duration_s`` — czas trwania zwarcia [s] = czas wylaczenia zabezpieczenia
                           przy TYM pradzie (z analizy zabezpieczen), nie wartosc umowna.
    ``ith_1s_a``         — dopuszczalny prad cieplny przewodu dla 1 s [A] (katalog).
    ``jth_1s_a_per_mm2`` — gestosc pradu cieplnego dla 1 s [A/mm²] (katalog); potrzebna
                           wylacznie do wyznaczenia minimalnego przekroju.
    ``cross_section_mm2``— przekroj zastosowany [mm²]; do porownania z minimalnym.
    """

    ith_a: float | None
    fault_duration_s: float | None
    ith_1s_a: float | None
    jth_1s_a_per_mm2: float | None = None
    cross_section_mm2: float | None = None
    # Dane MATERIALOWE (karta F-K1 faza 6). Nie wchodza do rachunku — sluza
    # UZASADNIENIU wspolczynnika k: bez materialu zyly, izolacji i pary temperatur
    # nie da sie sprawdzic, czy przyjete k = Jth(1s) jest wlasciwe dla tego kabla.
    # Brak ktorejkolwiek danej = pokazujemy brak, nigdy wartosci typowej z tablic.
    conductor_material: str | None = None
    insulation: str | None = None
    temp_operating_c: float | None = None
    temp_short_circuit_c: float | None = None
    material_source_ref: str | None = None


@dataclass(frozen=True)
class ConductorThermalResult:
    """Wynik sprawdzenia cieplnego przewodu (WHITE BOX).

    ``status`` = UNAVAILABLE oznacza BRAK PODSTAWY do oceny (patrz ``readiness_codes``)
    i nie wolno go czytac jako spelnienia kryterium.
    """

    status: str
    admissible_current_a: float | None
    utilization: float | None
    required_cross_section_mm2: float | None
    margin_a: float | None
    readiness_codes: tuple[str, ...] = ()
    formula_ref: str = _FORMULA_REF
    # --- Karta F-K1 faza 6 (Calculation Evidence), wszystko addytywne ---
    # Bilans energii: to on jest fizyczna trescia kryterium (I²t <= k²S²), a prad
    # dopuszczalny jest tylko jego przeliczeniem na czas t.
    i2t_a2s: float | None = None
    i2t_admissible_a2s: float | None = None
    margin_percent: float | None = None
    # Kryteria czastkowe z osobnym werdyktem — projektant musi wiedziec, KTORE
    # ograniczenie zdecydowalo, a nie tylko ze „cos" jest naruszone.
    criteria: tuple[dict[str, Any], ...] = ()
    # Powod decyzji jednym zdaniem (kolumna tabeli).
    decision_reason_pl: str | None = None
    # Dzialania naprawcze z LICZBOWYM progiem i skutkiem (zero porad ogolnych).
    recommendations: tuple[dict[str, Any], ...] = ()
    # Wrazliwosc: jak wynik zmienia sie z czasem, pradem i przekrojem.
    sensitivity: tuple[dict[str, Any], ...] = ()
    # Podstawa normowa z PUNKTEM oraz uzasadnienie wspolczynnika k.
    standard_refs: tuple[dict[str, str], ...] = ()
    k_justification: dict[str, Any] | None = None
    # WHITE BOX (karta F-K1 faza 5, addytywnie): kroki rachunku w kanonie
    # Wzor -> Dane -> Podstawienie -> Wynik -> Uwagi, gotowe do okna „Dowod
    # obliczen". Pusta krotka dla wyniku NIEDOSTEPNEGO (nie ma czego dowodzic)
    # oraz dla wynikow sprzed tej delty.
    white_box_trace: tuple[dict[str, Any], ...] = ()
    assumptions: tuple[str, ...] = field(
        default_factory=lambda: (
            "Nagrzewanie zwarciowe adiabatyczne (bez odplywu ciepla do otoczenia).",
            "Rownowazna energia cieplna I²·t = const (IEC 60949).",
            "I_th to prad ekwiwalentny cieplnie z biegu zwarciowego, nie prad poczatkowy.",
            "Czas t to rzeczywisty czas wylaczenia zabezpieczenia przy tym pradzie.",
            "Wytrzymalosc przewodu odniesiona do 1 s wg danych katalogowych.",
        )
    )

    @property
    def is_conclusive(self) -> bool:
        """Czy wynik jest werdyktem (PASS/FAIL), a nie brakiem podstawy do oceny."""
        return self.status in (STATUS_PASS, STATUS_FAIL)


def _positive(value: float | None) -> float | None:
    if value is None:
        return None
    return value if value > 0.0 else None


def check_conductor_thermal_withstand(
    data: ConductorThermalInput,
) -> ConductorThermalResult:
    """Sprawdz, czy przewod wytrzyma prad zwarciowy przez czas wylaczenia.

    Zwraca werdykt PASS/FAIL albo UNAVAILABLE + kody gotowosci, gdy ktoregokolwiek
    ze skladnikow rachunku brakuje. Nie zgaduje zadnej wielkosci.
    """
    ith = _positive(data.ith_a)
    duration = _positive(data.fault_duration_s)
    ith_1s = _positive(data.ith_1s_a)

    braki: list[str] = []
    if ith is None:
        braki.append(READINESS_FAULT_CURRENT_MISSING)
    if duration is None:
        braki.append(READINESS_FAULT_DURATION_MISSING)
    if ith_1s is None:
        braki.append(READINESS_CONDUCTOR_THERMAL_DATA_MISSING)

    if braki:
        return ConductorThermalResult(
            status=STATUS_UNAVAILABLE,
            admissible_current_a=None,
            utilization=None,
            required_cross_section_mm2=None,
            margin_a=None,
            readiness_codes=tuple(dict.fromkeys(braki)),
        )

    # mypy: po sprawdzeniu brakow wszystkie trzy sa float
    assert ith is not None and duration is not None and ith_1s is not None

    sqrt_t = math.sqrt(duration)
    admissible = ith_1s / sqrt_t
    utilization = ith / admissible
    margin = admissible - ith

    jth = _positive(data.jth_1s_a_per_mm2)
    section = _positive(data.cross_section_mm2)
    required_section = (ith * sqrt_t / jth) if jth is not None else None

    status = STATUS_PASS if ith <= admissible else STATUS_FAIL

    # BILANS ENERGII — fizyczna tresc kryterium. I²t to calka Joule'a zwarcia,
    # k²S² to energia, ktora zyla przyjmie od temperatury roboczej do granicznej.
    # Prad dopuszczalny I_dop = I_th(1s)/sqrt(t) jest tylko przeliczeniem tej
    # samej nierownosci na czas t, wiec oba zapisy MUSZA dac ten sam werdykt.
    i2t = ith * ith * duration
    i2t_admissible = ith_1s * ith_1s  # k²S² = (Jth·S)² = I_th(1s)² dla t = 1 s
    margin_percent = (1.0 - utilization) * 100.0

    return ConductorThermalResult(
        status=status,
        admissible_current_a=admissible,
        utilization=utilization,
        required_cross_section_mm2=required_section,
        margin_a=margin,
        readiness_codes=(),
        i2t_a2s=i2t,
        i2t_admissible_a2s=i2t_admissible,
        margin_percent=margin_percent,
        criteria=_build_criteria(
            ith_a=ith,
            admissible_a=admissible,
            i2t=i2t,
            i2t_admissible=i2t_admissible,
            required_section_mm2=required_section,
            applied_section_mm2=section,
            status=status,
        ),
        decision_reason_pl=_decision_reason(
            status=status,
            ith_a=ith,
            admissible_a=admissible,
            utilization=utilization,
            required_section_mm2=required_section,
            applied_section_mm2=section,
        ),
        recommendations=_build_recommendations(
            status=status,
            ith_a=ith,
            duration_s=duration,
            ith_1s_a=ith_1s,
            jth_1s_a_per_mm2=jth,
            applied_section_mm2=section,
            required_section_mm2=required_section,
        ),
        sensitivity=_build_sensitivity(
            ith_a=ith,
            duration_s=duration,
            ith_1s_a=ith_1s,
            jth_1s_a_per_mm2=jth,
            applied_section_mm2=section,
        ),
        standard_refs=STANDARD_REFS,
        k_justification=_build_k_justification(data, jth),
        white_box_trace=_build_white_box_trace(
            ith_a=ith,
            duration_s=duration,
            sqrt_t=sqrt_t,
            ith_1s_a=ith_1s,
            admissible_a=admissible,
            utilization=utilization,
            margin_a=margin,
            jth_1s_a_per_mm2=jth,
            required_section_mm2=required_section,
            applied_section_mm2=_positive(data.cross_section_mm2),
            status=status,
            i2t=i2t,
            i2t_admissible=i2t_admissible,
            k_justification=_build_k_justification(data, jth),
        ),
    )


def _wartosc(value: float, unit: str, label: str) -> dict[str, Any]:
    """Wielkosc sladu w kanonie TraceValue (zaokraglenie = determinizm zapisu)."""
    return {"value": round(value, 6), "unit": unit, "label": label}


def _liczba_pl(value: float, miejsca: int = 1) -> str:
    """Liczba w polskim zapisie (przecinek dziesietny) do tekstow widocznych w UI."""
    return f"{value:.{miejsca}f}".replace(".", ",")


def _liczba_tex(value: float) -> str:
    """Liczba w zapisie polskim dla LaTeX-a.

    Pole „Podstawienie" okna dowodu renderuje sie przez KaTeX (``KrokDowodu.tsx``),
    wiec przecinek dziesietny musi byc grupa ``{,}`` — inaczej KaTeX traktuje go
    jako separator i wstawia spacje (``0, 421``).

    Energia zwarcia ma rzad 10^7 A²s, a domyslny zapis Pythona (``8.464e+07``)
    jest w dowodzie nieczytelny — duze liczby ida w notacji potegowej LaTeX.
    """
    zaokraglona = round(value, 3)
    if zaokraglona != 0.0 and abs(zaokraglona) >= 1e5:
        wykladnik = math.floor(math.log10(abs(zaokraglona)))
        mantysa = zaokraglona / (10**wykladnik)
        return f"{round(mantysa, 4):g}".replace(".", "{,}") + r" \cdot 10^{" + str(wykladnik) + "}"
    return f"{zaokraglona:g}".replace(".", "{,}")


def _build_white_box_trace(
    *,
    ith_a: float,
    duration_s: float,
    sqrt_t: float,
    ith_1s_a: float,
    admissible_a: float,
    utilization: float,
    margin_a: float,
    jth_1s_a_per_mm2: float | None,
    required_section_mm2: float | None,
    applied_section_mm2: float | None,
    status: str,
    i2t: float,
    i2t_admissible: float,
    k_justification: dict[str, Any],
) -> tuple[dict[str, Any], ...]:
    """Kroki dowodowe rachunku cieplnego (WHITE BOX, kanon pieciu pol).

    Slad NIE liczy niczego od nowa — wszystkie wielkosci sa argumentami tej
    funkcji, wyliczonymi wyzej w tym samym solverze. Formatowanie i tekst sa
    prezentacja, fizyka zostaje w jednym miejscu.
    """
    material = k_justification.get("material_zyly") or "—"
    izolacja = k_justification.get("izolacja") or "—"
    temp_pocz = k_justification.get("temp_poczatkowa_c")
    temp_konc = k_justification.get("temp_koncowa_c")
    braki_k = k_justification.get("braki_pl") or ()

    kroki: list[dict[str, Any]] = [
        {
            "step": 1,
            "key": "conductor_thermal_k_factor",
            "title": "Współczynnik materiałowy k żyły",
            "formula_latex": (
                r"$$k = J_{th(1s)} \quad \left[\frac{\mathrm{A}\sqrt{\mathrm{s}}}"
                r"{\mathrm{mm^2}}\right]$$"
            ),
            "inputs": {
                "material_zyly": {"value": material, "label": "Materiał żyły"},
                "izolacja": {"value": izolacja, "label": "Izolacja"},
                "temp_poczatkowa_c": {
                    "value": temp_pocz,
                    "unit": "°C",
                    "label": "Temperatura początkowa (robocza)",
                },
                "temp_koncowa_c": {
                    "value": temp_konc,
                    "unit": "°C",
                    "label": "Temperatura końcowa (zwarciowa)",
                },
            },
            "substitution": (
                r"$$k = " + _liczba_tex(jth_1s_a_per_mm2) + r"\ \frac{\mathrm{A}\sqrt{\mathrm{s}}}"
                r"{\mathrm{mm^2}}$$"
                if jth_1s_a_per_mm2 is not None
                else ""
            ),
            "result": {
                "k_a_s05_per_mm2": {
                    "value": k_justification.get("k_a_s05_per_mm2"),
                    "unit": "A·√s/mm²",
                    "label": "Współczynnik k (= Jth dla 1 s)",
                }
            },
            "notes": (
                f"{k_justification.get('tozsamosc_pl')} Źródło: "
                f"{k_justification.get('zrodlo_pl') or 'nie podano w modelu'}."
                + (
                    " NIEPEŁNE UZASADNIENIE — brak: " + ", ".join(braki_k) + "."
                    if braki_k
                    else " Para materiał/izolacja i temperatury pozwalają zweryfikować tę wartość."
                )
            ),
        },
        {
            "step": 2,
            "key": "conductor_thermal_admissible",
            "title": "Prąd dopuszczalny przewodu przy czasie trwania zwarcia",
            "formula_latex": r"$$I_{dop}(t) = I_{th(1s)} \cdot \sqrt{\frac{1\,\mathrm{s}}{t}}$$",
            "inputs": {
                "ith_1s_a": _wartosc(ith_1s_a, "A", "Wytrzymałość cieplna żyły dla 1 s"),
                "tk_s": _wartosc(duration_s, "s", "Czas trwania zwarcia"),
            },
            "substitution": (
                r"$$I_{dop} = \frac{"
                + _liczba_tex(ith_1s_a)
                + r"}{\sqrt{"
                + _liczba_tex(duration_s)
                + r"}} = "
                + _liczba_tex(admissible_a)
                + r"\ \mathrm{A}$$"
            ),
            "result": {
                "i_dop_a": _wartosc(admissible_a, "A", "Prąd dopuszczalny przy czasie t"),
            },
            "notes": (
                "Nagrzewanie zwarciowe przyjmuje się za adiabatyczne, więc obowiązuje "
                "równoważna energia cieplna I²·t = const (IEC 60949)."
            ),
        },
        {
            "step": 3,
            "key": "conductor_thermal_criterion",
            "title": "Sprawdzenie kryterium cieplnego (zapis prądowy)",
            "formula_latex": r"$$I_{th} \le I_{dop}(t)$$",
            "inputs": {
                "ith_a": _wartosc(ith_a, "A", "Prąd zwarciowy ekwiwalentny cieplnie gałęzi"),
                "i_dop_a": _wartosc(admissible_a, "A", "Prąd dopuszczalny przy czasie t"),
            },
            "substitution": (
                r"$$"
                + _liczba_tex(ith_a)
                + r"\ \mathrm{A} "
                + (r"\le " if status == STATUS_PASS else r"> ")
                + _liczba_tex(admissible_a)
                + r"\ \mathrm{A} \quad\Rightarrow\quad "
                + _liczba_tex(utilization * 100.0)
                + r"\ \%$$"
            ),
            "result": {
                "utilization": _wartosc(utilization, "-", "Wykorzystanie wytrzymałości cieplnej"),
                "margin_a": _wartosc(margin_a, "A", "Zapas do prądu dopuszczalnego"),
            },
            "notes": (
                "Kryterium spełnione — przekrój wytrzyma zwarcie przez ten czas."
                if status == STATUS_PASS
                else "Kryterium naruszone — przekrój nie wytrzyma zwarcia przez ten czas."
            ),
        },
    ]

    # Krok energetyczny — ta sama nierownosc w jednostkach calki Joule'a. To on
    # jest fizyczna trescia kryterium (energia, ktora zyla przyjmie bez przekroczenia
    # temperatury granicznej), a zapis pradowy jest jego przeliczeniem na czas t.
    kroki.append(
        {
            "step": len(kroki) + 1,
            "key": "conductor_thermal_energy",
            "title": "Bilans energii cieplnej zwarcia",
            "formula_latex": r"$$I^2 t \le k^2 S^2$$",
            "inputs": {
                "ith_a": _wartosc(ith_a, "A", "Prąd zwarciowy ekwiwalentny cieplnie gałęzi"),
                "tk_s": _wartosc(duration_s, "s", "Czas trwania zwarcia"),
                "ith_1s_a": _wartosc(ith_1s_a, "A", "Wytrzymałość cieplna żyły dla 1 s"),
            },
            "substitution": (
                r"$$"
                + _liczba_tex(ith_a)
                + r"^2 \cdot "
                + _liczba_tex(duration_s)
                + r" = "
                + _liczba_tex(i2t)
                + r"\ \mathrm{A^2s} "
                + (r"\le " if status == STATUS_PASS else r"> ")
                + _liczba_tex(i2t_admissible)
                + r"\ \mathrm{A^2s}$$"
            ),
            "result": {
                "i2t_a2s": _wartosc(i2t, "A²·s", "Energia cieplna zwarcia I²t"),
                "i2t_dop_a2s": _wartosc(
                    i2t_admissible, "A²·s", "Dopuszczalna energia cieplna żyły k²S²"
                ),
            },
            "notes": (
                "Zapis energetyczny i prądowy to ta sama nierówność — muszą dać ten sam "
                "werdykt; rozjazd oznaczałby błąd rachunku."
            ),
        }
    )

    if jth_1s_a_per_mm2 is not None and required_section_mm2 is not None:
        podstawienie = (
            r"$$S_{min} = \frac{"
            + _liczba_tex(ith_a)
            + r" \cdot \sqrt{"
            + _liczba_tex(duration_s)
            + r"}}{"
            + _liczba_tex(jth_1s_a_per_mm2)
            + r"} = "
            + _liczba_tex(required_section_mm2)
            + r"\ \mathrm{mm^2}"
        )
        if applied_section_mm2 is not None:
            znak = r"\ge" if applied_section_mm2 >= required_section_mm2 else r"<"
            podstawienie += (
                r" \quad ; \quad S = "
                + _liczba_tex(applied_section_mm2)
                + r"\ \mathrm{mm^2} "
                + znak
                + r" S_{min}"
            )
        podstawienie += "$$"
        wejscia = {
            "ith_a": _wartosc(ith_a, "A", "Prąd zwarciowy ekwiwalentny cieplnie gałęzi"),
            "tk_s": _wartosc(duration_s, "s", "Czas trwania zwarcia"),
            "jth_1s_a_per_mm2": _wartosc(
                jth_1s_a_per_mm2, "A/mm²", "Gęstość prądu cieplnego dla 1 s"
            ),
        }
        wyniki = {
            "s_min_mm2": _wartosc(required_section_mm2, "mm²", "Minimalny wymagany przekrój"),
        }
        if applied_section_mm2 is not None:
            wejscia["cross_section_mm2"] = _wartosc(
                applied_section_mm2, "mm²", "Przekrój zastosowany"
            )
        kroki.append(
            {
                "step": len(kroki) + 1,
                "key": "conductor_thermal_min_section",
                "title": "Minimalny przekrój żyły z warunku cieplnego",
                "formula_latex": r"$$S_{min} = \frac{I_{th} \cdot \sqrt{t}}{J_{th(1s)}}$$",
                "inputs": wejscia,
                "substitution": podstawienie,
                "result": wyniki,
                "notes": (
                    "Zapis równoważny kryterium prądowemu — mówi wprost, jaki przekrój "
                    "usunie naruszenie."
                ),
            }
        )

    return tuple(kroki)


# ---------------------------------------------------------------------------
# Calculation Evidence (karta F-K1 faza 6) — kryteria, powod, naprawa, wrazliwosc
# ---------------------------------------------------------------------------

STANDARD_REFS: tuple[dict[str, str], ...] = (
    {
        "norma": "PN-HD 60364-4-43",
        "punkt": "§ 434.5.2",
        "tresc_pl": (
            "Warunek adiabatyczny doboru przekroju ze wzgledu na zwarcie: " "S ≥ √(I²·t) / k."
        ),
    },
    {
        "norma": "IEC 60949",
        "punkt": "§ 3, § 4",
        "tresc_pl": (
            "Obliczanie dopuszczalnych pradow zwarciowych kabli z uwzglednieniem "
            "nagrzewania nieadiabatycznego; podstawa wartosci k dla par "
            "material zyly / izolacja."
        ),
    },
    {
        "norma": "IEC 60909-0",
        "punkt": "§ 12",
        "tresc_pl": (
            "Prad ekwiwalentny cieplnie I_th = I″k·√(m+n); to jego uzywa kryterium, "
            "nie pradu poczatkowego."
        ),
    },
)


def _build_criteria(
    *,
    ith_a: float,
    admissible_a: float,
    i2t: float,
    i2t_admissible: float,
    required_section_mm2: float | None,
    applied_section_mm2: float | None,
    status: str,
) -> tuple[dict[str, Any], ...]:
    """Kryteria czastkowe z OSOBNYM werdyktem — ktore ograniczenie zdecydowalo.

    Zapisy sa rownowazne matematycznie (ta sama nierownosc przeksztalcona), ale
    projektant czyta je w roznych jednostkach: pradowo, energetycznie i przekrojowo.
    Rownowaznosc jest wlasnie dowodem spojnosci rachunku — trzy zapisy nie moga dac
    trzech roznych werdyktow.
    """
    pozycje: list[dict[str, Any]] = [
        {
            "kod": "prad_dopuszczalny",
            "nazwa_pl": "Prąd zwarciowy wobec dopuszczalnego dla czasu t",
            "warunek_pl": "I_th ≤ I_dop(t) = I_th(1s)/√t",
            "wartosc": round(ith_a, 6),
            "granica": round(admissible_a, 6),
            "jednostka": "A",
            "status": STATUS_PASS if ith_a <= admissible_a else STATUS_FAIL,
        },
        {
            "kod": "energia_cieplna",
            "nazwa_pl": "Energia zwarcia wobec wytrzymałości żyły",
            "warunek_pl": "I²·t ≤ k²·S²",
            "wartosc": round(i2t, 3),
            "granica": round(i2t_admissible, 3),
            "jednostka": "A²·s",
            "status": STATUS_PASS if i2t <= i2t_admissible else STATUS_FAIL,
        },
    ]
    if required_section_mm2 is not None and applied_section_mm2 is not None:
        pozycje.append(
            {
                "kod": "przekroj_minimalny",
                "nazwa_pl": "Przekrój zastosowany wobec minimalnego z warunku cieplnego",
                "warunek_pl": "S ≥ S_min = √(I²·t)/k",
                "wartosc": round(applied_section_mm2, 6),
                "granica": round(required_section_mm2, 6),
                "jednostka": "mm²",
                "status": (
                    STATUS_PASS if applied_section_mm2 >= required_section_mm2 else STATUS_FAIL
                ),
            }
        )
    elif required_section_mm2 is not None:
        pozycje.append(
            {
                "kod": "przekroj_minimalny",
                "nazwa_pl": "Przekrój zastosowany wobec minimalnego z warunku cieplnego",
                "warunek_pl": "S ≥ S_min = √(I²·t)/k",
                "wartosc": None,
                "granica": round(required_section_mm2, 6),
                "jednostka": "mm²",
                # Przekroju zastosowanego nie ma w modelu — kryterium jest
                # NIESPRAWDZALNE, a nie spelnione.
                "status": STATUS_UNAVAILABLE,
            }
        )

    # Zapisy sa rownowazne, wiec rozjazd werdyktow oznaczalby blad rachunku.
    werdykty = {poz["status"] for poz in pozycje if poz["status"] != STATUS_UNAVAILABLE}
    assert werdykty <= {status}, f"kryteria czastkowe rozjechaly sie z werdyktem: {werdykty}"
    return tuple(pozycje)


def _decision_reason(
    *,
    status: str,
    ith_a: float,
    admissible_a: float,
    utilization: float,
    required_section_mm2: float | None,
    applied_section_mm2: float | None,
) -> str:
    """Jednozdaniowy POWOD werdyktu do kolumny tabeli (nie sam status)."""
    if status == STATUS_PASS:
        return (
            f"Wykorzystanie wytrzymałości cieplnej {_liczba_pl(utilization * 100.0)} % "
            f"(zapas {_liczba_pl(100.0 - utilization * 100.0)} %)."
        )
    if required_section_mm2 is not None and applied_section_mm2 is not None:
        return (
            f"Przekrój {_liczba_pl(applied_section_mm2, 0)} mm² jest mniejszy od wymaganego "
            f"{_liczba_pl(required_section_mm2)} mm² z warunku cieplnego."
        )
    return (
        f"Prąd zwarciowy {_liczba_pl(ith_a, 0)} A przekracza dopuszczalny "
        f"{_liczba_pl(admissible_a, 0)} A dla tego czasu wyłączenia."
    )


def _build_recommendations(
    *,
    status: str,
    ith_a: float,
    duration_s: float,
    ith_1s_a: float,
    jth_1s_a_per_mm2: float | None,
    applied_section_mm2: float | None,
    required_section_mm2: float | None,
) -> tuple[dict[str, Any], ...]:
    """Dzialania naprawcze z PROGIEM liczbowym — kazde z tego samego wzoru.

    Kryterium I²t ≤ k²S² ma trzy zmienne, wiec kazda naprawa to przeksztalcenie
    tej samej nierownosci wzgledem jednej z nich:
      przekroj  S ≥ I·√t / k
      czas      t ≤ (k·S / I)²
      prad      I ≤ k·S / √t
    Rekomendacja bez liczby jest bezuzyteczna — projektant musi wiedziec, DO JAKIEJ
    wartosci ma zmienic parametr, zeby warunek byl spelniony.
    """
    if status != STATUS_FAIL:
        return ()

    zalecenia: list[dict[str, Any]] = []

    if required_section_mm2 is not None:
        zalecenia.append(
            {
                "kod": "zwieksz_przekroj",
                "dzialanie_pl": "Zwiększ przekrój żyły",
                "wzor": "S ≥ I·√t / k",
                "wartosc_docelowa": round(required_section_mm2, 3),
                "jednostka": "mm²",
                "wartosc_obecna": (
                    round(applied_section_mm2, 3) if applied_section_mm2 is not None else None
                ),
                "skutek_pl": (
                    f"Przekrój {_liczba_pl(required_section_mm2)} mm² sprowadza wykorzystanie "
                    "wytrzymałości do 100 %; typoszereg powyżej daje zapas."
                ),
            }
        )

    # Maksymalny czas wylaczenia, przy ktorym OBECNY przekroj wytrzyma zwarcie.
    czas_max = (ith_1s_a / ith_a) ** 2
    zalecenia.append(
        {
            "kod": "skroc_czas",
            "dzialanie_pl": "Skróć czas wyłączenia zwarcia (nastawa zabezpieczenia)",
            "wzor": "t ≤ (k·S / I)²",
            "wartosc_docelowa": round(czas_max, 4),
            "jednostka": "s",
            "wartosc_obecna": round(duration_s, 4),
            "skutek_pl": (
                f"Czas {_liczba_pl(czas_max, 3)} s zamiast {_liczba_pl(duration_s, 3)} s "
                "wystarczy, żeby obecny przekrój spełnił kryterium bez wymiany kabla."
            ),
        }
    )

    # Maksymalny prad zwarciowy, ktory obecny przewod wytrzyma w tym czasie.
    prad_max = ith_1s_a / math.sqrt(duration_s)
    zalecenia.append(
        {
            "kod": "ogranicz_prad",
            "dzialanie_pl": "Ogranicz prąd zwarciowy w tym miejscu sieci",
            "wzor": "I ≤ k·S / √t",
            "wartosc_docelowa": round(prad_max, 1),
            "jednostka": "A",
            "wartosc_obecna": round(ith_a, 1),
            "skutek_pl": (
                f"Prąd do {_liczba_pl(prad_max, 0)} A (np. dławik zwarciowy, podział sieci, "
                "inny punkt pracy) mieści się w wytrzymałości obecnego przekroju."
            ),
        }
    )
    if jth_1s_a_per_mm2 is not None and applied_section_mm2 is not None:
        zalecenia.append(
            {
                "kod": "zmien_material",
                "dzialanie_pl": "Zmień materiał żyły albo izolację (wyższe k)",
                "wzor": "k ≥ I·√t / S",
                "wartosc_docelowa": round(ith_a * math.sqrt(duration_s) / applied_section_mm2, 2),
                "jednostka": "A·√s/mm²",
                "wartosc_obecna": round(jth_1s_a_per_mm2, 2),
                "skutek_pl": (
                    "Zmiana pary materiał/izolacja na taką, dla której k osiąga tę "
                    "wartość, spełnia kryterium przy niezmienionym przekroju."
                ),
            }
        )
    return tuple(zalecenia)


def _build_sensitivity(
    *,
    ith_a: float,
    duration_s: float,
    ith_1s_a: float,
    jth_1s_a_per_mm2: float | None,
    applied_section_mm2: float | None,
) -> tuple[dict[str, Any], ...]:
    """Wplyw zmiany czasu, pradu i przekroju na wykorzystanie wytrzymalosci.

    Wykorzystanie = I·√t / I_th(1s). Wrazliwosc pokazuje, ktory parametr faktycznie
    rozstrzyga: czas wchodzi pierwiastkiem, prad i przekroj liniowo.
    """
    warianty: list[dict[str, Any]] = []

    def wykorzystanie(*, prad: float, czas: float, przekroj: float | None) -> float:
        wytrzymalosc = ith_1s_a
        if (
            przekroj is not None
            and applied_section_mm2 is not None
            and jth_1s_a_per_mm2 is not None
        ):
            wytrzymalosc = jth_1s_a_per_mm2 * przekroj
        return prad * math.sqrt(czas) / wytrzymalosc

    for mnoznik in (0.5, 0.75, 1.0, 1.5, 2.0):
        warianty.append(
            {
                "parametr": "czas_wylaczenia",
                "nazwa_pl": "Czas wyłączenia",
                "mnoznik": mnoznik,
                "wartosc": round(duration_s * mnoznik, 4),
                "jednostka": "s",
                "wykorzystanie": round(
                    wykorzystanie(prad=ith_a, czas=duration_s * mnoznik, przekroj=None), 6
                ),
            }
        )
    for mnoznik in (0.5, 0.75, 1.0, 1.25, 1.5):
        warianty.append(
            {
                "parametr": "prad_zwarciowy",
                "nazwa_pl": "Prąd zwarciowy",
                "mnoznik": mnoznik,
                "wartosc": round(ith_a * mnoznik, 1),
                "jednostka": "A",
                "wykorzystanie": round(
                    wykorzystanie(prad=ith_a * mnoznik, czas=duration_s, przekroj=None), 6
                ),
            }
        )
    if applied_section_mm2 is not None and jth_1s_a_per_mm2 is not None:
        for mnoznik in (0.5, 0.75, 1.0, 1.5, 2.0):
            przekroj = applied_section_mm2 * mnoznik
            warianty.append(
                {
                    "parametr": "przekroj",
                    "nazwa_pl": "Przekrój żyły",
                    "mnoznik": mnoznik,
                    "wartosc": round(przekroj, 2),
                    "jednostka": "mm²",
                    "wykorzystanie": round(
                        wykorzystanie(prad=ith_a, czas=duration_s, przekroj=przekroj), 6
                    ),
                }
            )
    return tuple(warianty)


def _build_k_justification(
    data: ConductorThermalInput, jth_1s_a_per_mm2: float | None
) -> dict[str, Any]:
    """Uzasadnienie wspolczynnika k — bez niego liczby nie da sie zweryfikowac.

    k [A·√s/mm²] jest tozsame liczbowo z gestoscia pradu cieplnego Jth(1s) z
    katalogu (prad na 1 mm² przez 1 s). Zeby ocenic, czy przyjeta wartosc pasuje
    do TEGO kabla, trzeba znac material zyly, izolacje i pare temperatur.
    Braki sa nazwane wprost — NIE podstawiamy wartosci typowej z tablic normy,
    bo zgadniete k falszuje werdykt bezpieczenstwa.
    """
    braki: list[str] = []
    if not data.conductor_material:
        braki.append("materiał żyły")
    if not data.insulation:
        braki.append("rodzaj izolacji")
    if data.temp_operating_c is None:
        braki.append("temperatura początkowa (robocza)")
    if data.temp_short_circuit_c is None:
        braki.append("temperatura końcowa (zwarciowa)")

    return {
        "k_a_s05_per_mm2": round(jth_1s_a_per_mm2, 3) if jth_1s_a_per_mm2 is not None else None,
        "tozsamosc_pl": (
            "k = Jth(1 s) — gęstość prądu zwarciowego dla 1 s z karty katalogowej "
            "(prąd na 1 mm² przekroju wytrzymywany przez 1 s)."
        ),
        "material_zyly": data.conductor_material,
        "izolacja": data.insulation,
        "temp_poczatkowa_c": data.temp_operating_c,
        "temp_koncowa_c": data.temp_short_circuit_c,
        "zrodlo_pl": data.material_source_ref,
        "braki_pl": tuple(braki),
        "kompletne": not braki,
    }
