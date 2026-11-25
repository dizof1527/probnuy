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

  let present=false;
  function heartbeat(){if(present && !document.hidden)void client.rpc('bgau_heartbeat').then(()=>{});}
  setInterval(heartbeat,45000);
  document.addEventListener('visibilitychange',heartbeat);
  let visitTimer;
  client.auth.onAuthStateChange((event, session) => {
    if (!['INITIAL_SESSION','SIGNED_IN','SIGNED_OUT'].includes(event)) return;
    present=!!session;
    clearTimeout(visitTimer);
    if (session) visitTimer=setTimeout(async () => {
      heartbeat();
      const {error}=await client.rpc('bgau_record_site_visit');
      if (!error) window.dispatchEvent(new Event('bgau-visit-recorded'));
    },0);
  });

  function showDailyTraffic(panel) {
    if (!panel) return;
    let request = 0;
    async function refresh() {
      if (document.hidden) return;
      const revision = ++request;
      const {data,error} = await client.rpc('bgau_daily_traffic');
      if (revision !== request) return;
      for (const key of ['users','visits']) {
        panel.querySelector('[data-'+key+']').textContent =
          !error && Number.isSafeInteger(data?.[key]) ? data[key].toLocaleString(document.documentElement.lang) : '—';
      }
    }
    void refresh();
    window.addEventListener('bgau-visit-recorded',refresh);
    document.addEventListener('visibilitychange',refresh);
    setInterval(refresh,60000);
  }

  window.bgauCloud = { client, readRole, showDailyTraffic };
})();
