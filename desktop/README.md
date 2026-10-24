# AKhbar studio 0.4.4

Editor desktop per Windows 10/11 x64, derivato dal commit `427ae12b48a1d8e685e362506b92c78621b7fede` di Wydadista/crea. Conserva timeline multitraccia, tagli, gruppi, velocità di lavoro/ripristino, effetti, annotazioni, anteprima, recupero automatico e apertura dei progetti precedenti `.creastudio`. Il vecchio `../creapost.html` è indipendente.

Novità e verifiche della versione attuale: [VERIFICA-0.4.4.md](VERIFICA-0.4.4.md). La verifica dei tagli resta in [VERIFICA-0.4.3.md](VERIFICA-0.4.3.md). La verifica 0.4.2 resta in [VERIFICA-0.4.2.md](VERIFICA-0.4.2.md). La verifica precedente resta in [VERIFICA-0.4.1.md](VERIFICA-0.4.1.md). Le novità 0.4.0 restano in [VERIFICA-0.4.0.md](VERIFICA-0.4.0.md). Le verifiche precedenti restano in [VERIFICA-0.3.5.md](VERIFICA-0.3.5.md).

## Avvio e installer Windows

Installare Node.js **24 x64**. Estrarre tutto lo ZIP dei sorgenti, aprire PowerShell nella cartella `desktop` ed eseguire in sequenza:

```powershell
npm ci
npm start
```

Per questa versione eseguire anche `npm ci` se si avevano già le dipendenze della 0.4.0: installa il nuovo motore audio. Richiede Internet durante questa preparazione.

Chiudere l'app prima di creare l'installer:

```powershell
npm run build:win
```

Risultato: `dist/AKhbar-studio-0.4.4-x64-Setup.exe`. Il programma include Electron, FFmpeg e FFprobe: l'utente finale non deve installarli separatamente. L'installer di sviluppo non è firmato. Per generare anche ZIP portabile, sorgenti e checksum:

```powershell
npm run build:release
```

Il bundle funziona anche da uno ZIP senza `.git`. Non eseguire `npm ci` contemporaneamente al build. Per rigenerare il pacchetto esatto usare lo ZIP del commit consegnato, non un ramo che potrebbe cambiare. Un nuovo build non è necessariamente identico byte per byte al precedente (timestamp/toolchain).

## Esportazione e prestazioni

**Esporta → Scegli destinazione** apre la finestra nativa di salvataggio; il percorso viene mostrato nel dialogo. Impostazioni: dimensioni originali o 720/1080/1440/2160p, FPS interi 1–120, qualità 1–100%, intervallo massimo dei keyframe (inizialmente 4 secondi), encoder CPU o GPU rilevati con un'effettiva codifica di prova.

- Una sola clip video senza composizione/effetti/zoom passa direttamente dal decoder all'encoder. Niente sfondo sintetico, passaggio RGBA, video intermedio o seconda codifica. Tagli sorgente, FPS, dimensioni, mono, volume e filtri audio continuano ad applicarsi.
- Nei montaggi ogni intervallo viene codificato **una volta** con qualità ed encoder selezionati. Il video finale viene concatenato senza ricodifica, normalizzando i timestamp a FPS costanti; l'audio PCM viene codificato in AAC una volta sola, evitando priming AAC a ogni taglio.
- **Copia flussi originali** è facoltativa e deve essere scelta esplicitamente. Conserva la qualità originale, quindi non applica lo slider qualità. Richiede una clip intera H.264/AAC, dimensioni/pixel format e cadenza dei pacchetti identici agli FPS richiesti, nessun cambio audio (incluso mono), velocità, mute o effetto. Un'impostazione incompatibile viene rifiutata, non ignorata. Il controllo dei keyframe ne verifica l'intervallo massimo.
- Su NVIDIA, per una clip semplice alle dimensioni originali, viene provato anche il percorso **CUDA → NVENC** senza download/upload dei fotogrammi. Un test reale decide se usarlo; se CUDA non funziona, il decoder CPU alimenta NVENC. Per ridimensionamenti e composizioni i filtri restano CPU. L'export conserva l'indicazione di encoder, decoder, percorso e ripiego CPU. La compilazione di FFmpeg e i driver devono supportare l'hardware.
- CPU usa inizialmente `veryfast` e un numero di thread proporzionato alle CPU disponibili (quota cloud inclusa, massimo 8); `fast` rimane selezionabile per una compressione maggiore. Il CRF scelto non cambia: la velocità può aumentare il peso del file.
- La percentuale riguarda il **contenuto processato**, non una stima del tempo rimanente. Il tempo trascorso è un contatore indipendente. L'assemblaggio/scrittura possono richiedere tempo anche quando i fotogrammi sono già completi; 100% arriva soltanto a file scritto.

