import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { StatusProvider } from './features/system/contexts/StatusContext.jsx'
import { ThemeProvider } from './features/system/contexts/ThemeContext.jsx'

createRoot(document.getElementById('root')).render(
    <StatusProvider>
        <ThemeProvider>
            <App />
        </ThemeProvider>
    </StatusProvider>
)