# Interaktive Fabrik-Demo

[English](../INTERACTIVE_DEMO.md)

> Übersetzung von [docs/INTERACTIVE_DEMO.md](../INTERACTIVE_DEMO.md) auf Stand
> `7268692f` (7268692fcff50b2072a7976afb480225fcb71f17). Maßgeblich ist die
> englische Fassung.

Die Demo betreibt das echte Dashboard mit einer isolierten, dauerhaften lokalen
Datenbank. Die Wiedergabe mit vier Signalen nutzt das
[eigene Fabrikprofil](../../profiles/owned-factory.json). Alle Namen und Messwerte
sind synthetisch. Es wird keine Verbindung zu einer physischen Maschine aufgebaut.

## Starten

Node.js 24, Docker und die Abhängigkeiten des Repositorys (`npm ci`) installieren.
Den eigenen lokalen PostgreSQL-Dienst einmalig mit
`docker compose -f compose.local.yml up -d` starten. Im Wurzelverzeichnis des
Repositorys ausführen:

```sh
npm run demo
```

Die im Terminal ausgegebene lokale Adresse öffnen. Die Anleitungsseite zeigt die
erzeugte Demo-Anmeldung, einen direkten Link zur Schicht und Schaltflächen für die
Szenarien. Anleitungsseite und Anwendung lauschen beide auf `127.0.0.1` auf freien
Ports. Für die Demo muss kein Browser-Treiber installiert werden. Der erste
Server-Build kann etwa eine Minute dauern.

### In GitHub Codespaces

[Codespace öffnen](https://codespaces.new/Sparkz400/industrial-performance-dashboard?quickstart=1).
Der [Entwicklungscontainer](../../.devcontainer/devcontainer.json) installiert die
Abhängigkeiten, startet die eigene Datenbank per Docker-in-Docker und führt
`npm run demo` in einem Terminal aus. Die ausgegebene Adresse **Factory demo**
öffnen; Codespaces leitet jeden Port privat an Ihr GitHub-Konto weiter. Die Demo
liefert Dashboard und API über einen einzigen weitergeleiteten Origin aus, und die
Anleitungsseite akzeptiert nur ihre eigene weitergeleitete Adresse. Den Codespace
danach stoppen; er verbraucht Ihr Codespaces-Kontingent.

Eine vorhandene `server/.env` hat Vorrang vor `.env.example`. Die Demo verweigert
einen anderen Datenbank-Host als localhost/127.0.0.1 und einen anderen Port als
55432. Sie legt auf diesem lokalen Dienst eine zufällige Datenbank `pd_demo_…` mit
passender Eigentumsmarkierung an. Die normale Datenbank der Anwendung und deren
Zugangsdaten werden weder verwendet noch zurückgesetzt.

## Die geführten Fälle ausprobieren

Die Schaltflächen der Anleitungsseite sind nur auf Englisch beschriftet.

1. **Known shift** (bekannte Schicht): 30 Sekunden Lauf, 30 Sekunden Stillstand,
   15 Teile gesamt, 13 gut, 2 Ausschuss, eine ideale Taktzeit von zwei Sekunden und
   OEE **43.33%**. Das Quell-Ledger ist unabhängig von der Berechnung. Den
   beobachteten Stillstand klassifizieren und den Bericht prüfen.
2. **Missing measurements** (fehlende Messwerte): ein fehlender Mittelpunkt
   hinterlässt eine Abdeckungslücke. Betroffene Zähler und die OEE bleiben unbekannt.
3. **Bad signal quality** (schlechte Signalqualität): der Mittelpunkt ist
   ausdrücklich `BadNoCommunication`; er darf nicht zu einer guten Beobachtung werden.
4. **Counter reset** (Zählerrücksetzung): fallende Zählerstände werden von diesem
   Profil abgelehnt. Eine Rücksetzrichtlinie nur wählen, wenn sie dem dokumentierten
   Verhalten der tatsächlichen Anlage entspricht.

Jede Schaltfläche fügt eine neue Maschine/Schicht hinzu, ohne frühere Änderungen zu
überschreiben. Bis zu 100 Schichten sind vor einem Zurücksetzen möglich. Die
Wiedergabe schreibt ein festes historisches Ledger; sie ist **kein** Test eines
Live-OPC-UA-Transports. Eigene OPC-UA-/Modbus-Integrationstests prüfen die
jeweiligen Transportwege getrennt.

Unter **Produktion** bei einer Schicht **Reproduzierbare Nachweise exportieren**
wählen und der [Anleitung für Offline-Nachweise](SHIFT_EVIDENCE.md) folgen.
Fehlende oder schlechte Daten bleiben auch nach dem Export sichtbar. Beiträge zu
Profilen beginnen im [Katalog](../../profiles/README.md).

## Stoppen, fortsetzen und zurücksetzen

Im Terminal Strg+C (Ctrl+C) drücken. `npm run demo` setzt mit derselben Datenbank
und derselben Demo-Anmeldung fort. Lokale Zugangsdaten, Zertifikate und
Laufzeitdateien liegen unter `.local/interactive-demo/`, das von Git ignoriert wird.
Dieses Verzeichnis privat halten. Die Passwörter der eingebauten Demo-Konten nur
ändern, wenn Sie die Demo zurücksetzen wollen.

Um die Datenbank dieser Demo zu löschen, die Demo zuerst stoppen und dann ausführen:

```sh
npm run demo:reset
```

Das Zurücksetzen erfordert den passenden lokalen Eigentumseintrag und die
Datenbankmarkierung. Es verweigert eine laufende Demo, eine abweichende Markierung
oder aktive Datenbanksitzungen; Sitzungen werden niemals zwangsweise beendet. Der
nächste Start erzeugt eine neue bekannte Schicht. Lokale Laufzeitdateien und die
erzeugte Anmeldung bleiben erhalten. Ist ein Prozess abgestürzt, entfernt der Start
dessen Sperre erst, nachdem geprüft wurde, dass der eingetragene Prozess nicht mehr
existiert. Bei einer wiederverwendeten PID muss eventuell gewartet werden, bis
dieser Prozess endet; fremde Prozesse nicht beenden.

Der Screenshot-Rundgang bleibt über `node scripts/demo-factory.mjs` verfügbar. Er
ist ein separater automatisierter Nachweisgenerator, nicht die dauerhafte
interaktive Demo.

Validierung: `node scripts/test-community-workflows.mjs` und
`node scripts/test-interactive-demo.mjs` prüfen die unabhängigen Summen,
Fehlerfälle, Browser-Anmeldung/-Download, Persistenz, Eigentumsprüfung beim
Zurücksetzen und die Ablehnung fremder Origins. Der erste Start simuliert die
Codespaces-Weiterleitung: Die Anleitungsseite akzeptiert nur ihren eigenen
weitergeleiteten Host, und der weitergeleitete Socket-Handshake akzeptiert nur den
weitergeleiteten Origin der Demo. Ein echter Codespace wurde im Rahmen der
automatisierten Validierung nicht ausgeführt.
