# Verifica delle modifiche timeline

Verifica cloud Linux sul ramo `akhbar-studio`. Nessun EXE o installer generato.

## Risultati

- `npm test`: 51 test superati, nessun fallimento o test saltato.
- `DISPLAY=:99 node test/group-cut-ui.cjs`: superato con Electron reale e media sintetici. Verifica maniglie solo esterne e riferimenti interni, trascinamento oltre un taglio, separazione, salvataggio e riapertura dei tagli uniti, colori distinti per inserimenti dello stesso file, movimento sincronizzato video/foto/audio su quattro tracce, separazione del gruppo, Ctrl+X/Ctrl+V, proprietà e disposizione relativa, campi di testo, taglio senza selezione su ciascun tipo di media, ambiguità e bordi. Verificato Annulla/Ripristina.
- `DISPLAY=:99 node test/workflow-editing-ui.cjs`: superato durante lo sviluppo; copertura della libreria, copia/incolla, chiusura spazi, aggancio, unione, annulla/ripristina, salvataggio/riapertura ed export MP4 di un secondo.
- `DISPLAY=:99 npm run test:ui`: non completato. Il primo script, `ui-smoke.cjs`, va in timeout sul campo `#clipStart` non visibile. Lo stesso fallimento è stato riprodotto su una copia dei sorgenti originali del commit `1dd99c406ad46d65e10a31ac8809e62f3f225759`, con le stesse dipendenze e lo stesso display. Gli script successivi della catena non sono stati eseguiti da quel comando. I selettori delle vecchie azioni di unione/separazione in questo test sono stati aggiornati ai nuovi nomi.
- Sintassi JavaScript e `git diff --check`: superati.

Non sono stati verificati driver, acquisizione hardware o installer Windows. Per avviare dal CMD sul proprio PC, dalla cartella `desktop`: `npm ci`, quindi `npm start`. I comandi di creazione installer rimangono quelli documentati nel README e non sono stati eseguiti in questa attività.
