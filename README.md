# Zeepkist

Fullscreen Next.js timer voor Wonders of Work events.

De app haalt live eventdata op via Nostr-relays, toont het plaatje van het geselecteerde event fullscreen en biedt een verplaatsbare sessietimer met muis- en keyboardbediening.

## Functionaliteit

- Live eventdata via Nostr-relays.
- Event dropdown met de eerstkomende datum per eventtype.
- Eventbeeld fullscreen als achtergrond.
- Timer verschijnt pas na `Start`.
- Timer telt door onder nul, maar toont geen minteken.
- Vanaf `01:00` tot en met `00:00` glowt de timer in de huidige tekstkleur.
- Onder `00:00` wordt de timer rood en krijgt hij een rode glow.
- De weergegeven tijd is begrensd op `99:99`.
- Timerkleur wordt automatisch bepaald op basis van de licht/donker-analyse van het eventbeeld.
- Timer en controlbalk zijn verplaatsbaar.
- Timer is schaalbaar via resize-handle of keyboard.

## Gebruik

Start de development server:

```bash
npm install
npm run dev
```

Open daarna:

```text
http://localhost:3000
```

## Muisbediening

- Klik `Start` om de timer te starten vanaf de ingestelde spreektijd.
- Klik `Klaar` om de timer te stoppen en te resetten naar de ingestelde spreektijd.
- Gebruik `+` en `-` om de spreektijd aan te passen van `1` tot `99` minuten.
- Tijdens een lopende timer telt `+` direct 1 minuut bij de zichtbare tijd op.
- Tijdens een lopende timer trekt `-` direct 1 minuut van de zichtbare tijd af.
- Sleep de timer om hem te verplaatsen.
- Sleep de resize-handle onderaan de timer om hem te schalen.
- Sleep lege ruimte in de controlbalk om de balk te verplaatsen.

## Keyboardbediening

- `Enter`: Start/Klaar.
- `Space`: open/focus event dropdown.
- `Arrow keys`: verplaats de timer.
- `W` / `S`: schaal de timer groter of kleiner.
- `+` / `-`: pas de spreektijd aan.
- Key repeat wordt genegeerd voor globale shortcuts.

Als de event dropdown actief is:

- `ArrowUp` / `ArrowDown`: kies een event in de dropdown.
- `Enter`: selecteer het event.
- `Space`: selecteer het event.
- Dropdown-toetsen worden dan niet doorgegeven aan de globale timercontrols.

## Opgeslagen Instellingen

De app bewaart deze instellingen in `localStorage`:

- Geselecteerd eventtype.
- Ingestelde spreektijd.
- Timerpositie.
- Timergrootte.
- Controlbalkpositie.

De controlbalk wordt pas getoond zodra `localStorage` is ingelezen en events geladen zijn.

## Scripts

```bash
npm run dev
npm run build
npm run lint
```

## Licentie

MIT. Zie `LICENSE`.
