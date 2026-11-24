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
  let personalLoaded = false;
  let personalOwner = null;

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

  function addPersonalGroup(schedule, sheet) {
    const key = 'personal_timetable';
    const weeks = Array.from({length:17}, (_, index) => index + 1);
    const unknownTeacher = schedule.teachers.length;
    schedule.teachers.push('');
    const rows = [];
    for (const [type, lessons] of Object.entries({common:sheet.common, odd:sheet.odd, even:sheet.even})) {
      const lessonWeeks = weeks.filter(n => type === 'common' || n % 2 === Number(type === 'odd'));
      for (const lesson of lessons) {
        let subject = schedule.subjects.indexOf(lesson.subject);
        if (subject === -1) subject = schedule.subjects.push(lesson.subject) - 1;
        rows.push([lesson.day, lesson.slot, Number(lesson.kind === 'Лекция'), subject, lesson.place,
          unknownTeacher, lessonWeeks.join(', '), lesson.subgroup, lessonWeeks, lesson.start, lesson.end, [], lesson.kind]);
      }
    }
    schedule.groups[key] = rows;
    schedule.labels[key] = sheet.label;
    schedule.infos[key] = {course:1, mode:'Очная'};
    schedule.personalGroup = key;
    return key;
  }

  function concealPersonal() {
    if (!personalLoaded) return;
    for (const id of ['appShell','footer','modal','onboard']) document.getElementById(id).hidden = true;
  }

  async function bootstrap() {
    try {
      const {data:{session},error:sessionError}=await client.auth.getSession();
      if(sessionError)throw sessionError;
      if(!session){goToAccount();return}
      if(await cloud.readRole(session.user.id)==='teacher'){
        location.replace(new URL('./teacher.html',location.href).href);
        return;
      }
      const {data:access,error:accessError}=await client.rpc('bgau_access_status');
      if(accessError)throw accessError;
      if(access!=='ready'){goToAccount(access);return}
      const requested = new URLSearchParams(location.search).get('personal');
      const {data:personal}=await client.rpc('bgau_personal_timetable_menu');
      const entries = Array.isArray(personal) ? personal : [];
      const entry = entries.find(item => item.owner_id === requested)
        || entries.find(item => item.owner_id === session.user.id) || entries[0];
      const {data,error}=await client.rpc('bgau_read_timetable');
      if(error)throw error;
      if(!data?.schedule?.groups)throw new Error('Timetable unavailable');
      activeUser=session.user.id;
      useProfilePreferences(session.user,data.preferences,data.schedule.groups);
      if (entry) {
        const {data:sheet,error:sheetError}=await client.rpc('bgau_read_personal_timetable',{p_owner_id:entry.owner_id});
        if(activeUser!==session.user.id)return;
        if (!sheetError && sheet && Array.isArray(sheet.common) && Array.isArray(sheet.odd) && Array.isArray(sheet.even)) {
          const key=addPersonalGroup(data.schedule,sheet);
          personalLoaded=true;
          personalOwner=entry.owner_id;
          if (entry.owner_id===session.user.id || entry.owner_id===requested) window.bgauInitialGroup=key;
        }
      }
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
      if(!error&&data!=='ready'){concealPersonal();goToAccount(data);return}
      if(personalLoaded){
        const {data:entries,error:menuError}=await client.rpc('bgau_personal_timetable_menu');
        if(!menuError&&!entries?.some(entry=>entry.owner_id===personalOwner)){
          concealPersonal();location.replace('./');return;
        }
      }
      if(await cloud.readRole(activeUser)==='teacher')location.replace(new URL('./teacher.html',location.href).href);
    } catch { /* The displayed timetable was already delivered to an authorized account. */ }
  }

  client.auth.onAuthStateChange((event,session)=>{
    if(activeUser&&(event==='SIGNED_OUT'||(session&&session.user.id!==activeUser))){activeUser=null;concealPersonal();goToAccount()}
  });
  window.addEventListener('pagehide',concealPersonal);
  window.addEventListener('pageshow',event=>{if(event.persisted&&personalLoaded)location.reload()});
  setInterval(()=>void checkAccess(),60000);
  document.addEventListener('visibilitychange',()=>void checkAccess());
  void bootstrap();
})();
