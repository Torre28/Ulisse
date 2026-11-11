# Ulisse
An app that lead you to raise your head to see deeply the world around you. You can find the news of the day and the history linked to them, a place where you could discover new passions in a funny way and develope and learn more about the ones that you already have, an app that help you to balance your life and improve the way you live.

App personale (PWA) per allargare lo sguardo nel tempo libero: notizie con il loro contesto, scoperta di nuove passioni, paper resi digeribili, uno spazio di preghiera e meditazione, un quaderno di ripasso e missioni quotidiane che riequilibrano le aree della vita.

## Installazione sul telefono
1. Apri https://torre28.github.io/Ulisse/ con Chrome su Android.
2. Menu ⋮ → «Installa app» (o «Aggiungi a schermata Home»).

## Prima configurazione
Ulisse genera lezioni, percorsi sulle notizie e spiegazioni con un modello linguistico gratuito.
Crea una chiave su https://aistudio.google.com/apikey (piano gratuito, senza carta) e incollala in ⚙ → Motore delle lezioni.
In alternativa o di riserva: una chiave OpenRouter (modelli `:free`).

## Struttura
- `index.html` — guscio dell'app
- `css/app.css` — stile
- `js/core.js` — utilità, rete (con proxy di riserva), voce, stato, registro
- `js/data.js` — fonti, podcast, missioni, catalogo, Liturgia delle Ore, Bibbia, lezione di esempio
- `js/sources.js` — Google News e RSS, raggruppamento delle notizie, Wikipedia, OpenAlex, Apple Podcasts, Google Books
- `js/ai.js` — motore di generazione (Gemini / OpenRouter) e istruzioni per ogni tipo di lezione
- `js/engine.js` — lettore delle lezioni interattive, quaderno e ripasso
- `js/views.js` — sezioni, lettore audio, impostazioni, navigazione
- `manifest.webmanifest`, `sw.js` — installazione e uso offline

I dati restano nel browser del telefono: usa ⚙ → «Copia backup» ogni tanto.

## Lezioni
Le lezioni sono JSON (schema in `js/ai.js`, costante `SCHEMA_TXT`). Si generano nell'app o si importano da Quaderno → Lezioni.
