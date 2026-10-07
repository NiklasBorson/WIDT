<#
.SYNOPSIS
    Finds WIDT (Whidbey Island Dance Theater) rehearsals in a date range that
    match a user-supplied filter, based on the public WIDT backstage Google
    Calendar feed.

.DESCRIPTION
    Downloads the public .ics feed for the WIDT backstage calendar, expands
    recurring events in the given date range, parses each event's body into
    group -> name lists, and prints the events that match any command-line
    filter. An event matches if any supplied filter matches it.

.PARAMETER Title
    One or more title fragments. Matches when the normalized fragment appears
    anywhere in the event's normalized title.

.PARAMETER Name
    One or more names. Matches an exact, case-insensitive individual name
    anywhere in the event body's parsed name lists.

.PARAMETER GroupName
    One or more values in the form <group>.<name>. Matches when the parsed
    event body has a heading that normalizes to <group> and that heading's
    list contains the exact, case-insensitive <name>.

.PARAMETER FullText
    One or more text fragments. Matches when the normalized fragment appears
    anywhere in the event's normalized title or body.

.PARAMETER StartDate
    Start of the date range (inclusive). Defaults to today.

.PARAMETER Days
    Number of days in the range. The end date (exclusive) is StartDate +
    Days. Defaults to 30.

.PARAMETER CalendarUrl
    URL of the public .ics feed for the WIDT backstage Google Calendar.

.PARAMETER All
    Ignores supplied filters and outputs every calendar entry in the date
    range.

.PARAMETER Detailed
    Also prints each printed event's parsed Group -> Name entries, to help
    verify/debug how the body was parsed and why an event did or didn't
    match.

.PARAMETER ShowFullText
    Also prints each printed event's normalized full text (title + body),
    i.e. the text the FullText filter matches against.

.EXAMPLE
    .\Find-Rehearsals.ps1 -Title Emma -Name Nick,Jan -GroupName Uncle.Derek

.EXAMPLE
    .\Find-Rehearsals.ps1 -FullText 'costume fitting' -StartDate 2026-10-04 -Days 14

.EXAMPLE
    .\Find-Rehearsals.ps1 -All -Detailed
#>
[CmdletBinding()]
param(
    [string[]]$Title,

    [string[]]$Name,

    [string[]]$GroupName,

    [string[]]$FullText,

    [datetime]$StartDate = (Get-Date).Date,

    [int]$Days = 30,

    [string]$CalendarUrl = "https://calendar.google.com/calendar/ical/c_b50b7a193a5c9f9407267d2b2755e9e07fa2d7e0b88ad317165c2d197b9d50cc%40group.calendar.google.com/public/basic.ics",

    [switch]$All,

    [switch]$Detailed,

    [switch]$ShowFullText
)

Import-Module (Join-Path $PSScriptRoot 'RehearsalCalendar.psm1') -Force

$EndDate = $StartDate.AddDays($Days)
$rules = [System.Collections.Generic.List[object]]::new()

foreach ($value in $Title) {
    $normalizedValue = Get-NormalizedTitle $value
    if ($normalizedValue -eq '') {
        throw 'Title filter values cannot be empty.'
    }
    $rules.Add([PSCustomObject]@{
            Kind            = 'Title'
            NormalizedTitle = $normalizedValue
        })
}

foreach ($value in $Name) {
    $trimmedValue = $value.Trim()
    if ($trimmedValue -eq '') {
        throw 'Name filter values cannot be empty.'
    }
    $rules.Add([PSCustomObject]@{
            Kind = 'Name'
            Name = $trimmedValue
        })
}

foreach ($value in $GroupName) {
    $dotIndex = $value.IndexOf('.')
    if ($dotIndex -le 0 -or $dotIndex -eq $value.Length - 1) {
        throw "GroupName filter value '$value' must use the form '<group>.<name>'."
    }

    $group = $value.Substring(0, $dotIndex).Trim()
    $nameValue = $value.Substring($dotIndex + 1).Trim()
    if ($group -eq '' -or $nameValue -eq '') {
        throw "GroupName filter value '$value' must include both a group and a name."
    }

    $rules.Add([PSCustomObject]@{
            Kind  = 'Group.Name'
            Group = Get-NormalizedGroup $group
            Name  = $nameValue
        })
}

foreach ($value in $FullText) {
    $normalizedValue = Get-NormalizedTitle $value
    if ($normalizedValue -eq '') {
        throw 'FullText filter values cannot be empty.'
    }
    $rules.Add([PSCustomObject]@{
            Kind           = 'FullText'
            NormalizedText = $normalizedValue
        })
}

if (-not $All -and $rules.Count -eq 0) {
    throw 'Specify at least one -Title, -Name, -GroupName, or -FullText filter, or use -All.'
}

if ($All) {
    Write-Host 'All calendar events will be included.'
}
else {
    Write-Host "Using $($rules.Count) command-line filter(s)."
}

Write-Host "Fetching WIDT rehearsal calendar for $($StartDate.ToString('yyyy-MM-dd')) through $($EndDate.AddDays(-1).ToString('yyyy-MM-dd'))..."
$occurrences = @(Get-RehearsalOccurrences -CalendarUrl $CalendarUrl -RangeStart $StartDate -RangeEnd $EndDate)
Write-Host "Found $($occurrences.Count) calendar event(s) in range."

$matchingOccurrences = New-Object System.Collections.Generic.List[object]
foreach ($occ in $occurrences) {
    if ($All -or (Test-EventMatchesFilter -Summary $occ.Summary -NormalizedFullText $occ.NormalizedFullText -NameEntries $occ.NameEntries -Rules $rules)) {
        $matchingOccurrences.Add($occ)
    }
}

if ($All) {
    Write-Host "$($matchingOccurrences.Count) event(s) (filter ignored due to -All):"
}
else {
    Write-Host "$($matchingOccurrences.Count) matching event(s):"
}
Write-Host ""

foreach ($occ in $matchingOccurrences) {
    Write-Host "=== $($occ.Summary) ===" -ForegroundColor Cyan
    Write-Host "  When:  $(Format-EventWhen $occ)"
    Write-Host "  Where: $(if ($occ.Location) { $occ.Location } else { '(unspecified)' })"
    if ($Detailed) {
        $entryLines = Format-NameEntries -NameEntries $occ.NameEntries
        if ($entryLines.Count -eq 0) {
            Write-Host "  Name entries: (none found)"
        }
        else {
            Write-Host "  Name entries:"
            foreach ($line in $entryLines) {
                Write-Host "    $line"
            }
        }
    }
    if ($ShowFullText) {
        Write-Host "  Full text: $($occ.NormalizedFullText)"
    }
    Write-Host ""
}
