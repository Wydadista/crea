# AKhbar studio 0.4.6 — audio in parallelo e assemblaggio MP4

Nei montaggi l'audio AAC viene ora preparato mentre prosegue la codifica video. Ogni blocco completato fornisce il proprio audio PCM già tagliato, mixato ed elaborato a un unico encoder AAC continuo a 192 kbit/s, con le stesse impostazioni precedenti. Un solo estrattore audio lavora alla volta, in aggiunta all'encoder audio e al processo video. Nessuna nuova codifica AAC per singolo taglio: si evitano priming ripetuto e pause tra segmenti.

I confini audio sono calcolati sui campioni cumulativi della timeline a 48 kHz, evitando accumuli di arrotondamento. I blocchi semplici, gli effetti, i tagli VFR, le velocità e il mixaggio restano quelli della 0.4.5. L'assemblaggio finale copia sia H.264 sia AAC già pronti. La modalità di singola clip diretta e la copia originale mantengono i percorsi precedenti.

Il file MP4 viene finalizzato accanto alla destinazione e poi rinominato: si evita la copia integrale aggiuntiva dal volume temporaneo. Un'eventuale esportazione precedente resta intatta fino al completamento. Annullamento ed errori interrompono anche i processi audio e rimuovono i file temporanei.

Nei montaggi la barra riserva fino al 90% al video, 90–92% alla finalizzazione audio e 92–99% all'assemblaggio MP4. Quest'ultima fase avanza con i timestamp realmente assemblati. Il 100% compare soltanto dopo il salvataggio riuscito. Il tempo trascorso continua a misurare l'intera operazione; le percentuali delle fasi non sono una stima del tempo mancante. Il riordino MP4 per l'avvio rapido può ancora richiedere tempo di scrittura finale.

## Verifiche

- **74 test superati**, suite completa in circa 11,3 secondi. Tutti i comandi di prova limitati a 170 secondi; nessun EXE generato.
- Nuova prova reale FFmpeg: l'encoder AAC produce avanzamento mentre l'ingresso è ancora aperto e prima che siano disponibili tutti i blocchi video.
- Confini audio a 29 FPS, campioni frazionari, suono/silenzio, taglio e riempimento di sorgenti audio, durata e timestamp iniziale del flusso AAC.
- Errori e annullamento del lavoro audio in background senza blocchi. Annullamento durante l'assemblaggio: il file di destinazione precedente rimane intatto e il file MP4 temporaneo viene eliminato. Verificata anche la sostituzione riuscita di una destinazione già esistente.
- Ripetute le verifiche dei tagli video VFR, dei fotogrammi a tutti i confini tra blocchi, della sincronizzazione, dei volumi, delle tracce mute, delle sovrapposizioni, dei cambi di velocità e di DeepFilterNet3.

## Misura breve prima/dopo

Confronto contro la 0.4.5 sul cloud Linux senza GPU: sorgente sintetica di 24 secondi, 320×180/12 FPS, audio sinusoidale, 32 tagli riordinati da quattro secondi, uscita di 128 secondi, CPU e qualità 55%. Due ripetizioni con ordine invertito:

| Versione | Tempo totale 1 | Tempo totale 2 | Assemblaggio 1 | Assemblaggio 2 |
| --- | --- | --- | --- | --- |
| 0.4.5 | 3,274 s | 3,191 s | 2,367 s | 2,313 s |
| 0.4.6 | 2,644 s | 2,505 s | 0,066 s | 0,069 s |

Durata di 128 secondi e 12 FPS identici. Nella prova il tempo totale medio diminuisce di circa il 20%; l'audio viene anticipato, non omesso. La prova non misura il progetto reale dell'utente o le prestazioni di Windows/RTX 2060: il confronto completo va svolto sul PC con lo stesso progetto e le stesse impostazioni.
