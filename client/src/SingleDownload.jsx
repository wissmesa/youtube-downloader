import { useState, useCallback, useRef } from 'react';

const API_BASE = '/api';

export default function SingleDownload() {
  const [url, setUrl] = useState('');
  const [videoInfo, setVideoInfo] = useState(null);
  const [fileName, setFileName] = useState('');
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
    setFileName('');
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

    try {
      const res = await fetch(`${API_BASE}/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setVideoInfo(data);
      setFileName(data.title);
    } catch (err) {
      setError(err.message || 'Error al obtener info del video');
    } finally {
      setLoading(false);
    }
  }, [url]);

  const pollStatus = useCallback((id) => {
    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/status/${id}`);
        const data = await res.json();
        if (data.progress != null) setProgress(data.progress);

        if (data.status === 'done') {
          clearInterval(pollingRef.current);
          setDone(true);
          setFileId(id);
          setProgress(100);
          setDownloading(false);
        } else if (data.status === 'error') {
          clearInterval(pollingRef.current);
          setError(data.error || 'Error en la descarga');
          setDownloading(false);
        }
      } catch {}
    }, 1000);
  }, []);

  const startDownload = useCallback(async () => {
    setDownloading(true);
    setProgress(0);
    setError('');
    setDone(false);

    try {
      const res = await fetch(`${API_BASE}/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setFileId(data.fileId);
      pollStatus(data.fileId);
    } catch (err) {
      setError(err.message || 'Error al iniciar descarga');
      setDownloading(false);
    }
  }, [url, pollStatus]);

  const downloadFile = () => {
    if (!fileId) return;
    const name = fileName.trim() || 'audio';
    const a = document.createElement('a');
    a.href = `${API_BASE}/file/${fileId}?name=${encodeURIComponent(name)}`;
    a.download = `${name}.mp3`;
    a.click();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !loading) fetchInfo();
  };

  return (
    <div className="tab-content">
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

          <div className="filename-group">
            <label>Nombre del archivo:</label>
            <input
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              disabled={downloading}
              placeholder="Nombre del archivo"
            />
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
