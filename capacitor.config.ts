import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ADHD.adhdcompanion',
  appName: 'ADHD Companion',
  // webDir is unused when server.url is set, but keep something valid:
  webDir: 'dist',
  server: {
    // Load your deployed Next.js inside the WebView:
    url: 'https://v0-adhd-companion-app-ruddy.vercel.app',
    cleartext: false,
    androidScheme: 'https'
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#FFFFFF'
  }
};

export default config;
