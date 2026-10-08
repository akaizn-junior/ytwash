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
