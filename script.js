const CFG = {
    HR: { BRADY: 50, BRADY_SEVERE: 45, TACHY: 120, TACHY_SEVERE: 130 },
    CAPS: {
        BRADY_SEVERE: 40,
        BRADY: 65,
        TACHY_SEVERE: 40,
        TACHY: 60
    },
    LIMITS: {
        AGE: { MIN: 1, MAX: 115 },
        SBP: { MIN: 60, MAX: 250 },
        DBP: { MIN: 40, MAX: 150 },
        WEIGHT: { MIN: 10, MAX: 500 },
        HEIGHT: { MIN: 50, MAX: 280 },
        HR: { MIN: 30, MAX: 200 }
    }
};

const elements = {
    pName: document.getElementById('p-name'),
    pAge: document.getElementById('p-age'),
    pWeight: document.getElementById('p-weight'),
    pHeight: document.getElementById('p-height'),
    pPulse: document.getElementById('p-pulse'),
    pSys: document.getElementById('p-sys'),
    pDia: document.getElementById('p-dia'),
    errBox: document.getElementById('error-box'),
    resSys: document.getElementById('res-sys'),
    resDia: document.getElementById('res-dia'),
    resPulse: document.getElementById('res-pulse'),
    resBmi: document.getElementById('res-bmi'),
    indexNum: document.getElementById('index-num'),
    recContent: document.getElementById('rec-content'),
    statusLabel: document.getElementById('status-label'),
    reportHeader: document.getElementById('report-header'),
    displayName: document.getElementById('display-name'),
    displayAge: document.getElementById('display-age'),
    reportDate: document.getElementById('report-date'),
    bars: document.querySelectorAll('.bar'),
    printBtn: document.getElementById('print-btn'),
    exportHistoryBtn: document.getElementById('export-history-btn'),
    exportCurrentBtn: document.getElementById('export-current-btn'),
    clearBtn: document.getElementById('clear-btn'),
    // history table removed from UI; kept export functions using localStorage
};


if (elements.errBox) {
    elements.errBox.style.display = "none";
}

function showError(msg) {
    if (!elements.errBox) return;
    elements.errBox.innerText = "⚠️ " + msg;
    elements.errBox.style.display = "block";
    elements.errBox.scrollIntoView({ behavior: "smooth" });
}

function hideError() {
    if (!elements.errBox) return;
    elements.errBox.innerText = "";
    elements.errBox.style.display = "none";
}

(function initPulse() {
    if (!elements.pPulse) return;
    elements.pPulse.innerHTML = `<option value="">Select BPM</option>`;
    for (let bpm = 40; bpm <= 180; bpm++) {
        elements.pPulse.innerHTML += `<option value="${bpm}">${bpm} BPM</option>`;
    }
})();

// Initialize buttons and history
(function initUI() {
    if (elements.printBtn) {
        elements.printBtn.disabled = true;
        elements.printBtn.style.opacity = "0.5";
        elements.printBtn.style.cursor = "not-allowed";
    }

    // Wire clear button
    if (elements.clearBtn) elements.clearBtn.addEventListener('click', clearForm);

    if (elements.exportHistoryBtn) elements.exportHistoryBtn.addEventListener('click', exportHistoryToCSV);

    // Monitor inputs to toggle print availability
    const inputs = [elements.pName, elements.pAge, elements.pSys, elements.pDia, elements.pHeight, elements.pWeight, elements.pPulse];
    inputs.forEach(i => { if (i) i.addEventListener('input', checkRequiredFields); if (i) i.addEventListener('change', checkRequiredFields); });

    // no history table to render in UI
})();


function getPediatricHrZones(age) {
    // 1–5 yrs: higher normals, 6–12: mid, 13–17: near-adult
    if (age <= 5)  return { bradySevere: 60, brady: 70, tachy: 130, tachySevere: 160 };
    if (age <= 12) return { bradySevere: 55, brady: 65, tachy: 120, tachySevere: 150 };
    // Teens
    return { bradySevere: 50, brady: 60, tachy: 110, tachySevere: 140 };
}

