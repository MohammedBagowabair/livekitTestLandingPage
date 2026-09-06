# LiveKit demo landing page (WaslAcademy)

Arabic RTL demo UI for live video sessions via LiveKit. This site only requests a short-lived join token from the WaslAcademy API; media goes browser ↔ LiveKit Cloud (no recording in this demo).

## GitHub Pages

- Site: `https://mohammedbagowabair.github.io/livekitTestLandingPage/`

## Online demo (production API)

1. Open the Pages URL.
2. API base is already `https://api.waslacademy.net`.
3. Log in to WaslAcademy, copy your external **Bearer JWT**, paste it into the page.
4. Same room name on both devices → **انضم للجلسة**.

Requirements on the API host:

- `LiveKit__Enabled=true`
- `LiveKit__Url` / `LiveKit__ApiKey` / `LiveKit__ApiSecret`
- CORS includes `https://mohammedbagowabair.github.io`

`POST /api/demo/livekit/dev-external-token` works **only in Development** (localhost). It will not work against production.

## Local Development API

1. Run the API with LiveKit user-secrets enabled.
2. Set API base to `https://localhost:7056`.
3. Use **احصل على رمز تجريبي محلي**, then join.

## Security

Never put LiveKit API secrets in this repo. Only paste an external user JWT in the browser for the demo.
