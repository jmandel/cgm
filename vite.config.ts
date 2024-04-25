import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { nodePolyfills } from 'vite-plugin-node-polyfills'


// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), nodePolyfills()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        swEntry: resolve(__dirname, 'sw.html'),
        sw:resolve(__dirname, 'sw.ts')
      },
            output: {
        entryFileNames: '[name].js',
      },

    },
  },

})