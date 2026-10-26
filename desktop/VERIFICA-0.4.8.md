# AKhbar studio 0.4.8 — sovrapposizioni e sfondo sfocato

Le aree vuote attorno a un video verticale o di proporzioni diverse lasciano ora vedere le tracce sottostanti, sia nell'anteprima sia nel file esportato. Senza altre clip sotto, il progetto mantiene lo sfondo nero. Il nero presente nelle immagini originali del video resta opaco: non viene applicata una rimozione del colore nero.

La trasparenza del riempimento viene conservata anche con zoom, posizionamento, ridimensionamento, sfocatura e pixelizzazione. La correzione interessa la composizione visiva; i punti sorgente, il motore dei tagli, l'audio, la preparazione AAC in parallelo e l'assemblaggio MP4 restano quelli della versione precedente.

## Nuovo effetto facoltativo

**Elementi ed effetti → Sfondo sfocato** si applica al video selezionato o trascinando il riquadro sopra una clip. Riproduce lo stesso fotogramma del video, ingrandito fino a coprire il progetto e sfocato, mantenendo nitido il video davanti. Lo sfondo è disattivato nei progetti esistenti finché non viene applicato esplicitamente.

L'effetto non aggiunge tracce né duplica l'audio. Si sposta e si divide insieme alla clip; per una sequenza unita viene applicato a tutti i segmenti. La sua barra consente **tasto destro → Elimina effetto**, con Annulla/Ripristina. I segmenti temporaneamente nascosti dall'accorciamento di una sequenza unita mantengono lo stato scelto quando vengono ripristinati.

## Verifiche

- Difetto riprodotto prima della correzione: un video verticale sulla traccia superiore nascondeva con il nero il video orizzontale sottostante.
- **77 test superati**, suite completa in circa 12,6 secondi. Tutti i comandi di prova limitati a 170 secondi; nessun EXE generato.
- Esportazioni reali FFmpeg: video verticale su orizzontale e caso inverso; presenza/assenza della traccia sotto; inizio e fine del segmento tagliato; nero originale preservato; zoom, ridimensionamento, sfocatura e pixelizzazione circolare; nuovo sfondo anche con zoom.
- Nuovo sfondo su due intervalli riordinati di una registrazione a pochi fotogrammi: sfondo e primo piano mostrano lo stesso contenuto selezionato. Controllata la sfocatura effettiva sui dettagli, la nitidezza del primo piano e il riempimento fino ai bordi.
- Salvataggio/riapertura tramite JSON, taglio, copia/incolla e separazione audio conservano correttamente l'effetto video; l'audio separato non lo eredita.
- Verifica nell'interfaccia Electron con video reali: sovrapposizione trasparente, applicazione dal pannello e tramite trascinamento, rimozione, annullamento/ripristino, taglio, elementi uniti accorciati e poi ripristinati.
- Ripetuti i controlli esistenti su tagli VFR, audio e video sincronizzati, gruppi, effetti, zoom continuo, esportazione a blocchi e finalizzazione MP4.

Non è stata eseguita l'esportazione completa del progetto dell'utente né una prova hardware Windows/RTX nell'ambiente cloud. La 0.4.7 resta disponibile nel suo archivio separato.
