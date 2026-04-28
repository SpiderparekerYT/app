import type { CapacitorConfig } from '@capacitor/cli';

const serverUrl = process.env.CAP_SERVER_URL?.trim();
const isHttpServer = Boolean(serverUrl?.startsWith('http://'));

const config: CapacitorConfig = {
  appId: 'com.prism.social',
  appName: 'Prism',
  webDir: 'dist',
  ...(serverUrl
    ? {
        server: {
          url: serverUrl,
          cleartext: isHttpServer,
          androidScheme: isHttpServer ? 'http' : 'https',
        },
      }
    : {}),
};

export default config;
