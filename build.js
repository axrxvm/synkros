// build.js for creating production build to upload.
const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");
const buildDir = path.join(__dirname, "build");
if (fs.existsSync(buildDir)) {
  fs.rmSync(buildDir, { recursive: true, force: true });
}
fs.mkdirSync(buildDir, { recursive: true });
console.log("🧹 Build folder cleaned");
async function bundleApp() {
  try {
    await esbuild.build({
      entryPoints: ["server.js"],
      bundle: true,
      platform: "node",
      target: "node18",
      outfile: path.join(buildDir, "app.js"),
      minify: true,
      external: ["multer", "ejs", "fs", "path", "crypto", "winston", "nodemailer"],
      loader: { ".json": "json" }
    });
    console.log("✔ Esbuild bundling complete");
  } catch (err) {
    console.error("❌ Build failed:", err);
    process.exit(1);
  }
}
const foldersToCopy = ["views", "public", "uploads", "config", "data"];

function copyFolder(src, dest) {
  if (!fs.existsSync(src)) return;

  fs.mkdirSync(dest, { recursive: true });
  for (const item of fs.readdirSync(src)) {
    const srcPath = path.join(src, item);
    const destPath = path.join(dest, item);

    if (fs.lstatSync(srcPath).isDirectory()) {
      copyFolder(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function copyFolders() {
  console.log("📁 Copying folders...");
  foldersToCopy.forEach(folder => {
    const src = path.join(__dirname, folder);
    const dest = path.join(buildDir, folder);
    if (fs.existsSync(src)) {
      copyFolder(src, dest);
      console.log(`✔ Copied ${folder}/`);
    }
  });
}
const filesToCopy = [".env", "package-lock.json"]; // exxxclude package.json

function copyFiles() {
  filesToCopy.forEach(file => {
    const src = path.join(__dirname, file);
    const dest = path.join(buildDir, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      console.log(`✔ Copied ${file}`);
    }
  });
}
function createProdPackageJson() {
  const originalPkgPath = path.join(__dirname, "package.json");
  const buildPkgPath = path.join(buildDir, "package.json");

  if (fs.existsSync(originalPkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(originalPkgPath, "utf-8"));

    // Update main entry to the bundled file
    pkg.main = "app.js";

    // Update scripts for production
    pkg.scripts = {
      start: "node app.js"
    };

    // Remove devDependencies
    delete pkg.devDependencies;

    fs.writeFileSync(buildPkgPath, JSON.stringify(pkg, null, 2), "utf-8");
    console.log("✔ Production package.json created");
  }
}
(async () => {
  await bundleApp();
  copyFolders();
  copyFiles();
  createProdPackageJson();

  console.log("\n🎉 Build completed! The final production folder is:");
  console.log("➡  ./build\n");
})();
