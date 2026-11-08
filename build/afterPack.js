// Ad-hoc signs the Mac app when no Apple Developer ID certificate is configured.
// Without any signature, macOS on Apple Silicon reports the app as "damaged".
// When a real certificate is set (CSC_LINK), electron-builder signs it properly instead.
const { execFileSync } = require("child_process");
const path = require("path");

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;
  if (process.env.CSC_LINK) return; // real signing will happen after this step
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  console.log(`  • ad-hoc signing ${app}`);
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", app], { stdio: "inherit" });
  execFileSync("codesign", ["--verify", "--deep", "--strict", app], { stdio: "inherit" });
};
