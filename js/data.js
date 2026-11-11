"use strict";
/* ======================================================================
   ULISSE · dati: fonti, podcast, missioni, catalogo, liturgia, Bibbia
   ====================================================================== */

/* fonti di notizie: Google News raccoglie decine di testate italiane (Corriere, Repubblica, Sole 24 Ore, Rai, Sky, Avvenire…) */
const GN = (path, q) => `https://news.google.com/rss${path}?${q ? 'q=' + encodeURIComponent(q) + '&' : ''}hl=it&gl=IT&ceid=IT:it`;
const DEFAULT_FEEDS = [
  { name: 'Google News · Prima pagina', url: GN(''), tag: 'Principali' },
  { name: 'Google News · Italia', url: GN('/headlines/section/topic/NATION'), tag: 'Italia' },
  { name: 'Google News · Mondo', url: GN('/headlines/section/topic/WORLD'), tag: 'Mondo' },
  { name: 'Google News · Economia', url: GN('/headlines/section/topic/BUSINESS'), tag: 'Economia' },
  { name: 'Google News · Scienza', url: GN('/headlines/section/topic/SCIENCE'), tag: 'Scienza' },
  { name: 'Il Post', url: 'https://www.ilpost.it/feed/', tag: 'Principali' },
  { name: 'ANSA', url: 'https://www.ansa.it/sito/ansait_rss.xml', tag: 'Principali' }
];
const NEWS_TAGS = ['Principali', 'Italia', 'Mondo', 'Economia', 'Scienza'];
/* temi seguiti: raccolti dalla redazione con ricerche ragionate (vedi redazione/notizie.py) */
const TESTATE_NOMI = ['Corriere della Sera', 'la Repubblica', 'Il Sole 24 Ore', 'La Stampa', 'Il Messaggero', 'Avvenire', 'Il Post', 'Il Fatto Quotidiano', 'Domani', 'Il Foglio', 'Internazionale', 'La Nazione', 'Il Giornale', 'Libero', 'ISPI', 'Limes', 'Wired Italia', 'Le Scienze', 'Milano Finanza', 'Il Manifesto'];
const TEMI_NOMI = ['Spazio e astronomia', 'Elettronica e semiconduttori', 'Intelligenza artificiale', 'Fiorentina', 'Firenze', 'Toscana', 'Clima e ambiente', 'Energia', 'Scienza e medicina', 'Chiesa e Papa', 'Europa e UE', 'Medio Oriente', 'Ucraina e Russia', 'Stati Uniti', 'Cina e Asia', 'Economia italiana', 'Tecnologia', 'Cultura e libri', 'Formula 1 e motori'];

/* podcast: id Apple Podcasts quando noto, altrimenti si cerca per nome */
const DEFAULT_PODCASTS = [
  { name: 'SEIETRENTA · Chora', id: '1797866685', q: 'SEIETRENTA Chora' },
  { name: 'Start · Il Sole 24 Ore', id: '1502634775', q: 'Start Il Sole 24 Ore' },
  { name: 'The Essential · Will', id: '1506736057', q: 'The Essential Will Media' },
  { name: 'Nessuno Escluso · Will', q: 'Nessuno Escluso Will Media' },
  { name: 'Actually · Will', q: 'Actually Will Media' },
  { name: 'Stories · Cecilia Sala', q: 'Stories Cecilia Sala Chora' },
  { name: 'Il Mondo · Internazionale', q: 'Il Mondo Internazionale podcast' },
  { name: 'Market Mover · Il Sole 24 Ore', q: 'Market Mover Sole 24 Ore' }
];

