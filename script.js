console.log("script.js loaded");
console.log(parseStyledText("This is [day]sunlight[/day]."));

const storyElement = document.getElementById('story');
const choicesElement = document.getElementById('choices');
const inventoryElement = document.getElementById('inventory');
const inventoryList = document.getElementById('inventory-list');
const menuElement = document.getElementById('menu');
const popup = document.getElementById('confirm-popup');
const messageElement = document.getElementById('message');
const statsElement = document.getElementById('stats');
const statPhysical = document.getElementById('stat-physical');
const statSocial = document.getElementById('stat-social');
const statArcane = document.getElementById('stat-arcane');

let inventory = JSON.parse(localStorage.getItem("inventory")) || [];
let flags = JSON.parse(localStorage.getItem("flags")) || {};
let scenes = {};
let currentSceneId = localStorage.getItem("currentScene") || "intro";
let stats = JSON.parse(localStorage.getItem("stats")) || {
  physical: 1,
  social: 1,
  arcane: 1
};

// itemDescriptions filled from items CSV
let itemDescriptions = {};

// List of items that reveal stats when owned (adjust names to your items!)
const statRevealItems = ["loadsocial", "loadarcane", "loadphysical"];

function logDebug(message) {
  console.log(message);
  const debugBox = document.getElementById('debug');
  if (debugBox) {
    const entry = document.createElement('div');
    entry.textContent = message;
    debugBox.appendChild(entry);
  }
}

function parseStyledText(rawText) {
  // Apply [day] and [night] as side effects (change body class)
  rawText = rawText.replace(/\[day\](.*?)\[\/day\]/gis, (_, content) => {
    applyGlobalEffect('day');
    return '';
  }).replace(/\[night\](.*?)\[\/night\]/gis, (_, content) => {
    applyGlobalEffect('night');
    return '';
  });

  return rawText
    .replace(/\[glow\](.*?)\[\/glow\]/gis, (_, content) => `<span class="glow">${content || '&nbsp;'}</span>`)
    .replace(/\[void\](.*?)\[\/void\]/gis, (_, content) => `<span class="void">${content || '&nbsp;'}</span>`)
    .replace(/\[corrode\](.*?)\[\/corrode\]/gis, (_, content) => `<span class="corrode">${content || '&nbsp;'}</span>`);
}


// Update stats display: show ? if player lacks reveal items for that stat
function updateStatsDisplay() {
  // Check if player has any stat reveal items
  const hasReveal = inventory.some(item => statRevealItems.includes(item.toLowerCase()));

  // For each stat, show actual number only if player has reveal; else '?'
  statPhysical.textContent = hasReveal ? stats.physical : '?';
  statSocial.textContent = hasReveal ? stats.social : '?';
  statArcane.textContent = hasReveal ? stats.arcane : '?';
}

function updateInventoryDisplay() {
  inventoryList.innerHTML = '';
  inventory.forEach((item, index) => {
    const li = document.createElement('li');
    li.title = itemDescriptions[item.toLowerCase()] || '';
    li.innerHTML = `${item} <span class="drop-button" onclick="dropItem(${index})">x</span>`;
    inventoryList.appendChild(li);
  });

  // Update stats display in case inventory changed (reveals may appear/disappear)
  updateStatsDisplay();
}

function addToInventory(item) {
  if (inventory.length < 5 && !inventory.includes(item)) {
    inventory.push(item);
    updateInventoryDisplay();
  }
}

function dropItem(index) {
  inventory.splice(index, 1);
  updateInventoryDisplay();
}

function hasItem(item) {
  return inventory.includes(item);
}

function applyGlobalEffect(tag) {
  if (tag === 'day') document.body.classList.add('day-mode');
  else if (tag === 'night') document.body.classList.remove('day-mode');
}

function typeLine(rawText, callback) {
  const container = document.createElement('p');
  storyElement.appendChild(container);

  const htmlText = parseStyledText(rawText);
  let i = 0;

  function typeNext() {
    if (i < htmlText.length) {
      // Append one character at a time
      container.innerHTML = htmlText.substring(0, i + 1);
      i++;
      setTimeout(typeNext, 30);
    } else {
      callback();
    }
  }

  typeNext();
}

function showScene(id, clear = false) {
  const scene = scenes[id];
  if (!scene) {
    console.error(`Scene with id "${id}" not found.`);
    storyElement.innerHTML = `<p>Scene "${id}" not found.</p>`;
    return;
  }

  messageElement.textContent = '';

  currentSceneId = id;
  localStorage.setItem("currentScene", id);
  if (clear) storyElement.innerHTML = '';
  choicesElement.innerHTML = '';

  const lines = scene.text.split(/\n+/);
  let current = 0;

  function nextLine() {
    if (current < lines.length) {
      typeLine(lines[current].trim(), () => {
        storyElement.appendChild(document.createElement('br'));
        current++;
        nextLine();
      });
    } else {
      scene.choices.forEach(choice => {
        if (choice.requires && !hasItem(choice.requires)) return;
        if (choice.flagRequired && !flags[choice.flagRequired]) return;

        if (choice["requires physical"] && stats.physical < Number(choice["requires physical"])) return;
        if (choice["requires social"] && stats.social < Number(choice["requires social"])) return;
        if (choice["requires arcane"] && stats.arcane < Number(choice["requires arcane"])) return;

        const btn = document.createElement('button');
        btn.textContent = choice.text;

        if (choice.hover && (!choice.hoverRequires || hasItem(choice.hoverRequires))) {
          btn.title = choice.hover;
        }

        btn.onclick = () => {
          if (choice.item && inventory.length >= 5 && !hasItem(choice.item)) {
            messageElement.textContent = "Your inventory is full! Drop an item before picking up another.";
            return;
          }
          messageElement.textContent = '';

          if (choice.item) addToInventory(choice.item);
          if (choice.setFlag) flags[choice.setFlag] = true;

          if (choice["modify physical"]) {
            stats.physical += Number(choice["modify physical"]);
          }
          if (choice["modify social"]) {
            stats.social += Number(choice["modify social"]);
          }
          if (choice["modify arcane"]) {
            stats.arcane += Number(choice["modify arcane"]);
          }

          localStorage.setItem("stats", JSON.stringify(stats));

          updateStatsDisplay();

          showScene(choice.next);
        };

        choicesElement.appendChild(btn);
      });
    }
  }

  nextLine();
  updateInventoryDisplay();
  updateStatsDisplay();
}

