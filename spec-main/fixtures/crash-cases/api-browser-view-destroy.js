const {app, BrowserWindow, BrowserView} = require('electron');
const { expect } = require('chai');

function createWindow () {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true
    },
  })
  const view = new BrowserView();
  mainWindow.addBrowserView(view);
  view.webContents.destroy()
  view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
  const bounds = view.getBounds()
  expect(bounds).to.deep.equal({ x: 0, y: 0, width: 0, height: 0 })
  view.setBackgroundColor(1)
}

app.on('ready', createWindow)

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', function () {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
