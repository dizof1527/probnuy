(function () {
  'use strict';
  const get = id => document.getElementById(id);
  const status = get('personalStatus');
  const calendar = get('personalDays');
  const group = get('personalGroup');
  const filters = get('personalFilters');
  const week = get('personalWeek');
  const subgroup = get('personalSubgroup');
  const { client } = window.bgauCloud || {};
  if (!client) {
    status.textContent = 'Откройте страницу с подключением к интернету.';
    return;
  }

  const owner = new URLSearchParams(location.search).get('owner');
  const days = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
  const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const ufaDay = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Yekaterinburg', dateStyle: 'short' }).format();
  const start = Date.UTC(2026, 7, 31);
  const weekLength = 7 * 86400000;
  const semesterWeeks = 17;
  const parity = n => n % 2 ? 'Числитель' : 'Знаменатель';
  let timetable = null;
  let sequence = 0;
  let activeId = null;

  for (let n = 1; n <= semesterWeeks; n++) {
    const monday = start + (n - 1) * weekLength;
    week.add(new Option(n + ' неделя · ' + parity(n) + ' · ' + dateFormat.format(monday), n));
  }
  week.value = Math.max(1, Math.min(semesterWeeks, Math.floor((Date.parse(ufaDay) - start) / weekLength) + 1));

  function render() {
    calendar.replaceChildren();
    if (!timetable) return;
    const selection = Number(subgroup.value);
    const rows = timetable.common.concat(Number(week.value) % 2 ? timetable.odd : timetable.even);
    for (const [index, label] of days.entries()) {
      const section = document.createElement('section');
      const heading = document.createElement('h2');
      heading.textContent = label;
      section.append(heading);
      const dayLessons = rows.filter(row => row.day === index + 1
        && (!selection || !row.subgroup || row.subgroup === selection))
        .sort((a, b) => a.slot - b.slot || a.subgroup - b.subgroup);
      if (!dayLessons.length) {
        const empty = document.createElement('p');
        empty.textContent = 'Нет пар';
        section.append(empty);
      }
      for (const row of dayLessons) {
        const lesson = document.createElement('article');
        lesson.className = 'user';
        const details = document.createElement('div');
        const time = document.createElement('p');
        time.textContent = row.start + '–' + row.end + ' · пара ' + row.slot;
        const subject = document.createElement('strong');
        subject.textContent = row.subject;
        const location = document.createElement('p');
        location.textContent = [row.place, row.kind, row.subgroup && row.subgroup + '-я подгруппа'].filter(Boolean).join(' · ');
        details.append(time, subject, location);
        lesson.append(details);
        section.append(lesson);
      }
      calendar.append(section);
    }
  }

  function clear() {
    timetable = null;
    filters.hidden = group.hidden = true;
    group.textContent = '';
    calendar.replaceChildren();
  }

  async function load() {
    const request = ++sequence;
    clear();
    status.textContent = 'Проверяем доступ…';
    try {
      const { data: { session }, error: sessionError } = await client.auth.getSession();
      if (request !== sequence) return;
      if (sessionError) throw sessionError;
      if (!session) { location.replace('./account.html?next=schedule'); return; }
      activeId = session.user.id;
      const { data, error } = await client.rpc('bgau_read_personal_timetable', owner ? { p_owner_id: owner } : {});
      if (request !== sequence) return;
      if (error || !data || !Array.isArray(data.common)) throw error || new Error('Unavailable');
      timetable = data;
      group.textContent = data.label;
      filters.hidden = group.hidden = false;
      status.textContent = '';
      render();
    } catch {
      if (request === sequence) status.textContent = 'Личное расписание недоступно для этого аккаунта.';
    }
  }

  week.onchange = subgroup.onchange = render;
  client.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || (activeId && session && session.user.id !== activeId)) {
      ++sequence;
      clear();
      location.replace('./account.html');
    }
  });
  window.addEventListener('pagehide', () => { ++sequence; clear(); });
  window.addEventListener('pageshow', () => { void load(); });
})();
