$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$wb = $excel.Workbooks.Open('C:\Users\lxtom\OneDrive\Documents\myscores.xlsx')
$ws = $wb.Sheets.Item(1)
$rows = $ws.UsedRange.Rows.Count
$cols = $ws.UsedRange.Columns.Count
Write-Host "Sheet: $($ws.Name) | Rows: $rows | Cols: $cols"
Write-Host "--- DATA ---"
for ($r = 1; $r -le [Math]::Min($rows, 80); $r++) {
    $row = ""
    for ($c = 1; $c -le $cols; $c++) {
        $val = $ws.Cells.Item($r, $c).Text
        $row += "|$val"
    }
    Write-Host $row
}
$wb.Close($false)
$excel.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
