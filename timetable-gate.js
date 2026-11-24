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
  let teacherMode = false;

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

  function concealWorkspace() {
    concealPersonal();
    const teacher = document.getElementById('teacherWorkspace');
    if (teacher) teacher.hidden = true;
  }

  async function mountTeacherWorkspace() {
    const response = await fetch('./teacher.html');
    if (!response.ok) throw new Error('Teacher workspace unavailable');
    const page = new DOMParser().parseFromString(await response.text(), 'text/html');
    const header = page.querySelector('.site-header');
    const main = page.querySelector('main');
    const stylesheet = page.querySelector('link[rel=stylesheet]');
    const script = [...page.scripts].find(element => element.getAttribute('src')?.startsWith('./teacher.js'));
    if (!header || !main || !stylesheet || !script) throw new Error('Teacher workspace incomplete');
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = stylesheet.getAttribute('href');
    await new Promise((resolve,reject) => {
      style.onload = resolve;
      style.onerror = reject;
      document.head.append(style);
    });
    if (!activeUser) return;
    const workspace = document.createElement('div');
    workspace.id = 'teacherWorkspace';
    workspace.hidden = true;
    workspace.append(header,main);
    document.body.append(workspace);
    await loadScript(script.getAttribute('src'));
    if (!activeUser) return;
    document.title = page.title;
    workspace.hidden = false;
    document.getElementById('timetableGate').hidden = true;
  }

  async function showOwnAvatar(link, userId) {
    try {
      const {data,error}=await client.rpc('bgau_get_avatar');
      if(error || activeUser!==userId || !link?.isConnected) return;
      if(!data){link.querySelector("img")?.remove();return}
      const image=new Image();
      image.alt='';
      image.src='data:image/jpeg;base64,'+data.replace(/\s/gu,'');
      await image.decode();
      if(activeUser===userId){link.querySelector("img")?.remove();link.append(image)}
    } catch { /* The profile icon is available while the photo loads. */ }
  }

  async function bootstrap() {
    try {
      const {data:{session},error:sessionError}=await client.auth.getSession();
      if(sessionError)throw sessionError;
      if(!session){goToAccount();return}
      if(await cloud.readRole(session.user.id)==='teacher'){
        activeUser=session.user.id;
        teacherMode=true;
        await mountTeacherWorkspace();
        void showOwnAvatar(document.querySelector('#teacherWorkspace .account-shortcut'),session.user.id);
        return;
      }
      const {data:access,error:accessError}=await client.rpc('bgau_access_status');
      if(accessError)throw accessError;
      if(access!=='ready'){goToAccount(access);return}
      const {data:personal}=await client.rpc('bgau_personal_timetable_menu');
      const entries = Array.isArray(personal) ? personal : [];
      const entry = entries.find(item => item.owner_id === session.user.id);
      const {data,error}=await client.rpc('bgau_read_timetable');
      if(error)throw error;
      if(!data?.schedule?.groups)throw new Error('Timetable unavailable');
      activeUser=session.user.id;
      void showOwnAvatar(document.getElementById('accountShortcut'),session.user.id);
      useProfilePreferences(session.user,data.preferences,data.schedule.groups);
      if (entry) {
        const {data:sheet,error:sheetError}=await client.rpc('bgau_read_personal_timetable',{p_owner_id:entry.owner_id});
        if(activeUser!==session.user.id)return;
        if (!sheetError && sheet && Array.isArray(sheet.common) && Array.isArray(sheet.odd) && Array.isArray(sheet.even)) {
          const key=addPersonalGroup(data.schedule,sheet);
          personalLoaded=true;
          personalOwner=entry.owner_id;
          window.bgauInitialGroup=key;
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
      const role=await cloud.readRole(activeUser);
      if(teacherMode!==(role==='teacher')){
        concealWorkspace();location.reload();return;
      }
      if(teacherMode)return;
      const {data,error}=await client.rpc('bgau_access_status');
      if(!error&&data!=='ready'){concealPersonal();goToAccount(data);return}
      if(personalLoaded){
        const {data:entries,error:menuError}=await client.rpc('bgau_personal_timetable_menu');
        if(!menuError&&!entries?.some(entry=>entry.owner_id===personalOwner)){
          concealPersonal();location.replace('./');return;
        }
      }
    } catch { /* The displayed timetable was already delivered to an authorized account. */ }
  }

  client.auth.onAuthStateChange((event,session)=>{
    if(activeUser&&(event==='SIGNED_OUT'||(session&&session.user.id!==activeUser))){activeUser=null;concealWorkspace();goToAccount()}
  });
  window.addEventListener('pagehide',concealWorkspace);
  window.addEventListener('pageshow',event=>{if(event.persisted&&(personalLoaded||teacherMode))location.reload()});
  function refreshAvatar(){
    if(activeUser && !document.hidden) void showOwnAvatar(document.querySelector(teacherMode?'#teacherWorkspace .account-shortcut':'#accountShortcut'),activeUser);
  }
  window.addEventListener('pageshow',event=>{if(event.persisted && !personalLoaded && !teacherMode) refreshAvatar()});
  document.addEventListener('visibilitychange',refreshAvatar);
  setInterval(()=>void checkAccess(),60000);
  document.addEventListener('visibilitychange',()=>void checkAccess());
  void bootstrap();
})();
