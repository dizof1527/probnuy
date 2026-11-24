(function () {
  'use strict';
  const cloud = window.bgauCloud;
  if (!cloud) return;
  const { client, readRole } = cloud;
  const baseGroups = DATA.groups;
  const sources = new Map();
  const keysByRow = new WeakMap();
  const cacheKey = 'bgau_schedule_edits_v1:' + SCHEDULE_RELEASE;
  const editFields = 'group_key,source_key,week,day,slot,kind,subject_id,teacher_id,room,subgroup,starts_at,ends_at,cancelled';
  const isAddition = key => typeof key === 'string' && /^teacher-added:[0-9a-f-]{36}$/u.test(key);
  let edits = new Map(), latestSignature = '[]', editor = null, canEdit = false;
  let refreshCounter = 0, roleCounter = 0, saving = false, lastSync = 0;

  for (const [group, rows] of Object.entries(baseGroups)) {
    const sourcesInGroup = new Map();
    for (const row of rows) {
      const key = JSON.stringify(row.slice(0,11));
      sourcesInGroup.set(key, row);
      keysByRow.set(row, key);
    }
    sources.set(group, sourcesInGroup);
  }

  const identity = edit => JSON.stringify([edit.group_key, edit.source_key, edit.week]);
  const validTime = value => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(value);
  function isValid(edit) {
    if (!edit || typeof edit !== 'object') return false;
    const base = sources.get(edit.group_key)?.get(edit.source_key);
    const inRange = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
    const knownLesson = base?.[8].includes(edit.week)
      || (sources.has(edit.group_key) && isAddition(edit.source_key) && inRange(edit.week, 1, MAX_WEEK));
    return knownLesson && inRange(edit.day, 1, 6) && inRange(edit.slot, 1, 6)
      && inRange(edit.kind, 0, 1) && inRange(edit.subject_id, 0, DATA.subjects.length - 1)
      && inRange(edit.teacher_id, 0, DATA.teachers.length - 1) && inRange(edit.subgroup, 0, 2)
      && typeof edit.room === 'string' && edit.room.length <= 120
      && validTime(edit.starts_at) && validTime(edit.ends_at) && edit.starts_at < edit.ends_at;
  }

  function applyEdits(rows) {
    const available = Array.isArray(rows) ? rows.filter(isValid) : [];
    const signature = JSON.stringify(available);
    if (signature === latestSignature) return;
    latestSignature = signature;
    edits = new Map(available.map(edit => [identity(edit), edit]));

    const changes = new Map();
    for (const edit of edits.values()) {
      if (!changes.has(edit.group_key)) changes.set(edit.group_key, new Map());
      const groupChanges = changes.get(edit.group_key);
      if (!groupChanges.has(edit.source_key)) groupChanges.set(edit.source_key, new Map());
      groupChanges.get(edit.source_key).set(edit.week, edit);
    }
    DATA.groups = { ...baseGroups };
    function editedRow(edit) {
      const row = [edit.day, edit.slot, edit.kind, edit.subject_id, edit.room, edit.teacher_id,
        String(edit.week), edit.subgroup, [edit.week], edit.starts_at, edit.ends_at];
      keysByRow.set(row, edit.source_key);
      return row;
    }
    for (const [group, groupChanges] of changes) {
      DATA.groups[group] = baseGroups[group].flatMap(row => {
        const key = keysByRow.get(row), rowChanges = groupChanges.get(key);
        if (!rowChanges) return [row];
        const result = [];
        const remainingWeeks = row[8].filter(week => !rowChanges.has(week));
        if (remainingWeeks.length) {
          const unchanged = [...row];
          unchanged[8] = remainingWeeks;
          result.push(unchanged);
        }
        for (const edit of rowChanges.values()) {
          if (!edit.cancelled) result.push(editedRow(edit));
        }
        result.forEach(item => keysByRow.set(item, key));
        return result;
      });
      for (const [key, weeks] of groupChanges) {
        if (!isAddition(key)) continue;
        for (const edit of weeks.values()) if (!edit.cancelled) DATA.groups[group].push(editedRow(edit));
      }
    }
    teacherDirectoryCache.clear();
    if (state.modal === 'teacherSchedule' && document.activeElement?.id !== 'teacherTimetableSearch') renderTeacherSchedule();
    render();
  }

  try { applyEdits(JSON.parse(read(cacheKey, '[]'))); } catch { /* The bundled timetable remains available. */ }

  async function refreshEdits() {
    if (!navigator.onLine || saving) return;
    const request = ++refreshCounter;
    const collected = [];
    const size = 500;
    try {
      for (let start = 0; ; start += size) {
        const { data, error } = await client.from('bgau_schedule_edits').select(editFields)
          .order('group_key').order('source_key').order('week').range(start, start + size - 1);
        if (error) throw error;
        if (request !== refreshCounter || saving) return;
        collected.push(...data);
        if (data.length < size) break;
      }
      lastSync = Date.now();
      save(cacheKey, JSON.stringify(collected));
      applyEdits(collected);
    } catch { /* Keep the most recent available public timetable. */ }
  }

  async function updateRole(session) {
    const request = ++roleCounter;
    let next = false;
    try { next = !!session && (await readRole(session.user.id)) === 'admin'; } catch { /* No role grants on a failed read. */ }
    if (request !== roleCounter || next === canEdit) return;
    canEdit = next;
    renderCards();
    if (!canEdit && state.modal === 'editLesson') closeModal();
  }

  function openEditor(index) {
    if (!canEdit) return;
    const row = matchingRows()[index];
    const sourceKey = row && keysByRow.get(row);
    if (!sourceKey) return;
    editor = { row, sourceKey, group: state.group, week: state.week };
    openModal('editLesson');
  }

  function options(labels, selected) {
    return labels.map(([value, label]) => `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(label)}</option>`).join('');
  }

  function renderEditor() {
    if (!canEdit || !editor) return;
    const { row, sourceKey, group, week } = editor;
    const currentEdit = edits.has(identity({ group_key: group, source_key: sourceKey, week }));
    $('modalTitle').textContent = 'Редактирование пары';
    $('modalBody').innerHTML = `
      <p class="muted">${esc(DATA.labels[group])} · ${esc(t('week',{n:week}))}</p>
      <form id="cloudEditForm" class="cloud-edit">
        <label>Предмет<select class="input" name="subject" required>${options(DATA.subjects.map((name,i)=>[i,name]),row[3])}</select></label>
        <div class="cloud-fields">
          <label>День<select class="input" name="day">${options(I18N[state.lang].longDays.map((name,i)=>[i+1,name]),row[0])}</select></label>
          <label>Номер пары<input class="input" name="slot" type="number" min="1" max="6" value="${esc(row[1])}" required></label>
          <label>Начало<input class="input" name="start" type="time" value="${esc(row[9])}" required></label>
          <label>Окончание<input class="input" name="end" type="time" value="${esc(row[10])}" required></label>
          <label>Тип<select class="input" name="kind">${options([[0,t('practice')],[1,t('lecture')]],row[2])}</select></label>
          <label>Подгруппа<select class="input" name="subgroup">${options([0,1,2].map(n=>[n,subgroupName(n)]),Number(row[7]))}</select></label>
        </div>
        <label>Аудитория<input class="input" name="room" maxlength="120" value="${esc(row[4])}"></label>
        <label>Преподаватель<select class="input" name="teacher">${options(DATA.teachers.map((name,i)=>[i,name||t('noTeacher')]),row[5])}</select></label>
        <p id="cloudEditStatus" role="status" aria-live="polite"></p>
        <div class="row">
          <button class="primary" type="submit">Сохранить на эту неделю</button>
          ${currentEdit?'<button class="pill" id="undoCloudEdit" type="button">'+(isAddition(sourceKey)?'Удалить добавленную пару':'Вернуть исходную пару')+'</button>':''}
        </div>
      </form>`;
    $('cloudEditForm').addEventListener('submit', event => { event.preventDefault(); void submitEdit(event.currentTarget); });
    $('undoCloudEdit')?.addEventListener('click', () => void submitEdit($('cloudEditForm'), true));
  }

  async function submitEdit(form, undo = false) {
    if (!editor || !canEdit || saving) return;
    const { sourceKey, group, week } = editor;
    const key = { group_key: group, source_key: sourceKey, week };
    const input = new FormData(form);
    const payload = { ...key, day: Number(input.get('day')), slot: Number(input.get('slot')),
      kind: Number(input.get('kind')), subject_id: Number(input.get('subject')), teacher_id: Number(input.get('teacher')),
      room: String(input.get('room')).trim(), subgroup: Number(input.get('subgroup')),
      starts_at: input.get('start'), ends_at: input.get('end') };
    const status = $('cloudEditStatus');
    if (!undo && !isValid(payload)) {
      status.textContent = 'Проверьте поля. Время окончания должно быть позже начала.';
      return;
    }
    saving = true;
    ++refreshCounter;
    for (const button of form.querySelectorAll('button')) button.disabled = true;
    status.textContent = 'Сохраняем…';
    try {
      const request = undo
        ? client.from('bgau_schedule_edits').delete().eq('group_key', group).eq('source_key', sourceKey).eq('week', week).select('week')
        : client.from('bgau_schedule_edits').upsert(payload,{onConflict:'group_key,source_key,week'}).select(editFields);
      const { data, error } = await request;
      if (error || !data?.length) throw error || new Error('No edit changed');
      const next = new Map(edits);
      if (undo) next.delete(identity(key));
      else next.set(identity(key), data[0]);
      const values = [...next.values()];
      save(cacheKey, JSON.stringify(values));
      if (state.modal === 'editLesson') closeModal();
      if (state.group === group && state.week === week) {
        state.day = undo ? (sources.get(group).get(sourceKey)?.[0] ?? editor.row[0]) : payload.day;
        state.query = '';
        $('lessonSearch').value = '';
        state.openCard = -1;
      }
      const previous = latestSignature;
      applyEdits(values);
      if (latestSignature === previous) render();
      toast(undo ? (isAddition(sourceKey) ? 'Пара удалена' : 'Исходная пара восстановлена') : 'Пара обновлена');
    } catch {
      status.textContent = 'Не удалось сохранить. Проверьте интернет и права аккаунта.';
    } finally {
      saving = false;
      for (const button of form.querySelectorAll('button')) button.disabled = false;
    }
  }

  window.bgauScheduleCloud = { isAdmin: () => canEdit, openEditor, renderEditor };
  client.auth.onAuthStateChange((_event, session) => {
    setTimeout(() => void updateRole(session), 0);
  });
  window.addEventListener('pageshow', e => {
    if (e.persisted) void client.auth.getSession().then(({data}) => updateRole(data.session));
  });
  window.addEventListener('online', () => void refreshEdits());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && Date.now() - lastSync > 60000) void refreshEdits();
  });
  setInterval(() => { if (!document.hidden) void refreshEdits(); }, 60000);
  void refreshEdits();
})();
