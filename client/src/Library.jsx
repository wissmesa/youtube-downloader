import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';

export default function Library({ refreshKey }) {
  const { token } = useAuth();
  const [songs, setSongs] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [playlistSongs, setPlaylistSongs] = useState([]);
  const [showCreateInput, setShowCreateInput] = useState(false);
  const [showAddSongs, setShowAddSongs] = useState(false);

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchSongs = useCallback(async () => {
    const res = await fetch('/api/songs', { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setSongs(await res.json());
  }, [token]);

  const fetchPlaylists = useCallback(async () => {
    const res = await fetch('/api/playlists', { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setPlaylists(await res.json());
  }, [token]);

  useEffect(() => {
    Promise.all([fetchSongs(), fetchPlaylists()]).finally(() => setLoading(false));
  }, [fetchSongs, fetchPlaylists, refreshKey]);

  const deleteSong = async (id) => {
    await fetch(`/api/songs/${id}`, { method: 'DELETE', headers });
    setSongs(prev => prev.filter(s => s.id !== id));
    if (selectedPlaylist) {
      setPlaylistSongs(prev => prev.filter(s => s.id !== id));
    }
  };

  const createPlaylist = async () => {
    if (!newPlaylistName.trim()) return;
    const res = await fetch('/api/playlists', {
      method: 'POST', headers, body: JSON.stringify({ name: newPlaylistName.trim() }),
    });
    if (res.ok) {
      const pl = await res.json();
      setPlaylists(prev => [pl, ...prev]);
      setNewPlaylistName('');
      setShowCreateInput(false);
    }
  };

  const deletePlaylist = async (id, e) => {
    e.stopPropagation();
    await fetch(`/api/playlists/${id}`, { method: 'DELETE', headers });
    setPlaylists(prev => prev.filter(p => p.id !== id));
    if (selectedPlaylist?.id === id) { setSelectedPlaylist(null); setPlaylistSongs([]); }
  };

  const openPlaylist = async (pl) => {
    setSelectedPlaylist(pl);
    setShowAddSongs(false);
    if (pl.songs && pl.songs.length > 0) {
      try {
        const res = await fetch('/api/songs/by-ids', {
          method: 'POST', headers,
          body: JSON.stringify({ ids: pl.songs }),
        });
        if (res.ok) {
          setPlaylistSongs(await res.json());
        }
      } catch {
        setPlaylistSongs([]);
      }
    } else {
      setPlaylistSongs([]);
    }
  };

  const showAllSongs = () => {
    setSelectedPlaylist(null);
    setPlaylistSongs([]);
    setShowAddSongs(false);
  };

  const availableSongs = selectedPlaylist
    ? songs.filter(s => !(selectedPlaylist.songs || []).includes(s.id))
    : [];

  const addSongToPlaylist = async (playlistId, songId) => {
    const res = await fetch(`/api/playlists/${playlistId}/songs`, {
      method: 'POST', headers, body: JSON.stringify({ songId }),
    });
    if (res.ok) {
      const updated = await res.json();
      setPlaylists(prev => prev.map(p => p.id === updated.id ? updated : p));
      if (selectedPlaylist?.id === updated.id) openPlaylist(updated);
    }
  };

  const removeSongFromPlaylist = async (songId) => {
    if (!selectedPlaylist) return;
    const res = await fetch(`/api/playlists/${selectedPlaylist.id}/songs/${songId}`, {
      method: 'DELETE', headers,
    });
    if (res.ok) {
      const updated = await res.json();
      setPlaylists(prev => prev.map(p => p.id === updated.id ? updated : p));
      setSelectedPlaylist(updated);
      setPlaylistSongs(prev => prev.filter(s => s.id !== songId));
    }
  };

  const displaySongs = selectedPlaylist ? playlistSongs : songs;
  const headerTitle = selectedPlaylist ? selectedPlaylist.name : 'Todas las canciones';
  const headerCount = displaySongs.length;

  if (loading) {
    return <div className="loading-hint">Cargando biblioteca...</div>;
  }

  return (
    <div className="sp">
      <div className="sp-sidebar">
        <div className="sp-sidebar-header">
          <span className="sp-sidebar-title">Tu biblioteca</span>
          <button className="sp-add-btn" onClick={() => setShowCreateInput(prev => !prev)} title="Crear playlist">+</button>
        </div>

        {showCreateInput && (
          <div className="sp-create">
            <input
              type="text"
              placeholder="Nombre..."
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createPlaylist()}
              autoFocus
            />
            <button onClick={createPlaylist} disabled={!newPlaylistName.trim()}>Crear</button>
          </div>
        )}

        <div
          className={`sp-nav-item ${!selectedPlaylist ? 'sp-nav-active' : ''}`}
          onClick={showAllSongs}
        >
          <div className="sp-nav-icon sp-icon-songs">&#9835;</div>
          <div className="sp-nav-text">
            <span className="sp-nav-name">Canciones</span>
            <span className="sp-nav-count">{songs.length} canciones</span>
          </div>
        </div>

        <div className="sp-playlists-list">
          {playlists.map(pl => (
            <div
              key={pl.id}
              className={`sp-nav-item ${selectedPlaylist?.id === pl.id ? 'sp-nav-active' : ''}`}
              onClick={() => openPlaylist(pl)}
            >
              <div className="sp-nav-icon sp-icon-playlist">&#9776;</div>
              <div className="sp-nav-text">
                <span className="sp-nav-name">{pl.name}</span>
                <span className="sp-nav-count">{pl.songs?.length || 0} canciones{pl.creator_name ? ` · ${pl.creator_name}` : ''}</span>
              </div>
              <button className="sp-delete-btn" onClick={(e) => deletePlaylist(pl.id, e)} title="Eliminar">&times;</button>
            </div>
          ))}
        </div>
      </div>

      <div className="sp-main">
        <div className="sp-main-header">
          <div className="sp-main-header-text">
            <h2 className="sp-main-title">{headerTitle}</h2>
            <span className="sp-main-count">{headerCount} canciones</span>
          </div>
          {selectedPlaylist && (
            <button
              className={`sp-add-songs-btn ${showAddSongs ? 'active' : ''}`}
              onClick={() => setShowAddSongs(prev => !prev)}
            >
              + Agregar canciones
            </button>
          )}
        </div>

        {showAddSongs && selectedPlaylist && (
          <div className="sp-add-panel">
            {availableSongs.length === 0 ? (
              <p className="sp-add-empty">No hay mas canciones para agregar.</p>
            ) : availableSongs.map(song => (
              <div key={song.id} className="sp-add-row">
                <div className="sp-add-row-info">
                  {song.thumbnail && <img src={song.thumbnail} alt="" className="sp-track-thumb" />}
                  <div className="sp-track-name-wrap">
                    <span className="sp-track-name">{song.name}</span>
                    <span className="sp-add-row-meta">{song.channel || ''}</span>
                  </div>
                </div>
                <button
                  className="sp-add-row-btn"
                  onClick={() => addSongToPlaylist(selectedPlaylist.id, song.id)}
                >
                  Agregar
                </button>
              </div>
            ))}
          </div>
        )}

        {displaySongs.length > 0 && (
          <div className="sp-track-header">
            <span className="sp-col-num">#</span>
            <span className="sp-col-title">Titulo</span>
            <span className="sp-col-artist">Artista</span>
            <span className="sp-col-duration">Duracion</span>
            <span className="sp-col-actions"></span>
          </div>
        )}

        <div className="sp-track-list">
          {displaySongs.length === 0 ? (
            <p className="sp-empty">
              {selectedPlaylist
                ? 'Playlist vacia. Agrega canciones desde "Canciones".'
                : 'No tienes canciones. Descarga una para verla aqui.'}
            </p>
          ) : displaySongs.map((song, i) => (
            <div key={song.id} className="sp-track">
              <span className="sp-col-num">{i + 1}</span>
              <div className="sp-col-title">
                <div className="sp-track-info">
                  {song.thumbnail && <img src={song.thumbnail} alt="" className="sp-track-thumb" />}
                  <div className="sp-track-name-wrap">
                    <span className="sp-track-name">{song.name}</span>
                    <span className={`platform-badge ${song.platform === 'soundcloud' ? 'sc' : 'yt'}`}>
                      {song.platform === 'soundcloud' ? 'SC' : 'YT'}
                    </span>
                  </div>
                </div>
              </div>
              <span className="sp-col-artist">{song.channel || '—'}</span>
              <span className="sp-col-duration">{song.duration || '—'}</span>
              <div className="sp-col-actions">
                {!selectedPlaylist && playlists.length > 0 && (
                  <select
                    className="sp-select"
                    defaultValue=""
                    onChange={(e) => { if (e.target.value) addSongToPlaylist(parseInt(e.target.value), song.id); e.target.value = ''; }}
                  >
                    <option value="" disabled>+ Playlist</option>
                    {playlists.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                )}
                {selectedPlaylist && (
                  <button className="sp-remove-btn" onClick={() => removeSongFromPlaylist(song.id)} title="Quitar de playlist">
                    &minus;
                  </button>
                )}
                <button className="sp-remove-btn" onClick={() => deleteSong(song.id)} title="Eliminar cancion">
                  &times;
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