function computePenalty(d, bmi, pp, map) {
    let penalty = 0;

    // --- Adult baseline penalties (kept) ---
    // BMI
    if (bmi >= 35)       penalty += 25;
    else if (bmi >= 30)  penalty += 15;
    else if (bmi >= 25)  penalty += 5;
    else if (bmi < 18.5) penalty += 10;

    // PP
    if (pp > 75)        penalty += (pp - 75) * 1.2;
    else if (pp > 60)   penalty += (pp - 60) * 0.7;
    else if (pp < 30)   penalty += (30 - pp) * 2.5;

    // MAP
    if (map > 110)      penalty += (map - 110);
    else if (map < 70)  penalty += (70 - map) * 2.5;

    // HR (adult defaults)
    let adultHrPenalty = 0;
    if (d.hr <= CFG.HR.BRADY_SEVERE) adultHrPenalty += 55;
    else if (d.hr < CFG.HR.BRADY)    adultHrPenalty += 25;
    if (d.hr >= CFG.HR.TACHY_SEVERE) adultHrPenalty += 55;
    else if (d.hr > CFG.HR.TACHY)    adultHrPenalty += 25;
    penalty += adultHrPenalty;

    // Age contribution (adult)
    if (d.age >= 80)       penalty += 12;
    else if (d.age >= 65)  penalty += 7;

    // --- Pediatric adjustments (add/remove penalties) ---
    if (d.age < 18) {
        // 1) Replace adult HR penalties with pediatric thresholds
        penalty -= adultHrPenalty; // remove adult HR effect

        const z = getPediatricHrZones(d.age);
        if (d.hr <= z.bradySevere)      penalty += 50;
        else if (d.hr < z.brady)        penalty += 20; 
        if (d.hr >= z.tachySevere)      penalty += 40; 
        else if (d.hr > z.tachy)        penalty += 15; 

        // 2) BMI: kids use percentiles—soften adult BMI penalties
        if (bmi >= 30 && bmi < 35) penalty -= 10; // 15 -> 5
        if (bmi >= 25 && bmi < 30) penalty -= 5;  // remove adult overweight penalty
        if (bmi < 18.5)            penalty -= 5;  // reduce underweight penalty

        // 3) PP: narrower/variable norms—soften extremes
        if (pp < 30) penalty -= (30 - pp) * 1.5; // reduce low-PP hit
        if (pp > 60) penalty -= (pp - 60) * 0.4; // reduce high-PP hit

        // 4) MAP: shift thresholds and re-apply with softer weights
        if (map < 70)  penalty -= (70 - map) * 2.5;  // remove adult low-MAP effect
        if (map > 110) penalty -= (map - 110);       // remove adult high-MAP effect

        const lowMap = 65;     // pediatric lower concern
        const highMap = 105;   // pediatric upper concern
        if (map < lowMap)       penalty += (lowMap - map) * 1.8;
        else if (map > highMap) penalty += (map - highMap) * 0.6;
    }

    return penalty;
}

document.getElementById("analyze-btn").addEventListener("click", () => {
    const confirmed = confirm("Do you want to analyze the vitals? check once again");
    if (confirmed) {
        processHealthData();
    } else {
        // Optional: show a message or just do nothing
        console.log("Analysis cancelled by user.");
    }
});