/* Liturgia delle Ore: spiegazioni (testi del giorno su iBreviary) */
const HOURS = [
  { k: 'ufficio', n: 'Ufficio delle letture', slug: 'ufficio_delle_letture', when: 'in qualsiasi momento',
    what: 'È l\'Ora dell\'ascolto: si può pregare a qualsiasi ora del giorno. Dopo l\'inno e tre salmi ci sono due letture lunghe: una dalla Bibbia e una da un Padre della Chiesa, un santo o un documento della Chiesa.',
    why: 'Nasce dalle veglie notturne dei monaci. Oggi è il momento per nutrirsi con calma della Parola e della tradizione: è la più «da studio» delle Ore.',
    parts: ['Inno', 'Tre salmi con antifone', 'Lettura biblica', 'Lettura patristica o agiografica', 'Orazione'] },
  { k: 'lodi', n: 'Lodi mattutine', slug: 'lodi', from: 4, to: 10, when: 'al mattino',
    what: 'La preghiera del mattino, uno dei due «cardini» della giornata. Si consacra a Dio il giorno che comincia e si fa memoria della risurrezione di Gesù, avvenuta all\'alba.',
    why: 'Il cuore è il Benedictus, il cantico di Zaccaria (Lc 1,68-79): un padre che vede nel figlio appena nato l\'inizio di una promessa. Ogni mattina diventa l\'inizio di qualcosa.',
    parts: ['Invitatorio (se è la prima preghiera del giorno)', 'Inno', 'Salmo, cantico dell\'Antico Testamento, salmo di lode', 'Lettura breve e responsorio', 'Benedictus', 'Invocazioni', 'Padre nostro e orazione'] },
  { k: 'media', n: 'Ora media', slug: 'ora_media', from: 10, to: 15.5, when: 'a metà giornata',
    what: 'Una pausa breve nel lavoro: tre salmi, una lettura breve, un\'orazione. Si può scegliere tra Terza (metà mattina), Sesta (mezzogiorno) e Nona (metà pomeriggio).',
    why: 'Ognuna ricorda un momento: a Terza la discesa dello Spirito Santo (At 2,15), a Sesta la crocifissione, a Nona la morte di Gesù e la preghiera di Pietro e Giovanni al tempio (At 3,1).',
    parts: ['Inno', 'Tre salmi', 'Lettura breve', 'Orazione'] },
  { k: 'vespri', n: 'Vespri', slug: 'vespri', from: 15.5, to: 20.5, when: 'al tramonto',
    what: 'La preghiera della sera, l\'altro cardine della giornata. Si ringrazia per il giorno vissuto e si affida a Dio quello che non è andato.',
    why: 'Il salmo 141 dice: «la mia preghiera stia davanti a te come incenso». Il centro è il Magnificat (Lc 1,46-55), il canto di Maria su un Dio che rovescia i potenti e innalza gli umili.',
    parts: ['Inno', 'Due salmi e un cantico del Nuovo Testamento', 'Lettura breve e responsorio', 'Magnificat', 'Intercessioni', 'Padre nostro e orazione'] },
  { k: 'compieta', n: 'Compieta', slug: 'compieta', from: 20.5, to: 28, when: 'prima di dormire',
    what: 'L\'ultima preghiera, che «completa» la giornata. Si apre con un breve esame di coscienza e si chiude affidando la notte a Dio.',
    why: 'Il responsorio è «Signore, affido nelle tue mani il mio spirito», le ultime parole di Gesù in croce. Poi il Nunc dimittis (Lc 2,29-32), il cantico del vecchio Simeone che può andare in pace. Si conclude con un\'antifona alla Madonna.',
    parts: ['Esame di coscienza', 'Inno', 'Salmo (o due)', 'Lettura breve', 'Responsorio', 'Nunc dimittis', 'Orazione e benedizione', 'Antifona mariana'] }
];
function currentHour() {
  const d = new Date(); let x = d.getHours() + d.getMinutes() / 60; if (x < 4) x += 24;
  return HOURS.find(o => o.from !== undefined && x >= o.from && x < o.to) || HOURS[4];
}
const IBREV = slug => 'https://www.ibreviary.com/m2/breviario.php?s=' + slug;

/* Bibbia: brani da esplorare */
const BIBLE = [
  ['Genesi 1', 'La creazione'], ['Genesi 22', 'Abramo e Isacco'], ['Esodo 3', 'Il roveto ardente'], ['Esodo 20', 'Il Decalogo'],
  ['1 Re 19', 'Elia e la brezza leggera'], ['Giobbe 38', 'Dio risponde a Giobbe'], ['Salmo 23', 'Il Signore è il mio pastore'], ['Salmo 51', 'Il Miserere'],
  ['Qoèlet 3', 'Un tempo per ogni cosa'], ['Isaia 53', 'Il servo sofferente'], ['Geremia 31', 'La nuova alleanza'], ['Matteo 5', 'Le Beatitudini'],
  ['Matteo 25', 'Il giudizio finale'], ['Luca 10', 'Il buon samaritano'], ['Luca 15', 'Il padre misericordioso'], ['Luca 24', 'I discepoli di Emmaus'],
  ['Giovanni 1', 'Il prologo: in principio era il Verbo'], ['Giovanni 21', 'Pietro, mi ami?'], ['Atti 2', 'La Pentecoste'], ['Romani 8', 'Niente ci separa dall\'amore di Dio'],
  ['1 Corinzi 13', 'L\'inno alla carità'], ['Filippesi 2', 'L\'inno di Cristo che si svuota'], ['Apocalisse 21', 'Cieli nuovi e terra nuova']
];
const FAITH_Q = [
  'Perché Dio permette il male e il dolore?', 'Che cosa vuol dire che Dio è Trinità?', 'Perché la Messa è fatta così?', 'Cosa sono i sacramenti e perché sono sette?',
  'Che cosa significa che Gesù è risorto?', 'Fede e scienza sono in conflitto?', 'Perché pregare se Dio sa già tutto?', 'Come è nata la Bibbia e chi ha scelto i libri?',
  'Chi è Maria e perché la Chiesa la venera?', 'Paradiso, Purgatorio e Inferno: cosa crede davvero la Chiesa?', 'Perché la Chiesa ha i dogmi?', 'Cos\'è la coscienza e come si forma?',
  'Come si fa discernimento su una scelta di vita?', 'Perché l\'anno liturgico ha tempi e colori diversi?', 'Cosa dice la Chiesa su lavoro, ricchezza e poveri?', 'Chi erano i profeti e cosa facevano davvero?'
];

