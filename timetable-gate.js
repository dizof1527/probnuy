(function () {
  'use strict';
  const status = document.getElementById('gateStatus');
  const cloud = window.bgauCloud;
  if (!cloud) {
    status.textContent = 'Для входа откройте опубликованный сайт через интернет.';
    return;
  }
  const { client } = cloud;
  let activeUser = null;

  function goToAccount(reason) {
    const url = new URL('./account.html',location.href);
    url.searchParams.set('next','schedule');
    if (reason) url.searchParams.set('reason',reason);
    location.replace(url.href);
  }

  function useProfilePreferences(user, preferences, groups) {
    if (!preferences || !Object.hasOwn(groups,preferences.group_key)) return;
    const {group_key,subgroup}=preferences;
    const signature=JSON.stringify([user.id,group_key,subgroup]);
    try {
      if (localStorage.getItem('bgau_profile_schedule_defaults')===signature) return;
      let previous;
      try { previous=JSON.parse(localStorage.getItem('bash_subgroup_prefs_v2')||'{}'); } catch { previous={}; }
      localStorage.setItem('bash_subgroup_prefs_v2',JSON.stringify({...previous,[group_key]:subgroup}));
      localStorage.setItem('bash_grp',group_key);
      localStorage.setItem('aip_sg',String(subgroup));
      localStorage.setItem('bgau_profile_schedule_defaults',signature);
    } catch { /* Browser storage is optional. */ }
  }

  function loadScript(path) {
    return new Promise((resolve,reject) => {
      const script=document.createElement('script');
      script.src=path;script.dataset.onlineFeature='';
      script.addEventListener('load',resolve,{once:true});
      script.addEventListener('error',reject,{once:true});
      document.body.append(script);
    });
  }

  async function bootstrap() {
    try {
      const {data:{session},error:sessionError}=await client.auth.getSession();
      if(sessionError)throw sessionError;
      if(!session){goToAccount();return}
      const {data:access,error:accessError}=await client.rpc('bgau_access_status');
      if(accessError)throw accessError;
      if(access!=='ready'){goToAccount(access);return}
      const {data,error}=await client.rpc('bgau_read_timetable');
      if(error)throw error;
      if(!data?.schedule?.groups)throw new Error('Timetable unavailable');
      activeUser=session.user.id;
      useProfilePreferences(session.user,data.preferences,data.schedule.groups);
      window.bgauTimetablePayload=data.schedule;
      await loadScript('./timetable.js');
      document.getElementById('timetableGate').hidden=true;
      document.getElementById('appShell').hidden=false;
      document.getElementById('footer').hidden=false;
      await loadScript('./schedule-cloud.js');
    } catch {
      status.textContent='Не удалось проверить доступ к расписанию. Проверьте интернет и обновите страницу.';
    }
  }

  async function checkAccess() {
    if(!activeUser||document.hidden||!navigator.onLine)return;
    try {
      const {data,error}=await client.rpc('bgau_access_status');
      if(!error&&data!=='ready')goToAccount(data);
    } catch { /* The displayed timetable was already delivered to an authorized account. */ }
  }

  client.auth.onAuthStateChange((event,session)=>{
    if(activeUser&&(event==='SIGNED_OUT'||(session&&session.user.id!==activeUser))) goToAccount();
  });
  setInterval(()=>void checkAccess(),60000);
  document.addEventListener('visibilitychange',()=>void checkAccess());
  void bootstrap();
})();
