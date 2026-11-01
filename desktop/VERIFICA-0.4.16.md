# AKhbar studio 0.4.16 — Scorrimento foto lunga

## Uso

1. Importa la foto originale, per esempio una cattura verticale di un articolo, e inseriscila nella timeline.
2. Imposta la durata desiderata trascinando il bordo della clip: 10 secondi, cinque minuti o un altro intervallo.
3. Seleziona la foto e premi **Elementi ed effetti → Scorrimento foto lunga**. Puoi anche trascinare il riquadro dell'effetto direttamente sopra la foto nella timeline.

Il filtro adatta l'immagine al fotogramma senza deformarla. Nelle foto lunghe mantiene tutta la larghezza: all'inizio mostra la parte alta, scende a velocità costante e arriva alla parte bassa nell'ultimo fotogramma. La durata e la velocità vengono ricavate automaticamente dalla clip; cambiando durata il movimento si adatta. Non servono coordinate, zoom numerici o keyframe manuali.

Applicandolo, l'inquadratura della foto passa a tutto il fotogramma e sostituisce eventuali movimenti di zoom precedenti su quella foto. **Annulla** ripristina anche le impostazioni precedenti. Il filtro agisce soltanto sulle immagini, senza cambiare video o audio.

La freccia della clip apre la barra **↓ Scorrimento foto lunga**. Il tasto destro su quella barra offre **Elimina effetto**: rimuove lo scorrimento e conserva la foto. Scegliere invece il normale Zoom sostituisce lo scorrimento con il movimento configurabile già presente.

Dividendo una foto con il filtro, le due parti conservano i rispettivi intervalli di scorrimento: la seconda non ricomincia dalla cima. Una sequenza unita di spezzoni della stessa foto può ricevere un movimento continuo; foto diverse mantengono movimenti distinti. Copia/incolla, salvataggio e Annulla/Ripristina conservano il filtro.

## Risoluzione e prestazioni

L'anteprima ritaglia direttamente la fotografia originale alla posizione corrente, senza prima ridurla a una striscia alta quanto il video e poi ingrandire quella striscia. Anche l'esportazione ritaglia **prima** di ridimensionare, con filtro Lanczos. Non vengono usate le miniature della libreria.

In esportazione l'immagine viene decodificata una volta per intervallo di composizione e mantenuta in memoria per generare i fotogrammi: non serve rileggerla dal disco per ogni fotogramma. Non vengono creati canvas grandi quanto tutta l'immagine.

La nitidezza finale dipende comunque dalla larghezza in pixel della foto originale e dalla risoluzione del video. Il filtro non può ricostruire dettagli assenti dal file. Per uno scorrimento più fluido sono consigliati 25–30 FPS; se un articolo molto lungo scorre troppo rapidamente, aumenta la durata della foto. Una fotografia più bassa del formato video non ha spazio verticale da percorrere e rimane stabile, adattata senza deformazioni.

## Verifiche

- Suite generale: **37 file di test superati**, circa 15 secondi.
- Esportazioni reali brevi controllate sui fotogrammi: cima, centro e fondo di una foto alta **12.000 pixel**, anche dopo divisione e con intervalli di composizione intermedi. Verificato il dettaglio di linee originali larghe due pixel, per rilevare riduzioni/interpolazioni distruttive.
- Foto da cinque minuti: verifica del modello e posizionamento della testina in anteprima a inizio, metà e fine; nessuna esportazione lunga.
- Prova Electron: applicazione con clic e trascinamento, caricamento dell'immagine originale a 12.000 pixel, scorrimento nell'anteprima, cambi di durata, divisione, Annulla/Ripristina e rimozione del solo effetto dalla barra della timeline.
- Validazione delle proprietà, salvataggio JSON, copia/incolla e continuità su foto unite.
- Le prove generali includono i tagli video VFR, l'audio, il volume variabile, i segnalibri e gli stacchetti precedenti.

Ogni comando di test è limitato a 170 secondi. Nessun EXE creato. Le verifiche grafiche sono state eseguite in Electron su Linux: la prova finale sul PC Windows resta utile, soprattutto con la specifica fotografia originale.