/* fonti autorevoli da consultare, per tema (ricerca dentro il sito) */
const AUTH_SOURCES = {
  'Politica italiana': [['Openpolis', 'openpolis.it'], ['Pagella Politica', 'pagellapolitica.it'], ['Senato', 'senato.it'], ['Camera dei deputati', 'camera.it'], ['Treccani', 'treccani.it']],
  'Esteri e geopolitica': [['ISPI', 'ispionline.it'], ['Limes', 'limesonline.com'], ['Affari Internazionali', 'affarinternazionali.it'], ['Internazionale', 'internazionale.it'], ['Treccani', 'treccani.it']],
  'Economia': [['ISTAT', 'istat.it'], ['Banca d\'Italia', 'bancaditalia.it'], ['lavoce.info', 'lavoce.info'], ['Il Sole 24 Ore', 'ilsole24ore.com'], ['Osservatorio CPI', 'osservatoriocpi.unicatt.it']],
  'Scienza e tecnologia': [['Le Scienze', 'lescienze.it'], ['Il Bo Live (Univ. Padova)', 'ilbolive.unipd.it'], ['INFN', 'infn.it'], ['ASI', 'asi.it'], ['Treccani', 'treccani.it']],
  'Storia': [['Treccani', 'treccani.it'], ['Rai Cultura', 'raicultura.it'], ['Storica National Geographic', 'storicang.it'], ['Internet Archive (libri)', 'archive.org']],
  'Fede e Scrittura': [['Vatican.va', 'vatican.va'], ['Chiesa cattolica italiana', 'chiesacattolica.it'], ['Avvenire', 'avvenire.it'], ['La Civiltà Cattolica', 'laciviltacattolica.it']],
  'Tecnica e ricerca': [['IEEE Spectrum', 'spectrum.ieee.org'], ['arXiv', 'arxiv.org'], ['Le Scienze', 'lescienze.it']],
  'default': [['Treccani', 'treccani.it'], ['Il Post', 'ilpost.it'], ['Internazionale', 'internazionale.it'], ['Rai Cultura', 'raicultura.it']]
};
const siteSearch = (dom, q) => 'https://duckduckgo.com/?q=' + encodeURIComponent('site:' + dom + ' ' + q);

/* serve all'interfaccia per la prima esecuzione: possibilità concrete fuori dallo schermo */
const OUTSIDE = [
  'Cerca un evento culturale gratuito vicino a casa per questo fine settimana',
  'Informati su un\'associazione di volontariato della tua zona e scrivi per chiedere come aiutare',
  'Iscriviti a una conferenza o una lezione aperta all\'università su un tema fuori dal tuo campo',
  'Trova un corso serale o un laboratorio che ti incuriosisce e chiedi informazioni'
];

/* modelli di missione: [testo, sezione da aprire o null] */
const QT = {
  lavoro: {
    main: ['Blocca due ore di lavoro profondo sulla tesi, notifiche spente', 'Leggi un paper dalla sezione Tecnico e scrivi tre punti nel Quaderno', 'Sistema una parte della tesi che rimandi da giorni'],
    side: ['Prepara la lista delle cose di domani', 'Salva nel Quaderno un concetto tecnico che hai capito oggi', 'Rispondi a una mail di lavoro che stai rimandando']
  },
  fede: {
    main: ['Partecipa a una Messa o a un momento di preghiera con altri', 'Fai una Lectio divina sul Vangelo del giorno (Specchio)', 'Dedica un\'ora a un servizio concreto per qualcuno'],
    side: ['Prega i Vespri o la Compieta di oggi (Specchio)', 'Esplora un brano della Bibbia in Specchio', 'Prega per una persona precisa e diglielo, se ti va']
  },
  famiglia: {
    main: ['Passa un\'ora senza telefono con qualcuno di famiglia: cena, passeggiata o un gioco', 'Chiedi a un familiare più grande di raccontarti un episodio della sua giovinezza', 'Organizza qualcosa insieme per il fine settimana'],
    side: ['Chiama un parente che senti poco', 'Fai in casa una cosa che di solito fa un altro', 'Manda una foto o un ricordo a qualcuno di famiglia']
  },
  amici: {
    main: ['Proponi a un amico un\'uscita concreta, con giorno e ora', 'Invita qualcuno a provare con te una cosa nuova', 'Vai a un evento dove conosci poche persone', 'Proponi un\'attività di volontariato da fare insieme a un amico'],
    side: ['Scrivi a un amico che non senti da mesi', 'Di\' a qualcuno cosa apprezzi di lui', 'Chiedi a un amico come sta davvero, e ascolta']
  },
  corpo: {
    main: ['Cammina o pedala almeno 45 minuti all\'aperto', 'Stasera a letto entro mezzanotte, telefono fuori dalla camera', 'Cucina un pasto vero, con calma'],
    side: ['Dieci minuti di stretching', 'Fai le scale invece dell\'ascensore per tutto il giorno', 'Un esercizio di respiro (Specchio)']
  },
  mondo: {
    main: ['Completa una lezione su una notizia (Notizie)', 'Prendi una notizia e risali la sua storia fino a un evento di almeno 50 anni fa', 'Confronta come due fonti diverse raccontano lo stesso fatto'],
    side: ['Leggi tre notizie e salva un concetto nel Quaderno', 'Usa «Capire» su una notizia che non ti è chiara', 'Ascolta un podcast di attualità mentre fai altro']
  },
  scoperta: {
    main: ['Esplora un argomento mai visto in Scopri e seguilo per tre rami', 'Prova con le mani una cosa nuova: un disegno, un piatto, un lavoretto', 'Vai in un luogo vicino a casa dove non sei mai entrato', 'Cerca un corso, un laboratorio o un\'associazione su una tua passione e chiedi informazioni'],
    side: ['Apri la proposta del giorno in Scopri', 'Segna come preferito un argomento che ti ha incuriosito', 'Scrivi una domanda a cui vorresti una risposta']
  }
};

