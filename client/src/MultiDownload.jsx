import { useState, useRef, useCallback } from 'react';
import { useAuth } from './AuthContext';

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

      {(item.status === 'ready' || item.status === 'done') && (
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
  const { token } = useAuth();
  const [urls, setUrls] = useState(['']);
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const pollIntervals = useRef({});

  const addUrl = () => setUrls(prev => [...prev, '']);

  const removeUrl = (index) => {
    setUrls(prev => prev.length <= 1 ? [''] : prev.filter((_, i) => i !== index));
  };

  const changeUrl = (index, value) => {
    setUrls(prev => prev.map((u, i) => i === index ? value : u));
  };

  const validUrls = urls.filter(u => u.trim().length > 0);

  const updateSong = useCallback((id, updates) => {
    setSongs(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  }, []);

  const fetchAllInfo = async () => {
    if (validUrls.length === 0) return;

    const items = validUrls.map((url, i) => ({
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

  const saveSongToDB = useCallback(async (song) => {
    if (!token) return;
    try {
      await fetch(`${API_BASE}/songs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: song.fileName || song.title,
          url: song.url,
          platform: song.platform || 'youtube',
          thumbnail: song.thumbnail,
          channel: song.channel,
          duration: song.duration,
        }),
      });
    } catch {}
  }, [token]);

  const pollStatus = useCallback((songId, fileId) => {
    pollIntervals.current[songId] = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/status/${fileId}`);
        const data = await res.json();

        if (data.status === 'done') {
          clearInterval(pollIntervals.current[songId]);
          updateSong(songId, { status: 'done', progress: 100 });
          setSongs(prev => {
            const s = prev.find(x => x.id === songId);
            if (s) saveSongToDB(s);
            return prev;
          });
        } else if (data.status === 'error') {
          clearInterval(pollIntervals.current[songId]);
          updateSong(songId, { status: 'error', error: data.error });
        } else if (data.progress != null) {
          updateSong(songId, { progress: data.progress });
        }
      } catch {}
    }, 1000);
  }, [updateSong, saveSongToDB]);

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
    const url = `${API_BASE}/file/${song.fileId}?name=${encodeURIComponent(name)}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.mp3`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const downloadAllFiles = async () => {
    const doneSongs = songs.filter(s => s.status === 'done');
    for (const song of doneSongs) {
      onDownloadFile(song);
      await new Promise(r => setTimeout(r, 1000));
    }
  };

  const readySongs = songs.filter(s => s.status === 'ready');
  const doneSongs = songs.filter(s => s.status === 'done');
  const hasDownloading = songs.some(s => s.status === 'downloading');
  const isBusy = loading || downloading || hasDownloading;

  return (
    <div className="tab-content">
      <div className="url-list">
        {urls.map((url, index) => (
          <div className="url-row" key={index}>
            <span className="url-number">{index + 1}</span>
            <input
              type="text"
              placeholder="URL de YouTube o SoundCloud..."
              value={url}
              onChange={(e) => changeUrl(index, e.target.value)}
              disabled={isBusy}
            />
            <button
              className="btn-icon btn-remove"
              onClick={() => removeUrl(index)}
              disabled={isBusy || (urls.length <= 1 && !url)}
              title="Eliminar"
            >
              &times;
            </button>
          </div>
        ))}
      </div>

      <button
        className="btn-add"
        onClick={addUrl}
        disabled={isBusy}
      >
        + Agregar otra URL
      </button>

      <button
        className="btn btn-primary btn-full"
        onClick={fetchAllInfo}
        disabled={isBusy || validUrls.length === 0}
      >
        {loading ? (
          <>
            <span className="spinner" />
            Buscando...
          </>
        ) : `Buscar (${validUrls.length})`}
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
