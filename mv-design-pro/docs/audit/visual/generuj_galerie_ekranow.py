"""Galeria WSZYSTKICH ekranow do oceny wlasciciela (dyrektywa 8).

DLACZEGO OBOK `generuj_strone_oceny.py`. Tamta strona jest NARRACJA jednej serii: prowadzi
przez znaleziska i rozstrzygniecia, wiec osadza szesc kadrow dobranych do tekstu. Ta jest
INWENTARZEM: pokazuje kazdy ekran, ktory da sie dzisiaj wyrenderowac z zywej aplikacji,
w obu motywach, z podpisem mowiacym CZEGO NA NIM SZUKAC. Dwa rozne zadania, dwa pliki —
sklejenie ich zmusiloby jedno z nich do klamstwa (albo narracja gubi ekrany, albo
inwentarz gubi powody).

ZRZUTY POCHODZA Z BRAMKI, NIE Z REKI. Material buduje `e2e/creator-screenshot.spec.ts`
(19 testow Playwright) na zywym harnessie `creator-harness.html`; ten skrypt tylko sklada
z niego strone. Dzieki temu kazdy kadr jest renderem REALNYCH komponentow, a nie makieta,
i kazdy powstal przy zielonych asercjach tresci (bez nich zrzut moglby pokazywac ekran
w stanie bledu i nikt by tego nie zauwazyl).

Uzycie:
  python3 mv-design-pro/docs/audit/visual/generuj_galerie_ekranow.py [wyjscie.html]

Obrazy sa osadzane jako data URI (JPEG), zeby strona byla samowystarczalna — polityka
artefaktow zabrania zadan do zewnetrznych hostow.
"""

from __future__ import annotations

import base64
import pathlib
import subprocess
import sys
import tempfile

KATALOG = pathlib.Path(__file__).resolve().parent
WYJSCIE = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else KATALOG / "galeria_ekranow.html"

#: Szerokosc, do ktorej zrzuty sa zmniejszane przed osadzeniem. 1280 px starcza, zeby
#: czytac etykiety pol i wiersze macierzy; wyzej strona rosnie bez zysku dla oceny.
SZEROKOSC_MAX = 1280
JAKOSC = 72


def _data_uri(nazwa: str) -> str:
    """Zrzut jako data URI (JPEG). Brak pliku PRZERYWA generowanie.

    Cichy pominiecie brakujacego kadru dawaloby strone, ktora wyglada na kompletna,
    a nie jest — dokladnie ten blad zamykal wczesniejsza runde ocen.
    """
    png = KATALOG / nazwa
    if not png.exists():
        raise SystemExit(f"brak zrzutu: {png}")
    jpg = pathlib.Path(tempfile.gettempdir()) / f"galeria_{png.stem}.jpg"
    kod = (
        "from PIL import Image;"
        f"i=Image.open(r'{png}').convert('RGB');"
        f"w={SZEROKOSC_MAX};"
        "i=i.resize((w,round(i.height*w/i.width)),Image.LANCZOS) if i.width>w else i;"
        f"i.save(r'{jpg}',quality={JAKOSC},optimize=True)"
    )
    subprocess.run([sys.executable, "-c", kod], check=False, capture_output=True)
    plik = jpg if jpg.exists() else png
    mime = "image/jpeg" if plik.suffix == ".jpg" else "image/png"
    return f"data:{mime};base64," + base64.b64encode(plik.read_bytes()).decode("ascii")


class Ekran:
    """Jeden kadr do oceny: plik, tytul, czego na nim szukac."""

    def __init__(self, plik: str, tytul: str, szukaj: str, motyw: str | None = None) -> None:
        self.plik = plik
        self.tytul = tytul
        self.szukaj = szukaj
        self.motyw = motyw


class Grupa:
    def __init__(self, kotwica: str, tytul: str, wstep: str, ekrany: list[Ekran]) -> None:
        self.kotwica = kotwica
        self.tytul = tytul
        self.wstep = wstep
        self.ekrany = ekrany


def para(nazwa: str, tytul: str, szukaj: str) -> list[Ekran]:
    """Ten sam ekran w obu motywach — niezmienniczosc tresci widac tylko w parze."""
    return [
        Ekran(f"kreatory/{nazwa}_light.png", tytul, szukaj, "motyw jasny"),
        Ekran(f"kreatory/{nazwa}_dark.png", tytul, szukaj, "motyw ciemny"),
    ]


