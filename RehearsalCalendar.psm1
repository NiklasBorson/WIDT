# Shared calendar parsing, recurrence expansion, description parsing, and filtering.

$script:DayAbbrevToDow = @{
    'SU' = [System.DayOfWeek]::Sunday
    'MO' = [System.DayOfWeek]::Monday
    'TU' = [System.DayOfWeek]::Tuesday
    'WE' = [System.DayOfWeek]::Wednesday
    'TH' = [System.DayOfWeek]::Thursday
    'FR' = [System.DayOfWeek]::Friday
    'SA' = [System.DayOfWeek]::Saturday
}

function Get-PacificTimeZone {
    try {
        return [System.TimeZoneInfo]::FindSystemTimeZoneById('Pacific Standard Time')
    }
    catch {
        return [System.TimeZoneInfo]::FindSystemTimeZoneById('America/Los_Angeles')
    }
}

function Get-PacificToday {
    $pacificZone = Get-PacificTimeZone
    return [System.TimeZoneInfo]::ConvertTimeFromUtc([datetime]::UtcNow, $pacificZone).Date
}

function ConvertFrom-IcsEscapedText {
    param([string]$Text)
    if ($null -eq $Text) { return "" }
    $t = $Text
    $t = $t -replace '\\[nN]', "`n"
    $t = $t -replace '\\,', ','
    $t = $t -replace '\\;', ';'
    $t = $t -replace '\\\\', '\'
    return $t
}

function ConvertFrom-SimpleHtml {
    param([string]$Text)
    if ([string]::IsNullOrEmpty($Text)) { return "" }
    $t = $Text
    $t = $t -replace '(?i)<br\s*/?>', "`n"
    $t = $t -replace '(?i)</tr>', "`n"
    $t = $t -replace '(?i)<tr[^>]*>', "`n"
    $t = $t -replace '(?i)</td>', "`n"
    $t = $t -replace '(?i)<td[^>]*>', ''
    $t = $t -replace '(?i)</li>', "`n"
    $t = $t -replace '(?i)<li[^>]*>', ''
    $t = $t -replace '(?i)</p>', "`n"
    $t = $t -replace '(?i)<p[^>]*>', ''
    $t = $t -replace '<[^>]+>', ''
    $t = $t -replace '&amp;', '&'
    $t = $t -replace '&nbsp;', ' '
    $t = $t -replace '&lt;', '<'
    $t = $t -replace '&gt;', '>'
    $t = $t -replace '&#39;', "'"
    $t = $t -replace '&quot;', '"'
    return $t
}

function Get-UnfoldedIcsLines {
    param([string]$RawIcs)
    # RFC5545 line unfolding: a line starting with a space or tab is a
    # continuation of the previous line.
    $src = $RawIcs -replace "`r`n", "`n"
    $rawLines = $src -split "`n"
    $lines = New-Object System.Collections.Generic.List[string]
    foreach ($line in $rawLines) {
        if ($line.Length -gt 0 -and ($line[0] -eq ' ' -or $line[0] -eq "`t")) {
            if ($lines.Count -gt 0) {
                $lines[$lines.Count - 1] = $lines[$lines.Count - 1] + $line.Substring(1)
            }
        }
        else {
            $lines.Add($line)
        }
    }
    return $lines
}

function ConvertFrom-IcsProperty {
    # Splits a single unfolded ICS line "NAME;PARAM=VALUE;...:VALUE" into
    # name, a hashtable of params, and the raw value.
    param([string]$Line)

    $colonIndex = -1
    $inQuotes = $false
    for ($i = 0; $i -lt $Line.Length; $i++) {
        $ch = $Line[$i]
        if ($ch -eq '"') { $inQuotes = -not $inQuotes }
        elseif ($ch -eq ':' -and -not $inQuotes) { $colonIndex = $i; break }
    }
    if ($colonIndex -lt 0) { return $null }

    $head = $Line.Substring(0, $colonIndex)
    $value = $Line.Substring($colonIndex + 1)
    $parts = $head -split ';'
    $name = $parts[0]
    $params = @{}
    for ($i = 1; $i -lt $parts.Count; $i++) {
        $kv = $parts[$i] -split '=', 2
        if ($kv.Count -eq 2) {
            $params[$kv[0].ToUpperInvariant()] = $kv[1]
        }
    }
    return [PSCustomObject]@{
        Name   = $name.ToUpperInvariant()
        Params = $params
        Value  = $value
    }
}

