import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.gmesc.mappai',
  appName: 'MappAI',
  webDir: 'public',
  plugins: {
    CapacitorHttp: {
      enabled: true
    }
  }
};

export default config;