function processHealthData() {
    hideError(); // reset any old errors

    try {
        /* 1. RAW INPUT VALUES */
        const rawName   = (elements.pName?.value ?? "").trim();
        const rawAge    = (elements.pAge?.value ?? "").trim();
        const rawSys    = (elements.pSys?.value ?? "").trim();
        const rawDia    = (elements.pDia?.value ?? "").trim();
        const rawHeight = (elements.pHeight?.value ?? "").trim();
        const rawWeight = (elements.pWeight?.value ?? "").trim();
        const rawPulse  = (elements.pPulse?.value ?? "").trim();

        /* 1A. REQUIRED-FIELDS VALIDATION */
        const missing = [];
        if (!rawName)   missing.push("Name");
        if (!rawAge)    missing.push("Age");
        if (!rawSys)    missing.push("Systolic BP");
        if (!rawDia)    missing.push("Diastolic BP");
        if (!rawHeight) missing.push("Height");
        if (!rawWeight) missing.push("Weight");
        if (!rawPulse)  missing.push("Pulse");

        if (missing.length > 0) {
            if (missing.length === 7) {
                throw "cannot be empty fields";
            } else {
                throw `Please fill in: ${missing.join(", ")}.`;
            }
        }

        /* 2. NAME VALIDATION */
        const nameRegex = /^[A-Za-z\s.]+$/;
        if (!nameRegex.test(rawName)) {
            throw "Name must contain only A–Z, spaces, or dot. No numbers or special characters.";
        }

        /* 3. STRICT NUMERIC VALIDATION */
        const digitOnly = /^\d+$/;
        if (!digitOnly.test(rawAge))    throw "Age must contain digits only.";
        if (!digitOnly.test(rawSys))    throw "Systolic BP must contain digits only.";
        if (!digitOnly.test(rawDia))    throw "Diastolic BP must contain digits only.";
        if (!digitOnly.test(rawHeight)) throw "Height must contain digits only.";
        if (!digitOnly.test(rawWeight)) throw "Weight must contain digits only.";
        if (!digitOnly.test(rawPulse))  throw "Pulse must contain digits only.";

        /* 4. PARSE TO NUMBERS */
        const data = {
            name: rawName,
            age: Number(rawAge),
            sbp: Number(rawSys),
            dbp: Number(rawDia),
            height: Number(rawHeight),
            weight: Number(rawWeight),
            hr: Number(rawPulse)
        };

        /* 5. NEGATIVE CHECK */
        for (const [key, val] of Object.entries(data)) {
            if (typeof val === "number" && val < 0) throw `${key} cannot be negative.`;
        }

        /* 6. PHYSIOLOGIC LIMITS */
        if (data.age    < CFG.LIMITS.AGE.MIN    || data.age    > CFG.LIMITS.AGE.MAX)    throw "Age out of valid range.";
        if (data.height < CFG.LIMITS.HEIGHT.MIN || data.height > CFG.LIMITS.HEIGHT.MAX) throw "Height out of valid human range.";
        if (data.weight < CFG.LIMITS.WEIGHT.MIN || data.weight > CFG.LIMITS.WEIGHT.MAX) throw "Weight out of valid human range.";
        if (data.hr     < CFG.LIMITS.HR.MIN     || data.hr     > CFG.LIMITS.HR.MAX)     throw "Pulse outside physiologic range.";
        if (data.sbp    < CFG.LIMITS.SBP.MIN    || data.sbp    > CFG.LIMITS.SBP.MAX)    throw "Systolic pressure outside measurable range.";
        if (data.dbp    < CFG.LIMITS.DBP.MIN    || data.dbp    > CFG.LIMITS.DBP.MAX)    throw "Diastolic pressure outside measurable range.";
        if (data.sbp <= data.dbp) throw "Systolic must be greater than Diastolic.";

        /* 7. CORE METRICS */
        const pp  = data.sbp - data.dbp;
        if (pp < 10)  throw "Pulse pressure <10 mmHg is non‑viable.";
        if (pp < 15)  throw "Pulse pressure extremely low — recheck reading.";

        const bmi = data.weight / ((data.height / 100) ** 2);
        if (!isFinite(bmi) || bmi < 5 || bmi > 90) throw "Invalid BMI — check height/weight.";

        const map = data.dbp + pp / 3;

        /* 8. SCORING ENGINE (updated call) */
        let penalty = computePenalty(data, bmi, pp, map);
        let score   = Math.max(5, Math.round(100 - penalty));

        const profile = determineProfile(data, score, bmi, pp, map);
        score = profile.cappedScore;

        updateUI(data, score, bmi, profile);

        // Save to history
        const entry = {
            name: data.name,
            age: data.age,
            sbp: data.sbp,
            dbp: data.dbp,
            hr: data.hr,
            bmi: bmi.toFixed(1),
            map: map.toFixed(1),
            score: score,
            when: new Date().toLocaleString()
        };
        saveToHistory(entry);
        checkRequiredFields();

    } catch (err) {
        showError(err);
    }
}
function determineProfile(d, score, bmi, pp, map) {
    let risks = [];
    let tips = [];
    let cappedScore = score;

    if (d.hr <= CFG.HR.BRADY_SEVERE) {
        risks.push("Severe Bradycardia – risk of conduction block/syncope");
        tips.push("Immediate clinical evaluation recommended");
        cappedScore = Math.min(cappedScore, CFG.CAPS.BRADY_SEVERE);
    }

    if (d.hr >= CFG.HR.TACHY_SEVERE) {
        risks.push("Severe Tachycardia – possible arrhythmia/hemodynamic risk");
        tips.push("Urgent cardiology review recommended");
        cappedScore = Math.min(cappedScore, CFG.CAPS.TACHY_SEVERE);
    }

    if (map < 70) {
        risks.push("Hypotensive State – reduced organ perfusion");
        tips.push("Increase fluids; monitor causes");
        cappedScore = Math.min(cappedScore, 50);
    }

    if (bmi >= 35) {
        risks.push("Severe Obesity – high cardiometabolic burden");
        tips.push("Weight management recommended");
    }

    if (pp > 60 && d.sbp > 145) {
        risks.push("Isolated Systolic Hypertension – possible arterial stiffness");
        tips.push("Lifestyle change and BP monitoring advised");
        cappedScore = Math.min(cappedScore, 60);
    }

    // Decide title
    let title;
    if (risks.length === 0) {
        title = "Stable";
    } else if (risks.length === 1) {
        // Use the first risk as title
        title = risks[0].split("–")[0].trim();
    } else {
        title = "Combined Concerns";
    }

    return {
        title,
        risks: risks.length ? risks.map(r => `• ${r}`).join("<br>") : "No major cardiometabolic concerns.",
        tips: tips.length ? tips.map(t => `• ${t}`).join("<br>") : "Maintain balanced diet and regular exercise.",
        cappedScore
    };
}