GRUPY: list[Grupa] = [
    Grupa(
        "wytworca",
        "E-21 · Konfigurator falownika PV — ekran po przebudowie",
        "Ekran, ktorego dotyczyly uwagi krytyczne z odbioru. Kazda z dwunastu uwag miala "
        "zamknac sie widoczna zmiana, wiec tu patrzy sie na cztery rzeczy naraz: czy "
        "tozsamosc mocy jest jawna, czy macierz analiz odpowiada na pytanie projektanta, "
        "czy przekladnik ma RACHUNEK zamiast nazwy katalogowej i czy braki sa nazwane.",
        [
            Ekran(
                "kreatory/wiazania_oze.png",
                "Karta „Zakres obliczeń” — cała wysokość ekranu",
                "Od góry: zdanie o stanie konfiguracji (liczba osi z kompletem danych, nie "
                "słowo „kompletna”), macierz czternastu analiz z powodem, stanem wyniku i "
                "działaniem w każdym wierszu, edytor wiązań katalogowych, sekcja doboru "
                "przekładników z rachunkiem „wymagane vs dostępne”, na końcu funkcje "
                "zabezpieczeniowe wyprowadzone z faktów o polu.",
            ),
            Ekran(
                "kreatory/wiazania_oze_picker.png",
                "Wybór typu z katalogu backendu",
                "Ten sam picker, którego używają pozostałe ekrany — nie druga "
                "implementacja. Nazwy, producenci i parametry pochodzą z katalogu, więc "
                "zapisany identyfikator jest referencją, którą backend rozumie.",
            ),
            Ekran(
                "kreatory/wiazania_oze_mobile.png",
                "Telefon, 390 px",
                "Etykieta nad wartością zamiast sztywnej kolumny 170 px, cele dotykowe "
                "44 px, kafle jeden pod drugim, pasek zakładek przewijany sam — bez "
                "przewijania strony w bok.",
            ),
            Ekran(
                "kreatory/wiazania_oze_tablet.png",
                "Tablet, 768 px",
                "Ten sam układ w punkcie przełamania: sprawdź, czy dwukolumnowe wiersze "
                "wracają dopiero wtedy, gdy jest na nie miejsce.",
            ),
        ],
    ),
    Grupa(
        "kreatory-sn",
        "Kreatory obiektów SN — wejście danych do modelu",
        "Kreatory sa jedyna droga, ktora dane wchodza do modelu sieci. Ocena dotyczy tego, "
        "czy krok mowi PO CO pyta o dana i skad ja wziac — oraz czy wybor idzie z katalogu, "
        "a nie z listy zapisanej w ekranie.",
        [
            *para(
                "kreator_pole",
                "Dodaj pole SN",
                "Wariant pola i szablon producenta; pola wyliczane muszą być oznaczone jako "
                "pochodne, nie do ręcznego nadpisania.",
            ),
            *para(
                "kreator_oze",
                "Źródło OZE — wejście w kreator",
                "Punkt startu: co kreator obiecuje ustawić i czego będzie wymagał.",
            ),
            *para(
                "kreator_oze_krok1",
                "Źródło OZE · krok 1 — rodzaj i moc",
                "Liczba jednostek obok mocy jednostki: bez niej „1 MW” i „8 MW” na jednym "
                "ekranie były sprzeczne.",
            ),
            *para(
                "kreator_oze_krok2",
                "Źródło OZE · krok 2 — wariant przyłączenia",
                "Czy wariant opisuje realną drogę do sieci (strona nN / transformator "
                "blokowy / pole SN), a nie samą stronę napięciową.",
            ),
            *para(
                "kreator_oze_krok3",
                "Źródło OZE · krok 3 — regulacja i charakterystyki",
                "Żywe charakterystyki Q(U), cosφ i P(f) rysowane z wartości rządzących — "
                "wykres ma potwierdzać nastawę, nie ozdabiać krok.",
            ),
            *para(
                "kreator_oze_krok4",
                "Źródło OZE · krok 4 — profil operatora",
                "Profil NC RfG bez preselekcji: dopóki projektant nie wybierze, „Dalej” "
                "musi być zablokowane, bo domyślny profil był fabrykacją.",
            ),
            *para(
                "kreator_transformator_regulacja",
                "Transformator · regulacja napięcia",
                "Panel teorii z wykresem AVR i zakresem zaczepów; sprawdź, czy pasmo "
                "regulacji zgadza się z opisem przełącznika.",
            ),
            *para(
                "kreator_magistrala_teoria",
                "Magistrala SN · parametry z katalogu kabli",
                "Asystent doboru przy prądzie roboczym większym od obciążalności — "
                "ostrzeżenie ma nazwać przekroczenie, nie tylko pokolorować pole.",
            ),
            *para(
                "kreator_kompensator_teoria",
                "Kompensator · Q ∝ U²",
                "Zależność mocy biernej od napięcia pokazana na wykresie razem ze "
                "wzorem — to jest uzasadnienie doboru, nie dekoracja.",
            ),
            *para(
                "kreator_odbior_teoria",
                "Odbiór · trójkąt mocy",
                "Rozkład P/Q/S dla podanego cosφ; wartość rządząca musi być widoczna "
                "obok wykresu.",
            ),
        ],
    ),
    Grupa(
        "analizy",
        "Analiza dostępna wprost z ekranu obiektu",
        "Wynik liczbowy zawsze pochodzi z solvera. Ekran ma pokazac, na czym stoi: "
        "dane wejsciowe, norme i przebieg, z ktorego wynik pochodzi.",
        [
            *para(
                "kreator_arcflash",
                "Arc Flash — energia łuku",
                "Odległość pracy, czas trwania łuku i konfiguracja elektrod jako DANE "
                "PROJEKTOWE; wynik ma być podpisany przebiegiem zwarciowym, z którego "
                "pochodzi prąd.",
            ),
        ],
    ),
    Grupa(
        "sld",
        "Schemat jednoliniowy — trzy poziomy szczegółu",
        "Rysunek na sieci wzorcowej (52 stacje). Pary jasna i ciemna sa tu BAJTOWO "
        "IDENTYCZNE i tak ma byc: powierzchnia schematu stoi na stalej palecie SCADA, "
        "zeby kolor niosl znaczenie elektryczne (poziom napiecia, stan lacznika), a nie "
        "preferencje motywu. Dlatego kazdy poziom pokazany jest raz.",
        [
            Ekran(
                "sld_audyt/sld_L0_dark.png",
                "L0 — struktura sieci",
                "Magistrale, GPZ i stacje bez detalu pól: ten poziom służy orientacji.",
                "paleta SCADA, wspólna dla obu motywów",
            ),
            Ekran(
                "sld_audyt/sld_L1_dark.png",
                "L1 — stacje z tabliczkami",
                "Nazwa, moc i rola stacji; sprawdź spójność zapisu napięć między "
                "tabliczkami.",
                "paleta SCADA, wspólna dla obu motywów",
            ),
            Ekran(
                "sld_audyt/sld_L2_dark.png",
                "L2 — kadr całej sieci",
                "Ten kadr pokazuje STRUKTURĘ. Przy skali kamery obejmującej 52 stacje "
                "declutter ukrywa 1135 opisów, a aparaty pól leżą poniżej piksela — dlatego "
                "poziom detalu ocenia się na kadrach szczegółu poniżej, nie tutaj.",
                "paleta SCADA, wspólna dla obu motywów",
            ),
            Ekran(
                "sld_audyt/sld_szczegol_gpz.png",
                "Szczegół 1:1 — rozdzielnia GPZ 110/15 kV",
                "Opis źródła czyta się w całości (Sk″, Ik″, napięcie). Kadr jest wycinkiem "
                "1:1 po realnym geście kamery, nie przeskalowanym zrzutem.",
            ),
            Ekran(
                "sld_audyt/sld_szczegol_stacja.png",
                "Szczegół 1:1 — stacja na magistrali z polami",
                "Pola z aparatami Q1/QE1 i transformatorem, kierunki nad szyną, tabliczka "
                "stacji. Dopiero na tej skali declutter przestaje ukrywać opisy.",
            ),
        ],
    ),
]

