import { useState } from 'react';
import './App.css';
import SingleDownload from './SingleDownload';
import MultiDownload from './MultiDownload';

function App() {
  const [tab, setTab] = useState('single');

  return (
    <div className="app">
      <h1>Audio Downloader</h1>
      <p className="subtitle">Descarga audio en MP3 desde YouTube o SoundCloud</p>

      <div className="platforms">
        <span className="platform-badge yt">YouTube</span>
        <span className="platform-badge sc">SoundCloud</span>
      </div>

      <div className="tabs">
        <button
          className={`tab ${tab === 'single' ? 'tab-active' : ''}`}
          onClick={() => setTab('single')}
        >
          Una cancion
        </button>
        <button
          className={`tab ${tab === 'multi' ? 'tab-active' : ''}`}
          onClick={() => setTab('multi')}
        >
          Varias canciones
        </button>
      </div>

      {tab === 'single' ? <SingleDownload /> : <MultiDownload />}
    </div>
  );
}

export default App;