Qualità 65% corrisponde a CRF/CQ 23 in questa versione; le percentuali di Camtasia non sono direttamente confrontabili. Per misurare una RTX 2060 osservare in Gestione attività **Video Encode**, **Video Decode**, CPU e disco, oltre al nome dell'encoder riportato dall'app. Un 5% generale della GPU non misura l'utilizzo NVENC.

Risultati e limiti dei benchmark: [PERFORMANCE.md](PERFORMANCE.md). Nessuna equivalenza con Camtasia è dichiarata senza una prova sulla stessa sorgente e sullo stesso PC.

## Interfaccia

Le conferme di chiusura/salvataggio, sostituzione e recupero automatico usano finestre interne con logo e colori di AKhbar studio. **Annulla** o **Esc** conservano il progetto; **Salva** deve completarsi prima di chiudere. I selettori di file e cartelle continuano a usare il sistema operativo.

La calamita è un pulsante con la sola icona: verde quando la chiusura degli spazi è attiva, neutro quando è disattiva; il suggerimento indica sì/no. Il fermo immagine ha un'icona fotografica. I comandi per l'altezza sono sopra le intestazioni delle tracce. **Elementi ed effetti** mostra riquadri grandi con esempi visivi di testo, freccia, cerchio, sfocatura e pixelizzazione; clic e trascinamento mantengono le azioni precedenti.

Verifiche della grafica: [VERIFICA-GRAFICA.md](VERIFICA-GRAFICA.md).

## Montaggio e navigazione

- **Colore della clip originale**: i tagli della stessa clip mantengono il medesimo colore, anche dopo unione, raggruppamento, copia/incolla e riapertura del progetto. Il colore non viene più assegnato in base all'ordine nel gruppo.
- **Calamita e bordo sinistro**: al rilascio, dopo un accorciamento, la clip raggiunge la fine della precedente sulla stessa traccia. I nuovi punti sorgente restano tagliati. Vale anche per gli elementi uniti. Se una clip estranea impedisce lo spostamento degli spezzoni successivi, questi rimangono fermi e l'accorciamento viene conservato. Con calamita disattiva il vuoto rimane. Durante il trascinamento lo zoom di “Adatta tutto” rimane stabile. Verifiche: [VERIFICA-CALAMITA-COLORI.md](VERIFICA-CALAMITA-COLORI.md).

- **Unisci selezionati** conserva l'unione dei segmenti contigui della stessa clip inserita. Il contorno esterno è marcato, i tagli interni rimangono riferimenti sottili senza maniglie. Si ridimensiona soltanto dalle due estremità; **Separa elementi uniti** rende nuovamente modificabili i singoli segmenti. Accorciare oltre un taglio e riallungare conserva i riferimenti originali, anche dopo salvataggio.
- **Raggruppa** (`Ctrl+G`) collega video, immagini e audio anche su tracce diverse, conservando durate, distanze e sovrapposizioni. Nella timeline appare un unico blocco nella traccia 1: le tracce reali restano memorizzate per composizione e separazione. Il trascinamento muove tutti con lo stesso spostamento; **S** divide il gruppo in due gruppi indipendenti. I segmenti conservano il colore della clip originale; un indicatore comune segnala il gruppo. **Separa gruppo** (`Ctrl+Shift+G`) scioglie il collegamento senza spostare nulla.
- **Taglia** (`Ctrl+X`) e **Incolla** (`Ctrl+V`) mantengono proprietà, tagli, velocità, effetti e disposizione relativa sulle tracce. Taglia lascia fermi gli elementi non selezionati e conserva il cursore. Le scorciatoie rispettano i campi di testo; taglio e incolla hanno passaggi Annulla separati.
- **Dividi** senza selezione opera soltanto se la linea verde attraversa un unico elemento, contando tutte le tracce. Con più elementi mostra un messaggio e richiede la selezione. Sui bordi non crea segmenti di durata zero. Con una selezione divide soltanto gli elementi selezionati attraversati.
- Queste operazioni sono incluse in **Annulla/Ripristina**. Verifica dedicata: `node --test test/group-cut.test.js` e, nell'ambiente cloud con display, `DISPLAY=:99 node test/group-cut-ui.cjs`. Nessun installer è necessario per eseguire le prove.


