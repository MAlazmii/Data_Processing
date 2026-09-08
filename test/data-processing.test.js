const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const DataProcessing = require('../Data_Processing');
function clean(csv) {
    const data = new DataProcessing();
    data.raw_user_data = csv;
    data.format_data();
    data.clean_data();
    return data;
}
test('normalizes title, compound names, birthday age and missing email', () => {
    const data = clean("Dr. jane ann O'NEILL,1 March 2000,twenty-four,invalid");
    assert.deepEqual(data.cleaned_user_data[0], {
        title: 'Dr', first_name: 'Jane', middle_name: 'Ann', surname: "O'Neill",
        date_of_birth: '01/03/2000', age: 23, email: 'jane.oneill@example.com'
    });
    assert.notEqual(data.percentage_altered(), '0.000');
});
test('handles quoted commas, escaped quotes, BOM and CRLF', () => {
    const data = clean('\ufeff"Mr Jane ""JJ"" Doe, Jr",29/02/2000,24,jane@example.com\r\n');
    assert.equal(data.cleaned_user_data[0].middle_name, '"Jj" Doe,');
    assert.equal(data.cleaned_user_data[0].surname, 'Jr');
});
test('rejects malformed records with row context', () => {
    assert.throws(() => clean('Jane,1/1/2000,24'), /Record 1.*4 fields/);
    assert.throws(() => clean('"Jane,1/1/2000,24,a@b.com'), /Unclosed quoted field/);
    assert.throws(() => clean('Ja"ne,1/1/2000,24,a@b.com'), /Unexpected quote/);
});
test('rejects invalid calendar dates and future births', () => {
    for (const dob of ['31/02/2000', '1/13/2000', 'bad', '1/1/2025'])
        assert.throws(() => clean(`Jane Doe,${dob},24,a@b.com`), /Record 1.*date|Record 1.*future/i);
});
test('keeps valid emails, fills missing names and deduplicates across records', () => {
    const data = clean(',1/1/2000,24,jane.doe@example.com\nJane Doe,1/1/2000,24,jane.doe@example.com');
    assert.equal(data.cleaned_user_data[0].first_name, 'Jane');
    assert.equal(data.cleaned_user_data[1].email, 'jane.doe1@example.com');
    data.clean_data();
    assert.equal(data.cleaned_user_data[1].email, 'jane.doe1@example.com');
});
test('empty input produces defined statistics', () => {
    const data = clean('');
    assert.equal(data.average_age(), null);
    assert.equal(data.most_common_month(), null);
    assert.deepEqual(data.most_common_surname(), []);
    assert.deepEqual(data.percentage_titles(), [0, 0, 0, 0, 0, 0]);
    assert.equal(data.percentage_altered(), '0.000');
});
test('load accepts CSV suffix and fails immediately for missing files', () => {
    const data = new DataProcessing();
    data.load_CSV(path.join(__dirname, '../examples/before.csv'));
    assert.ok(data.raw_user_data.includes('jane'));
    assert.throws(() => data.load_CSV('/nonexistent/records.csv'), /ENOENT/);
    assert.equal(data.raw_user_data, undefined);
});
test('CLI writes the expected cleaned CSV and reports errors', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'data-processing-'));
    try {
        const output = path.join(tmp, 'cleaned.csv');
        const run = spawnSync(process.execPath, [path.join(__dirname, '../Data_Processing.js'), path.join(__dirname, '../examples/before.csv'), output], { encoding: 'utf8' });
        assert.equal(run.status, 0, run.stderr);
        assert.equal(fs.readFileSync(output, 'utf8'), fs.readFileSync(path.join(__dirname, '../examples/after.csv'), 'utf8'));
        const bad = spawnSync(process.execPath, [path.join(__dirname, '../Data_Processing.js'), '/nonexistent.csv', output], { encoding: 'utf8' });
        assert.equal(bad.status, 1);
        assert.match(bad.stderr, /ENOENT/);
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('statistics summarize cleaned values and choose the largest month in a tie', () => {
    const data = clean('Dr Jane Smith,1/1/2000,24,jane@example.com\nMr John Smith,1/10/2000,23,john@example.com');
    assert.equal(data.average_age(), '23.5');
    assert.equal(data.most_common_month(), 10);
    assert.deepEqual(data.most_common_surname(), ['Smith']);
    assert.equal(data.youngest_dr().first_name, 'Jane');
    assert.deepEqual(data.percentage_titles(), [50, 0, 0, 0, 50, 0]);
});

test('export escapes quotes and commas', () => {
    const data = clean('"Mr Jane ""JJ"" Doe, Jr",29/02/2000,24,jane@example.com');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'data-processing-'));
    try {
        const output = path.join(tmp, 'cleaned.csv');
        data.save_CSV(output);
        assert.equal(fs.readFileSync(output, 'utf8'), 'title,first_name,middle_name,surname,date_of_birth,age,email\nMr,Jane,"""Jj"" Doe,",Jr,29/02/2000,24,jane@example.com\n');
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
