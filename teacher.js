(function () {
  'use strict';
  const byId = id => document.getElementById(id);
  const { client } = window.bgauCloud || {};
  const status = byId('teacherStatus');
  if (!client) {
    status.textContent = 'Откройте сайт с подключением к интернету.';
    return;
  }
  window.bgauCloud.showDailyTraffic(status.closest('main').querySelector('.daily-traffic'));
  const firstMonday = Date.UTC(2026, 7, 31);
  const weekLength = 7 * 86400000;
  const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const ufaDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Yekaterinburg', dateStyle: 'short' }).format();
  const days = ['Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];
  const week = byId('teacherWeek');
  const calendar = byId('teacherDays');
  const add = byId('addLesson');
  const dialog = byId('lessonDialog');
  const form = byId('lessonForm');
  const offering = byId('lessonOffering');
  const lessonStatus = byId('lessonStatus');
  let offerings = [], editing = null, sequence = 0, saving = false;

  for (let n = 1; n <= 17; n++) {
    const monday = firstMonday + (n - 1) * weekLength;
    week.add(new Option(n + ' неделя · ' + dateFormat.format(monday) + ' — ' + dateFormat.format(monday + 5 * 86400000), n));
  }
  week.value = Math.max(1, Math.min(17, Math.floor((Date.parse(ufaDate) - firstMonday) / weekLength) + 1));
  days.forEach((day, index) => byId('lessonDay').add(new Option(day, index + 1)));
  const subgroup = n => n ? ' · подгруппа ' + n : '';
  function action(label, callback) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.onclick = callback;
    return button;
  }

  function showLessons(lessons) {
    calendar.replaceChildren();
    days.forEach((day, index) => {
      const rows = lessons.filter(lesson => lesson.day === index + 1);
      if (!rows.length) return;
      const section = document.createElement('section');
      const heading = document.createElement('h2');
      heading.textContent = day;
      section.append(heading);
      for (const lesson of rows) {
        const card = document.createElement('article');
        card.className = 'user';
        const details = document.createElement('div');
        const time = document.createElement('p');
        time.textContent = lesson.starts_at + '–' + lesson.ends_at + ' · пара ' + lesson.slot
          + (lesson.room ? ' · ауд. ' + lesson.room : '') + (lesson.cancelled ? ' · отменена' : '');
        const title = document.createElement('strong');
        title.textContent = lesson.subject + ' · ' + lesson.group + subgroup(lesson.subgroup);
        details.append(time, title);
        card.append(details);
        const buttons = document.createElement('div');
        buttons.className = 'buttons';
        if (lesson.cancelled) {
          buttons.append(action('Восстановить', () => void changeLesson('restore', lesson, status)));
        } else {
          buttons.append(action('Редактировать', () => openEditor(lesson)));
          buttons.append(action('Отменить пару', () => {
            if (confirm('Отменить эту пару на выбранной неделе?')) void changeLesson('cancel', lesson, status);
          }));
        }
        card.append(buttons);
        section.append(card);
      }
      calendar.append(section);
    });
  }

  async function loadWeek({ quiet = false } = {}) {
    const request = ++sequence;
    if (!quiet) {
      status.textContent = 'Загружаем расписание…';
      calendar.replaceChildren();
      add.hidden = true;
    }
    try {
      const { data, error } = await client.rpc('bgau_read_teacher_week', { p_week: Number(week.value) });
      if (request !== sequence) return;
      if (error) throw error;
      offerings = data.offerings || [];
      add.hidden = offerings.length === 0;
      byId('teacherName').textContent = data.teacher || '';
      week.disabled = !data.assigned;
      if (!data.assigned) {
        status.textContent = 'Администратор ещё не назначил вам предметы.';
        calendar.replaceChildren();
        if (dialog.open) dialog.close();
        return;
      }
      status.textContent = data.lessons.length ? '' : 'На этой неделе у вас нет пар.';
      showLessons(data.lessons);
    } catch {
      if (request !== sequence) return;
      status.textContent = 'Расписание недоступно. Проверьте подключение и права аккаунта.';
      calendar.replaceChildren();
      byId('teacherName').textContent = '';
      offerings = [];
      add.hidden = true;
      if (dialog.open) dialog.close();
    }
  }

  function openEditor(lesson) {
    if (saving) return;
    editing = lesson;
    form.reset();
    lessonStatus.textContent = '';
    byId('lessonTitle').textContent = lesson ? lesson.subject : 'Добавить пару';
    byId('lessonOfferingLabel').hidden = Boolean(lesson);
    offering.disabled = Boolean(lesson);
    offering.replaceChildren(...offerings.map((entry, index) =>
      new Option(entry.subject + ' · ' + entry.group_label + subgroup(entry.subgroup), index)));
    const fields = form.elements;
    fields.day.value = lesson?.day || 1;
    fields.slot.value = lesson?.slot || 1;
    fields.room.value = lesson?.room || '';
    fields.starts_at.value = lesson?.starts_at || '08:30';
    fields.ends_at.value = lesson?.ends_at || '10:05';
    dialog.showModal();
  }

  async function changeLesson(type, lesson, message) {
    if (saving) return;
    saving = true;
    week.disabled = true;
    form.querySelector('button[type=submit]').disabled = true;
    message.textContent = 'Сохраняем…';
    try {
      const { error } = await client.rpc('bgau_save_teacher_lesson', { p_action: type, p_lesson: lesson });
      if (error) throw error;
      if (dialog.open) dialog.close();
      await loadWeek();
    } catch (error) {
      message.textContent = error?.code === '23P01'
        ? 'Это время занято у преподавателя, группы или аудитории.'
        : 'Не удалось сохранить пару. Проверьте данные и назначенные предметы.';
    } finally {
      saving = false;
      week.disabled = offerings.length === 0;
      form.querySelector('button[type=submit]').disabled = false;
    }
  }

  form.onsubmit = event => {
    event.preventDefault();
    const input = Object.fromEntries(new FormData(form));
    if (input.starts_at >= input.ends_at) {
      lessonStatus.textContent = 'Конец пары должен быть позже начала.';
      return;
    }
    const selected = editing || offerings[Number(offering.value)];
    if (!selected) return;
    void changeLesson(editing ? 'save' : 'add', {
      ...selected, ...input, week: Number(week.value)
    }, lessonStatus);
  };

  add.onclick = () => openEditor(null);
  week.onchange = () => void loadWeek();
  byId('closeLesson').onclick = () => { if (!saving) dialog.close(); };
  dialog.addEventListener('cancel', event => { if (saving) event.preventDefault(); });
  client.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || (event === 'INITIAL_SESSION' && !session)) {
      location.replace('./account.html?next=schedule');
    } else if (event === 'INITIAL_SESSION') {
      setTimeout(() => void loadWeek(), 0);
    }
  });
  setInterval(() => { if (!document.hidden && !saving && !dialog.open) void loadWeek({ quiet: true }); }, 60000);
})();
