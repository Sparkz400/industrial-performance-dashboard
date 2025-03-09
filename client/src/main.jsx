import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { StatusProvider, ThemeProvider } from './features/system/index'
import { LoadingProvider } from './shared/contexts/LoadingContext'

createRoot(document.getElementById('root')).render(
    <StatusProvider>
        <ThemeProvider>
            <LoadingProvider>
                <App />
            </LoadingProvider>
        </ThemeProvider>
    </StatusProvider>
)
