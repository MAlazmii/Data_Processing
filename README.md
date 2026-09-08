# User data cleaning in JavaScript

A Node.js coursework project that reads user records from CSV, separates names and titles, standardizes dates, recalculates ages, and reports summary statistics. The original assignment and supplied dataset remain in the repository.

## Run

Requires Node.js 18 or newer; no external packages are needed. Run commands from the repository root:

```sh
node Data_Processing.js Raw_User_Data.csv cleaned.csv
node Data_Processing.js examples/before.csv /tmp/cleaned-example.csv
node --test
```

With no arguments, the script reads the bundled dataset and prints cleaned JSON. With only an input path, it prints JSON for that input. The optional output file is overwritten. Importing the module does not read files or print data.

```js
const DataProcessing = require('./Data_Processing');
const data = new DataProcessing();
data.load_CSV('Raw_User_Data.csv');
data.format_data();
data.clean_data();
console.log(data.average_age(), data.most_common_surname());
```

## Input and cleaning rules

Input is **headerless**, with four fields: `full name,date of birth,age,email`. Quoted commas, escaped double quotes, quoted newlines, UTF-8 BOMs and CRLF are supported. Blank records are skipped. Invalid field counts, malformed CSV, impossible calendar dates and future birth dates cause a clear error and a nonzero CLI exit; the output is written only after cleaning succeeds.

- Recognizes Mr, Mrs, Miss, Ms and Dr, with optional periods; normalizes title and name capitalization.
- Accepts day/month/year, day-month-year and day month-name year dates. Two-digit years 00–24 mean 2000–2024; 25–99 mean 1925–1999.
- Calculates age **as of 29 February 2024**, preserving the coursework reference date. The supplied age, including written ages, is replaced by the value calculated from the birth date. Library callers may pass another local date, for example `new DataProcessing(new Date(2026, 0, 1))`.
- Where possible, fills missing first/surnames from a dotted email username. Invalid emails receive an `example.com` placeholder; repeated addresses receive a numeric suffix. These generated addresses are placeholders, not verified contact details. Valid addresses keep their spelling.
- Name splitting uses the first word as the first name and the last as the surname. It is a coursework heuristic, not a universal parser for personal names.

### Before and after

The synthetic example in [examples/before.csv](examples/before.csv):

```csv
Dr. jane ann O'NEILL,1 March 2000,twenty-four,invalid
```

becomes this row in [examples/after.csv](examples/after.csv):

```csv
title,first_name,middle_name,surname,date_of_birth,age,email
Dr,Jane,Ann,O'Neill,01/03/2000,23,jane.oneill@example.com
```

The output has a header and seven fields; it is a cleaned export, not the four-field raw input format.

## Statistics and tests

Methods include `most_common_surname()`, `average_age()`, `youngest_dr()`, `most_common_month()`, `percentage_titles()` and `percentage_altered()`. Alteration percentage compares the four trimmed input fields (full name including title, birth date, age, email) with their cleaned values. Empty data returns `null` for average age and common month, an empty surname list, and zero percentages. Common-month ties select the largest month number; title percentages use ordinary rounding and may not sum to 100.

Tests cover quoted CSV, missing files, malformed rows, dates, empty datasets, email deduplication and the command-line export against a hand-written expected file. CI runs these tests and processes the supplied dataset. No cloud service or credentials are required.
