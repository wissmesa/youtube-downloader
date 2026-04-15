import { useState, useCallback, useRef } from 'react';
import './App.css';

const API_BASE = '/api';

function App() {
  const [url, setUrl] = useState('');
  const [videoInfo, setVideoInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [fileId, setFileId] = useState(null);
  const pollingRef = useRef(null);

  const reset = () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    setVideoInfo(null);
    setError('');
    setProgress(0);
    setDone(false);
    setFileId(null);
    setDownloading(false);
  };

  const fetchInfo = useCallback(async () => {
    if (!url.trim()) return;
    reset();
    setLoading(true);
    console.log('[fetchInfo] URL:', url);

    try {
      const res = await fetch(`${API_BASE}/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      console.log('[fetchInfo] Status:', res.status);
      const data = await res.json();
      console.log('[fetchInfo] Data:', data);
      if (!res.ok) throw new Error(data.error);
      setVideoInfo(data);
    } catch (err) {
      console.error('[fetchInfo] Error:', err);
      setError(err.message || 'Error al obtener info del video');
    } finally {
      setLoading(false);
    }
  }, [url]);

  const pollStatus = useCallback((id) => {
    console.log('[poll] Iniciando polling para:', id);

    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/status/${id}`);
        const data = await res.json();
        console.log('[poll] Status:', data);

        if (data.progress != null) setProgress(data.progress);

        if (data.status === 'done') {
          clearInterval(pollingRef.current);
          setDone(true);
          setFileId(id);
          setProgress(100);
          setDownloading(false);
          console.log('[poll] Descarga completada');
        } else if (data.status === 'error') {
          clearInterval(pollingRef.current);
          setError(data.error || 'Error en la descarga');
          setDownloading(false);
          console.log('[poll] Error:', data.error);
        }
      } catch (err) {
        console.error('[poll] Error de conexión:', err);
      }
    }, 1000);
  }, []);

  const startDownload = useCallback(async () => {
    setDownloading(true);
    setProgress(0);
    setError('');
    setDone(false);
    console.log('[download] Iniciando:', url);

    try {
      const res = await fetch(`${API_BASE}/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      console.log('[download] Respuesta:', data);

      if (!res.ok) throw new Error(data.error);

      setFileId(data.fileId);
      pollStatus(data.fileId);
    } catch (err) {
      console.error('[download] Error:', err);
      setError(err.message || 'Error al iniciar descarga');
      setDownloading(false);
    }
  }, [url, pollStatus]);

  const downloadFile = () => {
    if (!fileId) return;
    const title = videoInfo?.title || 'audio';
    const a = document.createElement('a');
    a.href = `${API_BASE}/file/${fileId}`;
    a.download = `${title}.mp3`;
    a.click();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !loading) fetchInfo();
  };

  return (
    <div className="app">
      <h1>YouTube a MP3</h1>
      <p className="subtitle">Pega un enlace de YouTube y descarga el audio</p>

      <div className="input-group">
        <input
          type="text"
          placeholder="https://www.youtube.com/watch?v=..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading || downloading}
        />
        <button
          className="btn btn-primary"
          onClick={fetchInfo}
          disabled={loading || downloading || !url.trim()}
        >
          {loading ? (
            <>
              <span className="spinner" />
              Buscando...
            </>
          ) : 'Buscar'}
        </button>
      </div>

      {loading && (
        <div className="loading-hint">
          Consultando YouTube, esto puede tardar unos segundos...
        </div>
      )}

      {error && <div className="error">{error}</div>}

      {videoInfo && (
        <>
          <div className="video-info">
            <img src={videoInfo.thumbnail} alt={videoInfo.title} />
            <div className="video-details">
              <h3>{videoInfo.title}</h3>
              <p>{videoInfo.channel} &middot; {videoInfo.duration}</p>
            </div>
          </div>

          {!done && !downloading && !error && (
            <button className="btn btn-download" onClick={startDownload}>
              Descargar MP3
            </button>
          )}

          {downloading && (
            <div className="progress-section">
              <div className="progress-bar-bg">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="progress-text">
                {progress > 0
                  ? `Descargando... ${progress.toFixed(0)}%`
                  : 'Iniciando descarga...'}
              </p>
            </div>
          )}

          {done && (
            <>
              <p className="status-done">Listo!</p>
              <button className="btn btn-download" onClick={downloadFile}>
                Guardar archivo MP3
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default App;
