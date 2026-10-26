# AKhbar studio 0.4.10 — linea volume sulla clip

Il comando **Modifica volume**, nelle proprietà o nel menu del tasto destro, mostra una linea gialla sulla clip della timeline. Il 100% è a metà altezza; trascinando verso l'alto si aumenta il guadagno fino al 200%, verso il basso si arriva allo 0%. La percentuale è visibile accanto alla linea. Le nuove clip partono dal 100%; aprire il controllo non modifica il valore delle clip esistenti.

**Nascondi modifica volume** richiude il controllo mantenendo il volume scelto. La visibilità della linea è uno stato dell'interfaccia; il guadagno è salvato nel progetto, riprodotto in anteprima ed esportato usando gli stessi percorsi audio già presenti. Sono disponibili anche frecce da tastiera, Home e Fine sul controllo. Il gesto di trascinamento produce un singolo passaggio Annulla, e un gesto annullato ripristina il volume precedente.

Per gli elementi uniti o i gruppi compatti, la regolazione interessa le clip con audio del blocco. Se i valori iniziali sono differenti, la linea indica “misto” finché non viene scelto un valore comune. Tracce mute e clip mute mantengono il proprio stato. I media senza audio e i video con audio separato non abilitano il comando.

## Verifiche

- Suite completa `npm test` superata in circa 14 secondi. Tutti i comandi di prova sono limitati a 170 secondi.
- Nuove esportazioni reali FFmpeg: guadagni 0%, 50%, 100% e 200% nei percorsi diretto, a blocchi e con composizione. Il confronto misura il livello audio effettivo, inclusi silenzio e amplificazione.
- Verificati salvataggio/riapertura JSON, taglio, copia/incolla e limiti del nuovo intervallo di volume.
- Prova Electron con video, audio e immagine: comando dal menu e dalle proprietà, apertura senza cambiare il progetto, valore precedente al 50%, trascinamento 0–200%, un solo passo Annulla, ripristino, annullamento del gesto, tastiera, nascondi/mostra e comando disabilitato sui media senza audio. Posizioni, tagli, velocità e altri elementi restano identici durante la regolazione.
- Nessuna modifica ai motori di rendering video o di esportazione audio: il limite del volume nel modello passa da 100% a 200% per consentire l'amplificazione già supportata dai percorsi audio. I progetti con guadagni superiori al 100% richiedono questa versione.

Nessun EXE generato. Prove brevi e sintetiche nell'ambiente cloud; nessuna esportazione del progetto completo dell'utente.
