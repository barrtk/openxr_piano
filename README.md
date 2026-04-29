# 🎹 VrPiano554 - 3D Piano Viewer

Interaktywna, webowa aplikacja 3D pełniąca funkcję zaawansowanego odtwarzacza MIDI oraz wirtualnego pianina. Projekt renderuje w czasie rzeczywistym model 3D instrumentu za pomocą biblioteki Three.js i generuje wysokiej jakości dźwięk korzystając z rzeczywistych sampli (Tone.js).

## 🌟 Funkcje
* **Wizualizacja MIDI (Spadające Bloki):** Styl znany z programu Synthesia – wczytuj pliki `.mid`/`.midi` i obserwuj nadlatujące nuty.
* **Tryb Ćwiczenia (Practice Mode 🎯):** Odtwarzanie utworu zatrzyma się i poczeka, aż wciśniesz odpowiednie klawisze.
* **Granie na żywo (Freestyle):** Zagraj własne melodie na klawiaturze komputera lub za pomocą zewnętrznego urządzenia MIDI, gdy piosenka jest wstrzymana.
* **Wsparcie dla Hardware MIDI:** Podłącz własny instrument na USB. Aplikacja nie tylko zagra wciśnięte przez Ciebie nuty, ale również odeśle sygnały *Note On/Off* z powrotem do urządzenia (podświetlając fizyczne klawisze w trakcie grania utworu, jeśli Twoja klawiatura to obsługuje).
* **Nawigacja 3D:** Pełna swoboda orbitowania, przybliżania i przesuwania kamery myszką po scenie.
* **Kontrola odtwarzania:** Płynna zmiana tempa utworu, przewijanie piosenki na osi czasu i sterowanie głośnością.

## ⚙️ Wymagania
Aby w pełni cieszyć się doświadczeniem "Plug & Play", musisz spełnić jedynie poniższe warunki:

1. **Python 3.x** – wymagany do uruchomienia lekkiego serwera lokalnego.
2. **Dostęp do Internetu** – przy pierwszym uruchomieniu przeglądarka musi pobrać z sieci (CDN) biblioteki silnika 3D oraz audio.
3. **Przeglądarka z Chromium** (Chrome, Edge, Opera, Brave) – wymagana **TYLKO** jeśli chcesz korzystać z fizycznego instrumentu MIDI (przeglądarki takie jak Firefox czy Safari mogą mieć domyślnie zablokowane WebMIDI).

## 🚀 Jak uruchomić (Instalacja)

1. **Zainstaluj środowisko Python:**
   Jeśli nie masz Pythona, pobierz go ze strony [python.org](https://www.python.org/downloads/). 
   > ⚠️ **WAŻNE:** Podczas instalatora Pythona koniecznie zaznacz okienko **"Add Python to PATH"** na dole pierwszego ekranu!

2. **Pobierz ten projekt:**
   Pobierz pliki jako ZIP (i wypakuj) lub użyj komendy `git clone`.

3. **Uruchom:**
   Kliknij dwukrotnie plik **`run.bat`**. 
   Skrypt automatycznie zweryfikuje instalację Pythona, uruchomi lokalny serwer w tle i po 2 sekundach otworzy w Twojej domyślnej przeglądarce adres `http://127.0.0.1:8000`.

## 🎵 Własne piosenki
Aby dodać własne utwory do listy wyboru, po prostu wrzuć swoje pliki `.mid` lub `.midi` do folderu `midi` w głównym katalogu projektu. Odśwież stronę aplikacji – pojawią się automatycznie na rozwijanej liście! Możesz też załadować pojedynczy plik prosto z dysku przyciskiem 📂 na panelu odtwarzacza.
