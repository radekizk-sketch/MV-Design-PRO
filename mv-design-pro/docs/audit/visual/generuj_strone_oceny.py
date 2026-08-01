"""Strona oceny wlasciciela — powstaje z ODKRYCIA katalogu, nie z listy w kodzie.

DLACZEGO W REPO. Strona zyla dotad wylacznie w katalogu tymczasowym sesji i przepadla,
gdy kontener cofnal migawke (2026-07-27, osmy raz w tej dobie). Zrzuty byly bezpieczne,
bo sa scalone w `docs/audit/visual/**` — tresc strony nie byla. Generator w repo znosi te
asymetrie: po cofnieciu migawki strone odtwarza jedno uruchomienie.

DLACZEGO ODKRYCIE, NIE LISTA (KD-13). Poprzednia wersja osadzala SZESC zrzutow wskazanych
na sztywno, podczas gdy w katalogu lezalo 299 plikow w 9 seriach — cala seria `flow-ekspert`
(116 plikow, komplet ekranow biezacego programu kart) byla dla strony NIEWIDOCZNA. Przyczyna
zrodlowa to lista w kodzie: dryfuje po cichu, bo kazdy nowy zrzut trzeba dopisac recznie,
a nikt tego nie robil. Dlatego strona SKANUJE katalog i pokazuje wszystko, co w nim lezy;
seria bez wpisu w `MAPA_SERII` dostaje etykiete z nazwy katalogu — pominiecie jest niemozliwe.
Bramka przeciw nawrotowi: `backend/tests/ci/test_strona_oceny_pokrycie_zrzutow.py`.

TRYBY.
  domyslny  — odwolania WZGLEDNE do plikow. Strona lezy w `docs/audit/visual/`, wiec dziala
              lokalnie i po skopiowaniu calego katalogu; jest lekka i wersjonowalna.
  --osadz SERIA[,SERIA]
            — wskazane serie osadzone jako data URI (publikacja jako artefakt, gdzie
              odwolania do zewnetrznych plikow sa zakazane). Osadzenie WSZYSTKICH zrzutow
              daloby strone rzedu dziesiatek MB, wiec zakres wybiera wolajacy.

DETERMINIZM. Dwa uruchomienia z tym samym `--data` daja bajtowo identyczny plik: kolejnosc
serii bierze sie z jawnej mapy, kolejnosc kadrow z sortowania nazw, a data generowania jest
PRZEKAZYWANA z zewnatrz (`--data` albo zmienna `DATA_STRONY_OCENY`) — nie czytana z zegara
w tresci, ktora porownuje test.

Uzycie:
  python3 mv-design-pro/docs/audit/visual/generuj_strone_oceny.py [wyjscie.html]
      [--data 2026-08-01] [--osadz sld_audyt,kreatory]
"""

from __future__ import annotations

import argparse
import base64
import os
import pathlib
from dataclasses import dataclass
from datetime import date

# Sciezki liczone wzgledem WLASNEGO katalogu, nie przez liczenie poziomow w repo —
# zrzuty sa katalogami obok, wiec przeniesienie calego `docs/audit/visual/` nic nie psuje.
KATALOG = pathlib.Path(__file__).resolve().parent

#: Klucz serii dla plikow lezacych WPROST w `docs/audit/visual/` (bez podkatalogu).
KORZEN = "korzen"


@dataclass(frozen=True)
class Seria:
    """Jedna seria zrzutow = jeden katalog. `tytul` i `opis` sa tresc dla wlasciciela."""

    klucz: str
    tytul: str
    opis: str


#: Kolejnosc serii na stronie = kolejnosc TEJ krotki (najnowsze programy pierwsze; `korzen`
#: na koncu, bo to material sprzed podzialu na serie). Katalog, ktorego tu NIE MA, nie znika
#: ze strony — dostaje etykiete z wlasnej nazwy (patrz `serie_katalogu`). Milczace pominiecie
#: jest dokladnie tym defektem, ktory ta mapa zastapila.
MAPA_SERII: tuple[Seria, ...] = (
    Seria(
        "flow-ekspert",
        "Flow projektanta — ekrany bieżącego programu kart",
        "Komplet ekranów, na których ocenia się kolejne karty: bilans CT/VT, zaczepy "
        "transformatora, katalog nN, porównanie zwarć, ogniwo aparatury, zwinięcie GPZ, "
        "kadr, motyw i tożsamość etykiet. Zrzuty żywej aplikacji, w obu motywach.",
    ),
    Seria(
        "flow-nadzor",
        "Przejście nadzorcze E1–E8",
        "Osobiste przejście etapami pracy inżyniera: pierwsze wejście, pulpit projektu, "
        "model i schemat, gotowość, obliczenia, wyniki świeże i nieaktualne, dokumentacja. "
        "Tu leżą też zrzuty samej tej strony oceny.",
    ),
    Seria(
        "dowody",
        "Dowody analiz i studiów",
        "Powierzchnie wynikowe z policzonym materiałem: arc flash, estymacja stanu, "
        "kompensacja, migotanie, zgodność odbioru, siła sieci, SSCI, FRT, LoM, sweep OLTC, "
        "macierz analiz oraz dowody czasu i linii z serii F-K1.",
    ),
    Seria(
        "fk7",
        "Dobór aparatury — karta F-K7",
        "Dobór na danych katalogowych oraz wariant z uziemieniem punktu neutralnego.",
    ),
    Seria(
        "kreatory",
        "Kreatory obiektów i konfigurator wytwórcy",
        "Wejście danych do modelu: kreator pola SN, źródła OZE, arc flash oraz "
        "powierzchnia wytwórcy E-21 na desktopie, telefonie i tablecie razem z wyborem "
        "typu z katalogu backendu.",
    ),
    Seria(
        "sld_audyt",
        "Schemat jednoliniowy — audyt poziomów szczegółu",
        "Poziomy L0/L1/L2 sieci wzorcowej 52 stacji oraz dwa kadry szczegółu 1:1 (GPZ, "
        "stacja z polami). Pary jasny/ciemny są tu bajtowo identyczne ŚWIADOMIE: "
        "powierzchnia schematu stoi na stałej palecie SCADA, żeby kolor niósł znaczenie "
        "elektryczne, a nie preferencję motywu.",
    ),
    Seria(
        "schemat-10",
        "Program schematu — dowody wizualne serii S/W/R/GS",
        "Dowody kolejnych reguł rysunku technicznego (tor DER po stronie SN, adnotacje "
        "CT/VT, warstwy wyników, zoom). Opis każdego kadru: `schemat-10/README.md`.",
    ),
    Seria(
        "ocena-2026-07",
        "Ocena 2026-07 — pierwsza runda oględzin",
        "GPZ, wszystkie poziomy szczegółu i sieć demonstracyjna z warstwą wyników "
        "zwarciowych — materiał, od którego zaczęła się seria ocen.",
    ),
    Seria(
        KORZEN,
        "Katalog główny — materiał sprzed podziału na serie",
        "Kadry schematu, kompozycje stacji i źródeł OZE, powierzchnie wyników i dowodów "
        "zebrane zanim materiał rozdzielono na serie. Zostaje jako archiwum porównawcze.",
    ),
)

#: Sufiksy motywu. Rozdzielnik jest CZESCIA klucza pary: `a-dark.png` i `a_light.png` nie
#: sa para (to dwa rozne materialy o zbieznej nazwie), wiec nie wolno ich skleic.
MOTYWY: tuple[tuple[str, str], ...] = (("light", "motyw jasny"), ("dark", "motyw ciemny"))
ROZDZIELNIKI: tuple[str, ...] = ("-", "_")

# Kadry osadzone w NARRACJI (V12K-234): kadr calej sieci oraz dwa kadry szczegolu, a po
# V12K-242/243 trzy kadry ZYWEJ powierzchni E-21 z harnessu. Te same pliki stoja rowniez
# w galerii wyzej — narracja potrzebuje ich W TRESCI, wiec odwoluje sie do nich wprost.
OSADZONE = {
    "ZRZUT_L2": "sld_audyt/sld_L2_dark.png",
    "ZRZUT_GPZ": "sld_audyt/sld_szczegol_gpz.png",
    "ZRZUT_STACJA": "sld_audyt/sld_szczegol_stacja.png",
    "ZRZUT_WIAZANIA": "kreatory/wiazania_oze.png",
    "ZRZUT_PICKER": "kreatory/wiazania_oze_picker.png",
    "ZRZUT_MOBILNY": "kreatory/wiazania_oze_mobile.png",
}


@dataclass(frozen=True)
class Kadr:
    """Jeden plik: sciezka wzgledem `docs/audit/visual/` + etykieta motywu ('' = brak)."""

    sciezka: str
    motyw: str


@dataclass(frozen=True)
class Kafel:
    """Jeden material oceny: para motywow obok siebie albo pojedynczy zrzut."""

    podpis: str
    kadry: tuple[Kadr, ...]


