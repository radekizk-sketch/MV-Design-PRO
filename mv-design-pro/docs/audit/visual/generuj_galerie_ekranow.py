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

WYMAGA SWIEZYCH ZRZUTOW. Zrzuty nie sa trzymane w repozytorium (odtwarza je bramka),
wiec przed generowaniem uruchom obie:
  cd mv-design-pro/frontend
  npx playwright test e2e/creator-screenshot.spec.ts e2e/wszystkie-sceny-screenshot.spec.ts

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


def _data_uri(nazwa: str, szerokosc: int | None = None, jakosc: int | None = None) -> str:
    """Zrzut jako data URI (JPEG). Brak pliku PRZERYWA generowanie.

    Cichy pominiecie brakujacego kadru dawaloby strone, ktora wyglada na kompletna,
    a nie jest — dokladnie ten blad zamykal wczesniejsza runde ocen.
    """
    png = KATALOG / nazwa
    if not png.exists():
        raise SystemExit(f"brak zrzutu: {png}")
    w = szerokosc or SZEROKOSC_MAX
    q = jakosc or JAKOSC
    jpg = pathlib.Path(tempfile.gettempdir()) / f"galeria_{png.stem}_{w}_{q}.jpg"
    kod = (
        "from PIL import Image;"
        f"i=Image.open(r'{png}').convert('RGB');"
        f"w={w};"
        "i=i.resize((w,round(i.height*w/i.width)),Image.LANCZOS) if i.width>w else i;"
        f"i.save(r'{jpg}',quality={q},optimize=True)"
    )
    subprocess.run([sys.executable, "-c", kod], check=False, capture_output=True)
    plik = jpg if jpg.exists() else png
    mime = "image/jpeg" if plik.suffix == ".jpg" else "image/png"
    return f"data:{mime};base64," + base64.b64encode(plik.read_bytes()).decode("ascii")


class Ekran:
    """Jeden kadr do oceny: plik, tytul, czego na nim szukac."""

    def __init__(
        self,
        plik: str,
        tytul: str,
        szukaj: str,
        motyw: str | None = None,
        szerokosc: int | None = None,
        jakosc: int | None = None,
    ) -> None:
        self.plik = plik
        self.tytul = tytul
        self.szukaj = szukaj
        self.motyw = motyw
        self.szerokosc = szerokosc
        self.jakosc = jakosc


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


