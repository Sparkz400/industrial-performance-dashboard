# Portable Schichtnachweise

[English](../SHIFT_EVIDENCE.md)

> Übersetzung von [docs/SHIFT_EVIDENCE.md](../SHIFT_EVIDENCE.md) auf Stand
> `7268692f` (7268692fcff50b2072a7976afb480225fcb71f17). Maßgeblich ist die
> englische Fassung. JSON-Feldnamen und Befehle bleiben unübersetzt.

Unter **Produktion** eine Schicht auswählen und **Reproduzierbare Nachweise
exportieren** wählen. Der Download ist durch dieselben Sitzungs- und
Maschinenzugriffsprüfungen geschützt wie der Schichtbericht. Erfolgreiche Exporte
protokollieren Akteur und Schicht im Audit-Log der Anwendung. Die bisherigen
Berichtsexporte als JSON/Druck bleiben verfügbar.

Das JSON-Bündel der Version 1 enthält:

- Den aktuellen Schichtbericht, das eingefrorene Profil und die Taktstandards,
  Pausen und Produktläufe.
- Genau die Berechnungseingaben: ausgewählte Messwerte mit ihren Rohwerten,
  effektiven numerischen Werten, Quellidentitäten, Qualitäts-/Uhr-Flags,
  Quell-/Empfangszeitstempeln und Korrektur-Revisionsnummern.
- Geprüfte Mengen-/Zustandsangaben, Abgleichsummen und die Historie der
  Stillstandsgründe.
- Die aktuelle Planversion und bis zu 100 Verweise auf frühere Berichtsrevisionen
  (ID, Digest, Grund und Datum). Diese Verweise sind keine historischen Schnappschüsse
  und keine Zusage, dass alte Revisionen aus den heute aufbewahrten Messwerten
  reproduzierbar sind.
- Den ursprünglichen Berechnungszeitpunkt, die verfügbare Quellrevision der
  Anwendung, einen SHA-256-Digest der kanonischen Nutzlast und den Fingerabdruck des
  Berechnungsquellcodes.

Eine nicht abgeschlossene Schicht wird zu ihrem ursprünglichen Berechnungszeitpunkt
nachgerechnet. Der Export liest einen einzigen wiederholbaren Datenbank-Snapshot,
sodass gleichzeitige Korrekturen keine verschiedenen Zeitpunkte in einem Bündel
vermischen. Er schlägt fehl, statt abzuschneiden, bei 32 MiB, 100,000
Berechnungs-Eingabewerten über Schicht/Produktläufe, 1,000 Gründen/manuellen Angaben
oder 100 Revisionsverweisen. Datenbankanweisungen laufen nach 15 Sekunden ab. Große
oder hochfrequente Schichten benötigen ein kürzeres Exportfenster.

## Ohne Anwendung oder Datenbank reproduzieren

Den Quellcode-Checkout aufbewahren, aus dem der Export stammt. Mit Node.js 24
ausführen:

```sh
node scripts/verify-shift-evidence.mjs path/to/shift-123-evidence.json
```

Dieser Prüfer benötigt keine installierten npm-Pakete, keine Datenbank, keinen
Dashboard-Server und keine Netzwerkverbindung. Für eine kleinere Offline-Übertragung
die Verzeichnisstruktur dieser drei vertrauenswürdigen Quelldateien neben dem
JSON beibehalten, zusätzlich `server/package.json`, das die beiden `.ts`-Dateien als
ES-Module kennzeichnet (ohne diese Datei kann Node.js den Berechner nicht laden):

```text
scripts/verify-shift-evidence.mjs
server/src/services/shiftCalculation.ts
server/src/utils/canonicalJson.ts
server/package.json
```

Zum Ausprobieren ohne eigenen Export eignet sich das veröffentlichte synthetische
Beispiel [`examples/shift-evidence-known.json`](../../examples/shift-evidence-known.json);
siehe [Beispiele](../../examples/README.md#synthetic-shift-evidence).

Der Prüfer verifiziert den Nutzlast-Hash und den Fingerabdruck des Berechners,
rekonstruiert numerische Eingaben anhand ihrer Quellidentitäten, berechnet jeden
Produktlauf und die Schicht neu und vergleicht den berechneten Bericht.
Erzeugungszeitstempel, gespeicherte Zusammenfassungen der Messwert-Fingerabdrücke und
Metadaten der Planversion sind vom Berechnungsvergleich ausgenommen; der
Nutzlast-Digest deckt sie trotzdem ab. Der Fingerabdruck des Berechners nutzt
UTF-8-Text mit LF-Zeilenenden, unter Linux und Windows gleichermaßen. Einen
vertrauenswürdigen Checkout verwenden: niemals Code ausführen, den ein nicht
vertrauenswürdiger Absender von Nachweisen mitliefert.

Eine erfolgreiche Ausgabe enthält `reproduced: true`, die berechnete OEE,
verbleibende Probleme und `authenticated: false`. `reproduced: true` bedeutet, dass
dasselbe Ergebnis erneut berechnet wurde; `authenticated: false` bedeutet, dass
damit **nicht** belegt ist, wer das Bündel erstellt hat. Die Reproduktion ist auch
dann erfolgreich, wenn die OEE unbekannt ist: Es wurde dasselbe Ergebnis für
fehlende Daten/Qualität erzielt. Ein falscher Hash, fehlende Eingaben eines Laufs,
ein abweichender Berechner (Quellrevision und Berechner-Fingerabdruck müssen zum
Export passen), eine geänderte Quellidentität oder ein nicht reproduzierbares
Ergebnis beenden den Prüfer mit einem Fehler. Hashes authentifizieren keinen
Herausgeber; jemand kann ein Bündel ändern und den Digest neu berechnen. Physische
Genauigkeit und eine Signatur des Herausgebers bleiben separate Abnahmeschritte.

## Weitergabe und Grenzen

Der Export schließt Übergabenotizen/Benutzernamen, Maschinenzugangsdaten,
Verbindungsendpunkte und nicht beteiligte Maschinen aus. Er **enthält jedoch**
Produktionsnamen, Namespace-Identitäten, Auftrags-/Referenz- und Stillstandstexte,
Zeitstempel sowie numerische Datensatz-/Akteur-IDs. Vor dem Teilen prüfen; das
Bündel ist nicht automatisch anonym. Jede Bearbeitung macht seinen Digest ungültig.
Es findet kein Upload und keine automatische externe Weitergabe statt.

Dieser erste Umfang deckt eine Schicht/OEE-Berechnung und ihre aktuell aufbewahrten
Eingaben ab. Er reproduziert nicht alle historischen Revisionen, holt keine durch
Aufbewahrungsfristen entfernten Messwerte zurück, enthält kein vollständiges
Audit-Log, signiert kein Release und qualifiziert keine physischen Maschinen.
Validierung: `scripts/test-community-workflows.mjs` prüft unabhängige Summen,
Qualität, Lücken, Rücksetzungen, mehrere Produktstandards, Korrekturen, Zugriff,
Manipulation und einen echten Browser-Download. Bestehende Tests der
Schichtberechnung decken die zugrunde liegenden Zeit- und Zählerregeln ab.
