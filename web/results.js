const editQueryLink = document.querySelector('#edit-query-link');
const statusPanel = document.querySelector('#status-panel');
const statusMessage = document.querySelector('#status');
const summaryPanel = document.querySelector('#summary-panel');
const resultSummary = document.querySelector('#result-summary');
const dateRange = document.querySelector('#date-range');
const showAllNote = document.querySelector('#show-all-note');
const queryRules = document.querySelector('#query-rules');
const queryRulesSummary = document.querySelector('#query-rules-summary');
const activeRules = document.querySelector('#active-rules');
const resultsContainer = document.querySelector('#results');
const eventDialog = document.querySelector('#event-dialog');
const closeDialogButton = document.querySelector('#close-dialog');
const dialogTitle = document.querySelector('#dialog-title');
const dialogWhen = document.querySelector('#dialog-when');
const dialogLocation = document.querySelector('#dialog-location');
const descriptionPanel = document.querySelector('#description-panel');
const namesPanel = document.querySelector('#names-panel');
const fullTextPanel = document.querySelector('#full-text-panel');
const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
const tabPanels = Array.from(document.querySelectorAll('[role="tabpanel"]'));

let dialogOpener = null;

editQueryLink.href = `index.html${window.location.search}`;

function normalizeText(value) {
  return value
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeGroup(value) {
  let normalized = value.trim().replace(/\s+/g, ' ').toLowerCase();

  if (normalized.endsWith('ies')) {
    normalized = `${normalized.slice(0, -3)}y`;
  } else if (normalized.endsWith('sses')) {
    normalized = normalized.slice(0, -2);
  } else if (normalized.endsWith('s') && !normalized.endsWith('ss')) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}

function parseRules(values) {
  if (values.length === 0) {
    throw new Error('The URL does not contain any filter rules.');
  }

  return values.map((source, index) => {
    const colonIndex = source.indexOf(':');
    if (colonIndex < 0) {
      throw new Error(`Rule ${index + 1} is missing a colon: ${source}`);
    }

    const kind = source.slice(0, colonIndex).trim().toLowerCase();
    const value = source.slice(colonIndex + 1).trim();
    if (value === '') {
      throw new Error(`Rule ${index + 1} has an empty value: ${source}`);
    }

    switch (kind) {
      case 'title':
        return { source, kind: 'Title', normalizedValue: normalizeText(value) };

      case 'name':
        return { source, kind: 'Name', value: value.toLowerCase() };

      case 'fulltext':
        return { source, kind: 'FullText', normalizedValue: normalizeText(value) };

      case 'group.name': {
        const dotIndex = value.indexOf('.');
        if (dotIndex < 0) {
          throw new Error(`Rule ${index + 1} must use Group.Name:<group>.<name>: ${source}`);
        }

        const group = value.slice(0, dotIndex).trim();
        const name = value.slice(dotIndex + 1).trim();
        if (group === '' || name === '') {
          throw new Error(`Rule ${index + 1} must include both a group and a name: ${source}`);
        }

        return {
          source,
          kind: 'Group.Name',
          group: normalizeGroup(group),
          name: name.toLowerCase()
        };
      }

      default:
        throw new Error(`Rule ${index + 1} has an unknown kind: ${source}`);
    }
  });
}

function eventMatchesRule(event, rule) {
  switch (rule.kind) {
    case 'Title':
      return rule.normalizedValue !== ''
        && event.normalizedTitle.startsWith(rule.normalizedValue);

    case 'Name':
      return event.nameEntries.some((entry) => entry.name.toLowerCase() === rule.value);

    case 'Group.Name':
      return event.nameEntries.some((entry) =>
        entry.group === rule.group && entry.name.toLowerCase() === rule.name
      );

    case 'FullText':
      return rule.normalizedValue !== ''
        && event.normalizedFullText.includes(rule.normalizedValue);

    default:
      return false;
  }
}

function validateSnapshot(snapshot) {
  if (
    snapshot === null
    || typeof snapshot !== 'object'
    || typeof snapshot.generatedAt !== 'string'
    || snapshot.timeZone !== 'America/Los_Angeles'
    || typeof snapshot.firstDay !== 'string'
    || typeof snapshot.lastDay !== 'string'
    || !Array.isArray(snapshot.events)
  ) {
    throw new Error('The rehearsal snapshot has an unexpected format.');
  }

  for (const event of snapshot.events) {
    if (
      event === null
      || typeof event !== 'object'
      || typeof event.date !== 'string'
      || typeof event.startTime !== 'string'
      || typeof event.endTime !== 'string'
      || typeof event.title !== 'string'
      || typeof event.description !== 'string'
      || typeof event.normalizedTitle !== 'string'
      || typeof event.normalizedFullText !== 'string'
      || !Array.isArray(event.nameEntries)
    ) {
      throw new Error('The rehearsal snapshot contains an invalid event.');
    }

    for (const entry of event.nameEntries) {
      if (
        entry === null
        || typeof entry !== 'object'
        || typeof entry.group !== 'string'
        || typeof entry.name !== 'string'
      ) {
        throw new Error('The rehearsal snapshot contains an invalid name entry.');
      }
    }
  }
}

function parseDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error(`Invalid snapshot date: ${value}`);
  }

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function formatRangeDate(value) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  }).format(parseDate(value));
}

