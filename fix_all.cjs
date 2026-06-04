const fs = require('fs');

let ai = fs.readFileSync('src/ai.js', 'utf-8');
ai = ai.replace(/<button id="btn-close-ai-modal" style=/g, '<button id="btn-close-ai-modal" aria-label="Close AI Modal" style=');
fs.writeFileSync('src/ai.js', ai);

let comp = fs.readFileSync('src/competitions.js', 'utf-8');
comp = comp.replace(/class="btn btn-secondary stepper-minus" style=/g, 'class="btn btn-secondary stepper-minus" aria-label="Decrease" style=');
comp = comp.replace(/class="btn btn-secondary stepper-plus" style=/g, 'class="btn btn-secondary stepper-plus" aria-label="Increase" style=');
comp = comp.replace(/class="btn btn-danger btn-sm del-comp-round" data-id=/g, 'class="btn btn-danger btn-sm del-comp-round" aria-label="Delete Competition Round" data-id=');
comp = comp.replace(/class="btn-text del-rule" data-index=/g, 'class="btn-text del-rule" aria-label="Delete Rule" data-index=');
fs.writeFileSync('src/competitions.js', comp);

let prac = fs.readFileSync('src/practice.js', 'utf-8');
prac = prac.replace(/class="btn btn-danger btn-sm del-prac-round" data-id=/g, 'class="btn btn-danger btn-sm del-prac-round" aria-label="Delete Practice Round" data-id=');
fs.writeFileSync('src/practice.js', prac);

let ui = fs.readFileSync('src/ui.js', 'utf-8');
ui = ui.replace(/class="btn btn-danger btn-sm del-round-btn" data-id=/g, 'class="btn btn-danger btn-sm del-round-btn" aria-label="Delete Round" data-id=');
ui = ui.replace(
    /document\.querySelectorAll\('\.tab-btn'\)\.forEach\(btn => btn\.classList\.remove\('active'\)\);/g,
    `document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));\n\n    // Update body data-active-tab for State-Driven UI Compliance\n    document.body.setAttribute('data-active-tab', targetId);`
);
fs.writeFileSync('src/ui.js', ui);

let whs = fs.readFileSync('src/whs.js', 'utf-8');
whs = whs.replace(/class="btn btn-danger btn-sm del-round-btn" data-id=/g, 'class="btn btn-danger btn-sm del-round-btn" aria-label="Delete Round" data-id=');
fs.writeFileSync('src/whs.js', whs);

let oncourse = fs.readFileSync('src/oncourse.js', 'utf-8');
oncourse = oncourse.replace(/class="btn-grid-minus" style=/g, 'class="btn-grid-minus" aria-label="Decrease Score" style=');
oncourse = oncourse.replace(/class="btn-grid-plus" style=/g, 'class="btn-grid-plus" aria-label="Increase Score" style=');
oncourse = oncourse.replace(/class="putt-minus" style=/g, 'class="putt-minus" aria-label="Decrease Putts" style=');
oncourse = oncourse.replace(/class="putt-plus" style=/g, 'class="putt-plus" aria-label="Increase Putts" style=');
fs.writeFileSync('src/oncourse.js', oncourse);

let index = fs.readFileSync('index.html', 'utf-8');
index = index.replace(/class="editor-btn-minus"/g, 'class="editor-btn-minus" aria-label="Decrease"');
index = index.replace(/class="editor-btn-plus"/g, 'class="editor-btn-plus" aria-label="Increase"');
index = index.replace(/<button type="button" class="btn-text" id="btn-close-rules-card"\s+style="padding:0; color:#854d0e; font-weight:bold;">✕<\/button>/g, '<button type="button" class="btn-text" id="btn-close-rules-card" aria-label="Close Rules Card"\n                                style="padding:0; color:#854d0e; font-weight:bold;">✕</button>');
index = index.replace(/<button type="button" id="btn-wizard-cancel" class="btn-text"\s+style="color: #64748b; padding:0; font-weight:bold; font-size: 1.2rem;">✕<\/button>/g, '<button type="button" id="btn-wizard-cancel" class="btn-text" aria-label="Close Wizard"\n                                style="color: #64748b; padding:0; font-weight:bold; font-size: 1.2rem;">✕</button>');
index = index.replace(/<button id="btn-close-review" class="btn-text" style="font-size: 1.5rem;">✕<\/button>/g, '<button id="btn-close-review" class="btn-text" aria-label="Close Review" style="font-size: 1.5rem;">✕</button>');
fs.writeFileSync('index.html', index);

let css = fs.readFileSync('src/style.css', 'utf-8');
css += `
/* Scroll Guarding (PIR-2026-03-08-01) */
.table-responsive,
.history-table tbody,
#oc-leaderboard tbody,
#oc-detailed-tbody {
    overflow-anchor: none;
}

body[data-active-tab="tab-whs"] #tab-whs,
body[data-active-tab="tab-comp"] #tab-comp,
body[data-active-tab="tab-practice"] #tab-practice,
body[data-active-tab="tab-oncourse"] #tab-oncourse,
body[data-active-tab="tab-tempo"] #tab-tempo,
body[data-active-tab="tab-feed"] #tab-feed,
body[data-active-tab="tab-coach"] #tab-coach,
body[data-active-tab="tab-admin"] #tab-admin,
body[data-active-tab="tab-settings"] #tab-settings,
body[data-active-tab="oc-locker-room"] #oc-locker-room {
    display: block;
    opacity: 1;
    visibility: visible;
    z-index: 50;
}
`;
fs.writeFileSync('src/style.css', css);
