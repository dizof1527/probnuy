(function () {
  'use strict';
  const el = id => document.getElementById(id);
  const status = el('status');
  const cloud = window.bgauCloud;
  const language = window.bgauAccountLanguage;
  const { t } = language;
  let currentNotice = '';
  let signedInProfile = null;

  function notify(key, error = false) {
    currentNotice = key;
    status.textContent = key ? t(key) : '';
    status.dataset.error = String(error);
    status.hidden = !key;
    if(key && !document.hidden && document.documentElement.dataset.motion!=='off' && !matchMedia('(prefers-reduced-motion: reduce)').matches){
      status.animate?.([{opacity:.5,translate:'0 3px'},{opacity:1,translate:'0 0'}],{duration:180,easing:'ease-out'});
    }
  }

  function showLanguagePicker(show) {
    el('languagePanel').hidden = !show;
    el('accountContent').hidden = show;
    el('changeLanguage').hidden = show;
  }

  el('changeLanguage').addEventListener('click', () => {
    showLanguagePicker(true);
    el('languagePanel').querySelector('[data-language]').focus();
  });
  el('languagePanel').addEventListener('click', event => {
    const button = event.target.closest('[data-language]');
    if (!button) return;
    language.apply(button.dataset.language);
    showLanguagePicker(false);
    notify(currentNotice, status.dataset.error === 'true');
    if (!cloud) { notify('noCloud', true); return; }
    refreshMode();
    signup.translate();
    settings.translate();
    if (signedInProfile) showProfile(signedInProfile);
    if (role === 'admin') void loadAccounts();
    void renderDailyVisits();
    if (!el('authPanel').hidden) el('authTitle').focus();
  });

  language.updatePage();
  showLanguagePicker(!language.selected);
  if (!cloud) {
    notify('noCloud', true);
    return;
  }
  const { client } = cloud;
  const pageSize = 30;
  const redirectTo = new URL('./account.html', location.href).href;
  const params = new URLSearchParams(location.search);
  const nextSchedule = params.get('next') === 'schedule';
  let mode = 'login', actor = null, role = '', generation = 0, listing = 0, search = '', offset = 0;
  let signupStep = 0;
  let authBusy = false;
  let catalogPromise;
  const studyModes = { 'Очная': 'fullTime', 'Очно-заочная': 'partTime', 'Заочная': 'distance' };

  function groups() {
    if (!catalogPromise) catalogPromise = (async () => {
      const {data,error}=await client.from('bgau_groups').select('group_key,label,course,study_mode,has_subgroups').order('course').order('label');
      if(error)throw error;
      return data;
    })().catch(error=>{catalogPromise=null;throw error});
    return catalogPromise;
  }

  function academicFields(id) {
    const fields = el(id);
    const content = el('profileFields').content.cloneNode(true);
    if (id === 'signupFields') {
      content.querySelector('legend').remove();
      el('signupIdentity').append(...content.querySelectorAll('[data-identity]'));
      el('signupStudy').append(content);
    } else {
      fields.append(content);
    }
    const field = name=>fields.querySelector(`[name="${name}"]`);
    const course=field('course'),group=field('group_key'),subgroup=field('subgroup');
    const hint = fields.querySelector('.name-hint');
    hint.id = id + '-name-hint';
    ['last_name','first_name','patronymic'].forEach(name => field(name).setAttribute('aria-describedby', hint.id));
    let catalog=[];
    function populate(select,values,placeholder,selected='') {
      select.replaceChildren(new Option(placeholder,''));
      values.forEach(([value,label])=>select.append(new Option(label,String(value))));
      select.value=String(selected);
      select.setCustomValidity('');
    }
    function populateSubgroups(selected='') {
      const selectedGroup=catalog.find(item=>item.group_key===group.value);
      if(!selectedGroup){populate(subgroup,[],t('groupFirst'));return}
      if(!selectedGroup.has_subgroups){populate(subgroup,[[0,t('noSubgroup')]],t('subgroup'),0);return}
      const pairs=[1,2].map(n=>[n,t('subgroupOption',{n})]);
      populate(subgroup,pairs,t('chooseSubgroup'),selected);
    }
    function populateGroups(selected='',selectedSubgroup='') {
      const pairs=catalog.filter(item=>String(item.course)===course.value)
        .map(item=>[item.group_key,item.label+' · '+(studyModes[item.study_mode] ? t(studyModes[item.study_mode]) : item.study_mode)]);
      populate(group,pairs,t(course.value?'chooseGroup':'courseFirst'),selected);
      populateSubgroups(selectedSubgroup);
    }
    function populateCourses(selected) {
      const courses=[...new Set(catalog.map(item=>item.course))].map(n=>[n,t('courseOption',{n})]);
      populate(course,courses,t('chooseCourse'),selected);
    }
    course.addEventListener('change',()=>populateGroups());
    group.addEventListener('change',()=>populateSubgroups());
    return {
      async fill(profile={},stillCurrent=()=>true) {
        const loaded=await groups();
        if(!stillCurrent())return;
        catalog=loaded;
        ['first_name','last_name','patronymic','nickname'].forEach(name=>field(name).value=profile[name]||'');
        populateCourses(catalog.find(item=>item.group_key===profile.group_key)?.course||'');
        populateGroups(profile.group_key,profile.subgroup);
      },
      translate() {
        const groupKey=group.value, subgroupNumber=subgroup.value;
        populateCourses(course.value);
        populateGroups(groupKey,subgroupNumber);
      },
      validateName() {
        const empty = ['first_name','last_name'].map(field).find(input => !input.value.trim());
        if (!empty) return true;
        empty.setCustomValidity(t('requiredField'));
        return empty.reportValidity();
      },
      payload() {
        const profile={};
        ['first_name','last_name','patronymic','group_key','subgroup','nickname'].forEach(name=>profile[name]=field(name).value.trim());
        if(!profile.first_name||!profile.last_name||!profile.group_key||!['0','1','2'].includes(profile.subgroup))
          throw Object.assign(new Error('Invalid profile'),{code:'profile_validation'});
        profile.subgroup=Number(profile.subgroup);
        return profile;
      }
    };
  }

  const signup = academicFields('signupFields');
  const settings = academicFields('settingsFields');
  language.updatePage();

  function displaySignupStep() {
    const registering = mode === 'signup';
    const onStudyStep = registering && signupStep === 1;
    const onIdentityStep = registering && !onStudyStep;
    el('signupProgress').hidden = el('signupFields').hidden = !registering;
    el('credentials').hidden = el('credentials').disabled = onStudyStep;
    el('signupIdentity').hidden = el('signupIdentity').disabled = !onIdentityStep;
    el('signupStudy').hidden = el('signupStudy').disabled = !onStudyStep;
    el('signupBack').hidden = !onStudyStep;
    el('stepIdentity').toggleAttribute('data-done', onStudyStep);
    el('stepIdentity').setAttribute('aria-current', onIdentityStep ? 'step' : 'false');
    el('stepStudy').setAttribute('aria-current', onStudyStep ? 'step' : 'false');
    el('authSubmit').textContent = t(onIdentityStep ? 'next' : mode + 'Submit');
  }

  function changeSignupStep(step) {
    signupStep = step;
    displaySignupStep();
    el(step === 0 ? 'stepIdentity' : 'stepStudy').focus();
  }

  function refreshMode() {
    const recovering = mode === 'update', reset = mode === 'reset', registering = mode === 'signup';
    el('authTitle').textContent = t(mode + 'Title');
    el('authIntro').textContent = t(mode + 'Intro');
    el('authPanel').querySelector('.auth-modes').hidden = recovering;
    el('emailLabel').hidden = recovering;
    el('authEmail').required = !recovering;
    el('authEmail').setCustomValidity('');
    el('passwordLabel').hidden = reset;
    el('authPassword').required = !reset;
    el('authPassword').setCustomValidity('');
    el('authPassword').minLength = registering || recovering ? 8 : 0;
    el('authPassword').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
    el('passwordHint').hidden = !(registering || recovering);
    el('recoveryButton').hidden = recovering || registering;
    el('recoveryButton').textContent = t(reset ? 'backToLogin' : 'forgot');
    displaySignupStep();
    document.querySelectorAll('[data-auth-mode]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.authMode === mode));
    });
  }

  function setMode(value) {
    mode = value;
    signupStep = 0;
    el('authPassword').value = '';
    refreshMode();
    if(value==='signup')void signup.fill({},()=>mode==='signup').catch(()=>notify('catalogError',true));
  }

  refreshMode();

  function authError(error) {
    const messages = {
      invalid_credentials: 'invalidCredentials',
      email_not_confirmed: 'emailNotConfirmed',
      signup_disabled: 'signupDisabled',
      over_email_send_rate_limit: 'emailLimit',
      weak_password: 'weakPassword',
      same_password: 'samePassword',
      otp_expired: 'linkExpired',
      profile_validation: 'profileValidation',
      user_already_exists: 'emailTaken',
      email_exists: 'emailTaken',
      '22023': 'groupValidation',
      '23505': 'nicknameTaken'
    };
    return messages[error?.code] || 'authError';
  }

  function describeRole(account) {
    const segments = [t(account.role || 'student')];
    if (account.banned) segments.push(t('banned'));
    return segments.join(' · ');
  }

  function showProfile(account) {
    el('profileRole').textContent = describeRole(account);
    el('ownNickname').textContent = t('yourNickname', { nick: account.nickname });
  }

  async function syncSession(event, session) {
    if (event === 'TOKEN_REFRESHED' && session?.user.id === actor?.id) return;
    if (event === 'SIGNED_IN' && session?.user.id === actor?.id && role) return;
    const request = ++generation;
    actor = session?.user || null;
    role = '';
    signedInProfile = null;
    el('accounts').replaceChildren();
    el('paging').hidden = true;
    el('adminPanel').hidden = true;
    el('profile').hidden = true;
    el('teacherPanel').hidden = true;
    el('personalPanel').hidden = true;
    el('personalLinks').replaceChildren();
    el('profileSettings').hidden = true;
    el('profileAvatar').removeAttribute('src');
    el('profileAvatar').hidden=true;
    el('avatarPlaceholder').hidden=false;
    closeCrop();
    if (!actor) {
      el('authPanel').hidden = false;
      if (event === 'SIGNED_OUT') setMode('login');
      return;
    }
    if (event === 'PASSWORD_RECOVERY' || mode === 'update') {
      setMode('update');
      el('authPanel').hidden = false;
      return;
    }

    el('authPanel').hidden = true;
    el('profile').hidden = false;
    el('profileRole').textContent = t('roleChecking');
    el('profileEmail').textContent = actor.email || '';
    try {
      const {data:account,error}=await client.rpc('bgau_my_profile');
      if(error||!account)throw error||new Error('Account not found');
      if (request !== generation) return;
      role=account.role;
      signedInProfile = account;
      showProfile(account);
      if(account.banned){notify('banNotice',true);return}
      if(role==='teacher'){
        if(nextSchedule){location.replace(new URL('./',location.href).href);return}
        el('teacherPanel').hidden=false;
      }
      if(nextSchedule&&(account.profile||role==='admin')) {
        const { data: access, error: accessError } = await client.rpc('bgau_access_status');
        if (request !== generation) return;
        if (accessError) throw accessError;
        if (access === 'ready') { location.replace(new URL('./',location.href).href); return; }
      }
      el('profileSettings').hidden=false;
      void loadPersonalLinks(request);
      el('avatarForm').hidden=!account.profile;
      if(nextSchedule&&!account.profile)notify('profileRequired');
      el('settingsFields').disabled = true;
      el('profileSave').disabled = true;
      void settings.fill(account.profile||{},()=>request===generation).then(() => {
        if (request !== generation) return;
        el('settingsFields').disabled = false;
        el('profileSave').disabled = false;
      }).catch(() => {
        if (request === generation) notify('catalogError',true);
      });
      if(account.profile)void loadOwnAvatar(request);
      if (role === 'admin') {
        el('adminPanel').hidden = false;
        offset = 0;
        await loadAccounts();
      }
    } catch {
      if (request !== generation) return;
      el('profileRole').textContent = t('roleUnknown');
      notify('roleError', true);
    }
  }

  async function loadPersonalLinks(request) {
    const {data,error}=await client.rpc('bgau_personal_timetable_menu');
    if(error||request!==generation||!data?.length)return;
    const links=el('personalLinks');
    for(const entry of data.filter(entry=>entry.owner_id===actor?.id)){
      const item=document.createElement('li');
      const link=document.createElement('a');
      const url=new URL('./',location.href);
      url.searchParams.set('personal',entry.owner_id);
      link.href=url.href;
      link.textContent=entry.display_name||t('privateTimetables');
      item.append(link);
      links.append(item);
    }
    el('personalPanel').hidden=!links.childElementCount;
  }

  async function loadAccounts() {
    const actorVersion = generation, request = ++listing;
    const list = el('accounts');
    const message = el('listStatus');
    el('paging').hidden = true;
    list.replaceChildren();
    message.textContent = t('adminLoading');
    try {
      const { data, error } = await client.rpc('bgau_list_members', { p_search: search, p_offset: offset });
      if (error) throw error;
      if (actorVersion !== generation || request !== listing) return;
      for (const account of data.slice(0, pageSize)) list.append(accountRow(account));
      message.textContent = data.length ? '' : t('adminEmpty');
      el('prevPage').disabled = offset === 0;
      el('nextPage').disabled = data.length <= pageSize;
      el('paging').hidden = offset === 0 && data.length <= pageSize;
    } catch {
      if (actorVersion === generation && request === listing) message.textContent = t('adminError');
    }
  }

  function accountRow(account) {
    const item = document.createElement('div');
    item.className = 'user';
    const details = document.createElement('div');
    const email = document.createElement('strong');
    email.textContent = account.email || t('noEmail');
    const description = document.createElement('p');
    description.textContent = describeRole(account)+(account.confirmed?'':' · '+t('pendingEmail'));
    details.append(email, description);
    const fullName=[account.last_name,account.first_name,account.patronymic].filter(Boolean).join(' ');
    if(fullName){const name=document.createElement('p');name.textContent=fullName;details.append(name)}
    if(account.group_label){
      const group=document.createElement('p');
      group.textContent=[account.group_label,t('courseOption',{n:account.course}),account.subgroup?t('subgroupOption',{n:account.subgroup}):t('noSubgroup')].join(' · ');
      details.append(group);
    }
    const activity=document.createElement('p');
    activity.textContent=t('visitStats',{today:account.today_visits,total:account.total_visits});
    details.append(activity);
    item.append(details);
    const actions=document.createElement('div');
    actions.className='buttons';
    item.append(actions);
    if(account.has_avatar){
      const show=document.createElement('button');
      show.type='button';show.textContent=t('showAvatar');
      show.addEventListener('click',async()=>{
        show.disabled=true;
        try{
          const avatar=await getAvatar(account.user_id);
          if(!avatar||!item.isConnected)return;
          const image=document.createElement('img');
          image.className='avatar';image.alt=t('memberAvatar');image.src=avatar;
          details.prepend(image);show.remove();
        }catch{notify('memberAvatarError',true)}finally{show.disabled=false}
      });
      actions.append(show);
    }
    if (account.role === 'admin') return item;

    const nextRole = account.role === 'teacher' ? 'student' : 'teacher';
    const change = document.createElement('button');
    change.type = 'button';
    change.textContent = t(nextRole === 'teacher' ? 'promote' : 'demote');
    change.disabled = nextRole === 'teacher' && !account.confirmed;
    change.addEventListener('click', async () => {
      const actorVersion = generation;
      change.disabled = true;
      try {
        const { error } = await client.rpc('bgau_assign_role', { p_user_id: account.user_id, p_role: nextRole });
        if (error) throw error;
        if (actorVersion !== generation) return;
        notify('roleChanged');
        item.replaceWith(accountRow({ ...account, role: nextRole }));
      } catch {
        if (actorVersion !== generation) return;
        change.disabled = false;
        notify('roleChangeError', true);
      }
    });
    actions.append(change);
    if(account.role==='teacher'){
      const assignments=document.createElement('button');
      assignments.type='button';
      assignments.textContent='Предметы преподавателя';
      assignments.onclick=()=>void editTeacherAssignment(item,account.user_id);
      actions.append(assignments);
    }
    const ban=document.createElement('button');
    ban.type='button';ban.textContent=t(account.banned?'unblock':'block');
    ban.addEventListener('click',async()=>{
      if(!account.banned&&!window.confirm(t('confirmBan')))return;
      const actorVersion=generation;
      ban.disabled=true;
      try{
        const {error}=await client.rpc('bgau_set_banned',{p_user_id:account.user_id,p_banned:!account.banned});
        if(error)throw error;
        if(actorVersion!==generation)return;
        item.replaceWith(accountRow({...account,banned:!account.banned}));
        notify(account.banned?'memberUnblocked':'memberBlocked');
        void renderDailyVisits();
      }catch{if(actorVersion===generation)notify('accessChangeError',true)}
      finally{ban.disabled=false}
    });
    actions.append(ban);
    return item;
  }

  async function editTeacherAssignment(item, userId) {
    if(item.querySelector('.teacher-assignment')){
      item.querySelector('.teacher-assignment').remove();
      return;
    }
    const form=document.createElement('form');
    form.className='teacher-assignment';
    const message=document.createElement('p');
    message.setAttribute('role','status');
    message.textContent='Загружаем преподавателей…';
    form.append(message);
    item.append(form);
    try{
      const {data,error}=await client.rpc('bgau_teacher_options',{p_user_id:userId});
      if(error)throw error;
      if(!form.isConnected)return;
      const label=document.createElement('label');
      label.textContent='Имя преподавателя в расписании';
      const roster=document.createElement('select');
      roster.required=true;
      roster.append(new Option('Выберите преподавателя',''));
      const teachers=Object.keys(data.courses).map(Number).filter(id=>data.teachers[id]);
      teachers.sort((a,b)=>data.teachers[a].localeCompare(data.teachers[b],'ru'));
      teachers.forEach(id=>roster.add(new Option(data.teachers[id],String(id))));
      roster.value=data.assignment?.teacher_id ?? '';
      label.append(roster);
      const subjects=document.createElement('fieldset');
      const buttons=document.createElement('div');
      buttons.className='buttons';
      const save=document.createElement('button');
      save.type='submit';
      save.textContent='Сохранить предметы';
      const clear=document.createElement('button');
      clear.type='button';
      clear.textContent='Снять назначение';
      clear.hidden=!data.assignment;
      buttons.append(save,clear);
      form.prepend(label,subjects);
      form.append(buttons);
      message.textContent='';

      function showSubjects(selected=[]) {
        const legend=document.createElement('legend');
        legend.textContent='Предметы, доступные для редактирования';
        subjects.replaceChildren(legend);
        for(const id of data.courses[roster.value]||[]){
          const choice=document.createElement('label');
          const box=document.createElement('input');
          box.type='checkbox';
          box.value=String(id);
          box.checked=selected.includes(id);
          choice.append(box,data.subjects[id]);
          subjects.append(choice);
        }
      }
      showSubjects(data.assignment?.subject_ids);
      roster.onchange=()=>showSubjects();
      async function submit(remove){
        if(save.disabled)return;
        const ids=[...subjects.querySelectorAll('input:checked')].map(box=>Number(box.value));
        if(!remove&&!ids.length){message.textContent='Выберите хотя бы один предмет.';return}
        save.disabled=clear.disabled=true;
        try{
          const {error}=await client.rpc('bgau_set_teacher_assignment',{
            p_user_id:userId,p_teacher_id:remove?null:Number(roster.value),p_subject_ids:remove?[]:ids
          });
          if(error)throw error;
          if(remove){roster.value='';showSubjects()}
          clear.hidden=remove;
          message.textContent=remove?'Назначение снято.':'Предметы сохранены.';
        }catch{message.textContent='Не удалось сохранить назначение.'}
        finally{save.disabled=clear.disabled=false}
      }
      form.onsubmit=event=>{event.preventDefault();void submit(false)};
      clear.onclick=()=>void submit(true);
    }catch{message.textContent='Не удалось загрузить предметы преподавателей.'}
  }

  async function renderDailyVisits() {
    const counter=el('dailyVisitsCount');
    try {
      const {data,error}=await client.rpc('bgau_visits_today');
      if(error || data==null) throw new Error();
      counter.textContent=new Intl.NumberFormat(document.documentElement.lang).format(data);
    } catch {
      counter.textContent=t('visitsError');
    }
  }
  window.addEventListener('bgau-visit-recorded',renderDailyVisits);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void renderDailyVisits()});

  async function getAvatar(userId) {
    const { data, error } = await client.rpc('bgau_get_avatar', userId ? { p_user_id: userId } : {});
    if (error) throw error;
    return data ? 'data:image/jpeg;base64,' + data.replace(/\s/gu, '') : '';
  }

  async function loadOwnAvatar(request) {
    try {
      const src = await getAvatar();
      if (request !== generation) return;
      const image = el('profileAvatar');
      if (src) image.src = src;
      else image.removeAttribute('src');
      image.hidden = el('removeAvatar').hidden = !src;
      el('avatarPlaceholder').hidden = Boolean(src);
    } catch {
      if (request === generation) notify('avatarLoadError', true);
    }
  }

  const cropDialog = el('avatarCrop'), preview = el('cropPreview'), photoInput = el('avatarFile');
  const zoom = el('cropZoom'), positionX = el('cropX'), positionY = el('cropY');
  let photo = null, cropRevision = 0, drag = null;

  function closeCrop() {
    ++cropRevision;
    if (cropDialog.open) cropDialog.close();
    photo?.close();
    photo = drag = null;
    preview.getContext('2d').clearRect(0, 0, preview.width, preview.height);
    photoInput.value = '';
  }

  function cropGeometry() {
    const size = preview.width;
    const scale = size / Math.min(photo.width, photo.height) * Number(zoom.value) / 100;
    const width = photo.width * scale, height = photo.height * scale;
    return {width,height,overflowX:(width-size)/2,overflowY:(height-size)/2};
  }

  function renderCrop() {
    if (!photo) return;
    const {width,height,overflowX,overflowY} = cropGeometry();
    positionX.disabled = overflowX < .01;
    positionY.disabled = overflowY < .01;
    const context = preview.getContext('2d', {alpha:false});
    context.fillStyle = '#fff';
    context.fillRect(0, 0, preview.width, preview.height);
    context.drawImage(photo, overflowX*(Number(positionX.value)/100-1), overflowY*(Number(positionY.value)/100-1), width, height);
  }

  function resetCrop() {
    zoom.value = '100';
    positionX.value = positionY.value = '0';
    renderCrop();
  }

  async function choosePhoto() {
    const file = photoInput.files[0];
    if (!file || !actor || el('avatarForm').hidden) return;
    const revision = ++cropRevision;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) {
      photoInput.value = '';
      notify('avatarFileError',true);
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      if (revision !== cropRevision) { bitmap.close(); return; }
      photo?.close();
      photo = bitmap;
      el('cropStatus').hidden = true;
      resetCrop();
      if (!cropDialog.open) cropDialog.showModal();
    } catch {
      if (revision !== cropRevision) return;
      closeCrop();
      notify('avatarDecodeError',true);
    }
  }

  photoInput.addEventListener('change', () => void choosePhoto());
  for (const control of [zoom,positionX,positionY]) control.addEventListener('input',renderCrop);
  el('cropReset').addEventListener('click',resetCrop);
  el('cropCancel').addEventListener('click',closeCrop);
  cropDialog.addEventListener('cancel',event=>{event.preventDefault();if(!el('uploadAvatar').disabled)closeCrop()});
  preview.addEventListener('pointerdown',event=>{
    if(!photo || !event.isPrimary || event.button!==0 || el('uploadAvatar').disabled)return;
    preview.setPointerCapture(event.pointerId);
    drag={id:event.pointerId,x:event.clientX,y:event.clientY,panX:Number(positionX.value),panY:Number(positionY.value)};
  });
  preview.addEventListener('pointermove',event=>{
    if(!photo || drag?.id!==event.pointerId)return;
    const {overflowX,overflowY}=cropGeometry();
    const ratio=preview.width/preview.clientWidth;
    const clamp=n=>String(Math.max(-100,Math.min(100,Math.round(n))));
    if(overflowX>.01)positionX.value=clamp(drag.panX+(event.clientX-drag.x)*ratio/overflowX*100);
    if(overflowY>.01)positionY.value=clamp(drag.panY+(event.clientY-drag.y)*ratio/overflowY*100);
    renderCrop();
  });
  preview.addEventListener('lostpointercapture',()=>{drag=null});

  async function saveAvatar(remove) {
    const upload = el('uploadAvatar'), removeButton = el('removeAvatar');
    if (!actor || el('profileSettings').hidden || el('avatarForm').hidden || upload.disabled || (!remove&&!photo)) return;
    const request = generation;
    upload.disabled = removeButton.disabled = el('cropCancel').disabled = photoInput.disabled = true;
    try {
      const image = remove ? null : preview.toDataURL('image/jpeg',0.82).split(',')[1];
      if (request !== generation) return;
      const { error } = await client.rpc('bgau_set_avatar', { p_jpeg: image });
      if (error) throw error;
      if (request !== generation) return;
      closeCrop();
      notify(remove ? 'avatarRemoved' : 'avatarSaved');
      await loadOwnAvatar(request);
      if (role === 'admin' && request === generation) await loadAccounts();
    } catch {
      if (request === generation) {
        if(cropDialog.open){
          el('cropStatus').textContent=t('avatarSaveError');
          el('cropStatus').hidden=false;
        }else notify('avatarSaveError',true);
      }
    } finally {
      upload.disabled = removeButton.disabled = el('cropCancel').disabled = photoInput.disabled = false;
    }
  }

  for (const form of [el('authForm'), el('profileForm')]) {
    form.addEventListener('invalid', event => {
      const input = event.target;
      if (input.validity.valueMissing) input.setCustomValidity(t('requiredField'));
      else if (input.validity.typeMismatch) input.setCustomValidity(t('invalidEmail'));
      else if (input.validity.tooShort) input.setCustomValidity(t('minimumLength',{n:input.minLength}));
    }, true);
    form.addEventListener('input', event => event.target.setCustomValidity(''));
  }

  document.querySelectorAll('[data-auth-mode]').forEach(button => button.addEventListener('click', () => {
    if (authBusy || mode === button.dataset.authMode) return;
    notify('');
    setMode(button.dataset.authMode);
  }));
  el('recoveryButton').addEventListener('click', () => {
    if (authBusy) return;
    notify('');
    setMode(mode === 'reset' ? 'login' : 'reset');
  });
  el('signupBack').addEventListener('click', () => {
    if (!authBusy) changeSignupStep(0);
  });
  el('authForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (authBusy) return;
    if (mode === 'signup' && signupStep === 0) {
      if (signup.validateName()) changeSignupStep(1);
      return;
    }
    authBusy = true;
    el('authSubmit').disabled = true;
    const email = el('authEmail').value.trim(), password = el('authPassword').value;
    const action = mode;
    notify('');
    try {
      let response;
      if (action === 'signup') response = await client.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo, data:{bgau_profile:signup.payload()} } });
      if (action === 'login') response = await client.auth.signInWithPassword({ email, password });
      if (action === 'reset') response = await client.auth.resetPasswordForEmail(email, { redirectTo });
      if (action === 'update') response = await client.auth.updateUser({ password });
      if (response.error) throw response.error;
      el('authPassword').value = '';
      if (action === 'signup') {
        if (response.data.session) location.replace(new URL('./', location.href).href);
        else {
          setMode('login');
          notify('confirmFallback');
        }
      }
      if (action === 'reset') notify('recoverySent');
      if (action === 'update') {
        setMode('login');
        const { data } = await client.auth.getSession();
        await syncSession('USER_UPDATED', data.session);
        notify('passwordSaved');
      }
    } catch (error) {
      notify(authError(error), true);
    } finally {
      authBusy = false;
      el('authSubmit').disabled = false;
    }
  });
  el('signOut').addEventListener('click', async () => {
    el('signOut').disabled = true;
    try {
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) throw error;
      notify('');
    } catch {
      notify('signOutError', true);
    } finally {
      el('signOut').disabled = false;
    }
  });
  el('profileForm').addEventListener('submit', async event => {
    event.preventDefault();
    const button = el('profileSave');
    if (!actor || el('profileSettings').hidden || button.disabled) return;
    const request = generation;
    button.disabled = true;
    try {
      const { error } = await client.rpc('bgau_save_profile', { p_profile: settings.payload() });
      if (error) throw error;
      if (request !== generation) return;
      notify('profileSaved');
      void renderDailyVisits();
      const { data } = await client.auth.getSession();
      if (request === generation) await syncSession('PROFILE_SAVED', data.session);
    } catch (error) {
      if (request === generation) notify(authError(error), true);
    } finally {
      if (request === generation) button.disabled = false;
    }
  });
  el('uploadAvatar').addEventListener('click', () => void saveAvatar(false));
  el('removeAvatar').addEventListener('click', () => void saveAvatar(true));
  el('accountSearch').addEventListener('submit', event => {
    event.preventDefault();
    search = el('searchEmail').value.trim();
    offset = 0;
    void loadAccounts();
  });
  el('prevPage').addEventListener('click', () => { offset = Math.max(0, offset - pageSize); void loadAccounts(); });
  el('nextPage').addEventListener('click', () => { offset += pageSize; void loadAccounts(); });

  const fragment = new URLSearchParams(location.hash.slice(1));
  if (params.has('error') || fragment.has('error')) notify('linkExpired', true);
  void renderDailyVisits();
  client.auth.onAuthStateChange((event, session) => {
    setTimeout(() => void syncSession(event, session), 0);
  });
})();
