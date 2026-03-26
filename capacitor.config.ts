import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: "com.eilon.stagemaster",
  appName: 'EilonRonStage',
  webDir: 'build',
 /* server: {
    androidScheme: 'https',
    url: 'http://192.168.50.69:8100', // Borrar para subir aab!!!!!!!!!!!
    cleartext: true
  },*/
  plugins: {
    "BluetoothLe": {
      "displayStrings": {
        "scanning": "Scanning...",
        "cancel": "Cancel",
        "availableDevices": "Available Devices",
        "noDeviceFound": "No device found"
      }
    }
  }
};

export default config;
