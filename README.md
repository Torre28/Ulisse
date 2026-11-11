# Ulisse
An app that lead you to raise your head to see deeply the world around you. You can find the news of the day and the history linked to them, a place where you could discover new passions in a funny way and develope and learn more about the ones that you already have, an app that help you to balance your life and improve the way you live.

App personale (PWA) per allargare lo sguardo nel tempo libero: notizie con il loro contesto, scoperta di nuove passioni, paper resi digeribili, uno spazio di preghiera e meditazione, un quaderno di ripasso e missioni quotidiane che riequilibrano le aree della vita.

## Installazione sul telefono
1. Apri https://torre28.github.io/Ulisse/ con Chrome su Android.
2. Menu ⋮ → «Installa app» (o «Aggiungi a schermata Home»).

## Come funziona l'intelligenza (gratis)
- **Notizie** (`notizie.yml`, ogni 30 min): feed raccolti lato server, raggruppati per storia, con antefatti; ramo `dati`.
- **Capire al volo** (`capire.yml`, ogni 2 ore, 4 lavori in parallelo con Ollama `qwen3:8b`): spiegazioni delle storie nuove e lezioni del catalogo; ramo `rapidi`.
- **Redazione notturna** (`redazione.yml`): percorsi completi, scoperta e Parola del giorno in `contenuti/`. Con il secret facoltativo `GROQ_API_KEY` (Settings → Secrets → Actions) i percorsi vengono scritti da un modello più grande.
- **Nell'app**: ciò che è pronto si apre all'istante (precaricato nella cache). Per il resto, una scheda istantanea con fonti, antefatti, voci e mappa; poi la spiegazione completa da Groq (chiave gratuita in ⚙, 10-20 s) oppure dal modello sul telefono (WebGPU).
- Istruzioni e modello di qualità condivisi in `prompts/piani.json`.

## Struttura
- `index.html` — guscio dell'app
- `css/app.css` — stile
- `js/core.js` — utilità, rete (con proxy di riserva), voce, stato, registro
- `js/data.js` — fonti, podcast, missioni, catalogo, Liturgia delle Ore, Bibbia, lezione di esempio
- `js/sources.js` — Google News e RSS, raggruppamento delle notizie, Wikipedia, OpenAlex, Apple Podcasts, Google Books
- `js/ai.js` — motore: contenuti notturni, modello sul telefono (WebLLM), Gemini facoltativo; lezioni scritte un capitolo alla volta
- `js/engine.js` — lettore delle lezioni interattive, quaderno e ripasso
- `js/views.js` — sezioni, lettore audio, impostazioni, navigazione
- `manifest.webmanifest`, `sw.js` — installazione e uso offline

I dati restano nel browser del telefono: usa ⚙ → «Copia backup» ogni tanto.

## Lezioni
Le lezioni sono JSON (schema in `prompts/piani.json`). Si generano nell'app o si importano da Quaderno → Lezioni.
