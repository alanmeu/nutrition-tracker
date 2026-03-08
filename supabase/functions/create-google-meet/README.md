# Create Google Meet Edge Function

## Required secrets

Set these in Supabase project secrets:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`
- `GOOGLE_CALENDAR_ID` (optional, default: `primary`)

## Deploy

```bash
supabase functions deploy create-google-meet
```

## Google Cloud setup (OAuth)

1. Create a Google Cloud project.
2. Enable `Google Calendar API`.
3. Configure OAuth consent screen.
4. Create OAuth client credentials.
5. Generate a refresh token with scope:
   - `https://www.googleapis.com/auth/calendar.events`

The refresh token must belong to the Google account owning the target calendar.