/* catalogo di partenza: id, nome, categoria, voce Wikipedia, gancio, rami */
const CATS = ['Cielo e Terra', 'Vita', 'Mente', 'Storia', 'Società', 'Arte', 'Mani', 'Spirito', 'Tecnica', 'Gioco', 'Scoperti'];
/* c: categoria · w: voce Wikipedia · r: argomenti collegati */
const TOPICS = [
  ['astronomia', 'Astronomia a occhio nudo', 'Cielo e Terra', 'Astronomia', 'Con un cielo buio vedi la Via Lattea, pianeti e satelliti che passano. Basta sapere dove guardare.', ['radioastronomia', 'cartografia', 'meteorologia']],
  ['radioastronomia', 'Radioastronomia', 'Cielo e Terra', 'Radioastronomia', 'L\'universo visto con le antenne: lo stesso mestiere delle tue onde, puntato verso il cielo.', ['astronomia', 'radioamatori', 'teoria-info']],
  ['meteorologia', 'Meteorologia', 'Cielo e Terra', 'Meteorologia', 'Perché domani piove? Fronti, pressione e nuvole raccontano una storia che si impara a leggere.', ['astronomia', 'vulcani', 'escursionismo']],
  ['vulcani', 'Vulcani', 'Cielo e Terra', 'Vulcano', 'L\'Italia ne è piena: dall\'Etna ai Campi Flegrei, la Terra che respira sotto i piedi.', ['meteorologia', 'archeologia', 'etruschi']],
  ['funghi', 'Funghi', 'Vita', 'Fungi', 'Né piante né animali: reti sotterranee che collegano interi boschi.', ['bosco', 'cucina-toscana', 'evoluzione']],
  ['bosco', 'Leggere un bosco', 'Vita', 'Bosco', 'Ogni albero racconta il terreno, il clima e la storia del luogo. Una passeggiata diventa un\'indagine.', ['funghi', 'birdwatching', 'escursionismo']],
  ['birdwatching', 'Birdwatching', 'Vita', 'Birdwatching', 'Riconoscere gli uccelli dal canto: un passatempo che allena l\'attenzione e si fa anche dalla finestra.', ['bosco', 'evoluzione', 'fotografia']],
  ['evoluzione', 'Evoluzione', 'Vita', 'Evoluzione', 'Come piccole differenze, in tempi lunghissimi, costruiscono occhi, ali e cervelli.', ['funghi', 'neuroscienze', 'storia-scienza']],
  ['neuroscienze', 'Neuroscienze', 'Mente', 'Neuroscienze', 'Cosa succede nel cervello quando impari, ricordi o ti distrai.', ['psicologia-cognitiva', 'evoluzione', 'meditazione']],
  ['psicologia-cognitiva', 'Errori del pensiero', 'Mente', 'Bias cognitivo', 'I trucchi che la mente ci gioca: utile per non farsi prendere in giro da pubblicità e politica.', ['economia-comportamentale', 'retorica', 'neuroscienze']],
  ['economia-comportamentale', 'Economia comportamentale', 'Mente', 'Economia comportamentale', 'Perché non siamo razionali quando spendiamo, scegliamo o rimandiamo.', ['psicologia-cognitiva', 'teoria-giochi', 'geopolitica']],
  ['stoicismo', 'Stoicismo', 'Mente', 'Stoicismo', 'Filosofia pratica di duemila anni fa: distinguere ciò che dipende da te da ciò che non dipende.', ['padri-chiesa', 'retorica', 'meditazione']],
  ['etruschi', 'Etruschi', 'Storia', 'Etruschi', 'Prima di Roma, la Toscana era loro. Città, tombe dipinte e una lingua ancora in parte misteriosa.', ['archeologia', 'storia-firenze', 'vulcani']],
  ['archeologia', 'Archeologia', 'Storia', 'Archeologia', 'Ricostruire vite intere da un coccio e uno strato di terra.', ['etruschi', 'cartografia', 'storia-scienza']],
  ['storia-firenze', 'Storia di Firenze', 'Storia', 'Storia di Firenze', 'Banchieri, artisti, guerre di fazione: la città che ha inventato tanto del mondo moderno.', ['rinascimento', 'dante', 'etruschi']],
  ['rinascimento', 'Rinascimento', 'Storia', 'Rinascimento', 'Quando arte, scienza e denaro si incontrarono e cambiarono il modo di vedere l\'uomo.', ['storia-firenze', 'prospettiva', 'storia-scienza']],
  ['guerra-fredda', 'Guerra fredda', 'Storia', 'Guerra fredda', 'Quarant\'anni di mondo diviso in due: serve per capire tanto della politica di oggi.', ['geopolitica', 'storia-ue', 'crittografia']],
  ['storia-ue', 'Storia dell\'Unione europea', 'Società', 'Storia dell\'integrazione europea', 'Da carbone e acciaio alla moneta unica: come e perché è nata l\'Europa unita.', ['geopolitica', 'guerra-fredda', 'costituzione']],
  ['geopolitica', 'Geopolitica', 'Società', 'Geopolitica', 'Mappe, risorse e confini spiegano molte notizie meglio delle dichiarazioni.', ['guerra-fredda', 'storia-ue', 'cartografia']],
  ['costituzione', 'La Costituzione italiana', 'Società', 'Costituzione della Repubblica Italiana', 'Il patto del 1948: come è nato, cosa dice e perché è costruito così.', ['storia-ue', 'retorica', 'la-pira']],
  ['la-pira', 'Giorgio La Pira', 'Spirito', 'Giorgio La Pira', 'Sindaco di Firenze, costituente, uomo di fede: un modo di fare politica partendo dai poveri.', ['costituzione', 'storia-firenze', 'dottrina-sociale']],
  ['dottrina-sociale', 'Dottrina sociale della Chiesa', 'Spirito', 'Dottrina sociale della Chiesa', 'Cosa dice la Chiesa su lavoro, economia e bene comune, dalla Rerum Novarum a oggi.', ['la-pira', 'economia-comportamentale', 'padri-chiesa']],
  ['padri-chiesa', 'Padri della Chiesa', 'Spirito', 'Padri della Chiesa', 'I primi grandi pensatori cristiani: Agostino, Basilio, Girolamo e le loro domande ancora attuali.', ['monachesimo', 'stoicismo', 'dottrina-sociale']],
  ['monachesimo', 'Monachesimo', 'Spirito', 'Monachesimo', 'Ora et labora: come i monasteri hanno custodito libri, saperi e un ritmo di vita.', ['padri-chiesa', 'meditazione', 'calligrafia']],
  ['meditazione', 'Meditazione cristiana', 'Spirito', 'Meditazione cristiana', 'Lectio divina, preghiera del cuore, silenzio: pratiche antiche per fermarsi.', ['monachesimo', 'neuroscienze', 'stoicismo']],
  ['dante', 'Dante Alighieri', 'Arte', 'Dante Alighieri', 'Un viaggio nell\'aldilà che è anche una mappa della politica e dell\'anima del suo tempo.', ['storia-firenze', 'retorica', 'padri-chiesa']],
  ['prospettiva', 'Prospettiva', 'Arte', 'Prospettiva', 'Brunelleschi e la geometria per ingannare l\'occhio: arte e matematica insieme.', ['rinascimento', 'fotografia', 'cartografia']],
  ['fotografia', 'Fotografia', 'Arte', 'Fotografia', 'Luce, tempo e composizione: impari a vedere prima ancora di scattare.', ['prospettiva', 'birdwatching', 'astronomia']],
  ['jazz', 'Jazz', 'Arte', 'Jazz', 'Musica nata dall\'improvvisazione: regole precise per poter essere liberi.', ['musica-barocca', 'teoria-info', 'retorica']],
  ['musica-barocca', 'Musica barocca', 'Arte', 'Musica barocca', 'Bach, Vivaldi e la musica come architettura di suoni.', ['jazz', 'monachesimo', 'rinascimento']],
  ['calligrafia', 'Calligrafia', 'Mani', 'Calligrafia', 'Scrivere come un\'arte: lenta, concentrata, quasi meditativa.', ['monachesimo', 'origami', 'prospettiva']],
  ['origami', 'Origami', 'Mani', 'Origami', 'Un foglio, nessuna forbice: e dietro c\'è matematica usata perfino per i satelliti.', ['calligrafia', 'falegnameria', 'teoria-giochi']],
  ['falegnameria', 'Falegnameria', 'Mani', 'Falegnameria', 'Costruire un oggetto che dura anni con le proprie mani.', ['origami', 'bosco', 'elettronica-diy']],
  ['cucina-toscana', 'Cucina toscana', 'Mani', 'Cucina toscana', 'Cucina povera e geniale: ogni piatto ha una storia contadina.', ['funghi', 'storia-firenze', 'etruschi']],
  ['elettronica-diy', 'Elettronica fai-da-te', 'Tecnica', 'Arduino', 'Sensori, microcontrollori e piccoli progetti per casa: l\'ingegneria come gioco.', ['radioamatori', 'falegnameria', 'teoria-info']],
  ['radioamatori', 'Radioamatori', 'Tecnica', 'Radioamatore', 'Parlare con l\'altra parte del mondo con un\'antenna fatta in casa.', ['radioastronomia', 'elettronica-diy', 'crittografia']],
  ['crittografia', 'Crittografia', 'Tecnica', 'Crittografia', 'Dai cifrari di Cesare alla macchina Enigma, fino ai messaggi sul tuo telefono.', ['teoria-info', 'guerra-fredda', 'teoria-giochi']],
  ['teoria-info', 'Teoria dell\'informazione', 'Tecnica', 'Teoria dell\'informazione', 'Shannon e l\'idea che l\'informazione si possa misurare: la base di ogni comunicazione.', ['crittografia', 'radioamatori', 'jazz']],
  ['storia-scienza', 'Storia della scienza', 'Tecnica', 'Storia della scienza', 'Le idee giuste arrivate tardi e quelle sbagliate che sembravano ovvie.', ['rinascimento', 'evoluzione', 'archeologia']],
  ['cartografia', 'Cartografia', 'Cielo e Terra', 'Cartografia', 'Ogni mappa è una scelta: cosa mostrare, cosa nascondere, da che punto di vista.', ['geopolitica', 'escursionismo', 'prospettiva']],
  ['escursionismo', 'Escursionismo', 'Gioco', 'Escursionismo', 'Sentieri, dislivelli e mappe: l\'Appennino a due passi da casa.', ['bosco', 'cartografia', 'meteorologia']],
  ['scacchi', 'Scacchi', 'Gioco', 'Scacchi', 'Un gioco antico che allena la pazienza e il pensiero a più mosse.', ['teoria-giochi', 'psicologia-cognitiva', 'storia-scienza']],
  ['teoria-giochi', 'Teoria dei giochi', 'Gioco', 'Teoria dei giochi', 'La matematica delle scelte quando gli altri scelgono con te: dalla guerra al mercato.', ['scacchi', 'economia-comportamentale', 'geopolitica']],
  ['retorica', 'Retorica', 'Società', 'Retorica', 'L\'arte di convincere: impararla serve a parlare meglio e a difendersi da chi la usa.', ['psicologia-cognitiva', 'dante', 'costituzione']]
].map(([id, n, c, w, hk, r]) => ({ id, n, c, w, hk, r }));
const TOP = Object.fromEntries(TOPICS.map(t => [t.id, t]));

