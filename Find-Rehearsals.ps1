<#
.SYNOPSIS
    Finds WIDT (Whidbey Island Dance Theater) rehearsals in a date range that
    match a user-supplied filter, based on the public WIDT backstage Google
    Calendar feed.

.DESCRIPTION
    Downloads the public .ics feed for the WIDT backstage calendar, expands
    recurring events in the given date range, parses each event's body into
    group -> name lists, and prints the events that match any rule in the
    filter file.

.PARAMETER Filter
    Path to a filter file. Each non-blank, non-comment ("#") line is one
    match rule in the form "Kind:Value":

      Title:<text>        Matches if the event's normalized title starts
                           with normalized <text>.
      Name:<name>         Matches if <name> appears as an individual name
                           anywhere in the event body's name lists.
      Group.Name:<g>.<n>  Matches if the event body has a heading that
                           normalizes to <g> AND that heading's list
                           contains <n>.
      FullText:<text>     Matches if normalized <text> appears anywhere in
                           the event's normalized title or body.

    An event matches the filter if ANY rule matches it.

.PARAMETER StartDate
    Start of the date range (inclusive). Defaults to today.

.PARAMETER Days
    Number of days in the range. The end date (exclusive) is StartDate +
    Days. Defaults to 7.

.PARAMETER CalendarUrl
    URL of the public .ics feed for the WIDT backstage Google Calendar.

.PARAMETER All
    Ignores the filter and outputs every calendar entry in the date range.

.PARAMETER Detailed
    Also prints each printed event's parsed Group -> Name entries, to help
    verify/debug how the body was parsed and why an event did or didn't
    match.

.PARAMETER FullText
    Also prints each printed event's normalized full text (title + body),
    i.e. the text the FullText filter rule matches against.

.EXAMPLE
    .\Find-Rehearsals.ps1

.EXAMPLE
    .\Find-Rehearsals.ps1 -Filter myfilter.txt -StartDate 2026-10-04 -Days 14

.EXAMPLE
    .\Find-Rehearsals.ps1 -All -Detailed
#>
[CmdletBinding()]
param(
    [string]$Filter = (Join-Path $PSScriptRoot "filter.txt"),

    [datetime]$StartDate = (Get-Date).Date,

    [int]$Days = 7,

    [string]$CalendarUrl = "https://calendar.google.com/calendar/ical/c_b50b7a193a5c9f9407267d2b2755e9e07fa2d7e0b88ad317165c2d197b9d50cc%40group.calendar.google.com/public/basic.ics",

    [switch]$All,

    [switch]$Detailed,

    [switch]$FullText
)

Import-Module (Join-Path $PSScriptRoot 'RehearsalCalendar.psm1') -Force

$EndDate = $StartDate.AddDays($Days)
$rules = Get-FilterRules -Path $Filter
Write-Host "Loaded $($rules.Count) filter rule(s) from $Filter."

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
    if ($FullText) {
        Write-Host "  Full text: $($occ.NormalizedFullText)"
    }
    Write-Host ""
}
