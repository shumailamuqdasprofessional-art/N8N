# n8n Messaging Relay (Meta WhatsApp + Twilio SMS & Calls)

A small server that receives messages and calls and sends them to n8n.

| Route | Who calls it | What it does |
|---|---|---|
| `GET /` | Meta | WhatsApp webhook verification |
| `POST /` | Meta | WhatsApp messages → n8n (`N8N_WEBHOOK_URL`) |
| `POST /twilio/sms` | Twilio | Incoming SMS / WhatsApp → n8n (`N8N_TWILIO_SMS_URL`) |
| `POST /twilio/voice` | Twilio | Incoming call: plays greeting, forwards to `FORWARD_CALLS_TO` (or records voicemail) → n8n |
| `POST /twilio/status` | Twilio | Delivery / call status updates → n8n |

## 1. Run the server

```bash
npm install
cp .env.example .env   # fill in your values
npm start
```

Deploy on Render, Railway, or any Node host. Set the same values as Environment Variables there.
`TWILIO_AUTH_TOKEN` turns on the security check, so only real Twilio requests are accepted.
Set `PUBLIC_URL` to your app's public address, or the check will fail behind the host's proxy.

## 2. Twilio setup

1. Sign up at twilio.com, then copy the **Account SID** and **Auth Token**.
2. **Phone Numbers → Buy a number** (with SMS + Voice).
3. Open the number and set:
   - **Messaging → A message comes in** → `https://YOUR-APP/twilio/sms` (HTTP POST)
   - **Voice → A call comes in** → `https://YOUR-APP/twilio/voice` (HTTP POST)
   - **Voice → Call status changes** → `https://YOUR-APP/twilio/status` (optional)
4. Trial accounts can only text or call **verified numbers** (Phone Numbers → Verified Caller IDs).
5. US numbers: finish **A2P 10DLC** registration before sending real SMS.

## 3. n8n setup

1. **Credentials → New → Twilio API** → paste the Account SID and Auth Token.
2. **Workflows → Import from File** for each file in `workflows/`:

| File | What it does | Trigger |
|---|---|---|
| `1-send-sms.json` | Send an SMS or WhatsApp message | POST `/webhook/send-sms` with `{"to":"+1...","message":"Hi","whatsapp":false}` |
| `2-sms-auto-reply.json` | Auto-replies to every incoming SMS / WhatsApp | app.js → `/webhook/twilio-sms` |
| `3-call-dialer.json` | Calls a list of numbers one by one (30s gap) | Click **Execute workflow** |
| `4-call-and-status-log.json` | Cleans up incoming call and status data for logging | app.js → `/webhook/twilio-events` |

3. In each **Twilio** node: choose your Twilio credential and replace `+10000000000` with your Twilio number.
4. In **3-call-dialer**: edit the **Call List** node with your numbers, and replace `+10000000009` with the phone that should take the call. You can swap the Call List for a Google Sheets node.
5. In **4-call-and-status-log**: add a Google Sheets, Airtable, or email node after **Format Log** to save the records.
6. **Activate** the workflows. Copy each webhook's **Production URL** into the matching `N8N_TWILIO_*` variable.

## Rules (important)

- Only text or auto-call people who gave you permission.
- Twilio handles **STOP / UNSUBSCRIBE** replies automatically on normal numbers. Don't message people who opted out.
- Don't call outside 8am–9pm in the customer's time zone.
