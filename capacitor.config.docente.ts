import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.insegnai.mappai',
  appName: 'MappAI',
  webDir: 'public',
  plugins: {
    CapacitorHttp: {
      enabled: true
    }
  }
};

export default config;
