# Armoniche BT – dimensionamento sbarratura quadro 400 V

Web app statica (HTML + JavaScript puro, nessuna dipendenza, nessun server) per valutare l'effetto delle armoniche
generate da fino a **10 tipi di inverter** su una sbarratura BT: THDv, correnti al punto di consegna (TDD / IEC 61000-3-12),
declassamento della sbarra, trasformatore (fattore K), cavo di arrivo, rifasamento e risonanza, scenari di carico e mitigazioni.

**Password iniziale:** vedi il commento in `js/config.js`. **Cambiala subito** (vedi sotto).

## Provarla in locale
Doppio clic su `index.html` (Chrome/Edge) oppure, dalla cartella del progetto:

```bash
python -m http.server 8123
```

e apri http://localhost:8123.

## Pubblicarla su GitHub Pages (senza usare il terminale)
1. Crea un account su https://github.com e premi **New repository** (es. `armoniche-bt`).
2. Nel repository: **Add file → Upload files**, trascina **tutto il contenuto** della cartella `armoniche-bt`
   (`index.html`, `imposta-password.html`, cartelle `css` e `js`) e premi **Commit changes**.
3. **Settings → Pages → Build and deployment**: Source = *Deploy from a branch*, Branch = `main`, cartella `/ (root)` → **Save**.
4. Dopo 1–2 minuti l'indirizzo è `https://<tuo-utente>.github.io/armoniche-bt/`.

### Con Git da riga di comando
```bash
cd armoniche-bt
git init
git add .
git commit -m "Prima versione"
git branch -M main
git remote add origin https://github.com/<tuo-utente>/armoniche-bt.git
git push -u origin main
```
Poi attiva Pages come al punto 3.

## Cambiare la password
1. Apri `imposta-password.html` (in locale), scrivi la nuova password (min. 12 caratteri) e premi **Genera**.
2. Sostituisci il contenuto di `js/config.js` con il blocco generato.
3. Ricarica il file su GitHub (Add file → Upload files, sovrascrive). Elimina `imposta-password.html` dal repository pubblico se vuoi.

## Limite importante del "login"
GitHub Pages serve file statici: la password è verificata **nel browser** (PBKDF2-SHA256). Tiene fuori i curiosi, ma chi ha
accesso al repository pubblico può leggere il codice e aggirarla. Se i contenuti (modelli, logica) devono restare riservati:
- usa un servizio con autenticazione lato server (Cloudflare Pages + Cloudflare Access, Netlify con protezione a password, Azure Static Web Apps), oppure
- tieni il repository privato e distribuisci il file localmente.

I dati dei progetti restano **nel tuo browser** (localStorage) e nei file `.armoniche.json` che salvi: non vengono inviati ad alcun server.

## Struttura
| File | Contenuto |
|---|---|
| `index.html` | Pagina, login |
| `js/data.js` | Limiti normativi, topologie, libreria modelli, contesti applicativi |
| `js/calc.js` | Motore di calcolo (indipendente dal DOM) |
| `js/charts.js` | Grafici SVG |
| `js/app.js` | Interfaccia, scenari, mitigazioni, relazione |
| `js/auth.js`, `js/config.js` | Accesso con password |

## Ipotesi e limiti del modello (da leggere)
- Gli spettri della libreria (Schneider, ABB, Danfoss, Nidec, generici) sono **tipici per topologia**, non dati di catalogo: sostituiscili con i test report del costruttore.
- Rete: impedenza Zs(h) = R·√h + j·h·X, con carichi lineari e rifasamento in parallelo; modello monofase equivalente a regime equilibrato.
- Sbarra: effetto pelle analitico per conduttore piatto, prossimità con coefficiente semplificato, temperatura stimata in modo lineare: per il progetto definitivo servono prove IEC 61439-1 cl. 10.10 o FEM.
- Supraarmoniche (2–150 kHz) e interarmoniche non modellate.
- IEC 61000-3-12 vale per apparecchi ≤ 75 A: per il quadro è un riferimento indicativo.
- Verificare i limiti normativi sull'edizione vigente delle norme. Lo strumento è di supporto e non sostituisce la verifica di un progettista abilitato.