POKRYCIE = [
    ("Konfigurator wytwórcy E-21 (desktop, telefon, tablet, picker)", "4", "tak"),
    ("Kreatory obiektów SN (pole, OZE 1–4, transformator, magistrala, kompensator, odbiór)", "20", "tak"),
    ("Arc Flash z ekranu obiektu", "2", "tak"),
    ("Schemat jednoliniowy L0/L1/L2 + dwa kadry szczegółu", "5", "tak — 8 plików, pary motywów identyczne"),
    ("Wyniki, Zabezpieczenia, Dokumentacja, pulpit projektu", "0", "nie — patrz nota niżej"),
]


def figura(e: Ekran) -> str:
    motyw = f'<span class="motyw">{e.motyw}</span>' if e.motyw else ""
    return (
        '<figure class="kadr">'
        f'<img src="{_data_uri(e.plik)}" alt="{e.tytul} — zrzut żywej aplikacji" loading="lazy">'
        f"<figcaption><strong>{e.tytul}</strong>{motyw}"
        f'<span class="szukaj">{e.szukaj}</span>'
        f'<code class="plik">{e.plik}</code></figcaption></figure>'
    )


def sekcja(g: Grupa) -> str:
    kadry = "\n".join(figura(e) for e in g.ekrany)
    return (
        f'<section id="{g.kotwica}">'
        f"<h2>{g.tytul}</h2>"
        f"<p>{g.wstep}</p>"
        f'<div class="siatka">{kadry}</div>'
        "</section>"
    )


