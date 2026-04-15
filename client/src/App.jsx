import { useState, useEffect, useCallback } from 'react';
import './App.css';
import { AuthProvider, useAuth } from './AuthContext';
import AuthForm from './AuthForm';
import SingleDownload from './SingleDownload';
import MultiDownload from './MultiDownload';
import Library from './Library';

function AppContent() {
  const { user, loading, logout } = useAuth();
  const [dlTab, setDlTab] = useState('single');
  const [showAuth, setShowAuth] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const onSongSaved = useCallback(() => setRefreshKey(k => k + 1), []);

  useEffect(() => {
    if (user) setShowAuth(false);
  }, [user]);

  useEffect(() => {
    const root = document.getElementById('root');
    if (user) {
      root.className = 'logged-layout';
    } else {
      root.className = 'guest-layout';
    }
  }, [user]);

  if (loading) {
    return <div className="loading-hint" style={{ padding: 40, textAlign: 'center' }}>Cargando...</div>;
  }

  if (!user) {
    return (
      <>
        <div className="top-bar">
          <button className="btn-login-hint" onClick={() => setShowAuth(true)}>
            Iniciar sesion
          </button>
        </div>

        <div className="app">
          <h1>Audio Downloader</h1>
          <p className="subtitle">Descarga audio en MP3 desde YouTube o SoundCloud</p>
          <div className="platforms">
            <span className="platform-badge yt">YouTube</span>
            <span className="platform-badge sc">SoundCloud</span>
          </div>

          <div className="tabs">
            <button className={`tab ${dlTab === 'single' ? 'tab-active' : ''}`} onClick={() => setDlTab('single')}>
              Una cancion
            </button>
            <button className={`tab ${dlTab === 'multi' ? 'tab-active' : ''}`} onClick={() => setDlTab('multi')}>
              Varias canciones
            </button>
          </div>

          {dlTab === 'single' && <SingleDownload />}
          {dlTab === 'multi' && <MultiDownload />}
        </div>

        {showAuth && (
          <div className="modal-overlay" onClick={() => setShowAuth(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <button className="modal-close" onClick={() => setShowAuth(false)}>&times;</button>
              <AuthForm />
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="logged-shell">
      <header className="logged-header">
        <h1 className="logged-logo">Audio Downloader</h1>
        <div className="user-bar">
          <span className="user-name">{user.name}</span>
          <button className="btn-logout" onClick={logout}>Salir</button>
        </div>
      </header>

      <div className="logged-body">
        <aside className="dl-panel">
          <div className="dl-panel-inner">
            <h2 className="dl-panel-title">Descargar</h2>
            <div className="platforms" style={{ justifyContent: 'flex-start', marginBottom: 12 }}>
              <span className="platform-badge yt">YouTube</span>
              <span className="platform-badge sc">SoundCloud</span>
            </div>

            <div className="tabs">
              <button className={`tab ${dlTab === 'single' ? 'tab-active' : ''}`} onClick={() => setDlTab('single')}>
                Una
              </button>
              <button className={`tab ${dlTab === 'multi' ? 'tab-active' : ''}`} onClick={() => setDlTab('multi')}>
                Varias
              </button>
            </div>

            {dlTab === 'single' && <SingleDownload onSongSaved={onSongSaved} />}
            {dlTab === 'multi' && <MultiDownload onSongSaved={onSongSaved} />}
          </div>
        </aside>

        <main className="lib-panel">
          <Library refreshKey={refreshKey} />
        </main>
      </div>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