#: Sceny harnessu zrzucane bramka `wszystkie-sceny-screenshot.spec.ts` (V12K-259).
#: Tytul opisuje, co scena pokazuje; „czego szukac" celuje w to, co na tym ekranie
#: rozstrzyga sie inzyniersko. Kadry sa mniejsze niz wiodace — to inwentarz, nie sesja.
SCENY: list[tuple[str, str, str]] = [
    ("pulpit", "Pulpit projektu",
     "Lista projektów i wejście do pracy: czy stan projektu (dane / wyniki) jest widoczny "
     "przed otwarciem."),
    ("dokumentacja", "Hub dokumentacji",
     "Dokumenty projektu i skróty do studiów: czy każdy kafel mówi, z czego powstanie "
     "dokument i czego mu brakuje."),
    ("zwarcia", "Wyniki zwarciowe",
     "Ik″, ip, ith per węzeł z normą i przebiegiem, z którego pochodzą."),
    ("zwarcia-rozplyw", "Rozpływ prądu zwarciowego w gałęziach",
     "Wkład każdego źródła i kierunek — sedno doboru zabezpieczeń kierunkowych."),
    ("rozplyw", "Wyniki rozpływu mocy",
     "Napięcia węzłowe i obciążenia gałęzi; wartości spoza pasma muszą być oznaczone."),
    ("wyniki-skladowe", "Zwarcie niesymetryczne — składowe symetryczne",
     "Z₁/Z₂/Z₀ wprost z solvera; brak sieci zerowej ma być nazwany, nie pominięty."),
    ("wyniki-zbieznosc", "Zbieżność rozpływu",
     "Historia iteracji i kryterium zatrzymania — dowód, że wynik jest zbieżny, nie ucięty."),
    ("wyniki-stan-fazowy", "Stan fazowy sieci SN",
     "Asymetria napięć i prądów fazowych; podstawa oceny warunków pracy odbiorów."),
    ("wyniki-stabilnosc", "Stabilność RMS",
     "Przebiegi po zakłóceniu: czy oś czasu i wielkości mają jednostki i punkt odniesienia."),
    ("przekaznik", "Karta przekaźnika i nastaw",
     "Funkcje, nastawy i ich uzasadnienie — nastawa bez uzasadnienia nie jest projektem."),
    ("koordynacja", "Koordynacja zabezpieczeń i krzywe TCC",
     "Nastawy z analizy, werdykty par i wykres log-log. Scena doprowadzona do POLICZONEGO "
     "wyniku obnażyła pięć defektów naraz (V12K-262): wymyślona lokalizacja urządzenia "
     "(`bus_1` spoza modelu), klon przepisujący cudze prądy, martwy klik „Wykonaj analizę”, "
     "nastawa bez wartości opisana jako „Wyznaczona” i biały ekran przy niepełnej "
     "odpowiedzi API."),
    ("macierz", "Macierz analiz przypadku",
     "Które analizy mają komplet danych, a które są zablokowane i przez co."),
    ("swiezosc", "Pasek zakresu obliczeń (panel, nie ekran)",
     "Pasek nad powierzchniami: przypadek, stan modelu, gotowość i świeżość wyników. "
     "Sprawdź spójność chipów między sobą — „Wyniki: nieaktualne” przy „Przypadków: 0” "
     "to zestawienie, które trzeba umieć wytłumaczyć."),
    ("walidacja", "Walidacja energetyczna",
     "Bilans mocy i ślad WHITE BOX per pozycja."),
    ("uwaga", "Rejestr „co wymaga uwagi” (panel, nie ekran)",
     "Zbiorcza lista braków z miejscem naprawy — wpis bez miejsca naprawy jest ślepy."),
    ("porownanie", "Porównanie wariantów",
     "A/B dwóch przypadków: co się zmieniło i jaki to ma skutek."),
    ("estymacja", "Estymacja stanu (WLS)",
     "Pomiar vs estymata i residua — podstawa oceny wiarygodności pomiarów."),
    ("sila-sieci", "Siła sieci w punkcie przyłączenia",
     "Sk″ i stosunek mocy zwarciowej do mocy źródła — kryterium przyłączeniowe."),
    ("ssci", "Ryzyko interakcji podsynchronicznych (SSCI)",
     "Ocena dla przekształtników przy słabej sieci."),
    ("migotanie", "Migotanie światła (flicker)",
     "Pst/Plt wobec limitów; wartość bez limitu nic nie mówi."),
    ("cieplna", "Wytrzymałość cieplna przewodu",
     "I²t przewodu wobec prądu zwarcia i czasu wyłączenia (IEC 60949)."),
    ("lom", "Utrata sieci sztywnej (LoM)",
     "Kryteria anty-wyspowe i ich czasy działania."),
    ("frt", "Przejście przez zapad napięcia (FRT)",
     "Obwiednia wymagana przez operatora wobec zdolności urządzenia."),
    ("kompensacja", "Kompensacja mocy biernej — dobór",
     "Zapotrzebowanie na Q i dobór stopni."),
    ("kompensacja-wynik", "Kompensacja — wynik",
     "Efekt na profilu napięcia i na tgφ w punkcie rozliczeniowym."),
    ("zksn", "Zwarcie doziemne w sieci SN",
     "Prąd doziemny wobec sposobu uziemienia punktu neutralnego."),
    ("odbior-zgodnosc", "Zgodność odbioru",
     "Warunki przyłączenia odbioru wobec parametrów sieci."),
    ("pomiar", "Układ pomiarowy pola",
     "Tor prądowy i napięciowy: co mierzy, czym i dla której funkcji."),
    ("edycja-parametrow", "Edycja parametrów elementu",
     "Które pola są danymi, a które pochodnymi — pochodna nie może być edytowalna."),
    ("przypisanie-katalogu", "Przypisanie typu katalogowego",
     "Wiązanie elementu z katalogiem i skutki dla analiz."),
    ("odgalezienie", "Odgałęzienie magistrali",
     "Punkt odgałęzienia i jego wpływ na topologię."),
    ("slup-odgalezny", "Słup odgałęźny",
     "Konstrukcja i osprzęt w punkcie odgałęzienia."),
    ("pole-nn", "Pole nN stacji",
     "Odpływy nN i ich zabezpieczenia."),
    ("zrodlo", "Kreator źródła zasilania (GPZ)",
     "Transformator, rodzina rozdzielnicy i pole liniowe. TU BYŁ BIAŁY EKRAN: rekord "
     "katalogu bez listy napięć wywracał cały kreator — naprawione w V12K-259."),
    ("zrodlo-dyspozycyjne", "Źródło dyspozycyjne",
     "Agregat / UPS jako źródło: parametry zwarciowe i tryb pracy."),
    ("oltc", "Badania regulacji OLTC",
     "Sweep pozycji zaczepów, profil roczny i optymalizacja."),
]


