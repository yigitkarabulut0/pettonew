// Expo config plugin — apple-targets'ın oluşturduğu widget extension
// Info.plist'lerinin CFBundleShortVersionString + CFBundleVersion alanlarını
// ana app'in (host) Info.plist'inden otomatik kopyalar.
//
// Apple, app extension'larının bu iki alanını host ile birebir aynı olmasını
// zorunlu kılıyor. EAS Build `appVersionSource: "remote"` ile her production
// build'de host'u otomatik artırdığı için manuel sync sürdürülemez.
//
// Çalışma sırası:
//   1. `@bacons/apple-targets` plugin'i targets/<name>/Info.plist üretir
//   2. Expo prebuild ana app'in ios/<AppName>/Info.plist'ini yazar (EAS bu
//      noktada remote build number'ı zaten enjekte etmiş olur)
//   3. Bu plugin ana plist'i okuyup tüm extension plist'lerine yazar
//
// Plugin ordering app.config.ts'de @bacons/apple-targets'tan SONRA gelmeli.

const fs = require("fs");
const path = require("path");
const { withDangerousMod } = require("@expo/config-plugins");

const SHORT_RE =
  /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]*)<\/string>/;
const BUILD_RE = /<key>CFBundleVersion<\/key>\s*<string>([^<]*)<\/string>/;

function readMainPlist(projectRoot, mainName) {
  // mainName "Fetcht" → ios/Fetcht/Info.plist
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

const withSyncedExtensionVersions = (config) =>
  withDangerousMod(config, [
    "ios",
    async (mod) => {
      const projectRoot = mod.modRequest.projectRoot;
      const targetsDir = path.join(projectRoot, "targets");

      if (!fs.existsSync(targetsDir)) {
        return mod;
      }

      // 1) Source of truth: host app's Info.plist. By the time this
      //    DangerousMod runs, EAS / Expo have written the final values.
      let version = String(mod.version || "1.0.0");
      let buildNumber = String(mod.ios?.buildNumber || "1");

      const mainPlist = readMainPlist(projectRoot, mod.name);
      if (mainPlist) {
        const sv = (mainPlist.match(SHORT_RE) || [])[1];
        const bv = (mainPlist.match(BUILD_RE) || [])[1];
        if (sv) version = sv;
        if (bv) buildNumber = bv;
      }

      // 2) Walk every target dir and rewrite its Info.plist.
      for (const name of fs.readdirSync(targetsDir)) {
        const plistPath = path.join(targetsDir, name, "Info.plist");
        if (!fs.existsSync(plistPath)) continue;

        let p = fs.readFileSync(plistPath, "utf8");
        p = setPlistValue(p, SHORT_RE, "CFBundleShortVersionString", version);
        p = setPlistValue(p, BUILD_RE, "CFBundleVersion", buildNumber);
        fs.writeFileSync(plistPath, p);
        console.log(
          `[petto-sync-extension-versions] ${name}: ${version} (${buildNumber})`
        );
      }

      return mod;
    },
  ]);

module.exports = withSyncedExtensionVersions;
