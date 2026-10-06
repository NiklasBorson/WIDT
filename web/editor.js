const form = document.querySelector('#query-form');
const rulesTextArea = document.querySelector('#rules');
const errorMessage = document.querySelector('#editor-error');

const parameters = new URLSearchParams(window.location.search);
rulesTextArea.value = parameters.getAll('rule').join('\n');

form.addEventListener('submit', (event) => {
  event.preventDefault();

  const rules = rulesTextArea.value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));

  if (rules.length === 0) {
    errorMessage.textContent = 'Enter at least one filter rule.';
    errorMessage.hidden = false;
    rulesTextArea.focus();
    return;
  }

  const query = new URLSearchParams();
  for (const rule of rules) {
    query.append('rule', rule);
  }

  window.location.assign(`results.html?${query.toString()}`);
});

rulesTextArea.addEventListener('input', () => {
  errorMessage.hidden = true;
});
