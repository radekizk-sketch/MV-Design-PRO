#!/usr/bin/env python3
"""Strażnik kolorów zaszytych pod jeden motyw w warstwie prezentacji frontu.

DLACZEGO (karta KOLORY-ZASZYTE-POD-MOTYW, 2026-10-15). Właściciel ocenił ekrany
jako nieczytelne. Zmierzony defekt: przycisk „Następna akcja” w panelu kontekstu
schematu niósł ``border-cyan-500/45 bg-cyan-500/10 text-cyan-100`` — w motywie
jasnym (``light_technical``) jasnobłękitny tekst na jasnobłękitnym tle, praktycznie
niewidoczny. To nie był pojedynczy przycisk, tylko KLASA: odcienie palety
Tailwinda dobrane pod tło ciemne w komponentach rysowanych w OBU motywach. Pomiar
przed naprawą (ten strażnik na drzewie ``af5c4147c``): 180 naruszeń w 40 plikach
produkcyjnych ``src/ui`` (wzorce 1–4 poniżej: 127 / 21 / 21 / 11), 0 w ``src/ui2``.

KONTRAKT. Kolor semantyczny (informacja/akcja, ostrzeżenie, potwierdzenie,
blokada) w komponencie pochodzi z tokenów motywu ``sygnal-*`` (``-tlo`` — tło,
``-tusz`` — tekst na tym tle, kolor bazowy — tekst/ikona na zwykłym panelu,
``border-sygnal-*`` — obrys), neutralny z ``scada-*``. Wartości tokenów są
deklarowane per motyw w ``frontend/src/index.css``; kontrast ≥ 4,5:1 w obu
motywach mierzy ``frontend/src/ui/__tests__/scadaTokens.test.ts``.

ZAKAZANE WZORCE (jedno źródło prawdy: ``WZORCE``), dla każdej rodziny barw
nasyconych z ``RODZINY`` i z dowolnym wariantem (``hover:``, ``focus:``…):

1. ``text-<rodzina>-{50,100,200,300,400}`` — jasny tusz pod tło ciemne; na
   białym panelu jasnego motywu ma najwyżej 2,98:1 (``indigo-400``; pomiar
   w samoteście z tabeli ``PALETA``).
2. ``bg-<rodzina>-{400,500,600}/NN`` — półprzezroczysta plama nasyconej barwy;
   na panelu jasnym zlewa się z tłem, a niesiony na niej tusz 100–300 znika.
3. ``bg-<rodzina>-{900,950}`` (z przezroczystością albo bez) oraz
   ``bg-<rodzina>-800/NN`` — ciemne tło komunikatu; w motywie jasnym zostaje
   ciemną plamą z ciemnym tekstem panelu.
4. ``text-white`` w jednym wierszu z pełnym tłem ``bg-<rodzina>-N`` (także
   ``hover:``/``active:``), na którym biały napis ma < 4,5:1 — tabela
   ``PALETA`` (wartości Tailwind 3.4) i ``kontrast_bialego``. Ten wzorzec nie
   zależy od motywu (jest nieczytelny w obu), ale to ta sama rodzina defektu
   „barwa palety dobrana na oko”: przy naprawie klasy znaleziono 11 takich
   miejsc (``bg-blue-500``/``bg-red-500`` z białym napisem, ``bg-green-600``,
   ``bg-emerald-600``, ``bg-amber-600``, ``hover:bg-green-600``).
   Zasięg wiersza: ``className`` rozbity na kilka wierszy przez ``clsx`` nie jest
   przez ten wzorzec widziany — to jawne ograniczenie, nie obietnica.

KLASA LUSTRZANA — barwy dobrane pod tło JASNE (karta TUSZ-POD-TLO-JASNE,
2026-10-15). Motyw ciemny (``dark_scada``, domyślny) przemapowuje w ``index.css``
(``.mv-dark-scada``) WYŁĄCZNIE rodziny neutralne (``bg-white``/``gray``/``slate``/
``zinc``/``chrome``) — zmierzone, nie założone; nasycone ``text-red-600``,
``bg-amber-50``, ``border-blue-200`` przechodzą do motywu ciemnego bez zmian.
Pomiar przed naprawą (ten strażnik na drzewie ``bf69ad3d1``): 681 naruszeń w 86
plikach — 335 tuszów 500–900, 206 jasnych teł 50–300, 120 jasnych obrysów 50–400,
3 jasne pierścienie, 17 białych napisów bez stałego tła; z tego 2 w ``src/ui2``
(strona nieznanej trasy ``LegacyWarsztat``: ``bg-amber-50`` z ``text-slate-900``,
który motyw ciemny przemapowuje na jasny tusz — napis znikał) i 1 w martwym
``ui/status-bar`` (skasowanym tą samą kartą). Po naprawie: 0. Wzorce 5–9:

5. ``text-<rodzina>-{500,600,700,800,900,950}`` — tusz dobrany pod tło jasne.
   Żaden odcień 500–800 żadnej rodziny nie ma ≥ 4,5:1 JEDNOCZEŚNIE na białym
   panelu i na panelu motywu ciemnego (``PANEL_CIEMNY``): maksimum minimum obu
   kontrastów to 4,10:1 (pomiar w samoteście z tabeli ``PALETA``); 900/950 są
   ciemniejsze od 800, więc na panelu ciemnym jeszcze gorsze. Przykład z karty:
   ``text-red-600`` na panelu ciemnym 3,60:1.
6. ``bg-<rodzina>-{50,100,200,300}`` (z przezroczystością albo bez) — jasne tło
   komunikatu; w motywie ciemnym zostaje jasną wyspą (odcień 300 jest ≥ 8,7 raza
   jaśniejszy od panelu ciemnego), a tusz panelu (``text-scada-text``, jasny)
   znika na niej.
7. ``border(-l/-r/-t/-b/-x/-y)-<rodzina>-{50,100,200,300,400}`` — jasny obrys
   tej samej plamy; poza parą z jasnym tłem zostaje świecącą ramką w motywie
   ciemnym.
8. ``ring-<rodzina>-{50,100,200,300}`` — jasny pierścień, jak wzorzec 7.
9. ``text-white`` w wierszu bez żadnego STAŁEGO tła palety (``bg-<barwa>-N``,
   ``bg-black``) — biały napis na powierzchni motywu (``bg-scada-*``,
   ``bg-sygnal-*``) albo bez własnego tła znika w motywie jasnym; na akcencie
   ``bg-sygnal-info`` motywu ciemnego ma 2,66:1. Tekst na akcencie ``sygnal-*``
   to ``text-scada-bg`` (kontrast przypięty w ``scadaTokens.test.ts``). Zasięg
   wiersza jak we wzorcu 4.

CO ŚWIADOMIE NIE JEST ZAKAZANE (z uzasadnieniem merytorycznym):
- pełne tło przycisku z ``text-white``, na którym biały ma ≥ 4,5:1 (np.
  ``blue-600`` 5,17:1, ``cyan-700`` 5,36:1, ``green-700`` 5,02:1) — tło nie
  przechodzi przez panel motywu, więc kontrast jest NIEZALEŻNY od motywu;
- pełne tło 400/500 bez tekstu (kropka stanu, pasek postępu) i obrys/pierścień
  500+ (zaznaczenie, fokus) — to obiekty graficzne, nie tusz; wzorce 5–8 ich nie
  dotyczą (kryterium WCAG 1.4.11 3:1, nie 1.4.3);
- rodziny neutralne (``slate``, ``gray``, ``zinc``…) — warstwa legacy jest
  natywnie jasna, a motyw ciemny przemapowuje jej klasy neutralne w
  ``index.css`` (``.mv-dark-scada``).

ZAKRES. Pliki ``*.ts`` i ``*.tsx`` w ``frontend/src/ui`` i ``frontend/src/ui2``,
bez katalogów ``__tests__`` i plików ``*.test.*``/``*.spec.*``. Wiersze
komentarza (zaczynające się od ``*``, ``//``, ``/*``, ``{/*``) są pomijane — opis
historii defektu może nazwać zakazaną klasę.

LISTA DOZWOLONA: pusta. Element rysowany WYŁĄCZNIE na stałym ciemnym tle
niezależnym od motywu mógłby tu trafić z dowodem z kodu; pomiar 2026-10-15 nie
znalazł ani jednego takiego elementu, który nie byłby jednocześnie defektem
(ciemna wyspa w jasnym motywie) — wszystkie przepisano na tokeny.
Kod wyjścia 0 = zero naruszeń.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"
KORZENIE = (FRONTEND / "src" / "ui", FRONTEND / "src" / "ui2")

#: Rodziny barw nasyconych palety Tailwinda. Pierwsze osiem to rodziny z karty;
#: reszta to te same odcienie innych barw nasyconych (ta sama klasa defektu —
#: ``text-blue-300``, ``bg-orange-950/20`` były w pomiarze przed naprawą).
RODZINY = (
    "cyan",
    "amber",
    "emerald",
    "sky",
    "rose",
    "red",
    "green",
    "yellow",
    "orange",
    "lime",
    "blue",
    "teal",
    "indigo",
    "violet",
    "purple",
    "pink",
    "fuchsia",
)
_R = "|".join(RODZINY)
#: Początek klasy z opcjonalnymi wariantami (``hover:``, ``md:``, ``group-hover:``) —
#: meldunek niesie klasę w postaci z kodu.
_PRZED = r"(?<![\w:-])(?:[a-z-]+:)*"
_PO = r"(?![\w-])"

#: (nazwa wzorca, wyrażenie) — jedno źródło prawdy zakazu.
WZORCE: tuple[tuple[str, re.Pattern[str]], ...] = (
    (
        "jasny tusz pod tło ciemne",
        re.compile(rf"{_PRZED}text-(?:{_R})-(?:50|100|200|300|400)(?:/\d+)?{_PO}"),
    ),
    (
        "półprzezroczysta plama nasyconej barwy",
        re.compile(rf"{_PRZED}bg-(?:{_R})-(?:400|500|600)/\d+{_PO}"),
    ),
    (
        "ciemne tło komunikatu",
        re.compile(rf"{_PRZED}bg-(?:{_R})-(?:(?:900|950)(?:/\d+)?|800/\d+){_PO}"),
    ),
    (
        "tusz pod tło jasne",
        re.compile(rf"{_PRZED}text-(?:{_R})-(?:500|600|700|800|900|950)(?:/\d+)?{_PO}"),
    ),
    (
        "jasne tło pod motyw jasny",
        re.compile(rf"{_PRZED}bg-(?:{_R})-(?:50|100|200|300)(?:/\d+)?{_PO}"),
    ),
    (
        "jasny obrys pod motyw jasny",
        re.compile(rf"{_PRZED}border(?:-[lrtbxy])?-(?:{_R})-(?:50|100|200|300|400)(?:/\d+)?{_PO}"),
    ),
    (
        "jasny pierścień pod motyw jasny",
        re.compile(rf"{_PRZED}ring-(?:{_R})-(?:50|100|200|300)(?:/\d+)?{_PO}"),
    ),
)

#: Panel motywu ciemnego (``--scada-panel`` w ``frontend/src/index.css``) — podstawa
#: deklaracji wzorca 5; samotest pilnuje zgodności z arkuszem.
PANEL_CIEMNY = (17, 27, 38)

#: Wartości palety Tailwind 3.4 (``tailwindcss/colors``) dla odcieni 300–800 —
#: podstawa wzorca 4 (biały napis na pełnym tle). Odcienie spoza tabeli (50–200,
#: 900–950) z białym napisem: 50–200 łapie każdy pomiar jako < 4,5:1 z definicji
#: jasności, 900–950 łapie wzorzec 3.
PALETA: dict[str, dict[int, str]] = {
    "cyan": {
        300: "#67e8f9",
        400: "#22d3ee",
        500: "#06b6d4",
        600: "#0891b2",
        700: "#0e7490",
        800: "#155e75",
    },
    "amber": {
        300: "#fcd34d",
        400: "#fbbf24",
        500: "#f59e0b",
        600: "#d97706",
        700: "#b45309",
        800: "#92400e",
    },
    "emerald": {
        300: "#6ee7b7",
        400: "#34d399",
        500: "#10b981",
        600: "#059669",
        700: "#047857",
        800: "#065f46",
    },
    "sky": {
        300: "#7dd3fc",
        400: "#38bdf8",
        500: "#0ea5e9",
        600: "#0284c7",
        700: "#0369a1",
        800: "#075985",
    },
    "rose": {
        300: "#fda4af",
        400: "#fb7185",
        500: "#f43f5e",
        600: "#e11d48",
        700: "#be123c",
        800: "#9f1239",
    },
    "red": {
        300: "#fca5a5",
        400: "#f87171",
        500: "#ef4444",
        600: "#dc2626",
        700: "#b91c1c",
        800: "#991b1b",
    },
    "green": {
        300: "#86efac",
        400: "#4ade80",
        500: "#22c55e",
        600: "#16a34a",
        700: "#15803d",
        800: "#166534",
    },
    "yellow": {
        300: "#fde047",
        400: "#facc15",
        500: "#eab308",
        600: "#ca8a04",
        700: "#a16207",
        800: "#854d0e",
    },
    "orange": {
        300: "#fdba74",
        400: "#fb923c",
        500: "#f97316",
        600: "#ea580c",
        700: "#c2410c",
        800: "#9a3412",
    },
    "lime": {
        300: "#bef264",
        400: "#a3e635",
        500: "#84cc16",
        600: "#65a30d",
        700: "#4d7c0f",
        800: "#3f6212",
    },
    "blue": {
        300: "#93c5fd",
        400: "#60a5fa",
        500: "#3b82f6",
        600: "#2563eb",
        700: "#1d4ed8",
        800: "#1e40af",
    },
    "teal": {
        300: "#5eead4",
        400: "#2dd4bf",
        500: "#14b8a6",
        600: "#0d9488",
        700: "#0f766e",
        800: "#115e59",
    },
    "indigo": {
        300: "#a5b4fc",
        400: "#818cf8",
        500: "#6366f1",
        600: "#4f46e5",
        700: "#4338ca",
        800: "#3730a3",
    },
    "violet": {
        300: "#c4b5fd",
        400: "#a78bfa",
        500: "#8b5cf6",
        600: "#7c3aed",
        700: "#6d28d9",
        800: "#5b21b6",
    },
    "purple": {
        300: "#d8b4fe",
        400: "#c084fc",
        500: "#a855f7",
        600: "#9333ea",
        700: "#7e22ce",
        800: "#6b21a8",
    },
    "pink": {
        300: "#f9a8d4",
        400: "#f472b6",
        500: "#ec4899",
        600: "#db2777",
        700: "#be185d",
        800: "#9d174d",
    },
    "fuchsia": {
        300: "#f0abfc",
        400: "#e879f9",
        500: "#d946ef",
        600: "#c026d3",
        700: "#a21caf",
        800: "#86198f",
    },
}

_TEXT_WHITE = re.compile(r"(?<![\w-])text-white(?![\w/-])")
_PELNE_TLO = re.compile(rf"(?<![\w/-])(?:[a-z-]+:)*bg-({_R})-(\d{{2,3}})(?![\w/-])")
#: Rodziny neutralne palety (stałe tło przycisku ``bg-slate-900 text-white``).
NEUTRALNE = ("slate", "gray", "zinc", "neutral", "stone", "chrome")
#: Dowolne stałe tło palety w wierszu (wzorzec 9 milczy, wzorce 2–4 oceniają je same).
_STALE_TLO = re.compile(
    rf"(?<![\w/-])(?:[a-z-]+:)*bg-(?:(?:{_R}|{'|'.join(NEUTRALNE)})-\d{{2,3}}(?:/\d+)?|black)"
    r"(?![\w-])"
)


def _luminancja(hex_: str) -> float:
    kanaly = [int(hex_[i : i + 2], 16) / 255 for i in (1, 3, 5)]
    lin = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in kanaly]
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]


def kontrast_na(rodzina: str, odcien: int, tlo: tuple[int, int, int]) -> float:
    """Kontrast WCAG tuszu ``text-<rodzina>-<odcien>`` (odcienie 300–800) na tle RGB."""
    kanaly = [c / 255 for c in tlo]
    lin = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in kanaly]
    l_tla = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
    l_tuszu = _luminancja(PALETA[rodzina][odcien])
    jasniejsza, ciemniejsza = max(l_tla, l_tuszu), min(l_tla, l_tuszu)
    return (jasniejsza + 0.05) / (ciemniejsza + 0.05)


def kontrast_bialego(rodzina: str, odcien: int) -> float:
    """Kontrast WCAG białego napisu na pełnym tle ``bg-<rodzina>-<odcien>``.

    Odcienie 50–200 (poza tabelą) są jaśniejsze niż 300, więc dostają 1,0 —
    biały napis na nich jest zawsze nieczytelny.
    """
    hex_ = PALETA[rodzina].get(odcien)
    if hex_ is None:
        return 1.0 if odcien < 300 else 21.0
    return 1.05 / (_luminancja(hex_) + 0.05)


#: Lista dozwolona: ``"ścieżka względem frontend/:wiersz" -> uzasadnienie``. PUSTA.
DOZWOLONE: dict[str, str] = {}

_KOMENTARZ = re.compile(r"^\s*(?:\*|//|/\*|\{/\*)")


def naruszenia_tekstu(tekst: str) -> list[tuple[int, str, str]]:
    """(numer wiersza, klasa, nazwa wzorca) każdego naruszenia w treści pliku."""
    wynik: list[tuple[int, str, str]] = []
    for numer, wiersz in enumerate(tekst.splitlines(), start=1):
        if _KOMENTARZ.match(wiersz):
            continue
        for nazwa, wzorzec in WZORCE:
            for dopasowanie in wzorzec.finditer(wiersz):
                wynik.append((numer, dopasowanie.group(0), nazwa))
        if _TEXT_WHITE.search(wiersz) and not _STALE_TLO.search(wiersz):
            for dopasowanie in re.finditer(r"(?<![\w-])(?:[a-z-]+:)*text-white(?![\w/-])", wiersz):
                wynik.append((numer, dopasowanie.group(0), "biały napis bez stałego tła"))
        if _TEXT_WHITE.search(wiersz):
            for dopasowanie in _PELNE_TLO.finditer(wiersz):
                rodzina, odcien = dopasowanie.group(1), int(dopasowanie.group(2))
                kontrast = kontrast_bialego(rodzina, odcien)
                if kontrast < 4.5:
                    wynik.append(
                        (
                            numer,
                            dopasowanie.group(0),
                            f"biały napis na pełnym tle ({kontrast:.2f}:1 < 4,5:1)",
                        )
                    )
    return sorted(wynik)


def jest_plikiem_produkcyjnym(sciezka: Path) -> bool:
    """Plik źródłowy komponentu (nie test, nie spec)."""
    if sciezka.suffix not in (".ts", ".tsx") or "__tests__" in sciezka.parts:
        return False
    return not re.search(r"\.(?:test|spec)\.tsx?$", sciezka.name)


def pliki(korzenie: tuple[Path, ...] = KORZENIE) -> list[Path]:
    """Pliki zakresu w stałej kolejności (determinizm meldunku)."""
    wynik: list[Path] = []
    for korzen in korzenie:
        wynik.extend(p for p in korzen.rglob("*") if p.is_file() and jest_plikiem_produkcyjnym(p))
    return sorted(wynik)


def sprawdz(korzenie: tuple[Path, ...] = KORZENIE) -> tuple[int, list[str]]:
    """(liczba sprawdzonych plików, meldunki naruszeń)."""
    lista = pliki(korzenie)
    meldunki: list[str] = []
    for plik in lista:
        nazwa = plik.relative_to(FRONTEND) if plik.is_relative_to(FRONTEND) else plik
        for numer, klasa, wzorzec in naruszenia_tekstu(plik.read_text(encoding="utf-8")):
            if f"{nazwa}:{numer}" in DOZWOLONE:
                continue
            meldunki.append(f"{nazwa}:{numer}: {klasa} — {wzorzec}")
    return len(lista), meldunki


def main() -> int:
    liczba, meldunki = sprawdz()
    if liczba == 0:
        # Pusty skan to błąd, nie zieleń: zmienił się układ katalogów frontu.
        print("kolory_pod_motyw_guard: BŁĄD — zakres skanu nie zawiera ani jednego pliku.")
        return 1
    if meldunki:
        print(f"kolory_pod_motyw_guard: {len(meldunki)} klas zaszytych pod jeden motyw:")
        for meldunek in meldunki:
            print(f"  {meldunek}")
        print(
            "Naprawa u źródła: kolor semantyczny z tokenów `sygnal-*` (`-tlo` tło, `-tusz` "
            "tekst na tle, bazowy na panelu), kategoria z `scada-*` (`sn`/`nn`/`wn`/"
            "`energized`/`grounded`), tekst neutralny `text-scada-text`, napis na akcencie "
            "`text-scada-bg`. Lista dozwolona jest pusta."
        )
        return 1
    print(f"kolory_pod_motyw_guard: OK — {liczba} plików, zero klas zaszytych pod motyw.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
