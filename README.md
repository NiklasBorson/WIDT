# WIDT Rehearsal Finder

WIDT Rehearsal Finder provides two ways to search the Whidbey Island Dance
Theatre rehearsal calendar:

- A PowerShell command-line tool for local use.
- A static web application hosted by GitHub Pages.

Both interfaces use the same rule syntax and calendar-processing logic. Search
URLs in the web application contain the rules in their query string, so a
search can be bookmarked or shared and will show results from the latest
calendar snapshot whenever it is reopened.

## Design

The Google Calendar iCalendar feed does not allow cross-origin browser
requests, so the GitHub Pages application cannot retrieve it directly. Instead,
the project separates calendar processing from browser-side filtering:

1. A scheduled GitHub Actions workflow downloads the public iCalendar feed.
2. `Build-RehearsalSnapshot.ps1` parses the feed, expands recurring events, and
   produces a browser-friendly `rehearsals.json` snapshot.
3. The workflow combines that snapshot with the files in `web/` and deploys the
   complete site as a GitHub Pages artifact.
4. The browser loads the same-origin JSON file and applies the rules encoded in
   the page URL.

This keeps recurrence and time-zone processing in PowerShell while leaving the
browser with only query parsing, filtering, and presentation.

The deployed site is transactional: GitHub Pages switches to a new artifact
only after the workflow successfully builds and deploys it. The generated
snapshot is therefore not committed to the repository.

## Calendar snapshot

Each snapshot covers 30 inclusive Pacific calendar days:

- `firstDay` is the current date in `America/Los_Angeles`.
- `lastDay` is 29 days after `firstDay`.
- Events are expanded and filtered to that date range.

The builder validates the assumptions used by the web application: rehearsals
must be timed events, must not cross midnight, and must have valid titles and
time ranges.

A snapshot has this general shape:

```json
{
  "generatedAt": "2026-10-06T02:35:13.9906671+00:00",
  "timeZone": "America/Los_Angeles",
  "firstDay": "2026-10-05",
  "lastDay": "2026-11-03",
  "events": [
    {
      "uniqueId": "98c4b4e192f8519a8bc9cb2d47a51f06",
      "date": "2026-10-10",
      "startTime": "12:00",
      "endTime": "12:45",
      "title": "Dolls-Rehearsal Katelyn",
      "location": "Island Dance-2-Studio #2 (50)",
      "description": "Dolls:\nAva",
      "normalizedTitle": "dolls rehearsal katelyn",
      "normalizedFullText": "...",
      "nameEntries": [
        {
          "group": "doll",
          "name": "Ava"
        }
      ]
    }
  ]
}
```

The snapshot is part of the public Pages site. Its event text and parsed name
entries should therefore be treated as public data.

## Web application

The site has two pages:

- `index.html` is a simple multiline rule editor. It removes blank lines and
  comments, then serializes the remaining lines as repeated `rule` query
  parameters.
- `results.html` validates the rules, loads `rehearsals.json`, filters the
  events, and renders matching rehearsals grouped by date.
- **Show all rehearsals** adds `ShowAll=true` while retaining any entered rules
  for later editing. The results page bypasses rule validation and filtering in
  this mode.
- Each result includes a details dialog with the original calendar
  description, parsed group/name entries, and normalized full text used for
  query matching.
- Each result links to a generated `events/WIDT_<uniqueId>.ics` file that can be
  imported into Google Calendar, Outlook, Apple Calendar, and other
  iCalendar-compatible applications. Imported events are independent copies
  and do not receive subsequent schedule updates.

For example:

```text
results.html?rule=Name%3AAlice&rule=Group.Name%3AUnderstudies.Alice
```

The **Edit query** link preserves the query string when returning to the editor.
Comments and blank lines are intentionally not represented in the URL and
therefore do not round-trip.

The web application uses plain HTML, CSS, and JavaScript modules. It has no
framework, package dependencies, or build step. Calendar content is inserted
with DOM APIs and `textContent`, and the pages use a restrictive same-origin
Content Security Policy.

## Filter rules

Enter one rule per line. Blank lines and lines beginning with `#` are ignored.
An event matches when **any** rule matches.

| Rule | Behavior |
| --- | --- |
| `Title:<text>` | Matches when the normalized event title starts with the normalized text. |
| `Name:<name>` | Matches an exact, case-insensitive name in any parsed name list. |
| `Group.Name:<group>.<name>` | Matches an exact name beneath the specified normalized group heading. |
| `FullText:<text>` | Matches normalized text anywhere in the event title or description. |

Examples:

