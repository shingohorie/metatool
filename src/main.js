'use strict';

const { app, ipcMain, BrowserWindow, dialog, Menu, Tray, shell } = require('electron');
const openAboutWindow = require('about-window').default;
const path = require('path');
const MetaEngine = require('./metaEngine');

let browserWindow, targetDirectory, configPath, tray;

const createWindow = () => {
	tray = new Tray(path.resolve(__dirname, '../assets/tray/icon.png'));
	const contextMenu = Menu.buildFromTemplate([
		{ label: '終了', role: 'quit' }
	]);
	tray.setContextMenu(contextMenu);

	const appMenu = Menu.buildFromTemplate([
		{
			label: app.getName(),
			submenu: [
				{
					label: 'Metatoolについて',
					click: function () {
						openAboutWindow({
							icon_path: path.resolve(__dirname, '../assets/logo.png'),
							copyright: 'Copyright (c) Rainbow Japan.'
						})
					}
				},
				{ label: 'ウィンドウを閉じる', role: 'close' }
			]
		},
		{
			label: "操作",
			submenu: [
				{ label: "テキストをコピー", accelerator: "CmdOrCtrl+C", selector: "copy:" },
			]
		}
	]);
	Menu.setApplicationMenu(appMenu);

	browserWindow = new BrowserWindow({
		webPreferences: {
			nodeIntegration: false, //ここはfalseのまま
			contextIsolation: false,  //これをfalseに
			preload: `${__dirname}/preload.js`
		}
	});

	if(process.env.NODE_ENV === 'development') browserWindow.webContents.openDevTools({ mode: 'detach' });
	browserWindow.loadURL(`file://${__dirname}/browser.html`);

	browserWindow.webContents.on('new-window', (event, url) => {
		event.preventDefault();
		console.log(url)
		shell.openExternal(url)
	});

	browserWindow.on('close', (e) => {
		if (browserWindow) {
			e.preventDefault();
			browserWindow.hide();
		}
	});

	ipcMain.on('openDirectory', (e) => {
		dialog.showOpenDialog(browserWindow, {
			title: '対象ディレクトリを選択',
			defalutPath: `${require('os').homedir()}`,
			properties: ['openDirectory']
		}).then((result) => {
			let directories = result.filePaths;
			if (directories.length) {
				directories.forEach((directory) => {
					targetDirectory = directory;
					browserWindow.webContents.send('openDirectory', targetDirectory);
				});
			}
		}).catch((err) => {
			console.log(err)
		})
	});

	ipcMain.on('openConfig', (e) => {
		dialog.showOpenDialog(browserWindow, {
			title: '設定ファイルを選択',
			defalutPath: `${require('os').homedir()}`,
			properties: ['openFile'],
			filters: [
			  { name: 'TSV', extensions: ['tsv']}
			]
		}).then((result) => {
			let paths = result.filePaths;
			if (paths.length) {
				configPath = paths[0];
				browserWindow.webContents.send('openConfig', paths[0]);
			}
		}).catch((err) => {
			console.log(err)
		})
	});

	ipcMain.on('exec', (e) => {
		const metatool = new MetaEngine(configPath, targetDirectory);
		metatool.exec().then((res) => {
			browserWindow.webContents.send('log', res);
		})
	});
}

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', (e) => {
	browserWindow = null;
});

app.on('activate', () => {
	browserWindow.show();
});

app.on('ready', () => {
	createWindow();
});