def zbuduj() -> str:
    nawigacja = " ".join(
        f'<a href="#{g.kotwica}">{g.tytul.split(" — ")[0].split(" · ")[0]}</a>' for g in GRUPY
    )
    wiersze = "\n".join(
        f'<tr><td>{obszar}</td><td class="num">{ile}</td><td>{zywy}</td></tr>'
        for obszar, ile, zywy in POKRYCIE
    )
    sekcje = "\n".join(sekcja(g) for g in GRUPY)
    return f"""<title>MV-DESIGN-PRO · ekrany do oceny</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
:root{{--tlo:#f7f6f2;--karta:#fff;--tekst:#191814;--cichy:#5d594f;--linia:#dbd6c9;
--akcent:#2e5f7a;--akcent-tlo:#e6eef3;--ok:#2f6b3f;--brak:#8c2f2f;--uwaga:#8a5a12}}
@media(prefers-color-scheme:dark){{:root{{--tlo:#121310;--karta:#1c1e19;--tekst:#e9e6dc;
--cichy:#9f9a8c;--linia:#31342c;--akcent:#7fb6d4;--akcent-tlo:#1b262d;--ok:#7fb98c;
--brak:#e39a94;--uwaga:#d9ae5f}}}}
:root[data-theme=dark]{{--tlo:#121310;--karta:#1c1e19;--tekst:#e9e6dc;--cichy:#9f9a8c;
--linia:#31342c;--akcent:#7fb6d4;--akcent-tlo:#1b262d;--ok:#7fb98c;--brak:#e39a94;
--uwaga:#d9ae5f}}
:root[data-theme=light]{{--tlo:#f7f6f2;--karta:#fff;--tekst:#191814;--cichy:#5d594f;
--linia:#dbd6c9;--akcent:#2e5f7a;--akcent-tlo:#e6eef3;--ok:#2f6b3f;--brak:#8c2f2f;
--uwaga:#8a5a12}}
*{{box-sizing:border-box}}
body{{margin:0;background:var(--tlo);color:var(--tekst);font:16px/1.62 ui-serif,Georgia,serif}}
.owijka{{max-width:1240px;margin:0 auto;padding:44px 24px 96px}}
header{{border-bottom:2px solid var(--akcent);padding-bottom:22px;margin-bottom:26px}}
.nadtytul{{font:600 12px/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:.14em;
text-transform:uppercase;color:var(--akcent);margin-bottom:10px}}
h1{{font-size:32px;line-height:1.15;margin:0 0 10px;text-wrap:balance;font-weight:600}}
h2{{font-size:22px;margin:0 0 8px;text-wrap:balance;font-weight:600}}
p{{margin:0 0 14px;max-width:72ch}}
.cichy{{color:var(--cichy);font-size:14px}}
nav{{position:sticky;top:0;z-index:2;background:var(--tlo);border-bottom:1px solid var(--linia);
padding:10px 0;margin-bottom:26px;display:flex;flex-wrap:wrap;gap:8px 18px;
font:600 12px/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase}}
nav a{{color:var(--akcent);text-decoration:none;border-bottom:1px solid transparent;padding-bottom:2px}}
nav a:hover,nav a:focus-visible{{border-bottom-color:var(--akcent)}}
section{{padding-top:26px;margin-top:34px;border-top:1px solid var(--linia)}}
.siatka{{display:grid;grid-template-columns:1fr;gap:26px;margin-top:18px}}
@media(min-width:900px){{.siatka{{grid-template-columns:1fr 1fr}}}}
.kadr{{margin:0;background:var(--karta);border:1px solid var(--linia);border-radius:3px;
overflow:hidden;display:flex;flex-direction:column}}
.kadr img{{width:100%;height:auto;display:block;border-bottom:1px solid var(--linia)}}
figcaption{{font:13px/1.5 ui-sans-serif,system-ui,sans-serif;color:var(--cichy);
padding:12px 14px 14px;display:flex;flex-direction:column;gap:6px}}
figcaption strong{{color:var(--tekst);font-size:14px}}
.motyw{{font:600 10px/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:.1em;
text-transform:uppercase;color:var(--akcent);background:var(--akcent-tlo);
padding:4px 7px;border-radius:2px;align-self:flex-start}}
.szukaj{{color:var(--cichy)}}
.plik{{font:11px/1.4 ui-monospace,Menlo,monospace;color:var(--cichy);opacity:.75;
background:none;padding:0;word-break:break-all}}
.karta{{background:var(--karta);border:1px solid var(--linia);border-left:3px solid var(--ok);
border-radius:3px;padding:16px 20px;margin:20px 0}}
.karta.otwarta{{border-left-color:var(--uwaga)}}
.tab{{overflow-x:auto;margin:18px 0}}
table{{border-collapse:collapse;width:100%;font-size:14px}}
th,td{{text-align:left;padding:8px 12px;border-bottom:1px solid var(--linia);vertical-align:top}}
th{{font:600 12px/1.3 ui-sans-serif,system-ui,sans-serif;letter-spacing:.06em;
text-transform:uppercase;color:var(--cichy)}}
td.num{{font-family:ui-monospace,Menlo,monospace;font-variant-numeric:tabular-nums;text-align:right}}
ul{{margin:0 0 14px;padding-left:22px;max-width:72ch}}li{{margin-bottom:7px}}
code{{font:.9em ui-monospace,Menlo,monospace;background:var(--akcent-tlo);padding:1px 4px;
border-radius:2px}}
a{{color:var(--akcent)}}
</style>
<div class="owijka">
<header>
<div class="nadtytul">Inwentarz ekranów · zrzuty żywej aplikacji · 2026-07-28</div>
<h1>Wszystkie ekrany, które dziś renderuje żywa aplikacja</h1>
<p class="cichy">31 kadrów (34 pliki — trzy pary motywów schematu są identyczne) z bramki
Playwright na harnessie realnych komponentów · oba motywy ·
gałąź <code>claude/power-network-design-ui-ir91mv</code></p>
</header>

<nav>{nawigacja}</nav>

<p><strong>Jak to czytać.</strong> Każdy kadr powstał z REALNEGO komponentu w przeglądarce, nie
z makiety, i tylko wtedy, gdy asercje treści przeszły na zielono — bez nich zrzut mógłby
pokazywać ekran w stanie błędu i wyglądałby równie porządnie. Pod każdym kadrem jest jedno
zdanie o tym, <em>czego na nim szukać</em>: to jest miejsce na uwagi z oględzin.</p>

<div class="tab"><table>
<thead><tr><th>Obszar</th><th>Kadrów</th><th>Render z żywej aplikacji</th></tr></thead>
<tbody>{wiersze}</tbody>
</table></div>

<div class="karta otwarta">
<p><strong>Czego tu NIE MA i dlaczego to mówię wprost.</strong> Bramka zrzutów obejmuje dziś
konfigurator wytwórcy, kreatory obiektów, Arc Flash i schemat jednoliniowy. Powierzchnie
Wyniki, Zabezpieczenia, Dokumentacja i pulpit projektu mają w repozytorium wyłącznie
<strong>starsze</strong> zrzuty z lipcowych rund — nie są odtwarzane przez tę bramkę, więc
nie wstawiam ich tutaj jako obrazu stanu na dziś. Pokazanie kadru z 10 lipca jako
„aktualnego ekranu” byłoby dokładnie tym, czego ta strona ma nie robić.</p>
<p class="cichy">To jest nazwany brak pokrycia, nie brak ekranów: te powierzchnie istnieją
i mają testy jednostkowe. Brakuje im scen w harnessie zrzutów — i to jest następna karta
w tym wątku.</p>
</div>

{sekcje}

<section id="stan">
<h2>Stan techniczny materiału</h2>
<ul>
<li>Zrzuty: <code>e2e/creator-screenshot.spec.ts</code>, 19 testów Playwright, wszystkie zielone.</li>
<li>Strona odtwarzalna jedną komendą z repozytorium
(<code>docs/audit/visual/generuj_galerie_ekranow.py</code>) — po cofnięciu migawki kontenera
nie przepada.</li>
<li>Obrazy osadzone jako data URI: strona nie wysyła ani jednego żądania na zewnątrz.</li>
<li>Pary <code>*_light</code> i <code>*_dark</code> schematu są bajtowo identyczne
świadomie — powierzchnia SLD stoi na stałej palecie SCADA, żeby kolor niósł znaczenie
elektryczne, a nie preferencję motywu.</li>
</ul>
</section>
</div>
"""


if __name__ == "__main__":
    WYJSCIE.write_text(zbuduj(), encoding="utf-8")
    print(f"galeria: {WYJSCIE} ({WYJSCIE.stat().st_size // 1024} KiB)")
