(function () {
  'use strict';
  const el = id => document.getElementById(id);
  const status = el('status');
  const cloud = window.bgauCloud;
  const roles = { student: 'Ученик', teacher: 'Преподаватель', admin: 'Администратор' };

  function notify(message, error = false) {
    status.textContent = message;
    status.dataset.error = String(error);
    status.hidden = !message;
  }

  if (!cloud) {
    notify('Для входа откройте сайт расписания через интернет.', true);
    return;
  }
  const { client } = cloud;
  const pageSize = 30;
  const redirectTo = new URL('./account.html', location.href).href;
  const params = new URLSearchParams(location.search);
  const nextSchedule = params.get('next') === 'schedule';
  let mode = 'login', actor = null, role = '', generation = 0, listing = 0, search = '', offset = 0;
  let authBusy = false;
  let catalogPromise;

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
    fields.append(el('profileFields').content.cloneNode(true));
    const field = name=>fields.querySelector(`[name="${name}"]`);
    const course=field('course'),group=field('group_key'),subgroup=field('subgroup');
    let catalog=[];
    function populate(select,values,placeholder,selected='') {
      select.replaceChildren(new Option(placeholder,''));
      values.forEach(([value,label])=>select.append(new Option(label,String(value))));
      select.value=String(selected);
    }
    function populateSubgroups(selected='') {
      const selectedGroup=catalog.find(item=>item.group_key===group.value);
      if(!selectedGroup){populate(subgroup,[],'Сначала выберите группу');return}
      if(!selectedGroup.has_subgroups){populate(subgroup,[[0,'Без подгруппы']],'Подгруппа',0);return}
      populate(subgroup,[[1,'Первая подгруппа'],[2,'Вторая подгруппа']],'Выберите подгруппу',selected);
    }
    function populateGroups(selected='',selectedSubgroup='') {
      const pairs=catalog.filter(item=>String(item.course)===course.value)
        .map(item=>[item.group_key,item.label+' · '+item.study_mode]);
      populate(group,pairs,course.value?'Выберите группу':'Сначала выберите курс',selected);
      populateSubgroups(selectedSubgroup);
    }
    course.addEventListener('change',()=>populateGroups());
    group.addEventListener('change',()=>populateSubgroups());
    return {
      async fill(profile={},stillCurrent=()=>true) {
        const loaded=await groups();
        if(!stillCurrent())return;
        catalog=loaded;
        ['first_name','last_name','patronymic','nickname'].forEach(name=>field(name).value=profile[name]||'');
        const courses=[...new Set(catalog.map(item=>item.course))].map(number=>[number,number+' курс']);
        populate(course,courses,'Выберите курс',catalog.find(item=>item.group_key===profile.group_key)?.course||'');
        populateGroups(profile.group_key,profile.subgroup);
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

  function setMode(value) {
    mode = value;
    const recovering = value === 'update', reset = value === 'reset';
    el('emailLabel').hidden = recovering;
    el('authEmail').required = !recovering;
    el('passwordLabel').hidden = reset;
    el('authPassword').required = !reset;
    el('authPassword').minLength = value === 'signup' || recovering ? 8 : 0;
    el('authPassword').autocomplete = value === 'login' ? 'current-password' : 'new-password';
    el('authPassword').value = '';
    el('signupFields').hidden=el('signupFields').disabled=value!=='signup';
    if(value==='signup')void signup.fill({},()=>mode==='signup').catch(()=>notify('Не удалось загрузить список групп.',true));
    el('recoveryButton').hidden = recovering;
    el('recoveryButton').textContent = reset ? 'Вернуться ко входу' : 'Забыли пароль?';
    el('authSubmit').textContent = { login: 'Войти', signup: 'Зарегистрироваться', reset: 'Отправить ссылку', update: 'Сохранить пароль' }[mode];
    document.querySelectorAll('[data-auth-mode]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.authMode === mode));
      button.hidden = recovering;
    });
  }

  function authError(error) {
    const messages = {
      invalid_credentials: 'Проверьте почту и пароль.',
      email_not_confirmed: 'Подтвердите почту по ссылке из письма.',
      signup_disabled: 'Регистрация сейчас отключена.',
      over_email_send_rate_limit: 'Лимит писем исчерпан. Попробуйте позже.',
      weak_password: 'Выберите более надёжный пароль.',
      same_password: 'Укажите пароль, который отличается от предыдущего.',
      otp_expired: 'Срок действия ссылки истёк. Запросите новую.',
      profile_validation: 'Заполните имя, фамилию, группу и подгруппу.',
      '22023': 'Проверьте группу и подгруппу.',
      '23505': 'Этот псевдоним уже занят.'
    };
    return messages[error?.code] || 'Действие не выполнено. Проверьте соединение и попробуйте снова.';
  }

  async function syncSession(event, session) {
    if (event === 'TOKEN_REFRESHED' && session?.user.id === actor?.id) return;
    if (event === 'SIGNED_IN' && session?.user.id === actor?.id && role) return;
    const request = ++generation;
    actor = session?.user || null;
    role = '';
    el('accounts').replaceChildren();
    el('paging').hidden = true;
    el('adminPanel').hidden = true;
    el('profile').hidden = true;
    el('profileSettings').hidden = true;
    el('profileAvatar').removeAttribute('src');
    el('profileAvatar').hidden=true;
    el('avatarFile').value='';
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
    el('profileRole').textContent = 'Проверяем роль…';
    el('profileEmail').textContent = actor.email || '';
    try {
      const {data:account,error}=await client.rpc('bgau_my_profile');
      if(error||!account)throw error||new Error('Account not found');
      if (request !== generation) return;
      role=account.role;
      el('profileRole').textContent=(roles[role]||roles.student)+(account.banned?' · заблокирован':'');
      if(account.banned){notify('Доступ к расписанию заблокирован администратором.',true);return}
      if(nextSchedule&&(account.profile||role==='admin')) {
        const { data: access, error: accessError } = await client.rpc('bgau_access_status');
        if (request !== generation) return;
        if (accessError) throw accessError;
        if (access === 'ready') { location.replace(new URL('./',location.href).href); return; }
      }
      el('profileSettings').hidden=false;
      el('ownNickname').textContent='Ваш псевдоним в топе — '+account.nickname;
      el('avatarForm').hidden=!account.profile;
      if(nextSchedule&&!account.profile)notify('Заполните профиль, чтобы открыть расписание.');
      el('settingsFields').disabled = true;
      el('profileSave').disabled = true;
      void settings.fill(account.profile||{},()=>request===generation).then(() => {
        if (request !== generation) return;
        el('settingsFields').disabled = false;
        el('profileSave').disabled = false;
      }).catch(() => {
        if (request === generation) notify('Не удалось загрузить список групп.',true);
      });
      if(account.profile)void loadOwnAvatar(request);
      if (role === 'admin') {
        el('adminPanel').hidden = false;
        offset = 0;
        await loadAccounts();
      }
    } catch {
      if (request !== generation) return;
      el('profileRole').textContent = 'Роль недоступна';
      notify('Не удалось проверить права аккаунта. Попробуйте обновить страницу.', true);
    }
  }

  async function loadAccounts() {
    const actorVersion = generation, request = ++listing;
    const list = el('accounts');
    const message = el('listStatus');
    el('paging').hidden = true;
    list.replaceChildren();
    message.textContent = 'Загрузка пользователей…';
    try {
      const { data, error } = await client.rpc('bgau_list_members', { p_search: search, p_offset: offset });
      if (error) throw error;
      if (actorVersion !== generation || request !== listing) return;
      for (const account of data.slice(0, pageSize)) list.append(accountRow(account));
      message.textContent = data.length ? '' : 'Пользователи не найдены.';
      el('prevPage').disabled = offset === 0;
      el('nextPage').disabled = data.length <= pageSize;
      el('paging').hidden = offset === 0 && data.length <= pageSize;
    } catch {
      if (actorVersion === generation && request === listing) message.textContent = 'Не удалось загрузить пользователей.';
    }
  }

  function accountRow(account) {
    const item = document.createElement('div');
    item.className = 'user';
    const details = document.createElement('div');
    const email = document.createElement('strong');
    email.textContent = account.email || 'Почта не указана';
    const description = document.createElement('p');
    description.textContent = (roles[account.role]||roles.student)+(account.banned?' · заблокирован':'')+(account.confirmed?'':' · почта не подтверждена');
    details.append(email, description);
    const fullName=[account.last_name,account.first_name,account.patronymic].filter(Boolean).join(' ');
    if(fullName){const name=document.createElement('p');name.textContent=fullName;details.append(name)}
    if(account.group_label){
      const group=document.createElement('p');
      group.textContent=[account.group_label,account.course+' курс',account.subgroup?'Подгруппа '+account.subgroup:'Без подгруппы'].join(' · ');
      details.append(group);
    }
    const activity=document.createElement('p');
    activity.textContent=`Сегодня — ${account.today_visits}, всего — ${account.total_visits}`;
    details.append(activity);
    item.append(details);
    const actions=document.createElement('div');
    actions.className='buttons';
    item.append(actions);
    if(account.has_avatar){
      const show=document.createElement('button');
      show.type='button';show.textContent='Показать аватар';
      show.addEventListener('click',async()=>{
        show.disabled=true;
        try{
          const avatar=await getAvatar(account.user_id);
          if(!avatar||!item.isConnected)return;
          const image=document.createElement('img');
          image.className='avatar';image.alt='Аватар пользователя';image.src=avatar;
          details.prepend(image);show.remove();
        }catch{notify('Не удалось открыть аватар.',true)}finally{show.disabled=false}
      });
      actions.append(show);
    }
    if (account.role === 'admin') return item;

    const nextRole = account.role === 'teacher' ? 'student' : 'teacher';
    const change = document.createElement('button');
    change.type = 'button';
    change.textContent = nextRole === 'teacher' ? 'Назначить преподавателем' : 'Вернуть роль ученика';
    change.disabled = nextRole === 'teacher' && !account.confirmed;
    change.addEventListener('click', async () => {
      const actorVersion = generation;
      change.disabled = true;
      try {
        const { error } = await client.rpc('bgau_assign_role', { p_user_id: account.user_id, p_role: nextRole });
        if (error) throw error;
        if (actorVersion !== generation) return;
        notify('Роль изменена.');
        item.replaceWith(accountRow({ ...account, role: nextRole }));
      } catch {
        if (actorVersion !== generation) return;
        change.disabled = false;
        notify('Не удалось изменить роль. Обновите список и проверьте права.', true);
      }
    });
    actions.append(change);
    const ban=document.createElement('button');
    ban.type='button';ban.textContent=account.banned?'Разблокировать':'Заблокировать';
    ban.addEventListener('click',async()=>{
      if(!account.banned&&!window.confirm('Заблокировать доступ пользователя к расписанию?'))return;
      const actorVersion=generation;
      ban.disabled=true;
      try{
        const {error}=await client.rpc('bgau_set_banned',{p_user_id:account.user_id,p_banned:!account.banned});
        if(error)throw error;
        if(actorVersion!==generation)return;
        item.replaceWith(accountRow({...account,banned:!account.banned}));
        notify(account.banned?'Пользователь разблокирован.':'Пользователь заблокирован.');
        void renderTop();
      }catch{if(actorVersion===generation)notify('Не удалось изменить доступ пользователя.',true)}
      finally{ban.disabled=false}
    });
    actions.append(ban);
    return item;
  }

  async function renderTop() {
    const list = el('topMembers');
    const message = el('topStatus');
    try {
      const { data, error } = await client.rpc('bgau_top_five');
      if (error) throw error;
      list.replaceChildren(...data.slice(0, 5).map(account => {
        const item = document.createElement('li');
        item.textContent = account.nickname;
        return item;
      }));
      message.textContent = data.length ? '' : 'Посещений пока нет.';
    } catch {
      message.textContent = 'Не удалось загрузить топ.';
    }
  }

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
    } catch {
      if (request === generation) notify('Не удалось загрузить аватар.', true);
    }
  }

  async function compressAvatar(file) {
    if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) {
      throw new Error('Выберите изображение JPEG, PNG или WebP до 8 МБ.');
    }
    const bitmap = await createImageBitmap(file).catch(() => { throw new Error('Не удалось открыть изображение.'); });
    try {
      const size = Math.min(bitmap.width, bitmap.height);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = Math.min(size, 256);
      const context = canvas.getContext('2d', { alpha: false });
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, (bitmap.width - size) / 2, (bitmap.height - size) / 2, size, size,
        0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.82).split(',')[1];
    } finally {
      bitmap.close();
    }
  }

  async function saveAvatar(remove) {
    const upload = el('uploadAvatar'), removeButton = el('removeAvatar');
    if (!actor || el('profileSettings').hidden || el('avatarForm').hidden || upload.disabled) return;
    const request = generation;
    upload.disabled = removeButton.disabled = true;
    try {
      let image = null;
      if (!remove) {
        try { image = await compressAvatar(el('avatarFile').files[0]); }
        catch (error) { if (request === generation) notify(error.message, true); return; }
      }
      if (request !== generation) return;
      const { error } = await client.rpc('bgau_set_avatar', { p_jpeg: image });
      if (error) throw error;
      if (request !== generation) return;
      el('avatarFile').value = '';
      notify(remove ? 'Аватар удалён.' : 'Аватар сохранён.');
      await loadOwnAvatar(request);
      if (role === 'admin' && request === generation) await loadAccounts();
    } catch {
      if (request === generation) notify('Не удалось сохранить аватар.', true);
    } finally {
      upload.disabled = removeButton.disabled = false;
    }
  }

  document.querySelectorAll('[data-auth-mode]').forEach(button => button.addEventListener('click', () => {
    if (authBusy) return;
    notify('');
    setMode(button.dataset.authMode);
  }));
  el('recoveryButton').addEventListener('click', () => {
    if (authBusy) return;
    notify('');
    setMode(mode === 'reset' ? 'login' : 'reset');
  });
  el('authForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (authBusy) return;
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
      if (action === 'signup' && !response.data.session) {
        setMode('login');
        notify('Если регистрация доступна для этой почты, Supabase пришлёт ссылку для подтверждения.');
      }
      if (action === 'reset') notify('Если аккаунт существует, на почту придёт ссылка для смены пароля.');
      if (action === 'update') {
        setMode('login');
        const { data } = await client.auth.getSession();
        await syncSession('USER_UPDATED', data.session);
        notify('Пароль обновлён.');
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
      notify('Не удалось выйти из аккаунта. Попробуйте снова.', true);
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
      notify('Профиль сохранён.');
      void renderTop();
      const { data } = await client.auth.getSession();
      if (request === generation) await syncSession('PROFILE_SAVED', data.session);
    } catch (error) {
      if (request === generation) notify(authError(error), true);
    } finally {
      if (request === generation) button.disabled = false;
    }
  });
  el('avatarForm').addEventListener('submit', event => { event.preventDefault(); void saveAvatar(false); });
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
  if (params.has('error') || fragment.has('error')) notify('Ссылка устарела или недействительна. Запросите новую.', true);
  else if (nextSchedule && !params.has('reason')) notify('Войдите или зарегистрируйтесь, чтобы открыть расписание.');
  void renderTop();
  client.auth.onAuthStateChange((event, session) => {
    setTimeout(() => void syncSession(event, session), 0);
  });
})();
