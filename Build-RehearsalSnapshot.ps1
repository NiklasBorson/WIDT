<#
.SYNOPSIS
    Builds a JSON snapshot of upcoming WIDT rehearsals for the web application.

.DESCRIPTION
    Downloads the public WIDT backstage calendar, writes already-expanded,
    normalized event occurrences for 30 inclusive Pacific calendar days, and
    creates one importable ICS file per occurrence.

.PARAMETER OutputPath
    Destination JSON file. Event calendar files are written to an events
    directory beside it. Defaults to rehearsals.json beside this script.

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

function Get-OccurrenceUniqueId {
    param([object]$Occurrence)

    $identity = $Occurrence.UID
    if ($null -ne $Occurrence.RecurrenceId) {
        $identity += "`n$($Occurrence.RecurrenceId.ToString('yyyyMMddTHHmmss'))"
    }

    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
        $hash = $sha256.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($identity))
    }
    finally {
        $sha256.Dispose()
    }

    return (-join ($hash[0..15] | ForEach-Object { $_.ToString('x2') }))
}

function ConvertTo-IcsText {
    param([AllowEmptyString()][string]$Text)

    if ($null -eq $Text) { return '' }
    $escaped = $Text -replace '\\', '\\'
    $escaped = $escaped -replace "`r`n|`r|`n", '\n'
    $escaped = $escaped -replace ';', '\;'
    $escaped = $escaped -replace ',', '\,'
    return $escaped
}

function ConvertTo-FoldedIcsLine {
    param([string]$Line)

    $encoding = [System.Text.Encoding]::UTF8
    $elements = [System.Globalization.StringInfo]::GetTextElementEnumerator($Line)
    $lines = New-Object System.Collections.Generic.List[string]
    $current = ''
    $currentBytes = 0
    $limit = 75

    while ($elements.MoveNext()) {
        $element = $elements.GetTextElement()
        $elementBytes = $encoding.GetByteCount($element)
        if ($currentBytes -gt 0 -and $currentBytes + $elementBytes -gt $limit) {
            $lines.Add($current)
            $current = ' '
            $currentBytes = 1
            $limit = 75
        }
        $current += $element
        $currentBytes += $elementBytes
    }

    $lines.Add($current)
    return $lines -join "`r`n"
}

function Write-OccurrenceCalendarFile {
    param(
        [object]$Occurrence,
        [string]$UniqueId,
        [string]$Description,
        [datetime]$GeneratedAtUtc,
        [System.TimeZoneInfo]$PacificZone,
        [string]$Path
    )

    $start = [datetime]::SpecifyKind($Occurrence.Start, [System.DateTimeKind]::Unspecified)
    $end = [datetime]::SpecifyKind($Occurrence.End, [System.DateTimeKind]::Unspecified)
    $startUtc = [System.TimeZoneInfo]::ConvertTimeToUtc($start, $PacificZone)
    $endUtc = [System.TimeZoneInfo]::ConvertTimeToUtc($end, $PacificZone)

    $lines = @(
        'BEGIN:VCALENDAR'
        'VERSION:2.0'
        'PRODID:-//Whidbey Island Dance Theatre//Rehearsal Finder//EN'
        'CALSCALE:GREGORIAN'
        'METHOD:PUBLISH'
        'BEGIN:VEVENT'
        "UID:$UniqueId@niklasborson.github.io"
        "DTSTAMP:$($GeneratedAtUtc.ToString('yyyyMMddTHHmmssZ'))"
        "DTSTART:$($startUtc.ToString('yyyyMMddTHHmmssZ'))"
        "DTEND:$($endUtc.ToString('yyyyMMddTHHmmssZ'))"
        "SUMMARY:$(ConvertTo-IcsText $Occurrence.Summary)"
    )
    if (-not [string]::IsNullOrWhiteSpace($Description)) {
        $lines += "DESCRIPTION:$(ConvertTo-IcsText $Description)"
    }
    if (-not [string]::IsNullOrWhiteSpace($Occurrence.Location)) {
        $lines += "LOCATION:$(ConvertTo-IcsText $Occurrence.Location)"
    }
    $lines += @(
        'STATUS:CONFIRMED'
        'TRANSP:OPAQUE'
        'END:VEVENT'
        'END:VCALENDAR'
    )

    $content = (($lines | ForEach-Object { ConvertTo-FoldedIcsLine $_ }) -join "`r`n") + "`r`n"
    [System.IO.File]::WriteAllText($Path, $content, [System.Text.UTF8Encoding]::new($false))
}

$firstDay = Get-PacificToday
$lastDay = $firstDay.AddDays(29)
$rangeEnd = $lastDay.AddDays(1)
$generatedAtUtc = [datetime]::UtcNow
$pacificZone = Get-PacificTimeZone

Write-Host "Fetching WIDT rehearsal calendar for $($firstDay.ToString('yyyy-MM-dd')) through $($lastDay.ToString('yyyy-MM-dd'))..."
$occurrences = @(Get-RehearsalOccurrences -CalendarUrl $CalendarUrl -RangeStart $firstDay -RangeEnd $rangeEnd)

if ($occurrences.Count -eq 0) {
    throw 'The calendar returned no events in the snapshot range.'
}

$resolvedOutputPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath)
$outputDirectory = Split-Path -Parent $resolvedOutputPath
if (-not (Test-Path -LiteralPath $outputDirectory)) {
    New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
}

$eventDirectory = Join-Path $outputDirectory 'events'
if (-not (Test-Path -LiteralPath $eventDirectory)) {
    New-Item -ItemType Directory -Path $eventDirectory -Force | Out-Null
}
Get-ChildItem -LiteralPath $eventDirectory -Filter '*.ics' -File |
    Remove-Item -Force

$uniqueIds = [System.Collections.Generic.HashSet[string]]::new()
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

        $uniqueId = Get-OccurrenceUniqueId $occurrence
        if (-not $uniqueIds.Add($uniqueId)) {
            throw "Multiple snapshot events produced the unique ID '$uniqueId'."
        }

        $description = Get-EventPlainText $occurrence.Description
        Write-OccurrenceCalendarFile `
            -Occurrence $occurrence `
            -UniqueId $uniqueId `
            -Description $description `
            -GeneratedAtUtc $generatedAtUtc `
            -PacificZone $pacificZone `
            -Path (Join-Path $eventDirectory "WIDT_$uniqueId.ics")

        [ordered]@{
            uniqueId           = $uniqueId
            date               = $occurrence.Start.ToString('yyyy-MM-dd')
            startTime          = $occurrence.Start.ToString('HH:mm')
            endTime            = $occurrence.End.ToString('HH:mm')
            title              = $occurrence.Summary
            location           = if ([string]::IsNullOrWhiteSpace($occurrence.Location)) { $null } else { $occurrence.Location }
            description        = $description
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
    generatedAt = ([datetimeoffset]$generatedAtUtc).ToString('o')
    timeZone    = 'America/Los_Angeles'
    firstDay    = $firstDay.ToString('yyyy-MM-dd')
    lastDay     = $lastDay.ToString('yyyy-MM-dd')
    events      = $events
}

$snapshot | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $resolvedOutputPath -Encoding utf8

Write-Host "Wrote $($events.Count) event(s) and calendar files to $outputDirectory."
