const editQueryLink = document.querySelector('#edit-query-link');
const statusPanel = document.querySelector('#status-panel');
const statusMessage = document.querySelector('#status');
const summaryPanel = document.querySelector('#summary-panel');
const resultSummary = document.querySelector('#result-summary');
const dateRange = document.querySelector('#date-range');
const activeRules = document.querySelector('#active-rules');
const resultsContainer = document.querySelector('#results');

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
      || typeof event.normalizedTitle !== 'string'
      || typeof event.normalizedFullText !== 'string'
      || !Array.isArray(event.nameEntries)
    ) {
      throw new Error('The rehearsal snapshot contains an invalid event.');
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

function renderRules(rules) {
  for (const rule of rules) {
    const item = document.createElement('li');
    const code = document.createElement('code');
    code.textContent = rule.source;
    item.append(code);
    activeRules.append(item);
  }
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
    const rules = parseRules(parameters.getAll('rule'));

    const response = await fetch('rehearsals.json', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Unable to load rehearsal data (${response.status}).`);
    }

    const snapshot = await response.json();
    validateSnapshot(snapshot);

    const matchingEvents = snapshot.events.filter((event) =>
      rules.some((rule) => eventMatchesRule(event, rule))
    );

    resultSummary.textContent = matchingEvents.length === 1
      ? '1 matching event'
      : `${matchingEvents.length} matching events`;
    dateRange.textContent =
      `Showing results for ${formatRangeDate(snapshot.firstDay)} through ${formatRangeDate(snapshot.lastDay)}.`;

    renderRules(rules);
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

loadResults();
