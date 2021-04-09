'use strict';

const ipcRenderer = window.ipcRenderer;

new Vue({
	el: "#app",
	data: {
		targetDirectory: '',
		configFile: '',
		log: '対象ディレクトリと設定ファイルを選択して、実行ボタンを押してください',
		isHowtoOpen: false
	},
	created: function () {
		let scope = this;

		ipcRenderer.on('openDirectory', (e, path) => {
			console.log(path)
			scope.targetDirectory = path;
		});
		ipcRenderer.on('openConfig', (e, path) => {
			scope.configFile = path;
		});
		ipcRenderer.on('log', (e, log) => {
			scope.log = log;
		});
	},
	methods: {
		openDirectory: () => {
			let scope = this;
			ipcRenderer.send('openDirectory');
		},
		openConfig: () => {
			let scope = this;
			ipcRenderer.send('openConfig');
		},
		exec: () => {
			let scope = this;
			if (scope.targetDirectory === '' || scope.configFile === '') {
				alert("対象ディレクトリと設定ファイルを指定してください");
				return;
			}
			if (confirm("よろしいですか？")) ipcRenderer.send('exec');

		},
		openHowto: () => {
			let scope = this;
			scope.isHowtoOpen = true;
		},
		closeHowto: () => {
			let scope = this;
			scope.isHowtoOpen = false;
		}
	}
})
