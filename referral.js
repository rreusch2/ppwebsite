(() => {
  try {
    const params = new URLSearchParams(window.location.search);
    const referralCode = params.get('ref') || params.get('referral') || params.get('r');
    const campaign = params.get('cmp') || params.get('utm_campaign') || undefined;
    if (!referralCode) return;

    // Store for 30 days
    const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
    const payload = { code: referralCode.toUpperCase(), campaign, expiresAt };
    localStorage.setItem('pp_referral', JSON.stringify(payload));

    // Fire-and-forget lead capture (ignore CORS errors)
    const body = {
      referral_code: payload.code,
      campaign: campaign,
      landing_path: window.location.pathname + window.location.search,
      user_agent: navigator.userAgent,
    };
    fetch('/.netlify/functions/referral-lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      mode: 'cors',
    }).catch(() => {});
  } catch {}
})();

// Expose a helper for the native app to read any stored referral code
window.predictivePlayGetReferral = function () {
  try {
    const raw = localStorage.getItem('pp_referral');
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data.expiresAt || Date.now() > data.expiresAt) {
      localStorage.removeItem('pp_referral');
      return null;
    }
    return data.code;
  } catch {
    return null;
  }
};


