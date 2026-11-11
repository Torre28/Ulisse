# Ulisse
An app that lead you to raise your head to see deeply the world around you. You can find the news of the day and the history linked to them, a place where you could discover new passions in a funny way and develope and learn more about the ones that you already have, an app that help you to balance your life and improve the way you live.

App personale (PWA) per allargare lo sguardo nel tempo libero: notizie con il loro contesto, scoperta di nuove passioni, paper resi digeribili, uno spazio di preghiera e meditazione, un quaderno di ripasso e missioni quotidiane che riequilibrano le aree della vita.

## Installazione sul telefono
1. Apri https://torre28.github.io/Ulisse/ con Chrome su Android.
2. Menu ⋮ → «Installa app» (o «Aggiungi a schermata Home»).

## Struttura
- `index.html` — tutta l'app: stato, missioni, motore delle lezioni, sezioni
- `manifest.webmanifest`, `sw.js` — installazione e uso offline
- Fonti gratuite: feed RSS, Google News, Wikipedia, OpenAlex

I dati restano nel browser del telefono: usa ⚙ → «Copia backup» ogni tanto.

## Lezioni
Le lezioni sono file JSON (formato descritto in `index.html`, costante `SCHEMA`). Si importano da Quaderno → Lezioni → Importa.
