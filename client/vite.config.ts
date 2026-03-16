import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // Force all imports of react/react-dom to resolve consistently (hoisted to root in monorepo)
      'react': path.resolve(__dirname, '../node_modules/react'),
      'react-dom': path.resolve(__dirname, '../node_modules/react-dom'),
    },
  },
})
