// Expo config plugin — apple-targets'ın oluşturduğu widget extension
// Info.plist'lerine üç şey enjekte eder:
//   1. CFBundleShortVersionString (host ile sync)
//   2. CFBundleVersion (host ile sync — Apple zorunlu kılıyor)
//   3. NSAppTransportSecurity.NSAllowsArbitraryLoads (host'un ATS muafiyeti
//      ekstensiyona otomatik geçmiyor; App Intent backend POST'ları HTTPS
//      olmayan endpoint'lerde "policy denied" exception atıyordu).
//
// Plugin ordering: app.config.ts'de @bacons/apple-targets'tan SONRA gelmeli
// ki extension Info.plist'leri zaten yazılmış olsun.

const fs = require("fs");
const path = require("path");
const { withDangerousMod } = require("@expo/config-plugins");

const SHORT_RE =
  /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]*)<\/string>/;
const BUILD_RE = /<key>CFBundleVersion<\/key>\s*<string>([^<]*)<\/string>/;
const ATS_BLOCK_RE = /<key>NSAppTransportSecurity<\/key>\s*<dict>[\s\S]*?<\/dict>/;

function readMainPlist(projectRoot, mainName) {
  const candidate = path.join(projectRoot, "ios", mainName, "Info.plist");
  if (fs.existsSync(candidate)) {
    return fs.readFileSync(candidate, "utf8");
  }
  return null;
}

function setPlistValue(plist, regex, key, value) {
  if (regex.test(plist)) {
    return plist.replace(regex, `<key>${key}</key>\n\t<string>${value}</string>`);
  }
  return plist;
}

/**
 * Extension Info.plist'ine NSAppTransportSecurity (NSAllowsArbitraryLoads
 * = true) bloğunu enjekte eder. Zaten varsa NSAllowsArbitraryLoads'u true'a
 * çevirir; yoksa <plist><dict>...</dict></plist> kapanışından önce ekler.
 */
function injectATS(plist) {
  const atsBlock =
    "\t<key>NSAppTransportSecurity</key>\n" +
    "\t<dict>\n" +
    "\t\t<key>NSAllowsArbitraryLoads</key>\n" +
    "\t\t<true/>\n" +
    "\t</dict>";

  if (ATS_BLOCK_RE.test(plist)) {
    return plist.replace(ATS_BLOCK_RE, atsBlock.replace(/^\t/gm, ""));
  }
  // </dict>\n</plist> sonu — ondan önce ekle.
  return plist.replace(/<\/dict>\s*<\/plist>\s*$/, `${atsBlock}\n</dict>\n</plist>\n`);
}

const withSyncedExtensionVersions = (config) =>
  withDangerousMod(config, [
    "ios",
    async (mod) => {
      const projectRoot = mod.modRequest.projectRoot;
      const targetsDir = path.join(projectRoot, "targets");

      if (!fs.existsSync(targetsDir)) {
        return mod;
      }

      let version = String(mod.version || "1.0.0");
      let buildNumber = String(mod.ios?.buildNumber || "1");

      const mainPlist = readMainPlist(projectRoot, mod.name);
      if (mainPlist) {
        const sv = (mainPlist.match(SHORT_RE) || [])[1];
        const bv = (mainPlist.match(BUILD_RE) || [])[1];
        if (sv) version = sv;
        if (bv) buildNumber = bv;
      }

      for (const name of fs.readdirSync(targetsDir)) {
        const plistPath = path.join(targetsDir, name, "Info.plist");
        if (!fs.existsSync(plistPath)) continue;

        let p = fs.readFileSync(plistPath, "utf8");
        p = setPlistValue(p, SHORT_RE, "CFBundleShortVersionString", version);
        p = setPlistValue(p, BUILD_RE, "CFBundleVersion", buildNumber);
        p = injectATS(p);
        fs.writeFileSync(plistPath, p);
        console.log(
          `[petto-sync-extension] ${name}: ${version} (${buildNumber}) + ATS arbitrary loads`
        );
      }

      return mod;
    },
  ]);

module.exports = withSyncedExtensionVersions;
