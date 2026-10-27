# AKhbar studio 0.4.12 — finestra iniziale del registratore

La finestra iniziale del registratore mostra soltanto **Nome file**, indicatore del microfono, **Inizia registrazione**, **Impostazioni**, **Riduci in icona** e **Chiudi**. Contatore, Pausa, Stop e Scarta sono nascosti finché la registrazione non comincia.

La larghezza della finestra iniziale passa da 1080 a 720 pixel per evitare lo spazio lasciato dai comandi rimossi. La barra durante la cattura resta di 480 × 64 pixel, con i comandi della 0.4.11. Dopo Stop torna la finestra iniziale semplificata.

Verifiche mirate: gestione delle dimensioni e del primo piano; prova Electron con registrazione sintetica, controllo degli elementi visibili prima dell'avvio e dopo Stop, pausa/ripresa, scarto e riavvio, riduzione/ripristino e bordi della timeline. Ogni comando ha un limite di 170 secondi.

Nessun cambiamento a montaggio o esportazione. Nessun EXE generato.