function Get-IcsDateTime {
    # Parses a DTSTART/DTEND/RECURRENCE-ID/EXDATE style value into a .NET
    # DateTime (in the local Pacific time zone) plus whether it's an all-day
    # (date-only) value.
    param(
        [string]$Value,
        [hashtable]$Params,
        [System.TimeZoneInfo]$PacificZone
    )

    $isDateOnly = ($Params.ContainsKey('VALUE') -and $Params['VALUE'] -eq 'DATE')

    if ($isDateOnly) {
        $dt = [datetime]::ParseExact($Value, 'yyyyMMdd', [System.Globalization.CultureInfo]::InvariantCulture)
        return [PSCustomObject]@{ DateTime = $dt; IsAllDay = $true }
    }

    if ($Value.EndsWith('Z')) {
        $dt = [datetime]::ParseExact($Value, "yyyyMMddTHHmmssZ", [System.Globalization.CultureInfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::AssumeUniversal -bor [System.Globalization.DateTimeStyles]::AdjustToUniversal)
        $local = [System.TimeZoneInfo]::ConvertTimeFromUtc($dt, $PacificZone)
        return [PSCustomObject]@{ DateTime = $local; IsAllDay = $false }
    }

    # Floating or TZID local time; treat the clock value as Pacific local time
    # regardless of the named zone, since this calendar is Pacific-based.
    $dt = [datetime]::ParseExact($Value, "yyyyMMddTHHmmss", [System.Globalization.CultureInfo]::InvariantCulture)
    return [PSCustomObject]@{ DateTime = $dt; IsAllDay = $false }
}

function Get-IcsEvents {
    # Downloads and parses the ICS feed into a list of raw VEVENT records
    # (not yet recurrence-expanded).
    param(
        [string]$Url,
        [System.TimeZoneInfo]$PacificZone
    )

    Write-Verbose "Downloading calendar feed from $Url"
    $raw = (Invoke-WebRequest -Uri $Url -UseBasicParsing).Content
    $lines = Get-UnfoldedIcsLines -RawIcs $raw

    $events = New-Object System.Collections.Generic.List[object]
    $current = $null

    foreach ($line in $lines) {
        if ($line -eq 'BEGIN:VEVENT') {
            $current = @{}
            continue
        }
        if ($line -eq 'END:VEVENT') {
            if ($null -ne $current) { $events.Add($current) }
            $current = $null
            continue
        }
        if ($null -eq $current) { continue }

        $prop = ConvertFrom-IcsProperty -Line $line
        if ($null -eq $prop) { continue }

        switch ($prop.Name) {
            'DTSTART' { $current['DTSTART'] = Get-IcsDateTime -Value $prop.Value -Params $prop.Params -PacificZone $PacificZone }
            'DTEND' { $current['DTEND'] = Get-IcsDateTime -Value $prop.Value -Params $prop.Params -PacificZone $PacificZone }
            'RECURRENCE-ID' { $current['RECURRENCE-ID'] = Get-IcsDateTime -Value $prop.Value -Params $prop.Params -PacificZone $PacificZone }
            'UID' { $current['UID'] = $prop.Value }
            'RRULE' { $current['RRULE'] = $prop.Value }
            'EXDATE' {
                if (-not $current.ContainsKey('EXDATE')) {
                    $current['EXDATE'] = New-Object System.Collections.Generic.List[datetime]
                }
                foreach ($value in ($prop.Value -split ',')) {
                    $parsed = Get-IcsDateTime -Value $value -Params $prop.Params -PacificZone $PacificZone
                    $current['EXDATE'].Add($parsed.DateTime)
                }
            }
            'SUMMARY' { $current['SUMMARY'] = ConvertFrom-IcsEscapedText $prop.Value }
            'DESCRIPTION' { $current['DESCRIPTION'] = ConvertFrom-IcsEscapedText $prop.Value }
            'LOCATION' { $current['LOCATION'] = ConvertFrom-IcsEscapedText $prop.Value }
            'STATUS' { $current['STATUS'] = $prop.Value }
            default { }
        }
    }

    return $events
}

function ConvertFrom-RRule {
    param([string]$RRuleValue)
    $rule = @{}
    foreach ($part in ($RRuleValue -split ';')) {
        $kv = $part -split '=', 2
        if ($kv.Count -eq 2) { $rule[$kv[0].ToUpperInvariant()] = $kv[1] }
    }
    return $rule
}

function Get-RecurrenceStartDates {
    # Expands an RRULE into a list of occurrence start DateTimes (date part
    # only drives the recurrence; time-of-day is taken from the master
    # DTSTART), bounded by [RangeStart, RangeEnd).
    param(
        [hashtable]$Rule,
        [datetime]$DtStart,
        [datetime]$RangeStart,
        [datetime]$RangeEnd,
        [System.TimeZoneInfo]$PacificZone
    )

    $freq = $Rule['FREQ']
    $interval = 1
    if ($Rule.ContainsKey('INTERVAL')) { $interval = [int]$Rule['INTERVAL'] }

    $until = $null
    if ($Rule.ContainsKey('UNTIL')) {
        $uv = $Rule['UNTIL']
        if ($uv.EndsWith('Z')) {
            $untilUtc = [datetime]::ParseExact($uv, "yyyyMMddTHHmmssZ", [System.Globalization.CultureInfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::AssumeUniversal -bor [System.Globalization.DateTimeStyles]::AdjustToUniversal)
            $until = [System.TimeZoneInfo]::ConvertTimeFromUtc($untilUtc, $PacificZone)
        }
        elseif ($uv.Contains('T')) {
            $until = [datetime]::ParseExact($uv, "yyyyMMddTHHmmss", [System.Globalization.CultureInfo]::InvariantCulture)
        }
        else {
            $until = [datetime]::ParseExact($uv, "yyyyMMdd", [System.Globalization.CultureInfo]::InvariantCulture).AddDays(1).AddSeconds(-1)
        }
    }

    $count = $null
    if ($Rule.ContainsKey('COUNT')) { $count = [int]$Rule['COUNT'] }

    $byDay = $null
    if ($Rule.ContainsKey('BYDAY')) {
        $byDay = @($Rule['BYDAY'] -split ',' | ForEach-Object { $script:DayAbbrevToDow[$_.Substring($_.Length - 2)] })
    }

    # Safety cap so a malformed/unbounded rule can't loop forever.
    $hardStopDate = $RangeEnd.AddYears(1)
    if ($null -ne $until -and $until -lt $hardStopDate) { $hardStopDate = $until }

    $results = New-Object System.Collections.Generic.List[datetime]
    $emitted = 0
    $timeOfDay = $DtStart.TimeOfDay

    switch ($freq) {
        'DAILY' {
            $cursor = $DtStart
            while ($cursor -le $hardStopDate -and ($null -eq $count -or $emitted -lt $count)) {
                if ($null -ne $until -and $cursor -gt $until) { break }
                $emitted++
                if ($cursor -ge $RangeStart -and $cursor -lt $RangeEnd) { $results.Add($cursor) }
                $cursor = $cursor.AddDays($interval)
            }
        }
        'WEEKLY' {
            if ($null -eq $byDay -or $byDay.Count -eq 0) { $byDay = @($DtStart.DayOfWeek) }
            # Walk week by week starting from the week of DTSTART.
            $weekStart = $DtStart.Date.AddDays(-[int]$DtStart.DayOfWeek) # Sunday-based week start
            $weekNum = 0
            $done = $false
            while (-not $done) {
                $thisWeekStart = $weekStart.AddDays(7 * $weekNum * $interval)
                if ($thisWeekStart -gt $hardStopDate) { break }
                foreach ($dow in $byDay) {
                    $occDate = $thisWeekStart.AddDays([int]$dow)
                    $occ = $occDate.Date + $timeOfDay
                    if ($occ -lt $DtStart) { continue }
                    if ($null -ne $until -and $occ -gt $until) { $done = $true; continue }
                    $emitted++
                    if ($null -ne $count -and $emitted -gt $count) { $done = $true; break }
                    if ($occ -ge $RangeStart -and $occ -lt $RangeEnd) { $results.Add($occ) }
                    if ($occ -gt $hardStopDate) { $done = $true }
                }
                $weekNum++
                if ($weekNum -gt 1000) { break }
            }
        }
        'YEARLY' {
            $year = $DtStart.Year
            while ($year -le $hardStopDate.Year -and ($null -eq $count -or $emitted -lt $count)) {
                $cursor = $DtStart.AddYears($year - $DtStart.Year)
                if ($Rule.ContainsKey('BYMONTH')) {
                    $month = [int](($Rule['BYMONTH'] -split ',')[0])
                    $cursor = [datetime]::new($year, $month, 1).Add($timeOfDay)
                }
                if ($Rule.ContainsKey('BYDAY')) {
                    $byDayPart = ($Rule['BYDAY'] -split ',')[0]
                    if ($byDayPart -notmatch '^([+-]?\d+)?([A-Z]{2})$') {
                        throw "Unsupported yearly BYDAY value '$byDayPart'."
                    }
                    $ordinal = if ($Matches[1]) { [int]$Matches[1] } else { 1 }
                    $dayOfWeek = $script:DayAbbrevToDow[$Matches[2]]
                    if ($ordinal -gt 0) {
                        $first = [datetime]::new($year, $cursor.Month, 1)
                        $offset = (([int]$dayOfWeek - [int]$first.DayOfWeek) + 7) % 7
                        $cursor = $first.AddDays($offset + (7 * ($ordinal - 1))).Add($timeOfDay)
                    }
                    else {
                        $last = [datetime]::new($year, $cursor.Month, [datetime]::DaysInMonth($year, $cursor.Month))
                        $offset = (([int]$last.DayOfWeek - [int]$dayOfWeek) + 7) % 7
                        $cursor = $last.AddDays(-$offset - (7 * ((-$ordinal) - 1))).Add($timeOfDay)
                    }
                }
                if ($cursor -lt $DtStart) {
                    $year += $interval
                    continue
                }
                if ($null -ne $until -and $cursor -gt $until) { break }
                $emitted++
                if ($cursor -ge $RangeStart -and $cursor -lt $RangeEnd) { $results.Add($cursor) }
                $year += $interval
            }
        }
        default {
            # Unsupported FREQ: fall back to treating it as a single
            # non-recurring event at DTSTART.
            if ($DtStart -ge $RangeStart -and $DtStart -lt $RangeEnd) { $results.Add($DtStart) }
        }
    }

    return $results
}

function Expand-IcsEvents {
    # Takes raw parsed VEVENTs (masters + override instances sharing a UID)
    # and produces concrete occurrence records within [RangeStart, RangeEnd).
    param(
        [System.Collections.Generic.List[object]]$RawEvents,
        [datetime]$RangeStart,
        [datetime]$RangeEnd,
        [System.TimeZoneInfo]$PacificZone = (Get-PacificTimeZone)
    )

    $byUid = @{}
    foreach ($ev in $RawEvents) {
        $uid = $ev['UID']
        if (-not $uid) { continue }
        if (-not $byUid.ContainsKey($uid)) { $byUid[$uid] = @{ Master = $null; Overrides = @{} } }
        if ($ev.ContainsKey('RECURRENCE-ID')) {
            $key = $ev['RECURRENCE-ID'].DateTime
            $byUid[$uid].Overrides[$key] = $ev
        }
        else {
            $byUid[$uid].Master = $ev
        }
    }

    $occurrences = New-Object System.Collections.Generic.List[object]
    $bufferedStart = $RangeStart.AddDays(-1)
    $bufferedEnd = $RangeEnd.AddDays(1)

    foreach ($uid in $byUid.Keys) {
        $entry = $byUid[$uid]
        $master = $entry.Master
        if ($null -eq $master) {
            # Only override instances exist (rare); treat each as standalone.
            foreach ($ov in $entry.Overrides.Values) {
                $occurrences.Add($ov) | Out-Null
            }
            continue
        }

        $dtStart = $master['DTSTART'].DateTime
        $dtEnd = if ($master.ContainsKey('DTEND')) { $master['DTEND'].DateTime } else { $dtStart }
        $duration = $dtEnd - $dtStart

        if ($master.ContainsKey('RRULE')) {
            $rule = ConvertFrom-RRule -RRuleValue $master['RRULE']
            $starts = Get-RecurrenceStartDates -Rule $rule -DtStart $dtStart -RangeStart $bufferedStart -RangeEnd $bufferedEnd -PacificZone $PacificZone
        }
        else {
            $starts = @($dtStart) | Where-Object { $_ -ge $bufferedStart -and $_ -lt $bufferedEnd }
        }

        foreach ($occStart in $starts) {
            if ($master.ContainsKey('EXDATE') -and $master['EXDATE'].Contains($occStart)) {
                continue
            }
            $override = $entry.Overrides[$occStart]
            if ($null -ne $override) {
                if ($override.ContainsKey('STATUS') -and $override['STATUS'] -eq 'CANCELLED') { continue }
                $effStart = if ($override.ContainsKey('DTSTART')) { $override['DTSTART'].DateTime } else { $occStart }
                $effEnd = if ($override.ContainsKey('DTEND')) { $override['DTEND'].DateTime } else { $effStart + $duration }
                $occurrences.Add([PSCustomObject]@{
                        UID         = $uid
                        Start       = $effStart
                        End         = $effEnd
                        Summary     = $override['SUMMARY']
                        Description = $override['DESCRIPTION']
                        Location    = $override['LOCATION']
                        IsAllDay    = $master['DTSTART'].IsAllDay
                    }) | Out-Null
            }
            else {
                if ($master.ContainsKey('STATUS') -and $master['STATUS'] -eq 'CANCELLED') { continue }
                $occurrences.Add([PSCustomObject]@{
                        UID         = $uid
                        Start       = $occStart
                        End         = $occStart + $duration
                        Summary     = $master['SUMMARY']
                        Description = $master['DESCRIPTION']
                        Location    = $master['LOCATION']
                        IsAllDay    = $master['DTSTART'].IsAllDay
                    }) | Out-Null
            }
        }
    }

    return $occurrences | Where-Object { $_.Start -ge $RangeStart -and $_.Start -lt $RangeEnd } | Sort-Object Start
}

function Get-RehearsalOccurrences {
    param(
        [string]$CalendarUrl,
        [datetime]$RangeStart,
        [datetime]$RangeEnd
    )

    $pacificZone = Get-PacificTimeZone
    $rawEvents = Get-IcsEvents -Url $CalendarUrl -PacificZone $pacificZone
    $occurrences = Expand-IcsEvents -RawEvents $rawEvents -RangeStart $RangeStart -RangeEnd $RangeEnd -PacificZone $pacificZone

    foreach ($occurrence in $occurrences) {
        Add-Member -InputObject $occurrence -NotePropertyName NameEntries -NotePropertyValue (Get-EventNameEntries -RawDescription $occurrence.Description)
        $plainBody = Get-EventPlainText $occurrence.Description
        Add-Member -InputObject $occurrence -NotePropertyName NormalizedTitle -NotePropertyValue (Get-NormalizedTitle $occurrence.Summary)
        Add-Member -InputObject $occurrence -NotePropertyName NormalizedFullText -NotePropertyValue (Get-NormalizedTitle "$($occurrence.Summary) $plainBody")
    }

    return $occurrences
}

function Get-EventPlainText {
    # Decodes an ICS DESCRIPTION's escape sequences and strips the simple
    # HTML Google Calendar embeds, yielding plain text. Shared by the body
    # parser (Get-EventNameEntries) and the FullText filter rule.
    param([string]$RawDescription)
    if ([string]::IsNullOrWhiteSpace($RawDescription)) { return '' }
    $text = ConvertFrom-IcsEscapedText $RawDescription
    $text = ConvertFrom-SimpleHtml $text
    return $text
}

function Get-NormalizedGroup {
    # Lowercase, then depluralize some common endings:
    #   "...ies"  -> "...y"  (e.g. "Understudies" -> "understudy")
    #   "...sses" -> "...ss" (e.g. "Princesses" -> "princess")
    #   "...s"    -> ""      (e.g. "Uncles" -> "uncle"), but not if the word
    #                          already ends in "ss" (e.g. "Princess" stays).
    param([string]$Text)
    $t = $Text.Trim().ToLowerInvariant()
    $t = $t -replace '\s+', ' '
    if ($t.EndsWith('ies')) {
        $t = $t.Substring(0, $t.Length - 3) + 'y'
    }
    elseif ($t.EndsWith('sses')) {
        $t = $t.Substring(0, $t.Length - 2)
    }
    elseif ($t.EndsWith('s') -and -not $t.EndsWith('ss')) {
        $t = $t.Substring(0, $t.Length - 1)
    }
    return $t
}

function Get-EventNameEntries {
    # Parses a (possibly HTML-ish, possibly ICS-escaped) event DESCRIPTION
    # into a flat list of NameEntry { Name; Group } records, one per name
    # found under a group heading. A heading is either a line ending in
    # 3+ underscores, or a "Label:" / "Label: inline value" line; a heading
    # can name multiple groups (e.g. "Mother and Father:"), and the names
    # under it (possibly spread across several lines) are associated with
    # every one of those groups.
    param([string]$RawDescription)

    $entries = New-Object System.Collections.Generic.List[object]
    if ([string]::IsNullOrWhiteSpace($RawDescription)) { return $entries }

    $text = Get-EventPlainText $RawDescription
    $lines = $text -split "`n"

    $currentGroups = @()

    function Add-NameLine {
        param([string]$LineText, [string[]]$Groups)
        if ($Groups.Count -eq 0) { return }
        # Split a line of names on comma / slash / ampersand / "and", then
        # drop a trailing " - annotation" or "(annotation)" qualifier (e.g.
        # "Artemis - Excused for Rats") so the remaining Name is exact-
        # matchable.
        $tokens = [regex]::Split($LineText, '\s*(?:,|/|&|\band\b)\s*') |
            ForEach-Object { $_.Trim() } |
            Where-Object { $_ -ne '' }
        foreach ($tok in $tokens) {
            $name = $tok -replace '\s*[-(].*$', ''
            $name = $name.Trim()
            if ($name -eq '') { continue }
            foreach ($g in $Groups) {
                $entries.Add([PSCustomObject]@{ Name = $name; Group = $g })
            }
        }
    }

    foreach ($rawLine in $lines) {
        $trimmed = $rawLine.Trim().TrimEnd("`r")
        if ($trimmed -eq '') {
            $currentGroups = @()
            continue
        }

        # Skip Google Meet invite boilerplate that Google Calendar appends to
        # descriptions; it isn't part of the cast list.
        if ($trimmed -match '(?i)^(Join with Google Meet|Or dial:|More phone numbers?:|Learn more about Meet at:)') {
            continue
        }

        $isHeader = $false
        $headerText = $null
        $inlineValue = ''

        if ($trimmed -match '^(.+?)_{3,}\s*$') {
            $headerText = $Matches[1].Trim()
            $isHeader = $true
        }
        elseif ($trimmed -match '^([^:]{1,60}):\s*(.*)$') {
            $headerText = $Matches[1].Trim()
            $inlineValue = $Matches[2].Trim()
            $isHeader = $true
        }

        if ($isHeader -and $headerText) {
            $groups = [regex]::Split($headerText, '\s*(?:,|/|&|\band\b)\s*') |
                Where-Object { $_.Trim() -ne '' } |
                ForEach-Object { Get-NormalizedGroup $_ }
            $currentGroups = @($groups)
            if ($inlineValue -ne '') {
                Add-NameLine -LineText $inlineValue -Groups $currentGroups
            }
        }
        else {
            Add-NameLine -LineText $trimmed -Groups $currentGroups
        }
    }

    return $entries
}

function Get-NormalizedTitle {
    # Replace punctuation with spaces, collapse whitespace, trim, lowercase.
    param([string]$Text)
    if ($null -eq $Text) { return '' }
    $t = $Text -replace '[^\p{L}\p{Nd}\s]', ' '
    $t = $t -replace '\s+', ' '
    return $t.Trim().ToLowerInvariant()
}

function Get-FilterRules {
    param([string]$Path)

    if (-not (Test-Path $Path)) {
        throw "Filter file not found: $Path"
    }

    $rules = New-Object System.Collections.Generic.List[object]
    $lineNum = 0
    foreach ($rawLine in (Get-Content -Path $Path)) {
        $lineNum++
        $line = $rawLine.Trim()
        if ($line -eq '' -or $line.StartsWith('#')) { continue }

        $colonIndex = $line.IndexOf(':')
        if ($colonIndex -lt 0) {
            Write-Warning "Filter line $lineNum`: missing ':' - skipping: $line"
            continue
        }

        $kind = $line.Substring(0, $colonIndex).Trim()
        $value = $line.Substring($colonIndex + 1).Trim()

        switch -Regex ($kind) {
            '^(?i)Title$' {
                $rules.Add([PSCustomObject]@{
                        Kind            = 'Title'
                        NormalizedTitle = Get-NormalizedTitle $value
                    })
            }
            '^(?i)Name$' {
                $rules.Add([PSCustomObject]@{
                        Kind = 'Name'
                        Name = $value.Trim()
                    })
            }
            '^(?i)FullText$' {
                $rules.Add([PSCustomObject]@{
                        Kind            = 'FullText'
                        NormalizedText  = Get-NormalizedTitle $value
                    })
            }
            '^(?i)Group\.Name$' {
                $dotIndex = $value.IndexOf('.')
                if ($dotIndex -lt 0) {
                    Write-Warning "Filter line $lineNum`: Group.Name value must be 'Group.Name' - skipping: $line"
                    continue
                }
                $groupPart = $value.Substring(0, $dotIndex).Trim()
                $namePart = $value.Substring($dotIndex + 1).Trim()
                $rules.Add([PSCustomObject]@{
                        Kind  = 'Group.Name'
                        Group = Get-NormalizedGroup $groupPart
                        Name  = $namePart
                    })
            }
            default {
                Write-Warning "Filter line $lineNum`: unrecognized rule kind '$kind' - skipping: $line"
            }
        }
    }

    return $rules
}

function Test-EventMatchesFilter {
    param(
        [string]$Summary,
        [string]$NormalizedFullText,
        [System.Collections.Generic.List[object]]$NameEntries,
        [System.Collections.Generic.List[object]]$Rules
    )

    $normalizedTitle = Get-NormalizedTitle $Summary

    foreach ($rule in $Rules) {
        switch ($rule.Kind) {
            'Title' {
                if ($rule.NormalizedTitle -ne '' -and $normalizedTitle.StartsWith($rule.NormalizedTitle)) {
                    return $true
                }
            }
            'Name' {
                foreach ($entry in $NameEntries) {
                    if ($entry.Name -ieq $rule.Name) { return $true }
                }
            }
            'FullText' {
                if ($rule.NormalizedText -ne '' -and $NormalizedFullText.Contains($rule.NormalizedText)) {
                    return $true
                }
            }
            'Group.Name' {
                foreach ($entry in $NameEntries) {
                    if ($entry.Group -eq $rule.Group -and $entry.Name -ieq $rule.Name) { return $true }
                }
            }
        }
    }
    return $false
}

function Format-EventWhen {
    param($Occurrence)
    $dateStr = $Occurrence.Start.ToString('dddd, MMM d')
    if ($Occurrence.IsAllDay) {
        return "$dateStr (all day)"
    }
    return "$dateStr, $($Occurrence.Start.ToString('h:mm tt')) - $($Occurrence.End.ToString('h:mm tt'))"
}

function Format-NameEntries {
    # Renders a flat NameEntry list as "Group: Name1, Name2" lines, grouped
    # and deduped, for -Detailed output.
    param([System.Collections.Generic.List[object]]$NameEntries)

    if ($NameEntries.Count -eq 0) { return @() }
    $lines = New-Object System.Collections.Generic.List[string]
    $byGroup = $NameEntries | Group-Object -Property Group | Sort-Object Name
    foreach ($g in $byGroup) {
        $names = $g.Group | ForEach-Object { $_.Name } | Select-Object -Unique
        $lines.Add("$($g.Name): $($names -join ', ')")
    }
    return $lines
}
Export-ModuleMember -Function @(
    'Get-PacificTimeZone',
    'Get-PacificToday',
    'Get-IcsEvents',
    'Expand-IcsEvents',
    'Get-RehearsalOccurrences',
    'Get-EventPlainText',
    'Get-EventNameEntries',
    'Get-NormalizedTitle',
    'Get-FilterRules',
    'Test-EventMatchesFilter',
    'Format-EventWhen',
    'Format-NameEntries'
)
