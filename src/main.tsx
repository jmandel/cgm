import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

import data from './fixtures/JoshM_glucose_4-22-2024.libreview.json'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App data={data.map(d => ({...d, timestamp: new Date(d.timestamp)}))}/>
  </React.StrictMode>,
)
