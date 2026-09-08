const fs = require('node:fs');
const path = require('node:path');

// Headerless CSV: name, date of birth, age, email. Quotes may contain commas/newlines.
function parseCSV(text) {
    const rows = [];
    let row = [], field = '', quoted = false, closed = false;
    text = text.replace(/^\uFEFF/, '');
    function endField() { row.push(field.trim()); field = ''; closed = false; }
    function endRow() {
        endField();
        if (row.some(value => value !== '')) rows.push(row);
        row = [];
    }
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (quoted) {
            if (ch === '"') {
                if (text[i + 1] === '"') { field += '"'; i++; }
                else { quoted = false; closed = true; }
            } else field += ch;
        } else if (ch === ',') endField();
        else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && text[i + 1] === '\n') i++;
            endRow();
        } else if (ch === '"') {
            if (closed || field.trim()) throw new Error(`Unexpected quote in record ${rows.length + 1}`);
            field = ''; quoted = true;
        } else if (closed) {
            if (!/\s/.test(ch)) throw new Error(`Unexpected text after quote in record ${rows.length + 1}`);
        } else field += ch;
    }
    if (quoted) throw new Error(`Unclosed quoted field in record ${rows.length + 1}`);
    if (field || row.length || closed) endRow();
    return rows;
}

class Data_Processing {
    constructor(referenceDate = new Date(2024, 1, 29)) {
        if (!(referenceDate instanceof Date) || Number.isNaN(referenceDate.getTime()))
            throw new Error('referenceDate must be a valid Date');
        this.referenceDate = new Date(referenceDate.getTime());
        this.cleaned_user_data = [];
        this.originalDataCount = 0;
        this.alteredDataCount = 0;
    }

    load_CSV(filename = path.join(__dirname, 'Raw_User_Data.csv')) {
        this.raw_user_data = undefined;
        this.formatted_user_data = undefined;
        this.cleaned_user_data = [];
        this.originalDataCount = 0;
        this.alteredDataCount = 0;
        if (!/\.csv$/i.test(filename)) filename += '.csv';
        this.raw_user_data = fs.readFileSync(filename, 'utf8');
    }

    format_data() {
        if (typeof this.raw_user_data !== 'string') throw new Error('Load a CSV before formatting');
        this.formatted_user_data = undefined;
        this.cleaned_user_data = [];
        this.alteredDataCount = 0;
        const rows = parseCSV(this.raw_user_data);
        this.originalDataCount = rows.length;
        this.formatted_user_data = rows.map((fields, index) => {
            if (fields.length !== 4) throw new Error(`Record ${index + 1}: expected 4 fields, received ${fields.length}`);
            const [name, dob, age, email] = fields;
            const match = name.match(/^(Mrs|Mr|Miss|Ms|Dr)\.?\s+/i);
            const title = match ? this.capitalize(match[1]) : '';
            const names = (match ? name.slice(match[0].length) : name).trim().split(/\s+/);
            const first_name = names.shift() || '';
            const surname = names.pop() || '';
            let date_of_birth;
            try { date_of_birth = this.formatDate(dob); }
            catch (error) { throw new Error(`Record ${index + 1}: ${error.message}`); }
            return { title, first_name, middle_name: names.join(' '), surname, date_of_birth, age, email };
        });
        this.originalRows = rows;
        return this.formatted_user_data;
    }

