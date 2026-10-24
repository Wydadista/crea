# AKhbar studio 0.4.5 — esportazione a blocchi

I segmenti video consecutivi senza sovrapposizioni, effetti visivi o cambi di velocità vengono ora codificati in blocchi di massimo otto. Un blocco usa un solo processo FFmpeg e una sola inizializzazione dell'encoder CPU o GPU. Ogni segmento mantiene il proprio ingresso sorgente, il taglio, il volume, il mono e lo stato di silenzio. Il limite di otto contiene il numero di decoder aperti contemporaneamente; ogni decoder del blocco usa al massimo due thread.

Gli spazi vuoti, le immagini, i testi, lo zoom, gli effetti e le composizioni interrompono il blocco e mantengono il percorso dedicato. La riduzione del rumore continua a essere preparata prima della codifica. Nessuna modifica al progetto salvato o alle operazioni di montaggio. Rilevamento NVIDIA della 0.4.4 conservato.

La sequenza viene unita soltanto dopo che ogni segmento ha applicato il proprio taglio. Restano `-noaccurate_seek` e la normalizzazione dei fotogrammi precedenti al punto di taglio, che preservano l'immagine mantenuta nelle registrazioni a cadenza variabile. Gli FPS di uscita del blocco sono espliciti: nessuna conversione implicita a 25 FPS. L'audio degli intervalli rimane PCM e viene codificato in AAC soltanto nell'assemblaggio finale; il video finale non viene ricodificato.

## Verifiche

- **72 test superati**, suite completa in circa 10,5 secondi, con limite del comando di 170 secondi. Nessuna prova oltre tre minuti e nessun EXE generato.
- Nuova prova reale FFmpeg su 17 segmenti riordinati di una sorgente con pochi fotogrammi: controlla ogni fotogramma esportato, anche ai confini tra blocchi e composizioni. Verifica anche silenzi, tracce mute, clip mute, sorgente senza audio, volumi, mono, ridimensionamento, immagine fissa, spazio vuoto, durata, FPS e annullamento dell'esportazione.
- La prova VFR della 0.4.3 controlla nuovamente immagini e toni audio dopo tagli, sovrapposizioni, velocità 2×, DeepFilterNet3 e clip singola. Tre segmenti semplici ora richiedono un solo passaggio diretto.

## Misura breve prima/dopo

Confronto contro la 0.4.4 sul cloud Linux, CPU, stessa sorgente sintetica di 20 secondi a 320×180/12 FPS, 32 tagli riordinati da mezzo secondo, uscita di 16 secondi, qualità 55%. Due ripetizioni con ordine prima/dopo invertito:

| Versione | Prima misura | Seconda misura | Avvii di codifica |
| --- | --- | --- | --- |
| 0.4.4 | 0,962 s | 1,007 s | 32 |
| 0.4.5 | 0,619 s | 0,641 s | 4 |

Durata e FPS identici. Riduzione media del tempo di circa il 36% in questa piccola prova, che evidenzia il costo degli avvii. Non misura il progetto reale di 28 minuti, le prestazioni Windows o la RTX 2060, assente nell'ambiente cloud. Il tempo effettivo sul PC dell'utente resta da confrontare con le medesime impostazioni e lo stesso montaggio.
