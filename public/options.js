const inputs = [...document.querySelectorAll('input[data-key]')];
const status = document.getElementById('status');
const preset = document.getElementById('reminder-time');
const date = document.getElementById('reminder-date');
const videos = document.getElementById('reminder-video');
const schedule = document.getElementById('set-reminder');
const presetKey = 'ytwash:reminder-default';
function theme(values) {
  document.documentElement.toggleAttribute('dark', typeof values['ytwash:youtube-dark'] === 'boolean' ? values['ytwash:youtube-dark'] : matchMedia('(prefers-color-scheme: dark)').matches);
  const tokens = values['ytwash:youtube-theme'];
  for (const key of ['--yt-spec-base-background', '--yt-spec-text-primary', '--yt-spec-text-secondary', '--yt-spec-badge-chip-background', '--yt-spec-10-percent-layer']) document.documentElement.style.removeProperty(key);
  if (tokens && typeof tokens === 'object') for (const [key, value] of Object.entries(tokens)) {
    if (/^--yt-spec-[a-z-]+$/.test(key) && typeof value === 'string') document.documentElement.style.setProperty(key, value);
  }
}
function confirm(when) {
  return 'We’ll remind you ' + new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(when)) + '.';
}
function render() {
  chrome.storage.local.get(null, values => {
    if (chrome.runtime.lastError) { status.textContent = 'Could not load your settings. Try again.'; return; }
    theme(values);
    const selected = videos.value;
    videos.replaceChildren();
    const entries = new Map();
    for (const entry of values['ytwash:playlist:WL']?.entries || []) {
      if (entry && /^[\w-]{11}$/.test(entry.id) && values['ytwash:watched:' + entry.id] !== true) entries.set(entry.id, entry);
    }
    const requested = new URLSearchParams(location.search).get('remind');
    const notice = values['ytwash:reminder-notice:' + requested] || values['ytwash:reminder-draft:' + requested];
    if (notice && /^[\w-]{11}$/.test(notice.id)) entries.set(notice.id, notice);
    for (const [id, entry] of entries) {
      const option = document.createElement('option');
      option.value = id; option.textContent = entry.title || (entry.creator ? 'Video by ' + entry.creator : 'Watch Later video');
      videos.append(option);
    }
    if (entries.has(selected)) videos.value = selected;
    else if (entries.has(requested)) videos.value = requested;
    schedule.disabled = !entries.size;
    document.getElementById('no-videos').hidden = !!entries.size;
    const upcoming = document.getElementById('upcoming');
    upcoming.replaceChildren();
    for (const [key, reminder] of Object.entries(values)) {
      if (!key.startsWith('ytwash:reminder:') || !reminder || !Number.isFinite(reminder.dueAt)) continue;
      const row = document.createElement('li');
      const title = document.createElement('span'); title.textContent = reminder.title + ' — ' + new Date(reminder.dueAt).toLocaleString();
      const cancel = document.createElement('button'); cancel.textContent = 'Cancel';
      cancel.addEventListener('click', () => chrome.storage.local.remove(key, () => {
        status.textContent = chrome.runtime.lastError ? 'Could not cancel your reminder. Try again.' : 'Reminder canceled.';
      }));
      row.append(title, cancel); upcoming.append(row);
    }
    document.getElementById('upcoming-section').hidden = !upcoming.children.length;
  });
}
chrome.storage.local.get([...inputs.map(input => input.dataset.key), presetKey, 'ytwash:reminder-custom-date'], values => {
  if (chrome.runtime.lastError) { status.textContent = 'Could not load your settings. Try again.'; return; }
  for (const input of inputs) input.checked = typeof values[input.dataset.key] === 'boolean' ? values[input.dataset.key] : false;
  preset.value = ['later-today', 'three-days', 'week', 'custom'].includes(values[presetKey]) ? values[presetKey] : 'later-today';
  if (new URLSearchParams(location.search).has('custom')) preset.value = 'custom';
  date.hidden = preset.value !== 'custom';
  const savedDate = values['ytwash:reminder-custom-date'];
  if (typeof savedDate === 'number' && Number.isFinite(savedDate)) {
    const local = new Date(savedDate);
    date.value = new Date(savedDate - local.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }
  document.getElementById('preferences').disabled = false;
  document.getElementById('reminders').disabled = false;
  render();
});
for (const input of inputs) input.addEventListener('change', () => {
  const checked = input.checked; input.disabled = true;
  chrome.storage.local.set({ [input.dataset.key]: checked }, () => {
    input.disabled = false;
    if (chrome.runtime.lastError) { input.checked = !checked; status.textContent = 'Could not save your settings. Try again.'; }
    else status.textContent = 'Preferences saved.';
  });
});
preset.addEventListener('change', () => {
  date.hidden = preset.value !== 'custom';
  chrome.storage.local.set({ [presetKey]: preset.value });
});
date.addEventListener('change', () => {
  const when = new Date(date.value).getTime();
  if (Number.isFinite(when)) chrome.storage.local.set({ 'ytwash:reminder-custom-date': when });
});
schedule.addEventListener('click', () => {
  const when = new Date(date.value).getTime();
  if (preset.value === 'custom' && (!Number.isFinite(when) || when <= Date.now())) {
    status.textContent = 'Choose a future date and time.'; date.focus(); return;
  }
  schedule.disabled = true;
  chrome.runtime.sendMessage({ type: 'ytwash:schedule-reminder', id: videos.value, preset: preset.value, dueAt: when }, response => {
    schedule.disabled = false;
    status.textContent = chrome.runtime.lastError ? 'Could not set your reminder. Try again.' : response?.error || (response?.dueAt ? confirm(response.dueAt) : 'Could not set your reminder. Try again.');
    render();
  });
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  for (const input of inputs) if (changes[input.dataset.key]) input.checked = changes[input.dataset.key].newValue === true;
  if (changes[presetKey]) { preset.value = changes[presetKey].newValue || 'later-today'; date.hidden = preset.value !== 'custom'; }
  render();
});