- **Crea fermo immagine**: selezionare il video e collocare il cursore al fotogramma desiderato. L'immagine PNG viene inserita su una nuova traccia per 5 secondi, senza tagliare/spostare nulla; durata regolabile con bordi o proprietà. Inquadratura, zoom all'istante scelto ed effetto della clip vengono conservati. L'audio sulle altre tracce continua. Annulla/Ripristina e salvataggio comprendono l'inserimento.
- **Registra frase**: impostare inizio/fine con i campi della timeline, i pulsanti “= cursore” oppure Shift+trascinamento sul righello. L'intervallo è evidenziato. Selezionare le clip audio da correggere e attivare “Silenzia selezione nell'intervallo” solo se desiderato. Dopo 3 secondi di conto alla rovescia parte il microfono. Stop inserisce la registrazione WAV su una traccia dedicata, allineata all'inizio, con la sua durata effettiva. Solo il tratto scelto degli originali viene silenziato in modo reversibile; nulla viene spostato. Si possono usare i bordi per sistemare la frase. L'operazione di inserimento/silenziamento è un unico Annulla.
- **🧲 Chiudi spazi della clip** chiude gli spazi dopo eliminazione o accorciamento dei bordi soltanto fra segmenti della stessa clip inserita e sulla stessa traccia. Due inserimenti dello stesso file restano indipendenti. Le altre clip/tracce non si muovono. Disattivata, lascia i vuoti. L’aggancio dei bordi durante il trascinamento è sempre attivo e indipendente da questo pulsante. Le vecchie clip prive di un'identità certa non vengono raggruppate per file per questa operazione.
- Ogni segmento video mostra una miniatura del suo **inizio sorgente effettivo** (`in`), aggiornata dopo tagli/rifilature; immagini con miniatura. Larghezza fissa, ritagliata all'interno della clip senza deformazione. La generazione è in coda e in cache.
- **Adatta tutto alla timeline** calcola lo zoom dalla durata di tutte le tracce e dalla larghezza disponibile, anche per ore; si aggiorna dopo modifiche e ridimensionamenti. Lo zoom manuale sulla linea verde rimane disponibile.
- La barra sotto l'anteprima va sempre da zero alla fine dell'ultimo elemento su qualsiasi traccia, indipendentemente da zoom/scorrimento. Clic/trascinamento aggiornano anteprima e cursore anche in pausa; mostra corrente/totale.