const GUIDES = {
  lectio: { n: 'Lectio divina', area: 'fede', intro: 'Prendi il Vangelo del giorno o un brano che ami. Quattro tempi, senza fretta.', steps: [
    ['Lectio · leggere', 'Leggi il brano lentamente, anche due volte. Nota una parola o una frase che ti colpisce.', 180],
    ['Meditatio · meditare', 'Ripeti dentro di te quella parola. Cosa dice della tua vita, oggi?', 240],
    ['Oratio · pregare', 'Rispondi a Dio con parole tue: un grazie, una richiesta, una fatica.', 180],
    ['Contemplatio · restare', 'Resta in silenzio, senza dover dire o capire altro.', 180]] },
  examen: { n: 'Esame di coscienza', area: 'fede', intro: 'L\'esame di sant\'Ignazio: cinque passi per rileggere la giornata, la sera.', steps: [
    ['Presenza', 'Fermati e ricordati che non sei solo davanti alla tua giornata.', 60],
    ['Gratitudine', 'Ripensa a tre cose belle di oggi, anche piccole. Ringrazia.', 120],
    ['Rilettura', 'Ripercorri la giornata come un film. Dove ti sei sentito vivo? Dove ti sei spento?', 180],
    ['Perdono', 'Guarda con onestà cosa non è andato. Chiedi perdono, senza processarti.', 120],
    ['Domani', 'Scegli una cosa concreta per domani.', 60]] },
  respiro: { n: 'Respiro', area: 'corpo', intro: 'Inspira 4 secondi, trattieni 4, espira 6. Bastano pochi minuti per calmare il corpo.', breath: true }
};

