chrome.runtime.onInstalled.addListener(() => { console.info('YTWash installed'); });
chrome.action.onClicked.addListener(() => { void chrome.runtime.openOptionsPage(); });
