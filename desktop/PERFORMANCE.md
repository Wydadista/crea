# Stato delle verifiche — AKhbar studio 0.3

L'utente ha chiesto di interrompere i test e svolgere la verifica finale sul proprio PC. I benchmark lunghi sono stati fermati; non è dichiarato risolto o misurato completamente il confronto con Camtasia.

## Cosa è stato osservato

La versione iniziale codificava tutti gli intervalli in H.264 CPU intermedio e ricodificava l'intero video finale. Anche selezionando GPU, la prima codifica rimaneva CPU. Nella prova sintetica da 30 minuti, 1280×720, 12 FPS, qualità 70% / CRF 22, CPU, la sola composizione iniziale ha impiegato circa 1.555 secondi. La codifica finale è stata interrotta su richiesta: non esiste un tempo totale prima/dopo valido.

Macchina cloud: Intel Xeon Platinum 8573C, 5 CPU logiche esposte e quota di 4 CPU, senza GPU fisica disponibile. Il filmato sintetico è diverso dalla registrazione dell'utente e le prove hanno condiviso risorse con altre verifiche. Questi numeri non rappresentano la RTX 2060 o Camtasia.

Nel codice aggiornato: percorso diretto per singola clip semplice, eliminazione della seconda codifica video per montaggi, encoder GPU anche sugli intervalli, controllo reale di disponibilità, prova CUDA per clip NVIDIA compatibili, copia dei flussi soltanto su richiesta e dopo controlli di compatibilità. CPU `veryfast` e thread proporzionati alle risorse, con `fast` ancora selezionabile. Stesso CRF non significa stesso peso: il preset rapido può produrre file più grandi.

Le registrazioni preferiscono MP4/H.264; i formati alternativi vengono convertiti progressivamente durante la cattura, senza una ricodifica video dopo Stop. Una prova preliminare con acquisizioni VP9 simultanee ha rilevato perdita della coda sotto carico e non è stata accettata come verifica riuscita. La ripetizione con carico ridotto è stata interrotta su richiesta. Non ci sono tempi certificati per registrazioni di 1, 5 e 6 minuti.

## Verifiche completate prima della richiesta di interruzione

- 25 test automatici passati su uno stato intermedio: export reale, tagli, effetti, mute, tracce, dimensioni originali, progetti portabili e percorso diretto.
- Prova Electron delle nuove funzioni passata su uno stato intermedio: pannelli, anteprima sorgente, griglia persistente, miniature, fermo immagine, Annulla/Ripristina, chiusura spazi per famiglia, adattamento di un'ora, destinazione export, MP4 sintetico, barra flottante, pause, meter, preferenze dopo riavvio e dispositivo mancante.
- Prime due suite UI storiche passate. Una prova di sincronizzazione ha fallito: l'indagine ha individuato un'attenuazione errata nel trattamento di sorgenti realmente mono, corretta successivamente. Il nuovo test mirato del livello mono è passato. La suite completa non è stata ripetuta dopo le ultime correzioni.
- Preparazione del binario Windows di FFmpeg riuscita. Build completo dell'installer e installazione su Windows non eseguiti in questa consegna.

La registrazione di una frase ha codice e test dedicati, ma l'ultima estensione del test UI non è stata eseguita. Webcam reale, cattura Windows/loopback, esclusione della barra dalla cattura, denoise su voci reali e motori GPU richiedono verifica sul PC dell'utente. Non è dichiarata qualità vocale equivalente a Camtasia.

## Ripetere le misure sul PC

Dalla cartella `desktop`, con il medesimo video di 30 minuti:

```powershell
node scripts/benchmark-export.cjs --input "C:\percorso\registrazione.mp4" --output "C:\percorso\misure" --fps 12 --quality 65 --height original --keyframe 4 --encoder h264_nvenc
```

Produce MP4 e JSON con impostazioni, tempi effettivi, metadati, encoder e controlli di fotogrammi/audio all'inizio, al centro e negli ultimi secondi. Per un montaggio ripetibile aggiungere `--montage`; il generatore usa 75 secondi con tagli, pixelizzazione e sfocatura. Senza GPU usare `--encoder cpu`. La disponibilità di NVENC e CUDA viene verificata dall'app, non dedotta dall'elenco degli encoder compilati.

Il confronto contro la versione precedente richiede un clone Git che contenga il commit iniziale:

```powershell
node scripts/benchmark-export.cjs --input "C:\percorso\registrazione.mp4" --output "C:\percorso\misure-prima" --fps 12 --quality 65 --height original --keyframe 4 --encoder h264_nvenc --baseline 427ae12b48a1d8e685e362506b92c78621b7fede
```

Per rendere confrontabile il GOP, lo script passa l'intervallo keyframe anche al motore precedente, senza modificarne il percorso di rendering. Lo script di acquisizione sintetica `scripts/benchmark-recording.cjs` richiede un desktop/display funzionante ed è uno strumento diagnostico; non sostituisce la cattura reale del PC.
