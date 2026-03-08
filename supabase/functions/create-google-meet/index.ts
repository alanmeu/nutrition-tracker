const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

type CreateMeetPayload = {
  start: string;
  end: string;
  summary?: string;
  description?: string;
  timezone?: string;
};

async function getAccessToken() {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  const refreshToken = Deno.env.get("GOOGLE_REFRESH_TOKEN");

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Missing Google OAuth secrets in Edge Function env.");
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    })
  });

  const tokenData = await tokenResponse.json();
  if (!tokenResponse.ok || !tokenData.access_token) {
    throw new Error("Failed to retrieve Google access token.");
  }

  return tokenData.access_token as string;
}

async function createMeetEvent(accessToken: string, payload: CreateMeetPayload) {
  const calendarId = Deno.env.get("GOOGLE_CALENDAR_ID") || "primary";
  const timezone = payload.timezone || "Europe/Paris";
  const requestId = `nutri-${crypto.randomUUID()}`;

  const eventResponse = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        summary: payload.summary || "Rendez-vous visio Nutri Cloud",
        description: payload.description || "",
        start: {
          dateTime: payload.start,
          timeZone: timezone
        },
        end: {
          dateTime: payload.end,
          timeZone: timezone
        },
        conferenceData: {
          createRequest: {
            requestId,
            conferenceSolutionKey: { type: "hangoutsMeet" }
          }
        }
      })
    }
  );

  const eventData = await eventResponse.json();
  if (!eventResponse.ok) {
    throw new Error(eventData?.error?.message || "Failed to create Google Calendar event.");
  }

  const meetUrl =
    eventData?.hangoutLink ||
    eventData?.conferenceData?.entryPoints?.find((entry: { entryPointType?: string }) => entry.entryPointType === "video")?.uri ||
    "";

  if (!meetUrl) {
    throw new Error("Google Meet URL was not returned by Google Calendar.");
  }

  return {
    eventId: eventData.id as string,
    meetUrl: meetUrl as string
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as CreateMeetPayload;
    if (!body?.start || !body?.end) {
      return new Response(
        JSON.stringify({ error: "Missing start or end date." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    const accessToken = await getAccessToken();
    const result = await createMeetEvent(accessToken, body);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});
