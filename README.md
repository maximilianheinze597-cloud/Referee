# Schiri – Spielleitung

Eine kleine App für Schiedsrichter, die direkt im Browser läuft und sich aufs Handy installieren lässt (PWA). Sie funktioniert auch ohne Internet.

## Funktionen

- **Spieluhr** mit Anpfiff, Halbzeiten, optionaler Verlängerung, Nachspielzeit und Uhrkorrektur. Die Uhr läuft auch bei gesperrtem Bildschirm korrekt weiter.
- **Alarm** bei Ende der regulären Spielzeit und am Ende der Nachspielzeit (Ton, Vibration, Hinweis).
- **Pfeife** mit sechs Signalen: kurz, doppelt, lang, Spielende, Hupe und Signalton. Drei Pfeifenklänge zur Auswahl. Alle Töne werden im Gerät erzeugt, es sind keine Audiodateien nötig.
- **Spielstand** mit Toren und Rücknahme.
- **Karten**: Gelb, Gelb-Rot und Rot mit Grund und Spielernummer. Bei einer zweiten Gelben Karte schlägt die App automatisch Gelb-Rot vor. Übersicht über alle verwarnten und ausgeschlossenen Spieler.
- **Wechsel** mit Zähler pro Mannschaft und Warnung bei Überschreiten der erlaubten Anzahl.
- **Protokoll** mit Minute, Notizen, Löschen des letzten Eintrags sowie Kopieren und Teilen als Text.
- **Münzwurf** und **Elfmeterschießen**.
- Bildschirm bleibt während des Spiels an (wo vom Gerät unterstützt).

## Auf GitHub veröffentlichen

1. Neues Repository auf GitHub anlegen, z. B. `schiri-app`.
2. Dateien hochladen oder per Git pushen:

   ```bash
   git init
   git add .
   git commit -m "Schiri-App"
   git branch -M main
   git remote add origin https://github.com/DEIN-NAME/schiri-app.git
   git push -u origin main
   ```

3. Im Repository unter **Settings → Pages → Source** den Eintrag **GitHub Actions** wählen.
4. Nach dem ersten Durchlauf der Action ist die App unter `https://DEIN-NAME.github.io/schiri-app/` erreichbar.

## Aufs Handy installieren

- **Android (Chrome):** Menü → *App installieren*.
- **iPhone (Safari):** Teilen → *Zum Home-Bildschirm*.

Danach startet sie wie eine normale App und läuft offline.

## Lokal testen

```bash
python3 -m http.server 8000
```

Dann `http://localhost:8000` öffnen.

## Hinweise

- Alle Daten bleiben im Browser des Geräts (localStorage).
- Nach Änderungen an den Dateien in `sw.js` die Versionsnummer von `CACHE` erhöhen, damit Geräte die neue Version laden.
- Die Hupe und die Pfeife ersetzen keine echte Pfeife. Die App ist als Hilfe für Zeit, Karten und Protokoll gedacht.

## Lizenz

MIT