function animateScore(finalScore,onComplete) {
    if (!elements.indexNum) return;
    let current = 0;
    const step = Math.ceil(finalScore / 40); // speed factor
    const interval = setInterval(() => {
        current += step;
        if (current >= finalScore) {
            current = finalScore;
            clearInterval(interval);
            if (onComplete) onComplete();
        }
        elements.indexNum.innerText = current;
    }, 40); // update every 40ms
}



function updateUI(d, score, bmi, profile) {

    if (elements.resSys)   elements.resSys.innerText = d.sbp;
    if (elements.resDia)   elements.resDia.innerText = d.dbp;
    if (elements.resPulse) elements.resPulse.innerText = d.hr;
    if (elements.resBmi)   elements.resBmi.innerText = bmi.toFixed(1);
    if (elements.indexNum) elements.indexNum.innerText = score;

    // Report header
    if (elements.reportHeader) elements.reportHeader.style.display = "block";
    if (elements.displayName)  elements.displayName.innerText = `Health Report: ${d.name}`;
    if (elements.displayAge)   elements.displayAge.innerText = `Age: ${d.age}`;
    if (elements.reportDate)   elements.reportDate.innerText = `Generated: ${new Date().toLocaleString()}`;

    // Recommendation box
    if (elements.recContent) {
        elements.recContent.innerHTML = `
            <div style="font-weight:600; font-size:1.1rem; margin-bottom:5px;">${profile.title}</div>
            <strong>Clinical Risks:</strong> ${profile.risks}<br><br>
            <strong>Recommended Actions:</strong> ${profile.tips}
        `;
    }

animateScore(score, () => { updateVisuals(score, d.hr, d.age); });

}

function checkRequiredFields() {
    const fields = [elements.pName, elements.pAge, elements.pSys, elements.pDia, elements.pHeight, elements.pWeight, elements.pPulse];
    const allFilled = fields.every(f => f && String(f.value).trim() !== "");
    if (elements.printBtn) {
        elements.printBtn.disabled = !allFilled;
        elements.printBtn.style.opacity = allFilled ? "1" : "0.5";
        elements.printBtn.style.cursor = allFilled ? "pointer" : "not-allowed";
    }
    if (elements.exportCurrentBtn) {
        elements.exportCurrentBtn.disabled = !allFilled;
        elements.exportCurrentBtn.style.opacity = allFilled ? "1" : "0.5";
        elements.exportCurrentBtn.style.cursor = allFilled ? "pointer" : "not-allowed";
    }
}

function enablePrintButton() {
    elements.printBtn.disabled = false;
    elements.printBtn.style.opacity = "1";
    elements.printBtn.style.cursor = "pointer";
}

function updateVisuals(score, hr, age) {
    if (elements.bars && elements.bars.forEach) {
        elements.bars.forEach(b => b.style.background = "#e5e7eb");
    }

    let color = "#dc3545"; // default red

    if (score >= 90) {
        color = "#10b981";
        elements.bars.forEach(b => b.style.background = color);
    }
    else if (score >= 75) {
        color = "#facc15";
        if (elements.bars[0]) elements.bars[0].style.background = color;
        if (elements.bars[1]) elements.bars[1].style.background = color;
        if (elements.bars[2]) elements.bars[2].style.background = color;
    }
    else if (score >= 50) {
        color = "#fb923c";
        if (elements.bars[0]) elements.bars[0].style.background = color;
        if (elements.bars[1]) elements.bars[1].style.background = color;
    }
    else {
        if (elements.bars[0]) elements.bars[0].style.background = color;
    }

    if (elements.indexNum) elements.indexNum.style.color = color;

    // Pediatric-aware "urgent" HR limits
    let bradyCut = CFG.HR.BRADY;
    let tachyCut = CFG.HR.TACHY;

    if (age < 18) {
        const z = getPediatricHrZones(age);
        bradyCut = z.brady;
        tachyCut = z.tachy;
    }

    const urgent = (hr < bradyCut) || (hr > tachyCut) || (score < 70);

    if (elements.statusLabel) {
        elements.statusLabel.innerText = urgent ? "URGENT REVIEW" : "STABLE";
        elements.statusLabel.style.color = color;
    }
}

