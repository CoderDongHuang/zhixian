# ADR 001: React Native client for the formal app

Status: Accepted for V0.4

## Decision

Build the formal iOS and Android client with React Native and Expo. Use Expo Router when navigation expands beyond the initial shell, Expo SecureStore for refresh-token storage, native notifications for push, and platform speech APIs for playback. Keep server contracts shared with the mini program: short-lived access tokens, rotating refresh tokens, cursor synchronization, and idempotency keys.

## Why

React Native gives this product direct access to notifications, background refresh, offline storage, audio controls, and app-store distribution while retaining TypeScript and React skills from the web application. Expo reduces signing and native build overhead without preventing later custom native modules.

## Boundaries

- The app never stores API keys or provider secrets.
- Refresh tokens use SecureStore; access tokens remain in memory.
- SQLite owns offline article, bookmark, and sync-queue state.
- All mutations carry an idempotency key and client timestamp.
- The web, mini program, and native app share server models, not UI components.

## Rollout

V0.4 starts with authentication, feed, offline reading, bookmark sync, learning tasks, push registration, and speech playback. EAS preview builds precede store signing and production releases.
