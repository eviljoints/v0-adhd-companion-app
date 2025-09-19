// printRepo.js
// Recursively prints the directory tree and file contents

const fs = require("fs");
const path = require("path");

function printTree(dir, prefix = "") {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  entries.forEach((entry, i) => {
    const isLast = i === entries.length - 1;
    const pointer = isLast ? "└── " : "├── ";
    const filePath = path.join(dir, entry.name);

    console.log(prefix + pointer + entry.name);

    if (entry.isDirectory()) {
      printTree(filePath, prefix + (isLast ? "    " : "│   "));
    } else {
      try {
        const content = fs.readFileSync(filePath, "utf8");
        const preview =
          content.length > 500 ? content.slice(0, 500) + "\n...[truncated]..." : content;
        console.log(prefix + (isLast ? "    " : "│   ") + "   " + preview.replace(/\n/g, "\n" + prefix + (isLast ? "    " : "│   ") + "   "));
      } catch (err) {
        console.error("Error reading file:", filePath, err.message);
      }
    }
  });
}

const startDir = process.argv[2] || ".";
console.log("📂 Project Tree from:", path.resolve(startDir));
printTree(startDir);