function exportToCSV() {
    const headers = ["Name", "Age", "Systolic BP", "Diastolic BP", "Pulse", "BMI", "MAP", "Score"];
    const rows = [];
    const name = elements.displayName?.innerText.replace("Health Report: ", "") || "Unknown";
    const age = elements.displayAge?.innerText.replace("Age: ", "") || "Unknown";
    const sbp = elements.resSys?.innerText || "Unknown";
    const dbp = elements.resDia?.innerText || "Unknown";
    const pulse = elements.resPulse?.innerText || "Unknown";
    const bmi = elements.resBmi?.innerText || "Unknown";
    const map = dbp !== "Unknown" && sbp !== "Unknown" ? (Number(dbp) + (Number(sbp) - Number(dbp)) / 3).toFixed(1) : "Unknown";
    const score = elements.indexNum?.innerText || "Unknown";
    rows.push([name, age, sbp, dbp, pulse, bmi, map, score]);
    let csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n" + rows.map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    link.setAttribute("download", `health_report_${timestamp}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Save processed record to history (localStorage)
function saveToHistory(entry) {
    try {
        const key = 'patientHistory';
        const raw = localStorage.getItem(key);
        const arr = raw ? JSON.parse(raw) : [];
        arr.unshift(entry); // newest first
        localStorage.setItem(key, JSON.stringify(arr));
    } catch (e) {
        console.error('Failed to save history', e);
    }
}

function loadHistory() {
    try {
        const raw = localStorage.getItem('patientHistory');
        return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
}

function renderHistoryTable() {
    // history table removed from UI; nothing to render
}

function exportHistoryToCSV() {
    const rows = loadHistory();
    if (!rows || rows.length === 0) { alert('No history to export'); return; }
    const headers = ['Name','Age','Systolic BP','Diastolic BP','Pulse','BMI','MAP','Score','Generated At'];
    const csvRows = [headers.join(',')];
    rows.forEach(r => {
        const cols = [r.name, r.age, r.sbp, r.dbp, r.hr, r.bmi, r.map, r.score, r.when];
        csvRows.push(cols.map(c => '"'+String(c).replace(/"/g,'""')+'"').join(','));
    });
    const csvContent = 'data:text/csv;charset=utf-8,' + csvRows.join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `patient_history_${new Date().toISOString().replace(/[:.]/g,'-')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function clearForm() {
    if (elements.pName) elements.pName.value = '';
    if (elements.pAge) elements.pAge.value = '';
    if (elements.pSys) elements.pSys.value = '';
    if (elements.pDia) elements.pDia.value = '';
    if (elements.pHeight) elements.pHeight.value = '';
    if (elements.pWeight) elements.pWeight.value = '';
    if (elements.pPulse) elements.pPulse.value = '';
    hideError();
    // reset report UI
    if (elements.resSys) elements.resSys.innerText = '--';
    if (elements.resDia) elements.resDia.innerText = '--';
    if (elements.resPulse) elements.resPulse.innerText = '--';
    if (elements.resBmi) elements.resBmi.innerText = '--';
    if (elements.indexNum) elements.indexNum.innerText = '--';
    if (elements.displayName) elements.displayName.innerText = 'Health Report: --';
    if (elements.displayAge) elements.displayAge.innerText = 'Age: --';
    if (elements.reportDate) elements.reportDate.innerText = '';
    if (elements.recContent) elements.recContent.innerText = 'Enter data to generate a summary.';
    if (elements.reportHeader) elements.reportHeader.style.display = 'none';
    // Reset visual elements (bars, index color, status label)
    if (elements.bars && elements.bars.forEach) {
        elements.bars.forEach(b => b.style.background = '#f1f5f9');
    }
    if (elements.indexNum) elements.indexNum.style.color = '';
    if (elements.statusLabel) {
        elements.statusLabel.innerText = 'READY FOR EVALUATION';
        elements.statusLabel.style.color = '';
    }
    checkRequiredFields();
}


