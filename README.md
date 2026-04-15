# YouTube a MP3 Downloader

Aplicación web para descargar audio de videos de YouTube en formato MP3.

## Requisitos

- **Node.js** >= 18
- **yt-dlp** instalado en el sistema (`brew install yt-dlp`)
- **ffmpeg** instalado en el sistema (`brew install ffmpeg`)

## Instalación

```bash
npm install
npm run install:all
```

## Uso

```bash
npm run dev
```

Abre `http://localhost:5173` en tu navegador.

## Estructura

```
├── client/    # Frontend React + Vite
├── server/    # Backend Express + yt-dlp
└── package.json
```
