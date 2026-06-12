import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://drygast.nu',
  output: 'static',
  build: {
    format: 'directory',
    inlineStylesheets: 'never',
  },
  vite: {
    resolve: {
      alias: {
        '@/schemas': '../../pipeline/schemas',
        '@/data': '../../data',
      },
    },
  },
});
