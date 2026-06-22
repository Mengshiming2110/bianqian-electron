const path = require('node:path')
const { rcedit } = require('rcedit')

const PRODUCT_NAME = '领益工作助手'
const COMPANY_NAME = 'Lingyi'

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return

  const exePath = path.join(context.appOutDir, `${PRODUCT_NAME}.exe`)
  const iconPath = path.join(context.packager.projectDir, 'resources', 'icon.ico')

  await rcedit(exePath, {
    icon: iconPath,
    'version-string': {
      CompanyName: COMPANY_NAME,
      FileDescription: PRODUCT_NAME,
      ProductName: PRODUCT_NAME,
      InternalName: PRODUCT_NAME,
      OriginalFilename: `${PRODUCT_NAME}.exe`
    }
  })
}
