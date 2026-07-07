# TrailQuester (mobile)

The **player app** — used on a phone to walk a published TrailQuest route. React Native (Expo),
iOS-first. It mirrors the web player flow (`browse → preview → navigate → stop → finish`) against the
same FastAPI backend, adding a real map + live GPS.

This is the **MVP slice**: the five screens, a native map (`react-native-maps`, Apple base + OSM
tiles), live GPS position + distance to the next stop, a manual "Ik ben er" arrival, backend-driven
gating (3 attempts → reveal), points/badges, and an AsyncStorage cache of the active trail.

## Run it (iOS via Expo Go)

1. **Backend reachable on your LAN** (not `localhost` — the phone can't reach that):
   ```bash
   cd ../backend && source .venv/bin/activate
   uvicorn app.main:app --host 0.0.0.0 --port 8000
   ```
   For real content + route lines: `.env` with `poi_source=live`, an LLM provider, and
   `routing_provider=osrm`.
2. **Start the app** pointing at your machine's LAN IP:
   ```bash
   cd mobile && npm install
   EXPO_PUBLIC_API_BASE=http://<your-LAN-ip>:8000 npx expo start
   ```
   Open the project in **Expo Go** on an iPhone on the same Wi-Fi. (Native `fetch` isn't subject to
   CORS, so no backend CORS change is needed.)

## Test / typecheck

```bash
cd mobile
npx jest          # unit + component tests (react-native-maps / expo-location / AsyncStorage mocked)
npx tsc --noEmit  # types
```

The real map tiles, GPS dot, and distance are verified **on-device** — they don't run in jest.

## Structure

```
src/
  api/         types (shared with the web) · client (EXPO_PUBLIC_API_BASE) · trails (list/get/answer)
  store/       QuesterStore — phase machine (browse→…→finish) + AsyncStorage cache
  gamification.ts   pointsFor + deriveBadges (ported from the web)
  location/    useLocation (expo-location) + distanceKm (haversine)
  components/  TrailMap (OSM tiles + markers + route polyline) · QuestionCard · ui
  screens/     Browse · Preview · Navigate · Stop · Finish
App.tsx        QuesterProvider + phase switch
```

Gating is **backend-driven**: the app submits `{stop_order, answer, attempt}` and obeys
`AnswerResult.unlocked_next` — it never re-implements the correctness/gating engine.

## Deferred (next slices)

- True background **geofence** auto-arrival (currently manual "Ik ben er" + a proximity hint).
- **Offline** answer evaluation / full offline hardening (the trail is cached, but answer-checking
  needs connectivity).
- Optional **account** + server-side history/leaderboard sync.
- **Android** (needs a Google Maps API key) and app-store builds.