```text
# Match any event containing Alice in a name list
Name:Alice

# Match Alice only when listed under Understudies
Group.Name:Understudies.Alice

# Match events whose titles begin with "Living Room"
Title:Living Room

# Match text anywhere in the title or description
FullText:costume fitting
```

Text normalization replaces punctuation with spaces, collapses whitespace, and
ignores case. Group names are also depluralized before comparison.

## Repository layout

```text
.github/workflows/deploy-pages.yml  Builds and deploys the Pages site
Build-RehearsalSnapshot.ps1         Produces rehearsals.json and event ICS files
Find-Rehearsals.ps1                 Command-line rehearsal search
RehearsalCalendar.psm1              Shared calendar and filtering logic
filter.txt                          Command-line filter rules
apps-script/update-button/          Google Apps Script update-button source
  Code.gs                           Server-side workflow dispatch and cooldown
  Index.html                        Update-button web page
  appsscript.json                   Apps Script manifest and OAuth scope
web/
  index.html                        Query editor
  editor.js                         Text-to-query-string conversion
  results.html                      Results page
  results.js                        Browser-side validation and filtering
  styles.css                        Shared site styles
```

During deployment, `Build-RehearsalSnapshot.ps1` also creates an `events/`
directory beside `rehearsals.json`, containing one ICS file for each expanded
occurrence. The stable `uniqueId` is derived from the source event UID and, for
recurring events, its original recurrence identity.

## Local PowerShell use

Run a search using the rules in `filter.txt`:

```powershell
.\Find-Rehearsals.ps1
```

Generate a snapshot in the repository directory:

```powershell
.\Build-RehearsalSnapshot.ps1
```

Generate it at a specific location:

```powershell
.\Build-RehearsalSnapshot.ps1 -OutputPath .\_site\rehearsals.json
```

The shared module recognizes the Windows time-zone identifier
`Pacific Standard Time` and the IANA identifier `America/Los_Angeles`, allowing
the scripts to run on both Windows and Linux.

## GitHub Pages deployment

The deployment workflow runs:

- Every hour at 17 minutes after the hour.
- On pushes to `main`.
- When manually dispatched from the Actions tab.
- When requested through the WIDT update button.

It copies `web/` into an `_site` staging directory, generates
`_site/rehearsals.json`, uploads the directory as a Pages artifact, and deploys
it to the `github-pages` environment. The Actions run name and job summary
identify whether a deployment was triggered by the schedule, a push, GitHub's
**Run workflow** button, or the WIDT update button.

To enable deployment, open the repository's **Settings**, select **Pages**, and
set **Source** to **GitHub Actions**. No service account, personal access token,
or repository secret is required; the workflow uses GitHub's temporary token
with narrowly scoped Pages permissions.

## Calendar update button

The optional update button provides a simple way to request a fresh snapshot
immediately after the source calendar is updated. It is a standalone Google
Apps Script web app hosted under the script owner's Google account. Loading the
page has no side effects; an update is requested only when the user explicitly
presses **Update rehearsal finder**.

The browser invokes a server-side Apps Script function, which calls GitHub's
workflow-dispatch API with fixed values for the repository, workflow, branch,
and trigger source. The GitHub credential is never sent to the browser. The
script uses a project-wide lock and a five-minute cooldown to avoid duplicate
requests. The hourly workflow schedule remains enabled as a fallback.

### Apps Script setup

1. Create a standalone Apps Script project.
2. Copy the files from `apps-script/update-button/` into the project. Enable
   display of `appsscript.json` under **Project Settings** before replacing the
   generated manifest.
3. Create a fine-grained GitHub personal access token restricted to the
   `NiklasBorson/WIDT` repository with **Actions: read and write** permission.
4. In the Apps Script project's **Script Properties**, add the token with the
   property name `GITHUB_TOKEN`.
5. Deploy the project as a web app that executes as the project owner and is
   accessible to anyone with a Google account.
6. Distribute the production `/exec` URL rather than the editor-only `/dev`
   test URL.

The script creates the `LAST_SUCCESSFUL_REQUEST_MS` property after the first
successful request. It uses this property to enforce the cooldown; it should
not be created manually.

The deployed Apps Script project is not updated automatically when the
repository files change. After copying and saving a change in Apps Script, use
**Deploy** > **Manage deployments**, edit the existing deployment, select
**New version**, and deploy it. The production `/exec` URL remains the same.

Treat the fine-grained token as a password. Do not commit it, put it in the
HTML page, or paste it into browser-side JavaScript. Rotate it before its
expiration date by generating a replacement token and updating the
`GITHUB_TOKEN` Script Property. Revoking the token or the Apps Script web
deployment disables the button without affecting scheduled deployments.