def rozbior_nazwy(nazwa: str) -> tuple[str, str, str]:
    """`kd3-bilans-dark.png` -> ('kd3-bilans', '-', 'dark'); bez sufiksu -> (trzon, '', '')."""
    trzon = nazwa[: -len(".png")]
    for rozdzielnik in ROZDZIELNIKI:
        for sufiks, _etykieta in MOTYWY:
            koncowka = rozdzielnik + sufiks
            if trzon.endswith(koncowka):
                return trzon[: -len(koncowka)], rozdzielnik, sufiks
    return trzon, "", ""


def kafle_serii(pliki: list[str]) -> list[Kafel]:
    """Pary motywow (ten sam trzon I ten sam rozdzielnik) ida w JEDEN kafel, obok siebie.

    Zrzut bez pary zostaje kaflem pojedynczym — z zachowana etykieta motywu, bo brak
    drugiego wariantu jest informacja dla ogledzin, a nie powodem do ukrycia kadru.
    """
    etykieta = dict(MOTYWY)
    grupy: dict[tuple[str, str], dict[str, str]] = {}
    pojedyncze: list[tuple[str, str]] = []
    for sciezka in pliki:
        nazwa = sciezka.rsplit("/", 1)[-1]
        trzon, rozdzielnik, sufiks = rozbior_nazwy(nazwa)
        if sufiks:
            grupy.setdefault((trzon, rozdzielnik), {})[sufiks] = sciezka
        else:
            pojedyncze.append((trzon, sciezka))
    zebrane: list[tuple[str, Kafel]] = []
    for (trzon, _rozdzielnik), warianty in grupy.items():
        kadry = tuple(
            Kadr(warianty[sufiks], etykieta[sufiks])
            for sufiks, _opis in MOTYWY
            if sufiks in warianty
        )
        zebrane.append((trzon, Kafel(trzon, kadry)))
    for trzon, sciezka in pojedyncze:
        zebrane.append((trzon, Kafel(trzon, (Kadr(sciezka, ""),))))
    # Sortowanie po trzonie, a przy remisie po pierwszej sciezce — kolejnosc na stronie nie
    # moze zalezec od kolejnosci obchodzenia katalogu ani od czasu modyfikacji pliku.
    return [kafel for _klucz, kafel in sorted(zebrane, key=lambda p: (p[0], p[1].kadry[0].sciezka))]


def serie_katalogu(katalog: pathlib.Path) -> list[tuple[Seria, list[str]]]:
    """Skan `katalog/**/*.png` pogrupowany po katalogu-serii, w kolejnosci `MAPA_SERII`.

    Seria spoza mapy NIE JEST pomijana: dostaje etykiete z nazwy katalogu i lezy na koncu,
    alfabetycznie. To jest cala istota tej zmiany — strona ma pokazywac zawartosc repo,
    a nie stan wiedzy autora listy.
    """
    znalezione: dict[str, list[str]] = {}
    for png in katalog.rglob("*.png"):
        wzgledna = png.relative_to(katalog).as_posix()
        klucz = wzgledna.rsplit("/", 1)[0] if "/" in wzgledna else KORZEN
        znalezione.setdefault(klucz, []).append(wzgledna)
    wynik: list[tuple[Seria, list[str]]] = []
    opisane = {seria.klucz for seria in MAPA_SERII}
    for seria in MAPA_SERII:
        if seria.klucz in znalezione:
            wynik.append((seria, sorted(znalezione[seria.klucz])))
    for klucz in sorted(k for k in znalezione if k not in opisane):
        wynik.append(
            (
                Seria(
                    klucz,
                    f"Katalog „{klucz}”",
                    "Seria bez wpisu w mapie etykiet — tytuł pochodzi z nazwy katalogu. "
                    "Dopisz opis w <code>MAPA_SERII</code>, żeby oględziny wiedziały, "
                    "czego tu szukać.",
                ),
                sorted(znalezione[klucz]),
            )
        )
    return wynik


def _data_uri(png: pathlib.Path) -> str:
    """Plik jako data URI. JPEG przy dostepnym Pillow (mniejsza strona), inaczej surowy PNG."""
    if not png.exists():
        raise SystemExit(f"brak zrzutu: {png}")
    try:
        from PIL import Image
    except ModuleNotFoundError:
        return "data:image/png;base64," + base64.b64encode(png.read_bytes()).decode("ascii")
    import io

    bufor = io.BytesIO()
    with Image.open(png) as obraz:
        obraz.convert("RGB").save(bufor, format="JPEG", quality=80, optimize=True)
    return "data:image/jpeg;base64," + base64.b64encode(bufor.getvalue()).decode("ascii")


def wymiary_png(png: pathlib.Path) -> tuple[int, int]:
    """Rozmiar wlasny obrazu z naglowka IHDR (czysty stdlib). Plik nie-PNG -> (0, 0).

    DLACZEGO TO JEST POTRZEBNE. Kadry sa ladowane leniwie, wiec dopoki obraz nie dojdzie,
    `<img>` bez wymiarow ma wysokosc ZERO — uklad skacze, a przejscie do kotwicy w nawigacji
    lada w zupelnie innym miejscu strony (zmierzone: zrzut spod `#narracja` wyszedl pusty).
    Podanie `width`/`height` daje przegladarce proporcje z gory, wiec miejsce jest
    zarezerwowane, zanim obraz sie pojawi.
    """
    try:
        naglowek = png.read_bytes()[:24]
    except OSError:
        return 0, 0
    if len(naglowek) < 24 or naglowek[:8] != b"\x89PNG\r\n\x1a\n" or naglowek[12:16] != b"IHDR":
        return 0, 0
    return int.from_bytes(naglowek[16:20], "big"), int.from_bytes(naglowek[20:24], "big")


def zrodlo(katalog: pathlib.Path, sciezka: str, osadzone: frozenset[str]) -> str:
    """Wartosc atrybutu `src`: data URI dla serii z `--osadz`, inaczej sciezka wzgledna."""
    klucz = sciezka.rsplit("/", 1)[0] if "/" in sciezka else KORZEN
    if klucz in osadzone:
        return _data_uri(katalog / sciezka)
    return sciezka


def _kotwica(klucz: str) -> str:
    return "seria-" + klucz.replace("/", "-").replace("_", "-")


def _atrybuty_wymiarow(png: pathlib.Path) -> str:
    szerokosc, wysokosc = wymiary_png(png)
    return f' width="{szerokosc}" height="{wysokosc}"' if szerokosc and wysokosc else ""


def _kafel_html(kafel: Kafel, katalog: pathlib.Path, osadzone: frozenset[str]) -> str:
    obrazy = "".join(
        f'<img src="{zrodlo(katalog, kadr.sciezka, osadzone)}" '
        f'alt="{kafel.podpis}{" — " + kadr.motyw if kadr.motyw else ""}"'
        + _atrybuty_wymiarow(katalog / kadr.sciezka)
        + ' loading="lazy">'
        for kadr in kafel.kadry
    )
    motywy = " · ".join(kadr.motyw for kadr in kafel.kadry if kadr.motyw)
    # Sciezka pliku stoi w podpisie ZAWSZE, takze w trybie osadzonym: bez niej uwagi
    # z ogledzin nie da sie przypisac do konkretnego zrzutu.
    sciezki = "".join(f'<code class="plik">{kadr.sciezka}</code>' for kadr in kafel.kadry)
    klasa = "para dwa" if len(kafel.kadry) > 1 else "para"
    return (
        '<figure class="kafel">'
        f'<div class="{klasa}">{obrazy}</div>'
        f"<figcaption><strong>{kafel.podpis}</strong>"
        + (f'<span class="motywy">{motywy}</span>' if motywy else "")
        + f"{sciezki}</figcaption></figure>"
    )


