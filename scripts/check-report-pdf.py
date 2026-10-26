from pathlib import Path
from pypdf import PdfReader

root = Path('.local/report-evidence')
standard = PdfReader(root / 'standard.pdf')
text = '\n'.join(page.extract_text() for page in standard.pages)
assert len(standard.pages) == 1, 'Unexpected blank or overflow pages'
assert '<script>literaltext</script>' in ''.join(text.split())
for value in ['Prüfstand München Δ', 'Kühlwasser °C', 'Pressure μbar', 'Кириллица', '0.00', 'N/A', 'TRUNCATED', 'continuity unverified', 'provisional', '43.3%', 'Good: 13, Rejected: 2']:
    assert value in text, f'Missing PDF content: {value}'

long = PdfReader(root / 'long-table.pdf')
assert len(long.pages) > 3
text = '\n'.join(page.extract_text() for page in long.pages)
for index in range(1, 201):
    if index != 101:
        assert f'ROW_{index:03}' in text, f'Alarm row {index} was lost'
for value in ['LONG_MESSAGE_START', 'LONG_MESSAGE_END', 'Display limit reached']:
    assert value in text, f'Long text was clipped: {value}'
for index, page in enumerate(long.pages):
    contents = page.extract_text()
    assert f'Page {index + 1} of {len(long.pages)}' in contents
    assert all(heading in contents for heading in ['No.', 'Rule', 'Message', 'Value']), 'Missing repeated table headers'
print(f'PASS: PDF text, Unicode, zeros, unknown data, all 200 rows, long-cell continuation and {len(long.pages)} page footers')
