const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'messages');
const locales = {
  'en-IN.json': {
    pinItem: "Pin {item}",
    unpinItem: "Unpin {item}"
  },
  'es.json': {
    pinItem: "Fijar {item}",
    unpinItem: "Desfijar {item}"
  },
  'hi.json': {
    pinItem: "{item} पिन करें",
    unpinItem: "{item} अनपिन करें"
  },
  'ar.json': {
    pinItem: "تثبيت {item}",
    unpinItem: "إلغاء تثبيت {item}"
  }
};

for (const [file, content] of Object.entries(locales)) {
  const filePath = path.join(dir, file);
  if (fs.existsSync(filePath)) {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // Patch Sidebar
    if (!data.Sidebar) data.Sidebar = {};
    data.Sidebar.pinItem = content.pinItem;
    data.Sidebar.unpinItem = content.unpinItem;
    
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`Updated ${file}`);
  } else {
    console.log(`File not found: ${filePath}`);
  }
}
