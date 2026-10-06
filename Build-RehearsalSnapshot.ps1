<#
.SYNOPSIS
    Builds a JSON snapshot of upcoming WIDT rehearsals for the web application.

.DESCRIPTION
    Downloads the public WIDT backstage calendar and writes already-expanded,
    normalized event occurrences for 30 inclusive Pacific calendar days,
    starting with the current Pacific date.

.PARAMETER OutputPath
    Destination JSON file. Defaults to rehearsals.json beside this script.

.PARAMETER CalendarUrl
    URL of the public .ics feed for the WIDT backstage Google Calendar.

.EXAMPLE
    .\Build-RehearsalSnapshot.ps1

.EXAMPLE
    .\Build-RehearsalSnapshot.ps1 -OutputPath .\web\data\rehearsals.json
#>
[CmdletBinding()]
param(
    [string]$OutputPath = (Join-Path $PSScriptRoot 'rehearsals.json'),

    [string]$CalendarUrl = "https://calendar.google.com/calendar/ical/c_b50b7a193a5c9f9407267d2b2755e9e07fa2d7e0b88ad317165c2d197b9d50cc%40group.calendar.google.com/public/basic.ics"
)

Import-Module (Join-Path $PSScriptRoot 'RehearsalCalendar.psm1') -Force

$firstDay = Get-PacificToday
$lastDay = $firstDay.AddDays(29)
$rangeEnd = $lastDay.AddDays(1)

Write-Host "Fetching WIDT rehearsal calendar for $($firstDay.ToString('yyyy-MM-dd')) through $($lastDay.ToString('yyyy-MM-dd'))..."
$occurrences = @(Get-RehearsalOccurrences -CalendarUrl $CalendarUrl -RangeStart $firstDay -RangeEnd $rangeEnd)

if ($occurrences.Count -eq 0) {
    throw 'The calendar returned no events in the snapshot range.'
}

$events = @(
    foreach ($occurrence in $occurrences) {
        if ($occurrence.IsAllDay) {
            throw "Snapshot event '$($occurrence.Summary)' on $($occurrence.Start.ToString('yyyy-MM-dd')) is all-day."
        }
        if ($occurrence.Start.Date -ne $occurrence.End.Date) {
            throw "Snapshot event '$($occurrence.Summary)' spans multiple Pacific calendar days."
        }
        if ($occurrence.End -le $occurrence.Start) {
            throw "Snapshot event '$($occurrence.Summary)' has an invalid time range."
        }
        if ([string]::IsNullOrWhiteSpace($occurrence.Summary)) {
            throw "A snapshot event on $($occurrence.Start.ToString('yyyy-MM-dd')) has no title."
        }

        [ordered]@{
            date               = $occurrence.Start.ToString('yyyy-MM-dd')
            startTime          = $occurrence.Start.ToString('HH:mm')
            endTime            = $occurrence.End.ToString('HH:mm')
            title              = $occurrence.Summary
            location           = if ([string]::IsNullOrWhiteSpace($occurrence.Location)) { $null } else { $occurrence.Location }
            normalizedTitle    = $occurrence.NormalizedTitle
            normalizedFullText = $occurrence.NormalizedFullText
            nameEntries        = @(
                foreach ($entry in $occurrence.NameEntries) {
                    [ordered]@{
                        group = $entry.Group
                        name  = $entry.Name
                    }
                }
            )
        }
    }
)

$snapshot = [ordered]@{
    generatedAt = [datetimeoffset]::UtcNow.ToString('o')
    timeZone    = 'America/Los_Angeles'
    firstDay    = $firstDay.ToString('yyyy-MM-dd')
    lastDay     = $lastDay.ToString('yyyy-MM-dd')
    events      = $events
}

$resolvedOutputPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath)
$outputDirectory = Split-Path -Parent $resolvedOutputPath
if (-not (Test-Path -LiteralPath $outputDirectory)) {
    New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
}

$snapshot | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $resolvedOutputPath -Encoding utf8

Write-Host "Wrote $($events.Count) event(s) to $resolvedOutputPath."