function loadScenesFromCSV(csv) {
  const results = Papa.parse(csv, { header: true, skipEmptyLines: true });
  if (results.errors.length) {
    console.error("PapaParse errors:", results.errors);
    storyElement.innerHTML = "<p>Error parsing CSV data.</p>";
    return;
  }

  const sceneMap = {};
  results.data.forEach(rowData => {
    const id = rowData.id?.trim().toLowerCase();
    if (!id || !rowData.text) {
      logDebug(`Scene row missing required fields: ${JSON.stringify(rowData)}`);
      return;
    }

    if (!sceneMap[id]) {
      sceneMap[id] = { text: rowData.text || '', choices: [] };
    }

    if (rowData["choice text"]) {
      sceneMap[id].choices.push({
        text: rowData["choice text"],
        next: rowData["next id"],
        item: rowData["item"] || undefined,
        requires: rowData["requires item"] || undefined,
        setFlag: rowData["flag"] || undefined,
        flagRequired: rowData["requires flag"] || undefined,
        hover: rowData["hover"] || undefined,
        hoverRequires: rowData["requires hover"] || undefined,
        modifyPhysical: rowData["modify physical"] || undefined,
        modifySocial: rowData["modify social"] || undefined,
        modifyArcane: rowData["modify arcane"] || undefined,
        requiresPhysical: rowData["requires physical"] || undefined,
        requiresSocial: rowData["requires social"] || undefined,
        requiresArcane: rowData["requires arcane"] || undefined
      });
    }
  });

  scenes = sceneMap;
  logDebug("Scenes CSV loaded.");
  showScene(currentSceneId, true);
}

// Save/load system
function saveGame() {
  localStorage.setItem("inventory", JSON.stringify(inventory));
  localStorage.setItem("flags", JSON.stringify(flags));
  localStorage.setItem("currentScene", currentSceneId);
  localStorage.setItem("stats", JSON.stringify(stats));
  alert("Game saved!");
}

function confirmReset() {
  popup.style.display = "flex";
}

function closePopup() {
  popup.style.display = "none";
}

function restartGame() {
  inventory = [];
  flags = {};
  stats = { physical: 1, social: 1, arcane: 1 };
  currentSceneId = "intro";
  localStorage.clear();
  popup.style.display = "none";
  showScene("intro", true);
}

// Toggle inventory/menu/stats panels with keys E, M, and S
document.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'e') {
    inventoryElement.style.display = inventoryElement.style.display === 'none' ? 'block' : 'none';
  }
  if (e.key.toLowerCase() === 'm') {
    menuElement.style.display = menuElement.style.display === 'none' ? 'block' : 'none';
  }
  if (e.key.toLowerCase() === 's') {
    statsElement.style.display = statsElement.style.display === 'none' ? 'block' : 'none';
    if (statsElement.style.display === 'block') {
      updateStatsDisplay();
    }
  }
});

// Toggle between local CSV and Google Sheets
const USE_LOCAL_CSV = false;

const SCENES_CSV_URL = USE_LOCAL_CSV
  ? "chosa.csv"
  : "https://docs.google.com/spreadsheets/d/e/2PACX-1vTDmMzN-23bHfCzDVv8YCLdmntaIFESfqgWiF-eaSNeOZJ3VkgbgHhFBPt4Ts2fSxBO3peXw2QupAz8/pub?gid=0&single=true&output=csv";

const ITEMS_CSV_URL = USE_LOCAL_CSV
  ? "items.csv"
  : "https://docs.google.com/spreadsheets/d/e/2PACX-1vTDmMzN-23bHfCzDVv8YCLdmntaIFESfqgWiF-eaSNeOZJ3VkgbgHhFBPt4Ts2fSxBO3peXw2QupAz8/pub?gid=1946448851&single=true&output=csv";

// Load items CSV first
fetch(ITEMS_CSV_URL)
  .then(res => {
    if (!res.ok) throw new Error(`Failed to load items CSV: ${res.statusText}`);
    return res.text();
  })
  .then(csv => {
    const results = Papa.parse(csv, { header: true, skipEmptyLines: true });
    if (results.errors.length) {
      results.errors.forEach(e => logDebug("Items CSV Error: " + e.message));
      return;
    }
    results.data.forEach(row => {
      if (row["item id"] && row.description) {
        itemDescriptions[row["item id"].trim().toLowerCase()] = row.description.trim();
      } else {
        logDebug(`Item missing ID or description: ${JSON.stringify(row)}`);
      }
    });
    logDebug("Items CSV loaded.");
  })
  .then(() => {
    return fetch(SCENES_CSV_URL);
  })
  .then(res => {
    if (!res.ok) throw new Error(`Failed to load scenes CSV: ${res.statusText}`);
    return res.text();
  })
  .then(csv => {
    loadScenesFromCSV(csv);
  })
  .catch(err => {
    logDebug("General Error: " + err.message);
    storyElement.innerHTML = "<p>Failed to load story or item data.</p>";
});



