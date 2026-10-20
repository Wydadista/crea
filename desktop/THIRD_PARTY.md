# Componenti di terze parti

Crea Studio utilizza Electron (MIT), Node.js e Chromium, distribuiti con le rispettive licenze nel runtime Electron. Le dipendenze npm e le loro licenze sono incluse nel pacchetto applicativo.

FFmpeg è eseguito come processo separato, tramite `ffmpeg-static` 5.3.0 (GPL-3.0-or-later), distribuzione binari `b6.1.1`. Licenza, note del build e riferimenti upstream vengono conservati accanto al binario (`node_modules/ffmpeg-static/ffmpeg.LICENSE`, `ffmpeg.README`; sul build Windows anche `ffmpeg.exe.LICENSE` e `ffmpeg.exe.README`). Il motore utilizza il codec libx264.

- FFmpeg, sorgenti e licenze: https://ffmpeg.org/download.html e https://ffmpeg.org/legal.html
- Distribuzione binari e istruzioni di compilazione: https://github.com/eugeneware/ffmpeg-static/tree/b6.1.1
- Release dei binari: https://github.com/eugeneware/ffmpeg-static/releases/tag/b6.1.1

FFprobe è incluso attraverso `ffprobe-static` 3.1.0. Il pacchetto conserva la propria licenza e README, inclusi i riferimenti alle distribuzioni upstream; il binario è FFprobe 4.0.2, componente di FFmpeg. Per una distribuzione pubblica del prodotto occorre predisporre anche la disponibilità del codice sorgente corrispondente dei binari GPL e conservare gli avvisi di licenza. Questa prima versione è destinata a prove locali.
