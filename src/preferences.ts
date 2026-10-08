export const preferenceKeys = {
  enhancedSave: 'ytwash:enhanced-save',
  resume: 'ytwash:resume-enabled',
  autoRemove: 'ytwash:auto-remove-completed',
  groupByCreator: 'ytwash:group-by-creator',
  groupPlayback: 'ytwash:group-playback',
};
export const preferences = { enhancedSave: true, resume: true, autoRemove: false, groupByCreator: false, groupPlayback: true };
export const preferencesReady = new Promise<void>(resolve => {
  chrome.storage.local.get(Object.values(preferenceKeys), values => {
    if (!chrome.runtime.lastError) {
      for (const name of Object.keys(preferenceKeys) as (keyof typeof preferenceKeys)[]) {
        const value = values[preferenceKeys[name]];
        if (typeof value === 'boolean') preferences[name] = value;
      }
    }
    resolve();
  });
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  for (const name of Object.keys(preferenceKeys) as (keyof typeof preferenceKeys)[]) {
    const change = changes[preferenceKeys[name]];
    if (change) preferences[name] = typeof change.newValue === 'boolean' ? change.newValue : name === 'enhancedSave' || name === 'resume' || name === 'groupPlayback';
  }
});
