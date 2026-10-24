# AKhbar studio 0.4.4 — rilevamento GPU

La prova iniziale degli encoder usa ora dieci fotogrammi a 640×360 invece di due a 128×128. Dimensioni troppo piccole possono far rifiutare la prova a un encoder hardware funzionante. Il comando NVENC a 640×360 è stato eseguito con successo dall'utente su Windows con una RTX 2060.

L'esportazione continua a verificare le dimensioni e il formato pixel effettivamente richiesti, con ripiego CPU se non supportati. La scelta dell'encoder resta esplicita: in **Esporta → Elaborazione**, selezionare **GPU NVIDIA** per usare NVENC; un'impostazione CPU salvata non viene sostituita automaticamente. Composizione e filtri possono continuare a usare la CPU, quindi il tempo totale va misurato sul PC di destinazione.

Le correzioni dei tagli e dei video a cadenza variabile della 0.4.3 sono conservate. Nessun EXE generato.

## Verifiche

- Due prove simulate verificano il riconoscimento di un encoder che rifiuta fotogrammi troppo piccoli e il rifiuto di configurazioni di esportazione non supportate.
- Suite completa: 71 test superati, compresi i controlli reali FFmpeg sui tagli video e audio. Comando limitato a meno di tre minuti.
- L'ambiente cloud non dispone della RTX 2060: l'esportazione GPU completa va verificata sul PC dell'utente.