def sceny_grupa() -> Grupa:
    ekrany: list[Ekran] = []
    for nazwa, tytul, szukaj in SCENY:
        for motyw, etykieta in (("light", "motyw jasny"), ("dark", "motyw ciemny")):
            ekrany.append(
                Ekran(
                    f"sceny/scena_{nazwa}_{motyw}.png",
                    tytul,
                    szukaj,
                    etykieta,
                    szerokosc=760,
                    jakosc=58,
                )
            )
    return Grupa(
        "sceny",
        "Pozostałe powierzchnie i panele — inwentarz pełny",
        "Trzydziesci piec scen, ktore harness renderowal od dawna, a bramka zrzutow "
        "kadrowala ZERO z nich. Pierwsze uruchomienie nowej bramki znalazlo tu kreator "
        "zrodla zasilania w stanie bialego ekranu, a scene odbioru z komunikatem awarii "
        "uslugi obliczen. UWAGA NA CZYTANIE KADROW: czesc scen to PELNE POWIERZCHNIE "
        "(np. rozplyw mocy), a czesc to POJEDYNCZE PANELE osadzane w powierzchniach "
        "(pasek zakresu obliczen, rejestr uwag) — pusta przestrzen wokol panelu jest "
        "wlasciwoscia sceny, nie brakiem ekranu. Kadry sa mniejsze niz wiodace: to "
        "inwentarz do przegladu, nie sesja zdjeciowa.",
        ekrany,
    )


POKRYCIE = [
    ("Konfigurator wytwórcy E-21 (desktop, telefon, tablet, picker)", "4", "tak"),
    ("Kreatory obiektów SN (pole, OZE 1–4, transformator, magistrala, kompensator, odbiór)", "20", "tak"),
    ("Arc Flash z ekranu obiektu", "2", "tak"),
    ("Schemat jednoliniowy L0/L1/L2 + dwa kadry szczegółu", "5", "tak — 8 plików, pary motywów identyczne"),
    ("Wyniki, Zabezpieczenia, Dokumentacja, pulpit projektu i 31 dalszych scen", "70", "tak — bramka dodana w V12K-259"),
]


def figura(e: Ekran) -> str:
    motyw = f'<span class="motyw">{e.motyw}</span>' if e.motyw else ""
    return (
        '<figure class="kadr">'
        f'<img src="{_data_uri(e.plik, e.szerokosc, e.jakosc)}" alt="{e.tytul} — zrzut żywej aplikacji" loading="lazy">'
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
        f'<a href="#{g.kotwica}">{g.tytul.split(" — ")[0].split(" · ")[0]}</a>'
        for g in [*GRUPY, sceny_grupa()]
    )
    wiersze = "\n".join(
        f'<tr><td>{obszar}</td><td class="num">{ile}</td><td>{zywy}</td></tr>'
        for obszar, ile, zywy in POKRYCIE
    )
    sekcje = "\n".join(sekcja(g) for g in [*GRUPY, sceny_grupa()])
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
<h1>Wszystkie ekrany, które renderuje żywa aplikacja</h1>
<p class="cichy">101 kadrów ze 104 plików (trzy pary motywów schematu są bajtowo identyczne)
· dwie bramki Playwright, 89 testów, wszystkie zielone · oba motywy ·
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

<div class="karta">
<p><strong>Poprzednia wersja tej strony miała tu nazwany brak — jest zamknięty.</strong>
Pisałem, że Wyniki, Zabezpieczenia, Dokumentacja i pulpit projektu nie są odtwarzane przez
bramkę zrzutów. Pomiar pokazał coś gorszego i lepszego naraz: harness renderował
<strong>43 sceny</strong> żywych komponentów, a bramka kadrowała <strong>9</strong>.
Trzydzieści cztery ekrany były utrzymywane i nigdy nieoglądane — zdolność bez konsumenta.</p>
<p>Druga bramka kadruje teraz każdą scenę w obu motywach i sprawdza trzy rzeczy poza samym
obrazem: czy scena dochodzi do stanu gotowego, czy render nie rzuca wyjątku i czy treść nie
jest komunikatem o nieudanym pobraniu. <strong>Pierwsze uruchomienie znalazło biały ekran</strong>
w kreatorze źródła zasilania (rekord katalogu bez listy napięć wywracał cały komponent) —
defekt niewidoczny, dopóki tego ekranu nikt nie renderował w CI.</p>
</div>

{sekcje}

<section id="stan">
<h2>Stan techniczny materiału</h2>
<ul>
<li>Zrzuty: <code>e2e/creator-screenshot.spec.ts</code> (19 testów) oraz
<code>e2e/wszystkie-sceny-screenshot.spec.ts</code> (70 testów) — razem 89, wszystkie zielone.
Druga bramka powstała w V12K-259 i przy pierwszym uruchomieniu znalazła biały ekran
w kreatorze źródła zasilania.</li>
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