function formatHeadingDate(value) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  }).format(parseDate(value));
}

function formatTime(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    throw new Error(`Invalid snapshot time: ${value}`);
  }

  const hour = Number(match[1]);
  const minute = match[2];
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute} ${suffix}`;
}

function renderRules(ruleSources) {
  for (const source of ruleSources) {
    const item = document.createElement('li');
    const code = document.createElement('code');
    code.textContent = source;
    item.append(code);
    activeRules.append(item);
  }
}

function activateTab(selectedTab, moveFocus = false) {
  for (const tab of tabs) {
    const isSelected = tab === selectedTab;
    tab.setAttribute('aria-selected', String(isSelected));
    tab.tabIndex = isSelected ? 0 : -1;
  }

  for (const panel of tabPanels) {
    panel.hidden = panel.id !== selectedTab.dataset.panel;
  }

  if (moveFocus) {
    selectedTab.focus();
  }
}

function renderNameEntries(entries) {
  namesPanel.replaceChildren();

  if (entries.length === 0) {
    namesPanel.textContent = 'No group/name entries were parsed from this event.';
    return;
  }

  const entriesByGroup = new Map();
  for (const entry of entries) {
    const names = entriesByGroup.get(entry.group) ?? [];
    if (!names.includes(entry.name)) {
      names.push(entry.name);
    }
    entriesByGroup.set(entry.group, names);
  }

  const list = document.createElement('dl');
  list.className = 'name-entry-list';
  for (const [group, names] of entriesByGroup) {
    const term = document.createElement('dt');
    const groupCode = document.createElement('code');
    groupCode.textContent = group;
    term.append(groupCode);

    const description = document.createElement('dd');
    description.textContent = names.join(', ');
    list.append(term, description);
  }
  namesPanel.append(list);
}

function showEventDetails(event, opener) {
  dialogOpener = opener;
  dialogTitle.textContent = event.title;
  dialogWhen.textContent =
    `${formatHeadingDate(event.date)}, ${formatTime(event.startTime)}–${formatTime(event.endTime)}`;
  dialogLocation.textContent = event.location?.trim() || 'No location listed.';
  descriptionPanel.textContent = event.description.trim() || 'No calendar description.';
  fullTextPanel.textContent = event.normalizedFullText || 'No normalized text.';
  renderNameEntries(event.nameEntries);
  activateTab(tabs[0]);
  eventDialog.showModal();
}

function renderEvent(event) {
  const article = document.createElement('article');
  article.className = 'event-card';

  const title = document.createElement('h3');
  title.textContent = event.title;

  const time = document.createElement('p');
  time.className = 'event-time';
  time.textContent = `${formatTime(event.startTime)}–${formatTime(event.endTime)}`;

  article.append(title, time);

  if (typeof event.location === 'string' && event.location.trim() !== '') {
    const location = document.createElement('p');
    location.className = 'event-location';
    location.textContent = event.location;
    article.append(location);
  }

  const detailsButton = document.createElement('button');
  detailsButton.type = 'button';
  detailsButton.className = 'view-details-button secondary-button';
  detailsButton.textContent = 'View details';
  detailsButton.addEventListener('click', () => showEventDetails(event, detailsButton));
  article.append(detailsButton);

  return article;
}

function renderResults(events) {
  let currentDate = null;
  let dateSection = null;

  for (const event of events) {
    if (event.date !== currentDate) {
      currentDate = event.date;
      dateSection = document.createElement('section');
      dateSection.className = 'date-group';

      const heading = document.createElement('h2');
      heading.textContent = formatHeadingDate(event.date);
      dateSection.append(heading);
      resultsContainer.append(dateSection);
    }

    dateSection.append(renderEvent(event));
  }
}

function showError(message) {
  statusMessage.className = 'message error';
  statusMessage.textContent = message;
  statusPanel.hidden = false;
  summaryPanel.hidden = true;
  resultsContainer.hidden = true;
}

async function loadResults() {
  try {
    const parameters = new URLSearchParams(window.location.search);
    const showAllValues = parameters.getAll('ShowAll');
    if (showAllValues.length > 1 || (showAllValues.length === 1 && showAllValues[0] !== 'true')) {
      throw new Error('ShowAll must have the value true when it is present.');
    }

    const showAll = showAllValues.length === 1;
    const ruleSources = parameters.getAll('rule');
    const rules = showAll ? [] : parseRules(ruleSources);

    const response = await fetch('rehearsals.json', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Unable to load rehearsal data (${response.status}).`);
    }

    const snapshot = await response.json();
    validateSnapshot(snapshot);

    const matchingEvents = showAll
      ? snapshot.events
      : snapshot.events.filter((event) =>
        rules.some((rule) => eventMatchesRule(event, rule))
      );

    resultSummary.textContent = showAll
      ? `Showing all ${matchingEvents.length} rehearsals`
      : matchingEvents.length === 1
        ? '1 matching event'
        : `${matchingEvents.length} matching events`;
    dateRange.textContent =
      `Showing results for ${formatRangeDate(snapshot.firstDay)} through ${formatRangeDate(snapshot.lastDay)}.`;

    if (showAll) {
      showAllNote.textContent = ruleSources.length === 0
        ? 'Filtering is disabled.'
        : 'Filtering is disabled. The saved query rules below are not currently applied.';
      showAllNote.hidden = false;
      queryRulesSummary.textContent = 'Saved query rules';
    }

    queryRules.hidden = ruleSources.length === 0;
    renderRules(ruleSources);
    renderResults(matchingEvents);

    statusPanel.hidden = true;
    summaryPanel.hidden = false;
    resultsContainer.hidden = false;

    if (matchingEvents.length === 0) {
      const emptyMessage = document.createElement('p');
      emptyMessage.className = 'panel message';
      emptyMessage.textContent = 'No rehearsals matched this query.';
      resultsContainer.append(emptyMessage);
    }
  } catch (error) {
    showError(error instanceof Error ? error.message : 'Unable to display rehearsal results.');
  }
}

for (const tab of tabs) {
  tab.addEventListener('click', () => activateTab(tab));
  tab.addEventListener('keydown', (event) => {
    const currentIndex = tabs.indexOf(tab);
    let nextIndex;

    switch (event.key) {
      case 'ArrowLeft':
        nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        break;
      case 'ArrowRight':
        nextIndex = (currentIndex + 1) % tabs.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = tabs.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    activateTab(tabs[nextIndex], true);
  });
}

closeDialogButton.addEventListener('click', () => eventDialog.close());
eventDialog.addEventListener('close', () => {
  dialogOpener?.focus();
  dialogOpener = null;
});

loadResults();