Le nuove clip video/audio e le registrazioni partono in **mono reversibile**. Un canale solo attivo viene distribuito a entrambe le uscite al suo livello originale; due canali attivi vengono mediati evitando saturazioni. I file originali non cambiano. Le scelte (o l'assenza del mono) dei progetti precedenti vengono rispettate. Anteprima ed export condividono lo stesso filtro; l'analisi dei canali non costruisce una forma d'onda completa.

La riduzione del rumore usa **DeepFilterNet3**, con il motore CPU ufficiale `deep-filter` 0.5.6 e modello 3 esplicito. `npm ci` scarica motore e modello (circa 35 MB su Windows), controllando SHA-256. Dopo l'installazione l'elaborazione è locale e non richiede Internet, Python o GPU. Lo slider regola il limite di attenuazione tra 6 e 24 dB; zero e **prima/dopo** bypassano il denoiser. Iniziare da 25–50%, quindi ascoltare consonanti e voce durante il rumore. Anteprima ed export riusano la stessa elaborazione della sorgente intera, con compensazione del ritardo e durata invariata. Il file originale rimane intatto. Le opzioni audio del registratore durante la cattura restano quelle del dispositivo/browser; DeepFilterNet3 si applica dalla proprietà Riduzione rumore della clip. Non è garantito il recupero di parole già distorte o coperte completamente dal rumore.

## Media e registrazione

Il menu distingue **Media**, **Elementi ed effetti** e **Registra**. I comandi delle tracce sono nella timeline. Media ha elenco/griglia persistente, nome/durata e miniature. Un clic apre l'**ANTEPRIMA SORGENTE**, separata dal montaggio, con riproduzione audio/video; `+` o trascinamento inseriscono in timeline.

La registrazione ricorda nome, schermo/finestra, modalità (schermo, webcam, schermo+webcam o microfono), webcam, microfono, audio di sistema, filtri, formato, FPS, risoluzione, qualità e bitrate. I dispositivi sono identificati dal deviceId, con groupId/nome come recupero del microfono; non dall'ordine nell'elenco. Un microfono salvato mancante blocca l'avvio finché non si sceglie un altro dispositivo. La webcam mancante blocca le modalità che la richiedono. Le sorgenti finestra dipendono dalla disponibilità della finestra; controllare la selezione prima della cattura.

**Nome delle registrazioni** `ottobre` produce `ottobre-1.mp4`, `ottobre-2.mp4`, ecc. Contatore persistente anche tra cartelle/progetti e dopo riavvio; creazione esclusiva del file impedisce sovrascritture. Pausa/Riprendi non crea una nuova registrazione. L'audio senza video usa WAV, il formato WebM scelto esplicitamente conserva `.webm`.

La piccola barra flottante è spostabile, sempre in primo piano, con Pausa/Riprendi, Stop, durata **senza pause** e livello del microfono. La protezione contenuti può escluderla dalla cattura su Windows 10 2004+; su Linux o altri sistemi può restare visibile. Questo comportamento dipende dal sistema e va verificato sul PC reale. Il meter controlla il microfono, non garantisce che l'audio di sistema sia disponibile.

La cattura scrive progressivamente su disco con backpressure. Il runtime sceglie MP4/H.264 quando supportato; Stop effettua il remux senza ricodifica video. Se H.264 è disponibile soltanto in WebM viene copiato e l'audio convertito durante l'acquisizione. Con VP8/VP9 la conversione H.264 avviene durante la registrazione. Alla fine restano chiusura e assemblaggio MP4. I progressi riportano l'operazione reale, senza percentuali inventate quando la durata non è nota. La clip viene importata appena pronta; la forma d'onda procede in background. In caso di fallimento della finalizzazione viene conservata una cattura recuperabile e indicato il percorso.

## Progetti portabili e cartelle

**Impostazioni** sceglie due destinazioni persistenti: Progetti inizialmente nei Documenti effettivi dell'utente, sottocartella `AKhbar studio`; Esportazioni inizialmente nei Download effettivi. I percorsi vengono richiesti a Electron/Windows, senza nomi utente fissi.

Il primo salvataggio crea una cartella col nome scelto, il file nativo `.creastudio` e `Media/` con copie dei file usati/importati, senza spostare o modificare gli originali. Riferimenti relativi consentono di trasferire tutta la cartella. I salvataggi successivi aggiornano lo stesso file e riutilizzano i materiali già raccolti. I vecchi progetti con riferimenti assoluti rimangono apribili e vengono raccolti al salvataggio. I font delle annotazioni devono essere installati anche sul computer di destinazione.

## Verifiche e sviluppo cloud

```bash
bash scripts/prepare-cloud.sh
npm test
# In una sessione persistente, se non esiste già un display:
.local-tools/bin/Xvfb :99 -screen 0 1600x1000x24 -nolisten tcp -ac
# In un'altra sessione:
DISPLAY=:99 npm run test:ui
DISPLAY=:99 npm run test:akhbar
```

I test UI usano schermo e microfono sintetici; non provano i driver Windows. Usare il checkout esistente: ogni task cloud è già isolato, senza creare un Git worktree salvo richiesta esplicita. [THIRD_PARTY.md](THIRD_PARTY.md) contiene le licenze.
