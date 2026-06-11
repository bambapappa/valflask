import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://drygast.nu',
  output: 'static',
  build: {
    format: 'directory',
  },
});
