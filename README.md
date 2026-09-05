# LiveKit demo landing page (WaslAcademy)

Arabic RTL demo UI for live video sessions via LiveKit. This site only requests a short-lived join token from the WaslAcademy API; media goes browser ↔ LiveKit Cloud (no recording in this demo).

## GitHub Pages

After pushing `main`, enable Pages: **Settings → Pages → Deploy from branch `main` / root (`/`)**.

Expected URL:

- Project site: `https://mohammedbagowabair.github.io/livekitTestLandingPage/`

## How to use

1. Run WaslAcademy API locally (or non-prod) with LiveKit enabled via user-secrets:
   - `LiveKit:Enabled=true`
   - `LiveKit:Url` / `LiveKit:ApiKey` / `LiveKit:ApiSecret`
2. Open this page (Pages URL or a local static server).
3. Set API base to your local HTTPS URL (e.g. `https://localhost:7056`).
4. Click **احصل على رمز تجريبي محلي** (do not paste a production JWT against local API).
5. Enter display name + room name, then **انضم للجلسة**.

CORS on the API must include `https://mohammedbagowabair.github.io`.

## Security

Never put LiveKit API secrets in this repo. Only paste an external user JWT in the browser for the demo.
