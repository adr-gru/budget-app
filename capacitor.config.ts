import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.adriang.budget',
  appName: 'Budget',
  webDir: 'dist',
  ios: {
    contentInset: 'always',
    backgroundColor: '#f5f5f7'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: '#f5f5f7',
      showSpinner: false
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert']
    }
  }
}

export default config
