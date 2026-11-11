"use strict";
/* ======================================================================
   ULISSE · contesto geografico senza IA
   Riconosce nel testo Stati, aggettivi e leader, li mette sulla mappa e
   mostra le alleanze rilevanti con una legenda. Dati statici e verificabili.
   ====================================================================== */

/* [nome italiano, nome inglese (confini), lat, lon, varianti/aggettivi] */
const COUNTRIES = [
  ['Italia', 'Italy', 41.9, 12.5, 'italian'], ['Stati Uniti', 'United States of America', 38.9, -77.0, 'usa|americ|statunitens|casa bianca|washington|pentagono'],
  ['Israele', 'Israel', 31.8, 35.2, 'israel|tel aviv|gerusalemme|idf'], ['Palestina', 'Palestine', 31.9, 35.2, 'palestin|cisgiordani|ramallah|gaza|hamas'],
  ['Iran', 'Iran', 35.7, 51.4, 'iran|teheran|pasdaran'], ['Libano', 'Lebanon', 33.9, 35.5, 'liban|beirut|hezbollah'], ['Siria', 'Syria', 33.5, 36.3, 'siria|siriano|damasco'],
  ['Giordania', 'Jordan', 31.9, 35.9, 'giordan|amman'], ['Egitto', 'Egypt', 30.0, 31.2, 'egitt|cairo'], ['Arabia Saudita', 'Saudi Arabia', 24.7, 46.7, 'saudit|riad'],
  ['Emirati Arabi Uniti', 'United Arab Emirates', 24.5, 54.4, 'emirat|abu dhabi|dubai'], ['Qatar', 'Qatar', 25.3, 51.5, 'qatar|doha'], ['Yemen', 'Yemen', 15.4, 44.2, 'yemen|houthi|huthi'],
  ['Iraq', 'Iraq', 33.3, 44.4, 'iraq|baghdad'], ['Turchia', 'Turkey', 39.9, 32.9, 'turchi|ankara|istanbul|erdogan'], ['Russia', 'Russia', 55.75, 37.6, 'russ|mosca|cremlino|putin'],
  ['Ucraina', 'Ukraine', 50.45, 30.5, 'ucrain|kiev|kyiv|zelensk'], ['Bielorussia', 'Belarus', 53.9, 27.6, 'bielorus|minsk|lukashenk'], ['Cina', 'China', 39.9, 116.4, 'cina\\b|cines|pechino|xi jinping'],
  ['Taiwan', 'Taiwan', 25.0, 121.5, 'taiwan|taipei'], ['Giappone', 'Japan', 35.7, 139.7, 'giappon|tokyo'], ['Corea del Sud', 'South Korea', 37.6, 127.0, 'corea del sud|sudcorean|seul'],
  ['Corea del Nord', 'North Korea', 39.0, 125.75, 'corea del nord|nordcorean|pyongyang|kim jong'], ['India', 'India', 28.6, 77.2, 'india\\b|indian|nuova delhi|modi\\b'], ['Pakistan', 'Pakistan', 33.7, 73.1, 'pakistan|islamabad'],
  ['Afghanistan', 'Afghanistan', 34.5, 69.2, 'afghan|kabul|talebani'], ['Regno Unito', 'United Kingdom', 51.5, -0.1, 'regno unito|britannic|londra|inglese|starmer'], ['Francia', 'France', 48.85, 2.35, 'franc[ei]a?\\b|frances|parigi|eliseo|macron'],
  ['Germania', 'Germany', 52.5, 13.4, 'german|tedesc|berlino|merz'], ['Spagna', 'Spain', 40.4, -3.7, 'spagn|madrid'], ['Polonia', 'Poland', 52.2, 21.0, 'polac|polonia|varsavia'],
  ['Ungheria', 'Hungary', 47.5, 19.0, 'ungher|budapest|orb[aá]n'], ['Grecia', 'Greece', 37.98, 23.7, 'greci|atene'], ['Paesi Bassi', 'Netherlands', 52.37, 4.9, 'olanda|olandes|paesi bassi|amsterdam|aia\\b'],
  ['Belgio', 'Belgium', 50.85, 4.35, 'belg|bruxelles'], ['Svezia', 'Sweden', 59.3, 18.1, 'svezi|svedes|stoccolma'], ['Finlandia', 'Finland', 60.2, 24.9, 'finland|helsinki'],
  ['Norvegia', 'Norway', 59.9, 10.75, 'norveg|oslo'], ['Danimarca', 'Denmark', 55.7, 12.6, 'danimarc|danes|copenaghen'], ['Groenlandia', 'Greenland', 64.2, -51.7, 'groenland'],
  ['Romania', 'Romania', 44.4, 26.1, 'romen|romania|bucarest'], ['Serbia', 'Serbia', 44.8, 20.5, 'serbi|belgrado'], ['Kosovo', 'Kosovo', 42.7, 21.2, 'kosovo|pristina'],
  ['Moldavia', 'Moldova', 47.0, 28.85, 'moldav|chisinau'], ['Georgia', 'Georgia', 41.7, 44.8, 'georgia\\b|tbilisi'], ['Armenia', 'Armenia', 40.2, 44.5, 'armen|erevan'], ['Azerbaigian', 'Azerbaijan', 40.4, 49.9, 'azer|baku'],
  ['Canada', 'Canada', 45.4, -75.7, 'canad|ottawa'], ['Messico', 'Mexico', 19.4, -99.1, 'messic'], ['Venezuela', 'Venezuela', 10.5, -66.9, 'venezuel|caracas|maduro'],
  ['Cuba', 'Cuba', 23.1, -82.4, 'cuba|avana'], ['Brasile', 'Brazil', -15.8, -47.9, 'brasil|lula'], ['Argentina', 'Argentina', -34.6, -58.4, 'argentin|buenos aires|milei'],
  ['Libia', 'Libya', 32.9, 13.2, 'libia|libic|tripoli|bengasi'], ['Tunisia', 'Tunisia', 36.8, 10.2, 'tunisi'], ['Marocco', 'Morocco', 34.0, -6.8, 'marocc|rabat'],
  ['Algeria', 'Algeria', 36.75, 3.05, 'alger'], ['Sudan', 'Sudan', 15.5, 32.5, 'sudan\\b|khartoum'], ['Etiopia', 'Ethiopia', 9.0, 38.75, 'etiop|addis abeba'],
  ['Nigeria', 'Nigeria', 9.06, 7.5, 'nigeria'], ['Sudafrica', 'South Africa', -25.75, 28.2, 'sudafric'], ['Australia', 'Australia', -35.3, 149.1, 'australi'],
  ['Vaticano', null, 41.9, 12.45, 'vatican|santa sede|papa leone|pontefice']
].map(([n, en, lat, lon, re]) => ({ n, en, lat, lon, rx: new RegExp('(^|[^a-zà-ù])(' + re + ')', 'i') }));

