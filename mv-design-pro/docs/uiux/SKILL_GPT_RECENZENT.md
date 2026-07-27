---
name: gpt
description: Zewnętrzna recenzja modelem GPT (Codex) w czterech rolach — burza mózgów, audytor, recenzent, doradca. Użyj, gdy użytkownik prosi o „drugą parę oczu", opinię GPT, przegląd planu/architektury/diffu przez inny model, znalezienie luk w planie albo kontrolę własnej pracy przez niezależnego recenzenta. Skill sam wykrywa, czy GPT jest w ogóle dostępny, i NIGDY nie udaje jego odpowiedzi.
---

# Recenzja modelem GPT — burza mózgów · audytor · recenzent · doradca

## Zasada nadrzędna (nienegocjowalna)

**Nie wolno wytworzyć ani zacytować „opinii GPT", której GPT nie wypowiedział.**
Jeśli model jest niedostępny, mówisz to wprost i przechodzisz do trybu zastępczego
(§4), oznaczając wynik jako **recenzję własną**, nie zewnętrzną. Sfabrykowana opinia
zewnętrzna jest gorsza niż jej brak: użytkownik podejmuje na jej podstawie decyzje,
sądząc, że ma niezależne źródło.

## 1. Wykryj dostępność (zawsze pierwszy krok, bez zgadywania)

```bash
which codex 2>/dev/null            # CLI Codex
printenv OPENAI_API_KEY >/dev/null 2>&1 && echo "klucz OpenAI: jest"
which llm aichat 2>/dev/null       # alternatywne klienty
```

Wynik decyduje o trybie:

| Stan | Tryb |
|---|---|
| `codex` obecny | §2 — wywołanie CLI |
| brak `codex`, jest `OPENAI_API_KEY` | §3 — wywołanie API |
| nic z powyższych | §4 — recenzja własna, JAWNIE oznaczona |

## 2. Wywołanie przez Codex CLI

```bash
codex exec --model gpt-5.6 --reasoning-effort xhigh --sandbox read-only \
  --cd <katalog_repo> "$(cat /tmp/prompt_recenzji.md)"
```

Uwagi: `--sandbox read-only` — recenzent CZYTA, nie zmienia repo (zmiany wprowadzasz Ty,
po weryfikacji). Długi przegląd puszczaj w tle i odbieraj wynik z pliku.

## 3. Wywołanie przez API (gdy jest klucz, nie ma CLI)

Wyślij `POST /v1/responses` z modelem `gpt-5.6`, `reasoning: {effort: "xhigh"}` i promptem
z §5. Odpowiedź zapisz do pliku roboczego, żeby dało się ją zacytować dosłownie.

## 4. Tryb zastępczy — recenzja własna (gdy GPT niedostępny)

Powiedz użytkownikowi jednym zdaniem, czego brakuje (CLI/klucza) i że wynik jest
**recenzją własną**. Potem przeprowadź ten sam protokół czterech ról co w §5, ale
z podwyższonym rygorem antystronniczości, bo recenzujesz siebie:

- każde znalezisko musi wskazywać **plik i linię albo pomiar**, nie wrażenie,
- każde „brak/jest" weryfikuj poleceniem (inwentarz, `grep` bez `head`, sonda),
- osobno wypisz **czego NIE sprawdziłeś** i dlaczego,
- nie oznaczaj wyniku jako „niezależnej opinii".

## 5. Prompt recenzji — cztery role w jednym przebiegu

Zbuduj prompt z tych sekcji (po polsku, bo taki jest język projektu):

```
KONTEKST: <czym jest system, jaka warstwa, co się właśnie zmieniło>
MATERIAŁ: <ścieżki plików / diff / dokument planu — wklejone dosłownie>
ZASADY PROJEKTU: <wyciąg z CLAUDE.md: zero fabrykacji, brak danej ≠ zero,
                  reguła inżynierska w domenie, test na realnej ścieżce>

Wejdź kolejno w CZTERY ROLE i w każdej odpowiedz osobno:

1. BURZA MÓZGÓW — czego w tym planie NIE MA, a powinno być? Wymień pomysły,
   których autor mógł nie rozważyć. Bez oceniania, minimum 5 pozycji.
2. AUDYTOR — szukaj: fabrykacji danych, brakującej danej zamienionej w wartość,
   reguły inżynierskiej w warstwie prezentacji, dwóch źródeł prawdy, zdolności
   bez wywołania, bramki, która nie gryzie. Każde znalezisko: plik/linia + skutek
   dla użytkownika + jak to potwierdzić pomiarem.
3. RECENZENT — oceń plan jako całość: kolejność kart, ryzyka, czy któraś karta
   zależy od niedostarczonej danej, czy podział na etapy nie ukrywa długu.
   Wskaż, co odrzucić albo połączyć.
4. DORADCA — trzy najmocniejsze ulepszenia NASTĘPNE (nie objęte planem),
   uszeregowane po stosunku wartości inżynierskiej do kosztu, z uzasadnieniem.

Format: sekcje 1–4, w każdej lista numerowana. Zero ogólników typu „popraw UX" —
każde zdanie ma wskazywać konkretny plik, dane albo normę.
```

## 6. Co zrobić z odpowiedzią (to jest właściwa praca)

Recenzja zewnętrzna **nie jest wyrocznią**. Każde znalezisko przechodzi u Ciebie
przez trzy filtry, zanim cokolwiek zmienisz:

1. **Weryfikacja pomiarem** — sprawdź na kodzie/danych, czy zarzut jest prawdziwy.
   Modele mylą się co do zawartości repo równie łatwo jak ludzie.
2. **Klasyfikacja**: `POTWIERDZONE` (naprawiam) · `NIEAKTUALNE` (już naprawione —
   podaj gdzie) · `BŁĘDNE` (podaj kontrpomiar) · `POZA ZAKRESEM` (do rejestru długu).
3. **Wdrożenie** wyłącznie potwierdzonych, z pełnym rygorem projektu: naprawa
   u źródła, test na realnej ścieżce, bramka sprawdzona wstrzykniętą regresją,
   regresja warstwy, wpis do rejestru, commit + push.

W raporcie dla użytkownika **cytuj recenzenta dosłownie** przy znaleziskach
potwierdzonych i **pokaż kontrpomiar** przy odrzuconych. Podaj, ile z ilu znalezisk
przeszło weryfikację — to jedyna uczciwa miara wartości tej recenzji.

## 7. Kiedy NIE używać

- Do decyzji produktowych właściciela (te idą do niego, nie do modelu).
- Do „potwierdzenia", że Twoja praca jest dobra — recenzja ma szukać dziur,
  a nie zbierać pochwały; jeśli wraca sama pochwała, prompt był za miękki.
