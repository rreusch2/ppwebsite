exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { referral_code, campaign, landing_path, user_agent } = JSON.parse(event.body || '{}');
    if (!referral_code) {
      return { statusCode: 400, body: 'Missing referral_code' };
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      // Soft-accept so marketing links still work without backend write
      return { statusCode: 202, body: 'Captured (no backend configured)' };
    }

    const insertResp = await fetch(`${SUPABASE_URL}/rest/v1/referral_leads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Prefer': 'return=representation',
      },
      body: JSON.stringify([
        {
          referral_code,
          campaign: campaign || null,
          landing_path: landing_path || null,
          user_agent: user_agent || null,
          medium: 'web'
        }
      ])
    });

    if (!insertResp.ok) {
      const text = await insertResp.text();
      return { statusCode: 502, body: `Supabase error: ${text}` };
    }

    return { statusCode: 201, body: 'ok' };
  } catch (e) {
    return { statusCode: 500, body: 'Server error' };
  }
};


