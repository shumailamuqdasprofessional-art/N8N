# Twilio Dialer

A phone in your browser: make calls to any number and answer calls to your Twilio number.
Built with Express and the Twilio Voice JavaScript SDK.

**Features:** keypad, call/hang up, mute, keypad tones during a call (for phone menus), answer or decline incoming calls, call timer, password login.

## 1. Set up Twilio (one time)
1. **Phone number:** in the Twilio Console, buy a number with Voice. This is your caller ID (`TWILIO_CALLER_ID`, e.g. `+15551234567`).
2. **API key:** go to Console → Account → API keys & tokens → *Create API key* (Standard). Copy the SID (`SK…`) and the Secret.
3. **TwiML App:** go to Console → Voice → TwiML Apps → *Create*. Set the **Voice Request URL** to
   `https://YOUR-DIALER-URL/voice` (HTTP POST). Copy its SID (`AP…`).
4. **Incoming calls (optional):** open your phone number's settings. Under *A call comes in*, choose that same TwiML App, or use the webhook `https://YOUR-DIALER-URL/voice`.
5. **Trial accounts** can only call numbers you have verified. Calls to other countries must be allowed under Voice → Settings → *Geo Permissions*.

## 2. Run it
```bash
cd dialer
npm install
cp .env.example .env    # fill in your values
node --env-file=.env server.js
```
Open http://localhost:3000 and enter your `DIALER_PASSWORD`.

Twilio must be able to reach `/voice`. To test on your own computer, start a tunnel (for example `ngrok http 3000`) and use the tunnel URL in the TwiML App.

## 3. Deploy
You can host it on any Node.js service (Hostinger Node.js, Render, Railway, …):
- **Start command:** `npm start`
- **Root folder:** `dialer`
- **Environment variables:** everything from `.env.example`. Set `PUBLIC_URL` to your public `https://` address so Twilio's security check passes behind a proxy.

The page needs **HTTPS** to use the microphone, except on `localhost`.

## Security
- `/token` needs `DIALER_PASSWORD`, so strangers can't make calls on your account. Use a long password.
- `/voice` checks Twilio's signature and rejects any other request.
- Numbers must be in `+countrycode…` format. Turn off countries you don't call in Twilio *Geo Permissions* to prevent fraud.
