# HVAC Lead Scraper (n8n)

Finds HVAC businesses in any city, state or country using the official **Google Places API**, scores them, pulls emails from their websites, and saves everything to a Google Sheet.

```
Form (locations) → Build Queries → Google Places (up to 60 per location)
  → Clean + Score → Fetch Website → Find Emails + Booking Check → Google Sheet
```

## Setup (about 15 minutes)

1. **Google Places API key**
   - Go to <https://console.cloud.google.com>, create a project, enable **Places API (New)**, and add billing (there is a free monthly allowance; check current pricing).
   - APIs & Services → Credentials → *Create API key*. Restrict it to Places API.
2. **Import the workflow**: n8n → *Workflows → Import from file* → `hvac-lead-scraper.json`.
3. **Credential for "Google Places Search"**: create a *Header Auth* credential:
   - Name: `X-Goog-Api-Key`
   - Value: your API key
4. **Google Sheet**: create a sheet with a tab named `Leads` and this header row:

   `place_id | business_name | phone | international_phone | website | email | all_emails | address | search_location | rating | reviews | lead_score | lead_status | score_reasons | has_online_booking | has_chat_widget | website_checked | google_maps_url | scraped_at`

   Paste the sheet URL into the **Save to Google Sheet** node and connect your Google account.
5. **Activate** the workflow and open the form URL (shown on the *Lead Search Form* node).

## Using it

Enter one location per line:

```
Austin, Texas
Houston, Texas
Phoenix, Arizona
Toronto, Canada
Manchester, UK
```

- Google returns **max 60 results per search**, so to cover a whole state, list its cities (e.g. 30 Texas cities ≈ up to 1,800 leads).
- Running it again is safe: rows are updated by `place_id`, never duplicated.
- Change *Search term* for other niches: `plumber`, `roofing contractor`, `electrician`.

## Lead score

| Signal | Points |
|---|---|
| Has phone | +30 |
| 5–150 reviews (small/medium shop, best fit) | +30 |
| 151–400 reviews | +10 |
| Has website | +20 |
| Rating below 4.3 | +10 |
| Email found on website | +10 |
| No online booking or chat widget on site | +10 |

**HOT** ≥ 70 · **WARM** 40–69 · **COLD** < 40. Companies with 400+ reviews usually have a call center already.

## Important rules

- **Do not auto-text or auto-call scraped phone numbers.** In the US, the TCPA bans automated texts or calls to cell phones without consent, with fines of $500–1,500 per message. Call them manually or email.
- **Cold email**: follow CAN-SPAM (US): real name and address, clear opt-out. In the UK/EU, GDPR applies to business emails too.
- Google's Places terms limit long-term storage of Places data. Use the sheet as a working outreach list, not a resold database.
- Emails are only found if they appear on the homepage. Many sites list them on `/contact` instead.

---

## Free option: Apify version (`hvac-lead-scraper-apify.json`)

Same workflow, but it uses Apify's Google Maps Scraper instead of the Google API. No credit card and no Google Cloud setup.

1. Sign up at <https://apify.com>. The free plan gives **$5 of credit every month** (roughly 1,000–3,000 businesses; adding emails or reviews inside Apify uses credit faster, so this workflow finds emails itself).
2. Apify Console → *Settings → API & Integrations* → copy your **API token**.
3. In n8n, import `hvac-lead-scraper-apify.json` and create a **Query Auth** credential for the *Apify Google Maps Scraper* node:
   - Name: `token`
   - Value: your Apify API token
4. Set up the Google Sheet as above (an extra `category` column is added automatically).
5. In the form, set *Max results per location* (default 50, up to 500). Unlike the Google API, this is not capped at 60.

Each location can take 1–4 minutes. Keep locations per run small (5–10) so a run doesn't hit n8n's time limit.

## Other free options (manual, no n8n)

- **Instant Data Scraper** (free Chrome extension): open Google Maps, search "HVAC in Dallas", scroll, export CSV.
- **Outscraper**: first 500 records/month free, upload the CSV to your sheet.
