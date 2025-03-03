import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { StatusProvider } from './contexts/StatusContext.jsx'
import { ThemeProvider } from './contexts/ThemeContext.jsx'

createRoot(document.getElementById('root')).render(
    <StatusProvider>
        <ThemeProvider>
            <App />
        </ThemeProvider>
    </StatusProvider>
)