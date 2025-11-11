const fs = require('fs');
const path = require('path');
const extensions = [".jsx", ".css", ".js", '.json'];
const excludedDirs = new Set(["node_modules", "db", ".idea", "docker", "logs", "simulation", 'certificates', 'sessions','sessions']);
const excludedFiles = new Set(['codeToTxt.js', 'index.html', 'package-lock.json', 'README.md', 'projectStructure.js', 'eslint.config.js']);
const outputFile = "all_code.txt";

function walkDir(directory, processFile) {
    if (!directory || typeof directory !== 'string') {
        throw new Error('Directory path must be a non-empty string');
    }
    if (typeof processFile !== 'function') {
        throw new Error('Callback must be a function');
    }

    // Process directory contents
    fs.readdirSync(directory).forEach(entry => {
        const fullPath = path.join(directory, entry);

        if (shouldSkipFile(entry)) {
            return;
        }

        if (isValidDirectory(fullPath, entry)) {
            walkDir(fullPath, processFile);
            return;
        }

        if (isValidFile(entry)) {
            processFile(fullPath);
        }
    });
}

function shouldSkipFile(filename) {
    return excludedFiles.has(filename);
}

function isValidDirectory(fullPath, dirname) {
    return fs.statSync(fullPath).isDirectory() && !excludedDirs.has(dirname);
}

function isValidFile(filename) {
    return extensions.some(ext => filename.endsWith(ext));
}

const outputStream = fs.createWriteStream(outputFile, { encoding: 'utf-8' });

walkDir('..', (filePath) => {
    const content = fs.readFileSync(filePath, { encoding: 'utf-8', flag: 'r' });
    outputStream.write(`===== ${filePath} =====\n`);
    outputStream.write(content + '\n\n');
});

outputStream.end();
console.log(`Code copied to ${outputFile}, excluding ${[...excludedDirs].join(', ')}`);