/* persone che indicano un Paese anche quando il Paese non è nominato */
const LEADERS = { trump: 'Stati Uniti', vance: 'Stati Uniti', rubio: 'Stati Uniti', netanyahu: 'Israele', putin: 'Russia', lavrov: 'Russia', zelensky: 'Ucraina', 'xi jinping': 'Cina', meloni: 'Italia', tajani: 'Italia', mattarella: 'Italia', erdogan: 'Turchia', macron: 'Francia', merz: 'Germania', starmer: 'Regno Unito', khamenei: 'Iran', pezeshkian: 'Iran', modi: 'India', 'bin salman': 'Arabia Saudita', 'kim jong': 'Corea del Nord', 'al-sisi': 'Egitto', orban: 'Ungheria', 'von der leyen': 'Belgio', sanchez: 'Spagna', lula: 'Brasile', milei: 'Argentina', maduro: 'Venezuela', 'al-sharaa': 'Siria' };

/* alleanze e schieramenti (membri principali; nomi inglesi dei confini) */
const ALLIANCES = [
  { name: 'NATO', desc: 'Alleanza militare atlantica: difesa reciproca tra Stati Uniti, Canada e gran parte dell\'Europa.', m: ['United States of America', 'Canada', 'United Kingdom', 'France', 'Germany', 'Italy', 'Spain', 'Poland', 'Netherlands', 'Belgium', 'Norway', 'Denmark', 'Greece', 'Turkey', 'Romania', 'Hungary', 'Finland', 'Sweden', 'Portugal', 'Czechia', 'Slovakia', 'Bulgaria', 'Croatia', 'Slovenia', 'Albania', 'Estonia', 'Latvia', 'Lithuania', 'Luxembourg', 'Iceland', 'Montenegro', 'North Macedonia'] },
  { name: 'Unione europea', desc: '27 Stati con mercato unico e istituzioni comuni (Commissione, Parlamento, Consiglio).', m: ['Italy', 'France', 'Germany', 'Spain', 'Poland', 'Netherlands', 'Belgium', 'Greece', 'Romania', 'Hungary', 'Finland', 'Sweden', 'Denmark', 'Portugal', 'Austria', 'Ireland', 'Czechia', 'Slovakia', 'Bulgaria', 'Croatia', 'Slovenia', 'Estonia', 'Latvia', 'Lithuania', 'Luxembourg', 'Cyprus', 'Malta'] },
  { name: 'Asse della resistenza', desc: 'Rete di alleati dell\'Iran ostili a Israele e Stati Uniti: Hezbollah in Libano, gli Houthi in Yemen, milizie in Iraq, Hamas a Gaza.', m: ['Iran', 'Lebanon', 'Yemen', 'Iraq', 'Palestine'] },
  { name: 'Accordi di Abramo', desc: 'Accordi del 2020 che hanno normalizzato i rapporti tra Israele e alcuni Paesi arabi, con la mediazione degli Stati Uniti.', m: ['Israel', 'United Arab Emirates', 'Bahrain', 'Morocco', 'Sudan', 'United States of America'] },
  { name: 'BRICS', desc: 'Gruppo di economie emergenti che cerca più peso rispetto all\'Occidente.', m: ['Brazil', 'Russia', 'India', 'China', 'South Africa', 'Egypt', 'Ethiopia', 'Iran', 'United Arab Emirates', 'Indonesia'] },
  { name: 'Russia e alleati stretti', desc: 'Paesi più vicini a Mosca sul piano militare e politico.', m: ['Russia', 'Belarus', 'North Korea', 'Iran'] },
  { name: 'Alleati degli USA in Asia', desc: 'Paesi legati agli Stati Uniti da trattati di difesa nel Pacifico.', m: ['Japan', 'South Korea', 'Australia', 'Philippines', 'Taiwan'] },
  { name: 'Lega araba', desc: 'Organizzazione dei Paesi arabi del Medio Oriente e del Nord Africa.', m: ['Egypt', 'Saudi Arabia', 'United Arab Emirates', 'Qatar', 'Jordan', 'Lebanon', 'Syria', 'Iraq', 'Yemen', 'Libya', 'Tunisia', 'Algeria', 'Morocco', 'Sudan', 'Palestine', 'Kuwait', 'Oman', 'Bahrain'] }
];

