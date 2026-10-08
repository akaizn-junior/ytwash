const inputs = [...document.querySelectorAll('input[data-key]')];
const interval = document.getElementById('reminder-interval');
const intervalKey = 'ytwash:reminder-interval-days';
const validDays = value => Number.isInteger(value) && value >= 1 && value <= 365;
const status = document.getElementById('status');
chrome.storage.local.get([...inputs.map(input => input.dataset.key), intervalKey], values => {
  if (chrome.runtime.lastError) {
    status.textContent = 'Could not load preferences. Reopen this page to try again.';
    return;
  }
  for (const input of inputs) {
    const value = values[input.dataset.key];
    input.checked = typeof value === 'boolean' ? value : input.dataset.default === 'true';
  }
  interval.value = validDays(values[intervalKey]) ? values[intervalKey] : 7;
  document.getElementById('preferences').disabled = false;
  document.getElementById('reminders').disabled = false;
});
for (const input of inputs) input.addEventListener('change', () => {
  const checked = input.checked;
  input.disabled = true;
  chrome.storage.local.set({ [input.dataset.key]: checked }, () => {
    input.disabled = false;
    if (chrome.runtime.lastError) {
      input.checked = !checked;
      status.textContent = 'Could not save this preference. Try again.';
    } else status.textContent = 'Preferences saved.';
  });
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes[intervalKey]) interval.value = validDays(changes[intervalKey].newValue) ? changes[intervalKey].newValue : 7;
  if (Object.keys(changes).some(key => key.startsWith('ytwash:later:'))) renderQueue();
  for (const input of inputs) {
    const change = changes[input.dataset.key];
    if (change) input.checked = typeof change.newValue === 'boolean' ? change.newValue : input.dataset.default === 'true';
  }
});


interval.addEventListener('change', () => {
  if (!interval.reportValidity()) return;
  const days = Number(interval.value);
  if (!validDays(days)) return;
  interval.disabled = true;
  chrome.storage.local.set({ [intervalKey]: days }, () => {
    interval.disabled = false;
    status.textContent = chrome.runtime.lastError ? 'Could not save the reminder interval. Try again.' : 'Preferences saved.';
  });
});
function renderQueue() {
  chrome.storage.local.get(null, values => {
    if (chrome.runtime.lastError) return;
    const list = document.getElementById('later-queue');
    list.replaceChildren();
    for (const [key, entry] of Object.entries(values)) {
      const id = key.slice('ytwash:later:'.length);
      if (!key.startsWith('ytwash:later:') || !/^[\w-]{11}$/.test(id) || !entry || typeof entry.title !== 'string') continue;
      const row = document.createElement('li');
      const link = document.createElement('a');
      link.href = 'https://www.youtube.com/watch?v=' + id;
      link.textContent = entry.title; link.target = '_blank'; link.rel = 'noopener noreferrer';
      const remove = document.createElement('button');
      remove.textContent = 'Remove'; remove.style.marginLeft = '12px';
      remove.addEventListener('click', () => {
        chrome.storage.local.set({ ['ytwash:watched:' + id]: true }, () => {
          if (chrome.runtime.lastError) { status.textContent = 'Could not remove the video. Try again.'; return; }
          chrome.storage.local.remove(key, () => {
            status.textContent = chrome.runtime.lastError ? 'Could not remove the video. Try again.' : 'Removed from reminders.';
          });
        });
      });
      row.append(link, remove); list.append(row);
    }
    if (!list.children.length) list.textContent = 'No videos saved locally yet.';
  });
}
renderQueue();
