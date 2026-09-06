const { execFileSync } = require('child_process')
const path = require('path')
const fs = require('fs')

// electron-builder's mac build, without a real Apple Developer ID, leaves the
// downloaded Electron binary's original (and often invalid/unsealed) ad-hoc
// signature in place instead of re-signing the finished app bundle. That
// mismatched signature is exactly what makes Gatekeeper refuse to open the
// app ("is damaged and can't be opened") once it's copied/installed on
// another machine. Re-signing fresh here regenerates a valid seal that
// matches the app's actual final contents.
module.exports = async function afterSign(context) {
  if (context.electronPlatformName !== 'darwin') return

  const appName = context.packager.appInfo.productFilename
  const appPath = path.join(context.appOutDir, `${appName}.app`)

  if (!fs.existsSync(appPath)) return

  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath])
}