def zbuduj_strone(
    katalog: pathlib.Path, data_strony: str, osadzone: frozenset[str] = frozenset()
) -> str:
    """Cala strona jako tekst. `data_strony` przychodzi Z ZEWNATRZ (determinizm)."""
    serie = serie_katalogu(katalog)
    nawigacja = (
        " ".join(
            f'<a href="#{_kotwica(seria.klucz)}">{seria.tytul.split(" — ")[0]}</a>'
            for seria, _pliki in serie
        )
        + ' <a href="#narracja">Narracja serii</a>'
    )
    wiersze = []
    sekcje = []
    razem_kafli = 0
    for seria, pliki in serie:
        kafle = kafle_serii(pliki)
        razem_kafli += len(kafle)
        wiersze.append(
            f'<tr><td><a href="#{_kotwica(seria.klucz)}">{seria.tytul}</a></td>'
            f'<td class="num">{len(kafle)}</td><td class="num">{len(pliki)}</td></tr>'
        )
        kadry = "".join(_kafel_html(kafel, katalog, osadzone) for kafel in kafle)
        sekcje.append(
            f'<section id="{_kotwica(seria.klucz)}">'
            f"<h2>{seria.tytul}</h2><p>{seria.opis}</p>"
            f'<p class="cichy">Katalog <code>{seria.klucz}</code> · kafli: {len(kafle)} · '
            f"plików: {len(pliki)}</p>"
            f'<div class="siatka">{kadry}</div>'
            "</section>"
        )
    razem_plikow = sum(len(pliki) for _seria, pliki in serie)
    wiersze.append(
        f'<tr><td><strong>Razem</strong></td><td class="num"><strong>{razem_kafli}</strong></td>'
        f'<td class="num"><strong>{razem_plikow}</strong></td></tr>'
    )
    strona = SZKIELET
    for znacznik, wartosc in (
        ("NAWIGACJA", nawigacja),
        ("TABELA_SERII", "\n".join(wiersze)),
        ("SEKCJE_GALERII", "\n".join(sekcje)),
        ("LICZBA_SERII", str(len(serie))),
        ("LICZBA_ZRZUTOW", str(razem_plikow)),
        ("DATA_STRONY", data_strony),
    ):
        strona = strona.replace(znacznik, wartosc)
    for znacznik, nazwa in OSADZONE.items():
        strona = strona.replace(znacznik, zrodlo(katalog, nazwa, osadzone))
    return strona


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Strona oceny — wszystkie zrzuty z `docs/audit/visual/`, ze skanu katalogu."
    )
    parser.add_argument(
        "wyjscie", nargs="?", default=str(KATALOG / "ocena_seria.html"), help="plik wynikowy"
    )
    parser.add_argument(
        "--data",
        default=os.environ.get("DATA_STRONY_OCENY", ""),
        help="data generowania w nagłówku (domyślnie DATA_STRONY_OCENY albo dzień dzisiejszy)",
    )
    parser.add_argument(
        "--osadz",
        default="",
        help="serie osadzone jako data URI, po przecinku (domyślnie: odwołania względne)",
    )
    args = parser.parse_args(argv)
    serie = serie_katalogu(KATALOG)
    dostepne = {seria.klucz for seria, _pliki in serie}
    osadzone = frozenset(klucz for klucz in args.osadz.split(",") if klucz)
    nieznane = sorted(osadzone - dostepne)
    if nieznane:
        raise SystemExit(
            "--osadz: nieznane serie: "
            + ", ".join(nieznane)
            + "; dostępne: "
            + ", ".join(sorted(dostepne))
        )
    wyjscie = pathlib.Path(args.wyjscie)
    wyjscie.write_text(
        zbuduj_strone(KATALOG, args.data or date.today().isoformat(), osadzone), encoding="utf-8"
    )
    print(
        f"strona zapisana: {wyjscie} ({wyjscie.stat().st_size // 1024} kB, "
        f"serii: {len(serie)}, zrzutów: {sum(len(p) for _s, p in serie)}, "
        f"osadzone: {', '.join(sorted(osadzone)) or 'brak (odwołania względne)'})"
    )
    return 0


