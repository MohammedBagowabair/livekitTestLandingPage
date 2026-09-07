# LiveKit demo landing page (WaslAcademy) — no JWT

Arabic RTL demo UI for live video sessions via LiveKit. The page requests a short-lived join token from the WaslAcademy API **without** an Authorization header or pasted JWT; media goes browser ↔ LiveKit Cloud (no recording in this demo).

## GitHub Pages

- Site: `https://mohammedbagowabair.github.io/livekitTestLandingPage/`

## Online demo (production API)

1. Open the Pages URL.
2. API base defaults to `https://api.waslacademy.net`.
3. Enter a display name and room name (same room on both devices).
4. Click **انضم للجلسة** — no JWT paste step.

`POST /api/demo/livekit/token` body:

```json
{ "roomName": "...", "displayName": "...", "clientInstanceId": "..." }
```

No `Authorization` header.

## API host requirements

- `LiveKit__Enabled=true`
- `LiveKit__Url`
- `LiveKit__ApiKey`
- `LiveKit__ApiSecret`
- CORS must allow `https://mohammedbagowabair.github.io` (and optionally `http://localhost` for local static serving)

## Local static page + remote API

Serve this folder with any static server, keep API base as production (or your API), and join. If you get **401**, the API still requires auth on the demo token endpoint. If you get **503**, the API is down or LiveKit is not ready.

## Security

Never put LiveKit API secrets in this repo. The browser only receives short-lived room tokens minted by your API.
