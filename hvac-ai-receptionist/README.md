# HVAC AI Phone Receptionist (n8n + Twilio Voice)

```
Customer calls Twilio number
        │
n8n "Twilio Voice Webhook"  (/webhook/hvac-voice)
        │
Emergency check (gas, CO, smoke, sparks, flooding, "emergency")
   ├── YES → safety message → ring on-call tech(s) → SMS staff → CRM
   └── NO  → AI Receptionist (Claude)
               ├── HVAC_Knowledge_Base tool  → your existing HVAC RAG workflow
               ├── Book_Appointment tool     → hvac-booking-subworkflow.json
               └── decides: continue / transfer / end / emergency
                             │
                  transfer → picks department (service / sales / billing / manager)
                           → staff hear a whisper: who is calling and why
                           → caller is connected (no answer → callback promise + SMS)
        │
Customer hears the reply → loop until goodbye or hang-up
        │
Google Sheets CRM (Calls, Call Log, Bookings) + staff SMS
```

## Files
| File | What it is |
|---|---|
| `hvac-ai-receptionist.json` | Main call workflow (36 nodes) |
| `hvac-booking-subworkflow.json` | Booking tool: checks availability, saves booking, SMS customer and staff |
| `sheets-templates/*.csv` | Header rows for the 3 Google Sheet tabs |

## Setup
1. **Google Sheet**: create one spreadsheet with 3 tabs named exactly `Calls`, `Call Log` and `Bookings`.
   Paste the header row from each CSV in `sheets-templates/` into row 1 of its tab.
   Copy the sheet ID from its URL (`docs.google.com/spreadsheets/d/<THIS PART>/edit`).
2. **Import the booking workflow** (`hvac-booking-subworkflow.json`). Open **Booking Settings & Validate** and set
   your business name, timezone, sheet ID, staff SMS number and technicians per window. Add Google Sheets and Twilio
   credentials to its nodes. Save it, then copy its workflow ID from the URL.
3. **Your existing HVAC RAG workflow** must start with an *Execute Workflow Trigger* (“When Executed by Another
   Workflow”) that has one input called `query`, and its last node should output the answer text.
   Copy its workflow ID.
4. **Import the main workflow** (`hvac-ai-receptionist.json`).
   - **Config & Parse Call**: set business name, timezone, `departments` (who the AI can transfer to, and their phone
     numbers), emergency numbers, staff SMS number, sheet ID. Add or rename departments freely; the AI reads the list.
   - **HVAC_Knowledge_Base**: paste the RAG workflow ID. **Book_Appointment**: paste the booking workflow ID.
   - Add credentials: Anthropic (Claude Chat Model), Google Sheets (all CRM nodes), Twilio (SMS nodes).
     You can swap the Claude node for OpenAI or another chat model if you prefer.
   - Save and **Activate**.
5. **Twilio Console → Phone Numbers → your number → Voice configuration**
   - *A call comes in*: Webhook, `https://YOUR-N8N-DOMAIN/webhook/hvac-voice`, HTTP POST
   - *Call status changes*: `https://YOUR-N8N-DOMAIN/webhook/hvac-voice?stage=status`, HTTP POST
6. Call your number and test: a question, a booking, “can I talk to a person”, and “I smell gas”.

## How call transfer works
- The caller says something like "can I talk to someone about my bill" → the AI replies "Sure, I'll connect you to
  our billing team", sets `transfer_to: billing`, and Twilio dials the billing number(s).
- Staff hear a short whisper first ("AI receptionist transfer for billing. Caller Ana. Question about a double charge"),
  then the call connects. Turn it off with `whisperToStaff: false`.
- Staff also get an SMS with the caller's number and summary, and the CRM row shows `TransferredTo`.
- If nobody answers within 25 seconds, the caller is promised a callback, staff get a "MISSED" SMS, and the CRM
  row is marked `CallbackNeeded = Yes`.

## How it works
- Only one webhook is used. Twilio is sent back to it with `?stage=turn` (caller spoke),
  `?stage=dial` (transfer finished) and `?stage=status` (call ended).
- Call memory is keyed on Twilio's `CallSid`, so the AI remembers the whole call.
- If the AI errors or times out, the caller is transferred to staff instead of hearing silence.
- If nobody answers a transfer, the caller is told they'll get a callback, staff get an SMS, and the CRM row is flagged `CallbackNeeded = Yes`.
- CRM writes and SMS happen *after* the reply is sent to Twilio, so they don't slow the call down.

## Production notes
- **Simple memory** lives in n8n's memory. If you run n8n in queue mode (several workers) or restart often, switch
  the *Call Memory* node to Postgres or Redis chat memory using the same session key.
- **US SMS** to customers needs A2P 10DLC (or toll-free verification) registration on your Twilio number.
- Twilio waits up to 15 seconds for each reply. Keep the RAG workflow fast (small top-k, quick model).
- For extra security, put a Twilio signature check in front of the webhook.
