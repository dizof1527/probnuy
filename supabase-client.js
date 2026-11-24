(function () {
  if (!window.supabase || !location.protocol.startsWith('http')) return;

  const client = window.supabase.createClient(
    'https://dleqixjgnupsvgqmlrio.supabase.co',
    "sb_publishable_VmD9fFlV9gHJx_qQQF3pFQ_-KT4cDN4",
    { auth: { flowType: 'pkce' } }
  );

  async function readRole(userId) {
    const { data, error } = await client.from('bgau_roles').select('role').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    return data?.role || 'student';
  }

  let visitTimer;
  client.auth.onAuthStateChange((event, session) => {
    if (!['INITIAL_SESSION','SIGNED_IN','SIGNED_OUT'].includes(event)) return;
    clearTimeout(visitTimer);
    if (session) visitTimer=setTimeout(async () => {
      const {error}=await client.rpc('bgau_record_site_visit');
      if (!error) window.dispatchEvent(new Event('bgau-visit-recorded'));
    },0);
  });

  window.bgauCloud = { client, readRole };
})();
