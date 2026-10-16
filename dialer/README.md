# Twilio Dialer

A phone in your browser. It calls any number from your Twilio (USA) number, and it rings when someone calls that number.

**Features:** keypad, call/hang up, mute, keypad tones during a call (for phone menus), answer or decline incoming calls, call timer, password login.

## It sets up Twilio for you
You only give it **3 things**. When you log in for the first time, it automatically:
- creates an API key,
- creates a TwiML App named **"Twilio Dialer"** that points to this dialer,
- uses your Twilio phone number as the caller ID,
- connects incoming calls on that number to the dialer, if the number isn't already used for something else.

## 1. Get your Twilio details
On the Twilio Console home page (console.twilio.com), copy the **Account SID** and the **Auth Token**.

You need at least one Twilio phone number that can make calls (Phone Numbers → Active numbers).

## 2. Put it online (needs https)
Twilio must be able to reach the dialer on the internet. Any Node.js host works (Hostinger Node.js app, Render, Railway…):
- **Root folder:** `dialer`
- **Build command:** `npm install`
- **Start command:** `npm start`
- **Environment variables:**
  - `TWILIO_ACCOUNT_SID`
  - `TWILIO_AUTH_TOKEN`
  - `DIALER_PASSWORD`, a long password you choose
  - `PUBLIC_URL`, your site address such as `https://dialer.yoursite.com` (recommended)

To test on your own computer instead:
```bash
cd dialer
npm install
cp .env.example .env      # fill in the 3 values
npx ngrok http 3000       # in a second window; copy the https URL into PUBLIC_URL
node --env-file=.env server.js
```

## 3. Call
Open your https address, enter the password, and allow the microphone. Type a number with its country code (for example `+1 212 555 0100`) and press **Call**.

## If a call doesn't go through
- **Trial account:** you can only call numbers that are verified under Phone Numbers → Verified Caller IDs. The other person also hears a short trial message first. To call anyone, upgrade the account.
- **Calls to other countries:** turn on each country under Voice → Settings → Geo Permissions.
- **Calls don't ring in the browser:** your number already had its own call settings, so the dialer left them alone (the server log says so). In Twilio, open your number and set *A call comes in* to the TwiML App **Twilio Dialer**.

## Security
- Only someone with `DIALER_PASSWORD` can make calls. Use a long password.
- `/voice` checks Twilio's signature and rejects any other request.
- Never share your Auth Token or commit it to GitHub. `.env` is already ignored by git.