function detectCountries(text) {
  const t = ' ' + String(text || '').toLowerCase() + ' ';
  const hits = {};
  for (const c of COUNTRIES) { const m = t.match(new RegExp(c.rx.source, 'gi')); if (m) hits[c.n] = (hits[c.n] || 0) + m.length; }
  for (const [who, c] of Object.entries(LEADERS)) { const m = t.split(who).length - 1; if (m) hits[c] = (hits[c] || 0) + m * 2; }
  return Object.entries(hits).sort((a, b) => b[1] - a[1]).map(([n, k]) => Object.assign({ k }, COUNTRIES.find(c => c.n === n)));
}
/* blocco mappa costruito dal testo: Paesi coinvolti + alleanze che li riguardano */
const GEOPOL = /guerr|alleat|alleanz|\bnato\b|diplomaz|sanzion|conflitt|attacc|missil|vertice|trattat|negoziat|ostagg|tregua|esercit|invasion|bombard|cessate il fuoco|dazi|geopolit|ambasciat|summit|onu\b|nazioni unite|nucleare/i;
function geoContext(text, max = 8) {
  // le alleanze servono solo se la notizia riguarda rapporti tra Stati (guerre, accordi, vertici…)
  if (!GEOPOL.test(text)) return null;
  const cs = detectCountries(text).filter(c => c.k >= 2).slice(0, max);
  if (cs.filter(c => c.n !== 'Italia' && c.n !== 'Vaticano').length < 2) return null;
  const ens = new Set(cs.map(c => c.en).filter(Boolean));
  // alleanze che toccano almeno due Paesi coinvolti, o una se è la sola informazione utile
  let groups = ALLIANCES.map(a => ({ a, hit: a.m.filter(x => ens.has(x)).length })).filter(x => x.hit >= 2 || (cs.length <= 2 && x.hit >= 1)).sort((x, y) => y.hit - x.hit).slice(0, 4);
  return {
    type: 'map', title: 'I Paesi coinvolti e le loro alleanze',
    places: cs.map(c => ({ name: c.n, lat: c.lat, lon: c.lon, note: (ALLIANCES.filter(a => a.m.includes(c.en)).map(a => a.name).slice(0, 3).join(', ') || '—'), group: (groups.find(g => g.a.m.includes(c.en)) || {}).a?.name })),
    groups: groups.map(g => ({ name: g.a.name, desc: g.a.desc, countries: g.a.m })),
    note: 'Paesi riconosciuti nel testo della lezione; i colori mostrano a quali alleanze appartengono.'
  };
}
