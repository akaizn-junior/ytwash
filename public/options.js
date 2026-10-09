const inputs = [...document.querySelectorAll('input[data-key]')];
const status = document.getElementById('status');
chrome.storage.local.get(inputs.map(input => input.dataset.key), values => {
  if (chrome.runtime.lastError) {
    status.textContent = 'Could not load preferences. Reopen this page to try again.';
    return;
  }
  for (const input of inputs) {
    const value = values[input.dataset.key];
    input.checked = typeof value === 'boolean' ? value : input.dataset.default === 'true';
  }
  document.getElementById('preferences').disabled = false;
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
  for (const input of inputs) {
    const change = changes[input.dataset.key];
    if (change) input.checked = typeof change.newValue === 'boolean' ? change.newValue : input.dataset.default === 'true';
  }
});

const timing = document.getElementById('reminder-timing');
chrome.storage.local.get('ytwash:reminder-timing', values => {
  timing.value = ['tomorrow', 'week'].includes(values['ytwash:reminder-timing']) ? values['ytwash:reminder-timing'] : 'today';
  timing.disabled = false;
});
timing.addEventListener('change', () => {
  chrome.storage.local.set({ 'ytwash:reminder-timing': timing.value }, () => {
    status.textContent = chrome.runtime.lastError ? 'Could not save reminder timing.' : 'Reminder timing saved.';
  });
});
function showReminders() {
  chrome.storage.local.get(null, values => {
    const list = document.getElementById('reminder-list');
    list.replaceChildren();
    for (const [key, reminder] of Object.entries(values).filter(([key]) => key.startsWith('ytwash:reminder:')).sort((a, b) => a[1].when - b[1].when)) {
      const item = document.createElement('li');
      item.textContent = reminder.title + ' — ' + new Date(reminder.when).toLocaleString() + ' ';
      const cancel = document.createElement('button');
      cancel.textContent = 'Cancel';
      cancel.onclick = () => { chrome.alarms.clear(key); chrome.storage.local.remove(key); };
      item.append(cancel); list.append(item);
    }
  });
}
chrome.storage.onChanged.addListener(showReminders);
showReminders();
