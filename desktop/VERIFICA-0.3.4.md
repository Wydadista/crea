# Verifiche AKhbar studio 0.3.4

Le prove brevi sono state eseguite nel cloud Linux con Electron, Playwright, FFmpeg e sorgenti sintetiche. Le prove lunghe e il collaudo sul PC Windows sono affidati all’utente, come richiesto. Non è stata costruita né collaudata una nuova versione dell’installer Windows in questa revisione.

## Montaggio: verifiche effettivamente eseguite

- **Aggancio rapido:** interazione reale con il mouse dopo accorciamento dal bordo, zoom di 16, 40, 137 e 320 px/s, superamento del contatto di 22 px, clip breve di 0,25 s e movimento verticale involontario di 28 px. Contatto esatto sulla traccia iniziale, altre clip ferme. Controllati ultima posizione al rilascio, calamita disattivata, cambio intenzionale di traccia e Annulla/Ripristina. I controlli sul modello coprono ulteriori durate e zoom. L’aggancio ha una tolleranza normale di 16 px, estesa a 24 px quando si attraversa il bordo e a 28 px per mantenere un aggancio già acquisito; non richiama clip lontane.
- **Velocità:** selezionati soltanto i segmenti 8 e 9 di una sequenza di 15; modifica e ripristino da proprietà e menu contestuale. Gli altri 13 conservano tempi, posizioni e velocità. Punti sorgente invariati e conflitto rifiutato senza modifiche parziali. Il comando sull’intera sorgente è separato ed esplicito.
- **Invio:** applicazione da proprietà, finestra velocità e impostazioni con selezione corrente; pulsante Applica ancora disponibile. Invio nei campi multilinea inserisce una nuova riga e non avvia la riproduzione.
- **Gruppi:** A–B–C consecutive, vuoto di 0,1 s, D–E consecutive e segmento isolato. Creati due gruppi distinti, senza spostamenti, con colore uniforme e tagli interni grigi. Controllato anche il collegamento esplicito fra tracce.
- **Righello:** altezza effettiva di 24 px; etichette misurate, senza sovrapposizioni, a nove livelli di zoom e durante lo scorrimento. I controlli sul modello coprono anche larghezze e posizioni intermedie. Etichette semplificate senza cambiare i tempi delle clip.
- **Salvataggio:** salvati e riaperti progetti portabili dopo aggancio, variazioni di velocità e raggruppamento; verificato il mantenimento dei dati.

## Separazione audio e altezza delle tracce

Provata una clip sorgente di 8 s, già tagliata da 2 a 6 s, a velocità 2× e posizionata a 1 s. Il comando crea l’audio immediatamente sopra il video, conserva tagli, velocità e impostazioni audio, silenzia l’audio incorporato e non cambia i tempi delle altre clip. Una seconda separazione è disabilitata. Il file sorgente è rimasto identico.

Verificati selezione, spostamento, taglio, silenziamento ed eliminazione indipendenti dell’audio, Annulla/Ripristina, riproduzione, salvataggio e riapertura. Due esportazioni MP4 reali, prima e dopo la separazione, hanno entrambe durata audio/video di **8,000 s** e differenza di livello RMS di **0 dB**: nessun raddoppio della voce nella prova. Questa prova breve non sostituisce un controllo di sincronizzazione su registrazioni lunghe.

Il minimo precedente era **80 px**, il nuovo è **32 px: −60%**. Verificate le dimensioni effettive nell’interfaccia con clip audio e video presenti, miniature, forme d’onda e bordi di taglio adattati. Lo slider cambia subito tutte le tracce; il ridimensionamento individuale resta disponibile. Provati Annulla/Ripristina, ridimensionamento individuale da 32 a 52 px e persistenza del valore dopo riapertura.

## Registrazione: confronto breve sul testo

Ambiente: Linux, **Intel Xeon Platinum 8573C**, Node.js 24.19.0, Electron con **GPU disabilitata**. Nessuna RTX 2060 disponibile.

È stata usata la stessa immagine sintetica 3840×2160 con testo latino e arabo, qualità 100%, uscita 1920×1080, richiesta 12 FPS, stesso segnale audio a 48 kHz, guadagno microfono 0 dB e AGC disattivato. Il riferimento precedente è una **simulazione** del vecchio percorso con ridimensionamento rapido e vecchio bitrate; non è una cattura dello stesso monitor con una versione precedente installata. Il nuovo percorso riceve i fotogrammi nativi e ridimensiona una sola volta con qualità elevata in un worker. A risoluzione invariata usa direttamente il flusso video, senza ridimensionamento.

