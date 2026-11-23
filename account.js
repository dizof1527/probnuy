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
  const { client, readRole } = cloud;
  const pageSize = 30;
  const redirectTo = new URL('./account.html', location.href).href;
  let mode = 'login', actor = null, role = '', generation = 0, listing = 0, search = '', offset = 0;
  let authBusy = false;

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
      otp_expired: 'Срок действия ссылки истёк. Запросите новую.'
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
      const currentRole = await readRole(actor.id);
      if (request !== generation) return;
      role = currentRole;
      el('profileRole').textContent = roles[role] || roles.student;
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
      const { data, error } = await client.rpc('bgau_list_accounts', { p_search: search, p_offset: offset });
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
    description.textContent = roles[account.role] + (account.confirmed ? '' : ' · Почта не подтверждена');
    details.append(email, description);
    item.append(details);
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
    item.append(change);
    return item;
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
      if (action === 'signup') response = await client.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
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
  el('accountSearch').addEventListener('submit', event => {
    event.preventDefault();
    search = el('searchEmail').value.trim();
    offset = 0;
    void loadAccounts();
  });
  el('prevPage').addEventListener('click', () => { offset = Math.max(0, offset - pageSize); void loadAccounts(); });
  el('nextPage').addEventListener('click', () => { offset += pageSize; void loadAccounts(); });

  const params = new URLSearchParams(location.search);
  const fragment = new URLSearchParams(location.hash.slice(1));
  if (params.has('error') || fragment.has('error')) notify('Ссылка устарела или недействительна. Запросите новую.', true);
  client.auth.onAuthStateChange((event, session) => {
    setTimeout(() => void syncSession(event, session), 0);
  });
})();
