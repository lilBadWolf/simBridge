const { MakerZIP } = require("@electron-forge/maker-zip");
const { MakerDeb } = require("@electron-forge/maker-deb");
const { VitePlugin } = require("@electron-forge/plugin-vite");

module.exports = {
  packagerConfig: {
    asar: true,
    executableName: "simBridge",
    icon: "build/icon",
    appCopyright: "Copyright (c) The Company of Wolves",
    win32metadata: {
      CompanyName: "The Company of Wolves",
      FileDescription: "simBridge",
      OriginalFilename: "simBridge.exe",
      ProductName: "simBridge",
      InternalName: "simBridge"
    }
  },
  rebuildConfig: {},
  makers: [
    {
      name: "@felixrieseberg/electron-forge-maker-nsis",
      platforms: ["win32"],
      config: {
        getAdditionalConfig: () => ({
          oneClick: false,
          perMachine: true,
          allowToChangeInstallationDirectory: true,
          installerIcon: "build/icon.ico",
          uninstallerIcon: "build/icon.ico",
          installerHeaderIcon: "build/icon.ico",
          artifactName: "${productName}Setup-${version}-${arch}.${ext}"
        })
      }
    },
    new MakerZIP({}, ["win32"]),
    new MakerZIP({}, ["linux"]),
    new MakerDeb(
      {
        options: {
          maintainer: "The Company of Wolves",
          homepage: "https://thecompanyofwolves.com"
        }
      },
      ["linux"]
    )
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: "src/main/main.ts",
          config: "vite.main.config.ts",
          target: "main"
        },
        {
          entry: "src/main/preload.ts",
          config: "vite.preload.config.ts",
          target: "preload"
        }
      ],
      renderer: [
        {
          name: "main_window",
          config: "vite.renderer.config.ts"
        }
      ]
    })
  ]
};
