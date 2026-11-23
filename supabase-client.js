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

  window.bgauCloud = { client, readRole };
})();
