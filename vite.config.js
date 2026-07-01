import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/coil-tracker/',   // GitHub Pages 레포 이름에 맞게 변경
})
