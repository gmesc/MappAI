import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.insegnai.mappai.studente',
  appName: 'MappAI Studente',
  webDir: 'public',
  plugins: {
    CapacitorHttp: {
      enabled: true
    }
  }
};

export default config;