    clean_data() {
        if (!this.formatted_user_data) throw new Error('Format data before cleaning');
        const usedEmails = new Set();
        const today = this.referenceDate;
        const cleaned = this.formatted_user_data.map((user, index) => {
            let { title, first_name, middle_name, surname, date_of_birth, email } = user;
            if ((!first_name || !surname) && email.includes('@')) {
                const parts = email.split('@')[0].split('.');
                if (parts.length >= 2) {
                    first_name = first_name || parts[0];
                    surname = surname || parts.slice(1).join(' ');
                }
            }
            const capitalizeName = value => value.toLowerCase().replace(/(^|[\s'"-])([a-z])/g,
                (_, separator, letter) => separator + letter.toUpperCase());
            first_name = capitalizeName(first_name);
            middle_name = capitalizeName(middle_name);
            surname = capitalizeName(surname);
            const [day, month, year] = date_of_birth.split('/').map(Number);
            let age = today.getFullYear() - year;
            if (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day)) age--;
            if (age < 0) throw new Error(`Record ${index + 1}: date of birth is in the future`);
            email = this.validateAndStandardizeEmail(email, first_name, surname, usedEmails);
            return { title, first_name, middle_name, surname, date_of_birth, age, email };
        });
        this.cleaned_user_data = cleaned;
        // Compare the four source fields (name including title, DOB, age, email).
        this.alteredDataCount = cleaned.reduce((total, user, index) => {
            const result = [[user.title, user.first_name, user.middle_name, user.surname].filter(Boolean).join(' '),
                user.date_of_birth, String(user.age), user.email];
            return total + result.filter((value, field) => value !== this.originalRows[index][field]).length;
        }, 0);
        return cleaned;
    }

    validateAndStandardizeEmail(email, firstName, lastName, usedEmails = new Set()) {
        const valid = /^[a-zA-Z0-9._%+'-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        const safeName = value => value.toLowerCase().replace(/[^a-z0-9-]/g, '');
        const base = `${safeName(firstName) || 'unknown'}.${safeName(lastName) || 'user'}`;
        let finalEmail = valid.test(email) ? email : `${base}@example.com`;
        let counter = 1;
        while (usedEmails.has(finalEmail.toLowerCase())) finalEmail = `${base}${counter++}@example.com`;
        usedEmails.add(finalEmail.toLowerCase());
        return finalEmail;
    }

    formatDate(dateString) {
        const match = dateString.match(/^(\d{1,2})[\/\- ](\d{1,2}|[a-zA-Z]+)[\/\- ](\d{2}|\d{4})$/);
        if (!match) throw new Error(`Invalid date: ${dateString}`);
        const months = ['january', 'february', 'march', 'april', 'may', 'june',
            'july', 'august', 'september', 'october', 'november', 'december'];
        const day = Number(match[1]);
        const month = /^\d+$/.test(match[2]) ? Number(match[2]) : months.indexOf(match[2].toLowerCase()) + 1;
        let year = Number(match[3]);
        // Preserve the coursework convention: 00–24 -> 2000–2024; 25–99 -> 1925–1999.
        if (match[3].length === 2) year += year >= 25 ? 1900 : 2000;
        const date = new Date(0);
        date.setUTCFullYear(year, month - 1, day);
        if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day)
            throw new Error(`Invalid date: ${dateString}`);
        return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${String(year).padStart(4, '0')}`;
    }

    capitalize(word) {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }

    save_CSV(filename) {
        const fields = ['title', 'first_name', 'middle_name', 'surname', 'date_of_birth', 'age', 'email'];
        const escape = value => /[",\r\n]/.test(String(value)) ? `"${String(value).replace(/"/g, '""')}"` : String(value);
        const rows = [fields, ...this.cleaned_user_data.map(user => fields.map(field => user[field]))];
        fs.writeFileSync(filename, rows.map(row => row.map(escape).join(',')).join('\n') + '\n', 'utf8');
    }

    //find the most common surname(s) in the cleaned user data
    most_common_surname() {
        const surnameCounts = {}; // Object to hold surname counts

        // Iterate over each user in the cleaned data
        this.cleaned_user_data.forEach(user => {
            const surname = user.surname.toLowerCase(); // Convert surname to lowercase to ensure consistent counting
            // Increment the count for the surname or initialize it to 1 if it hasn't been encountered yet
            surnameCounts[surname] = (surnameCounts[surname] || 0) + 1;
        });
    
        // Find the highest count of any surname in the dataset
        const maxCount = Math.max(...Object.values(surnameCounts));
        // Find all surnames that have the highest count
        const mostCommonSurnames = Object.keys(surnameCounts).filter(surname => surnameCounts[surname] === maxCount);
    
         // Capitalize the most common surnames before returning them
        // This uses the capitalize method defined earlier to ensure the first letter of each surname is uppercase
        return mostCommonSurnames.map(surname => this.capitalize(surname));
    }
    
    
    // Method to calculate the average age of users in the cleaned data
    average_age() {
        // Sum all ages in the cleaned user data to get the total age
        if (!this.cleaned_user_data.length) return null;
        const totalAge = this.cleaned_user_data.reduce((sum, user) => sum + user.age, 0);
         // Calculate the average age
        const average = totalAge / this.cleaned_user_data.length;
        // Round the average to one decimal place
        const roundedAverage = Math.round(average * 10) / 10;
        return roundedAverage.toFixed(1);  // Return the rounded average as a string formatted to one decimal place
    }
    
    

    //find the youngest doctor in the cleaned user data
    youngest_dr() {
        // Filter the cleaned data for users with the title "Dr" or "Dr." to get an array of doctors
        const doctors = this.cleaned_user_data.filter(user => user.title === 'Dr' || user.title === 'Dr.');
        // If there are no doctors in the dataset
        if (doctors.length === 0) {
            // Return a message indicating there are no doctors if the doctors array is empty
            return "No doctors in the dataset";
        }
        // Find the youngest doctor
        const youngestDoctor = doctors.reduce((youngest, current) => {
            return youngest.age < current.age ? youngest : current;
        }, doctors[0]);
    
        // Return the full user object of the youngest doctor
        return {
            title: youngestDoctor.title,
            first_name: youngestDoctor.first_name,
            middle_name: youngestDoctor.middle_name || '', // Ensure middle_name is included, even if empty
            surname: youngestDoctor.surname,
            date_of_birth: youngestDoctor.date_of_birth,
            age: youngestDoctor.age,
            email: youngestDoctor.email
        };
    }
    
    
    //identify the most common birth month among users
    most_common_month() {
    if (!this.cleaned_user_data.length) return null;
    const monthCounts = {}; // Object to hold the count of occurrences for each month
    // Iterate over each user in the cleaned data
    this.cleaned_user_data.forEach(user => {
        const month = user.date_of_birth.split('/')[1]; // Extract the month from the date_of_birth field
        monthCounts[month] = (monthCounts[month] || 0) + 1;
    });

    // Determine the month with the highest occurrence
    const mostCommonMonth = Object.keys(monthCounts).sort((a, b) => Number(a) - Number(b)).reduce((a, b) => monthCounts[a] > monthCounts[b] ? a : b);
    return parseInt(mostCommonMonth, 10); // Parses the month string to an integer to remove leading zeros
}
 

    //calculate the percentage of titles among users
    percentage_titles() {
        // Define all titles including a blank one for those without any title
        const validTitles = ["Mr", "Mrs", "Miss", "Ms", "Dr", ""];
        let titleCounts = { "Mr": 0, "Mrs": 0, "Miss": 0, "Ms": 0, "Dr": 0, "": 0 };

        // Iterate over cleaned_user_data to count titles
        this.cleaned_user_data.forEach(user => {
            let title = user.title || ""; // Use an empty string for users without a title
            // Ensure the title is one of the expected values
            if (title in titleCounts) {
                titleCounts[title]++;
            }
        });
    
        const totalUsers = this.cleaned_user_data.length; // Total number of users
        // Calculate percentages for each title 
        let titlePercentages = validTitles.map(title => {
            let percentage = totalUsers ? (titleCounts[title] / totalUsers) * 100 : 0;
            // Round to the nearest integer
            return Math.round(percentage);// Round to the nearest integer
        });
    
        return titlePercentages;
    }
    
    

    // Method to calculate the percentage of data values that were altered during cleaning
     percentage_altered() {
        
        // Assume each user record is checked for alterations in 4 fields (name including title, DOB, age, email)
         const totalChecks = this.cleaned_user_data.length * 4;
          // Calculate the percentage of values altered based on the count of alterations
         const percentageAltered = totalChecks ? (this.alteredDataCount / totalChecks) * 100 : 0;
         return percentageAltered.toFixed(3); // Return the percentage formatted to three decimal places
        
    }

}

module.exports = Data_Processing;

if (require.main === module) {
    try {
        const args = process.argv.slice(2);
        if (args.length > 2 || args.includes('--help')) {
            console.log('Usage: node Data_Processing.js [input.csv] [output.csv]');
            process.exit(args.includes('--help') ? 0 : 1);
        }
        const data = new Data_Processing();
        data.load_CSV(args[0]);
        data.format_data();
        data.clean_data();
        if (args[1]) data.save_CSV(args[1]);
        else console.log(JSON.stringify(data.cleaned_user_data, null, 2));
    } catch (error) {
        console.error(`Data processing failed: ${error.message}`);
        process.exitCode = 1;
    }
}
