import { useState, useRef, useCallback } from 'react';

const API_BASE = '/api';

function SongItem({ item, onNameChange, onDownloadFile }) {
  return (
    <div className={`song-item song-${item.status}`}>
      <div className="song-header">
        {item.thumbnail && (
          <img src={item.thumbnail} alt={item.title} className="song-thumb" />
        )}
        <div className="song-meta">
          <h4>{item.title || item.url}</h4>
          {item.channel && (
            <p className="song-channel">{item.channel} &middot; {item.duration}</p>
          )}
        </div>
      </div>

      {item.status === 'ready' && (
        <div className="filename-group">
          <label>Nombre:</label>
          <input
            type="text"
            value={item.fileName}
            onChange={(e) => onNameChange(item.id, e.target.value)}
            placeholder="Nombre del archivo"
          />
        </div>
      )}

      {item.status === 'loading' && (
        <div className="song-status-text loading-hint">Obteniendo info...</div>
      )}

      {item.status === 'downloading' && (
        <div className="progress-section">
          <div className="progress-bar-bg">
            <div className="progress-bar-fill" style={{ width: `${item.progress}%` }} />
          </div>
          <p className="progress-text">
            {item.progress > 0 ? `${item.progress.toFixed(0)}%` : 'Iniciando...'}
          </p>
        </div>
      )}

      {item.status === 'done' && (
        <div className="song-done-row">
          <span className="status-done">Listo!</span>
          <button className="btn btn-sm btn-download" onClick={() => onDownloadFile(item)}>
            Guardar MP3
          </button>
        </div>
      )}

      {item.status === 'error' && (
        <div className="error">{item.error}</div>
      )}
    </div>
  );
}

export default function MultiDownload() {
  const [urlsText, setUrlsText] = useState('');
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const pollIntervals = useRef({});

  const parseUrls = (text) => {
    return text
      .split(/[\n,]+/)
      .map(u => u.trim())
      .filter(u => u.length > 0);
  };

  const updateSong = useCallback((id, updates) => {
    setSongs(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  }, []);

  const fetchAllInfo = async () => {
    const urls = parseUrls(urlsText);
    if (urls.length === 0) return;

    const items = urls.map((url, i) => ({
      id: `song-${i}-${Date.now()}`,
      url,
      title: '',
      channel: '',
      duration: '',
      thumbnail: '',
      fileName: '',
      status: 'loading',
      progress: 0,
      fileId: null,
      error: null,
    }));

    setSongs(items);
    setLoading(true);

    await Promise.all(items.map(async (item) => {
      try {
        const res = await fetch(`${API_BASE}/info`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: item.url }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        setSongs(prev => prev.map(s =>
          s.id === item.id
            ? { ...s, ...data, fileName: data.title, status: 'ready' }
            : s
        ));
      } catch (err) {
        setSongs(prev => prev.map(s =>
          s.id === item.id
            ? { ...s, status: 'error', error: err.message }
            : s
        ));
      }
    }));

    setLoading(false);
  };

  const pollStatus = useCallback((songId, fileId) => {
    pollIntervals.current[songId] = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/status/${fileId}`);
        const data = await res.json();

        if (data.status === 'done') {
          clearInterval(pollIntervals.current[songId]);
          updateSong(songId, { status: 'done', progress: 100 });
        } else if (data.status === 'error') {
          clearInterval(pollIntervals.current[songId]);
          updateSong(songId, { status: 'error', error: data.error });
        } else if (data.progress != null) {
          updateSong(songId, { progress: data.progress });
        }
      } catch {}
    }, 1000);
  }, [updateSong]);

  const downloadAll = async () => {
    setDownloading(true);

    const readySongs = songs.filter(s => s.status === 'ready');
    setSongs(prev => prev.map(s =>
      s.status === 'ready' ? { ...s, status: 'downloading', progress: 0 } : s
    ));

    await Promise.all(readySongs.map(async (song) => {
      try {
        const res = await fetch(`${API_BASE}/download`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: song.url }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        updateSong(song.id, { fileId: data.fileId });
        pollStatus(song.id, data.fileId);
      } catch (err) {
        updateSong(song.id, { status: 'error', error: err.message });
      }
    }));

    setDownloading(false);
  };

  const onNameChange = (id, value) => {
    updateSong(id, { fileName: value });
  };

  const onDownloadFile = (song) => {
    if (!song.fileId) return;
    const name = song.fileName.trim() || 'audio';
    const a = document.createElement('a');
    a.href = `${API_BASE}/file/${song.fileId}?name=${encodeURIComponent(name)}`;
    a.download = `${name}.mp3`;
    a.click();
  };

  const downloadAllFiles = () => {
    const doneSongs = songs.filter(s => s.status === 'done');
    doneSongs.forEach((song, i) => {
      setTimeout(() => onDownloadFile(song), i * 500);
    });
  };

  const readySongs = songs.filter(s => s.status === 'ready');
  const doneSongs = songs.filter(s => s.status === 'done');
  const hasDownloading = songs.some(s => s.status === 'downloading');

  return (
    <div className="tab-content">
      <textarea
        className="multi-input"
        placeholder={"Pega las URLs de YouTube (una por linea):\nhttps://youtube.com/watch?v=...\nhttps://youtube.com/watch?v=..."}
        value={urlsText}
        onChange={(e) => setUrlsText(e.target.value)}
        disabled={loading || downloading || hasDownloading}
        rows={4}
      />

      <button
        className="btn btn-primary btn-full"
        onClick={fetchAllInfo}
        disabled={loading || downloading || hasDownloading || !urlsText.trim()}
      >
        {loading ? (
          <>
            <span className="spinner" />
            Buscando...
          </>
        ) : `Buscar (${parseUrls(urlsText).length} URLs)`}
      </button>

      {songs.length > 0 && (
        <div className="songs-list">
          {songs.map(song => (
            <SongItem
              key={song.id}
              item={song}
              onNameChange={onNameChange}
              onDownloadFile={onDownloadFile}
            />
          ))}
        </div>
      )}

      {readySongs.length > 0 && !hasDownloading && (
        <button className="btn btn-download" onClick={downloadAll}>
          Descargar todas ({readySongs.length})
        </button>
      )}

      {doneSongs.length > 1 && !hasDownloading && (
        <button className="btn btn-download" onClick={downloadAllFiles}>
          Guardar todas ({doneSongs.length} MP3)
        </button>
      )}
    </div>
  );
}