| Misura                                          | Riferimento precedente simulato |            Schermo e testo |
| ----------------------------------------------- | ------------------------------: | -------------------------: |
| Bitrate video richiesto                         |                     4,48 Mbit/s |               10,12 Mbit/s |
| Codec effettivo                                 |      H.264 Constrained Baseline | H.264 Constrained Baseline |
| Formato pixel                                   |                         yuv420p |                    yuv420p |
| Durata video / audio                            |                 3,183 / 3,276 s |            3,305 / 3,398 s |
| FPS medi effettivi                              |                           11,94 |                   **7,87** |
| Dimensione MP4                                  |                    470.038 byte |               559.118 byte |
| Dimensione per secondo video                    |                     147,67 kB/s |                169,17 kB/s |
| Stop → clip importata                           |                        1.674 ms |                     722 ms |
| Finalizzazione                                  |                        1.186 ms |                     522 ms |
| SSIM RGB rispetto al riferimento ridimensionato |                        0,985247 |                   0,987972 |

I ritagli seguenti sono alla scala **1:1**, estratti dai file MP4: [precedente simulato](test/artifacts/text-balanced.png), [Schermo e testo](test/artifacts/text-screen-text.png). Dati macchina e misure: [recording-comparison.json](test/artifacts/recording-comparison.json).

L’osservazione dei ritagli mostra un miglioramento contenuto dei bordi del testo, senza aloni introdotti da una maschera di contrasto. La misura SSIM è coerente, ma non dimostra una qualità equivalente a Camtasia. Il peso per secondo cresce di circa **14,6%** nella prova; il bitrate richiesto è un obiettivo e non il bitrate effettivo di una pagina quasi statica. Qualità 100% indica il massimo del profilo di compressione, non un file senza perdita. Il profilo H.264 effettivo dipende dal runtime: la preferenza per High non lo garantisce e la diagnostica mostra il risultato reale.

**Limite rilevato:** nel cloud senza GPU il percorso 4K → 1080p di qualità elevata ha raggiunto soltanto 7,87 FPS contro i 12 richiesti. La nitidezza è migliorata, ma questo confronto non dimostra una fluidità adeguata sul PC dell’utente. Va controllata sulla RTX 2060; il profilo Bilanciato rimane disponibile. La riduzione 4K → 1080p perde comunque dettaglio e il campionamento colore H.264 4:2:0 limita soprattutto le scritte colorate molto sottili. Nessun aumento artificiale eccessivo della nitidezza è applicato.

In entrambe le prove il video H.264 è stato copiato in MP4, senza ricodifica video finale. L’audio Opus della cattura WebM è stato convertito in AAC durante l’acquisizione. I tempi di Stop sono misure brevi isolate, influenzate dall’avvio dei processi: non sono una promessa sui tempi di registrazioni da 5–6 minuti.

## Microfono: cosa è stato misurato

Il nuovo indicatore misura RMS e picco per canale e mostra una scala logaritmica da −60 a 0 dBFS, con attacco rapido, rilascio graduale, picco trattenuto e avvisi di segnale basso e saturazione. Non aumenta il volume per far salire la barra. Il guadagno manuale è separato e dichiara che modifica anche l’audio registrato; AGC è un controllo distinto.

Con segnale sintetico di picco 0,04, l’RMS teorico è −30,97 dBFS. L’interfaccia e la barra flottante hanno mostrato **−31 dBFS**, circa il 48% della scala grafica; i file registrati misurano rispettivamente **−30,99 e −30,98 dBFS**. Provati anche segnale su un solo canale e canali in opposizione di fase, senza sottostima dovuta alla loro somma. I controlli automatici verificano che la misurazione non modifichi i campioni audio.

Gli aggiornamenti passano dai precedenti circa 5 Hz a **30 Hz nominali**, con interpolazione visiva e richieste alla barra flottante limitate a una in corso. Sotto carico CPU e durante l’avvio della barra sono stati osservati intervalli massimi di circa **160 e 212 ms**: non è stata verificata una cadenza costante di 30 Hz in questa macchina. Il test reale con lo stesso microfono, distanza e ingresso deve essere svolto sul PC; non è stata verificata un’equivalenza con l’indicatore di Camtasia.

## Controlli rapidi e verifiche affidate al PC

Passati **25 test automatici mirati** su montaggio, registrazione, anteprima, velocità, progetti e timeline. Passate anche le interazioni Electron sopra descritte con `test:editing`, `test:detach` e il confronto breve `test:recording-quality`. Non è stata eseguita l’intera suite storica: alcune verifiche richiedono comportamenti di ricollocamento delle clip che questa revisione sostituisce esplicitamente.

Restano da provare sul PC: acquisizione reale di schermo/finestra, microfono e audio di sistema Windows, esclusione della barra dalla cattura, RTX 2060 e FPS effettivi, registrazioni lunghe e loro ultimi secondi, sincronizzazione prolungata, export lungo e installer. Nessuna equivalenza prestazionale o qualitativa con Camtasia è dichiarata.

Per creare l’installer, installare Node.js 24 x64, estrarre lo ZIP esatto e, dal Prompt dei comandi nella cartella estratta, eseguire:

```cmd
cd desktop
npm ci
npm run build:win
```

Output previsto: `desktop\dist\AKhbar-studio-0.3.4-x64-Setup.exe`. Gli script e il nome di output sono stati controllati; l’esecuzione Windows di questa versione resta da verificare sul PC.
