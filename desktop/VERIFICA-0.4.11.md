# AKhbar studio 0.4.11 — registratore compatto e bordi della selezione

Modifiche circoscritte alla finestra del registratore e allo stile dei bordi delle clip. Nessuna modifica a tagli, montaggio, effetti, qualità o percorsi di esportazione.

## Registratore

Durante il conto alla rovescia, la cattura, la pausa e il salvataggio, la finestra passa a una barra nera di 480 × 64 pixel. Mostra contatore, livello microfono, **Scarta e ricomincia**, **Pausa/Riprendi**, **Stop**, **Riduci in icona** e chiusura. Nome e impostazioni restano nella finestra iniziale, che ricompare dopo lo stop senza chiudere il registratore.

Lo scarto interrompe anche eventuali scritture bloccate dalla conversione della cattura, prima di attenderne il completamento. Il comando **Scarta e ricomincia** elimina la cattura corrente senza importarla e riparte con lo stesso nome e le stesse impostazioni, dopo il conto alla rovescia 2–1.

Il primo piano usa il livello `screen-saver` di Electron. Le impostazioni della finestra cambiano alle transizioni di stato, senza ripeterle a ogni aggiornamento del livello audio. Quando il registratore perde il focus, il suo ordine viene ripristinato senza richiedere il focus alla finestra: si può continuare a usare l'altra applicazione. La riduzione in icona esplicita viene rispettata; il ripristino riattiva il primo piano.

## Bordi delle clip

Clip normali, unite e gruppi hanno un contorno grigio di **1 pixel**. Il contorno diventa **giallo #FFC82E di 2 pixel** solo quando selezionato, senza altri aloni. Nei segmenti uniti restano le linee interne sottili e i bordi interni non ridimensionabili.

## Verifica

- `timeout 170s npm test`: suite completa superata in circa 14 secondi, incluse le prove dei tagli VFR e dei percorsi di esportazione esistenti.
- Prova mirata della gestione finestra: nessun cambiamento nativo durante gli aggiornamenti audio o pausa/ripresa, ordine superiore senza richiedere focus, rispetto della riduzione in icona.
- Prova Electron con audio e video sintetici: registrazione, pausa/ripresa, primo piano, riduzione/ripristino, scarto e riavvio, stop e importazione, finestra persistente e stili dei bordi.

Nessun EXE generato. Le prove cloud usano Linux; la verifica del comportamento sopra il browser su Windows va completata sul PC dell'utente.
