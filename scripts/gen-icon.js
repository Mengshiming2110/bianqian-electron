const { app, nativeImage } = require('electron')
const fs = require('fs')
const path = require('path')

app.whenReady().then(() => {
  const svg256 = fs.readFileSync(path.join(__dirname, '..', 'resources', 'icon.svg'), 'utf8')
  const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg256)
  const img = nativeImage.createFromDataURL(dataUrl)
  console.log('isEmpty:', img.isEmpty(), 'size:', img.getSize())

  if (!img.isEmpty()) {
    const png = img.toPNG()
    fs.writeFileSync(path.join(__dirname, '..', 'resources', 'icon.png'), png)
    console.log('icon.png written, size:', png.length)

    // 32x32 and 16x16 for tray
    const png32 = img.resize({ width: 32, height: 32 }).toPNG()
    fs.writeFileSync(path.join(__dirname, '..', 'resources', 'tray-icon.png'), png32)
    console.log('tray-icon.png (32x32) written, size:', png32.length)

    const png16 = img.resize({ width: 16, height: 16 }).toPNG()
    fs.writeFileSync(path.join(__dirname, '..', 'resources', 'tray-icon-16.png'), png16)
    console.log('tray-icon-16.png written, size:', png16.length)
  }

  app.quit()
})
