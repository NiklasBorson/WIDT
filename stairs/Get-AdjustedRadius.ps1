<#
.SYNOPSIS
Computes the castle radius from the fit of a circular-arc template.
.DESCRIPTION
ChordLength is the straight-line distance between the template's ends, in inches.
TemplateRadius is the template's cut radius, in inches, and defaults to 38.5.
Gap is measured perpendicular to that chord, in inches.
Use Center when both ends touch and the gap is at the middle.
Use Edge when the middle touches and equal gaps occur at both ends.
Returns INNER_RADIUS and INNER_ARC_LENGTH in inches for a 90-degree stairway.
.EXAMPLE
.\Get-AdjustedRadius.ps1 -ChordLength 30 -Gap 0.25 -Center
.EXAMPLE
.\Get-AdjustedRadius.ps1 -TemplateRadius 40 -ChordLength 30 -Gap 0.25 -Edge
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [double]$ChordLength,

    [Parameter(Mandatory)]
    [double]$Gap,

    [double]$TemplateRadius = 38.5,

    [Parameter(Mandatory, ParameterSetName = 'Center')]
    [switch]$Center,

    [Parameter(Mandatory, ParameterSetName = 'Edge')]
    [switch]$Edge
)

$ErrorActionPreference = 'Stop'
if (-not ($Center.IsPresent -xor $Edge.IsPresent)) {
    throw 'Specify exactly one of -Center or -Edge.'
}
if ([double]::IsNaN($TemplateRadius) -or [double]::IsInfinity($TemplateRadius) -or $TemplateRadius -le 0) {
    throw 'TemplateRadius must be a finite radius greater than 0 inches.'
}
if ([double]::IsNaN($ChordLength) -or [double]::IsInfinity($ChordLength) -or
    $ChordLength -le 0 -or $ChordLength / 2 -gt $TemplateRadius) {
    throw 'ChordLength must be finite, greater than 0, and no greater than twice TemplateRadius.'
}
if ([double]::IsNaN($Gap) -or [double]::IsInfinity($Gap) -or $Gap -lt 0) {
    throw 'Gap must be a finite, nonnegative measurement in inches.'
}

$halfChord = $ChordLength / 2
# Rationalizing and scaling avoids cancellation and squaring large measurements.
$ratio = $halfChord / $TemplateRadius
$templateSagitta = $halfChord * $ratio / (1 + [Math]::Sqrt((1 - $ratio) * (1 + $ratio)))
$sagitta = if ($Center) { $templateSagitta - $Gap } else { $templateSagitta + $Gap }
if ($sagitta -le 0 -or $sagitta -gt $halfChord) {
    throw 'The measurements must describe a minor circular arc with a sagitta greater than 0 and no greater than half the chord length.'
}

$radius = ($halfChord / 2) * ($halfChord / $sagitta) + $sagitta / 2
if ([double]::IsNaN($radius) -or [double]::IsInfinity($radius)) {
    throw 'The measurements do not produce a finite radius.'
}
$innerArcLength = $radius * ([Math]::PI / 2)
if ([double]::IsInfinity($innerArcLength)) {
    throw 'The measurements do not produce a finite inner arc length.'
}

[pscustomobject]@{
    INNER_RADIUS = $radius
    INNER_ARC_LENGTH = $innerArcLength
}