const BUILTIN_LESSONS = {
  'stato-italiano': {
    id: 'stato-italiano', title: 'Dal voto al governo: come funziona lo Stato italiano', area: 'mondo', kind: 'notizia',
    summary: 'La base per leggere qualsiasi notizia sulle elezioni: chi votiamo, chi fa cosa e come nasce un governo.',
    tags: ['costituzione', 'politica italiana'],
    chapters: [
      { label: 'Capire', title: 'Votiamo un Parlamento, non un governo', depth: 'assaggio', blocks: [
        { type: 'text', md: 'L\'Italia è una **repubblica parlamentare**. Alle elezioni politiche i cittadini non eleggono il governo: eleggono il **Parlamento**, formato da due Camere.\n\nIl governo nasce dopo e resta in carica solo finché ha la **fiducia** di entrambe le Camere. Per questo si parla di «maggioranza»: senza la metà più uno dei voti, un governo non può partire.\n\nDal 2022, dopo il referendum del 2020 sul taglio dei parlamentari, i seggi elettivi sono **400 alla Camera** e **200 al Senato** (prima erano 630 e 315). Al Senato siedono anche alcuni senatori a vita.' },
        { type: 'seats', title: 'Prova: quanti voti servono?', chambers: [{ name: 'Camera · 400', seats: 400 }, { name: 'Senato · 200 elettivi', seats: 200 }], note: 'La maggioranza assoluta è la metà più uno dei componenti. Al Senato contano anche i senatori a vita, quindi la soglia reale può essere un po\' più alta.' },
        { type: 'quiz', q: 'Alle elezioni politiche, chi eleggono direttamente i cittadini?', options: ['Il Presidente del Consiglio', 'Deputati e senatori', 'Il Presidente della Repubblica'], correct: 1, explain: 'Si eleggono le due Camere. Il Presidente del Consiglio viene nominato dal Presidente della Repubblica e deve ottenere la fiducia del Parlamento. Il Presidente della Repubblica lo elegge il Parlamento.' }
      ] },
      { label: 'Capire', title: 'Chi fa cosa', depth: 'assaggio', blocks: [
        { type: 'steps', title: 'I quattro protagonisti', items: [
          { title: 'Parlamento: fa le leggi', text: 'Camera e Senato hanno gli stessi poteri (bicameralismo paritario): ogni legge deve essere approvata da entrambe nello stesso testo. Il Parlamento dà e toglie la fiducia al governo e lo controlla.' },
          { title: 'Governo: governa e attua', text: 'È formato dal Presidente del Consiglio e dai ministri, che insieme sono il Consiglio dei ministri. Propone leggi e in casi urgenti può fare decreti-legge, che però decadono se il Parlamento non li converte in legge entro 60 giorni.' },
          { title: 'Presidente del Consiglio: dirige e coordina', text: 'Guida la politica generale del governo e ne è responsabile. Non è un «capo» con poteri propri molto forti: coordina i ministri e risponde al Parlamento.' },
          { title: 'Presidente della Repubblica: arbitro e garante', text: 'Capo dello Stato, rappresenta l\'unità nazionale. Nomina il Presidente del Consiglio e, su sua proposta, i ministri; promulga le leggi e può rinviarle una volta alle Camere; può sciogliere le Camere; presiede il Consiglio superiore della magistratura; nomina cinque giudici costituzionali.' },
          { title: 'Corte costituzionale: controlla le regole', text: 'Quindici giudici che verificano se le leggi rispettano la Costituzione. Possono cancellare norme incostituzionali, anche leggi elettorali, come è successo nel 2014 e nel 2017.' }
        ] },
        { type: 'quiz', q: 'Un decreto-legge del governo non viene convertito dal Parlamento entro 60 giorni. Cosa succede?', options: ['Diventa legge automaticamente', 'Perde efficacia dall\'inizio', 'Decide il Presidente della Repubblica'], correct: 1, explain: 'Lo dice l\'articolo 77 della Costituzione: il decreto non convertito perde efficacia fin dall\'inizio. È uno dei contrappesi al potere del governo.' }
      ] },
      { label: 'Capire', title: 'Dal voto al giuramento', depth: 'assaggio', blocks: [
        { type: 'steps', title: 'Come nasce un governo', items: [
          { title: 'Si vota', text: 'Gli elettori scelgono deputati e senatori con la legge elettorale in vigore. Il risultato dice quali partiti o coalizioni hanno più seggi, ma non nomina ancora nessun governo.' },
          { title: 'Si riuniscono le Camere', text: 'La prima seduta avviene entro 20 giorni dalle elezioni. Le Camere eleggono i loro presidenti e i parlamentari si organizzano in gruppi.' },
          { title: 'Consultazioni al Quirinale', text: 'Il Presidente della Repubblica incontra i presidenti delle Camere, gli ex Presidenti e le delegazioni dei gruppi parlamentari per capire quale maggioranza è possibile.' },
          { title: 'Incarico', text: 'Il Presidente conferisce l\'incarico a una persona che pensa possa ottenere la fiducia. Di solito accetta «con riserva» per verificare i numeri e la squadra.' },
          { title: 'Nomina e giuramento', text: 'Sciolta la riserva, l\'incaricato presenta la lista dei ministri. Il Presidente della Repubblica nomina il governo, che giura al Quirinale.' },
          { title: 'Fiducia', text: 'Entro 10 giorni dalla formazione il governo si presenta a entrambe le Camere e chiede la fiducia. Solo con la fiducia di tutte e due può governare pienamente.' }
        ] },
        { type: 'reflect', prompt: 'In questo percorso, dove vedi il punto in cui contano di più gli accordi tra partiti rispetto al voto dei cittadini? È un pregio o un difetto?' }
      ] },
      { label: 'Approfondire', title: 'Come si elegge il Presidente della Repubblica', depth: 'profondo', blocks: [
        { type: 'text', md: 'Il Presidente della Repubblica resta in carica **7 anni**. Lo eleggono deputati e senatori in seduta comune, insieme a **58 delegati delle Regioni**: sono i cosiddetti «grandi elettori».\n\nIl voto è segreto e si fanno più scrutini. Nei primi tre serve una maggioranza molto ampia, poi la soglia scende. L\'idea dei costituenti era chiara: il garante di tutti non deve essere scelto dalla sola maggioranza di governo, almeno all\'inizio.' },
        { type: 'slider', title: 'Muovi lo scrutinio', label: 'Scrutinio numero', min: 1, max: 8, step: 1, value: 1, vars: { N: 658 },
          outputs: [{ label: 'Voti necessari', expr: 'x <= 3 ? ceil(N*2/3) : floor(N/2)+1' }, { label: 'Quota dei grandi elettori', expr: 'x <= 3 ? 66.7 : 50', unit: '%' }],
          note: 'Grandi elettori stimati: 400 deputati + 200 senatori + 58 delegati regionali = 658, più i senatori a vita in carica, quindi il numero esatto cambia di poco.' },
        { type: 'text', md: 'Negli ultimi sei mesi del mandato, il cosiddetto **semestre bianco**, il Presidente non può sciogliere le Camere. Serve a evitare che usi questo potere per influenzare chi lo sostituirà.' }
      ] },
      { label: 'Approfondire', title: 'Cosa sta cambiando', depth: 'assaggio', blocks: [
        { type: 'text', md: 'Le regole del voto non sono fisse. Nell\'**ottobre 2026** il Parlamento ha approvato in via definitiva una **nuova legge elettorale**. È in discussione anche una riforma costituzionale per l\'**elezione diretta del Presidente del Consiglio** (il «premierato»), che ha ricevuto un primo sì dal Senato.\n\nUna riforma costituzionale richiede due votazioni per ciascuna Camera a distanza di almeno tre mesi. Se nella seconda non si arriva ai due terzi, si può chiedere un referendum confermativo.\n\nQuesti sono temi su cui le forze politiche hanno posizioni molto diverse. Per un quadro completo conviene una lezione dedicata, con le ragioni dei favorevoli e dei contrari.' },
        { type: 'links', title: 'Fonti per seguire', items: [
          { title: 'Costituzione, testo completo (Senato)', url: 'https://www.senato.it/istituzione/la-costituzione', note: 'Il testo originale, articolo per articolo.' },
          { title: 'Openpolis: dati su Parlamento e voti', url: 'https://www.openpolis.it/', note: 'Presenze, votazioni e attività dei parlamentari.' },
          { title: 'Pagella Politica: verifica delle dichiarazioni', url: 'https://pagellapolitica.it/', note: 'Fact-checking delle affermazioni dei politici.' }
        ] }
      ] },
      { label: 'Storia', title: 'Perché lo Stato è costruito così', depth: 'profondo', blocks: [
        { type: 'timeline', title: 'Le tappe', events: [
          { year: '1946', title: 'Referendum e Assemblea costituente', text: 'Il 2 giugno gli italiani, e per la prima volta a livello nazionale anche le italiane, scelgono la Repubblica ed eleggono l\'Assemblea che scriverà la Costituzione.' },
          { year: '1948', title: 'Entra in vigore la Costituzione', text: 'Il 1° gennaio. Dopo il fascismo i costituenti distribuiscono il potere tra molti organi che si controllano a vicenda: nessuno deve poter decidere da solo.' },
          { year: '1993', title: 'Referendum e sistema maggioritario', text: 'Dopo Tangentopoli, un referendum spinge verso il maggioritario. La nuova legge elettorale, detta «Mattarellum», assegna tre quarti dei seggi in collegi uninominali.' },
          { year: '2005', title: 'Torna il proporzionale con premio', text: 'La legge detta «Porcellum» introduce liste bloccate e un premio di maggioranza. Nel 2014 la Corte costituzionale ne boccia parti importanti.' },
          { year: '2016', title: 'Il referendum sulla riforma del Senato', text: 'Una riforma che avrebbe superato il bicameralismo paritario viene respinta dagli elettori con circa il 59% di no.' },
          { year: '2017', title: 'Il «Rosatellum»', text: 'Sistema misto: circa un terzo dei seggi in collegi uninominali, il resto con il proporzionale. Si è usato nelle elezioni del 2018 e del 2022.' },
          { year: '2020', title: 'Taglio dei parlamentari', text: 'Un referendum conferma la riduzione da 945 a 600 parlamentari elettivi, applicata dalle elezioni del 2022.' },
          { year: '2026', title: 'Nuova legge elettorale', text: 'Approvata in via definitiva in ottobre. Il premierato è ancora in discussione.' }
        ] },
        { type: 'compare', title: 'Esecutivo forte o contrappesi forti?', left: { title: 'Perché i costituenti limitarono il governo', points: ['Uscivano da vent\'anni di dittatura nata dentro le istituzioni', 'Volevano che le minoranze contassero', 'Preferivano governi meno stabili a un potere concentrato'] }, right: { title: 'Perché oggi molti chiedono più stabilità', points: ['Dal 1948 i governi sono durati in media poco più di un anno', 'Governi brevi faticano a fare riforme di lungo periodo', 'Gli elettori vogliono sapere chi governerà quando votano'] }, common: ['Entrambe le posizioni cercano un governo che risponda ai cittadini', 'Il punto di disaccordo è quanto potere dare a chi vince'] }
      ] },
      { label: 'Futuro', title: 'Cosa potrebbe succedere', depth: 'profondo', blocks: [
        { type: 'text', md: 'Un precedente utile: **Israele** ha eletto direttamente il primo ministro alle elezioni del 1996, 1999 e 2001, e poi ha abolito il sistema. Secondo molti studiosi aveva frammentato ancora di più il parlamento.\n\nNon vuol dire che succederebbe lo stesso in Italia: sistemi elettorali e partiti sono diversi. Però mostra che una regola pensata per dare stabilità può avere effetti inattesi.' },
        { type: 'compare', title: 'Due scenari da pesare', left: { title: 'Se i governi diventano più forti', points: ['Più facile fare riforme lunghe', 'Responsabilità più chiara di chi governa', 'Rischio: meno spazio per controlli e minoranze'] }, right: { title: 'Se restano i contrappesi attuali', points: ['Equilibrio tra poteri più protetto', 'Più mediazione tra forze diverse', 'Rischio: governi brevi e decisioni rimandate'] } },
        { type: 'reflect', prompt: 'Pensando alla storia che hai visto, quale rischio ti preoccupa di più: un governo troppo debole o uno troppo forte? Perché?' }
      ] }
    ],
    cards: [
      { q: 'Alle elezioni politiche gli italiani eleggono direttamente il governo?', a: 'No. Eleggono Camera e Senato; il governo nasce dopo e deve avere la fiducia di entrambe.' },
      { q: 'Quanti sono i parlamentari elettivi dal 2022?', a: '400 deputati e 200 senatori, più i senatori a vita.' },
      { q: 'Entro quando il Parlamento deve convertire un decreto-legge?', a: 'Entro 60 giorni, altrimenti perde efficacia fin dall\'inizio.' },
      { q: 'Entro quanto un nuovo governo chiede la fiducia?', a: 'Entro 10 giorni dalla formazione, a entrambe le Camere.' },
      { q: 'Che maggioranza serve per eleggere il Presidente della Repubblica?', a: 'Due terzi dei grandi elettori nei primi tre scrutini, poi la maggioranza assoluta.' },
      { q: 'Cos\'è il semestre bianco?', a: 'Gli ultimi sei mesi del mandato del Presidente della Repubblica, in cui non può sciogliere le Camere.' }
    ]
  }
};

