# HVAC Cold Email Sequence (n8n)

Emails the leads from your scraper sheet automatically: 4 emails over 14 days, max 25 a day, 1–3 minutes apart. Any reply stops the sequence for that lead.

```
Weekdays 9am → Settings → Read Leads → Pick Today's Emails → (loop) Send via Gmail → Update row → wait 1–3 min
Gmail inbox (every 5 min) → Classify reply → mark lead replied / opted_out / bounced
```

| Email | Sent | Subject |
|---|---|---|
| 1 | day 0 | missed calls at [company] |
| 2 | +2 days | re: missed calls at [company] |
| 3 | +4 days | free 14-day test? |
| 4 | +7 days | closing your file |

## Setup

1. Import `hvac-cold-email-sequence.json` into n8n.
2. Open **Settings** and fill in your name, phone and **postal address** (required by law; the workflow refuses to send until you do).
3. Paste the **same Google Sheet URL** as your lead scraper into *Read Leads*, *Update Lead Row* and *Stop Sequence for Lead*.
4. Connect your **Gmail** account to *Send Email* and *New Reply in Gmail*.
5. Test: put your own email in one HOT row, click *Execute workflow*, check your inbox.
6. Activate.

New columns are added to the sheet automatically: `email_step`, `email_status`, `next_send_at`, `last_email_at`, `last_subject`, `gmail_thread_id`, `reply_snippet`, `replied_at`.

`email_status` values: `active` · `replied` (go call them!) · `opted_out` · `bounced` · `finished`.

## Don't burn your email

- **Use a separate domain** (e.g. `getcoolreply.com`, not your main one) and a Google Workspace inbox on it.
- **Warm it up** for 2 weeks before cold emailing: start at 5/day, increase slowly.
- Set up SPF, DKIM and DMARC for the domain.
- Keep `dailyLimit` at 20–30 per inbox. For more volume, add inboxes, not volume.
- Plain text only, no links or images in email 1.