SZKIELET = """<title>MV-DESIGN-PRO · Ekrany do oceny</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
:root{--tlo:#f7f6f2;--karta:#fff;--tekst:#191814;--cichy:#5d594f;--linia:#dbd6c9;--akcent:#2e5f7a;
--akcent-tlo:#e6eef3;--ok:#2f6b3f;--brak:#8c2f2f;--uwaga:#8a5a12}
@media(prefers-color-scheme:dark){:root{--tlo:#121310;--karta:#1c1e19;--tekst:#e9e6dc;--cichy:#9f9a8c;
--linia:#31342c;--akcent:#7fb6d4;--akcent-tlo:#1b262d;--ok:#7fb98c;--brak:#e39a94;--uwaga:#d9ae5f}}
:root[data-theme=dark]{--tlo:#121310;--karta:#1c1e19;--tekst:#e9e6dc;--cichy:#9f9a8c;--linia:#31342c;
--akcent:#7fb6d4;--akcent-tlo:#1b262d;--ok:#7fb98c;--brak:#e39a94;--uwaga:#d9ae5f}
:root[data-theme=light]{--tlo:#f7f6f2;--karta:#fff;--tekst:#191814;--cichy:#5d594f;--linia:#dbd6c9;
--akcent:#2e5f7a;--akcent-tlo:#e6eef3;--ok:#2f6b3f;--brak:#8c2f2f;--uwaga:#8a5a12}
*{box-sizing:border-box}
body{margin:0;background:var(--tlo);color:var(--tekst);font:16px/1.62 ui-serif,Georgia,serif}
.owijka{max-width:1140px;margin:0 auto;padding:48px 24px 96px}
header{border-bottom:2px solid var(--akcent);padding-bottom:24px;margin-bottom:40px}
.nadtytul{font:600 12px/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:.14em;
text-transform:uppercase;color:var(--akcent);margin-bottom:12px}
h1{font-size:33px;line-height:1.15;margin:0 0 12px;text-wrap:balance;font-weight:600}
h2{font-size:23px;margin:52px 0 8px;padding-top:22px;border-top:1px solid var(--linia);
text-wrap:balance;font-weight:600}
p{margin:0 0 14px;max-width:70ch}
.cichy{color:var(--cichy);font-size:14px}
.karta{background:var(--karta);border:1px solid var(--linia);border-left:3px solid var(--ok);
border-radius:3px;padding:18px 22px;margin:22px 0}
.karta.otwarta{border-left-color:var(--uwaga)}
.karta.wycof{border-left-color:var(--cichy)}
figure{margin:20px 0 30px}
figure img{width:100%;height:auto;display:block;border:1px solid var(--linia);border-radius:3px}
figcaption{font:13px/1.5 ui-sans-serif,system-ui,sans-serif;color:var(--cichy);margin-top:8px}
.tab{overflow-x:auto;margin:18px 0}
table{border-collapse:collapse;width:100%;font-size:14px}
th,td{text-align:left;padding:8px 12px;border-bottom:1px solid var(--linia);vertical-align:top}
th{font:600 12px/1.3 ui-sans-serif,system-ui,sans-serif;letter-spacing:.06em;
text-transform:uppercase;color:var(--cichy)}
td.num{font-family:ui-monospace,Menlo,monospace;font-variant-numeric:tabular-nums;text-align:right}
ul{margin:0 0 14px;padding-left:22px;max-width:70ch}li{margin-bottom:7px}
code{font:.9em ui-monospace,Menlo,monospace;background:var(--akcent-tlo);padding:1px 4px;border-radius:2px}
.lep{color:var(--ok);font-weight:600}
.stan{font:600 11px/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:.1em;text-transform:uppercase;
padding:3px 7px;border-radius:2px;vertical-align:2px}
.stan.otw{background:var(--uwaga);color:var(--tlo)}
a{color:var(--akcent)}
nav{position:sticky;top:0;z-index:2;background:var(--tlo);border-bottom:1px solid var(--linia);
padding:10px 0;margin:0 0 26px;display:flex;flex-wrap:wrap;gap:8px 18px;
font:600 12px/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase}
nav a{text-decoration:none;border-bottom:1px solid transparent;padding-bottom:2px}
nav a:hover,nav a:focus-visible{border-bottom-color:var(--akcent)}
section{padding-top:26px;margin-top:34px;border-top:1px solid var(--linia)}
section>h2{border-top:0;padding-top:0;margin-top:0}
/* `align-items:start` jest KONIECZNE: bez niego kafel o nizszym zrzucie rozciaga sie do
wysokosci sasiada w wierszu i pod podpisem zieje pusty blok — widziane na ogledzinach. */
.siatka{display:grid;grid-template-columns:1fr;gap:22px;margin-top:18px;align-items:start}
@media(min-width:900px){.siatka{grid-template-columns:1fr 1fr}}
.kafel{margin:0;background:var(--karta);border:1px solid var(--linia);border-radius:3px;
overflow:hidden;display:flex;flex-direction:column}
.para{display:grid;grid-template-columns:1fr;gap:1px;background:var(--linia)}
.para.dwa{grid-template-columns:1fr 1fr}
.kafel img{width:100%;height:auto;display:block;border:0;border-radius:0;background:var(--tlo)}
.kafel figcaption{font:13px/1.5 ui-sans-serif,system-ui,sans-serif;color:var(--cichy);
padding:10px 12px 12px;display:flex;flex-direction:column;gap:5px;border-top:1px solid var(--linia)}
.kafel figcaption strong{color:var(--tekst);font-size:14px;word-break:break-word}
.motywy{font:600 10px/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:.1em;
text-transform:uppercase;color:var(--akcent)}
.plik{font:11px/1.4 ui-monospace,Menlo,monospace;color:var(--cichy);opacity:.8;
background:none;padding:0;word-break:break-all}
</style>
<div class="owijka">
<header>
<div class="nadtytul">Materiał oceny · serii: LICZBA_SERII · zrzutów: LICZBA_ZRZUTOW · DATA_STRONY</div>
<h1>Wszystkie zrzuty, które leżą w repozytorium</h1>
<p class="cichy">Strona powstaje ze <strong>skanu katalogu</strong> <code>docs/audit/visual/</code>,
nie z listy w kodzie. Poprzednia wersja osadzała sześć zrzutów wskazanych na sztywno i nie
znała reszty — w tym całej serii ekranów bieżącego programu. Lista w kodzie dryfuje po cichu;
katalog nie.</p>
</header>

<nav>NAWIGACJA</nav>

<p><strong>Jak to czytać.</strong> Każdy kafel to jeden materiał: para motywów stoi
<em>obok siebie</em>, zrzut bez pary — pojedynczo, z zachowaną etykietą motywu. Pod kafelkiem
leży ścieżka pliku, żeby uwagę z oględzin dało się przypisać do konkretnego zrzutu. Serie idą
w kolejności programów (najnowsze pierwsze), wewnątrz serii alfabetycznie.</p>

<div class="tab"><table>
<thead><tr><th>Seria</th><th class="num">Kafli</th><th class="num">Plików</th></tr></thead>
<tbody>TABELA_SERII</tbody></table></div>

SEKCJE_GALERII

<section id="narracja">
<h2>Narracja serii V12K-216…243 — zapis oględzin z 2026-07-27</h2>
<p class="cichy">Tekst i sześć kadrów, wokół których ta strona powstała. Zostaje w całości:
to zapis rozstrzygnięć, nie ilustracja. Kadry pochodzą z serii <code>sld_audyt</code>
i <code>kreatory</code>, które w komplecie leżą wyżej.</p>

<h2>Rysunek po serii SLD</h2>
<figure><img src="ZRZUT_L2" alt="SLD poziom L2, kadr całej sieci wzorcowej" loading="lazy">
<figcaption><strong>L2, kadr całej sieci (52 stacje).</strong> Czerwień 110&nbsp;kV w GPZ jest
widoczna, ale <strong>1135 opisów jest tu ukrytych</strong> przez declutter, a aparaty pól leżą
poniżej rozdzielczości piksela. Ten kadr pokazuje <em>strukturę</em> — nie detal.</figcaption></figure>

<div class="karta otwarta">
<p><strong>Znalezisko z oględzin: materiał obiecywał detal, którego nie zawierał.</strong>
Podpisywałem ten zrzut jako „L2 — obiekty i pola (+ detal stacji, aparaty, DER pełny)”. Przy kadrze
obejmującym całą sieć skala kamery spada tak nisko, że próg czytelności (liczony w pikselach
<em>ekranu</em>) kasuje wszystkie etykiety, legenda schodzi do nieczytelnej smugi, a aparaty pól
nie mają nawet jednego piksela. Czyli w materiale nie było <strong>ani jednego</strong>
z wymienionych elementów.</p>
<p class="cichy">Sześć zielonych testów tego nie wykrywało, bo sprawdzały render i brak błędów
konsoli — nie <em>czytelność tego, co mają pokazać</em>. Zieloną bramkę miałem, pokrycia
intencji nie.</p>
</div>

<h2>Kadry szczegółu — dopiero tu widać poziom L2</h2>
<figure><img src="ZRZUT_GPZ" alt="Kadr szczegółu: rozdzielnia GPZ 110/15 kV" loading="lazy">
<figcaption><strong>Rozdzielnia GPZ 110/15&nbsp;kV.</strong> Opis źródła czyta się w całości:
„GPZ Referencyjny 15 kV · Ekwiwalent sieci zasilającej · Sk″ 250 MVA · Ik″ 9,62 kA · 15 kV”.
Te same dane, których w kadrze całej sieci nie było.</figcaption></figure>
<figure><img src="ZRZUT_STACJA" alt="Kadr szczegółu: stacja na magistrali z polami" loading="lazy">
<figcaption><strong>Stacja na magistrali z polami.</strong> Cztery pola z aparatami Q1/QE1
i transformatorem T1, kierunki nad szyną („kier. S01”, „kier. S03”, „odg. S45”), tabliczka
„Stacja T8 · S02 · 630 kVA · stacja odgałęźna · Szyna nN&nbsp;· 0,4&nbsp;kV · Odbiór ΣP 0,4 MW”.
Dopiero przy tej skali kamery declutter przestaje to ukrywać — i dopiero tu widać, że zapis
napięcia szyny nN był niespójny z resztą tabliczki (naprawione niżej).</figcaption></figure>
<p>Kadr jest wycinkiem <strong>1:1</strong>, nie przeskalowanym zrzutem: przeskalowanie dodałoby
rozmycie i <em>nadal</em> nie pokazałoby etykiet, bo declutter ukrywa je przy małej skali
<strong>kamery</strong>, a nie przy małym rozmiarze pliku. Powiększenie robi więc kamera — i to
realnym gestem: kółko nad punktem zainteresowania, ta sama ścieżka, którą ma projektant.
Parametr w harnessie albo wymuszony stan kamery obszedłby ścieżkę, w której defekt może siedzieć.</p>
<p class="cichy"><strong>Kadr jest mierzony, nie zgadywany.</strong> Zoom kotwiczy się na kursorze
i rośnie wykładniczo, więc przy ośmiu krokach jeden piksel różnicy w punkcie gestu przesuwa obraz
o kilkanaście. Test mierzy obwiednię symbolu i wymaganych opisów, dosuwa ją realnym
przeciągnięciem i <em>asertuje, że każdy opis leży cały w kadrze</em> — bez tej asercji kadr może
uciąć opis i nadal mieć poprawny rozmiar pliku. Tak właśnie straciłem „Sk” z „Sk″ 250 MVA”
w pierwszej wersji; bramka wyłapała po drodze trzy kolejne błędy samego narzędzia.</p>

<div class="karta">
<p><strong>Fałszywy zarzut, który sam wycofałem.</strong> Pary zrzutów <code>*_light</code>
i <code>*_dark</code> są <strong>bajtowo identyczne</strong> — wyglądało to na zepsuty motyw.
Lektura harnessu pokazała decyzję projektową: kanwa v3 ma stałe tło techniczne, bo rysunek
techniczny nie reaguje na motyw interfejsu. Zamiast zgłaszać nieistniejący defekt zamieniłem
komentarz w <strong>sprawdzany niezmiennik</strong>: gdyby render zaczął reagować na motyw,
asercja padnie i wymusi decyzję — albo zrzuty mają się różnić naprawdę, albo duplikat trzeba
usunąć. Milcząca zmiana w żadną stronę nie przejdzie.</p>
</div>

<h2>Co kadry szczegółu natychmiast pokazały</h2>
<p>Materiał, który zaczął pokazywać rysunek z bliska, przestał być ilustracją i stał się
narzędziem. Na pierwszych dwóch kadrach zobaczyłem <strong>dwa defekty, których żaden
z 3777 testów SLD nie widział</strong> — i oba ujawniły się <em>wyłącznie</em> dlatego, że
kadr powiększa i przesuwa kanwę realnymi gestami, a nie wymuszonym stanem kamery.</p>
<div class="karta">
<p><strong>Przesuwanie rysunku zaznaczało tekst schematu.</strong> Kanwa nie deklarowała
<code>user-select</code>, więc przeciągnięcie — gest <em>kamery</em> — było przez przeglądarkę
rozumiane także jako zaznaczanie treści. Po jednym przeciągnięciu
<code>window.getSelection()</code> zwracało „Stacja T8 …", a niebieskie prostokąty
podświetlenia obejmowały <strong>całą tabliczkę stacji</strong>. Zabezpieczenie dotykowe
istniało od początku; mysz nie miała żadnego. Defekt dotyczył każdego użycia kanwy.</p>
</div>
<div class="karta">
<p><strong>Trzy konwencje zapisu liczby na jednym rysunku technicznym.</strong> W tej samej
tabliczce stało „Szyna nN · 0.4 kV" (kropka) i „Odbiór ΣP 0,4 MW" (przecinek). Etykiety szyn
wstawiały liczbę surowo, a dwie inne warstwy miały po własnej kopii reguły polskiej —
i <em>wzorzec kontrolny legalizował kropkę</em>, czyli bramka chroniła zapis niezgodny
z resztą rysunku. Teraz jedna funkcja; dwa miejsca dziesiętne, żeby szyna 0,69 kV nie stała
się „0,7 kV" — zaokrąglenie napięcia znamionowego jest zmianą danej, nie zapisu.</p>
<p class="cichy">Geometria nietknięta: szerokość etykiety liczy się z długości tekstu,
a przecinek jest tak samo długi jak kropka — sprawdzone asercją równości szerokości.</p>
</div>

<h2>Trzy spostrzeżenia sprawdzone i odrzucone</h2>
<div class="tab"><table>
<thead><tr><th>Co wyglądało na defekt</th><th>Weryfikacja</th></tr></thead>
<tbody>
<tr><td>Kabel opisany „20 kV" wychodzi z szyny „15 kV"</td>
<td>20 kV to napięcie <strong>znamionowe kabla</strong> (12/20 kV dla sieci 15 kV) i stoi na
konwencjonalnym miejscu — za typem i przekrojem. Zmiana byłaby psuciem konwencji.</td></tr>
<tr><td>Każde pole pokazuje <code>Q1</code> i <code>QE1</code></td>
<td>Pola są rozróżnione opisem kierunku nad szyną („kier. S01", „kier. S03", „odg. S45"), więc
wskazanie jest jednoznaczne. Prefiks pola w glifie poszerzyłby etykietę i ruszył geometrię —
to zapisany dług z policzoną ceną, nie przeoczenie.</td></tr>
<tr><td>Identyczne pary jasny/ciemny</td>
<td>Decyzja projektowa, nie defekt — zamknięta sprawdzanym niezmiennikiem (wyżej).</td></tr>
</tbody></table></div>

<h2>Norma wróciła do katalogu</h2>
<p>Reguła IEC 61869-2 — „klasa z literą P oznacza rdzeń zabezpieczeniowy" — była
zaimplementowana <strong>w warstwie prezentacji</strong>, a kontrakt katalogu tej danej
w ogóle nie wystawiał. Katalog jest właścicielem tej własności, więc derywacja stoi teraz
w nim, a ekran czyta opublikowaną wartość. Przy okazji każdy rdzeń zabezpieczeniowy niesie
ALF — liczbę po literze P, czyli <em>odczyt oznaczenia</em>, nie oszacowanie.</p>
<div class="tab"><table>
<thead><tr><th>Katalog referencyjny CT</th><th class="num">Liczba</th><th>Co z tego wynika</th></tr></thead>
<tbody>
<tr><td>rdzenie zabezpieczeniowe (2× 5P10, 6× 5P20, 1× 10P10)</td><td class="num">9</td>
<td>na tych typach może dziś stanąć oś zabezpieczeń</td></tr>
<tr><td>rdzenie pomiarowe (0,5)</td><td class="num">3</td>
<td>dają <em>werdykt</em> „klasa nie jest zabezpieczeniowa", nie brak danej</td></tr>
<tr><td>typy dwurdzeniowe</td><td class="num">0</td>
<td>warunek różnicowy 87T pozostaje nierozstrzygalny — <strong>uczciwie</strong></td></tr>
</tbody></table></div>

<div class="karta">
<p><strong>Ekran kazał wybrać przekładnik, który już był wybrany.</strong> Wiersze
„Przekładnik CT/VT" rozwiązywały identyfikator w lokalnym katalogu syntetycznym o zerowym
pokryciu z prawdziwym (5 wpisów wobec 12, i 4 wobec 9), więc dla aparatu przypisanego
w modelu wypisywały „wybierz wariant katalogowy". Teraz etykieta ma trzy <em>różne</em>
stany: brak przypisania to polecenie wyboru, przypisanie bez wpisu w katalogu to kreska
(„nie wiem, jak się nazywa"), a znaleziony typ to nazwa katalogowa. Żaden nie udaje
drugiego.</p>
</div>

<div class="karta wycof">
<p><strong>Samokorekta w trakcie tej naprawy.</strong> Usunąłem najpierw także katalog VT
jako martwy — bo inwentarz konsumentów przeczytałem przez <code>head</code>, który uciął
listę. Pełny przebieg pokazał realnego konsumenta: picker w karcie zabezpieczeń stacji.
Katalog VT przywrócony, lekcja zapisana w rejestrze: <em>inwentarz czytany przez
<code>head</code> nie jest inwentarzem</em>. To ta sama klasa błędu, przed którą chroni
zasada „mierz, nie zgaduj" — tyle że popełniona na własnym pomiarze.</p>
</div>

<h2>Narzędzie, którego CI nigdy nie uruchamiało</h2>
<div class="karta">
<p>Konfiguracja projektu ustawia <strong>mypy w trybie strict</strong>, instrukcja
deweloperska wymienia go wśród poleceń — a <strong>żaden z ośmiu workflow go nie
uruchamiał</strong>. Przez ten czas narosło <strong>273 błędy typów w 67 plikach</strong>
(z 741 sprawdzanych). To ten sam wzorzec, który ta seria zamyka po stronie produktu —
warstwa zabezpieczeń, punkt neutralny, kryterium IEC 60949, macierz gotowości —
tyle że po stronie narzędzi: <em>zdolność bez wywołania</em>.</p>
<p>Wpięcie <code>mypy src</code> wprost zrobiłoby CI trwale czerwone, a czerwone CI
przestaje być sygnałem. Wykluczenie pliku albo <code>continue-on-error</code> byłoby
maskowaniem długu. Zapadka robi trzecią rzecz: <strong>uruchamia mypy naprawdę</strong>
i pilnuje, żeby licznik nie urósł ani o jeden błąd. Działa też w drugą stronę — po
poprawie żąda obniżenia progu, bo bez utrwalenia poprawa cofa się po cichu.</p>
<p class="cichy">Sprawdzone wstrzykniętą regresją: jedna funkcja bez adnotacji podnosi
licznik 273 → 274 i zapadka odcina, nazywając plik i linię.</p>
</div>

<h2>Zamknięte na schemacie</h2>
<div class="tab"><table>
<thead><tr><th>Rejestr</th><th>Rzecz</th><th>Pomiar</th></tr></thead>
<tbody>
<tr><td>V12K-216</td><td>Czerwień 110 kV wg palety OSD — WN dzielił barwę z ramką i legendą</td>
<td class="num">L0: 2 → <span class="lep">3</span> kolory</td></tr>
<tr><td>V12K-217</td><td>Aparaty pola WN — wyłącznik 110 kV wyglądał jak 15 kV</td>
<td class="num">6 → <span class="lep">15</span></td></tr>
<tr><td>V12K-218</td><td>Declutter ekranowy, próg 6 px</td><td class="num">1135 ukrytych</td></tr>
<tr><td>V12K-219</td><td>Punkt neutralny end-to-end + blokada zwarcia doziemnego bez uziemienia</td>
<td class="num">0/315 → <span class="lep">56</span></td></tr>
<tr><td>V12K-220</td><td>Warstwa zabezpieczeniowa ożyła</td>
<td class="num">adnotacje 0 → <span class="lep">8</span></td></tr>
<tr><td>V12K-222</td><td>Wskaźnik ukrytych opisów do warstwy ekranu</td><td class="num">—</td></tr>
<tr><td>V12K-223</td><td>Opis sieci w legendzie — punkt neutralny z <strong>wartością</strong></td>
<td class="num">57,7 Ω</td></tr>
<tr><td>V12K-234</td><td>Kadry szczegółu w materiale oceny + niezmiennik motywu</td>
<td class="num">testy 6 → <span class="lep">9</span></td></tr>
<tr><td>V12K-235</td><td>Przesuwanie rysunku nie zaznacza tekstu · jeden zapis liczby</td>
<td class="num">3 konwencje → <span class="lep">1</span></td></tr>
<tr><td>V12K-239</td><td>Rdzeń CT wyprowadzany w katalogu · koniec katalogu atrapy</td>
<td class="num">12 typów, <span class="lep">9</span> zabezp.</td></tr>
<tr><td>V12K-240</td><td>Zapadka długu typów — mypy wreszcie biegnie w CI</td>
<td class="num">273 błędy, próg <span class="lep">zamknięty</span></td></tr>
<tr><td>V12K-241</td><td>Recenzja własnego diffu — pięć znalezisk, w tym referencje spoza katalogu</td>
<td class="num">5 → <span class="lep">0</span></td></tr>
<tr><td>V12K-242</td><td>Ekran wyboru wiązań wytwórcy — łańcuch dostał początek</td>
<td class="num">0 → <span class="lep">3</span> kontrolki</td></tr>
<tr><td>V12K-243</td><td>Ocena liczona na żywo · koniec trzeciej reguły · picker w palecie SCADA</td>
<td class="num">3 reguły → <span class="lep">1</span></td></tr>
</tbody></table></div>

<div class="karta wycof">
<p><strong>Wycofane: V12K-221.</strong> Opis punktu neutralnego chciałem najpierw postawić
<em>przy szynie</em>. Trzy niezależne bramki odrzuciły to miejsce po kolei — kolizja z blokiem
declutteru, sonda etykiety szyny wymagająca prawdziwej szyny, kolizja etykiety z przewodem przy
lewej krawędzi. Zamiast obchodzić bramki wycofałem kod w całości: informacja należy do legendy,
nie do pola rysunku. Tak powstało V12K-223.</p>
</div>

<h2>Dwie diagnozy, które sam skorygowałem</h2>
<div class="karta">
<p><strong>Defekt własnej naprawy (V12K-222).</strong> Wskaźnik „ukryto N opisów” żył w przestrzeni
arkusza, więc przy skali, przy której ukrywa etykiety, <em>sam był nieczytelny</em>. Liczby
mówiły, że działa — obraz pokazał, że nie. Przeniesiony do warstwy ekranu z kompensacją skali.</p>
<p><strong>Fałszywy zarzut o NOP.</strong> Zapisałem, że „nikt nie emituje symbolu punktu
podziału”. Nieprawda — emisja istnieje w trzech miejscach i działa. Brakuje <em>danej</em>
<code>nop_station_ref</code> (0 z 13 biegów). Złapałem to w tej samej turze, przed wdrożeniem
czegokolwiek.</p>
</div>

<h2>Rozstrzygnięcie: otwarty łącznik ≠ punkt normalnie otwarty</h2>
<div class="karta">
<div class="tab"><table>
<thead><tr><th>Reprezentacja</th><th>Znaczenie</th></tr></thead>
<tbody>
<tr><td><code>branch.status = 'open'</code></td><td><strong>stan</strong> — łącznik jest w tej
chwili otwarty (prace, awaria, przełączenie ruchowe)</td></tr>
<tr><td><code>LineRun.nop_station_ref</code></td><td><strong>intencja projektowa</strong> — tu
sieć pierścieniowa jest dzielona w ruchu normalnym</td></tr>
</tbody></table></div>
<p>Automatyczne wnioskowanie „otwarty ⇒ NOP” byłoby heurystyką — zakazaną przez kanon
i merytorycznie fałszywą: łącznik otwarty na czas prac nie jest projektowanym punktem podziału,
a NOP zamknięty na czas rezerwowania nie przestaje nim być.</p>
</div>

<h2>Kryterium bezpieczeństwa, które nigdy nie odpaliło</h2>
<div class="karta">
<p><strong>Wytrzymałość zwarciowa żyły (IEC 60949) była zakodowana w doborze kabla i nigdy nie
odpalała.</strong> Ścieżka doboru nie przepisywała z katalogu danych cieplnych, więc wszystkie
63 typy przychodziły bez nich. Kandydat przechodził dobór na dwóch kryteriach — obciążalności
i spadku napięcia — a gotowy komunikat odrzucenia „wytrzymałość zwarciowa niewystarczająca” był
martwym kodem.</p>
<p class="cichy">Skutek inżynierski: kabel poprawny prądowo i napięciowo mógł zostać zniszczony
pierwszym zwarciem, a dobór tego nie sprawdzał.</p>
<div class="tab"><table>
<thead><tr><th>Pomiar</th><th>Przed</th><th>Po</th></tr></thead>
<tbody>
<tr><td>Kandydaci kablowi z werdyktem PASS/FAIL</td><td class="num">0 / 63</td>
<td class="num"><span class="lep">63 / 63</span></td></tr>
<tr><td>— na danych katalogowych producenta</td><td class="num">0</td><td class="num">54</td></tr>
<tr><td>— na k wyprowadzonym ze wzoru normy</td><td class="num">0</td><td class="num">9</td></tr>
</tbody></table></div>
</div>

<h2>Gdzie leży granica między derywacją a zgadywaniem</h2>
<p>Osiem <strong>produkcyjnych</strong> typów (YHAKXS, YHKXS) nie podaje współczynnika k.
Moduł ma w opisie zakaz: „nie podstawiamy wartości typowej z tablic normy”. Granicę trzeba było
nazwać precyzyjnie, bo od niej zależy, czy wolno cokolwiek policzyć:</p>
<div class="tab"><table>
<thead><tr><th></th><th>Sytuacja</th><th>Werdykt</th></tr></thead>
<tbody>
<tr><td><strong>Zakazane</strong></td><td>kabel nie podaje materiału → przyjmij aluminium → k = 94</td>
<td>zgadywanie</td></tr>
<tr><td><strong>Dozwolone</strong></td><td>kabel <em>deklaruje</em> AL, XLPE, 250 °C → wzór
IEC 60949 ze stałymi tablicowymi <em>dla zadeklarowanego</em> materiału</td>
<td>derywacja</td></tr>
</tbody></table></div>
<p>Stałe Q<sub>c</sub>, β, ρ₂₀ są własnością <em>nazwanego</em> materiału — dokładnie tak jak
ρ<sub>Cu</sub> przy liczeniu rezystancji żyły miedzianej. Dane katalogowe mają bezwarunkowe
pierwszeństwo, także gdy wzór dałby wartość korzystniejszą: karta producenta może uwzględniać
osprzęt i warunki ułożenia, których rachunek adiabatyczny nie widzi.</p>

<div class="karta">
<p><strong>Kontrola, która przekonała mnie, że wzór jest normowy, a nie wymyślony.</strong>
Ten sam katalog podaje k wprost dla bliźniaczych typów — więc wzór musiał je odtworzyć:</p>
<div class="tab"><table>
<thead><tr><th>Materiał (XLPE 90→250 °C)</th><th>wzór IEC 60949</th><th>katalog wprost</th><th>błąd</th></tr></thead>
<tbody>
<tr><td>Aluminium</td><td class="num">94,553</td><td class="num">94</td><td class="num">+0,59 %</td></tr>
<tr><td>Miedź</td><td class="num">142,874</td><td class="num">143</td><td class="num">−0,09 %</td></tr>
</tbody></table></div>
<p class="cichy">Wyniku <strong>nie</strong> zaokrągliłem do tablicowych 94 — byłaby to niejawna
korekta. Zamiast tego źródło k jest nazwane w wyniku, w dowodzie i w UI, więc przy wykorzystaniu
blisko 100 % projektant widzi, że dla tej pozycji trzeba zdobyć kartę producenta.</p>
</div>

<h2>Jedna nitka: „brak danej nie może stać się zerem”</h2>
<p>Pociągnąłem tę regułę przez cały system i znalazłem cztery kolejne miejsca, gdzie brak
wiedzy udawał wiedzę. Wszystkie z jednego wzorca: zgadnięta nazwa pola, rzutowanie wyłączające
kontrolę typów, domyślne zero.</p>
<div class="tab"><table>
<thead><tr><th>Rejestr</th><th>Gdzie</th><th>Co brak udawał</th><th>Skutek dla projektanta</th></tr></thead>
<tbody>
<tr><td>V12K-226</td><td>ocena DER w warsztacie</td>
<td>import stacji <strong>zawsze zerowy</strong> — dwie zgadnięte nazwy pól
(<code>station_ref</code>, <code>nominal_power_kw</code>), których odbiór nie ma</td>
<td>„Krytyczny eksport — WYMAGANE studium NC RfG ramp-down” na <strong>każdej</strong>
stacji z DER, niezależnie od odbiorów</td></tr>
<tr><td>V12K-226</td><td>oś SC1F/SC2FG</td><td>stan „częściowo” z <strong>pustą</strong>
listą powodów</td><td>„niegotowe” bez żadnej akcji naprawczej — ślepy zaułek</td></tr>
<tr><td>V12K-227</td><td>magistrala SN</td><td>odcinek bez policzonego ΔU wnosił zero
do sumy</td><td>zaniżony spadek <strong>wyciszał</strong> ostrzeżenie o limicie 5 % —
milczący PASS na kryterium doboru przekroju</td></tr>
<tr><td>V12K-228</td><td>import CGMES</td><td>brak profilu stanu ustalonego → każdy
odbiór 0 MW</td><td>sieć wyglądała na nieobciążoną; fałszywe zero na <em>wejściu</em>
rozchodzi się na każdą późniejszą analizę</td></tr>
</tbody></table></div>

<div class="karta">
<p><strong>Własny błąd fizyczny, złapany własnym testem.</strong> Dodając brakujący powód dla osi
niesymetrycznych, przypisałem go wszystkim poza SC3F — czyli także zwarciu <em>dwufazowemu bez
ziemi</em>. A ono rozkłada się na składową zgodną i przeciwną, nie ma drogi powrotnej przez ziemię
i danych Z₀ nie potrzebuje. Kod miał tę fizykę poprawnie od początku; naprawiając brak powodu,
wprowadziłem fałszywy brak. Kontrola odwrotna jest teraz wyprowadzona z fizyki, nie z kodu.</p>
</div>

<h2>Zamiast łatać dalej — zamknąłem wejście</h2>
<div class="karta">
<p>Wszystkie te defekty przeszły przez rzutowania <code>as</code>, które wyłączają kontrolę typów.
Zmierzyłem, dlaczego kod ich potrzebował: <strong>lustro kontraktu TypeScript rozjechało się
z modelem</strong>. Po rozszerzeniu pomiaru na całą powierzchnię: <strong>69 encji, 10
rozjechanych, 27 pól bez odpowiednika</strong> — w tym pięć hashy tożsamości w nagłówku
(rozstrzygają, czy wynik jest <em>aktualny</em> wobec modelu), kolekcje baterii kondensatorów
i węzłów przyłączenia, progi zabezpieczenia kierunkowego i częstotliwościowych, moc zwarciowa
strony 110 kV, pola regulacji OLTC. Unia izolacji pomijała EPR, którego katalog ma 18 rekordów.</p>
<p>Doprowadziłem lustro do parzystości, usunąłem rzutowanie i napisałem <strong>guard, który tej
parzystości pilnuje</strong> — wpięty do CI, bo skrypt poza CI nigdy się nie wykonuje.</p>
<p class="cichy"><strong>Uczciwe rozgraniczenie:</strong> przy 27 polach naprawiam samo lustro, nie
ratuję działającego defektu — zmierzyłem, że nie mają dzisiaj czytników albo są czytane na innych
typach. Wartość jest prewencyjna, ale nie spekulacyjna: niekompletne lustro jest defektem lustra
niezależnie od dzisiejszych czytników, a mam twardy dowód, że luka wymusza rzutowanie.</p>
</div>

<h2>Szósty raz ten sam wzorzec — i tym razem tłumaczy poprzednie</h2>
<div class="karta">
<p>Ocena gotowości analiz na poziomie <strong>modelu</strong> ma backend, endpoint, store i panel —
z testami. Zmierzyłem, ile razy jest montowana w produkcji: <strong>zero</strong>. Metoda
<code>load()</code> nigdy się nie wykonywała, więc macierz nigdy nie trafiała na żaden ekran.</p>
<p>To wyjaśnia defekt, którego wcześniej nie umiałem uzasadnić: oś nazwana „SC1F” w macierzy
wytwórców świeciła <em>gotowa</em> na podstawie samych danych o urządzeniu, podczas gdy bramka
modelu bieg odrzucała. Rozjazd nie miał z czym się zderzyć, bo autorytatywna ocena była
niewidoczna. Pogłębiła go moja własna zmiana z tej nocy — podniesienie braku modelu uziemienia
z INFO do blokera było fizycznie słuszne, ale macierz wytwórców o tym nie wiedziała.</p>
</div>

<h2>Złożenie, nie podmiana</h2>
<p>Kusiło, żeby macierz wytwórców po prostu zastąpić oceną backendu. To byłby błąd — te oceny
odpowiadają na <strong>różne pytania</strong>:</p>
<div class="tab"><table>
<thead><tr><th>Ocena</th><th>Pytanie</th></tr></thead>
<tbody>
<tr><td>macierz wytwórcy</td><td>czy <em>ten</em> wytwórca ma dane potrzebne do analizy
(katalog urządzenia, punkt przyłączenia, model zwarciowy)</td></tr>
<tr><td>bramka modelu</td><td>czy analiza da się policzyć na <em>całej sieci</em> — np. zwarcie
doziemne wymaga składowej zerowej gałęzi <strong>oraz</strong> modelu uziemienia punktu
neutralnego</td></tr>
</tbody></table></div>
<p>Więc biorę gorszą z dwóch i doklejam powód z przedrostkiem <strong>„Model:”</strong>, bo naprawa
jest wtedy na modelu, nie na tym wytwórcy — i akcja naprawcza prowadzi do gotowości inżynierskiej,
nie do zakładki wytwórcy. Mapuję <strong>tylko trzy dokładne odpowiedniki</strong>; osiom bez
odpowiednika (zwarcie dwufazowe z ziemią, spadek napięcia, zabezpieczenia, FRT, raporty) nie
dopisuję mapowania „po podobieństwie”, bo to byłoby zgadywanie, nie składanie faktów.</p>

<h2>Reguła normowa stała na atrapie katalogu</h2>
<div class="karta">
<p>Front miał <strong>dwa</strong> katalogi przekładników prądowych z <strong>zerowym pokryciem
identyfikatorów</strong>: prawdziwy z backendu (12 typów producenckich — ABB, Siemens, Arteche,
Schneider), z którego kreator pomiaru dodaje przekładnik do modelu, i lokalny pięciowpisowy,
na którym stała reguła klasy zabezpieczeniowej IEC 61869-2 oraz warunek różnicowy 87T.</p>
<div class="tab"><table>
<thead><tr><th>Przekładnik</th><th>Klasa</th><th>Oś zabezpieczeń</th><th>Powody</th></tr></thead>
<tbody>
<tr><td><code>ct_200_5_5p10_10va_abb</code> (realny)</td><td>5P10 — poprawna zabezpieczeniowo</td>
<td><strong>częściowo</strong></td><td class="num">0 — pusta lista</td></tr>
<tr><td><code>ct_200_5_5p20</code> (syntetyczny)</td><td>5P20</td><td>gotowa</td><td class="num">—</td></tr>
</tbody></table></div>
<p>Projektant wybierający przekładnik w prawdziwym kreatorze dostawał trwale „niegotowe"
<em>bez podania przyczyny</em>, a warunek 87T był dla realnych typów niespełnialny.</p>
</div>

<h2>Trzy stopnie tej naprawy</h2>
<div class="tab"><table>
<thead><tr><th>Krok</th><th>Co zrobiłem</th><th>Stan po</th></tr></thead>
<tbody>
<tr><td>klasa jako <strong>dana</strong></td><td>reguła czyta <code>ct_accuracy_class</code>
z rekordu, nie szuka w katalogu; rozdzieliłem „klasa nie jest zabezpieczeniowa" (werdykt)
od „klasy nie da się ustalić" (brak danej)</td><td>„niegotowe" przestało być milczące</td></tr>
<tr><td>wypełnienie danej</td><td>rozwiązanie klasy z <em>prawdziwego</em> katalogu; klasa spoza
kanonu daje <code>null</code>, nie najbliższe przybliżenie</td><td>oś <strong>gotowa</strong>
dla realnego 5P10</td></tr>
<tr><td>zastosowanie rdzenia</td><td>wyprowadzone definicyjnie wg IEC 61869-2: klasy z literą P
to rdzenie zabezpieczeniowe, 0,2/0,5/1,0 pomiarowe</td><td>przekładnik pomiarowy daje
<em>werdykt</em>, nie brak danej</td></tr>
</tbody></table></div>
<p class="cichy">Rdzenia <strong>podwójnego</strong> nie wyprowadzam z niczego — to cecha
konstrukcyjna (dwa niezależne rdzenie), nie wniosek z jednej klasy. Żaden katalog nie ma dziś
realnego typu dwurdzeniowego, więc warunek 87T pozostaje nierozstrzygalny i mówi to wprost.
To luka <em>danych producenta</em>, nie kodu — i nie wypełnię jej wymyślonym wpisem.</p>

<h2>Bramki sprawdzone, nie tylko uruchomione</h2>
<div class="karta">
<p>Żadnej bramki nie przyjąłem na zielonym wyniku. Dla guarda parzystości wstrzyknąłem regresję —
usunąłem pole z lustra — i sprawdziłem, że zgłasza encję, pole oraz skutek. Dla bramki białej listy
operacji domenowych usunąłem nazwę operacji przy zachowanym użyciu w UI: test wskazał plik, linię
i konsekwencję („martwa kontrolka”).</p>
<p class="cichy">Przy okazji: wpis rejestru notował dług „warunki przyłączenia są wyspą bez
konsumpcji” — nieprawda od czasu karty F-K2 (analiza, endpoint i UI istnieją). Nieaktualny dług
wprowadza w błąd tak samo jak brak wpisu, więc go skorygowałem.</p>
</div>

<h2>Ekran, na którym projektant wreszcie <em>wybiera</em></h2>
<figure><img src="ZRZUT_WIAZANIA" alt="Powierzchnia E-21: karta zakresu obliczeń z edytorem wiązań katalogowych" loading="lazy">
<figcaption><strong>Wytwórca PV, karta „Zakres obliczeń” (zrzut żywej aplikacji).</strong>
Nad kreską — werdykt każdej osi. Pod kreską — wiązania, których te osie dotyczą, z możliwością
zmiany na miejscu.</figcaption></figure>

<div class="karta">
<p><strong>Łańcuch był budowany od tyłu i nie miał początku.</strong> Backend przyjmował wiązania
kanoniczną operacją, odrzucał referencje spoza katalogu, katalog wyprowadzał rodzaj rdzenia
z klasy wg IEC&nbsp;61869-2, reguła gotowości czytała wynik i nazywała braki — a ekran pokazywał
to wszystko <em>wyłącznie do odczytu</em>. Pomiar: <strong>zero kontrolek wyboru</strong>.
Projektant widział „wybierz wariant katalogowy” i nie miał gdzie wybrać.</p>
<p>Zakres edytora jest świadomie ograniczony do trzech wiązań, dla których backend <em>ma</em>
katalog. Dane prądu zwarciowego i model dynamiczny nie dostają pickera — lista, której backend
nie zna, byłaby fabrykacją, a zapis i tak zostałby odrzucony. Brak jest <strong>nazwany</strong>
razem z powodem, zamiast udawany atrapą.</p>
</div>

<figure><img src="ZRZUT_PICKER" alt="Wybór przekładnika napięciowego z katalogu backendu" loading="lazy">
<figcaption><strong>Wybór z realnego katalogu.</strong> Ten sam picker, którego używają pozostałe
ekrany — nie druga implementacja. Nazwa, producent i parametry pochodzą z backendu.</figcaption></figure>

<h2>Przekładnik przestał być nazwą, stał się doborem</h2>

<div class="karta">
<p><strong>Zarzut z odbioru brzmiał wprost:</strong> „bez sprawdzenia przekładni wobec prądu
chronionego toru, obciążalności cieplnej i dynamicznej, nasycenia oraz zgodności z wejściem
przekaźnika jego wybór nie ma wiarygodności inżynierskiej". Ekran pokazywał
<em>CT&nbsp;200/5&nbsp;A kl.&nbsp;5P10 10&nbsp;VA</em> — i nic więcej. Nazwa katalogowa nie jest
dowodem doboru.</p>
<p><strong>Teraz każde kryterium ma podstawę normową i jawny rachunek:</strong> co wymaga tor
obok tego, co daje typ. Przekładnia wobec prądu roboczego, rodzaj rdzenia, zapas do nasycenia
(ALF), wytrzymałość cieplna I<sub>th</sub>&nbsp;≥&nbsp;I<sub>k</sub>″·√t<sub>k</sub>, wytrzymałość
dynamiczna, zgodność z wejściem przekaźnika, obciążalność obwodu wtórnego — a po stronie
napięciowej dodatkowo współczynnik napięciowy wobec sposobu uziemienia punktu neutralnego
i realizacja toru napięcia zerowego 3U0.</p>
<p><strong>Rozstrzygnięcie właściciela, które zmieniło zakres:</strong> pierwotnie proponowałem
część sprawdzeń <em>nazwać niewykonalnymi</em>, bo katalog nie niósł prądu cieplnego, dynamicznego
ani współczynnika bezpieczeństwa. Odpowiedź była jednoznaczna — „takie zachowanie jest
niedopuszczalne, rozbudować katalogi maksymalnie". Katalogi rozbudowano: przekładniki prądowe
o dane cieplne i dynamiczne, napięciowe z 9 do 13&nbsp;wpisów (w tym <strong>rodzina faza–ziemia
z uzwojeniem resztkowym</strong>, bez której tor 3U0 dla kryteriów kierunkowych 67N pozostawałby
na zawsze „nie do sprawdzenia"), katalog urządzeń o znamionowe wejścia pomiarowe.</p>
<p><strong>Granica między wyprowadzeniem a fabrykacją została w danych, jawnie.</strong> Wartość
normowa (I<sub>dyn</sub>&nbsp;=&nbsp;2,5·I<sub>th</sub>, rodzaj rdzenia z klasy) to wyprowadzenie.
Wartość odniesienia (szereg IEC&nbsp;62271-200, współczynnik 1,9&nbsp;przez&nbsp;8&nbsp;h wg
IEC&nbsp;61869-3, wejścia wg IEC&nbsp;60255-1) niesie prowieniencję i wymóg potwierdzenia kartą
producenta — i ta prowieniencja jedzie z wartością aż do werdyktu na ekranie. Dana bez podstawy
(rezystancja uzwojenia) zostaje pusta, a kryterium liczy się z obciążalności znamionowej.</p>
<p><strong>Brak danej jest trzecim stanem.</strong> Zdanie „dobór potwierdzony" nie pada, dopóki
którekolwiek kryterium nie ma kompletu danych — nawet gdy żadne nie jest niespełnione. Prądy
zwarciowe pochodzą z <em>wiersza wyniku</em> przebiegu zwarciowego; brak zakończonego przebiegu
jest nazwany wprost, zamiast zamienić się w zgodność. Dziesięć bramek tej serii zweryfikowano
wstrzykniętą regresją: każda z dziesięciu psujących zmian dała czerwony test.</p>
</div>

<h2>Ten sam ekran na telefonie</h2>
<figure><img src="ZRZUT_MOBILNY" alt="Powierzchnia E-21 na ekranie telefonu 390 px" loading="lazy">
<figcaption><strong>390&nbsp;px, pełna szerokość.</strong> Etykieta nad wartością zamiast sztywnej
kolumny 170&nbsp;px, cele dotykowe 44&nbsp;px, kafle jeden pod drugim. Bramka mierzy
<em>geometrię wyrenderowanego ekranu</em> — brak przewijania w bok, wysokość celu dotykowego,
położenie wartości względem etykiety — a nie klasy CSS.</figcaption></figure>

<div class="karta">
<p><strong>Bramka, która nie gryzła — złapana przez wykonawcę na sobie samym.</strong> Pierwsza
wersja testu sprawdzała tylko „strona nie przewija się w bok". Usunięcie przewijania z paska
zakładek… nie spowodowało upadku testu: panel karty jest kontenerem przewijanym, więc pochłaniał
nadmiar, a dojście do ostatniej zakładki przesuwało całą kartę w bok przy „czystej" stronie.
Test został wzmocniony o pomiar zachowania (pasek szerszy od okna MUSI dać się przewinąć sam)
i dopiero wtedy ta sama injekcja dała czerwone.</p>
</div>

<h2>Zrzut żywego ekranu pokazał cztery rzeczy, których testy nie widziały</h2>
<div class="karta otwarta">
<ul>
<li><strong>Pętla diagnoza → naprawa → ocena była przerwana.</strong> Karta czytała pole
<code>readiness</code> <em>zapisane</em> na rekordzie, którego nikt nie przeliczał po zmianie
wiązań. Projektant wybierał przekładnik i widział dokładnie ten sam werdykt, co przed wyborem —
diagnoza i naprawa siedziały w jednej karcie i nie rozmawiały ze sobą. Teraz macierz liczy się
na żywo regułą kanoniczną: klasa 5P10 jest zabezpieczeniowa, więc oś przechodzi z „zakres do
przeliczenia” na „zakres kompletny” w tej samej chwili.</li>
<li><strong>Trzecia ocena tego samego wytwórcy.</strong> Rekord budowany ze snapshotu dostawał
gotowość z lokalnego, ręcznego duplikatu reguły — patrzył tylko na urządzenie katalogowe
i profile, więc ignorował klasę przekładnika, dane zwarciowe, model dynamiczny, punkt
przyłączenia i transformator blokowy. Duplikat usunięty.</li>
<li><strong>Materiał dowodowy nie pokazywał aplikacji.</strong> Harness zrzutów ładował wyłącznie
tokeny ui2, więc powierzchnia wychodziła surowym HTML-em — tekst szeryfowy, zero układu. Zrzut,
który nie pokazuje tego, co widzi projektant, nie jest dowodem.</li>
<li><strong>Wspólny picker: biały arkusz w ciemnym ekranie SCADA</strong> i polskie napisy bez
ogonków („Ladowanie typow…”, „Ponow”) — w każdym ekranie, który go używa. Przeniesiony na paletę
SCADA, napisy poprawione.</li>
</ul>
</div>

<div class="karta">
<p><strong>Jeden motyw, bo tak jest zmierzone.</strong> Powierzchnie <code>ui/**</code> stoją na
palecie <code>scada</code> — stałe wartości hex, bez wariantu jasnego i bez zmiennych CSS. Motyw
jasny obejmuje warstwę ui2. Ten ekran jest więc ciemny niezależnie od przełącznika, a test to
<em>sprawdza</em> (porównanie tła panelu w obu motywach) zamiast milcząco pomijać drugi zrzut.</p>
</div>

<h2>Otwarte <span class="stan otw">do karty</span></h2>
<div class="karta otwarta">
<ul>
<li><strong>F-K8 faza 2</strong> — krok 2 (ekran wyboru wiązań) zamknięty w V12K-242/243.
Zostaje relokacja samej oceny gotowości DER (533 linie) do backendu. Rozstrzygnięcie z fazy 1
obowiązuje: relokacja musi zachować oba poziomy oceny i ich złożenie, nie spłaszczać do
jednego.</li>
<li><strong>Przekładnik dwurdzeniowy</strong> — warunek 87T czeka na realny typ katalogowy
z dwoma rdzeniami oraz na współczynnik bezpieczeństwa Ksbn (IEC 61869). Dane producenta.</li>
<li><strong>NOP</strong> — wskazanie <code>nop_station_ref</code> wymaga wiedzy, która magistrala
jest pierścieniem i gdzie projektant ją dzieli. To dana projektowa, nie derywacja z topologii.</li>
<li><strong>Osiem typów kablowych</strong> — dane cieplne uzupełnione normowo; pełna weryfikacja
wymaga kart producentów.</li>
<li><strong>Tabelka rysunkowa</strong> — pominięta Twoją decyzją.</li>
</ul>
</div>

<h2>Weryfikacja</h2>
<p class="cichy">Każda scalona pozycja: regresja właściwej warstwy, kody wyjścia łapane
bezpośrednio. Pomiary tej doby: vitest 2335 (ui2), 1546 (warsztat), 3777 (SLD, 200 plików);
pytest 1239 (aplikacja), 957 (API + analizy), 613 (solwery + API), 397 (katalog + solwery);
<code>accept:sld-v3</code> 224 PASS / 0 FAIL; guard determinizmu SLD 0 naruszeń; guard parzystości
69/69 encji; guard determinizmu materiału audytowego — dwie regeneracje sześciu zrzutów
bez zmiany <em>ani jednego bajtu</em>; type-check, lint, guardy architektury, katalogu, UI
i dokumentacji zielone. Trzydzieści jeden commitów, każdy wypchnięty od razu po weryfikacji —
kontener cofnął migawkę osiem razy, ostatni raz o 10:40, i tylko dlatego nic nie przepadło.</p>
<p class="cichy">Bramki sprawdzane wstrzykniętą regresją, nie zielonym wynikiem — dla niezmiennika
motywu nadpisałem jeden zrzut bajtami drugiego i potwierdziłem, że test pada z komunikatem
wskazującym oba możliwe powody rozbieżności.</p>
</section>
</div>
"""


if __name__ == "__main__":
    raise SystemExit(main())
