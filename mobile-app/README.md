# Zhixian mobile

React Native/Expo client for V0.4 stage one. It includes email OTP authentication, SecureStore refresh tokens, feed and bookmark synchronization, offline reading, learning tasks, Expo push registration, and Chinese speech playback.

Configure `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_EAS_PROJECT_ID`, then run `npm install` and `npm start`. Push tokens require a physical device and an EAS project. Offline articles and sync snapshots use AsyncStorage; credentials never leave SecureStore.
